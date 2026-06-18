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
  loadPackage(names: string | string[]): Promise<void>;
  globals: { set(key: string, value: unknown): void; get(key: string): unknown };
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

    // 安装 numpy + scipy（Pyodide 需先 loadPackage 才能 import）
    await pyodide.loadPackage(["numpy", "scipy"]);

    globalPyodide = pyodide as unknown as PyodideInstance;
    globalLoading = null;
    return globalPyodide;
  })();

  return globalLoading;
}

// ── Hook ────────────────────────────────────────────

/** 轨迹计算结果 */
export interface SandboxTrajectoryResult {
  success: boolean;
  error?: string;
  timePoints: number[];
  states: number[][]; // [theta1, omega1, theta2, omega2][]
  durationMs: number;
}

export interface UsePyodideAPI {
  /** Pyodide 是否已加载就绪 */
  isReady: boolean;
  /** 正在加载中 */
  isLoading: boolean;
  /** 加载错误 */
  loadError: string | null;
  /** 执行 Python 代码 */
  execute: (code: string, timeoutMs?: number) => Promise<ISandboxExecutionResult>;
  /** 用当前仿真参数计算轨迹 */
  computeTrajectory: (
    code: string,
    initialState: { theta1: number; omega1: number; theta2: number; omega2: number },
    params: number[],
    duration: number,
    timeoutMs?: number,
  ) => Promise<SandboxTrajectoryResult>;
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

    // 执行（Promise.race 超时——不依赖 SharedArrayBuffer/COOP 头）
    try {
      const runPromise = pyodide.runPythonAsync(code).then(() => "success" as const);

      const timeoutPromise = new Promise<"timeout">((resolve) =>
        setTimeout(() => resolve("timeout"), timeoutMs),
      );

      const outcome = await Promise.race([runPromise, timeoutPromise]);

      if (outcome === "timeout") {
        return {
          success: false,
          error: "TimeoutError: 执行超时",
          errorLine: null,
          errorTranslation: ERROR_TRANSLATIONS["TimeoutError"] ?? "执行超时（超过5秒），请简化计算或增大步长",
          durationMs: performance.now() - t0,
        };
      }

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

  const computeTrajectory = useCallback(async (
    code: string,
    initialState: { theta1: number; omega1: number; theta2: number; omega2: number },
    params: number[],
    duration: number,
    timeoutMs: number = 30000,
  ): Promise<SandboxTrajectoryResult> => {
    const t0 = performance.now();
    const pyodide = pyodideRef.current ?? globalPyodide;
    if (!pyodide) {
      return { success: false, error: "Pyodide 未就绪", timePoints: [], states: [], durationMs: performance.now() - t0 };
    }

    try {
      // 1. 先执行用户代码
      await pyodide.runPythonAsync(code);

      // 1.5 验证 equations() 是否被正确定义
      await pyodide.runPythonAsync(`
try:
    _equations_ok = callable(equations)
except NameError:
    _equations_ok = False
`);
      const hasEquations = pyodide.globals.get("_equations_ok") as boolean;
      if (!hasEquations) {
        return {
          success: false,
          error: "代码未定义可调用的 equations(t, state, params) 函数",
          timePoints: [], states: [], durationMs: performance.now() - t0,
        };
      }

      // 2. 设置初始条件和参数
      const globals = pyodide.globals;
      globals.set("_t_span", [0, duration]);
      globals.set("_y0", [initialState.theta1, initialState.omega1, initialState.theta2, initialState.omega2]);
      // params 是普通数组，在 Python 中需要转成 tuple
      await pyodide.runPythonAsync(`import numpy as np; _params = tuple(${JSON.stringify(params)})`);

      // 3. 用 solve_ivp 计算轨迹
      const outcome = await Promise.race([
        pyodide.runPythonAsync(`
from scipy.integrate import solve_ivp
import numpy as np

sol = solve_ivp(
    equations, _t_span, _y0,
    args=(_params,),
    max_step=0.016,
    method='RK45',
    rtol=1e-6, atol=1e-9
)
_t_list = sol.t.tolist()
_y_list = sol.y.tolist()
`).then(() => "success" as const),
        new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), timeoutMs)),
      ]);

      if (outcome === "timeout") {
        return { success: false, error: "轨迹计算超时（>30s）", timePoints: [], states: [], durationMs: performance.now() - t0 };
      }

      // 4. 转换结果（Pyodide Python proxy → toJs() → JS 数组）
      const toJs = (v: unknown) => (v as { toJs(): unknown }).toJs();
      const timePoints = toJs(pyodide.globals.get("_t_list")) as number[];
      const yList = toJs(pyodide.globals.get("_y_list")) as number[][];

      return {
        success: true,
        timePoints: Array.from(timePoints),
        states: yList.map((row) => Array.from(row)),
        durationMs: performance.now() - t0,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg, timePoints: [], states: [], durationMs: performance.now() - t0 };
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

  return { isReady, isLoading, loadError, execute, computeTrajectory, load };
}
