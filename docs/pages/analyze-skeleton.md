# 分析模式 — 页面骨架

## 元信息

| 字段 | 内容 |
|------|------|
| 页面名称 | 分析模式 (Analyze Mode) |
| 页面 ID | analyze |
| 目标平台 | web（桌面端为主，向下兼容平板/窄屏 web viewport） |
| 设计作用域 | analyze feature 的 View 层；仅 Web 端，不含小程序 |
| 关联 feature | analyze / simulation（双向联动） |
| 美学方向 | Dark Room / Illuminated Experiment — 暗室诊断终端 |
| 设计来源 | DESIGN.md、analyze/contracts/analysis-tools.contract.ts、analyze/view/README.md |

## 已锚定 Logic-ID 清单

| Logic-ID | 名称 | 来源契约 | 状态 |
|----------|------|---------|------|
| ANL_NAV | 视图切换与页头 | `analyze/contracts/analysis-tools.contract.ts`（IAnalysisSceneBridge） | 已确认 |
| ANL_CONTROLS | 分析控制面板 | `analyze/types.ts`、`analyze/viewModel/stores/analyzeSlice.ts` | 已确认 |
| ANL-01 | Lyapunov 指数热力图 | `analyze/contracts/analysis-tools.contract.ts` | 已确认 |
| ANL-02 | 参数空间分岔图 | `analyze/contracts/analysis-tools.contract.ts` | 已确认 |
| ANL-03 | 庞加莱截面 | `analyze/contracts/analysis-tools.contract.ts`（IPoincareController） | 已确认 |
| ANL-04 | 能量景观地形图 | `analyze/contracts/analysis-tools.contract.ts`（IEnergyLandscapeConfig） | 已确认 |
| SYS-03 | 预计算数据管线 | `analyze/contracts/analysis-tools.contract.ts`（IPrecomputePipeline） | 已确认 |

---

## Web 桌面端布局（≥1024px）

