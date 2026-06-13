# 功能点：DAT-03 历史回放与分叉

> **文档生成时间**：`2026-04-28 21:42:55 CST`
> **版本记录**：
> | 版本 | 时间 | 修改人 | 变更摘要 |
> |------|------|--------|----------|
> | v1.0 | `2026-04-28 21:42:55` | AI Assistant | 初始版本，基于功能设计_v0 §七 7.3 + 技术栈 §4.12 + ADR-005 + 已有 RingBuffer/useDataStore/SIM-01 Worker 兼容 |

> **冲突核查指引**：本版本与已有 `RingBuffer<T>`（6000 容量，O(1) at/索引）、`useDataStore`（replayTime/isReplaying/forkActive）、SIM-01 v2.1 Worker 协议（init/reset/updateParams/setDirection）、DAT-01 `FullSnapshot` 类型兼容。若上游接口变更，以时间戳更新的版本为准。

---

### 所属模块与溯源

- **对应总设计章节**：功能设计_v0 §七 7.3「回放与分叉」；技术栈设计 §2 #22（轨迹环形缓冲 RingBuffer）、§3.1 架构分层图（TimeAxis → RingBuf）、§4.12「快照与历史回放」、ADR-005（固定容量环形缓冲区决策）；功能模块全拆解 §六 DAT-03
- **依赖的其他功能模块**：
  - `SIM-01`（双摆物理引擎）— 提供 `RingBuffer<StateVector>`（轨迹历史数据源，O(1) 按时间索引）、Worker 实例（分叉时需创建独立 Worker 或 reset 主 Worker）、Worker 命令协议（`init`/`reset`/`updateParams`/`setDirection`）
  - `EXP-01`（3D 仿真场景）— 提供 3D 场景渲染，时间轴回溯时需更新摆体姿态到历史状态；分叉后需叠加渲染原始轨迹（半透明）
  - `EXP-02`（运动尾迹渲染）— 分叉后原始轨迹以"幽灵尾迹"模式渲染（固定颜色 + 半透明），与当前尾迹区分
  - `SIM-02`（参数控制面板）— 分叉前用户可修改参数（阻尼、重力等），修改后的参数传给新分叉
- **被依赖模块**：DAT-01（状态快照 — 快照恢复后可能进入回放模式）；STY-01（故事脚本引擎 — 故事模式可能使用回放功能展示特定历史时刻）

### 已有设计兼容性分析

- **已审查的相关规格文档**：
  - `SIM-01-双摆物理引擎.md` v2.1：Worker 命令协议（`WorkerInitCommand`/`WorkerResetCommand`/`WorkerUpdateParamsCommand`/`WorkerSetDirectionCommand`）、`PendulumParams`（6 字段）、StateVector `[θ₁, θ̇₁, θ₂, θ̇₂]`、`RingBuffer<StateVector>` 容量 6000、ADR-005 环形缓冲区决策
  - `DAT-01-状态快照.md` v1.0：`FullSnapshot` 类型（`SnapshotParams`/`SnapshotStateVector`/`SnapshotInitialConditions`），分叉状态可保存为快照供对比
  - `EXP-02-运动尾迹渲染.md` v1.0：`TrailPoint` 类型（position: Vector3, velocity: number）、`RingBuffer<TrailPoint>`、尾迹持久度 `TrailPersistence`
  - `功能模块全拆解.md` 附录 C：EXP-05 与 SIM-01 边界（时间反演依赖 -dt 接口，回放依赖 RingBuffer 索引）
  - `双摆混沌实验室-技术栈设计.md` v1.2：§4.12 分叉执行流程（`ringBuffer.at(t)` → `new Worker({ initialParams: forkState })`）、ADR-005（6000 容量 = 100s @60fps）
- **兼容性结论**：
  - `RingBuffer.at(index)` 已有 O(1) 实现（`src/features/data/ring-buffer/ring-buffer.ts`），直接用作时间轴数据源
  - 已有 `useDataStore` 包含 `replayTime`/`isReplaying`/`forkActive` 字段，本规格在此基础上扩展完整的状态机和派生状态
  - SIM-01 Worker 的 `reset` 命令接受 `initialConditions`（StateVector 格式），分叉时用 `ringBuffer.at(t)` 的结果作为 `initialConditions` 传入，接口完全兼容
  - 分叉后的原始轨迹叠加需要 EXP-02 支持"幽灵尾迹"模式（固定颜色 + 半透明 + 不随仿真更新）。本规格定义此需求为新增契约，EXP-02 实现时需提供 `setGhostTrail(points: TrailPoint[]): void` 方法
  - **无冲突**。本规格在已有 RingBuffer/Worker/Store 基础上新增时间轴 UI 和分叉编排逻辑
- **复用的已有定义**：`RingBuffer<T>`（`at(index)`/`toArray()`/`length`/`capacity`/`clear()`）、`useDataStore.replayTime`/`isReplaying`/`forkActive`、SIM-01 `WorkerResetCommand`/`WorkerUpdateParamsCommand`、`PendulumParams`/StateVector、`TrailPoint`（EXP-02）

---

### 技术栈绑定

- **必须使用**：
  - `react@^18.3.1` — UI 框架
  - `zustand@^4.5.5` — 回放与分叉状态管理，扩展 `useDataStore`
  - `tailwindcss@^3.4.16` — 时间轴面板布局
  - `shadcn/ui`（Copy 模式）— `Slider`（时间轴拖拽回溯）、`Button`（分叉/取消分叉/播放/暂停按钮）、`Badge`（分叉状态指示）、`Tooltip`（Slider 悬浮显示精确时间和状态值）、`Dialog`（分叉确认弹窗）、`Separator`（时间轴与控制按钮分隔）
  - `lucide-react` — `GitBranch`（分叉图标）、`Undo2`（撤销分叉/返回图标）、`Play`/`Pause`（播放/暂停）、`SkipBack`（跳回起点）、`SkipForward`（跳回当前）
  - `RingBuffer<StateVector>`（`src/features/data/ring-buffer/ring-buffer.ts`）— 时间轴数据源，O(1) 按索引回溯
  - Web Worker API — 分叉时创建独立 Worker 实例或 reset 主 Worker
  - TypeScript 5.x — 全量类型安全
