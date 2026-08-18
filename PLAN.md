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
- Ticket ↔ KB bridge: linked-articles card on ticket detail, keyword-overlap "Suggested articles" rail, "Promote to KB Article" from resolved tickets, AI-assisted drafting (user's own key, plain fallback without)
- KB version history snapshots with line-level diff modal + article-to-article links (backlinks)
- Notifications and reports (filterable; CSV export respects the active filters; print stylesheet for PDF export)
- Ticket editing: staff anytime; requester while unassigned; category change re-routes team + re-picks SLA policy
- Followers/watchers: follow/unfollow, auto-follow on comment/assign, @mention notifications, watcher count on ticket detail
- Bulk queue actions: assign/unassign/status/priority/close for selected tickets with per-ticket transition validation
- SLA transparency: expected first-response and resolution due dates surfaced on queue rows and ticket detail
- Pre-submit KB suggestions: matching articles offered before creating a ticket (click Submit again to proceed)
- Settings: password change, per-user encrypted OpenRouter key (saving the model alone never wipes the stored key)
- AI settings: show all models available to the user’s key; user chooses freely
- Admin: team/category/user CRUD incl. password reset for existing users
- Mobile drawer navigation and basic UX polish
- `.env` support via python-dotenv (`cp .env.example .env` now actually configures the app; startup warns on the dev fallback secret)
- Test suite: 116 backend tests + headless frontend test (`npm run test:frontend`, 13 checks) passing

## Next steps

1. Push completed work
2. Make any final internal UX tweaks
3. (Deferred) Obsidian-style wikilink syntax, nested collection hierarchy, rich side-by-side diff — see MASTER_PLAN.md
