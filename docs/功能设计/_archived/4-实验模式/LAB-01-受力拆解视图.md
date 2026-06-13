# 功能规格：LAB-01 受力拆解视图

> **文档生成时间**：`2026-04-28 20:40:21 CST`  
> **源设计文档**：功能设计_v0.md §五 5.1、功能模块全拆解.md LAB-01、双摆混沌实验室-技术栈设计.md v1.2 §4.7  
> **版本记录**：
> | 版本 | 时间 | 修改人 | 变更摘要 |
> |------|------|--------|----------|
> | v1.0 | 2026-04-28 20:40:21 | AI Assistant | 初始版本，基于功能设计_v0 §五 5.1 + 技术栈设计 v1.2 §4.7 |

> **冲突核查指引**：若发现与已有规格文档冲突，优先以时间戳更新的版本为准，并在版本记录中追加冲突解决条目。

---

## 所属模块与溯源

| 维度 | 内容 |
|------|------|
| 模块编号 | LAB-01 |
| 模块名称 | 受力拆解视图（动态自由体图） |
| 所属模式 | 实验模式（Lab） |
| 设计文档溯源 | 功能设计_v0.md §五 5.1；功能模块全拆解.md LAB-01行；技术栈设计.md §4.7 |
| 依赖模块 | SIM-01（双摆物理引擎/Worker）— 提供实时状态向量 + 力分量计算；EXP-01（3D 仿真场景）— 力矢量叠加渲染在同一 3D Canvas 中 |
| 被依赖模块 | 无（终端可视化/教学模块） |

---

## 已有设计兼容性分析

已审查以下规格文档：

| 文档 | 审查日期 | 共享接口 | 冲突？ |
|------|------|------|:---:|
| EXP-01-3D仿真场景.md (v1.0) | 2026-04-28 | 共享 R3F Canvas；`simulationStore` | ✅ 无冲突 |
| SIM-01-双摆物理引擎.md (v2.0) | 2026-04-28 | Worker 消息协议扩展 | ✅ 无冲突 |
| ANL-04-能量景观地形图.md (v1.0) | 2026-04-28 | R3F 技术栈；`analysisStore` 扩展模式 | ✅ 无冲突 |

**一致性保障**：

| 共享项 | 已有模块使用方式 | LAB-01 处理方式 |
|------|------|------|
| EXP-01 R3F Canvas | 渲染双摆几何体（摆杆、摆球、尾迹） | LAB-01 的力矢量箭头**共用同一个 `<Canvas>`**，以 R3F 子组件形式叠加到摆的场景图中 |
| `simulationStore` | 读写 | **只读**（读取状态向量用于力计算与标注） |
| Worker 消息协议 | `{ cmd:'step', buf } → { cmd:'done', buf }` | **扩展协议**：响应中增加 `forceData` 和 `forceExtrema` 字段 |
| `labStore` | 未创建 | LAB-01 创建独立 `labStore`（`src/stores/labStore.ts`），不与 `analysisStore`/`simulationStore` 冲突 |

---

## 技术栈绑定

| 维度 | 必须使用 | 版本 | 禁止使用 |
|------|----------|------|----------|
| UI 框架 | React + TypeScript | 18.x / 5.x | 类组件 |
| 3D 渲染 | React Three Fiber + drei（`Arrow`、`Html`、`Text`） | 8.x / 9.x | 原生 Three.js ArrowHelper 手动管理生命周期 |
| 力计算 | 仿真 Worker（与 ODE 积分同进程） | — | 主线程重复计算（导数信息在 Worker 内） |
| 分解面板 | 纯 React 组件 + shadcn/ui（Table、Select、Badge、Tooltip） | latest | 自建表格组件（shadcn/ui Table 已足够） |
| 状态管理 | Zustand（`labStore` 新增 + `simulationStore` 只读） | 4.x | React Context 传递力数据 |
| 样式 | Tailwind CSS | 3.x | CSS Modules |
| 文件组织 | `src/components/lab/ForceDecomposition/` | — | 散布在其他组件中 |
| 箭头几何 | drei `<Arrow>` 或自实现 `THREE.CylinderGeometry` + `THREE.ConeGeometry` | — | 使用 `<Html>` 渲染力标签（在 3D 空间中定位但不受深度影响） |

---

## 输入定义（精确类型）

### 输入 1：Worker 力数据流

