# 功能点：SYS-04 应用初始化加载

> **文档生成时间**：2026-04-28 21:59:02 CST
> **版本记录**：
> | 版本 | 时间 | 修改人 | 变更摘要 |
> |------|------|--------|----------|
> | v1.0 | 2026-04-28 21:59:02 | AI Assistant | 初始版本，对齐 useAppStore.loadingState 已有字段 + 技术栈 §5.1 启动流程 + Pyodide 三级缓存方案 |

> **冲突核查指引**：本模块是 `useAppStore.loadingState` 的**唯一写入者**。所有其他模块（SIM-03 AppShell、SIM-01 Worker 初始化、INF-01 可观测性初始化）依赖此字段判断自身是否可渲染/启动。Pyodide 加载进度通过 INF-01 的 `updateDebugInfo({ pyodideLoadPct })` 间接写入，本模块负责调用。

### 所属模块与溯源

- **对应总设计章节**：行业补充（功能设计_v0 未覆盖首次加载体验）；技术栈设计 §5.1「首屏加载流程」、§5.2「Pyodide 三级缓存」、§1.2 核心约束（首屏体积 < 5MB、Pyodide ~18MB 按需加载）；功能模块全拆解 §八 SYS-04 及附录 B 行业补充理由
- **依赖的其他功能模块**：
  - `INF-01`（应用可观测性）— 本模块向 INF-01 的 `observabilityCoordinator` 报告 Pyodide 加载进度（通过 `updateDebugInfo({ pyodideLoadPct })`），并在启动完成时触发 `observabilityCoordinator.init()` 初始化所有 tracker
  - `SIM-01`（双摆物理引擎）— 本模块在 Worker 加载成功后创建 Worker 实例（调用 `createOdeWorker()`）
  - `SYS-02`（运行时异常处理）— 加载失败时调用 `notify()` 展示错误详情和重试入口
- **被依赖模块**：
  - `SIM-03`（全局导航系统）— `AppShell` 组件根据 `useAppStore(s => s.loadingState)` 决定：`"loading"` → 渲染 `<LoadingScreen />`；`"ready"` → 渲染 `<AppShell>`（含导航栏 + 模式内容区）；`"error"` → 渲染 `<ErrorScreen />`
  - `SIM-01`（双摆物理引擎）— Worker 实例由本模块在启动阶段创建并传递给仿真调度循环
  - `SIM-02`（参数控制面板）— 仅在 `loadingState === "ready"` 后才能渲染（参数面板依赖 Worker 就绪才能发送参数）
  - `LAB-03`（用户可编程沙箱）— Pyodide 实例由本模块预加载（懒加载模式：仅在使用时下载），LAB-03 的 `usePyodide` hook 从本模块获取 Pyodide 实例引用
  - `ANL-01`/`ANL-02`（分析模式图表）— 预计算 JSON 的 fetch 由本模块在后台触发（非阻塞），但不由本模块阻塞（加载失败不影响主功能启动）
- **行业补充说明**：设计文档聚焦功能与物理，未覆盖首次加载体验。但 Pyodide WebAssembly 运行时首次下载可达 10-15MB，白屏等待会严重影响评审第一印象与用户留存。技术栈 §5.1 定义了首屏加载流程，本模块将其落地为完整的启动管理器。

### 已有设计兼容性分析

- **已审查的相关规格文档**：
  - `双摆混沌实验室-技术栈设计.md` v1.2：§5.1 首屏加载流程（解析 JS bundle → Worker 初始化 → 加载动画 → 并行启动 → Worker ready → 淡入 3D 场景）、§5.2 Pyodide 三级缓存（本地文件系统 → IndexedDB → CDN 回退）、§5.4 快照 IndexedDB 存储（独立 store `snapshots`，与 Pyodide 缓存 store 分离）
  - `双摆混沌实验室-项目结构.md` v1.0：§4.10 `useAppStore.loadingState: LoadingState` 字段定义（`"loading" | "ready" | "error"`）、§4.9 `shared/lib/cache/indexed-db.ts` 通用 IndexedDB 封装（本模块的 Pyodide 缓存层复用此封装）
  - `INF-01-应用可观测性.md` v1.0：§96 `ObservabilityConfig` 由 SYS-04 传入；§203 `pyodideLoadPct` 由 SYS-04 更新；§275 rAF 循环由 SYS-04 启动；§408 `initErrorCapture` 在 SYS-04 流程中调用；§643 `observabilityCoordinator.init()` 由 SYS-04 调用
  - `SIM-03-全局导航系统.md` v1.1：§608 明确 Worker 在应用启动时由 SYS-04 加载流程触发创建
  - `SIM-01-双摆物理引擎.md` v2.1：§488 Worker 由 SYS-04 初始化加载流程或 App.tsx 入口触发创建；`createOdeWorker()` 工厂函数
  - `SYS-01-响应式布局引擎.md` v1.0：§291 声明本模块不修改 `loadingState` 字段（由 SYS-04 独占写入权）
  - `SYS-02-运行时异常处理.md` v1.0：加载失败时调用 `notify()` 展示错误详情
- **兼容性结论**：
  - 无冲突。`useAppStore.loadingState` 字段已在项目结构设计中定义（`"loading" | "ready" | "error"`），本模块仅在此字段上写入顺序值：应用启动 → `"loading"`；所有启动任务完成 → `"ready"`；任一关键任务失败 → `"error"`。
  - INF-01 的多个调用点（`observabilityCoordinator.init()`、`initErrorCapture`、`updateDebugInfo({ pyodideLoadPct })`）已明确标注"由 SYS-04 调用"，与本模块的职责一致。
  - SIM-01 的 Worker 创建（`createOdeWorker()`）已约定由本模块触发，无所有权冲突。
  - SIM-03 的 `AppShell` 通过 `loadingState` selector 消费，不试图自行判断启动状态。
  - 所有已有模块仅消费 `loadingState`（只读），本模块是唯一写入者——符合单一数据源原则。
- **复用的已有定义**：
  - `useAppStore.loadingState: "loading" | "ready" | "error"`（来自项目结构设计 §4.10）
  - `useAppStore.debugInfo.pyodideLoadPct: number`（来自 INF-01 §203，本模块负责写入）
  - `ObservabilityCoordinator` 类 + `observabilityCoordinator` 全局单例（来自 INF-01，本模块负责 `init()` 调用）
  - `initErrorCapture` 函数（来自 INF-01，本模块在启动早期调用）
  - `createOdeWorker()` 工厂函数（来自 SIM-01，本模块创建 Worker 实例）
  - IndexedDB 通用封装 `openDB()` / `get()` / `put()`（来自 `src/shared/lib/cache/indexed-db.ts`）

### 技术栈绑定

