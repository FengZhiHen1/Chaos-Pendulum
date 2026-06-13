# 功能点：EXP-02 运动尾迹渲染

> **文档生成时间**：`2026-04-28 20:00:00 CST`
> **版本记录**：
> | 版本 | 时间 | 修改人 | 变更摘要 |
> |------|------|--------|----------|
> | v1.0 | `2026-04-28 20:00:00` | AI Assistant | 初始版本 |
> | v1.1 | `2026-04-30 14:10:00` | AI Assistant | 三角形带方案实现更新：独立矩形 → 连续 indexed triangle strip + round cap；新增 viewport 像素→世界单位动态转换；maxWidth 默认值 3.0 → 15.0 |

> **冲突核查指引**：若发现与已有规格文档冲突，优先以时间戳更新的版本为准，并在版本记录中追加冲突解决条目。

---

## 所属模块与溯源

- **对应总设计章节**：功能设计_v0 §三 3.2「运动尾迹系统（升级）」；技术栈设计.md §4.1「3D 实时双摆仿真 — 尾迹渲染」
- **依赖的其他功能模块**：
  - `SIM-01`（双摆物理引擎）— 提供每帧的 StateVector 和球体 3D 坐标，通过 `useSimulationStore` 消费
  - `EXP-01`（3D 仿真场景）— 本模块的 `<TrailRenderer>` 在 EXP-01 的 `<Canvas>` 内渲染；本模块的 `useTrailBuffer` hook 被 EXP-01 的 `Scene3D` 调用
  - `EXP-04`（蝴蝶效应对比器）— 分屏模式下需要两条独立尾迹（摆 A 金色 / 摆 B 紫色），`useTrailBuffer` 支持多实例
  - `SYS-01`（响应式布局引擎）— 提供设备类型，移动端降低尾迹分段数

---

## 已有设计兼容性分析

- **已审查的相关规格文档**：
  - `docs/功能设计/2-探索模式/EXP-01-3D仿真场景.md`（v1.0, 2026-04-28 19:30:00 CST）
- **兼容性结论**：
  - **无冲突**。EXP-01 已声明「尾迹组件在本场景内渲染，但尾迹数据和持久度由 EXP-02 管理」，本规格遵循该职责划分
  - **类型复用**：
    - 复用 `StateVector`（来自 `src/shared/types/physics.ts`），用于计算下摆球速度和位置
    - 复用 `PhysicsParams`（来自 `src/shared/types/physics.ts`），`L1`/`L2` 用于将 StateVector 转换为 3D 坐标
    - 复用 `useExploreStore.trailLength`（类型 `TrailLength = 50 | 200 | 1000 | 0`），本模块消费该值控制尾迹持久度。注意：本模块内部将 `0` 映射为"无限"模式、将 `-1` 新增为"仅保留当前周期"模式（`TrailLength` 类型需扩展）
    - 复用 `RingBuffer<T>`（来自 `src/features/data/ring-buffer/ring-buffer.ts`），本模块使用 `RingBuffer<TrailPoint>` 存储尾迹点
  - **扩展项**：本模块需扩展 `useExploreStore` 中的 `TrailLength` 类型，增加 `-1` 表示"仅保留当前周期"。该扩展在 EXP-02 规格中提出，修改 `src/features/explore/store.ts` 时需同步更新 EXP-01 的类型引用（EXP-01 不消费 trailLength，故不受影响）
- **复用的已有定义**：`StateVector`、`PhysicsParams`、`RingBuffer<T>`、`useExploreStore.trailLength`、`useSimulationStore.(state|params|isRunning)`

---

## 技术栈绑定

- **必须使用**：
  - `react@^18.3.1` — UI 框架，提供 hook 和组件封装
  - `@react-three/fiber@^8.17.0` — `useFrame`（每帧追加尾迹点）、`useThree`（获取 gl 上下文）
  - `@react-three/drei@^9.114.0` — `<Line>` 组件（渲染尾迹线段，支持 `vertexColors` 和 `lineWidth`）
  - `three@^0.184.0` — `THREE.BufferGeometry`（尾迹顶点缓冲）、`THREE.Float32BufferAttribute`（位置和颜色属性）、`THREE.Vector3`（位置计算）、`THREE.Color`（速度→颜色插值）、`THREE.LineBasicMaterial`（尾迹线段材质）、`THREE.MathUtils.lerp`（线性插值）
  - `zustand@^4.5.5` — 订阅 `useSimulationStore` 和 `useExploreStore`
  - `@/features/data` — `RingBuffer<T>` 类（来自 `src/features/data/index.ts` 公共接口）

- **禁止使用**：
  - 禁止在 `<Canvas>` 外直接操作 `THREE.BufferGeometry`（必须通过 R3F 的 ref 或 `useFrame` 操作）
  - 禁止每帧重建 `BufferGeometry`（应使用 `setAttribute` + `needsUpdate = true` 增量更新）
  - 禁止硬编码颜色渐变断点，必须通过 `VELOCITY_COLOR_GRADIENT` 配置表引用
  - 禁止直接修改 `useSimulationStore` 的 `state` 字段，尾迹仅消费仿真数据
  - 禁止使用 `Array.push` 无限增长尾迹数组，必须使用固定容量 RingBuffer

---

## 输入定义（精确类型）

### 核心数据结构

