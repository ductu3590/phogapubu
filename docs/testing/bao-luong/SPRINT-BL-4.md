# Bảo Lương — Sprint BL-4

## Test 1 — Đồng bộ POS khi mạng chậm

### Codex đã chạy

- ✅ Watcher đặt bàn và Gọi nhân viên vẫn áp snapshot sau khi request chậm hơn chu kỳ polling; event đến trong lúc tải chỉ đánh dấu cần tải lại, không làm snapshot bị bỏ vô hạn.
- ✅ Cashier session watcher không chồng nhiều lần tải; khi request đang chạy, event/poll được gộp và chạy một lượt sau khi request hiện tại hoàn tất.
- ✅ Cashier watcher refresh khi kết nối lại, focus, online và quay lại tab; dispose gỡ timer/listener/channel.
- ✅ Admin Web: `61` file test, `370/370 PASS`.
- ✅ TypeScript: `npx tsc --noEmit --pretty false` PASS.
- ✅ Production build: `npm run build` PASS.

### Anh Tú cần test tay — Test 1A

1. Mở `/admin/cashier` và `/staff/tables` cùng lúc. Gọi **Gọi nhân viên** từ Mini App; không F5, không bấm lại tab. Card phải xuất hiện ở POS/staff.
2. Khi đang có request, đổi tab hoặc giả lập mạng chậm. Khi quay lại, danh sách bàn/đơn phải hội tụ đúng dữ liệu mới; không mất card.
3. Bấm **Đã xử lý** hoặc xác nhận một thao tác trên POS trong lúc đang tải. Kết quả đã xử lý không được xuất hiện lại sau khi request cũ hoàn tất.

### Test 1B — tab nền/mạng chậm

1. Để POS ở tab riêng, chuyển sang tab khác ít nhất 5 phút rồi quay lại.
2. Ghi thời gian từ lúc quay lại đến khi card/bàn mới xuất hiện; không yêu cầu đúng một con số cố định, chỉ cần không phải F5 và ghi lại số đo thực tế.
3. Tắt/mở mạng một lần. Lỗi phải giữ nguyên trên màn hình; khi mạng trở lại, dữ liệu tự hồi phục.

### Test 1C — giới hạn phạm vi

- Chưa cần deploy Mini App mới; Task 1 chỉ thay đổi Admin Web.
- Bảo Lương vẫn duyệt/in phiếu giấy từ POS; không thêm bước Kitchen Display.
- Pubu vẫn giữ luồng Kitchen/đơn trả trước hiện tại.

**Nghiệm thu:** ✅ `Task 1 PASS` — anh Tú xác nhận ngày 2026-09-29. Codex đã commit thay đổi Task 1; chưa chuyển Task 2.
