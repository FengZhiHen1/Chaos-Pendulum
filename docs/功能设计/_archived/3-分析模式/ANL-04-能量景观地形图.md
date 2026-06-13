# 功能规格：ANL-04 能量景观地形图

> **文档生成时间**：`2026-04-28 20:30:24 CST`  
> **源设计文档**：功能设计_v0.md §四 4.4、功能模块全拆解.md ANL-04、双摆混沌实验室-技术栈设计.md v1.2 §4.6  
> **版本记录**：
> | 版本 | 时间 | 修改人 | 变更摘要 |
> |------|------|--------|----------|
> | v1.0 | 2026-04-28 20:30:24 | AI Assistant | 初始版本，基于功能设计_v0 §四 4.4 + 技术栈设计 v1.2 §4.6 |

> **冲突核查指引**：若发现与已有规格文档冲突，优先以时间戳更新的版本为准，并在版本记录中追加冲突解决条目。

---

## 所属模块与溯源

| 维度 | 内容 |
|------|------|
| 模块编号 | ANL-04 |
| 模块名称 | 能量景观地形图（Energy Landscape） |
| 所属模式 | 分析模式（Analyze） |
| 设计文档溯源 | 功能设计_v0.md §四 4.4；功能模块全拆解.md ANL-04行；技术栈设计.md §4.6 |
| 依赖模块 | SIM-01（双摆物理引擎）— 提供实时 `(θ₁, θ₂)` 用于实时光点定位；SIM-02（参数控制面板）— 参数变更时重新生成曲面 |
| 被依赖模块 | 无（终端可视化模块） |

---

## 已有设计兼容性分析

已审查以下规格文档：

| 文档 | 审查日期 | 共享接口 | 冲突？ |
|------|------|------|:---:|
| ANL-01-李雅普诺夫指数谱.md (v1.0) | 2026-04-28 | `simulationStore`（只读） | ✅ 无冲突 |
| ANL-02-参数空间分岔图.md (v1.0) | 2026-04-28 | `simulationStore`（只读） | ✅ 无冲突 |
| ANL-03-庞加莱截面.md (v1.0) | 2026-04-28 | `simulationStore`（只读）；`analysisStore` 扩展模式 | ✅ 无冲突 |
| EXP-01-3D仿真场景.md (v1.0) | 2026-04-28 | R3F + drei 技术栈；`simulationStore` 只读 | ✅ 无冲突 |

**一致性保障**：

| 共享项 | 已有模块使用方式 | ANL-04 处理方式 |
|------|------|------|
| `simulationStore` | ANL-01/02 读写；ANL-03 只读 | **只读**（读取 `theta1_0`、`theta2_0` 的实时值用于光点定位 + 参数用于曲面公式计算） |
| `analysisStore` | ANL-01 写入 `activeLayer`、`hoverTooltip`；ANL-03 独立 `PoincareSlice` | ANL-04 使用独立 `EnergyLandscapeSlice`，不触碰其他模块字段 |
| R3F + drei | EXP-01 渲染双摆 3D 场景 | ANL-04 渲染独立 `<Canvas>` 内的能量曲面，不共享 Canvas 实例 |
| D3 contour | 未使用 | ANL-04 首次使用 `d3.contourDensity`，不与其他模块冲突 |

**新增接口**（`analysisStore` 扩展）：

```typescript
// 在 src/stores/analysisStore.ts 中追加 ANL-04 专用 slice
interface EnergyLandscapeSlice {
  energyLandscape: {
    showContours: boolean;            // 是否显示底部等高线投影
    showSurface: boolean;             // 是否显示曲面（教学时可关闭以仅看等高线）
    surfaceOpacity: number;           // 曲面不透明度，范围 [0.2, 1.0]，默认 0.7
    autoRotate: boolean;              // 是否自动缓慢旋转视角，默认 false
    hoveredParam: { theta1: number; theta2: number; V: number } | null;  // 鼠标悬停的曲面位置
    setShowContours: (v: boolean) => void;
    setShowSurface: (v: boolean) => void;
    setSurfaceOpacity: (v: number) => void;
    setAutoRotate: (v: boolean) => void;
    setHoveredParam: (p: { theta1: number; theta2: number; V: number } | null) => void;
  };
}
```

> 无冲突。ANL-04 使用 R3F 3D 渲染（与 ANL-01/02/03 的 Canvas 2D 不同），`analysisStore` 使用独立 slice。

---

## 技术栈绑定

