"""分岔图预计算脚本。

沿单一控制参数扫描，记录稳态后 θ₂ 的局部极大值集合，输出 JSON。

命令行用法：
  python bifurcation.py --output ../../src/shared/data/ --dry-run
  python bifurcation.py --control-param theta1 --output src/shared/data/
"""

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from scipy.integrate import solve_ivp

from config import BIFURCATION_SCAN, FIXED_PARAMS, INTEGRATION, OUTPUT_DIR, SOLVER_VERSION
from common import double_pendulum_ode, detect_local_maxima, compute_grid_hash


def build_argparser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="分岔图预计算")
    p.add_argument("--output", type=str, default=str(OUTPUT_DIR),
                   help="输出目录路径（默认：config.OUTPUT_DIR）")
    p.add_argument("--dry-run", action="store_true",
                   help="试运行，打印将扫描的参数序列但不实际积分")
    p.add_argument("--control-param", type=str,
                   default=BIFURCATION_SCAN["control_param"],
                   choices=["theta1", "theta2", "L1", "L2", "m1", "m2", "omega1_0", "omega2_0"],
                   help="扫描参数名（默认：config.BIFURCATION_SCAN['control_param']）")
    return p


# 控制参数 → 默认初始条件映射
CONTROL_PARAM_DEFAULTS = {
    "theta1": {"y0": np.array([0.0, 0.0, np.pi / 2, 0.0])},
    "theta2": {"y0": np.array([np.pi / 2, 0.0, 0.0, 0.0])},
    "L1": {"y0": np.array([np.pi / 2, 0.0, np.pi / 2, 0.0])},
    "L2": {"y0": np.array([np.pi / 2, 0.0, np.pi / 2, 0.0])},
    "m1": {"y0": np.array([np.pi / 2, 0.0, np.pi / 2, 0.0])},
    "m2": {"y0": np.array([np.pi / 2, 0.0, np.pi / 2, 0.0])},
    "omega1_0": {"y0": np.array([np.pi / 2, 0.0, np.pi / 2, 0.0])},
    "omega2_0": {"y0": np.array([np.pi / 2, 0.0, np.pi / 2, 0.0])},
}