- **禁止使用**：
  - 禁止使用 `<input type="range">` 原生控件替代 shadcn/ui `Slider`（需统一交互风格、无障碍支持和 Tooltip 集成）
  - 禁止在时间轴拖拽过程中每帧都向 Worker 发送命令（应在拖拽结束时（`onValueCommit`）发送一次状态更新，减少 Worker 消息风暴）
  - 禁止分叉时直接复制主 Worker 的内部状态（Worker 内部 `_state` 不可访问；必须通过 `reset` 命令将 forkState 作为 initialConditions 传入）
  - 禁止在分叉后丢弃原始轨迹数据（必须先保存到"幽灵尾迹"缓冲区再执行 fork，顺序不可颠倒）
  - 禁止在非暂停状态下启用时间轴 Slider（仿真运行中 RingBuffer 持续写入，Sliver 位置与数据不一致，必须暂停后启用）

---

### 输入定义（精确类型）

#### 回放与分叉核心类型

```typescript
/**
 * 历史状态快照（从 RingBuffer 中还原的某一时刻的完整仿真状态）。
 * 与 SIM-01 Worker 的 StateVector [θ₁, θ̇₁, θ₂, θ̇₂] 兼容。
 */
interface HistoryFrame {
  /** 仿真时间 (s)。RingBuffer 中存储的 t 字段。示例：15.233 */
  t: number;
  /** 上摆角度 (rad)。示例：2.341 */
  theta1: number;
  /** 上摆角速度 (rad/s)。示例：-3.211 */
  theta1Dot: number;
  /** 下摆角度 (rad)。示例：-1.892 */
  theta2: number;
  /** 下摆角速度 (rad/s)。示例：5.674 */
  theta2Dot: number;
  /** 动能 (J)。示例：5.234 */
  kineticEnergy: number;
  /** 势能 (J)。示例：-4.567 */
  potentialEnergy: number;
  /** 总能量 (J)。示例：0.667 */
  totalEnergy: number;
}

/**
 * 回放模式状态枚举。
 */
type ReplayMode =
  | "inactive"   // 回放未激活（仿真运行中或未暂停）
  | "scrubbing"  // 用户正在拖拽时间轴（连续更新预览状态）
  | "preview"    // 用户已选择历史时刻，正在预览（松开 Slider 后保持在该历史帧）
  | "forked";    // 已从历史时刻分叉，新仿真正在运行，原始轨迹以幽灵模式显示

/**
 * 分叉操作配置。
 */
interface ForkConfig {
  /**
   * 分叉起始时间 (s)。RingBuffer 中对应的仿真时间。
   * 必须满足：0 <= forkTime <= currentSimTime
   * 示例：10.5
   */
  forkTime: number;

  /**
   * 分叉起始状态在 RingBuffer 中的帧索引。
   * 由 forkTime 通过 RingBuffer 查找得到。
   * 示例：630（10.5s × 60fps）
   */
  forkFrameIndex: number;

  /**
   * 分叉后的物理参数。
   * 用户可在分叉前修改参数（如改变阻尼），未修改的字段使用原参数值。
   * 示例：{ damping: 0.5 }（只改阻尼，其余保持原值）
   */
  modifiedParams: Partial<PendulumParams>;

  /**
   * 分叉后的初始条件（即 forkTime 时刻的状态向量）。
   * 从 RingBuffer.at(forkFrameIndex) 获取。
   */
  forkState: HistoryFrame;

  /**
   * 分叉创建时间戳 (ISO 8601)。
   * 用于 UI 中显示分叉创建时间。
   * 示例："2026-04-28T10:35:00.000Z"
   */
  createdAt: string;
}

/**
 * 幽灵尾迹配置。
 * 分叉后，原始轨迹从 forkTime 到当前仿真结束的部分以半透明渲染。
 */
interface GhostTrail {
  /** 原始轨迹点数组（从 forkTime 帧到 RingBuffer 末帧）。元素为下摆球的 3D 坐标 */
  points: TrailPoint[];
  /** 幽灵尾迹颜色。固定为白色半透明 rgba(255, 255, 255, 0.3) */
  color: "rgba(255, 255, 255, 0.3)";
  /** 幽灵尾迹线宽 (px)。固定为 1.0，比活跃尾迹细 */
  lineWidth: 1.0;
  /** 幽灵尾迹创建时的分叉时间 (s) */
  forkTime: number;
  /** 幽灵尾迹创建时的原始仿真总时间 (s) */
  originalSimTime: number;
}
```

#### Store 类型扩展

扩展已有 `useDataStore`（`src/features/data/store.ts`），新增以下字段：

```typescript
/**
 * useDataStore 扩展后的回放与分叉相关状态。
 * 下划线标注的字段为已有字段（保持不变），其余为新增。
 */
interface DataStateReplayExtended {
  // === 已有字段（保持不变） ===
  snapshots: { id: string; label: string; timestamp: string }[];
  replayTime: number;            // 当前回放时间 (s)。已有字段，语义不变
  isReplaying: boolean;           // 是否处于回放预览状态。已有字段，语义精化为 ReplayMode !== "inactive"
  forkActive: boolean;            // 是否处于分叉运行状态。已有字段，语义精化为 ReplayMode === "forked"
  setSnapshots: (snapshots: DataStateReplayExtended["snapshots"]) => void;
  setReplayTime: (t: number) => void;
  setReplaying: (replaying: boolean) => void;
  setForkActive: (active: boolean) => void;

  // === 新增：回放控制 ===
  /** 当前回放模式 */
  replayMode: ReplayMode;
  /** RingBuffer 中的总帧数（由仿真运行时持续更新）。0 表示无历史数据 */
  totalHistoryFrames: number;
  /** RingBuffer 中的最大仿真时间 (s)。0 表示无历史数据 */
  maxHistoryTime: number;
  /** 当前 Slider 显示的仿真时间 (s)。拖拽中实时更新，提交后同步到 replayTime */
  sliderTime: number;

  // === 新增：分叉状态 ===
  /** 当前活跃的分叉配置。null 表示无分叉 */
  activeFork: ForkConfig | null;
  /** 幽灵尾迹数据。null 表示无幽灵尾迹 */
  ghostTrail: GhostTrail | null;
  /** 分叉历史记录（用于 UI 展示分叉来源信息）。最多保留 5 条 */
  forkHistory: ForkConfig[];

  // === 新增 actions ===
  /** 进入回放模式（仿真暂停后自动调用） */
  enterReplayMode: () => void;
  /** 退出回放模式（恢复仿真运行后自动调用） */
  exitReplayMode: () => void;
  /** 时间轴 Slider 拖拽中（实时更新预览） */
  onSliderChange: (time: number) => void;
  /** 时间轴 Slider 拖拽结束（提交最终位置） */
  onSliderCommit: (time: number) => void;
  /** 从指定时间分叉 */
  initiateFork: (config: ForkConfig) => Promise<void>;
  /** 取消分叉，恢复到原始仿真 */
  cancelFork: () => Promise<void>;
  /** 更新 totalHistoryFrames 和 maxHistoryTime（每批次 batchReady 后由 SIM-01 消费循环调用） */
  updateHistoryBounds: (totalFrames: number, maxTime: number) => void;
  /** 保存幽灵尾迹（分叉时由 DAT-03 调用） */
  setGhostTrail: (trail: GhostTrail | null) => void;
}
```

