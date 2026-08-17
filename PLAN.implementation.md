# OpsDesk — Consolidated Implementation Plan

**Source:** `.opencode` review reports + `/home/dell/Desktop/OpsDesk_Implementation_Plan.md`
**Current state:** `2642bd6` on local `main`, 73 tests pass, server at http://127.0.0.1:5000
**Rule:** implement in phase order; each phase leaves the app runnable and testable

---

## Phase 0 — Make it start and stop lying about errors
- B-1: add `cryptography` to `requirements.txt` (DONE in `2642bd6`)
- B-2: auto-create `data/` before SQLite opens (DONE in `2642bd6`)
- B-9: make `debug` conditional on env var, add WSGI entry point
- B-3 (error-handling half): ensure `/api/*` unhandled exceptions return JSON even in debug mode (DONE in `2642bd6`)
- Verify fresh clone: `pip install -r requirements.txt && python run.py` starts cleanly

## Phase 1 — Fix daily-use trust bugs
- B-4: AI settings save must preserve stored key; only explicit Clear wipes it (DONE in `2642bd6`)
- B-5: embed `assignee_name`, `requester_name`, `author_name` in serialized ticket/comment payloads; prefer server-provided names over client-side directory lookup
- B-7: reopen window fallback to `closed_at` when `resolved_at` is null
- B-8: unassigning a ticket must reset status to `new` server-side
- B-3 (policy half): real delete-user policy in `routes_admin.delete_user` — block/reassign/soft-delete with clear 409 message (DONE: block with history check in `2642bd6`)

## Phase 2 — Close usability gaps
- B-6: mobile navigation — hamburger/drawer for sidebar at ≤900px
- M-1: Admin Users table must expose Delete action with confirmation
- M-2: Edit User modal must show optional "New password" field
- M-3: Settings page must have "Change my password" section with current+new password
- M-4: route team delete and category deactivate through `confirmModal()`
- M-5: admin-set password input must be `type="password"`
- M-6: KB article body must preserve paragraph breaks (`white-space: pre-wrap` or paragraph split)

## Phase 3 — Harden what’s left
- M-9: idle-timeout check must run in `role_required` routes too, not just `login_required`
- M-10: SMTP 465 must use `SMTP_SSL`, 587 must use `STARTTLS` (DONE in `2642bd6`)
- M-11: attachment validation must inspect magic bytes, not just extension
- M-7: fix `test_frontend.js` to use project-relative paths and fetch CSRF before login
- M-8: regenerate `.env.example` to include every var `config.py` reads
- B-3 leftover: make `run.py` debug flag env-driven instead of hardcoded

## Phase 4 — Polish
- P-1: optimize `logo.png` / `favicon.ico` size
- P-2: add pagination to `/api/tickets` and notifications list
- C-1: remove `cj*.txt`, add to `.gitignore` (DONE in `2642bd6`)
- C-2: catch `sqlite3.IntegrityError` directly instead of `db.get_db().IntegrityError`
- C-3: flesh out `package.json` metadata + add `npm test`
- C-4: remove dead unreachable code in `app.js` `shell()`
- C-5: fix KB feedback arrow-function `this` trap
- UX: inline SVG chart in Reports for 30-day trend
- UX: KB rich text/markdown authoring instead of plain `<textarea>`
- UX: admin Users table search/filter

## Execution order
1. Phase 0
2. Phase 1
3. Phase 2
4. Phase 3
5. Phase 4

Each phase: implement → run `pytest` + JS syntax check → fix regressions → commit → report.
