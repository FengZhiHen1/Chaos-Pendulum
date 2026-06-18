#!/usr/bin/env python3
r"""
检查 LaTeX 编译输出中的 Overfull \hbox 警告，
并与 .tex 源文件中的表格环境进行交叉核对。

用法：
    python check_overflow.py              # 扫描 output/compile.log，检查所有 .tex
    python check_overflow.py --log PATH   # 指定日志文件路径

退出码：若发现 overfull 警告则返回 1，否则返回 0。
"""

import os
import re
import sys
from pathlib import Path
from collections import defaultdict


def find_log():
    """查找编译日志文件。"""
    candidates = [
        Path("output/compile.log"),
        Path("output/main.log"),
        Path("src/main.log"),
    ]
    for c in candidates:
        if c.exists():
            return c
    out = Path("output")
    if out.is_dir():
        logs = list(out.glob("*.log"))
        if logs:
            return logs[0]
    return None


def extract_overfulls(log_path):
    r"""
    从日志文件中提取 Overfull \hbox 警告。

    返回包含 amount_pt、line_info、file 键的字典列表。
    """
    overfulls = []
    current_file = None

    with open(log_path, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            # 跟踪当前文件上下文
            file_match = re.match(r"^\((.+\.tex)", line.strip())
            if file_match:
                current_file = file_match.group(1)

            # 在行首匹配 Overfull \hbox (xxxpt too wide)
            m = re.match(
                r"Overfull \\hbox \(([\d.]+)pt too wide\)",
                line.strip(),
            )
            if not m:
                # 同时匹配嵌入在段落上下文中的情况
                m = re.search(
                    r"Overfull \\hbox \(([\d.]+)pt too wide\)",
                    line,
                )
            if m:
                amount = float(m.group(1))
                line_info = ""
                lm = re.search(r"at lines? (\d+)", line)
                if lm:
                    line_info = f"line {lm.group(1)}"
                overfulls.append({
                    "amount_pt": amount,
                    "line_info": line_info,
                    "file": current_file or "unknown",
                })

    return overfulls


def find_table_environments(tex_dir="src"):
    """
    扫描 .tex 文件中的表格环境并评估溢出风险。

    返回包含 file、line range、type、col count、risk level 的字典列表。
    """
    tables = []
    tex_dir = Path(tex_dir)
    if not tex_dir.is_dir():
        tex_dir = Path(".")

    for tex_file in sorted(tex_dir.rglob("*.tex")):
        with open(tex_file, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
            lines = content.splitlines()

        in_table = False
        table_start = 0
        table_lines = []
        table_type = ""

        for i, line in enumerate(lines, 1):
            table_begin = re.search(
                r"\\begin\{(tabularx|tabular\}|longtable|tabulary|sidewaystable)",
                line,
            )
            table_end = re.search(
                r"\\end\{(tabularx|tabular\}|longtable|tabulary|sidewaystable)",
                line,
            )

            if table_begin and not in_table:
                in_table = True
                table_start = i
                table_lines = [line]
                table_type = table_begin.group(1).rstrip("}")
            elif table_end and in_table:
                table_lines.append(line)
                in_table = False

                # 分析列规范（仅统计列规范 {} 内部，避免把 \begin{tabular} 单词中的 l/r 计入）
                col_spec_inner = ""
                spec_match = re.search(
                    r"\\begin\{tabularx?\}(?:\{[^}]*\})?\{([^}]*)\}",
                    "\n".join(table_lines),
                )
                if spec_match:
                    col_spec_inner = spec_match.group(1)

                # 检查是否具备宽度控制
                has_width = bool(
                    re.search(r"\\begin\{tabularx\}", "\n".join(table_lines))
                    or "p{" in col_spec_inner
                    or "X" in col_spec_inner
                )
                has_resize = "resizebox" in "\n".join(table_lines).lower()
                has_small = any(
                    kw in "\n".join(table_lines).lower()
                    for kw in [r"\small", r"\footnotesize", r"\scriptsize"]
                )

                # 统计列数：先剔除列说明符里的 {\centering\arraybackslash} 等 {} 块，
                # 再按 l/c/r/p/m/b/X/S 计数。
                col_spec_clean = re.sub(r"\{[^}]*\}", "", col_spec_inner)
                col_spec_clean = re.sub(r"\|", "", col_spec_clean)
                col_count = len(re.findall(r"[lcrXpmbS]", col_spec_clean))

                risk = "low"
                reasons = []
                if not has_width and col_count >= 3:
                    risk = "high"
                    reasons.append(f"{col_count} 列且无宽度控制")
                elif not has_width and col_count >= 2:
                    risk = "medium"
                    reasons.append("多列且无宽度控制")
                if col_count >= 7:
                    risk = "high"
                    reasons.append(f"{col_count} 列（非常宽）")

                tables.append({
                    "file": str(tex_file),
                    "start_line": table_start,
                    "end_line": i,
                    "type": table_type,
                    "col_count": col_count,
                    "has_width_control": has_width,
                    "has_resize": has_resize,
                    "has_small": has_small,
                    "risk": risk,
                    "reasons": reasons,
                })

    return tables


def main():
    log_path = None

    args = sys.argv[1:]
    if "--log" in args:
        idx = args.index("--log")
        if idx + 1 < len(args):
            log_path = Path(args[idx + 1])
    else:
        log_path = find_log()

    if not log_path or not log_path.exists():
        print("未找到编译日志。请先运行 build.py。")
        print("预期路径：output/compile.log")
        sys.exit(0)

    overfulls = extract_overfulls(log_path)
    tables = find_table_environments()

    # --- 报告 ---
    print("=" * 60)
    print("LaTeX 表格溢出检查")
    print("=" * 60)

    # 第 1 节：编译警告
    print(f"\n[1] 编译日志：{log_path}")
    if not overfulls:
        print("    未发现 Overfull \\hbox 警告。")
    else:
        total_overflow = sum(o["amount_pt"] for o in overfulls)
        print(f"    发现 {len(overfulls)} 个 Overfull \\hbox 警告")
        print(f"    总溢出量：{total_overflow:.1f}pt")
        print()
        for i, o in enumerate(overfulls[:10], 1):
            loc = f" ({o['line_info']})" if o["line_info"] else ""
            print(f"    [{i}] {o['amount_pt']:.1f}pt 过宽{loc}")
            if o["file"] != "unknown":
                print(f"        位于 {o['file']}")
        if len(overfulls) > 10:
            print(f"    ... 还有 {len(overfulls) - 10} 个")

    # 第 2 节：表格审计
    print(f"\n[2] 表格环境审计（共 {len(tables)} 个）")

    high_risk = [t for t in tables if t["risk"] == "high"]
    medium_risk = [t for t in tables if t["risk"] == "medium"]
    low_risk = [t for t in tables if t["risk"] == "low"]

    if high_risk:
        print(f"\n    高风险（{len(high_risk)}）：")
        for t in high_risk:
            print(f"    - {t['file']} 第 {t['start_line']} 行："
                  f"{t['type']}（{t['col_count']} 列）")
            for r in t["reasons"]:
                print(f"      -> {r}")
        print(f"\n    建议修复方案（按优先级）：")
        print(f"      1. 将 \\begin{{{t['type']}}} 替换为 "
              f"\\begin{{tabularx}}{{\\textwidth}}")
        print(f"      2. 对文本较多的列使用 X 列")
        print(f"      3. 若仍溢出，可添加 \\small")
        print(f"      4. 对于 8 列以上表格，考虑使用 \\begin{{landscape}}")
        print(f"      5. 最后手段：\\resizebox{{\\textwidth}}{{!}}{{...}}")

    if medium_risk:
        print(f"\n    中风险（{len(medium_risk)}）：")
        for t in medium_risk:
            print(f"    - {t['file']} 第 {t['start_line']} 行："
                  f"{t['type']}（{t['col_count']} 列）")
            for r in t["reasons"]:
                print(f"      -> {r}")

    if low_risk:
        print(f"\n    低风险（{len(low_risk)}）：")
        for t in low_risk:
            print(f"    - {t['file']} 第 {t['start_line']} 行："
                  f"{t['type']}（{t['col_count']} 列）-- OK")

    # 汇总
    print(f"\n[3] 汇总")
    has_issues = bool(overfulls) or bool(high_risk)
    if has_issues:
        print(f"    状态：发现问题")
        if overfulls:
            print(f"    编译警告：{len(overfulls)}")
        if high_risk:
            print(f"    高风险表格：     {len(high_risk)}")
        if medium_risk:
            print(f"    中风险表格：   {len(medium_risk)}")
        print(f"\n    操作：检查上方表格并应用修复。")
        print(f"    然后重新编译并再次运行本检查。")
    else:
        print(f"    状态：干净 —— 无溢出警告或高风险表格。")
    print("=" * 60)

    sys.exit(1 if has_issues else 0)


if __name__ == "__main__":
    main()
