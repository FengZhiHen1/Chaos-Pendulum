# 功能点：SIM-01 双摆物理引擎

> **文档生成时间**：2026-04-28 17:00:00 CST
> **版本记录**：
> | 版本 | 时间 | 修改人 | 变更摘要 |
> |------|------|--------|----------|
> | v1.0 | 2026-04-28 15:30:00 | AI Assistant | 初始版本（错误：基于 Pyodide 主线程同步架构） |
> | v2.0 | 2026-04-28 17:00:00 | AI Assistant | 完全重写：对齐技术栈设计文档 §1.3/§3/ADR-001，改为 JS Worker + Transferable 池 + 批量积分架构 |

> **冲突核查指引**：本版本已与技术栈设计文档 v1.2 全文对齐。若后续技术栈文档更新涉及 ODE 求解器或 Worker 通信方案变更，以时间戳更新的版本为准。

### 所属模块与溯源

- **对应总设计章节**：功能设计_v0 §三~§五（各模式共享的积分基础设施）、§十 P0（核心骨架）；技术栈设计 §2 #12（自实现 RK4/RK45）、§3.1 架构分层图（Worker 层）、§3.2 核心数据流、§3.3 TypedArray 池、ADR-001
- **依赖的其他功能模块**：无（本模块为整个系统的最底层计算依赖，不依赖任何其他功能模块）
- **被依赖模块**：SIM-04 能量实时监控、SIM-05 相空间可视化、EXP-01 3D 仿真场景、EXP-02 运动尾迹渲染、EXP-04 蝴蝶效应对比器、EXP-05 时间反演实验、ANL-03 庞加莱截面、LAB-01 受力拆解视图、LAB-02 物理验证套件、DAT-03 历史回放与分叉

### 已有设计兼容性分析

- **已审查的相关规格文档**：
  - `双摆混沌实验室-技术栈设计.md` v1.2：§1.3 混合方案、§2 #12-#14 技术选型、§3.1-3.3 架构与数据流、§4.1 Worker 积分策略、ADR-001 决策记录
  - `功能模块全拆解.md`：SIM-01 模块定义及颗粒度描述
- **兼容性结论**：
  - v2.0 完全对齐技术栈文档的混合架构：JS 自实现 ODE（Worker 常驻）用于实时仿真；Pyodide + SciPy 仅用于 LAB-03 用户沙箱（独立于本模块）
  - v2.0 采用技术栈文档 §3.3 的 Transferable Float64Array 池方案和 §4.1 的批量积分策略（每次 2s / 120 帧）
  - v2.0 废除 v1.0 中所有 Python/Pyodide 主线程同步调用的设计，与 ADR-001 的"JS 实时 + Pyodide 沙箱混合"决策一致
- **复用的已有定义**：技术栈文档中定义的 `RingBuffer<StateVector>` 容量 6000、`Float64Pool` 池化方案、Worker 积分策略（2s 批量）、Pyodide 三级缓存

### 技术栈绑定

- **必须使用**：
  - TypeScript 5.x（Worker 代码的类型安全）
  - 纯 JavaScript/TypeScript 实现 ODE 求解器（RK4 固定步长 + RK45 自适应步长），代码量 < 150 行
  - Web Worker（`new Worker(new URL('./workers/ode-worker.ts', import.meta.url), { type: 'module' })`）——常驻，不依赖 WASM 初始化
  - 原生 `postMessage` + `Transferable` Float64Array（零拷贝，避免结构化克隆开销）
  - `Float64Array` 池（10 块 × 4000 元素，约 320KB）——主线程 `acquire()` / `release()` 管理
  - `RingBuffer<StateVector>`（固定容量 6000 = 100s × 60fps）——仿真历史回溯数据源
  - Vite `worker` 导入语法（`new Worker(new URL(...), { type: 'module' })`）
- **禁止使用**：
  - 禁止在实时仿真路径上依赖 Pyodide 或任何 WASM 运行时（ADR-001：WASM 冷启动延迟 > 2s 会阻塞首屏仿真）
  - 禁止在主线程执行 ODE 积分（技术栈 §1.2：Worker 中 ODE 积分不阻塞主线程）
  - 禁止使用 JSON 序列化传输轨迹数据（每帧 14 个 float64 经 JSON 序列化后体积膨胀 ~5×，GC 压力不可接受；必须用 Transferable）
  - 禁止使用 Comlink 或其他 RPC 封装（ADR-002：消息类型有限 ~5 种，手写分发复杂度可控）
  - 禁止在主线程 JS 侧重复实现 ODE 物理逻辑供"快速预览"（必须统一走 Worker，避免仿真行为分裂）

### 输入定义（精确类型）

#### 消息协议：主线程 → Worker

