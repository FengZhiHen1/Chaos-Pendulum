/**
 * 模块: explore.contracts.time-reversal
 * 职责: 定义时间反演实验的契约边界——双模式反演、漂移曲线、教学注释、轨迹叠加渲染。
 *       EXP-05 的核心职责：以当前状态为初值反向积分 ODE，可视化混沌的数值不可逆性。
 * 数据来源:
 *   - SimulationFrame (simulation/contracts): MUST — 正向历史帧和反演帧
 *   - IHistoryRepository (simulation/contracts): MUST — 精确反演的 RingBuffer 历史
 *   - StateVector (shared/domain/valueObjects): MUST — 状态向量类型
 * 边界:
 *   - 依赖: simulation/contracts (SimulationFrame, IHistoryRepository)
 *   - 被依赖: view/components/TimeReversal, view/components/TimeReversalTrajectory
 * 禁止行为:
 *   - 禁止在精确反演中访问 Worker——仅使用历史 RingBuffer 插值
 *   - 禁止反演过程中修改正向历史数据（反演帧不写入历史）
 *   - 禁止漂移曲线使用线性坐标轴（混沌漂移是指数增长的）
 *   - 禁止教学注释在已关闭后自动重新弹出
 */

// ───────────────────────────────────────────────
// @contract ReversalMode — 反演模式
// ───────────────────────────────────────────────

/**
 * 时间反演的两种模式。
 *
 * - exact: 精确反演——使用历史 RingBuffer 插值回放，理论上完全重合（对照组）
 * - numerical: 数值反演——Worker 以 -dt 重新积分，展示浮点误差累积
 *
 * 前置: 仿真已运行足够时间（≥ 120 帧历史）
 * 后置: 决定反演的轨迹数据来源
 * 输入约束: "exact" | "numerical"
 * 输出约束: 精确的字符串字面量类型
 * 异常: 无
 * Side Effects: 无
 */
export type ReversalMode = "exact" | "numerical";

// ───────────────────────────────────────────────
// @contract ReversalPhase — 反演阶段
// ───────────────────────────────────────────────

/**
 * 时间反演的生命周期阶段。
 *
 * 状态转换图:
 *   idle → recording (开始录制正向轨迹)
 *   recording → awaitingConfirm (用户点击反演，弹出教学提示)
 *   awaitingConfirm → reversing (用户确认)
 *   reversing → paused (暂停)
 *   paused → reversing (继续)
 *   reversing → completed (回溯到 t=0 或用户停止)
 *   any → idle (重置)
 *
 * 前置: 当前阶段合法
 * 后置: 阶段转换成功
 * 输入约束: 见状态转换图
 * 输出约束: 精确的类型
 * 异常: 无——非法转换由状态机内部静默忽略
 * Side Effects: 无——纯枚举
 */
export type ReversalPhase =
  | "idle"
  | "recording"
  | "awaitingConfirm"
  | "reversing"
  | "completed"
  | "paused";

// ───────────────────────────────────────────────
// @contract DriftSample — 漂移采样点
// ───────────────────────────────────────────────

/**
 * 漂移曲线上的单个采样点。
 *
 * 前置: 一次反演帧与对应正向帧的漂移已计算
 * 后置: 用于 Canvas 2D 绘制漂移距离曲线
 * 输入约束:
 *   - reversalTime: 反演已进行的时间 (s)，≥ 0
 *   - driftDistance: 当前帧与对应正向帧的相空间距离
 *   - forwardSimTime: 对应的正向仿真时间 (s)
 * 输出约束: reversalTime 递增；driftDistance ≥ 0
 * 异常: 无
 * Side Effects: 无——纯数据容器
 */
export interface DriftSample {
  readonly reversalTime: number;
  readonly driftDistance: number;
  readonly forwardSimTime: number;
}

// ───────────────────────────────────────────────
// @contract ITimeReversalController — 时间反演控制器
// ───────────────────────────────────────────────

/**
 * 时间反演控制器端口——管理反演的完整生命周期。
 *
 * 前置: 仿真正在运行且历史 ≥ MIN_HISTORY_FRAMES (120帧)
 * 后置: 反演完成或用户中止
 * 输入约束:
 *   - mode: 反演模式（精确/数值）
 *   - history: 正向轨迹历史（仅精确模式需要）
 * 输出约束:
 *   - 漂移曲线数据通过 driftHistory 实时更新
 *   - 轨迹叠加数据通过 TimeReversalTrajectory 组件渲染
 * 异常:
 *   - InvalidStateError: 历史帧数不足时启动反演
 * Side Effects: 暂停正向历史录制（防止反演帧污染）；
 *   发送 scheduler:setDirection(-1) 命令；启动 Canvas 2D 绘制循环
 */
export interface ITimeReversalController {
  /** 当前反演模式 */
  readonly mode: ReversalMode;

  /** 当前反演阶段 */
  readonly phase: ReversalPhase;

  /** 漂移历史数据 */
  readonly driftHistory: readonly DriftSample[];

  /** 启动反演——从当前状态开始反向 */
  startReversal(mode: ReversalMode): void;

  /** 暂停反演 */
  pause(): void;

  /** 恢复反演 */
  resume(): void;

  /** 停止反演并重置 */
  reset(): void;

  /** 设置反演模式 */
  setMode(mode: ReversalMode): void;

  /** 关闭教学注释（不再自动弹出） */
  dismissAnnotation(): void;

  /** 反演是否正在活跃 */
  get isActive(): boolean;
}

// ───────────────────────────────────────────────
// @contract IDriftCalculator — 漂移计算器
// ───────────────────────────────────────────────

/**
 * 漂移计算器——计算反演轨迹与正向轨迹之间的相空间距离。
 *
 * 前置: 两侧状态均为有效值
 * 后置: 返回非负漂移距离
 * 输入约束:
 *   - forwardState: 正向历史中对应时刻的状态 { theta1, omega1, theta2, omega2 }
 *   - reversedState: 反演当前帧的状态（同上结构）
 * 输出约束: driftDistance ≥ 0；使用角速度+角度的欧氏距离（角速度散度远早于位置散度）
 * 异常: 无
 * Side Effects: 无——纯计算
 */
export interface IDriftCalculator {
  /** 计算两状态之间的漂移距离 */
  compute(
    forwardState: { theta1: number; omega1: number; theta2: number; omega2: number },
    reversedState: { theta1: number; omega1: number; theta2: number; omega2: number },
  ): number;
}

// ───────────────────────────────────────────────
// @contract ReversalDefaults — 反演默认值
// ───────────────────────────────────────────────

/** 时间反演默认配置 */
export const REVERSAL_DEFAULTS = {
  /** 最小历史帧数：2秒 @60fps */
  minHistoryFrames: 120,
  /** 反演 FPS */
  reversalFps: 60,
  /** 首次弹出教学注释的漂移阈值 */
  teachingThreshold: 0.05,
  /** 漂移曲线最大采样点数 */
  maxDriftSamples: 6000,
  /** 精确反演模式超时（秒）——超出 RingBuffer 容量 */
  exactModeMaxTime: 100,
} as const;
