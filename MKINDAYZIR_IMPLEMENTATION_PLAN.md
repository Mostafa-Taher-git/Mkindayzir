# Mkindayzir - Master Implementation Plan

## Executive Summary

**Mkindayzir** is a self-hosted, local-first, offline-capable Work OS that unifies project management, visual task boards, knowledge management, and AI assistance into a single independent application. It runs on any company's local server with zero internet dependency (except for optional AI features using the user's own API key).

This document is the complete implementation roadmap — from architecture to production deployment.

---

## Table of Contents

1. [Product Identity](#1-product-identity)
2. [Core Principles](#2-core-principles)
3. [Technology Stack](#3-technology-stack)
4. [System Architecture](#4-system-architecture)
5. [Project Structure](#5-project-structure)
6. [Database Architecture](#6-database-architecture)
7. [Backend Architecture](#7-backend-architecture)
8. [Frontend Architecture](#8-frontend-architecture)
9. [Local-First & Offline Architecture](#9-local-first--offline-architecture)
10. [Authentication & Authorization](#10-authentication--authorization)
11. [Multi-User & Multi-Tenant](#11-multi-user--multi-tenant)
12. [API Architecture](#12-api-architecture)
13. [AI Integration](#13-ai-integration)
14. [Module Specifications](#14-module-specifications)
15. [Search Architecture](#15-search-architecture)
16. [File Storage](#16-file-storage)
17. [Real-Time Communication](#17-real-time-communication)
18. [Security](#18-security)
19. [Performance & Scalability](#19-performance--scalability)
20. [Testing Strategy](#20-testing-strategy)
21. [Monitoring & Logging](#21-monitoring--logging)
22. [Backup & Restore](#22-backup--restore)
23. [Migration Strategy](#23-migration-strategy)
24. [Deployment](#24-deployment)
25. [Configuration Management](#25-configuration-management)
26. [CI/CD Pipeline](#26-cicd-pipeline)
27. [Documentation](#27-documentation)
28. [Extensibility & Plugin Architecture](#28-extensibility--plugin-architecture)
29. [Future AI Agent Readiness](#29-future-ai-agent-readiness)
30. [Future MCP Readiness](#30-future-mcp-readiness)
31. [Implementation Phases](#31-implementation-phases)
32. [Module Feature Parity](#32-module-feature-parity)
33. [Naming Conventions](#33-naming-conventions)

---

## 1. Product Identity

### Name
**Mkindayzir**

### Tagline
"Your Operations, Your Server, Your Control."

### Identity Rules
- The name "Mkindayzir" must appear in: package.json, all UI elements, page titles, meta tags, database names, Docker image names, CLI commands, API responses, error messages, documentation, comments, configuration files, environment variables, and any user-facing text.
- NO references to: Jira, Trello, Obsidian, Kanban (as a product name), or any other existing product name.
- Features inspired by other products are described using generic terminology:
  - "Issue Tracker" or "Project Tracker" (not "Jira module")
  - "Task Boards" or "Visual Boards" (not "Trello boards" or "Kanban boards")
  - "Knowledge Vault" or "Knowledge Base" (not "Obsidian vault")
  - "Sprints" → "Iterations"
  - "Epics" → "Initiatives"
  - "Stories" → "Tasks" or "Work Items"

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
2. **Offline-Capable**: Frontend caches data locally. Users can view and draft changes offline. Changes sync when connectivity to the server is restored.
3. **Self-Hosted**: Single `docker compose up` deploys the entire stack.
4. **Independent**: Zero references to other products. Mkindayzir is its own brand.
5. **Secure by Default**: No data leaves the network. AI is opt-in and uses user-provided keys.
6. **Future-Ready**: Architecture supports AI Agent and MCP integration without rebuilding.
7. **Progressive Enhancement**: Core features work without JavaScript-heavy interactions; advanced features layer on top.

---

## 3. Technology Stack

### Core Stack

| Layer | Technology | Version | Justification |
|-------|-----------|---------|---------------|
| Runtime | Node.js | 20 LTS | Stable, long-term support |
| Framework | Next.js | 14+ (App Router) | Full-stack, SSR, API routes, React |
| Language | TypeScript | 5.x | Type safety end-to-end |
| Database | PostgreSQL | 16+ | ACID, full-text search, JSON, self-hosted |
| ORM | Prisma | 5.x | Type-safe queries, migrations, seeding |
| Auth | NextAuth.js (Auth.js) | 5.x | Session management, extensible providers |
| Styling | Tailwind CSS | 3.x | Utility-first, no external CSS dependencies |
| Component Library | Radix UI (headless) + custom | - | Accessible, unstyled primitives |
| State Management | Zustand | 4.x | Lightweight, works with offline cache |
| Offline Storage | IndexedDB (via Dexie.js) | - | Structured client-side storage |
| Service Worker | Workbox | 7.x | PWA caching strategies |
| Real-Time | Socket.io | 4.x | WebSocket with fallback |
| File Storage | Local filesystem (+ S3-compatible optional) | - | Self-contained |
| Search | PostgreSQL full-text search + pg_trgm | - | No external search engine needed |
| Containerization | Docker + Docker Compose | - | Single-command deployment |
| Package Manager | pnpm | 8.x | Fast, efficient disk usage |

### Development Tools

| Tool | Purpose |
|------|---------|
| ESLint | Code linting |
| Prettier | Code formatting |
| Vitest | Unit & integration testing |
| Playwright | E2E testing |
| Husky | Git hooks |
| lint-staged | Pre-commit checks |
| tsx | TypeScript execution for scripts |
| Prisma Studio | Database GUI (dev only) |

### Production Tools

| Tool | Purpose |
|------|---------|
| PM2 or Docker | Process management |
| nginx (optional) | Reverse proxy, SSL termination |
| pg_dump | Database backup |
| Winston or Pino | Structured logging |

---

## 4. System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client (Browser)                          │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Next.js React App (SSR + Client Components)              │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐  │  │
│  │  │ Service     │  │ IndexedDB    │  │ Zustand Store   │  │  │
│  │  │ Worker      │  │ (Dexie.js)   │  │ (App State)     │  │  │
│  │  │ (Workbox)   │  │ Offline Cache │  │                 │  │  │
│  │  └─────────────┘  └──────────────┘  └─────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────┬───────────────────────────────────┘
                              │ HTTPS / WSS
┌─────────────────────────────▼───────────────────────────────────┐
│                     Mkindayzir Server                            │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Next.js Server (Node.js)                                 │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐  │  │
│  │  │ API Routes   │  │ Server       │  │ WebSocket      │  │  │
│  │  │ /api/*       │  │ Components   │  │ Server         │  │  │
│  │  │ (REST + SSE) │  │ (SSR Pages)  │  │ (Socket.io)    │  │  │
│  │  └──────┬───────┘  └──────────────┘  └────────────────┘  │  │
│  │         │                                                  │  │
│  │  ┌──────▼───────────────────────────────────────────────┐  │  │
│  │  │  Service Layer (Business Logic)                      │  │  │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │  │  │
│  │  │  │ Projects │ │ Boards   │ │ Vault    │ │ AI     │ │  │  │
│  │  │  │ Service  │ │ Service  │ │ Service  │ │ Service│ │  │  │
│  │  │  └──────────┘ └──────────┘ └──────────┘ └────────┘ │  │  │
│  │  └──────┬───────────────────────────────────────────────┘  │  │
│  │         │                                                  │  │
│  │  ┌──────▼───────────────────────────────────────────────┐  │  │
│  │  │  Data Access Layer (Prisma ORM)                      │  │  │
│  │  └──────┬───────────────────────────────────────────────┘  │  │
│  └─────────┼─────────────────────────────────────────────────┘  │
│            │                                                     │
│  ┌─────────▼──────────┐  ┌──────────────────┐                  │
│  │  PostgreSQL 16      │  │  File System     │                  │
│  │  (Data + FTS)       │  │  /data/uploads/  │                  │
│  └─────────────────────┘  └──────────────────┘                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS (outbound, optional, AI only)
                              ▼
                    ┌─────────────────────┐
                    │  AI Provider API    │
                    │  (OpenRouter /      │
                    │   OpenAI / etc.)    │
                    └─────────────────────┘
```

### Key Architecture Decisions

1. **Monolithic Full-Stack**: Single Next.js application handles frontend rendering, API endpoints, WebSocket server, and background jobs. Simplifies deployment for self-hosted scenarios.

2. **Service Layer Pattern**: Business logic lives in service classes (`/src/services/`), not in API route handlers. This enables:
   - Future AI Agent to call the same services
   - Future MCP tools to call the same services
   - Unit testing of business logic in isolation

3. **Event Bus (Internal)**: A lightweight in-process event emitter that services publish to. Consumers include: notification service, activity log, WebSocket broadcaster, and (future) AI Agent hooks.

4. **Repository Pattern**: Data access is abstracted through repository classes that wrap Prisma. This isolates database queries and makes future database changes possible.

---

## 5. Project Structure

```
mkindayzir/
├── .github/                          # CI/CD workflows
│   └── workflows/
│       ├── ci.yml
│       └── release.yml
├── .docker/                          # Docker configuration
│   ├── Dockerfile
│   ├── Dockerfile.dev
│   ├── docker-compose.yml
│   ├── docker-compose.dev.yml
│   └── nginx.conf
├── prisma/                           # Database
│   ├── schema.prisma                 # Schema definition
│   ├── migrations/                   # Migration history
│   └── seed.ts                       # Seed data
├── public/                           # Static assets
│   ├── icons/                        # PWA icons
│   ├── manifest.json                 # PWA manifest
│   └── sw.js                         # Service worker entry
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (auth)/                   # Auth route group
│   │   │   ├── login/
│   │   │   ├── register/
│   │   │   └── forgot-password/
│   │   ├── (dashboard)/              # Protected route group
│   │   │   ├── layout.tsx            # Dashboard shell
│   │   │   ├── page.tsx              # Home/Dashboard
│   │   │   ├── projects/             # Project Tracker
│   │   │   │   ├── page.tsx
│   │   │   │   ├── [projectId]/
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   ├── board/
│   │   │   │   │   ├── backlog/
│   │   │   │   │   ├── iterations/
│   │   │   │   │   ├── settings/
│   │   │   │   │   └── work-items/
│   │   │   ├── boards/               # Visual Task Boards
│   │   │   │   ├── page.tsx
│   │   │   │   └── [boardId]/
│   │   │   ├── vault/                # Knowledge Vault
│   │   │   │   ├── page.tsx
│   │   │   │   ├── [noteId]/
│   │   │   │   └── graph/
│   │   │   ├── assistant/            # AI Assistant
│   │   │   │   ├── page.tsx
│   │   │   │   └── [conversationId]/
│   │   │   ├── guides/               # Guide Center
│   │   │   ├── reports/              # Reports & Analytics
│   │   │   ├── admin/                # Administration
│   │   │   │   ├── users/
│   │   │   │   ├── teams/
│   │   │   │   ├── settings/
│   │   │   │   └── audit/
│   │   │   └── settings/             # User Settings
│   │   ├── api/                      # API Routes
│   │   │   ├── auth/
│   │   │   ├── projects/
│   │   │   ├── work-items/
│   │   │   ├── boards/
│   │   │   ├── vault/
│   │   │   ├── assistant/
│   │   │   ├── admin/
│   │   │   ├── search/
│   │   │   ├── notifications/
│   │   │   ├── reports/
│   │   │   ├── uploads/
│   │   │   ├── guides/
│   │   │   └── health/
│   │   ├── layout.tsx                # Root layout
│   │   └── globals.css               # Global styles
│   ├── components/                   # React Components
│   │   ├── ui/                       # Base UI primitives
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── dropdown.tsx
│   │   │   ├── toast.tsx
│   │   │   ├── data-table.tsx
│   │   │   └── ...
│   │   ├── layout/                   # Layout components
│   │   │   ├── sidebar.tsx
│   │   │   ├── header.tsx
│   │   │   ├── breadcrumbs.tsx
│   │   │   └── command-palette.tsx
│   │   ├── projects/                 # Project module components
│   │   ├── boards/                   # Board module components
│   │   ├── vault/                    # Vault module components
│   │   ├── assistant/                # AI module components
│   │   └── shared/                   # Cross-module components
│   ├── services/                     # Business Logic Layer
│   │   ├── project.service.ts
│   │   ├── work-item.service.ts
│   │   ├── board.service.ts
│   │   ├── vault.service.ts
│   │   ├── assistant.service.ts
│   │   ├── auth.service.ts
│   │   ├── notification.service.ts
│   │   ├── search.service.ts
│   │   ├── report.service.ts
│   │   ├── upload.service.ts
│   │   └── audit.service.ts
│   ├── repositories/                 # Data Access Layer
│   │   ├── project.repository.ts
│   │   ├── work-item.repository.ts
│   │   ├── board.repository.ts
│   │   ├── vault.repository.ts
│   │   ├── user.repository.ts
│   │   └── base.repository.ts
│   ├── lib/                          # Shared utilities
│   │   ├── prisma.ts                 # Prisma client singleton
│   │   ├── auth.ts                   # Auth utilities
│   │   ├── events.ts                 # Internal event bus
│   │   ├── errors.ts                 # Error classes
│   │   ├── validators.ts             # Zod schemas
│   │   ├── constants.ts              # App constants
│   │   ├── encryption.ts             # Fernet/AES for API keys
│   │   ├── rate-limiter.ts           # Rate limiting
│   │   ├── logger.ts                 # Structured logging
│   │   └── utils.ts                  # General helpers
│   ├── hooks/                        # React hooks
│   │   ├── use-offline.ts
│   │   ├── use-sync.ts
│   │   ├── use-realtime.ts
│   │   ├── use-search.ts
│   │   └── use-auth.ts
│   ├── stores/                       # Zustand stores
│   │   ├── app.store.ts
│   │   ├── offline.store.ts
│   │   └── notification.store.ts
│   ├── offline/                      # Offline/sync layer
│   │   ├── db.ts                     # Dexie.js IndexedDB schema
│   │   ├── sync-engine.ts            # Sync queue processor
│   │   ├── cache-strategy.ts         # Cache invalidation logic
│   │   └── conflict-resolver.ts      # Conflict resolution
│   ├── types/                        # TypeScript types
│   │   ├── api.types.ts
│   │   ├── models.types.ts
│   │   ├── events.types.ts
│   │   └── index.ts
│   └── config/                       # App configuration
│       ├── navigation.ts
│       ├── permissions.ts
│       └── defaults.ts
├── tests/                            # Test suites
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── fixtures/
├── scripts/                          # Utility scripts
│   ├── setup.ts                      # First-run setup wizard
│   ├── backup.ts                     # Database backup
│   ├── restore.ts                    # Database restore
│   └── migrate.ts                    # Migration runner
├── docs/                             # Documentation
│   ├── ARCHITECTURE.md
│   ├── DEPLOYMENT.md
│   ├── API.md
│   ├── DEVELOPMENT.md
│   └── CONTRIBUTING.md
├── .env.example                      # Environment template
├── .env.local                        # Local overrides (gitignored)
├── next.config.ts                    # Next.js configuration
├── tailwind.config.ts                # Tailwind configuration
├── tsconfig.json                     # TypeScript config
├── vitest.config.ts                  # Test config
├── playwright.config.ts              # E2E test config
├── package.json                      # Dependencies & scripts
├── pnpm-lock.yaml                    # Lock file
└── README.md                         # Project documentation
```

---

## 6. Database Architecture

### Design Principles

1. **PostgreSQL as the single data store** — no Redis, no Elasticsearch needed for the initial release.
2. **Full-text search via `tsvector`** — built into PostgreSQL, no external service.
3. **JSON columns for flexible metadata** — extensibility without schema changes.
4. **Polymorphic relations for shared features** — comments, attachments, activity logs work across all entities.
5. **Soft deletes** — all major entities have `deleted_at` column.
6. **Audit trail** — all mutations logged with user, timestamp, and diff.

### Schema Overview

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
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
  role          UserRole  @default(MEMBER)
  status        UserStatus @default(ACTIVE)
  timezone      String    @default("UTC")
  preferences   Json      @default("{}")
  aiApiKey      String?   // Encrypted at rest
  aiProvider    String?   // openrouter, openai, anthropic, etc.
  aiModel       String?   // User-selected model
  lastActiveAt  DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime?

  // Relations
  teamMemberships  TeamMember[]
  assignedItems    WorkItem[]     @relation("assignee")
  reportedItems    WorkItem[]     @relation("reporter")
  createdProjects  Project[]
  cards            CardMember[]
  comments         Comment[]
  activities       Activity[]
  notifications    Notification[]
  conversations    Conversation[]
  sessions         Session[]
  vaultNotes       VaultNote[]    @relation("author")

  @@map("users")
}

enum UserRole {
  ADMIN
  MANAGER
  MEMBER
  VIEWER
}

enum UserStatus {
  ACTIVE
  INACTIVE
  LOCKED
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
  id          String   @id @default(cuid())
  name        String
  description String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  deletedAt   DateTime?

  members  TeamMember[]
  projects Project[]

  @@map("teams")
}

model TeamMember {
  id     String   @id @default(cuid())
  userId String
  teamId String
  role   TeamRole @default(MEMBER)
  joinedAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  team Team @relation(fields: [teamId], references: [id], onDelete: Cascade)

  @@unique([userId, teamId])
  @@map("team_members")
}

enum TeamRole {
  LEAD
  MEMBER
}

// ============================================================
// PROJECT TRACKER (inspired by issue trackers)
// ============================================================

model Project {
  id          String        @id @default(cuid())
  key         String        @unique  // e.g., "MKZ", "OPS"
  name        String
  description String?
  status      ProjectStatus @default(ACTIVE)
  leadId      String?
  teamId      String?
  settings    Json          @default("{}")  // workflow config, custom fields
  createdById String
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  deletedAt   DateTime?

  lead       User?       @relation(fields: [createdById], references: [id])
  team       Team?       @relation(fields: [teamId], references: [id])
  workItems  WorkItem[]
  iterations Iteration[]
  initiatives Initiative[]
  workflows  Workflow[]
  labels     Label[]

  @@map("projects")
}

enum ProjectStatus {
  ACTIVE
  ARCHIVED
  COMPLETED
}

model WorkItem {
  id           String         @id @default(cuid())
  projectId    String
  number       Int            // Auto-increment per project (MKZ-1, MKZ-2)
  type         WorkItemType
  title        String
  description  String?        // Markdown content
  status       String         // Configurable per project workflow
  priority     Priority       @default(MEDIUM)
  assigneeId   String?
  reporterId   String
  initiativeId String?
  iterationId  String?
  parentId     String?        // Sub-tasks
  storyPoints  Int?
  dueDate      DateTime?
  resolvedAt   DateTime?
  metadata     Json           @default("{}")  // Custom fields
  position     Int            @default(0)     // Ordering
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt
  deletedAt    DateTime?

  // Full-text search vector (maintained via trigger)
  // searchVector Unsupported("tsvector")?

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

enum WorkItemType {
  TASK
  BUG
  FEATURE
  IMPROVEMENT
}

enum Priority {
  CRITICAL
  HIGH
  MEDIUM
  LOW
}

model WorkItemLink {
  id           String   @id @default(cuid())
  sourceId     String
  targetId     String
  linkType     LinkType
  createdAt    DateTime @default(now())

  source WorkItem @relation("source", fields: [sourceId], references: [id], onDelete: Cascade)
  target WorkItem @relation("target", fields: [targetId], references: [id], onDelete: Cascade)

  @@unique([sourceId, targetId, linkType])
  @@map("work_item_links")
}

enum LinkType {
  BLOCKS
  BLOCKED_BY
  RELATES_TO
  DUPLICATES
  PARENT_OF
  CHILD_OF
}

model Iteration {
  id        String          @id @default(cuid())
  projectId String
  name      String
  goal      String?
  status    IterationStatus @default(PLANNING)
  startDate DateTime?
  endDate   DateTime?
  createdAt DateTime        @default(now())
  updatedAt DateTime        @updatedAt

  project   Project    @relation(fields: [projectId], references: [id])
  workItems WorkItem[]

  @@map("iterations")
}

enum IterationStatus {
  PLANNING
  ACTIVE
  COMPLETED
  CANCELLED
}

model Initiative {
  id          String          @id @default(cuid())
  projectId   String
  name        String
  description String?
  status      InitiativeStatus @default(OPEN)
  progress    Float           @default(0)  // 0.0 - 1.0
  startDate   DateTime?
  targetDate  DateTime?
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt

  project   Project    @relation(fields: [projectId], references: [id])
  workItems WorkItem[]

  @@map("initiatives")
}

enum InitiativeStatus {
  OPEN
  IN_PROGRESS
  COMPLETED
  CANCELLED
}

model Workflow {
  id        String   @id @default(cuid())
  projectId String
  name      String
  statuses  Json     // Array of {id, name, category: "todo"|"in_progress"|"done"}
  transitions Json   // Array of {from, to, conditions?}
  isDefault Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  project Project @relation(fields: [projectId], references: [id])

  @@map("workflows")
}

model Label {
  id        String @id @default(cuid())
  projectId String
  name      String
  color     String
  createdAt DateTime @default(now())

  project   Project @relation(fields: [projectId], references: [id])
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
  id          String   @id @default(cuid())
  name        String
  description String?
  visibility  Visibility @default(PRIVATE)
  createdById String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  deletedAt   DateTime?

  boards  Board[]
  members SpaceMember[]

  @@map("spaces")
}

enum Visibility {
  PRIVATE
  TEAM
  PUBLIC
}

model SpaceMember {
  id      String    @id @default(cuid())
  spaceId String
  userId  String
  role    SpaceRole @default(MEMBER)

  space Space @relation(fields: [spaceId], references: [id], onDelete: Cascade)

  @@unique([spaceId, userId])
  @@map("space_members")
}

enum SpaceRole {
  OWNER
  ADMIN
  MEMBER
  VIEWER
}

model Board {
  id          String   @id @default(cuid())
  spaceId     String
  name        String
  description String?
  background  String?  // Color or image URL
  settings    Json     @default("{}")
  position    Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  deletedAt   DateTime?

  space   Space    @relation(fields: [spaceId], references: [id])
  columns Column[]
  boardLabels BoardLabel[]

  @@map("boards")
}

model Column {
  id       String @id @default(cuid())
  boardId  String
  name     String
  position Int    @default(0)
  limit    Int?   // WIP limit
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
  description String?   // Markdown
  position    Int       @default(0)
  dueDate     DateTime?
  coverImage  String?
  metadata    Json      @default("{}")
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
  id       String  @id @default(cuid())
  parentId String?
  name     String
  path     String  // Full path: "/engineering/guides"
  position Int     @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime?

  parent   VaultFolder?  @relation("subfolders", fields: [parentId], references: [id])
  children VaultFolder[] @relation("subfolders")
  notes    VaultNote[]

  @@unique([parentId, name])
  @@map("vault_folders")
}

model VaultNote {
  id        String     @id @default(cuid())
  folderId  String?
  title     String
  slug      String     @unique  // URL-friendly identifier
  content   String     // Markdown with internal links [[note-slug]]
  excerpt   String?    // Auto-generated summary
  status    NoteStatus @default(DRAFT)
  authorId  String
  metadata  Json       @default("{}")
  version   Int        @default(1)
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
  deletedAt DateTime?
  publishedAt DateTime?

  folder    VaultFolder? @relation(fields: [folderId], references: [id])
  author    User         @relation("author", fields: [authorId], references: [id])
  tags      NoteTag[]
  outLinks  InternalLink[] @relation("source")
  inLinks   InternalLink[] @relation("target")
  versions  NoteVersion[]
  feedback  NoteFeedback[]

  @@index([folderId])
  @@index([authorId])
  @@map("vault_notes")
}

enum NoteStatus {
  DRAFT
  PUBLISHED
  ARCHIVED
}

model NoteVersion {
  id       String   @id @default(cuid())
  noteId   String
  version  Int
  title    String
  content  String
  editedBy String
  createdAt DateTime @default(now())

  note VaultNote @relation(fields: [noteId], references: [id], onDelete: Cascade)

  @@unique([noteId, version])
  @@map("note_versions")
}

model InternalLink {
  id       String @id @default(cuid())
  sourceId String
  targetId String
  context  String? // Surrounding text for preview

  source VaultNote @relation("source", fields: [sourceId], references: [id], onDelete: Cascade)
  target VaultNote @relation("target", fields: [targetId], references: [id], onDelete: Cascade)

  @@unique([sourceId, targetId])
  @@map("internal_links")
}

model Tag {
  id    String @id @default(cuid())
  name  String @unique
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
  id       String @id @default(cuid())
  noteId   String
  userId   String
  helpful  Boolean
  comment  String?
  createdAt DateTime @default(now())

  note VaultNote @relation(fields: [noteId], references: [id], onDelete: Cascade)

  @@unique([noteId, userId])
  @@map("note_feedback")
}

// ============================================================
// AI ASSISTANT
// ============================================================

model Conversation {
  id        String   @id @default(cuid())
  userId    String
  title     String?
  model     String?  // AI model used
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime?

  user     User      @relation(fields: [userId], references: [id])
  messages Message[]

  @@index([userId])
  @@map("conversations")
}

model Message {
  id             String      @id @default(cuid())
  conversationId String
  role           MessageRole
  content        String
  toolCalls      Json?       // Tool call requests
  toolResults    Json?       // Tool call results
  model          String?     // Model that generated this
  tokens         Int?        // Token count
  createdAt      DateTime    @default(now())

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId])
  @@map("messages")
}

enum MessageRole {
  USER
  ASSISTANT
  SYSTEM
  TOOL
}

// ============================================================
// SHARED / CROSS-CUTTING
// ============================================================

model Comment {
  id         String   @id @default(cuid())
  entityType String   // "work_item", "card", "vault_note"
  entityId   String
  authorId   String
  content    String   // Markdown
  parentId   String?  // Threaded replies
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  deletedAt  DateTime?

  author   User      @relation(fields: [authorId], references: [id])
  parent   Comment?  @relation("replies", fields: [parentId], references: [id])
  replies  Comment[] @relation("replies")

  @@index([entityType, entityId])
  @@map("comments")
}

model Attachment {
  id         String   @id @default(cuid())
  entityType String
  entityId   String
  fileName   String
  fileSize   Int
  mimeType   String
  storagePath String  // Relative path in /data/uploads/
  uploadedBy String
  createdAt  DateTime @default(now())

  @@index([entityType, entityId])
  @@map("attachments")
}

model Activity {
  id         String   @id @default(cuid())
  entityType String
  entityId   String
  userId     String
  action     String   // "created", "updated", "deleted", "status_changed", etc.
  changes    Json?    // {field: {old, new}}
  createdAt  DateTime @default(now())

  user User @relation(fields: [userId], references: [id])

  @@index([entityType, entityId])
  @@index([userId])
  @@map("activities")
}

model Notification {
  id         String   @id @default(cuid())
  userId     String
  type       String   // "mention", "assignment", "status_change", "comment", etc.
  title      String
  body       String?
  entityType String?
  entityId   String?
  isRead     Boolean  @default(false)
  readAt     DateTime?
  createdAt  DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, isRead])
  @@map("notifications")
}

model AuditLog {
  id        String   @id @default(cuid())
  userId    String?
  action    String
  resource  String
  resourceId String?
  details   Json?
  ipAddress String?
  userAgent String?
  createdAt DateTime @default(now())

  @@index([userId])
  @@index([resource, resourceId])
  @@index([createdAt])
  @@map("audit_logs")
}

// ============================================================
// GUIDE CENTER
// ============================================================

model Guide {
  id          String      @id @default(cuid())
  title       String
  slug        String      @unique
  content     String      // Markdown
  category    String
  order       Int         @default(0)
  status      GuideStatus @default(PUBLISHED)
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  @@map("guides")
}

enum GuideStatus {
  DRAFT
  PUBLISHED
  ARCHIVED
}

// ============================================================
// SYSTEM CONFIGURATION
// ============================================================

model SystemConfig {
  id    String @id @default(cuid())
  key   String @unique
  value Json
  updatedAt DateTime @updatedAt

  @@map("system_config")
}
```

### Database Indexes & Performance

```sql
-- Full-text search indexes (applied via Prisma raw migration)
CREATE INDEX idx_work_items_search ON work_items
  USING GIN (to_tsvector('english', title || ' ' || COALESCE(description, '')));

CREATE INDEX idx_vault_notes_search ON vault_notes
  USING GIN (to_tsvector('english', title || ' ' || COALESCE(content, '')));

CREATE INDEX idx_cards_search ON cards
  USING GIN (to_tsvector('english', title || ' ' || COALESCE(description, '')));

-- Trigram index for fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_work_items_title_trgm ON work_items USING GIN (title gin_trgm_ops);
CREATE INDEX idx_vault_notes_title_trgm ON vault_notes USING GIN (title gin_trgm_ops);
```

---

## 7. Backend Architecture

### Service Layer Pattern

Every business operation goes through a service class. API routes are thin — they validate input, call the service, and format the response.

```typescript
// src/services/work-item.service.ts (conceptual)

export class WorkItemService {
  constructor(
    private repo: WorkItemRepository,
    private events: EventBus,
    private auth: AuthContext
  ) {}

  async create(data: CreateWorkItemInput): Promise<WorkItem> {
    // 1. Validate business rules
    // 2. Auto-assign number (per project)
    // 3. Check workflow allows initial status
    // 4. Persist via repository
    // 5. Emit event (for notifications, activity log, WebSocket broadcast)
    // 6. Return created item
  }

  async transition(id: string, newStatus: string): Promise<WorkItem> {
    // 1. Load current item
    // 2. Validate transition is allowed by workflow
    // 3. Update status
    // 4. Emit "status_changed" event
    // 5. Return updated item
  }
}
```

### Event Bus

```typescript
// src/lib/events.ts

type EventMap = {
  'work_item.created': { workItem: WorkItem; userId: string };
  'work_item.updated': { workItem: WorkItem; changes: Record<string, any>; userId: string };
  'work_item.deleted': { workItemId: string; userId: string };
  'card.moved': { card: Card; fromColumn: string; toColumn: string; userId: string };
  'vault_note.published': { note: VaultNote; userId: string };
  'comment.created': { comment: Comment; userId: string };
  // ... more events
};

// Listeners:
// - NotificationService: creates notifications for relevant users
// - ActivityService: logs the activity
// - WebSocketBroadcaster: pushes update to connected clients
// - SearchIndexer: updates search vectors
// - (Future) AIAgentHook: notifies the AI agent of state changes
```

### API Route Structure

```typescript
// src/app/api/work-items/route.ts (conceptual)

export async function GET(req: NextRequest) {
  const session = await requireAuth(req);
  const params = parseSearchParams(req, WorkItemFilterSchema);
  const result = await workItemService.list(params, session.user);
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const session = await requireAuth(req);
  const body = await validateBody(req, CreateWorkItemSchema);
  const item = await workItemService.create(body, session.user);
  return NextResponse.json(item, { status: 201 });
}
```

### Middleware Stack

```
Request
  → Rate Limiter
  → CORS (configurable origins)
  → Auth (session validation)
  → RBAC (permission check)
  → Input Validation (Zod)
  → Service Call
  → Response Formatting
  → Audit Logging
```

---

## 8. Frontend Architecture

### Component Hierarchy

```
RootLayout
├── AuthProvider (session context)
├── ThemeProvider (light/dark mode)
├── OfflineProvider (sync status)
├── NotificationProvider (real-time)
├── ToastProvider
└── Pages
    ├── (auth) - Login, Register, Forgot Password
    └── (dashboard) - Protected app shell
        ├── Sidebar (navigation, spaces, projects)
        ├── Header (search, notifications, user menu)
        ├── CommandPalette (Cmd+K)
        └── Content Area (routed views)
```

### State Management Strategy

| State Type | Storage | Tool |
|-----------|---------|------|
| Server state (entities) | PostgreSQL → API → React Query | TanStack Query |
| UI state (modals, sidebar) | Memory | Zustand |
| Form state | Component-local | React Hook Form |
| Offline cache | IndexedDB | Dexie.js |
| Auth state | HTTP-only cookie + context | NextAuth |
| Theme/Preferences | localStorage | Zustand persist |

### Key UI Components

1. **Command Palette** (Cmd+K): Global search, quick actions, navigation
2. **Data Tables**: Sortable, filterable, bulk actions, keyboard navigation
3. **Board View**: Drag-and-drop columns and cards (using dnd-kit)
4. **Rich Text Editor**: Markdown with preview, internal links, file uploads (using Tiptap or MDXEditor)
5. **Graph Visualization**: D3.js force-directed graph for vault note connections
6. **Split Panes**: Resizable panels for vault explorer
7. **Toast Notifications**: Non-blocking feedback
8. **Skeleton Loaders**: Loading states that match content layout

### Design System

- **Tokens**: CSS custom properties for colors, spacing, typography, shadows
- **Dark Mode**: System-preference detection + manual toggle
- **Responsive**: Mobile-friendly layouts (sidebar collapses, boards scroll horizontally)
- **Accessibility**: ARIA labels, keyboard navigation, focus management, reduced motion support
- **No external fonts**: System font stack for offline capability

---

## 9. Local-First & Offline Architecture

### Strategy: "Server-Authoritative with Offline Resilience"

The server (PostgreSQL) is the source of truth. The client caches data locally for:
1. **Instant page loads** (read from cache, refresh in background)
2. **Offline viewing** (cached data remains accessible)
3. **Offline mutations** (queued and synced when reconnected)

### Implementation Layers

```
┌─────────────────────────────────────────┐
│  React Components                       │
│  (read from TanStack Query cache)       │
├─────────────────────────────────────────┤
│  TanStack Query                         │
│  (stale-while-revalidate pattern)       │
├─────────────────────────────────────────┤
│  Offline Sync Layer                     │
│  (intercepts mutations when offline)    │
├─────────────────────────────────────────┤
│  IndexedDB (Dexie.js)                   │
│  (persistent cache + mutation queue)    │
├─────────────────────────────────────────┤
│  Service Worker (Workbox)               │
│  (caches static assets + API responses) │
└─────────────────────────────────────────┘
```

### Service Worker Strategy

```typescript
// Static assets: Cache-First (immutable hashed files)
// API GET requests: Network-First with cache fallback
// API mutations: Network-Only (queued if offline)
// HTML pages: Stale-While-Revalidate
```

### Offline Mutation Queue

```typescript
// src/offline/sync-engine.ts (conceptual)

interface QueuedMutation {
  id: string;
  timestamp: number;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  body: any;
  retryCount: number;
  status: 'pending' | 'syncing' | 'failed' | 'completed';
}

// When online: mutations go directly to server
// When offline: mutations are stored in IndexedDB queue
// When reconnected: queue processes in order (FIFO)
// Conflicts: Last-write-wins with server timestamp comparison
```

### Conflict Resolution

For a company-internal tool, **last-write-wins** is sufficient:
1. Each entity has an `updatedAt` timestamp
2. When syncing offline mutations, the server checks if `updatedAt` has changed since the offline mutation was created
3. If conflict detected: notify the user, let them choose which version to keep
4. Future enhancement: field-level merging for non-conflicting changes

### Offline Indicators

- **Connection status badge** in the header (green/yellow/red)
- **Pending sync count** shown to user
- **Optimistic UI**: mutations appear immediately, revert if sync fails
- **Offline banner**: "You're offline. Changes will sync when reconnected."

---

## 10. Authentication & Authorization

### Authentication

| Feature | Implementation |
|---------|---------------|
| Login | Email + password (bcrypt hashed) |
| Sessions | HTTP-only secure cookies (server-side sessions in DB) |
| Token rotation | Session refreshed on activity, absolute expiry |
| Password reset | Email-based token (works if SMTP configured) |
| Brute force protection | 5 failed attempts → 15 min lockout |
| Session management | Users can view/revoke active sessions |
| First-run setup | Admin account created on first boot |

### Authorization (RBAC)

```typescript
// Role hierarchy
ADMIN > MANAGER > MEMBER > VIEWER

// Permissions matrix
const permissions = {
  ADMIN: ['*'],  // Everything
  MANAGER: [
    'projects.*',
    'work_items.*',
    'boards.*',
    'vault.*',
    'users.read',
    'teams.*',
    'reports.*',
  ],
  MEMBER: [
    'projects.read',
    'work_items.*',
    'boards.*',
    'vault.*',
    'reports.read',
  ],
  VIEWER: [
    'projects.read',
    'work_items.read',
    'boards.read',
    'vault.read',
    'reports.read',
  ],
};
```

### Resource-Level Access

Beyond roles, resources have ownership and team-based access:
- **Projects**: Team members + explicitly shared users
- **Spaces/Boards**: Space members with role-based access
- **Vault Notes**: Author + published (visible to all) / draft (author only)
- **Conversations**: Private to the user who created them

---

## 11. Multi-User & Multi-Tenant

### Model: Single-Tenant, Multi-User

Mkindayzir is designed as a **single-tenant** application — one instance per organization. This simplifies:
- Data isolation (all data belongs to one org)
- Performance (no tenant filtering on every query)
- Deployment (one Docker stack per company)
- Backup (one database to back up)

### Multi-User Features

- Concurrent access with real-time updates (WebSocket)
- User presence indicators ("Alice is viewing this item")
- @mentions in comments and descriptions
- Assignment and notification routing
- Team-based organization
- Personal dashboard with assigned items

### Future Multi-Tenant Option

If needed later, the architecture supports adding a `tenantId` column to all tables and a tenant-resolution middleware. The service layer already abstracts data access, making this a data-layer change only.

---

## 12. API Architecture

### Design: RESTful with conventions

```
Base URL: /api

Authentication: Cookie-based session (Authorization header for programmatic access)
Content-Type: application/json
Error format: { error: { code: string, message: string, details?: any } }
Pagination: { data: T[], meta: { total, page, pageSize, totalPages } }
```

### Endpoint Map

```
/api/health                           GET     - Health check (no auth)
/api/auth/login                       POST    - Login
/api/auth/logout                      POST    - Logout
/api/auth/me                          GET     - Current user
/api/auth/register                    POST    - Register (if enabled)
/api/auth/forgot-password             POST    - Request reset
/api/auth/reset-password              POST    - Execute reset
/api/auth/sessions                    GET     - List active sessions
/api/auth/sessions/:id                DELETE  - Revoke session

/api/projects                         GET     - List projects
/api/projects                         POST    - Create project
/api/projects/:id                     GET     - Get project
/api/projects/:id                     PATCH   - Update project
/api/projects/:id                     DELETE  - Archive project
/api/projects/:id/workflows           GET|POST|PATCH|DELETE

/api/work-items                       GET     - List/filter work items
/api/work-items                       POST    - Create work item
/api/work-items/:id                   GET     - Get work item
/api/work-items/:id                   PATCH   - Update work item
/api/work-items/:id                   DELETE  - Delete work item
/api/work-items/:id/transition        POST    - Status transition
/api/work-items/:id/comments          GET|POST
/api/work-items/:id/attachments       GET|POST|DELETE
/api/work-items/:id/links             GET|POST|DELETE
/api/work-items/bulk                  PATCH   - Bulk operations

/api/iterations                       GET|POST
/api/iterations/:id                   GET|PATCH|DELETE
/api/iterations/:id/items             GET     - Items in iteration

/api/initiatives                      GET|POST
/api/initiatives/:id                  GET|PATCH|DELETE

/api/spaces                           GET|POST
/api/spaces/:id                       GET|PATCH|DELETE
/api/spaces/:id/members               GET|POST|DELETE

/api/boards                           GET|POST
/api/boards/:id                       GET|PATCH|DELETE
/api/boards/:id/columns               GET|POST|PATCH|DELETE
/api/boards/:id/cards                 GET|POST
/api/cards/:id                        GET|PATCH|DELETE
/api/cards/:id/move                   POST    - Move card between columns
/api/cards/:id/members                POST|DELETE
/api/cards/:id/checklists             GET|POST|PATCH|DELETE
/api/cards/:id/labels                 POST|DELETE

/api/vault/folders                    GET|POST|PATCH|DELETE
/api/vault/notes                      GET|POST
/api/vault/notes/:id                  GET|PATCH|DELETE
/api/vault/notes/:id/publish          POST
/api/vault/notes/:id/versions         GET
/api/vault/notes/:id/links            GET     - Internal links
/api/vault/notes/:id/feedback         POST
/api/vault/graph                      GET     - Graph data (nodes + edges)
/api/vault/tags                       GET|POST|DELETE

/api/assistant/conversations          GET|POST
/api/assistant/conversations/:id      GET|DELETE
/api/assistant/conversations/:id/chat POST    - Send message (SSE response)
/api/assistant/models                 GET     - Available models

/api/search                           GET     - Omnisearch across all entities
/api/search/suggestions               GET     - Typeahead suggestions

/api/notifications                    GET     - List notifications
/api/notifications/read               POST    - Mark as read
/api/notifications/read-all           POST    - Mark all as read

/api/reports/summary                  GET     - Dashboard summary
/api/reports/workload                 GET     - Team workload
/api/reports/velocity                 GET     - Iteration velocity
/api/reports/export                   GET     - CSV/JSON export

/api/admin/users                      GET|POST|PATCH|DELETE
/api/admin/teams                      GET|POST|PATCH|DELETE
/api/admin/audit                      GET     - Audit log
/api/admin/settings                   GET|PATCH - System settings
/api/admin/backup                     POST    - Trigger backup
/api/admin/restore                    POST    - Restore from backup

/api/uploads                          POST    - Upload file
/api/uploads/:id                      GET     - Download file
/api/uploads/:id                      DELETE  - Delete file

/api/guides                           GET     - List guides
/api/guides/:slug                     GET     - Get guide
/api/guides                           POST    - Create guide (admin)
/api/guides/:id                       PATCH|DELETE - Update/delete (admin)

/api/settings                         GET|PATCH - User settings
/api/settings/ai                      GET|PATCH - AI configuration
```

### API Versioning Strategy

For now, no version prefix (all under `/api/`). When breaking changes are needed in the future:
- New endpoints go under `/api/v2/`
- Old endpoints remain available with deprecation headers
- Migration guide provided in changelog

### Rate Limiting

```
General API: 100 requests/minute per user
AI endpoints: 20 requests/minute per user
Auth endpoints: 5 requests/minute per IP (brute force protection)
Upload endpoint: 10 requests/minute per user
```

---

## 13. AI Integration

### Architecture: Proxy Pattern

The Mkindayzir server acts as a **proxy** between the user's browser and the AI provider. This:
- Keeps the user's API key on the server (never sent to the browser)
- Allows the server to inject system prompts and tool definitions
- Enables server-side rate limiting and usage tracking
- Supports SSE streaming from server to client

### Flow

```
Browser → Mkindayzir Server → AI Provider API (internet)
   ↑          ↓                      ↓
   └── SSE ───┘                 Response stream
```

### Supported Providers

| Provider | Base URL | Models |
|----------|----------|--------|
| OpenRouter | https://openrouter.ai/api/v1 | All models via single key |
| OpenAI | https://api.openai.com/v1 | GPT-4, GPT-3.5, etc. |
| Anthropic | https://api.anthropic.com | Claude models |
| Custom/Local | User-configurable URL | Any OpenAI-compatible API |

### User API Key Management

1. User enters their API key in Settings → AI Configuration
2. Key is encrypted with AES-256-GCM using a server-derived key
3. Encrypted key stored in `users.aiApiKey` column
4. Decrypted only when making AI API calls (never sent to frontend)
5. User can test their key, change provider, change model

### AI Tool Calling (Current Scope)

The Mkindayzir Assistant can call tools to interact with the application:

```typescript
const tools = [
  {
    name: 'search_work_items',
    description: 'Search work items by query, status, assignee, project',
    parameters: { query: string, filters?: object }
  },
  {
    name: 'get_work_item',
    description: 'Get details of a specific work item',
    parameters: { id: string }
  },
  {
    name: 'create_work_item',
    description: 'Create a new work item',
    parameters: { projectId, title, type, priority, description? }
  },
  {
    name: 'update_work_item_status',
    description: 'Transition a work item to a new status',
    parameters: { id, newStatus }
  },
  {
    name: 'search_vault',
    description: 'Search knowledge vault notes',
    parameters: { query: string }
  },
  {
    name: 'get_vault_note',
    description: 'Get a vault note by ID or slug',
    parameters: { identifier: string }
  },
  {
    name: 'summarize_iteration',
    description: 'Get summary of an iteration (progress, blockers)',
    parameters: { iterationId: string }
  },
];
```

### AI Streaming (SSE)

```typescript
// Server-side: Stream AI responses via Server-Sent Events
// POST /api/assistant/conversations/:id/chat

// Client receives:
// event: token
// data: {"content": "Hello"}
//
// event: tool_call
// data: {"name": "search_work_items", "arguments": {...}}
//
// event: tool_result
// data: {"name": "search_work_items", "result": [...]}
//
// event: done
// data: {"messageId": "..."}
```

### Offline Behavior

When the server has no internet connection:
- AI features show a clear message: "AI Assistant requires internet access. Please check your connection."
- All other features continue to work normally
- The AI conversation history remains viewable offline

---

## 14. Module Specifications

### 14.1 Project Tracker

**Purpose**: Plan, track, and manage work across teams with configurable workflows.

**Features**:
- Create projects with unique keys (e.g., "MKZ-123")
- Configurable workflows per project (statuses + allowed transitions)
- Work items with types: Task, Bug, Feature, Improvement
- Priority levels: Critical, High, Medium, Low
- Iterations (time-boxed work periods)
- Initiatives (group related work items toward a goal)
- Sub-tasks (parent/child work items)
- Labels/tags for categorization
- Bulk operations (assign, move, label)
- Board view (work items as cards in status columns)
- List view (filterable, sortable table)
- Backlog view (unscheduled items)
- Work item detail view (description, comments, activity, attachments, links)
- Custom fields (via JSON metadata)
- Story points for estimation
- Due dates and SLA tracking
- Import/Export (CSV)

### 14.2 Visual Task Boards

**Purpose**: Flexible visual boards for any workflow — personal tasks, team processes, project stages.

**Features**:
- Spaces (organizational containers, like a department or team)
- Multiple boards per space
- Columns with optional WIP limits
- Cards with:
  - Title, description (Markdown)
  - Members (assigned users)
  - Labels (colored tags)
  - Due dates
  - Checklists (with progress indicator)
  - Attachments
  - Cover images
  - Comments
  - Activity log
- Drag-and-drop (cards between columns, reorder within columns)
- Board backgrounds (colors)
- Card filtering (by member, label, due date)
- Board templates (pre-configured column layouts)
- Archive cards/columns

### 14.3 Knowledge Vault

**Purpose**: Team knowledge base with interconnected documents, versioning, and graph visualization.

**Features**:
- Hierarchical folder structure
- Markdown documents with rich editing
- Internal links (`[[note-slug]]` syntax)
- Bidirectional link resolution (backlinks shown on each note)
- Graph visualization (D3 force-directed) showing note connections
- Tags for cross-cutting categorization
- Version history with diff view
- Publishing workflow (Draft → Published → Archived)
- Full-text search within vault
- Note excerpts/summaries (auto-generated)
- Feedback (helpful/not helpful) for knowledge quality
- Collections (curated groups of notes)
- File attachments within notes
- Table of contents (auto-generated from headings)

### 14.4 Mkindayzir Assistant (AI)

**Purpose**: AI-powered assistant that understands the application context and helps users work more efficiently.

**Features**:
- Conversational interface with streaming responses
- Multiple conversations with history
- Model selection (user chooses their preferred AI model)
- Provider selection (OpenRouter, OpenAI, Anthropic, custom)
- Tool calling (search, create, update entities within Mkindayzir)
- Context-aware (knows about projects, items, vault content)
- Markdown rendering in responses
- Code syntax highlighting
- Token usage tracking
- Rate limiting (20 req/min)
- Clear offline messaging

### 14.5 Guide Center

**Purpose**: Built-in help system for onboarding and self-service support.

**Features**:
- Categorized guides
- Markdown content with rich formatting
- Search within guides
- Reading progress tracking
- Admin-managed content (CRUD)
- Ordering/positioning
- Draft/Published status

### 14.6 Reports & Analytics

**Purpose**: Visibility into team productivity and project health.

**Features**:
- Dashboard summary (open items, overdue, completed this week)
- Team workload (items per assignee)
- Iteration velocity (points completed over time)
- Status distribution (pie/bar charts)
- Trend analysis (items created vs resolved over time)
- SLA compliance (if SLA policies configured)
- Export to CSV
- Date range filtering

---

## 15. Search Architecture

### Implementation: PostgreSQL Full-Text Search + Trigram

No external search service needed. PostgreSQL provides:
1. **`tsvector` / `tsquery`** — Full-text search with ranking
2. **`pg_trgm`** — Fuzzy/typo-tolerant matching
3. **Combined scoring** — Rank results by relevance

### Omnisearch

Single search endpoint that queries across all entities:

```typescript
// GET /api/search?q=authentication+bug&types=work_item,vault_note

// Returns:
{
  results: [
    { type: "work_item", id: "...", title: "Fix auth bug", score: 0.95, ... },
    { type: "vault_note", id: "...", title: "Authentication Guide", score: 0.82, ... },
  ],
  meta: { total: 12, took_ms: 45 }
}
```

### Search Indexing

- Work Items: title + description
- Vault Notes: title + content
- Cards: title + description
- Comments: content (linked to parent entity)
- Guides: title + content

Indexes are maintained automatically via PostgreSQL triggers.

### Typeahead Suggestions

- Trigram-based prefix matching
- Returns top 5 suggestions as user types
- Debounced (300ms) on the client

---

## 16. File Storage

### Default: Local Filesystem

```
/data/
├── uploads/
│   ├── attachments/
│   │   └── {year}/{month}/{uuid}.{ext}
│   ├── avatars/
│   │   └── {userId}.{ext}
│   └── covers/
│       └── {boardId}/{uuid}.{ext}
├── backups/
│   └── mkindayzir-backup-{timestamp}.sql.gz
└── exports/
    └── {userId}/{export-id}.csv
```

### Upload Handling

- Max file size: 50MB (configurable)
- Allowed MIME types: configurable whitelist
- Files stored with UUID names (original name in metadata)
- Virus scanning: optional (ClamAV integration hook)
- Serving: streaming via API route (with auth check)

### Future: S3-Compatible Storage

Architecture supports swapping to MinIO, AWS S3, or any S3-compatible store via a `StorageProvider` interface:

```typescript
interface StorageProvider {
  upload(file: Buffer, key: string, metadata: FileMetadata): Promise<string>;
  download(key: string): Promise<ReadableStream>;
  delete(key: string): Promise<void>;
  getUrl(key: string): Promise<string>;
}
```

---

## 17. Real-Time Communication

### WebSocket via Socket.io

```typescript
// Server events emitted to clients:
'work_item:updated'    // Work item changed
'work_item:created'    // New work item
'card:moved'           // Card moved between columns
'card:updated'         // Card details changed
'notification:new'     // New notification for user
'presence:update'      // User presence change
'sync:required'        // Client should refetch data
```

### Connection Management

- Authenticated connections only (session token validated on connect)
- Room-based broadcasting:
  - `project:{id}` — All users viewing a project
  - `board:{id}` — All users viewing a board
  - `user:{id}` — Private channel for notifications
- Automatic reconnection with exponential backoff
- Graceful degradation: if WebSocket fails, falls back to polling

### Presence

- Track which users are viewing which entities
- Show avatars/names of other viewers on work items, boards, notes
- Auto-expire presence after 5 minutes of inactivity

---

## 18. Security

### Defense Layers

| Layer | Measures |
|-------|----------|
| Network | HTTPS everywhere (TLS 1.3), HSTS headers |
| Authentication | bcrypt (cost 12), session rotation, idle timeout |
| Authorization | RBAC + resource-level access checks |
| Input | Zod validation on all inputs, parameterized queries (Prisma) |
| Output | JSON serialization (no raw HTML), Content-Security-Policy |
| CSRF | Double-submit cookie pattern |
| XSS | React's automatic escaping, CSP headers, no dangerouslySetInnerHTML |
| SQL Injection | Prisma ORM (parameterized), no raw SQL without explicit params |
| File Upload | MIME validation, size limits, stored outside web root |
| API Keys | AES-256-GCM encryption at rest |
| Sessions | HTTP-only, Secure, SameSite=Lax cookies |
| Rate Limiting | Per-user and per-IP rate limits |
| Audit | All mutations logged with user, timestamp, IP |
| Dependencies | Dependabot/Renovate for security updates |
| Headers | Helmet.js (X-Frame-Options, X-Content-Type-Options, etc.) |

### Data Privacy

- All data stored on the company's own server
- No telemetry or analytics sent externally
- AI requests only sent if user explicitly configures an API key
- Sensitive fields (passwords, API keys) never included in API responses
- Audit log for compliance (who did what, when)
- Data export capability (GDPR-ready)
- Data deletion capability (right to be forgotten)

### Secret Management

```
Environment Variables (in .env):
- DATABASE_URL: PostgreSQL connection string
- SESSION_SECRET: 64-char random string for session encryption
- ENCRYPTION_KEY: 32-byte key for API key encryption
- NEXTAUTH_SECRET: NextAuth.js secret

All secrets generated during first-run setup if not provided.
```

---

## 19. Performance & Scalability

### Frontend Performance

| Strategy | Implementation |
|----------|---------------|
| Code splitting | Next.js automatic route-based splitting |
| Lazy loading | Dynamic imports for heavy components (graph, editor) |
| Image optimization | Next.js Image component, WebP/AVIF |
| Bundle size | Tree-shaking, no heavy libraries |
| Caching | Service Worker cache for static assets |
| Virtualization | Virtual scrolling for long lists (react-virtual) |
| Debouncing | Search input, resize handlers |
| Optimistic UI | Mutations reflected immediately |

### Backend Performance

| Strategy | Implementation |
|----------|---------------|
| Connection pooling | Prisma connection pool (default: 10) |
| Query optimization | Indexed queries, eager loading where needed |
| Pagination | Cursor-based for large datasets |
| Caching | In-memory LRU cache for hot data (configurable) |
| Streaming | SSE for AI responses, streaming file downloads |
| Background jobs | Event-driven processing (notifications, indexing) |
| Database | WAL mode, connection limits, query timeout |

### Scalability Path

For small teams (< 50 users): Single Docker container with PostgreSQL is sufficient.

For larger deployments:
1. **Horizontal**: Run multiple Next.js instances behind a load balancer (sessions stored in DB, not memory)
2. **Database**: PostgreSQL read replicas for heavy read loads
3. **Cache layer**: Add Redis for session store and cache (optional)
4. **File storage**: Move to S3-compatible object storage
5. **Search**: Move to Elasticsearch/Meilisearch if PostgreSQL FTS becomes bottleneck

---

## 20. Testing Strategy

### Test Pyramid

```
          ┌──────────┐
         /   E2E      \          ~20 tests (critical paths)
        /  (Playwright) \
       ├────────────────┤
      /   Integration    \       ~100 tests (API routes + DB)
     /    (Vitest)        \
    ├──────────────────────┤
   /      Unit Tests        \    ~300 tests (services, utils, hooks)
  /       (Vitest)           \
 └────────────────────────────┘
```

### Unit Tests

- Service layer logic (business rules, validations)
- Utility functions
- React hooks (with testing-library)
- Conflict resolution logic
- Permission checks

### Integration Tests

- API routes (request → response, with real DB)
- Database operations (Prisma queries)
- Authentication flow
- File upload/download
- Search indexing and querying

### E2E Tests (Playwright)

- Login → Dashboard flow
- Create/edit/delete work item
- Drag card between columns
- Create and publish vault note
- AI conversation (mocked provider)
- Offline mode (network throttling)
- Multi-user concurrent editing

### Test Infrastructure

```json
{
  "scripts": {
    "test": "vitest",
    "test:unit": "vitest run --project unit",
    "test:integration": "vitest run --project integration",
    "test:e2e": "playwright test",
    "test:coverage": "vitest run --coverage",
    "test:ci": "vitest run && playwright test"
  }
}
```

---

## 21. Monitoring & Logging

### Structured Logging

```typescript
// Using Pino for structured JSON logs

logger.info({ userId, action: 'work_item.created', itemId }, 'Work item created');
logger.warn({ userId, attempts: 4 }, 'Login attempt approaching lockout');
logger.error({ err, requestId }, 'Unhandled error in API route');
```

### Log Levels

| Level | Usage |
|-------|-------|
| ERROR | Unhandled exceptions, failed operations |
| WARN | Degraded state, approaching limits |
| INFO | Business events (created, updated, deleted) |
| DEBUG | Detailed execution flow (dev only) |

### Health Check

```
GET /api/health

Response:
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 86400,
  "database": "connected",
  "diskSpace": { "total": "50GB", "available": "35GB" }
}
```

### Metrics (Optional, future)

- Request count and latency (per route)
- Active WebSocket connections
- Database query time
- Queue depth (offline sync, notifications)
- Error rate

Exposed via `/api/admin/metrics` for integration with Prometheus/Grafana if desired.

---

## 22. Backup & Restore

### Automated Backup

```typescript
// scripts/backup.ts
// Triggered via: cron job, admin API, or CLI

// 1. pg_dump to compressed SQL
// 2. Copy uploads directory
// 3. Create timestamped archive
// 4. Rotate old backups (keep last N)

// Output: /data/backups/mkindayzir-2025-01-15T10-30-00.tar.gz
```

### Backup Contents

```
mkindayzir-backup-{timestamp}.tar.gz
├── database.sql.gz          # Full PostgreSQL dump
├── uploads/                 # All uploaded files
├── config.json              # Non-secret configuration
└── manifest.json            # Backup metadata (version, timestamp, size)
```

### Restore Process

```bash
# CLI
pnpm run restore --file /path/to/backup.tar.gz

# Or via Admin UI
POST /api/admin/restore (multipart form with backup file)
```

### Backup Schedule (Docker)

```yaml
# docker-compose.yml includes a backup service
mkindayzir-backup:
  image: mkindayzir
  command: node scripts/backup.js
  environment:
    - BACKUP_SCHEDULE=0 2 * * *  # Daily at 2 AM
    - BACKUP_RETENTION=30        # Keep 30 days
  volumes:
    - backup-data:/data/backups
```

---

## 23. Migration Strategy

### Database Migrations

Prisma handles schema migrations:

```bash
# Development: Generate migration after schema change
pnpm prisma migrate dev --name add_due_date_to_cards

# Production: Apply pending migrations
pnpm prisma migrate deploy
```

### Application Updates

```
1. Pull new Docker image
2. docker compose up -d (automatic migration on start)
3. Next.js rebuilds if needed
4. Zero-downtime with rolling updates (if load-balanced)
```

### Data Migration from Legacy (OpsDesk → Mkindayzir)

A one-time migration script will:
1. Read the existing SQLite database
2. Transform data to the new PostgreSQL schema
3. Rename all entity references
4. Migrate uploaded files
5. Generate a migration report

This script is **run once** during the transition and can be discarded afterward.

---

## 24. Deployment

### Option 1: Docker Compose (Recommended for Self-Hosting)

```yaml
# docker-compose.yml
version: '3.8'

services:
  mkindayzir:
    image: mkindayzir/mkindayzir:latest
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://mkindayzir:password@db:5432/mkindayzir
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

  # Optional: Reverse proxy with SSL
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./certs:/etc/nginx/certs
    depends_on:
      - mkindayzir
    restart: unless-stopped

volumes:
  pg-data:
  upload-data:
  backup-data:
```

### Option 2: Bare Metal / VM

```bash
# Prerequisites: Node.js 20+, PostgreSQL 16+, pnpm

git clone https://github.com/your-org/mkindayzir.git
cd mkindayzir
cp .env.example .env  # Edit with your values
pnpm install
pnpm prisma migrate deploy
pnpm build
pnpm start  # Runs on port 3000
```

### Option 3: Single Binary (Future)

Using `pkg` or Bun's compile feature, package the entire Node.js app into a single executable for distribution without requiring Node.js installation.

### First-Run Setup

On first boot, if no admin user exists:
1. Redirect to `/setup`
2. Prompt for: Admin email, password, organization name
3. Generate encryption keys
4. Create initial database seed (default workflows, sample project)
5. Redirect to login

---

## 25. Configuration Management

### Environment Variables

```env
# .env.example - Complete configuration reference

# ─── Core ───────────────────────────────────────
NODE_ENV=production
PORT=3000
BASE_URL=http://localhost:3000

# ─── Database ───────────────────────────────────
DATABASE_URL=postgresql://mkindayzir:password@localhost:5432/mkindayzir

# ─── Security ──────────────────────────────────
SESSION_SECRET=<64-char-random-string>
ENCRYPTION_KEY=<32-byte-hex-string>
NEXTAUTH_SECRET=<random-string>
SESSION_MAX_AGE=3600          # seconds (1 hour)
BCRYPT_ROUNDS=12

# ─── File Storage ──────────────────────────────
UPLOAD_DIR=/app/data/uploads
MAX_UPLOAD_SIZE=52428800      # 50MB in bytes
BACKUP_DIR=/app/data/backups

# ─── Rate Limiting ─────────────────────────────
RATE_LIMIT_GENERAL=100        # requests per minute
RATE_LIMIT_AI=20              # AI requests per minute
RATE_LIMIT_AUTH=5             # auth attempts per minute

# ─── AI (Optional) ─────────────────────────────
# Note: Users configure their own API keys in the UI.
# These are fallback/default values only.
DEFAULT_AI_PROVIDER=openrouter
DEFAULT_AI_MODEL=anthropic/claude-3.5-sonnet

# ─── Email (Optional) ──────────────────────────
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=noreply@mkindayzir.local

# ─── Logging ───────────────────────────────────
LOG_LEVEL=info                # error, warn, info, debug
LOG_FORMAT=json               # json, pretty

# ─── Features ──────────────────────────────────
REGISTRATION_ENABLED=false    # Allow self-registration
GUIDE_CENTER_ENABLED=true
MAX_PROJECTS=0                # 0 = unlimited
MAX_USERS=0                   # 0 = unlimited
```

### Runtime Configuration (Database)

System settings that admins can change without restart:
- Organization name
- Default language
- Default timezone
- Feature toggles
- Branding (logo URL, accent color)
- Allowed file types
- Backup retention policy

Stored in `system_config` table, cached in memory with invalidation on change.

---

## 26. CI/CD Pipeline

### GitHub Actions

```yaml
# .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm lint
      - run: pnpm type-check

  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: mkindayzir_test
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm prisma migrate deploy
      - run: pnpm test:ci

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm build

  docker:
    needs: [lint, test, build]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: docker/build-push-action@v5
        with:
          push: true
          tags: mkindayzir/mkindayzir:latest
```

### Release Process

1. Version bump in `package.json`
2. Generate changelog from conventional commits
3. Tag release (`v1.0.0`)
4. Build and push Docker image with version tag
5. Create GitHub release with changelog

---

## 27. Documentation

### User Documentation

| Document | Content |
|----------|---------|
| README.md | Quick start, what is Mkindayzir, screenshots |
| docs/DEPLOYMENT.md | All deployment options with step-by-step guides |
| docs/CONFIGURATION.md | Every environment variable explained |
| docs/USER_GUIDE.md | End-user documentation for all features |
| docs/ADMIN_GUIDE.md | Administration, backup, restore, updates |

### Developer Documentation

| Document | Content |
|----------|---------|
| docs/ARCHITECTURE.md | System design, patterns, decisions |
| docs/API.md | Complete API reference (auto-generated from types) |
| docs/DEVELOPMENT.md | Local dev setup, conventions, workflow |
| docs/CONTRIBUTING.md | How to contribute, code standards |
| docs/TESTING.md | Test strategy, how to write tests |

### In-App Documentation

The Guide Center serves as the built-in help system, pre-populated with:
- Getting Started
- Creating Your First Project
- Working with Boards
- Knowledge Vault Basics
- Using the AI Assistant
- Keyboard Shortcuts
- Admin Configuration

---

## 28. Extensibility & Plugin Architecture

### Current Phase: Hooks & Events

The internal event bus provides extension points without a full plugin system:

```typescript
// Future plugins can subscribe to events:
events.on('work_item.created', async (data) => {
  // Custom logic: Slack notification, webhook, etc.
});
```

### Webhook Support (Phase 2)

Admin-configurable webhooks that fire on events:
```
POST https://internal-server.company.com/webhook/mkindayzir
{
  "event": "work_item.created",
  "data": { ... },
  "timestamp": "2025-01-15T10:30:00Z"
}
```

### API-First Design

All functionality is accessible via the REST API, enabling:
- Custom integrations by company developers
- CLI tools
- Mobile apps (future)
- Third-party automation (n8n, Zapier self-hosted, etc.)

### Future Plugin System (Planned)

```typescript
// Plugin interface (not implemented now, architecture supports it)
interface MkindayzirPlugin {
  name: string;
  version: string;
  initialize(app: MkindayzirApp): void;
  routes?: RouteDefinition[];
  events?: EventSubscription[];
  ui?: UIExtension[];
}
```

---

## 29. Future AI Agent Readiness

### Architecture Preparations (Current Phase)

1. **Service Layer Abstraction**: All business logic in service classes that can be called programmatically (not just via HTTP).

2. **Typed Tool Definitions**: AI tools already defined with schemas that future agents can discover and call:
   ```typescript
   // src/lib/ai/tool-registry.ts
   export const toolRegistry: ToolDefinition[] = [...]
   ```

3. **Event Bus**: The agent can subscribe to events to proactively assist users.

4. **Conversation Context**: Message history and tool results are stored, enabling continuity.

5. **Permission Scoping**: Tool calls execute within the user's permission boundary.

### Future AI Agent Architecture (NOT implemented now)

```
┌─────────────────────────────────────────┐
│  Mkindayzir AI Agent                    │
│  ┌───────────────────────────────────┐  │
│  │  Agent Runtime                    │  │
│  │  - Planning & reasoning           │  │
│  │  - Tool selection & execution     │  │
│  │  - Multi-step task orchestration  │  │
│  │  - Memory (short & long term)     │  │
│  └─────────────────┬─────────────────┘  │
│                    │                     │
│  ┌─────────────────▼─────────────────┐  │
│  │  Tool Layer (calls services)      │  │
│  │  - CRUD on all entities           │  │
│  │  - Search and analysis            │  │
│  │  - Report generation              │  │
│  │  - Automation triggers            │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

The service layer is the key enabler — the agent calls the same `WorkItemService.create()` that the API routes call.

---

## 30. Future MCP Readiness

### What MCP Enables

Model Context Protocol allows external AI systems to:
- **Read** data from Mkindayzir (projects, items, notes)
- **Write** data to Mkindayzir (create items, update statuses)
- **Search** across all entities
- **Subscribe** to events (real-time awareness)

### Architecture Preparations (Current Phase)

1. **RESTful API with consistent patterns**: MCP tools will wrap API calls.

2. **OpenAPI/JSON Schema for all endpoints**: Enables automatic tool generation.

3. **Scoped API tokens** (future): Service accounts with limited permissions for AI agents.

4. **Idempotent operations**: All write operations can be safely retried.

5. **Structured responses**: Consistent JSON shapes that AI models can parse reliably.

### Future MCP Server Structure (NOT implemented now)

```
mkindayzir-mcp/
├── src/
│   ├── server.ts              # MCP server entry
│   ├── tools/
│   │   ├── work-items.ts      # CRUD tools for work items
│   │   ├── boards.ts          # Board and card tools
│   │   ├── vault.ts           # Knowledge vault tools
│   │   ├── search.ts          # Omnisearch tool
│   │   └── reports.ts         # Reporting tools
│   ├── resources/
│   │   ├── projects.ts        # Project resources
│   │   ├── iterations.ts      # Iteration resources
│   │   └── notes.ts           # Vault note resources
│   └── prompts/
│       ├── summarize.ts       # Prompt templates
│       └── analyze.ts
├── package.json
└── README.md
```

The MCP server will be a **separate package** that connects to Mkindayzir's API. Because the API is comprehensive and consistent, building MCP tools becomes a straightforward wrapper exercise.

---

## 31. Implementation Phases

### Phase 1: Foundation (Weeks 1-3)

**Goal**: Project scaffolding, database, auth, and core infrastructure.

| Task | Details |
|------|---------|
| Project setup | Next.js 14, TypeScript, Tailwind, pnpm, ESLint, Prettier |
| Database | PostgreSQL schema (Prisma), migrations, seed data |
| Authentication | Login, logout, session management, password hashing |
| Authorization | RBAC middleware, permission checks |
| API infrastructure | Error handling, validation (Zod), rate limiting, logging |
| Base UI | Layout shell, sidebar, header, theme system, design tokens |
| Docker setup | Dockerfile, docker-compose, dev + prod configs |
| Health check | `/api/health` endpoint |
| First-run setup | Admin creation wizard |
| Environment config | .env management, configuration module |

**Deliverable**: Running application with login, empty dashboard, Docker deployment.

---

### Phase 2: Project Tracker (Weeks 4-6)

**Goal**: Full project management with configurable workflows.

| Task | Details |
|------|---------|
| Projects CRUD | Create, list, update, archive projects |
| Work Items CRUD | Create, list, filter, update, delete |
| Workflows | Configurable statuses and transitions per project |
| Iterations | Create, manage, assign items to iterations |
| Initiatives | Create, track progress |
| Board view | Work items displayed as cards in status columns |
| List view | Sortable, filterable table |
| Backlog view | Unscheduled items |
| Detail view | Full work item page (description, comments, activity) |
| Sub-tasks | Parent/child work items |
| Labels | Create, assign, filter by labels |
| Links | Link work items (blocks, relates, duplicates) |
| Bulk operations | Multi-select and batch update |
| Auto-numbering | Project-key + sequential number (MKZ-1, MKZ-2) |

**Deliverable**: Complete project tracker with board, list, and backlog views.

---

### Phase 3: Visual Task Boards (Weeks 7-8)

**Goal**: Flexible visual boards independent of projects.

| Task | Details |
|------|---------|
| Spaces CRUD | Create, manage, members |
| Boards CRUD | Create, configure, delete |
| Columns | Create, reorder, WIP limits |
| Cards CRUD | Create, edit, move, archive |
| Drag and drop | Cards between columns, reorder |
| Card details | Members, labels, checklists, due dates, attachments |
| Checklists | Create, check items, progress indicator |
| Board labels | Create, color, assign to cards |
| Card members | Assign users to cards |
| Filtering | By member, label, due date |

**Deliverable**: Fully functional visual board system.

---

### Phase 4: Knowledge Vault (Weeks 9-11)

**Goal**: Interconnected knowledge base with graph visualization.

| Task | Details |
|------|---------|
| Folder tree | Hierarchical folders, CRUD |
| Notes CRUD | Create, edit, delete, Markdown editor |
| Rich editor | Tiptap or similar, toolbar, formatting |
| Internal links | `[[slug]]` parsing, resolution, creation |
| Backlinks | Show which notes link to the current note |
| Graph view | D3 force-directed visualization |
| Tags | Create, assign, filter |
| Version history | Save versions, diff view |
| Publishing | Draft → Published → Archived workflow |
| Search | Full-text search within vault |
| Collections | Curated groups of notes |
| Feedback | Helpful/not helpful per note |

**Deliverable**: Complete knowledge vault with graph visualization.

---

### Phase 5: AI Assistant (Weeks 12-13)

**Goal**: AI chat with streaming, tool calling, and multi-provider support.

| Task | Details |
|------|---------|
| Provider abstraction | OpenRouter, OpenAI, Anthropic, custom URL |
| API key management | Encrypted storage, UI for configuration |
| Model selection | List available models per provider |
| Conversations | Create, list, delete conversations |
| Chat interface | Message input, streaming display |
| SSE streaming | Server-side streaming to client |
| Tool calling | Define tools, execute, return results |
| Tools: search | Search work items, vault notes |
| Tools: CRUD | Create/update work items via AI |
| Tools: summarize | Summarize iterations, projects |
| Token tracking | Count and display token usage |
| Rate limiting | Per-user AI request limits |
| Offline handling | Clear messaging when unavailable |
| Markdown rendering | Render AI responses with formatting |

**Deliverable**: Working AI assistant with tool-calling capabilities.

---

### Phase 6: Offline & PWA (Weeks 14-15)

**Goal**: Full offline support with sync.

| Task | Details |
|------|---------|
| Service Worker | Workbox setup, caching strategies |
| PWA manifest | Icons, splash screens, install prompt |
| IndexedDB schema | Dexie.js, mirror key entities |
| Cache population | Cache data as user navigates |
| Offline detection | Connection status monitoring |
| Mutation queue | Queue writes when offline |
| Sync engine | Process queue on reconnection |
| Conflict resolution | Last-write-wins with notification |
| Offline indicators | UI badges, banners, sync status |
| Background sync | Retry failed mutations |

**Deliverable**: Application works offline for viewing and queues mutations.

---

### Phase 7: Real-Time & Collaboration (Week 16)

**Goal**: Live updates across users.

| Task | Details |
|------|---------|
| WebSocket server | Socket.io integration with Next.js |
| Authentication | Verify session on WebSocket connect |
| Room management | Join/leave based on current view |
| Broadcasting | Emit changes to relevant rooms |
| Optimistic updates | Merge remote changes into local state |
| Presence | Show who's viewing what |
| Conflict UI | Handle concurrent edits gracefully |

**Deliverable**: Multi-user real-time collaboration.

---

### Phase 8: Reports, Search, & Guide Center (Weeks 17-18)

**Goal**: Analytics, omnisearch, and built-in help.

| Task | Details |
|------|---------|
| Dashboard summary | Metrics cards, charts |
| Workload report | Items per assignee |
| Velocity report | Points completed per iteration |
| Trend charts | Created vs resolved over time |
| CSV export | Export filtered data |
| Omnisearch | Cross-entity full-text search |
| Search UI | Command palette (Cmd+K), results page |
| Typeahead | Suggestions as user types |
| Guide Center | CRUD for guides, categorization |
| Default guides | Pre-written help content |
| Reading progress | Track which guides user has read |

**Deliverable**: Complete reporting, search, and help system.

---

### Phase 9: Admin, Security, & Polish (Weeks 19-20)

**Goal**: Administration panel, security hardening, and UI polish.

| Task | Details |
|------|---------|
| User management | CRUD, role assignment, status |
| Team management | Create teams, assign members |
| Audit log | Viewable in admin panel, filterable |
| System settings | Runtime configuration UI |
| Security hardening | CSP headers, rate limit tuning, penetration testing |
| Backup/Restore UI | Admin-triggered backup, restore |
| Email notifications | Optional SMTP configuration |
| Accessibility audit | WCAG 2.1 AA compliance |
| Performance audit | Lighthouse, Core Web Vitals |
| Responsive design | Mobile and tablet layouts |
| Keyboard shortcuts | Global shortcuts, documented in guide |
| Error boundaries | Graceful error handling throughout |
| Loading states | Skeletons, spinners, progress |
| Empty states | Helpful empty state messages |
| Onboarding | First-use tooltips and walkthrough |

**Deliverable**: Production-ready, polished application.

---

### Phase 10: Testing, Documentation, & Release (Weeks 21-22)

**Goal**: Comprehensive testing, documentation, and release preparation.

| Task | Details |
|------|---------|
| Unit tests | All services, utilities, hooks |
| Integration tests | All API routes |
| E2E tests | Critical user paths |
| Load testing | Simulate concurrent users |
| Documentation | All docs listed in section 27 |
| Changelog | Complete feature list |
| Release pipeline | CI/CD, Docker build, GitHub release |
| Migration script | OpsDesk → Mkindayzir data migration |
| Final branding check | Remove ALL old references |
| Security review | Final security audit |

**Deliverable**: Version 1.0.0 release.

---

## 32. Module Feature Parity

### Comparison with source inspiration (functionality level to match)

| Feature Area | Target Capability Level |
|---|---|
| **Project Tracking** | Multiple projects, configurable workflows, iterations, initiatives, sub-tasks, custom fields, bulk operations, multiple views (board, list, backlog), work item links, story points, due dates, labels, filtering, search |
| **Visual Boards** | Multiple spaces/boards, drag-and-drop, WIP limits, checklists, card members, labels, due dates, cover images, filtering, archiving |
| **Knowledge Vault** | Hierarchical folders, Markdown editing with toolbar, internal links with bidirectional resolution, graph visualization, version history, tags, publishing workflow, collections, full-text search |
| **AI Assistant** | Multi-provider support, streaming responses, tool calling (search, create, update entities), conversation history, model selection, token tracking |
| **Administration** | User/team management, RBAC, audit log, system settings, backup/restore |
| **Search** | Cross-entity full-text search, fuzzy matching, typeahead, command palette |
| **Reports** | Dashboard summary, workload, velocity, trends, CSV export |
| **Offline** | View cached data, queue mutations, sync on reconnection |
| **Real-Time** | Live updates, presence indicators |

---

## 33. Naming Conventions

### Code Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Files (components) | PascalCase | `WorkItemCard.tsx` |
| Files (utils/hooks) | camelCase | `useWorkItems.ts` |
| Files (routes) | kebab-case | `work-items/route.ts` |
| Database tables | snake_case | `work_items` |
| API endpoints | kebab-case | `/api/work-items` |
| TypeScript types | PascalCase | `WorkItem`, `CreateWorkItemInput` |
| Constants | UPPER_SNAKE_CASE | `MAX_UPLOAD_SIZE` |
| Environment vars | UPPER_SNAKE_CASE | `DATABASE_URL` |
| CSS classes | Tailwind utilities | `bg-primary text-sm` |
| Events | dot.notation | `work_item.created` |

### Branding in Code

```typescript
// Application name constant (single source of truth)
export const APP_NAME = 'Mkindayzir';
export const APP_SLUG = 'mkindayzir';
export const APP_DESCRIPTION = 'Your Operations, Your Server, Your Control.';
```

All UI, page titles, error messages, logs, and documentation reference these constants.

### Package Identity

```json
{
  "name": "mkindayzir",
  "description": "Self-hosted Work OS - Project tracking, visual boards, knowledge vault, and AI assistant",
  "author": "Mkindayzir",
  "license": "PROPRIETARY"
}
```

### Docker Image

```
mkindayzir/mkindayzir:latest
mkindayzir/mkindayzir:1.0.0
```

---

## Appendix A: Key Technical Decisions Log

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| Framework | Next.js 14 (App Router) | Full-stack, TypeScript, SSR, API routes, massive ecosystem |
| Database | PostgreSQL 16 | ACID, FTS, JSON, battle-tested, self-hostable |
| ORM | Prisma | Type-safe, migrations, works with PostgreSQL |
| Auth | Custom (bcrypt + sessions in DB) | Full control, no external dependency |
| Offline | Service Worker + IndexedDB | Standard web APIs, no third-party sync service |
| Real-time | Socket.io | Reliable WebSocket with fallback, room-based |
| Styling | Tailwind CSS | Utility-first, no CDN needed, treeshakes unused |
| State | TanStack Query + Zustand | Server state + UI state separation |
| Testing | Vitest + Playwright | Fast unit tests + reliable E2E |
| Deployment | Docker Compose | Single-command deployment for self-hosting |
| Search | PostgreSQL FTS + pg_trgm | No external service, good enough for most deployments |
| AI streaming | Server-Sent Events | Simpler than WebSocket for unidirectional streaming |
| File storage | Local filesystem | Self-contained, no external service |
| Logging | Pino | Fast structured JSON logging |

---

## Appendix B: Non-Goals (Explicitly Out of Scope)

- Cloud-hosted SaaS version
- Mobile native apps (React Native)
- Multi-tenant architecture
- Horizontal scaling (single-instance is sufficient for v1)
- Plugin marketplace
- Third-party OAuth providers (Google, GitHub login)
- Video/audio chat
- Calendar/scheduling module
- Email inbox integration
- Time tracking module
- Billing/invoicing

These may be considered for future versions but are NOT part of this implementation plan.

---

## Appendix C: Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| PostgreSQL too heavy for small deployments | Provide SQLite mode for single-user/small team (Prisma supports both) |
| Offline sync conflicts | Keep conflict resolution simple (last-write-wins + user notification) |
| AI provider changes API | Abstract behind provider interface, support multiple providers |
| Next.js breaking changes | Pin major version, update only when stable |
| Large file uploads consuming RAM | Stream uploads to disk, never buffer entirely in memory |
| Search performance at scale | PostgreSQL FTS handles millions of rows; offer Meilisearch plugin for larger deployments |
| Docker not available | Provide bare-metal installation guide as alternative |

---

*End of Mkindayzir Master Implementation Plan*
*Version: 1.0.0*
*Date: 2025*
