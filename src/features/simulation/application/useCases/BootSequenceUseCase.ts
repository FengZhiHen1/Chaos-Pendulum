/**
 * BootSequenceUseCase — 启动序列编排用例。
 *
 * 纯编排逻辑，零 React import。所有外部依赖通过 IBootDependencies 注入。
 */
import type { IBootDependencies, BootResult } from "../../contracts/boot-dependencies.contract";
import { IBootSequenceOrchestrator } from "../../contracts/boot-dependencies.contract";
import type { BootConfig, BootProgress } from "../../types.boot";
import { PYODIDE_VERSION } from "../../types.boot";

// ─── 工具函数 ─────────────────────────────────

function computeEta(downloaded: number, total: number, startTime: number): number {
  if (total <= 0 || downloaded <= 0) return -1;
  const elapsed = (performance.now() - startTime) / 1000;
  const speed = downloaded / elapsed;
  if (speed <= 0) return -1;
  return (total - downloaded) / speed;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// ─── UseCase ──────────────────────────────────

export class BootSequenceUseCase extends IBootSequenceOrchestrator {
  private abortController: AbortController | null = null;
  private timeoutMs: number;

  constructor(deps: IBootDependencies, initialTimeoutMs = 3000) {
    super(deps);
    this.timeoutMs = initialTimeoutMs;
  }

  /** 重试时调用，递增超时 */
  increaseTimeout(): void {
    this.timeoutMs *= 2;
  }

  async execute(
    config: Required<BootConfig>,
    onProgress: (patch: Partial<BootProgress>) => void,
    signal?: AbortSignal,
  ): Promise<BootResult> {
    const tasks: Promise<void>[] = [];

    // 任务 A: Worker 初始化
    tasks.push(this.initWorker(onProgress));

    // 任务 B: Pyodide 加载
    if (config.enablePyodide) {
      tasks.push(this.initPyodide(config, onProgress, signal));
    }

    // 任务 C: 预计算数据预取（非关键路径）
    if (config.enablePrecomputePrefetch) {
      this.initPrecompute(onProgress);
    }

    try {
      await Promise.all(tasks);
      onProgress({ phase: "finalizing", phaseProgress: 1 });
      return { success: true, phase: "finalizing" };
    } catch {
      return { success: false, phase: "worker_init" };
    }
  }

  private async initWorker(onProgress: (patch: Partial<BootProgress>) => void): Promise<void> {
    onProgress({ phase: "worker_init", phaseProgress: 0 });
    const worker = await this.deps.workerFactory.create(this.timeoutMs);
    this.deps.schedulerProvider.get().injectWorker(worker);
    onProgress({ phase: "worker_init", phaseProgress: 1 });
  }

  private async initPyodide(
    config: Required<BootConfig>,
    onProgress: (patch: Partial<BootProgress>) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    try {
      await this.deps.pyodide.cleanupStale();
    } catch { /* silent */ }

    const coreKey = `pyodide-core-${PYODIDE_VERSION}`;

    onProgress({ phase: "pyodide_local_check", phaseProgress: 0 });
    const localAvailable = await this.deps.pyodide.checkLocalFile("/pyodide/pyodide.js");
    onProgress({ phase: "pyodide_local_check", phaseProgress: 1 });

    if (localAvailable) {
      onProgress({ phase: "pyodide_initializing", phaseProgress: 1 });
      return;
    }

    onProgress({ phase: "pyodide_indexeddb_check", phaseProgress: 0 });
    const cached = await this.deps.pyodide.getCached(coreKey);
    onProgress({ phase: "pyodide_indexeddb_check", phaseProgress: 1 });

    if (cached) {
      const valid = await this.deps.pyodide.validateCache(cached);
      if (valid) {
        onProgress({ phase: "pyodide_initializing", phaseProgress: 1 });
        return;
      }
    }

    if (!navigator.onLine) {
      if (config.pyodideLoadStrategy === "eager") {
        throw new Error("Pyodide offline no cache");
      }
      return;
    }

    this.abortController = new AbortController();
    const combinedSignal = signal ?? this.abortController.signal;
    const downloadStart = performance.now();

    onProgress({ phase: "pyodide_downloading", phaseProgress: 0, downloadedBytes: 0, totalBytes: 0 });

    try {
      const url = this.deps.pyodide.buildCdnUrl("pyodide.js");
      const buffer = await this.deps.pyodide.download(
        url,
        (downloaded, total) => {
          const pp = total > 0 ? downloaded / total : 0;
          const eta = computeEta(downloaded, total, downloadStart);
          onProgress({
            phase: "pyodide_downloading",
            phaseProgress: pp,
            downloadedBytes: downloaded,
            totalBytes: total,
            etaSeconds: eta,
            description: `正在下载 Python 运行时 (${formatBytes(downloaded)}/${formatBytes(total)})`,
          });
          this.deps.observability.updatePyodideProgress(pp);
        },
        combinedSignal,
      );

      await this.deps.pyodide.cache({
        resourceKey: coreKey,
        data: buffer,
        size: buffer.byteLength,
        cachedAt: new Date().toISOString(),
        version: PYODIDE_VERSION,
        mimeType: "application/javascript",
      });

      onProgress({ phase: "pyodide_downloading", phaseProgress: 1 });
      onProgress({ phase: "pyodide_initializing", phaseProgress: 1 });
      this.deps.observability.updatePyodideProgress(1);
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        onProgress({ phase: "pyodide_downloading", phaseProgress: 0 });
        return;
      }
      if (config.pyodideLoadStrategy === "eager") {
        throw err;
      }
      this.deps.observability.updatePyodideProgress(-1);
    }
  }

  private initPrecompute(onProgress: (patch: Partial<BootProgress>) => void): void {
    onProgress({ phase: "precompute_fetching", phaseProgress: 0 });
    this.deps.precompute.prefetch().finally(() => {
      onProgress({ phase: "precompute_fetching", phaseProgress: 1 });
    });
  }

  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }
}
