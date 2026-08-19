# 05 — Requester Role Test Suite

**Actor:** `sam@opsdesk.local` / `password` · **Role:** `requester` · **Team:** IT (id 1, informational only)

## Role permissions & expected UI access

- **Permissions:** create/view/edit own tickets (edit only while status is
  `new`), public comments, attachments on own tickets, follow/unfollow,
  reopen within 72 h, **CSAT rating** (requester-only), read published KB
  notes only, feedback, notifications, own AI conversations (needs own
  OpenRouter key), settings, own Trello workspaces, search (own issues +
  published notes).
- **Not available:** staff queue/dashboard (403), reports (403), admin
  (403), internal comments (403), status transitions (unless admin grants
  via workflow override), KB authoring/collections (403), meta user list
  (empty `users`).
- **UI access:** `#/my` (My Requests), Ticket detail, `#/jira` (read own),
  `#/trello` (own), `#/kb` (published only), Settings, Help, Search,
  Notifications. No Dashboard/Queue/Reports/Admin.

---

## TC-REQ-01 — Login as requester
- **Priority:** P0 · **Type:** Positive · **UI/API:** login | `POST /api/auth/login`
- **Preconditions:** Fresh DB; CSRF token fetched.
- **Steps:** 1) Login with `sam@opsdesk.local` / `password`.
- **Expected:** 200; `role: "requester"`; landing view is **My Requests** (`#/my`); nav shows no Queue/Dashboard/Reports/Admin.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-REQ-02 — Wrong password rejected; 5 attempts lock out
- **Priority:** P0 · **Type:** Negative · **UI/API:** `POST /api/auth/login`
- **Preconditions:** No prior failed logins.
- **Steps:** 1) Login with wrong password ×5.
- **Expected:** 401 ×5; 6th attempt (even with correct password) → 429 with lockout message (~15 min); session cookie absent.
- **Actual/Notes:** ______
- **Cleanup:** wait out the lockout or restart server (in-memory counter).

## TC-REQ-03 — Create a service request (happy path)
- **Priority:** P0 · **Type:** Positive · **UI/API:** `#/my` → New Request | `POST /api/jira/issues`
- **Preconditions:** Sam session; category `Access & Accounts` active.
- **Steps:** 1) Open New Request. 2) Fill subject `VPN access for contractor`, description, category `Access & Accounts`, priority `high`. 3) Submit.
- **Expected:** 200; response contains `issue_key` like `OPS-000N`, status `new`, `requester_id = sam`, `team_id = IT (1)` (category routing); appears in `#/my`; `created_first_issue` milestone recorded (`GET /api/help/progress`).
- **Actual/Notes:** ______
- **Cleanup:** none (keep for later cases).

## TC-REQ-04 — Validation: empty subject, 101-char subject, 5001-char description
- **Priority:** P1 · **Type:** Negative · **UI/API:** `POST /api/jira/issues`
- **Preconditions:** Sam session.
- **Steps:** 1) Empty subject → 400. 2) 101-char subject → 400. 3) 5001-char description → 400.
- **Expected:** 400 JSON errors; no issues created; UI shows inline validation messages.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-REQ-05 — Requester cannot choose team or requester_id (forced routing)
- **Priority:** P1 · **Type:** Negative · **UI/API:** `POST /api/jira/issues`
- **Preconditions:** Sam session.
- **Steps:** 1) `POST /api/jira/issues {"summary":"X","category_id":<Software>,"team_id":2,"requester_id":<agent_id>}`.
- **Expected:** 200 but `team_id` = category default (IT), `requester_id` = sam (requester fields ignored, never honored).
- **Actual/Notes:** ______
- **Cleanup:** close/delete issue.

