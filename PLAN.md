# OpsDesk — Project Plan (Current)

This plan reflects the current internal-only product direction and the codebase
state after Phases 0-4.

## Scope

- Internal company service request platform only
- Fast, simple staff-to-staff request communication
- No public access; no public-facing marketing plan required

## Implemented

- Flask + SQLite + vanilla SPA
- Ticket intake, lifecycle, comments, attachments, assignee/priority filters
- KB publish/read with paragraph-safe rendering
- Ticket ↔ KB bridge: linked-articles card on ticket detail, "Promote to KB Article" from resolved tickets, AI-assisted drafting (user's own key, plain fallback without)
- KB version history snapshots + article-to-article links (backlinks)
- Notifications and reports (filterable; CSV export respects the active filters)
- Settings: password change, per-user encrypted OpenRouter key (saving the model alone never wipes the stored key)
- AI settings: show all models available to the user’s key; user chooses freely
- Admin: team/category/user CRUD incl. password reset for existing users
- Mobile drawer navigation and basic UX polish
- `.env` support via python-dotenv (`cp .env.example .env` now actually configures the app; startup warns on the dev fallback secret)
- Test suite: 93 backend tests + headless frontend test (`npm run test:frontend`) passing

## Next steps

1. Push completed work
2. Make any final internal UX tweaks
3. (Deferred) Ticket → KB suggested-articles rail, KB diff view, print stylesheet — see MASTER_PLAN.md
