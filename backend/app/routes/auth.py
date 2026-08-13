"""
Custom Telegram Authentication Routes
- POST /api/auth/send-code  → Check username + Send OTP to Telegram DM
- POST /api/auth/register   → Verify OTP + Create account (bcrypt)
- POST /api/auth/login      → Username + Password login
- GET  /api/auth/me         → Get current user from JWT
"""

import random
import string
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, field_validator

from app.config import settings
from app.supabase_client import supabase_admin, decode_jwt_token
from app.telegram_client import otp_telegram_service
from app.system_config import is_signup_enabled, get_default_storage_limit

router = APIRouter(prefix="/api/auth", tags=["Auth"])

# ─── In-memory OTP Store ────────────────────────────────────────────────
# Structure: { "username": { "code": "123456", "expires_at": datetime, "created_at": datetime } }
otp_store = {}

JWT_EXPIRY_HOURS = 72  # Token valid for 3 days


# ─── Pydantic Schemas ───────────────────────────────────────────────────

class SendCodeSchema(BaseModel):
    telegram_username: str

    @field_validator("telegram_username")
    @classmethod
    def clean_username(cls, v):
        v = v.strip().lstrip("@")
        if not v:
            raise ValueError("Telegram username cannot be empty.")
        if len(v) < 3:
            raise ValueError("Telegram username must be at least 3 characters.")
        return v.lower()


class RegisterSchema(BaseModel):
    telegram_username: str
    password: str
    otp_code: str

    @field_validator("telegram_username")
    @classmethod
    def clean_username(cls, v):
        v = v.strip().lstrip("@")
        if not v:
            raise ValueError("Telegram username cannot be empty.")
        return v.lower()

    @field_validator("password")
    @classmethod
    def validate_password(cls, v):
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters.")
        return v

    @field_validator("otp_code")
    @classmethod
    def validate_otp(cls, v):
        v = v.strip()
        if not v or len(v) != 6:
            raise ValueError("OTP code must be 6 digits.")
        return v


class LoginSchema(BaseModel):
    telegram_username: str
    password: str

    @field_validator("telegram_username")
    @classmethod
    def clean_username(cls, v):
        v = v.strip().lstrip("@")
        if not v:
            raise ValueError("Telegram username cannot be empty.")
        return v.lower()


class ForgotPasswordRequestSchema(BaseModel):
    telegram_username: str

    @field_validator("telegram_username")
    @classmethod
    def clean_username(cls, v):
        v = v.strip().lstrip("@")
        if not v:
            raise ValueError("Telegram username cannot be empty.")
        return v.lower()


class ForgotPasswordResetSchema(BaseModel):
    telegram_username: str
    otp_code: str
    new_password: str

    @field_validator("telegram_username")
    @classmethod
    def clean_username(cls, v):
        v = v.strip().lstrip("@")
        if not v:
            raise ValueError("Telegram username cannot be empty.")
        return v.lower()

    @field_validator("otp_code")
    @classmethod
    def validate_otp(cls, v):
        v = v.strip()
        if not v or len(v) != 6:
            raise ValueError("OTP code must be 6 digits.")
        return v

    @field_validator("new_password")
    @classmethod
    def validate_password(cls, v):
        if len(v) < 6:
            raise ValueError("New password must be at least 6 characters.")
        return v


# ─── Helper Functions ───────────────────────────────────────────────────

def generate_otp(length: int = 6) -> str:
    """Generate a random numeric OTP code."""
    return "".join(random.choices(string.digits, k=length))


def create_jwt_token(user_id: str, telegram_username: str) -> str:
    """Create a signed JWT token for a verified user."""
    payload = {
        "user_id": user_id,
        "telegram_username": telegram_username,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS),
        "iat": datetime.now(timezone.utc)
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm="HS256")


# ─── Routes ─────────────────────────────────────────────────────────────

