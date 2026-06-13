# 功能点：LAB-02 物理验证套件

> **文档生成时间**：2026-04-28 21:48:23 CST
> **版本记录**：
> | 版本 | 时间 | 修改人 | 变更摘要 |
> |------|------|--------|----------|
> | v1.0 | 2026-04-28 21:48:23 | AI Assistant | 初始版本，对齐已有 `useLabStore.validationResults` + SIM-01 Worker 接口 + INF-02 CI 物理回归测试 |

> **冲突核查指引**：本模块消费已有 `useLabStore.validationResults`（`src/features/lab/store.ts` 已定义）和 SIM-01 的 Worker 接口。三项验证的通过标准与 INF-02 CI 物理回归测试保持一致。无冲突。

### 所属模块与溯源

- **对应总设计章节**：功能设计_v0 §五 5.2「物理验证套件」；功能模块全拆解 §四 LAB-02「物理验证套件」；技术栈设计 §2 #25「物理回归测试」、§4.12「快照与历史回放」（交叉校验引用）
- **依赖的其他功能模块**：
  - `SIM-01`（双摆物理引擎）— 通过 Worker 发送验证场景的参数集并接收仿真输出（能量/周期/轨迹数据）
  - `LAB-03`（用户可编程沙箱）— 两套 ODE 实现在本模块中交叉校验一致性（JS RK4 与 Pyodide SciPy `solve_ivp` 对比）
- **被依赖模块**：`INF-02`（持续部署管线）— CI Stage 2 运行相同的物理验证逻辑（但以 Vitest 而非 UI 交互方式）；`INF-03`（自动化测试体系）— 测试分层中物理回归测试归属于本模块定义的验证逻辑

### 已有设计兼容性分析

- **已审查的相关规格文档**：
  - `SIM-01-双摆物理引擎.md` v2.1：§「依赖与集成接口」表中明确定义了 LAB-02 的接口——通过 Worker `postMessage` 批量运行验证场景，Worker 输出能量/周期数据；§「验收测试」中定义了相同的三项验证通过标准（小角度 < 2%、周期吻合 < 1% 误差、能量漂移 < 0.5%）
  - `LAB-01-受力拆解视图.md` v1.0：两者共享 `useLabStore`；LAB-01 使用 `coordinateSystem` 字段，LAB-02 使用 `validationResults` 字段，字段无重叠无冲突；LAB-01 依赖 Worker 获取力分量，LAB-02 依赖 Worker 获取验证数据
  - `双摆混沌实验室-技术栈设计.md` v1.2：§9.4 CI/CD 物理回归测试代码示例（`smallAngleRegression` / `singlePendulumRegression` / `energyConservation`），本模块的验证逻辑与之完全一致（同一套通过标准）
  - `INF-02-持续部署管线.md` v1.0：CI Stage 2 物理回归测试步骤使用相同的 `physics.test.ts`，但 CI 版本无 UI 交互层
- **兼容性结论**：
  - 已有 `useLabStore.validationResults` 类型完全符合本模块需求：`{ smallAngle: ValidationStatus; singlePendulum: ValidationStatus; energy: ValidationStatus }`，其中 `ValidationStatus = "idle" | "running" | "passed" | "failed"`
  - 三项验证的通过标准在 SIM-01 §验收测试 中已有精确定义，本模块直接引用，不重新定义
  - 与 LAB-01 无 store 字段冲突（各自使用 `labStore` 的不同字段）
  - 与 INF-02 CI 物理回归测试共享相同的验证逻辑核心，但 UI 触发方式不同（用户手动一键验证 vs CI 自动运行）
  - 无冲突
- **复用的已有定义**：`useLabStore.validationResults`（`src/features/lab/store.ts`）、`ValidationStatus` 类型、SIM-01 Worker 的 `init`/`step` 消息协议、`useSimulationStore.params` / `useSimulationStore.initialConditions`

### 技术栈绑定

- **必须使用**：
  - `react@^18.3.1` — UI 组件（验证卡片、状态徽章、结果面板）
  - `zustand@^4.5.5` — `useLabStore`（读写 `validationResults`）+ `useSimulationStore`（读取当前参数和初始条件）
  - `shadcn/ui`（Copy 模式）— `Button`（"一键验证"按钮）、`Badge`（通过/失败状态徽章）、`Card`（验证项卡片）、`Tooltip`（不通过时的修复建议）、`Alert`（全通过时的绿色成功提示）
  - `lucide-react` — `CheckCircle2`（通过）、`XCircle`（失败）、`Loader2`（运行中）、`FlaskConical`（实验图标）
  - `tailwindcss@^3.4.16` — 卡片布局、颜色编码（绿色通过/红色失败/黄色运行中/灰色未运行）
  - TypeScript 5.x — 类型安全
- **禁止使用**：
  - 禁止在主线程执行 ODE 积分（验证场景的仿真必须在 Worker 中运行，与 SIM-01 的约定一致）
  - 禁止绕过 SIM-01 的 Worker 消息协议直接调用 `rk4Step` 或 `odeRhs`（所有物理计算必须走 Worker，确保验证的是实际仿真路径而非隔离的纯函数）
  - 禁止在验证运行期间修改 `useSimulationStore` 的 `params` 或 `initialConditions`（验证需要精确受控的参数集，用户在此期间不可调节）
  - 禁止使用 `setTimeout` 估算仿真时长（验证涉及 1000s 仿真时间的能量守恒测试，实际运行时间取决于 Worker 批处理速度，必须通过 Worker 消息驱动的状态机管理）

