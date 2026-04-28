# 功能点：SIM-02 参数控制面板

> **文档生成时间**：2026-04-28 20:00:00 CST
> **版本记录**：
> | 版本 | 时间 | 修改人 | 变更摘要 |
> |------|------|--------|----------|
> | v1.0 | 2026-04-28 20:00:00 | AI Assistant | 初始版本，对齐 SIM-01 v2.0 Worker 协议与 EXP-01 的 Zustand store 契约 |
> | v1.1 | 2026-04-28 21:00:00 | AI Assistant | 修正步骤 8 bridge 代码：Zustand v4.5 subscribe 仅接受单参数 listener(state, prevState)，改用全量 diff 替代 selector 模式 |

> **冲突核查指引**：本版本与 SIM-01 v2.0 的 `PendulumParams` / `WorkerUpdateParamsCommand` / `WorkerResetCommand` 接口一致，与 EXP-01 v1.0 的 `useSimulationStore` 消费模式兼容。若上游接口变更，以时间戳更新的版本为准。

### 所属模块与溯源

- **对应总设计章节**：功能设计_v0 §三 3.1（参数控制）、§九（输入校验部分）、§三 3.4（蝴蝶效应参数调节）；技术栈设计 §2 #7-#9（Zustand + Tailwind + shadcn/ui）、§3.1 架构分层图（UI 层 → Store → Worker）
- **依赖的其他功能模块**：
  - `SIM-01`（双摆物理引擎）— 通过 Worker 的 `updateParams` / `reset` / `setMethod` / `setDirection` 命令写入参数变更
  - `SYS-01`（响应式布局引擎）— 提供 `deviceType`，影响控制面板布局（桌面侧栏 / 平板底部抽屉 / 手机折叠菜单）
- **被依赖模块**：EXP-01（消费 Zustand store 中的 params 和 method）、ANL-01（向本模块注入参数）、ANL-02（向本模块注入参数）、EXP-04（蝴蝶效应对比器使用本模块的参数同步控制）

### 已有设计兼容性分析

- **已审查的相关规格文档**：
  - `SIM-01-双摆物理引擎.md` v2.0：`PendulumParams`（6 字段）、`IntegratorMethod`、`WorkerInitCommand.initialConditions`（4 字段）、`WorkerUpdateParamsCommand`、`WorkerResetCommand`、`WorkerSetMethodCommand`、`WorkerSetDirectionCommand`
  - `EXP-01-3D仿真场景.md` v1.0：引用 `PhysicsParams`（`src/shared/types/physics.ts`）、`useSimulationStore`（`src/features/simulation/store.ts`）
  - `双摆混沌实验室-技术栈设计.md` v1.2：§2 #7 Zustand、#8 Tailwind CSS、#9 shadcn/ui、§3.2 主线程 Zustand 写入 → Worker postMessage
- **兼容性结论**：
  - `PendulumParams` 类型定义与 SIM-01 Worker 接口完全一致，6 个字段名和约束条件对齐
  - `InitialConditions` 类型从 SIM-01 的 `WorkerInitCommand.initialConditions` 中提取为独立类型，字段名和语义一致
  - `IntegratorMethod` 枚举值 `"RK4" | "VelocityVerlet" | "Euler"` 与 SIM-01 一致
  - Zustand store 命名 `useSimulationStore` 与 EXP-01 的引用一致
  - 无冲突，本模块遵循 SIM-01 定义的参数类型作为权威源
- **复用的已有定义**：`PendulumParams`、`IntegratorMethod`、`InitialConditions`（均来自 SIM-01 的 Worker 消息协议）

### 技术栈绑定

- **必须使用**：
  - `react@^18.3.1` — UI 框架
  - `zustand@^4.5.5` — 参数状态管理，store slice 命名为 `useSimulationStore`
  - `tailwindcss@^3.4.16` — 控制面板布局与输入框样式
  - `shadcn/ui`（Copy 模式）— `Slider`（参数滑块）、`Input`（数值输入）、`Select`（方法下拉）、`Tabs`（参数分组标签页）、`Tooltip`（悬浮提示合理范围）、`Button`（预设按钮）、`Label`（参数名称标签）、`Badge`（参数分组标识）
  - `lucide-react`（shadcn/ui 依赖）— `RotateCcw`（重置图标）、`Play` / `Pause`（仿真控制图标）、`AlertCircle`（校验错误图标）、`Zap`（预设图标）
  - TypeScript 5.x — 类型安全
- **禁止使用**：
  - 禁止使用 HTML 原生 `<input type="range">` 替代 shadcn/ui `Slider`（需统一交互风格与无障碍支持）
  - 禁止在组件内部直接调用 `worker.postMessage`（必须通过 Zustand store 的订阅机制 bridge 到 Worker，保持数据流单向：UI → Store → Worker）
  - 禁止在滑块拖动过程中每帧都发送 `updateParams`（应在拖动结束后发送一次，避免 Worker 消息风暴）
  - 禁止绕过校验直接将用户输入写入 store（所有输入必须先通过 `validateParam` 函数）

### 输入定义（精确类型）

#### 类型定义（放在 `src/shared/types/physics.ts`，与 SIM-01 和 EXP-01 共享）

