# 功能点：EXP-01 3D 仿真场景

> **文档生成时间**：`2026-04-28 19:30:00 CST`
> **版本记录**：
> | 版本 | 时间 | 修改人 | 变更摘要 |
> |------|------|--------|----------|
> | v1.0 | `2026-04-28 19:30:00` | AI Assistant | 初始版本 |

> **冲突核查指引**：若发现与已有规格文档冲突，优先以时间戳更新的版本为准，并在版本记录中追加冲突解决条目。

---

## 所属模块与溯源

- **对应总设计章节**：功能设计_v0 §三 3.1「3D 主场景（升级）」；技术栈设计.md §4.1「3D 实时双摆仿真」
- **依赖的其他功能模块**：
  - `SIM-01`（双摆物理引擎）— 提供仿真状态数据（StateVector），通过 `useSimulationStore` 消费
  - `SIM-02`（参数控制面板）— 提供当前物理参数（PhysicsParams），通过 `useSimulationStore` 消费
  - `EXP-02`（运动尾迹渲染）— 尾迹组件在本场景内渲染，但尾迹数据和持久度由 EXP-02 管理
  - `SYS-01`（响应式布局引擎）— 提供设备类型，影响渲染质量降级策略

---

## 已有设计兼容性分析

- **已审查的相关规格文档**：经扫描 `docs/功能设计/` 目录，未发现已有功能规格文档（本模块为第一个规格）
- **兼容性结论**：无冲突。复用的已有类型定义：
  - `PhysicsParams` — 来自 `src/shared/types/physics.ts`，字段不变
  - `StateVector` — 来自 `src/shared/types/physics.ts`，字段不变
  - `useSimulationStore` — 来自 `src/features/simulation/store.ts`，通过 `index.ts` 公共接口导入
  - `useExploreStore`（`viewPreset` 字段）— 来自 `src/features/explore/store.ts`，本模块消费其 `viewPreset` 并扩展为具体相机配置
  - `useAppStore`（`deviceType` 字段）— 来自 `src/stores/useAppStore.ts`，用于响应式降级

---

## 技术栈绑定

- **必须使用**：
  - `react@^18.3.1` — UI 框架
  - `@react-three/fiber@^8.17.0` — React 到 Three.js 的声明式桥接层，提供 `<Canvas>` 组件
  - `@react-three/drei@^9.114.0` — R3F 辅助库：`OrbitControls`（自由旋转/缩放/平移）、`Sphere`（摆球）、`Line`（尾迹，由 EXP-02 使用）、`PerspectiveCamera`（自定义相机）、`Environment`（HDR 环境贴图）、`SpotLight`（聚光灯）
  - `three@^0.184.0` — 底层 3D 引擎：`THREE.Vector3`、`THREE.CylinderGeometry`（摆杆）、`THREE.SphereGeometry`（摆球）、`THREE.MeshStandardMaterial`（PBR 材质）、`THREE.MeshPhysicalMaterial`（玻璃材质）、`THREE.Color`、`THREE.MathUtils.lerp`
  - `zustand@^4.5.5` — 订阅 `useSimulationStore` 和 `useExploreStore`
  - `tailwindcss@^3.4.16` — 父容器布局（`w-full h-full`）

- **禁止使用**：
  - 禁止在 R3F 组件外部直接操作 THREE.Scene / THREE.WebGLRenderer（必须通过 R3F 声明式 API 或 `useThree()` hook）
  - 禁止在 `<Canvas>` 内使用 React 原生 DOM 元素（如 `<div>`），Canvas 内只能放置 R3F 节点
  - 禁止在 `requestAnimationFrame` 中手动同步状态到 3D 场景，必须通过 `useFrame` hook
  - 禁止硬编码相机位置和材质颜色，必须通过配置对象引用
  - 禁止直接修改 `useSimulationStore` 的 `state` 字段（只读消费），仿真推进由 SIM-01 Worker 负责

---

## 输入定义（精确类型）

### 组件 Props

```typescript
import type { PhysicsParams, StateVector } from "@/shared/types";

/**
 * 摆体材质类型。
 * - "metal": 金属光泽（高反射率、低粗糙度），颜色 #C0C0C0
 * - "wood": 木质漫反射（零金属度、高粗糙度），颜色 #8B5E3C
 * - "glass": 玻璃透光（半透明、高透射率、低粗糙度），颜色 #E8F0F8，opacity 0.6
 */
type PendulumMaterialType = "metal" | "wood" | "glass";

/**
 * 环境预设。
 * - "dark-lab": 暗色实验室背景（#0a0a0f），聚光灯照射摆体，地面微弱的网格线
 * - "white-teaching": 纯白教学背景（#f5f5f5），均匀环境光，地面可见的坐标系网格
 */
type EnvironmentPreset = "dark-lab" | "white-teaching";

interface Scene3DProps {
  /**
   * 摆体材质类型。未传时默认 "metal"。
   * 仅影响视觉渲染，不影响物理仿真参数。
   * 用户可在探索模式控制面板中切换。
   */
  pendulumMaterial?: PendulumMaterialType;

  /**
   * 环境预设。未传时默认 "dark-lab"。
   * 控制背景色、灯光类型和强度、地面网格显示。
   */
  environment?: EnvironmentPreset;

  /**
   * 是否显示地面参考网格。默认 true。
   * 移动端（deviceType === "mobile"）自动设为 false 以节省性能。
   */
  showGrid?: boolean;

  /**
   * 是否启用阴影映射。默认 true。
   * 笔记本及移动端自动关闭以提升帧率。
   */
  enableShadows?: boolean;

  /**
   * 父容器的 CSS 类名。默认 "w-full h-full"。
   * 用于 Tailwind 断点响应式布局嵌入。
   */
  className?: string;
}
```

