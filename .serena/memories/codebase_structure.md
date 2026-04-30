# Codebase Structure

```
dentaflow/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app entry point
│   │   ├── config.py            # Pydantic Settings
│   │   ├── database.py          # SQLAlchemy async engine & session
│   │   ├── dependencies.py      # DI: get_db, get_current_user
│   │   ├── models/              # SQLAlchemy ORM models
│   │   ├── schemas/             # Pydantic request/response schemas
│   │   ├── routers/             # FastAPI route handlers
│   │   ├── services/            # Business logic layer
│   │   ├── tasks/               # Celery background tasks
│   │   └── utils/               # Utilities (security, seed)
│   ├── alembic/                 # DB migrations
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── main.tsx / App.tsx   # Entry points, routing
│   │   ├── pages/               # Page components
│   │   ├── components/          # Reusable UI components
│   │   ├── api/                 # Axios API client layer
│   │   ├── hooks/               # Custom hooks
│   │   ├── store/               # Zustand state stores
│   │   ├── types/               # TypeScript type definitions
│   │   └── styles/              # Global CSS (Tailwind)
│   ├── package.json
│   └── Dockerfile
├── nginx/                       # NGINX config
├── scripts/deploy.sh            # Production deployment
├── docker-compose.yml           # Dev environment
├── docker-compose.prod.yml      # Production environment
└── .env.example                 # Environment variables template
```