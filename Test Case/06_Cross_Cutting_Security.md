# 06 — Cross-Cutting Security, Auth & Edge Cases

> Role-agnostic cases that protect the whole platform. Run these after the
> role suites, on a fresh DB. Actors are the five seed users from
> `00_Test_Data_and_Setup.md`.

---

## TC-SEC-01 — Unauthenticated API access → 401
- **Priority:** P0 · **Type:** Negative · **UI/API:** any `/api/*`
- **Preconditions:** No session cookie.
- **Steps:** 1) `GET /api/auth/me`, `GET /api/jira/issues`, `POST /api/jira/issues` (no cookie).
- **Expected:** 401 JSON `{"error":"Authentication required"}` for all; SPA shows the login view, never a redirect loop.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-SEC-02 — CSRF token required on every mutation
- **Priority:** P0 · **Type:** Negative · **UI/API:** `POST /api/auth/login`, `POST /api/jira/issues`, `DELETE /api/entity-links/<id>`
- **Preconditions:** Authenticated session; valid payloads.
- **Steps:** 1) Send each mutation **without** the `X-CSRF-Token` header. 2) Send with a **wrong** token value.
- **Expected:** Missing token → 403 `CSRF validation failed`; wrong token → 403; nothing mutated. (Exception: `/api/auth/forgot-password` and `/api/auth/reset-password` are deliberately unprotected.)
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-SEC-03 — Session idle timeout (60 min) forces re-login
- **Priority:** P1 · **Type:** Edge · **UI/API:** `GET /api/auth/me`
- **Preconditions:** Logged-in session (any role).
- **Steps:** 1) Manually age the session: `UPDATE`… — or simpler: set `last_active` in the session to `now - 61 min` via a debug cookie edit (dev-only); or wait. 2) `GET /api/auth/me`.
- **Expected:** 401; session cleared; SPA returns to login view; activity within 60 min keeps the session alive.
- **Actual/Notes:** ______
- **Cleanup:** re-login.

## TC-SEC-04 — Password reset: no account enumeration
- **Priority:** P0 · **Type:** Positive/Negative · **UI/API:** `POST /api/auth/forgot-password`
- **Preconditions:** App running with SMTP unset (tokens printed to console).
- **Steps:** 1) POST with `email=admin@opsdesk.local`. 2) POST with `email=nobody@opsdesk.local`.
- **Expected:** Both return the **same** generic success payload; no 404/error difference; a token row exists only for the real account.
- **Actual/Notes:** ______
- **Cleanup:** delete `password_resets` rows.

## TC-SEC-05 — Reset token: single-use + expiry
- **Priority:** P1 · **Type:** Negative · **UI/API:** `POST /api/auth/reset-password`
- **Preconditions:** A fresh token for sam (from console output or DB).
- **Steps:** 1) Reset with a 8+ char password → 200. 2) Reset again with the same token → 400. 3) Create a second token, backdate `expires_at` to past → 400. 4) Reset with a 7-char password → 400.
- **Expected:** First reset 200 and login works with new password; repeat/expired/short all 400; token marked `used`.
- **Actual/Notes:** ______
- **Cleanup:** revert password; clear tokens.

## TC-SEC-06 — Brute-force lockout per account (429)
- **Priority:** P1 · **Type:** Negative · **UI/API:** `POST /api/auth/login`
- **Preconditions:** Clean counter (restart or fresh process).
- **Steps:** 1) 5 wrong-password attempts for `agent@opsdesk.local`. 2) 6th attempt with the **correct** password.
- **Expected:** Attempts 1–5 → 401; 6th → 429 with lockout message; correct password also blocked until the 15-min window passes.
- **Actual/Notes:** ______
- **Cleanup:** restart app or wait; verify login resumes.

## TC-SEC-07 — RBAC matrix sweep (403 vs 404)
- **Priority:** P0 · **Type:** Negative · **UI/API:** full endpoint sweep
- **Preconditions:** Sessions for all five roles; sample issue per team.
- **Steps:** 1) For each role × endpoint from the matrix in `00_Test_Data_and_Setup.md` §4, call the endpoint and record the status.
- **Expected:** Matches the matrix exactly: reports/admin/sprint/goal/SLA-create → 403 for agent & requester; CSAT → 403 for staff; internal comments → 403 for requester; invisible tickets → 404 for everyone below manager.
- **Actual/Notes:** ______ (run as a table; record any deviation)
- **Cleanup:** none.

## TC-SEC-08 — 404-not-403 anti-enumeration discipline
- **Priority:** P1 · **Type:** Edge · **UI/API:** `GET /api/jira/issues/999999`, `/api/trello/boards/999`, `/api/kb/notes/999`, `/api/ai/conversations/999`
- **Preconditions:** Any authenticated session.
- **Steps:** 1) Request non-existent ids; 2) request ids that exist but are invisible (HR issue as IT agent).
- **Expected:** Uniform 404 JSON for both cases — an attacker cannot distinguish "doesn't exist" from "not yours".
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-SEC-09 — Attachment magic-byte mismatch rejected
- **Priority:** P1 · **Type:** Negative · **UI/API:** `POST /api/jira/issues/<iid>/attachments`
- **Preconditions:** Authenticated user with a visible ticket.
- **Steps:** 1) Upload a file named `image.png` whose content is actually `MZ...` (PE header).
- **Expected:** 400; file not stored.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-SEC-10 — Attachment filename path traversal blocked
- **Priority:** P1 · **Type:** Negative · **UI/API:** `POST /api/jira/issues/<iid>/attachments`
- **Preconditions:** Visible ticket.
- **Steps:** 1) Upload with filename `../../etc/passwd.pdf` (multipart filename field).
- **Expected:** 400 (sanitized/rejected); no file written outside `data/uploads/<iid>/`.
- **Actual/Notes:** ______
- **Cleanup:** verify uploads dir clean.

