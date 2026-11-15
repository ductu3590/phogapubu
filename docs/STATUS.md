# Hiện trạng dự án — mevo

> Ảnh chụp lúc áp harness (2026-11-13, `main` @ `f5b299d`). Nguồn: code thật, `.harness/adopt-report.md`,
> `TESTING.md`, `python scripts/verify.py --fast`. Mỗi task done cập nhật dòng tương ứng.
> Lịch sử quyết định + bẫy đã vấp: [docs/decisions.md](decisions.md). Luật đang hiệu lực: [CLAUDE.md](../CLAUDE.md) §6.

## Tóm tắt
- **Đã chạy được:** Mini App gọi món (trả trước + trả sau), POS thu ngân `/admin/pos`, màn nhân viên `/staff`, cockpit `/mevo`,
  đặt bàn, mâm/ghép bàn, chuyển bàn, giảm giá bill + theo món, thu kết hợp + VietQR, ngày kinh doanh + ca + sổ thu chi,
  kho + giá vốn, công nợ, báo cáo, vai Quản lý, in 2 nơi (trình duyệt + phần mềm MEVO In), tài khoản bắt đổi mật khẩu.
- **Đang dở:** Mini App Yên Garden (theme `garden`) đã vào main 2026-11-15, chờ `zmp deploy`; dữ liệu
  thật của Yên Garden (menu, Zalo App ID, sơ đồ bàn) chưa có; một số đợt Đợt 1 chờ anh Tú test tay.
- **Chưa làm:** go-live Yên Garden 2026-12-01 (lắp máy 24–25/11, chạy thử 27–30/11), máy in nhiệt 80mm thật.
- **Nợ kỹ thuật lớn nhất:** nợ verify đã trả (T-003, 2026-11-15); checkout gốc còn cache `.next/types` cũ làm
  `10-admin-web` đỏ cục bộ → D-003. Repo không có `package.json` gốc nên verify chạy qua `scripts/verify.d/*.sh`.

## Tính năng
| Tính năng | Trạng thái | Bằng chứng | Có test? | Ghi chú |
|---|---|---|---|---|
| Mini App: menu, giỏ (lưu 6h), gọi món, Món đã gọi | ✅ | `mini-app/src/pages/{menu,checkout,session-orders}`, [F-mini-app-goi-mon](features/F-mini-app-goi-mon.md) | có (vitest 241 test) | Chỉ kiểm trên Bảo Lương |
| Mini App: thanh toán Zalo Checkout (ví + chuyển khoản), thanh toán lại | ✅ | `supabase/functions/checkout-{create-mac,notify}`, `mini-app/src/pages/checkout` | một phần | **Vùng không đụng** — Pubu (trả trước) đang tạm dừng |
| Mini App: đặt bàn, đặt món trước, trang Tài khoản | ✅ | `mini-app/src/pages/{reservations,account}` | có | |
| Mini App theme `garden` (Yên Garden) | ✅ | main 8f212b8 (T-001), mig 134–136 + 140 (T-005, bàn lọc theo quán) prod, [T-001](features/T-001-mini-app-theme-garden.md) | có | PASS `MINI-APP.md` A–E 2026-11-15; chưa `zmp deploy` |
| POS thu ngân `/admin/pos` (timeline, việc cần xử lý, bill, thu tiền, in) | ✅ | `admin-web/app/admin/pos/`, [F-pos-thu-ngan](features/F-pos-thu-ngan.md) | có | |
| Phiên bàn trả sau, mâm, ghép/chuyển bàn | ✅ | mig 039/040/104–106/133, `lib/table-status.ts` | có (PGlite + race) | |
| Giảm giá bill + giảm giá theo món/danh mục | ✅ | mig 107/108/115, `lib/bill-discount.ts`, `lib/menu/menu-discount.ts` | có | Công thức TS ↔ SQL phải khớp tay |
| Thu kết hợp + VietQR | 🟡 | mig 112a/112b, `admin-web/app/admin/pos/payment-*.tsx` | có | Chờ test tay `docs/testing/dot1/{thu-tien-ket-hop,vietqr-*}.md` |
| Ngày kinh doanh + ca thu ngân + sổ thu chi | ✅ | mig 111/122/122b, `admin-web/app/admin/cashbook/` | có | THU-CHI 0 FAIL |
| Kho + giá vốn bình quân | ✅ | mig 118/127, `admin-web/app/admin/inventory/` | có | |
| Công nợ | ✅ | mig 123, `admin-web/app/admin/debts/` | có | |
| Báo cáo bán hàng + tài chính, Hoá đơn (A04) | ✅ | mig 100/117/125, `admin-web/app/admin/{bills,reports}/` | có | |
| Vai Quản lý (`store_manager`) + luật vai trò | ✅ | mig 116, `admin-web/lib/auth/roles.ts` | có | |
| Tài khoản + bắt đổi mật khẩu lần đầu | ✅ | mig 137, `admin-web/app/(auth)/change-password/` | có | PASS 2026-11-13 |
| Đóng/mở lại bàn + khoá cấu hình quy trình | 🟡 | mig 138/139 | có | Chờ test `docs/testing/yen-garden/FIX-BAN-CAU-HINH.md` |
| In: trình duyệt + MEVO In (Electron) + in bếp do máy chủ xếp | 🟡 | `print-agent/`, `admin-web/app/print/`, mig 131 | có | Part 1/Part 2 chờ test tay; máy nhiệt 80mm chưa thử |
| Màn nhân viên `/staff` | ✅ | `admin-web/app/staff/` | có | |
| Màn bếp `/kitchen` (quán không dùng `pos_confirmation`) | ✅ | `admin-web/app/kitchen/` | một phần | Không dùng ở BL/YG |
| Cockpit MEVO `/mevo` (tạo quán, tài khoản) | ✅ | `admin-web/app/mevo/` | có | |
| Dọn codebase sau audit | 🟡 | mig 130 | có | Chờ test `docs/testing/audit-cleanup/AUDIT-1.md` |