```typescript
// Worker 消息协议扩展（主线程 → Worker 新增字段）
interface WorkerStepRequest {
  cmd: "step";
  buf: Float64Array;
  poincare?: PoincareSectionCondition | null;
  computeForces?: boolean;          // 新增：是否计算力分量，LAB-01 激活时为 true
  batchId: number;
}

// Worker → 主线程响应扩展
interface WorkerStepResponse {
  cmd: "done";
  buf: Float64Array;
  poincarePoints?: PoincarePoint[];
  forceData?: ForceDataArray;       // 新增：本批次的力分量数据
  forceExtrema?: ForceExtrema;       // 新增：仿真全程的力极值
  batchId: number;
}

// 单帧力数据（每个 RK4 子步输出一帧）
// 通过 Float64Array 传输，布局：[frame0_fields..., frame1_fields..., ...]
// 帧数 = 轨迹步数（典型 120 帧/批次）
// 每帧 12 个 float64：
//   [0]  Fg1_mag     上摆重力大小 (N)
//   [1]  Fg1_angle   上摆重力方向角 (rad)，固定 -π/2（竖直向下）
//   [2]  T1_mag      杆 1 张力大小 (N)
//   [3]  T1_angle    杆 1 张力方向角 (rad)，沿杆向上
//   [4]  Fi1_t_mag   上摆切向惯性力大小 (N)
//   [5]  Fi1_t_angle 上摆切向惯性力方向角 (rad)
//   [6]  Fi1_n_mag   上摆法向惯性力大小 (N)
//   [7]  Fi1_n_angle 上摆法向惯性力方向角 (rad)
//   [8]  Fg2_mag     下摆重力大小 (N)
//   [9]  T2_mag      杆 2 张力大小 (N)
//   [10] Fi2_t_mag   下摆切向惯性力大小 (N)
//   [11] Fi2_n_mag   下摆法向惯性力大小 (N)
// 注意：方向角在 3D 中表示为世界空间矢量，此处存储方向角供分解面板使用；
//       3D 箭头渲染使用力矢量（从 Worker 外推或主线程根据角度重建）
type ForceDataArray = Float64Array;  // length = 120 * 12 = 1440

interface ForceExtrema {
  T1_max: { value: number; time: number };  // 杆 1 张力全局最大值 (N) 及对应仿真时间 (s)
  T1_min: { value: number; time: number };
  T2_max: { value: number; time: number };
  T2_min: { value: number; time: number };
  // 极值使用滑动窗口对比，Worker 每批次更新一次
}
```

### 输入 2：当前仿真状态（用于力矢量 3D 位置和方向）

```typescript
// 来源：simulationStore（只读）+ Worker forceData 当前帧
// 主线程每帧从轨迹缓冲中取当前 (θ₁, θ₂)，结合 forceData 的力大小和方向，计算 3D 箭头端点

interface CurrentFrameForForceViz {
  // 摆的几何状态
  theta1: number;      // 上摆角，单位 rad
  theta2: number;      // 下摆角，单位 rad
  L1: number;          // 上摆摆长，单位 m
  L2: number;          // 下摆摆长，单位 m

  // 力矢量数据（从 Worker forceData 当前帧提取）
  forces: {
    mass1: {
      gravity:     { magnitude: number; directionWorld: [number, number]; }; // N, 世界方向单位向量
      tension:     { magnitude: number; directionWorld: [number, number]; };
      inertial_t:  { magnitude: number; directionWorld: [number, number]; };
      inertial_n:  { magnitude: number; directionWorld: [number, number]; };
    };
    mass2: {
      gravity:     { magnitude: number; directionWorld: [number, number]; };
      tension:     { magnitude: number; directionWorld: [number, number]; };
      inertial_t:  { magnitude: number; directionWorld: [number, number]; };
      inertial_n:  { magnitude: number; directionWorld: [number, number]; };
    };
  };
}
```

### 输入 3：坐标系选择

```typescript
// 用户在分解面板中选择的坐标系统
type CoordinateSystem = "cartesian" | "polar" | "natural";

// cartesian: 世界坐标系，Fx 水平向右，Fy 竖直向上
// polar:      极坐标，|F| 和从水平正方向逆时针测量的角度
// natural:    自然坐标（切向-法向），Ft 沿摆球运动轨迹切向，Fn 沿径向（指向悬挂点/枢轴）
```

### 输入 4：用户交互事件

| 交互类型 | 事件源 | 数据类型 | 触发条件 |
|------|------|------|------|
| 进入受力分析 | shadcn/ui Button 或空格键 | `void` | 用户点击"受力分析"按钮 或 按空格键暂停仿真 |
| 退出受力分析 | shadcn/ui Button 或再次空格 / ESC | `void` | 用户点击"关闭"或恢复仿真 |
| 悬停力箭头 | R3F `onPointerEnter`/`onPointerLeave` | `{ forceType, massIndex }` | 鼠标悬停/离开 3D 箭头 |
| 切换坐标系 | shadcn/ui Select `onValueChange` | `CoordinateSystem` | 用户选择坐标系选项 |

---

## 输出定义（精确类型）