```typescript
/**
 * 物理参数。所有字段均为不可变值（Worker 侧不修改传入的 params）。
 */
interface PendulumParams {
  m1: number;       // 上摆质量 (kg)，> 0，示例：1.0
  m2: number;       // 下摆质量 (kg)，> 0，示例：1.0
  L1: number;       // 上摆杆长 (m)，> 0，示例：1.0
  L2: number;       // 下摆杆长 (m)，> 0，示例：1.0
  g: number;        // 重力加速度 (m/s²)，>= 0，默认 9.81
  damping: number;  // 阻尼系数 (1/s)，>= 0，默认 0
}

type IntegratorMethod = "RK4" | "VelocityVerlet" | "Euler";

interface WorkerInitCommand {
  type: "init";
  /** 物理参数 */
  params: PendulumParams;
  /** 初始条件：角度 (rad)，角速度 (rad/s) */
  initialConditions: {
    theta1: number;       // 上摆初始角度 (rad)，示例：Math.PI / 2
    theta1Dot: number;    // 上摆初始角速度 (rad/s)，默认 0
    theta2: number;       // 下摆初始角度 (rad)，示例：Math.PI / 2
    theta2Dot: number;    // 下摆初始角速度 (rad/s)，默认 0
  };
  /** 积分方法，默认 "RK4" */
  method: IntegratorMethod;
}

interface WorkerStepCommand {
  type: "step";
  /**
   * 从池中 acquire 的空闲 Float64Array。
   * 调用方已将所有权 transfer 给 Worker（buf.buffer 在 postMessage 的 transferList 中）。
   * Worker 在 buffer 中填充 FRAMES_PER_BATCH 帧数据后，transfer 回主线程。
   */
  buffer: Float64Array;
}

interface WorkerUpdateParamsCommand {
  type: "updateParams";
  /** 部分参数更新，未传入字段保持不变 */
  params: Partial<PendulumParams>;
}

interface WorkerResetCommand {
  type: "reset";
  initialConditions: {
    theta1: number;
    theta1Dot: number;
    theta2: number;
    theta2Dot: number;
  };
}

interface WorkerSetDirectionCommand {
  type: "setDirection";
  /** 1 = 正向积分，-1 = 反向积分 */
  direction: 1 | -1;
}

interface WorkerSetMethodCommand {
  type: "setMethod";
  method: IntegratorMethod;
}

type WorkerCommand =
  | WorkerInitCommand
  | WorkerStepCommand
  | WorkerUpdateParamsCommand
  | WorkerResetCommand
  | WorkerSetDirectionCommand
  | WorkerSetMethodCommand;
```

#### 消息协议：Worker → 主线程

```typescript
interface WorkerReadyResponse {
  type: "ready";
}

interface WorkerBatchReadyResponse {
  type: "batchReady";
  /**
   * 填充了 FRAMES_PER_BATCH 帧数据的 Float64Array。
   * 所有权已 transfer 回主线程（buf.buffer 在 postMessage 的 transferList 中）。
   * 主线程渲染管线消费完毕后调用 pool.release(buffer) 归还。
   */
  buffer: Float64Array;
  /** 本批次实际填充的帧数（正常情况下 = FRAMES_PER_BATCH；末批或异常可能更少） */
  frameCount: number;
  /** 本批次最后一帧的仿真时间 (s) */
  simTime: number;
}

interface WorkerErrorResponse {
  type: "error";
  /** 错误分类 */
  code: "DIVERGED" | "TIMEOUT" | "INVALID_STATE";
  /** 人类可读的错误消息 */
  message: string;
  /** 发散发生时的仿真时间 (s)，非发散类错误为 -1 */
  simTime: number;
}

type WorkerResponse =
  | WorkerReadyResponse
  | WorkerBatchReadyResponse
  | WorkerErrorResponse;
```

### 输出定义（精确类型）

#### Float64Array 缓冲区帧布局

Worker 在 `buffer` 中按以下帧布局填充数据。主线程和所有下游模块必须按此布局读取。

```
常量定义:
  FRAME_STRIDE       = 14     // 每帧占用的 float64 数
  FRAMES_PER_BATCH   = 120    // 每批次帧数（2 秒 @60fps）
  BUFFER_LENGTH      = FRAMES_PER_BATCH * FRAME_STRIDE  // = 1680

单帧 (14 个 float64) 的字段偏移:
  ┌────────┬──────────────────────┬─────────┬──────────────────────────────┐
  │ 偏移量  │ 字段名                │ 单位     │ 计算来源                      │
  ├────────┼──────────────────────┼─────────┼──────────────────────────────┤
  │ [0]    │ t                    │ s       │ 仿真时间，从 0 单调递增        │
  │ [1]    │ theta1               │ rad     │ 上摆角度                       │
  │ [2]    │ theta1Dot            │ rad/s   │ 上摆角速度                     │
  │ [3]    │ theta2               │ rad     │ 下摆角度                       │
  │ [4]    │ theta2Dot            │ rad/s   │ 下摆角速度                     │
  │ [5]    │ x1                   │ m       │ x1 = L1·sin(theta1)           │
  │ [6]    │ y1                   │ m       │ y1 = -L1·cos(theta1)          │
  │ [7]    │ x2                   │ m       │ x2 = x1 + L2·sin(theta2)      │
  │ [8]    │ y2                   │ m       │ y2 = y1 - L2·cos(theta2)      │
  │ [9]    │ kineticEnergy        │ J       │ 系统动能 K                     │
  │ [10]   │ potentialEnergy      │ J       │ 系统势能 V（y=0 为零势面）      │
  │ [11]   │ totalEnergy          │ J       │ 总能量 E = K + V               │
  │ [12]   │ alpha1               │ rad/s²  │ 上摆角加速度（供受力分析用）     │
  │ [13]   │ alpha2               │ rad/s²  │ 下摆角加速度（供受力分析用）     │
  └────────┴──────────────────────┴─────────┴──────────────────────────────┘

缓冲区内存排布（行优先）:
  buffer[0..13]    = 第 0 帧数据
  buffer[14..27]   = 第 1 帧数据
  buffer[28..41]   = 第 2 帧数据
  ...
  buffer[i*14 .. i*14+13] = 第 i 帧数据

坐标约定:
  - 原点 (0,0) = 双摆悬挂点（pivot）
  - y 轴向上为正（物理坐标系，与屏幕坐标反向）
  - 前端 EXP-01 渲染时负责 y 轴翻转
```

#### 主线程侧读取工具

