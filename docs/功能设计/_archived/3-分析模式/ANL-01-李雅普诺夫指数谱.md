# 功能规格：ANL-01 李雅普诺夫指数谱

> **文档生成时间**：`2026-04-28 14:00:00 CST`  
> **源设计文档**：功能设计_v0.md §四 4.1、功能模块全拆解.md ANL-01、双摆混沌实验室-技术栈设计.md v1.2  
> **版本记录**：
> | 版本 | 时间 | 修改人 | 变更摘要 |
> |------|------|--------|----------|
> | v1.0 | 2026-04-28 14:00:00 | AI Assistant | 初始版本，基于功能设计_v0 §四 4.1 + 技术栈设计 v1.2 |

> **冲突核查指引**：若发现与已有规格文档冲突，优先以时间戳更新的版本为准，并在版本记录中追加冲突解决条目。

---

## 所属模块与溯源

| 维度 | 内容 |
|------|------|
| 模块编号 | ANL-01 |
| 模块名称 | 李雅普诺夫指数谱 |
| 所属模式 | 分析模式（Analyze） |
| 设计文档溯源 | 功能设计_v0.md §四 4.1；功能模块全拆解.md ANL-01行；技术栈设计.md §4.9、§5.3 |
| 依赖模块 | SYS-03（预计算数据管线）— 提供 JSON 数据文件；SIM-02（参数控制面板）— 接收点击填充的参数 |
| 被依赖模块 | SIM-01（双摆物理引擎）— 参数填充后驱动仿真；EXP-03（声音化引擎）— λ>0 时触发混沌听觉标记 |

---

## 已有设计兼容性分析

`docs/功能设计/` 目录下当前仅有 `功能设计_v0.md` 和 `功能模块全拆解.md`，尚无其他模块的独立功能规格文档。本模块为首个生成的 ANL 类规格。

**一致性检查**：

| 检查项 | 来源 A（功能设计_v0 §四 4.1） | 来源 B（技术栈设计 §4.9、§5.3） | 一致？ |
|--------|------|------|:---:|
| 数据基础 | 预计算二维参数网格 | Python 脚本 → JSON → fetch 加载 | ✅ |
| 可视化 | Canvas 2D 热力图 | D3.js Canvas + d3-scale-chromatic | ✅ |
| 色阶 | 深蓝(λ<0)→青绿(λ≈0)→橙红(λ>0) | 由 d3-scale-chromatic 发散色阶实现 | ✅ |
| 点击联动 | 填充参数至控制面板 | 写入 Zustand simulationParams | ✅ |
| 图层切换 | 最大/最小 Lyapunov + 能量曲率 | 三组独立预计算 JSON，运行时切换 | ✅ |
| 缓存策略 | 未提及 | IndexedDB，键 = `lyapunov-{gridHash}`，LRU ≤ 10 组 | ✅（补充设计） |

无冲突。技术栈设计对缓存持久化和 Zustand 联动做了更具体的工程化定义，本规格继承之。

---

## 技术栈绑定

| 维度 | 必须使用 | 版本 | 禁止使用 |
|------|----------|------|----------|
| UI 框架 | React + TypeScript | 18.x / 5.x | 类组件（使用函数组件 + Hooks） |
| 状态管理 | Zustand | 4.x | React Context 传递热力图交互状态 |
| 2D 渲染 | D3.js（d3-scale、d3-scale-chromatic、d3-zoom、d3-selection） | 7.x | ECharts / Chart.js / 其他图表库 |
| 色阶 | d3-scale-chromatic 发散色阶 | 7.x | 手写 RGB 插值 |
| 缓存 | IndexedDB（原生 API） | — | localStorage（预计算数据 > 5MB 上限） |
| UI 组件 | shadcn/ui（Tabs、Tooltip、Skeleton） | latest | 自建 Tab/Tooltip（保持项目一致性） |
| 样式 | Tailwind CSS | 3.x | CSS Modules / styled-components |
| 数据 hash | Web Crypto API `SubtleCrypto.digest('SHA-256')` | 原生 | 第三方 hash 库（减少依赖） |
| 文件组织 | 组件目录 `src/components/analysis/LyapunovHeatmap/` | — | 将热力图逻辑散布在页面组件中 |
| Canvas 操作 | 直接操作 Canvas 2D Context | 原生 | SVG 渲染 10,000 格点（性能不足） |

---

## 输入定义（精确类型）

### 输入 1：预计算数据文件（fetch 加载）