### 输入定义（精确类型）

#### Store 读取

```typescript
// ============================================================
// 从 useLabStore 读取（src/features/lab/store.ts，已存在）
// ============================================================

/**
 * 单个验证项的状态。
 * - "idle": 尚未运行
 * - "running": 正在 Worker 中执行仿真
 * - "passed": 验证通过
 * - "failed": 验证未通过
 */
type ValidationStatus = "idle" | "running" | "passed" | "failed";

/** 验证结果集合。useLabStore.validationResults 的类型。 */
interface ValidationResults {
  smallAngle: ValidationStatus;
  singlePendulum: ValidationStatus;
  energy: ValidationStatus;
}

// 使用方式：
// const validationResults = useLabStore((s) => s.validationResults);
// const setValidationResult = useLabStore((s) => s.setValidationResult);
```

```typescript
// ============================================================
// 从 useSimulationStore 读取（用于恢复验证前的仿真状态）
// ============================================================

// 验证开始前缓存以下值（用于验证完成后恢复）：
// const cachedParams = useSimulationStore.getState().params;
// const cachedIC = useSimulationStore.getState().initialConditions;
// const cachedDamping = useSimulationStore.getState().params.damping;
```

#### 验证场景参数定义

```typescript
// ============================================================
// 本模块内部常量——三项验证的精确参数集
// 位置：src/features/lab/validation/validation-scenarios.ts
// ============================================================

import type { PendulumParams, InitialConditions } from "@/shared/types";

/**
 * 单个验证场景的完整定义。
 */
interface ValidationScenario {
  /** 验证项标识 */
  id: keyof ValidationResults;
  /** 验证项中文名称 */
  label: string;
  /** 验证项描述（Tooltip 内容） */
  description: string;
  /** 物理参数配置 */
  params: PendulumParams;
  /** 初始条件配置 */
  initialConditions: InitialConditions;
  /** 验证所需仿真时长 (s) */
  simDuration: number;
  /** 通过标准——人类可读的描述 */
  passCriteria: string;
  /** 不通过时的修复建议 */
  failureHint: string;
}

/**
 * 三项验证场景的完整定义。
 * 参数值来自功能设计_v0 §五 5.2 的验证项表格。
 */
const VALIDATION_SCENARIOS: ValidationScenario[] = [
  {
    id: "smallAngle",
    label: "小角度线性化",
    description: "将两摆初始角度均设为 3° 以内，对比 RK4 数值解与线性化解析解，验证小角度近似成立",
    params: {
      m1: 1.0,
      m2: 1.0,
      L1: 1.0,
      L2: 1.0,
      g: 9.81,
      damping: 0,          // 无阻尼以匹配线性化解
    },
    initialConditions: {
      theta1: 0.05236,     // 3° → 弧度（3 × π / 180 ≈ 0.05236 rad）
      theta1Dot: 0,
      theta2: 0.03491,     // 2° → 弧度（2 × π / 180 ≈ 0.03491 rad）
      theta2Dot: 0,
    },
    simDuration: 10,       // 仿真 10 秒
    passCriteria: "数值解与线性化解的最大相对偏差 < 2%",
    failureHint: "请检查积分步长设置（当前固定 dt = 1/60s）。若步长正常，可能是 ODE 右端函数实现与标准拉格朗日方程不一致",
  },
  {
    id: "singlePendulum",
    label: "单摆退化",
    description: "将下摆质量设为 0（m₂ → 0），系统应退化为单摆，周期与 T = 2π√(L₁/g) 吻合",
    params: {
      m1: 1.0,
      m2: 1e-6,            // 近似为 0（避免 odeRhs 分母中出现除零。1e-6 kg 的物理影响可忽略）
      L1: 1.0,
      L2: 1.0,             // L₂ 保留 1.0（即使 m₂≈0，杆仍存在但不影响运动）
      g: 9.81,
      damping: 0,          // 无阻尼以精确测量周期
    },
    initialConditions: {
      theta1: 0.17453,     // 10° → 弧度（保证小角度周期公式精度）
      theta1Dot: 0,
      theta2: 0,           // 下摆初始角度和角速度对退化后的系统无影响
      theta2Dot: 0,
    },
    simDuration: 20,       // 仿真 20 秒（大约 10 个周期）
    passCriteria: `检测到的上摆运动周期与理论值 T = 2π√(L₁/g) ≈ 2.00607s 的误差 < 1%`,
    failureHint: "请检查单摆退化逻辑：m₂ → 0 时，下摆杆应变为无质量连杆。若周期偏差过大，可能是 odeRhs 分母 denom = m₁+m₂-m₂cos²(δ) 在 m₂ 极小时的数值精度问题",
  },
  {
    id: "energy",
    label: "能量守恒",
    description: "关闭阻尼，长时间运行仿真（1000s），检测总能量是否守恒",
    params: {
      m1: 1.0,
      m2: 1.0,
      L1: 1.0,
      L2: 1.0,
      g: 9.81,
      damping: 0,          // 无阻尼，总能量理论上守恒
    },
    initialConditions: {
      theta1: Math.PI / 2, // 90°（大角度混沌初始条件，能量守恒的严格检验）
      theta1Dot: 0,
      theta2: Math.PI / 2,  // 90°
      theta2Dot: 0,
    },
    simDuration: 1000,     // 仿真 1000 秒
    passCriteria: "1000s 内总能量 E = K + V 的最大相对漂移 |E_max - E_min| / |E_initial| < 0.5%",
    failureHint: "请检查：(1) 阻尼系数是否为 0；(2) ODE 右端函数中阻尼项是否正确实现；(3) 积分方法——Euler 方法的能量漂移远超 RK4，确认当前为 RK4 或 Velocity Verlet",
  },
];
```

