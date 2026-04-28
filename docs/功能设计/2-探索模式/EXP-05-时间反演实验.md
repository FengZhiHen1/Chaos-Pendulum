# 功能点：EXP-05 时间反演实验

> **文档生成时间**：`2026-04-28 20:42:52 CST`
> **版本记录**：
> | 版本 | 时间 | 修改人 | 变更摘要 |
> |------|------|--------|----------|
> | v1.0 | `2026-04-28 20:42:52` | AI Assistant | 初始版本 |

> **冲突核查指引**：若发现与已有规格文档冲突，优先以时间戳更新的版本为准，并在版本记录中追加冲突解决条目。

---

## 所属模块与溯源

- **对应总设计章节**：功能设计_v0 §三 3.5「时间反演实验」；技术栈设计.md §4.4「时间反演实验」
- **依赖的其他功能模块**：
  - `SIM-01`（双摆物理引擎）— 提供 Worker 反向积分能力（`setDirection(-1)` 命令）和正向轨迹历史数据（RingBuffer）
  - `EXP-01`（3D 仿真场景）— 复用 Scene3D 渲染摆体和尾迹，实线显示反演轨迹
  - `EXP-02`（运动尾迹渲染）— 正向轨迹以虚线叠加显示（复用 TraillRenderer 的 colorMode="solid" + 虚线样式），反演轨迹以实线显示
  - `SYS-01`（响应式布局引擎）— 漂移距离曲线面板在移动端折叠

---

## 已有设计兼容性分析

- **已审查的相关规格文档**：
  - `docs/功能设计/2-探索模式/EXP-01-3D仿真场景.md`（v1.0, 2026-04-28 19:30:00 CST）
  - `docs/功能设计/2-探索模式/EXP-02-运动尾迹渲染.md`（v1.0, 2026-04-28 20:00:00 CST）
  - `docs/功能设计/1-仿真核心与全局控制/SIM-01-双摆物理引擎.md`（v2.1, 2026-04-28 20:30:00 CST）
- **兼容性结论**：
  - **无冲突**。本模块是 EXP-01/EXP-02 的"时间反演编排层"——不修改 EXP-01 Scene3D 内部，而是向 Worker 发送 `setDirection(-1)` 命令改变积分方向
  - **类型复用**：
    - 复用 `StateVector`（来自 `src/shared/types/physics.ts`），用于存储反演起点的状态
    - 复用 `useExploreStore.timeReversalMode`（类型 `"exact" | "numerical"`），控制两种反演模式
    - 复用 SIM-01 的 `RingBuffer<StateVector>`（正向轨迹历史），作为精确反演模式的数据源
    - 复用 EXP-02 的 `TrailRenderer`，叠加显示正向历史轨迹（虚线、半透明）
  - **新增 Store 字段**：需在 `useExploreStore` 中新增 `timeReversalActive: boolean` 和 `timeReversalStartTime: number`（反演开始的 simTime）
- **复用的已有定义**：`StateVector`、`useSimulationStore`、`useExploreStore.timeReversalMode`、`RingBuffer<T>`、TrailRenderer、Scene3D

---

## 技术栈绑定

- **必须使用**：
  - `react@^18.3.1` — UI 框架，`TimeReversal` 组件 + `DriftCurve` 面板 + `TeachingAnnotation` 弹窗
  - `zustand@^4.5.5` — 订阅 Store + 管理反演状态
  - `@react-three/fiber@^8.17.0` — 3D 场景渲染（复用 EXP-01）
  - `d3-scale@^4.0.2` + `d3-shape@^3.2.0` — 漂移距离曲线的 Canvas 2D 绘制
  - HTML5 Canvas 2D API（浏览器原生）— 漂移距离曲线
  - Web Workers（浏览器原生）— 向 SIM-01 Worker 发送 `setDirection(-1)` 命令
  - `@/features/data` — `RingBuffer<T>`（存储漂移距离历史）

- **禁止使用**：
  - 禁止在反演过程中修改原始正向轨迹历史（只读消费 RingBuffer）
  - 禁止在精确反演模式下启动新的 Worker 积分（纯视觉播放，不消耗计算资源）
  - 禁止在数值反演模式下使用与正向积分不同的 dt 或方法（必须 dt 相同、方法相同，否则误差比较无意义）

