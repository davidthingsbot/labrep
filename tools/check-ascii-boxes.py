#!/usr/bin/env python3
"""
Check ASCII box-drawing alignment in markdown files.

Uses a stack-based parser to track nested boxes through their full
lifecycle (open → content → close). Every │ on every line is checked
against the box it belongs to. Supports arbitrary nesting depth.

Reports:
  1. Top/bottom border width mismatches
  2. │ column misalignment (at any nesting level)
  3. ├...┤ mid-rule width mismatches
  4. Double-wide characters that may cause visual misalignment

Usage:
  python3 check-ascii-boxes.py <file.md> [file2.md ...]
  python3 check-ascii-boxes.py doc/
"""

import sys
import unicodedata
from pathlib import Path

# Characters known to render as double-wide in many editors/terminals.
KNOWN_WIDE_CHARS = set('⏱⏰⏲⏳⌚⌛🔔🔕')


def find_wide_chars(s):
    """Return list of (col, char, name) for potentially double-wide chars."""
    results = []
    for i, c in enumerate(s):
        if c in KNOWN_WIDE_CHARS or unicodedata.east_asian_width(c) in ('W', 'F'):
            name = unicodedata.name(c, f'U+{ord(c):04X}')
            results.append((i, c, name))
    return results


def extract_code_blocks(lines):
    """Return list of (start_line, block_lines) for fenced code blocks."""
    blocks = []
    in_code = False
    current_start = 0
    current_lines = []

    for i, line in enumerate(lines):
        if line.strip().startswith('```'):
            if in_code:
                blocks.append((current_start, current_lines))
                current_lines = []
            else:
                current_start = i + 1
                current_lines = []
            in_code = not in_code
        elif in_code:
            current_lines.append((i + 1, line.rstrip('\n')))

    return blocks


def find_box_tops(s):
    """Find all ┌...┐ pairs on a line that look like box borders.
    A box top is ┌...┐ where the content between them:
      - Is purely border chars (─ ┬ ┼ ▼ ▲ ► ◄), OR
      - Is a labeled border: starts with ─, may contain label text, ends with ─
        e.g. ┌─ Label ───────┐
    Lines with └, ┘, or │ between ┌ and ┐ are tree connectors, not boxes."""
    tops = []
    i = 0
    while i < len(s):
        if s[i] == '┌':
            depth = 1
            j = i + 1
            has_non_border = False
            has_border_char = False
            has_structural_break = False
            while j < len(s) and depth > 0:
                if s[j] == '┌':
                    depth += 1
                elif s[j] == '┐':
                    depth -= 1
                elif depth == 1:
                    if s[j] in '─┬┼▼▲►◄':
                        has_border_char = True
                    elif s[j] in '└┘│':
                        # Structural box chars that break the border
                        has_structural_break = True
                    else:
                        has_non_border = True
                j += 1

            if depth == 0 and not has_structural_break:
                if not has_non_border:
                    # Pure border (no label)
                    tops.append((i, j - 1))
                    i = j
                elif has_border_char:
                    # Labeled border: has both ─ and text (e.g. ┌─ Label ──┐)
                    tops.append((i, j - 1))
                    i = j
                else:
                    i += 1
            else:
                i += 1
        else:
            i += 1
    return tops


def find_box_bottoms(s):
    """Find all └...┘ pairs on a line that look like box borders."""
    bots = []
    i = 0
    while i < len(s):
        if s[i] == '└':
            depth = 1
            j = i + 1
            is_box = True
            while j < len(s) and depth > 0:
                if s[j] == '└':
                    depth += 1
                elif s[j] == '┘':
                    depth -= 1
                elif depth == 1 and s[j] not in '─┴┬┼▼▲►◄':
                    is_box = False
                j += 1
            if depth == 0 and is_box:
                bots.append((i, j - 1))
                i = j
            else:
                i += 1
        else:
            i += 1
    return bots


def find_mid_rules(s):
    """Find all ├...┤ pairs on a line. Returns list of (left_col, right_col)."""
    mids = []
    i = 0
    while i < len(s):
        if s[i] == '├':
            j = i + 1
            while j < len(s) and s[j] != '┤':
                j += 1
            if j < len(s):
                mids.append((i, j))
            i = j + 1
        else:
            i += 1
    return mids


