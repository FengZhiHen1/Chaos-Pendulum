/**
 * 模块: lab.contracts.programmable-sandbox
 * 职责: 定义用户可编程沙箱的契约边界——Python代码编辑器、Pyodide安全沙箱、
 *       预设模板系统、错误友好反馈、即时模型切换。
 *       LAB-03 的核心职责：浏览器内Python代码编辑器，用户修改运动方程后3D场景立即切换至新模型。
 * 数据来源:
 *   - CodeMirror 6 (codemirror + @codemirror/lang-python): MUST — 代码编辑器
 *   - Pyodide (pyodide): MUST — 浏览器内 Python 运行时
 *   - 3D Scene (explore/components/Scene3D): MUST — 模型切换的目标渲染层
 * 边界:
 *   - 依赖: codemirror, @codemirror/lang-python, pyodide
 *   - 被依赖: LabPage (实验模式页面的第四个Tab)
 * 禁止行为:
 *   - 禁止沙箱突破安全边界：白名单 import + 5s 超时 + 禁止文件系统/网络
 *   - 禁止在移动端激活（屏幕不适合代码编辑 + Pyodide 内存开销）
 *   - 禁止提供 Python 调试器（无断点/单步执行）
 *   - 禁止用户自定义模型的物理正确性纳入物理验证套件范围
 */

// ───────────────────────────────────────────────
// @contract SandboxTemplate — 预设模板
// ───────────────────────────────────────────────

/** 预设模板标识 */
export type SandboxTemplateId = "spring" | "driven" | "magnetic";

/** 预设模板定义 */
export interface ISandboxTemplate {
  readonly id: SandboxTemplateId;
  readonly label: string;
  readonly description: string;
  /** Python 源代码 */
  readonly code: string;
}

// ───────────────────────────────────────────────
// 3 个预设模板
// ───────────────────────────────────────────────

