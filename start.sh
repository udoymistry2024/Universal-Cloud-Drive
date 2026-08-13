#!/bin/bash

# ========================================================
# CloudDrive - Background Service Launcher
# Starts FastAPI Backend & Vite Frontend as detached background processes
# ========================================================

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
LOGS_DIR="$PROJECT_ROOT/logs"

mkdir -p "$LOGS_DIR"

# Handle Interactive Prompt or Command-line Arguments
if [ -t 0 ] && [ -z "$1" ]; then
    echo "========================================================"
    echo "⚙️  CloudDrive Port Configuration"
    echo "========================================================"
    echo "Press Enter to skip and use default ports (Backend: 8000, Frontend: 5173):"
    echo ""
    read -r -t 6 -p "👉 Enter Backend Port [Default: 8000]: " USER_B_PORT
    echo ""
    read -r -t 6 -p "👉 Enter Frontend Port [Default: 5173]: " USER_F_PORT
    echo ""
    BACKEND_PORT="${USER_B_PORT:-8000}"
    FRONTEND_PORT="${USER_F_PORT:-5173}"
else
    BACKEND_PORT="${1:-8000}"
    FRONTEND_PORT="${2:-5173}"
fi

# Validate that ports are positive integers
if ! [[ "$BACKEND_PORT" =~ ^[0-9]+$ ]] || [ "$BACKEND_PORT" -lt 1 ] || [ "$BACKEND_PORT" -gt 65535 ]; then
    echo "❌ Invalid Backend Port: $BACKEND_PORT (must be a number between 1 and 65535)"
    exit 1
fi

if ! [[ "$FRONTEND_PORT" =~ ^[0-9]+$ ]] || [ "$FRONTEND_PORT" -lt 1 ] || [ "$FRONTEND_PORT" -gt 65535 ]; then
    echo "❌ Invalid Frontend Port: $FRONTEND_PORT (must be a number between 1 and 65535)"
    exit 1
fi

echo "========================================================"
echo "🚀 Launching CloudDrive Background Services"
echo "========================================================"
echo "📡 Backend Port  : $BACKEND_PORT"
echo "💻 Frontend Port : $FRONTEND_PORT"
echo "========================================================"

# Free up ports before starting
fuser -k "${BACKEND_PORT}/tcp" 2>/dev/null || true
fuser -k "${FRONTEND_PORT}/tcp" 2>/dev/null || true
sleep 1

# Check Python environment
if [ ! -d "$BACKEND_DIR/.venv" ]; then
    echo "❌ Virtual environment not found in $BACKEND_DIR/.venv"
    echo "Creating virtual environment and installing requirements..."
    python3 -m venv "$BACKEND_DIR/.venv"
    "$BACKEND_DIR/.venv/bin/pip" install -r "$BACKEND_DIR/requirements.txt"
fi

# Check Node modules
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    (cd "$FRONTEND_DIR" && npm install)
fi

# Start Backend in detached background session
echo "📡 Starting Backend (FastAPI) on http://0.0.0.0:$BACKEND_PORT ..."
cd "$BACKEND_DIR"
setsid nohup .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port "$BACKEND_PORT" </dev/null > "$LOGS_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
disown $BACKEND_PID 2>/dev/null || true
echo "$BACKEND_PID" > "$LOGS_DIR/backend.pid"
echo "$BACKEND_PORT" > "$LOGS_DIR/backend.port"
cd "$PROJECT_ROOT"

# Wait briefly for backend initialization
sleep 2

# Start Frontend in detached background session
echo "💻 Starting Frontend (Vite React) on http://localhost:$FRONTEND_PORT ..."
cd "$FRONTEND_DIR"
setsid nohup npm run dev -- --host 0.0.0.0 --port "$FRONTEND_PORT" </dev/null > "$LOGS_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
disown $FRONTEND_PID 2>/dev/null || true
echo "$FRONTEND_PID" > "$LOGS_DIR/frontend.pid"
echo "$FRONTEND_PORT" > "$LOGS_DIR/frontend.port"
cd "$PROJECT_ROOT"

sleep 1

# Resolve Local IP Address
LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
if [ -z "$LOCAL_IP" ]; then
    LOCAL_IP="127.0.0.1"
fi

echo ""
echo "========================================================"
echo "🎉 CloudDrive is now running in the BACKGROUND!"
echo "========================================================"
echo "👉 Local Access  : http://localhost:$FRONTEND_PORT"
echo "👉 Network IP    : http://$LOCAL_IP:$FRONTEND_PORT"
echo "👉 Backend API   : http://$LOCAL_IP:$BACKEND_PORT"
echo "========================================================"
echo "📝 Log Files:"
echo "   - Backend Log  : $LOGS_DIR/backend.log"
echo "   - Frontend Log : $LOGS_DIR/frontend.log"
echo "========================================================"
echo "💡 To stop the server and free ports at any time, run:"
echo "   ./stop.sh"
echo "========================================================"
echo "You can safely close this terminal window now."
echo ""