- **必须使用**：
  - `react@^18.3.1` — `LoadingScreen` 和 `ErrorScreen` 的 React 组件渲染
  - `zustand@^4.5.5` — 写入 `useAppStore.loadingState`（`useAppStore.setState({ loadingState: "ready" })`）
  - `tailwindcss@^3.4.16` — 加载动画的 CSS（背景渐变、进度条、淡入过渡）
  - `framer-motion`（或 CSS `@keyframes`）— 加载完成后的平滑过渡动画（`AnimatePresence`、`opacity` 淡出 + `scale` 缩放）
  - 浏览器原生 `fetch()` — Pyodide 从本地文件系统或 CDN 下载
  - 浏览器原生 `indexedDB` — Pyodide WASM 文件缓存（store: `pyodide-cache`，与预计算缓存 `precompute` store 分离）
  - 浏览器原生 `navigator.onLine` — 检测网络状态（决定是否尝试 CDN 回退）
  - TypeScript 5.x — 类型安全
- **禁止使用**：
  - 禁止在 React 组件挂载前（`main.tsx` 的 `createRoot` 之前）执行异步的 Pyodide 下载。所有加载逻辑必须在 React 渲染 `<LoadingScreen />` 之后、在 `BootManager` 的 `useEffect` 中执行——确保加载进度可以反馈到 UI（进度条百分比、名言轮播）
  - 禁止使用 `<progress>` 原生 HTML 元素的默认样式（各浏览器差异大）。必须使用自实现的进度条组件（`<div>` + Tailwind `transition-all`）
  - 禁止在主线程同步下载 Pyodide（`XMLHttpRequest` 同步模式已被浏览器废弃）。必须使用 `fetch()` + 流式读取（`response.body.getReader()`）以支持进度追踪
  - 禁止在 `loadingState === "loading"` 时渲染任何依赖 Worker/Pyodide 的功能组件。`AppShell` 必须通过条件渲染确保仅 `<LoadingScreen />` 可见
  - 禁止硬编码混沌名言。名言列表必须从独立的 `src/shared/data/chaos-quotes.ts` 文件导入（数组格式，每项包含 `quote: string` 和 `author: string`），以便非开发人员（如文案编辑）修改
  - 禁止在 `loadingState === "error"` 时不提供任何恢复路径。错误屏幕必须包含"重试"按钮和"离线模式"选项

### 输入定义（精确类型）

#### 1. LoadingState 类型（写入 `useAppStore`）

```typescript
/**
 * 应用初始化加载状态。
 * 写入 `useAppStore.loadingState`，由 SIM-03 的 AppShell 消费。
 *
 * 状态流转：loading → ready | error
 *
 * 该类型已在项目结构设计 §4.10 中定义（`src/stores/useAppStore.ts`），
 * 本模块仅引用，不重新定义。
 */
type LoadingState = "loading" | "ready" | "error";
```

#### 2. 启动配置（BootConfig）

```typescript
/**
 * 应用启动配置。
 * 在 `main.tsx` 或 `App.tsx` 入口创建，传入 `<BootManager>`。
 */
interface BootConfig {
  /**
   * 是否启用 Pyodide 预加载。
   * 默认：true。
   * 设为 false 时：Pyodide 不下载（LAB-03 不可用）。移动端可设为 false 以节省流量和首屏时间。
   */
  enablePyodide?: boolean;

  /**
   * 是否启用预计算数据预加载（后台 fetch）。
   * 默认：true。
   * 设为 false 时：ANL-01/ANL-02 首次切换到分析模式时自行加载（按需加载）。
   */
  enablePrecomputePrefetch?: boolean;

  /**
   * 是否在启动时显示混沌名言轮播。
   * 默认：true。
   * 设为 false 时：加载屏幕仅显示进度条 + 动画（无文字）。
   */
  showQuotes?: boolean;

  /**
   * Pyodide 加载策略。
   * "lazy": 仅在用户首次进入 Lab 模式时下载（默认，节省首屏流量）
   * "eager": 应用启动时立即下载（评审现场无网络波动风险）
   */
  pyodideLoadStrategy?: "lazy" | "eager";

  /**
   * Worker 初始化超时时间（毫秒）。
   * 默认：3000（3 秒）。纯 JS Worker 创建 + RK4 模块加载应在此时间内完成。
   * 超时 → loadingState = "error"，错误消息："仿真引擎初始化超时"
   */
  workerTimeoutMs?: number;

  /**
   * 加载完成后淡入过渡的持续时间（毫秒）。
   * 默认：600（ms）。
   * 约束：>= 200，<= 2000。
   */
  transitionDurationMs?: number;
}
```

#### 3. Pyodide 缓存条目（IndexedDB）

```typescript
/**
 * IndexedDB 中 Pyodide 缓存条目的结构。
 * Object Store：pyodide-cache（与预计算缓存的 "precompute" store 分离）
 * 键路径：resourceKey（string）
 */
interface PyodideCacheEntry {
  /**
   * 缓存键。
   * 格式："pyodide-core-{VERSION}" | "numpy-{VERSION}" | "scipy-{VERSION}"
   * 示例："pyodide-core-0.26.1"
   */
  resourceKey: string;

  /**
   * WASM 或 ZIP 文件的 ArrayBuffer。
   * Pyodide 核心约 6-8MB；NumPy wheel 约 2-3MB；SciPy wheel 约 5-8MB。
   * 类型：ArrayBuffer
   */
  data: ArrayBuffer;

  /**
   * 文件字节大小。
   * 类型：number。
   * 示例：8388608（8MB）
   */
  size: number;

  /**
   * 写入缓存的时间戳（ISO 8601）。
   * 用于版本更新检测：新版本 → 删除旧版本缓存。
   * 示例："2026-04-27T08:30:00.000Z"
   */
  cachedAt: string;

  /**
   * 缓存版本号（Pyodide 版本号）。
   * 示例："0.26.1"
   */
  version: string;

  /**
   * 资源的 MIME 类型。
   * "application/wasm" | "application/zip" | "application/octet-stream"
   */
  mimeType: string;
}
```

#### 4. 加载阶段与进度

