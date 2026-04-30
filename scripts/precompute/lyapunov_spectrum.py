"""Lyapunov 指数谱预计算脚本。

对 L₂/L₁ 比 × θ₁ 初始角的参数网格，
用 Benettin 算法估计最大/最小 Lyapunov 指数，输出 JSON 矩阵。

命令行用法：
  python lyapunov_spectrum.py --output ../../src/shared/data/ --dry-run
  python lyapunov_spectrum.py --type lyapunov_max --output src/shared/data/
  python lyapunov_spectrum.py --quick
  python lyapunov_spectrum.py --grid-points 50
  python lyapunov_spectrum.py --resume
"""

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from config import LYAPUNOV_GRID, LYAPUNOV_DAMPING_RANGE, FIXED_PARAMS, INTEGRATION, OUTPUT_DIR, SOLVER_VERSION
from common import estimate_lyapunov, compute_grid_hash, safe_json_dump


def build_argparser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Lyapunov 指数谱预计算")
    p.add_argument("--output", type=str, default=str(OUTPUT_DIR),
                   help="输出目录路径（默认：config.OUTPUT_DIR）")
    p.add_argument("--dry-run", action="store_true",
                   help="试运行，打印将生成的参数网格但不实际积分")
    p.add_argument("--type", type=str, default="lyapunov_max",
                   choices=["lyapunov_max", "lyapunov_min", "energy_curvature"],
                   help="图层类型（默认：lyapunov_max）")
    p.add_argument("--quick", action="store_true",
                   help="快速模式：网格分辨率降至 40×40")
    p.add_argument("--grid-points", type=int, default=None,
                   help="手动指定网格点数（如 50 → 50×50）")
    p.add_argument("--resume", type=str, default=None,
                   help="断点续行：指定已有的 .partial.json 文件路径")
    p.add_argument("--damping", type=float, default=None,
                   help="指定单个阻尼值，生成该切片的预计算数据")
    p.add_argument("--damping-all", action="store_true",
                   help="遍历 LYAPUNOV_DAMPING_RANGE 生成全部阻尼切片")
    p.add_argument("--force", action="store_true",
                   help="强制重新计算已存在的文件（默认跳过已有文件）")
    return p


