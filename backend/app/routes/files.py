import os
import time
import json
import shutil
import asyncio
import logging
import tempfile
import zipfile
import mimetypes
import urllib.parse

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel
try:
    from PIL import Image as PILImage, ImageFile
    ImageFile.LOAD_TRUNCATED_IMAGES = True
except ImportError:
    PILImage = None

PROJECT_ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
THUMBNAIL_DIR = os.path.join(PROJECT_ROOT_DIR, "storage", "thumbnails")
os.makedirs(THUMBNAIL_DIR, exist_ok=True)
MAX_THUMB_CACHE_SIZE_BYTES = 2000 * 1024 * 1024  # 2 GB Permanent High-Speed Disk Cache

def prune_thumbnail_cache():
    """LRU Cache Trimmer: Ensures total thumbnail cache on server disk never exceeds 50MB."""
    try:
        if not os.path.exists(THUMBNAIL_DIR):
            return
        files = []
        total_size = 0
        for f in os.listdir(THUMBNAIL_DIR):
            fp = os.path.join(THUMBNAIL_DIR, f)
            if os.path.isfile(fp):
                size = os.path.getsize(fp)
                mtime = os.path.getmtime(fp)
                files.append((fp, size, mtime))
                total_size += size

        if total_size > MAX_THUMB_CACHE_SIZE_BYTES:
            files.sort(key=lambda x: x[2])  # Sort by oldest modified time first
            target_size = 30 * 1024 * 1024  # Prune down to 30 MB
            freed = 0
            for fp, sz, _ in files:
                if total_size <= target_size:
                    break
                try:
                    os.remove(fp)
                    total_size -= sz
                    freed += sz
                except Exception:
                    pass
            logger.info(f"[CACHE_PRUNE] Pruned {freed // 1024} KB of old thumbnails to enforce 50MB disk cap.")
    except Exception as e:
        logger.warning(f"[CACHE_PRUNE_ERROR] {e}")

