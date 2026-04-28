# 功能点：SIM-04 能量实时监控

> **文档生成时间**：2026-04-28 21:19:10 CST
> **版本记录**：
> | 版本 | 时间 | 修改人 | 变更摘要 |
> |------|------|--------|----------|
> | v1.0 | 2026-04-28 21:19:10 | AI Assistant | 初始版本，对齐 SIM-01 v2.0 扁平能量字段名 |
> | v2.0 | 2026-04-28 21:19:10 | AI Assistant | 完整重写为自包含功能规格，补全兼容性分析、所有异常场景精确阈值、每步操作对象与输出去向 |

> **冲突核查指引**：EXP-03 声音化引擎（v1.0, 2026-04-28 20:16:30 CST）使用 `state.energy.kinetic`（嵌套路径）读取动能，与 SIM-01 v2.0 的 `state.kineticEnergy`（扁平路径，SIM-01 为数据生产者且时间戳更新）不一致。以 SIM-01 v2.0 为权威源，EXP-03 需更新为扁平路径 `state.kineticEnergy`。ANL-04（v1.0, 2026-04-28 20:30:24 CST）为独立 3D 曲面可视化模块，与 SIM-04 无共享接口冲突。

### 所属模块与溯源

- **对应总设计章节**：功能设计_v0 §五 5.2（能量守恒标准：1000s 内漂移 < 0.5%）；§十 P0（能量监控 + 相空间图）；技术栈设计 §2 #6（D3.js 2D 图表）
- **依赖的其他功能模块**：
  - `SIM-01`（双摆物理引擎）— 通过 Zustand store 的 `kineticEnergy`、`potentialEnergy`、`totalEnergy` 字段消费每帧能量数据；通过 RingBuffer 订阅 `totalEnergy` 历史
- **被依赖模块**：
  - `LAB-02`（物理验证套件）— 能量守恒验证项读取本模块的漂移数据作为判定依据
  - `EXP-03`（声音化引擎）— 读取 `kineticEnergy` 映射音色亮度

### 已有设计兼容性分析

- **已审查的相关规格文档**：
  | 文档 | 版本 | 审查日期 | 共享接口 | 冲突？ |
  |------|------|----------|----------|:---:|
  | `SIM-01-双摆物理引擎.md` | v2.1 | 2026-04-28 | `kineticEnergy`/`potentialEnergy`/`totalEnergy`（store 扁平字段）；`FRAME_STRIDE=14`；能量偏移常量 9/10/11 | ✅ 对齐 |
  | `EXP-03-声音化引擎.md` | v1.0 | 2026-04-28 | `kineticEnergy` 读取路径 | ⚠️ 时间戳冲突（详见下方） |
  | `ANL-04-能量景观地形图.md` | v1.0 | 2026-04-28 | 无共享接口（ANL-04 读取 `theta1`/`theta2`，SIM-04 不涉及） | ✅ 无冲突 |
  | `功能模块全拆解.md` | — | 2026-04-28 | 附录 C：SIM-04 与 ANL-04 边界决策（一维标量 vs 二维曲面，保持分离） | ✅ 对齐 |

- **兼容性结论**：
  - **SIM-01 v2.1（2026-04-28 20:30:00）**：以扁平字段 `kineticEnergy`/`potentialEnergy`/`totalEnergy` 写入 store。本模块以此为准定义读取路径。能量偏移常量（`FrameField.KINETIC_ENERGY=9`、`FrameField.POTENTIAL_ENERGY=10`、`FrameField.TOTAL_ENERGY=11`）已在 `src/shared/types/simulation.ts` 中以 `const enum FrameField` 定义，本模块直接复用。
  - **EXP-03 v1.0（2026-04-28 20:16:30）**：使用 `state.energy.kinetic`（嵌套路径）读取动能。SIM-01 v2.0（时间戳 20:30:00）以扁平 `state.kineticEnergy` 写入。EXP-03 时间戳更旧且 SIM-01 为数据生产者——以 SIM-01 为权威源，EXP-03 需后续更新为 `state.kineticEnergy`。本模块在版本记录中记录此兼容性冲突以供 EXP-03 更新时参考。
  - **ANL-04**：独立的 3D 势能曲面可视化（`V(θ₁,θ₂)` 二维函数），不读取 SIM-04 的漂移数据。两者边界清晰（附录 C 确认一维标量 vs 二维曲面分离），无冲突。

- **复用的已有定义**：
  - `FrameField.KINETIC_ENERGY = 9`、`FrameField.POTENTIAL_ENERGY = 10`、`FrameField.TOTAL_ENERGY = 11`（`src/shared/types/simulation.ts`）
  - `FRAME_STRIDE = 14`（`src/shared/types/simulation.ts`）
  - `SimulationFrame` 接口中的 `kineticEnergy`/`potentialEnergy`/`totalEnergy` 字段（`src/features/simulation/store.ts`）
  - `PendulumParams.damping` 字段（`src/shared/types/physics.ts`）
  - SIM-01 的 `RingBuffer<StateVector>` 模式（用于回溯历史能量值，本模块独立维护 `energyBuffer`）

### 技术栈绑定

- **必须使用**：
  - `react@^18.3.1` — UI 框架，`EnergyMonitorPanel` 组件
  - `d3@^7.9.0`（按需模块：`d3-scale`、`d3-shape`、`d3-axis`、`d3-selection`）— 能量时序折线图 Canvas 渲染。只导入这四个子模块，禁止导入全量 `d3` 包
  - `zustand@^4.5.5` — 从 `useSimulationStore` 订阅能量字段；通过 `useSimulationStore.getState()` 读取 `params.damping`
  - `tailwindcss@^3.4.16` — 面板布局、漂移指示器样式
  - `shadcn/ui`（Copy 模式）— `Card`（面板容器）、`Badge`（漂移状态标签）、`Tooltip`（悬浮数值详情）
  - TypeScript 5.x — 类型安全
  - Canvas 2D API（浏览器原生）— 能量折线图渲染。使用 `CanvasRenderingContext2D`，配合 D3 的 `context(ctx)` 绑定
- **禁止使用**：
  - 禁止在 Canvas 上使用 D3 的 SVG 渲染路径（Canvas 渲染性能优于 SVG，60fps 更新场景必须用 Canvas）
  - 禁止在 `requestAnimationFrame` 回调内部直接操作 D3 scale/axis（每帧仅更新数据路径，scale 和 axis 仅在 resize 或漂移超限时重绘）
  - 禁止使用 ECharts / Chart.js 等重型图表库（D3 按需引入，bundle < 10KB）
  - 禁止使用 `d3.select(canvas)` 或 `d3.select(ctx)` 之外的 DOM 选择器（Canvas 模式下仅操作 2D context，不操作 DOM）
  - 禁止将能量数据存储在 Zustand 之外的全局变量中（`energyBuffer` 使用 `useRef` 持有，不算全局变量）

### 输入定义（精确类型）

#### Zustand Store 扩展：EnergyMonitorState

