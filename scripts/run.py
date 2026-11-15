#!/usr/bin/env python3
"""Chạy app ở nền để agent tự nhìn/curl/chụp.

  python scripts/run.py start | stop | restart | status | url
Lệnh chạy & cổng: .harness/config.json (dev_cmd, port). Trong worktree tự đổi cổng để các agent chạy song song.
Log: .harness/run/dev.log
"""
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
import zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hk_common import IS_WIN, ROOT, config, fix_stdio  # noqa: E402

fix_stdio()
CFG = config()
RUN = os.path.join(ROOT, ".harness", "run")
os.makedirs(RUN, exist_ok=True)
PIDF, LOG = os.path.join(RUN, "dev.pid"), os.path.join(RUN, "dev.log")
DEV_CMD = CFG.get("dev_cmd", "pnpm dev")
BASE = int(CFG.get("port", 3000))
norm = ROOT.replace("\\", "/")
if "/.worktrees/" in norm:
    PORT = BASE + zlib.crc32(os.path.basename(norm).encode()) % 80 + 1
else:
    PORT = BASE
URL = f"http://localhost:{PORT}"


def read_pid():
    try:
        return int(open(PIDF).read().strip())
    except Exception:
        return None


def alive(pid):
    if not pid:
        return False
    if IS_WIN:
        import ctypes
        k = ctypes.windll.kernel32
        h = k.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED_INFORMATION
        if not h:
            return False
        code = ctypes.c_ulong()
        k.GetExitCodeProcess(h, ctypes.byref(code))
        k.CloseHandle(h)
        return code.value == 259  # STILL_ACTIVE
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def up():
    try:
        urllib.request.urlopen(URL, timeout=2)
        return True
    except urllib.error.HTTPError:
        return True  # server trả lời (dù 404/500) là đã chạy
    except Exception:
        return False


def start():
    pid = read_pid()
    if alive(pid):
        print(f"{URL} (đang chạy, pid {pid})")
        return 0
    env = dict(os.environ, PORT=str(PORT))
    logf = open(LOG, "w", encoding="utf-8")
    kw = dict(cwd=ROOT, shell=True, stdout=logf, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, env=env)
    if IS_WIN:
        flags = 0x00000200 | 0x08000000  # CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW
        try:
            p = subprocess.Popen(DEV_CMD, creationflags=flags | 0x01000000, **kw)  # + BREAKAWAY_FROM_JOB
        except OSError:
            p = subprocess.Popen(DEV_CMD, creationflags=flags, **kw)
    else:
        p = subprocess.Popen(DEV_CMD, start_new_session=True, **kw)
    open(PIDF, "w").write(str(p.pid))
    for _ in range(90):
        if up():
            print(URL)
            return 0
        if p.poll() is not None:
            print("dev server dừng khi khởi động — python scripts/logs.py dev", file=sys.stderr)
            print("".join(open(LOG, encoding="utf-8", errors="replace").readlines()[-30:]), file=sys.stderr)
            return 1
        time.sleep(1)
    print(f"hết 90s chưa thấy {URL} trả lời — xem python scripts/logs.py dev", file=sys.stderr)
    return 1


def stop():
    pid = read_pid()
    if alive(pid):
        if IS_WIN:
            subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True)
        else:
            import signal
            try:
                os.killpg(pid, signal.SIGTERM)
            except Exception:
                try:
                    os.kill(pid, signal.SIGTERM)
                except Exception:
                    pass
    try:
        os.remove(PIDF)
    except OSError:
        pass
    print("đã dừng")
    return 0


def status():
    pid = read_pid()
    if alive(pid):
        print(f"đang chạy pid {pid} · {URL} · {'trả lời OK' if up() else 'chưa trả lời'}")
    else:
        print(f"không chạy · {URL}")
    return 0


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    if cmd == "start":
        sys.exit(start())
    if cmd == "stop":
        sys.exit(stop())
    if cmd == "restart":
        stop()
        sys.exit(start())
    if cmd == "status":
        sys.exit(status())
    if cmd == "url":
        print(URL)
        sys.exit(0)
    print(__doc__)
    sys.exit(1)
