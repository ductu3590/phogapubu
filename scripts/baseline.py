#!/usr/bin/env python3
"""Baseline "nợ cũ" cho dự án đang làm dở — verify chỉ đỏ khi tình hình XẤU ĐI.

  python scripts/baseline.py capture          (NGƯỜI chạy) chụp lỗi hiện có từ lần verify gần nhất
  python scripts/baseline.py show             xem nợ cũ còn bao nhiêu
  python scripts/baseline.py check <bước> <log>   (verify.py gọi) 0 = không xấu hơn baseline, 1 = xấu hơn
  python scripts/baseline.py clear <bước>     (NGƯỜI chạy) xoá baseline của một bước

Mỗi bước lưu: số lỗi + (nếu tách được) danh sách test đang fail. Lỗi mới, test fail mới → đỏ.
Khi số lỗi giảm và đang ở nhánh chính, baseline tự siết xuống (ratchet) — không bao giờ tự nới.
File .harness/baseline.json được hook bảo vệ: agent không tự sửa được.
"""
import json
import os
import re
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
BASE = os.path.join(ROOT, ".harness", "baseline.json")
LOGDIR = os.path.join(ROOT, ".harness", "verify")

ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")
FAIL_LINE = re.compile(r"^\s*(?:FAIL|×|✗|✕|not ok \d+ -)\s+(.+?)\s*(?:\d+ms)?\s*$")


def strip(text):
    return ANSI.sub("", text or "")


def count(step, text):
    t = strip(text)
    rules = {
        "typecheck": [(r"error TS\d+", "n"), (r"Found (\d+) errors?", "g")],
        "lint": [(r"✖ (\d+) problems?", "g"), (r"Found (\d+) errors?", "g"), (r"(\d+) errors?", "g")],
        "test": [(r"Tests?:?\s+(\d+) failed", "g"), (r"# fail (\d+)", "g"), (r"(\d+) failed", "g")],
        "build": [(r"error TS\d+", "n"), (r"(?i)\berror\b", "n")],
    }.get(step, [(r"(?i)\berror\b", "n")])
    for pat, mode in rules:
        found = re.findall(pat, t)
        if found:
            return (len(found) if mode == "n" else max(int(x) for x in found)), pat
    n = len(re.findall(r"(?i)\b(error|failed|fail)\b", t))
    return max(n, 1), "fallback"


def failing_ids(text):
    ids = set()
    for line in strip(text).splitlines():
        m = FAIL_LINE.match(line)
        if m:
            ids.add(re.sub(r"\s+\[\d+(\.\d+)?m?s\]$", "", m.group(1)).strip())
    return sorted(ids)


def load():
    try:
        return json.load(open(BASE, encoding="utf-8"))
    except Exception:
        return {}


def save(data):
    os.makedirs(os.path.dirname(BASE), exist_ok=True)
    with open(BASE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def on_main_root():
    try:
        cfg = json.load(open(os.path.join(ROOT, ".harness", "config.json")))
    except Exception:
        cfg = {}
    branch = subprocess.run(["git", "-C", ROOT, "rev-parse", "--abbrev-ref", "HEAD"],
                            capture_output=True, text=True, encoding="utf-8", errors="replace").stdout.strip()
    return "/.worktrees/" not in ROOT.replace("\\", "/") and branch == cfg.get("main_branch", "main")


def cmd_capture(_args):
    last = os.path.join(LOGDIR, "last.txt")
    if not os.path.exists(last):
        print("Chưa có lần verify nào — chạy python scripts/verify.py trước."); return 1
    fails = []
    for line in open(last, encoding="utf-8"):
        if line.startswith(("fail:", "debt:")):
            fails += [s for s in line[5:].split() if s]
    fails = [s for s in fails if s not in ("harness", "install")]
    data = {}
    for step in fails:
        text = open(os.path.join(LOGDIR, f"{step}.log"), encoding="utf-8", errors="replace").read()
        n, method = count(step, text)
        data[step] = {"count": n, "method": method, "failing": failing_ids(text) if step == "test" else []}
    save(data)
    if not data:
        print("Verify đang xanh — không có nợ cũ, không cần baseline."); return 0
    print("Đã chụp baseline nợ cũ:")
    return cmd_show([])


def cmd_show(_args):
    data = load()
    if not data:
        print("Không có nợ cũ (baseline trống)."); return 0
    for step, b in data.items():
        extra = f", {len(b.get('failing', []))} test fail đã biết" if b.get("failing") else ""
        print(f"  {step:<10} {b['count']} lỗi{extra}  (đếm theo: {b['method']})")
    return 0


def cmd_check(args):
    step, logf = args[0], args[1]
    data = load()
    b = data.get(step)
    if not b:
        return 1
    text = open(logf, encoding="utf-8", errors="replace").read()
    n, _ = count(step, text)
    new_ids = [i for i in failing_ids(text) if i not in set(b.get("failing", []))] if b.get("failing") else []
    if new_ids:
        print(f"      test fail MỚI (không có trong nợ cũ): {', '.join(new_ids[:5])}")
        return 1
    if n > b["count"]:
        print(f"      nợ tăng: {n} lỗi > baseline {b['count']}")
        return 1
    msg = f"nợ cũ {n}/{b['count']}"
    if n < b["count"] and on_main_root():
        b["count"] = n
        if step == "test":
            b["failing"] = failing_ids(text)
        if n == 0:
            data.pop(step)
        save(data)
        msg += " — đã siết baseline xuống (commit .harness/baseline.json)"
    print(f"      {msg}")
    return 0


def cmd_clear(args):
    data = load()
    data.pop(args[0], None)
    save(data)
    print(f"đã xoá baseline {args[0]}")
    return 0


if __name__ == "__main__":
    cmds = {"capture": cmd_capture, "show": cmd_show, "check": cmd_check, "clear": cmd_clear}
    if len(sys.argv) < 2 or sys.argv[1] not in cmds:
        print(__doc__); sys.exit(1)
    sys.exit(cmds[sys.argv[1]](sys.argv[2:]))
