---
name: Grendizer Heroic Industrial
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
This design system embodies a heroic, industrial aesthetic inspired by 1970s super-robot aesthetics. The brand personality is powerful, protective, and technologically advanced. It blends **Retro-Futurism** with **Modern Industrial** design, focusing on structural integrity and mechanical precision.

The UI should evoke a sense of "cockpit utility"—highly functional but emotionally resonant. It utilizes sharp geometry, heavy linework reminiscent of anime cel-shading, and metallic surface treatments to create a tactical, high-stakes professional environment.

## Colors
The palette is dominated by deep space and mechanical tones, punctuated by high-energy "Power Red."

- **Primary (Grendizer Red):** Used for critical actions, key alerts, and brand accents. It represents energy and urgency.
- **Secondary (Space Blue):** The primary background and structural color. It provides a deep, stable foundation for the interface.
- **Tertiary (Titanium White/Gold):** Primarily used for high-contrast text and "glowing" UI elements. 
- **Neutral (Mechanical Grey):** Used for secondary surfaces, borders, and inactive states, mimicking the look of brushed steel or alloy plating.

State-based variations should use increased luminosity for hover states and reduced saturation for disabled states.

## Typography
The typography strategy balances aggressive, wide-set headers with technical, high-legibility body text.

- **Headlines:** Set in **Sora**. Its geometric construction and slightly wide stance feel futuristic and assertive. Use "All Caps" for primary section headers to reinforce the heroic tone.
- **Body:** Set in **Hanken Grotesk**. This provides a professional, clean contrast to the bold headers, ensuring long-form content is readable within a technical interface.
- **Labels/Data:** Set in **JetBrains Mono**. This monospaced font is used for status indicators, coordinates, and technical metadata, emphasizing the "mechanical" nature of the system.

## Layout & Spacing
The layout follows a **Fixed Grid** philosophy to simulate physical panels and dashboard consoles.

- **Grid:** A 12-column grid for desktop with wide 24px gutters. Elements should feel "locked" into place, avoiding excessive fluidity that might feel flimsy.
- **Rhythm:** Uses a 4px baseline shift. Most vertical stacks should use 16px or 32px increments to maintain a rigid, structural feel.
- **Breakpoints:**
  - **Mobile:** 4 columns, 16px margins. Content stacks vertically.
  - **Tablet:** 8 columns, 24px margins. Sidebar navigation collapses to icons.
  - **Desktop:** 12 columns, 32px margins. Max-width of 1440px to ensure the interface feels contained and "engineered."

## Elevation & Depth
This design system rejects soft, ambient shadows in favor of **Tonal Layers** and **Hard Bevels**.

- **Z-Axis Hierarchy:** Depth is created by stacking lighter shades of Mechanical Grey or Space Blue on top of darker backgrounds. 
- **Hard Outlines:** Every container and card must have a 1px or 2px solid border. Use `Mechanical Grey` for standard containers and `Primary Red` for active or "powered-on" elements.
- **Metallic Gradients:** Use subtle linear gradients (top-to-bottom) on primary surfaces to simulate the sheen of painted metal armor.
- **Inner Glows:** Instead of drop shadows, use a 1px inner stroke of a lighter color on the top and left edges of buttons to create a "raised" tactile effect.

## Shapes
The shape language is strictly **Sharp and Angular**. 

Rounded corners are avoided to maintain an industrial, aggressive silhouette. To further the robotic aesthetic, use "clipped corners" (45-degree chamfers) on primary action buttons and main navigation tabs. This geometric motif mimics the joint plating and armor panels of a giant robot.

## Components
Consistent styling for core elements:

- **Buttons:** Sharp edges only. Primary buttons use a Grendizer Red background with Tertiary White text. Use a 2px "Mechanical Grey" bottom border to give a physical, pressable appearance.
- **Input Fields:** Dark Space Blue backgrounds with a 1px Mechanical Grey border. On focus, the border transitions to Grendizer Red with a subtle outer "glow" (0px blur, 2px spread).
- **Cards:** Defined by a heavy 2px border and a header bar with a slightly lighter tint than the body. Use the "Label" font for metadata in the card footer.
- **Chips:** Monospaced text inside a boxed border. For status (e.g., "ACTIVE"), use Grendizer Red text on a transparent background with a red border.
- **Progress Bars:** Segmented bars (resembling battery cells or power levels) instead of a continuous smooth fill.
- **Additional Component: "Status Panels":** Large, non-interactive displays that show high-level system data with oversized monospaced numerals.