export const SANDBOX_TEMPLATES: readonly ISandboxTemplate[] = [
  {
    id: "spring",
    label: "弹簧摆",
    description: "刚性杆替换为弹簧连接",
    code: `# 弹簧摆 — 杆 1 替换为弹簧（劲度系数 k）
import numpy as np

def equations(t, state, params):
    theta1, omega1, theta2, omega2 = state
    m1, m2, L1, L2, g, damping, k = params
    # k 为弹簧劲度系数，替换了原刚性杆约束

    delta = theta2 - theta1
    denom = m1 + m2 - m2 * np.cos(delta)**2
    safe_denom = denom if abs(denom) > 1e-12 else np.sign(denom or 1) * 1e-12

    # 弹簧力项：F_spring = k * (L1 - L1_rest) 沿杆方向
    spring_term = k * (L1 - 1.0) / (m1 * L1)  # 归一化到角加速度

    alpha1 = (m2 * L1 * omega1**2 * np.sin(delta) * np.cos(delta)
              + m2 * g * np.sin(theta2) * np.cos(delta)
              + m2 * L2 * omega2**2 * np.sin(delta)
              - (m1 + m2) * g * np.sin(theta1)) / (L1 * safe_denom) + spring_term

    alpha2 = (-m2 * L2 * omega2**2 * np.sin(delta) * np.cos(delta)
              + (m1 + m2) * (g * np.sin(theta1) * np.cos(delta)
              - L1 * omega1**2 * np.sin(delta) - g * np.sin(theta2))) / (L2 * safe_denom)

    return np.array([
        omega1,
        alpha1 - damping * omega1,
        omega2,
        alpha2 - damping * omega2,
    ])
`,
  },
  {
    id: "driven",
    label: "受迫摆",
    description: "加入周期性驱动力",
    code: `# 受迫摆 — 对上摆施加周期性驱动力
import numpy as np

def equations(t, state, params):
    theta1, omega1, theta2, omega2 = state
    m1, m2, L1, L2, g, damping, drive_amp, drive_freq = params
    # drive_amp: 驱动力幅值, drive_freq: 驱动力频率

    delta = theta2 - theta1
    denom = m1 + m2 - m2 * np.cos(delta)**2
    safe_denom = denom if abs(denom) > 1e-12 else np.sign(denom or 1) * 1e-12

    # 周期性驱动力矩
    drive = drive_amp * np.sin(drive_freq * t)

    alpha1 = (m2 * L1 * omega1**2 * np.sin(delta) * np.cos(delta)
              + m2 * g * np.sin(theta2) * np.cos(delta)
              + m2 * L2 * omega2**2 * np.sin(delta)
              - (m1 + m2) * g * np.sin(theta1)) / (L1 * safe_denom) + drive

    alpha2 = (-m2 * L2 * omega2**2 * np.sin(delta) * np.cos(delta)
              + (m1 + m2) * (g * np.sin(theta1) * np.cos(delta)
              - L1 * omega1**2 * np.sin(delta) - g * np.sin(theta2))) / (L2 * safe_denom)

    return np.array([
        omega1,
        alpha1 - damping * omega1,
        omega2,
        alpha2 - damping * omega2,
    ])
`,
  },
  {
    id: "magnetic",
    label: "磁力摆",
    description: "加入磁场洛伦兹力项",
    code: `# 磁力摆 — 摆球带电，在磁场中受洛伦兹力
import numpy as np

def equations(t, state, params):
    theta1, omega1, theta2, omega2 = state
    m1, m2, L1, L2, g, damping, charge, B_field = params
    # charge: 摆球带电量, B_field: 磁场强度（垂直于运动平面）

    delta = theta2 - theta1
    denom = m1 + m2 - m2 * np.cos(delta)**2
    safe_denom = denom if abs(denom) > 1e-12 else np.sign(denom or 1) * 1e-12

    # 洛伦兹力: F = q * v × B (垂直于速度方向)
    lorentz1 = charge * B_field * omega1 / m1
    lorentz2 = charge * B_field * omega2 / m2

    alpha1 = (m2 * L1 * omega1**2 * np.sin(delta) * np.cos(delta)
              + m2 * g * np.sin(theta2) * np.cos(delta)
              + m2 * L2 * omega2**2 * np.sin(delta)
              - (m1 + m2) * g * np.sin(theta1)) / (L1 * safe_denom) + lorentz1

    alpha2 = (-m2 * L2 * omega2**2 * np.sin(delta) * np.cos(delta)
              + (m1 + m2) * (g * np.sin(theta1) * np.cos(delta)
              - L1 * omega1**2 * np.sin(delta) - g * np.sin(theta2))) / (L2 * safe_denom) + lorentz2

    return np.array([
        omega1,
        alpha1 - damping * omega1,
        omega2,
        alpha2 - damping * omega2,
    ])
`,
  },
];

// ───────────────────────────────────────────────
// @contract SandboxExecutionResult — 执行结果
// ───────────────────────────────────────────────

/** 沙箱代码执行结果 */
export interface ISandboxExecutionResult {
  readonly success: boolean;
  /** 错误信息（success=false 时非空） */
  readonly error: string | null;
  /** 错误行号（success=false 时可能非空） */
  readonly errorLine: number | null;
  /** 中文错误翻译（success=false 时非空） */
  readonly errorTranslation: string | null;
  /** 执行耗时 (ms) */
  readonly durationMs: number;
}

// ───────────────────────────────────────────────
// @contract ISandboxRunner — Pyodide 沙箱运行器
// ───────────────────────────────────────────────

/**
 * Pyodide 安全沙箱运行器——在浏览器中执行用户 Python 代码。
 *
 * 安全策略：
 *   1. 白名单 import: numpy + 标准库子集（math, json 等）
 *   2. 执行超时 5 秒强制中断
 *   3. 禁止文件系统访问
 *   4. 禁止网络请求
 *
 * 前置: Pyodide 已加载完成
 * 后置: 返回执行结果（成功或带行号高亮的错误）
 * 输入约束:
 *   - code: 用户编写的 Python 源代码字符串
 *   - timeoutMs: 超时阈值（默认 5000ms）
 * 输出约束:
 *   - success=true 时 error/errorLine/errorTranslation 为 null
 *   - success=false 时 error 包含原始 Python 异常信息
 * 异常: 不抛异常——所有错误通过 ISandboxExecutionResult 返回
 * Side Effects: 创建 Pyodide 命名空间；消耗 CPU（受超时限制）
 */