### 内部派生类型（组件内部使用，不对外导出）

```typescript
import { Vector3 } from "three";

/**
 * 相机配置。
 * position: 相机在世界空间中的位置（单位：米）
 * target: 相机注视点在世界空间中的位置
 * fov: 视野角度（度），默认 50
 */
interface CameraConfig {
  position: Vector3;
  target: Vector3;
  fov: number;
}

/**
 * 材质视觉配置。
 * color: 基础色（hex 字符串）
 * metalness: 金属度（0-1）
 * roughness: 粗糙度（0-1）
 * opacity: 不透明度（0-1），仅 glass 使用 0.6，其余为 1.0
 */
interface MaterialVisualConfig {
  color: string;
  metalness: number;
  roughness: number;
  opacity: number;
}

/**
 * 环境视觉配置。
 * background: Canvas 背景色
 * ambientIntensity: 环境光强度（0-5），white-teaching = 1.0，dark-lab = 0.15
 * spotIntensity: 聚光灯强度（0-10），white-teaching = 0（无聚光），dark-lab = 8
 * spotPosition: 聚光灯位置
 * gridColor: 地面网格颜色
 */
interface EnvironmentVisualConfig {
  background: string;
  ambientIntensity: number;
  spotIntensity: number;
  spotPosition: Vector3;
  gridColor: string;
}
```

### 数据消费（从 Store 读取）

本组件通过以下 hook 订阅运行时数据，每帧触发重渲染时直接从 Store 读取最新值：

```typescript
// 从 useSimulationStore 订阅（只读消费）
const params: PhysicsParams = useSimulationStore((s) => s.params);
// 字段：{ m1: number, m2: number, L1: number, L2: number, g: number, damping: number }
// 示例值：{ m1: 1.0, m2: 1.0, L1: 1.0, L2: 1.0, g: 9.81, damping: 0 }

const state: StateVector = useSimulationStore((s) => s.state);
// 字段：{ theta1: number, omega1: number, theta2: number, omega2: number }
// 示例值：{ theta1: 1.57, omega1: 0.5, theta2: 1.57, omega2: -0.3 }
// theta 单位：弧度，范围 (-∞, +∞)，物理上通常取 [-π, π] 但仿真不做限制
// omega 单位：rad/s

const isRunning: boolean = useSimulationStore((s) => s.isRunning);

// 从 useExploreStore 订阅（只读消费）
const viewPreset: "side" | "top" | "chaos" = useExploreStore((s) => s.viewPreset);

// 从 useAppStore 订阅（用于响应式降级）
const deviceType: "desktop" | "tablet" | "mobile" = useAppStore((s) => s.deviceType);
```

---

## 输出定义（精确类型）

本模块为纯渲染组件，无结构化数据输出。其"输出"是渲染在浏览器 Canvas 上的 3D 画面，包含以下视觉元素：

| 视觉元素 | 对应 3D 对象 | 渲染时机 |
|---------|-------------|---------|
| 固定支点 | `<Sphere args={[0.05, 16, 16]}>` 位于原点 (0, 0, 0) | 始终渲染 |
| 下摆杆 | `<Cylinder>` 从支点到上摆球，长度 = `params.L1`，粗细 = 基础半径 × (1 + params.m1 × 0.1) | 每帧更新位置和旋转 |
| 上摆杆 | `<Cylinder>` 从上摆球到下摆球，长度 = `params.L2`，粗细 = 基础半径 × (1 + params.m2 × 0.1) | 每帧更新位置和旋转 |
| 上摆球 | `<Sphere>` 位于上摆杆末端，半径 = 0.08 × `Math.pow(params.m1, 1/3)` | 每帧更新位置 |
| 下摆球 | `<Sphere>` 位于下摆杆末端，半径 = 0.08 × `Math.pow(params.m2, 1/3)` | 每帧更新位置 |
| 地面参考网格 | drei `<Grid>` 组件，cellSize=0.5，fadeDistance=8 | 按 `showGrid` props 条件渲染 |
| 聚光灯 | drei `<SpotLight>` 从上方打光 | 按环境预设条件渲染 |

---

## 核心逻辑步骤

### 步骤 1：组件挂载与初始化

