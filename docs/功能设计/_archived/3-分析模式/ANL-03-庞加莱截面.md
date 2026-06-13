# 功能规格：ANL-03 庞加莱截面

> **文档生成时间**：`2026-04-28 20:19:04 CST`  
> **源设计文档**：功能设计_v0.md §四 4.3、功能模块全拆解.md ANL-03、双摆混沌实验室-技术栈设计.md v1.2 §4.5  
> **版本记录**：
> | 版本 | 时间 | 修改人 | 变更摘要 |
> |------|------|--------|----------|
> | v1.0 | 2026-04-28 20:19:04 | AI Assistant | 初始版本，基于功能设计_v0 §四 4.3 + 技术栈设计 v1.2 §4.5 |

> **冲突核查指引**：若发现与已有规格文档冲突，优先以时间戳更新的版本为准，并在版本记录中追加冲突解决条目。

---

## 所属模块与溯源

| 维度 | 内容 |
|------|------|
| 模块编号 | ANL-03 |
| 模块名称 | 庞加莱截面（Poincaré Section） |
| 所属模式 | 分析模式（Analyze） |
| 设计文档溯源 | 功能设计_v0.md §四 4.3；功能模块全拆解.md ANL-03行；技术栈设计.md §4.5、§3.3 |
| 依赖模块 | SIM-01（双摆物理引擎 / Worker RK45 积分）— 提供实时状态向量用于穿越检测；SIM-02（参数控制面板）— 截面条件变化需通知 Worker |
| 被依赖模块 | 无（ANL-03 为终端可视化模块，仅消费数据，不被其他模块依赖） |

---

## 已有设计兼容性分析

已审查以下规格文档：

| 文档 | 审查日期 | 共享接口 | 冲突？ |
|------|------|------|:---:|
| ANL-01-李雅普诺夫指数谱.md (v1.0) | 2026-04-28 | `simulationStore`（只读） | ✅ 无冲突 |
| ANL-02-参数空间分岔图.md (v1.0) | 2026-04-28 | `simulationStore`（只读）；D3 Canvas 散点渲染模式 | ✅ 无冲突 |

**一致性保障**：

| 共享项 | ANL-01/ANL-02 使用方式 | ANL-03 处理方式 |
|------|------|------|
| `simulationStore` 接口 | 读写（点击填充参数时写入 `setParams`） | **只读**（订阅 `params` 仅用于截面条件匹配，不写入） |
| D3 Canvas 散点渲染 | ANL-02 全量重渲染（transform 变化时） | **增量追加**（新点到达时仅绘制新点 + 旧点 alpha 衰减），不使用 `d3-zoom` |
| 预计算数据 | ANL-01/ANL-02 从 JSON fetch | ANL-03 **不使用预计算数据**，数据来自 Worker 实时流 |
| IndexedDB | ANL-01/ANL-02 缓存预计算结果 | ANL-03 **不使用 IndexedDB**，仅内存存储 |
| `analysisStore` | ANL-01 写入 `activeLayer`、`hoverTooltip` | ANL-03 使用独立的 `PoincareState`（在 `analysisStore` 中新增 slice），不触碰 ANL-01 专用字段 |
| 参数名映射表 | ANL-01/02 共享 | ANL-03 不直接使用（截面条件是状态变量，不涉及参数映射） |

**新增接口**（`analysisStore` 扩展）：

```typescript
// 在 src/stores/analysisStore.ts 中追加 ANL-03 专用 slice
// 与已有的 ANL-01 activeLayer/hoverTooltip 并列，无字段冲突

interface PoincareSlice {
  poincareSection: {
    condition: PoincareSectionCondition;   // 当前截面条件
    points: PoincarePoint[];               // 当前轨线的截面点列表
    baseline: PoincarePoint[] | null;      // 历史基准轨线快照
    isActive: boolean;                     // 是否正在采集（跟随仿真运行状态）
    pointCount: number;                    // 当前轨线点数（派生值 points.length，冗余用于快速显示）
    setCondition: (cond: PoincareSectionCondition) => void;
    addPoints: (pts: PoincarePoint[]) => void;
    clearPoints: () => void;
    saveBaseline: () => void;             // 将当前 points 快照为 baseline
    clearBaseline: () => void;
    reset: () => void;
  };
}
```

> 无冲突。ANL-03 的 `simulationStore` 使用方式（只读）和 `analysisStore` 扩展（独立 slice）均不与 ANL-01/ANL-02 冲突。

---

## 技术栈绑定

