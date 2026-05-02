#!/bin/bash
# DentaFlow fast deploy script
# Usage:
#   ./deploy.sh            — smart deploy (detects what changed)
#   ./deploy.sh --full     — force full rebuild of everything
#   ./deploy.sh --back     — backend only (restart, no rebuild)
#   ./deploy.sh --front    — frontend only
#   ./deploy.sh --deps     — rebuild backend image (when requirements.txt changed)

set -e

COMPOSE="docker compose -f docker-compose.prod.yml"
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}→${NC} $1"; }
ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}!${NC} $1"; }

# ── Pull latest code ──────────────────────────────────────────────────────────
log "Pulling latest code..."
git pull origin main
ok "Code updated"

# ── Determine what changed ────────────────────────────────────────────────────
CHANGED=$(git diff HEAD@{1} HEAD --name-only 2>/dev/null || git diff HEAD~1 HEAD --name-only 2>/dev/null || echo "all")

BACKEND_DEPS=$(echo "$CHANGED" | grep -c "backend/requirements.txt" || true)
BACKEND_CODE=$(echo "$CHANGED" | grep -c "^backend/" || true)
FRONTEND_CHANGED=$(echo "$CHANGED" | grep -c "^frontend/" || true)
COMPOSE_CHANGED=$(echo "$CHANGED" | grep -c "docker-compose" || true)
MIGRATIONS=$(echo "$CHANGED" | grep -c "alembic/versions/" || true)

# ── Parse flags ───────────────────────────────────────────────────────────────
MODE="smart"
[ "$1" = "--full"  ] && MODE="full"
[ "$1" = "--back"  ] && MODE="back"
[ "$1" = "--front" ] && MODE="front"
[ "$1" = "--deps"  ] && MODE="deps"

# ── Deploy ────────────────────────────────────────────────────────────────────

deploy_backend_restart() {
    log "Restarting backend (no rebuild)..."
    $COMPOSE restart backend celery_worker celery_beat telegram_bot
    ok "Backend restarted in seconds"
}

deploy_backend_rebuild() {
    log "Rebuilding backend image (requirements.txt changed)..."
    $COMPOSE up -d --build backend celery_worker celery_beat telegram_bot
    ok "Backend rebuilt and started"
}

deploy_frontend() {
    log "Building frontend (this takes ~1-2 min)..."
    # Build using node:20-alpine with cached node_modules volume
    # Much faster than rebuilding the Docker image each time
    docker run --rm \
        -v "$DIR/frontend":/app \
        -v dentaflow_frontend_node_modules:/app/node_modules \
        -v dentaflow_frontend_dist:/dist \
        node:20-alpine \
        sh -c "cd /app && npm install --prefer-offline --silent && npm run build && cp -rf dist/. /dist/ && echo 'Frontend built and deployed'"
    $COMPOSE restart nginx
    ok "Frontend deployed"
}

run_migrations() {
    log "Running DB migrations..."
    $COMPOSE exec backend alembic upgrade head
    ok "Migrations done"
}

case "$MODE" in
  full)
    log "Full rebuild requested"
    $COMPOSE up -d --build backend celery_worker celery_beat telegram_bot
    deploy_frontend
    $COMPOSE restart nginx
    run_migrations
    ;;
  back)
    deploy_backend_restart
    run_migrations
    ;;
  deps)
    deploy_backend_rebuild
    run_migrations
    ;;
  front)
    deploy_frontend
    ;;
  smart)
    DEPLOYED=0

    if [ "$COMPOSE_CHANGED" -gt 0 ]; then
        warn "docker-compose changed — doing full restart"
        $COMPOSE up -d
        DEPLOYED=1
    fi

    if [ "$BACKEND_DEPS" -gt 0 ]; then
        deploy_backend_rebuild
        DEPLOYED=1
    elif [ "$BACKEND_CODE" -gt 0 ]; then
        deploy_backend_restart
        DEPLOYED=1
    fi

    if [ "$FRONTEND_CHANGED" -gt 0 ]; then
        deploy_frontend
        DEPLOYED=1
    fi

    if [ "$DEPLOYED" -eq 0 ]; then
        warn "Nothing changed — restarting backend anyway"
        deploy_backend_restart
    fi

    run_migrations
    ;;
esac

echo ""
ok "Deploy complete!"
echo ""
echo "  Logs:    docker compose -f docker-compose.prod.yml logs -f backend"
echo "  Status:  docker compose -f docker-compose.prod.yml ps"
