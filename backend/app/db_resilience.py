"""
DataForge PostgreSQL Health Check & Backup System
===================================================
Simplified database resilience for DataForge PostgreSQL:
  - Periodic health check (ping PostgreSQL)
  - Optional Telegram channel JSON backup
  - No SQLite fallback needed (DataForge is persistent)
"""

import os
import json
import tempfile
import logging
from datetime import datetime, timezone

logger = logging.getLogger("CloudDrive.Resilience")

# Backup file identification prefix in Telegram channel captions
BACKUP_CAPTION_PREFIX = "📀 DB_BACKUP_"
BACKUP_RETENTION_COUNT = 5

# Backup tracker file
if os.path.exists("/data") and os.access("/data", os.W_OK):
    BACKUP_TRACKER_PATH = "/data/db_backup_tracker.json"
else:
    BACKUP_TRACKER_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "db_backup_tracker.json")


def _load_backup_tracker() -> list:
    if not os.path.exists(BACKUP_TRACKER_PATH):
        return []
    try:
        with open(BACKUP_TRACKER_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def _save_backup_tracker(records: list):
    try:
        with open(BACKUP_TRACKER_PATH, "w", encoding="utf-8") as f:
            json.dump(records[-BACKUP_RETENTION_COUNT:], f, indent=2)
    except Exception as e:
        logger.error(f"[Resilience] Failed to save backup tracker: {e}")


class DatabaseResilienceManager:
    """Manages DataForge PostgreSQL health monitoring and periodic Telegram backups."""

    def __init__(self):
        self._consecutive_failures = 0

    # ─── HEALTH CHECK ─────────────────────────────────────────────────

    def health_check_database(self) -> bool:
        """Ping DataForge PostgreSQL to verify it's alive."""
        try:
            from app.supabase_client import supabase_admin
            return supabase_admin.health_check()
        except Exception as e:
            logger.error(f"[Resilience] Database health check failed: {e}")
            return False

    # ─── BACKUP TO TELEGRAM ───────────────────────────────────────────

    def create_backup_json(self) -> dict:
        """Export all data from DataForge PostgreSQL to a JSON-serializable dict."""
        from app.supabase_client import supabase_admin

        backup = {
            "backup_version": 2,
            "db_provider": "dataforge_postgresql",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "tables": {}
        }

        for table_name in ["users", "folders", "files"]:
            try:
                res = supabase_admin.table(table_name).select("*").execute()
                backup["tables"][table_name] = res.data or []
                logger.info(f"[Resilience] Exported {len(res.data or [])} rows from '{table_name}'")
            except Exception as e:
                logger.error(f"[Resilience] Failed to export '{table_name}': {e}")
                backup["tables"][table_name] = []

        return backup

    async def upload_backup_to_telegram(self, backup_data: dict) -> bool:
        """Upload a JSON backup file to the Telegram channel."""
        from app.telegram_client import telegram_service
        from app.config import settings

        if not backup_data or not backup_data.get("tables"):
            logger.warning("[Resilience] Empty backup data, skipping upload.")
            return False

        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S")
        caption = f"{BACKUP_CAPTION_PREFIX}{timestamp}"

        tmp_path = None
        try:
            await telegram_service.start()
            channel_id = int(settings.TELEGRAM_CHANNEL_ID)

            tmp_fd, tmp_path = tempfile.mkstemp(suffix=".json", prefix="db_backup_")
            with os.fdopen(tmp_fd, "w", encoding="utf-8") as f:
                json.dump(backup_data, f, ensure_ascii=False, indent=None, default=str)

            msg = await telegram_service.app.send_file(
                channel_id,
                tmp_path,
                caption=caption,
                force_document=True,
                attributes=[],
            )

            total_rows = sum(len(rows) for rows in backup_data["tables"].values())

            tracker = _load_backup_tracker()
            tracker.append({
                "message_id": msg.id,
                "timestamp": timestamp,
                "total_rows": total_rows,
                "caption": caption,
            })
            _save_backup_tracker(tracker)

            logger.info(f"[Resilience] ✅ Database backup uploaded to Telegram: msg#{msg.id} ({total_rows} rows)")
            return True

        except Exception as e:
            logger.error(f"[Resilience] ❌ Failed to upload backup to Telegram: {e}")
            return False
        finally:
            if tmp_path and os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except Exception:
                    pass

    async def create_and_upload_backup(self) -> bool:
        """Full pipeline: export from DataForge PostgreSQL → upload to Telegram."""
        logger.info("[Resilience] Starting scheduled database backup...")
        backup_data = self.create_backup_json()
        if not backup_data.get("tables"):
            logger.warning("[Resilience] Backup aborted: no data to export.")
            return False
        return await self.upload_backup_to_telegram(backup_data)

    # ─── MAIN HEALTH CHECK LOOP ──────────────────────────────────────

    async def check_and_recover(self):
        """
        Main health check loop. Called periodically by APScheduler.
        Checks DataForge PostgreSQL connectivity.
        """
        db_ok = self.health_check_database()

        if db_ok:
            self._consecutive_failures = 0
            logger.info("[Resilience] 💓 DataForge PostgreSQL heartbeat OK.")

            # Self-ping Hugging Face Space to keep it awake
            try:
                import httpx
                target_url = "https://angkita420-uclaudedrive-backend.hf.space/api/health"
                async with httpx.AsyncClient(timeout=10) as client:
                    resp = await client.get(target_url)
                    if resp.status_code == 200:
                        logger.info("[Resilience] 💓 Hugging Face Space self-ping OK.")
            except Exception:
                pass
        else:
            self._consecutive_failures += 1
            logger.warning(f"[Resilience] ⚠️ DataForge PostgreSQL health check FAILED ({self._consecutive_failures})")

    # ─── STARTUP INITIALIZATION ───────────────────────────────────────

    async def initialize(self):
        """Run on application startup: verify DataForge PostgreSQL and create initial backup."""
        logger.info("[Resilience] Initializing DataForge PostgreSQL Health Monitor...")

        db_ok = self.health_check_database()

        if db_ok:
            logger.info("[Resilience] 🟢 DataForge PostgreSQL is ONLINE.")
            try:
                await self.create_and_upload_backup()
            except Exception as e:
                logger.warning(f"[Resilience] Initial backup creation failed (non-critical): {e}")
        else:
            logger.error("[Resilience] 🔴 DataForge PostgreSQL is OFFLINE on startup!")


# Global singleton instance
resilience_manager = DatabaseResilienceManager()