```typescript
/**
 * 能量监控切片的运行时状态。
 * 写入方：SIM-01 的 consumeFrameToStore（每帧更新 kineticEnergy/potentialEnergy/totalEnergy）
 * 读取方：本模块 (SIM-04)、EXP-03 (声音化引擎)、LAB-02 (物理验证套件)
 *
 * 注意：kineticEnergy/potentialEnergy/totalEnergy 三个字段由 SIM-01 独占写入，
 * 本模块只读这三个字段。本模块写入的字段是 energyInitial/energyDrift/driftExceeded/
 * energyMin/energyMax（派生指标）。
 */
interface EnergyMonitorState {
  // ─── 每帧更新的原始值（由 SIM-01 写入，本模块只读） ───

  /** 系统动能 (J)。来源：Worker buffer offset 9（FrameField.KINETIC_ENERGY）。
   *  约束：>= 0（动能非负）。异常值：NaN 表示积分发散。
   *  示例值：4.905 */
  kineticEnergy: number;

  /** 系统势能 (J)。来源：Worker buffer offset 10（FrameField.POTENTIAL_ENERGY）。
   *  约束：可为负（y=0 为零势面时正常为负）。异常值：NaN 表示积分发散。
   *  示例值：-9.81 */
  potentialEnergy: number;

  /** 系统总能量 (J)。来源：Worker buffer offset 11（FrameField.TOTAL_ENERGY）。
   *  E = K + V。约束：无阻尼时理论守恒（漂移 < 0.5%）。异常值：NaN 表示积分发散。
   *  示例值：-4.905 */
  totalEnergy: number;

  // ─── 本模块管理的派生指标 ───

  /**
   * 仿真开始时刻的总能量 (J)，作为漂移计算的基准。
   * 在首次收到非 NaN 的 totalEnergy 时记录。
   * 仿真 reset 时清零（置 null）重新记录。
   * 约束：可为负（双摆系统通常总能量为负）。
   * 示例值：-4.905
   */
  energyInitial: number | null;

  /**
   * 当前能量相对漂移（比例，非百分比）。
   * drift = |totalEnergy - energyInitial| / max(|energyInitial|, 1e-10)
   * 范围：[0, +∞)。正常情况（无阻尼、RK4、10s 内）< 0.0001。
   * 漂移 >= 0.005 时触发告警（仅 damping === 0 时）。
   * 示例值：0.00023
   */
  energyDrift: number;

  /**
   * 漂移是否超过 0.5% 阈值。
   * 仅在 damping === 0 时检查此标志。阻尼系统不触发此标志。
   * 告警锁存：漂移恢复正常后保持 true，直到用户手动清除或仿真 reset。
   * 示例值：false
   */
  driftExceeded: boolean;

  /**
   * 当前会话中观察到的最小总能量 (J)。
   * 每帧 totalEnergy 到达时更新：energyMin = Math.min(energyMin, e)。
   * 仿真 reset 时重置为 0。
   * 示例值：-5.1
   */
  energyMin: number;

  /**
   * 当前会话中观察到的最大总能量 (J)。
   * 每帧 totalEnergy 到达时更新：energyMax = Math.max(energyMax, e)。
   * 仿真 reset 时重置为 0。
   * 示例值：-4.7
   */
  energyMax: number;

  /**
   * 仿真是否处于活跃状态。
   * 仿真开始（首个非 NaN 帧到达）→ true。
   * 仿真暂停：保持 true（数据仍在内存中）。
   * 仿真 reset → false（下一帧重新初始化为 true）。
   * 连续 60 帧 NaN → false（面板显示"数据不可用"）。
   * 示例值：true
   */
  isSimulationActive: boolean;
}

/** 能量漂移阈值常量。对齐功能设计_v0 §五 5.2：1000s 内漂移 < 0.5% */
const DRIFT_THRESHOLD = 0.005; // 0.5%

/** 连续 NaN 帧数阈值。超过此阈值判定为数据不可用 */
const MAX_NAN_FRAMES = 60; // 1 秒 @60fps

/** 告警锁存清除标识：阻尼状态变更时自动清除锁存 */
const LATCH_AUTO_CLEAR_ON_DAMPING_CHANGE = true;
```

#### Store Actions

```typescript
/**
 * SIM-04 能量切片 Actions。
 * updateEnergy 由 SIM-01 的 consumeFrameToStore 每帧调用。
 * resetEnergyTracking 在仿真 reset 时调用。
 */
interface EnergyMonitorActions {
  /**
   * SIM-01 每帧调用：更新原始能量值并重新计算派生指标。
   *
   * @param k - 动能 (J)，来自 buffer[offset + FrameField.KINETIC_ENERGY]
   * @param v - 势能 (J)，来自 buffer[offset + FrameField.POTENTIAL_ENERGY]
   * @param e - 总能量 (J)，来自 buffer[offset + FrameField.TOTAL_ENERGY]
   *
   * 副作用：
   *   - 首次非 NaN 调用：设置 energyInitial = e, energyMin = e, energyMax = e, isSimulationActive = true
   *   - 每次调用：更新 energyMin/energyMax、计算 energyDrift、判断 driftExceeded
   *   - NaN 调用：跳过（不修改任何状态），nanSkipCount++
   *   - damping > 0 时：始终不设置 driftExceeded = true
   */
  updateEnergy: (k: number, v: number, e: number) => void;

  /**
   * 仿真 reset 时调用：重置漂移基准和极值。
   *
   * 副作用：
   *   - energyInitial → null
   *   - energyDrift → 0
   *   - driftExceeded → false
   *   - energyMin → 0
   *   - energyMax → 0
   *   - isSimulationActive → false
   *   - energyBuffer 清空（数组长度置 0）
   *   - nanSkipCount → 0
   */
  resetEnergyTracking: () => void;
}
```

#### 组件 Props

```typescript
/**
 * EnergyMonitorPanel 的配置属性。
 * 所有属性均有默认值，组件可零配置使用。
 */
interface EnergyMonitorProps {
  /**
   * Canvas 宽度 (px)。默认 320。
   * 由父容器通过 ResizeObserver 动态传入。
   * 约束：>= 100（小于 100 时隐藏 Canvas，仅显示数字指示器）。
   */
  width?: number;

  /**
   * Canvas 高度 (px)。默认 160。
   * 约束：>= 60。
   */
  height?: number;

  /**
   * 时间窗口 (s)。图表 X 轴显示最近 N 秒的能量曲线。
   * 默认 30（即 1800 帧 @60fps）。
   * 约束：>= 5 且 <= 300（5s ~ 5min）。
   * 此值影响 energyBuffer 容量 = timeWindow * 60。
   */
  timeWindow?: number;

  /**
   * 是否显示动能/势能分项曲线。
   * 默认 true。关闭时仅显示总能量 E 曲线（绿色实线），不渲染 K 和 V 曲线。
   */
  showComponents?: boolean;
}
```

#### 内部数据结构：EnergyDataPoint

```typescript
/**
 * 能量时序数据点。
 * 不在 Zustand 中存储（避免双重存储），
 * 在本模块内部的环形缓冲区中维护（useRef<EnergyDataPoint[]>）。
 *
 * 时间反演模式下不追加新点（反演不产生新物理信息）。
 */
interface EnergyDataPoint {
  /** 仿真时间 (s)。来自 SIM-01 buffer[offset + FrameField.T]。
   *  正常模式下单调递增；时间反演模式下递减。
   *  示例值：12.345 */
  t: number;

  /** 动能 (J)。来自 store.kineticEnergy。
   *  约束：>= 0。示例值：4.905 */
  K: number;

  /** 势能 (J)。来自 store.potentialEnergy。
   *  可为负。示例值：-9.81 */
  V: number;

  /** 总能量 (J)。来自 store.totalEnergy。
   *  E = K + V。示例值：-4.905 */
  E: number;
}
```

### 输出定义（精确类型）

#### 组件渲染结构

```
┌───────────────────────────────────────────────┐
│  EnergyMonitorPanel (Card)                     │
│  ┌───────────────────────────────────────────┐ │
│  │  能量监控                    [正常|异常]   │ │ ← 标题行 + Badge（绿色"正常"/红色脉冲"超阈值"）
│  │  漂移: 0.023%  │  范围: [-5.10, -4.70] J  │ │ ← 指标行（font-mono tabular-nums）
│  │  (阻尼开启)                                │ │ ← 阻尼 > 0 时显示，仅提示不告警
│  ├───────────────────────────────────────────┤ │
│  │                                           │ │
│  │  ┌─ Canvas (逻辑像素 320×160) ──────────┐  │ │
│  │  │  E(t) ── 绿色实线 2px                 │  │ │ ← 能量折线图
│  │  │  K(t) - - 蓝色虚线 1px [4, 4] dash    │  │ │
│  │  │  V(t) ······ 橙色点线 1px [1, 3] dash │  │ │
│  │  │  X 轴: 时间 (s) 刻度 0/10/20/30       │  │ │
│  │  │  Y 轴: 能量 (J) 自动刻度              │  │ │
│  │  │  图例（右上角）: ━ E  ┅ K  ╌ V       │  │ │
│  │  └──────────────────────────────────────┘  │ │
│  └───────────────────────────────────────────┘ │
└───────────────────────────────────────────────┘
```

#### 图表颜色规范

| 曲线 | Canvas strokeStyle | lineWidth | 虚线样式 | 含义 |
|------|-------------------|-----------|---------|------|
| E（总能量） | `#22c55e`（green-500） | 2px | 实线 `[]` | 系统总能量，无阻尼时应近似水平 |
| K（动能） | `#3b82f6`（blue-500） | 1px | 虚线 `[4, 4]` | 系统动能，>= 0，与 V 互补 |
| V（势能） | `#f97316`（orange-500） | 1px | 点线 `[1, 3]` | 系统势能，可为负，与 K 互补 |

