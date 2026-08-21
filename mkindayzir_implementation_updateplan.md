# Mkindayzir - Master Implementation Plan v2.0

## Executive Summary

**Mkindayzir** is a self-hosted, local-first, offline-capable Work OS that unifies project management, visual task boards, knowledge management, and AI assistance into a single independent application. It runs on any hardware — from an old laptop for personal use to a company server for a full team — with zero internet dependency (except for optional AI features using the user's own API key).

It must work smoothly for:
- **A single person** on an old/low-end laptop (Personal Mode, SQLite, no Docker)
- **A small team** (2-20 users) on a local network server (Team Mode)
- **A company** (20+ users) on dedicated infrastructure (Enterprise Mode)

The application is **desktop/laptop browser only** (no mobile phone support). It must run flawlessly on both **Linux and Windows**.

---

## Table of Contents

1. [Product Identity](#1-product-identity)
2. [Core Principles](#2-core-principles)
3. [Deployment Profiles](#3-deployment-profiles)
4. [Technology Stack](#4-technology-stack)
5. [System Architecture](#5-system-architecture)
6. [Project Structure](#6-project-structure)
7. [Database Architecture](#7-database-architecture)
8. [Backend Architecture](#8-backend-architecture)
9. [Frontend Architecture](#9-frontend-architecture)
10. [UI/UX Design System](#10-uiux-design-system)
11. [Local-First & Offline Architecture](#11-local-first--offline-architecture)
12. [Authentication & Authorization](#12-authentication--authorization)
13. [Multi-User & Single-Tenant](#13-multi-user--single-tenant)
14. [API Architecture](#14-api-architecture)
15. [AI Integration](#15-ai-integration)
16. [Module Specifications](#16-module-specifications)
17. [Search Architecture](#17-search-architecture)
18. [File Storage](#18-file-storage)
19. [Real-Time Communication](#19-real-time-communication)
20. [Security](#20-security)
21. [Low-End Hardware Optimization](#21-low-end-hardware-optimization)
22. [Performance Budgets & Scalability](#22-performance-budgets--scalability)
23. [Easy Installation](#23-easy-installation)
24. [Internationalization Readiness](#24-internationalization-readiness)
25. [Testing Strategy](#25-testing-strategy)
26. [Monitoring & Logging](#26-monitoring--logging)
27. [Backup & Restore](#27-backup--restore)
28. [Migration Strategy](#28-migration-strategy)
29. [Deployment](#29-deployment)
30. [Configuration Management](#30-configuration-management)
31. [CI/CD Pipeline](#31-cicd-pipeline)
32. [Documentation](#32-documentation)
33. [Extensibility & Plugin Architecture](#33-extensibility--plugin-architecture)
34. [Future AI Agent Readiness](#34-future-ai-agent-readiness)
35. [Future MCP Readiness](#35-future-mcp-readiness)
36. [Implementation Phases](#36-implementation-phases)
37. [Module Feature Parity](#37-module-feature-parity)
38. [Naming Conventions](#38-naming-conventions)

---

## 1. Product Identity

### Name
**Mkindayzir**

### Tagline
"Your Operations, Your Server, Your Control."

### Identity Rules
- The name "Mkindayzir" must appear in: package.json, all UI elements, page titles, meta tags, database names, Docker image names, CLI commands, API responses, error messages, documentation, comments, configuration files, environment variables, and any user-facing text.
- NO references to: Jira, Trello, Obsidian, Kanban (as a product name), or any other existing product name anywhere in the codebase.
- Features inspired by other products use generic terminology only:
  - "Project Tracker" (not "Jira module")
  - "Task Boards" or "Visual Boards" (not "Trello boards" or "Kanban boards")
  - "Knowledge Vault" (not "Obsidian vault")
  - "Sprints" -> "Iterations"
  - "Epics" -> "Initiatives"
  - "Stories" -> "Work Items"

### Internal Terminology

| Concept | Mkindayzir Term |
|---------|-----------------|
| Project | **Project** |
| Sprint | **Iteration** |
| Epic | **Initiative** |
| Story/Task/Bug | **Work Item** (with type: task, bug, feature, improvement) |
| Board | **Board** |
| Card | **Card** |
| List/Column | **Column** |
| Workspace | **Space** |
| Knowledge article | **Document** or **Note** |
| Vault | **Vault** |
| Wiki link | **Internal Link** |
| AI Copilot | **Mkindayzir Assistant** |
| Help Center | **Guide Center** |

---

## 2. Core Principles

1. **Local-First**: The application runs entirely on the user's infrastructure. No external services required for core functionality.
2. **Offline-Capable**: Frontend caches data locally. Users can view and draft changes offline. Changes sync when the server is reachable again.
3. **Self-Hosted**: Deploys via single command (`docker compose up` OR `npx mkindayzir`).
4. **Runs Anywhere**: From an old laptop with 4GB RAM to a company server. Adapts to available resources. Works on Linux and Windows.
5. **Independent**: Zero references to other products. Mkindayzir is its own brand.
6. **Secure by Default**: No data leaves the network. AI is opt-in and uses user-provided keys.
7. **Future-Ready**: Architecture supports AI Agent and MCP integration without rebuilding.
8. **Modern & Customizable**: Clean, modern UI with design tokens that are easy to customize and rebrand.
9. **Desktop Browser Only**: Optimized for laptop/desktop screens (1024px+ width). No mobile phone layout.

---

## 3. Deployment Profiles

Mkindayzir supports three deployment profiles, determined by environment variable `MKINDAYZIR_MODE`:

### 3.1 Personal Mode (Single User, Old Laptop)

| Aspect | Configuration |
|--------|--------------|
| Database | **SQLite** (single file, zero config) |
| Users | 1 (auto-login option available) |
| RAM required | **256MB minimum**, 512MB recommended |
| Docker | **NOT required** |
| Installation | `npx mkindayzir` or clone + run |
| Real-time | Disabled (single user) |
| Background jobs | Inline (no workers) |
| Auth | Simple password, optional auto-login |
| WebSocket | Disabled |
| PostgreSQL | Not needed |
| File storage | `~/mkindayzir-data/` (user home) |
| Admin panel | Hidden (user is always admin) |
| Teams | Hidden |

**Target**: Individual developer, freelancer, or anyone on their personal laptop.

### 3.2 Team Mode (2-20 Users, LAN Server)

| Aspect | Configuration |
|--------|--------------|
| Database | **PostgreSQL** (via Docker or system install) |
| Users | 2-20 |
| RAM required | **1GB minimum**, 2GB recommended |
| Docker | Recommended |
| Installation | `docker compose up` or bare metal |
| Real-time | Enabled (WebSocket) |
| Background jobs | In-process event queue |
| Auth | Full auth with sessions and RBAC |
| File storage | `/data/uploads/` |

**Target**: Small team or startup with a shared machine.

### 3.3 Enterprise Mode (20+ Users, Dedicated Server)

| Aspect | Configuration |
|--------|--------------|
| Database | **PostgreSQL** (dedicated, tuned) |
| Users | 20-500+ |
| RAM required | **2GB minimum**, 4GB+ recommended |
| Docker | Docker Compose with nginx |
| Installation | Docker Compose + SSL termination |
| Real-time | Full WebSocket with room broadcasting |
| Background jobs | Event-driven |
| Auth | Full RBAC, audit logging, session management |
| File storage | Local or S3-compatible |

**Target**: Company with IT infrastructure.

### Hardware Minimum Requirements

| Profile | CPU | RAM (system) | Disk | OS |
|---------|-----|------|------|---|
| Personal | Any dual-core | 4GB | 500MB free | Linux or Windows |
| Team | 2+ cores | 4GB+ | 2GB free | Linux or Windows |
| Enterprise | 4+ cores | 8GB+ | 10GB+ free | Linux (recommended) |

---

## 4. Technology Stack

### Core Stack

| Layer | Technology | Version | Why |
|-------|-----------|---------|-----|
| Runtime | Node.js | 20 LTS | Stable, cross-platform, same language as frontend |
| Framework | Next.js | 14+ (App Router) | Full-stack TypeScript, SSR, API routes, code splitting, huge ecosystem |
| Language | TypeScript | 5.x | Type safety end-to-end, fewer bugs, better DX |
| Database (Team/Enterprise) | PostgreSQL | 16+ | ACID, full-text search, JSON, battle-tested |
| Database (Personal) | SQLite | via better-sqlite3 | Zero-config, single file, instant queries |
| ORM | Prisma | 5.x | Type-safe, supports PostgreSQL AND SQLite, migrations |
| Auth | Custom (bcrypt + server sessions) | - | Full control, no external dependency |
| Styling | Tailwind CSS | 3.x | Utility-first, fully customizable, no CDN, tree-shakes unused styles |
| Component Library | Radix UI (headless) + custom styled | - | Accessible primitives, fully customizable look |
| Icons | Lucide React | - | Consistent, lightweight, tree-shakeable |
| State Management | Zustand | 4.x | Lightweight, simple API, persistent stores |
| Server State | TanStack Query | 5.x | Caching, background refetch, optimistic updates, stale-while-revalidate |
| Forms | React Hook Form + Zod | - | Performant forms with type-safe validation |
| Offline Storage | IndexedDB (via Dexie.js) | - | Client-side structured storage |
| Service Worker | Serwist | - | Next.js PWA integration (caching only, not for mobile install) |
| Real-Time | Native WebSocket (ws library) | - | Lightweight, no Socket.io bloat |
| Drag & Drop | dnd-kit | - | Accessible, performant, keyboard support |
| Rich Text Editor | Tiptap | 2.x | Extensible Markdown editor, customizable toolbar |
| Graph Visualization | D3.js (npm, bundled) | 7.x | Force-directed graph, canvas rendering |
| Charts | Recharts | - | Simple, composable React charts |
| Search | PostgreSQL FTS + pg_trgm / SQLite FTS5 | - | No external search engine |
| Containerization | Docker + Docker Compose | - | Single-command deployment |
| Package Manager | pnpm | 9.x | Fast, disk-efficient |
| Logging | Pino | - | Fastest Node.js structured logger |
| Validation | Zod | 3.x | Runtime type validation, shared between client and server |

### Development Tools

| Tool | Purpose |
|------|---------|
| ESLint | Linting (strict TypeScript rules) |
| Prettier | Code formatting |
| Vitest | Unit & integration testing |
| Playwright | E2E browser testing |
| Husky + lint-staged | Pre-commit quality gates |
| tsx | TypeScript execution for scripts |
| Prisma Studio | Visual database browser (dev only) |

### Why This Stack Makes the App Smooth

1. **Next.js SSR**: First page loads fast (server-rendered HTML, no blank white screen)
2. **Code splitting**: Each page loads only its code (small bundles)
3. **SQLite (Personal)**: Queries execute in <1ms (data is on same disk)
4. **TanStack Query cache**: Navigation between pages is instant (data pre-fetched)
5. **Tailwind CSS**: Tiny CSS bundle (only used utilities shipped)
6. **No external CDN calls**: Everything bundled locally (fonts, icons, D3, etc.)
7. **Virtual scrolling**: Lists of 10,000+ items render smoothly
8. **Optimistic UI**: Actions feel instant (UI updates before server confirms)

### Why This Stack is Easy to Customize

1. **Tailwind + CSS Variables**: Change colors/fonts by editing 10 lines of tokens
2. **Radix UI (headless)**: Components have no built-in styles — you control every pixel
3. **Component-based React**: Replace any component without touching others
4. **TypeScript**: Refactoring is safe — the compiler catches mistakes
5. **Prisma schema**: Database changes are as simple as editing the schema and running a migration
6. **Service layer**: Business logic is isolated — easy to modify rules

---

## 5. System Architecture

### High-Level Diagram

```
+-------------------------------------------------------------------+
|                     Client (Desktop Browser)                        |
|  +---------------------------------------------------------------+ |
|  |  Next.js React App (SSR + Client Components)                  | |
|  |  +-------------+  +--------------+  +---------------------+   | |
|  |  | Service     |  | IndexedDB    |  | Zustand + TanStack  |   | |
|  |  | Worker      |  | (Dexie.js)   |  | Query (State)       |   | |
|  |  | (Serwist)   |  | Offline Cache |  |                     |   | |
|  |  +-------------+  +--------------+  +---------------------+   | |
|  +---------------------------------------------------------------+ |
+------------------------------+------------------------------------+
                               | HTTP(S) / WebSocket
+------------------------------v------------------------------------+
|                     Mkindayzir Server                              |
|  +---------------------------------------------------------------+|
|  |  Custom Node.js Server (server.ts)                            ||
|  |  +-------------+  +--------------+  +------------------+     ||
|  |  | Next.js     |  | API Routes   |  | WebSocket Server |     ||
|  |  | SSR Handler |  | /api/*       |  | (ws library)     |     ||
|  |  |             |  | REST + SSE   |  | (Team/Ent only)  |     ||
|  |  +-------------+  +------+-------+  +------------------+     ||
|  |                          |                                     ||
|  |  +-----------------------v-----------------------------------+ ||
|  |  |  Service Layer (Business Logic)                           | ||
|  |  |  +----------+ +--------+ +-------+ +------+ +----------+ | ||
|  |  |  | Projects | | Boards | | Vault | | AI   | | Reports  | | ||
|  |  |  | Service  | | Service| | Svc   | | Svc  | | Service  | | ||
|  |  |  +----------+ +--------+ +-------+ +------+ +----------+ | ||
|  |  +-----------------------+-----------------------------------+ ||
|  |                          |                                     ||
|  |  +-----------------------v-----------------------------------+ ||
|  |  |  Data Access Layer (Prisma ORM)                           | ||
|  |  |  Supports: PostgreSQL OR SQLite (based on mode)           | ||
|  |  +-----------------------------------------------------------+ ||
|  +---------------------------------------------------------------+|
|                               |                                    |
|  +----------------------------v------+  +------------------------+ |
|  |  PostgreSQL 16 OR SQLite file     |  | File System            | |
|  |  (based on MKINDAYZIR_MODE)       |  | /data/uploads/         | |
|  +-----------------------------------+  +------------------------+ |
+-------------------------------------------------------------------+
                               |
                               | HTTPS (outbound, AI only, optional)
                               v
                    +---------------------+
                    |  AI Provider API    |
                    |  (User's own key)   |
                    +---------------------+
```

### Custom Server (server.ts)

Next.js API routes cannot maintain persistent WebSocket connections. We solve this with a thin custom server wrapper:

```typescript
// server.ts — Application entry point
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { WebSocketServer } from 'ws';
import { setupWebSocket } from './src/lib/websocket';
import { getConfig } from './src/lib/config';

const config = getConfig();
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res, parse(req.url!, true));
  });

  // Only enable WebSocket in Team/Enterprise mode
  if (config.mode !== 'personal') {
    const wss = new WebSocketServer({ server, path: '/ws' });
    setupWebSocket(wss);
  }

  server.listen(config.port, () => {
    console.log(`Mkindayzir running at http://localhost:${config.port}`);
  });
});
```

This gives us:
- Next.js handles all HTTP (pages + API routes) on one port
- WebSocket on the same port at `/ws` (Team/Enterprise only)
- Single process, single port — trivial deployment
- Disabled WebSocket in Personal Mode (saves memory)

### Key Architecture Decisions

1. **Monolithic Full-Stack**: One process handles everything. Simple to deploy, debug, and maintain.
2. **Service Layer Pattern**: All business logic in `src/services/`. API routes are thin wrappers. This enables future AI Agent and MCP tools to call the same logic.
3. **Event Bus**: Internal pub/sub for decoupled side effects (notifications, activity log, WebSocket broadcast, search indexing).
4. **Repository Pattern**: Data access abstracted through repository classes wrapping Prisma.
5. **Adaptive Features**: WebSocket, audit logging, and team features conditionally enabled based on deployment mode.

---

## 6. Project Structure

```
mkindayzir/
|-- .github/                          # CI/CD workflows
|   +-- workflows/
|       |-- ci.yml
|       +-- release.yml
|-- docker/                           # Docker configuration
|   |-- Dockerfile
|   |-- Dockerfile.dev
|   |-- docker-compose.yml
|   |-- docker-compose.dev.yml
|   +-- nginx.conf
|-- prisma/                           # Database
|   |-- schema.prisma                 # Schema definition (multi-provider)
|   |-- migrations/                   # PostgreSQL migrations
|   |-- sqlite-migrations/            # SQLite migrations (separate)
|   +-- seed.ts                       # Seed data (workflows, guides)
|-- public/                           # Static assets (served directly)
|   |-- favicon.ico
|   |-- logo.svg
|   +-- icons/                        # App icons
|-- src/
|   |-- app/                          # Next.js App Router
|   |   |-- (auth)/                   # Auth route group (no shell)
|   |   |   |-- login/page.tsx
|   |   |   |-- setup/page.tsx        # First-run wizard
|   |   |   +-- forgot-password/page.tsx
|   |   |-- (dashboard)/              # Protected route group (with shell)
|   |   |   |-- layout.tsx            # Dashboard shell (sidebar + header)
|   |   |   |-- page.tsx              # Home/Dashboard
|   |   |   |-- projects/
|   |   |   |   |-- page.tsx          # Project list
|   |   |   |   +-- [projectId]/
|   |   |   |       |-- page.tsx      # Project overview
|   |   |   |       |-- board/page.tsx # Board view
|   |   |   |       |-- backlog/page.tsx
|   |   |   |       |-- iterations/page.tsx
|   |   |   |       |-- settings/page.tsx
|   |   |   |       +-- work-items/[itemId]/page.tsx
|   |   |   |-- boards/
|   |   |   |   |-- page.tsx          # Spaces & boards list
|   |   |   |   +-- [boardId]/page.tsx # Board view
|   |   |   |-- vault/
|   |   |   |   |-- page.tsx          # Vault explorer
|   |   |   |   |-- [noteId]/page.tsx  # Note view/edit
|   |   |   |   +-- graph/page.tsx     # Graph visualization
|   |   |   |-- assistant/
|   |   |   |   |-- page.tsx          # Conversations list / new
|   |   |   |   +-- [conversationId]/page.tsx
|   |   |   |-- guides/page.tsx
|   |   |   |-- reports/page.tsx
|   |   |   |-- admin/
|   |   |   |   |-- page.tsx
|   |   |   |   |-- users/page.tsx
|   |   |   |   |-- teams/page.tsx
|   |   |   |   |-- settings/page.tsx
|   |   |   |   +-- audit/page.tsx
|   |   |   +-- settings/page.tsx     # User settings
|   |   |-- api/                      # API Routes
|   |   |   |-- auth/[...]/route.ts
|   |   |   |-- projects/[...]/route.ts
|   |   |   |-- work-items/[...]/route.ts
|   |   |   |-- boards/[...]/route.ts
|   |   |   |-- cards/[...]/route.ts
|   |   |   |-- vault/[...]/route.ts
|   |   |   |-- assistant/[...]/route.ts
|   |   |   |-- search/route.ts
|   |   |   |-- notifications/[...]/route.ts
|   |   |   |-- reports/[...]/route.ts
|   |   |   |-- uploads/[...]/route.ts
|   |   |   |-- admin/[...]/route.ts
|   |   |   |-- guides/[...]/route.ts
|   |   |   |-- settings/[...]/route.ts
|   |   |   +-- health/route.ts
|   |   |-- layout.tsx                # Root layout
|   |   +-- globals.css               # Global styles + Tailwind imports
|   |-- components/                   # React Components
|   |   |-- ui/                       # Base UI primitives (customizable)
|   |   |   |-- button.tsx
|   |   |   |-- input.tsx
|   |   |   |-- textarea.tsx
|   |   |   |-- select.tsx
|   |   |   |-- dialog.tsx
|   |   |   |-- dropdown-menu.tsx
|   |   |   |-- popover.tsx
|   |   |   |-- tooltip.tsx
|   |   |   |-- toast.tsx
|   |   |   |-- badge.tsx
|   |   |   |-- avatar.tsx
|   |   |   |-- data-table.tsx
|   |   |   |-- tabs.tsx
|   |   |   |-- card.tsx
|   |   |   |-- skeleton.tsx
|   |   |   |-- separator.tsx
|   |   |   |-- progress.tsx
|   |   |   +-- ... (more primitives)
|   |   |-- layout/                   # Layout components
|   |   |   |-- app-shell.tsx         # Sidebar + content layout
|   |   |   |-- sidebar.tsx           # Left navigation panel
|   |   |   |-- header.tsx            # Top bar
|   |   |   |-- breadcrumbs.tsx
|   |   |   +-- command-palette.tsx   # Cmd+K search/actions
|   |   |-- projects/                 # Project module components
|   |   |-- boards/                   # Board module components
|   |   |-- vault/                    # Vault module components
|   |   |-- assistant/                # AI module components
|   |   +-- shared/                   # Cross-module components
|   |       |-- comment-thread.tsx
|   |       |-- activity-feed.tsx
|   |       |-- file-upload.tsx
|   |       |-- markdown-renderer.tsx
|   |       +-- empty-state.tsx
|   |-- services/                     # Business Logic Layer
|   |   |-- project.service.ts
|   |   |-- work-item.service.ts
|   |   |-- board.service.ts
|   |   |-- card.service.ts
|   |   |-- vault.service.ts
|   |   |-- assistant.service.ts
|   |   |-- auth.service.ts
|   |   |-- notification.service.ts
|   |   |-- search.service.ts
|   |   |-- report.service.ts
|   |   |-- upload.service.ts
|   |   +-- audit.service.ts
|   |-- repositories/                 # Data Access Layer
|   |   |-- base.repository.ts
|   |   |-- project.repository.ts
|   |   |-- work-item.repository.ts
|   |   |-- board.repository.ts
|   |   |-- vault.repository.ts
|   |   +-- user.repository.ts
|   |-- lib/                          # Shared utilities
|   |   |-- prisma.ts                 # Prisma client singleton
|   |   |-- auth.ts                   # Session utilities
|   |   |-- events.ts                 # Internal event bus
|   |   |-- errors.ts                 # Custom error classes
|   |   |-- validators.ts             # Shared Zod schemas
|   |   |-- constants.ts              # APP_NAME, APP_SLUG, etc.
|   |   |-- encryption.ts             # AES-256-GCM for API keys
|   |   |-- rate-limiter.ts           # In-memory rate limiting
|   |   |-- logger.ts                 # Pino logger setup
|   |   |-- config.ts                 # Runtime config (mode, features)
|   |   |-- websocket.ts              # WebSocket server setup
|   |   |-- i18n.ts                   # String extraction helper
|   |   +-- utils.ts                  # General helpers
|   |-- hooks/                        # React hooks
|   |   |-- use-offline.ts            # Online/offline detection
|   |   |-- use-sync.ts               # Sync queue status
|   |   |-- use-realtime.ts           # WebSocket subscription
|   |   |-- use-search.ts             # Debounced search
|   |   +-- use-auth.ts               # Session context
|   |-- stores/                       # Zustand stores
|   |   |-- app.store.ts              # UI state (sidebar, theme)
|   |   |-- offline.store.ts          # Offline queue state
|   |   +-- notification.store.ts     # Notification state
|   |-- offline/                      # Offline/sync layer
|   |   |-- db.ts                     # Dexie.js IndexedDB schema
|   |   |-- sync-engine.ts            # Queue processor
|   |   |-- cache-strategy.ts         # What to cache, when to invalidate
|   |   +-- conflict-resolver.ts      # Last-write-wins logic
|   |-- types/                        # TypeScript types
|   |   |-- api.types.ts              # Request/response types
|   |   |-- models.types.ts           # Domain model types
|   |   |-- events.types.ts           # Event payload types
|   |   +-- index.ts                  # Re-exports
|   +-- config/                       # Application configuration
|       |-- navigation.ts             # Sidebar nav items
|       |-- permissions.ts            # RBAC definitions
|       |-- defaults.ts               # Default values
|       +-- features.ts               # Feature flags per mode
|-- server.ts                         # Custom server entry point
|-- tests/
|   |-- unit/                         # Unit tests
|   |-- integration/                  # API + DB tests
|   |-- e2e/                          # Playwright browser tests
|   +-- fixtures/                     # Test data
|-- scripts/
|   |-- setup.ts                      # CLI first-run setup
|   |-- backup.ts                     # Backup script
|   |-- restore.ts                    # Restore script
|   +-- migrate-from-opsdesk.ts       # One-time legacy migration
|-- locales/
|   +-- en.json                       # English strings
|-- docs/
|   |-- ARCHITECTURE.md
|   |-- DEPLOYMENT.md
|   |-- API.md
|   |-- DEVELOPMENT.md
|   +-- CONTRIBUTING.md
|-- .env.example
|-- next.config.ts
|-- tailwind.config.ts
|-- tsconfig.json
|-- vitest.config.ts
|-- playwright.config.ts
|-- package.json
|-- pnpm-lock.yaml
+-- README.md
```

---

## 7. Database Architecture

### Multi-Provider Strategy

Prisma supports both PostgreSQL and SQLite from the same schema:

```
Personal Mode:  DATABASE_PROVIDER=sqlite   DATABASE_URL=file:./data/mkindayzir.db
Team/Enterprise: DATABASE_PROVIDER=postgresql  DATABASE_URL=postgresql://...
```

### Design Principles

1. **Dual-provider compatible** — No PostgreSQL-only features in Prisma schema.
2. **Full-text search** — PostgreSQL: `tsvector` + `pg_trgm`. SQLite: FTS5 virtual tables. Applied via raw SQL migrations (not in schema).
3. **JSON stored as String** — Prisma's `Json` type behaves differently per provider. Using `String` + manual parse/stringify is safer.
4. **No enums in schema** — Use `String` type with documented valid values. This avoids migrations for new values and works across both databases.
5. **Soft deletes** — Major entities have `deletedAt` column.
6. **Audit trail** — All mutations logged (configurable per mode).

### Complete Schema

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = env("DATABASE_PROVIDER") // "postgresql" or "sqlite"
  url      = env("DATABASE_URL")
}

// ============================================================
// AUTHENTICATION & USERS
// ============================================================

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  passwordHash  String
  displayName   String
  avatar        String?
  role          String    @default("MEMBER") // ADMIN, MANAGER, MEMBER, VIEWER
  status        String    @default("ACTIVE") // ACTIVE, INACTIVE, LOCKED
  timezone      String    @default("UTC")
  locale        String    @default("en")
  preferences   String    @default("{}") // JSON
  aiApiKey      String?   // Encrypted at rest (AES-256-GCM)
  aiProvider    String?   // openrouter, openai, anthropic, custom
  aiModel       String?   // Model identifier
  lastActiveAt  DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime?

  teamMemberships TeamMember[]
  assignedItems   WorkItem[]     @relation("assignee")
  reportedItems   WorkItem[]     @relation("reporter")
  createdProjects Project[]      @relation("creator")
  cards           CardMember[]
  comments        Comment[]
  activities      Activity[]
  notifications   Notification[]
  conversations   Conversation[]
  sessions        Session[]
  vaultNotes      VaultNote[]    @relation("author")

  @@map("users")
}

model Session {
  id        String   @id @default(cuid())
  userId    String
  token     String   @unique
  expiresAt DateTime
  ipAddress String?
  userAgent String?
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("sessions")
}

model Team {
  id          String    @id @default(cuid())
  name        String
  description String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?

  members  TeamMember[]
  projects Project[]

  @@map("teams")
}

model TeamMember {
  id       String   @id @default(cuid())
  userId   String
  teamId   String
  role     String   @default("MEMBER") // LEAD, MEMBER
  joinedAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  team Team @relation(fields: [teamId], references: [id], onDelete: Cascade)

  @@unique([userId, teamId])
  @@map("team_members")
}

// ============================================================
// PROJECT TRACKER
// ============================================================

model Project {
  id          String    @id @default(cuid())
  key         String    @unique
  name        String
  description String?
  status      String    @default("ACTIVE") // ACTIVE, ARCHIVED, COMPLETED
  leadId      String?
  teamId      String?
  settings    String    @default("{}") // JSON
  createdById String
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?

  creator     User        @relation("creator", fields: [createdById], references: [id])
  team        Team?       @relation(fields: [teamId], references: [id])
  workItems   WorkItem[]
  iterations  Iteration[]
  initiatives Initiative[]
  workflows   Workflow[]
  labels      Label[]

  @@map("projects")
}

model WorkItem {
  id           String    @id @default(cuid())
  projectId    String
  number       Int
  type         String    // TASK, BUG, FEATURE, IMPROVEMENT
  title        String
  description  String?
  status       String
  priority     String    @default("MEDIUM") // CRITICAL, HIGH, MEDIUM, LOW
  assigneeId   String?
  reporterId   String
  initiativeId String?
  iterationId  String?
  parentId     String?
  storyPoints  Int?
  dueDate      DateTime?
  resolvedAt   DateTime?
  metadata     String    @default("{}")
  position     Int       @default(0)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  deletedAt    DateTime?

  project    Project     @relation(fields: [projectId], references: [id])
  assignee   User?       @relation("assignee", fields: [assigneeId], references: [id])
  reporter   User        @relation("reporter", fields: [reporterId], references: [id])
  initiative Initiative? @relation(fields: [initiativeId], references: [id])
  iteration  Iteration?  @relation(fields: [iterationId], references: [id])
  parent     WorkItem?   @relation("subtasks", fields: [parentId], references: [id])
  children   WorkItem[]  @relation("subtasks")
  labels     WorkItemLabel[]
  links      WorkItemLink[] @relation("source")
  linkedBy   WorkItemLink[] @relation("target")

  @@unique([projectId, number])
  @@index([projectId, status])
  @@index([assigneeId])
  @@index([iterationId])
  @@map("work_items")
}

model WorkItemLink {
  id        String   @id @default(cuid())
  sourceId  String
  targetId  String
  linkType  String   // BLOCKS, BLOCKED_BY, RELATES_TO, DUPLICATES
  createdAt DateTime @default(now())

  source WorkItem @relation("source", fields: [sourceId], references: [id], onDelete: Cascade)
  target WorkItem @relation("target", fields: [targetId], references: [id], onDelete: Cascade)

  @@unique([sourceId, targetId, linkType])
  @@map("work_item_links")
}

model Iteration {
  id        String    @id @default(cuid())
  projectId String
  name      String
  goal      String?
  status    String    @default("PLANNING") // PLANNING, ACTIVE, COMPLETED, CANCELLED
  startDate DateTime?
  endDate   DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  project   Project    @relation(fields: [projectId], references: [id])
  workItems WorkItem[]

  @@map("iterations")
}

model Initiative {
  id          String    @id @default(cuid())
  projectId   String
  name        String
  description String?
  status      String    @default("OPEN") // OPEN, IN_PROGRESS, COMPLETED, CANCELLED
  progress    Float     @default(0)
  startDate   DateTime?
  targetDate  DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  project   Project    @relation(fields: [projectId], references: [id])
  workItems WorkItem[]

  @@map("initiatives")
}

model Workflow {
  id          String   @id @default(cuid())
  projectId   String
  name        String
  statuses    String   // JSON: [{id, name, category: "todo"|"in_progress"|"done", color}]
  transitions String   // JSON: [{from, to}]
  isDefault   Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  project Project @relation(fields: [projectId], references: [id])

  @@map("workflows")
}

model Label {
  id        String   @id @default(cuid())
  projectId String
  name      String
  color     String
  createdAt DateTime @default(now())

  project   Project         @relation(fields: [projectId], references: [id])
  workItems WorkItemLabel[]

  @@unique([projectId, name])
  @@map("labels")
}

model WorkItemLabel {
  workItemId String
  labelId    String

  workItem WorkItem @relation(fields: [workItemId], references: [id], onDelete: Cascade)
  label    Label    @relation(fields: [labelId], references: [id], onDelete: Cascade)

  @@id([workItemId, labelId])
  @@map("work_item_labels")
}

// ============================================================
// VISUAL TASK BOARDS
// ============================================================

model Space {
  id          String    @id @default(cuid())
  name        String
  description String?
  visibility  String    @default("PRIVATE") // PRIVATE, TEAM, PUBLIC
  createdById String
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?

  boards  Board[]
  members SpaceMember[]

  @@map("spaces")
}

model SpaceMember {
  id      String @id @default(cuid())
  spaceId String
  userId  String
  role    String @default("MEMBER") // OWNER, ADMIN, MEMBER, VIEWER

  space Space @relation(fields: [spaceId], references: [id], onDelete: Cascade)

  @@unique([spaceId, userId])
  @@map("space_members")
}

model Board {
  id          String    @id @default(cuid())
  spaceId     String
  name        String
  description String?
  background  String?
  settings    String    @default("{}")
  position    Int       @default(0)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?

  space       Space        @relation(fields: [spaceId], references: [id])
  columns     Column[]
  boardLabels BoardLabel[]

  @@map("boards")
}

model Column {
  id        String   @id @default(cuid())
  boardId   String
  name      String
  position  Int      @default(0)
  limit     Int?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  board Board  @relation(fields: [boardId], references: [id], onDelete: Cascade)
  cards Card[]

  @@map("columns")
}

model Card {
  id          String    @id @default(cuid())
  columnId    String
  title       String
  description String?
  position    Int       @default(0)
  dueDate     DateTime?
  coverColor  String?
  metadata    String    @default("{}")
  createdById String
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?

  column     Column       @relation(fields: [columnId], references: [id], onDelete: Cascade)
  members    CardMember[]
  checklists Checklist[]
  cardLabels CardLabel[]

  @@index([columnId, position])
  @@map("cards")
}

model CardMember {
  cardId String
  userId String

  card Card @relation(fields: [cardId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([cardId, userId])
  @@map("card_members")
}

model Checklist {
  id       String @id @default(cuid())
  cardId   String
  name     String
  position Int    @default(0)

  card  Card            @relation(fields: [cardId], references: [id], onDelete: Cascade)
  items ChecklistItem[]

  @@map("checklists")
}

model ChecklistItem {
  id          String  @id @default(cuid())
  checklistId String
  title       String
  isCompleted Boolean @default(false)
  position    Int     @default(0)

  checklist Checklist @relation(fields: [checklistId], references: [id], onDelete: Cascade)

  @@map("checklist_items")
}

model BoardLabel {
  id      String @id @default(cuid())
  boardId String
  name    String
  color   String

  board Board       @relation(fields: [boardId], references: [id], onDelete: Cascade)
  cards CardLabel[]

  @@unique([boardId, name])
  @@map("board_labels")
}

model CardLabel {
  cardId  String
  labelId String

  card  Card       @relation(fields: [cardId], references: [id], onDelete: Cascade)
  label BoardLabel @relation(fields: [labelId], references: [id], onDelete: Cascade)

  @@id([cardId, labelId])
  @@map("card_labels")
}

// ============================================================
// KNOWLEDGE VAULT
// ============================================================

model VaultFolder {
  id        String    @id @default(cuid())
  parentId  String?
  name      String
  path      String
  position  Int       @default(0)
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  parent   VaultFolder?  @relation("subfolders", fields: [parentId], references: [id])
  children VaultFolder[] @relation("subfolders")
  notes    VaultNote[]

  @@unique([parentId, name])
  @@map("vault_folders")
}

model VaultNote {
  id          String    @id @default(cuid())
  folderId    String?
  title       String
  slug        String    @unique
  content     String
  excerpt     String?
  status      String    @default("DRAFT") // DRAFT, PUBLISHED, ARCHIVED
  authorId    String
  metadata    String    @default("{}")
  version     Int       @default(1)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?
  publishedAt DateTime?

  folder   VaultFolder?   @relation(fields: [folderId], references: [id])
  author   User           @relation("author", fields: [authorId], references: [id])
  tags     NoteTag[]
  outLinks InternalLink[] @relation("source")
  inLinks  InternalLink[] @relation("target")
  versions NoteVersion[]
  feedback NoteFeedback[]

  @@index([folderId])
  @@index([authorId])
  @@map("vault_notes")
}

model NoteVersion {
  id        String   @id @default(cuid())
  noteId    String
  version   Int
  title     String
  content   String
  editedBy  String
  createdAt DateTime @default(now())

  note VaultNote @relation(fields: [noteId], references: [id], onDelete: Cascade)

  @@unique([noteId, version])
  @@map("note_versions")
}

model InternalLink {
  id       String  @id @default(cuid())
  sourceId String
  targetId String
  context  String?

  source VaultNote @relation("source", fields: [sourceId], references: [id], onDelete: Cascade)
  target VaultNote @relation("target", fields: [targetId], references: [id], onDelete: Cascade)

  @@unique([sourceId, targetId])
  @@map("internal_links")
}

model Tag {
  id    String  @id @default(cuid())
  name  String  @unique
  color String?

  notes NoteTag[]

  @@map("tags")
}

model NoteTag {
  noteId String
  tagId  String

  note VaultNote @relation(fields: [noteId], references: [id], onDelete: Cascade)
  tag  Tag       @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([noteId, tagId])
  @@map("note_tags")
}

model NoteFeedback {
  id        String   @id @default(cuid())
  noteId    String
  userId    String
  helpful   Boolean
  comment   String?
  createdAt DateTime @default(now())

  note VaultNote @relation(fields: [noteId], references: [id], onDelete: Cascade)

  @@unique([noteId, userId])
  @@map("note_feedback")
}

// ============================================================
// AI ASSISTANT
// ============================================================

model Conversation {
  id        String    @id @default(cuid())
  userId    String
  title     String?
  model     String?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  user     User      @relation(fields: [userId], references: [id])
  messages Message[]

  @@index([userId])
  @@map("conversations")
}

model Message {
  id             String   @id @default(cuid())
  conversationId String
  role           String   // USER, ASSISTANT, SYSTEM, TOOL
  content        String
  toolCalls      String?  // JSON
  toolResults    String?  // JSON
  model          String?
  tokens         Int?
  createdAt      DateTime @default(now())

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId])
  @@map("messages")
}

// ============================================================
// SHARED / CROSS-CUTTING
// ============================================================

model Comment {
  id         String    @id @default(cuid())
  entityType String
  entityId   String
  authorId   String
  content    String
  parentId   String?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt
  deletedAt  DateTime?

  author  User      @relation(fields: [authorId], references: [id])
  parent  Comment?  @relation("replies", fields: [parentId], references: [id])
  replies Comment[] @relation("replies")

  @@index([entityType, entityId])
  @@map("comments")
}

model Attachment {
  id          String   @id @default(cuid())
  entityType  String
  entityId    String
  fileName    String
  fileSize    Int
  mimeType    String
  storagePath String
  uploadedBy  String
  createdAt   DateTime @default(now())

  @@index([entityType, entityId])
  @@map("attachments")
}

model Activity {
  id         String   @id @default(cuid())
  entityType String
  entityId   String
  userId     String
  action     String
  changes    String?  // JSON
  createdAt  DateTime @default(now())

  user User @relation(fields: [userId], references: [id])

  @@index([entityType, entityId])
  @@index([userId])
  @@map("activities")
}

model Notification {
  id         String    @id @default(cuid())
  userId     String
  type       String
  title      String
  body       String?
  entityType String?
  entityId   String?
  isRead     Boolean   @default(false)
  readAt     DateTime?
  createdAt  DateTime  @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, isRead])
  @@map("notifications")
}

model AuditLog {
  id         String   @id @default(cuid())
  userId     String?
  action     String
  resource   String
  resourceId String?
  details    String?
  ipAddress  String?
  userAgent  String?
  createdAt  DateTime @default(now())

  @@index([userId])
  @@index([resource, resourceId])
  @@index([createdAt])
  @@map("audit_logs")
}

model Guide {
  id        String   @id @default(cuid())
  title     String
  slug      String   @unique
  content   String
  category  String
  order     Int      @default(0)
  status    String   @default("PUBLISHED") // DRAFT, PUBLISHED, ARCHIVED
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("guides")
}

model SystemConfig {
  id        String   @id @default(cuid())
  key       String   @unique
  value     String   // JSON
  updatedAt DateTime @updatedAt

  @@map("system_config")
}
```

### Full-Text Search (Applied via Raw SQL Migrations)

**PostgreSQL:**
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_work_items_fts ON work_items USING GIN (to_tsvector('english', title || ' ' || COALESCE(description, '')));
CREATE INDEX idx_vault_notes_fts ON vault_notes USING GIN (to_tsvector('english', title || ' ' || COALESCE(content, '')));
CREATE INDEX idx_cards_fts ON cards USING GIN (to_tsvector('english', title || ' ' || COALESCE(description, '')));
CREATE INDEX idx_work_items_trgm ON work_items USING GIN (title gin_trgm_ops);
```

**SQLite:**
```sql
CREATE VIRTUAL TABLE work_items_fts USING fts5(title, description, content='work_items', content_rowid='rowid');
CREATE VIRTUAL TABLE vault_notes_fts USING fts5(title, content, content='vault_notes', content_rowid='rowid');
CREATE VIRTUAL TABLE cards_fts USING fts5(title, description, content='cards', content_rowid='rowid');
```

---

## 8. Backend Architecture

### Service Layer

All business logic lives in service classes. API routes are thin:

```typescript
// Pattern: API Route -> Validate -> Service -> Repository -> Database
// This enables: Future AI Agent calls same services directly
```

### Event Bus

```typescript
// Events emitted by services:
'work_item.created' | 'work_item.updated' | 'work_item.deleted'
'card.moved' | 'card.updated'
'vault_note.published'
'comment.created'

// Listeners (conditionally enabled):
// - NotificationService (creates notifications)
// - ActivityService (logs changes)
// - WebSocketBroadcaster (Team/Enterprise only)
// - SearchIndexer (updates FTS)
// - (Future) AIAgentHook
```

### Middleware Stack

```
Request -> Rate Limiter -> Auth -> RBAC -> Zod Validation -> Service -> Response -> Audit Log
```

---

## 9. Frontend Architecture

### State Management

| State Type | Tool |
|-----------|------|
| Server data | TanStack Query (stale-while-revalidate) |
| UI state | Zustand (sidebar, theme, modals) |
| Forms | React Hook Form + Zod |
| Offline cache | Dexie.js (IndexedDB) |
| Auth | Custom context + HTTP-only cookie |

### Key UI Patterns

- **Command Palette** (Cmd+K): Global search + quick actions
- **Data Tables**: Sortable, filterable, bulk actions, virtual scrolling
- **Board View**: Horizontal columns with draggable cards (dnd-kit)
- **Rich Editor**: Tiptap with Markdown, internal links, code blocks
- **Graph View**: D3 canvas-rendered force-directed graph (lazy-loaded)
- **Split Panes**: Resizable for vault explorer
- **Skeleton Loaders**: Content-shaped loading states
- **Empty States**: Helpful illustrations + action buttons
- **Toast Notifications**: Non-blocking feedback

---

## 10. UI/UX Design System

### Design Tokens (CSS Custom Properties)

All visual aspects controlled by tokens — change the look by editing one file:

```css
/* src/app/globals.css */
:root {
  /* Colors - Light theme */
  --color-bg-primary: #ffffff;
  --color-bg-secondary: #f8f9fa;
  --color-bg-tertiary: #f1f3f5;
  --color-text-primary: #1a1a2e;
  --color-text-secondary: #6c757d;
  --color-text-muted: #adb5bd;
  --color-border: #e9ecef;
  --color-accent: #4f46e5;      /* Indigo - brand color */
  --color-accent-hover: #4338ca;
  --color-accent-light: #eef2ff;
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-error: #ef4444;
  --color-info: #3b82f6;

  /* Spacing (4px grid) */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;

  /* Typography */
  --font-sans: system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  --font-size-xs: 0.75rem;
  --font-size-sm: 0.875rem;
  --font-size-base: 1rem;
  --font-size-lg: 1.125rem;
  --font-size-xl: 1.25rem;
  --font-size-2xl: 1.5rem;
  --font-size-3xl: 1.875rem;

  /* Radius */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.07);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1);

  /* Sidebar */
  --sidebar-width: 260px;
  --sidebar-collapsed-width: 64px;

  /* Transitions */
  --transition-fast: 150ms ease;
  --transition-normal: 250ms ease;
}

/* Dark theme */
[data-theme="dark"] {
  --color-bg-primary: #1a1a2e;
  --color-bg-secondary: #16213e;
  --color-bg-tertiary: #0f3460;
  --color-text-primary: #e9ecef;
  --color-text-secondary: #adb5bd;
  --color-text-muted: #6c757d;
  --color-border: #2d3748;
  --color-accent: #818cf8;
  --color-accent-hover: #6366f1;
  --color-accent-light: #1e1b4b;
}
```

### Customization Points

To rebrand or restyle Mkindayzir:
1. Edit `globals.css` tokens (colors, fonts, spacing)
2. Replace `public/logo.svg` and `public/favicon.ico`
3. Change `APP_NAME` in `src/lib/constants.ts`
4. That's it. The entire UI adapts.

### Layout Structure

```
+------------------------------------------------------------------+
| [Logo] Mkindayzir            [Cmd+K Search] [Notifications] [User]|
+----------+-------------------------------------------------------+
|          |                                                        |
| SIDEBAR  |              MAIN CONTENT AREA                         |
|          |                                                        |
| Projects |  Breadcrumb: Projects > MKZ > Board                   |
|  > MKZ   |  +----------------------------------------------+     |
|  > OPS   |  |                                              |     |
|           |  |    (Page content rendered here)             |     |
| Boards   |  |                                              |     |
|  > Dev   |  |                                              |     |
|           |  |                                              |     |
| Vault    |  |                                              |     |
|           |  |                                              |     |
| Assistant|  +----------------------------------------------+     |
|           |                                                        |
| Reports  |                                                        |
| Guides   |                                                        |
|           |                                                        |
| [Admin]  |                                                        |
| [Settings]                                                        |
+----------+-------------------------------------------------------+
```

### Visual Style

- **Clean and minimal** — generous whitespace, clear hierarchy
- **Subtle depth** — light shadows, not flat, not heavy
- **Consistent icons** — Lucide icon set throughout
- **Smooth transitions** — 150-250ms for state changes
- **Focus indicators** — clear focus rings for keyboard navigation
- **Color-coded statuses** — green (done), blue (in progress), gray (todo), red (blocked)

---

## 11. Local-First & Offline Architecture

### Strategy: Server-Authoritative with Offline Resilience

Server (database) is the source of truth. Client caches for:
1. Instant page loads (stale-while-revalidate)
2. Offline viewing (cached data accessible)
3. Offline mutations (queued, synced on reconnection)

### Service Worker (Serwist)

```
Static assets: Cache-First (hashed, immutable)
API GET: Network-First with IndexedDB fallback
API mutations: Network-Only, queued if offline
```

### Offline Mutation Queue

```typescript
interface QueuedMutation {
  id: string;
  timestamp: number;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  body: any;
  retryCount: number;
  status: 'pending' | 'syncing' | 'failed' | 'completed';
}
// Processes FIFO on reconnection. Failed after 3 retries -> notify user.
```

### Conflict Resolution

Last-write-wins with user notification on conflict (409 response).

### UI Indicators

- Header badge: green (online) / yellow (syncing) / red (offline)
- "X changes pending" counter
- Offline banner when disconnected
- Optimistic UI with revert on failure

---

## 12. Authentication & Authorization

### Authentication

| Feature | Implementation |
|---------|---------------|
| Login | Email + password (bcrypt cost 12) |
| Sessions | DB-stored, HTTP-only secure cookie, 64-char random token |
| Expiry | 24h idle, 7d absolute (configurable) |
| Password reset | Token-based (requires SMTP) |
| Brute force | 5 attempts -> 15 min lockout |
| Personal Mode | Optional auto-login (single user) |
| First-run | Setup wizard creates admin |

### RBAC (Team/Enterprise Only)

```
ADMIN > MANAGER > MEMBER > VIEWER
```

- ADMIN: Everything
- MANAGER: Projects, work items, boards, vault, teams, reports, guides
- MEMBER: Projects (read), work items, boards, vault, reports (read)
- VIEWER: Read-only access to all

Personal Mode: RBAC disabled, user is always admin.

---

## 13. Multi-User & Single-Tenant

One instance = one organization. No tenant isolation needed.

| Feature | Personal | Team | Enterprise |
|---------|----------|------|-----------|
| Users | 1 | 2-20 | Unlimited |
| Teams | Hidden | Enabled | Enabled |
| RBAC | Disabled | Enabled | Enabled |
| WebSocket | Disabled | Enabled | Enabled |
| Audit log | Minimal | Enabled | Full |
| Admin panel | Hidden | Enabled | Enabled |

---

## 14. API Architecture

### Conventions

```
Base URL: /api
Auth: Cookie-based session (or Authorization: Bearer <token>)
Format: JSON
Errors: { error: { code, message, details? } }
Lists: { data: T[], meta: { total, page, pageSize, totalPages } }
Singles: { data: T }
```

### Complete Endpoint Map

```
GET    /api/health

POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me
POST   /api/auth/forgot-password
POST   /api/auth/reset-password
GET    /api/auth/sessions
DELETE /api/auth/sessions/:id

GET    /api/projects
POST   /api/projects
GET    /api/projects/:id
PATCH  /api/projects/:id
DELETE /api/projects/:id
GET    /api/projects/:id/workflows
POST   /api/projects/:id/workflows
PATCH  /api/projects/:id/workflows/:wid
DELETE /api/projects/:id/workflows/:wid

GET    /api/work-items
POST   /api/work-items
GET    /api/work-items/:id
PATCH  /api/work-items/:id
DELETE /api/work-items/:id
POST   /api/work-items/:id/transition
GET    /api/work-items/:id/comments
POST   /api/work-items/:id/comments
GET    /api/work-items/:id/attachments
POST   /api/work-items/:id/attachments
DELETE /api/work-items/:id/attachments/:aid
GET    /api/work-items/:id/links
POST   /api/work-items/:id/links
DELETE /api/work-items/:id/links/:lid
PATCH  /api/work-items/bulk

GET    /api/iterations
POST   /api/iterations
GET    /api/iterations/:id
PATCH  /api/iterations/:id
DELETE /api/iterations/:id

GET    /api/initiatives
POST   /api/initiatives
GET    /api/initiatives/:id
PATCH  /api/initiatives/:id
DELETE /api/initiatives/:id

GET    /api/spaces
POST   /api/spaces
GET    /api/spaces/:id
PATCH  /api/spaces/:id
DELETE /api/spaces/:id
GET    /api/spaces/:id/members
POST   /api/spaces/:id/members
DELETE /api/spaces/:id/members/:uid

GET    /api/boards
POST   /api/boards
GET    /api/boards/:id
PATCH  /api/boards/:id
DELETE /api/boards/:id
POST   /api/boards/:id/columns
PATCH  /api/boards/:id/columns/:cid
DELETE /api/boards/:id/columns/:cid

POST   /api/boards/:id/cards
GET    /api/cards/:id
PATCH  /api/cards/:id
DELETE /api/cards/:id
POST   /api/cards/:id/move
POST   /api/cards/:id/members
DELETE /api/cards/:id/members/:uid
GET    /api/cards/:id/checklists
POST   /api/cards/:id/checklists
PATCH  /api/cards/:id/checklists/:clid
DELETE /api/cards/:id/checklists/:clid
POST   /api/cards/:id/labels
DELETE /api/cards/:id/labels/:lid

GET    /api/vault/folders
POST   /api/vault/folders
PATCH  /api/vault/folders/:id
DELETE /api/vault/folders/:id
GET    /api/vault/notes
POST   /api/vault/notes
GET    /api/vault/notes/:id
PATCH  /api/vault/notes/:id
DELETE /api/vault/notes/:id
POST   /api/vault/notes/:id/publish
GET    /api/vault/notes/:id/versions
GET    /api/vault/notes/:id/links
POST   /api/vault/notes/:id/feedback
GET    /api/vault/graph
GET    /api/vault/tags
POST   /api/vault/tags
DELETE /api/vault/tags/:id

GET    /api/assistant/conversations
POST   /api/assistant/conversations
GET    /api/assistant/conversations/:id
DELETE /api/assistant/conversations/:id
POST   /api/assistant/conversations/:id/chat  (SSE streaming)
GET    /api/assistant/models

GET    /api/search
GET    /api/search/suggestions

GET    /api/notifications
POST   /api/notifications/read
POST   /api/notifications/read-all

GET    /api/reports/summary
GET    /api/reports/workload
GET    /api/reports/velocity
GET    /api/reports/export

GET    /api/admin/users
POST   /api/admin/users
PATCH  /api/admin/users/:id
DELETE /api/admin/users/:id
GET    /api/admin/teams
POST   /api/admin/teams
PATCH  /api/admin/teams/:id
DELETE /api/admin/teams/:id
GET    /api/admin/audit
GET    /api/admin/settings
PATCH  /api/admin/settings
POST   /api/admin/backup
POST   /api/admin/restore

POST   /api/uploads
GET    /api/uploads/:id
DELETE /api/uploads/:id

GET    /api/guides
GET    /api/guides/:slug
POST   /api/guides
PATCH  /api/guides/:id
DELETE /api/guides/:id

GET    /api/settings
PATCH  /api/settings
GET    /api/settings/ai
PATCH  /api/settings/ai
POST   /api/settings/ai/test
```

### Rate Limiting

- General: 100 req/min per user
- AI: 20 req/min per user
- Auth: 5 req/min per IP
- Personal Mode: No rate limiting

---

## 15. AI Integration

### Proxy Architecture

Browser -> Mkindayzir Server -> AI Provider (internet required)

User's API key stays on server (encrypted). Server injects tools and system prompt.

### Supported Providers

- OpenRouter (https://openrouter.ai/api/v1) - 100+ models
- OpenAI (https://api.openai.com/v1)
- Anthropic (https://api.anthropic.com)
- Custom URL (any OpenAI-compatible, including local Ollama)

### API Key Flow

1. User goes to Settings -> AI
2. Selects provider, enters key
3. "Test Connection" validates the key
4. Key encrypted with AES-256-GCM, stored in DB
5. Never returned to frontend after storage

### Tools (Current Scope)

- `search_work_items` - Search by query/filters
- `create_work_item` - Create new item
- `update_work_item_status` - Status transition
- `search_vault` - Search vault notes
- `get_vault_note` - Get note content
- `summarize_iteration` - Progress summary

### SSE Streaming

```
POST /api/assistant/conversations/:id/chat
Response: text/event-stream

event: token       data: {"content": "partial text"}
event: tool_call   data: {"name": "search_work_items", "arguments": {...}}
event: tool_result data: {"name": "...", "result": [...]}
event: done        data: {"messageId": "...", "tokens": 342}
```

### Offline: AI features disabled with clear message. History viewable.

---

## 16. Module Specifications

### 16.1 Project Tracker

Features:
- Multiple projects with unique keys (MKZ-1, MKZ-2, etc.)
- Configurable workflows per project (custom statuses + transitions)
- Work items: Task, Bug, Feature, Improvement
- Priority: Critical, High, Medium, Low
- Iterations (time-boxed) + Initiatives (goal-grouped)
- Sub-tasks (parent/child)
- Labels, story points, due dates, assignee, reporter
- Three views: Board (drag columns), List (data table), Backlog
- Detail page: Markdown description, comments, activity, attachments, links
- Bulk operations (multi-select -> assign/move/label)
- Work item links (blocks, relates, duplicates)
- Custom fields via JSON metadata
- CSV import/export

### 16.2 Visual Task Boards

Features:
- Spaces (containers for boards)
- Multiple boards per space
- Columns with optional WIP limits
- Cards: title, description, members, labels, due dates, checklists, attachments, cover color, comments, activity
- Drag-and-drop (dnd-kit, keyboard accessible)
- Column reordering
- Card filtering (member, label, due date, text)
- Board templates ("Basic", "Development", "Marketing")
- Archive cards/columns

### 16.3 Knowledge Vault

Features:
- Hierarchical folder tree
- Markdown notes with Tiptap editor (headings, bold, italic, code, lists, tables, images)
- Internal links: `[[note-slug]]` with autocomplete
- Bidirectional link resolution (backlinks panel)
- Graph visualization (D3 canvas, force-directed, lazy-loaded)
- Tags (create, assign, filter)
- Version history with diff view
- Publishing workflow: Draft -> Published -> Archived
- Full-text search
- Auto-generated excerpt
- Feedback (helpful/not helpful)
- Collections (curated groups)
- Table of contents from headings

### 16.4 Mkindayzir Assistant (AI)

Features:
- Streaming conversation with tool calling
- Multiple conversations with history
- Multi-provider, multi-model selection
- Token usage tracking
- Markdown rendering with code highlighting
- Rate limit feedback
- Offline: history viewable, new messages disabled

### 16.5 Guide Center

Features:
- Categorized help guides (Markdown)
- Search within guides
- Admin CRUD, ordering, draft/published
- Pre-populated defaults on install

### 16.6 Reports & Analytics

Features:
- Dashboard summary (open, overdue, completed, assigned)
- Workload chart (items per assignee)
- Velocity chart (points per iteration)
- Status distribution (pie chart)
- Trend chart (created vs resolved over time)
- CSV export
- Date range filtering

---

## 17. Search Architecture

### PostgreSQL (Team/Enterprise): `tsvector` + `pg_trgm` for ranked FTS + fuzzy matching
### SQLite (Personal): FTS5 virtual tables

### Omnisearch: Single endpoint searches across work items, vault notes, cards, guides.
### Command Palette (Cmd+K): Typeahead with debounced 300ms, top 5 results.

---

## 18. File Storage

```
{DATA_DIR}/uploads/attachments/{year}/{month}/{uuid}.{ext}
{DATA_DIR}/uploads/avatars/{userId}.{ext}
{DATA_DIR}/backups/mkindayzir-{timestamp}.tar.gz
{DATA_DIR}/exports/{userId}/{id}.csv
```

- Max 25MB per file (configurable)
- Streaming upload (no memory buffering)
- UUID filenames, original name in DB
- Auth-gated download

---

## 19. Real-Time Communication

### WebSocket (Team/Enterprise only, native `ws` library)

Events: `work_item:updated`, `card:moved`, `notification:new`, `presence:join/leave`

- Auth on handshake
- Room-based: `project:{id}`, `board:{id}`, `user:{id}`
- Auto-reconnect with exponential backoff
- Heartbeat every 30s
- Disabled in Personal Mode

---

## 20. Security

| Layer | Implementation |
|-------|---------------|
| Auth | bcrypt cost 12, DB sessions, HTTP-only cookies |
| CSRF | Same-origin check + X-Mkindayzir-Request header |
| Input | Zod validation everywhere, Prisma parameterized queries |
| XSS | React escaping, strict CSP |
| API Keys | AES-256-GCM encryption at rest |
| Rate Limit | In-memory per-user/per-IP |
| Audit | All mutations logged (Team/Enterprise) |
| Headers | X-Frame-Options, X-Content-Type-Options, HSTS |
| Data Privacy | Zero telemetry, zero external calls (except user-initiated AI) |

---

## 21. Low-End Hardware Optimization

### Server-Side (Personal Mode)

- SQLite (no PostgreSQL process = saves 200MB RAM)
- No Docker overhead
- No WebSocket
- Reduced audit logging
- Single Prisma connection
- App targets max 256MB heap

### Client-Side

- Code splitting per route
- Dynamic imports for heavy modules (D3, Tiptap)
- Virtual scrolling for lists > 50 items
- Canvas rendering for graph (not SVG)
- `prefers-reduced-motion` support
- Aggressive pagination (25 items default)
- TanStack Query reads from cache first

---

## 22. Performance Budgets & Scalability

| Metric | Target |
|--------|--------|
| First Contentful Paint | < 1.5s |
| Time to Interactive | < 3s |
| JS bundle (initial) | < 150KB gzipped |
| API response (list) | < 200ms |
| API response (single) | < 100ms |
| Search response | < 300ms |
| Server memory (Personal) | < 256MB |
| Server memory (Team) | < 512MB |

### Scalability: Single process handles 20+ concurrent users. For 100+, add load balancer + Redis sessions.

---

## 23. Easy Installation

### Personal Mode (one command)

```bash
npx mkindayzir
# Creates ~/mkindayzir-data/, initializes SQLite, opens browser to setup wizard
```

### Team Mode (Docker)

```bash
curl -O https://get.mkindayzir.dev/docker-compose.yml
docker compose up -d
# Open http://localhost:3000/setup
```

### Bare Metal

```bash
git clone ... && cd mkindayzir
cp .env.example .env  # Edit DATABASE_URL
pnpm install && pnpm build && pnpm start
```

### First-Run Wizard

1. "How will you use Mkindayzir?" -> Personal / Team / Enterprise
2. Create admin account
3. Auto-generate secrets if not in .env
4. Seed defaults (workflow, guides)
5. Redirect to login

---

## 24. Internationalization Readiness

- All strings extracted to `locales/en.json`
- `t('key')` function used in all components
- User locale in `users.locale` field
- `Intl.DateTimeFormat` / `Intl.NumberFormat` for dates/numbers
- RTL-ready CSS structure (future)
- Do NOT translate now - just ensure extractability

---

## 25. Testing Strategy

- **Unit (Vitest)**: ~300 tests - services, utils, validators
- **Integration (Vitest + DB)**: ~100 tests - API routes, both SQLite and PostgreSQL
- **E2E (Playwright)**: ~20 tests - critical paths (login, create item, drag card, vault note, AI chat)

---

## 26. Monitoring & Logging

- Pino structured JSON logging
- Levels: ERROR, WARN, INFO, DEBUG
- Health endpoint: `GET /api/health` (status, version, uptime, DB connection, disk space)

---

## 27. Backup & Restore

- **Personal**: Copy SQLite file + uploads folder (also via admin UI)
- **Team/Enterprise**: `pg_dump` + uploads -> tar.gz (CLI or admin UI)
- Automated daily backup via Docker cron service (Enterprise)
- Restore via CLI or admin upload

---

## 28. Migration Strategy

- Prisma handles schema migrations (`migrate deploy` on startup)
- Updates: Pull new Docker image -> restart (auto-migrates)
- One-time legacy migration script: OpsDesk SQLite -> Mkindayzir (run once, discard)

---

## 29. Deployment

### Docker Compose (Team/Enterprise)

```yaml
services:
  mkindayzir:
    image: mkindayzir/mkindayzir:latest
    ports:
      - "3000:3000"
    environment:
      - MKINDAYZIR_MODE=team
      - DATABASE_PROVIDER=postgresql
      - DATABASE_URL=postgresql://mkindayzir:${DB_PASSWORD}@db:5432/mkindayzir
      - SESSION_SECRET=${SESSION_SECRET}
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
    volumes:
      - upload-data:/app/data/uploads
      - backup-data:/app/data/backups
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=mkindayzir
      - POSTGRES_USER=mkindayzir
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - pg-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U mkindayzir"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  pg-data:
  upload-data:
  backup-data:
```

### Enterprise with nginx SSL: Add nginx container with cert volumes.

---

## 30. Configuration Management

```env
# .env.example
MKINDAYZIR_MODE=personal           # personal | team | enterprise
NODE_ENV=production
PORT=3000
BASE_URL=http://localhost:3000
DATABASE_PROVIDER=sqlite           # sqlite | postgresql
DATABASE_URL=file:./data/mkindayzir.db
SESSION_SECRET=                    # Auto-generated if empty
ENCRYPTION_KEY=                    # Auto-generated if empty
SESSION_MAX_AGE=86400
BCRYPT_ROUNDS=12
DATA_DIR=./data
MAX_UPLOAD_SIZE=26214400
RATE_LIMIT_GENERAL=100
RATE_LIMIT_AI=20
RATE_LIMIT_AUTH=5
DEFAULT_AI_PROVIDER=openrouter
DEFAULT_AI_MODEL=anthropic/claude-sonnet-4-20250514
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=noreply@mkindayzir.local
LOG_LEVEL=info
LOG_FORMAT=json
AUTO_LOGIN=false
```

---

## 31. CI/CD Pipeline

GitHub Actions:
1. **lint + typecheck** on every push/PR
2. **test (SQLite)** - unit + integration
3. **test (PostgreSQL)** - unit + integration
4. **e2e** - Playwright
5. **build Docker** - on main branch merge

Release: version bump -> tag -> Docker image push -> GitHub release with changelog.

---

## 32. Documentation

- README.md: Quick start, screenshots
- docs/DEPLOYMENT.md: All options step-by-step
- docs/CONFIGURATION.md: Every env var
- docs/API.md: Complete API reference
- docs/ARCHITECTURE.md: Design decisions
- docs/DEVELOPMENT.md: Local dev setup
- In-app Guide Center: Pre-written help

---

## 33. Extensibility & Plugin Architecture

- Internal event bus for hooks
- Webhook support (admin-configurable, fires on events)
- API-first (all features accessible via REST)
- Future plugin interface planned (not built now)

---

## 34. Future AI Agent Readiness

Architecture preparations (current):
1. Service layer callable programmatically (not just via HTTP)
2. Typed tool registry with JSON Schema
3. Event bus for agent subscriptions
4. Permission-scoped tool execution
5. Stored conversation context

Future agent will call same services as API routes.

---

## 35. Future MCP Readiness

Architecture preparations (current):
1. Consistent REST API patterns
2. JSON Schema for all endpoints (auto-generate MCP tools)
3. Idempotent operations (safe retries)
4. Structured JSON responses

Future MCP server = separate package wrapping Mkindayzir API.

---

## 36. Implementation Phases

### Phase 1: Foundation (Weeks 1-3)

| Task | Details |
|------|---------|
| Project scaffold | Next.js 14, TypeScript, Tailwind, pnpm, ESLint, Prettier |
| Custom server | server.ts (Next.js + conditional WebSocket) |
| Prisma schema | Full schema, both SQLite and PostgreSQL migrations |
| Mode system | MKINDAYZIR_MODE config, feature flags |
| Authentication | Login, logout, bcrypt sessions, auto-login (Personal) |
| Authorization | RBAC middleware (disabled in Personal) |
| API infrastructure | Error handling, Zod validation, rate limiting, Pino |
| Design system | CSS tokens, Tailwind config, dark/light theme |
| UI shell | Sidebar, header, command palette skeleton |
| Component library | Button, Input, Dialog, Dropdown, Toast, etc. (Radix-based) |
| Docker setup | Dockerfile, docker-compose (team + dev) |
| npx entry point | CLI for Personal Mode |
| Health endpoint | /api/health |
| First-run wizard | Mode selection, admin creation, secret generation |
| Seed data | Default workflow, initial guides |
| i18n setup | t() function, locales/en.json structure |

**Deliverable**: Running app with login, themed dashboard shell, Docker + npx deploy.

### Phase 2: Project Tracker (Weeks 4-6)

| Task | Details |
|------|---------|
| Projects CRUD | Create, list, update, archive with unique keys |
| Work Items CRUD | Full lifecycle with auto-numbering |
| Workflows | Custom statuses + transitions, default workflow |
| Board view | Drag-and-drop columns (dnd-kit) |
| List view | Data table with sort, filter, pagination |
| Backlog view | Unscheduled items |
| Detail view | Full page: description, comments, activity, attachments |
| Iterations | CRUD, assign items |
| Initiatives | CRUD, progress tracking |
| Sub-tasks | Parent/child relationships |
| Labels | CRUD, assign, filter |
| Work item links | blocks, relates, duplicates |
| Bulk operations | Multi-select + batch actions |
| Comments | Threaded comments (polymorphic) |
| Activity log | Timeline of all changes |
| Attachments | Upload/download on work items |

**Deliverable**: Complete project tracker with all views working.

### Phase 3: Visual Task Boards (Weeks 7-8)

| Task | Details |
|------|---------|
| Spaces CRUD | Create, manage, members |
| Boards CRUD | Create, templates, configure |
| Columns | Create, reorder, WIP limits |
| Cards CRUD | Full lifecycle |
| Drag-and-drop | dnd-kit, keyboard accessible |
| Card details | Members, labels, checklists, due dates, attachments |
| Checklists | Multi per card, progress bar |
| Board labels | Create, color, assign |
| Filtering | By member, label, due date, text |
| Templates | Pre-configured column layouts |
| Archive | Cards and columns |

**Deliverable**: Fully functional board system.

### Phase 4: Knowledge Vault (Weeks 9-11)

| Task | Details |
|------|---------|
| Folder tree | Hierarchical CRUD, drag to move |
| Notes CRUD | Create, edit, delete |
| Tiptap editor | Markdown, toolbar, code blocks, tables, images |
| Internal links | [[slug]] autocomplete, bidirectional resolution |
| Backlinks panel | Notes linking to current note |
| Graph view | D3 canvas force-directed (lazy-loaded) |
| Tags | CRUD, assign, filter |
| Version history | Save on edit, diff view |
| Publishing | Draft -> Published -> Archived |
| Full-text search | FTS5 / tsvector indexed |
| Collections | Curated groups |
| Feedback | Helpful/not helpful |
| TOC | Auto-generated from headings |

**Deliverable**: Complete knowledge vault with graph.

### Phase 5: AI Assistant (Weeks 12-13)

| Task | Details |
|------|---------|
| Provider interface | OpenRouter, OpenAI, Anthropic, custom |
| API key management | Encrypt, store, test, UI |
| Model selection | Per-provider model list |
| Conversations | CRUD, auto-title |
| Chat UI | Streaming display, markdown rendering |
| SSE streaming | Server -> client |
| Tool calling | Define, execute, inline results |
| All tools | search, create, update, vault search, summarize |
| Token tracking | Per-message, per-conversation |
| Rate limiting | UI feedback |
| Offline handling | Disabled state, clear messaging |

**Deliverable**: Working AI assistant.

### Phase 6: Offline & Caching (Weeks 14-15)

| Task | Details |
|------|---------|
| Service Worker | Serwist setup, caching strategies |
| IndexedDB | Dexie.js schema, mirror key entities |
| Cache population | Cache as user navigates |
| Offline detection | Navigator.onLine + fetch probe |
| Mutation queue | Queue writes offline, process on reconnect |
| Sync engine | FIFO processing, retry logic |
| Conflict resolution | Last-write-wins + notification |
| UI indicators | Status badge, pending count, banner |
| Background sync | Retry failed mutations |

**Deliverable**: App works offline, syncs on reconnection.

### Phase 7: Real-Time (Week 16)

| Task | Details |
|------|---------|
| WebSocket server | Native ws on custom server |
| Auth | Session validation on connect |
| Rooms | Join/leave based on current view |
| Broadcasting | Emit changes to rooms |
| Client integration | Merge remote changes into TanStack Query cache |
| Presence | Who's viewing what (Team/Enterprise only) |

**Deliverable**: Live updates across users.

### Phase 8: Reports, Search, Guides (Weeks 17-18)

| Task | Details |
|------|---------|
| Dashboard | Summary metrics cards |
| Reports | Workload, velocity, trends (Recharts) |
| CSV export | Filtered data export |
| Omnisearch | Cross-entity FTS |
| Command palette | Cmd+K with typeahead |
| Guide Center | CRUD, categories, default content |

**Deliverable**: Complete reporting, search, and help.

### Phase 9: Admin, Security, Polish (Weeks 19-20)

| Task | Details |
|------|---------|
| User management | CRUD, roles, status |
| Team management | CRUD, members |
| Audit log viewer | Filterable in admin |
| System settings | Runtime config UI |
| Security headers | CSP, HSTS, Helmet |
| Backup/Restore | Admin UI + CLI |
| Email notifications | Optional SMTP |
| Keyboard shortcuts | Global shortcuts |
| Empty states | Helpful illustrations |
| Loading states | Skeletons everywhere |
| Error boundaries | Graceful error pages |
| Accessibility | Focus management, ARIA labels |
| Performance audit | Lighthouse > 90 |

**Deliverable**: Production-ready, polished application.

### Phase 10: Testing, Docs, Release (Weeks 21-22)

| Task | Details |
|------|---------|
| Unit tests | All services and utilities |
| Integration tests | All API routes (both DBs) |
| E2E tests | Critical user flows |
| Documentation | All docs |
| Changelog | v1.0.0 feature list |
| CI/CD | GitHub Actions pipeline |
| Docker image | Published, tagged |
| Final branding | Zero old references remaining |
| Security review | Final audit |

**Deliverable**: v1.0.0 release.

---

## 37. Module Feature Parity

| Area | Required Capabilities |
|---|---|
| Project Tracking | Multiple projects, workflows, iterations, initiatives, sub-tasks, labels, 3 views, bulk ops, links, custom fields, import/export |
| Visual Boards | Spaces, boards, drag-and-drop, WIP limits, checklists, members, labels, filtering, templates |
| Knowledge Vault | Folders, Markdown editor, internal links, backlinks, graph, tags, versions, publishing, search, collections |
| AI Assistant | Multi-provider, streaming, tools, history, model selection, token tracking |
| Admin | Users, teams, RBAC, audit, settings, backup/restore |
| Search | Cross-entity FTS, fuzzy, command palette |
| Reports | Summary, workload, velocity, trends, export |
| Offline | Cache, queue mutations, sync, conflict resolution |
| Real-Time | WebSocket live updates, presence |

---

## 38. Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Components | PascalCase | `WorkItemCard.tsx` |
| Hooks/utils | camelCase | `useWorkItems.ts` |
| Routes | kebab-case | `work-items/route.ts` |
| DB tables | snake_case | `work_items` |
| API paths | kebab-case | `/api/work-items` |
| Types | PascalCase | `WorkItem`, `CreateWorkItemInput` |
| Constants | UPPER_SNAKE | `MAX_UPLOAD_SIZE` |
| Env vars | UPPER_SNAKE | `DATABASE_URL` |
| Events | dot.notation | `work_item.created` |

### Branding Constants (Single Source of Truth)

```typescript
export const APP_NAME = 'Mkindayzir';
export const APP_SLUG = 'mkindayzir';
export const APP_DESCRIPTION = 'Your Operations, Your Server, Your Control.';
```

### Package Identity

```json
{
  "name": "mkindayzir",
  "description": "Self-hosted Work OS",
  "author": "Mkindayzir",
  "license": "PROPRIETARY"
}
```

---

## Appendix A: Technical Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Framework | Next.js 14 App Router | Full-stack TypeScript, SSR, code splitting, massive ecosystem |
| Database | PostgreSQL + SQLite (dual) | PostgreSQL for teams, SQLite for individuals |
| ORM | Prisma | Type-safe, multi-provider, migrations |
| Auth | Custom (bcrypt + DB sessions) | No external dependency, full control |
| Offline | Service Worker + IndexedDB | Standard web APIs, no third-party |
| Real-time | Native WebSocket (ws) | Lightweight, no Socket.io overhead |
| Styling | Tailwind CSS | Utility-first, fully customizable, zero CDN |
| State | TanStack Query + Zustand | Server/UI state separation |
| Drag & Drop | dnd-kit | Accessible, performant, keyboard support |
| Editor | Tiptap | Extensible, Markdown, customizable |
| Graph | D3.js (bundled) | Canvas rendering, no CDN |
| Charts | Recharts | Simple React charts |
| Testing | Vitest + Playwright | Fast units + reliable E2E |
| Deploy | Docker Compose | Single-command for teams |
| Logging | Pino | Fastest Node.js logger |

## Appendix B: Non-Goals

- Mobile phone app or responsive mobile layouts
- Cloud SaaS version
- Multi-tenant architecture
- Plugin marketplace
- OAuth/social login
- Video/audio chat
- Calendar module
- Time tracking
- Billing/invoicing
- Native desktop app (Electron/Tauri)

## Appendix C: Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| PostgreSQL too heavy for personal use | SQLite mode (zero-config) |
| Offline conflicts | Last-write-wins + user notification |
| AI provider changes | Abstract behind interface, support multiple |
| Next.js breaking changes | Pin major version |
| Large uploads consuming RAM | Stream to disk |
| Search at scale | PostgreSQL FTS; Meilisearch plugin for 100k+ docs |
| Docker unavailable | Bare metal guide + npx option |
| Old laptop performance | SQLite, no WebSocket, reduced features, 256MB target |

---

*End of Mkindayzir Master Implementation Plan v2.0*
*Desktop/Laptop Only | Linux + Windows | Next.js Full-Stack*
