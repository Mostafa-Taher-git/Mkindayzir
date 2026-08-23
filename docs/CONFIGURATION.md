# Configuration Reference

All configuration is via environment variables. The backend reads these from the environment (and/or the root `.env`). Copy `.env.example` to `.env` to get started.

## Core

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Port the FastAPI process binds in production (API + SPA). |
| `BASE_URL` | `http://localhost:3000` | Public base URL of the app. |
| `MKINDAYZIR_MODE` | `personal` | Deployment mode: `personal` or `team`. |
| `AUTO_LOGIN` | `false` | Auto-login for Personal Mode (single user). |
| `FRONTEND_DIR` | `<project root>/dist` | Optional override of the directory serving the built SPA. |
| `DATA_DIR` | `./data` | Data directory for the SQLite DB, uploads, and backups. |

## Database

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_PROVIDER` | `sqlite` | Database provider: `sqlite` or `postgres`. |
| `DATABASE_URL` | `file:./data/mkindayzir.db` | Connection string. `postgresql://user:pass@host:5432/dbname` for Team mode. |

## Security

| Variable | Default | Description |
|----------|---------|-------------|
| `SESSION_SECRET` | (auto-generated if absent) | Secret used to sign/verify the `mkindayzir_session` cookie. |
| `ENCRYPTION_KEY` | (auto-generated if absent) | 32-byte key (hex) for AES-256-GCM encryption of sensitive fields. |
| `SESSION_MAX_AGE` | `86400` | Session expiry in seconds (24h). |
| `BCRYPT_ROUNDS` | `12` | Bcrypt cost factor for password hashing. |

## File storage

| Variable | Default | Description |
|----------|---------|-------------|
| `UPLOAD_DIR` | `/app/data/uploads` | Upload directory. |
| `MAX_UPLOAD_SIZE` | `26214400` | Max file size in bytes (25 MB). |
| `BACKUP_DIR` | `/app/data/backups` | Backup directory. |

## Rate limiting

| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_GENERAL` | `100` | General requests per minute. |
| `RATE_LIMIT_AI` | `20` | AI requests per minute. |
| `RATE_LIMIT_AUTH` | `5` | Auth requests per minute per IP. |

## AI (optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `DEFAULT_AI_PROVIDER` | `openrouter` | Default AI provider. |
| `DEFAULT_AI_MODEL` | `anthropic/claude-sonnet-4-20250514` | Default AI model. |

## Email (optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `SMTP_HOST` | | SMTP host. |
| `SMTP_PORT` | `587` | SMTP port. |
| `SMTP_USER` | | SMTP username. |
| `SMTP_PASSWORD` | | SMTP password. |
| `SMTP_FROM` | `noreply@mkindayzir.local` | From address. |

## Logging

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Log level: `error`, `warn`, `info`, `debug`. |
| `LOG_FORMAT` | `json` | Log format: `json` or `pretty`. |

## Features

| Variable | Default | Description |
|----------|---------|-------------|
| `REGISTRATION_ENABLED` | `false` | Allow public registration. |
| `GUIDE_CENTER_ENABLED` | `true` | Enable Guide Center. |
| `MAX_PROJECTS` | `0` | Max projects per user (0 = unlimited). |
| `MAX_USERS` | `0` | Max users (0 = unlimited). |

## Examples

### Personal mode (SQLite, no Docker)

```env
MKINDAYZIR_MODE=personal
DATABASE_PROVIDER=sqlite
DATABASE_URL=file:./data/mkindayzir.db
DATA_DIR=./data
AUTO_LOGIN=false
SESSION_SECRET=<64-char-random-string>
ENCRYPTION_KEY=<32-byte-hex-string>
```

### Team mode (PostgreSQL)

```env
MKINDAYZIR_MODE=team
DATABASE_PROVIDER=postgres
DATABASE_URL=postgresql://mkindayzir:password@localhost:5432/mkindayzir
DATA_DIR=/app/data
SESSION_SECRET=<64-char-random-string>
ENCRYPTION_KEY=<32-byte-hex-string>
REGISTRATION_ENABLED=true
```

Generate secrets with:

```bash
openssl rand -hex 32   # SESSION_SECRET (64 hex chars)
openssl rand -hex 32   # ENCRYPTION_KEY (64 hex chars / 32 bytes)
```
