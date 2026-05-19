#!/bin/bash
# ──────────────────────────────────────────────────
# DentaFlow — обновление из git и перезапуск
#
# ./update.sh           — всё (бэк + фронт)
# ./update.sh back      — только бэкенд + celery
# ./update.sh front     — только фронтенд
# ──────────────────────────────────────────────────
set -e
cd "$(dirname "$0")"

COMPOSE="docker compose -f docker-compose.prod.yml"
PROJECT="dentaflow"

MODE="${1:-all}"

echo "→ git pull..."
git pull origin main

# ── Бэкенд ────────────────────────────────────────
if [ "$MODE" = "all" ] || [ "$MODE" = "back" ]; then
  echo "→ Пересборка бэкенда..."
  $COMPOSE build backend

  echo "→ Запуск бэкенда, celery-worker, celery-beat..."
  $COMPOSE up -d --no-deps backend celery_worker celery_beat

  echo "→ Миграции БД..."
  $COMPOSE exec backend alembic upgrade head
fi

# ── Фронтенд ──────────────────────────────────────
if [ "$MODE" = "all" ] || [ "$MODE" = "front" ]; then
  echo "→ Сборка фронтенда..."
  docker run --rm \
    -v "$(pwd)/frontend":/app \
    -v "${PROJECT}_frontend_node_modules":/app/node_modules \
    -v "${PROJECT}_frontend_dist":/dist \
    node:20-alpine sh -c "cd /app && npm install --prefer-offline --silent && npm run build && cp -rf dist/. /dist/"

  echo "→ Перезапуск nginx..."
  $COMPOSE restart nginx
fi

echo ""
echo "✓ Готово! Логи: docker compose -f docker-compose.prod.yml logs -f backend"