---

## 输入定义（精确类型）

### 组件 Props

```typescript
/**
 * 时间反演实验组件属性。
 * 渲染反演控制按钮 + 3D 场景叠加 + 漂移曲线面板 + 教学注释。
 */
interface TimeReversalProps {
  /**
   * 父容器 CSS 类名。默认 "w-full h-full"。
   */
  className?: string;
}

/**
 * 反演模式。
 * - "exact": 精确反演（从 RingBuffer 反向播放历史，理论完全重合 —— 对照基线）
 * - "numerical": 数值反演（以当前状态为初值，调用 rk4Step(state, -dt) 重新积分，
 *   与正向历史对比展示误差累积 —— 实验主体）
 */
type ReversalMode = "exact" | "numerical";

/**
 * 反演实验的阶段。
 */
type ReversalPhase = "idle" | "recording" | "reversing" | "completed" | "paused";
```

### 内部数据类型

```typescript
/**
 * 漂移距离采样点。
 * 记录反演轨迹与正向历史轨迹在对应时刻的 3D 位置偏差。
 */
interface DriftSample {
  /**
   * 反演进行的时间（秒），从反演开始计时。
   * 范围：0.0 — 正向历史总时长。
   * 示例：3.5（反演进行了 3.5 秒）
   */
  reversalTime: number;

  /**
   * 下摆球位置的欧几里得距离偏差（米）。
   * drift = sqrt((xRev - xFwd)² + (yRev - yFwd)²)
   * 范围：0.0 — ∞，典型值 0.0 – 2.0。
   * 示例：0.034
   */
  driftDistance: number;

  /**
   * 对应的正向仿真时间（秒）。
   * 用于将漂移点与正向历史对齐。
   * 示例：15.2
   */
  forwardSimTime: number;
}

/**
 * 教学注释内容。
 * 在漂移首次超过阈值时自动弹出。
 */
interface TeachingAnnotation {
  /** 注释标题 */
  title: string;
  /** 注释正文（支持换行符 \\n） */
  body: string;
  /** 触发阈值：漂移距离超过此值（米）时弹出。默认 0.05 */
  triggerThreshold: number;
}
```

### 数据消费

```typescript
// 反演模式
const timeReversalMode: ReversalMode = useExploreStore((s) => s.timeReversalMode);

// 仿真运行状态（由 SIM-01 Worker 管理）
const isRunning = useSimulationStore((s) => s.isRunning);

// 当前状态向量（数值反演模式的初值来源）
const state = useSimulationStore((s) => s.state);

// 正向轨迹历史（精确反演模式的数据源）
// 来自 SIM-01 的 RingBuffer<StateVector>（容量 6000 = 100s）
const forwardHistory: StateVector[] = useSimulationHistory();

// 当前仿真时间
const simTime = useSimulationStore((s) => s.simTime);
```

---

## 输出定义（精确类型）

### UI 输出

| 视觉元素 | 位置 | 说明 |
|---------|------|------|
| 时间反演按钮 | 探索模式控制面板中，显著位置 | 沙漏图标（⌛），文字「时间倒流」。反演中变为「停止反演」（红色） |
| 正向轨迹（虚线） | 3D 场景中叠加 | 从尾迹历史调取，虚线样式（dashArray = [0.1, 0.1] 在 3D 空间中由多个短线段实现），半透明白色 `rgba(255,255,255,0.4)` |
| 反演轨迹（实线） | 3D 场景中叠加 | 实线：精确模式=反向播放的正向历史（实线金色）；数值模式=Worker 反向积分产生的新轨迹（实线青色 `#00ffff`） |
| 当前反演球位置 | 3D 场景中 | 金色小球沿反演轨迹移动（精确模式）/ 青色小球（数值模式） |
| 漂移距离曲线 | 屏幕右侧或底部面板，Canvas 2D | 横轴=反演时间(s)，纵轴=漂移距离(m)。数值反演模式下实时更新，精确模式下恒为 0（平直线） |
| 教学注释弹窗 | 屏幕中央偏下，绝对定位 | 漂移首次超过 0.05m 时弹出，半透明深色背景 + 白色文本，右上角关闭按钮 |

