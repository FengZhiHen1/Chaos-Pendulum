# 功能点：STY-02 演示模式

> **文档生成时间**：2026-04-28 21:41:19 CST
> **版本记录**：
> | 版本 | 时间 | 修改人 | 变更摘要 |
> |------|------|--------|----------|
> | v1.0 | 2026-04-28 21:41:19 | AI Assistant | 初始版本，对齐已有 `useStoryStore.demoMode` 字段 + EXP-01 OrbitControls 接口 + SIM-03 导航可见性控制 |

> **冲突核查指引**：本模块消费 `useStoryStore.demoMode`（已在 `src/features/story/store.ts` 中定义）。EXP-01 的 `<OrbitControls>` 组件通过 `enabled` prop 控制交互；SIM-03 的 `<NavBar>` 通过条件渲染响应 `demoMode`。均为新增响应式行为，不修改已有字段类型。无冲突。

### 所属模块与溯源

- **对应总设计章节**：功能设计_v0 §六 6.2「演示模式（评审大屏优化）」；功能模块全拆解 §五 STY-02「演示模式」；技术栈设计 §2 #5（R3F + drei OrbitControls）、§4.11（故事模式方案概述）
- **依赖的其他功能模块**：
  - `STY-01`（故事脚本引擎）— 共享 `useStoryStore`，`demoMode` 字段由其 `setDemoMode` action 控制
  - `EXP-01`（3D 仿真场景）— 消费 `demoMode` 以启用自动巡游相机 + 渲染水印署名
  - `SIM-03`（全局导航系统）— 消费 `demoMode` 以隐藏导航栏
  - `SIM-02`（参数控制面板）— 消费 `demoMode` 以隐藏参数面板
  - `SIM-04`（能量实时监控）— 消费 `demoMode` 以隐藏能量曲线
  - `SIM-05`（相空间可视化）— 消费 `demoMode` 以隐藏相空间图
  - `EXP-02`（运动尾迹渲染）— 演示模式下尾迹持久度自动设为 `infinite`
- **被依赖模块**：`STY-01`（通过 `useStoryStore.setDemoMode` 切换）、`SIM-03`（响应 `demoMode` 隐藏导航）

### 已有设计兼容性分析

- **已审查的相关规格文档**：
  - `STY-01-故事脚本引擎.md` v1.0：`useStoryStore` 定义中包含 `isRunning`、`isInterrupted`、`phase` 等字段。本模块新增对 `demoMode` 的消费行为，不修改 STY-01 的脚本执行逻辑
  - `EXP-01-3D仿真场景.md` v1.0：`<OrbitControls>` 组件配置（`enableDamping`、`dampingFactor`、`minDistance`、`maxDistance`）；`CAMERA_PRESETS` 常量表。本模块通过 `autoRotate` 和 `autoRotateSpeed` prop 扩展 OrbitControls 行为
  - `SIM-03-全局导航系统.md` v1.1：`<AppShell>` 布局 + `<NavBar>` 组件。本模块通过条件渲染（`{!demoMode && <NavBar />}`）控制导航栏可见性
- **兼容性结论**：
  - 已有 `useStoryStore`（`src/features/story/store.ts`）已定义 `demoMode: boolean` 和 `setDemoMode(on: boolean)`，本模块在规格层面定义各 UI 模块对其的响应行为
  - EXP-01 的 `<OrbitControls>` 已有 `enabled` prop（控制交互）和 `autoRotate` / `autoRotateSpeed` prop（drei 内置自动旋转），本模块利用已有 prop 无需修改 EXP-01 组件签名
  - 各控制面板和图表的隐藏通过 Zustand selector `useStoryStore(s => s.demoMode)` 在各自组件中条件渲染实现，不修改已有组件的内部逻辑
  - 无冲突
- **复用的已有定义**：`useStoryStore.demoMode`（`src/features/story/store.ts`）、EXP-01 `OrbitControls` 的 `autoRotate`/`autoRotateSpeed` prop（drei 内置）、SIM-03 `NavBar` 的条件渲染模式

### 技术栈绑定

