# 功能点：INF-01 应用可观测性

> **文档生成时间**：2026-04-28 21:19:36 CST
> **版本记录**：
> | 版本 | 时间 | 修改人 | 变更摘要 |
> |------|------|--------|----------|
> | v1.0 | 2026-04-28 21:19:36 | AI Assistant | 初始版本，对齐技术栈设计 §9.3 可观测性方案 + 现有代码骨架（FPSTracker/measure/errorCapture/useAppStore.debugInfo） |

> **冲突核查指引**：本模块写入 `useAppStore.debugInfo` 字段（已存在），扩展 `DebugInfo` 类型。已有消费者（SIM-03 mode_switch 日志）仅写入 `console.info`，不读取 `debugInfo`，不受影响。若后续其他模块开始消费 `debugInfo`，注意 Zustand selector 粒度。

### 所属模块与溯源

- **对应总设计章节**：功能模块全拆解 §八 INF-01「应用可观测性」；技术栈设计 §2 #23「前端可观测性」、§9.3「CI/CD 与自动化测试」可观测性子节、ADR-004「前端可观测性自实现」
- **依赖的其他功能模块**：
  - `SIM-01`（双摆物理引擎）— 提供 Worker 实例引用，本模块据此测量 Worker 往返耗时
  - `SYS-04`（应用初始化加载）— 提供 Pyodide/WASM 加载进度百分比，本模块记录加载阶段耗时
- **被依赖模块**：无（可观测性为最底层的横切关注点，被所有模块间接消费——开发者通过调试面板查看，不构成运行时功能依赖）
- **行业补充说明**：设计文档聚焦功能与物理，未涉及运维可观测性。但竞赛现场演示对稳定性要求极高，需基础监控以快速定位问题。技术栈 ADR-004 确认自实现轻量方案（零外部 SDK），全部代码 < 150 行。

### 已有设计兼容性分析

- **已审查的相关规格文档**：
  - `双摆混沌实验室-技术栈设计.md` v1.2：§2 #23 可观测性技术选型（`performance.mark/measure` + 自实现 FPS tracker + `onerror`/`unhandledrejection` + Zustand debug store）、§3.1 架构分层图（Obs 层写入 Store）、§9.3 可观测性详细方案（FPS 追踪 / Worker 耗时 / 错误捕获 / Pyodide 加载追踪）、ADR-004（自实现 vs Sentry，决策自实现）
  - `双摆混沌实验室-项目结构.md` v1.0：§4.9 `src/shared/lib/observability/` 目录结构（`fps-tracker.ts` / `perf-mark.ts` / `error-capture.ts`）、§4.10 `useAppStore.debugInfo` 字段定义
  - `SIM-01-双摆物理引擎.md` v2.1：Worker 消息协议（`batchReady` / `error` 事件可作为耗时测量的起止点）
  - `SIM-03-全局导航系统.md` v1.1：`useAppStore` 中 `debugInfo` 字段和 `updateDebugInfo` action
- **兼容性结论**：
  - 现有代码骨架（`FPSTracker` 类、`measure()` 函数、`initErrorCapture()` 函数、`useAppStore.debugInfo`）与技术栈设计 §9.3 一致，无需推翻重写
  - `DebugInfo` 类型已包含 `fps` / `workerLatencyMs` / `errors` / `pyodideLoadPct` 四个字段，与技术栈要求完全对齐
  - 当前缺失的是**集成层**（将各独立 tracker 的结果汇总写入 `useAppStore`）和**调试面板 UI**（Ctrl+Shift+D 触发的可视化面板），本规格补充这两部分
  - 无冲突
- **复用的已有定义**：`FPSTracker` 类（`src/shared/lib/observability/fps-tracker.ts`）、`measure()` 函数（`src/shared/lib/observability/perf-mark.ts`）、`initErrorCapture()` / `getErrors()` 函数（`src/shared/lib/observability/error-capture.ts`）、`useAppStore.debugInfo` / `updateDebugInfo`（`src/stores/useAppStore.ts`）

### 技术栈绑定

- **必须使用**：
  - TypeScript 5.x — 所有 tracker 和集成代码的类型安全
  - 原生 `performance.mark()` / `performance.measure()` — Worker 耗时、关键路径耗时测量（Chrome DevTools 兼容，无需额外依赖）
  - 原生 `requestAnimationFrame` — FPS 追踪计时源（与渲染管线同频，测量的是"用户感知帧率"）
  - 原生 `window.onerror` + `window.onunhandledrejection` — 全局错误捕获（覆盖同步异常 + Promise  rejection）
  - `zustand@^4.x` — 通过 `useAppStore.updateDebugInfo()` 写入聚合指标
  - `shadcn/ui`（Copy 模式）— 调试面板的 `Sheet` 组件（侧边滑出面板）
  - `lucide-react` — 调试面板图标（`Bug` / `Activity` / `AlertTriangle` / `Clock`）
  - `react@^18.x` — 调试面板 UI 组件和 hook 封装
- **禁止使用**：
  - 禁止引入任何外部可观测性/APM SDK（Sentry、Datadog RUM、OpenTelemetry JS 等）。技术栈 ADR-004 明确决策：自包含约束 + 纯客户端无上报终点，外部 SDK 的采集→发送链路不成立
  - 禁止在 `FPSTracker.tick()` 中使用 `Date.now()` 替代 `performance.now()`。`Date.now()` 精度为 ms 级且受系统时钟调整影响；`performance.now()` 精度为 μs 级且单调递增
  - 禁止在错误捕获回调中执行可能再次抛出异常的同步代码。`onError` 回调内部必须 try-catch 包裹
  - 禁止在 production 构建中完全移除可观测性代码。FPS 追踪和错误捕获在 production 中仍需运行（用于现场调试），仅调试面板 UI 可通过条件编译/环境变量控制可见性
  - 禁止阻塞式收集指标（如在 rAF 回调中做大量计算）。所有 tracker 的 tick/measure 操作必须是 O(1) 或 O(log N) 且耗时 < 0.1ms

### 输入定义（精确类型）

#### 核心类型扩展

