#!/usr/bin/env python3
"""Cổng cứng bằng máy cho Claude Code (PreToolUse hook).

Dùng:  python3 harness_guard.py bash   (matcher: Bash)
       python3 harness_guard.py files  (matcher: Read|Edit|Write|MultiEdit|NotebookEdit)

Đọc JSON từ stdin. Chặn = exit 2 + lý do ra stderr (Claude đọc được lý do).
Cấu hình: .harness/gates.json · Mở khoá tạm: scripts/approve.py <gate> <giờ> (.harness/unlocks.json)
"""
import json
import ntpath
import os
import posixpath
import re
import shlex
import subprocess
import sys
import time
from datetime import datetime

NEVER_UNLOCK = {"human-only", "system"}
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


def is_winpath(p):
    return bool(re.match(r"^[A-Za-z]:[\\/]", p or "")) or os.name == "nt"


def pm(p):
    """Module đường dẫn phù hợp: ntpath cho ổ đĩa Windows, posixpath cho /..."""
    return ntpath if is_winpath(p) else posixpath


def fwd(p):
    return (p or "").replace("\\", "/")

# ---------------------------------------------------------------- helpers

def glob_to_regex(pattern: str) -> "re.Pattern":
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


def match_any(rel: str, globs) -> bool:
    return any(glob_to_regex(g).match(rel) for g in globs or [])


def parse_frontmatter(text: str) -> dict:
    m = re.match(r"^---\s*\n(.*?)\n---", text, re.S)
    if not m:
        return {}
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


def _clean(v: str) -> str:
    return v.split(" #")[0].strip().strip("'\"")


def load_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def git_toplevel(path):
    try:
        return subprocess.run(["git", "-C", path, "rev-parse", "--show-toplevel"], capture_output=True, text=True,
                              timeout=5, encoding="utf-8", errors="replace").stdout.strip() or None
    except Exception:
        return None


def resolve_context(path_hint: str, cwd: str):
    """Trả (main_root, task_id|None, rel_path|None)."""
    p = path_hint or ""
    P = pm(p if is_winpath(p) else cwd)
    if p and not P.isabs(p):
        p = P.normpath(P.join(cwd, p))
    probe = fwd(p or cwd)
    m = re.match(r"^(.*?)/\.worktrees/([^/]+)(?:/(.*))?$", probe)
    if m:
        return m.group(1), m.group(2), (m.group(3) if p else None)
    # phiên Claude Desktop bật "Worktree": <dự án>/.claude/worktrees/<tên>/ là một bản sao đầy đủ → coi là gốc riêng
    m = re.match(r"^(.*?/\.claude/worktrees/[^/]+)(?:/(.*))?$", probe)
    if m:
        return m.group(1), None, (m.group(2) if p else None)
    root = os.environ.get("CLAUDE_PROJECT_DIR") or git_toplevel(cwd) or cwd
    root = fwd(P.normpath(root))
    rel = None
    if p:
        try:
            rel = fwd(P.relpath(P.normpath(p), P.normpath(root)))
        except ValueError:
            rel = None  # khác ổ đĩa
        if rel is not None and (rel.startswith("..") or P.isabs(rel)):
            rel = None  # ngoài dự án
    return root, None, rel


def unlocked(root, gate) -> bool:
    if gate in NEVER_UNLOCK:
        return False
    data = load_json(os.path.join(root, ".harness", "unlocks.json"), {})
    try:
        return float(data.get(gate, 0)) > time.time()
    except Exception:
        return False


def task_file(root, task_id):
    d = os.path.join(root, "docs", "tasks")
    try:
        for name in sorted(os.listdir(d)):
            if name == f"{task_id}.md" or name.startswith(f"{task_id}-"):
                return os.path.join(d, name)
    except Exception:
        pass
    return None


def task_meta(root, task_id):
    f = task_file(root, task_id)
    if not f:
        return {}
    with open(f, encoding="utf-8") as fh:
        return parse_frontmatter(fh.read().replace("\r\n", "\n"))


def in_scaffold(root) -> bool:
    # dự án adopt (code đã có từ trước) không có giai đoạn scaffold — cổng luôn bật
    if load_json(os.path.join(root, ".harness", "config.json"), {}).get("adopted"):
        return False
    return task_meta(root, "T-000").get("status", "todo") != "done"


