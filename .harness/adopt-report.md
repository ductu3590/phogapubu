# Báo cáo quét repo — mevo

## Stack
- Package manager: — · Frameworks: —
- Test: CHƯA CÓ · TypeScript: không · Monorepo: không
- Dev: `?` cổng ?
- Script verify sẽ chạy: 
- Dữ liệu: Supabase không · migrations {'supabase/migrations': 143} · docker compose không

## Git (việc đang dở)
- Nhánh hiện tại: `main` · nhánh chính: `main` · 926 commit · gần nhất: 2026-11-13 chore: adopt harness
- File chưa commit (của anh, không tính harness): 0
- Nhánh chưa merge (ứng viên chuyển thành task bằng `python scripts/task.py start <ID> --from <nhánh>`):
  - `claude/yen-garden-mini-app-aa37d2` +12 commit · 2026-11-12 · docs: checklist test Mini App Yen Garden, nhat ky quyet dinh theme garden / khoi
  - `deploy/yen-garden` +12 commit · 2026-11-12 · docs: checklist test Mini App Yen Garden, nhat ky quyet dinh theme garden / khoi
  - `claude/yen-garden-survey-e9a44a` +1 commit · 2026-11-12 · chore: them logo, banner va ma mau thuong hieu Yen Garden
  - `deploy/bia-lau-bao-luong` +53 commit · 2026-11-12 · Merge nhanh claude/codebase-audit-cleanup-da23f0 (don codebase + Mini App tra sa
  - `claude/discount-item-category-feature-c6612e` +1 commit · 2026-11-10 · feat: giam gia theo mon / danh muc co dat lich (mig 115)
  - `claude/so-tay-webhook-mevo-56088d` +2 commit · 2026-10-19 · feat: chuyen tiep su kien So Tay ca o route zalo-oa-webhook (Webhook URL chung t
  - `ductu3590/remora` +1 commit · 2026-10-08 · fix: chuyển cấu hình banner Trang chủ lên ngay dưới phần Logo

## Cấu trúc
- 1115 file code · 391 file test · 0 TODO/FIXME

| Vùng | Code | Test |
|---|---|---|
| `admin-web/app` | 193 | 64 |
| `mini-app-instances/yen-garden` | 157 | 47 |
| `mini-app-instances/bia-lau-bao-luong` | 146 | 44 |
| `supabase/migrations` | 143 | **0** |
| `admin-web/lib` | 141 | 112 |
| `mini-app/src` | 122 | 44 |
| `mini-app-instances/pho-ga-pubu` | 86 | 15 |
| `supabase/tests` | 50 | 50 |
| `admin-web/components` | 28 | 2 |
| `print-agent/src` | 12 | 8 |
| `supabase/functions` | 9 | 4 |
| `docs/testing` | 7 | **0** |
| `admin-web` | 6 | **0** |
| `.superpowers/pos-verification` | 4 | **0** |
| `scripts` | 3 | **0** |
| `mini-app` | 2 | **0** |
| `ops/phone-proxy` | 2 | 1 |
| `admin-web/test-stubs` | 1 | **0** |
| `admin-web/types` | 1 | **0** |
| `mini-app/www` | 1 | **0** |
| `print-agent/scripts` | 1 | **0** |

Vùng ≥3 file chưa có test (agent phải viết test đặc tả trước khi sửa): `supabase/migrations`, `docs/testing`, `admin-web`, `.superpowers/pos-verification`, `scripts`

## Đường dẫn nhạy cảm (đề xuất cổng)
- auth: `admin-web/app/(auth)/login/**`, `admin-web/lib/auth/**`, `admin-web/lib/session-table-label.test.ts`, `admin-web/lib/session-table-label.ts`, `admin-web/lib/session-timeout.test.ts`, `admin-web/lib/session-timeout.ts`, `admin-web/lib/supabase/auth-users.test.ts`, `admin-web/lib/supabase/auth-users.ts`
- payment: `admin-web/app/admin/pos/payment-method-fields.test.tsx`, `admin-web/app/admin/pos/payment-method-fields.tsx`, `admin-web/app/admin/pos/payment-vietqr.test.tsx`, `admin-web/app/admin/pos/payment-vietqr.tsx`, `admin-web/components/vietqr-code.test.tsx`, `admin-web/components/vietqr-code.tsx`, `admin-web/lib/collect-payment.test.ts`, `admin-web/lib/collect-payment.ts`
- admin: `admin-web/app/admin/@modal/**`, `admin-web/app/admin/account/**`, `admin-web/app/admin/admin-nav.test.tsx`, `admin-web/app/admin/admin-nav.tsx`, `admin-web/app/admin/bills/**`, `admin-web/app/admin/cashbook/**`, `admin-web/app/admin/config-dialog.test.ts`, `admin-web/app/admin/config-dialog.tsx`

Tài liệu có sẵn: CLAUDE.md
