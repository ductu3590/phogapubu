# POS-4 — Tiếp nhận khách đặt bàn (P02) + đặt bàn từ Timeline

Nhánh `feat/pos-timeline`, trang `/admin/pos`. Không đổi API / RPC / database: chỉ gọi lại các hàm đặt bàn đang chạy
(`create_manual_reservation`, `confirm_reservation`, `arrive_reservation`, `snooze_reservation_reminders`,
`mark_reservation_no_show`, `cancel_store_reservation`).

## Đã làm

| Chỗ | Nội dung |
|---|---|
| Bấm thanh đặt bàn | Cột phải = **Tiếp nhận khách đặt bàn**: tên, giờ hẹn, số khách, nhãn trạng thái (Trễ N phút / Xung đột / Đã đặt / Chờ duyệt / Khách xin đổi), bàn, số điện thoại bấm gọi được, ghi chú, giờ khách xin đổi |
| Món đặt trước | Nếu khách có món đặt trước: danh sách món + tổng (duyệt / in bếp vẫn ở mục Món đặt trước trong Việc cần xử lý) |
| Khách trễ | Quá giờ hẹn → **Hoãn chuông nhắc +10 / +15 / +30 phút** |
| Nút chính | Chờ duyệt → **Xác nhận & chọn bàn** (chuyển sang Sơ đồ bàn như cũ) · Đã xác nhận → **Khách đã đến · mở mâm** · Xin đổi → link trang Đặt bàn |
| Nút phụ | **Khách không đến** (hỏi lại rồi nhả bàn) · **Huỷ đặt bàn** (bắt nhập lý do) · link "Đổi giờ / đổi bàn ở trang Đặt bàn" |
| Bấm khoảng trống Timeline | Hàng của một bàn, chỗ chưa có thanh, từ "bây giờ" trở đi → sheet **Đặt bàn mới** có sẵn bàn + giờ (làm tròn xuống 15 phút). Tạo xong tự **xác nhận giữ đúng bàn đó** rồi mở panel tiếp nhận của đặt bàn vừa tạo |
| Nút **Đặt bàn** trên thanh trên | Đặt bàn chưa có bàn → nằm ở hàng "Chưa xếp bàn", xác nhận & chọn bàn sau |

Form đặt bàn mới là đúng form "tạo tay" của trang Đặt bàn (tên, số điện thoại, số khách, giờ đến, ghi chú, lý do tạo tay).
Nếu tạo được nhưng giữ bàn lỗi (bàn vừa bị giữ ở máy khác…) → POS báo rõ, đặt bàn nằm ở "Chưa xếp bàn".
Chỉ hiện khi quán bật đặt bàn. Xem trước panel: `/mevo/ui-kit` mục **Tiếp nhận khách đặt bàn (POS)**.

## Test (chủ quán Bảo Lương, quán đang bật đặt bàn)

1. Timeline: bấm khoảng trống trên hàng Bàn 5 lúc ~20:00 → sheet "Đặt bàn mới · Bàn 5 · từ 20:00", giờ đến điền sẵn.
2. Điền tên, số điện thoại, 4 khách, lý do → **Tạo đặt bàn** → thanh xanh dương viền đứt hiện trên hàng Bàn 5 lúc 20:00; cột phải mở **Tiếp nhận khách** của đặt bàn đó.
3. Bấm khoảng trống phía trước vạch đỏ (quá khứ) → không mở gì.
4. Nút **Đặt bàn** trên thanh trên → sheet ghi "Chưa chọn bàn"; tạo xong đặt bàn nằm ở hàng **Chưa xếp bàn**, thẻ vàng "Chờ duyệt"; bấm → **Xác nhận & chọn bàn** → chọn bàn ở Sơ đồ bàn như cũ.
5. Đặt bàn có món đặt trước (khách đặt qua Mini App) → panel hiện đủ món + tổng.
6. Đặt bàn quá giờ hẹn → nhãn "Trễ N phút" + nút **+10 / +15 / +30 phút**; bấm +10 → chuông nhắc không kêu lại trong 10 phút.
7. **Khách đã đến · mở mâm** → bàn mở phiên, cột phải chuyển sang bill của bàn đó; món đặt trước (nếu có) nằm trong bill.
8. **Khách không đến** → hỏi lại, đồng ý → thanh đặt bàn biến khỏi Timeline, bàn trống lại.
9. **Huỷ đặt bàn** → hiện ô lý do; chưa nhập thì nút Huỷ bị khoá; nhập xong → đặt bàn biến khỏi Timeline, trang Đặt bàn ghi đã huỷ kèm lý do.
10. Gọi số điện thoại trong panel mở ứng dụng gọi (điện thoại) / Zalo (máy tính).
11. Màn < 1280px: panel tiếp nhận là sheet đáy, nút chính luôn nhìn thấy.

