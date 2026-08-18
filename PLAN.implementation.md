# OpsDesk — Implementation Status

This file summarizes what is already implemented versus what remains.
It is current as of the latest commits on local `main`.

## Completed

- **Core platform:** Flask + SQLite + vanilla SPA, internal company-only use
- **Auth:** login/logout/me, session cookies, password hashing, role-based access
- **Tickets:** lifecycle, comments, notes, attachments, search, assignee/priority filters
- **Admin:** teams/categories/users CRUD, delete-user confirmation
- **Notifications:** in-app notification list
- **Reports:** dashboard, SLA, trend, summary, workload
- **KB:** publish/read, feedback, views counter, paragraph-safe body rendering
- **Settings:** password change, per-user encrypted OpenRouter key storage
- **AI:** key-backed model list shown in Settings; user can pick any model their key supports
- **Mobile:** hamburger/drawer navigation
- **Hardening:** idle timeout in `role_required`, attachment magic-byte validation
- **Tests:** 73 tests passing
- **Docs:** `.env.example` covers all `config.py` env vars

## Remaining gaps / next focus

- Validate user-reported OpenRouter key save/load flow in the live UI
- Push current local commits to `origin/main`
- Optional: remove obsolete OpenCode/debate notes from repo history if desired
