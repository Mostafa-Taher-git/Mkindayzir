# Configuration Reference

All configuration is via environment variables. The backend reads these from the environment (and/or the root `.env`). Copy `.env.example` to `.env` to get started.

## Core

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8000` | Port the FastAPI process binds in production (API + SPA). |
| `BASE_URL` | `http://localhost:8000` | Public base URL of the app. |
| `AUTO_LOGIN` | `false` | Auto-login for Personal Mode (single user). |
| `FRONTEND_DIR` | `<project root>/dist` | Optional override of the directory serving the built SPA. |
| `DATA_DIR` | `./data` | Uploads and backups directory. |

## Database

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://localhost/mkindayzir` | PostgreSQL connection string. |
| `DB_PASSWORD` | `change-me-in-production` | Fallback PostgreSQL password used by Docker Compose when `POSTGRES_PASSWORD` is not explicitly set. |

## Security

| Variable | Default | Description |
|----------|---------|-------------|
| `SESSION_SECRET` | (auto-generated if absent) | Secret used to sign/verify the `mkindayzir_session` cookie. |
| `ENCRYPTION_KEY` | (auto-generated if absent) | 32-byte key (hex) for AES-256-GCM encryption of sensitive fields. |
| `SESSION_MAX_AGE` | `86400` | Session expiry in seconds (24h). |
| `BCRYPT_ROUNDS` | `12` | Bcrypt cost factor for password hashing. |
| `ALLOWED_ORIGINS` | `http://localhost:8000,http://127.0.0.1:8000` | Comma-separated list of allowed origins for CORS. |

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
| `PYTHON_AI_URL` | `http://localhost:8000` | Python AI service URL (used internally for AI provider integration). |

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

### Local PostgreSQL

```env
DATABASE_URL=postgresql+asyncpg://mkindayzir:<password>@127.0.0.1:5432/mkindayzir
DATA_DIR=./data
AUTO_LOGIN=false
SESSION_SECRET=<64-char-random-string>
ENCRYPTION_KEY=<32-byte-hex-string>
```

### Docker PostgreSQL

```env
DATABASE_URL=postgresql+asyncpg://mkindayzir:<password>@postgres:5432/mkindayzir
DB_PASSWORD=change-me-in-production
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