| 维度 | 必须使用 | 版本 | 禁止使用 |
|------|----------|------|----------|
| UI 框架 | React + TypeScript | 18.x / 5.x | 类组件 |
| 3D 渲染 | React Three Fiber + drei（`OrbitControls`、`Line`、`Sphere`、`Text`） | 8.x / 9.x | 原生 Three.js 手动场景管理；Babylon.js |
| 3D 几何 | `THREE.BufferGeometry`（自定义顶点/索引）+ `THREE.ShaderMaterial` | — | 使用 10,000 个独立 `<mesh>` 渲染每个格点 |
| 纹理 | `THREE.CanvasTexture`（从 D3 contour 输出生成） | — | 预烘焙 PNG 纹理（参数变更时无法实时更新） |
| 等离线计算 | D3.js `d3-contour` 模块 | 7.x | 手写 marching squares |
| 状态管理 | Zustand（`analysisStore` 新增 slice；`simulationStore` 只读） | 4.x | React Context 传递曲面数据 |
| UI 组件 | shadcn/ui（Slider、Switch、Tooltip） | latest | 自建组件 |
| 样式 | Tailwind CSS | 3.x | CSS Modules |
| 文件组织 | `src/components/analysis/EnergyLandscape/` | — | 散布在页面组件中 |
| 曲面颜色 | 自定义 GLSL `vertexColors` + `fragmentShader`（势能梯度映射） | — | MeshStandardMaterial / MeshPhongMaterial（无法精确控制色阶） |

---

## 输入定义（精确类型）

### 输入 1：势能曲面参数（决定曲面形状）

```typescript
// 来源：simulationStore.params（只读）
// 当参数变更时，曲面重新计算（主线程即时计算，不需要 Worker）

interface EnergyLandscapeParams {
  m1: number;    // 上摆质量，必填，> 0，单位 kg，默认 1.0
  m2: number;    // 下摆质量，必填，> 0，单位 kg，默认 1.0
  L1: number;    // 上摆摆长，必填，> 0，单位 m，默认 1.0
  L2: number;    // 下摆摆长，必填，> 0，单位 m，默认 1.0
  g: number;     // 重力加速度，必填，> 0，单位 m/s²，默认 9.81
}

// 势能函数：V(θ₁, θ₂) = -(m₁+m₂)·g·L₁·cos(θ₁) - m₂·g·L₂·cos(θ₂)
// 解析梯度：∂V/∂θ₁ = (m₁+m₂)·g·L₁·sin(θ₁)
//           ∂V/∂θ₂ =  m₂·g·L₂·sin(θ₂)
//           |∇V| = sqrt( (∂V/∂θ₁)² + (∂V/∂θ₂)² )
```

### 输入 2：实时仿真状态（光点定位）

```typescript
// 来源：simulationStore（只读订阅），每帧更新
// 通过 Zustand selector 订阅，防抖 16ms（60fps 同步）

interface RealtimeStateForLandscape {
  theta1: number;     // 当前上摆角，单位 rad，范围 [-π, π]
  theta2: number;     // 当前下摆角，单位 rad，范围 [-π, π]
  isRunning: boolean; // 仿真是否运行中（暂停时冻结光点位置）
}
```

### 输入 3：曲面生成配置

```typescript
// Props 传入，控制曲面的分辨率与视觉参数

interface EnergyLandscapeConfig {
  gridResolution: number;      // 单轴网格分辨率，默认 100（生成 100×100 = 10,000 顶点）
  surfaceScaleXZ: number;      // θ→世界坐标缩放，默认 1.0（θ₁=π → worldX=3.14）
  surfaceScaleY: number;       // V→世界坐标缩放，默认 0.5（压缩高度使曲面扁一些，便于观察）
  contourLevels: number;       // 等高线等级数，默认 12
  lightPointRadius: number;    // 实时光点半径，默认 0.15（世界单位）
  lightPointColor: string;     // 光点颜色，默认 "#ffdd00"（暖黄）
  lightPointGlow: number;      // 光点发光强度（emissive），默认 1.0
}
```

### 输入 4：用户交互事件

| 交互类型 | 事件源 | 数据类型 | 触发条件 |
|------|------|------|------|
| 旋转/缩放 | drei `OrbitControls` 事件 | `THREE.Camera` 变换 | 鼠标拖拽 / 滚轮 |
| 悬停曲面 | R3F `onPointerMove` | `{ point: THREE.Vector3 }` — 交点世界坐标 | 鼠标在曲面 mesh 上移动 |
| 离开曲面 | R3F `onPointerOut` | `void` | 鼠标离开曲面 mesh |
| 开关等高线 | shadcn/ui Switch `onCheckedChange` | `boolean` | 用户切换 |
| 调整不透明度 | shadcn/ui Slider `onValueChange` | `number` [0.2, 1.0] | 用户拖动滑杆 |
| 切换自动旋转 | shadcn/ui Switch `onCheckedChange` | `boolean` | 用户切换 |

