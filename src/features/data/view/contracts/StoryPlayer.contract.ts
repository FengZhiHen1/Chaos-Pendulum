/**
 * Props 衔接契约 — useStoryViewModel（ViewModel 层）与 StoryPlayer（View 层）的双向约定。
 *
 * ViewModel 层（useStoryViewModel）承诺:
 *   - playback.isPlaying 从 play()/resume() 成功后变为 true，pause()/stop() 后变为 false
 *   - playback.progress ∈ [0, 1]，由 250ms 轮询自动更新
 *   - playback.currentSubtitle 在每个阶段切换时自动更新
 *   - playback.highlightedControls 随当前阶段变化
 *   - isLoading = true 仅出现在 play() 调用期间（脚本加载）
 *   - error 在下次操作时自动清除
 *
 * View 层（StoryPlayer — 由 frontend-visual 实现）承诺:
 *   - playback.isPlaying = true 时显示暂停按钮；false 时显示播放/继续按钮
 *   - 进度条使用 playback.progress 渲染，不可拖拽（故事模式自动推进）
 *   - 底部字幕使用 framer-motion 淡入淡出切换 playback.currentSubtitle
 *   - playback.highlightedControls 中的控件 ID 以脉冲动画高亮
 *   - 播放期间禁用模式切换（导航栏锁定）
 *   - 不直接读取故事脚本——所有数据通过 ViewModel 获取
 */

import type { StoryViewModel } from "../../viewModel/hooks/useStoryViewModel";

export interface StoryPlayerProps {
  /** 全部 ViewModel 状态 + 操作 */
  viewModel: StoryViewModel;
}
