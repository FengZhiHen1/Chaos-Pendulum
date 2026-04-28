# 功能点：SYS-03 预计算数据管线

> **文档生成时间**：2026-04-28 21:45:31 CST
> **版本记录**：
> | 版本 | 时间 | 修改人 | 变更摘要 |
> |------|------|--------|----------|
> | v1.0 | 2026-04-28 21:45:31 | AI Assistant | 初始版本，对齐 ANL-01/ANL-02 已有数据格式约定 + 现有 Python 脚本骨架（config/common/lyapunov_spectrum/bifurcation/run_all） |

> **冲突核查指引**：本模块是 `LyapunovGrid` 和 `BifurcationData` JSON 格式的**唯一生产者**（Python 脚本输出）和**统一加载入口**（前端 `usePrecomputeData` hook）。ANL-01/ANL-02 仅消费这些格式，不关心生成过程。若 JSON schema 变更，需同步更新 ANL-01 和 ANL-02 的类型定义。

### 所属模块与溯源

- **对应总设计章节**：功能设计_v0 §四 4.1「参数空间李雅普诺夫指数谱」（数据基础：预计算二维参数网格）、§四 4.2「参数空间分岔图」（数据基础：扫描单一控制参数）、§十 P1（预计算数据优先级）；技术栈设计 §2 #19「离线预计算：Python 3.11+ 本地脚本」、§3.2「预计算数据管线」、§4.9「预计算数据：Lyapunov 谱 + 分岔图」、§5.3「预计算数据缓存」
- **依赖的其他功能模块**：无（本模块为数据生产者，不依赖任何运行时功能模块。Python 脚本离线运行，前端缓存层仅依赖浏览器原生 API）
- **被依赖模块**：
  - `ANL-01`（李雅普诺夫指数谱）— 消费 `LyapunovGrid` 格式的 JSON 数据 + `usePrecomputeData()` hook
  - `ANL-02`（参数空间分岔图）— 消费 `BifurcationData` 格式的 JSON 数据 + `usePrecomputeData()` hook
  - `SYS-02`（运行时异常处理）— 本模块加载失败时调用 `notify()` 展示离线模式提示
  - `SYS-04`（应用初始化加载）— 预计算 JSON 文件 URL 需要在 Vite 构建时确定（`import.meta.url` 或 `new URL(...)` 模式）

### 已有设计兼容性分析

- **已审查的相关规格文档**：
  - `ANL-01-李雅普诺夫指数谱.md` v1.0：定义了 `LyapunovGrid` interface（`metadata` + `grid: number[][]`），数据文件路径格式 `lyapunov_max-[gridHash].json`，IndexedDB 键前缀 `lyapunov_max-`，fetch 加载 + 校验流程。本模块作为该数据的**生产者**，JSON 输出格式必须与 `LyapunovGrid` 完全一致。
  - `ANL-02-参数空间分岔图.md` v1.0：定义了 `BifurcationData` interface（`metadata` + `samples: number[][]`），数据文件路径格式 `bifurcation-[gridHash].json`，IndexedDB 键前缀 `bifurcation-`。本模块作为该数据的**生产者**，JSON 输出格式必须与 `BifurcationData` 完全一致。
  - `ANL-03-庞加莱截面.md` v1.0：庞加莱截面为实时 Web Worker 计算（非预计算），不依赖本模块。无冲突。
  - `ANL-04-能量景观地形图.md` v1.0：能量景观为实时计算（`V(θ₁, θ₂)` 函数），不依赖本模块。无冲突。
  - `双摆混沌实验室-技术栈设计.md` v1.2：§4.9 预计算方案（Python 脚本 → JSON → dist/assets/ + IndexedDB 缓存）、§5.3 缓存设计（键 = `{type}-{gridHash}`，LRU 最多 10 条，永久有效）、§2 #19（Python 3.11+ + NumPy + SciPy）
  - `双摆混沌实验室-项目结构.md` v1.0：§4.2 `scripts/precompute/` 目录结构（config/common/lyapunov_spectrum/bifurcation/run_all）、§4.9 `src/shared/data/` 输出目录、§4.9 `src/shared/lib/cache/indexed-db.ts` 通用 IndexedDB 封装
  - `SYS-02-运行时异常处理.md` v1.0：`PRECOMPUTE_FETCH_FAILED` / `PRECOMPUTE_FORMAT_ERROR` / `PRECOMPUTE_VERSION_MISMATCH` 错误码，本模块加载失败时通过 `notify()` 触发这些错误码的通知
- **兼容性结论**：
  - 无冲突。本模块的 JSON 输出格式以 ANL-01 和 ANL-02 定义的类型为权威目标（此两类已在 ANL-01/ANL-02 规格中明确定义并稳定）。Python 脚本的 `output` 结构必须严格匹配这些类型。
  - 现有 Python 脚本骨架（`config.py`、`common.py`、`lyapunov_spectrum.py`、`bifurcation.py`、`run_all.py`）的文件名和目录结构与项目结构设计 §4.2 一致，无需移动。当前缺少的部分是：`common.py` 中 `computeGridHash()` 的实现、`lyapunov_spectrum.py` 中 `metadata` 的完整输出字段（`solverVersion`、`generatedAt`、`gridHash`）、`bifurcation.py` 中完整 `metadata` 输出。
  - IndexedDB 缓存层 `precomputeCache.ts` 的名称为 ANL-01/ANL-02 的引用目标，本模块负责创建此文件并供它们导入。
- **复用的已有定义**：
  - `LyapunovGrid` 类型（来自 ANL-01 规格，本模块的 Python 脚本输出必须匹配此结构）
  - `BifurcationData` 类型（来自 ANL-02 规格，本模块的 Python 脚本输出必须匹配此结构）
  - `PrecomputeCacheEntry` 接口（来自 ANL-01 规格 §351-358，本模块的 `precomputeCache.ts` 实现）
  - IndexedDB `precompute` object store 命名（来自 ANL-01 §351、ANL-02 §393）
  - `EXPECTED_SOLVER_VERSION = "1.0.0"`（来自 ANL-01 §588，本模块的 Python 脚本和前端 loader 均需硬编码此值）

### 技术栈绑定

- **必须使用（Python 端）**：
  - Python ≥ 3.11 — 脚本运行环境
  - NumPy ≥ 1.24 — 数组运算、ODE 状态向量管理
  - SciPy ≥ 1.10 — `scipy.integrate.solve_ivp`（RK45 自适应积分）、`scipy.optimize`（局部极值检测）
  - `hashlib`（Python 标准库）— SHA-256 计算 `gridHash`
  - `json`（Python 标准库）— JSON 序列化（`json.dump` with `indent=2`，确保可读 diff）
  - `pathlib.Path`（Python 标准库）— 跨平台路径处理
  - `argparse`（Python 标准库）— 命令行参数（`--output` 指定输出目录、`--dry-run` 试运行）
  - `typing`（Python 标准库）— 类型注解（提高脚本可维护性）
- **禁止使用（Python 端）**：
  - 禁止依赖 `matplotlib` 或任何可视化库（脚本仅输出 JSON 数据，不生成图表）
  - 禁止依赖 `pandas`（JSON 序列化使用原生 `json.dump`，NumPy 数组用 `.tolist()` 转换）
  - 禁止硬编码输出路径为绝对路径（必须基于 `config.py` 的 `OUTPUT_DIR` 或 `--output` 命令行参数）
  - 禁止在单次扫描中使用 `multiprocessing`（100×100 网格在单进程串行运行即可完成，避免多进程在竞赛评审机器上的兼容性问题）
- **必须使用（前端 TypeScript 端）**：
  - TypeScript 5.x — 类型安全
  - 浏览器原生 `fetch()` — 加载 JSON 文件
  - 浏览器原生 `indexedDB` — 预计算数据缓存（`precompute` object store）
  - Web Crypto API `crypto.subtle.digest("SHA-256", ...)` — 前端计算 `gridHash`（与 Python `hashlib.sha256` 输出一致）
  - `react@^18.3.1` — `usePrecomputeData` hook 的 React 集成
  - `zustand@^4.5.5` — 缓存状态写入 `useAppStore`（可选，`pyodideLoadPct` 类似的 `precomputeLoadState`）
- **禁止使用（前端 TypeScript 端）**：
  - 禁止依赖任何第三方 hash 库（如 `crypto-js`、`js-sha256`）。Web Crypto API `SubtleCrypto.digest('SHA-256')` 完全满足需求
  - 禁止使用 `localStorage` 存储预计算数据（单条 LyapunovGrid JSON 约 80KB，分岔图约 200KB，均超过 localStorage 5MB 总上限的合理分配；IndexedDB 无此限制）
  - 禁止在 `fetch()` 中使用相对路径 `./assets/...`（Vite 构建后 `assets/` 目录的精确文件名含 hash 后缀，必须通过 `new URL('../../shared/data/lyapunov_max-a1b3f2e8.json', import.meta.url)` 或 Vite 的 `?url` import 语法获取正确的构建产物路径）
  - 禁止在 ANL-01、ANL-02 组件中直接调用 `indexedDB.open()` 或 `fetch()` 加载预计算数据。所有数据加载必须通过本模块提供的 `usePrecomputeData()` hook 或 `loadPrecomputeData()` 函数

