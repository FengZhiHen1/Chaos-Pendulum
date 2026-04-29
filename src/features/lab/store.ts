import { create } from "zustand";

type ValidationStatus = "idle" | "running" | "passed" | "failed";
type CoordinateSystem = "cartesian" | "polar" | "natural";
type ValidationTestKey = "smallAngle" | "singlePendulum" | "energy";

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

  setUserCode: (code: string) => void;
  setCodeStatus: (status: LabState["codeStatus"]) => void;
  setCodeError: (error: string | null) => void;
  setValidationResult: (test: ValidationTestKey, status: ValidationStatus) => void;
  setValidationDetail: (test: ValidationTestKey, detail: string) => void;
  setValidationRunning: (running: boolean) => void;
  setAllPassed: (passed: boolean) => void;
  setCoordinateSystem: (sys: CoordinateSystem) => void;
  setReportGenerating: (generating: boolean) => void;
}

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
}));
