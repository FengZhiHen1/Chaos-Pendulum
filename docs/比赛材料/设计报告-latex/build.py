#!/usr/bin/env python3
"""
通用 LaTeX 构建脚本。
执行流程：xelatex -> bibtex -> xelatex -> xelatex
自动检测主 .tex 文件、处理错误并生成 PDF。
"""

import os
import sys
import subprocess
import shutil
from pathlib import Path

# 配置
COMPILER = "xelatex"
BIB_TOOL = "bibtex"
MAX_PASSES = 4
SRC_DIR = Path("src")
OUTPUT_DIR = Path("output")


def find_main_tex():
    """在 src/ 或当前目录中查找主 .tex 文件。"""
    candidates = []
    search_dirs = [SRC_DIR, Path(".")]
    for d in search_dirs:
        if d.exists():
            candidates.extend(d.glob("*.tex"))
    # 优先选择 main.tex，否则选择第一个找到的 .tex
    for c in candidates:
        if c.stem.lower() == "main":
            return c
    return candidates[0] if candidates else None


def run_command(cmd, cwd=None):
    """运行 shell 命令并返回 (returncode, stdout, stderr)。"""
    print(f"  [RUN] {' '.join(cmd)}")
    result = subprocess.run(
        cmd,
        cwd=cwd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return result.returncode, result.stdout, result.stderr


def extract_errors(log_text):
    """从编译器输出中提取 LaTeX 错误。

    处理两种 xelatex 输出格式：
    1. 传统格式（例如交互模式）：以 `!` 开头的行
    2. -file-line-error 模式：匹配 `./path/file.tex:NN: message` 的行

    在 -file-line-error 模式下，行首永远不会出现 `!` —— 仅依赖 `!`
    会静默遗漏所有结构性错误（Misplaced \\crcr、Extra alignment tab、
    Missing $ 等）。
    """
    import re
    errors = []
    # -file-line-error 模式：./relative/path/file.ext:lineno: message
    file_line_pat = re.compile(r'^\./.*\.\w+:\d+:\s*(.*)$')

    for line in log_text.splitlines():
        stripped = line.strip()

        # 格式 1：传统的 `!` 前缀
        if stripped.startswith('!'):
            errors.append(stripped)
            continue

        # 格式 2：-file-line-error 格式
        m = file_line_pat.match(stripped)
        if m:
            msg = m.group(1)
            # 排除警告——这些不是编译错误
            if not msg.startswith(('Overfull', 'Underfull', 'LaTeX Warning',
                                    'Package', 'Reference',
                                    'Citation', 'Label')):
                errors.append(stripped)

    return errors


def clean_aux_files(tex_dir, stem):
    """构建成功后删除 LaTeX 辅助文件。

    保留 .tex、.bib、.pdf、.cls、.sty、.bst、.cfg、.clo、.def、.fd，
    以及 figures/ 和 sections/ 目录中的所有内容。
    """
    # 始终可以安全删除的扩展名
    AUX_EXTENSIONS = {
        ".aux", ".log", ".out", ".toc", ".lof", ".lot",
        ".bbl", ".blg", ".fls", ".fdb_latexmk", ".synctex.gz",
        ".thm", ".nav", ".snm", ".vrb", ".spl",
        ".brf", ".idx", ".ilg", ".ind", ".glg", ".glo", ".gls",
        ".xdy", ".run.xml", "-blx.bib",
    }

    tex_dir = Path(tex_dir)
    cleaned = 0

    for f in tex_dir.iterdir():
        if not f.is_file():
            continue
        # 保留源文件
        if f.suffix in {".tex", ".bib", ".cls", ".sty", ".bst", ".cfg", ".clo", ".def", ".fd", ".dtx"}:
            continue
        # 保留输出的 PDF 本身（已复制，但保留作为参考）
        if f.stem == stem and f.suffix == ".pdf":
            continue
        # 按扩展名判断是否为辅助文件
        full_name = f.name
        should_delete = False
        for ext in AUX_EXTENSIONS:
            if full_name.endswith(ext):
                should_delete = True
                break
        if should_delete:
            f.unlink()
            cleaned += 1

    if cleaned > 0:
        print(f"         已清理 {cleaned} 个辅助文件")


def build():
    main_tex = find_main_tex()
    if not main_tex:
        print("ERROR: 未找到 .tex 文件。")
        sys.exit(1)

    tex_dir = main_tex.parent
    tex_name = main_tex.name
    stem = main_tex.stem

    print(f"Building: {main_tex}")
    print(f"Output dir: {OUTPUT_DIR}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # 检查编译器是否存在
    if not shutil.which(COMPILER):
        print(f"ERROR: 在 PATH 中未找到 '{COMPILER}'。")
        print("请安装 TeX 发行版（TeX Live / MiKTeX / MacTeX）。")
        sys.exit(1)

    # 第 1 轮：xelatex
    total_errors = []
    print("\n--- Pass 1: xelatex ---")
    code, out, err = run_command(
        [COMPILER, "-interaction=nonstopmode", "-file-line-error", tex_name],
        cwd=tex_dir,
    )
    log_text = out + err
    if code != 0:
        errors = extract_errors(log_text)
        total_errors.extend(errors)
        if errors:
            print(f"\n  ⚠ 第 1 轮：{len(errors)} 个错误")
            for e in errors[:15]:
                print(f"    {e}")
            if len(errors) > 15:
                print(f"    ... 还有 {len(errors) - 15} 个")

    # 检查是否存在参考文献
    bib_file = tex_dir / "refs.bib"
    if bib_file.exists():
        # 检查是否有实际的 \cite{} 命令（否则 bibtex 没有意义）
        aux_file = tex_dir / f"{stem}.aux"
        has_citations = False
        if aux_file.exists():
            aux_text = aux_file.read_text(encoding="utf-8", errors="replace")
            has_citations = "\\citation{" in aux_text

        if not has_citations:
            print(f"\n--- WARNING: 已跳过 bibtex ---")
            print(f"  refs.bib 存在，但在文档中未找到 \\cite{{}} 命令。")
            print(f"  PDF 中的参考文献将为空。")
            print(f"  若要包含所有条目而无需逐一引用，请在 \\bibliography{{refs}} 之前添加 \\nocite{{*}}。")
        else:
            # 运行 bibtex
            print(f"\n--- Running {BIB_TOOL} ---")
            code, out, err = run_command([BIB_TOOL, stem], cwd=tex_dir)
            bibtex_output = out + err

            # 检测常见的 bibtex 失败
            if "I couldn't open database file" in bibtex_output:
                print(f"  ERROR: bibtex 无法找到 .bib 文件。")
                print(f"  请检查 \\bibliography{{refs}} 是否与文件名 refs.bib 一致")
            elif "I found no \\citation commands" in bibtex_output:
                print(f"  WARNING: bibtex 未找到引用命令。")
            elif "I didn't find a database entry for" in bibtex_output:
                # 提取缺失的键
                import re as _re
                missing = _re.findall(r"I didn't find a database entry for '([^']+)'", bibtex_output)
                if missing:
                    print(f"  WARNING: bibtex 在 refs.bib 中找不到以下键：")
                    for k in missing:
                        print(f"    - {k}")
            if code != 0:
                print(f"  WARNING: bibtex 退出码为 {code}")

    # 第 2-4 轮：xelatex（解析交叉引用）
    for i in range(2, MAX_PASSES + 1):
        print(f"\n--- Pass {i}: xelatex ---")
        code, out, err = run_command(
            [COMPILER, "-interaction=nonstopmode", "-file-line-error", tex_name],
            cwd=tex_dir,
        )
        log_text = out + err
        if code == 0:
            # 检查引用是否已稳定
            if "Rerun to get cross-references right" not in log_text:
                print("  交叉引用已稳定。")
                break
        else:
            errors = extract_errors(log_text)
            total_errors.extend(errors)
            if errors:
                print(f"\n  ⚠ 第 {i} 轮：{len(errors)} 个错误")
                for e in errors[:15]:
                    print(f"    {e}")
                if len(errors) > 15:
                    print(f"    ... 还有 {len(errors) - 15} 个")

    # 将 PDF 和日志复制到 output/
    pdf_src = tex_dir / f"{stem}.pdf"
    log_src = tex_dir / f"{stem}.log"

    if pdf_src.exists():
        shutil.copy2(pdf_src, OUTPUT_DIR / f"{stem}.pdf")
        status = "⚠ 存在错误" if total_errors else "OK"
        print(f"\nPDF -> {OUTPUT_DIR / f'{stem}.pdf'}  ({status})")
        if total_errors:
            print(f"     {len(total_errors)} 个编译错误 —— 表格/公式可能显示异常。")
            print(f"     请查看 output/compile.log 并目视检查 PDF。")
    else:
        print("\nFAILED: 未生成 PDF。")
        if total_errors:
            print(f"     {len(total_errors)} 个错误导致无法输出。")

    if log_src.exists():
        shutil.copy2(log_src, OUTPUT_DIR / f"{stem}.log")
        print(f"         日志 -> {OUTPUT_DIR / f'{stem}.log'}")

    # 保存合并输出以供调试
    with open(OUTPUT_DIR / "compile.log", "w", encoding="utf-8") as f:
        f.write(log_text)

    # 清理辅助文件
    if pdf_src.exists():
        clean_aux_files(tex_dir, stem)

    return pdf_src.exists()


if __name__ == "__main__":
    success = build()
    sys.exit(0 if success else 1)
