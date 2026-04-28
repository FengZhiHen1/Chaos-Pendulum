import { useLayoutEffect, useState, useCallback, useRef } from "react";
import { useAppStore } from "@/stores/useAppStore";
import { observabilityCoordinator } from "@/shared/lib/observability";
import { initErrorCapture } from "@/shared/lib/observability";
import { handleGlobalErrors } from "@/features/system/error-handling";
import { getScheduler } from "@/features/simulation/worker/scheduler";
import { createOdeWorker } from "./create-ode-worker";
import { prefetchPrecomputeData } from "./precompute-prefetch";
import {
  cleanupStalePyodideCache,
  checkLocalPyodideFile,
  getCachedPyodide,
  validatePyodideCache,
  downloadPyodideResource,
  cachePyodideResource,
  buildPyodideCdnUrl,
} from "./pyodide-cache";
import { LoadingScreen } from "./LoadingScreen";
import { ErrorScreen } from "./ErrorScreen";
import type { BootConfig, BootProgress, BootPhase, BootError } from "./types";
import {
  BOOT_PHASE_WEIGHTS,
  DEFAULT_BOOT_PROGRESS,
  PYODIDE_VERSION,
} from "./types";

interface BootManagerProps {
  config?: BootConfig;
  children: React.ReactNode;
}