```typescript
import { Vector3 } from "three";

/**
 * 单个尾迹采样点。
 * 存储下摆球在某时刻的 3D 位置和瞬时速率，用于尾迹颜色与粗细映射。
 */
interface TrailPoint {
  /**
   * 下摆球在世界空间中的 3D 坐标（单位：米）。
   * 示例值：{ x: 1.2, y: -0.8, z: 0.0 }
   */
  position: Vector3;

  /**
   * 下摆球的瞬时线速率（单位：m/s）。
   * 由 L₂ × |ω₂| 近似计算，忽略 ω₁ 的贡献以简化计算。
   * 范围理论无上限，实际典型值 0.0 – 15.0。
   * 示例值：4.32
   */
  velocity: number;
}

/**
 * 尾迹持久度。
 * 正整数值 = 保留最近 N 步尾迹点
 * 0 = 无限（使用 RingBuffer 最大容量 6000 = 100 秒 × 60fps）
 * -1 = 仅保留当前周期（从最近一次穿越周期起点至今）
 */
type TrailPersistence = 50 | 200 | 1000 | 0 | -1;

/**
 * 速度-颜色渐变断点。
 * position: 渐变位置（0.0 – 1.0），0.0 = 静止端，1.0 = 高速端
 * color: 该位置的 RGB 颜色（hex 字符串）
 */
interface VelocityColorStop {
  position: number;
  color: string;
}
```

### Hook 接口：`useTrailBuffer`

```typescript
/**
 * useTrailBuffer 返回类型。
 * 该 hook 管理尾迹的 RingBuffer，Scene3D 每帧调用 appendPoint，
 * 并读取 trailPoints 传递给 TrailRenderer。
 */
interface TrailBufferAPI {
  /**
   * 当前尾迹点数组（从 RingBuffer 导出，按时间顺序，最新点在末尾）。
   * 类型：TrailPoint[]，长度 0 – persistence（或 RingBuffer 容量）。
   * 当 persistence < 0（周期模式）时，长度为当前周期内的点数。
   * 当仿真暂停或场景冻结时，此数组不再追加新点。
   */
  trailPoints: TrailPoint[];

  /**
   * 向尾迹缓冲区追加一个采样点。
   * @param point — 当前帧的下摆球位置与速率
   * @param params — 当前物理参数（用于周期检测的坐标计算）
   * @param state — 当前状态向量（用于周期检测的相位比较）
   *
   * 副作用：
   * - 将 point 追加到内部 RingBuffer
   * - 若 persistence === -1（周期模式），检测是否回到周期起点，若是则清空缓冲区后重新开始
   * - 若 RingBuffer 已满且 persistence > 0，最旧的点被自动覆盖
   */
  appendPoint(point: TrailPoint, params: PhysicsParams, state: StateVector): void;

  /**
   * 清空全部尾迹点。
   * 副作用：调用 RingBuffer.clear()，trailPoints 变为空数组 []。
   * 用途：用户点击"重置"按钮、切换仿真参数时调用。
   */
  clear(): void;

  /**
   * 当前尾迹持久度（从 useExploreStore.trailLength 读取并映射）。
   */
  persistence: TrailPersistence;
}
```

### 组件 Props：`TrailRenderer`

```typescript
/**
 * TrailRenderer 组件属性。
 * 该组件在 R3F <Canvas> 内渲染，生成尾迹的 Line 几何体。
 */
interface TrailRendererProps {
  /**
   * 尾迹点数组。来自 useTrailBuffer().trailPoints。
   * 空数组时渲染空 Line（不可见），不报错。
   * 长度：0 – persistence（或 RingBuffer 容量上限 6000）。
   */
  points: TrailPoint[];

  /**
   * 尾迹线条颜色主题。
   * - "velocity": 按速度着色（蓝色静止 → 红色高速），使用 vertexColors
   * - "solid": 单色尾迹，颜色由 solidColor 指定
   * 默认 "velocity"。
   */
  colorMode?: "velocity" | "solid";

  /**
   * 单色模式下的尾迹颜色。仅 colorMode === "solid" 时生效，默认 "#f0c040"（金色）。
   */
  solidColor?: string;

  /**
   * 尾迹全局透明度（0.0 – 1.0）。默认 0.85。
   * 在 Fragment Shader 中统一混合，与 vertexColors 的 RGB 独立。
   * 用途：用户可通过控制面板调节尾迹可见度。
   */
  opacity?: number;

  /**
   * 尾迹最大线宽（像素）。默认 15.0。
   * 实际线宽（屏幕像素）= maxWidth × (velocity / maxObservedVelocity)，clamp 至 [1px, maxWidth]。
   * 组件内部通过 R3F viewport 将像素宽度实时转换为世界单位，确保无论相机远近，
   * 尾迹视觉粗细始终恒定。
   * 桌面端/平板端使用三角形带（triangle strip）+ 圆角端帽实现真正可变宽度；
   * 移动端自动降级为固定 1px 宽度的 `<Line>` 以节省性能。
   */
  maxWidth?: number;

  /**
   * 速度-颜色渐变配置。默认使用内置 VELOCITY_COLOR_GRADIENT 常量。
   * 可选传入自定义渐变覆盖默认值（用于蝴蝶效应分屏中摆 B 使用紫色渐变）。
   */
  colorGradient?: VelocityColorStop[];
}
```

### 数据消费（从 Store 读取）

```typescript
// 从 useExploreStore 读取尾迹持久度
const trailLength: 50 | 200 | 1000 | 0 = useExploreStore((s) => s.trailLength);
// 映射规则：trailLength 值直接对应 TrailPersistence（50/200/1000/0）
// 用户选择"仅保留当前周期"时，trailLength 需设为 -1（当前 store 类型不支持，需扩展）

// 从 useSimulationStore 读取（用于 appendPoint 内部计算速度和坐标）
const params: PhysicsParams = useSimulationStore((s) => s.params);
const state: StateVector = useSimulationStore((s) => s.state);
const isRunning: boolean = useSimulationStore((s) => s.isRunning);

// 从 useAppStore 读取（用于响应式降级）
const deviceType: "desktop" | "tablet" | "mobile" = useAppStore((s) => s.deviceType);
```

