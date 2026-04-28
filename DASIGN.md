# DESIGN.md — 双摆混沌实验室 (Double Pendulum Chaos Lab)

---

## North Star: "Making Mathematical Beauty Visible"

**Core Principle**: The interface must amplify the intrinsic beauty of nonlinear dynamics without competing for attention. Every color, spacing decision, and animation exists to serve one purpose — making chaotic phenomena *feel* profound, precise, and undeniably beyond student-level work. The UI recedes; the physics speaks.

**Emotional Target**: A quiet, self-assured sophistication. Users should sense within 5 seconds of a demo video that this is not a classroom assignment — it is a polished scientific instrument disguised as visual art.

---

## Design Philosophy

### No-Line Rule — Strict
This project adopts the **No-Line Rule** rigorously. Boundaries between interface regions are defined **exclusively** through:
- Background tonal shifts (surface tokens)
- Whitespace breathing zones
- Elevation stacking (shadow depth, not dividers)

Traditional 1px borders and table grids are banned unless they carry **data semantics** (e.g., the axes of a bifurcation diagram, force vector lines). When a visual boundary is unavoidable, use **Ghost Borders**: `outline_variant` at 12–15% opacity, never solid.

### Rationale
A double pendulum in motion already produces dense visual information — trailing curves, phase portraits, heatmaps. Adding UI chrome borders would create visual noise that competes with the physics. No-Line Rule ensures the interface feels like a clean laboratory surface, not a crowded dashboard.

---

## Colors

### Brand Accent
- **Primary (`#1A6FE0`)** — Tech Blue. Reserved strictly for interactive controls, focus states, active indicators, and the global navigation highlight. Never used as decoration; every occurrence signals "this is actionable."

### Surface System (Light Theme)
The interface is built on a light background, maximizing contrast for scientific visualizations (dark trajectories, colored heatmaps).

| Token | Hex | Usage |
|:---|:---|:---|
| `surface` | `#FAFAFA` | Base page background — nearly white, warm undertone to avoid clinical coldness |
| `surface-container-lowest` | `#F3F4F6` | Primary content wells (3D viewport background, main canvas areas) |
| `surface-container-low` | `#EAECEF` | Secondary panels, card backgrounds |
| `surface-container` | `#E0E3E7` | Elevated cards, tooltip backgrounds |
| `surface-container-high` | `#D6DADF` | Floating modals, highest elevation surfaces |
| `on-surface` | `#1B1D21` | Primary text — near-black with warmth |
| `on-surface-variant` | `#606670` | Secondary text, labels, metadata |

### Semantic Data Colors (Protected)
These colors carry **physics meaning** and must never be repurposed for decoration.

| Token | Hex | Semantic Meaning |
|:---|:---|:---|
| `force-gravity` | `#2E8B57` | Gravity vector arrows — fixed vertical down |
| `force-tension` | `#D64545` | Rod tension vector arrows — along rod direction |
| `force-inertia` | `#5B8DEF` | Inertial force component — dashed arrow style |
| `trail-slow` | `#2B5EA7` | Low-velocity trail (stationary/periodic) |
| `trail-fast` | `#E8453C` | High-velocity trail (chaotic bursts) |
| `lyapunov-stable` | `#0D3B66` | λ < 0 — deep blue (stable region) |
| `lyapunov-neutral` | `#1A936F` | λ ≈ 0 — teal green (marginal) |
| `lyapunov-chaotic` | `#E85D04` | λ > 0 — orange-red (chaotic region) |

### Accent Variants (Derived from Primary)
| Token | Hex | Usage |
|:---|:---|:---|
| `primary-container` | `#D6E4FA` | Selected item backgrounds, hover fills |
| `primary-hover` | `#155BC4` | Button hover, link hover darkening |

### Dramatic Alert Color (Butterfly Effect)
- **Separation Alert (`#DC3545`)** — Used exclusively for the "complete decorrelation" moment in the butterfly effect comparator. A saturated crimson that appears only at the dramatic threshold (‖Δθ‖ > 90°), creating an unmistakable physiological signal.

### Glassmorphism (Floating Panels Only)
- Floating menus and context panels: `rgba(250, 250, 250, 0.82)` background + `backdrop-filter: blur(18px)`.
- Purpose: Maintain spatial context when panels overlay the 3D scene or heatmaps.

