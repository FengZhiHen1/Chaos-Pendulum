# 功能点：INF-03 自动化测试体系

> **文档生成时间**：`2026-04-28 21:56:50 CST`
> **版本记录**：
> | 版本 | 时间 | 修改人 | 变更摘要 |
> |------|------|--------|----------|
> | v1.0 | `2026-04-28 21:56:50` | AI Assistant | 初始版本，基于功能模块全拆解 INF-03 + 技术栈 §2 #20/#25 + §9.4 + 已有测试代码兼容 |

> **冲突核查指引**：本版本与已有测试文件（`engine.test.ts`/`energy.test.ts`/`params.test.ts`/`appStore.test.ts`）、CI 配置（`.github/workflows/ci.yml`）、Vitest 配置完全兼容。新增的物理回归测试套件和预计算数据校验为独立新增文件，不修改已有测试。若上游测试框架版本升级，以时间戳更新的版本为准。

---

### 所属模块与溯源

- **对应总设计章节**：功能模块全拆解 §八 INF-03（行业补充）；技术栈设计 §2 #20（Vitest + @testing-library/react）、§2 #25（物理回归测试三项断言）、§9.4「CI/CD 与自动化测试」（三阶段流水线 + 物理回归测试设计）；功能设计_v0 §五 5.2（物理验证标准：小角度 <2%、单摆退化周期吻合、能量漂移 <0.5%）
- **依赖的其他功能模块**：
  - `SIM-01`（双摆物理引擎）— 物理回归测试的被测目标（`odeRhs`/`integratorStep`/`computeDerived`/`normalizeAngle` 等纯函数）
  - `SYS-03`（预计算数据管线）— 预计算数据一致性校验的被测目标（Python 脚本 JSON 输出 hash 校验）
  - `SIM-02`（参数控制面板）— UI 组件测试的被测目标（参数校验、滑块/输入交互）
  - `SIM-03`（全局导航系统）— UI 组件测试的被测目标（模式切换、键盘快捷键）
  - `data/` Feature（`RingBuffer`/`snapshot-db`/`thumbnail`/`export`）— 数据结构和工具函数的单元测试被测目标
- **被依赖模块**：所有功能模块（本模块为测试基础设施，所有模块的代码变更均通过 CI 测试阶段验证）；INF-02（持续部署管线 — CI 流水线中 test job 使用本模块定义的测试套件）

### 已有设计兼容性分析

- **已审查的相关规格文档**：
  - `SIM-01-双摆物理引擎.md` v2.1：`odeRhs`/`integratorStep`/`computeDerived` 函数签名（纯函数，可在 Node 环境测试）、`PendulumParams` 类型、能量守恒标准（1000s 漂移 <0.5%）
  - `SIM-02-参数控制面板.md` v1.1：`validateParam`/`setParam`/`applyPreset`/`injectParams` store actions、`PARAM_META` 元数据表
  - `功能模块全拆解.md`：INF-03 覆盖范围（物理回归 + 预计算校验 + 关键 UI 交互）
  - `双摆混沌实验室-技术栈设计.md` v1.2：§9.4 三阶段流水线（check → test → build）、物理回归测试 TypeScript 代码示例
  - `双摆混沌实验室-项目结构.md` v1.0：§8.1 测试分层表
- **已检查的已有测试代码**：
  - `src/features/simulation/__tests__/engine.test.ts`（277 行）：odeRhs/integratorStep/computeDerived/Float64Pool/参数校验测试，覆盖正向 7 + 异常 2
  - `src/features/simulation/__tests__/energy.test.ts`（426 行）：能量监控测试，覆盖正向 4 + 异常 3 + 边界 2
  - `src/features/simulation/__tests__/params.test.ts`（224 行）：参数面板 store 测试，覆盖正向 7 + 异常 1
  - `src/stores/__tests__/appStore.test.ts`（129 行）：全局 store 测试，覆盖正向 3 + 异常 1
  - `src/shared/hooks/__tests__/useDeviceType.test.ts`：响应式 hook 测试
  - `src/shared/hooks/__tests__/useContainerSize.test.ts`：容器尺寸 hook 测试
- **兼容性结论**：
  - 已有测试使用 Vitest + `describe`/`it`/`expect` 模式，本规格新增测试遵循相同模式
  - 物理回归测试的三项断言标准与 SIM-01 验收测试中的能量漂移阈值（0.5%）、小角度偏差（2%）完全一致
  - 预计算数据校验为全新测试，不与已有测试冲突
  - **无冲突**。本规格扩展现有测试体系，新增测试为独立文件，不修改已有测试
- **复用的已有定义**：`PendulumParams`（SIM-01）、`RingBuffer<T>`（data/ring-buffer）、`Float64Pool`（simulation/worker）、`useSimulationStore`（simulation/store.ts）、`useAppStore`（stores/useAppStore.ts）、`DEFAULT_PARAMS`/`DEFAULT_INITIAL_CONDITIONS`（shared/types）

---

### 技术栈绑定

- **必须使用**：
  - `vitest@^1.6.0` — 测试运行器（已安装，package.json 中有 `vitest` 命令）
  - `@testing-library/react@^14.x` — React 组件渲染与查询（`render`/`screen`/`fireEvent`/`waitFor`）
  - `@testing-library/jest-dom@^6.x` — DOM 状态断言扩展（`toBeInTheDocument`/`toHaveAttribute`/`toHaveClass`）
  - `jsdom`（vitest environment）— 浏览器 DOM 模拟（已通过 `vitest.config.ts` 的 `environment: "jsdom"` 配置）
  - `@testing-library/user-event@^14.x` — 用户交互模拟（点击、拖拽、键盘输入），比 `fireEvent` 更接近真实用户行为
  - TypeScript 5.x — 测试文件类型安全
  - `crypto.subtle.digest("SHA-256")`（Node 环境通过 `node:crypto`）— 预计算数据 hash 校验
  - `fs.readFileSync`（Node 环境）— 预计算 JSON 文件读取
