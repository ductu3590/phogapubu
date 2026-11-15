# AUDIT-1 — Dọn codebase sau audit (2026-11-11)

Nhánh `claude/codebase-audit-cleanup-da23f0`. Đợt này **chỉ xoá và gom**, không thêm tính năng. Mục tiêu của
checklist: chắc rằng thứ bị xoá đúng là không ai dùng. Test trên **Bảo Lương** (không cần Pubu).

> **Agent 2026-11-15 (T-002):** vitest admin-web 178 file / 1627 test xanh; `node --test supabase/tests/*.test.mjs` 588/589 (1 đỏ = nợ cũ 048 trên Windows). Cột Kết quả: "Agent ✓" = đã kiểm đủ bằng máy; "👤" = anh Tú. Gom thứ tự ở [../TRUOC-GO-LIVE.md](../TRUOC-GO-LIVE.md).

Đã tự kiểm bằng máy: admin-web `tsc` sạch, vitest 178 file / 1622 test xanh, `next build` chạy được;
mini-app typecheck + vitest giữ nguyên trạng thái trước khi sửa (4 dòng lỗi tsc và 1 file test hỏng có sẵn do
thư mục lõi cố ý thiếu `.env` / `app-config.json`).

## Nhóm A — admin-web (sau khi Vercel build xong nhánh / main)

| # | Việc | Kỳ vọng | Kết quả |
|---|---|---|---|
| A1 | Đăng nhập chủ quán → `/admin/pos` | POS mở bình thường, Timeline + cột Việc cần xử lý như cũ | 👤 anh Tú. |
| A2 | Mở lần lượt các mục rail: POS, Bếp (nếu quán có), Đặt bàn, Món, Hoá đơn, Công nợ, Báo cáo, Thu chi, Kho, Bàn QR, rồi ⚙ Cài đặt (nhãn khớp `admin-nav.tsx` 2026-11-15) | Hộp thoại nào cũng mở, không trang trắng / 404 | 👤 anh Tú. Agent: `admin-nav.test.tsx`, `config-dialog.test.ts` xanh; `next build` không chạy ở T-002. |
| A3 | Đặt bàn mới từ POS → xác nhận → khách đến | Như cũ (đã xoá `listReservations` cũ, hàng đợi dùng `listReservationQueue`) | 👤 anh Tú. Agent ✓: không còn tham chiếu `listReservations` cũ, test đặt bàn (`reservation-*.test.*`, SQL 052–071) xanh (15/11). |
| A4 | Thu tiền một bàn có giảm giá % ở POS | Số giảm + số phải thu đúng như trước (đã xoá hàm tham chiếu `allocateDiscount`, server vẫn là nơi chia) | 👤 anh Tú nhìn số trên POS. Agent ✓ logic: `lib/bill-discount` test + SQL `107_bill_discount`, `108_*`, `112a_collect_table_bill` (gộp 2 mâm có giảm giá) xanh (15/11). |
| A5 | Thêm một món mới không gõ mã | Mã món tự sinh `PREFIX-00N` như cũ (trigger DB; 4 hàm TS sinh mã đã xoá vì không ai gọi) | 👤 anh Tú. |
| A6 | Đăng nhập superadmin → `/mevo` | Sidebar KHÔNG còn mục "Bộ giao diện"; Tổng quan, Tạo quán mới, Danh sách quán, Tài khoản vận hành mở bình thường | Agent ✓ đọc code `admin-web/app/mevo/layout.tsx`: sidebar chỉ còn Tổng quan, Tạo quán mới, Danh sách quán, Tài khoản vận hành (15/11). Lưu ý: T-001 thêm ô chọn "Bộ giao diện" Mini App ở trang `/mevo/stores/<id>` và bước tạo quán — KHÔNG phải mục sidebar, A6 vẫn đúng. |
| A7 | `/mevo/stores/<id Bảo Lương>` → mục "Official Account / Webhook" | Không còn ô "OA API App ID"; lưu OA Access Token / App Secret vẫn được; khối thông báo nhóm Zalo còn nguyên | 👤 anh Tú lưu token. Agent ✓: chuỗi "OA API App ID" không còn trong `admin-web/app\|lib\|components` (15/11). |
| A8 | `/mevo/stores/new` → bước 4 | Không còn ô "OA API App ID"; bấm Bỏ qua / Lưu đi tiếp được | 👤 anh Tú. Agent ✓: chuỗi "OA API App ID" không còn trong wizard (15/11). Lưu ý: bước 4 nay có thêm ô Bộ giao diện của T-001. |
| A9 | Gõ thẳng `/admin/cashier`, `/admin/orders`, `/admin/dashboard`, `/admin/spin` | 404 (các redirect URL cũ đã bỏ — cố ý). Máy POS Bảo Lương mở thẳng `/admin/pos` nên không ảnh hưởng | Agent ✓ đọc code: không có thư mục route `app/admin/{cashier,orders,dashboard,spin}`, không redirect trong cấu hình Next → 404 mặc định (15/11). Chưa gõ URL thật. |
| A10 | Tạo một đặt bàn mới từ Mini App (hoặc POS) | Nhóm Zalo vận hành vẫn nhận thông báo như trước (đường ZCA không đụng tới) | 👤 anh Tú. Agent ✓ logic: SQL `063`, `080`, `083` (ZCA dispatch) xanh (15/11). |

