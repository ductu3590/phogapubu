# ST-1 — Màu trạng thái theo Stitch + khung POS P01 + thanh icon

Nhánh `feat/pos-timeline` (sau commit e5c47ff). Spec `docs/superpowers/specs/2026-10-03-stitch-fidelity-design.md`.
Không đổi API / RPC / database / logic tiền. Cột phải (bill, Việc cần xử lý) đổi giao diện ở ST-2.

⚠️ Dev server đang mở từ trước phải **khởi động lại** (`npm run dev`) — màu cam "Đã đặt" là token CSS mới, dev server cũ
không nạp nên nhãn "Đã đặt" sẽ hiện trắng. Bản build production đã kiểm có đủ.

## Đã làm

| Chỗ | Sau ST-1 |
|---|---|
| Màu trạng thái (cả hệ) | Xanh lá = đang phục vụ · **cam = đã đặt** (trước là xanh dương) · vàng = chờ duyệt · đỏ = trễ / xung đột · xám = trống. Thêm kiểu **tô đặc chữ trắng** cho thanh / nhãn |
| Khung khu chủ quán | Sidebar rộng → **thanh icon hẹp** bên trái như P01: logo M · POS · Đặt bàn · Bếp · Món · Đơn · Báo cáo; mục đang mở tô cam đặc. Ô **Thêm** ở chân: Cài đặt quán, Bàn & QR, Nhân viên, Ưu đãi, Vòng quay, Tài khoản, email + Đăng xuất. Màn < 768px: thanh trên + ngăn kéo đủ mọi mục |
| Thanh trên POS | "MEVO POS" + nhãn tên quán, viên **Trực tuyến** (xanh) / Mất kết nối (vàng), ngày + **Ca 08:00–23:00** (cam), nút cam đặc **Đặt bàn mới**, nút đen **Gộp bill** |
| Dải hàng đợi | **Nền xanh than**, "⚡ HÀNG ĐỢI:" vàng; chip viền màu + số tô đặc: Lượt món chờ duyệt (xanh lá) · Gọi nhân viên (xanh dương) · Đặt bàn chờ duyệt (vàng) · Khách trễ / xung đột (đỏ) · Chưa xếp bàn. Chip số 0 thì mờ |
| Đổi cách xem | Timeline / Sơ đồ bàn / Danh sách — mục đang chọn **cam đặc**; khu vực là ô chọn "Tất cả khu vực (20 bàn)" |
| Timeline | Thanh **tô đặc chữ trắng**: đang ăn xanh lá (tên · giờ mở · số đơn · tiền), chờ duyệt vàng có chấm trắng nháy, quá hạn đỏ; mâm có icon mắt xích + vạch màu mâm. Đặt bàn: đã đặt **cam đặc**, chờ duyệt **viền đứt cam + sọc**, trễ **đỏ đặc**, xung đột **viền đỏ đậm nền đỏ nhạt + icon cảnh báo**. Tiêu đề khu có **nền màu** (xanh lá / xanh dương / tím …). Cột bàn có nhãn Đang ăn / Đã đặt / Trống … và dòng phụ (Mở 15:20 / Hẹn 17:40 · 6 khách / Sẵn sàng đón khách). Thước giờ có **ô đỏ giờ hiện tại** |
| Sơ đồ bàn | Ô bàn tô nền nhạt theo trạng thái + nhãn tô đặc; chờ duyệt = viền vàng + chấm nháy ở góc (không nháy cả ô) |
| Chân | "20 tổng bàn · ● N bàn đang ăn (x% lấp đầy) · ● N đã đặt trong ca · ● N bàn trống" có màu |

Xem trước không cần dữ liệu thật: `/mevo/ui-kit` mục **Timeline POS** và **Ô bàn POS**.

## Test (chủ quán Bảo Lương, sau khi khởi động lại dev server)

