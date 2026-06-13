/**
 * 模块: explore.components.TeachingAnnotationPopup
 * 职责: 时间反演教学注释弹窗——数值反演漂移首次超过阈值时弹出，
 *       解释混沌不可逆性的计算物理原理。
 * 边界:
 *   - 依赖: 无外部依赖（纯表现组件）
 *   - 被依赖: TimeReversal (父组件)
 * 禁止行为:
 *   - 禁止在已关闭后自动重新弹出（由父组件的 annotationDismissed 状态控制）
 */

interface TeachingAnnotationPopupProps {
  visible: boolean;
  onClose: () => void;
}

export function TeachingAnnotationPopup({ visible, onClose }: TeachingAnnotationPopupProps) {
  if (!visible) return null;

  return (
    <div
      className="absolute left-1/2 transform -translate-x-1/2 z-30 rounded-xl px-5 py-4 max-w-sm"
      style={{
        bottom: "22%",
        background: "rgba(10, 10, 18, 0.93)",
        border: "1px solid rgba(255,255,255,0.12)",
        backdropFilter: "blur(10px)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-on-surface text-sm font-semibold mb-2">
            数值漂移 — 混沌的不可逆性
          </h3>
          <p className="text-gray-300 text-xs leading-relaxed">
            哈密顿系统理论上可逆，但混沌使计算机的浮点误差被指数放大——这就是初值敏感性的计算物理体现。正向积分时累积的舍入误差在反向积分中无法被"撤销"，反而被进一步放大。
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-500 hover:text-on-surface text-base leading-none shrink-0 mt-0.5"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