### 输入定义（精确类型）

#### Part A：Python 脚本输入

##### config.py — 参数网格配置

```python
# ============================================================
# scripts/precompute/config.py
# 集中管理所有扫描参数，避免硬编码。
# 修改预计算范围时，仅需修改此文件。
# ============================================================

from pathlib import Path

# 输出目录（相对于脚本所在目录，指向 src/shared/data/）
# 示例：scripts/precompute/ → ../../src/shared/data/
OUTPUT_DIR = Path(__file__).resolve().parents[2] / "src" / "shared" / "data"

# ---- Lyapunov 谱扫描参数 ----
LYAPUNOV_GRID = {
    # X 轴参数：L₂/L₁ 比（无量纲）
    "L2_L1_ratio": {
        "min": 0.5,        # 最小比值。约束：> 0。示例：0.5
        "max": 2.0,        # 最大比值。约束：> min。示例：2.0
        "points": 100,     # 网格点数。约束：≥ 10，≤ 200。典型值 100
    },
    # Y 轴参数：θ₁ 初始角（弧度）
    "theta1_init": {
        "min": 0.0,        # 最小初始角 (rad)。约束：任意实数。示例：0.0
        "max": 6.283185307179586,  # 2π rad。约束：> min。示例：2π
        "points": 100,     # 网格点数。约束：≥ 10，≤ 200。典型值 100
    },
}

# ---- 分岔图扫描参数 ----
BIFURCATION_SCAN = {
    # 扫描的控制参数（X 轴）
    "control_param": "theta1",       # 参数名。枚举值："theta1" | "theta2" | "L1" | "L2" | "m1" | "m2" | "omega1_0" | "omega2_0"
    "control_range": [0.0, 6.283185307179586],  # [min, max]。约束：max > min
    "control_points": 500,           # 扫描步数。约束：≥ 50，≤ 2000。典型值 500

    # 积分参数
    "transient_steps": 500,          # 瞬态抛弃步数（对应 transientTime = transient_steps × dt）
    "sample_steps": 200,             # 稳态采样步数（对应 sampleTime = sample_steps × dt）
}

# ---- 固定物理参数（除扫描参数外）----
FIXED_PARAMS = {
    "m1": 1.0,              # 上摆质量 (kg)。约束：> 0。默认：1.0
    "m2": 1.0,              # 下摆质量 (kg)。约束：> 0。默认：1.0
    "L1": 1.0,              # 上摆摆长 (m)。约束：> 0。默认：1.0
    # L2 由 LYAPUNOV_GRID["L2_L1_ratio"] * L1 计算得出（仅 Lyapunov 谱）
    "g": 9.81,              # 重力加速度 (m/s²)。约束：≥ 0。默认：9.81
    "damping": 0.0,         # 阻尼系数 (1/s)。约束：≥ 0。默认：0.0
}

# ---- 积分参数 ----
INTEGRATION = {
    "dt": 0.01,             # 积分步长 (s)。约束：> 0。默认：0.01
    "total_time": 100.0,    # 单次仿真总时长 (s)。约束：> 0。Lyapunov 谱使用此值
    "lyapunov_transient": 50.0,  # Lyapunov 瞬态抛弃时间 (s)。约束：< total_time
}

# ---- 元数据 ----
SOLVER_VERSION = "1.0.0"    # 预计算脚本版本号。JSON metadata.solverVersion 的值
```

##### common.py — ODE 系统定义与共享工具

```python
# ============================================================
# scripts/precompute/common.py
# 共享工具：双摆 ODE 系统定义、solve_ivp 封装、
# Benettin 算法 Lyapunov 估计、局部极值检测、gridHash 计算。
# ============================================================

import hashlib
import json
import numpy as np
from scipy.integrate import solve_ivp
from scipy.signal import argrelextrema
from typing import Callable


# ---- 双摆 ODE 系统 ----

def double_pendulum_ode(t: float, y: np.ndarray, params: dict) -> np.ndarray:
    """
    双摆拉格朗日运动方程。

    参数:
        t: float           — 当前时间 (s)（自治系统不使用，但 solve_ivp 要求此签名）
        y: np.ndarray[4]   — 状态向量 [θ₁, θ̇₁, θ₂, θ̇₂]
        params: dict       — 物理参数字典，必须包含:
                              m1, m2: float — 质量 (kg)
                              L1, L2: float — 摆长 (m)
                              g: float      — 重力加速度 (m/s²)
                              damping: float — 阻尼系数 (1/s)

    返回:
        np.ndarray[4] — 导数 [θ̇₁, θ̈₁, θ̇₂, θ̈₂]
    """
    m1, m2 = params["m1"], params["m2"]
    L1, L2 = params["L1"], params["L2"]
    g = params["g"]
    d = params["damping"]

    theta1, omega1, theta2, omega2 = y
    delta = theta1 - theta2

    # 分母（标准拉格朗日推导，与 SIM-01 v2.1 公式一致）
    denom = m1 + m2 - m2 * np.cos(delta) ** 2
    if denom == 0.0:
        # 保护：cos²(δ) = (m₁+m₂)/m₂ 时除零，极少发生
        denom = 1e-15

    # 上摆角加速度
    alpha1 = (
        m2 * g * np.sin(theta2) * np.cos(delta)
        - m2 * np.sin(delta) * (L1 * omega1**2 * np.cos(delta) + L2 * omega2**2)
        - (m1 + m2) * g * np.sin(theta1)
        - d * omega1 * L1
    ) / (L1 * denom)

    # 下摆角加速度
    alpha2 = (
        (m1 + m2) * (g * np.sin(theta1) * np.cos(delta) - L1 * omega1**2 * np.sin(delta) - g * np.sin(theta2))
        + m2 * L2 * omega2**2 * np.sin(delta) * np.cos(delta)
        - d * omega2 * L2
    ) / (L2 * denom)

    return np.array([omega1, alpha1, omega2, alpha2])


# ---- Benettin 算法 Lyapunov 指数估计 ----

def estimate_lyapunov(
    params: dict,
    y0: np.ndarray,          # 初始状态 [θ₁, θ̇₁, θ₂, θ̇₂]
    total_time: float,       # 总仿真时长 (s)
    transient_time: float,   # 瞬态抛弃时间 (s)
    dt: float,               # 积分步长 (s)
    delta0: float = 1e-8,    # 初始扰动大小。默认：1e-8
) -> float:
    """
    使用 Benettin 算法估计最大 Lyapunov 指数。

    算法：
      1. 以 y0 为初值，积分 transient_time 秒，抛弃瞬态
      2. 对当前状态 y(t₀) 施加小扰动 y'(t₀) = y(t₀) + δ₀，归一化 d₀ = |y' - y|
      3. 在每步积分中：
         a. 同时积分参考轨线 y(t) 和扰动轨线 y'(t)
         b. 计算散度 d = |y'(t+dt) - y(t+dt)|
         c. 累积 λ += log(d/d₀)
         d. 重新归一化扰动轨线：y' = y + (y' - y) * (d₀ / d)
      4. λ_final = λ / (总积分步数 × dt)

    参数:
        params: dict            — 物理参数
        y0: np.ndarray[4]      — 初始状态
        total_time: float      — 总仿真时长 (s)
        transient_time: float  — 瞬态抛弃时长 (s)
        dt: float              — 积分步长 (s)
        delta0: float          — 初始扰动大小

    返回:
        float — 估计的最大 Lyapunov 指数 λ_max
               NaN 表示积分失败/发散
    """
    # 1. 积分瞬态阶段
    t_span = (0.0, transient_time)
    t_eval = np.arange(0.0, transient_time, dt)
    sol = solve_ivp(
        double_pendulum_ode, t_span, y0,
        args=(params,), t_eval=t_eval, method="RK45",
        rtol=1e-9, atol=1e-12, max_step=dt * 10,
    )
    if not sol.success:
        return float("nan")

    y_ref = sol.y[:, -1]  # 瞬态后的参考状态

    # 2. 扰动轨线
    perturbation = np.random.randn(4)
    perturbation /= np.linalg.norm(perturbation)
    y_pert = y_ref + delta0 * perturbation

    # 3. Benettin 迭代
    lyap_sum = 0.0
    steps = int((total_time - transient_time) / dt)
    t_current = transient_time

    for _ in range(steps):
        t_span_step = (t_current, t_current + dt)
        t_eval_step = [t_current + dt]

        # 积分参考轨线
        sol_ref = solve_ivp(
            double_pendulum_ode, t_span_step, y_ref,
            args=(params,), t_eval=t_eval_step, method="RK45",
            rtol=1e-9, atol=1e-12, max_step=dt,
        )
        if not sol_ref.success:
            return float("nan")
        y_ref = sol_ref.y[:, -1]

        # 积分扰动轨线
        sol_pert = solve_ivp(
            double_pendulum_ode, t_span_step, y_pert,
            args=(params,), t_eval=t_eval_step, method="RK45",
            rtol=1e-9, atol=1e-12, max_step=dt,
        )
        if not sol_pert.success:
            return float("nan")
        y_pert = sol_pert.y[:, -1]

        # 计算散度
        divergence = y_pert - y_ref
        d = np.linalg.norm(divergence)
        if d == 0.0:
            continue  # 极少情况：扰动消失

        lyap_sum += np.log(d / delta0)

        # 重新归一化
        y_pert = y_ref + divergence * (delta0 / d)

        # 检查 NaN
        if np.isnan(y_ref).any() or np.isnan(y_pert).any():
            return float("nan")

        t_current += dt

    return lyap_sum / (steps * dt)


# ---- 局部极大值检测（用于分岔图）----

def detect_local_maxima(
    data: np.ndarray,      # 1D 时序数据
    order: int = 5,        # 邻域比较点数（两侧各 order 个点）
) -> np.ndarray:
    """
    检测时序数据中的所有局部极大值。

    参数:
        data: np.ndarray[1D] — 时序数据（如 θ₂(t) 序列）
        order: int           — 邻域比较点数，默认 5

    返回:
        np.ndarray[1D] — 局部极大值数组。空数组表示未检测到极大值。
    """
    if len(data) < 2 * order + 1:
        return np.array([])
    maxima_indices = argrelextrema(data, np.greater, order=order)[0]
    return data[maxima_indices]


# ---- gridHash 计算 ----

def compute_grid_hash(
    metadata_dict: dict,  # 不含 gridHash 字段的 metadata 字典
) -> str:
    """
    计算参数网格的 SHA-256 哈希（取前 16 个 hex 字符）。

    哈希输入：JSON.stringify({paramX, paramY, fixedParams, type})（Lyapunov）
              JSON.stringify({scannedParam, sampledVariable, fixedParams, type})（Bifurcation）
    键排序：sort_keys=True 确保确定性。

    参数:
        metadata_dict: dict — 不含 gridHash 的 metadata 字典

    返回:
        str — 16 字符小写 hex 哈希，如 "a1b3f2e8"
    """
    canonical = json.dumps(metadata_dict, sort_keys=True, ensure_ascii=True)
    full_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return full_hash[:16]
```