def generate_local_thumbnail(source_path: str, file_id: str, mime_type: str, filename: str):
    """Generates a 250x250 JPEG thumbnail from local file and caches it on disk."""
    if not os.path.exists(source_path) or os.path.getsize(source_path) == 0:
        return
    try:
        thumb_path = os.path.join(THUMBNAIL_DIR, f"{file_id}.jpg")
        guessed_type, _ = mimetypes.guess_type(filename)
        effective_mime = (guessed_type if not mime_type or mime_type in ["application/octet-stream", "binary/octet-stream"] else mime_type).lower()

        if effective_mime.startswith("image/"):
            if PILImage:
                try:
                    with PILImage.open(source_path) as img:
                        img = img.convert("RGB")
                        img.thumbnail((250, 250), PILImage.Resampling.LANCZOS)
                        img.save(thumb_path, "JPEG", quality=80, optimize=True)
                        logger.info(f"[THUMB] Successfully generated instant image thumbnail for {file_id}")
                except Exception as img_err:
                    logger.warning(f"[THUMB] PIL image thumbnail failed for {file_id}: {img_err}")
        elif effective_mime.startswith("video/"):
            try:
                ffmpeg_exe = "ffmpeg"
                try:
                    import imageio_ffmpeg
                    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
                except Exception:
                    pass

                import subprocess

                # Primary attempt: Extract frame at 10 seconds offset
                cmd_10s = [
                    ffmpeg_exe, "-y",
                    "-ss", "00:00:10.000",
                    "-i", source_path,
                    "-vframes", "1",
                    "-vf", "scale=360:-1",
                    "-q:v", "4",
                    thumb_path
                ]
                subprocess.run(cmd_10s, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=8)

                # Fallback 1: If video is shorter than 10s, try at 1 second offset
                if not os.path.exists(thumb_path) or os.path.getsize(thumb_path) == 0:
                    cmd_1s = [
                        ffmpeg_exe, "-y",
                        "-ss", "00:00:01.000",
                        "-i", source_path,
                        "-vframes", "1",
                        "-vf", "scale=360:-1",
                        "-q:v", "4",
                        thumb_path
                    ]
                    subprocess.run(cmd_1s, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=8)

                # Fallback 2: OpenCV Frame Extractor
                if not os.path.exists(thumb_path) or os.path.getsize(thumb_path) == 0:
                    try:
                        import cv2
                        cap = cv2.VideoCapture(source_path)
                        if cap.isOpened():
                            fps = cap.get(cv2.CAP_PROP_FPS) or 25
                            # Seek to 10s or frame 250
                            cap.set(cv2.CAP_PROP_POS_FRAMES, int(fps * 10))
                            ret, frame = cap.read()
                            if not ret:
                                cap.set(cv2.CAP_PROP_POS_FRAMES, int(fps * 1))
                                ret, frame = cap.read()
                            if ret and frame is not None:
                                h, w = frame.shape[:2]
                                target_w = 360
                                target_h = int(h * (360 / w))
                                resized = cv2.resize(frame, (target_w, target_h), interpolation=cv2.INTER_AREA)
                                cv2.imwrite(thumb_path, resized, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
                            cap.release()
                    except Exception as cv_err:
                        logger.warning(f"[THUMB] OpenCV fallback failed for {file_id}: {cv_err}")

                if os.path.exists(thumb_path) and os.path.getsize(thumb_path) > 0:
                    logger.info(f"[THUMB] Successfully generated 10s video thumbnail for {file_id}")
            except Exception as vid_err:
                logger.warning(f"[THUMB] Video frame extraction failed for {file_id}: {vid_err}")

        # Enforce 50MB disk cap
        prune_thumbnail_cache()
    except Exception as err:
        logger.warning(f"[THUMB] Helper exception: {err}")

from fastapi import APIRouter, Header, HTTPException, UploadFile, File, Form, Depends, Query, Request, BackgroundTasks

from fastapi.responses import FileResponse, StreamingResponse
from starlette.background import BackgroundTask
from app.supabase_client import supabase_admin, decode_jwt_token
from app.telegram_client import telegram_service
from app.config import settings

logger = logging.getLogger("CloudDrive.Files")
router = APIRouter(prefix="/api/files", tags=["Files"])

# Strict 2GB File Size Limit in Bytes
MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024  # 2,147,483,648 bytes

# In-memory store for live Server-Sent Events (SSE) progress tracking
upload_progress_store = {}
UPLOAD_PROGRESS_TTL = 600  # Auto-cleanup after 10 minutes

def cleanup_upload_progress(upload_id: str):
    """Remove upload progress entry to free memory."""
    try:
        upload_progress_store.pop(upload_id, None)
    except Exception:
        pass

def cleanup_stale_progress():
    """Remove stale entries older than TTL to prevent memory leaks."""
    import time
    now = time.time()
    stale_keys = [k for k, v in upload_progress_store.items()
                  if isinstance(v, dict) and now - v.get("_ts", now) > UPLOAD_PROGRESS_TTL]
    for k in stale_keys:
        upload_progress_store.pop(k, None)

def _progress(update: dict) -> dict:
    """Add timestamp to progress update for TTL tracking."""
    import time
    update["_ts"] = time.time()
    return update

def get_current_user_id(authorization: Optional[str] = Header(None)) -> str:
    """Helper to extract and verify user_id from custom JWT Bearer token and check ban status."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")
    
    token = authorization.split(" ")[1]
    payload = decode_jwt_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired session token.")
    
    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload.")
    
    # Ban Guard: Verify user is active and not suspended by Admin
    user_res = supabase_admin.table("users").select("is_banned").eq("id", user_id).execute()
    if user_res.data and user_res.data[0].get("is_banned"):
        raise HTTPException(
            status_code=403,
            detail="Your account has been suspended by the administrator."
        )

    return user_id

@router.get("/upload-progress/{upload_id}")
async def stream_upload_progress(upload_id: str):
    """Server-Sent Events (SSE) stream endpoint to deliver live Telethon upload progress."""
    import time
    async def event_generator():
        while True:
            cleanup_stale_progress()
            info = upload_progress_store.get(upload_id)
            if info:
                safe_info = {k: v for k, v in info.items() if k != "_ts"}
                yield f"data: {json.dumps(safe_info)}\n\n"
                if info.get("stage") in ["completed", "error", "cancelled"]:
                    cleanup_upload_progress(upload_id)
                    break
            else:
                yield f"data: {json.dumps({'stage': 'local', 'percent': 0})}\n\n"
            await asyncio.sleep(0.2)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
        }
    )

def update_user_storage(user_id: str, delta_bytes: int):
    """
    Increments or decrements used_storage for a user in public.users table.
    delta_bytes can be positive (upload) or negative (delete).
    """
    try:
        user_res = supabase_admin.table("users").select("used_storage").eq("id", user_id).execute()
        if user_res.data:
            current_used = int(user_res.data[0].get("used_storage") or 0)
            new_used = max(0, current_used + delta_bytes)
            supabase_admin.table("users").update({"used_storage": new_used}).eq("id", user_id).execute()
    except Exception as err:
        print(f"Error updating user storage for {user_id}: {err}")

@router.post("/upload")
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    folder_id: Optional[str] = Form(None),
    upload_id: Optional[str] = Form(None),
    authorization: Optional[str] = Header(None)
):
    user_id = get_current_user_id(authorization)
    
    if upload_id:
        upload_progress_store[upload_id] = _progress({
            "stage": "local", # Stage 1: Uploading to local server
            "current": 0,
            "total": 0,
            "speed": 0,
            "percent": 0
        })

    raw_filename = file.filename or "uploaded_file"
    safe_filename = raw_filename.split("/")[-1].split("\\")[-1]

    temp_dir = tempfile.mkdtemp()
    temp_file_path = os.path.join(temp_dir, safe_filename)
    
    try:
        file_size = 0
        with open(temp_file_path, "wb") as buffer:
            while chunk := await file.read(1024 * 1024):  # 1MB fast stream chunks
                if await request.is_disconnected():
                    print(f"🛑 Upload cancelled by client during buffering: {safe_filename}")
                    if upload_id:
                        upload_progress_store[upload_id] = _progress({"stage": "cancelled"})
                    raise HTTPException(status_code=499, detail="Client cancelled upload")

                file_size += len(chunk)
                if file_size > MAX_FILE_SIZE:
                    buffer.close()
                    if os.path.exists(temp_file_path):
                        os.remove(temp_file_path)
                    if upload_id:
                        upload_progress_store[upload_id] = _progress({"stage": "error", "message": "File exceeds 2GB limit"})
                    raise HTTPException(status_code=400, detail="File size exceeds the 2GB limit!")
                buffer.write(chunk)


        # Check dynamic storage limit for user
        user_res = supabase_admin.table("users").select("storage_limit, used_storage, is_banned").eq("id", user_id).execute()
        storage_limit = 32212254720  # 30GB default
        used_storage = 0
        if user_res.data:
            u_rec = user_res.data[0]
            if u_rec.get("is_banned"):
                raise HTTPException(status_code=403, detail="Your account has been suspended by the administrator.")
            storage_limit = int(u_rec.get("storage_limit") or 32212254720)
            used_storage = int(u_rec.get("used_storage") or 0)

        if used_storage + file_size > storage_limit:
            limit_display = "Unlimited" if storage_limit >= 9000000000000000000 else f"{round(storage_limit / (1024**3), 1)} GB"
            err_msg = f"Storage limit exceeded! Your current account limit is {limit_display}."
            if upload_id:
                upload_progress_store[upload_id] = _progress({"stage": "error", "message": err_msg})
            raise HTTPException(
                status_code=400,
                detail=err_msg
            )

        if await request.is_disconnected():
            print(f"🛑 Upload cancelled by client before Telegram transfer: {safe_filename}")
            if upload_id:
                upload_progress_store[upload_id] = _progress({"stage": "cancelled"})
            raise HTTPException(status_code=499, detail="Client cancelled upload")

        # Stage 2: Encrypting & Securing to Cloud Drive (Telethon Telegram Channel Upload)
        if upload_id:
            upload_progress_store[upload_id] = _progress({
                "stage": "cloud", # Stage 2: Encrypting and securing to cloud drive...
                "current": 0,
                "total": file_size,
                "speed": 0,
                "percent": 0
            })

        last_time = time.time()
        last_current = 0

        def tg_progress_callback(current, total):
            nonlocal last_time, last_current
            now = time.time()
            time_diff = now - last_time
            speed = 0
            if time_diff > 0.25 or current == total:
                speed = (current - last_current) / time_diff if time_diff > 0 else 0
                last_time = now
                last_current = current
            
            percent = int((current / total) * 100) if total > 0 else 0
            if upload_id:
                upload_progress_store[upload_id] = _progress({
                    "stage": "cloud",
                    "current": current,
                    "total": total,
                    "speed": speed,
                    "percent": percent
                })

        try:
            tg_result = await telegram_service.upload_file(
                file_path=temp_file_path,
                filename=safe_filename,
                progress_callback=tg_progress_callback
            )
        except Exception as tg_err:
            err_str = str(tg_err)
            err_lower = err_str.lower()
            if "channel specified is private" in err_lower or "channel invalid" in err_lower or "could not find the input entity" in err_lower:
                err_str = "Failed to upload file: Your configured Telegram Channel ID is deleted or unlinked. Please forward 1 message from your new channel to @uclaude_drive_bot on Telegram to link your new channel!"
            print(f"Telegram upload failed: {err_str}")
            if upload_id:
                upload_progress_store[upload_id] = _progress({"stage": "error", "message": err_str})
            raise HTTPException(status_code=500, detail=err_str)

        clean_folder_id = folder_id if folder_id and folder_id.strip() and folder_id != "null" else None

        file_data = {
            "user_id": user_id,
            "folder_id": clean_folder_id,
            "name": safe_filename,
            "size": file_size,
            "mime_type": file.content_type or "application/octet-stream",
            "telegram_message_id": tg_result["message_id"],
            "telegram_file_id": tg_result["file_id"],
            "is_starred": False,
            "is_trash": False,
            "is_shared": False
        }

        db_res = supabase_admin.table("files").insert(file_data).execute()
        if not db_res.data:
            file_data_simple = {
                "user_id": user_id,
                "folder_id": clean_folder_id,
                "name": safe_filename,

                "size": file_size,
                "mime_type": file.content_type or "application/octet-stream",
                "telegram_message_id": tg_result["message_id"],
                "telegram_file_id": tg_result["file_id"],
                "is_starred": False,
                "is_trash": False
            }
            db_res = supabase_admin.table("files").insert(file_data_simple).execute()
            if not db_res.data:
                # Rollback: Purge orphan Telegram message if DB record fails to save
                try:
                    await telegram_service.delete_file_message(tg_result["message_id"])
                except Exception:
                    pass
                if upload_id:
                    upload_progress_store[upload_id] = _progress({"stage": "error", "message": "Database insert failed"})
                raise HTTPException(status_code=500, detail="Failed to save file record in database.")
        
        if upload_id:
            upload_progress_store[upload_id] = _progress({"stage": "completed", "percent": 100})

        # Update user's used_storage in DB
        update_user_storage(user_id, file_size)

        saved_file_rec = db_res.data[0]
        # Generate instant cached thumbnail from local temp_file_path before cleanup
        generate_local_thumbnail(temp_file_path, saved_file_rec["id"], saved_file_rec.get("mime_type") or file.content_type or "", safe_filename)

        return saved_file_rec

    except HTTPException:
        raise
    except Exception as general_err:
        print(f"Unhandled upload error: {general_err}")
        if upload_id:
            upload_progress_store[upload_id] = _progress({"stage": "error", "message": str(general_err)})
        raise HTTPException(status_code=500, detail=f"Upload processing error: {str(general_err)}")

    finally:
        if os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except Exception:
                pass
        if os.path.exists(temp_dir):
            try:
                shutil.rmtree(temp_dir, ignore_errors=True)
            except Exception:
                pass

async def async_pregenerate_folder_thumbnails(files: List[dict]):
    """Background Worker: Pre-generates and caches thumbnails for all video/image files in folder."""
    for f in files:
        f_id = f.get("id")
        if not f_id:
            continue
        thumb_path = os.path.join(THUMBNAIL_DIR, f"{f_id}.jpg")
        if os.path.exists(thumb_path) and os.path.getsize(thumb_path) > 0:
            continue  # Already cached on disk in 0ms!

        mime = (f.get("mime_type") or "").lower()
        name = f.get("name") or ""
        guessed_type, _ = mimetypes.guess_type(name)
        effective_mime = (guessed_type if not mime or mime in ["application/octet-stream", "binary/octet-stream"] else mime).lower()

        if effective_mime.startswith("video/") or effective_mime.startswith("image/"):
            tg_msg_id = f.get("telegram_message_id")
            if not tg_msg_id:
                continue
            temp_download_path = os.path.join(THUMBNAIL_DIR, f"temp_{f_id}")
            try:
                if effective_mime.startswith("image/"):
                    await telegram_service.download_to_file(int(tg_msg_id), temp_download_path)
                    if os.path.exists(temp_download_path) and os.path.getsize(temp_download_path) > 0:
                        generate_local_thumbnail(temp_download_path, f_id, effective_mime, name)
                elif effective_mime.startswith("video/"):
                    await telegram_service.download_thumbnail_fast(int(tg_msg_id), temp_download_path, max_partial_bytes=5120*1024)
                    if os.path.exists(temp_download_path) and os.path.getsize(temp_download_path) > 0:
                        generate_local_thumbnail(temp_download_path, f_id, effective_mime, name)
                    if not os.path.exists(thumb_path) or os.path.getsize(thumb_path) == 0:
                        await telegram_service.download_to_file(int(tg_msg_id), temp_download_path)
                        if os.path.exists(temp_download_path) and os.path.getsize(temp_download_path) > 0:
                            generate_local_thumbnail(temp_download_path, f_id, effective_mime, name)
            except Exception as e:
                logger.warning(f"[PREGEN_THUMB_ERR] Failed for file {f_id}: {e}")
            finally:
                if os.path.exists(temp_download_path):
                    try: os.remove(temp_download_path)
                    except Exception: pass

@router.get("/list")
async def list_files(
    background_tasks: BackgroundTasks,
    folder_id: Optional[str] = Query(None),
    is_starred: Optional[bool] = Query(None),
    is_trash: Optional[bool] = Query(False),
    authorization: Optional[str] = Header(None)
):
    user_id = get_current_user_id(authorization)
    
    query = supabase_admin.table("files").select("*").eq("user_id", user_id)
    res = query.order("created_at", desc=True).execute()
    all_files = res.data or []

    if is_trash:
        result_files = [f for f in all_files if f.get("is_trash") is True or f.get("is_trash") == "true"]
    else:
        active_files = [f for f in all_files if f.get("is_trash") is not True and f.get("is_trash") != "true"]
        if is_starred is not None:
            result_files = [f for f in active_files if f.get("is_starred") == is_starred or (is_starred is False and not f.get("is_starred"))]
        elif folder_id is not None and folder_id != "null" and folder_id != "root":
            result_files = [f for f in active_files if str(f.get("folder_id")) == str(folder_id)]
        else:
            result_files = [f for f in active_files if not f.get("folder_id") or f.get("folder_id") == "null"]

    # Trigger background thumbnail generation for un-cached videos
    background_tasks.add_task(async_pregenerate_folder_thumbnails, result_files)

    return result_files

@router.get("/download/{file_id}")
async def download_file(
    request: Request,
    file_id: str,
    token: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None)
):
    auth_header = authorization or (f"Bearer {token}" if token else None)
    user_id = get_current_user_id(auth_header)

    res = supabase_admin.table("files").select("*").eq("id", file_id).eq("user_id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="File not found.")

    file_rec = res.data[0]
    tg_msg_id = int(file_rec["telegram_message_id"])
    filename = urllib.parse.quote(file_rec["name"])

    stream_gen = telegram_service.download_file_stream(tg_msg_id)

    headers = {
        "Content-Disposition": f"attachment; filename*=UTF-8''{filename}"
    }

    return StreamingResponse(
        stream_gen,
        media_type=file_rec.get("mime_type") or "application/octet-stream",
        headers=headers
    )


class ZipDownloadSchema(BaseModel):
    file_ids: List[str] = []
    folder_ids: List[str] = []
    archive_name: Optional[str] = None


async def collect_folder_files(user_id: str, folder_id: str, parent_path: str = ""):
    """Recursively collects all files and subfolders under a folder with relative arcname paths."""
    items = []
    f_res = supabase_admin.table("folders").select("name").eq("id", folder_id).eq("user_id", user_id).execute()
    if not f_res.data:
        return items
    folder_name = f_res.data[0]["name"]
    current_path = f"{parent_path}/{folder_name}".strip("/")

    files_res = supabase_admin.table("files").select("*").eq("folder_id", folder_id).eq("user_id", user_id).execute()
    for f in (files_res.data or []):
        if not f.get("is_trash"):
            items.append({
                "telegram_message_id": int(f["telegram_message_id"]),
                "name": f["name"],
                "arcname": f"{current_path}/{f['name']}"
            })

    subfolders_res = supabase_admin.table("folders").select("id").eq("parent_id", folder_id).eq("user_id", user_id).execute()
    for sf in (subfolders_res.data or []):
        sub_items = await collect_folder_files(user_id, sf["id"], current_path)
        items.extend(sub_items)

    return items


@router.post("/download-zip")
async def download_zip_archive(
    payload: ZipDownloadSchema,
    background_tasks: BackgroundTasks,
    token: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None)
):
    auth_header = authorization or (f"Bearer {token}" if token else None)
    user_id = get_current_user_id(auth_header)
    logger.info(f"[ZIP] download_zip_archive called: user_id={user_id}, file_ids={payload.file_ids}, folder_ids={payload.folder_ids}")

    items_to_zip = []

    if payload.file_ids:
        files_res = supabase_admin.table("files").select("*").in_("id", payload.file_ids).eq("user_id", user_id).execute()
        for f in (files_res.data or []):
            if not f.get("is_trash"):
                items_to_zip.append({
                    "telegram_message_id": int(f["telegram_message_id"]),
                    "name": f["name"],
                    "arcname": f["name"]
                })

    if payload.folder_ids:
        for f_id in payload.folder_ids:
            sub_items = await collect_folder_files(user_id, f_id, "")
            items_to_zip.extend(sub_items)

    if not items_to_zip:
        raise HTTPException(status_code=400, detail="No valid files or folders selected for ZIP archive creation.")

    temp_zip_file = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
    temp_zip_path = temp_zip_file.name
    temp_zip_file.close()

    try:
        logger.info(f"[ZIP] Creating ZIP archive: {len(items_to_zip)} items, temp={temp_zip_path}")
        with zipfile.ZipFile(temp_zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
            for item in items_to_zip:
                zinfo = zipfile.ZipInfo(filename=item["arcname"])
                zinfo.date_time = datetime.now().timetuple()[:6]
                zinfo.compress_type = zipfile.ZIP_DEFLATED
                with zf.open(zinfo, "w") as z_out:
                    with tempfile.NamedTemporaryFile(delete=False) as temp_item_file:
                        temp_item_path = temp_item_file.name
                    
                    try:
                        logger.debug(f"[ZIP] Downloading item: {item['arcname']}, tg_msg_id={item['telegram_message_id']}")
                        await telegram_service.download_to_file(item["telegram_message_id"], temp_item_path)
                        with open(temp_item_path, "rb") as f_in:
                            while True:
                                chunk = f_in.read(8 * 1024 * 1024)
                                if not chunk:
                                    break
                                z_out.write(chunk)
                        logger.debug(f"[ZIP] Added to zip: {item['arcname']}")
                    finally:
                        if os.path.exists(temp_item_path):
                            os.remove(temp_item_path)

        zip_size = os.path.getsize(temp_zip_path)
        archive_filename = payload.archive_name or f"CloudDrive_Archive_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
        if not archive_filename.endswith(".zip"):
            archive_filename += ".zip"

        logger.info(f"[ZIP] ZIP created successfully: size={zip_size}, filename={archive_filename}")
        return FileResponse(
            path=temp_zip_path,
            media_type="application/zip",
            filename=archive_filename,
            background=BackgroundTask(os.remove, temp_zip_path)
        )
    except Exception as err:
        logger.error(f"[ZIP] FAILED to create ZIP: error={str(err)}", exc_info=True)
        if os.path.exists(temp_zip_path):
            try: os.remove(temp_zip_path)
            except Exception: pass
        raise HTTPException(status_code=500, detail=f"Failed to create ZIP archive: {str(err)}")

@router.get("/stream/{file_id}")
@router.get("/preview/{file_id}")
async def stream_media_file(
    request: Request,
    file_id: str,
    token: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None)
):
    auth_header = authorization or (f"Bearer {token}" if token else None)
    user_id = get_current_user_id(auth_header)

    res = supabase_admin.table("files").select("*").eq("id", file_id).eq("user_id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="File not found.")

    file_rec = res.data[0]
    tg_msg_id = int(file_rec["telegram_message_id"])
    file_size = int(file_rec.get("size") or 0)

    stream_gen = telegram_service.download_file_stream(tg_msg_id)

    guessed_type, _ = mimetypes.guess_type(file_rec["name"])
    raw_mime = file_rec.get("mime_type")
    mime_type = guessed_type if not raw_mime or raw_mime in ["application/octet-stream", "binary/octet-stream"] else raw_mime
    mime_type = mime_type or "application/octet-stream"

    headers = {
        "Content-Disposition": f"inline; filename*=UTF-8''{urllib.parse.quote(file_rec['name'])}",
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-cache, no-store, must-revalidate"
    }

    range_header = request.headers.get("range")
    offset_bytes = 0
    limit_bytes = None
    status_code = 200

    if range_header and range_header.startswith("bytes=") and file_size > 0:
        try:
            bytes_range = range_header.replace("bytes=", "").split("-")
            start = int(bytes_range[0]) if bytes_range[0] else 0
            end = int(bytes_range[1]) if len(bytes_range) > 1 and bytes_range[1] else file_size - 1
            if start < file_size:
                end = min(end, file_size - 1)
                content_length = (end - start) + 1
                offset_bytes = start
                limit_bytes = content_length
                status_code = 206
                headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"
                headers["Content-Length"] = str(content_length)
        except Exception as r_err:
            logger.warning(f"[STREAM] Range header parse error: {r_err}")

    if status_code == 200 and file_size > 0:
        headers["Content-Length"] = str(file_size)

    stream_gen = telegram_service.download_file_stream(tg_msg_id, offset_bytes=offset_bytes, limit_bytes=limit_bytes)

    return StreamingResponse(
        stream_gen,
        status_code=status_code,
        media_type=mime_type,
        headers=headers
    )


@router.get("/thumbnail/{file_id}")
async def get_file_thumbnail(
    file_id: str,
    token: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None)
):
    auth_header = authorization or (f"Bearer {token}" if token else None)
    user_id = get_current_user_id(auth_header)

    thumb_path = os.path.join(THUMBNAIL_DIR, f"{file_id}.jpg")

    # 1. Immediate disk cache hit (0ms)
    if os.path.exists(thumb_path) and os.path.getsize(thumb_path) > 0:
        return FileResponse(
            thumb_path,
            media_type="image/jpeg",
            headers={"Cache-Control": "public, max-age=604800, immutable"}
        )

    # 2. Get file record from database
    res = supabase_admin.table("files").select("*").eq("id", file_id).eq("user_id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="File not found.")

    file_rec = res.data[0]
    guessed_type, _ = mimetypes.guess_type(file_rec["name"])
    raw_mime = file_rec.get("mime_type")
    mime = (guessed_type if not raw_mime or raw_mime in ["application/octet-stream", "binary/octet-stream"] else raw_mime).lower()

    tg_msg_id = int(file_rec["telegram_message_id"])
    temp_download_path = os.path.join(THUMBNAIL_DIR, f"temp_{file_id}")

    try:
        if mime.startswith("image/"):
            # Download file content for thumbnail generation
            await telegram_service.download_to_file(tg_msg_id, temp_download_path)
            if os.path.exists(temp_download_path) and os.path.getsize(temp_download_path) > 0:
                generate_local_thumbnail(temp_download_path, file_id, mime, file_rec["name"])
        elif mime.startswith("video/"):
            # High-speed native thumb or 5MB chunk download
            await telegram_service.download_thumbnail_fast(tg_msg_id, temp_download_path, max_partial_bytes=5120*1024)
            if os.path.exists(temp_download_path) and os.path.getsize(temp_download_path) > 0:
                generate_local_thumbnail(temp_download_path, file_id, mime, file_rec["name"])

            # Ultimate Fallback: Download file content if partial chunk did not contain moov atom
            if not os.path.exists(thumb_path) or os.path.getsize(thumb_path) == 0:
                logger.info(f"[THUMB_FALLBACK] Downloading full video content for thumbnail: {file_id}")
                await telegram_service.download_to_file(tg_msg_id, temp_download_path)
                if os.path.exists(temp_download_path) and os.path.getsize(temp_download_path) > 0:
                    generate_local_thumbnail(temp_download_path, file_id, mime, file_rec["name"])

        if os.path.exists(temp_download_path):
            try: os.remove(temp_download_path)
            except Exception: pass

        if os.path.exists(thumb_path) and os.path.getsize(thumb_path) > 0:
            return FileResponse(
                thumb_path,
                media_type="image/jpeg",
                headers={"Cache-Control": "public, max-age=604800, immutable"}
            )
        else:
            raise Exception("Thumbnail could not be generated.")
    except Exception as e:
        if os.path.exists(temp_download_path):
            try: os.remove(temp_download_path)
            except Exception: pass
        logger.info(f"[THUMBNAIL_INFO] Thumbnail not available for file {file_id}: {e}")
        raise HTTPException(status_code=404, detail=f"Thumbnail unavailable: {str(e)}")



@router.patch("/{file_id}")
async def update_file(
    file_id: str,
    payload: dict,
    authorization: Optional[str] = Header(None)
):
    user_id = get_current_user_id(authorization)
    
    allowed_updates = {}
    for k in ["name", "folder_id", "is_starred", "is_trash"]:
        if k in payload:
            allowed_updates[k] = payload[k]

    if not allowed_updates:
        raise HTTPException(status_code=400, detail="No valid fields to update.")

    res = supabase_admin.table("files").update(allowed_updates).eq("id", file_id).eq("user_id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="File not found or unauthorized.")
    
    return res.data[0]

@router.delete("/{file_id}")
async def delete_file(
    file_id: str,
    authorization: Optional[str] = Header(None)
):
    user_id = get_current_user_id(authorization)

    res = supabase_admin.table("files").select("*").eq("id", file_id).eq("user_id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="File not found.")

    file_rec = res.data[0]
    file_size = int(file_rec.get("size") or 0)
    
    try:
        await telegram_service.delete_file_message(int(file_rec["telegram_message_id"]))
    except Exception as tg_err:
        print(f"Warning: Failed to delete TG message {file_rec['telegram_message_id']}: {tg_err}")

    supabase_admin.table("files").delete().eq("id", file_id).eq("user_id", user_id).execute()

    # Release storage: Decrement user's used_storage in DB
    update_user_storage(user_id, -file_size)

    return {"message": "File deleted successfully from Telegram storage and database"}


# ─── MOVE & COPY PIPELINE ENDPOINTS ───────────────────────────────────────

class MoveItemSchema(BaseModel):
    item_id: str
    item_type: str  # 'file' | 'folder'
    destination_folder_id: Optional[str] = None

class CopyItemSchema(BaseModel):
    item_id: str
    item_type: str  # 'file' | 'folder'
    destination_folder_id: Optional[str] = None


def is_subfolder_cycle(folder_id: str, target_parent_id: Optional[str], user_id: str) -> bool:
    """Cycle guard: Prevents moving a folder inside itself or its descendant subfolders."""
    if not target_parent_id or target_parent_id in ["null", "root", ""]:
        return False
    if folder_id == target_parent_id:
        return True

    current_id = target_parent_id
    visited = set()
    while current_id and current_id not in ["null", "root", ""]:
        if current_id in visited:
            break
        visited.add(current_id)
        if current_id == folder_id:
            return True
        res = supabase_admin.table("folders").select("parent_id").eq("id", current_id).eq("user_id", user_id).execute()
        if not res.data:
            break
        current_id = res.data[0].get("parent_id")
    return False


async def deep_copy_folder(folder_id: str, target_parent_id: Optional[str], user_id: str, is_root: bool = False) -> Optional[str]:
    """Recursively clone a folder and all its nested files & subfolders."""
    res = supabase_admin.table("folders").select("*").eq("id", folder_id).eq("user_id", user_id).execute()
    if not res.data:
        return None

    src_folder = res.data[0]
    new_name = f"Copy of {src_folder['name']}" if is_root else src_folder['name']

    # Insert new cloned folder
    folder_data = {
        "user_id": user_id,
        "name": new_name,
        "parent_id": target_parent_id,
        "is_trash": False,
        "is_shared": False
    }
    f_res = supabase_admin.table("folders").insert(folder_data).execute()
    if not f_res.data:
        return None

    new_folder = f_res.data[0]
    new_folder_id = new_folder["id"]

    # Copy all files inside source folder
    files_res = supabase_admin.table("files").select("*").eq("folder_id", folder_id).eq("user_id", user_id).eq("is_trash", False).execute()
    files_list = files_res.data or []
    total_added_bytes = 0

    for file_rec in files_list:
        file_copy = {
            "user_id": user_id,
            "folder_id": new_folder_id,
            "name": file_rec["name"],
            "mime_type": file_rec.get("mime_type"),
            "size": file_rec.get("size", 0),
            "telegram_message_id": file_rec.get("telegram_message_id"),
            "telegram_file_id": file_rec.get("telegram_file_id"),
            "is_starred": False,
            "is_trash": False,
            "is_shared": False
        }
        supabase_admin.table("files").insert(file_copy).execute()
        total_added_bytes += int(file_rec.get("size", 0))

    # Update user's storage usage
    if total_added_bytes > 0:
        update_user_storage(user_id, total_added_bytes)

    # Recursively copy all child subfolders
    subfolders_res = supabase_admin.table("folders").select("*").eq("parent_id", folder_id).eq("user_id", user_id).eq("is_trash", False).execute()
    subfolders_list = subfolders_res.data or []
    for sub in subfolders_list:
        await deep_copy_folder(sub["id"], new_folder_id, user_id, is_root=False)

    return new_folder_id


@router.post("/move")
async def move_item(
    payload: MoveItemSchema,
    authorization: Optional[str] = Header(None)
):
    """Move a file or folder to a destination folder (Cut & Move)."""
    user_id = get_current_user_id(authorization)
    dest_id = payload.destination_folder_id
    if dest_id in ["null", "root", ""]:
        dest_id = None

    if payload.item_type == "file":
        res = supabase_admin.table("files").update({"folder_id": dest_id}).eq("id", payload.item_id).eq("user_id", user_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="File not found.")
        return {"status": "success", "message": "File moved successfully!"}

    elif payload.item_type == "folder":
        if is_subfolder_cycle(payload.item_id, dest_id, user_id):
            raise HTTPException(status_code=400, detail="Cannot move a folder inside itself or its own subfolder!")

        res = supabase_admin.table("folders").update({"parent_id": dest_id}).eq("id", payload.item_id).eq("user_id", user_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Folder not found.")
        return {"status": "success", "message": "Folder moved successfully!"}

    else:
        raise HTTPException(status_code=400, detail="Invalid item_type. Must be 'file' or 'folder'.")


@router.post("/copy")
async def copy_item(
    payload: CopyItemSchema,
    authorization: Optional[str] = Header(None)
):
    """Clone/Duplicate a file or folder (Deep Copy)."""
    user_id = get_current_user_id(authorization)
    dest_id = payload.destination_folder_id
    if dest_id in ["null", "root", ""]:
        dest_id = None

    if payload.item_type == "file":
        res = supabase_admin.table("files").select("*").eq("id", payload.item_id).eq("user_id", user_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="File not found.")

        orig_file = res.data[0]
        file_size = int(orig_file.get("size") or 0)

        # Check storage limit
        u_res = supabase_admin.table("users").select("storage_limit, used_storage").eq("id", user_id).execute()
        if u_res.data:
            limit = int(u_res.data[0].get("storage_limit") or 32212254720)
            used = int(u_res.data[0].get("used_storage") or 0)
            if used + file_size > limit:
                raise HTTPException(status_code=400, detail="Storage limit exceeded! Cannot copy file.")

        new_name = f"Copy of {orig_file['name']}" if orig_file.get("folder_id") == dest_id else orig_file['name']

        file_copy = {
            "user_id": user_id,
            "folder_id": dest_id,
            "name": new_name,
            "mime_type": orig_file.get("mime_type"),
            "size": file_size,
            "telegram_message_id": orig_file.get("telegram_message_id"),
            "telegram_file_id": orig_file.get("telegram_file_id"),
            "is_starred": False,
            "is_trash": False,
            "is_shared": False
        }
        ins_res = supabase_admin.table("files").insert(file_copy).execute()
        if not ins_res.data:
            raise HTTPException(status_code=500, detail="Failed to copy file.")

        if file_size > 0:
            update_user_storage(user_id, file_size)

        return {"status": "success", "message": "File copied successfully!"}

    elif payload.item_type == "folder":
        new_folder_id = await deep_copy_folder(payload.item_id, dest_id, user_id, is_root=True)
        if not new_folder_id:
            raise HTTPException(status_code=404, detail="Folder not found or failed to copy.")
        return {"status": "success", "message": "Folder copied successfully!"}

    else:
        raise HTTPException(status_code=400, detail="Invalid item_type. Must be 'file' or 'folder'.")
