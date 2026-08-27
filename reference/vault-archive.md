# Vault as Central Archive — Reference

Working notes for Mkindayzir's Vault. Captured from the user's reference
product (source deliberately unnamed per project policy) + agreed decisions.

## What the Vault is

The Vault is the **central, unified archive for the entire app**. Every
archivable thing in the app — projects, spaces, boards, cards, columns,
tickets, notes, conversations, guides, reports, work items, customer
records, anything — when archived by the user, lands in the Vault.

The Vault is **not just a notes app**. The existing notes/folders/tags/
graph features remain and live *inside* the Vault. Archive items and
notes are two kinds of nodes that share the same folder tree.

## What goes into the Vault

Whenever any entity in the app supports an "Archive" action, archiving
it must (1) soft-delete the entity from its normal surface, AND (2) drop
a record into the Vault so the user can find, restore, or permanently
delete it later. Restoring a Vault item returns it to its original
surface.

Supported entity types at launch (every existing "Archive" button in
the app should route here):

- Project
- Space
- Board
- Card (Kanban card)
- Column (list inside a board — keep its cards on restore, optionally)
- Ticket
- Note (existing — already a Vault-native entity)
- Conversation (Assistant)
- Guide
- Report
- Customer
- Initiative
- Iteration
- Work item (PM work items)
- Any future entity with an Archive action

## Default folder structure (auto-created on first run per user)

The user gets these default folders, one per entity type, so an archived
item always has a sensible home without the user doing anything:

- `Boards`          (Board, Card, Column all nest under it)
- `Projects`        (Project, Space, Initiative, Iteration, Work item)
- `Tickets`         (Ticket, Customer)
- `Notes`           (existing Vault notes; preserved on upgrade)
- `Conversations`   (Assistant chat)
- `Guides`
- `Reports`

Default folders are **visible and movable** like any other folder, but
their icons and order are fixed (always first in their group). Users can
rename a default folder, but not delete it (the system recreates it if
empty and another item of that type is archived).

## User-created folders

In addition to defaults, the user can create their own folders and
subfolders and name them anything (e.g. `2025 Q1 cleanup`,
`Old client work`, `Personal`). User folders:

- Can be created at the root or inside any other folder.
- Can be renamed.
- Can be deleted — but only when empty. If non-empty, the user is
  prompted to either move the children first or move them to a
  different folder on delete.

## Moving items between folders

Every archived item shows in its current folder. The user can:

1. **Drag and drop** the item to another folder in the sidebar.
2. **"Move to…" action** in the item's menu — opens a folder picker.
3. **Bulk move** when multiple items are selected.

Items keep their full history and original-type icon when moved. Moving
an item never deletes it; it never auto-archives anything; it never
changes its restore target.

## Item detail view

Clicking an item in the Vault opens a unified detail view that shows:

- The original entity's snapshot (title/name, summary fields, who
  archived it, when).
- A "Restore" action — returns the entity to its original surface
  (board, project, etc.) with all data intact.
- A "Delete permanently" action — confirmation required, irreversible.
- A "Move to folder" action.
- Original metadata: who owned it, when it was archived, when it was
  originally created, the last 5 audit events.
- For Notes (already a Vault-native entity): the full editor.

## Restore semantics

- Restoring a Board puts the board, its columns, and its non-archived
  cards back into the parent space. Cards still archived individually
  stay in the Vault.
- Restoring a Card puts it back on its board, in its original column,
  at the end (matches today's board-archive behavior).
- Restoring a Project restores its non-archived work items, iterations,
  and initiatives.
- Restoring a Ticket returns it to the open queue.
- Restoring a Conversation returns it to the Assistant list as active.
- A restore can fail if the parent (e.g. the board the card belonged
  to) was permanently deleted. In that case, the user is offered a
  choice: keep the orphan archived, or permanently delete the orphan.

## Permissions

- Personal mode: the Vault is per-user, and the user sees only their
  own archived items.
- Team mode: the Vault is per-user *for archive* (you only archive for
  yourself), but a Team Vault view shows all items the current user
  archived from team-shared entities. An admin can see the org-wide
  archive.

## UX rules (per the reference product)

- The Vault's sidebar shows the folder tree with counts per folder.
- The default folders always sit at the top, in the fixed order above.
- Each item card shows: icon (entity-type icon), title/name, the
  type label, the date archived, who archived it.
- A "Recently archived" pseudo-folder (last 30 days, newest first)
  appears just below the defaults.
- An empty Vault shows: "Nothing archived yet. Anything you archive
  from anywhere in the app will land here."
- Search inside the Vault searches across titles, types, and original
  metadata (description, assignee, etc.).
- A bulk-select mode lets the user select many items, then move or
  permanently delete them all at once.

## API and data model — high level

A single `archive_items` table stores every archived thing:

- `id` (UUID)
- `owner_id` (user who archived)
- `entity_type` (string, e.g. `board`, `card`, `project`)
- `entity_id` (original id, if not permanently deleted)
- `folder_id` (current Vault folder, nullable for root)
- `title` (denormalized name at archive time, so the row still makes
  sense if the original is hard-deleted)
- `payload` (JSON snapshot of the entity at archive time, so restore
  can rebuild it)
- `archived_at`, `archived_by`
- `restored_at`, `permanently_deleted_at` (soft-delete timeline)

A `vault_folders` table stores the user-created folder tree:

- `id`, `owner_id`, `parent_id`, `name`, `is_default`, `entity_type`
  (only set for default folders, e.g. `Boards`, `Tickets`).

Both tables are scoped per `owner_id`; defaults are seeded per user on
first Vault access.

## Out of scope for this milestone (intentionally deferred)

- Per-folder permissions (Team mode admin policies).
- Auto-archive rules (e.g. "auto-archive cards after 90 days").
- Retention policies / scheduled permanent delete.
- Sharing a single archive item with another user.
- Exporting the entire Vault.
- Re-archiving an item that was restored: today's flow already calls
  the existing `archive()` endpoint, which now also writes an
  `archive_items` row, so the contract is uniform.
