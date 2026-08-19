# 01 — Admin Role Test Suite

**Actor:** `admin@opsdesk.local` / `password` · **Role:** `admin` · **Team:** none (global)

## Role permissions & expected UI access

- **Permissions:** everything — all tickets, all modules, plus exclusive
  control of teams, categories, users, workflow schemes, custom fields, SLA
  policy deletion, project creation, KB folder deletion, auto-close job,
  and entity-link deletion.
- **UI access:** all nav sections — Dashboard, Queue, Projects/Board/Sprints/
  Goals (`#/jira`), Trello (`#/trello`), KB Vault (`#/kb`), Reports,
  Admin panel (`#/admin` → Teams / Categories / Users / Workflow / Custom
  fields), Settings, Help, Search, Notifications.
- **Not available:** CSAT rating (requester-only action).
- **Key contract:** invisible-or-missing resources return 404; role denials 403;
  every mutation requires `X-CSRF-Token`.

---

## TC-ADM-01 — Login with admin credentials
- **Priority:** P0 · **Type:** Positive · **UI/API:** login view | `POST /api/auth/login`
- **Preconditions:** Fresh DB; CSRF token fetched.
- **Steps:** 1) Open `http://127.0.0.1:5000`. 2) Enter `admin@opsdesk.local` / `password`. 3) Submit.
- **Expected:** 200; response body has `role: "admin"`; SPA shows the app shell and all nav sections; `GET /api/auth/me` returns the admin user.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-ADM-02 — Admin sees every ticket regardless of team
- **Priority:** P0 · **Type:** Positive · **UI/API:** `#/queue` | `GET /api/jira/issues`
- **Preconditions:** At least one IT ticket (created by agent) and one HR ticket (created by hragent).
- **Steps:** 1) Login as admin. 2) Open the queue. 3) Count tickets. 4) `GET /api/jira/issues` with `?team_id=2` (HR).
- **Expected:** Queue lists both IT and HR tickets; API returns HR-team rows (admin bypasses team scoping).
- **Actual/Notes:** ______
- **Cleanup:** delete created tickets via DB or leave for other suites (note in log).

## TC-ADM-03 — Teams: list & create
- **Priority:** P1 · **Type:** Positive · **UI/API:** `#/admin` → Teams | `GET/POST /api/admin/teams`
- **Preconditions:** Logged in as admin.
- **Steps:** 1) Open Admin → Teams. 2) Verify IT/HR/Ops/Finance listed. 3) Create team `QA` via UI or `POST /api/admin/teams {"name":"QA"}`.
- **Expected:** 201/200; `QA` appears in list; `audit_log` contains `team.create` with admin user id.
- **Actual/Notes:** ______
- **Cleanup:** `DELETE /api/admin/teams/<qa_id>`.

## TC-ADM-04 — Teams: duplicate name rejected
- **Priority:** P1 · **Type:** Negative · **UI/API:** `POST /api/admin/teams`
- **Preconditions:** Team `IT` exists (seed).
- **Steps:** 1) `POST /api/admin/teams {"name":"IT"}`.
- **Expected:** 400 with error message; no second IT row.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-ADM-05 — Teams: delete cascades to users/issues (team_id → NULL)
- **Priority:** P1 · **Type:** Edge · **UI/API:** `DELETE /api/admin/teams/<tid>`
- **Preconditions:** Extra team `QA` exists; an agent user assigned to QA; an issue on QA team.
- **Steps:** 1) `DELETE /api/admin/teams/<qa_id>`. 2) Fetch the user and the issue.
- **Expected:** 200; user's `team_id` is NULL; issue's `team_id` is NULL; audit row `team.delete`.
- **Actual/Notes:** ______
- **Cleanup:** recreate QA if needed by other cases.