def exists_on_main(root, rel) -> bool:
    try:
        r = subprocess.run(["git", "-C", root, "cat-file", "-e", f"HEAD:{rel}"],
                           capture_output=True, timeout=5)
        return r.returncode == 0
    except Exception:
        return False


def log_and_notify(root, gate, tool, detail):
    os.makedirs(os.path.join(root, ".harness"), exist_ok=True)
    logf = os.path.join(root, ".harness", "gate-events.log")
    now = time.time()
    recent = False
    try:
        with open(logf, encoding="utf-8") as f:
            for line in f.readlines()[-50:]:
                parts = line.split(" | ")
                if len(parts) >= 3 and parts[1] == gate:
                    ts = datetime.fromisoformat(parts[0]).timestamp()
                    if now - ts < 600:
                        recent = True
    except Exception:
        pass
    try:
        with open(logf, "a", encoding="utf-8") as f:
            f.write(f"{datetime.now().isoformat(timespec='seconds')} | {gate} | {tool} | {detail[:300]}\n")
    except Exception:
        pass
    notify = os.path.join(root, "scripts", "notify.py")
    if not recent and os.path.exists(notify):
        slug = os.path.basename(root.rstrip("/"))
        msg = f"⛔ {slug}: chạm cổng [{gate}] — {detail[:200]}\nXem docs/DECISIONS_PENDING.md · Duyệt: python scripts/approve.py {gate} 1"
        try:
            kw = {"creationflags": 0x08000000} if os.name == "nt" else {"start_new_session": True}
            subprocess.Popen([sys.executable, notify, msg], stdout=subprocess.DEVNULL,
                             stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL, **kw)
        except Exception:
            pass


def block(root, gate, tool, reason, detail):
    log_and_notify(root, gate, tool, f"{reason} :: {detail}")
    how = ("Cổng này chỉ người làm được." if gate in NEVER_UNLOCK
           else f"Người duyệt bằng: python scripts/approve.py {gate} <giờ>.")
    sys.stderr.write(
        f"HARD GATE [{gate}]: {reason}\n"
        f"Chi tiết: {detail}\n"
        "KHÔNG tìm cách lách (đổi lệnh, dùng công cụ khác, sửa cấu hình). "
        "Ghi đề xuất vào docs/DECISIONS_PENDING.md (cần làm gì, vì sao, phương án, rủi ro) "
        "— subagent thì ghi vào mục 'Câu hỏi' của báo cáo — rồi tiếp tục phần việc khác. "
        f"{how}\n"
    )
    sys.exit(2)

# ---------------------------------------------------------------- bash / PowerShell

SAFE_RM = re.compile(r"^(\./)?(node_modules|dist|build|out|\.next|\.turbo|\.cache|coverage|tmp|"
                     r"playwright-report|test-results|\.harness/(run|screens|reports|tmp|verify)|"
                     r"\.worktrees/[\w.-]+)(/.*)?$|^/tmp/", re.I)
READONLY = {"cat", "less", "more", "head", "tail", "grep", "rg", "ls", "wc", "diff", "jq", "stat",
            "file", "tree", "bat", "echo", "printf", "test", "[",
            # PowerShell
            "get-content", "gc", "type", "select-string", "sls", "get-childitem", "gci", "dir", "get-item", "gi",
            "test-path", "resolve-path", "measure-object", "write-host", "write-output", "format-table", "ft",
            "out-host", "get-filehash", "findstr"}
GIT_READONLY = {"diff", "log", "show", "status", "blame", "ls-files", "grep"}
PS_REMOVE = {"remove-item", "ri", "del", "erase", "rd"}
SECRET_FILE = re.compile(r"(^|[\s'\"=/\\:<(])\.env(\.(?!example\b|sample\b|template\b)[\w.-]+)?(?=$|[\s'\";|&)])")
HARNESS_ENV = re.compile(r"harness-kit[/\\]env\b|\.harness-kit[/\\]env\b")
SECRET_VARS = r"\w*(SECRET|TOKEN|PASSWORD|SERVICE_ROLE|API_KEY|PRIVATE)\w*"

