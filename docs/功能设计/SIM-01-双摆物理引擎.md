# 功能点：SIM-01 双摆物理引擎

> **文档生成时间**：2026-04-28 15:30:00 CST
> **版本记录**：
> | 版本 | 时间 | 修改人 | 变更摘要 |
> |------|------|--------|----------|
> | v1.0 | 2026-04-28 15:30:00 | AI Assistant | 初始版本 |

> **冲突核查指引**：若发现与已有规格文档冲突，优先以时间戳更新的版本为准，并在版本记录中追加冲突解决条目。

### 所属模块与溯源

- **对应总设计章节**：§三~§五（各模式共享的积分基础设施）；§十 P0（核心骨架）
- **依赖的其他功能模块**：无（本模块为整个系统的最底层依赖，不依赖任何其他功能模块）
- **被依赖模块**：SIM-04 能量实时监控、SIM-05 相空间可视化、EXP-01 3D 仿真场景、EXP-02 运动尾迹渲染、EXP-04 蝴蝶效应对比器、EXP-05 时间反演实验、ANL-03 庞加莱截面、LAB-01 受力拆解视图、LAB-02 物理验证套件、LAB-03 用户可编程沙箱、DAT-03 历史回放与分叉

### 已有设计兼容性分析

- **已审查的相关规格文档**：经扫描 `docs/功能设计/` 目录，未发现与本模块直接相关的已有规格文档。本模块是系统最底层模块，所有其他模块均依赖本模块，不存在已有规格覆盖本模块功能的情况。
- **兼容性结论**：无冲突。本模块定义的输出接口 `FrameState` 将作为下游所有模块的共享数据契约，需在后续相关模块规格中统一引用。
- **复用的已有定义**：无。

### 技术栈绑定

- **必须使用**：
  - Python 3.11+（运行于 Pyodide WebAssembly 环境）
  - NumPy（Pyodide 内置白名单包，用于数组运算与向量化积分）
  - `scipy.integrate.solve_ivp`（Pyodide 环境下的 ODE 积分参考实现，不做运行时依赖——因 scipy 在 Pyodide 中加载较慢，实际实现需自写 RK4 / Velocity Verlet 积分器，但算法需对齐 scipy 的输出精度）
  - TypeScript 5.x（前端侧类型定义与 Pyodide FFI 封装）
  - Pyodide >= 0.25.0（Python-to-JS 互操作桥接）
- **禁止使用**：
  - 禁止在前端 JavaScript 侧直接实现 ODE 求解逻辑（必须统一走 Pyodide 内的 Python 物理引擎，避免双份实现导致物理行为不一致）
  - 禁止使用 Python `eval()` 或 `exec()` 执行用户自定义方程代码（用户代码必须经白名单 AST 校验后以受控方式编译执行）
  - 禁止直接调用 `scipy.integrate.solve_ivp` 作为运行时求解器（Pyodide 加载 scipy 的初始化延迟 > 3s，不可接受；仅用于离线验证基准结果）

### 输入定义（精确类型）

#### 前端侧输入（TypeScript，来自 SIM-02 参数控制面板）

```typescript
/**
 * 双摆物理参数。
 * 所有长度单位为米(m)，质量单位为千克(kg)，角度单位为弧度(rad)。
 */
interface PendulumParams {
  /** 上摆球质量 (kg)。约束：> 0，范围建议 (0.01, 100.0]。示例：1.0 */
  m1: number;
  /** 下摆球质量 (kg)。约束：> 0，范围建议 (0.01, 100.0]。示例：1.0 */
  m2: number;
  /** 上摆杆长 (m)。约束：> 0，范围建议 (0.05, 5.0]。示例：1.0 */
  L1: number;
  /** 下摆杆长 (m)。约束：> 0，范围建议 (0.05, 5.0]。示例：1.0 */
  L2: number;
  /** 重力加速度 (m/s²)。约束：>= 0，默认 9.81。示例：9.81 */
  g: number;
  /** 阻尼系数 (1/s)。约束：>= 0，0 表示无阻尼。默认 0。示例：0.1 */
  damping: number;
}

/**
 * 初始条件。所有角度单位为弧度(rad)，角速度单位为弧度/秒(rad/s)。
 */
interface InitialConditions {
  /** 上摆初始角度 (rad)。范围 (-π, π]。示例：Math.PI / 2 */
  theta1: number;
  /** 上摆初始角速度 (rad/s)。示例：0.0 */
  theta1Dot: number;
  /** 下摆初始角度 (rad)。范围 (-π, π]。示例：Math.PI / 2 */
  theta2: number;
  /** 下摆初始角速度 (rad/s)。示例：0.0 */
  theta2Dot: number;
}

/**
 * 积分器配置。
 */
interface IntegratorConfig {
  /** 积分时间步长 (s)。约束：> 0 且 <= 0.01。默认 0.0005。
   *  典型值：RK4 推荐 0.0005；Verlet 推荐 0.0002。 */
  dt: number;
  /** 积分方法。默认 "RK4"。 */
  method: "RK4" | "VelocityVerlet" | "Euler";
  /** 每输出帧的子步数。一个输出帧 = dt * substeps 的仿真时间。
   *  约束：>= 1，默认 10（即每帧仿真 0.005s @dt=0.0005）。
   *  调整此值可平衡精度与性能。 */
  substeps: number;
  /** 最大历史帧缓冲长度。约束：>= 0。
   *  默认 3000（约 50 秒 @60FPS/substeps=10/dt=0.0005）。
   *  设为 0 表示不限制（无限尾迹模式）。 */
  maxHistoryLength: number;
}

/**
 * 物理引擎初始化配置，组合以上三部分。
 */
interface PhysicsEngineConfig {
  params: PendulumParams;
  initialConditions: InitialConditions;
  integrator: IntegratorConfig;
}
```

#### Python 侧输入（Pyodide 内部，对应上述类型）

