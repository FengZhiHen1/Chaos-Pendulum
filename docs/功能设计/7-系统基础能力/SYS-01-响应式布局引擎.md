# 功能点：SYS-01 响应式布局引擎

> **文档生成时间**：2026-04-28 21:18:07 CST
> **版本记录**：
> | 版本 | 时间 | 修改人 | 变更摘要 |
> |------|------|--------|----------|
> | v1.0 | 2026-04-28 21:18:07 | AI Assistant | 初始版本，对齐 useAppStore 已有 deviceType 约定与各消费模块接口 |

> **冲突核查指引**：本模块是 `deviceType` 的**唯一生产者**（写入 `useAppStore`）。所有其他模块（SIM-02、SIM-03、EXP-01、EXP-02、EXP-03、EXP-04、LAB-03 等）仅为消费者。若本模块的断点阈值或 DeviceType 枚举值变更，需同步评估所有消费模块的降级逻辑。

### 所属模块与溯源

- **对应总设计章节**：功能设计_v0 §八「响应式与跨端策略」；技术栈设计 §2 #17（ResizeObserver + R3F 内置 resize）、§6「响应式策略」（4 级断点与功能降级表）；项目结构设计 §4.9 `shared/hooks/`（useDeviceType、useContainerSize）
- **依赖的其他功能模块**：无（本模块为系统基础能力层的最底层，不依赖任何其他功能模块）
- **被依赖模块**：
  - `SIM-02`（参数控制面板）— 消费 `deviceType` 决定控制面板布局（桌面侧栏 / 平板底部抽屉 / 手机折叠菜单）
  - `SIM-03`（全局导航系统）— 消费 `deviceType` 决定导航栏位置与样式（顶部 tabs / 底部 tab bar / 紧凑图标栏）
  - `EXP-01`（3D 仿真场景）— 消费 `deviceType` 决定渲染降级（阴影开关、几何细节等级）
  - `EXP-02`（运动尾迹渲染）— 消费 `deviceType` 决定尾迹长度降级与尾迹粗细
  - `EXP-03`（声音化引擎）— 消费 `deviceType` 决定是否禁用声音化（平板/手机关闭）
  - `EXP-04`（蝴蝶效应对比器）— 消费 `deviceType` 决定双视口布局（桌面左右并排 / 平板上下堆叠 / 手机仅显示主视口）
  - `LAB-03`（用户可编程沙箱）— 消费 `deviceType` 决定是否禁用编程编辑器（手机禁用）
  - `ANL-01`~`ANL-04`（分析模式各图表）— 消费 `useContainerSize` hook 返回的容器尺寸做 Canvas 自适应
  - 所有 2D Canvas 图表组件 — 消费 `useContainerSize` hook 做高 DPI 缩放

### 已有设计兼容性分析

- **已审查的相关规格文档**：
  - `SIM-01-双摆物理引擎.md` v2.1：无直接引用 `deviceType`，无冲突
  - `SIM-02-参数控制面板.md` v1.1：消费 `useAppStore().deviceType` 用于响应式布局，`deviceType` 字段名和 `"desktop" | "tablet" | "mobile"` 三值枚举与其引用一致
  - `SIM-03-全局导航系统.md` v1.1：依赖 SYS-01 提供 `deviceType`（写入 `useAppStore`），本模块作为该字段的唯一生产者对齐此依赖方向；SIM-03 中定义的 `deviceType` 字段声明（`src/stores/useAppStore.ts` 第 121 行）与本模块输出完全一致
  - `EXP-01-3D仿真场景.md` v1.0：消费 `useAppStore((s) => s.deviceType)` 用于渲染降级，消费方式与 `useDeviceType` hook 并存不冲突
  - `EXP-02-运动尾迹渲染.md`：消费 `useAppStore((s) => s.deviceType)` 用于尾迹降级
  - `双摆混沌实验室-技术栈设计.md` v1.2：§6 定义 4 级断点（1920+ / 1366-1920 / 768-1366 / <768）与功能降级表；本模块的 3 值 DeviceType 将 notebook 合并入 desktop（通过 `deviceType` 三值 + 额外 `isCompact` 布尔值区分桌面内部二级），保持与已有消费模块的类型兼容
  - `双摆混沌实验室-项目结构.md` v1.0：`useAppStore` 的 `deviceType` 字段、`shared/hooks/useDeviceType.ts` 和 `shared/hooks/useContainerSize.ts` 的位置与本模块设计一致
- **兼容性结论**：
  - 无冲突。本模块是 `deviceType` 的**唯一写入者**，所有已有消费模块（SIM-02、SIM-03、EXP-01、EXP-02）的 selector 均为只读，不受本模块检测逻辑变更影响（Zustand selector 粒度隔离）
  - `DeviceType` 三值枚举 `"desktop" | "tablet" | "mobile"` 与所有已有模块的 TypeScript 类型注解一致，不新增枚举值（保持向后兼容）
  - 技术栈文档 §6 的 4 级断点与本模块 3 值 DeviceType 的差异通过 `useDeviceType` hook 内部映射处理：`>= 1920` → `desktop`（`isCompact: false`），`1366-1920` → `desktop`（`isCompact: true`），`768-1366` → `tablet`，`< 768` → `mobile`。消费模块无需感知 `isCompact` 细节（仅需要时通过 `useDeviceType()` 返回值的额外字段获取）
- **复用的已有定义**：
  - `useAppStore` 的 `deviceType` 字段（类型 `"desktop" | "tablet" | "mobile"`，由 SIM-02/SIM-03/EXP-01 已确立的消费约定）
  - `useAppStore` 的 store 实例（`src/stores/useAppStore.ts`）

### 技术栈绑定

- **必须使用**：
  - `react@^18.3.1` — `useSyncExternalStore` 用于订阅 ResizeObserver（确保与 React 并发模式兼容）
  - `zustand@^4.5.5` — `useAppStore` 的 `deviceType` 字段写入（`useAppStore.setState({ deviceType })`）
  - `tailwindcss@^3.4.16` — 响应式断点类（`lg:` / `md:` / `sm:`前缀）用于布局容器；`screens` 配置与 DeviceType 阈值一致
  - `ResizeObserver`（浏览器原生 API，无 polyfill）— 监听视口/容器尺寸变化
  - `window.matchMedia`（浏览器原生 API）— 辅助检测（CSS 媒体查询与 JS 逻辑同步，作为 ResizeObserver 的补充，用于检测 `prefers-reduced-motion` 等非尺寸类媒体特性）
  - TypeScript 5.x — 类型安全
