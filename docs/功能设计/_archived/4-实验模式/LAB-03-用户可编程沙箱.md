# 功能点：LAB-03 用户可编程沙箱

> **文档生成时间**：2026-04-28 21:55:33 CST
> **版本记录**：
> | 版本 | 时间 | 修改人 | 变更摘要 |
> |------|------|--------|----------|
> | v1.0 | 2026-04-28 21:55:33 | AI Assistant | 初始版本，对齐已有 `useLabStore`（userCode/codeStatus/codeError 字段）+ 三个 Python 模板文件 + Pyodide 三级缓存方案 + CodeMirror 6 集成 |

> **冲突核查指引**：本模块使用 `useLabStore` 的 `userCode`/`codeStatus`/`codeError`/`activeTemplate`/`setUserCode`/`setCodeStatus`/`setCodeError` 字段（已存在于 `src/features/lab/store.ts`）。与 LAB-01（coordinateSystem）和 LAB-02（validationResults）字段无重叠。Pyodide 加载与 SYS-04 的初始化加载流程协调（Pyodide 按需懒加载，不阻塞首屏）。无冲突。

### 所属模块与溯源

- **对应总设计章节**：功能设计_v0 §五 5.3「用户可编程仿真（浏览器内沙箱）」；功能模块全拆解 §四 LAB-03「用户可编程沙箱」；技术栈设计 §2 #10（CodeMirror 6）、#13（Pyodide + SciPy `solve_ivp`）、§4.8「用户可编程沙箱」、§5.2「Pyodide 三级缓存」、ADR-001（JS 实时 + Pyodide 沙箱混合）
- **依赖的其他功能模块**：
  - `SYS-04`（应用初始化加载）— Pyodide 的下载/缓存状态与本模块的 `usePyodide` hook 协调；加载进度通过 INF-01 的 `pyodideLoadPct` 追踪
  - `SIM-01`（双摆物理引擎）— **不经过**。本模块使用 Pyodide + SciPy `solve_ivp` 独立于 JS Worker 引擎（技术栈 ADR-001）
  - `EXP-01`（3D 仿真场景）— 沙箱运行结果写入 `useSimulationStore` 后，3D 场景自动消费新轨迹数据（与消费 JS Worker 数据方式完全相同）
  - `LAB-02`（物理验证套件）— 可选交叉校验：JS RK4 vs Pyodide SciPy 输出一致性（两套 ODE 实现对比）
- **被依赖模块**：`LAB-02`（交叉校验消费 Pyodide 输出）、`EXP-01`（消费沙箱产生的轨迹数据渲染 3D 场景）

### 已有设计兼容性分析

- **已审查的相关规格文档**：
  - `SIM-01-双摆物理引擎.md` v2.1：§「依赖与集成接口」明确 LAB-03"不经过本模块"，Pyodide 直接 `solve_ivp` → JsProxy → store。本模块遵循此数据流
  - `LAB-01-受力拆解视图.md` v1.0：共享 `useLabStore`，LAB-01 使用 `coordinateSystem` 字段，本模块使用 `userCode`/`codeStatus`/`codeError` 字段，无字段名冲突
  - `LAB-02-物理验证套件.md` v1.0：定义 JS/Python 交叉校验为可选增强 v1.1，本模块提供 Pyodide 侧的计算能力作为交叉校验的基础
  - `双摆混沌实验室-技术栈设计.md` v1.2：§4.8 安全边界（白名单 import、5s 超时、错误捕获）、§5.2 Pyodide 三级缓存（本地文件 → IndexedDB → CDN）、ADR-001（JS 实时 + Pyodide 沙箱混合架构）
  - `INF-01-应用可观测性.md` v1.0：Pyodide 加载进度通过 `ObservabilityCoordinator.updatePyodideProgress(pct)` 写入 `debugInfo.pyodideLoadPct`
- **兼容性结论**：
  - 已有 `useLabStore` 字段完全覆盖本模块需要管理的状态：`userCode`（当前编辑器代码）、`codeStatus`（`"idle" | "running" | "error" | "success"`）、`codeError`（错误信息）、`activeTemplate`（当前加载的模板名）
  - 三个 Python 模板文件已存在于 `src/features/lab/templates/`（`spring-pendulum.py`、`forced-pendulum.py`、`magnetic-pendulum.py`），模板内容为骨架（含 TODO 注释），本模块加载模板时使用已有的模板文件内容
  - Pyodide 独立于 JS Worker 的数据流与 SIM-01 的 ADR-001 决策一致
  - 无冲突
- **复用的已有定义**：`useLabStore.userCode` / `codeStatus` / `codeError` / `activeTemplate`、`useSimulationStore`（注入沙箱轨迹）、三个模板 `.py` 文件、`ObservabilityCoordinator.updatePyodideProgress()`

### 技术栈绑定

- **必须使用**：
  - `react@^18.3.1` — UI 组件（编辑器容器、运行按钮、状态指示器）
  - `codemirror@^6.0.1` — 代码编辑器核心（`@codemirror/view`、`@codemirror/state`）
  - `@codemirror/lang-python@^6.1.6` — Python 语法高亮与缩进支持
  - `@codemirror/view@^6.35.0` — 编辑器视图层（行号标注、错误行高亮）
  - `pyodide@^0.26.x` — WebAssembly Python 运行时（通过 `/public/pyodide/` 的离线包提供，依赖 `pyodide.js` + `pyodide.asm.wasm` + `python_stdlib.zip`）
  - `scipy`（Pyodide 内置）— `scipy.integrate.solve_ivp` 用于用户自定义 ODE 的精确自适应积分
  - `numpy`（Pyodide 内置）— 数组运算，`numpy.array` 供用户代码使用
  - `zustand@^4.5.5` — `useLabStore` 管理编辑器状态 + `useSimulationStore` 注入轨迹
  - `tailwindcss@^3.4.16` — 编辑器面板布局、按钮样式
  - `shadcn/ui`（Copy 模式）— `Button`（运行/停止/加载模板）、`Select`（模板选择下拉）、`Badge`（执行状态指示）、`Alert`（错误信息提示）
  - `lucide-react` — `Play`（运行）、`Square`（停止）、`Code2`（代码编辑器图标）、`AlertTriangle`（执行错误）、`CheckCircle2`（执行成功）、`Loader2`（执行中）
  - TypeScript 5.x — 类型安全