@router.post("/send-code")
async def send_code(payload: SendCodeSchema):
    """
    1. Guard: Check if signups are currently enabled by admin.
    2. Strict Guard: Check if username already registered in DB.
    3. Rate limit: Check if code requested in last 60s.
    4. Generate OTP and send via dedicated OTP Telegram Bot.
    """
    if not is_signup_enabled():
        raise HTTPException(
            status_code=403,
            detail="New user registrations are currently closed by the administrator. Please try again later."
        )

    username = payload.telegram_username

    # 1. Strict Unique Username Guard
    existing_user = supabase_admin.table("users").select("id").eq("telegram_username", username).execute()
    if existing_user.data:
        raise HTTPException(
            status_code=400,
            detail="This Telegram username is already registered! Please log in."
        )

    # 2. Rate limit: Don't allow re-sending within 60 seconds
    existing_otp = otp_store.get(username)
    if existing_otp:
        created_at = existing_otp.get("created_at", datetime.min.replace(tzinfo=timezone.utc))
        time_since = (datetime.now(timezone.utc) - created_at).total_seconds()
        if time_since < 60:
            remaining = int(60 - time_since)
            raise HTTPException(
                status_code=429,
                detail=f"Please wait {remaining} seconds before requesting a new code."
            )

    otp_code = generate_otp()
    otp_store[username] = {
        "code": otp_code,
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=5),
        "created_at": datetime.now(timezone.utc)
    }

    try:
        await otp_telegram_service.send_otp_message(username, otp_code)
    except Exception as e:
        otp_store.pop(username, None)
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "message": f"Verification code sent to @{username} via Telegram.",
        "expires_in_seconds": 300
    }


@router.post("/register")
async def register(payload: RegisterSchema):
    """
    1. Guard: Check if signups are currently enabled by admin.
    2. Verify OTP matching & expiration.
    3. Check strict duplicate username.
    4. Hash password using native bcrypt.
    5. Save user record in DB and return JWT token.
    """
    if not is_signup_enabled():
        raise HTTPException(
            status_code=403,
            detail="New user registrations are currently closed by the administrator. Please try again later."
        )

    username = payload.telegram_username

    # 1. Verify OTP matching
    stored_otp = otp_store.get(username)
    if not stored_otp:
        raise HTTPException(
            status_code=400,
            detail="No verification code found. Please request a new code."
        )

    if datetime.now(timezone.utc) > stored_otp["expires_at"]:
        otp_store.pop(username, None)
        raise HTTPException(
            status_code=400,
            detail="OTP has expired. Please resend a new code."
        )

    if stored_otp["code"] != payload.otp_code:
        raise HTTPException(
            status_code=400,
            detail="Invalid verification code! Please check again."
        )

    # 2. Strict Unique Username Guard
    existing_user = supabase_admin.table("users").select("id").eq("telegram_username", username).execute()
    if existing_user.data:
        otp_store.pop(username, None)
        raise HTTPException(
            status_code=400,
            detail="This Telegram username is already registered! Please log in."
        )

    # 3. Hash password with native bcrypt (safe, no passlib bugs)
    password_bytes = payload.password.encode("utf-8")
    salt = bcrypt.gensalt()
    password_hash = bcrypt.hashpw(password_bytes, salt).decode("utf-8")

    user_data = {
        "telegram_username": username,
        "password_hash": password_hash,
        "is_banned": False,
        "storage_limit": get_default_storage_limit(),
        "used_storage": 0,
        "last_login_at": datetime.now(timezone.utc).isoformat()
    }

    # 4. Insert into database
    res = supabase_admin.table("users").insert(user_data).execute()
    if not res.data:
        print(f"Failed DB insert for user @{username}")
        raise HTTPException(status_code=500, detail="Failed to create user account in database.")

    new_user = res.data[0]

    # 5. Clean up OTP store
    otp_store.pop(username, None)

    # 6. Return JWT Token & User Profile
    token = create_jwt_token(new_user["id"], username)

    print(f"✅ Successfully registered user @{username} ({new_user['id']})")

    return {
        "token": token,
        "user": {
            "id": new_user["id"],
            "telegram_username": username
        }
    }