```typescript
/**
 * 启动过程中各阶段的枚举。
 * 每个阶段有对应的权重（影响总体进度的百分比分配）。
 */
type BootPhase =
  | "idle"                    // 未开始
  | "mounting"                // React 挂载中（权重：5%）
  | "worker_init"             // Worker 初始化（权重：10%，纯 JS，快速）
  | "pyodide_local_check"     // 检查本地文件系统可用性（权重：2%，极快）
  | "pyodide_indexeddb_check" // 检查 IndexedDB 缓存（权重：3%，极快）
  | "pyodide_downloading"     // 下载 Pyodide 资源（权重：60%，最慢）
  | "pyodide_initializing"    // WASM 实例化 + Python 初始化（权重：10%）
  | "precompute_fetching"     // 预计算 JSON 后台 fetch（权重：5%，非阻塞）
  | "finalizing"              // 完成收尾（权重：5%，注册全局事件等）
  | "ready"                   // 启动完成
  | "error";                  // 启动失败

/**
 * 启动进度快照。
 * 由 BootManager 维护，用于驱动 LoadingScreen 的进度条。
 */
interface BootProgress {
  /**
   * 当前启动阶段。
   * 类型：BootPhase
   * 示例："pyodide_downloading"
   */
  phase: BootPhase;

  /**
   * 当前阶段内的进度（0-1）。
   * 对于可量化的阶段（如 pyodide_downloading），基于已下载/总量计算。
   * 对于不可量化的阶段（如 worker_init），阶段开始时为 0，结束时跳变为 1。
   * 类型：number，范围 [0, 1]。
   */
  phaseProgress: number;

  /**
   * 总体进度（0-1）。
   * 计算公式：当前阶段之前的各阶段权重之和 + phase.权重 × phaseProgress。
   * 类型：number，范围 [0, 1]。
   * 示例：0.42（42% 完成）
   */
  overallProgress: number;

  /**
   * 已下载字节数（仅 pyodide_downloading 阶段有效，其他阶段为 0）。
   * 类型：number，单位 bytes。
   * 示例：4194304（4MB）
   */
  downloadedBytes: number;

  /**
   * 总需下载字节数（仅 pyodide_downloading 阶段有效，其他阶段为 0）。
   * 类型：number，单位 bytes。
   * 示例：10485760（10MB，Pyodide core + numpy + scipy）
   */
  totalBytes: number;

  /**
   * 预计剩余时间（秒）。
   * 基于最近 5 秒的平均下载速度估算。
   * -1 表示无法估算（刚开始下载或速度为 0）。
   * 类型：number，单位 s。
   * 示例：15.3（预计还需 15.3 秒）
   */
  etaSeconds: number;

  /**
   * 当前阶段的人类可读描述。
   * 类型：string。
   * 示例："正在下载 Python 运行时 (4.1/10.5 MB)"
   */
  description: string;
}
```

#### 5. 混沌名言数据格式

```typescript
/**
 * 单条混沌名言。
 * 数据文件：src/shared/data/chaos-quotes.ts
 */
interface ChaosQuote {
  /**
   * 名言正文（中文或英文）。
   * 类型：string，最大 120 字符（适配加载屏幕宽度）。
   * 示例："云彩不是球体，山峦不是锥体，海岸线不是圆形，树皮并不光滑，闪电也不沿直线传播。"
   */
  quote: string;

  /**
   * 作者/出处。
   * 类型：string，最大 60 字符。
   * 示例："Benoit Mandelbrot, 《大自然的分形几何》"
   */
  author: string;
}

/**
 * 名言集合。至少 5 条，推荐 8-10 条。
 * 加载期间每 5 秒轮播一条（交叉淡入淡出动画）。
 */
type ChaosQuotes = ChaosQuote[];
```

### 输出定义（精确类型）

#### 1. BootManager 组件输出

```typescript
/**
 * <BootManager> 组件的 Props 和渲染逻辑。
 *
 * 该组件包裹整个应用。在 main.tsx 或 App.tsx 中作为最外层组件。
 *
 * 使用示例：
 * ```tsx
 * // main.tsx
 * ReactDOM.createRoot(document.getElementById("root")!).render(
 *   <BootManager config={{ pyodideLoadStrategy: "lazy" }}>
 *     <App />  // App 内部渲染 <AppShell>（SIM-03），AppShell 根据 loadingState 条件渲染
 *   </BootManager>
 * );
 * ```
 */
interface BootManagerProps {
  /** 启动配置 */
  config?: BootConfig;
  /** 子组件（<App />）——仅在 loadingState === "ready" 时被渲染 */
  children: React.ReactNode;
}

/**
 * <LoadingScreen> 组件（由 BootManager 内部渲染）。
 *
 * 视觉规格：
 * ┌──────────────────────────────────────────┐
 * │  (深色背景 #0a0a0f，带微弱网格纹理)       │
 * │                                          │
 * │           ┌─────────────┐                │
 * │           │  双摆 Logo   │  ← CSS 动画    │
 * │           │  (SVG 图标)  │    缓慢摆动     │
 * │           └─────────────┘                │
 * │                                          │
 * │        "混沌实验室"                       │
 * │        Chaos Pendulum Lab                │
 * │                                          │
 * │  ┌──────────────────────────────────┐    │
 * │  │  ████████████░░░░░░░░░░░░  42%   │    │  ← 进度条
 * │  └──────────────────────────────────┘    │
 * │  正在下载 Python 运行时 (4.1/10.5 MB)    │  ← 描述文字
 * │  预计剩余 15 秒                            │  ← ETA
 * │                                          │
 * │  ┌──────────────────────────────────┐    │
 * │  │  "确定性系统的内在随机性           │    │  ← 混沌名言
 * │  │   ——这就是混沌"                   │    │    (每 5s 切换)
 * │  │                  — James Gleick  │    │
 * │  └──────────────────────────────────┘    │
 * └──────────────────────────────────────────┘
 */
```

#### 2. ErrorScreen 组件输出（`loadingState === "error"` 时渲染）

```typescript
/**
 * <ErrorScreen> 组件（由 BootManager 在 error 状态时渲染）。
 *
 * 视觉规格：
 * ┌──────────────────────────────────────────┐
 * │  (深色背景，与 LoadingScreen 一致)         │
 * │                                          │
 * │              ⚠ (警告图标)                 │
 * │        "应用启动失败"                      │
 * │  {具体错误消息}                            │
 * │                                          │
 * │        [重试]   [离线模式]                │  ← 两个按钮
 * │                                          │
 * │  提示：离线模式下 Python 沙箱不可用，       │
 * │        但实时仿真仍可正常运行               │
 * └──────────────────────────────────────────┘
 *
 * 按钮行为：
 * - "重试"：调用 retry() → 重置 loadingState = "loading" → 重新执行全部启动流程
 * - "离线模式"：跳过 Pyodide 下载 → loadingState = "ready"（仅限非 Pyodide 原因的失败）
 *   若失败原因是 Worker 崩溃 → 仅显示"重试"，不显示"离线模式"（Worker 是必需的）
 */
```

### 核心逻辑步骤

#### 阶段 A：main.tsx 入口——BootManager 挂载

**步骤 1：应用入口渲染 BootManager**

- **操作对象**：`main.tsx` 的 `ReactDOM.createRoot(...).render()`
- **具体操作**：
  ```typescript
  // main.tsx
  import { BootManager } from "@/features/system/init/BootManager";

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <BootManager config={{
        pyodideLoadStrategy: "lazy",   // 默认懒加载 Pyodide
        enablePrecomputePrefetch: true, // 后台预取预计算数据
        showQuotes: true,
      }}>
        <App />  {/* App 内部组件通过 useAppStore(s => s.loadingState) 感知启动状态 */}
      </BootManager>
    </React.StrictMode>
  );
  ```
