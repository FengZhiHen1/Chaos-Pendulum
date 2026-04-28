# 功能规格：ANL-02 参数空间分岔图

> **文档生成时间**：`2026-04-28 15:30:00 CST`  
> **源设计文档**：功能设计_v0.md §四 4.2、功能模块全拆解.md ANL-02、双摆混沌实验室-技术栈设计.md v1.2  
> **版本记录**：
> | 版本 | 时间 | 修改人 | 变更摘要 |
> |------|------|--------|----------|
> | v1.0 | 2026-04-28 15:30:00 | AI Assistant | 初始版本，基于功能设计_v0 §四 4.2 + 技术栈设计 v1.2 |

> **冲突核查指引**：若发现与已有规格文档冲突，优先以时间戳更新的版本为准，并在版本记录中追加冲突解决条目。

---

## 所属模块与溯源

| 维度 | 内容 |
|------|------|
| 模块编号 | ANL-02 |
| 模块名称 | 参数空间分岔图 |
| 所属模式 | 分析模式（Analyze） |
| 设计文档溯源 | 功能设计_v0.md §四 4.2；功能模块全拆解.md ANL-02行；技术栈设计.md §4.9、§5.3 |
| 依赖模块 | SYS-03（预计算数据管线）— 提供 JSON 数据文件；SIM-02（参数控制面板）— 接收点击填充的参数 |
| 被依赖模块 | SIM-01（双摆物理引擎）— 参数填充后驱动仿真 |

---

## 已有设计兼容性分析

已审查以下规格文档：

| 文档 | 审查日期 | 共享接口 | 冲突？ |
|------|------|------|:---:|
| ANL-01-李雅普诺夫指数谱.md (v1.0) | 2026-04-28 | `simulationStore`、`analysisStore`、IndexedDB `precompute` object store、参数名映射表、`PrecomputeCacheEntry` | ✅ 无冲突 |

**一致性保障**：

| 共享项 | ANL-01 定义 | ANL-02 处理方式 |
|------|------|------|
| `simulationStore` 接口 | `params`、`setParams(partial)`、`setRunning(bool)`、`resetTrigger` | 完全复用，不新增字段 |
| `analysisStore` | `activeLayer`、`hoverTooltip` | ANL-02 使用独立组件 state，不写入 `analysisStore` 的 ANL-01 专用字段 |
| IndexedDB 存储 | `precompute` object store，键 = `{type}-{gridHash}` | ANL-02 键 = `bifurcation-{gridHash}`，与 ANL-01 的 `lyapunov_max-{hash}` 等无冲突 |
| `PrecomputeCacheEntry` | `data: LyapunovGrid` | **需要泛化为 `PrecomputeCacheEntry<T>`**：`T = LyapunovGrid \| BifurcationData`。原 `getPrecomputeData`/`setPrecomputeData` 签名需增加泛型参数。详见本节末尾的接口修订建议 |
| 参数名映射表 | 5 条映射（ANL-01 §Step 4） | 完全复用同一张映射表，不从零定义 |
| 确认 Dialog 模式 | shadcn/ui Dialog + 参数对比 + 启动仿真 | 模式相同，Dialog 内容适配 ANL-02（展示单个参数 + 采样区间而非两个参数） |
| D3 Canvas 渲染 | Canvas 2D Context + d3-scale + d3-zoom | 技术栈相同，但 ANL-02 用散点图（`arc`/`fillRect` 单像素点）而非热力图 cell 填充 |

**接口修订建议**（需同步更新 `src/lib/cache/precomputeCache.ts`）：

```typescript
// 修订前（ANL-01 专用）
interface PrecomputeCacheEntry {
  key: string;
  data: LyapunovGrid;
  cachedAt: number;
  size: number;
}
async function getPrecomputeData(type: string, gridHash: string): Promise<LyapunovGrid | null>;

// 修订后（ANL-01 与 ANL-02 共用，本规格为 ANL-02 侧定义）
type PrecomputeDataType = LyapunovGrid | BifurcationData;
interface PrecomputeCacheEntry<T extends PrecomputeDataType = PrecomputeDataType> {
  key: string;
  data: T;
  cachedAt: number;
  size: number;
}
async function getPrecomputeData<T extends PrecomputeDataType>(type: string, gridHash: string): Promise<T | null>;
async function setPrecomputeData<T extends PrecomputeDataType>(type: string, gridHash: string, data: T): Promise<void>;
```

> 此项修订在 ANL-02 首次实现时需要落实。ANL-01 无需修改调用方式（TypeScript 泛型自动推断）。

---

## 技术栈绑定

