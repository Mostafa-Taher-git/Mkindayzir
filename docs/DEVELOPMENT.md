# Development Guide

Mkindayzir is a single FastAPI backend (`backend/`) plus a Vite + React SPA at the project root. In development two processes run: the FastAPI API on `:8000` and the Vite dev server on `:3000` (which proxies `/api` -> `:8000`). In production a single FastAPI process serves both the API and the built SPA on `:3000`.

## Prerequisites

- Python 3.11+
- Node.js 18+
- pnpm 9.x
- PostgreSQL 16+ (only required for Team mode; Personal mode uses SQLite)

## Backend setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
cp .env.example .env               # or rely on the root .env
alembic upgrade head               # apply migrations
python -m app.cli.setup            # create the admin user (interactive wizard)
uvicorn app.main:app --reload --port 8000
```

- API: http://localhost:8000
- Interactive API docs (Swagger): http://localhost:8000/docs

## Frontend setup

```bash
pnpm install
pnpm dev                           # Vite dev server on :3000, proxies /api -> :8000
```

- App: http://localhost:3000

The Vite dev proxy is configured in `vite.config.ts` (`server.proxy["/api"] -> http://localhost:8000`), so all `fetch("/api/...")` calls from the SPA reach the FastAPI backend during development.

## Useful CLI commands

```bash
mkindayzir start                   # run the production single-process server (API + dist/)
mkindayzir setup admin --email ... --password ...   # create admin non-interactively
mkindayzir migrate upgrade         # run Alembic migrations
mkindayzir backup create           # create a backup tarball
mkindayzir password reset <email>  # reset a user's password
mkindayzir version
```

## Project layout

- `backend/app/` — FastAPI app (`main.py`), routers (`/api/*`), services layer, SQLAlchemy models, `cli/` (Click CLI), `middleware/`.
- `backend/alembic/` — Alembic migrations.
- `src/` — React SPA source (router, queries, stores, components).
- `vite.config.ts`, `tailwind.config.ts`, `index.html` — frontend tooling; build output goes to `dist/`.
- `scripts/easy-install.py` — Docker deployment helper.

## Database

### Personal mode (SQLite)

```env
DATABASE_PROVIDER=sqlite
DATABASE_URL=file:./data/mkindayzir.db
```

Tables are auto-created on backend startup for SQLite; run `alembic upgrade head` for a clean migration history.

### Team mode (PostgreSQL)

```env
DATABASE_PROVIDER=postgres
DATABASE_URL=postgresql://mkindayzir:password@localhost:5432/mkindayzir
```

## Testing

```bash
pnpm test:unit                    # Vitest unit tests
pnpm test:e2e                    # Playwright E2E tests
```

## Code style

- Python: follow existing FastAPI/async patterns; `mypy`/`ruff` if configured in the backend.
- Frontend: TypeScript strict mode, ESLint, Prettier.
- Run `pnpm lint` / `pnpm format` and backend `ruff`/`black` before committing.