- **输入来源**：`main.tsx` 入口 + `BootConfig` 配置
- **输出去向**：React 组件树挂载 → `BootManager` 的 `useEffect` 触发启动流程
- **失败行为**：React 挂载失败（极罕见，JS bundle 解析错误）→ 浏览器白屏，`<body>` 内嵌的 fallback HTML（`<noscript>` 或 inline script）显示静态错误提示："应用加载失败，请刷新或检查浏览器兼容性"

**步骤 2：BootManager 设置 loadingState → "loading"**

- **操作对象**：`useAppStore.loadingState`
- **具体操作**：
  1. `BootManager` 挂载后，在第一个 `useEffect`（layout effect，确保在浏览器绘制前）中调用 `useAppStore.setState({ loadingState: "loading" })`
  2. 此时 SIM-03 的 `AppShell` 组件检测到 `loadingState === "loading"` → 渲染 `<LoadingScreen />`
  3. 同步执行两个轻量初始化（不阻塞后续异步流程）：
     a. 调用 `initErrorCapture((errors) => { useAppStore.getState().updateDebugInfo({ errors }); })`（INF-01 的全局错误捕获，必须在启动早期注册）
     b. 调用 `document.documentElement.classList.add("app-loading")`（全局 CSS hook：禁止滚动、禁止文本选中、锁定视口）
- **输入来源**：BootManager 的 `useLayoutEffect`
- **输出去向**：`useAppStore.loadingState = "loading"`；`window.onerror` / `onunhandledrejection` 已注册
- **失败行为**：`initErrorCapture` 内部抛错 → try-catch 包裹，`console.error` 记录但不阻止启动流程继续

#### 阶段 B：并行启动任务

**步骤 3：Worker 初始化（关键任务，阻塞 ready）**

- **操作对象**：`createOdeWorker()` 工厂函数（SIM-01）
- **具体操作**：
  1. 调用 `createOdeWorker()`：
     ```typescript
     const worker = new Worker(
       new URL("@/features/simulation/worker/ode-worker.ts", import.meta.url),
       { type: "module" }
     );
     ```
  2. 等待 Worker 发送 `"ready"` 消息——证明 Worker 脚本解析完成、RK4 模块加载成功
  3. 使用 `Promise.race` 设置超时（`workerTimeoutMs`，默认 3000ms）：超时 → 视为 Worker 初始化失败
  4. Worker ready 后，将其引用存储到模块级变量（供 SIM-01 的调度循环使用）
  5. 设置 `worker.onerror` 为 SYS-02 的恢复逻辑（通过 `useWorkerRecovery` 外部调用）
- **输入来源**：`new URL(..., import.meta.url)` 的 Worker 脚本路径
- **输出去向**：全局 Worker 实例；BootProgress.phase = `"worker_init"`，权重 10%
- **失败行为**：
  - Worker 脚本 404（构建产物缺失）→ `loadingState = "error"`，错误消息："仿真引擎文件缺失，请重新构建应用"
  - Worker 超时（> 3s）→ `loadingState = "error"`，错误消息："仿真引擎初始化超时，请刷新重试"
  - Worker 加载成功但 `"ready"` 消息格式异常 → `console.warn` + 继续（乐观处理）

**步骤 4：Pyodide 加载（可选任务，按策略执行）**

- **操作对象**：Pyodide 三级缓存加载管线
- **具体操作**（仅在 `pyodideLoadStrategy === "eager"` 时阻塞 ready；`"lazy"` 时后台静默加载，不阻塞）：

  ```
  async function loadPyodide(progressCallback: (p: BootProgress) => void): Promise<PyodideInterface | null> {
    // 1. 检查本地文件系统（第一层缓存）
    phase = "pyodide_local_check";
    const localAvailable = await checkLocalFile("/pyodide/pyodide.js");
    if (localAvailable) {
      // 直接从 /pyodide/ 加载（file:// 协议或同源静态资源）
      phase = "pyodide_initializing";
      const pyodide = await loadPyodide({ indexURL: "/pyodide/" });
      // 异步写入 IndexedDB（fire-and-forget，不阻塞）
      cachePyodideToIndexedDB(pyodide);
      return pyodide;
    }

    // 2. 检查 IndexedDB 缓存（第二层）
    phase = "pyodide_indexeddb_check";
    const cached = await getCachedPyodide("pyodide-core-0.26.1");
    if (cached) {
      phase = "pyodide_initializing";
      const pyodide = await loadPyodide({ /* 从 IndexedDB ArrayBuffer 注入 */ });
      return pyodide;
    }

    // 3. CDN 下载（第三层，仅在线环境）
    if (!navigator.onLine) {
      // 完全离线且无缓存 → 失败
      return null;
    }

    phase = "pyodide_downloading";
    const response = await fetch("https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.js");
    const reader = response.body.getReader();
    const contentLength = parseInt(response.headers.get("Content-Length") || "0", 10);

    // 流式读取 + 进度回调
    let downloaded = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      downloaded += value.length;
      chunks.push(value);
      progressCallback({
        phase: "pyodide_downloading",
        phaseProgress: contentLength > 0 ? downloaded / contentLength : -1,
        downloadedBytes: downloaded,
        totalBytes: contentLength,
        overallProgress: BOOT_PHASE_WEIGHTS.slice(0, phaseIndex).reduce((a, b) => a + b, 0)
          + BOOT_PHASE_WEIGHTS[phaseIndex] * (contentLength > 0 ? downloaded / contentLength : 0),
        etaSeconds: computeEta(downloaded, contentLength, downloadStartTime),
        description: `正在下载 Python 运行时 (${formatBytes(downloaded)}/${formatBytes(contentLength)})`,
      });
    }

    // 初始化 Pyodide
    phase = "pyodide_initializing";
    const blob = new Blob(chunks);
    const pyodide = await loadPyodide({ /* from blob */ });

    // 写入 IndexedDB 缓存
    await cachePyodideToIndexedDB(pyodide);

    return pyodide;
  }
  ```

- **输入来源**：`/public/pyodide/` 本地文件 + IndexedDB `pyodide-cache` store + CDN URL
- **输出去向**：`PyodideInterface` 实例（全局单例）；INF-01 的 `updateDebugInfo({ pyodideLoadPct })` 被持续更新
- **失败行为**：
  - 三层缓存全部失败（本地文件不存在 + IndexedDB 未命中 + CDN 不可达或下载失败）→ `pyodideLoadPct = -1`
  - `pyodideLoadStrategy === "eager"` → `loadingState = "error"`（Pyodide 是必要组件，启动失败）
  - `pyodideLoadStrategy === "lazy"` → 静默记录错误，`loadingState = "ready"`（不阻塞主功能），LAB-03 使用时发现 Pyodide 不可用 → 显示"Python 沙箱不可用"提示

**步骤 5：预计算数据后台预取（可选，非阻塞）**