---

## 输出定义（精确类型）

本模块有两类输出：

### 输出 1：视觉输出（TrailRenderer 组件）

在 Three.js 场景中渲染的尾迹线段，视觉特征如下：

| 视觉属性 | 实现方式 | 动态变化规则 |
|---------|---------|-------------|
| 尾迹路径 | `THREE.BufferGeometry` 的 `position` 属性（Float32Array，N×3） | 每帧追加新顶点，移除超出持久度的旧顶点 |
| 顶点颜色（速度模式） | `THREE.BufferGeometry` 的 `color` 属性（Float32Array，N×3），通过 `vertexColors: true` 启用 | 每帧根据最新的 velocity 更新新顶点的颜色；已有顶点颜色不变 |
| 顶点颜色（单色模式） | `THREE.LineBasicMaterial({ color })`，不启用 vertexColors | 全尾迹统一颜色 |
| 线条粗细 | 连续三角形带（indexed triangle strip）+ 圆角端帽（round cap）：速度越高，带越宽。桌面端/平板端 1-15px 等效宽度，手机固定 1px | 每帧通过 R3F viewport 将像素宽度转为世界单位，再根据 velocity 计算局部宽度 |
| 透明度 | `THREE.MeshBasicMaterial({ transparent: true, opacity })` | props 变化时更新 Material |
| 顶点数量上限 | desktop: 6000, tablet: 2000, mobile: 500 | 超限时最旧点被覆盖 |

### 输出 2：数据输出（useTrailBuffer hook 返回值）

```typescript
// useTrailBuffer() 返回值（传给 Scene3D 使用）
const { trailPoints, appendPoint, clear, persistence } = useTrailBuffer();
// trailPoints: TrailPoint[] — 当前尾迹的所有采样点
// appendPoint: (point: TrailPoint, params: PhysicsParams, state: StateVector) => void
// clear: () => void
// persistence: TrailPersistence — 当前持久度模式
```

---

## 核心逻辑步骤

### 步骤 1：Hook 初始化与持久度监听

- **操作对象**：`useTrailBuffer` hook 的内部状态（`RingBuffer<TrailPoint>` 实例 + `persistence` ref）
- **具体操作**：
  1. 在 hook 顶层创建 `RingBuffer<TrailPoint>` 实例，初始容量 = 6000（= 100 秒 × 60fps）
  2. 订阅 `useExploreStore.trailLength`：执行映射 `mapPersistence(trailLength)`：
     - `trailLength === 50` → `persistence = 50`
     - `trailLength === 200` → `persistence = 200`
     - `trailLength === 1000` → `persistence = 1000`
     - `trailLength === 0` → `persistence = 0`（无限模式）
     - `trailLength === -1` → `persistence = -1`（周期模式，需先扩展 useExploreStore 类型）
  3. 当 `persistence` 变化时：
     - 若新值为正整数值 50/200/1000：截断 `ringBuffer` 只保留最近 N 个点（调用内部 `truncateTo(n)` 方法）
     - 若新值为 0（无限）：不做截断，RingBuffer 使用容量上限 6000
     - 若新值为 -1（周期）：保留最近 50 个点作为起点参考，触发首次周期检测
  4. 返回 `{ trailPoints, appendPoint, clear, persistence }` 给调用方
- **输入来源**：`useExploreStore.trailLength`（初始值 200）
- **输出去向**：hook 返回值 → Scene3D 组件消费
- **失败行为**：
  - `trailLength` 值不在已知枚举范围内（如运行时被错误赋值为 99）：回退到默认值 200，`console.warn("EXP-02: unknown trailLength value, falling back to 200", trailLength)`

### 步骤 2：每帧追加采样点

- **操作对象**：内部 `RingBuffer<TrailPoint>`、周期检测状态（仅 persistence === -1 时）
- **具体操作**：
  1. Scene3D 在 `useFrame` 中调用 `appendPoint(point, params, state)`
  2. 检查 `useSimulationStore.getState().isRunning`：若为 `false`，立即 return，不追加任何点
  3. 计算下摆球 3D 坐标（与 EXP-01 步骤 2 的 ball2Position 计算完全一致）：
     ```
     const L1 = params.L1, L2 = params.L2;
     const ball1X = L1 * Math.sin(state.theta1);
     const ball1Y = -L1 * Math.cos(state.theta1);
     const ball2X = ball1X + L2 * Math.sin(state.theta2);
     const ball2Y = ball1Y - L2 * Math.cos(state.theta2);
     ```
  4. 构造 `TrailPoint`：
     ```
     point = {
       position: new Vector3(ball2X, ball2Y, 0),
       velocity: L2 * Math.abs(state.omega2)  // 简化速率 = 摆长 × 角速度绝对值
     }
     ```
  5. 将 `point` 推入 `ringBuffer.push(point)`
  6. 若 `persistence === -1`（周期模式）：执行步骤 4（周期检测）
- **输入来源**：Scene3D 每帧计算出的 ball2Position（或由 `useTrailBuffer` 内部根据 `useSimulationStore.getState()` 自行计算）、`persistence` ref
- **输出去向**：RingBuffer 中新增一个 TrailPoint
- **失败行为**：
  - `state` 中包含 NaN：跳过本帧追加，不污染尾迹缓冲区，`nanSkipCount` +1
  - 连续跳过 60 帧：清空尾迹缓冲区（`ringBuffer.clear()`），`console.warn("EXP-02: cleared trail due to persistent NaN state")`

### 步骤 3：尾迹点导出