def check_code_block(block_lines):
    """
    Check a code block for box alignment issues using a stack-based parser.

    The stack tracks open boxes. Each entry is:
      { left_col, right_col, top_line, width }

    When we see ┌...┐, push a box.
    When we see └...┘, pop the matching box and check width.
    On every line, check that │ chars at known box edge columns are present.
    """
    issues = []
    box_stack = []  # stack of open boxes, outermost first

    for lineno, s in block_lines:
        # 1. Check for double-wide characters
        wide = find_wide_chars(s)
        for col, char, name in wide:
            issues.append(
                f"Line {lineno}: double-wide char '{char}' ({name}) at col {col} "
                f"— may render 2 columns wide, causing visual misalignment"
            )

        # 2. Open new boxes (┌...┐)
        tops = find_box_tops(s)
        for left, right in tops:
            box_stack.append({
                'left_col': left,
                'right_col': right,
                'top_line': lineno,
                'width': right - left + 1,
            })

        # 3. Check edge alignment against all open boxes
        # A box edge can be satisfied by │ (content), ┌└├ (left), ┐┘┤ (right)
        LEFT_EDGE_CHARS = set('│┌└├')
        RIGHT_EDGE_CHARS = set('│┐┘┤')

        if box_stack:
            char_at = {j: c for j, c in enumerate(s)}

            for box in box_stack:
                # Skip the line where this box was opened
                if box['top_line'] == lineno:
                    continue

                left_char = char_at.get(box['left_col'], ' ')
                right_char = char_at.get(box['right_col'], ' ')

                left_ok = left_char in LEFT_EDGE_CHARS
                right_ok = right_char in RIGHT_EDGE_CHARS

                # Skip check if this line has no box-drawing chars at all
                # (e.g. a label line between side-by-side boxes)
                has_any_box_char = any(
                    c in '│┌┐└┘├┤┬┴┼─' for c in s
                )
                if not has_any_box_char:
                    continue

                if not left_ok:
                    issues.append(
                        f"Line {lineno}: expected box edge at col {box['left_col']} "
                        f"(left edge of box opened at line {box['top_line']}), "
                        f"found '{left_char}'"
                    )
                if not right_ok:
                    issues.append(
                        f"Line {lineno}: expected box edge at col {box['right_col']} "
                        f"(right edge of box opened at line {box['top_line']}), "
                        f"found '{right_char}'"
                    )

        # 4. Check ├...┤ mid-rules match their enclosing box
        mids = find_mid_rules(s)
        for mid_left, mid_right in mids:
            mid_width = mid_right - mid_left + 1
            # Find which box this mid-rule belongs to
            matched = False
            for box in reversed(box_stack):
                if box['left_col'] == mid_left:
                    if mid_width != box['width']:
                        issues.append(
                            f"Line {lineno}: mid-rule width {mid_width} != "
                            f"box width {box['width']} (opened at line {box['top_line']})"
                        )
                    matched = True
                    break
            if not matched and mids:
                # Horizontal rule not associated with a box — that's fine,
                # it might be a standalone separator
                pass

        # 5. Close boxes (└...┘)
        bots = find_box_bottoms(s)
        for bot_left, bot_right in bots:
            bot_width = bot_right - bot_left + 1
            # Find matching box on stack (by left_col)
            matched_idx = None
            for idx in range(len(box_stack) - 1, -1, -1):
                if box_stack[idx]['left_col'] == bot_left:
                    matched_idx = idx
                    break

            if matched_idx is not None:
                box = box_stack.pop(matched_idx)
                if bot_width != box['width']:
                    issues.append(
                        f"Line {lineno}: bottom border width {bot_width} != "
                        f"top width {box['width']} (opened at line {box['top_line']})"
                    )
                if bot_right != box['right_col']:
                    issues.append(
                        f"Line {lineno}: bottom right at col {bot_right}, "
                        f"expected col {box['right_col']} (opened at line {box['top_line']})"
                    )

    # Warn about unclosed boxes
    for box in box_stack:
        issues.append(
            f"Line {box['top_line']}: box opened at col {box['left_col']} "
            f"but never closed"
        )

    return issues


def check_file(filepath):
    """Check a single file. Returns list of issues."""
    with open(filepath) as f:
        lines = f.readlines()

    blocks = extract_code_blocks(lines)
    all_issues = []

    for _start, block_lines in blocks:
        issues = check_code_block(block_lines)
        all_issues.extend(issues)

    return all_issues


def main():
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <file.md> [file2.md ...]")
        print(f"       {sys.argv[0]} <directory>")
        sys.exit(1)

    files = []
    for arg in sys.argv[1:]:
        p = Path(arg)
        if p.is_dir():
            files.extend(p.rglob('*.md'))
        else:
            files.append(p)

    total_issues = 0

    for filepath in sorted(files):
        issues = check_file(filepath)
        if issues:
            print(f"\n{filepath}:")
            for issue in issues:
                print(f"  {issue}")
            total_issues += len(issues)

    if total_issues == 0:
        print("No box-drawing alignment issues found.")
    else:
        print(f"\n{total_issues} issue(s) found.")

    sys.exit(1 if total_issues > 0 else 0)


if __name__ == '__main__':
    main()
