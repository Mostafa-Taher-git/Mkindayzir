# 04 — HR Agent Role Test Suite

**Actor:** `hragent@opsdesk.local` / `password` · **Role:** `agent` · **Team:** HR (id 2)

> Same role as the IT agent (`agent`), so the *permission surface* is
> identical — the difference is **team scoping**. These cases focus on
> proving the HR team boundary, HR category routing, and HR-specific SLA.

## Role permissions & expected UI access

- **Permissions:** identical to any agent: own-team (HR) + unassigned
  tickets, all staff ticket ops, KB authoring (own notes), AI assist, own
  dashboard stats, Trello, settings.
- **Not available:** IT team tickets (404), reports (403), admin (403),
  sprint/goal/project/SLA creation (403), CSAT (403).
- **UI access:** same nav as IT agent (Dashboard, Queue, Jira, Trello, KB,
  Settings, Help). No Reports/Admin items.

---

## TC-HR-01 — Login as HR agent
- **Priority:** P0 · **Type:** Positive · **UI/API:** login | `POST /api/auth/login`
- **Preconditions:** Fresh DB; CSRF token fetched.
- **Steps:** 1) Login with `hragent@opsdesk.local` / `password`.
- **Expected:** 200; `role: "agent"`, `team_id: 2`; nav identical to IT agent's.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-HR-02 — Queue scoping: HR team + unassigned only, IT hidden
- **Priority:** P0 · **Type:** Positive · **UI/API:** `#/queue` | `GET /api/jira/issues`
- **Preconditions:** One HR issue (team 2), one IT issue (team 1), one unassigned issue (team NULL).
- **Steps:** 1) `GET /api/jira/issues`.
- **Expected:** HR issue + unassigned issue present; IT issue absent.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-HR-03 — IT issue detail → 404
- **Priority:** P0 · **Type:** Negative · **UI/API:** `GET /api/jira/issues/<it_ref>`
- **Preconditions:** IT issue exists (e.g. `OPS-0001`).
- **Steps:** 1) `GET /api/jira/issues/OPS-0001` as HR agent.
- **Expected:** 404 JSON; no data leak.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-HR-04 — HR category routes tickets to the HR team automatically
- **Priority:** P0 · **Type:** Positive · **UI/API:** `POST /api/jira/issues`
- **Preconditions:** Sam creates a ticket in `HR Request` category via UI.
- **Steps:** 1) Login as sam; create request with category `HR Request`. 2) Login as hragent; open queue.
- **Expected:** Sam's ticket has `team_id = HR (2)` (category default routing); appears in hragent's queue; **not** in IT agent's queue.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-HR-05 — HR agent cannot override routing to another team
- **Priority:** P1 · **Type:** Negative · **UI/API:** `POST /api/jira/issues`
- **Preconditions:** HR agent session.
- **Steps:** 1) `POST /api/jira/issues {"summary":"IT thing","category_id":<Software IT>,"team_id":2}` — force HR team on an IT category.
- **Expected:** Request succeeds but is routed per **category default team (IT)**, or the team override is applied only within valid scope — verify `team_id` in response; if it lands on IT, the issue must NOT appear in the HR queue.
- **Actual/Notes:** ______ (record actual routing behavior — this is a known soft spot; assert response `team_id` equals category default when no explicit staff override applies)
- **Cleanup:** delete/close the issue.

## TC-HR-06 — Claim HR unassigned ticket
- **Priority:** P0 · **Type:** Positive · **UI/API:** `POST /api/jira/issues/<iid>/assign`
- **Preconditions:** An unassigned HR ticket (from TC-HR-04).
- **Steps:** 1) `POST .../assign {"self":true}`.
- **Expected:** 200; assignee = hragent; status `assigned`; requester notified; first-response SLA timestamp recorded.
- **Actual/Notes:** ______
- **Cleanup:** unassign to restore.