BASH_RULES = [
    # (regex, gate, reason)
    (r"\bapprove\.(py|sh)\b", "human-only", "scripts/approve.py chỉ con người được chạy"),
    (r"\bsudo\b|\bStart-Process\b.*-Verb\s+RunAs", "system", "Không chạy lệnh quyền quản trị"),
    (r"\b(curl|wget)\b[^|;&]*\|\s*(sudo\s+)?(ba|z)?sh\b", "system", "Không chạy script tải từ mạng"),
    (r"(?i:\b(irm|iwr|Invoke-RestMethod|Invoke-WebRequest)\b[^;]*\|\s*(iex|Invoke-Expression)\b|\b(iex|Invoke-Expression)\b.*\b(irm|iwr|Invoke-RestMethod|Invoke-WebRequest|DownloadString)\b)",
     "system", "Không chạy script tải từ mạng"),
    (r"\bmkfs\b|:\(\)\s*\{|\bchmod\s+-R\s+777\b|(?i:\b(Format-Volume|Clear-Disk|Set-ExecutionPolicy)\b)", "system", "Lệnh hệ thống nguy hiểm"),
    (r"\b(DROP\s+(TABLE|SCHEMA|DATABASE|ROLE|POLICY)|ALTER\s+TABLE\s+\S+\s+DROP)\b|\bTRUNCATE(\s+TABLE)?\s+\w", "data", "Lệnh SQL xoá dữ liệu/cấu trúc"),
    (r"\bDELETE\s+FROM\s+[\w.\"]+\s*(;|'|\"|$)", "data", "DELETE không có WHERE"),
    (r"\bsupabase\s+db\s+reset\b.*(--linked|--db-url)", "data", "Reset DB remote"),
    (r"\bsupabase\s+db\s+push\b", "deploy", "Đẩy migration lên DB remote"),
    (r"\bsupabase\s+(projects|branches|secrets)\s+(delete|unset)\b", "data", "Xoá tài nguyên Supabase"),
    (r"\bdocker(-compose|\s+compose)?\b.*\bdown\b.*(\s-v\b|--volumes)", "data", "Xoá volume Docker"),
    (r"\bdocker\s+(volume\s+(rm|prune)|system\s+prune)\b", "data", "Xoá volume/dữ liệu Docker"),
    (r"\bvercel\b.*(--prod\b|\bpromote\b)", "deploy", "Deploy production"),
    (r"\b(npm|pnpm|yarn)\s+publish\b|\bdocker\s+push\b|\bfly\s+deploy\b", "deploy", "Phát hành ra ngoài"),
    (r"\bgit\s+push\b(?=.*\s(main|master|production|prod)\b)", "deploy", "Push lên nhánh chính (có thể kích hoạt deploy)"),
    (r"\bgit\s+push\b.*(--force\b|\s-f\b|--force-with-lease)", "git", "Force push"),
    (r"--no-verify\b", "git", "Bỏ qua git hooks"),
    (r"\bgit\s+(filter-branch|filter-repo)\b", "git", "Viết lại lịch sử git"),
    (r"\bgit\s+branch\s+-D\s+(main|master)\b", "git", "Xoá nhánh chính"),
    (r"\bprintenv\b|(^|[;&|]\s*)env\s*($|\|)|(?i:\b(Get-ChildItem|gci|ls|dir|Get-Item|gi)\s+env:)", "secrets", "In biến môi trường"),
    (r"(?i:\b(echo|printf|Write-Host|Write-Output)\b[^|;&]*\$(env:)?\{?" + SECRET_VARS + ")", "secrets", "In secret"),
    (r"(?i:^\s*\$env:" + SECRET_VARS + r"\s*$)", "secrets", "In secret"),
]


def split_segments(cmd: str):
    return [s for s in re.split(r"\s*(?:&&|\|\||;|\||\n)\s*", cmd) if s.strip()]


def tokens(seg: str):
    s = seg.replace("\\", "/")  # đường dẫn Windows → dạng / để tách và so khớp
    try:
        toks = shlex.split(s)
    except ValueError:
        toks = s.split()
    while toks and toks[0] in ("&", "."):  # toán tử gọi của PowerShell
        toks = toks[1:]
    while toks and re.match(r"^\w+=", toks[0]):  # FOO=bar cmd
        toks = toks[1:]
    return toks


def cmd_name(tok: str) -> str:
    return re.sub(r"\.(exe|cmd|bat|ps1)$", "", posixpath.basename(tok).lower())