| 维度 | 必须使用 | 版本 | 禁止使用 |
|------|----------|------|----------|
| UI 框架 | React + TypeScript | 18.x / 5.x | 类组件 |
| 状态管理 | Zustand（`analysisStore` 新增 `PoincareSlice`；`simulationStore` 只读订阅） | 4.x | React Context 传递截面点数据 |
| 2D 渲染 | D3.js（d3-scale、d3-selection；不使用 d3-zoom） | 7.x | ECharts / Chart.js |
| Canvas 操作 | 直接操作 Canvas 2D Context | 原生 | SVG（点数量无上限，SVG DOM 会持续膨胀） |
| 穿越检测 | 仿真 Worker 内置（与 RK45 同进程，避免跨 Worker 拷贝状态向量） | — | 独立 Poincaré Worker（增加状态向量序列化开销） |
| Worker 通信 | 原生 `postMessage` + 消息类型扩展 | — | Comlink |
| UI 组件 | shadcn/ui（Select、Button、Badge、Tooltip） | latest | 自建组件 |
| 样式 | Tailwind CSS | 3.x | CSS Modules |
| 文件组织 | 组件目录 `src/components/analysis/PoincareSection/` | — | 将逻辑散布在页面组件中 |
| 数据存储 | 内存 `PoincarePoint[]`（无持久化） | — | IndexedDB / localStorage（实时流数据，持久化无意义） |

---

## 输入定义（精确类型）

### 输入 1：Worker 实时截面点流

```typescript
// 来源：仿真 Web Worker（src/workers/ode-worker.ts）的 postMessage 响应
// 原 Worker 消息协议扩展：
//   主线程 → Worker: { cmd: 'step', buf: Float64Array, poincare?: PoincareSectionCondition }
//   Worker → 主线程: { cmd: 'done', buf: Float64Array, poincarePoints?: PoincarePoint[] }
//
// 当 poincare 配置非空时，Worker 在本次积分批次内执行穿越检测，
// 将检测到的截面点随轨迹缓冲一同返回

interface PoincarePoint {
  theta2: number;              // 穿越时刻的上摆角 θ₂，单位 rad，范围 [-π, π]
  omega2: number;              // 穿越时刻的上摆角速度 θ̇₂，单位 rad/s
  time: number;                // 穿越发生的仿真时间，单位 s，单调递增
  batchIndex: number;          // 所属积分批次编号（从 0 开始递增，每次 Worker step 调用的序号）
}

// 单次 Worker 响应示例：
// {
//   cmd: 'done',
//   buf: Float64Array(4000),           // 轨迹缓冲（不变）
//   poincarePoints: [                  // 本批次检测到的所有穿越点（可能为空数组）
//     { theta2: 1.205, omega2: -3.842, time: 45.031, batchIndex: 224 },
//     { theta2: 1.218, omega2: -3.791, time: 46.527, batchIndex: 231 }
//   ]
// }
```

### 输入 2：截面条件配置

```typescript
// 用户通过 UI 控件设置截面条件，写入 analysisStore.poincareSection.condition
// 同时通过 useEffect 将条件转发给仿真 Worker

interface PoincareSectionCondition {
  // 穿越检测的目标变量
  variable: "theta1" | "theta2" | "omega1" | "omega2";

  // 目标值（截面位置）
  // 含义：当 variable 的值穿越此 targetValue 时触发
  // 示例：0 表示 θ₁ = 0（上摆经过最低点）
  targetValue: number;

  // 穿越方向
  // "positive": 变量值从 < targetValue 变为 > targetValue（正穿越）
  // "negative": 变量值从 > targetValue 变为 < targetValue（负穿越）
  // "both": 双向穿越均检测
  direction: "positive" | "negative" | "both";
}

// 预设条件（通过 shadcn/ui Select 快速选择）
const PRESET_CONDITIONS: Record<string, PoincareSectionCondition> = {
  "θ₁ = 0, θ̇₁ > 0": {
    variable: "theta1",
    targetValue: 0,
    direction: "positive",
  },
  "θ₁ = 0, θ̇₁ < 0": {
    variable: "theta1",
    targetValue: 0,
    direction: "negative",
  },
  "θ₂ = π/2": {
    variable: "theta2",
    targetValue: Math.PI / 2,
    direction: "both",
  },
  "θ₂ = -π/2": {
    variable: "theta2",
    targetValue: -Math.PI / 2,
    direction: "both",
  },
};
```

### 输入 3：仿真运行状态（Zustand 订阅）

```typescript
// 来源：src/stores/simulationStore.ts（只读订阅）
// ANL-03 不修改这些字段

interface SimulationStateForPoincare {
  isRunning: boolean;                  // 仿真是否正在运行
  params: {
    m1: number; m2: number;
    L1: number; L2: number;
    theta1_0: number; theta2_0: number;
    omega1_0: number; omega2_0: number;
    g: number; damping: number;
  };
}
```

### 输入 4：用户交互事件

| 交互类型 | 事件源 | 数据类型 | 触发条件 |
|------|------|------|------|
| 选择预设条件 | shadcn/ui Select `onValueChange` | `string`（预设键名） | 用户点击下拉选择 |
| 自定义条件 | 数字输入框 `onChange` | `{ variable, targetValue, direction }` | 用户手动输入 |
| 悬停散点 | Canvas `mousemove` | `{ x, y }` — Canvas 像素坐标 | 鼠标在 Canvas 区域内移动，每 32ms 节流 |
| 鼠标离开 | Canvas `mouseleave` | `void` | 鼠标移出 |
| 清空截面点 | shadcn/ui Button `onClick` | `void` | 用户点击"清空"按钮 |
| 保存基准 | shadcn/ui Button `onClick` | `void` | 用户点击"保存为基准" |
| 清除基准 | shadcn/ui Button `onClick` | `void` | 用户点击"清除基准" |