---

## 输出定义（精确类型）

### 输出 1：3D 半透明势能曲面

- **渲染目标**：独立 `<Canvas>` 元素（R3F），不与 EXP-01 主场景共享
- **几何规格**：
  - 网格：`gridResolution × gridResolution` 顶点（默认 100×100 = 10,000 顶点）
  - X 轴范围：`[-π·surfaceScaleXZ, π·surfaceScaleXZ]`，对应 θ₁ ∈ [-π, π]
  - Z 轴范围：`[-π·surfaceScaleXZ, π·surfaceScaleXZ]`，对应 θ₂ ∈ [-π, π]
  - Y 轴（高度）：`V(θ₁, θ₂) · surfaceScaleY`，根据当前参数计算
  - 顶点的 `(x, y, z)` 坐标由 `(θ₁, V(θ₁,θ₂), θ₂)` → 世界空间映射确定
- **曲面视觉**：
  - 材质：`THREE.ShaderMaterial`，`transparent = true`，`depthWrite = false`
  - 面颜色：vertex shader 传递 `|∇V|` 标量值 → fragment shader 用此值查询内置色阶
  - 色阶：低梯度（势阱底部）→ `#4575b4`（深蓝，平缓）；中梯度 → `#ffffbf`（浅黄，缓坡）；高梯度（势垒脊线）→ `#d73027`（深红，陡峭）
  - 不透明度：由 `surfaceOpacity` prop 控制（默认 0.7），双面渲染
- **网格线**（可选 overlay）：使用 `THREE.LineSegments` 在曲面上叠加线框，颜色 `#333333`，线宽 1px，间隔 = `gridResolution / 20`（每 5 个格点一条线）

### 输出 2：实时光点

- **几何**：drei `<Sphere>` 组件，`radius = lightPointRadius`（默认 0.15）
- **位置**：每帧从 `simulationStore` 读取 `(theta1, theta2)` 当前值：
  ```
  worldX = theta1 * surfaceScaleXZ
  worldZ = theta2 * surfaceScaleXZ
  worldY = V(theta1, theta2, params) * surfaceScaleY + 0.05  // +0.05 使光点在曲面上方略微浮起
  ```
- **材质**：`MeshBasicMaterial`（不受场景光照影响），颜色 `lightPointColor`（默认暖黄 `#ffdd00`）
- **发光效果**：在光点下方添加一个半透明圆环或 pointLight（`intensity = 0.5`，`color = lightPointColor`，`distance = 1.5`），使光点在曲面上的投影区域微微照亮
- **轨迹尾迹**（可选）：最近 30 个光点历史位置用半透明小点连接（`THREE.Line`，颜色 `#ffdd00`，alpha 0.3，渐变淡出），展示轨线在能量曲面上的滑行路径

### 输出 3：底部等高线投影

- **渲染方式**：
  1. 使用 D3 `d3-contour` 模块：输入 100×100 的 V 值矩阵 + 12 个等高等级（`contourLevels`）
  2. 将等高线路径 `d3.geoPath` 渲染到离屏 Canvas（尺寸 512×512）
  3. 生成 `THREE.CanvasTexture` → 贴到 Y = V_min 处的水平 `<PlaneGeometry>` 上
- **视觉**：等高线颜色 `#333333`，线宽 1.5px；等高线平面 `opacity = 0.6`，背景透明
- **等高线平面位置**：位于曲面最低点下方 0.2 世界单位处（`y = V_min * surfaceScaleY - 0.2`），确保不与曲面底部重叠

### 输出 4：悬停信息 HUD

```typescript
interface EnergyLandscapeHoverData {
  visible: boolean;
  theta1: number;     // 悬停位置对应的 θ₁，toFixed(3)，单位 rad
  theta2: number;     // 悬停位置对应的 θ₂，toFixed(3)，单位 rad
  potentialEnergy: number;   // V(θ₁, θ₂)，toFixed(2)，单位 J
  gradient: number;   // |∇V|，toFixed(3)
  regime: string;     // "势阱"（|∇V| < 0.3·max）、"缓坡"（0.3≤|∇V|<0.7·max）、"势垒"（|∇V| ≥ 0.7·max）
}
```

- 渲染：shadcn/ui `Tooltip` 绝对定位跟随鼠标，偏移 (12px, -12px)
- 内容格式：
  ```
  θ₁ = 1.571 rad, θ₂ = -0.785 rad
  势能 V = -18.53 J
  梯度 |∇V| = 4.21（势垒）
  ```
