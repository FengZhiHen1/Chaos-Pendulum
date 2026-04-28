"""Lyapunov 指数谱预计算脚本。

对 L₂/L₁ 比 × θ₁ 初始角的 100×100 参数网格，
用 Benettin 算法估计最大 Lyapunov 指数，输出 JSON 矩阵。
"""

import json
import numpy as np
from config import LYAPUNOV_GRID, FIXED_PARAMS, INTEGRATION, OUTPUT_DIR
from common import estimate_lyapunov, print_progress


def main():
    L2_L1_range = np.linspace(
        LYAPUNOV_GRID["L2_L1_ratio"]["min"],
        LYAPUNOV_GRID["L2_L1_ratio"]["max"],
        LYAPUNOV_GRID["L2_L1_ratio"]["points"],
    )
    theta1_range = np.linspace(
        LYAPUNOV_GRID["theta1_init"]["min"],
        LYAPUNOV_GRID["theta1_init"]["max"],
        LYAPUNOV_GRID["theta1_init"]["points"],
    )

    ny, nx = len(L2_L1_range), len(theta1_range)
    lyap_matrix = np.zeros((ny, nx))

    total = ny * nx
    for i, ratio in enumerate(L2_L1_range):
        for j, theta1 in enumerate(theta1_range):
            params = {**FIXED_PARAMS, "L2": ratio * FIXED_PARAMS["L1"]}
            y0 = np.array([theta1, 0.0, np.pi / 4, 0.0])

            lyap_matrix[i, j] = estimate_lyapunov(
                y0,
                params,
                INTEGRATION["total_time"],
                INTEGRATION["lyapunov_transient"],
                INTEGRATION["dt"],
            )

            print_progress(i * nx + j, total, "Lyapunov 谱扫描")

    output = {
        "meta": {
            "type": "lyapunov_spectrum",
            "L2_L1_ratio_range": [float(L2_L1_range[0]), float(L2_L1_range[-1]), ny],
            "theta1_range": [float(theta1_range[0]), float(theta1_range[-1]), nx],
            "fixed_params": FIXED_PARAMS,
        },
        "data": lyap_matrix.tolist(),
    }

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUT_DIR / "lyapunov-default.json"
    with open(out_path, "w") as f:
        json.dump(output, f)

    print(f"Lyapunov 谱已输出至 {out_path}")


if __name__ == "__main__":
    main()
