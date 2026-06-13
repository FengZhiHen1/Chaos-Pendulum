/**
 * 模块: explore.contracts.sonification
 * 职责: 定义参数→音频映射的契约边界——声音化引擎生命周期、参数映射规则、平台适配。
 *       EXP-03 的核心职责：将双摆运动参数实时映射为音频，使混沌可听。
 * 数据来源:
 *   - SimulationFrame (simulation/contracts): MUST — 每帧的运动状态是音频参数的唯一来源
 *   - Lyapunov指数 (simulation/contracts): MUST — 混沌检测驱动"声音碎裂"效果
 *   - Web Audio API (shared/infrastructure/audio): MUST — 音频引擎底层实现
 * 边界:
 *   - 依赖: simulation/contracts (SimulationFrame), shared/infrastructure/audio
 *   - 被依赖: view/components/SonificationToggle
 * 禁止行为:
 *   - 禁止在移动端（平板/手机）激活音频引擎——自动禁用
 *   - 禁止在无用户手势的情况下创建 AudioContext（浏览器安全策略）
 *   - 禁止音频引擎绕过 useSonification Hook 直接操作 DOM
 *   - 默认静音——声音化需用户主动开启
 */

// ───────────────────────────────────────────────
// @contract SonificationParams — 音频映射参数
// ───────────────────────────────────────────────

/**
 * 从仿真帧提取的音频映射参数。
 *
 * 前置: frame 已通过 hasInvalidValue 检查
 * 后置: 所有字段为有限值，用于驱动 Web Audio 参数
 * 输入约束:
 *   - theta2Dot: 下摆角速度 (rad/s)，映射基频音高
 *   - armAngle: 两杆夹角 (rad)，映射和声复杂度
 *   - totalEnergy: 总能量 (J)，映射音色亮度
 *   - lyapunovExponent: Lyapunov指数，>0 时触发"声音碎裂"
 * 输出约束: 所有字段为有限值
 * 异常: 无——无效帧在 feed() 中静默跳过
 * Side Effects: 无——纯数据容器
 */
export interface SonificationParams {
  /** 下摆角速度 (rad/s) → 基频音高 */
  readonly theta2Dot: number;
  /** 两杆夹角 (rad) → 和声复杂度（0=平行，π/2=正交） */
  readonly armAngle: number;
  /** 总能量 (J) → 音色亮度（低能:正弦波，高能:锯齿波） */
  readonly totalEnergy: number;
  /** Lyapunov指数 → 混沌听觉标记（>0 混入白噪声+混响） */
  readonly lyapunovExponent: number;
}

// ───────────────────────────────────────────────
// @contract ISonificationEngine — 声音化引擎
// ───────────────────────────────────────────────

/**
 * 声音化引擎端口——将仿真状态映射为实时音频。
 *
 * 4 维参数→音频映射规则：
 *   - θ̇₂ → 基频音高（线性映射到 110-880Hz）
 *   - 两杆夹角 → 和声复杂度（稳定→纯五度，剧烈→不协和音程）
 *   - 总动能 → 音色亮度（低能正弦波→高能锯齿波，通过 waveShaper 混合）
 *   - λ>0 → 混沌听觉标记（混入白噪声+混响形成"声音碎裂"）
 *
 * 前置: AudioContext 已创建且处于 running 状态
 * 后置: 音频参数已更新到当前帧
 * 输入约束:
 *   - params: 所有字段为有限值
 * 输出约束: 无返回值（副作用驱动音频输出）
 * 异常:
 *   - AudioContextNotReadyError: AudioContext 未创建或已关闭
 * Side Effects: 修改 Web Audio API 节点参数（OscillatorNode.frequency,
 *   GainNode.gain, WaveShaperNode.curve, AudioBufferSourceNode）
 */
export interface ISonificationEngine {
  /** 初始化音频节点图（在首次 toggle 时惰性调用） */
  initialize(ctx: AudioContext): void;

  /** 喂入一帧仿真参数，更新音频输出 */
  feed(params: SonificationParams): void;

  /** 静默——将所有增益节点归零但不销毁 AudioContext */
  mute(): void;

  /** 恢复——将增益节点恢复到 mute 前的水平 */
  unmute(): void;

  /** 销毁音频节点图并释放资源 */
  dispose(): void;

  /** 引擎是否已初始化 */
  get isInitialized(): boolean;

  /** 引擎是否当前静音 */
  get isMuted(): boolean;
}

// ───────────────────────────────────────────────
// @contract ISonificationController — 声音化生命周期
// ───────────────────────────────────────────────

/**
 * 声音化生命周期控制器——管理 AudioContext 的激活、引擎的惰性创建、平台检测。
 *
 * 前置: 运行在桌面端（deviceType === "desktop"）
 * 后置: 声音化已启用或已禁用
 * 输入约束:
 *   - 首次 toggle 时必须由用户手势触发（click/touch）
 * 输出约束:
 *   - isActive: 声音化是否正在运行
 * 异常: 无——初始化失败时静默降级（notify 警告）
 * Side Effects: 可能触发浏览器音频自动播放策略提示；
 *   创建/销毁 AudioContext；启动/停止 requestAnimationFrame 回调
 */
export interface ISonificationController {
  /** 声音化是否激活 */
  readonly isActive: boolean;

  /** 切换声音化开关（由用户手势触发） */
  toggle(): void;

  /** 每仿真帧调用——若激活则 feed 当前帧参数到引擎 */
  updateFrame(params: SonificationParams): void;

  /** 组件卸载时清理 */
  dispose(): void;
}

// ───────────────────────────────────────────────
// @contract SonificationDefaults — 声音化默认值
// ───────────────────────────────────────────────

/** 声音化引擎默认配置 */
export const SONIFICATION_DEFAULTS = {
  /** 最大观测能量 EMA 平滑系数（半衰期≈33秒） */
  maxEnergyEmaAlpha: 0.0005,
  /** 最大观测能量最小值 (J) */
  maxEnergyMin: 0.1,
  /** 引擎重建最大次数 */
  maxEngineRebuilds: 1,
  /** 移动端自动禁用 */
  mobileDisabled: true,
  /** 默认静音 */
  defaultMuted: true,
} as const;
