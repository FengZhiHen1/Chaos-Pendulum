# 功能点：DAT-01 状态快照

> **文档生成时间**：`2026-04-28 21:23:48 CST`
> **版本记录**：
> | 版本 | 时间 | 修改人 | 变更摘要 |
> |------|------|--------|----------|
> | v1.0 | `2026-04-28 21:23:48` | AI Assistant | 初始版本，基于功能设计_v0 §七 7.1 + 技术栈 §4.12 + 已有 snapshot-db.ts / RingBuffer / dataStore 代码兼容 |

> **冲突核查指引**：本版本与已有 `src/features/data/snapshot/snapshot-db.ts`（v1, DB_VERSION=1）、`src/features/data/ring-buffer/ring-buffer.ts`（RingBuffer<T>）、`src/features/data/store.ts`（useDataStore）、`src/shared/types/app.ts`（SnapshotMeta）、SIM-01 v2.1 的 `PendulumParams` / StateVector 兼容。若上游类型变更，以时间戳更新的版本为准。

---

### 所属模块与溯源

- **对应总设计章节**：功能设计_v0 §七 7.1「状态快照」；技术栈设计 §2 #21（快照持久化 IndexedDB）、§3.1 架构分层图（Snapshot 层）、§4.12「快照与历史回放」；功能模块全拆解 §六 DAT-01
- **依赖的其他功能模块**：
  - `SIM-01`（双摆物理引擎）— 提供当前仿真状态（StateVector: `[θ₁, θ̇₁, θ₂, θ̇₂]`）、物理参数（`PendulumParams`）、仿真时间 `simTime`。快照保存时从 `useSimulationStore` 读取这些值
  - `EXP-02`（运动尾迹渲染）— 提供尾迹历史数据，快照保存时从 `useTrailBuffer` 的 `RingBuffer<TrailPoint>` 中读取当前全部尾迹点
  - `SIM-03`（全局导航系统）— 提供当前模式 `AppMode`，快照需记录保存时所在的模式
- **被依赖模块**：DAT-02（数据导出 — 可能引用快照 ID 作为导出源）、DAT-03（历史回放与分叉 — 可能从快照恢复状态后分叉）、STY-01（故事脚本引擎 — 故事脚本可能从预置快照启动特定场景）

### 已有设计兼容性分析

- **已审查的相关规格文档**：
  - `双摆混沌实验室-技术栈设计.md` v1.2：§2 #21 快照持久化 IndexedDB（键 `snapshot-{uuid}`）、§3.1 架构分层图（Snapshot 层）、§4.12 快照与历史回放、§5.4 快照 IndexedDB 存储规格（单条记录结构、容量估算、清理策略）
  - `双摆混沌实验室-项目结构.md` v1.0：§4.8 `features/data/` 目录结构（SnapshotManager.tsx、snapshot-db.ts、thumbnail.ts、store.ts）
  - `SIM-01-双摆物理引擎.md` v2.1：`PendulumParams`（6 字段）、StateVector `[θ₁, θ̇₁, θ₂, θ̇₂]`、被依赖声明
  - `EXP-02-运动尾迹渲染.md` v1.0：`TrailPoint` 类型（position: Vector3, velocity: number）、`RingBuffer<TrailPoint>` 使用
  - `功能模块全拆解.md`：DAT-01 模块定义及颗粒度描述
- **兼容性结论**：
  - 已有代码 `src/features/data/snapshot/snapshot-db.ts` 中 `Snapshot` 接口使用 `Record<string, number>` 作为 params 类型、`number[]` 作为 stateVector 和 trail 类型。本规格将其**精确化**为与 SIM-01 `PendulumParams` 一致的具名字段、`Float64Array` 的快照序列化形式。该变更向后兼容：`Record<string, number>` 可以容纳具名字段的值，`number[]` 可以容纳 Float64Array 转换后的数组。
  - 已有 `SnapshotMeta`（`src/shared/types/app.ts`）仅含 `id/timestamp/label/thumbnail` 四个展示用字段。本规格新增完整快照类型 `FullSnapshot`，`SnapshotMeta` 继续作为列表展示的轻量类型，两者无冲突。
  - 已有 `useDataStore` 仅含 `snapshots: {id, label, timestamp}[]` 数组。本规格扩展 store：增加 `selectedSnapshotIds`（双快照对比选择）、增加 `snapshotDiff`（对比结果派生状态）。现有字段保持不变，扩展不影响已有消费者。
  - 已有 `RingBuffer<T>`（容量 6000）作为尾迹历史数据源，快照保存时调用 `ringBuf.toArray()` 获取全量尾迹点，无冲突。
  - **无冲突**，本规格精准引用已有类型并在此基础上扩展。
- **复用的已有定义**：`PendulumParams`（SIM-01）、`StateVector = [θ₁, θ̇₁, θ₂, θ̇₂]`（SIM-01）、`TrailPoint`（EXP-02 v1.0）、`RingBuffer<T>`（data/ring-buffer/ring-buffer.ts）、`SnapshotMeta`（shared/types/app.ts）、`AppMode`（shared/types/app.ts）、`useSimulationStore`（simulation/store.ts）、`IndexedDB` 封装（shared/lib/cache/indexed-db.ts 的 `openDB`/`putStore`/`getStore`/`deleteStore`/`getAll`）

---

### 技术栈绑定

- **必须使用**：
  - `react@^18.3.1` — UI 组件封装（SnapshotManager、SnapshotCard、DiffTable、TrajectoryOverlay）
  - `zustand@^4.5.5` — 快照状态管理，扩展 `useDataStore`
  - `tailwindcss@^3.4.16` — 快照卡片网格布局、对比面板样式
  - `shadcn/ui`（Copy 模式）— `Card`（快照缩略卡片）、`Dialog`（快照详情/对比弹窗）、`Button`（保存/恢复/删除/对比按钮）、`Input`（快照标签编辑）、`Table`（参数差异表）、`Tooltip`（卡片悬浮详细信息）、`Badge`（模式标签）、`ScrollArea`（快照列表滚动）
  - `lucide-react` — `Camera`（快照图标）、`Save`（保存图标）、`Trash2`（删除图标）、`GitCompare`（对比图标）、`RotateCcw`（恢复图标）、`X`（关闭图标）
  - `canvas` API（`HTMLCanvasElement.toDataURL`）— 64px × 64px 缩略图生成
  - IndexedDB API（`indexedDB.open` / `transaction` / `objectStore`）— 快照持久化存储，复用 `src/shared/lib/cache/indexed-db.ts` 封装的 `openDB`/`putStore`/`getStore`/`deleteStore`/`getAll`
  - `uuid`（或 `crypto.randomUUID()`）— 快照唯一标识生成
  - TypeScript 5.x — 全量类型安全
