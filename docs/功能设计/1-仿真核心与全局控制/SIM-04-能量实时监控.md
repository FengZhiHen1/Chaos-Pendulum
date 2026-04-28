# 功能点：SIM-04 能量实时监控

> **文档生成时间**：2026-04-28 20:27:17 CST
> **版本记录**：
> | 版本 | 时间 | 修改人 | 变更摘要 |
> |------|------|--------|----------|
> | v1.0 | 2026-04-28 20:27:17 | AI Assistant | 初始版本，对齐 SIM-01 v2.0 扁平能量字段名 |

> **冲突核查指引**：EXP-03（声音化引擎）使用 `state.energy.kinetic`（嵌套路径）读取动能，与本模块使用的 `state.kineticEnergy`（扁平路径，SIM-01 v2.0 写入格式）不一致。以 SIM-01 v2.0（数据生产者）为权威源，EXP-03 需更新为扁平路径。

### 所属模块与溯源

- **对应总设计章节**：功能设计_v0 §五 5.2（能量守恒标准：1000s 内漂移 < 0.5%）；§十 P0（能量监控 + 相空间图）；技术栈设计 §2 #6（D3.js 2D 图表）
- **依赖的其他功能模块**：
  - `SIM-01`（双摆物理引擎）— 通过 Zustand store 的 `kineticEnergy`、`potentialEnergy`、`totalEnergy` 字段消费每帧能量数据；通过 RingBuffer 订阅 `totalEnergy` 历史
- **被依赖模块**：LAB-02（物理验证套件 — 能量守恒验证项读取本模块的漂移数据作为判定依据）

### 已有设计兼容性分析

- **已审查的相关规格文档**：
  - `SIM-01-双摆物理引擎.md` v2.0：buffer 布局中 `kineticEnergy`（offset 9）、`potentialEnergy`（offset 10）、`totalEnergy`（offset 11）；`consumeFrameToStore` 以扁平字段名写入 Zustand
  - `EXP-03-声音化引擎.md` v1.0：使用 `useSimulationStore.getState().energy.kinetic`（嵌套路径）读取动能
  - `功能模块全拆解.md` 附录 C：SIM-04 与 ANL-04 边界决策（一维标量 vs 二维曲面，保持分离）
- **兼容性结论**：
  - SIM-01 v2.0 以扁平字段 `kineticEnergy`/`potentialEnergy`/`totalEnergy` 写入 store — 本模块以此为准定义读取路径
  - EXP-03 的 `state.energy.kinetic` 嵌套路径与 SIM-01 的扁平写入冲突 — 以 SIM-01 为权威源，EXP-03 需后续更新为 `state.kineticEnergy`
  - 无其他冲突
- **复用的已有定义**：SIM-01 的 `FRAME_STRIDE`（14）、能量字段偏移常量（9/10/11）；SIM-01 的 `RingBuffer`（用于回溯历史能量值）

### 技术栈绑定

- **必须使用**：
  - `react@^18.3.1` — UI 框架
  - `d3@^7.9.0`（按需模块：`d3-scale`、`d3-shape`、`d3-axis`、`d3-selection`）— 能量时序折线图 Canvas 渲染
  - `zustand@^4.5.5` — 从 `useSimulationStore` 订阅能量字段
  - `tailwindcss@^3.4.16` — 面板布局、漂移指示器样式
  - `shadcn/ui`（Copy 模式）— `Card`（面板容器）、`Badge`（漂移状态标签）、`Tooltip`（悬浮数值详情）
  - TypeScript 5.x — 类型安全
- **禁止使用**：
  - 禁止在 Canvas 上使用 D3 的 SVG 渲染路径（Canvas 渲染性能优于 SVG，60fps 更新场景必须用 Canvas）
  - 禁止在 `requestAnimationFrame` 回调内部直接操作 D3 scale/axis（每帧仅更新数据路径，scale 和 axis 仅在 resize 或漂移超限时重绘）
  - 禁止使用 ECharts / Chart.js 等重型图表库（D3 按需引入，bundle < 10KB）

### 输入定义（精确类型）

#### Zustand Store 扩展（在 `useSimulationStore` 中新增 energy slice）

