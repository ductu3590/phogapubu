# Review MEVO POS — Điều hành bàn & đặt bàn

Ngày 2026-09-21. Project `11099609419664851651`, screen `cd57300e6e1a4a2baee056e84949713e`.

## Kết luận

Giữ bố cục Timeline + panel theo ngữ cảnh. Thiết kế đã có đủ khung chính để phát triển POS, nhưng prototype hiện là tập các màn mẫu chuyển qua lại, chưa là mô phỏng có dữ liệu xuyên suốt. Cần chỉnh các điểm dưới trước khi dùng làm tài liệu triển khai. Đây không phải kết luận về lỗi backend MEVO.

## Tài nguyên

- [Ảnh gốc xuất từ Stitch](screen.png), 563.470 bytes.
- [HTML gốc xuất từ Stitch](code.html), 102.371 bytes.
- Nguồn: Chrome, Stitch → Xuất → ZIP, chỉ màn đang chọn theo ID trên. File tải: `C:/Users/ductu/Downloads/stitch_restaurant_table_booking_manager (1).zip`.
- Không có MCP Stitch hay hosted URL tải ảnh/code được cung cấp trong phiên; đã tải ZIP chính thức thay vì suy đoán URL cho curl. Không sửa HTML gốc, không gửi yêu cầu sửa lên Stitch.

## Điểm nên giữ

1. Sidebar gọn; timeline và panel cùng hiện giúp thu ngân không mất toàn cảnh.
2. Hai hàng bàn 09, 10 có liên kết chung mâm thay vì giấu bàn vật lý.
3. Tách bill, lượt gọi món và lịch sử; có nguồn QR/nhân viên và giờ gửi.
4. Gọi món mở rộng thành menu + giỏ; tách rõ ghi nhận món đã phục vụ khỏi gọi món cần chế biến.
5. Có cảnh báo bàn chưa trả, chặn đóng bill khi còn lượt chờ và tình huống in lại.

## Ưu tiên sửa trước khi chốt

### 1. Giữ đúng bàn và khách xuyên suốt thao tác

Đã thử Khách vãng lai → giữ mặc định Bàn 04 → Xác nhận mở bàn & Chọn món. Màn sau vẫn ghi “GỌI THÊM MÓN → Mâm 09 + 10” và “Bàn đích: Mâm 09+10”, kèm giỏ mẫu có sẵn.

Code dòng 1601–1610 bỏ qua tham số bàn/khách khi mở panel; dòng 1681 chỉ chuyển trạng thái màn. Bấm Bàn 01 cũng được nối vào panel mẫu của mâm 09+10 theo code.

Yêu cầu: mỗi booking/phiên có dữ liệu riêng; chọn bàn nào thì header, bill, giỏ, lệnh in và thanh toán theo bàn đó. Giữ giỏ nháp riêng từng phiên, có cách quay lại; không mang món nháp sang bàn khác. Nếu chưa làm logic thật, ít nhất mô phỏng hai bàn độc lập để kiểm chứng luồng.

### 2. Gợi ý đổi bàn phải hợp lệ toàn khoảng giữ bàn

Đã thử chọn phương án B (VIP 01), radio đổi nhưng nút xác nhận vẫn ghi Bàn 04+05. Code `confirmConflictResolution` dòng 1587 luôn báo chuyển 04+05.

VIP 01 trên timeline ghi đã đặt 20h nhưng phương án B nói trống tới 20:30; đoàn mới hẹn 19:30. Không đủ căn cứ để khuyên chuyển đoàn tới phòng này. Với khoảng giữ bàn theo cấu hình, cần kiểm tra toàn khoảng, không chỉ thời điểm đến. T1-03 cũng có A. Khoa đang ngồi nhưng mô phỏng chỉ giải thích vướng T1-02.

Yêu cầu: nút xác nhận phản ánh lựa chọn; hiện giờ có booking tiếp theo và lý do bàn không hợp lệ. Thay điều hòa bằng sân vườn cần nhắc xác nhận với khách. Gợi ý số bàn không đồng nghĩa tự biết bàn liền kề; cho chủ quán chọn trên sơ đồ. Chưa cần thuật toán “tối ưu” tự động.