---

### 输出定义（精确类型）

```typescript
/**
 * 回放操作结果。
 */
interface ReplayResult {
  /** 是否成功 */
  success: boolean;
  /** 当前回放模式 */
  replayMode: ReplayMode;
  /** 失败时的错误消息。成功时为 null */
  error: string | null;
}

/**
 * 分叉操作结果。
 */
interface ForkResult {
  /** 是否成功 */
  success: boolean;
  /** 成功时返回分叉配置。失败时为 null */
  forkConfig: ForkConfig | null;
  /** 失败时的错误消息。成功时为 null */
  error: string | null;
  /** 失败时的错误分类 */
  errorCode:
    | "NO_HISTORY"          // 无历史数据（RingBuffer 为空）
    | "INVALID_FORK_TIME"   // 分叉时间超出有效范围
    | "WORKER_RESET_FAILED" // Worker reset 命令失败
    | "TRAIL_SAVE_FAILED"   // 原始轨迹保存失败
    | null;
}

/**
 * 取消分叉操作结果。
 */
interface CancelForkResult {
  /** 是否成功 */
  success: boolean;
  /** 失败时的错误消息。成功时为 null */
  error: string | null;
}
```

---

### 核心逻辑步骤

#### 步骤 1：进入回放模式

- **操作对象**：`useDataStore` 中的回放状态 + 仿真暂停状态
- **具体操作**：
  1. **前置条件检查**：仿真必须处于暂停状态（`useSimulationStore.isRunning === false`）。若仿真正在运行 → 不进入回放模式，`ReplayResult { success: false, replayMode: "inactive", error: "请先暂停仿真" }`
  2. **检查历史数据**：读取 `RingBuffer.length`。若 `length === 0` → `ReplayResult { success: false, replayMode: "inactive", error: "暂无仿真历史数据" }`
  3. **更新历史边界**：`totalHistoryFrames = RingBuffer.length`，`maxHistoryTime = RingBuffer.at(length - 1)?.t ?? 0`
  4. **初始化 Slider 位置**：`sliderTime = maxHistoryTime`（默认定位到最新时刻，即当前暂停时的状态）
  5. **设置回放状态**：`replayMode = "preview"`，`replayTime = maxHistoryTime`，`isReplaying = true`
  6. **启用时间轴 UI**：`HistoryTimeline` 组件的 Slider 变为可交互状态（`disabled === false`），范围 `[0, maxHistoryTime]`
  7. **返回结果**：`ReplayResult { success: true, replayMode: "preview", error: null }`
- **输入来源**：用户暂停仿真（点击暂停按钮或按空格键）→ `useSimulationStore.isRunning === false` → `useDataStore.enterReplayMode()` 自动调用
- **输出去向**：`useDataStore` 状态更新 → `HistoryTimeline` 组件显示时间轴 Slider
- **失败行为**：
  - RingBuffer 为空 → Slider 保持禁用态，灰色显示 "无历史数据"

#### 步骤 2：时间轴拖拽回溯

- **操作对象**：shadcn/ui `Slider` 组件 + RingBuffer + 3D 场景中的摆体姿态
- **具体操作**：
  1. **Slider 配置**：
     - `min = 0`
     - `max = maxHistoryTime`
     - `step = 1/60`（≈ 0.0167，单帧步长），实际 UI 中 step 为 `1/30`（≈ 0.0333，每 2 帧一步，避免 Slider 粒度过细无法操作）
     - `value = [sliderTime]`
     - `onValueChange = (vals) => onSliderChange(vals[0])`
     - `onValueCommit = (vals) => onSliderCommit(vals[0])`
  2. **拖拽中 — `onSliderChange(time)`**：实时更新预览
     a. `sliderTime = time`
     b. 在 RingBuffer 中查找最接近 `time` 的帧：`frameIndex = Math.round(time * 60)`（clamp 到 `[0, length - 1]`）
     c. 读取该帧的 `HistoryFrame`：`ringBuffer.at(frameIndex)`
     d. 将历史状态写入 `useSimulationStore` 的渲染字段（`theta1/theta1Dot/theta2/theta2Dot/x1/y1/x2/y2`）— 仅用于 3D 场景临时预览，不影响 Worker 状态
     e. 3D 场景中摆体姿态更新为历史状态（摆杆旋转角、摆球位置随之更新）
     f. 时间轴 Tooltip 显示当前时间和关键状态值（`θ₁=xxx°, θ₂=xxx°`，角度自动转为度显示）
  3. **拖拽结束 — `onSliderCommit(time)`**：
     a. `replayTime = time`（提交最终位置）
     b. `sliderTime = time`
     c. 同步骤 2d，更新 3D 场景预览
     d. 若之前处于 `"scrubbing"` → 切换为 `"preview"`
  4. **Tooltip 内容**：Sliver 滑块上方显示：
     ```
     t = 15.23s
     θ₁ = 134.2°  θ̇₁ = -3.21 rad/s
     θ₂ = -108.4°  θ̇₂ = 5.67 rad/s
     E = 0.667 J
     ```
- **输入来源**：用户拖拽 `HistoryTimeline` 中的 Slider
- **输出去向**：3D 场景实时更新预览 → 用户可观察历史状态下的摆体姿态
- **失败行为**：
  - `ringBuffer.at(frameIndex)` 返回 `undefined`（索引越界）→ 忽略此次更新，保持上一次有效预览状态
  - 历史帧包含 NaN → 跳过该帧，自动吸附到最近的有效帧（向前或向后搜索最多 10 帧）

