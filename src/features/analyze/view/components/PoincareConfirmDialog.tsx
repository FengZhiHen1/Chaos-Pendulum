/**
 * 模块: analyze.ui.PoincareConfirmDialog
 * 职责: 庞加莱截面条件切换确认对话框。
 * 边界:
 *   - 纯展示组件，无业务逻辑
 *   - Props 驱动
 */

import { Button } from "@/shared/view/components/ui/button";

interface Props {
  pointCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PoincareConfirmDialog({ pointCount, onConfirm, onCancel }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-surface-container-low rounded-lg border border-white/[0.06] shadow-lg p-6 max-w-sm w-full mx-4">
        <h3 className="text-lg font-semibold text-on-surface mb-2">切换截面条件</h3>
        <p className="text-sm text-on-surface-variant mb-4">
          当前已有 {pointCount} 个采集点，切换条件将清空所有数据。是否继续？
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>取消</Button>
          <Button onClick={onConfirm}>确认</Button>
        </div>
      </div>
    </div>
  );
}