## TC-ADM-06 — Categories: create with description
- **Priority:** P1 · **Type:** Positive · **UI/API:** `POST /api/admin/categories`
- **Preconditions:** Admin session.
- **Steps:** 1) `POST /api/admin/categories {"name":"Facilities","description":"Offices & buildings"}`.
- **Expected:** 200; category returned; appears in `GET /api/admin/categories` and in `GET /api/meta` active categories.
- **Actual/Notes:** ______
- **Cleanup:** soft-delete via `DELETE /api/admin/categories/<cid>`.

## TC-ADM-07 — Categories: soft delete hides from new tickets
- **Priority:** P1 · **Type:** Negative/Edge · **UI/API:** `DELETE /api/admin/categories/<cid>`
- **Preconditions:** Category `Facilities` exists and is active.
- **Steps:** 1) `DELETE /api/admin/categories/<cid>`. 2) `GET /api/meta` → check active categories. 3) As sam: `POST /api/jira/issues` with `category_id=Facilities`.
- **Expected:** DELETE returns 200; category no longer in active list; requester create returns 400 ("inactive category").
- **Actual/Notes:** ______
- **Cleanup:** none (category already deactivated).

## TC-ADM-08 — Users: create agent user
- **Priority:** P1 · **Type:** Positive · **UI/API:** `#/admin` → Users | `POST /api/admin/users`
- **Preconditions:** Admin session; team IT exists.
- **Steps:** 1) `POST /api/admin/users {"name":"New IT Agent","email":"newagent@opsdesk.local","role":"agent","team_id":1}`.
- **Expected:** 200; user created with default password `password`; appears in `GET /api/admin/users`.
- **Actual/Notes:** ______
- **Cleanup:** `DELETE /api/admin/users/<uid>` (user has no references yet).

## TC-ADM-09 — Users: create with invalid role rejected
- **Priority:** P2 · **Type:** Negative · **UI/API:** `POST /api/admin/users`
- **Preconditions:** Admin session.
- **Steps:** 1) `POST /api/admin/users {"name":"X","email":"x@opsdesk.local","role":"superuser"}`.
- **Expected:** 400; no row inserted.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-ADM-10 — Users: update role, team, and password
- **Priority:** P1 · **Type:** Positive · **UI/API:** `PATCH /api/admin/users/<uid>`
- **Preconditions:** User `newagent@opsdesk.local` exists (role agent, team IT).
- **Steps:** 1) `PATCH /api/admin/users/9 {"role":"manager","team_id":null,"password":"newpass123"}`.
- **Expected:** 200; `GET /api/admin/users` shows updated role/team; login with `newpass123` succeeds, old password fails.
- **Actual/Notes:** ______
- **Cleanup:** delete the user or reset password to `password`.

## TC-ADM-11 — Users: delete user with references → 409
- **Priority:** P1 · **Type:** Negative · **UI/API:** `DELETE /api/admin/users/<uid>`
- **Preconditions:** `sam@opsdesk.local` has at least one issue and one comment.
- **Steps:** 1) `DELETE /api/admin/users/<sam_id>`.
- **Expected:** 409 with explanation (must reassign/archive first); user still present.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-ADM-12 — Users: delete reference-free user succeeds
- **Priority:** P2 · **Type:** Positive · **UI/API:** `DELETE /api/admin/users/<uid>`
- **Preconditions:** `newagent@opsdesk.local` exists with no issues/comments/notes.
- **Steps:** 1) `DELETE /api/admin/users/<uid>`. 2) Login as that user.
- **Expected:** 200; login returns 401 (user gone).
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-ADM-13 — Workflow: add project override allowing requester transition
- **Priority:** P1 · **Type:** Positive · **UI/API:** `#/admin` → Workflow | `POST /api/jira/admin/workflows`
- **Preconditions:** OPS project id known; sam owns a `new` issue in it.
- **Steps:** 1) `POST /api/jira/admin/workflows {"project_id":1,"from_status":"new","to_status":"assigned","allowed_roles":["requester"],"reason_required":false}`. 2) As sam: `POST /api/jira/issues/<id>/status {"to_status":"assigned"}`.
- **Expected:** Upsert returns 200; sam's transition now succeeds (200) although normally staff-only.
- **Actual/Notes:** ______
- **Cleanup:** `DELETE /api/jira/admin/workflows` for that triple; verify sam is blocked again.