- **操作对象**：预计算 JSON 文件（`src/shared/data/` 下的 `lyapunov_max-*.json`、`bifurcation-*.json`）
- **具体操作**：
  1. 仅在 `enablePrecomputePrefetch === true` 时执行
  2. 使用 `fetch()` 后台加载预计算 JSON（不阻塞 `loadingState` 到 `"ready"` 的转换）
  3. 通过 SYS-03 的 `loadPrecomputeData()` 函数加载 → 自动写入 IndexedDB 缓存
  4. 加载成功 → ANL-01/ANL-02 首次访问时直接从 IndexedDB 读取（0ms 等待）
  5. 加载失败 → 静默（不通知用户，ANL-01/ANL-02 自行处理 fetch 失败）
- **输入来源**：`src/shared/data/` 下的 JSON 文件 URL
- **输出去向**：IndexedDB `precompute` store（SYS-03 管理）
- **失败行为**：全部静默，不阻塞启动。加载失败时 ANL-01/ANL-02 在用户首次切换到分析模式时自行处理

**步骤 6：最终化——设置 ready**

- **操作对象**：`useAppStore.loadingState`
- **具体操作**：
  1. 关键任务全部完成（Worker ready + （eager Pyodide 完成或跳过））
  2. 调用 `observabilityCoordinator.init()`（启动 INF-01 的 FPS 追踪 + rAF 循环）
  3. 调用 `useAppStore.setState({ loadingState: "ready" })`
  4. 移除 `document.documentElement.classList.remove("app-loading")`
  5. SIM-03 的 `AppShell` 检测到 `loadingState === "ready"` → 卸载 `<LoadingScreen />`，渲染 `<AppShell>`（含导航栏 + 默认模式 explore 的 3D 场景）
  6. 触发过渡动画：`LoadingScreen` 淡出（`opacity 1→0, 600ms`）+ `AppShell` 淡入（`opacity 0→1, 600ms`，延迟 200ms）
- **输入来源**：步骤 3-5 的任务完成状态
- **输出去向**：`useAppStore.loadingState = "ready"`；`observabilityCoordinator` 开始运行
- **失败行为**：`observabilityCoordinator.init()` 失败（极罕见）→ try-catch 包裹，`console.error` 记录，不阻止 `loadingState` 到 `"ready"`（可观测性不是关键功能）

#### 阶段 C：加载屏幕 UI

**步骤 7：LoadingScreen 渲染与动画**

- **操作对象**：`<LoadingScreen>` React 组件
- **具体操作**：
  1. **深色背景**：`bg-[#0a0a0f]`，叠加微弱的 CSS `background-image` 网格纹理（`linear-gradient` 重复图案，`opacity: 0.03`）
  2. **双摆 Logo**：SVG 图标（两根线条 + 两个圆），使用 CSS `@keyframes pendulum-swing` 动画：上摆以 0.8Hz 简谐摆动（`transform: rotate(...)`），下摆以 2 倍频率叠加摆动。动画使用 `animation-timing-function: ease-in-out`
  3. **标题文字**："混沌实验室"（中文，`font-size: 2rem`，`font-weight: 700`，`letter-spacing: 0.1em`）+ "Chaos Pendulum Lab"（英文，`1rem`，`font-weight: 300`，`opacity: 0.6`）。文字使用 CSS `@keyframes fade-in-up` 入场动画（`opacity 0→1` + `translateY(20px→0)`，持续 800ms）
  4. **进度条**：
     - 进度条容器：`w-80 max-w-[80vw] h-1.5 bg-white/10 rounded-full overflow-hidden`
     - 进度条填充：`h-full bg-gradient-to-r from-blue-500 to-violet-500 rounded-full transition-all duration-300 ease-out`
     - 宽度：`style={{ width: \`${overallProgress * 100}%\` }}`（平滑 CSS transition）
     - 百分比数字：进度条右侧或下方，`text-white/70 text-sm font-mono tabular-nums`
  5. **描述文字**：`text-white/50 text-sm`，显示 `description`（如"正在下载 Python 运行时 (4.1/10.5 MB)"）
  6. **ETA 文字**：只在 `etaSeconds > 0` 时显示 `text-white/30 text-xs`，格式化为"预计剩余 15 秒"或"预计剩余不足 1 分钟"（当 etaSeconds >= 60）
  7. **混沌名言轮播**：
     - 从 `chaos-quotes.ts` 导入 `CHAOS_QUOTES` 数组
     - 使用 `useState(0)` 索引，`setInterval` 每 5 秒递增（循环，`index = (index + 1) % quotes.length`）
     - 切换时使用 CSS `@keyframes crossfade` 交叉淡入淡出（当前名言 `opacity 1→0`，新名言 `opacity 0→1`，各 500ms 重叠）
     - 名言显示区：`max-w-md text-center`
     - 引用文字：`text-white/60 text-base italic leading-relaxed`
     - 作者：`text-white/30 text-sm mt-2`
- **输入来源**：`BootProgress` state（由 `BootManager` 的 `useState` 管理）
- **输出去向**：DOM 中渲染的加载屏幕 UI
- **失败行为**：`CHAOS_QUOTES` 为空数组 → 不显示名言区域（仅保留进度条 + 标题）

**步骤 8：ErrorScreen 渲染**

- **操作对象**：`<ErrorScreen>` React 组件
- **具体操作**：
  1. 显示警告图标（红色圆形 + 白色感叹号，`w-16 h-16`，居中）
  2. 标题："应用启动失败"（`text-2xl font-semibold text-white`）
  3. 错误详情：`text-white/60 text-sm`，显示 `errorMessage`（来自 `BootManager` state）
  4. 按钮区域（`flex gap-4`）：
     - "重试"按钮（`variant="default"`，白色背景 + 深色文字）：点击 → `setLoadingState("loading")` + 清除 error → 重新执行启动流程
     - "离线模式"按钮（`variant="outline"`，白色边框 + 透明背景）：仅在失败原因非 Worker 相关时显示。点击 → 跳过 Pyodide 加载 → `loadingState = "ready"`（Worker 正常则主功能可用）
  5. 提示文字（离线模式下）：`text-white/30 text-xs mt-6`："离线模式下 Python 沙箱不可用，但 3D 实时仿真与分析模式仍可正常运行"
- **输入来源**：`errorMessage: string` + `errorType: "worker" | "pyodide" | "unknown"`
- **输出去向**：DOM 中渲染的错误屏幕 UI
- **失败行为**：用户点击"离线模式"后仍遇到错误 → 再次显示 ErrorScreen（不进入无限循环，因为会跳过失败的任务）

### 依赖与集成接口

