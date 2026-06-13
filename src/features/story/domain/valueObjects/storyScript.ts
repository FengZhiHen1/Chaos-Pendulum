import type { AppMode } from "@/shared/domain/valueObjects";

export interface StoryStage {
  startTime: number;
  duration: number;
  targetMode: AppMode;
  subtitle: string;
}

export const STORY_SCRIPT: StoryStage[] = [
  { startTime: 0, duration: 25, targetMode: "explore", subtitle: "一个摆，我们知道它会在哪里" },
  { startTime: 25, duration: 25, targetMode: "explore", subtitle: "再加一个摆，世界变得不可预测" },
  { startTime: 50, duration: 40, targetMode: "explore", subtitle: "初始差异仅 0.001°，30 秒后它们形同陌路" },
  { startTime: 90, duration: 30, targetMode: "explore", subtitle: "混沌不仅能看见，还能听见" },
  { startTime: 120, duration: 30, targetMode: "analyze", subtitle: "这不是随机，是有结构的复杂" },
  { startTime: 150, duration: 30, targetMode: "explore", subtitle: "甚至计算机也无法让混沌回头" },
  { startTime: 180, duration: 30, targetMode: "explore", subtitle: "确定性系统的内在随机性——这就是混沌" },
];