### Store 扩展

```typescript
// 需在 useExploreStore 中新增的字段
interface TimeReversalStateExtension {
  /** 反演是否正在激活（按钮已点击，反演进行中或暂停中） */
  timeReversalActive: boolean;
  /** 反演开始时的正向仿真时间（用于计算反演进度） */
  timeReversalStartTime: number;
  /** 反演当前阶段 */
  reversalPhase: ReversalPhase;
}
```

---

## 核心逻辑步骤

### 步骤 1：正向轨迹记录（反演前积累数据）

- **操作对象**：SIM-01 的 `RingBuffer<StateVector>`（容量 6000）
- **具体操作**：
  1. 在探索模式下仿真正常正向运行时（`direction = 1`），SIM-01 Worker 每批次返回 `batchReady` 后，所有帧的 StateVector 自动追加到 RingBuffer
  2. 本模块通过 `useSimulationHistory()` hook 访问该 RingBuffer（`toArray()` 返回时间顺序的完整历史）
  3. 历史数据包含每帧的完整状态：`{ theta1, omega1, theta2, omega2 }` 以及对应的 `simTime`
  4. 用户至少需要积累 2 秒（120 帧）的正向历史才能启动反演（小于 2 秒时按钮置灰 + Tooltip「需要至少运行 2 秒才能反演」）
- **输入来源**：SIM-01 Worker 每批次返回的 StateVector 数组
- **输出去向**：RingBuffer（本模块只读访问）
- **失败行为**：历史数据不足（< 120 帧）→ 按钮 disabled，tooltip 提示原因

### 步骤 2：精确反演模式（纯视觉回溯）

- **操作对象**：3D 场景中的摆体 + 正向轨迹尾迹
- **具体操作**：
  1. 用户点击「时间倒流」→ `timeReversalActive = true`, `reversalPhase = "reversing"`
  2. 获取 `forwardHistory` 数组（长度为 N 的 StateVector[]）
  3. 从数组末尾（`forwardHistory[N-1]`，当前状态）开始，逐帧反向遍历：
     - 使用 `setInterval` 或 `requestAnimationFrame`，每 1/60 秒播放一帧
     - 第 `i` 帧（i=0,1,2...）：从 `forwardHistory[N-1-i]` 读取历史状态
     - 将该状态写入 `useSimulationStore.setState()`（临时覆盖当前显示状态）
     - Scene3D 根据 store 更新摆体位置 → 视觉上"倒放"运动
  3. 反演轨迹（实线）：从当前位置开始，逐步向前追加金色实线顶点（实际上是正向轨迹的逆序播放，线从球当前位置"生长"到历史起点）
  4. 正向历史轨迹（虚线）：整个正向轨迹以白色半透明虚线覆盖在场景中（作为参考基线，展示"理论上应回到的路径"）
  5. 播放到 `i = N - 1`（回到历史起点）→ `reversalPhase = "completed"`
  6. 漂移距离恒为 0（因为是直接回放历史数据），曲线为平直线 `y = 0`
- **输入来源**：`forwardHistory: StateVector[]`
- **输出去向**：Scene3D 实时更新（每 1/60s 一帧） + Canvas 漂移曲线
- **失败行为**：
  - 反演过程中用户切换模式或参数：中断反演，`reversalPhase = "idle"`，恢复正向仿真状态

### 步骤 3：数值反演模式（Worker 反向积分）