- **禁止使用**：
  - 禁止使用 `jest` 替代 `vitest`（项目已统一使用 vitest，混用运行器违反一致性）
  - 禁止物理回归测试直接依赖 Worker 或浏览器 DOM（物理回归测试必须能在 Node 环境运行，仅依赖纯函数 `odeRhs`/`integratorStep`/`computeDerived`）
  - 禁止在单元测试中启动真实的 Web Worker（Worker 通信测试使用 `vitest` mock 或放在集成测试中）
  - 禁止物理回归测试使用 MOCK 数据（技术栈 §9.4 明确：调用同一个 RK4 实现；AGENT.md 核心原则：禁止引入 MOCK 数据，测试需真实验证）
  - 禁止测试文件中硬编码预期数值而不标注来源（所有阈值/期望值必须注释引用自哪个设计文档）

---

### 输入定义（精确类型）

#### 测试套件配置

```typescript
/**
 * Vitest 配置扩展（在已有 vitest.config.ts 基础上补充）。
 */
interface VitestConfigExtension {
  /** 测试环境。物理/纯函数测试用 "node"，组件测试用 "jsdom" */
  environment: "node" | "jsdom";

  /** 全局 setup 文件 */
  setupFiles: string[];

  /** 覆盖率阈值。CI 中低于此阈值将构建失败 */
  coverage: {
    /** 行覆盖率阈值（百分比）。示例：70 */
    lines: number;
    /** 分支覆盖率阈值（百分比）。示例：60 */
    branches: number;
    /** 函数覆盖率阈值（百分比）。示例：70 */
    functions: number;
    /** 语句覆盖率阈值（百分比）。示例：70 */
    statements: number;
    /** 覆盖率排除路径 */
    exclude: string[];
    /** 覆盖率报告器 */
    reporter: ("text" | "lcov" | "html")[];
  };

  /** CI 模式下超时时间 (ms)。示例：30000 */
  testTimeout: number;
}
```

#### 物理回归测试输入

```typescript
/**
 * 物理回归测试参数集。
 * 每个测试场景使用固定的参数和初始条件，保证确定性结果。
 */
interface PhysicsRegressionParams {
  /** 物理参数 */
  params: PendulumParams;
  /** 初始条件 */
  initialState: Float64Array; // [θ₁, θ̇₁, θ₂, θ̇₂]
  /** 仿真时长 (s)。示例：1000 */
  simDuration: number;
  /** 积分方法。默认 "RK4" */
  method: "RK4" | "VelocityVerlet" | "Euler";
  /** 固定时间步长 (s)。默认 1/60 */
  dt: number;
}

/**
 * 物理回归测试结果。
 */
interface PhysicsRegressionResult {
  /** 测试名称 */
  testName: string;
  /** 是否通过 */
  passed: boolean;
  /** 实际测量值 */
  measured: {
    /** 测量指标名称 → 数值 */
    [metric: string]: number;
  };
  /** 预期阈值 */
  expected: {
    /** 指标名称 → 阈值上限 */
    [metric: string]: number;
  };
  /** 失败时的诊断信息。通过时为 null */
  diagnostic: string | null;
}
```

#### 预计算数据校验输入

```typescript
/**
 * 预计算数据校验项。
 */
interface PrecomputeValidationItem {
  /** JSON 文件相对路径（相对于 src/shared/data/）。示例："lyapunov-default.json" */
  filePath: string;
  /** 文件在 git 中提交的 SHA-256 hash（由构建脚本生成并写入 .precompute-hashes.json） */
  expectedHash: string;
  /** 文件格式类型 */
  format: "lyapunov-grid" | "bifurcation-data";
  /** 必需字段列表。用于结构化校验 */
  requiredFields: string[];
}

/**
 * 预计算数据校验结果。
 */
interface PrecomputeValidationResult {
  /** JSON 文件路径 */
  filePath: string;
  /** 是否通过 */
  passed: boolean;
  /** 实际 hash */
  actualHash: string;
  /** 期望 hash */
  expectedHash: string;
  /** 是否 hash 匹配 */
  hashMatch: boolean;
  /** 是否结构完整（所有 requiredFields 存在） */
  structureValid: boolean;
  /** 网格尺寸校验。lyapunov-grid 期望 100×100 = 10000 个格点 */
  gridSize?: { rows: number; cols: number; expected: number };
  /** 失败时的错误消息。通过时为 null */
  error: string | null;
}
```

#### 组件测试输入

```typescript
/**
 * 组件测试场景定义。
 */
interface ComponentTestScenario {
  /** 场景名称。示例："负质量输入被拒绝" */
  name: string;
  /** 被测组件路径。示例："@/features/simulation/components/ParameterPanel" */
  componentPath: string;
  /** 初始 store 状态预设 */
  initialStoreState: Record<string, unknown>;
  /** 用户操作序列 */
  actions: UserAction[];
  /** 预期断言 */
  assertions: Assertion[];
}

/**
 * 用户操作描述。
 */
type UserAction =
  | { type: "click"; target: string }            // 点击选择器
  | { type: "input"; target: string; value: string }  // 输入文本
  | { type: "drag"; target: string; value: number[] } // 拖拽 Slider
  | { type: "keyboard"; key: string }            // 键盘按键
  | { type: "waitFor"; condition: string; timeout?: number }; // 等待条件

/**
 * 断言描述。
 */
interface Assertion {
  /** 目标元素选择器或描述 */
  target: string;
  /** 断言类型 */
  matcher: "toBeInTheDocument" | "toHaveTextContent" | "toHaveAttribute" | "toHaveClass" | "toBeDisabled" | "toBeEnabled" | "toHaveValue";
  /** 期望值 */
  expected: string | boolean | number;
}
```

