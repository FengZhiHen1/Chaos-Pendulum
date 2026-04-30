"""一键运行全部预计算脚本。"""

import subprocess
import sys
from pathlib import Path

from config import OUTPUT_DIR


def main():
    script_dir = Path(__file__).resolve().parent
    scripts = [
        ["lyapunov_spectrum.py", "--type", "lyapunov_max", "--damping-all", "--quick"],
        ["bifurcation.py"],
    ]

    for args in scripts:
        print(f"\n{'='*60}")
        print(f"运行: {' '.join(args)}")
        print(f"{'='*60}")
        result = subprocess.run(
            [sys.executable] + args,
            cwd=str(script_dir),
            check=False,
        )
        if result.returncode != 0:
            print(f"[失败] {' '.join(args)} 返回码: {result.returncode}", file=sys.stderr)
            sys.exit(1)

    print(f"\n全部预计算完成。输出目录: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