在 `src/shared/types/app.ts` 中不需要新增类型（`DebugInfo` 已在 `useAppStore.ts` 中内联定义）。本模块内部新增以下类型：

```typescript
// ============================================================
// src/shared/lib/observability/types.ts（本模块内部类型，不对外暴露）
// ============================================================

/**
 * 单次 Worker 任务耗时记录。
 * 每个 time 字段使用 performance.now() 的相对时间 (ms)。
 */
interface WorkerLatencyRecord {
  /** 任务开始时间戳 (performance.now(), ms) */
  startTime: number;
  /** 任务耗时 (ms) = endTime - startTime */
  durationMs: number;
  /** 任务类型 */
  taskType: "rk4-batch" | "rk45-detect" | "reset" | "init";
  /** 该批次包含的帧数（仅 rk4-batch 有效，其他为 -1） */
  frameCount: number;
}

/**
 * Pyodide 加载阶段枚举。
 * 用于在 debugInfo.pyodideLoadPct 之外提供阶段标记。
 */
type PyodideLoadPhase =
  | "idle"           // 未开始加载
  | "downloading"    // 正在下载 WASM/Python stdlib
  | "initializing"   // WASM 实例化 + Python 初始化
  | "ready"          // 加载完成，可执行
  | "error";         // 加载失败

/**
 * 调试面板的 tab 页。
 */
type DebugPanelTab = "overview" | "errors" | "performance";

/**
 * 可观测性初始化配置。
 * 由 SYS-04 应用初始化流程或 App.tsx 入口在应用启动时传入。
 */
interface ObservabilityConfig {
  /** FPS 追踪滑动窗口大小（帧数），默认 60 */
  fpsWindowSize: number;
  /** Worker 耗时记录滑动窗口大小（条数），默认 100 */
  workerLatencyWindowSize: number;
  /** 错误日志环形缓冲区容量（条数），默认 50 */
  errorBufferSize: number;
  /** 是否在 production 中启用调试面板快捷键，默认 false */
  enableDebugPanelInProduction: boolean;
  /** FPS 写入 store 的节流间隔 (ms)，默认 1000（每秒更新一次 store，避免高频重渲染） */
  fpsStoreThrottleMs: number;
  /** Worker 耗时写入 store 的最小任务间隔（每 N 个任务写一次 store），默认 10 */
  workerLatencyBatchSize: number;
}
```

#### 集成层输入

```typescript
// ============================================================
// 各 tracker 向集成层 (ObservabilityCoordinator) 提供的输入
// ============================================================

/** FPS Tracker 输入：由 rAF 循环每帧调用 */
interface FpsTickInput {
  /** performance.now() 时间戳 (ms) */
  now: number;
}

/** Worker 耗时输入：由 Worker 消息处理函数在收到响应时调用 */
interface WorkerLatencyInput {
  /** 任务类型 */
  taskType: WorkerLatencyRecord["taskType"];
  /** 耗时 (ms) */
  durationMs: number;
  /** 帧数（rk4-batch 传 120，其他传 -1） */
  frameCount: number;
}

/** Pyodide 加载进度输入：由 usePyodide hook 在加载过程中调用 */
interface PyodideProgressInput {
  /** 加载阶段 */
  phase: PyodideLoadPhase;
  /** 加载百分比 (0-100)，-1 表示无法估计 */
  percent: number;
  /** 阶段耗时 (ms)，从上一阶段进入至今。首次为 0 */
  phaseDurationMs: number;
}

/** 错误事件输入：由 error-capture.ts 的全局回调提供 */
interface ErrorCaptureInput {
  /** 错误时间戳 (ISO 8601) */
  timestamp: string;
  /** 错误消息 */
  message: string;
  /** 错误来源 */
  source: "onerror" | "unhandledrejection";
  /** 发生错误的文件名（onerror 提供，unhandledrejection 为空字符串） */
  filename: string;
  /** 行号（不可用时为 -1） */
  lineNumber: number;
  /** 列号（不可用时为 -1） */
  colNumber: number;
}
```

### 输出定义（精确类型）

#### 写入 useAppStore.debugInfo 的聚合数据

```typescript
// ============================================================
// useAppStore.debugInfo（已存在于 src/stores/useAppStore.ts:5-10）
// 本模块通过 updateDebugInfo(patch) 写入以下字段：
// ============================================================

interface DebugInfo {
  /**
   * 当前滑动窗口平均 FPS。
   * 由 FPSTracker.average 计算，每秒通过 updateDebugInfo({ fps }) 写入一次。
   * 类型：number，范围 [0, 240]，默认 0。
   * 示例：59.8（表示最近 60 帧平均 59.8 fps）
   */
  fps: number;

  /**
   * 最近 N 次 Worker 任务耗时列表 (ms)。
   * 环形缓冲，最多保留 workerLatencyWindowSize 条（默认 100）。
   * 按任务完成时间降序排列（最新的在前）。
   * 类型：number[]，默认 []。
   * 示例：[2.3, 2.1, 2.8, 1.9, 2.5, ...]
   */
  workerLatencyMs: number[];

  /**
   * 全局未捕获异常的日志行列表。
   * 环形缓冲，最多保留 errorBufferSize 条（默认 50）。
   * 每条格式：`[ISO时间戳] 错误消息`。
   * 类型：string[]，默认 []。
   * 示例：["[2026-04-28T13:19:36.123Z] Worker 崩溃: OOM", ...]
   */
  errors: string[];

  /**
   * Pyodide/WASM 加载进度百分比 (0-100)。
   * 由 SYS-04 或 usePyodide hook 通过 updateDebugInfo({ pyodideLoadPct }) 更新。
   * -1 表示未开始加载。
   * 类型：number，范围 [-1, 100]，默认 -1。
   */
  pyodideLoadPct: number;
}
```

#### 调试面板 UI 输出（React 组件）

调试面板是一个 shadcn/ui `Sheet` 组件，通过键盘快捷键 `Ctrl+Shift+D` 触发打开/关闭。面板内容如下：