```python
from dataclasses import dataclass, field
from enum import Enum
from typing import Literal

class IntegratorMethod(Enum):
    RK4 = "RK4"
    VELOCITY_VERLET = "VelocityVerlet"
    EULER = "Euler"

@dataclass
class PendulumParams:
    """双摆物理参数。所有数值必须为正（除阻尼可为0）。"""
    m1: float          # 上摆质量 (kg)，> 0，示例：1.0
    m2: float          # 下摆质量 (kg)，> 0，示例：1.0
    L1: float          # 上摆杆长 (m)，> 0，示例：1.0
    L2: float          # 下摆杆长 (m)，> 0，示例：1.0
    g: float = 9.81    # 重力加速度 (m/s²)，>= 0，示例：9.81
    damping: float = 0.0  # 阻尼系数 (1/s)，>= 0，示例：0.1

@dataclass
class InitialConditions:
    """初始条件。角度单位为弧度。"""
    theta1: float      # 上摆初始角度 (rad)，示例：1.5708
    theta1_dot: float  # 上摆初始角速度 (rad/s)，示例：0.0
    theta2: float      # 下摆初始角度 (rad)，示例：1.5708
    theta2_dot: float  # 下摆初始角速度 (rad/s)，示例：0.0

@dataclass
class IntegratorConfig:
    """积分器配置。"""
    dt: float = 0.0005           # 积分步长 (s)，> 0 且 <= 0.01
    method: IntegratorMethod = IntegratorMethod.RK4
    substeps: int = 10           # 每帧子步数，>= 1
    max_history_length: int = 3000  # 最大历史帧数，>= 0（0=无限）
```

### 输出定义（精确类型）

#### 前端侧输出（TypeScript，每帧返回）

```typescript
/**
 * 单个仿真帧的完整状态快照。
 * 所有角度单位为弧度(rad)，所有坐标以 pivot 点为原点 (0,0)，
 * y 轴向上为正（对应屏幕 y 轴向下，由渲染层翻转）。
 */
interface FrameState {
  /** 仿真时间 (s)。从 0 开始单调递增（时间反演时递减）。示例：0.0 */
  t: number;
  /** 上摆角度 (rad)。示例：1.5708 */
  theta1: number;
  /** 上摆角速度 (rad/s)。示例：0.5 */
  theta1Dot: number;
  /** 下摆角度 (rad)。示例：1.5708 */
  theta2: number;
  /** 下摆角速度 (rad/s)。示例：-0.3 */
  theta2Dot: number;
  /** 上摆球 x 坐标 (m)。x1 = L1 * sin(theta1)。示例：1.0 */
  x1: number;
  /** 上摆球 y 坐标 (m)。y1 = -L1 * cos(theta1)（向下为负）。示例：0.0 */
  y1: number;
  /** 下摆球 x 坐标 (m)。x2 = x1 + L2 * sin(theta2)。示例：1.5 */
  x2: number;
  /** 下摆球 y 坐标 (m)。y2 = y1 - L2 * cos(theta2)（向下为负）。示例：-1.0 */
  y2: number;
  /** 系统动能 (J)。K = ½*m1*(ẋ₁²+ẏ₁²) + ½*m2*(ẋ₂²+ẏ₂²)。示例：4.905 */
  kineticEnergy: number;
  /** 系统势能 (J)。V = m1*g*y1 + m2*g*y2（以 y=0 为参考面）。示例：-9.81 */
  potentialEnergy: number;
  /** 系统总能量 (J)。E = K + V。示例：-4.905 */
  totalEnergy: number;
  /** 本次 step() 调用消耗的 wall-clock 时间 (ms)。用于性能诊断。示例：0.15 */
  computeTimeMs: number;
}

/**
 * 物理引擎状态机所处的阶段。
 */
type EnginePhase = "idle" | "running" | "paused" | "reversing" | "error";

/**
 * 物理引擎对外暴露的状态摘要（不含历史缓冲区的完整数据）。
 */
interface EngineStatus {
  /** 当前引擎阶段。 */
  phase: EnginePhase;
  /** 最新帧状态。phase 为 "idle" 或 "error" 时为 null。 */
  currentFrame: FrameState | null;
  /** 当前已仿真总步数（积分步，非输出帧）。 */
  totalSteps: number;
  /** 当前仿真时间 (s)。 */
  simulationTime: number;
  /** 历史缓冲区当前帧数。 */
  historyLength: number;
  /** 仿真方向。1 = 正向，-1 = 反向。 */
  direction: 1 | -1;
  /** 最近一次错误信息。phase 非 "error" 时为 null。 */
  lastError: string | null;
}
```

#### Python 侧输出（Pyodide 内部，JSON 序列化后传给前端）

```python
@dataclass
class FrameState:
    """单个仿真帧的完整状态。字段含义与前端 FrameState 完全一致。"""
    t: float           # 仿真时间 (s)
    theta1: float      # 上摆角度 (rad)
    theta1_dot: float  # 上摆角速度 (rad/s)
    theta2: float      # 下摆角度 (rad)
    theta2_dot: float  # 下摆角速度 (rad/s)
    x1: float          # 上摆球 x (m)
    y1: float          # 上摆球 y (m)
    x2: float          # 下摆球 x (m)
    y2: float          # 下摆球 y (m)
    kinetic_energy: float    # 动能 (J)
    potential_energy: float  # 势能 (J)
    total_energy: float      # 总能量 (J)
    compute_time_ms: float   # 计算耗时 (ms)
```

### 核心逻辑步骤

以下按执行顺序列出物理引擎一次完整的从初始化到持续运行的逻辑步骤：

#### 阶段 A：引擎初始化

