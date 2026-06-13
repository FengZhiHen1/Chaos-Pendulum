# 功能点：SYS-02 运行时异常处理

> **文档生成时间**：2026-04-28 21:34:30 CST
> **版本记录**：
> | 版本 | 时间 | 修改人 | 变更摘要 |
> |------|------|--------|----------|
> | v1.0 | 2026-04-28 21:34:30 | AI Assistant | 初始版本，对齐 ANL-01~04 已确立的 useToast() 消费约定 + SIM-01 Worker 错误协议 + INF-01 错误捕获边界 |

> **冲突核查指引**：本模块是统一通知/降级通道的**唯一提供者**。所有其他模块的 Toast 通知、后台暂停、长运行降级、Worker 崩溃恢复均通过本模块的接口触发。INF-01 负责错误**采集**（写入 `debugInfo.errors`），本模块负责错误**响应**（翻译 + 通知 + 降级）。两者职责互补，不存在重叠。

### 所属模块与溯源

- **对应总设计章节**：功能设计_v0 §九「异常处理与边界设计」（6 种用户行为 → 系统响应矩阵）；§五 5.3「错误捕获与友好提示」；技术栈设计 §7「异常处理矩阵」（9 种异常场景）、§3.1 架构分层图（Obs 层 → Store → UI 反馈）；功能模块全拆解 附录 C 边界决策记录 4「SYS-02 不拆分」
- **依赖的其他功能模块**：
  - `INF-01`（应用可观测性）— 提供全局错误捕获事件（`initErrorCapture` 回调），本模块监听此回调并执行中文错误翻译 + Toast 通知
  - `SIM-01`（双摆物理引擎）— 提供 Worker 实例引用、Worker 状态（`engineError`、Worker `onerror` 事件），本模块据此执行崩溃恢复
  - `SYS-01`（响应式布局引擎）— 提供 `deviceType`，本模块据此决定 Toast 位置（桌面右上 / 移动顶部）
  - `SIM-02`（参数控制面板）— 参数非法时 SIM-02 自身处理红框震动 + Tooltip；仅当需要全局通知时（如"3D 场景已冻结"），SIM-02 调用本模块的 `notify()` 方法
- **被依赖模块**：
  - `ANL-01`~`ANL-04`（分析模式全部图表）— 消费 `useToast()` 展示数据加载失败、参数填充失败等通知
  - `ANL-03`（庞加莱截面）— 消费 `useToast()` 展示条件非法、截面点截断、基准保存等通知
  - `LAB-03`（用户可编程沙箱）— 消费错误翻译词典（`translateError`）将 Python traceback 转为中文友好提示
  - `SIM-01`（双摆物理引擎）— 消费 Worker 崩溃恢复流程（本模块编排重建 → 恢复参数 → Toast 通知）
  - `EXP-01`（3D 仿真场景）— 消费 `useVisibilityChange()` 决定是否暂停渲染循环
  - `EXP-03`（声音化引擎）— 消费 `useVisibilityChange()` 决定是否暂停/恢复 AudioContext
  - `SYS-03`（预计算数据管线）— 消费 `useToast()` 展示预计算数据加载失败与离线模式提示

### 已有设计兼容性分析

- **已审查的相关规格文档**：
  - `ANL-01-李雅普诺夫指数谱.md` v1.0：依赖 `SYS-02` 的 `useToast()`（shadcn/ui），用于数据加载失败和参数填充失败通知。Toast 持续 5s 的约定已记录。
  - `ANL-02-参数空间分岔图.md` v1.0：依赖 `SYS-02` 的 `useToast()`，用于数据加载失败、扫描范围无效、版本不匹配等通知。使用 `useToast()` 的模式（`toast({ title, description, duration: 5000 })`）已确立。
  - `ANL-03-庞加莱截面.md` v1.0：依赖 `SYS-02` 的 `useToast()`，用于条件非法、截面点截断、基准保存、Worker 崩溃等通知。Toast 调用频率较高（截面点截断、范围固定、采集恢复等多种场景）。
  - `ANL-04-能量景观地形图.md` v1.0：依赖 `SYS-02` 的 `useToast()`，用于参数非法、WebGL 上下文丢失通知。
  - `SIM-01-双摆物理引擎.md` v2.1：Worker 错误协议（`WorkerErrorResponse` 含 `code` + `message`）、Worker 崩溃恢复流程（`worker.onerror` → 重建 → 恢复参数 → toast 提示）。本模块编排此恢复流程，不重复实现 Worker 重建逻辑（Worker 重建由 SIM-01 的通信管理层执行）。
  - `SIM-02-参数控制面板.md` v1.1：`validateParam` 函数的 `ValidationResult.level` 含 `"error"` / `"warning"` / `null`。本模块不为 SIM-02 的字段级校验提供通知（SIM-02 自身处理红框震动 + Tooltip），仅在全局级异常（如"3D 场景冻结"持续 > 10s）时被 SIM-02 调用。
  - `INF-01-应用可观测性.md` v1.0：`initErrorCapture` 回调写入 `debugInfo.errors`。本模块与 INF-01 职责分离明确：INF-01 采集（被动记录），SYS-02 响应（主动处理 + 用户反馈）。两者通过 `initErrorCapture` 的 `onError` 回调桥接——INF-01 捕获后通知 SYS-02 执行翻译 + Toast。
  - `双摆混沌实验室-技术栈设计.md` v1.2：§7 异常处理矩阵（9 种异常场景）、§9.3 `window.onerror` + `unhandledrejection` 全局捕获（由 INF-01 实现，本模块消费）
  - `双摆混沌实验室-项目结构.md` v1.0：`shared/hooks/useVisibilityChange.ts` 的位置与本模块一致
- **兼容性结论**：
  - 无冲突。本模块是统一通知/降级通道的**唯一提供者**，所有已有消费模块（ANL-01~04）已通过 `useToast()` 引用确立了调用约定。
  - Toast 接口与 shadcn/ui 的 `useToast()` 完全兼容（本模块直接封装 shadcn/ui Sonner 或自建 Toast 组件，对外暴露相同的 `toast(props)` 函数签名）。
  - 本模块不写入 `debugInfo.errors`（INF-01 独占写入权），仅读取 `debugInfo.errors` 用于展示历史错误或触发翻译。
  - Worker 崩溃恢复流程在 SIM-01 中已定义（重建 → 恢复参数 → toast），本模块提供该流程的编排入口（`recoverWorker()`），不做重复实现。
- **复用的已有定义**：
  - `useToast()` 的函数签名（`toast({ title, description, variant?, duration? })`）——由 ANL-01~04 已确立的调用约定
  - `WorkerErrorResponse` 类型（`type: "error"`, `code: string`, `message: string`, `simTime: number`）——来自 SIM-01 的 Worker 消息协议
  - `ValidationResult.level`（`"error" | "warning" | null`）——来自 SIM-02 的校验结果类型
  - `ObservabilityCoordinator.initErrorCapture` 的 `onError` 回调——来自 INF-01

### 技术栈绑定

- **必须使用**：
  - `react@^18.3.1` — Toast 组件的 React 渲染、Context Provider、自定义 hook
  - `shadcn/ui`（Copy 模式）— `Sonner`（toast 通知组件，推荐）或自建 Toast 组件（基于 Radix `Toast` 原语）。**优先 Sonner**（更轻量、支持 Promise toast、支持富文本）
  - `tailwindcss@^3.4.16` — Toast 样式（位置：桌面 `top-right` / 移动 `top-center`）、动画（`animate-in slide-in-from-right`）
  - `lucide-react` — Toast 内图标：`CheckCircle`（成功 / 绿色）、`AlertTriangle`（警告 / 黄色）、`XCircle`（错误 / 红色）、`Info`（信息 / 蓝色）、`Loader`（加载中）
  - TypeScript 5.x — 错误码枚举、翻译词典的类型安全
  - 浏览器原生 `document.visibilitychange` — 页面可见性检测（后台自动暂停）
  - 浏览器原生 `setTimeout` / `setInterval` — 长运行定时器
