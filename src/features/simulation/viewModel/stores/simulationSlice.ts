import type { StateCreator } from "zustand";
import type {
  PendulumParams,
  InitialConditions,
  IntegratorMethod,
  ParamPreset,
  ParamFieldMeta,
  ValidationResult,
  StateVector,
} from "@/shared/domain/valueObjects";
import {
  DEFAULT_PARAMS,
  DEFAULT_INITIAL_CONDITIONS,
  DEFAULT_METHOD,
  PARAM_META,
} from "@/shared/domain/valueObjects";
import { FRAME_STRIDE, FrameField } from "@/shared/domain/valueObjects";

const DRIFT_THRESHOLD = 0.005;
/** 总能量绝对值低于此阈值时，改用绝对漂移判定 */
const LOW_ENERGY_THRESHOLD = 1.0; // J
/** 低能量区绝对漂移容忍值 */
const ABS_DRIFT_THRESHOLD = 0.05; // J
const MAX_NAN_FRAMES = 60;
/** 双摆静止判定：角速度绝对值低于此阈值视为静止 (rad/s) */
const STOPPED_OMEGA_THRESHOLD = 1e-6;
/** 连续静止帧数阈值（120 帧 ≈ 2 秒 @60fps） */
const STOPPED_FRAME_COUNT = 120;

// ─── 帧数据 ─────────────────────────────────────

export interface SimulationFrame {
  t: number;
  theta1: number;
  theta1Dot: number;
  theta2: number;
  theta2Dot: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kineticEnergy: number;
  potentialEnergy: number;
  totalEnergy: number;
  alpha1: number;
  alpha2: number;
}

const defaultFrame: SimulationFrame = {
  t: 0,
  theta1: Math.PI / 2,
  theta1Dot: 0,
  theta2: Math.PI / 2,
  theta2Dot: 0,
  x1: 1, y1: 0, x2: 2, y2: 0,
  kineticEnergy: 0, potentialEnergy: -19.62, totalEnergy: -19.62,
  alpha1: 0, alpha2: 0,
};

// ─── Slice 类型 ─────────────────────────────────

export interface SimulationSlice extends SimulationFrame {
  // 仿真状态向量（EXP-01 3D 场景消费）
  state: StateVector;

  // 参数
  params: PendulumParams;
  initialConditions: InitialConditions;
  method: IntegratorMethod;
  paramMeta: ParamFieldMeta[];

  // 仿真运行
  isRunning: boolean;
  /** Worker 是否已就绪（ready 消息已到达）。false 时参数面板应显示加载态。 */
  isWorkerReady: boolean;
  engineError: string | null;
  /** 引擎事件通知（供 toast UI 消费）。消费后应设为 null。 */
  engineEvent: { type: "recovered"; message: string } | null;
  /** 仿真重置计数器，每次新仿真运行时递增 */
  resetTrigger: number;

  // 参数面板 UI
  activeField: string | null;
  fieldErrors: Record<string, ValidationResult>;
  isSceneFrozen: boolean;
  isPanelExpanded: boolean;
  /** 参数面板有未应用更改（重置后才生效） */
  paramsDirty: boolean;

  // ── SIM-01 Actions ──
  setParams: (patch: Partial<PendulumParams>) => void;
  setMethod: (method: IntegratorMethod) => void;
  setRunning: (running: boolean) => void;
  setEngineError: (error: string | null) => void;
  consumeFrameFromBuffer: (buffer: Float64Array, frameIndex: number) => void;
  incrementResetTrigger: () => void;

  // ── SYS-02 运行时异常处理 ──
  /** 积分步长 Δt（秒）。默认 1/60 */
  dt: number;
  setDt: (dt: number) => void;
  /** 快捷播放 */
  play: () => void;
  /** 快捷暂停 */
  pause: () => void;