| 依赖方 | 具体接口 | 用途 |
|--------|----------|------|
| `useAppStore` | `useAppStore.setState({ loadingState })` | 写入启动状态 |
| `useAppStore` | `useAppStore.getState().updateDebugInfo({ pyodideLoadPct })` | 更新 Pyodide 加载进度 |
| INF-01 | `observabilityCoordinator.init()` | 启动 FPS 追踪 + rAF 循环 + 全局错误捕获 |
| INF-01 | `initErrorCapture(onError)` | 注册全局错误捕获回调 |
| SIM-01 | `createOdeWorker()` | 创建 Worker 实例 |
| SYS-02 | `notify()` | 加载失败时通知用户 |
| SYS-03 | `loadPrecomputeData()` | 后台预取预计算 JSON |
| 浏览器 API | `fetch()` + `response.body.getReader()` | 流式下载 Pyodide（支持进度追踪） |
| 浏览器 API | `indexedDB.open("chaos-pendulum-cache")` | Pyodide WASM 文件缓存（store: `pyodide-cache`） |
| 浏览器 API | `navigator.onLine` | 检测网络状态（决定 CDN 回退是否可用） |
| React | `useLayoutEffect`、`useEffect`、`useState` | 启动流程编排 + 进度 state 管理 |
| Tailwind CSS | `transition-all`、`animate-*`、`@keyframes` | 进度条动画、Logo 摆动、文字淡入、交叉淡入淡出 |

**对外暴露的公共接口（供其他模块消费）**：

| 消费方模块 | 调用方式 | 消费的数据/功能 |
|-----------|---------|---------------|
| `App.tsx` / `main.tsx` | `<BootManager config={...}><App /></BootManager>` | 包裹整个应用，管理启动流程 |
| SIM-03 AppShell | `useAppStore(s => s.loadingState)` | 决定渲染 `<LoadingScreen />` / `<AppShell />` / `<ErrorScreen />` |
| SIM-01 仿真调度 | 启动完成后通过模块级变量获取 Worker 实例 | Worker 引用（`getWorker(): Worker`） |
| LAB-03 usePyodide | 启动完成后通过模块级变量获取 Pyodide 实例 | `getPyodide(): PyodideInterface \| null` |
| INF-01 DebugPanel | `useAppStore(s => s.debugInfo.pyodideLoadPct)` | 调试面板显示 Pyodide 加载进度 |
| 所有功能组件 | `useAppStore(s => s.loadingState)` | 确保仅在 `"ready"` 后渲染功能逻辑 |

### 状态机

#### BootManager 启动状态机

| 当前状态 | 触发事件 | 下一状态 | 前置条件 | 副作用 |
|----------|----------|----------|----------|--------|
| `idle` | React 挂载 BootManager | `loading` | — | `useAppStore.setState({ loadingState: "loading" })`；注册 `initErrorCapture`；添加 `app-loading` CSS class |
| `loading` | Worker `"ready"` 消息收到 | `loading` | — | `bootProgress.phase = "worker_init"` 完成；继续其他任务 |
| `loading` | Pyodide 下载中（eager 模式） | `loading` | `pyodideLoadStrategy === "eager"` | `bootProgress.phase = "pyodide_downloading"`；持续更新 `pyodideLoadPct` |
| `loading` | 预计算后台 fetch 中 | `loading` | `enablePrecomputePrefetch === true` | `bootProgress.phase = "precompute_fetching"`；非阻塞 |
| `loading` | 所有关键任务完成 | `ready` | Worker 已 ready；Pyodide 已 ready 或已跳过；预计算预取完成或已跳过 | `observabilityCoordinator.init()`；`useAppStore.setState({ loadingState: "ready" })`；移除 `app-loading` class；触发出场过渡动画 |
| `loading` | 关键任务失败 | `error` | Worker 初始化失败 或 （Pyodide eager 模式下载失败） | `useAppStore.setState({ loadingState: "error" })`；渲染 `<ErrorScreen />`；通过 SYS-02 通知 |
| `error` | 用户点击"重试" | `loading` | — | 重置所有进度；清除错误信息；重新执行全部启动流程（从步骤 3 开始） |
| `error` | 用户点击"离线模式" | `ready` | 失败原因 != Worker 相关 | 跳过 Pyodide 加载；`loadingState = "ready"` |
| `ready` | LAB-03 用户首次进入实验模式（lazy 策略） | `ready` | `pyodideLoadStrategy === "lazy"` 且 Pyodide 尚未下载 | 后台静默下载 Pyodide（不改变 `loadingState`）；通过 SYS-02 通知"Python 沙箱加载中..." |

### 异常与边界条件

#### 异常 1：Pyodide CDN 下载速度极慢（< 50KB/s）

- **触发条件**：评审现场网络拥堵（如会场 WiFi 饱和），CDN 下载速度 < 50KB/s，总下载 10MB 预计耗时 > 3 分钟
- **处理策略**：
  1. 加载屏幕实时显示精确的下载速度和 ETA
  2. 提供"跳过"按钮（在进度条旁）：用户可主动跳过 Pyodide 下载（等同于离线模式）
  3. 若下载速度持续 < 10KB/s 超过 30 秒 → 自动弹出提示："网络速度较慢，建议切换至离线模式（Python 沙箱不可用但仿真正常）"
  4. 下载不中断——用户可以忽略提示继续等待
- **重试参数**：不重试。用户手动选择"重试"按钮。自动降级阈值：30 秒内速度 < 10KB/s。

#### 异常 2：Worker 初始化在慢设备上超时

- **触发条件**：低端设备（如旧手机、Chromebook）上 Worker 脚本解析 + RK4 模块加载耗时 > 3 秒（`workerTimeoutMs`）
- **处理策略**：
  1. `Promise.race([workerReady, timeout(workerTimeoutMs)])` 触发超时
  2. `loadingState = "error"`，显示"仿真引擎初始化超时"
  3. 用户点击"重试" → `workerTimeoutMs` 翻倍（6 秒）→ 重新创建 Worker
  4. 第二次仍超时 → 提示"您的设备可能不满足性能要求，请使用桌面浏览器"
- **重试参数**：第 1 次超时后 `workerTimeoutMs *= 2`；第 2 次仍超时不再重试。

#### 异常 3：IndexedDB 写入 Pyodide 缓存时页面被关闭（缓存不完整）

- **触发条件**：用户在 Pyodide 下载完成后（WASM 实例化中）关闭了标签页，`cachePyodideToIndexedDB` 的 `put()` 操作被中断，IndexedDB 中留下不完整的 ArrayBuffer
- **处理策略**：
  1. Pyodide 缓存写入使用**两阶段提交**：
     - 阶段 1：写入临时键 `pyodide-core-{VERSION}-tmp`（完整 ArrayBuffer）
     - 阶段 2：完成验证后重命名为 `pyodide-core-{VERSION}`（原子操作：`store.delete(tmpKey)` + `store.put(finalEntry)`）
  2. 下次启动时，检查 `*-tmp` 键是否存在 → 存在说明上次写入中断 → 删除临时键，回退到 CDN 下载
  3. 正式缓存的完整性校验：写入时记录 `size`，下次读取时比较 `data.byteLength === size` → 不一致则删除缓存并重试
- **重试参数**：不重试。下次启动时自动清理 + 重新下载。

#### 异常 4：混沌名言数组为空