### 3. Duyệt đơn và in phải độc lập

Màn in giải thích đúng “lệnh gửi in ≠ đã in thành công”, nhưng nút cuối lại là “Xác nhận in thành công & Nối vào Bill mâm”. Code dòng 1596 cũng thông báo chỉ khi bấm này món mới được gộp chính thức.

Yêu cầu: xác nhận lượt món ghi nhận nghiệp vụ đúng một lần; in và in lại chỉ cập nhật lịch sử lệnh in, không thêm món/tăng bill. Hai liên có lịch sử riêng, cho chọn in lại liên bếp hoặc liên bàn, không buộc in lại cả hai. Nếu chủ quán xác nhận đã thấy giấy, ghi rõ đó là xác nhận thủ công. Đổi “Phiếu Giữ Bàn” thành “Phiếu món tại bàn” tránh nhầm giữ chỗ.

### 4. Không dùng duyệt nhanh làm đường tắt bỏ qua rà soát

Đã thử Thanh toán → Duyệt nhanh tất cả món vào bill & Chuyển sang thu tiền. Màn chuyển thẳng sang số tiền 4.190.000đ, trong khi badge và timeline vẫn ghi 2 lượt chờ. Sau thao tác in một lượt, quay về bill cũng vẫn còn 2 lượt chưa xử lý.

Yêu cầu: nút chính ở trạng thái bị chặn là “Xem 2 lượt cần xử lý”. Nếu giữ duyệt nhiều lượt, phải có danh sách món/nguồn/số tiền, bước xác nhận, kết quả từng lượt và trạng thái lệnh in; chỉ mở thanh toán khi không còn lượt chưa xử lý. Không tự duyệt món hết, món khách muốn bỏ hoặc đơn nghi trùng.

### 5. Dữ liệu mẫu phải tự khớp

- 6 dòng món: 1.100.000 + 555.000 + 680.000 + 130.000 + 60.000 + 50.000 = **2.575.000đ**, nhưng bill hiện **3.420.000đ**. Cộng hai lượt 770.000đ phải là **3.345.000đ** nếu chỉ có các dòng đó, không phải 4.190.000đ. Nếu có món/điều chỉnh khác phải hiện đủ.
- A. Tú ở timeline còn chưa đến/trễ 15 phút nhưng panel là đang phục vụ từ 18:15. Mỗi trạng thái mô phỏng phải cập nhật đồng bộ cả timeline lẫn panel; hoặc dùng đoàn khác cho hai kịch bản.
- T1-01 ghi đang ăn, block lại là đã thanh toán/đang dọn. Tách booking, phiên thực tế và dọn bàn nếu quyết định bổ sung nghiệp vụ dọn.
- Vạch đỏ “19:15” trong ảnh xuất nằm lệch so với thang 19:00/19:30. Dùng cùng hàm ánh xạ giờ cho tick, block và vạch hiện tại.
- Tổng 24 bàn có thể là số toàn quán nhưng ảnh chỉ minh họa một phần. Ghi rõ nếu rút gọn demo; không coi bàn có booking tương lai là một nhóm loại trừ với bàn đang ăn hiện tại.

## Các trạng thái còn cần thiết kế/mô phỏng

### Mở và ghép bàn

Trong bản HTML xuất hiện tại chỉ có form mở khách vãng lai chọn một bàn. Hai hàng 09+10 là ví dụ đã ghép; chưa thấy luồng chọn nhiều bàn → xem trước → xác nhận ghép thực sự. Cần bổ sung:

- Đoàn vãng lai chọn nhiều bàn, xem số khách/số bàn và gợi ý sức chứa.
- Thêm bàn trống vào mâm đang phục vụ và ghép phiên đang có bill phải phân biệt rõ.
- Xem trước bàn nguồn, mâm đích, tổng bill, lượt chờ, lịch đặt kế tiếp; có xác nhận và lỗi bàn vừa bị máy khác nhận.
- Giữ một bill, không nhân đôi món hoặc in lại khi ghép. Không tự thêm tách bill trong lần chỉnh này.

