/**
 * 模块: explore.domain.drift-calculator
 * 职责: 时间反演漂移距离纯计算——实现 IDriftCalculator 契约。
 *       计算反演轨迹与正向轨迹在相空间中的欧氏距离。
 *       角速度散度远早于位置散度，因此包含角速度分量可提前发现漂移。
 * 边界:
 *   - 依赖: explore/contracts (IDriftCalculator)
 *   - 被依赖: view/components/TimeReversal (数值反演逐帧漂移检测)
 * 禁止行为:
 *   - 禁止包含任何副作用（纯函数）
 *   - 禁止返回负值（漂移距离 ≥ 0）
 */

import type { IDriftCalculator } from "../contracts";

/** 漂移计算器——纯函数实现 IDriftCalculator */
class DriftCalculator implements IDriftCalculator {
  compute(
    forwardState: { theta1: number; omega1: number; theta2: number; omega2: number },
    reversedState: { theta1: number; omega1: number; theta2: number; omega2: number },
  ): number {
    const dTheta1 = forwardState.theta1 - reversedState.theta1;
    const dOmega1 = forwardState.omega1 - reversedState.omega1;
    const dTheta2 = forwardState.theta2 - reversedState.theta2;
    const dOmega2 = forwardState.omega2 - reversedState.omega2;

    return Math.sqrt(
      dTheta1 * dTheta1 + dOmega1 * dOmega1 + dTheta2 * dTheta2 + dOmega2 * dOmega2,
    );
  }
}

/** 单例——纯计算无状态，全局共享 */
export const driftCalculator = new DriftCalculator();
