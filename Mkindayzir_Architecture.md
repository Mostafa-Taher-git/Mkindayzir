# Mkindayzir — Full Architecture Documentation

**Version:** 2.0.0  
**Status:** Aligned with FastAPI backend migration  
**Tech Stack:** Next.js 14 (frontend only) + React 18 + TypeScript 5 + Tailwind 3 + FastAPI + SQLAlchemy 2.0 + Alembic

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

Mkindayzir is a dual-service full-stack application: a Next.js 14 frontend serving the React UI, and a separate FastAPI backend handling all API logic, authentication, and data access.

```
+-------------------------------------------------------------------+
|                     Client (Desktop Browser)                        |
|  +---------------------------------------------------------------+ |
|  |  Next.js React App (SSR + Client Components)                  | |
|  |  /api/* requests proxied to FastAPI backend                   | |
|  +---------------------------------------------------------------+ |
+------------------------------+------------------------------------+
                                 | HTTP /api/* (proxied)
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
|  |  |  Supports: SQLite (personal) OR PostgreSQL (team/enterprise)|
|  |  +-----------------------------------------------------------+ |
|  +---------------------------------------------------------------+
|                               |                                    |
|  +----------------------------v------+  +------------------------+ |
|  |  SQLite file OR PostgreSQL 16     |  | File System            | |
|  |  (based on DATABASE_PROVIDER)     |  | /data/uploads/         | |
|  +-----------------------------------+  +------------------------+ |
+-------------------------------------------------------------------+
```

---

## 2. Directory Structure

```
mkindayzir/
├── frontend/ (was src/)
│   ├── app/
│   │   ├── (auth)/               # Auth route group (login, register, forgot-password, setup)
│   │   ├── (dashboard)/          # Protected dashboard route group
│   │   ├── [[...slug]]/route.ts  # Catch-all page route
│   │   ├── layout.tsx            # Root HTML layout
│   │   ├── page.tsx              # Landing page
│   │   └── globals.css           # Global styles + design tokens
│   ├── components/               # React components
│   │   ├── layout/               # Dashboard shell (sidebar, header, command palette)
│   │   ├── shared/               # Providers, banners, registrars
│   │   ├── ui/                   # shadcn/ui primitives
│   │   ├── boards/               # Board views (kanban, table)
│   │   ├── cards/                # Card detail, checklists, labels
│   │   ├── vault/                # Knowledge vault editor, sidebar, graph
│   │   ├── features/             # Reports, guides, search
│   │   ├── spaces/               # Space management
│   │   ├── work-items/           # Work item table, form, filters
│   │   └── assistant/            # AI assistant chat UI
│   ├── config/                   # App configuration
│   │   ├── navigation.ts         # Sidebar nav items
│   │   ├── permissions.ts        # RBAC re-exports
│   │   ├── defaults.ts           # Default workflows, board templates
│   │   └── features.ts           # Feature flags by mode
│   ├── hooks/                    # Custom React hooks
│   │   ├── use-auth.ts           # Current user fetch
│   │   ├── use-socket.ts         # WebSocket lifecycle (deferred)
│   │   ├── use-presence.ts       # Real-time presence (deferred)
│   │   ├── use-sync.ts           # Offline sync status
│   │   ├── use-online.ts         # Browser online state
│   │   ├── use-mobile.ts         # Responsive breakpoint
│   │   └── use-optimistic-mutation.ts
│   ├── lib/                      # Core utilities & config
│   │   ├── auth.ts               # Client-side auth helpers
│   │   ├── auth.config.ts        # Auth config
│   │   ├── config.ts             # Runtime config (Zod validated)
│   │   ├── constants.ts          # Routes, enums, statuses
│   │   ├── validators.ts         # Zod schemas
│   │   ├── rbac.ts               # Roles + permissions
│   │   ├── crypto.ts             # bcrypt + AES-256-GCM
│   │   ├── encryption.ts         # PBKDF2 key derivation
│   │   ├── logger.ts             # Pino structured logger
│   │   ├── api.ts                # Generic fetch wrapper
│   │   ├── helpers.ts            # Audit helper
│   │   └── optimistic.ts         # Optimistic update helpers
│   ├── offline/                  # Offline-first layer
│   │   ├── db.ts                 # Dexie schema
│   │   ├── sync-engine.ts        # Queue + retry sync
│   │   ├── conflict-resolver.ts  # Last-write-wins
│   │   └── cache-strategy.ts     # Entity caching with TTL
│   ├── repositories/             # Data access (Repository Pattern — frontend cache layer)
│   │   ├── base.repository.ts    # Generic CRUD + pagination
│   │   └── ...
│   ├── services/                 # Frontend service adapters
│   ├── stores/                   # Zustand global state
│   │   ├── app.store.ts          # Theme, sidebar
│   │   ├── offline.store.ts      # Online, sync status
│   │   └── notification.store.ts # Notifications
│   ├── types/                    # TypeScript types
│   └── sw.ts                     # Serwist service worker
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── routers/
│   │   ├── services/
│   │   ├── middleware/
│   │   ├── utils/
│   │   └── cli/
│   ├── alembic/
│   ├── pyproject.toml
│   └── Dockerfile
├── prisma/
│   ├── schema.prisma             # Reference schema (not actively used by backend)
│   ├── migrations/               # PostgreSQL migration history
│   ├── sqlite-migrations/        # SQLite migration history
│   └── seed.ts                   # Initial seed data
├── docker-compose.yml
├── next.config.mjs
├── package.json
└── ...
```

