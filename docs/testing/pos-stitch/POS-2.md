# POS-2 — Việc cần xử lý gộp (P05) + duyệt từng lượt gọi món (P03)

Nhánh `feat/pos-timeline`, trang `/admin/pos`. `/admin/cashier` không đổi. Không đổi API / RPC / database: duyệt =
`pos_confirm_order` + in 2 liên như cũ, từ chối = sheet lý do cũ, gọi NV / đặt bàn / gọi nhắc khách / hoãn nhắc gọi đúng
hàm đang chạy.

## Đã làm

| Chỗ | Nội dung |
|---|---|
| Cột phải "Việc cần xử lý" | MỘT danh sách thẻ thay cho 5 khối rời. Lọc: **Tất cả / Lượt món / Gọi NV / Đặt bàn** (có số) |
| Thứ tự | Gọi nhân viên → lượt món chờ duyệt → đặt bàn xung đột → khách trễ → đến giờ hẹn → gọi nhắc khách → đặt bàn chờ duyệt → khách xin đổi → sắp đến (≤60 phút). Cùng loại: chờ lâu lên trước |
| Thẻ lượt món (P03) | "Mâm 1 · Bàn 9, Bàn 10 · **Lượt 2**", giờ gọi + đã chờ bao lâu, nguồn (Khách gọi qua QR / Nhân viên đặt hộ), đủ món + topping + tiền, tổng lượt; **Duyệt & in bếp** / **Từ chối** / Mở bill |
| Thẻ gọi nhân viên | Bàn / mâm, chờ bao lâu, số lần gọi; **Đã xử lý** / Mở bill |
| Thẻ đặt bàn | Khách, giờ hẹn, bàn, nhãn màu (Xung đột / Trễ N phút / Đến giờ hẹn / Chờ duyệt / Còn N phút); nút theo trạng thái + Chi tiết; tới lượt chuông nhắc thì có **Hoãn nhắc +10 / +15 / +30 phút** cho riêng khách đó |
| Thẻ gọi nhắc khách | Nút gọi số điện thoại · Đã gọi · Chưa liên hệ được |
| Món đặt trước | Khối cũ, nằm cuối danh sách (Tất cả / Đặt bàn) |
| Chip hàng đợi | Bấm chip mở cột này ĐÚNG bộ lọc (Lượt món chờ duyệt → Lượt món…) |

Bỏ: dải "Đơn mới 15 phút" (đơn chờ duyệt đã có thẻ riêng; đơn đã duyệt xem trong bill). Chưa làm "Duyệt nhanh tất cả":
mỗi lượt mở một tab in, trình duyệt chặn khi mở nhiều tab liền nhau → dễ duyệt mà mất phiếu bếp.

Xem trước: `/mevo/ui-kit` mục **Việc cần xử lý (POS)**.

## Test (chủ quán Bảo Lương, cột phải ở màn ≥ 1280px; màn nhỏ mở bằng nút / chip)

1. Không có việc gì → "Không có việc nào đang chờ…", các tab lọc đều 0.
2. Khách gọi món qua QR ở 1 bàn → thẻ **Lượt 1** hiện đúng món, topping, tổng; chuông kêu; chip "Lượt món chờ duyệt" = 1.
3. Bấm **Duyệt & in bếp** → mở tab in 2 liên như POS cũ; thẻ biến mất; thanh Timeline của bàn chuyển xanh lá.
4. Khách gọi thêm → thẻ ghi **Lượt 2** (tính cả lượt đã duyệt). Nhân viên đặt hộ ở `/staff/order` → thẻ ghi "Nhân viên đặt hộ".
5. **Từ chối** một lượt → sheet chọn lý do như cũ; xác nhận xong thẻ biến mất.
6. Khách bấm "Gọi nhân viên" → thẻ gọi NV lên **đầu** danh sách, chuông kêu; **Đã xử lý** → thẻ biến mất. Mở bill → cột phải ra bill bàn đó.
7. Có 2 việc khác loại: tab Lượt món / Gọi NV chỉ còn đúng loại đó, số trên tab khớp.
8. Bấm chip "Gọi nhân viên" ở thanh hàng đợi (màn < 1280px) → sheet mở sẵn tab **Gọi NV**.
9. (Nếu bật đặt bàn) đặt bàn chờ duyệt → thẻ vàng "Chờ duyệt", Xác nhận & chọn bàn chuyển sang Sơ đồ bàn; đặt bàn đã xác nhận còn ≤ 60 phút → thẻ xanh dương "Còn N phút"; quá giờ hẹn → "Đến giờ hẹn", quá 15 phút → đỏ "Trễ N phút".
10. Tới giờ nhắc đặt bàn (chuông nhắc kêu) → thẻ có **Hoãn nhắc +10 / +15 / +30 phút**; bấm +10 → không nhắc lại trong 10 phút.
11. Món đặt trước cần duyệt vẫn hiện ở cuối danh sách và duyệt / in được như POS cũ.

## Bỏ cảnh báo "Còn N món chưa xong" (2026-10-03)

Bảo Lương bếp làm xong là bưng ra, không ai cập nhật trạng thái bếp → cảnh báo hiện ở mọi bàn khi thu tiền. Đã bỏ ở
bill thu ngân (`/admin/pos` + `/admin/cashier`) và sheet thu tiền `/staff/tables`. Không đổi gì khi bấm thu tiền.

12. Bàn vừa duyệt món xong mở bill → **không** còn ô vàng "Còn N món chưa xong"; thu tiền đóng bàn bình thường.
13. Làm lại ở `/staff/tables` (nhân viên) → sheet thu tiền cũng không còn ô đó.

**→ Báo:** `POS-2 PASS` hoặc số bài FAIL kèm ảnh.
