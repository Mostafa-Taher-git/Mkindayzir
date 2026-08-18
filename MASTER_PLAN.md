# OpsDesk — Master Implementation Plan

Internal-only Flask + SQLite + vanilla JS Helpdesk.
This plan consolidates the Dashboard, Knowledge Center, and Reports roadmaps into a single execution plan.
Increments are ordered by value and dependency.

## Already Completed
- Increment D1: Role-aware dashboard for agents and managers
  - Backend: `/api/dashboard` returns `role` plus agent metrics (`my_open`, `my_urgent`, `my_blocked`, `my_resolved_today`, `my_avg_response_hours`, `my_avg_resolution_hours`, `my_rated_tickets`)
  - Frontend: `viewDashboard()` renders "My Dashboard" for agents, "Manager Dashboard" for managers
- Increment 1: Unified Reporting Engine + Manager Action Center
  - Filterable `/api/reports/{summary,workload,sla,trend,export.csv}`; `GET /api/dashboard/action-center`; backlog reconciliation + median/P90 in summary
- Increment 2: KB search/filters + Ticket ↔ KB bridge
  - `GET /api/kb` filters (`category_id`, `status`, `author_id`, `sort`); `ticket_kb_links` schema; `GET/POST/DELETE /api/tickets/<id>/knowledge`; ticket detail "Knowledge Base" card (link/unlink) + "Promote to KB Article" on resolved tickets
  - **Not built:** `GET /api/tickets/<id>/knowledge/suggested` (keyword-overlap suggestions) — still open
