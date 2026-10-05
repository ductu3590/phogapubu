# MA-4 — Chọn món đặt trước (m04) + Xác nhận (m05) + rà soát cuối

Nhánh `feat/mini-app-stitch`. Chỉ test trên **Bia lẩu Bảo Lương**. `npm run dev` trong `mini-app-instances/bia-lau-bao-luong/mini-app` (đã gộp sẵn code).

Chuẩn bị: một lượt đặt bàn **đã được POS xác nhận** trên máy test (đặt ở tab Đặt bàn rồi xác nhận trên POS), quán bật "đặt món trước".

## Đã làm

- **Chọn món đặt trước (m04)**: thẻ lịch hẹn (tên, giờ, số khách) · ô tìm + chip danh mục dính · thẻ món lưới/danh sách như thực đơn (món nhiều loại/topping mở bảng chọn) · thanh tối "N món đặt trước · tổng · Xem món".
- **Xác nhận (m05)**: thẻ lịch hẹn · cảnh báo "chỉ gửi **một lần**, gửi xong khoá" · danh sách món (loại/topping, giá, nút − / +, "+ Thêm món") · **ô ghi chú gửi nhà bếp** (mới — phiếu in POS có dòng "Ghi chú đơn") · tổng tạm tính + cách thanh toán · nút **Khoá & gửi món đặt trước** → hộp xác nhận.
- Sửa 2 lỗi cũ: **tiền từng dòng không cộng topping** (lệch tổng) và **câu lỗi server bị che**. Bỏ hộp `alert` của trình duyệt → thông báo nổi trong app.
- Rà soát cuối khổ 360/390 cả hai lối vào: không cuộn ngang, không chữ bị cắt.

## Bài test

1. Chi tiết đặt bàn (đã xác nhận) → **Chọn món đặt trước** → trang m04: thẻ lịch hẹn đúng tên/giờ/số khách.
2. Thêm món thường (nút + → [− 1 +]); món nhiều loại → bảng chọn; tìm món không dấu chạy; chip nhảy đúng nhóm.
3. Thanh tối hiện số món + tổng; bấm **Xem món** → trang xác nhận m05.
4. Món có topping: tiền dòng = (giá + topping) × SL; các dòng cộng lại **bằng** Tổng tạm tính.
5. Sửa số lượng bằng − / + ngay ở m05; bấm "+ Thêm món" quay lại m04 vẫn giữ món đã chọn.
6. Gõ ghi chú cho bếp → **Khoá & gửi món đặt trước** → hộp xác nhận → **Khoá & gửi** → thông báo nổi + về chi tiết đặt bàn, khối **Món đã đặt trước** hiện đúng món.
7. POS: lượt món đặt trước hiện ở hàng chờ; in phiếu có dòng **Ghi chú đơn** đúng nội dung đã gõ.
8. Hộp xác nhận: bấm **Xem lại** / bấm ra ngoài → không gửi. Bấm Khoá & gửi nhanh 2 lần → chỉ có MỘT lượt món đặt trước.
9. Đặt bàn chưa xác nhận (Chờ quán xác nhận) → không có nút chọn món; mở thẳng link /preorder → báo "chưa thể chọn món trước" + nút Về chi tiết đặt bàn.
10. Rà nhanh cả app ở khổ 360: Trang chủ, Đặt bàn, Đơn của tôi, Thực đơn tại bàn, Giỏ hàng, Đơn gọi, Thông tin nhà hàng, Tài khoản — không cuộn ngang, không chữ bị cắt, thanh nút đáy không đè thanh tab.

**→ Báo:** `MA-4 PASS`