```typescript
/** 帧布局常量，与 Worker 侧保持同步 */
const FRAME_STRIDE = 14;
const FRAMES_PER_BATCH = 120;

/** 从缓冲区中读取第 i 帧的指定字段 */
function readFrameField(buffer: Float64Array, frameIndex: number, fieldOffset: number): number {
  return buffer[frameIndex * FRAME_STRIDE + fieldOffset];
}

/** 获取第 i 帧的完整状态（零拷贝视图） */
function getFrameSlice(buffer: Float64Array, frameIndex: number): Float64Array {
  const start = frameIndex * FRAME_STRIDE;
  return buffer.subarray(start, start + FRAME_STRIDE);
}

/** 从缓冲区批量写入 Zustand store（每帧调用一次，由 rAF 驱动） */
function consumeFrameToStore(buffer: Float64Array, frameIndex: number, store: ZustandStore): void {
  const offset = frameIndex * FRAME_STRIDE;
  store.setState({
    t:              buffer[offset + 0],
    theta1:         buffer[offset + 1],
    theta1Dot:      buffer[offset + 2],
    theta2:         buffer[offset + 3],
    theta2Dot:      buffer[offset + 4],
    x1:             buffer[offset + 5],
    y1:             buffer[offset + 6],
    x2:             buffer[offset + 7],
    y2:             buffer[offset + 8],
    kineticEnergy:  buffer[offset + 9],
    potentialEnergy:buffer[offset + 10],
    totalEnergy:    buffer[offset + 11],
    alpha1:         buffer[offset + 12],
    alpha2:         buffer[offset + 13],
  });
}
```

### 核心逻辑步骤

#### Worker 侧：ODE 求解器

**步骤 1：消息循环入口**

- **操作对象**：Worker 全局 `self.onmessage` 事件
- **具体操作**：
  1. 监听 `message` 事件：`self.onmessage = (e: MessageEvent<WorkerCommand>) => { ... }`
  2. 按 `e.data.type` 分发到对应处理函数：`"init" → handleInit`、`"step" → handleStep`、`"updateParams" → handleUpdateParams`、`"reset" → handleReset`、`"setDirection" → handleSetDirection`、`"setMethod" → handleSetMethod`
  3. 未识别的 `type` → 忽略，`console.warn` 记录
- **输入来源**：主线程通过 `worker.postMessage(cmd, [cmd.buffer.buffer])` 发送
- **输出去向**：对应 handler 函数
- **失败行为**：消息解析失败（`e.data` 不是预期对象）→ 忽略该消息，不崩溃

**步骤 2：初始化（handleInit）**

- **操作对象**：Worker 内部状态 `_state: Float64Array(4)`（存储 `[θ₁, θ̇₁, θ₂, θ̇₂]`）
- **具体操作**：
  1. 校验 `params`：`m1, m2, L1, L2` 必须 > 0；`g >= 0`；`damping >= 0`。任一非法 → `postMessage({ type: "error", code: "INVALID_STATE", message: "参数非法: ..." })` 并返回
  2. 将 `initialConditions` 写入 `_state`：`_state[0]=theta1, _state[1]=theta1Dot, _state[2]=theta2, _state[3]=theta2Dot`
  3. 将 `_state` 角度归一化：`_state[0] = ((_state[0] + Math.PI) % (2*Math.PI) + 2*Math.PI) % (2*Math.PI) - Math.PI`；对 `_state[2]` 同理
  4. 存储 `_params = { ...params }`、`_method = method`、`_direction = 1`、`_simTime = 0`
  5. 回复 `postMessage({ type: "ready" })`
- **输入来源**：`WorkerInitCommand`
- **输出去向**：Worker 内部状态就绪；主线程收到 `"ready"` 后开始发送 `"step"` 命令
- **失败行为**：参数非法 → 发送 `"error"` 消息，Worker 保持未初始化状态

**步骤 3：批量积分（handleStep）**

- **操作对象**：传入的 `buffer: Float64Array`（所有权已 transfer）
- **具体操作**：
  1. 若未初始化（`_state` 为 null）→ 发送 `"error"`，`code: "INVALID_STATE"`，不写入 buffer
  2. 若 `_state` 含 NaN → 发送 `"error"`，`code: "DIVERGED"`，不写入 buffer
  3. 取 `dt = 1/60`（固定帧步长 60fps）
  4. 循环 `frame = 0` 到 `FRAMES_PER_BATCH - 1`：
     a. 执行 `_integratorStep(_state, _params, dt * _direction)`  → 更新 `_state`
     b. 检查 NaN：任一状态分量 NaN → 发送 `"error"`（`code: "DIVERGED"`），`simTime` 为当前仿真时间，已填充帧的 `frameCount` 随消息返回
     c. `_simTime += dt * _direction`
     d. 计算坐标与能量（调用 `_computeDerived`）
     e. 写入 buffer 偏移 `frame * FRAME_STRIDE`：`[t, theta1, theta1Dot, theta2, theta2Dot, x1, y1, x2, y2, K, V, E, alpha1, alpha2]`
  5. 角度归一化（每帧写入后执行）：`_state[0] = normalizeAngle(_state[0])`, `_state[2] = normalizeAngle(_state[2])`
  6. `postMessage({ type: "batchReady", buffer, frameCount: FRAMES_PER_BATCH, simTime: _simTime })`，buffer 在 transferList 中 transfer 回主线程
- **输入来源**：`WorkerStepCommand.buffer`（Float64Array，由主线程从池中 acquire 后 transfer 过来）
- **输出去向**：填充完毕的 buffer transfer 回主线程 → Zustand store → R3F/D3/Web Audio 渲染管线
- **失败行为**：
  - 积分发散 → buffer 中保留发散前的有效帧，frameCount < FRAMES_PER_BATCH，buffer 仍需 transfer 回主线程（避免泄漏）
  - 单次 handleStep 耗时 > 50ms → 记录 `console.warn`，但不中断（降级为较低精度的自适应策略由外部池管理逻辑处理）

**步骤 4：积分器选择（_integratorStep）**

