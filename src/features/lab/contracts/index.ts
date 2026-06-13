/**
 * lab.contracts — 受力拆解视图功能域的契约聚合出口。
 *
 * 核心接口：
 *   - IForceDecompositionController: 受力拆解控制器
 *   - FORCE_ARROW_REGISTRY: 8 个力矢量箭头定义（上/下摆×重/张/惯切/惯法）
 *   - FORCE_DISPLAY_COLORS: 力矢量颜色方案
 *
 * 常量：
 *   - FORCE_DECOMPOSITION_DEFAULTS: 箭头几何参数 + 移动端降级
 *
 * Usage:
 *     import { IForceDecompositionController } from "@/features/lab/contracts";
 *     import { FORCE_ARROW_REGISTRY, FORCE_DISPLAY_COLORS } from "@/features/lab/contracts";
 */

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
