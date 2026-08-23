# Running Mkindayzir

## Prerequisites
- Node.js 18+ and pnpm
- Python 3.11+ and pip
- PostgreSQL 16 (for Team/Enterprise mode) — optional for Personal mode

## Development Mode

### 1. Start the FastAPI Backend
```bash
cd backend
pip install -e .
alembic upgrade head  # creates tables if needed
uvicorn app.main:app --reload --port 8000
```

### 2. Start the Next.js Frontend (in a new terminal)
```bash
pnpm install
pnpm dev
```

The frontend proxies all `/api/*` requests to `http://localhost:8000`.

### 3. Access the App
Open http://localhost:3000

## Production Mode (Docker Compose)

```bash
# Create .env from .env.example and set DB_PASSWORD, SESSION_SECRET, ENCRYPTION_KEY
cp .env.example .env

# Start all services
docker compose up -d

# Run migrations
docker compose exec backend alembic upgrade head

# Seed database (optional)
docker compose exec backend python -m app.cli.setup
```

Services:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- PostgreSQL: localhost:5432

## Environment Variables

Key variables (see `.env.example` and `backend/.env.example`):
- `DATABASE_PROVIDER`: `sqlite` (Personal) or `postgresql` (Team/Enterprise)
- `DATABASE_URL`: Database connection string
- `SESSION_SECRET`: 64-char hex string for session signing
- `ENCRYPTION_KEY`: 64-char hex string (32 bytes) for AI API key encryption
- `MKINDAYZIR_MODE`: `personal`, `team`, or `enterprise`

## Database Migrations

### SQLite (Personal mode)
Tables are auto-created on backend startup.

### PostgreSQL (Team/Enterprise mode)
```bash
cd backend
alembic upgrade head
```

### Migrating from SQLite to PostgreSQL
```bash
cd backend
python -m app.cli.migrate_db --target postgresql://user:pass@host:5432/mkindayzir
```

## First Run
1. Visit http://localhost:3000/setup
2. Choose mode (Personal / Team / Enterprise)
3. Create admin account
4. In Personal mode with auto-login, you'll be logged in immediately
