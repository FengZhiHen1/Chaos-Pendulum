import { create } from "zustand";
import type {
  PendulumParams,
  InitialConditions,
  IntegratorMethod,
  ParamPreset,
  ParamFieldMeta,
  ValidationResult,
} from "@/shared/types";
import {
  DEFAULT_PARAMS,
  DEFAULT_INITIAL_CONDITIONS,
  DEFAULT_METHOD,
  PARAM_META,
} from "@/shared/types";
import { FRAME_STRIDE, FRAMES_PER_BATCH, FrameField } from "@/shared/types";

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

// ─── Store 类型 ─────────────────────────────────

interface SimulationState extends SimulationFrame {
  // 参数
  params: PendulumParams;
  initialConditions: InitialConditions;
  method: IntegratorMethod;
  paramMeta: ParamFieldMeta[];

  // 仿真运行
  isRunning: boolean;
  engineError: string | null;

  // 参数面板 UI
  activeField: string | null;
  fieldErrors: Record<string, ValidationResult>;
  isSceneFrozen: boolean;
  isPanelExpanded: boolean;

  // ── SIM-01 Actions ──
  setParams: (patch: Partial<PendulumParams>) => void;
  setMethod: (method: IntegratorMethod) => void;
  setRunning: (running: boolean) => void;
  setEngineError: (error: string | null) => void;
  consumeFrameFromBuffer: (buffer: Float64Array, frameIndex: number) => void;

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
  clearFieldErrors: () => void;
  setPanelExpanded: (expanded: boolean) => void;
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

// ─── Store 创建 ─────────────────────────────────

export const useSimulationStore = create<SimulationState>((set, get) => ({
  ...defaultFrame,
  params: { ...DEFAULT_PARAMS },
  initialConditions: { ...DEFAULT_INITIAL_CONDITIONS },
  method: DEFAULT_METHOD,
  paramMeta: PARAM_META,

  isRunning: false,
  engineError: null,

  activeField: null,
  fieldErrors: {},
  isSceneFrozen: false,
  isPanelExpanded: true,

  // ── SIM-01 Actions ──

  setParams: (patch) =>
    set((s) => ({ params: { ...s.params, ...patch } })),

  setMethod: (method) => set({ method }),

  setRunning: (isRunning) => set({ isRunning }),

  setEngineError: (engineError) => set({ engineError }),

  consumeFrameFromBuffer: (buffer, frameIndex) => {
    const offset = frameIndex * FRAME_STRIDE;
    if (offset + FRAME_STRIDE > buffer.length) return;
    set({
      t:              buffer[offset + FrameField.T]!,
      theta1:         buffer[offset + FrameField.THETA1]!,
      theta1Dot:      buffer[offset + FrameField.THETA1_DOT]!,
      theta2:         buffer[offset + FrameField.THETA2]!,
      theta2Dot:      buffer[offset + FrameField.THETA2_DOT]!,
      x1:             buffer[offset + FrameField.X1]!,
      y1:             buffer[offset + FrameField.Y1]!,
      x2:             buffer[offset + FrameField.X2]!,
      y2:             buffer[offset + FrameField.Y2]!,
      kineticEnergy:  buffer[offset + FrameField.KINETIC_ENERGY]!,
      potentialEnergy:buffer[offset + FrameField.POTENTIAL_ENERGY]!,
      totalEnergy:    buffer[offset + FrameField.TOTAL_ENERGY]!,
      alpha1:         buffer[offset + FrameField.ALPHA1]!,
      alpha2:         buffer[offset + FrameField.ALPHA2]!,
    });
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
    set({
      params: { ...DEFAULT_PARAMS },
      initialConditions: { ...DEFAULT_INITIAL_CONDITIONS },
      method: DEFAULT_METHOD,
      fieldErrors: {},
      isSceneFrozen: false,
      activeField: null,
    });
  },

  clearFieldErrors: () => set({ fieldErrors: {}, isSceneFrozen: false }),

  setPanelExpanded: (expanded) => set({ isPanelExpanded: expanded }),
}));

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

export const BATCH_PREFETCH_THRESHOLD = 0.8 * FRAMES_PER_BATCH;