#### 漂移指示器 UI 状态映射

| driftExceeded | damping | 漂移数值颜色 | Badge 文字 | Badge 颜色 | 标题行状态 |
|:---:|:---:|---|---|---|---|
| `false` | `0` | `text-emerald-500` | "正常" | 绿色 (`default` variant) | 正常 |
| `true` | `0` | `text-red-500 font-bold` | "超阈值" | 红色 (`destructive` variant) + `animate-pulse` | 异常 |
| 任意 | `> 0` | `text-emerald-500`（始终绿色） | —（不显示 Badge） | — | 正常 + "(阻尼开启)" 标签 |
| 数据不可用 | 任意 | `text-muted-foreground` | "数据不可用" | 灰色 (`secondary` variant) | 数据不可用 |

### 核心逻辑步骤

#### 阶段 A：数据采集

**步骤 1：订阅能量帧更新**

- **操作对象**：`useSimulationStore` 的 `totalEnergy` 字段变化
- **具体操作**：
  1. 使用 Zustand `subscribe` 监听 store 变化（非 `useStore` hook，避免每帧触发 React 重渲染）。`subscribe` 回调接收完整 state，比较 `totalEnergy` 与上一次值的差异。
  2. 每次检测到 `totalEnergy` 变更（或任一能量字段变更）时调用 `get().updateEnergy(k, v, e)`：

     ```typescript
     function updateEnergy(k: number, v: number, e: number): void {
       const state = get();

       // 检查 NaN：跳过本帧
       if (isNaN(k) || isNaN(v) || isNaN(e)) {
         console.warn(`SIM-04: NaN energy detected (frame skipped). K=${k}, V=${v}, E=${e}`);
         nanSkipCount++;
         if (nanSkipCount >= MAX_NAN_FRAMES) {
           set({ isSimulationActive: false });
         }
         return;
       }

       // NaN 恢复：重置计数器
       if (nanSkipCount > 0) {
         nanSkipCount = 0;
         if (!state.isSimulationActive) {
           set({ isSimulationActive: true });
         }
       }

       // 首次记录基准能量（初始帧或 reset 后）
       if (state.energyInitial === null || !state.isSimulationActive) {
         set({
           energyInitial: e,
           energyMin: e,
           energyMax: e,
           isSimulationActive: true,
           kineticEnergy: k,
           potentialEnergy: v,
           totalEnergy: e,
         });
         // 追加首帧到缓冲区
         pushToEnergyBuffer({ t: state.t, K: k, V: v, E: e });
         return;
       }

       // 更新极值
       const newMin = Math.min(state.energyMin, e);
       const newMax = Math.max(state.energyMax, e);

       // 计算漂移（防止除零：分母 = max(|energyInitial|, 1e-10)）
       const denom = Math.max(Math.abs(state.energyInitial!), 1e-10);
       const drift = Math.abs(e - state.energyInitial!) / denom;

       // 漂移告警判定（阻尼系统豁免告警，但漂移仍计算和显示）
       const damping = state.params.damping;
       const exceeded = damping === 0 ? drift > DRIFT_THRESHOLD : false;

       // 锁存清除：阻尼状态变更时自动清除锁存
       // 通过比较当前阻尼与上次阻尼检测
       const dampingChanged = lastDamping !== damping;
       const finalExceeded = dampingChanged ? exceeded : (state.driftExceeded || exceeded);

       set({
         kineticEnergy: k,
         potentialEnergy: v,
         totalEnergy: e,
         energyMin: newMin,
         energyMax: newMax,
         energyDrift: drift,
         driftExceeded: finalExceeded,
       });

       // 追加到内部缓冲区（时间反演模式下跳过——反演不产生新物理信息）
       const direction = getDirectionFromStore(); // 从 store 或 Worker 状态读取当前积分方向
       if (direction === 1) {
         pushToEnergyBuffer({ t: state.t, K: k, V: v, E: e });
       }
     }
     ```

  3. 将 `{ t, K, V, E }` 追加到模块内部的环形缓冲区 `energyBuffer: EnergyDataPoint[]`（使用 `useRef` 持有，非 React state，容量 = `timeWindow * 60`，默认 1800）。超出容量时从头部移除旧数据（FIFO 策略，`energyBuffer.shift()`）。

- **输入来源**：SIM-01 的 `simulationLoop` → `consumeFrameToStore` → Zustand `setState`。`kineticEnergy`/`potentialEnergy`/`totalEnergy` 字段的变更由 `subscribe` 捕获。
- **输出去向**：`useSimulationStore` 能量切片更新（`energyInitial`/`energyDrift`/`driftExceeded`/`energyMin`/`energyMax`）+ 模块内部 `energyBuffer` 追加。
- **失败行为**：
  - `e` 为 NaN → 跳过本帧（不更新能量切片，不追加 buffer），`console.warn`，"nanSkipCount" 计数器 +1
  - 连续 60 帧（1 秒）NaN → 标记 `isSimulationActive = false`，面板显示"数据不可用"
  - 时间反演模式（`direction === -1`）→ 不追加 `energyBuffer`（反演是回溯已有数据），但 store 切片正常更新

**步骤 2：仿真重置时重新基准**

- **操作对象**：`energyInitial`、`energyMin`、`energyMax`、`energyBuffer`、告警锁存状态
- **具体操作**：
  1. 监听 `useSimulationStore` 的 reset 事件。reset 的检测方式：订阅 store 的 `t` 字段——当 `t` 从大于 0 的值突变为 0 且差值 > 1.0s（排除时间反演模式下的递减至 0，需同时检查积分方向不是反向）时，判定为 reset。
  2. 更可靠的检测方式：SIM-01 在执行 reset 时显式调用 `useSimulationStore.getState().resetEnergyTracking()`（如果该 action 已合并到 store 中）。
  3. 检测到 reset → 执行以下操作：

     ```typescript
     function resetEnergyTracking(): void {
       set({
         energyInitial: null,
         energyDrift: 0,
         driftExceeded: false,
         energyMin: 0,
         energyMax: 0,
         isSimulationActive: false,
       });
       // 清空内部缓冲区（通过修改 useRef 的 .current）
       energyBufferRef.current.length = 0;
       // 重置 NaN 计数器
       nanSkipCount = 0;
     }
     ```

  4. 下一帧 `totalEnergy` 到达时，步骤 1 检测到 `energyInitial === null` → 自动重新记录基准能量。

- **输入来源**：检测到 `t` 降为 0（SIM-01 Worker reset 后首个 batch 的第一帧，t=0）；或 SIM-01 直接调用 `resetEnergyTracking()`。
- **输出去向**：重置的能量切片状态 + 清空的 `energyBuffer`。
- **失败行为**：
  - 误检测（时间反演模式下 `t` 递减但不归零）→ 检查 `t` 递减但不为 0 时不触发 reset。更精确的判定：同时检查 `simulationStore` 的 `isRunning` 状态是否短暂变为 false 后恢复，或比较 `t` 差值 > 1.0s（正向跳跃）。
  - 若因误检测导致 reset → 下一帧会自动用新的 `energyInitial` 覆盖，但之前的能量历史丢失。此为可接受的降级（极端误检测场景概率极低）。

#### 阶段 B：Canvas 渲染

**步骤 3：D3 Canvas 图表初始化**