#### 步骤 3：退出回放模式（恢复仿真）

- **操作对象**：`useDataStore` 回放状态 + 3D 场景
- **具体操作**：
  1. **触发条件**：用户点击播放按钮（恢复仿真运行）
  2. **设置回放状态**：`replayMode = "inactive"`，`isReplaying = false`
  3. **恢复 3D 场景**：不再向 `useSimulationStore` 写入历史帧数据，Worker 的下一次 `batchReady` 自动覆盖渲染字段，3D 场景恢复到当前仿真状态
  4. **禁用 Slider**：`HistoryTimeline` 的 Slider 变为禁用态（灰色）
  5. **保留 Slider 位置**：`sliderTime` 和 `replayTime` 保持原值（用户下次暂停时 Slider 仍在之前浏览的位置）
- **输入来源**：用户点击播放按钮
- **输出去向**：仿真恢复正常运行
- **失败行为**：无（此操作为状态切换，不涉及 I/O）

#### 步骤 4：从历史时刻分叉

- **操作对象**：RingBuffer 历史数据 + 主 Worker 实例 + 3D 场景尾迹
- **具体操作**：
  1. **前置条件检查**：
     - `replayMode === "preview"`（用户已选择历史时刻）。若为 `"inactive"` 或 `"scrubbing"` → 不允许分叉，按钮置灰
     - `forkActive === false`（无已有活跃分叉）。若已有分叉 → 需先取消当前分叉（步骤 5）
     - `RingBuffer.length > 0`
  2. **确定分叉帧**：`forkTime = replayTime`，`forkFrameIndex = Math.round(forkTime * 60)`，clamp 到 `[0, RingBuffer.length - 1]`
  3. **获取分叉状态**：`forkState = ringBuffer.at(forkFrameIndex)`。若返回 `undefined` → `ForkResult { success: false, errorCode: "INVALID_FORK_TIME" }`
  4. **打开分叉确认 Dialog**：
     - 标题："从 t = {forkTime.toFixed(2)}s 分叉演化"
     - 内容：显示分叉时刻的状态向量（θ₁/θ₂/θ̇₁/θ̇₂ 转为度显示）、当前参数表、可选参数修改区（提供 `damping` 和 `g` 的快速修改滑块——最可能改变的两项）
     - 按钮："确认分叉"（主按钮）、"取消"
  5. **用户确认后 — 保存原始轨迹为幽灵尾迹**：
     a. 从 RingBuffer 中提取 `[forkFrameIndex, RingBuffer.length - 1]` 范围的所有帧
     b. 对每帧：根据 `theta1/theta2/L1/L2` 计算下摆球 3D 坐标（复用 SIM-01 `computeDerived` 公式：`x2 = L1*sin(θ₁) + L2*sin(θ₂)`, `y2 = -L1*cos(θ₁) - L2*cos(θ₂)`）
     c. 构建 `TrailPoint[]`（`position: Vector3(x2, y2, 0)`, `velocity: L2 * |theta2Dot|`）
     d. 保存为 `GhostTrail { points, color: "rgba(255, 255, 255, 0.3)", lineWidth: 1.0, forkTime, originalSimTime: maxHistoryTime }`
     e. `useDataStore.setGhostTrail(ghostTrail)`
  6. **构建分叉配置**：`ForkConfig { forkTime, forkFrameIndex, modifiedParams, forkState, createdAt: new Date().toISOString() }`
  7. **向 Worker 发送命令**：
     a. 若有修改参数 → `worker.postMessage({ type: "updateParams", params: modifiedParams })`
     b. `worker.postMessage({ type: "reset", initialConditions: { theta1: forkState.theta1, theta1Dot: forkState.theta1Dot, theta2: forkState.theta2, theta2Dot: forkState.theta2Dot } })`
     c. 等待 Worker 回复 `ready`
  8. **分叉后自动运行**：Worker 收到 `ready` 后，发送 `step` 命令开始批量积分（或由用户手动点击播放）
  9. **更新 Store**：
     - `forkActive = true`，`replayMode = "forked"`
     - `activeFork = forkConfig`
     - `forkHistory.push(forkConfig)`（超过 5 条时 shift 最旧记录）
     - `isReplaying = false`
  10. **通知 EXP-02**：调用 `useTrailBuffer.loadGhostTrail(ghostTrail.points)`（本规格要求 EXP-02 新增此方法），幽灵尾迹以半透明白色渲染
  11. **返回结果**：`ForkResult { success: true, forkConfig, error: null }`
- **输入来源**：用户在回放预览模式下点击"从此分叉"按钮 → 确认 Dialog → 确认
- **输出去向**：Worker 状态重置 → 3D 场景显示新初始条件 + 幽灵尾迹叠加 → 新仿真开始演化
- **失败行为**：
  - `ringBuffer.at()` 返回 undefined → `ForkResult { success: false, errorCode: "INVALID_FORK_TIME", error: "所选时刻的历史数据已失效" }`
  - Worker `reset` 命令超时（2s 无 `ready`）→ `ForkResult { success: false, errorCode: "WORKER_RESET_FAILED", error: "仿真引擎无响应，无法分叉" }`
  - 幽灵尾迹保存时 RingBuffer 数据异常 → `ForkResult { success: false, errorCode: "TRAIL_SAVE_FAILED" }`，不执行分叉

#### 步骤 5：取消分叉

- **操作对象**：主 Worker 实例 + 3D 场景 + 幽灵尾迹
- **具体操作**：
  1. **暂停仿真**：若 `isRunning === true` → 发送暂停信号
  2. **恢复原始参数**：`worker.postMessage({ type: "updateParams", params: activeFork 之前的原始参数 })`（需要在分叉前保存原始参数到 store 中）
  3. **恢复到分叉前的仿真状态**：从 RingBuffer 最后一帧（即当前仿真最新状态... 但分叉后 RingBuffer 已被清空或覆盖）—— **关键设计**：分叉前必须保存原始仿真的最后一个状态和参数。此数据保存在 `activeFork` 中或独立字段 `preForkState`
  4. **清除幽灵尾迹**：`useDataStore.setGhostTrail(null)`，通知 EXP-02 清除幽灵尾迹渲染
  5. **清除分叉状态**：`forkActive = false`，`replayMode = "inactive"`，`activeFork = null`
  6. **重置 Worker**：用分叉前的原始参数和最近有效状态（从保存的 `preForkState` 中恢复）发送 `reset`
  7. **返回结果**：`CancelForkResult { success: true }`
