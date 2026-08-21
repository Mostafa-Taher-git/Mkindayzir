# Development Guide

## Prerequisites

- Node.js 20 LTS
- pnpm 9.x
- PostgreSQL 16+ (for Team/Enterprise mode) or SQLite (for Personal mode)

## Setup

```bash
# Clone repository
git clone <repo-url> && cd mkindayzir

# Install dependencies
pnpm install

# Copy environment file
cp .env.example .env

# Generate Prisma client
pnpm prisma:generate

# Run database migrations
pnpm prisma:migrate

# Seed database
pnpm prisma:seed

# Start development server
pnpm dev
```

## Scripts

- `pnpm dev` - Start development server (Next.js)
- `pnpm dev:server` - Start custom server with WebSocket
- `pnpm build` - Build for production
- `pnpm start` - Start production server (custom server)
- `pnpm lint` - Run ESLint
- `pnpm format` - Format code with Prettier
- `pnpm test` - Run tests
- `pnpm test:unit` - Run unit tests
- `pnpm prisma:generate` - Generate Prisma client
- `pnpm prisma:migrate` - Run database migrations
- `pnpm prisma:seed` - Seed database
- `pnpm db:push` - Push schema changes to database

## Project Structure

See `mkindayzir_implementation_updateplan.md` section 6 for the complete project structure.

## Database

### Personal Mode (SQLite)

```env
DATABASE_PROVIDER=sqlite
DATABASE_URL=file:./data/mkindayzir.db
```

### Team/Enterprise Mode (PostgreSQL)

```env
DATABASE_PROVIDER=postgresql
DATABASE_URL=postgresql://mkindayzir:password@localhost:5432/mkindayzir
```

## Testing

```bash
# Unit tests
pnpm test:unit

# E2E tests
pnpm test:e2e
```

## Code Style

- TypeScript strict mode
- ESLint with strict rules
- Prettier for formatting