#### 验证执行的 Worker 消息扩展

```typescript
// ============================================================
// 验证套件专用的 Worker 消息类型
// 在 SIM-01 现有的 WorkerCommand 联合类型基础上扩展
// ============================================================

/**
 * 验证运行命令——主线程 → Worker。
 * 指示 Worker 使用指定的参数和初始条件运行仿真，并收集验证所需的数据。
 */
interface WorkerRunValidationCommand {
  type: "runValidation";
  /** 验证场景 ID */
  scenarioId: "smallAngle" | "singlePendulum" | "energy";
  /** 物理参数 */
  params: PendulumParams;
  /** 初始条件 */
  initialConditions: InitialConditions;
  /** 仿真时长 (s) */
  simDuration: number;
}

/**
 * 验证完成响应——Worker → 主线程。
 */
interface WorkerValidationResultResponse {
  type: "validationResult";
  /** 验证场景 ID */
  scenarioId: "smallAngle" | "singlePendulum" | "energy";
  /** 是否通过 */
  passed: boolean;
  /** 具体测量值（用于 UI 展示） */
  metrics: ValidationMetrics;
}

/**
 * 各验证项的具体测量值。
 */
type ValidationMetrics =
  | SmallAngleMetrics
  | SinglePendulumMetrics
  | EnergyMetrics;

interface SmallAngleMetrics {
  /** 数值解与线性化解的最大相对偏差（比例，非百分比） */
  maxDeviation: number;
  /** 偏差最大的时间点 (s) */
  deviationPeakTime: number;
  /** 线性化解在 10s 时的预测角度 (rad) */
  theoryTheta1AtEnd: number;
  /** 数值解在 10s 时的实际角度 (rad) */
  actualTheta1AtEnd: number;
}

interface SinglePendulumMetrics {
  /** 检测到的上摆运动周期 (s)（通过过零检测或自相关） */
  detectedPeriod: number;
  /** 理论周期 T = 2π√(L₁/g) (s) */
  theoryPeriod: number;
  /** 周期相对误差（比例，非百分比） */
  periodError: number;
  /** 检测到的完整周期数 */
  cyclesDetected: number;
}

interface EnergyMetrics {
  /** 仿真期间记录的总能量最大值 (J) */
  energyMax: number;
  /** 仿真期间记录的总能量最小值 (J) */
  energyMin: number;
  /** 初始总能量 (J) */
  energyInitial: number;
  /** 最大相对漂移（比例，非百分比）= |E_max - E_min| / |E_initial| */
  maxDrift: number;
  /** 能量漂移最大的时间点 (s) */
  driftPeakTime: number;
}
```

### 输出定义（精确类型）

#### UI 组件输出

本模块的"输出"是渲染在实验模式面板中的验证套件 UI。组件树结构：

```
ValidationSuite (容器组件)
├── ValidationHeader          ← 标题行 + "一键验证"按钮
│   ├── <h2>物理验证套件</h2>
│   ├── <Button onClick={runAll}>一键验证</Button>
│   └── <Badge>（全部通过时显示绿色徽章）</Badge>
│
├── ValidationCard (×3)       ← 每个验证项一张卡片
│   ├── <Card>
│   │   ├── 验证项名称 + 状态图标
│   │   │   ├── idle:    灰色 Circle
│   │   │   ├── running: 黄色 Loader2（旋转动画）
│   │   │   ├── passed:  绿色 CheckCircle2
│   │   │   └── failed:  红色 XCircle
│   │   ├── 验证描述文本（来自 VALIDATION_SCENARIOS[id].description）
│   │   ├── （passed 时）绿色文字显示具体测量值
│   │   │   例：小角度偏差 1.2% (< 2%) ✓
│   │   │   例：周期误差 0.3% (< 1%) ✓
│   │   │   例：能量漂移 0.15% (< 0.5%) ✓
│   │   ├── （failed 时）红色文字显示实际值 + Tooltip 修复建议
│   │   │   例：能量漂移 0.8% (≥ 0.5%) ✗  [悬停查看建议]
│   │   └── （running 时）进度指示：已仿真 Xs / Ys
│   │
│   └── </Card>
│
└── ValidationAllPassedBanner  ← 三项全部通过时显示
    └── <Alert variant="success">
          <CheckCircle2 />
          "物理模型验证通过"（绿色徽章风格横幅）
        </Alert>
```

#### ValidationSuite 组件 Props

```typescript
interface ValidationSuiteProps {
  /**
   * 父容器 CSS 类名。默认无。
   * 用于在实验模式面板中嵌入。
   */
  className?: string;

  /**
   * 验证运行期间是否锁定参数面板。
   * 默认 true。锁定后 SIM-02 的滑块和输入框 disabled。
   */
  lockParamsDuringValidation?: boolean;

  /**
   * 是否显示交叉校验选项（JS RK4 vs Pyodide SciPy）。
   * 仅在 Pyodide 已加载（LAB-03 触发过加载）时可用。
   * 默认 false（P2 优先级增强功能）。
   */
  enableCrossValidation?: boolean;
}
```