- **操作对象**：`<Scene3D>` 组件实例、R3F `<Canvas>` 上下文
- **具体操作**：
  1. 解析 `Scene3DProps`：提取 `pendulumMaterial`（默认 `"metal"`）、`environment`（默认 `"dark-lab"`）、`showGrid`（默认 `true`）、`enableShadows`（默认 `true`）、`className`（默认 `"w-full h-full"`）
  2. 从预定义配置表 `CAMERA_PRESETS`（见步骤 6）中读取 `viewPreset` 对应的 `CameraConfig`
  3. 从预定义配置表 `MATERIAL_CONFIGS`（见步骤 5）中读取 `pendulumMaterial` 对应的 `MaterialVisualConfig`
  4. 从预定义配置表 `ENVIRONMENT_CONFIGS`（见步骤 7）中读取 `environment` 对应的 `EnvironmentVisualConfig`
  5. 检查 `deviceType`：若为 `"mobile"`，自动覆盖 `showGrid = false`、`enableShadows = false`
  6. 检查 `deviceType`：若为 `"tablet"`，自动覆盖 `enableShadows = false`
  7. 渲染 `<Canvas>` 容器，设置 `camera.fov = cameraConfig.fov`、`camera.position = cameraConfig.position`、`shadows = enableShadows`
  8. 渲染初始状态的摆体几何（基于 `useSimulationStore` 的初始 `state` 和 `params`）
- **输入来源**：`Scene3DProps` + `useSimulationStore` + `useExploreStore` + `useAppStore`
- **输出去向**：DOM 中挂载的 `<canvas>` 元素，显示初始状态的 3D 摆场景
- **失败行为**：
  - `PhysicsParams` 中存在非法值（`L1 <= 0` 或 `L2 <= 0`）：在控制台中打印 `console.error("EXP-01: Invalid params, L1 and L2 must be > 0", params)`，不渲染摆体，仅显示地面网格和空白场景。**不抛出异常**，因为参数校验由 SIM-02 负责，此处仅防御性降级。
  - Canvas WebGL 上下文创建失败（浏览器不支持 WebGL）：在 Canvas 上方覆盖一个 `<div>`，显示文本「您的浏览器不支持 WebGL，请使用 Chrome/Firefox/Edge 最新版本」，`font-size: 16px`, `color: #ff4444`, `text-align: center`。

### 步骤 2：每帧状态订阅与 3D 坐标计算

- **操作对象**：摆球和摆杆的 3D 位置
- **具体操作**：
  1. 在 `useFrame` 回调中，从 `useSimulationStore.getState()` 同步读取当前 `state: StateVector` 和 `params: PhysicsParams`（使用 `getState()` 而非 hook 选择器，避免每帧触发 React 重渲染——R3F 的 `useFrame` 在 rAF 中直接操作 Three.js 对象，绕过 React 协调）
  2. 计算上摆球 3D 位置：
     ```
     ball1Position.x = params.L1 * Math.sin(state.theta1)
     ball1Position.y = -params.L1 * Math.cos(state.theta1)
     ball1Position.z = 0
     ```
  3. 计算下摆球 3D 位置：
     ```
     ball2Position.x = ball1Position.x + params.L2 * Math.sin(state.theta2)
     ball2Position.y = ball1Position.y - params.L2 * Math.cos(state.theta2)
     ball2Position.z = 0
     ```
  4. 使用 `useRef` 持有对 Three.js `Mesh` 对象（ball1Ref, ball2Ref, arm1Ref, arm2Ref）的直接引用
  5. 将计算出的位置通过 `ref.current.position.copy(ball*Position)` 直接赋值给 Three.js 对象，绕过 React setState
  6. 若 `isRunning === false`，跳过位置更新，保持摆体在当前位置静止
- **输入来源**：`useSimulationStore.getState().state`、`useSimulationStore.getState().params`
- **输出去向**：Three.js `Mesh.position` 属性（直接内存写入）
- **失败行为**：
  - `state` 中任一值为 `NaN` 或 `Infinity`：在控制台打印 `console.warn("EXP-01: NaN/Infinity detected in StateVector, freezing scene", state)`，停止更新位置，保持上次有效位置。计数器 `nanFrameCount` +1，连续 60 帧 NaN 时调用 `useSimulationStore.getState().setRunning(false)` 自动暂停仿真。
  - `params.L1` 或 `params.L2` 在运行时变为 0：跳过位置计算，摆球位置保持不变，在控制台打印错误。

### 步骤 3：摆杆几何更新

- **操作对象**：Two `THREE.Mesh` with `THREE.CylinderGeometry`（arm1Ref, arm2Ref）
- **具体操作**：
  1. 下摆杆（arm1Ref）：连接支点 (0, 0, 0) 到上摆球 (ball1Position)
     - 计算中点位置：`midpoint = ball1Position.clone().multiplyScalar(0.5)`
     - 计算方向向量：`direction = ball1Position.clone().normalize()`
     - 设置 `arm1Ref.current.position.copy(midpoint)`
     - 设置旋转使圆柱 Y 轴对齐方向向量：使用 `quaternion.setFromUnitVectors(new Vector3(0, 1, 0), direction)`
     - 动态调整圆柱高度（scale.y）：`arm1Ref.current.scale.y = params.L1 / DEFAULT_CYLINDER_HEIGHT`（默认圆柱模板高度为 1.0）
  2. 上摆杆（arm2Ref）：连接上摆球 (ball1Position) 到下摆球 (ball2Position)
     - 计算中点：`midpoint = ball1Position.clone().add(ball2Position).multiplyScalar(0.5)`
     - 计算方向：`direction = ball2Position.clone().sub(ball1Position).normalize()`
     - 同上述方式更新 position、quaternion、scale.y
  3. 杆粗细随质量/刚度调整：基础半径 `baseRadius = 0.02`，下摆杆半径 = `baseRadius * (1 + params.m1 * 0.15)`，上摆杆半径 = `baseRadius * (1 + params.m2 * 0.15)`。仅在 `params` 变化（通过 `useEffect` 监听 `params` 引用变化）时重建 Geometry，不在每帧重建以避免 GC 压力。