```typescript
/**
 * 能量监控切片的运行时状态。
 * 写入方：SIM-01 的 consumeFrameToStore（每帧更新 kineticEnergy/potentialEnergy/totalEnergy）
 * 读取方：本模块 (SIM-04)、EXP-03 (声音化引擎)、LAB-02 (物理验证套件)
 */
interface EnergyMonitorState {
  // ===== 每帧更新的原始值（由 SIM-01 写入，本模块只读） =====
  /** 系统动能 (J)。来自 Worker buffer offset 9。示例：4.905 */
  kineticEnergy: number;
  /** 系统势能 (J)。来自 Worker buffer offset 10。示例：-9.81 */
  potentialEnergy: number;
  /** 系统总能量 (J)。来自 Worker buffer offset 11。E = K + V。示例：-4.905 */
  totalEnergy: number;

  // ===== 本模块管理的派生指标 =====
  /**
   * 仿真开始时刻的总能量 (J)。
   * 在首次收到非零 totalEnergy 时记录，作为漂移计算的基准。
   * 仿真 reset 时清零重新记录。
   */
  energyInitial: number | null;
  /**
   * 当前能量相对漂移（比例，非百分比）。
   * drift = |totalEnergy - energyInitial| / max(|energyInitial|, 1e-10)
   * 范围：[0, +∞)，正常情况 < 0.0001。
   */
  energyDrift: number;
  /**
   * 漂移是否超过 0.5% 阈值。
   * 超过时 UI 显示红色告警 Badge。
   */
  driftExceeded: boolean;
  /**
   * 当前会话中观察到的能量范围。
   */
  energyMin: number;   // 观察到的最小总能量 (J)
  energyMax: number;   // 观察到的最大总能量 (J)
  /**
   * 仿真是否处于活跃状态。
   * 仿真暂停或 reset 时重置漂移追踪。
   */
  isSimulationActive: boolean;

  // ===== Actions =====
  /** SIM-01 每帧调用：更新原始能量值并重新计算派生指标 */
  updateEnergy: (k: number, v: number, e: number) => void;
  /** 仿真 reset 时调用：重置漂移基准和极值 */
  resetEnergyTracking: () => void;
}

/** 能量漂移阈值常量 */
const DRIFT_THRESHOLD = 0.005;  // 0.5%
```

#### 组件 Props

```typescript
/**
 * EnergyMonitorPanel 的配置属性。
 */
interface EnergyMonitorProps {
  /**
   * Canvas 宽度 (px)。默认 320。
   * 由父容器通过 ResizeObserver 动态传入。
   */
  width?: number;
  /**
   * Canvas 高度 (px)。默认 160。
   */
  height?: number;
  /**
   * 时间窗口 (s)。图表 X 轴显示最近 N 秒的能量曲线。
   * 默认 30（即 1800 帧 @60fps）。
   */
  timeWindow?: number;
  /**
   * 是否显示动能/势能分项曲线。
   * 默认 true。关闭时仅显示总能量 E 曲线。
   */
  showComponents?: boolean;
}
```

### 输出定义（精确类型）

#### 能量数据点（Canvas 渲染用，不在 store 中存储）

```typescript
/**
 * 能量时序数据点。
 * 不在 Zustand 中存储（避免双重存储），
 * 在 Canvas 渲染循环中从 RingBuffer 动态读取。
 */
interface EnergyDataPoint {
  /** 仿真时间 (s) */
  t: number;
  /** 动能 (J) */
  K: number;
  /** 势能 (J) */
  V: number;
  /** 总能量 (J) */
  E: number;
}
```

#### 组件渲染结构