- **操作对象**：`trailPoints` getter（每次 React 渲染时被读取）
- **具体操作**：
  1. 调用 `ringBuffer.toArray()` 获取全量尾迹点数组
  2. 若 `persistence > 0`（50/200/1000）：从数组末尾截取最后 `persistence` 个点：`points.slice(-persistence)`
  3. 若 `persistence === 0`（无限）：返回全部点（RingBuffer 最多 6000 个）
  4. 若 `persistence === -1`（周期）：返回从最近一次周期起点至今的全部点
  5. 若数组长度 < 2：返回空数组 `[]`（至少需要 2 个点才能构成线段）
  6. 返回的数组为浅拷贝，不暴露内部 RingBuffer 引用
- **输入来源**：内部 RingBuffer
- **输出去向**：返回给调用方 → 传入 `<TrailRenderer points={trailPoints} />`
- **失败行为**：不适用（纯读取操作，无副作用）

### 步骤 4：周期检测（仅 persistence === -1 模式）

- **操作对象**：周期检测状态机，包含 `cycleStartPoint: TrailPoint`、`cycleStartState: StateVector`、`minStepsSinceStart: number`
- **具体操作**：
  1. 初始化：首次进入周期模式时，记录当前 `state` 为 `cycleStartState`，`ringBuffer` 中最后一个点为 `cycleStartPoint`，`minStepsSinceStart = 100`（至少经过 100 步才允许触发周期闭合检测，避免瞬态误判）
  2. 每帧追加点后，检查 `ringBuffer.length >= minStepsSinceStart`
  3. 若满足，计算当前相位与起点相位的距离：
     ```
     const dTheta1 = Math.abs(normalizeAngle(state.theta1 - cycleStartState.theta1));
     const dTheta2 = Math.abs(normalizeAngle(state.theta2 - cycleStartState.theta2));
     const phaseDistance = Math.sqrt(dTheta1 * dTheta1 + dTheta2 * dTheta2);
     ```
     其中 `normalizeAngle(a: number)` 将角度归一化到 `[-π, π]`
  4. 若 `phaseDistance < 0.05`（约 2.86°，即相位空间中回到起点附近）：判定为周期闭合
  5. 周期闭合时：**不**清空 RingBuffer（保留当前周期的完整尾迹），仅记录 `cycleDetected = true`，后续追加的点覆盖旧点（利用 RingBuffer 的循环覆盖特性，自动从头覆盖上一周期的旧点）
  6. 若 `ringBuffer.length >= ringBuffer.capacity`（RingBuffer 已满且从未检测到周期闭合）：使用 LRU 逻辑，最旧的点被自动覆盖（RingBuffer 内置行为），不额外处理
- **输入来源**：每帧的 `state: StateVector`、`cycleStartState`
- **输出去向**：控制 RingBuffer 中哪些点属于"当前周期"
- **失败行为**：
  - 混沌运动下可能永远检测不到周期闭合：RingBuffer 自然循环覆盖，始终显示最近 6000 个点（≈ 100 秒），等效于无限模式。`console.log("EXP-02: period not detected within buffer capacity, cycling naturally")`

### 步骤 5：TrailRenderer — 构建 BufferGeometry

- **操作对象**：`THREE.BufferGeometry` 实例（通过 `useMemo` 或 `useRef` 持有，避免每帧重建）
- **具体操作**：
  1. 组件挂载时创建 `THREE.BufferGeometry`，预分配 `position`、`color` 属性数组和 `index` 索引数组：
     - `position` / `color`：`Float32Array`，容量 = `(2 × maxPoints + 16) × 3`
     - `index`：`Uint16Array`，容量 = `6 × (maxPoints - 1) + 48`
     其中 `maxPoints` = desktop 6000 / tablet 2000 / mobile 500
  2. 每帧 `useFrame` 中，根据 `props.points` 更新 BufferGeometry：
     - 若 `points.length < 2`：设置 `geometry.setDrawRange(0, 0)`，return
     - **第一遍**：遍历每个原始点，计算角平分线切线、法线、半宽，生成左右两个边界顶点，写入 `position` / `color` 数组
     - **第二遍**：生成索引：
       - strip 段：每段 2 个三角形（6 个索引），复用相邻段共享顶点
       - 起点 / 终点圆帽：各 8 个扇形三角形（24 个索引），以端点为圆心、半宽为半径生成半圆弧
     - 设置 `geometry.attributes.position.needsUpdate = true`、`geometry.attributes.color.needsUpdate = true`、`geometry.index.needsUpdate = true`
     - `geometry.setDrawRange(0, indexCount)`
  4. 使用 `<mesh>` + `<bufferGeometry>` + `<meshBasicMaterial>` 渲染（桌面/平板端）；移动端降级为 drei's `<Line>`
- **输入来源**：`props.points: TrailPoint[]`、`props.colorMode`、`props.colorGradient`、`props.opacity`、`props.maxWidth`
- **输出去向**：Three.js 渲染管线中的 Triangle 图元（桌面/平板端）或 Line 图元（移动端）
- **失败行为**：
  - `points` 中某点位置为 NaN：跳过该顶点的写入，保留上一帧的旧值（不主动清零，避免闪烁）

### 步骤 6：速度-颜色映射

