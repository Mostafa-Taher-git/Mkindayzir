---
target: static + templates (OpsDesk SPA frontend)
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 3
timestamp: 2026-08-19T17-37-58Z
slug: static-templates-opsdesk-spa-frontend
---
# OpsDesk Enterprise — Frontend UX/Design Critique

Method: dual-agent (A: design review reading source · B: detector + live browser/Playwright)
Target: static/ + templates/ (the OpsDesk SPA frontend), live server on :5000

## Design Health Score (Nielsen 10, Operate surface)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Spinners/toasts/focus exist; some raw server messages leak to toasts |
| 2 | Match System / Real World | 2 | Jargon (SLA, OKRs, velocity, raw numeric target_id); "Jira/Trello/Obsidian" competitor naming; raw e.message toasts |
| 3 | User Control and Freedom | 3 | Esc/cancel/back present; some exits missing |
| 4 | Consistency and Standards | 2 | Trello bypasses token system + own dark block; triplicated markdown renderer; undefined --success/--text tokens; "Manager Dashboard" shown to Admin |
| 5 | Error Prevention | 2 | Bulk Close/Unassign run unconfirmed; single status changes unconfirmed |
| 6 | Recognition Rather Than Recall | 3 | Labelled nav, but 20+ items, hidden on mobile, jargon memory-bridges |
| 7 | Flexibility and Efficiency | 3 | Ctrl+K/J + G-nav + bulk actions exist; batch only partial |
| 8 | Aesthetic and Minimalist | 2 | Competitively derivative; Inter generic; emoji icons; four-trackers clutter; token leakage |
| 9 | Error Recovery | 3 | Clear confirm modals + validation; raw messages leak, no autosave |
| 10 | Help and Documentation | 3 | Help Center + tours + onboarding ring; but Help tabs broken by JS bug |
| **Total** | | **26/40** | **Acceptable (significant improvements needed)** |

## Design Specificity Verdict

