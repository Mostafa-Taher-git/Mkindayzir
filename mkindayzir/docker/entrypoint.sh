#!/bin/bash
set -e

echo "Starting Mkindayzir..."

# Run database migrations
cd /app/backend && alembic upgrade head

# Start FastAPI backend
cd /app/backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# Start Next.js server (standalone output)
cd /app
if [ -f ".next/standalone/server.js" ]; then
    node .next/standalone/server.js &
    FRONTEND_PID=$!
else
    echo "WARNING: .next/standalone not found. Frontend may not be built."
fi

# Wait for backend to be ready
sleep 3

echo "============================================"
echo "  Mkindayzir is ready!"
echo "  URL: http://localhost:80"
echo "============================================"

# Start nginx (proxies :80 -> frontend:3000 + /api -> backend:8000)
nginx -g 'daemon off;'