- **操作对象**：纯函数 `velocityToColor(velocity: number, gradient: VelocityColorStop[]): { r: number; g: number; b: number }`
- **具体操作**：
  1. 定义默认渐变配置：
     ```typescript
     const VELOCITY_COLOR_GRADIENT: VelocityColorStop[] = [
       { position: 0.0, color: "#0044ff" },    // 静止 → 深蓝
       { position: 0.2, color: "#00ccff" },    // 低速 → 青
       { position: 0.4, color: "#00ff88" },    // 中低速 → 绿
       { position: 0.6, color: "#ffdd00" },    // 中高速 → 黄
       { position: 0.8, color: "#ff6600" },    // 高速 → 橙
       { position: 1.0, color: "#ff0000" },    // 极速 → 红
     ];
     ```
  2. 计算归一化速度：`t = clamp(velocity / MAX_OBSERVED_VELOCITY, 0, 1)`，其中 `MAX_OBSERVED_VELOCITY = 15.0`（m/s，覆盖绝大多数场景）
  3. 在断点之间进行线性插值：找到 t 所在的区间 `[stops[i].position, stops[i+1].position]`，对两个颜色进行 RGB 通道独立线性插值
  4. 返回 `{ r, g, b }` 各分量 0.0 – 1.0
  5. 缓存 `MAX_OBSERVED_VELOCITY` 在首次超出时自动扩展：若某帧 `velocity > MAX_OBSERVED_VELOCITY`，更新 `MAX_OBSERVED_VELOCITY = velocity`，后续帧用新上限归一化（不触发 React 重渲染，仅更新 ref）
- **输入来源**：`velocity: number`、`colorGradient?: VelocityColorStop[]`（未传则用默认）
- **输出去向**：RGB 三分量 → 写入 BufferGeometry color 属性
- **失败行为**：velocity 为 NaN 时，返回灰色 `{ r: 0.5, g: 0.5, b: 0.5 }`，标记数据异常

### 步骤 7：线条粗细模拟（圆角粗线三角形带方案）

- **操作对象**：`THREE.BufferGeometry` 的索引三角形带模式（替换步骤 5 的 Line 模式）
- **具体操作**：
  1. **像素到世界单位转换**：在 `useFrame` 中通过 `state.viewport.height / state.size.height` 计算每像素对应的世界单位长度 `pixelToWorld`。将 `maxWidth`（像素）转换为世界单位：`targetWorldW = maxWidth × pixelToWorld`，保底宽度 `minWorldW = 1 × pixelToWorld`。
  2. **切线计算**：对每个原始点 `points[i]` 计算角平分线切线：
     - 端点：取相邻线段的方向向量
     - 内部点：取前后两段归一化方向向量之和，再归一化（miter / 角平分线）
     - 若相邻点重合（段长 `< 1e-6`）：fallback 到邻近有效方向
  3. **边界顶点生成**：根据切线计算 XY 平面法线 `normal = (-tangent.y, tangent.x, 0)`，按该点速度计算半宽 `hw = width / 2`，生成左右边界顶点：
     - `left[i] = points[i] + normal × hw`
     - `right[i] = points[i] - normal × hw`
  4. **索引构建（连续 strip）**：
     - 每段（i → i+1）使用 4 个顶点（`left[i]`, `right[i]`, `left[i+1]`, `right[i+1]`）和 6 个索引构成 2 个三角形
     - 总顶点数 ≈ `2N + 16`（含两端圆帽），总索引数 ≈ `6(N-1) + 48`
  5. **圆角端帽（Round Cap）**：
     - 起点：以 `points[0]` 为圆心、`hw[0]` 为半径，在垂直于切线的平面上生成半圆（8 段扇形）
     - 终点：同理，以 `points[N-1]` 为圆心生成半圆
     - 颜色使用端点对应的速度颜色
  6. **降级方案**（`deviceType === "mobile"`）：使用 drei's `<Line>` 替代三角形带（`lineWidth = 1` 强制 1px）
  7. 使用 `<mesh>` + `<bufferGeometry>` + `MeshBasicMaterial({ vertexColors: true, side: DoubleSide, transparent: true, opacity, depthWrite: false })` 渲染
- **输入来源**：`points` 数组、`maxWidth` props、`MAX_OBSERVED_VELOCITY`、R3F `viewport` / `size`
- **输出去向**：带索引的三角形带 BufferGeometry + MeshBasicMaterial → GPU 渲染
- **失败行为**：
  - 连续两个点完全重合（段长 `< 1e-6`）：该段切线 fallback 到邻近有效方向，不跳过（保持尾迹连续性）

### 步骤 8：暂停冻结与重置

- **操作对象**：内部 `isRunning` 监听
- **具体操作**：
  1. 在 `useTrailBuffer` 中通过 `useEffect` 监听 `useSimulationStore.isRunning`
  2. 当 `isRunning` 从 `true` → `false`（暂停）：停止调用 `appendPoint`，保持 RingBuffer 内容不变。TrailRenderer 继续渲染当前尾迹（尾迹"定格"效果）。OrbitControls 保持可用，用户可 360° 旋转观察定格尾迹的空间结构
  3. 当 `isRunning` 从 `false` → `true`（恢复）：继续追加点，尾迹从定格位置继续延伸
  4. 外部调用 `clear()`（重置）：`ringBuffer.clear()`，`trailPoints` 变为 `[]`，TrailRenderer 渲染空线（不可见），`cycleStartPoint` 和 `cycleStartState` 重置为 null
- **输入来源**：`useSimulationStore.isRunning`、外部 `clear()` 调用
- **输出去向**：RingBuffer 状态变化 → TrailRenderer 重渲染
- **失败行为**：不适用（状态响应逻辑）

---

## 依赖与集成接口

