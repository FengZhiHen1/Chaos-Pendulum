"""预计算参数配置 — 集中管理所有扫描参数，避免硬编码。"""

from pathlib import Path

# 输出目录（相对于项目根目录）
OUTPUT_DIR = Path(__file__).resolve().parents[2] / "src" / "shared" / "data"

# Lyapunov 谱扫描参数
LYAPUNOV_GRID = {
    "L2_L1_ratio": {"min": 0.5, "max": 2.0, "points": 100},
    "theta1_init": {"min": 0.0, "max": 2 * 3.141592653589793, "points": 100},
}

# 分岔图扫描参数
BIFURCATION_SCAN = {
    "control_param": "theta1",       # 扫描参数名
    "control_range": [0.0, 2 * 3.141592653589793],  # [min, max]
    "control_points": 500,
    "transient_steps": 500,          # 瞬态抛弃步数
    "sample_steps": 200,             # 稳态采样步数
}

# 固定物理参数（除扫描变量外）
FIXED_PARAMS = {
    "m1": 1.0,
    "m2": 1.0,
    "L1": 1.0,
    "g": 9.81,
    "damping": 0.0,
}

# 积分参数
INTEGRATION = {
    "dt": 0.01,
    "total_time": 100.0,           # 单次仿真总时长（秒）
    "lyapunov_transient": 50.0,    # Lyapunov 瞬态抛弃时间
}
