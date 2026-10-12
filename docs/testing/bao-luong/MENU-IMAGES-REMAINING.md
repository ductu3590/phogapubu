# Bảo Lương — Ảnh menu còn lại, dừng theo yêu cầu

Ngày 2026-10-05. Trạng thái: chờ Test 1.

Anh Tú yêu cầu gán các ảnh đã có rồi dừng vì hết token tuần. Không tạo thêm ảnh và không tự tiếp tục phần còn thiếu.

## Dữ liệu và bằng chứng

- Chỉ cập nhật `menu_items.image_url` của Bảo Lương; kiểm tra ID món, store, category và ảnh cũ NULL trước khi gán.
- Các cặp cơm/mì to và nhỏ dùng chung ảnh đúng món; giữ tên và giá.
- Ảnh AI minh họa được lưu WebP trong `assets/menu/bao-luong/remaining-2026-10-05/`.
- `before.json`: dữ liệu trước thay đổi; `manifest.json`: từng bản ghi đã cập nhật và URL; `verification.json`: số lượng thực tế và danh sách chưa có ảnh.
- Mỗi URL được tải lại, kiểm HTTP 200 và đối chiếu byte với file local trước khi gán vào menu.
- Nguyên liệu anh Tú đã xác nhận cho lần làm sau: tù và là bao tử ếch, nấm biển là diềm mực; chấn thủy dùng thịt lợn.

## Test 1 — Ảnh đã gán

1. Mở lại Mini App/Admin Bảo Lương, rà các nhóm món có ảnh mới theo `manifest.json`.
2. Kiểm tra ảnh khớp tên món, rõ và không vỡ; đối chiếu cách trình bày với món quán phục vụ.
3. Kiểm tra các cặp cơm/mì to–nhỏ có cùng ảnh món nhưng đúng giá riêng.
4. Các món trong `verification.json` → `remaining` được để trống có chủ đích khi dừng.

Chờ anh Tú xác nhận PASS; chưa commit, chưa nghiệm thu trực tiếp trên Zalo. Không tự khởi động lại tác vụ tạo ảnh.
