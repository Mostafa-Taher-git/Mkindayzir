# OpsDesk Enterprise

[![Python](https://img.shields.io/badge/Python-3.11%2B-blue)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Flask-3.x-green)](https://flask.palletsprojects.com/)
[![Tests](https://img.shields.io/badge/tests-388%20passing-brightgreen)](#testing)
[![License](https://img.shields.io/badge/license-Proprietary-red)](#license)

**OpsDesk Enterprise** is an all-in-one internal Work OS that unifies issue tracking, visual project management, a linked knowledge base, an AI copilot with tool-calling, and an interactive help center — in a single Flask + vanilla-JS SPA with zero build step.

---

## What it does

| Module | What you get |
|---|---|
| **Jira Enterprise Suite** | Projects, sprints, goals/OKRs, configurable workflows, SLA tracking, bulk operations, followers, CSAT |
| **Trello Workspaces** | Visual Kanban boards, drag-and-drop cards, checklists, labels, members, calendar/table views, board activity |
| **Obsidian Knowledge Base** | Markdown vault with `[[wikilinks]]`, bidirectional backlinks, auto-extracted tags, D3 force-directed graph, version history with line-level diff |
| **AI Copilot** | Streaming chat, per-user OpenRouter keys, dynamic model catalog, tool calling with human approval, token/cost tracking |
| **Help Center** | Tabbed guides, onboarding tracker with milestones, interactive product tours, keyboard shortcuts reference |

Every module shares a single auth layer, RBAC, CSRF protection, polymorphic comments/attachments/entity-links, and a unified notification system.

---

## Tech stack

| Layer | Choice |
|---|---|
| **Backend** | Flask (Python), SQLite + WAL, Blueprint modules |
| **Frontend** | Vanilla ES6 SPA, no bundler, no webpack/vite |
| **Graph** | D3-force via CDN (canvas renderer) |
| **AI** | OpenRouter (user-supplied key, fail-closed) |
| **Auth** | Session cookies, HTTPOnly, SameSite=Lax, per-session CSRF tokens |
| **Tests** | pytest (backend), node `--check` (frontend syntax) |

---

## Architecture

```
app/
  __init__.py        App factory + SPA serving
  config.py          Runtime constants + env vars
  db.py              SQLite schema + seed + migration
  helpers.py         Auth decorators, RBAC, CSRF, audit
  routes_jira.py     Jira: issues, projects, sprints, goals, workflows
  routes_trello.py   Trello: workspaces, boards, lists, cards, checklists
  routes_kb_vault.py KB: folders, notes, wikilinks, backlinks, graph, tags
  routes_ai.py       AI legacy endpoints (draft-only suggest-reply/summarize)
  routes_ai_agent.py AI chat: conversations, SSE streaming, tool loop
  routes_help.py     Help Center: guides, milestones, tours
  routes_search.py   Omnisearch + cross-entity links
  routes_notif.py    Notifications (in-app + best-effort SMTP)
  routes_admin.py    Admin: users, teams, categories, audit log
  ai/
    client.py        OpenRouter transport + prompt-injection hardening
    tools.py         AI tool registry (RBAC-aware handlers)

static/
  css/               Token-based stylesheets (dark-mode ready)
  js/
    api.js           Central API client
    app.js           Router + shell
    views/           Feature modules (jira, trello, kb, ai, help, search)
    graph.js         D3-force canvas renderer

tests/               388 tests across 11 suites
templates/
  index.html          SPA shell
run.py                Entry point
```

---

## Getting started

### Prerequisites

- Python 3.11+
- SQLite 3
- Node.js (optional, only for `node --check` syntax validation)

### Install

```bash
git clone https://github.com/Mostafa-Taher-git/OpsDesk.git
cd OpsDesk
python3 -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
```

### Configure

Edit `.env` and set at least:

```bash
OPERADESK_SECRET=<32+ byte random hex>   # python -c "import secrets;print(secrets.token_hex(32))"
OPERADESK_OPENROUTER_KEY=<your key>      # optional — AI is fail-closed without it
```

See `.env.example` for all available variables (SMTP, session cookie security, idle timeout, AI model defaults, etc.).

### Run

```bash
python run.py
```

Open **http://127.0.0.1:5000**. The database, schema migration, and demo seed data are created automatically on first run.

### Demo accounts

| Email | Role | Password |
|---|---|---|
| admin@opsdesk.local | Admin | `password` |
| manager@opsdesk.local | Manager | `password` |
| agent@opsdesk.local | Agent | `password` |
| hragent@opsdesk.local | Agent | `password` |
| sam@opsdesk.local | Requester | `password` |

---

## Testing

```bash
# Backend (pytest)
venv/bin/python -m pytest

# Frontend syntax check (no server needed)
node --check static/js/api.js static/js/app.js static/js/views/*.js static/js/graph.js
```

**Current suite:** 388 tests across 11 files (`test_jira`, `test_trello`, `test_kb`, `test_ai`, `test_ai_tools`, `test_help`, `test_shared`, `test_integration`, `test_performance`, `test_security`, `test_migration`).

---

## Security highlights

- **Auth:** session cookies (`HTTPOnly`, `SameSite=Lax`, `Secure` in production)
- **CSRF:** per-session token on every mutating request
- **RBAC:** role-aware data scoping (requester / agent / manager / admin)
- **AI:** key-gated, fail-closed, prompt-injection hardened, tool calls inherit user RBAC
- **SQL:** parameterized queries only
- **Audit:** admin actions, permission changes, and deletions logged
- **Rate limit:** AI chat limited to 20 requests/minute per user

---

## Key UX shortcuts

| Keys | Action |
|---|---|
| `C` | Quick create (issue or card) |
| `Ctrl+J` / `Cmd+J` | Toggle AI Copilot drawer |
| `Ctrl+K` / `Cmd+K` | Open omnisearch palette |
| `?` | Show keyboard shortcuts |
| `Esc` | Close modal / drawer / palette |
| `G` then `D` | Go to Dashboard |
| `G` then `B` | Go to Backlog |
| `G` then `K` | Go to KB Vault |

---

## Implementation phases

| Phase | Area | Status |
|---|---|---|
| 0 | Foundation: auth, schema, RBAC, CSRF, seed data | Done |
| 1 | Notifications, reports, CSAT, settings, mobile nav | Done |
| 2A | Jira Enterprise: projects, sprints, goals, workflows | Done |
| 2B | Trello Extended: calendar, table, activity, settings | Done |
| 3A | Obsidian KB Core: vault, editor, wikilinks, backlinks | Done |
| 3B | KB Graph View: D3 force graph, tags, diff viewer | Done |
| 4A | AI Chat Core: conversations, SSE streaming, usage | Done |
| 4B | AI Agentic Tools: tool registry, confirmation cards, RBAC | Done |
| 5 | Help Center: guides, onboarding tracker, tour engine | Done |
| 6 | Integration & Polish: omnisearch, entity links, notifications, print, responsive | Done |
| 7 | Testing & Verification: integration, performance, security review, cleanup | Done |

---

## Project layout

```
app/                        Flask backend
  routes_*.py               Blueprint modules (one per domain)
  ai/                       AI client + tool registry
  helpers.py                Auth, RBAC, CSRF, audit
  db.py                     Schema, seed, migration
static/
  css/                      Design-token stylesheets
  js/
    api.js                  API client
    app.js                  Router + shell
    views/                  Feature modules (jira, trello, kb, ai, help, search)
    graph.js                D3-force canvas renderer
tests/                      pytest suites (388 tests)
templates/
  index.html                SPA shell
run.py                      Entry point
```

---

## Contributing

1. Fork and clone
2. `python3 -m venv venv && source venv/bin/activate`
3. `pip install -r requirements.txt`
4. Make changes (Python thin + commented, ES6 frontend, token-based CSS)
5. `venv/bin/python -m pytest` — must stay green
6. `node --check static/js/**/*.js` — must stay clean
7. Open a PR

---

## License

Proprietary — internal use only. All rights reserved.

---