### 输出 1：3D 力矢量箭头叠加

- **渲染位置**：与 EXP-01 共享同一个 R3F `<Canvas>`，力箭头以子组件形式挂载在摆的 Group 层级中
- **箭头规格**：

| 力类型 | 颜色 | 线型 | 箭头位置 | 长度比例 | 质量 |
|------|:---:|------|------|------|:---:|
| 重力 `Fg` | `#27ae60`（绿） | 实线 | 摆球中心，竖直向下 | `magnitude / (mg) * 0.5`（无单位缩放） | 1, 2 |
| 杆张力 `T` | `#e74c3c`（红） | 实线 | 摆球中心，沿杆指向枢轴 | `magnitude / T_max * 0.6` | 1, 2 |
| 切向惯性力 `Fi_t` | `#3498db`（蓝） | 虚线（dashArray） | 摆球中心，切向 | `magnitude / (mL) * 0.3` | 1, 2 |
| 法向惯性力 `Fi_n` | `#3498db`（蓝） | 虚线 | 摆球中心，法向（径向向外） | `magnitude / (mLω²) * 0.3` | 1, 2 |

- **箭头实现**：drei `<Arrow>` 组件或自实现（`CylinderGeometry` 杆 + `ConeGeometry` 箭头尖端 + `LineDashedMaterial` 虚线样式）
- **虚线的 dashArray**：`[0.05, 0.04]`（3D 世界单位），通过 `LineDashedMaterial` 的 `dashSize` 和 `gapSize` 参数控制
- **缩放规则**：所有力矢量按其相对于特征力的比例缩放（重力→mg、张力→T_max、惯性力→mL），使不同参数下的箭头在视觉上可比较
- **显示层级**：每个质量上叠加的箭头有独立 `<Group>`，随摆球运动自动变换位置和旋转

### 输出 2：悬停力信息 Tooltip

```typescript
interface ForceHoverData {
  visible: boolean;
  forceType: "gravity" | "tension" | "inertial_t" | "inertial_n";
  massIndex: 1 | 2;
  magnitude: number;            // 力的大小，单位 N，toFixed(3)
  directionAngle: number;       // 方向角（相对水平正方向逆时针），单位 °，toFixed(1)
  components: {                 // 当前坐标系下的分量
    cartesian: { Fx: number; Fy: number };
    polar: { r: number; theta: number };
    natural: { Ft: number; Fn: number };
  };
  description: string;          // 中文描述，如 "上摆重力"、"杆 1 张力"
}
```

- 渲染：shadcn/ui `Tooltip`（通过 drei `<Html>` 定位在 3D 箭头中点附近，`pointer-events: none`）
- 内容格式：
  ```
  杆 1 张力（T₁）
  大小：12.847 N
  方向：143.2°
  切向分量：-9.42 N，法向分量：8.71 N
  ```

### 输出 3：分量分解面板（右侧面板）

```typescript
interface DecompositionPanelData {
  coordinateSystem: CoordinateSystem;

  // 两个质量各自的力分解表
  mass1Forces: ForceRow[];
  mass2Forces: ForceRow[];

  // 历史极值
  extrema: {
    T1_max: { value: number; time: number; label: string }; // label: "最大" / "接近失重"（T≈0）/ "超重"（T>2mg）
    T1_min: { value: number; time: number; label: string };
    T2_max: { value: number; time: number; label: string };
    T2_min: { value: number; time: number; label: string };
  };
}

interface ForceRow {
  forceName: string;      // "重力" | "张力" | "切向惯性力" | "法向惯性力"
  magnitude: number;      // N
  component1: number;     // 笛卡尔→Fx / 极坐标→r / 自然坐标→Ft
  component2: number;     // 笛卡尔→Fy / 极坐标→θ / 自然坐标→Fn
  direction: number;      // 方向角 °
  color: string;          // 对应箭头的颜色 hex
}
```

- 渲染：shadcn/ui `Table` 组件，两行表头（"上摆 m₁" 和 "下摆 m₂"），每行包含 4 种力的分量值
- 坐标系选择器：shadcn/ui `Select`，选项 = `{ "笛卡尔坐标 (Fx, Fy)", "极坐标 (|F|, θ)", "自然坐标 (Ft, Fn)" }`
- 极值标注：表格底部 Badge 显示"杆 1 最大张力: 18.23 N @ t=45.2s"和"杆 2 最小张力: 0.12 N @ t=78.3s（接近失重）"

---

## 核心逻辑步骤

### Step 1: 进入受力分析模式 → Worker 激活力计算