##### lyapunov_spectrum.py — CLI 参数

```python
# ============================================================
# scripts/precompute/lyapunov_spectrum.py
# 命令行用法：
#   python lyapunov_spectrum.py --output ../../src/shared/data/ --dry-run
#
# --output: str  — 输出目录路径（默认：config.OUTPUT_DIR）
# --dry-run: flag — 试运行，打印将生成的参数网格但不实际积分
# --type: str    — 图层类型："lyapunov_max"（默认）/ "lyapunov_min"
# ============================================================
```

##### bifurcation.py — CLI 参数

```python
# ============================================================
# scripts/precompute/bifurcation.py
# 命令行用法：
#   python bifurcation.py --output ../../src/shared/data/ --dry-run
#
# --output: str  — 输出目录路径（默认：config.OUTPUT_DIR）
# --dry-run: flag — 试运行，打印将扫描的参数序列但不实际积分
# --control-param: str — 扫描参数名（默认：config.BIFURCATION_SCAN["control_param"]）
# ============================================================
```

#### Part B：前端加载器输入

##### usePrecomputeData Hook 输入

```typescript
// ============================================================
// src/shared/lib/cache/precomputeCache.ts
// ============================================================

/**
 * 预计算数据加载的输入参数。
 * 供 ANL-01/ANL-02 调用 usePrecomputeData() 时传入。
 */
interface UsePrecomputeDataInput {
  /**
   * 数据类型，决定 IndexedDB 键前缀和校验规则。
   * "lyapunov_max" | "lyapunov_min" | "energy_curvature" | "bifurcation"
   */
  dataType: "lyapunov_max" | "lyapunov_min" | "energy_curvature" | "bifurcation";

  /**
   * 数据文件的 Vite 构建产物 URL。
   * 必须通过 Vite 的静态资源导入获取：
   *   const dataUrl = new URL(
   *     `../../shared/data/lyapunov_max-${gridHash}.json`,
   *     import.meta.url
   *   ).href;
   * 或使用 Vite 的 ?url import：
   *   import dataUrl from "@/shared/data/lyapunov_max-a1b3f2e8.json?url";
   *
   * 类型：string（完整的 URL 字符串）
   * 约束：必须以 http://, https://, 或以 / 开头的绝对路径
   * 示例："/assets/lyapunov_max-a1b3f2e8-D4fG7h.json"
   */
  dataUrl: string;

  /**
   * 预期的参数网格哈希（16 字符 hex）。
   * 用于校验：加载成功后验证 data.metadata.gridHash === expectedGridHash。
   * 如不匹配 → 抛出格式错误（可能文件被篡改或版本问题）。
   * 约束：16 字符，小写 hex，匹配 ^[a-f0-9]{16}$
   * 示例："a1b3f2e8"
   */
  expectedGridHash: string;

  /**
   * 预期的数据类型（与 dataType 冗余但用于双重校验）。
   * 加载成功后验证 data.metadata.type === expectedType。
   * 如不匹配 → 抛出格式错误。
   * 示例："lyapunov_max"
   */
  expectedType: string;

  /**
   * 期望的 solverVersion。
   * 默认："1.0.0"（SOLVER_VERSION 常量）。
   * 加载成功后比较 data.metadata.solverVersion === expectedSolverVersion。
   * 不匹配 → 仅 warning（不阻止加载），通过 SYS-02 notify() 提示版本差异。
   */
  expectedSolverVersion?: string;

  /**
   * 是否启用。设为 false 时不执行加载（如移动端禁用预计算数据）。
   * 默认：true。
   */
  enabled?: boolean;

  /**
   * fetch 超时时间（毫秒）。
   * 默认：10000（10 秒）。
   * 约束：>= 1000，<= 60000。
   */
  fetchTimeoutMs?: number;

  /**
   * 最大重试次数。
   * 默认：3。
   * 约束：>= 0，<= 5。
   */
  maxRetries?: number;

  /**
   * 重试退避基础时间（毫秒）。
   * 第 i 次重试延迟 = retryBaseMs * 2^i（指数退避）。
   * 默认：1000（1 秒）→ 重试延迟：1s, 2s, 4s。
   */
  retryBaseMs?: number;
}

/**
 * IndexedDB 缓存条目。
 * Object Store：precompute
 * 键路径：cacheKey（string）
 */
interface PrecomputeCacheEntry {
  /**
   * 缓存键。格式："{type}-{gridHash}"
   * 示例："lyapunov_max-a1b3f2e8"、"bifurcation-b3c4d5e6"
   */
  cacheKey: string;

  /**
   * 完整的预计算数据（LyapunovGrid | BifurcationData）。
   * 类型：object
   */
  data: LyapunovGrid | BifurcationData;

  /**
   * JSON 序列化后的字节数（用于 LRU 容量计算）。
   * 类型：number，单位 bytes。
   * 示例：81920（≈ 80KB for LyapunovGrid）
   */
  size: number;

  /**
   * 写入缓存的时间戳（ISO 8601）。
   * 用于 LRU 淘汰：最旧的条目优先被淘汰。
   * 示例："2026-04-27T08:30:00.000Z"
   */
  cachedAt: string;

  /**
   * 缓存命中次数。LRU 的辅助指标。
   * 类型：number，默认 0。
   * 每次缓存命中时 +1，淘汰选择时综合考虑 cachedAt 和 hitCount。
   */
  hitCount: number;
}
```

### 输出定义（精确类型）

#### Part A：Python 脚本输出

##### LyapunovGrid JSON 文件（由 lyapunov_spectrum.py 输出）

```typescript
/**
 * LyapunovGrid JSON 文件的完整结构。
 * 文件名：lyapunov_{type}-{gridHash}.json
 * 示例：lyapunov_max-a1b3f2e8.json
 *
 * 该类型与 ANL-01 定义的 LyapunovGrid 完全一致。
 */
interface LyapunovGridOutput {
  metadata: {
    type: "lyapunov_max" | "lyapunov_min" | "energy_curvature";

    /** X 轴参数定义 */
    paramX: {
      name: string;       // 参数名，如 "L₂/L₁"。示例："L₂/L₁"
      symbol: string;     // LaTeX 符号，如 "L_2/L_1"。示例："L_2/L_1"
      min: number;        // 扫描最小值。示例：0.5
      max: number;        // 扫描最大值。示例：2.0
      steps: number;      // 网格点数。固定：100
      unit: string;       // 单位。示例：""（无量纲）
    };

    /** Y 轴参数定义 */
    paramY: {
      name: string;       // 参数名，如 "θ₁"。示例："θ₁"
      symbol: string;     // LaTeX 符号，如 "\\theta_1"。示例："\\theta_1"
      min: number;        // 扫描最小值。示例：0.0
      max: number;        // 扫描最大值。示例：6.283185307179586
      steps: number;      // 网格点数。固定：100
      unit: string;       // 单位。示例："rad"
    };

    /** 扫描时固定的其他参数 */
    fixedParams: {
      m1: number;              // 示例：1.0
      m2: number;              // 示例：1.0
      L1: number;              // 示例：1.0
      L2: number;              // 示例：1.0（由 L₁ × ratio 计算）
      omega1_0: number;        // 示例：0.0
      omega2_0: number;        // 示例：0.0
      g: number;               // 示例：9.81
      damping: number;         // 示例：0.0
      integrationTime: number; // 示例：100.0
      dt: number;              // 示例：0.01
    };

    /** SHA-256 网格哈希，16 字符小写 hex */
    gridHash: string;          // 示例："a1b3f2e8"

    /** 脚本运行时间，ISO 8601 格式 */
    generatedAt: string;       // 示例："2026-04-27T08:30:00Z"

    /** 预计算脚本版本号 */
    solverVersion: string;     // 固定："1.0.0"
  };

  /**
   * 二维浮点矩阵。
   * 尺寸：paramY.steps × paramX.steps（100 × 100 = 10,000 个浮点值）
   * grid[y][x] = λ_max（或 λ_min / curvature）
   *
   * y 索引 0 对应 paramY.max（顶部），y 索引 steps-1 对应 paramY.min（底部）
   * 特殊值：null（JSON null）表示该格点积分失败/发散（前端渲染为 #333333 暗灰）
   */
  grid: (number | null)[][];
}
```

