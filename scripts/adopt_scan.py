#!/usr/bin/env python3
"""Quét một repo đang làm dở để áp harness.

  python scripts/adopt_scan.py            in báo cáo, ghi .harness/adopt-report.{json,md}
  python scripts/adopt_scan.py --apply    (người/new-project chạy) điền thêm .harness/config.json + gates.json từ kết quả quét

Chỉ đọc code; không đọc .env*. --apply chỉ THÊM cổng, không bao giờ nới cổng.
"""
import json
import os
import re
import subprocess
import sys
from collections import Counter

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
ROOT = os.path.abspath(os.environ.get("HARNESS_SCAN_ROOT") or os.path.join(os.path.dirname(__file__), ".."))
SKIP_DIRS = {".git", "node_modules", ".next", "dist", "build", "out", ".turbo", "coverage", ".worktrees",
             ".harness", ".claude", "vendor", ".venv", "venv", "__pycache__", ".expo", "ios", "android",
             "playwright-report", "test-results", ".vercel", ".supabase"}
CODE_EXT = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte", ".py", ".go", ".sql"}
TEST_RE = re.compile(r"(\.test\.|\.spec\.|/__tests__/|^tests?/|^e2e/)")
HARNESS_FILES_PREFIX = ("docs/", "scripts/", ".claude/", ".harness/", ".github/", ".gitignore",
                        "CLAUDE.md", "AGENTS.md", ".mcp.json")
HARNESS_SCRIPTS = {"scripts/" + f for f in ("verify.py", "task.py", "run.py", "logs.py", "ui_shot.py", "notify.py",
                                            "approve.py", "tasks.py", "baseline.py", "adopt_scan.py", "hk_common.py")}


def sh(*args, cwd=ROOT):
    try:
        r = subprocess.run(list(args), cwd=cwd, capture_output=True, text=True, timeout=20, encoding="utf-8", errors="replace")
        return r.stdout.strip() if r.returncode == 0 else ""
    except Exception:
        return ""


def read(path, limit=200_000):
    try:
        with open(os.path.join(ROOT, path), encoding="utf-8", errors="replace") as f:
            return f.read(limit)
    except Exception:
        return ""


def exists(*paths):
    return any(os.path.exists(os.path.join(ROOT, p)) for p in paths)


def walk_files():
    for dirpath, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS and not d.startswith(".git")]
        for fn in files:
            rel = os.path.relpath(os.path.join(dirpath, fn), ROOT).replace("\\", "/")
            if rel in HARNESS_SCRIPTS or rel.startswith("scripts/verify.d/"):
                continue
            yield rel


# ------------------------------------------------------------------ detectors

def detect_node():
    pkg = {}
    try:
        pkg = json.loads(read("package.json") or "{}")
    except Exception:
        pass
    deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
    scripts = pkg.get("scripts", {})
    if exists("pnpm-lock.yaml"):
        pm = "pnpm"; install = "pnpm install --frozen-lockfile --prefer-offline || pnpm install --prefer-offline"
    elif exists("yarn.lock"):
        pm = "yarn"; install = "yarn install --frozen-lockfile || yarn install"
    elif exists("bun.lockb", "bun.lock"):
        pm = "bun"; install = "bun install"
    elif pkg:
        pm = "npm"; install = "npm ci || npm install"
    else:
        pm, install = None, None

    fw = []
    for name, key in [("next", "next"), ("vite", "vite"), ("react", "react"), ("expo", "expo"),
                      ("zmp", "zmp-ui"), ("zmp", "zmp-sdk"), ("hono", "hono"), ("express", "express"),
                      ("nestjs", "@nestjs/core"), ("fastify", "fastify"), ("grammy", "grammy"),
                      ("supabase-js", "@supabase/supabase-js"), ("prisma", "prisma"), ("drizzle", "drizzle-orm"),
                      ("zod", "zod"), ("tailwind", "tailwindcss")]:
        if key in deps and name not in fw:
            fw.append(name)
    tests = [t for t, k in [("vitest", "vitest"), ("jest", "jest"), ("playwright", "@playwright/test"),
                            ("cypress", "cypress")] if k in deps]
    if "test" in scripts and "node --test" in scripts["test"]:
        tests.append("node:test")

    dev_script = scripts.get("dev") or scripts.get("start") or ""
    dev_cmd = f"{pm} run dev" if "dev" in scripts else (f"{pm} start" if "start" in scripts else "")
    port = None
    m = (re.search(r"(?:-p|--port)[ =](\d{2,5})", dev_script) or re.search(r"\bPORT=(\d{2,5})", dev_script)
         or re.search(r"(?:^|\s)(\d{4,5})(?:\s|$)", dev_script))
    if m:
        port = int(m.group(1))
    elif "next" in fw:
        port = 3000
    elif "vite" in fw or "zmp" in fw:
        port = 5173
    elif "expo" in fw:
        port = 8081

    verify_steps = {s: (s in scripts) for s in ("lint", "typecheck", "test", "build")}
    suggestions = []
    if pkg and not verify_steps["typecheck"] and ("typescript" in deps):
        suggestions.append('Thêm script "typecheck": "tsc --noEmit" vào package.json')
    if pkg and not verify_steps["test"]:
        suggestions.append("Chưa có script test — T-000 nên thêm Vitest + test đặc tả cho luồng chính")
    if pkg and not verify_steps["lint"]:
        suggestions.append("Chưa có script lint")
    return {
        "has_package_json": bool(pkg), "name": pkg.get("name"), "package_manager": pm, "install_cmd": install,
        "frameworks": fw, "test_frameworks": tests, "scripts": scripts, "verify_steps": verify_steps,
        "dev_cmd": dev_cmd, "port": port, "typescript": "typescript" in deps, "suggestions": suggestions,
        "monorepo": exists("pnpm-workspace.yaml", "turbo.json", "nx.json", "lerna.json"),
    }