**步骤 1：参数校验**
- **操作对象**：`PhysicsEngineConfig` 实例（由 JS 侧传入，经 Pyodide FFI 转换为 Python `dict`）
- **具体操作**：
  1. 将 JS 传入的 `config` 字典反序列化为 Python 数据类：`params = PendulumParams(**config["params"])`、`ic = InitialConditions(**config["initialConditions"])`、`int_cfg = IntegratorConfig(**config["integrator"])`
  2. 逐字段校验：
     - `m1, m2, L1, L2`：必须 `> 0`，任一 <= 0 则抛出 `ValueError(f"参数 {name} 必须为正数，收到: {value}")`
     - `g`：必须 `>= 0`，< 0 则抛出 `ValueError`
     - `damping`：必须 `>= 0`，< 0 则抛出 `ValueError`
     - `dt`：必须 `> 0` 且 `<= 0.01`，否则抛出 `ValueError(f"步长必须在 (0, 0.01] 范围内，收到: {dt}")`
     - `substeps`：必须 `>= 1` 且 `<= 1000`，否则抛出 `ValueError`
     - `max_history_length`：必须 `>= 0`，< 0 则抛出 `ValueError`
  3. 角度归一化：将 `theta1`、`theta2` 归一化到 `(-π, π]`
- **输入来源**：前端 SIM-02 参数控制面板通过 `pyodide.globals.set("engine_config", config_json)` 传入
- **输出去向**：校验通过的数据类实例进入步骤 2
- **失败行为**：`ValueError` 被 Pyodide 捕获并转为 JS `Error`，前端显示红框震动拒绝（SIM-02 负责 UI 呈现）

**步骤 2：分配状态缓冲区**
- **操作对象**：Python `collections.deque`（双端队列）
- **具体操作**：
  1. 创建 `history: deque[FrameState] = deque(maxlen=max_history_length if max_history_length > 0 else None)`
  2. 初始化内部状态变量：`_t = 0.0`、`_direction = 1`、`_phase = "idle"`、`_total_steps = 0`
  3. 存储积分器类型：`_integrator = self._select_integrator(method)`，返回函数引用 `(state, params, dt) -> new_state`
- **输入来源**：步骤 1 校验通过的 `IntegratorConfig.method`
- **输出去向**：就绪的引擎实例，等待步骤 3 的首次 `step()` 调用
- **失败行为**：内存不足（`deque` 创建失败）→ 降低 `max_history_length` 至当前值的 1/10 重试，仍失败则抛出 `MemoryError`

**步骤 3：计算初始帧**
- **操作对象**：初始条件 `InitialConditions` 实例
- **具体操作**：
  1. 以 `ic` 为初值计算首帧：调用 `_compute_frame(t=0.0, theta1, theta1_dot, theta2, theta2_dot, params)`
  2. `_compute_frame` 内部执行：
     - 笛卡尔坐标转换：`x1 = L1 * sin(theta1)`，`y1 = -L1 * cos(theta1)`，`x2 = x1 + L2 * sin(theta2)`，`y2 = y1 - L2 * cos(theta2)`
     - 角速度→线速度：`v1x = L1 * theta1_dot * cos(theta1)`，`v1y = L1 * theta1_dot * sin(theta1)`，`v2x = v1x + L2 * theta2_dot * cos(theta2)`，`v2y = v1y + L2 * theta2_dot * sin(theta2)`
     - 动能：`K = 0.5 * m1 * (v1x² + v1y²) + 0.5 * m2 * (v2x² + v2y²)`
     - 势能：`V = m1 * g * y1 + m2 * g * y2`
     - 总能量：`E = K + V`
  3. 将首帧 `FrameState` 追加到 `history`
  4. 记 `_phase = "idle"`
- **输入来源**：步骤 1 的 `ic` 和 `params`
- **输出去向**：首帧进入 `history`，等待下游通过 `getState()` 读取
- **失败行为**：坐标转换中浮点溢出 → 捕获 `OverflowError`，重置角度到 `(-π, π]` 范围重试

#### 阶段 B：仿真步进（每次 `step()` 调用）

**步骤 4：单帧积分推进**
- **操作对象**：当前状态 `(theta1, theta1_dot, theta2, theta2_dot)` 和引擎内部状态
- **具体操作**：
  1. 检查 `_phase`：若为 `"error"` 则直接返回 `None` 并附带 `lastError`
  2. 提取当前状态：`state = np.array([theta1, theta1_dot, theta2, theta2_dot])`
  3. 获取方向因子：`sign = _direction`（1=正向，-1=反向）
  4. 执行 `substeps` 次积分子步：
     ```python
     for _ in range(substeps):
         state = _integrator(state, params, sign * dt)
         _total_steps += 1
     ```
  5. 每次子步后检查 NaN：
     - 任一状态分量为 NaN → `_phase = "error"`，`_last_error = "数值发散：积分步长过大或参数导致奇异解"` → 返回 `None`
  6. `_t += sign * dt * substeps`
  7. 调用 `_compute_frame(t=_t, *state, params)` 生成 `FrameState`
  8. `FrameState` 追加到 `history`
  9. 返回 `FrameState`
- **输入来源**：上一步的 `state` 向量 + `_direction` + `params` + `dt` + `substeps`
- **输出去向**：新 `FrameState` 返回给调用方，同时存入 `history`
- **失败行为**：
  - 单步积分超时（wall-clock > 50ms）→ 自动将 `substeps` 减半，记录警告日志
  - NaN 检测 → 立即进入 `error` 状态，保留当前 `history` 供调试