---

## 输出定义（精确类型）

### 输出 1：Canvas 2D 散点图（动态生长）

- **渲染目标**：`<canvas>` 元素
- **视觉规格**：
  - 坐标系：X 轴 = θ₂（范围 [-π, π]，单位 rad），Y 轴 = θ̇₂（范围自适应，初始 [-10, 10] rad/s，根据实际数据动态扩展）
  - 当前轨线散点：实心圆，半径 2.5px，颜色 `#00b4d8`（青蓝），alpha 0.8
  - 历史基准散点：实心圆，半径 2.0px，颜色 `#e76f51`（陶红），alpha 0.7
  - 最新穿越点：半径 5px + 外圈白色脉冲光环（`shadowBlur = 8`，`shadowColor = '#ffffff'`），持续 500ms 后缩回 2.5px
  - 点老化效果：点的 alpha 按 `1.0 - 0.6 * (pointIndex / totalPoints)` 计算（最早的点 alpha=0.4，最新点 alpha=1.0），形成"从淡到浓"的时间方向感
  - 坐标轴：横轴标签 "θ₂ / rad"，纵轴标签 "θ̇₂ / rad/s"，刻度 12px sans-serif，轴线 1px `#888`
  - 背景：`#fafafa`
  - 网格线：`#e0e0e0` 虚线，默认 10×8 格

- **增量渲染策略**：
  - 每次 Worker 返回新 Poincaré 点时，不重绘所有点
  - 仅在 Canvas 上 `fillRect` 清除"最新点光环"的旧位置，绘制新光环
  - 新到达的点直接 `arc` + `fill` 追加绘制
  - 每 2 秒执行一次完整的全量重绘（更新所有点的 alpha 老化效果 + 基准点）
  - 这样保证 60fps 主线程响应，同时点老化效果不低于 0.5Hz 更新

### 输出 2：悬停 Tooltip

```typescript
interface PoincareHoverData {
  visible: boolean;
  position: { x: number; y: number };  // 屏幕像素坐标
  theta2: number;                      // θ₂ 值，toFixed(4)，单位 rad
  omega2: number;                      // θ̇₂ 值，toFixed(4)，单位 rad/s
  time: number;                        // 穿越仿真时间，toFixed(2)，单位 s
  source: "current" | "baseline";      // 来自当前轨线还是基准
}
```

- 渲染：shadcn/ui `Tooltip`，偏移 (12px, -12px)
- 查找逻辑：鼠标像素 → `xScale.invert(px)` / `yScale.invert(py)` → 遍历当前可见点找最近的（欧几里得距离最小，阈值 15px，超过阈值不显示）
- 内容格式：
  ```
  θ₂ = 1.2050 rad
  θ̇₂ = -3.8421 rad/s
  t = 45.03 s
  [当前轨线]
  ```

### 输出 3：截面状态指示器

```typescript
interface PoincareStatus {
  isActive: boolean;           // 是否正在采集（跟随 isRunning）
  pointCount: number;          // 当前轨线点数
  baselinePointCount: number;  // 基准点数（0 表示无基准）
  lastPointTime: number | null;// 最后一个穿越点的仿真时间
}
```

- 渲染在 Canvas 右上角：小型状态卡片（Tailwind `text-xs`）
- 格式：`采集: ON · 当前 247 点 · 基准 118 点 · 最近 t=112.34s`
- 当 `isActive === false` 时，第一项显示 `采集: OFF`（灰色），表示仿真暂停

---

## 核心逻辑步骤

### Step 1: 组件挂载 → 初始化截面条件与 Canvas

| 项目 | 内容 |
|------|------|
| 操作对象 | Canvas + Zustand `analysisStore.poincareSection` |
| 具体操作 | 1. 初始化截面条件为默认预设 `"θ₁ = 0, θ̇₁ > 0"`；2. 将条件写入 `analysisStore.poincareSection.condition`；3. 通过 `ResizeObserver` 获取 Canvas 容器尺寸，设置 Canvas 宽高（含 dpr）；4. 创建 D3 比例尺 `xScale`（domain [-π, π]）、`yScale`（domain 初始 [-10, 10]）；5. 注册 `useEffect`：监听 `simulationStore.isRunning` → 同步 `poincareSection.isActive` |
| 输入来源 | `props`（width/height 可选）；`analysisStore.getState()` |
| 输出去向 | Canvas 尺寸设定；D3 scale 初始化；`analysisStore.poincareSection` 初始状态 |
| 失败行为 | Canvas context 为空 → 静默失败 + console.warn |

### Step 2: Worker 截面检测消息扩展