- **操作对象**：`_state: Float64Array(4)` 原地更新
- **具体操作**：根据 `_method` 选择对应实现：

  **RK4（默认）**：
  ```typescript
  function rk4Step(state: Float64Array, p: PendulumParams, dt: number): void {
    const k1 = odeRhs(state, p);                          // Float64Array(4)
    const k2 = odeRhs(addScaled(state, k1, dt / 2), p);
    const k3 = odeRhs(addScaled(state, k2, dt / 2), p);
    const k4 = odeRhs(addScaled(state, k3, dt), p);
    for (let i = 0; i < 4; i++) {
      state[i] += (dt / 6) * (k1[i] + 2*k2[i] + 2*k3[i] + k4[i]);
    }
  }
  ```
  其中 `addScaled(base, scaled, factor)` 返回新的 `Float64Array(4)`，每元素 `= base[i] + scaled[i] * factor`。

  **Velocity Verlet**（辛积分器）：
  ```typescript
  function verletStep(state: Float64Array, p: PendulumParams, dt: number): void {
    const alpha0 = angularAcceleration(state, p);  // Float64Array(2): [α₁, α₂]
    // 半步加速：ω += 0.5·dt·α
    state[1] += 0.5 * dt * alpha0[0];
    state[3] += 0.5 * dt * alpha0[1];
    // 全步位置：θ += dt·ω
    state[0] += dt * state[1];
    state[2] += dt * state[3];
    // 重算加速度
    const alpha1 = angularAcceleration(state, p);
    // 半步加速：ω += 0.5·dt·α'
    state[1] += 0.5 * dt * alpha1[0];
    state[3] += 0.5 * dt * alpha1[1];
  }
  ```

  **Euler**（教育用途）：
  ```typescript
  function eulerStep(state: Float64Array, p: PendulumParams, dt: number): void {
    const d = odeRhs(state, p);
    for (let i = 0; i < 4; i++) state[i] += dt * d[i];
  }
  ```

- **输入来源**：`_method` 字段（在 `init` 或 `setMethod` 中设置）
- **输出去向**：原地更新 `_state`
- **失败行为**：`_method` 不在 `["RK4", "VelocityVerlet", "Euler"]` → 回退为 RK4

**步骤 5：ODE 右端函数（odeRhs）——核心物理**

- **操作对象**：输入状态 `[θ₁, ω₁, θ₂, ω₂]`，输出导数 `[ω₁, α₁, ω₂, α₂]`
- **具体操作**：计算双摆拉格朗日方程（含线性阻尼）：

  ```typescript
  function odeRhs(s: Float64Array, p: PendulumParams): Float64Array {
    const [t1, w1, t2, w2] = s;
    const { m1, m2, L1, L2, g, damping: b } = p;

    const delta = t2 - t1;
    const sinD = Math.sin(delta);
    const cosD = Math.cos(delta);

    let denom = 2 * m1 + m2 - m2 * Math.cos(2 * delta);
    // 防止分母过小：保留符号
    if (Math.abs(denom) < 1e-12) denom = Math.sign(denom) * 1e-12;

    // 角加速度（无阻尼部分）
    const alpha1 = (
      m2 * L1 * w1*w1 * sinD * cosD +
      m2 * g * Math.sin(t2) * cosD +
      m2 * L2 * w2*w2 * sinD -
      (m1 + m2) * g * Math.sin(t1)
    ) / (L1 * denom);

    const alpha2 = (
      -m2 * L2 * w2*w2 * sinD * cosD +
      (m1 + m2) * (
        g * Math.sin(t1) * cosD -
        L1 * w1*w1 * sinD -
        g * Math.sin(t2)
      )
    ) / (L2 * denom);

    // 返回 [ω₁, α₁ - b·ω₁, ω₂, α₂ - b·ω₂]
    return new Float64Array([w1, alpha1 - b * w1, w2, alpha2 - b * w2]);
  }
  ```

  **`angularAcceleration`**（供 Velocity Verlet 用，仅返回 α₁, α₂）：
  ```typescript
  function angularAcceleration(s: Float64Array, p: PendulumParams): Float64Array {
    const rhs = odeRhs(s, { ...p, damping: 0 });  // 无阻尼的角加速度
    return new Float64Array([rhs[1], rhs[3]]);
  }
  ```

- **输入来源**：积分器在每次子步中传入当前 `state` 和 `params`
- **输出去向**：返回 `[ω₁, α₁, ω₂, α₂]`，供积分器推进状态
- **失败行为**：浮点溢出 → `alpha1/alpha2` 为 `Infinity` → 积分器步骤 3 的 NaN 检查捕获

**步骤 6：派生量计算（_computeDerived）**

- **操作对象**：当前 `_state` 和 `_params`
- **具体操作**：在步骤 3 的每帧积分完成后调用，计算坐标与能量：

  ```typescript
  function computeDerived(state: Float64Array, p: PendulumParams): DerivedValues {
    const [t1, w1, t2, w2] = state;
    const { L1, L2, m1, m2, g } = p;

    // 笛卡尔坐标
    const x1 = L1 * Math.sin(t1);
    const y1 = -L1 * Math.cos(t1);
    const x2 = x1 + L2 * Math.sin(t2);
    const y2 = y1 - L2 * Math.cos(t2);

    // 线速度
    const v1x = L1 * w1 * Math.cos(t1);
    const v1y = L1 * w1 * Math.sin(t1);
    const v2x = v1x + L2 * w2 * Math.cos(t2);
    const v2y = v1y + L2 * w2 * Math.sin(t2);

    // 能量
    const K = 0.5 * m1 * (v1x*v1x + v1y*v1y) + 0.5 * m2 * (v2x*v2x + v2y*v2y);
    const V = m1 * g * y1 + m2 * g * y2;
    const E = K + V;

    // 角加速度（用于受力分析）
    const a = angularAcceleration(state, p);

    return { x1, y1, x2, y2, kineticEnergy: K, potentialEnergy: V, totalEnergy: E, alpha1: a[0], alpha2: a[1] };
  }
  ```

