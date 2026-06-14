/**
 * useBootSequence — 启动序列 ViewModel Hook。
 *
 * 薄包装：创建适配器 + UseCase 实例，管理 React UI 状态，委托所有编排给 UseCase。
 * 依赖方向: 可以依赖 application/useCases/, infrastructure/adapters/（组合根职责）
 */
import { useLayoutEffect, useState, useCallback, useRef } from "react";
import { useAppStore } from "@/stores/useAppStore";
import { BootSequenceUseCase } from "../../application/useCases/BootSequenceUseCase";
import {
  WorkerFactoryAdapter,
  SchedulerProviderAdapter,
  PyodideBootstrapAdapter,
  PrecomputeBootstrapAdapter,
  ObservabilityBootstrapAdapter,
  ErrorHandlerAdapter,
} from "../../infrastructure/adapters";
import type { BootConfig, BootProgress, BootError } from "../../types.boot";
import { DEFAULT_BOOT_PROGRESS } from "../../types.boot";

// ─── 模块级单例适配器 ──────────────────

const deps = {
  workerFactory: new WorkerFactoryAdapter(),
  schedulerProvider: new SchedulerProviderAdapter(),
  pyodide: new PyodideBootstrapAdapter(),
  precompute: new PrecomputeBootstrapAdapter(),
  observability: new ObservabilityBootstrapAdapter(),
  errorHandler: new ErrorHandlerAdapter(),
};

const DEFAULT_CONFIG: Required<BootConfig> = {
  enablePyodide: true,
  enablePrecomputePrefetch: true,
  showQuotes: true,
  pyodideLoadStrategy: "lazy",
  workerTimeoutMs: 3000,
  transitionDurationMs: 600,
};

// ─── Hook ─────────────────────────────

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
  const retryCountRef = useRef(0);
  const useCaseRef = useRef(new BootSequenceUseCase(deps, mergedConfig.workerTimeoutMs));

  const updateProgress = useCallback((patch: Partial<BootProgress>) => {
    setBootProgress((prev) => {
      const next: BootProgress = { ...prev, ...patch } as BootProgress;
      // overallProgress is computed in the original tool function; approximate here
      return next;
    });
  }, []);

  const setLoadingState = useCallback((state: "loading" | "ready" | "error") => {
    useAppStore.getState().setLoadingState(state);
  }, []);

  const finalizeReady = useCallback(() => {
    try {
      deps.observability.init(
        (patch) => useAppStore.getState().updateDebugInfo(patch),
        (errors) => deps.errorHandler.handleErrors(errors),
      );
    } catch (e) {
      console.error("[BootManager] observability init 失败", e);
    }
    document.documentElement.classList.remove("app-loading");
    updateProgress({ phase: "ready", phaseProgress: 1, description: "准备就绪" });
    setLoadingState("ready");

    setTransitioning(true);
    const fadeOutDelay = 200;
    const staggerDelay = mergedConfig.transitionDurationMs;
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
    if (retryCountRef.current >= 1) {
      handleError("worker", "您的设备可能不满足性能要求，请使用桌面浏览器", false);
      return;
    }
    setError(null);
    setBootProgress(DEFAULT_BOOT_PROGRESS);
    setTransitioning(false);
    setShowChildren(false);
    retryCountRef.current++;
    bootingRef.current = false;
    useCaseRef.current.increaseTimeout();
    useCaseRef.current = new BootSequenceUseCase(deps, useCaseRef.current["timeoutMs"] ?? mergedConfig.workerTimeoutMs * 2);
    setTimeout(() => startBoot(), 100);
  }, [handleError, mergedConfig]);

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

    try {
      await useCaseRef.current.execute(mergedConfig, updateProgress);
      finalizeReady();
    } catch {
      // 每个任务各自处理错误
    }
  }, [mergedConfig, updateProgress, finalizeReady, setLoadingState]);

  useLayoutEffect(() => {
    try {
      deps.errorHandler.init((errors) => {
        try {
          useAppStore.getState().updateDebugInfo({ errors });
        } catch { /* prevent infinite loop */ }
        try {
          deps.errorHandler.handleErrors(errors);
        } catch { /* prevent infinite loop */ }
      });
    } catch (e) {
      console.error("[BootManager] initErrorCapture 失败", e);
    }

    startBoot();

    return () => {
      useCaseRef.current.abort();
    };
  }, [startBoot]);

  return { bootProgress, error, transitioning, showChildren, handleRetry, handleOffline, mergedConfig };
}
