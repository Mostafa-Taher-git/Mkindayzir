# OpsDesk — Internal Service Request Platform

A lightweight multi-user ticketing platform: submit, assign, track, and resolve
internal service requests. Built with **Flask + SQLite** (backend) and
**vanilla HTML/CSS/JS** (frontend) — no build step, no frontend framework.

Source requirements this implements: OpsDesk BRD / PRD / Engineering Plan v1
(request intake, fixed 6-state lifecycle, role-based visibility, public comments
+ internal notes, manager dashboard with aged-ticket flagging, admin CRUD).

---

## Quick start

```bash
cd /path/to/OpsDesk
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python run.py
```

Open **http://127.0.0.1:5000** in your browser (Chrome on this machine works).

On first run a SQLite database is created at `data/opsdesk.db` and seeded with
starter teams, categories, and users.

### Demo accounts (password: `password`)
| Email | Role |
|---|---|
| admin@opsdesk.local | admin (manage teams/categories/users) |
| manager@opsdesk.local | manager (sees all, dashboard) |
| agent@opsdesk.local | agent (IT team) |
| hragent@opsdesk.local | agent (HR team) |
| sam@opsdesk.local | requester (sees only own tickets) |

Change passwords via Admin → Users.

---

## Project layout (keep this mental model)

```
app/
  __init__.py        App factory: wires routes, serves frontend, auto-close job
  config.py          ALL tunable constants (windows, limits, roles, statuses)
  db.py              SQLite schema + seeding (single source of truth for data model)
  helpers.py         Auth decorators, RBAC rules, activity-log helper
  lifecycle.py       THE WORKFLOW: allowed status transitions (edit here)
  routes_auth.py     Login / logout / who-am-i
  routes_tickets.py  Tickets, comments, notes, attachments, dashboard, search
  routes_admin.py    Teams / categories / users CRUD
run.py               Starts the dev server (python run.py)
static/
  css/tokens.css     DESIGN-2.md palette as CSS variables — edit to re-skin
  css/app.css        Layout + components (built only on tokens.css)
  js/api.js          Every backend call (one place)
  js/app.js          Single-page app logic (router + views)
templates/
  index.html         App shell (loads css/js)
data/opsdesk.db      SQLite database (created on first run)
```

---

## How to customize

**Change colors / fonts / spacing** → edit `static/css/tokens.css`.
Every value from the DESIGN-2.md spec lives there as a CSS variable. No other
file needs touching.

**Change the workflow / statuses** → edit `app/lifecycle.py` (`ALLOWED` map and
`LABELS`). The UI, validation, and API all read from it.

**Add or rename a ticket field** →
1. Add the column in `app/db.py` (`SCHEMA`, `tickets` table) + re-create the db.
2. Include it in `routes_tickets.py` `_serialize()` and the create/update code.
3. Add the `<input>` in `static/js/app.js` (`viewCreate`) and detail rendering.

**Change timing windows / limits** → `app/config.py`
(`REOPEN_WINDOW_HOURS`, `AUTO_CLOSE_HOURS`, `AGED_*_HOURS`,
`MAX_ATTACHMENT_BYTES`, `ALLOWED_EXTENSIONS`).

**Add an API endpoint** → add a function in the relevant `routes_*.py` and a
matching call in `static/js/api.js`.

---

## Production notes

The dev server (`python run.py`) is for local use. To deploy:
- Use a WSGI server: `pip install gunicorn && gunicorn run:app` (set
  `run.app` by exporting the Flask app, or `gunicorn "app:create_app()"`).
- Set a real `OPERADESK_SECRET` env var for session signing.
- Swap SQLite for Postgres by changing `db.py` connection (schema is portable).
- SSO can be layered onto `routes_auth.py` without changing the rest.

---

## Tests

`test_frontend.js` is a headless integration test (jsdom) that boots the real
SPA against the live API and asserts every screen renders with no JS errors.
Requires the server running on :5000 and `npm install jsdom` once.

```bash
node test_frontend.js
```
