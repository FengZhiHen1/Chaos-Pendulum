const MAX_ERRORS = 50;
const errors: string[] = [];

export function initErrorCapture(onError: (errors: string[]) => void) {
  window.onerror = (_msg, _src, _line, _col, error) => {
    pushError(error?.message ?? "unknown error");
    onError(errors);
  };

  window.onunhandledrejection = (event) => {
    pushError(event.reason?.message ?? "unhandled rejection");
    onError(errors);
  };
}

function pushError(msg: string) {
  errors.push(`[${new Date().toISOString()}] ${msg}`);
  if (errors.length > MAX_ERRORS) errors.shift();
}

export function getErrors(): string[] {
  return [...errors];
}
