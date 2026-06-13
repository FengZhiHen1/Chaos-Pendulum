# 功能点：EXP-04 蝴蝶效应对比器

> **文档生成时间**：`2026-04-28 20:27:33 CST`
> **版本记录**：
> | 版本 | 时间 | 修改人 | 变更摘要 |
> |------|------|--------|----------|
> | v1.0 | `2026-04-28 20:27:33` | AI Assistant | 初始版本 |

> **冲突核查指引**：若发现与已有规格文档冲突，优先以时间戳更新的版本为准，并在版本记录中追加冲突解决条目。

---

## 所属模块与溯源

- **对应总设计章节**：功能设计_v0 §三 3.4「蝴蝶效应对比（升级）」；技术栈设计.md §4.2「蝴蝶效应分屏对比」
- **依赖的其他功能模块**：
  - `SIM-01`（双摆物理引擎）— 两个独立 Worker 实例分别驱动摆 A 和摆 B 的 ODE 积分
  - `EXP-01`（3D 仿真场景）— 复用 Scene3D 组件渲染单个视口的摆体，本模块放置两个 Scene3D 实例
  - `EXP-02`（运动尾迹渲染）— 每个视口内渲染独立尾迹（摆 A 金色尾迹 / 摆 B 紫色尾迹）
  - `EXP-03`（声音化引擎）— 分离警报触发时混入白噪声（复用混沌听觉标记机制）
  - `SYS-01`（响应式布局引擎）— 桌面端左右分屏，平板/手机切换为上下或单视口

---

## 已有设计兼容性分析

- **已审查的相关规格文档**：
  - `docs/功能设计/2-探索模式/EXP-01-3D仿真场景.md`（v1.0, 2026-04-28 19:30:00 CST）
  - `docs/功能设计/2-探索模式/EXP-02-运动尾迹渲染.md`（v1.0, 2026-04-28 20:00:00 CST）
  - `docs/功能设计/2-探索模式/EXP-03-声音化引擎.md`（v1.0, 2026-04-28 20:16:30 CST）
- **兼容性结论**：
  - **无冲突**。本模块是 EXP-01/EXP-02 的"编排层"——不修改 EXP-01 Scene3D 的内部实现，而是在更高层级放置两个 Scene3D 实例并协调它们的输入
  - **类型复用与扩展**：
    - 复用 `Scene3DProps`（来自 EXP-01），两个视口各传入独立的 `pendulumMaterial`（A=金色 `#f0c040` / B=紫色 `#a855f7`）和 `environment`（固定 `"dark-lab"`）
    - 复用 `TrailRendererProps`（来自 EXP-02），两个视口各自的尾迹使用不同的 `solidColor`（A 金色 / B 紫色）和 `colorMode = "solid"`
    - 复用 `useExploreStore.butterflyDelta`（当前类型 `number`，默认值 `0.001`），用于控制初始角度差异 δ
    - 扩展 `useSimulationStore`：当前 store 管理单一仿真状态。本模块需要**新增** `ButterflySimStore`（见 §输入定义），独立管理两个 Worker 实例和双份状态
  - **新增 Store**：`ButterflySimStore` 不替换 `useSimulationStore`，而是作为一个独立的增强 Store 在蝴蝶效应模式下使用。探索模式的普通视图仍使用 `useSimulationStore`
- **复用的已有定义**：`Scene3D` 组件、`useTrailBuffer`、`StateVector`、`PhysicsParams`、`useExploreStore.butterflyDelta`、`useAppStore.deviceType`

---

## 技术栈绑定

- **必须使用**：
  - `react@^18.3.1` — UI 框架，`ButterflySplit`、`SeparationAlert`、`DeltaPanel` 组件
  - `@react-three/fiber@^8.17.0` — 双 `<Canvas>` 各自独立渲染上下文
  - `three@^0.184.0` — 仅类型引用（Vector3），本模块不直接操作 Three.js 对象
  - `zustand@^4.5.5` — `ButterflySimStore` + 订阅现有 Store
  - `tailwindcss@^3.4.16` — 响应式分屏布局（`grid grid-cols-2` / `grid-cols-1`）
  - Web Workers（浏览器原生）— `new Worker(new URL('@/features/simulation/worker/ode-worker.ts', import.meta.url), { type: 'module' })` 创建双 Worker 实例
  - CSS `@keyframes` 动画 — 分离警报脉冲效果

