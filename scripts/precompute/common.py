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


# ---- 双摆 ODE 系统（与 SIM-01 derivatives.ts 公式一致）----

def double_pendulum_ode(t: float, y: np.ndarray, params: dict) -> np.ndarray:
    """双摆拉格朗日运动方程，与 SIM-01 rk4.ts/rk45.ts 的 odeRhs() 一致。

    参数:
        t: float           — 当前时间 (s)（自治系统不使用，但 solve_ivp 要求此签名）
        y: np.ndarray[4]   — 状态向量 [θ₁, ω₁, θ₂, ω₂]
        params: dict       — 物理参数字典，必须包含:
                              m1, m2: float — 质量 (kg)
                              L1, L2: float — 摆长 (m)
                              g: float      — 重力加速度 (m/s²)
                              damping: float — 阻尼系数 (1/s)

    返回:
        np.ndarray[4] — 导数 [ω₁, α₁, ω₂, α₂]
    """
    m1, m2 = params["m1"], params["m2"]
    L1, L2 = params["L1"], params["L2"]
    g = params["g"]
    d = params.get("damping", 0.0)

    theta1, omega1, theta2, omega2 = y
    delta = theta2 - theta1          # 与 SIM-01 一致: delta = t2 - t1

    sin_d = np.sin(delta)
    cos_d = np.cos(delta)

    # 分母（标准拉格朗日推导，与 SIM-01 公式一致）
    denom = m1 + m2 - m2 * cos_d * cos_d
    if abs(denom) < 1e-12:
        denom = np.sign(denom) * 1e-12

    # 角加速度（无阻尼部分）
    alpha1 = (
        m2 * L1 * omega1**2 * sin_d * cos_d
        + m2 * g * np.sin(theta2) * cos_d
        + m2 * L2 * omega2**2 * sin_d
        - (m1 + m2) * g * np.sin(theta1)
    ) / (L1 * denom)

    alpha2 = (
        -m2 * L2 * omega2**2 * sin_d * cos_d
        + (m1 + m2) * (g * np.sin(theta1) * cos_d - L1 * omega1**2 * sin_d - g * np.sin(theta2))
    ) / (L2 * denom)

    # 施加阻尼（与 SIM-01 一致：角加速度 = 无阻尼项 - 阻尼 × 角速度）
    return np.array([omega1, alpha1 - d * omega1, omega2, alpha2 - d * omega2])


# ---- Benettin 算法 Lyapunov 指数估计 ----

def estimate_lyapunov(
    params: dict,
    y0: np.ndarray,          # 初始状态 [θ₁, ω₁, θ₂, ω₂]
    total_time: float,       # 总仿真时长 (s)
    transient_time: float,   # 瞬态抛弃时间 (s)
    dt: float,               # 积分步长 (s)
    delta0: float = 1e-8,    # 初始扰动大小。默认：1e-8
) -> float:
    """使用 Benettin 算法估计最大 Lyapunov 指数。

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

    # 2. 扰动轨线：随机方向
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
    """检测时序数据中的所有局部极大值。

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
    """计算参数网格的 SHA-256 哈希（取前 16 个 hex 字符）。

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
