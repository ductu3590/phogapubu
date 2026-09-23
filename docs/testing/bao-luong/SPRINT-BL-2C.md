# Bảo Lương — BL-2C: Duyệt và in món đặt trước

## Chuẩn bị một lần

1. Code Admin Web phải có Task 6. Mở PowerShell tại `D:\Code\mevo\admin-web`, chạy:

   ```powershell
   npm run dev
   ```

2. Đăng nhập đúng tài khoản **chủ quán Bảo Lương** và chỉ mở POS: [http://localhost:3000/admin/cashier](http://localhost:3000/admin/cashier).
   **Không mở Kitchen Display:** Bảo Lương chuyển món xuống bếp bằng phiếu giấy in từ POS.

3. Cần có một đặt bàn đã **Xác nhận** kèm một batch món đặt trước. Màn Mini App tạo món thuộc Task 7 nên tại Task 6, nếu chưa có dữ liệu, tạo một preorder test bằng SQL/RPC đã được Codex chuẩn bị hoặc nhờ em tạo. Không tự sửa trực tiếp `orders` ở production.

## Test 1 — Duyệt đúng phiên bản, không trùng

1. Vào POS. Trên đầu sơ đồ phải có khối tím **Món đặt trước cần xử lý**; nó độc lập với khối **Đặt bàn cần xử lý**.
2. Mở card: kiểm tên khách, số khách, giờ đến và danh sách món. Card chưa nhận khách phải ghi **chưa nhận khách**, không bịa số bàn.
3. Bấm **Xác nhận & in 2 liên**. Đây là cảnh báo chủ quán tự quyết định in sớm khi chưa cọc; không phải hệ thống tự in.
4. POS mở tab phiếu in. Đây là đường duy nhất để bếp nhận món: liên 1 giao bếp, liên 2 đặt tại bàn khách.
5. Quay lại POS, không được còn nút xác nhận đơn preorder trong dải **Đơn mới** hoặc khối vàng của bill. Preorder chỉ được xử lý ở khối tím.
6. Bấm lại hoặc refresh POS: không tạo phiếu gốc/chuông/batch mới. Nếu muốn in thêm, dùng **In lại / điều chỉnh**; không dùng nút xác nhận đơn thông thường.

PASS nếu owner duyệt đúng một revision, chỉ có phiếu giấy từ POS được dùng để giao bếp, không có đường xác nhận lách revision.

## Test 2 — Hai liên, bản điều chỉnh và popup

1. Tab in của lần đầu có hai liên:
   - Liên 1: **PHIẾU BẾP**, không giá.
   - Liên 2: phiếu món, có giá và ô tick.
2. Nếu card đang là revision 2 sau khi revision 1 đã in: mở card, kiểm có lời nhắc khách vừa sửa. Bấm **Xác nhận & in 2 liên**.
3. Phiếu mới phải đề **PHIẾU ĐIỀU CHỈNH** và `v2`; bếp chỉ làm theo phiếu v2 sau khi chủ quán giao phiếu, không thay đổi gì ngay từ lúc khách sửa.
4. Thử đóng/cấm popup trước lúc thao tác: POS phải báo phiếu đã tạo nhưng không xác nhận giấy đã ra. Không được rollback duyệt món; mở lại thao tác in để lấy phiếu.
5. Bấm in lại: nhập lý do. Phiếu phải có nhãn **IN LẠI**; không tạo một release mới.

PASS nếu tất cả nội dung được in từ snapshot thời điểm bấm, không từ món hiện hành bị sửa sau đó.

## Test 3 — Nhận khách, hủy/no-show và hao hụt

1. Với preorder chưa in, ở `/admin/reservations` bấm **Khách đã đến**: POS mở đúng bill/mâm; không tự sinh phiếu.
2. Với preorder đã in, hủy đặt bàn hoặc đánh no-show theo quy trình owner. Batch không được rơi vào bill mới; ở POS xuất hiện card/đường **Đối soát món đã huỷ/in**.
3. Bấm đối soát, nhập một kết quả ví dụ `Bếp chưa làm`. Card hao hụt biến mất sau khi server trả thành công.
4. Đăng nhập nhân viên hoặc chủ quán khác: không được mở `/admin/cashier`; gọi RPC release/in/đối soát bị từ chối. Pubu: QR, trả trước và đơn staff vẫn hoạt động như trước.

PASS nếu no-show/hủy không tự thu tiền hay tạo đơn khác; chỉ owner đúng quán mới có thể duyệt/in/đối soát.

## Codex đã tự kiểm

- PGlite: `3/3 PASS` — tenant/role, idempotent release+print, version guard, snapshot, no-show/hao hụt.
- Admin focused: `24/24 PASS`; `tsc --noEmit` PASS.
- Migration production: `069_reservation_preorder_release` và hotfix private-print-read `070_reservation_preorder_print_job_access` đã áp dụng; RPC owner-only được xác minh.

**Nghiệm thu:** Sau cả ba nhóm, trả lời **`BL-2C PASS`**. Em sẽ dừng ở đây và chỉ chuyển sang Task 7 sau xác nhận đó.