## Vá vòng 1 (2026-10-03) — bài 1, 3 và màu đặt bàn trễ; các bài khác PASS

| Anh báo | Nguyên nhân | Sửa |
|---|---|---|
| Đặt bàn mỗi 30 phút mà form hiện 20:15 | POS tự làm tròn 15 phút, không đọc Cài đặt quán | Đọc **Bước giờ đặt bàn** của quán (Bảo Lương 30 phút) cho cả nút "+ Đặt lúc" lẫn nút Đặt bàn trên thanh trên |
| Khoá bàn đặt 2 tiếng | Thanh đặt bàn = **Khoảng giữ bàn kiểm tra trùng** trong Cài đặt quán, đang 180 phút; server cũng khoá bàn đúng khoảng này | Đã đổi Bảo Lương thành **120 phút** trên prod. Đặt bàn tạo TỪ GIỜ khoá 2 tiếng; đặt bàn tạo trước đó giữ 3 tiếng như lúc tạo. Muốn đổi nữa: Cài đặt quán → Khoảng giữ bàn kiểm tra trùng |
| Bấm nhầm khoảng trắng liên tục mở form | Cả hàng bấm được | Bỏ bấm khoảng trắng. Mỗi bàn có MỘT nút viền đứt **"+ Đặt lúc HH:MM"** ở mốc trống đầu tiên (từ bây giờ, sau khách đang ngồi, không đè đặt bàn khác trong khoảng giữ bàn) — giống bản Stitch. Giờ đổi được trong form |
| Đặt bàn trễ vẫn nền xanh, chỉ viền đỏ | Trước đây chờ quá 15 phút mới tô đỏ; viền đỏ là viền "đang chọn" | Quá giờ hẹn là **nền đỏ "Trễ N phút" ngay** |

1b. Bây giờ 14:41 → mỗi bàn trống có nút "+ Đặt lúc 15:00" (bước 30 phút); bấm → form giờ đến 15:00.
1c. Bàn đang có khách → nút nằm SAU thanh của khách; bàn có đặt bàn 20:00 → nút không rơi vào 18:30–21:59.
3b. Bấm khoảng trắng trên Timeline → không mở gì.
2b. Tạo đặt bàn mới → thanh dài đúng **2 tiếng**.
6b. Đặt bàn quá giờ hẹn 1 phút trở lên → thanh **nền đỏ** "Trễ N phút" (không còn nền xanh).

## Vá vòng 2 (2026-10-03)

| Anh báo | Kết quả soi | Sửa |
|---|---|---|
| Phải F5 mới thấy đặt bàn trễ chuyển đỏ | Đồng hồ trang chạy đúng (15:04 → 15:05 không cần F5). Tua nhanh đồng hồ 50 phút trên Timeline mẫu: thanh tự chuyển **"Trễ 5p" nền đỏ**, không F5. Lần anh thấy là lúc tab còn chạy code cũ (bản vá "quá giờ là đỏ" chưa nạp vào tab đang mở — dev server lúc đó nạp nóng lỗi) | Không cần sửa logic. Dữ liệu mẫu ở `/mevo/ui-kit` giờ đứng yên theo giờ mở trang để thử được đúng cảnh này |
| Nút "+30 phút" rớt xuống dòng | 3 nút cỡ thường không vừa cột 400px | Nút hoãn nhắc nhỏ lại, luôn **một dòng** (thẻ Việc cần xử lý + panel Tiếp nhận khách), đã kiểm ở 1366px và 390px |

6c. Mở /admin/pos (F5 một lần sau khi em sửa), để tab mở qua giờ hẹn của một đặt bàn → trong ≤ 30 giây thanh tự chuyển nền đỏ "Trễ 1p", KHÔNG cần F5.
6d. Thẻ đặt bàn trễ trong Việc cần xử lý: "Hoãn nhắc · +10 phút · +15 phút · +30 phút" nằm trên **một dòng**.

**→ Báo:** `POS-4 PASS` hoặc số bài FAIL kèm ảnh. POS-4 PASS xong em xoá `/admin/cashier` + các file thừa (bước cuối Pha 3).