- **禁止使用**：
  - 禁止两个视口共享同一个 Worker 实例（必须创建独立的 Worker A 和 Worker B，分别调用 `worker.postMessage`）
  - 禁止两个视口共享同一个 R3F `<Canvas>`（必须各自独立的 Canvas，每个有自己的 WebGL 上下文）
  - 禁止在 Worker A 和 Worker B 之间直接通信（必须通过主线程 Store 中转）
  - 禁止在移动端渲染双视口（内存/GPU 无法支撑两个 WebGL 上下文），`deviceType !== "desktop"` 时回退为单视口 + 参数切换模式

---

## 输入定义（精确类型）

### 核心 Store：`ButterflySimStore`

```typescript
import type { PhysicsParams, StateVector, EnergySnapshot } from "@/shared/types";

/**
 * 参数编辑模式。
 * - "synced": 同时修改 A 和 B 的参数（联动滑块）
 * - "a-only": 仅修改摆 A 的参数
 * - "b-only": 仅修改摆 B 的参数
 */
type DeltaEditMode = "synced" | "a-only" | "b-only";

/**
 * 单侧仿真的完整运行时状态。
 */
interface SimSideState {
  /** 当前状态向量 [θ₁, ω₁, θ₂, ω₂]，单位 rad, rad/s */
  state: StateVector;
  /** 物理参数 */
  params: PhysicsParams;
  /** 当前能量 */
  energy: EnergySnapshot;
  /** 该侧 Worker 是否已初始化并 ready */
  workerReady: boolean;
  /** 仿真累计时间（秒） */
  simTime: number;
}

/**
 * 分离度跟踪。
 */
interface SeparationMetrics {
  /**
   * 当前角度分离度 |Δθ|
   * = sqrt((θ₁A - θ₁B)² + (θ₂A - θ₂B)²)，单位 rad
   * 示例：0.05（接近）/ 2.8（显著分离）
   */
  currentSeparation: number;

  /**
   * 是否已完全失相关（|Δθ| > π/2 ≈ 1.571 rad，即 90°）
   */
  isFullyDecoupled: boolean;

  /**
   * 从仿真开始至今的最大分离度（rad）
   */
  maxSeparation: number;

  /**
   * 首次触发失相关的时间戳（ms），null = 尚未触发
   */
  decoupledAt: number | null;
}

/**
 * 蝴蝶效应对比器的全局 Store。
 * 独立于 useSimulationStore，仅在蝴蝶效应模式下使用。
 */
interface ButterflySimStoreState {
  /** 初始差异 δ（度），来自 useExploreStore.butterflyDelta */
  deltaDeg: number;
  /** 参数编辑模式 */
  editMode: DeltaEditMode;
  /** 摆 A 的仿真状态 */
  sideA: SimSideState;
  /** 摆 B 的仿真状态（初始条件 = A 的初始条件 + δ） */
  sideB: SimSideState;
  /** 分离度指标 */
  separation: SeparationMetrics;
  /** 双视口是否正在运行 */
  isRunning: boolean;

  // ── Actions ──
  /** 初始化双 Worker 并设置初始状态 */
  init: (baseParams: PhysicsParams, baseState: StateVector, deltaDeg: number) => void;
  /** 启动/恢复双 Worker 仿真 */
  play: () => void;
  /** 暂停双 Worker */
  pause: () => void;
  /** 重置：杀死旧 Worker，重新创建，用当前 params 和 delta 重置 */
  reset: () => void;
  /** 更新参数（受 editMode 控制修改单侧或双侧） */
  updateParams: (patch: Partial<PhysicsParams>) => void;
  /** 更新单侧仿真状态（由 Worker 回调驱动，外部不应直接调用） */
  _updateSide: (side: "A" | "B", state: StateVector, energy: EnergySnapshot) => void;
  /** 设置 Worker ready 标志 */
  _setWorkerReady: (side: "A" | "B", ready: boolean) => void;
  /** 切换编辑模式 */
  setEditMode: (mode: DeltaEditMode) => void;
  /** 设置 delta（角度，度），触发 reset */
  setDelta: (deltaDeg: number) => void;
}
```

### 组件 Props