| 项目 | 内容 |
|------|------|
| 操作对象 | `labStore.forceDecomposition` + Worker 通信 |
| 具体操作 | 1. 用户按下空格键或点击"受力分析"按钮：(a) 若仿真正在运行 → 暂停仿真（`simulationStore.setRunning(false)`）；(b) 设置 `labStore.forceDecomposition.active = true`；2. 向 Worker 发送 `{ cmd: 'config', computeForces: true }` 配置消息（持久设置）；3. Worker 从下一批次开始计算力分量并随响应返回；4. 冻结态（暂停时）显示当前帧的力矢量；恢复态（运行时）力矢量随仿真更新 |
| 输入来源 | 空格键/按钮事件；`simulationStore.isRunning` |
| 输出去向 | Worker 配置；`labStore.forceDecomposition.active` |
| 失败行为 | Worker 未初始化 → Toast "仿真引擎未就绪" + 激活失败 |

**Worker 中力计算公式**（在 `src/workers/ode-worker.ts` 的 RK4 循环中嵌入）：

```typescript
// 每完成一个 RK4 子步，从当前状态向量 [θ₁, ω₁, θ₂, ω₂] 和导数 [α₁, α₂] 计算力

function computeForces(state: number[], derivatives: number[], params: SimParams): ForceFrame {
  const [theta1, omega1, theta2, omega2] = state;
  const [alpha1, alpha2] = derivatives;  // 角加速度，来自 ODE 的 derivs() 函数
  const { m1, m2, L1, L2, g } = params;

  // === 杆 2 张力（先算，因为 T₁ 依赖 T₂）===
  // T₂ = m₂·L₂·ω₂² + m₂·g·cos(θ₂) + m₂·L₁·[α₁·cos(θ₁-θ₂) + ω₁²·sin(θ₁-θ₂)]
  const dTheta = theta1 - theta2;
  const T2 = m2 * L2 * omega2 * omega2
           + m2 * g * Math.cos(theta2)
           + m2 * L1 * (alpha1 * Math.cos(dTheta) + omega1 * omega1 * Math.sin(dTheta));

  // === 杆 1 张力 ===
  // T₁ = m₁·L₁·ω₁² + (m₁+m₂)·g·cos(θ₁) + m₂·L₂·[α₂·cos(dTheta) - ω₂²·sin(dTheta)] + T₂·cos(dTheta)
  const T1 = m1 * L1 * omega1 * omega1
           + (m1 + m2) * g * Math.cos(theta1)
           + m2 * L2 * (alpha2 * Math.cos(dTheta) - omega2 * omega2 * Math.sin(dTheta))
           + T2 * Math.cos(dTheta);

  // === 重力 ===
  const Fg1 = m1 * g;
  const Fg2 = m2 * g;

  // === 惯性力（对每个质量）===
  // 切向惯性力: m·L·α（与角加速度方向相反）
  // 法向惯性力: m·L·ω²（离心方向，径向向外）
  const Fi1_t = m1 * L1 * Math.abs(alpha1);       // 大小
  const Fi1_n = m1 * L1 * omega1 * omega1;         // 大小
  const Fi2_t = m2 * L2 * Math.abs(alpha2);
  const Fi2_n = m2 * L2 * omega2 * omega2;

  // 方向角在 3D 渲染时根据摆的几何状态 + 力的类型计算
  // 重力：固定 (0, -1) 世界方向
  // 张力：沿杆方向（从摆球指向枢轴/上一节点）
  // 切向惯性力：垂直于杆（与角加速度方向相反）
  // 法向惯性力：沿杆径向向外（离心方向）

  return {
    Fg1_mag: Fg1, Fg1_angle: -Math.PI / 2,
    T1_mag: T1,   T1_angle: theta1 + Math.PI,     // 沿杆向上（从摆球指向枢轴）
    Fi1_t_mag: Fi1_t, Fi1_t_angle: theta1 + Math.sign(alpha1) * Math.PI / 2,
    Fi1_n_mag: Fi1_n, Fi1_n_angle: theta1 + Math.PI, // 径向向外 = 沿杆向上方向
    Fg2_mag: Fg2,
    T2_mag: T2,   T2_angle: theta2 + Math.PI,
    Fi2_t_mag: Fi2_t, Fi2_t_angle: theta2 + Math.sign(alpha2) * Math.PI / 2,
    Fi2_n_mag: Fi2_n, Fi2_n_angle: theta2 + Math.PI,
  };
}
```

### Step 2: 主线程接收 → 力数据写入 labStore