- 查找逻辑：R3F `onPointerMove` 事件提供交点世界坐标 → `theta1 = intersection.point.x / surfaceScaleXZ`，`theta2 = intersection.point.z / surfaceScaleXZ`

---

## 核心逻辑步骤

### Step 1: 组件挂载 → 首次生成曲面几何体

| 项目 | 内容 |
|------|------|
| 操作对象 | `THREE.BufferGeometry` + `THREE.ShaderMaterial` |
| 具体操作 | 1. 从 `simulationStore.params` 和 `EnergyLandscapeConfig` 获取参数；2. 在主线程即时计算（10,000 个顶点 + `cos`/`sin` 计算，耗时 < 1ms，不需要 Worker）：遍历 100×100 网格，对每个 (θ₁_i, θ₂_j) — 其中 θ₁_i = -π + (i+0.5)/100·2π，θ₂_j = -π + (j+0.5)/100·2π — 计算 `V = -(m₁+m₂)gL₁cos(θ₁_i) - m₂gL₂cos(θ₂_j)` 和 `gradX = (m₁+m₂)gL₁sin(θ₁_i)`、`gradZ = m₂gL₂sin(θ₂_j)`、`gradMag = sqrt(gradX² + gradZ²)`；3. 构建 `BufferGeometry`：`positions` Float32Array(100×100×3)，`colors` Float32Array(100×100×3)（颜色基于 gradMag/totalRange 映射到色阶），`indices` Uint16Array（两个三角形 per cell）；4. 创建 `ShaderMaterial`（vertexShader 直接传递 `color` attribute，fragmentShader 输出 `gl_FragColor = vec4(color, uOpacity)`） |
| 输入来源 | `simulationStore.params` (m1, m2, L1, L2, g)；`props.config` |
| 输出去向 | R3F `<mesh>` 的 geometry 和 material |
| 失败行为 | params 中任何值非法（≤ 0）→ 显示占位 Plane + Toast "无效参数，无法生成能量曲面" |

**GPU Shader 关键代码**：

```glsl
// Vertex Shader
attribute vec3 color;        // 预计算的势能梯度颜色
varying vec3 vColor;
varying float vGradient;
uniform float uScaleY;

void main() {
  vec3 pos = position;
  pos.y *= uScaleY;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  vColor = color;
}
```

```glsl
// Fragment Shader
varying vec3 vColor;
uniform float uOpacity;

void main() {
  gl_FragColor = vec4(vColor, uOpacity);
}
```

**色阶映射规则**（在 JavaScript 中预计算 vertex colors）：

```typescript
function gradientToColor(gradMag: number, maxGrad: number): [number, number, number] {
  const t = maxGrad > 0 ? gradMag / maxGrad : 0; // normalized [0, 1]
  // 低梯度(0.0→0.3)：深蓝 → 浅蓝
  // 中梯度(0.3→0.7)：浅蓝 → 浅黄
  // 高梯度(0.7→1.0)：浅黄 → 深红
  // 使用分段线性插值 (RGB triplet interpolation)
  if (t <= 0.3) return lerpColor([0.27, 0.46, 0.71], [0.67, 0.85, 0.91], t / 0.3);
  if (t <= 0.7) return lerpColor([0.67, 0.85, 0.91], [1.0, 1.0, 0.75], (t - 0.3) / 0.4);
  return lerpColor([1.0, 1.0, 0.75], [0.84, 0.19, 0.15], (t - 0.7) / 0.3);
}
```

### Step 2: 仿真参数变更 → 重建曲面

| 项目 | 内容 |
|------|------|
| 操作对象 | `BufferGeometry` + `ShaderMaterial` |
| 具体操作 | 1. `useEffect` 订阅 `simulationStore.params` 的 `m1, m2, L1, L2, g` 字段变化（使用 `shallow` diff）；2. 参数变化 → 重新执行 Step 1 的顶点计算 + 重建 BufferGeometry + 重建等高线 CanvasTexture；3. 使用 `useMemo` 包裹几何体生成逻辑，避免每次渲染都重建；4. 重建时显示短暂过渡（旧曲面淡出 200ms → 新曲面淡入 200ms） |
| 输入来源 | `simulationStore.params` 变化 |
| 输出去向 | R3F mesh 更新 |
| 失败行为 | 同 Step 1 |

### Step 3: 实时光点随仿真移动

