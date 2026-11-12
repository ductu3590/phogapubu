# AUDIT-1 — Dọn codebase sau audit (2026-11-11)

Nhánh `claude/codebase-audit-cleanup-da23f0`. Đợt này **chỉ xoá và gom**, không thêm tính năng. Mục tiêu của
checklist: chắc rằng thứ bị xoá đúng là không ai dùng. Test trên **Bảo Lương** (không cần Pubu).

Đã tự kiểm bằng máy: admin-web `tsc` sạch, vitest 178 file / 1622 test xanh, `next build` chạy được;
mini-app typecheck + vitest giữ nguyên trạng thái trước khi sửa (4 dòng lỗi tsc và 1 file test hỏng có sẵn do
thư mục lõi cố ý thiếu `.env` / `app-config.json`).

## Nhóm A — admin-web (sau khi Vercel build xong nhánh / main)

| # | Việc | Kỳ vọng |
|---|---|---|
| A1 | Đăng nhập chủ quán → `/admin/pos` | POS mở bình thường, Timeline + cột Việc cần xử lý như cũ |
| A2 | Mở lần lượt các mục rail: Bếp (nếu có), Đặt bàn, Món, Bàn & QR, Hoá đơn, Báo cáo, Công nợ, Kho, Sổ thu chi, ⚙ Cài đặt | Hộp thoại nào cũng mở, không trang trắng / 404 |
| A3 | Đặt bàn mới từ POS → xác nhận → khách đến | Như cũ (đã xoá `listReservations` cũ, hàng đợi dùng `listReservationQueue`) |
| A4 | Thu tiền một bàn có giảm giá % ở POS | Số giảm + số phải thu đúng như trước (đã xoá hàm tham chiếu `allocateDiscount`, server vẫn là nơi chia) |
| A5 | Thêm một món mới không gõ mã | Mã món tự sinh `PREFIX-00N` như cũ (trigger DB; 4 hàm TS sinh mã đã xoá vì không ai gọi) |
| A6 | Đăng nhập superadmin → `/mevo` | Sidebar KHÔNG còn mục "Bộ giao diện"; Tổng quan, Tạo quán mới, Danh sách quán, Tài khoản vận hành mở bình thường |
| A7 | `/mevo/stores/<id Bảo Lương>` → mục "Official Account / Webhook" | Không còn ô "OA API App ID"; lưu OA Access Token / App Secret vẫn được; khối thông báo nhóm Zalo còn nguyên |
| A8 | `/mevo/stores/new` → bước 4 | Không còn ô "OA API App ID"; bấm Bỏ qua / Lưu đi tiếp được |
| A9 | Gõ thẳng `/admin/cashier`, `/admin/orders`, `/admin/dashboard`, `/admin/spin` | 404 (các redirect URL cũ đã bỏ — cố ý). Máy POS Bảo Lương mở thẳng `/admin/pos` nên không ảnh hưởng |
| A10 | Tạo một đặt bàn mới từ Mini App (hoặc POS) | Nhóm Zalo vận hành vẫn nhận thông báo như trước (đường ZCA không đụng tới) |

## Nhóm B — Mini App (sau khi merge vào worktree Bảo Lương + `zmp deploy` bản Development)

| # | Việc | Kỳ vọng |
|---|---|---|
| B1 | Quét QR bàn → menu → thêm món có lựa chọn + ghi chú → giỏ → gọi món | Như cũ; ô ghi chú vẫn có nhãn "Ghi chú" và placeholder |
| B2 | Trong giỏ: tăng / giảm số lượng về 0 | Món biến mất khỏi giỏ, tổng tiền đúng |
| B3 | Tắt mạng điện thoại rồi mở tab Đơn gọi | Hiện nhắc "Vui lòng kiểm tra kết nối mạng" (lớp react-query đã viết gọn lại) |
| B4 | Thoát app, mở lại trong vòng 6 giờ | Giỏ hàng còn nguyên |
| B5 | Lướt hết các màn: Trang chủ, Đặt bàn, Đơn gọi, Thông tin nhà hàng, Tài khoản | Không màn nào thiếu icon / ảnh (đã xoá bộ icon + ảnh mẫu của template) |

## Nhóm C — DB (CHỈ làm sau khi A PASS và code đã lên Vercel)

| # | Việc | Kỳ vọng |
|---|---|---|
| C1 | Áp `supabase/migrations/130_drop_dead_functions_and_columns.sql` lên prod (nguyên văn) | Không lỗi. Đã chạy thử trong giao dịch rồi ROLLBACK ngày 2026-11-11: 254 → 242 hàm, bớt 1 bảng |
| C2 | Lặp lại A1, A3, A4, A10 và B1 | Vẫn như cũ |
| C3 | Trên Supabase Dashboard → Edge Functions: xoá `zalopay-create-order`, `zalopay-callback`, `reservation-owner-notify` | Ba function này không còn trong repo và không ai gọi |

## Việc anh Tú tự làm (không phải test)

- Zalo Developer Console: **reset app secret** từng bị lộ trong chat (ghi chú cũ nằm ở `docs/BACKLOG.md`, file đó
  đã xoá khỏi cây thư mục nhưng secret vẫn nằm trong lịch sử git) rồi nhập secret mới ở `/mevo/stores/<id>`.
