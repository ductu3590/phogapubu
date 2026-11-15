# ADR-0001: Stack (kế thừa)

- Ngày: 2026-11-13
- Trạng thái: đã duyệt — ghi lại stack **thực tế** lúc áp harness

## Quyết định
| Phần | Công nghệ thực tế | Lệch `defaults.md` |
|---|---|---|
| Mini App | Zalo Mini App: React 18 + TS, zmp-sdk/zmp-ui, zustand, @tanstack/react-query, Tailwind 3, Vite, vitest | Khớp loại `zalo-mini-app` |
| Admin web | Next.js **16** (App Router) + React 19, Tailwind 4, lucide-react, vitest, exceljs | Không dùng shadcn/ui; Next 16 — đọc `admin-web/AGENTS.md` trước khi viết |
| Backend | Supabase (Postgres + RLS + RPC `SECURITY DEFINER`, Realtime, Storage, Edge Functions Deno), một project mọi quán, `store_id` | Không có bảng `memberships` — dùng `mevo_operators` + helper vai trò |
| Phần mềm in | Electron (`print-agent/`) | — |
| Package manager | **npm** (mỗi app một `package-lock.json`, không có workspace gốc) | defaults là pnpm |
| Validate | Không dùng Zod; kiểm ở RPC Postgres + hàm thuần TS | defaults là Zod |
| Test | vitest (admin-web, mini-app, print-agent) + `node --test` trên PGlite (`supabase/tests`) + test race Postgres thật | Chưa có Playwright e2e |
| Thanh toán | Zalo Checkout SDK (ví + chuyển khoản BANK) cho trả trước; VietQR thu ngân bấm cho trả sau | defaults là VietQR + SePay — SePay đã bỏ (2026-07-24) |
| Deploy | Vercel (admin-web), `zmp deploy` từ `mini-app-instances/<slug>` (Mini App) | — |

## Lý do
Kế thừa — dự án có từ 2026-05, quyết định từng phần ghi ở `docs/decisions.md` và `CLAUDE.md` §2–§3.
Không đổi stack trong giai đoạn go-live Yên Garden.