Danh sách đầy đủ checklist test: [TESTING.md](../TESTING.md).

## Việc đang dở khi áp harness
| Nguồn | Nội dung | Xử lý |
|---|---|---|
| nhánh `claude/yen-garden-mini-app-aa37d2` | +12 commit, Mini App theme garden | ✅ T-001 done, merge main 8f212b8 — trước đây: T-001 (`python scripts/task.py start T-001 --from claude/yen-garden-mini-app-aa37d2`) |
| nhánh `claude/yen-garden-survey-e9a44a` | 1 commit logo/banner | Đã nằm trong nhánh T-001 — bỏ qua, KHÔNG xoá |
| nhánh `claude/discount-item-category-feature-c6612e`, `claude/so-tay-webhook-mevo-56088d`, `ductu3590/remora` | Nội dung tương đương đã có trong `main` | Bỏ qua, KHÔNG xoá |
| nhánh `deploy/bia-lau-bao-luong`, `deploy/yen-garden` | Nhánh worktree của từng quán (`mini-app-instances/`) | Không phải task — đồng bộ bằng `git merge origin/main` |
| checklist test tay chờ anh Tú | FIX-BAN-CAU-HINH, AUDIT-1, Đợt 1 (thu kết hợp, VietQR, in Part 1/2) | → T-002 (anh test, agent sửa lỗi phát sinh) |
| file chưa commit | `.env.bl4-test.local` (untracked) | Để nguyên, không đọc |
| TODO/FIXME | 0 | — |

## Vùng không đụng (legacy)
Anh Tú chỉ định 2026-11-13 — agent KHÔNG sửa nếu chưa hỏi:
- **Luồng thanh toán:** `supabase/functions/checkout-create-mac/**`, `supabase/functions/checkout-notify/**`,
  `supabase/functions/_shared/**` (phần checkout), `mini-app/src/pages/checkout/**`, `mini-app/src/components/checkout/**`,
  RPC `create_order`, `collect_table_bill`, `close_table_session` (sửa bằng migration mới, có test race).
- **`mini-app-instances/**`:** worktree của từng quán, chỉ đồng bộ bằng `git merge origin/main`, không sửa tay.

Đã vào `.harness/gates.json` (D-001, 2026-11-15): checkout lõi + edge function ở cổng `payments`, `mini-app-instances/**`
ở cổng `legacy`. RPC tiền không gác theo file — sửa bằng migration mới kèm `npm run test:race`.

## Nợ cũ (baseline)
`python scripts/verify.py --fast` lúc adopt (2026-11-13) — **chưa chụp baseline** (anh chạy `python scripts/baseline.py capture`):

| Bước | Kết quả | Nguyên nhân |
|---|---|---|
| harness | ✓ | |
| 10-admin-web | ✗ 1/1620 | `lib/server-client-boundary.test.ts` quá 5s khi chạy cả bộ (7.7s); chạy riêng thì PASS — test chập chờn |
| 20-mini-app-test | ✓ 241/241 | |
| 21-mini-app-typecheck | ✗ 4 lỗi | `app.tsx` SnackbarProvider (type zmp-ui), `index.ts` thiếu `app-config.json` (cố ý vắng ở source lõi), `category.api.ts` SelectQueryError |
| 30-db-tests | ✗ 1/589 | `048_pos_table_areas.test.mjs` import thẳng `PGLITE_MODULE` → hỏng trên Windows (31 file khác tự `pathToFileURL`) |
| 40-print-agent | ✓ | |

Trả nợ: **T-003 done 2026-11-15** — cả 3 bước xanh trong worktree (timeout riêng cho test quét, 048 dùng `pathToFileURL`,
khai báo type `app-config.json`; 2 lỗi typecheck kia hết nhờ T-001 bỏ `supabase-js`). Trên checkout gốc: mini-app-typecheck ✓,
db-tests ✓; admin-web còn đỏ cục bộ vì cache `.next/types` cũ (D-003), không phải lỗi code.