| 项目 | 内容 |
|------|------|
| 操作对象 | 仿真 Web Worker — 消息协议 |
| 具体操作 | 1. 扩展 Worker `onmessage` 处理：当主线程发送 `{ cmd: 'step', buf, poincare?: PoincareSectionCondition }` 时，Worker 在 RK45 积分循环中嵌入穿越检测；2. **穿越检测算法**（在 Worker 内执行）：(a) RK45 每完成一个子步，将状态向量通过 `derivatives.ts` 计算对应的 `variable` 值；(b) 比较当前子步和上一子步的 `variable` 值相对于 `targetValue` 的符号：`signCurr = Math.sign(variable_curr - targetValue)`，`signPrev = Math.sign(variable_prev - targetValue)`；(c) 如果 `signCurr ≠ signPrev` 且 `signCurr ≠ 0`：(d) 检查方向匹配：若 `direction === 'positive'` → 仅当 `signCurr > 0` 时接受；若 `direction === 'negative'` → 仅当 `signCurr < 0` 时接受；`'both'` → 均接受；(e) 在 `[t_substep_prev, t_substep_curr]` 区间使用二分查找（10 次迭代），找到 `|variable - targetValue| < 1e-8` 的精确穿越时刻 `t_cross`；(f) 在 `t_cross` 处用三次 Hermite 插值（利用 RK45 子步的状态值和导数）得到精确的 `(θ₂, θ̇₂)`；3. 将穿越点追加到 `poincarePoints[]`；4. 积分批次结束时，将所有检测到的穿越点随 `{ cmd: 'done', buf, poincarePoints }` 返回主线程 |
| 输入来源 | 主线程 `postMessage` 中的 `poincare` 字段 |
| 输出去向 | Worker → 主线程 `postMessage` 中的 `poincarePoints` 数组 |
| 失败行为 | 二分查找不收敛（10 次迭代后仍未精确到 1e-8）→ 使用最后一次插值结果，不丢弃 |

**Worker 穿越检测伪代码**（在 RK45 积分循环内）：

```typescript
// 在 src/workers/ode-worker.ts 中嵌入以下逻辑
let prevSign: number | null = null;

for (let stepIdx = 0; stepIdx < totalSteps; stepIdx++) {
  const stateBefore = [...currentState];
  rk45Substep(currentState, dt);  // 一个 RK45 子步

  if (poincareConfig) {
    const varCurr = extractVariable(currentState, poincareConfig.variable);
    const signCurr = Math.sign(varCurr - poincareConfig.targetValue);

    if (prevSign !== null && signCurr !== prevSign && signCurr !== 0) {
      const directionMatch =
        poincareConfig.direction === "both" ||
        (poincareConfig.direction === "positive" && signCurr > 0) ||
        (poincareConfig.direction === "negative" && signCurr < 0);

      if (directionMatch) {
        // 二分查找精确穿越时刻
        let tLow = currentTime - dt;
        let tHigh = currentTime;
        for (let iter = 0; iter < 10; iter++) {
          const tMid = (tLow + tHigh) / 2;
          const stateMid = interpolateCubicHermite(stateBefore, statesAfter, tMid);
          const varMid = extractVariable(stateMid, poincareConfig.variable);
          const signMid = Math.sign(varMid - poincareConfig.targetValue);
          if (signMid === prevSign) {
            tLow = tMid;
          } else {
            tHigh = tMid;
          }
        }
        const tCross = (tLow + tHigh) / 2;
        const crossState = interpolateCubicHermite(stateBefore, currentState, tCross);
        poincarePoints.push({
          theta2: crossState[2],  // state = [θ₁, θ̇₁, θ₂, θ̇₂]
          omega2: crossState[3],
          time: tCross,
          batchIndex: currentBatchIndex,
        });
      }
    }
    prevSign = signCurr;
  }
}
```

### Step 3: 主线程接收 → 状态更新 → Canvas 增量渲染

| 项目 | 内容 |
|------|------|
| 操作对象 | Zustand `analysisStore.poincareSection.points` → Canvas |
| 具体操作 | 1. 在 `handleWorkerMessage`（主线程 Worker 消息处理器）中：如果 `data.poincarePoints` 非空，调用 `analysisStore.getState().poincareSection.addPoints(data.poincarePoints)`；2. `addPoints` 实现：(a) 追加点到 `points[]`；(b) 检查 Y 轴范围是否需要扩展：`newYMax = max(existing_max, max(newPoints.map(p => p.omega2)))`，若扩展了 > 10% → 标记 `yScaleDirty = true`；(c) 触发 Canvas 增量渲染；3. Canvas 增量渲染：(a) 仅绘制新增的点（`fillStyle = '#00b4d8', alpha = 0.8`）；(b) 最新点绘制白色脉冲光环（`shadowBlur=8, shadowColor='#ffffff', fillStyle='#ffffff'`）；(c) 清除上一个"最新点"的光环（在上一点位置用背景色 `#fafafa` 覆盖 + 重新用正常样式绘制该点） |
| 输入来源 | Worker `postMessage` → `data.poincarePoints` |
| 输出去向 | Zustand `poincareSection.points`；Canvas 增量绘制 |
| 失败行为 | `addPoints` 被调用时 Worker 已销毁 → 忽略本次数据 |

