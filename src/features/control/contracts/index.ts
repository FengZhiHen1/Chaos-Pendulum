/**
 * control.contracts — 参数面板与模式导航功能域的契约聚合出口。
 *
 * 提供 2 大契约：
 * 1. parameter-panel: 双模式参数输入（连续即时 vs 初始条件预览松手复位）、
 *    合法性校验、预设管理、静默注入
 * 2. navigation: 四模式切换、跨模式状态保持、键盘快捷键、响应式外壳、故事模式锁定
 *
 * 核心接口：
 *   - IParameterController: 参数控制器（setParam / applyPreset / injectParams）
 *   - IParameterValidator: 参数校验器（validate / validateAll）
 *   - IParameterPreview: 初始条件半透明预览摆状态
 *   - INavigationController: 导航控制器（switchTo / lock / unlock）
 *   - IResponsiveShell: 响应式布局外壳（三端自适应）
 *   - IKeyboardShortcuts: 全局键盘快捷键（1-4 / Space / R）
 *
 * 常量：
 *   - BREAKPOINTS: 响应式断点 { desktop: 1024, tablet: 768 }
 *   - NAV_BAR_HEIGHT: 导航栏高度 48px
 *   - CONTROL_PANEL_WIDTH: 控制面板宽度 320px
 *
 * 异常：
 *   - InvalidParameterError: 参数违反硬约束
 *   - NavigationLockedError: 故事模式锁定期间切换被拒
 *
 * Usage:
 *     import { IParameterController, IParameterValidator } from "@/features/control/contracts";
 *     import { INavigationController } from "@/features/control/contracts";
 */

// ─── 参数面板 ─────────────────────────────────
export type {
  ParameterCategory,
  IParameterValidator,
  IParameterController,
  IParameterPreview,
} from "./parameter-panel.contract";

// ─── 导航系统 ─────────────────────────────────
export type {
  INavigationController,
  IResponsiveShell,
  IKeyboardShortcuts,
} from "./navigation.contract";
export { BREAKPOINTS, NAV_BAR_HEIGHT, CONTROL_PANEL_WIDTH } from "./navigation.contract";

// ─── 异常 ─────────────────────────────────────
export { InvalidParameterError, NavigationLockedError } from "./exceptions";