##### BifurcationData JSON 文件（由 bifurcation.py 输出）

```typescript
/**
 * BifurcationData JSON 文件的完整结构。
 * 文件名：bifurcation-{gridHash}.json
 * 示例：bifurcation-a1b3f2e8.json
 *
 * 该类型与 ANL-02 定义的 BifurcationData 完全一致。
 */
interface BifurcationDataOutput {
  metadata: {
    /** 固定值 "bifurcation" */
    type: "bifurcation";

    /** 扫描的控制参数（X 轴） */
    scannedParam: {
      name: string;       // 参数名。示例："θ₁"
      symbol: string;     // LaTeX 符号。示例："\\theta_1"
      min: number;        // 扫描起始值。示例：0.0
      max: number;        // 扫描终止值。示例：6.283185307179586
      steps: number;      // 扫描步数。固定：500
      unit: string;       // 单位。示例："rad"
    };

    /** 采样的状态变量（Y 轴） */
    sampledVariable: {
      name: string;       // 变量名。示例："θ₂ 局部极大值"
      symbol: string;     // LaTeX 符号。示例："\\theta_2\\ \\text{max}"
      min: number;        // 所有采样结果中的全局最小值。示例：-3.1
      max: number;        // 所有采样结果中的全局最大值。示例：3.1
      unit: string;       // 单位。示例："rad"
    };

    /** 扫描时固定的其他参数 */
    fixedParams: {
      m1: number;              // 示例：1.0
      m2: number;              // 示例：1.0
      L1: number;              // 示例：1.0
      L2: number;              // 示例：1.0
      theta1_0: number;        // 示例：1.57（当 scannedParam 不是 θ₁ 时）
      theta2_0: number;        // 示例：0.0
      omega1_0: number;        // 示例：0.0
      omega2_0: number;        // 示例：0.0
      g: number;               // 示例：9.81
      damping: number;         // 示例：0.0
      transientTime: number;   // 瞬态丢弃时长 (s)。示例：100.0（= transient_steps × dt）
      sampleTime: number;      // 稳态采样时长 (s)。示例：200.0（= sample_steps × dt）
      dt: number;              // 示例：0.01
    };

    gridHash: string;          // SHA-256 哈希，16 字符小写 hex。示例："a1b3f2e8"
    generatedAt: string;       // 脚本运行时间 ISO 8601。示例："2026-04-27T10:00:00Z"
    solverVersion: string;     // 固定："1.0.0"
  };

  /**
   * 采样数据数组。
   * 长度 = scannedParam.steps（500）
   * samples[i] 是在 scannedParam[i] 处采集到的所有局部极大值。
   *
   * samples[i].length 可变：
   *   - 周期-1：1 个值
   *   - 周期-2：2 个值（分岔特征）
   *   - 周期-4：4 个值
   *   - 混沌：可能 10+ 个值（在纵轴上形成连续带）
   *   - 空数组 []：该参数值处仿真发散或未检测到极大值
   */
  samples: number[][];
}
```

#### Part B：前端加载器输出

```typescript
/**
 * usePrecomputeData() hook 的返回值。
 */
interface PrecomputeDataState<T = LyapunovGrid | BifurcationData> {
  /**
   * 加载状态。
   * "idle": 尚未开始加载
   * "loading": 正在 fetch / 正在读取 IndexedDB
   * "ready": 加载成功且校验通过，data 可用
   * "error": 加载失败或校验失败，errorMessage 包含详细信息
   */
  status: "idle" | "loading" | "ready" | "error";

  /**
   * 加载成功后的预计算数据。
   * status === "ready" 时非 null。
   */
  data: T | null;

  /**
   * 加载失败时的错误信息。
   * status === "error" 时非 null。
   * 示例："fetch 失败: HTTP 404"
   */
  errorMessage: string | null;

  /**
   * 错误码。status === "error" 时非 null。
   * 用于 SYS-02 的 translateError() 翻译。
   */
  errorCode: ErrorCode | null;  // ErrorCode 来自 SYS-02 的类型定义

  /**
   * 数据来源。
   * "cache": 从 IndexedDB 缓存命中
   * "network": 从 fetch 首次加载（已写入缓存）
   * null: 尚未加载
   */
  source: "cache" | "network" | null;

  /**
   * 手动重新加载。
   * 清除错误状态，重新执行 fetch + 缓存逻辑。
   * error 状态下用户点击"重试"调用此函数。
   */
  retry: () => void;
}

/**
 * 模块级函数 loadPrecomputeData()。
 * 非 React 上下文中使用（如在 Worker 初始化时预加载）。
 * 返回 Promise<PrecomputeDataState>。
 */
function loadPrecomputeData<T = LyapunovGrid | BifurcationData>(
  input: UsePrecomputeDataInput
): Promise<PrecomputeDataState<T>>;
```

### 核心逻辑步骤

#### Part A：Python 离线脚本

**阶段 A1：Lyapunov 指数谱扫描（lyapunov_spectrum.py）**

**步骤 1：解析网格参数 → 生成扫描网格**

- **操作对象**：`config.LYAPUNOV_GRID` 和 `config.FIXED_PARAMS`
- **具体操作**：
  1. 读取 X 轴参数 `L2_L1_ratio`：`np.linspace(min, max, points)` → 100 个 ratio 值
  2. 读取 Y 轴参数 `theta1_init`：`np.linspace(min, max, points)` → 100 个 θ₁ 值
  3. 生成 100×100 = 10,000 组参数组合（笛卡尔积）
  4. 对每组组合：`L2 = ratio * FIXED_PARAMS["L1"]`；`y0 = [theta1_init, 0.0, 0.0, 0.0]`（θ₂ 初始角固定为 0，初始角速度均为 0）
  5. 逐组合调用 `estimate_lyapunov(params, y0, total_time, lyapunov_transient, dt)`
  6. 将返回值 λ 填入 `grid[y][x]`；若返回 NaN → 填入 `null`（JSON null）
  7. 进度显示：每完成 1 行（100 次积分）打印 `[进度] row {y+1}/100, 耗时 {elapsed:.1f}s`
- **输入来源**：`config.py` 的 `LYAPUNOV_GRID`、`FIXED_PARAMS`、`INTEGRATION`
- **输出去向**：内存中的 100×100 NumPy 数组；参数组合数 10,000 × 单次积分约 100s（100s / 0.01s dt = 10,000 步 × Benettin 双轨） ≈ 总耗时约 3-6 小时（取决于 CPU）
- **失败行为**：单次 `estimate_lyapunov` 返回 NaN → `grid[y][x] = null`，不中断整体扫描

**步骤 2：构建 metadata → 计算 gridHash → 输出 JSON**