- **操作对象**：`<canvas>` 元素及其 `CanvasRenderingContext2D`
- **具体操作**：
  1. 组件挂载时通过 `useRef<HTMLCanvasElement>` 创建 Canvas 引用。
  2. 获取 `CanvasRenderingContext2D`：`const ctx = canvasRef.current.getContext('2d')`。
  3. 计算物理像素：
     ```typescript
     const dpr = window.devicePixelRatio || 1;
     const canvas = canvasRef.current;
     canvas.width = width * dpr;   // 物理像素宽度
     canvas.height = height * dpr; // 物理像素高度
     canvas.style.width = `${width}px`;   // CSS 逻辑像素宽度
     canvas.style.height = `${height}px`; // CSS 逻辑像素高度
     ctx.scale(dpr, dpr);  // 缩放上下文使后续绘制使用逻辑像素坐标
     ```
  4. 定义 margin 常量：
     ```typescript
     const margin = { top: 20, right: 80, bottom: 30, left: 60 };
     // right: 80 为图例预留空间
     ```
  5. 创建 D3 scale（在 JS 中而非 rAF 中——仅在初始化或 resize 时重建）：
     ```typescript
     const xScale = d3.scaleLinear()
       .domain([0, timeWindow])   // X: 仿真时间 (s)，固定显示最近 timeWindow 秒
       .range([margin.left, width - margin.right]);

     const yScale = d3.scaleLinear()
       .domain([energyMin, energyMax])  // Y: 能量 (J)，初始值 0-1，运行时动态更新
       .range([height - margin.bottom, margin.top])
       .nice();  // 圆整到整洁数值（如 -5.0, -4.5, -4.0 …）
     ```
  6. 创建 D3 line generator（绑定 Canvas 2D 上下文）：
     ```typescript
     const lineE = d3.line<EnergyDataPoint>()
       .x(d => xScale(d.t % timeWindow))   // NOTE: 此处使用滑动窗口而非取模，见步骤 4
       .y(d => yScale(d.E))
       .context(ctx);  // 绑定到 Canvas 2D 上下文

     const lineK = d3.line<EnergyDataPoint>()
       .x(d => xScale(d.t % timeWindow))
       .y(d => yScale(d.K))
       .context(ctx);

     const lineV = d3.line<EnergyDataPoint>()
       .x(d => xScale(d.t % timeWindow))
       .y(d => yScale(d.V))
       .context(ctx);
     ```
  7. 绘制坐标轴（仅在初始化或 resize 时全量重绘）：
     - X 轴（底部）：使用 `d3.axisBottom(xScale).ticks(4)`，标签 "时间 (s)"。绘制在 `y = height - margin.bottom` 处。
     - Y 轴（左侧）：使用 `d3.axisLeft(yScale).ticks(5)`，标签 "能量 (J)"。绘制在 `x = margin.left` 处。
     - 网格线：X 轴网格线（水平虚线，颜色 `#e5e7eb`）在 Y 轴刻度处；Y 轴网格线（垂直虚线）在 X 轴刻度处。使用 `ctx.setLineDash([2, 4])` + `ctx.strokeStyle = '#e5e7eb'` + `ctx.lineWidth = 0.5` 绘制。
  8. 绘制图例（右上角，仅在初始化或 resize 时绘制）：
     - 位置：`x = width - margin.right + 10`, `y = margin.top + 5`
     - 图例项（每项间距 16px 垂直）：
       - ━ E（绿色实线 2px）：`ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 2; ctx.setLineDash([]);` 绘制短线
       - ┄ K（蓝色虚线 1px）：`ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);` 绘制短线
       - ╌ V（橙色点线 1px）：`ctx.strokeStyle = '#f97316'; ctx.lineWidth = 1; ctx.setLineDash([1, 3]);` 绘制短线

- **输入来源**：`width`/`height` props + `timeWindow` + store 的 `energyMin`/`energyMax`（用于 yScale 初始 domain）
- **输出去向**：就绪的 Canvas 渲染管线（`ctx` + `xScale`/`yScale` + `lineE`/`lineK`/`lineV`），等待步骤 4 的每帧更新
- **失败行为**：
  - Canvas 2D 上下文获取失败（`getContext('2d')` 返回 null，极端情况如浏览器内存耗尽）→ 降级为纯数字显示（不渲染图表），`console.error("SIM-04: Failed to get 2D context")`。在组件中渲染替代 UI：`<div className="text-muted-foreground">图表不可用</div>`。
  - `width` < 100 → 隐藏 Canvas 元素，仅显示漂移指示器（纯数字模式）。

**步骤 4：每帧 Canvas 更新**

- **操作对象**：Canvas 2D 上下文（增量绘制，非重建）
- **具体操作**：
  1. 使用 `requestAnimationFrame` 驱动更新（与 SIM-01 的 `simulationLoop` 解耦——本模块有独立的 rAF 循环）。
  2. 独立 rAF 循环的控制逻辑：
     ```typescript
     function renderLoop() {
       if (!ctxRef.current || !isVisible) {
         // Canvas 不可见时降至 2fps 检查（节能模式）
         rafId = requestAnimationFrame(() => setTimeout(() => renderLoop(), 500));
         return;
       }
       drawFrame();
       rafId = requestAnimationFrame(renderLoop);
     }
     ```
  3. 每帧 `drawFrame()` 执行以下子步骤：

     **a. 清空 Canvas**：
     ```typescript
     ctx.clearRect(0, 0, width, height);
     ```

     **b. 重绘网格线和坐标轴**（重用已初始化的 D3 axis 对象，通过 `.context(ctx)` 重新绑定）：
     ```typescript
     // 注意：D3 axis 不支持直接 context 绑定。替代方案：
     // 坐标轴和网格线在初始化时预渲染到离屏 Canvas，
     // 每帧通过 ctx.drawImage(offscreenCanvas, 0, 0) 快速复制。
     // 仅在 resize 时重建离屏 Canvas。
     ```
     实际实现中推荐使用离屏 Canvas 预渲染坐标轴和网格线（因为它们不随数据变化），每帧 `drawImage` 复制到主 Canvas。这避免了每帧调用 D3 axis 绘制（D3 axis 每帧生成 SVG path 字符串再解析到 Canvas 的开销）。

     **c. 检查 Y 轴范围是否需要更新**：
     ```typescript
     const currentE = store.getState().totalEnergy;
     if (currentE < yScale.domain()[0] || currentE > yScale.domain()[1]) {
       // 能量超出当前 Y 轴范围 → 扩展 domain 并重建离屏坐标轴
       const newMin = Math.min(yScale.domain()[0], currentE);
       const newMax = Math.max(yScale.domain()[1], currentE);
       yScale.domain([newMin, newMax]).nice();
       redrawOffscreenAxis();  // 重建离屏 Canvas 中的坐标轴
     }
     ```
     注意：Y 轴范围只扩展不收缩（避免坐标轴频繁跳动）。仅在 reset 时重置范围。

     **d. 准备渲染数据（滑动窗口 + 降采样）**：
     ```typescript
     const currentTime = store.getState().t;
     const windowStart = currentTime - timeWindow;

     // 从 energyBuffer 中过滤最近 timeWindow 秒的数据点
     // energyBuffer 按 t 递增排序（正常模式下）
     const windowedData: EnergyDataPoint[] = [];
     for (let i = energyBuffer.length - 1; i >= 0; i--) {
       if (energyBuffer[i].t >= windowStart) {
         windowedData.unshift(energyBuffer[i]);
       } else {
         break; // buffer 有序，早于窗口的直接跳出
       }
     }

     // 降采样（每 2 帧取 1 帧，渲染点数 ≤ 900 = 30s * 30fps）
     const renderData = windowedData.filter((_, idx) => idx % 2 === 0);
     ```

     **e. 重新映射 X 坐标**：
     ```typescript
     // 使用滑动窗口：X 坐标 = (data.t - windowStart) / timeWindow * plotWidth
     // 而不是取模（取模在 t 超过 timeWindow 后线条会缠绕）
     const plotWidth = width - margin.right - margin.left;
     const windowToX = (t: number) => margin.left + ((t - windowStart) / timeWindow) * plotWidth;

     // 更新 line generators 的 x 访问器（每次重新创建，开销极小：仅函数对象）
     const lineE = d3.line<EnergyDataPoint>()
       .x(d => windowToX(d.t))
       .y(d => yScale(d.E))
       .context(ctx);
     // ... lineK, lineV 同理
     ```

     **f. 绘制三条能量曲线**：
     ```typescript
     ctx.save();

     // E 线（总能量）：绿色实线，2px
     ctx.strokeStyle = "#22c55e";
     ctx.lineWidth = 2;
     ctx.setLineDash([]);
     ctx.beginPath();
     lineE(renderData);
     ctx.stroke();

     if (showComponents) {
       // K 线（动能）：蓝色虚线，1px
       ctx.strokeStyle = "#3b82f6";
       ctx.lineWidth = 1;
       ctx.setLineDash([4, 4]);
       ctx.beginPath();
       lineK(renderData);
       ctx.stroke();

       // V 线（势能）：橙色点线，1px
       ctx.strokeStyle = "#f97316";
       ctx.lineWidth = 1;
       ctx.setLineDash([1, 3]);
       ctx.beginPath();
       lineV(renderData);
       ctx.stroke();
     }

     ctx.restore();
     ```

  4. 本模块的 rAF 与 SIM-01 渲染管线的 rAF 解耦，允许独立控制刷新率。默认 60fps，可通过内部变量降为 30fps（节省性能时，如标签页不可见）。

