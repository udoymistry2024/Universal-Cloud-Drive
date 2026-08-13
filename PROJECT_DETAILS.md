# 📐 Universal Cloud Drive — In-Depth Architecture & Blueprints

This document provides a comprehensive technical overview of the system architecture, directory organization, database schema, bot microservices, parallel MTProto transfer engines, multi-user concurrency protection, and production deployment guidelines.

---

## 📂 Project Directory Structure

```
Project_Test/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── cleanup_scheduler.py     # 30-Day Auto-Trash & 60-Day Inactivity Scheduler
│   │   ├── config.py                # Environment Variables & Settings Parser
│   │   ├── main.py                  # FastAPI Entrypoint, SPA Static File Guard & Async Lifespan Manager
│   │   ├── supabase_client.py       # Supabase Admin Client & JWT Decoding Utilities
│   │   ├── telegram_client.py       # Three Telethon Bot Clients, Parallel MTProto Engine & Admin Handlers
│   │   └── routes/
│   │       ├── auth.py              # OTP Request & Verification Routes
│   │       ├── files.py             # File Upload, Download, Streaming, Copy, Move, Trash Routes
│   │       ├── folders.py           # Folder Management & Nesting Routes
   │       ├── shared.py            # Public File & Folder Sharing Endpoints
│   │       └── users.py             # User Profile & Storage Upgrade Ticket Route
│   ├── .env                         # Secrets (Ignored in Git)
│   └── requirements.txt             # Python Dependencies
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Dashboard.jsx        # Core Workspace View, Drag & Drop Overlay, Keyboard Shortcuts
│   │   │   ├── FileCard.jsx         # File Card Component (Grid & List View)
│   │   │   ├── FolderCard.jsx       # Folder Card Component (Grid & List View)
│   │   │   ├── Navbar.jsx           # Top Header with User Profile Menu
│   │   │   ├── Sidebar.jsx          # Storage Usage Bar & Request Upgrade Link
│   │   │   ├── AuthModal.jsx        # Telegram OTP Authentication Modal
│   │   │   ├── RequestStorageModal.jsx # Read-Only Username Storage Upgrade Form
│   │   │   ├── PreviewModal.jsx     # Live Document & Media Streaming Viewer
│   │   │   ├── UploadProgress.jsx   # SSE Two-Stage Upload Progress Bar
│   │   │   ├── FloatingActionButton.jsx # Floating (+) Action Menu
│   │   │   ├── BulkActionBar.jsx    # Selection Action Toolbar
│   │   │   ├── ErrorBoundary.jsx    # React Fallback Error Handler
│   │   │   └── Toast.jsx            # Global Toast Notification Alert
│   │   ├── context/
│   │   │   ├── AuthContext.jsx      # Authentication & Token Persistence Context
│   │   │   └── DriveContext.jsx     # Drive Content, Clipboard & Sequential Download Queue
│   │   ├── hooks/
│   │   │   └── useClickOutside.js   # Outside Click Handler for Popups & Menus
│   │   ├── lib/
│   │   │   ├── api.js               # Axios API Interceptors & Absolute Endpoint Resolution
│   │   │   └── fileUtils.js         # Byte Formatter & Category Parsers
│   │   ├── App.jsx                  # Main App Component
│   │   └── main.jsx                 # Vite React Entrypoint
│   ├── .env                         # Vite Frontend Environment Config
│   ├── package.json                 # Node.js Dependencies
│   ├── tailwind.config.js           # Custom Dark Slate Theme Tokens
│   └── vite.config.js               # Vite Build Configuration
├── Dockerfile                       # Production Multi-Stage Dockerfile (Hugging Face Spaces)
├── dataforge_schema.sql             # DataForge PostgreSQL Database Tables & Index SQL Definitions
├── start.sh                         # Executive Concurrent Launcher Script
├── README.md                        # Project Overview & Quickstart Guide
└── PROJECT_DETAILS.md               # In-Depth Technical Blueprints
```

---

## 🤖 Three-Bot Microservice Architecture

To guarantee maximum availability and eliminate rate limits or session collisions, the system splits bot responsibilities across 3 dedicated Telegram bot instances:

