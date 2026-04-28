import type { PhysicsParams, StateVector, EnergySnapshot } from "./physics";

export type IntegratorType = "rk4" | "rk45";

export interface WorkerStepCommand {
  cmd: "step";
  params: PhysicsParams;
  state: StateVector;
  dt: number;
  steps: number;
  integrator: IntegratorType;
}

export interface WorkerResult {
  cmd: "result";
  trajectory: Float64Array;
  energy: EnergySnapshot[];
  poincareHits: PoincareHit[];
}

export interface PoincareHit {
  theta2: number;
  omega2: number;
}