- **必须使用**：
  - `react@^18.3.1` — UI 条件渲染（`{!demoMode && <Panel />}`）
  - `@react-three/drei@^9.114.0` — `<OrbitControls>` 的 `autoRotate`（自动环绕）和 `autoRotateSpeed` prop
  - `@react-three/fiber@^8.17.0` — `useFrame` / `useThree`（获取 camera 实例用于水印世界坐标转换）
  - `zustand@^4.5.5` — `useStoryStore(s => s.demoMode)` selector
  - `tailwindcss@^3.4.16` — 水印样式（`fixed` 定位、`opacity`、`pointer-events-none`）
  - `lucide-react` — 演示模式入口图标（`MonitorPlay` / `Eye` / `EyeOff`）
- **禁止使用**：
  - 禁止在 `demoMode` 下通过 `setInterval` 驱动相机旋转（drei `OrbitControls.autoRotate` 已在内部用 rAF 实现，外部调用会导致双重力矩）
  - 禁止在 `demoMode` 下允许任何用户交互控件响应点击/拖拽（所有面板隐藏后无可见控件，但需确保键盘快捷键也不可触发）
  - 禁止在水印中使用 `<img>` 加载外部图片（自包含约束，水印必须为纯文本 CSS 渲染）
  - 禁止将演示模式的进入/退出按钮放在可能被隐藏的面板中（入口必须常驻可见——推荐放在导航栏右上角或故事模式面板中）

### 输入定义（精确类型）

#### Store 读取

```typescript
// ============================================================
// 本模块从 useStoryStore 读取的唯一字段
// useStoryStore 定义于 src/features/story/store.ts
// ============================================================
interface StoryState {
  /**
   * 演示模式开关。
   * true: 隐藏所有控制面板/图表/导航栏，仅保留 3D 场景 + 水印 + 自动巡游
   * false: 正常交互模式（所有面板可见）
   * 默认：false
   */
  demoMode: boolean;

  /** 切换演示模式 */
  setDemoMode: (on: boolean) => void;
}
```

#### 入口组件 Props

```typescript
/**
 * 演示模式入口按钮 Props。
 * 该按钮常驻于导航栏右上角或故事模式面板中，不受演示模式自身隐藏影响。
 */
interface DemoModeToggleProps {
  /**
   * 按钮在非演示模式下的 CSS 类名。
   * 默认：无附加类名（使用 shadcn/ui Button variant="ghost" size="sm"）
   */
  className?: string;

  /**
   * 是否在按钮上显示文字标签。
   * 桌面：默认 true（显示"演示模式"）
   * 平板/手机：默认 false（仅显示图标）
   */
  showLabel?: boolean;
}
```

#### 自动巡游配置

```typescript
/**
 * 演示模式下相机自动巡游的配置。
 * 模块内部常量，不对外暴露。
 */
interface DemoOrbitConfig {
  /**
   * 自动旋转速度（度/秒）。
   * 功能设计_v0 §六 6.2 规定：0.5°/s
   * 默认：0.5
   */
  autoRotateSpeed: number;

  /**
   * 无人操作超时（毫秒），超时后恢复自动旋转。
   * 功能设计_v0 §六 6.2 隐含要求：用户停止操作后恢复巡游。
   * 默认：5000（5 秒）
   */
  idleTimeoutMs: number;

  /**
   * 垂直旋转角度范围（弧度）。
   * 自动巡游时限制相机俯仰角，避免穿地或翻顶。
   * 默认：[0.2, Math.PI / 2 - 0.1]（约 11° ~ 80°）
   */
  polarAngleRange: [number, number];

  /**
   * 相机到原点的目标距离范围（米）。
   * 自动巡游时在此范围内缓慢呼吸式缩放。
   * 默认：[2.5, 4.5]
   */
  distanceRange: [number, number];

  /**
   * 呼吸式缩放周期（秒）。
   * 相机距离在此周期内从 min 到 max 再回到 min。
   * 默认：120（2 分钟一个周期，缓慢到几乎不可察觉）
   */
  breathingPeriod: number;
}

const DEMO_ORBIT_CONFIG: DemoOrbitConfig = {
  autoRotateSpeed: 0.5,
  idleTimeoutMs: 5000,
  polarAngleRange: [0.2, Math.PI / 2 - 0.1],
  distanceRange: [2.5, 4.5],
  breathingPeriod: 120,
};
```

#### 水印配置

