from typing import Optional
from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel
from app.supabase_client import supabase_admin
from app.routes.files import get_current_user_id, update_user_storage
from app.telegram_client import telegram_service

router = APIRouter(prefix="/api/folders", tags=["Folders"])

class CreateFolderSchema(BaseModel):
    name: str
    parent_id: Optional[str] = None

@router.post("")
async def create_folder(
    payload: CreateFolderSchema,
    authorization: Optional[str] = Header(None)
):
    user_id = get_current_user_id(authorization)

    folder_name = payload.name.strip()
    if not folder_name:
        raise HTTPException(status_code=400, detail="Folder name cannot be empty.")

    clean_parent_id = payload.parent_id if payload.parent_id and payload.parent_id.strip() and payload.parent_id != "null" else None

    # Check for duplicate folder name in active (non-trashed) folders only
    check_query = supabase_admin.table("folders").select("*").eq("user_id", user_id).eq("name", folder_name)
    if clean_parent_id:
        check_query = check_query.eq("parent_id", clean_parent_id)
    else:
        check_query = check_query.is_("parent_id", "null")

    existing = check_query.execute()
    if existing.data:
        # Active duplicates only (where is_trash is False or None)
        active_duplicates = [f for f in existing.data if f.get("is_trash") is True or f.get("is_trash") == "true"]
        active_existing = [f for f in existing.data if f.get("is_trash") is not True and f.get("is_trash") != "true"]
        if active_existing:
            raise HTTPException(status_code=400, detail="A folder with this name already exists!")

    data = {
        "user_id": user_id,
        "name": folder_name,
        "parent_id": clean_parent_id,
        "is_trash": False,
        "is_shared": False
    }

    res = supabase_admin.table("folders").insert(data).execute()
    if not res.data:
        # Fallback if DB schema lacks new columns
        data_simple = {
            "user_id": user_id,
            "name": folder_name,
            "parent_id": clean_parent_id
        }
        res = supabase_admin.table("folders").insert(data_simple).execute()
        if not res.data:
            raise HTTPException(status_code=500, detail="Failed to create folder.")
    
    return res.data[0]

@router.get("/list")
async def list_folders(
    parent_id: Optional[str] = Query(None),
    is_trash: Optional[bool] = Query(False),
    authorization: Optional[str] = Header(None)
):
    user_id = get_current_user_id(authorization)

    query = supabase_admin.table("folders").select("*").eq("user_id", user_id)
    res = query.order("name", desc=False).execute()
    all_folders = res.data or []

    if is_trash:
        return [f for f in all_folders if f.get("is_trash") is True or f.get("is_trash") == "true"]

    # Active folders (is_trash is False, None, or missing)
    active_folders = [f for f in all_folders if f.get("is_trash") is not True and f.get("is_trash") != "true"]

    if parent_id is not None and parent_id != "null" and parent_id != "root":
        return [f for f in active_folders if str(f.get("parent_id")) == str(parent_id)]
    else:
        return [f for f in active_folders if not f.get("parent_id") or f.get("parent_id") == "null"]