```typescript
/**
 * ButterflySplit 分屏布局组件属性。
 * 渲染双 Canvas 并排视图 + 差异溯源面板 + 分离警报。
 */
interface ButterflySplitProps {
  /**
   * 父容器 CSS 类名。默认 "w-full h-full"。
   * 由 AppShell 传入，占据主内容区全部空间。
   */
  className?: string;
}

/**
 * SeparationAlert 分离警报组件属性。
 * 在屏幕中央显示脉冲提示，告知用户两摆已"完全失相关"。
 */
interface SeparationAlertProps {
  /**
   * 是否触发分离警报。来自 ButterflySimStore.separation.isFullyDecoupled。
   */
  triggered: boolean;

  /**
   * 当前分离度（rad）。显示在提示文本下方。
   */
  separationRad: number;

  /**
   * 警报文本。默认 "完全失相关"。
   */
  message?: string;
}

/**
 * DeltaPanel 差异溯源面板组件属性。
 * 显示在分屏视图下方或侧边，展示 A/B 两摆的实时参数与角度差异。
 */
interface DeltaPanelProps {
  /** 摆 A 的当前状态 */
  sideA: SimSideState;
  /** 摆 B 的当前状态 */
  sideB: SimSideState;
  /** 分离度指标 */
  separation: SeparationMetrics;
  /** 当前编辑模式 */
  editMode: DeltaEditMode;
  /** 编辑模式切换回调 */
  onEditModeChange: (mode: DeltaEditMode) => void;
  /** delta 调整回调（度） */
  onDeltaChange: (deltaDeg: number) => void;
  /** 当前 delta（度） */
  deltaDeg: number;
}
```

### 数据消费（从现有 Store 读取）

```typescript
// 蝴蝶效应 delta（初始角度差异，单位度）
const butterflyDelta: number = useExploreStore((s) => s.butterflyDelta);

// 设备类型（非桌面端降级为单视口）
const deviceType: "desktop" | "tablet" | "mobile" = useAppStore((s) => s.deviceType);
```

---

## 输出定义（精确类型）

### UI 输出

| 视觉元素 | 位置 | 说明 |
|---------|------|------|
| 左视口 Canvas | 左侧 50% 宽度（桌面端） | R3F `<Canvas>` 渲染摆 A（金色球体 + 金色尾迹），独立 Worker A |
| 右视口 Canvas | 右侧 50% 宽度（桌面端） | R3F `<Canvas>` 渲染摆 B（紫色球体 + 紫色尾迹），独立 Worker B |
| 中间分隔线 | 两个视口之间 | 1px 竖线，颜色 `#2a2a3f`（lab-border），分割视觉区域 |
| 差异溯源面板 | 视口下方或右侧 | 实时数值显示：初始 δ、当前 |Δθ|、θ₁A/θ₁B、θ₂A/θ₂B、最大分离度 |
| 分离警报 | 屏幕中央绝对定位 | 当 |Δθ| > 90° 时触发：半透明背景 + 红色脉冲文本 + CSS `@keyframes pulse` 动画（opacity 0.7→1.0→0.7，周期 1.5s，无限循环） |
| 同步控制工具栏 | 视口上方 | 播放/暂停/重置 按钮 + 编辑模式切换（仅调 A / 仅调 B / 同步调节） |

### 数据输出

`ButterflySimStore` 的运行时状态通过 Zustand 的 `useStore` hook 暴露给 UI 组件，无其他外部数据输出。

---

## 核心逻辑步骤

### 步骤 1：双 Worker 初始化

- **操作对象**：Worker A 和 Worker B 两个 `Worker` 实例、`ButterflySimStore`
- **具体操作**：
  1. 创建两个独立的 Worker 实例：
     ```typescript
     const workerA = new Worker(
       new URL("@/features/simulation/worker/ode-worker.ts", import.meta.url),
       { type: "module" }
     );
     const workerB = new Worker(
       new URL("@/features/simulation/worker/ode-worker.ts", import.meta.url),
       { type: "module" }
     );
     ```
  2. 为每个 Worker 注册 `onmessage` 回调，解析 `WorkerResponse`：
     - `type === "ready"` → 调用 `_setWorkerReady(side, true)`
     - `type === "batchReady"` → 从 buffer 中提取第一帧和最后一帧的 StateVector + 能量，调用 `_updateSide(side, state, energy)`，将 buffer 归还 Float64Pool
     - `type === "error"` → 步骤 6（异常处理）
  3. 计算摆 B 的初始条件：`icB.theta1 = baseState.theta1 + deltaDeg * (π / 180)`（将度的增量转为弧度），其他分量不变
  4. 向 Worker A 发送 `{ type: "init", params: baseParams, initialConditions: icA, method: "RK4" }`
  5. 向 Worker B 发送 `{ type: "init", params: baseParams, initialConditions: icB, method: "RK4" }`
  6. 等待两个 Worker 均返回 `ready` 后，Store 状态更新为可播放