| 项目 | 内容 |
|------|------|
| 操作对象 | drei `<Sphere>` 的 `position` prop |
| 具体操作 | 1. `useFrame` (R3F) 中每帧执行：从 `simulationStore` 读取 `theta1`、`theta2` 当前值；2. 计算光点世界坐标 `[theta1 * surfaceScaleXZ, V(theta1, theta2) * surfaceScaleY + 0.05, theta2 * surfaceScaleXZ]`；3. 更新 Sphere `position`；4. 如果 `isRunning === false` → 光点冻结在最后位置；5. 将当前位置推入尾迹环形缓冲区（容量 30 点）→ 更新尾迹 Line geometry；6. 光点 theta1/theta2 标准化至 [-π, π]（曲面定义域） |
| 输入来源 | `simulationStore` 实时状态；尾迹环形缓冲区 |
| 输出去向 | R3F Sphere position + Line geometry |
| 失败行为 | theta1/theta2 为 NaN → 光点隐藏（`visible = false`），尾迹不追加 |

### Step 4: 悬停曲面 → HUD 信息

| 项目 | 内容 |
|------|------|
| 操作对象 | R3F `onPointerMove` 事件 + shadcn/ui Tooltip |
| 具体操作 | 1. 在曲面 `<mesh>` 上绑定 `onPointerMove`：(a) 从 `event.point` 获取交点世界坐标；(b) `theta1 = point.x / surfaceScaleXZ`；(c) `theta2 = point.z / surfaceScaleXZ`；(d) 重新计算该位置的精确 V 和 |∇V|；(e) 判定 regime：`maxGrad = max(allVertexGradients)`，若 `gradMag < 0.3*maxGrad` → "势阱"，若 `gradMag > 0.7*maxGrad` → "势垒"，否则 "缓坡"；(f) 更新 Tooltip state；2. 在悬停点添加一个半透明标记环（`<Ring>` 或 `<Circle>`，半径 0.1，颜色 `#ffffff`，alpha 0.5）短暂显示 |
| 输入来源 | R3F pointer 事件；顶点梯度数据（缓存在组件内，100×100 查找） |
| 输出去向 | shadcn/ui Tooltip；悬停标记环 state |
| 失败行为 | 交点 worldX/Z 超出曲面范围 → 不显示 Tooltip |

### Step 5: 等高线生成与更新

| 项目 | 内容 |
|------|------|
| 操作对象 | 离屏 Canvas → `THREE.CanvasTexture` |
| 具体操作 | 1. 在 Step 1 计算完 V 网格后，(a) 将 100×100 V 值矩阵传入 D3 `d3.contours().size([100, 100]).thresholds(12)`；(b) 对每条等高线 MultiPolygon，使用 `d3.geoPath()` 绘制到 512×512 离屏 Canvas：`ctx.strokeStyle = '#333333'`，`ctx.lineWidth = 1.5`；(c) `CanvasTexture` 从离屏 Canvas 生成；2. 将纹理应用到 Y = `V_min * surfaceScaleY - 0.2` 处的 `<PlaneGeometry>`；3. 仅当 `analysisStore.energyLandscape.showContours === true` 时显示此 Plane；4. 参数变更时重新生成 CanvasTexture |
| 输入来源 | 100×100 V 矩阵；`contourLevels` prop |
| 输出去向 | `THREE.CanvasTexture` → 等高线 Plane |
| 失败行为 | `d3-contour` 不可用 → 等离线 Plane 不渲染，不影响曲面 |

### Step 6: 组件卸载 → 清理

| 项目 | 内容 |
|------|------|
| 操作对象 | R3F Canvas + Three.js 资源 |
| 具体操作 | 1. `useEffect` cleanup：注销 `simulationStore.subscribe`；2. 调用 `geometry.dispose()`、`material.dispose()`、`texture.dispose()` 释放 GPU 资源；3. 停止 `useFrame` 循环（React cleanup 自动处理） |

---

## 依赖与集成接口

### 外部模块依赖

| 依赖模块 | 调用接口 | 调用时机 | 数据方向 |
|------|------|------|------|
| SIM-01 双摆物理引擎 | `simulationStore` 的 `theta1`、`theta2`（只读） | 每帧（`useFrame`） | SIM-01 → ANL-04 |
| SIM-02 参数控制面板 | `simulationStore.params` (m1, m2, L1, L2, g) 只读 | 参数变更时触发曲面重建 | SIM-02 → ANL-04 |
| SYS-02 运行时异常处理 | `useToast()` | 参数非法 / WebGL 上下文丢失 | ANL-04 → SYS-02 |
| INF-01 可观测性 | `performance.mark('energy-landscape-rebuild')` | 曲面重建前后 | ANL-04 → INF-01 |