- **禁止使用**：
  - 禁止使用 `localStorage` 存储快照（技术栈 §2 #21 明确使用 IndexedDB；localStorage 仅 5-10MB 且同步阻塞，无法存尾迹数组）
  - 禁止在保存快照时序列化整个 `RingBuffer` 为 JSON 再写入 IndexedDB（应先 `toArray()` 转为普通数组，再结构化克隆写入）
  - 禁止快照恢复时直接修改 `useSimulationStore` 的内部状态（必须通过 Worker `reset` 命令 + `updateParams` 命令恢复仿真参数和初始条件；尾迹恢复通过 EXP-02 的 `useTrailBuffer` 提供的 `loadFromArray` 方法）
  - 禁止在组件 render 路径中直接调用 IndexedDB（所有 I/O 必须通过 async helper 函数，在 `useEffect` 或事件 handler 中调用）
  - 禁止在无网络权限的上下文（Worker）中操作 IndexedDB（快照 I/O 仅在主线程）

---

### 输入定义（精确类型）

#### 快照完整数据模型

快照保存时需要采集以下全部数据，确保恢复后仿真状态完全一致。

```typescript
/**
 * 快照中保存的完整物理参数。
 * 字段名与 PendulumParams（SIM-01 Worker 协议）完全一致，
 * 确保恢复时可直接传给 WorkerUpdateParamsCommand。
 */
interface SnapshotParams {
  /** 上摆质量 (kg)。硬约束：> 0。示例：1.0 */
  m1: number;
  /** 下摆质量 (kg)。硬约束：> 0。示例：1.0 */
  m2: number;
  /** 上摆杆长 (m)。硬约束：> 0。示例：1.0 */
  L1: number;
  /** 下摆杆长 (m)。硬约束：> 0。示例：1.0 */
  L2: number;
  /** 重力加速度 (m/s²)。硬约束：>= 0。示例：9.81 */
  g: number;
  /** 阻尼系数 (1/s)。硬约束：>= 0。示例：0.0 */
  damping: number;
}

/**
 * 快照中保存的完整初始条件。
 * 与 SIM-01 WorkerInitCommand.initialConditions 完全一致。
 */
interface SnapshotInitialConditions {
  /** 上摆初始角度 (rad)。示例：1.5708 */
  theta1: number;
  /** 上摆初始角速度 (rad/s)。示例：0.0 */
  theta1Dot: number;
  /** 下摆初始角度 (rad)。示例：1.5708 */
  theta2: number;
  /** 下摆初始角速度 (rad/s)。示例：0.0 */
  theta2Dot: number;
}

/**
 * 快照中保存的当前状态向量。
 * 与 SIM-01 帧布局一致：[θ₁, θ̇₁, θ₂, θ̇₂]。
 */
interface SnapshotStateVector {
  /** 上摆角度 (rad)。示例：2.341 */
  theta1: number;
  /** 上摆角速度 (rad/s)。示例：-3.211 */
  theta1Dot: number;
  /** 下摆角度 (rad)。示例：-1.892 */
  theta2: number;
  /** 下摆角速度 (rad/s)。示例：5.674 */
  theta2Dot: number;
}

/**
 * 快照中保存的单个尾迹点。
 * 将 R3F Vector3 展平为 [x, y, z] 数组以便 IndexedDB 结构化克隆存储。
 */
interface SnapshotTrailPoint {
  /** 下摆球 3D 坐标 (m)。格式：[x, y, z]。示例：[1.234, -0.567, 0.0] */
  position: [number, number, number];
  /** 下摆球瞬时线速率 (m/s)。示例：4.32 */
  velocity: number;
}

/**
 * 完整快照记录。
 * 这是 IndexedDB object store `snapshots` 中存储的完整记录结构。
 */
interface FullSnapshot {
  /** 快照唯一标识，格式："snapshot-{uuid}"。示例："snapshot-550e8400-e29b-41d4-a716-446655440000" */
  id: string;
  /** ISO 8601 格式的创建时间戳。示例："2026-04-28T10:30:00.000Z" */
  timestamp: string;
  /** 用户可编辑的标签。可为 null。最大 50 个字符。示例："混沌爆发前的临界状态" */
  label: string | null;
  /** 保存时的完整物理参数 */
  params: SnapshotParams;
  /** 保存时的初始条件 */
  initialConditions: SnapshotInitialConditions;
  /** 保存时 Worker 使用的积分方法 */
  method: "RK4" | "VelocityVerlet" | "Euler";
  /** 保存时的当前状态向量 */
  stateVector: SnapshotStateVector;
  /** 保存时的仿真时间 (s)。示例：15.233 */
  simTime: number;
  /** 保存时的尾迹点数组。无尾迹时为空数组 []。最多 6000 个点 */
  trail: SnapshotTrailPoint[];
  /** base64 编码的缩略图，64×64px PNG。格式："data:image/png;base64,iVBORw0KGgo..." */
  thumbnail: string;
  /** 保存时所在的模式 */
  mode: "explore" | "analyze" | "lab" | "story";
  /** 保存时的能量数据（用于卡片展示和对比）。可选，无能量数据时为 null */
  energy?: {
    /** 动能 (J)。示例：5.234 */
    kinetic: number;
    /** 势能 (J)。示例：-4.567 */
    potential: number;
    /** 总能量 (J)。示例：0.667 */
    total: number;
  };
}
```

#### 快照列表缩略信息（轻量，用于卡片网格渲染）

```typescript
/**
 * 快照列表项的轻量类型。
 * 仅包含渲染缩略卡片所需的最少信息，不包含 trail 等大数据。
 * 该类型与已有 src/shared/types/app.ts 的 SnapshotMeta 兼容。
 */
interface SnapshotCardData {
  /** 快照 ID。示例："snapshot-550e8400-..." */
  id: string;
  /** ISO 8601 时间戳。示例："2026-04-28T10:30:00.000Z" */
  timestamp: string;
  /** 用户标签。null 表示未设置 */
  label: string | null;
  /** 缩略图 base64 字符串。64×64px PNG */
  thumbnail: string;
  /** 保存时模式 */
  mode: "explore" | "analyze" | "lab" | "story";
  /** 关键参数摘要（用于卡片副标题显示）。格式：m1=1.0, m2=1.0, L1=1.0, θ₁=90° */
  paramSummary: string;
  /** 仿真时间 (s) */
  simTime: number;
  /** 尾迹点数 */
  trailCount: number;
}
```

#### 双快照对比结果

