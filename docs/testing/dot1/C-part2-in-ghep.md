# Test in hai nơi ghép đủ (Đợt 1, mục C Part 2, Task 13)

Cần hai máy in thật đúng model (Quầy + Bếp) và phần mềm in ở chế độ `agent`. Cổng `C-0-may-in-that.md` chưa có KẾT QUẢ PASS: làm bước C-0 trước hoặc song song, các bài dưới là bài ghép.

1. Đơn món hai trạm: **Duyệt & in bếp** ra 2 phiếu bếp đúng trạm, không giá, và 1 phiếu bàn ở Quầy.
2. Đơn món một trạm ra một phiếu bếp. Danh mục chưa gán ra trạm mặc định.
3. Bấm đúp **Duyệt & in bếp** không in trùng. Nút **In lại** ở lượt in thêm đúng một bộ.
4. Đặt món trước ra đúng trạm theo món trong snapshot.
5. Ra Quầy: **In tạm tính** (có QR nếu quán khai tài khoản và bill chưa còn đơn chờ duyệt), gộp bill, in lại ở A04 (không có QR), phiếu cuối ngày (quán bắt đầu ngày 05:00 có dòng khoảng giờ), **phiếu bàn giao ca** (chỉ ca đã kết; ca đang mở bấm in báo "Ca chưa kết, chưa có phiếu bàn giao" và không ra giấy). `/staff/tables` in bill được; tờ QR bàn vẫn mở trình duyệt.
6. Tắt phần mềm 40 giây: POS hiện băng đỏ. Bật lại: băng tắt, phiếu trong hàng đợi tự in.
7. Rút dây máy in bếp, duyệt đơn: POS hiện job lỗi trong khoảng 1 phút, không có phiếu in muộn khi cắm lại. Bấm **In lại**: phiếu ra đúng một lần.
8. **In bằng trình duyệt** với job lỗi: in được, job biến khỏi POS.
9. Để job chờ quá 30 phút (tắt phần mềm): `expired`, bật lại không tự in, POS có nút In lại.
10. Quán `browser`: mọi thao tác in như hôm nay (kể cả phiếu bàn giao ca), không có băng.
11. Phiếu bàn giao ca qua phần mềm in: so với bản in trình duyệt cùng ca, mọi con số giống hệt và không có nút In lại / dòng no-print. (Công nợ trong ca chưa có trên đường này: sẽ nối khi module công nợ vào nhánh chung, loader `loadShiftReportSlip` là chỗ duy nhất thêm.)
