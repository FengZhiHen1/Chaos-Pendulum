export function measure(name: string, fn: () => void): number {
  const markStart = `${name}-start`;
  const markEnd = `${name}-end`;
  performance.mark(markStart);
  fn();
  performance.mark(markEnd);
  const measure = performance.measure(name, markStart, markEnd);
  performance.clearMarks(markStart);
  performance.clearMarks(markEnd);
  return measure.duration;
}
