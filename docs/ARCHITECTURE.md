# Kiến trúc — mevo

> Nguồn đầy đủ: [CLAUDE.md](../CLAUDE.md) §2–§6 (kiến trúc Core + Theme, 3 tầng sửa mini-app, luật đang hiệu lực).
> File này là bản đồ cho agent harness. Mỗi lần friction log ghi "tim-file", thêm đúng một dòng vào "Chỉ đường nhanh".

## Stack
Xem `docs/decisions/0001-stack.md`.

## Bản đồ module (thư mục thật)
Monorepo **không có `package.json` gốc** — mỗi app tự quản `package.json` + `package-lock.json` (npm, không pnpm).

| Module | Thư mục | Agent thường làm | Test | Phụ thuộc |
|---|---|---|---|---|
| DB: schema, RLS, RPC | `supabase/migrations/` (143 file, đánh số; hậu tố chữ `103b_`/`112a_` bị `db push` bỏ qua) | backend-dev | `supabase/tests/*.test.mjs` (PGlite, 589 test) + `admin-web` `npm run test:race` (Postgres thật/Docker) | — |
| Edge functions | `supabase/functions/{checkout-create-mac,checkout-notify,reservation-zca-notify,zalo-phone,zns-notify,_shared}` | backend-dev | ít (4 file) | DB |
| Admin web: POS | `admin-web/app/admin/pos/` | frontend-dev | vitest | `admin-web/lib` |
| Admin web: cấu hình chủ quán (hộp thoại đè POS) | `admin-web/app/admin/@modal/(config)/` + trang `admin-web/app/admin/<tab>/` | frontend-dev | vitest | `admin-web/lib` |
| Admin web: nhân viên / bếp / MEVO / in | `admin-web/app/{staff,kitchen,mevo,print}/` | frontend-dev | vitest | `admin-web/lib` |
| Admin web: webhook | `admin-web/app/api/` | backend-dev | vitest | DB |
| Admin web: logic dùng chung | `admin-web/lib/` (hàm thuần, `lib/actions` server action, `lib/supabase` client, `lib/auth/roles.ts`) | backend-dev | vitest (112 file test) | DB |
| Admin web: UI dùng chung | `admin-web/components/` | frontend-dev | ít (2 file) | — |
| Mini App (source lõi) | `mini-app/src/{pages,components,services,stores,utils}` | frontend-dev | vitest (node) — hàm thuần ở `src/utils/` | DB (RPC) |
| Mini App từng quán | `mini-app-instances/<slug>/mini-app` (gitignored, worktree `deploy/<slug>`) | **không agent nào** — vùng không đụng | — | `mini-app/src` qua `git merge origin/main` |
| Phần mềm in (Electron) | `print-agent/` | backend-dev | vitest | admin-web `/print/agent` |
| Proxy SĐT Zalo | `ops/phone-proxy/` | backend-dev | 1 file | edge `zalo-phone` |
| Script vận hành | `scripts/` (create-mini-app-instance.sh, cai-pos-bao-luong.bat, test-race.mjs…) + script harness | orchestrator | — | — |

## Contracts (đang nằm ở đâu — chưa gom về `src/contracts/`)
Dự án không có thư mục contracts chung; **không di chuyển** khi chưa có ADR. Chỗ hợp đồng thật:
- **RPC Postgres** là contract chính giữa DB ↔ admin-web ↔ mini-app. Định nghĩa: migration mới nhất có `CREATE OR REPLACE` hàm đó
  (hỏi thẳng prod: `pg_get_functiondef`). Đổi chữ ký RPC = quyết định kiến trúc → ADR + migration riêng.
- **Type DB:** `admin-web/types/` (database types) và `mini-app/src/` (types dùng chung trong services).
- **Công thức nhân đôi TS ↔ SQL** (đổi một bên phải đổi cả hai): `lib/bill-discount.ts` ↔ mig 107/108;
  `lib/menu/menu-discount.ts` + `mini-app/src/utils/menu-discount.ts` ↔ `menu_discount_amount` (mig 115);
  `businessToday` (`lib/daily-report.ts`) ↔ `business_date_of` (mig 111); `planOrderJobs` (`lib/print/print-plan.ts`) ↔
  `auto_kitchen_print_enqueue` (mig 131).
