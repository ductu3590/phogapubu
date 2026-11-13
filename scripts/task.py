#!/usr/bin/env python3
"""Worktree cho từng task — mỗi agent một nhánh, một thư mục, không đè nhau.

  python scripts/task.py start  <ID>                  tạo .worktrees/<ID> (nhánh task/<ID>) từ nhánh chính, cài deps, status → in_progress
  python scripts/task.py start  <ID> --from <nhánh>   tiếp quản nhánh đang làm dở: task/<ID> bắt đầu từ nhánh đó, ghép nhánh chính vào ngay
  python scripts/task.py finish <ID>                  commit việc dở → verify → ghép nhánh chính mới nhất → verify → merge --no-ff → dọn, status → review
  python scripts/task.py abort  <ID>                  bỏ worktree (giữ nhánh để xem lại)
  python scripts/task.py list
Mã thoát finish: 0 merge xong · 2 verify đỏ · 3 conflict · 1 lỗi khác
"""
import json
import os
import shutil
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hk_common import ROOT, config, fix_stdio, git, sh  # noqa: E402
import tasks as T  # noqa: E402

fix_stdio()
CFG = config()
MAIN = CFG.get("main_branch", "main")


def die(msg, code=1):
    print(f"task.py: {msg}", file=sys.stderr)
    sys.exit(code)


def task_or_die(tid):
    t = T.load_tasks().get(tid)
    if not t:
        die(f"không thấy docs/tasks/{tid}-*.md")
    return t


def on_main():
    _, cur, _ = git("rev-parse", "--abbrev-ref", "HEAD")
    if cur != MAIN:
        die(f"repo gốc phải đang ở nhánh {MAIN} (đang ở {cur})")


def commit_status(tid, status):
    t = T.load_tasks()[tid]
    T.cmd_set(T.load_tasks(), [tid, status])
    f = os.path.relpath(t["_file"], ROOT).replace("\\", "/")
    git("add", "--", f)
    git("commit", "-q", "-m", f"chore(tasks): {tid} {status}", "--", f)


def verify(cwd, fast=False):
    args = [sys.executable, os.path.join(cwd, "scripts", "verify.py")] + (["--fast"] if fast else [])
    return subprocess.run(args, cwd=cwd).returncode == 0


def conflicts(cwd):
    _, out, _ = git("diff", "--name-only", "--diff-filter=U", cwd=cwd)
    return " ".join(out.split())


def start(tid, from_branch=None):
    task_or_die(tid)
    on_main()
    wt = os.path.join(ROOT, ".worktrees", tid)
    br = f"task/{tid}"
    if os.path.isdir(wt):
        print(wt)
        print("(worktree đã tồn tại)", file=sys.stderr)
        return 0
    commit_status(tid, "in_progress")
    if from_branch:
        if git("rev-parse", "--verify", "--quiet", from_branch)[0] != 0:
            die(f"không có nhánh {from_branch}")
        code, _, err = git("worktree", "add", "-q", "-b", br, wt, from_branch)
        if code:
            die(err)
        if git("merge", "-q", "--no-edit", MAIN, cwd=wt)[0] != 0:
            print(f"⚠ nhánh {from_branch} conflict với {MAIN} ở: {conflicts(wt)}", file=sys.stderr)
            print("  Worktree để nguyên ở trạng thái đang merge — agent giải quyết conflict trước (git status trong worktree).",
                  file=sys.stderr)
        _, n, _ = git("rev-list", "--count", f"{MAIN}..{from_branch}")
        print(f"• tiếp quản nhánh {from_branch} ({n} commit chưa merge) → {br}")
    else:
        exists = git("show-ref", "--verify", "--quiet", f"refs/heads/{br}")[0] == 0
        code, _, err = git("worktree", "add", "-q", wt, br) if exists else git("worktree", "add", "-q", "-b", br, wt, MAIN)
        if code:
            die(err)
    if os.path.exists(os.path.join(wt, "package.json")) and os.environ.get("HARNESS_NO_INSTALL") != "1":
        code, _ = sh(CFG.get("install_cmd") or "pnpm install", cwd=wt)
        if code:
            print("cảnh báo: cài deps trong worktree lỗi — agent cần tự cài", file=sys.stderr)
    print(wt)
    return 0


def finish(tid):
    t = task_or_die(tid)
    on_main()
    wt = os.path.join(ROOT, ".worktrees", tid)
    br = f"task/{tid}"
    if not os.path.isdir(wt):
        die(f"không có worktree {wt}")
    _, dirty, _ = git("status", "--porcelain", cwd=wt)
    if dirty:
        git("add", "-A", cwd=wt)
        git("commit", "-q", "-m", f"chore({tid}): commit phần việc chưa commit", cwd=wt)
        print("• đã tự commit thay đổi còn dở")
    _, n, _ = git("rev-list", "--count", f"{MAIN}..{br}")
    if n == "0":
        die(f"{br} không có commit nào so với {MAIN}")

    print("• verify trong worktree")
    if not verify(wt):
        die("verify đỏ trong worktree — trả lại agent", 2)

    _, before, _ = git("rev-parse", MAIN)
    _, base, _ = git("merge-base", br, MAIN)
    if base != before:
        print(f"• cập nhật {MAIN} mới nhất vào nhánh task")
        if git("merge", "-q", "--no-edit", MAIN, cwd=wt)[0] != 0:
            c = conflicts(wt)
            git("merge", "--abort", cwd=wt)
            die(f"conflict với {MAIN} ở: {c or '?'} — trả lại agent: chạy 'git merge {MAIN}' trong worktree, "
                "giải quyết, commit, rồi báo lại", 3)
        print("• verify lại trên code đã ghép")
        if not verify(wt):
            die(f"verify đỏ sau khi ghép với {MAIN} — lỗi tích hợp", 2)

    code, _, err = git("merge", "-q", "--no-ff", br, "-m", f"merge({tid}): {t.get('title', '')}")
    if code:
        git("merge", "--abort")
        die(f"merge thất bại: {err}", 3)
    _, changed, _ = git("diff", "--name-only", before, "HEAD")
    files = [f for f in changed.splitlines() if f]
    if any(not f.startswith(("docs/", ".harness/")) for f in files) and not any(f.startswith(f"docs/features/{tid}") for f in files):
        print(f"⚠ {tid} đổi code nhưng không có docs/features/{tid}-*.md — ghi friction (tag: thieu-docs)")
    if git("worktree", "remove", "--force", wt)[0] != 0:
        shutil.rmtree(wt, ignore_errors=True)
        git("worktree", "prune")
    git("branch", "-q", "-d", br)
    commit_status(tid, "review")
    print(f"✓ {tid} đã merge vào {MAIN} ({len(files)} file)")
    return 0


def abort(tid):
    wt = os.path.join(ROOT, ".worktrees", tid)
    if os.path.isdir(wt):
        git("worktree", "remove", "--force", wt)
    git("worktree", "prune")
    print(f"đã bỏ worktree {tid} (nhánh task/{tid} vẫn giữ để xem lại)")
    return 0


def main():
    a = sys.argv[1:]
    if not a or a[0] not in ("start", "finish", "abort", "list"):
        print(__doc__)
        return 1
    if a[0] == "list":
        print(git("worktree", "list")[1])
        return 0
    if len(a) < 2:
        die("thiếu <ID>")
    tid = a[1]
    if a[0] == "start":
        frm = a[a.index("--from") + 1] if "--from" in a and len(a) > a.index("--from") + 1 else None
        return start(tid, frm)
    return finish(tid) if a[0] == "finish" else abort(tid)


if __name__ == "__main__":
    sys.exit(main())
