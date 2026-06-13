/**
 * 模块: control.contracts.parameter-panel
 * 职责: 定义参数控制面板的契约边界——双模式参数输入（连续参数即时生效 vs 初始条件松手复位）、
 *       合法性校验、预设管理、静默注入接口。
 *       SIM-02 的核心职责：管理双摆全部物理参数与初始条件的输入、调节与合法性校验。
 * 数据来源:
 *   - PendulumParams / InitialConditions (shared/domain/valueObjects): MUST — 参数类型定义
 *   - PARAM_META (shared/domain/valueObjects): MUST — 参数元数据表
 *   - SimulationStore (simulation): MUST — 参数读写通过 Store 接口
 * 边界:
 *   - 依赖: shared/domain/valueObjects, simulation/store
 *   - 被依赖: view/components/ParamPanel, view/components/ParamSlider
 * 禁止行为:
 *   - 禁止在参数面板中做物理合理性判断（如 m₁=0.0001 虽极端但合法）
 *   - 禁止连续参数拖拽时触发 Worker Reset（仅更新 ODE 参数值）
 *   - 禁止初始条件参数松手前触发 Reset（必须等松手后才执行）
 *   - 禁止使用二元校验（pass/fail）——使用 ValidationResult { valid, level, message }
 */

import type { PendulumParams, InitialConditions, ParamFieldMeta, ValidationResult, IntegratorMethod, ParamPreset } from "@/shared/domain/valueObjects";

// ───────────────────────────────────────────────
// @contract ParameterCategory — 参数分类
// ───────────────────────────────────────────────

/**
 * 参数分类——决定拖拽时的响应策略。
 *
 * - continuous: 连续参数（m₁/m₂/L₁/L₂/g/damping）——拖拽即时生效，Worker 不重启
 * - initialCondition: 初始条件参数（θ₁/θ̇₁/θ₂/θ̇₂）——拖拽时叠加半透明预览摆，松手后 Worker Reset
 *
 * 前置: 由 ParamFieldMeta.group 推导
 * 后置: 决定 ParamSlider 的 onChange 行为
 * 异常: 无
 * Side Effects: 无
 */
export type ParameterCategory = "continuous" | "initialCondition";

// ───────────────────────────────────────────────
// @contract IParameterValidator — 参数合法性校验
// ───────────────────────────────────────────────

/**
 * 参数校验器——验证单个参数值的合法性。
 *
 * 校验规则：
 *   1. 硬约束（hardMin/hardMax）：违反 → error + 拒绝输入
 *   2. 软约束（sliderMin/sliderMax）：违反 → warning + 接受但提示
 *   3. NaN/非数字：违反 → error
 *
 * 前置: meta 来自 PARAM_META 表
 * 后置: 返回 ValidationResult { valid, level, message }
 * 输入约束: value 为 number 类型（非 NaN）
 * 输出约束: level 为 "error" | "warning" | null
 * 异常: 无——无效输入返回 error 而非抛异常
 * Side Effects: 无——纯函数
 */
export interface IParameterValidator {
  /** 校验单个参数值 */
  validate(meta: ParamFieldMeta, value: number): ValidationResult;

  /** 批量校验参数和初始条件的全部字段 */
  validateAll(params: PendulumParams, ic: InitialConditions): {
    ok: boolean;
    errors: Record<string, ValidationResult>;
  };
}

// ───────────────────────────────────────────────
// @contract IParameterController — 参数控制器
// ───────────────────────────────────────────────

/**
 * 参数控制器端口——管理参数的双模式编辑（连续即时 vs 初始条件预览）。
 *
 * 连续参数（m₁/m₂/L₁/L₂/g/damping）拖拽行为：
 *   1. onChange → validate → error? 拒绝并冻结场景 : 接受并即时更新 Worker
 *
 * 初始条件参数（θ₁/θ̇₁/θ₂/θ̇₂）拖拽行为：
 *   1. onDrag → 3D 场景叠加半透明静态预览摆（仿真继续运行在旧初值上）
 *   2. onRelease → 预览摆实体化 → Worker Reset → 尾迹清空 → 从新初值重启积分
 *
 * 前置: Worker 已就绪（isWorkerReady === true）
 * 后置: 参数已更新并应用到 Worker
 * 输入约束:
 *   - key: PARAM_META 中的有效 key
 *   - value: 非 NaN 的有限值
 * 输出约束:
 *   - 连续参数：Worker 在下一步积分时使用新值，仿真不中断
 *   - 初始条件参数：松手后 Worker Reset + 尾迹清空
 * 异常:
 *   - InvalidParameterError: 硬约束校验失败（m≤0, L≤0 等）
 * Side Effects: 更新 Zustand Store → 触发 Worker 同步（连续参数去抖 16ms）
 */
export interface IParameterController {
  /** 设置连续参数——即时生效 */
  setContinuousParam(key: keyof PendulumParams, value: number): void;

  /** 设置初始条件参数——仅预览，松手后生效 */
  previewInitialCondition(key: keyof InitialConditions, value: number): void;

  /** 确认初始条件预览——执行 Worker Reset */
  commitInitialCondition(): void;

  /** 设置参数（自动判断 category） */
  setParam(key: string, value: number): void;

  /** 应用预设——一次性加载预定义参数组 */
  applyPreset(preset: ParamPreset): string | null;

  /** 静默注入参数（供热力图点击等非交互场景） */
  injectParams(
    params: Partial<PendulumParams>,
    initialConditions?: Partial<InitialConditions>,
  ): void;

  /** 重置为默认值 */
  resetToDefaults(): void;

  /** 以面板当前值重置仿真 */
  applyCurrentSettings(): void;

  /** 设置积分方法 */
  setMethod(method: IntegratorMethod): void;

  /** 参数面板是否有未应用更改 */
  get isDirty(): boolean;

  /** 3D 场景是否因非法参数被冻结 */
  get isSceneFrozen(): boolean;
}

// ───────────────────────────────────────────────
// @contract IParameterPreview — 初始条件预览
// ───────────────────────────────────────────────

/**
 * 初始条件参数的预览状态——控制 3D 场景中的半透明预览摆。
 *
 * 前置: 用户正在拖动初始条件滑块
 * 后置: 3D 场景中叠加半透明摆体显示新初值位置
 * 输入约束:
 *   - active: 是否正在预览
 *   - theta1/theta2: 预览角度 (rad)
 * 输出约束: active=true 时 theta1/theta2 有效
 * 异常: 无
 * Side Effects: 无——纯状态，由 Scene3D 消费
 */
export interface IParameterPreview {
  readonly isActive: boolean;
  readonly theta1: number;
  readonly theta2: number;

  /** 开始预览——显示半透明摆体 */
  beginPreview(theta1: number, theta2: number): void;

  /** 结束预览——隐藏预览摆，触发 commit */
  endPreview(): void;

  /** 取消预览——隐藏预览摆，不触发 commit */
  cancelPreview(): void;
}