- **禁止使用**：
  - 禁止使用 `window.innerWidth` 轮询（`setInterval` 或 `requestAnimationFrame` 持续读取）替代 ResizeObserver（轮询消耗 CPU，且无法感知容器级尺寸变化）
  - 禁止使用 CSS `@media` 查询在 JS 中重复定义断点值（断点阈值必须在单一源（`BREAKPOINTS` 常量）中定义，CSS 的 `tailwind.config.ts` 从同一常量导出）
  - 禁止多个组件各自独立检测设备类型（所有组件必须通过 `useAppStore().deviceType` 或 `useDeviceType()` hook 读取，确保全局唯一数据源）
  - 禁止在服务端渲染（SSR）场景中使用本模块的 hook（初始默认值为 `"desktop"` 并在客户端首次渲染后通过 ResizeObserver 更新；本项目无 SSR，但 hooks 中不引用 `window` 以外的 DOM API 以保持可测试性）
  - 禁止在 `useDeviceType` 中使用 `debounce` 库（如 lodash.debounce）。使用 `useRef` + `setTimeout` 自实现，保持零外部依赖

### 输入定义（精确类型）

#### 1. 断点配置常量（`src/shared/hooks/useDeviceType.ts`）

```typescript
/**
 * 响应式断点阈值（单位：像素）。
 * 与 tailwind.config.ts 的 screens 配置严格同步。
 *
 * 阈值取值依据：
 * - 1920：标准桌面显示器（Full HD），三栏布局完整展开
 * - 1366：常见笔记本分辨率（1366×768），两栏布局
 * - 768：平板竖屏最小宽度（iPad mini），单栏布局
 *
 * ⚠️ 修改此常量时，必须同步修改 tailwind.config.ts 的 screens 字段。
 */
const BREAKPOINTS = {
  /** 桌面宽敞布局阈值（≥ 1920px）。完整三栏 + 全功能。 */
  DESKTOP_WIDE: 1920,
  /** 桌面紧凑布局阈值（≥ 1366px）。两栏 + 图表标签页切换。 */
  DESKTOP_COMPACT: 1366,
  /** 平板布局阈值（≥ 768px）。单栏 + 底部抽屉面板。 */
  TABLET: 768,
  // 低于 768px → 手机布局
} as const;
```

#### 2. 设备类型枚举（`src/shared/types/app.ts`）

```typescript
/**
 * 设备类型。
 * 三值枚举：desktop（桌面/笔记本）/ tablet（平板）/ mobile（手机）。
 *
 * 该类型已存在于 useAppStore 中（由 SIM-02/SIM-03/EXP-01 确立），
 * 本模块仅引用，不重新定义。
 */
type DeviceType = "desktop" | "tablet" | "mobile";
```

#### 3. useDeviceType Hook 返回值类型

```typescript
/**
 * useDeviceType() 的返回值。
 * 供需要感知设备能力的组件消费。
 */
interface DeviceInfo {
  /**
   * 设备类型（三值）。
   * 桌面（≥ 1366px）/ 平板（≥ 768px 且 < 1366px）/ 手机（< 768px）。
   * 该值与 useAppStore().deviceType 始终一致。
   */
  deviceType: DeviceType;

  /**
   * 是否为桌面端（含宽敞桌面 1920+ 和紧凑桌面 1366-1920）。
   * 等价于 deviceType === "desktop"。
   * 用途：条件渲染桌面专有功能（如蝴蝶效应双视口并排）。
   */
  isDesktop: boolean;

  /**
   * 是否为桌面宽敞布局（≥ 1920px）。
   * 在 deviceType === "desktop" 的前提下进一步区分。
   * 用途：决定是否渲染第三栏（右侧图表面板）。
   * 为 false 时（1366-1920），图表以标签页切换而非三栏并排。
   */
  isWide: boolean;

  /**
   * 是否为平板端。
   * 等价于 deviceType === "tablet"。
   * 用途：决定是否关闭声音化、降低尾迹长度。
   */
  isTablet: boolean;

  /**
   * 是否为手机端。
   * 等价于 deviceType === "mobile"。
   * 用途：决定是否禁用阴影、尾迹、编程编辑器、分析模式。
   */
  isMobile: boolean;

  /**
   * 当前视口宽度（像素），精确到整数。
   * 用途：Canvas 组件根据此值计算渲染分辨率。
   */
  viewportWidth: number;

  /**
   * 当前视口高度（像素），精确到整数。
   * 用途：全屏 3D Canvas 的高度计算。
   */
  viewportHeight: number;

  /**
   * 设备像素比（window.devicePixelRatio 或 1）。
   * 用途：Canvas 2D 的高 DPI 缩放（Canvas 物理像素 = CSS 像素 × dpr）。
   * 在 window.devicePixelRatio 不可用时降级为 1。
   */
  dpr: number;
}
```

#### 4. useContainerSize Hook 输入/输出类型

```typescript
/**
 * useContainerSize hook 的输入参数。
 */
interface UseContainerSizeOptions {
  /**
   * 容器的 Ref 对象。
   * 必填：调用方通过 ref={containerRef} 绑定目标 DOM 元素。
   * 示例：const containerRef = useRef<HTMLDivElement>(null);
   */
  ref: React.RefObject<HTMLElement | null>;

  /**
   * 去抖动延迟（毫秒）。
   * 默认值：150（ms）。在拖拽窗口边缘快速 resize 时防止 Canvas 频繁重绘。
   * 设为 0 表示实时响应（用于 3D Canvas，R3F 内部已做 throttle）。
   * 约束：>= 0，<= 500。
   */
  debounceMs?: number;

  /**
   * 是否启用（默认 true）。
   * 设为 false 时 hook 不创建 ResizeObserver（用于条件性禁用，节省资源）。
   * 示例：组件卸载或 display: none 时设为 false。
   */
  enabled?: boolean;
}

/**
 * useContainerSize hook 的返回值。
 * 供 2D Canvas 图表组件（ANL-01~04、SIM-05）和 3D Canvas 父容器使用。
 */
interface ContainerSize {
  /**
   * 容器内容宽度（像素），精确到小数点后 2 位。
   * 值为 0 表示容器尚未挂载或尺寸为 0。
   * 示例：800.00
   */
  width: number;

  /**
   * 容器内容高度（像素），精确到小数点后 2 位。
   * 值为 0 表示容器尚未挂载或尺寸为 0。
   * 示例：600.00
   */
  height: number;

  /**
   * 容器是否已挂载且尺寸有效（width > 0 且 height > 0）。
   * Canvas 组件应在 ready 为 true 之后才执行首次绘制。
   * 为 false 时 Canvas 保持空白或显示骨架屏。
   */
  ready: boolean;
}
```

#### 5. 功能降级规则表类型