### 核心逻辑步骤

#### 步骤 1：一键验证入口

- **操作对象**：`useLabStore.validationResults` + Worker
- **具体操作**：
  1. 渲染 `<Button>` 标签"一键验证"，图标 `FlaskConical`
  2. 点击按钮 → 调用 `runAllValidations()` 函数
  3. `runAllValidations()` 内部：
     ```typescript
     async function runAllValidations() {
       const store = useLabStore.getState();
       const simStore = useSimulationStore.getState();

       // 1. 缓存当前仿真状态（验证完成后恢复）
       const cachedParams = { ...simStore.params };
       const cachedIC = { ...simStore.initialConditions };
       const cachedDamping = simStore.params.damping;

       // 2. 暂停当前仿真（如果正在运行）
       const wasRunning = simStore.isRunning;
       if (wasRunning) simStore.setRunning(false);

       // 3. 将所有验证状态设为 "running"
       for (const scenario of VALIDATION_SCENARIOS) {
         store.setValidationResult(scenario.id, "running");
       }

       // 4. 对于每个验证场景，在 Worker 中依次运行（非并行——三个场景共享一个 Worker）
       for (const scenario of VALIDATION_SCENARIOS) {
         try {
           const result = await runScenarioInWorker(scenario);
           store.setValidationResult(scenario.id, result.passed ? "passed" : "failed");
         } catch (err) {
           console.error(`[LAB-02] 验证 ${scenario.id} 执行失败:`, err);
           store.setValidationResult(scenario.id, "failed");
         }
       }

       // 5. 恢复原仿真状态
       // 注意：使用 injectParams 绕过 SIM-02 的 UI 校验（恢复的是缓存值，理论上合法）
       simStore.injectParams(cachedParams, cachedIC);
       if (wasRunning) simStore.setRunning(true);

       // 6.（可选）若 Pyodide 可用且 enableCrossValidation，运行交叉校验
     }
     ```
  4. 验证期间禁用"一键验证"按钮（`disabled = 任一验证项 status === "running"`）
  5. 验证期间锁定参数面板（`lockParamsDuringValidation && simStore.setPanelLocked(true)`，需 SIM-02 配合）
- **输入来源**：用户点击"一键验证"按钮
- **输出去向**：Worker 依次执行三个验证场景 → `validationResults` 依次更新
- **失败行为**：
  - Worker 未初始化 → 显示错误提示"仿真引擎未就绪，请先在探索模式中启动仿真"，三项全部标记 `failed`
  - 单项验证 Worker 返回 `error` 响应 → 该项标记 `failed`，继续执行下一项（不中断流程）

#### 步骤 2：Worker 中运行单个验证场景

- **操作对象**：Worker 线程（通过 SIM-01 的 Worker 实例）
- **具体操作**：
  ```typescript
  function runScenarioInWorker(scenario: ValidationScenario): Promise<WorkerValidationResultResponse> {
    return new Promise((resolve, reject) => {
      const worker = getSimulationWorker();  // 获取 SIM-01 的 Worker 引用

      // 超时保护
      const timeout = setTimeout(() => {
        reject(new Error(`验证 ${scenario.id} 超时 (${scenario.simDuration * 2}ms)`));
      }, Math.max(scenario.simDuration * 2 * 1000 / 60, 10000));
      // ↑ 超时 = max(仿真时长所需最小时间×2, 10s)
      // Worker 批量积分每批 2 秒轨迹，实际耗时 ≈ simDuration / 2 × 单批耗时

      const handler = (e: MessageEvent) => {
        if (e.data?.type === "validationResult" && e.data.scenarioId === scenario.id) {
          clearTimeout(timeout);
          worker.removeEventListener("message", handler);
          resolve(e.data);
        } else if (e.data?.type === "error") {
          clearTimeout(timeout);
          worker.removeEventListener("message", handler);
          reject(new Error(e.data.message));
        }
      };

      worker.addEventListener("message", handler);

      worker.postMessage({
        type: "runValidation",
        scenarioId: scenario.id,
        params: scenario.params,
        initialConditions: scenario.initialConditions,
        simDuration: scenario.simDuration,
      });
    });
  }
  ```
- **输入来源**：`ValidationScenario` 的参数集
- **输出去向**：Promise resolve 为 `WorkerValidationResultResponse`
- **失败行为**：Worker 超时 → reject → 步骤 1 的 catch 块标记 `failed`

#### 步骤 3：Worker 侧验证逻辑（每种验证场景的具体计算）

