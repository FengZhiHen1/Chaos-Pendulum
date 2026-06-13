/**
 * 模块: explore.domain.separation-calculator
 * 职责: 蝴蝶效应分离度纯计算——实现 ISeparationCalculator 契约。
 *       将两侧 SimSideState 的相空间距离计算为 SeparationMetrics。
 * 边界:
 *   - 依赖: explore/contracts (ISeparationCalculator, SimSideState, SeparationMetrics)
 *   - 被依赖: viewModel/stores/butterflySlice (Store 的 _updateSide 委托计算)
 * 禁止行为:
 *   - 禁止包含任何副作用（纯函数）
 *   - 禁止二元判定（if pass else fail）——使用连续置信度分数
 */

import type {
  ISeparationCalculator,
  SimSideState,
  SeparationMetrics,
} from "../contracts";
import { BUTTERFLY_DEFAULTS } from "../contracts";

/** 分离度计算器的纯函数实现 */
class SeparationCalculator implements ISeparationCalculator {
  /** 历史最大分离度（跨多次计算累积） */
  private historicalMax = 0;

  compute(sideA: SimSideState, sideB: SimSideState): SeparationMetrics {
    const dTheta1 = sideA.state.theta1 - sideB.state.theta1;
    const dOmega1 = sideA.state.omega1 - sideB.state.omega1;
    const dTheta2 = sideA.state.theta2 - sideB.state.theta2;
    const dOmega2 = sideA.state.omega2 - sideB.state.omega2;

    // 角度差 + 角速度差的欧氏距离（契约要求）
    const currentSeparation = Math.sqrt(
      dTheta1 * dTheta1 + dOmega1 * dOmega1 + dTheta2 * dTheta2 + dOmega2 * dOmega2,
    );

    // 分离度超过 90°(π/2 rad) 视为完全失相关
    const thresholdRad = BUTTERFLY_DEFAULTS.fullyDecoupledThresholdDeg * (Math.PI / 180);
    const isFullyDecoupled = currentSeparation > thresholdRad;

    this.historicalMax = Math.max(this.historicalMax, currentSeparation);

    return {
      currentSeparation,
      isFullyDecoupled,
      maxSeparation: this.historicalMax,
      decoupledAt: null, // 由调用方根据上下文设定，此纯函数不追踪时间
    };
  }

  /** 重置历史最大值（蝴蝶效应重启时调用） */
  reset(): void {
    this.historicalMax = 0;
  }
}

/** 单例——无状态依赖，全局共享 */
export const separationCalculator = new SeparationCalculator();
