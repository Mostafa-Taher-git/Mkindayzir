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
- Notifications and reports
- Settings: password change, per-user encrypted OpenRouter key
- AI settings: show all models available to the user’s key; user chooses freely
- Mobile drawer navigation and basic UX polish
- Test suite: 73 tests passing

## Next steps

1. Verify OpenRouter key save/load behavior in the live UI
2. Push completed work
3. Make any final internal UX tweaks