def to_rel(t: str, root: str) -> str:
    t = t.replace("\\", "/").strip("'\"")
    r = root.replace("\\", "/").rstrip("/")
    if r and t.lower().startswith(r.lower() + "/"):
        return t[len(r) + 1:]
    return t[2:] if t.startswith("./") else t


def is_system_target(tt: str) -> bool:
    low = tt.lower()
    return (tt in ("/", "~", "$HOME", "*", ".", "..", "$env:USERPROFILE", "$env:HOMEPATH")
            or (low.startswith(("/etc", "/usr", "/var", "~/", "$home/", "$env:userprofile")) and not low.startswith("/tmp/"))
            or bool(re.match(r"^[a-z]:/?$|^[a-z]:/(windows|program files|programdata|users/?$|users/[^/]+/?$)", low)))


def check_bash(data):
    tool = data.get("tool_name") or "Bash"
    cmd = (data.get("tool_input") or {}).get("command", "") or ""
    cwd = data.get("cwd") or os.getcwd()
    root, task_id, _ = resolve_context("", cwd)
    cfg = load_json(os.path.join(root, ".harness", "gates.json"), {})
    in_wt = "/.worktrees/" in fwd(cwd)

    rules = list(BASH_RULES) + [(r.get("pattern", "$^"), r.get("gate", "custom"), r.get("reason", "Bị chặn theo gates.json"))
                                for r in cfg.get("extra_bash_block", [])]
    for pattern, gate, reason in rules:
        if re.search(pattern, cmd, re.I if gate == "data" else 0) and not unlocked(root, gate):
            block(root, gate, tool, reason, cmd)

    # secrets: đọc .env / env của harness-kit (cho phép đúng một việc: tạo .env từ .env.example)
    if not re.search(r"(?i)^\s*(cp|copy|copy-item)\s+(\.[/\\])?\.env\.example\s+(\.[/\\])?\.env(\.local)?\s*$", cmd):
        if (SECRET_FILE.search(cmd) or HARNESS_ENV.search(cmd)) and not unlocked(root, "secrets"):
            block(root, "secrets", tool, "Không đọc/ghi/in file secret (.env*)", cmd)

    protected = cfg.get("protected_paths", [])
    prot_tokens = [re.sub(r"/?\*\*.*$", "", p) for p in protected]
    for seg in split_segments(cmd):
        toks = tokens(seg)
        if not toks:
            continue
        w = cmd_name(toks[0])
        segn = seg.replace("\\", "/")

        # git reset --hard / clean -f: chỉ cho phép trong worktree
        if w == "git" and len(toks) > 1:
            if (toks[1] == "reset" and "--hard" in toks) or (toks[1] == "clean" and any(t.startswith("-") and "f" in t for t in toks[2:])):
                if not in_wt and not unlocked(root, "git"):
                    block(root, "git", tool, "git reset --hard / git clean -f trên repo chính", seg)

        # xoá: rm / rmdir / git rm / Remove-Item / del / rd
        if w in {"rm", "rmdir"} | PS_REMOVE or (w == "git" and len(toks) > 1 and toks[1] == "rm"):
            args = toks[2:] if w == "git" else toks[1:]
            flag_list = [a for a in args if a.startswith("-") or (a.startswith("/") and len(a) == 2)]
            targets = [a for a in args if a not in flag_list and a.lower() not in ("-path", "-literalpath")]
            if w in PS_REMOVE or any(len(f) > 3 and f[1:].isalpha() and f[1].isupper() for f in flag_list):
                recursive = any(f.lower() in ("-recurse", "-r", "/s") for f in flag_list) or w == "rd"
            else:
                recursive = "r" in "".join(f.lstrip("-") for f in flag_list).lower() or w == "rmdir"
            for t in targets:
                tt = to_rel(t, root).rstrip("/") or "/"
                if is_system_target(tt):
                    block(root, "system", tool, "Xoá thư mục hệ thống/toàn bộ", seg)
                if match_any(tt, cfg.get("test_globs", [])) and not unlocked(root, "test"):
                    block(root, "test", tool, "Xoá file test", seg)
                if match_any(tt, (cfg.get("immutable_existing") or {}).get("globs", [])) and not unlocked(root, "data"):
                    block(root, "data", tool, "Xoá migration", seg)
                if recursive and not SAFE_RM.match(tt) and not unlocked(root, "data"):
                    block(root, "data", tool, f"Xoá đệ quy ngoài vùng an toàn ({tt})", seg)

        # đường dẫn được bảo vệ: chỉ cho lệnh đọc (và chạy verify / xem baseline)
        if any(tok and tok in segn for tok in prot_tokens):
            redirect_targets = (re.findall(r"(?:^|[^2&])>>?\s*([^\s;|&]+)", segn)
                                + re.findall(r"(?i)\b(?:tee|tee-object|out-file|set-content|add-content)\s+(?:-\w+\s+)*([^\s;|&]+)", segn))
            writes_protected = any(any(tok in t for tok in prot_tokens) for t in redirect_targets)
            script = next((t for t in toks[1:3] if t.endswith(".py")), "") if w.startswith(("python", "py")) else ""
            executes_verify = (script.endswith("verify.py") or toks[0].endswith(("verify.sh", "verify.py"))
                               or (w in ("bash", "sh") and len(toks) > 1 and toks[1].endswith("verify.sh"))
                               or (script.endswith("baseline.py") and "show" in toks))
            readonly = (w in READONLY or executes_verify
                        or (w == "git" and len(toks) > 1 and toks[1] in GIT_READONLY | {"add", "commit"})
                        or (w == "find" and not re.search(r"-delete|-exec", segn)))
            if re.search(r"\s-i\b|--in-place", segn) and not executes_verify:
                readonly = False
            if writes_protected:
                readonly = False
            elif redirect_targets and (w in READONLY or executes_verify):
                readonly = True  # ghi ra file khác, nguồn được bảo vệ chỉ bị đọc
            if not readonly and not unlocked(root, "harness"):
                block(root, "harness", tool, "Đụng vào file harness được bảo vệ (chỉ đọc)", seg)

