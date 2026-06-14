/**
 * DemoModeIndicator — 演示模式状态指示器。
 *
 * 在演示模式激活时不渲染控件（仅场景水印可见）。
 * 空闲检测中时显示等待提示，支持一键激活/退出。
 *
 * 边界:
 *   - 依赖: useDemoModeViewModel (ViewModel Hook)
 *   - 被依赖: AppShell (全局布局)
 * 禁止: import application/domain/infrastructure
 */

import type { DemoModeIndicatorProps } from "../contracts/DemoModeIndicator.contract";

export function DemoModeIndicator({ viewModel }: DemoModeIndicatorProps) {
  const {
    isActive,
    isIdleDetectionActive,
    isTransitioning,
    error,
    activate,
    clearError,
  } = viewModel;

  // 演示模式激活时——不渲染任何 UI 控件
  if (isActive) {
    return null;
  }

  const hasError = error !== null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* 错误提示 */}
      {hasError && (
        <div
          className="rounded-lg px-4 py-3 text-sm max-w-xs animate-in slide-in-from-bottom-2"
          style={{
            background: "rgba(35,38,44,0.92)",
            backdropFilter: "blur(18px)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          }}
        >
          <div className="flex items-start gap-3">
            <span className="text-red-400 shrink-0 mt-0.5">⚠</span>
            <div>
              <p className="text-on-surface text-xs font-medium mb-0.5">
                演示模式错误
              </p>
              <p className="text-on-surface-variant text-xs leading-relaxed">
                {error.message}
              </p>
            </div>
            <button
              type="button"
              onClick={clearError}
              className="text-on-surface-variant hover:text-on-surface text-xs shrink-0"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* 空闲检测指示器 */}
      {isIdleDetectionActive && (
        <div className="flex items-center gap-2 text-on-surface-variant text-xs">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span>等待无人操作…</span>
        </div>
      )}

      {/* 激活按钮 */}
      <button
        type="button"
        onClick={activate}
        disabled={isTransitioning}
        className={`
          inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium
          transition-all duration-200
          bg-primary-container text-primary
          hover:bg-primary hover:text-on-surface
          disabled:opacity-50 disabled:cursor-not-allowed
        `}
      >
        {isTransitioning ? (
          <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        ) : (
          <span className="text-base leading-none">⊡</span>
        )}
        <span>演示模式</span>
      </button>
    </div>
  );
}