### 整体布局树

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ GlobalNavBar (48px, surface-container-lowest)                                │
│ [探索] [分析] [实验] [故事]                                                   │
├───────────────┬──────────────────────────────────────────────────────────────┤
│               │  Page Header (ANL_NAV)                                       │
│  Left Panel   │  ┌─ 模式标题 / 副标题                                         │
│  (280px       │  └─ 视图 Tabs [λ] [分岔图] [庞加莱] [能量景观]                │
│   fixed)      │                                                              │
│               │  ┌────────────────────────────────────────────────────────┐  │
│ ┌───────────┐ │  │                                                        │  │
│ │ Panel     │ │  │     Main Chart Stage (ANL_CHART_STAGE)                 │  │
│ │ Header    │ │  │     surface-container-low, rounded-xl, shadow          │  │
│ │ (title +  │ │  │                                                        │  │
│ │  status)  │ │  │  ┌────────────────────────────────────────────────┐  │  │
│ ├───────────┤ │  │  │ LyapunovHeatmap / BifurcationPlot /             │  │
│ │ Current   │ │  │  │ PoincareSection / EnergyLandscape                │  │
│ │ View Card │ │  │  │ (conditional by activeView)                      │  │
│ ├───────────┤ │  │  └────────────────────────────────────────────────┘  │  │
│ │ Layer     │ │  │                                                        │  │
│ │ Selector  │ │  │  ─ 顶部径向微光 (primary 0.06 opacity)              │  │
│ │ (ANL-01)  │ │  │  ─ hover tooltip / cursor overlay                    │  │
│ ├───────────┤ │  │  ─ loading / error / empty states                    │  │
│ │ Damping   │ │  │                                                        │  │
│ │ Slider    │ │  └────────────────────────────────────────────────────────┘  │
│ │ (ANL-01)  │ │                                                              │
│ ├───────────┤ │                                                              │
│ │ Color     │ │                                                              │
│ │ Legend    │ │                                                              │
│ │ (ANL-01)  │ │                                                              │
│ ├───────────┤ │                                                              │
│ │ Fixed     │ │                                                              │
│ │ Params    │ │                                                              │
│ ├───────────┤ │                                                              │
│ │ Status    │ │                                                              │
│ │ Footer    │ │                                                              │
│ └───────────┘ │                                                              │
└───────────────┴──────────────────────────────────────────────────────────────┘
```

### 关键尺寸

| 元素 | 宽度 | 高度 | 背景 / 样式 |
|------|------|------|-------------|
| 左侧控制面板 | 280px 固定 | 占满主内容区 | `bg-surface-container-lowest` |
| 主图表区容器 | flex-1 | 占满剩余空间 | `bg-surface-container-low rounded-xl shadow-floating-modal` |
| 页头 | 100% | auto | 无独立背景，融入 surface |
| 视图 Tabs | 100% | 36px | `bg-transparent`，选中项 `bg-surface-container-low` |
| 控制面板内部卡片 | 100% | auto | `bg-surface-container rounded-lg` |

### 间距系统

- 页面外边缘：`24px`（`gutter-desktop`）
- 左侧面板内边距：`20px`
- 面板内功能块间距：`20px`
- 控制卡内边距：`12px`
- 图表区与页头间距：`12px`
- 图表区内边距：无（Canvas 铺满）

---

## Web 窄屏适配（<1024px）

> 目标平台仍为 web，仅对 viewport 宽度做降级。分析模式以桌面端为主，窄屏下控制面板收拢，保证图表可用。

### 平板（768px–1023px）

```
┌────────────────────────────────────┐
│ GlobalNavBar                        │
├────────────────────────────────────┤
│ Page Header + Tabs (ANL_NAV)        │
├────────────────────────────────────┤
│                                    │
│ Main Chart Stage (ANL_CHART_STAGE) │
│                                    │
├────────────────────────────────────┤
│ Control Panel Trigger Bar          │
│ → click to open bottom drawer      │
└────────────────────────────────────┘
```

- 左侧 280px 面板隐藏。
- 页头标题与副标题保留，Tabs 文字完整。
- 底部出现「控制面板入口条」，点击弹出 Bottom Sheet（默认半高，可拖拽全屏）。
- 图表区 margin 改为 `16px`。

### 窄屏手机（<768px）

```
┌────────────────────────┐
│ GlobalNavBar            │
├────────────────────────┤
│ Compact Header + Tabs   │
│ [λ] [分叉] [截面] [能量] │
├────────────────────────┤
│                        │
│ Main Chart Stage       │
│                        │
├────────────────────────┤
│ Control Trigger Bar     │
├────────────────────────┤
│ Bottom GlobalNavBar     │
└────────────────────────┘
```

- 模式副标题隐藏，标题字号缩小。
- Tabs 文字缩短为单字/符号：`λ / 分叉 / 截面 / 能量`。
- 控制面板完全由底部入口条触发全屏 Sheet。
- 图表区 margin `12px`，底部预留 `env(safe-area-inset-bottom)`。

---

## 功能块详述

### 功能块 A — 页头与视图切换（ANL_NAV）

- **职责**：标识当前模式，提供 4 个分析视图的 Tab 切换。
- **Web 桌面端**：
  - 左上角：`ScanLine` 图标（`primary-container` 背景圆角方块）+「分析模式」标题（`text-display-lg font-semibold`）+「非线性动力学诊断终端」副标题（`text-body-sm text-on-surface-variant`）。
  - 标题下方：水平 Tabs，4 个条目，每个包含图标 + 文字。
- **Web 窄屏**：
  - 副标题隐藏，标题字号缩小。
  - Tabs 文字缩短（平板保留全称，手机用简写）。
- **状态**：
  - Loading：Tabs 可切换，图表区显示 spinner。
  - Error：图表区显示错误信息，Tabs 仍可切换视图。
- **数据注入**：`useAnalysisView()` 提供 `activeView` / `setActiveView` / `isDesktop`。
- **交互**：
  - 点击 Tab → `setActiveView(id)`。
  - 选中态：`bg-surface-container-low text-on-surface shadow-sm`。
  - 未选中态：`text-on-surface-variant/60 hover:text-on-surface/80`。
  - 过渡时长：`200ms ease-out`。

### 功能块 B — 左侧控制面板（ANL_CONTROLS）

- **职责**：承载当前视图相关的控制、图例、固定参数与状态指示。
- **Web 桌面端**：
  - 宽度 280px，高度占满主内容区，独立滚动。
  - 背景 `surface-container-lowest`，与右侧 `surface-container-low` 形成 tonal shift。
  - 内部功能分区从上到下：
    1. **面板标题**：图标 +「控制面板」+ 英文副标。
    2. **当前视图卡**：显示当前视图中文名（如「Lyapunov 指数热力图」）。
    3. **图层切换**（仅 `activeView === "lyapunov"`）：三个按钮式选项——最大 Lyapunov / 最小 Lyapunov / 能量曲面曲率。
    4. **阻尼切片滑块**（仅 Lyapunov 且 `dampingSlices.length > 1`）。
    5. **色阶图例**（仅 Lyapunov）：渐变条 + 稳定/准周期/混沌标签。
    6. **固定参数只读网格**：`m₁`、`m₂`、`g`、阻尼。
    7. **状态 Footer**：状态灯 + 数据状态文字 + `ANL-01~04` 标识。
- **Web 窄屏**：
  - 左侧面板隐藏，改为底部 Drawer / Sheet。
  - Drawer 顶部有拖拽条，内容分区与桌面端一致，垂直堆叠。
- **状态**：
  - Loading：状态灯蓝色 pulse，其他控件可用但数据未就绪。
  - Error：状态灯变红，footer 显示简短错误提示。
  - Ready：状态灯为 `lyapunov-neutral`。
- **数据注入**：
  - `activeLayer` / `setActiveLayer`（Zustand `analyzeSlice`）
  - `activeDamping` / `setActiveDamping`（Zustand `analyzeSlice`）
  - `dampingSlices`（来自 `layer_manifest.json`，由页面传入）
  - `loadStatus`（Zustand `analyzeSlice`）
- **禁止行为**：控制面板不直接调用 API、不操作 Canvas、不 import simulation/application/infrastructure。

### 功能块 C — 主图表区（ANL_CHART_STAGE）

- **职责**：根据当前视图渲染对应的动力学分析图表。
- **Web 桌面端 / 窄屏**：
  - 容器：`bg-surface-container-low rounded-xl overflow-hidden shadow-floating-modal`。
  - 顶部中心叠加微弱径向蓝光：`bg-[radial-gradient(circle_at_50%_0%,rgba(75,159,255,0.06),transparent_60%)]`。
  - 无边框，靠 elevation 和圆角与背景区分。
  - 内部子视图按 `activeView` 条件渲染：
    - `lyapunov` → `LyapunovHeatmap`
    - `bifurcation` → `BifurcationPlot`
    - `poincare` → `PoincareSection`
    - `energy-landscape` → `EnergyLandscape`
- **状态**：
  - Loading：居中 spinner +「正在加载预计算数据索引…」。
  - Empty / 无有效数据：居中图标 + 说明文字。
  - Error：居中图标 + 错误信息 + `Button variant="secondary"` 重试按钮。
- **数据注入**：各子组件消费自己的 Hook / store；页面仅负责容器布局与 `dataPaths` 透传。

---

## 视觉与 Token 规范

### 颜色

| 用途 | Token | Hex |
|------|-------|-----|
| 页面背景 | `surface` | `#1A1D22` |
| 左侧面板 | `surface-container-lowest` | `#1E2127` |
| 图表容器 | `surface-container-low` | `#23262C` |
| 控制卡/按钮背景 | `surface-container` | `#2A2D34` |
| 按钮悬停 | `surface-container-high` | `#31353D` |
| 主强调色 | `primary` | `#4B9FFF` |
| 主强调容器 | `primary-container` | `#1C3A5E` |
| 主强调悬停 | `primary-hover` | `#6BB3FF` |
| 正文 | `on-surface` | `#E8EAED` |
| 次要文字 | `on-surface-variant` | `#9BA0AA` |
| 稳定区 | `lyapunov-stable` | `#1E3A5F` |
| 准周期/中性 | `lyapunov-neutral` | `#2DD4BF` |
| 混沌区 | `lyapunov-chaotic` | `#F97316` |
| 错误/异常 | `separation-alert` | `#FF3B3B` |