```typescript
/**
 * 各设备类型下的功能降级规则。
 * 由 SYS-01 定义，由各功能模块自行读取并执行降级。
 * 不强制降级（模块可根据自身逻辑覆盖），仅提供默认策略。
 */
interface DegradationRules {
  /**
   * 3D 阴影是否启用。
   * desktop: true（完整阴影）/ tablet: false / mobile: false
   */
  enable3DShadows: boolean;

  /**
   * 尾迹最大长度（步数）。
   * desktop: 1000（长）/ tablet: 200（中）/ mobile: 0（关闭）
   */
  maxTrailLength: number;

  /**
   * 尾迹是否启用。
   * desktop: true / tablet: true / mobile: false
   */
  enableTrail: boolean;

  /**
   * 声音化是否启用。
   * desktop: true / tablet: false / mobile: false
   */
  enableSonification: boolean;

  /**
   * 用户编程编辑器是否启用。
   * desktop: true / tablet: true / mobile: false
   */
  enableCodeEditor: boolean;

  /**
   * 预计算数据是否允许加载（网络/内存考量）。
   * desktop: true / tablet: true / mobile: false（仅实时仿真）
   */
  enablePrecomputedData: boolean;

  /**
   * 分析模式高级图表是否可用。
   * desktop: true / tablet: true / mobile: false（仅保留探索模式）
   */
  enableAdvancedAnalysis: boolean;
}
```

### 输出定义（精确类型）

#### 1. useAppStore 中写入的字段

```typescript
/**
 * 本模块在 useAppStore 中写入以下字段（仅写入 deviceType，不新增字段）：
 *
 * deviceType: DeviceType
 *   - 由本模块的 ResizeObserver 回调更新
 *   - 初始值："desktop"（首次渲染前的安全默认值）
 *   - 更新时机：视口尺寸跨越断点阈值时（如从 1920 缩小至 1365 → desktop → tablet）
 *   - 更新方式：useAppStore.setState({ deviceType: newType })
 *   - 去抖动：150ms（调用方若要即时获取，可使用 useDeviceType() 的 viewportWidth 自行判断）
 *
 * 注意：本模块不修改 useAppStore 的其他字段（activeMode、loadingState、debugInfo）。
 */

/** 本模块在 useAppStore 中仅写入的字段（不新增 store 字段，复用已有 deviceType） */
interface Sys01StoreWrite {
  deviceType: DeviceType;  // ← 已有字段，本模块是唯一写入者
}
```

#### 2. 导出的公共接口

```typescript
/**
 * 从 src/shared/hooks/useDeviceType.ts 导出：
 */
export { useDeviceType } from "./useDeviceType";
// useDeviceType 返回 DeviceInfo（见输入定义 §3）

/**
 * 从 src/shared/hooks/useContainerSize.ts 导出：
 */
export { useContainerSize } from "./useContainerSize";
// useContainerSize 返回 ContainerSize（见输入定义 §4）

/**
 * 从 src/shared/hooks/useDeviceType.ts 导出（供 tailwind.config.ts 使用）：
 */
export { BREAKPOINTS } from "./useDeviceType";
// BREAKPOINTS: { DESKTOP_WIDE: 1920, DESKTOP_COMPACT: 1366, TABLET: 768 }

/**
 * 从 src/shared/hooks/useDeviceType.ts 导出（供各模块获取降级规则）：
 */
export { getDegradationRules } from "./useDeviceType";
// getDegradationRules(deviceType: DeviceType): DegradationRules
// 根据给定的 deviceType 返回对应的降级规则对象（纯函数，无副作用）
```

#### 3. Tailwind CSS screens 配置（tailwind.config.ts 中）

```typescript
/**
 * tailwind.config.ts 的 theme.extend.screens 字段。
 * 与 BREAKPOINTS 常量严格同步。
 *
 * 使用示例（在组件中）：
 *   className="lg:grid-cols-3 md:grid-cols-2"  // 桌面三栏 / 笔记本两栏
 *   className="md:flex hidden"                    // 平板及以上显示
 *   className="sm:block hidden"                   // 手机及以上显示
 */
const tailwindScreens = {
  /** 手机端（≥ 640px 视为小屏手机横屏，实际手机布局在 < 768px 触发） */
  sm: "640px",
  /** 平板端（≥ 768px） */
  md: "768px",
  /** 桌面紧凑端（≥ 1366px） */
  lg: "1366px",
  /** 桌面宽敞端（≥ 1920px） */
  xl: "1920px",
} as const;
```

本模块在 Tailwind 中不额外定义 CSS 类——所有响应式布局通过 Tailwind 的 `sm:` / `md:` / `lg:` / `xl:` 前缀实现，各消费组件的 className 中直接使用这些前缀。

### 核心逻辑步骤

#### 阶段 A：useDeviceType Hook 初始化与检测

**步骤 1：初始化默认值**

- **操作对象**：`useAppStore` 的 `deviceType` 字段和 hook 内部的 `DeviceInfo` state
- **具体操作**：
  1. Hook 挂载时，检查 `useAppStore.getState().deviceType` 的当前值
  2. 若为有效值（`"desktop"` / `"tablet"` / `"mobile"` 之一）→ 以此值初始化内部 `deviceType` state
  3. 若为无效值（undefined 或非法字符串，极端情况如 store 未初始化）→ 以 `"desktop"` 为默认值，同时调用 `useAppStore.setState({ deviceType: "desktop" })` 修复 store
  4. 同步计算初始 `DeviceInfo`：`viewportWidth = window.innerWidth`，`viewportHeight = window.innerHeight`，`dpr = window.devicePixelRatio || 1`，`deviceType` 从 store 获取
- **输入来源**：`useAppStore.getState().deviceType`（首次读取时可能为 Zustand 的初始值 `"desktop"`）
- **输出去向**：hook 内部的 `useState<DeviceInfo>` 初始值；`useAppStore` 的 `deviceType`（仅在 store 值非法时写入修复）
- **失败行为**：若 `window` 对象不可用（SSR/Jest 环境，`typeof window === "undefined"`）→ 返回固定的 fallback 值：`{ deviceType: "desktop", isDesktop: true, isWide: true, isTablet: false, isMobile: false, viewportWidth: 1920, viewportHeight: 1080, dpr: 1 }`，不尝试访问 `window` 属性（避免 ReferenceError）

**步骤 2：创建 ResizeObserver 监听视口尺寸**

- **操作对象**：`document.documentElement`（`<html>` 元素，代表视口尺寸）
- **具体操作**：
  1. 创建 `ResizeObserver` 实例，回调函数为 `handleViewportResize`
  2. 观察目标：`document.documentElement`（视口级的尺寸变化）
  3. 在 hook 的 `useEffect` cleanup 中调用 `observer.disconnect()` 解除观察