| 依赖方 | 具体接口 | 用途 |
|--------|----------|------|
| `useSimulationStore` | `useSimulationStore.getState().state` | 每帧读取 StateVector 用于计算 ball2 速度和坐标 |
| `useSimulationStore` | `useSimulationStore.getState().params` | 读取 L1/L2 用于坐标计算 |
| `useSimulationStore` | `useSimulationStore((s) => s.isRunning)` | 判断是否追加新点（暂停时定格） |
| `useExploreStore` | `useExploreStore((s) => s.trailLength)` | 读取尾迹持久度配置 |
| `useAppStore` | `useAppStore((s) => s.deviceType)` | 设备类型 → 降级渲染参数 |
| `RingBuffer<TrailPoint>` | `new RingBuffer(6000)`、`.push()`、`.at()`、`.toArray()`、`.clear()`、`.length` | 尾迹点循环存储 |
| R3F | `useFrame((state, delta) => { ... })` | 每帧在 rAF 中追加尾迹点并更新 Geometry；通过 `state.viewport` / `state.size` 进行像素→世界单位转换 |
| drei | `<Line points={...} color={...} lineWidth={...} />` | 移动端降级方案（简单线段，无宽度变化） |
| three | `THREE.BufferGeometry` + `THREE.Float32BufferAttribute` | 尾迹顶点缓冲（位置 + 颜色） |
| three | `THREE.MeshBasicMaterial({ vertexColors: true, transparent: true })` | 三角形带材质（桌面/平板端可变宽度方案） |
| three | `THREE.Vector3` | 坐标运算（方向向量、垂直向量、法向量） |
| Scene3D (EXP-01) | `<TrailRenderer points={trailPoints} ... />` | EXP-01 在其 Canvas 内渲染本组件 |
| Scene3D (EXP-01) | `const { trailPoints, appendPoint, clear } = useTrailBuffer()` | Scene3D 调用 hook 管理尾迹数据 |

---

## 状态机

本功能点的尾迹生命周期状态机：

| 当前状态 | 触发事件 | 下一状态 | 前置条件 | 副作用 |
|----------|----------|----------|----------|--------|
| EMPTY | `simulation_started` | APPENDING | `isRunning === true` 且 ball2 位置合法 | 记录第一个 TrailPoint 到 RingBuffer |
| APPENDING | `frame_tick` | APPENDING | `isRunning === true` 且 state 无 NaN | 新 TrailPoint 追加到 RingBuffer 尾部 |
| APPENDING | `simulation_paused` | FROZEN | `isRunning` 变为 `false` | 停止追加点，保留 RingBuffer 内容，TrailRenderer 继续渲染定格尾迹 |
| APPENDING | `persistence_trim` | APPENDING | 无（内部事件：RingBuffer 长度超过 persistence） | 截断 RingBuffer 或最旧点被覆盖 |
| FROZEN | `simulation_resumed` | APPENDING | `isRunning` 变为 `true` | 从定格位置继续追加新点 |
| FROZEN | `simulation_reset` | EMPTY | 外部调用 `clear()` | RingBuffer 清空，TrailRenderer 渲染空线 |
| APPENDING | `simulation_reset` | EMPTY | 外部调用 `clear()` | RingBuffer 清空，persistence 保持不变 |
| APPENDING | `period_detected` | APPENDING | `persistence === -1` 且 `phaseDistance < 0.05` | RingBuffer 从头开始覆盖旧点，`cycleDetected` 标志设为 true |
| APPENDING | `nan_detected_60f` | EMPTY | 连续 60 帧 state 含 NaN | RingBuffer 清空，`console.warn` 输出 |

---

## 异常与边界条件

### 异常 1：尾迹点坐标含 NaN 或 Infinity

- **触发条件**：
  - `isNaN(ball2X) || isNaN(ball2Y) || !isFinite(ball2X) || !isFinite(ball2Y)` 为 true
  - 常见原因：ODE 积分发散导致 state 值爆炸
- **处理策略**：
  1. 在 `appendPoint` 开头检测坐标合法性
  2. 本帧跳过追加，`nanSkipCount += 1`
  3. 连续跳过 60 帧（约 1 秒）时：清空 `ringBuffer.clear()`，`nanSkipCount = 0`，`console.warn("EXP-02: cleared trail buffer after 60 consecutive NaN frames")`
  4. 不抛出异常，不阻塞仿真
  5. ODE 恢复后自动重新开始尾迹收集
- **重试参数**：不重试。等待仿真引擎恢复合法值后自动继续追加。

### 异常 2：RingBuffer 容量不足以容纳当前 persistence

- **触发条件**：
  - `persistence === 0`（无限模式）且 RingBuffer 已满（6000 个点 = 100 秒），但仿真仍在运行
- **处理策略**：
  1. RingBuffer 的内部 `push` 方法自动覆盖最旧元素（循环缓冲区标准行为）
  2. `trailPoints` 导出时取 RingBuffer.toArray() 的全部元素（最多 6000 个），反映最近 100 秒的尾迹
  3. **不扩容**：6000 容量为设计上限，确保内存使用恒定（≤ 6000 × (3 × 8 + 8) bytes ≈ 192KB）
  4. `console.log("EXP-02: ring buffer at capacity, oldest points overwritten")`（仅首次记录，后续静默）
- **重试参数**：不重试。循环覆盖是预期行为。

### 异常 3：设备性能不足以维持 60fps 尾迹更新

- **触发条件**：
  - `useAppStore.deviceType === "mobile"` 或 FPS < 30（由 FPSTracker 检测）
  - 手机 GPU 无法处理每帧更新 6000 个顶点的 BufferGeometry
- **处理策略**：
  1. `deviceType === "mobile"`：最大顶点数降为 500，使用简单 `<Line>` 替代三角形带，`lineWidth = 1`
  2. `deviceType === "tablet"`：最大顶点数降为 2000，三角形带宽度范围降为 1-3px
  3. 检测到 FPS < 30 且持续 > 3 秒（由 `useAppStore.debugInfo.fps` 判断）：将 `appendPoint` 的频率从每帧降为每 2 帧一次（隔帧采样），尾迹点密度减半
  4. `console.warn("EXP-02: low FPS detected, reducing trail sample rate to 30Hz")`
