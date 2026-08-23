#!/bin/bash
set -e

echo "Waiting for the app service to be ready..."
sleep 5

echo "Running database migrations..."
docker compose -f docker/docker-compose.yml exec app alembic upgrade head

echo "Creating admin user..."
docker compose -f docker/docker-compose.yml exec app mkindayzir setup admin --email admin@localhost --password admin

echo ""
echo "============================================"
echo "  Mkindayzir is ready!"
echo "  URL: http://localhost:3000"
echo "  Email: admin@localhost"
echo "  Password: admin"
echo "============================================"