| 项目 | 内容 |
|------|------|
| 操作对象 | `labStore.forceDecomposition` |
| 具体操作 | 1. Worker `onmessage` 处理中：如果 `data.forceData` 非空 → 将 `Float64Array` 拷贝到 `labStore.forceDecomposition.lastForceData`（保留最近一批）；2. 更新 `labStore.forceDecomposition.bufferIndex` 为 0（标识当前读取头）；3. 遍历 `data.forceData` 中的力大小：(a) 检查 `T1_mag` 是否 < 0.05（接近零张力，摆球接近自由落体）→ 标记 `T1_min` 标签为"接近失重"；(b) 检查 `T_*_mag` 是否 > 2×mg（超重状态）→ 标记 `T_*_max` 标签为"超重"；4. 更新 `forceExtrema`（Worker 返回的全局极值覆盖 `labStore` 中的缓存） |
| 输入来源 | Worker `postMessage` → `data.forceData` + `data.forceExtrema` |
| 输出去向 | `labStore.forceDecomposition` state |
| 失败行为 | `forceData` 长度异常（≠ 120×12）→ console.error + 丢弃本批数据 |

### Step 3: 读取当前帧力数据 → 渲染 3D 箭头

| 项目 | 内容 |
|------|------|
| 操作对象 | R3F 箭头组件（每组力对应一组 arrow） |
| 具体操作 | 1. `useFrame` 中：(a) 从轨迹缓冲中获取当前帧索引 `frameIdx`；(b) 从 `labStore.forceDecomposition.lastForceData` 中读取第 `frameIdx * 12` 至 `(frameIdx+1)*12 - 1` 的 12 个力值；(c) 对每个力：(i) 计算 3D 世界空间起点（摆球位置）和终点（起点 + 方向矢量 × 缩放后的长度）；(ii) 更新对应 drei `<Arrow>` 的 `position`、`direction`、`length` props；2. 渲染层级：Exp-01 的摆球 Group → 力箭头 Sub-Group（每个质量一个） |
| 输入来源 | `labStore.forceDecomposition.lastForceData`；`simulationStore` 摆球位置 |
| 输出去向 | R3F scene 中的箭头 geometry |
| 失败行为 | 力数据为空（Worker 未返回）→ 箭头隐藏 |

**3D 力矢量方向计算规则**：

| 力类型 | 世界空间方向向量（单位向量） |
|------|------|
| 重力 | `(0, -1, 0)` 固定竖直向下 |
| 杆 1 张力 | `(-sin(θ₁), cos(θ₁), 0)` 沿杆 1 方向指向上方枢轴 |
| 杆 2 张力 | `(-sin(θ₂), cos(θ₂), 0)` 沿杆 2 方向指向质量 1 |
| 切向惯性力（质量 1） | `(cos(θ₁), sin(θ₁), 0)` × `(-sign(α₁))` 垂直于杆 1 |
| 法向惯性力（质量 1） | `(sin(θ₁), -cos(θ₁), 0)` 沿杆 1 径向向外（离心） |
| 切向惯性力（质量 2） | `(cos(θ₂), sin(θ₂), 0)` × `(-sign(α₂))` 垂直于杆 2 |
| 法向惯性力（质量 2） | `(sin(θ₂), -cos(θ₂), 0)` 沿杆 2 径向向外（离心） |

### Step 4: 分量分解面板 → 坐标系切换

| 项目 | 内容 |
|------|------|
| 操作对象 | 分解面板 React 组件 |
| 具体操作 | 1. 从 `labStore.forceDecomposition.lastForceData` 当前帧读取原始力数据（大小 + 角度）；2. 根据 `labStore.coordinateSystem` 选择：(a) **笛卡尔**：`Fx = magnitude·cos(angle)`，`Fy = magnitude·sin(angle)`；(b) **极坐标**：`r = magnitude`，`θ = angle（转换为 °）`；(c) **自然坐标**：将力的世界分量投影到摆球的切向-法向基矢上：`Ft = F·ê_t`，`Fn = F·ê_n`（其中 `ê_t = (cos(θ), sin(θ))` 切向单位矢，`ê_n = (sin(θ), -cos(θ))` 法向单位矢）；3. 更新 shadcn/ui Table 的每一行 |
| 输入来源 | `labStore.forceDecomposition.lastForceData`；`labStore.coordinateSystem` |
| 输出去向 | React 表格 DOM |
| 失败行为 | 力数据为空 → 表格显示为占位符 "—" |

### Step 5: 悬停力箭头 → Tooltip

| 项目 | 内容 |
|------|------|
| 操作对象 | R3F `onPointerEnter`/`onPointerLeave` + shadcn/ui Tooltip（drei `<Html>` 定位） |
| 具体操作 | 1. 每个力箭头绑定 `onPointerEnter`：(a) 设置 `labStore.forceDecomposition.hovered = { forceType, massIndex }`；(b) `<Html>` 组件在箭头中点世界坐标处显示 Tooltip；2. `onPointerLeave` → `hovered = null` → Tooltip 隐藏 |
| 输入来源 | R3F pointer 事件 |
| 输出去向 | drei `<Html>` + shadcn/ui Tooltip |
| 失败行为 | 无 |

