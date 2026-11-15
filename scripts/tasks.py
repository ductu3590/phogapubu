#!/usr/bin/env python3
"""Quản lý task trong docs/tasks/*.md (frontmatter).

  python scripts/tasks.py list                 bảng trạng thái
  python scripts/tasks.py ready [--max N]      task sẵn sàng giao, không chồng paths với task đang chạy
  python scripts/tasks.py set <ID> <status>    đổi status (chỉ orchestrator)
  python scripts/tasks.py show <ID>            in frontmatter dạng JSON
  python scripts/tasks.py next-id              ID task kế tiếp
  python scripts/tasks.py lint                 kiểm định dạng, phụ thuộc, paths chồng lấn
  python scripts/tasks.py friction-id          ID friction kế tiếp
  python scripts/tasks.py friction-stats       thống kê friction theo tag
  python scripts/tasks.py paths-from-branch <nhánh>   gợi ý paths cho task tiếp quản nhánh dở
"""
import json
import os
import re
import sys
from collections import Counter, defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
TASK_DIR = os.path.join(ROOT, "docs", "tasks")
FRICTION = os.path.join(ROOT, "docs", "FRICTION_LOG.md")
STATUSES = ["todo", "in_progress", "review", "done", "blocked"]
AGENTS = ["orchestrator", "backend-dev", "frontend-dev", "qa-tester"]
CONTRACT_GLOBS = ["src/contracts/**", "packages/contracts/**"]


def _clean(v):
    return v.split(" #")[0].strip().strip("'\"")


def parse_frontmatter(text):
    m = re.match(r"^---\s*\n(.*?)\n---", text, re.S)
    if not m:
        return None
    data, key = {}, None
    for line in m.group(1).splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        item = re.match(r"^\s+-\s+(.*)$", line)
        if item and key:
            data.setdefault(key, [])
            if isinstance(data[key], list):
                data[key].append(_clean(item.group(1)))
            continue
        kv = re.match(r"^([A-Za-z_][\w-]*)\s*:\s*(.*)$", line)
        if kv:
            key, val = kv.group(1), kv.group(2).split(" #")[0].strip()
            if val.startswith("[") and val.endswith("]"):
                data[key] = [_clean(v) for v in val[1:-1].split(",") if v.strip()]
            elif val == "":
                data[key] = []
            else:
                data[key] = _clean(val)
    return data


def glob_to_regex(pattern):
    i, out = 0, ""
    while i < len(pattern):
        if pattern.startswith("**/", i):
            out += "(?:.*/)?"; i += 3
        elif pattern.startswith("**", i):
            out += ".*"; i += 2
        elif pattern[i] == "*":
            out += "[^/]*"; i += 1
        elif pattern[i] == "?":
            out += "[^/]"; i += 1
        else:
            out += re.escape(pattern[i]); i += 1
    return re.compile("^" + out + "$")


def sample(pattern):
    return pattern.replace("**", "x/x").replace("*", "x").replace("?", "x")


def globs_overlap(a, b):
    return bool(glob_to_regex(a).match(sample(b)) or glob_to_regex(b).match(sample(a)))


def paths_overlap(pa, pb):
    return any(globs_overlap(a, b) for a in pa for b in pb)


def load_tasks():
    tasks = {}
    if not os.path.isdir(TASK_DIR):
        return tasks
    for name in sorted(os.listdir(TASK_DIR)):
        if not re.match(r"^[A-Z]+-\d+.*\.md$", name):
            continue
        path = os.path.join(TASK_DIR, name)
        with open(path, encoding="utf-8") as f:
            meta = parse_frontmatter(f.read().replace("\r\n", "\n"))
        if meta is None:
            meta = {"id": name.split("-")[0] + "-" + name.split("-")[1].split(".")[0], "_error": "thiếu frontmatter"}
        meta["_file"] = path
        meta.setdefault("status", "todo")
        meta.setdefault("depends_on", [])
        meta.setdefault("paths", [])
        if isinstance(meta["depends_on"], str):
            meta["depends_on"] = [meta["depends_on"]]
        if isinstance(meta["paths"], str):
            meta["paths"] = [meta["paths"]]
        tasks[meta.get("id", name)] = meta
    return tasks