```typescript
// 文件路径：dist/assets/lyapunov_max-[gridHash].json
//           dist/assets/lyapunov_min-[gridHash].json
//           dist/assets/energy_curvature-[gridHash].json
// 每个文件对应一个扫描图层

interface LyapunovGrid {
  metadata: {
    type: "lyapunov_max" | "lyapunov_min" | "energy_curvature";
    
    // X 轴参数
    paramX: {
      name: string;           // 参数名，如 "L₂/L₁"、"θ₁"、"m₂/m₁"
      symbol: string;         // LaTeX 符号，如 "L_2/L_1"，用于 Tooltip 显示
      min: number;            // 扫描最小值，如 0.5（无量纲或弧度）
      max: number;            // 扫描最大值，如 5.0
      steps: number;          // 网格点数，固定 100
      unit: string;           // 单位，如 ""（无量纲）、"rad"
    };

    // Y 轴参数
    paramY: {
      name: string;           // 参数名，如 "θ₁"
      symbol: string;         // LaTeX 符号，如 "\\theta_1"
      min: number;            // 扫描最小值，如 0.0
      max: number;            // 扫描最大值，如 2π ≈ 6.283185
      steps: number;          // 网格点数，固定 100
      unit: string;           // 单位，如 "rad"
    };

    // 扫描时固定的其他参数
    fixedParams: {
      m1: number;             // 上摆质量，必填，> 0，单位 kg，默认 1.0
      m2: number;             // 下摆质量，必填，> 0，单位 kg，默认 1.0
      L1: number;             // 上摆摆长，必填，> 0，单位 m，默认 1.0
      L2: number;             // 下摆摆长，必填，> 0，单位 m，默认 1.0
      omega1_0: number;       // 上摆初始角速度，必填，单位 rad/s，默认 0.0
      omega2_0: number;       // 下摆初始角速度，必填，单位 rad/s，默认 0.0
      g: number;              // 重力加速度，必填，> 0，单位 m/s²，默认 9.81
      damping: number;        // 阻尼系数，必填，≥ 0，无量纲，默认 0.0
      integrationTime: number; // 单次仿真的积分时长，必填，> 0，单位 s，默认 200.0
      dt: number;             // 积分步长，必填，> 0，单位 s，默认 0.01
    };

    gridHash: string;         // SHA-256(JSON.stringify({paramX, paramY, fixedParams, type})).slice(0, 16)，小写 hex
    generatedAt: string;      // 预计算脚本运行时间，ISO 8601 格式，如 "2026-04-27T08:30:00Z"
    solverVersion: string;    // 预计算脚本版本号，如 "1.0.0"，用于兼容性校验
  };

  grid: number[][];           // 二维浮点矩阵，尺寸 = paramY.steps × paramX.steps
                              // grid[y][x] = λ_max（或 λ_min / curvature）
                              // y 索引 0 对应 paramY.max（顶部），y 索引 paramY.steps-1 对应 paramY.min（底部）
                              // 特殊值：NaN 表示该格点积分失败/发散
}
```

### 输入 2：当前仿真参数（Zustand 订阅，用于双向联动）

```typescript
// 来源：src/stores/simulationStore.ts
// 只读订阅，本模块不修改这些字段（除点击填充流程外）

interface SimulationParamsForHeatmap {
  // 这些字段必须与 fixedParams 中的参数名匹配
  m1: number;
  m2: number;
  L1: number;
  L2: number;
  theta1_0: number;    // 对应预计算网格的 paramY（Y 轴参数可能是 θ₁ 初始角）
  theta2_0: number;
  omega1_0: number;
  omega2_0: number;
  g: number;
  damping: number;
}
```

### 输入 3：用户交互事件

| 交互类型 | 事件源 | 数据类型 | 触发条件 |
|----------|--------|----------|----------|
| 鼠标悬停 | Canvas `mousemove` | `{ x: number; y: number }` — Canvas 像素坐标 | 鼠标在 Canvas 区域内移动 |
| 鼠标离开 | Canvas `mouseleave` | `void` | 鼠标移出 Canvas 区域 |
| 点击 | Canvas `click` | `{ x: number; y: number }` — Canvas 像素坐标 | 鼠标左键点击 Canvas 内有效格点 |
| 图层切换 | shadcn/ui Tabs `onValueChange` | `"lyapunov_max" \| "lyapunov_min" \| "energy_curvature"` | 用户点击 Tab |
| 触屏触控 | Canvas `touchmove` | `TouchEvent` | 平板/手机触摸 |

---

## 输出定义（精确类型）

### 输出 1：Canvas 2D 热力图

- **渲染目标**：`<canvas>` 元素，由 D3.js 管理 2D Context
- **视觉规格**：
  - 网格尺寸：`paramY.steps`（行）× `paramX.steps`（列），典型值 100×100 = 10,000 cells
  - 色阶映射：d3-scale-chromatic 发散色阶 `d3.interpolateRdBu`（反转，使红=混沌>0，蓝=稳定<0）
  - 色域：`d3.scaleSequential(domain, interpolator).domain([λ_min, λ_max])`
       其中 `λ_min` = grid 中最小值（clamp 到 -1.0 若全部 > 0），`λ_max` = grid 中最大值（clamp 到 +1.0 若全部 < 0）
  - 每个 cell 以 `fillRect` 渲染，无边框，cell 尺寸 = `canvas.width / paramX.steps` × `canvas.height / paramY.steps`
  - NaN 格点：以特殊颜色 `#333333`（暗灰）渲染，表示数据缺失

### 输出 2：悬停 Tooltip

```typescript
interface HoverTooltipData {
  visible: boolean;                         // Tooltip 是否可见
  position: { x: number; y: number };       // 屏幕像素坐标（相对于 Canvas 容器）
  lambdaValue: number | null;               // 当前格点的 λ 值，NaN 格点为 null
  lambdaLabel: string;                      // 混沌判定标签："混沌"（λ > 0.01）、"准周期"（|λ| ≤ 0.01）、"稳定"（λ < -0.01）
  paramXValue: number;                      // 当前格点对应的 X 轴参数值
  paramYValue: number;                      // 当前格点对应的 Y 轴参数值
  paramXName: string;                       // X 轴参数名（来自 metadata.paramX.name）
  paramYName: string;                       // Y 轴参数名（来自 metadata.paramY.name）
}
```