```typescript
/**
 * 双摆物理参数。
 * 所有长度单位为米(m)，质量单位为千克(kg)。
 * 该类型与 SIM-01 Worker PendulumParams 完全一致。
 */
interface PendulumParams {
  /** 上摆球质量 (kg)。硬约束：> 0。建议范围：(0.01, 100.0]。滑块范围：[0.1, 10.0]。示例：1.0 */
  m1: number;
  /** 下摆球质量 (kg)。硬约束：> 0。建议范围：(0.01, 100.0]。滑块范围：[0.1, 10.0]。示例：1.0 */
  m2: number;
  /** 上摆杆长 (m)。硬约束：> 0。建议范围：(0.05, 5.0]。滑块范围：[0.1, 3.0]。示例：1.0 */
  L1: number;
  /** 下摆杆长 (m)。硬约束：> 0。建议范围：(0.05, 5.0]。滑块范围：[0.1, 3.0]。示例：1.0 */
  L2: number;
  /** 重力加速度 (m/s²)。硬约束：>= 0。滑块范围：[0, 20.0]。默认 9.81。示例：9.81 */
  g: number;
  /** 阻尼系数 (1/s)。硬约束：>= 0。滑块范围：[0, 2.0]。默认 0。示例：0.1 */
  damping: number;
}

/**
 * 初始条件。角度单位为弧度(rad)，角速度单位为弧度/秒(rad/s)。
 * 该类型与 SIM-01 WorkerInitCommand.initialConditions 完全一致。
 */
interface InitialConditions {
  /** 上摆初始角度 (rad)。任意实数（自动归一化到 (-π, π]）。示例：1.5708 */
  theta1: number;
  /** 上摆初始角速度 (rad/s)。任意实数。默认 0。示例：0.0 */
  theta1Dot: number;
  /** 下摆初始角度 (rad)。任意实数（自动归一化到 (-π, π]）。示例：1.5708 */
  theta2: number;
  /** 下摆初始角速度 (rad/s)。任意实数。默认 0。示例：0.0 */
  theta2Dot: number;
}

/** 与 SIM-01 的 IntegratorMethod 一致 */
type IntegratorMethod = "RK4" | "VelocityVerlet" | "Euler";

/**
 * 参数预设定义。
 * 用于一键设置特定参数组合（物理验证、教学演示等）。
 */
interface ParamPreset {
  /** 预设唯一标识 */
  id: string;
  /** 预设显示名称（中文） */
  label: string;
  /** 预设描述 */
  description: string;
  /** 预设参数（部分字段，仅覆盖需变更的参数） */
  params: Partial<PendulumParams>;
  /** 预设初始条件（部分字段，仅覆盖需变更的字段） */
  initialConditions: Partial<InitialConditions>;
  /** 预设积分方法（可选，不填则保持当前） */
  method?: IntegratorMethod;
}

/**
 * 单个参数的校验结果。
 */
interface ValidationResult {
  /** 是否通过校验 */
  valid: boolean;
  /** 错误级别："error"（硬约束违反，阻止提交）| "warning"（建议范围外，允许但提示）| null（通过） */
  level: "error" | "warning" | null;
  /** 人类可读的错误/警告消息 */
  message: string | null;
}

/**
 * 单个参数控制的 UI 配置元数据。
 */
interface ParamFieldMeta {
  /** 字段在 PendulumParams 或 InitialConditions 中的键名 */
  key: string;
  /** 显示标签（中文） */
  label: string;
  /** 单位符号（如 "kg"、"m"、"rad"） */
  unit: string;
  /** 硬约束最小值（含），null 表示无下限 */
  hardMin: number | null;
  /** 硬约束最大值（含），null 表示无上限 */
  hardMax: number | null;
  /** 滑块最小值 */
  sliderMin: number;
  /** 滑块最大值 */
  sliderMax: number;
  /** 滑块步长（0 表示连续） */
  sliderStep: number;
  /** 数值输入精度（小数位数） */
  decimalPlaces: number;
  /** 默认值 */
  defaultValue: number;
  /** 所属分组 */
  group: "system" | "initial" | "environment";
  /** 字段排序权重（越小越靠前） */
  order: number;
}
```

### 输出定义（精确类型）

#### Zustand Store 切片（`useSimulationStore` 中的 simulationParams slice）

```typescript
import { create } from "zustand";

interface SimulationParamsState {
  // ===== 参数值 =====
  /** 当前物理参数 */
  params: PendulumParams;
  /** 当前初始条件 */
  initialConditions: InitialConditions;
  /** 当前积分方法 */
  method: IntegratorMethod;

  // ===== 参数元数据（不变，仅初始化一次） =====
  /** 所有参数字段的 UI 配置 */
  paramMeta: ParamFieldMeta[];

  // ===== UI 交互状态 =====
  /** 当前正在编辑的字段名（用于显示精确数值输入框），null 表示无活跃编辑 */
  activeField: string | null;
  /** 字段 → 校验结果映射。仅存储最近一次校验的非 pass 结果 */
  fieldErrors: Record<string, ValidationResult>;
  /** 是否因为参数非法而冻结 3D 场景 */
  isSceneFrozen: boolean;
  /** 参数面板是否展开（移动端折叠） */
  isPanelExpanded: boolean;

  // ===== Actions =====

  /**
   * 设置单个物理参数。
   * 触发校验 → 校验通过则更新 store → 由 bridge 层发送 Worker updateParams。
   * @param key - 参数键名（如 "m1"）
   * @param value - 新值
   */
  setParam: (key: keyof PendulumParams, value: number) => void;

  /**
   * 设置单个初始条件。
   * 触发校验 → 校验通过则更新 store → 由 bridge 层发送 Worker reset（完整初始条件）。
   * @param key - 初始条件键名（如 "theta1"）
   * @param value - 新值
   */
  setInitialCondition: (key: keyof InitialConditions, value: number) => void;

  /**
   * 设置积分方法。
   * 立即更新 store → 由 bridge 层发送 Worker setMethod。
   */
  setMethod: (method: IntegratorMethod) => void;

  /**
   * 一键应用参数预设。
   * 覆盖预设中指定的 params / initialConditions / method 字段。
   * 每个字段独立校验。全部通过后原子更新 store 并发送 Worker 命令。
   * 任何字段校验失败 → 全部回滚，不更新。
   * @param preset - 预设对象
   */
  applyPreset: (preset: ParamPreset) => void;

  /**
   * 外部模块注入参数（如 ANL-01 热力图点击、ANL-02 分岔图游标）。
   * 注入的参数不经过用户交互校验，直接写入 store 并发送 Worker 命令。
   * 仅覆盖传入的字段，未传入字段保持当前值。
   * @param params - 部分物理参数
   * @param initialConditions - 部分初始条件（可选）
   */
  injectParams: (
    params: Partial<PendulumParams>,
    initialConditions?: Partial<InitialConditions>,
  ) => void;

  /**
   * 设置活跃编辑字段。
   * 设为 null 时触发失焦提交：若当前临时值有效，则落实；否则回滚到最近有效值。
   */
  setActiveField: (field: string | null) => void;

  /**
   * 重置所有参数为默认值。
   * 恢复出厂默认参数 + 默认初始条件 + RK4。
   */
  resetToDefaults: () => void;

  /**
   * 清空所有字段的校验错误。
   */
  clearFieldErrors: () => void;
}
```

#### 默认值常量定义

