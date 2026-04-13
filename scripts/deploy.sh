#!/bin/bash
# ============================================================
# DentaFlow — скрипт деплоя для Timeweb Cloud VPS
# ============================================================
set -e

echo "=== DentaFlow Deployment ==="

# ── 1. Сборка фронтенда ──────────────────────────────────────
echo "Building frontend..."
cd frontend && npm ci && npm run build && cd ..

# ── 2. Копирование статики в Docker-том ──────────────────────
echo "Preparing static files..."
docker compose -f docker-compose.prod.yml down nginx 2>/dev/null || true
docker run --rm \
  -v "$(pwd)/frontend/dist:/src" \
  -v dentaflow_frontend_dist:/dst \
  alpine sh -c "rm -rf /dst/* && cp -r /src/* /dst/"

# ── 3. Применение миграций ────────────────────────────────────
echo "Running migrations..."
docker compose -f docker-compose.prod.yml run --rm backend alembic upgrade head

# ── 4. Seed начальных пользователей ───────────────────────────
echo "Seeding database..."
docker compose -f docker-compose.prod.yml run --rm backend python -m app.utils.seed

# ── 5. Запуск всех сервисов ───────────────────────────────────
echo "Starting services..."
docker compose -f docker-compose.prod.yml up -d

echo "=== Deployment complete ==="