- **禁止使用**：
  - 禁止在 Pyodide 沙箱中允许 `import os`、`import sys`、`import subprocess`、`import shutil`、`import pathlib` 等文件系统/系统调用模块（白名单拦截）
  - 禁止在 Pyodide 执行期间允许用户发起第二次执行（`codeStatus === "running"` 时"运行"按钮 disabled）
  - 禁止将沙箱执行结果直接写入 `useSimulationStore` 的 `state` 字段（必须通过 `injectSandboxTrajectory` 专用 action，避免与 JS Worker 的 `state` 字段混淆）
  - 禁止使用 `eval()` 或 `new Function()` 在 JavaScript 侧执行用户代码（所有用户代码必须在 Pyodide WASM 沙箱内执行）
  - 禁止在模板代码中硬编码完整的运动方程实现（模板是教学起点，用户需自行完善）

### 输入定义（精确类型）

#### Store 读取与写入

```typescript
// ============================================================
// 从 useLabStore 读取（src/features/lab/store.ts，已存在）
// 本模块使用的字段：
// ============================================================

interface LabState {
  // ── 本模块使用的字段 ──

  /**
   * 当前加载的模板名称。
   * null: 用户未加载任何模板（空白编辑器或自由编写）
   * "spring-pendulum": 弹簧摆模板
   * "forced-pendulum": 受迫摆模板
   * "magnetic-pendulum": 磁力摆模板
   * 默认：null
   */
  activeTemplate: string | null;

  /**
   * 编辑器中的当前代码（Python 源码字符串）。
   * 默认：""（空字符串，首次进入时显示模板选择提示）
   */
  userCode: string;

  /**
   * 代码执行状态。
   * "idle": 未执行（初始状态或执行完成后）
   * "running": 正在 Pyodide 中执行
   * "error": 执行完成但出现 Python 异常（语法错误/运行时错误/超时）
   * "success": 执行成功，轨迹已注入 useSimulationStore
   * 默认："idle"
   */
  codeStatus: "idle" | "running" | "error" | "success";

  /**
   * 最近一次执行错误的详细信息。
   * codeStatus === "error" 时显示；codeStatus !== "error" 时为 null。
   * 格式：包含中文翻译的错误描述。
   * 默认：null
   */
  codeError: string | null;

  // ── Actions ──
  setUserCode: (code: string) => void;
  setCodeStatus: (status: "idle" | "running" | "error" | "success") => void;
  setCodeError: (error: string | null) => void;
}
```

#### Pyodide 沙箱执行环境

```typescript
// ============================================================
// Pyodide 沙箱的输入/输出契约
// 本模块内部类型，不对外暴露
// ============================================================

/**
 * 用户 Python 代码必须遵循的函数签名。
 * 通过 exec() 执行用户代码后，调用此函数获取 ODE 右端值。
 *
 * @param t - 当前仿真时间 (s)，float
 * @param state - 当前状态向量 [theta1, omega1, theta2, omega2]，numpy.ndarray of shape (4,)
 * @param params - 物理参数字典，包含 m1, m2, L1, L2, g, damping 及用户自定义参数
 * @returns 导数向量 [dtheta1, domega1, dtheta2, domega2]，numpy.ndarray of shape (4,)
 */
type PyodideODEFunction = (
  t: number,
  state: import("numpy").ndarray,
  params: Record<string, number>
) => import("numpy").ndarray;

/**
 * 用户代码必须定义的两个顶层变量。
 * Pyodide exec() 后从全局命名空间中提取。
 */
interface UserCodeExports {
  /** 运动方程函数。必须命名为 "equations" */
  equations: PyodideODEFunction;

  /** 系统参数字典。键为参数名（str），值为参数值（float） */
  system_params: Record<string, number>;
}
```

#### 模板定义

```typescript
// ============================================================
// 预设模板元数据
// 位置：src/features/lab/templates/index.ts
// ============================================================

interface CodeTemplate {
  /** 模板标识 */
  id: string;
  /** 模板中文名称 */
  label: string;
  /** 模板简短描述（Select 下拉项副文本） */
  description: string;
  /** 模板 Python 源码内容（从 .py 文件 import 或 fetch） */
  source: string;
  /** 模板图标（lucide-react 组件名） */
  iconName: "Spring" | "Waves" | "Magnet";
}

/** 三个预设模板的注册表 */
const CODE_TEMPLATES: CodeTemplate[] = [
  {
    id: "spring-pendulum",
    label: "弹簧摆",
    description: "将刚性杆替换为弹簧连接，引入弹性系数 k",
    source: "（从 spring-pendulum.py import 获取内容）",
    iconName: "Spring",
  },
  {
    id: "forced-pendulum",
    label: "受迫摆",
    description: "施加周期性驱动力，研究受迫混沌",
    source: "（从 forced-pendulum.py import 获取内容）",
    iconName: "Waves",
  },
  {
    id: "magnetic-pendulum",
    label: "磁力摆",
    description: "加入模拟洛伦兹力项，磁场中的双摆",
    source: "（从 magnetic-pendulum.py import 获取内容）",
    iconName: "Magnet",
  },
];
```

#### 白名单 import 定义

```typescript
// ============================================================
// Pyodide 沙箱白名单
// 位置：src/features/lab/sandbox/import-whitelist.ts
// ============================================================

/**
 * 允许用户在代码中 import 的模块白名单。
 * 任何不在白名单中的 import 语句在执行前被拦截并报错。
 */
const ALLOWED_IMPORTS: ReadonlySet<string> = new Set([
  "numpy",              // 数组运算
  "scipy.integrate",    // solve_ivp
  "scipy.constants",    // 物理常数（g, pi 等）
  "math",               // Python 标准数学库
  "cmath",              // 复数数学
]);

/**
 * 明确禁止的模块（不在 ALLOWED_IMPORTS 中的 import 一律拒绝）。
 * 额外列出以强化安全审查。
 */
const BLOCKED_MODULES: ReadonlySet<string> = new Set([
  "os", "sys", "subprocess", "shutil", "pathlib",
  "socket", "http", "urllib", "requests",
  "threading", "multiprocessing",
  "ctypes", "cffi",
  "builtins",           // open() 等文件操作
  "importlib",
  "inspect",
  "pickle",
  "marshal",
  "code", "codeop",
]);
```

