# 磁力摆模板
# 在双摆基础上加入模拟磁场洛伦兹力项
import numpy as np

def equations(t, state, params):
    """自定义运动方程。state = [theta1, omega1, theta2, omega2]"""
    m1, m2 = params["m1"], params["m2"]
    L1, L2 = params["L1"], params["L2"]
    g = params["g"]
    B = params.get("B", 1.0)    # 磁场强度
    q = params.get("q", 1.0)    # 等效电荷

    th1, om1, th2, om2 = state

    # TODO: 实现磁力摆的 ODE 方程
    # 提示：在加速度上添加洛伦兹力项 q * v × B 的广义力形式

    return np.array([om1, 0.0, om2, 0.0])

# system_params = {"m1": 1.0, "m2": 1.0, "L1": 1.0, "L2": 1.0, "g": 9.81, "B": 1.0, "q": 1.0}
