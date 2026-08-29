# Development Guide

Mkindayzir is a pnpm monorepo: `frontend/` (Vite + React SPA) and `backend/` (FastAPI). In development two processes run: the FastAPI API on `:8000` and the Vite dev server on `:5173` (which proxies `/api` -> `:8000`). In production a single FastAPI process serves both the API and the built SPA on `:8000`.

## Prerequisites

- Python 3.11+
- Node.js 18+
- pnpm 9.x
- PostgreSQL 16+ running locally (`sudo systemctl status postgresql`)

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
pnpm install                       # from the repo root (workspace: frontend/)
pnpm --dir frontend dev            # Vite dev server on :5173, proxies /api -> :8000
```

- App: http://localhost:5173

The Vite dev proxy is configured in `frontend/vite.config.ts` (`server.proxy["/api"] -> http://localhost:8000`), so all `fetch("/api/...")` calls from the SPA reach the FastAPI backend during development.

## Useful CLI commands

```bash
mkindayzir start                   # run the production single-process server (API + frontend/dist/)
mkindayzir setup admin --email ... --password ...   # create admin non-interactively
mkindayzir migrate upgrade         # run Alembic migrations
mkindayzir backup create           # create a backup tarball
mkindayzir password reset <email>  # reset a user's password
mkindayzir version
```

## Project layout

```
mkindayzir/
├── frontend/          # Vite + React SPA (own package.json)
│   ├── src/           # router, queries, stores, components
│   ├── public/        # static marketing pages (landing, roadmap, …)
│   ├── tests/         # vitest unit + playwright e2e
│   └── vite.config.ts
├── backend/           # FastAPI app
│   ├── app/           # main.py, routers/, services/, models/, cli/, middleware/
│   ├── alembic/       # migrations
│   ├── scripts/       # reset_pg.py etc.
│   └── tests/         # pytest suite (PostgreSQL)
├── docker/            # docker-compose (app + db)
├── docs/              # architecture, configuration, deployment guides
└── scripts/           # easy-install.py
```

Build output goes to `frontend/dist/`; the backend serves it via `FRONTEND_DIR`.

## Database

```env
DATABASE_URL=postgresql+asyncpg://mkindayzir:<password>@127.0.0.1:5432/mkindayzir
```

Create the role/database once, then `alembic upgrade head` (dev shortcut: `PYTHONPATH=. python scripts/reset_pg.py`). Tests use the dedicated `mkindayzir_test` database automatically.

## Testing

```bash
pnpm --dir frontend test:unit      # Vitest unit tests
pnpm --dir frontend test:e2e       # Playwright E2E tests
cd backend && python -m pytest tests/ -q   # backend suite (PostgreSQL)
```

## Code style

- Python: follow existing FastAPI/async patterns; `mypy`/`ruff` if configured in the backend.
- Frontend: TypeScript strict mode, ESLint, Prettier.
- Run `pnpm --dir frontend lint` / `format` before committing.