@router.post("/login")
async def login(payload: LoginSchema):
    """
    Verify username + password using native bcrypt, return JWT token.
    """
    username = payload.telegram_username

    # 1. Find user by telegram_username
    res = supabase_admin.table("users").select("*").eq("telegram_username", username).execute()
    if not res.data:
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    user = res.data[0]

    # 2. Check if user is banned
    if user.get("is_banned"):
        raise HTTPException(status_code=403, detail="Your account has been suspended by the administrator.")

    # 3. Verify password with native bcrypt
    password_bytes = payload.password.encode("utf-8")
    stored_hash_bytes = user["password_hash"].encode("utf-8")

    try:
        password_matches = bcrypt.checkpw(password_bytes, stored_hash_bytes)
    except Exception as err:
        print(f"Bcrypt verification error: {err}")
        password_matches = False

    if not password_matches:
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    # 4. Update last_login_at
    try:
        supabase_admin.table("users").update({
            "last_login_at": datetime.now(timezone.utc).isoformat()
        }).eq("id", user["id"]).execute()
    except Exception:
        pass

    # 5. Generate JWT token
    token = create_jwt_token(user["id"], username)

    return {
        "token": token,
        "user": {
            "id": user["id"],
            "telegram_username": username
        }
    }


@router.post("/forgot-password/request-otp")
async def forgot_password_request_otp(payload: ForgotPasswordRequestSchema):
    """
    1. Check if username exists in DB. If not, return 404.
    2. Rate limit: Check if code requested in last 60s.
    3. Generate 6-digit OTP and send via Telegram OTP Bot.
    """
    username = payload.telegram_username

    # 1. Verify user exists in DB
    existing_user = supabase_admin.table("users").select("id").eq("telegram_username", username).execute()
    if not existing_user.data:
        raise HTTPException(
            status_code=404,
            detail="No account found with this Telegram username."
        )

    # 2. Rate limit check (60 seconds)
    reset_key = f"reset_{username}"
    existing_otp = otp_store.get(reset_key)
    if existing_otp:
        created_at = existing_otp.get("created_at", datetime.min.replace(tzinfo=timezone.utc))
        time_since = (datetime.now(timezone.utc) - created_at).total_seconds()
        if time_since < 60:
            remaining = int(60 - time_since)
            raise HTTPException(
                status_code=429,
                detail=f"Please wait {remaining} seconds before requesting a new reset code."
            )

    otp_code = generate_otp()
    otp_store[reset_key] = {
        "code": otp_code,
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=5),
        "created_at": datetime.now(timezone.utc)
    }

    try:
        await otp_telegram_service.send_otp_message(username, otp_code)
    except Exception as e:
        otp_store.pop(reset_key, None)
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "message": f"Password reset code sent to @{username} via Telegram.",
        "expires_in_seconds": 300
    }


@router.post("/forgot-password/reset")
async def forgot_password_reset(payload: ForgotPasswordResetSchema):
    """
    1. Verify OTP matching & expiration.
    2. Check user exists in DB.
    3. Hash new password with bcrypt.
    4. Update password_hash in DB.
    5. Clean up OTP store.
    """
    username = payload.telegram_username
    reset_key = f"reset_{username}"

    # 1. Verify OTP matching
    stored_otp = otp_store.get(reset_key)
    if not stored_otp:
        raise HTTPException(
            status_code=400,
            detail="No reset verification code found. Please request a code first."
        )

    if datetime.now(timezone.utc) > stored_otp["expires_at"]:
        otp_store.pop(reset_key, None)
        raise HTTPException(
            status_code=400,
            detail="Reset verification code has expired. Please request a new code."
        )

    if stored_otp["code"] != payload.otp_code:
        raise HTTPException(
            status_code=400,
            detail="Invalid verification code! Please check again."
        )

    # 2. Check user exists
    existing_user = supabase_admin.table("users").select("id").eq("telegram_username", username).execute()
    if not existing_user.data:
        otp_store.pop(reset_key, None)
        raise HTTPException(status_code=404, detail="User account not found.")

    user_id = existing_user.data[0]["id"]

    # 3. Hash new password with bcrypt
    password_bytes = payload.new_password.encode("utf-8")
    salt = bcrypt.gensalt()
    password_hash = bcrypt.hashpw(password_bytes, salt).decode("utf-8")

    # 4. Update user password in DB
    res = supabase_admin.table("users").update({
        "password_hash": password_hash
    }).eq("id", user_id).execute()

    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to update password in database.")

    # 5. Clean up OTP store
    otp_store.pop(reset_key, None)

    print(f"🔑 Password reset successfully for user @{username}")

    return {
        "message": "Password reset successfully! Please sign in with your new password."
    }