- **输入来源**：`energyBuffer`（本模块内部维护的数据点数组，通过 `useRef` 持有）、store 的 `totalEnergy`（用于 Y 轴范围自适应）
- **输出去向**：Canvas 像素更新，显示给用户
- **失败行为**：
  - `energyBuffer` 为空（仿真未开始）→ 仅清空 Canvas + 绘制坐标轴（离屏 Canvas 复制），不绘制任何能量曲线
  - `renderData` 仅有 1 个数据点（仿真刚开始）→ D3 line generator 不绘制（需要 >= 2 个点），图表空白
  - Canvas 上下文已丢失（`ctx.isContextLost() === true`）→ 跳过本帧绘制，不崩溃。WebGL 上下文恢复事件触发后自动恢复

**步骤 5：漂移指示器更新**

- **操作对象**：漂移指示器 DOM 元素（React 组件）
- **具体操作**：
  1. 使用 React 组件 `DriftIndicator` 订阅 store 的相关字段：

     ```tsx
     function DriftIndicator() {
       // 使用选择器订阅，仅在这些字段变化时重渲染
       const drift = useSimulationStore(s => s.energyDrift);
       const exceeded = useSimulationStore(s => s.driftExceeded);
       const energyMin = useSimulationStore(s => s.energyMin);
       const energyMax = useSimulationStore(s => s.energyMax);
       const damping = useSimulationStore(s => s.params.damping);
       const isActive = useSimulationStore(s => s.isSimulationActive);
       const [latchCleared, setLatchCleared] = useState(false);

       // 处理清除按钮逻辑
       const handleClear = useCallback(() => {
         if (drift < DRIFT_THRESHOLD) {
           useSimulationStore.setState({ driftExceeded: false });
           setLatchCleared(true);
         }
         // 若漂移仍超阈值，按钮无效果（driftExceeded 保持 true）
       }, [drift]);
     ```

  2. 计算显示值：
     ```typescript
     const driftPercent = isActive
       ? isNaN(drift) ? "--" : (drift * 100).toFixed(3)
       : "--";
     ```

  3. 渲染JSX（完整逻辑）：

     ```tsx
     return (
       <div className="flex items-center gap-3 text-sm">
         {/* 漂移数值 */}
         <span className="text-muted-foreground">漂移:</span>
         <span className={cn(
           "font-mono tabular-nums",
           // 阻尼系统始终绿色；无阻尼系统按 exceeded 判定
           damping > 0 || !exceeded
             ? "text-emerald-500"
             : "text-red-500 font-bold"
         )}>
           {driftPercent}%
         </span>

         {/* 漂移超阈值告警 Badge（仅阻尼关闭时显示） */}
         {damping === 0 && exceeded && (
           <Badge variant="destructive" className="animate-pulse">
             超阈值
           </Badge>
         )}

         {/* 阻尼已开启提示 */}
         {damping > 0 && (
           <span className="text-muted-foreground text-xs">(阻尼开启)</span>
         )}

         {/* 清除按钮（仅告警锁存状态时显示） */}
         {damping === 0 && exceeded && drift < DRIFT_THRESHOLD && (
           <button
             onClick={handleClear}
             className="text-xs text-muted-foreground hover:text-foreground underline"
           >
             清除
           </button>
         )}

         {/* 能量范围 */}
         <span className="text-muted-foreground text-xs ml-auto">
           {isActive
             ? `范围: [${energyMin.toFixed(2)}, ${energyMax.toFixed(2)}] J`
             : "数据不可用"
           }
         </span>
       </div>
     );
     ```

  4. 锁存逻辑的精确实现：
     - `driftExceeded` 在漂移首次 >= 0.5% 时设为 `true`
     - 漂移恢复 < 0.5% 后，`driftExceeded` 保持 `true`（锁存）
     - 用户点击"清除"按钮：若当前 `drift < 0.5%` → 设置 `driftExceeded = false`；若当前 `drift >= 0.5%` → 按钮无效果
     - 仿真 reset：`driftExceeded` 重置为 `false`
     - 阻尼状态变更（`damping: 0 → > 0` 或 `> 0 → 0`）：自动清除锁存（`driftExceeded = false`），因为告警规则已变更

- **输入来源**：`useSimulationStore` 的 `energyDrift`/`driftExceeded`/`energyMin`/`energyMax`/`isSimulationActive`/`params.damping`
- **输出去向**：DOM 更新（React 重渲染）
- **失败行为**：
  - `energyDrift` 为 NaN → 显示 "--"（`driftPercent = "--"`），不显示 Badge
  - `isSimulationActive === false` 且 `energyInitial === null`（仿真从未运行）→ 显示 "漂移: --" + "数据不可用"

### 依赖与集成接口

#### 本模块消费的外部接口

| 依赖方 | 具体接口 | 用途 |
|--------|----------|------|
| Zustand (useSimulationStore) | `useSimulationStore(s => s.kineticEnergy)` | 订阅每帧动能值（供 Canvas 渲染和漂移计算） |
| Zustand (useSimulationStore) | `useSimulationStore(s => s.potentialEnergy)` | 订阅每帧势能值 |
| Zustand (useSimulationStore) | `useSimulationStore(s => s.totalEnergy)` | 订阅每帧总能量值 |
| Zustand (useSimulationStore) | `useSimulationStore(s => s.energyDrift)` | 漂移指示器订阅漂移百分比 |
| Zustand (useSimulationStore) | `useSimulationStore(s => s.driftExceeded)` | 漂移指示器订阅告警状态 |
| Zustand (useSimulationStore) | `useSimulationStore(s => s.energyMin)` / `s.energyMax` | 漂移指示器显示能量范围 |
| Zustand (useSimulationStore) | `useSimulationStore(s => s.isSimulationActive)` | 判断数据是否可用 |
| Zustand (useSimulationStore) | `useSimulationStore(s => s.params.damping)` | 判断阻尼系统豁免告警 |
| Zustand (useSimulationStore) | `useSimulationStore(s => s.t)` | 获取当前仿真时间（滑动窗口起点） |
| Zustand (useSimulationStore) | `useSimulationStore.getState().updateEnergy` | SIM-01 的 `consumeFrameToStore` 调用以更新能量切片 |
| Zustand (useSimulationStore) | `useSimulationStore.getState().resetEnergyTracking` | 仿真 reset 时调用 |
| D3.js | `d3.scaleLinear()` | 创建能量时序图的 X/Y 比例尺 |
| D3.js | `d3.line<EnergyDataPoint>().x(...).y(...).context(ctx)` | 创建 Canvas 绑定的折线生成器 |
| D3.js | `d3.axisBottom(xScale).ticks(4)` | 生成 X 轴刻度 |
| D3.js | `d3.axisLeft(yScale).ticks(5)` | 生成 Y 轴刻度 |
| shadcn/ui | `<Card>` | 面板容器 |
| shadcn/ui | `<Badge variant="destructive">` | 漂移超阈值告警标签 |
| shadcn/ui | `<Tooltip>` | 悬浮数值详情（可选用） |

#### 对外暴露的公共接口（供其他模块消费）

| 消费方模块 | 调用方式 | 消费的数据 | 读取/写入 |
|-----------|---------|-----------|:---:|
| LAB-02 物理验证套件 | `useSimulationStore(s => s.driftExceeded)` | 能量守恒验证是否通过（漂移 < 0.5%） | 只读 |
| LAB-02 物理验证套件 | `useSimulationStore(s => s.energyDrift)` | 精确漂移数值（写入验证报告） | 只读 |
| LAB-02 物理验证套件 | `useSimulationStore(s => s.energyInitial)` | 基准总能量（用于自定义验证计算） | 只读 |
| EXP-03 声音化引擎 | `useSimulationStore(s => s.kineticEnergy)` | 动能值 → 映射音色亮度 | 只读 |
| 任何模块 | `useSimulationStore(s => s.totalEnergy)` | 当前总能量 | 只读 |
| 任何模块 | `useSimulationStore(s => s.energyMin)` / `s.energyMax` | 能量范围 | 只读 |