## Nhóm B — Mini App (sau khi merge vào worktree Bảo Lương + `zmp deploy` bản Development)

| # | Việc | Kỳ vọng | Kết quả |
|---|---|---|---|
| B1 | Quét QR bàn → menu → thêm món có lựa chọn + ghi chú → giỏ → gọi món | Như cũ; ô ghi chú vẫn có nhãn "Ghi chú" và placeholder | 👤 anh Tú (điện thoại). |
| B2 | Trong giỏ: tăng / giảm số lượng về 0 | Món biến mất khỏi giỏ, tổng tiền đúng | 👤 anh Tú. |
| B3 | Tắt mạng điện thoại rồi mở tab Đơn gọi | Hiện nhắc "Vui lòng kiểm tra kết nối mạng" (lớp react-query đã viết gọn lại) | 👤 anh Tú. |
| B4 | Thoát app, mở lại trong vòng 6 giờ | Giỏ hàng còn nguyên | 👤 anh Tú. |
| B5 | Lướt hết các màn: Trang chủ, Đặt bàn, Đơn gọi, Thông tin nhà hàng, Tài khoản | Không màn nào thiếu icon / ảnh (đã xoá bộ icon + ảnh mẫu của template) | 👤 anh Tú. |

## Nhóm C — DB (CHỈ làm sau khi A PASS và code đã lên Vercel)

| # | Việc | Kỳ vọng | Kết quả |
|---|---|---|---|
| C1 | Áp `supabase/migrations/130_drop_dead_functions_and_columns.sql` lên prod (nguyên văn) | Không lỗi. Đã chạy thử trong giao dịch rồi ROLLBACK ngày 2026-11-11: 254 → 242 hàm, bớt 1 bảng | Theo `TESTING.md`: đã áp prod 2026-11-11. Agent không có quyền SQL prod nên KHÔNG xác minh lại. Repo có migration `130_drop_dead_functions_and_columns.sql`. |
| C2 | Lặp lại A1, A3, A4, A10 và B1 | Vẫn như cũ | 👤 anh Tú (làm gộp với A/B nếu A/B vừa chạy SAU 11/11 thì coi như đã bao gồm: ghi rõ ngày). |
| C3 | Trên Supabase Dashboard → Edge Functions: xoá `zalopay-create-order`, `zalopay-callback`, `reservation-owner-notify` | Ba function này không còn trong repo và không ai gọi | Agent ✓: `supabase/functions` chỉ còn `checkout-create-mac`, `checkout-notify`, `reservation-zca-notify`, `zalo-phone`, `zns-notify` (3 function trên đã không còn trong repo). 👤 anh Tú xoá trên Dashboard nếu còn. |

## Việc anh Tú tự làm (không phải test)

- Zalo Developer Console: **reset app secret** từng bị lộ trong chat (ghi chú cũ nằm ở `docs/BACKLOG.md`, file đó
  đã xoá khỏi cây thư mục nhưng secret vẫn nằm trong lịch sử git) rồi nhập secret mới ở `/mevo/stores/<id>`.
