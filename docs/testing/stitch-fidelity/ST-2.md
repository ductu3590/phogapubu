# ST-2 — Cột phải POS theo Stitch (bill P01 · lượt gọi P03 · thanh toán P04 · hàng đợi P05)

Nhánh `feat/pos-timeline`. Chỉ đổi giao diện; mọi thao tác (duyệt, từ chối, tặng / bỏ / khôi phục, ghi tay, in, thu tiền,
gộp bill, đặt bàn) gọi lại đúng hàm cũ. Tổng tiền vẫn là số server trả.

## Đã làm

| Chỗ | Sau ST-2 |
|---|---|
| Đầu bill | **Nền xanh than**, ô icon cam (mâm = icon mắt xích), tên bàn / mâm + nhãn tô đặc ngắn (ĐANG ĂN / CHỜ DUYỆT / QUÁ HẠN), dòng phụ giờ mở. Ngay trong đầu bill có **2 ô tiền**: Hoá đơn đã duyệt · Chờ duyệt mới (vàng khi có) — như P03 |
| Tab | Hoá đơn (N món) · Lượt gọi mới (**số đỏ**) · Lịch sử in — gạch chân cam |
| Tab Hoá đơn | Dải vàng "Có N lượt món đang chờ duyệt! Tổng chờ …" + nút vàng **Duyệt ngay →**; bảng **TÊN MÓN · SL · THÀNH TIỀN**, mỗi lượt một dòng nhỏ "Lượt #01 · 19:59 · tiền"; món tặng nền vàng nhạt "Đã tặng · 0đ", món bỏ gạch đỏ "Khách bỏ" + lý do; **menu ⋮** ở cuối dòng: Tặng món / Bỏ món / Khôi phục |
| Tab Lượt gọi mới | Thẻ như P03: dải nguồn **QR KHÁCH TẠI BÀN** (cam) / **NV ĐẶT HỘ** (xanh dương) + "Lượt #02" + giờ; số lượng cam "4x"; **Duyệt & in bếp** cam + **Từ chối lượt** đỏ nhạt |
| Tab Lịch sử in | Mỗi lượt một thẻ có icon in xanh + **In lại** |
| Chân bill | **Gọi thêm món** (ghi tay) · **In tạm tính**; dưới là **Thanh toán · tổng** cam đặc, hoặc **KHOÁ THANH TOÁN (CÒN N LƯỢT CHỜ DUYỆT)** đỏ nhạt khi còn lượt chờ |
| Màn Thanh toán (P04) | Đầu tối: ← · "Thanh toán / Đóng mâm · …" · **CẦN THU** số cam to. Khối "Món đã dùng & điều chỉnh" (cùng bảng + menu ⋮), khối cam **TỔNG THANH TOÁN**, "Phương thức thu tiền thực tế" 2 ô chọn Tiền mặt / Chuyển khoản, tiền khách đưa + gợi ý nhanh + tiền thối xanh; nút cam **Xác nhận đã nhận N đ** + In tạm tính / hoá đơn |
| Việc cần xử lý (P05) | Đầu "**Hàng đợi việc cần xử lý**" cam + số đỏ, gạch chân cam. Thẻ **viền theo mức độ** (đỏ / vàng / cam / xanh). Gọi nhân viên: ô vàng "Bàn gọi nhân viên · N lần" + **Mở bill** · **Đã xử lý xong** (xanh lá). Lượt món: nhãn nguồn + số lượng cam + **Duyệt & in bếp** · **Từ chối** + "Mở bill bàn này" |
| Tiếp nhận khách đặt bàn | Đầu nền tối cùng kiểu bill |

Xem trước: `/mevo/ui-kit` mục **Bill POS**, **Việc cần xử lý (POS)**, **Tiếp nhận khách đặt bàn (POS)**.

## Test (chủ quán Bảo Lương, nhớ khởi động lại dev server)

