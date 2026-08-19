# 00 — Test Data, Seed Users & Permissions Matrix

> Read this file before executing any role suite. All cases assume a **freshly
> seeded** database (see "Reset the test data" below).

## 1. Seed users (created automatically by `app/db.py::_seed`)

| Email | Name | Role | Team | Notes |
|---|---|---|---|---|
| `admin@opsdesk.local` | Admin User | `admin` | — | Full control, no team scoping |
| `manager@opsdesk.local` | Ops Manager | `manager` | — | All tickets, reports, planning |
| `agent@opsdesk.local` | IT Agent | `agent` | IT (id 1) | IT-scoped queue, KB author |
| `hragent@opsdesk.local` | HR Agent | `agent` | HR (id 2) | HR-scoped queue, KB author |
| `sam@opsdesk.local` | Sam Requester | `requester` | IT | Own tickets only |

**Password for every seed account: `password`** (hashed with pbkdf2 at seed).

## 2. Seeded reference data

| Type | Values |
|---|---|
| Teams | IT, HR, Ops, Finance |
| Categories (active) | Access & Accounts (→IT), Hardware (→IT), Software (→IT), HR Request (→HR), Finance (→Finance), Other (→Ops) |
| SLA policies | Low (24/168h), Standard (8/72h), High (2/24h), Urgent (1/8h), HR-normal (4/48h), Finance-normal (4/48h) |
| Jira project | `OPS` — Operations Desk (key `OPS`, next_seq starts at 1) |
| Workflow | Default scheme seeded into `jira_workflow_transitions` (project_id NULL), roles `["agent","manager","admin"]` |
| Statuses | `new → assigned → in_progress → resolved → closed`, plus `blocked`, `reopened` |

## 3. Ticket lifecycle (single source of truth: `app/lifecycle.py`)

| From | To | Reason required? |
|---|---|---|
| new | assigned | no |
| new | closed | no (manager/admin spam/dupe close) |
| assigned | in_progress | no |
| assigned | blocked | **yes** (`blocked_reason`/`note`) |
| assigned | closed | no |
| in_progress | blocked | **yes** |
| in_progress | resolved | no |
| in_progress | assigned | no (reassign) |
| blocked | in_progress | no |
| blocked | assigned | no |
| resolved | closed | no |
| resolved | reopened | no (requester within 72 h; staff anytime) |
| closed | reopened | no (requester within 72 h; staff anytime) |
| reopened | assigned | no |
| reopened | in_progress | no |

Reopen side effects: `reopen_count +1`; requester reopen via `/status` ends in
`assigned`; via `/reopen` stays `reopened`.

## 4. Permissions matrix (what each role may do)

Legend: ✅ full access · 👁 read-only · ⛔ denied (403) · 🙈 hidden (404 for
invisible resources)