```typescript
/** 默认物理参数 — 功能设计建议的标准初始参数 */
const DEFAULT_PARAMS: PendulumParams = {
  m1: 1.0,
  m2: 1.0,
  L1: 1.0,
  L2: 1.0,
  g: 9.81,
  damping: 0.0,
};

/** 默认初始条件 — 两个摆均从水平位置静止释放 */
const DEFAULT_INITIAL_CONDITIONS: InitialConditions = {
  theta1: Math.PI / 2,  // ~1.5708 rad (90°)
  theta1Dot: 0.0,
  theta2: Math.PI / 2,  // ~1.5708 rad (90°)
  theta2Dot: 0.0,
};

/** 默认积分方法 */
const DEFAULT_METHOD: IntegratorMethod = "RK4";

/**
 * 所有 10 个参数字段的 UI 元数据。
 * 按 order 排序后渲染控制面板。
 */
const PARAM_META: ParamFieldMeta[] = [
  // ---- system 组 ----
  { key: "m1",    label: "上摆质量", unit: "kg",   hardMin: 1e-6, hardMax: null, sliderMin: 0.1, sliderMax: 10.0, sliderStep: 0.1, decimalPlaces: 3, defaultValue: 1.0,   group: "system",       order: 1 },
  { key: "m2",    label: "下摆质量", unit: "kg",   hardMin: 1e-6, hardMax: null, sliderMin: 0.1, sliderMax: 10.0, sliderStep: 0.1, decimalPlaces: 3, defaultValue: 1.0,   group: "system",       order: 2 },
  { key: "L1",    label: "上摆杆长", unit: "m",    hardMin: 1e-6, hardMax: null, sliderMin: 0.1, sliderMax: 3.0,  sliderStep: 0.05,decimalPlaces: 3, defaultValue: 1.0,   group: "system",       order: 3 },
  { key: "L2",    label: "下摆杆长", unit: "m",    hardMin: 1e-6, hardMax: null, sliderMin: 0.1, sliderMax: 3.0,  sliderStep: 0.05,decimalPlaces: 3, defaultValue: 1.0,   group: "system",       order: 4 },
  { key: "g",     label: "重力加速度", unit: "m/s²",hardMin: 0,     hardMax: null, sliderMin: 0.0, sliderMax: 20.0, sliderStep: 0.1, decimalPlaces: 2, defaultValue: 9.81,  group: "environment",  order: 9 },
  { key: "damping",label: "阻尼系数", unit: "1/s",  hardMin: 0,     hardMax: null, sliderMin: 0.0, sliderMax: 2.0,  sliderStep: 0.01,decimalPlaces: 3, defaultValue: 0.0,   group: "environment",  order: 10 },
  // ---- initial 组 ----
  { key: "theta1",    label: "上摆初始角度", unit: "rad", hardMin: null, hardMax: null, sliderMin: -Math.PI, sliderMax: Math.PI, sliderStep: 0.01, decimalPlaces: 4, defaultValue: Math.PI/2, group: "initial", order: 5 },
  { key: "theta1Dot", label: "上摆初始角速度",unit:"rad/s",hardMin:null, hardMax: null, sliderMin: -10.0, sliderMax: 10.0, sliderStep: 0.1, decimalPlaces: 3, defaultValue: 0.0, group: "initial", order: 6 },
  { key: "theta2",    label: "下摆初始角度", unit: "rad", hardMin: null, hardMax: null, sliderMin: -Math.PI, sliderMax: Math.PI, sliderStep: 0.01, decimalPlaces: 4, defaultValue: Math.PI/2, group: "initial", order: 7 },
  { key: "theta2Dot", label: "下摆初始角速度",unit:"rad/s",hardMin:null, hardMax: null, sliderMin: -10.0, sliderMax: 10.0, sliderStep: 0.1, decimalPlaces: 3, defaultValue: 0.0, group: "initial", order: 8 },
];
```

### 核心逻辑步骤

#### 阶段 A：参数校验

**步骤 1：单字段校验（validateParam）**

- **操作对象**：单个参数键名 `key` 和候选值 `value: number`
- **具体操作**：
  1. 从 `PARAM_META` 中查找 `key` 对应的 `ParamFieldMeta`
  2. 若 `key` 不在 `PARAM_META` 中 → 返回 `{ valid: false, level: "error", message: "未知参数: {key}" }`
  3. 若 `typeof value !== "number"` 或 `isNaN(value)` → 返回 `{ valid: false, level: "error", message: "{label} 必须为有效数字" }`
  4. 硬约束检查：
     - 若 `hardMin !== null` 且 `value < hardMin` → 返回 `{ valid: false, level: "error", message: "{label} 不能小于 {hardMin} {unit}" }`
     - 若 `hardMax !== null` 且 `value > hardMax` → 返回 `{ valid: false, level: "error", message: "{label} 不能大于 {hardMax} {unit}" }`
  5. 建议范围检查：
     - 若 `value < sliderMin` 或 `value > sliderMax` → 返回 `{ valid: true, level: "warning", message: "{label} 建议范围 [{sliderMin}, {sliderMax}] {unit}" }`（允许但提示）
  6. 全部通过 → 返回 `{ valid: true, level: null, message: null }`
- **输入来源**：用户在 UI 中修改参数时触发
- **输出去向**：校验结果写入 `fieldErrors[key]`，控制 UI 的红色边框震动和 Tooltip 显示
- **失败行为**：`level === "error"` → 冻结 3D 场景（`isSceneFrozen = true`），不更新 store 值，不发送 Worker 命令；`level === "warning"` → 允许更新，但输入框显示黄色边框 + Tooltip

**步骤 2：全量校验（validateAll）**

- **操作对象**：当前 `params` + `initialConditions` 的全部 10 个字段
- **具体操作**：
  1. 遍历 `params` 的 6 个字段，对每个调用 `validateParam`（步骤 1）
  2. 遍历 `initialConditions` 的 4 个字段，对每个调用 `validateParam`
  3. 收集所有 `level === "error"` 的结果
  4. 若全部通过（10 个字段均 `valid === true` 且无 `error` 级别）→ 返回 `true`
  5. 否则 → 返回 `false`，`fieldErrors` 中包含所有非 pass 字段
- **输入来源**：预设应用前（`applyPreset`）、外部注入前（`injectParams`）调用
- **输出去向**：布尔返回值决定是否允许参数更新
- **失败行为**：任一字段 error → 全部回滚（原子性），`isSceneFrozen = true`

