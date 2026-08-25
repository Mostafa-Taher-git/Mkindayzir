---
name: Mkindayzir
colors:
  surface: '#131314'
  surface-dim: '#131314'
  surface-bright: '#39393a'
  surface-container-lowest: '#0e0e0f'
  surface-container-low: '#1c1b1c'
  surface-container: '#201f20'
  surface-container-high: '#2a2a2b'
  surface-container-highest: '#353435'
  on-surface: '#e5e2e2'
  on-surface-variant: '#c6c6cc'
  inverse-surface: '#e5e2e2'
  inverse-on-surface: '#313031'
  outline: '#909096'
  outline-variant: '#45474b'
  surface-tint: '#c2c6d5'
  primary: '#c2c6d5'
  on-primary: '#2c303b'
  primary-container: '#0b101a'
  on-primary-container: '#777c89'
  inverse-primary: '#5a5e6b'
  secondary: '#c0c8cd'
  on-secondary: '#2a3136'
  secondary-container: '#424a4f'
  on-secondary-container: '#b2b9bf'
  tertiary: '#96ccff'
  on-tertiary: '#003353'
  tertiary-container: '#001120'
  on-tertiary-container: '#4581b3'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#dee2f1'
  primary-fixed-dim: '#c2c6d5'
  on-primary-fixed: '#171c26'
  on-primary-fixed-variant: '#424752'
  secondary-fixed: '#dce4e9'
  secondary-fixed-dim: '#c0c8cd'
  on-secondary-fixed: '#151d21'
  on-secondary-fixed-variant: '#40484c'
  tertiary-fixed: '#cee5ff'
  tertiary-fixed-dim: '#96ccff'
  on-tertiary-fixed: '#001d32'
  on-tertiary-fixed-variant: '#004a75'
  background: '#131314'
  on-background: '#e5e2e2'
  surface-variant: '#353435'
typography:
  display-lg:
    fontFamily: Hanken Grotesk
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  headline-sm:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.1em
spacing:
  unit: 4px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 32px
  panel-padding: 24px
---

## Brand & Style
The design system embodies a "Modern Industrial Mecha" aesthetic, designed for high-stakes productivity where helpdesk speed meets project precision. The brand personality is authoritative and engineering-focused, evoking the feeling of a tactical command center. 

The visual style blends **Modern Corporate** reliability with **Glassmorphism** and **Brutalism** elements. It utilizes semi-transparent "HUD" (Heads-Up Display) panels, high-density information layouts, and sharp, aggressive geometry to convey a sense of futuristic efficiency and structural integrity.

## Colors
The palette is rooted in the "Deep Space" environment.
- **Primary (Deep Space Navy):** Used for base surfaces and background voids.
- **Secondary (Titanium Grey):** Used for structural borders, inactive states, and metallic accents.
- **Tertiary (Steel Blue):** The action color — interactive elements, links, progress indicators, and primary action buttons.
- **Crimson Red:** Reserved exclusively for danger and urgency — destructive buttons (Log out, Delete), critical tickets, SLA breaches, and the marketing CTA hover. Never for ordinary primary actions.
- **Radiant Gold:** Used for "VIP" status, priority highlights, and system-level achievements.
- **White:** Provides high-contrast legibility for primary text and iconography.

## Typography
Typography is split between human-centric readability and technical data presentation.
- **Headlines:** Hanken Grotesk provides a sharp, contemporary "Mecha" feel with tight kerning.
- **Body:** Inter is the workhorse for high-volume text in tickets and project descriptions.
- **Technical Data:** JetBrains Mono is used for Ticket IDs, timestamps, and metadata to reinforce the industrial, machine-like nature of the interface. 
- Use **All-Caps** for labels and section headers to mimic tactical displays.

## Layout & Spacing
The layout uses a **Fluid Grid** system built on a 4px baseline. 
- **Desktop:** 12-column grid with heavy 2px "Titanium" borders separating main application regions (Sidebar, Global Search, Main Stage, Inspector).
- **Density:** High-density layout is preferred. Minimize vertical white space in lists to maximize the "Data HUD" feel.
- **Breakpoints:** 
  - Mobile (<768px): Single column, hidden sidebar via hamburger.
  - Tablet (768px - 1280px): 8-column, collapsed sidebar icons.
  - Desktop (>1280px): 12-column with permanent Inspector panel on the right.

## Elevation & Depth
This design system avoids traditional drop shadows in favor of **Tonal Layers** and **Holographic Glows**.
- **Base:** Deep Space Navy (#0B101A).
- **Surface:** Semi-transparent Navy (85% opacity) with a 20px backdrop blur to create a glassmorphic effect.
- **Borders:** All panels must have a 1px or 2px solid border in Titanium Grey or Steel Blue. 
- **Active State Glow:** Instead of lifting an object, use an inner "Crimson" or "Steel Blue" glow (box-shadow: inset 0 0 10px) to indicate the active/selected state.
- **Holographic Accents:** Use subtle linear gradients on borders (Steel Blue to Transparent) to simulate light reflecting off metallic edges.

## Shapes
The shape language is **Strictly Geometric**. 
- All primary containers, buttons, and input fields must have **0px (Sharp) corners** to maintain the industrial, armored aesthetic. 
- **Beveled Accents:** For secondary decorative elements or status chips, use "clipped corners" (45-degree angles) via CSS `clip-path` to reinforce the Mecha design motif.

## Components
- **Buttons — one structure, two colors.** Every button shares the same armored anatomy: chamfered corners (`clip-path`, 45°), 2px Titanium border, JetBrains Mono uppercase text, inset bevel (`inset 0 1px 0` highlight + `inset 0 -2px 0` shadow), and a 1px translate-down press. Only the color semantics differ:
  - *Primary (default variant):* **Steel Blue fill at rest** (`#96ccff`) with deep-navy text (`#003353`) → brighter blue on hover (`#b8dcff`), blue border, and a blue ring+bloom (`0 0 0 1px` + soft glow). Used for every ordinary action: New Project, Save, Sign in, Add Card.
  - *Destructive:* **Crimson fill at rest** (`#ff5449`) with white text → brighter crimson on hover (`#ff6c63`) with a crimson ring+bloom. Used only for danger actions: Log out, Delete, role demotion confirmations.
  - *Outline / Secondary / Ghost:* Steel panel or transparent with Titanium borders; hover shifts border/text to Steel Blue. No fill change.
  - *Marketing CTA exception:* The landing "Enter Console" button rests as a steel panel and fills crimson on hover — the one sanctioned place crimson acts as a CTA hover.
- **Input Fields:** Dark background, 1px Titanium border. On focus, the border turns Steel Blue with a faint blue glow.
- **Status Chips:** Rectangular with JetBrains Mono text. Use Crimson for "Critical," Gold for "Priority," and Steel Blue for "In Progress."
- **Cards/Panels:** Semi-transparent background with a visible 1px Titanium frame. Top-left corners of cards may feature a small "Tech ID" tag in monospaced font.
- **Progress Bars:** Segmented bars (reminiscent of power levels) rather than smooth continuous fills.
- **Data Tables:** Heavy horizontal lines, no vertical lines. Hovering over a row should trigger a Steel Blue "scan line" effect.