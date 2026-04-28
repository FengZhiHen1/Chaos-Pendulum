import { create } from "zustand";

type ValidationStatus = "idle" | "running" | "passed" | "failed";
type CoordinateSystem = "cartesian" | "polar" | "natural";

interface LabState {
  activeTemplate: string | null;
  userCode: string;
  codeStatus: "idle" | "running" | "error" | "success";
  codeError: string | null;
  validationResults: { smallAngle: ValidationStatus; singlePendulum: ValidationStatus; energy: ValidationStatus };
  coordinateSystem: CoordinateSystem;
  reportGenerating: boolean;

  setUserCode: (code: string) => void;
  setCodeStatus: (status: LabState["codeStatus"]) => void;
  setCodeError: (error: string | null) => void;
  setValidationResult: (test: keyof LabState["validationResults"], status: ValidationStatus) => void;
  setCoordinateSystem: (sys: CoordinateSystem) => void;
  setReportGenerating: (generating: boolean) => void;
}

export const useLabStore = create<LabState>((set) => ({
  activeTemplate: null,
  userCode: "",
  codeStatus: "idle",
  codeError: null,
  validationResults: { smallAngle: "idle", singlePendulum: "idle", energy: "idle" },
  coordinateSystem: "cartesian",
  reportGenerating: false,

  setUserCode: (userCode) => set({ userCode }),
  setCodeStatus: (codeStatus) => set({ codeStatus }),
  setCodeError: (codeError) => set({ codeError }),
  setValidationResult: (test, status) =>
    set((s) => ({ validationResults: { ...s.validationResults, [test]: status } })),
  setCoordinateSystem: (coordinateSystem) => set({ coordinateSystem }),
  setReportGenerating: (reportGenerating) => set({ reportGenerating }),
}));