```typescript
/**
 * 两个快照的参数差异项。
 */
interface ParamDiffItem {
  /** 参数名称（中文）。示例："上摆质量" */
  label: string;
  /** 参数键名。示例："m1" */
  key: string;
  /** 参数单位。示例："kg" */
  unit: string;
  /** 快照 A 的值 */
  valueA: number;
  /** 快照 B 的值 */
  valueB: number;
  /** 差值 (B - A) */
  delta: number;
  /** 差异是否有意义（差异绝对值 > 1e-10） */
  isDifferent: boolean;
}

/**
 * 双快照对比结果。
 */
interface SnapshotComparison {
  /** 快照 A 的 ID */
  snapshotIdA: string;
  /** 快照 B 的 ID */
  snapshotIdB: string;
  /** 快照 A 的标签（或时间戳回退） */
  labelA: string;
  /** 快照 B 的标签（或时间戳回退） */
  labelB: string;
  /** 所有参数的差异列表 */
  paramDiffs: ParamDiffItem[];
  /** 有差异的参数数量 */
  differentCount: number;
  /** 尾迹点数对比：A 的点数 */
  trailCountA: number;
  /** 尾迹点数对比：B 的点数 */
  trailCountB: number;
  /** 仿真时间对比：A 的时间 (s) */
  simTimeA: number;
  /** 仿真时间对比：B 的时间 (s) */
  simTimeB: number;
}
```

#### Store 类型扩展

扩展已有 `useDataStore`（文件：`src/features/data/store.ts`），新增以下字段：

```typescript
/**
 * useDataStore 扩展后的完整状态。
 * 下划线标注的字段为已有字段（保持不变），其余为新增。
 */
interface DataStateExtended {
  // === 已有字段（保持不变） ===
  snapshots: { id: string; label: string; timestamp: string }[];
  replayTime: number;
  isReplaying: boolean;
  forkActive: boolean;
  setSnapshots: (snapshots: DataStateExtended["snapshots"]) => void;
  setReplayTime: (t: number) => void;
  setReplaying: (replaying: boolean) => void;
  setForkActive: (active: boolean) => void;

  // === 新增：快照卡片数据缓存 ===
  /** 已加载的完整快照卡片数据（不含 trail，仅用于列表渲染）。键为快照 ID */
  snapshotCards: Map<string, SnapshotCardData>;
  /** 是否正在从 IndexedDB 加载快照列表 */
  isLoadingSnapshots: boolean;
  /** 快照加载错误消息。null 表示无错误 */
  snapshotError: string | null;

  // === 新增：双快照对比 ===
  /** 当前选中参与对比的快照 ID 列表。最多 2 个 */
  selectedSnapshotIds: string[];
  /** 对比结果。null 表示未执行对比或选中不足 2 个 */
  snapshotDiff: SnapshotComparison | null;
  /** 是否在轨迹叠加视图中显示快照 A 的尾迹 */
  showTrailA: boolean;
  /** 是否在轨迹叠加视图中显示快照 B 的尾迹 */
  showTrailB: boolean;

  // === 新增 actions ===
  /** 从 IndexedDB 加载快照列表到 snapshotCards */
  loadSnapshotList: () => Promise<void>;
  /** 添加或更新单个快照卡片（保存后调用） */
  upsertSnapshotCard: (card: SnapshotCardData) => void;
  /** 从列表中移除快照卡片（删除后调用） */
  removeSnapshotCard: (id: string) => void;
  /** 切换快照对比选中状态。最多 2 个，超过时替换最早选中的 */
  toggleSnapshotSelection: (id: string) => void;
  /** 清空对比选中 */
  clearSnapshotSelection: () => void;
  /** 计算双快照对比结果。需 selectedSnapshotIds 有 2 个时调用 */
  computeSnapshotDiff: (snapshotA: FullSnapshot, snapshotB: FullSnapshot) => void;
  /** 设置轨迹叠加可见性 */
  setTrailVisibility: (trail: "A" | "B", visible: boolean) => void;
}
```

---

### 输出定义（精确类型）

#### 快照操作返回值

```typescript
/**
 * 保存快照的结果。
 */
interface SaveSnapshotResult {
  /** 是否成功 */
  success: boolean;
  /** 成功时返回快照 ID，失败时为 null */
  snapshotId: string | null;
  /** 失败时的错误消息。成功时为 null */
  error: string | null;
  /** 失败时的错误分类 */
  errorCode: "QUOTA_EXCEEDED" | "DB_WRITE_FAILED" | "THUMBNAIL_FAILED" | "INVALID_STATE" | null;
}

/**
 * 恢复快照的结果。
 */
interface RestoreSnapshotResult {
  /** 是否成功 */
  success: boolean;
  /** 失败时的错误消息。成功时为 null */
  error: string | null;
  /** 失败时的错误分类 */
  errorCode: "SNAPSHOT_NOT_FOUND" | "INVALID_PARAMS" | "WORKER_RESET_FAILED" | "TRAIL_RESTORE_FAILED" | null;
}

/**
 * 删除快照的结果。
 */
interface DeleteSnapshotResult {
  /** 是否成功 */
  success: boolean;
  /** 失败时的错误消息。成功时为 null */
  error: string | null;
  /** 失败时的错误分类 */
  errorCode: "SNAPSHOT_NOT_FOUND" | "DB_DELETE_FAILED" | null;
}
```

---

### 核心逻辑步骤

#### 步骤 1：保存快照