**Store 写入权声明**：
- `kineticEnergy`/`potentialEnergy`/`totalEnergy`：由 SIM-01 的 `consumeFrameToStore` **独占写入**。本模块（SIM-04）只读这三个字段。
- `energyInitial`/`energyDrift`/`driftExceeded`/`energyMin`/`energyMax`/`isSimulationActive`：由本模块（SIM-04）**独占写入**。其他模块只读这些字段。
- `updateEnergy`/`resetEnergyTracking`：由 SIM-01 调用，本模块定义其实现。

### 状态机

能量监控面板的告警状态机（仅适用于 `damping === 0` 的情况；阻尼 > 0 时所有状态退化为 `normal-disabled`）：

| 当前状态 | 触发事件 | 下一状态 | 前置条件 | 副作用 |
|----------|----------|----------|----------|--------|
| `normal` | `totalEnergy` 更新 | `normal` | `drift < 0.5%` | 漂移指示器显示绿色百分比；Badge 绿色 "正常"；`driftExceeded = false` |
| `normal` | `totalEnergy` 更新 | `alerted` | `drift >= 0.5%` | 漂移指示器变红色加粗；Badge 红色脉冲 "超阈值"（`animate-pulse`）；`driftExceeded = true` |
| `alerted` | `totalEnergy` 更新 | `alerted` | `drift < 0.5%` 且用户未点击"清除" | 漂移指示器恢复正常绿色数值（drift < 0.5%），但 Badge 保持红色（**锁存机制**）；`driftExceeded` 保持 true |
| `alerted` | 用户点击 "清除" 按钮 | `normal` | `drift < 0.5%` | Badge 恢复绿色 "正常"；`driftExceeded = false`；漂移指示器保持绿色 |
| `alerted` | 用户点击 "清除" 按钮 | `alerted` | `drift >= 0.5%`（仍然超阈值） | 无变化。Badge 保持红色；`driftExceeded` 保持 true；按钮不产生效果 |
| `normal` 或 `alerted` | `damping` 从 0 变为 > 0 | `normal-disabled` | 用户修改参数开启阻尼 | 自动清除告警锁存；`driftExceeded = false`；Badge 隐藏；显示 "(阻尼开启)" 标签 |
| `normal-disabled` | `damping` 从 > 0 变为 0 | `normal` | 用户修改参数关闭阻尼 | 重新启用告警检查；`energyInitial` 重置为当前 `totalEnergy`（漂移从零开始重新计算，避免阻尼期间的衰减被计入漂移） |
| 任意 | `resetEnergyTracking` | `normal` | 仿真 reset | 清除所有状态：`energyInitial = null`, `energyDrift = 0`, `driftExceeded = false`, `energyMin = 0`, `energyMax = 0`, `isSimulationActive = false`, `energyBuffer` 清空 |
| `normal-disabled` | `resetEnergyTracking` | `normal-disabled` | 仿真 reset 但阻尼仍 > 0 | 同 reset，但 `driftExceeded` 保持 false。面板显示 "(阻尼开启)" |
| 任意 | 连续 60 帧 NaN | `data-unavailable` | `nanSkipCount >= MAX_NAN_FRAMES` | `isSimulationActive = false`；面板显示 "数据不可用"；Canvas 图表清空；等待 SIM-01 恢复 |
| `data-unavailable` | `totalEnergy` 恢复为非 NaN | `normal`（或 `normal-disabled`） | `nanSkipCount < MAX_NAN_FRAMES` 且 `!isNaN(e)` | `isSimulationActive = true`；恢复数据采集和渲染；依阻尼状态重新计算漂移基准 |

### 异常与边界条件

#### 异常 1：初始能量为零（边界情形）

- **触发条件**：`totalEnergy` 的初始值为精确 0（如 m1=m2=0 的退化场景，虽然正常参数不应出现）。
- **处理策略**：
  1. `updateEnergy` 中计算漂移分母：`denom = Math.max(Math.abs(energyInitial), 1e-10)`
  2. 如果 `|energyInitial| < 1e-10`，分母被 clamp 到 `1e-10`，导致漂移值极其大（> 100%）
  3. 立即触发 `driftExceeded = true`（因为 drift >> 0.005）
  4. UI 显示漂移 `"> 999%"` + 红色告警
  5. 这是一个正确的诊断信号——用户应意识到参数设置不当
- **重试参数**：不自动重试。用户调整参数后（通过 SIM-02 修改 m1 或 m2 为正数）reset 仿真，新基准能量自动重新记录。

#### 异常 2：Canvas 渲染帧率低于仿真帧率导致数据积压

- **触发条件**：Canvas 以 30fps 渲染（如标签页不可见降频），但能量数据以 60fps 到达 → `energyBuffer` 每 2 帧净增长 1 个积压。
- **处理策略**：
  1. `energyBuffer` 容量固定为 `timeWindow * 60`（默认 1800 = 30s × 60fps）
  2. 超出容量时从头部移除旧数据（FIFO）：`if (energyBuffer.length > capacity) energyBuffer.shift()`
  3. Canvas 每帧渲染时进行降采样：`renderData = windowedData.filter((_, idx) => idx % 2 === 0)`（每 2 个采样点取 1 个）
  4. 即使数据积累 1800 帧，降采样后渲染点数 ≤ 900，Canvas `stroke()` 调用 < 0.5ms
  5. 不需要额外的背压机制——FIFO + 降采样自动处理
- **重试参数**：自动降采样，无需人工介入。不触发任何告警。

#### 异常 3：能量值 NaN（积分发散前兆）

- **触发条件**：SIM-01 Worker 积分发散导致 `totalEnergy` 为 NaN。SIM-01 已检测 NaN 并发送 error，但在发送 error 前可能有若干帧已通过 `consumeFrameToStore` 写入 store。
- **处理策略**：
  1. `updateEnergy` 入口处检查 `isNaN(k) || isNaN(v) || isNaN(e)`：
     - 为 true → 跳过本帧所有更新（`set` 不调用），`nanSkipCount++`
     - 记录 `console.warn("SIM-04: NaN energy detected, frame skipped", { nanSkipCount })`
  2. `energyBuffer` 不追加 NaN 数据点（避免 D3 line generator 在 NaN 处绘制断裂线段——实际 D3 的 `.defined()` 默认为 true，NaN 点会产生断线）
  3. 连续 NaN 帧数 `nanSkipCount >= MAX_NAN_FRAMES`（60 帧 = 1 秒）：
     - 标记 `isSimulationActive = false`
     - 面板漂移指示器显示 "--" + "数据不可用" 文字
     - Canvas 图表保持最后一帧有效数据（不清空，但冻结不再更新）
  4. 一旦有有效帧（`!isNaN(e)`）到达：
     - `nanSkipCount = 0`
     - `isSimulationActive = true`（恢复）
     - 如果 `energyInitial === null`（SIM-01 触发了 reset 并清空了初始值），自动重新初始化
- **重试参数**：自动等待 SIM-01 恢复。不主动干预。不重建 Canvas。SIM-01 的 error 恢复机制触发 reset 后 → `resetEnergyTracking` 由 reset 流程调用。

#### 异常 4：Canvas resize 导致坐标轴失效

- **触发条件**：父容器通过 ResizeObserver 改变 `width`/`height` props（面板折叠/展开、浏览器窗口缩放）。
- **处理策略**：
  1. 组件 `useEffect` 监听 `width`/`height` 变化（作为依赖数组项）：
     ```typescript
     useEffect(() => {
       if (!ctx || !canvas) return;
       // 更新 Canvas 物理像素
       canvas.width = width * dpr;
       canvas.height = height * dpr;
       canvas.style.width = `${width}px`;
       canvas.style.height = `${height}px`;
       ctx.scale(dpr, dpr);
       // 重建 scale range
       xScale.range([margin.left, width - margin.right]);
       yScale.range([height - margin.bottom, margin.top]);
       // 重建离屏坐标轴 Canvas
       redrawOffscreenAxis();
       // 图例位置更新
     }, [width, height]);
     ```
  2. 变化 > 10px 时才触发重建（防抖，避免连续 resize 时频繁重建）。
  3. `energyBuffer` 数据不丢失（存储在 `useRef` 中，与 Canvas 尺寸无关）。
  4. 如果 `width < 100`：隐藏 Canvas 元素，仅显示数字指示器。
- **重试参数**：每次 resize 全量重绘一次。不重试。使用 `useEffect` 自动响应。

#### 异常 5：阻尼导致能量单调衰减时的"假阳性"漂移告警

