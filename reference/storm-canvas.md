# Storm Canvas Reference Spec

Source-unnamed reference for Mkindayzir's "Storm" page — a freeform visual
thinking canvas where each "storm" (idea cluster) is a card, the user links
them with hand-drawn lines from corner circles, and opens a per-card markdown
note for distraction-free writing. Linked notes work like a wiki.

Captured from the user's brief (2026-08-25).

## Navigation
- New top-level page called "Storm" (no source name in UI)
- Sidebar entry with a custom storm icon (bolt, etc.)
- Route: `/storm` — own dashboard layout slot, not nested in vault

## Create a storm
- Empty canvas with a single "+" affordance
- Click → modal asks for **name only** (single field, 1–80 chars)
- Saved as a new rectangle on the canvas at center

## Card visuals (rounded-rectangle with corner circles)
- Same fixed size for every card (e.g. 200×120)
- **4 small circles in each corner** (handle points for link drawing)
- Card name inside; if name is longer than the card, **truncate with ellipsis**,
  do NOT grow the card
- Full name visible when user opens the card detail (the note)
- Subtle stroke + dark surface; selected card uses the primary accent ring
- Hover shows a 4-corner "drag the card / drag the circles" hint
- Cards have a small badge if the linked note is unsaved-dirty

## Linking (drag from a corner circle)
- **Click-and-hold on a corner circle, drag** → rubber-band line follows
  the cursor
- Release on another card's body OR another corner circle → link is created
- Render lines between connected corner circles (straight lines, simple)
- **Per-circle cap: 3 links in or out**
- **Per-rectangle cap: 12 links total in or out** (4 circles × 3)
- Visual feedback when at cap: circle turns muted, cursor shows "max"
- Click an existing line → highlight + tiny delete handle

## Canvas interactions
- **Pan** background with middle-mouse / space-drag / two-finger drag
- **Zoom** with wheel/pinch; bounded 25%–400% so cards never go microscopic
- **Drag a card** with mouse → moves the card
- **Move-all-with-selection** — when you drag a card, **every card transitively
  reachable through the link graph ALSO MOVES** (rigid subtree drag)
- "Fit to view" button: centers + zooms to fit all cards with padding
- Mini-map in corner showing position over the whole graph (optional, v2)

## Note editor (per-card)
- **Click the card body** → opens the note editor for that card
- Editor is distraction-free: 3-row title input, full-height `.md` editor,
  word/char count, save status, and a linked-notes sidebar
- **Notes stored as real `.md` files** (server-side, in `data/storm-notes/`,
  one file per storm card with the storm id as filename)
- Autosave (debounced 1s) + explicit Ctrl/Cmd+S
- Notes support **wiki-style linking between storms** using
  `[[storm-name]]` syntax; rendering renders a clickable link to that
  storm's note in the sidebar
- Backlinks panel shows which other notes link to this one
- Basic markdown (headings, lists, code, bold, italic, links, images)
- Crash-safe: every change writes a backup `*.bak` next to the main file

## Persistence model
- `storms` table: id, ownerId, name, x, y, createdAt, updatedAt
- `storm_links` table: id, fromStormId, fromCorner, toStormId, toCorner
  (unique on (fromStormId, fromCorner, toStormId))
- Note body lives in `data/storm-notes/{stormId}.md` (filesystem, per
  "notes are .md files" requirement)
- Soft-delete only; archived storms hide from canvas but notes remain

## Out of scope (this build)
- Multiplayer realtime cursors (future)
- Inline node images
- Style/themes per card
- Export to PDF
- Mobile/touch polish beyond basic pointer events
