# 03 — IT Agent Role Test Suite

**Actor:** `agent@opsdesk.local` / `password` · **Role:** `agent` · **Team:** IT (id 1)

## Role permissions & expected UI access

- **Permissions:** ticket operations on **own team (IT) + unassigned
  (`team_id IS NULL`)** tickets; assign/claim, status transitions, priority,
  internal comments, attachments, bulk actions, KB authoring (**own notes
  only**), AI assist (needs own OpenRouter key), dashboard with personal
  stats, Trello, notifications, settings.
- **Not available:** tickets of other teams (404), reports (403), admin panel
  (403), sprints/goals/projects creation (403), SLA policy management (403),
  KB analytics (403), CSAT rating.
- **UI access:** Dashboard (agent stats), Queue (`#/queue`), `#/jira`,
  `#/trello`, `#/kb`, Settings, Help, Search, Notifications. No Reports/Admin.

---

## TC-AGT-01 — Login as IT agent
- **Priority:** P0 · **Type:** Positive · **UI/API:** login | `POST /api/auth/login`
- **Preconditions:** Fresh DB; CSRF token fetched.
- **Steps:** 1) Login with `agent@opsdesk.local` / `password`.
- **Expected:** 200; `role: "agent"`, `team_id: 1`; nav shows Queue/Dashboard; no Reports or Admin items.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-AGT-02 — Queue scoping: own team + unassigned only
- **Priority:** P0 · **Type:** Positive · **UI/API:** `#/queue` | `GET /api/jira/issues`
- **Preconditions:** One IT issue (team_id 1), one HR issue (team_id 2), one unassigned issue (team_id NULL).
- **Steps:** 1) `GET /api/jira/issues` (no filters).
- **Expected:** Response contains the IT issue and the unassigned issue; the HR issue is absent.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-AGT-03 — HR team ticket is invisible (404, not 403)
- **Priority:** P0 · **Type:** Negative · **UI/API:** `GET /api/jira/issues/<ref>`
- **Preconditions:** An HR issue `OPS-0002` exists.
- **Steps:** 1) `GET /api/jira/issues/OPS-0002` as IT agent.
- **Expected:** 404 with JSON error — never 403, never the HR issue payload (anti-enumeration).
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-AGT-04 — Dashboard shows personal agent stats
- **Priority:** P0 · **Type:** Positive · **UI/API:** `#/dashboard` | `GET /api/dashboard`
- **Preconditions:** An IT issue assigned to the agent (`in_progress`), one resolved today.
- **Steps:** 1) `GET /api/dashboard`.
- **Expected:** 200; org-level counts **plus** `my_open`, `my_assigned_today`, `my_urgent`, `my_blocked`, `my_resolved_today`, `my_rated_tickets`, `my_avg_response_hours`, `my_avg_resolution_hours`.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-AGT-05 — Reports → 403
- **Priority:** P0 · **Type:** Negative · **UI/API:** `GET /api/reports/summary`, `/workload`, `/sla`, `/trend`, `GET /api/reports/export.csv`
- **Preconditions:** Agent session.
- **Steps:** 1) Call each reports endpoint.
- **Expected:** 403 on all five.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-AGT-06 — Admin panel → 403
- **Priority:** P0 · **Type:** Negative · **UI/API:** `GET /api/admin/teams`, `/users`, `/categories`
- **Preconditions:** Agent session.
- **Steps:** 1) Call each admin endpoint.
- **Expected:** 403 on all; `#/admin` route shows no admin content.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-AGT-07 — Create issue as staff (with team/requester/project control)
- **Priority:** P1 · **Type:** Positive · **UI/API:** `POST /api/jira/issues`
- **Preconditions:** Agent session; OPS project id 1; sam's user id known.
- **Steps:** 1) `POST /api/jira/issues {"summary":"VPN broken","description":"Cannot connect","category_id":<Software>,"priority":"high","requester_id":<sam>,"team_id":1,"project_id":1}`.
- **Expected:** 200; returned issue has auto key `OPS-000N`, status `new`, team IT, requester sam; SLA policy `High` (2/24) attached (`GET .../sla` shows `policy_id` of High).
- **Actual/Notes:** ______
- **Cleanup:** leave open or close; record key.