- **操作对象**：Worker 内部状态（独立的验证仿真，不干扰主仿真状态）
- **具体操作**：

  **3a. 小角度线性化验证**：
  ```
  1. Worker 收到 "runValidation" (scenarioId="smallAngle", params, ic, simDuration=10)
  2. 保存当前 _state 和 _params（验证完成后恢复）
  3. 初始化：_params = scenario.params，_state = [ic.theta1, ic.theta1Dot, ic.theta2, ic.theta2Dot]
  4. 运行批量积分（同 handleStep），但额外：
     a. 每帧计算线性化解析解的预测值：
        双摆线性化（小角度近似 sinθ≈θ, cosθ≈1）给出耦合简正模
        对于初始条件 [3°, 0, 2°, 0]，使用双摆线性化公式：
        theoryTheta1(t) 通过解特征值问题获得两个简正频率 ω₁, ω₂ 和对应振幅
     b. 记录 maxDeviation = max(|theta1_numerical(t) - theta1_theory(t)| / max(|theta1_theory(t)|, 1e-10))
  5. 仿真 10s 后：
     passed = maxDeviation < 0.02
     postMessage({ type: "validationResult", scenarioId: "smallAngle", passed, metrics: { maxDeviation, ... } })
  6. 恢复原 _state 和 _params
  ```

  **3b. 单摆退化验证**：
  ```
  1. Worker 收到 "runValidation" (scenarioId="singlePendulum", ...)
  2. 初始化：m₂ ≈ 0 (1e-6 kg)
  3. 运行仿真 20s，每帧记录 theta1 值
  4. 过零检测：检测 theta1 从正到负的穿越点（theta1(t) > 0 且 theta1(t+dt) ≤ 0）
     a. 线性插值精确确定过零时刻
     b. 相邻两次同方向过零的时间差 = 一个完整周期
     c. 收集所有检测到的周期值，取平均值作为 detectedPeriod
  5. theoryPeriod = 2 * Math.PI * Math.sqrt(L₁ / g) = 2 * π * √(1.0/9.81) ≈ 2.00607
  6. periodError = |detectedPeriod - theoryPeriod| / theoryPeriod
  7. passed = periodError < 0.01 且 cyclesDetected >= 3（至少检测到 3 个周期以保证统计意义）
  8. postMessage({ type: "validationResult", scenarioId: "singlePendulum", passed, metrics: { detectedPeriod, theoryPeriod, periodError, cyclesDetected } })
  ```

  **3c. 能量守恒验证**：
  ```
  1. Worker 收到 "runValidation" (scenarioId="energy", ..., simDuration=1000)
  2. 初始化：damping = 0，标准初始条件
  3. 运行仿真，每批次（120 帧 / 2s）结束时记录本批次的能量统计：
     a. batchEnergyMax = max(totalEnergy over this batch)
     b. batchEnergyMin = min(totalEnergy over this batch)
  4. 全局追踪：
     a. energyInitial = 第一帧的 totalEnergy
     b. energyMax = max(所有批次的 batchEnergyMax)
     c. energyMin = min(所有批次的 batchEnergyMin)
  5. 仿真 1000s 后：
     a. maxDrift = |energyMax - energyMin| / |energyInitial|（若 energyInitial ≈ 0 则用 max(|energyInitial|, 1e-10)）
     b. passed = maxDrift < 0.005
  6. postMessage({ type: "validationResult", scenarioId: "energy", passed, metrics: { energyMax, energyMin, energyInitial, maxDrift, ... } })
  ```

- **输入来源**：`WorkerRunValidationCommand`
- **输出去向**：`WorkerValidationResultResponse` → 步骤 2 的 Promise resolve
- **失败行为**：积分发散（NaN 检测）→ 立即返回 `passed = false`，metrics 中附带发散时刻的 simTime

#### 步骤 4：验证完成后的 UI 更新

- **操作对象**：`ValidationCard` 组件 × 3 + `ValidationAllPassedBanner`
- **具体操作**：
  1. 每个 `ValidationCard` 订阅对应验证项的状态：
     ```typescript
     const status = useLabStore((s) => s.validationResults.smallAngle);
     ```
  2. 根据 `status` 渲染对应图标和颜色：
     - `"idle"` → 灰色 `Circle` 图标，卡片 border 默认色
     - `"running"` → 黄色 `Loader2`（`animate-spin`），卡片 border 黄色 `border-yellow-500`
     - `"passed"` → 绿色 `CheckCircle2`，卡片 border 绿色 `border-green-500`，显示具体测量值
     - `"failed"` → 红色 `XCircle`，卡片 border 红色 `border-red-500`，显示实际值 + 红色 Tooltip 修复建议
  3. 当三项全部 `"passed"` 时：
     - 在卡片组上方渲染 `<Alert variant="success">` 绿色横幅
     - 横幅内容：`<CheckCircle2 className="h-5 w-5" />` + "物理模型验证通过"
     - 横幅样式：绿色背景（`bg-green-50 dark:bg-green-950`），绿色边框，文本"物理模型验证通过"（`text-green-800 dark:text-green-200 font-semibold`）
  4. 当任一项 `"failed"` 时：
     - 不显示绿色横幅
     - 失败项的卡片内显示 Tooltip：鼠标悬停红色 `XCircle` 图标 → 弹出 `failureHint` 文本
- **输入来源**：`useLabStore.validationResults`
- **输出去向**：DOM 更新——卡片状态、徽章显隐
- **失败行为**：不适用（纯展示逻辑）

#### 步骤 5：验证完成后的仿真恢复

- **操作对象**：`useSimulationStore.params`、`useSimulationStore.initialConditions`、`useSimulationStore.isRunning`
- **具体操作**：
  1. 调用 `simStore.injectParams(cachedParams, cachedIC)` 恢复验证前的参数和初始条件
  2. 若验证前仿真在运行（`wasRunning === true`），调用 `simStore.setRunning(true)` 恢复仿真
  3. 注意：`injectParams` 会触发 Worker `updateParams` + `reset`，Worker 将重新开始积分（从恢复的初始条件出发）。这是预期行为——验证场景的参数不应影响用户之前设置的状态
  4. 解锁参数面板（`simStore.setPanelLocked(false)`）
