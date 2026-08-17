# OpsDesk Frontend Critique — impeccable

**Method:** dual-agent (A: sa-0-2eb7f6ec UX design-director · B: sa-1-5a5b9860 detector + technical audit)
**Date:** 2026-08-17
**Surface mode:** Operate (task-completion tool)
**Scope:** frontend only (templates/index.html, static/js/app.js, static/js/api.js, static/css/tokens.css, static/css/app.css)
**Visual note:** screenshot pipeline unavailable in review environment; review is grounded in source + deterministic detector, not pixels.

## Design Health Score (Nielsen 0–4)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | spinners/toasts exist; no per-filter result count |
| 2 | Match System / Real World | 3 | "Unassigned >4h" fluent; "→ In Progress" system-jargon |
| 3 | User Control & Freedom | 2 | no undo; status/claim/reopen fire instantly, no cancel |
| 4 | Consistency & Standards | 3 | token system disciplined; emoji nav + "→" prefixes break voice |
| 5 | Error Prevention | 2 | HTML `required` helps; status change uses raw `prompt()`, unvalidated |
| 6 | Recognition > Recall | 2 | ticket refs shown; no breadcrumbs; user must recall destination |
| 7 | Flexibility & Efficiency | 2 | applicable — no shortcuts, saved views, or bulk actions |
| 8 | Aesthetic & Minimalist | 3 | clean & tokenized; slightly dense |
| 9 | Help & Documentation | 1 | only login demo hint; no inline help/tooltips/SLA explainer |
| 10 | Error Recovery | 2 | applicable — raw err.message toasts; no field-level guidance |
| **Total** | | **23/40** | mid-range, real gaps |

## Technical audit scores (0–4)

| Dimension | Score | Key Issue |
|-----------|-------|-----------|
| Accessibility | 1 | non-semantic headings, unlabeled selects, invisible focus, no reduced-motion |
| Performance | 3 | tiny bundles, replaceChildren used; inline style recalc minor |
| Theming | 2 | strong tokens, but one hardcoded rgba + no dark mode |
| Responsive | 2 | 900px breakpoint good; ticket table overflows on mobile, no tablet step |
| Code quality | 2 | dead/duplicated logic, emoji w/o aria-hidden, prompt() for reasons |

## Deterministic detector

Ran `detect.mjs --no-design-system --no-advisory` on 5 frontend files → **1 finding: `overused-font` @ app.js:651**.
**This is a FALSE POSITIVE** — the match is inside the `file://` boot-error fallback inline string (`font-family:Inter,sans-serif`), not the real UI font (the app uses `--font-sans`, tokenized). The detector otherwise ran clean: **no hard-coded-color, no contrast, no advisory violations.** (Note: detector missed the genuine hardcoded `rgba(5,26,62,0.35)` in `.modal-backdrop` — a false negative.)

## Design Specificity Verdict

Largely **category-interchangeable SaaS** with genuine help-desk seams. Saves it: `ticket_ref` in mono, the 7-state status badge system, `row-urgent` inset, "Aged / Needs Attention" SLA flags, public-vs-internal comment split. Undercuts it: microcopy ("Internal Service Request Platform"), empty states, and create flow carry no help-desk voice.

## What's Working

- **Token discipline** — clean `tokens.css`, status→color mapping reused everywhere.
- **SLA awareness** — aged flags + `row-urgent` are genuinely ops-oriented.
- **Internal/public comment split** — visually distinct, correct permission gating.

## Priority Issues

- **[P0] Status change uses native `prompt()`** (jarring, unvalidated, blocks UI). Fix: reuse existing `openModal`. → `harden`
- **[P0] Broken a11y semantics + unlabeled controls + invisible focus** (no `<h1>`, select not in `<label>`, no `:focus-visible`). Fix: real headings, `<label>`/aria-label, focus outline. → `harden`
- **[P1] 8 equal-weight dashboard tiles overwhelm**; nothing pulls eye to New/Unassigned/Blocked. Fix: promote key tiles, demote rest. → `distill`
- **[P1] Undocumented concepts** (aged-flag meanings, internal notes, "what happens next"). Fix: tooltips + empty-state copy. → `onboard`
- **[P1] Live regions + modal a11y + reduced-motion missing.** Fix: `aria-live` toasts, `role=dialog`+Esc+focus-trap modal, reduced-motion. → `harden`
- **[P2] No dark mode.** Fix: `[data-theme=dark]` token overrides + toggle. → `adapt`
- **[P2] Ticket table overflows on mobile.** Fix: wrap in `overflow-x:auto`. → `layout`
- **[P2] Dead/duplicated logic + inline styles** (`viewMyRequests` identical if/else; scattered inline `style=`). → `clarify`
- **[P2] Misleading "My Requests" title for agents** (lists all tickets). Fix: distinct title/scope per role. → `clarify`
- **[P3] Emoji icons unannounced-safe** (add `aria-hidden`). → `harden`
- **[P3] Hardcoded rgba in modal backdrop** → tokenize. → `adapt`
- **[P3] Emoji nav + "→" prefixes fracture voice.** → `quieter` / `typeset`

## Persona Red Flags

- **Alex (Power User agent):** no keyboard shortcuts, no saved/quick filters, every status change opens prompt/modal, queue re-renders 5 controls each visit.
- **Jordan (First-Time requester):** create form gives no destination reassurance; after submit lands on agent-style detail (empty Conversation/Activity) with no "what's next"; 100-char subject limit hidden.
- **Morgan (Overwhelmed Manager):** "Manager Dashboard" but no manager-specific aggregation (SLA breaches, team load); 8 tiles + aged table overload; aged flags unexplained.

## Minor Observations

- `new` and `closed` both gray — newest/most-actionable looks identical to closed.
- Modal has no Esc-close/focus-trap.
- No focus management on route change.
- Reopen reachable two ways (requester button vs agent status) — inconsistent.
- Login prefills real-looking credentials (demo convenience, security-smell template).

## Frontend bug — `viewMyRequests`

Does **NOT** crash. `shell()` creates `<main class="main">` (line 123), so `$("#app .main").replaceChildren(wrap)` resolves. The ternary is **dead code** (both branches identical); it paints a blank main then swaps — wasteful, not broken.