- **输入来源**：用户点击"取消分叉"按钮
- **输出去向**：仿真恢复到分叉前状态，幽灵尾迹消失
- **失败行为**：
  - `preForkState` 丢失（异常情况）→ `CancelForkResult { success: false, error: "无法恢复原始仿真状态，请刷新页面" }`

#### 步骤 6：分叉前参数修改

- **操作对象**：分叉确认 Dialog 中的参数修改区
- **具体操作**：
  1. **Dialog 中展示当前参数**：从 `useSimulationStore.getState().params` 读取，以只读文本显示
  2. **可修改参数**：提供 3 个快速修改项：
     - `damping`：Slider 范围 `[0, 2.0]`，步长 0.01，默认显示当前值
     - `g`：Slider 范围 `[0, 20.0]`，步长 0.1，默认显示 9.81
     - `method`：Select 下拉 `"RK4" | "VelocityVerlet" | "Euler"`，默认显示当前方法
  3. **修改即时生效**：用户拖动 Slider → `modifiedParams` 更新，不影响当前运行的仿真（仅在分叉确认后生效）
  4. **"为什么修改这个？"提示**：每个参数旁有 Tooltip 说明修改的影响——阻尼："增大阻尼使系统更快稳定，观察混沌如何被抑制"；重力："改变重力等效于改变时间尺度"
- **输入来源**：用户在分叉确认 Dialog 中修改参数
- **输出去向**：`ForkConfig.modifiedParams`，在步骤 4 确认分叉时传给 Worker
- **失败行为**：参数非法（如 `damping < 0`）→ 输入框红框 + Tooltip，阻止确认按钮

---

### 依赖与集成接口

| 依赖方 | 具体接口 | 用途 |
|--------|----------|------|
| `RingBuffer<StateVector>` | `.at(index): StateVector \| undefined` | 时间轴回溯：O(1) 按索引读取历史帧 |
| `RingBuffer<StateVector>` | `.length: number` | 确定 Slider 范围和总帧数 |
| `RingBuffer<StateVector>` | `.toArray(): StateVector[]` | 幽灵尾迹构建：提取 `[forkFrameIndex, end]` 范围的帧序列 |
| SIM-01 Worker | `postMessage({ type: "reset", initialConditions })` | 分叉时重置 Worker 到历史状态 |
| SIM-01 Worker | `postMessage({ type: "updateParams", params })` | 分叉时应用修改后的参数 |
| `useSimulationStore` | `.getState()` 读取 `isRunning`/`params`/`method`；`.setState()` 写入渲染字段（步骤 2 预览） | 判断仿真状态、获取当前参数、临时写入历史预览状态 |
| `useDataStore` | 本模块 store（扩展已有字段） | 回放模式/分叉状态/Slider 位置/幽灵尾迹管理 |
| EXP-02 `useTrailBuffer` | `loadGhostTrail(points: TrailPoint[]): void`（本规格要求新增） | 分叉后加载幽灵尾迹（半透明白色固定线） |
| EXP-02 `useTrailBuffer` | `clearGhostTrail(): void`（本规格要求新增） | 取消分叉时清除幽灵尾迹 |
| SIM-01 `computeDerived` | 坐标计算公式：`x2 = L1*sin(θ₁) + L2*sin(θ₂)`, `y2 = -L1*cos(θ₁) - L2*cos(θ₂)` | 幽灵尾迹构建时从 StateVector 转为 3D 坐标 |
| shadcn/ui `Slider` | `<Slider min={0} max={maxHistoryTime} step={1/30} value={[sliderTime]} onValueChange onValueCommit />` | 时间轴拖拽 UI |
| shadcn/ui `Dialog` | `<Dialog>` / `<DialogContent>` / `<DialogHeader>` | 分叉确认弹窗（参数修改区 + 状态展示） |
| shadcn/ui `Tooltip` | `<Tooltip>` | Slider 悬浮显示历史时间和状态值 |
| `requestAnimationFrame` | 原生 API | 回放模式下仍保持 rAF 循环以更新 3D 场景（但不发送 `step` 命令） |

**本模块对外暴露的公共接口**（`src/features/data/index.ts` 中补充）：

| 导出项 | 类型 | 用途 |
|--------|------|------|
| `HistoryTimeline` | React 组件 | 时间轴 Slider 组件（含播放/暂停/分叉/取消分叉按钮） |
| `enterReplayMode()` | function → `ReplayResult` | 进入回放模式 |
| `exitReplayMode()` | function → `ReplayResult` | 退出回放模式 |
| `initiateFork(config: ForkConfig)` | async function → `ForkResult` | 执行分叉 |
| `cancelFork()` | async function → `CancelForkResult` | 取消分叉 |
| `ReplayMode` | type | 回放模式枚举 |
| `HistoryFrame` | type | 历史帧类型 |
| `ForkConfig` | type | 分叉配置类型 |
| `GhostTrail` | type | 幽灵尾迹类型 |

---

### 状态机

#### 回放模式状态转换

