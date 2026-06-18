/**
 * 模块: lab.hooks.usePyodide
 * 职责: Pyodide 惰性加载 + Python 代码安全执行的 React Hook。
 *       实现合约 ISandboxRunner 的约束——白名单导入、超时中断、错误中文化。
 * 边界:
 *   - 不依赖 React 组件树，可在任何 Hook 上下文中使用
 *   - 依赖浏览器全局 Pyodide CDN 加载（~40MB，首次慢）
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ISandboxExecutionResult } from "../contracts";
import { ERROR_TRANSLATIONS, SANDBOX_DEFAULTS } from "../contracts";

// ── 全局单例（跨组件共享同一 Pyodide 实例）─────────

const PYODIDE_CDN = "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.js";

declare global {
  interface Window {
    loadPyodide?: (opts?: Record<string, unknown>) => Promise<PyodideInstance>;
  }
}

/** Pyodide 实例的最小类型 */
interface PyodideInstance {
  runPythonAsync(code: string): Promise<unknown>;
  setInterruptBuffer(buffer: Uint8Array): void;
  globals: { set(key: string, value: unknown): void };
  FS: { writeFile(path: string, data: Uint8Array): void };
}

/** 全局 Pyodide 实例（惰性单例） */
let globalPyodide: PyodideInstance | null = null;
let globalLoading: Promise<PyodideInstance> | null = null;

// ── 白名单导入检测 ──────────────────────────────────

const FORBIDDEN_IMPORTS = /(?:^|\n)\s*(?:import\s+(?!numpy|math|json|time|random|itertools|functools|collections|typing)\w+|from\s+(?!numpy|math|json|time|random|itertools|functools|collections|typing)\w+\s+import)/m;

/** 预检用户代码中的危险导入 */
function validateImports(code: string): string | null {
  // 禁止文件系统/网络/进程
  if (/\bopen\s*\(|\burllib\b|\brequests\b|\bsocket\b|\bsubprocess\b|\bos\.system\b|\bexec\s*\(|\beval\s*\(/.test(code)) {
    return "代码包含被禁止的调用（open/urllib/socket/subprocess/exec/eval），沙箱不允许文件系统或网络访问";
  }
  // 检查导入白名单
  if (FORBIDDEN_IMPORTS.test(code)) {
    return "代码包含不在白名单内的库导入，沙箱仅支持 numpy 和标准库子集（math/json/time/random）";
  }
  return null;
}

// ── 错误行号提取 ────────────────────────────────────

function extractLine(msg: string): number | null {
  // Python traceback 格式: File "<exec>", line N, in ...
  const m = msg.match(/line\s+(\d+)/i);
  return m ? parseInt(m[1]!, 10) : null;
}

// ── Pyodide 加载 ────────────────────────────────────

async function loadPyodideOnce(): Promise<PyodideInstance> {
  if (globalPyodide) return globalPyodide;
  if (globalLoading) return globalLoading;

  globalLoading = (async () => {
    // 注入 CDN 脚本
    if (!window.loadPyodide) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = PYODIDE_CDN;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Pyodide CDN 脚本加载失败"));
        document.head.appendChild(script);
      });
    }

    const pyodide = await window.loadPyodide!({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/",
    });

    // 预加载 numpy
    await pyodide.runPythonAsync("import numpy as np");

    globalPyodide = pyodide as unknown as PyodideInstance;
    globalLoading = null;
    return globalPyodide;
  })();

  return globalLoading;
}

// ── Hook ────────────────────────────────────────────

export interface UsePyodideAPI {
  /** Pyodide 是否已加载就绪 */
  isReady: boolean;
  /** 正在加载中 */
  isLoading: boolean;
  /** 加载错误 */
  loadError: string | null;
  /** 执行 Python 代码 */
  execute: (code: string, timeoutMs?: number) => Promise<ISandboxExecutionResult>;
  /** 手动加载 Pyodide */
  load: () => Promise<void>;
}

export function usePyodide(): UsePyodideAPI {
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const pyodideRef = useRef<PyodideInstance | null>(null);

  const load = useCallback(async () => {
    if (isReady || isLoading) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const p = await loadPyodideOnce();
      pyodideRef.current = p;
      setIsReady(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLoadError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [isReady, isLoading]);

  const execute = useCallback(async (
    code: string,
    timeoutMs: number = SANDBOX_DEFAULTS.timeoutMs,
  ): Promise<ISandboxExecutionResult> => {
    const t0 = performance.now();

    // 确保 Pyodide 已加载
    const pyodide = pyodideRef.current ?? globalPyodide;
    if (!pyodide) {
      return {
        success: false,
        error: "Pyodide 运行时未就绪",
        errorLine: null,
        errorTranslation: "Pyodide 尚未加载，请先点击「运行」按钮触发加载（首次需下载 ~40MB 数据）",
        durationMs: performance.now() - t0,
      };
    }

    // 白名单导入预检
    const importError = validateImports(code);
    if (importError) {
      return {
        success: false,
        error: "ImportError: 导入不在白名单内",
        errorLine: null,
        errorTranslation: importError,
        durationMs: performance.now() - t0,
      };
    }

    // 执行
    try {
      // 用 SharedArrayBuffer 实现超时中断
      const interruptBuffer = new Uint8Array(new SharedArrayBuffer(1));
      pyodide.setInterruptBuffer(interruptBuffer);

      const timeoutId = setTimeout(() => {
        interruptBuffer[0] = 2; // SIGINT
      }, timeoutMs);

      await pyodide.runPythonAsync(code);
      clearTimeout(timeoutId);

      return {
        success: true,
        error: null,
        errorLine: null,
        errorTranslation: null,
        durationMs: performance.now() - t0,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const type = msg.split(":")[0] ?? "Error";
      const line = extractLine(msg);
      return {
        success: false,
        error: msg,
        errorLine: line,
        errorTranslation: ERROR_TRANSLATIONS[type]
          ?? `未知错误: ${msg.length > 100 ? msg.slice(0, 100) + "…" : msg}`,
        durationMs: performance.now() - t0,
      };
    }
  }, []);

  // 自动触发加载（首次 render）
  useEffect(() => {
    if (!globalPyodide && !globalLoading) {
      load();
    } else if (globalPyodide && !isReady) {
      pyodideRef.current = globalPyodide;
      setIsReady(true);
    }
  }, [load, isReady]);

  return { isReady, isLoading, loadError, execute, load };
}