## TC-REQ-06 — Inactive category rejected
- **Priority:** P1 · **Type:** Negative · **UI/API:** `POST /api/jira/issues`
- **Preconditions:** A category soft-deleted by admin (`active=0`).
- **Steps:** 1) `POST /api/jira/issues {"summary":"X","category_id":<inactive_id>}`.
- **Expected:** 400; category absent from the UI dropdown.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-REQ-07 — My Requests shows only own tickets
- **Priority:** P0 · **Type:** Positive · **UI/API:** `#/my` | `GET /api/jira/issues`
- **Preconditions:** Sam owns 2 issues; agent owns 1 (created via API).
- **Steps:** 1) Open `#/my`; 2) `GET /api/jira/issues`.
- **Expected:** Only sam's 2 issues returned; agent's issue absent; UI shows only own.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-REQ-08 — Other users' ticket detail → 404
- **Priority:** P0 · **Type:** Negative · **UI/API:** `GET /api/jira/issues/<ref>`
- **Preconditions:** An agent-created issue exists.
- **Steps:** 1) `GET /api/jira/issues/<agent_issue_ref>`.
- **Expected:** 404 JSON; no summary/description leak.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-REQ-09 — Edit own ticket while `new` succeeds
- **Priority:** P1 · **Type:** Positive · **UI/API:** `PATCH /api/jira/issues/<iid>`
- **Preconditions:** Sam's own ticket in `new`.
- **Steps:** 1) `PATCH /api/jira/issues/<iid> {"description":"Updated details"}`.
- **Expected:** 200; description updated; `entity_activity` shows `edited`.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-REQ-10 — Edit own ticket once not `new` → 400
- **Priority:** P1 · **Type:** Negative · **UI/API:** `PATCH /api/jira/issues/<iid>`
- **Preconditions:** Sam's ticket in `assigned` (agent claimed it).
- **Steps:** 1) `PATCH /api/jira/issues/<iid> {"description":"late edit"}`.
- **Expected:** 400; description unchanged.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-REQ-11 — Edit someone else's ticket → 404
- **Priority:** P1 · **Type:** Negative · **UI/API:** `PATCH /api/jira/issues/<iid>`
- **Preconditions:** Agent's ticket exists.
- **Steps:** 1) `PATCH /api/jira/issues/<agent_iid> {"description":"hack"}`.
- **Expected:** 404.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-REQ-12 — Public comment on own ticket
- **Priority:** P1 · **Type:** Positive · **UI/API:** `POST /api/jira/issues/<iid>/comments`
- **Preconditions:** Sam's own `new` ticket.
- **Steps:** 1) Post `{"body":"Any update?","visibility":"public"}`.
- **Expected:** 200; comment visible in ticket detail (both sam and the assigned staff); sam auto-follows the ticket.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-REQ-13 — Internal comment → 403 (staff-only visibility)
- **Priority:** P1 · **Type:** Negative · **UI/API:** `POST /api/jira/issues/<iid>/comments`
- **Preconditions:** Sam's ticket.
- **Steps:** 1) `POST .../comments {"body":"secret","visibility":"internal"}`.
- **Expected:** 403; no comment row created.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-REQ-14 — Internal comments are stripped from requester detail view
- **Priority:** P1 · **Type:** Positive · **UI/API:** `GET /api/jira/issues/<iid>`
- **Preconditions:** Ticket has 1 public + 1 internal comment (agent posted).
- **Steps:** 1) `GET /api/jira/issues/<iid>` as sam.
- **Expected:** 200; `comments` array contains only the public comment; internal one absent.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-REQ-15 — Attachment upload + download on own ticket
- **Priority:** P1 · **Type:** Positive · **UI/API:** `POST/GET /api/jira/issues/<iid>/attachments`
- **Preconditions:** Sam's `new` ticket.
- **Steps:** 1) Upload `receipt.png`. 2) Download it back.
- **Expected:** Upload 200 (metadata returned); download 200, byte-identical.
- **Actual/Notes:** ______
- **Cleanup:** delete uploaded file.

## TC-REQ-16 — Attachment upload: disallowed extension + oversized
- **Priority:** P1 · **Type:** Negative · **UI/API:** `POST /api/jira/issues/<iid>/attachments`
- **Preconditions:** Sam's ticket.
- **Steps:** 1) Upload `virus.exe` → 400. 2) Upload >10 MB file → 413/400.
- **Expected:** Both rejected; `entity_attachments` empty for the ticket.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-REQ-17 — Requester cannot assign or transition status
- **Priority:** P0 · **Type:** Negative · **UI/API:** `POST /api/jira/issues/<iid>/assign`, `POST .../status`
- **Preconditions:** Sam's `new` ticket.
- **Steps:** 1) `POST .../assign {"self":true}` → expect 403. 2) `POST .../status {"to_status":"in_progress"}` → expect 403/400.
- **Expected:** Both denied; status stays `new`.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-REQ-18 — Reopen within 72 h window succeeds
- **Priority:** P1 · **Type:** Positive · **UI/API:** `POST /api/jira/issues/<iid>/reopen`
- **Preconditions:** Sam's ticket resolved 1 h ago (agent resolved it).
- **Steps:** 1) `POST .../reopen`.
- **Expected:** 200; status `reopened`; `reopen_count = 1`; agent notified.
- **Actual/Notes:** ______
- **Cleanup:** resolve again.

## TC-REQ-19 — Reopen outside 72 h window → 400
- **Priority:** P1 · **Type:** Negative · **UI/API:** `POST /api/jira/issues/<iid>/reopen`
- **Preconditions:** Sam's ticket resolved > 72 h ago (backdate `resolved_at` in DB).
- **Steps:** 1) `POST .../reopen`.
- **Expected:** 400; status unchanged.
- **Actual/Notes:** ______
- **Cleanup:** restore `resolved_at`.

