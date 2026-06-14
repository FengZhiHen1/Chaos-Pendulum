/**
 * INotificationPort — 跨模块 Toast 通知端口。
 *
 * 解耦 ViewModel/Application 层与 toast 实现细节（sonner）。
 * 由 shared/infrastructure/adapters/NotificationAdapter 实现。
 */

/** Toast 通知严重度 */
export type NotificationVariant = "info" | "success" | "warning" | "error" | "loading";

/** 通知操作按钮 */
export interface NotificationAction {
  label: string;
  onClick: () => void;
}

/** 通知载荷 */
export interface NotificationPayload {
  title: string;
  description?: string;
  variant?: NotificationVariant;
  durationMs?: number;
  action?: NotificationAction;
  /** 内部用于 ErrorCode 节流（透传给底层 notify） */
  errorCode?: string;
  /** 可选 toast ID，用于去重（透传给底层 notify） */
  id?: string;
}

/**
 * @contract INotificationPort
 * 跨切面通知端口接口。所有 Toast 通知通过此端口触发，
 * 调用方不感知底层 toast 库。
 */
export interface INotificationPort {
  /** 通用通知 */
  notify(payload: NotificationPayload): void;
  /** 警告级别通知 */
  warn(title: string, description?: string): void;
  /** 错误级别通知 */
  error(title: string, description?: string): void;
  /** 信息级别通知 */
  info(title: string, description?: string): void;
  /** 成功级别通知 */
  success(title: string, description?: string): void;
}