- **禁止使用**：
  - 禁止各模块独立引入 `sonner` 或 `react-hot-toast` 的 `toast()` 函数并直接调用。所有 Toast 必须通过本模块暴露的 `useToast()` hook 或 `notify()` 函数触发，确保全局统一的样式、位置、持续时间和去重逻辑
  - 禁止在多个组件中各自注册 `visibilitychange` 监听器。必须通过本模块的 `useVisibilityChange()` hook 统一监听，由 hook 写入 Zustand（或通过 Context），所有消费组件从 hook 读取
  - 禁止硬编码中文错误消息分散在各功能模块中。所有中文错误翻译必须通过本模块的 `translateError(code, context?)` 函数查询，确保错误文案一致且可全局更新
  - 禁止直接调用 `worker.terminate()` + `new Worker(...)` 做崩溃恢复。必须通过本模块的 `recoverWorker()` 编排函数执行
  - 禁止在 `setTimeout` 中硬编码 10 分钟（600000ms）。长运行阈值必须通过 `LONG_RUNNING_THRESHOLD_MS` 常量引用

### 输入定义（精确类型）

#### 1. 错误码与翻译词典（`src/shared/lib/error-translation/types.ts`）

```typescript
/**
 * 系统错误码枚举。
 * 覆盖所有模块可能产生的运行时异常。
 * 各模块在捕获异常后，将原始错误映射为此枚举值，再调用 translateError() 获取中文消息。
 */
type ErrorCode =
  // ===== Worker/仿真引擎 (SIM-01) =====
  | "ENGINE_DIVERGED"          // ODE 积分数值发散（NaN/Infinity）
  | "ENGINE_INVALID_STATE"     // Worker 未初始化状态下收到 step 命令
  | "ENGINE_INVALID_PARAM"     // 参数校验失败（负质量/零摆长等）
  | "ENGINE_WORKER_CRASH"      // Worker 线程崩溃
  | "ENGINE_WORKER_TIMEOUT"    // Worker 批量积分超时（>2s）
  | "ENGINE_POOL_EXHAUSTED"    // Float64Array 传输池耗尽

  // ===== 预计算数据 (SYS-03 / ANL-01~04) =====
  | "PRECOMPUTE_FETCH_FAILED"  // 预计算 JSON 文件 fetch 失败（HTTP 404/500）
  | "PRECOMPUTE_FORMAT_ERROR"  // 预计算 JSON 格式错误（schema 不匹配）
  | "PRECOMPUTE_VERSION_MISMATCH" // 预计算数据 solverVersion 与期望不匹配
  | "PRECOMPUTE_GRID_INVALID"  // 参数网格配置非法（max <= min）

  // ===== Pyodide/用户沙箱 (LAB-03) =====
  | "PYODIDE_LOAD_FAILED"      // Pyodide WASM 三级缓存全失败
  | "PYODIDE_TIMEOUT"          // 用户代码执行超时（>5s）
  | "PYODIDE_IMPORT_BLOCKED"   // 用户代码尝试导入白名单外的库
  | "PYODIDE_RUNTIME_ERROR"    // 用户 Python 代码运行时异常

  // ===== WebGL/渲染 =====
  | "WEBGL_CONTEXT_LOST"       // WebGL 上下文丢失（GPU 驱动崩溃/设备休眠）
  | "WEBGL_NOT_SUPPORTED"      // 浏览器不支持 WebGL

  // ===== 通用运行时 =====
  | "UNCAUGHT_JS_ERROR"        // 未捕获的 JavaScript 异常
  | "UNHANDLED_PROMISE"        // 未处理的 Promise rejection
  | "STORAGE_QUOTA_EXCEEDED"   // IndexedDB/localStorage 存储配额超限
  | "CLIPBOARD_UNAVAILABLE";   // navigator.clipboard 不可用

/**
 * 错误翻译条目。
 * 每个错误码对应一条中文消息模板。
 * 模板中 `{param}` 格式的占位符由 context 参数替换。
 */
interface ErrorTranslationEntry {
  /** 对应 ErrorCode 的值 */
  code: ErrorCode;
  /**
   * 中文消息模板，支持 `{param}` 占位符。
   * 示例："积分已发散于 t={simTime}s，请减小步长或更换积分方法"
   */
  template: string;
  /**
   * Toast 类型。
   * "error": 红色 XCircle 图标，持续 8s
   * "warning": 黄色 AlertTriangle 图标，持续 5s
   * "info": 蓝色 Info 图标，持续 3s
   * "success": 绿色 CheckCircle 图标，持续 2s
   */
  level: "error" | "warning" | "info" | "success";
  /**
   * 默认 Toast 持续时间（毫秒）。
   * 范围：2000-10000。0 表示不自动消失（需用户手动关闭）。
   * 默认：error=8000, warning=5000, info=3000, success=2000。
   */
  durationMs: number;
  /**
   * 是否可重试（true = Toast 额外显示"重试"按钮）。
   * 默认 false。仅可恢复的异常设为 true（如网络加载失败）。
   */
  retryable: boolean;
}
```

#### 2. Toast 通知接口

```typescript
/**
 * Toast 通知的输入参数。
 * 与 shadcn/ui Sonner 的 toast() 完全兼容。
 */
interface ToastInput {
  /**
   * Toast 标题（粗体单行）。
   * 必填。示例："积分已发散"
   * 约束：最大 40 个字符，超出截断。
   */
  title: string;

  /**
   * Toast 描述（正文，可选）。
   * 若提供，显示在标题下方，最多 2 行（超出省略）。
   * 示例："当前轨迹包含 NaN 值，请减小步长或更换积分方法"
   */
  description?: string;

  /**
   * Toast 类型，决定图标和边框颜色。
   * 默认 "info"。
   * "error"：红色左边框 + XCircle 图标
   * "warning"：黄色左边框 + AlertTriangle 图标
   * "info"：蓝色左边框 + Info 图标
   * "success"：绿色左边框 + CheckCircle 图标
   * "loading"：灰色左边框 + Loader 旋转图标（用于异步操作的进行中状态）
   */
  variant?: "error" | "warning" | "info" | "success" | "loading";

  /**
   * 自动消失时间（毫秒）。
   * 默认：error=8000, warning=5000, info=3000, success=2000, loading=0（不自动消失）。
   * 设为 0 表示不自动消失（用户手动关闭）。
   */
  durationMs?: number;

  /**
   * Toast 上的操作按钮配置。
   * 最多 1 个操作按钮 + 1 个关闭按钮。
   * 未提供时不显示操作按钮。
   */
  action?: {
    /** 按钮文字。最大 6 个字符。示例："重试"、"恢复" */
    label: string;
    /** 点击按钮的回调 */
    onClick: () => void;
  };

  /**
   * Toast 唯一标识符（可选）。
   * 提供时：同 id 的 Toast 会更新而非新增（用于进度条类通知）。
   * 未提供时：每次调用新增一个 Toast。
   * 示例："pyodide-loading"（Pyodide 加载进度更新同一 Toast）
   */
  id?: string;
}

/**
 * useToast() 返回的 toast 函数签名。
 * 所有消费模块（ANL-01~04、SIM-01、LAB-03 等）通过此函数发出通知。
 */
type ToastFunction = (input: ToastInput) => void;
```

#### 3. 错误翻译函数输入/输出

```typescript
/**
 * translateError 函数的输入参数。
 */
interface TranslateErrorInput {
  /**
   * 错误码。必须为 ErrorCode 枚举值之一。
   * 若传入未知 code → 降级为 UNCAUGHT_JS_ERROR 的翻译。
   */
  code: ErrorCode;

  /**
   * 模板占位符的上下文值。
   * key 对应模板中 `{param}` 的 param 名称。
   * value 为替换值的字符串形式。
   * 示例：{ simTime: "5.23", method: "RK4" }
   * 未提供的占位符在输出中保留原始 `{param}` 文本。
   */
  context?: Record<string, string>;

  /**
   * 附加的原始错误消息（可选）。
   * 若提供，附加在翻译后消息的括号中。
   * 示例：translateError({ code: "UNCAUGHT_JS_ERROR", originalMessage: "TypeError: cannot read property 'x' of undefined" })
   * 输出："未捕获的 JavaScript 异常 (TypeError: cannot read property 'x' of undefined)"
   */
  originalMessage?: string;
}

/**
 * translateError 函数的返回值。
 */
interface TranslateErrorOutput {
  /** 翻译后的中文消息（模板已替换占位符） */
  message: string;
  /** 对应的 Toast 类型 */
  level: "error" | "warning" | "info" | "success";
  /** 默认 Toast 持续时间（毫秒） */
  durationMs: number;
  /** 是否可重试 */
  retryable: boolean;
  /** 原始错误码（透传） */
  code: ErrorCode;
}
```

