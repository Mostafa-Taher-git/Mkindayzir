# 02 — Manager Role Test Suite

**Actor:** `manager@opsdesk.local` / `password` · **Role:** `manager` · **Team:** none (global)

## Role permissions & expected UI access

- **Permissions:** full ticket visibility (all teams), all staff ticket
  operations (assign/transition/reopen/priority/bulk/internal comments),
  reports & CSV export, SLA policy create/edit (not delete), sprints &
  goals, KB analytics, dashboard, Trello (as member/admin of own
  workspaces), entity links (create/delete own).
- **Not available:** admin panel (teams/categories/users/workflow/custom
  fields → 403), project create (admin only), SLA policy delete (admin
  only), CSAT rating, requester-only flows.
- **UI access:** Dashboard, Queue, `#/jira` (Projects/Backlog/Board/Sprints/
  Goals), `#/trello`, `#/kb`, **Reports** (Summary/Workload/SLA/Trend/Export/
  Action Center), Settings, Help, Search, Notifications.
- **No Admin nav item** is rendered; direct API calls return 403.

---

## TC-MGR-01 — Login as manager
- **Priority:** P0 · **Type:** Positive · **UI/API:** login | `POST /api/auth/login`
- **Preconditions:** Fresh DB; CSRF token fetched.
- **Steps:** 1) Login with `manager@opsdesk.local` / `password`.
- **Expected:** 200; `role: "manager"`; Reports section visible in nav; no Admin item.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-MGR-02 — Manager sees all teams' tickets
- **Priority:** P0 · **Type:** Positive · **UI/API:** `#/queue` | `GET /api/jira/issues`
- **Preconditions:** One IT issue and one HR issue exist.
- **Steps:** 1) `GET /api/jira/issues?team_id=2` (HR) and `?team_id=1` (IT). 2) Open queue and apply team filter.
- **Expected:** Both team queries return rows; queue lists IT and HR tickets.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-MGR-03 — Dashboard returns full org stats
- **Priority:** P0 · **Type:** Positive · **UI/API:** `#/dashboard` | `GET /api/dashboard`
- **Preconditions:** Mixed-status issues exist.
- **Steps:** 1) `GET /api/dashboard`.
- **Expected:** 200; payload has per-status counts, unassigned, urgent, blocked, resolved, 7-day avg resolution, aged issues — **not** the agent-scoped `my_*` keys.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-MGR-04 — Reports: summary endpoint
- **Priority:** P0 · **Type:** Positive · **UI/API:** Reports tab | `GET /api/reports/summary?days=30`
- **Preconditions:** Several issues with varied statuses/SLA outcomes.
- **Steps:** 1) Open Reports → Summary. 2) `GET /api/reports/summary?days=30`.
- **Expected:** 200; JSON contains status counts, open/backlog, SLA attainment %, avg/median/p90 resolution hours, avg CSAT + 1–5 distribution.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-MGR-05 — Reports: workload per agent
- **Priority:** P1 · **Type:** Positive · **UI/API:** `GET /api/reports/workload?days=30`
- **Preconditions:** Issues assigned to agent@opsdesk.local and hragent@opsdesk.local.
- **Steps:** 1) `GET /api/reports/workload`.
- **Expected:** 200; both agents appear with open/resolved counts and avg resolution hours.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-MGR-06 — Reports: SLA attainment
- **Priority:** P1 · **Type:** Positive · **UI/API:** `GET /api/reports/sla?days=30`
- **Preconditions:** ≥1 resolved issue that met SLA and ≥1 that breached (can backdate `breach_at`/`breached` via DB).
- **Steps:** 1) `GET /api/reports/sla`.
- **Expected:** 200; `met`, `missed`, `pending` counts and attainment % consistent with seeded data.
- **Actual/Notes:** ______
- **Cleanup:** restore backdated rows.

## TC-MGR-07 — Reports: trend series
- **Priority:** P2 · **Type:** Positive · **UI/API:** `GET /api/reports/trend?days=7`
- **Preconditions:** Issues created/resolved on known dates (backdate 2 rows if needed).
- **Steps:** 1) `GET /api/reports/trend?days=7`.
- **Expected:** 200; per-day `created`/`resolved` series; days outside window absent.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-MGR-08 — Reports: CSV export is CSV-injection safe
- **Priority:** P1 · **Type:** Edge · **UI/API:** `GET /api/reports/export.csv`
- **Preconditions:** An issue whose summary begins with `=HYPERLINK(...)` or `+cmd|...` (create via API/DB).
- **Steps:** 1) `GET /api/reports/export.csv`. 2) Inspect the row's first cell.
- **Expected:** 200, `Content-Type: text/csv`; dangerous leading chars are prefixed with `'` (e.g. `'=HYPERLINK`); opening in Excel does not execute formulas.
- **Actual/Notes:** ______
- **Cleanup:** delete the formula-titled issue.

