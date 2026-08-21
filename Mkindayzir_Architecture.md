# Mkindayzir — Full Architecture Documentation

**Version:** 1.0.0  
**Status:** Aligned with `mkindayzir_implementation_updateplan.md`  
**Tech Stack:** Next.js 14 + React 18 + TypeScript 5 + Tailwind 3 + Prisma 5 + Native WebSocket + Serwist

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

Mkindayzir is a monolithic full-stack application built on Next.js 14 (App Router) with a custom Node.js server for WebSocket support. It follows a Service Layer + Repository Pattern architecture with clear separation of concerns.

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
|  +---------------------------------------------------------------+
|  |  Custom Node.js Server (server.ts)                            |
|  |  +-------------+  +--------------+  +------------------+      |
|  |  | Next.js     |  | API Routes   |  | WebSocket Server |      |
|  |  | SSR Handler |  | /api/*       |  | (ws library)     |      |
|  |  |             |  | REST + SSE   |  | (Team/Ent only)  |      |
|  |  +-------------+  +------+-------+  +------------------+      |
|  |                          |                                     |
|  |  +-----------------------v-----------------------------------+ |
|  |  |  Service Layer (Business Logic)                           | |
|  |  |  +----------+ +--------+ +-------+ +------+ +----------+ | |
|  |  |  | Projects | | Boards | | Vault | | AI   | | Reports  | | |
|  |  |  | Service  | | Service| | Svc   | | Svc  | | Service  | | |
|  |  |  +----------+ +--------+ +-------+ +------+ +----------+ | |
|  |  +-----------------------+-----------------------------------+ |
|  |                          |                                     |
|  |  +-----------------------v-----------------------------------+ |
|  |  |  Data Access Layer (Prisma ORM)                           | |
|  |  |  Supports: PostgreSQL OR SQLite (based on mode)           | |
|  |  +-----------------------------------------------------------+ |
|  +---------------------------------------------------------------+
|                               |                                    |
|  +----------------------------v------+  +------------------------+ |
|  |  PostgreSQL 16 OR SQLite file     |  | File System            | |
|  |  (based on MKINDAYZIR_MODE)       |  | /data/uploads/         | |
|  +-----------------------------------+  +------------------------+ |
+-------------------------------------------------------------------+
```

---

## 2. Directory Structure

```
mkindayzir/
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── (auth)/               # Auth route group (login, register, forgot-password, setup)
│   │   ├── (dashboard)/          # Protected dashboard route group
│   │   ├── api/                  # REST API route handlers
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
│   │   ├── use-socket.ts         # WebSocket lifecycle
│   │   ├── use-presence.ts       # Real-time presence
│   │   ├── use-sync.ts           # Offline sync status
│   │   ├── use-online.ts         # Browser online state
│   │   ├── use-mobile.ts         # Responsive breakpoint
│   │   └── use-optimistic-mutation.ts
│   ├── lib/                      # Core utilities & config
│   │   ├── auth.ts               # Session management (custom bcrypt + DB)
│   │   ├── auth.config.ts        # Auth config
│   │   ├── config.ts             # Runtime config (Zod validated)
│   │   ├── constants.ts          # Routes, enums, statuses
│   │   ├── validators.ts         # Zod schemas
│   │   ├── rbac.ts               # Roles + permissions
│   │   ├── rbac.server.ts        # Server-side permission guard
│   │   ├── crypto.ts             # bcrypt + AES-256-GCM
│   │   ├── encryption.ts         # PBKDF2 key derivation
│   │   ├── logger.ts             # Pino structured logger
│   │   ├── prisma.ts             # PrismaClient singleton
│   │   ├── websocket.ts          # WebSocket server setup
│   │   ├── realtime.ts           # WS helper functions
│   │   ├── events.ts             # Internal EventBus
│   │   ├── api.ts                # Generic fetch wrapper
│   │   ├── helpers.ts            # Audit helper
│   │   └── optimistic.ts         # Optimistic update helpers
│   ├── offline/                  # Offline-first layer
│   │   ├── db.ts                 # Dexie schema
│   │   ├── sync-engine.ts        # Queue + retry sync
│   │   ├── conflict-resolver.ts  # Last-write-wins
│   │   └── cache-strategy.ts     # Entity caching with TTL
│   ├── repositories/             # Data access (Repository Pattern)
│   │   ├── base.repository.ts    # Generic CRUD + pagination
│   │   ├── project.repository.ts
│   │   ├── board.repository.ts
│   │   ├── card.repository.ts
│   │   ├── column.repository.ts
│   │   ├── work-item.repository.ts
│   │   ├── vault-folder.repository.ts
│   │   ├── vault-note.repository.ts
│   │   ├── tag.repository.ts
│   │   └── ... (20+ repositories)
│   ├── services/                 # Business logic layer
│   │   ├── auth.service.ts
│   │   ├── project.service.ts
│   │   ├── board.service.ts
│   │   ├── card.service.ts
│   │   ├── vault.service.ts
│   │   ├── ai.service.ts
│   │   ├── ai-tools.service.ts
│   │   ├── search.service.ts
│   │   ├── report.service.ts
│   │   └── ... (15+ services)
│   ├── stores/                   # Zustand global state
│   │   ├── app.store.ts          # Theme, sidebar
│   │   ├── offline.store.ts      # Online, sync status
│   │   └── notification.store.ts # Notifications
│   ├── types/                    # TypeScript types
│   ├── proxy.ts                  # Next.js middleware (auth guard)
│   ├── server.ts                 # Custom Node.js entry point
│   └── sw.ts                     # Serwist service worker
├── prisma/
│   ├── schema.prisma             # 23 models, multi-provider
│   ├── migrations/               # PostgreSQL migration history
│   ├── sqlite-migrations/        # SQLite migration history
│   └── seed.ts                   # Initial seed data
├── scripts/
│   ├── setup.ts                  # First-run setup
│   ├── migrate.ts                # DB migration runner
│   ├── backup.ts                 # Database backup
│   └── restore.ts                # Database restore
├── docs/
│   ├── ARCHITECTURE.md           # This document
│   ├── DEPLOYMENT.md             # Deployment guides
│   ├── CONFIGURATION.md          # Env var reference
│   ├── DEVELOPMENT.md            # Local dev guide
│   └── CONTRIBUTING.md           # Contribution guidelines
├── tests/
│   ├── setup.ts                  # Vitest setup + mocks
│   └── ...                       # Unit tests
├── locales/
│   └── en.json                   # English translations
├── .github/
│   └── workflows/
│       ├── ci.yml                # Lint, typecheck, test, build
│       └── release.yml           # Docker release on tags
├── public/
│   ├── logo.svg / logo.jpg
│   ├── favicon.ico
│   └── sw.js                     # Generated service worker
├── package.json
├── next.config.mjs
├── tsconfig.json
├── Dockerfile
├── Dockerfile.dev
├── docker-compose.yml
├── docker-compose.dev.yml
├── pnpm-workspace.yaml
├── .env.example
└── pnpm-lock.yaml
```

---

## 3. Entry Points

| File | Responsibility |
|------|----------------|
| `src/server.ts` | Creates HTTP server via Next.js getRequestHandler, attaches WebSocketServer at /ws when config.mode !== 'personal', listens on config.port. |
| `next.config.mjs` | Configures React Strict Mode, Next.js Server Actions body limit (2MB), security headers (X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Strict-Transport-Security), bcrypt as webpack external, and Serwist service worker wrapper. |
| `src/app/layout.tsx` | Root HTML layout wrapping children in Providers (React Query), plus global OfflineBanner, SyncStatus, and ServiceWorkerRegistrar. |
| `src/app/page.tsx` | Landing page (simple welcome text). |

---

## 4. Request Flow

### SSR / Page Navigation
1. Request hits custom server.ts (or next dev in development).
2. Next.js handles SSR via App Router.
3. proxy.ts middleware checks session for protected routes.
4. Server Components fetch data via Services → Repositories → Prisma.
5. HTML is streamed to client.

### API Request
1. Client calls /api/* endpoint.
2. Next.js API Route handler receives request.
3. Handler calls Service layer (or Repository directly).
4. Service enforces RBAC, business logic, audit logging.
5. Repository executes Prisma query.
6. JSON response returned to client.

### WebSocket (Team/Enterprise only)
1. Client connects to ws://host/ws?token=<session_token>.
2. src/server.ts creates WebSocketServer at /ws.
3. src/lib/websocket.ts handles connection, parses JSON messages.
4. Messages routed by type: work_item:updated, card:moved, notification:new, presence:join/leave.
5. Server broadcasts to relevant subscribers.

---

## 5. Authentication & Authorization

### Auth Stack
- Custom auth (no NextAuth in production).
- Password hashing: bcrypt (cost 12).
- Session storage: Database (Session model) + HTTP-only cookie (mkindayzir_session).
- Token: 64-char random hex string.
- Encryption: AES-256-GCM for AI API keys.

### Session Lifecycle

| File | Responsibility |
|------|----------------|
| src/lib/auth.ts | Core session management. Exports: hashPassword, verifyPassword, createSession, getSession, getSessionUser, deleteSession, getUserSessions, deleteUserSession. |
| src/lib/auth.config.ts | Exports authConfig with sessionCookieName and autoLogin flag. |
| src/lib/crypto.ts | hashPassword / verifyPassword using bcrypt; AES-256-GCM encrypt/decrypt. |
| src/lib/encryption.ts | PBKDF2-derived AES-256-GCM for AI API keys. |

### Login Flow
1. Client POSTs credentials to /api/auth/login.
2. src/services/auth.service.ts → loginUser() finds user, verifies password, creates session.
3. createSession() generates token, saves to DB, sets httpOnly cookie.
4. Returns user profile (id, email, displayName, role).

### Logout Flow
1. Client calls DELETE /api/auth/session.
2. deleteSession() removes DB record + clears cookie.

### Registration Flow
1. Client POSTs to /api/auth/register.
2. Validates input, checks existing email, hashes password, creates MEMBER user.

### Forgot Password Flow
1. Client POSTs email to /api/auth/forgot-password.
2. Currently stubbed — no email/token generation yet.

### Session Validation
- GET /api/auth/session returns current user from cookie or null.
- src/proxy.ts (middleware) intercepts non-public paths, redirects to /login if no session.
- Public paths: /, /login, /setup, /register, /forgot-password, /api/auth/**, /api/setup, /api/health.

### Setup Flow
- GET /api/setup → returns { setupComplete: boolean } (checks if ADMIN exists).
- POST /api/setup → creates first ADMIN user if none exists.
- Frontend: src/app/(auth)/setup/page.tsx — mode selection + admin account creation.

### RBAC (Role-Based Access Control)

| Role | Permissions |
|------|-------------|
| ADMIN | All permissions |
| MANAGER | View/manage dashboard, projects, teams, work items, boards, vault; create/edit/delete work items |
| MEMBER | View dashboard, projects, boards, vault; create/edit work items |
| VIEWER | View dashboard, projects, boards, vault, reports |

Guarded by requirePermission(permission) in src/lib/rbac.server.ts.

---

## 6. Database Layer

### Prisma Setup

| File | Responsibility |
|------|----------------|
| prisma/schema.prisma | Single schema supporting PostgreSQL and SQLite via DATABASE_PROVIDER. |
| src/lib/prisma.ts | Singleton PrismaClient instance. |

### Data Source
provider = env("DATABASE_PROVIDER") → "postgresql" or "sqlite"
url = env("DATABASE_URL") → defaults to file:./data/mkindayzir.db

### Models (23 total)

| Model | Purpose |
|-------|---------|
| User | Core user profile. Fields: email, passwordHash, displayName, avatar, role, status, timezone, locale, preferences (JSON), aiApiKey (encrypted), aiProvider, aiModel, lastActiveAt. |
| Session | Auth sessions. Fields: userId, token (unique), expiresAt, ipAddress, userAgent. |
| Team / TeamMember | Team grouping for Team/Enterprise modes. |
| Project | Projects with key, name, description, status, leadId, teamId, settings (JSON). |
| WorkItem | Task/Bug/Feature/Improvement. Fields: projectId, number, type, title, description, status, priority, assigneeId, reporterId, initiativeId, iterationId, parentId, storyPoints, dueDate, resolvedAt, metadata (JSON), position. |
| WorkItemLink | Self-referential links (BLOCKS, BLOCKED_BY, RELATES_TO, DUPLICATES). |
| Iteration | Sprint/iteration. Fields: projectId, name, goal, status, startDate, endDate. |
| Initiative | Higher-level goal. Fields: projectId, name, description, status, progress, startDate, targetDate. |
| Workflow | Custom status/transition definitions per project. Fields: statuses (JSON), transitions (JSON), isDefault. |
| Label / WorkItemLabel | Project-scoped labels, many-to-many with work items. |
| Space / SpaceMember | Board containers with visibility (PRIVATE/TEAM/PUBLIC). |
| Board | Kanban/table board. Fields: spaceId, name, description, background, settings (JSON), position. |
| Column | Board columns with optional WIP limit. |
| Card | Kanban card. Fields: columnId, title, description, position, dueDate, coverColor, metadata (JSON), createdById. |
| CardMember / CardLabel | Many-to-many for card assignments and labels. |
| Checklist / ChecklistItem | Nested checklists on cards. |
| BoardLabel | Board-level labels. |
| VaultFolder | Hierarchical knowledge base folders. Fields: parentId, name, path, position. |
| VaultNote | Knowledge base notes. Fields: folderId, title, slug (unique), content, excerpt, status, authorId, metadata (JSON), version, publishedAt. Relations: tags, versions, internalLinks, feedback. |
| NoteVersion | Versioned history of notes. |
| InternalLink | Wiki-style internal links between notes. |
| Tag / NoteTag | Global tags, many-to-many with notes. |
| NoteFeedback | User feedback (helpful + optional comment) on notes. |
| Conversation / Message | AI assistant chat history. Message supports toolCalls/toolResults (JSON). |
| Comment | Generic comments polymorphic to any entity (entityType + entityId). Supports threaded replies. |
| Attachment | File uploads polymorphic to any entity. |
| Activity | Audit trail for entity changes. |
| Notification | Per-user notifications with read state. |
| AuditLog | System-wide audit log (Enterprise mode). |
| Guide | Help/guide center content. |
| SystemConfig | Key-value system settings. |

### Migrations & Seeding

| File | Responsibility |
|------|----------------|
| prisma/migrations/ | PostgreSQL migration history |
| prisma/sqlite-migrations/ | SQLite migration history |
| prisma/seed.ts | Seeds 4 users (admin/manager/member/viewer, password: password), sample project MKZ, default workflow, one work item. |
| scripts/migrate.ts | Runs prisma migrate deploy with db push fallback, then seeds. |

---

## 7. API Routes

All routes live under src/app/api/.

| Domain | Routes | Description |
|--------|--------|-------------|
| **Auth** | auth/login (POST) | Login with email + password |
| | auth/register (POST) | Public registration |
| | auth/forgot-password (POST) | Password reset request (stubbed) |
| | auth/session (GET/DELETE) | Get current user / logout |
| | auth/[...nextauth] (stub) | Returns 404 |
| **Setup** | setup (GET/POST) | Check setup status / create first admin |
| **Health** | health (GET) | Raw DB query + status |
| **Admin** | admin/[[...path]] (GET/POST/PATCH/DELETE) | Admin-only catch-all (mostly stubbed) |
| **Projects** | projects (GET/POST) | List/create projects |
| | projects/[id] (GET/PATCH/DELETE) | Get/update/delete project |
| | projects/[id]/stats (GET) | Project statistics |
| | projects/[id]/workflows (GET) | Project workflows |
| | projects/[id]/labels (GET) | Project labels |
| **Work Items** | work-items (GET/POST) | List/create work items |
| | work-items/[id] (GET/PATCH/DELETE) | Get/update/delete |
| | work-items/[id]/transition (POST) | Change status |
| | work-items/bulk (POST) | Bulk operations |
| **Iterations** | iterations (GET/POST) | List/create iterations |
| | iterations/[id] (GET/PATCH/DELETE) | Get/update/delete |
| | iterations/[id]/start (POST) | Start iteration |
| | iterations/[id]/complete (POST) | Complete iteration |
| **Initiatives** | initiatives (GET/POST) | List/create initiatives |
| | initiatives/[id] (GET/PATCH/DELETE) | Get/update/delete |
| **Workflows** | workflows/[id] (GET/PATCH) | Get/update workflow |
| **Labels** | labels/[id] (GET/PATCH/DELETE) | Label CRUD |
| **Spaces** | spaces (GET/POST) | List/create spaces |
| | spaces/[id] (GET/PATCH/DELETE) | Get/update/delete |
| | spaces/[id]/members (GET/POST) | List/add members |
| | spaces/[id]/members/[userId] (DELETE) | Remove member |
| **Boards** | boards (GET/POST) | List/create boards |
| | boards/[id] (GET/PATCH/DELETE) | Get/update/delete |
| | boards/[id]/columns (GET/POST) | Board columns |
| | boards/[id]/labels (GET/POST) | Board labels |
| **Columns** | columns/[id] (GET/PATCH/DELETE) | Column CRUD |
| | columns/[id]/reorder (POST) | Reorder columns |
| **Cards** | cards (GET/POST) | List/create cards |
| | cards/[id] (GET/PATCH/DELETE) | Get/update/delete |
| | cards/[id]/move (POST) | Move card between columns |
| | cards/[id]/labels (GET/POST) | Card labels |
| | cards/[id]/labels/[labelId] (DELETE) | Remove label |
| | cards/[id]/members (GET/POST) | Card members |
| | cards/[id]/members/[userId] (DELETE) | Remove member |
| | cards/[id]/checklists (GET/POST) | Card checklists |
| **Checklists** | checklists/[id] (GET/PATCH/DELETE) | Checklist CRUD |
| | checklists/[id]/items (GET/POST) | Checklist items |
| **Checklist Items** | checklist-items/[id] (GET/PATCH/DELETE) | Item CRUD |
| | checklist-items/[id]/toggle (POST) | Toggle completion |
| **Vault** | vault/notes (GET/POST) | List/create notes |
| | vault/notes/[id] (GET/PATCH/DELETE) | Get/update/delete |
| | vault/notes/[id]/archive (POST) | Archive note |
| | vault/notes/[id]/backlinks (GET) | Get backlinks |
| | vault/notes/[id]/feedback (GET/POST) | Note feedback |
| | vault/notes/[id]/publish (POST) | Publish note |
| | vault/notes/[id]/versions (GET) | Version history |
| | vault/folders (GET/POST) | List/create folders |
| | vault/folders/[id] (GET/PATCH/DELETE) | Get/update/delete |
| | vault/tags (GET/POST) | List/create tags |
| | vault/tags/[id] (GET/PATCH/DELETE) | Get/update/delete |
| | vault/search (GET) | Search vault |
| | vault/graph (GET) | Knowledge graph data |
| **Assistant** | assistant/conversations (GET/POST) | List/create conversations |
| | assistant/conversations/[id] (GET/PATCH/DELETE) | Get/update/delete |
| | assistant/conversations/[id]/messages (GET/POST) | Messages (SSE stream) |
| | assistant/settings (GET/PATCH) | AI provider config |
| | assistant/models (GET) | Available AI models |
| **Search** | search (GET) | Cross-entity search |
| | search/suggestions (GET) | Search suggestions |
| **Reports** | reports (GET) | Report data |
| | reports/export (GET) | CSV export |
| **Guides** | guides (GET) | List guides |
| | guides/[id] (GET) | Get guide |
| **Settings** | settings/[[...path]] (GET/PATCH) | User settings (stubbed) |
| **Uploads** | uploads/[[...path]] | File upload/download (catch-all) |

---

## 8. Service Layer

All files under src/services/. Each service encapsulates business logic, enforces RBAC, and delegates persistence to repositories.

| File | Responsibility |
|------|----------------|
| src/services/auth.service.ts | loginUser, logoutUser, getCurrentUser. Validates credentials, creates sessions. |
| src/services/project.service.ts | CRUD for projects, getStats, archive. Requires view:projects / manage:projects. Emits audit events. |
| src/services/board.service.ts | CRUD + reorder for boards inside spaces. Checks space membership. Emits audit events. |
| src/services/card.service.ts | Card operations. |
| src/services/column.service.ts | Column operations. |
| src/services/work-item.service.ts | Work item CRUD, transitions. |
| src/services/workflow.service.ts | Workflow CRUD. |
| src/services/label.service.ts | Label CRUD scoped to projects. |
| src/services/space.service.ts | Space CRUD + member management. |
| src/services/vault.service.ts | Knowledge vault: folders, notes (CRUD + publish + archive), tags, feedback, versions, backlinks, graph. Heavy use of repositories. |
| src/services/search.service.ts | Cross-entity search (work_items, vault_notes, guides) with scoring and suggestions. |
| src/services/conversation.service.ts | AI assistant conversation and message CRUD. |
| src/services/ai.service.ts | AI provider configuration (openrouter, openai, anthropic, custom), streaming chat completions, tool/function calling, rate limiting per user. Decrypts user's stored API key. |
| src/services/ai-tools.service.ts | Tool definitions and execution for AI function calling. |
| src/services/report.service.ts | Reporting logic. |
| src/services/guide.service.ts | Guide center CRUD. |
| src/services/checklist.service.ts | Checklist CRUD on cards. |
| src/services/checklist-item.service.ts | Checklist item toggle/update. |
| src/services/card-label.service.ts | Card-level label assignment. |
| src/services/board-label.service.ts | Board-level label management. |
| src/services/iteration.service.ts | Iteration start/complete lifecycle. |
| src/services/initiative.service.ts | Initiative CRUD. |

---

## 9. Repository Layer

All files under src/repositories/. Pattern: BaseRepository<T> provides generic findById, findMany (with pagination), count. Each concrete repository extends it with domain-specific queries.

| File | Responsibility |
|------|----------------|
| src/repositories/base.repository.ts | Generic CRUD base class with pagination support. |
| src/repositories/project.repository.ts | findAll, findById, create, update, archive, findByKey, getStats. |
| src/repositories/board.repository.ts | Board queries scoped to space. |
| src/repositories/space.repository.ts | Space queries + isMember check. |
| src/repositories/card.repository.ts | Card queries. |
| src/repositories/card-member.repository.ts | Card membership. |
| src/repositories/card-label.repository.ts | Card labels. |
| src/repositories/column.repository.ts | Column queries + reorder. |
| src/repositories/work-item.repository.ts | Work item queries with filters. |
| src/repositories/workflow.repository.ts | Workflow queries. |
| src/repositories/label.repository.ts | Label queries. |
| src/repositories/iteration.repository.ts | Iteration queries. |
| src/repositories/initiative.repository.ts | Initiative queries. |
| src/repositories/vault-folder.repository.ts | Folder tree queries. |
| src/repositories/vault-note.repository.ts | Note queries including search, graph, backlinks, publish, archive. |
| src/repositories/note-version.repository.ts | Note version history. |
| src/repositories/note-feedback.repository.ts | Note feedback queries. |
| src/repositories/tag.repository.ts | Tag queries + findOrCreate. |
| src/repositories/internal-link.repository.ts | Internal link queries. |
| src/repositories/conversation.repository.ts | Conversation + recent conversation queries. |
| src/repositories/message.repository.ts | Message creation. |
| src/repositories/guide.repository.ts | Guide queries. |
| src/repositories/board-label.repository.ts | Board label queries. |

---

## 10. Client Components

### Layout
- src/components/layout/dashboard-layout.tsx — Main dashboard shell (sidebar + header + content area).
- src/components/layout/header.tsx — Top header bar.
- src/components/layout/sidebar.tsx — Side navigation with user menu.
- src/components/layout/command-palette.tsx — Cmd+K command palette.

### Shared
- src/components/shared/providers.tsx — Wraps app in QueryClientProvider (TanStack React Query).
- src/components/shared/offline-banner.tsx — Shows offline banner when network is lost.
- src/components/shared/sync-status.tsx — Displays sync engine status.
- src/components/shared/service-worker-registrar.tsx — Registers Serwist service worker.
- src/components/shared/presence-indicator.tsx / presence-dialog.tsx — Real-time presence UI.
- src/components/shared/connection-status.tsx — WebSocket connection indicator.
- src/components/shared/bulk-actions-bar.tsx — Bulk action toolbar.

### UI (shadcn/ui-like primitives)
- src/components/ui/button.tsx, card.tsx, input.tsx, label.tsx, dialog.tsx, dropdown-menu.tsx, select.tsx, checkbox.tsx, radio-group.tsx, tabs.tsx, toast.tsx, avatar.tsx, progress.tsx, slider.tsx, scroll-area.tsx, separator.tsx, textarea.tsx, table.tsx, skeleton.tsx, badge.tsx, popover.tsx, tooltip.tsx, context-menu.tsx, slot.tsx.

### Boards
- src/components/boards/board-form.tsx — Create/edit board form.
- src/components/boards/board-toolbar.tsx — Board action toolbar.
- src/components/boards/board-table-view.tsx — Table view of board cards.
- src/components/boards/kanban-board.tsx — Kanban board container.
- src/components/boards/kanban-column.tsx — Kanban column.
- src/components/boards/kanban-card.tsx — Draggable kanban card.

### Cards
- src/components/cards/card-form.tsx — Create/edit card.
- src/components/cards/card-detail-modal.tsx — Card detail modal.
- src/components/cards/card-checklists.tsx — Card checklists.
- src/components/cards/card-labels.tsx — Card labels.
- src/components/cards/card-members.tsx — Card member avatars.
- src/components/cards/checklist-form.tsx — Add/edit checklist.

### Vault
- src/components/vault/note-editor.tsx — Markdown editor with toolbar.
- src/components/vault/vault-sidebar.tsx — Folder tree navigation.
- src/components/vault/note-list.tsx — Note listing.
- src/components/vault/note-feedback.tsx — Feedback display.

### Features
- src/components/features/search/search-results.tsx — Search results.
- src/components/features/guides/guide-list.tsx, guide-detail.tsx — Guide center.
- src/components/features/reports/summary-cards.tsx, trends-chart.tsx, velocity-table.tsx, workload-table.tsx — Reporting.

### Spaces
- src/components/spaces/space-form.tsx — Create/edit space.

### Work Items
- src/components/work-items/work-item-table.tsx — Work item list table.
- src/components/work-items/work-item-form.tsx — Work item create/edit form.
- src/components/work-items/work-item-filters.tsx — Filter bar.

### Assistant
- src/components/assistant/assistant-layout.tsx — AI assistant shell.
- src/components/assistant/chat-interface.tsx — Chat container.
- src/components/assistant/chat-input.tsx — Message input with streaming support.
- src/components/assistant/message-bubble.tsx — Message rendering.
- src/components/assistant/conversation-list.tsx — Conversation history sidebar.
- src/components/assistant/empty-state.tsx — Empty state placeholder.
- src/components/assistant/model-selector.tsx — Model picker.
- src/components/assistant/settings-panel.tsx — AI settings.

---

## 11. Custom Hooks

| File | Responsibility |
|------|----------------|
| src/hooks/use-auth.ts | Fetches current user from GET /api/auth/session; returns { user, isLoading, isAuthenticated }. |
| src/hooks/use-socket.ts | Manages WebSocket lifecycle. Connects to /ws?token=..., exposes connected, status, events, send(), clearEvents(), onAny() listener. |
| src/hooks/use-presence.ts | Real-time presence for an entity type+id. Sends join/leave messages, maintains presentUsers list via presence:update events. |
| src/hooks/use-sync.ts | Subscribes to SyncEngine status changes; exposes pendingCount, isSyncing, refresh(). |
| src/hooks/use-online.ts | Browser navigator.onLine listener; returns isOnline boolean. |
| src/hooks/use-mobile.ts | Media query listener for (max-width: 768px); returns isMobile. |
| src/hooks/use-optimistic-mutation.ts | Generic optimistic mutation wrapper with onMutate, onError, onSettled callbacks; exposes mutate, isPending, error. |

---

## 12. State Management

### Zustand Stores

| File | State | Persistence |
|------|-------|-------------|
| src/stores/app.store.ts | theme (light/dark), sidebarCollapsed | localStorage (mkindayzir-app-storage) |
| src/stores/offline.store.ts | isOnline, pendingCount, syncStatus | None (reactive to SyncEngine events) |
| src/stores/notification.store.ts | notifications[], unreadCount | localStorage (mkindayzir-notification-storage) |

### React Query (TanStack Query)
- src/components/shared/providers.tsx instantiates a single QueryClient and wraps the app in QueryClientProvider.
- Used throughout components for server state fetching, caching, and background refetching.

---

## 13. Real-time (WebSocket)

| Component | Responsibility |
|-----------|----------------|
| src/server.ts | Conditionally creates WebSocketServer at path /ws only when config.mode !== 'personal'. |
| src/lib/websocket.ts | WS server setup (setupWebSocket). Accepts connections, parses JSON messages, routes by type. Currently stubbed — auth and message routing TODOs. |
| src/lib/realtime.ts | Helper functions: joinEntityRoom, leaveEntityRoom, broadcastChange. |
| src/hooks/use-socket.ts | Client-side WS hook; reconnects on error, exposes event stream. |
| src/hooks/use-presence.ts | Higher-level presence abstraction on top of WS. |
| src/lib/events.ts | Internal EventBus for pub/sub: work_item.created, work_item.updated, work_item.deleted, card.moved, vault_note.published, comment.created, user.presence. |

---

## 14. Offline / Sync Strategy

| File | Responsibility |
|------|----------------|
| src/offline/db.ts | Dexie database mkindayzir-offline with tables: mutations (queued API calls), cache (cached entities), settings. |
| src/offline/sync-engine.ts | Singleton SyncEngine. Listens to browser online/offline. Enqueues mutations when offline. Processes queue (max 5 retries) when online. Emits status changes (idle / syncing / error / complete). |
| src/offline/conflict-resolver.ts | Last-write-wins conflict resolution based on localUpdatedAt vs remoteUpdatedAt. |
| src/offline/cache-strategy.ts | cacheEntity, getCachedEntity, invalidateCache, warmCache with optional TTL. |
| src/hooks/use-sync.ts | React hook binding to SyncEngine status. |
| src/hooks/use-online.ts | React hook for browser online state. |
| src/stores/offline.store.ts | Zustand store mirroring sync status and pending count. |
| src/components/shared/offline-banner.tsx | Visual offline indicator. |
| src/components/shared/sync-status.tsx | Visual sync progress indicator. |
| src/components/shared/service-worker-registrar.tsx | Registers Serwist service worker for asset caching. |
| src/sw.ts | Minimal Serwist service worker with skipWaiting and clientsClaim. |

---

## 15. Configuration & Constants

| File | Responsibility |
|------|----------------|
| src/lib/config.ts | Central config loaded from env, validated with Zod. Env vars: MKINDAYZIR_MODE, PORT, DATABASE_PROVIDER, DATABASE_URL, DATA_DIR, SESSION_SECRET, ENCRYPTION_KEY, SESSION_MAX_AGE, BCRYPT_ROUNDS, MAX_UPLOAD_SIZE, rate limits, AI defaults, logging, AUTO_LOGIN, REGISTRATION_ENABLED. Exports isPersonalMode(), isTeamMode(), isEnterpriseMode(). |
| src/lib/constants.ts | App name/tagline, ROUTES map, enums for project/work item/iteration/initiative statuses, priorities, visibilities, space roles, board backgrounds, view modes, note statuses, vault routes. |
| src/lib/validators.ts | Zod schemas: LoginSchema, RegisterSchema, ForgotPasswordSchema, CreateProjectSchema, CreateWorkItemSchema, CreateIterationSchema, CreateInitiativeSchema, SetupSchema. |
| src/lib/rbac.ts | ROLES (ADMIN, MANAGER, MEMBER, VIEWER) and PERMISSIONS map. rolePermissions matrix. hasPermission(role, permission). |
| src/lib/rbac.server.ts | requirePermission(permission) — server-only guard returning { error, authorized, session } or NextResponse 401/403. |
| src/config/features.ts | isFeatureEnabled(feature) — enables realtime, teams, admin, audit, ai, offline, graph based on mode. |
| src/config/defaults.ts | DEFAULT_WORKFLOW (todo/in_progress/done) and DEFAULT_BOARD_TEMPLATES (Basic, Development, Marketing). |
| src/config/navigation.ts | navigationItems, adminNavigationItems, bottomNavigationItems with Lucide icons and ROUTES hrefs. |
| src/config/permissions.ts | Re-exports PERMISSIONS, ROLES, hasPermission from lib/rbac. |
| src/lib/auth.config.ts | Exports authConfig with sessionCookieName and autoLogin. |
| src/lib/api.ts | Generic fetch wrapper (api.get, api.post, api.patch, api.delete) using relative URLs for same-origin. |
| src/lib/helpers.ts | audit() helper — writes to prisma.auditLog. |
| src/lib/events.ts | Typed EventBus for internal domain events. |
| src/lib/optimistic.ts | applyOptimisticUpdate, revertOptimisticUpdate, isOptimisticState. |
| src/lib/logger.ts | Pino logger (JSON or pretty based on LOG_FORMAT). |
| src/lib/crypto.ts | bcrypt password hashing + generic AES-256-GCM encrypt/decrypt. |
| src/lib/encryption.ts | PBKDF2-derived AES-256-GCM encrypt/decrypt for AI API keys. |

---

## 16. Deployment Modes

The application adapts its behavior based on MKINDAYZIR_MODE env var.

| Mode | Database | WebSocket | Teams | Admin Panel | Audit Log | Auto-login | Default Env |
|------|----------|-----------|-------|-------------|-----------|------------|-------------|
| **Personal** | SQLite | Disabled | Disabled | Disabled | Disabled | Optional | MKINDAYZIR_MODE=personal |
| **Team** | PostgreSQL | Enabled | Enabled | Enabled | Disabled | Disabled | MKINDAYZIR_MODE=team |
| **Enterprise** | PostgreSQL | Enabled | Enabled | Enabled | Enabled | Disabled | MKINDAYZIR_MODE=enterprise |

### Mode-Specific Behavior
- src/server.ts: WebSocket server only attached when config.mode !== 'personal'.
- src/config/features.ts: realtime, teams, admin require team/enterprise; audit requires enterprise.
- src/lib/config.ts: databaseProvider defaults to sqlite but is overridden in Docker Compose to postgresql.
- Setup wizard (src/app/(auth)/setup/page.tsx) presents three mode cards with descriptions before creating the first admin.

---

## 17. Deployment

| File | Responsibility |
|------|----------------|
| Dockerfile | Multi-stage build: deps (install), builder (generate + build), runner (copy artifacts). Entrypoint runs prisma migrate deploy || prisma db push then pnpm start:server. |
| Dockerfile.dev | Single-stage dev image, runs pnpm dev. |
| docker-compose.yml | Production: mkindayzir service + postgres:16-alpine. Healthchecks, named volumes for uploads/backups and pg-data. Env: MKINDAYZIR_MODE=team, DATABASE_PROVIDER=postgresql. |
| docker-compose.dev.yml | Development: mounts ./src and ./prisma for live reload. |
| scripts/setup.ts | Creates data/, data/uploads/, data/backups/ directories; generates .env with random secrets if missing. |
| scripts/migrate.ts | Runs prisma migrate deploy (with db push fallback) then seeds. |
| scripts/backup.ts | Database backup utility. |
| scripts/restore.ts | Database restore utility. |
| package.json | Scripts: dev, build, start (custom server), dev:server, start:server, prisma:generate, prisma:migrate, prisma:seed, db:push, lint, format, test, test:unit, test:e2e. |

---

## 18. Testing

| File | Responsibility |
|------|----------------|
| vitest.config.ts | Unit test config. Environment: jsdom. Globals enabled. Setup file: tests/setup.ts. Coverage via V8. Alias @ → src. |
| tests/setup.ts | Extends expect with jest-dom matchers. Mocks next/navigation (useRouter, usePathname, useSearchParams). Mocks @/lib/auth (getSession, getSessionUser, hashPassword, verifyPassword, createSession, deleteSession, etc.). |
| playwright.config.ts | E2E test configuration. |

**Test Commands:**
- pnpm test:unit — runs vitest
- pnpm test:e2e — runs Playwright

---

## 19. CI/CD

| Workflow | Trigger | Jobs |
|----------|---------|------|
| .github/workflows/ci.yml | Push/PR to main | lint (ESLint + Prettier), typecheck (tsc --noEmit), test-sqlite (unit tests), test-postgres (PostgreSQL service + unit tests), build (prisma generate + next build) |
| .github/workflows/release.yml | Push tags v* | docker — builds multi-arch image, pushes to ghcr.io/${{ github.repository }} with semver and latest tags. |

---

## 20. Key Architecture Decisions

1. **Monolithic Full-Stack**: Single Node.js process handles SSR, API routes, and WebSocket. Simple to deploy, debug, and maintain.
2. **Service Layer Pattern**: All business logic in src/services/. API routes are thin wrappers.
3. **Repository Pattern**: Data access abstracted through BaseRepository + domain-specific repositories.
4. **Event Bus**: Internal typed pub/sub (src/lib/events.ts) for decoupled side effects.
5. **Adaptive Features**: WebSocket, audit logging, and team features conditionally enabled based on MKINDAYZIR_MODE.
6. **Local-First Offline**: Dexie-based IndexedDB with sync engine, conflict resolution (last-write-wins), and service worker caching.
7. **Security**: httpOnly cookies, bcrypt password hashing (cost 12), AES-256-GCM encryption for AI keys, security headers, rate limiting configs.
8. **Multi-Database**: Prisma schema supports both SQLite (personal) and PostgreSQL (team/enterprise) via env-driven provider switching.
9. **No External CDN**: All assets served from app server. No Google Fonts CDN.
10. **Custom Auth**: No NextAuth/OAuth in production. Custom bcrypt + DB sessions for full control and offline compatibility.

---

*Generated from actual codebase exploration on 2026-08-21.*