```typescript
/**
 * 水印配置。模块内部常量，不对外暴露。
 */
interface WatermarkConfig {
  /**
   * 水印显示文本。
   * 第 1 行：作品名（中文）
   * 第 2 行：团队名
   * 两行之间用换行符分隔。
   */
  text: string;

  /**
   * 水印在屏幕上的位置。
   * 默认："bottom-right"（右下角）
   */
  position: "bottom-left" | "bottom-right" | "top-left" | "top-right";

  /**
   * 水印文字颜色。
   * 默认："rgba(255, 255, 255, 0.6)"（白色 60% 透明度，适配暗色背景）
   */
  color: string;

  /**
   * 水印文字大小（CSS font-size）。
   * 默认："14px"
   */
  fontSize: string;

  /**
   * 水印字体族。
   * 默认："system-ui, -apple-system, sans-serif"
   */
  fontFamily: string;

  /**
   * 水印与屏幕边缘的间距（CSS padding）。
   * 默认："16px"
   */
  padding: string;
}

const WATERMARK_CONFIG: WatermarkConfig = {
  text: "双摆混沌实验室\nChaos Pendulum Lab",
  position: "bottom-right",
  color: "rgba(255, 255, 255, 0.6)",
  fontSize: "14px",
  fontFamily: "system-ui, -apple-system, sans-serif",
  padding: "16px",
};
```

### 输出定义（精确类型）

本模块为纯 UI 行为模块，无结构化数据输出。其"输出"是应用的视觉呈现变化：

| 变化项 | 正常模式 | 演示模式 | 过渡方式 |
|--------|---------|---------|----------|
| 全局导航栏 (`NavBar`) | 可见 | 隐藏（`display: none` 或条件渲染 `null`） | `opacity` 淡出 300ms 后移除 DOM |
| 参数控制面板 (`ParameterPanel`) | 可见 | 隐藏 | 同上 |
| 能量监控面板 (`EnergyMonitor`) | 可见 | 隐藏 | 同上 |
| 相空间图 (`PhaseSpace`) | 可见 | 隐藏 | 同上 |
| 尾迹持久度 | 用户选择 | 强制 `infinite` | 立即切换（无动画） |
| 3D 场景 (`Scene3D`) | 正常渲染 | 渲染 + 自动巡游 | 巡游在 `demoMode=true` 后延迟 `idleTimeoutMs` 开始 |
| 相机控制 (`OrbitControls`) | 用户可交互 | 自动旋转 (`autoRotate=true`)；用户手动拖拽后暂停巡游，`idleTimeoutMs` 后恢复 | 通过 `OrbitControls` prop 切换 |
| 水印署名 | 不可见 | 3D 场景角落显示（`fixed` 定位 CSS 层） | `opacity` 淡入 500ms |
| 键盘快捷键 | 全部响应 | 仅 `Escape` 键（退出演示模式）响应 | 事件监听器条件过滤 |

### 核心逻辑步骤

#### 步骤 1：演示模式入口

- **操作对象**：`useStoryStore.demoMode`
- **具体操作**：
  1. 渲染 `<DemoModeToggle>` 按钮于导航栏右上角（与故事模式按钮相邻）或故事模式面板中
  2. 按钮使用 `lucide-react` 的 `MonitorPlay` 图标
  3. 点击按钮 → 调用 `useStoryStore.getState().setDemoMode(true)` 或 `setDemoMode(false)` 切换
  4. 按钮在 `demoMode === true` 时切换图标为 `EyeOff`（"退出演示"），文字标签为"退出演示"
  5. 按钮在 `demoMode === false` 时图标为 `Eye`，文字标签为"演示模式"
  6. 按钮自身在演示模式下**必须保持可见**（这是退出演示的唯一入口，不能随面板一同隐藏）。实现方式：
     - 按钮渲染在 3D 场景容器外（`fixed` 定位），不受面板条件渲染影响
     - 在演示模式下按钮降低不透明度至 `opacity-30 hover:opacity-100`，减少视觉干扰
- **输入来源**：用户点击按钮
- **输出去向**：`useStoryStore.setDemoMode(!demoMode)` → 所有消费者响应
- **失败行为**：`useStoryStore` 未初始化 → 按钮无响应（`setDemoMode` 为 noop）

#### 步骤 2：面板隐藏