## TC-ADM-14 — Workflow: delete override restores default
- **Priority:** P2 · **Type:** Edge · **UI/API:** `DELETE /api/jira/admin/workflows`
- **Preconditions:** Override from TC-ADM-13 exists.
- **Steps:** 1) `DELETE /api/jira/admin/workflows {"project_id":1,"from_status":"new","to_status":"assigned"}`. 2) As sam retry the transition.
- **Expected:** 200 on delete; sam's transition → 400/403 again.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-ADM-15 — Custom fields: create definition (select type)
- **Priority:** P2 · **Type:** Positive · **UI/API:** `POST /api/jira/admin/custom-fields`
- **Preconditions:** Admin session.
- **Steps:** 1) `POST /api/jira/admin/custom-fields {"name":"Region","field_type":"select","options":["EU","US","APAC"],"project_id":null}`.
- **Expected:** 200; definition returned with id; listed in `GET /api/jira/admin/custom-fields`.
- **Actual/Notes:** ______
- **Cleanup:** `DELETE /api/jira/admin/custom-fields/<fid>`.

## TC-ADM-16 — Custom fields: value set/validated on an issue
- **Priority:** P2 · **Type:** Positive · **UI/API:** `PATCH /api/jira/issues/<iid>`
- **Preconditions:** Field `Region` (select) exists; agent-owned issue.
- **Steps:** 1) `PATCH /api/jira/issues/<iid> {"custom_fields":{"<fid>":"EU"}}`. 2) `GET /api/jira/issues/<iid>`.
- **Expected:** 200; issue detail shows `custom_fields` with `EU`; invalid option (`"Mars"`) → 400.
- **Actual/Notes:** ______
- **Cleanup:** delete field def; reset issue custom field.

## TC-ADM-17 — SLA: admin may delete a policy (manager cannot)
- **Priority:** P1 · **Type:** Positive · **UI/API:** `DELETE /api/sla-policies/<pid>`
- **Preconditions:** Policy `Low` exists.
- **Steps:** 1) As admin: `DELETE /api/sla-policies/<low_id>`.
- **Expected:** 200; policy gone from `GET /api/sla-policies`.
- **Actual/Notes:** ______
- **Cleanup:** re-create policy via `POST /api/sla-policies` (admin).

## TC-ADM-18 — Projects: create with valid key, duplicate key → 409
- **Priority:** P1 · **Type:** Positive/Negative · **UI/API:** `POST /api/jira/projects`
- **Preconditions:** Admin session.
- **Steps:** 1) `POST /api/jira/projects {"key":"ENG","name":"Engineering","description":"Dev queue"}` → expect 200. 2) Repeat the same call.
- **Expected:** First call 200 (project with next_seq 1); second call 409 (key already exists). Invalid key `eng!` → 400.
- **Actual/Notes:** ______
- **Cleanup:** note ENG project; issues created under it in later cases can be deleted via DB reset.

## TC-ADM-19 — Projects: admin updates any project
- **Priority:** P2 · **Type:** Positive · **UI/API:** `PATCH /api/jira/projects/<pid>`
- **Preconditions:** ENG project exists.
- **Steps:** 1) `PATCH /api/jira/projects/<pid> {"name":"Engineering Services"}`.
- **Expected:** 200; `GET /api/jira/projects/<pid>` shows the new name.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-ADM-20 — Auto-close: run job closes stale resolved issues
- **Priority:** P1 · **Type:** Positive · **UI/API:** `POST /api/admin/run-autoclose`
- **Preconditions:** A resolved issue whose `resolved_at` is > 72 h old (backdate via DB: `UPDATE jira_issues SET resolved_at=datetime('now','-4 days') WHERE id=?`).
- **Steps:** 1) `POST /api/admin/run-autoclose` (CSRF header).
- **Expected:** 200 `{"closed": 1}`; issue status now `closed`; `entity_activity` has `auto_closed` entry.
- **Actual/Notes:** ______
- **Cleanup:** reopen the issue (admin) to restore state.