```typescript
// 面板布局（概念结构，不是类型定义）：
//
// ┌─────────────────────────────────────────┐
// │  调试面板                        [关闭]  │
// ├─────────────────────────────────────────┤
// │  [概览]  [错误日志]  [性能]              │  ← Tabs
// ├─────────────────────────────────────────┤
// │                                         │
// │  Tab 1: 概览 (overview)                  │
// │  ┌─────────────────────────────────┐    │
// │  │ FPS          │ 59.8 fps  ████░░ │    │  ← 仪表式指标
// │  │ Worker 延迟  │ 2.3 ms    ██░░░░ │    │
// │  │ Pyodide      │ ready     ██████ │    │
// │  │ 未捕获异常   │ 0         ░░░░░░ │    │
// │  │ 当前模式     │ explore           │    │
// │  │ 设备类型     │ desktop           │    │
// │  └─────────────────────────────────┘    │
// │                                         │
// │  Tab 2: 错误日志 (errors)                │
// │  ┌─────────────────────────────────┐    │
// │  │ [13:19:36] Worker 积分发散 t=5.2│    │
// │  │ [13:18:01] Pyodide 加载失败     │    │
// │  │ [13:15:42] TypeError: ...       │    │
// │  │ ... (最多显示 50 条)            │    │
// │  └─────────────────────────────────┘    │
// │  [清空日志]  [复制全部]                 │
// │                                         │
// │  Tab 3: 性能 (performance)              │
// │  ┌─────────────────────────────────┐    │
// │  │ Worker 耗时分布 (最近 100 次)    │    │
// │  │  p50: 2.1ms  p95: 3.8ms        │    │
// │  │  p99: 5.2ms  max: 8.1ms        │    │
// │  │                                 │    │
// │  │ FPS 时间线 (最近 10s)           │    │
// │  │ ▁▂▃▄▅▆▇█▇▆▅▄▃▂▁ (sparkline)   │    │
// │  └─────────────────────────────────┘    │
// └─────────────────────────────────────────┘
```

### 核心逻辑步骤

本模块的实现分为四个层次：**数据采集**（已部分实现）→ **集成调度**（待实现）→ **Store 写入**（已部分实现）→ **UI 展示**（待实现）。

#### 层次 1：FPS 追踪（数据采集）

**步骤 1.1：FPSTracker 类**（已实现于 `src/shared/lib/observability/fps-tracker.ts`）

- **操作对象**：`FPSTracker` 实例，内部维护 `samples: number[]`（滑动窗口，容量 `maxSamples`）
- **具体操作**：
  1. 构造：`new FPSTracker(maxSamples = 60)` —— 存储最近 60 帧的瞬时 FPS 值
  2. `tick(now: number)`：计算 `delta = now - lastTime`（ms），瞬时 FPS = `1000 / delta`，追加到 `samples`；超过容量时 `shift()` 移除最旧值
  3. `get average(): number`：`samples` 为空返回 0；`samples` 非空返回 `sum(samples) / samples.length`
  4. `reset()`：清空 `samples` 和 `lastTime`
- **输入来源**：rAF 回调每帧传入 `performance.now()`
- **输出去向**：`average` 属性供集成层每秒读取一次
- **失败行为**：`delta` 为 0（极不可能）→ `1000 / 0 = Infinity` → 跳过该帧（不追加到 samples）

**步骤 1.2：rAF 循环集成**

- **操作对象**：全局唯一的 rAF 循环（由 SYS-04 初始化加载或 App.tsx 启动）
- **具体操作**：
  ```typescript
  // 在应用入口的顶层 rAF 循环中：
  const fpsTracker = new FPSTracker(60);
  let lastFpsStoreUpdate = 0;

  function appFrame(now: number) {
    fpsTracker.tick(now);  // O(1)，每次 < 0.01ms

    // 节流写入 store（每秒一次，避免高频 Zustand 更新触发不必要的重渲染）
    if (now - lastFpsStoreUpdate >= 1000) {
      useAppStore.getState().updateDebugInfo({ fps: Math.round(fpsTracker.average * 10) / 10 });
      lastFpsStoreUpdate = now;
    }

    requestAnimationFrame(appFrame);
  }
  requestAnimationFrame(appFrame);
  ```
- **输入来源**：`requestAnimationFrame` 回调的 `DOMHighResTimeStamp`
- **输出去向**：每秒一次写入 `useAppStore.debugInfo.fps`
- **失败行为**：rAF 被浏览器节流（后台标签页）→ FPS 降至 1-5 fps → 值为正确反映（浏览器行为，非 bug）

#### 层次 2：Worker 耗时追踪（数据采集）

**步骤 2.1：performance.mark/measure 封装**（已实现于 `src/shared/lib/observability/perf-mark.ts`）

- **操作对象**：`performance` timeline
- **具体操作**：
  ```typescript
  // 已实现：
  export function measure(name: string, fn: () => void): number {
    const markStart = `${name}-start`;
    const markEnd = `${name}-end`;
    performance.mark(markStart);
    fn();
    performance.mark(markEnd);
    const m = performance.measure(name, markStart, markEnd);
    performance.clearMarks(markStart);
    performance.clearMarks(markEnd);
    return m.duration;
  }
  ```
- **输入来源**：调用方传入任务名称和同步执行的回调
- **输出去向**：返回耗时 (ms)；同时在 Chrome DevTools Performance 面板中可见标记
- **失败行为**：`fn()` 抛出异常 → `measure()` 不捕获，异常向上传播；mark 已创建但未清理 → 需在调用方 try-finally 中 `clearMarks`

**步骤 2.2：Worker 消息往返耗时测量**（待实现——集成到 Worker 消息处理流程）