- **操作对象**：步骤 1 的 grid 数组 + metadata 字典
- **具体操作**：
  1. 构建完整 `metadata` 字典（排除 `gridHash` 字段）：

     ```python
     metadata_for_hash = {
         "type": "lyapunov_max",
         "paramX": {
             "name": "L₂/L₁",
             "symbol": "L_2/L_1",
             "min": LYAPUNOV_GRID["L2_L1_ratio"]["min"],
             "max": LYAPUNOV_GRID["L2_L1_ratio"]["max"],
             "steps": LYAPUNOV_GRID["L2_L1_ratio"]["points"],
             "unit": "",
         },
         "paramY": {
             "name": "θ₁",
             "symbol": "\\theta_1",
             "min": LYAPUNOV_GRID["theta1_init"]["min"],
             "max": LYAPUNOV_GRID["theta1_init"]["max"],
             "steps": LYAPUNOV_GRID["theta1_init"]["points"],
             "unit": "rad",
         },
         "fixedParams": {
             "m1": FIXED_PARAMS["m1"],
             "m2": FIXED_PARAMS["m2"],
             "L1": FIXED_PARAMS["L1"],
             "L2": L2_value,  // 由 L₁ × ratio 计算
             "omega1_0": 0.0,
             "omega2_0": 0.0,
             "g": FIXED_PARAMS["g"],
             "damping": FIXED_PARAMS["damping"],
             "integrationTime": INTEGRATION["total_time"],
             "dt": INTEGRATION["dt"],
         },
     }
     ```

  2. 调用 `compute_grid_hash(metadata_for_hash)` → `gridHash`（16 字符 hex）
  3. 将 `gridHash` 加入 metadata，导出完整 JSON：

     ```python
     output = {
         "metadata": { **metadata_for_hash, "gridHash": gridHash, "generatedAt": datetime.utcnow().isoformat() + "Z", "solverVersion": SOLVER_VERSION },
         "grid": grid_2d_list,  # NumPy → .tolist()，NaN → None
     }
     with open(OUTPUT_DIR / f"lyapunov_max-{gridHash}.json", "w") as f:
         json.dump(output, f, indent=2, ensure_ascii=False)
     ```

  4. 打印输出摘要：`[完成] 输出: lyapunov_max-{gridHash}.json, gridHash={gridHash}, 积分失败 {nan_count}/{total} 格点`
- **输入来源**：步骤 1 的 `grid` 数组 + 配置常量
- **输出去向**：`src/shared/data/lyapunov_max-{gridHash}.json`（约 80KB，100×100 浮点值 + metadata）
- **失败行为**：输出目录不存在 → `OUTPUT_DIR.mkdir(parents=True, exist_ok=True)` 自动创建

**阶段 A2：分岔图采样（bifurcation.py）**

**步骤 3：扫描控制参数 → 对每个参数值积分并采样局部极大值**

- **操作对象**：`config.BIFURCATION_SCAN` 和 `config.FIXED_PARAMS`
- **具体操作**：
  1. 读取扫描参数名和范围：`control_param = BIFURCATION_SCAN["control_param"]`，`control_values = np.linspace(min, max, points)` → 500 个参数值
  2. 对每个 `control_value`：
     a. 构建当前参数组合：`params = FIXED_PARAMS.copy(); params[control_param] = control_value`
     b. 设置初始状态：`y0 = [theta1_0, omega1_0, theta2_0, omega2_0]`
     c. 积分瞬态阶段：`solve_ivp(double_pendulum_ode, (0, transientTime), y0, args=(params,), method="RK45", rtol=1e-9, atol=1e-12)`，瞬态结束状态作为采样初始值，瞬态数据全部抛弃
     d. 积分采样阶段：从瞬态结束状态开始，继续积分 `sampleTime` 秒，记录每步的 `θ₂` 值
     e. 调用 `detect_local_maxima(theta2_series, order=5)` → 获取局部极大值列表
     f. 记录：`samples[i] = maxima_list.tolist()`
  3. 进度显示：每完成 50 个参数值打印 `[进度] {i+1}/{points}, 耗时 {elapsed:.1f}s`
- **输入来源**：`config.py` 的 `BIFURCATION_SCAN`、`FIXED_PARAMS`、`INTEGRATION`
- **输出去向**：内存中的 `samples: list[list[float]]`（500 个变长列表）；500 × (100s + 200s) / 0.01s = 15,000,000 积分步 → 总耗时约 30-60 分钟
- **失败行为**：某个参数值处积分发散 → `samples[i] = []`（空列表），不中断整体扫描

**步骤 4：构建 metadata → 计算 gridHash → 输出 JSON**

- **操作对象**：与步骤 2 类似，但使用 `BifurcationData` 的 metadata 结构
- **具体操作**：
  1. 构建 `metadata`（排除 `gridHash`）：`type: "bifurcation"`，`scannedParam`，`sampledVariable`（含全局 `min`/`max`），`fixedParams`
  2. 调用 `compute_grid_hash(metadata_for_hash)` → `gridHash`
  3. 计算 `sampledVariable.min` / `sampledVariable.max`：遍历 `samples` 中所有值，取全局最小值和最大值（忽略空数组）；若全部为空 → `min=0, max=1`（兜底）
  4. 导出 JSON 到 `bifurcation-{gridHash}.json`
- **输入来源**：步骤 3 的 `samples` 数据
- **输出去向**：`src/shared/data/bifurcation-{gridHash}.json`（约 200KB，取决于混沌区的数据量）
- **失败行为**：同步骤 2

**阶段 A3：一键运行（run_all.py）**

**步骤 5：串联执行全部预计算**

- **操作对象**：`lyapunov_spectrum.py` 和 `bifurcation.py` 的 `main()` 函数
- **具体操作**：
  ```python
  # run_all.py
  import subprocess
  import sys
  from config import OUTPUT_DIR

  def main():
      scripts = [
          ["lyapunov_spectrum.py", "--type", "lyapunov_max"],
          ["bifurcation.py"],
      ]
      for args in scripts:
          print(f"\n{'='*60}\n运行: {' '.join(args)}\n{'='*60}")
          result = subprocess.run([sys.executable] + args, cwd=Path(__file__).parent)
          if result.returncode != 0:
              print(f"[失败] {' '.join(args)} 返回码: {result.returncode}", file=sys.stderr)
              sys.exit(1)
      print(f"\n全部预计算完成。输出目录: {OUTPUT_DIR}")
  ```
- **输入来源**：命令行无参数（使用默认配置）
- **输出去向**：`stdout` 进度日志；`src/shared/data/` 下的 JSON 文件
- **失败行为**：任一脚本返回非 0 → 立即终止（`sys.exit(1)`），不继续后续脚本

#### Part B：前端预计算缓存加载层

**阶段 B1：IndexedDB 缓存层（precomputeCache.ts）**

**步骤 6：IndexedDB 初始化和读写操作**

- **操作对象**：`indexedDB.open("chaos-pendulum-cache", 1)` 的 `precompute` object store
- **具体操作**：
  1. **打开数据库**：
     ```typescript
     function openCacheDB(): Promise<IDBDatabase> {
       return new Promise((resolve, reject) => {
         const request = indexedDB.open("chaos-pendulum-cache", 1);
         request.onupgradeneeded = () => {
           const db = request.result;
           if (!db.objectStoreNames.contains("precompute")) {
             db.createObjectStore("precompute", { keyPath: "cacheKey" });
           }
         };
         request.onsuccess = () => resolve(request.result);
         request.onerror = () => reject(request.error);
       });
     }
     ```

  2. **读取缓存**（`getCachedData(cacheKey)`）：
     - 打开 DB → 创建事务（`readonly`）→ `store.get(cacheKey)` → 返回 `PrecomputeCacheEntry | undefined`
     - 命中时递增 `hitCount`：`store.put({ ...entry, hitCount: entry.hitCount + 1 })`

  3. **写入缓存**（`setCachedData(cacheKey, data)`）：
     - 打开 DB → 创建事务（`readwrite`）→ 计算 `size = new TextEncoder().encode(JSON.stringify(data)).length`
     - 检查 LRU 容量：若当前条目数 ≥ 10（`MAX_ENTRIES`），淘汰 `cachedAt` 最旧的条目（`store.delete(oldestKey)`）
     - 写入新条目：`store.put({ cacheKey, data, size, cachedAt: new Date().toISOString(), hitCount: 0 })`

  4. **清除所有缓存**（`clearPrecomputeCache()`）：`store.clear()`
- **输入来源**：`cacheKey` 字符串 + `data` 对象
- **输出去向**：IndexedDB `precompute` object store
- **失败行为**：
  - IndexedDB 不可用（隐私模式、存储配额超限）→ 所有操作静默降级：`getCachedData` 返回 `undefined`，`setCachedData` 跳过写入。通过 `indexedDBAvailable` 标志位记录，Console 不警告（隐私模式是合法的用户选择）

**步骤 7：数据 fetch + 校验 + 缓存（loadPrecomputeData 函数）**

