# Running Mkindayzir

## Prerequisites
- Node.js 20+ and pnpm
- Python 3.11+ and pip
- PostgreSQL 16 (for Team/Enterprise mode) — optional for Personal mode

## Quick Start (Development)

### Option A: Docker Compose (recommended)

1. Create `.env` from `.env.example` and set required secrets:
```bash
cp .env.example .env
```

2. Edit `.env` and set:
   - `DB_PASSWORD` — a secure password for PostgreSQL
   - `SESSION_SECRET` — 64-char hex string (use `openssl rand -hex 32`)
   - `ENCRYPTION_KEY` — 64-char hex string (use `openssl rand -hex 32`)

3. Start all services:
```bash
docker compose -f docker-compose.dev.yml up --build
```

4. Run database migrations:
```bash
docker compose -f docker-compose.dev.yml exec backend alembic upgrade head
```

5. Access the app at http://localhost:3000

### Option B: Local (without Docker)

**Terminal 1 — FastAPI backend:**
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -e .
uvicorn app.main:app --reload --port 8000
```

**Terminal 2 — Next.js frontend:**
```bash
pnpm install
pnpm dev
```

6. Access the app at http://localhost:3000

## Production (Docker Compose)

1. Create `.env` with production values:
```bash
cp .env.example .env
# Edit .env: set DB_PASSWORD, SESSION_SECRET, ENCRYPTION_KEY, MKINDAYZIR_MODE=team
```

2. Build and start:
```bash
docker compose up -d --build
```

3. Run migrations:
```bash
docker compose exec backend alembic upgrade head
```

4. Access at http://localhost (port 80)

Services:
- Frontend + API: http://localhost (port 80, via nginx)
- Backend API direct: http://localhost:8000
- PostgreSQL: localhost:5432

## Database

### SQLite (Personal mode)
- Tables auto-created on backend startup
- Database file: `data/mkindayzir.db`

### PostgreSQL (Team/Enterprise mode)
```bash
cd backend
alembic upgrade head
```

### Migrate SQLite → PostgreSQL
```bash
cd backend
python -m app.cli.migrate_db --target postgresql://user:pass@host:5432/mkindayzir
```

## First Run
1. Visit http://localhost:3000/setup
2. Choose mode (Personal / Team / Enterprise)
3. Create admin account
4. In Personal mode with auto-login, you'll be logged in immediately

## Environment Variables

Key variables (see `.env.example`):
- `DATABASE_PROVIDER`: `sqlite` (Personal) or `postgresql` (Team/Enterprise)
- `DATABASE_URL`: Database connection string
- `SESSION_SECRET`: 64-char hex string for session signing
- `ENCRYPTION_KEY`: 64-char hex string (32 bytes) for AI API key encryption
- `MKINDAYZIR_MODE`: `personal`, `team`, or `enterprise`
- `DB_PASSWORD`: PostgreSQL password (required for Team/Enterprise)