---

## Typography

### Typeface Selection

| Role | Font | Rationale |
|:---|:---|:---|
| **Headlines & Mode Labels** | **Inter** (SemiBold, weight 600) | Clean modern geometry. No serifs — the physics already carries enough complexity. Inter's tall x-height ensures readability on projection screens. |
| **Body & Controls** | **Inter** (Regular 400, Medium 500) | Unified reading experience. One family, multiple weights. |
| **Data Labels & Monospace** | **JetBrains Mono** | Parameter values, code editor, numerical readouts. Monospace signals precision; JetBrains Mono's ligatures add a subtle "research instrument" quality. |
| **Subtitles (Story Mode)** | **Inter** (Medium 500, letter-spacing: +0.02em) | Bottom-screen cinematic subtitles — medium weight for projection legibility. |

### Type Scale

| Token | Size / Line-height | Usage |
|:---|:---|:---|
| `display-lg` | 28px / 1.3 | Mode title in global nav (single word: 探索 / 分析 / 实验 / 故事) |
| `headline` | 20px / 1.4 | Section headers within modules |
| `title` | 16px / 1.5 | Card titles, panel headers |
| `body` | 14px / 1.6 | Primary body copy, control labels |
| `body-sm` | 12px / 1.5 | Secondary metadata, axis labels, helper text |
| `mono` | 13px / 1.5 | Parameter values, code, numerical readouts |

---

## Elevation & Depth

### Tonal Layering (Primary Mechanism)
Depth is created through background tone shifts, not heavy shadows. The surface token stack (`surface` → `surface-container-high`) provides a natural 6-level elevation system without a single box-shadow in the base layout.

### Shadow Usage (Reserved for Specific Signals)

| Element | Shadow Spec | Purpose |
|:---|:---|:---|
| **Floating Modals** | `0 8px 32px rgba(27, 29, 33, 0.06), 0 2px 8px rgba(27, 29, 33, 0.04)` | Soft, tinted shadows — barely perceptible but spatially effective |
| **Butterfly Alert Pulse** | `0 0 60px rgba(220, 53, 69, 0.25)` outer glow + slow animation | Dramatic edge glow during decorrelation event — the only "loud" shadow in the system |
| **Cards (hover state)** | `0 2px 16px rgba(27, 29, 33, 0.05)` | Subtle lift on hover for snapshot cards, no shadow at rest |

---

## Roundness

- **Global Corner Radius**: `8px` — Soft without feeling playful. Applies to cards, buttons, input fields, and panel edges.
- **Modal Corners**: `12px` — Slightly softer to distinguish floating surfaces.
- **Slider Thumbs**: `50%` (fully round) — Tactile grab targets.
- **3D Viewport Frame**: `0px` — Sharp edges. The simulation window is a "window into physics," not a UI component; sharp corners reinforce its role as a raw data viewport.

---

## Components

### Buttons

| Variant | Style | Usage |
|:---|:---|:---|
| **Primary** | Solid `primary` (`#1A6FE0`) bg, white text, `8px` radius. Hover: `primary-hover` (`#155BC4`). Focus ring: `primary` at 40% opacity, 3px offset. | One per view — the primary action (e.g., "Run Story," "Export Report") |
| **Secondary** | `surface-container` bg, `primary` text, no border. Hover: `primary-container` bg. | Supporting actions within panels |
| **Tertiary** | Transparent bg, `on-surface-variant` text. Hover: underline + `primary` color shift. | Inline actions, tool toggles, "Learn More" links |
| **Icon Button** | 36×36px touch target, `8px` radius, transparent bg. Active state: `primary-container` bg with `primary` icon. | Mode switchers, tool toggles |

### Sound Toggle (Critical Functionality)
The sonification activation button follows **functional clarity**, not mystery:
- Default state: Muted speaker icon, `surface-container` bg, `on-surface-variant` icon color. Subtle tooltip: "开启物理声效."
- Active state: Speaker icon with sound waves, `primary-container` bg, `primary` icon color. No animation loop — steady illumination signals "system is running," not "look at me."

### Cards (Snapshot, Report, Verification)
- No borders, no dividers.
- Background: `surface-container-low` at rest.
- Header + body separated by `16px` vertical whitespace, not a line.
- Hover: shift to `surface-container` background + subtle shadow lift (see Elevation section).