| Capability | admin | manager | agent | requester |
|---|---|---|---|---|
| View any ticket | ✅ | ✅ | own team + unassigned | own only |
| Create ticket | ✅ | ✅ | ✅ (may pick team/requester/project) | ✅ (own only, team forced) |
| Edit ticket | ✅ | ✅ | ✅ | own ticket **only while `new`** |
| Assign / claim | ✅ | ✅ | ✅ | ⛔ |
| Status transitions | ✅ | ✅ | ✅ (staff) | ⛔ (unless admin grants via workflow override) |
| Reopen | ✅ anytime | ✅ anytime | ✅ anytime | own, within 72 h |
| Priority change | ✅ | ✅ | ✅ | ⛔ |
| Internal (staff) comments | ✅ | ✅ | ✅ | ⛔ (403) |
| Attachments (upload/view) | ✅ | ✅ | ✅ | own tickets |
| Bulk actions (≤200) | ✅ | ✅ | ✅ | ⛔ |
| CSAT rating | ⛔ (not requester) | ⛔ | ⛔ | own resolved/closed, once |
| Dashboard `/api/dashboard` | ✅ | ✅ | ✅ (own stats) | ⛔ (403) |
| Reports `/api/reports/*` | ✅ | ✅ | ⛔ (403) | ⛔ (403) |
| CSV export | ✅ | ✅ | ⛔ | ⛔ |
| KB read | ✅ | ✅ | ✅ | published only (drafts → 404) |
| KB write (notes/folders/collections) | ✅ | ✅ | ✅ (own notes only) | ⛔ |
| KB publish | ✅ any | ✅ any | ✅ own | ⛔ |
| KB analytics `/api/kb/analytics` | ✅ | ✅ | ⛔ | ⛔ |
| AI assist (suggest-reply/summarize/priority) | ✅ | ✅ | ✅ | ⛔ (staff-only) |
| AI chat (own conversations) | ✅ | ✅ | ✅ | ✅ (needs own OpenRouter key) |
| Settings (own AI key/password) | ✅ | ✅ | ✅ | ✅ |
| SLA policies: create/edit | ✅ | ✅ | ⛔ | ⛔ |
| SLA policies: delete | ✅ | ⛔ (403) | ⛔ | ⛔ |
| Projects: create | ✅ | ⛔ | ⛔ | ⛔ |
| Projects: update | ✅ | if lead | ⛔ | ⛔ |
| Sprints: create/start/complete | ✅ | ✅ | ⛔ | ⛔ |
| Goals: create / update | ✅ / ✅ | ✅ / owner | ⛔ | ⛔ |
| Workflow scheme builder (`/api/jira/admin/*`) | ✅ | ⛔ | ⛔ | ⛔ |
| Custom fields (`/api/jira/admin/custom-fields`) | ✅ | ⛔ | ⛔ | ⛔ |
| Admin: teams/categories/users | ✅ | ⛔ | ⛔ | ⛔ |
| Auto-close job (`/api/admin/run-autoclose`) | ✅ | ⛔ | ⛔ | ⛔ |
| Trello: own workspaces | ✅ | ✅ | ✅ | ✅ |
| Trello: workspace admin (members/visibility) | ✅ | ✅ | ✅ | ✅ (as ws admin) |
| Entity links: create / delete | ✅ / ✅ | ✅ / creator | ✅ / creator | ✅ / creator |
| Notifications (own) | ✅ | ✅ | ✅ | ✅ |
| Search `/api/search` | ✅ | ✅ | ✅ | own issues + published notes |
| `/api/meta` user list | ✅ | ✅ | ✅ | empty `users` (privacy guard) |

## 5. Status codes the suite relies on

| Code | Meaning in OpsDesk |
|---|---|
| 200 | OK (JSON payload) |
| 201 | Created (entity-links only) |
| 400 | Validation failure / illegal transition / missing reason |
| 401 | Not authenticated (missing/expired session) |
| 403 | Authenticated but role forbidden |
| 404 | Resource missing **or not visible to you** (anti-enumeration) |
| 409 | Conflict (duplicate team/category/user-with-references/link) |
| 410 | Attachment row exists but file missing on disk |
| 413 | Payload too large |
| 429 | Rate-limited (login lockout, AI chat 20/60 s) |
| 502 | AI provider call failed |
| 503 | AI feature unavailable (no provider key) |

## 6. Reset the test data (cleanup helper)

```bash
# Stop the server, then:
rm -f data/opsdesk.db data/opsdesk.db-wal data/opsdesk.db-shm
rm -rf data/uploads/*
python run.py          # recreates + reseeds on first boot
```

> For the automated suite, `boot_test_server.py` does this automatically on
> `data/opsdesk_test.db` so your dev data is never touched.

## 7. Env vars that change behavior (test-relevant)

| Var | Effect |
|---|---|
| `OPERADESK_SECRET` | Session + Fernet key (set a fixed value for deterministic tests) |
| `OPERADESK_OPENROUTER_KEY` | Enables AI features deployment-wide (leave unset for 503 tests) |
| `OPERADESK_AI_ENABLED=0` | Forces AI off even with a key |
| `OPERADESK_SMTP_HOST` | Enables real email; unset → reset tokens print to console only |
| `OPERADESK_COOKIE_SECURE=1` | Requires HTTPS (leave 0 for local tests) |
| `OPERADESK_APP_URL` | Base URL in reset emails |
| `OPERADESK_RESET_TOKEN_MINUTES` | Reset token lifetime (default 30) |