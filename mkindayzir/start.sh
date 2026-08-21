#!/bin/bash
# Start Mkindayzir - runs both Next.js and Python AI service

echo "=================================="
echo "  Starting Mkindayzir"
echo "  Your Operations, Your Server"
echo "=================================="
echo ""

# Check if Python is available
if command -v python3 &> /dev/null; then
    echo "[AI] Starting Python AI service on port 8000..."
    cd python-ai
    pip install -q -r requirements.txt 2>/dev/null
    python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 &
    AI_PID=$!
    cd ..
    echo "[AI] Python AI service started (PID: $AI_PID)"
else
    echo "[AI] Python3 not found - AI service will not be available"
    echo "[AI] Install Python 3.12+ and run: pip install -r python-ai/requirements.txt"
    AI_PID=""
fi

echo ""
echo "[APP] Starting Next.js on port 3000..."
echo ""

# Start Next.js
pnpm start &
NEXT_PID=$!

# Handle shutdown
cleanup() {
    echo ""
    echo "Shutting down Mkindayzir..."
    [ -n "$AI_PID" ] && kill $AI_PID 2>/dev/null
    kill $NEXT_PID 2>/dev/null
    exit 0
}
trap cleanup SIGINT SIGTERM

echo ""
echo "=================================="
echo "  Mkindayzir is running!"
echo "  App:  http://localhost:3000"
echo "  AI:   http://localhost:8000"
echo "=================================="
echo ""

wait
