import type { PhysicsParams, StateVector } from "@/shared/types";
import { derivatives } from "./derivatives";

export function rk4Step(
  state: StateVector,
  params: PhysicsParams,
  dt: number,
): StateVector {
  const dydt = (s: StateVector) => derivatives(s, params);

  const k1 = dydt(state);
  const s2: StateVector = {
    theta1: state.theta1 + 0.5 * dt * k1.theta1,
    omega1: state.omega1 + 0.5 * dt * k1.omega1,
    theta2: state.theta2 + 0.5 * dt * k1.theta2,
    omega2: state.omega2 + 0.5 * dt * k1.omega2,
  };

  const k2 = dydt(s2);
  const s3: StateVector = {
    theta1: state.theta1 + 0.5 * dt * k2.theta1,
    omega1: state.omega1 + 0.5 * dt * k2.omega1,
    theta2: state.theta2 + 0.5 * dt * k2.theta2,
    omega2: state.omega2 + 0.5 * dt * k2.omega2,
  };

  const k3 = dydt(s3);
  const s4: StateVector = {
    theta1: state.theta1 + dt * k3.theta1,
    omega1: state.omega1 + dt * k3.omega1,
    theta2: state.theta2 + dt * k3.theta2,
    omega2: state.omega2 + dt * k3.omega2,
  };

  const k4 = dydt(s4);

  return {
    theta1: state.theta1 + (dt / 6) * (k1.theta1 + 2 * k2.theta1 + 2 * k3.theta1 + k4.theta1),
    omega1: state.omega1 + (dt / 6) * (k1.omega1 + 2 * k2.omega1 + 2 * k3.omega1 + k4.omega1),
    theta2: state.theta2 + (dt / 6) * (k1.theta2 + 2 * k2.theta2 + 2 * k3.theta2 + k4.theta2),
    omega2: state.omega2 + (dt / 6) * (k1.omega2 + 2 * k2.omega2 + 2 * k3.omega2 + k4.omega2),
  };
}

export function rk4Integrate(
  state: StateVector,
  params: PhysicsParams,
  dt: number,
  steps: number,
): StateVector[] {
  const trajectory: StateVector[] = [];
  let current = state;
  for (let i = 0; i < steps; i++) {
    current = rk4Step(current, params, dt);
    trajectory.push(current);
  }
  return trajectory;
}