### 输出定义（精确类型）

#### 沙箱执行结果

```typescript
// ============================================================
// Pyodide 执行完成后向 useSimulationStore 写入的数据
// ============================================================

/**
 * 沙箱轨迹数据。
 * Pyodide 执行 solve_ivp 后，将结果数组转换为 Float64Array 注入 store。
 */
interface SandboxTrajectory {
  /**
   * 仿真时间序列 (s)。
   * 长度 = N（总帧数）。
   * 示例：Float64Array([0, 0.0167, 0.0333, ...])
   */
  t: Float64Array;

  /**
   * 上摆角度序列 (rad)。
   * 长度 = N。
   */
  theta1: Float64Array;

  /**
   * 上摆角速度序列 (rad/s)。
   * 长度 = N。
   */
  theta1Dot: Float64Array;

  /**
   * 下摆角度序列 (rad)。
   * 长度 = N。
   */
  theta2: Float64Array;

  /**
   * 下摆角速度序列 (rad/s)。
   * 长度 = N。
   */
  theta2Dot: Float64Array;

  /**
   * solve_ivp 的执行统计。
   */
  stats: {
    /** 积分成功标志。0 = 成功，非 0 = 失败 */
    status: number;
    /** 积分终止时的仿真时间 (s) */
    tFinal: number;
    /** 函数求值次数 */
    nfev: number;
    /** 积分步数 */
    nSteps: number;
  };
}
```

#### 代码编辑器 UI 输出

本模块渲染在实验模式面板中的代码沙箱区。组件树结构：

```
CodeSandbox (容器组件)
├── SandboxToolbar                ← 工具栏：模板选择 + 运行/停止按钮
│   ├── <Select>                  ← 模板下拉选择器
│   │   ├── "空白编辑器"（默认）
│   │   ├── "弹簧摆"
│   │   ├── "受迫摆"
│   │   └── "磁力摆"
│   ├── <Button variant="default"> ← "运行"按钮（绿色 Play 图标）
│   │   disabled={codeStatus === "running" || pyodideLoading}
│   ├── <Button variant="outline"> ← "停止"按钮（仅 running 时可见）
│   │   onClick={abortExecution}
│   └── <Badge>                    ← 执行状态指示
│       variant={codeStatus === "success" ? "success" : codeStatus === "error" ? "destructive" : "secondary"}
│
├── CodeMirrorEditor              ← 代码编辑区（CodeMirror 6 实例）
│   ├── 语法高亮：Python（@codemirror/lang-python）
│   ├── 行号显示
│   ├── 错误行高亮（红色波浪下划线，通过 CM6 Diagnostic API）
│   │   仅在 codeStatus === "error" 且有行号信息时显示
│   ├── 只读模式：codeStatus === "running" 时编辑器只读
│   └── 主题：深色（适配实验室模式暗色主题）
│
├── SandboxErrorPanel             ← 错误信息面板（仅 codeStatus === "error" 时渲染）
│   └── <Alert variant="destructive">
│       ├── <AlertTriangle />
│       ├── 中文错误翻译："IndexError → 数组越界，请检查维度"
│       ├── 原始 Python traceback（折叠，点击展开）
│       └── 错误行号（可点击跳转到编辑器对应行）
│
└── SandboxLoadingOverlay         ← Pyodide 加载遮罩（首次加载时）
    ├── 进度条 + 百分比："正在加载 Python 运行时... 45%"
    ├── 预计剩余时间（基于下载速度估算）
    └── 加载失败时 → 重试按钮 + 离线提示
```

### 核心逻辑步骤

#### 步骤 1：Pyodide 加载与初始化（usePyodide hook）

- **操作对象**：Pyodide WebAssembly 运行时
- **具体操作**：
  1. 创建自定义 hook `usePyodide()`（`src/features/lab/hooks/usePyodide.ts`）
  2. hook 状态：
     ```typescript
     interface PyodideState {
       pyodide: PyodideInterface | null;
       isLoading: boolean;
       loadProgress: number;     // 0-100
       loadError: string | null;
       isReady: boolean;
     }
     ```
  3. 加载流程（三级缓存策略，技术栈设计 §5.2）：
     ```
     a. 检查本地文件系统：fetch('/pyodide/pyodide.js')
        → 成功：直接加载（0ms 网络延迟）
        → 失败：进入 IndexedDB 检查

     b. 检查 IndexedDB：打开 'pyodide-cache' object store
        → 命中（键 = 'pyodide-core-{VERSION}'）：从 ArrayBuffer 注入 WASM
        → 未命中：进入 CDN 回退

     c. CDN 回退（仅在线环境）：
        fetch('https://cdn.jsdelivr.net/pyodide/v0.26.0/full/pyodide.js')
        → 成功后写入 IndexedDB 缓存（键 = 'pyodide-core-{VERSION}'）
        → 失败：loadError = "Python 运行时加载失败，请检查网络连接"

     d. 加载完成后：await loadPyodide({ indexURL: '/pyodide/' })
        → 自动安装 SciPy + NumPy（Pyodide 内置包）
        → isReady = true，pyodide = 实例引用
     ```
  4. 每次进度更新调用 `observabilityCoordinator.updatePyodideProgress(pct)`
  5. hook 返回值：`{ pyodide, isLoading, loadProgress, loadError, isReady, runCode, abortExecution }`
- **输入来源**：浏览器环境（文件系统/IndexedDB/网络）
- **输出去向**：Pyodide 实例引用 → 步骤 3 的 `runCode` 使用
- **失败行为**：
  - 三级缓存全部失败 → `loadError` 显示，渲染离线提示按钮
  - 单级失败 → 自动降级到下一级（用户无感知，仅通过 `console.warn` 记录降级事件）

#### 步骤 2：模板加载

