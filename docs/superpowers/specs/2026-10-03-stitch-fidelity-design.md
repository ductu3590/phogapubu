# Pha 4 — Admin-web giống bản Stitch (màu + khung)

Ngày 2026-10-03 · Nhánh `feat/pos-timeline` (nối tiếp Pha 3, commit e5c47ff) · Anh Tú duyệt hướng 2026-10-03.

## Vì sao

Pha 3 dựng đúng bố cục POS nhưng màu "ít" so với bản Stitch đã duyệt (thanh nền nhạt, sidebar trắng). Anh Tú muốn
**giống bản Stitch**, kể cả cấu trúc admin-web và sidebar.

## Quyết định (THAY 2 quyết định 2026-10-02)

1. **Màu trạng thái đúng như Stitch, tô đặc chữ trắng**: xanh lá (emerald-600) = đang phục vụ · **cam (orange-600) = đã
   đặt** · vàng (amber-500) = chờ duyệt / chờ cọc · đỏ (red-600) = trễ / xung đột · xám = trống. Bỏ quy ước "cam chỉ cho nút".
   Nút chính vẫn cam đậm (orange-700) nên phân biệt bằng hình dạng: thanh/nhãn trạng thái không có viền nút, luôn có chữ.
2. **Khung chủ quán = thanh icon hẹp + hộp thoại** như P01 / A01–A05: trái là rail icon (POS · Đặt bàn · Bếp · Thực đơn ·
   Đơn hàng · Báo cáo · Cài đặt). Cấu hình (A01 Cấu hình & In ấn, A02 Thực đơn & Giá, A03 Sơ đồ bàn & QR, A04 Hoá đơn &
   Báo cáo ca, A05 Tài khoản & Phân quyền) mở thành **hộp thoại có tab đè lên POS**. Bỏ "trang riêng có sidebar".
3. **/mevo (superadmin)** = sidebar rộng như A06–A11: khối logo, nhóm mục, mục đang chọn tô cam đặc chữ trắng.

Giữ nguyên: Be Vietnam Pro, Tailwind slate làm nền/viền, lucide, API / RPC / database / logic tiền.

## Sprint (mỗi sprint dừng chờ PASS)

| Sprint | Nội dung |
|---|---|
| **ST-1** | Bảng màu trạng thái đặc (components/ui/status.ts) · POS theo P01: thanh trên (logo, quán, trực tuyến, ngày + ca, Đặt bàn mới), **dải hàng đợi nền xanh than** với nhãn màu, Timeline thanh tô đặc chữ trắng + tiêu đề khu có nền màu + cột bàn có nhãn trạng thái, chân số liệu màu · Sơ đồ bàn cùng bảng màu · **rail icon** cho khu chủ quán (tạm trỏ tới trang hiện có) |
| **ST-2** | Cột phải theo P01/P03/P04/P05: đầu bill nền tối, tab, thẻ lượt món, màn thanh toán, Việc cần xử lý |
| **ST-3** | Hộp thoại quản trị A01–A05 đè lên POS (intercepting routes của Next) — mở thẳng URL vẫn ra trang đầy đủ |
| **ST-4** | /mevo theo A06–A11: sidebar rộng, thẻ thống kê, danh sách quán dạng thẻ |

Màn nhân viên `/staff/*` và Mini App không nằm trong Pha 4.