def detect_data():
    mig_dirs = [d for d in ("supabase/migrations", "migrations", "prisma/migrations", "drizzle", "db/migrations")
                if os.path.isdir(os.path.join(ROOT, d))]
    counts = {d: len([f for f in os.listdir(os.path.join(ROOT, d)) if not f.startswith(".")]) for d in mig_dirs}
    env_vars = re.findall(r"^\s*([A-Z][A-Z0-9_]+)\s*=", read(".env.example") or read(".env.sample"), re.M)
    return {"supabase": exists("supabase/config.toml"), "migration_dirs": counts,
            "docker_compose": exists("docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"),
            "env_example_vars": env_vars}


def detect_structure(files):
    top = Counter()
    modules = {}
    tests_by_area = Counter()
    code_by_area = Counter()
    sensitive = {"auth": set(), "payment": set(), "admin": set()}
    todo_files = Counter()
    for rel in files:
        ext = os.path.splitext(rel)[1]
        parts = rel.split("/")
        top[parts[0] if len(parts) > 1 else "(root)"] += 1
        if ext not in CODE_EXT:
            continue
        # vùng = 2–3 cấp đầu tiên (src/modules/x, app/x, src/app/x)
        depth = 3 if parts[0] in ("src", "apps", "packages") and len(parts) > 3 else 2
        area = "/".join(parts[:depth]) if len(parts) > depth else "/".join(parts[:-1]) or "(root)"
        if TEST_RE.search(rel):
            tests_by_area[area] += 1
        else:
            code_by_area[area] += 1
        low = rel.lower()
        for key, pat in [("auth", r"(^|/)(auth|login|signin|session|middleware\.|rls|polic)"),
                         ("payment", r"(payment|billing|checkout|sepay|vietqr|invoice|stripe)"),
                         ("admin", r"(^|/)admin(/|\.)")]:
            m = re.search(pat, low)
            if m:
                cut = low.find("/", m.end()) if "/" in low[m.end():] else -1
                sensitive[key].add(rel[:cut] + "/**" if cut > 0 and not ext == ".sql" else rel)
        if ext != ".sql":
            n = len(re.findall(r"\b(TODO|FIXME|HACK|XXX)\b", read(rel, 100_000)))
            if n:
                todo_files[rel] = n
    for area, n in sorted(code_by_area.items(), key=lambda x: -x[1])[:40]:
        modules[area] = {"code_files": n, "test_files": tests_by_area.get(area, 0)}
    untested = [a for a, v in modules.items() if v["test_files"] == 0 and v["code_files"] >= 3]
    return {
        "top_level": dict(top.most_common(20)), "areas": modules, "untested_areas": untested,
        "sensitive_paths": {k: sorted(v)[:15] for k, v in sensitive.items()},
        "todo_total": sum(todo_files.values()), "todo_top_files": dict(todo_files.most_common(10)),
        "code_files": sum(code_by_area.values()), "test_files": sum(tests_by_area.values()),
    }


