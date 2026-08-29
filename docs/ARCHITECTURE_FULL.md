# Mkindayzir — Full Architecture Documentation

**Version:** 2.0.0  
**Status:** Aligned with FastAPI backend migration  
**Tech Stack:** Vite + React 18 + TypeScript 5 + Tailwind 3 + FastAPI + SQLAlchemy 2.0 + Alembic

---

## Table of Contents

1. [High-Level Overview](#1-high-level-overview)
2. [Directory Structure](#2-directory-structure)
3. [Entry Points](#3-entry-points)
4. [Request Flow](#4-request-flow)
5. [Authentication & Authorization](#5-authentication--authorization)
6. [Database Layer](#6-database-layer)
7. [API Routes](#7-api-routes)
8. [Service Layer](#8-service-layer)
9. [Repository Layer](#9-repository-layer)
10. [Client Components](#10-client-components)
11. [Custom Hooks](#11-custom-hooks)
12. [State Management](#12-state-management)
13. [Real-time (WebSocket)](#13-real-time-websocket)
14. [Offline / Sync Strategy](#14-offline--sync-strategy)
15. [Configuration & Constants](#15-configuration--constants)
16. [Deployment Modes](#16-deployment-modes)
17. [Deployment](#17-deployment)
18. [Testing](#18-testing)
19. [CI/CD](#19-cicd)
20. [Key Architecture Decisions](#20-key-architecture-decisions)

---

## 1. High-Level Overview

Mkindayzir is a full-stack application with a **Vite + React SPA** frontend and a **FastAPI** backend. In production, FastAPI serves both the REST API and the built SPA from a single process on port 8000.

```
+-------------------------------------------------------------------+
|                     Client (Desktop Browser)                        |
|  +---------------------------------------------------------------+ |
|  |  Vite + React SPA (Client-Side Routing)                      | |
|  |  /api/* requests proxied to FastAPI backend in dev            | |
|  +---------------------------------------------------------------+ |
+------------------------------+------------------------------------+
                                  | HTTP /api/* (proxied in dev)
+------------------------------v------------------------------------+
|                     FastAPI Backend (Python)                       |
|  +---------------------------------------------------------------+
|  |  FastAPI + Uvicorn                                           |
|  |  +-------------+  +--------------+  +---------------------+   |
|  |  | Auth        |  | Routers      |  | SSE Streaming       |   |
|  |  | Middleware   |  | /api/*       |  | (AI assistant)      |   |
|  |  | (sessions)   |  | REST         |  +---------------------+   |
|  |  +-------------+  +------+-------+                            |
|  |                          |                                     |
|  |  +-----------------------v-----------------------------------+ |
|  |  |  Service Layer (Business Logic)                           | |
|  |  +-----------------------+-----------------------------------+ |
|  |                          |                                     |
|  |  +-----------------------v-----------------------------------+ |
|  |  |  Data Access Layer (SQLAlchemy 2.0 ORM)                   | |
|  |  |  PostgreSQL 16 + asyncpg (all modes) |
|  |  +-----------------------------------------------------------+ |
|  +---------------------------------------------------------------+
|                               |                                    |
|  +----------------------------v------+  +------------------------+ |
|  |  PostgreSQL 16 cluster            |  | File System            | |
|  |  (based on DATABASE_PROVIDER)     |  | /data/uploads/         | |
|  +-----------------------------------+  +------------------------+ |
+-------------------------------------------------------------------+
```

---

## 2. Directory Structure

```
mkindayzir/
├── src/                          # React SPA source (Vite + React)
│   ├── main.tsx                  # React entry point
│   ├── App.tsx                   # React Router DOM routes
│   ├── app/                      # Route pages (folder convention)
│   │   ├── (auth)/               # Auth pages (login, register, forgot-password, setup)
│   │   └── (dashboard)/          # Protected dashboard pages
│   ├── components/               # React components
│   │   ├── layout/               # Dashboard shell (sidebar, header, command palette)
│   │   ├── shared/               # Providers, banners, registrars
│   │   ├── ui/                   # shadcn/ui primitives
│   │   ├── boards/               # Board views
│   │   ├── cards/                # Card detail, checklists, labels
│   │   ├── vault/                # Knowledge vault
│   │   ├── features/             # Reports, guides, search
│   │   ├── spaces/               # Space management
│   │   ├── work-items/           # Work item table, form, filters
│   │   ├── assistant/            # AI assistant chat UI
│   │   ├── tickets/              # Ticket management UI
│   ├── config/                   # App configuration
│   │   ├── navigation.ts
│   │   ├── permissions.ts
│   │   ├── defaults.ts
│   │   └── features.ts
│   ├── hooks/                    # Custom React hooks
│   │   ├── use-auth.ts
│   │   ├── use-socket.ts         # Exists but inactive (WebSocket deferred)
│   │   ├── use-presence.ts       # Exists but inactive
│   │   ├── use-sync.ts
│   │   ├── use-online.ts
│   │   ├── use-mobile.ts
│   │   ├── use-config.ts
│   │   └── use-optimistic-mutation.ts
│   ├── lib/                      # Core utilities
│   │   ├── api.ts                # Generic fetch wrapper using VITE_API_URL env var
│   │   ├── constants.ts          # ROUTES map, enums
│   │   ├── rbac.ts               # Roles + permissions
│   │   ├── validators.ts         # Zod schemas
│   │   ├── optimistic.ts
│   │   ├── utils.ts
│   │   ├── crypto.ts             # bcrypt + AES-256-GCM (frontend)
│   │   └── encryption.ts         # PBKDF2 key derivation (frontend)
│   ├── offline/                  # Offline-first layer
│   │   ├── db.ts                 # Dexie schema
│   │   ├── sync-engine.ts
│   │   ├── conflict-resolver.ts
│   │   └── cache-strategy.ts
│   ├── stores/                   # Zustand global state
│   │   ├── app.store.ts
│   │   ├── offline.store.ts
│   │   └── notification.store.ts
│   ├── types/                    # TypeScript types
│   └── app/globals.css
├── backend/                      # FastAPI backend
│   ├── app/
│   │   ├── main.py               # FastAPI app entry point
│   │   ├── config.py             # Central config (pydantic-settings)
│   │   ├── database.py           # SQLAlchemy async engine + session
│   │   ├── models/               # SQLAlchemy ORM models
│   │   ├── schemas/              # Pydantic schemas
│   │   ├── routers/              # FastAPI routers (/api/*)
│   │   ├── services/             # Business logic layer
│   │   ├── middleware/           # auth, rate_limit
│   │   ├── utils/                # rbac, encryption, helpers
│   │   └── cli/                  # Click CLI (mkindayzir)
│   ├── alembic/                  # Alembic migrations
│   └── pyproject.toml
├── prisma/                       # Reference schema (not actively used by backend)
│   ├── schema.prisma
│   ├── migrations/               # Reference migrations
│   └── seed.ts
├── docker/
│   └── docker-compose.yml        # Single app service + optional postgres (team profile)
├── Dockerfile                    # Multi-stage: Node builds SPA, Python runs FastAPI
├── vite.config.ts                # Vite config with proxy
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
└── ...
```

---

## 3. Entry Points

| File | Responsibility |
|------|----------------|
| `vite.config.ts` | Configures Vite dev server on port 5173, proxies `/api` to `http://localhost:8000`, build outDir `dist`, React plugin. |
| `backend/app/main.py` | FastAPI application entry point. Creates app, registers routers, mounts middleware, serves static SPA from `dist/` in production. |
| `src/main.tsx` | React entry point, BrowserRouter + Providers + App. |
| `src/App.tsx` | React Router DOM v6 client-side routes. |

---

## 4. Request Flow

### Development
1. Browser requests `http://localhost:8000`.
2. Vite dev server serves the React SPA and HMR.
3. Client-side React Router handles navigation.
4. API requests to `/api/*` are proxied by Vite to `http://localhost:8000`.
5. FastAPI router handles the request.
6. JSON response returned to client.

### Production
1. Browser requests `http://localhost:8000`.
2. FastAPI serves the built SPA from `dist/` (static assets + `index.html` catch-all).
3. Client-side React Router handles navigation.
4. API requests to `/api/*` hit FastAPI routers directly.
5. JSON response returned to client.

### AI SSE Streaming
1. Client POSTs to `/api/assistant/conversations/{id}/messages`.
2. FastAPI returns `text/event-stream` response.
3. Frontend parses SSE and renders streaming assistant messages.

### WebSocket (Deferred)
- WebSocket support is deferred for future FastAPI implementation.
- Client-side hooks (`use-socket.ts`, `use-presence.ts`) remain in the codebase but are currently inactive.

---

## 5. Authentication & Authorization

### Auth Stack
- Custom auth (no external auth provider).
- Password hashing: bcrypt (cost 12).
- Session storage: Database (Session model) + HTTP-only cookie (`mkindayzir_session`).
- Token: 64-char random hex string.
- Encryption: AES-256-GCM for AI API keys.

### Session Lifecycle

| File | Responsibility |
|------|----------------|
| `backend/app/middleware/auth.py` | Core session management. Exports: hash_password, verify_password, create_session, get_session, get_session_user, delete_session. |
| `backend/app/utils/encryption.py` | AES-256-GCM encrypt/decrypt for AI API keys. |
| `backend/app/utils/rbac.py` | Roles + permissions matrix. |

### Login Flow
1. Client POSTs credentials to `/api/auth/login`.
2. FastAPI auth router -> `login_user()` finds user, verifies password, creates session.
3. `create_session()` generates token, saves to DB, sets httpOnly cookie.
4. Returns user profile (id, email, displayName, role).

### Logout Flow
1. Client calls DELETE `/api/auth/session`.
2. `delete_session()` removes DB record + clears cookie.

### Registration Flow
1. Client POSTs to `/api/auth/register`.
2. Validates input, checks existing email, hashes password, creates MEMBER user.

### Session Validation
- GET `/api/auth/session` returns current user from cookie or null.
- FastAPI auth middleware handles session validation on all protected routes.

### Setup Flow
- GET `/api/setup` -> returns `{ setupComplete: boolean }` (checks if ADMIN exists).
- POST `/api/setup` -> creates first ADMIN user if none exists.
- Frontend: `src/app/(auth)/setup/page.tsx` - mode selection + admin account creation.

### RBAC (Role-Based Access Control)

| Role | Permissions |
|------|-------------|
| ADMIN | All permissions |
| MANAGER | View/manage dashboard, projects, teams, work items, boards, vault; create/edit/delete work items |
| MEMBER | View dashboard, projects, boards, vault; create/edit work items |
| VIEWER | View dashboard, projects, boards, vault, reports |

Guarded by `require_permission(permission)` in `backend/app/utils/rbac.py`.

---

## 6. Database Layer

### SQLAlchemy 2.0 Setup

| File | Responsibility |
|------|----------------|
| `backend/app/database.py` | SQLAlchemy async engine + session factory. |
| `backend/app/models/` | SQLAlchemy ORM models (mirrors Prisma schema). |
| `backend/app/schemas/` | Pydantic schemas for request/response validation. |
| `alembic/` | Database migration version control. |

### Data Source
- `DATABASE_PROVIDER` -> `postgres` (only value)
- `DATABASE_URL` -> connection string
- Schema via Alembic migrations; scripts/reset_pg.py for dev resets
- PostgreSQL: uses Alembic migrations

### Prisma Schema (Reference Only)
- `prisma/schema.prisma` is retained as a reference for the data model.
- Not actively used by the backend - SQLAlchemy models replace it.
- PostgreSQL migrations in `prisma/migrations/` are retained for reference.

---

## 7. API Routes

All routes are implemented as FastAPI routers under `backend/app/routers/`.

| Domain | Prefix | Description |
|--------|--------|-------------|
| **Auth** | `/api/auth` | Login, register, forgot-password, session, logout |
| **Setup** | `/api/setup` | Check setup status / create first admin |
| **Health** | `/api/health` | Health check + DB status |
| **Config** | `/api/config` | Public config (mode, registration enabled) |
| **Projects** | `/api/projects` | CRUD, stats, workflows, labels |
| **Work Items** | `/api/work-items` | CRUD, transitions, bulk operations |
| **Iterations** | `/api/iterations` | CRUD, start/complete lifecycle |
| **Initiatives** | `/api/initiatives` | CRUD |
| **Workflows** | `/api/workflows` | CRUD |
| **Labels** | `/api/labels` | CRUD |
| **Spaces** | `/api/spaces` | CRUD + member management |
| **Boards** | `/api/boards` | CRUD + columns + labels |
| **Columns** | `/api/columns` | CRUD + reorder |
| **Cards** | `/api/cards` | CRUD + move + labels + members + checklists |
| **Checklists** | `/api/checklists` | CRUD |
| **Checklist Items** | `/api/checklist-items` | CRUD + toggle |
| **Vault** | `/api/vault` | Notes, folders, tags, search, graph, feedback, versions |
| **Assistant** | `/api/assistant` | Conversations, messages (SSE), settings, models |
| **Search** | `/api/search` | Cross-entity search + suggestions |
| **Reports** | `/api/reports` | Report data + CSV export |
| **Guides** | `/api/guides` | Guide center |
| **Settings** | `/api/settings` | User settings |
| **Uploads** | `/api/uploads` | File upload/download |
| **Admin** | `/api/admin` | Admin operations |
| **System** | `/api/system` | System operations |
| **Tickets** | `/api/tickets` | Ticket CRUD, replies, stats, SLA tracking |
| **Dashboard** | `/api/dashboard` | Dashboard data |

> In development, `/api/*` requests are proxied from Vite to `http://localhost:8000`. In production, FastAPI serves both `/api/*` and the static SPA on the same port.

---

## 8. Service Layer

All files under `backend/app/services/`. Each service encapsulates business logic, enforces RBAC, and delegates persistence to SQLAlchemy models.

| File | Responsibility |
|------|----------------|
| `backend/app/services/auth.py` | login, logout, get_current_user, password hashing. |
| `backend/app/services/project.py` | CRUD, stats, archive. |
| `backend/app/services/board.py` | CRUD + reorder. |
| `backend/app/services/card.py` | Card operations. |
| `backend/app/services/column.py` | Column operations. |
| `backend/app/services/work_item.py` | Work item CRUD, transitions. |
| `backend/app/services/workflow.py` | Workflow CRUD. |
| `backend/app/services/label.py` | Label CRUD. |
| `backend/app/services/space.py` | Space CRUD + member management. |
| `backend/app/services/vault.py` | Knowledge vault operations. |
| `backend/app/services/search.py` | Cross-entity search. |
| `backend/app/services/conversation.py` | AI conversation CRUD. |
| `backend/app/services/ai.py` | AI provider config, streaming chat, tool calling. |
| `backend/app/services/report.py` | Reporting logic. |
| `backend/app/services/guide.py` | Guide center CRUD. |
| `backend/app/services/checklist.py` | Checklist CRUD. |
| `backend/app/services/iteration.py` | Iteration lifecycle. |
| `backend/app/services/initiative.py` | Initiative CRUD. |
| `backend/app/services/ticket_service.py` | Ticket CRUD, replies, stats, SLA tracking, customer management. |
| `backend/app/services/migration_service.py` | Legacy SQLite import service (CLI-driven). |

---

## 9. Repository Layer

The repository pattern is simplified into service methods with direct SQLAlchemy queries. There is no separate repository directory - queries are embedded in service files using the async SQLAlchemy session.

---

## 10. Client Components

| File/Directory | Responsibility |
|------|----------------|
| `src/components/layout/` | Dashboard shell (sidebar, header, command palette) |
| `src/components/shared/` | Providers, offline banner, sync status, service worker registrar |
| `src/components/ui/` | shadcn/ui primitives (button, card, dialog, toast, etc.) |
| `src/components/boards/` | Kanban board, columns, cards, table view, board form |
| `src/components/cards/` | Card detail modal, form, checklists, labels, members |
| `src/components/vault/` | Note editor, viewer, sidebar, graph view, tag cloud, version history, backlinks, feedback |
| `src/components/features/` | Reports (summary cards, trends, velocity, workload), guides (list, detail) |
| `src/components/spaces/` | Space management, space form |
| `src/components/work-items/` | Work item table, form, filters |
| `src/components/assistant/` | AI assistant chat (layout, interface, input, message bubble, conversation list, settings, model selector) |
| `src/components/settings/` | System settings panels |
| `src/components/tickets/` | Ticket list, form, sidebar, reply form, status badges |

---

## 11. Custom Hooks

| File | Responsibility |
|------|----------------|
| `src/hooks/use-auth.ts` | Fetches current user from `/api/auth/session` on mount |
| `src/hooks/use-config.ts` | Fetches public config from `/api/config` (mode, registration flag) |
| `src/hooks/use-socket.ts` | WebSocket lifecycle hook (exists but inactive — deferred) |
| `src/hooks/use-presence.ts` | Real-time presence hook (exists but inactive — deferred) |
| `src/hooks/use-sync.ts` | Offline sync status and queue processing |
| `src/hooks/use-online.ts` | Browser online/offline state |
| `src/hooks/use-mobile.ts` | Responsive breakpoint detection |
| `src/hooks/use-optimistic-mutation.ts` | Optimistic update helpers for mutations |

---

## 12. State Management

Zustand stores in `src/stores/`.

| File | Responsibility |
|------|----------------|
| `src/stores/app.store.ts` | Theme, sidebar collapsed state. |
| `src/stores/offline.store.ts` | Online status, sync status, pending count. |
| `src/stores/notification.store.ts` | Notifications list, unread count. |

---

## 13. Real-time (WebSocket)

WebSocket support is **deferred** for future FastAPI implementation.

| Component | Status |
|-----------|--------|
| `backend/app/routers/ws.py` | Not yet implemented |
| `src/hooks/use-socket.ts` | Exists but inactive |
| `src/hooks/use-presence.ts` | Exists but inactive |
| `src/lib/events.ts` | Exists but unused |

---

## 14. Offline / Sync Strategy

Mkindayzir implements a client-side offline-first layer using Dexie (IndexedDB wrapper) in `src/offline/`.

| File | Responsibility |
|------|----------------|
| `src/offline/db.ts` | Dexie database schema (`mkindayzir-offline`) with tables for queued mutations, cached entities, and settings |
| `src/offline/sync-engine.ts` | Singleton sync engine that queues mutations when offline and processes them when back online |
| `src/offline/conflict-resolver.ts` | Last-write-wins conflict resolution |
| `src/offline/cache-strategy.ts` | Entity caching with TTL |

The offline layer stores mutations in IndexedDB and replays them via the API client when connectivity is restored. Zustand stores (`offline.store.ts`) track sync status and pending counts.

---

## 15. Configuration & Constants

| File | Responsibility |
|------|----------------|
| `backend/app/config.py` | Central config loaded from env. Env vars: DATABASE_PROVIDER, DATABASE_URL, SESSION_SECRET, ENCRYPTION_KEY, MKINDAYZIR_MODE, SESSION_MAX_AGE, BCRYPT_ROUNDS, MAX_UPLOAD_SIZE, AI defaults. |
| `src/lib/constants.ts` | ROUTES map, enums for statuses, priorities, etc. |
| `src/lib/validators.ts` | Zod schemas for frontend forms. |
| `src/lib/rbac.ts` | ROLES and PERMISSIONS map (frontend display). |
| `src/config/features.ts` | Feature flags by mode. |
| `src/config/defaults.ts` | DEFAULT_WORKFLOW and DEFAULT_BOARD_TEMPLATES. |
| `src/config/navigation.ts` | Navigation items. |
| `src/config/permissions.ts` | Re-exports PERMISSIONS, ROLES. |
| `src/lib/api.ts` | Generic fetch wrapper using `import.meta.env.VITE_API_URL ?? ""`. In dev with Vite proxy, this is empty string so requests go to same origin (`:8000/api/...`). |
| `src/lib/optimistic.ts` | Optimistic update helpers. |

---

## 16. Deployment Modes

(Unchanged - same mode logic, now enforced by FastAPI backend)

| Mode | Database | WebSocket | Teams | Admin Panel | Audit Log | Auto-login | Default Env |
|------|----------|-----------|-------|-------------|-----------|------------|-------------|
| **Personal** | PostgreSQL | Disabled | Disabled | Disabled | Disabled | Optional | MKINDAYZIR_MODE=personal |
| **Team** | PostgreSQL | Deferred | Enabled | Enabled | Disabled | Disabled | MKINDAYZIR_MODE=team |
| **Enterprise** | PostgreSQL | Deferred | Enabled | Enabled | Enabled | Disabled | MKINDAYZIR_MODE=enterprise |

---

## 17. Deployment

| File | Responsibility |
|------|----------------|
| `Dockerfile` | Multi-stage: Node builds Vite SPA (dist/), Python runs FastAPI serving API + static SPA on port 8000. |
| `docker/docker-compose.yml` | Single `app` service on port 8000, optional `postgres` under `team` profile. |
| `backend/pyproject.toml` | Python dependencies (FastAPI, Uvicorn, SQLAlchemy, Alembic, etc.). |
| `package.json` | Scripts: dev, build, lint, format, test. |

---

## 18. Testing

Frontend: Vitest + Playwright. Backend: pytest in `backend/pyproject.toml` optional-dependencies.

---

## 19. CI/CD

| File | Responsibility |
|------|----------------|
| `.github/workflows/ci.yml` | Lint, typecheck, backend tests (Postgres), build. |
| `.github/workflows/release.yml` | Docker image push to ghcr.io on tags. |

---

## 20. Key Architecture Decisions

1. **Vite + React SPA**: Frontend is a Vite-built React SPA served statically by FastAPI in production on port 8000.
2. **Single-Process Production**: FastAPI serves both `/api/*` REST API and the built SPA from `dist/` on port 8000. No separate Node process.
3. **Two-Process Development**: FastAPI on `:8000` and Vite dev server on `:5173`. Vite proxies `/api` to `:8000`.
4. **Client-Side Routing**: React Router DOM v6 in `src/App.tsx`. No server-side routing.
5. **SPA Catch-All**: `backend/app/main.py` serves `dist/index.html` for unmatched routes in production.
6. **API Client**: `src/lib/api.ts` uses `import.meta.env.VITE_API_URL ?? ""` for base URL. In dev with Vite proxy, this is empty string so requests go to same origin (`:8000/api/...`).
7. **CORS**: Configured in `backend/app/main.py` via `ALLOWED_ORIGINS` env var (default: `http://localhost:8000,http://127.0.0.1:8000`).
8. **Docker**: Root `Dockerfile` is multi-stage: Node builds frontend, Python runs FastAPI. `docker/docker-compose.yml` defines `app` service on port 8000, optional `postgres` under `team` profile.
9. **Service Layer Pattern**: All business logic in `backend/app/services/`. FastAPI routers are thin wrappers.
10. **SQLAlchemy 2.0 + Alembic**: Replaces Prisma for the backend. Async-first ORM with migration version control.
11. **Local-First Offline**: Dexie-based IndexedDB with sync engine (unchanged from previous architecture).
12. **Security**: httpOnly cookies, bcrypt password hashing (cost 12), AES-256-GCM encryption for AI keys, security headers.
13. **PostgreSQL-only**: single supported engine via DATABASE_PROVIDER env var.
14. **No External Auth**: Custom bcrypt + DB sessions for full control.
15. **SSE Streaming**: FastAPI handles AI assistant streaming via `text/event-stream`.
16. **WebSocket Deferred**: Real-time features deferred to future FastAPI implementation.
17. **Prisma Reference Only**: `prisma/` folder exists at root with schema, migrations, and seed script, but is NOT actively used by the backend. SQLAlchemy models replace it. Some legacy scripts still reference Prisma CLI commands.
18. **Ticketing System**: Internal support/ticketing module with SLA tracking, customer linking, and internal/external replies. Routes: `/api/tickets/*` and `/tickets/*`.

---

*Generated from actual codebase exploration on 2026-08-23.*