## TC-MGR-09 — Reports: agents/requesters get 403
- **Priority:** P0 · **Type:** Negative · **UI/API:** `GET /api/reports/summary`
- **Preconditions:** Sessions for agent@opsdesk.local and sam@opsdesk.local.
- **Steps:** 1) As agent: `GET /api/reports/summary`. 2) As sam: `GET /api/reports/summary`.
- **Expected:** Both 403 (`{"error":"Forbidden"}`); SPA hides Reports nav for both.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-MGR-10 — Action center surfaces unassigned/breached/stale
- **Priority:** P1 · **Type:** Positive · **UI/API:** `#/dashboard` → Action Center | `GET /api/dashboard/action-center`
- **Preconditions:** One unassigned `new` issue; one breached open issue (backdate `issue_sla.breach_at`).
- **Steps:** 1) `GET /api/dashboard/action-center`.
- **Expected:** 200; lists the unassigned issue, the breached issue, and any stale (assigned/in_progress with no update in 24 h) issues.
- **Actual/Notes:** ______
- **Cleanup:** restore backdated rows.

## TC-MGR-11 — KB analytics visible to manager
- **Priority:** P1 · **Type:** Positive · **UI/API:** `#/kb` → Analytics | `GET /api/kb/analytics`
- **Preconditions:** ≥1 published note with views/feedback.
- **Steps:** 1) `GET /api/kb/analytics`.
- **Expected:** 200; totals, views, helpful/no, top-5 notes, tag counts.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-MGR-12 — SLA policy: create & edit (manager allowed)
- **Priority:** P1 · **Type:** Positive · **UI/API:** `POST /api/sla-policies`, `PATCH /api/sla-policies/<pid>`
- **Preconditions:** Manager session.
- **Steps:** 1) `POST /api/sla-policies {"name":"Dev Urgent","priority":"urgent","response_hours":1,"resolution_hours":6}`. 2) `PATCH` it to `resolution_hours: 4`.
- **Expected:** 200 both; `GET /api/sla-policies` shows updated policy; audit rows written.
- **Actual/Notes:** ______
- **Cleanup:** delete via admin session (manager cannot) or DB.

## TC-MGR-13 — SLA policy: delete → 403 for manager
- **Priority:** P1 · **Type:** Negative · **UI/API:** `DELETE /api/sla-policies/<pid>`
- **Preconditions:** Policy `Dev Urgent` exists.
- **Steps:** 1) As manager: `DELETE /api/sla-policies/<pid>`.
- **Expected:** 403; policy still listed.
- **Actual/Notes:** ______
- **Cleanup:** delete via admin/DB.

## TC-MGR-14 — SLA policy: invalid hours rejected
- **Priority:** P2 · **Type:** Negative · **UI/API:** `POST /api/sla-policies`
- **Preconditions:** Manager session.
- **Steps:** 1) `POST /api/sla-policies {"name":"Bad","priority":"normal","response_hours":0,"resolution_hours":-5}`.
- **Expected:** 400; no row created.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-MGR-15 — Sprints: create → start → complete (velocity calc)
- **Priority:** P1 · **Type:** Positive · **UI/API:** `#/jira` → Sprints | `POST /api/jira/sprints`, `/start`, `/complete`
- **Preconditions:** OPS project; an `in_progress` story with 5 story points; a `resolved` story with 3 points.
- **Steps:** 1) Create sprint (status `future`). 2) Start it. 3) Move the stories into the sprint (`PATCH /api/jira/issues/<iid> {"sprint_id":<sid>}`). 4) Resolve the 5-pointer. 5) Complete the sprint.
- **Expected:** create/start/complete all 200; after complete: `velocity = 5` (only done points), unresolved issues moved back to backlog (`sprint_id = NULL`), sprint status `closed`.
- **Actual/Notes:** ______
- **Cleanup:** reset sprint + issues (DB).

## TC-MGR-16 — Sprints: second active sprint per project → 409
- **Priority:** P2 · **Type:** Negative · **UI/API:** `POST /api/jira/sprints/<sid>/start`
- **Preconditions:** One active sprint on OPS (from TC-MGR-15).
- **Steps:** 1) Create second sprint. 2) Try to start it.
- **Expected:** 409; second sprint stays `future`.
- **Actual/Notes:** ______
- **Cleanup:** complete/delete sprints via DB.

## TC-MGR-17 — Sprints: start a non-future sprint → 400
- **Priority:** P3 · **Type:** Negative · **UI/API:** `POST /api/jira/sprints/<sid>/start`
- **Preconditions:** A `closed` sprint exists.
- **Steps:** 1) `POST /api/jira/sprints/<sid>/start` on the closed sprint.
- **Expected:** 400.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-MGR-18 — Goals: create, update own, progress calculation
- **Priority:** P1 · **Type:** Positive · **UI/API:** `#/jira` → Goals | `POST /api/jira/goals`, `PATCH /api/jira/goals/<gid>`, `GET .../progress`
- **Preconditions:** Two issues (2 pts resolved, 8 pts open) linked to the goal.
- **Steps:** 1) `POST /api/jira/goals {"title":"Q3 Productivity","quarter":"2026-Q3","status":"on_track","owner_id":<manager>}`. 2) Create issues with `goal_id`. 3) `GET /api/jira/goals/<gid>/progress`.
- **Expected:** create 200; progress = 20 (2/10 × 100); PATCH status to `at_risk` → 200 and goal owner gets a `goal_update` notification.
- **Actual/Notes:** ______
- **Cleanup:** delete goal + issues (DB).