### Input Fields

| State | Style |
|:---|:---|
| **Rest** | White (`#FFFFFF`) bg, ghost border (`outline_variant` at 15% opacity), `8px` radius |
| **Focus** | Ghost border → `primary` at 60% opacity, `4px` offset glow `rgba(26, 111, 224, 0.15)` |
| **Error (Invalid Parameter)** | Ghost border → `#DC3545` at 80% opacity, input shake animation (3 cycles, 4px amplitude, 120ms). Tooltip appears above with valid range in Chinese. 3D scene freezes until parameter is legal. |
| **Disabled** | `surface-container-low` bg, text at 40% opacity |

### Sliders
- Track: `surface-container-high` bg, `4px` height, fully rounded.
- Active fill: `primary` gradient (solid, no gradient — precision over decoration).
- Thumb: `20×20px`, white fill, `primary` border (2px), `box-shadow: 0 1px 4px rgba(27,29,33,0.12)`. Hover: border width → 3px.
- Value label: `JetBrains Mono 13px` positioned above thumb, follows drag.

### Force Vector Arrows (3D Overlay)
- Gravity: `#2E8B57` (force-gravity), solid arrowhead, fixed vertical orientation.
- Tension: `#D64545` (force-tension), solid arrowhead, along rod axis.
- Inertia: `#5B8DEF` (force-inertia), **dashed** line style (6px dash, 4px gap), decomposed into tangential/normal components.
- Hover label: `rgba(250, 250, 250, 0.90)` glassmorphism tooltip showing magnitude (N) + direction angle.