```
                  ┌──────────────────────────────────────────────┐
                  │          Universal Cloud Drive               │
                  └──────────────────────┬───────────────────────┘
                                         │
       ┌─────────────────────────────────┼─────────────────────────────────┐
       │                                 │                                 │
       ▼                                 ▼                                 ▼
┌──────────────┐                 ┌──────────────┐                 ┌──────────────┐
│  Bot 1: OTP  │                 │Bot 2: Storage│                 │Bot 3: Ticket │
│   Service    │                 │  & Admin Bot │                 │ Alert Service│
└──────┬───────┘                 └──────┬───────┘                 └──────┬───────┘
       │                                 │                                 │
       ▼                                 ▼                                 ▼
Sends 6-Digit OTP                 - Telegram Channel               Sends Storage Upgrade
Auth Codes to User                - Parallel MTProto Transfer      Ticket Alerts directly
Direct Messages                   - Secret Command Center          to Admin Telegram DM
```

1. **Bot 1 — OTP Service (`OTP_TELEGRAM_BOT_TOKEN`)**:
   - Sends 6-digit dynamic verification codes directly to user Telegram DMs for fast sign-up and login.

2. **Bot 2 — Storage & Admin Bot (`TELEGRAM_BOT_TOKEN`)**:
   - Manages high-speed file chunk uploads, parallel MTProto part transfers, and media streaming to the private Telegram channel (`TELEGRAM_CHANNEL_ID`).
   - Listens for Secret Admin Commands (`/users`, `/user`, `/setlimit`, `/ban`, `/unban`) exclusively from `ADMIN_TELEGRAM_ID`.

3. **Bot 3 — Support Ticket Bot (`TICKET_TELEGRAM_BOT_TOKEN`)**:
   - Forwards user storage quota upgrade requests to Admin Telegram DM with interactive Telegram inline buttons.

---

## ⚡ High-Performance Parallel MTProto Transfer Engines

### 1. FastTelethon Parallel Upload Engine
- Standard Telethon uploads 128KB chunks serially over 1 connection (~800 KB/s - 1.2 MB/s).
- **FastTelethon Parallel Engine** uses Telethon's low-level `SaveBigFilePartRequest` (for files > 10MB) and `SaveFilePartRequest` (for files <= 10MB) with **512 KB part sizes** across **12 concurrent MTProto workers**.
- Upload speeds to Telegram channel reach **10 MB/s to 30 MB/s+**.

### 2. 512 KB Stream Download & Media Player Streaming
- `download_file_stream` uses `iter_download(msg.media, request_size=512*1024)`.
- 512 KB part chunking reduces network RPC roundtrips by 75%, allowing fast HTTP streaming for live video player (`<video>`), audio player (`<audio>`), and file downloads.

### 3. Multi-User Concurrency & FloodWait Protection
- Auto-retry wrapper catches `telethon.errors.FloodWaitError` during peak concurrent traffic from multiple users/friends.
- Sleeps for `e.seconds + 1` automatically and retries without throwing 500 errors to users or blocking the Telegram bot.
- High-capacity semaphores (`Semaphore(40)` for downloads, `Semaphore(20)` for uploads) ensure zero deadlock during multi-user active sessions.

---

## ⌨️ Desktop Keyboard Shortcuts & Drag & Drop

- **`Ctrl + A` / `Cmd + A`**: Selects all files and folders in active directory. Automatically bypassed when typing inside inputs or search fields.
- **`Ctrl + C` / `Cmd + C`**: Copies selected files/folders to virtual clipboard.
- **`Ctrl + X` / `Cmd + X`**: Cuts (moves) selected files/folders to virtual clipboard.
- **`Ctrl + V` / `Cmd + V`**: Pastes copied/cut items into current folder.
- **`Delete` / `Backspace`**: Opens trash confirmation for selected items.
- **`Escape`**: Cancels active multi-selection mode.
- **Desktop Drag & Drop**: Dragging files/folders over browser renders visual drop zone overlay and queues files for upload directly into the current folder.

---

## 🗄️ Database Schema & Data Models

### 1. `public.users` Table
Stores custom user profiles, storage limits, and suspension states.
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | PRIMARY KEY, DEFAULT `gen_random_uuid()` | Unique User ID |
| `telegram_username` | `text` | UNIQUE, NOT NULL | Telegram Username (without `@`) |
| `email` | `text` | NOT NULL | User Email Address |
| `storage_limit` | `int8` | DEFAULT `32212254720` (30GB) | Allocated Storage Quota in Bytes |
| `used_storage` | `int8` | DEFAULT `0` | Current Used Storage in Bytes |
| `is_banned` | `boolean`| DEFAULT `false` | Account Suspension Status |
| `created_at` | `timestamptz` | DEFAULT `now()` | Registration Timestamp |
| `updated_at` | `timestamptz` | DEFAULT `now()` | Profile Update Timestamp |