### Step 6: 退出受力分析 → 清理

| 项目 | 内容 |
|------|------|
| 操作对象 | `labStore.forceDecomposition` + Worker 配置 |
| 具体操作 | 1. 用户再次按空格/ESC/点击关闭按钮：(a) `labStore.forceDecomposition.active = false`；(b) 向 Worker 发送 `{ cmd: 'config', computeForces: false }`（停止力计算，节省 Worker CPU）；(c) 3D 箭头隐藏；(d) 分解面板收起或显示为空；(e) 恢复仿真（若进入前仿真在运行）；2. 保留 `forceExtrema` 数据不清零（下次进入时可继续累积对比） |
| 输入来源 | 键盘/按钮事件 |
| 输出去向 | Worker 配置；`labStore` state |

---

## 依赖与集成接口

### 外部模块依赖

| 依赖模块 | 调用接口 | 调用时机 | 数据方向 |
|------|------|------|------|
| SIM-01 Worker | `worker.postMessage({ cmd:'config', computeForces: true/false })` | 进入/退出受力分析 | LAB-01 → SIM-01 |
| SIM-01 Worker | Worker `onmessage` 接收 `{ forceData, forceExtrema }` | 每个积分批次 | SIM-01 → LAB-01 |
| EXP-01 3D 场景 | 共享 R3F `<Canvas>` + 摆的 Group 层级 | 每帧渲染 | LAB-01 → EXP-01（箭头追加到场景图） |
| `simulationStore` | `s.theta1, s.theta2, s.params(L1,L2), s.isRunning` 只读 | 每帧 / 参数变更时 | simulationStore → LAB-01 |
| SYS-02 异常处理 | `useToast()` | Worker 力数据异常时 | LAB-01 → SYS-02 |

### Zustand Store 接口

```typescript
// labStore（新建: src/stores/labStore.ts）
// 不与 simulationStore / analysisStore 冲突

interface LabStore {
  forceDecomposition: {
    active: boolean;                                           // 是否处于受力分析模式
    lastForceData: Float64Array | null;                       // 最新一批力数据
    bufferIndex: number;                                       // 当前读取位置（帧索引）
    extrema: ForceExtrema | null;                              // 仿真全程力极值
    hovered: { forceType: string; massIndex: 1 | 2 } | null;  // 当前悬停的力
    setActive: (v: boolean) => void;
    setLastForceData: (data: Float64Array) => void;
    setExtrema: (e: ForceExtrema) => void;
    setHovered: (h: { forceType: string; massIndex: 1 | 2 } | null) => void;
    reset: () => void;
  };
  coordinateSystem: CoordinateSystem;    // "cartesian" | "polar" | "natural"
  setCoordinateSystem: (cs: CoordinateSystem) => void;
}
```

---

## 状态机

| 当前状态 | 触发事件 | 下一状态 | 前置条件 | 副作用 |
|------|------|------|------|------|
| `idle` | 空格键 / 点击"受力分析" | `active` | Worker 已初始化 | `active = true`；Worker 发送 `computeForces:true`；仿真暂停（若正在运行） |
| `active` | 仿真运行中 + Worker 返回 forceData | `active` | — | 力箭头每帧更新；分解面板刷新；极值滑动窗口更新 |
| `active` | 悬停力箭头 | `active`（hover） | `lastForceData ≠ null` | `hovered` 更新；Tooltip 显示 |
| `active` | 切换坐标系 | `active` | — | `coordinateSystem` 更新；分解面板重新计算分量 |
| `active` | 空格 / ESC / 关闭按钮 | `idle` | — | `active = false`；Worker 发送 `computeForces:false`；箭头隐藏；恢复仿真（若进入前在运行） |
| `active` | 仿真复位（`resetTrigger` 递增） | `active`（重置） | — | `extrema` 清零；`lastForceData` 清零；极值重新累积 |
| `*` | 组件卸载 | — | — | 注销订阅；Worker 发送 `computeForces:false` |

---

## 异常与边界条件

### 异常场景 1：张力计算出现负值

| 维度 | 内容 |
|------|------|
| **触发条件** | 数值误差或极端参数（如非常高的角速度）导致 `T₁ < 0` 或 `T₂ < 0`（物理上张力应为拉，不可为负——负值意味着杆受压，但刚性杆模型假设张力可取任意值；双摆方程推导中张力可为负） |
| **处理策略** | 1. 箭头的 `length` 使用 `|T|`（绝对值），颜色切换为洋红色 `#e056a0` + 旁边显示 `⚠` 标记；2. Tooltip 标注"张力方向反转（杆受压）"；3. 不影响仿真继续；4. 保留负值到极值统计中（标注"最小(受压)"） |
| **重试参数** | 无（非错误，杆模型允许受压） |

