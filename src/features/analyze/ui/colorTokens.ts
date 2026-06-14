/**
 * 模块: analyze.view.colorTokens
 * 职责: 将 DESIGN.md 颜色 token 导出为 Canvas / R3F 可用的 hex 常量，
 *       避免在组件中裸写十六进制值。
 * 边界:
 *   - 仅包含颜色常量，无逻辑
 *   - 所有颜色必须与 DESIGN.md token 一一对应
 */

export const SURFACE = "#1A1D22";
export const SURFACE_CONTAINER = "#2A2D34";
export const SURFACE_CONTAINER_HIGH = "#31353D";
export const ON_SURFACE = "#E8EAED";
export const ON_SURFACE_VARIANT = "#9BA0AA";
export const PRIMARY = "#4B9FFF";
export const ON_PRIMARY = "#0D1117";
export const TERTIARY = "#2DD4BF";
export const LYAPUNOV_STABLE = "#1E3A5F";
export const LYAPUNOV_NEUTRAL = "#2DD4BF";
export const LYAPUNOV_CHAOTIC = "#F97316";
export const SEPARATION_ALERT = "#FF3B3B";
export const WHITE = "#FFFFFF";

export const SEMANTIC_GRADIENT = [LYAPUNOV_STABLE, LYAPUNOV_NEUTRAL, LYAPUNOV_CHAOTIC] as const;
