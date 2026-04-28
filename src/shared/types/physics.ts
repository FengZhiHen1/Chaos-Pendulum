/** 物理参数。所有字段为不可变值 */
export interface PendulumParams {
  m1: number;       // 上摆质量 (kg)，> 0
  m2: number;       // 下摆质量 (kg)，> 0
  L1: number;       // 上摆杆长 (m)，> 0
  L2: number;       // 下摆杆长 (m)，> 0
  g: number;        // 重力加速度 (m/s²)，>= 0
  damping: number;  // 阻尼系数 (1/s)，>= 0
}

export const DEFAULT_PARAMS: PendulumParams = {
  m1: 1.0,
  m2: 1.0,
  L1: 1.0,
  L2: 1.0,
  g: 9.81,
  damping: 0,
};

/** 积分方法枚举 */
export type IntegratorMethod = "RK4" | "VelocityVerlet" | "Euler";

/** 初始条件 */
export interface InitialConditions {
  theta1: number;     // 上摆初始角度 (rad)
  theta1Dot: number;  // 上摆初始角速度 (rad/s)
  theta2: number;     // 下摆初始角度 (rad)
  theta2Dot: number;  // 下摆初始角速度 (rad/s)
}

/** Worker 内部状态：存储 [θ₁, θ̇₁, θ₂, θ̇₂] */
export type WorkerState = Float64Array;
