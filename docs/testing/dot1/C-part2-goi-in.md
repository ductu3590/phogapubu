# Test đổi mọi nơi gọi in qua printDocument (Đợt 1, mục C Part 2, Task 11)

Cần máy in thật và phần mềm in ở quầy: thử ở CẢ HAI chế độ (`browser` và `agent`) trên Bảo Lương. Dựng đơn bằng Khách lẻ / đơn khách gọi, dọn bằng Bỏ bàn.

1. Chế độ `browser`: bấm **Duyệt và in bếp** một đơn mới: ra đúng một phiếu bếp + một phiếu bàn (như trước).
2. Chế độ `agent`: bấm **Duyệt và in bếp**: phần mềm in ra một phiếu bếp + một phiếu bàn, KHÔNG có phiếu bếp thứ hai (khoá chống trùng khớp với đường tự in).
3. Chế độ `agent`, đơn đã duyệt rồi bấm duyệt lại ở máy khác: hiện "Đơn này đã được xác nhận trước đó.", không in thêm.
4. Nút **In lại** ở lượt: in lại đủ phiếu (chế độ `agent` có chữ IN LẠI).
5. In tạm tính ở POS, `/staff/tables`, ngăn kéo A04 (In lại hoá đơn), nút in lại ở dòng bảng A04, **In báo cáo cuối ngày**: ra tờ in ở cả hai chế độ.
6. Chế độ `agent`, tắt phần mềm in rồi bấm in: báo lỗi hoặc hàng đợi giữ việc, không im lặng. Duyệt đơn lúc đó: đơn vẫn vào bếp, hiện "Đơn đã duyệt nhưng chưa tạo được phiếu in: … Bấm In lại ở lượt này."
7. Phiếu đặt trước (nút In ở danh sách đặt trước): in qua cùng đường, lỗi (nếu có) hiện ở thanh báo POS.

Chưa làm (cổng máy thật): `docs/testing/dot1/C-0-may-in-that.md` chưa có dòng `KẾT QUẢ: PASS`, nên `pageSizeMode` trong `print-agent/agent.config.example.json` chưa đổi.