| 当前状态 | 触发事件 | 下一状态 | 前置条件 | 副作用 |
|----------|----------|----------|----------|--------|
| `inactive` | 用户暂停仿真（`isRunning → false`）且 `RingBuffer.length > 0` | `preview` | 仿真已初始化，有历史数据 | `replayTime = maxHistoryTime`；`isReplaying = true`；Slider 启用，位置在最右端（当前时刻） |
| `inactive` | 用户暂停仿真且 `RingBuffer.length === 0` | `inactive` | — | Slider 保持禁用，显示"无历史数据" |
| `preview` | 用户开始拖拽 Slider | `scrubbing` | — | 3D 场景实时更新预览；Tooltip 显示历史状态 |
| `scrubbing` | 用户松开 Slider（`onValueCommit`） | `preview` | — | `replayTime` 提交；预览状态保留在最后拖拽位置 |
| `preview` | 用户点击播放按钮 | `inactive` | — | 退出回放；`isReplaying = false`；3D 场景恢复到当前仿真状态；Slider 禁用 |
| `scrubbing` | 用户点击播放按钮 | `inactive` | — | 同上；放弃拖拽中的预览位置，恢复到当前仿真状态 |
| `preview` | 用户点击"从此分叉" → 确认 | `forked` | `forkActive === false`；`ringBuffer.at(forkFrameIndex)` 有效 | 保存幽灵尾迹；Worker reset 到分叉状态；`forkActive = true`；分叉后自动运行仿真 |
| `preview` | 用户点击"从此分叉" → Dialog 中取消 | `preview` | — | 无变化 |
| `forked` | 用户点击"取消分叉" → 确认 | `inactive` | `preForkState` 已保存 | 清除幽灵尾迹；Worker reset 回原始状态；`forkActive = false`；`activeFork = null` |
| `forked` | 用户暂停仿真 | `preview` | 分叉后的仿真有历史数据 | 同 `inactive → preview`，但 `forkActive` 保持 `true`，幽灵尾迹保持显示 |
| `forked` | 用户再次分叉（从已分叉状态） | `forked`（新分叉覆盖旧分叉） | 用户确认 | 旧幽灵尾迹被新幽灵尾迹替换；`forkHistory` 追加旧分叉记录；Worker 再次 reset |

#### 分叉生命周期状态

| 当前状态 | 触发事件 | 下一状态 | 前置条件 | 副作用 |
|----------|----------|----------|----------|--------|
| `no_fork` | 用户确认分叉 | `forking` | 回放模式为 preview，forkTime 有效 | 开始保存幽灵尾迹 |
| `forking` | 幽灵尾迹保存成功 + Worker reset 成功 | `fork_active` | — | `forkActive = true`；3D 场景显示幽灵尾迹；新仿真开始 |
| `forking` | 幽灵尾迹保存失败 | `no_fork` | — | 显示错误；不执行分叉 |
| `forking` | Worker reset 超时 | `no_fork` | — | 显示错误；幽灵尾迹已保存但无 Worker 运行 → 清除幽灵尾迹 |
| `fork_active` | 用户取消分叉 | `cancelling` | — | 暂停仿真 |
| `cancelling` | preForkState 恢复成功 | `no_fork` | — | `forkActive = false`；幽灵尾迹清除；Worker 恢复原始状态 |
| `cancelling` | preForkState 丢失 | `no_fork`（异常恢复） | — | `forkActive = false`；显示错误提示；建议刷新页面 |

---

### 异常与边界条件

#### 异常 1：RingBuffer 为空时尝试进入回放

- **触发条件**：仿真刚初始化（Worker 已 `ready` 但尚未产生任何帧），或 RingBuffer 刚被清空（reset 后），用户暂停仿真
- **处理策略**：
  1. `enterReplayMode()` 检测 `RingBuffer.length === 0`
  2. 返回 `ReplayResult { success: false, replayMode: "inactive", error: "暂无仿真历史数据" }`
  3. `HistoryTimeline` Slider 保持禁用态（`disabled={true}`），显示占位文字 "运行仿真以生成历史数据"
  4. 用户点击播放恢复仿真 → 等待数据积累
- **重试参数**：不自动重试。下一帧到达后 `RingBuffer.length > 0` 自动满足，下次暂停时自动进入回放。

#### 异常 2：Slider 拖拽帧索引越界

- **触发条件**：`sliderTime` 计算的 `frameIndex = Math.round(time * 60)` 超出 `[0, RingBuffer.length - 1]`。可能原因：浮点精度导致 `time > maxHistoryTime`，或仿真刚 reset 但 Slider 位置未更新
- **处理策略**：
  1. `onSliderChange` 中 clamp：`frameIndex = Math.min(Math.max(0, Math.round(time * 60)), RingBuffer.length - 1)`
  2. 若 `ringBuffer.at(frameIndex)` 返回 `undefined`（双重保险）→ 向前搜索最近的有效帧（`frameIndex - 1, frameIndex - 2, ...`，最多搜索 10 帧）
  3. 若 10 帧内无有效数据 → 保持当前预览状态不变，Tooltip 显示 "数据不可用"
- **重试参数**：每次 `onSliderChange` 自动 clamp，无需人工介入。

#### 异常 3：RingBuffer 中历史帧包含 NaN

- **触发条件**：仿真历史中某帧因积分数值问题含 NaN（虽 SIM-01 应已过滤，但 RingBuffer 可能因竞态条件存储了异常帧）
- **处理策略**：
  1. `onSliderChange` 读取 `ringBuffer.at(frameIndex)` 后检查：`isNaN(frame.theta1) || isNaN(frame.theta2)`
  2. 若为 NaN → 跳过该帧，自动吸附到最近的有效帧：
     - 向前搜索（`frameIndex - 1, -2, ...`）和向后搜索（`frameIndex + 1, +2, ...`）交替进行
     - 最多搜索 10 帧（~0.17s）
     - 找到有效帧 → 更新预览
     - 未找到 → 保持上次有效预览
  3. Slider 位置不因吸附而改变（用户看到的 Slider 位置不变，但 Tooltip 显示的是吸附后的帧时间）
- **重试参数**：每次 Slider 移动自动处理。

#### 异常 4：分叉后 Worker 无响应

- **触发条件**：发送 `reset` 命令后 2 秒内未收到 `ready`
- **处理策略**：
  1. 2 秒超时 → `ForkResult { success: false, errorCode: "WORKER_RESET_FAILED", error: "仿真引擎无响应，分叉失败" }`
  2. 清除已保存的幽灵尾迹（`setGhostTrail(null)`）
  3. 恢复 `replayMode = "preview"`（保持回放状态，用户可以重试）
  4. UI Dialog 显示错误："分叉失败：仿真引擎无响应。请稍后重试。"
- **重试参数**：不自动重试。用户手动重新点击"从此分叉"。

#### 异常 5：幽灵尾迹数据过大导致性能下降

- **触发条件**：分叉时间很早（如 `forkTime = 5s`），原始仿真已运行 80 秒，幽灵尾迹包含 4500 个点。在 3D 场景中渲染 4500 个点半透明 Line 可能导致帧率下降
- **处理策略**：
  1. 幽灵尾迹点数 > 2000 时，自动降采样：每隔 N 个点取 1 个（`stride = ceil(points.length / 2000)`），降采样到 ≤ 2000 点
  2. 降采样后仍保留首尾两点以确保尾迹起点和终点可见
  3. 不通知用户（这是渲染优化，非功能性降级）
