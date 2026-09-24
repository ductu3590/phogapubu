# Prompt Stitch — POS và Timeline trong một trang

Ngày: 2026-09-20. Đây là đề xuất thiết kế để anh Tú duyệt, chưa phải thay đổi kiến trúc hay phạm vi Sprint đang triển khai.

Copy toàn bộ nội dung từ dòng dưới vào Stitch, trong project hiện tại và chọn cả hai màn gốc làm tham chiếu.

---

Trong project Restaurant Table Booking Manager (11099609419664851651), hãy tạo một thiết kế mới tên “MEVO POS — Điều hành bàn & đặt bàn”, kế thừa hai màn:
- “Sơ đồ Timeline Đặt bàn - Quán Bia Lẩu” (36058e28eeff4bf596c174a8a772d923).
- “Quản lý Đặt bàn - Quán Bia Lẩu” (841be5b665d64ddab34d2b884045039a).

Giữ hai màn gốc. Tôi thích nhất timeline chia hàng theo khu vực/bàn và cột theo thời gian. Hãy phát triển nó thành một trang vận hành đầy đủ cho chủ quán/thu ngân Bia Lẩu Bảo Lương: đặt bàn, nhận khách, mở bàn khách vãng lai, gọi món, duyệt lượt gọi món, in bếp, quản lý bill và thanh toán. Thiết kế nhiều trạng thái của CÙNG MỘT trang, không biến mỗi nghiệp vụ thành một trang điều hướng riêng.

## 1. Bố cục và phong cách

- Desktop chính 1440×900, thêm bản 1920×1080 và tablet ngang 1024×768. Dùng tiếng Việt có dấu, tiền VNĐ dạng 1.250.000đ, giờ 24h.
- Kế thừa nền sáng, cam thương hiệu, đường viền nhẹ, chữ đậm dễ đọc, mật độ thông tin phù hợp ca đông khách. Giảm emoji trang trí, dùng icon nhất quán. Không để tên khách, badge và giờ chồng lên nhau như một số card mẫu.
- Sidebar có thể thu thành icon khoảng 64px. Mục đang chọn là “Điều hành POS”. Các mục thực đơn, báo cáo, cài đặt để ngoài không gian tác nghiệp chính.
- Thanh trên cùng nhỏ gọn: tên quán, ngày/ca, tìm khách/SĐT/bàn, trạng thái kết nối, nút “Đặt bàn mới”, “Khách vãng lai”.
- Dải việc cần xử lý gọn: “Đặt bàn chờ duyệt”, “Yêu cầu đổi”, “Khách quá giờ”, “Lượt món chờ duyệt”, “Gọi nhân viên”. Có số lượng và bấm để lọc/mở hàng đợi ngay tại trang. Luôn thấy việc chưa xử lý dù đang xem ngày khác.
- Trung tâm là không gian bàn với ba chế độ “Timeline / Sơ đồ bàn / Danh sách”, chung bộ lọc, chung lựa chọn bàn/mâm. Mặc định Timeline. Chuyển chế độ không mất giỏ món hoặc bàn đang thao tác.
- Bên phải là panel chi tiết theo ngữ cảnh, khoảng 380–440px, thu gọn được; mở panel vẫn nhìn thấy một phần timeline. Khi gọi món có thể mở rộng panel thành hai cột thực đơn và giỏ hàng ngay trong trang. Không cố nhét cả thực đơn và toàn bộ bill vào một cột hẹp.
- Ở 1024px dùng panel trượt; điện thoại dùng danh sách theo khu vực và màn chi tiết trượt toàn chiều rộng. Trên mobile chỉ duyệt/điều phối đặt bàn trong phạm vi hiện hành; duyệt/in lượt món dành cho POS quầy.

## 2. Timeline là trung tâm điều hành

