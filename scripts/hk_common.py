"""Tiện ích dùng chung cho script harness — chạy được trên Windows (Git Bash / PowerShell), macOS, Linux."""
import json
import os
import subprocess
import sys

IS_WIN = os.name == "nt"


def fix_stdio():
    """Console Windows mặc định không phải UTF-8 → in tiếng Việt sẽ lỗi. Ép UTF-8."""
    for s in (sys.stdout, sys.stderr):
        try:
            s.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass


def git_root(start=None):
    start = start or os.path.dirname(os.path.abspath(__file__))
    try:
        out = subprocess.run(["git", "-C", start, "rev-parse", "--show-toplevel"],
                             capture_output=True, text=True, timeout=10).stdout.strip()
        if out:
            return os.path.normpath(out)
    except Exception:
        pass
    return os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))


ROOT = git_root()


def config():
    try:
        with open(os.path.join(ROOT, ".harness", "config.json"), encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def kit_home():
    env = os.environ.get("HARNESS_KIT_HOME")
    if env:
        return env
    for p in (os.path.join(os.path.expanduser("~"), ".claude", "harness-kit"),
              os.path.join(os.path.expanduser("~"), ".harness-kit")):
        if os.path.isdir(p):
            return p
    return os.path.join(os.path.expanduser("~"), ".claude", "harness-kit")


def sh(cmd, cwd=None, capture=True, env=None, timeout=None):
    """Chạy lệnh. cmd là list (chạy thẳng) hoặc chuỗi (qua shell — cần cho pnpm/npx trên Windows vì là .cmd)."""
    r = subprocess.run(cmd, cwd=cwd or ROOT, shell=isinstance(cmd, str), env=env, timeout=timeout,
                       stdout=subprocess.PIPE if capture else None,
                       stderr=subprocess.STDOUT if capture else None)
    out = r.stdout.decode("utf-8", errors="replace") if capture and r.stdout is not None else ""
    return r.returncode, out


def git(*args, cwd=None, check=False):
    r = subprocess.run(["git", *args], cwd=cwd or ROOT, capture_output=True)
    out = (r.stdout or b"").decode("utf-8", errors="replace").strip()
    err = (r.stderr or b"").decode("utf-8", errors="replace").strip()
    if check and r.returncode != 0:
        raise RuntimeError(err or out)
    return r.returncode, out, err


def py():
    """Lệnh python hiện tại (dùng để gọi script khác)."""
    return sys.executable


def rel(path, root=None):
    return os.path.relpath(path, root or ROOT).replace("\\", "/")