- **输入来源**：浏览器视口（`<html>` 元素的 `contentRect`）
- **输出去向**：`handleViewportResize` 回调接收 `ResizeObserverEntry[]`
- **失败行为**：若 `ResizeObserver` 构造函数不可用（极旧的浏览器，如 IE11，市场份额 < 0.1%）→ 降级为 `window.addEventListener("resize", handleResizeFallback)`，使用 `window.innerWidth` / `window.innerHeight` 获取尺寸（回退方案精度略低但不影响三值分类）

**步骤 3：视口尺寸变化 → 计算 DeviceType**

- **操作对象**：`handleViewportResize` 回调内部
- **具体操作**：
  1. 从 `ResizeObserverEntry.contentRect` 提取 `width` 和 `height`
  2. 同时读取 `window.devicePixelRatio` 获取当前 dpr
  3. 调用 `classifyDevice(width)` 纯函数计算 DeviceType：

     ```typescript
     function classifyDevice(width: number): DeviceType {
       if (width >= BREAKPOINTS.DESKTOP_COMPACT) return "desktop";  // ≥ 1366px
       if (width >= BREAKPOINTS.TABLET) return "tablet";            // ≥ 768px
       return "mobile";                                               // < 768px
     }
     ```

  4. 比较新旧 `deviceType`：若相同 → 仅更新 `viewportWidth` / `viewportHeight` / `dpr`（不触发 store 写入，避免不必要的重渲染）
  5. 若不同 → 执行去抖动逻辑（步骤 4），去抖后写入 store
  6. 计算 `isWide`：`width >= BREAKPOINTS.DESKTOP_WIDE`（≥ 1920px）
  7. 计算 `isDesktop` / `isTablet` / `isMobile`：`deviceType === "desktop"` / `"tablet"` / `"mobile"`
- **输入来源**：`ResizeObserverEntry.contentRect.width`（精确到小数点后 2 位）
- **输出去向**：更新 hook 内部的 `useState<DeviceInfo>`；条件性更新 `useAppStore.setState({ deviceType })`
- **失败行为**：`contentRect.width` 为 0（浏览器窗口最小化到 Dock/任务栏）→ 不更新 `deviceType`（窗口最小化不是真正的设备切换，保持当前 deviceType 不变），仅更新 `viewportWidth=0`

**步骤 4：去抖动 store 写入**

- **操作对象**：`useRef<number>` 存储的定时器 ID
- **具体操作**：
  1. 当 `classifyDevice(width)` 返回值与当前 `deviceType` 不同时，不立即写入 store
  2. 清除上一次的去抖定时器（`clearTimeout(debounceRef.current)`）
  3. 设置新的 `setTimeout`，延迟 150ms 后执行 `useAppStore.setState({ deviceType: newType })`
  4. 在 150ms 窗口内，若视口再次变化且设备类型再次不同（如用户快速拖拽窗口边缘来回跨越断点），重新计时
  5. 注意：仅对 `deviceType` 变更做去抖动。`viewportWidth` / `viewportHeight` / `dpr` / `isWide` 的更新不做去抖动（直接 setState，确保 Canvas 尺寸实时跟随）
- **输入来源**：步骤 3 的 `classifyDevice` 结果
- **输出去向**：延迟后写入 `useAppStore.setState({ deviceType })`
- **失败行为**：`setTimeout` 回调执行时 hook 已卸载（用户快速导航离开页面）→ 在 cleanup 中 `clearTimeout`，不会写入已卸载组件的 store（无影响，store 保持上一个有效值）

**步骤 5：监听 matchMedia 辅助媒体特性**

- **操作对象**：`window.matchMedia("(prefers-reduced-motion: reduce)")`
- **具体操作**：
  1. 在 `useEffect` 中调用 `window.matchMedia("(prefers-reduced-motion: reduce)")`
  2. 将结果（`prefersReducedMotion: boolean`）附加到 `DeviceInfo` 返回值中（作为额外字段，供动画组件查询）
  3. 使用 `mediaQueryList.addEventListener("change", callback)` 监听变化（不使用已废弃的 `addListener`）
  4. cleanup 中调用 `mediaQueryList.removeEventListener("change", callback)`
- **输入来源**：操作系统的无障碍设置（Windows 设置 / macOS 系统偏好设置 / iOS 设置）
- **输出去向**：`DeviceInfo` 的 `prefersReducedMotion` 字段（仅附加信息，不写入 store）
- **失败行为**：`window.matchMedia` 不可用（SSR/Jest 环境）→ `prefersReducedMotion` 设为 `false`

#### 阶段 B：useContainerSize Hook（容器级尺寸自适应）

**步骤 6：建立容器 ResizeObserver**

- **操作对象**：调用方传入的 `ref.current`（目标 DOM 元素）
- **具体操作**：
  1. 检查 `enabled` prop（默认 `true`）：若为 `false` → 不创建 `ResizeObserver`，返回 `{ width: 0, height: 0, ready: false }`
  2. 检查 `ref.current` 是否为 `null`：若为 `null`（组件尚未挂载或 ref 未绑定）→ 返回 `{ width: 0, height: 0, ready: false }`，待 ref 就绪后步骤 7 会重算
  3. 创建 `ResizeObserver` 实例，回调函数为 `handleContainerResize`
  4. 观察目标：`ref.current`（仅观察一个元素，不是 `document.documentElement`）
  5. cleanup 中调用 `observer.disconnect()`
- **输入来源**：`options.ref`、`options.enabled`、`options.debounceMs`
- **输出去向**：`handleContainerResize` 回调接收 `ResizeObserverEntry[]`
- **失败行为**：与步骤 2 相同：`ResizeObserver` 不可用时降级为 `window.resize` 事件 + `ref.current.getBoundingClientRect()` 手动读取

**步骤 7：容器尺寸变化 → 更新 ContainerSize**

- **操作对象**：`handleContainerResize` 回调内部
- **具体操作**：
  1. 从 `ResizeObserverEntry.contentRect` 提取 `width` 和 `height`
  2. `dpr` 不在本 hook 中处理——由消费组件自行从 `useDeviceType()` 获取 `dpr`，或通过 `window.devicePixelRatio` 获取（Canvas 2D 的高 DPI 缩放由各图表组件独立实现）
  3. 应用去抖动（`options.debounceMs`，默认 150ms）后更新 hook 内部的 `useState<ContainerSize>`
  4. 计算 `ready`：`width > 0 && height > 0`
  5. 触发消费组件的重渲染
- **输入来源**：`ResizeObserverEntry.contentRect.width` 和 `contentRect.height`
- **输出去向**：hook 返回值，消费组件（Canvas 图表）据此更新 `canvas.width` / `canvas.height` 属性
- **失败行为**：`contentRect` 宽高为 0 → 不更新 state（避免 Canvas 设置 `width=0` 导致 WebGL/2D 上下文丢失），`ready` 保持 `false`

