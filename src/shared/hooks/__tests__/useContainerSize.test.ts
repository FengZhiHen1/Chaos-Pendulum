import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useContainerSize } from "../useContainerSize";

function createDiv(width: number, height: number): HTMLDivElement {
  const el = document.createElement("div");
  el.getBoundingClientRect = () =>
    ({
      width,
      height,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      x: 0,
      y: 0,
      toJSON: () => {},
    }) as DOMRect;
  return el;
}

describe("useContainerSize", () => {
  let container: HTMLDivElement;
  const observedElements: Element[] = [];
  let origRO: unknown;

  beforeEach(() => {
    container = createDiv(800, 600);
    document.body.appendChild(container);
    observedElements.length = 0;

    // jsdom 默认不提供 ResizeObserver，手动挂载
    origRO = (globalThis as Record<string, unknown>).ResizeObserver;
    (globalThis as Record<string, unknown>).ResizeObserver = class {
      constructor(_callback: ResizeObserverCallback) {}
      observe(el: Element) {
        observedElements.push(el);
      }
      unobserve() {}
      disconnect() {}
    };
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>).ResizeObserver = origRO;
    document.body.removeChild(container);
  });

  it("已挂载容器返回正确尺寸和 ready=true", () => {
    const ref = { current: container as HTMLElement | null };
    const { result } = renderHook(() =>
      useContainerSize({ ref, debounceMs: 0 }),
    );
    expect(result.current.width).toBe(800);
    expect(result.current.height).toBe(600);
    expect(result.current.ready).toBe(true);
    expect(observedElements).toContain(container);
  });

  it("ref 为 null 时返回 ready=false", () => {
    const ref = { current: null };
    const { result } = renderHook(() =>
      useContainerSize({ ref, debounceMs: 0 }),
    );
    expect(result.current.ready).toBe(false);
    expect(result.current.width).toBe(0);
    expect(result.current.height).toBe(0);
  });

  it("enabled=false 时不创建 ResizeObserver 并返回 ready=false", () => {
    const ref = { current: container as HTMLElement | null };
    const { result } = renderHook(() =>
      useContainerSize({ ref, enabled: false }),
    );
    expect(result.current.ready).toBe(false);
    expect(observedElements).toHaveLength(0);
  });

  it("容器尺寸为 0×0 时 ready 为 false", () => {
    const zeroDiv = createDiv(0, 0);
    document.body.appendChild(zeroDiv);
    const ref = { current: zeroDiv as HTMLElement | null };
    const { result } = renderHook(() =>
      useContainerSize({ ref, debounceMs: 0 }),
    );
    expect(result.current.ready).toBe(false);
  });
});