- **输入来源**：积分器更新后的 `_state` + `_params`
- **输出去向**：写入 buffer 对应帧偏移
- **失败行为**：坐标计算中浮点溢出 → 捕获 `isFinite` 检查，不写入 buffer，该帧标记为 NaN 触发步骤 3 的错误分支

**步骤 7：参数热更新（handleUpdateParams）**

- **操作对象**：Worker 内部 `_params`
- **具体操作**：
  1. 浅合并：`_params = { ..._params, ...cmd.params }`
  2. 校验合并后的完整 params（复用步骤 2 的校验逻辑）
  3. 校验通过 → 存储，下次 `handleStep` 自动生效
  4. 校验失败 → 回滚（`_params` 保持原值），发送 `"error"`（`code: "INVALID_STATE"`）
- **输入来源**：`WorkerUpdateParamsCommand.params`
- **输出去向**：更新后的 `_params` 影响下一次 `handleStep`
- **失败行为**：校验失败 → 回滚原值，发送错误消息，主线程前端输入框红框震动

**步骤 8：方向切换（handleSetDirection）**

- **操作对象**：`_direction`
- **具体操作**：`_direction = cmd.direction`（1 或 -1）
- **输入来源**：`WorkerSetDirectionCommand.direction`
- **输出去向**：影响步骤 3 的 `dt * _direction` 因子
- **失败行为**：值不为 ±1 → 忽略，保持原方向

#### 主线程侧：池化与调度

**步骤 9：Float64Array 池初始化**

- **操作对象**：`Float64Pool` 实例
- **具体操作**：

  ```typescript
  class Float64Pool {
    private buffers: (Float64Array | null)[];
    private free: number[];

    constructor(count: number, size: number) {
      // count = 10 (技术栈 §3.3), size = 4000
      this.buffers = Array.from({ length: count }, () => new Float64Array(size));
      this.free = Array.from({ length: count }, (_, i) => i);
    }

    acquire(): { buffer: Float64Array; index: number } | null {
      if (this.free.length === 0) return null;  // 池耗尽，主线程渲染应降速
      const idx = this.free.pop()!;
      return { buffer: this.buffers[idx]!, index: idx };
    }

    release(index: number): void {
      this.free.push(index);
    }
  }
  ```

- **输入来源**：应用启动时创建（由 SYS-04 初始化加载流程或 App.tsx 入口触发）
- **输出去向**：全局单例，供仿真调度循环使用
- **失败行为**：`acquire()` 返回 null（池耗尽）→ 跳过本帧的 Worker 请求，等待渲染管线消费完归还 buffer；连续 3 次 null 发出 console.warn

**步骤 10：仿真帧调度循环**

- **操作对象**：`requestAnimationFrame` 回调 + Worker + 池
- **具体操作**：

  ```typescript
  let currentBuffer: Float64Array | null = null;
  let consumeIndex = 0;        // 当前消费到 buffer 中的第几帧
  let pendingBatch = false;    // 是否有 batch 正在 Worker 中计算

  function requestNextBatch(worker: Worker, pool: Float64Pool): void {
    if (pendingBatch) return;
    const slot = pool.acquire();
    if (!slot) return;  // 池满，稍后重试
    pendingBatch = true;
    worker.postMessage(
      { type: "step", buffer: slot.buffer },
      [slot.buffer.buffer]  // transfer
    );
  }

  function simulationLoop(worker: Worker, pool: Float64Pool, store: ZustandStore): void {
    if (currentBuffer) {
      // 消费一帧
      consumeFrameToStore(currentBuffer, consumeIndex, store);
      consumeIndex++;

      // 80% 耗尽 → 触发下一批
      if (consumeIndex >= FRAMES_PER_BATCH * 0.8 && !pendingBatch) {
        requestNextBatch(worker, pool);
      }

      // 当前 buffer 消费完毕 → 归还池
      if (consumeIndex >= FRAMES_PER_BATCH) {
        // 通过 buffer 反向查找池索引归还（实际实现中维护 buffer→index 映射）
        pool.release(findPoolIndex(currentBuffer));
        currentBuffer = null;
        consumeIndex = 0;
      }
    }

    requestAnimationFrame(() => simulationLoop(worker, pool, store));
  }

  // Worker 消息处理
  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    if (e.data.type === "batchReady") {
      currentBuffer = e.data.buffer;
      consumeIndex = 0;
      pendingBatch = false;
    } else if (e.data.type === "error") {
      pendingBatch = false;
      store.setState({ engineError: e.data.message });
    }
  };
  ```

- **输入来源**：Worker 返回的 `batchReady` 消息
- **输出去向**：每帧消费一个帧切片写入 Zustand → React 调度 → R3F / D3 / Web Audio 渲染
- **失败行为**：
  - 池耗尽（`acquire` 返回 null）→ 跳过本轮请求，下一帧重试
  - Worker 超时（2s 内未收到 `batchReady`）→ 重建 Worker，`console.error`
  - buffer 中检测到 NaN 帧 → 该帧跳过写入 store，暂停仿真，显示错误浮层

### 依赖与集成接口

| 依赖方 | 具体接口 | 用途 |
|--------|----------|------|
| Vite | `new Worker(new URL('./workers/ode-worker.ts', import.meta.url), { type: 'module' })` | 创建 Worker 实例，Vite 独立 chunk 编译 |
| Worker API | `worker.postMessage(cmd, transferList)` | 发送命令并 transfer buffer 所有权 |
| Worker API | `worker.onmessage = (e) => {...}` | 接收 batch 结果 |
| Float64Pool | `pool.acquire()` / `pool.release(index)` | 管理 Transferable buffer 生命周期 |
| RingBuffer | `ringBuf.push(frame)` / `ringBuf.at(t)` | 主线程侧轨迹历史存储（容量 6000） |

