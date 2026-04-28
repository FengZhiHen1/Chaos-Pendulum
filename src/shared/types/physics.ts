// ─── 物理参数 ──────────────────────────────────

/** 物理参数。所有字段为不可变值 */
export interface PendulumParams {
  m1: number;       // 上摆质量 (kg)，> 0
  m2: number;       // 下摆质量 (kg)，> 0
  L1: number;       // 上摆杆长 (m)，> 0
  L2: number;       // 下摆杆长 (m)，> 0
  g: number;        // 重力加速度 (m/s²)，>= 0
  damping: number;  // 阻尼系数 (1/s)，>= 0
}

/** 积分方法枚举 */
export type IntegratorMethod = "RK4" | "VelocityVerlet" | "Euler";

/** 初始条件 */
export interface InitialConditions {
  theta1: number;     // 上摆初始角度 (rad)
  theta1Dot: number;  // 上摆初始角速度 (rad/s)
  theta2: number;     // 下摆初始角度 (rad)
  theta2Dot: number;  // 下摆初始角速度 (rad/s)
}

// ─── 参数预设 ──────────────────────────────────

export interface ParamPreset {
  id: string;
  label: string;
  description: string;
  params: Partial<PendulumParams>;
  initialConditions: Partial<InitialConditions>;
  method?: IntegratorMethod;
}

// ─── 参数校验 ──────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  level: "error" | "warning" | null;
  message: string | null;
}

// ─── 参数 UI 元数据 ─────────────────────────────

export type ParamGroup = "system" | "initial" | "environment";

export interface ParamFieldMeta {
  key: string;
  label: string;
  unit: string;
  hardMin: number | null;
  hardMax: number | null;
  sliderMin: number;
  sliderMax: number;
  sliderStep: number;
  decimalPlaces: number;
  defaultValue: number;
  group: ParamGroup;
  order: number;
}

// ─── 默认值常量 ─────────────────────────────────

export const DEFAULT_PARAMS: PendulumParams = {
  m1: 1.0,
  m2: 1.0,
  L1: 1.0,
  L2: 1.0,
  g: 9.81,
  damping: 0,
};

export const DEFAULT_INITIAL_CONDITIONS: InitialConditions = {
  theta1: Math.PI / 2,
  theta1Dot: 0,
  theta2: Math.PI / 2,
  theta2Dot: 0,
};

export const DEFAULT_METHOD: IntegratorMethod = "RK4";

// ─── 参数元数据表 ───────────────────────────────

export const PARAM_META: ParamFieldMeta[] = [
  { key: "m1",    label: "上摆质量",   unit: "kg",    hardMin: 1e-6, hardMax: null, sliderMin: 0.1, sliderMax: 10.0,        sliderStep: 0.1,  decimalPlaces: 3, defaultValue: 1.0,        group: "system",      order: 1 },
  { key: "m2",    label: "下摆质量",   unit: "kg",    hardMin: 1e-6, hardMax: null, sliderMin: 0.1, sliderMax: 10.0,        sliderStep: 0.1,  decimalPlaces: 3, defaultValue: 1.0,        group: "system",      order: 2 },
  { key: "L1",    label: "上摆杆长",   unit: "m",     hardMin: 1e-6, hardMax: null, sliderMin: 0.1, sliderMax: 3.0,         sliderStep: 0.05, decimalPlaces: 3, defaultValue: 1.0,        group: "system",      order: 3 },
  { key: "L2",    label: "下摆杆长",   unit: "m",     hardMin: 1e-6, hardMax: null, sliderMin: 0.1, sliderMax: 3.0,         sliderStep: 0.05, decimalPlaces: 3, defaultValue: 1.0,        group: "system",      order: 4 },
  { key: "g",     label: "重力加速度", unit: "m/s²",  hardMin: 0,    hardMax: null, sliderMin: 0.0, sliderMax: 20.0,        sliderStep: 0.1,  decimalPlaces: 2, defaultValue: 9.81,       group: "environment", order: 9 },
  { key: "damping",label:"阻尼系数",    unit: "1/s",  hardMin: 0,    hardMax: null, sliderMin: 0.0, sliderMax: 2.0,         sliderStep: 0.01, decimalPlaces: 3, defaultValue: 0.0,         group: "environment", order: 10 },
  { key: "theta1",    label: "上摆初始角度",   unit: "rad",   hardMin: null, hardMax: null, sliderMin: -Math.PI, sliderMax: Math.PI,  sliderStep: 0.01, decimalPlaces: 4, defaultValue: Math.PI / 2, group: "initial", order: 5 },
  { key: "theta1Dot", label: "上摆初始角速度", unit: "rad/s", hardMin: null, hardMax: null, sliderMin: -10.0,  sliderMax: 10.0,   sliderStep: 0.1,  decimalPlaces: 3, defaultValue: 0.0,          group: "initial", order: 6 },
  { key: "theta2",    label: "下摆初始角度",   unit: "rad",   hardMin: null, hardMax: null, sliderMin: -Math.PI, sliderMax: Math.PI,  sliderStep: 0.01, decimalPlaces: 4, defaultValue: Math.PI / 2, group: "initial", order: 7 },
  { key: "theta2Dot", label: "下摆初始角速度", unit: "rad/s", hardMin: null, hardMax: null, sliderMin: -10.0,  sliderMax: 10.0,   sliderStep: 0.1,  decimalPlaces: 3, defaultValue: 0.0,          group: "initial", order: 8 },
];

/** 硬约束常量 */
export const HARD_MIN_MASS = 1e-6;
export const HARD_MIN_LENGTH = 1e-6;
export const HARD_MIN_GRAVITY = 0;
export const HARD_MIN_DAMPING = 0;

// ─── 预设定义 ───────────────────────────────────

export const PRESETS: ParamPreset[] = [
  {
    id: "small-angle",
    label: "小角度线性化",
    description: "将两摆设为 3° 以内，验证线性近似",
    params: {},
    initialConditions: { theta1: 0.052, theta1Dot: 0, theta2: 0.034, theta2Dot: 0 },
    method: "RK4",
  },
  {
    id: "single-pendulum",
    label: "单摆退化",
    description: "将 m₂ 设为零，退化为单摆",
    params: { m2: 1e-6 },
    initialConditions: {},
  },
  {
    id: "energy-conservation",
    label: "能量守恒检验",
    description: "关闭阻尼，长时间运行检验能量漂移",
    params: { damping: 0 },
    initialConditions: {},
    method: "VelocityVerlet",
  },
];

/** Worker 内部状态：存储 [θ₁, θ̇₁, θ₂, θ̇₂] */
export type WorkerState = Float64Array;