1. Mở `/admin/pos`: thanh icon bên trái, mục **POS** cam đặc; bấm Đặt bàn / Bếp / Món / Đơn / Báo cáo mở đúng trang, mục đó chuyển cam.
2. Ô **Thêm** → menu nổi có 6 mục + email + Đăng xuất; bấm ra ngoài hoặc Esc thì đóng; Đăng xuất chạy.
3. Điện thoại (< 768px): thanh trên + nút menu mở ngăn kéo đủ mọi mục.
4. Thanh trên POS: tên quán, Trực tuyến xanh, ngày + ca; tắt mạng → chuyển "Mất kết nối" vàng.
5. Dải hàng đợi nền xanh than; khách gọi món → chip "Lượt món chờ duyệt" sáng xanh lá kèm số; gọi NV → chip xanh dương.
6. Timeline: bàn đang ăn = thanh **xanh lá đặc chữ trắng**; có lượt chờ duyệt = **vàng đặc** + chấm nháy; mâm có icon mắt xích.
7. Đặt bàn đã xác nhận = **cam đặc**; chờ duyệt = viền đứt cam có sọc; quá giờ hẹn = **đỏ đặc** "Trễ N phút".
8. Tiêu đề khu "TRONG NHÀ (7 bàn)" / "NGOÀI TRỜI (13 bàn)" có nền màu khác nhau; cột bàn có nhãn trạng thái.
9. Sơ đồ bàn: ô có khách nền xanh lá nhạt + nhãn "Đang phục vụ" xanh đặc; bàn giữ cho đặt trước nhãn cam "Đã đặt".
10. Màn nhân viên `/staff/order`: màu trạng thái bàn cùng bảng mới (đã đặt = cam).
11. Thu tiền / duyệt / gộp bill / đặt bàn vẫn chạy như POS-1..4 (chỉ đổi màu, không đổi thao tác).

## Vá vòng 1 (2026-10-03) — bài 4, 10 FAIL + yêu cầu vạch đỏ; các bài khác PASS

| Anh báo | Nguyên nhân | Sửa |
|---|---|---|
| Tắt mạng vẫn "Trực tuyến" xanh (chỉ có thêm dòng "Không tải được dữ liệu mới nhất") | Chỉ báo chỉ đọc trạng thái kênh realtime — mất mạng kênh chưa kịp báo | "Trực tuyến" chỉ khi **có mạng + kênh realtime đang nối + lần tải gần nhất không lỗi**; mất một trong ba → **đỏ "Mất kết nối"** ngay. Có mạng lại tự về xanh |
| Màn nhân viên không thấy bàn đã đặt | Nhân viên không có quyền đọc đặt bàn (hàm cũ chỉ cho chủ quán) | **Mig 084** (đã áp prod): hàm CHỈ ĐỌC `list_staff_upcoming_reserved_tables` cho nhân viên + chủ quán của đúng quán. Màn nhân viên: bàn có đặt trong 60 phút tới = **ô cam "Đã đặt"** + "Đặt HH:MM"; đặt xa hơn chỉ ghi "Đặt HH:MM" xám. Tự tải lại mỗi phút |
| Bấm bàn đã đặt nên cảnh báo | — | Hộp thoại **"Bàn N đã có khách đặt trước"** (tên · số khách · giờ hẹn): **Chọn bàn khác** / **Vẫn dùng bàn này** (nhắc báo chủ quán). Chọn vẫn dùng → POS **tự hiện "Xung đột"** cho đặt bàn đó (mốc xung đột đổi 30 → 60 phút trước giờ hẹn, khớp khung giữ bàn của server) |
| Vạch đỏ nên ở ~1/4 khung | — | Mở trang / bấm "Về bây giờ" → vạch đỏ ở **1/4 khung nhìn**; thước luôn chừa ≥ 4 giờ phía trước nên cuối ca vẫn giữ được 1/4. Nhãn "Ca 08:00–23:00" đọc thẳng giờ phục vụ; nút "+ Đặt lúc" không gợi ý giờ từ lúc đóng ca trở đi |

4b. Tắt mạng (Wi-Fi hoặc DevTools → Offline) → trong ~1 giây viên trên thanh trên chuyển **đỏ "Mất kết nối — đang thử lại"**; bật lại → về **xanh "Trực tuyến"**.
10b. Có đặt bàn đã xác nhận cho Bàn 4 trong vòng 60 phút tới → `/staff/order` Bàn 4 **ô cam "Đã đặt"** + "Đặt HH:MM"; chú giải có "Đã đặt".
10c. Bấm Bàn 4 → hộp thoại cảnh báo; **Chọn bàn khác** → ở lại màn chọn bàn; bấm lại → **Vẫn dùng bàn này** → vào màn đặt món Bàn 4.
10d. Đặt món ở Bàn 4 sau khi chọn "Vẫn dùng" → POS: thanh đặt bàn của Bàn 4 chuyển **viền đỏ "Xung đột"**, Việc cần xử lý có thẻ đỏ xung đột.
12. Mở `/admin/pos` → vạch đỏ ở khoảng 1/4 bề ngang Timeline (cả lúc gần cuối ca); "Về bây giờ" đưa lại đúng chỗ đó.