@router.get("/me")
async def get_me(authorization: Optional[str] = Header(None)):
    """
    Decode JWT token and return current user info.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")

    token = authorization.split(" ")[1]
    payload = decode_jwt_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")

    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload.")

    # Fetch fresh user data from DB
    res = supabase_admin.table("users").select("*").eq("id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=401, detail="User not found.")

    user = res.data[0]

    if user.get("is_banned"):
        raise HTTPException(status_code=403, detail="Your account has been suspended by the administrator.")

    return {
        "id": user["id"],
        "telegram_username": user["telegram_username"],
        "storage_limit": user.get("storage_limit", 32212254720),
        "used_storage": user.get("used_storage", 0),
        "created_at": user.get("created_at")
    }


class DeleteAccountOtpRequestSchema(BaseModel):
    password: str
    confirmation_phrase: str


class DeleteAccountConfirmSchema(BaseModel):
    password: str
    confirmation_phrase: str
    otp_code: str

    @field_validator("otp_code")
    @classmethod
    def validate_otp(cls, v):
        v = v.strip()
        if not v or len(v) != 6:
            raise ValueError("OTP code must be 6 digits.")
        return v


@router.get("/signup-status")
def get_signup_status():
    """Returns current signup availability status and default storage quota."""
    return {
        "signup_enabled": is_signup_enabled(),
        "default_storage_limit": get_default_storage_limit()
    }


@router.post("/delete-account/request-otp")
async def delete_account_request_otp(
    payload: DeleteAccountOtpRequestSchema,
    authorization: Optional[str] = Header(None)
):
    """
    Step 1 & 2 Validation: Verify password + confirmation phrase, then send Telegram OTP code.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")

    token = authorization.split(" ")[1]
    jwt_payload = decode_jwt_token(token)
    if not jwt_payload or not jwt_payload.get("user_id"):
        raise HTTPException(status_code=401, detail="Invalid or expired token.")

    user_id = jwt_payload["user_id"]

    # 1. Fetch user record
    res = supabase_admin.table("users").select("*").eq("id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="User account not found.")

    user = res.data[0]
    username = user["telegram_username"]

    # 2. Verify password with bcrypt
    password_bytes = payload.password.encode("utf-8")
    stored_hash_bytes = user["password_hash"].encode("utf-8")

    try:
        password_matches = bcrypt.checkpw(password_bytes, stored_hash_bytes)
    except Exception as err:
        print(f"Bcrypt verification error during account deletion: {err}")
        password_matches = False

    if not password_matches:
        raise HTTPException(status_code=400, detail="Incorrect password. Account deletion aborted.")

    # 3. Verify confirmation phrase
    EXPECTED_PHRASE = "I am sure I want to delete my account"
    if payload.confirmation_phrase.strip() != EXPECTED_PHRASE:
        raise HTTPException(
            status_code=400,
            detail=f'Confirmation phrase mismatch! You must type exactly "{EXPECTED_PHRASE}".'
        )

    # 4. Rate limit check for OTP request (60s)
    del_otp_key = f"del_{username}"
    existing_otp = otp_store.get(del_otp_key)
    if existing_otp:
        created_at = existing_otp.get("created_at", datetime.min.replace(tzinfo=timezone.utc))
        time_since = (datetime.now(timezone.utc) - created_at).total_seconds()
        if time_since < 60:
            remaining = int(60 - time_since)
            raise HTTPException(
                status_code=429,
                detail=f"Please wait {remaining} seconds before requesting a new deletion code."
            )

    # 5. Generate and store OTP
    otp_code = generate_otp()
    otp_store[del_otp_key] = {
        "code": otp_code,
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=5),
        "created_at": datetime.now(timezone.utc)
    }

    try:
        await otp_telegram_service.send_otp_message(username, otp_code)
    except Exception as e:
        otp_store.pop(del_otp_key, None)
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "message": f"Account deletion verification code sent to @{username} via Telegram.",
        "expires_in_seconds": 300
    }