- **触发条件**：`src/shared/data/chaos-quotes.ts` 文件存在但导出空数组 `[]`
- **处理策略**：
  1. 加载屏幕检测 `CHAOS_QUOTES.length === 0` → 不渲染名言区域
  2. 进度条和标题仍正常显示
  3. Console 记录 `"[BootManager] 名言数据为空，已跳过轮播"`
- **重试参数**：不适用。非关键 UI 功能降级。

#### 异常 5：预计算预取在 ready 之后才完成（竞态条件）

- **触发条件**：Worker 快速就绪（< 500ms）→ `loadingState = "ready"` → 过渡动画播放中，但预计算 JSON fetch 仍在进行（大文件，慢网络）。此时用户可能在过渡动画完成前就切换到分析模式。
- **处理策略**：
  1. 预计算预取不阻塞 `loadingState` 到 `"ready"`（设计如此，不是 bug）
  2. `BootManager` 维护 `precomputePrefetchPromise`，在 `loadingState = "ready"` 后不取消（让其完成）
  3. ANL-01/ANL-02 的 `usePrecomputeData` 有自己的 IndexedDB 缓存检查——如果预取已完成（数据已在 IndexedDB 中），首次加载命中缓存（0ms）；如果预取未完成，`usePrecomputeData` 自行 fetch
  4. 不向用户暴露此竞态（用户体验无差异：要么命中缓存，要么首次 fetch）
- **重试参数**：不适用。

### 原则兑现清单

| 原则来源 | 原则名称 | 代码级约束 |
|----------|----------|------------|
| 功能模块全拆解 §附录 B | 避免白屏 | `<LoadingScreen>` 在 React 挂载后立即渲染（`useLayoutEffect` 设置 `loadingState = "loading"`），确保首个有意义绘制在 JS bundle 解析后 < 50ms |
| 功能模块全拆解 §附录 B | 加载进度透明 | 进度条显示整体百分比 + 已下载/总量（字节）+ ETA；阶段描述文字持续更新 |
| 功能模块全拆解 §附录 B | 优雅失败与恢复 | `ErrorScreen` 提供"重试"和"离线模式"两个恢复路径；离线模式下保留全部非 Pyodide 功能 |
| 技术栈设计 §5.1 | 并行启动 | Worker 初始化、Pyodide 下载、预计算预取三个任务并行执行。仅 Worker 为关键路径阻塞 ready |
| 技术栈设计 §5.2 | 三级缓存 | Pyodide 下载严格遵循：本地文件系统 → IndexedDB → CDN。每层都检查 + 回退；下载成功后自动回填 IndexedDB |
| 技术栈设计 §5.2 | 离线可用 | `navigator.onLine === false` 时跳过 CDN 回退；`file://` 协议下优先本地文件系统；IndexedDB 缓存使二次访问秒开（无网络请求） |
| 技术栈设计 §1.2 | 首屏体积 < 5MB | 本模块的 `<LoadingScreen>` + `BootManager` 代码 < 300 行；不引入额外的 npm 动画库（CSS 动画 + framer-motion 轻量版） |
| AGENT.md 核心原则 | 逻辑层与表现层分离 | `BootManager`（启动流程编排、异步任务管理）是逻辑层；`<LoadingScreen>` 和 `<ErrorScreen>`（纯 UI 渲染）是表现层；两者通过 `BootProgress` state 和 `useAppStore.loadingState` 解耦 |

### 验收测试场景

#### 正向测试 1：正常启动流程（桌面，在线，eager Pyodide）

- **Given**：
  - 桌面浏览器，网络正常
  - `BootConfig = { pyodideLoadStrategy: "eager", enablePrecomputePrefetch: true, showQuotes: true }`
  - IndexedDB 中无 Pyodide 缓存（首次访问）
  - `/public/pyodide/` 目录不存在（本地文件系统未提供）
- **When**：用户打开应用 URL
- **Then**：
  1. React 挂载 → `loadingState = "loading"` → `<LoadingScreen />` 渲染（深色背景 + Logo 动画 + 标题）
  2. Worker 初始化：console 显示 Worker `"ready"` 消息（< 500ms）
  3. Pyodide 下载：检查本地文件 → 不存在；检查 IndexedDB → 未命中；CDN fetch 开始
  4. 进度条从 0% 逐渐增长：下载阶段（15%→75%），初始化阶段（75%→85%）
  5. 加载屏幕显示：进度条 + "正在下载 Python 运行时 (4.1/10.5 MB)" + "预计剩余 15 秒" + 混沌名言轮播（每 5 秒切换）
  6. 下载完成 + WASM 初始化 → `loadingState = "ready"`
  7. `<LoadingScreen />` 淡出（opacity 0, 600ms），`<AppShell />` 淡入（opacity 1, 600ms）
  8. 默认探索模式 3D 场景开始渲染（`<Canvas>` 挂载，双摆开始运动）
  9. 整个启动过程在 30-60 秒内完成（取决于网络速度）
  10. IndexedDB `pyodide-cache` store 中存在 `pyodide-core-0.26.1` 条目

#### 正向测试 2：二次访问秒开（IndexedDB 缓存命中）

- **Given**：
  - 同正向测试 1，但 IndexedDB `pyodide-cache` store 中已有完整的 Pyodide 缓存
  - Worker IndexedDB 无缓存（Worker 为纯 JS，不涉及 IndexedDB）
- **When**：用户刷新页面或再次打开应用
- **Then**：
  1. `loadingState = "loading"` → `<LoadingScreen />` 渲染
  2. Worker 初始化：同正向测试 1（< 500ms）
  3. Pyodide 加载：检查本地文件 → 不存在；检查 IndexedDB → **命中缓存**
  4. WASM 初始化从 IndexedDB ArrayBuffer 直接注入（无网络请求）
  5. 总启动时间 < 5 秒（仅 Worker 初始化 + WASM 实例化 + React 渲染）
  6. Network DevTools 面板中**无** CDN 请求（`pyodide.js` / `pyodide.asm.wasm` 等）
  7. `source` 在 console 中标注为 `"indexeddb-cache"`

#### 正向测试 3：懒加载 Pyodide——不阻塞启动

- **Given**：
  - `pyodideLoadStrategy = "lazy"`，`enablePrecomputePrefetch = true`
  - Worker 正常就绪（< 500ms）
- **When**：用户打开应用
- **Then**：
  1. `loadingState` 在 Worker ready 后直接变为 `"ready"`（不等待 Pyodide）
  2. 总启动时间 < 3 秒（仅 Worker + React + 过渡动画）
  3. 后台 Pyodide 下载静默进行（不显示在加载屏幕进度条中，因为 `loadingState` 已是 `"ready"`）
  4. 用户切换到 Lab 模式时：若 Pyodide 已下载完成 → 直接可用；若仍在下载 → 显示"Python 沙箱加载中..."Toast（SYS-02 的 `notify()`）
  5. Pyodide 下载完成后，`pyodideLoadPct` 更新为 100

#### 异常测试 1：Worker 初始化超时

