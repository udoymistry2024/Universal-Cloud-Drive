"""
30-Day Automatic Trash Cleanup Engine & 60-Day Inactivity Cleanup Cron Job
Runs daily in background:
  1. Scans files & folders where is_trash == True and updated_at >= 30 days old:
     - Deletes Telegram channel file messages (telegram_message_id)
     - Hard deletes DB file and folder records
     - Automatically decrements user used_storage
  2. Scans inactive accounts (60+ days) and purges their data.
"""

import asyncio
from datetime import datetime, timezone, timedelta
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.supabase_client import supabase_admin
from app.telegram_client import telegram_service

scheduler = AsyncIOScheduler()
TRASH_RETENTION_DAYS = 30
INACTIVITY_DAYS = 60


def update_user_storage(user_id: str, delta_bytes: int):
    """
    Increments or decrements used_storage for a user.
    delta_bytes is negative when releasing/decrementing storage.
    """
    try:
        user_res = supabase_admin.table("users").select("used_storage").eq("id", user_id).execute()
        if user_res.data:
            current_used = int(user_res.data[0].get("used_storage") or 0)
            new_used = max(0, current_used + delta_bytes)
            supabase_admin.table("users").update({"used_storage": new_used}).eq("id", user_id).execute()
    except Exception as err:
        print(f"[Trash Engine] Error updating storage for user {user_id}: {err}")


async def cleanup_expired_trash():
    """
    Scans DB for trashed files and folders older than 30 days.
    Hard deletes Telegram channel messages, DB records, and decrements user's used_storage.
    """
    print(f"\n[Trash Engine] Starting 30-day automatic trash cleanup scan at {datetime.now(timezone.utc).isoformat()}")

    cutoff_date = datetime.now(timezone.utc) - timedelta(days=TRASH_RETENTION_DAYS)
    cutoff_iso = cutoff_date.isoformat()

    try:
        # ─── 1. Expired Trashed Files Scan ────────────────────────────────
        trashed_files_res = supabase_admin.table("files").select("*").eq("is_trash", True).lte("updated_at", cutoff_iso).execute()
        expired_files = trashed_files_res.data or []

        deleted_files_count = 0
        freed_bytes_per_user = {}

        for file_rec in expired_files:
            file_id = file_rec.get("id")
            user_id = file_rec.get("user_id")
            file_size = int(file_rec.get("size") or 0)
            tg_msg_id = file_rec.get("telegram_message_id")

            # Hard delete file message from Telegram channel
            if tg_msg_id:
                try:
                    await telegram_service.delete_file_message(int(tg_msg_id))
                except Exception as tg_err:
                    print(f"[Trash Engine] ⚠ TG delete failed for file {file_id} (msg {tg_msg_id}): {tg_err}")

            # Delete file record permanently from DB
            try:
                supabase_admin.table("files").delete().eq("id", file_id).execute()
                deleted_files_count += 1
                if user_id and file_size > 0:
                    freed_bytes_per_user[user_id] = freed_bytes_per_user.get(user_id, 0) + file_size
            except Exception as db_err:
                print(f"[Trash Engine] ⚠ DB delete failed for file {file_id}: {db_err}")

        # Automatically release/decrement used_storage for affected users
        for uid, total_bytes in freed_bytes_per_user.items():
            update_user_storage(uid, -total_bytes)
            print(f"[Trash Engine] ✓ Released {total_bytes} bytes for user {uid}")

        # ─── 2. Expired Trashed Folders Scan ──────────────────────────────
        trashed_folders_res = supabase_admin.table("folders").select("*").eq("is_trash", True).lte("updated_at", cutoff_iso).execute()
        expired_folders = trashed_folders_res.data or []

        deleted_folders_count = 0
        for folder_rec in expired_folders:
            folder_id = folder_rec.get("id")

            # Delete leftover nested files inside this folder
            folder_files_res = supabase_admin.table("files").select("*").eq("folder_id", folder_id).execute()
            for f_rec in (folder_files_res.data or []):
                msg_id = f_rec.get("telegram_message_id")
                f_uid = f_rec.get("user_id")
                f_size = int(f_rec.get("size") or 0)
                if msg_id:
                    try:
                        await telegram_service.delete_file_message(int(msg_id))
                    except Exception:
                        pass
                supabase_admin.table("files").delete().eq("id", f_rec["id"]).execute()
                if f_uid and f_size > 0:
                    update_user_storage(f_uid, -f_size)

            # Delete folder record from DB
            try:
                supabase_admin.table("folders").delete().eq("id", folder_id).execute()
                deleted_folders_count += 1
            except Exception as f_err:
                print(f"[Trash Engine] ⚠ DB delete failed for folder {folder_id}: {f_err}")

        print(f"[Trash Engine] ✅ Auto-trash scan finished. Purged {deleted_files_count} file(s) and {deleted_folders_count} folder(s) older than 30 days.\n")

    except Exception as e:
        print(f"[Trash Engine] ❌ Error during 30-day trash cleanup scan: {e}\n")