---

### 输出定义（精确类型）

```typescript
/**
 * 完整测试运行报告。
 */
interface TestRunReport {
  /** 报告生成时间 (ISO 8601) */
  generatedAt: string;
  /** 总测试套件数 */
  totalSuites: number;
  /** 总测试用例数 */
  totalTests: number;
  /** 通过的测试用例数 */
  passed: number;
  /** 失败的测试用例数 */
  failed: number;
  /** 跳过的测试用例数 */
  skipped: number;
  /** 各套件详细结果 */
  suites: TestSuiteResult[];
  /** 物理回归测试汇总 */
  physicsRegression: {
    /** 是否全部通过 */
    allPassed: boolean;
    /** 三项测试结果 */
    results: PhysicsRegressionResult[];
  };
  /** 预计算数据校验汇总 */
  precomputeValidation: {
    /** 是否全部通过 */
    allPassed: boolean;
    /** 各文件校验结果 */
    results: PrecomputeValidationResult[];
  };
  /** 覆盖率数据（CI 模式下） */
  coverage?: {
    lines: { covered: number; total: number; pct: number };
    branches: { covered: number; total: number; pct: number };
    functions: { covered: number; total: number; pct: number };
    statements: { covered: number; total: number; pct: number };
  };
}

/**
 * 单个测试套件结果。
 */
interface TestSuiteResult {
  /** 套件文件路径（相对于 src/） */
  file: string;
  /** 套件中的测试用例数 */
  total: number;
  /** 通过数 */
  passed: number;
  /** 失败数 */
  failed: number;
  /** 执行耗时 (ms) */
  duration: number;
}
```

---

### 核心逻辑步骤

#### 步骤 1：物理回归测试 — 小角度线性化

- **操作对象**：`odeRhs` + `integratorStep`（从 `src/features/simulation/engine/` 导入的纯函数）
- **具体操作**：
  1. **设置参数**：`params = { m1: 1.0, m2: 1.0, L1: 1.0, L2: 1.0, g: 9.81, damping: 0.0 }`
  2. **设置小角度初始条件**：`state = new Float64Array([0.052, 0.0, 0.034, 0.0])`（约 3° 和 2°，满足小角度线性化条件）
  3. **数值解**：使用 RK4 方法积分 10 秒（600 步，`dt = 1/60`）：循环 600 次 `integratorStep(state, params, dt, "RK4")`。每步记录 `[theta1, theta2]`
  4. **解析解（小角度线性化）**：双摆在小角度近似下的线性化 ODE 解析解：
     - 设 `ω₁ = sqrt(g/L₁)`、`ω₂ = sqrt(g/L₂)`
     - 对于本测试的等长等质量情况（L₁=L₂=1, m₁=m₂=1），两摆简正模频率为 `ω_mode1 = sqrt(g/L * (1 - 1/√2))` ≈ `1.70 rad/s`、`ω_mode2 = sqrt(g/L * (1 + 1/√2))` ≈ `4.05 rad/s`
     - 实际实现中不要求符号求解，使用**数值参照**：以极短步长 `dt/100` 的 RK4 积分结果作为"基准解"（步长足够小 → 数值误差可忽略）
  5. **计算偏差**：
     - 取最后 2 秒（120 帧）的 `theta1` 和 `theta2` 序列
     - `deviation_theta1 = max(|RK4(t) - Reference(t)|) / max(|Reference(t)|, 1e-10)`
     - `deviation_theta2 = max(|RK4(t) - Reference(t)|) / max(|Reference(t)|, 1e-10)`
     - 取 `maxDeviation = max(deviation_theta1, deviation_theta2)`
  6. **断言**：`expect(maxDeviation).toBeLessThan(0.02)`（偏差 < 2%，符合功能设计_v0 §五 5.2）
- **输入来源**：编译时常量参数（硬编码在测试文件中）
- **输出去向**：`PhysicsRegressionResult { testName: "小角度线性化", passed: true/false, measured: { maxDeviation }, expected: { threshold: 0.02 } }`
- **失败行为**：测试失败 → CI test job 标记为 failed → 告警："物理回归失败：小角度线性化偏差 {measured} 超过阈值 2%"

#### 步骤 2：物理回归测试 — 单摆退化

- **操作对象**：`odeRhs` + `integratorStep` 纯函数
- **具体操作**：
  1. **设置退化参数**：`params = { m1: 1.0, m2: 0.0, L1: 1.0, L2: 1.0, g: 9.81, damping: 0.0 }`（`m2 = 0` 使下摆质量为零，系统退化为单摆）
  2. **设置初始条件**：`state = new Float64Array([0.524, 0.0, 0.0, 0.0])`（上摆 30° 偏角，下摆静止）
  3. **运行仿真**：RK4 积分 20 秒（1200 步，`dt = 1/60`）
  4. **检测周期**：从 `theta1` 序列中检测振荡周期：
     a. 收集 20 秒内 `theta1` 值的时间序列
     b. 检测正向过零点（`theta1` 从负变正的时刻）：`theta1[i] < 0 && theta1[i+1] >= 0`，线性插值精确求解过零时间
     c. 取相邻过零点间的时间差 → 半周期，乘 2 → 全周期
     d. 取 3-5 个周期的平均值作为实测周期 `T_measured`
  5. **理论周期**：单摆小角度周期 `T_theory = 2 * Math.PI * Math.sqrt(L1 / g)` = `2 * Math.PI * Math.sqrt(1 / 9.81)` ≈ `2.0061s`。对于 30° 初始角（非小角度），精确周期为 `T_exact = T_theory * (1 + θ₀²/16 + 11θ₀⁴/3072 + ...)` ≈ `2.0061 * 1.0075` ≈ `2.0211s`
  6. **断言**：`expect(T_measured).toBeCloseTo(T_exact, 1)`（偏差 < 10%，即小数第 1 位匹配；功能设计_v0 §五 5.2 要求"周期吻合"）