#### 4. 后台检测 Hook 输入/输出

```typescript
/**
 * useVisibilityChange hook 的输入选项。
 * 无必填参数，所有字段可选。
 */
interface UseVisibilityChangeOptions {
  /**
   * 页面变为不可见时（切后台）的回调。
   * 默认：调用 autoPause() → 暂停仿真 + 暂停声音化。
   * 设为自定义回调以覆盖默认行为（如故事模式需要不同的暂停策略）。
   */
  onHidden?: () => void;

  /**
   * 页面恢复可见时（切回前台）的回调。
   * 默认：显示 Toast "已暂停，点击继续" + 等待用户手动恢复。
   * 设为自定义回调以覆盖默认行为。
   */
  onVisible?: () => void;

  /**
   * 是否启用（默认 true）。
   * 设为 false 时 hook 不监听 visibilitychange（如故事模式演示中禁止自动暂停）。
   */
  enabled?: boolean;
}

/**
 * useVisibilityChange hook 的返回值。
 */
interface VisibilityState {
  /**
   * 页面当前是否可见。
   * true = 页面在前台（document.visibilityState === "visible"）
   * false = 页面在后台（document.visibilityState === "hidden"）
   */
  isVisible: boolean;

  /**
   * 页面是否有过切后台事件（自本次挂载以来）。
   * 用于判断是否需要显示"点击恢复"提示。
   */
  wasHidden: boolean;
}
```

#### 5. 长运行检测配置

```typescript
/**
 * 长运行检测的配置常量（`src/shared/lib/error-translation/constants.ts`）。
 */
const LONG_RUNNING_CONFIG = {
  /**
   * 长运行阈值（毫秒）。
   * 默认 600000（10 分钟）。
   * 仿真连续运行超过此时间 → 触发降级。
   */
  THRESHOLD_MS: 600000,

  /**
   * 降级后的积分步长（秒）。
   * 从默认 1/60 秒（≈16.7ms）增至 1/30 秒（≈33.3ms）。
   */
  DEGRADED_DT: 1 / 30,

  /**
   * 降级后的尾迹最大长度（步数）。
   * 从桌面端的 1000 降至 500。
   */
  DEGRADED_TRAIL_LENGTH: 500,

  /**
   * 降级触发前的预警时间（毫秒）。
   * 在阈值前 60s 显示预警 Toast："仿真已运行较长时间，即将自动降低精度"
   */
  WARNING_BEFORE_MS: 60000,

  /**
   * 检测间隔（毫秒）。
   * 每 30 秒检查一次累计运行时长（避免高频 setTimeout）。
   */
  CHECK_INTERVAL_MS: 30000,
} as const;
```

#### 6. Worker 崩溃恢复配置

```typescript
/**
 * Worker 崩溃恢复的配置。
 */
interface WorkerRecoverConfig {
  /**
   * 最大自动恢复次数。
   * 默认 3。超过此次数后不再自动恢复，显示 Toast "仿真引擎无法自动恢复，请刷新页面"。
   */
  maxAutoRecovery: number;

  /**
   * 恢复重试间隔（毫秒）。
   * 默认 500。两次恢复尝试之间等待的时间。
   */
  retryDelayMs: number;

  /**
   * 恢复成功后是否自动继续仿真。
   * 默认 true。设为 false 时恢复后保持暂停状态，等待用户手动点击播放。
   */
  autoResumeAfterRecovery: boolean;
}
```

### 输出定义（精确类型）

#### 1. 公共导出（`src/features/system/error-handling/index.ts`）

```typescript
/**
 * SYS-02 运行时异常处理模块的公共接口。
 * 所有消费模块（ANL-01~04、SIM-01、LAB-03 等）从此文件导入。
 */

// ---- Toast 通知 ----
export { useToast } from "./hooks/useToast";
// useToast(): { toast: ToastFunction }
// 返回一个 toast 函数，用于触发全局 Toast 通知。

export { notify } from "./notify";
// notify(input: ToastInput): void
// 模块级函数（无需在 React 组件内调用），用于回调或非 React 上下文中触发 Toast。

// ---- 错误翻译 ----
export { translateError } from "./error-dictionary";
// translateError(input: TranslateErrorInput): TranslateErrorOutput
// 将 ErrorCode + context 翻译为中文消息 + Toast 配置。

// ---- 后台检测 ----
export { useVisibilityChange } from "./hooks/useVisibilityChange";
// useVisibilityChange(options?: UseVisibilityChangeOptions): VisibilityState
// 监听 document.visibilitychange，返回当前可见性状态。

export { useAutoPause } from "./hooks/useAutoPause";
// useAutoPause(): { isAutoPaused: boolean; resume: () => void }
// 组合 hook：后台时自动暂停仿真 + 声音化；切回时显示"点击继续"Toast。
// 供 EXP-01（3D 场景）和 EXP-03（声音化引擎）消费。

// ---- 长运行降级 ----
export { useLongRunningDetector } from "./hooks/useLongRunningDetector";
// useLongRunningDetector(options?: { enabled?: boolean }): { isDegraded: boolean; elapsedMs: number }
// 检测仿真连续运行时长，超过阈值时自动触发降级。

// ---- Worker 崩溃恢复 ----
export { useWorkerRecovery } from "./hooks/useWorkerRecovery";
// useWorkerRecovery(workerRef: RefObject<Worker | null>, config?: Partial<WorkerRecoverConfig>): { recoveryCount: number; recover: () => Promise<void> }
// Worker 崩溃时编排重建 → 恢复参数 → Toast 通知。

// ---- 类型导出 ----
export type {
  ErrorCode,
  ToastInput,
  ToastFunction,
  TranslateErrorInput,
  TranslateErrorOutput,
  VisibilityState,
  UseVisibilityChangeOptions,
} from "./types";
```

#### 2. 错误翻译词典（完整条目，`src/features/system/error-handling/error-dictionary.ts`）

