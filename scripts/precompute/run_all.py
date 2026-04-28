"""一键运行全部预计算脚本。"""

import subprocess
import sys
from pathlib import Path


def main():
    script_dir = Path(__file__).resolve().parent
    scripts = ["lyapunov_spectrum.py", "bifurcation.py"]

    for script in scripts:
        print(f"\n{'='*60}")
        print(f"运行 {script} ...")
        print(f"{'='*60}")
        result = subprocess.run(
            [sys.executable, str(script_dir / script)],
            cwd=str(script_dir),
            check=False,
        )
        if result.returncode != 0:
            print(f"错误：{script} 退出码 {result.returncode}")
            sys.exit(result.returncode)

    print("\n全部预计算完成。")


if __name__ == "__main__":
    main()
