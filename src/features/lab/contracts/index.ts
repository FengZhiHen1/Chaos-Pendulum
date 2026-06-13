/**
 * lab.contracts — 受力拆解视图 + 物理验证套件功能域的契约聚合出口。
 *
 * LAB-01 受力拆解：
 *   - IForceDecompositionController: 受力拆解控制器
 *   - FORCE_ARROW_REGISTRY: 8 个力矢量箭头定义
 *   - FORCE_DISPLAY_COLORS / FORCE_DECOMPOSITION_DEFAULTS
 *
 * LAB-02 物理验证：
 *   - IValidationRunner / IValidationController: 验证运行器+生命周期
 *   - ValidationTestKey / ValidationStatus / IValidationResult: 类型定义
 *   - VALIDATION_THRESHOLDS / VALIDATION_DEFAULTS: 阈值常量
 *
 * Usage:
 *     import { IForceDecompositionController, IValidationRunner } from "@/features/lab/contracts";
 */

// ─── LAB-01 受力拆解 ──────────────────────────
export type {
  ForceKind,
  CoordinateSystem,
  IForceArrowMeta,
  IForceTooltipData,
  IForceDecompositionController,
} from "./force-decomposition.contract";
export {
  FORCE_ARROW_REGISTRY,
  FORCE_DISPLAY_COLORS,
  FORCE_DECOMPOSITION_DEFAULTS,
} from "./force-decomposition.contract";

// ─── LAB-02 物理验证 ──────────────────────────
export type {
  ValidationTestKey,
  ValidationStatus,
  IValidationResult,
  IValidationRunner,
  IValidationController,
} from "./physics-validation.contract";
export {
  VALIDATION_THRESHOLDS,
  VALIDATION_DEFAULTS,
} from "./physics-validation.contract";

// ─── LAB-03 可编程沙箱 ─────────────────────────
export type {
  SandboxTemplateId,
  ISandboxTemplate,
  ISandboxExecutionResult,
  ISandboxRunner,
  ISandboxController,
} from "./programmable-sandbox.contract";
export {
  SANDBOX_TEMPLATES,
  ERROR_TRANSLATIONS,
  SANDBOX_DEFAULTS,
} from "./programmable-sandbox.contract";