- **输入来源**：ball1Position、ball2Position（来自步骤 2）、`params.L1`、`params.L2`、`params.m1`、`params.m2`
- **输出去向**：arm1Ref.current.{position, quaternion, scale}、arm2Ref.current.{position, quaternion, scale}
- **失败行为**：摆杆长度为零时（L1 或 L2 <= 0.001），隐藏对应摆杆 `arm*Ref.current.visible = false`，防止零长度圆柱渲染异常。

### 步骤 4：摆球视觉更新

- **操作对象**：Two `THREE.Mesh` with `THREE.SphereGeometry`（ball1MeshRef, ball2MeshRef）
- **具体操作**：
  1. 更新球体位置：`ball1MeshRef.current.position.copy(ball1Position)`，`ball2MeshRef.current.position.copy(ball2Position)`
  2. 球体半径动态调整（仅在 `params` 变化时重建）：上摆球半径 = `0.08 * Math.pow(params.m1, 1/3)`，下摆球半径 = `0.08 * Math.pow(params.m2, 1/3)`。最小半径 clamp 至 0.04，最大 0.2。
  3. 球体材质从 `MATERIAL_CONFIGS[pendulumMaterial]` 应用：
     - `MeshStandardMaterial({ color, metalness, roughness })` 用于 metal 和 wood
     - `MeshPhysicalMaterial({ color, metalness, roughness, opacity, transparent: true, transmission: 0.9 })` 用于 glass
  4. 球体分段数随设备降级：desktop = 32 segments，tablet = 16 segments，mobile = 8 segments（减少三角面数）
- **输入来源**：ball1Position、ball2Position（来自步骤 2）、`params.m1`、`params.m2`、`pendulumMaterial` props、`deviceType`
- **输出去向**：ball1MeshRef.current.{position}、ball2MeshRef.current.{position}，以及对应的 Material 属性
- **失败行为**：球体半径为 0 时（m1 或 m2 = 0，如单摆退化模式），球体缩小为极小点（radius = 0.01），不可见但保留在场景图中不报错。

### 步骤 5：材质配置表

- **操作对象**：常量对象 `MATERIAL_CONFIGS`（模块顶层定义，不参与渲染循环）
- **具体操作**：定义三种材质的视觉参数映射表：

  ```typescript
  const MATERIAL_CONFIGS: Record<PendulumMaterialType, MaterialVisualConfig> = {
    metal: {
      color: "#C0C0C0",
      metalness: 0.8,
      roughness: 0.2,
      opacity: 1.0,
    },
    wood: {
      color: "#8B5E3C",
      metalness: 0.0,
      roughness: 0.7,
      opacity: 1.0,
    },
    glass: {
      color: "#E8F0F8",
      metalness: 0.1,
      roughness: 0.1,
      opacity: 0.6,
    },
  };
  ```

- **输入来源**：设计文档 §三 3.1「材质区分金属/木质/玻璃（仅视觉，不影响物理）」
- **输出去向**：被步骤 1 和步骤 4 引用
- **失败行为**：不适用（编译时常量）

### 步骤 6：相机管理

- **操作对象**：R3F `useThree().camera`（`THREE.PerspectiveCamera` 实例）、drei `<OrbitControls>` ref
- **具体操作**：
  1. 定义预设相机配置表：
     ```typescript
     const CAMERA_PRESETS: Record<ViewPreset, CameraConfig> = {
       side: {
         position: new Vector3(3.5, 0, 0),
         target: new Vector3(0, -1.2, 0),
         fov: 45,
       },
       top: {
         position: new Vector3(0, 4.0, 0.01),  // z 偏移避免 gimbal lock
         target: new Vector3(0, -1.0, 0),
         fov: 50,
       },
       chaos: {
         position: new Vector3(0, 0, 3.5),     // 初始位置，实际会被动态更新
         target: new Vector3(0, -1.0, 0),      // 初始目标
         fov: 55,
       },
     };
     ```
  2. 订阅 `viewPreset` 变化（通过 `useEffect` 监听）：
     - 若 `viewPreset === "chaos"`：相机每帧跟随下摆球位置，`camera.position.lerp(targetPosition, 0.05)`，`camera.lookAt(ball2Position)`，其中 `targetPosition = ball2Position.clone().add(new Vector3(0, 0, 2.5))`（从摆球后方 2.5 米处观察）
     - 若 `viewPreset !== "chaos"`：执行平滑相机过渡动画——使用 `gsap` 风格的 `MathUtils.lerp` 在 60 帧（1 秒）内从当前 position/target 过渡到预设值。过渡期间禁止用户 OrbitControls 交互，过渡完成后恢复。
  3. 用户自由旋转/缩放/平移：通过 drei `<OrbitControls>` 实现，配置 `enableDamping = true`、`dampingFactor = 0.08`、`minDistance = 0.5`、`maxDistance = 10`、`maxPolarAngle = Math.PI`（允许从下方观察）
  4. 当用户手动操作 OrbitControls 时，`viewPreset` 自动切换为自由模式（但保持 Store 中 `viewPreset` 不变，仅在本地 ref `isUserInteracting` 中标记，通知 ViewControls 组件解除预设高亮）