function computeOverallProgress(phase: BootPhase, phaseProgress: number): number {
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

const DEFAULT_CONFIG: Required<BootConfig> = {
  enablePyodide: true,
  enablePrecomputePrefetch: true,
  showQuotes: true,
  pyodideLoadStrategy: "lazy",
  workerTimeoutMs: 3000,
  transitionDurationMs: 600,
};

export function BootManager({ config = {}, children }: BootManagerProps) {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const [bootProgress, setBootProgress] = useState<BootProgress>(DEFAULT_BOOT_PROGRESS);
  const [error, setError] = useState<BootError | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [showChildren, setShowChildren] = useState(false);
  const bootingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const workerTimeoutRef = useRef(mergedConfig.workerTimeoutMs);

  const updateProgress = useCallback(
    (patch: Partial<BootProgress>) => {
      setBootProgress((prev) => {
        const next = { ...prev, ...patch };
        next.overallProgress = computeOverallProgress(next.phase, next.phaseProgress);
        return next;
      });
    },
    [],
  );

  const setLoadingState = useCallback((state: "loading" | "ready" | "error") => {
    useAppStore.getState().setLoadingState(state);
  }, []);

  const finalizeReady = useCallback(() => {
    // 启动可观测性（FPS 追踪等）+ SYS-02 错误桥接
    try {
      observabilityCoordinator.init(
        (patch) => useAppStore.getState().updateDebugInfo(patch),
        (errors) => handleGlobalErrors(errors),
      );
    } catch (e) {
      console.error("[BootManager] observabilityCoordinator.init() 失败", e);
    }

    // 移除全局 loading class
    document.documentElement.classList.remove("app-loading");

    // 触发出场过渡动画
    setTransitioning(true);
    setTimeout(() => {
      setShowChildren(true);
      setLoadingState("ready");
    }, 200);
  }, [setLoadingState]);

  const handleError = useCallback(
    (type: BootError["type"], message: string, retryable = true) => {
      setError({ type, message, retryable });
      setLoadingState("error");
      document.documentElement.classList.remove("app-loading");
    },
    [setLoadingState],
  );

  const handleRetry = useCallback(() => {
    setError(null);
    setBootProgress(DEFAULT_BOOT_PROGRESS);
    setTransitioning(false);
    setShowChildren(false);
    workerTimeoutRef.current *= 2; // 首次超时后翻倍
    bootingRef.current = false;
    // 短暂延迟后重新开始
    setTimeout(() => startBoot(), 100);
  }, []);

  const handleOffline = useCallback(() => {
    setError(null);
    // 跳过 Pyodide，直接进入 ready
    finalizeReady();
  }, [finalizeReady]);

  const startBoot = useCallback(async () => {
    if (bootingRef.current) return;
    bootingRef.current = true;
    setLoadingState("loading");
    document.documentElement.classList.add("app-loading");

    // 阶段 1：mounting（已发生，快速推进）
    updateProgress({ phase: "mounting", phaseProgress: 1, description: "初始化中..." });

    // ── 并行任务 ──
    const tasks: Promise<void>[] = [];

    // 任务 A：Worker 初始化（关键任务）
    tasks.push(
      (async () => {
        updateProgress({ phase: "worker_init", phaseProgress: 0, description: "加载仿真引擎..." });
        try {
          const worker = await createOdeWorker(workerTimeoutRef.current);
          // 将 Worker 注入调度器
          getScheduler().injectWorker(worker);
          updateProgress({ phase: "worker_init", phaseProgress: 1, description: "仿真引擎就绪" });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "仿真引擎初始化失败";
          handleError("worker", msg, true);
          throw err; // 让 Promise.all 失败
        }
      })(),
    );

    // 任务 B：Pyodide 加载
    if (mergedConfig.enablePyodide) {
      tasks.push(
        (async () => {
          // 清理过期临时缓存
          try {
            await cleanupStalePyodideCache();
          } catch { /* 静默 */ }

          const coreKey = `pyodide-core-${PYODIDE_VERSION}`;

          // 1. 检查本地文件
          updateProgress({ phase: "pyodide_local_check", phaseProgress: 0, description: "检查本地资源..." });
          const localAvailable = await checkLocalPyodideFile("/pyodide/pyodide.js");
          updateProgress({ phase: "pyodide_local_check", phaseProgress: 1 });

          if (localAvailable) {
            // 本地可用 → 直接进入初始化阶段（简化处理）
            updateProgress({ phase: "pyodide_initializing", phaseProgress: 0.5, description: "初始化 Python 运行时..." });
            // 注：实际从本地加载 pyodide 需要更多代码，这里标记进度
            updateProgress({ phase: "pyodide_initializing", phaseProgress: 1, description: "Python 运行时就绪" });
            return;
          }

          // 2. 检查 IndexedDB 缓存
          updateProgress({ phase: "pyodide_indexeddb_check", phaseProgress: 0, description: "检查缓存..." });
          const cached = await getCachedPyodide(coreKey);
          updateProgress({ phase: "pyodide_indexeddb_check", phaseProgress: 1 });

          if (cached) {
            const valid = await validatePyodideCache(cached);
            if (valid) {
              updateProgress({ phase: "pyodide_initializing", phaseProgress: 0.5, description: "从缓存初始化 Python 运行时..." });
              updateProgress({ phase: "pyodide_initializing", phaseProgress: 1, description: "Python 运行时就绪" });
              return;
            }
          }

          // 3. CDN 下载
          if (!navigator.onLine) {
            // 完全离线且无缓存
            if (mergedConfig.pyodideLoadStrategy === "eager") {
              handleError("pyodide", "无法加载 Python 运行时：当前离线且无本地缓存。", true);
              throw new Error("Pyodide offline no cache");
            }
            // lazy 模式静默跳过
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
                const phaseProgress = total > 0 ? downloaded / total : 0;
                const eta = computeEta(downloaded, total, downloadStart);
                updateProgress({
                  phase: "pyodide_downloading",
                  phaseProgress,
                  downloadedBytes: downloaded,
                  totalBytes: total,
                  etaSeconds: eta,
                  description: `正在下载 Python 运行时 (${formatBytes(downloaded)}/${formatBytes(total)})`,
                });
                // 同步更新 debugInfo
                observabilityCoordinator.updatePyodideProgress(phaseProgress);
              },
              signal,
            );

            // 写入缓存
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
            updateProgress({
              phase: "pyodide_initializing",
              phaseProgress: 1,
              description: "Python 运行时就绪",
            });
            observabilityCoordinator.updatePyodideProgress(1);
          } catch (err) {
            if ((err as Error).name === "AbortError") {
              // 用户主动跳过
              updateProgress({ phase: "pyodide_downloading", phaseProgress: 0, description: "已跳过 Python 运行时下载" });
              return;
            }
            if (mergedConfig.pyodideLoadStrategy === "eager") {
              handleError("pyodide", `Python 运行时下载失败: ${(err as Error).message}`, true);
              throw err;
            }
            // lazy 模式静默失败
            observabilityCoordinator.updatePyodideProgress(-1);
          }
        })(),
      );
    }

    // 任务 C：预计算数据后台预取（非阻塞，不加入关键路径）
    if (mergedConfig.enablePrecomputePrefetch) {
      updateProgress({ phase: "precompute_fetching", phaseProgress: 0, description: "预加载分析数据..." });
      prefetchPrecomputeData().finally(() => {
        updateProgress({ phase: "precompute_fetching", phaseProgress: 1 });
      });
    }

    // ── 等待关键任务 ──
    try {
      await Promise.all(tasks);
      updateProgress({ phase: "finalizing", phaseProgress: 1, description: "准备就绪..." });
      finalizeReady();
    } catch {
      // 错误已在各任务中通过 handleError 处理
    }
  }, [mergedConfig, updateProgress, handleError, finalizeReady, setLoadingState]);

  // 启动流程：layout effect 确保在首次绘制前开始
  useLayoutEffect(() => {
    // 早期注册全局错误捕获（必须在任何可能抛错的异步操作之前）
    try {
      initErrorCapture((errors) => {
        try {
          useAppStore.getState().updateDebugInfo({ errors });
        } catch { /* 防止回调本身抛错导致无限循环 */ }
        try {
          handleGlobalErrors(errors);
        } catch { /* 防止回调本身抛错导致无限循环 */ }
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

  const loadingState = useAppStore((s) => s.loadingState);

  return (
    <>
      {(loadingState === "loading" || transitioning) && (
        <LoadingScreen
          progress={bootProgress}
          showQuotes={mergedConfig.showQuotes}
        />
      )}
      {loadingState === "error" && error && (
        <ErrorScreen
          error={error}
          onRetry={handleRetry}
          onOffline={handleOffline}
        />
      )}
      {showChildren && children}
    </>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