- **触发条件**：用户设置了 `damping > 0`（非保守系统），能量随仿真时间单调衰减。经过足够长时间（如 100s @ damping=0.1），漂移必然 > 0.5%。
- **处理策略**：
  1. `updateEnergy` 中检查 `useSimulationStore.getState().params.damping`
  2. 若 `damping > 0`：
     - 漂移照常计算和显示（绿色数值，不隐藏真实数据）
     - 但在任何情况下都不设置 `driftExceeded = true`（豁免告警）
  3. 面板标题行显示 "(阻尼开启)" 灰色标签，提示用户漂移告警已禁用
  4. 阻尼恢复为 0 时：
     - 自动清除 `driftExceeded` 锁存
     - 重新初始化 `energyInitial` 为当前 `totalEnergy`（漂移基准重置为阻尼关闭时刻的能量值，避免阻尼期间的衰减被计入后续漂移计算）
     - 恢复 0.5% 阈值检查
- **重试参数**：无，行为自动切换。此异常是正常物理行为，不是程序错误。

#### 异常 6：时间反演模式下 energyBuffer 数据顺序错乱

- **触发条件**：时间反演模式下仿真 `t` 递减，新数据点的 `t` 可能小于 `energyBuffer` 中已存在数据点的 `t`。如果 Canvas 渲染时未排序，能量折线图会绘制成锯齿状。
- **处理策略**：
  1. `updateEnergy` 中检测积分方向（通过 store 或 Worker 状态查询当前 `direction`）。
  2. 若 `direction === 1`（正向）：正常追加数据点 → `energyBuffer.push(dp)`。
  3. 若 `direction === -1`（反向）：**不追加新数据点**到 `energyBuffer`。原因：时间反演是回溯已有历史轨迹，不产生新物理信息；且追加递减 t 的数据点会导致排序问题。
  4. Canvas 渲染时 `windowedData` 始终按 `t` 升序排列（`energyBuffer` 中数据本身保持升序，无需每帧排序）：`energyBufferRef.current.sort((a, b) => a.t - b.t)` 仅在方向切换时执行一次。
  5. 如果 `showComponents === false` 或 Canvas 隐藏，简化处理。
- **重试参数**：无。行为正确后无需干预。

#### 异常 7：阻尼状态变更时的告警锁存清除

- **触发条件**：用户通过 SIM-02 切换阻尼状态（`damping: 0 → 0.1` 或反之）。`lastDamping` 与当前 `damping` 不同。
- **处理策略**：
  1. `updateEnergy` 维护 `lastDamping` 变量（模块闭包内，非 store 字段）。
  2. 每次调用时比较 `currentDamping !== lastDamping`：
     - 若变更 → 自动设置 `driftExceeded = false`（清除锁存）
     - 若 `damping: > 0 → 0` → 额外重置 `energyInitial = e`（重新基准，避免阻尼衰减被计入漂移）
     - 更新 `lastDamping = currentDamping`
  3. 面板 Badge 和标题行状态立即更新（无需等待用户点击"清除"）。
- **重试参数**：无。每次 `updateEnergy` 调用自动检测。

### 原则兑现清单

| 原则来源 | 原则名称 | 代码级约束 |
|----------|----------|------------|
| 功能设计_v0 §五 5.2 | 能量守恒标准 | `DRIFT_THRESHOLD = 0.005`；1000s 内漂移 < 0.5% 视为通过；仅 `damping === 0` 时检查此标准（阻尼系统豁免） |
| 功能设计_v0 §一 1.1 | 分层递进认知 | 本模块仅展示能量数据（感知层→分析层过渡），不做物理判定（判定交给 LAB-02）。`driftExceeded` 是告警标识而非验证结论 |
| 技术栈设计 §3.2 | Canvas 高性能渲染 | 使用 Canvas 2D（非 SVG）渲染能量折线图；每帧仅 `clearRect` + `drawImage`(离屏坐标轴) + `stroke`，无 DOM 操作；D3 scale 仅在 resize 时重建 |
| 通用原则 | 实时性 | 漂移指示器更新延迟 < 2 帧（~33ms @60fps，因使用 Zustand subscribe 而非 React 重渲染驱动）；图表 Y 轴自适应范围更新延迟 < 60 帧（1s） |
| AGENT.md | 逻辑层与表现层分离 | `useSimulationStore` subscribe 处理数据采集（逻辑层），`DriftIndicator` React 组件仅负责订阅和渲染（表现层），`EnergyCanvas` 组件管理 Canvas 渲染管线（表现层）。禁止在 React 组件中直接操作 `energyBuffer` |
| 功能设计_v0 §九 | 优雅降级 | Canvas 2D 上下文获取失败 → 降级为纯数字显示；`energyBuffer` 为空 → 仅显示坐标轴；NaN 连续 → 显示"数据不可用"；`width < 100` → 隐藏 Canvas |
| AGENT.md | 零 Mock 数据 | 所有能量数据来源于 SIM-01 Worker 的真实积分输出。`energyBuffer` 仅在 `direction === 1` 时追加真实数据点。禁止硬编码测试数据 |

### 验收测试场景

#### 正向测试 1：无阻尼仿真能量漂移正常

- **Given**：
  - 仿真参数：`{ m1: 1.0, m2: 1.0, L1: 1.0, L2: 1.0, g: 9.81, damping: 0 }`，方法 = `"RK4"`
  - 初始条件：`{ theta1: 1.5708, theta1Dot: 0, theta2: 1.5708, theta2Dot: 0 }`
  - 仿真已运行 600 帧（10s 物理时间）
  - 能量监控面板已渲染，`width=320, height=160, timeWindow=30, showComponents=true`
- **When**：观察面板上的漂移指示器和折线图
- **Then**：
  - 漂移百分比 < 0.005%（RK4 在 10s 内漂移极小，正确实现应 < 0.001%）
  - 漂移指示器显示绿色数值（`text-emerald-500`），格式为 `0.XXX%`
  - Badge 显示绿色 "正常"（`<Badge>正常</Badge>`，非 destructive variant）
  - Canvas 上 K（蓝虚线）、V（橙点线）、E（绿实线）三条曲线均可见
  - E 线近似水平直线（无阻尼时总能量守恒，10s 内波动极小）
  - K 和 V 线呈互补锯齿状（动能和势能相互转化）
  - `driftExceeded === false`
  - 能量范围显示合理数值（如 `[-5.0, -4.8] J`）
  - 无控制台错误或警告

#### 正向测试 2：阻尼开启时漂移告警豁免

- **Given**：
  - 仿真参数中 `damping = 0.1`（非保守系统），其余同测试 1
  - 仿真运行 600 帧（10s），能量因阻尼持续衰减
- **When**：观察面板状态
- **Then**：
  - 漂移百分比显示实际值（可能 > 1%），但颜色保持绿色（`text-emerald-500`）
  - 面板标题行显示 `(阻尼开启)` 灰色标签
  - `driftExceeded === false`（始终为 false，豁免）
  - Badge **不**触发红色告警（无 `<Badge variant="destructive">`）
  - Canvas 上 E 线呈下降趋势（能量单调衰减，符合阻尼物理）
  - "清除"按钮不显示（因为没有告警锁存状态）

#### 正向测试 3：仿真 reset 后漂移基准重置

- **Given**：
  - 仿真已运行 300 帧（5s），`energyInitial = -4.905`
  - 用户通过 SIM-02 修改初始条件（`theta1 = 2.0`），触发 reset
- **When**：
  - reset 完成（检测 `t` 变为 0 或 `resetEnergyTracking` 被调用）
  - 仿真继续运行 300 帧
- **Then**：
  - `energyInitial` 在 reset 后被重新记录为新初始帧的 `totalEnergy`（非旧值 -4.905）
  - 漂移百分比基于新的 `energyInitial` 重新计算
  - `energyBuffer` 被清空（旧仿真数据不污染新图表）
  - Canvas 图表从 `t = 0` 重新开始绘制（X 轴起点为 0）
  - `driftExceeded` 重置为 `false`
  - `energyMin` 和 `energyMax` 从新仿真数据重新追踪

#### 异常测试 1：阻尼关闭时漂移超阈值告警

- **Given**：
  - `damping = 0`，`method = "Euler"`（Euler 方法能量漂移大，约 1%/10s）
  - 仿真运行 1000 帧以上（16.7s+）