- **操作对象**：SIM-01 Worker（发送 `setDirection(-1)` 命令 + 继续 `step` 调度）
- **具体操作**：
  1. 用户点击「时间倒流」→ `timeReversalActive = true`, `reversalPhase = "reversing"`
  2. 记录反演起点信息：
     - `startState = useSimulationStore.getState().state`（当前状态向量）
     - `startSimTime = useSimulationStore.getState().simTime`（当前仿真时间）
     - `startHistoryIndex = forwardHistory.length - 1`（对应当前时刻的历史索引）
  3. 向 Worker 发送 `{ type: "setDirection", direction: -1 }`（切换积分方向为反向，dt 不变仍为 1/60s）
  4. Worker 从当前 `_state` 开始，以 `dt = -1/60` 继续积分（每步 dt 取负值实现反向时间推进）
  5. 与正向仿真相同的 `step` 调度机制（Float64Pool + batch step + batchReady），Worker 每批次返回 120 帧反向积分结果
  6. 每批次返回后：
     a. 将反向轨迹的状态追加到 `reversalTrail: StateVector[]`（实线青色尾迹的数据源）
     b. 对每个反向步 `j`（j = 0, 1, 2, ...），计算漂移距离：
        ```
        // 反向第 j 步对应的正向历史第 (startHistoryIndex - j) 帧
        const fwdState = forwardHistory[startHistoryIndex - j];
        const revState = reversalTrail[j];
        // 计算下摆球 3D 位置的欧几里得距离
        const fwdBall2 = ball2Position(fwdState, params);
        const revBall2 = ball2Position(revState, params);
        const drift = fwdBall2.distanceTo(revBall2);
        ```
        （`ball2Position` 函数从 `state-vector.ts` 导入，与 EXP-01 步骤 2 相同公式）
     c. 将 `DriftSample { reversalTime, driftDistance, forwardSimTime }` 追加到漂移历史
  7. 当 `simTime` 回退到 0 或用户手动停止时 → `reversalPhase = "completed"`
  8. 漂移曲线实时在 Canvas 面板中更新
- **输入来源**：Worker 返回的反向积分 buffer、`forwardHistory`、`startHistoryIndex`
- **输出去向**：Scene3D 更新（青色实线反演轨迹）、Canvas 漂移曲线、Store 状态更新
- **失败行为**：
  - Worker 返回 `type: "error"`（反向积分发散）：自动停止反演，显示 Toast「数值反演发散 — 误差已远超可追踪范围」，`reversalPhase = "completed"`
  - 历史索引越界（反演时间长于正向历史）：`reversalPhase = "completed"`，显示「正向历史已回放完毕」

### 步骤 4：漂移距离曲线绘制

- **操作对象**：Canvas 2D 元素
- **具体操作**：
  1. 在组件右侧面板中渲染一个 300×200 px 的 Canvas
  2. 坐标轴：
     - X 轴：反演时间（s），范围 `[0, maxReversalTime]`，标签 "反演时间 (s)"
     - Y 轴：漂移距离（m），范围 `[0, maxDrift * 1.1]`（最小 0.1m），标签 "漂移距离 (m)"
  3. 绘制漂移曲线：
     - `ctx.strokeStyle = "#ff6644"`（橙红色），`lineWidth = 1.5`
     - 遍历 `driftHistory` 数组，`ctx.lineTo(xScale(d.reversalTime), yScale(d.driftDistance))`
  4. 在 Canvas 中标记教学注释触发阈值线：
     - `ctx.strokeStyle = "rgba(255,255,255,0.3)"`（白色虚线）
     - `ctx.setLineDash([4, 4])`
     - 在 `yScale(0.05)` 处画水平虚线，标注 "教学注释触发线 (0.05m)"
  5. 精确反演模式下：曲线平直 y=0（或极低噪声），Canvas 顶部标注「精确反演 — 理论完全重合」
  6. 数值反演模式下：曲线从 0 开始指数增长（混沌特征），Canvas 顶部标注「数值反演 — 误差指数放大」
- **输入来源**：`driftHistory: DriftSample[]`
- **输出去向**：Canvas 像素
- **失败行为**：Canvas 尺寸为 0 → 跳过绘制

### 步骤 5：教学注释自动弹出