1. Bấm thanh một bàn đang ăn → đầu bill tối, nhãn **ĐANG ĂN** xanh, 2 ô tiền đúng (đã duyệt / chờ duyệt).
2. Khách gọi thêm → ô "Chờ duyệt mới" vàng, tab **Lượt gọi mới** có số đỏ, dải vàng **Duyệt ngay →** ở tab Hoá đơn; nút dưới thành **KHOÁ THANH TOÁN (CÒN 1 LƯỢT…)**.
3. Tab Lượt gọi mới: thẻ có nhãn **QR KHÁCH TẠI BÀN** (hoặc **NV ĐẶT HỘ** nếu nhân viên đặt), Duyệt & in bếp → in 2 liên, thẻ biến mất, nút thanh toán mở.
4. Tab Hoá đơn: bảng món có thành tiền; bấm **⋮** → Tặng món (nhập lý do) → dòng vàng "Đã tặng · 0đ"; ⋮ → Khôi phục. Bỏ món → gạch đỏ "Khách bỏ".
5. **Gọi thêm món** ở chân → sheet ghi tay như cũ; **In tạm tính** mở phiếu.
6. **Thanh toán** → màn P04: CẦN THU đúng; chọn Tiền mặt, bấm gợi ý → tiền thối; **Xác nhận đã nhận** → bàn đóng, đơn Hoàn tất.
7. Việc cần xử lý: khách bấm Gọi nhân viên → thẻ viền vàng, **Đã xử lý xong** (xanh) gỡ thẻ; **Mở bill** mở đúng bàn.
8. Thẻ lượt món trong Việc cần xử lý: nhãn nguồn, Duyệt & in bếp / Từ chối chạy như cũ.
9. Bấm thanh đặt bàn → panel Tiếp nhận khách đầu nền tối, các nút như ST-1.
10. Màn < 1280px: bill / thanh toán là sheet đáy, nút chân luôn thấy.

## Vá vòng 1 (2026-10-03)

| Anh báo | Sửa |
|---|---|
| Món bỏ ghi "Khách bỏ" | Nhãn đỏ **"Lý do"** + nội dung lý do (không nhập lý do thì "Đã bỏ"); tên món vẫn gạch đỏ |
| Món tặng ghi "Đã tặng · 0đ" | Chỉ **"Đã tặng"** (0đ đã có ở cột Thành tiền) + lý do |
| Gọi thêm món (ghi tay) xong bàn vẫn "Chờ duyệt" mà không có nút duyệt | Món ghi tay POS và món đặt trước **không còn tính là chờ duyệt** (nhãn đầu bill, thanh Timeline, ô Sơ đồ bàn, màn nhân viên) và **không kêu chuông** — ghi tay là thu ngân tự thêm = duyệt sẵn |
| "Lịch sử in" → "Lịch sử", đủ mọi lượt + ai gọi + nút in nhỏ | Tab **Lịch sử**: mọi lượt của bàn (mới nhất trên), nhãn **QR** (cam) / **Nhân viên** (xanh) / **POS** (xám đậm) / **Đặt trước** (tím); lượt chờ duyệt viền vàng "chờ duyệt", lượt từ chối mờ; mỗi lượt đã duyệt có **icon in** nhỏ để in lại |
| Đơn đặt trước: mở bàn không in được, đóng bàn rồi lại hiện mà in không được | (a) **Mig 086** (đã áp prod): hàng chờ "Món đặt trước cần xử lý" bỏ đơn đã Hoàn tất → đơn "Test" Bàn 4 (và mọi đơn đặt trước của bàn đã thu tiền) **đã biến mất**; không xoá dữ liệu (còn trong doanh thu). (b) Khách đến, mở bàn → trong bill, dòng "Món đặt trước" có nút in ngay: **Duyệt & in 2 liên** / **In 2 liên** / **In lại**; tab Lịch sử cũng có |

11. Bỏ một món có lý do → dòng gạch đỏ + nhãn đỏ **Lý do** + lý do; tặng một món → nhãn vàng **Đã tặng**, cột Thành tiền 0đ.
12. Bấm **Gọi thêm món** ghi tay 1 món → đầu bill vẫn **ĐANG ĂN** (không CHỜ DUYỆT), thanh Timeline vẫn xanh lá, không kêu chuông, Thanh toán không bị khoá.
13. Tab **Lịch sử**: thấy đủ các lượt QR / Nhân viên / POS / Đặt trước với giờ; bấm icon in → in lại đúng lượt.
14. Đặt bàn có món đặt trước → Khách đã đến · mở mâm → bill có dòng "Món đặt trước" kèm nút **Duyệt & in 2 liên** → in được; thu tiền xong → khối "Món đặt trước cần xử lý" không còn đơn này.

**→ Báo:** `ST-2 PASS` hoặc số bài FAIL kèm ảnh.