export interface ISandboxRunner {
  /** 执行 Python 代码 */
  execute(code: string, timeoutMs?: number): Promise<ISandboxExecutionResult>;

  /** 检查 Pyodide 是否已加载 */
  get isReady(): boolean;

  /** 加载 Pyodide（惰性初始化） */
  loadPyodide(): Promise<void>;
}

// ───────────────────────────────────────────────
// @contract ISandboxController — 沙箱生命周期
// ───────────────────────────────────────────────

/**
 * 沙箱生命周期控制器——管理编辑器状态、模板加载、代码执行、模型切换。
 *
 * 前置: 桌面端（移动端禁用沙箱）
 * 后置: 用户代码成功执行后 3D 场景切换至新模型
 * 输入约束:
 *   - 代码执行期间编辑器只读
 *   - 错误修正后可重新执行
 * 输出约束:
 *   - 成功执行后 trajectory 数据通过 JsProxy 转换为 Float64Array
 * 异常: 无——所有用户错误通过 UI 反馈
 * Side Effects: 修改编辑器内容（模板加载）；修改 Pyodide 命名空间（代码执行）
 */
export interface ISandboxController {
  /** 当前编辑器中的代码 */
  readonly code: string;

  /** 是否正在执行 */
  readonly isExecuting: boolean;

  /** 最近一次执行结果 */
  readonly lastResult: ISandboxExecutionResult | null;

  /** 当前加载的模板（null=用户自定义） */
  readonly activeTemplate: SandboxTemplateId | null;

  /** 更新编辑器代码 */
  setCode(code: string): void;

  /** 加载预设模板 */
  loadTemplate(templateId: SandboxTemplateId): void;

  /** 执行当前代码 */
  runCode(): Promise<void>;

  /** 重置为默认状态 */
  reset(): void;

  /** Pyodide 是否已就绪 */
  get isPyodideReady(): boolean;
}

// ───────────────────────────────────────────────
// @contract ERROR_TRANSLATIONS — 中文错误翻译表
// ───────────────────────────────────────────────

/** Python 异常 → 中文友好翻译 */
export const ERROR_TRANSLATIONS: Record<string, string> = {
  "IndexError": "数组越界，请检查索引是否超出范围",
  "TypeError": "类型错误，请检查输入参数类型是否正确",
  "ValueError": "数值错误，请检查参数值是否在合理范围内",
  "NameError": "变量未定义，请检查是否拼写错误或忘记导入",
  "SyntaxError": "语法错误，请检查括号是否配对、缩进是否正确",
  "ZeroDivisionError": "除零错误，请检查分母是否可能为零",
  "OverflowError": "数值溢出，请检查计算结果是否超出 Python 浮点范围",
  "ImportError": "导入失败，请确认使用了白名单内的库（numpy, math, json）",
  "ModuleNotFoundError": "模块未找到，沙箱仅支持 numpy 和标准库子集",
  "TimeoutError": "执行超时（超过5秒），请简化计算或增大步长",
  "KeyError": "键不存在，请检查字典访问的键名是否正确",
  "AttributeError": "属性不存在，请检查对象是否有该属性或方法",
} as const;

/** 沙箱默认配置 */
export const SANDBOX_DEFAULTS = {
  /** 执行超时 (ms) */
  timeoutMs: 5000,
  /** 白名单包 */
  whitelistPackages: ["numpy"] as const,
  /** 编辑器高度 (px) */
  editorHeight: 300,
  /** 移动端禁用 */
  mobileDisabled: true,
} as const;