- **操作对象**：全局导航栏、参数控制面板、能量监控面板、相空间面板、尾迹控制面板
- **具体操作**：
  1. 各面板组件通过 Zustand selector 订阅 `demoMode`：
     ```typescript
     // 每个需要响应演示模式的面板组件中：
     const demoMode = useStoryStore((s) => s.demoMode);
     if (demoMode) return null;  // 直接不渲染
     ```
  2. 为使过渡平滑，可选使用包装组件带 `opacity` 过渡动画：
     ```tsx
     function DemoModeHide({ children }: { children: React.ReactNode }) {
       const demoMode = useStoryStore((s) => s.demoMode);
       return (
         <div className={cn(
           "transition-opacity duration-300",
           demoMode ? "opacity-0 pointer-events-none" : "opacity-100"
         )}>
           {children}
         </div>
       );
     }
     ```
     包装后，面板在 `demoMode=true` 时淡出但不卸载（300ms），之后通过 `onTransitionEnd` 回调设置 `display: none` 以释放资源
  3. 尾迹持久度切换：`demoMode=true` 时在 `useEffect` 中调用 `useExploreStore.getState().setTrailPersistence("infinite")`；`demoMode=false` 时恢复为用户之前的选择（需在进入演示模式前缓存原值）
- **输入来源**：`demoMode` 状态变更
- **输出去向**：各面板 DOM 移除或隐藏
- **失败行为**：面板组件未订阅 `demoMode` → 该面板在演示模式下仍然可见（bug，非 crash）

#### 步骤 3：自动巡游——OrbitControls 集成

- **操作对象**：drei `<OrbitControls>` 组件（在 EXP-01 `Scene3D` 内部渲染）
- **具体操作**：
  1. 在 `Scene3D` 组件（或包装组件）中读取 `demoMode`：
     ```typescript
     const demoMode = useStoryStore((s) => s.demoMode);
     ```
  2. 向 `<OrbitControls>` 传递条件 prop：
     ```tsx
     <OrbitControls
       enableDamping={true}
       dampingFactor={0.08}
       minDistance={0.5}
       maxDistance={10}
       maxPolarAngle={Math.PI}
       // ↓ 演示模式专属 prop
       autoRotate={demoMode}
       autoRotateSpeed={DEMO_ORBIT_CONFIG.autoRotateSpeed}  // 0.5 °/s
       // ↓ 以下为 drei 原生支持的 prop
       enablePan={!demoMode}
       enableZoom={!demoMode}
       // ↓ 极角范围约束
       minPolarAngle={demoMode ? DEMO_ORBIT_CONFIG.polarAngleRange[0] : 0}
       maxPolarAngle={demoMode ? DEMO_ORBIT_CONFIG.polarAngleRange[1] : Math.PI}
     />
     ```
  3. drei `<OrbitControls>` 的 `autoRotate` prop 内部使用 rAF 驱动自动旋转，速度由 `autoRotateSpeed`（度/秒）控制。无需额外实现旋转逻辑
  4. 用户手动拖拽（鼠标/触控）时，drei 自动暂停 `autoRotate`（内置行为）
  5. 为实现"用户停止操作后恢复巡游"，需要检测用户交互空闲：
     ```typescript
     // 在 Scene3D 内部或包装 hook 中：
     const controlsRef = useRef<OrbitControls>(null);
     const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

     function onUserInteraction() {
       if (!demoMode) return;
       // 用户交互时暂停 autoRotate
       if (controlsRef.current) {
         controlsRef.current.autoRotate = false;
       }
       // 清除旧定时器
       if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
       // 设置新定时器：5 秒后恢复 autoRotate
       idleTimerRef.current = setTimeout(() => {
         if (controlsRef.current && demoMode) {
           controlsRef.current.autoRotate = true;
         }
       }, DEMO_ORBIT_CONFIG.idleTimeoutMs);
     }
     ```
     在 `<Canvas>` 上绑定 `onPointerDown`、`onWheel` 事件触发 `onUserInteraction()`
  6. 呼吸式缩放（可选增强 v1.1，v1.0 不强制）：
     通过 `useFrame` 周期性调整 `controlsRef.current.target` 的距离实现缓慢呼吸效果。v1.0 仅要求固定 `autoRotateSpeed = 0.5`
- **输入来源**：`demoMode` 状态 + 用户交互事件（pointerdown、wheel）
- **输出去向**：`OrbitControls.autoRotate`、`OrbitControls.autoRotateSpeed`、`OrbitControls.enablePan`、`OrbitControls.enableZoom`
- **失败行为**：`controlsRef.current` 为 null（OrbitControls 未挂载）→ 静默跳过

#### 步骤 4：水印署名

