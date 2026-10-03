# POS-3 — Bill dạng tab (P01) + Thanh toán & đóng mâm một nút (P04)

Nhánh `feat/pos-timeline`, trang `/admin/pos`. Bill mới nằm ở `app/admin/pos/bill-panel.tsx`; bill của `/admin/cashier`
không đổi. Không đổi API / RPC / database: thu tiền = `close_table_session` / gộp bill như cũ (tiền mặt hoặc chuyển khoản),
tặng / bỏ / khôi phục / gọi thêm món tay / in = đúng hàm cũ. Tổng tiền luôn là số server trả, bill không tự cộng.

## Đã làm

| Chỗ | Nội dung |
|---|---|
| Đầu bill | Tên bàn / "Mâm N · Bàn 9, Bàn 10", giờ mở, ai mở; nút X (≥1280px đưa về Việc cần xử lý) |
| Hai ô số | **Đã duyệt** · **Chờ duyệt · N lượt** (vàng khi có) |
| Tab **Hoá đơn** | Món theo từng lượt ("Lượt 1 · 12:32", "Ghi tay", "Món đặt trước"), Tặng / Bỏ / Khôi phục, lý do tặng/bỏ hiện dưới món; dải "Có N lượt chờ duyệt · Duyệt ngay →"; nút **Gọi thêm món** (ghi tay, không báo bếp); **Thao tác khác** (thêm bàn, nhập mâm, nhả quyền gọi món, **Bỏ bàn**) |
| Tab **Lượt gọi mới** | Thẻ từng lượt chờ duyệt: Duyệt & in bếp / Từ chối |
| Tab **Lịch sử in** | Lượt đã duyệt + giờ duyệt/in, nút **In lại** từng lượt |
| Chân bill | Tạm tính · **In tạm tính** · **Thanh toán** — khoá kèm lý do khi còn lượt chờ duyệt |
| Màn **Thanh toán & đóng mâm** | Cần thu (to), danh sách món đã dùng (mở ra để tặng / bỏ), chọn **Tiền mặt / Chuyển khoản**. Tiền mặt: ô tiền khách đưa (gõ `1.200.000`, `1200000` hay `1200k` đều được) + gợi ý (Vừa đủ, làm tròn 50k / 100k / 500k / 1 triệu) + **tiền thối**; đưa thiếu → báo đỏ "còn thiếu" và khoá nút. Chuyển khoản: nhắc nghe loa báo đủ tiền. Nút **Xác nhận đã nhận N đ**; nút ← quay lại bill; In hoá đơn |

Tiền khách đưa / tiền thối CHỈ để thu ngân đếm tiền, không lưu, không gửi lên server.
Xem trước: `/mevo/ui-kit` mục **Bill POS** (2 bill mẫu: có lượt chờ duyệt / không; bấm Thanh toán ở bill bên phải).

## Test (chủ quán Bảo Lương)

1. Mở bill một bàn có món đã duyệt → tab Hoá đơn hiện đúng "Lượt 1 · giờ", tổng mỗi lượt, Tạm tính đúng như POS cũ.
2. Khách gọi thêm (chưa duyệt) → ô **Chờ duyệt · 1 lượt** vàng, dải "Duyệt ngay →", nút **Thanh toán khoá** + dòng lý do.
3. Tab **Lượt gọi mới** → Duyệt & in bếp: in 2 liên, lượt chuyển sang Hoá đơn ("Lượt 2"), nút Thanh toán mở khoá.
4. Tab **Lịch sử in** → mỗi lượt đã duyệt có giờ + **In lại** mở đúng phiếu của lượt đó.
5. Tặng một món (nhập lý do) → món "Tặng · 0đ" + "Lý do: …", Tạm tính giảm; **Khôi phục** → về như cũ.
6. **Gọi thêm món** → sheet ghi tay như cũ; lưu xong hiện nhóm "Ghi tay" trong Hoá đơn, không in bếp.
7. **Thanh toán** → màn thu tiền: Cần thu = Tạm tính. Bấm gợi ý **1.000.000đ** cho bill 880.000đ → "Tiền thối lại 120.000đ".
8. Gõ `500k` cho bill lớn hơn → đỏ "Khách đưa còn thiếu …", nút xác nhận bị khoá. Xoá trống ô → nút mở lại.
9. **Xác nhận đã nhận** (Tiền mặt) → bàn đóng, biến khỏi Timeline; Doanh thu / Đơn hàng ghi đúng như thu ở POS cũ.
10. Làm lại với **Chuyển khoản** → đóng bàn, ghi đúng là chuyển khoản.
11. Gộp bill 2 mâm (Ctrl + bấm 2 thanh trên Timeline) → "Gộp bill 2 mâm", Thanh toán đóng cả hai.
12. Nút ← trên màn thanh toán quay lại bill; chọn bàn khác → bill mới mở ở tab Hoá đơn (không kẹt ở màn thanh toán).
13. Thao tác khác → **Bỏ bàn (không thu tiền)** vẫn hỏi xác nhận như cũ.
14. Màn < 1280px: bill là sheet đáy, nút thu tiền luôn nhìn thấy ở chân.

## Vá vòng 1 (2026-10-03) — bài 4, 7–8, 11 FAIL; các bài khác PASS

| Lỗi | Nguyên nhân | Sửa |
|---|---|---|
| Tab Lịch sử in luôn 0 | Hàm đọc danh sách bàn không trả giờ duyệt của lượt, bill lọc theo trường đó nên ra rỗng | Lọc theo trạng thái: lượt khách / nhân viên gọi đã qua bước duyệt = đã in. Dòng ghi "gọi lúc hh:mm · N món" + In lại. Không sửa server |
| Ô tiền khách đưa không có dấu chấm | — | Gõ tới đâu tự chèn dấu chấm ngăn nghìn / triệu (`1250000` → `1.250.000`, `500k` → `500.000`) |
| Gộp bill bằng Ctrl khó, mâm bấm đầu bị rơi | Ctrl + bấm chỉ cộng mâm thứ hai, không tính mâm đang mở bill | Mâm đang mở bill tự thành mâm đầu tiên của nhóm gộp. Thêm nút **Gộp bill** trên thanh trên: bật lên là bấm thanh / ô bàn để thêm-bớt, không cần Ctrl (dùng được trên máy cảm ứng); dải cam "Gộp bill: … · đã chọn N" + Chọn tất cả / Thoát gộp bill |
| Không thấy mâm nào đã chọn | Timeline chỉ tô mâm đang mở bill | Mâm đã chọn gộp có **viền + dấu tích** trên Timeline, dòng tô nền ở Danh sách, ô bàn như cũ ở Sơ đồ bàn |

4b. Bàn đã gọi + duyệt 4 lượt → tab **Lịch sử in (4)**: đủ 4 dòng, mới nhất trên cùng, mỗi dòng **In lại** đúng lượt đó.
8b. Ô tiền khách đưa: gõ `1250000` → hiện `1.250.000`; xoá bớt số vẫn đúng dấu chấm; tiền thối tính đúng.
11b. Bấm thanh Bàn A (mở bill) → bấm **Gộp bill** → bấm thanh Bàn B → bill "Gộp bill 2 mâm" gồm cả A và B, **cả hai thanh có viền + dấu tích**. Bấm lại B → bỏ B. **Thoát gộp bill** → hết viền.
11c. Cách cũ: bấm A rồi Ctrl + bấm B → gộp ngay cả hai, không phải bấm lại A.

**→ Báo:** `POS-3 PASS` hoặc số bài FAIL kèm ảnh.