- **操作对象**：`useLabStore.userCode` + CodeMirror 编辑器内容
- **具体操作**：
  1. 用户从 `<Select>` 下拉选择模板
  2. `onChange` 回调：
     ```typescript
     function loadTemplate(templateId: string | null) {
       const store = useLabStore.getState();
       if (templateId === null) {
         // "空白编辑器"——清空代码区
         store.setUserCode("");
         store.setActiveTemplate(null);
         return;
       }

       const template = CODE_TEMPLATES.find(t => t.id === templateId);
       if (!template) return;

       // 设置代码内容
       store.setUserCode(template.source);
       store.setActiveTemplate(templateId);
       store.setCodeStatus("idle");
       store.setCodeError(null);

       // CodeMirror 编辑器通过 useEffect 监听 userCode 变化自动更新内容
     }
     ```
  3. 模板 `.py` 文件通过 Vite 的 `import` 作为字符串加载：
     ```typescript
     // 在模板注册表初始化时：
     import springSource from "./templates/spring-pendulum.py?raw";
     import forcedSource from "./templates/forced-pendulum.py?raw";
     import magneticSource from "./templates/magnetic-pendulum.py?raw";
     // Vite 的 ?raw 后缀将文件内容作为字符串导入
     ```
- **输入来源**：用户选择模板
- **输出去向**：CodeMirror 编辑器内容更新 + `userCode` 状态更新
- **失败行为**：模板文件 import 失败（文件不存在）→ 对应的 Select 选项 disabled，Tooltip 显示"模板文件缺失"

#### 步骤 3：代码执行（runCode）

- **操作对象**：Pyodide 实例 + CodeMirror 编辑器内容
- **具体操作**：

  ```typescript
  async function runCode() {
    const store = useLabStore.getState();
    const simStore = useSimulationStore.getState();
    const code = store.userCode.trim();

    // 1. 前置检查
    if (!code) {
      store.setCodeStatus("error");
      store.setCodeError("代码为空，请编写运动方程或加载模板");
      return;
    }
    if (!pyodide || !isReady) {
      store.setCodeStatus("error");
      store.setCodeError("Python 运行时未就绪，请等待加载完成");
      return;
    }

    // 2. 白名单检查（在 JS 侧用正则预检 import 语句）
    const importCheck = validateImports(code);
    if (!importCheck.valid) {
      store.setCodeStatus("error");
      store.setCodeError(`禁止导入模块: ${importCheck.blockedModule}。仅允许: ${[...ALLOWED_IMPORTS].join(", ")}`);
      return;
    }

    // 3. 开始执行
    store.setCodeStatus("running");
    store.setCodeError(null);

    // 4. 设置超时中断
    const timeoutId = setTimeout(() => {
      abortExecution();
      store.setCodeStatus("error");
      store.setCodeError("代码执行超时（超过 5 秒限制），请优化算法或减少仿真时长");
    }, 5000);

    try {
      // 5. 在 Pyodide 中执行用户代码
      await pyodide.runPythonAsync(code);

      // 6. 提取用户定义的 equations 函数和 system_params 字典
      const equations = pyodide.globals.get("equations");
      const systemParams = pyodide.globals.get("system_params");

      if (!equations) {
        throw new SandboxError("未找到 equations 函数。请确保代码中定义了 def equations(t, state, params):");
      }
      if (!systemParams) {
        throw new SandboxError("未找到 system_params 字典。请确保代码中定义了 system_params = {...}");
      }

      // 7. 构建 solve_ivp 调用
      const simDuration = 10; // 默认仿真时长 10s（用户可通过 system_params["T"] 覆盖）
      const T = systemParams.get("T") ?? simDuration;
      const dt = systemParams.get("dt") ?? 1/60; // 输出步长

      const solveIvpHookCode = `
  import numpy as np
  from scipy.integrate import solve_ivp

  # 获取初始条件（从当前仿真状态或默认值）
  ic = system_params.get("initial_conditions", [${simStore.theta1}, ${simStore.theta1Dot}, ${simStore.theta2}, ${simStore.theta2Dot}])

  # 构建参数元组
  params_tuple = (
      system_params["m1"], system_params["m2"],
      system_params["L1"], system_params["L2"],
      system_params["g"],
      system_params.get("damping", 0),
  )

  # 调用 solve_ivp
  t_eval = np.arange(0, ${T}, ${dt})
  sol = solve_ivp(
      lambda t, y: equations(t, y, system_params),
      (0, ${T}),
      ic,
      t_eval=t_eval,
      method="RK45",
      rtol=1e-9,
      atol=1e-12,
      max_step=${dt},
  )
  sol  # 返回给 JS 侧
  `;
      const sol = await pyodide.runPythonAsync(solveIvpHookCode);

      clearTimeout(timeoutId);

      // 8. 将 JsProxy 转换为 Float64Array
      const t = new Float64Array(sol.get("t").toJs());
      const y = sol.get("y").toJs();
      const theta1 = new Float64Array(y[0]);
      const theta1Dot = new Float64Array(y[1]);
      const theta2 = new Float64Array(y[2]);
      const theta2Dot = new Float64Array(y[3]);

      // 9. 注入 useSimulationStore（暂停 JS Worker 仿真，切换为沙箱轨迹）
      simStore.injectSandboxTrajectory({
        t, theta1, theta1Dot, theta2, theta2Dot,
        stats: {
          status: sol.get("status"),
          tFinal: sol.get("t")[sol.get("t").length - 1],
          nfev: sol.get("nfev"),
          nSteps: sol.get("t").length,
        },
      });

      // 10. 标记成功
      store.setCodeStatus("success");
    } catch (err) {
      clearTimeout(timeoutId);

      // 11. 错误处理
      const pythonError = err as PythonError;
      const lineNumber = extractLineNumber(pythonError.message);
      const chineseMessage = translatePythonError(pythonError.message);

      store.setCodeStatus("error");
      store.setCodeError(chineseMessage);

      // 12. 设置 CodeMirror 诊断（错误行高亮）
      if (lineNumber > 0) {
        setCMDiagnostics(lineNumber, chineseMessage);
      }
    }
  }
  ```

- **输入来源**：`useLabStore.userCode` + `useSimulationStore` 当前状态（作为初始条件）+ Pyodide 实例
- **输出去向**：`useSimulationStore`（沙箱轨迹数据）→ EXP-01 3D 场景自动切换至新模型
- **失败行为**：见步骤 4 的异常处理

#### 步骤 4：错误处理与中文翻译

