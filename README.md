---
title: Universal Cloud Drive
emoji: ☁️
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# ☁️ Universal Cloud Drive

**Universal Cloud Drive** is a high-performance, unlimited cloud storage web application built with **React + Vite**, **FastAPI**, **Supabase**, and **Telegram MTProto Cloud Storage**.

It transforms private Telegram channels into an enterprise-grade cloud storage system with single-file sizes up to **2 GB**, fast parallel upload/download engines, public sharing, live media preview streaming, multi-user concurrency protection, and full desktop keyboard shortcut integration.

---

## ✨ Features & Highlights

- ⚡ **FastTelethon Parallel Upload Engine**: 12-worker MTProto parallel chunk uploader delivering **10 MB/s – 30 MB/s+** upload speed to Telegram channels.
- 🚀 **512 KB Stream Download**: High-throughput MTProto stream download engine with 512 KB part chunking for fast video/audio streaming and file downloads.
- 📐 **Strict 2 GB File Limit & Unlimited Queue**: Enforces an exact 2 GB cap per file (`2,147,483,648 bytes`) while allowing unlimited total batch queuing (e.g., selecting thousands of files at once).
- 🖱️ **Desktop Drag & Drop Upload**: Drag files or folders directly from desktop into the browser window with visual glassmorphism drop zone overlay.
- ⌨️ **Desktop Keyboard Shortcuts**:
  - `Ctrl + A` / `Cmd + A`: Select all items in current folder.
  - `Ctrl + C` / `Cmd + C`: Copy selected files/folders.
  - `Ctrl + X` / `Cmd + X`: Cut (Move) selected files/folders.
  - `Ctrl + V` / `Cmd + V`: Paste clipboard items into active folder.
  - `Delete` / `Backspace`: Move selected items to Trash.
  - `Escape`: Cancel active selection mode.
- 🛡️ **Multi-User Concurrency Protection**: Automatic `FloodWaitError` retry handling and high-capacity semaphores to support simultaneous active sessions from multiple friends/users without bot blocks or 500 errors.
- 📦 **Recursive Bulk Sequential Download**: Resolves all nested files inside selected folders and triggers sequential browser downloads without triggering popup blockers.
- 🎬 **Live Media Streaming & Preview**: Live video player, audio player, image viewer, and PDF document viewer powered by Range header streaming.
- 🤖 **3-Bot Microservice Architecture**:
  - **Bot 1 (OTP Auth)**: Delivers 6-digit verification codes to user Telegram DMs.
  - **Bot 2 (Storage & Admin)**: Manages Telegram channel storage & Secret Admin Command Center (`/users`, `/setlimit`, `/ban`, `/unban`).
  - **Bot 3 (Support Ticket)**: Forwards user storage quota upgrade requests to Admin Telegram DM.

---

## 🛠️ Technology Stack

- **Frontend**: React 18, Vite 5, Tailwind CSS, Lucide React, Axios.
- **Backend**: Python 3.10+, FastAPI, Starlette, Uvicorn, psycopg2.
- **Telegram Storage**: Telethon (Async MTProto Client).
- **Database & Auth**: DataForge PostgreSQL (`u_claude_drive`) + Custom Telegram OTP Auth.
- **Deployment**: Docker, Hugging Face Spaces (Port `7860`), Render, Linux VPS.

---

## 🚀 Quickstart & Local Installation

