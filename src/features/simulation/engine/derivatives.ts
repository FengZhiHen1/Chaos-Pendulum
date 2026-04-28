import type { PhysicsParams, StateVector } from "@/shared/types";

export function derivatives(state: StateVector, params: PhysicsParams): StateVector {
  const { m1, m2, L1, L2, g, damping } = params;
  const { theta1, omega1, theta2, omega2 } = state;

  const delta = theta2 - theta1;
  const sinDelta = Math.sin(delta);
  const cosDelta = Math.cos(delta);

  const denom1 = (m1 + m2) * L1 - m2 * L1 * cosDelta * cosDelta;
  const denom2 = (m1 + m2) * L2 - m2 * L2 * cosDelta * cosDelta;

  const alpha1 =
    (m2 * L1 * omega1 * omega1 * sinDelta * cosDelta +
      m2 * g * Math.sin(theta1) * cosDelta +
      m2 * L2 * omega2 * omega2 * sinDelta -
      (m1 + m2) * g * Math.sin(theta1)) /
      denom1 -
    damping * omega1;

  const alpha2 =
    (-m2 * L2 * omega2 * omega2 * sinDelta * cosDelta +
      (m1 + m2) * (g * Math.sin(theta1) * cosDelta -
        L1 * omega1 * omega1 * sinDelta -
        g * Math.sin(theta2))) /
      denom2 -
    damping * omega2;

  return {
    theta1: omega1,
    omega1: alpha1,
    theta2: omega2,
    omega2: alpha2,
  };
}