#### 阶段 B：参数写入与 Worker 通信

**步骤 3：物理参数更新（setParam → Worker updateParams）**

- **操作对象**：`params` 中的单个字段
- **具体操作**：
  1. 调用 `validateParam(key, value)`（步骤 1）
  2. 若 `valid === false` 且 `level === "error"` → 中止，设置 `isSceneFrozen = true`
  3. 若通过（含 warning）：
     a. 更新 store：`params[key] = value`
     b. 若 `isSceneFrozen` 此前为 true 且当前无其他 error 字段 → `isSceneFrozen = false`
     c. 由 **bridge 层**（步骤 7）检测到 `params` 变化 → 发送 `WorkerUpdateParamsCommand`：`worker.postMessage({ type: "updateParams", params: { [key]: value } })`
  4. 若为 warning → 额外将 warning 结果写入 `fieldErrors[key]`
- **输入来源**：用户在 UI 中拖动滑块或输入数值后失焦提交
- **输出去向**：Zustand store 更新 → bridge 层发送 Worker 命令 → SIM-01 Worker 热更新参数
- **失败行为**：`level === "error"` → store 不更新，Worker 不发送，UI 显示红色动画

**步骤 4：初始条件更新（setInitialCondition → Worker reset）**

- **操作对象**：`initialConditions` 中的单个字段
- **具体操作**：
  1. 调用 `validateParam(key, value)`（步骤 1）
  2. 若 `level === "error"` → 中止，同步骤 3 失败行为
  3. 若通过：更新 store 中的 `initialConditions[key] = value`
  4. **关键差异**：初始条件变更需要重启仿真。由 bridge 层发送完整的 `WorkerResetCommand`：
     ```typescript
     worker.postMessage({
       type: "reset",
       initialConditions: { theta1, theta1Dot, theta2, theta2Dot }
     });
     ```
     而非单个字段的增量更新
  5. 重置后清空 RingBuffer（历史轨迹不适用于新初始条件）
- **输入来源**：用户在 UI 中修改初始角度或角速度
- **输出去向**：Worker 完全重置仿真，从新初始条件开始积分
- **失败行为**：同步骤 3

**步骤 5：积分方法切换（setMethod → Worker setMethod）**

- **操作对象**：`method` 字段
- **具体操作**：
  1. 校验 `method in ["RK4", "VelocityVerlet", "Euler"]`
  2. 更新 store：`method = newMethod`
  3. Bridge 层发送 `worker.postMessage({ type: "setMethod", method })`
  4. 不清除历史轨迹（方法切换在当前状态基础上继续积分）
- **输入来源**：用户在 UI 的 `Select` 下拉中切换
- **输出去向**：Worker 下一次 `step` 命令使用新方法积分
- **失败行为**：非法 method 值 → 忽略，保持当前方法

**步骤 6：预设应用（applyPreset）**

- **操作对象**：`ParamPreset` 对象
- **具体操作**：
  1. 将预设中的 `params` 和 `initialConditions` 浅合并到当前值：`newParams = { ...currentParams, ...preset.params }`，`newIC = { ...currentIC, ...preset.initialConditions }`
  2. 对合并后的所有变更字段调用 `validateParam`
  3. 若任一字段 `level === "error"` → **全部回滚**（不更新 store，不发送 Worker），返回失败字段列表
  4. 若全部通过：
     a. 原子写入 store：`params = newParams`，`initialConditions = newIC`，若 `preset.method` 则 `method = preset.method`
     b. 若 `initialConditions` 变更 → 发送 `WorkerResetCommand`
     c. 若 `params` 变更但 `initialConditions` 未变 → 发送 `WorkerUpdateParamsCommand`（含所有变更字段）
     d. 若 `method` 变更 → 发送 `WorkerSetMethodCommand`
     e. 清空 `fieldErrors`
  5. 前端显示 Toast："已应用预设：{preset.label}"
- **输入来源**：用户点击预设按钮；外部模块（ANL-01/ANL-02）调用
- **输出去向**：Zustand store 原子更新 → Worker 接收对应命令
- **失败行为**：任一字段校验失败 → 全部回滚，显示第一个失败字段的错误 Tooltip

**步骤 7：外部参数注入（injectParams）**

- **操作对象**：`Partial<PendulumParams>` + 可选的 `Partial<InitialConditions>`
- **具体操作**：
  1. 对注入的每个字段调用 `validateParam`
  2. 若 `level === "error"` → 拒绝该字段（不更新），记录 warning 日志
  3. 若通过 → 写入 store，bridge 层发送对应 Worker 命令
  4. 不设置 `isSceneFrozen`（外部注入是程序化操作，非用户编辑）
  5. 不清空 `fieldErrors`（不干扰当前用户正在编辑的字段提示）
- **输入来源**：ANL-01 热力图格点点击、ANL-02 分岔图游标拖拽、蝴蝶效应对比器同步参数
- **输出去向**：store 更新 → Worker 接收命令 → 3D 场景立即切换
- **失败行为**：部分字段校验失败 → 仅更新通过校验的字段，失败的字段静默跳过 + `console.warn`

#### 阶段 C：Bridge 层（Store → Worker 订阅）

**步骤 8：Store 变更自动同步到 Worker**