- 渲染方式：shadcn/ui `Tooltip` 组件，绝对定位跟随鼠标，偏移 (12px, -12px)
- 内容格式：三行文本 —
  ```
  λ = -0.3421（稳定）
  L₂/L₁ = 2.15
  θ₁ = 1.57 rad
  ```
  当 λ 为 NaN 时显示 `数据缺失`

### 输出 3：参数填充事件（点击联动）

```typescript
// 写入 Zustand simulationStore
interface ParameterFillAction {
  // 将当前点击格点对应的参数值写入 simulationStore.params
  // 填充规则：
  //   1. 将 paramX 对应参数写入 store（如 paramX.name="L₂/L₁" → 计算 L₂ = value * L₁）
  //   2. 将 paramY 对应参数写入 store（如 paramY.name="θ₁" → theta1_0 = value）
  //   3. fixedParams 中的其他参数全部覆盖写入 store
  //   4. 写入后自动触发 SIM-01 重新启动仿真（store.isRunning = true, store.resetTrigger++）
  // 注意：填充前先弹出确认 Dialog，防止误触覆盖当前实验状态
  
  source: "lyapunov-heatmap";
  gridCell: { col: number; row: number };          // 点击的网格索引
  paramXValue: number;                              // 实际物理值（非网格索引）
  paramYValue: number;                              // 实际物理值（非网格索引）
  fixedParams: SimulationParamsForHeatmap;          // 固定参数快照
  timestamp: number;                                // Date.now()
}
```

### 输出 4：双向联动游标

```typescript
interface HeatmapCursor {
  visible: boolean;           // 当前仿真参数是否落在本热力图网格范围内
  x: number;                 // Canvas 像素 X 坐标
  y: number;                 // Canvas 像素 Y 坐标
  paramXValue: number;       // 最近格点的 X 参数值
  paramYValue: number;       // 最近格点的 Y 参数值
}
```

- 渲染：在 Canvas 上绘制十字准星光标（直径 12px 空心圆 + 4px 十字线，颜色 `#FFFFFF`，线宽 2px，阴影 2px）
- 联动逻辑：订阅 Zustand `simulationStore.params`，当参数变化时：
  1. 解析当前 params 中与 `paramX.name`/`paramY.name` 对应的参数值
  2. 在网格中查找最近的格点（欧几里得距离最小，O(n²) 朴素扫描，100×100 网格耗时 < 1ms）
  3. 更新游标坐标
  4. 如果当前参数值超出网格范围（如 paramX < min 或 paramX > max），游标 `visible = false`

---

## 核心逻辑步骤

### Step 1: 组件挂载 → 加载预计算数据