- **操作对象**：主线程与 Worker 之间的 `postMessage` / `onmessage` 往返
- **具体操作**：
  ```typescript
  // 在 Worker 通信管理代码中（src/features/simulation/worker/ 或 hooks）：
  const workerLatencyBuffer: number[] = [];  // 环形缓冲，容量 100
  let latencyBatchCounter = 0;

  function sendWorkerStep(worker: Worker, buffer: Float64Array): void {
    const startMark = `rk4-batch-${batchId}`;
    performance.mark(`${startMark}-start`);

    worker.postMessage({ type: "step", buffer }, [buffer.buffer]);
    // ... Worker 响应处理：
    worker.onmessage = (e) => {
      if (e.data.type === "batchReady") {
        performance.mark(`${startMark}-end`);
        const m = performance.measure(`rk4-batch`, `${startMark}-start`, `${startMark}-end`);
        performance.clearMarks(`${startMark}-start`);
        performance.clearMarks(`${startMark}-end`);

        // 写入环形缓冲
        workerLatencyBuffer.push(m.duration);
        if (workerLatencyBuffer.length > 100) workerLatencyBuffer.shift();

        // 批量写入 store（每 10 次写一次，减少重渲染）
        latencyBatchCounter++;
        if (latencyBatchCounter >= 10) {
          latencyBatchCounter = 0;
          useAppStore.getState().updateDebugInfo({
            workerLatencyMs: [...workerLatencyBuffer].reverse()
          });
        }
      }
    };
  }
  ```
- **输入来源**：Worker 消息收发事件
- **输出去向**：环形缓冲 → 每 10 次批量写入 `useAppStore.debugInfo.workerLatencyMs`
- **失败行为**：Worker 崩溃（`onerror` 触发）→ 不记录此次耗时；由错误捕获层单独记录崩溃事件

#### 层次 3：全局错误捕获（数据采集）

**步骤 3.1：错误捕获函数**（已实现于 `src/shared/lib/observability/error-capture.ts`）

- **操作对象**：`window.onerror` 和 `window.onunhandledrejection` 全局钩子
- **具体操作**：
  ```typescript
  // 已实现（需小幅增强以对接 Zustand）：
  const MAX_ERRORS = 50;
  const errors: string[] = [];

  export function initErrorCapture(onError: (errors: string[]) => void) {
    window.onerror = (_msg, _src, _line, _col, error) => {
      const msg = error?.message ?? String(_msg);
      pushError(msg);
      onError([...errors]);  // 回调通知（应用层传入 updateDebugInfo）
    };

    window.onunhandledrejection = (event) => {
      const msg = event.reason?.message ?? event.reason ?? "unhandled rejection";
      pushError(String(msg));
      onError([...errors]);
    };
  }

  function pushError(msg: string) {
    errors.push(`[${new Date().toISOString()}] ${msg}`);
    if (errors.length > MAX_ERRORS) errors.shift();
  }

  export function getErrors(): string[] {
    return [...errors];
  }
  ```
- **输入来源**：浏览器运行时未捕获的同步异常和 Promise rejection
- **输出去向**：模块级 `errors` 数组（环形 50 条）+ 通过回调写入 `useAppStore.debugInfo.errors`
- **失败行为**：`onError` 回调内部抛出异常 → 在 `initErrorCapture` 内部 try-catch 包裹回调调用，避免无限递归

**步骤 3.2：对接 Zustand**（待实现——在应用入口调用 `initErrorCapture`）

- **操作对象**：`useAppStore`
- **具体操作**：
  ```typescript
  // 在 App.tsx 或 SYS-04 初始化流程中：
  import { initErrorCapture } from "@/shared/lib/observability/error-capture";

  // 应用启动时调用一次：
  initErrorCapture((errors) => {
    useAppStore.getState().updateDebugInfo({ errors });
  });
  ```
- **输入来源**：`initErrorCapture` 的回调参数
- **输出去向**：`useAppStore.debugInfo.errors`
- **失败行为**：重复调用 `initErrorCapture` → 覆盖 `window.onerror` / `onunhandledrejection`（之前的回调丢失）→ 必须确保仅调用一次

#### 层次 4：Pyodide 加载状态追踪（数据采集）

**步骤 4.1：Pyodide 加载进度记录**（待实现——在 usePyodide hook 中接入）

- **操作对象**：`useAppStore.debugInfo.pyodideLoadPct`
- **具体操作**：
  ```typescript
  // 在 usePyodide hook（src/features/lab/hooks/usePyodide.ts）的加载流程中：
  // Pyodide 三级缓存加载的各阶段插入以下调用：

  // 阶段 1：检查本地文件系统
  updateDebugInfo({ pyodideLoadPct: 0 });

  // 阶段 2：下载中（如从 IndexedDB 或 CDN）
  // 如果 Pyodide 提供 onProgress 回调：
  loadPyodide({
    onProgress: (pct: number) => {
      useAppStore.getState().updateDebugInfo({ pyodideLoadPct: Math.round(pct) });
    }
  });

  // 阶段 3：完成
  updateDebugInfo({ pyodideLoadPct: 100 });

  // 阶段 4：失败
  // catch 块中：
  updateDebugInfo({ pyodideLoadPct: -1 });
  ```
- **输入来源**：`usePyodide` hook 中的加载进度事件
- **输出去向**：`useAppStore.debugInfo.pyodideLoadPct`
- **失败行为**：Pyodide 的三级缓存全失败 → `pyodideLoadPct = -1`，调试面板概览页显示"Pyodide: error"

#### 层次 5：集成调度层（ObservabilityCoordinator）

**步骤 5.1：创建集成调度器**（待实现——新建 `src/shared/lib/observability/coordinator.ts`）