| 维度 | 必须使用 | 版本 | 禁止使用 |
|------|----------|------|----------|
| UI 框架 | React + TypeScript | 18.x / 5.x | 类组件（使用函数组件 + Hooks） |
| 状态管理 | Zustand | 4.x | React Context 传递分岔图交互状态 |
| 2D 渲染 | D3.js（d3-scale、d3-zoom、d3-selection、d3-array） | 7.x | ECharts / Chart.js / 其他图表库 |
| 点选检测 | 手动计算像素→参数空间映射 | — | D3 `voronoi`（点分布不规则，Voronoi 会误选空白区域） |
| 框选放大 | d3-zoom | 7.x | 自建 zoom（d3-zoom 提供了完善的 touch/mouse/wheel 支持） |
| 缓存 | IndexedDB（原生 API），object store `precompute` | — | localStorage（分岔图数据可超 5MB 上限） |
| UI 组件 | shadcn/ui（Dialog、Tooltip、Skeleton、Toast） | latest | 自建组件（保持项目一致性） |
| 样式 | Tailwind CSS | 3.x | CSS Modules / styled-components |
| 数据 hash | Web Crypto API `SubtleCrypto.digest('SHA-256')` | 原生 | 第三方 hash 库 |
| 文件组织 | 组件目录 `src/components/analysis/BifurcationPlot/` | — | 将分岔图逻辑散布在页面组件中 |
| Canvas 操作 | 直接操作 Canvas 2D Context | 原生 | SVG 渲染 > 5000 散点（SVG DOM 节点过多导致交互卡顿） |

---

## 输入定义（精确类型）

### 输入 1：预计算数据文件（fetch 加载）

```typescript
// 文件路径：dist/assets/bifurcation-[gridHash].json
// 每个文件对应一种"参数扫描 + 状态变量采样"组合

interface BifurcationData {
  metadata: {
    type: "bifurcation";                  // 固定值，用于 IndexedDB 键前缀

    // 扫描的控制参数（X 轴）
    scannedParam: {
      name: string;                       // 参数名，如 "θ₁"、"L₂"、"m₂"
      symbol: string;                     // LaTeX 符号，如 "\\theta_1"，用于坐标轴标签渲染
      min: number;                        // 扫描起始值，如 0.0（单位与参数一致）
      max: number;                        // 扫描终止值，如 6.283185（2π rad）
      steps: number;                      // 扫描步数，固定 500（每条扫描线取 500 个参数值）
      unit: string;                       // 单位，如 "rad"、"m"、""（无量纲）
    };

    // 采样的状态变量（Y 轴）
    sampledVariable: {
      name: string;                       // 采样变量名，如 "θ₂ 局部极大值"、"θ̇₂ 局部极大值"
      symbol: string;                     // LaTeX 符号，如 "\\theta_2\\ \\text{max}"
      min: number;                        // 采样结果中全局最小值（脚本计算），用于初始 Y 轴范围
      max: number;                        // 采样结果中全局最大值（脚本计算），用于初始 Y 轴范围
      unit: string;                       // 单位，如 "rad"、"rad/s"
    };

    // 扫描时固定的其他参数（与 ANL-01 fixedParams 结构完全一致）
    fixedParams: {
      m1: number;                         // 上摆质量，必填，> 0，单位 kg，默认 1.0
      m2: number;                         // 下摆质量，必填，> 0，单位 kg，默认 1.0
      L1: number;                         // 上摆摆长，必填，> 0，单位 m，默认 1.0
      L2: number;                         // 下摆摆长，必填，> 0，单位 m，默认 1.0
      theta1_0: number;                   // 上摆初始角（若 scannedParam 不是 θ₁），必填，单位 rad，默认 1.57
      theta2_0: number;                   // 下摆初始角（若 scannedParam 不是 θ₂），必填，单位 rad，默认 0.0
      omega1_0: number;                   // 上摆初始角速度，必填，单位 rad/s，默认 0.0
      omega2_0: number;                   // 下摆初始角速度，必填，单位 rad/s，默认 0.0
      g: number;                          // 重力加速度，必填，> 0，单位 m/s²，默认 9.81
      damping: number;                    // 阻尼系数，必填，≥ 0，无量纲，默认 0.0
      transientTime: number;              // 瞬态舍弃时长，必填，> 0，单位 s，默认 100.0
      sampleTime: number;                 // 稳态采样时长，必填，> 0，单位 s，默认 200.0
      dt: number;                         // 积分步长，必填，> 0，单位 s，默认 0.01
    };

    gridHash: string;                     // SHA-256(JSON.stringify({scannedParam, sampledVariable, fixedParams, type})).slice(0, 16)
    generatedAt: string;                  // 预计算脚本运行时间，ISO 8601 格式，如 "2026-04-27T10:00:00Z"
    solverVersion: string;                // 预计算脚本版本号，如 "1.0.0"
  };

  // 采样数据：沿扫描参数轴的每个采样点，记录该参数值下稳态阶段出现的所有局部极大值
  // samples.length = metadata.scannedParam.steps（典型值 500）
  // samples[i] 是在 scannedParam[i] = min + (i+0.5)/steps*(max-min) 处采集到的所有 θ₂ 局部极大值
  // samples[i].length 可变：
  //   - 周期-1：samples[i].length = 1（一个点）
  //   - 周期-2：samples[i].length = 2（两点上下排列，形成分岔特征）
  //   - 周期-4：samples[i].length = 4
  //   - 混沌：samples[i].length 可能多达数十个（在纵轴上形成连续带）
  //   - 空数组 []：该参数值处仿真发散或未检测到极大值
  samples: number[][];                    // [steps][variableLength]
}
```

**预计算脚本输出示例**（`bifurcation-a1b3f2e8.json`，精简为 5 步）：

