/**
 * Props 衔接契约 — useDemoModeViewModel（ViewModel 层）与 DemoModeIndicator（View 层）的双向约定。
 *
 * ViewModel 层（useDemoModeViewModel）承诺:
 *   - isActive = true 时所有 UI 控件已隐藏 + autoRotate 已启动 + 水印已显示
 *   - isTransitioning = true 时正在执行激活/退出的过渡动画
 *   - isIdleDetectionActive = true 时空闲超时检测已注册（config.idleTimeout > 0 时有效）
 *   - error 包含激活/退出失败的具体原因
 *
 * View 层（DemoModeIndicator — 由 frontend-visual 实现）承诺:
 *   - 演示模式激活时不渲染任何控制按钮（仅场景角落水印可见）
 *   - 检测到用户交互（点击/按键/触摸）时调用 deactivate()
 *   - isTransitioning = true 时渲染过渡动画
 *   - 在页面卸载时调用 stopIdleDetection()
 *   - 不直接操作 DOM 可见性或 Three.js OrbitControls
 */

import type { DemoModeViewModel } from "../../viewModel/hooks/useDemoModeViewModel";

export interface DemoModeIndicatorProps {
  /** 全部 ViewModel 状态 + 操作 */
  viewModel: DemoModeViewModel;
}
