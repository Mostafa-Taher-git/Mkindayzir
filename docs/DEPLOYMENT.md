# Deployment Guide

## Personal Mode (Single User, Old Laptop)

### Installation

```bash
npx mkindayzir
```

This creates `~/mkindayzir-data/`, initializes SQLite, and opens the browser to the setup wizard.

Or clone and run:

```bash
git clone <repo-url> && cd mkindayzir
cp .env.example .env
pnpm install
pnpm prisma:generate
pnpm dev
```

### Configuration

```env
MKINDAYZIR_MODE=personal
DATABASE_PROVIDER=sqlite
DATABASE_URL=file:./data/mkindayzir.db
DATA_DIR=./data
AUTO_LOGIN=false
```

---

## Team Mode (2-20 Users, LAN Server)

### Docker Compose

```bash
curl -O https://get.mkindayzir.dev/docker-compose.yml
docker compose up -d
```

### Manual Setup

```bash
git clone <repo-url> && cd mkindayzir
cp .env.example .env
# Edit DATABASE_URL to point to PostgreSQL
pnpm install
pnpm prisma:generate
pnpm prisma:migrate
pnpm build
pnpm start:server
```

### Configuration

```env
MKINDAYZIR_MODE=team
DATABASE_PROVIDER=postgresql
DATABASE_URL=postgresql://mkindayzir:password@localhost:5432/mkindayzir
DATA_DIR=/app/data
```

---

## Enterprise Mode (20+ Users, Dedicated Server)

### Docker Compose with nginx SSL

```bash
curl -O https://get.mkindayzir.dev/docker-compose.yml
docker compose up -d
```

### Requirements

- PostgreSQL 16+ (dedicated, tuned)
- 4+ CPU cores
- 8GB+ RAM
- 10GB+ disk space
- SSL termination (nginx/Caddy)

### Configuration

```env
MKINDAYZIR_MODE=enterprise
DATABASE_PROVIDER=postgresql
DATABASE_URL=postgresql://mkindayzir:password@db:5432/mkindayzir
DATA_DIR=/app/data
```

---

## Bare Metal

```bash
git clone <repo-url> && cd mkindayzir
cp .env.example .env
pnpm install
pnpm build
pnpm start:server
```

---

## Environment Variables

See [docs/CONFIGURATION.md](./CONFIGURATION.md) for all available environment variables.

---

## Updating

```bash
git pull
pnpm install
pnpm build
pnpm prisma:migrate
pnpm start:server
```

Docker:

```bash
docker compose pull
docker compose up -d
```