- **操作对象**：Python traceback 字符串
- **具体操作**：

  ```typescript
  /**
   * Python 异常类型 → 中文翻译映射表。
   * 用于将原始 Python 异常消息翻译为中文教学提示。
   */
  const PYTHON_ERROR_TRANSLATIONS: Record<string, string> = {
    "SyntaxError": "语法错误",
    "IndentationError": "缩进错误——Python 使用缩进表示代码块，请检查空格和 Tab 混用",
    "NameError": "变量未定义——引用了不存在的变量或函数名",
    "TypeError": "类型错误——操作数类型不匹配。例如对 float 使用下标索引",
    "ValueError": "值错误——传入的参数值不合法。例如 solve_ivp 收到非法的 t_eval",
    "IndexError": "数组越界——索引超出数组长度，请检查维度",
    "KeyError": "字典键不存在——params 字典中缺少必需的参数键",
    "ZeroDivisionError": "除零错误——检查分母是否可能为零",
    "ImportError": "导入错误——请检查 import 语句。仅允许导入: numpy, scipy.integrate, math, cmath",
    "ModuleNotFoundError": "模块未找到——导入的模块不在白名单中。仅允许: numpy, scipy.integrate, math, cmath",
    "AttributeError": "属性错误——对象没有该属性。常见：numpy.array 写成了 numpy.Array",
    "OverflowError": "数值溢出——计算结果超出浮点数表示范围",
    "RuntimeError": "运行错误",
  };

  function translatePythonError(message: string): string {
    // 从 traceback 最后一行提取异常类型
    const match = message.match(/(\w+Error):\s*(.+)/);
    if (!match) {
      // 无匹配的异常类型，直接返回原始消息
      return `Python 异常: ${message.split("\n").pop() ?? message}`;
    }

    const [, errorType, errorDetail] = match;
    const chineseType = PYTHON_ERROR_TRANSLATIONS[errorType] ?? errorType;

    return `${chineseType} → ${errorDetail}`;
  }

  /**
   * 从 Python traceback 中提取错误行号。
   * Python traceback 格式：File "<exec>", line 15, in equations
   */
  function extractLineNumber(message: string): number {
    const match = message.match(/line (\d+)/);
    return match ? parseInt(match[1], 10) : -1;
  }
  ```

- **输入来源**：Pyodide 异常对象的 `message` 属性
- **输出去向**：`useLabStore.codeError` + CodeMirror 诊断（行号高亮 + 红色波浪线）
- **失败行为**：无法提取行号 → 仅显示错误信息文本，不高亮代码行

#### 步骤 5：CodeMirror 6 编辑器初始化

- **操作对象**：CodeMirror 6 `EditorView` 实例
- **具体操作**：
  1. 在 `useEffect` 中创建编辑器实例：
     ```typescript
     import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
     import { EditorState } from "@codemirror/state";
     import { python } from "@codemirror/lang-python";
     import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
     import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
     import { oneDark } from "@codemirror/theme-one-dark";

     function createEditor(
       parent: HTMLElement,
       initialCode: string,
       onChange: (code: string) => void
     ): EditorView {
       const view = new EditorView({
         parent,
         state: EditorState.create({
           doc: initialCode,
           extensions: [
             python(),                                        // Python 语法高亮
             lineNumbers(),
             highlightActiveLine(),
             syntaxHighlighting(defaultHighlightStyle),
             oneDark,                                         // 深色主题
             keymap.of([...defaultKeymap, ...historyKeymap]),
             history(),
             EditorView.updateListener.of((update) => {
               if (update.docChanged) {
                 onChange(view.state.doc.toString());
               }
             }),
             EditorView.editable.of(true),                   // 动态切换只读/可编辑
           ],
         }),
       });
       return view;
     }
     ```
  2. 监听 `codeStatus` 切换只读模式：
     ```typescript
     useEffect(() => {
       if (!editorRef.current) return;
       const editable = codeStatus !== "running";
       editorRef.current.dispatch({
         effects: EditorView.editable.reconfigure(
           EditorView.editable.compute(editorRef.current.state, editable)
         ),
       });
     }, [codeStatus]);
     ```
  3. 监听 `codeStatus === "error"` 时设置诊断：
     ```typescript
     import { setDiagnostics } from "@codemirror/lint";

     function setCMDiagnostics(lineNumber: number, message: string) {
       if (!editorRef.current) return;
       const doc = editorRef.current.state.doc;
       const line = doc.line(lineNumber);
       setDiagnostics(editorRef.current.state, [{
         from: line.from,
         to: line.to,
         severity: "error",
         message,
       }]);
     }
     ```
  4. 编辑器容器在组件卸载时 `editorRef.current.destroy()` 清理
- **输入来源**：`useLabStore.userCode`（初始内容）+ 用户键盘输入
- **输出去向**：`useLabStore.setUserCode(code)` 同步编辑器内容到 store
- **失败行为**：`@codemirror/lang-python` 加载失败 → 编辑器降级为无语法高亮的纯文本模式（基础 CodeMirror 状态）

#### 步骤 6：沙箱轨迹注入与 3D 场景切换

- **操作对象**：`useSimulationStore`（需扩展 `injectSandboxTrajectory` action）
- **具体操作**：
  1. 在 `useSimulationStore` 中新增 action 和字段：
     ```typescript
     // src/features/simulation/store.ts 扩展
     interface SimulationState {
       // ... 已有字段 ...

       /** 当前轨迹数据来源 */
       trajectorySource: "worker" | "sandbox";
       /** 沙箱轨迹数据（仅在 source === "sandbox" 时有效） */
       sandboxTrajectory: SandboxTrajectory | null;
       /** 注入沙箱轨迹 */
       injectSandboxTrajectory: (traj: SandboxTrajectory) => void;
     }

     // 在 create() 中实现：
     injectSandboxTrajectory: (traj) => set({
       trajectorySource: "sandbox",
       sandboxTrajectory: traj,
       isRunning: true,
       // 更新顶层 state 字段以兼容 EXP-01 的订阅
       theta1: traj.theta1[traj.theta1.length - 1] ?? 0,
       theta1Dot: traj.theta1Dot[traj.theta1Dot.length - 1] ?? 0,
       theta2: traj.theta2[traj.theta2.length - 1] ?? 0,
       theta2Dot: traj.theta2Dot[traj.theta2Dot.length - 1] ?? 0,
       t: traj.t[traj.t.length - 1] ?? 0,
     }),
     ```
  2. EXP-01 的 `useFrame` 订阅检测 `trajectorySource`：
     - `"worker"` → 从 RingBuffer 消费 JS Worker 轨迹（现有逻辑）
     - `"sandbox"` → 从 `sandboxTrajectory` 消费 Pyodide 轨迹
       - 在 `useFrame` 中按 `sandboxTrajectory.t` 的时间轴推进 `consumeIndex`
       - 每帧从 `sandboxTrajectory` 中取一帧数据写入 R3F 对象
       - 到达轨迹末尾后循环（或停止，取决于 `system_params["loop"]`）
  3. 用户可随时点击"停止沙箱"按钮 → `trajectorySource = "worker"` → 恢复 JS Worker 仿真
