/**
 * NotificationAdapter — INotificationPort 的 Infrastructure 实现。
 *
 * 委托给现有的 notify 函数（sonner 封装），提供面向端口的薄适配层。
 */

import type {
  INotificationPort,
  NotificationPayload,
} from "@/shared/application/ports/INotificationPort";
import { notify as rawNotify } from "@/shared/infrastructure/error-handling/notify";

class NotificationAdapter implements INotificationPort {
  notify(payload: NotificationPayload): void {
    rawNotify({
      title: payload.title,
      description: payload.description,
      variant: payload.variant,
      durationMs: payload.durationMs,
      action: payload.action,
      errorCode: payload.errorCode,
      id: payload.id,
    });
  }

  warn(title: string, description?: string): void {
    this.notify({ title, description, variant: "warning" });
  }

  error(title: string, description?: string): void {
    this.notify({ title, description, variant: "error" });
  }

  info(title: string, description?: string): void {
    this.notify({ title, description, variant: "info" });
  }

  success(title: string, description?: string): void {
    this.notify({ title, description, variant: "success" });
  }
}

/** 单例通知端口适配器 */
export const notificationPort: INotificationPort = new NotificationAdapter();