- **Luật vai trò:** `admin-web/lib/auth/roles.ts` ↔ `is_store_pos_operator` / `is_store_back_office` / `is_store_owner_of`.
- **Zalo Checkout notify:** ví và chuyển khoản (BANK) là hai payload khác nhau — xem `checkout-notify` + decisions.md 2026-07-08.

## Dữ liệu
Một project Supabase dùng chung mọi quán, mọi bảng nghiệp vụ có `store_id` + RLS (`is_store_scoped_operator`, mig 019).
Bảng lõi: `stores`, `tables`, `table_sessions` + `session_tables` (phiên/mâm), `orders`, `order_items`, `menu_*`,
`reservations`, kho (mig 118), ca + sổ thu chi (mig 122), công nợ (mig 123). Không chép schema vào docs — hỏi DB.

## Chạy, quan sát, tái hiện lỗi
| Việc | Cách |
|---|---|
| Kiểm tra toàn bộ | `python scripts/verify.py` → chạy `scripts/verify.d/*.sh` (admin-web test+tsc, mini-app test, mini-app typecheck, DB PGlite, print-agent) |
| Chạy admin-web | `python scripts/run.py start` (= `npm --prefix admin-web run dev`, cổng 3000; log `.harness/run/dev.log`) |
| Chạy Mini App | KHÔNG từ `mini-app/` — `cd mini-app-instances/<slug>/mini-app && npm run dev` (anh Tú chạy) |
| Test RPC tiền đua nhau | `cd admin-web && npm run test:race` (cần Docker) |
| Test DB một file | `PGLITE_MODULE=<abs path admin-web/node_modules/@electric-sql/pglite/dist/index.js> node --test supabase/tests/<file>` |
| Đọc log | `python scripts/logs.py dev|supabase|ci` · Supabase MCP `get_logs` |
| Nhìn giao diện | `python scripts/ui_shot.py <path> [name] [--mobile]` → `.harness/screens/` (đăng nhập: mint phiên bằng service key) |
| Tái hiện bug | viết test fail trước (vitest / `supabase/tests`), rồi mới sửa |

## Rủi ro → cổng cứng
| Rủi ro | Cổng | Cấu hình |
|---|---|---|
| Mất dữ liệu | chặn DROP/TRUNCATE/reset remote | `.claude/hooks/harness_guard.py` |
| Lộ secret | chặn đọc `.env*` | `harness_guard.py` |
| Sai phân quyền | `**/auth/**`, `admin-web/app/(auth)/login/**`, RLS | `.harness/gates.json` → `auth` |
| Sai tiền | file thanh toán POS/VietQR, checkout mini-app, edge `checkout-*` | `.harness/gates.json` → `payments` |
| Sửa nhầm bản quán | `mini-app-instances/**` | `.harness/gates.json` → `legacy` |
| Test giả | chặn `.skip/.only`, sửa config test | `gates.json` → `test_config` |
| Sửa migration cũ | migration đã commit bất biến | `gates.json` → `immutable_existing` |
| Push/deploy prod | `git push main`, `vercel --prod` | `harness_guard.py` |
| Áp migration prod | **không gác** — anh Tú cho phép tự áp qua Supabase MCP | — |

## Vùng chưa có test (viết test đặc tả trước khi sửa)
`supabase/migrations` (test nằm ở `supabase/tests`), `admin-web/components` (2/28), `supabase/functions` (4/9 —
nhất là `checkout-notify`), `scripts/`, `mini-app/www`.

## Chỉ đường nhanh
- Trạng thái bàn (màu, chờ duyệt): `admin-web/lib/table-status.ts` → `tableVisualState()`; đơn chờ duyệt: `isReviewableOrder` / `orderInKitchen`.
- POS đọc định kỳ: `admin-web/lib/pos-browser-reads.ts` (không dùng server action để poll).
- Bộ theo dõi Realtime chung: `admin-web/lib/realtime-watch.ts`.
- Form có lỗi người dùng: `admin-web/lib/run-action.ts` (server action trả `{ok, error}`).
- Lịch sử một khu vực: tìm tên file / hàm / bảng / số migration trong `docs/decisions.md`.