- **输入来源**：`SandboxTrajectory`（步骤 3 产生）
- **输出去向**：EXP-01 3D 场景使用沙箱轨迹驱动摆体运动
- **失败行为**：`sandboxTrajectory` 为空或轨迹长度为 0 → 3D 场景冻结在最后位置，显示错误提示

### 依赖与集成接口

| 依赖方 | 具体接口 | 用途 |
|--------|----------|------|
| `useLabStore` | `(s) => s.userCode` / `(s) => s.codeStatus` / `(s) => s.codeError` / `(s) => s.activeTemplate` | 读写编辑器状态 |
| `useLabStore` | `getState().setUserCode(code)` / `setCodeStatus(s)` / `setCodeError(e)` | 更新编辑器状态 |
| `useSimulationStore` | `getState().theta1, theta1Dot, theta2, theta2Dot` | 读取当前状态作为 solve_ivp 初始条件 |
| `useSimulationStore` | `getState().injectSandboxTrajectory(traj)` | 注入沙箱轨迹（需在 store 中新增此 action） |
| `useSimulationStore` | `getState().setRunning(bool)` | 控制仿真运行状态 |
| Pyodide | `loadPyodide({ indexURL })` → `PyodideInterface` | 加载 WASM Python 运行时 |
| Pyodide | `pyodide.runPythonAsync(code)` | 执行用户 Python 代码 |
| Pyodide | `pyodide.globals.get(name)` | 提取用户定义的函数和变量 |
| SciPy (Pyodide) | `scipy.integrate.solve_ivp` | 精确自适应积分用户自定义 ODE |
| CodeMirror 6 | `EditorView` / `EditorState` / `python()` / `oneDark` / `setDiagnostics()` | 编辑器实例、语法高亮、深色主题、错误行标注 |
| `observabilityCoordinator` | `updatePyodideProgress(pct)` | 追踪 Pyodide 加载进度 |
| INF-01 | `debugInfo.pyodideLoadPct` | 调试面板展示 Pyodide 加载状态 |

### 状态机

Pyodide 加载与代码执行状态机：

| 当前状态 | 触发事件 | 下一状态 | 前置条件 | 副作用 |
|----------|----------|----------|----------|--------|
| `pyodide:unloaded` | 用户首次进入实验模式 | `pyodide:loading` | Pyodide 实例为 null | 开始三级缓存加载流程；显示加载进度遮罩 |
| `pyodide:loading` | 三级缓存中任一级成功 | `pyodide:ready` | WASM 初始化完成 + SciPy/NumPy 已安装 | 隐藏加载遮罩；pyodide 实例可用；INF-01 progress = 100 |
| `pyodide:loading` | 三级缓存全部失败 | `pyodide:error` | — | 显示错误提示 + 重试按钮；INF-01 progress = -1 |
| `pyodide:error` | 用户点击"重试" | `pyodide:loading` | — | 重新开始三级缓存加载流程 |
| `code:idle` | 用户点击"运行" | `code:running` | pyodide:ready；userCode 非空；白名单检查通过 | 编辑器只读；运行按钮 disabled；启动 5s 超时；保存当前仿真状态 |
| `code:running` | Pyodide 执行成功 | `code:success` | solve_ivp 返回 status=0 | 轨迹注入 useSimulationStore；3D 场景切换至沙箱模型；编辑器恢复可写；绿色 Badge |
| `code:running` | Pyodide 抛出异常 | `code:error` | — | codeError 设置为中文翻译消息；CodeMirror 错误行高亮；红色 Badge；编辑器恢复可写 |
| `code:running` | 5s 超时 | `code:error` | — | 中断 Pyodide 执行；codeError = "超时"；编辑器恢复可写 |
| `code:running` | 用户点击"停止" | `code:idle` | — | 中断 Pyodide 执行；编辑器恢复可写；codeError 清空；恢复 JS Worker 仿真 |
| `code:success` | 用户修改代码 | `code:idle` | — | codeStatus 重置为 idle（表示新代码与当前运行结果不同步） |
| `code:error` | 用户修改代码 | `code:idle` | — | codeStatus 重置为 idle；错误消息和诊断清空 |

### 异常与边界条件

#### 异常 1：Pyodide 加载失败（三级缓存全部不可用）

- **触发条件**：本地文件缺失 + IndexedDB 缓存过期 + CDN 不可达（离线环境或无网络）
- **处理策略**：
  1. `loadError = "Python 运行时加载失败"`
  2. 编辑器区域显示 `<Alert variant="destructive">`："Python 运行时不可用：无法下载 WebAssembly 模块。沙箱功能需要网络连接或预加载的离线包"
  3. 提供"重试"按钮（重新走三级缓存流程）
  4. 提供"下载离线包"链接（指向 GitHub Release 的 pyodide-offline.zip）
  5. 编辑器仍可查看和编辑代码（只读模式的编辑器），但"运行"按钮永久 disabled
  6. LAB-02 的 JS/Python 交叉校验对应项标记为"不可用"
- **重试参数**：用户手动点击重试。每次重试走完整三级缓存流程

#### 异常 2：用户代码导致 Pyodide 死循环

