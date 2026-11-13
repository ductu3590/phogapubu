#!/usr/bin/env python3
"""Đọc log ở một chỗ — để agent tự điều tra thay vì đoán.

  python scripts/logs.py dev [-n 200]       log dev server (scripts/run.py)
  python scripts/logs.py errors [-n 200]    lọc dòng lỗi từ dev log
  python scripts/logs.py docker [-n 200]    docker compose logs
  python scripts/logs.py supabase [-n 200]  log container Supabase local
  python scripts/logs.py ci                 lần chạy CI gần nhất (cần gh)
  python scripts/logs.py verify             kết quả verify gần nhất
"""
import glob
import os
import re
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hk_common import ROOT, fix_stdio, sh  # noqa: E402

fix_stdio()
args = sys.argv[1:]
what = args[0] if args else "dev"
n = int(args[args.index("-n") + 1]) if "-n" in args else 200
devlog = os.path.join(ROOT, ".harness", "run", "dev.log")


def tail(path, k):
    try:
        return "".join(open(path, encoding="utf-8", errors="replace").readlines()[-k:])
    except Exception:
        return None


if what == "dev":
    print(tail(devlog, n) or "(chưa có log — python scripts/run.py start)")
elif what == "errors":
    t = tail(devlog, 100000) or ""
    hits = [l for l in t.splitlines() if re.search(r"error|exception|unhandled|failed|ECONNREFUSED|TypeError|\b500\b", l, re.I)]
    print("\n".join(hits[-n:]) or "(không có lỗi)")
elif what == "docker":
    print(sh(["docker", "compose", "logs", "--no-color", "--tail", str(n)])[1])
elif what == "supabase":
    _, names = sh(["docker", "ps", "--format", "{{.Names}}"])
    for c in [x for x in names.split() if re.match(r"^supabase_(db|auth|rest|kong|edge)", x)]:
        print(f"===== {c}")
        print(sh(["docker", "logs", "--tail", str(max(n // 4, 20)), c])[1])
elif what == "ci":
    if not shutil.which("gh"):
        print("cần gh CLI")
        sys.exit(1)
    print(sh(["gh", "run", "list", "--limit", "5"])[1])
    _, rid = sh(["gh", "run", "list", "--limit", "1", "--json", "databaseId,conclusion",
                 "-q", '.[0] | select(.conclusion=="failure") | .databaseId'])
    if rid.strip():
        print(f"===== log lỗi run {rid.strip()}")
        print("\n".join(sh(["gh", "run", "view", rid.strip(), "--log-failed"])[1].splitlines()[-n:]))
elif what == "verify":
    print(tail(os.path.join(ROOT, ".harness", "verify", "last.txt"), 20) or "(chưa chạy verify)")
    for f in sorted(glob.glob(os.path.join(ROOT, ".harness", "verify", "*.log"))):
        print("-- " + os.path.relpath(f, ROOT))
else:
    print(__doc__)
    sys.exit(1)