def detect_git():
    if not sh("git", "rev-parse", "--is-inside-work-tree"):
        return {"is_repo": False}
    current = sh("git", "symbolic-ref", "--short", "HEAD") or sh("git", "rev-parse", "--abbrev-ref", "HEAD")
    default = sh("git", "symbolic-ref", "--short", "refs/remotes/origin/HEAD").replace("origin/", "")
    if not default:
        branches_all = sh("git", "branch", "--format=%(refname:short)").splitlines()
        default = next((b for b in ("main", "master", "develop", "dev") if b in branches_all), current)
    try:
        raw = subprocess.run(["git", "status", "--porcelain"], cwd=ROOT, capture_output=True, text=True, timeout=20,
                             encoding="utf-8", errors="replace").stdout
    except Exception:
        raw = ""
    dirty = [l[3:].split(" -> ")[-1] for l in raw.splitlines() if l.strip()]
    dirty_user = [p for p in dirty if not p.startswith(HARNESS_FILES_PREFIX)]
    branches = []
    for line in sh("git", "for-each-ref", "--sort=-committerdate", "refs/heads",
                   "--format=%(refname:short)|%(committerdate:short)|%(subject)").splitlines():
        name, date, subj = (line.split("|", 2) + ["", ""])[:3]
        if name in (default,) or name.startswith("task/"):
            continue
        ahead = sh("git", "rev-list", "--count", f"{default}..{name}") or "?"
        if ahead != "0":
            branches.append({"name": name, "date": date, "ahead": ahead, "last": subj[:80]})
    return {
        "is_repo": True, "current_branch": current, "default_branch": default,
        "on_default": current == default, "dirty_files": dirty_user[:50], "dirty_count": len(dirty_user),
        "unmerged_branches": branches[:15], "commits": sh("git", "rev-list", "--count", "HEAD") or "0",
        "last_commit": sh("git", "log", "-1", "--format=%cs %s"),
        "remote": sh("git", "remote", "get-url", "origin"),
    }


def detect_docs():
    found = [p for p in ("README.md", "CLAUDE.md", ".cursorrules", ".cursor/rules", "ROADMAP.md", "TODO.md",
                         "CHANGELOG.md", "docs/README.md") if exists(p)]
    wf = os.path.join(ROOT, ".github", "workflows")
    if os.path.isdir(wf):
        found += [f".github/workflows/{f}" for f in sorted(os.listdir(wf)) if f != "verify.yml"]
    return {"existing": found}


def scan():
    files = list(walk_files())
    return {"root": ROOT, "node": detect_node(), "data": detect_data(), "structure": detect_structure(files),
            "git": detect_git(), "docs": detect_docs()}


# ------------------------------------------------------------------ outputs