- **输入来源**：编译时常量参数
- **输出去向**：`PhysicsRegressionResult { testName: "单摆退化", passed: true/false, measured: { T_measured, T_exact }, expected: { tolerance: 0.1 } }`（相对偏差容差 10%）
- **失败行为**：测试失败 → CI 标记 failed → 告警："物理回归失败：单摆退化周期 {T_measured}s 与理论值 {T_exact}s 不吻合"

#### 步骤 3：物理回归测试 — 能量守恒

- **操作对象**：`integratorStep` + `computeDerived` 纯函数
- **具体操作**：
  1. **设置无阻尼参数**：`params = { m1: 1.0, m2: 1.0, L1: 1.0, L2: 1.0, g: 9.81, damping: 0.0 }`
  2. **设置初始条件**：`state = new Float64Array([Math.PI / 3, 0.0, -Math.PI / 4, 0.0])`（60° 和 -45°），确保初始能量非零
  3. **运行长时仿真**：RK4 积分 1000 秒（60000 步，`dt = 1/60`）
  4. **记录能量**：每 100 步（≈1.67s）采样一次 `computeDerived(state, params).totalEnergy`，共 600 个采样点
  5. **计算漂移**：
     - `E_initial = samples[0]`
     - `E_max = max(...samples)`, `E_min = min(...samples)`
     - `drift = max(|E_max - E_initial|, |E_min - E_initial|) / max(|E_initial|, 1e-10)`
  6. **断言**：`expect(drift).toBeLessThan(0.005)`（漂移 < 0.5%，符合功能设计_v0 §五 5.2）
  7. **性能约束**：60000 步 RK4 积分在 Node 环境中耗时 < 500ms（若超时 → 测试标记为 skip 并输出警告，但不算失败——这是性能回归而非正确性回归）
- **输入来源**：编译时常量参数
- **输出去向**：`PhysicsRegressionResult { testName: "能量守恒", passed: true/false, measured: { drift, E_initial, E_final, sampleCount }, expected: { threshold: 0.005 } }`
- **失败行为**：测试失败 → CI 标记 failed → 告警："物理回归失败：能量漂移 {drift*100}% 超过阈值 0.5%"

#### 步骤 4：预计算数据一致性校验

- **操作对象**：`src/shared/data/` 目录下的预计算 JSON 文件 + `.precompute-hashes.json` hash 清单
- **具体操作**：
  1. **读取 hash 清单**：`fs.readFileSync(".precompute-hashes.json", "utf-8")` → 解析 JSON，获取每个预计算文件的 `{ filePath → expectedHash }` 映射
  2. **若 hash 清单不存在**：测试跳过（`it.skip`），提示"预计算数据 hash 清单不存在，请运行 `scripts/precompute/run_all.py` 生成数据"
  3. **遍历每个预计算文件**：
     a. 读取文件：`fs.readFileSync(filePath)` → `ArrayBuffer`
     b. 计算 SHA-256 hash：`crypto.subtle.digest("SHA-256", data)` → hex 编码字符串
     c. 与 `expectedHash` 比对：`actualHash === expectedHash`
  4. **结构校验**（针对 lyapunov-grid 格式文件）：
     a. `JSON.parse(fileContent)` → 检查 `metadata.type` 字段存在
     b. 检查 `data` 字段为二维数组
     c. 检查数组尺寸：`data.length === 100` 且 `data[0].length === 100`（100×100 网格）
     d. 检查所有元素为有限数值（`isFinite`）
  5. **结构校验**（针对 bifurcation-data 格式文件）：
     a. 检查 `metadata.paramName` 字段存在
     b. 检查 `data` 字段为非空数组
     c. 检查 `data` 中每个元素包含 `paramValue: number` 和 `maxima: number[]`
  6. **断言汇总**：
     - 所有文件 `hashMatch === true`
     - 所有文件 `structureValid === true`
     - 若 `lyapunov-default.json` 存在 → 网格尺寸为 100×100
- **输入来源**：文件系统中的预计算 JSON + hash 清单
- **输出去向**：`PrecomputeValidationResult[]` → CI test report
- **失败行为**：
  - Hash 不匹配 → 测试失败 → 告警："预计算数据 {filePath} 与预期 hash 不一致。请检查是否重新运行了预计算脚本但未提交最新 JSON"
  - 结构不合法 → 测试失败 → 告警："预计算数据 {filePath} 结构不完整，缺少字段 {field}"
  - 文件缺失 → 测试跳过 + 警告

#### 步骤 5：RingBuffer 与数据结构单元测试

