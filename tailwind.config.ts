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
          "container-lowest": "#1E2127",
          "container-low": "#23262C",
          container: "#2A2D34",
          "container-high": "#31353D",
        },
        // ── Bright Stage (3D viewport only) ──
        stage: {
          DEFAULT: "#EAECEF",
        },
        // ── On-surface text ──
        "on-surface": {
          DEFAULT: "#E8EAED",
          variant: "#9BA0AA",
        },
        // ── On-stage text (inside 3D viewport) ──
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
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      borderRadius: {
        DEFAULT: "8px",
      },
    },
  },
  plugins: [],
} satisfies Config;
