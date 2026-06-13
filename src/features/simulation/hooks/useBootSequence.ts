import { useLayoutEffect, useState, useCallback, useRef } from "react";
import { useAppStore } from "@/stores/useAppStore";
import { observabilityCoordinator } from "@/shared/lib/observability";
import { initErrorCapture } from "@/shared/lib/observability";
import { handleGlobalErrors } from "@/features/system/error-handling";
import { getScheduler } from "@/features/simulation/worker/scheduler";
import { createOdeWorker } from "@/features/simulation/worker/createOdeWorker";
import { prefetchPrecomputeData } from "@/shared/infrastructure/storage/precomputePrefetch";
import {
  cleanupStalePyodideCache,
  checkLocalPyodideFile,
  getCachedPyodide,
  validatePyodideCache,
  downloadPyodideResource,
  cachePyodideResource,
  buildPyodideCdnUrl,
} from "@/features/lab/pyodideCache";
import type { BootConfig, BootProgress, BootPhase, BootError } from "@/features/simulation/types.boot";
import {
  BOOT_PHASE_WEIGHTS,
  DEFAULT_BOOT_PROGRESS,
  PYODIDE_VERSION,
} from "@/features/simulation/types.boot";

// ─── 工具函数 ─────────────────────────────────

function computeOverallProgress(phase: BootPhase, phaseProgress: number): number {
  if (phase === "ready") return 1;
  if (phase === "idle") return 0;

  const phases: BootPhase[] = [
    "mounting",
    "worker_init",
    "pyodide_local_check",
    "pyodide_indexeddb_check",
    "pyodide_downloading",
    "pyodide_initializing",
    "precompute_fetching",
    "finalizing",
  ];
  const idx = phases.indexOf(phase);
  let sum = 0;
  for (let i = 0; i < idx; i++) {
    sum += BOOT_PHASE_WEIGHTS[phases[i]!]!;
  }
  if (idx >= 0) {
    sum += BOOT_PHASE_WEIGHTS[phase]! * Math.min(phaseProgress, 1);
  }
  return Math.min(sum, 0.999);
}

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

// ─── Hook 接口 ────────────────────────────────

const DEFAULT_CONFIG: Required<BootConfig> = {
  enablePyodide: true,
  enablePrecomputePrefetch: true,
  showQuotes: true,
  pyodideLoadStrategy: "lazy",
  workerTimeoutMs: 3000,
  transitionDurationMs: 600,
};

export interface UseBootSequenceAPI {
  bootProgress: BootProgress;
  error: BootError | null;
  transitioning: boolean;
  showChildren: boolean;
  handleRetry: () => void;
  handleOffline: () => void;
  mergedConfig: Required<BootConfig>;
}