---

## 3. Entry Points

| File | Responsibility |
|------|----------------|
| `next.config.mjs` | Configures React Strict Mode, security headers, bcrypt as webpack external, proxy rewrites (`/api/:path*` -> `http://localhost:8000/api/:path*`), and Serwist service worker wrapper. |
| `backend/app/main.py` | FastAPI application entry point. Creates app, registers routers, mounts middleware, starts Uvicorn. |
| `src/app/layout.tsx` | Root HTML layout wrapping children in Providers (React Query), plus global OfflineBanner, SyncStatus, and ServiceWorkerRegistrar. |
| `src/app/page.tsx` | Landing page (simple welcome text). |

---

## 4. Request Flow

### SSR / Page Navigation
1. Request hits Next.js dev server or static export.
2. Next.js handles SSR via App Router.
3. Server Components render page shell.
4. Client Components hydrate and call `/api/*` via `src/lib/api.ts`.

### API Request
1. Client calls `/api/*` endpoint via `src/lib/api.ts`.
2. Next.js proxy (next.config.mjs rewrites) forwards to `http://localhost:8000/api/:path*`.
3. FastAPI router handles request.
4. Auth middleware validates session cookie.
5. Service layer enforces RBAC, business logic, audit logging.
6. SQLAlchemy ORM executes query.
7. JSON response returned to client.

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
- Custom auth (no NextAuth in production).
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
- `DATABASE_PROVIDER` -> `sqlite` (Personal) or `postgresql` (Team/Enterprise)
- `DATABASE_URL` -> connection string
- SQLite: auto-creates tables on startup (no Alembic needed for Personal mode)
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

> All `/api/*` requests are proxied from Next.js to `http://localhost:8000` via `next.config.mjs` rewrites.

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

---

## 9. Repository Layer

The repository pattern is simplified into service methods with direct SQLAlchemy queries. There is no separate repository directory - queries are embedded in service files using the async SQLAlchemy session.

---

## 10. Client Components

(Unchanged - see previous version)

---

## 11. Custom Hooks

(Unchanged - see previous version)

---

## 12. State Management

(Unchanged - see previous version)

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

(Unchanged - client-side only, no changes needed)

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
| `src/lib/api.ts` | Generic fetch wrapper using relative URLs (proxied to FastAPI). |
| `src/lib/helpers.ts` | Frontend audit helper. |
| `src/lib/optimistic.ts` | Optimistic update helpers. |
| `src/lib/logger.ts` | Pino logger. |
| `src/lib/crypto.ts` | bcrypt + AES-256-GCM (frontend). |
| `src/lib/encryption.ts` | PBKDF2 key derivation (frontend). |

---

## 16. Deployment Modes

(Unchanged - same mode logic, now enforced by FastAPI backend)

| Mode | Database | WebSocket | Teams | Admin Panel | Audit Log | Auto-login | Default Env |
|------|----------|-----------|-------|-------------|-----------|------------|-------------|
| **Personal** | SQLite | Disabled | Disabled | Disabled | Disabled | Optional | MKINDAYZIR_MODE=personal |
| **Team** | PostgreSQL | Deferred | Enabled | Enabled | Disabled | Disabled | MKINDAYZIR_MODE=team |
| **Enterprise** | PostgreSQL | Deferred | Enabled | Enabled | Enabled | Disabled | MKINDAYZIR_MODE=enterprise |

---

## 17. Deployment

| File | Responsibility |
|------|----------------|
| `backend/Dockerfile` | Multi-stage Python build. Installs dependencies, runs Alembic migrations on startup. |
| `Dockerfile` | Next.js frontend build. Serves static export + API proxy. |
| `docker-compose.yml` | Three services: mkindayzir (Next.js frontend on port 3000), backend (FastAPI on port 8000), db (PostgreSQL 16 on port 5432). |
| `backend/pyproject.toml` | Python dependencies (FastAPI, Uvicorn, SQLAlchemy, Alembic, etc.). |
| `package.json` | Scripts: dev, build, lint, format, test. |

---

## 18. Testing

(Unchanged - frontend tests remain the same)

---

## 19. CI/CD

(Unchanged - add backend tests to CI pipeline as needed)

---

## 20. Key Architecture Decisions

1. **Dual-Service Architecture**: Next.js frontend + FastAPI backend separated. Frontend handles SSR/UI; backend handles all API logic, auth, and data access.
2. **Proxy Pattern**: Next.js proxy rewrites (`/api/:path*` -> `http://localhost:8000/api/:path*`) allow the frontend to call relative `/api/*` URLs while the FastAPI backend handles them.
3. **Service Layer Pattern**: All business logic in `backend/app/services/`. FastAPI routers are thin wrappers.
4. **SQLAlchemy 2.0 + Alembic**: Replaces Prisma for the backend. Async-first ORM with migration version control.
5. **Local-First Offline**: Dexie-based IndexedDB with sync engine (unchanged from previous architecture).
6. **Security**: httpOnly cookies, bcrypt password hashing (cost 12), AES-256-GCM encryption for AI keys, security headers.
7. **Multi-Database**: SQLite (Personal) and PostgreSQL (Team/Enterprise) supported via DATABASE_PROVIDER env var.
8. **No External Auth**: Custom bcrypt + DB sessions for full control.
9. **SSE Streaming**: FastAPI handles AI assistant streaming via `text/event-stream`.
10. **WebSocket Deferred**: Real-time features deferred to future FastAPI implementation.

---

*Generated from actual codebase exploration on 2026-08-23.*