- **操作对象**：`RingBuffer<T>`（`src/features/data/ring-buffer/ring-buffer.ts`）
- **具体操作**：
  1. **正向测试 — push + at 正确性**：
     - 创建 `RingBuffer<number>(5)`
     - `push(1); push(2); push(3); push(4); push(5)`
     - `expect(buf.at(0)).toBe(1)`、`expect(buf.at(4)).toBe(5)`、`expect(buf.length).toBe(5)`
  2. **正向测试 — 超出容量后环形覆盖**：
     - `push(6); push(7)`（覆盖 1 和 2）
     - `expect(buf.at(0)).toBe(3)`（原索引 2 现在是最旧数据）
     - `expect(buf.at(4)).toBe(7)`、`expect(buf.length).toBe(5)`（容量不变）
  3. **正向测试 — toArray 返回顺序所有有效元素**：
     - `arr = buf.toArray()`
     - `expect(arr).toEqual([3, 4, 5, 6, 7])`
  4. **正向测试 — clear 清空缓冲区**：
     - `buf.clear()`
     - `expect(buf.length).toBe(0)`、`expect(buf.at(0)).toBeUndefined()`
  5. **边界测试 — 空缓冲区行为**：
     - 新创建 `RingBuffer(10)`
     - `expect(buf.length).toBe(0)`、`expect(buf.toArray()).toEqual([])`
  6. **边界测试 — 索引越界**：
     - `expect(buf.at(-1)).toBeUndefined()`、`expect(buf.at(100)).toBeUndefined()`
- **输入来源**：`RingBuffer<T>` 类实现
- **输出去向**：Vitest 断言通过/失败
- **失败行为**：测试失败 → 代码中的 `RingBuffer` 实现有 bug

#### 步骤 6：Float64Pool 单元测试（已有测试补充）

- **操作对象**：`Float64Pool`（`src/features/simulation/worker/float64-pool.ts`）
- **具体操作**（补充已有 `engine.test.ts` 中的测试）：
  1. **acquire 返回独立 buffer**（已有测试覆盖，保持不变）
  2. **release 后可重新 acquire 同一索引**（已有测试覆盖）
  3. **池耗尽返回 null**（已有测试覆盖）
  4. **新增：releaseBuffer 无效 buffer 不抛出异常**：
     - `pool.releaseBuffer(notInPoolBuffer)` → 静默忽略，不抛异常
  5. **新增：并发 acquire/release 正确性**：
     - 快速连续执行 100 次 `acquire → 写入数据 → release` 循环
     - 验证每个 acquire 返回的 buffer 不与其他 buffer 共享内存（写入后 release，再 acquire，检查数据为默认值 0）
  6. **新增：available 属性正确追踪空闲数**：
     - `expect(pool.available).toBe(10)` 初始
     - `pool.acquire()` → `expect(pool.available).toBe(9)`
     - `pool.release(idx)` → `expect(pool.available).toBe(10)`
- **失败行为**：测试失败 → Float64Pool 实现 bug 或 use-after-free 问题

#### 步骤 7：IndexedDB 封装单元测试

- **操作对象**：`src/shared/lib/cache/indexed-db.ts` 中的 `openDB`/`putStore`/`getStore`/`deleteStore`/`getAll`
- **具体操作**：
  1. **测试环境**：使用 `fake-indexeddb` 库（`vitest` 无真实 IndexedDB）或 `jsdom` + 真实 IndexedDB
  2. **正向测试 — CRUD 完整流程**：
     - `openDB("test-db", 1, upgrade)` → 创建 object store `"test-store"`
     - `putStore(db, "test-store", { id: "1", value: "hello" })` → 写入成功
     - `getStore<{id: string, value: string}>(db, "test-store", "1")` → 返回 `{ id: "1", value: "hello" }`
     - `deleteStore(db, "test-store", "1")` → 删除成功
     - `getStore(db, "test-store", "1")` → 返回 `undefined`
  3. **正向测试 — getAll 返回所有记录**：
     - 写入 3 条 → getAll → `expect(result.length).toBe(3)`
  4. **边界测试 — 读取不存在的键**：
     - `getStore(db, "test-store", "nonexistent")` → `undefined`
  5. **边界测试 — db 关闭后操作**：
     - `db.close()` 后 `putStore()` → 预期抛出 `InvalidStateError`
- **失败行为**：测试失败 → IndexedDB 封装实现 bug

#### 步骤 8：组件集成测试

- **操作对象**：关键 UI 组件的渲染和交互行为
- **具体操作**：

  **8a：ParameterPanel 参数校验 UI**
  1. **渲染组件**：`render(<ParameterPanel />)`，包裹 Zustand store provider + 默认参数状态
  2. **滑块交互**：查询 `m1` 对应的 Slider，`userEvent.click` 或 `fireEvent.change` 修改值 → 验证 store 中 `params.m1` 已更新
  3. **负值输入拒绝**：在 `m1` 的 Input 中输入 "-1" → blur → 验证输入框红框样式存在（`toHaveClass("border-red-500")`）→ 验证 store 中 `params.m1` 保持原值
  4. **积分方法切换**：点击 `Select` → 选择 "Euler" → 验证 store 中 `method === "Euler"`

  **8b：AppShell 模式切换**
  1. **渲染** `AppShell`（含 `NavBar`）
  2. **点击"分析模式" Tab**：`userEvent.click(screen.getByText("分析模式"))` → 验证 `useAppStore.activeMode === "analyze"`
  3. **键盘快捷键**：`fireEvent.keyDown(document, { key: "3" })` → 验证 `activeMode === "lab"`

  **8c：SnapshotCard 渲染**
  1. **准备 mock 快照数据**（`SnapshotCardData`）写入 `useDataStore`
  2. **渲染** `SnapshotManager` 组件
  3. **验证** 快照卡片显示缩略图、标签、参数摘要
  4. **点击卡片** → 验证 `selectedSnapshotIds` 更新

- **输入来源**：React 组件 + Zustand store
- **输出去向**：Vitest + @testing-library/react 断言
- **失败行为**：测试失败 → UI 行为与预期不符

---