- **重试参数**：自动执行。

#### 异常 6：分叉前参数修改导致非法参数

- **触发条件**：用户在分叉确认 Dialog 中将 `g` 设为负数（Slider 范围外的值通过手动输入框输入）、或 `damping < 0`
- **处理策略**：
  1. 确认按钮点击时校验 `modifiedParams`：`g >= 0`，`damping >= 0`，`m1/m2/L1/L2 > 0`（如果修改了这些）
  2. 校验失败 → 阻止 Dialog 关闭，违规参数输入框红框 + Tooltip 提示最小值
  3. `method` 不在 `["RK4", "VelocityVerlet", "Euler"]` → 回退为当前方法
- **重试参数**：用户修正参数后重新点击确认。

---

### 原则兑现清单

| 原则来源 | 原则名称 | 代码级约束 |
|----------|----------|------------|
| 功能设计_v0 §七 7.3 | 暂停状态时间轴可拖拽回溯 | `HistoryTimeline` Slider 仅在 `isRunning === false` 时启用；拖拽实时更新 3D 场景预览 |
| 功能设计_v0 §七 7.3 | 从历史时刻分叉后修改参数继续演化 | 分叉确认 Dialog 提供 `damping`/`g`/`method` 修改；修改后的参数传给 Worker `updateParams` + `reset` |
| 功能设计_v0 §七 7.3 | 原轨迹以半透明保留作为对照 | `GhostTrail` 以 `rgba(255,255,255,0.3)` 半透明白色渲染，线宽 1.0（比活跃尾迹细） |
| 技术栈设计 ADR-005 | 固定容量环形缓冲区 6000 = 100s @60fps | `RingBuffer<StateVector>(6000)` 作为时间轴数据源；`maxHistoryTime` 取最后帧的 `t` |
| 技术栈设计 §4.12 | 分叉执行：`ringBuffer.at(t)` → `new Worker({ initialParams: forkState })` | 分叉流程严格遵循：at() 读取 → 构建 ForkConfig → Worker reset |
| 技术栈设计 §4.12 | 分叉后 RingBuffer 可 O(n) 切片克隆 | 幽灵尾迹构建使用 `toArray()` 复制 `[forkFrameIndex, end]` 范围的帧序列（不修改原 RingBuffer） |
| 核心原则（AGENT.md） | 逻辑层与表现层分离 | `HistoryTimeline` 组件仅渲染 Slider + 按钮；所有回放/分叉逻辑在 store actions 中实现 |
| 项目结构 §4.8 | `data/` Feature 内聚 | `HistoryTimeline` 组件在 `components/`；分叉编排逻辑在 store 或 hooks 中；幽灵尾迹管理在 store 中 |

---

### 验收测试场景

#### 正向测试 1：暂停后回溯历史并预览

- **Given**：
  ```json
  {
    "仿真状态": "已运行 30 秒，RingBuffer 中有 1800 帧数据",
    "当前参数": { "m1": 1.0, "m2": 1.0, "L1": 1.0, "L2": 1.0, "g": 9.81, "damping": 0.0 },
    "当前状态": "theta1=2.341, theta2=-1.892, simTime=30.0"
  }
  ```
- **When**：用户点击暂停 → 拖拽时间轴 Slider 到 t=15.0s 位置 → 松开
- **Then**：
  - `replayMode === "preview"`
  - `replayTime === 15.0`（±0.017s，一帧误差内）
  - 3D 场景中双摆姿态更新为 t=15.0s 时的历史状态（theta1/theta2 值与 RingBuffer 中第 900 帧一致）
  - Slider Tooltip 显示 `t = 15.00s, θ₁ = xxx°, θ₂ = xxx°`
  - 时间轴 Slider 位置在 50% 处（15s / 30s）
  - 尾迹显示截止到 t=15.0s 的状态（不显示 15s 之后的尾迹）
  - 点击播放 → 3D 场景恢复到 t=30.0s 的当前状态，Slider 禁用

#### 正向测试 2：分叉后修改参数并运行

- **Given**：
  ```json
  {
    "仿真状态": "已运行 20 秒，RingBuffer 中有 1200 帧",
    "当前参数": { "m1": 1.0, "m2": 1.0, "L1": 1.0, "L2": 1.0, "g": 9.81, "damping": 0.0 },
    "回放模式": "preview",
    "replayTime": 10.0,
    "分叉配置": { "modifiedParams": { "damping": 0.5 } }
  }
  ```
- **When**：用户在回放预览中点击"从此分叉" → 确认 Dialog 中设置 `damping=0.5` → 点击"确认分叉"
- **Then**：
  - `replayMode === "forked"`，`forkActive === true`
  - `activeFork.forkTime === 10.0`，`activeFork.modifiedParams.damping === 0.5`
  - Worker 收到 `updateParams({ damping: 0.5 })` 和 `reset({ theta1: forkState.theta1, ... })`
  - 3D 场景中双摆从 t=10.0s 的状态开始演化（初始姿态与 10s 时一致）
  - 3D 场景中叠加半透明白色幽灵尾迹（对应原始轨迹从 10s 到 20s 的部分）
  - 幽灵尾迹线宽 1.0，颜色 `rgba(255,255,255,0.3)`，不随仿真更新
  - 活跃尾迹（金色）从分叉点开始重新生长
  - 分叉后仿真能量呈衰减趋势（阻尼生效，`totalEnergy` 单调递减）
  - `forkHistory` 中包含此分叉记录

#### 正向测试 3：取消分叉恢复原始仿真

- **Given**：
  ```json
  {
    "分叉状态": "活跃中（forked），forkTime=10.0, damping=0.5",
    "预分叉原始状态": "原始 damping=0.0，原始仿真在 t=30s 处暂停"
  }
  ```
- **When**：用户点击"取消分叉"按钮 → 确认弹窗中点击"确认"
- **Then**：
  - `replayMode === "inactive"`，`forkActive === false`，`activeFork === null`
  - 幽灵尾迹从 3D 场景中移除
  - Worker 参数恢复为 `damping=0.0`
  - Worker 状态恢复到分叉前的仿真状态点
  - 3D 场景无幽灵尾迹叠加
  - `forkHistory` 仍保留已取消的分叉记录（作为历史参考）