- Hàng nhóm Sân vườn, Tầng 1, VIP có thu/mở. Mỗi bàn vật lý có một hàng, tên bàn và tiêu đề giờ được ghim khi cuộn. Có lọc khu vực, ngày/ca, về “Bây giờ”, mức phóng thời gian, cuộn ngang độc lập.
- Booking nhiều bàn hiển thị block liên kết trên từng hàng bàn đã giữ, chung tên đoàn/mã nhóm. Chọn một block sẽ làm nổi tất cả bàn liên quan. Không gộp thành một hàng giả làm mất khả năng nhìn lịch của từng bàn; không cộng trùng số khách/doanh thu của đoàn.
- Phân biệt rõ “Đặt trước” với “Đang phục vụ”. Khoảng giữ bàn dự kiến dùng nét đứt/độ nhạt và nhãn “Dự kiến”; phiên đang phục vụ có thời điểm nhận khách thực tế và tiếp tục tới hiện tại. Kết thúc dự kiến không đồng nghĩa khách đã về, không tự trả bàn hoặc đóng bill.
- Màu: xanh lá đang phục vụ, cam đã xác nhận đặt trước, vàng chờ duyệt/đổi, đỏ cảnh báo trễ/xung đột, xám đã kết thúc. Luôn có nhãn/icon, không chỉ dựa vào màu. Thanh màu chính biểu diễn trạng thái bàn/booking; badge phụ biểu diễn việc cần xử lý.
- Trên block đang ăn: tên khách/khách vãng lai, số khách, thời điểm vào, tổng bill, badge “2 lượt chờ duyệt” và chuông gọi nhân viên nếu có. Chi tiết món nằm ở panel, không đổ toàn bộ thực đơn lên timeline.
- Booking chưa được gán bàn nằm trong hàng đợi “Chưa xếp bàn”; không tự đặt vào bàn trống. Khi xác nhận bắt buộc chọn bàn hợp lệ.
- Khi khách đang ăn vượt khung dự kiến và ảnh hưởng lượt đặt tiếp theo, hiện cảnh báo cần điều phối. Không tự chuyển bàn/hủy booking.
- Bấm khoảng trống mở lựa chọn “Đặt bàn tại giờ này” hoặc “Nhận khách ngay”. Bấm booking/bàn mở đúng panel. Đổi lịch/bàn bằng form có kiểm tra xung đột; không dùng kéo thả là cách duy nhất. Nếu minh họa kéo booking chưa đến, chỉ là đề xuất đổi giờ/bàn, phải xem trước và xác nhận; không kéo mép để thay thời gian giữ bàn tùy ý trong phiên bản đầu.
- Số tổng bàn, bàn từng khu vực, tỷ lệ sử dụng và các badge phải khớp dữ liệu mẫu.

## 3. Panel đặt bàn và nhận khách

Hiển thị tên, SĐT có nút gọi, số khách, giờ đến, bàn đã giữ, ghi chú, yêu cầu thay đổi, lịch sử xử lý.

- Chờ duyệt: chọn một/nhiều bàn theo khu vực, gợi ý số lượng bàn dựa trên 6 khách/bàn nhưng chủ quán tự chọn; “Xác nhận đặt bàn” hoặc “Từ chối” kèm lý do.
- Đã xác nhận: “Khách đã đến”, “Đổi lịch/bàn”, “Hủy đặt bàn”. Kiểm tra bàn đang có người khi nhận khách; nếu vướng, giữ nguyên dữ liệu và yêu cầu xử lý/chọn bàn khác.
- Quá giờ: “Gọi khách”, “Nhắc lại 10/15/30 phút”, “Đổi giờ”, “Khách đã đến”, “Không đến”. Sau 30 phút cảnh báo nổi bật; không tự no-show, tự hủy hay xả bàn. Thao tác hủy/không đến cần xác nhận có mô tả tác động.
- Nhận khách nhiều bàn tạo một mâm/một bill; panel chuyển ngay sang phiên vừa mở. Đơn đặt trước đã xử lý chỉ nối vào bill, không tạo bản sao hoặc tự in lại.
- Món đặt trước là trạng thái mở rộng tương lai; tách rõ khỏi đặt bàn thông thường. Không thể hiện thông báo OA/ZNS đã gửi nếu chưa có kết quả thật.

## 4. Panel phiên/mâm đang phục vụ

Header luôn thấy “Mâm 09 + 10”, số khách, thời gian vào, tiền bill và trạng thái thanh toán. Các tab gọn: “Hóa đơn / Lượt gọi món / Lịch sử”. Nút chính “Gọi thêm món”, “In tạm tính”, “Thanh toán”.