**步骤 5：积分方法选择**
- **操作对象**：`_integrator` 函数引用
- **具体操作**：根据 `config.integrator.method` 选择对应实现：

  **RK4（默认）**——4 阶 Runge-Kutta：
  ```python
  def _rk4_step(state: np.ndarray, params: PendulumParams, dt: float) -> np.ndarray:
      k1 = _ode_rhs(state, params)
      k2 = _ode_rhs(state + 0.5 * dt * k1, params)
      k3 = _ode_rhs(state + 0.5 * dt * k2, params)
      k4 = _ode_rhs(state + dt * k3, params)
      return state + (dt / 6.0) * (k1 + 2*k2 + 2*k3 + k4)
  ```

  **Velocity Verlet**——辛积分器（适合长时间能量守恒）：
  ```python
  def _verlet_step(state: np.ndarray, params: PendulumParams, dt: float) -> np.ndarray:
      theta1, omega1, theta2, omega2 = state
      # 半步加速
      alpha = _angular_acceleration(state, params)
      omega1_half = omega1 + 0.5 * dt * alpha[1]
      omega2_half = omega2 + 0.5 * dt * alpha[3]
      # 全步位置更新
      theta1_new = theta1 + dt * omega1_half
      theta2_new = theta2 + dt * omega2_half
      # 重新计算加速度
      state_new_half = np.array([theta1_new, omega1_half, theta2_new, omega2_half])
      alpha_new = _angular_acceleration(state_new_half, params)
      omega1_new = omega1_half + 0.5 * dt * alpha_new[1]
      omega2_new = omega2_half + 0.5 * dt * alpha_new[3]
      return np.array([theta1_new, omega1_new, theta2_new, omega2_new])
  ```

  **Euler**——1 阶显式（教育用途，展示数值误差）：
  ```python
  def _euler_step(state: np.ndarray, params: PendulumParams, dt: float) -> np.ndarray:
      return state + dt * _ode_rhs(state, params)
  ```

- **输入来源**：配置中的 `method` 字段
- **输出去向**：绑定的 `_integrator` 函数引用，供步骤 4 循环调用
- **失败行为**：`method` 值不在枚举内 → 回退为 `RK4`，记录警告

**步骤 6：ODE 右端函数（核心物理）**
- **操作对象**：状态向量 `[theta1, omega1, theta2, omega2]`
- **具体操作**：计算双摆耦合运动方程（含阻尼）：

  ```python
  def _ode_rhs(state: np.ndarray, params: PendulumParams) -> np.ndarray:
      t1, w1, t2, w2 = state
      m1, m2, L1, L2, g, b = (params.m1, params.m2, params.L1,
                               params.L2, params.g, params.damping)

      delta = t2 - t1  # 两摆夹角
      sin_d = np.sin(delta)
      cos_d = np.cos(delta)

      denom = 2 * m1 + m2 - m2 * np.cos(2 * delta)
      # 防止分母过小导致数值爆炸
      if abs(denom) < 1e-12:
          denom = np.sign(denom) * 1e-12

      # 角加速度（无阻尼部分，基于拉格朗日方程推导）
      alpha1 = (m2 * L1 * w1**2 * sin_d * cos_d
                + m2 * g * np.sin(t2) * cos_d
                + m2 * L2 * w2**2 * sin_d
                - (m1 + m2) * g * np.sin(t1)) / (L1 * denom)

      alpha2 = (-m2 * L2 * w2**2 * sin_d * cos_d
                + (m1 + m2) * (g * np.sin(t1) * cos_d
                - L1 * w1**2 * sin_d
                - g * np.sin(t2))) / (L2 * denom)

      # 阻尼项（线性阻尼：τ_damp = -b * ω）
      alpha1 -= b * w1
      alpha2 -= b * w2

      return np.array([w1, alpha1, w2, alpha2])
  ```

- **输入来源**：积分器在每次子步中传入当前 `state` 和 `params`
- **输出去向**：返回 `[ω₁, α₁, ω₂, α₂]` 供积分器推进状态
- **失败行为**：浮点溢出 → `alpha1` 或 `alpha2` 为 `inf` → 积分器步骤 4 的 NaN 检查捕获

#### 阶段 C：控制接口

**步骤 7：参数热更新**
- **操作对象**：`PendulumParams` 或 `IntegratorConfig` 的部分字段
- **具体操作**：
  1. JS 侧调用 `engine.setParams(partialParams)` → Pyodide 调用 `engine.set_params(**kwargs)`
  2. 仅更新传入的字段，未传入字段保持不变
  3. 更新后立即校验（复用步骤 1 的字段校验逻辑）
  4. 校验通过则更新内部 `_params` 或 `_integrator_config`
  5. `_phase` 为非 `"error"` 时才允许更新；若 `"error"`，需先调用 `reset()` 清除错误
- **输入来源**：前端参数面板用户操作 → `engine.setParams({damping: 0.2})`
- **输出去向**：更新后的内部状态，影响下一次 `step()` 调用
- **失败行为**：校验失败 → 保持原值不变，返回具体错误信息给前端，前端输入框红框震动

**步骤 8：重置与重初始化**
- **操作对象**：引擎全部内部状态
- **具体操作**：
  1. JS 侧调用 `engine.reset(newInitialConditions?)` → Pyodide 调用 `engine.reset(ic=None)`
  2. 清空 `history.clear()`
  3. `_t = 0.0`、`_direction = 1`、`_phase = "idle"`、`_total_steps = 0`、`_last_error = None`
  4. 若传入新初始条件，更新 `_ic`；否则保留原 `_ic`
  5. 重新执行步骤 3（计算首帧）
- **输入来源**：前端"重置"按钮或时间反演模式切换
- **输出去向**：全新引擎状态，首帧就绪
- **失败行为**：新初始条件校验失败 → 保持当前状态不重置，返回错误

**步骤 9：时间反演切换**
- **操作对象**：`_direction` 标志
- **具体操作**：
  1. JS 侧调用 `engine.setDirection(1 | -1)` → Pyodide 调用 `engine.set_direction(d)`
  2. 若 `d == -1` 且 `_phase == "running"`：`_direction = -1`，`_phase = "reversing"`
  3. 若 `d == 1`：`_direction = 1`，`_phase = "running"`
  4. 方向切换不清除 `history`（保留正向轨迹用于虚线对比）
- **输入来源**：EXP-05 时间反演实验的"时间倒流"按钮
- **输出去向**：影响步骤 4 的 `sign` 因子
- **失败行为**：无。方向切换始终安全。

