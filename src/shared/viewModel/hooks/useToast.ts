import { notificationPort } from "@/shared/infrastructure/adapters";
import type { ToastFunction } from "@/shared/infrastructure/error-handling/types";

/**
 * 返回 toast 函数，供 React 组件内调用。
 * 与模块级 notify() 共享同一份去重与队列逻辑。
 */
export function useToast(): { toast: ToastFunction } {
  return { toast: (input) => notificationPort.notify(input) };
}
