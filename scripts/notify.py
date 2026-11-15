#!/usr/bin/env python3
"""Báo anh Tú qua Telegram.

  python scripts/notify.py "nội dung"
  python scripts/notify.py --hook        (dùng trong Notification hook: đọc JSON từ stdin)
Cấu hình: <harness-kit>/env (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID). Thiếu cấu hình → chỉ ghi log.
"""
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hk_common import ROOT, fix_stdio, kit_home  # noqa: E402

fix_stdio()


def load_env():
    path = os.environ.get("HARNESS_ENV") or os.path.join(kit_home(), "env")
    env = {}
    try:
        for line in open(path, encoding="utf-8"):
            m = re.match(r'^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\n]*)"?\s*$', line)
            if m:
                env[m.group(1)] = m.group(2).strip()
    except Exception:
        pass
    return env


def send(msg):
    if not msg:
        return 0
    try:
        os.makedirs(os.path.join(ROOT, ".harness"), exist_ok=True)
        with open(os.path.join(ROOT, ".harness", "notify.log"), "a", encoding="utf-8") as f:
            f.write(f"{datetime.now().isoformat(timespec='seconds')} {msg}\n")
    except Exception:
        pass
    env = load_env()
    token, chat = env.get("TELEGRAM_BOT_TOKEN"), env.get("TELEGRAM_CHAT_ID")
    if not token or not chat:
        print(f"notify (chưa cấu hình Telegram): {msg}", file=sys.stderr)
        return 0
    data = urllib.parse.urlencode({"chat_id": chat, "text": msg, "disable_web_page_preview": "true"}).encode()
    try:
        urllib.request.urlopen(f"https://api.telegram.org/bot{token}/sendMessage", data=data, timeout=10)
    except Exception as e:
        print(f"notify: gửi Telegram lỗi ({type(e).__name__})", file=sys.stderr)
    return 0


if __name__ == "__main__":
    if "--hook" in sys.argv:
        try:
            m = json.load(sys.stdin).get("message", "")
        except Exception:
            m = ""
        sys.exit(send(f"🔔 {os.path.basename(ROOT)}: {m}" if m else ""))
    sys.exit(send(" ".join(sys.argv[1:])))
