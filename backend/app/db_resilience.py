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

    # ─── BACKUP TO TELEGRAM (SQL FORMAT) ──────────────────────────────

    def create_backup_sql(self) -> tuple:
        """Export all data from DataForge PostgreSQL as a ready-to-execute SQL script."""
        from app.supabase_client import supabase_admin

        now_str = datetime.now(timezone.utc).isoformat()
        sql_lines = [
            "-- ============================================================",
            "-- Universal Cloud Drive — DataForge PostgreSQL Database Backup",
            f"-- Created At: {now_str}",
            "-- Database Provider: DataForge PostgreSQL (u_claude_drive)",
            "-- ============================================================\n",
            "BEGIN;\n"
        ]

        table_order = ["users", "folders", "files"]
        total_rows = 0

        def _format_sql_val(val):
            if val is None:
                return "NULL"
            elif isinstance(val, bool):
                return "TRUE" if val else "FALSE"
            elif isinstance(val, (int, float)):
                return str(val)
            elif isinstance(val, (dict, list)):
                s = json.dumps(val, ensure_ascii=False).replace("'", "''")
                return f"'{s}'"
            else:
                s = str(val).replace("'", "''")
                return f"'{s}'"

        for table_name in table_order:
            try:
                res = supabase_admin.table(table_name).select("*").execute()
                rows = res.data or []
                total_rows += len(rows)

                sql_lines.append(f"-- ------------------------------------------------------------")
                sql_lines.append(f"-- Table: {table_name} ({len(rows)} rows)")
                sql_lines.append(f"-- ------------------------------------------------------------")

                if rows:
                    cols = list(rows[0].keys())
                    cols_str = ", ".join(cols)

                    for r in rows:
                        vals = [_format_sql_val(r.get(c)) for c in cols]
                        vals_str = ", ".join(vals)
                        sql_lines.append(
                            f"INSERT INTO {table_name} ({cols_str}) VALUES ({vals_str}) "
                            f"ON CONFLICT (id) DO NOTHING;"
                        )
                sql_lines.append("")
                logger.info(f"[Resilience] Exported {len(rows)} SQL rows for '{table_name}'")

            except Exception as e:
                logger.error(f"[Resilience] Failed to export SQL for '{table_name}': {e}")
                sql_lines.append(f"-- ERROR exporting {table_name}: {e}\n")

        sql_lines.append("COMMIT;")
        return "\n".join(sql_lines), total_rows

    async def upload_backup_to_telegram(self, sql_content: str, total_rows: int) -> bool:
        """Upload a .sql backup file to the Telegram channel."""
        from app.telegram_client import telegram_service
        from app.config import settings

        if not sql_content:
            logger.warning("[Resilience] Empty SQL backup data, skipping upload.")
            return False

        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S")
        caption = f"{BACKUP_CAPTION_PREFIX}{timestamp}.sql"

        tmp_path = None
        try:
            await telegram_service.start()
            channel_id = int(settings.TELEGRAM_CHANNEL_ID)

            tmp_fd, tmp_path = tempfile.mkstemp(suffix=".sql", prefix="db_backup_")
            with os.fdopen(tmp_fd, "w", encoding="utf-8") as f:
                f.write(sql_content)

            msg = await telegram_service.app.send_file(
                channel_id,
                tmp_path,
                caption=caption,
                force_document=True,
                attributes=[],
            )

            tracker = _load_backup_tracker()
            tracker.append({
                "message_id": msg.id,
                "timestamp": timestamp,
                "total_rows": total_rows,
                "caption": caption,
                "format": "sql"
            })
            _save_backup_tracker(tracker)

            logger.info(f"[Resilience] ✅ Database SQL backup uploaded to Telegram: msg#{msg.id} ({total_rows} rows, .sql format)")
            return True

        except Exception as e:
            logger.error(f"[Resilience] ❌ Failed to upload SQL backup to Telegram: {e}")
            return False
        finally:
            if tmp_path and os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except Exception:
                    pass

    async def create_and_upload_backup(self) -> bool:
        """Full pipeline: export SQL script from DataForge PostgreSQL → upload .sql file to Telegram."""
        logger.info("[Resilience] Starting scheduled database SQL backup...")
        sql_content, total_rows = self.create_backup_sql()
        return await self.upload_backup_to_telegram(sql_content, total_rows)

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
