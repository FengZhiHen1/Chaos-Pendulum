/**
 * 单次 Worker 任务耗时记录。
 * 每个 time 字段使用 performance.now() 的相对时间 (ms)。
 */
export interface WorkerLatencyRecord {
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
export type PyodideLoadPhase =
  | "idle"           // 未开始加载
  | "downloading"    // 正在下载 WASM/Python stdlib
  | "initializing"   // WASM 实例化 + Python 初始化
  | "ready"          // 加载完成，可执行
  | "error";         // 加载失败

/**
 * 调试面板的 tab 页。
 */
export type DebugPanelTab = "overview" | "errors" | "performance";

/**
 * 可观测性初始化配置。
 * 由 SYS-04 应用初始化流程或 App.tsx 入口在应用启动时传入。
 */
export interface ObservabilityConfig {
  /** FPS 追踪滑动窗口大小（帧数），默认 60 */
  fpsWindowSize: number;
  /** Worker 耗时记录滑动窗口大小（条数），默认 100 */
  workerLatencyWindowSize: number;
  /** 错误日志环形缓冲区容量（条数），默认 50 */
  errorBufferSize: number;
  /** 是否在 production 中启用调试面板快捷键，默认 false */
  enableDebugPanelInProduction: boolean;
  /** FPS 写入 store 的节流间隔 (ms)，默认 1000 */
  fpsStoreThrottleMs: number;
  /** Worker 耗时写入 store 的最小任务间隔（每 N 个任务写一次 store），默认 10 */
  workerLatencyBatchSize: number;
}
