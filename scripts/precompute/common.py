# ============================================================
# scripts/precompute/common.py
# 共享工具：双摆 ODE 系统定义、RKF45 Fehlberg 自定义积分器、
# Benettin 算法 Lyapunov 估计、局部极值检测、gridHash 计算。
#
# v2: 自实现 RKF45 (Fehlberg 4(5) 嵌入对) 替代 SciPy solve_ivp，
#     与 JS SIM-01 engine/integrators.ts 的 RKF45Integrator 完全一致。
# ============================================================

import hashlib
import json
import math
import numpy as np
from scipy.signal import argrelextrema
from typing import Callable


# ---- 双摆 ODE 系统（与 SIM-01 derivatives.ts 公式一致）----

def double_pendulum_ode(t: float, y: np.ndarray, params: dict) -> np.ndarray:
    """双摆拉格朗日运动方程，与 SIM-01 的 odeRhs() 一致。

    参数:
        t: float           — 当前时间 (s)（自治系统不使用）
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


# ---- RKF45 Fehlberg 4(5) 自定义积分器 ----
# Butcher 表系数与 JS engine/integrators.ts RKF45Integrator 完全一致

# Fehlberg 4(5) Butcher tableau
_A21 = 1.0 / 4.0
_A31, _A32 = 3.0 / 32.0, 9.0 / 32.0
_A41, _A42, _A43 = 1932.0 / 2197.0, -7200.0 / 2197.0, 7296.0 / 2197.0
_A51, _A52, _A53, _A54 = 439.0 / 216.0, -8.0, 3680.0 / 513.0, -845.0 / 4104.0
_A61, _A62, _A63, _A64, _A65 = (-8.0 / 27.0, 2.0, -3544.0 / 2565.0,
                                 1859.0 / 4104.0, -11.0 / 40.0)
# 5 阶权重 (b5*) — 用于状态推进
_B51, _B53, _B54, _B55, _B56 = (16.0 / 135.0, 6656.0 / 12825.0,
                                 28561.0 / 56430.0, -9.0 / 50.0, 2.0 / 55.0)
# 4 阶权重 (b4) — 用于误差估计
_B41, _B43, _B44, _B45 = 25.0 / 216.0, 1408.0 / 2565.0, 2197.0 / 4104.0, -1.0 / 5.0

RKF45_DEFAULT_TOL = 1e-7       # 与 JS RKF45Integrator 默认容差一致
RKF45_MIN_H = 1e-10            # 最小步长，低于此值回退 Euler


def _rkf45_substep(y: np.ndarray, h: float, params: dict,
                   f: Callable = double_pendulum_ode) -> tuple[np.ndarray, float]:
    """单步 RKF45（Fehlberg 嵌入 4(5) 对），返回 (y5, err)。

    与 JS RKF45Integrator.rkf45Substep() 完全一致。
    """
    k1 = f(0.0, y, params)

    tmp = y + h * _A21 * k1
    k2 = f(0.0, tmp, params)

    tmp = y + h * (_A31 * k1 + _A32 * k2)
    k3 = f(0.0, tmp, params)

    tmp = y + h * (_A41 * k1 + _A42 * k2 + _A43 * k3)
    k4 = f(0.0, tmp, params)

    tmp = y + h * (_A51 * k1 + _A52 * k2 + _A53 * k3 + _A54 * k4)
    k5 = f(0.0, tmp, params)

    tmp = y + h * (_A61 * k1 + _A62 * k2 + _A63 * k3 + _A64 * k4 + _A65 * k5)
    k6 = f(0.0, tmp, params)

    y4 = y + h * (_B41 * k1 + _B43 * k3 + _B44 * k4 + _B45 * k5)
    y5 = y + h * (_B51 * k1 + _B53 * k3 + _B54 * k4 + _B55 * k5 + _B56 * k6)

    err = float(np.max(np.abs(y5 - y4)))
    return y5, err


def rkf45_adaptive(y: np.ndarray, dt: float, params: dict,
                   tol: float = RKF45_DEFAULT_TOL) -> np.ndarray:
    """自适应步长 RKF45 积分一步 (dt)，原地更新 y。

    与 JS integratorStep → RKF45Integrator.adaptive() 完全一致。
    一次调用 = JS 侧 integratorStep(state, params, dt, "RKF45")。

    参数:
        y: np.ndarray[4] — 状态向量，原地更新
        dt: float         — 目标步长 (s)
        params: dict      — 物理参数
        tol: float        — 容差，默认 1e-7
    """
    direction = 1.0 if dt >= 0 else -1.0
    remaining = abs(dt)
    h = remaining
    prev_err = 1e-7

    while remaining > 1e-14:
        h = min(h, remaining)
        y_save = y.copy()

        y_new, err = _rkf45_substep(y, h * direction, params)

        if err < tol:
            remaining -= h
            y[:] = y_new
            prev_err = max(err, 1e-15)

            fac = min(5.0, 0.9 * (tol / prev_err) ** 0.2)
            h = min(remaining,
                    h * (min(fac, 3.0) if err < tol * 0.01 else fac))
        else:
            y[:] = y_save
            fac = max(0.1, 0.9 * (tol / max(err, 1e-15)) ** 0.2)
            h = h * fac
            if h < RKF45_MIN_H:
                # 步长坍缩 → Euler 回退（与 JS 一致）
                dy = double_pendulum_ode(0.0, y_save, params)
                y[:] = y_save + 1e-10 * direction * dy
                remaining -= 1e-10
                if remaining < 0:
                    remaining = 0.0
                break

    return y


# ---- Benettin 算法 Lyapunov 指数估计 ----
# v2: 自实现 RKF45 Fehlberg 替代 SciPy solve_ivp；
#     扰动策略与 JS ode-worker.ts 影子轨迹完全一致

def estimate_lyapunov(
    params: dict,
    y0: np.ndarray,          # 初始状态 [θ₁, ω₁, θ₂, ω₂]
    total_time: float,       # 总仿真时长 (s)
    transient_time: float,   # 瞬态抛弃时间 (s)。v2 与 JS 对齐 = 0
    dt: float,               # 积分步长 (s)。v2 与 JS 对齐 = 1/60
    delta0: float = 1e-8,    # 初始扰动大小。与 JS D0 = 1e-8 一致
    renorm_interval: int = 60,  # 重标定间隔（帧）。与 JS RENORM_INTERVAL 一致
) -> float:
    """使用 Benettin 算法估计最大 Lyapunov 指数。

    与 JS ode-worker.ts 影子轨迹（第 178-219 行）完全对齐：
      - RKF45 Fehlberg 4(5) 自实现积分器（tol = 1e-7）
      - 扰动仅施加于 theta1（+delta0 方向）
      - 每 renorm_interval 帧重标定一次
      - 4 维欧氏距离计算散度

    参数:
        params: dict            — 物理参数
        y0: np.ndarray[4]      — 初始状态 [θ₁, ω₁, θ₂, ω₂]
        total_time: float      — 总仿真时长 (s)
        transient_time: float  — 瞬态抛弃时长 (s)。v2 默认 0
        dt: float              — 积分步长 (s)。v2 默认 1/60
        delta0: float          — 初始扰动大小。默认 1e-8
        renorm_interval: int   — 重标定间隔帧数。默认 60（1s @60fps）

    返回:
        float — 估计的最大 Lyapunov 指数 λ_max
               NaN 表示积分失败/发散
    """
    # 1. 积分瞬态阶段（v2: transient_time = 0，此阶段为空操作）
    y_ref = y0.copy().astype(np.float64)
    if transient_time > 0:
        transient_steps = int(transient_time / dt)
        for _ in range(transient_steps):
            rkf45_adaptive(y_ref, dt, params)
            if np.isnan(y_ref).any():
                return float("nan")

    # 2. 扰动轨线：仅 theta1 +delta0（与 JS 完全一致）
    y_pert = y_ref.copy()
    y_pert[0] += delta0  # 仅 theta1 方向

    # 3. Benettin 迭代（与 JS ode-worker.ts 影子轨迹完全对齐）
    lyap_sum = 0.0
    total_steps = int(total_time / dt) if transient_time == 0 else \
                  int((total_time - transient_time) / dt)
    renorm_count = 0

    for step in range(total_steps):
        # 同时积分参考轨线和扰动轨线（使用相同 RKF45，dt = 1/60）
        rkf45_adaptive(y_ref, dt, params)
        rkf45_adaptive(y_pert, dt, params)

        # 检查 NaN
        if np.isnan(y_ref).any() or np.isnan(y_pert).any():
            return float("nan")

        # 每 renorm_interval 帧重标定一次（与 JS RENORM_INTERVAL = 60 一致）
        if (step + 1) % renorm_interval == 0:
            diff = y_pert - y_ref
            d = float(np.sqrt(np.sum(diff ** 2)))  # 四维欧氏距离
            if d > 0.0:
                lyap_sum += np.log(d / delta0)
                # 重新归一化：沿原方向缩回 delta0
                y_pert = y_ref + diff * (delta0 / d)
            renorm_count += 1

    if renorm_count == 0:
        return float("nan")

    # λ = Σ ln(d_i/D0) / (N × RENORM_INTERVAL × dt)
    # 与 JS: shadowLyapSum / (shadowLyapCount * RENORM_INTERVAL * dt) 一致
    return lyap_sum / (renorm_count * renorm_interval * dt)


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


# ---- JSON 安全序列化 ----

def sanitize_for_json(obj):
    """递归替换 float('nan')/inf/-inf 为 None，确保输出合法 JSON。

    Python 的 json.dump 默认 allow_nan=True，会将 NaN/Infinity
    输出为裸标识符，违反 RFC 8259。JavaScript 的 JSON.parse 拒绝这些 token。
    此函数在序列化前递归清洗所有非法浮点数。
    """
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    if isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [sanitize_for_json(v) for v in obj]
    return obj


def safe_json_dump(obj, fp, **kwargs):
    """json.dump 的安全封装：自动清洗 NaN/Infinity 并强制 allow_nan=False。"""
    clean = sanitize_for_json(obj)
    json.dump(clean, fp, allow_nan=False, **kwargs)
