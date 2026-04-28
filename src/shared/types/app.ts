export type AppMode = "explore" | "analyze" | "lab" | "story";

export type DeviceType = "desktop" | "tablet" | "mobile";

export type LoadingState = "loading" | "ready" | "error";

export interface SnapshotMeta {
  id: string;
  timestamp: string;
  label?: string;
  thumbnail: string;
}

/** 单个模式的定义元数据 */
export interface ModeDefinition {
  id: AppMode;
  label: string;
  shortLabel: string;
  iconName: "Compass" | "BarChart3" | "FlaskConical" | "Play";
  shortcut: "1" | "2" | "3" | "4";
  tooltip: string;
}

/** 所有模式的元数据注册表（不可变常量） */
export const MODE_REGISTRY: ModeDefinition[] = [
  {
    id: "explore",
    label: "探索模式",
    shortLabel: "探索",
    iconName: "Compass",
    shortcut: "1",
    tooltip: "3D 实时仿真与感官认知 · 快捷键 1",
  },
  {
    id: "analyze",
    label: "分析模式",
    shortLabel: "分析",
    iconName: "BarChart3",
    shortcut: "2",
    tooltip: "科研级诊断工具 · 快捷键 2",
  },
  {
    id: "lab",
    label: "实验模式",
    shortLabel: "实验",
    iconName: "FlaskConical",
    shortcut: "3",
    tooltip: "教学闭环与可编程沙箱 · 快捷键 3",
  },
  {
    id: "story",
    label: "故事模式",
    shortLabel: "故事",
    iconName: "Play",
    shortcut: "4",
    tooltip: "评审专用一键演示 · 快捷键 4",
  },
];
