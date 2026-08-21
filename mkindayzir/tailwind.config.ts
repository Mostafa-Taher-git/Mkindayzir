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
        background: "hsl(var(--color-bg-primary))",
        foreground: "hsl(var(--color-text-primary))",
        surface: "hsl(var(--color-bg-secondary))",
        "surface-container": "hsl(var(--color-bg-tertiary))",
        "surface-container-high": "hsl(var(--color-bg-tertiary))",
        "surface-container-highest": "hsl(var(--color-bg-tertiary))",
        "on-surface": "hsl(var(--color-text-primary))",
        primary: {
          DEFAULT: "hsl(var(--color-accent))",
          foreground: "hsl(var(--color-bg-primary))",
          hover: "hsl(var(--color-accent-hover))",
          container: "hsl(var(--color-accent-light))",
        },
        secondary: {
          DEFAULT: "hsl(var(--color-text-secondary))",
          foreground: "hsl(var(--color-bg-primary))",
        },
        tertiary: {
          DEFAULT: "hsl(var(--color-text-muted))",
          foreground: "hsl(var(--color-bg-primary))",
        },
        error: {
          DEFAULT: "hsl(var(--color-error))",
          foreground: "hsl(var(--color-bg-primary))",
        },
        outline: "hsl(var(--color-border))",
        card: "hsl(var(--color-bg-secondary))",
        "card-foreground": "hsl(var(--color-text-primary))",
        muted: "hsl(var(--color-bg-tertiary))",
        "muted-foreground": "hsl(var(--color-text-secondary))",
        accent: "hsl(var(--color-bg-tertiary))",
        "accent-foreground": "hsl(var(--color-text-primary))",
        destructive: {
          DEFAULT: "hsl(var(--color-error))",
          foreground: "hsl(var(--color-bg-primary))",
        },
        border: "hsl(var(--color-border))",
        input: "hsl(var(--color-bg-secondary))",
        ring: "hsl(var(--color-accent))",
        success: "hsl(var(--color-success))",
        warning: "hsl(var(--color-warning))",
        info: "hsl(var(--color-info))",
        "on-primary": "hsl(var(--color-bg-primary))",
        "on-secondary": "hsl(var(--color-text-primary))",
        "on-tertiary": "hsl(var(--color-text-primary))",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
        display: ["var(--font-display)"],
      },
      fontSize: {
        xs: ["var(--font-size-xs)", { lineHeight: "1.5" }],
        sm: ["var(--font-size-sm)", { lineHeight: "1.5" }],
        base: ["var(--font-size-base)", { lineHeight: "1.5" }],
        lg: ["var(--font-size-lg)", { lineHeight: "1.5" }],
        xl: ["var(--font-size-xl)", { lineHeight: "1.5" }],
        "2xl": ["var(--font-size-2xl)", { lineHeight: "1.5" }],
        "3xl": ["var(--font-size-3xl)", { lineHeight: "1.5" }],
      },
      borderRadius: {
        none: "var(--radius-none, 0px)",
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        full: "var(--radius-full)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
      },
      spacing: {
        "1": "var(--space-1)",
        "2": "var(--space-2)",
        "3": "var(--space-3)",
        "4": "var(--space-4)",
        "5": "var(--space-5)",
        "6": "var(--space-6)",
        "8": "var(--space-8)",
        "10": "var(--space-10)",
        "12": "var(--space-12)",
        "16": "var(--space-16)",
      },
      transitionDuration: {
        fast: "150ms",
        normal: "250ms",
      },
    },
  },
  plugins: [],
};

export default config;