### 异常场景 2：力数据缺失或批次不匹配

| 维度 | 内容 |
|------|------|
| **触发条件** | Worker 在 LAB-01 激活前未配置 `computeForces`；`batchId` 不连续导致 `forceData` 对应错误批次 |
| **处理策略** | 1. `lastForceData` 为空时：(a) 3D 箭头全部隐藏；(b) 分解面板显示"力数据加载中..."（Skeleton）；(c) Worker 下一次 `step` 返回的 `forceData` 到达后自动填充；2. `batchId` 不匹配 → 丢弃 `forceData`，使用上一批次的数据（显示可能滞后 1 帧，视觉上不可感知） |
| **重试参数** | 无（下一批次自动修正） |

### 异常场景 3：力矢量在 3D 场景中与摆球重叠

| 维度 | 内容 |
|------|------|
| **触发条件** | 力的大小非常小（如张力 ≈ 0），缩放后的箭头长度几乎为零，箭头尖端与起点重叠 |
| **处理策略** | 1. 箭头最小长度阈值 = 0.15 世界单位；2. 如果缩放后长度 < 0.15：(a) 箭头长度设为 0.15 + 颜色透明度降为 0.3；(b) Tooltip 显示 0 实际值（如"T₂ = 0.002 N"） |
| **重试参数** | 无 |

### 边界条件清单

| 边界条件 | 处理方式 |
|------|------|
| θ₁ 或 θ₂ 为 NaN | 力箭头全部隐藏；分解面板显示"仿真状态异常" |
| 用户连续快速按空格 | 防抖 300ms，避免 Worker 反复开关力计算 |
| 力箭头在某视角下被摆球遮挡 | 力箭头渲染时 `depthTest = false`（始终在摆球前方可见） |
| 分解面板在小屏幕上空间不足 | 面板在 `lg` 断点以下折叠为抽屉（shadcn/ui Sheet） |
| 极值在长时间仿真中超过 Float64 范围 | Float64 范围远大于物理可能（T < 10⁶ N 对实验室尺度双摆），不做额外处理 |

---

## 原则兑现清单

| 设计原则 | 来源 | 代码级约束 |
|------|------|------|
| 白盒拆解 | 功能设计_v0 §五 5.1 | 三种力（重力/张力/惯性力）以不同颜色和线型区分；悬停显示精确数值（N + °）；分解面板支持三坐标系 |
| 物理正确 | 功能设计_v0 §五 | T₁/T₂ 在 Worker 内与 ODE 同步计算，使用与积分一致的状态和导数；公式来源于 Lagrange 方程的约束力反推 |
| 教学辅助 | 功能设计_v0 §五 5.1 | 历史极值标注"接近失重/超重"判定；虚线与实线区分主动力与惯性力 |
| 操作直觉 | 功能设计_v0 §五 5.1 | 空格键切换受力分析；暂停时自动显示；恢复时自动隐藏；深度测试关闭使箭头始终可见 |
| 零后端 | 技术栈设计 v1.2 §1.2 | 全部力计算在 Worker 内完成；无外部服务依赖 |

---

## 验收测试场景

### 正向测试 1：空格键进入 → 显示力箭头

**Given** 仿真以默认参数运行中（`m₁=1, m₂=1, L₁=1, L₂=1`），Worker 已初始化
**When** 用户按空格键
**Then**
1. 仿真暂停（`isRunning = false`）
2. 3D 场景中每个摆球上出现力箭头：(a) 上摆球：绿色（重力向下）、红色（T₁ 沿杆向枢轴）、蓝色虚线（切向 + 法向惯性力）；(b) 下摆球：同 4 类箭头
3. 右侧面板显示分量分解表格（默认笛卡尔坐标系），列出两个质量各 4 种力的 Fx/Fy 分量
4. Worker 日志中可观测到 `computeForces: true` 配置已接收
5. 再次按空格 → 箭头消失，恢复仿真

### 正向测试 2：悬停力箭头 → Tooltip + 坐标系切换

**Given** 受力分析模式激活，力箭头已显示
**When** (a) 鼠标悬停在上摆球红色箭头（T₁）上；(b) 在分解面板中切换坐标系为"极坐标"
**Then**
1. Tooltip 在箭头旁显示：
   ```
   杆 1 张力（T₁）
   大小：12.847 N
   方向：143.2°
   切向分量：-9.42 N，法向分量：8.71 N
   ```
2. 鼠标移出 → Tooltip 消失
3. 切换至极坐标后，分解表格的 component1/component2 列标题变为"`丨F丨 (N)`"和"`θ (°)`"，行内数据变为极坐标形式

### 正向测试 3：极值追踪

