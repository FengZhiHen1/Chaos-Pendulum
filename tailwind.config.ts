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
        lab: {
          dark: "#0a0a0f",
          panel: "#14141f",
          border: "#2a2a3f",
          accent: "#6c5ce7",
          gold: "#f0c040",
          purple: "#a855f7",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
