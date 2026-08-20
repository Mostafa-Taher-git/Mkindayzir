# Mkindayzir

**Your Operations, Your Server, Your Control.**

Mkindayzir is a self-hosted, local-first, offline-capable Work OS that unifies project management, visual task boards, knowledge management, and AI assistance into a single independent application.

## Tech Stack

- **Runtime**: Node.js 20 LTS
- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript 5.x
- **Database**: PostgreSQL 16+ with Prisma ORM
- **Auth**: NextAuth.js (Auth.js)
- **Styling**: Tailwind CSS 4.x
- **State**: Zustand + TanStack Query
- **Offline**: Dexie.js + Workbox
- **Real-time**: Socket.io

## Getting Started

```bash
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

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm lint` - Run ESLint
- `pnpm format` - Format code with Prettier
- `pnpm test` - Run tests
- `pnpm test:unit` - Run unit tests
- `pnpm test:e2e` - Run E2E tests
- `pnpm prisma:generate` - Generate Prisma client
- `pnpm prisma:migrate` - Run database migrations
- `pnpm prisma:seed` - Seed database
- `pnpm db:push` - Push schema changes to database

## License

ISC
