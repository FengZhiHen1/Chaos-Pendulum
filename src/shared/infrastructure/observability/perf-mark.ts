let warned = false;

export function measure(name: string, fn: () => void): number {
  if (typeof performance?.mark !== "function") {
    if (!warned) {
      warned = true;
      console.warn("[Observability] performance.mark/measure API 不可用，耗时测量将返回 -1");
    }
    return -1;
  }

  const markStart = `${name}-start`;
  const markEnd = `${name}-end`;
  performance.mark(markStart);
  try {
    fn();
  } finally {
    performance.mark(markEnd);
    const m = performance.measure(name, markStart, markEnd);
    performance.clearMarks(markStart);
    performance.clearMarks(markEnd);
    return m.duration;
  }
}
