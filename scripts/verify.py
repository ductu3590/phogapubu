#!/usr/bin/env python3
"""Một lệnh duy nhất để biết thế nào là xong.

  python scripts/verify.py          chạy đủ: harness → lint → typecheck → test → build → verify.d/*
  python scripts/verify.py --fast   bỏ build
Thoát 0 = xanh. Log từng bước: .harness/verify/<bước>.log
Dự án adopt: bước có trong .harness/baseline.json mà không xấu hơn → "~ nợ cũ" (vẫn xanh).
"""
import glob
import json
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hk_common import ROOT, config, fix_stdio, git, sh  # noqa: E402

fix_stdio()
os.chdir(ROOT)
FAST = "--fast" in sys.argv
LOGDIR = os.path.join(ROOT, ".harness", "verify")
os.makedirs(LOGDIR, exist_ok=True)
PASS, FAIL, SKIP, DEBT = [], [], [], []


def has_baseline():
    try:
        return bool(json.load(open(os.path.join(ROOT, ".harness", "baseline.json"), encoding="utf-8")))
    except Exception:
        return False


HAS_BASELINE = has_baseline()


def baseline_check(name, log):
    r = subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "baseline.py"), "check", name, log],
                       capture_output=True)
    return r.returncode == 0, (r.stdout or b"").decode("utf-8", errors="replace").rstrip()


def run_step(name, cmd):
    log = os.path.join(LOGDIR, f"{name}.log")
    start = time.time()
    code, out = sh(cmd, env=dict(os.environ, CI="1", FORCE_COLOR="0"))
    with open(log, "w", encoding="utf-8") as f:
        f.write(out)
    secs = int(time.time() - start)
    if code == 0:
        PASS.append(name)
        print(f"  ✓ {name:<12} {secs}s")
        if HAS_BASELINE:
            baseline_check(name, log)  # để siết baseline khi nợ về 0
        return
    if HAS_BASELINE:
        ok, note = baseline_check(name, log)
        if ok:
            DEBT.append(name)
            print(f"  ~ {name:<12} {secs}s  nợ cũ, không tăng")
            if note:
                print(note)
            return
        if note:
            print(note)
    FAIL.append(name)
    print(f"  ✗ {name:<12} {secs}s  (log: .harness/verify/{name}.log)")
    for line in out.rstrip().splitlines()[-40:]:
        print("      │ " + line)


_, branch, _ = git("rev-parse", "--abbrev-ref", "HEAD")
print(f"verify: {os.path.basename(ROOT)} @ {branch or '?'}")

# 1. harness tự kiểm
run_step("harness", [sys.executable, os.path.join("scripts", "tasks.py"), "lint"])

# 2. script trong package.json
if os.path.exists("package.json"):
    if os.path.exists("pnpm-lock.yaml"):
        pm = "pnpm"
    elif os.path.exists("yarn.lock"):
        pm = "yarn"
    elif os.path.exists("bun.lockb") or os.path.exists("bun.lock"):
        pm = "bun"
    else:
        pm = "npm"
    if not os.path.isdir("node_modules"):
        run_step("install", config().get("install_cmd") or f"{pm} install")
    try:
        scripts = json.load(open("package.json", encoding="utf-8")).get("scripts", {})
    except Exception:
        scripts = {}
    for s in ("lint", "typecheck", "test", "build"):
        if s == "build" and FAST:
            SKIP.append("build")
            continue
        if s in scripts:
            run_step(s, f"{pm} run {s}")
        else:
            SKIP.append(s)
else:
    SKIP.append("package.json")

# 3. kiểm tra bổ sung theo dự án: verify.d/*.py | *.sh | *.ps1
for f in sorted(glob.glob(os.path.join("scripts", "verify.d", "*"))):
    name, ext = os.path.splitext(os.path.basename(f))
    if ext == ".py":
        run_step(name, [sys.executable, f])
    elif ext == ".sh" and shutil.which("bash"):
        run_step(name, ["bash", f])
    elif ext == ".ps1" and shutil.which("powershell"):
        run_step(name, ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", f])

print()
if SKIP:
    print("  bỏ qua: " + " ".join(SKIP))
with open(os.path.join(LOGDIR, "last.txt"), "w", encoding="utf-8") as fh:
    fh.write(f"time: {datetime.now().isoformat(timespec='seconds')}\nbranch: {branch}\n"
             f"pass: {' '.join(PASS)}\nfail: {' '.join(FAIL)}\ndebt: {' '.join(DEBT)}\nskip: {' '.join(SKIP)}\n")
if FAIL:
    print("VERIFY ĐỎ ✗ — " + " ".join(FAIL))
    sys.exit(1)
if DEBT:
    print(f"VERIFY XANH ✓ (còn nợ cũ: {' '.join(DEBT)} — xem python scripts/baseline.py show)")
else:
    print("VERIFY XANH ✓")