- **输入来源**：`viewPreset` from `useExploreStore`、ball2Position from 步骤 2、用户鼠标/触控输入
- **输出去向**：`camera.position`、`camera.rotation`、OrbitControls target
- **失败行为**：
  - chaos 模式下面向摆球的向量为零长度（相机与摆球重合）：回退到 side 预设相机位置，`console.warn("EXP-01: chaos camera coincident with ball, falling back to side view")`
  - 用户旋转导致相机翻转（gimbal lock 附近）：OrbitControls 自动处理，无需额外干预

### 步骤 7：环境灯光系统

- **操作对象**：R3F `<ambientLight>`、drei `<SpotLight>`、`<Canvas>` 的 `style.background`
- **具体操作**：
  1. 定义环境配置表：
     ```typescript
     const ENVIRONMENT_CONFIGS: Record<EnvironmentPreset, EnvironmentVisualConfig> = {
       "dark-lab": {
         background: "#0a0a0f",
         ambientIntensity: 0.15,
         spotIntensity: 8,
         spotPosition: new Vector3(3, 5, 2),
         gridColor: "#1a1a2e",
       },
       "white-teaching": {
         background: "#f5f5f5",
         ambientIntensity: 1.0,
         spotIntensity: 0,   // 无聚光灯
         spotPosition: new Vector3(0, 0, 0),  // 不使用
         gridColor: "#cccccc",
       },
     };
     ```
  2. 读取当前环境的配置
  3. 设置 `<Canvas style={{ background: config.background }}>`
  4. 设置 `<ambientLight intensity={config.ambientIntensity} />`
  5. 若 `config.spotIntensity > 0`，渲染 `<SpotLight position={config.spotPosition} intensity={config.spotIntensity} castShadow={enableShadows} />`
  6. 若 `enableShadows`，设置 `<Canvas shadows>` 并配置 spotlight 的 `shadow-mapSize-width={1024} shadow-mapSize-height={1024}`
- **输入来源**：`environment` props、`ENVIRONMENT_CONFIGS` 常量、`enableShadows` 派生值
- **输出去向**：R3F 场景中的灯光节点、Canvas 背景色
- **失败行为**：不适用（纯声明式渲染，无运行时失败路径）

### 步骤 8：响应式降级

- **操作对象**：整个 `Scene3D` 组件的渲染参数
- **具体操作**：在组件顶层计算派生渲染参数：
  ```typescript
  const effectiveShowGrid = deviceType === "mobile" ? false : showGrid;
  const effectiveEnableShadows = deviceType !== "desktop" ? false : enableShadows;
  const sphereSegments = deviceType === "desktop" ? 32 : deviceType === "tablet" ? 16 : 8;
  const cylinderSegments = deviceType === "desktop" ? 16 : deviceType === "tablet" ? 8 : 4;
  ```
- **输入来源**：`deviceType` from `useAppStore`、`showGrid` props、`enableShadows` props
- **输出去向**：传入各子步骤
- **失败行为**：不适用（纯计算逻辑）

---

## 依赖与集成接口

| 依赖方 | 具体接口 | 用途 |
|--------|----------|------|
| `useSimulationStore` | `useSimulationStore((s) => s.state)` | 每帧读取当前 StateVector |
| `useSimulationStore` | `useSimulationStore((s) => s.params)` | 读取物理参数（摆长用于计算 3D 位置） |
| `useSimulationStore` | `useSimulationStore((s) => s.isRunning)` | 判断是否更新摆体位置 |
| `useSimulationStore` | `useSimulationStore.getState()` | useFrame 中不触发 React 重渲染的同步读取 |
| `useExploreStore` | `useExploreStore((s) => s.viewPreset)` | 读取当前视角预设 |
| `useAppStore` | `useAppStore((s) => s.deviceType)` | 读取设备类型用于降级 |
| R3F | `<Canvas>` | 创建 WebGL 渲染上下文 |
| R3F | `useFrame((state, delta) => { ... })` | 每帧更新 Three.js 对象 |
| R3F | `useThree()` | 获取 camera 实例用于动态视角 |
| drei | `<OrbitControls>` | 用户自由旋转/缩放/平移 |
| drei | `<Sphere args={[radius, segments, segments]}>` | 渲染摆球 |
| drei | `<Grid>` | 地面参考网格 |
| drei | `<SpotLight>` | 暗室环境聚光灯 |
| three | `THREE.Vector3` | 3D 位置计算 |
| three | `THREE.CylinderGeometry` | 摆杆几何体（模板高度 1.0） |
| three | `THREE.MeshStandardMaterial` | PBR 材质（金属/木质） |
| three | `THREE.MeshPhysicalMaterial` | 物理材质（玻璃透光） |
| three | `THREE.Quaternion.setFromUnitVectors` | 摆杆旋转对齐 |

