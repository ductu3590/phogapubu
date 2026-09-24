# Review thiết kế POS Timeline — 2026-09-20

Trạng thái: chờ anh Tú PASS. Đây là review nghiên cứu/prompt, không phải nghiệm thu code hoặc Sprint BL-2A.

## Test 1 — Nguồn và hướng thiết kế

1. Mở `docs/design/stitch-pos-2026-09-20/timeline.png` và `reservations.png`; đúng hai màn Stitch yêu cầu.
2. Kiểm tra hai file HTML đi kèm có nội dung tương ứng; đây là nguyên mẫu chưa tích hợp backend.
3. Đọc `docs/design/stitch-pos-2026-09-20/RESEARCH.md`: đồng ý hướng timeline trung tâm + panel thao tác theo bàn/mâm, phân biệt booking/phiên/lượt món.

PASS nếu nguồn đúng và hướng này phù hợp cách chủ quán vận hành. Không cần chạy ứng dụng cho Test 1.

## Test 2 — Prompt và phạm vi

1. Đọc `docs/design/stitch-pos-2026-09-20/STITCH-PROMPT.md`.
2. Có đủ đặt bàn → xếp bàn → nhận khách → gọi món → duyệt/in → thanh toán trong một trang.
3. Mâm nhiều bàn chung một bill; món đã phục vụ thêm tay không gửi bếp; không tự trả bàn/hủy booking/nhận tiền.
4. Đồng ý phạm vi đích có preorder/in audit sau BL-2C/BL-3; cọc, dọn bàn, tách bill không mặc định thuộc phiên bản đầu.
5. Backend phiên khác tiếp tục kế hoạch riêng, không coi review này là PASS cho Sprint đang xây.

PASS nếu prompt dùng được để yêu cầu Stitch tạo thiết kế. Review ảnh thiết kế mới thực hiện sau khi Stitch sinh kết quả, không được coi là đã kiểm thử ở task này.

Phản hồi: “POS Timeline — Test 1, 2 PASS” hoặc chỉ rõ điểm cần đổi.