```typescript
/**
 * 完整的错误码 → 中文消息映射表。
 * 每一条目包含：模板、级别、默认持续时长、是否可重试。
 */

const ERROR_DICTIONARY: Record<ErrorCode, ErrorTranslationEntry> = {
  // ---- Worker/仿真引擎 ----
  ENGINE_DIVERGED: {
    code: "ENGINE_DIVERGED",
    template: "积分已发散于 t={simTime}s，请减小步长或更换积分方法",
    level: "error",
    durationMs: 8000,
    retryable: true,
  },
  ENGINE_INVALID_STATE: {
    code: "ENGINE_INVALID_STATE",
    template: "仿真引擎状态异常：{reason}",
    level: "error",
    durationMs: 5000,
    retryable: false,
  },
  ENGINE_INVALID_PARAM: {
    code: "ENGINE_INVALID_PARAM",
    template: "参数 {paramName} 非法，已拒绝本次更新",
    level: "warning",
    durationMs: 4000,
    retryable: false,
  },
  ENGINE_WORKER_CRASH: {
    code: "ENGINE_WORKER_CRASH",
    template: "仿真引擎意外崩溃，正在自动恢复（第 {attempt} 次）...",
    level: "error",
    durationMs: 0,  // 不自动消失，等待恢复结果
    retryable: true,
  },
  ENGINE_WORKER_TIMEOUT: {
    code: "ENGINE_WORKER_TIMEOUT",
    template: "仿真计算超时（{duration}s 未响应），已重置引擎",
    level: "error",
    durationMs: 8000,
    retryable: true,
  },
  ENGINE_POOL_EXHAUSTED: {
    code: "ENGINE_POOL_EXHAUSTED",
    template: "传输缓冲区不足，仿真帧率临时降低",
    level: "warning",
    durationMs: 4000,
    retryable: false,
  },

  // ---- 预计算数据 ----
  PRECOMPUTE_FETCH_FAILED: {
    code: "PRECOMPUTE_FETCH_FAILED",
    template: "预计算数据加载失败：{reason}。已切换至离线模式，实时仿真仍可用",
    level: "warning",
    durationMs: 6000,
    retryable: true,
  },
  PRECOMPUTE_FORMAT_ERROR: {
    code: "PRECOMPUTE_FORMAT_ERROR",
    template: "预计算数据格式错误：{reason}。请尝试重新生成数据",
    level: "error",
    durationMs: 8000,
    retryable: false,
  },
  PRECOMPUTE_VERSION_MISMATCH: {
    code: "PRECOMPUTE_VERSION_MISMATCH",
    template: "预计算数据版本不匹配（期望 v{expected}，实际 v{actual}），渲染可能不准确",
    level: "warning",
    durationMs: 5000,
    retryable: false,
  },
  PRECOMPUTE_GRID_INVALID: {
    code: "PRECOMPUTE_GRID_INVALID",
    template: "数据扫描范围无效：{reason}",
    level: "warning",
    durationMs: 4000,
    retryable: false,
  },

  // ---- Pyodide/用户沙箱 ----
  PYODIDE_LOAD_FAILED: {
    code: "PYODIDE_LOAD_FAILED",
    template: "Python 沙箱不可用：{reason}。请检查网络连接或刷新重试。实时仿真仍可用",
    level: "error",
    durationMs: 0,  // 不自动消失（持续性不可用状态）
    retryable: true,
  },
  PYODIDE_TIMEOUT: {
    code: "PYODIDE_TIMEOUT",
    template: "代码执行超时（>5s），已被中断。请检查循环或计算量",
    level: "warning",
    durationMs: 5000,
    retryable: false,
  },
  PYODIDE_IMPORT_BLOCKED: {
    code: "PYODIDE_IMPORT_BLOCKED",
    template: "导入被阻止：{module} 不在允许列表中。仅支持 numpy、scipy.integrate、math",
    level: "warning",
    durationMs: 5000,
    retryable: false,
  },
  PYODIDE_RUNTIME_ERROR: {
    code: "PYODIDE_RUNTIME_ERROR",
    template: "代码运行错误：{message}",
    level: "error",
    durationMs: 6000,
    retryable: false,
  },

  // ---- WebGL/渲染 ----
  WEBGL_CONTEXT_LOST: {
    code: "WEBGL_CONTEXT_LOST",
    template: "3D 渲染上下文丢失。可能是 GPU 驱动问题或设备休眠。尝试恢复中...",
    level: "error",
    durationMs: 8000,
    retryable: true,
  },
  WEBGL_NOT_SUPPORTED: {
    code: "WEBGL_NOT_SUPPORTED",
    template: "您的浏览器不支持 WebGL，3D 仿真不可用。请使用 Chrome、Firefox 或 Edge 最新版",
    level: "error",
    durationMs: 0,  // 不自动消失（浏览器能力不可变）
    retryable: false,
  },

  // ---- 通用运行时 ----
  UNCAUGHT_JS_ERROR: {
    code: "UNCAUGHT_JS_ERROR",
    template: "发生了未预期的错误：{message}",
    level: "error",
    durationMs: 6000,
    retryable: false,
  },
  UNHANDLED_PROMISE: {
    code: "UNHANDLED_PROMISE",
    template: "异步操作失败：{message}",
    level: "error",
    durationMs: 6000,
    retryable: false,
  },
  STORAGE_QUOTA_EXCEEDED: {
    code: "STORAGE_QUOTA_EXCEEDED",
    template: "浏览器存储空间已满，快照保存失败。请清理旧快照后重试",
    level: "warning",
    durationMs: 6000,
    retryable: false,
  },
  CLIPBOARD_UNAVAILABLE: {
    code: "CLIPBOARD_UNAVAILABLE",
    template: "剪贴板不可用。请手动复制所选文本",
    level: "warning",
    durationMs: 4000,
    retryable: false,
  },
};
```

### 核心逻辑步骤

#### 阶段 A：统一 Toast 通知系统

**步骤 1：Toast Provider 挂载**

- **操作对象**：React 组件树中的 `<ToastProvider>`（封装 shadcn/ui Sonner 或自建 Toast Context）
- **具体操作**：
  1. 在 `App.tsx` 或 `AppShell.tsx` 的顶层渲染 `<ToastProvider>`
  2. `<ToastProvider>` 内部：
     - 创建 React Context 存储 `notify` 函数引用（供 `notify()` 模块级调用使用）
     - 渲染 `<SonnerToaster />`（Sonner 方案）或自建 Toast 容器 `<div role="region" aria-label="通知">`
     - Toast 容器位置：桌面端（`deviceType === "desktop"`）→ CSS `top: 1rem; right: 1rem`；平板/手机端 → CSS `top: 1rem; left: 50%; transform: translateX(-50%)`
     - Toast 最大同时显示数：桌面 5 条；平板 3 条；手机 2 条
     - Toast 间距：`gap: 0.5rem`（Tailwind `gap-2`）
  3. 在 `useEffect` 中将 `notify` 函数注册到模块级变量（供非 React 上下文调用）
- **输入来源**：`SYS-01` 的 `deviceType`（决定 Toast 位置和最大显示数）
- **输出去向**：Toast 容器渲染在 DOM 中（固定定位，`z-index: 9999`，确保在所有 UI 之上）
- **失败行为**：`deviceType` 尚未初始化（首次渲染）→ 默认使用桌面布局（`top-right`），不抛出异常

**步骤 2：Toast 去重与合并**

- **操作对象**：Toast 状态数组（`toasts: ToastInstance[]`）
- **具体操作**：
  1. 调用 `toast(input)` 时，检查 `input.id` 是否提供
  2. 若提供 `id` 且在 `toasts` 中已存在同 id 的 Toast → **更新**该 Toast 的内容（`title`/`description`/`variant`），不新增。用于进度更新场景（如 Pyodide 加载：`id="pyodide-loading"`，持续更新 `description` 为百分比）
  3. 若未提供 `id` 或同 id 不存在 → **新增** Toast
  4. 若新增后超出最大显示数 → 移除最旧的 Toast（FIFO）
  5. 去重去重窗口：相同 `title` + `variant` 的 Toast 在 2 秒内重复触发 → 不新增，改为更新原有 Toast 的 `description` 附加 "(×2)"、"(×3)" 计数
- **输入来源**：`toast()` 调用参数
- **输出去向**：Toast 状态数组更新 → React 重新渲染 Toast 列表
- **失败行为**：`id` 提供的 Toast 已被用户手动关闭 → 视为不存在（重新创建新 Toast，用户已关闭的不再更新）

**步骤 3：Toast 自动消失与用户交互**

- **操作对象**：单个 `ToastInstance` 的 `setTimeout` 定时器
- **具体操作**：
  1. Toast 渲染后，根据 `durationMs` 设置 `setTimeout(() => dismiss(toastId), durationMs)`
  2. 若 `durationMs === 0` → 不设自动消失（用户手动关闭），Toast 右侧显示关闭按钮（X 图标）
  3. 用户点击关闭按钮 → 立即 `dismiss()`
  4. 用户悬停在 Toast 上 → `clearTimeout`（暂停倒计时）；鼠标移出 → 重新 `setTimeout`（恢复倒计时）
  5. Toast 退出动画：`animate-out slide-out-to-right`（200ms）后从 DOM 移除
- **输入来源**：`durationMs` 字段；用户鼠标/键盘交互事件
- **输出去向**：Toast DOM 元素移除
- **失败行为**：组件在 Toast 定时器触发前卸载 → cleanup 中 `clearTimeout`，Toast 不残留

#### 阶段 B：错误翻译引擎

**步骤 4：错误码 → 中文消息翻译**