async def cleanup_inactive_users():
    """Scan and purge user accounts inactive for 60+ days."""
    print(f"\n[Cleanup Job] Starting 60-day inactivity scan at {datetime.now(timezone.utc).isoformat()}")

    cutoff_date = datetime.now(timezone.utc) - timedelta(days=INACTIVITY_DAYS)

    try:
        users_response = supabase_admin.table("users").select("*").execute()
        users = users_response.data or []

        if not users:
            print("[Cleanup Job] No users found.")
            return

        purged_count = 0
        for user in users:
            user_id = user.get("id")
            if not user_id:
                continue

            activity_str = user.get("last_login_at") or user.get("created_at")
            if not activity_str:
                continue

            try:
                if isinstance(activity_str, str):
                    activity_dt = datetime.fromisoformat(activity_str.replace('Z', '+00:00'))
                elif isinstance(activity_str, datetime):
                    activity_dt = activity_str
                    if activity_dt.tzinfo is None:
                        activity_dt = activity_dt.replace(tzinfo=timezone.utc)
                else:
                    continue
            except (ValueError, TypeError) as parse_err:
                print(f"[Cleanup Job] Could not parse activity time for user {user_id}: {parse_err}")
                continue

            if activity_dt >= cutoff_date:
                continue  # User is still active

            username = user.get("telegram_username", "unknown")
            print(f"[Cleanup Job] User @{username} ({user_id}) inactive since {activity_dt.date()} — purging data...")

            try:
                all_files = supabase_admin.table("files").select("*").eq("user_id", user_id).execute()
                if all_files.data:
                    for file_rec in all_files.data:
                        msg_id = file_rec.get("telegram_message_id")
                        if msg_id:
                            try:
                                await telegram_service.delete_file_message(int(msg_id))
                            except Exception as tg_err:
                                print(f"[Cleanup Job]   ⚠ TG delete failed for msg {msg_id}: {tg_err}")
            except Exception as files_err:
                print(f"[Cleanup Job]   ⚠ Could not fetch files for user {user_id}: {files_err}")

            try:
                supabase_admin.table("files").delete().eq("user_id", user_id).execute()
            except Exception as del_err:
                print(f"[Cleanup Job]   ⚠ Could not delete files records for {user_id}: {del_err}")

            try:
                supabase_admin.table("folders").delete().eq("user_id", user_id).execute()
            except Exception as del_err:
                print(f"[Cleanup Job]   ⚠ Could not delete folder records for {user_id}: {del_err}")

            try:
                supabase_admin.table("users").delete().eq("id", user_id).execute()
                print(f"[Cleanup Job]   ✓ User @{username} ({user_id}) permanently deleted.")
            except Exception as del_err:
                print(f"[Cleanup Job]   ⚠ Could not delete user account for {user_id}: {del_err}")

            purged_count += 1

        print(f"[Cleanup Job] ✅ Done. {purged_count} inactive account(s) purged.\n")

    except Exception as e:
        print(f"[Cleanup Job] ❌ Fatal error during inactivity cleanup: {e}\n")


async def resilience_health_check():
    """
    DataForge PostgreSQL Health Monitor — periodic check loop.
    """
    from app.db_resilience import resilience_manager
    await resilience_manager.check_and_recover()


def start_cleanup_scheduler():
    """Register all scheduled jobs: health check, trash cleanup, inactivity cleanup."""
    # 25-Minute DataForge PostgreSQL Health Check
    scheduler.add_job(
        resilience_health_check,
        trigger="interval",
        minutes=25,
        id="resilience_health_check_job",
        replace_existing=True
    )

    # 30-Day Auto-Trash Removal Engine
    scheduler.add_job(
        cleanup_expired_trash,
        trigger="interval",
        hours=24,
        id="trash_auto_cleanup",
        replace_existing=True,
        next_run_time=None
    )

    # 60-Day Inactivity Account Cleanup Job
    scheduler.add_job(
        cleanup_inactive_users,
        trigger="interval",
        hours=24,
        id="inactive_user_cleanup",
        replace_existing=True,
        next_run_time=None
    )

    scheduler.start()
    print("[Health] 25-minute DataForge PostgreSQL health check activated.")
    print("[Trash Scheduler] Daily 30-day auto-trash removal engine activated successfully.")
    print("[Cleanup Scheduler] Daily 60-day inactivity cleanup job scheduled (every 24h).")