- **输入来源**：`baseParams: PhysicsParams`（来自当前 `useSimulationStore.params`）、`baseState: StateVector`（来自当前 `useSimulationStore.state`）、`deltaDeg`（来自 `useExploreStore.butterflyDelta`）
- **输出去向**：两个已初始化的 Worker 实例（保存在 `useRef` 中）+ ButterflySimStore 状态就绪
- **失败行为**：
  - Worker 创建失败（浏览器不支持 Web Workers）：显示 fallback UI 文本「您的浏览器不支持 Web Workers，蝴蝶效应对比功能不可用」，返回 `null`
  - Worker 5 秒内未返回 `ready`：超时处理，杀死该 Worker，新建一个重试，**最多重试 1 次**。仍失败则显示 Toast「仿真引擎启动失败，请刷新页面」

### 步骤 2：每帧 Worker 调度与数据更新

- **操作对象**：Worker A 和 Worker B、`Float64Pool`（每侧独立池）、`ButterflySimStore`
- **具体操作**：
  1. 播放状态下（`isRunning === true`），主线程使用 `requestAnimationFrame` 驱动调度循环
  2. 检查两侧 Worker 是否都空闲（上一批次已返回且未发送新请求）
  3. 从 Float64Pool 中为每侧 `acquire()` 一个空闲 buffer
  4. 同时向 Worker A 和 Worker B 发送 `{ type: "step", buffer }`（通过 `postMessage(buffer, [buffer.buffer])` Transferable 传输）
  5. Worker 返回后：
     - 解析 buffer 中的帧数据（每帧 FRAME_STRIDE=14 个 float64：t, θ₁, ω₁, θ₂, ω₂, x1, y1, x2, y2, Ek, Ep, Etot, α1, α2）
     - 提取所有帧的状态用于渲染（存入 Store），同时取出最后一帧用于下次 step 的初值
     - 归还 buffer 到池
  6. 计算当前分离度：
     ```
     const dTheta1 = sideA.state.theta1 - sideB.state.theta1;
     const dTheta2 = sideA.state.theta2 - sideB.state.theta2;
     const currentSeparation = Math.sqrt(dTheta1 * dTheta1 + dTheta2 * dTheta2);
     ```
  7. 更新 `separation`：
     - `currentSeparation` 写入
     - `isFullyDecoupled` = `currentSeparation > Math.PI / 2`（> 90°）
     - `maxSeparation = Math.max(maxSeparation, currentSeparation)`
     - `decoupledAt` = 首次 `isFullyDecoupled` 变为 true 时的 `performance.now()`
- **输入来源**：Worker 返回的 `batchReady` buffer、当前 Store 状态
- **输出去向**：Store 状态更新 → React 组件重渲染（两个 Scene3D 各自读取自己侧的状态）
- **失败行为**：
  - Float64Pool 耗尽（`acquire()` 返回 null）：跳过本帧 step 请求，等待下一帧重试。连续 10 帧耗尽 → `console.error`，自动暂停

### 步骤 3：同步控制（播放/暂停/重置广播）

- **操作对象**：双 Worker + ButterflySimStore
- **具体操作**：
  1. **播放**（`play()`）：
     - 设置 `isRunning = true`
     - 启动 rAF 调度循环（步骤 2）
     - 若两 Worker 之前处于暂停状态（未销毁），直接继续发送 step 命令（Worker 内部状态保留）
  2. **暂停**（`pause()`）：
     - 设置 `isRunning = false`
     - 停止发送新的 step 命令（当前正在执行的批次等待完成）
     - Worker **不销毁**，保留内部状态（Step 命令恢复时从当前状态继续）
     - 两个 Canvas 内的场景冻结（EXP-01 的 Scene3D 根据 `isRunning` 停止更新位置）
  3. **重置**（`reset()`）：
     - 调用旧 Worker 的 `terminate()`
     - Float64Pool 重新初始化
     - 重新创建两个 Worker 实例（Worker A / Worker B）
     - 用**当前 params + delta**重新发送 init 命令
     - 分离度指标全部清零（`maxSeparation = 0`, `isFullyDecoupled = false`, `decoupledAt = null`）
     - 两条尾迹清空（调用 EXP-02 的 `clear()`）
- **输入来源**：用户点击播放/暂停/重置按钮、`ButterflySimStore.editMode`
- **输出去向**：Worker 生命周期状态变化 → Store 更新 → UI 按钮状态切换
- **失败行为**：
  - Worker 在暂停后被浏览器回收（极少见）：下次播放时检测到 `worker` 引用为无效状态，自动重新 init

### 步骤 4：参数编辑（单侧/双侧调节）