**Given** 受力分析模式已运行 60 秒
**When** 仿真过程中张力 T₁ 达到其全程最大值 18.23 N @ t=45.2s，后又出现最小值 0.12 N @ t=78.3s
**Then**
1. 分解面板底部 Badge 显示：
   - "杆 1 最大张力: 18.23 N @ t=45.2s"
   - "杆 1 最小张力: 0.12 N @ t=78.3s（接近失重）"
2. 当 `T₁ < 0.05` 时，T₁ 箭头的 Tooltip 额外显示"接近失重状态"标签

### 反向测试 1：Worker 未配置力计算 → 降级

**Given** LAB-01 首次激活，但 Worker `computeForces` 配置消息因某种原因未被 Worker 接收（如消息队列竞争）
**When** 用户进入受力分析模式，第一个 Worker 批次返回数据中 `forceData` 字段为 `undefined`
**Then**
1. 3D 箭头全部隐藏
2. 分解面板显示"力数据加载中..."Skeleton
3. 主线程检测到一次空的 `forceData` → 自动重发 `{ cmd:'config', computeForces:true }`
4. 下一个批次返回 forceData → Skeleton 消失 → 箭头和表格正常显示

### 反向测试 2：张力负数 → 颜色切换

**Given** 极端参数下杆 2 受压，`T₂ < 0`
**When** Worker 返回 `T2_mag = -0.5`（负值）
**Then**
1. T₂ 箭头长度使用 `abs(-0.5) = 0.5` 渲染
2. 箭头颜色切换为洋红色 `#e056a0`（非正常的红色）
3. 箭头旁显示 `⚠` 标记（drei `<Text>` 或 `<Html>` 定位）
4. Tooltip 标注"张力方向反转（杆受压）"
5. 极值 Badge 显示"杆 2 最小张力: -0.50 N（受压）"

---

## 注意事项与禁止行为

### 注意事项

1. **力缩放因子的参数依赖性**：张力缩放基准 `T_max` 和非惯性力缩放基准 `mLω²` 随物理参数变化。参数变更时必须重置 Worker 中的力极值累积（`resetTrigger` 递增时 `forceExtrema` 清零），否则新参数下的力会用旧的 `T_max` 缩放导致箭头过小或过大。

2. **深度测试关闭的代价**：力箭头设为 `depthTest = false` 确保始终可见，但这意味着力箭头可能显示在摆球的前方——即使从某些角度看箭头实际上在球的后面。这是教学可视化的必要取舍。

3. **虚线材质**：`LineDashedMaterial` 需要 geometry 预先计算 `lineDistances`。使用 drei `<Arrow>` 时需验证其对虚线材质的支持——若不支持，需用 `CylinderGeometry` + `Line` 组合实现虚线惯性力箭头。

4. **力计算的数值精度**：`T₁` 公式中包含 `α₁·cos(θ₁-θ₂)` 等项，其中 `α₁`（角加速度）可达到 100+ rad/s²。使用 Float64Array 传输可保证精度；若张力值超出 Float64 范围（不会，双摆张力 < 10⁶ N），则截断。

5. **空格键冲突**：EXL-01 中空格键用于暂停/恢复仿真。LAB-01 需扩展此逻辑：空格键 → 暂停 → 进入受力分析；再次空格 → 退出受力分析 → 恢复仿真。ESC 键仅退出受力分析，不恢复仿真。

### 禁止行为

1. **禁止在主线程重新计算张力**。张力必须来自 Worker 的 `forceData`，不得在主线程用 JavaScript 重复实现 T₁/T₂ 公式。否则可能导致 Worker 内积分用一套精度、主线程计算用另一套精度，箭头值和仿真状态不一致。

2. **禁止为每个力箭头创建独立的 drei `<Arrow>` 实例并使用 `useMemo` 固定数量**。每个质量有 4 个箭头（重力/T/切向惯性/法向惯性），共 8 个固定数量的 arrow。不要动态增删箭头——通过 `visible` prop 控制显隐。

3. **禁止在分解面板中使用 `eval` 或动态公式解析**显示力分量。分量计算仅为基本的三角函数投影（Fx = F·cos(θ) 等），硬编码 switch-case 即可。

4. **禁止力箭头覆盖摆球本身**。箭头起点应位于摆球表面外缘（`球心 + 球半径 × 径向向外 0.05 单位偏移`），而非球心内部。否则箭头会嵌入球体内不可见。

5. **禁止在仿真高速运行时显示力箭头**（`isRunning && 帧率 < 30fps`）。此时力箭头每帧刷新过快导致闪烁。空间键暂停后分析静态受力图才是推荐的教学用法。但如果用户选择运行中显示，需要 100ms 节流力箭头更新。

---

*本文档由 AI 辅助生成，需经技术负责人评审后生效。*