### Step 4: 每 2 秒全量重绘（点老化 + 基准叠加）

| 项目 | 内容 |
|------|------|
| 操作对象 | Canvas 全量重绘 |
| 具体操作 | 1. `useEffect` 中设置 2s 间隔的 `setInterval`（仅在 `isActive === true` 时运行）；2. 全量重绘：(a) 清空 Canvas（`clearRect`）；(b) 重绘网格线 + 坐标轴；(c) 如果存在基准点 → 先绘制基准点：`fillStyle = 'rgba(231, 111, 81, 0.7)'`，半径 2.0px；(d) 绘制当前轨线点，每个点的 alpha 按 `1.0 - 0.6 * (i / totalPoints)` 计算，先绘制最旧的点（底层），最后绘制最新的点（顶层）；(e) 应用 Y 轴动态扩展（若 `yScaleDirty`）；(f) 绘制最新点脉冲光环（若在最近 500ms 内有新点）；3. `yScaleDirty` 重置为 `false` |
| 输入来源 | `poincareSection.points`；`poincareSection.baseline` |
| 输出去向 | Canvas |
| 失败行为 | Canvas context 为 null → 跳过重绘，下次 interval 重试 |

### Step 5: 截面条件变更 → 通知 Worker + 可选清空

| 项目 | 内容 |
|------|------|
| 操作对象 | `analysisStore.poincareSection.condition` + Worker |
| 具体操作 | 1. 用户选择预设或自定义条件 → `setCondition(newCondition)`；2. 弹出确认 Dialog（若当前已有 > 0 个点）："切换截面条件将清空当前采集的 N 个点，是否继续？" + "保留点并停止采集"按钮（后者仅停止，不清空）；3. 用户确认"清空并切换"：(a) `clearPoints()` 清空当前轨线点；(b) `clearBaseline()` 清空基准；(c) 更新 `condition = newCondition`；(d) 设置 `isActive = true` → Worker 下一次 `step` 消息携带新 `poincare` 配置；4. 用户选择"保留并停止"：(a) `isActive = false`；(b) Worker 发送不带 `poincare` 的 `step` 命令（停止检测）；(c) 保留现有 `points` 不动 |
| 输入来源 | Select / Input 控件事件；`poincareSection.points.length` |
| 输出去向 | Worker 消息中的 `poincare` 字段；`poincareSection` state |
| 失败行为 | 条件非法（如 `variable === 'omega1'` 且 `targetValue` 为 NaN）→ Toast "无效截面条件" + 回退至上一个有效条件 |

### Step 6: 基准保存与对比

| 项目 | 内容 |
|------|------|
| 操作对象 | `poincareSection.baseline` |
| 具体操作 | 1. 用户点击"保存为基准"：(a) `baseline = [...points]`（浅拷贝快照）；(b) `points = []`（清空当前轨线，从零开始），但 `isActive` 保持 `true`（继续采集）；(c) Toast "已保存 247 个点为基准，当前轨线已重置"；(d) 触发全量重绘；2. 用户点击"清除基准"：(a) `baseline = null`；(b) 触发全量重绘；3. 当 `baseline !== null` 时，所有全量重绘先绘制基准点（陶红色），再叠加当前轨线点（青蓝色） |
| 输入来源 | Button click 事件 |
| 输出去向 | `poincareSection.baseline`；`poincareSection.points` |
| 失败行为 | 无（按钮操作无网络依赖，不会失败） |

### Step 7: 组件卸载 → 清理

| 项目 | 内容 |
|------|------|
| 操作对象 | Interval + Zustand subscribe + Canvas |
| 具体操作 | 1. `useEffect` cleanup：(a) `clearInterval(redrawInterval)`；(b) 注销 `simulationStore.subscribe`；(c) 发送不带 `poincare` 字段的 Worker `step` 配置，停止穿越检测；(d) 不调用 `clearPoints()`（保留数据供下次挂载时恢复，由 `analysisStore` 持久化内存状态） |
| 输入来源 | React lifecycle |
| 输出去向 | 清理 side effects |

---

## 依赖与集成接口

### 外部模块依赖

| 依赖模块 | 调用接口 | 调用时机 | 数据方向 |
|------|------|------|------|
| SIM-01 Worker | `worker.postMessage({ cmd: 'step', buf, poincare?: condition })` | 每帧仿真步（主线程 → Worker）；条件变更时 | 主线程 → Worker（条件）；Worker → 主线程（截面点） |
| SIM-01 Worker | Worker `onmessage` 接收 `{ cmd: 'done', poincarePoints?: [...] }` | Worker 完成积分批次后 | Worker → 主线程 |
| `simulationStore` | `useSimulationStore(s => s.isRunning)`（只读） | 同步采集开关状态 | simulationStore → ANL-03 |
| `analysisStore` | `poincareSection.*` slice | Poincaré 状态读写 | ANL-03 ↔ analysisStore |
| SYS-02 运行时异常处理 | `useToast()` (shadcn/ui) | 条件非法 / Worker 崩溃 | ANL-03 → SYS-02 |
| INF-01 可观测性 | `performance.mark('poincare-crossing-detect')` | 穿越检测前后（Worker 内） | ANL-03 → INF-01 |