### Trail System (3D Scene)
- Color: Interpolated along `trail-slow` (#2B5EA7) → `trail-fast` (#E8453C) spectrum using HSL interpolation (not RGB — preserves perceptual uniformity).
- Width: 2px (minimum, stationary) → 8px (maximum, high-velocity bursts). Linear mapping.
- Opacity: 85% (foreground trail segments), fading to 30% (oldest segments) via exponential decay.
- Persistence modes: 50 steps / 200 steps / 1000 steps / infinite / current-cycle-only. Mode switcher uses tertiary button style.

### Lyapunov Heatmap (Analysis Mode)
- Canvas 2D rendering. Color stops (perceptual, not linear):
  - λ < -0.5: `lyapunov-stable` (#0D3B66)
  - λ ≈ 0: `lyapunov-neutral` (#1A936F)
  - λ > 0.5: `lyapunov-chaotic` (#E85D04)
- Hover: Crosshair cursor. Tooltip (glassmorphism panel) shows precise λ value + parameter pair.
- Click: Auto-fills parameters into main control panel and launches 3D simulation.

### Bifurcation Diagram
- Monochrome plot area. Data points: `on-surface` at 70% opacity.
- Current parameter indicator: Vertical dashed line in `primary` color, 1px width (this is a *data line*, not a UI border — exempt from No-Line Rule).
- Box-select zoom: `primary-container` fill at 30% opacity during drag.

### Poincaré Section Panel (Secondary Panel)
- 2D scatter plot (θ₂ vs θ̇₂). Points: 4px diameter circles, `primary` color at 70% opacity.
- Newest points: full opacity. Older points: fade to 20% opacity over trajectory duration.
- Baseline comparison mode: Current trajectory = `primary`; historical baseline = `on-surface-variant` at 50% opacity.
- Position: Right-side panel (desktop) or tab-accessible (tablet). Never competes with 3D viewport — this is a "quiet observer" panel.

### Story Mode Controls
- Playback bar: Bottom of screen, semi-transparent `rgba(250,250,250,0.85)` + `backdrop-blur(12px)`.
- Subtitle text: Inter Medium 500, 16px, `on-surface`, center-aligned, letter-spacing +0.02em for projection legibility.
- Active control indicator: Pulsing `primary` glow on the current interactive element (button/slider that the story is referencing). Pulse: 2s cycle, opacity 40% ↔ 100%.
- "Skip to manual" button: Tertiary style, positioned in top-right corner, always available.

### Butterfly Effect Comparator (Dual Viewport)
- Divider between viewports: **4px gap** filled with `surface-container` — not a line, a breathing space that separates two universes.
- Pendulum A (left): Gold-tinted trail `#D4A017` overlay on standard trail colors.
- Pendulum B (right): Violet-tinted trail `#7B2D8E` overlay.
- Separation indicator: Live numerical display showing ‖Δθ‖ in `JetBrains Mono`, positioned at bottom center.
- **Dramatic Alert** (‖Δθ‖ > 90°):
  - Screen edges pulse with `separation-alert` (#DC3545) glow: `box-shadow: inset 0 0 80px rgba(220, 53, 69, 0.3)` transitioning over 600ms ease-out.
  - Central text "完全失相关" fades in (Inter SemiBold, 18px, white on crimson pill background), holds 1.5s, fades out.
  - Viewport divider expands momentarily from 4px to 12px (300ms ease-out, returns after 1s) — a visual "rift" between the two realities.
  - This is the **only** moment in the entire application where drama is permitted. All other interactions remain calm.

---

## Layout Architecture (Desktop Primary)

```
┌────────────────────────────────────────────────────────────┐
│  Global Navigation Bar (surface-container, 56px height)     │
│  [探索] [分析] [实验] [故事]                  [Sonification] │
│  Mode tabs: primary for active, on-surface-variant inactive │
├────────────────────────────────────────────────────────────┤
│  Left Panel           │  Central 3D Viewport  │ Right Panel │
│  (surface-dim,        │  (surface-container-  │ (surface-   │
│   280px fixed)        │   lowest, flex)       │  dim, 320px)│
│                       │                       │             │
│  • Parameter controls │  ► Double Pendulum    │ • Phase     │
│  • Initial conditions │    3D Scene           │   Space     │
│  • Trail settings     │                       │ • Poincaré  │
│  • View presets       │                       │ • Energy    │
│                       │                       │   Monitor   │
└────────────────────────────────────────────────────────────┘
```

### Responsive Breakpoints

| Breakpoint | Layout | Degradation Strategy |
|:---|:---|:---|
| ≥ 1280px | Full three-column. Left 280px / Center flex / Right 320px. | No degradation. |
| 768–1279px | Two-column: Left panel collapses to bottom drawer (48px handle). Right panels become tab-switched. | Sonification disabled (speaker limitations). Trail persistence limited to 200 steps. |
| < 768px | Single column. 3D viewport full-width. Controls in bottom sheet. Analysis panels in expandable accordion. | 3D shadows disabled. Trail persistence limited to 50 steps. Code editor disabled. Story mode and Explore mode only. |

---

## Micro-Interactions & Motion

### Timing Tokens
| Token | Duration | Easing | Usage |
|:---|:---|:---|:---|
| `instant` | 120ms | ease-out | Toggle switches, checkbox state changes |
| `quick` | 200ms | ease-out | Button hover→active, panel expand/collapse |
| `smooth` | 300ms | ease-in-out | Panel transitions, mode switches, card hovers |
| `dramatic` | 600ms | ease-out | Butterfly alert glow + rift animation |
| `ambient` | 2000ms | linear | Story mode control pulse, auto-rotation in demo mode |

### Mode Transition
- Switching between 探索/分析/实验/故事 modes: left + right panels cross-fade (200ms opacity transition) while the central 3D viewport remains **uninterrupted**. Simulation state must not flicker.

### Parameter Input Error
- Invalid input: Input field shakes (3 cycles, 4px horizontal amplitude, 120ms total). Red ghost border appears simultaneously. Tooltip with valid range fades in above (200ms delay, 200ms fade).

### Loading Sequence (Initial Application Load)
- Pyodide/WASM download: Determinate progress bar (gradient `primary` fill), percentage text (JetBrains Mono), estimated time remaining.
- Background: `surface` with subtle animated gradient mesh in `primary-container` tones — signals "system is alive and preparing."
- On completion: Progress bar slides up (300ms), main interface fades in (400ms).
- On failure: Progress bar turns amber, "Retry" button (Primary style) appears. Friendly Chinese error message.

### Snapshot Card Interaction
- Save: 3D scene "flashes" briefly (white overlay at 15% opacity, 150ms) — a camera shutter metaphor, subtle.
- Card appears in snapshot panel: slides in from top (250ms, ease-out, staggered for multiple cards).
- Hover: Card elevates (tonal shift + shadow, 200ms).
- Compare mode: Two selected cards get `primary-container` background, their trajectories overlay on 3D scene.

---

## Initial Loading Experience (SYS-04)

This is the **first impression** for judges and users. It must communicate sophistication before any physics is visible.

### Loading Screen Composition
1. **Background**: `surface` (#FAFAFA) with a slow ambient animation — soft gradient mesh in `primary-container` tones (#D6E4FA), shifting imperceptibly over a 20-second cycle. No visible repeating pattern.
2. **Center**: Application logo/name "双摆混沌实验室" in Inter SemiBold, 24px, `on-surface`. Below it, a tagline in Inter Regular, 14px, `on-surface-variant`: "浏览器内的非线性动力学研究终端".
3. **Progress Bar**: Centered below tagline, 320px wide, 4px height. Track: `surface-container` fill. Fill: solid `primary`. No percentage text on the bar — instead, a single line below reads "正在加载物理引擎…" (JetBrains Mono, 12px, `on-surface-variant`).
4. **Estimated Time**: "预计剩余 45 秒" in `body-sm`, updates every 5 seconds.
5. **Transition to App**: On 100% completion, the progress bar and text fade out simultaneously (200ms). The main interface fades in (400ms, staggered: nav first, then viewport, then panels).

### Failure State
- Progress bar fill shifts to `#E85D04` (warning amber, reusing lyapunov-chaotic for its "something is off" association).
- Text changes to "加载失败 — 请检查网络连接后重试" (`body`, `on-surface`).
- A "重试" button (Primary) appears below.
- Background animation continues — the system is still "alive," waiting.

---

## Demo Mode (STY-02) — Visual Presentation

When the user activates Demo Mode (one-click from Story Mode or standalone):

- All control panels, navigation text labels, and chart panels **smoothly fade out** (300ms, simultaneous).
- Navigation bar compresses to a thin 4px `primary` accent line at the top of the viewport.
- 3D viewport expands to **full viewport**.
- Auto-rotation begins: camera orbits at 0.5°/s around the pendulum.
- Watermark: "双摆混沌实验室 · DUT 2026" in `on-surface-variant` at 40% opacity, fixed to bottom-right corner, Inter Regular 11px, letter-spacing +0.04em. Present during manual screenshots, automatically embedded in image exports.
- Exit: Double-tap or Esc key. All UI elements fade back in (400ms).

---

## Design System Enforcement Rules

1. **No solid borders in layout chrome.** Ghost borders (outline_variant at 12–15%) are the maximum allowed boundary treatment.
2. **Semantic colors are sacred.** Never use `force-gravity`, `force-tension`, `trail-slow`, `lyapunov-stable`, or `separation-alert` for decorative purposes. They carry physics meaning.
3. **Primary blue is for interaction only.** If it's not clickable, focusable, or indicating active state, it should not be primary blue.
4. **One dramatic moment.** The butterfly decorrelation alert is the sole permitted "loud" visual event. No other animation may exceed the `smooth` (300ms) duration or use saturated reds.
5. **Monospace signals data.** Any numerical value displayed to the user (parameters, λ values, energy readings, timestamps) must use JetBrains Mono. This creates an implicit trust signal: "This is measured, not estimated."
6. **Whitespace is structural.** Panel separation relies on 24–32px gaps and tonal shifts, never dividers. When in doubt, add breathing room.
7. **Chinese-first, no i18n overhead.** All UI labels, tooltips, subtitles, and error messages are in Chinese. The monospace numerals and mathematical notation provide universal readability across languages.

---

## Appendix: Visual Priority Hierarchy

When screen real estate is constrained (tablet/mobile), elements recede in this order:

1. (Last to hide) 3D Viewport — never hidden
2. Parameter Controls — collapse to drawer
3. Phase Space / Poincaré panels — move to tabs
4. Sonification toggle — hide on tablet
5. Trail persistence options — reduce to presets
6. Code Editor — hide on mobile
7. 3D Shadows — disable on mobile
8. Force Vector Overlay — hide on mobile

The 3D scene is the soul of the application. Everything else serves it.

---

## Version

- **Document Version**: 1.0
- **Last Updated**: 2026-04-28
- **Derived From**: Visual Strategy Brief (Phase 1 Consultation) + 功能模块全拆解.md + 功能设计_v0.md
- **Template Reference**: 模板DESIGN.md.md (Alexandria — High-End Editorial)