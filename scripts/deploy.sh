#!/bin/bash
# ============================================================
# DentaFlow — скрипт деплоя для Timeweb Cloud VPS
# ============================================================
set -e

COMPOSE_FILE="docker-compose.prod.yml"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "$PROJECT_DIR"

echo "=== DentaFlow Deployment ==="
echo "Директория проекта: $PROJECT_DIR"

# ── 1. Сборка фронтенда ──────────────────────────────────────
echo ""
echo "[1/5] Сборка фронтенда..."
cd frontend && npm ci && npm run build && cd ..

# ── 2. Копирование статики в Docker-том ──────────────────────
echo ""
echo "[2/5] Подготовка статических файлов..."
docker compose -f "$COMPOSE_FILE" down nginx 2>/dev/null || true
docker run --rm \
  -v "$(pwd)/frontend/dist:/src" \
  -v dentaflow_frontend_dist:/dst \
  alpine sh -c "rm -rf /dst/* && cp -r /src/* /dst/"

# ── 3. Применение миграций ────────────────────────────────────
echo ""
echo "[3/5] Применение миграций..."
docker compose -f "$COMPOSE_FILE" run --rm backend alembic upgrade head

# ── 4. Seed начальных пользователей ───────────────────────────
echo ""
echo "[4/5] Создание начальных пользователей..."
docker compose -f "$COMPOSE_FILE" run --rm backend python -m app.utils.seed

# ── 5. Запуск всех сервисов ───────────────────────────────────
echo ""
echo "[5/5] Запуск сервисов..."
docker compose -f "$COMPOSE_FILE" up -d

echo ""
echo "=== Deployment complete ==="
echo "Сервисы запущены. Проверка: docker compose -f $COMPOSE_FILE ps"