@router.patch("/{folder_id}")
async def update_folder(
    folder_id: str,
    payload: dict,
    authorization: Optional[str] = Header(None)
):
    user_id = get_current_user_id(authorization)

    allowed = {}
    if "name" in payload:
        new_name = payload["name"].strip()
        if not new_name:
            raise HTTPException(status_code=400, detail="Folder name cannot be empty.")
        
        current = supabase_admin.table("folders").select("*").eq("id", folder_id).eq("user_id", user_id).execute()
        if current.data:
            parent_id = current.data[0].get("parent_id")
            chk = supabase_admin.table("folders").select("*").eq("user_id", user_id).eq("name", new_name)
            if parent_id:
                chk = chk.eq("parent_id", parent_id)
            else:
                chk = chk.is_("parent_id", "null")
            chk_res = chk.execute()
            if chk_res.data:
                active_dups = [f for f in chk_res.data if f.get("id") != folder_id and f.get("is_trash") is not True and f.get("is_trash") != "true"]
                if active_dups:
                    raise HTTPException(status_code=400, detail="A folder with this name already exists!")

        allowed["name"] = new_name

    if "parent_id" in payload:
        allowed["parent_id"] = payload["parent_id"]

    if "is_trash" in payload:
        trash_state = bool(payload["is_trash"])
        allowed["is_trash"] = trash_state
        # Recursively update contained files & subfolders to match trash state
        async def update_trash_recursive(target_id: str, state: bool):
            try:
                supabase_admin.table("files").update({"is_trash": state}).eq("folder_id", target_id).eq("user_id", user_id).execute()
            except Exception:
                pass
            subs = supabase_admin.table("folders").select("id").eq("parent_id", target_id).eq("user_id", user_id).execute()
            if subs.data:
                for sub in subs.data:
                    try:
                        supabase_admin.table("folders").update({"is_trash": state}).eq("id", sub["id"]).eq("user_id", user_id).execute()
                    except Exception:
                        pass
                    await update_trash_recursive(sub["id"], state)

        await update_trash_recursive(folder_id, trash_state)

    if not allowed:
        raise HTTPException(status_code=400, detail="No fields to update.")

    res = supabase_admin.table("folders").update(allowed).eq("id", folder_id).eq("user_id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Folder not found.")
    
    return res.data[0]

@router.delete("/{folder_id}")
async def delete_folder(
    folder_id: str,
    authorization: Optional[str] = Header(None)
):
    user_id = get_current_user_id(authorization)

    check = supabase_admin.table("folders").select("*").eq("id", folder_id).eq("user_id", user_id).execute()
    if not check.data:
        raise HTTPException(status_code=404, detail="Folder not found.")

    total_released_bytes = 0

    async def delete_folder_recursive(target_id: str):
        nonlocal total_released_bytes
        files_res = supabase_admin.table("files").select("*").eq("folder_id", target_id).eq("user_id", user_id).execute()
        if files_res.data:
            for f in files_res.data:
                f_size = int(f.get("size") or 0)
                try:
                    await telegram_service.delete_file_message(int(f["telegram_message_id"]))
                except Exception as tg_err:
                    print(f"Warning: TG message delete failed: {tg_err}")
                supabase_admin.table("files").delete().eq("id", f["id"]).eq("user_id", user_id).execute()
                total_released_bytes += f_size

        subs = supabase_admin.table("folders").select("id").eq("parent_id", target_id).eq("user_id", user_id).execute()
        if subs.data:
            for sub in subs.data:
                await delete_folder_recursive(sub["id"])

        supabase_admin.table("folders").delete().eq("id", target_id).eq("user_id", user_id).execute()

    await delete_folder_recursive(folder_id)
    if total_released_bytes > 0:
        update_user_storage(user_id, -total_released_bytes)

    return {"message": "Folder and all contained files deleted successfully"}

@router.post("/empty-trash")
async def empty_trash(
    authorization: Optional[str] = Header(None)
):
    user_id = get_current_user_id(authorization)

    total_released_bytes = 0

    # 1. Permanently delete all trashed files for user
    all_files = supabase_admin.table("files").select("*").eq("user_id", user_id).execute()
    if all_files.data:
        trashed = [f for f in all_files.data if f.get("is_trash") is True or f.get("is_trash") == "true"]
        for f in trashed:
            f_size = int(f.get("size") or 0)
            try:
                await telegram_service.delete_file_message(int(f["telegram_message_id"]))
            except Exception:
                pass
            supabase_admin.table("files").delete().eq("id", f["id"]).execute()
            total_released_bytes += f_size

    # 2. Permanently delete all trashed folders for user
    all_folders = supabase_admin.table("folders").select("*").eq("user_id", user_id).execute()
    if all_folders.data:
        trashed_fld = [f for f in all_folders.data if f.get("is_trash") is True or f.get("is_trash") == "true"]
        for f in trashed_fld:
            supabase_admin.table("folders").delete().eq("id", f["id"]).execute()

    if total_released_bytes > 0:
        update_user_storage(user_id, -total_released_bytes)

    return {"message": "Trash emptied successfully"}