**步骤 10：自定义方程注入（供 LAB-03 用户可编程沙箱）**
- **操作对象**：`_ode_rhs` 函数引用
- **具体操作**：
  1. JS 侧调用 `engine.setCustomEquations(pythonCode)` → Pyodide 执行
  2. 白名单 AST 校验：遍历用户代码的 AST，仅允许以下节点类型：
     - `FunctionDef`（且函数名必须为 `custom_ode_rhs`）
     - `arguments`、`arg`、`Return`
     - `Name`、`Load`、`Store`
     - `BinOp`、`UnaryOp`、`Compare`、`BoolOp`
     - `Num`、`Constant`
     - `If`、`IfExp`（禁止循环，防止无限循环）
     - `Attribute`（禁止 `__` 开头，禁止 import）
     - 允许的 Name 白名单：`np`、`numpy`、`sin`、`cos`、`tan`、`sqrt`、`exp`、`log`、`pi`、`abs`、`array`、`zeros`、`ones`、`state`、`params`
  3. AST 校验通过后，`compile()` 编译为 code object
  4. 在受限命名空间中执行：`exec(code, {"np": numpy, "__builtins__": _SAFE_BUILTINS})`
  5. 提取 `custom_ode_rhs` 函数，替换 `_ode_rhs`
  6. 函数签名必须为 `custom_ode_rhs(state: np.ndarray, params: PendulumParams) -> np.ndarray`，返回 `[omega1, alpha1, omega2, alpha2]`
- **输入来源**：LAB-03 代码编辑器中的用户 Python 代码字符串
- **输出去向**：替换后的 `_ode_rhs`，从下一次 `step()` 开始生效
- **失败行为**：
  - AST 校验失败 → 返回具体违规节点信息（如 `Line 3: for 循环不被允许`），不执行代码
  - 编译失败 → 返回行号 + 中文错误翻译（如 `Line 5: SyntaxError → 语法错误，请检查括号匹配`）
  - 执行超时（> 5s）→ 终止执行，恢复原 `_ode_rhs`，返回超时错误
  - 函数签名不匹配 → 返回类型错误描述，不替换

### 依赖与集成接口

本模块是系统最底层模块，不依赖任何其他功能模块。仅依赖外部运行时环境和被其他模块依赖。

| 依赖方 | 具体接口 | 用途 |
|--------|----------|------|
| Pyodide Runtime | `pyodide.runPythonAsync(code)` | 加载物理引擎 Python 模块到 WASM 环境 |
| Pyodide FFI | `pyodide.globals.get("engine")` | JS 侧获取 Python 引擎实例的代理对象 |
| Pyodide FFI | `engine.step()` → JSON | JS 调用 Python 方法，返回值经 `to_js()` 转换 |
| NumPy (Pyodide 内置) | `numpy.array`、`numpy.sin`、`numpy.cos` | ODE 右端函数中的数值计算 |

**被依赖接口（供下游模块消费）**：

| 消费方模块 | 调用的本模块接口 | 消费的数据 |
|-----------|-----------------|-----------|
| EXP-01 3D 仿真场景 | `engine.step()`、`engine.getState()` | `FrameState` 中的 `(x1,y1)`, `(x2,y2)` 用于摆球位置渲染；`theta1`, `theta2` 用于摆杆旋转 |
| EXP-02 运动尾迹渲染 | `engine.getHistory()` | 历史 `FrameState[]` 的 `(x2,y2)` 序列用于尾迹绘制；`FrameState` 中的 `theta2_dot` 用于速度-颜色映射 |
| EXP-03 声音化引擎 | `engine.getState()` | `theta2_dot` 映射音高；`theta2 - theta1` 映射和声；`kineticEnergy` 映射音色 |
| EXP-04 蝴蝶效应对比器 | `engineA.step()`、`engineB.step()` | 两个独立引擎实例的 `FrameState` 用于分屏对比 |
| EXP-05 时间反演实验 | `engine.setDirection(-1)`、`engine.step()` | 反向积分结果用于轨迹对比 |
| SIM-04 能量实时监控 | `engine.getState()` | `kineticEnergy`、`potentialEnergy`、`totalEnergy` 用于能量追踪与漂移检测 |
| SIM-05 相空间可视化 | `engine.getState()`、`engine.getHistory()` | `(theta1, theta1Dot)` 或 `(theta2, theta2Dot)` 用于相平面绘制 |
| ANL-03 庞加莱截面 | `engine.step()` 流式 | 在 Web Worker 中消费每帧状态，检测截面穿越事件 |
| LAB-01 受力拆解视图 | `engine.getState()` | 当前状态用于反算力矢量分量 |
| LAB-02 物理验证套件 | `engine.step()` + `engine.reset()` | 批量运行验证场景，校验输出 |
| LAB-03 用户可编程沙箱 | `engine.setCustomEquations(code)` | 注入用户自定义 ODE |
| DAT-03 历史回放与分叉 | `engine.getHistory()`、`engine.reset(ic)` | 读取历史快照，从指定时刻重新初始化 |

**Pyodide 加载流程（JS 侧代码骨架）**：

```typescript
// 1. 加载 Pyodide 运行时
const pyodide = await loadPyodide({
  indexURL: "https://cdn.jsdelivr.net/pyodide/v0.25.0/full/",
});

// 2. 加载物理引擎 Python 模块
const engineCode = await fetch("/py/physics_engine.py").then(r => r.text());
await pyodide.runPythonAsync(engineCode);

// 3. 实例化引擎
await pyodide.runPythonAsync(`
  from physics_engine import DoublePendulumEngine
  engine = DoublePendulumEngine()
`);

// 4. 获取 JS 代理
const engine = pyodide.globals.get("engine");

// 5. 初始化
const config = {
  params: { m1: 1.0, m2: 1.0, L1: 1.0, L2: 1.0, g: 9.81, damping: 0.0 },
  initialConditions: { theta1: Math.PI/2, theta1Dot: 0.0, theta2: Math.PI/2, theta2Dot: 0.0 },
  integrator: { dt: 0.0005, method: "RK4", substeps: 10, maxHistoryLength: 3000 },
};
engine.callKwargs("init", config);  // Python 侧 __init__ 的二次初始化

// 6. 运行循环 (requestAnimationFrame)
function animationLoop() {
  const frameState = engine.step().toJs();  // Python dict → JS object
  // 将 frameState 分发给渲染管线
  renderScene(frameState);
  requestAnimationFrame(animationLoop);
}
```

