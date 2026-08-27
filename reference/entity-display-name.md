# Entity Display Name Reference

Working notes for Mkindayzir. Captured from the user's reference product
(source deliberately unnamed per project policy) + agreed decisions.

## Problem statement

When a user creates or opens an entity anywhere in the app (board, card,
project, space, ticket, note, vault item, etc.), every label, list row,
header, breadcrumb, modal title, and reference must show the entity's
**human display name** — never the internal UUID. The user should never
see strings like `idf48adf95706468ea9715721a218b308`,
`20776e846adb49578cb37a31aed04107`, `Dc8be7473cf4455d960cc3a3c3c4ad70`,
or `Fef0430462d64a609c93bba942705d44` in the UI.

The UUID is a stable, server-side primary key. It is allowed (and useful)
in: API URLs, database columns, deep-link routing keys, `key=` props for
React lists, server logs, and the browser address bar of debug views.
It is **never** rendered as the visible text of a label, link, badge, or
title that the user is meant to read.

## Universal rule

Every entity that has a `name` (or equivalent: `title`, `displayName`,
`label`) MUST render that field in the UI surface. The `id` / `uuid`
field is for machine identity only.

If the entity does not have a name yet (e.g. just created, blank title),
the UI MUST show a sensible placeholder (see "Fallbacks" below) and
prompt the user to set a name — never fall back to the UUID.

## Where the bug appears

The pattern is most often one of:

1. **Component uses `item.id` as the visible label.**
   ```tsx
   // WRONG
   <h2>{item.id}</h2>
   <span>{entity.id}</span>
   <Link>{row.id}</Link>
   ```
   ```tsx
   // RIGHT
   <h2>{item.name}</h2>
   <span>{entity.title}</span>
   <Link>{row.name}</Link>
   ```
2. **List/map key is fine, but the inner text also uses `id`.** The `key`
   prop must stay as `id`; the rendered text is a separate concern.
3. **A select/dropdown option uses `id` for both `value` and label.**
   ```tsx
   // WRONG
   <option value={p.id}>{p.id}</option>
   // RIGHT
   <option value={p.id}>{p.name}</option>
   ```
4. **Breadcrumb or page header reads `params.id` instead of looking up
   the entity and showing its name.**
5. **Toast / notification / activity entry falls back to the id when a
   related entity name is missing.** Always pass the denormalized name
   through the payload, or fetch the entity and use its name.
6. **Empty initial state.** A newly created entity is returned with `id`
   but no name yet (user cancels rename, or the form had no name
   field). The UI must show a placeholder like "Untitled board" — not
   the id.

## Surfaces to audit (non-exhaustive)

- Page titles and `<title>` tags
- Headers, breadcrumbs, back-links
- List items in sidebars, switchers, pickers, modals
- Card titles, board titles, column titles
- Card faces that reference other entities (assignee, label, project,
  parent, related card)
- Toast notifications and activity feed entries
- Select / combobox / autocomplete option labels
- Dashboard tiles and quick-action cards
- Search results
- Empty states and placeholders for newly created items
- Confirmation dialogs ("Delete board X?") — always use the name

## Fallbacks (when the name is genuinely missing)

Use a clear, friendly placeholder in this order of preference:

1. A type-specific default: "Untitled board", "Untitled card",
   "Untitled note", "Untitled project", "New ticket".
2. A short truncation of the UUID only as a *last* resort and only
   behind a "Show ID" developer toggle — never in the default user UI.
3. Never raw UUID in a label, button, or link.

## Data-layer requirement

For any list/lookup API that the UI consumes, the response MUST include
the display name of every related entity it references by id. Do not
make the frontend do a second round-trip to resolve a name for a list
that already exists — denormalize the name into the payload at the
service layer. If a related entity was deleted, the payload should
return `null` for the name and the UI should show "(deleted)" or
"—" — not the orphan UUID.

## Review checklist (use on every PR that touches a list or detail view)

- [ ] Every rendered string that represents an entity uses its name.
- [ ] `key` props still use stable ids (this is correct and required).
- [ ] Selects / dropdowns set `value={id}` and display `{name}`.
- [ ] Newly created entities show a sensible "Untitled …" placeholder
      until the user names them.
- [ ] Activity feed / notifications show the entity name, not its id.
- [ ] No raw UUID appears in: button text, link text, span text, label
      text, option text, toast body, or page title.
- [ ] If a UUID is intentionally shown (debug view, "Copy ID" menu), it
      is opt-in only and clearly labeled.
