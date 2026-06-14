/**
 * Props 衔接契约 — useExportViewModel（ViewModel 层）与 ExportPanel（View 层）的双向约定。
 *
 * ViewModel 层（useExportViewModel）承诺:
 *   - selectedFormat 始终为有效值（csv | json | png）
 *   - isExporting = true 时不接受新的导出请求
 *   - isBrowserSupported = false 时所有导出操作自动失败
 *   - isComplete 在下次 setFormat 或 export* 调用时重置为 false
 *
 * View 层（ExportPanel — 由 frontend-visual 实现）承诺:
 *   - 根据 selectedFormat 展示不同的配置 UI（CSV: 无额外配置, JSON: metadata 预览, PNG: 分辨率选择器）
 *   - isExporting = true 时禁用所有按钮 + 显示进度指示器
 *   - isComplete = true 时显示成功提示
 *   - error 非 null 时展示错误信息
 *   - isBrowserSupported = false 时展示"浏览器不支持导出"警告
 *   - 不直接操作 Blob/URL——所有导出通过 ViewModel 的方法
 */

import type { ExportViewModel } from "../../viewModel/hooks/useExportViewModel";

export interface ExportPanelProps {
  /** 全部 ViewModel 状态 + 操作 */
  viewModel: ExportViewModel;
}