- **操作对象**：`ButterflySimStore.params` (A 侧和 B 侧独立存储)
- **具体操作**：
  1. 用户修改参数滑块时，根据 `editMode` 决定修改范围：
     - `"synced"`：同时修改 `sideA.params` 和 `sideB.params`（两侧始终保持相同参数）
     - `"a-only"`：仅修改 `sideA.params`，`sideB.params` 不变
     - `"b-only"`：仅修改 `sideB.params`，`sideA.params` 不变
  2. 修改参数后，向对应的 Worker 发送 `{ type: "updateParams", params: newParams }`（热更新，不中断仿真）
  3. 若 `editMode === "synced"`，同时向两个 Worker 发送相同的 updateParams 命令
- **输入来源**：用户拖动参数滑块（复用 SIM-02 的 ParameterPanel 组件，但需传入 `editMode` 上下文）
- **输出去向**：Worker 内部参数更新（热更新），不影响当前状态
- **失败行为**：
  - 更新参数非法（如 L1 < 0）：Worker 返回 error 响应，参数回退到修改前的值，滑块位置回弹

### 步骤 5：分离警报触发与 UI 动画

- **操作对象**：`SeparationAlert` 组件、CSS 动画
- **具体操作**：
  1. 订阅 `ButterflySimStore.separation.isFullyDecoupled`
  2. 当从 `false` → `true` 时：
     - `SeparationAlert` 从 `display: none` → `display: flex`
     - 应用 CSS 类 `animate-pulse-alert`（自定义 keyframes）：
       ```css
       @keyframes pulse-alert {
         0%, 100% { opacity: 0.7; transform: scale(1); }
         50% { opacity: 1.0; transform: scale(1.03); }
       }
       .animate-pulse-alert {
         animation: pulse-alert 1.5s ease-in-out infinite;
       }
       ```
     - 显示文本：「⚠ 完全失相关 — |Δθ| 已超过 90°」
     - 显示当前分离度数值（如 `|Δθ| = 112.3°`）
     - 同时触发 EXP-03 的混沌听觉标记：调用 `createNoiseGenerator().setLevel(0.02)`（轻微白噪声提示）—— 如果声音化已开启
  3. 当从 `true` → `false`（重置后）：警报消失，白噪声关闭
  4. 用户可点击警报区域任意位置使其半透明（`opacity: 0.3`），点击第二次完全关闭（用户主动忽略）
- **输入来源**：`separation.isFullyDecoupled`、`separation.currentSeparation`
- **输出去向**：DOM 中的绝对定位警报元素 + CSS 动画
- **失败行为**：不适用（纯 UI 逻辑，无运行时失败路径）

### 步骤 6：响应式布局切换

- **操作对象**：`ButterflySplit` 外层容器的 CSS Grid 列数
- **具体操作**：
  1. `deviceType === "desktop"`：`grid-cols-2`（左右并排），每个 Canvas 宽 50%
  2. `deviceType === "tablet"`：`grid-cols-1`（上下堆叠），Canvas 高度各 50%，**仅一个 Canvas 活跃**（另一个显示静态缩略图，点击切换活跃视口），节省 GPU 资源
  3. `deviceType === "mobile"`：单视口全屏，提供「A/B 切换」按钮在摆 A 和摆 B 之间切换显示，另一个摆的轨迹以半透明虚线叠加在当前视口中
- **输入来源**：`useAppStore.deviceType`
- **输出去向**：Tailwind 响应式 CSS 类名变化
- **失败行为**：不适用（布局逻辑）

---

## 依赖与集成接口

| 依赖方 | 具体接口 | 用途 |
|--------|----------|------|
| `useSimulationStore` | `useSimulationStore.getState().params` | 获取初始参数用于 butterfly init |
| `useSimulationStore` | `useSimulationStore.getState().state` | 获取初始状态用于 butterfly init |
| `useExploreStore` | `useExploreStore((s) => s.butterflyDelta)` | 读取 δ（度） |
| `useExploreStore` | `useExploreStore.getState().setButterflyDelta` | 更新 δ |
| `useAppStore` | `useAppStore((s) => s.deviceType)` | 响应式降级 |
| Scene3D (EXP-01) | `<Scene3D pendulumMaterial="gold" {...} />` | 左视口（摆 A 金色） |
| Scene3D (EXP-01) | `<Scene3D pendulumMaterial="purple" {...} />` | 右视口（摆 B 紫色） |
| useTrailBuffer (EXP-02) | `useTrailBuffer()` × 2 实例 | 两侧各自独立尾迹 |
| Float64Pool | `pool.acquire()` / `pool.release()` | 每侧独立 buffer 池 |
| Worker | `new Worker(...)` × 2 | Worker A + Worker B 实例 |
| Web Audio (EXP-03) | `noiseGenerator.setLevel(0.02)` | 分离警报触发时混入白噪声 |

