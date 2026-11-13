# Kiến trúc — mevo

> Thường được ghi đè bởi spec bundle. Giữ ngắn; mỗi lần friction log ghi "tim-file", thêm đúng một dòng chỉ đường vào đây.

## Stack
Xem `docs/decisions/0001-stack.md`.

## Bản đồ module
Mỗi module một thư mục. Một task chỉ sở hữu thư mục của module nó → nhiều agent làm song song không đè nhau.

| Module | Thư mục | Agent thường làm | Phụ thuộc |
|---|---|---|---|
| contracts | `src/contracts/` | orchestrator (read-only với các agent khác) | — |
| <module> | `src/modules/<module>/` | backend-dev | contracts |
| ui <module> | `src/app/<route>/` | frontend-dev | contracts |

## Contracts
- Schema Zod + type xuất ra ở `src/contracts/index.ts`. FE và BE chỉ import từ đây.
- Type DB: `pnpm db:types` (→ `src/contracts/db.ts`, sinh tự động, không sửa tay).
- Đổi contract = quyết định kiến trúc → ADR mới + orchestrator thực hiện trên `main` trước khi giao task phụ thuộc.

## Dữ liệu
<!-- Bảng chính, quan hệ, RLS. -->

## Chạy, quan sát, tái hiện lỗi
| Việc | Cách |
|---|---|
| Chạy dev | `python scripts/run.py start` (log: `.harness/run/dev.log`) |
| DB local | `supabase start` · reset: `supabase db reset` (local only) |
| Đọc log | `python scripts/logs.py dev|docker|supabase|ci` |
| Nhìn giao diện | `python scripts/ui_shot.py <path> [name] [--mobile]` → `.harness/screens/` |
| Tái hiện bug | viết test fail trước (Vitest/Playwright), rồi mới sửa |

## Rủi ro → cổng cứng
| Rủi ro | Cổng | Cấu hình |
|---|---|---|
| Mất dữ liệu | chặn DROP/TRUNCATE/reset remote, `docker compose down -v` | `guard_bash.py` |
| Lộ secret | chặn đọc `.env*` | `guard_files.py`, `guard_bash.py` |
| Sai phân quyền | sửa `**/auth/**`, `middleware.*`, RLS cần duyệt | `.harness/gates.json` → `auth` |
| Test giả | chặn `.skip/.only`, sửa config test | `.harness/gates.json` → `test_config` |
| Đè nhau | chỉ sửa trong `paths` của task | `guard_files.py` (ownership) |

## Chỉ đường nhanh
<!-- Thêm khi friction log có tag tim-file. Ví dụ: "Tính phí giải đấu: src/modules/registration/fee.ts" -->