# ---------------------------------------------------------------- files

LOOSEN_TEST = re.compile(r"\b(it|test|describe|suite|context)\.(skip|only|todo)\s*\(|\b(xit|xtest|xdescribe|fit|fdescribe)\s*\(")
FAILS_MARK = re.compile(r"\.(fails|fail)\s*\(")
TEST_DECL = re.compile(r"(^|[^\w.])(it|test)\s*(\.\w+\s*)?\(")
LOOSEN_CODE = re.compile(r"@ts-nocheck|/\*\s*eslint-disable\s*\*/|^\s*//\s*eslint-disable\s*$", re.M)


def loosen_count(text: str) -> int:
    n = len(LOOSEN_TEST.findall(text or ""))
    for line in (text or "").splitlines():
        if FAILS_MARK.search(line) and "BUG:" not in line:
            n += 1
    return n


def edits_of(tool, ti, abspath):
    """Trả danh sách (old, new) văn bản để so sánh."""
    if tool == "Edit":
        return [(ti.get("old_string", ""), ti.get("new_string", ""))]
    if tool == "MultiEdit":
        return [(e.get("old_string", ""), e.get("new_string", "")) for e in ti.get("edits", [])]
    if tool == "Write":
        old = ""
        try:
            with open(abspath, encoding="utf-8") as f:
                old = f.read()
        except Exception:
            pass
        return [(old, ti.get("content", ""))]
    if tool == "NotebookEdit":
        return [("", ti.get("new_source", ""))]
    return []