#### 阶段 C：功能降级规则

**步骤 8：获取当前设备的功能降级规则**

- **操作对象**：`getDegradationRules` 纯函数
- **具体操作**：

  ```typescript
  function getDegradationRules(deviceType: DeviceType): DegradationRules {
    switch (deviceType) {
      case "desktop":
        return {
          enable3DShadows: true,
          maxTrailLength: 1000,
          enableTrail: true,
          enableSonification: true,
          enableCodeEditor: true,
          enablePrecomputedData: true,
          enableAdvancedAnalysis: true,
        };
      case "tablet":
        return {
          enable3DShadows: false,
          maxTrailLength: 200,
          enableTrail: true,
          enableSonification: false,
          enableCodeEditor: true,
          enablePrecomputedData: true,
          enableAdvancedAnalysis: true,
        };
      case "mobile":
        return {
          enable3DShadows: false,
          maxTrailLength: 0,
          enableTrail: false,
          enableSonification: false,
          enableCodeEditor: false,
          enablePrecomputedData: false,
          enableAdvancedAnalysis: false,
        };
    }
  }
  ```

- **输入来源**：`deviceType`（来自 `useAppStore` 或直接传入）
- **输出去向**：`DegradationRules` 对象，由各消费模块读取并执行降级（纯函数，无副作用）
- **失败行为**：`deviceType` 为非法值 → 返回 `desktop` 的规则（最安全默认：全功能开启）

#### 阶段 D：Tailwind CSS 断点同步

**步骤 9：tailwind.config.ts 使用 BREAKPOINTS 常量**

- **操作对象**：`tailwind.config.ts` 配置文件
- **具体操作**：
  1. 在 `tailwind.config.ts` 中导入 `BREAKPOINTS`：

     ```typescript
     // tailwind.config.ts
     import { BREAKPOINTS } from "./src/shared/hooks/useDeviceType";

     export default {
       theme: {
         extend: {
           screens: {
             sm: "640px",
             md: `${BREAKPOINTS.TABLET}px`,              // "768px"
             lg: `${BREAKPOINTS.DESKTOP_COMPACT}px`,     // "1366px"
             xl: `${BREAKPOINTS.DESKTOP_WIDE}px`,        // "1920px"
           },
         },
       },
     };
     ```

  2. 确保 TypeScript 编译后 `BREAKPOINTS` 的值正确传递到 Tailwind 配置
  3. 验证方式：在浏览器中打开开发工具 → 拖拽窗口宽度 → 检查 Tailwind 生成的 CSS 媒体查询断点是否与 `BREAKPOINTS` 一致
- **输入来源**：`BREAKPOINTS` 常量
- **输出去向**：Tailwind CSS 的 `@media` 查询断点
- **失败行为**：若 `tailwind.config.ts` 无法导入 TypeScript 文件（构建工具配置问题）→ 降级为在 `tailwind.config.ts` 中硬编码断点值并在注释中标注"需与 useDeviceType.ts 的 BREAKPOINTS 保持同步"；同时在 CI 中增加一致性校验脚本

### 依赖与集成接口

| 依赖方 | 具体接口 | 用途 |
|--------|----------|------|
| Zustand | `useAppStore.setState({ deviceType })` | 写入设备类型到全局 store |
| Zustand | `useAppStore.getState().deviceType` | 读取当前设备类型（hook 初始化时） |
| React | `useState<DeviceInfo>` | hook 内部状态（视口尺寸 + 设备类型快照） |
| React | `useEffect` + cleanup | 管理 ResizeObserver 生命周期 |
| React | `useRef<number>` | 存储去抖动定时器 ID |
| React | `useSyncExternalStore` | 订阅 ResizeObserver（可选，仅在需要与 React 并发模式更紧密结合时使用；对于 DeviceInfo state 更新，`useState` + `useEffect` 已足够） |
| 浏览器 API | `new ResizeObserver(callback)` | 监听视口/容器尺寸变化 |
| 浏览器 API | `document.documentElement` | ResizeObserver 的观察目标（视口级） |
| 浏览器 API | `window.innerWidth` / `window.innerHeight` | ResizeObserver 回退方案 |
| 浏览器 API | `window.devicePixelRatio` | 获取设备像素比 |
| 浏览器 API | `window.matchMedia(...)` | 监听 `prefers-reduced-motion` 等媒体特性 |
| Tailwind CSS | `tailwind.config.ts` 的 `theme.extend.screens` | CSS 响应式断点定义 |

**对外暴露的公共接口（供其他模块消费）**：

| 消费方模块 | 调用方式 | 消费的数据 |
|-----------|---------|-----------|
| SIM-02 参数控制面板 | `useAppStore((s) => s.deviceType)` | 决定面板布局（侧栏 / 抽屉 / 折叠菜单） |
| SIM-03 全局导航系统 | `useAppStore((s) => s.deviceType)` | 决定导航栏位置与样式（顶部 / 底部 / 紧凑） |
| SIM-03 全局导航系统 | `useDeviceType()` | 获取 `viewportHeight` 用于移动端 safe-area 计算 |
| EXP-01 3D 仿真场景 | `useAppStore((s) => s.deviceType)` | 决定 3D 阴影是否启用、几何细节等级 |
| EXP-02 运动尾迹渲染 | `useAppStore((s) => s.deviceType)` | 决定尾迹最大长度 |
| EXP-02 运动尾迹渲染 | `getDegradationRules(deviceType).maxTrailLength` | 获取尾迹长度的精确限制值 |
| EXP-03 声音化引擎 | `useAppStore((s) => s.deviceType)` | 决定是否允许创建 AudioContext（平板/手机端即使用户点击也不创建） |
| EXP-04 蝴蝶效应对比器 | `useAppStore((s) => s.deviceType)` | 决定双视口布局方向（左右 / 上下 / 仅主视口） |
| LAB-03 用户可编程沙箱 | `useAppStore((s) => s.deviceType)` | 决定是否渲染代码编辑器（手机端不渲染） |
| ANL-01~04（2D 图表） | `useContainerSize({ ref })` | 获取容器尺寸用于 Canvas 自适应 + 高 DPI 缩放 |
| SIM-05 相空间可视化 | `useContainerSize({ ref })` | 获取容器尺寸用于 Canvas 自适应 |
| App.tsx（根组件） | `<DeviceProvider>` | 在应用根节点挂载 useDeviceType（全局单例检测），将检测结果写入 useAppStore |
| 所有需要条件渲染的组件 | `useDeviceType()` | 获取 `isDesktop` / `isTablet` / `isMobile` / `isWide` 布尔值做便捷判断 |