- **触发条件**：用户代码中包含 `while True` 或无限递归等，在 `solve_ivp` 的 ODE 函数中触发
- **处理策略**：
  1. `solve_ivp` 本身有 `max_step` 参数限制步长（默认 `dt = 1/60`），不会无限细分
  2. 但 ODE 函数 `equations(t, state, params)` 内的死循环无法被 `solve_ivp` 检测
  3. 主线程的 5 秒 `setTimeout` 超时保护是最后防线——超时后调用 `abortExecution()`
  4. `abortExecution()` 通过 Pyodide 的 `pyodide.setInterruptBuffer()` 发送中断信号
  5. 中断后 Pyodide 抛出 `KeyboardInterrupt` → 捕获为超时错误
- **重试参数**：不自动重试

#### 异常 3：solve_ivp 积分失败（数值发散或 stiff 方程）

- **触发条件**：用户方程在参数空间某区域数值不稳定，`solve_ivp` 返回 `status != 0`
- **处理策略**：
  1. 检查 `sol.get("status")` 值：
     - `status = 1`：积分达到 `t_bound`（正常完成，但可能在达到前步长已极小）
     - `status = -1`：积分发散（多数步长缩减到最小值）
  2. `status < 0` → 标记 `codeStatus = "error"`
  3. `codeError = "积分发散：数值解不稳定。请尝试：(1) 减小仿真时长 T；(2) 放宽 rtol/atol 容差；(3) 检查运动方程是否存在除零/奇点"`
  4. 不注入轨迹到 store（保留之前的状态）
- **重试参数**：不自动重试

#### 异常 4：用户代码修改了全局 Pyodide 命名空间

- **触发条件**：用户在代码中覆盖了 `numpy`、`scipy` 等关键模块的引用，或定义了与 shim 变量同名的全局变量
- **处理策略**：
  1. 每次 `runCode` 前，通过 `pyodide.runPythonAsync("import numpy; import scipy.integrate")` 重置关键模块
  2. 执行用户代码在单独的 `pyodide.globals` 子作用域中（通过 `pyodide.runPythonAsync(code, { globals: pyodide.globals })`）
  3. 执行后清理用户定义的全局变量（`del pyodide.globals["equations"]; del pyodide.globals["system_params"]`），避免污染下次执行
- **重试参数**：自动（每次执行前清理）

#### 异常 5：沙箱轨迹长度过大导致内存问题

- **触发条件**：用户设置 `T = 10000`（仿真 10000s × 60fps = 600,000 帧 × 4 变量 × 8 bytes ≈ 19.2MB），超过合理范围
- **处理策略**：
  1. 在 JS 侧校验 `T` 和 `dt`：`T / dt <= 12000`（最多 12000 帧 = 200s @60fps，约 384KB）
  2. 超出限制 → 拒绝执行，`codeError = "仿真时长过长：最大支持 T/dt = 12000 帧。请增大 dt 或减小 T"`
  3. 推荐用户在 `system_params` 中设置 `"T": 10, "dt": 1/60`
- **重试参数**：不自动重试。用户调整 `T` 和 `dt` 后重新运行

### 原则兑现清单

| 原则来源 | 原则名称 | 代码级约束 |
|----------|----------|------------|
| 功能设计_v0 §五 5.3 | 白名单 import | 仅允许 `numpy`、`scipy.integrate`、`scipy.constants`、`math`、`cmath`；在 JS 侧用正则预检 + 在 Pyodide 侧通过 `import` 校验双重保障 |
| 功能设计_v0 §五 5.3 | 执行超时 5s | `setTimeout(5000)` + Pyodide `setInterruptBuffer()` 双重保障；超时后显示友好中文提示 |
| 功能设计_v0 §五 5.3 | 行号高亮 + 中文错误翻译 | Python traceback → 正则提取行号 → CM6 `setDiagnostics` 红色波浪线；异常类型 → 中文翻译映射表（`PYTHON_ERROR_TRANSLATIONS`） |
| 功能设计_v0 §五 5.3 | 3 个预设模板 | 弹簧摆/受迫摆/磁力摆 通过 Vite `?raw` import 加载为字符串；模板为教学骨架（含 TODO 注释） |
| 功能设计_v0 §五 5.3 | 修改代码后即时生效 | `runCode` → `solve_ivp` → 轨迹注入 `useSimulationStore` → EXP-01 `useFrame` 消费 → 3D 场景立即切换 |
| 技术栈设计 ADR-001 | Pyodide 与 JS Worker 独立 | 沙箱通过 Pyodide + SciPy 独立计算，不经过 JS Worker；两套实现在 LAB-02 中交叉校验 |
| 技术栈设计 §5.2 | Pyodide 三级缓存 | 本地文件 → IndexedDB → CDN 回退；首次加载后持久化缓存；二级访问零网络请求 |
| 通用原则 | 逻辑与表现分离 | `usePyodide` hook 管理所有 Pyodide 加载/执行逻辑；`CodeSandbox` 组件仅负责渲染编辑器 + 按钮 + 错误面板 |

### 验收测试场景

#### 正向测试 1：加载弹簧摆模板并成功运行

- **Given**：
  - Pyodide 已成功加载并初始化（`isReady = true`）
  - 用户在实验模式的代码沙箱区域
  - `useSimulationStore` 中当前仿真状态：`theta1=1.57, theta1Dot=0, theta2=1.57, theta2Dot=0`
- **When**：
  1. 用户从模板下拉选择器中选择"弹簧摆"
  2. CodeMirror 编辑器内容更新为 `spring-pendulum.py` 的内容
  3. 用户在编辑器中将 `return np.array([om1, 0.0, om2, 0.0])` 补充为完整的弹簧摆 ODE 实现
  4. 用户点击"运行"按钮（绿色 Play 图标）
- **Then**：
  - 编辑器变为只读状态（灰色背景）
  - 运行按钮变为 disabled + spinner
  - Badge 显示"运行中"（黄色 Loader2 图标）
  - 约 0.5-2 秒后（取决于仿真时长 T）：
    - Badge 变为"运行成功"（绿色 CheckCircle2）
    - 3D 场景中的摆体开始按照弹簧摆模型运动（区别于标准双摆的运动模式）
    - 编辑器恢复可写
    - `codeError` 为 null
  - 无控制台错误

#### 正向测试 2：语法错误被正确翻译和定位