def to_markdown(r):
    n, g, s, d = r["node"], r["git"], r["structure"], r["data"]
    L = [f"# Báo cáo quét repo — {os.path.basename(r['root'])}", ""]
    L += ["## Stack", f"- Package manager: {n['package_manager'] or '—'} · Frameworks: {', '.join(n['frameworks']) or '—'}",
          f"- Test: {', '.join(n['test_frameworks']) or 'CHƯA CÓ'} · TypeScript: {'có' if n['typescript'] else 'không'} · Monorepo: {'có' if n['monorepo'] else 'không'}",
          f"- Dev: `{n['dev_cmd'] or '?'}` cổng {n['port'] or '?'}",
          f"- Script verify sẽ chạy: " + ", ".join(k for k, v in n["verify_steps"].items() if v) or "(không có)",
          f"- Dữ liệu: Supabase {'có' if d['supabase'] else 'không'} · migrations {d['migration_dirs'] or '—'} · docker compose {'có' if d['docker_compose'] else 'không'}", ""]
    if g.get("is_repo"):
        L += ["## Git (việc đang dở)", f"- Nhánh hiện tại: `{g['current_branch']}` · nhánh chính: `{g['default_branch']}` · {g['commits']} commit · gần nhất: {g['last_commit']}",
              f"- File chưa commit (của anh, không tính harness): {g['dirty_count']}"]
        L += [f"  - {p}" for p in g["dirty_files"][:10]]
        if g["unmerged_branches"]:
            L += ["- Nhánh chưa merge (ứng viên chuyển thành task bằng `python scripts/task.py start <ID> --from <nhánh>`):"]
            L += [f"  - `{b['name']}` +{b['ahead']} commit · {b['date']} · {b['last']}" for b in g["unmerged_branches"]]
        L.append("")
    L += ["## Cấu trúc", f"- {s['code_files']} file code · {s['test_files']} file test · {s['todo_total']} TODO/FIXME", "", "| Vùng | Code | Test |", "|---|---|---|"]
    L += [f"| `{a}` | {v['code_files']} | {v['test_files'] or '**0**'} |" for a, v in list(s["areas"].items())[:25]]
    if s["untested_areas"]:
        L += ["", "Vùng ≥3 file chưa có test (agent phải viết test đặc tả trước khi sửa): " + ", ".join(f"`{a}`" for a in s["untested_areas"][:15])]
    L += ["", "## Đường dẫn nhạy cảm (đề xuất cổng)"]
    for k, v in s["sensitive_paths"].items():
        if v:
            L.append(f"- {k}: " + ", ".join(f"`{p}`" for p in v[:8]))
    if s["todo_top_files"]:
        L += ["", "## TODO/FIXME nhiều nhất"] + [f"- `{f}`: {c}" for f, c in s["todo_top_files"].items()]
    if n["suggestions"]:
        L += ["", "## Gợi ý cho T-000 (onboarding)"] + [f"- {x}" for x in n["suggestions"]]
    L += ["", f"Tài liệu có sẵn: {', '.join(r['docs']['existing']) or 'không'}"]
    return "\n".join(L) + "\n"


def apply(r):
    hdir = os.path.join(ROOT, ".harness")
    os.makedirs(hdir, exist_ok=True)
    cfg_p, gates_p = os.path.join(hdir, "config.json"), os.path.join(hdir, "gates.json")
    cfg = json.load(open(cfg_p)) if os.path.exists(cfg_p) else {}
    n, g = r["node"], r["git"]
    if n["dev_cmd"]:
        cfg["dev_cmd"] = n["dev_cmd"]
    if n["port"]:
        cfg["port"] = n["port"]
    if n["install_cmd"]:
        cfg["install_cmd"] = n["install_cmd"]
    if g.get("is_repo") and g.get("default_branch"):
        cfg["main_branch"] = g["default_branch"]
    cfg["adopted"] = True
    json.dump(cfg, open(cfg_p, "w"), indent=2, ensure_ascii=False)

    gates = json.load(open(gates_p)) if os.path.exists(gates_p) else {}
    gp = gates.setdefault("gated_paths", {})
    auth = gp.setdefault("auth", {"scope": "all", "globs": [], "reason": "Sửa luồng đăng nhập / phân quyền"})
    for p in r["structure"]["sensitive_paths"]["auth"]:
        if p not in auth["globs"]:
            auth["globs"].append(p)
    pay = r["structure"]["sensitive_paths"]["payment"]
    if pay:
        g2 = gp.setdefault("payments", {"scope": "all", "globs": [], "reason": "Luồng thanh toán đang chạy"})
        for p in pay:
            if p not in g2["globs"]:
                g2["globs"].append(p)
    imm = gates.setdefault("immutable_existing", {"globs": [], "reason": "Migration đã commit là bất biến"})
    for d in r["data"]["migration_dirs"]:
        glob = f"{d}/**"
        if glob not in imm["globs"] and f"{d}/*.sql" not in imm["globs"]:
            imm["globs"].append(glob)
    json.dump(gates, open(gates_p, "w"), indent=2, ensure_ascii=False)
    return cfg


def main():
    r = scan()
    os.makedirs(os.path.join(ROOT, ".harness"), exist_ok=True)
    md = to_markdown(r)
    if "--no-report" not in sys.argv:
        with open(os.path.join(ROOT, ".harness", "adopt-report.json"), "w", encoding="utf-8") as f:
            json.dump(r, f, indent=2, ensure_ascii=False)
        with open(os.path.join(ROOT, ".harness", "adopt-report.md"), "w", encoding="utf-8") as f:
            f.write(md)
    if "--apply" in sys.argv:
        cfg = apply(r)
        print(f"config: dev_cmd='{cfg.get('dev_cmd')}' port={cfg.get('port')} main_branch={cfg.get('main_branch')}")
    if "--quiet" not in sys.argv:
        print(md)


if __name__ == "__main__":
    main()