### Zustand Store 接口

```typescript
// simulationStore（只读，已存在）
interface SimulationStoreForLandscape {
  theta1: number;        // 实时上摆角
  theta2: number;        // 实时下摆角
  isRunning: boolean;
  params: {
    m1: number; m2: number; L1: number; L2: number; g: number;
  };
}

// analysisStore 新增 slice
interface EnergyLandscapeSlice {
  energyLandscape: {
    showContours: boolean;
    showSurface: boolean;
    surfaceOpacity: number;
    autoRotate: boolean;
    hoveredParam: { theta1: number; theta2: number; V: number } | null;
    setShowContours: (v: boolean) => void;
    setShowSurface: (v: boolean) => void;
    setSurfaceOpacity: (v: number) => void;
    setAutoRotate: (v: boolean) => void;
    setHoveredParam: (p: { theta1: number; theta2: number; V: number } | null) => void;
  };
}
```

---

## 状态机

| 当前状态 | 触发事件 | 下一状态 | 前置条件 | 副作用 |
|------|------|------|------|------|
| `initializing` | 组件挂载 + params 有效 | `building` | `simulationStore.params` 所有字段 > 0 | 显示 shadcn/ui Skeleton（3D Canvas 占位区域） |
| `building` | 几何体 + 纹理生成完成 | `ready` | BufferGeometry 顶点数 = 10,000；ShaderMaterial 编译成功 | 曲面淡入（opacity 0→`surfaceOpacity`，200ms） |
| `ready` | 仿真运行中 + 光点每帧更新 | `ready` | — | 光点移动 + 尾迹追加 |
| `ready` | 参数变更（m1/m2/L1/L2/g） | `rebuilding` | 新 params 有效 | 曲面淡出→重建→淡入 |
| `rebuilding` | 几何体重建完成 | `ready` | 新 geometry/material 有效 | 曲面淡入；等高线纹理更新 |
| `ready` | 仿真暂停 | `ready`（冻结） | — | 光点冻结在最后位置；尾迹停止追加 |
| `ready` | 切换 `showContours` / `surfaceOpacity` | `ready` | — | 对应 Plane visibility 切换 / material uniform 更新 |
| `*` | 组件卸载 | — | — | dispose geometry/material/texture；cleanup subscribe |

---

## 异常与边界条件

### 异常场景 1：WebGL 上下文丢失

| 维度 | 内容 |
|------|------|
| **触发条件** | GPU 驱动崩溃、浏览器资源耗尽、设备进入休眠后恢复 |
| **处理策略** | 1. R3F 内置 `onLost` 事件 → 暂停 `useFrame` 循环；2. Canvas 显示"WebGL 上下文丢失，正在恢复..."；3. `onRestored` 事件 → 重建所有 geometry/material/texture；4. 恢复后自动继续渲染 |
| **重试参数** | 无（WebGL 上下文由浏览器管理，R3F 自动处理恢复） |

### 异常场景 2：势能计算中遇到参数非法

| 维度 | 内容 |
|------|------|
| **触发条件** | `m1 ≤ 0`、`m2 ≤ 0`、`L1 ≤ 0`、`L2 ≤ 0`、`g ≤ 0`（用户通过 SIM-02 滑杆拖到极端值或 URL 注入） |
| **处理策略** | 1. 曲面不生成（`geometry = null`）；2. Canvas 显示占位文字 + Toast "参数非法：质量、摆长、重力加速度必须为正数"；3. 等离线 Plane 和光点不渲染；4. 不阻塞其他分析模块 |
| **重试参数** | 不重试（等待用户修正参数） |

### 异常场景 3：曲面顶点全部相同（势能为常数）

| 维度 | 内容 |
|------|------|
| **触发条件** | 极端参数组合导致 V(θ₁,θ₂) 在整网格上几乎恒等（变化 < 1e-6），如 `m₁ >> m₂` 且 `L₂ ≈ 0` |
| **处理策略** | 1. 曲面渲染为平面（所有顶点 Y 坐标相同）；2. 等高线不生成（`contours.thresholds([])` 返回空）；3. Toast 提示"势能变化极小，曲率为平面"；4. 光点正常显示（在平面上滑动） |
| **重试参数** | 无 |

### 边界条件清单