def check_files(data):
    tool = data.get("tool_name", "")
    ti = data.get("tool_input") or {}
    cwd = data.get("cwd") or os.getcwd()
    path = ti.get("file_path") or ti.get("notebook_path") or ti.get("path") or ""
    if not path:
        return
    P = pm(path if is_winpath(path) else cwd)
    abspath = path if P.isabs(path) else P.normpath(P.join(cwd, path))
    base = fwd(abspath).rsplit("/", 1)[-1]
    root, task_id, rel = resolve_context(abspath, cwd)

    # secrets (mọi tool, kể cả Read)
    if (re.match(r"^\.env(\.(?!example$|sample$|template$).+)?$", base) or re.search(r"harness-kit/env$", fwd(abspath))):
        if not unlocked(root, "secrets"):
            block(root, "secrets", tool, "Không đọc/ghi file secret", path)
    if tool in ("Read", "Grep", "Glob") or rel is None:
        return

    cfg = load_json(os.path.join(root, ".harness", "gates.json"), {})

    # 1. file harness được bảo vệ
    if match_any(rel, cfg.get("protected_paths", [])) and not unlocked(root, "harness"):
        block(root, "harness", tool, "File harness được bảo vệ — đề xuất qua /harness-review", rel)

    # 2. vùng sở hữu của task (chỉ trong worktree)
    if task_id:
        meta = task_meta(root, task_id)
        allowed = list(meta.get("paths") or []) + [f"docs/features/{task_id}*", f"docs/features/{task_id}-*"]
        if not meta:
            block(root, "scope", tool, f"Không tìm thấy docs/tasks/{task_id}-*.md ở repo gốc", rel)
        if not match_any(rel, allowed) and not unlocked(root, f"scope-{task_id}"):
            block(root, f"scope-{task_id}", tool,
                  f"File nằm ngoài vùng sở hữu của {task_id} (paths: {meta.get('paths')}). "
                  "Ghi vào báo cáo để orchestrator mở rộng paths hoặc tạo task khác", rel)

    # 3. đường dẫn có cổng (chỉ khi file đã tồn tại trên nhánh chính)
    scaffold = None
    for gate, spec in (cfg.get("gated_paths") or {}).items():
        if spec.get("scope") == "worktree" and not task_id:
            continue
        if not match_any(rel, spec.get("globs", [])):
            continue
        if spec.get("skip_during_scaffold"):
            scaffold = in_scaffold(root) if scaffold is None else scaffold
            if scaffold:
                continue
        if exists_on_main(root, rel) and not unlocked(root, gate):
            block(root, gate, tool, spec.get("reason", "Đường dẫn có cổng"), rel)

    # 4. migration bất biến
    imm = cfg.get("immutable_existing") or {}
    if match_any(rel, imm.get("globs", [])) and exists_on_main(root, rel) and not unlocked(root, "data"):
        block(root, "data", tool, imm.get("reason", "File bất biến"), rel)

    # 5. nới lỏng test / chất lượng
    pairs = edits_of(tool, ti, abspath)
    if os.path.basename(rel) == "package.json" and exists_on_main(root, rel) and not in_scaffold(root):
        try:
            cur = open(abspath, encoding="utf-8").read()
        except Exception:
            cur = ""
        if tool == "Write":
            after = ti.get("content", "")
        else:
            after = cur
            for o, nw in pairs:
                after = after.replace(o, nw, 1)
        def scripts_of(text):
            try:
                return json.loads(text).get("scripts", {}) or {}
            except Exception:
                return None
        before_s, after_s = scripts_of(cur), scripts_of(after)
        if before_s is not None:
            changed = [k for k, v in before_s.items()
                       if re.match(r"^(lint|typecheck|test|build)(:|$)", k) and (after_s or {}).get(k) != v]
            if changed and not unlocked(root, "test_config"):
                block(root, "test_config", tool, f"Đổi/xoá script {', '.join(changed)} trong package.json (thêm script mới thì được)", rel)
    old_all = "\n".join(o for o, _ in pairs)
    new_all = "\n".join(n for _, n in pairs)
    if match_any(rel, cfg.get("test_globs", [])):
        if loosen_count(new_all) > loosen_count(old_all) and not unlocked(root, "test"):
            block(root, "test", tool, "Thêm skip/only/todo/fails (không có 'BUG:') vào test", rel)
        if len(TEST_DECL.findall(new_all)) < len(TEST_DECL.findall(old_all)) and not unlocked(root, "test"):
            block(root, "test", tool, "Giảm số lượng test", rel)
    is_code = re.search(r"\.(ts|tsx|js|jsx|mjs|cjs|vue|svelte)$", rel) is not None
    if is_code and len(LOOSEN_CODE.findall(new_all)) > len(LOOSEN_CODE.findall(old_all)) and not unlocked(root, "test"):
        block(root, "test", tool, "Thêm @ts-nocheck / eslint-disable toàn file", rel)


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "files"
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)  # không đọc được input → không chặn nhầm
    try:
        if mode == "bash":
            check_bash(data)
        else:
            check_files(data)
    except SystemExit:
        raise
    except Exception as e:  # lỗi trong chính hook → chặn (fail-closed) thay vì để lọt
        sys.stderr.write(f"HARD GATE [guard-error]: hook harness_guard.py lỗi ({type(e).__name__}: {e}). "
                         "Dừng thao tác này và báo anh Tú kèm lỗi để sửa hook.\n")
        sys.exit(2)
    sys.exit(0)


if __name__ == "__main__":
    main()
