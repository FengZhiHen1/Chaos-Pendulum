export { useLabStore } from "./store";
export { LabPage } from "./view/pages/LabPage";
export { ForceArrows3D } from "./view/components/ForceArrows3D";
export { DecompositionPanel } from "./view/components/DecompositionPanel";
export { SandboxPanel } from "./view/components/SandboxPanel";

// Pyodide 缓存（从 infrastructure 重导出）
export {
  getCachedPyodide,
  cachePyodideResource,
  buildPyodideCdnUrl,
  cleanupStalePyodideCache,
} from "./infrastructure/pyodideCache";

// ─── Contracts — LAB-01 + LAB-02 + LAB-03 ───────
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