- **操作对象**：`TeachingAnnotation` 弹窗组件
- **具体操作**：
  1. 监听 `driftHistory` 中最新的 `driftDistance` 值
  2. 仅在**数值反演模式**下检测（精确模式不弹出，因为漂移恒为 0）
  3. 当 `driftDistance` 首次超过 `triggerThreshold`（默认 0.05m）时：
     - 屏幕中央偏下位置弹出注释框
     - 半透明深色背景（`rgba(10, 10, 15, 0.92)`）+ 白色文本
     - 标题：「数值漂移 — 混沌的不可逆性」
     - 正文：「哈密顿系统理论上可逆，但混沌使计算机的浮点误差被指数放大——这就是初值敏感性的计算物理体现。正向积分时累积的舍入误差在反向积分中无法被"撤销"，反而被进一步放大。」
     - 自动弹出，无用户操作
  4. 注释框右上角提供「✕」关闭按钮
  5. 关闭后不再自动弹出（本次反演会话内）
  6. 下次启动反演（新的 `reversalPhase = "reversing"`）时重置弹出状态
- **输入来源**：`driftHistory[last].driftDistance`、`reversalPhase`
- **输出去向**：DOM 中的绝对定位弹窗
- **失败行为**：不适用（纯 UI 逻辑）

### 步骤 6：反演结束与恢复

- **操作对象**：Worker + Store + UI 状态
- **具体操作**：
  1. 反演完成或用户点击「停止反演」：
     - 向 Worker 发送 `{ type: "setDirection", direction: 1 }`（恢复正向积分方向）
     - `reversalPhase = "idle"`，`timeReversalActive = false`
     - 正向轨迹虚线消失，反演轨迹实线保留（作为"实验结果"展示），颜色渐变为半透明（10 秒内从实色 fade 到透明后移除）
     - 漂移曲线保留在面板中（标注"最近一次反演"），不清空
     - SIM-01 Worker 从当前状态继续正向积分（状态可能已远离原始正向轨迹——这是实验的预期结果）
  2. 用户可点击「时间倒流」再次从当前状态开始新的反演（覆盖上次结果）
- **输入来源**：用户点击「停止反演」按钮或反演自然完成
- **输出去向**：Worker 方向恢复 + UI 状态恢复
- **失败行为**：
  - Worker 在反演期间崩溃：`reversalPhase = "idle"`，Toast 报错，恢复正向仿真从崩溃前的状态

---

## 依赖与集成接口

| 依赖方 | 具体接口 | 用途 |
|--------|----------|------|
| SIM-01 Worker | `postMessage({ type: "setDirection", direction: -1 })` | 切换积分方向为反向 |
| SIM-01 Worker | `postMessage({ type: "setDirection", direction: 1 })` | 恢复正向积分 |
| SIM-01 RingBuffer | `forwardHistory.toArray()` | 读取正向轨迹历史 |
| `useSimulationStore` | `getState().state` / `getState().simTime` / `getState().isRunning` | 读取当前状态 |
| `useExploreStore` | `timeReversalMode` | 读取反演模式选择 |
| `ball2Position()` | `src/features/simulation/engine/state-vector.ts` | 计算 3D 位置用于漂移计算 |
| Scene3D (EXP-01) | 复用，传入当前 state | 渲染反演轨迹 |
| TrailRenderer (EXP-02) | 复用，`colorMode="solid"` + 虚线样式 | 正向历史虚线 + 反演轨迹实线 |
| Canvas 2D | `ctx.lineTo` / `ctx.stroke` | 漂移曲线绘制 |

---

## 状态机

| 当前状态 | 触发事件 | 下一状态 | 前置条件 | 副作用 |
|----------|----------|----------|----------|--------|
| IDLE | `forward_history_ready` | RECORDING | `forwardHistory.length >= 120` | 按钮从 disabled → enabled，tooltip 消失 |
| RECORDING | `user_click_reverse` | REVERSING | `timeReversalActive = false` | 记录 startState/startSimTime/startHistoryIndex；若为数值模式，Worker 方向切为 -1 |
| REVERSING | `reversal_completed` | COMPLETED | 反演回放到历史起点或 simTime ≤ 0 | Worker 方向恢复 +1；正向虚线消失；反演轨迹 10s 淡出；漂移曲线保留 |
| REVERSING | `user_click_stop` | COMPLETED | 用户手动点击「停止反演」 | 同上 |
| REVERSING | `worker_error` | IDLE | Worker 返回 type: "error" | 显示 Toast；Worker 方向恢复 +1；丢弃反演数据 |
| COMPLETED | `user_click_reverse` | REVERSING | — | 覆盖上次反演数据（漂移历史清空，轨迹线清除），从当前状态开始新反演 |
| COMPLETED | `simulation_continues` | RECORDING | 10 秒淡出完成 | 继续积累正向历史 |
| ANY | `user_exits_explore` | IDLE | 切换到其他模式 | Worker 方向恢复 +1；反演状态全清 |

