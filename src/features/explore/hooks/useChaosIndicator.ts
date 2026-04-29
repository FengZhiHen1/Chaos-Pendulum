import { useRef, useCallback } from "react";
import { useSimulationStore } from "@/features/simulation";

// ─── 常量 ──────────────────────────────────────────

const WINDOW_SIZE = 120; // 2 秒 × 60fps
const CHAOS_VARIANCE_THRESHOLD = 5.0;

// ─── 返回类型 ──────────────────────────────────────

export interface ChaosIndicatorAPI {
  /** 滑动窗口内 ω₂ 方差 */
  variance: number;
  /** 方差 > 5.0 时判定为混沌 */
  isChaotic: boolean;
}

/**
 * 简化混沌检测器。
 * 基于滑动窗口内 ω₂ 方差的混沌判定：
 * - 周期运动 → ω₂ 方差小（< 5.0）
 * - 混沌运动 → ω₂ 方差大（> 5.0）
 *
 * 使用 Float64Array 环形缓冲存储最近 120 帧 ω₂ 值。
 * 支持仿真重置时自动清空窗口。
 */
export function useChaosIndicator() {
  const historyRef = useRef(new Float64Array(WINDOW_SIZE));
  const cursorRef = useRef(0);
  const isFirstPassRef = useRef(true);
  const lastResetTriggerRef = useRef(0);

  /**
   * 追加新 ω₂ 值并返回方差/isChaotic。
   * 应从音频更新循环中每帧调用。
   */
  const pushAndGet = useCallback((omega2: number): ChaosIndicatorAPI => {
    // 检测仿真重置
    const resetTrigger = useSimulationStore.getState().resetTrigger;
    if (resetTrigger !== lastResetTriggerRef.current) {
      lastResetTriggerRef.current = resetTrigger;
      historyRef.current.fill(0);
      cursorRef.current = 0;
      isFirstPassRef.current = true;
    }

    // NaN / Infinity 保护
    if (isNaN(omega2) || !isFinite(omega2)) {
      // 返回上次计算结果
      return computeVariance();
    }

    const buf = historyRef.current;
    buf[cursorRef.current] = omega2;
    cursorRef.current = (cursorRef.current + 1) % WINDOW_SIZE;
    if (cursorRef.current === 0) isFirstPassRef.current = false;

    return computeVariance();
  }, []);

  function computeVariance(): ChaosIndicatorAPI {
    const buf = historyRef.current;
    const validCount = isFirstPassRef.current ? cursorRef.current : WINDOW_SIZE;

    if (validCount < 2) {
      return { variance: 0, isChaotic: false };
    }

    // 计算均值
    let sum = 0;
    for (let i = 0; i < validCount; i++) {
      sum += buf[i]!;
    }
    const mean = sum / validCount;

    // 计算方差
    let sumSq = 0;
    for (let i = 0; i < validCount; i++) {
      const diff = buf[i]! - mean;
      sumSq += diff * diff;
    }
    const variance = sumSq / validCount;

    return {
      variance,
      isChaotic: variance > CHAOS_VARIANCE_THRESHOLD,
    };
  }

  return { pushAndGet };
}
