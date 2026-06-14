/**
 * Props 衔接契约 — useSnapshotViewModel（ViewModel 层）与 SnapshotManager（View 层）的双向约定。
 *
 * ViewModel 层（useSnapshotViewModel）承诺:
 *   - snapshots 按时间戳降序排列
 *   - isSaving = true 时禁止重复调用 saveSnapshot
 *   - error 在下次操作时自动清除（saveSnapshot/loadSnapshot/compareSnapshots 中调用 clearError）
 *   - selectedSnapshot 为 null 表示未选中，非 null 表示已加载完整实体
 *
 * View 层（SnapshotManager — 由 frontend-visual 实现）承诺:
 *   - 在调用 saveSnapshot 之前，确认 Canvas 和参数数据就绪
 *   - isSaving = true 时禁用保存按钮 + 显示加载指示器
 *   - error 非 null 时展示错误信息，提供手动关闭
 *   - 不直接读取 IndexedDB——所有数据通过 ViewModel Hook 获取
 *   - 快照卡片列表使用 SnapshotMeta 的 thumbnail 渲染 64px 缩略图
 */

import type { SnapshotViewModel } from "../../viewModel/hooks/useSnapshotViewModel";

export interface SnapshotManagerProps {
  /** 全部 ViewModel 状态 + 操作 */
  viewModel: SnapshotViewModel;
}