- **操作对象**：当前仿真状态（`useSimulationStore` + `RingBuffer<TrailPoint>` + R3F 3D Canvas）
- **具体操作**：
  1. **前置校验**：检查 `useSimulationStore` 中是否已初始化（`isInitialized === true`）。若未初始化 → 返回 `SaveSnapshotResult { success: false, error: "仿真尚未初始化，无法保存快照", errorCode: "INVALID_STATE" }`；不写入 IndexedDB
  2. **采集参数**：从 `useSimulationStore.getState()` 读取当前 `params`（`m1, m2, L1, L2, g, damping`）、`initialConditions`（`theta1, theta1Dot, theta2, theta2Dot`）、`method`、`simTime`
  3. **采集状态向量**：从 `useSimulationStore.getState()` 读取当前 `theta1, theta1Dot, theta2, theta2Dot`，构建 `SnapshotStateVector`
  4. **采集能量数据**：从 `useSimulationStore.getState()` 读取 `kineticEnergy, potentialEnergy, totalEnergy`
  5. **采集尾迹**：从 EXP-02 的 `useTrailBuffer` hook（或直接从 `RingBuffer<TrailPoint>` 实例）调用 `.toArray()` 获取全部尾迹点数组。对每个 `TrailPoint`，将 `Vector3` 展平为 `[x, y, z]` 数组（因为 Vector3 对象无法直接结构化克隆到 IndexedDB），转换为 `SnapshotTrailPoint[]`
  6. **生成缩略图**：调用 `generateThumbnail`（位于 `src/features/data/snapshot/thumbnail.ts`）：
     - 获取当前 3D Canvas 的 DOM 元素（`<canvas>`）
     - 创建离屏 64×64 canvas
     - `ctx.drawImage(originalCanvas, 0, 0, 64, 64)`
     - `offScreenCanvas.toDataURL("image/png")` → base64 字符串
     - 若 3D Canvas 不可用（如快照在非探索模式下保存）→ 生成纯色占位缩略图（深灰背景 #1a1a2e，白色 "No 3D" 文字居中）
  7. **生成 ID**：`id = "snapshot-" + crypto.randomUUID()`
  8. **生成时间戳**：`timestamp = new Date().toISOString()`
  9. **构建 FullSnapshot 对象**：组装以上所有采集数据
  10. **检查容量**：调用 `listSnapshots()` 获取已有快照数量。若 `count >= 50`（技术栈 §5.4 上限）→ 查找最旧的快照（按 `timestamp` 升序第一条），调用 `deleteSnapshot(oldest.id)` 删除，并在 UI 上提示"快照数量已达上限 (50)，已自动删除最旧快照"
  11. **写入 IndexedDB**：调用 `saveSnapshot(fullSnapshot)`（`src/features/data/snapshot/snapshot-db.ts`）→ `putStore(db, "snapshots", fullSnapshot)`
  12. **更新 Store**：调用 `useDataStore.getState().upsertSnapshotCard(cardData)` 更新列表缓存
  13. **返回结果**：`SaveSnapshotResult { success: true, snapshotId: id, error: null, errorCode: null }`
- **输入来源**：用户点击"保存快照"按钮（`SnapshotManager.tsx` 中的 `<Button>` 点击事件或快捷键 `Ctrl+S`）
- **输出去向**：IndexedDB `snapshots` store + `useDataStore.snapshotCards` 更新 → React 重新渲染快照卡片网格
- **失败行为**：
  - IndexedDB 写入失败（`QuotaExceededError`）→ `SaveSnapshotResult { success: false, error: "存储空间不足，请删除部分快照后重试", errorCode: "QUOTA_EXCEEDED" }`，不更新 store
  - 缩略图生成失败（Canvas 不可用）→ 使用占位缩略图继续保存，不中断流程
  - 参数采集时检测到 NaN → 阻止保存，返回 `errorCode: "INVALID_STATE"`

#### 步骤 2：恢复快照

- **操作对象**：选中快照的 `FullSnapshot` 数据 + 当前仿真 Worker 实例 + `RingBuffer<TrailPoint>`
- **具体操作**：
  1. **加载快照数据**：从 IndexedDB 读取完整 `FullSnapshot`：`loadSnapshot(snapshotId)`（`src/features/data/snapshot/snapshot-db.ts`）
  2. **快照不存在**：若返回 `undefined` → `RestoreSnapshotResult { success: false, error: "快照不存在或已被删除", errorCode: "SNAPSHOT_NOT_FOUND" }`
  3. **校验参数**：检查 `snapshot.params` 中 `m1, m2, L1, L2 > 0`、`g, damping >= 0`。任一非法 → `RestoreSnapshotResult { success: false, error: "快照参数已损坏: {具体字段}", errorCode: "INVALID_PARAMS" }`
  4. **暂停当前仿真**：若 `useSimulationStore.isRunning === true` → 发送暂停信号（通过 store 的 `setRunning(false)`）
  5. **恢复参数和初始条件**：通过 Worker 命令恢复：
     - 发送 `WorkerUpdateParamsCommand { type: "updateParams", params: snapshot.params }` — 恢复物理参数
     - 发送 `WorkerSetMethodCommand { type: "setMethod", method: snapshot.method }` — 恢复积分方法
     - 发送 `WorkerResetCommand { type: "reset", initialConditions: { ...snapshot.stateVector } }` — 将当前状态向量作为新的初始条件，Worker 重置
  6. **恢复仿真时间**：Worker 端 `_simTime` 重置为 0（reset 的副作用）。主线程在收到 `ready` 后更新 `useSimulationStore.simTime = snapshot.simTime`（仅用于显示，Worker 从 0 重新计时）
  7. **恢复尾迹**：将 `snapshot.trail`（`SnapshotTrailPoint[]`）转换回 `TrailPoint[]`（`position` 从 `[x, y, z]` 数组还原为 `THREE.Vector3`）。调用 EXP-02 的 `useTrailBuffer` 暴露的方法（本规格要求 EXP-02 提供 `loadTrailFromArray(points: TrailPoint[]): void` 方法）加载历史尾迹
  8. **恢复模式**：若当前模式与快照保存模式不同 → 通过 `useAppStore.setMode(snapshot.mode)` 切换模式
  9. **更新 Store**：设置 `isReplaying = false`、`forkActive = false`
  10. **返回结果**：`RestoreSnapshotResult { success: true, error: null, errorCode: null }`
- **输入来源**：用户点击快照卡片上的"恢复"按钮，或在快照详情 Dialog 中点击"恢复到此刻"
- **输出去向**：Worker 状态更新 → 3D 场景切换到快照保存时的状态 → 尾迹恢复显示
- **失败行为**：
  - Worker `reset` 命令无响应（2s 超时）→ `RestoreSnapshotResult { success: false, error: "仿真引擎无响应，请刷新页面", errorCode: "WORKER_RESET_FAILED" }`
  - 尾迹恢复时数组为空 → 无尾迹显示，正常恢复（不视为错误）

#### 步骤 3：删除快照

- **操作对象**：IndexedDB 中指定 ID 的快照记录 + Store 中的卡片缓存
- **具体操作**：
  1. **确认对话框**：弹出 shadcn/ui `Dialog`，内容："确定要删除快照「{label 或 timestamp}」吗？此操作不可撤销。"
  2. **用户确认后**：调用 IndexedDB 删除：`deleteStore(db, "snapshots", snapshotId)`（需在 `snapshot-db.ts` 中补充 `deleteSnapshot` 函数）
  3. **更新 Store**：调用 `useDataStore.getState().removeSnapshotCard(snapshotId)`
  4. **清理对比选择**：若被删除的快照在 `selectedSnapshotIds` 中 → 移除该 ID；若因此不足 2 个 → 清空 `snapshotDiff`