- **操作对象**：网络请求 + JSON 解析 + 数据校验 + IndexedDB 写入
- **具体操作**：
  ```typescript
  async function loadPrecomputeData<T>(
    input: UsePrecomputeDataInput
  ): Promise<PrecomputeDataState<T>> {
    const {
      dataType, dataUrl, expectedGridHash, expectedType,
      expectedSolverVersion = SOLVER_VERSION,
      fetchTimeoutMs = 10000, maxRetries = 3, retryBaseMs = 1000,
    } = input;

    const cacheKey = `${dataType}-${expectedGridHash}`;

    // 1. 尝试 IndexedDB 缓存
    try {
      const cached = await getCachedData(cacheKey);
      if (cached) {
        return {
          status: "ready", data: cached.data as T,
          errorMessage: null, errorCode: null, source: "cache", retry: () => loadPrecomputeData(input),
        };
      }
    } catch { /* IndexedDB 不可用，静默降级 */ }

    // 2. fetch + 重试
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), fetchTimeoutMs);

        const response = await fetch(dataUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const json = await response.json();

        // 3. 校验 metadata
        if (json.metadata?.type !== expectedType) {
          return errorState("PRECOMPUTE_FORMAT_ERROR", `期望类型 ${expectedType}，实际 ${json.metadata?.type}`);
        }
        if (json.metadata?.gridHash !== expectedGridHash) {
          return errorState("PRECOMPUTE_FORMAT_ERROR", `gridHash 不匹配：期望 ${expectedGridHash}，实际 ${json.metadata?.gridHash}`);
        }

        // 4. 版本校验（不阻止加载）
        if (json.metadata?.solverVersion !== expectedSolverVersion) {
          notify(translateError({
            code: "PRECOMPUTE_VERSION_MISMATCH",
            context: { expected: expectedSolverVersion, actual: json.metadata?.solverVersion ?? "未知" },
          }));
        }

        // 5. 写入缓存
        try {
          await setCachedData(cacheKey, json);
        } catch { /* IndexedDB 不可用，静默跳过 */ }

        return {
          status: "ready", data: json as T,
          errorMessage: null, errorCode: null, source: "network", retry: () => loadPrecomputeData(input),
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxRetries) {
          const delay = retryBaseMs * Math.pow(2, attempt);  // 指数退避：1s, 2s, 4s
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }

    // 6. 所有重试失败
    return errorState("PRECOMPUTE_FETCH_FAILED", lastError?.message ?? "未知错误");
  }

  function errorState(code: ErrorCode, message: string): PrecomputeDataState<T> {
    notify(translateError({ code, context: { reason: message } }));
    return {
      status: "error", data: null, errorMessage: message, errorCode: code, source: null,
      retry: () => loadPrecomputeData(input),
    };
  }
  ```
- **输入来源**：`UsePrecomputeDataInput` 参数
- **输出去向**：`PrecomputeDataState` 对象
- **失败行为**：fetch 超时（10s）→ 触发 AbortController → 进入重试逻辑（指数退避 1s/2s/4s）；3 次全失败 → error 状态 + 通知 SYS-02

**步骤 8：usePrecomputeData React Hook**

- **操作对象**：React 组件（ANL-01、ANL-02 中调用）
- **具体操作**：
  ```typescript
  function usePrecomputeData<T>(input: UsePrecomputeDataInput): PrecomputeDataState<T> {
    const [state, setState] = useState<PrecomputeDataState<T>>({
      status: "idle", data: null, errorMessage: null, errorCode: null, source: null,
      retry: () => {},
    });

    useEffect(() => {
      if (!input.enabled) return;
      setState(s => ({ ...s, status: "loading", errorMessage: null, errorCode: null }));
      let cancelled = false;

      loadPrecomputeData<T>(input).then(result => {
        if (!cancelled) setState(result);
      });

      return () => { cancelled = true; };
    }, [input.dataUrl, input.expectedGridHash, input.enabled]);

    // 将 retry 绑定到当前 input 的重新加载
    const retry = useCallback(() => {
      setState(s => ({ ...s, status: "loading", errorMessage: null, errorCode: null }));
      loadPrecomputeData<T>(input).then(setState);
    }, [input.dataUrl, input.expectedGridHash]);

    return { ...state, retry };
  }
  ```
- **输入来源**：React 组件的 props/state 传入 `UsePrecomputeDataInput`
- **输出去向**：`PrecomputeDataState` 对象（含 `retry`），组件根据 `status` 渲染不同 UI
- **失败行为**：组件在 fetch 完成前卸载 → `cancelled` 标志阻止 `setState`（避免 "setState on unmounted component" warning）

#### Part C：Vite 构建集成

**步骤 9：JSON 文件作为静态资源构建**

- **操作对象**：Vite 的静态资源处理
- **具体操作**：
  1. JSON 文件放在 `src/shared/data/` 下（与 `scripts/precompute/` 输出的目标一致）
  2. Vite 构建时自动将 `src/shared/data/*.json` 作为静态资源拷贝到 `dist/assets/`，文件名附加内容 hash（如 `lyapunov_max-a1b3f2e8-[contenthash].json`）
  3. 前端 ANL-01/ANL-02 通过以下方式之一获取正确的构建产物 URL：
     - **方式 A（推荐）**：`const dataUrl = new URL('../../shared/data/lyapunov_max-a1b3f2e8.json', import.meta.url).href;`（Vite 自动处理 hash）
     - **方式 B**：`import dataUrl from '@/shared/data/lyapunov_max-a1b3f2e8.json?url';`（`?url` 后缀返回文件 URL 而非解析的 JSON）
  4. 在 `vite.config.ts` 中无需额外配置——Vite 默认处理 JSON 文件和 `new URL()` 模式
- **输入来源**：`src/shared/data/*.json` 文件
- **输出去向**：`dist/assets/` 下的带 hash 的 JSON 文件
- **失败行为**：JSON 文件不存在（预计算脚本尚未运行）→ Vite build 成功但运行时 `fetch()` 返回 404 → `usePrecomputeData` 的 error 状态处理

### 依赖与集成接口

| 依赖方 | 具体接口 | 用途 |
|--------|----------|------|
| Python 脚本 | `numpy.linspace`、`scipy.integrate.solve_ivp`、`hashlib.sha256` | 参数网格生成、ODE 积分、gridHash 计算 |
| Python 脚本 | `json.dump`、`pathlib.Path`、`argparse` | JSON 序列化、文件输出、命令行参数解析 |
| 浏览器 API | `fetch()` | 加载 JSON 文件 |
| 浏览器 API | `indexedDB.open()` | 预计算数据缓存读写 |
| 浏览器 API | `crypto.subtle.digest("SHA-256", ...)` | 前端校验 gridHash（可选，与 metadata 中的 gridHash 比对） |
| Vite | `new URL('...', import.meta.url)` | 静态资源导入，获取构建产物 URL |
| React | `useState`、`useEffect`、`useCallback` | `usePrecomputeData` hook 的实现 |
| SYS-02 | `notify()`、`translateError()` | 加载失败、版本不匹配时的用户通知 |

**对外暴露的公共接口（供其他模块消费）**：

| 消费方模块 | 调用方式 | 消费的数据/功能 |
|-----------|---------|---------------|
| ANL-01 李雅普诺夫指数谱 | `const { status, data, retry } = usePrecomputeData<LyapunovGrid>({ dataType: "lyapunov_max", dataUrl, expectedGridHash, expectedType: "lyapunov_max" })` | 加载 `LyapunovGrid` JSON，获取热力图数据 |
| ANL-02 参数空间分岔图 | `const { status, data, retry } = usePrecomputeData<BifurcationData>({ dataType: "bifurcation", dataUrl, expectedGridHash, expectedType: "bifurcation" })` | 加载 `BifurcationData` JSON，获取分岔采样数据 |
| ANL-01 图层切换 | `usePrecomputeData<LyapunovGrid>({ dataType: "lyapunov_min", ... })` | 切换到不同 Lyapunov 图层时重新加载对应 JSON |
| 开发者 | `python scripts/precompute/run_all.py` | 一键运行全部预计算脚本 |
| 开发者 | `python scripts/precompute/lyapunov_spectrum.py --type lyapunov_max --output src/shared/data/` | 单独运行 Lyapunov 谱扫描 |
| 开发者 | `python scripts/precompute/bifurcation.py --control-param theta1 --output src/shared/data/` | 单独运行分岔图采样 |

### 状态机

#### Part A：Python 脚本执行状态

| 当前状态 | 触发事件 | 下一状态 | 前置条件 | 副作用 |
|----------|----------|----------|----------|--------|
| `idle` | `python run_all.py` 执行 | `running` | 脚本文件存在，Python ≥ 3.11，依赖已安装 | 开始参数网格扫描 |
| `running` | 扫描完成（全部格点已计算） | `outputting` | `grid` 或 `samples` 数组构建完毕 | 打印进度日志 |
| `outputting` | JSON 序列化 + 写入文件完成 | `done` | `OUTPUT_DIR` 可写 | 输出 `lyapunov_max-{hash}.json` 和/或 `bifurcation-{hash}.json`；打印完成摘要 |
| `running` | 单步积分失败（NaN） | `running` | — | `grid[y][x] = null` 或 `samples[i] = []`；错误计数器 +1 |
| `running` | 致命错误（Python 异常） | `failed` | — | 打印 traceback；`sys.exit(1)` |
| 任意 | `KeyboardInterrupt`（Ctrl+C） | `interrupted` | — | 打印已完成的进度；`sys.exit(130)` |

#### Part B：前端加载器状态