### 状态机

物理引擎自身的运行阶段使用以下状态机：

| 当前状态 | 触发事件 | 下一状态 | 前置条件 | 副作用 |
|----------|----------|----------|----------|--------|
| `idle` | `step()` 首次调用 | `running` | `history` 中有首帧（步骤 3 已完成） | `_phase = "running"` |
| `running` | `step()` 正常返回 | `running` | ODE 积分无 NaN，wall-clock < 50ms | `history` 追加新帧，`_t` 推进 |
| `running` | `setDirection(-1)` | `reversing` | `_phase == "running"` | `_direction = -1`，不清除 `history` |
| `reversing` | `step()` 正常返回 | `reversing` | ODE 积分无 NaN | `history` 追加新帧，`_t` 回退 |
| `reversing` | `setDirection(1)` | `running` | `_phase == "reversing"` | `_direction = 1` |
| `running` | `step()` 返回 NaN | `error` | JSON 积分产生 NaN 状态分量 | `_phase = "error"`，`_last_error` 记录错误，`history` 保留 |
| `reversing` | `step()` 返回 NaN | `error` | 同上 | 同上 |
| `error` | `reset()` | `idle` | 用户触发重置 | 清空 `history`，重置 `_t` 和 `_total_steps`，恢复默认 `_ode_rhs` |
| 任意 | `reset()` | `idle` | 无 | 清空所有状态，重新初始化 |
| `running` | `pause()` | `paused` | 无 | 停止 `requestAnimationFrame` 循环（由前端控制），`history` 保留 |
| `paused` | `resume()` | `running` | `_phase == "paused"` | 恢复 `requestAnimationFrame` 循环 |
| `idle` | `pause()` | —（无效） | 无 | 忽略，记录警告日志 |

### 异常与边界条件

#### 异常 1：参数非法

- **触发条件**：
  - `m1`、`m2`、`L1`、`L2` 任一 <= 0
  - `g` < 0
  - `damping` < 0
  - `dt` <= 0 或 `dt` > 0.01
  - `substeps` < 1 或 `substeps` > 1000
  - `maxHistoryLength` < 0
  - 初始角度 `theta1` 或 `theta2` 为 `NaN` 或 `Infinity`
- **处理策略**：
  1. 校验阶段（步骤 1 或步骤 7）立即捕获
  2. 抛出 `ValueError`，错误消息指定非法字段名和接收到的值
  3. Pyodide 将 Python `ValueError` 转换为 JS `Error`
  4. 前端 SIM-02 接收错误，对应输入框红框震动，悬浮显示具体错误消息
  5. 引擎内部状态不改变（参数热更新失败时保持原值）
  6. 记录日志：`logger.warning("param_validation_failed", field=name, value=value, reason=...)`
- **重试参数**：不重试。用户修正参数后重新发起 `setParams()` 调用。

#### 异常 2：积分数值发散

- **触发条件**：
  - 任一状态分量（`theta1`、`omega1`、`theta2`、`omega2`）变为 `NaN` 或 `Inf`
  - 常见原因：步长过大导致 RK4 在陡峭梯度处发散、自定义方程包含奇异项、分母接近零
- **处理策略**：
  1. 步骤 4 的每次子步后检查 `np.isnan(state).any()` 和 `np.isinf(state).any()`
  2. 检测到发散 → 立即设置 `_phase = "error"`
  3. `_last_error` 记录：`f"数值发散于 t={_t:.4f}，步长 dt={dt}，方法={method}"`
  4. 返回 `None` 作为 `step()` 的返回值
  5. 前端收到 `null` → 显示错误提示浮层："积分已发散，请尝试减小步长或更换积分方法"
  6. 用户可调用 `reset()` 恢复引擎，或修改参数后调用 `reset()`
  7. `history` 保留发散前的帧，供调试分析
  8. 记录日志：`logger.error("integration_diverged", t=_t, dt=dt, method=method, last_state=...)`
- **重试参数**：不自动重试。用户必须修改参数后手动 `reset()`。

#### 异常 3：单帧计算超时

- **触发条件**：
  - `step()` 单次调用的 wall-clock 时间超过 `MAX_STEP_MS = 50`（即帧率降至 < 20 FPS）
  - 常见原因：`substeps` 设置过大、自定义 ODE 计算量过高、设备性能不足
- **处理策略**：
  1. 步骤 4 中使用 `time.perf_counter()` 测量 wall-clock 时间
  2. 首次超时：自动将 `substeps` 减半（`substeps = max(1, substeps // 2)`），记录警告日志
  3. 后续 step() 调用仍超时（连续 3 次）：设置 `_phase = "error"`
  4. `_last_error` 记录：`f"性能不足：{actual_ms}ms/帧，已自动降级但持续超时，当前 substeps={substeps}"`
  5. 前端显示黄色提示浮层："检测到性能瓶颈，已自动降低计算精度。建议关闭其他标签页或减少尾迹长度。"
  6. 记录结构化日志：`logger.warning("step_timeout", actual_ms=..., substeps=..., total_steps=...)`
- **重试参数**：自适应降级（减半步数），连续 3 次失败后进入 error 状态。若 `substeps` 已降至 1 仍超时，立即进入 error。

#### 异常 4：Pyodide 通信中断

- **触发条件**：
  - `pyodide.globals.get("engine")` 返回 `undefined`
  - `engine.step()` 抛出 `PyodideFutureError`（Python 异常未正确序列化）
  - WebAssembly 内存耗尽导致 Pyodide 崩溃
- **处理策略**：
  1. JS 侧 `try/catch` 包裹每次 `engine.step()` 调用
  2. 捕获异常后检查 Pyodide 是否存活：`pyodide.runPython("1+1")`
  3. 若 Pyodide 存活 → 重新实例化引擎：`pyodide.runPythonAsync(engineCode)`，从最近的 `history` 快照恢复
  4. 若 Pyodide 崩溃 → 提示用户刷新页面："运行时环境异常，请刷新页面后重试。你的快照数据已保存至本地。"（配合 DAT-01 在崩溃前保存快照到 localStorage）
  5. 记录日志：`logger.critical("pyodide_communication_failure", error_type=..., pyodide_alive=...)`