- **操作对象**：一个 `fixed` 定位的 `<div>` 覆盖在 3D 场景上方
- **具体操作**：
  1. 渲染水印组件：
     ```tsx
     function DemoWatermark() {
       const demoMode = useStoryStore((s) => s.demoMode);

       return (
         <div
           className={cn(
             "fixed z-30 pointer-events-none select-none",
             "transition-opacity duration-500",
             demoMode ? "opacity-100" : "opacity-0",
           )}
           style={{
             [WATERMARK_CONFIG.position.includes("bottom") ? "bottom" : "top"]: WATERMARK_CONFIG.padding,
             [WATERMARK_CONFIG.position.includes("right") ? "right" : "left"]: WATERMARK_CONFIG.padding,
           }}
         >
           <p
             style={{
               color: WATERMARK_CONFIG.color,
               fontSize: WATERMARK_CONFIG.fontSize,
               fontFamily: WATERMARK_CONFIG.fontFamily,
               textAlign: WATERMARK_CONFIG.position.includes("right") ? "right" : "left",
               lineHeight: "1.5",
               whiteSpace: "pre-line",  // 支持 \n 换行
               textShadow: "0 1px 4px rgba(0,0,0,0.5)",  // 暗色背景下的可读性保障
             }}
           >
             {WATERMARK_CONFIG.text}
           </p>
         </div>
       );
     }
     ```
  2. 水印渲染在 3D Canvas 上方（`z-30`），但不拦截任何鼠标/触控事件（`pointer-events-none`）
  3. `demoMode=true` 时水印以 500ms 淡入动画显示；`demoMode=false` 时淡出
  4. 水印文本内容从 `WATERMARK_CONFIG.text` 常量读取（可在 `src/features/story/` 中集中管理）
- **输入来源**：`demoMode` 状态 + `WATERMARK_CONFIG` 常量
- **输出去向**：3D 场景角落的固定文本覆盖层
- **失败行为**：无（纯 CSS 渲染，无运行时失败路径）

#### 步骤 5：退出演示模式

- **操作对象**：`demoMode` → `false`
- **具体操作**：
  1. 用户可通过以下方式退出演示模式：
     - 点击角落的"退出演示"按钮（步骤 1 的 `<DemoModeToggle>`）
     - 按下键盘 `Escape` 键
  2. `Escape` 键处理：
     ```typescript
     // 在 App.tsx 或故事模式相关组件中：
     useEffect(() => {
       if (!demoMode) return;
       const handler = (e: KeyboardEvent) => {
         if (e.key === "Escape") {
           useStoryStore.getState().setDemoMode(false);
         }
       };
       window.addEventListener("keydown", handler);
       return () => window.removeEventListener("keydown", handler);
     }, [demoMode]);
     ```
  3. 退出时恢复尾迹持久度为进入前的值（从缓存中读取，步骤 2 中保存的）
  4. 所有面板以 300ms 淡入动画恢复显示
  5. 水印 500ms 淡出消失
  6. `OrbitControls` 恢复用户交互模式（`autoRotate=false`、`enablePan=true`、`enableZoom=true`）
- **输入来源**：用户点击退出按钮 或 按下 `Escape` 键
- **输出去向**：`setDemoMode(false)` → 全部消费者恢复
- **失败行为**：`Escape` 键被浏览器拦截（如全屏退出）→ 浏览器优先处理，不影响功能（用户可用按钮退出）

#### 步骤 6：键盘快捷键统一管控

- **操作对象**：应用全局键盘事件监听
- **具体操作**：
  1. 演示模式下，除 `Escape` 键外，所有其他键盘快捷键必须被禁用：
     - SIM-03 的模式切换快捷键（`1`/`2`/`3`/`4`）
     - 空格键暂停/播放
     - INF-01 的调试面板快捷键（`Ctrl+Shift+D`）
     - 其他可能干扰演示画面的快捷键
  2. 实现方式：在全局键盘事件处理最顶层检查 `demoMode`：
     ```typescript
     // 在全局 keydown 处理器中：
     if (useStoryStore.getState().demoMode && e.key !== "Escape") {
       return;  // 忽略非 Escape 的所有按键
     }
     ```
  3. 此检查应在所有其他快捷键处理器之前执行（在事件传播的捕获阶段或全局处理器的最外层）
- **输入来源**：`demoMode` 状态 + 键盘事件
- **输出去向**：阻止或允许键盘事件传播
- **失败行为**：全局处理器未正确提前返回 → 演示模式下仍可切换模式（bug，非 crash）

### 依赖与集成接口

#### 本模块对外暴露的公共接口