## TC-AGT-08 — Create issue: validation caps (subject/description/priority)
- **Priority:** P1 · **Type:** Negative · **UI/API:** `POST /api/jira/issues`
- **Preconditions:** Agent session.
- **Steps:** 1) Empty subject → expect 400. 2) Subject of 101 chars → 400. 3) Description of 5001 chars → 400. 4) `priority: "critical"` → 400.
- **Expected:** All four calls return 400 with JSON error; no issues created.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-AGT-09 — Claim an unassigned ticket (assign self)
- **Priority:** P0 · **Type:** Positive · **UI/API:** `POST /api/jira/issues/<iid>/assign`
- **Preconditions:** An unassigned IT `new` issue exists.
- **Steps:** 1) `POST .../assign {"self":true}`.
- **Expected:** 200; `assignee_id = agent`, status `assigned`; requester notified (`assigned`); first-response SLA recorded (`GET .../sla` shows `first_response_at` set); agent auto-follows issue.
- **Actual/Notes:** ______
- **Cleanup:** unassign (`{"unassign":true}`) to restore.

## TC-AGT-10 — Assign to another agent, then unassign resets to new
- **Priority:** P1 · **Type:** Positive · **UI/API:** `POST /api/jira/issues/<iid>/assign`
- **Preconditions:** Issue assigned to the IT agent.
- **Steps:** 1) `POST .../assign {"assignee_id":<hragent_id>}` (cross-team) → expect 400/404 (agent may only assign within visible scope — HR agent not in IT team). 2) `POST .../assign {"assignee_id":<other IT user>}` → 200. 3) `POST .../assign {"unassign":true}`.
- **Expected:** Cross-team assign fails; same-team assign 200; unassign 200 with status back to `new`, `assignee_id` NULL.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-AGT-11 — Full happy-path lifecycle new → assigned → in_progress → resolved → closed
- **Priority:** P0 · **Type:** Positive · **UI/API:** `POST /api/jira/issues/<iid>/status`
- **Preconditions:** An IT issue owned by sam, status `new`.
- **Steps:** 1) Transition to `assigned`. 2) To `in_progress`. 3) To `resolved`. 4) To `closed`.
- **Expected:** All 200; after resolve `resolved_at` set; after close `closed_at` set; `entity_activity` rows for each transition; requester notified on resolve.
- **Actual/Notes:** ______
- **Cleanup:** none (closed state is fine).

## TC-AGT-12 — Illegal transition new → resolved → 400
- **Priority:** P0 · **Type:** Negative · **UI/API:** `POST /api/jira/issues/<iid>/status`
- **Preconditions:** IT issue in `new`.
- **Steps:** 1) `POST .../status {"to_status":"resolved"}`.
- **Expected:** 400 `"Cannot move from new to resolved"`; status unchanged.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-AGT-13 — Blocked requires reason
- **Priority:** P0 · **Type:** Negative → Positive · **UI/API:** `POST /api/jira/issues/<iid>/status`
- **Preconditions:** IT issue in `in_progress` (or `assigned`).
- **Steps:** 1) `POST .../status {"to_status":"blocked"}` (no reason) → expect 400. 2) Retry with `{"to_status":"blocked","note":"Waiting on vendor"}`.
- **Expected:** First 400 ("reason required"); second 200 with `blocked_reason` saved; requester notified `blocked`.
- **Actual/Notes:** ______
- **Cleanup:** `blocked → in_progress` to restore.

## TC-AGT-14 — Resolve from in_progress records SLA evaluation
- **Priority:** P1 · **Type:** Positive · **UI/API:** `POST /api/jira/issues/<iid>/status`
- **Preconditions:** IT issue `in_progress` with `issue_sla` row (breach_at in future).
- **Steps:** 1) Transition to `resolved`. 2) `GET /api/jira/issues/<iid>/sla`.
- **Expected:** 200; `resolution_met = 1`, `breached = 0`, `first_response_at` set (if a comment/assign happened first).
- **Actual/Notes:** ______
- **Cleanup:** reopen via `/reopen`.

## TC-AGT-15 — Priority change re-picks SLA policy
- **Priority:** P1 · **Type:** Positive · **UI/API:** `POST /api/jira/issues/<iid>/priority`
- **Preconditions:** An IT `new` issue with Standard SLA (normal).
- **Steps:** 1) `POST .../priority {"priority":"urgent"}`. 2) `GET .../sla`.
- **Expected:** 200; `issue_sla.policy_id` now points to Urgent (1/8); `breach_at` rebased to now+1 h; requester notified `priority`.
- **Actual/Notes:** ______
- **Cleanup:** set priority back to normal.