- **输入来源**：用户点击快照卡片上的"删除"按钮（垃圾桶图标）
- **输出去向**：IndexedDB 记录删除 + Store 更新 → React 重新渲染卡片网格
- **失败行为**：
  - IndexedDB 删除失败 → `DeleteSnapshotResult { success: false, error: "删除失败，请重试", errorCode: "DB_DELETE_FAILED" }`，不更新 store
  - 快照不存在 → 仍视为成功（幂等删除），但提示"快照已不存在"

#### 步骤 4：加载快照列表

- **操作对象**：IndexedDB `snapshots` store + `useDataStore.snapshotCards`
- **具体操作**：
  1. **设置加载态**：`useDataStore.setState({ isLoadingSnapshots: true, snapshotError: null })`
  2. **读取全量**：调用 `listSnapshots()`（`src/features/data/snapshot/snapshot-db.ts`）→ `getAll()` 返回所有 `FullSnapshot` 记录
  3. **转换为卡片数据**：对每条 `FullSnapshot`，提取 `id, timestamp, label, thumbnail, mode, simTime, trail.length`，生成 `paramSummary`（格式：`"m₁=1.0, m₂=1.0, L₁=1.0, θ₁=90°"`—其中角度转换为度显示）
  4. **写入 Store**：将转换后的卡片数据存入 `snapshotCards` Map
  5. **排序**：按 `timestamp` 降序排列（最新的在前），更新 store 中的 `snapshots` 数组顺序
  6. **清除加载态**：`useDataStore.setState({ isLoadingSnapshots: false })`
- **输入来源**：`SnapshotManager` 组件挂载时（`useEffect` 首次渲染）自动调用；或在保存/删除快照后手动刷新
- **输出去向**：`useDataStore.snapshotCards` → React 渲染快照卡片网格
- **失败行为**：
  - IndexedDB 读取失败 → `useDataStore.setState({ isLoadingSnapshots: false, snapshotError: "无法加载快照列表，请检查浏览器存储权限" })` → UI 显示错误横幅 + 重试按钮

#### 步骤 5：双快照对比

- **操作对象**：`useDataStore.selectedSnapshotIds` 中的两个快照 + IndexedDB 中的完整数据
- **具体操作**：
  1. **触发条件**：`selectedSnapshotIds.length === 2`，用户点击"对比快照"按钮
  2. **加载完整数据**：`Promise.all([loadSnapshot(idA), loadSnapshot(idB)])` → 获取两个 `FullSnapshot`
  3. **生成参数差异表**：遍历所有参数键 `["m1", "m2", "L1", "L2", "g", "damping", "theta1", "theta1Dot", "theta2", "theta2Dot"]`：
     - 比较 `valueA` 和 `valueB`
     - `delta = valueB - valueA`
     - `isDifferent = Math.abs(delta) > 1e-10`
     - 构建 `ParamDiffItem` 数组
  4. **计算尾迹/时间对比**：比较 `trailCount` 和 `simTime`
  5. **构建对比结果**：组装 `SnapshotComparison` 对象
  6. **写入 Store**：`useDataStore.setState({ snapshotDiff: comparison })`
  7. **渲染对比 UI**：打开 `Dialog` 展示差异表和轨迹叠加选项
- **输入来源**：用户在快照卡片网格中点击两个卡片的复选框，然后点击"对比"按钮
- **输出去向**：`useDataStore.snapshotDiff` → React 渲染参数差异 `Table` + 轨迹叠加控制面板
- **失败行为**：
  - 任一快照从 IndexedDB 加载失败 → 提示"快照数据读取失败"，清空 `selectedSnapshotIds`

#### 步骤 6：轨迹叠加显示

- **操作对象**：R3F 场景中的两个半透明 `<Line>` 组件
- **具体操作**：
  1. **前置条件**：`snapshotDiff !== null` 且 `showTrailA || showTrailB === true`
  2. **加载尾迹数据**：从两个快照的 `FullSnapshot.trail` 中获取 `SnapshotTrailPoint[]`
  3. **转换为 R3F 坐标**：`position: [x, y, z]` 已经可直接用于 `THREE.Vector3`
  4. **渲染**：
     - 快照 A 尾迹：金色 `#ffd700`，半透明 `opacity: 0.5`
     - 快照 B 尾迹：紫色 `#9b59b6`，半透明 `opacity: 0.5`
     - 使用 drei `<Line>` 组件，`vertexColors: false`（使用单一颜色）
  5. **交互**：提供切换开关控制每条尾迹的显示/隐藏
- **输入来源**：快照对比 Dialog 中的尾迹叠加开关
- **输出去向**：R3F `<Canvas>` 中叠加渲染两条半透明尾迹
- **失败行为**：快照尾迹数组为空 → 该条尾迹不渲染，开关禁用态（灰色）

---

### 依赖与集成接口

| 依赖方 | 具体接口 | 用途 |
|--------|----------|------|
| IndexedDB | `openDB("chaos-pendulum-snapshots", 1, upgrade)` / `putStore()` / `getStore()` / `deleteStore()` / `getAll()` | 快照 CRUD 持久化（代码路径：`src/shared/lib/cache/indexed-db.ts`） |
| `crypto.randomUUID()` | 浏览器原生 API | 生成快照 UUID |
| `HTMLCanvasElement.toDataURL("image/png")` | 浏览器 Canvas API | 生成 64×64px 缩略图 PNG base64 |
| `useSimulationStore` | `getState()` 读取 `params`, `initialConditions`, `method`, `simTime`, `theta1`, `theta1Dot`, `theta2`, `theta2Dot`, `kineticEnergy`, `potentialEnergy`, `totalEnergy`, `isRunning`, `isInitialized` | 快照保存时采集当前仿真完整状态 |
| `useSimulationStore` | `setRunning(false)` / Worker 命令 | 快照恢复前暂停仿真 |
| `RingBuffer<TrailPoint>` | `.toArray(): TrailPoint[]` | 快照保存时导出全部尾迹点 |
| EXP-02 `useTrailBuffer` | `loadTrailFromArray(points: TrailPoint[]): void`（本规格要求新增） | 快照恢复时加载历史尾迹 |
| SIM-01 Worker | `postMessage({ type: "updateParams", params })` / `postMessage({ type: "reset", initialConditions })` / `postMessage({ type: "setMethod", method })` | 快照恢复时重建 Worker 状态 |
| `useAppStore` | `setMode(mode: AppMode)` | 快照恢复时切换至保存时的模式 |
| `useDataStore` | 本模块内部 store | 管理快照卡片列表、对比状态、筛选 |

**本模块对外暴露的公共接口**（`src/features/data/index.ts` 中补充）：

