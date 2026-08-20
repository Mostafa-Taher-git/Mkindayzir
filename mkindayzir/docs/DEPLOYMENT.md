# Deployment Guide

This guide covers deploying Mkindayzir using Docker Compose.

## Prerequisites

- Docker Engine 24+ and Docker Compose v2
- A PostgreSQL 16 database (or use the included Docker service)
- At least 2GB of available RAM and 5GB of disk space

## Quick Start

1. Clone the repository:
   ```bash
   git clone https://github.com/your-org/mkindayzir.git
   cd mkindayzir
   ```

2. Create a `.env` file from the example:
   ```bash
   cp .env.example .env
   ```

3. Generate secure secrets:
   ```bash
   openssl rand -hex 32   # SESSION_SECRET
   openssl rand -hex 16   # ENCRYPTION_KEY
   openssl rand -base64 32 # NEXTAUTH_SECRET
   ```

4. Start the services:
   ```bash
   docker compose up -d
   ```

5. Run the setup wizard:
   ```bash
   docker compose exec mkindayzir pnpm tsx scripts/setup.ts
   ```

6. Open the application at `http://localhost:3000`

## Environment Configuration

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@db:5432/mkindayzir` |
| `NEXTAUTH_SECRET` | Secret for NextAuth session encryption | random 32+ char string |
| `SESSION_SECRET` | Secret for session signing | random 64 char hex string |
| `ENCRYPTION_KEY` | 32-byte hex key for data encryption | random 32 byte hex string |
| `NEXTAUTH_URL` | Public URL of the application | `http://localhost:3000` |

### Database Configuration

The `DATABASE_URL` must point to the PostgreSQL service. In Docker Compose, use the service name `db` as the host:

```env
DATABASE_URL=postgresql://mkindayzir:password@db:5432/mkindayzir
```

## Production Deployment

Use `docker-compose.yml` for production:

```bash
docker compose up -d --build
```

### Volumes

| Volume | Purpose |
|--------|---------|
| `db-data` | PostgreSQL data directory |
| `upload-data` | User uploaded files |
| `backup-data` | Application backups |

### Health Checks

The application exposes a health endpoint at `/api/health` that checks:
- Database connectivity
- Application uptime
- Disk space availability

The database service includes a `pg_isready` health check.

## First-Run Setup

After starting the containers for the first time, run the setup wizard:

```bash
docker compose exec mkindayzir pnpm tsx scripts/setup.ts
```

The setup wizard will:
1. Check if an admin user already exists
2. Prompt for admin credentials (or use `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` env vars)
3. Create the initial admin user
4. Create initial system configuration

## Database Migrations

### Running Migrations Manually

```bash
docker compose exec mkindayzir pnpm tsx scripts/migrate.ts
```

### During Container Startup

The production Dockerfile automatically runs migrations on container startup:
- `prisma migrate deploy` is attempted first
- If no migration files exist, `prisma db push` is used as a fallback

## Backup and Restore

### Database Backup

```bash
docker compose exec db pg_dump -U mkindayzir mkindayzir > backup.sql
```

### Database Restore

```bash
docker compose exec -T db psql -U mkindayzir -d mkindayzir < backup.sql
```

### Volume Backup

```bash
docker compose down
tar czf mkindayzir-volumes.tar.gz db-data upload-data backup-data
docker compose up -d
```

## Updating the Application

1. Pull the latest changes:
   ```bash
   git pull
   ```

2. Rebuild and restart:
   ```bash
   docker compose up -d --build
   ```

3. Run any pending migrations:
   ```bash
   docker compose exec mkindayzir pnpm tsx scripts/migrate.ts
   ```

## Development Mode

Use `docker-compose.dev.yml` for development:

```bash
docker compose -f docker-compose.dev.yml up
```

### Development Features

- Hot reloading via volume mounts for `src/` and `prisma/`
- Development dependencies installed
- Source code changes are reflected immediately

### Running Commands in Development Container

```bash
docker compose -f docker-compose.dev.yml exec mkindayzir pnpm lint
docker compose -f docker-compose.dev.yml exec mkindayzir pnpm test
```

## Troubleshooting

### Database Connection Issues

Check that the database is healthy:
```bash
docker compose ps
docker compose logs db
```

### Migration Failures

If migrations fail on a fresh database, ensure no stale migration lock exists:
```bash
docker compose exec mkindayzir rm -f prisma/migrations/migration_lock.toml
docker compose exec mkindayzir pnpm prisma migrate deploy
```

### Permission Issues

Ensure the `data/` directory is writable by the container user. The Dockerfile creates the directories with appropriate permissions.

## Security Notes

- Never commit `.env` to version control
- Rotate `NEXTAUTH_SECRET` and `SESSION_SECRET` periodically
- Use strong passwords for the PostgreSQL database
- Enable HTTPS in production by setting `NEXTAUTH_URL` to `https://your-domain.com`
- Restrict database access to the application container only
