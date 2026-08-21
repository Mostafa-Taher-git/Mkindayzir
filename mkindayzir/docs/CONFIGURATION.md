# Configuration Reference

## Environment Variables

### Core

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment mode |
| `PORT` | `3000` | Server port |
| `BASE_URL` | `http://localhost:3000` | Public URL |
| `MKINDAYZIR_MODE` | `personal` | Deployment mode: `personal`, `team`, `enterprise` |
| `AUTO_LOGIN` | `false` | Auto-login for Personal Mode |

### Database

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_PROVIDER` | `sqlite` | Database provider: `sqlite` or `postgresql` |
| `DATABASE_URL` | `file:./data/mkindayzir.db` | Database connection string |
| `DATA_DIR` | `./data` | Data directory for uploads and backups |

### Security

| Variable | Default | Description |
|----------|---------|-------------|
| `SESSION_SECRET` | (auto-generated) | 64-char random string for session signing |
| `ENCRYPTION_KEY` | (auto-generated) | 32-byte hex string for API key encryption |
| `SESSION_MAX_AGE` | `86400` | Session expiry in seconds (24h) |
| `BCRYPT_ROUNDS` | `12` | Bcrypt cost factor |

### File Storage

| Variable | Default | Description |
|----------|---------|-------------|
| `UPLOAD_DIR` | `/app/data/uploads` | Upload directory |
| `MAX_UPLOAD_SIZE` | `26214400` | Max file size in bytes (25MB) |
| `BACKUP_DIR` | `/app/data/backups` | Backup directory |

### Rate Limiting

| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_GENERAL` | `100` | General requests per minute |
| `RATE_LIMIT_AI` | `20` | AI requests per minute |
| `RATE_LIMIT_AUTH` | `5` | Auth requests per minute per IP |

### AI (Optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `DEFAULT_AI_PROVIDER` | `openrouter` | Default AI provider |
| `DEFAULT_AI_MODEL` | `anthropic/claude-sonnet-4-20250514` | Default AI model |

### Email (Optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `SMTP_HOST` | | SMTP host |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_USER` | | SMTP username |
| `SMTP_PASSWORD` | | SMTP password |
| `SMTP_FROM` | `noreply@mkindayzir.local` | From address |

### Logging

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Log level: `error`, `warn`, `info`, `debug` |
| `LOG_FORMAT` | `json` | Log format: `json` or `pretty` |

### Features

| Variable | Default | Description |
|----------|---------|-------------|
| `REGISTRATION_ENABLED` | `false` | Allow public registration |
| `GUIDE_CENTER_ENABLED` | `true` | Enable Guide Center |
| `MAX_PROJECTS` | `0` | Max projects per user (0 = unlimited) |
| `MAX_USERS` | `0` | Max users (0 = unlimited) |