def main():
    args = build_argparser().parse_args()
    output_dir = Path(args.output).resolve()
    control_param = args.control_param
    dt = INTEGRATION["dt"]
    transient_steps = BIFURCATION_SCAN["transient_steps"]
    sample_steps = BIFURCATION_SCAN["sample_steps"]
    transient_time = transient_steps * dt
    sample_time = sample_steps * dt
    total_time = transient_time + sample_time
    control_points = BIFURCATION_SCAN["control_points"]

    default_info = CONTROL_PARAM_DEFAULTS.get(
        control_param,
        {"y0": np.array([np.pi / 2, 0.0, np.pi / 2, 0.0])},
    )
    base_y0 = default_info["y0"].copy()

    control_range = BIFURCATION_SCAN["control_range"]
    control_values = np.linspace(control_range[0], control_range[1], control_points)
    param_name_map = {
        "theta1": "θ₁", "theta2": "θ₂",
        "L1": "L₁", "L2": "L₂",
        "m1": "m₁", "m2": "m₂",
        "omega1_0": "ω̇₁₀", "omega2_0": "ω̇₂₀",
    }

    if args.dry_run:
        print(f"[dry-run] 扫描参数: {control_param} ({param_name_map.get(control_param, control_param)})")
        print(f"[dry-run] 扫描范围: [{control_values[0]:.4f}, {control_values[-1]:.4f}]")
        print(f"[dry-run] 扫描点数: {control_points}")
        print(f"[dry-run] 瞬态抛弃: {transient_time:.1f}s ({transient_steps} 步 × {dt}s)")
        print(f"[dry-run] 稳态采样: {sample_time:.1f}s ({sample_steps} 步 × {dt}s)")
        print(f"[dry-run] 预估耗时: {control_points * 0.5:.0f}s（约 {control_points * 0.5 / 60:.1f}min，基于 0.5s/参数值）")
        return

    output_dir.mkdir(parents=True, exist_ok=True)
    samples = []
    t_start = time.perf_counter()

    for i, param_val in enumerate(control_values):
        # 构建当前参数组合
        params = dict(FIXED_PARAMS)
        # 防御：确保 L2 始终存在（ODE 必需）
        if "L2" not in params:
            params["L2"] = 1.0
        y0 = base_y0.copy()

        if control_param in ("theta1", "theta2"):
            idx = 0 if control_param == "theta1" else 2
            y0[idx] = param_val
        elif control_param in ("omega1_0", "omega2_0"):
            idx = 1 if control_param == "omega1_0" else 3
            y0[idx] = param_val
        elif control_param in params:
            params[control_param] = param_val
        else:
            print(f"[警告] 未知控制参数: {control_param}，跳过", file=sys.stderr)
            samples.append([])
            continue

        try:
            # 积分瞬态阶段
            sol_transient = solve_ivp(
                double_pendulum_ode,
                (0.0, transient_time),
                y0,
                args=(params,),
                method="RK45",
                rtol=1e-9,
                atol=1e-12,
                max_step=dt * 10,
            )
            if not sol_transient.success:
                samples.append([])
                continue

            y_steady = sol_transient.y[:, -1]

            # 积分采样阶段
            t_eval_sample = np.arange(0.0, sample_time, dt)
            sol_sample = solve_ivp(
                double_pendulum_ode,
                (0.0, sample_time),
                y_steady,
                args=(params,),
                t_eval=t_eval_sample,
                method="RK45",
                rtol=1e-9,
                atol=1e-12,
                max_step=dt * 10,
            )
            if not sol_sample.success:
                samples.append([])
                continue

            theta2_series = sol_sample.y[2, :]  # θ₂ 序列
            maxima = detect_local_maxima(theta2_series, order=5)
            samples.append(maxima.tolist())

        except Exception:
            samples.append([])

        # 每 50 个参数值打印进度
        if (i + 1) % 50 == 0 or i == 0:
            elapsed = time.perf_counter() - t_start
            print(f"[进度] {i + 1}/{control_points}, 耗时 {elapsed:.1f}s")

    # 计算全局 min/max
    all_values = [v for s in samples for v in s]
    if all_values:
        sampled_min = float(np.min(all_values))
        sampled_max = float(np.max(all_values))
    else:
        print("[警告] 所有参数值处仿真均发散，sampledVariable.min/max 使用兜底值 0/1")
        sampled_min = 0.0
        sampled_max = 1.0

    param_label = param_name_map.get(control_param, control_param)
    # 构建 metadata（不含 gridHash）
    metadata_for_hash = {
        "type": "bifurcation",
        "scannedParam": {
            "name": param_label,
            "symbol": f"\\{param_label}",
            "min": float(control_values[0]),
            "max": float(control_values[-1]),
            "steps": control_points,
            "unit": "rad" if control_param.startswith(("theta", "omega")) else "",
        },
        "sampledVariable": {
            "name": "θ₂ 局部极大值",
            "symbol": "\\theta_2\\ \\text{max}",
            "min": sampled_min,
            "max": sampled_max,
            "unit": "rad",
        },
        "fixedParams": {
            "m1": FIXED_PARAMS["m1"],
            "m2": FIXED_PARAMS["m2"],
            "L1": FIXED_PARAMS["L1"],
            "L2": FIXED_PARAMS.get("L2", 1.0),
            "theta1_0": float(base_y0[0]),
            "theta2_0": float(base_y0[2]),
            "omega1_0": float(base_y0[1]),
            "omega2_0": float(base_y0[3]),
            "g": FIXED_PARAMS["g"],
            "damping": FIXED_PARAMS["damping"],
            "transientTime": transient_time,
            "sampleTime": sample_time,
            "dt": dt,
        },
    }

    grid_hash = compute_grid_hash(metadata_for_hash)
    generated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    output = {
        "metadata": {
            **metadata_for_hash,
            "gridHash": grid_hash,
            "generatedAt": generated_at,
            "solverVersion": SOLVER_VERSION,
        },
        "samples": samples,
    }

    out_filename = f"bifurcation-{grid_hash}.json"
    out_path = output_dir / out_filename
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    empty_count = sum(1 for s in samples if len(s) == 0)
    print(f"\n[完成] 输出: {out_filename}, gridHash={grid_hash}, 空采样 {empty_count}/{control_points} 个参数值")
    return 0


if __name__ == "__main__":
    sys.exit(main())
