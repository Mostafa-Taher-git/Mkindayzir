# OpsDesk — Project Review & Full MVP Plan (incl. AI)

> Grounded review of the current codebase (read in full on 2026-08-16) + a
> complete build plan to reach a market-shaped MVP. Runtime verified:
> server 200, login POST 200, frontend jsdom test 7/7.

---

## 1. What the app IS today (verified)
- **Stack:** Flask + SQLite + vanilla SPA (no build step). Thin, readable Python.
- **Auth:** server-side session cookies, pbkdf2 passwords, 4 roles (requester/agent/manager/admin).
- **Tickets:** 7-state lifecycle enforced in ONE place (`lifecycle.py`), full activity log, comments (public/internal), attachments (pdf/png/jpg, 10MB), reopen window (72h), auto-close thread (72h), aged-ticket detection.
- **Dashboard:** status counts, unassigned, urgent open, blocked, avg resolution (7d), aged list — RBAC-scoped to agent's team.
- **Admin:** CRUD teams, categories, users/roles.
- **Verified working:** create→assign→in_progress→blocked→in_progress→resolved→reopen round-trips; blocked→resolved correctly rejected; dashboard SQL fixed earlier.

---

## 2. Coverage vs the Help-Desk spec (10 functions)

| # | Spec function | Status | Evidence in code |
|---|--------------|--------|------------------|
| 1 | Ticket / Issue mgmt | ✅ Done | tickets table, lifecycle.py, activity log |
| 2 | Multichannel intake | ❌ Missing | only web `POST /api/tickets` |
| 3 | Knowledge Base / self-service | ❌ Missing | no KB tables, no articles, no portal |
| 4 | SLA & routing | ⚠️ Partial | timing windows in config.py; no SLA policies, no auto-assign, no escalation |
| 5 | Automation & workflow | ❌ Missing | only auto-close; no rules/macros/canned replies |
| 6 | Reporting & analytics | ⚠️ Partial | counts+avg+aged; no CSAT, no workload, no trends, no export |
| 7 | Collaboration & notes | ✅ Done | internal comments (no @mentions) |
| 8 | AI assistance | ❌ Missing | none |
| 9 | Integration / extensibility | ⚠️ Partial | REST API exists; no webhooks/CRM/dev-link |
| 10 | Mobile / accessibility | ⚠️ Partial | responsive SPA; no PWA/offline; ARIA thin |

---

## 3. What I (the agent) got WRONG / MISSED (concrete, real)

**Security**
- `config.py:25` secret key reads env `OPERATION` (misnamed, undocumented; comment & var disagree with README). Session-signing secret must be a real, documented key.
- **No CSRF protection** on any POST (cookie session + JSON fetch). A logged-in user can be driven to mutate tickets via a crafted page.
- **Login has no rate limit** → password brute-force risk.
- `GET /api/meta` returns **ALL users (name, email, role, team)** to **every** logged-in user, including requesters → staff directory leak.
- `POST /api/tickets` accepts caller-supplied `requester_id` without checking the caller is an agent → a requester can spoof tickets as someone else.

**Correctness / data**
- **Timezone bug:** timestamps are stored as UTC ISO, but dashboard/aged queries use SQLite `datetime('now','-7 days')` which is **server local time**, not UTC. Aged/avg numbers drift if host TZ ≠ UTC. Fix: use `datetime('now','-7 days','utc')` or store epoch.
- **Reopen double-count:** `reopen_count` is bumped in BOTH `/reopen` and `/status`→reopened path.
- **New→Closed blocked:** lifecycle only allows `new→assigned`. A manager cannot close a brand-new spam ticket (comment claims they can, code disagrees).
- `db.py` uses a single module-level `_conn` with `check_same_thread=False`. Fine for dev single-process; **breaks under multi-worker (gunicorn) production**.

**Robustness**
- No backend test suite (only frontend jsdom). Regressions in routes have no guard.
- `description`, comment `body`, attachment filename have **no length caps** (only subject ≤100).
- Attachment size relies on `file.content_length` which can be `None` for some clients → the 10MB check is bypassable.
- No pagination on `/api/tickets` (OK at MVP scale, note for later).

---

## 4. What needs to be UPDATED / IMPROVED (priority order)

**P0 — fix before any new feature**
1. CSRF token on mutating requests (or switch to same-site cookies + fetch with credentials).
2. Scope `/api/meta` users list (requesters get only teams+categories+statuses, not the staff list).
3. Lock `requester_id` to the caller unless agent/manager.
4. Fix SQLite timezone to UTC consistently; fix reopen double-count; allow manager `new→closed`.
5. Document + rename secret key (`OPERADESK_SECRET`).

**P1 — hardening**
6. Login rate-limit (works single-process; see debate note on multi-worker).
7. Backend pytest suite (mirror the lifecycle + RBAC + dashboard checks).
8. Length caps on description/comment body.
9. Attachment size from actual bytes read, not `content_length`.