  // ── SIM-04 能量监控 ──
  energyInitial: number | null;
  energyDrift: number;
  driftExceeded: boolean;
  energyMin: number;
  energyMax: number;
  isSimulationActive: boolean;
  /** 当前消耗的帧索引 (0..FRAMES_PER_BATCH-1)，供 LAB-01 力数据对齐 */
  consumedFrameIndex: number;
  /** 最近批次能量投影累积校正量 (J)，仅 damping=0 时有意义 */
  energyCorrection: number;
  /** 实时 Lyapunov 指数（由 Worker 影子轨迹法计算） */
  lyapunovExponent: number;

  // ── 内部状态（从模块级变量迁移至 store，避免测试污染）──
  _nanSkipCount: number;
  _lastDamping: number;
  /** 上次能量基线建立时的 resetTrigger 值，用于检测仿真重置 */
  _energyResetGeneration: number;
  /** 连续静止帧计数器（仅阻尼 > 0 时递增） */
  _stoppedFrameCount: number;
  /** 摆已静止（阻尼耗尽动能），供 UI 展示提示 */
  isPendulumStopped: boolean;

  // ── SIM-02 Actions ──
  setParam: (key: keyof PendulumParams, value: number) => void;
  setInitialCondition: (key: keyof InitialConditions, value: number) => void;
  applyPreset: (preset: ParamPreset) => string | null;
  injectParams: (
    params: Partial<PendulumParams>,
    initialConditions?: Partial<InitialConditions>,
  ) => void;
  setActiveField: (field: string | null) => void;
  resetToDefaults: () => void;
  /** 以面板当前值重置仿真（不改动滑块），同步关闭时间反演面板 */
  applyCurrentSettings: () => void;
  clearFieldErrors: () => void;
  setPanelExpanded: (expanded: boolean) => void;
  clearDriftAlarm: () => void;

  // ── 运行控制状态机 ──
  /** 运行阶段：idle | running | paused | reversed */
  runPhase: "idle" | "running" | "paused" | "reversed";
  setRunPhase: (phase: SimulationSlice["runPhase"]) => void;
}

// ─── 校验逻辑 ───────────────────────────────────

function validateParam(key: string, value: number): ValidationResult {
  const meta = PARAM_META.find((m) => m.key === key);
  if (!meta) return { valid: false, level: "error", message: `未知参数: ${key}` };
  if (typeof value !== "number" || isNaN(value))
    return { valid: false, level: "error", message: `${meta.label} 必须为有效数字` };
  if (meta.hardMin !== null && value < meta.hardMin)
    return { valid: false, level: "error", message: `${meta.label} 不能小于 ${meta.hardMin} ${meta.unit}` };
  if (meta.hardMax !== null && value > meta.hardMax)
    return { valid: false, level: "error", message: `${meta.label} 不能大于 ${meta.hardMax} ${meta.unit}` };
  if (value < meta.sliderMin || value > meta.sliderMax)
    return { valid: true, level: "warning", message: `${meta.label} 建议范围 [${meta.sliderMin}, ${meta.sliderMax}] ${meta.unit}` };
  return { valid: true, level: null, message: null };
}

function validateAll(
  params: PendulumParams,
  ic: InitialConditions,
): { ok: boolean; errors: Record<string, ValidationResult> } {
  const errors: Record<string, ValidationResult> = {};
  let hasError = false;

  for (const key of Object.keys(params) as (keyof PendulumParams)[]) {
    const r = validateParam(key, params[key]);
    if (!r.valid && r.level === "error") hasError = true;
    if (r.level !== null) errors[key] = r;
  }
  for (const key of Object.keys(ic) as (keyof InitialConditions)[]) {
    const r = validateParam(key, ic[key]);
    if (!r.valid && r.level === "error") hasError = true;
    if (r.level !== null) errors[key] = r;
  }

  return { ok: !hasError, errors };
}

// ─── Slice 创建 ─────────────────────────────────

