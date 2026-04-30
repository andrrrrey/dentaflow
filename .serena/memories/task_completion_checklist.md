# Task Completion Checklist

1. `cd frontend && npx tsc --noEmit` — type check frontend changes
2. `cd backend && pytest` — run backend tests
3. `docker compose build` — verify Docker build if deps/Dockerfile changed
4. Create alembic migration if SQLAlchemy models were modified
5. Ensure backend schema changes are reflected in frontend types
6. No hardcoded secrets — use env vars from config.py settings