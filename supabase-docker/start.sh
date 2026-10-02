#!/bin/sh
set -e

echo "==> Starting Supabase stack..."
docker compose up -d

echo "==> Waiting for DB to be healthy..."
until docker exec supabase-db pg_isready -U postgres -h localhost -q; do
  printf "."; sleep 3
done
echo " DB ready."

echo "==> Waiting for Storage to be healthy..."
until docker inspect --format='{{.State.Health.Status}}' supabase-storage 2>/dev/null | grep -q "healthy"; do
  printf "."; sleep 3
done
echo " Storage ready."

echo "==> Applying app migrations..."
docker exec supabase-db sh /usr/local/bin/apply-migrations.sh

echo "==> Initializing Logflare schema..."
./init-logflare-schema.sh

echo "==> Restarting analytics..."
docker compose restart analytics

echo ""
echo "Done! Stack is running."
echo "  Studio:   http://localhost:3000"
echo "  API:      http://localhost:8000"
echo "  Frontend: http://localhost:5173"
