# 弹簧摆模板
# 将刚性杆替换为弹簧连接（引入弹性系数 k）
import numpy as np

def equations(t, state, params):
    """自定义运动方程。state = [theta1, omega1, theta2, omega2]"""
    m1, m2 = params["m1"], params["m2"]
    L1, L2 = params["L1"], params["L2"]
    g = params["g"]
    k = params.get("k", 10.0)  # 弹簧劲度系数

    th1, om1, th2, om2 = state

    # TODO: 实现弹簧摆的 ODE 方程
    # 提示：将 L2 设为变量 L2(t) = L2_0 + (F/k)，其中 F 为杆上张力

    return np.array([om1, 0.0, om2, 0.0])

# system_params = {"m1": 1.0, "m2": 1.0, "L1": 1.0, "L2": 1.0, "g": 9.81, "k": 10.0}