- **操作对象**：应用全局单例的 `ObservabilityCoordinator` 类
- **具体操作**：
  ```typescript
  // src/shared/lib/observability/coordinator.ts

  import { FPSTracker } from "./fps-tracker";
  import { initErrorCapture } from "./error-capture";
  import type { ObservabilityConfig } from "./types";

  export class ObservabilityCoordinator {
    readonly fpsTracker: FPSTracker;
    private config: ObservabilityConfig;
    private fpsStoreTimer = 0;
    private workerLatencyBuffer: number[] = [];
    private latencyCounter = 0;
    private initialized = false;

    constructor(config: Partial<ObservabilityConfig> = {}) {
      this.config = {
        fpsWindowSize: config.fpsWindowSize ?? 60,
        workerLatencyWindowSize: config.workerLatencyWindowSize ?? 100,
        errorBufferSize: config.errorBufferSize ?? 50,
        enableDebugPanelInProduction: config.enableDebugPanelInProduction ?? false,
        fpsStoreThrottleMs: config.fpsStoreThrottleMs ?? 1000,
        workerLatencyBatchSize: config.workerLatencyBatchSize ?? 10,
      };
      this.fpsTracker = new FPSTracker(this.config.fpsWindowSize);
    }

    /** 应用启动时调用一次。初始化所有 tracker 并绑定到 useAppStore。 */
    init(): void {
      if (this.initialized) return;
      this.initialized = true;

      // 1. 全局错误捕获 → Zustand
      initErrorCapture((errors) => {
        // 使用 getState() 避免依赖 React 生命周期
        try {
          const store = this.getStore();
          store.updateDebugInfo({ errors });
        } catch { /* 防止回调本身抛错导致无限循环 */ }
      });

      // 2. 启动 FPS 追踪循环
      const loop = (now: number) => {
        this.fpsTracker.tick(now);
        if (now - this.fpsStoreTimer >= this.config.fpsStoreThrottleMs) {
          this.fpsStoreTimer = now;
          try {
            this.getStore().updateDebugInfo({
              fps: Math.round(this.fpsTracker.average * 10) / 10
            });
          } catch { /* store 未就绪时静默忽略 */ }
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }

    /** 记录 Worker 任务耗时。在 Worker onmessage 处理中调用。 */
    recordWorkerLatency(durationMs: number): void {
      this.workerLatencyBuffer.push(durationMs);
      if (this.workerLatencyBuffer.length > this.config.workerLatencyWindowSize) {
        this.workerLatencyBuffer.shift();
      }
      this.latencyCounter++;
      if (this.latencyCounter >= this.config.workerLatencyBatchSize) {
        this.latencyCounter = 0;
        try {
          this.getStore().updateDebugInfo({
            workerLatencyMs: [...this.workerLatencyBuffer].reverse()
          });
        } catch { /* 静默 */ }
      }
    }

    /** 更新 Pyodide 加载进度。在 usePyodide hook 中调用。 */
    updatePyodideProgress(pct: number): void {
      try {
        this.getStore().updateDebugInfo({ pyodideLoadPct: pct });
      } catch { /* 静默 */ }
    }

    /** 获取 store 引用（延迟求值以解耦初始化顺序） */
    private getStore() {
      // 动态 import 避免循环依赖：coordinator.ts 不静态依赖 useAppStore
      // 实际实现中通过全局注册或参数传入
      const { useAppStore } = require("@/stores/useAppStore") as typeof import("@/stores/useAppStore");
      return useAppStore.getState() as ReturnType<typeof useAppStore.getState> & {
        updateDebugInfo: (patch: Partial<{
          fps: number;
          workerLatencyMs: number[];
          errors: string[];
          pyodideLoadPct: number;
        }>) => void;
      };
    }

    /** 重置所有 tracker（模式切换时不需要，仅页面重新初始化时调用） */
    reset(): void {
      this.fpsTracker.reset();
      this.workerLatencyBuffer = [];
      this.latencyCounter = 0;
    }
  }

  /** 全局单例。应用启动时由 SYS-04 或 App.tsx 创建并 init() */
  export const observabilityCoordinator = new ObservabilityCoordinator();
  ```

- **输入来源**：各 tracker 的原始数据
- **输出去向**：统一的 `useAppStore.updateDebugInfo()` 调用
- **失败行为**：
  - `getStore()` 在 Zustand store 未初始化时被调用 → try-catch 包裹，静默忽略
  - 重复 `init()` → `initialized` 标志位阻止重复初始化
  - rAF 循环中 store 写入失败（如 store 被销毁）→ 静默忽略，不影响应用功能

#### 层次 6：调试面板 UI（UI 展示）

**步骤 6.1：DebugPanel 组件**（待实现——新建 `src/shared/components/debug/DebugPanel.tsx`）

- **操作对象**：shadcn/ui `Sheet` 组件 + `Tabs` 组件
- **具体操作**：
  1. **触发**：全局键盘事件监听 `Ctrl+Shift+D`（`e.ctrlKey && e.shiftKey && e.key === "D"`）
  2. **禁止在 production 中响应**（除非 `config.enableDebugPanelInProduction === true`）：检查 `import.meta.env.DEV`
  3. **面板内容**：
     - **Tab 1 概览**：从 `useAppStore(s => s.debugInfo)` 读取 `fps`、`workerLatencyMs`、`errors`、`pyodideLoadPct`；附加显示 `activeMode` 和 `deviceType`
     - 每项指标使用颜色编码：FPS ≥ 55 绿色 / 30-55 黄色 / < 30 红色；Worker 耗时 < 5ms 绿色 / 5-16ms 黄色 / > 16ms 红色；异常数 0 绿色 / 1-5 黄色 / > 5 红色
     - **Tab 2 错误日志**：渲染 `errors[]` 列表，最新在前；提供"清空日志"按钮（`updateDebugInfo({ errors: [] })`）和"复制全部"按钮（`navigator.clipboard.writeText(errors.join('\n'))`）
     - **Tab 3 性能**：显示 Worker 耗时百分位（p50/p95/p99/max）——在前端计算百分位（对 `workerLatencyMs` 排序后取值）；FPS 历史时间线——扩展 `FPSTracker` 存储最近 10 秒的 `average` 快照（每秒一个值），用简单的 Unicode sparkline 或 Canvas 迷你图渲染
  4. **关闭**：点击 Sheet 外部或关闭按钮
- **输入来源**：`useAppStore.debugInfo`（通过 Zustand selector 订阅）
- **输出去向**：屏幕侧边滑出面板（不阻塞主界面操作）
- **失败行为**：
  - `navigator.clipboard` 不可用（非 HTTPS 环境）→ "复制全部"按钮降级为选中文本后提示用户手动 Ctrl+C
  - `errors` 数组为空 → 显示"暂无错误"占位文本
  - `workerLatencyMs` 数组为空 → 显示"暂无性能数据"占位文本