- **操作对象**：`ERROR_DICTIONARY` 常量 Map
- **具体操作**：

  ```typescript
  function translateError(input: TranslateErrorInput): TranslateErrorOutput {
    // 1. 查找词典条目
    let entry = ERROR_DICTIONARY[input.code];

    // 2. 未知 code → 降级为 UNCAUGHT_JS_ERROR
    if (!entry) {
      entry = ERROR_DICTIONARY["UNCAUGHT_JS_ERROR"];
      console.warn(`[SYS-02] 未知错误码: ${input.code}，已降级翻译`);
    }

    // 3. 替换模板占位符
    let message = entry.template;
    if (input.context) {
      for (const [key, value] of Object.entries(input.context)) {
        message = message.replaceAll(`{${key}}`, value);
      }
    }
    // 未替换的占位符保留原样（如 {simTime}），不隐藏信息缺失

    // 4. 附加原始错误消息
    if (input.originalMessage && input.originalMessage.length > 0) {
      message += ` (${input.originalMessage})`;
    }

    return {
      message,
      level: entry.level,
      durationMs: entry.durationMs,
      retryable: entry.retryable,
      code: input.code,
    };
  }
  ```

- **输入来源**：各模块传入的 `ErrorCode` + 上下文参数 + 可选原始消息
- **输出去向**：`TranslateErrorOutput` 对象，供调用方直接传入 `toast()` 或自定义 UI 渲染
- **失败行为**：`input.context` 中的 key 在模板中不存在 → 静默忽略（不影响其他占位符替换）；模板中某占位符在 context 中无对应值 → 保留原始 `{param}` 文本

**步骤 5：全局错误 → 自动翻译 + Toast**

- **操作对象**：INF-01 的 `initErrorCapture` 的 `onError` 回调
- **具体操作**：
  1. 在 `SYS-02` 的初始化流程中，向 `ObservabilityCoordinator.initErrorCapture` 注册回调
  2. 回调接收 `errors: string[]`（INF-01 写入的格式化错误日志，格式为 `[ISO时间戳] 错误消息`）
  3. 解析最新一条错误消息：
     - 尝试匹配 `ErrorCode` 关键词（如消息含"发散" → `ENGINE_DIVERGED`；含"Worker 崩溃" → `ENGINE_WORKER_CRASH`）
     - 匹配规则使用正则表达式表（`INFRA_ERROR_PATTERNS: Array<{ pattern: RegExp; code: ErrorCode }>`）
     - 匹配失败 → `UNCAUGHT_JS_ERROR`
  4. 调用 `translateError({ code, originalMessage: parsedMessage })`
  5. 调用 `notify({ ...translated, action: entry.retryable ? { label: "重试", onClick } : undefined })`
- **输入来源**：INF-01 的 `onError` 回调
- **输出去向**：自动弹出的 Toast 通知（用户可见）
- **失败行为**：错误消息无法匹配任何已知 pattern → 以 `UNCAUGHT_JS_ERROR` 降级翻译并 Toast，原始消息完整显示

#### 阶段 C：后台自动暂停与恢复

**步骤 6：监听 visibilitychange 事件**

- **操作对象**：`document.visibilitychange` 事件
- **具体操作**：
  1. `useVisibilityChange` hook 在 `useEffect` 中注册 `document.addEventListener("visibilitychange", handler)`
  2. `handler` 内部：
     ```typescript
     const handler = () => {
       const visible = document.visibilityState === "visible";
       if (!visible) {
         // 不可见：切后台
         options.onHidden?.() ?? autoPause();
       } else {
         // 恢复可见：切回前台
         options.onVisible?.() ?? autoPromptResume();
       }
       setIsVisible(visible);
       if (!visible) setWasHidden(true);
     };
     ```
  3. `autoPause()` 函数：
     - 调用 `useSimulationStore.getState().pause()`（暂停仿真，如果正在运行）
     - 调用 `exploreStore.getState().setSonificationEnabled(false)`（暂停声音化，如果已启用）
     - 记录 `wasRunningBeforeHidden: boolean`（记录暂停前仿真是否正在运行，用于恢复判断）
  4. `autoPromptResume()` 函数：
     - 检查 `wasRunningBeforeHidden`：若为 false → 不提示（用户此前就已手动暂停）
     - 若为 true → 调用 `notify({ title: "已暂停", description: "浏览器切回前台，仿真已自动暂停。点击继续", variant: "info", durationMs: 0, action: { label: "继续", onClick: resumeAll } })`
     - `resumeAll()`：恢复仿真（`useSimulationStore.getState().play()`）+ 恢复声音化（如果暂停前已启用）
  5. Hook cleanup 中移除事件监听
- **输入来源**：浏览器标签页切换事件
- **输出去向**：`VisibilityState` 返回值；自动暂停/恢复副作用
- **失败行为**：`document.visibilityState` 不可用（极旧浏览器）→ 跳过监听，`isVisible` 始终返回 `true`，不触发自动暂停

**步骤 7：useAutoPause 组合 Hook**

- **操作对象**：消费组件（EXP-01 3D 场景、EXP-03 声音化引擎）
- **具体操作**：
  ```typescript
  function useAutoPause(): { isAutoPaused: boolean; resume: () => void } {
    const [isAutoPaused, setIsAutoPaused] = useState(false);

    useVisibilityChange({
      onHidden: () => {
        const store = useSimulationStore.getState();
        if (store.isRunning) {
          store.pause();
          setIsAutoPaused(true);
        }
        // 声音化由 EXP-03 的 useSonification hook 自行监听 isAutoPaused 暂停
      },
      onVisible: () => {
        if (isAutoPaused) {
          notify({
            title: "已暂停",
            description: "浏览器切回前台，仿真已自动暂停",
            variant: "info",
            durationMs: 0,
            action: { label: "继续", onClick: () => { useSimulationStore.getState().play(); setIsAutoPaused(false); } }
          });
        }
      },
    });

    return {
      isAutoPaused,
      resume: () => { useSimulationStore.getState().play(); setIsAutoPaused(false); }
    };
  }
  ```
- **输入来源**：消费组件（通过 hook 调用）
- **输出去方**：`isAutoPaused` 和 `resume` 函数，供 EXP-01 的 rAF 循环和 EXP-03 的 AudioContext 判断是否暂停
- **失败行为**：`useSimulationStore` 不可用（极端情况）→ try-catch 包裹 store 调用，静默降级

#### 阶段 D：长运行自动降级

**步骤 8：累计运行时长检测**

- **操作对象**：`useSimulationStore` 的 `isRunning` 状态 + 自维护的累计计时器
- **具体操作**：
  1. `useLongRunningDetector` hook 在 `useEffect` 中维护 `elapsedRef = useRef(0)`（累计运行毫秒数）
  2. 每 `CHECK_INTERVAL_MS`（30 秒）检查一次：
     - 若 `useSimulationStore.getState().isRunning === true` → `elapsedRef.current += CHECK_INTERVAL_MS`
     - 若 `isRunning === false` → 不累加（暂停不计入运行时长）
  3. 当 `elapsedRef.current >= LONG_RUNNING_CONFIG.THRESHOLD_MS - LONG_RUNNING_CONFIG.WARNING_BEFORE_MS`（即 9 分钟）且此前未发预警 → 调用 `notify({ title: "长效运行提示", description: "仿真已运行 9 分钟，1 分钟后将自动降低精度以节省资源", variant: "warning", durationMs: 8000 })`
  4. 当 `elapsedRef.current >= LONG_RUNNING_CONFIG.THRESHOLD_MS`（10 分钟）→ 触发降级：
     - 调用 `useSimulationStore.getState().setDt(DEGRADED_DT)`（降低积分精度）
     - 调用 `exploreStore.getState().setMaxTrailLength(DEGRADED_TRAIL_LENGTH)`（缩短尾迹）
     - 设置 `isDegraded = true`
     - 调用 `notify({ title: "已进入长效运行模式", description: "积分精度已降低至 Δt=1/30s，尾迹长度已缩短至 500 步", variant: "info", durationMs: 5000 })`
  5. 仿真重置时（`useSimulationStore.getState().reset()` 被调用）→ `elapsedRef.current = 0`，`isDegraded = false`
- **输入来源**：`setInterval` 定时器（30s 间隔）；`useSimulationStore.isRunning`
- **输出去向**：降级指令（写入 `useSimulationStore` 和 `exploreStore`）；Toast 通知
- **失败行为**：`setInterval` 回调中 store 不可用 → try-catch 包裹，跳过本次检查