| 导出项 | 位置 | 用途 |
|--------|------|------|
| `DemoModeToggle` | `src/features/story/components/DemoModeToggle.tsx` | 演示模式入口/退出按钮组件 |
| `DemoWatermark` | `src/features/story/components/DemoWatermark.tsx` | 水印署名覆盖层组件 |
| `DEMO_ORBIT_CONFIG` | `src/features/story/config.ts` | 自动巡游配置常量（供 EXP-01 导入） |
| `WATERMARK_CONFIG` | `src/features/story/config.ts` | 水印配置常量 |

#### 其他模块对本模块的消费方式

| 消费方模块 | 消费方式 | 响应行为 |
|-----------|---------|----------|
| SIM-03 全局导航 | `const demoMode = useStoryStore(s => s.demoMode); if (demoMode) return null;` | 导航栏隐藏 |
| SIM-02 参数控制面板 | 同上 | 参数面板隐藏 |
| SIM-04 能量监控 | 同上 | 能量图表面板隐藏 |
| SIM-05 相空间可视化 | 同上 | 相空间面板隐藏 |
| EXP-01 3D 场景 | 导入 `DEMO_ORBIT_CONFIG`；读取 `demoMode` 切换 OrbitControls props | 自动巡游启用；缩放/平移禁用；极角范围限制 |
| EXP-01 3D 场景 | 渲染 `<DemoWatermark />` 于 Canvas 上方 | 水印显示 |
| EXP-02 尾迹渲染 | `useEffect(() => { if (demoMode) setPersistence("infinite"); }, [demoMode])` | 尾迹持久度切换 |
| App.tsx 键盘 | 全局 keydown 处理中检查 `demoMode` | 非 Escape 键全部拦截 |

#### 本模块对外部接口的依赖

| 依赖方 | 具体接口 | 用途 |
|--------|----------|------|
| `useStoryStore` | `(s) => s.demoMode` (selector) | 读取演示模式状态 |
| `useStoryStore` | `getState().setDemoMode(on)` | 切换演示模式 |
| `useExploreStore` | `getState().setTrailPersistence(mode)` | 演示模式下强制无限尾迹 |
| drei `<OrbitControls>` | `autoRotate`, `autoRotateSpeed`, `enablePan`, `enableZoom`, `minPolarAngle`, `maxPolarAngle` props | 自动巡游 + 交互禁用 |

### 状态机

演示模式的状态机（独立于 STY-01 的脚本状态机。两个状态机可同时运行：故事播放 + 演示模式可共存）：

| 当前状态 | 触发事件 | 下一状态 | 前置条件 | 副作用 |
|----------|----------|----------|----------|--------|
| `normal` | 用户点击"演示模式"按钮 | `demo` | — | `demoMode = true`；面板淡出隐藏；尾迹切换为 `infinite`；水印淡入；自动巡游在 `idleTimeoutMs` 后启动 |
| `demo` | 用户点击"退出演示"按钮 | `normal` | — | `demoMode = false`；面板淡入恢复；尾迹恢复之前值；水印淡出；自动巡游停止；OrbitControls 恢复交互 |
| `demo` | 用户按下 `Escape` 键 | `normal` | — | 同上 |
| `demo` | 自动巡游中用户拖拽相机 | `demo` (autoRotate 暂停) | `autoRotate === true` | `autoRotate = false`（用户手动控制）；启动 5 秒空闲计时器 |
| `demo` (autoRotate 暂停) | 5 秒无交互 | `demo` (autoRotate 恢复) | `demoMode === true` | `autoRotate = true` |
| `demo` | 用户手动结束（点击按钮 or Escape）→ 恢复交互 | `normal` | — | 恢复前自动清理空闲计时器 |

### 异常与边界条件

#### 异常 1：演示模式下浏览器窗口失去焦点

- **触发条件**：用户在演示模式运行期间切换浏览器标签页或最小化窗口
- **处理策略**：
  1. `document.visibilitychange` 事件：页面不可见时 → `OrbitControls.autoRotate = false`（节省 GPU）
  2. 页面恢复可见时 → 立即恢复 `autoRotate = true`（无需等待空闲计时器）
  3. 尾迹、面板状态不受影响
  4. 不暂停仿真（Worker 继续运行，切回时画面追赶上）
- **重试参数**：自动恢复

#### 异常 2：设备为移动端时启用演示模式

