import type { PhysicsParams, StateVector, EnergySnapshot } from "@/shared/types";

export function createInitialState(theta1: number, theta2: number, omega1 = 0, omega2 = 0): StateVector {
  return { theta1, omega1, theta2, omega2 };
}

export function computeEnergy(state: StateVector, params: PhysicsParams): EnergySnapshot {
  const { m1, m2, L1, L2, g } = params;
  const { theta1, omega1, theta2, omega2 } = state;

  const y1 = -L1 * Math.cos(theta1);
  const y2 = y1 - L2 * Math.cos(theta2);

  const v1Sq = (L1 * omega1) ** 2;
  const v2x = L1 * omega1 * Math.cos(theta1) + L2 * omega2 * Math.cos(theta2);
  const v2y = L1 * omega1 * Math.sin(theta1) + L2 * omega2 * Math.sin(theta2);
  const v2Sq = v2x * v2x + v2y * v2y;

  const potential = m1 * g * y1 + m2 * g * y2;
  const kinetic = 0.5 * m1 * v1Sq + 0.5 * m2 * v2Sq;

  return {
    kinetic,
    potential,
    total: kinetic + potential,
  };
}