### Worker 消息协议扩展

```typescript
// 主线程 → Worker 的消息类型（原有 + 扩展）
interface WorkerRequest {
  cmd: "step";
  buf: Float64Array;                             // 初值 + 参数（Transferable）
  poincare?: PoincareSectionCondition | null;    // 新增：非空时启用穿越检测
  batchId: number;                               // 批次 ID（用于结果匹配）
}

// Worker → 主线程的消息类型（原有 + 扩展）
interface WorkerResponse {
  cmd: "done";
  buf: Float64Array;                    // 轨迹缓冲（Transferable）
  poincarePoints?: PoincarePoint[];     // 新增：本批次检测到的截面点
  batchId: number;
}
```

### Zustand Store 接口

```typescript
// simulationStore（只读，已存在，不修改）
interface SimulationStoreForPoincare {
  isRunning: boolean;
  params: { m1, m2, L1, L2, theta1_0, theta2_0, omega1_0, omega2_0, g, damping };
}

// analysisStore 新增 slice（src/stores/analysisStore.ts）
interface PoincareSlice {
  poincareSection: {
    condition: PoincareSectionCondition;
    points: PoincarePoint[];
    baseline: PoincarePoint[] | null;
    isActive: boolean;
    pointCount: number;                  // 派生值：points.length
    setCondition: (cond: PoincareSectionCondition) => void;
    addPoints: (pts: PoincarePoint[]) => void;
    clearPoints: () => void;
    saveBaseline: () => void;
    clearBaseline: () => void;
    reset: () => void;                   // 重置全部状态至初始值
  };
}
```

---

## 状态机

| 当前状态 | 触发事件 | 下一状态 | 前置条件 | 副作用 |
|------|------|------|------|------|
| `idle` | 组件挂载 | `collecting` | Worker 已初始化；默认截面条件已设置 | `isActive = true`；Worker 开始发送穿越检测结果 |
| `collecting` | 仿真暂停（`simulationStore.isRunning → false`） | `paused` | — | `isActive = false`；Worker 继续运行但不检测（未发送 poincare 配置） |
| `paused` | 仿真恢复（`simulationStore.isRunning → true`） | `collecting` | 截面条件有效 | `isActive = true`；恢复发送带 poincare 配置的 step 命令 |
| `collecting` | 用户切换截面条件 + 确认清空 | `collecting`（重置） | Dialog 确认 | `clearPoints()`；`clearBaseline()`；更新 `condition` |
| `collecting` | 用户点击"保存为基准" | `collecting` | `points.length > 0` | `baseline = [...points]`；`points = []`；Toast 提示 |
| `collecting` | 用户点击"清空" | `collecting`（重置） | — | `clearPoints()`；`clearBaseline()` |
| `collecting` / `paused` | 仿真复位（`simulationStore.resetTrigger` 递增） | `collecting`（重置） | — | `clearPoints()`；不改变 `condition` 和 `baseline` |
| `*` | 组件卸载 | — | — | 清除 interval + 订阅；Worker 停止穿越检测 |

---

## 异常与边界条件

### 异常场景 1：Worker 穿越检测结果丢失（消息延迟/丢帧）

| 维度 | 内容 |
|------|------|
| **触发条件** | 高帧率下 Worker `postMessage` 频率 > 主线程处理能力；浏览器 tab 后台导致消息队列堆积 |
| **处理策略** | 1. `batchId` 顺序检测：主线程收到 `batchId=N` 的响应但最后一次处理的是 `batchId=M`（M < N-1），说明丢失了 N-M-1 个批次 → console.warn `"Poincaré: 错过批次 [M+1, N-1]"`；2. 不尝试恢复丢失批次的穿越点（无法回溯）；3. Canvas 上方显示小型 warning badge "可能丢失部分穿越点"（3s 后消失） |
| **重试参数** | 不重试（实时数据，丢失不可回溯） |

### 异常场景 2：截面条件导致长期无穿越

| 维度 | 内容 |
|------|------|
| **触发条件** | 最后 5 秒（约 300 帧）内 `poincarePoints` 持续为空数组；例如 θ₂ = π/2 截面在当前参数下不被轨道穿越 |
| **处理策略** | 1. Canvas 中央显示半透明文字 "当前截面条件未检测到穿越事件"（`pointer-events: none`，不阻挡鼠标交互）；2. 提示持续显示，直到第一次检测到穿越点后消失；3. 不自动修改截面条件 |
| **重试参数** | 无（非错误，设计行为） |

### 异常场景 3：Y 轴范围持续扩展

