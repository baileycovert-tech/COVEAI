import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}"],
  // Preflight off: the app's existing semantic CSS (.card, .badge, …) is re-themed
  // in globals.css against the same tokens, so utilities and legacy classes coexist
  // cleanly during the incremental migration (no big-bang reset).
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: "hsl(var(--card))",
        "card-2": "hsl(var(--card-2))",
        popover: "hsl(var(--popover))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        faint: "hsl(var(--faint))",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        danger: "hsl(var(--danger))",
        purple: "hsl(var(--purple))",
        ford: "hsl(var(--ford))",
        chevy: "hsl(var(--chevy))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 6px)",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "-apple-system", "system-ui", "Segoe UI", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px hsl(var(--shadow-color) / 0.06), 0 4px 16px hsl(var(--shadow-color) / 0.08)",
        pop: "0 8px 30px hsl(var(--shadow-color) / 0.18)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0", transform: "translateY(4px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
      },
      animation: {
        "fade-in": "fade-in 0.18s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
