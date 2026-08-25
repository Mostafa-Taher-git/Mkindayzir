# Mkindayzir

**Your Operations, Your Server, Your Control.**

Mkindayzir is a self-hosted, local-first Work OS that unifies project management, visual task boards, knowledge management, and AI assistance into a single independent application.

## Tech Stack

- **Backend**: [FastAPI](https://fastapi.tiangolo.com/) (Python 3.11+) — async REST API, SQLAlchemy 2.0 (async), Alembic migrations, console CLI (`mkindayzir`, built with Click).
- **Database**: PostgreSQL 16+ (asyncpg) — the only supported engine, in every mode.
- **Frontend**: [Vite](https://vitejs.dev/) + React (SPA at the project root) — React Router, TanStack Query (React Query), Zustand, Tailwind CSS.
- **Static serving**: In production the FastAPI process also serves the built SPA (`dist/`) and a SPA catch-all, so a single process handles API + UI on port `3000`.
- **Auth & security**: Session cookie (`mkindayzir_session`), AES-256-GCM encryption for sensitive fields (API keys, etc.).

## Quick Start

### Personal (no Docker)

```bash
pip install mkindayzir
mkindayzir start            # serves API + built frontend on http://localhost:3000
```

Open **http://localhost:3000**. On first run, the setup wizard creates the admin account.

### Docker (single container)

```bash
docker compose -f docker/docker-compose.yml up -d
bash docker/init.sh         # runs migrations + creates the admin user
```

The app is then available on **http://localhost:3000** (put it behind your reverse proxy / TLS terminator).

> Local development (Vite dev server + API): see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Features

- **Projects & Work OS**: projects, work items, iterations, initiatives, workflows, labels, spaces.
- **Visual boards**: drag-and-drop boards, columns, cards, checklists, comments, labels.
- **Knowledge vault**: nested folders and notes with rich-text editing.
- **AI assistance**: optional AI provider integration for in-app help.
- **Team collaboration**: multi-user Team mode with PostgreSQL and role-based access.
- **Local-first & self-hosted**: runs on your own hardware, backed by your own PostgreSQL.
- **Legacy import**: coming from an old SQLite install? `mkindayzir migrate-db` imports your data into PostgreSQL.
- **Ticketing**: support ticket management with statuses, priorities, categories, SLA tracking, internal notes, and customer replies.
- **Roadmap**: product roadmap view showing planned features and release stages.

## Documentation

- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — local dev (uvicorn + Vite), backend & frontend setup.
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — personal / team deployment via `pip`, `easy-install.py`, or Docker.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system design, routing, services, persistence, security.
- [docs/ARCHITECTURE_FULL.md](docs/ARCHITECTURE_FULL.md) — exhaustive module-by-module map (generated audit).
- [docs/CONFIGURATION.md](docs/CONFIGURATION.md) — environment variables reference.
- [docs/TEST_ACCOUNTS.md](docs/TEST_ACCOUNTS.md) — ready-made demo accounts for testers (`mkindayzir seed-demo`).
- [docs/RUNNING.md](docs/RUNNING.md) — quick-run cheat-sheet.
- [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) — how to contribute.

## License

ISC
