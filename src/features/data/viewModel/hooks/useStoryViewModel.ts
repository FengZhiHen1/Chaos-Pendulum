/**
 * useStoryViewModel — 故事脚本播放的跨介质 UI 状态管理。
 *
 * 封装 StoryScriptEngineImpl，管理播放状态/字幕/阶段/进度等 UI 展示。
 *
 * 依赖方向:
 *   - 可以依赖: ../../application/useCases/、../../contracts/、../../application/repositories/
 *   - 禁止依赖: ../../view/
 *   - 被依赖方: ../../view/pages/StoryPage、../../view/components/StoryPlayer
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { StoryScriptEngineImpl } from "../../application/useCases/StoryScriptEngineImpl";
import { storyScriptRepository } from "../../application/repositories/StoryScriptRepository";
import type { StoryPlaybackState } from "../../contracts";

// ─── 单例 UseCase 实例 ─────────────────────────────

const storyEngine = new StoryScriptEngineImpl(storyScriptRepository);

// ─── Hook ──────────────────────────────────────────

export interface StoryViewModelState {
  /** 播放状态快照 */
  playback: StoryPlaybackState;
  /** 是否正在加载脚本 */
  isLoading: boolean;
  /** 最近一次错误 */
  error: Error | null;
}

export interface StoryViewModelActions {
  /** 启动故事播放 */
  play: () => Promise<void>;
  /** 暂停故事播放 */
  pause: () => Promise<void>;
  /** 从暂停点继续 */
  resume: () => Promise<void>;
  /** 停止并重置 */
  stop: () => Promise<void>;
  /** 清除错误 */
  clearError: () => void;
}

export type StoryViewModel = StoryViewModelState & StoryViewModelActions;

export function useStoryViewModel(): StoryViewModel {
  const [playback, setPlayback] = useState<StoryPlaybackState>(
    () => storyEngine.getCurrentState(),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  // 轮询定时器——异步播放状态下定期刷新 UI
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 播放中定期轮询当前状态
  useEffect(() => {
    if (playback.isPlaying) {
      pollRef.current = setInterval(() => {
        setPlayback(storyEngine.getCurrentState());
        if (!storyEngine.getCurrentState().isPlaying && !storyEngine.getCurrentState().isInterrupted) {
          // 播放自然结束
          if (pollRef.current) clearInterval(pollRef.current);
        }
      }, 250); // 250ms 刷新——平衡流畅度和性能
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [playback.isPlaying]);

  const clearError = useCallback(() => setError(null), []);

  const play = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const state = await storyEngine.play();
      setPlayback(state);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const pause = useCallback(async () => {
    setError(null);
    try {
      const state = await storyEngine.pause();
      setPlayback(state);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, []);

  const resume = useCallback(async () => {
    setError(null);
    try {
      const state = await storyEngine.resume();
      setPlayback(state);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, []);

  const stop = useCallback(async () => {
    setError(null);
    try {
      const state = await storyEngine.stop();
      setPlayback(state);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, []);

  return {
    playback,
    isLoading,
    error,
    play,
    pause,
    resume,
    stop,
    clearError,
  };
}
