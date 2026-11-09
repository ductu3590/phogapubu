# Test đổi mọi nơi gọi in qua printDocument (Đợt 1, mục C Part 2, Task 11)

Cần máy in thật và phần mềm in ở quầy: thử ở CẢ HAI chế độ (`browser` và `agent`) trên Bảo Lương. Dựng đơn bằng Khách lẻ / đơn khách gọi, dọn bằng Bỏ bàn.

1. Chế độ `browser`: bấm **Duyệt và in bếp** một đơn mới: ra đúng một phiếu bếp + một phiếu bàn (như trước).
2. Chế độ `agent`: bấm **Duyệt và in bếp**: phần mềm in ra một phiếu bếp + một phiếu bàn, KHÔNG có phiếu bếp thứ hai (khoá chống trùng khớp với đường tự in).
3. Chế độ `agent`, đơn đã duyệt rồi bấm duyệt lại ở máy khác: hiện "Đơn này đã được xác nhận trước đó.", không in thêm.
4. Nút **In lại** ở lượt: in lại đủ phiếu (chế độ `agent` có chữ IN LẠI).
5. In tạm tính ở POS, `/staff/tables`, ngăn kéo A04 (In lại hoá đơn), nút in lại ở dòng bảng A04, **In báo cáo cuối ngày**: ra tờ in ở cả hai chế độ.
6. Chế độ `agent`, tắt phần mềm in rồi bấm in: báo lỗi hoặc hàng đợi giữ việc, không im lặng. Duyệt đơn lúc đó: đơn vẫn vào bếp, hiện "Đơn đã duyệt nhưng chưa tạo được phiếu in: … Bấm In lại ở lượt này."
7. Phiếu đặt trước (nút In ở danh sách đặt trước): in qua cùng đường, lỗi (nếu có) hiện ở thanh báo POS.

8. Chuyển một danh mục sang trạm khác SAU khi đơn đã tự in, rồi bấm **Duyệt & in bếp**: in thêm một phiếu ở trạm mới (đã biết, chấp nhận được).

Chưa làm (cổng máy thật): `docs/testing/dot1/C-0-may-in-that.md` chưa có dòng `KẾT QUẢ: PASS`, nên `pageSizeMode` trong `print-agent/agent.config.example.json` chưa đổi.

## Băng đỏ và phiếu lỗi trên POS (Task 12)

Cần phần mềm in thật ở chế độ `agent`.

9. Tắt phần mềm in, chờ khoảng 30 giây: POS hiện băng đỏ "Máy in chưa kết nối". Bật lại: băng tự gỡ trong vài giây.
10. Rút giấy / tắt máy in rồi in một phiếu để nó lỗi: băng hiện tên phiếu, lý do, hai nút. **In lại** tạo phiếu mới (có chữ IN LẠI), băng gỡ khi in xong.
11. Bấm **In bằng trình duyệt** trên phiếu lỗi: tờ in ra bằng trình duyệt, băng gỡ. Phiếu bếp lỗi in bằng trình duyệt ra cả hai liên với mọi món của đơn (đã biết, chấp nhận được).
12. Phiếu quá 30 phút chưa in (hết hạn): hiện như phiếu lỗi, In lại được.
13. Phiếu **In thử** lỗi: chỉ có nút In lại, không có nút In bằng trình duyệt.
14. Chế độ `browser`: không có băng nào. Chuyển từ `agent` về `browser` khi còn phiếu đang xếp hàng: phần mềm in cũ không in các phiếu đó nữa.
