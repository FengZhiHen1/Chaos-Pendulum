/**
 * story 功能域的 barrel 出口。
 *
 * 从 data/contracts 导出故事脚本接口供故事页面消费。
 */

export { useStoryStore } from "./store";

// 从 data/contracts 导出故事脚本契约
export { StoryScriptEngine } from "@/features/data/contracts";
export type { IStoryScriptRepository, StoryStage, StoryPlaybackState } from "@/features/data/contracts";
export { StoryScriptError } from "@/features/data/contracts";

// 从 data 模块导出实现
export { StoryScriptEngineImpl, storyScriptRepository } from "@/features/data";
