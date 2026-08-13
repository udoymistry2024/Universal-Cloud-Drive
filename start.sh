#!/bin/bash

# ========================================================
# CloudDrive - Single Command Launcher
# Starts both FastAPI Backend and Vite Frontend simultaneously
# ========================================================

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

cleanup() {
    # Unset trap to prevent signal handler recursion
    trap - SIGINT SIGTERM EXIT
    echo ""
    echo "🛑 Shutting down CloudDrive services..."
    kill 0 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# Clean up any leftover processes on ports 8000 and 5173
fuser -k 8000/tcp 2>/dev/null || true
fuser -k 5173/tcp 2>/dev/null || true
sleep 1

echo "========================================================"
echo "🚀 Launching CloudDrive Full-Stack Application"
echo "========================================================"

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

# Start Backend (FastAPI listening on 0.0.0.0 for local network access)
echo "📡 Starting Backend (FastAPI) on http://0.0.0.0:8000 ..."
(cd "$BACKEND_DIR" && .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload) &

# Wait briefly for backend to initialize
sleep 2

# Start Frontend (Vite React listening on 0.0.0.0)
echo "💻 Starting Frontend (Vite React) on http://localhost:5173 ..."
(cd "$FRONTEND_DIR" && npm run dev) &

echo ""
echo "========================================================"
echo "🎉 CloudDrive is running successfully!"
echo "👉 Local Access : http://localhost:5173"
echo "👉 Network IP   : http://192.168.0.105:5173"
echo "👉 Backend API  : http://192.168.0.105:8000"
echo "========================================================"
echo "Press Ctrl+C at any time to stop both servers."
echo ""

wait