- **操作对象**：Zustand store 的 `params`、`initialConditions`、`method` 切片
- **具体操作**：

  ```typescript
  /**
   * Bridge 层：在应用初始化时建立 store → Worker 的订阅管道。
   * 此逻辑不属于 React 组件，在 src/features/simulation/worker/bridge.ts 中实现。
   *
   * 注意：Zustand v4.5 的 subscribe 仅接受单参数 listener(state, prevState)，
   * 不支持 selector 模式。bridge 订阅全量 state 变更，手动 diff 三个切片。
   */
  function setupSimulationBridge(): () => void {
    const sched = getScheduler();
    let lastSyncedParams = { ...store.getState().params };
    let lastRunning = false;

    const unsub = store.subscribe((state, prevState) => {
      // ── params 变更 → Worker updateParams（16ms 防抖）──
      if (state.params !== prevState.params) {
        const diff: Partial<PendulumParams> = {};
        for (const k of Object.keys(state.params) as (keyof PendulumParams)[]) {
          if (state.params[k] !== lastSyncedParams[k]) diff[k] = state.params[k];
        }
        if (Object.keys(diff).length > 0) {
          Object.assign(pendingUpdateDiff, diff);
          clearTimeout(updateTimer);
          updateTimer = setTimeout(() => {
            const d = { ...pendingUpdateDiff };
            pendingUpdateDiff = {};
            lastSyncedParams = { ...store.getState().params };
            if (workerReady) sched.updateParams(d);
            else enqueue("updateParams", d);
          }, 16);
        }
      }

      // ── initialConditions 变更 → Worker reset（100ms 去重）──
      if (state.initialConditions !== prevState.initialConditions) {
        clearTimeout(resetTimer);
        resetTimer = setTimeout(() => {
          if (workerReady) sched.reset(state.initialConditions);
          else enqueue("reset", state.initialConditions);
        }, 100);
      }

      // ── method 变更 → Worker setMethod（立即发送）──
      if (state.method !== prevState.method) {
        if (workerReady) sched.setMethod(state.method);
        else enqueue("setMethod", state.method);
      }

      // ── isRunning 变更 → 启停仿真 ──
      if (state.isRunning !== lastRunning) {
        lastRunning = state.isRunning;
        if (state.isRunning) sched.start(state.params, state.initialConditions, state.method);
        else sched.pause();
      }
    });

    return unsub;
  }
  ```

- **输入来源**：Zustand store 的 `params` / `initialConditions` / `method` 切片
- **输出去向**：Worker `postMessage`（`updateParams` / `reset` / `setMethod`）
- **失败行为**：Worker 不存在或已崩溃 → `console.error`，不抛异常（bridge 层静默降级）

**步骤 9：防抖与去重**

- **操作对象**：bridge 层的 Worker 消息发送
- **具体操作**：
  1. `updateParams` 防抖：连续多次 `params` 变更合并为一次发送，延迟 16ms（一帧）。在延迟窗口内的多次变更只发送最后一次的累积 diff
  2. `reset` 去重：若上一次 `reset` 发送后 100ms 内再次触发，跳过前一次（仅保留最新初始条件）
  3. `setMethod` 无防抖去重（立即发送）
- **输入来源**：用户快速拖动滑块时产生的连续参数变更
- **输出去向**：合并后的 Worker 命令
- **失败行为**：防抖窗口内若 store 状态被 `resetToDefaults` 覆盖 → 取消窗口内所有待发消息，仅发送最终状态

#### 阶段 D：UI 组件层

**步骤 10：参数滑块组件（ParamSlider）**

- **操作对象**：单个参数的滑块 + 数值输入双模式 UI
- **具体操作**：

  ```typescript
  /**
   * 单个参数控制行组件。
   * 渲染结构：
   * ┌────────────────────────────────────────────┐
   * │ [Label] [数值输入框] [单位]                  │
   * │ [═══════════╤═══════════════] ← Slider     │
   * │   sliderMin  ▲当前位置    sliderMax        │
   * └────────────────────────────────────────────┘
   */
  function ParamSlider({ fieldKey }: { fieldKey: string }) {
    const meta = PARAM_META.find(m => m.key === fieldKey)!;
    const value = useSimulationStore(s => {
      // 从 params 或 initialConditions 中读取当前值
      if (meta.group === "initial") return s.initialConditions[fieldKey as keyof InitialConditions];
      return s.params[fieldKey as keyof PendulumParams];
    });
    const error = useSimulationStore(s => s.fieldErrors[fieldKey]);
    const setParam = useSimulationStore(s => s.setParam);
    const setInitialCondition = useSimulationStore(s => s.setInitialCondition);
    const activeField = useSimulationStore(s => s.activeField);
    const setActiveField = useSimulationStore(s => s.setActiveField);

    const isActive = activeField === fieldKey;
    const handleChange = meta.group === "initial" ? setInitialCondition : setParam;

    return (
      <div className={cn("space-y-1", error?.level === "error" && "animate-shake")}>
        <div className="flex items-center gap-2">
          <Label className="w-24 text-sm">{meta.label}</Label>
          <Input
            type="number"
            value={isActive ? undefined : value.toFixed(meta.decimalPlaces)}
            onChange={(e) => handleChange(fieldKey as any, parseFloat(e.target.value))}
            onFocus={() => setActiveField(fieldKey)}
            onBlur={() => setActiveField(null)}
            className={cn(
              "w-20 h-7 text-xs",
              error?.level === "error" && "border-red-500 ring-red-200",
              error?.level === "warning" && "border-yellow-500 ring-yellow-200",
            )}
            step={meta.sliderStep}
          />
          <span className="text-xs text-muted-foreground w-8">{meta.unit}</span>
        </div>
        <Slider
          value={[value]}
          min={meta.sliderMin}
          max={meta.sliderMax}
          step={meta.sliderStep}
          onValueChange={([v]) => handleChange(fieldKey as any, v)}
          className="w-full"
        />
        {error?.message && (
          <Tooltip content={error.message}>
            <AlertCircle className={cn("h-3 w-3", error.level === "error" ? "text-red-500" : "text-yellow-500")} />
          </Tooltip>
        )}
      </div>
    );
  }
  ```

- **输入来源**：用户鼠标/触控操作
- **输出去向**：`setParam` / `setInitialCondition` action → store 更新 → bridge → Worker
- **失败行为**：输入解析失败（非数字）→ 回退到上一次有效值；失焦时若值无效 → 同样回退

**步骤 11：方法选择器（MethodSelector）**

- **操作对象**：`method` 字段
- **具体操作**：渲染 shadcn/ui `Select` 组件，3 个选项：
  - `"RK4"` — 标签 "RK4（4 阶龙格-库塔）"，副文本 "默认，精度与速度平衡"
  - `"VelocityVerlet"` — 标签 "Velocity Verlet"，副文本 "辛积分器，长时间能量守恒佳"
  - `"Euler"` — 标签 "Euler（1 阶）"，副文本 "教育用途，展示数值误差"
- **输入来源**：用户下拉选择
- **输出去向**：`setMethod` action → bridge → Worker `setMethod`
- **失败行为**：选择未列出的值 → 忽略

**步骤 12：预设按钮组（PresetButtons）**

