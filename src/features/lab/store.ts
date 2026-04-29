import { create } from "zustand";
import type { ForceExtrema } from "@/shared/types";

type ValidationStatus = "idle" | "running" | "passed" | "failed";
type CoordinateSystem = "cartesian" | "polar" | "natural";
type ValidationTestKey = "smallAngle" | "singlePendulum" | "energy";

interface ForceHovered {
  forceType: string;
  massIndex: 1 | 2;
}

interface ForceDecompositionState {
  active: boolean;
  lastForceData: Float64Array | null;
  bufferIndex: number;
  extrema: ForceExtrema | null;
  hovered: ForceHovered | null;
}

interface LabState {
  activeTemplate: string | null;
  userCode: string;
  codeStatus: "idle" | "running" | "error" | "success";
  codeError: string | null;
  validationResults: Record<ValidationTestKey, ValidationStatus>;
  validationDetails: Record<ValidationTestKey, string>;
  validationRunning: boolean;
  allPassed: boolean;
  coordinateSystem: CoordinateSystem;
  reportGenerating: boolean;
  forceDecomposition: ForceDecompositionState;

  setUserCode: (code: string) => void;
  setCodeStatus: (status: LabState["codeStatus"]) => void;
  setCodeError: (error: string | null) => void;
  setValidationResult: (test: ValidationTestKey, status: ValidationStatus) => void;
  setValidationDetail: (test: ValidationTestKey, detail: string) => void;
  setValidationRunning: (running: boolean) => void;
  setAllPassed: (passed: boolean) => void;
  setCoordinateSystem: (sys: CoordinateSystem) => void;
  setReportGenerating: (generating: boolean) => void;
  setForceActive: (v: boolean) => void;
  setLastForceData: (data: Float64Array) => void;
  setForceExtrema: (e: ForceExtrema) => void;
  setForceHovered: (h: ForceHovered | null) => void;
  resetForceDecomposition: () => void;
}

const initialForceDecomposition: ForceDecompositionState = {
  active: false,
  lastForceData: null,
  bufferIndex: 0,
  extrema: null,
  hovered: null,
};

export const useLabStore = create<LabState>((set) => ({
  activeTemplate: null,
  userCode: "",
  codeStatus: "idle",
  codeError: null,
  validationResults: { smallAngle: "idle", singlePendulum: "idle", energy: "idle" },
  validationDetails: { smallAngle: "", singlePendulum: "", energy: "" },
  validationRunning: false,
  allPassed: false,
  coordinateSystem: "cartesian",
  reportGenerating: false,
  forceDecomposition: { ...initialForceDecomposition },

  setUserCode: (userCode) => set({ userCode }),
  setCodeStatus: (codeStatus) => set({ codeStatus }),
  setCodeError: (codeError) => set({ codeError }),
  setValidationResult: (test, status) =>
    set((s) => ({ validationResults: { ...s.validationResults, [test]: status } })),
  setValidationDetail: (test, detail) =>
    set((s) => ({ validationDetails: { ...s.validationDetails, [test]: detail } })),
  setValidationRunning: (validationRunning) => set({ validationRunning }),
  setAllPassed: (allPassed) => set({ allPassed }),
  setCoordinateSystem: (coordinateSystem) => set({ coordinateSystem }),
  setReportGenerating: (reportGenerating) => set({ reportGenerating }),

  setForceActive: (active) =>
    set((s) => ({ forceDecomposition: { ...s.forceDecomposition, active } })),
  setLastForceData: (lastForceData) =>
    set((s) => ({ forceDecomposition: { ...s.forceDecomposition, lastForceData, bufferIndex: 0 } })),
  setForceExtrema: (extrema) =>
    set((s) => ({ forceDecomposition: { ...s.forceDecomposition, extrema } })),
  setForceHovered: (hovered) =>
    set((s) => ({ forceDecomposition: { ...s.forceDecomposition, hovered } })),
  resetForceDecomposition: () =>
    set({ forceDecomposition: { ...initialForceDecomposition } }),
}));