- **重试参数**：Pyodide 存活时，引擎重实例化 1 次。Pyodide 崩溃时，不重试，提示刷新。

#### 异常 5：自定义方程恶意代码（LAB-03 场景）

- **触发条件**：
  - 用户代码包含 AST 白名单外的节点（如 `While`、`For`、`Import`、`Call` 调用黑名单函数）
  - 用户代码尝试访问 `__` 开头的属性
  - 用户代码大小超过 `MAX_CODE_LENGTH = 10000` 字符
- **处理策略**：
  1. 步骤 10 的 AST 遍历中逐节点检查
  2. 违规节点 → 立即拒绝，返回具体错误：`f"安全限制：第{lineno}行的 '{node_type}' 不被允许"`
  3. 不执行任何用户代码，保持原 `_ode_rhs` 不变
  4. 前端 LAB-03 在编辑器中高亮违规行，侧边显示中文错误翻译
  5. 记录日志：`logger.warning("custom_equation_rejected", reason=..., user_code_hash=sha256(code)[:8])`（仅记录哈希，不记录完整用户代码，保护隐私）
- **重试参数**：不重试。用户修改代码后重新提交。

#### 异常 6：角度归一化边界

- **触发条件**：
  - 长时间运行（> 10 分钟）导致 `theta1` 或 `theta2` 累加到超过 `±1e6` rad，浮点精度下降
- **处理策略**：
  1. 步骤 6 `_ode_rhs` 的入口处自动归一化：`t1 = (t1 + np.pi) % (2 * np.pi) - np.pi`
  2. 归一化在每次子步积分后自动执行（对积分结果无物理影响，角度模 2π）
  3. 若连续 1000 子步后 `abs(alpha) > 1e6`，触发预警降级：增大阻尼 0.01 以抑制发散
- **重试参数**：自动处理，对外透明。

### 原则兑现清单

| 原则来源 | 原则名称 | 代码级约束 |
|----------|----------|------------|
| 功能设计_v0 §一 1.1 | 分层递进认知 | 引擎仅负责"感知层"和"分析层"的数值计算，不处理可视化、声音化、教学注释（解耦） |
| 功能设计_v0 §五 5.2 | 物理正确性可验证 | ODE 右端函数必须使用拉格朗日方程的标准推导结果；积分器必须通过"小角度线性化偏差<2%"和"能量守恒漂移<0.5%/1000s"两项基准测试 |
| 功能设计_v0 §五 5.3 | 安全沙箱 | 自定义方程注入必须经 AST 白名单校验，禁止 `eval`/`exec` 直接执行用户代码，超时 5s 强制终止 |
| 功能设计_v0 §九 | 优雅降级 | 性能不足时自动降低 `substeps` 而非崩溃；Pyodide 崩溃时提示刷新而非白屏 |
| 功能设计_v0 §十 | 可配置步长 | `dt` 和 `substeps` 必须可独立配置；积分方法可在 3 种中切换 |
| 通用原则 | 单一职责 | 每个函数只做一件事：`_ode_rhs` 仅计算导数、`_rk4_step` 仅执行一步积分、`_compute_frame` 仅做坐标和能量转换；函数行数不超过 60 行 |
| 通用原则 | 可观测性 | 每帧返回 `computeTimeMs`；每 1000 步输出结构化日志（`step_count`、`sim_time`、`energy_drift`、`fps`） |

### 验收测试场景

#### 正向测试 1：标准参数下引擎正常推进

- **Given**：
  ```json
  {
    "params": { "m1": 1.0, "m2": 1.0, "L1": 1.0, "L2": 1.0, "g": 9.81, "damping": 0.0 },
    "initialConditions": { "theta1": 1.5708, "theta1Dot": 0.0, "theta2": 1.5708, "theta2Dot": 0.0 },
    "integrator": { "dt": 0.0005, "method": "RK4", "substeps": 10, "maxHistoryLength": 3000 }
  }
  ```
- **When**：初始化引擎后连续调用 `step()` 600 次（模拟 10 秒仿真 @60FPS）
- **Then**：
  - 每次 `step()` 返回非 null 的 `FrameState`
  - `FrameState.t` 单调递增，第 600 帧的 `t ≈ 3.0`（600 * 10 * 0.0005 = 3.0s）
  - `history.length` = 601（含首帧）
  - `totalEnergy` 的漂移 `|E_max - E_min| / |E_initial| < 0.005`（0.5% 以内）
  - `computeTimeMs` 每帧 < 5ms

#### 正向测试 2：参数热更新即时生效

- **Given**：引擎已在正向测试 1 的参数下运行 300 帧（t ≈ 1.5s）
- **When**：调用 `engine.setParams({damping: 0.5})`，然后继续 `step()` 300 帧
- **Then**：
  - `setParams` 返回成功（不抛异常）
  - 第 301 帧的阻尼项生效：总能量开始明显衰减（非保守系统）
  - 第 600 帧的 `totalEnergy` < 第 300 帧的 `totalEnergy`（能量被阻尼消耗）
  - `totalEnergy` 单调递减（无负阻尼导致的能量增长）

#### 正向测试 3：积分方法切换保持输出格式一致

- **Given**：同正向测试 1 的参数
- **When**：分别使用 "RK4"、"VelocityVerlet"、"Euler" 初始化三个引擎实例，各运行 600 帧
- **Then**：
  - 三个引擎均正常输出 `FrameState`，字段完整无缺失
  - Euler 的能量漂移明显大于 RK4（教育对比意义）
  - VelocityVerlet 的能量漂移 <= RK4 的能量漂移（辛积分器优势）
  - 三种方法的前 50 帧轨迹（`x2`, `y2`）互相偏差 < 5%（未进入混沌区前）