**步骤 6.2：键盘快捷键注册**

- **操作对象**：`window` 全局键盘事件
- **具体操作**：
  ```typescript
  // 在 App.tsx 或 DebugPanel 组件的 useEffect 中：
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "D") {
        e.preventDefault();
        setPanelOpen(prev => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  ```
- **输入来源**：用户键盘输入
- **输出去向**：切换调试面板的 `open` 状态
- **失败行为**：快捷键与浏览器默认快捷键冲突（Chrome DevTools 也是 Ctrl+Shift+D）→ 调用 `e.preventDefault()` 阻止浏览器默认行为（仅在开发模式下）

### 依赖与集成接口

#### 本模块对外暴露的公共接口（`src/shared/lib/observability/index.ts`）

| 导出项 | 类型 | 用途 |
|--------|------|------|
| `ObservabilityCoordinator` | class | 集成调度器类，应用启动时实例化并 `init()` |
| `observabilityCoordinator` | `ObservabilityCoordinator` | 全局单例，供所有模块调用 `recordWorkerLatency()` / `updatePyodideProgress()` |
| `FPSTracker` | class | 独立的 FPS 追踪类（可供测试或自定义 rAF 循环使用） |
| `measure` | function | `performance.mark/measure` 同步封装 |
| `initErrorCapture` | function | 全局错误捕获初始化（通常由 Coordinator.init() 内部调用） |
| `getErrors` | function | 获取当前缓存的错误列表 |

#### 本模块依赖的外部接口

| 依赖方 | 具体接口 | 用途 |
|--------|----------|------|
| `useAppStore` | `getState().updateDebugInfo(patch)` | 写入聚合指标到全局 store |
| `useAppStore` | `useAppStore(s => s.debugInfo)` | 调试面板读取聚合指标 |
| `requestAnimationFrame` | 浏览器 API | FPS 追踪的计时源 |
| `performance.mark/measure` | 浏览器 API | Worker 耗时测量 |
| `window.onerror` / `window.onunhandledrejection` | 浏览器 API | 全局错误捕获 |
| `import.meta.env.DEV` | Vite 环境变量 | 控制调试面板仅在开发模式响应快捷键 |

#### 其他模块对本模块的调用约定

| 调用方模块 | 调用时机 | 调用方法 |
|-----------|----------|----------|
| `SYS-04` 应用初始化加载 | 应用启动时（在 React 挂载前或 App.tsx 入口） | `observabilityCoordinator.init()` — 仅调用一次 |
| `SIM-01` Worker 通信管理 | 每次收到 Worker `batchReady` 消息后 | `observabilityCoordinator.recordWorkerLatency(durationMs)` |
| `LAB-03` usePyodide hook | Pyodide 加载进度变化时 | `observabilityCoordinator.updatePyodideProgress(pct)` |
| `App.tsx` 或 `shared/components/layout/AppShell.tsx` | React 挂载后 | 渲染 `<DebugPanel />` 组件（仅在 `import.meta.env.DEV` 下） |

### 状态机

本模块无可变业务状态机。以下为 `ObservabilityCoordinator` 内部初始化和错误捕获的生命周期状态：

| 当前状态 | 触发事件 | 下一状态 | 前置条件 | 副作用 |
|----------|----------|----------|----------|--------|
| `uninitialized` | `coordinator.init()` | `running` | — | 注册 `window.onerror` / `onunhandledrejection`；启动 rAF 循环；`initialized = true` |
| `running` | 全局未捕获异常 | `running` | — | 追加到 `errors[]` 环形缓冲；通过回调写入 `useAppStore.debugInfo.errors` |
| `running` | rAF 每帧 | `running` | — | `fpsTracker.tick(now)`；每秒写入 `debugInfo.fps` |
| `running` | Worker 消息到达 | `running` | — | `workerLatencyBuffer.push()`；每 N 次写入 `debugInfo.workerLatencyMs` |
| `running` | `coordinator.reset()` | `running` | — | 清空 FPS samples、Worker 延迟缓冲、计数器归零 |
| `running` | 页面卸载 | —（销毁） | — | rAF 随页面停止；事件监听随 window 销毁释放 |

### 异常与边界条件

#### 异常 1：全局错误捕获的回调本身抛出异常（无限递归风险）

- **触发条件**：`initErrorCapture` 的 `onError` 回调内部执行了可能抛错的代码（如对 store 的写入失败后未 catch），导致新的 `onerror` 事件触发
- **处理策略**：
  1. `onError` 回调体使用 try-catch 包裹（在 `ObservabilityCoordinator.init()` 中）
  2. catch 块内使用 `console.error("[Observability] 错误回调异常:", e)` 记录但不触发新的 `onerror`
  3. 设置 `errorCallbackInProgress` 标志位，重入检测：若标志位为 true，直接 return 不处理
- **重试参数**：不重试

#### 异常 2：performance.mark/measure API 不可用

- **触发条件**：极旧浏览器（IE 11 及以下，不在目标范围）或在 CSP 限制下的特殊环境
- **处理策略**：
  1. 在 `measure()` 函数入口做能力检测：`typeof performance.mark === "function"`
  2. 不可用时返回 `-1`，通过 `console.warn` 提示一次（去重）
- **重试参数**：不重试，后续所有 `measure()` 调用直接返回 -1

#### 异常 3：rAF 循环中 store 写入过于频繁导致 React 重渲染性能问题

- **触发条件**：每帧（60fps）都写入 `updateDebugInfo({ fps })`，但 Zustand selector 订阅粒度过粗导致大量组件重渲染
- **处理策略**：
  1. FPS 写入节流 1000ms（`fpsStoreThrottleMs`）
  2. Worker 延迟写入批量（每 10 次写一次，`workerLatencyBatchSize`）
  3. 调试面板组件使用精确 selector：`useAppStore(s => s.debugInfo.fps)` 而非 `useAppStore(s => s.debugInfo)`
  4. 所有 `updateDebugInfo` 调用使用 `getState()`（不触发重渲染的静态读取）+ 浅合并
- **重试参数**：不适用

