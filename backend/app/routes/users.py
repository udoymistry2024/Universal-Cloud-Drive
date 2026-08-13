from fastapi import APIRouter, HTTPException, Header, UploadFile, File
from pydantic import BaseModel, field_validator
from typing import Optional
from app.routes.files import get_current_user_id
from app.supabase_client import supabase_admin
from app.telegram_client import ticket_telegram_service

router = APIRouter(prefix="/api/users", tags=["Users"])

class RequestStorageSchema(BaseModel):
    full_name: str
    email: str
    reason: str

    @field_validator("full_name", "email", "reason")
    @classmethod
    def not_empty(cls, v):
        v_str = (v or "").strip()
        if not v_str:
            raise ValueError("All fields are required.")
        return v_str

@router.post("/request-storage")
async def request_storage(
    payload: RequestStorageSchema,
    authorization: Optional[str] = Header(None)
):
    """
    User submits a storage upgrade application form from the UI.
    Dispatches a formatted notification alert to the Admin's Telegram inbox.
    """
    user_id = get_current_user_id(authorization)

    # Fetch user profile from DB to resolve telegram_username
    res = supabase_admin.table("users").select("*").eq("id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="User not found.")

    user = res.data[0]
    username = user.get("telegram_username", "unknown")

    # Format Admin Alert Message
    message_text = (
        f"🚨 **New Storage Upgrade Request!**\n"
        f"👤 **Name:** {payload.full_name}\n"
        f"🆔 **Username:** `@{username}`\n"
        f"📧 **Email:** {payload.email}\n"
        f"📝 **Reason:** {payload.reason}\n\n"
        f"⚡ **Quick Action (Click to copy):**\n"
        f"`/setlimit {username} 100`"
    )

    # Dispatch to ADMIN_TELEGRAM_ID via dedicated 3rd Ticket Telegram Bot
    await ticket_telegram_service.send_admin_alert(message_text)

    return {
        "status": "success",
        "message": "Your application has been submitted successfully to the administrator!"
    }
