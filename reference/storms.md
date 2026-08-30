# Storms — spec

Build from lightweight hand-drawn whiteboard reference — never name the source in code/comments/docs/UI.

## 1) Page & nav
- New top-level page `/storms` with storm icon (wind/cloud). Add to sidebar nav.
- Page header: “Storms” title, “New Storm” button.
- Storm name == board name (one entity).

## 2) Graph canvas (/storms)
- Infinite canvas: pan (space+drag / hand tool / scroll-drag), zoom (wheel/pinch, 0.2-3x, +/- buttons), minimap optional.
- Background grid/dots, dark-mode aware.
- Empty state: prompt to create first storm.

### Storm node
- Fixed size rectangle: e.g. 200x88, same for all. Never grows with text.
- 4 corner circles (12px dia) at corners, inset? Circles sit exactly on corners (outside stroke, centered on corner).
- Inside: storm name, centered, truncated with ellipsis if overflow, single line, max ~22 chars visible. Tooltip shows full.
- Selected/hover: outline accent.
- Actions on node: click → open whiteboard (full page). Right-click/dropdown: Rename, Archive, Delete. Archive hides from graph (filter toggle).

### Create
- “New Storm” → modal: only `name` input (required, 1-80 chars, unique per workspace? allow dup but search by name). On create, node placed at viewport center with slight offset for duplicates.

### Linking
- Interaction: drag from a corner circle → line preview follows cursor → drop on another circle (any storm) to create link.
- Constraints: max 3 lines per circle, max 12 per storm (4*3). Show count badge or disable circles at cap. Server validates.
- Lines: hand-drawn / sketchy style, 2px, curved bezier or straight? Use slight roughness. Arrow? No arrow, just line between circles. Hit area 10px.
- Cutting: click line → shows “×” or cut icon → confirm → delete link. Alt: select line + Delete key, or scissor tool.
- Persistence: StormLink {id, fromStormId, fromCorner 0..3, toStormId, toCorner 0..3}.

### Physics & drag
- Nodes draggable: mouse drag moves node (update x,y).
- Group move: when dragging a node, all transitively linked nodes move with same delta * 0.85 spring factor (or rigid group). Use BFS to collect linked component, apply delta with damping per hop (0.9^depth). No separate force simulation per frame for MVP; simple group follow is predictable and cheap for many nodes.
- Alternative later: optional force-directed layout toggle (repel + spring) for auto-arrange.

### Limits
- Unlimited storms per user (MVP). Can add tier later.

## 3) Whiteboard (/storms/:id)
- Full-page canvas, header: “Back to Storms” button top-left, storm name (editable inline), actions: Archive, Delete, Rename, Export.
- Lightweight hand-drawn engine: use roughjs style (roughness, sketch).
- Tools toolbar (left or top):
  - Select/move, Hand (pan), Freehand (pen), Rectangle, Ellipse, Diamond, Arrow (connect), Line, Text, Image, Eraser.
- Properties: stroke, fill, strokeWidth, roughness, opacity, font.
- Images: upload/paste/drag-drop, resize handles, position anywhere.
- Reusable shape libraries: left panel with library (custom sets), drag onto canvas.
- Canvas: infinite, zoom/pan (same as graph), grid.
- Undo/redo (stack 100), Duplicate, Delete, Bring front/back.
- Dark mode: canvas + UI adapt to app theme (via CSS vars).
- Arabic: text tool supports RTL, `dir="auto"` and Arabic font, align right when RTL detected.
- Export: PNG, SVG, JSON. “Save” autosaves to server (debounced 800ms).
- Reference: typing `#(` or `#name` triggers autocomplete of storm names; inserted as `#[Storm Name]` pill. Click pill → navigate to `/storms/:id` (open that storm’s whiteboard). Store as special text element with link metadata.
- Performance: virtualize, no heavy deps, debounce renders, limit rerenders.

## 4) Data model

### Storm
- id: uuid pk
- name: varchar 80, not null
- ownerId: varchar 36 (Clerk user id)
- organizationId: varchar 36 nullable FK organizations.id (null = personal)
- x, y: float default 0 (canvas position)
- width, height: int fixed (200,88) — stored for future flex
- isArchived: bool default false
- whiteboardData: json/text (elements array + appState)
- createdAt, updatedAt, deletedAt (soft delete)

Indexes: (ownerId), (organizationId), (name).

### StormLink
- id: uuid pk
- fromStormId: FK storms.id cascade
- fromCorner: int 0..3
- toStormId: FK
- toCorner: int 0..3
- createdAt
- Unique: (fromStormId, fromCorner, toStormId, toCorner) + reverse check. Check count per circle <=3 and per storm <=12.

### API
- GET /api/storms?organizationId=&includeArchived=
- POST /api/storms {name, x?, y?}
- PATCH /api/storms/:id {name, x, y, isArchived}
- DELETE /api/storms/:id (soft)
- GET /api/storms/:id (includes whiteboardData)
- PUT /api/storms/:id/whiteboard {data}
- GET /api/storms/search?q= (for # autocomplete)
- GET /api/storms/links?stormIds=
- POST /api/storms/links {fromStormId, fromCorner, toStormId, toCorner}
- DELETE /api/storms/links/:id
- GET /api/storms/:id/links (links touching storm)
- Export: client-side, no server needed.

## 5) Permissions
- Personal storms (organizationId null): only owner sees.
- Org storms: any org member sees; link creation allowed for members.
- Apply org_owner_filter pattern.

## 6) UI details
- Storm icon: lucide `wind` or `cloud-lightning` — use `Wind` for now.
- Empty graph help text.
- Toast on cap: “Max 3 lines per circle (12 per storm)”.
- Whiteboard Back button: `< Back to Storms` top-left.

## 7) Non-goals (MVP defer)
- Real-time collaboration
- Version history
- Comments on whiteboard
- Force-directed auto-layout button (nice-to-have later)

## 8) Files
- backend/app/models/storm.py
- backend/app/models/storm_link.py
- backend/app/routers/storms.py
- backend/app/services/storm_service.py
- frontend/src/app/(dashboard)/storms/page.tsx (graph)
- frontend/src/app/(dashboard)/storms/[stormId]/page.tsx (whiteboard)
- frontend/src/components/storms/* (StormNode, StormCanvas, StormWhiteboard, WhiteboardToolbar, etc.)
- frontend/src/lib/storms-api.ts (optional)