## TC-REQ-20 — Reopen someone else's ticket → 404
- **Priority:** P1 · **Type:** Negative · **UI/API:** `POST /api/jira/issues/<iid>/reopen`
- **Preconditions:** Agent's resolved ticket.
- **Steps:** 1) `POST .../reopen` as sam.
- **Expected:** 404.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-REQ-21 — CSAT rating flow (1–5, once, resolved/closed only)
- **Priority:** P1 · **Type:** Positive/Negative · **UI/API:** `POST /api/jira/issues/<iid>/rate`
- **Preconditions:** Sam's ticket `resolved` (from TC-REQ-18 flow).
- **Steps:** 1) `POST .../rate {"score":4}` → 200. 2) Repeat with `{"score":5}` → 400 "Already rated". 3) Rate a `new` ticket → 400. 4) Rate with `score: 9` → 400.
- **Expected:** First 200 (`csat: 4`, activity `rated`); duplicate 400; non-resolved 400; out-of-range 400.
- **Actual/Notes:** ______
- **Cleanup:** reset csat via DB if needed.

## TC-REQ-22 — Staff dashboard/reports denied (403)
- **Priority:** P0 · **Type:** Negative · **UI/API:** `GET /api/dashboard`, `GET /api/reports/summary`
- **Preconditions:** Sam session.
- **Steps:** 1) Call both endpoints.
- **Expected:** 403 on both.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-REQ-23 — KB: read published notes; drafts → 404; no authoring
- **Priority:** P1 · **Type:** Positive/Negative · **UI/API:** `GET /api/kb/notes`, `GET /api/kb/notes/<nid>`, `POST /api/kb/notes`
- **Preconditions:** One published note + one draft note exist.
- **Steps:** 1) List notes → only published returned. 2) GET published → 200, `views` increments. 3) GET draft → 404. 4) `POST /api/kb/notes {...}` → 403. 5) `POST /api/kb/collections` → 403.
- **Expected:** Published only; draft invisible; authoring/collections forbidden.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-REQ-24 — KB feedback: helpful/not-helpful upsert
- **Priority:** P2 · **Type:** Positive · **UI/API:** `POST /api/kb/notes/<nid>/feedback`
- **Preconditions:** Published note.
- **Steps:** 1) Post `{"helpful":1}`. 2) Post `{"helpful":0,"comment":"Outdated"}` (upsert — same user).
- **Expected:** Both 200; note counters reflect final state (1 yes → 0 no); repeated upsert doesn't duplicate rows.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-REQ-25 — Search scope: own issues + published notes only
- **Priority:** P1 · **Type:** Positive · **UI/API:** `GET /api/search?q=...`
- **Preconditions:** Sam's issue "VPN" + agent's issue "VPN" + published note "VPN Setup".
- **Steps:** 1) `GET /api/search?q=VPN&scope=all`.
- **Expected:** Results contain sam's issue + the published note; agent's issue absent; Trello cards restricted to sam's workspaces.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-REQ-26 — Notifications: assignment, comment, resolution
- **Priority:** P1 · **Type:** Positive · **UI/API:** `GET /api/notifications`
- **Preconditions:** Sam's ticket flows through assign → comment → resolve (agents do this).
- **Steps:** 1) As sam: `GET /api/notifications`.
- **Expected:** Notifications exist with kinds `assigned`, `comment` (or `internal_note`), `resolved`; each joins `issue_key`/summary; unread_count matches.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-REQ-27 — Follow someone else's visible ticket? → 404 for non-visible; works on own
- **Priority:** P2 · **Type:** Negative/Positive · **UI/API:** `POST /api/jira/issues/<iid>/follow`
- **Preconditions:** Sam's ticket + agent's ticket.
- **Steps:** 1) Follow own ticket → 200. 2) Follow agent's ticket → 404.
- **Expected:** Own follow idempotent 200; foreign 404.
- **Actual/Notes:** ______
- **Cleanup:** unfollow.

## TC-REQ-28 — Change password (settings)
- **Priority:** P2 · **Type:** Positive/Negative · **UI/API:** `POST /api/settings/password`
- **Preconditions:** Sam session.
- **Steps:** 1) Wrong current → 401. 2) Short new (7 chars) → 400. 3) Correct current + `newpass123` → 200; relogin works; revert.
- **Expected:** 401, 400, 200 respectively; old password invalid after change.
- **Actual/Notes:** ______
- **Cleanup:** revert to `password`.

## TC-REQ-29 — Trello: requester creates own workspace; visibility honored
- **Priority:** P2 · **Type:** Positive · **UI/API:** `POST /api/trello/workspaces`, `GET /api/trello/workspaces`
- **Preconditions:** Sam session.
- **Steps:** 1) Create workspace `Sam's Board` (private). 2) Add agent as viewer member. 3) Agent GETs the workspace → 200 (member). 4) hragent GETs → 404 (non-member).
- **Expected:** Create 200 (owner/admin); member sees it; non-member 404.
- **Actual/Notes:** ______
- **Cleanup:** remove agent member; delete workspace via DB.

---

## Requester suite — cleanup checklist

- Resolve/reopen tickets to a clean `closed` state (TC-REQ-18/19/21).
- Remove uploaded files, reset `csat`, restore `resolved_at` backdates.
- Delete Trello workspace (TC-REQ-29) and remove members.
- Reset DB between suites when full isolation is required.