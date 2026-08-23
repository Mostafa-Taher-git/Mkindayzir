import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--color-bg-primary)",
        foreground: "var(--color-text-primary)",
        surface: "var(--color-bg-secondary)",
        "surface-container": "var(--color-bg-secondary)",
        "surface-container-high": "var(--color-bg-tertiary)",
        "surface-container-highest": "var(--color-bg-highest)",
        "surface-container-low": "var(--color-bg-lowest)",
        "on-surface": "var(--color-text-primary)",
        "on-surface-variant": "var(--color-text-secondary)",
        primary: {
          DEFAULT: "var(--color-accent)",
          foreground: "#ffffff",
          hover: "var(--color-accent-hover)",
          bright: "var(--color-accent-bright)",
          light: "var(--color-accent-light)",
          strong: "var(--color-accent-strong)",
        },
        secondary: {
          DEFAULT: "var(--color-text-secondary)",
          foreground: "var(--color-bg-primary)",
        },
        tertiary: {
          DEFAULT: "var(--color-text-muted)",
          foreground: "var(--color-bg-primary)",
        },
        error: {
          DEFAULT: "var(--color-error)",
          foreground: "#ffffff",
        },
        outline: "var(--color-border)",
        "outline-strong": "var(--color-border-strong)",
        card: "var(--color-bg-secondary)",
        "card-foreground": "var(--color-text-primary)",
        muted: "var(--color-bg-tertiary)",
        "muted-foreground": "var(--color-text-muted)",
        accent: "var(--color-bg-tertiary)",
        "accent-foreground": "var(--color-text-primary)",
        destructive: {
          DEFAULT: "var(--color-error)",
          foreground: "#ffffff",
        },
        border: "var(--color-border)",
        input: "var(--color-bg-secondary)",
        ring: "var(--color-accent-bright)",
        success: "var(--color-success)",
        warning: "var(--color-warning)",
        info: "var(--color-info)",
        "on-primary": "#ffffff",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
        display: ["var(--font-display)"],
      },
      fontSize: {
        xs: ["0.75rem", { lineHeight: "1.5" }],
        sm: ["0.875rem", { lineHeight: "1.5" }],
        base: ["1rem", { lineHeight: "1.6" }],
        lg: ["1.125rem", { lineHeight: "1.5" }],
        xl: ["1.25rem", { lineHeight: "1.3" }],
        "2xl": ["1.5rem", { lineHeight: "1.2" }],
        "3xl": ["1.875rem", { lineHeight: "1.15" }],
        "4xl": ["2.5rem", { lineHeight: "1.1" }],
        "5xl": ["3.25rem", { lineHeight: "1.05" }],
        "6xl": ["4rem", { lineHeight: "1.0" }],
      },
      borderRadius: {
        none: "0px",
        sm: "0px",
        md: "0px",
        lg: "0px",
        xl: "0px",
        "2xl": "0px",
        full: "9999px",
      },
      boxShadow: {
        bevel:
          "inset 0 1px 0 rgba(199,231,255,0.18), inset 0 -2px 0 rgba(0,0,0,0.45)",
        "bevel-red":
          "inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -2px 0 rgba(0,0,0,0.4)",
        "glow-red": "0 0 0 1px var(--color-accent), 0 0 14px -2px var(--color-accent-bright)",
        panel: "0 0 0 2px var(--color-border), 0 8px 24px -12px rgba(0,0,0,0.6)",
      },
      spacing: {
        "1": "4px",
        "2": "8px",
        "3": "12px",
        "4": "16px",
        "5": "20px",
        "6": "24px",
        "8": "32px",
        "10": "40px",
        "12": "48px",
        "16": "64px",
      },
      transitionTimingFunction: {
        power: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      maxWidth: {
        cockpit: "1440px",
      },
    },
  },
  plugins: [],
};

export default config;