- **操作对象**：预定义的 `ParamPreset[]` 数组
- **具体操作**：渲染一排 shadcn/ui `Button`（`variant="outline"`），点击调用 `applyPreset(preset)`。至少包含 3 个预设：

  ```typescript
  const PRESETS: ParamPreset[] = [
    {
      id: "small-angle",
      label: "小角度线性化",
      description: "将两摆设为 3° 以内，验证线性近似",
      params: {},
      initialConditions: { theta1: 0.052, theta1Dot: 0, theta2: 0.034, theta2Dot: 0 },
      method: "RK4",
    },
    {
      id: "single-pendulum",
      label: "单摆退化",
      description: "将 m₂ 设为零，退化为单摆",
      params: { m2: 1e-6 },
      initialConditions: {},
    },
    {
      id: "energy-conservation",
      label: "能量守恒检验",
      description: "关闭阻尼，长时间运行检验能量漂移",
      params: { damping: 0 },
      initialConditions: {},
      method: "VelocityVerlet",
    },
  ];
  ```

- **输入来源**：用户点击按钮
- **输出去向**：`applyPreset(preset)` → 步骤 6 → Worker
- **失败行为**：预设中参数校验失败 → 显示 Toast："预设 '{label}' 参数校验失败：{error.message}"

### 依赖与集成接口

| 依赖方 | 具体接口 | 用途 |
|--------|----------|------|
| SIM-01 Worker | `worker.postMessage({ type: "updateParams", params })` | 物理参数热更新 |
| SIM-01 Worker | `worker.postMessage({ type: "reset", initialConditions })` | 初始条件变更后重启仿真 |
| SIM-01 Worker | `worker.postMessage({ type: "setMethod", method })` | 积分方法切换 |
| Zustand | `create<SimulationParamsState>(...)` | 参数状态管理 |
| shadcn/ui | `<Slider>` `<Input>` `<Select>` `<Tooltip>` `<Button>` `<Label>` `<Tabs>` | UI 组件 |
| SYS-01 响应式布局 | `useAppStore().deviceType` | 桌面侧栏 / 平板抽屉 / 手机折叠 |

**对外暴露的公共接口（供其他模块消费）**：

| 消费方模块 | 调用方式 | 消费的数据 |
|-----------|---------|-----------|
| EXP-01 3D 仿真场景 | `useSimulationStore(s => s.isSceneFrozen)` | 冻结标志 → 暂停 3D 渲染更新 |
| EXP-01 3D 仿真场景 | `useSimulationStore(s => s.params)` | 摆球大小（质量→半径映射）、摆杆粗细（长度→视觉比例） |
| EXP-04 蝴蝶效应对比器 | `useSimulationStore(s => s.params)` + `s.initialConditions` | 分别设置 A/B 两摆的参数（双 Worker 模式） |
| EXP-05 时间反演实验 | `worker.postMessage({ type: "setDirection", direction })` | 正向/反向积分方向控制（通过本模块 bridge 层转发） |
| ANL-01 李雅普诺夫指数谱 | `useSimulationStore().injectParams(params, ic)` | 热力图格点点击 → 向本模块注入参数 |
| ANL-02 参数空间分岔图 | `useSimulationStore().injectParams(params)` | 分岔图游标拖动 → 注入扫描参数 |
| SYS-01 响应式布局 | `useSimulationStore(s => s.isPanelExpanded)` | 面板展开状态 → 决定移动端折叠菜单的布局 |

### 状态机

参数面板 UI 的交互状态机：

| 当前状态 | 触发事件 | 下一状态 | 前置条件 | 副作用 |
|----------|----------|----------|----------|--------|
| `idle` | 用户聚焦输入框 | `editing` | 无 | `activeField = fieldKey`，输入框显示精确值 |
| `editing` | 用户输入合法值 | `editing` | `validateParam` 通过（含 warning） | 输入框正常显示，实时更新 store（滑块跟随） |
| `editing` | 用户输入非法值 | `editing-invalid` | `validateParam` 返回 `level: "error"` | 输入框红框 + 震动动画，`isSceneFrozen = true`，store 不更新 |
| `editing-invalid` | 用户修正为合法值 | `editing` | `validateParam` 通过 | 红框消失，`isSceneFrozen = false`（若无其他 error），store 更新 |
| `editing` | 用户失焦 | `idle` | 当前值为合法值 | `activeField = null`，提交最终值到 store |
| `editing-invalid` | 用户失焦 | `idle` | 当前值非法 | `activeField = null`，**回滚**到上次有效值，`isSceneFrozen = false` |
| `idle` | 用户拖动滑块 | `sliding` | 无 | `activeField = fieldKey`，滑块跟随鼠标/触控 |
| `sliding` | 滑块值变更（拖动中） | `sliding` | 滑块值在 `[sliderMin, sliderMax]` 内（由 Slider 组件保证） | 实时更新 store（不发送 Worker 命令——防抖收集） |
| `sliding` | 用户释放滑块 | `idle` | 无 | `activeField = null`，提交最终值，bridge 层在 16ms 防抖后发送 Worker 命令 |
| `idle` | 用户点击预设按钮 | `idle` | `applyPreset` 全部字段校验通过 | 原子更新 store，发送 Worker 命令，Toast 提示 |
| `idle` | 外部模块调用 `injectParams` | `idle` | 注入字段校验通过 | store 静默更新，Worker 命令立即发送（无防抖） |

### 异常与边界条件

#### 异常 1：用户输入非法值

- **触发条件**：
  - 数值输入框输入非数字字符串（如 `"abc"`、`"--"`）
  - 输入值违反硬约束（如 m1 = -0.5、g = -1）
  - 输入值为 NaN、Infinity
- **处理策略**：
  1. `parseFloat` 返回 NaN → 标记为 error
  2. 输入框立即显示红色边框（`border-red-500`）
  3. 触发 CSS `animate-shake` 动画（水平震动 0.3s，幅度 4px）
  4. 悬浮 Tooltip 显示具体错误消息（如 "上摆质量不能小于 0 kg"）
  5. `isSceneFrozen = true` — 3D 场景冻结
  6. store 不更新 — 保持最后一次有效值
  7. 不发送任何 Worker 命令
- **重试参数**：不自动重试。用户修正输入后自动恢复（`editing-invalid → editing`）。

#### 异常 2：模拟 Worker 未就绪时发送命令