## TC-SEC-11 — Missing attachment file on disk → 410
- **Priority:** P2 · **Type:** Edge · **UI/API:** `GET /api/jira/issues/<iid>/attachments/<aid>`
- **Preconditions:** Attachment row exists but file deleted manually from `data/uploads/`.
- **Steps:** 1) `GET .../attachments/<aid>`.
- **Expected:** 410 (gone), not 500.
- **Actual/Notes:** ______
- **Cleanup:** delete the orphan row.

## TC-SEC-12 — Input length caps enforced everywhere
- **Priority:** P1 · **Type:** Negative · **UI/API:** issues, comments, KB, trello, goals
- **Preconditions:** Authenticated sessions.
- **Steps:** 1) Subject 101 chars → 400. 2) Comment 5001 chars → 400. 3) KB title 201 chars → 400. 4) KB body 20001 chars → 400. 5) Trello card title 121 chars → 400. 6) Goal title 201 chars → 400.
- **Expected:** All rejected with 400; nothing persisted.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-SEC-13 — Pagination caps (per_page ≤ 100)
- **Priority:** P2 · **Type:** Edge · **UI/API:** `GET /api/jira/issues?per_page=500`, `GET /api/notifications?per_page=500`
- **Preconditions:** Authenticated.
- **Steps:** 1) Request `per_page=500`.
- **Expected:** Capped at 100 (or 400); response honors the documented limit.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-SEC-14 — AI chat rate limit (20 req / 60 s → 429)
- **Priority:** P2 · **Type:** Negative · **UI/API:** `POST /api/ai/chat/<conv_id>`
- **Preconditions:** User with saved OpenRouter key (or mock); conversation exists.
- **Steps:** 1) Send 21 chat requests in quick succession.
- **Expected:** Requests 1–20 accepted (SSE stream); 21st → 429.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-SEC-15 — AI tool confirmation required for mutating tools
- **Priority:** P1 · **Type:** Positive · **UI/API:** `GET /api/ai/tools`, `POST /api/ai/tool-confirm/<msg_id>`
- **Preconditions:** Key-configured user.
- **Steps:** 1) `GET /api/ai/tools` → `create_issue` and `update_issue_status` carry `requires_confirm: true`. 2) Chat prompt that triggers `create_issue` → SSE emits `tool_call` with `requires_confirm` then ends with `awaiting_confirmation: true`; 3) `POST /api/ai/tool-confirm/<msg_id> {"decision":"reject"}` → resume shows the tool was rejected, **no issue created**.
- **Expected:** Tools catalog correct; confirmation gate holds; rejected tool never executes.
- **Actual/Notes:** ______
- **Cleanup:** delete the conversation.

## TC-SEC-16 — AI chat conversations are owner-scoped
- **Priority:** P1 · **Type:** Negative · **UI/API:** `GET/DELETE /api/ai/conversations/<conv_id>`, `POST /api/ai/chat/<conv_id>`
- **Preconditions:** Two users each with one conversation.
- **Steps:** 1) User B reads/deletes/chats into user A's conversation id.
- **Expected:** 403/404 on all; A's conversation untouched.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-SEC-17 — `/api/meta` hides user directory from requesters
- **Priority:** P1 · **Type:** Positive · **UI/API:** `GET /api/meta`
- **Preconditions:** Sam + agent sessions.
- **Steps:** 1) `GET /api/meta` as agent → `users` populated. 2) As sam → `users` is empty array.
- **Expected:** No staff directory leak to requesters.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-SEC-18 — Entity links: duplicate is idempotent, self-link rejected, delete by non-creator forbidden
- **Priority:** P2 · **Type:** Edge · **UI/API:** `POST /api/entity-links`, `DELETE /api/entity-links/<id>`
- **Preconditions:** An issue + a KB note visible to the actor.
- **Steps:** 1) Create link → 201. 2) Create same link again → 200 (idempotent). 3) Self-link (issue→issue) → 400. 4) Non-creator (another user) deletes → 403. 5) Creator deletes → 200.
- **Expected:** 201, 200, 400, 403, 200 respectively.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-SEC-19 — CSV export escapes formula injection (staff role)
- **Priority:** P1 · **Type:** Positive · **UI/API:** `GET /api/reports/export.csv`
- **Preconditions:** An issue whose summary starts with `=`, `+`, `-`, `@`, or tab/CR.
- **Steps:** 1) Export CSV as manager. 2) Inspect the cell.
- **Expected:** Dangerous cells prefixed with `'` (e.g. `'=HYPERLINK("x","y")`); safe cells unchanged.
- **Actual/Notes:** ______
- **Cleanup:** delete the issue.

## TC-SEC-20 — SPA routing: unknown `/api/*` returns JSON 404, app shell still served
- **Priority:** P2 · **Type:** Edge · **UI/API:** `GET /api/does-not-exist`, `GET /any-spa-path`
- **Preconditions:** None.
- **Steps:** 1) `GET /api/does-not-exist` → JSON 404. 2) `GET /some/spa/route` → 200 HTML shell (SPA fallback).
- **Expected:** API errors are always JSON (400/404/405/409/413/500 handlers); SPA deep links serve the shell.
- **Actual/Notes:** ______
- **Cleanup:** none.

---

## Security suite — cleanup checklist

- Clear `password_resets` tokens, revert changed passwords, reset lockout
  counters (restart app), delete test conversations/issues/links.
- A full DB reset (see `00_Test_Data_and_Setup.md` §6) is recommended after
  this suite since several cases mutate security state.