- **输入来源**：步骤 1 中缓存的 `cachedParams`、`cachedIC`、`wasRunning`
- **输出去向**：Worker 恢复到验证前的仿真状态
- **失败行为**：`injectParams` 校验失败（缓存值因未知原因非法）→ 使用 `DEFAULT_PARAMS` 和 `DEFAULT_INITIAL_CONDITIONS` 回退

#### 步骤 6（可选增强 v1.1）：交叉校验——JS RK4 vs Pyodide SciPy

- **操作对象**：Worker (JS RK4) + Pyodide (SciPy `solve_ivp`)
- **具体操作**：
  1. 仅在 `enableCrossValidation === true` 且 Pyodide 已加载时可用
  2. 使用相同参数和初始条件，分别在 JS Worker 和 Pyodide 中运行 10s 仿真
  3. 比较两套 ODE 实现的输出轨迹（`theta1(t)` 和 `theta2(t)` 序列）
  4. 计算最大差异：`maxDiff = max(|theta1_JS(t) - theta1_Py(t)|)`
  5. 若 `maxDiff < 1e-6`（机器精度量级），交叉校验通过——两套实现等价
  6. UI 显示"交叉校验通过：JS RK4 与 SciPy solve_ivp 输出一致（max Δ < 10⁻⁶）"
  7. 若不一致：显示差异值和警告，但**不标记为验证失败**（可能是浮点精度差异而非实现错误）
- **输入来源**：JS Worker 轨迹 + Pyodide `JsProxy` 轨迹
- **输出去向**：交叉校验结果显示在验证面板底部
- **失败行为**：Pyodide 不可用 → 静默跳过交叉校验（不报错）

### 依赖与集成接口

| 依赖方 | 具体接口 | 用途 |
|--------|----------|------|
| `useLabStore` | `(s) => s.validationResults` | 读取三项验证状态 |
| `useLabStore` | `getState().setValidationResult(id, status)` | 写入验证状态 |
| `useSimulationStore` | `getState().params` / `getState().initialConditions` | 缓存验证前的仿真参数 |
| `useSimulationStore` | `getState().injectParams(params, ic)` | 恢复验证前的仿真参数 |
| `useSimulationStore` | `getState().setRunning(bool)` | 暂停/恢复仿真 |
| Worker (SIM-01) | `postMessage({ type: "runValidation", ... })` | 向 Worker 发送验证命令 |
| Worker (SIM-01) | `addEventListener("message", handler)` | 接收验证结果 |
| SIM-02 (参数面板) | `setPanelLocked(bool)`（若实现） | 验证期间锁定参数面板 |

### 状态机

单个验证项的 UI 状态机（三项各自独立运行）：

| 当前状态 | 触发事件 | 下一状态 | 前置条件 | 副作用 |
|----------|----------|----------|----------|--------|
| `idle` | 用户点击"一键验证" | `running` | Worker 已初始化 | 缓存当前仿真参数；暂停仿真；锁定参数面板；禁用验证按钮 |
| `running` | Worker 返回 `validationResult.passed = true` | `passed` | — | 卡片显示绿色 + 测量值；若三项全部 passed → 显示绿色徽章横幅 |
| `running` | Worker 返回 `validationResult.passed = false` | `failed` | — | 卡片显示红色 + 实际值 + Tooltip 修复建议 |
| `running` | Worker 返回 `error` 或 Promise reject | `failed` | — | 卡片显示红色 + 错误信息 |
| `running` | Worker 超时（超时保护触发） | `failed` | — | 卡片显示红色 + "验证超时"提示 |
| `passed` | 用户再次点击"一键验证" | `running` | — | 重置为 running，重新执行验证 |
| `failed` | 用户再次点击"一键验证" | `running` | — | 同上 |
| 任意 | 三项验证全部完成（全部 passed 或含 failed） | `idle` (按钮恢复) | — | 恢复仿真参数；恢复仿真运行状态（若之前为运行中）；解锁参数面板；启用验证按钮 |

### 异常与边界条件

#### 异常 1：Worker 未初始化

- **触发条件**：用户在进入实验模式前未启动过仿真（Worker 处于 `uninit` 状态）
- **处理策略**：
  1. `runAllValidations()` 开始时检测 Worker 状态
  2. 若 Worker 未初始化 → 显示 `<Alert variant="warning">`"仿真引擎未就绪，请先在探索模式中点击播放以启动仿真引擎"
  3. 三项验证状态保持 `"idle"`（不变为 `"running"`）
  4. 不崩溃、不报错
- **重试参数**：不自动重试。用户启动仿真后手动重新点击"一键验证"

#### 异常 2：验证期间用户切换模式

- **触发条件**：三项验证正在 Worker 中运行时，用户通过导航栏切换到其他模式（如探索模式）
- **处理策略**：
  1. 模式切换不中断 Worker 中的验证运行（Worker 独立于 UI 模式）
  2. `ValidationSuite` 组件被卸载（离开实验模式）→ cleanup 函数中**不取消**正在进行的 Worker 验证（Promise 仍在后台执行）
  3. 用户切回实验模式时 → `ValidationSuite` 重新挂载 → 从 `useLabStore.validationResults` 读取最新状态
  4. 若验证已完成（`passed` / `failed`），直接显示结果
  5. 若验证仍在运行（`running`），组件重新订阅并等待结果
