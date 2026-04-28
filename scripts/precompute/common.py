"""共享工具：双摆 ODE 系统、solve_ivp 封装、Benettin 算法、进度条。"""

import numpy as np
from scipy.integrate import solve_ivp
from typing import Callable


def double_pendulum_ode(t: float, y: np.ndarray, params: dict) -> np.ndarray:
    """双摆 ODE 系统，供 SciPy solve_ivp 调用。

    y = [theta1, omega1, theta2, omega2]
    """
    m1, m2 = params["m1"], params["m2"]
    L1, L2 = params["L1"], params["L2"]
    g = params["g"]
    damping = params.get("damping", 0.0)

    th1, om1, th2, om2 = y
    delta = th2 - th1

    denom1 = (m1 + m2) * L1 - m2 * L1 * np.cos(delta) ** 2
    denom2 = (m1 + m2) * L2 - m2 * L2 * np.cos(delta) ** 2

    alpha1 = (
        m2 * L1 * om1**2 * np.sin(delta) * np.cos(delta)
        + m2 * g * np.sin(th1) * np.cos(delta)
        + m2 * L2 * om2**2 * np.sin(delta)
        - (m1 + m2) * g * np.sin(th1)
    ) / denom1 - damping * om1

    alpha2 = (
        -m2 * L2 * om2**2 * np.sin(delta) * np.cos(delta)
        + (m1 + m2)
        * (
            g * np.sin(th1) * np.cos(delta)
            - L1 * om1**2 * np.sin(delta)
            - g * np.sin(th2)
        )
    ) / denom2 - damping * om2

    return np.array([om1, alpha1, om2, alpha2])


def integrate_trajectory(
    y0: np.ndarray,
    params: dict,
    t_span: tuple[float, float],
    dt: float,
) -> np.ndarray:
    """运行单次仿真，返回 [time, theta1, omega1, theta2, omega2] 数组。"""
    t_eval = np.arange(t_span[0], t_span[1], dt)
    sol = solve_ivp(
        double_pendulum_ode,
        t_span,
        y0,
        args=(params,),
        t_eval=t_eval,
        method="RK45",
        rtol=1e-9,
        atol=1e-12,
    )
    return np.vstack([sol.t, sol.y]).T


def estimate_lyapunov(
    y0: np.ndarray,
    params: dict,
    total_time: float,
    transient: float,
    dt: float,
) -> float:
    """用 Benettin 算法估计最大 Lyapunov 指数。"""
    d0 = 1e-8
    n_transient = int(transient / dt)

    # 基准轨线
    y = y0.copy()
    # 扰动轨线
    y_pert = y0.copy()
    y_pert[0] += d0

    divergence_sum = 0.0
    count = 0
    step = 0

    t_span = (0, dt)
    while step * dt < total_time:
        sol = solve_ivp(
            double_pendulum_ode, t_span, y, args=(params,), rtol=1e-9, atol=1e-12
        )
        y = sol.y[:, -1]

        sol_pert = solve_ivp(
            double_pendulum_ode,
            t_span,
            y_pert,
            args=(params,),
            rtol=1e-9,
            atol=1e-12,
        )
        y_pert = sol_pert.y[:, -1]

        if step >= n_transient:
            d = np.linalg.norm(y_pert - y)
            if d > 0:
                divergence_sum += np.log(d / d0)
                count += 1
            # 重归一化
            y_pert = y + d0 * (y_pert - y) / d

        step += 1

    return divergence_sum / (count * dt) if count > 0 else 0.0


def print_progress(current: int, total: int, label: str = ""):
    """简单命令行进度条。"""
    pct = (current + 1) / total * 100
    bar = "=" * int(pct // 2) + ">" + " " * (50 - int(pct // 2))
    print(f"\r{label} [{bar}] {pct:.1f}% ({current + 1}/{total})", end="")
    if current + 1 == total:
        print()