**被依赖接口（供下游模块消费）**：

| 消费方模块 | 消费方式 | 消费的数据 |
|-----------|---------|-----------|
| EXP-01 3D 仿真场景 | Zustand store → R3F `useFrame` | `x1, y1, x2, y2`（摆球位置）、`theta1, theta2`（摆杆旋转角） |
| EXP-02 运动尾迹渲染 | RingBuffer 轮询最新 N 帧 | `x2, y2` 序列（颜色映射用 `theta2Dot`） |
| EXP-03 声音化引擎 | Zustand store subscribe | `theta2Dot`（音高）、`theta2 - theta1`（和声）、`kineticEnergy`（音色） |
| EXP-04 蝴蝶效应对比器 | 两个独立 Worker 实例 | 两份 Zustand slice 的 `x2, y2` 差异计算 `\|Δθ\|` |
| EXP-05 时间反演实验 | `setDirection(-1)` + RingBuffer 历史 | 正向轨迹（虚线对比）、反向积分轨迹（实线） |
| SIM-04 能量实时监控 | Zustand store subscribe | `kineticEnergy`, `potentialEnergy`, `totalEnergy` |
| SIM-05 相空间可视化 | RingBuffer 轮询 | `theta1, theta1Dot` 或 `theta2, theta2Dot` 成对序列 |
| ANL-03 庞加莱截面 | Worker 中 RK45 穿越检测 | 状态向量 `[θ₁, θ̇₁, θ₂, θ̇₂]` 序列（在 Worker 内直接消费，不经过主线程） |
| LAB-01 受力拆解视图 | Zustand store | 当前帧 `alpha1, alpha2`（反算力矢量） |
| LAB-02 物理验证套件 | Worker `postMessage` 批量运行 | 验证场景的参数集 → Worker 输出能量/周期数据 |
| LAB-03 用户可编程沙箱 | **不经过本模块**。Pyodide 直接 `solve_ivp` → JsProxy → store | 用户自定义 ODE 结果（独立于 JS Worker 引擎） |
| DAT-03 历史回放与分叉 | RingBuffer 时间索引查询 | 历史时刻的状态向量，用于分叉新 Worker 实例的初始条件 |

**Pyodide 与本模块的关系**（技术栈 ADR-001）：

```
实时仿真路径（本模块 SIM-01）:
  主线程 ←Transferable buffer← Worker (JS RK4/RK45)
  全程不涉及 Pyodide

用户沙箱路径（LAB-03 负责）:
  主线程 ←JsProxy TypedArray← Pyodide (SciPy solve_ivp)
  Pyodide 懒加载（首次进入 Lab 模式时），与本模块独立
  两套 ODE 实现在 LAB-02 物理验证套件中交叉校验一致性
```

### 状态机

Worker 内部状态机（精简，因为批量积分模式下状态变化比逐帧模式少）：

| 当前状态 | 触发事件 | 下一状态 | 前置条件 | 副作用 |
|----------|----------|----------|----------|--------|
| `uninit` | `init` 消息 | `idle` | params 校验通过 | 初始化 `_state`, `_params`, `_method`, `_direction=1`, `_simTime=0`；回复 `ready` |
| `uninit` | `init` 消息（校验失败） | `uninit` | — | 回复 `error(INVALID_STATE)` |
| `idle` | `step` 消息 | `computing` | 池中有空闲 buffer | 开始批量积分 |
| `computing` | 120 帧全部成功 | `idle` | 无 NaN | transfer buffer 回主线程，回复 `batchReady(frameCount=120)` |
| `computing` | 积分中检测到 NaN | `error` | — | 保留有效帧，transfer buffer，回复 `batchReady(frameCount<N)` + 后续 `error(DIVERGED)` |
| `idle` | `setDirection` / `updateParams` / `setMethod` | `idle` | — | 更新对应内部变量；无需回复 |
| `error` | `reset` 消息 | `idle` | 新 initialConditions 校验通过 | 清空 `_state`，重设 `_simTime=0`, `_direction=1`；回复 `ready` |
| 任意 | `step` 消息（未初始化） | 不变 | — | 回复 `error(INVALID_STATE)` |

### 异常与边界条件

#### 异常 1：参数非法

- **触发条件**：`m1/m2/L1/L2 <= 0`、`g < 0`、`damping < 0`、初始角度为 NaN/Infinity
- **处理策略**：
  1. `handleInit` 或 `handleUpdateParams` 中校验
  2. 校验失败 → Worker 发送 `{ type: "error", code: "INVALID_STATE", message: "参数 {name} 非法: {value}" }`
  3. `_params` 保持校验前的值不变（热更新回滚）
  4. 主线程收到 `error` → 通知 SIM-02 参数面板在对应输入框红框震动 + Tooltip
- **重试参数**：不重试。用户修正参数后重新发送 `updateParams`。

#### 异常 2：积分数值发散

- **触发条件**：`handleStep` 批量积分过程中，任一帧的 `_state` 出现 NaN 或 Infinity
- **处理策略**：
  1. 每帧积分后检查 `isNaN(state[i]) \|\| !isFinite(state[i])`
  2. 检测到发散 → 立即停止批量积分循环
  3. 将已成功积分的帧写入 buffer
  4. `postMessage({ type: "batchReady", buffer, frameCount: N, simTime })` — buffer 必须在 transferList 中 transfer 回（即使不满，避免内存泄漏）
  5. 紧接发送 `{ type: "error", code: "DIVERGED", message: "数值发散于 t={simTime}, 方法={_method}", simTime }`
  6. Worker 进入 `error` 状态
  7. 主线程收到 → Zustand `engineError` 更新 → 前端显示错误浮层："积分已发散，请减小步长或更换积分方法"；用户可点击"重置"发送 `reset`
