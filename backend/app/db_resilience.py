"""
DataForge PostgreSQL Health Monitor
===================================
Simplified database resilience for DataForge PostgreSQL:
  - Periodic health check (ping PostgreSQL)
  - Self-ping Hugging Face Space to keep awake
"""

import logging

logger = logging.getLogger("CloudDrive.Resilience")


class DatabaseResilienceManager:
    """Manages DataForge PostgreSQL health monitoring and connectivity checks."""

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
        """Run on application startup: verify DataForge PostgreSQL status."""
        logger.info("[Resilience] Initializing DataForge PostgreSQL Health Monitor...")

        db_ok = self.health_check_database()

        if db_ok:
            logger.info("[Resilience] 🟢 DataForge PostgreSQL is ONLINE.")
        else:
            logger.error("[Resilience] 🔴 DataForge PostgreSQL is OFFLINE on startup!")


# Global singleton instance
resilience_manager = DatabaseResilienceManager()