@router.delete("/delete-account")
async def delete_account(
    payload: DeleteAccountConfirmSchema,
    authorization: Optional[str] = Header(None)
):
    """
    Step 3 Final Confirmation: Verify OTP code and permanently wipe user account, files, and Telegram messages.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")

    token = authorization.split(" ")[1]
    jwt_payload = decode_jwt_token(token)
    if not jwt_payload or not jwt_payload.get("user_id"):
        raise HTTPException(status_code=401, detail="Invalid or expired token.")

    user_id = jwt_payload["user_id"]

    # 1. Fetch user record
    res = supabase_admin.table("users").select("*").eq("id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="User account not found.")

    user = res.data[0]
    username = user["telegram_username"]

    # 2. Verify password with bcrypt
    password_bytes = payload.password.encode("utf-8")
    stored_hash_bytes = user["password_hash"].encode("utf-8")

    try:
        password_matches = bcrypt.checkpw(password_bytes, stored_hash_bytes)
    except Exception as err:
        password_matches = False

    if not password_matches:
        raise HTTPException(status_code=400, detail="Incorrect password. Account deletion aborted.")

    # 3. Verify confirmation phrase
    EXPECTED_PHRASE = "I am sure I want to delete my account"
    if payload.confirmation_phrase.strip() != EXPECTED_PHRASE:
        raise HTTPException(
            status_code=400,
            detail=f'Confirmation phrase mismatch! You must type exactly "{EXPECTED_PHRASE}".'
        )

    # 4. Verify Telegram OTP code
    del_otp_key = f"del_{username}"
    stored_otp = otp_store.get(del_otp_key)
    if not stored_otp:
        raise HTTPException(
            status_code=400,
            detail="No deletion verification code found. Please request a new code."
        )

    if datetime.now(timezone.utc) > stored_otp["expires_at"]:
        otp_store.pop(del_otp_key, None)
        raise HTTPException(
            status_code=400,
            detail="Deletion verification code has expired. Please request a new code."
        )

    if stored_otp["code"] != payload.otp_code.strip():
        raise HTTPException(
            status_code=400,
            detail="Invalid Telegram verification code! Please check your Telegram DM."
        )

    # 5. Purge all user files from Telegram Channel
    from app.telegram_client import telegram_service
    files_res = supabase_admin.table("files").select("id, telegram_message_id").eq("user_id", user_id).execute()
    user_files = files_res.data or []
    msg_ids = [f.get("telegram_message_id") for f in user_files if f.get("telegram_message_id")]

    tg_deleted_count = await telegram_service.delete_file_messages_batch(msg_ids)

    # 6. Delete DB records
    try:
        supabase_admin.table("files").delete().eq("user_id", user_id).execute()
    except Exception as e:
        print(f"Error deleting files DB records: {e}")

    try:
        supabase_admin.table("folders").delete().eq("user_id", user_id).execute()
    except Exception as e:
        print(f"Error deleting folders DB records: {e}")

    try:
        supabase_admin.table("storage_requests").delete().eq("user_id", user_id).execute()
    except Exception as e:
        print(f"Error deleting storage_requests DB records: {e}")

    try:
        supabase_admin.table("users").delete().eq("id", user_id).execute()
    except Exception as e:
        print(f"Error deleting user DB record: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete user account record.")

    # 7. Clean up OTP store
    otp_store.pop(del_otp_key, None)

    print(f"💥 Account for user @{username} ({user_id}) permanently deleted along with {len(user_files)} files ({tg_deleted_count} TG messages removed).")

    return {
        "message": "Your account and all associated files have been permanently deleted."
    }