| 导出项 | 类型 | 用途 |
|--------|------|------|
| `saveSnapshotFull()` | async function → `SaveSnapshotResult` | 保存当前仿真状态为快照 |
| `restoreSnapshot(id: string)` | async function → `RestoreSnapshotResult` | 从快照恢复仿真状态 |
| `deleteSnapshot(id: string)` | async function → `DeleteSnapshotResult` | 删除指定快照 |
| `loadFullSnapshot(id: string)` | async function → `FullSnapshot \| undefined` | 加载完整快照数据 |
| `listSnapshotCards()` | async function → `SnapshotCardData[]` | 加载所有快照的卡片数据 |
| `compareSnapshots(idA: string, idB: string)` | async function → `SnapshotComparison` | 对比两个快照 |
| `FullSnapshot` | type | 完整快照类型 |
| `SnapshotCardData` | type | 快照卡片轻量类型 |
| `SnapshotComparison` | type | 对比结果类型 |

---

### 状态机

快照管理涉及的操作状态转换：

| 当前状态 | 触发事件 | 下一状态 | 前置条件 | 副作用 |
|----------|----------|----------|----------|--------|
| `idle` | 用户点击"保存快照" | `saving` | 仿真已初始化（`isInitialized === true`） | 采集当前状态 → 生成缩略图 → 构建 FullSnapshot |
| `saving` | IndexedDB 写入成功 | `idle` | — | `useDataStore.upsertSnapshotCard()` 更新列表；显示 toast "快照已保存" |
| `saving` | IndexedDB 写入失败 | `idle` | — | 显示 toast 错误消息；不更新 store |
| `saving` | 缩略图生成失败 | `saving`（继续） | — | 使用占位缩略图，不中断保存流程 |
| `saving` | 容量超限 | `deleting_oldest` → `saving` | 快照数 ≥ 50 | 自动删除最旧快照 → 继续保存 |
| `idle` | 用户点击快照卡片"恢复" | `restoring` | 选中的快照 ID 存在 | 暂停仿真 → 加载完整快照数据 |
| `restoring` | Worker reset 成功 + 尾迹恢复成功 | `idle` | — | 3D 场景切换到快照状态；显示 toast "快照已恢复" |
| `restoring` | Worker reset 失败 | `idle` | — | 显示 toast 错误消息；保持当前仿真状态不变 |
| `restoring` | 尾迹恢复失败（数组为空） | `idle`（正常） | — | 无尾迹显示，其他状态正常恢复 |
| `idle` | 用户点击"删除" → 确认 | `deleting` | 快照 ID 存在 | — |
| `deleting` | IndexedDB 删除成功 | `idle` | — | `useDataStore.removeSnapshotCard()`；清理对比选择 |
| `deleting` | IndexedDB 删除失败 | `idle` | — | 显示 toast 错误消息 |
| `idle` | 用户选择 2 个快照 → 点击"对比" | `comparing` | `selectedSnapshotIds.length === 2` | 加载两个 FullSnapshot |
| `comparing` | 对比计算完成 | `idle` | — | `snapshotDiff` 写入 store；打开对比 Dialog |
| `comparing` | 任一快照加载失败 | `idle` | — | 清空 `selectedSnapshotIds`；显示错误提示 |

---

### 异常与边界条件

#### 异常 1：IndexedDB 存储空间不足（QuotaExceededError）

- **触发条件**：浏览器 IndexedDB 配额用尽（通常 > 100MB 自由空间，但快照积累 + Pyodide 缓存可能耗尽）。单次 `putStore()` 调用抛出 `DOMException: QuotaExceededError`
- **处理策略**：
  1. `snapshot-db.ts` 的 `saveSnapshot()` 捕获 `QuotaExceededError`
  2. 返回 `SaveSnapshotResult { success: false, errorCode: "QUOTA_EXCEEDED", error: "存储空间不足，请删除部分快照后重试" }`
  3. UI 层弹出 Dialog："存储空间不足，建议删除不需要的快照以释放空间（当前共 {count} 个快照，约 {estimatedSize}MB）"
  4. 提供"管理快照"按钮跳转到快照管理面板
- **重试参数**：不自动重试。用户清理后手动重新保存。

#### 异常 2：缩略图生成时 3D Canvas 不可用

- **触发条件**：用户在非探索模式（分析/实验/故事模式）下保存快照，或在 3D Canvas 尚未挂载时保存
- **处理策略**：
  1. `generateThumbnail()` 尝试获取 3D Canvas DOM 元素
  2. 若 `document.querySelector("canvas")` 返回 `null` 或 canvas 尺寸为 0 → 生成占位缩略图：
     - 创建 64×64 离屏 canvas
     - 填充背景色 `#1a1a2e`（项目深色主题背景）
     - 绘制白色文字 "3D"（14px sans-serif，居中）
     - 边框为 `#333`
  3. 占位缩略图的 `toDataURL` 正常写入快照
  4. 不向用户显示错误——这是预期行为，非故障
- **重试参数**：无需重试。

#### 异常 3：快照恢复时 Worker 无响应

- **触发条件**：发送 `WorkerResetCommand` 后 2 秒内未收到 `WorkerReadyResponse`
- **处理策略**：
  1. 设置 2 秒超时定时器
  2. 超时触发 → 返回 `RestoreSnapshotResult { success: false, errorCode: "WORKER_RESET_FAILED", error: "仿真引擎无响应，请刷新页面" }`
  3. UI 显示 Dialog："恢复失败：仿真引擎无响应。建议刷新页面后重试。"
  4. 不自动重建 Worker（已有 SIM-01 的异常 3 处理 Worker 崩溃，此处仅处理无响应）
- **重试参数**：不自动重试。建议用户刷新页面。

#### 异常 4：快照数据版本不兼容

- **触发条件**：未来代码版本中 `FullSnapshot` 结构变更（如新增必填字段），加载旧版本 IndexedDB 中的快照数据时部分字段为 `undefined`
- **处理策略**：
  1. `loadSnapshot()` 加载后校验必需字段：`params.m1, params.m2, params.L1, params.L2` 是否存在且为 `number`；`stateVector.theta1` 是否存在
  2. 校验失败 → 返回 `undefined`（视同快照不存在），并 `console.warn("快照数据版本不兼容: {id}")`
  3. 可选：在快照数据中增加 `version: number` 字段（本规格 v1.0 不强制，留给后续版本）
- **重试参数**：不重试。旧版本快照将被视为不可用，用户需删除后重新保存。

#### 异常 5：快照保存时仿真状态含 NaN