#### 阶段 E：Worker 崩溃恢复编排

**步骤 9：检测 → 重建 → 恢复**

- **操作对象**：`worker.onerror` 事件 + SIM-01 的 Worker 通信管理层
- **具体操作**：
  1. `useWorkerRecovery(workerRef, config?)` hook 在 `useEffect` 中：
     - 获取 `workerRef.current` 引用
     - 在 Worker 上注册 `worker.onerror = handleCrash`
     - 或在消息处理中监听 `SIM-01` 的 `WorkerErrorResponse`（`code === "ENGINE_WORKER_CRASH"`）
  2. `handleCrash` 被触发时：
     ```typescript
     async function handleCrash() {
       if (recoveryCount >= maxAutoRecovery) {
         notify({
           title: "仿真引擎无法自动恢复",
           description: `已尝试 ${recoveryCount} 次自动恢复，均失败。请刷新页面`,
           variant: "error",
           durationMs: 0,
         });
         return;
       }

       recoveryCount++;
       notify({
         title: "仿真引擎崩溃",
         description: `正在自动恢复（第 ${recoveryCount} 次）...`,
         variant: "loading",
         id: "worker-recovery",
       });

       // 1. 保存当前参数
       const currentParams = useSimulationStore.getState().params;
       const currentInitialConditions = useSimulationStore.getState().initialConditions;

       // 2. 等待指定延迟
       await new Promise(r => setTimeout(r, retryDelayMs));

       // 3. 终止旧 Worker（如果尚未终止）
       workerRef.current?.terminate();

       // 4. 创建新 Worker（调用 SIM-01 的 Worker 工厂函数）
       const newWorker = createOdeWorker();  // from src/features/simulation/worker/

       // 5. 恢复参数
       newWorker.postMessage({ type: "init", params: currentParams, initialConditions: currentInitialConditions });

       // 6. 更新引用
       workerRef.current = newWorker;

       // 7. 通知成功
       notify({
         title: "仿真引擎已恢复",
         description: autoResumeAfterRecovery ? "已自动继续仿真" : "已恢复，点击继续仿真",
         variant: "success",
         id: "worker-recovery",
         durationMs: 3000,
         action: autoResumeAfterRecovery ? undefined : { label: "继续", onClick: () => useSimulationStore.getState().play() },
       });
     }
     ```
  3. `autoResumeAfterRecovery` 为 true → 恢复后自动调用 `play()`
  4. Hook cleanup：解除 `worker.onerror` 绑定
- **输入来源**：Worker 的 `onerror` 事件或 `WorkerErrorResponse` 消息
- **输出去向**：新 Worker 实例；恢复后的仿真状态；Toast 通知
- **失败行为**：`createOdeWorker()` 失败（Worker 创建异常，极端情况）→ `recoveryCount` 增加，等待 `retryDelayMs` 后重试；达到 `maxAutoRecovery` 后最终失败，显示"请刷新页面"Toast

### 依赖与集成接口

| 依赖方 | 具体接口 | 用途 |
|--------|----------|------|
| INF-01 | `ObservabilityCoordinator.initErrorCapture(onError)` | 接收全局错误捕获事件，执行翻译 + Toast |
| SYS-01 | `useAppStore().deviceType` | 决定 Toast 位置（桌面右上 / 移动居中） |
| SIM-01 | `useSimulationStore` 的 `params`、`initialConditions`、`isRunning` | 崩溃恢复时保存/恢复参数；后台暂停/恢复；长运行降级 |
| SIM-01 | `createOdeWorker()`（`src/features/simulation/worker/` 的工厂函数） | 崩溃恢复时创建新 Worker 实例 |
| SIM-02 | `useSimulationStore` 的 `setDt()` | 长运行降级时修改积分步长 |
| EXP-02 | `exploreStore` 的 `setMaxTrailLength()` | 长运行降级时缩短尾迹 |
| shadcn/ui (Sonner) | `<Toaster />` 组件 + `toast()` 函数 | Toast 渲染（封装在 `useToast` 内部） |
| React | `createContext`、`useContext`、`useEffect`、`useRef`、`useState` | Toast Context、事件监听、状态管理 |
| 浏览器 API | `document.visibilitychange` | 后台检测 |
| 浏览器 API | `setTimeout`、`setInterval` | Toast 自动消失、长运行定时器 |
| 浏览器 API | `navigator.clipboard` | 调试面板"复制全部错误"（INF-01 UI 消费，本模块不直接使用） |

**对外暴露的公共接口（供其他模块消费）**：

| 消费方模块 | 调用方式 | 消费的数据/功能 |
|-----------|---------|---------------|
| ANL-01~04 | `const { toast } = useToast()` → `toast({ title, description, variant })` | 数据加载失败、参数填充失败、条件非法等通知 |
| SIM-01 | `import { notify } from "SYS-02"` → `notify({ ... })` | Worker 崩溃、池耗尽、积分发散等通知（在非 React 上下文中） |
| SIM-02 | `import { notify } from "SYS-02"` → `notify({ ... })` | 全局级异常通知（3D 场景冻结持续 > 10s） |
| EXP-01 | `const { isAutoPaused, resume } = useAutoPause()` | 后台自动暂停 rAF 渲染循环 |
| EXP-03 | `const { isAutoPaused } = useAutoPause()` | 后台自动暂停 AudioContext |
| LAB-03 | `import { translateError } from "SYS-02"` → `translateError({ code, context })` | Python traceback → 中文错误翻译 + CodeMirror 行号标注 |
| SYS-03 | `const { toast } = useToast()` | 预计算数据加载失败、离线模式提示 |
| INF-01 | `ObservabilityCoordinator.initErrorCapture(onError)` 的 `onError` 回调 | 全局错误 → 自动翻译 + Toast |

### 状态机

本模块不涉及异步流程或多阶段任务，故无需业务状态机。以下为 Toast 生命周期和 Worker 崩溃恢复的简单状态表：

| 当前状态 | 触发事件 | 下一状态 | 前置条件 | 副作用 |
|----------|----------|----------|----------|--------|
| Toast: `hidden` | `toast(input)` 调用 | `visible` | Toast 总数未达上限 | 渲染 Toast DOM；启动自动消失定时器 |
| Toast: `visible` | 自动消失定时器到期 | `hiding` | `durationMs > 0` | 播放退出动画（200ms） |
| Toast: `visible` | 用户点击关闭 | `hiding` | — | 清除定时器；播放退出动画 |
| Toast: `visible` | 同 id 的 `toast(input)` 再次调用 | `visible` | `input.id` 已存在 | 更新内容（title/description/variant）；重置定时器 |
| Toast: `hiding` | 退出动画完成 | `removed` | — | 从 DOM 移除；从 `toasts[]` 数组中删除 |
| Worker: `running` | `worker.onerror` 触发 | `recovering` | `recoveryCount < maxAutoRecovery` | 保存参数；显示"恢复中"Toast |
| Worker: `recovering` | `createOdeWorker()` 成功 | `running` | — | 恢复参数；更新引用；Toast "已恢复" |
| Worker: `recovering` | `createOdeWorker()` 失败 | `recovering`（重试）或 `dead` | `recoveryCount < maxAutoRecovery` | 递增计数；延迟后重试 |
| Worker: `dead` | 用户点击"刷新页面" | — | `recoveryCount >= maxAutoRecovery` | 提示用户手动刷新 |

### 异常与边界条件

#### 异常 1：Toast 在 2 秒内被同一消息重复触发（消息风暴）

- **触发条件**：Worker 在循环中持续发送错误（如每帧都返回 `ENGINE_DIVERGED`），导致每秒 60 次 `notify()` 调用
- **处理策略**：
  1. Toast 去重逻辑检测：相同 `title` + `variant` 在 2 秒内重复触发 → 不新增 Toast，在原 Toast 的 `description` 末尾附加 `(×2)`、`(×3)`……最多显示 `(×99+)`
  2. 同时应用 `ErrorCode` 级别的节流：同一 `ErrorCode` 的 Toast 在 5 秒内最多显示 1 条新 Toast（通过模块级 `lastToastTime: Map<ErrorCode, number>` 记录）
  3. 超出频次的调用被静默忽略（`console.debug` 记录，不抛异常）