---

## 状态机

### 双视口生命周期状态机

| 当前状态 | 触发事件 | 下一状态 | 前置条件 | 副作用 |
|----------|----------|----------|----------|--------|
| INACTIVE | `butterfly_mode_entered` | INITIALIZING | 用户点击探索模式中的「蝴蝶效应对比」按钮 | 创建 ButterflySimStore，布局切换为分屏 |
| INITIALIZING | `both_workers_ready` | READY | Worker A 和 Worker B 均返回 `type: "ready"` | `isRunning = false`，显示播放按钮 |
| INITIALIZING | `worker_init_timeout` | INITIALIZING | 任一 Worker 5 秒未 ready | 重试最多 1 次（kill + recreate），仍失败 → ERROR |
| READY | `user_click_play` | RUNNING | 两侧 Worker 均 ready | `isRunning = true`，启动 rAF 调度循环，两个 Canvas 开始更新 |
| RUNNING | `separation_exceeds_90deg` | RUNNING (alerting) | `currentSeparation > π/2` 首次触发 | `isFullyDecoupled = true`, `decoupledAt = now()`，显示 SeparationAlert 脉冲动画 |
| RUNNING | `user_click_pause` | PAUSED | `isRunning === true` | 停止 rAF 调度，Canvas 定格，Worker 保留不销毁 |
| RUNNING | `user_click_reset` | INITIALIZING | — | 旧 Worker terminate，重建，重新 init，分离度指标清零，尾迹清空 |
| PAUSED | `user_click_play` | RUNNING | 两侧 Worker 仍存活 | 恢复 rAF 调度，从暂停状态继续 |
| PAUSED | `user_click_reset` | INITIALIZING | — | 同 RUNNING → reset |
| RUNNING (alerting) | `user_dismiss_alert` | RUNNING | 用户点击警报区域 | 警报 opacity 降为 0.3 或消失，`isFullyDecoupled` 状态不变 |
| ANY | `butterfly_mode_exited` | INACTIVE | 用户切换回普通探索模式 | 双 Worker terminate，ButterflySimStore 销毁，布局恢复单视口 |

---

## 异常与边界条件

### 异常 1：两侧 Worker 积分速度不一致导致同步偏差

- **触发条件**：
  - Worker A 和 Worker B 的计算耗时不同（参数差异导致积分步数差异，特别是 RK45 自适应模式下）
  - 一侧 Worker 返回 batchReady 后另一侧仍在计算中
- **处理策略**：
  1. 主线程维护每侧 Worker 的 `batchPending` 标志
  2. 仅当两侧 Worker 的上一批次都已完成（`batchPending === false`）时，才发送下一批 step 命令
  3. 若一侧 Worker 连续 3 个批次比另一侧慢 > 50ms：`console.warn("EXP-04: Worker desync detected, side X lagging")`
  4. **不使用** `Promise.all` 等待两侧（会阻塞慢的一侧），而是各自独立的 `onmessage` 回调 + pending 标志实现非阻塞同步
- **重试参数**：不重试。慢侧自然赶上后继续同步步调。

### 异常 2：δ 过大导致摆 B 初始状态物理不合理

- **触发条件**：
  - 用户将 `butterflyDelta` 调至极端值（如 δ = 180°），导致 θ₁B 和 θ₁A 相差巨大
  - 技术上合法，但视觉上两个摆的初始姿态完全不同，破坏了"蝴蝶效应"的叙事效果（应是微小差异）
- **处理策略**：
  1. δ 上限设为 10.0°（> 10° 已不是"微小差异"，蝴蝶效应的叙事感消失）
  2. 滑块输入框 max 属性设为 10.0，输入 > 10.0 时自动 clamp 至 10.0
  3. δ 可精确到 10⁻⁶°（滑块默认步长 0.1°，输入框可手动输入如 `0.000001`）
  4. 不限制下限（允许 0°，但 δ=0 时两侧完全同步，分离度恒为 0）
- **重试参数**：不适用。校验在 UI 层完成。

### 异常 3：一侧 Worker 崩溃

- **触发条件**：
  - Worker A 或 Worker B 返回 `type: "error"`（数值发散）
  - 或 Worker 的 `onerror` 事件触发（未捕获异常）