### 依赖与集成接口

| 依赖方 | 具体接口 | 用途 |
|--------|----------|------|
| Vitest | `describe`/`it`/`expect`/`beforeEach`/`afterEach`/`vi.mock` | 测试框架 |
| `@testing-library/react` | `render`/`screen`/`fireEvent`/`waitFor`/`cleanup` | React 组件渲染与查询 |
| `@testing-library/user-event` | `userEvent.click`/`userEvent.type`/`userEvent.keyboard` | 用户交互模拟 |
| `@testing-library/jest-dom` | `toBeInTheDocument`/`toHaveAttribute`/`toHaveClass`/`toHaveTextContent` | DOM 状态断言扩展 |
| `jsdom` | vitest `environment: "jsdom"` | 浏览器 DOM 模拟 |
| `fake-indexeddb` (或真实 IndexedDB) | — | IndexedDB 封装测试的存储模拟 |
| SIM-01 `odeRhs` | `src/features/simulation/engine/derivatives.ts` → `odeRhs(state, params)` | 物理回归测试的被测函数 |
| SIM-01 `integratorStep` | `src/features/simulation/engine/integrators.ts` → `integratorStep(state, params, dt, method)` | 物理回归测试的被测函数 |
| SIM-01 `computeDerived` | `src/features/simulation/engine/state-vector.ts` → `computeDerived(state, params)` | 能量守恒测试的被测函数 |
| `RingBuffer<T>` | `src/features/data/ring-buffer/ring-buffer.ts` → `RingBuffer` class | RingBuffer 单元测试的被测类 |
| `Float64Pool` | `src/features/simulation/worker/float64-pool.ts` → `Float64Pool` class | Float64Pool 单元测试的被测类 |
| IndexedDB 封装 | `src/shared/lib/cache/indexed-db.ts` → `openDB`/`putStore`/`getStore`/`deleteStore`/`getAll` | IndexedDB 单元测试的被测函数 |
| `useSimulationStore` | `src/features/simulation/store.ts` | 组件测试的 store 状态预设 |
| `useAppStore` | `src/stores/useAppStore.ts` | 导航组件测试的 store 状态预设 |
| Node.js `fs`/`crypto` | `fs.readFileSync` / `crypto.subtle.digest("SHA-256")` | 预计算数据文件读取和 hash 计算 |
| `.precompute-hashes.json` | 项目根目录或 `src/shared/data/` 中的 hash 清单文件 | 预计算数据校验的期望 hash 来源 |

**本模块的目录结构**（新增文件）：

```
src/
├── features/
│   ├── simulation/__tests__/
│   │   ├── physics-regression.test.ts    # [新增] 三项物理回归测试（小角度/单摆退化/能量守恒）
│   │   ├── engine.test.ts                # [已有] ODE 求解器 + Float64Pool 测试
│   │   ├── energy.test.ts                # [已有] 能量监控测试
│   │   └── params.test.ts                # [已有] 参数面板 store 测试
│   └── data/__tests__/
│       ├── ring-buffer.test.ts           # [新增] RingBuffer 单元测试
│       ├── snapshot-db.test.ts           # [新增] IndexedDB CRUD 单元测试
│       └── export.test.ts                # [新增] CSV/JSON/PNG 导出单元测试
├── shared/
│   └── __tests__/
│       └── precompute-validation.test.ts # [新增] 预计算数据一致性校验
└── vitest.config.ts                      # [修改] 补充 coverage 阈值和 testTimeout
```

**本模块对外暴露/注册的 CI 命令**：

| 命令 | 用途 |
|------|------|
| `pnpm test` | 运行全部测试（已在 CI `test` job 中使用） |
| `pnpm test -- --coverage` | 运行测试并生成覆盖率报告（CI 模式下使用） |
| `pnpm test -- --reporter=verbose` | 详细输出模式（本地调试用） |

---

### 状态机

CI 流水线中测试阶段的状态转换：

| 当前状态 | 触发事件 | 下一状态 | 前置条件 | 副作用 |
|----------|----------|----------|----------|--------|
| `waiting` | `check` job 通过 | `running` | TypeScript 类型检查通过 | 开始安装依赖 + 运行测试 |
| `running` | 全部测试通过 + 覆盖率达标 | `passed` | 所有 `expect` 断言通过；coverage 各项 ≥ 阈值 | CI 进入 `build` job |
| `running` | 任一测试失败 | `failed` | — | CI 标记为失败；输出失败测试的详细信息；阻断 `build` job |
| `running` | 覆盖率低于阈值 | `failed` | — | CI 标记为失败；输出覆盖率报告和未覆盖行 |
| `running` | 测试超时（>30s） | `failed` | — | CI 标记为失败；输出超时测试名称和堆栈 |
| `failed` | 开发者修复代码 → 新 push | `waiting` | — | 重新触发整个 CI 流水线 |

---

### 异常与边界条件

#### 异常 1：物理回归测试在 CI 环境中执行超时

- **触发条件**：能量守恒测试需要 60000 步 RK4 积分，在某些 CI runner（低配 CPU）上可能超过 500ms 甚至 30s 全局超时
- **处理策略**：
  1. 能量守恒测试超时容限设为 500ms。若超过 → 发出警告但不标记失败（`console.warn("能量守恒测试耗时 {duration}ms，建议排查性能回归")`）
  2. 全局 vitest timeout 设为 30s（CI 配置中设置 `testTimeout: 30000`）
  3. 若物理回归测试持续超时 → 考虑减少步数到 500s（30000 步），但标注"覆盖范围降级"
- **重试参数**：不自动重试。若 CI 硬件性能不足导致超时，需升级 runner 或优化测试。