#### 异常 4：调试面板快捷键与 Chrome DevTools 冲突

- **触发条件**：用户在开发模式下按 `Ctrl+Shift+D`，浏览器同时打开 DevTools 和本应用的调试面板
- **处理策略**：
  1. 调用 `e.preventDefault()` 阻止浏览器默认行为
  2. 仅在 `import.meta.env.DEV` 或 `config.enableDebugPanelInProduction === true` 时注册快捷键
  3. 提示文案中说明快捷键可能冲突，提供面板内的关闭按钮作为替代
- **重试参数**：不适用

#### 异常 5：Worker 延迟缓冲在长时间运行后的内存占用

- **触发条件**：应用运行 > 1 小时，Worker 任务数 > 360,000 次（60fps × 60s × 60min × batch 每 120 帧 ≈ 1,800 次记录）
- **处理策略**：
  1. `workerLatencyBuffer` 使用固定容量环形缓冲（100 条），单条为 number（8 bytes），总计 < 1KB
  2. `errors` 使用固定容量环形缓冲（50 条），单条约 100 chars ≈ 200 bytes，总计 < 10KB
  3. FPSTracker `samples` 固定 60 条，单条 number，总计 < 500 bytes
- **重试参数**：不适用。固定容量的环形缓冲天然防止内存泄漏。

#### 异常 6：在 Pyodide 未加载时尝试更新 Pyodide 进度

- **触发条件**：应用中存在路径意外调用 `updatePyodideProgress(pct)` 但 Pyodide 加载流程尚未开始
- **处理策略**：
  1. `ObservatoryCoordinator.updatePyodideProgress()` 不校验 Pyodide 实际状态（仅做透传写入 store）
  2. 调试面板概览页显示"Pyodide: -1"并标记为灰色（"未启动"）
  3. 不做额外判断，避免引入与 LAB-03 usePyodide hook 的耦合
- **重试参数**：不适用

### 原则兑现清单

| 原则来源 | 原则名称 | 代码级约束 |
|----------|----------|------------|
| 技术栈设计 ADR-004 | 自实现轻量可观测性 | 全部代码在 `src/shared/lib/observability/` 内，零外部 SDK 依赖；总计 < 200 行 |
| 技术栈设计 §9.3 | 四项指标全覆盖 | FPS (`FPSTracker`)、Worker 耗时 (`performance.measure`)、Pyodide 加载状态 (`pyodideLoadPct`)、全局错误 (`initErrorCapture`) —— 每项都有独立的采集→聚合→Store 写入链路 |
| 技术栈设计 §9.3 | 写入 Zustand debug store | 所有指标最终写入 `useAppStore.debugInfo`，通过 `updateDebugInfo(patch)` 浅合并 |
| 项目结构设计 §4.9 | 共享层零业务逻辑 | 所有 tracker 是纯工具函数/类，不依赖 business state；仅依赖 `useAppStore`（全局 store，在共享层允许范围内） |
| 项目结构设计 §4.10 | 全局 Store 仅管理跨 Feature 共享状态 | `debugInfo` 是跨模式的应用级指标，符合全局 Store 职责范围 |
| AGENT.md 核心原则 | 前端逻辑层与表现层分离 | 数据采集（FPSTracker/measure/errorCapture/Coordinator）是逻辑层；`DebugPanel.tsx` 是表现层；两者通过 `useAppStore` 解耦 |
| 功能设计_v0 §九 | 优雅降级 | 所有 tracker 失败不影响应用主功能；try-catch 包裹所有 store 写入；API 不可用时静默降级（返回 -1 或空数组） |
| 通用原则 | 单一职责 | `FPSTracker` 只追踪帧率；`measure` 只测量耗时；`error-capture` 只捕获错误；`Coordinator` 只负责集成调度。每个文件 < 60 行 |

### 验收测试场景

#### 正向测试 1：FPS 追踪写入 Store

- **Given**：应用正常运行在桌面浏览器，仿真以 60fps 运行中
- **When**：`ObservabilityCoordinator.init()` 已调用，rAF 循环运行 ≥ 2 秒
- **Then**：
  - `useAppStore.getState().debugInfo.fps` 值在 55-65 之间（正常桌面帧率）
  - FPS 值每秒更新一次（连续两次读取间隔 1s，数值可能不同）
  - `FPSTracker.average` 返回的浮点精度为 1 位小数（`Math.round(fps * 10) / 10`）
  - FPS 值在 rAF 循环被节流时如实反映低帧率（如切换到后台标签页）

#### 正向测试 2：Worker 耗时记录

- **Given**：仿真 Worker 正常运行，`ObservabilityCoordinator` 已初始化
- **When**：连续接收 10 次 Worker `batchReady` 消息，每次调用 `coordinator.recordWorkerLatency(durationMs)`
- **Then**：
  - 第 10 次调用后，`useAppStore.getState().debugInfo.workerLatencyMs` 包含 10 条记录
  - 所有耗时值 > 0 且 < 50ms（正常 RK4 批量积分耗时）
  - 列表按最新在前排列（`.reverse()` 已应用）
  - 单条耗时值精度为毫秒级（小数位数 1-2 位）

#### 正向测试 3：全局错误捕获并写入 Store

- **Given**：`ObservabilityCoordinator.init()` 已调用，`initErrorCapture` 已注册全局钩子
- **When**：代码中抛出一个未捕获异常：`throw new Error("测试错误: 参数越界")`
- **Then**：
  - `useAppStore.getState().debugInfo.errors` 数组末尾新增一条
  - 该条目格式为 `[ISO时间戳] 测试错误: 参数越界`
  - 时间戳可解析为合法 Date
  - 原有错误日志不丢失（追加，非覆盖）

#### 正向测试 4：调试面板快捷键打开/关闭

- **Given**：`DebugPanel` 组件已挂载，`import.meta.env.DEV === true`
- **When**：用户按下 `Ctrl+Shift+D`
- **Then**：
  - 调试面板 Sheet 从右侧滑入
  - 面板显示概览 tab（默认），包含 FPS / Worker 延迟 / Pyodide 状态 / 异常数 / 当前模式 / 设备类型
  - 再次按下 `Ctrl+Shift+D` → 面板关闭
  - 点击 Sheet 外部遮罩 → 面板关闭

