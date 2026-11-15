---
id: T-000
title: Onboarding harness cho code đang có (verify chạy được, chỉ đường)
agent: orchestrator
status: done
depends_on: []
paths: ["**"]
---
## Mục tiêu
Đưa dự án đang làm dở vào khuôn harness **mà không sửa hành vi** của code hiện có. Sau task này các task khác chạy song song được.

## Đã làm khi adopt (2026-11-13)
- `scripts/verify.d/` có 5 bước thật: `10-admin-web.sh` (vitest + tsc), `20-mini-app-test.sh`, `21-mini-app-typecheck.sh`,
  `30-db-tests.sh` (PGlite, `node --test`), `40-print-agent.sh`. Repo không có `package.json` gốc nên bước "package.json" luôn "bỏ qua".
- `.harness/config.json`: `dev_cmd` = `npm --prefix admin-web run dev`, cổng 3000, `install_cmd` npm (không pnpm).
- `docs/STATUS.md`, `docs/PROJECT.md`, `docs/ARCHITECTURE.md` (có vị trí contracts), `docs/decisions/0001-stack.md`, `docs/features/F-*.md`.

## Còn lại
1. **Anh Tú** chụp baseline: `python scripts/baseline.py capture` (agent không tự chụp được). Sau đó verify phải xanh với nhãn "nợ cũ".
2. **Anh Tú** duyệt D-001 (dọn `gates.json`) trong `docs/DECISIONS_PENDING.md`.
3. Kiểm `python scripts/run.py start` + `python scripts/ui_shot.py /login` chạy được (admin-web cần `.env.local` — anh có sẵn).

## Tiêu chí chấp nhận
- [x] `python scripts/verify.py` xanh (kèm "nợ cũ" đã được anh chụp baseline) — 2026-11-15, nợ cũ 1+5+1 không tăng
- [x] Có test đặc tả chạy trong verify (sẵn có: 1620 test admin-web, 241 mini-app, 589 DB)
- [x] `python scripts/run.py start` chạy được — 2026-11-15, `ui_shot.py /login` ra màn đăng nhập (Git Bash cần `MSYS_NO_PATHCONV=1`)
- [x] `docs/ARCHITECTURE.md` mô tả đúng cấu trúc thật, có vị trí contracts
- [x] Không file code nghiệp vụ nào bị đổi hành vi