#### 异常 2：预计算数据文件缺失

- **触发条件**：`src/shared/data/lyapunov-default.json` 或 `bifurcation-default.json` 不存在（首次克隆项目，未运行预计算脚本）
- **处理策略**：
  1. 文件不存在 → 测试跳过（`it.skip`），输出信息"预计算数据文件 {path} 不存在，跳过一致性校验"
  2. hash 清单 `.precompute-hashes.json` 不存在 → 同上，跳过
  3. 跳过不视为测试失败（`skipped` 计数增加，不影响 `passed/failed`）
- **重试参数**：不重试。开发者需手动运行 `scripts/precompute/run_all.py` 生成数据后，测试自动变为执行。

#### 异常 3：预计算数据 hash 不匹配

- **触发条件**：开发者修改了预计算脚本或参数范围 → 重新运行脚本生成了新 JSON → 但忘记提交更新后的 JSON 或忘记更新 hash 清单
- **处理策略**：
  1. hash 不匹配 → 测试失败
  2. 错误消息明确指出："{filePath} hash 不匹配。期望 {expectedHash}，实际 {actualHash}。若预计算脚本有变更，请运行 `pnpm run precompute` 并提交更新的 JSON 数据文件和 hash 清单。"
  3. 建议在 `package.json` 中添加 `"precompute"` 脚本和 `"postprecompute"` 脚本自动更新 hash 清单
- **重试参数**：不自动重试。开发者修复后重新提交。

#### 异常 4：组件测试中 Zustand store 状态泄漏

- **触发条件**：多个组件测试共享同一个 Zustand store（Zustand 默认全局单例），前一个测试的 store 状态影响后续测试
- **处理策略**：
  1. 每个 `describe` 块的 `beforeEach` 中调用 store 的 `setState` 重置到初始状态
  2. 或使用 Zustand 的 `create` 为每个测试创建独立 store（通过工厂函数）
  3. 组件测试中 `afterEach` 调用 `cleanup()`（@testing-library/react 卸载组件）
- **重试参数**：不适用（属于测试编写规范）。

#### 异常 5：IndexedDB 在 jsdom 中不可用

- **触发条件**：`fake-indexeddb` 库未安装或 jsdom 环境不支持 IndexedDB
- **处理策略**：
  1. 优先方案：安装 `fake-indexeddb` 作为 devDependency，在 `vitest.config.ts` 的 `setupFiles` 中全局注册 `fake-indexeddb/auto`
  2. 后备方案：若 `fake-indexeddb` 不可用 → IndexedDB 测试跳过 + console.warn
  3. 生产代码（浏览器环境）中 IndexedDB 必然可用，不受测试环境影响
- **重试参数**：开发者安装 `fake-indexeddb` 后重新运行。

---

### 原则兑现清单

| 原则来源 | 原则名称 | 代码级约束 |
|----------|----------|------------|
| 功能设计_v0 §五 5.2 | 物理验证三项标准 | 小角度 <2% → `expect(maxDeviation).toBeLessThan(0.02)`；单摆退化周期吻合 → `expect(T_measured).toBeCloseTo(T_exact, 1)`；能量漂移 <0.5% → `expect(drift).toBeLessThan(0.005)` |
| 技术栈设计 §9.4 | 物理回归测试在 CI 中自动化 | 测试文件位于 `features/simulation/__tests__/physics-regression.test.ts`，CI `test` job 中 `vitest --run` 自动执行 |
| 技术栈设计 §9.4 | 预计算数据一致性校验 | SHA-256 hash 比对 + 结构完整性校验（网格尺寸、必需字段） |
| AGENT.md 核心原则 | 不引入 MOCK 数据 | 物理回归测试调用真实 `odeRhs`/`integratorStep`/`computeDerived` 函数，不使用 mock；组件测试使用真实 Zustand store（非 mock store） |
| AGENT.md 核心原则 | 测试数据与生产数据一致 | 物理回归测试参数使用默认 `PendulumParams`（与 SIM-02 `DEFAULT_PARAMS` 一致） |
| 项目结构 §8.1 | 测试分层 | 单元测试（引擎/数据结构）→ `features/*/__tests__/`；组件测试 → `features/*/__tests__/`（@testing-library/react）；构建验证 → CI `vite build` |
| 技术栈设计 §1.2 | 零外部测试服务依赖 | 全部测试在本地 Vitest + jsdom 环境运行，不依赖 Sauce Labs/BrowserStack 等外部测试服务 |

---

### 验收测试场景

#### 正向测试 1：三项物理回归全部通过

- **Given**：
  ```json
  {
    "仿真引擎": "odeRhs/integratorStep/computeDerived 实现已完成",
    "测试环境": "vitest + Node environment"
  }
  ```
- **When**：运行 `pnpm test -- --reporter=verbose src/features/simulation/__tests__/physics-regression.test.ts`
- **Then**：
  - 小角度线性化测试：`maxDeviation < 0.02`，passed
  - 单摆退化测试：`|T_measured - T_exact| / T_exact < 0.1`，passed
  - 能量守恒测试：`drift < 0.005`（1000s 仿真），passed
  - 三个测试总耗时 < 1s
  - 终端输出包含各测试的实际测量值

#### 正向测试 2：预计算数据校验通过

- **Given**：
  ```json
  {
    "预计算 JSON": "src/shared/data/lyapunov-default.json 和 bifurcation-default.json 存在且 hash 匹配",
    "hash 清单": ".precompute-hashes.json 存在且包含正确 hash"
  }
  ```
