export { useLabStore } from "./store";
export { LabPage } from "./LabPage";
export { ForceArrows3D } from "./components/ForceArrows3D";
export { DecompositionPanel } from "./components/DecompositionPanel";

// ─── Contracts ──────────────────────────────────
export type {
  ForceKind,
  CoordinateSystem,
  IForceDecompositionController,
} from "./contracts";
export {
  FORCE_ARROW_REGISTRY,
  FORCE_DISPLAY_COLORS,
  FORCE_DECOMPOSITION_DEFAULTS,
} from "./contracts";
