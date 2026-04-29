# DESIGN.md — Double Pendulum Chaos Lab (Revised: Dark Stage Edition)

---

## North Star: "The Illuminated Experiment"

**Core Principle**: The interface is a dark observation room. All walls recede into shadow. Only the 3D simulation stage is lit — a clean, bright window into the raw beauty of chaotic motion. Control surfaces float in the penumbra, present but never intrusive. The physics speaks from the light.

**Emotional Target**: A quiet, intense focus. The user feels like a researcher leaning toward the only lit bench in a dark lab. The design says: *this is not a toy — this is an instrument*.

---

## Design Philosophy

### No-Line Rule — Absolute
Boundaries between interface regions are defined **exclusively** through:
- Tonal shifts within the dark surface spectrum
- Generous whitespace (36–48px breathing zones between panels)
- Elevation stacking (surface tokens, not box shadows)

**Light is a boundary.** The bright 3D stage (`#EAECEF`) against the surrounding darkness (`#1A1D22`) is the most powerful separator in the system. No frame, no border ⏤ just the stark contrast between the illuminated experiment and the dark room.

### Dark-First Stage Strategy
- **Dark Zone (Room)**: Page background, navigation bar, parameter panels, chart panels, modals. All use the dark surface token stack. These elements serve the experiment; they do not demand attention.
- **Light Zone (Stage)**: The central 3D viewport only. It uses the `stage` surface token — a warm light gray that maximizes contrast for colored trails, force vectors, and 3D geometry. It is the *sole* bright region on the screen.

---

## Colors

### Surface System (Dark Room)

| Token | Hex | Role |
|:---|:---|:---|
| `surface` | `#1A1D22` | Page base — deep gray, soft on the eyes during prolonged analysis |
| `surface-container-lowest` | `#1E2127` | Navigation bar background — a barely perceptible step above the page |
| `surface-container-low` | `#23262C` | Panel card backgrounds (parameter controls, chart panels) |
| `surface-container` | `#2A2D34` | Elevated cards, tooltip backgrounds, dropdown menus |
| `surface-container-high` | `#31353D` | Highest elevation surfaces — modals, dialogs |
| **`stage`** | **`#EAECEF`** | **The 3D viewport only** — warm light gray, the sole illuminated surface |
| `on-surface` | `#E8EAED` | Primary text on dark surfaces — high contrast, not pure white |
| `on-surface-variant` | `#9BA0AA` | Secondary text, metadata, helper labels on dark surfaces |
| `on-stage` | `#1B1D21` | Primary text inside the light viewport (HUD, measurement overlays) |
| `on-stage-variant` | `#606670` | Secondary text inside the light viewport |

### Brand Accent (Tech Blue — Adapted for Dark Backgrounds)

| Token | Hex | Usage |
|:---|:---|:---|
| `primary` | `#4B9FFF` | Interactive controls, focus states, active mode indicator, primary actions. Bright enough for WCAG AA on `#1A1D22`. |
| `primary-container` | `#1C3A5E` | Selected item backgrounds, hover fills on dark panels |
| `primary-hover` | `#6BB3FF` | Button hover brightening |
| `primary-focus-glow` | `rgba(75, 159, 255, 0.25)` | Focus ring on dark backgrounds |

### Semantic Data Colors (Protected — Optimized for Dark/Light Dual Use)

These colors carry physics meaning. They are designed to read clearly on both the **dark panels** (where they appear as data glyphs) and the **bright 3D stage** (where they appear as vectors and trails).

| Token | Hex | Semantic Meaning |
|:---|:---|:---|
| `force-gravity` | `#4ADE80` | Gravity vector arrows — a vivid, dark-safe green |
| `force-tension` | `#F87171` | Rod tension vector arrows — a saturated, readable red |
| `force-inertia` | `#60A5FA` | Inertial force component — dashed blue, distinct from primary |
| `trail-slow` | `#3B82F6` | Low-velocity trail (periodic motion) |
| `trail-fast` | `#EF4444` | High-velocity trail (chaotic bursts) |
| `lyapunov-stable` | `#1E3A5F` | Deep navy for λ < 0 regions (stable) on heatmaps |
| `lyapunov-neutral` | `#2DD4BF` | Teal for λ ≈ 0 (marginal) — glows subtly |
| `lyapunov-chaotic` | `#F97316` | Bright orange for λ > 0 (chaotic) — demands attention |
| `separation-alert` | `#FF3B3B` | Butterfly decorrelation pulse — the only "danger red," used once |