```json
{
  "metadata": {
    "type": "bifurcation",
    "scannedParam": { "name": "θ₁", "symbol": "\\theta_1", "min": 0.0, "max": 6.283185, "steps": 500, "unit": "rad" },
    "sampledVariable": { "name": "θ₂ 局部极大值", "symbol": "\\theta_2\\ \\text{max}", "min": -3.1, "max": 3.1, "unit": "rad" },
    "fixedParams": { "m1": 1.0, "m2": 1.0, "L1": 1.0, "L2": 1.0, "theta1_0": 1.57, "theta2_0": 0.0, "omega1_0": 0.0, "omega2_0": 0.0, "g": 9.81, "damping": 0.0, "transientTime": 100.0, "sampleTime": 200.0, "dt": 0.01 },
    "gridHash": "a1b3f2e8",
    "generatedAt": "2026-04-27T10:00:00Z",
    "solverVersion": "1.0.0"
  },
  "samples": [
    [-0.85],
    [-0.83, 0.79],
    [0.81],
    [-0.78, 0.82, 0.15, -0.42],
    [0.72, -0.68, 0.55, -0.53, 0.38, -0.31, 0.24, -0.18, 0.05, -0.09, 0.61, -0.47, 0.32, -0.22, 0.11]
  ]
}
```

解释：第 0 步（θ₁=0.006）→ 周期-1（1个点），第 1 步（θ₁=0.019）→ 周期-2（2点分岔），第 3 步→ 周期-4，第 4 步→ 混沌（15个散布点）。

### 输入 2：当前仿真参数（Zustand 订阅，用于游标联动）

```typescript
// 来源：src/stores/simulationStore.ts（与 ANL-01 共享，字段完全一致）
// ANL-02 仅读取 scannedParam 对应的字段 + fixedParams 中非扫描字段
// 例如：若 scannedParam.name = "θ₁"，则读取 params.theta1_0 作为游标位置

interface SimulationParamsForBifurcation {
  m1: number;
  m2: number;
  L1: number;
  L2: number;
  theta1_0: number;
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
| 鼠标悬停 | Canvas `mousemove` | `{ x: number; y: number }` — Canvas 像素坐标 | 鼠标在 Canvas 区域内移动，每 16ms 节流 |
| 鼠标离开 | Canvas `mouseleave` | `void` | 鼠标移出 Canvas 区域 |
| 点击 | Canvas `click` | `{ x: number; y: number }` — Canvas 像素坐标 | 鼠标左键单击 Canvas（需与 d3-zoom 的拖拽区分） |
| 竖直游标拖拽 | Canvas `mousedown` + `mousemove` + `mouseup` | `{ startX, currentX }` — 拖拽起止像素 X 坐标 | 鼠标在游标 ±8px 范围内按下并拖动 |
| 框选放大 | d3-zoom `zoom` 事件 | `d3.ZoomTransform` | 鼠标滚轮 / 双指缩放 / 按住 Shift 框选 |
| 双击重置 | Canvas `dblclick` | `void` | 双击 Canvas 任意位置，重置 zoom 至初始视图 |

---

## 输出定义（精确类型）

### 输出 1：Canvas 2D 散点图

- **渲染目标**：`<canvas>` 元素，尺寸由 `useContainerSize` hook 提供
- **视觉规格**：
  - 散点：每个数据点为半径 1.8px 实心圆（Canvas `arc` + `fill`）
  - 颜色：周期区（samples[i].length ≤ 2）→ `#1a5fb4`（深蓝）；倍周期区（3 ≤ length ≤ 8）→ `#865ea8`（紫）；混沌区（length > 8）→ `#e01b24`（深红）
  - 透明度：全局 `alpha = 0.6`，密集区域因叠加而自然加深，形成密度可视化
  - 坐标轴：底部横轴（`scannedParam.name` + 单位）+ 左侧纵轴（`sampledVariable.name` + 单位），刻度标签 12px sans-serif，轴标题 14px
  - 背景：`#fafafa`（浅灰，降低对比度使散点突出）
  - 网格线：浅灰 `#e0e0e0` 虚线，x 方向 10 条，y 方向 8 条
- **性能**：500（步）× 均值 6（点/步）≈ 3000 散点。Canvas 渲染 < 5ms

### 输出 2：悬停 HUD

```typescript
interface BifurcationHoverData {
  visible: boolean;
  position: { x: number; y: number };      // 屏幕像素坐标
  scannedParamValue: number;                // X 轴参数值（悬停位置对应的参数值）
  scannedParamName: string;                 // X 轴参数名
  sampledValues: number[] | null;           // 该 X 位置的所有采样值（可能为空数组）
  sampledVariableName: string;              // Y 轴变量名
  pointCount: number;                       // 该参数值处的采样点数量
  regime: "周期-1" | "周期-2" | "周期-4" | "倍周期" | "混沌" | "无数据";
}
```

- 渲染方式：shadcn/ui `Tooltip` 组件，绝对定位跟随鼠标，偏移 (12px, -12px)
- 查找逻辑：将鼠标 X 像素坐标 → 最近的 `scannedParam` 步索引 → 读取 `samples[i]`
- 内容格式：
  ```
  θ₁ = 1.571 rad
  采样点：4（周期-4）
  θ₂_max = {-0.78, 0.82, 0.15, -0.42}
  ```
  当 `samples[i].length = 0` 时显示 `无有效数据`