- **When**：运行 `pnpm test -- src/shared/__tests__/precompute-validation.test.ts`
- **Then**：
  - `lyapunov-default.json`：hash 匹配，结构完整，网格 100×100，所有格点值有限
  - `bifurcation-default.json`：hash 匹配，结构完整，数据为非空数组
  - 所有 `PrecomputeValidationResult.passed === true`
  - 测试通过

#### 正向测试 3：RingBuffer 全覆盖测试通过

- **Given**：`RingBuffer<number>` 实现已完成
- **When**：运行 `pnpm test -- src/features/data/__tests__/ring-buffer.test.ts`
- **Then**：
  - 空缓冲区行为正确（length=0, at(0)=undefined）
  - push/at 按 FIFO 顺序
  - 超出容量后环形覆盖
  - toArray 返回正确顺序的所有有效元素
  - clear 清空
  - 索引越界返回 undefined
  - 所有断言通过

#### 异常测试 1：能量漂移超标导致回归失败

- **Given**：代码中 `odeRhs` 的 denom 公式被错误修改（如多乘了因子 2，模拟 SIM-01 v2.0 的 bug）
- **When**：运行物理回归测试的能量守恒测试
- **Then**：
  - 1000s 仿真后漂移 > 0.5%
  - 测试失败，输出 `PhysicsRegressionResult { passed: false, measured: { drift: 0.xxx }, expected: { threshold: 0.005 } }`
  - CI test job 标记为 failed
  - 错误消息包含实际漂移值和建议排查方向

#### 异常测试 2：预计算数据 hash 不匹配

- **Given**：
  ```json
  {
    "预计算 JSON": "lyapunov-default.json 内容已被修改（手动编辑了某个格点值）",
    "hash 清单": ".precompute-hashes.json 中的 hash 未更新"
  }
  ```
- **When**：运行预计算数据校验测试
- **Then**：
  - `hashMatch === false`
  - 测试失败，错误消息："lyapunov-default.json hash 不匹配。期望 abc123，实际 def456。若预计算脚本有变更，请运行 `pnpm run precompute` 并提交更新的 JSON 数据文件和 hash 清单。"
  - 指出是哪个文件失败

#### 异常测试 3：组件测试中非法输入校验失败

- **Given**：`ParameterPanel` 组件渲染完成，用户准备输入
- **When**：`userEvent.type(m1Input, "-5")` → `fireEvent.blur(m1Input)`
- **Then**：
  - 输入框出现红框样式（`toHaveClass("border-red-500")` 或类似错误样式）
  - 输入框旁出现 Tooltip 或错误消息包含"质量"和"范围"
  - `useSimulationStore.params.m1` 保持原值 1.0（未更新）
  - `useSimulationStore.isSceneFrozen === true`

---

### 注意事项与禁止行为

1. **【物理回归测试的确定性】** 所有物理回归测试必须使用固定初始条件（硬编码在测试文件中），禁止使用 `Math.random()` 生成初始条件。仿真结果必须在相同代码下可重复（浮点 bit-identical 因硬件/编译器差异不一定保证，但偏差必须在 1e-12 量级内）。
2. **【能量守恒测试的性能】** 60000 步 RK4 积分在 Node 环境中通常 < 300ms。若超过 500ms → 需检查是否引入了性能回归（如不必要的内存分配）。测试本身可设置 `timeout: 5000`，给 CI 环境留足余量。
3. **【预计算数据 hash 清单维护】** `.precompute-hashes.json` 由预计算脚本 `run_all.py` 自动生成（或在 npm `postprecompute` 脚本中生成）。开发者执行 `pnpm run precompute` 后，hash 清单自动更新。禁止手动编辑此文件。
4. **【禁止行为】** 禁止在物理回归测试中使用 `vi.mock` 或任何 mock 替代真实 ODE 函数。物理回归测试的价值在于验证真实代码的正确性，mock 会使其失效。
5. **【禁止行为】** 禁止组件测试绕过 Zustand store 直接操作组件 state。所有状态变更必须通过 store actions 或用户交互触发（即测试用户实际使用路径）。
6. **【禁止行为】** 禁止在 CI 中跳过物理回归测试（如 `it.skip` 或 `--exclude` flag）。物理回归测试是整个项目的质量门禁，跳过会隐藏物理正确性退化。
7. **【易错点】** 单摆退化测试中，`m2 = 0` 时 `odeRhs` 的 `denom = m1 + 0 - 0*cos²(δ) = m1`，不会产生除零。但下摆的角加速度公式中分母 `L2 * denom = L2 * m1`，若 `L2` 也为 0 才会除零。确保测试参数 `L2 = 1.0`。
8. **【易错点】** 小角度线性化测试的基准解使用 `dt/100` 步长的 RK4。需确保基准解自身精度足够（通常 `dt/100` 的全局误差 < 1e-8），否则基准解自身的误差会导致测试假阳性。
9. **【易错点】** RingBuffer 测试中 `toArray()` 返回的数组顺序：当 buffer 已满（count === capacity）时，最旧数据从 `head` 位置开始。需验证 `toArray()` 按时间顺序（最旧→最新）返回。当前实现（`ring-buffer.ts`）使用 `at(i)` 按逻辑顺序遍历，正确性依赖 `at()` 实现。
10. **【偷懒红线】** 物理回归测试中 `odeRhs` 的调用参数（`PendulumParams` 的 6 个字段）、`integratorStep` 的调用参数（`dt=1/60`, `method="RK4"`）、预期阈值来源（功能设计_v0 §五 5.2）必须在测试代码注释中显式标注。禁止使用"参见设计文档"替代具体数值和来源引用。

---

*本文档由 AI 辅助生成，基于功能模块全拆解 INF-03 + 技术栈设计 §2 #20/#25 + §9.4 + 已有测试代码兼容。*