## TC-MGR-19 — Goals: manager cannot update a goal owned by someone else
- **Priority:** P1 · **Type:** Negative · **UI/API:** `PATCH /api/jira/goals/<gid>`
- **Preconditions:** A goal owned by admin exists.
- **Steps:** 1) As manager: `PATCH /api/jira/goals/<gid> {"status":"behind"}`.
- **Expected:** 403 (only admin or owner).
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-MGR-20 — Goals: invalid quarter format rejected
- **Priority:** P3 · **Type:** Negative · **UI/API:** `POST /api/jira/goals`
- **Preconditions:** Manager session.
- **Steps:** 1) `POST /api/jira/goals {"title":"Bad","quarter":"2026-Q9","status":"on_track","owner_id":1}`.
- **Expected:** 400.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-MGR-21 — Admin panel denied: teams/users/categories/workflow/custom fields
- **Priority:** P0 · **Type:** Negative · **UI/API:** all `/api/admin/*` + `/api/jira/admin/*`
- **Preconditions:** Manager session.
- **Steps:** 1) Call each: `GET /api/admin/teams`, `GET /api/admin/users`, `GET /api/admin/categories`, `GET /api/jira/admin/workflows`, `GET /api/jira/admin/custom-fields`.
- **Expected:** 403 for every call; SPA never shows the Admin nav.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-MGR-22 — Project create → 403 (admin only)
- **Priority:** P1 · **Type:** Negative · **UI/API:** `POST /api/jira/projects`
- **Preconditions:** Manager session.
- **Steps:** 1) `POST /api/jira/projects {"key":"DEV","name":"Dev"}`.
- **Expected:** 403; no project created.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-MGR-23 — Project update allowed when manager is project lead
- **Priority:** P2 · **Type:** Positive · **UI/API:** `PATCH /api/jira/projects/<pid>`
- **Preconditions:** A project with `lead_id = manager` (update OPS lead via DB).
- **Steps:** 1) `PATCH /api/jira/projects/<pid> {"description":"Managed by Ops"}`. 2) `PATCH` on a project the manager does not lead.
- **Expected:** Owned project → 200; other project → 403.
- **Actual/Notes:** ______
- **Cleanup:** restore lead_id.

## TC-MGR-24 — Full ticket ops: assign/transition/blocked-reason/reopen any team
- **Priority:** P0 · **Type:** Positive · **UI/API:** `/assign`, `/status`, `/reopen` on an HR issue
- **Preconditions:** An HR `new` issue exists.
- **Steps:** 1) Assign to hragent. 2) `assigned→in_progress`. 3) `in_progress→blocked` **without** reason → expect 400; retry with reason → 200. 4) `blocked→in_progress→resolved`. 5) Reopen (staff, no window).
- **Expected:** Assign 200; transition without reason 400; with reason 200; reopen 200 with `reopen_count = 1`; requester notified on resolve.
- **Actual/Notes:** ______
- **Cleanup:** resolve/close the issue again.

## TC-MGR-25 — Bulk actions: bulk close mixed team selection
- **Priority:** P1 · **Type:** Positive · **UI/API:** `POST /api/jira/issues/bulk`
- **Preconditions:** 3 issues: one IT `assigned`, one HR `assigned`, one IT `new`.
- **Steps:** 1) `POST /api/jira/issues/bulk {"issue_ids":[...],"action":"status","to_status":"closed"}`.
- **Expected:** `processed: 3` (manager bypasses team scoping); statuses now `closed`; skipped array empty.
- **Actual/Notes:** ______
- **Cleanup:** reopen issues.

## TC-MGR-26 — CSAT rating → 403 (requester-only)
- **Priority:** P2 · **Type:** Negative · **UI/API:** `POST /api/jira/issues/<iid>/rate`
- **Preconditions:** A resolved issue.
- **Steps:** 1) As manager: `POST /api/jira/issues/<iid>/rate {"score":5}`.
- **Expected:** 403.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-MGR-27 — Trello: workspace admin (add member, board create, viewer read-only enforced)
- **Priority:** P2 · **Type:** Positive/Negative · **UI/API:** `/api/trello/*`
- **Preconditions:** Manager-owned workspace with sam as `viewer`.
- **Steps:** 1) Create board + list + card as manager. 2) As sam (viewer): `POST /api/trello/cards` → expect 403; `GET board` → 200. 3) As manager: `POST .../members {"user_id":<sam>,"role":"member"}` → sam can now create cards.
- **Expected:** Manager ops 200; viewer write 403; viewer read 200; role upgrade makes writes succeed.
- **Actual/Notes:** ______
- **Cleanup:** remove sam from workspace; delete board/workspace via DB.

---

## Manager suite — cleanup checklist

- Close/reopen any tickets left mid-flow (TC-MGR-24/25).
- Remove test SLA policies (admin/DB), sprints, goals, Trello test data (DB).
- Reset the DB between suites when full isolation is required
  (see `00_Test_Data_and_Setup.md` §6).