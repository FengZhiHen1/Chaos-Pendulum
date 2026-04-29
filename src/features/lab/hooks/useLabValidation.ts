import { useCallback, useMemo } from "react";
import { useLabStore } from "../store";
import { runAllValidations } from "../validation-runner";

export interface UseLabValidationAPI {
  validationResults: Record<string, "idle" | "running" | "passed" | "failed">;
  validationDetails: Record<string, string>;
  isRunning: boolean;
  allPassed: boolean;
  anyHasRun: boolean;
  handleRunValidation: () => void;
}

export function useLabValidation(): UseLabValidationAPI {
  const validationResults = useLabStore((s) => s.validationResults);
  const validationDetails = useLabStore((s) => s.validationDetails);
  const validationRunning = useLabStore((s) => s.validationRunning);
  const allPassed = useLabStore((s) => s.allPassed);
  const setValidationResult = useLabStore((s) => s.setValidationResult);
  const setValidationDetail = useLabStore((s) => s.setValidationDetail);
  const setValidationRunning = useLabStore((s) => s.setValidationRunning);
  const setAllPassed = useLabStore((s) => s.setAllPassed);

  const handleRunValidation = useCallback(() => {
    setValidationRunning(true);
    setValidationResult("smallAngle", "running");
    setValidationResult("singlePendulum", "running");
    setValidationResult("energy", "running");
    setAllPassed(false);

    setTimeout(() => {
      const results = runAllValidations("RKF45");
      let allOk = true;
      for (const r of results) {
        setValidationResult(r.test, r.passed ? "passed" : "failed");
        setValidationDetail(r.test, r.detail);
        if (!r.passed) allOk = false;
      }
      setAllPassed(allOk);
      setValidationRunning(false);
    }, 50);
  }, [setValidationResult, setValidationDetail, setValidationRunning, setAllPassed]);

  const anyHasRun = useMemo(
    () => Object.values(validationResults).some((s) => s !== "idle"),
    [validationResults],
  );

  return {
    validationResults,
    validationDetails,
    isRunning: validationRunning,
    allPassed,
    anyHasRun,
    handleRunValidation,
  };
}
