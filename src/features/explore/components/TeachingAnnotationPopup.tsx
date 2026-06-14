interface TeachingAnnotationPopupProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * 时间反演教学注释弹窗。
 *
 * 数值反演漂移首次超过阈值时弹出，解释混沌不可逆性的计算物理原理。
 */
export function TeachingAnnotationPopup({ visible, onClose }: TeachingAnnotationPopupProps) {
  if (!visible) return null;

  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 z-30 max-w-sm rounded-xl border border-white/10
                 bg-surface-container-high/95 backdrop-blur px-5 py-4 shadow-floating-modal"
      style={{ bottom: "22%" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-on-surface text-sm font-semibold mb-2">
            数值漂移 — 混沌的不可逆性
          </h3>
          <p className="text-on-surface-variant text-xs leading-relaxed">
            哈密顿系统理论上可逆，但混沌使计算机的浮点误差被指数放大——这就是初值敏感性的计算物理体现。正向积分时累积的舍入误差在反向积分中无法被“撤销”，反而被进一步放大。
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-on-surface-variant/50 hover:text-on-surface text-base leading-none shrink-0 mt-0.5"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