- Increment 3: Reports UI polish + CSAT breakdown (filter bar, KPI cards, SLA box, workload table, CSAT distribution, KB health panel)
- Increment 4: AI-assisted KB drafting
  - `POST /api/kb/<id>/draft-from-ticket` (AI via user's own key, plain fallback without) + `POST /api/tickets/<id>/promote-kb` (creates linked draft); KB editor "Draft from ticket" button
  - **Not built:** print stylesheet (`@media print`) — still open
- Increment 5: Knowledge health dashboard (`/api/reports/knowledge` + Reports "Knowledge Analytics" tab)
- Increment 6: KB versioning + backlinks
  - `kb_article_versions` snapshots on edit/publish; `GET /api/kb/<id>/versions` + article-view "Version history" panel
  - Article ↔ article links (`GET/POST/DELETE /api/kb/<id>/links`, self-link guarded, inbound/outbound shown, add/remove UI)
  - **Not built:** full diff view (versions shown as snapshots only) — still open

## Master Increment Order

### Increment 1: Unified Reporting Engine + Manager Action Center (1–2 days)
**Goal:** Unify reporting backend and complete the Manager Dashboard experience.

**Backend:**
- Parameterize `routes_reports.py` endpoints with optional filters:
  - `team_id`, `assignee_id`, `days`, `date_from`, `date_to`
  - Endpoints: `/api/reports/summary`, `/api/reports/workload`, `/api/reports/sla`, `/api/reports/trend`, `/api/reports/export.csv`
- Add `GET /api/dashboard/action-center`:
  - Unassigned open tickets
  - SLA breaches and approaching breaches
  - Stale open tickets
- Enhance `/api/reports/summary`:
  - Backlog reconciliation (opening backlog, new, resolved, reopened, ending backlog)
  - Median and P90 resolution hours
  - Average/median first response hours

**Frontend:**
- Report filter bar in Reports page
- Manager Dashboard: Action Center widget + Team Workload strip with drill-down links to `/queue`
- Keep agent "My Dashboard" intact

**Tests:**
- Filter params on reports
- Action Center endpoint shape
- Manager vs agent authz
- Frontend filter state

---

### Increment 2: High-Signal KB Search + Ticket ↔ KB Bridge (2–3 days)
**Goal:** Transform KB from a static repository into an active ticket resolution tool.

**Backend:**
- Extend `GET /api/kb` with filters:
  - `category_id`, `status`, `author_id`, `sort` (`updated_at`, `views`, `helpful`)
  - SQL relevance ranking: exact title > title contains > body contains
- Schema: `ticket_kb_links (id, ticket_id, article_id, linked_by_id, created_at, note)`
- Endpoints:
  - `GET/POST/DELETE /api/tickets/<id>/knowledge`
  - `GET /api/tickets/<id>/knowledge/suggested` — keyword overlap suggestions

**Frontend:**
- Help Center and Manage KB: filter chips + sort dropdown
- Ticket detail: "Linked Knowledge Base Articles" card + suggested articles rail

**Tests:**
- KB filter queries
- Link/unlink lifecycle
- Ticket-knowledge permissions

---

### Increment 3: Reports UI Polish + CSAT Breakdown (1–2 days)
**Goal:** Complete the Reports view with high-signal operational analytics.

**Backend:**
- `/api/reports/summary` adds:
  - CSAT score breakdown (counts for 1–5 stars)
  - Median/P90 resolution hours
- `/api/reports/trend` respects filters

**Frontend:**
- Reports page filter bar (team, agent, date range)
- Summary KPIs, SLA attainment, Agent Workload table
- CSAT star distribution bar
- Backlog trend chart (SVG)
- Trend line/bar chart

**Tests:**
- CSAT distribution math
- Filter parameter validation
- Frontend rendering

---

### Increment 4: AI-Assisted KB Drafting + Operational Polish (1–2 days)
**Goal:** Accelerate knowledge creation and polish cross-system ergonomics.

**Backend:**
- `POST /api/ai/draft-kb-from-ticket` using existing `app/ai/client.py`
  - Input: ticket subject, description, comments, resolution
  - Output: structured markdown draft (Problem, Root Cause, Solution)

**Frontend:**
- "Promote to KB Article" button on resolved tickets
- Print styling (`@media print`) for browser PDF export
- Empty states, loading skeletons, error toasts

**Tests:**
- AI prompt generation with missing-key fallback
- Frontend print stylesheet presence

---

### Increment 5: Knowledge Health Dashboard (2 days)
**Goal:** Give managers visibility into KB quality and coverage.

**Backend:**
- `GET /api/kb/analytics`:
  - Total views, last 30 days views
  - Helpful % from `kb_feedback`
  - Orphan articles (0 views in 90 days)
  - Stale articles (not updated in 90 days and not draft)
  - Top linked articles
  - Articles by category breakdown

**Frontend:**
- "Knowledge Health" panel in Manage KB
- Simple bar/line charts using inline SVG or CSS bars

**Tests:**
- Analytics counts
- Empty-state handling

---

### Increment 6: Versioning + Advanced KB (3–4 days)
**Goal:** Editorial quality and AI-assisted maintenance.

**Backend:**
- Schema: `kb_article_versions (id, article_id, title, body, category_id, saved_by_id, saved_at, change_note)`
- Snapshot on every publish/edit
- `GET /api/kb/<id>/versions`
- AI assists:
  - Suggest related articles by shared category + keyword overlap
  - Duplicate detection deferred to v2

**Frontend:**
- Version history dropdown
- Diff view
- Properties panel

**Tests:**
- Version snapshot on edit/publish
- Property updates

---

## Deferred to v2
- Custom Report Builder / SQL Builder
- Saved Custom Reports
- Channels & Customers Reports
- Obsidian-style `[[Title]]` Wikilinks syntax (plain backlinks are shipped; wikilink markup is not)
- Article Collections Hierarchy (flat collections are shipped; nested hierarchy is not)
- Full Article Version Diffing Engine (snapshots + history are shipped; side-by-side diff is not)
- PDF Generation Backend Libraries
- Semantic / Vector Search
- Real-time collaboration
- Advanced permissions model
- Scheduled email reports
- Heatmaps, Cohort analysis, Forecasting
- Root-cause analysis
- Ticket → KB "suggested articles" rail (`/api/tickets/<id>/knowledge/suggested`)

---

## Execution Order Summary
| Increment | Name | Effort | Prereq | Status |
|-----------|------|--------|--------|--------|
| 1 | Unified Reporting + Manager Action Center | 1–2 days | None | ✅ Shipped |
| 2 | KB Search + Ticket ↔ KB Bridge | 2–3 days | Increment 1 | ✅ Shipped (suggested-articles rail deferred) |
| 3 | Reports UI Polish + CSAT | 1–2 days | Increment 1 | ✅ Shipped |
| 4 | AI-Assisted KB Drafting + Polish | 1–2 days | Increments 2, 3 | ✅ Shipped (print CSS deferred) |
| 5 | Knowledge Health Dashboard | 2 days | Increments 2, 3 | ✅ Shipped |
| 6 | Versioning + Advanced KB | 3–4 days | Increment 5 | ✅ Shipped (diff view deferred) |

---

## Implementation Notes
- Keep Python thin and commented.
- Frontend edits stay in `static/js/app.js`, `static/js/api.js`, `static/css/app.css`.
- Do not start servers during implementation.
- Do not push unless explicitly asked.
- Run `pytest` after each increment; fix failures before continuing.