```
┌─────────────────────────────────────────┐
│  EnergyMonitorPanel (Card)               │
│  ┌─────────────────────────────────────┐ │
│  │  能量监控                    [正常]  │ │ ← 标题行 + Badge
│  │  漂移: 0.023%  │  范围: [-5.1, -4.7]│ │ ← 指标行
│  ├─────────────────────────────────────┤ │
│  │                                     │ │
│  │  ┌─ Canvas (320×160) ────────────┐  │ │
│  │  │  E(t) ── 绿色                  │  │ │ ← 能量折线图
│  │  │  K(t) - - 蓝色（虚线）         │  │ │
│  │  │  V(t) ······ 橙色（点线）     │  │ │
│  │  │  ─────────────────── t (30s)   │  │ │
│  │  └────────────────────────────────┘  │ │
│  └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### 核心逻辑步骤

#### 阶段 A：数据采集

**步骤 1：订阅能量帧更新**

- **操作对象**：`useSimulationStore` 的 `kineticEnergy`/`potentialEnergy`/`totalEnergy` 字段
- **具体操作**：
  1. 使用 Zustand `subscribe` 监听 `totalEnergy` 变化（非 `useStore` hook，避免每帧触发 React 重渲染）
  2. 每次 `totalEnergy` 变更时调用 `updateEnergy(k, v, e)`：

     ```typescript
     function updateEnergy(k: number, v: number, e: number): void {
       const state = get();
       // 首次记录基准能量
       if (state.energyInitial === null || !state.isSimulationActive) {
         state.energyInitial = e;
         state.energyMin = e;
         state.energyMax = e;
         state.isSimulationActive = true;
       }
       // 更新极值
       if (e < state.energyMin) state.energyMin = e;
       if (e > state.energyMax) state.energyMax = e;
       // 计算漂移（防止除零）
       const denom = Math.max(Math.abs(state.energyInitial), 1e-10);
       const drift = Math.abs(e - state.energyInitial) / denom;
       state.energyDrift = drift;
       state.driftExceeded = drift > DRIFT_THRESHOLD;
       // 原值写入
       state.kineticEnergy = k;
       state.potentialEnergy = v;
       state.totalEnergy = e;
     }
     ```

  3. 将 `{ t, K, V, E }` 追加到模块内部的环形缓冲区 `energyBuffer: EnergyDataPoint[]`（容量 = `timeWindow * 60`，默认 1800）
- **输入来源**：SIM-01 的 `simulationLoop` → `consumeFrameToStore` → Zustand `setState`
- **输出去向**：`useSimulationStore` 能量切片更新 + 模块内部 `energyBuffer` 追加
- **失败行为**：`e` 为 NaN → 跳过本帧（不更新能量切片，不追加 buffer），`console.warn`

**步骤 2：仿真重置时重新基准**

- **操作对象**：`energyInitial`、`energyMin`、`energyMax`、`energyBuffer`
- **具体操作**：
  1. 监听 `useSimulationStore` 的 reset 事件（可通过检测 `t` 从 > 0 突变为 0 判断）
  2. 检测到 reset → 调用 `resetEnergyTracking()`：
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
       energyBuffer.length = 0;  // 清空缓冲区
     }
     ```
  3. 下一帧 `totalEnergy` 到达时自动重新记录 `energyInitial`
- **输入来源**：检测到 `t` 降为 0（SIM-01 Worker reset 后首个 batch 的第一帧）
- **输出去向**：重置的能量切片状态
- **失败行为**：误检测（如时间反演模式 `t` 递减但不归零）→ `t` 递减但不为 0 时不应触发 reset

#### 阶段 B：Canvas 渲染

**步骤 3：D3 Canvas 图表初始化**

- **操作对象**：`<canvas>` 元素及其 2D 渲染上下文
- **具体操作**：
  1. 组件挂载时创建 Canvas ref，获取 `CanvasRenderingContext2D`
  2. 创建 D3 scale：

     ```typescript
     const xScale = d3.scaleLinear()
       .domain([0, timeWindow])    // X: 仿真时间 (s)，显示最近 30s
       .range([margin.left, width - margin.right]);

     const yScale = d3.scaleLinear()
       .domain([energyMin, energyMax])  // Y: 能量 (J)，动态范围
       .range([height - margin.bottom, margin.top])
       .nice();  // 圆整到整洁数值
     ```

  3. 创建 D3 line generator：

     ```typescript
     const lineE = d3.line<EnergyDataPoint>()
       .x(d => xScale(d.t % timeWindow))    // X 取模实现滚动窗口
       .y(d => yScale(d.E))
       .context(ctx);  // 绑定到 Canvas 2D 上下文

     const lineK = d3.line<EnergyDataPoint>()
       .x(d => xScale(d.t % timeWindow))
       .y(d => yScale(d.K));

     const lineV = d3.line<EnergyDataPoint>()
       .x(d => xScale(d.t % timeWindow))
       .y(d => yScale(d.V));
     ```

  4. 绘制坐标轴（仅在初始化或 resize 时执行）：
     - X 轴：底部，标签 "时间 (s)"，刻度 0/10/20/30
     - Y 轴：左侧，标签 "能量 (J)"，自动刻度
  5. 绘制图例（右上角）：绿色实线 = E、蓝色虚线 = K、橙色点线 = V
