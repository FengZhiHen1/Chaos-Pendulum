export interface PhysicsParams {
  m1: number;
  m2: number;
  L1: number;
  L2: number;
  g: number;
  damping: number;
}

export interface StateVector {
  theta1: number;
  omega1: number;
  theta2: number;
  omega2: number;
}

export interface EnergySnapshot {
  kinetic: number;
  potential: number;
  total: number;
}
