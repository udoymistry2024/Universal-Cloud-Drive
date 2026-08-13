#!/bin/bash

# ========================================================
# CloudDrive - Background Service Stopper
# Gracefully stops Backend & Frontend background processes and frees ports
# ========================================================

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOGS_DIR="$PROJECT_ROOT/logs"

echo "========================================================"
echo "🛑 Stopping CloudDrive Background Services..."
echo "========================================================"

# Stop Backend via PID if file exists
if [ -f "$LOGS_DIR/backend.pid" ]; then
    BACKEND_PID=$(cat "$LOGS_DIR/backend.pid")
    if [ -n "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
        echo "📡 Terminating Backend process (PID: $BACKEND_PID)..."
        kill -9 "$BACKEND_PID" 2>/dev/null || true
    fi
    rm -f "$LOGS_DIR/backend.pid"
fi

# Stop Frontend via PID if file exists
if [ -f "$LOGS_DIR/frontend.pid" ]; then
    FRONTEND_PID=$(cat "$LOGS_DIR/frontend.pid")
    if [ -n "$FRONTEND_PID" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
        echo "💻 Terminating Frontend process (PID: $FRONTEND_PID)..."
        kill -9 "$FRONTEND_PID" 2>/dev/null || true
    fi
    rm -f "$LOGS_DIR/frontend.pid"
fi

# Read recorded ports or use defaults
BACKEND_PORT="8000"
FRONTEND_PORT="5173"

if [ -f "$LOGS_DIR/backend.port" ]; then
    BACKEND_PORT=$(cat "$LOGS_DIR/backend.port")
    rm -f "$LOGS_DIR/backend.port"
fi

if [ -f "$LOGS_DIR/frontend.port" ]; then
    FRONTEND_PORT=$(cat "$LOGS_DIR/frontend.port")
    rm -f "$LOGS_DIR/frontend.port"
fi

# Force kill any process using backend or frontend ports
echo "🔌 Cleaning up ports ($BACKEND_PORT & $FRONTEND_PORT)..."
fuser -k "${BACKEND_PORT}/tcp" 2>/dev/null || true
fuser -k "${FRONTEND_PORT}/tcp" 2>/dev/null || true

# Also kill standard default ports to guarantee clean state
fuser -k 8000/tcp 2>/dev/null || true
fuser -k 5173/tcp 2>/dev/null || true

sleep 1

echo "========================================================"
echo "✅ CloudDrive services have been completely stopped!"
echo "   - Backend Port ($BACKEND_PORT) : FREED"
echo "   - Frontend Port ($FRONTEND_PORT): FREED"
echo "========================================================"
