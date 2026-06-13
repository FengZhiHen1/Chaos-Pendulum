/**
 * 模块: simulation.contracts.history-repository
 * 职责: 定义仿真历史数据的仓储端口——正向轨迹的持久化与查询。
 *       实现者（infrastructure/repositories/）实现此端口，通过 Zustand Store 存储数据。
 * 数据来源:
 *   - StateVector (shared/domain/valueObjects): MUST — 每帧状态向量的类型定义
 * 边界:
 *   - 依赖: shared/domain/valueObjects (StateVector)
 *   - 被依赖: simulation-scheduler.contract (调度器每帧推送状态)
 * 禁止行为:
 *   - 禁止在仓储中执行业务逻辑——它只负责存储和查询
 *   - 禁止仓储直接访问 Worker API——状态由 scheduler 通过 commandBus 推送
 *   - 禁止在暂停录制的帧区间外查询历史（反演期间反向帧不污染正向历史）
 */

import type { StateVector } from "@/shared/domain/valueObjects";

// ───────────────────────────────────────────────
// @contract IHistoryRepository — 仿真历史仓储
// ───────────────────────────────────────────────

/**
 * 仿真历史数据仓储——存储正向轨迹的完整状态序列。
 *
 * 典型消费方：
 *   - EXP-05 时间反演实验（精确反演模式需要完整正向历史）
 *   - LAB-01 受力分析（需要状态历史计算累计量）
 *   - 蝴蝶效应对比（需要两侧各自的历史）
 *
 * 前置: 录制状态为 active（未暂停录制）
 * 后置: 状态被追加到内部数组
 * 输入约束:
 *   - state: theta1, omega1, theta2, omega2 均为有限值
 * 输出约束:
 *   - toArray() 返回时间顺序的完整历史副本
 *   - length 反映实际存储的帧数
 * 异常: 无——无效状态静默跳过
 * Side Effects: 修改内部数组（追加或清空）
 */
export interface IHistoryRepository {
  /** 追加一帧状态到历史。录制暂停时静默忽略。 */
  push(state: StateVector): void;

  /** 暂停录制——反演期间调用，防止反向帧污染正向历史 */
  pauseRecording(): void;

  /** 恢复录制 */
  resumeRecording(): void;

  /** 获取完整正向历史（时间顺序副本） */
  toArray(): readonly StateVector[];

  /** 当前历史帧数 */
  get length(): number;

  /** 清空全部历史 */
  clear(): void;

  /** 录制是否活跃 */
  get isRecording(): boolean;
}

// ───────────────────────────────────────────────
// @contract HistoryQuery — 历史查询参数
// ───────────────────────────────────────────────

/**
 * 历史数据查询参数。
 *
 * 前置: 无
 * 后置: 用于切片查询历史数据
 * 输入约束:
 *   - startIndex: 起始帧索引（0-based）
 *   - count: 要获取的帧数
 * 输出约束: 返回 [startIndex, startIndex+count) 范围的帧
 * 异常: RangeError — startIndex 超出历史长度
 * Side Effects: 无
 */
export interface HistoryQuery {
  startIndex: number;
  count: number;
}