- **触发条件**：积分已发散，`useSimulationStore` 中 `theta1, theta1Dot, theta2, theta2Dot` 任一为 `NaN` 或 `Infinity`
- **处理策略**：
  1. 保存前校验：`isFinite(stateVector.theta1) && isFinite(stateVector.theta1Dot) && ...`
  2. 校验失败 → `SaveSnapshotResult { success: false, errorCode: "INVALID_STATE", error: "当前仿真状态异常（数值发散），无法保存快照。请先重置仿真。" }`
  3. UI 显示 toast 错误消息，不写入 IndexedDB
- **重试参数**：不重试。用户需先重置仿真。

#### 异常 6：快照列表加载失败

- **触发条件**：IndexedDB `getAll()` 调用失败（数据库损坏、权限变更、浏览器隐私模式下 IndexedDB 不可用）
- **处理策略**：
  1. 捕获 `DOMException` 或事务失败
  2. `useDataStore.setState({ isLoadingSnapshots: false, snapshotError: "无法加载快照列表" })`
  3. UI 显示错误横幅："无法加载快照列表，请检查浏览器存储设置" + "重试"按钮
  4. 不影响仿真正常运行
- **重试参数**：用户手动点击"重试"按钮。

#### 异常 7：快照数量达上限时自动淘汰

- **触发条件**：`listSnapshots().length >= 50` 且用户触发保存（技术栈 §5.4 上限 50）
- **处理策略**：
  1. 按 `timestamp` 升序排列（最早的在前）
  2. 删除第一条：`deleteSnapshot(oldest.id)`
  3. 提示 toast："快照数量已达上限 (50)，已自动删除最旧快照「{oldest.label || oldest.timestamp}」"
  4. 继续保存新快照
- **重试参数**：自动执行，不阻塞。

---

### 原则兑现清单

| 原则来源 | 原则名称 | 代码级约束 |
|----------|----------|------------|
| 技术栈设计 §5.4 | 快照 IndexedDB 存储上限 50 个 | 每次保存前 `count >= 50` 检查 → LRU 淘汰最旧快照；删除前 toast 提示 |
| 技术栈设计 §4.12 | 快照完整状态 = 参数 + 状态向量 + 尾迹 + 缩略图 | `FullSnapshot` 包含全部 4 类数据；`SnapshotCardData` 仅含列表渲染所需字段（不含大尾迹数组） |
| 技术栈设计 §4.12 | 双快照对比：参数差异表 + 轨迹叠加 | `computeSnapshotDiff` 输出 `ParamDiffItem[]` + `trailCountA/B` + `simTimeA/B`；轨迹叠加用 R3F `<Line>` 双色半透明 |
| 功能设计_v0 §七 7.1 | 快照以缩略卡片排列，显示关键参数 | 卡片渲染 `SnapshotCardData.thumbnail` + `paramSummary` + `simTime` + `trailCount` |
| 功能设计_v0 §七 7.1 | 双快照参数差异表 + 轨迹叠加显示 | 对比 Dialog 含 `Table` 展示 `ParamDiffItem[]` + `<Line>` 双色尾迹 |
| 功能设计_v0 §九 | 优雅降级 | 缩略图不可用时占位图；Worker 无响应时错误提示不崩溃；IndexedDB 不可用时列表为空 + 提示横幅 |
| 项目结构 §4.8 | `data/` Feature 内聚 | 快照逻辑集中在 `snapshot/` 子目录（`snapshot-db.ts` + `thumbnail.ts`）；组件在 `components/SnapshotManager.tsx`；store 在 `store.ts` |
| 核心原则（AGENT.md） | 前端逻辑层与表现层分离 | 组件仅渲染卡片/对话框；I/O 逻辑在 `snapshot-db.ts` 和 hooks 中；状态在 `useDataStore` 中 |

---

### 验收测试场景

#### 正向测试 1：保存快照并恢复

- **Given**：
  ```json
  {
    "仿真状态": "已运行 10 秒，参数为默认值 (m1=1.0, m2=1.0, L1=1.0, L2=1.0, g=9.81, damping=0.0)",
    "初始条件": { "theta1": 1.5708, "theta1Dot": 0.0, "theta2": 1.5708, "theta2Dot": 0.0 },
    "尾迹点数": 600,
    "3D 场景": "正常渲染中",
    "IndexedDB": "可用，当前快照数 0"
  }
  ```
- **When**：用户点击"保存快照"按钮
- **Then**：
  - 返回 `SaveSnapshotResult { success: true, snapshotId: "snapshot-{uuid}", error: null }`
  - IndexedDB 中新增一条记录，`id` 格式为 `snapshot-{uuid}`，`params.m1 === 1.0`，`trail.length === 600`
  - 缩略图为有效 PNG base64，decode 后尺寸为 64×64px
  - `useDataStore.snapshotCards` 中包含新卡片的 `SnapshotCardData`
  - UI 显示 toast "快照已保存"
  - 快照卡片网格中新增一张卡片，显示缩略图 + `paramSummary` + 仿真时间

#### 正向测试 2：双快照对比

- **Given**：
  - 快照 A（t=5s）：params `{ m1: 1.0, m2: 1.0, L1: 1.0, L2: 1.0, g: 9.81, damping: 0.0 }`，`theta1: 1.57`
  - 快照 B（t=10s）：params `{ m1: 2.0, m2: 1.0, L1: 1.5, L2: 1.0, g: 9.81, damping: 0.1 }`，`theta1: 2.34`
  - 两个快照均在 IndexedDB 中
- **When**：用户选择快照 A 和快照 B → 点击"对比快照"
- **Then**：
  - `useDataStore.snapshotDiff` 不为 null
  - `snapshotDiff.paramDiffs` 包含 10 个 `ParamDiffItem`（6 个 PendulumParams + 4 个 StateVector）
  - `m1` 的 `ParamDiffItem.delta === 1.0`，`isDifferent === true`
  - `m2` 的 `ParamDiffItem.delta === 0.0`，`isDifferent === false`
  - `damping` 的 `ParamDiffItem.delta === 0.1`，`isDifferent === true`
  - `snapshotDiff.differentCount >= 4`（m1、L1、damping、theta1 有差异）
  - 对比 Dialog 打开，显示 `Table` 参数差异表（差异行高亮黄色背景）
  - Dialog 底部有轨迹叠加开关（默认关闭）

#### 正向测试 3：恢复快照后仿真继续运行