## TC-HR-07 — HR-normal SLA policy applies (4 h response / 48 h resolution)
- **Priority:** P1 · **Type:** Positive · **UI/API:** `GET /api/jira/issues/<iid>/sla`
- **Preconditions:** HR ticket with priority `normal` and category `HR Request`.
- **Steps:** 1) `GET .../sla` on a fresh HR ticket.
- **Expected:** `policy_id` matches the `HR - normal` policy; `breach_at` ≈ created_at + 4 h (response) — verify `breach_at` is ~4 h, not 8 h.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-HR-08 — Status change on an IT ticket → 404
- **Priority:** P0 · **Type:** Negative · **UI/API:** `POST /api/jira/issues/<it_iid>/status`
- **Preconditions:** IT issue in `new`.
- **Steps:** 1) As hragent: `POST .../status {"to_status":"assigned"}`.
- **Expected:** 404 (invisible); status unchanged.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-HR-09 — Full HR lifecycle with internal note
- **Priority:** P0 · **Type:** Positive · **UI/API:** `/assign`, `/status`, `/comments`
- **Preconditions:** HR ticket owned by sam.
- **Steps:** 1) Claim. 2) `assigned → in_progress`. 3) Post internal comment "Awaiting payslip". 4) `in_progress → resolved`.
- **Expected:** All 200; requester sees only public comments (internal one hidden); requester notified `resolved`.
- **Actual/Notes:** ______
- **Cleanup:** reopen/close.

## TC-HR-10 — Blocked transition requires reason (same as any agent)
- **Priority:** P1 · **Type:** Negative · **UI/API:** `POST /api/jira/issues/<iid>/status`
- **Preconditions:** HR ticket `in_progress`.
- **Steps:** 1) `to_status: "blocked"` without note → 400. 2) With `{"note":"Legal review"}` → 200.
- **Expected:** 400 then 200; `blocked_reason` stored.
- **Actual/Notes:** ______
- **Cleanup:** `blocked → in_progress`.

## TC-HR-11 — IT agent cannot touch HR tickets either (bidirectional scoping)
- **Priority:** P0 · **Type:** Negative (cross-role) · **UI/API:** `POST /api/jira/issues/<hr_iid>/assign`
- **Preconditions:** HR ticket from TC-HR-06 (or any HR ticket).
- **Steps:** 1) Login as agent@opsdesk.local; attempt to claim the HR ticket.
- **Expected:** 404; ticket remains unassigned to the IT agent.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-HR-12 — Dashboard personal stats scoped to HR work
- **Priority:** P1 · **Type:** Positive · **UI/API:** `GET /api/dashboard`
- **Preconditions:** One HR ticket assigned to hragent (in_progress).
- **Steps:** 1) `GET /api/dashboard`.
- **Expected:** 200; `my_open >= 1`; org counts include HR + IT totals (global numbers, unlike `my_*`).
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-HR-13 — Reports & admin → 403 (role gate, same as IT agent)
- **Priority:** P1 · **Type:** Negative · **UI/API:** `GET /api/reports/summary`, `GET /api/admin/teams`, `GET /api/kb/analytics`
- **Preconditions:** HR agent session.
- **Steps:** 1) Call each endpoint.
- **Expected:** 403 on all three.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-HR-14 — KB: HR agent authors HR notes, publishes own
- **Priority:** P1 · **Type:** Positive · **UI/API:** `POST /api/kb/notes`, `POST /api/kb/notes/<nid>/publish`
- **Preconditions:** HR agent session; folder `General`.
- **Steps:** 1) Create note "HR Leave Policy 2026" in HR folder. 2) Publish.
- **Expected:** 200/200; status `published`; other staff receive `note_published`.
- **Actual/Notes:** ______
- **Cleanup:** delete note.

## TC-HR-15 — KB: cannot edit IT agent's note (author-only for agents)
- **Priority:** P1 · **Type:** Negative · **UI/API:** `PATCH /api/kb/notes/<it_note_id>`
- **Preconditions:** IT agent's note "VPN Setup Guide" exists.
- **Steps:** 1) As hragent: `PATCH /api/kb/notes/<id> {"content":"tampered"}`.
- **Expected:** 403; content unchanged.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-HR-16 — Bulk action on HR scope; IT tickets skipped
- **Priority:** P1 · **Type:** Positive · **UI/API:** `POST /api/jira/issues/bulk`
- **Preconditions:** One HR `new` + one IT `new` issue.
- **Steps:** 1) `POST .../bulk {"issue_ids":[hr, it], "action":"assign", "assignee_id":<hragent>}`.
- **Expected:** `processed: 1`; `skipped` includes the IT id; HR issue assigned to hragent; IT untouched.
- **Actual/Notes:** ______
- **Cleanup:** unassign HR issue.

