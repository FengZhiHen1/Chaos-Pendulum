import { toast as sonnerToast } from "sonner";
import type { ToastInput } from "./types";

let toastProviderMounted = false;
const pendingToasts: ToastInput[] = [];
const MAX_PENDING = 10;

interface DedupEntry {
  title: string;
  variant: string;
  timestamp: number;
  count: number;
  toastId: string;
}

const dedupMap = new Map<string, DedupEntry>();
const DEDUP_WINDOW_MS = 2000;

const lastErrorCodeTime = new Map<string, number>();
const ERROR_CODE_THROTTLE_MS = 5000;

function callSonner(input: ToastInput, id: string): void {
  const opts = {
    id,
    description: input.description,
    duration: input.durationMs === 0 ? Infinity : input.durationMs,
    action: input.action
      ? {
          label: input.action.label,
          onClick: input.action.onClick,
        }
      : undefined,
  };

  switch (input.variant) {
    case "error":
      sonnerToast.error(input.title, opts);
      break;
    case "warning":
      sonnerToast.warning(input.title, opts);
      break;
    case "success":
      sonnerToast.success(input.title, opts);
      break;
    case "loading":
      sonnerToast.loading(input.title, opts);
      break;
    case "info":
    default:
      sonnerToast.info(input.title, opts);
      break;
  }
}

/**
 * 模块级 Toast 触发函数。
 * 可在 React 组件外部调用。
 */
export function notify(input: ToastInput): void {
  if (!toastProviderMounted) {
    if (pendingToasts.length >= MAX_PENDING) {
      pendingToasts.shift();
      console.debug("[SYS-02] pendingToasts 队列已满，丢弃最旧消息");
    }
    pendingToasts.push(input);
    return;
  }

  // ErrorCode 级别节流（5 秒）
  if (input.errorCode) {
    const last = lastErrorCodeTime.get(input.errorCode);
    const now = Date.now();
    if (last && now - last < ERROR_CODE_THROTTLE_MS) {
      console.debug(`[SYS-02] ErrorCode ${input.errorCode} 在 5s 内已被节流`);
      return;
    }
    lastErrorCodeTime.set(input.errorCode, now);
  }

  // title + variant 去重（2 秒窗口）
  const dedupKey = `${input.title}::${input.variant ?? "info"}`;
  const existing = dedupMap.get(dedupKey);
  const now = Date.now();

  if (existing && now - existing.timestamp < DEDUP_WINDOW_MS) {
    existing.count++;
    existing.timestamp = now;
    const suffix = existing.count >= 99 ? "(×99+)" : `(×${existing.count})`;
    const newDescription = input.description
      ? `${input.description} ${suffix}`
      : suffix;
    callSonner({ ...input, description: newDescription }, existing.toastId);
    return;
  }

  const toastId = input.id ?? `toast-${now}-${Math.random().toString(36).slice(2, 8)}`;
  dedupMap.set(dedupKey, {
    title: input.title,
    variant: input.variant ?? "info",
    timestamp: now,
    count: 1,
    toastId,
  });

  callSonner(input, toastId);
}

/**
 * 由 ToastProvider 在挂载后调用，消费待处理队列。
 */
export function markToastProviderMounted(): void {
  toastProviderMounted = true;
  while (pendingToasts.length > 0) {
    const t = pendingToasts.shift()!;
    notify(t);
  }
}

/**
 * 仅供测试使用：重置 Provider 挂载状态和队列。
 */
export function _resetNotifyState(): void {
  toastProviderMounted = false;
  pendingToasts.length = 0;
  dedupMap.clear();
  lastErrorCodeTime.clear();
}