### Glassmorphism (Floating Panels on Dark Background)

- Background: `rgba(35, 38, 44, 0.85)` (dark, not light — panels hover in the room's shadow).
- Backdrop blur: `18px`.
- Use for: tooltips over the 3D stage, context menus, snapshot previews.

---

## Typography

### Typeface Selection

| Role | Font | Rationale |
|:---|:---|:---|
| **Headlines & Mode Labels** | **Inter** (SemiBold, weight 600) | Clean, modern, highly legible. Tall x-height for projection screens. |
| **Body & Controls** | **Inter** (Regular 400, Medium 500) | Unified reading experience. |
| **Data Labels & Monospace** | **JetBrains Mono** | Parameter values, code editor, numerical readouts. Ligatures add a refined instrument quality. |
| **Subtitles (Story Mode)** | **Inter** (Medium 500, letter-spacing: +0.02em) | Bottom-screen narrative text — optimized for distance viewing. |

### Type Scale

| Token | Size / Line-height | Usage |
|:---|:---|:---|
| `display-lg` | 28px / 1.3 | Mode title in nav (探索 / 分析 / 实验 / 故事) |
| `headline` | 20px / 1.4 | Section headers within dark panels |
| `title` | 16px / 1.5 | Card titles, panel headers |
| `body` | 14px / 1.6 | Primary body copy, control labels |
| `body-sm` | 12px / 1.5 | Secondary metadata, axis labels, helper text |
| `mono` | 13px / 1.5 | Parameter values, code, numerical readouts |

---

## Elevation & Depth

### Tonal Layering in Darkness

Depth is created by lightening the dark surface stack. There are no heavy shadows in the dark zone — the subtle luminance steps (`surface` → `surface-container-high`) are sufficient because the overall environment is low-light. The eye is sensitive to even 2–3% luminance changes.

### Reserved Shadows

| Element | Shadow Spec | Purpose |
|:---|:---|:---|
| **Floating Modals** | `0 12px 32px rgba(0, 0, 0, 0.4)` | Only on modals over the 3D stage — a deep, tinted shadow that pushes the modal into the foreground without a bright outline. |
| **Butterfly Alert Pulse** | `0 0 80px rgba(255, 59, 59, 0.35)` outer glow | Dramatic edge glow during decorrelation — the only "loud" light in the entire application. |
| **Cards (hover on dark panels)** | `0 2px 12px rgba(0, 0, 0, 0.3)` | Subtle lift on snapshot cards. No shadow at rest. |

---

## Roundness

- **Global Corner Radius**: `8px` — Soft, modern, never playful. Applied to cards, buttons, input fields, and panel edges.
- **Modal Corners**: `12px` — Slightly softer to distinguish floating surfaces.
- **Slider Thumbs**: `50%` (fully round) — Tactile grab targets.
- **3D Viewport Frame**: `0px` — Sharp, frameless. The bright stage meets the dark room with a hard, clean edge. No rounding, no border. This is a window.

---

## Components

All components in dark panels use the dark surface token stack unless otherwise noted.

### Buttons

| Variant | Style |
|:---|:---|
| **Primary** | Solid `primary` (`#4B9FFF`) bg, `#0D1117` (near-black) text for contrast, `8px` radius. Hover: `primary-hover` (`#6BB3FF`). Focus ring: `primary-focus-glow`. |
| **Secondary** | `surface-container` bg, `primary` text. Hover: `primary-container` bg. |
| **Tertiary** | Transparent bg, `on-surface-variant` text. Hover: primary text color shift + subtle underline. |
| **Icon Button** | 40×40px touch target (critical in dark environment), `8px` radius, transparent bg. Active: `primary-container` bg with `primary` icon. |

### Sound Toggle

- Default (muted): Speaker icon with slash, `on-surface-variant` color, `surface-container-low` bg. Tooltip: "开启物理声效".
- Active (unmuted): Speaker icon with waves, `primary` color, `primary-container` bg. Steady illumination — no animation loop.

### Cards

- Background: `surface-container-low` at rest.
- No borders, no dividers. Sections separated by `16px` vertical whitespace.
- Hover: shifts to `surface-container` background + subtle shadow.

### Input Fields

| State | Style |
|:---|:---|
| **Rest** | `surface-container-low` bg, ghost border (`on-surface-variant` at 10% opacity), `8px` radius. Text: `on-surface`. |
| **Focus** | Ghost border → `primary` at 70% opacity. `primary-focus-glow` box shadow. |
| **Error** | Ghost border → `#FF3B3B` at 80% opacity. Shake animation (3 cycles, 4px, 120ms). Tooltip with valid range in Chinese appears above. 3D scene freezes. |
| **Disabled** | `surface` bg, text at 30% opacity. |

### Sliders

- Track: `surface-container-high` bg, `4px` height, fully rounded.
- Active fill: `primary` solid color.
- Thumb: `20×20px`, `surface-container` fill, `primary` border (2px). Hover: border → 3px. Shadow: `0 1px 4px rgba(0,0,0,0.5)`.
- Value label: `JetBrains Mono 13px`, `on-surface`, follows drag.

### Trail System (Inside the Bright 3D Stage)

- Background: The `stage` (#EAECEF) provides maximum contrast.
- Color: Interpolated from `trail-slow` (`#3B82F6`) to `trail-fast` (`#EF4444`) via HSL path.
- Width: 2px (min) → 8px (max), linear with velocity.
- Opacity: 95% (new) fading to 25% (old). Exponential decay.

### Lyapunov Heatmap (Dark Panel)

- Canvas 2D on `surface-container-low` background.
- Color stops: `lyapunov-stable` (#1E3A5F) → `lyapunov-neutral` (#2DD4BF) → `lyapunov-chaotic` (#F97316).
- Hover: crosshair, glass tooltip (`rgba(35,38,44,0.92)` with `on-surface` text).
- Click: auto-fills parameters and launches 3D simulation on the bright stage.

### Butterfly Effect Comparator (Dual Viewport)

- Both viewports share the `stage` background.
- Divider: **4px gap** filled with `surface` (#1A1D22) — a dark rift separating two bright realities.
- Pendulum A: gold-tinted trail `#FBBF24`.
- Pendulum B: violet-tinted trail `#A78BFA`.
- Separation readout: `JetBrains Mono`, `on-stage` text, bottom center.
- **Decorrelation Alert** (‖Δθ‖ > 90°):
  - The dark divider gap expands from 4px to 12px (300ms ease-out, returns after 1s).
  - Screen edges pulse with `separation-alert` glow: `inset 0 0 100px rgba(255,59,59,0.3)`.
  - Central text "完全失相关" appears: Inter SemiBold 18px, white on `separation-alert` pill, holds 1.5s.
  - This is the only dramatic moment in the entire application. All other motion is calm.

### Poincaré Section Panel (Dark Side Panel)

- Dark panel: `surface-container-low` bg.
- Scatter plot points: 4px circles, `primary` color at 80% opacity.
- New points: full opacity; older points fade to 15%.
- Compare mode: current = `primary`; historical baseline = `on-surface-variant` at 50%.

---

## Layout Architecture (Desktop Primary)

```
┌──────────────────────────────────────────────────────────────┐
│  Nav Bar (surface-container-lowest, 56px, no border)          │
│  [探索] [分析] [实验] [故事]                   [🔊]           │
│  Active mode: primary text + subtle primary underline        │
├──────────────┬───────────────────────────────┬───────────────┤
│ Left Panel   │  Central 3D Stage (stage bg)  │ Right Panel   │
│ (surface     │                               │ (surface      │
│  -container- │  ► Double Pendulum Motion     │  -container-  │
│  low, 280px) │     in bright isolation       │  low, 320px)  │
│              │                               │               │
│ • Parameters │  (The only illuminated region  │ • Phase Space │
│ • Trail opts │   on the entire screen)        │ • Poincaré    │
│ • View pres.│                               │ • Energy      │
└──────────────┴───────────────────────────────┴───────────────┘
```

- Left/Right panels: Dark, recessed. Their content uses `on-surface` / `on-surface-variant` text.
- Central stage: Bright, prominent. The eye goes there immediately.
- Gap between panels: `24px` of `surface` (#1A1D22) — no dividers, just darkness.

### Responsive Breakpoints

| Breakpoint | Layout | Degradation |
|:---|:---|:---|
| ≥ 1280px | Full 3-column. Left 280 / Center flex / Right 320. | None. |
| 768–1279px | 2-column: Left panel collapses to bottom drawer. Right panel tabs. | Sonification hidden. Trail max 200 steps. |
| < 768px | Single column. 3D stage full-width. Bottom sheet for controls. Analysis in accordion. | 3D shadows off. Trail max 50 steps. Code editor hidden. |

---

## Micro-Interactions & Motion

### Timing Tokens (Unchanged)

| Token | Duration | Easing | Usage |
|:---|:---|:---|:---|
| `instant` | 120ms | ease-out | Toggles |
| `quick` | 200ms | ease-out | Button hover→active, panel expand |
| `smooth` | 300ms | ease-in-out | Mode transitions, card hovers |
| `dramatic` | 600ms | ease-out | Butterfly alert only |
| `ambient` | 2000ms | linear | Story mode pulse, demo auto-rotation |

### Mode Transition
- Dark panels cross-fade (200ms opacity). The central bright 3D stage remains **completely static** — no flicker, no reload. Simulation state is preserved.

### Parameter Input Error
- Shake animation on the dark input field, red ghost border, tooltip above. 3D stage freezes but remains bright.

---

## Initial Loading Experience

The loading screen is the first moment a judge sees. It must feel like the lights are dimming before an experiment begins.

- **Background**: `surface` (#1A1D22) — full dark.
- **Center element**: "双摆混沌实验室" in Inter SemiBold 24px, `on-surface`. Tagline in `on-surface-variant`.
- **Progress bar**: Track `surface-container`. Fill `primary`. Text below: "正在加载物理引擎…" in JetBrains Mono 12px.
- **ETA**: "预计剩余 45 秒" in `body-sm`, `on-surface-variant`.
- **Transition to app**: Progress fades out (200ms). The bright 3D stage fades in *first* (400ms), as if a light switches on. Dark panels fade in staggered after the stage is visible.

---

## Demo Mode (Presentation)

- All dark panels and nav text fade out (300ms). Only the bright 3D stage remains, now filling the viewport.
- A thin 4px `primary` accent line at the top of the screen is the sole UI remnant.
- Auto-rotation: 0.5°/s.
- Watermark: "双摆混沌实验室 · DUT 2026" fixed bottom-right, `on-surface-variant` at 40% opacity. Embedded in exports.

---

## Design System Enforcement Rules

1. **The stage is the only light.** No other surface may use the `stage` token or any color brighter than `surface-container`.
2. **No solid borders.** Ghost borders (10–12% opacity) are the maximum allowed. The light/dark edge between stage and room is borderless — pure contrast.
3. **Semantic colors are immutable.** Never use `force-gravity`, `trail-slow`, `separation-alert`, etc. for decoration.
4. **Primary blue signals interaction.** It appears only on clickable, focusable, or active elements.
5. **One dramatic moment.** The butterfly decorrelation alert is the sole exception to the calm, dark aesthetic.
6. **Monospace = measurement.** All numerical data uses JetBrains Mono.
7. **Whitespace is structure.** Panel separation uses 24–48px gaps and tonal shifts within the dark stack.

---

## Appendix: Visual Priority in the Dark

When screen space is limited, darkness recedes first — the light stays.

1. (Last to go) The bright 3D stage — always visible.
2. Parameter controls — collapse into dark drawer.
3. Analysis panels — move to tabs.
4. Sonification — hide on tablet.
5. Trail options — reduce.
6. Code editor — hide on mobile.
7. 3D shadows — disable on mobile (performance).
8. Force vectors — hide on mobile.

The illuminated experiment is the soul. Everything else exists in service of that light.

---

## Version

- **Document Version**: 2.0 — Dark Stage Revision
- **Last Updated**: 2026-04-28
- **Derived From**: Visual Strategy Brief (Phase 1) + Dark/Light Re-allocation Decision + 功能模块全拆解.md + 功能设计_v0.md
- **Template Reference**: Alexandria — High-End Editorial (adapted for dark-first scientific UI)