## TC-HR-17 — Follow/unfollow an HR ticket and get follower notifications
- **Priority:** P2 · **Type:** Positive · **UI/API:** `POST/DELETE /api/jira/issues/<iid>/follow`, `GET /api/notifications`
- **Preconditions:** HR ticket owned by sam.
- **Steps:** 1) hragent follows. 2) sam posts a public comment. 3) `GET /api/notifications` as hragent. 4) Unfollow; sam comments again.
- **Expected:** Follow idempotent (repeat → 200); comment triggers `comment` notification for follower; after unfollow, no new notification on next comment.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-HR-18 — Attachments on HR tickets (upload + requester download)
- **Priority:** P2 · **Type:** Positive · **UI/API:** `POST /api/jira/issues/<iid>/attachments`, `GET .../attachments/<aid>`
- **Preconditions:** HR ticket.
- **Steps:** 1) hragent uploads `payslip.pdf`. 2) sam downloads it.
- **Expected:** Upload 200; sam's download 200 with correct bytes; IT agent's download → 404.
- **Actual/Notes:** ______
- **Cleanup:** remove files from `data/uploads/`.

## TC-HR-19 — Reopen a closed HR ticket (staff, no window)
- **Priority:** P2 · **Type:** Positive · **UI/API:** `POST /api/jira/issues/<iid>/reopen`
- **Preconditions:** Closed HR ticket.
- **Steps:** 1) `POST .../reopen`.
- **Expected:** 200; status `reopened`; `reopen_count + 1`.
- **Actual/Notes:** ______
- **Cleanup:** close again.

## TC-HR-20 — AI endpoints fail-closed and scoped (no key → 503; IT ticket → 404)
- **Priority:** P2 · **Type:** Negative · **UI/API:** `GET /api/ai/suggest-reply/<iid>`
- **Preconditions:** No provider key; HR + IT issues exist.
- **Steps:** 1) Call on HR issue → 503. 2) Call on IT issue → 404 (scoping checked before AI availability).
- **Expected:** 503 on HR (visible but AI disabled); 404 on IT (invisible).
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-HR-21 — Trello: HR agent creates private workspace and board
- **Priority:** P2 · **Type:** Positive · **UI/API:** `POST /api/trello/workspaces`, `POST /api/trello/boards`, `POST /api/trello/boards/<bid>/lists`, `POST /api/trello/cards`
- **Preconditions:** HR agent session.
- **Steps:** 1) Create workspace `HR Ops` (visibility `private`). 2) Create board + list + card.
- **Expected:** All 200; workspace owner = hragent with role `admin`; card appears on board; other users cannot see the private workspace (GET → 404).
- **Actual/Notes:** ______
- **Cleanup:** delete board + workspace via DB.

## TC-HR-22 — AI chat: conversation isolation (agent sees only own chats)
- **Priority:** P2 · **Type:** Positive · **UI/API:** `GET /api/ai/conversations`, `GET /api/ai/conversations/<cid>/messages`
- **Preconditions:** HR agent has one conversation; IT agent has one conversation (created via API with a saved key or directly in DB).
- **Steps:** 1) `GET /api/ai/conversations` as hragent. 2) Try `GET /api/ai/conversations/<it_cid>/messages`.
- **Expected:** Own conversations listed; other user's conversation → 404/403; no leakage.
- **Actual/Notes:** ______
- **Cleanup:** delete conversations via DB.

## TC-HR-23 — Notifications: mark read and read-all (own only)
- **Priority:** P2 · **Type:** Positive/Negative · **UI/API:** `POST /api/notifications/<nid>/read`, `POST /api/notifications/read-all`
- **Preconditions:** ≥2 unread notifications for hragent (from TC-HR-06/09); one unread for agent.
- **Steps:** 1) Mark one read. 2) `GET /api/notifications` → unread_count decremented. 3) Try marking agent's notification id → 404. 4) Read-all → unread_count 0.
- **Expected:** Read 200; foreign notification 404; read-all 200 with all read.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-HR-24 — Password change for HR agent (settings)
- **Priority:** P2 · **Type:** Positive · **UI/API:** `POST /api/settings/password`
- **Preconditions:** HR agent session.
- **Steps:** 1) `POST /api/settings/password {"current":"password","new":"hrnewpass123"}`. 2) Logout, login with new password. 3) Revert.
- **Expected:** 200; new password works; old fails. Wrong current password → 401.
- **Actual/Notes:** ______
- **Cleanup:** revert to `password`.

---

## HR agent suite — cleanup checklist

- Unassign claimed tickets, un-block blocked ones, close reopened ones.
- Delete created notes/boards/workspaces; remove uploaded files.
- Reset DB between suites when full isolation is required.