## Vá vòng 2 (2026-10-03)

| Anh báo | Sửa |
|---|---|
| Vạch đỏ về chỗ anh vẽ (≈ 1/5 khung) | Vạch đứng ở **1/5** bề ngang vùng giờ. Màn rộng (1920px) trước đây hết thước nên vạch dồn ra giữa → thước giờ giờ tự dài theo bề ngang màn hình. Bỏ dòng "08:00 – 05:00" (độ dài thước, dễ hiểu nhầm) |
| Gộp 2 thẻ cùng một khách (Gọi nhắc khách + Đặt bàn) | Một thẻ đặt bàn: nhãn "Còn N phút" + **"Cần gọi nhắc"**, dòng số điện thoại bấm gọi + **Đã gọi** / **Không liên lạc được** ngay trong thẻ. Không thấy đặt bàn tương ứng thì thẻ gọi nhắc vẫn đứng riêng |
| Nút "Xác nhận & in 2 liên" của món đặt trước rớt dòng | Đổi thành **"Duyệt & in 2 liên"** một dòng, rộng hết thẻ |
| Khối "Đã duyệt/in hôm nay" là gì? | Chỉ liệt kê đơn đặt món trước đã duyệt + in trong ngày (tên, bàn, tiền), **không có thao tác nào** → **bỏ**. In lại: nút in mới trong panel Tiếp nhận khách |
| Panel Tiếp nhận khách: thêm in, bỏ ghi chú dài | Cuối danh sách món đặt trước có nút **in**: chưa duyệt → "Duyệt & in 2 liên"; đã in → "In lại phiếu" (hỏi lý do). Bỏ đoạn "Món đặt trước vào bill của bàn khi…" |
| **Quy trình lõi: thu ngân xác nhận đã thu tiền → đơn tự hoàn tất** | **Mig 085** (đã áp prod): thu tiền ở POS (một bàn hoặc gộp bill) → mọi đơn chưa huỷ của bàn chuyển **"Hoàn tất"** + giờ hoàn tất (trước đây đứng mãi ở Đã xác nhận / Đang làm). Bỏ bàn không đổi. Đã chuyển luôn **17 đơn cũ** của Bảo Lương ở các bàn đã thu tiền sang Hoàn tất |

12b. Màn rộng (1920px): mở POS / bấm "Về bây giờ" → vạch đỏ ở khoảng 1/5 bề ngang vùng giờ (chỗ anh vẽ).
13. Đặt bàn có việc gọi nhắc → Việc cần xử lý chỉ còn **một** thẻ; Đã gọi → nhãn "Cần gọi nhắc" mất, thẻ đặt bàn vẫn còn.
14. Món đặt trước cần xử lý: nút **Duyệt & in 2 liên** một dòng; không còn khối "Đã duyệt/in hôm nay".
15. Bấm thanh đặt bàn có món đặt trước → panel có nút in ở cuối danh sách món; bấm → mở tab in phiếu (đã in rồi thì hỏi lý do in lại).
16. Thu tiền một bàn ở POS → `/admin/orders`: mọi đơn của bàn đó **Hoàn tất**; gộp bill 2 mâm → cả hai mâm Hoàn tất.

## Vá vòng 3 (2026-10-03) — bố cục thẻ đặt bàn

Thẻ đặt bàn trong Việc cần xử lý trước đây thò ra thụt vào (nhãn một hàng, khối gọi nhắc lệch, nút lệch). Giờ thẳng một mép:
dòng 1 tên · số khách — giờ hẹn; dòng 2 **bàn + nhãn trạng thái chung một dòng**; khối **Gọi nhắc khách** rộng hết thẻ
(số điện thoại bên phải, hai nút **Đã gọi** / **Không gọi được** chia đôi); hàng nút cuối **nút chính giãn hết chỗ + Chi tiết**;
hoãn nhắc (nếu có) là một hàng 3 nút đều nhau.

17. Thẻ đặt bàn có gọi nhắc / khách trễ / chờ duyệt: các khối cùng mép trái, không nút nào rớt dòng.

**→ Báo:** `ST-1 PASS` hoặc số bài FAIL kèm ảnh.