- **输入来源**：`width`/`height` props + `timeWindow` + `energyMin`/`energyMax`
- **输出去向**：就绪的 Canvas 渲染管线，等待步骤 4 的每帧更新
- **失败行为**：Canvas 2D 上下文获取失败（极端情况）→ 降级为纯数字显示（不渲染图表），`console.error`

**步骤 4：每帧 Canvas 更新**

- **操作对象**：Canvas 2D 上下文（增量绘制）
- **具体操作**：
  1. 使用 `requestAnimationFrame` 驱动更新（与 SIM-01 的 `simulationLoop` 解耦，独立 rAF）
  2. 每帧执行：
     a. 清空 Canvas（`ctx.clearRect(0, 0, width, height)`）
     b. 重绘网格线和坐标轴（从已初始化的 D3 axis 对象快速绘制）
     c. 检查 Y 轴范围：若当前 `totalEnergy` 超出 `yScale.domain()` → 更新 `yScale.domain([newMin, newMax]).nice()`，重绘 Y 轴
     d. 从 `energyBuffer` 中过滤最近 `timeWindow` 秒的数据点
     e. 重新计算每个数据点的 X 坐标（取模滚动）：`x = xScale((d.t - currentTime + timeWindow) % timeWindow)`
       — 实际上更好的做法是用滑动窗口：仅显示 `[currentTime - timeWindow, currentTime]` 范围内的点
     f. 绘制三条线：
        ```
        ctx.save();
        // E 线：绿色实线，2px
        ctx.strokeStyle = "#22c55e"; ctx.lineWidth = 2;
        ctx.beginPath(); lineE(data); ctx.stroke();
        // K 线：蓝色虚线，1px
        ctx.strokeStyle = "#3b82f6"; ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); lineK(data); ctx.stroke();
        // V 线：橙色点线，1px
        ctx.strokeStyle = "#f97316"; ctx.lineWidth = 1;
        ctx.setLineDash([1, 3]);
        ctx.beginPath(); lineV(data); ctx.stroke();
        ctx.restore();
        ```
  3. 本模块的 rAF 与 SIM-01 渲染管线的 rAF 解耦，允许独立控制刷新率（可降为 30fps 以节省性能）
- **输入来源**：`energyBuffer`（本模块内部维护的数据点数组）
- **输出去向**：Canvas 像素更新
- **失败行为**：`energyBuffer` 为空（仿真未开始）→ 仅清空 Canvas，不绘制线条

**步骤 5：漂移指示器更新**

- **操作对象**：漂移百分比的 DOM 元素
- **具体操作**：
  1. 使用 React 组件订阅 `useSimulationStore(s => ({ drift: s.energyDrift, exceeded: s.driftExceeded }))`
  2. 计算显示值：`driftPercent = (energyDrift * 100).toFixed(3)` + `"%"`

     ```tsx
     function DriftIndicator() {
       const drift = useSimulationStore(s => s.energyDrift);
       const exceeded = useSimulationStore(s => s.driftExceeded);
       const energyMin = useSimulationStore(s => s.energyMin);
       const energyMax = useSimulationStore(s => s.energyMax);

       const driftPercent = (drift * 100).toFixed(3);

       return (
         <div className="flex items-center gap-3 text-sm">
           <span className="text-muted-foreground">漂移:</span>
           <span className={cn(
             "font-mono tabular-nums",
             exceeded ? "text-red-500 font-bold" : "text-emerald-500"
           )}>
             {driftPercent}%
           </span>
           {exceeded && (
             <Badge variant="destructive" className="animate-pulse">
               超阈值
             </Badge>
           )}
           <span className="text-muted-foreground text-xs">
             范围: [{energyMin.toFixed(2)}, {energyMax.toFixed(2)}] J
           </span>
         </div>
       );
     }
     ```

  3. 漂移超阈值（`driftExceeded = true`）时：
     - 数值变为红色加粗
     - 显示脉冲动画 `Badge`："超阈值"
     - 面板标题栏右侧状态从绿色 "正常" 变为红色 "异常"
  4. 漂移恢复阈值以下 → 红色状态保持显示（锁存告警），直到用户手动点击 "清除" 按钮或仿真 reset
- **输入来源**：`useSimulationStore` 的 `energyDrift`/`driftExceeded`/`energyMin`/`energyMax`
- **输出去向**：DOM 更新
- **失败行为**：`energyDrift` 为 NaN → 显示 "--"

### 依赖与集成接口

