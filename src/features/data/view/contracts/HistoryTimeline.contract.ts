/**
 * Props 衔接契约 — useHistoryPlaybackViewModel（ViewModel 层）与 HistoryTimeline（View 层）的双向约定。
 *
 * ViewModel 层（useHistoryPlaybackViewModel）承诺:
 *   - playback.currentTime 反映当前回放位置 (s)
 *   - playback.totalTime = RingBuffer 覆盖的总时长 (s)
 *   - playback.ringBufferSize / ringBufferCapacity 指示可用历史范围
 *   - isSeeking = true 时用户已拖拽到非实时位置
 *   - isForkActive = true 时分叉 Worker 已创建且幽灵尾迹显示中
 *   - ghostTrail 包含透明度/颜色/轨迹数据（null = 无活跃分叉）
 *
 * View 层（HistoryTimeline — 由 frontend-visual 实现）承诺:
 *   - 渲染水平可拖拽时间轴（范围 [0, totalTime]）
 *   - 拖拽时调用 seekTo(time) —— 触发 debounce 250ms
 *   - isSeeking = true 时高亮时间轴位置，显示"回到实时"按钮
 *   - isForkActive = true 时显示幽灵尾迹图例和"取消分叉"按钮
 *   - fork 操作前弹出参数修改面板（让用户修改 modifiedParams）
 *   - isLoading = true 时禁用所有交互
 *   - 不直接读取 RingBuffer——所有历史数据通过 ViewModel 获取
 */

import type { HistoryPlaybackViewModel } from "../../viewModel/hooks/useHistoryPlaybackViewModel";

export interface HistoryTimelineProps {
  /** 全部 ViewModel 状态 + 操作 */
  viewModel: HistoryPlaybackViewModel;
}