**LLM assessment:** Not authored for this product. The shell is a clean generic enterprise SPA, but the visual language is an aggregation of four consumer tools — the nav literally labels "Jira Workflows", "Trello Boards", and "Knowledge Base (Obsidian-style vault)". Trello's module hardcodes Trello's exact brand blue (#0079bf), neutral (#d7dce5) and chip colors, bypassing the token system entirely. Primary palette is generic enterprise blue + Inter (the default "every SaaS" face). Nothing signals "internal IT service desk" vs any other B2B tool.

**Deterministic scan:** CLI detector ran DEGRADED (regex fallback — htmlparser2/css-tree missing; computed contrast unchecked). 6 warnings: 1 `overused-font` (Inter), 5 `side-tab`. The live in-browser scan (which the CLI could not run) found **70 findings on the dashboard alone: 69 low-contrast WCAG AA failures** — text `#003d9b` on `#0052cc` at 1.4:1 (need 4.5:1), and `#9a6700` on `#fff0cc` at 4.3:1 — plus 1 skipped-heading.

## Overall Impression

Solid engineering underpinnings (centralised tokens, real a11y bones, good first-run care) wrapped in an un-branded, inconsistently-themed shell with a systemic contrast problem and two broken interactive surfaces. Biggest opportunity: unify the four modules under one OpsDesk token system and fix the contrast — that alone moves the score 8–10 points.

## What's Working

1. **Accessibility infrastructure** — visible :focus-visible rings, aria-modal dialogs with Esc + focus trap, aria-live toasts, scoped table headers, aria-hidden decorative icons. Above average for a vanilla-JS SPA.
2. **Disciplined token architecture** — tokens.css is clean (4px grid, full light/dark pair, semantic status map). Re-theming is centralised where used.
3. **First-run & high-stakes flows** — onboarding ring + guided tours (help.js) and the AI tool-approval card (ai.js: explicit "AI wants to run", JSON args, Approve/Reject, locked-while-pending) show real trust/care.

## Priority Issues

- **[P0] Systemic WCAG AA contrast failures.** 69 low-contrast nodes on the dashboard alone: `--primary #003d9b` on `--primary-container #0052cc` (status-new badge) ~1.4:1, and amber `--warning`-family text ~4.3:1. Pervasive across badges/buttons. Fix: darken `--primary` / lighten container, or swap text to `--on-primary`; raise amber pair to 4.5:1.
  - Fix: retune contrast tokens in tokens.css. Suggested command: `/impeccable audit` then `/impeccable typeset` / `/impeccable colorize`.
- **[P0] Trello board-head white-on-arbitrary-color.** `trello.css:62` hardcodes `color: var(--surface,#fff)`; background is an inline arbitrary board color (`trello.js:276`). Light/pastel boards make the title and buttons invisible. Fix: compute text color from board luminance or restrict board colors to a dark-safe palette.
  - Suggested command: `/impeccable audit` / `/impeccable overdrive`.
- **[P1] Runtime JS errors break two surfaces.** `tabsEl is not defined` (help.js:143, called from async renderTabs) → Help Center tabs never populate. `_paletteFocusTrap is not defined` (search.js:148, assigned to undeclared var inside a "use strict" IIFE) → Ctrl+K palette focus trap never registers. Both are strict-mode ReferenceErrors.
  - Fix: declare the vars (let/const) or reference via window. Suggested command: `/impeccable harden`.
- **[P1] Requester reaches the staff Manager Dashboard (info leak).** `viewDashboard` (core.js:231) has no role guard; a requester at `#/dashboard` sees org-wide counts, Unassigned, SLA breaches, Stale, Action Center. `/queue` is guarded but `/dashboard` is not. Also header reads "Manager Dashboard" for admins. Fix: guard + role-aware label.
  - Suggested command: `/impeccable harden` / `/impeccable clarify`.
- **[P1] Token/theme leakage & duplication.** `--success` and `--text` are referenced but never defined (ai.css, jira.css, app.css) — hidden via fallback chains. Trello defines its own duplicate `[data-theme="dark"]` block. The markdown renderer is copy-pasted three times (ai.js/help.js/kb.js). Fix: define tokens, fold Trello dark vars in, dedupe renderer.
  - Suggested command: `/impeccable document` / `/impeccable distill`.
- **[P2] Inconsistent destructive confirmation.** Bulk Close/Unassign (core.js:360) run with no confirm; single status changes partly unconfirmed. Match the delete pattern (confirmModal). Also replace raw status strings in Action Center (core.js:280) with statusBadge for parity + scanability.
  - Suggested command: `/impeccable harden`.
- **[P2] Jira board horizontal overflow** at 1440px (B: hOverflow TRUE) — board wider than viewport, only horizontal scroll. Add responsive column wrapping/min-width handling.
  - Suggested command: `/impeccable adapt`.
- **[P3] Mobile nav fully hidden** (app.css:87 sidebar display:none; only ☰ drawer). No persistent bottom-nav. Also four equal `stat.primary` rings (app.css:100) give the dashboard no single focal point; raw server messages in toasts.
  - Suggested command: `/impeccable adapt` / `/impeccable layout`.

## Persona Red Flags

**Jordan (First-Timer):** 20+ nav items with emoji icons + jargon (SLA, OKRs, velocity). Help Center — the one place to get guidance — has broken tabs (`tabsEl`), so the guided content never appears. Trello board titles invisible on pastel boards (white-on-pastel). Will abandon at step 2.

**Sam (Accessibility):** 69 contrast failures on the first dashboard alone (1.4:1 primary pair) — fails WCAG AA. Search palette focus trap is broken (`_paletteFocusTrap`), so keyboard users get no trap (and the listener silently fails to attach). No skip link; sidebar rebuilds on every route, dropping focus. Meaning is conveyed by text+color on badges (good), but the contrast makes the text unreadable.

**Alex (Power User):** Ctrl+K/J and G-nav shortcuts exist (good). But bulk Close/Unassign fire with zero confirmation — an expert who mis-clicks closes many tickets at once. Raw status strings in the Action Center slow scanning vs the badge-rich Queue.

**Casey (Mobile):** Primary nav is entirely behind the ☰ drawer on phones/tablets; the Jira board overflows horizontally with only scroll. Thumb-reachable primary actions are not guaranteed.

## Minor Observations

- Emoji nav icons (📊🗂️🤖❓) are multicolor, non-themeable, and clash in dark mode; they undercut a professional IT tone.
- "Manager Dashboard" label shown to Admin (core.js:290).
- Empty-state 🎉 in operational lists is slightly too playful for an IT desk.
- `skipped-heading` (1) flagged by live scan — check heading order on dashboard.
- Direct navigation to `/#/login` renders a blank `#app` (boot 401 → catch navigate("/login") but hash already /login, no hashchange).

## Questions to Consider

- What if the four modules shared ONE OpsDesk visual language instead of quoting Jira/Trello/Obsidian by name and color?
- Does the contrast failure (1.4:1 on the most-used status badge) matter enough to gate a release?
- What would a confident, single-branded IT desk look like — and is "familiar because it copies competitors" the goal or the accident?
