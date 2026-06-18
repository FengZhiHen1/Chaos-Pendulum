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
  /** 是否暂时禁用（置灰 + 不可切换） */
  disabled?: boolean;
  /** 禁用原因提示 */
  disabledReason?: string;
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
    tooltip: "评审专用一键演示",
    disabled: true,
    disabledReason: "因存在已知 bug，故事模式暂时关闭，修复后重新开放",
  },
];

// ── SYS-01 响应式布局引擎类型 ──

/**
 * useDeviceType() 的返回值。
 * 供需要感知设备能力的组件消费。
 */
export interface DeviceInfo {
  /** 设备类型（三值）。桌面（≥ 1366px）/ 平板（≥ 768px）/ 手机（< 768px） */
  deviceType: DeviceType;
  /** 是否为桌面端（含宽敞桌面 1920+ 和紧凑桌面 1366-1920） */
  isDesktop: boolean;
  /** 是否为桌面宽敞布局（≥ 1920px） */
  isWide: boolean;
  /** 是否为平板端 */
  isTablet: boolean;
  /** 是否为手机端 */
  isMobile: boolean;
  /** 当前视口宽度（像素） */
  viewportWidth: number;
  /** 当前视口高度（像素） */
  viewportHeight: number;
  /** 设备像素比 */
  dpr: number;
  /** 是否偏好减少动画 */
  prefersReducedMotion: boolean;
}

/**
 * 各设备类型下的功能降级规则。
 * 由 SYS-01 定义，由各功能模块自行读取并执行降级。
 */
export interface DegradationRules {
  enable3DShadows: boolean;
  maxTrailLength: number;
  enableTrail: boolean;
  enableSonification: boolean;
  enableCodeEditor: boolean;
  enablePrecomputedData: boolean;
  enableAdvancedAnalysis: boolean;
}

/**
 * useContainerSize hook 的输入参数。
 */
export interface UseContainerSizeOptions {
  /** 容器的 Ref 对象 */
  ref: React.RefObject<HTMLElement | null>;
  /** 去抖动延迟（毫秒），默认 150 */
  debounceMs?: number;
  /** 是否启用，默认 true */
  enabled?: boolean;
}

/**
 * useContainerSize hook 的返回值。
 */
export interface ContainerSize {
  /** 容器内容宽度（像素） */
  width: number;
  /** 容器内容高度（像素） */
  height: number;
  /** 容器是否已挂载且尺寸有效 */
  ready: boolean;
}
