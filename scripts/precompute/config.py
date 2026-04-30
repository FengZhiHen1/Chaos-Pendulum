# ============================================================
# scripts/precompute/config.py
# 集中管理所有扫描参数，避免硬编码。
# 修改预计算范围时，仅需修改此文件。
# ============================================================

from pathlib import Path

# 输出目录（相对于脚本所在目录，指向 public/assets/ —— 前端 fetch 直接可访问）
# 示例：scripts/precompute/ → ../../public/assets/
OUTPUT_DIR = Path(__file__).resolve().parents[2] / "public" / "assets"

# ---- Lyapunov 谱扫描参数 ----
LYAPUNOV_GRID = {
    # X 轴参数：L₂/L₁ 比（无量纲）
    "L2_L1_ratio": {
        "min": 0.5,        # 最小比值。约束：> 0。示例：0.5
        "max": 2.0,        # 最大比值。约束：> min。示例：2.0
        "points": 100,     # 网格点数。约束：≥ 10，≤ 200。典型值 100
    },
    # Y 轴参数：θ₁ 初始角（弧度）
    "theta1_init": {
        "min": 0.0,        # 最小初始角 (rad)。约束：任意实数。示例：0.0
        "max": 6.283185307179586,  # 2π rad。约束：> min。示例：2π
        "points": 100,     # 网格点数。约束：≥ 10，≤ 200。典型值 100
    },
}

# ---- 分岔图扫描参数 ----
BIFURCATION_SCAN = {
    # 扫描的控制参数（X 轴）
    "control_param": "theta1",       # 参数名。枚举值："theta1" | "theta2" | "L1" | "L2" | "m1" | "m2" | "omega1_0" | "omega2_0"
    "control_range": [0.0, 6.283185307179586],  # [min, max]。约束：max > min
    "control_points": 500,           # 扫描步数。约束：≥ 50，≤ 2000。典型值 500

    # 积分参数
    "transient_steps": 500,          # 瞬态抛弃步数（对应 transientTime = transient_steps × dt）
    "sample_steps": 200,             # 稳态采样步数（对应 sampleTime = sample_steps × dt）
}

# ---- 固定物理参数（除扫描参数外）----
# 与 SIM-01 Worker 默认值完全一致
FIXED_PARAMS = {
    "m1": 1.0,              # 上摆质量 (kg)。约束：> 0。默认：1.0
    "m2": 1.0,              # 下摆质量 (kg)。约束：> 0。默认：1.0
    "L1": 1.0,              # 上摆摆长 (m)。约束：> 0。默认：1.0
    "L2": 1.0,              # 下摆摆长 (m)。约束：> 0。默认：1.0
    # Lyapunov 谱扫描时 L2 由 LYAPUNOV_GRID["L2_L1_ratio"] * L1 动态覆盖
    "g": 9.81,              # 重力加速度 (m/s²)。约束：≥ 0。默认：9.81
    "damping": 0.0,         # 阻尼系数 (1/s)。约束：≥ 0。默认：0.0
    # 初始条件（与 JS DEFAULT_INITIAL_CONDITIONS 对齐）
    "theta2_0": 1.5707963267948966,  # π/2 rad，与 JS DEFAULT_INITIAL_CONDITIONS.theta2 对齐
}

# ---- 积分参数 ----
# 与 SIM-01 Worker 完全一致：dt = 1/60，无瞬态舍弃
INTEGRATION = {
    "dt": 1.0 / 60.0,       # 积分步长 (s)。与 JS Worker dt=1/60 对齐
    "total_time": 100.0,    # 单次仿真总时长 (s)。约束：> 0。Lyapunov 谱使用此值
    "lyapunov_transient": 0.0,  # Lyapunov 瞬态抛弃时间 (s)。与 JS 实时计算对齐：无瞬态舍弃
}

# ---- 元数据 ----
SOLVER_VERSION = "2.0.0"    # 预计算脚本版本号。v2: RKF45 Fehlberg + 统一 JS 参数