- **Given**：Pyodide 就绪，用户编写了包含语法错误的代码
- **When**：用户在代码中写入：
  ```python
  def equations(t, state, params):
      return np.array([om1, 0.0, om2, 0.0])
      # 缺少 import numpy as np
  ```
  点击"运行"
- **Then**：
  - Badge 变为"运行失败"（红色 AlertTriangle）
  - `codeError` 显示："变量未定义——引用了不存在的变量或函数名 → name 'np' is not defined"
  - CodeMirror 编辑器中对应的行（`return np.array(...)`）出现红色波浪下划线
  - 编辑器恢复可写
  - 3D 场景仍显示之前的仿真状态（未受影响）

#### 正向测试 3：修改代码后再次运行覆盖之前的结果

- **Given**：用户已成功运行弹簧摆模板一次（`codeStatus = "success"`）
- **When**：用户在编辑器中修改 `k` 值从 `10.0` 改为 `50.0`，再次点击"运行"
- **Then**：
  - `codeStatus` 重置为 `"running"` → 执行完成 → `"success"`
  - 3D 场景中的运动模式发生变化（弹簧更硬，运动幅度更小）
  - 上一次的运行结果被覆盖（无轨迹残留）

#### 异常测试 1：运行空白代码被拒绝

- **Given**：编辑器内容为空字符串（用户清空了代码或选择了"空白编辑器"）
- **When**：用户点击"运行"
- **Then**：
  - 不向 Pyodide 发送执行请求
  - `codeStatus = "error"`
  - `codeError = "代码为空，请编写运动方程或加载模板"`
  - 不显示行号高亮（无代码行）
  - 3D 场景保持当前状态

#### 异常测试 2：执行超时——死循环被中断

- **Given**：Pyodide 就绪，用户在代码中写入了死循环：
  ```python
  def equations(t, state, params):
      while True:
          pass
      return np.array([0.0, 0.0, 0.0, 0.0])
  ```
- **When**：用户点击"运行"
- **Then**：
  - 5 秒后自动中断执行
  - `codeStatus = "error"`
  - `codeError = "代码执行超时（超过 5 秒限制），请优化算法或减少仿真时长"`
  - 编辑器恢复可写
  - Pyodide 实例保持可用（未因中断崩溃）

#### 异常测试 3：导入非法模块被白名单拦截

- **Given**：Pyodide 就绪
- **When**：用户在代码中写入 `import os`，点击"运行"
- **Then**：
  - JS 侧白名单校验（`validateImports`）检测到 `import os`
  - `codeStatus = "error"`
  - `codeError = "禁止导入模块: os。仅允许: numpy, scipy.integrate, scipy.constants, math, cmath"`
  - 不向 Pyodide 发送代码（在 JS 侧拦截，节省 Pyodide 执行开销）
  - CodeMirror 中 `import os` 行出现红色波浪线

### 注意事项与禁止行为

1. **【Pyodide 懒加载】** Pyodide WASM 运行时约 18MB，禁止在应用首屏加载时同步下载。必须使用懒加载——仅在用户首次进入实验模式时触发加载。加载过程中显示进度条和预计剩余时间

2. **【沙箱隔离】** 每次 `runCode` 执行前必须通过 `pyodide.runPythonAsync("import numpy; import scipy.integrate")` 重置关键模块引用。执行后必须删除用户定义的全局变量（`del pyodide.globals["equations"]` 等），防止两次执行间的状态污染

3. **【禁止直接调用 JS Worker 的 ODE 函数】** 沙箱的 ODE 积分必须走 Pyodide + SciPy `solve_ivp` 路径，禁止将用户 Python 代码中的 `equations` 函数转换为 JS 后在 Worker 中运行（类型转换不可靠且失去 Pyodide 沙箱的安全隔离）

4. **【solve_ivp 的 JsProxy 转换】** Pyodide 返回的 NumPy 数组是 `JsProxy` 类型，必须通过 `.toJs()` 转换为 JavaScript 数组后再创建 `Float64Array`。直接访问 `JsProxy` 的下标是 O(n) 的（每次索引都跨 WASM 边界），必须先完整转换：
   ```typescript
   // ✅ 正确：一次性转换
   const y = sol.get("y").toJs();
   const theta1 = new Float64Array(y[0]);

   // ❌ 错误：逐元素跨 WASM 边界访问
   for (let i = 0; i < sol.get("y")[0].length; i++) {
     theta1[i] = sol.get("y")[0][i];  // 每次迭代都跨越 WASM↔JS 边界，极慢
   }
   ```

5. **【CodeMirror 实例生命周期】** 编辑器实例在组件挂载时创建（`new EditorView`），在组件卸载时必须调用 `editorRef.current.destroy()` 销毁。禁止在未销毁的情况下重新创建编辑器（会导致 DOM 中残留多个编辑器实例和内存泄漏）

6. **【中断后 Pyodide 状态恢复】** `abortExecution()` 通过 `setInterruptBuffer` 中断 Pyodide 执行后，Pyodide 实例可能处于不一致状态。中断后必须执行 `pyodide.runPythonAsync("pass")` 来检查实例是否仍可用。若不可用 → 重新加载 Pyodide（重新走三级缓存流程中的 IndexedDB 层，无需重新下载）

7. **【禁止在模板中包含完整的正确实现】** 模板是教学骨架，必须包含 `# TODO:` 注释引导用户补全。若模板已经包含完整的正确 ODE 实现，则失去了"用户可编程"的教学意义。模板内容应由物理教学专家审阅

8. **【易错点】** `solve_ivp` 的参数 `t_eval` 生成：`np.arange(0, T, dt)` 在 Python 中可能因浮点精度在最后一个元素超出 `T` 而导致数组长度不一致。建议使用 `np.linspace(0, T, int(T/dt) + 1)` 或 `np.arange(0, T + dt/2, dt)`，确保包含终点

9. **【易错点】** Pyodide 的 `runPythonAsync` 返回值类型：`sol` 是一个 `PyProxy` 对象（`OpaqueResult`），其属性访问（`.get("t")`、`.get("y")`）返回的都是 `PyProxy`。在 JS 侧使用这些值之前必须调用 `.toJs()` 转换。未转换的 `PyProxy` 会在离开作用域时被 Python GC 回收，导致后续访问报错