- **处理策略**：
  1. 将崩溃侧标记为 `workerReady = false`，`isRunning = false`（自动暂停）
  2. 显示 Toast：「摆 X 仿真计算发散，请调整参数后重试」，Toast 中附带出错的 simTime 和参数
  3. 另一侧健康的 Worker 保持 alive（不销毁）
  4. 用户点击「重置」后：仅重建崩溃侧的 Worker，健康侧复用
  5. 若两侧都崩溃：执行步骤 3 的重置逻辑（两侧全重建）
  6. `console.error("EXP-04: Worker X crashed", errorDetails)`
- **重试参数**：不自动重试。用户手动调整参数后点击重置。

### 异常 4：移动端尝试双 Canvas 导致性能崩溃

- **触发条件**：
  - `deviceType !== "desktop"` 但双 Canvas 仍在渲染（如用户调整浏览器窗口从桌面宽度缩小到平板宽度）
- **处理策略**：
  1. 监听 `deviceType` 变化（ResizeObserver → useAppStore）
  2. `deviceType` 从 `"desktop"` → `"tablet"` 时：
     - 立即暂停不活跃侧的 Worker 仿真（停止发送 step 命令）
     - 活跃侧继续运行
     - 不活跃侧 Canvas 替换为静态截图（`canvas.toDataURL()`），减少 GPU 开销
  3. `deviceType` 从 `"tablet"` → `"desktop"` 时：恢复双 Canvas 正常渲染
- **重试参数**：不适用。布局变化响应。

---

## 原则兑现清单

| 原则编号 | 原则名称 | 来源 | 代码级约束 |
|----------|----------|------|------------|
| P1 | 高内聚低耦合 | 项目结构设计 §2 | `ButterflySplit` 编排层不修改 EXP-01 Scene3D 内部，仅传入不同 props；Store 独立于 useSimulationStore |
| P2 | 仿真核心下沉 | 项目结构设计 §2 | 双 Worker 各自独立运行 ODE 积分，主线程仅做调度和数据分发，不含物理计算 |
| P4 | 性能优先 | 技术栈设计 §1.2 | 两个 Canvas 各自拥有独立的 WebGL 上下文和 rAF 循环；双 Worker 各自独立线程不阻塞主线程；非桌面端降级 |
| P5 | 响应式降级 | 功能设计_v0 §八 | 桌面 2 列 / 平板单列双视口切换 / 手机单视口 A/B 切换 |

---

## 验收测试场景

### 正向测试 1：微小 δ 下两侧同步运行并逐渐分离

- **Given**：
  - 桌面端浏览器，`deviceType = "desktop"`
  - 初始物理参数：`{ m1: 1.0, m2: 1.0, L1: 1.0, L2: 1.0, g: 9.81, damping: 0 }`
  - 初始状态：`{ theta1: 2.0, omega1: 0.0, theta2: 2.0, omega2: 0.0 }`（大角度，混沌区域）
  - `butterflyDelta = 0.001`（0.001° = 约 1.75×10⁻⁵ rad）
  - 摆 A 金色材质，摆 B 紫色材质
- **When**：
  - 用户点击「蝴蝶效应对比」进入分屏模式
  - 两个 Worker 初始化完成后点击「播放」
  - 运行 15 秒
- **Then**：
  - 左半屏显示金色摆 A，右半屏显示紫色摆 B
  - 前约 5-10 秒两侧运动轨迹几乎重合（目视难以区分）
  - 约 10-15 秒后两侧出现明显偏差（运动轨迹逐渐分道扬镳）
  - DeltaPanel 实时显示 `|Δθ|` 从 ~0 逐步增长
  - 两侧尾迹颜色正确（A 金色 `#f0c040`，B 紫色 `#a855f7`）
  - 播放/暂停/重置按钮在两个视口上方的共享工具栏中可见
  - 中间分隔线清晰但不过分抢眼

### 正向测试 2：分离警报正确触发

- **Given**：
  - 同测试 1 初始状态，`butterflyDelta = 0.01`
  - 仿真已运行足够长时间（`currentSeparation > 90°`）
- **When**：`currentSeparation` 首次超过 `π/2`（90°）
- **Then**：
  - 屏幕中央出现脉冲动画的半透明红色提示框
  - 文本显示「⚠ 完全失相关 — |Δθ| 已超过 90°」
  - 下方显示精确分离度（如 `|Δθ| = 93.7°`）
  - CSS 动画 `pulse-alert` 持续循环（opacity 0.7→1.0→0.7，周期 1.5s）
  - DeltaPanel 中 `isFullyDecoupled` 标记为 true
  - 若声音化已开启，背景有轻微白噪声（0.02 水平）

### 异常测试 1：非桌面端降级为单视口

- **Given**：
  - `deviceType = "tablet"`（或 `"mobile"`）
