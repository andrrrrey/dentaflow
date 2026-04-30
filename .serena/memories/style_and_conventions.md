# Code Style & Conventions

## Backend (Python)
- PEP 8, no linter/formatter config (no ruff/black/flake8)
- Modern type hints: `str | None`, `list[str]` (Python 3.11 style)
- SQLAlchemy 2.0 declarative with `Mapped[]` + `mapped_column()`
- Pydantic v2 with `ConfigDict(from_attributes=True)`
- snake_case functions/variables, PascalCase classes
- Imports: stdlib → third-party → local (`app.`), blank line between groups
- All DB/HTTP handlers are async
- JWT auth (python-jose), bcrypt passwords

## Frontend (TypeScript/React)
- No ESLint/Prettier config
- Functional components + hooks only
- Zustand (client state), TanStack React Query (server state)
- React Router v6, routes in App.tsx
- TailwindCSS + clsx for styling
- Axios-based API layer in `api/`
- PascalCase components/types, camelCase functions/variables

## General
- Comments and UI strings in Russian
- No CI/CD pipeline (manual deploy)
- No linting/formatting enforced