### Thanh toán và QR

Thử chọn Tiền mặt không đổi nội dung; code mới có phần trình bày, chưa có form tiền khách đưa/tiền thừa. Cần mô phỏng nhập thiếu/đủ/dư, đóng bill thành công và cập nhật đúng các bàn.

Ảnh QR trong code dòng 1551 mã hóa chuỗi `MEVOPOS-MAM0910-4190000VND` qua QR generator, không phải payload VietQR thanh toán dù UI ghi “Mã VietQR động chính xác số tiền”. Gắn nhãn QR minh họa, thay số tài khoản mẫu bằng placeholder rõ ràng; triển khai phải lấy thông tin tài khoản cấu hình của quán. Không dùng QR mẫu để kiểm thử chuyển tiền.

Thêm trường hợp đang thu tiền thì thiết bị khác gửi thêm món/đổi bill: hiện tổng cũ/mới, yêu cầu rà lại; không âm thầm đổi tiền dưới nút xác nhận. Có trạng thái đang gửi, thất bại/chưa rõ kết quả và tải lại để tránh thu trùng. Không cần tích hợp ngân hàng tự động cho pilot.

### Thao tác thường ngày còn thiếu

- Form đặt bàn mới bình thường và duyệt booking chưa xếp bàn, không dẫn tất cả vào kịch bản xung đột Anh Phong như prototype hiện tại.
- “Nhắc lại 15 phút” khác với “đổi giờ đến/giữ bàn thêm”; không dùng nhãn Gia hạn nếu chỉ Snooze.
- Yêu cầu đổi từ khách; không đến/hủy có lý do; gọi nhân viên có tiếp nhận/hoàn tất thay cho alert.
- Bỏ/tặng/khôi phục món có lý do và lịch sử; bản bill hiện chưa có thao tác này.
- Giỏ món thực sự tăng giảm được; code gọi `addToCart` nhưng chưa có định nghĩa. Sau gửi lượt nháp phải in đúng món mới; hiện nút gửi dẫn vào mẫu lượt #02 ba chỉ/nấm cố định.

### Kích thước và lỗi hệ thống

Ảnh gốc xuất cho thấy toolbar và footer xuống dòng nhiều, thanh mô phỏng đè lên hàng đợi. Thanh mô phỏng chỉ dành cho review, bỏ khỏi sản phẩm. Dành nhiều chỗ hơn cho timeline bằng cách rút gọn header, gom legend vào chú giải, bảo đảm vạch hiện tại và booking kế tiếp còn thấy khi mở bill.

Cần thêm khung 1366×768 và 1024×768, panel có nút đóng/thu; nút chạm đủ lớn. Màn menu hai cột hiện 760px theo code, cần biến thể phù hợp tablet. Chưa kiểm thử thực tế các kích thước này trong phiên review.

Chưa thấy mô phỏng mất mạng/reconnect, đang lưu, gửi lỗi, hai máy cùng nhận bàn, bill vừa đóng, giỏ nháp còn tồn, hoặc loading. Hiển thị “Trực tuyến”, “Máy in sẵn sàng” phải dựa trên khả năng quan sát thật khi triển khai.

## Phạm vi đã kiểm tra

Đã xem sáu trạng thái trên preview, đổi lựa chọn xung đột, mở tab lượt món, bấm xác nhận/in mô phỏng, thử thêm món, duyệt nhanh để mở panel thu tiền, thử chọn tiền mặt, mở Bàn 04 và kiểm tra bàn đích, đọc HTML xuất và ảnh PNG. Chưa chạy thanh toán thật, gọi điện, gửi lệnh máy in thật hay sửa dữ liệu MEVO. Không kiểm thử backend, realtime, mobile hoặc mọi nút.

Khuyến nghị: yêu cầu Stitch một vòng chỉnh tập trung, giữ bố cục và phong cách; ưu tiên mục 1–5 cùng luồng ghép/mở bàn trước khi bổ sung thêm chức năng mới.
