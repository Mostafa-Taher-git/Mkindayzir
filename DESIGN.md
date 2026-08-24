---
name: Grendizer Heroic Industrial
version: 2.0
mode: Operate
theme-default: light
colors:
  surface: '#001522'
  surface-dim: '#001522'
  surface-bright: '#003d59'
  surface-container-lowest: '#00101b'
  surface-container-low: '#001e2e'
  surface-container: '#002234'
  surface-container-high: '#002d43'
  surface-container-highest: '#003952'
  on-surface: '#c7e7ff'
  on-surface-variant: '#e4bebc'
  inverse-surface: '#c7e7ff'
  inverse-on-surface: '#00344c'
  outline: '#ab8987'
  outline-variant: '#5b403f'
  surface-tint: '#ffb3b1'
  primary: '#ffb3b1'
  on-primary: '#680011'
  primary-container: '#ff535b'
  on-primary-container: '#5b000e'
  inverse-primary: '#bb152c'
  secondary: '#b0c7f1'
  on-secondary: '#183153'
  secondary-container: '#334a6d'
  on-secondary-container: '#a2b9e2'
  tertiary: '#c0c9be'
  on-tertiary: '#2a322b'
  tertiary-container: '#8a9389'
  on-tertiary-container: '#242c24'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdad8'
  primary-fixed-dim: '#ffb3b1'
  on-primary-fixed: '#410007'
  on-primary-fixed-variant: '#92001c'
  secondary-fixed: '#d5e3ff'
  secondary-fixed-dim: '#b0c7f1'
  on-secondary-fixed: '#001b3c'
  on-secondary-fixed-variant: '#30476a'
  tertiary-fixed: '#dce5d9'
  tertiary-fixed-dim: '#c0c9be'
  on-tertiary-fixed: '#161d16'
  on-tertiary-fixed-variant: '#404940'
  background: '#001522'
  on-background: '#c7e7ff'
  surface-variant: '#003952'
colors-light:
  background: '#f2f5f8'
  surface: '#ffffff'
  surface-container-lowest: '#fafcfd'
  surface-container-low: '#f2f5f8'
  surface-container: '#ffffff'
  surface-container-high: '#e7edf3'
  surface-container-highest: '#dbe4ec'
  on-surface: '#10293d'
  on-surface-variant: '#3d5a75'
  outline: '#b9c8d6'
  outline-strong: '#8fa5b8'
  outline-variant: '#dde6ee'
  primary: '#bb152c'
  on-primary: '#ffffff'
  primary-hover: '#d61f33'
  primary-bright: '#ff535b'
  success: '#147a52'
  warning: '#8a5a00'
  error: '#b3261e'
  info: '#2c4a78'
typography:
  display-lg:
    fontFamily: Sora
    fontSize: 48px
    fontWeight: '800'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Sora
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
  headline-lg-mobile:
    fontFamily: Sora
    fontSize: 24px
    fontWeight: '700'
    lineHeight: '1.2'
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.0'
    letterSpacing: 0.05em
spacing:
  unit: 4px
  gutter: 24px
  margin-edge: 32px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
---

## Brand & Style
Grendizer Heroic Industrial — a heroic-industrial design language inspired by
1970s super-robot aesthetics, tuned for **professional helpdesk and project
management use**. The brand personality is powerful, protective, and precise:
a cockpit that operators trust all day, not a theme park.

**v2 tone shift (user decision):** the cockpit stays, the cosplay goes.
Headlines are no longer forced to ALL CAPS; sentence case with Sora's
geometric weight carries the authority. Emoji are banned from UI chrome —
all icons are 2px-stroke angular SVGs (`src/components/icons/grendizer.tsx`).

## Themes — LIGHT IS THE DEFAULT
- **Light ("Day Ops") is the primary theme.** Bright hangar white-blue
  surfaces (`#f2f5f8` app background, `#ffffff` cards), steel borders
  (`#b9c8d6`), ink `#10293d` (AA on white), Power Red accents unchanged.
- **Dark ("Deep Space") remains fully supported** for night shifts.
- Default is set pre-paint in `index.html`; the user's explicit choice is
  stored in `localStorage("mkindayzir-theme")`.
- Every component must read from the CSS custom properties — never hardcode
  hex values in components. Both themes are first-class.

## Colors
- **Primary (Grendizer Red `#bb152c`):** critical actions, active states,
  powered-on indicators. One red action per view region.
- **Structure (Space Blue / Hangar White):** backgrounds, panels, cards.
- **Steel (borders):** 2px solid borders on all containers; `outline-strong`
  for emphasis, `outline-variant` for hairlines.
- **Status:** success `#147a52`, warning `#8a5a00`, error `#b3261e`,
  info `#2c4a78` (light) — always paired with an icon, never color alone.

## Typography
- **Headlines: Sora** — geometric, assertive. Sentence case. Page titles 28px/800.
- **Body: Hanken Grotesk** — clean, high legibility.
- **Labels/data: JetBrains Mono** — counts, statuses, metadata, timestamps.
  Uppercase + letterspaced ONLY for tiny section labels (`.uppercase-label`).

## Layout & Spacing
- 12-column desktop grid, 24px gutters, max-width 1440px.
- 4px baseline; vertical rhythm in 16px/32px steps.
- Breakpoints: mobile 4-col/16px margins; tablet 8-col/24px (sidebar collapses
  to icons); desktop 12-col/32px.

## Elevation & Depth
- **Tonal layers + hard bevels, no soft ambient shadows.**
- Hover affordance: `0 2px 0 0 var(--color-border-strong)` (a physical press edge).
- Active/primary elements: `.glow-red` (1px ring + tight red bloom).
- Panels: `.panel` (metal sheen gradient + 2px steel border).

## Shapes
- **Sharp and angular.** `--radius: 0px` globally.
- Complete/check indicators use 3px-rounded squares (not circles).
- 45° chamfers (`.chamfer`) reserved for primary hero actions only.

## Components (board/workspace specifics)
- **Cards (kanban):** 2px steel border, solid `bg-card`, sharp corners.
  Complete = red-free green square-check + strikethrough title.
  Badges row in mono 11px. Hover reveals Edit/Archive icon buttons top-right.
- **Lists:** solid `bg-surface` body (must stay readable over board photo
  backgrounds), header with mono count chip in a boxed border, `⋯` actions menu.
- **Board backgrounds:** photo → fine dark overlay (0–85%, user-adjusted) →
  translucent header strip → hard cards. Colors from `BOARD_BACKGROUNDS`.
- **Buttons:** sharp; primary uses red sheen; secondary 2px steel border.
- **Inputs:** surface background, 2px steel border, red focus ring (never default blue).
- **Icons:** exclusively from `src/components/icons/grendizer.tsx`
  (2px stroke, square caps). No emoji in chrome, buttons, or menus.
- **Dialogs:** 2px steel border, header row with mono context chip
  (e.g. list name), sharp corners, `max-h-[92vh]` scroll.

## Motion
- `--transition: 160ms cubic-bezier(0.2,0.8,0.2,1)` for hovers/focus.
- Entrance: `.animate-power-on` (280ms, exponential ease-out) — once per view,
  never on data updates.
- No bounce, no parallax, no decorative loops. `prefers-reduced-motion` honored.

## Accessibility floor
- Text contrast ≥ 4.5:1 in both themes (verified for ink/border tokens).
- Focus-visible: 2px `--color-accent-bright` outline, 2px offset, everywhere.
- Icon-only buttons require `aria-label` + `title` (tooltips).
- Status never conveyed by color alone (icon or text accompanies it).