- **When**：观察面板状态变化
- **Then**：
  - 在某个时刻（约 500 帧后）漂移超过 0.5%
  - `driftExceeded` 变为 `true`
  - 漂移数值从绿色变为**红色加粗**（`text-red-500 font-bold`）
  - Badge 显示红色脉冲 "超阈值"（`<Badge variant="destructive" className="animate-pulse">超阈值</Badge>`）
  - Canvas 上 E 线出现可见的上升或下降趋势（能量漂移，Euler 方法通常能量注入）
  - 用户点击 "清除" 按钮：由于漂移仍 > 0.5%，按钮无效果（Badge 保持红色）
  - 用户切换为 `"RK4"` 方法后漂移恢复正常（< 0.5%）：
    - 漂移数值恢复绿色
    - 但 Badge 保持红色（锁存）
    - "清除"按钮出现
  - 用户点击"清除"后 Badge 恢复绿色（锁存解除）

#### 异常测试 2：能量 NaN 时面板不崩溃

- **Given**：仿真正常运行中，面板显示正常漂移数据
- **When**：模拟 SIM-01 写入 `totalEnergy = NaN`（通过手动调用 `updateEnergy(0, 0, NaN)` 或 Worker 注入 NaN 帧）
- **Then**：
  - `updateEnergy` 检测到 `isNaN(e)` → 跳过本帧（不修改 store 能量切片）
  - 面板漂移指示器保持上一次有效值（不显示 NaN 字符串）
  - Canvas 图表在 NaN 帧处留空（不绘制断裂线段），下一有效帧继续绘制（如果 D3 line generator 遇到 NaN 会断线，因为未追加 NaN 点到 buffer）
  - 连续 60 帧 NaN（约 1s）：面板显示 "数据不可用"
  - 组件未崩溃（无白屏或 Error Boundary 触发）
  - 有效帧恢复后：面板自动恢复正常数据采集和渲染

#### 异常测试 3：Canvas 容器过小时降级为数字模式

- **Given**：`width = 80`（小于 100 阈值），`height = 160`
- **When**：`EnergyMonitorPanel` 渲染
- **Then**：
  - Canvas 元素不渲染（`<canvas>` 元素 `display: none` 或不挂载）
  - 漂移指示器正常渲染（DOM 元素）
  - 面板 Card 正常显示（标题行 + 指标行可见）
  - 无控制台错误

### 注意事项与禁止行为

1. **【store 写入权】** `kineticEnergy`/`potentialEnergy`/`totalEnergy` 三个原始值由 SIM-01 的 `consumeFrameToStore` 独占写入。本模块（SIM-04）只读这三个字段。本模块写入的字段是 `energyInitial`/`energyDrift`/`driftExceeded`/`energyMin`/`energyMax`/`isSimulationActive`（派生指标）。**禁止**在 SIM-04 中覆盖 SIM-01 写入的原始能量值。**禁止**在 SIM-04 的 `updateEnergy` 中重新设置 `kineticEnergy`/`potentialEnergy`/`totalEnergy`（这些值已在 SIM-01 的设置中更新，本模块只需读取后计算派生指标）。

2. **【漂移计算时机】** 漂移计算在 `updateEnergy` 中同步执行（无异步 I/O），确保不落后于当前帧。**禁止**将漂移计算放入 `useEffect` 或 `requestAnimationFrame`（会引入额外帧延迟，导致 `driftExceeded` 与实际能量值不同步）。

3. **【Canvas 物理像素】** Canvas 元素的 `width`/`height` 属性必须乘以 `window.devicePixelRatio`（物理像素），CSS 尺寸使用逻辑像素。**禁止**仅在 CSS 中设置 Canvas 尺寸而不设置物理像素（会导致高 DPI 屏幕上图表模糊）。D3 scale 的 `range` 使用逻辑像素，但 Canvas 上下文使用 `ctx.scale(dpr, dpr)` 后将逻辑像素映射到物理像素。

4. **【初始能量为负的处理】** 双摆系统在 `y = 0` 为零势面时总能量通常为负（势能负值主导：`V = -(m1+m2)gL1cos(θ1) - m2gL2cos(θ2)`）。漂移公式 `|E - E₀| / |E₀|` 使用绝对值分母，正确处理负初始能量。若 `E₀ ≈ 0`（极其罕见，需要精确的参数组合使初始 K + V = 0），`1e-10` 保护除零——此时漂移会极大（> 100%），立即触发告警，这是正确的诊断反馈。

5. **【能量缓冲区排序】** `energyBuffer` 按追加顺序保持，正常模式（`direction = 1`）下 `t` 单调递增，无需每帧排序。但若因方向切换导致数据乱序（时间反演场景），Canvas 渲染前必须执行一次排序：`energyBuffer.sort((a, b) => a.t - b.t)`。**推荐**：时间反演模式下暂停向 `energyBuffer` 追加数据（反演是回溯，不产生新物理信息），从根本上避免乱序。

6. **【告警锁存的边界条件】** `driftExceeded` 的锁存逻辑有三个清除路径：
   - 仿真 reset（`resetEnergyTracking`）→ 自动清除
   - 用户手动点击"清除"按钮（且当前 `drift < 0.5%`）→ 手动清除
   - 阻尼状态变更（`damping: 0 ↔ > 0`）→ 自动清除（因为告警规则已变更）
   **禁止**在漂移恢复 < 0.5% 时自动清除锁存（这是锁存的核心语义——提醒用户曾经发生过超阈值事件）。

7. **【禁止行为】** 禁止在 Canvas 渲染循环中调用 `d3.select(canvas)` 或任何 DOM 选择器（D3 的 Canvas 模式仅用 `context(ctx)` 绑定）。每帧渲染的路径数据必须是纯数组操作（`filter` 窗口过滤 + `slice` 降采样），禁止 D3 的 `enter/update/exit` 模式（那是 SVG 专属）。

8. **【禁止行为】** 禁止将能量数据存储在 Zustand 之外的全局变量中（避免热重载时状态丢失）。`energyBuffer` 是本模块内部的非 React 状态（`useRef` 持有），用于 Canvas 渲染，不应被其他模块直接访问。如需暴露历史能量数据给其他模块，通过 store 的 `energyMin`/`energyMax`/`energyDrift` 等派生字段提供。

9. **【禁止行为】** Canvas 图表禁止以"使用现成的 Chart.js 折线图"替代。必须使用 D3.js + Canvas 2D 实现，确保 bundle 体积可控（仅 `d3-scale`/`d3-shape`/`d3-axis`/`d3-selection` 四个子模块，< 10KB gzipped）且与其他 D3 图表（ANL-01 热力图、ANL-02 分岔图）共享 D3 依赖。

10. **【禁止行为】** 禁止在 `requestAnimationFrame` 回调内部调用 `d3.scaleLinear()` 或 `d3.axisBottom()` 创建新 scale（每帧重建对象会产生 GC 压力）。Scale 在初始化或 resize 时创建，每帧仅调用 `.domain()` 更新 Y 轴范围（极低频操作）和 line generator 的 `.x()`/`.y()` 访问器。

11. **【易错点】** `damping > 0` 时的基准重置：用户从阻尼系统切换到无阻尼系统时（`damping: 0.1 → 0`），如果不重置 `energyInitial`，之前阻尼期间的衰减会被计入漂移，立即触发假阳性告警。`updateEnergy` 中必须检测 `damping` 从 > 0 变为 0，此时设置 `energyInitial = e`（当前帧总能量作为新基准）。

12. **【易错点】** `consumeFrameToStore` 已经被 SIM-01 调用设置 `kineticEnergy`/`potentialEnergy`/`totalEnergy`。本模块的 `updateEnergy` 不应重复写入这三个字段（会被 SIM-01 下一次调用覆盖）。`updateEnergy` 仅计算派生指标。如果 `updateEnergy` 与 `consumeFrameToStore` 在同一帧内被调用，store 的 batch update 机制（React 18 自动批处理）会合并两次 `setState`，最终状态包含原始值（来自 `consumeFrameToStore`）和派生值（来自 `updateEnergy`）。

13. **【偷懒红线】** Canvas 图表的 X 轴实现必须使用**滑动窗口**而非**取模（modulo）**方案。取模方案在 `t` 超过 `timeWindow` 后线条会缠绕回 X=0，视觉上产生不连续的跳动线。滑动窗口方案（X 坐标基于 `d.t - windowStart` 的相对偏移）保证线条在时间轴上平滑滚动。
