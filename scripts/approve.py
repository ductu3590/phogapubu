#!/usr/bin/env python3
"""CHỈ NGƯỜI CHẠY. Mở khoá tạm một cổng cứng (hook chặn agent chạy lệnh này).

  python scripts/approve.py <gate> [giờ=1]     vd: approve.py auth 2 · approve.py harness 1 · approve.py scope-T-003 1
  python scripts/approve.py --list
  python scripts/approve.py --revoke <gate|all>
Cổng: data · deploy · git · secrets · test · harness · auth · test_config · contracts · payments · legacy · scope-<ID>
"""
import getpass
import json
import os
import sys
import time
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hk_common import ROOT, fix_stdio  # noqa: E402

fix_stdio()
F = os.path.join(ROOT, ".harness", "unlocks.json")
os.makedirs(os.path.dirname(F), exist_ok=True)


def load():
    try:
        return json.load(open(F, encoding="utf-8"))
    except Exception:
        return {}


def save(d):
    json.dump(d, open(F, "w", encoding="utf-8"), indent=2)


a = sys.argv[1:]
if not a or a[0] in ("-h", "--help"):
    print(__doc__)
elif a[0] == "--list":
    live = {k: v for k, v in load().items() if v > time.time()}
    print("\n".join(f"  {k:<14} đến {datetime.fromtimestamp(v):%H:%M %d/%m}" for k, v in live.items())
          or "  (không cổng nào đang mở)")
elif a[0] == "--revoke":
    g = a[1] if len(a) > 1 else "all"
    d = {} if g == "all" else {k: v for k, v in load().items() if k != g}
    save(d)
    print("đã khoá lại:", g)
else:
    gate, hours = a[0], float(a[1]) if len(a) > 1 else 1.0
    if gate in ("human-only", "system"):
        print(f"Cổng '{gate}' không mở được.")
        sys.exit(1)
    d = load()
    d[gate] = time.time() + hours * 3600
    save(d)
    print(f"✓ mở cổng '{gate}' đến {datetime.fromtimestamp(d[gate]):%H:%M %d/%m} ({hours:g} giờ)")
    with open(os.path.join(ROOT, ".harness", "gate-events.log"), "a", encoding="utf-8") as f:
        f.write(f"{datetime.now().isoformat(timespec='seconds')} | approve | {gate} | {hours:g}h by {getpass.getuser()}\n")