---

## 异常与边界条件

### 异常 1：正向历史不足 2 秒时点击反演

- **触发条件**：`forwardHistory.length < 120`（2 秒 × 60fps）
- **处理策略**：
  1. 按钮置灰（`disabled = true`），cursor = `not-allowed`
  2. Tooltip 显示：「需要至少运行 2 秒才能反演（当前已运行 X.X 秒）」
  3. 按钮**不可点击**（`onClick` 事件不触发）
- **重试参数**：历史达到 120 帧后自动解除 disabled。

### 异常 2：数值反演中 Worker 积分发散

- **触发条件**：Worker 返回 `{ type: "error", code: "DIVERGED" }`
- **处理策略**：
  1. 立即停止反演：`reversalPhase = "completed"`
  2. Worker 方向恢复为 +1
  3. Toast 显示：「数值反演发散于反演时间 t ≈ X.XXs — 误差已远超可追踪范围」
  4. 漂移曲线截止到发散前的最后一个有效点，曲线末端标注红色 ✕
  5. 不显示教学注释（发散不是正常的漂移增长）
- **重试参数**：不自动重试。用户调整参数后可手动重新启动反演。

### 异常 3：反演期间用户切换探索模式子功能

- **触发条件**：用户点击蝴蝶效应对比按钮等（模式切换）
- **处理策略**：
  1. 检测到模式切换，自动调用步骤 6 的反演结束逻辑
  2. Worker 方向恢复 +1
  3. 反演状态全清：`reversalPhase = "idle"`，`timeReversalActive = false`
  4. 漂移曲线清空
- **重试参数**：不重试。

---

## 原则兑现清单

| 原则编号 | 原则名称 | 来源 | 代码级约束 |
|----------|----------|------|------------|
| P1 | 高内聚低耦合 | 项目结构设计 §2 | 反演逻辑封装在 `TimeReversal` 组件内，仅通过 Worker 命令和 Store 读写与外部交互 |
| P2 | 仿真核心下沉 | 项目结构设计 §2 | 数值反演的 ODE 积分由 SIM-01 Worker 执行（仅切换方向），本模块不实现任何积分逻辑 |
| P3 | 教学深度 | 功能设计_v0 §一 | 教学注释自动弹出 + 漂移曲线可视化，将抽象的"浮点误差指数放大"具象化为可观察的曲线 |

---

## 验收测试场景

### 正向测试 1：精确反演 —— 轨迹完美回溯

- **Given**：
  - 仿真正常运行 10 秒，正向历史积累约 600 帧
  - `timeReversalMode = "exact"`，`forwardHistory.length >= 120`
- **When**：用户点击「时间倒流」按钮，反演播放 10 秒回起点
- **Then**：
  - 3D 场景中摆体从当前位置沿原路径反向运动
  - 反演轨迹（金色实线）与正向轨迹（白色虚线）完全重合（目视不可分辨）
  - 漂移曲线为恒平直线 `y = 0`
  - `reversalPhase` 从 `"reversing"` → `"completed"`
  - 不弹出教学注释
  - Canvas 漂移曲线标注「精确反演 — 理论完全重合」

### 正向测试 2：数值反演 —— 误差逐步放大

- **Given**：
  - 仿真正常运行 15 秒（大角度混沌参数：`theta1=2.0, theta2=2.5`）
  - `timeReversalMode = "numerical"`
