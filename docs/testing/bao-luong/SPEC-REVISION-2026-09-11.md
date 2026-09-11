# Kiểm thử bản sửa spec quy trình Bảo Lương — 2026-09-11

Trạng thái: **PASS — anh Tú chốt spec ngày 2026-09-11.**

Phạm vi: chỉ kiểm tra tài liệu thiết kế, không có migration hoặc code cần chạy.

Spec: `docs/superpowers/specs/2026-09-10-bao-luong-reservation-pos-workflow-design.md`

## Kiểm tra tự động Codex đã chạy

- [x] Không còn `TBD`/`TODO` hoặc timeout 12 giờ.
- [x] Đánh số mục liên tục từ 1 đến 13.
- [x] `git diff --check` không báo lỗi whitespace.
- [x] Không sửa code, migration hoặc dữ liệu production.

## Test 1 — Quyết định vận hành mới

Đọc mục 3–8 của spec và xác nhận:

- Giờ phục vụ là cấu hình phẳng, giống nhau mọi ngày; không có lịch nghỉ đặc biệt.
- Khách sửa/hủy món đặt trước được tới trước giờ đến 30 phút.
- Không có PIN hoặc mã đặt bàn dễ đọc.
- QR bàn đã được giữ yêu cầu khách báo chủ quán mở bàn.
- Khách được nhắc trước 60 phút; POS nhắc gộp và Snooze 10/15/30 phút.
- Phiên bàn/mâm chỉ tự hết hạn sau 6 giờ không hoạt động, không giới hạn thời gian ăn.

## Test 2 — Giữ hồi quy Pubu

Đọc mục 3.2 và mục 10, xác nhận:

- Quy trình được điều khiển bằng policy/capability theo quán, không hardcode slug.
- Pubu tiếp tục prepay, Mang về và không bị buộc chờ POS nếu không bật policy.
- Admin Web có giao diện cấu hình cho chủ quán ngay trong phạm vi BL-0.

## Test 3 — Các blocker kỹ thuật

Đọc mục 5 và 9, xác nhận spec đã nêu rõ:

- Đặt món trước dùng RPC riêng và chỉ gắn session/table khi khách đến.
- Kiểm tra giờ đến thay vì giờ khách đang chọn món.
- Service request có vòng đời đóng, scope theo phiên/mâm và chống spam.
- Có idempotency, timezone thống nhất, trạng thái kết thúc no-show/hủy và audit lệnh in.

## Test 4 — Cấu hình quy trình trong Admin Web

Đọc mục 3.3, 5.1, 10 và Sprint BL-0, xác nhận:

- `/admin/settings` có khu **Quy trình vận hành** tách khỏi form thông tin quán.
- Có ba lựa chọn điền nhanh Pubu, Bảo Lương và Tùy chỉnh; preset không phải nguồn sự thật riêng.
- `store_owner` sửa quán mình, `mevo_superadmin` sửa quán được chọn, nhân viên không được sửa.
- Lưu qua RPC nguyên tử vào cấu hình có kiểu dữ liệu rõ ràng và ghi audit cũ/mới.
- Thay đổi nguy hiểm giữa ca bị chặn; tắt Đặt bàn không hủy booking cũ.
- Mini App/POS đọc cùng một cấu hình public-safe và Pubu/Bảo Lương có test ma trận hồi quy.

Kết quả cần phản hồi: `SPEC REVISION PASS` hoặc ghi rõ mục/test cần sửa.
