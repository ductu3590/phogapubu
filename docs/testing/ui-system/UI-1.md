# UI-1 — Nền móng design system (admin-web)

Nhánh `feat/ui-system`. Chốt hướng: CLAUDE.md dòng 2026-10-02.
Sprint này **chỉ thêm mới**, chưa chuyển màn nào sang hệ mới. Ngoại lệ duy nhất có thể thấy ở mọi
màn: **font đổi từ Arial sang Be Vietnam Pro**. Không đổi API, DB, logic.

Chạy: `cd admin-web && npm run dev`, đăng nhập `admin@mevo.vn` (superadmin), mở
`http://localhost:3000/mevo/ui-kit`.

> ⚠️ Layout `/mevo` hiện tại có sidebar cố định 224px, chưa co giãn trên điện thoại (sẽ thay bằng
> AppShell ở UI-4). Test mobile của trang này nên mở DevTools ở 768px trở lên, hoặc chỉ soi phần
> nội dung.

## Test A — Font và màu

1. Mở bất kỳ màn cũ nào (`/admin/cashier`, `/staff/order`, `/admin/menu`): chữ đã là Be Vietnam Pro,
   dấu tiếng Việt không bị cắt, **bố cục, màu, nút không đổi** so với trước.
2. Trang `/mevo/ui-kit` mục **Màu**: 9 ô màu đúng mã ghi dưới.
3. Mục **Chữ**: dòng "Dấu tiếng Việt chồng…" hiện đủ dấu, không dính dòng trên/dưới.

## Test B — Nút

4. Bấm **Lưu (bấm thử)**: icon thành vòng xoay ~1,5 giây, nút **không đổi bề rộng**, bấm thêm trong lúc
   xoay không có tác dụng.
5. **Nút chỉ chữ đang gửi**: chữ ẩn, vòng xoay nằm giữa, bề rộng giữ nguyên.
6. Hàng nút cỡ touch cao rõ hơn hàng trên (48px). Nút nhãn dài xuống dòng, không tràn khung.

## Test C — Trạng thái & form

7. Chú giải: Đang phục vụ (xanh lá) · Đã đặt (xanh dương) · Chờ duyệt (vàng) · Trễ / xung đột (đỏ) ·
   Trống (xám). **Không có ô cam nào** trong phần trạng thái.
8. Ô **Số điện thoại**: gõ đủ 10 số → viền đỏ và câu lỗi biến mất; xoá bớt → hiện lại. Ô bên dưới
   **không nhảy** khi lỗi hiện/ẩn.
9. Bấm Tab qua các ô: ô đang focus có viền cam + quầng mờ.

## Test D — Tab, lớp nổi, toast

10. Ba hàng tab đổi được bằng chuột và bằng phím mũi tên trái/phải.
11. **Mở hộp xác nhận**: bấm ra ngoài **không** đóng (cố ý cho thao tác tiền); Esc / ✕ / Giữ lại thì đóng.
12. **Mở panel chi tiết**: desktop trượt từ phải, điện thoại (DevTools ≤ 767px) hiện từ dưới lên;
    danh sách dài cuộn bên trong, **nút Thanh toán ở chân luôn thấy**, không đè dòng cuối.
13. Ba nút toast: hiện góc dưới phải (desktop) / giữa dưới (điện thoại), tự tắt; toast lỗi ở lâu hơn.

## Test E — Khung app

14. Ở khổ ≥ 1024px: sidebar trong khung demo có mục **Điều hành** đang sáng (nền cam nhạt + vạch cam bên
    trái) kèm số 3; bấm nút thu gọn → sidebar ẩn, có nút mở lại góc trên trái.
15. Ở khổ < 1024px: khung demo thành thanh trên + nút ☰; bấm mở ngăn kéo menu, Esc hoặc bấm nền tối để đóng.

**→ Báo:** `UI-1 PASS` hoặc số bài FAIL kèm ảnh/mô tả.