| 维度 | 内容 |
|------|------|
| **触发条件** | 混沌运动下 θ̇₂ 峰值不断突破历史最大值，导致 Y 轴 domain 频繁变化 |
| **处理策略** | 1. Y 轴扩展每次至少扩展 20%（`newMax > currentMax * 1.2`），避免微小突破导致频繁重设；2. 达到 `abs(omega2) > 50 rad/s` 后固定 Y 轴范围（截断极端离群点）；3. Toast 一次性提示 "θ̇₂ 范围已固定至 ±50 rad/s" |
| **重试参数** | 无 |

### 异常场景 4：仿真 Worker 崩溃重启

| 维度 | 内容 |
|------|------|
| **触发条件** | Worker `onerror` 事件 / Worker 积分 NaN 异常 → SIM-01 自动重建 Worker |
| **处理策略** | 1. `isActive = false`（等待新 Worker 就绪）；2. 保留 `points` 和 `baseline`（不丢失已采集数据）；3. Worker 重建完成后 → `isActive = true` → 发送当前截面条件给新 Worker → 继续采集；4. Canvas 状态指示器显示 "采集: OFF（Worker 重建中...）" |
| **重试参数** | 监听 `simulationStore.isRunning` 恢复事件，自动重连 |

### 边界条件清单

| 边界条件 | 处理方式 |
|------|------|
| 截面点数超过 10,000 | 自动丢弃最旧的 5,000 个点（`points = points.slice(-5000)`），Toast 提示 |
| 基准点数超过 5,000 | 保存基准时自动截断（`baseline = baseline.slice(-5000)`） |
| 用户连续快速切换截面条件 | 防抖 300ms，仅最后一次切换生效 |
| Canvas 尺寸为 0 | 同 ANL-01：ResizeObserver → 跳过渲染 → 恢复时首渲 |
| Worker 返回的 `theta2` 超出 [-π, π] | 自动标准化：`theta2 = atan2(sin(theta2), cos(theta2))` |
| 基准保存时 `points.length === 0` | Toast "无截面点可保存"，不执行保存 |

---

## 原则兑现清单

| 设计原则 | 来源 | 代码级约束 |
|------|------|------|
| 准实时分析 | 功能设计_v0 §四 4.3 | 穿越检测在 Worker 内与 RK45 同步完成，不额外增加积分批次；增量渲染新点 < 1ms，全量重绘 < 10ms |
| 动态生长可视化 | 功能设计_v0 §四 4.3 | 点 alpha 老化效果（旧→淡，新→浓）+ 最新点脉冲光环；2s 间隔全量重绘更新老化 |
| 科研级对比 | 功能设计_v0 §二 | 基准保存/叠加功能，两种颜色区分（青蓝 vs 陶红），Tooltip 标注来源 |
| 可配置截面 | 功能设计_v0 §四 4.3 | 4 个预设 + 自定义 variable/targetValue/direction；条件变更时 Dialog 防误操作 |
| 优雅降级 | 功能设计_v0 §九 | Worker 崩溃保留数据 + 自动重连；无穿越时友好提示而非静默空白 |
| 零后端 | 技术栈设计 v1.2 §1.2 | 纯内存存储，不涉及 IndexedDB / fetch |

---

## 验收测试场景

### 正向测试 1：默认截面条件 → 实时采集截面点

**Given** 仿真以默认参数运行（`θ₁₀=1.57, θ₂₀=0.5`），Worker 已初始化，Poincaré 截面条件 = `"θ₁ = 0, θ̇₁ > 0"`（默认）
**When** 用户导航至分析模式 → 切换到 Poincaré 截面 Tab
**Then**
1. Canvas 显示空散点图（X 轴: θ₂ [-π, π]，Y 轴: θ̇₂ [-10, 10]），坐标轴标签正确
2. 状态指示器显示 "采集: ON · 当前 0 点 · 基准 0 点"
3. 仿真运行 2-3 秒后，Canvas 上开始出现青蓝色散点（每个点对应一次 θ₁=0 正穿越）
4. 最新到达的点带有白色脉冲光环（持续 500ms）
5. 5 秒后点数量 > 5，最早的点 alpha 明显淡于最新的点
6. Tooltip 悬停在最近点：显示 θ₂、θ̇₂、穿越时间、"[当前轨线]"

### 正向测试 2：保存基准 → 对比两条轨线

**Given** 仿真运行中，当前轨线已采集 30+ 个截面点
**When** 用户点击"保存为基准"
**Then**
1. Toast "已保存 32 个点为基准，当前轨线已重置"
2. 基准点以陶红色（`#e76f51`、半径 2.0px）显示在 Canvas 上
3. 当前轨线点数重置为 0，继续采集新点（青蓝色）
4. 状态指示器：`当前 0 点 · 基准 32 点`
5. 新到达的当前轨线点叠加在基准点之上，两色分明

### 正向测试 3：切换截面条件 → Dialog → 清空并切换

