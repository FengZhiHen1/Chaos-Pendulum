import type { PhysicsParams, StateVector } from "@/shared/types";
import { derivatives } from "./derivatives";

export function rk45Step(
  state: StateVector,
  params: PhysicsParams,
  dt: number,
  tolerance = 1e-8,
): { next: StateVector; dtNew: number } {
  const f = (s: StateVector) => derivatives(s, params);

  // Dormand-Prince 5(4) Butcher tableau
  const k1 = f(state);
  const k2 = f(add(state, k1, dt * 1 / 5));
  const k3 = f(add(state, k1, k2, dt * 3 / 40, dt * 9 / 40));
  const k4 = f(add(state, k1, k2, k3, dt * 44 / 45, dt * -56 / 15, dt * 32 / 9));
  const k5 = f(add(state, k1, k2, k3, k4, dt * 19372 / 6561, dt * -25360 / 2187, dt * 64448 / 6561, dt * -212 / 729));
  const k6 = f(add(state, k1, k2, k3, k4, k5,
    dt * 9017 / 3168, dt * -355 / 33, dt * 46732 / 5247, dt * 49 / 176, dt * -5103 / 18656));

  // 5th order solution
  const next = add(state, k1, k2, k3, k4, k5,
    dt * 35 / 384, 0, dt * 500 / 1113, dt * 125 / 192, dt * -2187 / 6784, dt * 11 / 84);

  // Error estimate (5th - 4th order)
  const error = maxError(
    add(state, k1, k2, k3, k4, k5, k6,
      dt * (35 / 384 - 5179 / 57600),
      dt * (0 - 0),
      dt * (500 / 1113 - 7571 / 16695),
      dt * (125 / 192 - 393 / 640),
      dt * (-2187 / 6784 - -92097 / 339200),
      dt * (11 / 84 - 187 / 2100),
      dt * (0 - 1 / 40)),
    state,
  );

  const dtNew = dt * Math.min(4, Math.max(0.1, 0.9 * (tolerance / (error + 1e-15)) ** 0.2));

  return { next, dtNew };
}

function add(s: StateVector, ...rest: (StateVector | number)[]): StateVector {
  const out = { theta1: s.theta1, omega1: s.omega1, theta2: s.theta2, omega2: s.omega2 };
  let i = 0;
  while (i < rest.length) {
    const k = rest[i] as StateVector;
    const c = (rest[i + 1] ?? 1) as number;
    if (typeof k === "object") {
      out.theta1 += c * k.theta1;
      out.omega1 += c * k.omega1;
      out.theta2 += c * k.theta2;
      out.omega2 += c * k.omega2;
      i += 2;
    } else {
      // k is actually a number (scalar coefficient without a StateVector)
      out.theta1 += k;
      out.omega1 += k;
      out.theta2 += k;
      out.omega2 += k;
      i += 1;
    }
  }
  return out;
}

function maxError(a: StateVector, b: StateVector): number {
  return Math.max(
    Math.abs(a.theta1 - b.theta1),
    Math.abs(a.omega1 - b.omega1),
    Math.abs(a.theta2 - b.theta2),
    Math.abs(a.omega2 - b.omega2),
  );
}
