# 受迫摆模板
# 在双摆上施加周期性驱动力（受迫混沌）
import numpy as np

def equations(t, state, params):
    """自定义运动方程。state = [theta1, omega1, theta2, omega2]"""
    m1, m2 = params["m1"], params["m2"]
    L1, L2 = params["L1"], params["L2"]
    g = params["g"]
    F0 = params.get("F0", 1.0)         # 驱动力幅值
    omega_drive = params.get("omega_drive", 2.0)  # 驱动频率

    th1, om1, th2, om2 = state

    # TODO: 实现受迫摆的 ODE 方程
    # 提示：在 omega1 或 omega2 的导数上添加 F0 * cos(omega_drive * t) 项

    return np.array([om1, 0.0, om2, 0.0])

# system_params = {"m1": 1.0, "m2": 1.0, "L1": 1.0, "L2": 1.0, "g": 9.81, "F0": 1.0, "omega_drive": 2.0}