### 状态机

本功能点不涉及异步流程或多阶段任务，故无需状态机。ResizeObserver 的回调是纯事件驱动的（视口尺寸变化 → 计算 DeviceType → 写入 store），无状态流转。

### 异常与边界条件

#### 异常 1：ResizeObserver 不可用（极旧浏览器）

- **触发条件**：`typeof ResizeObserver === "undefined"`（浏览器不支持 ResizeObserver API，如 IE11、Opera Mini 等市场份额 < 0.1% 的环境）
- **处理策略**：
  1. 检测到 `ResizeObserver` 不可用时，在 hook 初始化阶段打印 `console.warn("ResizeObserver unavailable, falling back to window.resize")`
  2. 注册 `window.addEventListener("resize", handleResizeFallback)`
  3. `handleResizeFallback` 内部：
     - 使用 `window.innerWidth` 和 `window.innerHeight` 获取视口尺寸（精度低于 ResizeObserver 的 `contentRect`，但足够用于三值 DeviceType 分类）
     - 应用相同的去抖动逻辑（150ms）
     - 无法监听容器级变化（`useContainerSize` hook 也降级为 `window.resize` + `getBoundingClientRect()` 手动读取）
  4. cleanup 中移除 `window.resize` 事件监听
  5. 在 Zustand debugStore 中记录降级事件：`{ event: "resize_observer_unavailable", timestamp }`
- **重试参数**：不重试（`ResizeObserver` 是否可用是浏览器能力问题，不会在运行时突然变为可用）。每次 hook 挂载时重新检测一次（如果浏览器升级后重新打开页面，自然获得新能力）。

#### 异常 2：用户快速拖拽窗口边缘跨越断点（频繁 resize 抖动）

- **触发条件**：用户在 500ms 内连续拖拽窗口边缘，导致视口宽度在断点阈值（如 1366px）附近反复穿越 ≥ 3 次
- **处理策略**：
  1. 每次 `classifyDevice(width)` 返回新 DeviceType 时，启动/重置 150ms 去抖定时器
  2. 在 150ms 窗口内，若视口再次跨越断点，旧定时器被清除，重新计时
  3. 150ms 后窗口稳定在最终宽度 → 写入最终 DeviceType 到 store（仅写入 1 次）
  4. 中间态（如 `desktop → tablet → desktop`，用户手抖来回拖拽）不触发 store 写入，消费模块无感知
  5. 视口宽度（`viewportWidth`）**不做去抖动**，实时更新（确保绑定了 width 的 Canvas 组件实时跟随）
- **重试参数**：去抖窗口 150ms。若 150ms 后设备类型再次变化（用户继续拖拽），重新去抖。

#### 异常 3：iframe 嵌入或特殊容器导致视口尺寸异常

- **触发条件**：
  - 应用被嵌入在 `<iframe width="400" height="300">` 中（如嵌入到博客文章的演示区）
  - 浏览器 DevTools 设备模拟模式下 `devicePixelRatio` 为异常值（如 0.5 或 3.5）
  - 浏览器窗口被缩放到非 100% 缩放比例（`window.devicePixelRatio` 随缩放变化）
- **处理策略**：
  1. `classifyDevice(width)` 仅依赖 `width`，不关心 iframe 容器：400px → `mobile`，按手机布局渲染。这是预期行为（小 iframe 应降级为移动布局以确保内容不被裁剪）。
  2. `dpr` 取值：`window.devicePixelRatio`，若返回 `undefined` 或 `0` → 降级为 `1`。Canvas 2D 的高 DPI 缩放公式：`canvas.width = cssWidth * dpr`，`ctx.scale(dpr, dpr)`。不做 dpr 上限限制（4K 显示器 dpr=2 正常渲染；dpr=3 的移动设备也正常渲染，Canvas 由各组件自行决定是否需要降级）。
  3. 不检测浏览器缩放比例（`window.devicePixelRatio` 已反映缩放，无需额外检测）。
- **重试参数**：无。这些是正常的运行环境，不是错误。本模块仅做检测和分类。

#### 异常 4：useContainerSize 的 ref 指向已被移除的 DOM 元素

- **触发条件**：消费组件的 `ref` 在组件卸载时先于 ResizeObserver 的 cleanup 被置为 `null`；或者父组件条件渲染移除了容器元素，但子组件的 ResizeObserver 尚未 disconnect
- **处理策略**：
  1. 在 `handleContainerResize` 回调中，检查 `entries[0].target` 是否仍存在于 DOM 中（`document.contains(entries[0].target)`）
  2. 若元素已脱离 DOM → 不更新 state，并立即调用 `observer.unobserve(entries[0].target)` 手动解除观察
  3. 同步将 `ready` 设为 `false`
  4. 打印 `console.debug("useContainerSize: target removed from DOM, unobserving")`（debug 级别，非 error，因为这是正常卸载流程）
- **重试参数**：不重试。这是正常的组件卸载流程。

#### 异常 5：SSR/Jest 环境中 window 不可用

- **触发条件**：`typeof window === "undefined"`（Node.js 测试环境、SSR 渲染阶段）
- **处理策略**：
  1. 在 hook 顶层检测 `typeof window === "undefined"`
  2. 若为 `true`：跳过所有浏览器 API 调用（`ResizeObserver`、`matchMedia`、`window.innerWidth`），直接返回安全的 fallback `DeviceInfo`：`{ deviceType: "desktop", isDesktop: true, isWide: true, isTablet: false, isMobile: false, viewportWidth: 1920, viewportHeight: 1080, dpr: 1, prefersReducedMotion: false }`
  3. `useEffect` 中的 ResizeObserver 初始化逻辑通过 `if (typeof window === "undefined") return;` 提前退出，不执行副作用
  4. `useContainerSize` hook 同理，返回 `{ width: 0, height: 0, ready: false }`
  5. 在测试中，可通过 Mock `window` 对象或使用 `jsdom` 环境来测试完整逻辑（Vitest 默认 `jsdom` 环境支持 `ResizeObserver` 的 polyfill）
- **重试参数**：不重试。环境能力不可变。

### 原则兑现清单

