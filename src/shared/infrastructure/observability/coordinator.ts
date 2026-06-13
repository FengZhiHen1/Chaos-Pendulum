import { FPSTracker } from "./fps-tracker";
import { initErrorCapture } from "./error-capture";
import type { ObservabilityConfig } from "./types";

interface DebugInfo {
  fps: number;
  workerLatencyMs: number[];
  errors: string[];
  pyodideLoadPct: number;
  fpsHistory: number[];
}

export class ObservabilityCoordinator {
  readonly fpsTracker: FPSTracker;
  private config: Required<ObservabilityConfig>;
  private fpsStoreTimer = 0;
  private fpsHistory: number[] = [];
  private workerLatencyBuffer: number[] = [];
  private latencyCounter = 0;
  private initialized = false;
  private updateDebugInfo?: (patch: Partial<DebugInfo>) => void;
  private onErrorCallback?: (errors: string[]) => void;
  private rafId = 0;

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

  /** 应用启动时调用一次。初始化所有 tracker 并绑定到 store。 */
  init(
    updateDebugInfo: (patch: Partial<DebugInfo>) => void,
    onError?: (errors: string[]) => void,
  ): void {
    if (this.initialized) return;
    this.initialized = true;
    this.updateDebugInfo = updateDebugInfo;
    this.onErrorCallback = onError;

    // 1. 全局错误捕获 → Zustand + SYS-02
    initErrorCapture((errors) => {
      try {
        this.updateDebugInfo?.({ errors });
      } catch { /* 防止回调本身抛错导致无限循环 */ }
      try {
        this.onErrorCallback?.(errors);
      } catch { /* 防止回调本身抛错导致无限循环 */ }
    });

    // 2. 启动 FPS 追踪循环
    const loop = (now: number) => {
      this.fpsTracker.tick(now);
      if (now - this.fpsStoreTimer >= this.config.fpsStoreThrottleMs) {
        this.fpsStoreTimer = now;
        const avg = Math.round(this.fpsTracker.average * 10) / 10;
        this.fpsHistory.push(avg);
        if (this.fpsHistory.length > 10) this.fpsHistory.shift();
        try {
          this.updateDebugInfo?.({
            fps: avg,
            fpsHistory: [...this.fpsHistory],
          });
        } catch { /* store 未就绪时静默忽略 */ }
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
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
        this.updateDebugInfo?.({
          workerLatencyMs: [...this.workerLatencyBuffer].reverse(),
        });
      } catch { /* 静默 */ }
    }
  }

  /** 更新 Pyodide 加载进度。在 usePyodide hook 中调用。 */
  updatePyodideProgress(pct: number): void {
    try {
      this.updateDebugInfo?.({ pyodideLoadPct: pct });
    } catch { /* 静默 */ }
  }

  /** 重置所有 tracker（模式切换时不需要，仅页面重新初始化时调用） */
  reset(): void {
    this.fpsTracker.reset();
    this.workerLatencyBuffer = [];
    this.latencyCounter = 0;
    this.fpsHistory = [];
  }

  /** 销毁 rAF 循环并允许重新 init（用于测试或页面卸载） */
  dispose(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.initialized = false;
  }
}

/** 全局单例。应用启动时由 SYS-04 或 App.tsx 创建并 init() */
export const observabilityCoordinator = new ObservabilityCoordinator();