def main():
    args = build_argparser().parse_args()
    output_dir = Path(args.output).resolve()
    layer_type = args.type
    dt = INTEGRATION["dt"]
    total_time = INTEGRATION["total_time"]
    lyapunov_transient = INTEGRATION["lyapunov_transient"]

    # 确定网格分辨率
    if args.quick:
        grid_points = 40
    elif args.grid_points is not None:
        grid_points = max(10, min(200, args.grid_points))
    else:
        grid_points = LYAPUNOV_GRID["theta1_init"]["points"]

    # 确定阻尼值列表
    if args.damping_all:
        damping_values = np.linspace(
            LYAPUNOV_DAMPING_RANGE["min"],
            LYAPUNOV_DAMPING_RANGE["max"],
            LYAPUNOV_DAMPING_RANGE["steps"],
        ).tolist()
    elif args.damping is not None:
        damping_values = [float(args.damping)]
    else:
        damping_values = [FIXED_PARAMS.get("damping", 0.0)]

    # 生成扫描网格（网格结构不随阻尼变化）
    L2_L1_ratio_range = np.linspace(
        LYAPUNOV_GRID["L2_L1_ratio"]["min"],
        LYAPUNOV_GRID["L2_L1_ratio"]["max"],
        grid_points,
    )
    theta1_range = np.linspace(
        LYAPUNOV_GRID["theta1_init"]["min"],
        LYAPUNOV_GRID["theta1_init"]["max"],
        grid_points,
    )

    ny, nx = len(L2_L1_ratio_range), len(theta1_range)

    if args.dry_run:
        print(f"[dry-run] 图层类型: {layer_type}")
        print(f"[dry-run] 阻尼值: {len(damping_values)} 个切片 {damping_values}")
        print(f"[dry-run] 网格: {ny}×{nx} = {ny * nx} 个格点")
        print(f"[dry-run] X 轴 L₂/L₁: [{L2_L1_ratio_range[0]:.3f}, {L2_L1_ratio_range[-1]:.3f}] ({nx} 点)")
        print(f"[dry-run] Y 轴 θ₁ init: [{theta1_range[0]:.3f}, {theta1_range[-1]:.3f}] rad ({ny} 点)")
        total_cells = ny * nx * len(damping_values)
        print(f"[dry-run] 总格点: {total_cells}, 预估耗时: {total_cells * 0.5:.0f}s（约 {total_cells * 0.5 / 3600:.1f}h，基于 0.5s/格点）")
        return

    output_dir.mkdir(parents=True, exist_ok=True)

    all_results = []  # 收集所有阻尼切片的 (damping_value, out_filename, grid_hash)

    for d_idx, damping_val in enumerate(damping_values):
        damping_val = round(damping_val, 10)  # 浮点精度归一化
        layer_tag = layer_type.split('_')[-1]

        # 提前构建 metadata 以计算 gridHash 和输出文件名
        L2_display = float(FIXED_PARAMS["L1"] * LYAPUNOV_GRID["L2_L1_ratio"]["min"])
        metadata_for_hash = {
            "type": layer_type,
            "paramX": {
                "name": "L₂/L₁",
                "symbol": "L_2/L_1",
                "min": float(LYAPUNOV_GRID["L2_L1_ratio"]["min"]),
                "max": float(LYAPUNOV_GRID["L2_L1_ratio"]["max"]),
                "steps": nx,
                "unit": "",
            },
            "paramY": {
                "name": "θ₁",
                "symbol": "\\theta_1",
                "min": float(LYAPUNOV_GRID["theta1_init"]["min"]),
                "max": float(LYAPUNOV_GRID["theta1_init"]["max"]),
                "steps": ny,
                "unit": "rad",
            },
            "dampingValue": damping_val,
            "fixedParams": {
                "m1": FIXED_PARAMS["m1"],
                "m2": FIXED_PARAMS["m2"],
                "L1": FIXED_PARAMS["L1"],
                "L2": L2_display,
                "theta1_0": "scanned",
                "omega1_0": 0.0,
                "theta2_0": FIXED_PARAMS.get("theta2_0", np.pi / 2),
                "omega2_0": 0.0,
                "g": FIXED_PARAMS["g"],
                "damping": damping_val,
                "integrationTime": total_time,
                "dt": dt,
                "lyapunovTransient": lyapunov_transient,
                "integrator": "RKF45-Fehlberg",
                "renormInterval": 60,
            },
        }
        grid_hash = compute_grid_hash(metadata_for_hash)

        if len(damping_values) > 1:
            out_filename = f"lyapunov_{layer_tag}_d{damping_val}-{grid_hash}.json"
        else:
            out_filename = f"lyapunov_{layer_tag}-{grid_hash}.json"

        out_path = output_dir / out_filename

        # 跳过已存在的文件
        if out_path.exists() and not args.force:
            print(f"[跳过] {out_filename} 已存在，使用 --force 强制重新计算")
            all_results.append((damping_val, out_filename, grid_hash))
            continue

        print(f"\n{'='*50}")
        print(f"[阻尼切片] {d_idx + 1}/{len(damping_values)}, damping = {damping_val}")
        print(f"{'='*50}")

        # 断点续行（每个阻尼值独立）
        partial_file = None
        start_y = 0
        lyap_matrix = np.zeros((ny, nx))
        nan_mask = np.zeros((ny, nx), dtype=bool)
        partial_suffix = f"_d{damping_val}" if len(damping_values) > 1 else ""
        partial_path = output_dir / f"lyapunov_{layer_tag}{partial_suffix}-partial.json"

        if args.resume and d_idx == 0:
            partial_file = Path(args.resume)
        elif partial_path.exists() and not args.resume:
            # 自动检测当前阻尼值的断点文件
            partial_file = partial_path

        if partial_file and partial_file.exists():
            with open(partial_file, "r") as f:
                partial = json.load(f)
            prev_grid = np.array(partial.get("grid", []))
            prev_nan = np.array(partial.get("nan_mask", []), dtype=bool)
            if prev_grid.shape == (ny, nx):
                lyap_matrix = prev_grid
                nan_mask = prev_nan
                start_y = partial.get("completed_rows", 0)
                print(f"[resume] 跳过已完成 {start_y}/{ny} 行")
                partial_file = None  # 仅第一个阻尼值使用 --resume 参数

        L1 = FIXED_PARAMS["L1"]
        total = ny * nx
        nan_count = int(np.sum(nan_mask))
        t_start = time.perf_counter()

        for y in range(start_y, ny):
            ratio = L2_L1_ratio_range[y]
            L2 = float(ratio * L1)
            row_start = time.perf_counter()

            for x in range(nx):
                if nan_mask[y, x]:
                    continue

                theta1_init = theta1_range[x]
                params = {**FIXED_PARAMS, "L2": L2, "damping": damping_val}
                theta2_0 = FIXED_PARAMS.get("theta2_0", np.pi / 2)
                y0 = np.array([theta1_init, 0.0, theta2_0, 0.0])

                lam = estimate_lyapunov(params, y0, total_time, lyapunov_transient, dt)

                if np.isnan(lam):
                    lyap_matrix[y, x] = 0.0
                    nan_mask[y, x] = True
                    nan_count += 1
                else:
                    lyap_matrix[y, x] = lam

            row_elapsed = time.perf_counter() - row_start
            overall_elapsed = time.perf_counter() - t_start
            print(f"[进度] row {y + 1}/{ny}, 本行耗时 {row_elapsed:.1f}s, 总耗时 {overall_elapsed:.1f}s")

            # 每完成一行写入断点文件
            with open(partial_path, "w") as f:
                safe_json_dump({
                    "completed_rows": y + 1,
                    "damping_value": damping_val,
                    "grid": lyap_matrix.tolist(),
                    "nan_mask": nan_mask.tolist(),
                }, f)

        # 将 grid 转为 JSON 兼容格式：NaN → null
        grid_2d = []
        for y in range(ny):
            row = []
            for x in range(nx):
                if nan_mask[y, x]:
                    row.append(None)
                else:
                    row.append(float(lyap_matrix[y, x]))
            grid_2d.append(row)

        generated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

        output = {
            "metadata": {
                **metadata_for_hash,
                "gridHash": grid_hash,
                "generatedAt": generated_at,
                "solverVersion": SOLVER_VERSION,
            },
            "grid": grid_2d,
        }

        with open(out_path, "w", encoding="utf-8") as f:
            safe_json_dump(output, f, indent=2, ensure_ascii=False)

        # 清理断点文件
        if partial_path.exists():
            partial_path.unlink()

        all_results.append((damping_val, out_filename, grid_hash))
        print(f"\n[完成] damping={damping_val}, 输出: {out_filename}, gridHash={grid_hash}, 积分失败 {nan_count}/{total} 格点")

    # 更新 layer_manifest.json
    update_manifest(output_dir, layer_type, all_results)

    print(f"\n全部阻尼切片完成，共 {len(all_results)} 个文件。")
    return 0