export function useBootSequence(config: BootConfig = {}): UseBootSequenceAPI {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const [bootProgress, setBootProgress] = useState<BootProgress>(DEFAULT_BOOT_PROGRESS);
  const [error, setError] = useState<BootError | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [showChildren, setShowChildren] = useState(false);
  const bootingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const workerTimeoutRef = useRef(mergedConfig.workerTimeoutMs);
  const retryCountRef = useRef(0);

  const updateProgress = useCallback((patch: Partial<BootProgress>) => {
    setBootProgress((prev) => {
      const next = { ...prev, ...patch };
      next.overallProgress = computeOverallProgress(next.phase, next.phaseProgress);
      return next;
    });
  }, []);

  const setLoadingState = useCallback((state: "loading" | "ready" | "error") => {
    useAppStore.getState().setLoadingState(state);
  }, []);

  const finalizeReady = useCallback(() => {
    try {
      observabilityCoordinator.init(
        (patch) => useAppStore.getState().updateDebugInfo(patch),
        (errors) => handleGlobalErrors(errors),
      );
    } catch (e) {
      console.error("[BootManager] observabilityCoordinator.init() 失败", e);
    }
    document.documentElement.classList.remove("app-loading");
    updateProgress({ phase: "ready", phaseProgress: 1, description: "准备就绪" });
    setLoadingState("ready");

    // 自动触发过渡动画：LoadingScreen 淡出 → AppShell 淡入
    setTransitioning(true);
    const fadeOutDelay = 200; // LoadingScreen 淡出持续时间
    const staggerDelay = mergedConfig.transitionDurationMs; // AppShell 淡入延迟
    setTimeout(() => {
      setShowChildren(true);
    }, fadeOutDelay + staggerDelay);
  }, [setLoadingState, updateProgress, mergedConfig.transitionDurationMs]);

  const handleError = useCallback(
    (type: BootError["type"], message: string, retryable = true) => {
      setError({ type, message, retryable });
      setLoadingState("error");
      document.documentElement.classList.remove("app-loading");
    },
    [setLoadingState],
  );

  const handleRetry = useCallback(() => {
    // 设计文档：首次超时后 workerTimeoutMs *= 2；第 2 次仍超时不再重试
    if (retryCountRef.current >= 1) {
      handleError(
        "worker",
        "您的设备可能不满足性能要求，请使用桌面浏览器",
        false,
      );
      return;
    }
    setError(null);
    setBootProgress(DEFAULT_BOOT_PROGRESS);
    setTransitioning(false);
    setShowChildren(false);
    workerTimeoutRef.current *= 2;
    retryCountRef.current++;
    bootingRef.current = false;
    setTimeout(() => startBoot(), 100);
  }, [handleError]);

  const handleOffline = useCallback(() => {
    setError(null);
    finalizeReady();
  }, [finalizeReady]);

  const startBoot = useCallback(async () => {
    if (bootingRef.current) return;
    bootingRef.current = true;
    setLoadingState("loading");
    document.documentElement.classList.add("app-loading");

    updateProgress({ phase: "mounting", phaseProgress: 1, description: "初始化中..." });

    const tasks: Promise<void>[] = [];

    // 任务 A: Worker 初始化
    tasks.push(
      (async () => {
        updateProgress({ phase: "worker_init", phaseProgress: 0, description: "加载仿真引擎..." });
        try {
          const worker = await createOdeWorker(workerTimeoutRef.current);
          getScheduler().injectWorker(worker);
          updateProgress({ phase: "worker_init", phaseProgress: 1, description: "仿真引擎就绪" });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "仿真引擎初始化失败";
          handleError("worker", msg, true);
          throw err;
        }
      })(),
    );

    // 任务 B: Pyodide 加载
    if (mergedConfig.enablePyodide) {
      tasks.push(
        (async () => {
          try {
            await cleanupStalePyodideCache();
          } catch { /* silent */ }

          const coreKey = `pyodide-core-${PYODIDE_VERSION}`;

          updateProgress({ phase: "pyodide_local_check", phaseProgress: 0, description: "检查本地资源..." });
          const localAvailable = await checkLocalPyodideFile("/pyodide/pyodide.js");
          updateProgress({ phase: "pyodide_local_check", phaseProgress: 1 });

          if (localAvailable) {
            updateProgress({ phase: "pyodide_initializing", phaseProgress: 0.5, description: "初始化 Python 运行时..." });
            updateProgress({ phase: "pyodide_initializing", phaseProgress: 1, description: "Python 运行时就绪" });
            return;
          }

          updateProgress({ phase: "pyodide_indexeddb_check", phaseProgress: 0, description: "检查缓存..." });
          const cached = await getCachedPyodide(coreKey);
          updateProgress({ phase: "pyodide_indexeddb_check", phaseProgress: 1 });

          if (cached) {
            const valid = await validatePyodideCache(cached);
            if (valid) {
              updateProgress({ phase: "pyodide_initializing", phaseProgress: 0.5, description: "从缓存初始化..." });
              updateProgress({ phase: "pyodide_initializing", phaseProgress: 1, description: "Python 运行时就绪" });
              return;
            }
          }

          if (!navigator.onLine) {
            if (mergedConfig.pyodideLoadStrategy === "eager") {
              handleError("pyodide", "无法加载 Python 运行时：当前离线且无本地缓存。", true);
              throw new Error("Pyodide offline no cache");
            }
            return;
          }

          abortRef.current = new AbortController();
          const signal = abortRef.current.signal;
          const downloadStart = performance.now();

          updateProgress({
            phase: "pyodide_downloading",
            phaseProgress: 0,
            downloadedBytes: 0,
            totalBytes: 0,
            description: "正在下载 Python 运行时...",
          });

          try {
            const url = buildPyodideCdnUrl("pyodide.js");
            const buffer = await downloadPyodideResource(
              url,
              (downloaded, total) => {
                const pp = total > 0 ? downloaded / total : 0;
                const eta = computeEta(downloaded, total, downloadStart);
                updateProgress({
                  phase: "pyodide_downloading",
                  phaseProgress: pp,
                  downloadedBytes: downloaded,
                  totalBytes: total,
                  etaSeconds: eta,
                  description: `正在下载 Python 运行时 (${formatBytes(downloaded)}/${formatBytes(total)})`,
                });
                observabilityCoordinator.updatePyodideProgress(pp);
              },
              signal,
            );

            const entry = {
              resourceKey: coreKey,
              data: buffer,
              size: buffer.byteLength,
              cachedAt: new Date().toISOString(),
              version: PYODIDE_VERSION,
              mimeType: "application/javascript",
            };
            await cachePyodideResource(entry);

            updateProgress({ phase: "pyodide_downloading", phaseProgress: 1 });
            updateProgress({ phase: "pyodide_initializing", phaseProgress: 1, description: "Python 运行时就绪" });
            observabilityCoordinator.updatePyodideProgress(1);
          } catch (err) {
            if ((err as Error).name === "AbortError") {
              updateProgress({ phase: "pyodide_downloading", phaseProgress: 0, description: "已跳过 Python 运行时下载" });
              return;
            }
            if (mergedConfig.pyodideLoadStrategy === "eager") {
              handleError("pyodide", `Python 运行时下载失败: ${(err as Error).message}`, true);
              throw err;
            }
            observabilityCoordinator.updatePyodideProgress(-1);
          }
        })(),
      );
    }

    // 任务 C: 预计算数据预取（非关键路径）
    if (mergedConfig.enablePrecomputePrefetch) {
      updateProgress({ phase: "precompute_fetching", phaseProgress: 0, description: "预加载分析数据..." });
      prefetchPrecomputeData().finally(() => {
        updateProgress({ phase: "precompute_fetching", phaseProgress: 1 });
      });
    }

    try {
      await Promise.all(tasks);
      updateProgress({ phase: "finalizing", phaseProgress: 1, description: "准备就绪..." });
      finalizeReady();
    } catch {
      // 每个任务各自处理错误
    }
  }, [mergedConfig, updateProgress, handleError, finalizeReady, setLoadingState]);

  // ── 启动与全局错误捕获 ──
  useLayoutEffect(() => {
    try {
      initErrorCapture((errors) => {
        try {
          useAppStore.getState().updateDebugInfo({ errors });
        } catch { /* prevent infinite loop */ }
        try {
          handleGlobalErrors(errors);
        } catch { /* prevent infinite loop */ }
      });
    } catch (e) {
      console.error("[BootManager] initErrorCapture 失败", e);
    }

    startBoot();

    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [startBoot]);

  return {
    bootProgress,
    error,
    transitioning,
    showChildren,
    handleRetry,
    handleOffline,
    mergedConfig,
  };
}