- **重试参数**：不自动重试。用户修改参数后手动 `reset`。

#### 异常 3：Worker 崩溃

- **触发条件**：Worker 线程因未捕获异常终止（`worker.onerror` 触发）
- **处理策略**：
  1. 主线程 `worker.onerror` 捕获
  2. 记录 `console.error("Worker 崩溃", event)`
  3. 销毁旧 Worker：`worker.terminate()`
  4. 创建新 Worker：`new Worker(...)`
  5. 重新发送 `init`（使用崩溃前 Zustand 中保存的最近参数和初始条件）
  6. 从 RingBuffer 最近一帧恢复仿真状态
  7. 前端 toast 提示："仿真引擎已自动恢复"
  8. 将崩溃事件写入可观测性日志
- **重试参数**：自动重建 1 次。连续 2 次崩溃 → 停止重建，提示用户刷新页面。

#### 异常 4：Float64Array 池耗尽

- **触发条件**：`pool.acquire()` 返回 `null`（10 个 buffer 全部在 Worker 中或等待渲染消费）
- **处理策略**：
  1. 主线程调度循环中检测 `acquire() === null`
  2. 跳过本轮 `requestNextBatch`，不发送 `step` 命令
  3. 下一帧（~16.7ms 后）重试 `acquire()`
  4. 连续 60 帧（~1s）池耗尽 → `console.warn("Float64Pool 持续耗尽，可能渲染管线阻塞")`
  5. 此时当前 buffer 仍在消费中（渲染管线正常），仿真不会中断
- **重试参数**：每帧自动重试，无需人工介入。

#### 异常 5：Worker 批量积分超时

- **触发条件**：主线程发出 `step` 命令后 2 秒内未收到 `batchReady` 或 `error` 响应
- **处理策略**：
  1. 主线程启动 `setTimeout(2000)` 定时器
  2. 超时触发 → 认为 Worker 卡死
  3. `worker.terminate()` + 重建 Worker（同异常 3 流程）
  4. 归还当前 buffer 到池（标记为脏，写入哨兵值后 release）
  5. 记录 `console.error("Worker 积分超时 2s")`
- **重试参数**：同异常 3，自动重建 1 次。

#### 异常 6：反向积分回到起点后的边界

- **触发条件**：时间反演模式下 `_simTime <= 0`（积分回到了 t=0）
- **处理策略**：
  1. `handleStep` 中检测：若 `_direction === -1` 且 `_simTime <= 0`，将 `_simTime` clamp 到 0
  2. 该批次只填充 `_simTime > 0` 的帧
  3. `frameCount` 相应减少，buffer 正常 transfer 回
  4. 主线程检测 `simTime === 0` → 自动暂停仿真
- **重试参数**：行为正确，无需异常处理。

### 原则兑现清单

| 原则来源 | 原则名称 | 代码级约束 |
|----------|----------|------------|
| 技术栈设计 ADR-001 | JS 实时 + Pyodide 沙箱混合 | SIM-01 仅包含 JS ODE 求解器（< 150 行）；Pyodide 路径完全在 LAB-03 中实现；两个实现在 LAB-02 中交叉校验一致性 |
| 技术栈设计 §1.2 | 仿真 ≥ 60fps，Worker 不阻塞主线程 | 批量积分在 Worker 中异步执行；主线程仅做 buffer.read + Zustand 写入（< 0.5ms/帧）；Transferable 零拷贝 |
| 技术栈设计 §3.3 | 池化 Transferable | Float64Pool(10, 4000)；acquire/release 成对调用；禁止在 release 后继续引用 buffer |
| 技术栈设计 §4.1 | 批量积分策略 | 每次积 120 帧（2s），80% 耗尽触发下一批；Worker 与渲染管线流水线并行 |
| 功能设计_v0 §一 1.1 | 分层递进认知 | 引擎仅输出数值（Float64Array），不处理可视化、声音（由 EXP-01/EXP-02/EXP-03 负责） |
| 功能设计_v0 §五 5.2 | 物理正确性可验证 | odeRhs 必须与拉格朗日方程标准文献一致；LAB-02 三个验证项（小角度 <2%、周期吻合、能量漂移 <0.5%）必须通过 |
| 功能设计_v0 §九 | 优雅降级 | Worker 崩溃自动重建；池耗尽降速不崩溃；发散时保留已计算帧 |
| 通用原则 | 单一职责 | `odeRhs` 仅计算导数、积分器仅执行一步积分、`computeDerived` 仅做坐标能量转换；每个函数 < 40 行 |

### 验收测试场景

#### 正向测试 1：标准参数批量积分

- **Given**：
  ```json
  {
    "params": { "m1": 1.0, "m2": 1.0, "L1": 1.0, "L2": 1.0, "g": 9.81, "damping": 0.0 },
    "initialConditions": { "theta1": 1.5708, "theta1Dot": 0.0, "theta2": 1.5708, "theta2Dot": 0.0 },
    "method": "RK4"
  }
  ```
- **When**：发送 `init` → 收到 `ready` → 连续发送 5 次 `step`（覆盖 10 秒仿真）
- **Then**：
  - 每次 `step` 返回 `batchReady`，`frameCount` = 120
  - 第 5 次 `batchReady.simTime ≈ 10.0`
  - 每个 buffer 中 `totalEnergy` 漂移 `|max - min| / |initial| < 0.005`
  - buffer 中任意帧的 `x1, y1, x2, y2` 均为有限值，无 NaN
  - 帧间 `t` 单调递增，步长为 1/60 ≈ 0.0167s