## TC-ADM-21 — KB: admin deletes any folder (incl. another's)
- **Priority:** P2 · **Type:** Positive · **UI/API:** `DELETE /api/kb/folders/<fid>`
- **Preconditions:** A folder `Temp Docs` exists (created by agent).
- **Steps:** 1) `DELETE /api/kb/folders/<fid>`. 2) `GET /api/kb/tree`.
- **Expected:** 200; folder gone; child notes re-parented to `General` (never orphaned). Deleting `General` → 400.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-ADM-22 — Entity links: admin deletes any link
- **Priority:** P2 · **Type:** Positive · **UI/API:** `DELETE /api/entity-links/<link_id>`
- **Preconditions:** A link between an issue and a KB note created by an agent.
- **Steps:** 1) As admin: `DELETE /api/entity-links/<link_id>`.
- **Expected:** 200; link gone from `GET /api/entity-links?source_type=jira_issue&source_id=<iid>`.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-ADM-23 — Admin full ticket powers: assign, transition, reopen any ticket
- **Priority:** P1 · **Type:** Positive · **UI/API:** `POST /api/jira/issues/<iid>/assign`, `/status`, `/reopen`
- **Preconditions:** An HR-team `new` issue exists.
- **Steps:** 1) Assign to hragent. 2) Transition `assigned→in_progress→resolved`. 3) Reopen (staff path, no window limit).
- **Expected:** All 200; `reopen_count` increments on reopen; notifications created for requester.
- **Actual/Notes:** ______
- **Cleanup:** resolve/close the issue again.

## TC-ADM-24 — Admin denied CSAT rating (requester-only action)
- **Priority:** P2 · **Type:** Negative · **UI/API:** `POST /api/jira/issues/<iid>/rate`
- **Preconditions:** A resolved issue owned by sam.
- **Steps:** 1) As admin: `POST /api/jira/issues/<iid>/rate {"score":5}`.
- **Expected:** 403 (`csat` untouched; GET issue shows `csat: null`).
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-ADM-25 — Trello: workspace admin can add/remove members, owner protected
- **Priority:** P1 · **Type:** Positive/Negative · **UI/API:** `POST/DELETE /api/trello/workspaces/<ws_id>/members`
- **Preconditions:** Admin-owned workspace `Admin WS`; sam added as member.
- **Steps:** 1) `POST .../members {"user_id":<sam>,"role":"viewer"}`. 2) `DELETE .../members/<sam>`. 3) `DELETE .../members/<admin>` (self/owner).
- **Expected:** Add 200; remove 200; removing the owner → 400. Duplicate add → 409.
- **Actual/Notes:** ______
- **Cleanup:** delete workspace (`DELETE` not exposed → drop via DB or keep for later suites).

## TC-ADM-26 — Admin sees Admin panel; manager does not
- **Priority:** P0 · **Type:** Negative (cross-role) · **UI/API:** `#/admin` | `GET /api/admin/teams`
- **Preconditions:** Both admin and manager sessions available.
- **Steps:** 1) As admin: open `#/admin` → renders Teams/Categories/Users/Workflow. 2) As manager: `GET /api/admin/teams` and open `#/admin`.
- **Expected:** Admin sees the panel; manager gets 403 on API and the SPA hides the Admin nav (falls back to a non-admin view, no error page).
- **Actual/Notes:** ______
- **Cleanup:** none.

---

## Admin suite — cleanup checklist

- Delete any created teams/categories/users (TC-ADM-03..12), custom fields
  (TC-ADM-15/16), SLA policy (TC-ADM-17), workflow overrides (TC-ADM-13/14),
  entity links (TC-ADM-22), Trello members (TC-ADM-25).
- For full isolation, reset the DB (see `00_Test_Data_and_Setup.md` §6) before
  running the next role suite.