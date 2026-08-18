# OpsDesk — Internal Service Request Platform

OpsDesk is an **internal company-only** service request platform for staff
to submit, assign, track, and resolve requests fast and with minimal friction.

- **Stack:** Flask + SQLite + vanilla SPA (no build step)
- **Access:** company/internal use only; no public access
- **Frontend:** editable HTML/CSS/JS surface; Python backend stays thin and commented

## What’s implemented now

- Multi-user ticketing with role-based access: requester, agent, manager, admin
- Ticket lifecycle, comments, internal notes, attachments
- Settings page with per-user encrypted OpenRouter key storage
- AI assist uses the user’s own OpenRouter key; when a key is saved, the
  settings UI shows all models available to that key and the user can choose
  any model freely
- Admin controls for teams, categories, and users
- Notifications, reports, KB publish/read, password change, mobile drawer nav

## Quick start

```bash
cd "/media/dell/New Volume/Projects/OpsDesk"
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python run.py
```

Open **http://127.0.0.1:5000**.

## Demo accounts

| Email | Role |
|---|---|
| admin@opsdesk.local | admin |
| manager@opsdesk.local | manager |
| agent@opsdesk.local | agent |
| hragent@opsdesk.local | agent |
| sam@opsdesk.local | requester |

Demo password: `password`

## Key behavior notes

- Per-user AI settings are stored encrypted at rest.
- After saving an OpenRouter key in Settings, the model list refreshes from
  that key’s available catalog.
- AI assist is draft-only and never sends messages or modifies tickets
  automatically.

## Project layout

```
app/
  __init__.py        App factory + frontend serving
  config.py          Runtime constants
  db.py              SQLite schema + seed data
  helpers.py         Auth decorators + RBAC helpers
  lifecycle.py       Allowed ticket transitions
  routes_*.py        API endpoints
static/
  css/app.css        Styles
  js/app.js          SPA logic
  js/api.js          API client
templates/
  index.html         App shell
```
