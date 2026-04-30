# Suggested Commands

## Development
```bash
docker compose up -d                    # Start all services (dev, hot reload)
cd frontend && npm run dev              # Frontend dev server only
cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload  # Backend dev server only
```

## Database
```bash
docker compose run --rm backend alembic upgrade head                          # Run migrations
docker compose run --rm backend alembic revision --autogenerate -m "desc"     # Create migration
docker compose run --rm backend python -m app.utils.seed                      # Seed users
```

## Frontend
```bash
cd frontend && npm install && npm run dev      # Install + dev
cd frontend && npm run build                   # Production build (tsc + vite)
```

## Testing
```bash
cd backend && pytest                    # Backend tests
cd frontend && npx tsc --noEmit        # Frontend type check
```

## Deployment
```bash
bash scripts/deploy.sh                                    # Full prod deployment
docker compose -f docker-compose.prod.yml up -d           # Start prod
docker compose -f docker-compose.prod.yml ps              # Check status
```

## Logs
```bash
docker compose logs -f backend
docker compose logs -f frontend
docker compose exec postgres psql -U dentaflow dentaflow
docker compose exec redis redis-cli
```