| 项目 | 内容 |
|------|------|
| 操作对象 | 预计算 JSON 数据文件 |
| 具体操作 | 1. 从组件 props 或默认配置获取文件路径 `dataPath = "assets/lyapunov_max-{gridHash}.json"`；2. 检查 IndexedDB 缓存，键 = `lyapunov-{gridHash}`；3. 缓存命中 → 直接使用；4. 缓存未命中 → `fetch(dataPath)` → 校验 `metadata.type`、`gridHash`、数组维度一致性 → 存入 IndexedDB |
| 输入来源 | `props.dataPaths`（由父组件传入，包含三个图层的路径映射）或 Vite `import.meta.url` 相对路径 |
| 输出去向 | 组件内部 state `gridData: LyapunovGrid \| null`；IndexedDB object store `precompute` |
| 失败行为 | 见 [异常场景 1](#异常1) |

```typescript
// 组件 props 定义
interface LyapunovHeatmapProps {
  // 三个图层的 JSON 文件路径，由 Vite 构建时解析
  dataPaths: {
    lyapunov_max: string;      // 如 "/assets/lyapunov_max-a1b3f2e8.json"
    lyapunov_min: string;      // 如 "/assets/lyapunov_min-a1b3f2e8.json"
    energy_curvature: string;  // 如 "/assets/energy_curvature-a1b3f2e8.json"
  };
  // Canvas 容器宽度（px），默认 600
  width?: number;
  // Canvas 容器高度（px），默认 600
  height?: number;
}
```

### Step 2: 构建 D3 色阶与渲染热力图

| 项目 | 内容 |
|------|------|
| 操作对象 | `HTMLCanvasElement` 2D Context |
| 具体操作 | 1. 分配离屏 `OffscreenCanvas`（Web Worker 内执行；Worker 不适用时退化为主线程即时渲染）；2. 计算色阶 domain `[λ_min, λ_max]`，如果全为 NaN → domain `[-1, 1]`；3. 使用 `d3.scaleSequential(d3.interpolateRdBu).domain([λ_max, λ_min])`（注意反转：domain 最大→红色，最小→蓝色）；4. 遍历 `grid[y][x]`，每个 cell 用 `fillStyle = colorScale(value)` 填充 `fillRect(x * cellW, y * cellH, cellW, cellH)`；5. NaN cell 以 `#333333` 填充；6. 将离屏 Canvas 通过 `drawImage` 绘制到可见 Canvas；7. 绘制坐标轴标签（paramX.name 在底部横轴，paramY.name 在左侧纵轴，使用 Canvas `fillText`） |
| 输入来源 | `gridData.grid: number[][]`；`gridData.metadata.paramX/paramY` |
| 输出去向 | 可见 Canvas DOM 元素 |
| 失败行为 | Canvas context 为空 → 静默失败 + 控制台 warn |

**色阶 keyframe 参考**：
```
λ_max (+0.5) → #d73027（深红，强混沌）
λ ≈ 0       → #f7f7f7（白，Lyapunov 零点/准周期边界）
λ_min (-0.5) → #4575b4（深蓝，稳定周期）
NaN          → #333333（暗灰，数据缺失）
```

### Step 3: 鼠标悬停 → 显示 Tooltip

| 项目 | 内容 |
|------|------|
| 操作对象 | Canvas + shadcn/ui Tooltip |
| 具体操作 | 1. 监听 Canvas `mousemove` 事件；2. 将像素坐标 `(mouseX, mouseY)` 转换为网格索引 `col = floor(mouseX / cellW)`，`row = floor(mouseY / cellH)`；3. 边界检查 `0 ≤ col < paramX.steps && 0 ≤ row < paramY.steps`，越界 → 隐藏 Tooltip；4. 读取 `grid[row][col]` 的 λ 值；5. 计算实际参数值 `paramXValue = paramX.min + (col + 0.5) / paramX.steps * (paramX.max - paramX.min)`，同理 paramYValue；6. 更新 Tooltip state；7. `λ > 0.01` → 标签 `"混沌"`（红色文字），`\|λ\| ≤ 0.01` → `"准周期"`（黄色文字），`λ < -0.01` → `"稳定"`（蓝色文字），`isNaN(λ)` → `"数据缺失"`（灰色文字）；8. 对 NaN 格点，`lambdaValue` 字段为 `null` |
| 输入来源 | 鼠标事件像素坐标；`gridData` |
| 输出去向 | Zustand 局部 UI state `useAnalysisUIStore.hoverTooltip`；shadcn/ui Tooltip 组件 |
| 失败行为 | gridData 为 null → 不响应悬停 |

### Step 4: 点击格点 → 参数填充 + 启动仿真

| 项目 | 内容 |
|------|------|
| 操作对象 | Zustand `simulationStore` |
| 具体操作 | 1. 监听 Canvas `click` 事件；2. 像素→格点转换（同 Step 3）；3. 越界或 NaN 格点 → 忽略本次点击；4. **弹出 shadcn/ui Dialog**：标题"确认切换参数"，内容列出 (a) X 参数当前值→新值，(b) Y 参数当前值→新值，(c) λ 值及混沌判定，(d) 提示"将覆盖当前参数并重新启动仿真"；5. 用户取消 → 什么都不做；6. 用户确认 → 调用 `simulationStore.setParams({...fixedParams, [paramXName]: paramXValue, [paramYName]: paramYValue, resetTrigger: Date.now()})`，然后 `simulationStore.setRunning(true)`；7. 记录操作到 `simulationStore.actionLog[]` |
| 输入来源 | Canvas click 事件；`gridData`；Zustand `simulationStore.getState().params`（用于对比当前值） |
| 输出去向 | Zustand `simulationStore`；SIM-01 物理引擎（通过 store 订阅自动触发） |
| 失败行为 | Zustand store 不可用 → console.error + shadcn/ui Toast "参数填充失败" |

**参数名映射表**（`paramX.name` → Zustand `simulationStore.params` 的字段名）：

| 预计算参数名 | Zustand 字段名 | 转换逻辑 |
|------|------|------|
| `"L₂/L₁"` | `L2` | `L2 = paramXValue * L1`，`L1` 取自 `fixedParams.L1` |
| `"θ₁"` | `theta1_0` | 直接赋值 |
| `"θ₂"` | `theta2_0` | 直接赋值 |
| `"m₂/m₁"` | `m2` | `m2 = paramXValue * m1`，`m1` 取自 `fixedParams.m1` |
| `"ω̇₁"` | `omega1_0` | 直接赋值 |
| `"g"` | `g` | 直接赋值 |

### Step 5: 双向联动 — 仿真参数变化 → 游标移动

| 项目 | 内容 |
|------|------|
| 操作对象 | Canvas 游标 overlay |
| 具体操作 | 1. 组件内使用 `useEffect` 订阅 `simulationStore` 的 `params` 变化（通过 `useSimulationStore.subscribe()` 或 Zustand selector + `useEffect` 依赖）；2. 每次 `params` 变化时，从 `params` 中提取与 `paramX.name`、`paramY.name` 对应的值（使用步骤 4 的参数名映射表）；3. 如果提取失败（参数名无法匹配）→ 游标 `visible = false`；4. 将参数值转换为网格坐标 `col = ((valueX - paramX.min) / (paramX.max - paramX.min)) * paramX.steps`，同理 `row`；5. 如果 `col` 或 `row` 超出 `[0, steps-1]` 范围 → 游标 `visible = false`；6. 将网格坐标转为像素坐标 `cursorX = (col + 0.5) * cellW`，`cursorY = (row + 0.5) * cellH`；7. 在 Canvas 上绘制十字光标（清除上次光标区域 → 重新绘制热力图对应 cell → 绘制新光标）或使用 CSS overlay div 定位；8. 使用防抖（debounce 50ms），避免 60fps 仿真导致的过度重绘 |
| 输入来源 | Zustand `simulationStore.params` 的增量变化 |
| 输出去向 | Canvas overlay 视觉更新 |
| 失败行为 | 参数超出网格范围 → 游标隐藏，不影响其他功能 |

### Step 6: 图层切换

| 项目 | 内容 |
|------|------|
| 操作对象 | 当前活跃的 `LyapunovGrid` 数据 |
| 具体操作 | 1. 用户点击 shadcn/ui Tabs 切换 `"lyapunov_max"` / `"lyapunov_min"` / `"energy_curvature"`；2. 检查目标图层数据是否已加载（组件 `Map<string, LyapunovGrid>` 缓存）；3. 已加载 → 切换到该数据，重新执行 Step 2 渲染；4. 未加载 → 设置 `gridData = null`，触发 Step 1 加载流程（显示 Skeleton），加载完成后自动渲染；5. 保留游标位置（当前仿真参数不变），但游标可能因新图层网格范围不同而变为 `visible = false`；6. 色阶对于 `energy_curvature` 类型使用 `d3.interpolateViridis`（连续色阶），因为曲率无正负之分 |
| 输入来源 | shadcn/ui Tabs `value` 变化 |
| 输出去向 | `gridData` state 更新 → Canvas 重渲染 |
| 失败行为 | 新图层加载失败 → 保留旧图层 + Toast 提示 |

---

## 依赖与集成接口

### 外部模块依赖

| 依赖模块 | 调用接口 | 调用时机 | 数据方向 |
|------|------|------|------|
| SIM-02 参数控制面板 | `simulationStore.setParams(partialParams)` | 用户点击热力图并确认 Dialog 后 | ANL-01 → SIM-02 |
| SIM-01 双摆物理引擎 | `simulationStore.setRunning(true)` | 同 setParams 一起调用 | ANL-01 → SIM-01 |
| SYS-03 预计算数据管线 | `fetch(dataPath)` | 组件挂载 / 图层切换时 | SYS-03 → ANL-01 |
| SYS-02 运行时异常处理 | `useToast()` (shadcn/ui) | 数据加载失败 / 参数填充失败 | ANL-01 → SYS-02 |
| INF-01 可观测性 | `performance.mark('lyapunov-render-start')` / `performance.mark('lyapunov-render-end')` | 渲染前后 | ANL-01 → INF-01 |

### IndexedDB 接口

```typescript
// 数据库名：chaos-pendulum
// Object Store：precompute（与 §5.3 共用）
// 键路径：key

interface PrecomputeCacheEntry {
  key: string;            // 格式："{type}-{gridHash}"，如 "lyapunov_max-a1b3f2e8"
  data: LyapunovGrid;     // 完整的预计算数据
  cachedAt: number;       // 缓存写入时间戳，Date.now()
  size: number;           // JSON 序列化后的字节数，用于 LRU 容量计算
}

// 缓存操作函数（在 src/lib/cache/precomputeCache.ts 中实现）
async function getPrecomputeData(type: string, gridHash: string): Promise<LyapunovGrid | null>;
async function setPrecomputeData(type: string, gridHash: string, data: LyapunovGrid): Promise<void>;
async function evictLRU(storeName: string, maxEntries: number): Promise<void>; // maxEntries = 10
```

### Zustand Store 接口

```typescript
// 本模块需要访问的 simulationStore slice（src/stores/simulationStore.ts）
interface SimulationStore {
  // 读取（订阅）
  params: {
    m1: number; m2: number; L1: number; L2: number;
    theta1_0: number; theta2_0: number;
    omega1_0: number; omega2_0: number;
    g: number; damping: number;
  };
  
  // 写入（点击填充时）
  setParams: (partial: Partial<SimulationStore['params']> & { resetTrigger?: number }) => void;
  setRunning: (running: boolean) => void;
  resetTrigger: number;   // 每次参数大变更时递增，Worker 监听此值重启积分
}

// 本模块专用的 UI state（在 src/stores/analysisStore.ts 中定义）
interface AnalysisUIState {
  activeLayer: "lyapunov_max" | "lyapunov_min" | "energy_curvature";
  setActiveLayer: (layer: AnalysisUIState['activeLayer']) => void;
  hoverTooltip: HoverTooltipData;
  setHoverTooltip: (data: HoverTooltipData) => void;
}
```

---

## 状态机

本模块无复杂异步流程状态机（同步的加载/渲染/交互）。唯一需要状态管理的是数据加载生命周期：

| 当前状态 | 触发事件 | 下一状态 | 前置条件 | 副作用 |
|------|------|------|------|------|
| `idle` | 组件挂载 | `loading` | `dataPaths` prop 已提供 | 设置 `gridData = null`；Canvas 显示 shadcn/ui Skeleton |
| `loading` | fetch 成功 + 校验通过 | `ready` | JSON 结构符合 `LyapunovGrid` 类型；`gridHash` 校验通过 | `gridData = parsedData`；写入 IndexedDB；执行 Step 2 渲染 |
| `loading` | fetch 失败 / 校验失败 / 超时 | `error` | — | 设置 `errorMessage`；显示重试按钮；保留旧图层数据（如有） |
| `error` | 用户点击"重试" | `loading` | — | 清除 `errorMessage`；重新 fetch |
| `ready` | 图层切换 | `loading`（仅当目标层未缓存） | 用户点击 Tabs | 新图层 fetch 流程 |
| `ready` | 图层切换 | `ready`（当目标层已缓存） | `mapCache.has(targetLayer)` | 切换 `gridData`；立即重渲染 |
| `ready` | 组件卸载 | — | — | 注销 Zustand subscribe；清理 IndexedDB 连接 |

---

## 异常与边界条件

### <a id="异常1"></a>异常场景 1：预计算数据加载失败

| 维度 | 内容 |
|------|------|
| **触发条件** | `fetch()` 返回非 2xx（文件不存在/404）、网络中断（`TypeError: Failed to fetch`）、JSON 解析失败（`SyntaxError`）、数据结构校验失败（缺少 `metadata.gridHash` 或 `grid` 维度与 `steps` 不匹配）、请求超时（> 10s 无响应） |
| **处理策略** | 1. 记录错误到控制台 + Zustand debugStore（INF-01）；2. 显示 shadcn/ui Toast "预计算数据加载失败：{简述原因}"，持续 5s；3. 在 Canvas 区域显示错误占位（暗色背景 + 白色文字 "数据不可用" + shadcn/ui Button "重试"）；4. 如果已有另一图层的数据正常显示，保留当前图层不切换；5. 不影响 3D 仿真运行 |
| **重试参数** | 次数：3 次；退避策略：指数退避 1s → 2s → 4s；超时：每次 fetch 10s；重试后仍失败 → 显示"离线模式：高级分析功能需预计算数据支持" |
| **恢复路径** | 用户点击重试按钮 → 重置重试计数 → 重新 fetch |

### 异常场景 2：点击参数填充后仿真引擎无法启动

| 维度 | 内容 |
|------|------|
| **触发条件** | 填充的参数导致 ODE 数值发散（如 L₂ = 0 导致零摆长、m₂ 过大导致刚度矩阵奇异）；Worker 返回 NaN 状态向量连续 3 帧 |
| **处理策略** | 1. simulationStore 检测到 `theta1`/`theta2` 中存在 NaN → 自动暂停仿真（`isRunning = false`）；2. Toast 提示 "所选参数导致数值发散，已自动暂停。请更换参数组合"；3. 热力图不恢复旧参数，用户可继续点击其他格点；4. 将发散参数记录到 actionLog |
| **重试参数** | 不自动重试（参数发散通常意味着该参数组合本质上不适合仿真） |
| **恢复路径** | 用户手动在控制面板（SIM-02）调回安全参数，或点击热力图中色阶为蓝色的稳定区域 |

### 异常场景 3：Canvas 容器尺寸为零

| 维度 | 内容 |
|------|------|
| **触发条件** | 父容器 `display: none`、`width: 0`、`height: 0`；组件在不可见的 Tab 面板中初始化；移动端折叠面板使 Canvas 容器不可见 |
| **处理策略** | 1. `useContainerSize` hook（ResizeObserver）检测到尺寸为 0 → 不执行渲染循环；2. 设置 `renderSkipped = true`；3. 当 ResizeObserver 检测到尺寸 > 0 → 触发首次渲染；4. Canvas 的 `width`/`height` 属性仅在尺寸 > 0 时设置（避免无效的 0 尺寸 Canvas） |
| **重试参数** | 无（由 ResizeObserver 自动触发恢复） |
| **恢复路径** | 容器变为可见/有尺寸时自动渲染 |

### 异常场景 4：IndexedDB 不可用

| 维度 | 内容 |
|------|------|
| **触发条件** | 浏览器隐私模式禁用 IndexedDB；存储配额已满（`QuotaExceededError`）；用户清理浏览器数据 |
| **处理策略** | 1. 首次访问时 `indexedDB.open()` 失败 → 跳过缓存层，所有数据每次从 `fetch` 加载；2. 写入时捕获 `QuotaExceededError` → 跳过写入 + console.warn；3. 不阻塞正常功能，不提示用户（隐私模式是用户主动选择）；4. 设置 `indexedDBAvailable = false` 标志，后续不再尝试写入 |
| **重试参数** | 每次页面加载时重新尝试 `indexedDB.open()`（不重试写入） |
| **恢复路径** | IndexedDB 恢复时自动启用缓存 |

### 边界条件清单

| 边界条件 | 处理方式 |
|------|------|
| 网格全部为 NaN | 不渲染，Canvas 显示"该参数范围无有效数据，请更换扫描范围" |
| λ 值全部 > 0（全混沌区） | 色阶 domain 自动调整为 `[0, λ_max]`，使用单色渐变（白→红），不强行显示蓝色 |
| λ 值全部 < 0（全稳定区） | 色阶 domain 自动调整为 `[λ_min, 0]`，使用单色渐变（蓝→白），不强行显示红色 |
| 点击 NaN 格点 | 忽略点击，不弹出 Dialog，Tooltip 显示"数据缺失，不可选" |
| 触屏设备双指缩放与点击冲突 | 优先处理双指缩放（`d3.zoom` 接管 touch 事件），单指 tap 视为点击 |
| 预计算脚本版本与前端不匹配 | `metadata.solverVersion` 与前端硬编码的 `EXPECTED_VERSION` 不一致 → 提示"数据版本不兼容，请联系开发者重新生成" |
| 100×100 网格在低端设备上的渲染性能 | 离屏 Canvas + 批量 `fillRect`，预估耗时 < 50ms；若 > 100ms → 降级至 50×50 网格（取平均值） |

---

## 原则兑现清单

| 设计原则 | 来源 | 代码级约束 |
|------|------|------|
| 分析深度 | 功能设计_v0 §四 | λ 值显示精度 ≥ 4 位小数（`toFixed(4)`），参数值 ≥ 3 位有效数字；色阶 keyframe 严格按设计的深蓝→白→深红三段 |
| 双向联动 | 功能设计_v0 §四 4.1 | 热力图→3D：点击填充参数后自动启动仿真；3D→热力图：订阅 Zustand，50ms 防抖更新游标 |
| 科研级交互 | 功能设计_v0 §二 | 悬停 Tooltip 显示 λ 值 + 混沌判定 + 参数对；支持框选放大（d3-zoom） |
| 优雅降级 | 功能设计_v0 §九 | 数据加载失败时保留旧图层 + 显示重试；IndexedDB 不可用时不阻塞功能 |
| 零后端 | 技术栈设计 v1.2 §1.2 | 数据从本地 JSON 文件 fetch；缓存使用 IndexedDB（浏览器端） |
| 工程炫技 | 功能设计_v0 §十 P3 | 100×100 热力图 + Canvas 离屏渲染 + 实时联动游标 < 1ms 格点查找 |

---

## 验收测试场景

### 正向测试 1：加载预计算数据并渲染热力图

**Given** 预计算 JSON 文件 `/assets/lyapunov_max-a1b3f2e8.json` 存在且内容合法（100×100 grid，metadata 完整），IndexedDB 为空（首次访问）
**When** 用户导航至分析模式，`LyapunovHeatmap` 组件挂载
**Then** 
1. 组件 display Skeleton（灰底 + 脉冲动画）持续时间 < 500ms
2. fetch 成功返回 JSON → 数据校验通过 → Canvas 显示 100×100 热力图
3. 色阶从深蓝（左上角稳定区）渐变至深红（右下角混沌区）
4. IndexedDB 中新增一条记录 `{ key: "lyapunov_max-a1b3f2e8", ... }`
5. 底部横轴显示参数名 "L₂/L₁"，左侧纵轴显示 "θ₁"
6. `performance.measure('lyapunov-render')` 耗时 < 50ms

**测试 JSON 数据（精简示例，实际为 100×100）**：
```json
{
  "metadata": {
    "type": "lyapunov_max",
    "paramX": { "name": "L₂/L₁", "symbol": "L_2/L_1", "min": 0.5, "max": 3.0, "steps": 100, "unit": "" },
    "paramY": { "name": "θ₁", "symbol": "\\theta_1", "min": 0.0, "max": 6.283185, "steps": 100, "unit": "rad" },
    "fixedParams": { "m1": 1.0, "m2": 1.0, "L1": 1.0, "L2": 1.0, "omega1_0": 0.0, "omega2_0": 0.0, "g": 9.81, "damping": 0.0, "integrationTime": 200.0, "dt": 0.01 },
    "gridHash": "a1b3f2e8",
    "generatedAt": "2026-04-27T08:30:00Z",
    "solverVersion": "1.0.0"
  },
  "grid": [[-0.45, -0.38, 0.02, 0.15, 0.42], [-0.50, -0.41, -0.05, 0.08, 0.35]]
}
```

---

### 正向测试 2：悬停 Tooltip + 点击填充参数

**Given** 热力图已正常渲染，`simulationStore.params` 当前值 `{ theta1_0: 0.5, L2: 0.8, ... }`
**When** (a) 鼠标悬停在 Canvas 像素坐标 (312, 247)（对应 col=52, row=41，λ=0.3421, paramX=1.8, paramY=2.57）；(b) 点击该格点并在 Dialog 中确认
**Then**
1. shadcn/ui Tooltip 显示：
   ```
   λ = 0.3421（混沌）
   L₂/L₁ = 1.80
   θ₁ = 2.57 rad
   ```
2. 鼠标移出 Canvas → Tooltip `visible=false`
3. 点击后弹出 Dialog："确认切换参数"，列出当前值→新值的差异
4. 用户确认 → `simulationStore.params` 更新为 `{ theta1_0: 2.57, L2: 1.8 * L1 = 1.8, ... fixedParams }`
5. `simulationStore.isRunning` = true，3D 场景开始以新参数仿真

---

### 反向测试 1：数据加载失败 → 优雅降级

**Given** 预计算 JSON 文件 `/assets/lyapunov_max-x0x0x0.json` 不存在（404）
**When** 用户切换到该图层（或首次挂载该图层）
**Then**
1. 控制台输出错误信息（含 HTTP 状态码 404）
2. Canvas 区域显示暗色占位 + 白色文字 "预计算数据加载失败：文件未找到"
3. shadcn/ui Button "重试" 可见
4. Toast 弹出，5s 后自动消失
5. 如果用户此前在 lyapunov_min 图层正常工作，该图层保持不变继续显示
6. 用户点击重试 → 重新 fetch → 仍然 404 → 显示"离线模式"提示
7. 3D 仿真不受影响，继续运行

---

### 反向测试 2：点击 NaN 格点 → 忽略

**Given** 热力图正常渲染，其中 `grid[73][15] = NaN`
**When** 鼠标悬停格点 (col=15, row=73)，然后点击
**Then**
1. Tooltip 显示：
   ```
   数据缺失
   L₂/L₁ = 0.65
   θ₁ = 4.59 rad
   ```
2. λ 行显示灰色文字 "数据缺失"
3. 点击 → 不弹出 Dialog，控制台输出 "跳过 NaN 格点 (15, 73)"
4. `simulationStore.params` 不发生变化

---

### 反向测试 3：IndexedDB 写入失败 → 降级运行

**Given** 浏览器隐私模式导致 IndexedDB `open()` 抛出 `DOMException`
**When** 组件首次加载并尝试缓存预计算数据
**Then**
1. 控制台 warn "IndexedDB 不可用，将跳过缓存"
2. `indexedDBAvailable` 标志设为 false
3. 热力图仍然正常渲染（从 fetch 获取的数据直接使用）
4. 后续加载不再尝试 IndexedDB 写入
5. 用户无感知（无 Toast/Error 提示，尊重隐私模式）
6. 页面刷新后重新检测 IndexedDB 可用性

---

## 注意事项与禁止行为

### 注意事项

1. **Canvas DPI 缩放**：必须在 `useContainerSize` hook 中处理 `window.devicePixelRatio`。Canvas 的 `width`/`height` 属性设为 `containerWidth * dpr`，CSS 尺寸设为 `containerWidth`。所有像素坐标计算必须乘以 dpr，否则 Retina 屏幕上热力图模糊。

2. **格点索引与参数值换算**：参数空间均匀剖分，格点中心值 = `min + (index + 0.5) / steps * (max - min)`。注意 Y 轴方向：grid[0] 对应 paramY.max（顶部），grid[stepsY-1] 对应 paramY.min（底部），与屏幕 Y 轴方向相反。

3. **Zustand subscribe 内存泄漏**：`useSimulationStore.subscribe(selector, callback)` 必须在组件 `useEffect` 的 cleanup 中调用返回的 `unsubscribe()`，否则每次 simStore 变化都会触发已卸载组件的回调。

4. **色阶反转逻辑**：`d3.interpolateRdBu` 默认 0→蓝，1→红。但 domain 为 λ 值时，我们希望 λ<0（稳定）→蓝，λ>0（混沌）→红。因此必须 `domain([λ_max, λ_min])` 反转输入，使高值映射至 1（红端），低值映射至 0（蓝端）。

5. **ResizeObserver 循环**：如果 Canvas 渲染导致父容器尺寸微调（scrollbar 出现/消失），可能触发 ResizeObserver 循环。使用 `requestAnimationFrame` 包裹渲染逻辑以避免 layout thrashing。

6. **预计算数据版本**：前端应硬编码 `EXPECTED_SOLVER_VERSION = "1.0.0"`。当 `metadata.solverVersion` 不匹配时，仍尝试渲染但显示 Toast 提示版本差异。版本号格式严格遵循 semver。

### 禁止行为

1. **禁止在主线程执行 100×100 格点的 ODE 积分**。热力图数据必须来自预计算 JSON 文件，不得在浏览器中实时求解 Lyapunov 指数网格。

2. **禁止使用 SVG `<rect>` 渲染 10,000 个格点**。必须使用 Canvas 2D Context `fillRect`。SVG 会产生 10,000 个 DOM 节点，导致悬停/滚动性能灾难。

3. **禁止在 Canvas `mousemove` 回调内执行 `getImageData` 或任何同步阻塞操作**。像素→格点转换仅需整数除法和数组索引，耗时 < 0.01ms。

4. **禁止点击 NaN 格点时弹出 Dialog**。NaN 格点表示数据缺失，不应允许参数填充。

5. **禁止在未弹出确认 Dialog 的情况下直接覆盖仿真参数**。分析模式下用户可能正在进行长时间仿真，误触热力图应立即可撤销（Dialog 提供"取消"按钮）。

6. **禁止使用 `localStorage` 存储预计算 JSON**。`localStorage` 单 domain 上限 5-10MB，一个 Lyapunov grid JSON 约 200KB（100×100 float 序列化），三个图层约 600KB。但加上分岔图和快照数据后易超限。IndexedDB 无此限制。

7. **禁止在组件内硬编码色阶 domain**。Domain 必须从实际 `grid` 数据计算 `[min, max]`，以自适应不同参数范围的预计算结果。

---

*本文档由 AI 辅助生成，需经技术负责人评审后生效。*