**Given** 仿真运行中，当前轨线已采集 15 个点，截面条件 = `"θ₁ = 0, θ̇₁ > 0"`
**When** 用户从 Select 选择 `"θ₂ = π/2"`
**Then**
1. Dialog 弹出："切换截面条件将清空当前采集的 15 个点，是否继续？"（含"清空并切换"/"保留并停止"/"取消"三个按钮）
2. 用户点击"清空并切换"
3. 当前点清空（`points = []`），基准不变（如有）
4. Canvas 中央显示 "当前截面条件未检测到穿越事件"（等待新条件首次穿越）
5. 若数秒后新条件检测到穿越，Canvas 开始显示新点
6. Worker 收到的下一条 `step` 命令已携带 `{ variable: "theta2", targetValue: Math.PI/2, direction: "both" }`

### 反向测试 1：长期无穿越 → 提示

**Given** 仿真参数导致轨道不穿越 `θ₂ = π/2` 截面
**When** 用户切换至该条件后已等待 5 秒
**Then**
1. Canvas 中央显示半透明提示 "当前截面条件未检测到穿越事件"（不阻挡鼠标事件）
2. 状态指示器：`当前 0 点`
3. 用户切换回默认条件 → 提示消失 → 恢复采集
4. 不弹出任何 Toast/Error（非异常，设计行为）

### 反向测试 2：截面点数超限 → 自动截断

**Given** 仿真长时间运行，当前轨线已采集 10,001 个点
**When** 第 10,001 个点到达
**Then**
1. `points` 数组自动截断为最新的 5,000 个点
2. Toast "截面点已超过上限，已截断至最近 5000 点"
3. Canvas 全量重绘反映截断后的点集（旧点不再显示）
4. 基准保持不变
5. 继续正常采集

### 反向测试 3：Worker 崩溃 → 保留数据 + 自动恢复

**Given** 当前轨线已采集 40 个点，基准 25 个点
**When** 仿真 Worker 因 NaN 异常崩溃 → SIM-01 自动重建 Worker
**Then**
1. 状态指示器显示 "采集: OFF（Worker 重建中...）"
2. Canvas 保留现有 40 个点 + 25 个基准点（不清空）
3. Worker 重建完成 → `isActive = true` → 恢复采集
4. 新点续在已有 40 个点之后追加（不丢失）
5. Toast "Poincaré 采集已恢复"

---

## 注意事项与禁止行为

### 注意事项

1. **穿越检测必须与 RK45 积分在同一个 Worker 中执行**。避免在独立 Worker 中重复积分——穿越检测只需在 RK45 子步间插入符号检查和二分查找，额外开销 < 0.5% 的积分耗时。

2. **二分查找的边界情况**：如果 `variable` 恰好等于 `targetValue`（`Math.sign(0) === 0`），该帧不触发穿越（需要严格的符号变化，`signCurr ≠ 0`）。这防止了轨道在截面上"滑动"时产生虚假穿越。

3. **θ₂ 标准化**：Worker 返回的 `theta2` 可能通过周期性边界进入如 3.8 rad 的范围。渲染前必须在主线程标准化：`theta2 = Math.atan2(Math.sin(theta2), Math.cos(theta2))`，确保显示在 [-π, π] 范围内。

4. **增量渲染与全量重绘的协调**：新点到达时执行增量绘制（仅绘制新增点，不清除 Canvas）。全量重绘时先 `clearRect` 再绘制所有点。两者通过 `renderGeneration` 计数器协调：增量绘制前检查计数器，若自上次绘制后触发了全量重绘，则跳过增量绘制（避免覆盖）。

5. **内存警告**：`PoincarePoint` 每个约 32 bytes（三个 number + 一个 int），10,000 个点 ≈ 320KB。截断上限 5,000 点 ≈ 160KB 内存在分析模式下可接受。若未来支持同时打开多个分析视图，需评估累计内存。

### 禁止行为

1. **禁止创建独立的 Poincaré Worker**。穿越检测必须在仿真 Worker 的 RK45 循环内完成，不得在另一个 Worker 中重复运行 ODE 积分。

2. **禁止每收到一个穿越点就触发全量重绘**。必须使用增量绘制 + 2s 定时全量重绘策略。每点全量重绘会导致 Chaos 下高频穿越时 Canvas 重绘成为瓶颈。

3. **禁止在无 Dialog 确认的情况下清空已采集的点**。切换截面条件或点击清空按钮必须弹出确认 Dialog（若 `points.length > 0`），防止误操作丢失长时间采集的数据。

4. **禁止在 Canvas 渲染循环中变异 `points` 数组**。Worker 回调中 `addPoints` 写入 `points` 时，渲染循环可能正在遍历 `points`。使用 `immer`（Zustand 内置）或不可变更新保证不会出现撕裂读。

5. **禁止将 θ₂ 硬编码为 X 轴变量名**。坐标轴标签应来自通用约定（截面点坐标始终是 `(θ₂, θ̇₂)` 对应被截面条件截取的二自由度系统的 Poncaré 截面），但 X/Y 的范围应根据数据动态调整。Y 轴单位 `rad/s` 应明确标注。

6. **禁止与 ANL-01/ANL-02 共享 Canvas 实例**。本模块拥有独立的 `<canvas>` 元素，不与热力图或分岔图共用。

---

*本文档由 AI 辅助生成，需经技术负责人评审后生效。*
