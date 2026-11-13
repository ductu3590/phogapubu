#!/usr/bin/env python3
""""Đôi mắt" cho agent: chụp một trang rồi đọc ảnh bằng Read.

  python scripts/ui_shot.py <path|url> [tên] [--mobile] [--wait <ms>]
  vd: python scripts/ui_shot.py /login login --mobile   →  .harness/screens/login.png
"""
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hk_common import IS_WIN, ROOT, fix_stdio, sh  # noqa: E402

fix_stdio()
a = sys.argv[1:]
if not a:
    print(__doc__)
    sys.exit(1)
target, name, view, wait = a[0], "shot-" + time.strftime("%H%M%S"), "1280,800", "1500"
i = 1
while i < len(a):
    if a[i] == "--mobile":
        view = "390,844"
    elif a[i] == "--wait" and i + 1 < len(a):
        wait = a[i + 1]
        i += 1
    else:
        name = a[i]
    i += 1

if target.startswith(("http://", "https://")):
    url = target
else:
    r = subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "run.py"), "start"], capture_output=True)
    out = (r.stdout or b"").decode("utf-8", errors="replace").strip().splitlines()
    if r.returncode != 0 or not out:
        print((r.stderr or b"").decode("utf-8", errors="replace"), file=sys.stderr)
        sys.exit(1)
    url = out[-1].split()[0] + target

os.makedirs(os.path.join(ROOT, ".harness", "screens"), exist_ok=True)
outp = os.path.join(ROOT, ".harness", "screens", f"{name}.png")
local = os.path.join(ROOT, "node_modules", ".bin", "playwright.cmd" if IS_WIN else "playwright")
pw = f'"{local}"' if os.path.exists(local) else "npx -y playwright"
cmd = f'{pw} screenshot --full-page --viewport-size="{view}" --wait-for-timeout={wait} "{url}" "{outp}"'

code, out = sh(cmd)
if code != 0 and ("Executable doesn't exist" in out or "install" in out.lower()):
    sh(f"{pw} install chromium")
    code, out = sh(cmd)
if code != 0:
    print(out, file=sys.stderr)
    sys.exit(1)
print(outp)