- **触发条件**：`deviceType === "mobile"` 且 `demoMode === true`
- **处理策略**：
  1. 移动端 3D 性能已降级（无阴影、低分段数），自动巡游的额外 GPU 开销可忽略（OrbitControls 仅改变 camera 矩阵，不增加 draw call）
  2. 面板在移动端本就为折叠/抽屉模式，隐藏逻辑相同
  3. 水印在移动端字体缩小为 `12px`、padding 减小为 `8px`（响应式适配）
  4. 不禁止移动端演示——但建议在入口按钮的 Tooltip 中提示"推荐在桌面端使用演示模式"
- **重试参数**：不适用

#### 异常 3：演示模式下 OrbitControls ref 意外为 null

- **触发条件**：`demoMode=true` 时 `controlsRef.current` 为 null（OrbitControls 因组件卸载/重挂载暂不可用，如模式切换导致 3D 场景重建）
- **处理策略**：
  1. 所有对 `controlsRef.current` 的访问前做 null 检查
  2. 若为 null，跳过本次操作（不报错）
  3. 在 `useEffect` 中监听 `controlsRef.current` 变为可用（通过 `requestAnimationFrame` 轮询一次），然后自动应用 `autoRotate=true`
- **重试参数**：静默等待，下次 rAF 重试

#### 异常 4：尾迹持久度缓存缺失

- **触发条件**：进入 `demoMode` 时缓存原尾迹持久度值失败（如 store 字段未初始化）
- **处理策略**：
  1. 进入演示模式前保存：`const cachedPersistence = useExploreStore.getState().trailPersistence`
  2. 若 `cachedPersistence` 为 `undefined` 或 null，默认退出时设为 `"medium"`（200 步）
  3. 退出时恢复：`useExploreStore.getState().setTrailPersistence(cachedPersistence ?? "medium")`
- **重试参数**：不重试，使用默认值退避

### 原则兑现清单

| 原则来源 | 原则名称 | 代码级约束 |
|----------|----------|------------|
| 功能设计_v0 §六 6.2 | 纯净视图 | `demoMode=true` 时所有面板组件返回 `null`（或 `display: none`），仅保留 3D Canvas + 水印 |
| 功能设计_v0 §六 6.2 | 自动巡游 | 利用 drei `OrbitControls.autoRotate=true` + `autoRotateSpeed=0.5` 实现 0.5°/s 自动环绕；用户拖拽暂停，5 秒空闲后恢复 |
| 功能设计_v0 §六 6.2 | 水印署名 | 3D 场景角落 `fixed` 定位 CSS 文本"双摆混沌实验室 / Chaos Pendulum Lab"，`pointer-events-none` |
| 通用原则 | 逻辑与表现分离 | 相机巡游逻辑封装在 hook `useDemoOrbit` 中；水印为独立无逻辑组件 `DemoWatermark`；面板隐藏通过 selector 条件渲染 |
| AGENT.md 核心原则 | 保持真实代码纯净 | 不使用 mock 水印数据；`WATERMARK_CONFIG.text` 为最终作品名/团队名常量 |

### 验收测试场景

#### 正向测试 1：进入演示模式——全屏纯净视图

- **Given**：应用在探索模式下正常运行，导航栏可见，参数面板可见，能量监控可见，`demoMode === false`
- **When**：用户点击导航栏上的"演示模式"按钮（`<DemoModeToggle>`）
- **Then**：
  - 全局导航栏以 300ms 淡出动画消失
  - 参数控制面板消失
  - 能量监控面板消失
  - 相空间面板消失
  - 3D 场景保持运行（摆体继续运动）
  - 尾迹持久度自动切换为 `infinite`（已有尾迹不消失）
  - 屏幕右下角显示水印"双摆混沌实验室 / Chaos Pendulum Lab"
  - 5 秒后相机开始以约 0.5°/s 速度自动水平旋转
  - 除 `Escape` 键外，按 `1`/`2`/`3`/`4` 不切换模式
  - 按钮图标变为 `EyeOff`，标签变为"退出演示"

#### 正向测试 2：退出演示模式——恢复全部面板

- **Given**：应用在演示模式下运行（`demoMode === true`），所有面板隐藏，水印显示，相机自动巡游中
- **When**：用户按下 `Escape` 键
- **Then**：
  - 所有面板以 300ms 淡入动画恢复显示
  - 水印 500ms 淡出消失
  - 相机自动巡游停止，恢复用户可交互（可拖拽/缩放/平移）
  - 尾迹持久度恢复为进入演示模式前的值
  - 导航栏按钮恢复响应（`1`/`2`/`3`/`4` 可切换模式）
  - `demoMode === false`