- **Given**：
  - `workerTimeoutMs = 3000`
  - Mock Worker 创建后不发送 `"ready"` 消息（模拟 Worker 脚本解析失败）
- **When**：`BootManager` 启动流程执行到步骤 3
- **Then**：
  1. `Promise.race` 在 3 秒后触发超时
  2. `loadingState = "error"`
  3. `<ErrorScreen />` 渲染：标题"应用启动失败"，错误详情"仿真引擎初始化超时，请刷新重试"
  4. 仅显示"重试"按钮（无"离线模式"——Worker 是必需的）
  5. `console.error` 记录超时事件
  6. 用户点击"重试" → `loadingState = "loading"` → 重新创建 Worker（`workerTimeoutMs` 翻倍至 6 秒）

#### 异常测试 2：Pyodide 三层缓存全失败（lazy 模式 → 不阻塞）

- **Given**：
  - `pyodideLoadStrategy = "lazy"`
  - 本地 `/public/pyodide/` 不存在
  - IndexedDB 未命中
  - `fetch()` 到 CDN 返回 HTTP 500（模拟 CDN 不可达）
- **When**：`BootManager` 在后台执行 Pyodide 下载
- **Then**：
  1. Worker ready → `loadingState = "ready"`（不阻塞，因为 lazy 模式）
  2. 后台加载失败 → `pyodideLoadPct = -1`
  3. 用户无感知（无 Toast、无 ErrorScreen）
  4. 用户切换到 Lab 模式 → LAB-03 检测到 Pyodide 不可用 → 通过 SYS-02 `notify()` 显示：
     - Toast："Python 沙箱不可用：CDN 加载失败。请检查网络连接或刷新重试。实时仿真仍可用"（`PYODIDE_LOAD_FAILED` 错误码）
  5. Lab 模式显示占位内容（代码编辑器区域显示"Python 沙箱不可用"）

#### 异常测试 3：用户主动跳过 Pyodide 下载（慢速网络）

- **Given**：
  - `pyodideLoadStrategy = "eager"`
  - Pyodide 正在从 CDN 下载，速度约 20KB/s（预计剩余 8 分钟）
  - `<LoadingScreen />` 显示进度条 + ETA："预计剩余 8 分钟"
- **When**：用户点击"跳过"按钮（在进度条旁）
- **Then**：
  1. `fetch()` 被 AbortController 中断
  2. `loadingState = "ready"`（跳过 Pyodide，启动继续）
  3. `<AppShell />` 正常渲染，仿真正常运行
  4. Toast 显示："Python 沙箱未加载，实验模式将不可用"（info 级别，持续 5 秒）
  5. 用户后续切换到 Lab 模式 → 同异常测试 2：代码编辑器区域显示"Python 沙箱不可用"

#### 异常测试 4：IndexedDB Pyodide 缓存损坏

- **Given**：
  - IndexedDB `pyodide-cache` store 中存在 `pyodide-core-0.26.1` 条目，但 `data.byteLength` 为 1000（不完整/损坏）
- **When**：`BootManager` 尝试从 IndexedDB 加载 Pyodide
- **Then**：
  1. 检查 `data.byteLength !== entry.size`（期望 8MB，实际 1KB）→ 判定缓存损坏
  2. 删除损坏的缓存条目：`store.delete("pyodide-core-0.26.1")`
  3. 回退到 CDN 下载（第三层缓存）
  4. Console 记录 `"[BootManager] Pyodide 缓存损坏 (size mismatch)，已删除并回退至 CDN"`
  5. 不弹出 Toast 通知用户（内部降级，用户无需感知）

### 注意事项与禁止行为

1. **【loadingState 唯一写入者】** SYS-04 是 `useAppStore.loadingState` 的**唯一生产者**。任何其他模块禁止调用 `useAppStore.setState({ loadingState: ... })`。SIM-03 的 `AppShell` 仅通过 `useAppStore(s => s.loadingState)` 读取以决定渲染 `<LoadingScreen />` / `<AppShell />` / `<ErrorScreen />`。

2. **【Pyodide 缓存 store 独立于预计算缓存 store】** IndexedDB 中 Pyodide 缓存使用 `pyodide-cache` object store，预计算数据使用 `precompute` object store。两者在同一个数据库 `chaos-pendulum-cache` 中但 object store 分离。禁止混用——Pyodide 缓存存储 `ArrayBuffer`（二进制），预计算缓存存储 JSON 对象。

3. **【启动流程不可逆】** `loadingState` 的流转是单向的：`"loading" → "ready"` 或 `"loading" → "error"`。`"ready"` 后不可回退到 `"loading"`。`"error"` 后点击"重试"会创建新的启动流程（本质上是重置后重新开始，不是状态回退）。

4. **【禁止在 BootManager 之外判断启动状态】** 功能组件不应通过检查 `Worker === null` 或 `Pyodide === null` 来判断应用是否就绪。必须通过 `useAppStore(s => s.loadingState)` 读取。启动完成的语义是"BootManager 已确认所有关键资源就绪"，而非"某个特定对象非 null"。

5. **【混沌名言版权】** `chaos-quotes.ts` 中的名言必须标注出处。评审现场展示的引用需符合学术引用规范（作者 + 作品名）。禁止使用无出处或 AI 生成的名言。

6. **【Pyodide 两阶段缓存写入】** 为防止 IndexedDB 写入中断导致缓存损坏：1) 先写入临时键 `{resourceKey}-tmp`；2) 验证 `tmp.data.byteLength === expectedSize`；3) 删除旧正式键（如有）；4) 将临时键重命名为正式键（通过 `store.get(tmpKey)` → `store.put(entry)` → `store.delete(tmpKey)` 三步）。禁止直接 `store.put(entry)` 写入正式键。

7. **【Worker 超时仅重试 2 次】** 首次超时（3s）→ `workerTimeoutMs` 翻倍（6s）→ 第 2 次仍超时 → 不再重试，显示 ErrorScreen。禁止无限制重试（用户等待体验极差）。

8. **【易错点】** `navigator.onLine` 在浏览器中的语义是"浏览器认为网络可达"，不等于"CDN 具体可达"。`navigator.onLine === true` 时 CDN 仍可能返回 5xx 或超时（DNS 解析成功但 TCP 连接失败）。因此 `navigator.onLine` 仅用于**跳过** CDN 尝试（`false` 时直接不尝试），不能用于**保证** CDN 成功。

9. **【易错点】** `<LoadingScreen />` 渲染时，`useAppStore` 的其他字段（`deviceType`、`activeMode`）可能仍未初始化。`<LoadingScreen />` 不应依赖这些字段做布局判断。它在所有设备上使用相同的居中布局（`flex items-center justify-center`）。

10. **【偷懒红线】** 禁止使用 `window.alert()` 或 `confirm()` 展示启动错误。必须渲染 `<ErrorScreen />` 组件，提供与 `<LoadingScreen />` 一致的视觉体验和具体的错误消息 + 恢复路径。
