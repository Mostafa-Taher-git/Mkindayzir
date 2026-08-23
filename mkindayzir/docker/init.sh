#!/bin/bash
set -e

echo "Waiting for services to be ready..."
sleep 5

echo "Running database migrations..."
docker compose exec backend alembic upgrade head

echo "Creating admin user..."
docker compose exec backend python -m app.cli.setup --email admin@localhost --password admin || true

echo ""
echo "============================================"
echo "  Mkindayzir is ready!"
echo "  URL: http://localhost:3000"
echo "  Email: admin@localhost"
echo "  Password: admin"
echo "============================================"
