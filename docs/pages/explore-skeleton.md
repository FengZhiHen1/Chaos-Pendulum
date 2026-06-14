# 探索模式页面骨架设计

## 元信息

| 字段 | 内容 |
|------|------|
| 页面名称 | 探索模式 (Explore Mode) |
| 页面 ID | explore |
| 目标平台 | desktop（≥1280px） |
| 设计作用域 | 仅桌面端三栏布局；响应式适配不在本文档范围 |
| 关联 feature | explore / simulation / lab（受力分析面板） |
| 美学方向 | Dark Stage Edition — 中央明亮 3D 舞台，四周暗室控制面 |
| 设计来源 | DESIGN.md v2.0、docs/前端页面骨架设计.md、各契约文件 |

## 已锚定 Logic-ID 清单

| Logic-ID | 名称 | 来源契约 | 状态 |
|----------|------|---------|------|
| SIM-03 | 全局导航 | `control/contracts/navigation.contract.ts` | 已确认 |
| SIM-02 | 参数控制面板 | `control/contracts/parameter-panel.contract.ts` | 已确认 |
| EXP-02 | 运动尾迹渲染 | `explore/contracts/types.contract.ts` | 已确认 |
| ViewPreset | 3D 视图预设 | `explore/contracts/types.contract.ts` | 已确认 |
| EXP-01 | 3D 仿真场景 | `explore/contracts/types.contract.ts` | 已确认 |
| SIM-01 | 双摆物理引擎 | `simulation` 域 | 已确认 |
| EXP-03 | 声音化引擎 | `explore/contracts/sonification.contract.ts` | 已确认 |
| EXP-05 | 时间反演实验 | `explore/contracts/time-reversal.contract.ts` | 已确认 |
| ChaosIndicator | 混沌指示器 | `explore/contracts/types.contract.ts` | 已确认 |
| SIM-04 | 能量实时监控 | `simulation` 域 | 已确认 |
| SIM-05 | 相空间可视化 | `simulation` 域 | 已确认 |
| LAB-01 | 受力拆解视图 | `lab` 域 | 已确认 |
| EXP-04 | 蝴蝶效应对比器 | `explore/contracts/butterfly-effect.contract.ts` | 已确认 |

---

## 桌面端布局（≥1280px）