- Gọi món mới: tìm kiếm, danh mục, giá, hết món, lựa chọn/ghi chú, số lượng, giỏ món và tổng lượt này. Hiển thị rõ bàn/mâm đích trước khi gửi. Đây là lượt món cần chế biến và đi qua bước xác nhận trước khi in bếp.
- Tách riêng thao tác phụ “Bổ sung món đã phục vụ vào bill”: có giải thích chỉ ghi tiền, không in/gửi bếp. Không dùng thao tác này thay cho gọi món mới.
- Lượt gọi món nhóm theo lần gửi và nguồn “Khách quét QR / Nhân viên / Đặt trước”, có giờ gửi, món, số lượng, ghi chú, tổng tiền. Owner xác nhận từng lượt; trạng thái “Chờ xác nhận”, “Đã xác nhận”, “Đã yêu cầu in” tách biệt.
- Có “Xác nhận & in 2 liên”, phân biệt phiếu bếp và phiếu bàn, cùng “In lại” có nhãn và lưu dấu. Không gọi trạng thái gửi lệnh in là bảo đảm giấy đã in thành công. Lỗi in giữ trạng thái đơn đã xác nhận và cho xử lý in lại, không tạo đơn mới.
- Không suy diễn “Đã lên đủ món” từ thao tác in: chỉ hiển thị tiến độ phục vụ khi có dữ liệu thật.
- Bill hiển thị món, số lượng, đơn giá, thành tiền; bỏ/tặng/khôi phục món có lý do và lịch sử. Món bị bỏ/tặng vẫn có dấu vết, không biến mất khỏi lịch sử. Tổng tiền dùng kết quả hệ thống trả về.
- Ghép các phiên/bàn vào một mâm có bước xem trước danh sách bàn và bill liên quan. Không tự thêm tách bill, chuyển món giữa bill hoặc chuyển bàn đang phục vụ khi chưa có nghiệp vụ tương ứng.
- Gọi nhân viên có loại yêu cầu, thời gian chờ, bàn/mâm và hành động tiếp nhận/hoàn tất.

## 5. Thanh toán

- Mở panel hoặc hộp thoại trong cùng trang, hiển thị rõ bàn/mâm, danh sách món, tổng phải thu. Có “Tiền mặt” và “Chuyển khoản”; tiền mặt có tiền khách đưa và tiền thừa.
- Bảo Lương trả sau tại quầy. Chuyển khoản được chủ quán xác nhận đã nhận tiền thực tế; xem QR hoặc ảnh chuyển khoản không tự đánh dấu đã trả.
- Nút cuối “Xác nhận đã thu tiền & đóng bill”, có bước kiểm tra và xác nhận. Chặn khi còn lượt món chưa xử lý, hiển thị lý do và nút quay lại các lượt đang chờ.
- Sau thành công cập nhật bàn/bill/timeline, có tùy chọn in hóa đơn. Nếu số tiền thay đổi do thiết bị khác, yêu cầu xem lại tổng mới trước khi xác nhận.
- Không tự thêm cọc, hoàn tiền, giảm giá, thuế/phụ phí, công nợ, tách thanh toán hoặc tích hợp ngân hàng tự động vào bản chính. Nếu muốn đề xuất, trình bày riêng một biến thể “Mở rộng tương lai”, không trộn vào luồng đã hỗ trợ.

## 6. Trạng thái hệ thống và giới hạn vai trò

- Thiết kế đầy đủ loading, không có đặt bàn, không tìm thấy món, xung đột bàn, mất kết nối, đang đồng bộ lại, lưu thất bại, thao tác đã được máy khác xử lý. Không hiển thị thành công trước phản hồi hệ thống.
- Realtime không làm mất giỏ nháp, tự đổi bàn đang chọn hoặc đóng hộp thanh toán. Ngăn gửi trùng khi bấm nhiều lần. Mất kết nối phải hiển thị dữ liệu có thể cũ và chặn thao tác cần xác nhận từ máy chủ.
- Chủ quán/thu ngân tại quầy duyệt/in/thu tiền/sửa bill. Nhân viên chỉ gọi món hộ, xem thông tin trong quyền và xử lý yêu cầu phục vụ; không được duyệt/in/thu tiền/đóng bill. Pilot chủ quán là người thu ngân, không cần thêm vai trò đăng nhập mới.
- Không có Mang về/Ship cho Bảo Lương. Không tự thêm kho, khuyến mãi, màn hình bếp hoặc marketing vào trang điều hành này.

## 7. Các khung hình cần bàn giao

Tạo các trạng thái nhất quán của cùng một trang:
1. Tổng quan Timeline giờ cao điểm, có nhiều khu vực, một đoàn giữ nhiều bàn, khách vãng lai, booking chưa xếp bàn và cảnh báo trễ.
2. Chọn booking và mở panel xác nhận/chọn bàn, kèm một tình huống xung đột.
3. Chọn mâm đang ăn, xem bill và hai lượt gọi món chờ duyệt.
4. Gọi thêm món với thực đơn + giỏ ngay tại trang.
5. Xác nhận/in lượt món và tình huống in lại.
6. Thanh toán, gồm trạng thái bị chặn do còn lượt chờ và trạng thái sẵn sàng thu tiền.
7. Tablet và mobile đặt bàn với cách bố trí phù hợp.

Dùng dữ liệu giả nhất quán và số điện thoại được che một phần. Nếu có prototype tương tác, nối các trạng thái trên thành luồng: đặt bàn → chọn bàn → nhận khách → gọi món → duyệt/in → thanh toán. Xuất ảnh và HTML cho từng trạng thái. Không chỉ vẽ một dashboard tĩnh với nhiều nút chưa rõ hành vi.