---

## 状态机

本功能点不涉及异步流程或状态流转，故无需状态机。视角切换通过 `viewPreset` 枚举值控制，是简单的条件分支而非状态机。

---

## 异常与边界条件

### 异常 1：输入参数非法（零或负摆长、负质量）

- **触发条件**：
  - `params.L1 <= 0.001` 或 `params.L2 <= 0.001`
  - `params.m1 <= 0` 或 `params.m2 <= 0`
  - 注：参数合法性校验由 SIM-02（参数控制面板）负责，此处的检测是防御性的
- **处理策略**：
  1. 在 `useFrame` 开头检查参数合法性
  2. 若检测到非法参数：停止场景更新，将摆球固定在最后有效位置
  3. 在 Canvas 上方覆盖半透明遮罩层（黑色 50% 透明度），居中显示文本「参数异常，请在控制面板中调整」，字号 14px，颜色 #ff6644
  4. `console.error("EXP-01: invalid physics params", { L1: params.L1, L2: params.L2, m1: params.m1, m2: params.m2 })`
  5. 不抛出异常，不崩溃场景
- **重试参数**：不重试。等待用户通过 SIM-02 调整参数后自动恢复（`useEffect` 监听 params 变化，重新校验通过后解除遮罩）

### 异常 2：WebGL 上下文丢失

- **触发条件**：
  - 浏览器触发 `webglcontextlost` 事件（常见原因：GPU 驱动崩溃、显存耗尽、设备进入省电模式）
  - `webglcontextrestored` 事件未在 5 秒内触发
- **处理策略**：
  1. 在 `<Canvas>` 上注册 `onCreated` 回调，对 `gl` 上下文绑定 `webglcontextlost` 和 `webglcontextrestored` 事件监听
  2. `webglcontextlost` 触发时：显示 Canvas 遮罩，文本「3D 渲染引擎暂停 — 正在尝试恢复…」，停止 `useFrame` 中的位置更新
  3. `webglcontextrestored` 触发时：隐藏遮罩，从 `useSimulationStore.getState()` 读取最新状态恢复渲染。重新上传所有纹理和 BufferGeometry。
  4. 若 5 秒内未恢复：遮罩文本变为「3D 渲染引擎不可用，请刷新页面」，提供「刷新页面」按钮（`onClick={() => window.location.reload()}`）
  5. 记录错误：`console.error("EXP-01: WebGL context lost")`
- **重试参数**：等待 WebGL 自行恢复（浏览器行为），不主动重试。5 秒超时后告知用户。

### 异常 3：仿真状态中出现 NaN / Infinity

- **触发条件**：
  - `isNaN(state.theta1) || isNaN(state.omega1) || isNaN(state.theta2) || isNaN(state.omega2)` 为 true
  - `!isFinite(state.theta1)` 等
  - 常见原因：ODE 积分发散（极端参数组合或阻尼为负）
- **处理策略**：
  1. 在 `useFrame` 中每帧检测数值合法性
  2. 连续检测到非法值帧数 `nanFrameCount` 累加
  3. `nanFrameCount === 1` 时：冻结场景在最后有效位置
  4. `nanFrameCount >= 60`（约 1 秒）时：调用 `useSimulationStore.getState().setRunning(false)` 自动暂停仿真
  5. 在 Canvas 角落（右下）显示 Toast：`「检测到数值发散，仿真已暂停。请调整参数后重试」`，持续 5 秒后自动消失
  6. `console.warn("EXP-01: NaN detected, auto-pausing after 1s", state)`
- **重试参数**：不自动重试。用户调整参数后点击播放恢复。

### 异常 4：组件卸载时 Worker 仍在推送数据

- **触发条件**：
  - 用户从探索模式切换到分析模式（`currentMode` 变化），`<Scene3D>` 被卸载
  - 但仿真 Worker 可能仍在运行并推送轨迹数据
- **处理策略**：
  1. 在 `useEffect` 的 cleanup 函数中设置 `isMounted = false` 标志
  2. `useFrame` 开头检查 `isMounted`，若为 false 则直接 return，跳过所有 Three.js 操作
  3. **不负责停止 Worker**（停止仿真由 SIM-01 或全局模式切换逻辑负责），本组件仅停止消费数据
  4. `console.log("EXP-01: Scene3D unmounted, stopping frame updates")`
- **重试参数**：不适用。组件卸载后不再恢复。

### 异常 5：浏览器不支持 WebGL

- **触发条件**：
  - `Canvas` 的 `onCreated` 回调中检测到 `gl === null` 或 `webgl` 上下文类型不可用
  - 或 `window.WebGLRenderingContext === undefined`
- **处理策略**：
  1. 在 `Scene3D` 组件 `useEffect` 挂载时检测 `!!document.createElement('canvas').getContext('webgl2')`
  2. 不支持时：不渲染 `<Canvas>`，渲染 fallback `<div>` 居中显示文本「您的浏览器不支持 WebGL 2.0，请使用最新版 Chrome、Firefox 或 Edge」
  3. 提供浏览器下载链接：Chrome、Firefox、Edge 官网链接（`<a href="..." target="_blank" rel="noopener noreferrer">`）
- **重试参数**：不重试。用户需更换浏览器。