- **触发条件**：参数面板在 Worker `"ready"` 消息到达前就已渲染（用户可能在 Pyodide 加载期间操作）
- **处理策略**：
  1. bridge 层维护 `workerReady: boolean` 标志，初始为 `false`
  2. 收到 Worker `"ready"` 消息 → `workerReady = true`
  3. `workerReady === false` 时，bridge 层将待发送命令存入 `pendingCommands: WorkerCommand[]` 队列
  4. Worker ready 后，立即批量发送队列中的命令（去重：同一类型的多条命令仅保留最后一条）
  5. 控制面板 UI 在 Worker ready 前显示 `disabled` 态（滑块灰色不可交互）
  6. 控制面板顶部显示 "仿真引擎初始化中..." 提示
- **重试参数**：不重试。命令排队等待 Worker 就绪后自动发送。

#### 异常 3：滑块与数值输入不同步

- **触发条件**：用户在数值输入框中输入超出滑块范围但符合硬约束的值（如 `m1 = 50`，滑块 `max = 10`）
- **处理策略**：
  1. 数值输入框显示实际值 `50`
  2. 滑块 thumb 吸附到 `sliderMax`（`10`）位置，滑块轨道末端显示 `"+40"` 标签
  3. `fieldErrors[key] = { level: "warning", message: "上摆质量 建议范围 [0.1, 10.0] kg" }`
  4. 输入框显示黄色边框 + Tooltip
  5. `isSceneFrozen` 不设置（warning 不冻结场景）
  6. store 更新为实际值 `50`
  7. Worker 收到 `updateParams({ m1: 50 })`
- **重试参数**：不重试。用户自行决定是否调整回建议范围。

#### 异常 4：外部注入参数与当前用户编辑冲突

- **触发条件**：用户正在编辑 `theta1` 输入框（`activeField = "theta1"`）时，ANL-01 热力图点击触发 `injectParams({ theta1: 2.094 })`
- **处理策略**：
  1. `injectParams` 检测 `activeField` 是否为注入字段之一
  2. 若冲突 → `injectParams` 跳过该字段（不覆盖用户正在编辑的值）
  3. 注入的非冲突字段正常更新（如仅注入了 `theta1` 且冲突，但 `L1, L2` 等其他字段正常注入）
  4. `console.info("injectParams: skipped field theta1 (user is editing)")`
  5. 若用户完成编辑（失焦）→ 用户最终值覆盖注入值
- **重试参数**：不重试。注入方（ANL-01）可在用户失焦后重新触发注入。

#### 异常 5：预设参数超出当前硬约束范围（边界情形）

- **触发条件**：预设中的某个参数值超出了硬约束（如 m2 → 0 的 "单摆退化" 预设中，m2 被设为 `1e-6`，大于 0 所以合法；但若未来预设错误地将 m2 设为 0，则触发此异常）
- **处理策略**：
  1. `applyPreset` 中对每个预设字段调用 `validateParam`
  2. 任一字段 `level === "error"` → 全部回滚，不更新 store
  3. 前端显示 Toast：`"预设 '单摆退化' 参数校验失败：下摆质量 不能小于 0.000001 kg"`
  4. 记录 `console.error("preset validation failed", preset.id, errors)`
- **重试参数**：不重试。此为开发期配置错误，需修正预设定义。

#### 异常 6：连续快速拖动滑块导致 Worker 消息风暴

- **触发条件**：用户在 500ms 内拖动滑块跨越 50 个离散位置（每个位置触发一次 `setParam` → bridge 层 `updateParams`）
- **处理策略**：
  1. bridge 层 16ms 防抖（步骤 9）：窗口内的变更合并为一次 `updateParams`（含累积 diff）
  2. 防抖在 `requestAnimationFrame` 中执行，与渲染帧对齐
  3. 滑块 `onValueChange` 中实时更新 store（保证 UI 即时响应）
  4. 仅在 `onValueCommit`（释放滑块）或防抖窗口到期时发送 Worker 命令
  5. 实际发送频率：≤ 60 次/秒（受 rAF 限制），而非 100+ 次/秒
- **重试参数**：防抖窗口 16ms，自动合并。

### 原则兑现清单

| 原则来源 | 原则名称 | 代码级约束 |
|----------|----------|------------|
| 功能设计_v0 §九 | 非法输入拒绝 | `validateParam` 硬约束检查 → `level: "error"` → 红框震动 + 场景冻结 + 不更新 store；必须列出具体的硬约束阈值 |
| 功能设计_v0 §四 4.1 | 参数双向联动 | `injectParams` 支持外部注入参数（热力图点击→填充控制面板）；`setParam` 修改参数后 store 更新→热力图游标联动（由 ANL-01 通过订阅实现） |
| 功能设计_v0 §三 3.4 | 蝴蝶效应参数同步 | `injectParams` 支持"仅调节 A""仅调节 B"或"同步调节"三种模式，通过 EXP-04 调用时传入 target: "A" \| "B" \| "both" |
| 技术栈设计 §3.2 | UI → Store → Worker 单向数据流 | 禁止组件直接调用 `worker.postMessage`，必须通过 store action → bridge 订阅管道 |
| 通用原则 | 用户输入保护 | 失焦时若值非法 → 自动回滚到上次有效值；硬约束违规 → 场景冻结保护仿真物理一致性 |
| 通用原则 | 即时反馈 | 滑块拖动时实时更新 store（UI 即时响应）；数值输入 ValidationResult < 16ms（同步校验，无 I/O） |

### 验收测试场景

#### 正向测试 1：滑块调节质量参数并生效

- **Given**：
  - 仿真已初始化，Worker 返回 `"ready"`
  - 默认参数 `m1 = 1.0`、`m2 = 1.0`
  - 3D 场景正常渲染（`isSceneFrozen = false`）
- **When**：用户拖动 `m1` 滑块从 1.0 到 2.5
- **Then**：
  - 滑块拖动过程中，store 中 `params.m1` 实时更新（每步 0.1）
  - 滑块释放后 16ms 内，Worker 收到 `{ type: "updateParams", params: { m1: 2.5 } }`
  - 3D 场景中上摆球视觉大小增大（质量→半径映射生效）
  - `isSceneFrozen` 保持 `false`
  - `fieldErrors["m1"]` 为 `undefined`（无错误）

#### 正向测试 2：预设按钮一键设置小角度