| 依赖方 | 具体接口 | 用途 |
|--------|----------|------|
| Zustand (useSimulationStore) | `useSimulationStore(s => s.kineticEnergy)` 等 | 订阅每帧能量值 |
| Zustand (useSimulationStore) | `useSimulationStore.getState().updateEnergy` | SIM-01 调用以更新能量切片 |
| D3.js | `d3.scaleLinear` `d3.line` `d3.axisBottom` `d3.axisLeft` | Canvas 图表渲染 |
| shadcn/ui | `Card` `Badge` `Tooltip` | 面板容器和漂移状态标签 |

**对外暴露的公共接口（供其他模块消费）**：

| 消费方模块 | 调用方式 | 消费的数据 |
|-----------|---------|-----------|
| LAB-02 物理验证套件 | `useSimulationStore(s => s.driftExceeded)` | 能量守恒验证是否通过（漂移 < 0.5%） |
| LAB-02 物理验证套件 | `useSimulationStore(s => s.energyDrift)` | 精确漂移数值（写入验证报告） |
| EXP-03 声音化引擎 | `useSimulationStore(s => s.kineticEnergy)` | 动能值 → 映射音色亮度 |
| 任何模块 | `useSimulationStore(s => s.totalEnergy)` | 当前总能量（只读） |

### 状态机

能量监控面板的告警状态机：

| 当前状态 | 触发事件 | 下一状态 | 前置条件 | 副作用 |
|----------|----------|----------|----------|--------|
| `normal` | `totalEnergy` 更新 | `normal` | `drift < 0.5%` | 漂移指示器显示绿色百分比；Badge 绿色 "正常" |
| `normal` | `totalEnergy` 更新 | `alerted` | `drift >= 0.5%` | 漂移指示器变红色加粗；Badge 红色脉冲 "超阈值"；`driftExceeded = true` |
| `alerted` | `totalEnergy` 更新 | `alerted` | `drift < 0.5%` 且用户未清除 | 漂移指示器恢复绿色，但 Badge 保持红色（锁存） |
| `alerted` | 用户点击 "清除" 按钮 | `normal` | `drift < 0.5%` | Badge 恢复绿色 "正常"；`driftExceeded = false` |
| `alerted` | 用户点击 "清除" 按钮 | `alerted` | `drift >= 0.5%`（仍在超阈值） | Badge 保持红色；`driftExceeded` 保持 true |
| 任意 | `resetEnergyTracking` | `normal` | 仿真 reset | 清除所有状态；`energyInitial` 置 null；Badge 重置 |

### 异常与边界条件

#### 异常 1：初始能量为零（边界情形）

- **触发条件**：`totalEnergy` 的初始值为 0（如 m1=m2=0 的极端退化场景，虽然正常参数不应出现）
- **处理策略**：
  1. `updateEnergy` 中计算 `denom = max(abs(energyInitial), 1e-10)`
  2. 该 1e-10 保护防止除零，结果 drift 会极大（> 100%）→ 立即触发 `driftExceeded`
  3. UI 显示漂移 "> 999%" + 红色告警
  4. 用户应意识到参数设置不当
- **重试参数**：不自动重试。用户调整参数后 reset。

#### 异常 2：Canvas 渲染帧率低于仿真帧率导致数据积压

- **触发条件**：Canvas 以 30fps 渲染，但能量数据以 60fps 到达 → `energyBuffer` 每 2 帧增长 1 个积压
- **处理策略**：
  1. `energyBuffer` 容量固定为 `timeWindow * 60`（默认 1800 = 30s × 60fps）
  2. 超出容量时从头部移除旧数据（FIFO）
  3. Canvas 每帧只渲染最近 `timeWindow * 30` 个点（30fps 有效分辨率），每两个采样点取一个
  4. 即使用 `buffer.slice(-timeWindow * 30)` 并隔点采样，保证渲染点数 ≤ 900
- **重试参数**：自动降采样，无需人工介入。

#### 异常 3：能量值 NaN

- **触发条件**：SIM-01 Worker 积分发散导致 `totalEnergy` 为 NaN（SIM-01 已检测 NaN 并发送 error，但在发送 error 前可能有若干帧已写入 store）
- **处理策略**：
  1. `updateEnergy` 检查 `isNaN(e)` → 跳过本帧更新（不修改切片状态）
  2. `energyBuffer` 不追加 NaN 数据点（防止 D3 line generator 绘制断裂线）
  3. 若连续 60 帧（1 秒）收到 NaN → 标记 `isSimulationActive = false`，面板显示 "数据不可用"
  4. SIM-01 的 error 恢复机制触发 reset 后 → `resetEnergyTracking` → 恢复正常
