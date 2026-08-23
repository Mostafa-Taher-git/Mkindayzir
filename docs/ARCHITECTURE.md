# Architecture

## High-Level Overview

Mkindayzir is a monolithic full-stack application built on Next.js 14 with a custom Node.js server for WebSocket support.

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
```

## Key Architecture Decisions

1. **Monolithic Full-Stack**: One process handles everything. Simple to deploy, debug, and maintain.
2. **Service Layer Pattern**: All business logic in `src/services/`. API routes are thin wrappers.
3. **Event Bus**: Internal pub/sub for decoupled side effects.
4. **Repository Pattern**: Data access abstracted through repository classes wrapping Prisma.
5. **Adaptive Features**: WebSocket, audit logging, and team features conditionally enabled based on deployment mode.