---

## 5. FULL MVP PLAN (everything included) — DEBATED & REVISED

> Revised after a skeptical-engineering debate (see `PLAN.debate.md`). The MVP is
> now **5 phases** (stabilize → notify/reset → KB → SLA → reporting), starts with
> a hard stability gate, and includes the comms/account features the first draft
> forgot. Heavy/optional parts (automation, webhooks, IMAP, PWA, Docker) are
> deferred. **AI/"agy" is deferred to v2** (user decision 2026-08-17). Stack stays
> Flask+SQLite+vanilla JS, Python kept thin+commented.

### Phase 0 — Stabilize (ship FIRST, non-negotiable)
Fix the 7 known bugs (§3) with these specific corrections:
- **CSRF:** cookie+JSON API needs a **token or custom-header check** (not just
  SameSite) — make mutating requests non-simple / CORS-blocked to forged sites.
- **Session cookie flags:** set **Secure + HttpOnly + SameSite** explicitly.
- **Secret management:** rename to `OPERADESK_SECRET`; add `.env.example`; note
  rotation. (Drop the misnamed `OPERATION` var.)
- **`/api/meta` scoping** + **lock `requester_id`** to caller (authZ holes).
- **SQLite TZ:** use `datetime('now','-7 days','utc')` / store epoch (fixes
  aged/avg drift). **Reopen double-count** + **manager new→closed** fixes.
- **DB connection:** switch module-level `_conn` → **per-request** connection
  (correctness fix; module-level conn is a latent threading bug even in dev).
  Run SQLite in **WAL mode, single-writer process** — "per-request" fixes the
  thread-safety bug but does NOT lift SQLite's global write lock, so the supported
  deploy stays single-process `run.sh` (multi-worker would need Postgres — deferred).
- **Length caps** on description/comment body; **attachment size from actual
  bytes read** (not `content_length`).
- **Login hardening:** rate-limit **+ account lockout** after N fails **+ password
  min-length policy + idle session timeout**.
- **Secret management:** rename to `OPERADESK_SECRET`; **generate a random key,
  store in `.env` (git-ignored), never commit it, use a per-environment key**
  (add `.env.example` with no real value).
- **Backend `pytest` suite** tied directly to the security fixes (requester can't
  set `requester_id`, `/meta` scoped, TZ math correct) + lifecycle + RBAC +
  dashboard.
- Supported deploy = single-process `run.sh` (run in the user's own session —
  agent-session servers aren't browser-reachable). Multi-worker/Docker deferred.

### Phase 1 — Notifications + account self-service  [fills a gap the 1st draft missed]
- **Outbound requester notifications** on assign / resolve / new internal note
  (in-app + optional SMTP email). A help desk that never tells the requester
  their ticket moved is not a help desk — this precedes KB/SLA.
- **Password reset** (token emailed; expires) — recovery path is MVP, not later.
- Login hardening paired with Phase 0 lockout (Secure/HttpOnly/SameSite cookies).

### Phase 2 — Knowledge Base & self-service (#3)  [spec minimum]
- `kb_articles(id, title, body, category_id, author_id, published, views, ts)` +
  `kb_feedback(id, article_id, helpful, comment)`.
- List/search/read; agent/manager CRUD; "was this helpful?".
- Requester "Help Center" view with search; link from ticket create ("check KB first").

### Phase 3 — SLA & basic routing (#4)  [spec minimum]
- `sla_policies(id, name, priority, response_hours, resolution_hours, category_id)`,
  `ticket_sla(id, ticket_id, policy_id, first_response_at, breach_at, breached)`.
- Attach matching SLA on create/assign; compute `breach_at`; dashboard shows
  breaching tickets. Default category→team routing on create.

### Phase 4 — Reporting upgrade (#6)
- `ticket_csats(id, ticket_id, rating 1–5, comment)` on close.
- Dashboard: agent workload, CSAT avg, 30-day volume trend, SLA breach rate.
- CSV export endpoint.

### AI ("agy") — DEFERRED to v2 (per user decision, 2026-08-17)
- The skeptic critic flagged AI as the riskiest MVP item: prompt-injection via
  crafted ticket text, provider drift, cost, and the least-editable part for a
  beginner. **Decision: build it at the END of the project, in v2**, only after
  the core (Phases 0–4) is stable and verified. When built: `ai/` module via
  OpenRouter (deepseek free), key-gated + feature-flagged, strictly draft-only
  (suggest reply / summarize / suggest priority), prompt-injection hardened,
  fails closed. Not part of MVP scope.

### Deferred OUT of MVP (see PLAN.debate.md)
Automation rule engine, webhooks/API tokens/CRM-dev linking, email *intake*
(IMAP), PWA/offline/full ARIA audit, multi-worker gunicorn deploy, and **AI/agy
(until v2)**.

---

## 6. Debate
See the critic agent's challenge and the incorporated fixes in `PLAN.debate.md`.
