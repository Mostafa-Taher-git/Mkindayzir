# Architecture

## High-level overview

Mkindayzir is a **single-process** application: one FastAPI process serves the REST API **and** the compiled React SPA. There is no separate Node/Next.js server and no custom WebSocket server. In production the process listens on **port 3000**; in development it runs as two processes (FastAPI `:8000` + Vite `:3000`).

```
+-------------------------------------------------------------------+
|                        Client (Browser)                           |
|  +-------------------------------------------------------------+  |
|  |  React SPA (Vite build -> dist/)                            |  |
|  |  +-------------+  +--------------+  +---------------------+  |  |
|  |  | API client  |  | Zustand      |  | TanStack Query      |  |  |
|  |  | (fetch     |  | (UI state)   |  | (server cache)      |  |  |
|  |  |  /api/*)   |  |              |  |                     |  |  |
|  |  +-------------+  +--------------+  +---------------------+  |  |
|  +-------------------------------------------------------------+  |
+----------------------------------+--------------------------------+
                                   | HTTP(S)  /api/*
+----------------------------------v--------------------------------+
|                     FastAPI process (port 3000)                   |
|  +------------------------------------------------------------+   |
|  |  Routers (/api/*)                                          |  |
|  |  auth, setup, projects, work_items, iterations,            |  |
|  |  initiatives, workflows, labels, spaces, boards, columns,  |  |
|  |  cards, checklists, vault, assistant, settings, reports,   |  |
|  |  guides, search, uploads, admin, system, dashboard         |  |
|  +---------------------------+--------------------------------+   |
|                              |                                     |
|  +---------------------------v--------------------------------+   |
|  |  Service Layer (business logic)                            |   |
|  |  projects, boards, vault, ai, reports, migration, ...      |   |
|  +---------------------------+--------------------------------+   |
|                              |                                     |
|  +---------------------------v--------------------------------+   |
|  |  Persistence: SQLAlchemy 2.0 (async) + Alembic             |   |
|  |  PostgreSQL 16 + asyncpg (all modes)                        |   |
|  +------------------------------------------------------------+   |
|                                                                   |
|  Static serving (production): mounted dist/ + SPA catch-all     |
+-------------------------------------------------------------------+
```

## Key decisions

1. **Single process (API + SPA).** `app/main.py` mounts the API routers, then (when `dist/` exists) serves the built SPA and a catch-all that returns `index.html`. This keeps deployment to one container/process.
2. **Thin routers, fat services.** API routers under `backend/app/routers/` only parse requests/responses; all business logic lives in the services layer.
3. **Async everywhere.** FastAPI + SQLAlchemy async on `asyncpg`.
4. **PostgreSQL-only.** SQLAlchemy models target Postgres types (timestamptz, quoted defaults). Legacy SQLite installs are imported via the CLI.
5. **SPA-friendly routing.** The frontend talks to the API via relative `/api` paths; in dev Vite proxies `/api` to `:8000`, and in prod the same FastAPI process answers both.

## API routing

- All REST endpoints are mounted under `/api/*` (e.g. `/api/health`, `/api/auth/login`, `/api/projects`).
- `GET /api/config` exposes public runtime config (mode, registration flag).
- `/api/tickets` — Ticket CRUD, replies, stats, SLA tracking.
- The SPA is served from `/` and all non-`/api` client routes fall through to `index.html` (SPA catch-all).

## Services layer

`backend/app/services/` holds business logic (projects, boards, vault, AI, reports, the migration service, etc.). Routers depend on services; services depend on the async DB session from `backend/app/database.py`.

## Persistence

- **Models:** SQLAlchemy 2.0 declarative models in `backend/app/models/`.
- **Migrations:** Alembic in `backend/app/alembic/`; run with `alembic upgrade head` or `mkindayzir migrate upgrade`.
- Schema is managed with **Alembic** migrations (`alembic upgrade head`); `scripts/reset_pg.py` drops/recreates for development.
- **PostgreSQL (Team):** `DATABASE_PROVIDER=postgres`, `DATABASE_URL=postgresql://...` (asyncpg).

### SQLite -> PostgreSQL migration

`backend/app/services/migration_service.py` (exposed via `backend/app/routers/system.py`) performs a live data migration. The UI wizard at **Settings → System → "Upgrade to Team Mode"** drives: connection test → pre-check → SSE progress stream → rollback on failure.

## Static serving of the SPA

`app/main.py` resolves the frontend directory from `FRONTEND_DIR` (env) and falls back to `<project root>/dist`. When present it mounts `/assets` and serves `index.html` for all unmatched routes (after the `/api` routers). In development `dist/` is absent, so the API works standalone and the SPA is served by Vite on `:3000`.

## Development (two processes)

| Process | Command | Port | Role |
|---------|---------|------|------|
| API | `uvicorn app.main:app --reload --port 8000` | 8000 | REST API |
| SPA | `pnpm dev` (Vite, proxies `/api` -> 8000) | 3000 | React dev server |

The browser always talks to `:3000`; Vite forwards `/api/*` to the FastAPI backend.

## Security

- **Session:** authenticated users receive a `mkindayzir_session` cookie (signed/verified with `SESSION_SECRET`).
- **Encryption:** sensitive values (e.g. AI API keys) are encrypted at rest with **AES-256-GCM** using `ENCRYPTION_KEY`.
- **Rate limiting:** per-IP/route limits via `backend/app/middleware/rate_limit.py`.
- **CORS:** configured for the SPA origin(s) in `app/main.py`.