### 字体

| 用途 | Token / Class |
|------|---------------|
| 模式标题 | Manrope Semibold `text-display-lg` |
| 面板标题 / 视图 Tab | Manrope Medium `text-sm` |
| 正文 / 标签 | Manrope Regular `text-xs` / `text-body-sm` |
| 数值 / 坐标轴 / 代码 | JetBrains Mono `font-mono` |

### 圆角

| 元素 | 圆角 |
|------|------|
| 图表容器 | `rounded-xl` (12px) |
| 控制卡 / 按钮 | `rounded-lg` (8px) |
| 小图标背景 | `rounded-lg` (8px) |
| 滑块 thumb | `rounded-full` |

### 阴影

| 元素 | Shadow Token |
|------|--------------|
| 图表容器 | `shadow-floating-modal` |
| 选中按钮 / Tab | `shadow-sm` |
| 卡片悬停 | `shadow-card-hover` |

### No-Line Rule

- 面板之间不添加实线边框。
- 左侧面板与图表区通过 `surface-container-lowest` vs `surface-container-low` 的 tonal shift 分隔，外加 `24px` 间隙。
- 控制面板内部分区使用 `border-white/[0.06]` 作为极淡分隔线（可选，仅用于视觉分组，不替代 tonal shift）。

---

## 图表子视图视觉规范

### ANL-01 Lyapunov 热力图