## TC-AGT-16 — Internal comment visible to staff only
- **Priority:** P0 · **Type:** Positive · **UI/API:** `POST /api/jira/issues/<iid>/comments`
- **Preconditions:** IT issue; agent + sam sessions.
- **Steps:** 1) Agent posts comment `{"body":"Confidential","visibility":"internal"}`. 2) As sam: `GET /api/jira/issues/<iid>`.
- **Expected:** Agent's POST 200; sam's detail payload does **not** contain the internal comment; agent's detail does. Requester gets `internal_note` notification.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-AGT-17 — @mention notifies the named user
- **Priority:** P2 · **Type:** Positive · **UI/API:** `POST /api/jira/issues/<iid>/comments`
- **Preconditions:** IT issue; hragent exists.
- **Steps:** 1) Agent posts public comment `"Hi @HR Agent please check"`. 2) Login as hragent → `GET /api/notifications`.
- **Expected:** 200; hragent has a `mention` notification referencing the comment.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-AGT-18 — Attachments: upload valid, download, invalid extension, oversized
- **Priority:** P1 · **Type:** Positive/Negative · **UI/API:** `POST/GET /api/jira/issues/<iid>/attachments`
- **Preconditions:** IT issue; local fixture files.
- **Steps:** 1) Upload `notes.pdf` (multipart `file`) → 200 with metadata. 2) `GET .../attachments/<aid>` → 200 bytes match. 3) Upload `evil.exe` → 400. 4) Upload `fake.pdf` containing PNG magic bytes → 400. 5) Upload a >10 MB payload → 413/400.
- **Expected:** Valid upload/download round-trips; all invalid cases rejected with JSON errors and no rows in `entity_attachments`.
- **Actual/Notes:** ______
- **Cleanup:** delete uploaded files from `data/uploads/<iid>/`.

## TC-AGT-19 — Bulk status update with mixed-scope selection
- **Priority:** P1 · **Type:** Positive · **UI/API:** `POST /api/jira/issues/bulk`
- **Preconditions:** One IT `new` + one HR `new` issue.
- **Steps:** 1) `POST /api/jira/issues/bulk {"issue_ids":[<it_id>,<hr_id>],"action":"status","to_status":"assigned"}`.
- **Expected:** 200; `processed: 1`; `skipped` contains the HR id with an error (not visible); IT issue assigned; HR unchanged.
- **Actual/Notes:** ______
- **Cleanup:** unassign IT issue.

## TC-AGT-20 — Bulk with >200 ids → 400
- **Priority:** P3 · **Type:** Negative · **UI/API:** `POST /api/jira/issues/bulk`
- **Preconditions:** 201+ issues exist (seed via DB loop if needed).
- **Steps:** 1) Send bulk with 201 issue ids.
- **Expected:** 400 (cap 200).
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-AGT-21 — KB: create draft note, publish own note
- **Priority:** P1 · **Type:** Positive · **UI/API:** `POST /api/kb/notes`, `POST /api/kb/notes/<nid>/publish`
- **Preconditions:** Agent session; folder `General`.
- **Steps:** 1) `POST /api/kb/notes {"title":"VPN Setup Guide","content":"Step 1...","folder_id":1}`. 2) `POST .../notes/<nid>/publish`.
- **Expected:** Create 200 (status `draft`); publish 200 (status `published`); all staff receive `note_published` notification; sam can now read it.
- **Actual/Notes:** ______
- **Cleanup:** delete note (author can).