### 输出 3：竖直游标

```typescript
interface BifurcationCursor {
  visible: boolean;                         // 当前仿真参数是否落在扫描范围内
  paramValue: number;                       // 游标对应的参数值 = 当前仿真中 scannedParam 对应字段的值
  x: number;                                // Canvas 像素 X 坐标
  label: string;                            // 游标标签文本，如 "当前: 1.57 rad"
}
```

- 渲染：垂直虚线，`#ff6600`（橙），线宽 2px，从 Canvas 顶部延伸至底部；顶部显示圆角标签（背景 `#ff6600`，白色文字 11px）内含 `label`
- 拖拽交互：游标线上 ±8px 命中区域；拖拽时顶部标签实时更新参数值；释放时写入 `simulationStore.setParams({ [mappedField]: newValue, resetTrigger: Date.now() })` 并启动仿真

### 输出 4：参数填充事件（点击联动）

```typescript
interface BifurcationClickAction {
  source: "bifurcation-plot";
  scannedParamValue: number;                // 点击位置对应的扫描参数值
  paramName: string;                        // 扫描参数名（映射到 Zustand 字段名）
  paramField: string;                       // Zustand 字段名（经映射表转换），如 "theta1_0"
  fixedParams: SimulationParamsForBifurcation;  // 固定参数快照
  timestamp: number;                        // Date.now()
}
```

- 联动流程：点击散点密集区域 → 弹出 Dialog："将 θ₁ 设为 1.571 rad 并启动仿真？"（含固定参数预览表格）→ 确认 → `simulationStore.setParams({ [paramField]: scannedParamValue, ...fixedParams, resetTrigger: Date.now() })` + `simulationStore.setRunning(true)`

---

## 核心逻辑步骤

### Step 1: 组件挂载 → 加载预计算数据