#### 正向测试 2：Worker 与渲染管线流水线并行

- **Given**：仿真参数同测试 1
- **When**：发送 `step` 后立即开始消费上一批 buffer 的帧（不等待 Worker 返回）
- **Then**：
  - 首帧渲染延迟 = Worker 首次 `batchReady` 耗时（< 20ms）
  - 后续帧消费无卡顿（当前 buffer 消费到 80% 时下一批已就绪）
  - 池 `free` 数量在 7-9 之间波动（不会耗尽）

#### 正向测试 3：参数热更新在下一批次生效

- **Given**：Worker 已初始化并产生 1 个 batch（t ≈ 2.0s）
- **When**：发送 `updateParams({ damping: 0.5 })`，然后发送 `step`
- **Then**：
  - `updateParams` 不回复错误
  - 下一批 buffer 中 `totalEnergy` 单调递减（阻尼生效）
  - 第 2 帧的 `totalEnergy` < 上一批最后帧的 `totalEnergy`

#### 异常测试 1：负质量被拒绝

- **Given**：
  ```json
  { "params": { "m1": -1.0, "m2": 1.0, ... }, ... }
  ```
- **When**：发送 `init`
- **Then**：
  - Worker 回复 `{ type: "error", code: "INVALID_STATE", message: "参数 m1 非法: -1" }`
  - Worker 保持 `uninit` 状态，不回复 `ready`
  - 后续 `step` 消息回复 `"error"`（`code: "INVALID_STATE"`）

#### 异常测试 2：积分发散检测

- **Given**：`init` 使用标准参数，但 `method = "Euler"`，`damping = 0`
- **When**：连续发送 10 次 `step`（20 秒，Euler 方法在混沌区能量注入导致发散）
- **Then**：
  - 某次 `step` 返回 `batchReady` 且 `frameCount < 120`
  - 紧随其后收到 `error`（`code: "DIVERGED"`）
  - `batchReady.buffer` 中发散前的帧均为有效数值
  - Worker 后续 `step` 仍回复 `error`（需先 `reset`）

#### 异常测试 3：Worker 崩溃后自动恢复

- **Given**：Worker 正常运行中，RingBuffer 中有 100 帧历史
- **When**：模拟 Worker 崩溃（`worker.terminate()` 后发送 `step`）
- **Then**：
  - 主线程 `worker.onerror` 触发
  - 1 秒内新 Worker 创建完成并自动 `init`
  - 仿真从崩溃前状态恢复，3D 场景未出现长时间冻结
  - 前端 toast 显示"仿真引擎已自动恢复"

#### 异常测试 4：Float64Array 池压力

- **Given**：正常仿真运行中
- **When**：手动暂停渲染管线消费（停止 `simulationLoop` 中的 `consumeFrameToStore`），继续发送 `step` 命令
- **Then**：
  - 10 次 `step` 后 `acquire()` 返回 `null`
  - 不发送新的 `step` 命令（不向 Worker 泄漏 buffer）
  - 恢复消费后，下一帧 `acquire()` 成功，正常继续
  - 仿真过程无数据丢失

### 注意事项与禁止行为

1. **【Transferable 所有权】** `postMessage` 的 transferList 会剥夺发送方的 buffer 访问权。Worker 收到 `step` 命令后，传入的 `buffer` 是唯一可访问该内存的引用。transfer 回主线程后，Worker 必须丢弃该引用。任何对已 transfer buffer 的读写都是 use-after-free，行为未定义。
2. **【buffer→池索引映射】** `Float64Array` 无法直接获取其所属池索引。实现时需维护 `Map<Float64Array, number>` 或使用 `buffer` 的引用地址作为键。推荐方案：在 `acquire` 时建立 `WeakMap<Float64Array, index>` 映射。
3. **【角度约定】** 所有角度内部使用弧度（rad）。θ = 0 表示摆杆竖直向下，正值表示逆时针偏转。前端显示由 SIM-02 负责度/弧度转换。此约定在代码注释中显式声明。
4. **【坐标系约定】** Worker 输出的 `y1, y2` 使用物理坐标系（y 轴向上为正）。前端 EXP-01 的 R3F 渲染时负责 y 轴翻转为屏幕坐标。Worker 不关心渲染坐标系。
5. **【Float64Array 子视图】** 主线程消费 buffer 时使用 `buffer.subarray(offset, offset + 14)` 零拷贝子视图，禁止逐字段 slice 创建新数组（会产生 GC 压力）。
6. **【禁止行为】** 禁止在主线程 JS 侧实现任何物理计算（包括小角度近似）。所有 ODE 求解必须在 Worker 中完成，确保仿真行为一致。
7. **【禁止行为】** 禁止直接实例化第二个 Worker 而不先 terminate 前一个。蝴蝶效应分屏（EXP-04）的两个 Worker 实例必须通过独立的 `new Worker(...)` 创建，不能共享同一 Worker 实例。
8. **【禁止行为】** 禁止在 `handleStep` 中动态 import 或 fetch 外部资源。Worker 代码必须在构建时完全自包含。
9. **【易错点】** `odeRhs` 中分母 `denom = 2*m1 + m2 - m2*cos(2*delta)` 在 `delta → 0` 且 `m2 → 0` 时接近零。必须检查 `abs(denom) < 1e-12`，使用 `Math.sign(denom) * 1e-12` 保留符号（禁止直接 clamp 到正数）。
10. **【易错点】** Velocity Verlet 要求在 `reset` 和 `setDirection` 后重新计算初始 `alpha`。避免使用过期缓存值。
11. **【偷懒红线】** 文档中 `odeRhs` 和积分器的代码可直接复制到 `ode-worker.ts` 中运行。禁止以"这是标准的物理公式"为由省略任何数学表达式。