- **重试参数**：自动等待 SIM-01 恢复。不主动干预。

#### 异常 4：Canvas resize 导致坐标轴失效

- **触发条件**：父容器通过 ResizeObserver 改变 `width`/`height` props
- **处理策略**：
  1. 组件 `useEffect` 监听 `width`/`height` 变化
  2. 变化时：
     a. 更新 Canvas 元素的 `width`/`height` 属性（物理像素 = CSS 像素 × `devicePixelRatio`）
     b. 重新创建 D3 scale（`xScale.range([newMarginLeft, newWidth - newMarginRight])`）
     c. 重新绘制坐标轴和图例（全量重绘）
  3. 数据 point buffer 不丢失
- **重试参数**：每次 resize 全量重绘一次，无需更多重试。

#### 异常 5：阻尼导致能量单调衰减时的"假阳性"漂移告警

- **触发条件**：用户设置了 `damping > 0`（非保守系统），能量随仿真时间单调衰减。经过足够长时间后漂移必然 > 0.5%
- **处理策略**：
  1. `updateEnergy` 检查 `useSimulationStore.getState().params.damping`
  2. 若 `damping > 0` → 漂移告警阈值从 0.5% **放宽**到 **不告警**（阻尼系统能量不守恒是物理正确的）
  3. 面板标题行显示 "(阻尼开启)" 标签，提示用户漂移告警已禁用
  4. 漂移百分比仍显示，但始终为绿色（不触发 `driftExceeded`）
  5. 仅在 `damping === 0` 时执行 0.5% 阈值检查
- **重试参数**：无，行为自动切换。

### 原则兑现清单

| 原则来源 | 原则名称 | 代码级约束 |
|----------|----------|------------|
| 功能设计_v0 §五 5.2 | 能量守恒标准 | `DRIFT_THRESHOLD = 0.005`；1000s 内漂移 < 0.5% 视为通过；仅 `damping === 0` 时检查（阻尼系统豁免） |
| 功能设计_v0 §一 1.1 | 分层递进认知 | 本模块仅展示能量数据（感知层→分析层过渡），不做物理判定（判定交给 LAB-02） |
| 技术栈设计 §3.2 | Canvas 高性能渲染 | 使用 Canvas 2D（非 SVG）渲染能量折线图；每帧仅 `clearRect` + `stroke`，无 DOM 操作；D3 scale 仅在 resize 时重建 |
| 通用原则 | 实时性 | 漂移指示器更新延迟 < 2 帧（~33ms @60fps）；图表 Y 轴自适应范围更新延迟 < 60 帧（1s） |

### 验收测试场景

#### 正向测试 1：无阻尼仿真能量漂移正常

- **Given**：
  - 仿真参数：`{ m1: 1.0, m2: 1.0, L1: 1.0, L2: 1.0, g: 9.81, damping: 0 }`，方法 = "RK4"
  - 仿真已运行 600 帧（10s）
  - 能量监控面板已渲染
- **When**：观察面板上的漂移指示器和折线图
- **Then**：
  - 漂移百分比 < 0.005%（RK4 在 10s 内漂移极小）
  - 漂移指示器显示绿色数值
  - Badge 显示绿色 "正常"
  - Canvas 上 K（蓝虚线）、V（橙点线）、E（绿实线）三条曲线可见
  - E 线近似水平（无阻尼时总能量守恒）
  - `driftExceeded === false`

#### 正向测试 2：阻尼开启时漂移告警豁免

- **Given**：仿真参数中 `damping = 0.1`（非保守系统）
- **When**：仿真运行 600 帧，能量因阻尼持续衰减，漂移 > 0.5%
- **Then**：
  - 漂移百分比显示实际值（可能 > 1%），但颜色保持绿色
  - 面板标题行显示 "(阻尼开启)" 标签
  - `driftExceeded === false`（豁免）
  - Badge 不触发红色告警

#### 正向测试 3：仿真 reset 后漂移基准重置

- **Given**：仿真运行 300 帧后触发 reset（初始条件变更）
- **When**：reset 完成后继续运行 300 帧
- **Then**：
  - `energyInitial` 在 reset 后被重新记录（非旧值）
  - 漂移百分比基于新的 `energyInitial` 重新计算
  - `energyBuffer` 被清空（旧仿真数据不污染新图表）
  - 图表从 `t = 0` 重新开始绘制