| 边界条件 | 处理方式 |
|------|------|
| θ₁ 或 θ₂ 超过 [-π, π]（周期性溢出） | `atan2(sin(θ), cos(θ))` 标准化至 [-π, π]，光点和悬停查找均使用标准化值 |
| 光点位置超出曲面边界（标准化后仍越界） | clamp 到曲面边缘，光点颜色切换为红色（闪烁 500ms 提示异常） |
| 曲面几何体重建过于频繁（用户连续拖动滑杆） | 防抖 200ms，仅最后一次参数变更触发重建 |
| 等高线计算结果为空（势能面过于平坦） | 等离线 Plane 不渲染，不提示（非错误） |
| Canvas 容器为 0 | 同其他模块：ResizeObserver → 跳过 R3F 渲染 |
| R3F Canvas 与 EXP-01 Canvas 同时渲染的性能 | 两者共享 GPU 但独立 Context；ANL-04 顶点数 < 10,000，正常 GPU 可承受 |

---

## 原则兑现清单

| 设计原则 | 来源 | 代码级约束 |
|------|------|------|
| 能量直观 | 功能设计_v0 §四 4.4 | 曲面的高度=势能以建立物理直觉；色阶区分势阱（蓝）与势垒（红）；底部等高线辅助识别能垒边界 |
| 实时反馈 | 功能设计_v0 §四 4.4 | 光点 60fps 同步 3D 仿真状态；尾迹展示最近 30 步在能量曲面上的路径；光点亮色（暖黄）在蓝色曲面上高对比 |
| 教学辅助 | 功能设计_v0 §四 4.4 | 悬停显示精确势能值和梯度判定（势阱/缓坡/势垒）；可关闭曲面仅留等高线用于课堂讲解 |
| 3D 探索 | 功能设计_v0 §二 | OrbitControls 自由旋转缩放；自动旋转模式（`autoRotate`）；半透明曲面允许观察背面结构 |
| 零后端 | 技术栈设计 v1.2 §1.2 | 势能计算全部在浏览器主线程完成（10,000 顶点 < 1ms）；等高线由 D3 浏览器端计算 |

---

## 验收测试场景

### 正向测试 1：默认参数 → 生成势能曲面

**Given** `simulationStore.params = { m1:1, m2:1, L1:1, L2:1, g:9.81 }`，组件默认配置 `gridResolution=100, surfaceOpacity=0.7`
**When** `EnergyLandscape` 组件挂载
**Then**
1. Skeleton 显示 < 300ms → 3D 曲面淡入
2. 曲面为 3D 波形（沿 θ₁ 和 θ₂ 方向各有周期-2π 的余弦波叠加），高度范围约 [-29.4, 29.4]（由 V 公式: `-(2*9.81*1*cos(θ₁)) - (1*9.81*1*cos(θ₂))` = `-19.62cos(θ₁) - 9.81cos(θ₂)`，min=-29.43, max=29.43）
3. 曲面颜色：势阱底部（V≈-29.4, (θ₁,θ₂)=(0,0)）→ 深蓝；势垒脊线（V≈9.8, (θ₁,θ₂)=(π,0)）→ 浅黄至红
4. 底部显示 12 条等高线投影（D3 生成）
5. OrbitControls 可旋转/缩放
6. 光点（暖黄小球）位于 `(theta1, theta2)` 对应位置，随仿真运动滑动

### 正向测试 2：悬停曲面 → 势能信息

**Given** 曲面已渲染
**When** 鼠标悬停在曲面 X≈1.57（θ₁≈π/2）、Z≈0（θ₂≈0）处
**Then**
1. Tooltip 显示：
   ```
   θ₁ = 1.571 rad, θ₂ = 0.000 rad
   势能 V = -9.81 J
   梯度 |∇V| = 13.87（缓坡）
   ```
2. 悬停点出现白色标记环（半径 0.1）
3. 鼠标移出曲面 → Tooltip 消失 + 标记环消失

### 正向测试 3：开关等高线和调整透明度

**Given** 曲面正常渲染，`showContours=true, surfaceOpacity=0.7`
**When** (a) 用户关闭等高线 Switch → `showContours=false`；(b) 用户拖动不透明度 Slider 至 0.3
**Then**
1. 等高线 Plane 消失（`visible=false`）
2. 曲面不透明度降为 0.3（背后的网格线更清晰可见）
3. 两个控件状态与 `analysisStore.energyLandscape` 同步

### 反向测试 1：参数非法 → 降级

**Given** 用户通过 SIM-02 将 `m2` 调至 0（或 URL 参数注入）
**When** `simulationStore.params.m2 = 0` 触发曲面重建
**Then**
1. 曲面几何体不生成（`geometry=null`）
2. Canvas 显示"无效参数：质量、摆长、重力加速度必须为正数"
3. Toast 弹出相同内容，持续 5s
4. 等高线 Plane 和光点不渲染
5. 用户将 m2 调回正数 → 曲面自动重建