| 原则来源 | 原则名称 | 代码级约束 |
|----------|----------|------------|
| 功能设计_v0 §八 | 桌面为主，渐进降级 | `getDegradationRules` 返回桌面全功能、平板半功能、手机基础功能的三级降级规则；所有消费模块通过读取规则执行降级，而非硬编码 `if (isMobile) ...` |
| 功能设计_v0 §八 | 不改变用户数据 | 设备类型切换仅影响 UI 布局和渲染降级，不影响仿真参数、Worker 运行状态、快照数据。`deviceType` 不写入任何数据持久化层（IndexedDB 不存储设备类型） |
| 技术栈设计 §6 | 4 级断点（1920/1366/768） | `BREAKPOINTS` 常量精确对应 3 个阈值，`DeviceType` 三值映射规则：`≥ 1366 → desktop`、`≥ 768 → tablet`、`< 768 → mobile`。额外 `isWide` 区分 1920 内部二级 |
| 技术栈设计 §1.2 | 纯客户端运行 | 所有检测逻辑在浏览器端完成，无服务端调用。SSR 兼容代码（`typeof window === "undefined"` 早期返回）仅作防御性编程，项目无 SSR 需求 |
| 通用原则 | 单一数据源 | `deviceType` 全局仅一个写入点（`useDeviceType` hook），所有消费模块通过 `useAppStore().deviceType` 读取。禁止各自独立检测 |
| 通用原则 | 零外部依赖 | `ResizeObserver`、`matchMedia`、`window.innerWidth` 均为浏览器原生 API。去抖动使用 `useRef + setTimeout` 自实现，不引入 lodash.debounce |
| 通用原则 | 可测试性 | `classifyDevice(width)` 和 `getDegradationRules(deviceType)` 为纯函数，可在 Node 环境直接测试（不依赖浏览器 API）。ResizeObserver 的集成测试在 jsdom 环境下完成 |
| CLAUDE.md | 前端代码逻辑层与表现层分离 | `useDeviceType` / `useContainerSize` 是纯逻辑 hook，返回数据供组件消费；组件仅根据返回值做条件渲染，不在组件中直接操作 ResizeObserver |

### 验收测试场景

#### 正向测试 1：桌面宽屏环境正常检测

- **Given**：
  - 浏览器视口宽度为 1920px，高度为 1080px
  - `window.devicePixelRatio = 1`
  - 应用刚完成首次渲染
  - `useAppStore` 中 `deviceType` 初始值为 `"desktop"`
- **When**：`useDeviceType` hook 挂载并完成首次 ResizeObserver 回调
- **Then**：
  - `useDeviceType()` 返回值：`{ deviceType: "desktop", isDesktop: true, isWide: true, isTablet: false, isMobile: false, viewportWidth: 1920, viewportHeight: 1080, dpr: 1 }`
  - `useAppStore.getState().deviceType` 为 `"desktop"`（无变化，与初始值相同，store 不触发写入）
  - `getDegradationRules("desktop")` 返回：`{ enable3DShadows: true, maxTrailLength: 1000, enableTrail: true, enableSonification: true, enableCodeEditor: true, enablePrecomputedData: true, enableAdvancedAnalysis: true }`
  - 所有消费模块处于全功能模式
  - Tailwind 的 `xl:grid-cols-3` 类生效（≥ 1920px 匹配 `xl` 断点），布局为三栏

#### 正向测试 2：窗口从桌面缩小到平板触发 DeviceType 切换

- **Given**：
  - 当前视口宽度为 1920px，`deviceType = "desktop"`，`isWide = true`
  - `useAppStore.getState().deviceType = "desktop"`
- **When**：
  1. 用户拖拽窗口边缘，视口宽度从 1920px 缩小至 1200px（耗时约 200ms，其间宽度连续变化）
  2. 宽度降至 1365px（跨越 `DESKTOP_COMPACT` 断点）→ `classifyDevice(1365)` 返回 `"tablet"`
  3. 去抖定时器启动（150ms）
  4. 用户继续缩小至 1200px 后停止拖拽
  5. 150ms 后去抖定时器触发
- **Then**：
  - `useAppStore.getState().deviceType` 为 `"tablet"`（仅在步骤 5 写入 1 次，中间态 `1365px → 1200px` 不写入 store）
  - `useDeviceType()` 返回值：`{ deviceType: "tablet", isDesktop: false, isWide: false, isTablet: true, isMobile: false, viewportWidth: 1200, viewportHeight: 1080 }`
  - `getDegradationRules("tablet")` 返回：`{ enable3DShadows: false, maxTrailLength: 200, enableTrail: true, enableSonification: false, enableCodeEditor: true, enablePrecomputedData: true, enableAdvancedAnalysis: true }`
  - SIM-03 导航栏从顶部移至底部（Tailwind `md:` 前缀匹配 `≥ 768px`，导航栏样式切换为底部 tab bar）
  - 任何消费模块的 `useAppStore` selector（订阅 `deviceType`）触发 1 次重渲染

#### 正向测试 3：useContainerSize 正常返回容器尺寸

- **Given**：
  - 一个 `<div ref={containerRef} style="width: 800px; height: 600px">` 已挂载在 DOM 中
  - 调用 `const size = useContainerSize({ ref: containerRef, debounceMs: 100 })`
- **When**：ResizeObserver 首次回调触发
- **Then**：
  - `size` = `{ width: 800, height: 600, ready: true }`
  - 消费组件根据 `size.width` 和 `size.height` 设置 `<canvas width={800} height={600}>`
- **When**：CSS 布局变化，容器尺寸变为 `width: 400px`（如父级侧栏折叠）
- **Then**：
  - 100ms 去抖后，`size` 更新为 `{ width: 400, height: 600, ready: true }`
  - Canvas 组件同步更新尺寸并重绘

#### 异常测试 1：SSR/测试环境安全降级

- **Given**：
  - 运行环境为 Node.js（Vitest 无 jsdom），`typeof window === "undefined"`
  - `useDeviceType()` hook 被调用
- **When**：hook 初始化并检测到 `window` 不可用
- **Then**：
  - 不抛出 `ReferenceError: window is not defined`
  - `useDeviceType()` 返回 fallback 值：`{ deviceType: "desktop", isDesktop: true, isWide: true, isTablet: false, isMobile: false, viewportWidth: 1920, viewportHeight: 1080, dpr: 1, prefersReducedMotion: false }`
  - `useAppStore.getState().deviceType` 保持初始值 `"desktop"`（不写入）
  - 无 ResizeObserver 被创建（`useEffect` 提前退出）
  - Console 无 error 或 warning 输出

#### 异常测试 2：快速跨越断点不触发中间渲染

- **Given**：
  - 当前视口宽度为 1920px，`deviceType = "desktop"`
  - 消费组件（SIM-02 参数控制面板）订阅了 `useAppStore((s) => s.deviceType)`
- **When**：在 100ms 内连续发生以下视口变化（模拟用户快速拖拽）：
  1. `width = 1300px`（classifyDevice → `"tablet"`，去抖定时器启动）
  2. `width = 1400px`（classifyDevice → `"desktop"`，旧定时器被清除，重新计时）