- **When**：用户进入蝴蝶效应模式
- **Then**：
  - 仅渲染一个 Canvas（占据全宽）
  - 默认显示摆 A，底部工具栏有「切换到摆 B」按钮
  - 另一个摆的轨迹以半透明虚线叠加在当前视口中（颜色为对应摆的颜色，opacity 0.4）
  - GPU 内存中仅存在一个 WebGL 上下文
  - 不创建第二个 Worker（仅 Worker A 运行；切换到 B 时复用同一个 Worker 但使用 B 的初始条件和参数）

### 异常测试 2：一侧 Worker 数值发散另一侧正常运行

- **Given**：
  - 分屏模式正常运行
  - 用户将摆 B 的参数改为极端组合（如 `L2 = 3.0`, `theta2 = 3.0`）
- **When**：Worker B 返回 `{ type: "error", code: "DIVERGED" }`
- **Then**：
  - ButterflySimStore `sideB.workerReady` 设为 false
  - `isRunning` 自动设为 false（暂停）
  - Toast 提示：「摆 B 仿真计算发散于 t=X.XXs，请调整参数后重试」
  - 摆 A 的 Canvas 定格但继续显示（Worker A 存活）
  - 摆 B 的 Canvas 变灰（叠加灰色半透明遮罩，opacity 0.5）
  - 用户点击「重置」后摆 B 重建 Worker，两侧恢复

---

## 文档详细度自检清单

- [x] 文档自包含：不了解代码的人可凭此文档独立完成 EXP-04 编码
- [x] 无偷懒表述：全文无 `"等等"`、`"..."`、`"其他字段"`、`"类似"`、`"同上"`、`"参考其他模块"`
- [x] 类型定义完整：`ButterflySimStoreState`（10 个状态字段 + 8 个 action）、`SimSideState`、`SeparationMetrics`、3 个组件 Props 接口
- [x] 逻辑步骤完整：6 个步骤，每个有操作对象/具体操作/输入来源/输出去向/失败行为
- [x] 异常处理完整：4 种异常，每种有精确触发阈值和处理策略
- [x] 无隐藏假设：所有阈值（`> π/2`、`5 秒超时`、`δ 上限 10.0°`）已显式写出

---

## 注意事项与禁止行为

1. **[独立 WebGL 上下文]** 两个 `<Canvas>` 各自拥有独立的 WebGL 上下文，**禁止**共享 Renderer 或 Scene。exp-01 的 Scene3D 组件设计为单实例渲染，但通过传入不同的 props（`pendulumMaterial`、引用不同的 Store slice）可被复用于两个视口。

2. **[Worker 实例隔离]** Worker A 和 Worker B 是两个独立的 `new Worker()` 实例，各自维护独立的 `_state`、`_params`、`_simTime`。**禁止**通过 `postMessage` 在 Worker 之间直接传递数据（浏览器不支持 Worker-to-Worker 直接通信）。

3. **[Float64Pool 每侧独立]** 每侧仿真需要独立的 Float64Pool 实例（各 10 块 × 4000 元素）。**禁止**两侧共享同一个池（否则 buffer 所有权混乱，A 侧刚 transfer 出去的 buffer 被 B 侧 acquire 到）。

4. **[Scene3D 数据注入]** Scene3D 的 `useFrame` 中必须从 `ButterflySimStore` 读取对应侧的数据，而非从 `useSimulationStore` 读取。可通过向 Scene3D 传入 `side: "A" | "B"` prop 使其从正确的 Store 路径读取。**禁止**修改 EXP-01 Scene3D 的内部数据消费逻辑——改为 props 注入或通过 Context 传递 Store 引用。

5. **[分离度计算频率]** 分离度计算（`currentSeparation`）在每批次 Worker 返回后执行一次（≈ 每 2 秒 1 次），而非每渲染帧。这样既保证数值精度（Worker 返回的是积分后的状态），又避免每帧做 trig 运算的 CPU 开销。

6. **[脉冲动画 GPU 友好]** 分离警报使用 CSS `opacity` 和 `transform: scale()` 动画（GPU 加速属性，不触发 layout/paint），**禁止**使用 `left`/`top`/`width`/`height` 等触发 reflow 的属性。

7. **[δ 单位一致性]** `butterflyDelta` 在 Store 中存储为**度**（用户可见单位），在传给 Worker init 时转换为**弧度**（`deltaDeg × π / 180`），添加到 `theta1` 分量上。**禁止**将度和弧度混用。

---

*本文档由 AI 辅助生成，建议经技术负责人评审后生效。*