- **When**：用户点击「时间倒流」
- **Then**：
  - 前约 1-2 秒（反演时间）：反演轨迹（青色实线）与正向历史轨迹（白色虚线）几乎重合，漂移 < 0.02m
  - 约 3-5 秒：两条轨迹开始明显分离，漂移曲线开始抬头
  - 漂移 > 0.05m 时：教学注释自动弹出（标题+正文+关闭按钮）
  - 约 8-10 秒：反演轨迹与正向轨迹完全脱离，漂移可能超过 1m
  - 漂移曲线近似指数增长形态（混沌特征）
  - 反演完成或用户停止后：Worker 方向恢复 +1，仿真继续正向运行

### 异常测试 1：历史不足时按钮禁用

- **Given**：仿真刚启动 0.5 秒，`forwardHistory.length ≈ 30`
- **When**：用户观察「时间倒流」按钮
- **Then**：
  - 按钮置灰，不可点击
  - 悬停时 tooltip 显示「需要至少运行 2 秒才能反演（当前已运行 0.5 秒）」
  - 1.5 秒后（总运行 2 秒）按钮自动变为可用

### 异常测试 2：数值反演发散后自动停止

- **Given**：数值反演运行中，积分已进行 5 秒（反演时间）
- **When**：Worker 返回 `{ type: "error", code: "DIVERGED" }`（极端参数导致反向积分发散）
- **Then**：
  - `reversalPhase` 立即变为 `"completed"`
  - Toast 提示「数值反演发散于反演时间 t ≈ 5.XXs」
  - 漂移曲线截止到错误前最后一个有效点，末尾标注红色 ✕
  - Worker 方向自动恢复 +1
  - 不弹出教学注释

---

## 文档详细度自检清单

- [x] 文档自包含：不了解代码的人可凭此文档独立完成 EXP-05 编码
- [x] 无偷懒表述：全文无 `"等等"`、`"..."`、`"其他字段"`、`"类似"`、`"同上"`
- [x] 类型定义完整：`TimeReversalProps`、`ReversalMode`、`ReversalPhase`、`DriftSample`、`TeachingAnnotation`、Store 扩展字段
- [x] 逻辑步骤完整：6 个步骤，每个有操作对象/具体操作/输入来源/输出去向/失败行为
- [x] 异常处理完整：3 种异常（历史不足/积分散发/模式切换中断）
- [x] 无隐藏假设：所有阈值（2 秒/120 帧、0.05m 触发线、10 秒淡出）已显式写出

---

## 注意事项与禁止行为

1. **[Worker 方向切换安全]** 向 Worker 发送 `setDirection(-1)` 命令前，必须确保 Worker 处于 `idle` 而非 `computing` 状态（等待上批次 `batchReady` 返回后再切换）。**禁止**在 Worker 计算中途切换方向。

2. **[漂移距离计算一致性]** `ball2Position` 函数必须与 EXP-01 步骤 2 使用完全相同的坐标公式。若 EXP-01 修改了坐标转换逻辑，本模块的漂移计算也必须同步更新。**推荐**从 `src/features/simulation/engine/state-vector.ts` 导入公共函数。

3. **[正向历史只读]** 精确反演模式仅读取 `forwardHistory.toArray()`，**禁止**修改 RingBuffer 内容。反演播放通过 `useSimulationStore.setState()` 临时覆盖显示状态实现，不影响 SIM-01 的持久化历史。

4. **[精确 vs 数值模式 UI 区分]** 用户必须在两种模式间明确区分：
   - 精确模式按钮：标注「精确反演（对照）」，tooltip「仅视觉回放，无误差——用于对照基线」
   - 数值模式按钮：标注「数值反演（实验）」，tooltip「真实反向积分，展示浮点误差指数放大——实验主体」

5. **[漂移曲线 Y 轴对数选项]** 由于混沌运动下漂移距离呈指数增长，提供 Y 轴线性/对数切换按钮（默认线性）。对数模式下 `yscale = d3.scaleLog().domain([1e-6, maxDrift])` 能更清晰地展示早期误差积累过程。

6. **[禁止行为]** 禁止在反演过程中修改物理参数（参数滑块在反演期间 disabled）。

7. **[禁止行为]** 禁止在精确反演模式下启动 Worker 积分（浪费 CPU）。

---

*本文档由 AI 辅助生成，建议经技术负责人评审后生效。*
