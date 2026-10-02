> **Lịch sử kiểm tra 01/10; prototype đã ngừng dùng ngày 02/10.** D01/D02 nay đã chốt, thiết kế hiện hành là [design.md](design.md); kết quả dưới đây không chứng minh màn Stitch mới được duyệt.

# Kiểm tra hồ sơ review — 01/10/2026

**Đây là kiểm tra tài liệu/prototype, không nghiệm thu sản phẩm.**

- Đã chạy typecheck ở core `c26838f` và Bảo Lương `b68ff0d`: exit1, lỗi4/3 diagnostics ghi trong AUDIT. Chưa sửa các lỗi; task T01 bắt buộc xử lý trước UI rollout.
- `node --check` JavaScript trong REVIEW.html: exit0. Kiểm các liên kết nội bộ trong hồ sơ mới: không có link hỏng. Matrix có đủ9 UI và3 TD. `git diff --check`: exit0 (Git có thông báo LF→CRLF cho TESTING.md).
- Browser localhost `127.0.0.1:8765/REVIEW.html`: mở và kiểm POS, Mini, Staff, Admin; ở các viewport1366×768,1440×900,1024×768,390×844,360×800. Kiểm DOM/layout cơ bản, chưa chứng minh responsive/a11y sản phẩm hoặc SDK Zalo trên thiết bị thật.
- Đã click kịch bản: duyệt710k → nhận khách → duyệtQR100k=810k → duyệtstaff50k=860k → thêmkhăn20k → tặngrau50k=830k → previewbill830k → cash900k/thừa70k → đóng mô phỏng. Context/tổng hội tụ Timeline/panel. Chuyển khu qua nút chạm09→Ngoài trời và Hủy trả draft; chưa kiểm drag thật bằng touch.
- Đã chỉnh booking tiếp sang22:00 để không chồng khoảng kế hoạch18:30–21:30, hold từ21:00. Ticks/block/vạch giờ dùng chung hàm timeX. Ảnh review có nhãn DRAFT/dữ liệu giả; không dùng làm bằng chứng in/thu tiền thật.
- Ảnh cục bộ: `review-pos-1366.jpg`, `review-mini-390.jpg`, `review-staff-1024.jpg`. Wireframe HTML mới là artifact chính; ảnh là trạng thái cụ thể, không mọi nhánh/viewport. Local server chỉ phục vụ tài liệu, bind loopback; HTML cũng mở trực tiếp được nếu server dừng.
- Không có MCP Stitch, web không đọc được project: dùng đúng2 export cục bộ,3screen chưa lấy. Không đo latency deployment hoặc máy in thật, không điền p50/p95 giả. Không thay code sản phẩm/migration/config live/Word/sourceStitch. Không commit trước anh Tú PASS.

Giới hạn prototype: booking/options/reject và giỏ tự chọn minh họa interaction; không mọi nút là workflow lưu thật. Orderfixture đã duyệt và giỏ nháp tách rõ để không cộng sai. Role/tenant/idempotency/lock/print/audit/persistence là tiêu chí sản phẩm trong plan/testfiles, không được chứng minh bằng mock này. Tại thời điểm kiểm 01/10, D01/D02 chưa chốt; quyết định 02/10 đã thay đề xuất này.