#### 异常测试 1：无历史数据时回放不可用

- **Given**：应用刚启动，仿真尚未运行（`RingBuffer.length === 0`）
- **When**：用户点击暂停按钮（此时 `isRunning === false`）
- **Then**：
  - `replayMode === "inactive"`
  - `HistoryTimeline` Slider 显示为禁用态（灰显）
  - Slider 旁显示文字 "运行仿真以生成历史数据"
  - 用户无法拖拽 Slider
  - 用户点击播放 → 仿真正常运行

#### 异常测试 2：RingBuffer 中间帧含 NaN 时自动吸附

- **Given**：RingBuffer 有 1800 帧，其中第 900 帧 `theta1` 为 `NaN`（模拟异常帧）
- **When**：用户拖拽 Slider 恰好到 t≈15s（对应第 900 帧）位置
- **Then**：
  - 检测到第 900 帧 NaN → 自动吸附到第 899 帧或第 901 帧（最接近的有效帧）
  - 3D 场景显示吸附后的有效帧状态（不显示 NaN）
  - Slider 物理位置不变（用户仍看到 Slider 在 15s 附近），但 Tooltip 显示吸附后的精确时间（如 `t = 14.98s`）
  - 无报错，无 toast

#### 异常测试 3：分叉时 Worker 无响应

- **Given**：回放预览模式，`replayTime=10.0`，但 Worker 线程被模拟为卡死
- **When**：用户点击"确认分叉"
- **Then**：
  - 2 秒后返回 `ForkResult { success: false, errorCode: "WORKER_RESET_FAILED" }`
  - UI 显示 Dialog："分叉失败：仿真引擎无响应。请稍后重试。"
  - `replayMode` 保持 `"preview"`（未进入 `"forked"`）
  - `forkActive === false`
  - 幽灵尾迹被清除（不残留半透明数据）
  - 用户可以重新尝试分叉

#### 异常测试 4：分叉时参数校验失败

- **Given**：回放预览模式，用户打开分叉确认 Dialog
- **When**：用户在 `damping` 输入框中输入 `-0.5`（负值）→ 点击"确认分叉"
- **Then**：
  - 确认按钮被阻止，Dialog 不关闭
  - `damping` 输入框显示红框 + Tooltip："阻尼系数不能为负值"
  - 其他参数不变
  - 不向 Worker 发送任何命令
  - 用户将 `damping` 修改为 `0` → 红框消失 → 可正常确认分叉

---

### 注意事项与禁止行为

1. **【分叉前的状态保存】** 执行分叉前，必须先保存当前仿真完整状态（参数 + 最近帧 + RingBuffer 引用），存入 `preForkState`。若跳过此步骤，用户取消分叉时将无法恢复原始仿真，必须刷新页面。
2. **【幽灵尾迹坐标系】** 幽灵尾迹点从 StateVector 计算 3D 坐标时，Y 轴使用物理坐标系（向上为正）。与活跃尾迹（EXP-02 渲染）的坐标系一致。不经过额外的坐标翻转。
3. **【分叉后 RingBuffer 处理】** 分叉后 Worker `reset` 会清空 RingBuffer（SIM-01 的 reset 副作用）。分叉前必须完成幽灵尾迹的数据提取（`toArray()` 切片），不能在 reset 之后读取 RingBuffer（届时数据已清空）。
4. **【时间轴 Slider 防抖】** `onSliderChange`（拖拽中）每帧触发频率极高（~60Hz），但 3D 场景预览更新不需要如此高频。应限制预览更新频率为 30Hz（每 2 帧更新一次），避免不必要的主线程负载。`onSliderCommit` 无频率限制（仅触发一次）。
5. **【分叉历史上限】** `forkHistory` 最多保留 5 条分叉记录。超出后删除最旧记录（按 `createdAt` 升序，shift 第一条）。
6. **【禁止行为】** 禁止在仿真运行中（`isRunning === true`）启用时间轴 Slider。若用户拖拽 Slider 时 Worker 恰好返回新 batch，两者对 `useSimulationStore` 的写入会产生竞态。必须在暂停时才能启用 Slider。
7. **【禁止行为】** 禁止分叉后直接复用主 Worker 的 `_state` 引用。Worker 内部状态不可由主线程访问。分叉必须通过 Worker 消息协议（`reset` + `updateParams`）实现。
8. **【禁止行为】** 禁止在幽灵尾迹构建时修改 RingBuffer 内容。`toArray()` 返回新数组，不影响 RingBuffer 内部状态。
9. **【禁止行为】** 禁止在没有用户确认的情况下执行分叉。分叉会清空当前仿真状态（Worker reset），不可逆。必须通过 Dialog 获取用户明确确认。
10. **【易错点】** `onSliderChange` 中的 `frameIndex` 计算使用 `Math.round(time * 60)`。需确认 60 是 `FRAMES_PER_SECOND` 常量（来自 SIM-01 的 `dt = 1/60`），而非硬编码。建议从 SIM-01 导入或定义共享常量 `SIM_FPS = 60`。
11. **【易错点】** 幽灵尾迹与活跃尾迹的渲染顺序：活跃尾迹必须在幽灵尾迹之上渲染（z-order）。否则活跃尾迹会被半透明幽灵尾迹遮挡，用户无法区分。
12. **【易错点】** 取消分叉时，需要确保 `preForkState` 中的参数与分叉前完全一致。若用户分叉时修改了 `damping`，但取消分叉时只恢复了 `params` 而忘了恢复 `method`，会导致不一致。
13. **【偷懒红线】** `HistoryFrame` 的 8 个字段、`ForkConfig` 的 5 个字段、`GhostTrail` 的 5 个字段必须全部在类型定义中出现，不可省略"已有定义"的字段或使用 `& Partial<...>` 代替精确列举。时间轴 Tooltip 的内容格式必须精确到每个显示值的单位和精度。

---

*本文档由 AI 辅助生成，基于功能设计_v0 §七 7.3 + 技术栈设计 §4.12 + ADR-005 + 已有 RingBuffer/useDataStore/SIM-01 Worker 协议兼容。*