- **Given**：仿真正常运行中，当前参数为默认值
- **When**：用户点击 "小角度线性化" 预设按钮
- **Then**：
  - `initialConditions` 更新为 `{ theta1: 0.052, theta1Dot: 0, theta2: 0.034, theta2Dot: 0 }`
  - Worker 收到 `{ type: "reset", initialConditions: { theta1: 0.052, ... } }`
  - `method` 变为 `"RK4"`
  - Worker 收到 `{ type: "setMethod", method: "RK4" }`
  - 3D 场景中小幅度摆动（两个摆角均 < 3°）
  - Toast 显示："已应用预设：小角度线性化"

#### 正向测试 3：外部注入参数联动

- **Given**：仿真正常运行中，ANL-01 热力图渲染完成
- **When**：用户点击热力图格点 (L2/L1=1.5, θ1=2.0)，ANL-01 调用 `useSimulationStore().injectParams({ L1: 1.0, L2: 1.5 }, { theta1: 2.0 })`
- **Then**：
  - Store 中 `params.L1 = 1.0`、`params.L2 = 1.5`、`initialConditions.theta1 = 2.0`
  - Worker 收到 `updateParams({ L1: 1.0, L2: 1.5 })` 和 `reset({ theta1: 2.0, ... })`
  - 3D 场景立刻切换到新参数下的仿真
  - 用户正在编辑的字段不受覆盖（若 `activeField` 是注入字段之一，该字段跳过）

#### 异常测试 1：输入负质量冻结场景

- **Given**：仿真正常运行中
- **When**：用户在 `m1` 数值输入框中依次输入：删除 1.0 → 输入 `-0.5`
- **Then**：
  - `m1` 输入框红色边框 + CSS `animate-shake` 震动动画
  - Tooltip 显示："上摆质量 不能小于 0.000001 kg"
  - `isSceneFrozen = true`
  - 3D 场景冻结（摆球停止更新位置）
  - Store 中 `params.m1` 保持为最后一次有效值（1.0）
  - Worker 未收到任何 `updateParams` 命令
  - 用户失焦后自动回滚为 1.0，`isSceneFrozen` 恢复 `false`

#### 异常测试 2：输入 NaN 回滚

- **Given**：仿真正常运行中
- **When**：用户在 `L1` 输入框中输入字符串 `"abc"` 然后失焦
- **Then**：
  - 输入过程中输入框红色边框
  - 失焦时 `parseFloat("abc")` 返回 `NaN` → 校验失败
  - 输入框值回滚为 `L1` 的最后有效值 `1.000`
  - Store 未更新
  - `activeField` 恢复为 `null`

#### 异常测试 3：Worker 未就绪时参数面板不可操作

- **Given**：应用刚启动，Worker 尚未返回 `"ready"`
- **When**：用户尝试点击 `m1` 滑块
- **Then**：
  - 滑块显示 `disabled` 态（灰色，`opacity-50`，`pointer-events-none`）
  - 数值输入框同样 disabled
  - 控制面板顶部显示骨架屏 + 文字 "仿真引擎初始化中..."
  - Worker ready 后，所有控件恢复可交互
  - 默认参数自动发送 `WorkerInitCommand`

#### 异常测试 4：外部注入与用户编辑冲突

- **Given**：用户正在编辑 `theta1` 数值输入框（`activeField = "theta1"`），当前有效值为 1.5708
- **When**：ANL-01 调用 `injectParams({}, { theta1: 2.094, theta2: 1.0 })`
- **Then**：
  - `theta2` 更新为 1.0，Worker 收到 `reset`
  - `theta1` 保持 1.5708（用户正在编辑，注入跳过）
  - `console.info` 输出跳过提示
  - 输入框继续正常显示用户正在输入的值

### 注意事项与禁止行为

1. **【防抖位置】** 参数变更的防抖必须在 bridge 层实现，不能在 UI 组件层实现。UI 层必须即时反馈（滑块跟随、输入框实时显示），否则用户感到卡顿。bridge 层负责合并发送。
2. **【角度显示转换】** 内部存储使用弧度（rad），但控制面板上对用户显示的角度值应以度（°）为单位（SIM-02 内部维护 rad 值，`ParamFieldMeta` 的 `unit` 字段为 `"rad"`，但在滑块旁显示度数转换值作为辅助标签）。显示转换公式：`deg = rad * 180 / π`，精度保留 1 位小数。
3. **【initialConditions 变更必须 reset】** 修改初始条件后不能发送 `updateParams`，必须发送 `reset`（含完整 4 个字段）。因为初始条件变更意味着重新开始仿真，而非在当前状态上调整参数继续跑。
4. **【m2 → 0 单摆退化的实现】** 预设 "单摆退化" 将 `m2` 设为 `1e-6` 而非精确 `0`，因为 `odeRhs` 的分母 `denom` 在 `m2 = 0` 且 `delta = 0` 时会变为 `0/0` 不定式。`1e-6` 足以近似单摆行为而不会触发数值奇异。
5. **【禁止行为】** 禁止在 Slider 的 `onValueChange` 回调中直接调用 `worker.postMessage`。必须通过 `setParam` action → Zustand store → bridge 订阅管道。
6. **【禁止行为】** 禁止在 `requestAnimationFrame` 之外的时间点发送 Worker 命令（防抖时间窗口应在 rAF 内调度）。
7. **【禁止行为】** `isSceneFrozen` 的解除不能仅依赖 `setActiveField(null)`（失焦），必须同时检查所有字段 `fieldErrors` 中无 `level: "error"` 条目。存在"用户标记了一个错误字段后离开"的场景。
8. **【易错点】** `injectParams` 发送 `reset` 时，`initialConditions` 必须包含完整 4 个字段（即使是部分注入也需要与其他字段合并为完整对象），因为 Worker `reset` 命令要求完整初始条件。
9. **【易错点】** 输入框 `type="number"` 在浏览器中允许输入 `e`（科学计数法）和 `-`（负数）。`parseFloat("1e")` 返回 `NaN`，需要在 `onChange` 中特殊处理（检测 `e.target.value` 中是否包含不完整的科学计数法表达式）。
10. **【偷懒红线】** 参数校验的硬约束阈值必须在代码中以命名常量定义（`HARD_MIN_MASS = 1e-6` 等），禁止在 `validateParam` 中硬编码魔法数字。