#### 正向测试 3：演示模式中用户交互暂停巡游后自动恢复

- **Given**：应用在演示模式下运行，相机正在自动巡游
- **When**：用户用鼠标拖拽 3D 场景旋转到新的角度，然后停止操作（鼠标松开后不再触碰）
- **Then**：
  - 拖拽时自动旋转暂停（OrbitControls 的 `autoRotate` 自动变为 `false`）
  - 用户松开鼠标后，相机保持在新的角度
  - 5 秒后自动旋转恢复（相机从当前角度继续巡游）
  - 水印和面板状态不变

#### 异常测试 1：演示模式下按非 Escape 键无效

- **Given**：应用在演示模式下运行
- **When**：依次按下 `1`（探索模式快捷键）、`2`（分析模式快捷键）、`Ctrl+Shift+D`（调试面板）
- **Then**：
  - 模式不切换，仍在当前模式
  - 调试面板不打开
  - 3D 场景和水印持续显示
  - 控制台无新增错误

#### 异常测试 2：浏览器失去焦点后恢复演示模式

- **Given**：应用在演示模式下运行，相机自动巡游中
- **When**：用户切换到其他浏览器标签页（页面变为不可见），10 秒后切回
- **Then**：
  - 切回时 3D 场景立即恢复（仿真追赶）
  - 相机自动巡游立即恢复（不等待 5 秒空闲计时器）
  - 水印保持显示
  - 面板保持隐藏
  - 无控制台错误

### 注意事项与禁止行为

1. **【入口按钮必须常驻】** 演示模式的进入/退出按钮不可渲染在任何会被 `demoMode` 隐藏的面板中。按钮必须以 `fixed` 定位渲染在 3D 场景容器外，或作为 `<DemoModeToggle>` 组件在 `AppShell` 层渲染（与 `<NavBar>` 同级）。进入演示模式后这是用户唯一的退出路径（除 `Escape` 键外）。

2. **【Escape 键优先级】** 演示模式下 `Escape` 键仅用于退出演示模式。若有其他功能也绑定 `Escape`（如关闭对话框/全屏退出），在演示模式下必须被拦截。全局键盘事件处理器中，`demoMode && e.key === "Escape"` 的判断必须最先执行并调用 `e.preventDefault()` + `e.stopPropagation()`。

3. **【autoRotate 而非自定义旋转】** 必须使用 drei `<OrbitControls>` 内置的 `autoRotate` prop 实现自动巡游。禁止在 `useFrame` 中手动修改 `camera.position` 或 `controls.target` 模拟旋转——drei 的 `autoRotate` 内部正确处理了阻尼、极角限制、用户交互打断等边界条件。

4. **【尾迹持久度缓存】** 进入演示模式前必须缓存当前尾迹持久度值（从 `useExploreStore.trailPersistence` 读取并存储在组件 ref 或局部变量中）。退出演示模式时必须恢复该值。若缓存为空（意外情况），回退默认值为 `"medium"`。

5. **【水印不拦截交互】** `DemoWatermark` 组件必须设置 `pointer-events: none`，确保水印下方的 3D 场景仍可响应用户拖拽（在用户手动操作时）。

6. **【禁止在演示模式下发送 Worker 控制命令】** 演示模式仅改变 UI 的可见性和相机行为，不得向 Worker 发送任何 pause/resume/step/updateParams 命令。仿真在演示模式下应持续运行，与正常模式无异。

7. **【OrbitControls prop 切换而非重建】** 通过修改 `<OrbitControls>` 的 prop（`autoRotate`、`enablePan` 等）切换模式，而非在 `demoMode` 变化时卸载并重建 `<OrbitControls>` 组件。重建会导致相机位置跳变和用户旋转状态丢失。

8. **【呼吸式缩放为可选增强】** 设计文档仅规定 `autoRotateSpeed = 0.5°/s`。呼吸式缩放（距离周期性变化）是锦上添花效果，v1.0 不强制。若实现，周期至少 60 秒以避免分散注意力。

9. **【易错点】** drei `OrbitControls.autoRotateSpeed` 的单位是**度/秒**（不是弧度/秒）。配置值为 `0.5` 时，绕场景一周（360°）需 720 秒（12 分钟），符合"缓慢环绕"的设计意图。
