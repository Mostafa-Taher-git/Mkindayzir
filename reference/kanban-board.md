# Kanban Board Reference Spec

Working notes for Mkindayzir's board page. Captured from the user's reference
board (source deliberately unnamed per project policy) + agreed decisions.

## Excluded by user decision
- Inbox / Planner views
- Power-Ups
- Automation

## Board header
- Board title: click-to-rename inline; Enter saves, Esc cancels
- Star toggle: per-user; starred boards float to top of workspace grid and switchers
- Visibility switcher: Private / Workspace / Public with plain explanations
- Share dialog: copyable link + current visibility context
- Switcher: dropdown of sibling boards in the same space
- Background picker: preset colors OR uploaded image + adjustable dark overlay
  so text/cards stay legible (photo → overlay → header → hard cards layering)

## Lists (columns)
- Add-list composer at the end, stays open for rapid entry
- Inline rename on click; card count in header; actions menu (rename/delete)
- Optional WIP limit field (model supports `limit`)

## Cards (face)
- Cover color stripe (top edge)
- Complete square: click toggles ✓ + strikethrough title
- Label chips as small color bars (name on hover)
- Badges row: ≡ description · ☑ done/total checklist progress · 💬 comment count ·
  🕐 due date (crimson when overdue) · member avatars (max ~3, overflow hidden)
- Template badge on template cards
- Hover quick actions: Edit (opens modal) + Archive

## Card detail (modal)
- Header: list-name dropdown → move within board; Cover swatches;
  "…" menu: Copy / Make template / Move… / Mark complete / Archive
- Big title (editable), complete square beside it
- Action row popovers: Labels · Dates · Checklist · Members · Attachments ·
  Move-to-board
- Description textarea, autosaves on blur
- Comments & activity column: write box, avatar+timestamp list, hover delete
- Checklists with add/rename/delete items and per-item completion
- Members: pick from user directory, remove inline

## Archive
- Soft delete only; archive dialog lists archived cards; restore returns the
  card to the END of its original list

## Cross-board move
- Target = any other board + one of its columns; card lands at end of that
  column; checklists/members travel; labels tied to old palette are dropped

## Labels
- Every new board is provisioned with a default palette:
  Green #7adba8, Yellow #ffd75e, Orange #ff9f43, Red #ff5449,
  Purple #b678f0, Blue #96ccff
- Users can create more via API; label filter in toolbar filters by chip id

## Filters (toolbar)
- Text search over titles
- Member filter (real users from directory)
- Label filter (board palette)
- View mode: kanban | table

## API contract notes (implementation-facing)
- GET /api/cards?boardId=… returns rich faces: labels[{id,name,color}],
  checklistTotal/Done, commentCount, members[{userId,displayName}]
- POST /api/cards/{id}/archive · /restore · /move-board {columnId}
- GET/POST /api/boards/{id}/labels · GET/POST /api/cards/{id}/attachments
- Checklists accept both {title} and {name} at the boundary