### 反向测试 2：光点 theta 值为 NaN → 隐藏

**Given** 仿真 Worker 因极端参数返回 NaN 状态
**When** `simulationStore.theta1 = NaN`
**Then**
1. 光束 `visible = false`
2. 尾迹停止追加
3. Canvas 仍正常显示曲面（不因光点异常而崩溃）
4. Toast "仿真状态异常，光点暂时不可用"

---

## 注意事项与禁止行为

### 注意事项

1. **SurfaceScaleY 的合理默认值**：V(θ₁,θ₂) 的数值范围在典型参数下约 40 个单位（-29 到 +10），但 θ 轴范围仅 2π≈6.28。默认 `surfaceScaleY = 0.5` 使 Y 轴范围 ≈ 20 单位，与 XZ 轴（~6.28）处于同一量级，曲面形状清晰可见。如果 scaleY 太大，曲面的"墙壁"会过于陡峭；太小则势阱/势垒差异不显著。

2. **ShaderMaterial 与 R3F 的类型兼容**：R3F 的 `<shaderMaterial>` 需通过 `extend` 注册或使用 `THREE.ShaderMaterial` 实例。推荐使用 `useMemo` 创建 shader material 实例，避免每次渲染重新编译 shader。

3. **D3 contour 与 Canvas 坐标系统的对接**：D3 contour 使用地理坐标（经度-like = θ₁ 轴，纬度-like = θ₂ 轴），输出 GeoJSON MultiPolygon。`d3.geoPath()` 投影到离屏 Canvas。确保 D3 的 `[0,0]` 对应 Canvas 左上角，与 THREE.CanvasTexture 的 UV 映射（`[0,0]` 对应纹理左下角）一致，否则等离线会在底部平面上颠倒显示。

4. **光点尾迹的环形缓冲区**：容量 30 点，仿真 60fps 下覆盖 0.5 秒。如果仿真长时间停留在势阱中，尾迹在曲面上形成密集的小圈，直观展示"被困在阱中"。尾迹用 `THREE.BufferGeometry` + `setDrawRange` 控制可见段，避免重建几何体。

5. **与 EXP-01 3D 场景的性能协调**：ANL-04 和 EXP-01 各自拥有独立的 `<Canvas>` 和 WebGL Context。浏览器限制 WebGL Context 数量（通常 8-16 个）。如果同时渲染 ANL-04 和主 3D 场景，确保两者不争夺过多 GPU 资源（ANL-04 仅 10,000 顶点 + 1 纹理，GPU 负载很轻）。

### 禁止行为

1. **禁止使用 Worker 计算势能曲面**。V(θ₁,θ₂) = -(m₁+m₂)gL₁cos(θ₁) - m₂gL₂cos(θ₂)，10,000 次 `cos` 调用在主线程 < 1ms。使用 Worker 反而增加序列化/反序列化 Float32Array 的开销（~80KB 传输）。

2. **禁止为每个网格顶点创建独立 `<mesh>`**。必须使用单个 `BufferGeometry` 包含全部 10,000 个顶点。10,000 个独立 mesh 会导致 R3F reconcile 灾难。

3. **禁止在 `useFrame` 中重算势能曲面**。曲面仅在 `params` 变化时重建（通过 `useMemo` 依赖 `[m1, m2, L1, L2, g]`）。`useFrame` 仅更新光点位置和尾迹，不做曲面计算。

4. **禁止在 ShaderMaterial 中使用 `MeshStandardMaterial` 的 PBR 管线**。自定义 ShaderMaterial 直接输出颜色 + 透明度，绕过光照计算。这是因为能量曲面的颜色编码的是势能梯度（科学数据可视化），而非材质的光照属性。加 PBR 光照会破坏色阶的语义。

5. **禁止曲面与 EXP-01 主场景共享 Canvas**。ANL-04 的 R3F `<Canvas>` 独立于主 3D 场景，拥有独立的 camera、scene、renderer。共享 Canvas 会导致两个完全不同的视图需求（主场景 vs 数据可视化）互相干扰。

6. **禁止在 `onPointerMove` 回调中执行耗时的梯度遍历**。`gradMag` 查找应在悬停时用封闭公式计算：`gradMag(θ₁,θ₂) = sqrt(((m₁+m₂)gL₁sin(θ₁))² + (m₂gL₂sin(θ₂))²)`。不要遍历 10,000 个顶点找最近邻（O(n) 且精度低）。

---

*本文档由 AI 辅助生成，需经技术负责人评审后生效。*
