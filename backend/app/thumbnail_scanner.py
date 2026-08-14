import os
import asyncio
import logging
import mimetypes
from typing import List
from app.config import settings
from app.supabase_client import supabase_admin
from app.telegram_client import telegram_service

logger = logging.getLogger("CloudDrive.ThumbnailScanner")

PROJECT_ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
THUMBNAIL_DIR = os.path.join(PROJECT_ROOT_DIR, "storage", "thumbnails")
os.makedirs(THUMBNAIL_DIR, exist_ok=True)

class ThumbnailScannerService:
    def __init__(self):
        self._is_running = False
        self._task = None

    def start(self):
        if not self._is_running:
            self._is_running = True
            self._task = asyncio.create_task(self._scan_loop())
            logger.info("⚡ Background Thumbnail Scanner started successfully.")

    def stop(self):
        if self._is_running:
            self._is_running = False
            if self._task:
                self._task.cancel()
            logger.info("🛑 Background Thumbnail Scanner stopped.")

    async def _scan_loop(self):
        # Wait 5 seconds after startup before first scan loop
        await asyncio.sleep(5)
        while self._is_running:
            try:
                await self.scan_and_generate_thumbnails()
            except Exception as e:
                logger.error(f"[THUMB_SCANNER_ERR] Unexpected error in thumbnail scan loop: {e}")
            
            # Scan every 30 seconds in background
            await asyncio.sleep(30)

    async def scan_and_generate_thumbnails(self):
        """Scans database files and generates permanent 0ms disk thumbnails for any missing video/image."""
        try:
            res = supabase_admin.table("files").select("id, name, mime_type, telegram_message_id, is_trash").execute()
            files = res.data or []
            if not files:
                return

            from app.routes.files import generate_local_thumbnail

            for f in files:
                if not self._is_running:
                    break

                f_id = f.get("id")
                if not f_id:
                    continue

                thumb_path = os.path.join(THUMBNAIL_DIR, f"{f_id}.jpg")

                # If file is deleted/trash, clean up thumbnail from disk
                if f.get("is_trash") is True or f.get("is_trash") == "true":
                    if os.path.exists(thumb_path):
                        try: os.remove(thumb_path)
                        except Exception: pass
                    continue

                # If thumbnail already exists on disk, skip (~0ms hit!)
                if os.path.exists(thumb_path) and os.path.getsize(thumb_path) > 0:
                    continue

                raw_mime = (f.get("mime_type") or "").lower()
                name = f.get("name") or ""
                guessed_type, _ = mimetypes.guess_type(name)
                mime = (guessed_type if not raw_mime or raw_mime in ["application/octet-stream", "binary/octet-stream"] else raw_mime).lower()

                if not (mime.startswith("video/") or mime.startswith("image/")):
                    continue

                tg_msg_id = f.get("telegram_message_id")
                if not tg_msg_id:
                    continue

                logger.info(f"[THUMB_SCANNER] Generating missing thumbnail for video: {name} (ID: {f_id})")
                temp_download_path = os.path.join(THUMBNAIL_DIR, f"temp_{f_id}")

                try:
                    if mime.startswith("image/"):
                        await telegram_service.download_to_file(int(tg_msg_id), temp_download_path)
                        if os.path.exists(temp_download_path) and os.path.getsize(temp_download_path) > 0:
                            generate_local_thumbnail(temp_download_path, f_id, mime, name)
                    elif mime.startswith("video/"):
                        # Fast native thumb or 5MB chunk
                        await telegram_service.download_thumbnail_fast(int(tg_msg_id), temp_download_path, max_partial_bytes=5120 * 1024)
                        if os.path.exists(temp_download_path) and os.path.getsize(temp_download_path) > 0:
                            generate_local_thumbnail(temp_download_path, f_id, mime, name)
                        
                        # Full file fallback if partial chunk missed moov atom
                        if not os.path.exists(thumb_path) or os.path.getsize(thumb_path) == 0:
                            await telegram_service.download_to_file(int(tg_msg_id), temp_download_path)
                            if os.path.exists(temp_download_path) and os.path.getsize(temp_download_path) > 0:
                                generate_local_thumbnail(temp_download_path, f_id, mime, name)
                except Exception as e:
                    logger.warning(f"[THUMB_SCANNER_WARN] Could not generate thumb for {name}: {e}")
                finally:
                    if os.path.exists(temp_download_path):
                        try: os.remove(temp_download_path)
                        except Exception: pass

        except Exception as err:
            logger.error(f"[THUMB_SCANNER_ERR] Scan execution failed: {err}")

thumbnail_scanner = ThumbnailScannerService()
