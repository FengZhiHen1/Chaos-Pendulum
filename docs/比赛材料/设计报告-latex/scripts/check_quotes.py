#!/usr/bin/env python3
"""检测中文语境下的引号误用问题。

检查项:
  1. ASCII 直双引号 \" (U+0022) — 中文文本中绝不应出现
  2. 角引号「」(U+300C/U+300D) — 大陆正式文书不适用
  3. 全角直双引号 ＂(U+FF02) — 应为弯引号
  4. 引号配对异常 — 左引号/右引号数量不匹配，或交错嵌套
  5. 连续同方向弯引号 — 两个左引号或两个右引号紧邻（"" 除外）

用法:
  python check_quotes.py [paths...]

  <目录>:    递归扫描该目录下所有 .tex 文件
  <文件>:    扫描指定文件
  不带参数:  递归扫描当前目录下所有 .tex 文件
"""

import glob, sys, re, os

# ---- 需检测的非法/不推荐字符 ----
ILLEGAL = {
    0x0022: ('ASCII 直双引号', '"'),
    0x300C: ('角引号（左）', '「'),
    0x300D: ('角引号（右）', '」'),
    0xFF02: ('全角直双引号', '＂'),
}

LEFT  = '“'   # U+201C
RIGHT = '”'   # U+201D


def _line_of(pos: int, content: str) -> int:
    return content[:pos].count('\n') + 1


def _ctx(pos: int, content: str, radius: int = 12) -> str:
    start = max(0, pos - radius)
    end   = min(len(content), pos + radius)
    return content[start:end].replace('\n', '\\n')


def _check_pairs(content: str) -> list[str]:
    """用栈配对弯引号，检测不匹配或交错。"""
    issues = []
    stack: list[tuple[int, str]] = []  # (pos, LEFT/RIGHT)

    for i, ch in enumerate(content):
        if ch == LEFT:
            stack.append((i, LEFT))
        elif ch == RIGHT:
            if not stack:
                # 右引号没有对应的左引号
                lineno = _line_of(i, content)
                issues.append(
                    f'  L{lineno}: ” 缺少配对的 “  —  额外/孤立的右引号\n'
                    f'    ctx: ...{_ctx(i, content)}...'
                )
            else:
                stack.pop()  # 正常配对

    # 残留的左引号
    for pos, _ in stack:
        lineno = _line_of(pos, content)
        issues.append(
            f'  L{lineno}: “ 缺少配对的 ”  —  左引号未被关闭\n'
            f'    ctx: ...{_ctx(pos, content)}...'
        )

    return issues


def check_file(fpath: str) -> list[str]:
    """检查单个文件，返回问题列表。"""
    issues: list[str] = []
    with open(fpath, 'r', encoding='utf-8') as f:
        content = f.read()

    # ---- 1. 非法字符 ----
    for i, ch in enumerate(content):
        cp = ord(ch)
        if cp in ILLEGAL:
            name, _ = ILLEGAL[cp]
            issues.append(
                f'  L{_line_of(i, content)}: {name} U+{cp:04X}'
                f'  ctx: ...{_ctx(i, content)}...'
            )

    # ---- 2. 连续同方向弯引号 ----
    for m in re.finditer(r'[“”]{2,}', content):
        seq = m.group()
        if seq == '”“':   # close+open 是合法的
            continue
        issues.append(
            f'  L{_line_of(m.start(), content)}: 弯引号连续异常 {repr(seq)}'
            f'  ctx: ...{_ctx(m.start(), content, 10)}...'
        )

    # ---- 3. 引号配对 ----
    issues.extend(_check_pairs(content))

    return issues


def _collect_files(paths: list[str]) -> list[str]:
    """解析参数列表，返回所有待检查的 .tex 文件路径。"""
    if not paths:
        # 无参数：递归扫描当前目录
        return sorted(glob.glob('**/*.tex', recursive=True))

    files = []
    for p in paths:
        if os.path.isdir(p):
            # 目录：递归扫描
            files.extend(sorted(glob.glob(os.path.join(p, '**/*.tex'), recursive=True)))
        elif os.path.isfile(p):
            files.append(p)
        else:
            # 支持通配符，如 src/*.tex
            expanded = sorted(glob.glob(p, recursive=True))
            if expanded:
                files.extend(expanded)
            else:
                print(f'警告: 路径不存在或无可匹配文件 — {p}')
    return files


def main():
    files = _collect_files(sys.argv[1:])

    if not files:
        print('未找到 .tex 文件。')
        return 1

    print(f'检查 {len(files)} 个 .tex 文件...\n')

    total = 0
    for fpath in files:
        issues = check_file(fpath)
        if issues:
            print(f'{fpath}: {len(issues)} 处问题')
            for iss in issues:
                print(iss)
            print()
            total += len(issues)

    if total == 0:
        print(f'全部通过 ({len(files)} 个文件) — 未发现引号误用。')
        return 0
    else:
        with_issues = sum(1 for f in files if check_file(f))
        print(f'共 {total} 处问题，分布在 {with_issues}/{len(files)} 个文件中。')
        return 1


if __name__ == '__main__':
    sys.exit(main())