- **重试参数**：FPS > 55 持续 5 秒后恢复每帧采样。

### 异常 4：TrailRenderer 组件在 Canvas 外被意外渲染

- **触发条件**：
  - `TrailRenderer` 被错误地放在 R3F `<Canvas>` 外部（应为开发时的组件位置错误）
- **处理策略**：
  1. 在 `TrailRenderer` 的 `useMemo` 中调用 `useThree()`：若抛出异常（`R3F: useThree must be used within a Canvas`），捕获并渲染 fallback
  2. Fallback：返回空的 `<group />` 并打印 `console.error("EXP-02: TrailRenderer must be rendered inside R3F <Canvas>")`
  3. **不崩溃**整个应用
- **重试参数**：不重试。开发者修正组件位置后自动恢复。

### 异常 5：persistence 切换时 RingBuffer 数据截断导致视觉跳变

- **触发条件**：
  - 用户从 `persistence = 0`（无限，已积累 5000 个点）切换为 `persistence = 50`
- **处理策略**：
  1. 切换时调用内部 `truncateTo(n)` 方法：保留 RingBuffer 中最后 `n` 个点，丢弃旧点
  2. `truncateTo` 实现：创建新的临时数组存放最近 `n` 个点，`ringBuffer.clear()`，重新 `push` 这 `n` 个点
  3. 视觉上：尾迹瞬间缩短至最后 50 步，属于用户预期行为（明确选择了"短尾迹"模式）
  4. 不记录错误，不触发警告
- **重试参数**：不适用。截断是预期功能行为。

---

## 原则兑现清单

| 原则编号 | 原则名称 | 来源 | 代码级约束 |
|----------|----------|------|------------|
| P1 | 高内聚低耦合 | 项目结构设计 §2 | `useTrailBuffer` hook 和 `TrailRenderer` 组件均为 EXP-02 内部实现；Scene3D 仅通过 hook 返回的 `trailPoints` 数组 + `appendPoint` 函数交互，不感知内部 RingBuffer 实现 |
| P2 | 仿真核心下沉 | 项目结构设计 §2 | 尾迹渲染不包含任何 ODE 求解或物理计算逻辑，下摆球坐标由调用方（Scene3D）计算后传入，或由本模块从 `useSimulationStore.getState()` 读取 |
| P4 | 性能优先 | 技术栈设计 §1.2 | `useFrame` 中直接操作 BufferGeometry 的 Float32Array，不创建新对象；RingBuffer 固定容量确保零 GC 抖动；隔帧采样降级策略 |
| P5 | 响应式降级 | 功能设计_v0 §八 | 桌面/平板/手机三档：顶点数 6000/2000/500，渲染方式分别为三角形带/窄三角形带/简单 Line |
| P6 | 常量化视觉参数 | EXP-01 规范 | 速度-颜色渐变使用 `VELOCITY_COLOR_GRADIENT` 常量表，支持外部覆盖但不硬编码 |

---

## 验收测试场景

### 正向测试 1：默认持久度下尾迹正常渲染

- **Given**：
  - 仿真正在运行（`isRunning = true`），`useSimulationStore` 每帧提供合法 StateVector
  - 物理参数：`{ m1: 1.0, m2: 1.0, L1: 1.0, L2: 1.0, g: 9.81, damping: 0 }`
  - 初始状态：`{ theta1: 1.57, omega1: 0.0, theta2: 1.57, omega2: 0.5 }`
  - `useExploreStore.trailLength = 200`
  - `deviceType = "desktop"`
  - `colorMode = "velocity"`, `opacity = 0.85`, `maxWidth = 3`
- **When**：
  - 组件挂载，仿真运行 5 秒（约 300 帧）
- **Then**：
  - `trailPoints.length` 约为 200（已截断至持久度上限）
  - TrailRenderer 在场景中渲染可见的彩色尾迹线段
  - 尾迹起点（速度最低处）颜色接近蓝色 `#0044ff`，尾迹终点（速度最高处）接近红色系
  - 三角形带宽度在高速段明显宽于低速段（目视可分辨）
  - 尾迹全局透明度约 85%（能透过尾迹看到背景网格）
  - 控制台中无 error 或 warn 日志
  - 内存占用稳定，无持续增长趋势（Chrome Memory Profiler 确认）

### 正向测试 2：持久度切换与周期模式

- **Given**：
  - 同测试 1 初始状态，仿真已运行 10 秒
  - 参数设为小角度：`{ theta1: 0.1, omega1: 0.0, theta2: 0.1, omega2: 0.0 }`（近似周期运动）
- **When**：
  1. 用户在控制面板切换 `trailLength` 从 `200` → `1000`
  2. 尾迹增长到约 1000 个点后，用户切换为 `-1`（周期模式）
  3. 继续运行 5 秒
- **Then**：
  - 步骤 1：尾迹瞬间从 200 点拓展显示，允许积累最多 1000 个点
  - 步骤 2：尾迹清空，从当前点开始重新累积
  - 小角度周期运动下，`phaseDistance < 0.05` 在约 1-2 个周期内触发
  - 周期检测到后，RingBuffer 循环覆盖，尾迹始终显示一个完整周期的闭合轨迹
  - 周期模式下尾迹呈现闭合曲线（近似椭圆），视觉效果符合"周期轨道"预期

### 异常测试 1：仿真暂停时尾迹定格

- **Given**：
  - 仿真运行中，尾迹已积累 150 个点