export const createSimulationSlice: StateCreator<SimulationSlice, [], [], SimulationSlice> = (
  set,
  get,
) => ({
  ...defaultFrame,
  state: {
    theta1: defaultFrame.theta1,
    omega1: defaultFrame.theta1Dot,
    theta2: defaultFrame.theta2,
    omega2: defaultFrame.theta2Dot,
  },
  params: { ...DEFAULT_PARAMS },
  initialConditions: { ...DEFAULT_INITIAL_CONDITIONS },
  method: DEFAULT_METHOD,
  paramMeta: PARAM_META,

  isRunning: false,
  isWorkerReady: false,
  engineError: null,
  engineEvent: null,
  resetTrigger: 0,

  activeField: null,
  fieldErrors: {},
  isSceneFrozen: false,
  isPanelExpanded: true,
  paramsDirty: false,

  energyInitial: null,
  energyDrift: 0,
  driftExceeded: false,
  energyMin: 0,
  energyMax: 0,
  isSimulationActive: false,
  consumedFrameIndex: 0,
  energyCorrection: 0,
  lyapunovExponent: 0,
  _nanSkipCount: 0,
  _lastDamping: NaN,
  _energyResetGeneration: 0,
  _stoppedFrameCount: 0,
  isPendulumStopped: false,

  runPhase: "idle",

  // ── SIM-01 Actions ──

  setParams: (patch) =>
    set((s) => ({ params: { ...s.params, ...patch }, paramsDirty: true })),

  setMethod: (method) => set({ method, paramsDirty: true }),

  setRunning: (isRunning) => set({ isRunning }),

  setRunPhase: (runPhase) => {
    const isRunning = runPhase === "running" || runPhase === "reversed";
    set({ runPhase, isRunning });
  },

  // ── SYS-02 ──
  dt: 1 / 60,
  setDt: (dt) => set({ dt }),
  play: () => set({ isRunning: true, runPhase: "running" }),
  pause: () => set({ isRunning: false, runPhase: "paused" }),

  setEngineError: (engineError) => set({ engineError }),

  incrementResetTrigger: () => set((s) => ({ resetTrigger: s.resetTrigger + 1 })),

  consumeFrameFromBuffer: (buffer, frameIndex) => {
    const offset = frameIndex * FRAME_STRIDE;
    if (offset + FRAME_STRIDE > buffer.length) return;
    const k = buffer[offset + FrameField.KINETIC_ENERGY]!;
    const v = buffer[offset + FrameField.POTENTIAL_ENERGY]!;
    const e = buffer[offset + FrameField.TOTAL_ENERGY]!;
    const prev = get();

    let ei = prev.energyInitial;
    let emin = prev.energyMin;
    let emax = prev.energyMax;
    let ed = prev.energyDrift;
    let de = prev.driftExceeded;
    let sa = prev.isSimulationActive;
    let nsc = prev._nanSkipCount;
    let ld = prev._lastDamping;
    let erg = prev._energyResetGeneration;
    let sfc = prev._stoppedFrameCount;
    let ips = prev.isPendulumStopped;

    // 检测仿真重置：resetTrigger 变化意味着新一轮仿真已启动
    const genChanged = prev.resetTrigger !== erg;

    if (isNaN(k) || isNaN(v) || isNaN(e)) {
      nsc++;
      if (nsc >= MAX_NAN_FRAMES) sa = false;
    } else {
      if (nsc > 0) { nsc = 0; if (!sa) sa = true; }
      const damp = prev.params.damping;
      if (!isNaN(ld) && ld !== damp) {
        de = false;
        if (damp === 0 && ld > 0) { ei = e; emin = e; emax = e; ips = false; sfc = 0; }
      }
      ld = damp;

      if (genChanged) {
        // 仿真重置：重新建立能量基线
        ei = e; ed = 0; de = false; emin = e; emax = e; sa = true;
        erg = prev.resetTrigger;
        sfc = 0; ips = false;
      } else if (ei === null || !sa) {
        ei = e; ed = 0; emin = e; emax = e; sa = true;
      } else {
        emin = Math.min(prev.energyMin, e);
        emax = Math.max(prev.energyMax, e);
        const absDrift = Math.abs(e - ei);
        if (Math.abs(ei) < LOW_ENERGY_THRESHOLD) {
          ed = absDrift; // 直接使用绝对漂移值 (J)
          if (damp === 0 && absDrift > ABS_DRIFT_THRESHOLD) de = true;
        } else {
          ed = absDrift / Math.abs(ei);
          if (damp === 0 && ed > DRIFT_THRESHOLD) de = true;
        }
      }

      // 检测摆静止（仅阻尼系统，动能被耗散殆尽）
      if (damp > 0 && !ips) {
        const o1 = buffer[offset + FrameField.THETA1_DOT]!;
        const o2 = buffer[offset + FrameField.THETA2_DOT]!;
        if (Math.abs(o1) < STOPPED_OMEGA_THRESHOLD && Math.abs(o2) < STOPPED_OMEGA_THRESHOLD) {
          sfc++;
          if (sfc >= STOPPED_FRAME_COUNT) ips = true;
        } else {
          sfc = 0;
        }
      }
    }

    set({
      t: buffer[offset + FrameField.T]!,
      theta1: buffer[offset + FrameField.THETA1]!,
      theta1Dot: buffer[offset + FrameField.THETA1_DOT]!,
      theta2: buffer[offset + FrameField.THETA2]!,
      theta2Dot: buffer[offset + FrameField.THETA2_DOT]!,
      x1: buffer[offset + FrameField.X1]!, y1: buffer[offset + FrameField.Y1]!,
      x2: buffer[offset + FrameField.X2]!, y2: buffer[offset + FrameField.Y2]!,
      kineticEnergy: k, potentialEnergy: v, totalEnergy: e,
      alpha1: buffer[offset + FrameField.ALPHA1]!,
      alpha2: buffer[offset + FrameField.ALPHA2]!,
      energyInitial: ei, energyDrift: ed, driftExceeded: de,
      energyMin: emin, energyMax: emax, isSimulationActive: sa,
      consumedFrameIndex: frameIndex,
      _nanSkipCount: nsc, _lastDamping: ld, _energyResetGeneration: erg,
      _stoppedFrameCount: sfc, isPendulumStopped: ips,
      ...(ips !== prev.isPendulumStopped ? { isRunning: !ips } as const : {}),
      state: {
        theta1: buffer[offset + FrameField.THETA1]!,
        omega1: buffer[offset + FrameField.THETA1_DOT]!,
        theta2: buffer[offset + FrameField.THETA2]!,
        omega2: buffer[offset + FrameField.THETA2_DOT]!,
      },
    });
  },

  clearDriftAlarm: () => {
    const s = get();
    const cleared = Math.abs(s.energyInitial!) < LOW_ENERGY_THRESHOLD
      ? s.energyDrift < ABS_DRIFT_THRESHOLD
      : s.energyDrift < DRIFT_THRESHOLD;
    if (cleared) set({ driftExceeded: false });
  },

  // ── SIM-02 Actions ──

  setParam: (key, value) => {
    const result = validateParam(key, value);
    if (!result.valid && result.level === "error") {
      set((s) => ({
        fieldErrors: { ...s.fieldErrors, [key]: result },
        isSceneFrozen: true,
      }));
      return;
    }
    set((s) => {
      const newErrors = { ...s.fieldErrors };
      if (result.level === "warning") newErrors[key] = result;
      else delete newErrors[key];

      const newParams = { ...s.params, [key]: value };
      const hasOtherErrors = Object.entries(newErrors).some(
        ([k, v]) => k !== key && v.level === "error",
      );

      return {
        params: newParams,
        fieldErrors: newErrors,
        isSceneFrozen: hasOtherErrors,
        paramsDirty: true,
      };
    });
  },

  setInitialCondition: (key, value) => {
    const result = validateParam(key, value);
    if (!result.valid && result.level === "error") {
      set((s) => ({
        fieldErrors: { ...s.fieldErrors, [key]: result },
        isSceneFrozen: true,
      }));
      return;
    }
    set((s) => {
      const newErrors = { ...s.fieldErrors };
      if (result.level === "warning") newErrors[key] = result;
      else delete newErrors[key];

      const newIC = { ...s.initialConditions, [key]: value };
      const hasOtherErrors = Object.entries(newErrors).some(
        ([k, v]) => k !== key && v.level === "error",
      );

      return {
        initialConditions: newIC,
        fieldErrors: newErrors,
        isSceneFrozen: hasOtherErrors,
        paramsDirty: true,
      };
    });
  },

  applyPreset: (preset) => {
    const s = get();
    const newParams = { ...s.params, ...preset.params };
    const newIC = { ...s.initialConditions, ...preset.initialConditions };
    const { ok, errors } = validateAll(newParams, newIC);

    if (!ok) {
      const firstErr = Object.values(errors).find((e) => e.level === "error");
      return firstErr?.message ?? "预设校验失败";
    }

    set({
      params: newParams,
      initialConditions: newIC,
      method: preset.method ?? s.method,
      fieldErrors: {},
      isSceneFrozen: false,
      paramsDirty: false,
      resetTrigger: s.resetTrigger + 1,
    });
    return null;
  },

  injectParams: (params, initialConditions) => {
    const s = get();
    const updates: Partial<PendulumParams> = {};
    for (const [k, v] of Object.entries(params)) {
      const key = k as keyof PendulumParams;
      if (s.activeField === key) {
        console.info(`injectParams: skipped field ${key} (user is editing)`);
        continue;
      }
      const r = validateParam(key, v!);
      if (!r.valid && r.level === "error") {
        console.warn(`injectParams: rejected ${key}=${v}: ${r.message}`);
        continue;
      }
      updates[key] = v!;
    }

    let newIC = { ...s.initialConditions };
    if (initialConditions) {
      for (const [k, v] of Object.entries(initialConditions)) {
        const key = k as keyof InitialConditions;
        if (s.activeField === key) {
          console.info(`injectParams: skipped field ${key} (user is editing)`);
          continue;
        }
        const r = validateParam(key, v!);
        if (!r.valid && r.level === "error") {
          console.warn(`injectParams: rejected ${key}=${v}: ${r.message}`);
          continue;
        }
        newIC = { ...newIC, [key]: v };
      }
    }

    set({ params: { ...s.params, ...updates }, initialConditions: newIC });
  },

  setActiveField: (field) => {
    if (field === null) {
      // 失焦：若当前有 error 值，回滚
      const s = get();
      if (s.activeField && s.fieldErrors[s.activeField]?.level === "error") {
        // 不更新——值已在 setParam/setInitialCondition 中被拒绝，保持旧值
        const newErrors = { ...s.fieldErrors };
        delete newErrors[s.activeField];
        // 检查是否还有其他 error
        const hasOtherErrors = Object.values(newErrors).some(
          (e) => e.level === "error",
        );
        set({
          activeField: null,
          fieldErrors: newErrors,
          isSceneFrozen: hasOtherErrors,
        });
      } else {
        set({ activeField: null });
      }
    } else {
      set({ activeField: field });
    }
  },

  resetToDefaults: () => {
    const s = get();
    const t1 = DEFAULT_INITIAL_CONDITIONS.theta1;
    const t2 = DEFAULT_INITIAL_CONDITIONS.theta2;
    // 用当前用户设置的 L1/L2 计算默认初始角对应的笛卡尔位置
    const L1 = s.params.L1;
    const L2 = s.params.L2;
    const nx1 = L1 * Math.sin(t1);
    const ny1 = -L1 * Math.cos(t1);
    const nx2 = nx1 + L2 * Math.sin(t2);
    const ny2 = ny1 - L2 * Math.cos(t2);

    set({
      // params 保留用户设置，不覆盖
      initialConditions: { ...DEFAULT_INITIAL_CONDITIONS },
      method: DEFAULT_METHOD,
      fieldErrors: {},
      isSceneFrozen: false,
      paramsDirty: false,
      activeField: null,
      energyInitial: null,
      energyDrift: 0,
      driftExceeded: false,
      energyMin: 0,
      energyMax: 0,
      isSimulationActive: false,
      consumedFrameIndex: 0,
      energyCorrection: 0,
      lyapunovExponent: 0,
      _nanSkipCount: 0,
      _lastDamping: NaN,
      _energyResetGeneration: s.resetTrigger + 1,
      _stoppedFrameCount: 0,
      isPendulumStopped: false,
      isRunning: false,
      runPhase: "idle",
      resetTrigger: s.resetTrigger + 1,
      // 同步更新笛卡尔坐标以立即反映默认位置（Scene3D 暂停时直接消费）
      x1: nx1, y1: ny1, x2: nx2, y2: ny2,
      theta1: t1, theta1Dot: 0,
      theta2: t2, theta2Dot: 0,
      kineticEnergy: 0, potentialEnergy: 0, totalEnergy: 0,
      alpha1: 0, alpha2: 0,
      state: {
        theta1: t1,
        omega1: 0,
        theta2: t2,
        omega2: 0,
      },
    });
  },

  /** 以面板当前值重置仿真（不改动滑块），用于"更改后重置"流程 */
  applyCurrentSettings: () => {
    const s = get();
    const t1 = s.initialConditions.theta1;
    const t2 = s.initialConditions.theta2;
    const L1 = s.params.L1;
    const L2 = s.params.L2;
    const nx1 = L1 * Math.sin(t1);
    const ny1 = -L1 * Math.cos(t1);
    const nx2 = nx1 + L2 * Math.sin(t2);
    const ny2 = ny1 - L2 * Math.cos(t2);

    set({
      paramsDirty: false,
      fieldErrors: {},
      isSceneFrozen: false,
      activeField: null,
      energyInitial: null,
      energyDrift: 0,
      driftExceeded: false,
      energyMin: 0,
      energyMax: 0,
      isSimulationActive: false,
      consumedFrameIndex: 0,
      energyCorrection: 0,
      lyapunovExponent: 0,
      _nanSkipCount: 0,
      _lastDamping: NaN,
      _energyResetGeneration: s.resetTrigger + 1,
      _stoppedFrameCount: 0,
      isPendulumStopped: false,
      isRunning: false,
      runPhase: "idle",
      resetTrigger: s.resetTrigger + 1,
      x1: nx1, y1: ny1, x2: nx2, y2: ny2,
      theta1: t1, theta1Dot: 0,
      theta2: t2, theta2Dot: 0,
      kineticEnergy: 0, potentialEnergy: 0, totalEnergy: 0,
      alpha1: 0, alpha2: 0,
      state: {
        theta1: t1,
        omega1: 0,
        theta2: t2,
        omega2: 0,
      },
    });
  },

  clearFieldErrors:() => set({ fieldErrors: {}, isSceneFrozen: false }),

  setPanelExpanded: (expanded) => set({ isPanelExpanded: expanded }),
});

// ─── 帧缓冲区工具函数 ──────────────────────────

export function readFrameField(
  buffer: Float64Array,
  frameIndex: number,
  fieldOffset: number,
): number {
  return buffer[frameIndex * FRAME_STRIDE + fieldOffset]!;
}

export function getFrameSlice(
  buffer: Float64Array,
  frameIndex: number,
): Float64Array {
  const start = frameIndex * FRAME_STRIDE;
  return buffer.subarray(start, start + FRAME_STRIDE);
}