### 2. `public.folders` Table
Hierarchical folder structure supporting infinite nesting and soft deletion.
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | PRIMARY KEY, DEFAULT `gen_random_uuid()` | Unique Folder ID |
| `user_id` | `uuid` | FOREIGN KEY -> `users.id` ON DELETE CASCADE | Owner User ID |
| `parent_id` | `uuid` | FOREIGN KEY -> `folders.id` ON DELETE CASCADE, NULLABLE | Parent Folder ID (NULL = Root) |
| `name` | `text` | NOT NULL | Folder Name |
| `is_trash` | `boolean`| DEFAULT `false` | Soft Delete Flag |
| `is_shared` | `boolean`| DEFAULT `false` | Shareable Access Flag |
| `created_at` | `timestamptz` | DEFAULT `now()` | Creation Timestamp |
| `updated_at` | `timestamptz` | DEFAULT `now()` | Modification Timestamp |

### 3. `public.files` Table
File metadata records linked to underlying Telegram channel message IDs.
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | PRIMARY KEY, DEFAULT `gen_random_uuid()` | Unique File ID |
| `user_id` | `uuid` | FOREIGN KEY -> `users.id` ON DELETE CASCADE | Owner User ID |
| `folder_id` | `uuid` | FOREIGN KEY -> `folders.id` ON DELETE CASCADE, NULLABLE | Enclosing Folder ID (NULL = Root) |
| `name` | `text` | NOT NULL | File Name |
| `mime_type` | `text` | NULLABLE | MIME Type String |
| `size` | `int8` | NOT NULL | File Size in Bytes |
| `telegram_message_id`| `int8` | NOT NULL | Telegram Channel Message ID |
| `telegram_file_id` | `text` | NULLABLE | Telegram Native File ID |
| `is_starred` | `boolean`| DEFAULT `false` | Starred Favorite Flag |
| `is_trash` | `boolean`| DEFAULT `false` | Soft Delete Flag |
| `is_shared` | `boolean`| DEFAULT `false` | Public Sharing Flag |
| `created_at` | `timestamptz` | DEFAULT `now()` | Upload Timestamp |
| `updated_at` | `timestamptz` | DEFAULT `now()` | Modification / Trash Timestamp |

---

## 🌐 DataForge Cloud VPS Deployment & Migration Guide

When hosting your **DataForge Database Platform** live on a Cloud VPS to serve as a 24/7 centralized database manager for all your projects:

### 1. Update `backend/.env` Credentials
You only need to update the database variables in `backend/.env`:
```env
DATAFORGE_DB_HOST=YOUR_VPS_PUBLIC_IP     # e.g., 159.65.xxx.xxx or db.yourdomain.com
DATAFORGE_DB_PORT=5432                   # PostgreSQL port
DATAFORGE_DB_NAME=u_claude_drive         # Project name in VPS DataForge
DATAFORGE_DB_USER=postgres               # DataForge PostgreSQL user
DATAFORGE_DB_PASSWORD=your_vps_password  # VPS DataForge PostgreSQL password
```

### 2. Table Creation on VPS DataForge
- **Automatic**: Server startup executes `CREATE TABLE IF NOT EXISTS` via `DataForgeClient`.
- **Manual**: Paste contents of [dataforge_schema.sql](file:///media/udoy/New%20Volume/Development/Project_Test/dataforge_schema.sql) in VPS DataForge **SQL Editor** (`http://YOUR_VPS_IP:4000`) and run.

### 3. VPS Firewall Requirement
Ensure port 5432 is open on your VPS firewall (`sudo ufw allow 5432/tcp`) so remote application servers (e.g. Hugging Face Spaces or local environment) can reach the database.

---

## 🚀 Production Deployment Guidelines (Hugging Face / Render / Docker)

### Hugging Face Spaces (Port 7860):
- Configure Space SDK as **Docker**.
- Set Repository Secrets for all Telegram & DataForge environment variables (`DATAFORGE_DB_HOST`, `DATAFORGE_DB_PORT`, `DATAFORGE_DB_NAME`, `DATAFORGE_DB_USER`, `DATAFORGE_DB_PASSWORD`).
- The included multi-stage Dockerfile builds Vite frontend assets and launches Uvicorn on port `7860`.

---

## 📜 License & Copyright

Copyright (c) 2026 Udoy Mistry. All rights reserved.

This project is source-available but protected under a strict **Personal Proprietary & Non-Commercial License**. Personal deployment is allowed, but modifications, derivative works, and commercial/profit-making usage are strictly prohibited.