- **重试参数**：不重试。节流窗口 5 秒。

#### 异常 2：toast() 在 ToastProvider 挂载前被调用

- **触发条件**：应用启动早期（如 `main.tsx` 中 Worker 初始化失败），此时 `<ToastProvider>` 尚未渲染（React 尚未完成首次 commit）
- **处理策略**：
  1. `notify()` 模块级函数维护一个 `pendingToasts: ToastInput[]` 队列
  2. 若 `<ToastProvider>` 未挂载（`notify` 函数尚未注册到模块级变量）→ `notify()` 将 `input` 推入 `pendingToasts` 队列
  3. `<ToastProvider>` 挂载后，在 `useEffect` 中消费 `pendingToasts` 队列（逐条调用实际的 `toast()` 函数），清空队列
  4. 队列容量上限 10 条，超出时丢弃最旧的（防止内存泄漏）
- **重试参数**：不重试。队列在 Provider 挂载后自动消费。

#### 异常 3：visibilitychange 事件在页面卸载时触发

- **触发条件**：用户关闭标签页或刷新页面时，浏览器触发 `visibilitychange`（hidden），但此时 React 组件树正在卸载
- **处理策略**：
  1. `useVisibilityChange` 的 `handler` 内部检查 ref 标志位 `isMountedRef.current`
  2. 若 `isMountedRef.current === false`（组件已卸载）→ 不执行任何副作用（不写 store、不显示 Toast）
  3. Cleanup 中设置 `isMountedRef.current = false`
- **重试参数**：不适用。

#### 异常 4：长运行检测定时器在页面后台时持续累加（误判长运行）

- **触发条件**：用户切换到其他标签页 15 分钟，期间 `setInterval` 仍在运行（浏览器不冻结所有定时器），`isRunning` 为 true（Worker 在后台持续积分），导致 `elapsedRef` 累积超阈值
- **处理策略**：
  1. 长运行检测与 `useVisibilityChange` 联动：当 `isVisible === false` 时，暂停累计 `elapsedRef`（`isRunning` 在后台时自动暂停仿真，所以实际不会持续累加——但保留此防御逻辑）
  2. 在 `CHECK_INTERVAL_MS` 回调中增加检查：`if (!isVisibleRef.current) return;`（双重保险）
- **重试参数**：不适用。

#### 异常 5：Worker 崩溃恢复期间用户手动修改参数

- **触发条件**：Worker 崩溃 → 进入恢复流程（步骤 9），但在 `retryDelayMs` 等待期间（500ms），用户通过 SIM-02 面板修改了参数
- **处理策略**：
  1. 恢复流程在步骤 1 "保存参数"时，深拷贝当前参数快照（非引用）
  2. 在步骤 5 "恢复参数"时，使用快照而非实时读取 store（避免用户修改被覆盖或使用者不一致）
  3. 恢复完成后，显示 Toast "仿真引擎已恢复，参数可能已变更"
- **重试参数**：不适用。

#### 异常 6：中文错误词典缺失某 ErrorCode

- **触发条件**：新增模块引入了新的错误场景，但未在 `ERROR_DICTIONARY` 中添加对应条目（开发者遗漏）
- **处理策略**：
  1. `translateError` 函数在查找 `ERROR_DICTIONARY[input.code]` 返回 `undefined` 时，降级为 `UNCAUGHT_JS_ERROR` 条目
  2. 输出 `console.warn("[SYS-02] 未知错误码: {code}，已降级翻译")`
  3. 原始错误码和消息通过 `originalMessage` 字段保留在输出中（用户至少能看到英文原文）
- **重试参数**：不适用。

### 原则兑现清单

| 原则来源 | 原则名称 | 代码级约束 |
|----------|----------|------------|
| 功能设计_v0 §九 | 优雅降级为核心策略 | 预计算加载失败 → 离线模式（保留实时仿真）；长运行 → 降精度不断仿真；Worker 崩溃 → 自动恢复不丢数据；所有异常不阻塞主功能 |
| 功能设计_v0 §九 | 友好错误提示 | `translateError()` 将所有技术错误映射为中文用户语言；`originalMessage` 保留技术细节供调试 |
| 功能设计_v0 §九 | 统一通知通道 | 所有模块通过 `useToast()` / `notify()` 触发通知，不各自实现弹窗/alert/console；附录 C 确认 SYS-02 不拆分 |
| 技术栈设计 §7 | 9 种异常全覆盖 | `ERROR_DICTIONARY` 的 17 个 ErrorCode 覆盖技术栈 §7 全部 9 种异常场景 + 8 种扩展场景（存储/剪贴板/WebGL 上下文丢失等） |
| AGENT.md 核心原则 | 前端逻辑层与表现层分离 | 错误翻译（`error-dictionary.ts`）+ 检测逻辑（hooks）是逻辑层；Toast UI（`ToastProvider` + Sonner）是表现层；通过 Context 解耦 |
| 通用原则 | 单一职责 | 错误翻译（`translateError`）、后台检测（`useVisibilityChange`）、长运行检测（`useLongRunningDetector`）、崩溃恢复（`useWorkerRecovery`）、Toast UI（`ToastProvider`）各自独立 |
| 通用原则 | 零外部依赖 | 除 shadcn/ui Sonner 外，所有实现（翻译词典、定时器、事件监听）均为自实现，不引入额外 npm 包 |
| AGENT.md 核心原则 | 禁止为了快速修复而降级功能 | `ERROR_DICTIONARY` 中每个条目都有完整的 `template`、`level`、`durationMs`、`retryable` 四字段，禁止留空或写占位文字 |

### 验收测试场景

#### 正向测试 1：Toast 通知正常显示与消失

- **Given**：
  - `<ToastProvider>` 已挂载，`deviceType = "desktop"`
  - 消费组件调用了 `const { toast } = useToast()`
- **When**：
  ```typescript
  toast({
    title: "数据加载失败",
    description: "预计算数据 fetch 返回 HTTP 404",
    variant: "warning",
    durationMs: 5000,
  });
  ```
- **Then**：
  - 屏幕右上角出现 Toast，黄色左边框 + AlertTriangle 图标
  - 标题显示"数据加载失败"，描述显示"预计算数据 fetch 返回 HTTP 404"
  - Toast 在 5000ms ± 200ms 后自动消失（含退出动画）
  - 鼠标悬停在 Toast 上时倒计时暂停，移开后恢复
  - Toast 消失后 DOM 中不存在该元素

#### 正向测试 2：错误码翻译后自动 Toast

- **Given**：
  - `translateError` 函数可用
  - INF-01 的 `onError` 回调已注册（接收 `"Worker 积分发散于 t=5.23s"` 消息）
- **When**：
  ```typescript
  const translated = translateError({
    code: "ENGINE_DIVERGED",
    context: { simTime: "5.23" },
  });
  notify({ title: "积分已发散", description: translated.message, variant: "error" });
  ```
- **Then**：
  - `translated.message` 为 `"积分已发散于 t=5.23s，请减小步长或更换积分方法"`
  - `translated.level` 为 `"error"`
  - `translated.retryable` 为 `true`
  - Toast 显示上述完整消息，红色 XCircle 图标，持续 8 秒
  - Toast 包含"重试"操作按钮

#### 正向测试 3：后台自动暂停与切回提示

- **Given**：
  - `useAutoPause()` hook 在 EXP-01 中已挂载
  - 仿真正在运行（`isRunning = true`），声音化已启用（`sonificationEnabled = true`）
- **When**：用户切换到另一个浏览器标签页（`document.visibilityState` 变为 `"hidden"`）
- **Then**：
  - `isAutoPaused` 变为 `true`
  - `useSimulationStore.getState().isRunning` 变为 `false`
  - `exploreStore.getState().sonificationEnabled` 变为 `false`
  - Worker 在下一个 `step` 周期前被暂停（`postMessage({ type: "pause" })`）
- **When**：用户切回标签页（`document.visibilityState` 变为 `"visible"`）
- **Then**：
  - Toast 显示："已暂停" + "浏览器切回前台，仿真已自动暂停" + "继续"按钮
  - 用户点击"继续" → `isRunning = true`，`sonificationEnabled = true`，仿真继续