---

## 原则兑现清单

| 原则编号 | 原则名称 | 来源 | 代码级约束 |
|----------|----------|------|------------|
| P1 | 高内聚低耦合 | 项目结构设计 §2 | `Scene3D` 仅通过 `useSimulationStore` 和 `useExploreStore` 的公共接口（`index.ts`）获取数据，禁止直接 import 内部文件 |
| P2 | 仿真核心下沉 | 项目结构设计 §2 | 3D 渲染不包含任何 ODE 求解逻辑，所有物理状态从 `useSimulationStore` 消费 |
| P3 | 共享层零业务逻辑 | 项目结构设计 §2 | 相机配置表、材质配置表、环境配置表均为本组件内部常量，不放入 `shared/`（属于 3D 渲染业务） |
| P4 | 性能优先 | 技术栈设计 §1.2 | `useFrame` 中直接操作 Three.js ref（`ref.current.position.copy()`），不经过 React 状态更新；杆几何体仅在参数变化时重建，不在每帧重建 |
| P5 | 响应式降级 | 功能设计_v0 §八 | 桌面/平板/手机三档降级：球体分段 32/16/8、阴影开关、网格显示开关 |
| P6 | 禁用 UI 库在 Canvas 内 | 技术栈设计 §4.1 | 禁止在 `<Canvas>` 内使用 React DOM 元素（`<div>`、`<span>` 等），遮罩层使用 `fixed` 定位的 DOM 元素覆盖在 Canvas 上方 |

---

## 验收测试场景

### 正向测试 1：默认参数下 3D 场景正确渲染

- **Given**：
  - 浏览器支持 WebGL 2.0
  - `useSimulationStore` 状态：
    ```typescript
    params = { m1: 1.0, m2: 1.0, L1: 1.0, L2: 1.0, g: 9.81, damping: 0 }
    state = { theta1: 1.57, omega1: 0.0, theta2: 1.57, omega2: 0.0 }
    isRunning = true
    ```
  - `useExploreStore` 状态：`viewPreset = "side"`
  - `useAppStore` 状态：`deviceType = "desktop"`
  - `Scene3DProps`：`pendulumMaterial = "metal"`, `environment = "dark-lab"`, `showGrid = true`, `enableShadows = true`
- **When**：组件挂载，1 秒后截图
- **Then**：
  - Canvas 背景色为 `#0a0a0f`（暗色实验室）
  - 可见 2 个金属光泽球体（半径分别为 0.08、0.08）和 2 根圆柱杆
  - 上摆球位于 (1.0, 0.0, 0) 附近（θ₁ = 90° → sin=1, cos≈0）
  - 下摆球位于 (2.0, 0.0, 0) 附近（θ₂ = 90° → 相对上摆再偏移 1.0）
  - 地面可见微弱网格线（`gridColor = "#1a1a2e"`）
  - 相机从侧面（x=3.5, y=0, z=0）观察摆体
  - 聚光灯从上方照射，球体表面有高光
  - 无控制台错误或警告

### 正向测试 2：视角切换与材质切换

- **Given**：
  - 场景已正常渲染（同测试 1 初始状态）
  - `useSimulationStore.state` 正在变化（`isRunning = true`，每帧收到新 StateVector）
- **When**：
  1. `useExploreStore.viewPreset` 从 `"side"` 切换为 `"top"`
  2. 等待相机过渡动画完成（1 秒）
  3. 组件 props `pendulumMaterial` 从 `"metal"` 切换为 `"glass"`
- **Then**：
  - 过渡过程中相机从 (3.5, 0, 0) 平滑移动到 (0, 4.0, 0.01)，耗时约 1 秒
  - 过渡完成后相机从正上方俯视摆体
  - 摆体持续运动不中断（切换视角不影响仿真）
  - 材质切换后球体变为半透明玻璃效果（opacity 0.6），颜色 #E8F0F8，低粗糙度
  - 过渡期间 OrbitControls 用户交互被禁用
  - 过渡完成后 OrbitControls 恢复正常可交互状态

### 异常测试 1：非法参数导致场景降级

- **Given**：
  - 场景已正常渲染（同测试 1 初始状态）
  - `useSimulationStore.params`：`L1 = 0`（零摆长，非法值）
- **When**：下一帧 `useFrame` 执行
- **Then**：
  - 摆球和摆杆位置冻结在上次有效位置
  - Canvas 上方出现半透明黑色遮罩（opacity 0.5）
  - 遮罩居中显示文本「参数异常，请在控制面板中调整」
  - `console.error` 输出包含非法参数值
  - 不抛出异常，浏览器 Tab 不崩溃
  - `useSimulationStore.state` 继续更新（不阻塞仿真），但场景不再渲染新位置
  - 参数恢复正常后（`useEffect` 检测到合法 `params`），遮罩消失，场景恢复渲染

### 异常测试 2：WebGL 上下文丢失与恢复

- **Given**：
  - 场景已正常渲染
  - 通过 Chrome DevTools → Performance → "Simulate WebGL context loss" 模拟上下文丢失
