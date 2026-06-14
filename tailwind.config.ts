import type { Config } from "tailwindcss";
import { BREAKPOINTS } from "./src/shared/constants/breakpoints";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      screens: {
        sm: "640px",
        md: `${BREAKPOINTS.TABLET}px`,
        lg: `${BREAKPOINTS.DESKTOP_COMPACT}px`,
        xl: `${BREAKPOINTS.DESKTOP_WIDE}px`,
      },
      colors: {
        // ── Dark Room Surface System ──
        surface: {
          DEFAULT: "#1A1D22",
          dim: "#13161A",
          bright: "#23262C",
          "container-lowest": "#1E2127",
          "container-low": "#23262C",
          container: "#2A2D34",
          "container-high": "#31353D",
          "container-highest": "#3A3E47",
        },
        // ── Bright Stage / inverse-surface (3D viewport only) ──
        stage: {
          DEFAULT: "#EAECEF",
        },
        // ── On-surface text ──
        "on-surface": {
          DEFAULT: "#E8EAED",
          variant: "#9BA0AA",
        },
        // ── On-stage text (inside 3D viewport, = inverse-on-surface) ──
        "on-stage": {
          DEFAULT: "#1B1D21",
          variant: "#606670",
        },
        // ── Brand Accent (Tech Blue) ──
        primary: {
          DEFAULT: "#4B9FFF",
          container: "#1C3A5E",
          hover: "#6BB3FF",
          "focus-glow": "rgba(75, 159, 255, 0.25)",
        },
        "on-primary": {
          DEFAULT: "#0D1117",
        },
        // ── Secondary ──
        secondary: {
          DEFAULT: "#9BA0AA",
          container: "#2A2D34",
        },
        "on-secondary": {
          DEFAULT: "#1A1D22",
          container: "#E8EAED",
        },
        // ── Tertiary ──
        tertiary: {
          DEFAULT: "#2DD4BF",
          container: "#1A3E3A",
        },
        "on-tertiary": {
          DEFAULT: "#1A1D22",
          container: "#E8EAED",
        },
        // ── Error ──
        error: {
          DEFAULT: "#FF3B3B",
          container: "#5A1A1A",
        },
        "on-error": {
          DEFAULT: "#FFFFFF",
          container: "#FFFFFF",
        },
        // ── Outlines ──
        outline: {
          DEFAULT: "#4A4E57",
          variant: "rgba(155, 160, 170, 0.10)",
        },
        // ── Semantic Data Colors ──
        "force-gravity": "#4ADE80",
        "force-tension": "#F87171",
        "force-inertia": "#60A5FA",
        "trail-slow": "#3B82F6",
        "trail-fast": "#EF4444",
        "lyapunov-stable": "#1E3A5F",
        "lyapunov-neutral": "#2DD4BF",
        "lyapunov-chaotic": "#F97316",
        "separation-alert": "#FF3B3B",
      },
      fontFamily: {
        sans: ["Manrope", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      fontSize: {
        "display-lg": ["28px", { lineHeight: "1.3" }],
        headline: ["20px", { lineHeight: "1.4" }],
        title: ["16px", { lineHeight: "1.5" }],
        body: ["14px", { lineHeight: "1.6" }],
        "body-sm": ["12px", { lineHeight: "1.5" }],
        mono: ["13px", { lineHeight: "1.5" }],
      },
      borderRadius: {
        DEFAULT: "8px",
        modal: "12px",
      },
      spacing: {
        "panel-gap": "24px",
        "panel-breathe": "36px",
      },
      boxShadow: {
        "floating-modal": "0 12px 32px rgba(0, 0, 0, 0.4)",
        "card-hover": "0 2px 12px rgba(0, 0, 0, 0.3)",
        "alert-outer": "0 0 80px rgba(255, 59, 59, 0.35)",
        "thumb": "0 1px 4px rgba(0, 0, 0, 0.5)",
      },
      transitionDuration: {
        instant: "120ms",
        quick: "200ms",
        smooth: "300ms",
        dramatic: "600ms",
        ambient: "2000ms",
      },
      zIndex: {
        stage: "10",
        overlay: "20",
        "webgl-mask": "30",
        "error-boundary": "40",
        toast: "50",
        "story-overlay": "60",
      },
    },
  },
  plugins: [],
} satisfies Config;
