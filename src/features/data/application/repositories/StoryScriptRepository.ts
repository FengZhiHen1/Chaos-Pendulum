/**
 * 模块: data.application.repositories.StoryScriptRepository
 * 职责: IStoryScriptRepository 的实现——从硬编码常量加载 7 阶段故事脚本。
 *       脚本数据从 story/domain/valueObjects/storyScript.ts 迁移而来。
 * 依赖: StoryStage 类型 (contracts), AppMode (shared)
 */

import type { IStoryScriptRepository, StoryStage } from "../../contracts";
import { StoryScriptError } from "../../contracts";
import { STORY_TOTAL_DURATION, STORY_STAGE_COUNT } from "../../contracts";
import type { AppMode } from "@/shared/domain/valueObjects";

/**
 * 硬编码的 7 阶段故事脚本——总时长 210s (3 分 30 秒)。
 *
 * 每个阶段包含完整的 startTime/duration/targetMode/subtitle。
 * 阶段间按 startTime 单调递增，无缝衔接。
 */
/**
 * 硬编码的 7 阶段故事脚本——总时长 210s (3 分 30 秒)。
 *
 * 每个阶段包含完整的 startTime/duration/targetMode/subtitle。
 * 阶段间按 startTime 单调递增，无缝衔接。
 *
 * 相机坐标系：azimuth = 方位角 (rad, 绕 Y 轴)，elevation = 仰角 (rad, 水平面上方)，
 * distance = 距目标距离。Front view: azimuth≈0, elevation≈0.3, distance≈3.5
 */
const STORY_SCRIPT_DATA: StoryStage[] = [
  {
    startTime: 0,
    duration: 25,
    targetMode: "explore" as AppMode,
    subtitle: "一个摆，我们知道它会在哪里",
    highlightedControls: ["sim-controls"],
    cameraConfig: { azimuth: 0.2, elevation: 0.35, distance: 3.0 },
  },
  {
    startTime: 25,
    duration: 25,
    targetMode: "explore" as AppMode,
    subtitle: "再加一个摆，世界变得不可预测",
    highlightedControls: ["param-panel"],
    cameraConfig: { azimuth: 0.6, elevation: 0.25, distance: 4.5 },
  },
  {
    startTime: 50,
    duration: 40,
    targetMode: "explore" as AppMode,
    subtitle: "初始差异仅 0.001°，30 秒后它们形同陌路",
    highlightedControls: ["butterfly-btn"],
    cameraConfig: { azimuth: 1.2, elevation: 0.4, distance: 3.5 },
    params: { damping: 0.0 },
  },
  {
    startTime: 90,
    duration: 30,
    targetMode: "explore" as AppMode,
    subtitle: "混沌不仅能看见，还能听见",
    highlightedControls: ["sonification-toggle"],
    cameraConfig: { azimuth: 2.0, elevation: 0.6, distance: 4.0 },
  },
  {
    startTime: 120,
    duration: 30,
    targetMode: "analyze" as AppMode,
    subtitle: "这不是随机，是有结构的复杂",
    highlightedControls: ["analysis-tabs"],
  },
  {
    startTime: 150,
    duration: 30,
    targetMode: "explore" as AppMode,
    subtitle: "甚至计算机也无法让混沌回头",
    highlightedControls: ["time-reversal"],
    cameraConfig: { azimuth: 3.5, elevation: 0.3, distance: 3.5 },
  },
  {
    startTime: 180,
    duration: 30,
    targetMode: "explore" as AppMode,
    subtitle: "确定性系统的内在随机性——这就是混沌",
    highlightedControls: ["sim-controls"],
    cameraConfig: { azimuth: 4.5, elevation: 0.15, distance: 5.0 },
  },
];

/**
 * 故事脚本仓储实现。
 *
 * 当前使用硬编码常量加载脚本。
 * 未来可替换为远程 API 或 IndexedDB 加载。
 */
export class StoryScriptRepository implements IStoryScriptRepository {
  /**
   * 加载完整故事脚本。
   * @returns 7 阶段故事脚本
   * @throws StoryScriptError — 脚本为空或阶段数不足
   */
  async loadScript(): Promise<StoryStage[]> {
    if (STORY_SCRIPT_DATA.length === 0) {
      throw new StoryScriptError(
        "STORY_SCRIPT_INVALID",
        "故事脚本数据为空",
        "StoryScriptRepository.loadScript()",
        -1,
      );
    }
    if (STORY_SCRIPT_DATA.length !== STORY_STAGE_COUNT) {
      throw new StoryScriptError(
        "STORY_SCRIPT_INVALID",
        `故事脚本阶段数不匹配: 期望 ${STORY_STAGE_COUNT}, 实际 ${STORY_SCRIPT_DATA.length}`,
        "StoryScriptRepository.loadScript()",
        -1,
      );
    }
    // 返回防御性拷贝（显式构造以确保类型安全）
    return STORY_SCRIPT_DATA.map((stage) => ({
      startTime: stage.startTime,
      duration: stage.duration,
      targetMode: stage.targetMode,
      subtitle: stage.subtitle,
      highlightedControls: [...stage.highlightedControls],
      cameraConfig: stage.cameraConfig ? { ...stage.cameraConfig } : undefined,
      params: stage.params ? { ...stage.params } : undefined,
    }));
  }

  /**
   * 获取指定阶段的详情。
   * @throws StoryScriptError — 索引越界
   */
  async getStage(index: number): Promise<StoryStage> {
    if (index < 0 || index >= STORY_SCRIPT_DATA.length) {
      throw new StoryScriptError(
        "STORY_STAGE_TRANSITION",
        `阶段索引越界: ${index} (有效范围: 0-${STORY_SCRIPT_DATA.length - 1})`,
        "StoryScriptRepository.getStage()",
        index,
      );
    }
    const stage = STORY_SCRIPT_DATA[index];
    if (!stage) {
      throw new StoryScriptError(
        "STORY_STAGE_TRANSITION",
        `阶段索引越界: ${index} (有效范围: 0-${STORY_SCRIPT_DATA.length - 1})`,
        "StoryScriptRepository.getStage()",
        index,
      );
    }
    return {
      startTime: stage.startTime,
      duration: stage.duration,
      targetMode: stage.targetMode,
      subtitle: stage.subtitle,
      highlightedControls: [...stage.highlightedControls],
      cameraConfig: stage.cameraConfig ? { ...stage.cameraConfig } : undefined,
      params: stage.params ? { ...stage.params } : undefined,
    };
  }

  /** 脚本总阶段数。 */
  getStageCount(): number {
    return STORY_SCRIPT_DATA.length;
  }

  /** 脚本总时长 (s)。 */
  getTotalDuration(): number {
    return STORY_TOTAL_DURATION;
  }
}

/** 全局单例故事脚本仓储 */
export const storyScriptRepository: IStoryScriptRepository = new StoryScriptRepository();