## TC-AGT-22 — KB: agent cannot edit/publish another agent's note
- **Priority:** P1 · **Type:** Negative · **UI/API:** `PATCH /api/kb/notes/<nid>`, `POST .../publish`
- **Preconditions:** hragent authored a note (`HR Leave Policy`).
- **Steps:** 1) As IT agent: `PATCH /api/kb/notes/<hr_note_id> {"content":"hacked"}`. 2) `POST .../notes/<hr_note_id>/publish`.
- **Expected:** 403 on both (author-only for agents); note unchanged.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-AGT-23 — KB: version history + diff on own note
- **Priority:** P2 · **Type:** Positive · **UI/API:** `GET /api/kb/notes/<nid>/versions`, `GET .../versions/<vid>/diff`
- **Preconditions:** Agent's own published note.
- **Steps:** 1) PATCH content twice (each save creates a version). 2) `GET .../versions` → 2+ rows. 3) `GET .../versions/<old_vid>/diff`.
- **Expected:** Versions listed oldest→newest; diff returns added/removed line arrays (LCS).
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-AGT-24 — Link KB note to issue; suggested notes ranked
- **Priority:** P1 · **Type:** Positive · **UI/API:** `POST /api/jira/issues/<iid>/knowledge`, `GET .../knowledge/suggested`
- **Preconditions:** Published note "VPN Setup Guide"; IT issue about "VPN".
- **Steps:** 1) `GET /api/jira/issues/<iid>/knowledge/suggested` → note appears in top 5. 2) `POST .../knowledge {"note_id":<nid>}`. 3) `GET .../knowledge` → linked. 4) Duplicate link → 409.
- **Expected:** Suggested ranking includes the note; link 200; duplicate 409; linked note drops out of suggestions.
- **Actual/Notes:** ______
- **Cleanup:** `DELETE /api/jira/issues/<iid>/knowledge/<nid>`.

## TC-AGT-25 — Promote issue → draft KB note (auto-linked)
- **Priority:** P2 · **Type:** Positive · **UI/API:** `POST /api/jira/issues/<iid>/promote-kb`
- **Preconditions:** An IT issue with a good summary.
- **Steps:** 1) `POST /api/jira/issues/<iid>/promote-kb`.
- **Expected:** 200; returns note id with status `draft`; note auto-linked to the issue (visible in `/knowledge`).
- **Actual/Notes:** ______
- **Cleanup:** delete the draft note.

## TC-AGT-26 — AI assist fail-closed without provider key
- **Priority:** P1 · **Type:** Negative · **UI/API:** `GET /api/ai/suggest-reply/<iid>`, `/api/ai/summarize/<iid>`, `/api/ai/suggest-priority/<iid>`
- **Preconditions:** No `OPERADESK_OPENROUTER_KEY`; agent has no saved key; IT issue exists.
- **Steps:** 1) Call all three AI endpoints.
- **Expected:** 503 on all (`{"error": ...ai unavailable...}`); UI shows "AI unavailable" state, no crash.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-AGT-27 — AI assist on a non-visible (HR) ticket → 404
- **Priority:** P2 · **Type:** Negative · **UI/API:** `GET /api/ai/suggest-reply/<hr_iid>`
- **Preconditions:** HR issue exists.
- **Steps:** 1) Call with the HR issue id.
- **Expected:** 404 (same anti-enumeration contract as issue detail).
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-AGT-28 — Sprint/goal/project/SLA creation denied to agent
- **Priority:** P1 · **Type:** Negative · **UI/API:** `POST /api/jira/sprints`, `/api/jira/goals`, `/api/jira/projects`, `/api/sla-policies`
- **Preconditions:** Agent session.
- **Steps:** 1) Call each creation endpoint with minimal valid payloads.
- **Expected:** 403 on all four.
- **Actual/Notes:** ______
- **Cleanup:** none.

## TC-AGT-29 — Reopen any ticket as staff (no 72 h window)
- **Priority:** P1 · **Type:** Positive · **UI/API:** `POST /api/jira/issues/<iid>/reopen`
- **Preconditions:** A closed IT issue (closed today).
- **Steps:** 1) As agent: `POST .../reopen`.
- **Expected:** 200; status `reopened`; `reopen_count` incremented; requester notified.
- **Actual/Notes:** ______
- **Cleanup:** close again.

## TC-AGT-30 — CSAT rating → 403 for agent
- **Priority:** P2 · **Type:** Negative · **UI/API:** `POST /api/jira/issues/<iid>/rate`
- **Preconditions:** A resolved IT issue.
- **Steps:** 1) `POST .../rate {"score":4}`.
- **Expected:** 403; `csat` remains NULL.
- **Actual/Notes:** ______
- **Cleanup:** none.

---

## IT agent suite — cleanup checklist

- Unassign claimed tickets (TC-AGT-09/10/19), un-block blocked ones
  (TC-AGT-13), reset priorities (TC-AGT-15).
- Delete created issues (TC-AGT-07/08 are validation-only → none created),
  KB notes (TC-AGT-21/25), attachments (TC-AGT-18), links (TC-AGT-24).
- Reopen/close tickets left mid-lifecycle; reset DB between suites when
  full isolation is required.