#### 异常测试 1：非法参数拒绝

- **Given**：
  ```json
  {
    "params": { "m1": -1.0, "m2": 1.0, "L1": 1.0, "L2": 1.0, "g": 9.81, "damping": 0.0 },
    "initialConditions": { "theta1": 1.5708, "theta1Dot": 0.0, "theta2": 1.5708, "theta2Dot": 0.0 },
    "integrator": { "dt": 0.0005, "method": "RK4", "substeps": 10, "maxHistoryLength": 3000 }
  }
  ```
- **When**：调用 `engine.init(config)`
- **Then**：
  - 抛出 `ValueError`，错误消息包含 `"m1"` 和 `"必须为正数"`
  - 引擎保持未初始化状态，`engine.getState()` 返回 `{phase: "idle", currentFrame: null}`
  - 不产生任何 `history` 条目

#### 异常测试 2：过大步长导致数值发散

- **Given**：同正向测试 1 的参数，但 `integrator.dt = 0.05`（超过正常值 100 倍）
- **When**：初始化引擎后调用 `step()`
- **Then**：
  - 在 100 次 `step()` 调用内，某次返回 `null`
  - `engine.getState().phase === "error"`
  - `engine.getState().lastError` 包含 `"数值发散"`
  - `history` 中保留了发散前的帧（非空）

#### 异常测试 3：自定义方程含危险代码被拒绝

- **Given**：引擎正常运行中
- **When**：调用 `engine.setCustomEquations("def custom_ode_rhs(state, params):\n    import os\n    os.system('rm -rf /')\n    return np.array([0,0,0,0])")`
- **Then**：
  - 抛出错误，消息包含 `"安全限制"` 和 `"import"`
  - 原 `_ode_rhs` 保持不变，后续 `step()` 仍使用原方程
  - 引擎 `_phase` 仍为 `"running"`

#### 异常测试 4：Pyodide 崩溃后恢复引导

- **Given**：引擎正常运行 100 帧（`history` 中有 101 帧），DAT-01 在每 10 帧时将最新帧保存到 `localStorage`
- **When**：模拟 Pyodide 崩溃（`pyodide.runPython("1+1")` 抛出异常）
- **Then**：
  - JS 侧捕获异常，显示提示浮层："运行时环境异常，请刷新页面后重试"
  - 提示中包含"你的数据已自动保存"文案
  - `localStorage` 中存在最近一次保存的快照数据（JSON 完整可读）

### 文档详细度自检清单

- [x] 文档自包含：不了解本项目代码的开发者可凭此文档独立完成 SIM-01 编码
- [x] 无偷懒表述：全文无 `"等等"`、`"..."`、`"其他字段"`、`"类似"`、`"同上"`、`"参考其他模块"`、`"请根据实际情况补充"`、`"开发者自行决定"`
- [x] 类型定义完整：每个字段都有 `description` + `examples` + 约束条件
- [x] 逻辑步骤完整：每个步骤都有操作对象、具体操作、输入来源、输出去向、失败行为
- [x] 异常处理完整：6 种异常都有精确的触发阈值、逐步处理策略、精确重试参数
- [x] 无隐藏假设：Pyodide 版本、WASM 加载延迟、角度归一化策略、默认值均显式写出

### 注意事项与禁止行为

1. **【物理正确性保底】** ODE 右端函数 `_ode_rhs` 的拉格朗日方程推导结果必须与标准文献一致（参考 `doi:10.1119/1.16860`）。任何对运动方程的修改必须重新通过 LAB-02 的三个验证项（小角度偏差 < 2%、单摆退化吻合、能量守恒 < 0.5%）。
2. **【Pyodide 性能阈值】** Python in WASM 比原生 Python 慢约 3-5 倍。RK4 的 4 次 `_ode_rhs` 调用在 `substeps=10`、`dt=0.0005` 下，单帧 wall-clock 时间必须 < 5ms（中端设备 i5-12400 基准）。若超标，优先考虑：a) 降低 `substeps`、b) 将 `_ode_rhs` 中的三角函数预计算（利用 `numpy.sincos`）、c) 检查 Pyodide 版本是否启用 SIMD。
3. **【角度约定】** 所有角度内部使用弧度（rad），前端显示由 SIM-02 负责度/弧度转换。θ = 0 表示摆杆竖直向下，正值表示逆时针偏转。此约定必须在代码注释中显式声明，禁止混用角度制。
4. **【坐标系约定】** Python 引擎内部使用物理坐标系（y 轴向上为正）。前端渲染时由 EXP-01 负责 y 轴翻转。引擎不关心渲染坐标系。
5. **【禁止行为】** 禁止在 Python 引擎侧引入任何 UI 依赖、DOM 操作或 `print()` 调试输出（`print` 在 Pyodide 中会将输出写入虚拟 stdout，累积导致内存泄漏）。所有日志必须通过 `logging` 模块经 Pyodide 桥接输出到 JS console。
6. **【禁止行为】** 禁止在 JS 侧实现任何物理计算（包括简单的小角度近似公式），所有物理逻辑必须在 Python 引擎内统一实现。
7. **【易错点】** `_ode_rhs` 中分母 `denom = 2*m1 + m2 - m2*cos(2*delta)` 在 `delta → 0` 且 `m2 → 0` 时接近零。必须检查 `abs(denom) < 1e-12`，但不能简单 clamp 到 `1e-12`——当 `denom` 为负时需保留符号，使用 `np.sign(denom) * 1e-12`。
8. **【易错点】** Velocity Verlet 积分器的第一步需要初始加速度。必须确保 `_angular_acceleration` 在 `reset()` 和 `setDirection()` 后被正确重新计算，避免使用过期的加速度缓存。
9. **【偷懒红线】** 绝对禁止以"这是标准的物理公式，大家都知道"为由省略 `_ode_rhs` 或积分器算法的完整代码。文档中必须包含可运行的 Python 实现骨架，使不了解双摆物理的开发者也能正确编码。
