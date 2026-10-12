# Bảo Lương — Ảnh Món ngon tuần này

Ngày: 2026-10-05. Trạng thái: chờ anh Tú nghiệm thu.

## Phạm vi

Tạo và gán 5 ảnh AI minh họa vào `menu_items.image_url` trên Supabase MEVO, chỉ nhóm Món ngon tuần này của Bia lẩu Bảo Lương. Không đổi tên, giá, mô tả hoặc các nhóm khác.

| Món | Giá giữ nguyên |
| --- | ---: |
| Chân gà nướng tê cay | 139.000đ |
| Ếch xào măng cay | 135.000đ |
| Ếch xào lá lốt | 135.000đ |
| Mề ngan xúc phồng tôm | 89.000đ |
| Rau sống - tóp mỡ - cà chua | 150.000đ |

## Đã kiểm tra tự động

- 5 ảnh WebP 1024×1024, khoảng 236–287 KB/ảnh; lưu tại `assets/menu/bao-luong/weekly-2026-10-05/`.
- Upload thành công vào bucket `menu-images`; cả 5 URL công khai trả HTTP 200, nội dung tải về khớp file gốc WebP.
- Cập nhật nguyên tử đúng 5 bản ghi theo ID món + store + category, yêu cầu ảnh trước đó NULL.
- Đọc lại DB xác nhận đủ 5 URL tương ứng và giá giữ nguyên.
- Bản ghi URL, ID, kích thước và trạng thái cũ trong `manifest.json`; truy vấn đã chạy trong `assign.sql` cùng thư mục ảnh.
- Chưa kiểm tra trực tiếp trên Zalo Mini App/POS; ảnh minh họa cần chủ quán đối chiếu cách chế biến/trình bày thật, nhất là món Rau sống - tóp mỡ - cà chua (mô tả DB: Bát nền).

## Test 1 — Ảnh menu và độ đúng món

1. Mở lại Mini App Bảo Lương, vào nhóm **Món ngon tuần này**.
2. Kiểm tra cả 5 món có ảnh, đúng tên tương ứng; không ảnh vỡ, không bị cắt mất phần chính.
3. Mở chi tiết từng món: ảnh rõ; tên và giá khớp bảng trên.
4. Mở menu trên Admin/POS Bảo Lương: kiểm tra các vị trí hiển thị ảnh món tải đúng.
5. Đối chiếu ảnh với món quán phục vụ, đặc biệt hai món ếch và Rau sống - tóp mỡ - cà chua. Ghi tên món cần chỉnh nếu chưa sát thực tế.

Anh Tú xác nhận **PASS Test 1** hoặc nêu món/lỗi cần sửa. Dừng tại nhóm này, chờ PASS trước khi commit và làm nhóm tiếp theo theo AGENTS.md.
