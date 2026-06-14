/**
 * useHistoryPlaybackViewModel — 历史回放与分叉的跨介质 UI 状态管理。
 *
 * 封装 HistoryPlaybackUseCaseImpl / ForkSimulationUseCaseImpl，
 * 管理时间轴位置、回放状态、分叉活跃性、幽灵尾迹等 UI 状态。
 *
 * 依赖方向:
 *   - 可以依赖: ../../application/useCases/、../../contracts/
 *   - 禁止依赖: ../../view/
 *   - 被依赖方: ../../view/components/HistoryTimeline
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { HistoryPlaybackUseCaseImpl } from "../../application/useCases/HistoryPlaybackUseCaseImpl";
import { ForkSimulationUseCaseImpl } from "../../application/useCases/ForkSimulationUseCaseImpl";
import type { PlaybackState, ForkConfig, GhostTrailConfig } from "../../contracts";
import { ForkError } from "../../contracts";

// ─── Hook 参数 ─────────────────────────────────────

export interface UseHistoryPlaybackViewModelOptions {
  /** RingBuffer 实例——由调用方注入（来自仿真引擎）。null = 尚未就绪 */
  ringBuffer?: {
    at(index: number): { theta1: number; omega1: number; theta2: number; omega2: number } | undefined;
    latest(): { theta1: number; omega1: number; theta2: number; omega2: number } | undefined;
    length: number;
    capacity: number;
    toArray(): { theta1: number; omega1: number; theta2: number; omega2: number }[];
    findIndexByTime(time: number): number;
  } | null;
  /** 分叉 Worker 创建回调 */
  onForkWorkerCreate?: (forkConfig: ForkConfig) => void;
}

// ─── Hook 返回类型 ─────────────────────────────────

export interface HistoryPlaybackViewModelState {
  /** 回放状态 */
  playback: PlaybackState | null;
  /** 是否在回放中（已 seek 到非实时位置） */
  isSeeking: boolean;
  /** 分叉是否活跃 */
  isForkActive: boolean;
  /** 幽灵尾迹配置（null = 无活跃分叉） */
  ghostTrail: GhostTrailConfig | null;
  /** 是否正在执行操作 */
  isLoading: boolean;
  /** 最近一次错误 */
  error: Error | null;
}

export interface HistoryPlaybackViewModelActions {
  /** 跳转到指定仿真时间 */
  seekTo: (time: number) => Promise<void>;
  /** 步进（正=前进，负=后退） */
  step: (offsetSeconds: number) => Promise<void>;
  /** 跳转到最新帧 */
  goToLatest: () => Promise<void>;
  /** 从当前回放位置分叉 */
  fork: (modifiedParams: Record<string, number>) => Promise<void>;
  /** 取消分叉 */
  cancelFork: () => Promise<void>;
  /** 清除错误 */
  clearError: () => void;
}

export type HistoryPlaybackViewModel = HistoryPlaybackViewModelState & HistoryPlaybackViewModelActions;

export function useHistoryPlaybackViewModel(
  options: UseHistoryPlaybackViewModelOptions = {},
): HistoryPlaybackViewModel {
  const { ringBuffer, onForkWorkerCreate } = options;

  const playbackRef = useRef<HistoryPlaybackUseCaseImpl | null>(null);
  const forkRef = useRef<ForkSimulationUseCaseImpl | null>(null);

  const [playback, setPlayback] = useState<PlaybackState | null>(null);
  const [isSeeking, setIsSeeking] = useState(false);
  const [isForkActive, setIsForkActive] = useState(false);
  const [ghostTrail, setGhostTrail] = useState<GhostTrailConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // 当 RingBuffer 就绪时初始化 UseCase
  useEffect(() => {
    if (ringBuffer) {
      playbackRef.current = new HistoryPlaybackUseCaseImpl(ringBuffer);
      forkRef.current = new ForkSimulationUseCaseImpl(ringBuffer);
    }
  }, [ringBuffer]);

  const clearError = useCallback(() => setError(null), []);

  const seekTo = useCallback(async (time: number) => {
    if (!playbackRef.current) return;
    setIsLoading(true);
    setError(null);
    try {
      const state = await playbackRef.current.seekTo(time);
      setPlayback(state);
      setIsSeeking(true);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const step = useCallback(async (offsetSeconds: number) => {
    if (!playbackRef.current) return;
    setIsLoading(true);
    setError(null);
    try {
      const state = await playbackRef.current.step(offsetSeconds);
      setPlayback(state);
      setIsSeeking(true);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const goToLatest = useCallback(async () => {
    if (!playbackRef.current) return;
    setIsLoading(true);
    setError(null);
    try {
      const state = await playbackRef.current.goToLatest();
      setPlayback(state);
      setIsSeeking(false);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fork = useCallback(async (modifiedParams: Record<string, number>) => {
    if (!forkRef.current || !ringBuffer) return;
    const latest = ringBuffer.latest();
    if (!latest) {
      setError(new ForkError("FORK_INIT_FAILED", "RingBuffer 为空", "useHistoryPlaybackViewModel.fork()", -1));
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const forkConfig: ForkConfig = {
        forkTime: playback?.currentTime ?? 0,
        initialState: latest,
        modifiedParams,
      };
      const ghost = await forkRef.current.execute(forkConfig);
      setGhostTrail(ghost);
      setIsForkActive(true);
      onForkWorkerCreate?.(forkConfig);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [ringBuffer, playback, onForkWorkerCreate]);

  const cancelFork = useCallback(async () => {
    if (!forkRef.current) return;
    setIsLoading(true);
    setError(null);
    try {
      await forkRef.current.cancel();
      setIsForkActive(false);
      setGhostTrail(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    playback,
    isSeeking,
    isForkActive,
    ghostTrail,
    isLoading,
    error,
    seekTo,
    step,
    goToLatest,
    fork,
    cancelFork,
    clearError,
  };
}
