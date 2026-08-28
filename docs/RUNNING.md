# Running Mkindayzir (Quick Reference)

Mkindayzir is a single FastAPI process that serves the API (`/api/*`) and the built React SPA on **port 3000** in production. Full details: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Prerequisites

- Python 3.11+ and pip
- Node.js 18+ and pnpm 9+
- PostgreSQL 16+ (required in all modes)

## Quick start — Personal (no Docker)

```bash
pip install mkindayzir
mkindayzir start                 # http://localhost:3000 (API + SPA)
```

First run opens the setup wizard to create the admin user.

## Quick start — Docker

```bash
docker compose -f docker/docker-compose.yml up -d
bash docker/init.sh              # migrations + admin user
# App: http://localhost:3000  (put :3000 behind your reverse proxy / TLS)
```

For Team mode with PostgreSQL:

```bash
docker compose -f docker/docker-compose.yml --profile team up -d
bash docker/init.sh
```

Or use the guided installer:

```bash
python3 scripts/easy-install.py deploy --mode=personal          # or --mode=team --domain=... --email=...
```

## Development (two processes)

**Terminal 1 — FastAPI backend:**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
alembic upgrade head
python -m app.cli.setup
uvicorn app.main:app --reload --port 8000
```

**Terminal 2 — Vite frontend:**

```bash
pnpm install                        # repo root (workspace)
pnpm --dir frontend dev            # http://localhost:3000, proxies /api -> :8000
```

- App: http://localhost:3000
- API docs: http://localhost:8000/docs

## Common CLI commands

```bash
mkindayzir start                                   # production server (API + SPA) on :3000
mkindayzir setup admin --email ... --password ...  # create admin
mkindayzir migrate upgrade                          # Alembic migrations
mkindayzir backup create                           # backup DB + uploads
mkindayzir backup restore <file.tar.gz> --force    # restore
mkindayzir password reset <email>                  # reset password
mkindayzir version
```

## Database

- **PostgreSQL:** set `DATABASE_URL` in `backend/.env`; the application creates and extends its schema at startup.

## First run

1. Visit http://localhost:3000
2. Complete the setup wizard / create the admin account.
3. With `AUTO_LOGIN=true`, the initial active admin is logged in immediately.

## Key environment variables

See [docs/CONFIGURATION.md](docs/CONFIGURATION.md). Essentials:

- `DATABASE_URL`: database connection string
- `SESSION_SECRET`: 64-char hex string for the session cookie
- `ENCRYPTION_KEY`: 64-char hex string for AES-256-GCM encryption
