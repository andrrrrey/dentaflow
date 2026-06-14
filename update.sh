#!/bin/bash
# ──────────────────────────────────────────────────
# DentaFlow — обновление
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

  echo "→ Запуск бэкенда и celery..."
  $COMPOSE up -d --no-deps --remove-orphans --force-recreate \
    backend celery_worker celery_worker_segments celery_beat

  echo "→ Перезапуск nginx..."
  $COMPOSE restart nginx

  echo -n "→ Ожидание готовности бэкенда"
  for i in $(seq 1 30); do
    if $COMPOSE logs backend 2>&1 | grep -q "Application startup complete"; then
      echo " готов!"
      break
    fi
    echo -n "."
    sleep 2
    if [ "$i" = "30" ]; then
      echo ""
      echo "⚠ Бэкенд долго стартует. Логи:"
      $COMPOSE logs backend --tail=20
      exit 1
    fi
  done
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
echo "✓ Готово! Система доступна."
