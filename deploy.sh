#!/bin/bash
# ─────────────────────────────────────────────────────
# DentaFlow deploy
#
# ./deploy.sh           — бэкенд + фронтенд (~2-3 мин)
# ./deploy.sh --fast    — бэкенд + фронтенд без tsc (~1 мин)
# ./deploy.sh --back    — только бэкенд (~30 сек)
# ./deploy.sh --front   — только фронтенд
# ─────────────────────────────────────────────────────
set -e

COMPOSE="docker compose -f docker-compose.prod.yml"
DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT=$(basename "$DIR")   # dentaflow
cd "$DIR"

FAST=0; BACK_ONLY=0; FRONT_ONLY=0
[ "$1" = "--fast"  ] && FAST=1
[ "$1" = "--back"  ] && BACK_ONLY=1
[ "$1" = "--front" ] && FRONT_ONLY=1

echo "→ git pull..."
git pull origin main

# ── Backend ────────────────────────────────────────────
if [ $FRONT_ONLY -eq 0 ]; then
  echo "→ Backend rebuild (~30 сек, pip закеширован)..."
  $COMPOSE up -d --build backend celery_worker celery_beat telegram_bot
fi

# ── Frontend ───────────────────────────────────────────
if [ $BACK_ONLY -eq 0 ]; then
  if [ $FAST -eq 1 ]; then
    echo "→ Frontend fast build (~1 мин, без type check)..."
    BUILD="npm install --prefer-offline --silent && npx vite build && cp -rf dist/. /dist/"
  else
    echo "→ Frontend build (~2-3 мин)..."
    BUILD="npm install --prefer-offline --silent && npm run build && cp -rf dist/. /dist/"
  fi

  # node_modules и vite-кеш живут в volume — npm install быстрый при повторных запусках
  docker run --rm \
    -v "$DIR/frontend":/app \
    -v "${PROJECT}_frontend_node_modules":/app/node_modules \
    -v "${PROJECT}_frontend_dist":/dist \
    node:20-alpine sh -c "cd /app && $BUILD"

  $COMPOSE restart nginx
fi

# ── Migrations ─────────────────────────────────────────
echo "→ Migrations..."
$COMPOSE exec backend alembic upgrade head

echo ""
echo "✓ Готово"