- **重试参数**：不需要重试。验证在后台持续运行

#### 异常 3：能量守恒验证耗时过长（1000s 仿真）

- **触发条件**：1000s 仿真时长 × Worker 批量积分（每批 2s 轨迹）≈ 500 个批次。每批次耗时约 2-3ms（RK4 120 帧），总计约 1-1.5 秒实际运行时间。但在慢速设备（移动端/旧笔记本）上可能达到 3-5 秒
- **处理策略**：
  1. 显示进度指示：`"能量守恒验证：已仿真 250s / 1000s (25%)"`
  2. 进度通过监听 Worker 的中间 `batchReady` 消息更新（非 `validationResult`）
  3. 在 `runScenarioInWorker` 中，Worker 每完成 50 个批次（100s 仿真）发送一次进度更新：
     ```typescript
     // Worker 侧扩展：
     if (batchCount % 50 === 0) {
       postMessage({ type: "validationProgress", scenarioId: "energy", simTime: currentSimTime, totalDuration: 1000 });
     }
     主线程监听 "validationProgress" → 更新进度百分比
     ```
  4. 超时保护：最长等待 30 秒（远超正常耗时），超时则标记 `failed`
- **重试参数**：不自动重试

#### 异常 4：单摆退化——过零检测失败（周期无法检测）

- **触发条件**：`m₂ = 1e-6` 且初始条件使运动幅度极小（< 0.001 rad），或数值噪声淹没过零信号
- **处理策略**：
  1. `cyclesDetected < 3` → 自动判定为 `failed`
  2. 失败原因明确化：`failureHint` 显示"未检测到足够周期（仅 {cyclesDetected} 个），可能原因：初始角度过小导致过零检测受数值噪声干扰"
  3. 备用方案：若过零检测返回 0 个周期 → 改用自相关法（计算 theta1 序列的自相关函数，第一个峰值位置 = 周期）
- **重试参数**：不重试

#### 异常 5：验证参数注入导致 Worker 积分发散

- **触发条件**：验证场景的极端参数组合（如 energy 验证的大角度初始条件）导致积分发散
- **处理策略**：
  1. Worker 中检测到 NaN → 立即返回 `validationResult.passed = false`
  2. metrics 中包含发散时的 simTime
  3. `failureHint` 显示"积分在 t={simTime}s 处发散，请检查步长设置或减小初始角度"
  4. 恢复原仿真参数（步骤 5 仍执行）
- **重试参数**：不自动重试。用户可手动切换到 RK4 或减小步长后重新验证

### 原则兑现清单

| 原则来源 | 原则名称 | 代码级约束 |
|----------|----------|------------|
| 功能设计_v0 §五 5.2 | 三项一键验证 | 一个"一键验证"按钮依次运行小角度、单摆退化、能量守恒三项；通过标准严格匹配设计文档：< 2%、< 1%、< 0.5% |
| 功能设计_v0 §五 5.2 | 绿色徽章"物理模型验证通过" | 三项全部 `passed` 后显示 `<Alert variant="success">` 绿色横幅，内容为"物理模型验证通过" |
| 功能设计_v0 §五 5.2 | 不通过时提示检查步长设置 | 任一 `failed` → 卡片内 Tooltip 显示 `failureHint`，提示检查步长或 ODE 实现 |
| 技术栈设计 §9.4 | JS/Python 交叉校验 | LAB-02 可选增强 v1.1：使用相同参数对比 JS RK4 与 Pyodide SciPy 输出，验证两套 ODE 实现等价 |
| SIM-01 规格 | Worker 侧执行所有物理计算 | 验证场景的 ODE 积分必须在 Worker 中运行，禁止主线程直接调用 `rk4Step` |
| 通用原则 | 验证与仿真恢复隔离 | 验证完成后自动恢复验证前的仿真参数和运行状态，用户无感知 |

### 验收测试场景

#### 正向测试 1：一键验证全部通过

- **Given**：
  - Worker 已初始化，仿真正常运行
  - 当前仿真参数为默认值（`m₁=1, m₂=1, L₁=1, L₂=1, g=9.81, damping=0`）
  - 用户切换到实验模式
- **When**：用户点击"一键验证"按钮
- **Then**：
  - 当前仿真自动暂停
  - 三项验证卡片状态依次变为 `running`（黄色旋转图标）
  - 小角度验证完成 → `passed`（绿色 ✓），显示"最大偏差 X.X% (< 2%)"
  - 单摆退化验证完成 → `passed`（绿色 ✓），显示"周期误差 X.X% (< 1%)"
  - 能量守恒验证完成 → `passed`（绿色 ✓），显示"能量漂移 X.XX% (< 0.5%)"，进度指示 0→100%
  - 三项全部 `passed` → 卡片组上方出现绿色横幅"物理模型验证通过"
  - 验证按钮恢复可点击
  - 仿真参数恢复为验证前的值，仿真自动恢复运行（若验证前为运行中）

#### 正向测试 2：单项验证的详细测量值展示

- **Given**：小角度验证已运行完成并通过
- **When**：用户查看小角度验证卡片
- **Then**：
  - 卡片 border 为绿色
  - 显示 `CheckCircle2` 绿色图标
  - 显示文本："数值解与理论解最大偏差 1.2%（通过标准：< 2%）"
  - 卡片副文本显示辅助信息：`偏差峰值时刻 t = 3.5s`、`理论解终点 θ₁ = 0.031 rad`、`数值解终点 θ₁ = 0.031 rad`