| 当前状态 | 触发事件 | 下一状态 | 前置条件 | 副作用 |
|----------|----------|----------|----------|--------|
| `idle` | 组件挂载 + `enabled === true` | `loading` | `dataUrl` 和 `expectedGridHash` 已提供 | 开始 fetch |
| `loading` | IndexedDB 缓存命中 | `ready` | 缓存数据 `metadata.type` 和 `gridHash` 匹配 | `source = "cache"`；递增 `hitCount` |
| `loading` | fetch 成功 + 校验通过 | `ready` | JSON schema 校验通过；`type` 和 `gridHash` 匹配 | `source = "network"`；写入 IndexedDB；通知版本不匹配（如 `solverVersion` 不一致） |
| `loading` | fetch 失败 + 仍有重试次数 | `loading` | `attempt < maxRetries` | 等待 `retryBaseMs * 2^attempt` 后重新 fetch |
| `loading` | fetch 失败 + 重试耗尽 | `error` | `attempt >= maxRetries` | `errorCode = "PRECOMPUTE_FETCH_FAILED"`；通过 SYS-02 通知用户 |
| `loading` | JSON 校验失败 | `error` | — | `errorCode = "PRECOMPUTE_FORMAT_ERROR"`；通过 SYS-02 通知用户 |
| `loading` | 组件卸载 | — | — | `cancelled = true`；中止中的 fetch（如可能） |
| `error` | 用户点击"重试"或调用 `retry()` | `loading` | — | 清除 `errorMessage` 和 `errorCode`；重置重试计数；重新执行 fetch + 缓存逻辑 |

### 异常与边界条件

#### 异常 1：Python 预计算脚本运行时间过长（评审交付截止前）

- **触发条件**：`lyapunov_spectrum.py` 完成 100×100 = 10,000 次 Benettin 双轨积分，预估耗时 3-6 小时（取决于 CPU），但评审交付截止时间 < 2 小时
- **处理策略**：
  1. 提供 `--quick` 命令行选项：`python lyapunov_spectrum.py --quick` 将网格分辨率从 100×100 降至 40×40（1,600 次积分，约 0.5-1 小时）
  2. 提供 `--grid-points` 参数手动指定分辨率：`--grid-points 50`（50×50 = 2,500 次）
  3. 提供 `--resume` 断点续行：脚本每完成 1 行（100 次积分）写入 1 行到临时文件 `lyapunov_max-{gridHash}.partial.json`，中断后可用 `--resume` 跳过已完成的格点
  4. 在 README 中明确标注不同分辨率下的预估耗时
- **重试参数**：不适用。方法 3（断点续行）是缓解措施。

#### 异常 2：预计算 JSON 文件过大导致 fetch 超时

- **触发条件**：分岔图 JSON（500 个参数值 × 混沌区可能每个 50+ 极大值 = 25,000+ 浮点值 + metadata），序列化后可能 > 500KB，在慢速网络（如 3G 移动热点）上 fetch > 10 秒
- **处理策略**：
  1. `fetchTimeoutMs` 默认 10s，可通过 props 调整为 15s 或 30s
  2. 首次加载后写入 IndexedDB，后续访问 0ms（纯本地读取）。首次加载的等待时间可通过加载动画（Skeleton）缓解用户感知
  3. 不采用 gzip 或压缩（JSON 文本压缩率约 60-70%，但浏览器需解压逻辑，增加复杂度；权衡后保持纯 JSON）
- **重试参数**：指数退避 1s/2s/4s，最多 3 次。`fetchTimeoutMs` 每次重试完整重置。

#### 异常 3：IndexedDB 存储配额超限（预计算缓存写入失败）

- **触发条件**：浏览器 IndexedDB 配额已用完（Firefox 默认 ~2GB，Chrome ~60% 磁盘剩余空间），`setCachedData` 的 `store.put()` 抛出 `QuotaExceededError`
- **处理策略**：
  1. 捕获 `QuotaExceededError`
  2. 尝试 LRU 淘汰：删除最旧的 5 条缓存条目（按 `cachedAt`），重试 `put`
  3. 若仍失败 → 放弃写入，设置 `indexedDBAvailable = false`，后续所有 `setCachedData` 跳过
  4. 不影响数据使用（`loadPrecomputeData` 仍能成功返回 `data`，只是不缓存）
  5. Console 记录 `"[precomputeCache] IndexedDB 写入失败，已切换至无缓存模式"`
- **重试参数**：LRU 淘汰后重试 1 次。不反复重试。

#### 异常 4：Python 和 TypeScript 的 gridHash 计算不一致

- **触发条件**：Python `json.dumps(metadata, sort_keys=True)` 和 TypeScript `JSON.stringify(metadata, Object.keys(metadata).sort())` 在浮点数序列化精度、Unicode 转义、空白字符处理上的微小差异，导致同一 grid 产生不同 hash
- **处理策略**：
  1. Python 端固定 `json.dumps(metadata_dict, sort_keys=True, ensure_ascii=True, separators=(',', ':'))`——紧凑 JSON（无空白）+ ASCII 转义
  2. TypeScript 端的 `computeGridHash` 函数复制 Python 的序列化逻辑：先手写 `canonicalJson(obj)` 函数确保 `sort_keys=True` 和 `ensure_ascii=True` 的行为一致，再传入 `crypto.subtle.digest`
  3. **前端不自行计算 gridHash 用于校验**（减少不一致风险）。前端直接比较 `data.metadata.gridHash === expectedGridHash`（两段字符串比较，`expectedGridHash` 由 ANL-01/ANL-02 从预计算的已知 hash 硬编码或从文件名提取）
  4. 在 CI 中增加自动化测试：Python 脚本输出 JSON 后，TypeScript 端 `computeGridHash` 对同一 metadata 计算 hash，断言两者一致
- **重试参数**：不适用。预防性措施。

#### 异常 5：预计算 JSON 文件的 `sampledVariable.min/max` 因数据全部为空而产生无效值

- **触发条件**：`bifurcation.py` 扫描的所有 500 个参数值处仿真均发散（`samples` 全部为空数组 `[]`），`sampledVariable.min` 和 `sampledVariable.max` 无法从数据中提取
- **处理策略**：
  1. Python 脚本检测：若 `all(len(s) == 0 for s in samples)` → `sampledVariable.min = 0`，`sampledVariable.max = 1`（兜底值），并在 stdout 打印警告
  2. 输出的 JSON 仍然有效（ANL-02 检测到 `samples` 全空 → 显示"所有参数值处仿真均发散"占位文本）
- **重试参数**：不适用。这是数据问题（参数组合导致全局发散），不是代码 bug。用户需要修改 `FIXED_PARAMS` 后重新运行脚本。

### 原则兑现清单

| 原则来源 | 原则名称 | 代码级约束 |
|----------|----------|------------|
| 技术栈设计 §4.9 | 预计算管线分离 | Python 脚本独立于前端构建流程（手动触发），输出 JSON 作为静态资源由 Vite 打包。数据生成与消费完全解耦 |
| 技术栈设计 §5.3 | IndexedDB 缓存 + LRU 淘汰 | `precomputeCache.ts` 实现 `MAX_ENTRIES = 10`、LRU 以 `cachedAt` 排序淘汰、`hitCount` 辅助指标 |
| 技术栈设计 §5.3 | 缓存键 = `{type}-{gridHash}` | `cacheKey` 格式固定；`gridHash` 由 SHA-256 前 16 字符 hex 确保唯一性；参数变更 → hash 变更 → 新缓存键 |
| 功能设计_v0 §四 4.1 | 预计算 100×100 网格 | `LyapunovGrid` 固定 `steps: 100`；`bifurcation` 固定 `points: 500` |
| 功能设计_v0 §九 | 优雅降级 | 预计算数据加载失败 → 提示"离线模式：高级分析功能需预计算数据支持"，保留实时仿真；不阻塞整个应用 |
| ANL-01 §263 | IndexedDB 不可用不提示用户 | 隐私模式下静默跳过缓存，`console.warn` 仅一次，不弹出 Toast 打扰用户 |
| ANL-02 §443 | 禁止浏览器内实时积分分岔图 | 所有数据分析数据来自离线预计算 JSON。前端不做任何 ODE 积分计算。`loadPrecomputeData` 仅 fetch JSON，不创建 Worker 或调用 Pyodide |
| CLAUDE.md 核心原则 | 零后端 | 所有数据流为：Python 脚本（本地离线）→ JSON 文件（静态资源）→ fetch + IndexedDB（浏览器端）。无服务端 API、无数据库 |

### 验收测试场景

#### 正向测试 1：Python Lyapunov 脚本成功输出合法 JSON

- **Given**：
  - Python 3.11+ 环境，已安装 numpy、scipy
  - 终端当前目录为项目根目录 `chaos-pendulum/`
- **When**：
  ```bash
  python scripts/precompute/lyapunov_spectrum.py --type lyapunov_max --output src/shared/data/
  ```
- **Then**：
  - `src/shared/data/lyapunov_max-{gridHash}.json` 文件被创建
  - JSON 文件包含 `metadata` 对象（`type: "lyapunov_max"`, `paramX`, `paramY`, `fixedParams`, `gridHash`, `generatedAt`, `solverVersion`）和 `grid` 数组
  - `grid` 为 100×100 的二维数组（`grid.length === 100`, `grid[0].length === 100`）
  - `gridHash` 为 16 字符小写 hex（匹配 `^[a-f0-9]{16}$`）
  - `generatedAt` 为合法的 ISO 8601 时间戳
  - `solverVersion` 为 `"1.0.0"`
  - stdout 包含 `[完成]` 摘要行，显示 gridHash 和积分失败格点计数

#### 正向测试 2：前端 usePrecomputeData 从 IndexedDB 缓存加载

