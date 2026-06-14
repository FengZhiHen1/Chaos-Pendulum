/**
 * useDemoModeViewModel — 演示模式（大屏纯净视图）的跨介质 UI 状态管理。
 *
 * 封装 DemoModeManagerImpl，管理激活/退出/空闲检测/水印可见性等 UI 状态。
 *
 * 依赖方向:
 *   - 可以依赖: ../../application/useCases/、../../contracts/
 *   - 禁止依赖: ../../view/
 *   - 被依赖方: ../../view/components/DemoModeIndicator
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { DemoModeManagerImpl } from "../../application/useCases/DemoModeManagerImpl";
import { globalOrbitControlsAdapter } from "../../infrastructure/adapters/orbitControlsAdapterSingleton";
import { globalWatermarkRenderer } from "../../infrastructure/adapters/watermarkRendererSingleton";
import { UIVisibilityControllerImpl } from "../../infrastructure/adapters/UIVisibilityControllerImpl";
import { DEFAULT_DEMO_CONFIG } from "../../contracts";
import type { DemoModeConfig } from "../../contracts";

// ─── Hook 参数 ─────────────────────────────────────

export interface UseDemoModeViewModelOptions {
  /** 演示模式配置（默认使用 DEFAULT_DEMO_CONFIG） */
  config?: DemoModeConfig;
}

// ─── Hook 返回类型 ─────────────────────────────────

export interface DemoModeViewModelState {
  /** 演示模式是否激活 */
  isActive: boolean;
  /** 空闲检测是否已启动 */
  isIdleDetectionActive: boolean;
  /** 是否正在过渡（激活/退出动画中） */
  isTransitioning: boolean;
  /** 最近一次错误 */
  error: Error | null;
}

export interface DemoModeViewModelActions {
  /** 手动激活演示模式 */
  activate: () => Promise<void>;
  /** 手动退出演示模式 */
  deactivate: () => Promise<void>;
  /** 启动空闲超时检测 */
  startIdleDetection: () => Promise<void>;
  /** 停止空闲超时检测 */
  stopIdleDetection: () => void;
  /** 清除错误 */
  clearError: () => void;
}

export type DemoModeViewModel = DemoModeViewModelState & DemoModeViewModelActions;

export function useDemoModeViewModel(
  options: UseDemoModeViewModelOptions = {},
): DemoModeViewModel {
  const config = options.config ?? DEFAULT_DEMO_CONFIG;

  // 适配器实例用 ref 持有——不触发重渲染
  const managerRef = useRef<DemoModeManagerImpl | null>(null);

  const [isActive, setIsActive] = useState(false);
  const [isIdleDetectionActive, setIsIdleDetectionActive] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // 初始化 Manager（依赖注入）
  // 使用全局单例适配器，以便 explore/Scene3D 在运行时注入 Three.js OrbitControls 与舞台容器。
  useEffect(() => {
    const uiController = new UIVisibilityControllerImpl();
    managerRef.current = new DemoModeManagerImpl(
      globalOrbitControlsAdapter,
      globalWatermarkRenderer,
      uiController,
      config,
    );
    return () => {
      managerRef.current?.stopIdleDetection();
    };
  }, [config]);

  const clearError = useCallback(() => setError(null), []);

  const activate = useCallback(async () => {
    setIsTransitioning(true);
    setError(null);
    try {
      await managerRef.current!.activate();
      setIsActive(true);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsTransitioning(false);
    }
  }, []);

  const deactivate = useCallback(async () => {
    setIsTransitioning(true);
    setError(null);
    try {
      await managerRef.current!.deactivate();
      setIsActive(false);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsTransitioning(false);
    }
  }, []);

  const startIdleDetection = useCallback(async () => {
    setError(null);
    try {
      await managerRef.current!.startIdleDetection();
      setIsIdleDetectionActive(true);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, []);

  const stopIdleDetection = useCallback(() => {
    managerRef.current?.stopIdleDetection();
    setIsIdleDetectionActive(false);
  }, []);

  return {
    isActive,
    isIdleDetectionActive,
    isTransitioning,
    error,
    activate,
    deactivate,
    startIdleDetection,
    stopIdleDetection,
    clearError,
  };
}