#### 异常测试 1：阻尼关闭时漂移超阈值告警

- **Given**：`damping = 0`，`method = "Euler"`（Euler 方法能量漂移大）
- **When**：仿真运行 1000 帧以上
- **Then**：
  - 漂移在某个时刻超过 0.5%
  - `driftExceeded` 变为 `true`
  - 漂移数值变为红色加粗
  - Badge 显示红色脉冲 "超阈值"
  - Canvas 上 E 线出现可见的上升或下降趋势（能量漂移）
  - 用户点击 "清除" 按钮后若漂移仍超阈值 → Badge 保持红色

#### 异常测试 2：能量 NaN 时面板不崩溃

- **Given**：仿真正常运行中
- **When**：模拟 SIM-01 写入 `totalEnergy = NaN`（积分发散前兆）
- **Then**：
  - `updateEnergy` 检测到 `isNaN(e)` → 跳过本帧
  - 面板漂移指示器保持上一次有效值（不显示 NaN）
  - Canvas 图表在 NaN 帧处留空（不绘制断裂线段），下一有效帧继续绘制
  - 连续 60 帧 NaN 后面板显示 "数据不可用"
  - 组件未崩溃（无白屏或错误边界触发）

### 注意事项与禁止行为

1. **【store 写入权】** `kineticEnergy`/`potentialEnergy`/`totalEnergy` 三个原始值由 SIM-01 的 `consumeFrameToStore` 独占写入。本模块只读这三个字段。本模块写入的字段是 `energyInitial`/`energyDrift`/`driftExceeded`/`energyMin`/`energyMax`（派生指标）。禁止在 SIM-04 中覆盖 SIM-01 写入的原始能量值。
2. **【漂移计算时机】** 漂移计算在 `updateEnergy` 中同步执行（无异步 I/O），确保不落后于当前帧。禁止将漂移计算放入 `useEffect` 或 `requestAnimationFrame`（会引入额外帧延迟）。
3. **【Canvas 物理像素】** Canvas 元素的 `width`/`height` 属性必须乘以 `window.devicePixelRatio`（物理像素），CSS 尺寸使用逻辑像素。否则在高 DPI 屏幕上图表模糊。D3 scale 的 `range` 使用物理像素。
4. **【初始能量为负的处理】** 双摆系统在 `y = 0` 为零势面时总能量通常为负（势能负值主导）。漂移公式 `|E - E₀| / |E₀|` 使用绝对值分母，正确处理负初始能量。若 `E₀ ≈ 0`（罕见），`1e-10` 保护除零。
5. **【禁止行为】** 禁止在 Canvas 渲染循环中调用 `d3.select(canvas)` 或 `d3.select(ctx)` 之外的 DOM 选择器（D3 的 Canvas 模式仅用 context，不操作 DOM）。每帧渲染的路径数据必须是纯数组操作，禁止 D3 的 `enter/update/exit` 模式（那是 SVG 专属）。
6. **【禁止行为】** 禁止将能量数据存储在 Zustand 之外的全局变量中（以避免热重载时状态丢失）。`energyBuffer` 是本模块内部的非 React 状态（`useRef` 持有），用于 Canvas 渲染，不应被其他模块访问。
7. **【易错点】** 时间反演模式下 `t` 递减但仿真仍在运行。`energyBuffer` 中的数据点按时间顺序存储，但 `t` 递减会导致新数据点的 `t` 小于旧数据点。Canvas 渲染时必须按 `t` 排序后再绘制（`energyBuffer.sort((a, b) => a.t - b.t)`），否则线条会绘制成锯齿状。推荐：时间反演模式下暂停向 `energyBuffer` 追加数据（反演是回溯，不产生新物理信息）。
8. **【易错点】** `driftExceeded` 的锁存逻辑：漂移恢复正常后 Badge 保持红色，等待用户手动清除。但若用户切换了阻尼状态（`damping: 0 → 0.1` 或反之），锁存应自动清除（因为告警规则已变更）。检查 `params.damping` 变化以触发自动清除。
9. **【偷懒红线】** Canvas 图表禁止以 "使用现成的 Chart.js 折线图" 替代。必须使用 D3.js + Canvas 2D 实现，确保 bundle 体积可控且与其他 D3 图表（ANL-01 热力图、ANL-02 分岔图）共享 D3 依赖。