- **Then**：
  - 150ms 后去抖定时器触发，`classifyDevice(1400)` 返回 `"desktop"`
  - `useAppStore.getState().deviceType` 仍为 `"desktop"`（与最终值相同，不触发写入）
  - 消费组件的 `deviceType` selector 未触发重渲染（值未变化）
  - 中间态 `"tablet"` 从未写入 store，消费组件完全无感知

#### 异常测试 3：容器元素被移除后 useContainerSize 安全降级

- **Given**：
  - `<div ref={containerRef}>` 已挂载，`useContainerSize` 返回 `{ width: 800, height: 600, ready: true }`
  - Canvas 图表正常渲染
- **When**：
  1. 父组件执行条件渲染：`{showChart && <ChartComponent />}`
  2. `showChart` 变为 `false` → `<ChartComponent />` 卸载
  3. `containerRef.current` 变为 `null`，DOM 元素被移除
  4. React cleanup 阶段，`useContainerSize` 的 `useEffect` cleanup 函数执行 `observer.disconnect()`
- **Then**：
  - console 不出现 `ResizeObserver loop completed with undelivered notifications` 等错误
  - `handleContainerResize` 不崩溃（cleanup 已完成 disconnect）
  - 无内存泄漏（observer 已被 disconnect）

#### 异常测试 4：dpr 异常值安全处理

- **Given**：
  - 测试环境注入：`Object.defineProperty(window, 'devicePixelRatio', { get: () => 0 })`（模拟异常 dpr）
- **When**：`useDeviceType()` hook 读取 `window.devicePixelRatio`
- **Then**：
  - `dpr` 降级为 `1`（`dpr = window.devicePixelRatio || 1`）
  - 不抛出异常，不影响 `deviceType` 分类逻辑
  - Canvas 2D 消费组件按 `dpr=1` 渲染（未做高 DPI 缩放，但不会崩溃，视觉效果正常）

### 注意事项与禁止行为

1. **【deviceType 唯一写入者】** SYS-01 是 `useAppStore().deviceType` 的**唯一生产者**。任何其他模块（SIM-02、SIM-03、EXP-*、ANL-* 等）禁止调用 `useAppStore.setState({ deviceType: ... })`。若其他模块需要感知设备类型，必须通过 `useAppStore((s) => s.deviceType)` 读取或调用 `useDeviceType()` hook。违反此规则将导致设备类型检测逻辑分裂、多个冲突源同时写入 store，造成 UI 抖动。

2. **【断点常量单一源】** `BREAKPOINTS` 常量（定义在 `useDeviceType.ts`）是断点阈值的唯一权威源。`tailwind.config.ts`、各组件的条件渲染逻辑、`classifyDevice` 函数均从此常量派生。修改断点值时，仅修改 `BREAKPOINTS` 一处即可，但需同步更新 `tailwind.config.ts` 的 `screens` 字段（因为 Tailwind 构建时静态提取，无法在运行时读取 `BREAKPOINTS`）。**建议**：在 CI 中增加一致性校验脚本，比较 `BREAKPOINTS` 与 `tailwind.config.ts` 的 screens 值是否一致。

3. **【DeviceType 枚举值不可变】** `DeviceType` 三值 `"desktop" | "tablet" | "mobile"` 已在所有消费模块（SIM-02、SIM-03、EXP-01、EXP-02、ANL-01 等）的 TypeScript 类型注解中硬编码。新增枚举值（如 `"watch"`）将导致所有消费模块的类型检查失败。若未来需要更细粒度的设备分类，应通过 `DeviceInfo` 中的额外布尔字段（如 `isWatch`）实现，而非扩展 `DeviceType` 枚举。

4. **【去抖动仅用于 DeviceType，不用于 viewportWidth】** `viewportWidth` / `viewportHeight` 的去抖动有单独的 `debounceMs` 参数（在 `useContainerSize` 中）。`useDeviceType` 中对 `DeviceType` 的去抖动（150ms）是固定的。若 Canvas 组件需要实时跟随窗口尺寸，使用 `useContainerSize` 并设置 `debounceMs: 0`。

5. **【禁止在组件中直接创建 ResizeObserver】** 所有组件必须通过 `useDeviceType()` 或 `useContainerSize()` 获取尺寸信息。禁止在组件中直接 `new ResizeObserver(...)`，以避免多处创建 Observer 导致性能下降（每个 ResizeObserver 实例都会触发独立的回调执行）。若 `useContainerSize` 不满足需求（如需要监听多个独立容器），在对应 Feature 的 `hooks/` 下创建专用 hook，但复用 `ResizeObserver` 的单例模式。

6. **【移动端 safe-area 处理】** `useDeviceType()` 返回值中不包含 `safeAreaInsets`。移动端的 safe-area 处理由 SIM-03（全局导航系统）负责，通过 CSS `env(safe-area-inset-bottom)` 实现。SYS-01 仅提供 `viewportHeight` 和 `isMobile` 供其判断是否需要 safe-area 适配。

7. **【禁止行为】** 禁止在 `useDeviceType` hook 中使用 `window.innerWidth` 轮询（`setInterval` 持续读取）。这会导致主线程持续占用，影响 3D 渲染帧率。

8. **【禁止行为】** 禁止在使用 `useAppStore().deviceType` 做条件渲染时，在同一个 `useAppStore` selector 中同时订阅高频变化的其他字段（如 `debugInfo.fps`）。这会导致设备类型并未变化，但因 fps 变化而触发不必要的重渲染。应拆分为两个独立的 `useAppStore` selector。

9. **【易错点】** `useDeviceType()` 的返回值是一个对象。在 React 组件中，若仅在需要 `isWide` 时调用 `useDeviceType()`，每次视口尺寸变化（即使 `isWide` 未变，但 `viewportWidth` 变了）都会触发重渲染。若组件仅关心 `isWide` 而不关心精确宽度，建议使用 `useAppStore((s) => s.deviceType)` + 本地计算 `isWide = window.innerWidth >= 1920`（不订阅宽度变化），或拆分为独立的 `useDeviceType` 调用 + `React.memo`。

10. **【易错点】** `classifyDevice` 函数的分界线逻辑：`width >= 1366` → `"desktop"`，`width >= 768` → `"tablet"`。边界值 1366 和 768 的归属已经明确（`>=`），但需确认 Tailwind 的 `screens` 配置与之一致（Tailwind 默认 `min-width` 媒体查询使用 `>=`，行为一致）。

11. **【偷懒红线】** 禁止在组件中写 `if (window.innerWidth < 768) { ... }` 做设备判断。必须通过 `useAppStore().deviceType` 或 `useDeviceType()` 读取，确保单一数据源和响应式更新（`window.innerWidth` 的静态读取不会在窗口 resize 时触发重渲染）。