def update_manifest(output_dir: Path, layer_type: str, results: list) -> None:
    """更新 public/assets/layer_manifest.json，追加/更新图层 → 文件名映射。

    results: list of (damping_value, filename, grid_hash) tuples。
    单个阻尼值时，results 长度为 1，同时更新顶层键和 dampingSlices。
    多个阻尼值时，更新所有顶层键和 dampingSlices。
    """
    manifest_path = output_dir / "layer_manifest.json"
    manifest: dict = {}
    if manifest_path.exists():
        with open(manifest_path, "r") as f:
            manifest = json.load(f)

    key_map = {
        "lyapunov_max": "lyapunov_max",
        "lyapunov_min": "lyapunov_min",
        "energy_curvature": "energy_curvature",
    }
    key = key_map.get(layer_type, layer_type)

    # 构建 dampingSlices 列表
    slices = []
    for d_val, fname, gh in results:
        slices.append({"value": d_val, "file": fname, "gridHash": gh})

    # 如果只有一个阻尼切片（无阻尼扫描），保持原有顶层键
    if len(results) == 1 and results[0][0] == 0.0:
        manifest[key] = results[0][1]
    else:
        # 多阻尼切片：顶层键指向 damping=0（或第一个）
        default_slice = next((s for s in slices if s["value"] == 0.0), slices[0])

        # 读取已有顶层文件的分辨率，保留高分辨率作为默认
        existing_file = manifest.get(key)
        existing_steps = None
        new_default_steps = None

        if existing_file and Path(output_dir, existing_file).exists():
            try:
                with open(Path(output_dir, existing_file), "r") as f:
                    existing_data = json.load(f)
                existing_steps = existing_data.get("metadata", {}).get("paramX", {}).get("steps")
            except Exception:
                pass

        if default_slice["file"]:
            try:
                new_path = Path(output_dir, default_slice["file"])
                if new_path.exists():
                    with open(new_path, "r") as f:
                        new_data = json.load(f)
                    new_default_steps = new_data.get("metadata", {}).get("paramX", {}).get("steps")
            except Exception:
                pass

        if existing_steps and new_default_steps and existing_steps > new_default_steps:
            # 保留已有高分辨率文件
            print(f"[manifest] 保留已有高分辨率 {key}: {existing_file} ({existing_steps}×) > 新 ({new_default_steps}×)")
        else:
            manifest[key] = default_slice["file"]

    # 写入 dampingSlices
    damping_key = f"{key}_dampingSlices"
    manifest[damping_key] = slices

    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2, sort_keys=True)
    print(f"[manifest] 已更新 {manifest_path} → {key}: {len(slices)} 个阻尼切片")


if __name__ == "__main__":
    sys.exit(main())
