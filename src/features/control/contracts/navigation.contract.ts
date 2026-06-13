/**
 * 模块: control.contracts.navigation
 * 职责: 定义全局导航系统的契约边界——四模式切换、跨模式状态保持、键盘快捷键、
 *       响应式布局外壳、故事模式锁定。
 *       SIM-03 的核心职责：管理四种工作模式的一键切换与跨模式仿真状态保持。
 * 数据来源:
 *   - AppMode / MODE_REGISTRY (shared/domain/valueObjects): MUST — 模式元数据
 *   - DeviceInfo (shared/domain/valueObjects): MUST — 响应式设备信息
 * 边界:
 *   - 依赖: shared/domain/valueObjects (AppMode, DeviceInfo)
 *   - 被依赖: App.tsx, shared/view/layout/AppShell, 所有功能页面
 * 禁止行为:
 *   - 禁止在模式切换时停止或重启仿真 Worker
 *   - 禁止导航栏在故事模式演示期间响应手动切换
 *   - 禁止模式切换丢失任何可视化组件的 Store 订阅
 */

import type { AppMode } from "@/shared/domain/valueObjects";

// ───────────────────────────────────────────────
// @contract INavigationController — 导航控制器
// ───────────────────────────────────────────────

/**
 * 全局导航控制器——管理四种工作模式的生命周期。
 *
 * 模式切换规则：
 *   1. 点击导航 Tab（或键盘 1-4）→ activeMode 切换
 *   2. 内容区切换至对应功能页面
 *   3. 仿真在后台持续运行不中断
 *   4. 切回原模式时所有可视化状态保留
 *
 * 故事模式锁定规则：
 *   1. 故事自动播放中 → 导航栏锁定，忽略切换请求
 *   2. 导航栏显示脉冲动画引导用户注意
 *   3. 故事结束或用户打断 → 锁定解除，自动回到之前的模式
 *
 * 前置: AppShell 已挂载
 * 后置: 模式切换完成，内容区已更新
 * 输入约束:
 *   - mode: "explore" | "analyze" | "lab" | "story"
 * 输出约束: 切换后 subscribe 到 activeMode 的组件自动重渲染
 * 输出约束: 导航锁定时 switchTo() 静默拒绝（console.warn + return），不抛异常
 * 异常: 无——锁定为静默拒绝，避免 UI 层 try-catch 负担
 * Side Effects: 更新 AppStore.activeMode；
 *   键盘快捷键注册/注销（useKeyboardShortcuts）
 */
export interface INavigationController {
  /** 当前活跃模式 */
  readonly activeMode: AppMode;

  /** 切换到指定模式 */
  switchTo(mode: AppMode): void;

  /** 锁定导航（故事模式调用） */
  lock(reason: string): void;

  /** 解锁导航 */
  unlock(): void;

  /** 导航是否已锁定 */
  get isLocked(): boolean;

  /** 锁定时返回之前的模式 */
  get previousMode(): AppMode | null;
}

// ───────────────────────────────────────────────
// @contract IResponsiveShell — 响应式布局外壳
// ───────────────────────────────────────────────

/**
 * 响应式布局外壳——适配桌面/平板/手机三端。
 *
 * 断点：
 *   - desktop: ≥ 1024px   三栏布局（左控制面板 + 中3D场景 + 右图表区）
 *   - tablet: 768-1023px  控制面板收纳为底部抽屉，图表Tab切换
 *   - mobile: < 768px     单栏聚焦3D场景，高级功能折叠
 *
 * 前置: 设备类型已检测（useDeviceType）
 * 后置: 布局已适配当前视口
 * 输入约束: deviceType ∈ {"desktop", "tablet", "mobile"}
 * 输出约束: 各面板的可见性和位置正确
 * 异常: 无——不支持的特性静默降级
 * Side Effects: CSS 类名切换；面板显示/隐藏
 */
export interface IResponsiveShell {
  /** 当前设备类型 */
  readonly deviceType: "desktop" | "tablet" | "mobile";

  /** 是否为桌面端 */
  readonly isDesktop: boolean;

  /** 是否为平板端 */
  readonly isTablet: boolean;

  /** 是否为手机端 */
  readonly isMobile: boolean;

  /** 当前视口宽度 (px) */
  readonly viewportWidth: number;
}

// ───────────────────────────────────────────────
// @contract IKeyboardShortcuts — 键盘快捷键
// ───────────────────────────────────────────────

/**
 * 全局键盘快捷键管理器。
 *
 * 快捷键映射：
 *   - 1: 探索模式
 *   - 2: 分析模式
 *   - 3: 实验模式
 *   - 4: 故事模式
 *   - Space: 播放/暂停
 *   - R: 重置
 *
 * 前置: AppShell 已挂载
 * 后置: 快捷键已注册到 window
 * 输入约束:
 *   - 仅在无 input/textarea 聚焦时响应
 *   - 导航锁定时仅 Space/R 可用
 * 输出约束: 触发对应的导航切换或仿真控制
 * 异常: 无——无效按键静默忽略
 * Side Effects: 注册/注销全局 keydown 事件监听器
 */
export interface IKeyboardShortcuts {
  /** 注册全局快捷键 */
  register(): void;

  /** 注销全局快捷键 */
  unregister(): void;

  /** 是否启用（导航锁定时部分禁用） */
  get enabled(): boolean;
}

// ───────────────────────────────────────────────
// @contract ResponsiveBreakpoints — 响应式断点
// ───────────────────────────────────────────────

/** 响应式布局断点（像素）。
 * 权威数据源: src/shared/constants/breakpoints.ts。
 * 此常量仅为契约文档引用，确保契约读者无需跳转即可了解断点值。 */
export const BREAKPOINTS = {
  /** 桌面端：≥ 1024px（三栏布局） */
  desktop: 1024,
  /** 平板端：768-1023px（底部抽屉） */
  tablet: 768,
  /** 手机端：< 768px（单栏） */
  mobile: 0,
} as const;

/** 导航栏高度（像素） */
export const NAV_BAR_HEIGHT = 48;

/** 各模式下控制面板宽度（桌面端，像素） */
export const CONTROL_PANEL_WIDTH = 320;