- **Given**：
  - IndexedDB `precompute` store 中已存在 `lyapunov_max-a1b3f2e8` 条目（之前已 fetch 并缓存）
  - ANL-01 组件挂载，调用 `usePrecomputeData({ dataType: "lyapunov_max", dataUrl: "...", expectedGridHash: "a1b3f2e8", expectedType: "lyapunov_max" })`
- **When**：组件渲染
- **Then**：
  - `status` 从 `"idle"` → `"loading"` → `"ready"`（< 10ms 内完成，因为仅读取 IndexedDB）
  - `source` 为 `"cache"`
  - `data.metadata.gridHash` 为 `"a1b3f2e8"`
  - 未发起 `fetch()` 网络请求（`Network` DevTools 面板中无此 URL 的请求）
  - IndexedDB 中该条目的 `hitCount` 递增 1

#### 正向测试 3：分岔图 run_all.py 一键运行成功

- **Given**：
  - Python 3.11+ 环境正常
  - `src/shared/data/` 目录为空
- **When**：
  ```bash
  python scripts/precompute/run_all.py
  ```
- **Then**：
  - `lyapunov_max-{hash}.json` 和 `bifurcation-{hash}.json` 均被创建
  - 两个文件的 `metadata.solverVersion` 均为 `"1.0.0"`
  - `run_all.py` 返回码为 `0`
  - stdout 包含 `全部预计算完成。输出目录: ...`
  - 分岔图 JSON 的 `samples` 数组长度为 500（= `BIFURCATION_SCAN["control_points"]`）

#### 异常测试 1：fetch 失败 → 重试 → 最终 error 状态

- **Given**：
  - 模拟网络故障：Mock `fetch()` 始终返回 `throw new TypeError("Failed to fetch")`
  - `maxRetries = 3`，`retryBaseMs = 100`（加速测试）
- **When**：ANL-01 组件挂载，调用 `usePrecomputeData({ ... })`
- **Then**：
  - 首次 fetch 失败 → 等待 100ms → 第 1 次重试失败 → 等待 200ms → 第 2 次重试失败 → 等待 400ms → 第 3 次重试失败
  - 最终 `status` 为 `"error"`
  - `errorCode` 为 `"PRECOMPUTE_FETCH_FAILED"`
  - `errorMessage` 包含原始错误信息（`"Failed to fetch"`）
  - `source` 为 `null`
  - SYS-02 的 `notify()` 被调用（Toast 显示"预计算数据加载失败"）
  - 总耗时 ≈ 100+200+400 = 700ms（不含 fetch 本身的 timeout）

#### 异常测试 2：JSON 校验失败 → 直接 error（不重试）

- **Given**：
  - `fetch()` 返回 HTTP 200，但 JSON 的 `metadata.type` 为 `"unknown_type"`（不是期望的 `"lyapunov_max"`）
- **When**：`loadPrecomputeData({ expectedType: "lyapunov_max", ... })` 解析响应
- **Then**：
  - 不触发重试（校验失败是一次性的，重试不会改变结果）
  - `status` 直接为 `"error"`
  - `errorCode` 为 `"PRECOMPUTE_FORMAT_ERROR"`
  - IndexedDB 中不写入此无效数据
  - SYS-02 Toast 显示"预计算数据格式错误：期望类型 lyapunov_max，实际 unknown_type"

#### 异常测试 3：IndexedDB 写入失败 → 降级为无缓存模式但不影响数据使用

- **Given**：
  - Mock `indexedDB.open()` 的 `store.put()` 抛出 `DOMException: QuotaExceededError`
  - `fetch()` 正常返回合法 JSON
- **When**：首次加载 `usePrecomputeData({ ... })`（数据不在缓存中）
- **Then**：
  - `status` 为 `"ready"`（数据仍成功加载！）
  - `source` 为 `"network"`（非 `"cache"`）
  - `data` 包含完整的 `LyapunovGrid` 对象
  - Console 记录 `"[precomputeCache] IndexedDB 写入失败，已切换至无缓存模式"`
  - 后续调用 `usePrecomputeData` → 不再尝试 IndexedDB 读取（跳过缓存检查，直接 fetch）
  - 用户体验无损（仅二次加载无法享受缓存加速）

#### 异常测试 4：Python 脚本输出目录不存在

- **Given**：
  - `src/shared/data/` 目录被手动删除
- **When**：
  ```bash
  python scripts/precompute/lyapunov_spectrum.py --output src/shared/data/
  ```
- **Then**：
  - 脚本自动创建 `src/shared/data/` 目录（`OUTPUT_DIR.mkdir(parents=True, exist_ok=True)`）
  - JSON 文件成功写入
  - 返回码为 `0`
  - 不抛出 `FileNotFoundError`

### 注意事项与禁止行为

1. **【gridHash 是缓存的唯一键】** 任何预计算参数的变更（网格范围、步数、fixedParams 值）都会导致 gridHash 变化。旧 hash 的 IndexedDB 缓存不会被自动清理——仅在 LRU 淘汰时被移除。如果参数频繁变更（如调试阶段），IndexedDB 中可能累积过期条目。开发者可调用 `clearPrecomputeCache()` 手动清理，或在调试面板（Ctrl+Shift+D）中的"缓存"tab 提供"清空预计算缓存"按钮。

2. **【Python 脚本不在 CI 中运行】** 预计算脚本耗时 3-6 小时（Lyapunov）+ 0.5-1 小时（Bifurcation），不在 GitHub Actions 中执行。CI 仅做：1) 检查 Python 脚本语法（`python -m py_compile *.py`）；2) 运行 `--dry-run` 验证配置合法性；3) 校验 `src/shared/data/` 中已提交的 JSON 文件结构合法性（schema 校验）。

3. **【禁止在 ANL-01/ANL-02 中直接操作 IndexedDB】** 所有 IndexedDB 读写必须通过 `precomputeCache.ts` 暴露的函数：`getCachedData()`、`setCachedData()`、`clearPrecomputeCache()`。禁止在 ANL-01 中 `indexedDB.open()` + `store.get()`。统一入口确保 LRU 淘汰、错误处理、隐私模式降级的一致性。

4. **【禁止修改已发布的 JSON schema 的必需字段】** `LyapunovGrid.metadata` 和 `BifurcationData.metadata` 的字段结构一旦发布，新增字段只能通过 `metadata` 中新增可选字段的方式（`?.`访问），禁止删除或重命名已有字段。这确保旧版本 JSON（已缓存在 IndexedDB 中）仍能被校验通过（`solverVersion` 不匹配仅 warning，不阻止加载）。

5. **【Python 脚本的积分公式必须与 SIM-01 Worker 的 ODE 一致】** `common.py` 中的 `double_pendulum_ode()` 函数实现的拉格朗日方程推导必须与 `SIM-01` 的 `rk4.ts` / `rk45.ts` 中的 `odeRhs()` 函数完全一致。公式出现分歧 → Lyapunov 谱/分岔图基于的物理规律与实时仿真不同 → 分析结果与 3D 场景行为不一致。**验证方法**：对相同的参数和初始条件，Python `solve_ivp` 输出和 TypeScript `rk4Step` 输出在 1s 内的轨迹误差 < 1e-6。

6. **【禁止在 `loadPrecomputeData` 中使用 `response.json()` 替代流式解析】** 预计算 JSON 文件大小 ≤ 500KB，`response.json()` 一次性解析在内存和性能上均可接受。不需要 `ReadableStream` 流式解析（增加代码复杂度且无实际收益）。

7. **【易错点】** Vite 的 `new URL('...', import.meta.url)` 在构建时静态分析。URL 的路径必须是字符串字面量（不能是运行时拼接的动态字符串）。例如 `new URL(\`../../shared/data/lyapunov_max-${hash}.json\`, import.meta.url)` 中的 `${hash}` 动态变量**不会被 Vite 处理**（构建会失败或返回错误路径）。解决方案：在 `public/` 下放置 JSON 文件（`public/data/...`），通过绝对路径 `/data/lyapunov_max-a1b3f2e8.json` 直接 fetch（跳过 Vite 处理），或在 ANL-01/ANL-02 组件中硬编码所有可能的 `import.meta.url` 路径。

8. **【易错点】** Python `json.dump` 的 `indent=2` 会引入大量空白字符（每个文件约增加 20% 体积）。对 80KB LyapunovGrid：带 indent 约 100KB，不带 indent 约 65KB。建议在生产构建中使用 `separators=(',', ':')`（无空白），开发调试中使用 `indent=2`。通过 `--compact` CLI 标志切换。

9. **【偷懒红线】** 禁止在 ANL-01/ANL-02 的 catch 块中写 `console.error("数据加载失败")` + `setState({ error: true })`。必须：1) 调用 `notify(translateError({ code: "PRECOMPUTE_FETCH_FAILED", context: { reason: e.message } }))` 通过 SYS-02 统一通知；2) 设置 `errorCode` 字段（便于 SYS-02 的错误消息节流）；3) 提供重试按钮（调用 `retry()`）。这些处理已在 `loadPrecomputeData()` 中统一实现——ANL-01/ANL-02 只需消费 `usePrecomputeData` 的返回值。