- **Canvas 背景**：`surface` (#1A1D22)。
- **色标**：
  - `lyapunov_max` / `lyapunov_min`：`#1E3A5F → #2DD4BF → #F97316`。
  - `energy_curvature`：暗室风格 `#31353D → #4B9FFF → #2DD4BF`。
- **轴标签**：`font-mono text-on-surface-variant`，X 轴底部居中，Y 轴左侧旋转 90°。
- **游标**：白色圆环 + 十字线，带 `drop-shadow(0 0 2px rgba(0,0,0,0.5))`。
- **Tooltip**：`bg-surface-container-low border-white/5 text-xs text-on-surface`，混沌/稳定/准周期用文字色区分。
- **交互**：点击格点 → 打开参数填充对话框 → 确认后注入参数并切回探索模式。
- **内部结构改造**：移除顶部图层 Tabs 与阻尼滑块（已迁移到左侧控制面板）。

### ANL-02 参数空间分岔图

- **Canvas 背景**：`surface` (#1A1D22)，替代当前 `#fafafa`。
- **网格线**：`rgba(155,160,170,0.10)`（outline-variant）。
- **坐标轴文字**：`font-mono text-on-surface-variant`。
- **散点配色**（按 regime）：
  - 周期-1/2：`lyapunov-stable` (#1E3A5F)
  - 周期-4/倍周期：`primary` (#4B9FFF)
  - 混沌：`lyapunov-chaotic` (#F97316)
  - 无数据：`on-surface-variant/30`
- **游标**：竖直虚线 + 顶部标签，使用 `primary`。
- **Tooltip**：与热力图统一风格。

### ANL-03 庞加莱截面

- **控制栏**：
  - 使用共享 `Button` / `Input` / `Label` / `Select`。
  - 背景 `surface-container-low`，分隔线 `border-white/[0.06]`。
- **Canvas**：深色背景。
  - 当前点：`primary` (#4B9FFF) 带 alpha 老化。
  - 基线：`tertiary` (#2DD4BF) 或 `separation-alert` (#FF3B3B)。
- **Warning**：将 `bg-amber-100 text-amber-800` 改为 `bg-surface-container-high text-tertiary` 或 `text-separation-alert`。

### ANL-04 能量景观地形图

- **容器**：`bg-surface-container-low rounded-xl overflow-hidden`。
- **底部等高线网格**：`surface-container-high` (#31353D)。
- **实时光点**：保持 cyan 点缀，但容器边界与暗色背景融合。

---

## 动效规范

| 场景 | 时长 | 缓动 | 备注 |
|---|---|---|---|
| Tab 切换背景色 | 200ms | ease-out | `duration-quick` |
| 图层按钮悬停背景 | 200ms | ease-out | `duration-quick` |
| 图表区淡入 | 300ms | ease-out | `duration-smooth` |
| 状态灯 pulse | 2000ms | linear | `duration-ambient` |
| 按钮按下缩放 | 120ms | ease-out | `active:scale-[0.98]` |
| 减少动画偏好 | 0ms / 120ms | — | `prefers-reduced-motion: reduce` 下禁用 pulse 与径向渐变动画 |

---

## 响应式断点

| 断点 | 范围 | 布局行为 |
|------|------|----------|
| `lg` | ≥1024px | 桌面端：左侧 280px 控制面板常驻，右侧图表区 flex-1。 |
| `md` | 768px–1023px | 平板 web：左侧面板隐藏，改为底部 Drawer。 |
| `<md` | <768px | 窄屏 web：标题简化，Tabs 短标签，底部触发全屏 Sheet。 |

---

## 数据流与接线

```
AnalyzeModePage (View Page)
  ├─ useAnalysisView() → activeView, setActiveView, isDesktop
  ├─ useLayerManifest() → lyapunovPaths, bifurcationPath, dampingSlices, ready
  ├─ useAnalyzeStore() → activeLayer, setActiveLayer, activeDamping, setActiveDamping, loadStatus, layerCacheStatus
  │
  ├─ <AnalysisControls /> (Props 注入)
  │     activeView, activeLayer, onLayerChange, availableLayers,
  │     dampingSlices, activeDamping, onDampingChange, loadStatus, layerCacheStatus
  │
  └─ <Main Chart Stage>
        ├─ <LyapunovHeatmap dataPaths={...} dampingSlices={...} />
        ├─ <BifurcationPlot dataPath={...} />
        ├─ <PoincareSection />
        └─ <EnergyLandscape />
```

- **View 层边界**：`AnalyzeModePage` 是唯一的 ViewModel Hook import 点；子组件通过 Props 接收数据。
- **跨层禁止**：View 组件不直接 import application/domain/infrastructure；Infrastructure 不 import View/ViewModel。

---

## 相关文件

- `src/features/analyze/ui/AnalyzeModePage.tsx`
- `src/features/analyze/ui/AnalysisControls.tsx`
- `src/features/analyze/ui/LyapunovHeatmap.tsx`
- `src/features/analyze/ui/BifurcationPlot.tsx`
- `src/features/analyze/ui/PoincareSection.tsx`
- `src/features/analyze/ui/EnergyLandscape.tsx`
- `src/features/analyze/hooks/useAnalysisView.ts`
- `src/features/analyze/viewModel/stores/analyzeSlice.ts`
- `src/features/analyze/contracts/analysis-tools.contract.ts`
- `DESIGN.md`