#### 异常测试 1：能量守恒验证失败——漂移超标

- **Given**：
  - 仿真参数中 `damping` 被设为 0.001（微小阻尼导致能量缓慢泄漏）
  - 用户点击"一键验证"
- **When**：能量守恒验证运行完成（1000s 仿真）
- **Then**：
  - 小角度验证 → `passed`
  - 单摆退化验证 → `passed`
  - 能量守恒验证 → `failed`（红色 ✗）
  - 卡片显示："能量漂移 0.72%（通过标准：< 0.5%）✗"
  - 卡片 border 为红色
  - 鼠标悬停红色 `XCircle` 图标 → Tooltip："请检查：(1) 阻尼系数是否为 0；(2) ODE 右端函数中阻尼项是否正确实现；(3) 积分方法——Euler 方法的能量漂移远超 RK4"
  - 不显示绿色"物理模型验证通过"横幅

#### 异常测试 2：Worker 未初始化时点击验证

- **Given**：
  - 用户首次打开应用，直接切换到实验模式
  - Worker 处于 `uninit` 状态（从未启动过仿真）
- **When**：用户点击"一键验证"按钮
- **Then**：
  - 验证不启动
  - 显示黄色 `<Alert>`："仿真引擎未就绪，请先在探索模式中点击播放以启动仿真引擎"
  - 三项验证保持 `"idle"` 状态
  - 不崩溃，不向 Worker 发送任何消息

### 注意事项与禁止行为

1. **【验证必须走真实 Worker 路径】** 禁止在验证逻辑中直接调用 `odeRhs()` 或 `rk4Step()` 绕过 Worker 通信。原因：(a) 主线程与 Worker 的 ODE 实现可能因构建打包而产生微妙差异；(b) 验证的目的是证明"用户实际使用的仿真路径"的正确性，而非隔离函数的正确性

2. **【三个验证必须依次执行】** 禁止并行向 Worker 发送三个 `runValidation` 命令（Worker 是单线程的，并行消息会导致状态混乱）。三个场景依次执行，每个完成后再启动下一个

3. **【验证前必须缓存仿真状态】** 进入验证前必须保存完整的 `params`、`initialConditions`、`isRunning`、`damping`。验证完成后必须恢复这些值。禁止在验证完成后让用户面对被篡改的仿真参数

4. **【小角度线性化解的精确实现】** 小角度验证的"理论解"不是简单的单摆周期公式，而是双摆耦合线性系统的解析解。需在 Worker 中实现以下特征值计算：
   - 质量矩阵 M 和刚度矩阵 K（小角度近似下的线性化矩阵）
   - 解特征值问题 `det(K - ω²M) = 0` 获得两个简正频率 ω₁, ω₂
   - 由初始条件确定各简正模的振幅和相位
   - 叠加得到 `theta1_theory(t)` 和 `theta2_theory(t)`
   - 参考：双摆小角度线性化是经典力学标准推导，`ω² = (g/L) × ( (m₁+m₂)/m₁ ± √((m₁+m₂)²/m₁² - (m₂/m₁)·4) )`（对于等长等质量情况简化为 `ω² = (g/L)(2 ± √2)`）

5. **【单摆退化中 m₂ 不能严格为 0】** ODE 右端函数的分母 `denom = m₁ + m₂ - m₂·cos²(δ)`。若 `m₂ = 0` 且 `m₁ = 1, cos²(δ) = 0`：`denom = 1 + 0 - 0 = 1`，无除零问题。但部分 `δ` 值时若 `cos²(δ) → (m₁+m₂)/m₂`（仅在 m₂ > 0 时可能），denom 趋近于 0。使用 `m₂ = 1e-6` 安全且物理影响可忽略（实际物理影响 < 0.001%）

6. **【能量守恒验证的能耗估算】** 1000s 仿真 × 60fps = 60,000 帧。Worker 批量积分每批 120 帧。总计 500 个批次，预计耗时 1-2 秒（桌面端）。在移动端（CPU 性能约为桌面 1/3-1/5）可能耗时 3-8 秒。进度指示必须按批次更新（每 50 批 = 100s 仿真时间更新一次）

7. **【禁止在验证期间允许用户修改参数】** 验证运行时 SIM-02 参数面板的滑块和输入框必须 disabled。若用户强行通过键盘快捷键修改参数（如 `reset`），验证结果可能受影响。建议通过 `lockParamsDuringValidation` 机制阻止

8. **【易错点】** `injectParams` 恢复仿真参数时，Worker 会收到 `updateParams` + `reset` 命令。这会导致 Worker 从初始条件重新开始积分，丢失验证前的仿真轨迹历史（RingBuffer 中数据）。这是预期行为（验证前轨迹本就不长），但若未来 RingBuffer 存储了长时间仿真历史，需考虑通过快照恢复而非直接 reset

9. **【易错点】** 小角度验证的"最大偏差"计算分母不能是 0。当 `theta1_theory(t)` 穿越 0 时，相对偏差会爆炸。应在计算前加保护：`denom = max(|theta1_theory(t)|, 1e-6)`。或在 theta1_theory 过零点附近（|theta1_theory| < 0.001 rad）跳过偏差计算