- **Given**：快照已在 IndexedDB 中（保存于 15 秒仿真后，theta1=2.341, 尾迹=900 点）
- **When**：用户点击该快照卡片的"恢复"按钮
- **Then**：
  - 仿真暂停（`isRunning === false`）
  - Worker 收到 `updateParams` + `setMethod` + `reset` 命令
  - Worker 回复 `ready`
  - 3D 场景中双摆切换到 theta1=2.341 的姿态
  - 尾迹恢复为 900 个半透明点的金色线条
  - `useSimulationStore.simTime` 显示 15.0
  - UI toast 显示"快照已恢复"
  - 用户点击播放 → 仿真从恢复状态继续运行，无跳变

#### 异常测试 1：未初始化时保存快照被拒绝

- **Given**：应用刚启动，Worker 尚未初始化（`isInitialized === false`）
- **When**：用户点击"保存快照"按钮（按钮应为禁用态，但假设通过其他途径触发）
- **Then**：
  - `saveSnapshotFull()` 返回 `SaveSnapshotResult { success: false, errorCode: "INVALID_STATE" }`
  - IndexedDB 中无新增记录
  - UI 显示 toast "仿真尚未初始化，无法保存快照"
  - `useDataStore.snapshotCards` 不变

#### 异常测试 2：容量达上限时自动淘汰最旧快照

- **Given**：IndexedDB 中已有 50 个快照（最旧的 timestamp 为 `2026-04-27T00:00:00.000Z`，标签为"初始测试"）
- **When**：用户点击"保存快照"
- **Then**：
  - 最旧快照被删除，IndexedDB 中快照数仍为 50
  - 新快照成功保存
  - UI toast："快照数量已达上限 (50)，已自动删除最旧快照「初始测试」"
  - `useDataStore.snapshotCards` 中旧卡片已移除，新卡片已添加

#### 异常测试 3：Worker 无响应时恢复快照失败

- **Given**：快照在 IndexedDB 中可用，但 Worker 线程卡死（模拟 `worker.postMessage` 后不回复）
- **When**：用户点击"恢复"按钮
- **Then**：
  - 2 秒超时后返回 `RestoreSnapshotResult { success: false, errorCode: "WORKER_RESET_FAILED" }`
  - UI Dialog："恢复失败：仿真引擎无响应。建议刷新页面后重试。"
  - 当前仿真状态不变（保持快照恢复前状态）
  - 不触发 Worker 自动重建（这是无响应而非崩溃）

#### 异常测试 4：积分发散时保存被拒绝

- **Given**：仿真运行中积分发散，`useSimulationStore.getState()` 中 `theta1` 为 `NaN`
- **When**：用户点击"保存快照"
- **Then**：
  - 返回 `SaveSnapshotResult { success: false, errorCode: "INVALID_STATE" }`
  - UI toast："当前仿真状态异常（数值发散），无法保存快照。请先重置仿真。"
  - IndexedDB 无新增记录

---

### 注意事项与禁止行为

1. **【类型兼容】** 已有 `Snapshot` 接口（`snapshot-db.ts` 第 7-16 行）使用 `Record<string, number>` 和 `number[]`。本规格定义的 `FullSnapshot` 是对该接口的精准化，两者在 IndexedDB 存储层面兼容（具名字段可存入 `Record<string, number>`）。实现时应将 `snapshot-db.ts` 中的 `Snapshot` 接口更新为 `FullSnapshot`，并保持旧快照数据的读取兼容（缺失字段使用默认值填充）。
2. **【Vector3 序列化】** `TrailPoint.position` 是 `THREE.Vector3`，无法直接结构化克隆到 IndexedDB。保存时必须展平为 `[x, y, z]` 元组；恢复时必须还原为 `new THREE.Vector3(x, y, z)`。不能在 IndexedDB 中存放 Vector3 实例。
3. **【缩略图生成时机】** 缩略图必须在仿真暂停或渲染帧中获取 3D Canvas 截图。如果仿真正在运行且 rAF 持续更新 Canvas，`toDataURL` 调用的时机不影响截图正确性（Canvas 的当前帧被截取）。但如果 R3F 使用 `preserveDrawingBuffer: false`（默认），`toDataURL` 必须在 rAF 回调中或 Canvas 渲染后立即调用，否则会得到空白图像。
4. **【快照恢复时尾迹清空】** 快照恢复时，必须先清空当前 `RingBuffer<TrailPoint>`（调用 `.clear()`），再调用 `loadTrailFromArray()` 填充历史尾迹。不清空会导致新旧尾迹混合渲染。
5. **【Worker 命令顺序】** 快照恢复时，Worker 命令发送顺序必须为：`updateParams` → `setMethod` → `reset`。若顺序错误（如先 `reset` 后 `updateParams`），则 `reset` 会使用旧的参数初始化，导致状态不一致。每个命令需等待前一个命令的确认（或至少间隔一帧）后发送，不可批量 fire-and-forget。
6. **【禁止行为】** 禁止在 `SnapshotManager` 组件 render 函数中直接调用 IndexedDB（如 `listSnapshots()`）。所有 IndexedDB I/O 必须在 `useEffect` 或用户事件 handler 中异步调用。
7. **【禁止行为】** 禁止在快照恢复过程中直接修改 `useSimulationStore` 的内部状态（如 `setState({ theta1: ... })`）。所有状态变更必须通过 Worker 命令进行，确保仿真引擎与 UI 状态一致。
8. **【禁止行为】** 禁止在保存快照时将整个 `RingBuffer` 的底层数组引用存入 IndexedDB（RingBuffer 内部 buffer 可能含未初始化槽位）。必须先调用 `.toArray()` 获取有效元素的数组，再序列化。
9. **【禁止行为】** 禁止跳过容量检查直接写入 IndexedDB。50 上限必须在每次保存前检查并执行 LRU 淘汰。
10. **【易错点】** 删除快照时需同步清理 `selectedSnapshotIds` 和 `snapshotDiff`。若被删除的快照正在对比中，残留的 ID 会导致后续对比操作加载不存在的快照。
11. **【易错点】** 双快照对比时，尾迹点数组可能极大（6000 点 × 2 = 12000 点）。在轨迹叠加视图中，如果帧率下降（< 30fps），应将尾迹渲染精度降低（只渲染每隔 N 个点），以保障 3D 场景交互流畅性。
12. **【偷懒红线】** 文档中 `FullSnapshot`、`SnapshotCardData`、`SnapshotComparison` 的类型定义必须完整出现在代码中（放在 `src/shared/types/app.ts` 或 `src/features/data/snapshot/types.ts`），不可使用 `any` 或 `Record<string, any>` 替代。

---

*本文档由 AI 辅助生成，基于功能设计_v0 §七 7.1 + 技术栈设计 §4.12 + §5.4 + 已有 snapshot-db.ts / RingBuffer / dataStore 代码兼容。*
