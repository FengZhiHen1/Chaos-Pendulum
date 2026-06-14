/**
 * 启动序列依赖端口 — BootSequenceUseCase 的构造注入端口。
 *
 * 所有接口由 simulation/infrastructure/adapters/ 实现。
 */
import type { BootPhase, BootProgress, BootConfig } from "../types.boot";

// ─── 端口接口 ─────────────────────────────

/** Worker 工厂 — 创建 ODE Web Worker */
export interface IWorkerFactory {
  create(timeoutMs: number): Promise<Worker>;
}

/** Scheduler 单例 — 获取/释放仿真调度器 */
export interface ISchedulerProvider {
  get(): { injectWorker(worker: Worker): void };
}

/** Pyodide 启动 — 管理 Python 运行时生命周期 */
export interface IPyodideBootstrap {
  cleanupStale(): Promise<void>;
  checkLocalFile(path: string): Promise<boolean>;
  getCached(key: string): Promise<{ data: ArrayBuffer; size: number; version: string; resourceKey: string; cachedAt: string; mimeType: string } | undefined>;
  validateCache(entry: { data: ArrayBuffer; version: string; resourceKey?: string; size?: number; cachedAt?: string; mimeType?: string }): Promise<boolean>;
  buildCdnUrl(filename: string): string;
  download(
    url: string,
    onProgress: (downloaded: number, total: number) => void,
    signal?: AbortSignal,
  ): Promise<ArrayBuffer>;
  cache(entry: {
    resourceKey: string;
    data: ArrayBuffer;
    size: number;
    cachedAt: string;
    version: string;
    mimeType: string;
  }): Promise<void>;
}

/** 预计算启动 — 预取分析数据 */
export interface IPrecomputeBootstrap {
  prefetch(): Promise<void>;
}

/** 可观测性启动 — 初始化性能监控 */
export interface IObservabilityBootstrap {
  init(
    onDebugUpdate: (patch: Record<string, unknown>) => void,
    onError: (errors: string[]) => void,
  ): void;
  updatePyodideProgress(ratio: number): void;
}

/** 全局错误处理 */
export interface IErrorHandler {
  init(captureCallback: (errors: string[]) => void): void;
  handleErrors(errors: string[]): void;
}

/** 聚合的启动依赖 */
export interface IBootDependencies {
  workerFactory: IWorkerFactory;
  schedulerProvider: ISchedulerProvider;
  pyodide: IPyodideBootstrap;
  precompute: IPrecomputeBootstrap;
  observability: IObservabilityBootstrap;
  errorHandler: IErrorHandler;
}

// ─── BootSequenceUseCase 接口 ─────────────

export interface BootResult {
  success: boolean;
  phase: BootPhase;
}

export abstract class IBootSequenceOrchestrator {
  protected readonly deps: IBootDependencies;

  constructor(deps: IBootDependencies) {
    this.deps = deps;
  }

  abstract execute(
    config: Required<BootConfig>,
    onProgress: (progress: Partial<BootProgress>) => void,
    signal?: AbortSignal,
  ): Promise<BootResult>;
}
