import uuid
import logging
import mimetypes
import urllib.parse
import io
import os
from typing import Optional
try:
    from PIL import Image as PILImage
except ImportError:
    PILImage = None

from fastapi import APIRouter, Header, HTTPException, Query, Request
from fastapi.responses import StreamingResponse, FileResponse

from app.supabase_client import supabase_admin
from app.telegram_client import telegram_service
from app.routes.files import get_current_user_id, generate_local_thumbnail, THUMBNAIL_DIR

logger = logging.getLogger("CloudDrive.Shared")
router = APIRouter(prefix="/api/shared", tags=["Shared"])

@router.post("/file/{file_id}")
async def share_file(
    file_id: str,
    authorization: Optional[str] = Header(None)
):
    user_id = get_current_user_id(authorization)

    res = supabase_admin.table("files").select("*").eq("id", file_id).eq("user_id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="File not found.")

    file_rec = res.data[0]
    token = file_rec.get("share_token") or str(uuid.uuid4())

    update_payload = {
        "is_shared": True,
        "share_token": token
    }
    supabase_admin.table("files").update(update_payload).eq("id", file_id).execute()

    return {
        "share_token": token,
        "is_shared": True,
        "share_path": f"/share/file/{token}"
    }

@router.post("/folder/{folder_id}")
async def share_folder(
    folder_id: str,
    authorization: Optional[str] = Header(None)
):
    user_id = get_current_user_id(authorization)

    res = supabase_admin.table("folders").select("*").eq("id", folder_id).eq("user_id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Folder not found.")

    folder_rec = res.data[0]
    token = folder_rec.get("share_token") or str(uuid.uuid4())

    update_payload = {
        "is_shared": True,
        "share_token": token
    }
    supabase_admin.table("folders").update(update_payload).eq("id", folder_id).execute()

    return {
        "share_token": token,
        "is_shared": True,
        "share_path": f"/share/folder/{token}"
    }

# ─── PUBLIC UNAUTHENTICATED ENDPOINTS ───────────────────

@router.get("/file/{token}")
async def get_public_file_info(token: str):
    res = supabase_admin.table("files").select("*").eq("share_token", token).eq("is_shared", True).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Shared file not found or link has expired.")

    file_rec = res.data[0]
    return {
        "id": file_rec["id"],
        "name": file_rec["name"],
        "size": file_rec["size"],
        "mime_type": file_rec["mime_type"],
        "created_at": file_rec["created_at"],
        "share_token": token
    }

@router.get("/folder/{token}")
async def get_public_folder_info(token: str, folder_id: Optional[str] = Query(None)):
    root_res = supabase_admin.table("folders").select("*").eq("share_token", token).eq("is_shared", True).execute()
    if not root_res.data:
        raise HTTPException(status_code=404, detail="Shared folder not found or link has expired.")

    root_folder = root_res.data[0]
    root_id = root_folder["id"]

    target_folder_id = folder_id if (folder_id and folder_id not in ["null", "root", ""]) else root_id

    # If target_folder_id is not root_id, verify hierarchy and build breadcrumbs
    breadcrumbs = [{"id": root_id, "name": root_folder["name"]}]

    if target_folder_id != root_id:
        curr_id = target_folder_id
        path_nodes = []
        is_valid_child = False

        for _ in range(20):  # Max depth guard
            f_res = supabase_admin.table("folders").select("*").eq("id", curr_id).execute()
            if not f_res.data:
                break
            curr_folder = f_res.data[0]
            path_nodes.insert(0, {"id": curr_folder["id"], "name": curr_folder["name"]})

            if curr_folder["id"] == root_id:
                is_valid_child = True
                break

            parent_id = curr_folder.get("parent_id")
            if not parent_id:
                break
            curr_id = parent_id

        if not is_valid_child:
            target_folder_id = root_id
            target_folder_name = root_folder["name"]
            breadcrumbs = [{"id": root_id, "name": root_folder["name"]}]
        else:
            breadcrumbs = path_nodes
            target_folder_name = path_nodes[-1]["name"] if path_nodes else root_folder["name"]
    else:
        target_folder_name = root_folder["name"]

    files_res = supabase_admin.table("files").select("*").eq("folder_id", target_folder_id).eq("is_trash", False).execute()
    subfolders_res = supabase_admin.table("folders").select("*").eq("parent_id", target_folder_id).execute()

    return {
        "root_folder": {
            "id": root_folder["id"],
            "name": root_folder["name"],
            "share_token": token
        },
        "current_folder": {
            "id": target_folder_id,
            "name": target_folder_name
        },
        "breadcrumbs": breadcrumbs,
        "files": files_res.data or [],
        "folders": subfolders_res.data or []
    }


@router.get("/download/{token}")
async def download_shared_file(token: str):
    res = supabase_admin.table("files").select("*").eq("share_token", token).eq("is_shared", True).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Shared file not found.")

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


@router.get("/stream/{token}")
async def stream_shared_file(request: Request, token: str):
    logger.info(f"[SHARED] stream_shared_file called: token={token}")
    res = supabase_admin.table("files").select("*").eq("share_token", token).eq("is_shared", True).execute()
    if not res.data:
        logger.warning(f"[SHARED] Stream file not found: token={token}")
        raise HTTPException(status_code=404, detail="Shared file not found.")

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
    if range_header and range_header.startswith("bytes=") and file_size > 0:
        try:
            bytes_range = range_header.replace("bytes=", "").split("-")
            start = int(bytes_range[0]) if bytes_range[0] else 0
            end = int(bytes_range[1]) if len(bytes_range) > 1 and bytes_range[1] else file_size - 1
            if start < file_size:
                end = min(end, file_size - 1)
                content_length = (end - start) + 1
                headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"
                headers["Content-Length"] = str(content_length)
                return StreamingResponse(
                    stream_gen,
                    status_code=206,
                    media_type=mime_type,
                    headers=headers
                )
        except Exception as r_err:
            logger.warning(f"[SHARED] Range parse error: {r_err}")

    if file_size > 0:
        headers["Content-Length"] = str(file_size)

    return StreamingResponse(
        stream_gen,
        status_code=200,
        media_type=mime_type,
        headers=headers
    )



@router.get("/download-file/{token}/{file_id}")
async def download_file_by_share(token: str, file_id: str):
    logger.info(f"[SHARED] download_file_by_share called: token={token}, file_id={file_id}")
    file_res = supabase_admin.table("files").select("*").eq("id", file_id).execute()
    if not file_res.data:
        raise HTTPException(status_code=404, detail="File not found.")

    file_rec = file_res.data[0]

    authorized = False
    if file_rec.get("is_shared") and file_rec.get("share_token") == token:
        authorized = True
    else:
        root_res = supabase_admin.table("folders").select("*").eq("share_token", token).eq("is_shared", True).execute()
        if root_res.data:
            root_id = root_res.data[0]["id"]
            curr_id = file_rec.get("folder_id")
            for _ in range(20):
                if not curr_id:
                    break
                if curr_id == root_id:
                    authorized = True
                    break
                f_res = supabase_admin.table("folders").select("parent_id").eq("id", curr_id).execute()
                if not f_res.data:
                    break
                curr_id = f_res.data[0].get("parent_id")

    if not authorized:
        raise HTTPException(status_code=403, detail="Access denied to this file.")

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


@router.get("/stream-file/{token}/{file_id}")
async def stream_file_by_share(request: Request, token: str, file_id: str):
    logger.info(f"[SHARED] stream_file_by_share called: token={token}, file_id={file_id}")
    file_res = supabase_admin.table("files").select("*").eq("id", file_id).execute()
    if not file_res.data:
        raise HTTPException(status_code=404, detail="File not found.")

    file_rec = file_res.data[0]

    authorized = False
    if file_rec.get("is_shared") and file_rec.get("share_token") == token:
        authorized = True
    else:
        root_res = supabase_admin.table("folders").select("*").eq("share_token", token).eq("is_shared", True).execute()
        if root_res.data:
            root_id = root_res.data[0]["id"]
            curr_id = file_rec.get("folder_id")
            for _ in range(20):
                if not curr_id:
                    break
                if curr_id == root_id:
                    authorized = True
                    break
                f_res = supabase_admin.table("folders").select("parent_id").eq("id", curr_id).execute()
                if not f_res.data:
                    break
                curr_id = f_res.data[0].get("parent_id")

    if not authorized:
        raise HTTPException(status_code=403, detail="Access denied to this file.")

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
    if range_header and range_header.startswith("bytes=") and file_size > 0:
        try:
            bytes_range = range_header.replace("bytes=", "").split("-")
            start = int(bytes_range[0]) if bytes_range[0] else 0
            end = int(bytes_range[1]) if len(bytes_range) > 1 and bytes_range[1] else file_size - 1
            if start < file_size:
                end = min(end, file_size - 1)
                content_length = (end - start) + 1
                headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"
                headers["Content-Length"] = str(content_length)
                return StreamingResponse(
                    stream_gen,
                    status_code=206,
                    media_type=mime_type,
                    headers=headers
                )
        except Exception as r_err:
            logger.warning(f"[SHARED] Range parse error: {r_err}")

    if file_size > 0:
        headers["Content-Length"] = str(file_size)

    return StreamingResponse(
        stream_gen,
        status_code=200,
        media_type=mime_type,
        headers=headers
    )


# Uses THUMBNAIL_DIR imported from files.py (storage/thumbnails)

@router.get("/thumbnail/{token}/{file_id}")
async def get_shared_file_thumbnail(token: str, file_id: str):
    thumb_path = os.path.join(THUMBNAIL_DIR, f"{file_id}.jpg")
    if os.path.exists(thumb_path) and os.path.getsize(thumb_path) > 0:
        return FileResponse(thumb_path, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=604800, immutable"})

    file_res = supabase_admin.table("files").select("*").eq("id", file_id).execute()
    if not file_res.data:
        raise HTTPException(status_code=404, detail="File not found.")

    file_rec = file_res.data[0]
    guessed_type, _ = mimetypes.guess_type(file_rec["name"])
    raw_mime = file_rec.get("mime_type")
    mime = (guessed_type if not raw_mime or raw_mime in ["application/octet-stream", "binary/octet-stream"] else raw_mime).lower()

    tg_msg_id = int(file_rec["telegram_message_id"])
    temp_download_path = os.path.join(THUMBNAIL_DIR, f"temp_{file_id}")

    try:
        if mime.startswith("image/"):
            await telegram_service.download_to_file(tg_msg_id, temp_download_path)
            if os.path.exists(temp_download_path) and os.path.getsize(temp_download_path) > 0:
                generate_local_thumbnail(temp_download_path, file_id, mime, file_rec["name"])
        elif mime.startswith("video/"):
            await telegram_service.download_thumbnail_fast(tg_msg_id, temp_download_path, max_partial_bytes=10*1024*1024)
            if os.path.exists(temp_download_path) and os.path.getsize(temp_download_path) > 0:
                generate_local_thumbnail(temp_download_path, file_id, mime, file_rec["name"])

        if os.path.exists(temp_download_path):
            try: os.remove(temp_download_path)
            except Exception: pass

        if os.path.exists(thumb_path) and os.path.getsize(thumb_path) > 0:
            return FileResponse(thumb_path, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=604800, immutable"})
        else:
            raise Exception("Thumbnail unavailable.")
    except Exception as e:
        if os.path.exists(temp_download_path):
            try: os.remove(temp_download_path)
            except Exception: pass
        logger.info(f"[THUMBNAIL_INFO] Shared thumbnail not available for file {file_id}: {e}")
        raise HTTPException(status_code=404, detail=f"Thumbnail unavailable: {str(e)}")