### 整体布局树

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ GlobalNavBar (56px, surface-container-lowest)                                │
│ [探索] [分析] [实验] [故事]                          [演示入口] [声效入口]    │
├───────────────┬───────────────────────────────────────┬──────────────────────┤
│               │                                       │                      │
│ Left Panel    │                                       │ Right Panel          │
│ (280px fixed) │     Central 3D Stage                  │ (320px fixed)        │
│               │     (stage #EAECEF, flex-1)           │                      │
│ ┌───────────┐ │                                       │ ┌──────────────────┐ │
│ │ ParamPanel│ │     ┌─ Fixed Pivot                   │ │ EnergyMonitor    │ │
│ │ (SIM-02)  │ │     │                                 │ │ Panel (SIM-04)   │ │
│ │           │ │     │  ┌── Upper Bob                  │ │                  │ │
│ │ • Tabs    │ │     │  │  ┌── Lower Bob               │ │ ┌──────────────┐ │ │
│ │ • Sliders │ │     │  │  │                            │ │ │ Canvas 2D    │ │ │
│ │ • Inputs  │ │     │  │  │  ● Trail (blue→red)        │ │ │ E_k/E_p/E_t  │ │ │
│ │ • Presets │ │     │     │                            │ │ └──────────────┘ │ │
│ │ • Methods │ │     │─────────────                    │ │                  │ │
│ └───────────┘ │     │  Grid / Floor                   │ ├──────────────────┤ │
│ ┌───────────┐ │     │                                 │ │ PhaseSpacePanel  │ │
│ │Trail+View │ │     │ [HUD Overlays]                  │ │ (SIM-05)         │ │
│ │ Controls  │ │     │                                 │ │                  │ │
│ │ (EXP-02)  │ │     │ ┌─ SonificationToggle           │ │ ┌──────────────┐ │ │
│ │           │ │     │ │ (top-left)                    │ │ │ Canvas 2D    │ │ │
│ │ • View    │ │     │ └─ ChaosIndicator               │ │ │ θ-θ̇ phase    │ │ │
│ │ • Material│ │     │    (below toggle)               │ │ └──────────────┘ │ │
│ │ • Env     │ │     │                                 │ └──────────────────┘ │
│ │ • Trail   │ │     │ ┌─ Butterfly Entry              │                      │
│ └───────────┘ │     │ │ (top-right)                   │  OR (force active)   │
│               │     │ └─ TimeReversal Entry           │ ┌──────────────────┐ │
│               │     │    (top-right / bottom toolbar) │ │ DecompositionPanel│ │
│               │     │                                 │ │ (LAB-01)         │ │
│               │     │                                 │ └──────────────────┘ │
│               │     │                                 │                      │
├───────────────┴───────────────────────────────────────┴──────────────────────┤
│ Bottom Toolbar (48px, surface-container-lowest)                              │
│ [▶ 播放] [⏸ 暂停] [↺ 重置] [受力分析] [蝴蝶效应] [时间反演]                   │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 关键尺寸

| 区域 | 宽度 | 高度 | 背景 Token | 备注 |
|------|------|------|-----------|------|
| GlobalNavBar | 100% | 56px | surface-container-lowest | 无实线边框 |
| Left Panel | 280px | 主内容区 100% | surface-container-low | 可纵向滚动 |
| Central 3D Stage | flex-1 | 主内容区 100% | stage (#EAECEF) | 唯一明亮区域 |
| Right Panel | 320px | 主内容区 100% | surface-container-low | 图表/受力分析互斥 |
| Bottom Toolbar | 100% | 48px | surface-container-lowest | 与 3D 舞台底部对齐 |
| 面板间距 | 24px | — | surface (#1A1D22) | 纯暗色间隙，无边框 |

### 导航模式

- **桌面端**：固定顶部水平 Tab 导航。
- **模式切换**：鼠标点击或数字快捷键 `1/2/3/4`。
- **当前模式高亮**：`primary` 色文字 +  subtle underline。
- **演示模式入口**：右上角眼睛图标，一键隐藏所有暗色面板。

### 键盘策略

| 按键 | 作用 | 作用域 |
|------|------|--------|
| `1/2/3/4` | 切换模式 | 全局（焦点不在输入框内） |
| `Space` | 切换受力分析 | explore 页面内 |
| `Esc` | 退出受力分析 / 退出蝴蝶效应 / 关闭弹窗 | explore 页面内 |
| `?` | 显示快捷键帮助（可选） | 全局 |

### 手势语汇

桌面端以鼠标为主：
- **Hover**：按钮、滑块 thumb、图表数据点显示 Tooltip。
- **Drag**：参数滑块、3D 场景旋转（OrbitControls）、分岔图/庞加莱图框选放大。
- **Click**：模式切换、按钮、图表 Tab。
- **Right-click**：3D 舞台可选上下文菜单（保存视角 / 重置相机）。

---

## 功能块详述

### 1. GlobalNavBar — `SIM-03`

- **职责**：全局模式切换 + 演示模式入口 + 声效入口。
- **位置**：页面顶部，56px 高，横向拉伸。
- **平台表现**：
  - 左侧：4 个模式 Tab（探索 / 分析 / 实验 / 故事），等分或左对齐。
  - 右侧：声效开关（仅桌面端显示）、演示模式入口按钮。
- **三态行为**：
  - Loading：导航栏在启动完成后淡入。
  - Empty：不适用。
  - Error：某模式崩溃时，对应 Tab 显示警告图标；点击其他模式可切换。
- **数据注入来源**：`useAppStore`（activeMode, deviceType）。

### 2. ParamPanel — `SIM-02`

- **职责**：双摆物理参数与初始条件的输入、校验、预览、生效。
- **位置**：左侧面板主体（上半部分）。
- **平台表现**：
  - 顶部：启动/暂停按钮 + 重置按钮 + 状态提示（Worker 未就绪 / 参数 Dirty / 场景冻结）。
  - 中部：3 个 Tab（系统参数 / 初始条件 / 环境）。
  - Tab 内容：参数滑块 + 数值输入框，每个参数一行。
  - 底部：积分方法选择器 + 预设参数按钮。
- **三态行为**：
  - Loading：参数面板显示 Skeleton 或禁用状态，提示“仿真引擎初始化中”。
  - Empty：不适用。
  - Error：非法参数输入时，对应输入框红框 + 震动动画 + Tooltip 显示合理范围；3D 舞台冻结但保持明亮。
- **数据注入来源**：`useSimulationControls`、`useSimulationStore`、`PARAM_META`。

### 3. Trail + View Controls — `EXP-02` + `ViewPreset`

- **职责**：3D 视角预设、摆体材质、环境背景、尾迹持久度控制。
- **位置**：左侧参数面板底部，独立折叠/展开区域。
- **平台表现**：
  - 视角预设：3 个按钮（实验员侧视 / 上帝俯视 / 混沌跟随）。
  - 材质切换：下拉选择（金属 / 木质 / 玻璃）。
  - 环境切换：下拉选择（暗室聚光 / 纯白教学）。
  - 尾迹持久度：下拉选择（50 / 200 / 1000 / 无限 / 仅当前周期）。
- **三态行为**：
  - Loading：默认展开，控件可用但 Worker 未就绪时 3D 场景无响应。
  - Empty：不适用。
  - Error：非法参数导致场景冻结时，这些控件仍可交互但视觉反馈暂停。
- **数据注入来源**：`useSceneController`、`exploreStore`。

### 4. Central 3D Stage — `EXP-01` + `SIM-01`

- **职责**：实时渲染双摆运动、尾迹、参考网格、灯光，作为页面视觉核心。
- **位置**：页面中央，flex-1 占满剩余宽度。
- **平台表现**：
  - 背景：`stage` token (#EAECEF)，唯一明亮区域。
  - 元素：固定支点球、上摆杆、上摆球、下摆杆、下摆球、速度-颜色映射尾迹、地面参考网格。
  - 灯光：暗室模式为上方聚光灯 + 微弱环境光；纯白模式为均匀环境光。
- **三态行为**：
  - Loading：显示“正在初始化物理引擎…”占位或保留最后一帧。
  - Empty：无数据时显示空摆静止状态。
  - Error：WebGL 丢失时显示恢复提示；非法参数时显示半透明黑色遮罩 + 提示文字。
- **数据注入来源**：`simulationStore`、`worker scheduler`、`Scene3DConfig`、`TrailConfig`。

### 5. Stage Overlays

#### 5.1 SonificationToggle — `EXP-03`

- **职责**：声音化引擎开关（默认静音）。
- **位置**：3D 舞台左上角。
- **平台表现**：
  - 默认：Speaker slash 图标，`on-surface-variant`。
  - 激活：Speaker waves 图标，`primary`。
- **三态行为**：
  - Loading：禁用或隐藏，等用户手势。
  - Empty：不适用。
  - Error：AudioContext 初始化失败时显示警告 Tooltip。
- **数据注入来源**：`useSonification`。

#### 5.2 ChaosIndicator

- **职责**：实时显示系统混沌状态（稳定 / 准周期 / 混沌）。
- **位置**：SonificationToggle 下方。
- **平台表现**：小徽章 + 标签 + 置信度条。
- **三态行为**：
  - Loading：显示“计算中…”。
  - Empty：初始状态为“稳定”。
  - Error：检测到 NaN 或发散时显示红色“发散”警告。
- **数据注入来源**：`useChaosUpdater`、`exploreStore`。

#### 5.3 Butterfly Entry Button — `EXP-04`

- **职责**：进入蝴蝶效应分屏对比。
- **位置**：3D 舞台右上角。
- **平台表现**：按钮，图标 `GitCompare`，文字“蝴蝶效应”。
- **三态行为**：
  - Loading：禁用。
  - Empty：不适用。
  - Error：Worker 未就绪时禁用并 Tooltip 提示。
- **数据注入来源**：`useButterflyMode`。

#### 5.4 TimeReversal Entry — `EXP-05`

- **职责**：进入时间反演实验。
- **位置**：仅底部工具栏（用户确认），不在舞台右上角重复放置。
- **平台表现**：底部工具栏按钮，图标沙漏，文字“时间反演”。
- **三态行为**：
  - Loading：禁用。
  - Empty：历史帧不足时禁用并 Tooltip 提示。
  - Error：反演过程中异常时弹出 Alert。
- **数据注入来源**：`timeReversalStore`。

### 6. Right Chart Panel — `SIM-04` + `SIM-05`

- **职责**：实时展示能量曲线和相空间轨迹。
- **位置**：右侧面板，受力分析未激活时显示。
- **平台表现**：
  - 上半：EnergyMonitorPanel（Canvas 2D 折线图，显示 E_k / E_p / E_t + 漂移百分比）。
  - 下半：PhaseSpacePanel（Canvas 2D 轨迹图，Tab 切换 θ₁-θ̇₁ / θ₂-θ̇₂）。
- **三态行为**：
  - Loading：显示 Skeleton 占位。
  - Empty：仿真未启动时显示“启动仿真以查看数据”。
  - Error：Worker 数据异常时显示红色提示。
- **数据注入来源**：`simulationStore`。

### 7. Right Force Decomposition Panel — `LAB-01`

- **职责**：受力分析激活时，展示力矢量分解与统计。
- **位置**：右侧面板，完全替换图表面板。
- **平台表现**：
  - 顶部：受力分析状态提示。
  - 中部：力分解表格（切向 / 法向 / 径向）。
  - 底部：坐标系切换 + 张力极值标记。
- **三态行为**：
  - Loading：显示“正在计算力分量…”。
  - Empty：受力分析未激活时不显示。
  - Error：Worker 未返回力数据时提示“请先启动仿真”。
- **数据注入来源**：`useLabStore`、`simulationStore`。

### 8. Bottom Toolbar

- **职责**：全局播放控制 + 受力分析 + 蝴蝶效应 + 时间反演入口。
- **位置**：页面底部，48px 高。
- **平台表现**：
  - 左起：播放/暂停、重置。
  - 右起：受力分析切换、蝴蝶效应入口、时间反演入口。
- **三态行为**：
  - Loading：按钮禁用或显示加载动画。
  - Empty：不适用。
  - Error：Worker 崩溃时播放/暂停禁用，重置可用。
- **数据注入来源**：`useSimulationControls`、`useButterflyMode`、`useLabStore`、`timeReversalStore`。

---

## 特殊状态布局

### 蝴蝶效应分屏状态 — `EXP-04`

当 `butterflyActive === true` 时，整个 explore 页面布局被替换为双视口对比：

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [退出蝴蝶效应] X                                          (top-right, z-20)  │
├──────────────────────────────┬──────┬────────────────────────────────────────┤
│                              │ 4px  │                                        │
│   Viewport A — 金色摆        │ gap  │   Viewport B — 紫色摆                  │
│   (stage bg)                 │dark  │   (stage bg)                           │
│                              │rift  │                                        │
│                              │      │                                        │
├──────────────────────────────┴──────┴────────────────────────────────────────┤
│  δ = 0.000001°     |Δθ| = 127.3°                              (bottom-center)│
│  [仅调 A] [仅调 B] [同步调节]                                                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **退出方式**：右上角按钮、`Esc` 键、点击空白处（用户确认三者都支持）。
- **数据注入来源**：`butterfly scheduler`、`useButterflyMode`。
- **完全失相关（|Δθ| > 90°）**：
  - 中央分隔线从 4px 扩展到 12px（300ms ease-out，1s 后恢复）。
  - 屏幕边缘 `separation-alert` 脉冲 glow。
  - 中央显示“完全失相关” pill，持续 1.5s。

### 时间反演状态 — `EXP-05`

当时间反演激活时：
- 3D 舞台内叠加两套轨迹：
  - 实线（白色）：实际反演轨迹。
  - 虚线（半透明灰色）：理论上应重合的原正向轨迹。
- 右上角出现**漂移距离曲线**浮动面板（绝对定位，300×160px）。
- 分离发生时，舞台中央偏上弹出教学注释气泡：
  > “哈密顿系统理论上可逆，但混沌使计算机的浮点误差被指数放大——这就是初值敏感性的计算物理体现”
- 用户可切换反演模式：精确反演（历史插值）/ 数值反演（重新积分）。

### 受力分析状态 — `LAB-01`

当受力分析激活时：
- 3D 舞台内叠加力矢量：
  - 重力（绿色实线箭头，竖直向下）。
  - 张力（红色实线箭头，沿杆方向）。
  - 惯性力（蓝色虚线箭头）。
- 右侧图表面板被 `DecompositionPanel` 完全替换。
- 空格键切换开/关，`Esc` 关闭。

---

## 平台适配检查清单（桌面端）

| # | 检查项 | 桌面端 | 说明 |
|---|--------|--------|------|
| 7 | touch 手势有 mouse/keyboard 等价 | ✅ | 3D 旋转用鼠标拖拽 + 滚轮缩放；视角预设用按钮/快捷键。 |
| 9 | Tab 序连续覆盖可交互元素 | ✅ | 导航 → 左侧参数 → 舞台覆盖按钮 → 右侧图表 → 底部工具栏。 |
| 10 | Esc 关闭弹窗/面板 | ✅ | 关闭重置确认对话框、退出受力分析、退出蝴蝶效应。 |
| 11 | 内容 max-w 1440px，超宽屏不拉伸 | ⚠️ | 主内容区随窗口拉伸，但 Left/Right Panel 固定宽度，舞台 flex-1。超宽屏可考虑舞台内容 max-w 或居中，需视觉验证。 |
| 12 | desktop-wide 空间用于多面板而非拉伸单列 | ⚠️ | 当前为舞台自适应拉伸。超宽屏可在两侧增加辅助信息面板（如实时日志），但本次范围不含。 |

---

## 设计决策确认记录

| 决策项 | 用户选择 | 是否已落地到骨架 |
|--------|---------|----------------|
| 目标平台 | 仅桌面端（≥1280px） | ✅ |
| 尾迹与视图控制位置 | 独立折叠面板，参数面板底部 | ✅ |
| 右侧图表 vs 受力分析 | 受力分析激活时完全替换右侧图表 | ✅ |
| 时间反演入口 | 仅底部工具栏 | ✅ |
| 蝴蝶效应退出方式 | 右上角按钮 + Esc + 点击空白处 | ✅ |

---

## 待 code-implementer 注意

1. **No-Line Rule**：面板之间用 24px 暗色间隙分隔，禁止实线边框。
2. **Stage 唯一明亮**：中央 3D 舞台使用 `stage` token，四周面板使用 dark surface stack。
3. **Mode Transition**：切换到分析/实验/故事模式时，中央 3D stage 应保持静态不闪烁（DESIGN.md 要求）。
4. **蝴蝶效应退出**：需同时支持三种退出方式，注意事件拦截优先级。
5. **时间反演入口**：仅保留底部工具栏入口，移除或隐藏现有舞台右上角入口。