- **When**：
  - 用户点击暂停按钮 → `useSimulationStore.setRunning(false)`
  - 用户用鼠标旋转视角 90°
- **Then**：
  - 尾迹保持 150 个点不变，不在末端追加新点
  - 尾迹线段仍渲染在场景中，颜色和位置不变（定格效果）
  - 用户旋转视角时尾迹随场景一起旋转（在 3D 空间中静止），可 360° 观察其空间几何结构
  - 恢复运行后：尾迹从定格位置继续延伸，无跳变或闪烁

### 异常测试 2：NaN 状态导致尾迹自动清空

- **Given**：
  - 仿真运行中，尾迹已积累 300 个点
- **When**：
  - 手动向 Store 注入 `state = { theta1: NaN, omega1: 0, theta2: 0, omega2: 0 }`
  - 连续 60 帧保持该 NaN 状态
- **Then**：
  - 第 1-59 帧：尾迹保持 300 个点不变（不追加新点）
  - 第 60 帧：`trailPoints` 变为空数组 `[]`，TrailRenderer 不渲染任何尾迹线
  - `console.warn("EXP-02: cleared trail buffer after 60 consecutive NaN frames")` 输出
  - 恢复合法 StateVector 后：尾迹从空开始重新累积，无残留旧数据

---

## 文档详细度自检清单

- [x] 文档自包含：不了解本项目代码的开发者，仅凭此文档即可完成 EXP-02 的编码实现
- [x] 无偷懒表述：已全文搜索并确认无 `"等等"`、`"..."`、`"其他字段"`、`"类似"`、`"同上"`、`"参考其他模块"`、`"请根据实际情况补充"`、`"开发者自行决定"`
- [x] 类型定义完整：每个类型字段都有描述 + 示例值 + 约束条件（`TrailPoint`、`TrailBufferAPI`、`TrailRendererProps`、`VelocityColorStop`、`TrailPersistence`）
- [x] 逻辑步骤完整：8 个步骤，每个都有操作对象、具体操作、输入来源、输出去向、失败行为
- [x] 异常处理完整：5 种异常，每种都有精确的触发阈值（如 `nanSkipCount >= 60`、`FPS < 30 持续 3s`）、逐步处理策略、精确参数
- [x] 无隐藏假设：所有默认值来源（如 `MAX_OBSERVED_VELOCITY = 15.0`、`minStepsSinceStart = 100`）、条件分支、业务规则已显式写出

---

## 注意事项与禁止行为

1. **[Store 同步读取]** 在 `useFrame` 回调中调用 `appendPoint` 时，**必须**使用 `useSimulationStore.getState()` 同步读取 state 和 params，而非通过 hook 选择器。原因与 EXP-01 相同：`useFrame` 闭包中的 hook 读值是陈旧的。

2. **[禁止每帧重建 BufferGeometry]** `TrailRenderer` 中的 `THREE.BufferGeometry` 在组件挂载时创建一次（通过 `useRef` 或 `useMemo` 持有）。每帧仅更新底层 `Float32Array` 的内容，设置 `needsUpdate = true`。**禁止**每帧 `new THREE.BufferGeometry()` 或 `new Float32Array()`，否则会导致 GC 抖动和帧率下降。

3. **[下摆球坐标一致性]** `appendPoint` 内计算下摆球 3D 坐标的公式**必须**与 EXP-01（Scene3D）步骤 2 中的 ball2Position 计算公式完全一致：
   ```
   ball1X = L1 * sin(θ₁), ball1Y = -L1 * cos(θ₁)
   ball2X = ball1X + L2 * sin(θ₂), ball2Y = ball1Y - L2 * cos(θ₂)
   ```
   若 Scene3D 和 TrailRenderer 使用不同公式，尾迹点会与摆球位置不重合。**推荐**：将坐标计算公式提取到 `src/features/simulation/engine/state-vector.ts` 中导出为 `ball2Position(state, params): Vector3` 公共函数，EXP-01 和 EXP-02 均调用此函数。

4. **[三角形带与 Line 的选择]** `deviceType === "desktop"` / `"tablet"` 时使用连续三角形带 + 圆角端帽方案实现可变线宽，通过 R3F viewport 实时将像素宽度转为世界单位，保证相机缩放时视觉粗细恒定。`deviceType === "mobile"` 时使用 drei's `<Line>` 方案（`lineWidth = 1`），省去三角形带的几何计算开销。

5. **[Color Gradient 透明度独立]** 顶点颜色（RGB）仅编码速度信息，全局透明度（alpha）由 `MeshBasicMaterial.opacity` 统一控制。禁止在顶点颜色中混入透明度分量，否则无法独立调节尾迹整体可见度。

6. **[RingBuffer 容量硬编码]** `RingBuffer<TrailPoint>` 的容量固定为 6000，不随 `persistence` 变化而重新创建实例。persistence < 6000 时通过 `trailPoints` getter 中的 `slice(-n)` 限制可见点数，persistence > 6000 时以 6000 为实际上限。

7. **[周期检测仅在 persistence === -1 时启用]** 周期检测的 `phaseDistance` 计算和 `cycleStartState` 维护有一定开销。仅在用户明确选择"仅保留当前周期"模式时才执行周期检测逻辑。

8. **[TrailRenderer 必须在 Canvas 内]** 该组件使用 R3F 的 `useThree()`（桌面端配合 `useFrame` 操作 mesh + BufferGeometry，移动端配合 drei's `<Line>`），必须嵌套在 R3F `<Canvas>` 节点树内。若在 Canvas 外渲染，组件应立即返回空 `<group />` 并打印错误日志。

---

*本文档由 AI 辅助生成，建议经技术负责人评审后生效。*