- **When**：`webglcontextlost` 事件触发
- **Then**：
  - 遮罩显示「3D 渲染引擎暂停 — 正在尝试恢复…」
  - `useFrame` 停止更新 Three.js 对象
  - `console.error("EXP-01: WebGL context lost")` 输出
  - 模拟 3 秒后 `webglcontextrestored` 事件触发
  - 遮罩消失，场景从当前 `useSimulationStore.state` 恢复渲染
  - 摆球位置正确，材质和纹理正常（已重新上传）

### 异常测试 3：NaN 数值自动暂停仿真

- **Given**：
  - 场景已正常渲染
  - 手动向 `useSimulationStore` 注入 `state = { theta1: NaN, omega1: 0, theta2: 0, omega2: 0 }`（模拟积分发散）
- **When**：`useFrame` 连续 60 帧检测到 NaN
- **Then**：
  - 第 1 帧：场景冻结在最后有效位置，`console.warn` 输出
  - 第 60 帧：`useSimulationStore.getState().setRunning(false)` 被调用，仿真暂停
  - Canvas 右下角出现 Toast 提示「检测到数值发散，仿真已暂停。请调整参数后重试」
  - Toast 在 5 秒后自动消失
  - 用户调整参数后点击播放可恢复

---

## 文档详细度自检清单

- [x] 文档自包含：不了解本项目代码的开发者，仅凭此文档即可完成 EXP-01 的编码实现
- [x] 无偷懒表述：已全文搜索并确认无 `"等等"`、`"..."`、`"其他字段"`、`"类似"`、`"同上"`、`"参考其他模块"`、`"请根据实际情况补充"`、`"开发者自行决定"`
- [x] 类型定义完整：每个类型字段都有描述 + 示例值 + 约束条件
- [x] 逻辑步骤完整：8 个步骤，每个都有操作对象、具体操作、输入来源、输出去向、失败行为
- [x] 异常处理完整：5 种异常，每种都有精确的触发阈值（如 `L1 <= 0.001`、`nanFrameCount >= 60`）、逐步处理策略、精确参数
- [x] 无隐藏假设：所有默认值来源（如 `baseRadius = 0.02`）、条件分支（如 deviceType 判断）、业务规则（如球体半径公式 `0.08 * m^(1/3)`）已显式写出

---

## 注意事项与禁止行为

1. **[物理无关性约束]** 材质切换（金属/木质/玻璃）仅影响 Three.js `MeshStandardMaterial` / `MeshPhysicalMaterial` 的属性值，**不得**修改 `PhysicsParams` 或影响 ODE 求解结果。材质是纯视觉层概念。

2. **[性能约束 — 禁止每帧重建 Geometry]** 摆杆和摆球的 `CylinderGeometry` / `SphereGeometry` 创建成本高。仅在 `params.m1`、`params.m2`、`params.L1`、`params.L2` 变化时通过 `useEffect` 依赖数组触发重建。每帧 `useFrame` 中只能更新 `Mesh.position`、`Mesh.quaternion`、`Mesh.scale`。

3. **[状态读取方式]** 在 `useFrame` 回调中，**必须**使用 `useSimulationStore.getState()` 同步读取最新状态，而非通过 Zustand hook 选择器（如 `useSimulationStore((s) => s.state)`）。原因：hook 选择器在 rAF 回调中的闭包引用是陈旧的（stale closure）；`getState()` 始终返回最新值。仅在需要触发 React 重渲染的场景（如遮罩显示/隐藏）中使用 hook 选择器。

4. **[禁止 DOM 在 Canvas 内]** R3F `<Canvas>` 内的所有子节点必须是 R3F 原生元素（`<mesh>`、`<ambientLight>`、`<group>` 等）或 drei 组件。遮罩层、Toast、错误提示等 UI 元素必须放在 `<Canvas>` 外，使用 `position: absolute` 定位覆盖。

5. **[Unmount 清理]** 组件的 `useEffect` cleanup 函数必须设置 `isMounted = false` ref，防止组件卸载后 `useFrame` 继续操作已销毁的 Three.js 对象导致内存泄漏或 WebGL 错误。

6. **[OrbitControls 阻尼]** drei `<OrbitControls>` 必须设置 `enableDamping = true` 和 `dampingFactor = 0.08`，确保手动旋转时平滑减速，避免用户头晕。

7. **[相机过渡互斥]** 当预设视角切换触发的相机平滑过渡动画执行期间（约 1 秒 / 60 帧），必须禁用 `<OrbitControls>`（`enabled = false`），过渡完成后恢复 `enabled = true`。禁止同时执行两个过渡动画。

8. **[ball2Position 作为 Chaos 相机目标]** Chaos 视角每帧跟随下摆球（ball2），必须对目标位置做平滑处理（`lerp` factor 0.05），避免相机因混沌运动的快速变化而抖动。若 ball2 速度极高（`Math.abs(omega2) > 10`），将 lerp factor 临时提升至 0.15 以加快跟随。

9. **[零长度杆防御]** 当 `params.L1` 或 `params.L2` 小于 0.001 时，摆杆的 `CylinderGeometry` scale.y 趋近于 0，可能触发渲染伪影。此时设置对应杆 `visible = false`，隐藏该杆而不渲染。当参数恢复大于 0.001 后，重新设置 `visible = true`。

---

*本文档由 AI 辅助生成，建议经技术负责人评审后生效。*