| 项目 | 内容 |
|------|------|
| 操作对象 | 预计算 JSON 文件 `dist/assets/bifurcation-[gridHash].json` |
| 具体操作 | 1. 从 props `dataPath` 获取文件路径；2. 检查 IndexedDB，键 = `bifurcation-{gridHash}`（gridHash 从路径中提取或由 props 传入）；3. 缓存命中且 `metadata.solverVersion === EXPECTED_VERSION` → 直接使用缓存数据；4. 缓存未命中 → `fetch(dataPath)` → 校验 metadata 结构 → 写入 IndexedDB；5. 设置 `bifurcationData` state |
| 输入来源 | `props.dataPath: string`（如 `"/assets/bifurcation-a1b3f2e8.json"`） |
| 输出去向 | 组件 state `bifurcationData: BifurcationData \| null`；IndexedDB `precompute` store |
| 失败行为 | 见 [异常场景 1](#异常1) |

```typescript
interface BifurcationPlotProps {
  dataPath: string;                      // JSON 文件路径
  width?: number;                        // Canvas 容器宽度，默认使用父容器 100%
  height?: number;                       // Canvas 容器高度，默认 400
  pointRadius?: number;                  // 散点半径 px，默认 1.8
}
```

### Step 2: 构建 D3 比例尺与渲染散点

| 项目 | 内容 |
|------|------|
| 操作对象 | `HTMLCanvasElement` 2D Context |
| 具体操作 | 1. 分配离屏 `OffscreenCanvas`（尺寸 = 可见 Canvas × dpr）；2. 创建 D3 比例尺：`xScale = d3.scaleLinear().domain([scannedParam.min, scannedParam.max]).range([marginLeft, canvasW - marginRight])`，`yScale = d3.scaleLinear().domain([sampledVariable.min, sampledVariable.max]).range([canvasH - marginBottom, marginTop])`；3. 遍历 `samples`，对于 `samples[i]` 中的每个值 `v`：计算像素坐标 `px = xScale(paramValue_i)`，`py = yScale(v)`，绘制 `arc(px, py, pointRadius, 0, 2π)` + `fill`；4. 根据 `samples[i].length` 判定颜色（≤2→蓝，3-8→紫，>8→红），设置 `ctx.fillStyle`；5. 将离屏 Canvas `drawImage` 到可见 Canvas；6. 绘制坐标轴（`d3.axisBottom(xScale)` / `d3.axisLeft(yScale)` 在可见 Canvas 上）；7. 绘制网格线 |
| 输入来源 | `bifurcationData.samples`；`bifurcationData.metadata.scannedParam`；`bifurcationData.metadata.sampledVariable` |
| 输出去向 | 可见 Canvas DOM |
| 失败行为 | `bifurcationData` 为 null → Canvas 显示 shadcn/ui Skeleton |

**散点颜色判定精确规则**：
```
samples[i].length = 0  → 不绘制任何点（数据缺失）
samples[i].length = 1  → #1a5fb4（深蓝，周期-1）
samples[i].length = 2  → #1a5fb4（深蓝，周期-2，同一色但两个离散点形成可见分岔）
samples[i].length ∈ [3, 4] → #865ea8（紫，周期-4 或弱混沌过渡）
samples[i].length ∈ [5, 8] → #c06140（橙，倍周期级联区）
samples[i].length > 8   → #e01b24（深红，强混沌连续带）
```

### Step 3: 鼠标悬停 → HUD

| 项目 | 内容 |
|------|------|
| 操作对象 | Canvas + shadcn/ui Tooltip |
| 具体操作 | 1. 监听 Canvas `mousemove`（16ms 节流）；2. 从鼠标像素 X 坐标通过 `xScale.invert(px)` 获取参数值；3. 找到最近扫描步索引 `i = round((paramValue - scannedParam.min) / (scannedParam.max - scannedParam.min) * (steps - 1))`，clamp 至 `[0, steps-1]`；4. 读取 `samples[i]`；5. 判定混沌状态（基于 `samples[i].length` 判定 regime）；6. 更新 HUD state；7. 悬停行附近（像素 Y 接近 `samples[i]` 中某值时）高亮该点的像素坐标（放大点至半径 4px + 白色描边） |
| 输入来源 | 鼠标像素坐标；`bifurcationData`；`xScale`；`yScale` |
| 输出去向 | shadcn/ui Tooltip |
| 失败行为 | Canvas 未 ready → 不响应悬停 |

### Step 4: 竖直游标拖拽 → 参数联动

| 项目 | 内容 |
|------|------|
| 操作对象 | Zustand `simulationStore` |
| 具体操作 | 1. 从 `simulationStore.params` 中提取当前对应 `scannedParam.name` 的字段值（使用参数名映射表）；2. 计算游标 X 像素坐标 `cursorX = xScale(currentParamValue)`；3. 如果 `currentParamValue` 超出扫描范围 → 游标 `visible = false`；4. 在 Canvas 上渲染垂直虚线 + 顶部标签；5. 监听 `mousedown` 在游标命中区域（±8px）→ 进入拖拽模式；6. 拖拽中：`newParamValue = xScale.invert(mouseX)`，clamp 至扫描范围，更新游标 X 坐标 + 顶部标签实时刷新；7. `mouseup`：调用 `simulationStore.setParams({ [mappedField]: newParamValue, resetTrigger: Date.now() })` + `simulationStore.setRunning(true)`；8. 拖拽防抖：仅在 `mouseup` 时写入 store（不在 `mousemove` 中写） |
| 输入来源 | `simulationStore.params`；鼠标事件；参数名映射表 |
| 输出去向 | Canvas 游标渲染；`simulationStore` |
| 失败行为 | 参数名无法映射 → 游标 `visible = false` + console.warn |

### Step 5: 点击散点区域 → 参数填充

| 项目 | 内容 |
|------|------|
| 操作对象 | Zustand `simulationStore` |
| 具体操作 | 1. 监听 Canvas `click` 事件；2. 通过 `xScale.invert(mouseX)` 获取对应的参数值；3. 判定是否为有效点击（像素 Y 坐标靠近 `samples[i]` 中任意值的 Y 像素坐标 ±12px → 视为"点击了散点区域"；远离散点 → 忽略）；4. 弹出 shadcn/ui Dialog：标题"以此参数启动仿真"，内容 (a) 参数名 + 值，(b) 混沌判定标签，(c) 固定参数表格，(d) prompt "将覆盖当前参数并重新启动仿真"；5. 确认 → `simulationStore.setParams({ [mappedField]: paramValue, ...fixedParams, resetTrigger })` + `setRunning(true)` |
| 输入来源 | Canvas click 事件；`bifurcationData`；`simulationStore.getState().params` |
| 输出去向 | Zustand `simulationStore` |
| 失败行为 | 无效区域点击 → 静默忽略 |

### Step 6: d3-zoom 框选放大

| 项目 | 内容 |
|------|------|
| 操作对象 | Canvas + d3-zoom 变换 |
| 具体操作 | 1. 创建 `d3.zoom().scaleExtent([1, 50]).translateExtent([[0,0], [canvasW, canvasH]]).on('zoom', handleZoom)`；2. `handleZoom`：从 `d3.event.transform` 获取 `{x, y, k}`；3. 重新计算 `xScale` 和 `yScale` 的 domain：`xScale.domain([xScale.invert(-transform.x / transform.k), xScale.invert((canvasW - transform.x) / transform.k)])`，同理 yScale；4. 使用 `requestAnimationFrame` 重新渲染散点（仅绘制新 domain 内的点）；5. 支持 Shift+框选（`d3.zoom` 的 `filter` 配置：`wheel` 和 `mousedown` 允许，`dblclick` 重置）；6. 双击 → `canvas.dispatchEvent(new MouseEvent('dblclick'))` → 重置 transform 至 `d3.zoomIdentity` → 恢复初始 domain |
| 输入来源 | 鼠标滚轮 / 拖拽 / 双指缩放；d3-zoom transform |
| 输出去向 | Canvas 重渲染（zoom 后的 domain） |
| 失败行为 | transform 奇异（scale = 0 或 NaN）→ 重置为 identity |

### Step 7: 组件卸载清理

| 项目 | 内容 |
|------|------|
| 操作对象 | Canvas + Zustand 订阅 + d3-zoom |
| 具体操作 | 1. `useEffect` cleanup 中调用 Zustand `unsubscribe()`；2. 注销 Canvas 事件监听器（`mousemove`、`click`、`mousedown`、`mouseup`、`mouseleave`、`dblclick`）；3. 销毁 d3-zoom 实例（`d3.zoom().on('zoom', null)`）；4. 清理 `OffscreenCanvas`（设为 null 让 GC 回收） |

---

## 依赖与集成接口

### 外部模块依赖

| 依赖模块 | 调用接口 | 调用时机 | 数据方向 |
|------|------|------|------|
| SIM-02 参数控制面板 | `simulationStore.setParams(partial)` | 用户拖拽游标释放 / 点击散点确认后 | ANL-02 → SIM-02 |
| SIM-01 双摆物理引擎 | `simulationStore.setRunning(true)` | 同 setParams 一起调用 | ANL-02 → SIM-01 |
| SYS-03 预计算数据管线 | `fetch(props.dataPath)` | 组件挂载时 | SYS-03 → ANL-02 |
| SYS-02 运行时异常处理 | `useToast()` (shadcn/ui) | 数据加载失败 / 参数填充失败 | ANL-02 → SYS-02 |
| INF-01 可观测性 | `performance.mark('bifurcation-render')` | 渲染前后 | ANL-02 → INF-01 |

### IndexedDB 接口

```typescript
// 与 ANL-01 共用 precomputeCache.ts（泛型化后）
// 数据库名：chaos-pendulum
// Object Store：precompute
// 键：`bifurcation-{gridHash}`

async function getPrecomputeData<T extends PrecomputeDataType>(
  type: string,       // 如 "bifurcation"
  gridHash: string    // 如 "a1b3f2e8"
): Promise<T | null>;

async function setPrecomputeData<T extends PrecomputeDataType>(
  type: string,
  gridHash: string,
  data: T              // BifurcationData
): Promise<void>;
```

### Zustand Store 接口

```typescript
// 与 ANL-01 共享 simulationStore（src/stores/simulationStore.ts），完全复用
interface SimulationStore {
  params: {
    m1: number; m2: number; L1: number; L2: number;
    theta1_0: number; theta2_0: number;
    omega1_0: number; omega2_0: number;
    g: number; damping: number;
  };
  setParams: (partial: Partial<SimulationStore['params']> & { resetTrigger?: number }) => void;
  setRunning: (running: boolean) => void;
  resetTrigger: number;
}
```

### 参数名映射表（与 ANL-01 共享）

| 预计算参数名 | Zustand 字段名 | 转换逻辑 | 适用模块 |
|------|------|------|------|
| `"L₂/L₁"` | `L2` | `L2 = value * L1`，`L1` 取自 `fixedParams.L1` | ANL-01, ANL-02 |
| `"L₂"` | `L2` | 直接赋值 | ANL-02 |
| `"θ₁"` | `theta1_0` | 直接赋值 | ANL-01, ANL-02 |
| `"θ₂"` | `theta2_0` | 直接赋值 | ANL-02 |
| `"m₂/m₁"` | `m2` | `m2 = value * m1`，`m1` 取自 `fixedParams.m1` | ANL-01, ANL-02 |
| `"m₂"` | `m2` | 直接赋值 | ANL-02 |
| `"g"` | `g` | 直接赋值 | ANL-02 |

---

## 状态机

| 当前状态 | 触发事件 | 下一状态 | 前置条件 | 副作用 |
|------|------|------|------|------|
| `idle` | 组件挂载 | `loading` | `props.dataPath` 已提供 | Canvas 显示 Skeleton；设置 `bifurcationData = null` |
| `loading` | fetch 成功 + 校验通过 | `ready` | JSON 结构符合 `BifurcationData` 类型；`metadata.type === "bifurcation"`；`samples.length === steps` | `bifurcationData = parsed`；写入 IndexedDB；执行 Step 2 渲染 |
| `loading` | fetch 失败 / 校验失败 / 超时 | `error` | — | 设置 `errorMessage`；显示重试按钮 + Toast |
| `error` | 用户点击"重试" | `loading` | — | 清除 `errorMessage`；重新 fetch |
| `ready` | 用户拖拽游标 | `ready` | 鼠标在游标命中区域内按下 | 游标标签实时更新；`mouseup` 时写入 store |
| `ready` | 用户点击散点 + Dialog 确认 | `ready` | 点击位置靠近散点（±12px） | `simulationStore.setParams` + `setRunning(true)` |
| `ready` | d3-zoom 事件 | `ready` | — | 重渲染 zoom 后的 domain |
| `ready` | `simulationStore.params` 变化（外部来源） | `ready` | — | 游标 X 坐标更新（防抖 50ms） |
| `ready` | 组件卸载 | — | — | 注销订阅 + 事件监听 + d3-zoom |

---

## 异常与边界条件

### <a id="异常1"></a>异常场景 1：预计算数据加载失败

| 维度 | 内容 |
|------|------|
| **触发条件** | `fetch()` 返回 404 / 网络中断 / JSON 解析失败 / `metadata.type !== "bifurcation"` / `samples.length !== scannedParam.steps` / 超时 > 10s |
| **处理策略** | 1. 记录错误到 Zustand debugStore；2. Toast "分岔图数据加载失败：{简述原因}"，持续 5s；3. Canvas 区域显示错误占位（暗色背景 + 白色文字 "分岔图不可用" + 重试按钮）；4. 不影响其他分析模块（如 ANL-01 热力图） |
| **重试参数** | 次数：3 次；退避：指数 1s → 2s → 4s；超时：每次 10s |
| **恢复路径** | 用户点击重试 → 重置计数 → 重新 fetch |

### 异常场景 2：全部 samples 为空数组

| 维度 | 内容 |
|------|------|
| **触发条件** | 预计算脚本输出中 `samples.every(arr => arr.length === 0)` |
| **处理策略** | 1. Canvas 显示文字 "该参数范围内未检测到有效稳态数据，请更换扫描范围或检查瞬态舍弃时长"；2. 游标正常显示（仍可互动），但无散点可选 |
| **重试参数** | 无（数据问题，非网络问题） |

### 异常场景 3：游标拖拽值与当前仿真参数不一致

| 维度 | 内容 |
|------|------|
| **触发条件** | 用户在 SIM-02 控制面板修改了参数，但 `scannedParam.name` 对应字段的新值超出预计算扫描范围 |
| **处理策略** | 1. 游标 `visible = false`；2. 不弹出提示（用户可能主动选择了栅格外的参数值进行自由探索）；3. 当用户再次将参数调回扫描范围内时，游标自动恢复可见 |
| **重试参数** | 无（非错误状态，设计行为） |

### 异常场景 4：散点过于密集导致悬停性能劣化

| 维度 | 内容 |
|------|------|
| **触发条件** | 混沌区某参数值下 `samples[i].length > 100`（罕见，但可能发生） |
| **处理策略** | 1. 渲染时对该步的散点做随机采样，最多绘制 50 个点（保证覆盖密度感）；2. 悬停 HUD 显示真实的 `samples[i].length`（如"152 点（混沌带）"）；3. 提示 "显示已采样 50/152" |
| **重试参数** | 无 |

### 边界条件清单

| 边界条件 | 处理方式 |
|------|------|
| `scannedParam.max <= scannedParam.min` | 数据加载校验阶段拒绝，Toast "数据格式错误：扫描范围无效" |
| `sampledVariable.min === sampledVariable.max` | Y 轴 domain 自动扩展为 `[value-1, value+1]`，避免零尺度 |
| 框选放大至 1 个采样步 | 最小 X 轴 domain ≥ 5 × stepSize（`(max-min)/steps`），防止过度放大到空白区域 |
| 触屏设备游标拖拽与 d3-zoom 平移冲突 | 游标命中区域（±12px 触屏下扩大至 ±24px）内优先游标拖拽，区域外由 d3-zoom 接管 |
| Canvas 容器尺寸为零 | 同 ANL-01：ResizeObserver 检测 → 跳过渲染 → 尺寸恢复时首渲 |
| `solverVersion` 不匹配 | 同 ANL-01：Toast 提示但仍尝试渲染 |
| IndexedDB 不可用 | 同 ANL-01：跳过缓存，直接 fetch |
| 参数名映射表中无 `scannedParam.name` 对应项 | 游标功能禁用（`visible = false`）；点击填充使用警示 Dialog "无法确定参数映射，请手动设置" |

---

## 原则兑现清单

| 设计原则 | 来源 | 代码级约束 |
|------|------|------|
| 分析深度 | 功能设计_v0 §四 | 悬停显示采样点数量 + 混沌判定标签；颜色自动区分周期/倍周期/混沌；支持框选放大至 5 个采样步宽度以观察周期倍增细节 |
| 双向联动 | 功能设计_v0 §四 4.2 | 分岔图→3D：拖拽游标或点击散点→填充参数→启动仿真；3D→分岔图：订阅 Zustand params 变化→游标 50ms 防抖移动 |
| 科研级交互 | 功能设计_v0 §二 | 悬停显示精确参数值（4 位有效数字）+ 采样状态判定；竖直游标精确可拖拽至扫描范围内的任意参数值；框选放大支持 Shift+框选 |
| 优雅降级 | 功能设计_v0 §九 | 数据加载失败保留错误提示 + 重试；IndexedDB 不可用时不阻塞 |
| 零后端 | 技术栈设计 v1.2 §1.2 | 数据来自本地 JSON 文件 fetch；缓存使用 IndexedDB |

---

## 验收测试场景

### 正向测试 1：加载数据并渲染分岔图

**Given** 预计算 JSON `/assets/bifurcation-a1b3f2e8.json` 存在且合法（500 步，metadata 完整），IndexedDB 为空
**When** 组件挂载，`BifurcationPlot` 接收 `dataPath="/assets/bifurcation-a1b3f2e8.json"`
**Then**
1. Skeleton 显示 < 500ms → 散点图渲染完成
2. Canvas 显示约 3000 个散点（500 步 × 平均 6 点）
3. 左侧区域（小 θ₁）散点呈 1-2 个离散点（蓝色，周期区）；右侧区域（大 θ₁）散点呈连续带（红色，混沌区）
4. 横轴标签 = "θ₁ / rad"，纵轴标签 = "θ₂ 局部极大值 / rad"
5. IndexedDB 记录 `bifurcation-a1b3f2e8` 已写入
6. `performance.measure('bifurcation-render')` 耗时 < 20ms

### 正向测试 2：悬停 HUD + 竖直游标联动

**Given** 分岔图正常渲染，`simulationStore.params.theta1_0 = 1.57`
**When** (a) 鼠标悬停在散点密集区 X≈1.57 处；(b) 观察竖直游标位置
**Then**
1. Tooltip 显示：
   ```
   θ₁ = 1.571 rad
   采样点：8（倍周期）
   θ₂_max = {-0.72, 0.65, -0.48, 0.41, ..., 0.18}
   ```
2. 竖直游标（橙色虚线）定位在 xScale(1.57) 像素处，顶部标签 "当前: 1.57 rad"
3. 游标附近散点中，距离鼠标最近的 1 个点放大至半径 4px + 白色描边

### 正向测试 3：游标拖拽 → 参数填充

**Given** 分岔图正常渲染，`simulationStore.params.theta1_0 = 1.57`
**When** 用户鼠标按下游标线（命中 ±8px）→ 向右拖动至 X≈3.0 → 释放
**Then**
1. 拖拽过程中顶部标签实时更新：`1.57 → 1.80 → 2.10 → ... → 3.01`
2. `mouseup` 时调用 `simulationStore.setParams({ theta1_0: 3.01, resetTrigger: ... })`
3. `simulationStore.setRunning(true)` 被调用
4. 3D 场景以 θ₁=3.01 rad 启动仿真
5. 游标停留在新位置

### 反向测试 1：数据加载失败 → 降级

**Given** JSON 文件 `/assets/bifurcation-badhash.json` 不存在（404）
**When** 组件挂载
**Then**
1. Canvas 区域显示错误占位："分岔图不可用" + 重试按钮
2. Toast "分岔图数据加载失败：HTTP 404"
3. 用户可切换到其他分析模式（如 ANL-01）
4. 点击重试 → 仍 404 → "离线模式" 提示

### 反向测试 2：点击远离散点的空白区域 → 忽略

**Given** 分岔图正常渲染
**When** 用户点击 Canvas 空白区域（像素 Y 处无任何散点，即远离所有 `yScale(sampledValues)` 超过 12px）
**Then**
1. 不弹出 Dialog
2. `simulationStore.params` 不发生变化
3. 控制台无输出（静默忽略）

### 反向测试 3：框选放大至极限 → 阻止过度放大

**Given** 分岔图正常渲染，X 轴扫描步 = 500，每步间隔 = 0.0126 rad
**When** 用户反复框选 / 滚轮放大，使当前 X 轴 domain 宽度 < 5 × 0.0126 = 0.063 rad
**Then**
1. d3-zoom `scaleExtent` 阻止进一步放大
2. 散点仍正常显示
3. 用户仍可缩小组小 → 恢复正常视图
4. 双击 → 重置为初始 domain

---

## 注意事项与禁止行为

### 注意事项

1. **散点颜色判定基于 `samples[i].length`，非 Lyapunov 指数**。ANL-01 的色阶基于 λ 值（连续标量），ANL-02 的颜色基于采样点数（离散分类）。不要混用 ANL-01 的 `d3-scale-chromatic` 连续色阶——ANL-02 使用离散颜色查找。

2. **游标拖拽不应触发 Canvas 平移**。`mousedown` 在游标命中区域内时，必须调用 `d3.event.stopPropagation()` 阻止 d3-zoom 接管该事件。

3. **`xScale.invert()` 性能**：每次 `mousemove` 都调用 `invert` 将像素转为参数值。D3 的 `invert` 是 O(1)，但 16ms 节流防止 60fps 时每帧都算。

4. **散点渲染顺序影响视觉密度**。先绘制周期区点（底层），再绘制混沌区点（顶层）。混沌区散点数量多，如果先绘制会在视觉上遮盖周期区的离散结构。

5. **Canvas DPI 缩放**：同 ANL-01 注意事项 #1，必须处理 `devicePixelRatio`。

6. **参数名映射表的扩展性**：`scannedParam.name` 可能为任意物理参数名。映射表查找失败时，游标功能应静默禁用（`visible = false`），而非崩溃。新参数名需同时更新映射表和预计算脚本。

### 禁止行为

1. **禁止在浏览器中实时积分分岔图**。500 个参数值 × 300s 仿真 = 150,000s 总仿真时长，绝不可在客户端运行。分岔图数据必须来自 SYS-03 离线预计算。

2. **禁止使用 SVG `<circle>` 渲染散点**。3000+ 个 DOM 节点导致悬停检测和重排性能灾难。

3. **禁止游标拖拽时每帧写入 Zustand store**。拖拽中间状态仅更新本地 React state（游标 X 坐标），仅在 `mouseup` 时一次性写入 store。否则会导致 60fps 的 store 更新风暴。

4. **禁止点击空白区域弹出 Dialog**。必须通过像素 Y 坐标判断是否靠近实际散点（±12px），远离散点的点击应静默忽略。

5. **禁止在框选放大时使用过渡动画**。d3-zoom 的 transform 应即时渲染（无 `transition().duration()`），否则在密集散点场景下动画卡顿。

6. **禁止将 `scannedParam.name` 硬编码为 `"θ₁"`**。参数名来自预计算数据 metadata，组件应完全由数据驱动，不应假设扫描的是哪一个物理参数。

---

*本文档由 AI 辅助生成，需经技术负责人评审后生效。*