def config():
    try:
        with open(os.path.join(ROOT, ".harness", "config.json"), encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def cmd_list(tasks, _args):
    if not tasks:
        print("(chưa có task)"); return 0
    icon = {"todo": "·", "in_progress": "▶", "review": "◆", "done": "✓", "blocked": "✗"}
    counts = Counter(t["status"] for t in tasks.values())
    for tid, t in tasks.items():
        deps = ",".join(t["depends_on"]) or "-"
        print(f"{icon.get(t['status'], '?')} {tid:<7} {t['status']:<11} {t.get('agent', '?'):<13} deps:{deps:<16} {t.get('title', '')}")
    print("\n" + "  ".join(f"{s}:{counts.get(s, 0)}" for s in STATUSES))
    return 0


def ready_list(tasks, max_n):
    running = [t for t in tasks.values() if t["status"] == "in_progress"]
    picked = []
    for tid, t in tasks.items():
        if t["status"] != "todo":
            continue
        if any(tasks.get(d, {}).get("status") != "done" for d in t["depends_on"]):
            continue
        if tid != "T-000" and tasks.get("T-000", {}).get("status", "done") != "done":
            continue
        busy = running + picked
        if any(paths_overlap(t["paths"], o["paths"]) for o in busy):
            continue
        if t.get("agent") == "orchestrator" and busy:
            continue
        picked.append(t)
        if len(picked) >= max_n:
            break
    return picked


def cmd_ready(tasks, args):
    max_n = int(config().get("max_parallel", 3))
    if "--max" in args:
        max_n = int(args[args.index("--max") + 1])
    running = sum(1 for t in tasks.values() if t["status"] == "in_progress")
    picked = ready_list(tasks, max(0, max_n)) if max_n > 0 else []
    if "--json" in args:
        print(json.dumps([{k: v for k, v in t.items() if not k.startswith("_")} for t in picked], ensure_ascii=False))
        return 0
    for t in picked:
        print(f"{t['id']}\t{t.get('agent', '?')}\t{t.get('title', '')}")
    if not picked:
        todo = [t for t in tasks.values() if t["status"] == "todo"]
        print(f"(không có task sẵn sàng — todo:{len(todo)}, đang chạy:{running})", file=sys.stderr)
    return 0


def cmd_set(tasks, args):
    if len(args) < 2 or args[1] not in STATUSES:
        print(f"Dùng: set <ID> <{'|'.join(STATUSES)}>", file=sys.stderr); return 1
    tid, status = args[0], args[1]
    t = tasks.get(tid)
    if not t:
        print(f"Không thấy task {tid}", file=sys.stderr); return 1
    with open(t["_file"], encoding="utf-8", newline="") as f:
        text = f.read()
    new, n = re.subn(r"(?m)^(status\s*:\s*)[^\s#]+[^\r\n]*", rf"\g<1>{status}", text, count=1)
    if n == 0:
        new = re.sub(r"^---\s*\n", f"---\nstatus: {status}\n", text, count=1)
    with open(t["_file"], "w", encoding="utf-8", newline="") as f:
        f.write(new)
    print(f"{tid}: {t['status']} → {status}")
    return 0


def cmd_show(tasks, args):
    t = tasks.get(args[0]) if args else None
    if not t:
        print("{}"); return 1
    out = {k: v for k, v in t.items() if not k.startswith("_")}
    out["file"] = os.path.relpath(t["_file"], ROOT)
    print(json.dumps(out, ensure_ascii=False))
    return 0


def cmd_next_id(tasks, _args):
    nums = [int(m.group(1)) for tid in tasks for m in [re.match(r"^T-(\d+)$", tid)] if m]
    print(f"T-{(max(nums) + 1) if nums else 0:03d}")
    return 0


def cmd_lint(tasks, _args):
    errors, warns = [], []
    for tid, t in tasks.items():
        f = os.path.relpath(t["_file"], ROOT)
        if t.get("_error"):
            errors.append(f"{f}: {t['_error']}"); continue
        for k in ("id", "title", "agent"):
            if not t.get(k):
                errors.append(f"{f}: thiếu '{k}'")
        if t["status"] not in STATUSES:
            errors.append(f"{f}: status '{t['status']}' không hợp lệ")
        if t.get("agent") and t["agent"] not in AGENTS:
            warns.append(f"{f}: agent '{t['agent']}' không có trong {AGENTS}")
        if not t["paths"]:
            errors.append(f"{f}: thiếu 'paths' (vùng sở hữu)")
        for d in t["depends_on"]:
            if d not in tasks:
                errors.append(f"{f}: depends_on '{d}' không tồn tại")
        if t.get("agent") not in ("orchestrator", None) and any(paths_overlap([p], CONTRACT_GLOBS) for p in t["paths"]):
            warns.append(f"{f}: paths chồng với contracts — contracts nên do orchestrator đổi")
    # vòng phụ thuộc
    state = {}
    def visit(n, stack):
        if state.get(n) == 1:
            errors.append("Vòng phụ thuộc: " + " → ".join(stack + [n])); return
        if state.get(n) == 2 or n not in tasks:
            return
        state[n] = 1
        for d in tasks[n]["depends_on"]:
            visit(d, stack + [n])
        state[n] = 2
    for n in tasks:
        visit(n, [])
    for e in errors:
        print("LỖI  " + e)
    for w in warns:
        print("CẢNH " + w)
    if not errors:
        print(f"tasks: {len(tasks)} task hợp lệ" + (f", {len(warns)} cảnh báo" if warns else ""))
    return 1 if errors else 0


def read_friction():
    try:
        with open(FRICTION, encoding="utf-8") as f:
            text = f.read().replace("\r\n", "\n")
    except Exception:
        return []
    marker = "<!-- Các mục mới"
    if marker in text:
        text = text.split(marker, 1)[1]
    entries = []
    for m in re.finditer(r"^### (F-\d+)\s*·\s*([^·\n]*)·\s*([^·\n]*)·\s*tag:\s*(\S+)\s*\n(.*?)(?=^### |\Z)", text, re.M | re.S):
        body = m.group(5)
        actual = re.search(r"Thực tế:\s*(.*)", body)
        entries.append({"id": m.group(1), "date": m.group(2).strip(), "task": m.group(3).strip(),
                        "tag": m.group(4), "actual": (actual.group(1).strip() if actual else "")})
    return entries


def cmd_friction_id(_tasks, _args):
    nums = [int(e["id"].split("-")[1]) for e in read_friction()]
    print(f"F-{(max(nums) + 1) if nums else 1:03d}")
    return 0


def cmd_friction_stats(_tasks, _args):
    entries = read_friction()
    if not entries:
        print("Friction log trống."); return 0
    by_tag = defaultdict(list)
    for e in entries:
        by_tag[e["tag"]].append(e["id"])
    print("Theo tag (≥2 = cần sửa macro):")
    for tag, ids in sorted(by_tag.items(), key=lambda x: -len(x[1])):
        flag = "  ← MACRO" if len(ids) >= 2 else ""
        print(f"  {tag:<16} {len(ids)}  {', '.join(ids)}{flag}")
    pending = [e["id"] for e in entries if not e["actual"] or e["actual"].startswith("(")]
    print(f"\nChưa có 'Thực tế': {', '.join(pending) or 'không'}")
    return 0


def cmd_paths_from_branch(_tasks, args):
    """Gợi ý paths cho task tiếp quản một nhánh dở: các thư mục mà nhánh đã đụng."""
    import subprocess
    if not args:
        print("Dùng: paths-from-branch <nhánh>", file=sys.stderr); return 1
    main = config().get("main_branch", "main")
    out = subprocess.run(["git", "-C", ROOT, "diff", "--name-only", f"{main}...{args[0]}"],
                         capture_output=True, text=True, encoding="utf-8", errors="replace")
    if out.returncode != 0:
        print(out.stderr.strip(), file=sys.stderr); return 1
    globs = set()
    for f in out.stdout.split():
        parts = f.split("/")
        if len(parts) == 1:
            globs.add(f)
        else:
            depth = 3 if parts[0] in ("src", "apps", "packages") and len(parts) > 3 else 2
            globs.add("/".join(parts[:min(depth, len(parts) - 1)]) + "/**")
    globs = sorted(g for g in globs if not any(g != o and o.endswith("/**") and g.startswith(o[:-2]) for o in globs))
    print("paths:")
    for g in globs:
        print(f"  - {g}")
    return 0


COMMANDS = {
    "paths-from-branch": cmd_paths_from_branch,
    "list": cmd_list, "ready": cmd_ready, "set": cmd_set, "show": cmd_show,
    "next-id": cmd_next_id, "lint": cmd_lint,
    "friction-id": cmd_friction_id, "friction-stats": cmd_friction_stats,
}

if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        print(__doc__); sys.exit(1)
    sys.exit(COMMANDS[sys.argv[1]](load_tasks(), sys.argv[2:]))
