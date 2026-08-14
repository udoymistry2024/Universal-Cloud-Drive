import os
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from app.logger import setup_logger
from app.telegram_client import telegram_service, otp_telegram_service, ticket_telegram_service
from app.routes import files, folders, shared, auth, users
from app.cleanup_scheduler import start_cleanup_scheduler, scheduler

logger = setup_logger()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Start Telethon Telegram Clients
    print("Starting Storage Telegram Client...")
    try:
        await asyncio.wait_for(telegram_service.start(), timeout=15)
    except Exception as e:
        print(f"Error starting Storage Telegram Client: {e}")

    print("Starting Dedicated OTP Telegram Client...")
    try:
        await asyncio.wait_for(otp_telegram_service.start(), timeout=15)
    except Exception as e:
        print(f"Error starting Dedicated OTP Telegram Client: {e}")

    print("Starting Dedicated Storage Ticket Telegram Client...")
    try:
        await asyncio.wait_for(ticket_telegram_service.start(), timeout=15)
    except Exception as e:
        print(f"Error starting Dedicated Storage Ticket Telegram Client: {e}")

    # Startup: Start scheduled cleanup jobs
    try:
        start_cleanup_scheduler()
    except Exception as e:
        print(f"Error starting cleanup scheduler: {e}")

    # Startup: Initialize DataForge PostgreSQL Health Monitor & initial backup
    try:
        from app.db_resilience import resilience_manager
        await resilience_manager.initialize()
    except Exception as e:
        print(f"Error initializing Database Health Monitor: {e}")

    # Startup: Start Background Thumbnail Scanner
    try:
        from app.thumbnail_scanner import thumbnail_scanner
        thumbnail_scanner.start()
    except Exception as e:
        print(f"Error starting Background Thumbnail Scanner: {e}")

    yield

    # Shutdown: Stop Background Thumbnail Scanner
    try:
        from app.thumbnail_scanner import thumbnail_scanner
        thumbnail_scanner.stop()
    except Exception:
        pass

    # Shutdown: Stop cleanup scheduler
    if scheduler.running:
        scheduler.shutdown(wait=False)
        print("Cleanup scheduler stopped.")

    # Shutdown: Stop Telethon Telegram Clients
    print("Shutting down Telegram Clients...")
    await ticket_telegram_service.stop()
    await otp_telegram_service.stop()
    await telegram_service.stop()

app = FastAPI(
    title="Cloud Drive API - Telegram & DataForge PostgreSQL Backend",
    version="2.0.0",
    lifespan=lifespan
)

# CORS Middleware setup supporting all origins and local network IP addresses
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(files.router)
app.include_router(folders.router)
app.include_router(shared.router)

@app.get("/api/health")
def health_check():
    from app.supabase_client import supabase_admin
    return {
        "status": "healthy",
        "db_provider": "dataforge_postgresql",
        "db_connected": supabase_admin.health_check(),
        "telegram_connected": telegram_service._is_started
    }

# ─── FRONTEND STATIC FILES & SPA FALLBACK SETUP ─────────────
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECT_ROOT = os.path.dirname(BASE_DIR)

FRONTEND_DIST_DIR = os.environ.get("FRONTEND_DIST_DIR")
if not FRONTEND_DIST_DIR:
    possible_paths = [
        os.path.join(PROJECT_ROOT, "frontend", "dist"),
        os.path.join(BASE_DIR, "frontend", "dist"),
        os.path.join(BASE_DIR, "static"),
        os.path.join(os.getcwd(), "frontend", "dist"),
        os.path.join(os.getcwd(), "static"),
    ]
    for path in possible_paths:
        if os.path.exists(path):
            FRONTEND_DIST_DIR = path
            break
    if not FRONTEND_DIST_DIR:
        FRONTEND_DIST_DIR = os.path.join(PROJECT_ROOT, "frontend", "dist")

# Mount /assets if assets directory exists inside FRONTEND_DIST_DIR
assets_dir = os.path.join(FRONTEND_DIST_DIR, "assets")
if os.path.exists(assets_dir):
    app.mount("/assets", StaticFiles(directory=assets_dir), name="static_assets")

@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    # Do not intercept missing API endpoints or API documentation routes
    if (
        full_path.startswith("api/")
        or full_path == "api"
        or full_path.startswith("docs")
        or full_path.startswith("redoc")
        or full_path == "openapi.json"
    ):
        return JSONResponse(status_code=404, content={"detail": "Not Found"})

    # Serve direct static files if found in frontend dist directory (e.g., favicon.ico, manifest.json)
    target_file = os.path.join(FRONTEND_DIST_DIR, full_path)
    if full_path and os.path.exists(target_file) and os.path.isfile(target_file):
        return FileResponse(target_file)

    # SPA fallback: Serve index.html for all frontend client-side routes
    index_html = os.path.join(FRONTEND_DIST_DIR, "index.html")
    if os.path.exists(index_html):
        return FileResponse(index_html)

    # Fallback when running backend as standalone API server without compiled frontend
    if full_path == "":
        return {"message": "Cloud Drive API is running smoothly!"}

    return JSONResponse(status_code=404, content={"detail": "Not Found"})
