# Deployment Guide

Mkindayzir runs as a **single FastAPI process** that serves both the REST API (under `/api/*`) and the built React SPA (`dist/`) on port **3000** in production. There are three supported deployment methods.

> In production, put the `:3000` listener behind your own reverse proxy / TLS terminator (nginx, Caddy, Traefik, etc.). The app itself does not terminate TLS.

## Method 1 — `pip install` (Personal, no Docker)

```bash
pip install mkindayzir
mkindayzir start                   # serves http://localhost:3000
```

On first start, `mkindayzir start` runs `alembic upgrade head` automatically and then launches the server. Open http://localhost:3000 and complete the setup wizard to create the admin account. Backups and restores use the CLI:

```bash
mkindayzir backup create
mkindayzir backup restore <file.tar.gz> --force
mkindayzir migrate migrate-db      # SQLite -> PostgreSQL (reads DATABASE_URL)
```

This method is recommended for a single-user, local-first install on a laptop or small server.

## Method 2 — `easy-install.py` (Docker, guided)

```bash
python3 scripts/easy-install.py deploy --mode=personal
```

For Team mode with a managed PostgreSQL container and a domain:

```bash
python3 scripts/easy-install.py deploy --mode=team --domain=app.example.com --email=admin@example.com
```

The script:

1. Generates `SESSION_SECRET` / `ENCRYPTION_KEY` secrets.
2. Writes `.env` (mode, database provider, domain, email, etc.).
3. Builds the image(s).
4. Runs `docker compose up -d`.
5. Waits for the health check.
6. Runs migrations (`mkindayzir migrate upgrade` inside the container).
7. Creates the admin user (or prints setup instructions).

## Method 3 — Docker Compose (manual)

```bash
docker compose -f docker/docker-compose.yml up -d
bash docker/init.sh                # migrations + admin user creation
```

The compose file defines a single `app` service on port `3000`. An optional `postgres` service is enabled under the `team` profile.

### Team mode

```bash
docker compose -f docker/docker-compose.yml --profile team up -d
bash docker/init.sh
```

When using the `team` profile, set `MKINDAYZIR_MODE=team`, `DATABASE_PROVIDER=postgres`, and point `DATABASE_URL` at the `postgres` service. See [docs/CONFIGURATION.md](./CONFIGURATION.md) for the full variable list.

## Upgrading Personal -> Team (in-place, no terminal)

Once the app is running, open **Settings → System → "Upgrade to Team Mode"** in the UI. The wizard walks you through:

1. Entering the PostgreSQL connection string.
2. A pre-check (connectivity, version, disk space).
3. A live migration with Server-Sent-Events progress.
4. Automatic rollback on failure.

No CLI or terminal access is required. The endpoints live in `backend/app/routers/system.py`.

## Operations

```bash
mkindayzir start                   # start (API + SPA) on :3000
mkindayzir migrate upgrade         # apply Alembic migrations
mkindayzir backup create           # backup DB + uploads to a tarball
mkindayzir backup restore <file> --force
mkindayzir password reset <email>  # reset a user password
```

## Updating

- `pip` install: `pip install -U mkindayzir && mkindayzir start`.
- Docker: `docker compose -f docker/docker-compose.yml pull && docker compose -f docker/docker-compose.yml up -d`, then `bash docker/init.sh`.

## Configuration

See [docs/CONFIGURATION.md](./CONFIGURATION.md) for all environment variables (secrets, database, AI, SMTP, logging, rate limits, features).
