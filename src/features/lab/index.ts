export { useLabStore } from "./store";
export { LabPage } from "./LabPage";
export { ForceArrows3D } from "./components/ForceArrows3D";
export { DecompositionPanel } from "./components/DecompositionPanel";

// ─── Contracts — LAB-01 + LAB-02 ────────────────
export type {
  ForceKind,
  CoordinateSystem,
  IForceDecompositionController,
  ValidationTestKey,
  ValidationStatus,
  IValidationResult,
  IValidationRunner,
  IValidationController,
} from "./contracts";
export {
  FORCE_ARROW_REGISTRY,
  FORCE_DISPLAY_COLORS,
  FORCE_DECOMPOSITION_DEFAULTS,
  VALIDATION_THRESHOLDS,
  VALIDATION_DEFAULTS,
} from "./contracts";
