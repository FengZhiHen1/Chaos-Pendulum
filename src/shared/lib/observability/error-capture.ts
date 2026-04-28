const MAX_ERRORS = 50;
const errors: string[] = [];
let errorCallbackInProgress = false;

export function initErrorCapture(onError: (errors: string[]) => void) {
  const prevOnError = window.onerror;
  const prevOnUnhandledRejection = window.onunhandledrejection;

  window.onerror = (_msg, _src, _line, _col, error) => {
    // 链式调用原有钩子
    if (typeof prevOnError === "function") {
      try {
        prevOnError.call(window, _msg, _src, _line, _col, error);
      } catch { /* 静默 */ }
    }

    pushError(error?.message ?? String(_msg));

    if (errorCallbackInProgress) return;
    errorCallbackInProgress = true;
    try {
      onError([...errors]);
    } catch (e) {
      console.error("[Observability] 错误回调异常:", e);
    } finally {
      errorCallbackInProgress = false;
    }
  };

  window.onunhandledrejection = (event) => {
    // 链式调用原有钩子
    if (typeof prevOnUnhandledRejection === "function") {
      try {
        prevOnUnhandledRejection.call(window, event);
      } catch { /* 静默 */ }
    }

    pushError(event.reason?.message ?? String(event.reason ?? "unhandled rejection"));

    if (errorCallbackInProgress) return;
    errorCallbackInProgress = true;
    try {
      onError([...errors]);
    } catch (e) {
      console.error("[Observability] 错误回调异常:", e);
    } finally {
      errorCallbackInProgress = false;
    }
  };
}

function pushError(msg: string) {
  errors.push(`[${new Date().toISOString()}] ${msg}`);
  if (errors.length > MAX_ERRORS) errors.shift();
}

export function getErrors(): string[] {
  return [...errors];
}

export function clearErrors(): void {
  errors.length = 0;
}