#### 正向测试 4：长运行自动降级

- **Given**：
  - `useLongRunningDetector()` 在 App.tsx 中已挂载
  - 仿真已连续运行 9 分 30 秒
  - 长运行配置：`THRESHOLD_MS = 600000`，`WARNING_BEFORE_MS = 60000`
- **When**：`elapsedRef.current` 达到 540000ms（9 分钟 = 阈值 - 预警时间）
- **Then**：
  - Toast 显示："长效运行提示" + "仿真已运行 9 分钟，1 分钟后将自动降低精度以节省资源"（warning 级别）
- **When**：`elapsedRef.current` 达到 600000ms（10 分钟）
- **Then**：
  - `useSimulationStore.getState().dt` 变为 `1/30`（从 `1/60`）
  - `exploreStore.getState().maxTrailLength` 变为 `500`（从 `1000`）
  - `isDegraded` 变为 `true`
  - Toast 显示："已进入长效运行模式" + "积分精度已降低至 Δt=1/30s，尾迹长度已缩短至 500 步"（info 级别）

#### 异常测试 1：消息风暴节流

- **Given**：
  - `ToastProvider` 已挂载
  - 模拟 Worker 循环：每秒 60 次调用 `notify({ title: "积分已发散", variant: "error" })`
- **When**：`notify()` 在 1 秒内被调用 60 次（同 `title` + 同 `variant`）
- **Then**：
  - 仅**第 1 次**调用创建新 Toast
  - 描述末尾逐次显示 `(×2)`、`(×3)`、`(×4)`，持续递增，最多 `(×99+)`
  - 仅**1 个** Toast DOM 元素存在（非 60 个堆叠）
  - 相同 `ErrorCode` 级别的节流：5 秒内不新增 Toast
  - Console.debug 记录被节流的调用次数（59 次）

#### 异常测试 2：ToastProvider 挂载前的通知队列

- **Given**：
  - 应用启动中，React 尚未完成首次渲染（`<ToastProvider>` 未挂载）
  - 模块级 `notify()` 函数被调用 3 次
- **When**：`notify({ title: "消息1" })` → `notify({ title: "消息2" })` → `notify({ title: "消息3" })`（均在 Provider 挂载前）
- **Then**：
  - 3 条消息进入 `pendingToasts` 队列
  - `<ToastProvider>` 挂载后，`useEffect` 中依次消费队列：3 条 Toast 按顺序出现
  - 队列被清空
  - `pendingToasts` 队列容量 10 条：若 11 条 → 最旧的 1 条被丢弃，console.debug 记录丢弃事件

#### 异常测试 3：未知错误码降级翻译

- **Given**：
  - `ERROR_DICTIONARY` 不包含 `"CUSTOM_NEW_ERROR"` 条目
- **When**：
  ```typescript
  const result = translateError({ code: "CUSTOM_NEW_ERROR" as ErrorCode });
  ```
- **Then**：
  - `result.message` 为 `"发生了未预期的错误：CUSTOM_NEW_ERROR"`
  - `result.level` 为 `"error"`（降级为 `UNCAUGHT_JS_ERROR` 的级别）
  - `console.warn` 输出 `"[SYS-02] 未知错误码: CUSTOM_NEW_ERROR，已降级翻译"`
  - 不抛出异常

#### 异常测试 4：Worker 恢复达上限后不再自动恢复

- **Given**：
  - `useWorkerRecovery(workerRef, { maxAutoRecovery: 3, retryDelayMs: 100 })`
  - Worker 已崩溃 3 次，`recoveryCount = 3`
- **When**：Worker 第 4 次触发 `onerror`
- **Then**：
  - `handleCrash` 检查 `recoveryCount >= maxAutoRecovery` → 直接返回
  - 不创建新 Worker，不调用 `createOdeWorker()`
  - Toast 显示："仿真引擎无法自动恢复" + "已尝试 3 次自动恢复，均失败。请刷新页面"（error 级别，`durationMs = 0`，不自动消失）
  - `workerRef.current` 为 `null`（已崩溃的 Worker 已被终止）

### 注意事项与禁止行为

1. **【Toast 单一来源】** 所有模块的 Toast 通知必须通过 `useToast()` 或 `notify()` 触发。禁止在 ANL-01 中 `import { toast } from "sonner"` 直接调用 Sonner 的 `toast()`。统一入口确保：去重逻辑、位置适配（桌面/移动）、最大显示数限制、样式一致性。

2. **【ERROR_DICTIONARY 是错误翻译的唯一权威源】** 禁止在 LAB-03 或其他模块中硬编码字符串如 `"IndexError → 数组越界"` 做错误翻译。所有翻译必须通过 `translateError(code, context)` 查询词典。新增错误场景时，先在 `ErrorCode` 枚举中新增值，再在 `ERROR_DICTIONARY` 中添加条目。

3. **【visibilitychange 监听必须集中】** 禁止 EXP-01（3D 场景）和 EXP-03（声音化引擎）各自注册独立的 `document.addEventListener("visibilitychange", ...)`。必须通过 `useAutoPause()` 或 `useVisibilityChange()` 统一监听。多个独立的监听器会导致暂停/恢复行为不一致（如 3D 暂停但声音未暂停）。

4. **【Worker 崩溃恢复不重建仿真状态】** 恢复流程只恢复 Worker 实例和参数。尾迹历史（`RingBuffer`）、快照列表、相空间散点等高级状态**不恢复**（内存数据，崩溃时已丢失）。恢复后提示用户"尾迹历史已清除"（通过 Toast）。

5. **【禁止在 visibilitychange handler 中执行异步操作】** Handler 必须是同步函数（`() => void`）。需要异步操作时（如 Worker `postMessage({ type: "pause" })`），在 handler 中同步设置状态标志位，由 rAF 循环或 `useEffect` 的 cleanup 异步执行实际暂停。

6. **【禁止 Toast 堆叠覆盖关键 UI】** Toast 容器 `z-index: 9999`，但需确保不覆盖：移动端底部导航栏（`z-index: 100`）、故事模式字幕（`z-index: 50`）、SIM-02 参数面板 Tooltip（`z-index: 100`）。桌面端 Toast 在右上角，与这些 UI 无重叠；移动端 Toast 在顶部居中，需在底部导航栏上方。

7. **【长运行检测与仿真重置联动】** 仿真被重置（`useSimulationStore.reset()` 被调用）时，`useLongRunningDetector` 的 `elapsedRef` 必须归零。实现方式：`useLongRunningDetector` 订阅 `useSimulationStore((s) => s.simTime)`，当 `simTime` 小于之前记录的值时（表示被重置），自动归零 `elapsedRef`。

8. **【易错点】** Sonner 的 `toast()` 函数在同一个 `<Toaster />` 实例下自动做 id 去重。但本模块需要额外一层去重（同 title+variant 在 2s 内合并），因为不同消费模块可能使用不同的 `id` 或未提供 `id`。这一层去重在 `notify()` 函数中实现（与 Sonner 内置去重互补，不冲突）。

9. **【易错点】** `document.visibilityState` 的可能值是 `"visible"` 和 `"hidden"`（不是 `"visible"` 和 `"invisible"`）。如果浏览器不支持 Page Visibility API（极旧浏览器），`document.visibilityState` 可能为 `undefined`——此时 `useVisibilityChange` 应将该值视为 `"visible"`（始终认为页面可见，不触发自动暂停）。

10. **【偷懒红线】** 禁止各模块在 catch 块中写 `console.error("出错了")` 了事。每个 catch 块必须：1) 将原始错误映射为 `ErrorCode`；2) 调用 `notify(translateError({ code, originalMessage: e.message }))`；3) 如果该错误对功能有持续性影响（如预计算数据加载失败），还需调用对应降级措施（如设置 `isOfflineMode = true`）。

11. **【偷懒红线】** `ERROR_DICTIONARY` 中的 17 个条目必须完整填充。禁止留空或使用"同 ANL-01"、"参见其他条目"等省略表述。每个条目都是独立的中文提示语句，可直接展示给用户。
