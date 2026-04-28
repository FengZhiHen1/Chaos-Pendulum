"""分岔图预计算脚本。

沿单一控制参数扫描，记录稳态后 θ₂ 的局部极大值集合，输出 JSON 数组。
"""

import json
import numpy as np
from config import BIFURCATION_SCAN, FIXED_PARAMS, INTEGRATION, OUTPUT_DIR
from common import integrate_trajectory, print_progress


def find_local_maxima(signal: np.ndarray) -> np.ndarray:
    """在一维信号中查找局部极大值。"""
    maxima = []
    for i in range(1, len(signal) - 1):
        if signal[i - 1] < signal[i] > signal[i + 1]:
            maxima.append(signal[i])
    return np.array(maxima)


def main():
    param_name = BIFURCATION_SCAN["control_param"]
    param_range = np.linspace(
        BIFURCATION_SCAN["control_range"][0],
        BIFURCATION_SCAN["control_range"][1],
        BIFURCATION_SCAN["control_points"],
    )
    transient = BIFURCATION_SCAN["transient_steps"]
    sample_steps = BIFURCATION_SCAN["sample_steps"]
    total_steps = transient + sample_steps

    data = []
    total = len(param_range)

    for i, param_val in enumerate(param_range):
        params = dict(FIXED_PARAMS)
        y0 = np.array([np.pi / 2, 0.0, np.pi / 2, 0.0])

        if param_name == "theta1":
            y0[0] = param_val
        elif param_name == "L2":
            params["L2"] = param_val

        traj = integrate_trajectory(
            y0,
            params,
            (0, total_steps * INTEGRATION["dt"]),
            INTEGRATION["dt"],
        )

        theta2_steady = traj[transient:, 3]  # θ₂ after transient
        maxima = find_local_maxima(theta2_steady)

        for m in maxima:
            data.append([float(param_val), float(m)])

        print_progress(i, total, "分岔图扫描")

    output = {
        "meta": {
            "type": "bifurcation",
            "control_param": param_name,
            "control_range": [float(param_range[0]), float(param_range[-1]), total],
            "fixed_params": FIXED_PARAMS,
        },
        "data": data,
    }

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUT_DIR / "bifurcation-default.json"
    with open(out_path, "w") as f:
        json.dump(output, f)

    print(f"分岔图数据已输出至 {out_path}")


if __name__ == "__main__":
    main()