#### 异常测试 1：性能 API 不可用时的降级

- **Given**：模拟 `performance.mark` 不存在（`delete (performance as any).mark`）
- **When**：调用 `measure("test", () => { let x = 0; for (let i = 0; i < 1000; i++) x += i; })`
- **Then**：
  - 返回 `-1`
  - 不抛出异常
  - `console.warn` 输出一次能力缺失提示（后续调用不再重复提示）

#### 异常测试 2：错误回调重入保护

- **Given**：`ObservabilityCoordinator.init()` 已调用
- **When**：篡改 `onError` 回调使其抛出新异常（模拟回调 bug）；然后触发一个真实的 `window.onerror`
- **Then**：
  - 不出现无限递归（`onerror` → 回调抛错 → `onerror` → ...）
  - `console.error` 输出"[Observability] 错误回调异常: ..."
  - 原始错误仍被记录到 `errors[]` 数组（在回调抛错之前已完成 push）

#### 异常测试 3：调试面板在生产模式不可用

- **Given**：`import.meta.env.DEV === false`（或 `config.enableDebugPanelInProduction === false`）
- **When**：用户按下 `Ctrl+Shift+D`
- **Then**：
  - 调试面板不打开
  - 快捷键事件不阻止浏览器默认行为（`preventDefault` 未调用）
  - `DebugPanel` 组件不被渲染（条件渲染 `{import.meta.env.DEV && <DebugPanel />}`）

#### 异常测试 4：Pyodide 加载失败的进度追踪

- **Given**：`ObservabilityCoordinator` 已初始化
- **When**：依次调用 `updatePyodideProgress(0)` → `updatePyodideProgress(50)` → `updatePyodideProgress(-1)`（加载失败）
- **Then**：
  - 最终 `debugInfo.pyodideLoadPct === -1`
  - 调试面板概览页显示"Pyodide: error"（红色）
  - 中间值（0 和 50）已被覆盖为最终值 -1

### 注意事项与禁止行为

1. **【store 写入方式】** 所有 tracker 写入 `useAppStore` 必须使用 `useAppStore.getState().updateDebugInfo(patch)`（静态方法，不触发组件重渲染），而非在 React 组件中通过 hook 的 `set` 方法。只有在调试面板组件内部读取时才使用 `useAppStore(selector)` hook（利用 Zustand 的 selector 粒度实现按需重渲染）。

2. **【初始化时序】** `ObservabilityCoordinator.init()` 必须在 `useAppStore` 创建之后调用（Zustand `create()` 返回的 store 是同步可用的）。如果在 store 创建前调用 → `getStore()` 的 try-catch 静默忽略。建议在 `App.tsx` 的顶层（组件函数体外）或 `main.tsx` 的 `ReactDOM.createRoot` 之前调用。

3. **【单例保证】** `ObservabilityCoordinator` 必须全局唯一。`observabilityCoordinator` 导出的是模块级单例（ES Module 的模块缓存保证同一 import 路径返回同一实例）。禁止在其他模块中 `new ObservabilityCoordinator()` 创建第二个实例。

4. **【FPS 不是性能唯一指标】** FPS 追踪测量的是主线程渲染帧率，不等于仿真帧率。Worker 可能以 60fps 积分但主线程因 GPU 阻塞降至 30fps。调试面板的"Worker 延迟"指标才是仿真性能的准确反映。

5. **【禁止在 Worker 内部使用 performance API 并回传】** Worker 内的 `performance.now()` 与主线程的 `performance.now()` 使用不同的时间基准。跨线程比较时间戳无意义。Worker 耗时必须在主线程侧通过 `postMessage` 前后的 `performance.mark` 差值计算。

6. **【禁止在错误回调中执行可能触发新 onerror 的同步操作】** `onError` 回调内部：
   - 禁止 `throw`
   - 禁止调用可能抛错的外部库（除非包裹 try-catch）
   - 禁止操作 DOM（DOM 操作失败会触发新的 onerror）
   - 仅允许：写入内存数组、调用 `console.error`、写入 Zustand store（已 try-catch 包裹）

7. **【调试面板性能】** 调试面板打开时，Tab 3 的性能统计计算（p50/p95/p99）涉及对 `workerLatencyMs` 排序。`workerLatencyMs` 最多 100 条，排序耗时 < 0.1ms，可以每次渲染时直接计算，不需要 useMemo 缓存。

8. **【禁止在生产构建中完全移除 FPSTracker/errorCapture】** 这些 tracker 是竞赛现场调试的必需品。仅调试面板 UI（`DebugPanel.tsx`）通过 `import.meta.env.DEV` 条件渲染控制可见性。`ObservabilityCoordinator` 和所有 tracker 在 production 中仍需运行。

9. **【易错点】** `performance.clearMarks()` 必须在 `performance.measure()` 之后调用，且两个 mark 名称必须完全匹配 `measure()` 中使用的名称。mark 名称中包含动态值（如 batchId）时，需确保 `clearMarks` 使用相同的动态名称。

10. **【易错点】** `window.onerror` 和 `window.onunhandledrejection` 是全局唯一的。如果项目中其他代码也设置了这些钩子（如第三方库），后设置的会覆盖先前的。本模块的 `initErrorCapture` 应在应用启动最早期调用，且不应被其他代码覆盖。建议在 `initErrorCapture` 中保存原有的钩子并在新钩子中调用它们（链式调用）。

11. **【偷懒红线】** `ObservabilityCoordinator.getStore()` 中使用了 `require()` 动态导入以解耦初始化顺序。实际实现时需将此改为更优雅的方案（如通过构造函数参数传入 store 引用，或使用 lazy initialization）。禁止在 `coordinator.ts` 顶部静态 `import { useAppStore } from "@/stores/useAppStore"`——这会在模块加载时创建对 Zustand store 的静态依赖，导致测试困难（Zustand store 在 vitest 中需要独立实例）。
