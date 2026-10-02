> **SUPERSEDED ngày 02/10/2026 — bản lịch sử, không phải checklist hiện hành.** D01/D02 đã chốt; dùng [Test A1–A3](DESIGN-REVIEW-2026-10-02.md) và Task B1–B6. Nội dung đề xuất cũ dưới đây không còn hiệu lực.

# Sprint R7 — Nghiệm thu cải tổ UI

**PLANNED — chưa triển khai sản phẩm.** Đọc spec và implementation plan trước khi test.

## Test R7-1 — T17 / đủ UI-01…09 và TD-01…03

Ghi core/instance SHA, Vercel deployment URL+SHA, Zalo Testing version, migrations, thiết bị/mạng/thời gian GMT+7. Release gate checkout sạch, đồng bộ watcher core đúng version; typecheck/test/build sạch trước Testing. Kịch bản An: preorder710k → arrival09+10 → QR100k/staff50k → duyệt860k → khăn20k → tặng rau50k →830k → in → cash900k/thừa70k → đóng; booking Lan22:00 vẫn còn. Thêm drag/touch/all areas/colors/scroll/contact/role/tenant/Pubu và 5 viewport/safe area/keyboard/offline/races. Đo UI-09 baseline/sau 30 mẫu/profile. Runbook/rollback server switches giữ dữ liệu cũ. Testing PASS không tự Publish; BL-4 Test5B vẫn gate riêng.

Sau mỗi task: cập nhật kết quả và đọc file này, báo đúng nhóm Test; dừng chờ anh Tú PASS, rồi commit task và báo checkpoint. Không tự chuyển task.
