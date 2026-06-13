/**
 * 预计算数据加载 Hook（ANL-01 / ANL-02 消费）。
 *
 * 封装 shared/infrastructure/storage/precomputeLoader 的纯加载函数，
 * 添加 React 状态管理和 Toast 错误通知（通过 shared 的 notify）。
 *
 * Phase 0 产物——从 shared/lib/cache/precomputeCache.ts 迁移而来。
 * 未来 Phase 5 将迁入 analyze/viewModel/hooks/。
 */

import { useState, useEffect, useCallback } from "react";
import type {
  PrecomputeLoadInput,
  PrecomputeLoadResult,
} from "@/shared/infrastructure/storage/precomputeLoader";
import { loadPrecomputeData } from "@/shared/infrastructure/storage/precomputeLoader";
import { notify } from "@/shared/infrastructure/error-handling/notify";
import { translateError } from "@/shared/infrastructure/error-handling/error-dictionary";
import type { PrecomputeErrorCode } from "@/features/analyze/types";
import type { PrecomputeDataType, UsePrecomputeDataInput, PrecomputeDataState } from "@/features/analyze/types";

/** 非致命警告 → Toast */
function handleNotice(warning: { code: string; message: string }): void {
  const translated = translateError({
    code: warning.code as PrecomputeErrorCode,
    context: { reason: warning.message },
  });
  notify({
    title: translated.message,
    variant: "warning",
    durationMs: translated.durationMs,
    errorCode: warning.code as PrecomputeErrorCode,
  });
}

/** 加载错误 → Toast */
function handleError(code: PrecomputeErrorCode, message: string): void {
  const translated = translateError({ code, context: { reason: message } });
  notify({
    title: translated.message.split("：")[0] ?? translated.message,
    description: translated.message.includes("：")
      ? translated.message.slice(translated.message.indexOf("：") + 1)
      : undefined,
    variant: translated.level === "error" ? "error" : "warning",
    durationMs: translated.durationMs,
    errorCode: code,
  });
}

/**
 * 加载预计算数据并管理 React 状态。
 *
 * @deprecated Phase 5 将迁入 analyze/viewModel/hooks/
 */
export function usePrecomputeData<T extends PrecomputeDataType>(
  input: UsePrecomputeDataInput,
): PrecomputeDataState<T> {
  const [state, setState] = useState<PrecomputeDataState<T>>({
    status: "idle",
    data: null,
    errorMessage: null,
    errorCode: null,
    source: null,
    retry: () => {},
  });

  const doLoad = useCallback(async (): Promise<PrecomputeLoadResult<T>> => {
    setState((s) => ({
      ...s,
      status: "loading",
      errorMessage: null,
      errorCode: null,
    }));

    const loadInput: PrecomputeLoadInput = {
      dataType: input.dataType,
      dataUrl: input.dataUrl,
      expectedGridHash: input.expectedGridHash,
      expectedType: input.expectedType,
      expectedSolverVersion: input.expectedSolverVersion,
      fetchTimeoutMs: input.fetchTimeoutMs,
      maxRetries: input.maxRetries,
      retryBaseMs: input.retryBaseMs,
    };

    const result: PrecomputeLoadResult<T> = await loadPrecomputeData<T>(
      loadInput,
      handleNotice,
    );

    if (result.status === "error") {
      handleError(
        (result.errorCode ?? "PRECOMPUTE_FETCH_FAILED") as PrecomputeErrorCode,
        result.errorMessage ?? "未知错误",
      );
    }

    return result;
  }, [
    input.dataUrl,
    input.expectedGridHash,
    input.dataType,
    input.expectedType,
    input.expectedSolverVersion,
    input.fetchTimeoutMs,
    input.maxRetries,
    input.retryBaseMs,
  ]);

  useEffect(() => {
    if (input.enabled === false) return;

    let cancelled = false;

    doLoad().then((result) => {
      if (cancelled) return;
      setState({
        status: result.status,
        data: result.data,
        errorMessage: result.errorMessage,
        errorCode: (result.errorCode as PrecomputeErrorCode) ?? null,
        source: result.source,
        retry: () => {
          doLoad().then((r) => {
            setState((prev) => ({
              ...prev,
              status: r.status,
              data: r.data,
              errorMessage: r.errorMessage,
              errorCode: (r.errorCode as PrecomputeErrorCode) ?? null,
              source: r.source,
            }));
          });
        },
      });
    });

    return () => {
      cancelled = true;
    };
  }, [doLoad, input.enabled]);

  const retry = useCallback(() => {
    doLoad();
  }, [doLoad]);

  return { ...state, retry };
}
