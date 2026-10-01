# Bảo Lương — Runbook pilot

## Trước ca

1. Chủ quán mở `/admin/cashier`, giữ tab POS hiển thị và bật âm thanh.
2. Thử máy in bằng phiếu test; nhóm **Thông báo nội bộ** chỉ là nhắc việc, không thay POS.
3. Mở `/admin/reservations` để xem booking hôm nay.

## Đặt bàn và món đặt trước

1. Xác nhận booking, chọn đúng bàn/mâm trên POS.
2. Nhắc khách trước giờ đến 60 phút theo quy trình quán.
3. Món đặt trước chỉ xuống bếp khi chủ quán duyệt và in hai liên cùng giá/tổng. Nếu chưa rõ đã in, kiểm tra giấy và print job trước khi in lại.
4. Khách đến: bấm **Khách đã đến**. No-show hoặc booking quá giờ được chủ quán đóng tay.

## Sự cố

| Triệu chứng | Người xử lý | Thao tác | Dấu hiệu hồi phục |
| --- | --- | --- | --- |
| Nhóm không báo booking | Chủ quán | Tiếp tục xử lý tại POS; MEVO kiểm `/mevo/stores/<storeId>` → Thông báo nội bộ | Delivery có trạng thái mới; không tạo tin thử thay booking thật |
| Mất mạng POS | Chủ quán | Không nhận thanh toán/đóng bill; ghi tay, mạng lại thì đối soát POS | POS tải lại và bill khớp sổ tay |
| Máy in lỗi | Chủ quán | Sửa máy/giấy; kiểm phiếu đã ra trước khi in lại | Hai liên in đúng một lần |
| Cần dừng khẩn | MEVO/owner | Tắt capability phù hợp hoặc `is_accepting_orders`; booking/bill cũ vẫn xử lý tại POS | Yêu cầu mới bị chặn, dữ liệu cũ còn mở được |

## Deploy và hồi phục

1. Áp migration tương thích ngược trước, rồi cấu hình transport/Edge, Admin Web, kiểm release instance, Mini App **Testing**, Publish và cuối cùng QR khách thật.
2. Chạy `node scripts/bl4-check-release.mjs --instance <absolute-instance-dir> --expected-commit <sha> --expected-app-id <app-id>` trước deploy. Không in secret.
3. Lệnh `zmp deploy` chỉ chạy trong `<instance>/mini-app`, không chạy ở root repo. Dừng nếu checkout còn `MERGE_HEAD` hoặc `CHERRY_PICK_HEAD`.
4. Rollback ưu tiên công tắc server đã được kiểm. Rollback Mini App công khai cần Publish lại và có thể chờ Zalo duyệt; không coi Testing là bản khách thật.

### Cấu hình URL dispatch Thông báo nội bộ

URL Edge Function nằm trong `mevo_private.runtime_settings` (key `reservation_zca_notify_url`). Không dùng `ALTER DATABASE ... SET app.settings.*` từ SQL Editor vì role của SQL Editor không có quyền đặt custom parameter đó. Schema riêng này đã thu hồi quyền của `anon`, `authenticated` và `service_role`; URL không được lưu trong mã nguồn hoặc browser.