### Prerequisites
- Python 3.10+
- Node.js 18+ & `npm`
- Telegram API Credentials (`TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, 3 Bot Tokens)
- DataForge Database Platform (`DATAFORGE_DB_HOST`, `DATAFORGE_DB_PORT`, `DATAFORGE_DB_NAME`)

---

### 📌 How to Obtain Telegram API Credentials & IDs

1. **Telegram API ID & API Hash (`TELEGRAM_API_ID`, `TELEGRAM_API_HASH`)**:
   - Visit [my.telegram.org](https://my.telegram.org) and log in with your Telegram phone number.
   - Go to **API Development Tools**.
   - Fill out the short form to create an app and copy your `TELEGRAM_API_ID` (numeric) and `TELEGRAM_API_HASH` (string).

2. **Telegram Bot Tokens (3 Dedicated Bots)**:
   - Open Telegram and start a chat with [@BotFather](https://t.me/BotFather).
   - Send `/newbot` three times to create 3 dedicated bot instances:
     - **Bot 1 (Storage Bot)** → `TELEGRAM_BOT_TOKEN` (Manages channel file storage & admin commands)
     - **Bot 2 (OTP Auth Bot)** → `OTP_TELEGRAM_BOT_TOKEN` (Sends 6-digit login codes to users)
     - **Bot 3 (Support Ticket Bot)** → `TICKET_TELEGRAM_BOT_TOKEN` (Sends storage upgrade alerts to admin)

3. **Telegram Channel ID (`TELEGRAM_CHANNEL_ID`)**:
   - Create a new **Private Telegram Channel**.
   - Add your **Storage Bot** (`TELEGRAM_BOT_TOKEN`) as an **Administrator** with permission to post messages.
   - Forward any message from your channel to [@userinfobot](https://t.me/userinfobot) or [@raw_data_bot](https://t.me/raw_data_bot) to retrieve the Channel ID (starts with `-100`, e.g., `-1001234567890`).

4. **Admin Telegram User ID (`ADMIN_TELEGRAM_ID`)**:
   - Send `/start` to [@userinfobot](https://t.me/userinfobot) in Telegram.
   - Copy your personal numeric Telegram User ID (e.g., `12345678`). Users with this ID gain exclusive access to Secret Admin Commands (`/users`, `/setlimit`, `/ban`, `/unban`, `/purgechannel`).

### 1. Clone & Set Up Environment Variables
Create `.env` inside `backend/` directory:
```env
TELEGRAM_API_ID=123456
TELEGRAM_API_HASH=your_api_hash
TELEGRAM_BOT_TOKEN=your_storage_bot_token
OTP_TELEGRAM_BOT_TOKEN=your_otp_bot_token
TICKET_TELEGRAM_BOT_TOKEN=your_ticket_bot_token
TELEGRAM_CHANNEL_ID=-Your Telegram Channel ID
ADMIN_TELEGRAM_ID=Your Telegram Chat ID

DATAFORGE_DB_HOST=Your Host IP
DATAFORGE_DB_PORT=Your Host Port
DATAFORGE_DB_NAME=Your Database Name
DATAFORGE_DB_USER=Database User
DATAFORGE_DB_PASSWORD=Your Database Password

JWT_SECRET_KEY=your_random_secret_key
```

Create `.env` inside `frontend/` directory:
```env
VITE_API_BASE_URL=http://localhost:8000
```

### 2. Run Background Services & Custom Ports
Execute the automated background launcher:
```bash
chmod +x start.sh stop.sh

# Run with default ports (Backend: 8000, Frontend: 5173) in background:
./start.sh

# Or specify custom ports (e.g. Backend: 8080, Frontend: 3000):
./start.sh 8080 3000
```
> 💡 Both services will run in the background. You can safely close your terminal.

### 3. Stop Services & Free Ports
To gracefully stop all background services and free active ports:
```bash
./stop.sh
```

---

## 🌐 DataForge Cloud VPS Migration Guide

When you host your **DataForge Database Platform** live on a Cloud VPS (so it runs 24/7 for all your projects), connect this application by updating only the database section in `backend/.env`:

| Variable | Local Value | Cloud VPS Value | Description |
| :--- | :--- | :--- | :--- |
| `DATAFORGE_DB_HOST` | `localhost` | `YOUR_VPS_PUBLIC_IP` (e.g. `157.245.xxx.xxx`) | Public IP or domain of your VPS |
| `DATAFORGE_DB_PORT` | `5432` | `5432` | PostgreSQL port |
| `DATAFORGE_DB_NAME` | `u_claude_drive` | `u_claude_drive` | Project/Database name created on VPS DataForge |
| `DATAFORGE_DB_USER` | `postgres` | `postgres` | DataForge PostgreSQL user |
| `DATAFORGE_DB_PASSWORD` | `dataforge_secure_2026` | `YOUR_VPS_DB_PASSWORD` | DataForge PostgreSQL password on VPS |

### Rebuilding Tables on VPS DataForge:
- **Option 1 (Automatic)**: Updating `.env` and launching the backend automatically creates all tables (`users`, `folders`, `files`) and indexes via `DataForgeClient`.
- **Option 2 (Manual SQL)**: In VPS DataForge UI (`http://YOUR_VPS_IP:4000`), open **SQL Editor** and execute the contents of [dataforge_schema.sql](file:///media/udoy/New%20Volume/Development/Project_Test/dataforge_schema.sql).

---

## 🐳 Docker & Hugging Face Spaces Deployment

The project includes a multi-stage production Dockerfile configured for Hugging Face Spaces (Port `7860`).

### Deploy to Hugging Face Spaces:
1. Create a new Space on Hugging Face with **Docker** SDK.
2. Push repository files to your Space.
3. Configure Space **Repository Secrets**:
   - `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_BOT_TOKEN`, `OTP_TELEGRAM_BOT_TOKEN`, `TICKET_TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_ID`, `ADMIN_TELEGRAM_ID`, `DATAFORGE_DB_HOST`, `DATAFORGE_DB_PORT`, `DATAFORGE_DB_NAME`, `DATAFORGE_DB_USER`, `DATAFORGE_DB_PASSWORD`, `JWT_SECRET_KEY`.
4. The Space will automatically build the React frontend into `./frontend/dist`, launch FastAPI on port `7860`, and serve the app!

---

## 📜 Copyright & License

Copyright (c) 2026 Udoy Mistry. All rights reserved.

This project is source-available but protected under a **Personal Proprietary & Non-Commercial License**. Personal deployment is allowed, but commercial monetization or unauthorized distribution is strictly prohibited.
