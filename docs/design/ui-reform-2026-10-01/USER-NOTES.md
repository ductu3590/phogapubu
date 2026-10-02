# Ghi chú đầu vào cải tổ giao diện MEVO

Ngày tổng hợp: 2026-10-01. Nguồn: `C:/Users/ductu/Desktop/sửa MEVO.docx` do anh Tú cung cấp.

Đã đọc toàn bộ nội dung Word và xem cả 5 ảnh. File có 9 yêu cầu; không có phần Word comments riêng. Ảnh được trích nguyên bản vào `source-images/` để session sau đọc được từ repo. Không sửa file Word nguồn.

Đây là đầu vào bắt buộc khi lập spec/plan mới, chưa phải kết luận đã sửa lỗi. Những quan sát từ ảnh cũ hoặc phản ánh của người dùng phải được đối chiếu với code/phiên bản đang chạy.

## Chín yêu cầu trong Word

### UI-01 — Kéo thả phân bàn vào khu vực

- Yêu cầu: phân bàn vào khu vực bằng cách kéo thả, thay thao tác chọn từng dropdown đang khó dùng.
- Ảnh nguồn: [image1.png](source-images/image1.png).
- Đề xuất phạm vi plan: dùng cùng dữ liệu phân khu/sơ đồ bàn hiện có; thao tác kéo thả có lưu/hủy, báo lỗi và cách chuyển khu bằng chạm/bàn phím. Phân biệt chỉnh cấu hình vị trí với đổi bàn/ghép mâm đang phục vụ.
- Nghiệm thu dự kiến: chuyển đúng bàn sang đúng khu, lưu rồi tải lại vẫn đúng; hủy không lưu; không đổi bill/mâm hoặc làm mất trạng thái booking.

### UI-02 — Hiện các phân khu cùng một màn

- Yêu cầu: hiển thị tất cả phân khu trong một tab, tách thành hai mục để dễ thao tác. Ảnh minh họa có Trong nhà và Ngoài trời.
- Ảnh nguồn: [image2.png](source-images/image2.png).
- Đề xuất: trong POS có các section theo khu, có thể thấy bàn của hai khu mà không phải chuyển tab; giữ hỗ trợ khu cấu hình thêm và bàn chưa phân khu. Không giới hạn schema chỉ còn hai khu.
- Nghiệm thu: dễ tìm bàn xuyên khu, chọn nhiều bàn làm mâm giữ đúng ngữ cảnh; khu rỗng không chiếm toàn màn.

### UI-03 — Chú giải màu trạng thái bàn

- Yêu cầu: thêm dòng chú thích Đỏ = Đang hoạt động, Cam = Đã đặt trước, Xanh = Bàn trống.
- Đề xuất: có nhãn/icon cùng màu để vẫn hiểu được khi khó phân biệt màu. Timeline phải thể hiện được bàn đang có khách đồng thời có booking tương lai; màu không thay thế các lớp dữ liệu riêng.
- Nghiệm thu: trạng thái bàn trống, đang phục vụ và giữ trước giờ đến rõ ràng; không hiểu nhầm đặt trước ngày mai là bàn đang khóa ngay bây giờ.

### UI-04 — Menu thêm món tay dạng danh sách dài, tab theo vị trí cuộn

- Yêu cầu: sửa giao diện thêm món bằng tay thành danh sách dài chia section; cuộn đến danh mục nào thì tab phía trên tự chuyển đến danh mục đó.
- Ảnh nguồn: [image3.png](source-images/image3.png).
- Đề xuất: thanh danh mục cố định, chạm tab cuộn tới section và cuộn danh sách cập nhật tab; tìm món, tăng/giảm số lượng, biến thể/topping và giỏ nháp dễ nhìn. Đánh giá tái sử dụng mẫu tương tác cho Mini App và staff.
- Ràng buộc: món ghi tay POS là món bổ sung vào bill, không tạo yêu cầu nấu/in bếp. Gọi món staff/QR là luồng riêng cần owner duyệt theo workflow Bảo Lương.
- Nghiệm thu: chọn nhiều món xuyên danh mục không mất giỏ; có `− / số lượng / +`; còn/hết món, biến thể và giá đúng theo server.

### UI-05 — Trạng thái đơn khách phù hợp Bảo Lương

- Yêu cầu: sau khi Admin xác nhận/in bill, Mini App trả về đơn đã được đặt; bỏ tiến trình 4 bước Đã gửi → Đã xác nhận → Đang làm món → Món xong rồi của Pubu đối với Bảo Lương.
- Đối chiếu sơ bộ: `mini-app/src/pages/order-status/index.tsx` còn `STATUS_STEPS = [pending, confirmed, cooking, ready]` và nội dung bếp dùng chung.
- Đề xuất: projection trạng thái theo workflow của quán: Chờ quán xác nhận, Đã xác nhận kèm danh sách món, Bị từ chối kèm lý do, cùng trạng thái thanh toán khi thích hợp. Bảo Lương không có dữ liệu xác nhận món đã nấu/xong qua Kitchen Display.
- Cần chốt trong design: sự kiện nghiệp vụ server nào làm hiện Đã xác nhận; tạo lệnh in/mở trình duyệt không chứng minh giấy đã in thành công. Trạng thái duyệt đơn và trạng thái lệnh in phải có nghĩa rõ ràng.
- Nghiệm thu: khách Bảo Lương không thấy tiến trình bếp giả; Pubu giữ tiến trình tương ứng mô hình hiện có. Chọn theo cấu hình workflow, không hardcode tên/ID quán.

### UI-06 — Staff xác nhận món, không chọn phương thức thanh toán lúc order

- Yêu cầu: ở màn nhân viên chỉ kiểm đúng/đủ món rồi Xác nhận đặt món. Khách chọn thanh toán bằng gì ở khâu thu tiền với thu ngân/chủ quán.
- Ảnh nguồn: [image4.png](source-images/image4.png).
- Đối chiếu sơ bộ: `admin-web/app/staff/order/staff-order-client.tsx:508` còn sheet Khách trả bằng gì; dòng 514 còn ghi Đơn vào bếp ngay, không phù hợp Bảo Lương.
- Phạm vi: thiết kế lại màn rà soát order; staff đặt hộ không được ghi nhận đã thu tiền hay đóng bill. Policy Bảo Lương vẫn đưa đơn staff vào hàng đợi POS để owner xác nhận/in.
- Phụ thuộc cần xác minh: RPC/schema hiện có yêu cầu payment_method khi tạo đơn; plan phải xác định cách biểu diễn đơn chưa thu tiền, tách khỏi phương thức thực thu. Không đơn thuần giấu hai nút nhưng âm thầm ghi nhận tiền mặt là phương thức khách đã trả.
- Nghiệm thu: staff gửi được đơn không chọn phương thức, số tiền đã thu vẫn bằng 0, POS thấy đúng bill/lượt món, phương thức thực thu chỉ được ghi khi owner chốt thanh toán. Pubu được đánh giá theo workflow riêng.

### UI-07 — Một nút Thanh toán mở luồng kiểm bill → in → chọn phương thức → chốt

- Yêu cầu: thay hai nút Tiền mặt và Chuyển khoản trên POS bằng Thanh toán. Mở danh sách món/bill, cho xem/sửa/thêm/bớt/tặng món; in bill cho khách rồi mới chọn tiền mặt/chuyển khoản. Khi khách thanh toán xong, hệ thống mở lại các bàn trống.
- Ảnh nguồn: [image5.png](source-images/image5.png); cũng thấy ở image3.
- Đối chiếu sơ bộ: `admin-web/app/admin/cashier/bill-panel.tsx:271` và `:278` còn hai CTA theo phương thức trực tiếp.
- Ràng buộc: các chỉnh bill dùng RPC audit hiện có; giữ khôi phục món và lý do cần thiết. Chặn chốt khi còn lượt chờ xử lý. Món thêm tay trong bước kiểm bill vẫn không gửi bếp.
- Thanh toán chuyển khoản: owner xác nhận tiền thực về qua quy trình/loa ngân hàng hiện có. Mở/đóng hộp thoại in không được tự xác nhận nhận tiền. Đóng bill thành công mới giải phóng toàn bộ bàn thuộc mâm; booking kế tiếp có thể khiến bàn vẫn mang trạng thái giữ chỗ thay vì khả dụng.
- Cần chốt: nếu người dùng hủy hoặc máy in lỗi thì có cho tiếp tục thu tiền không, cần xác nhận gì; bill bị thay đổi từ thiết bị khác trong khi thanh toán phải rà lại tổng nào. Thiết kế giữ tổng server và chống thu/chốt lặp.
- Nghiệm thu: sửa/tặng/bỏ món cập nhật đúng bill và phiếu; in không đóng bàn; owner xác nhận tiền đúng một lần; bàn/mâm và tổng doanh thu cập nhật đúng.

### UI-08 — Timeline POS hiện thông tin khách từ Mini App

- Yêu cầu: họ tên và SĐT của booking/order khách từ Mini App phải hiện trên Timeline POS.
- Đề xuất: truy nguồn đúng booking/đơn/phiên; khi nhận khách, liên kết vẫn giữ khách đúng mâm. Khách vãng lai không có thông tin thì hiện đúng trạng thái, không bịa. Khi gọi thêm hoặc chọn bàn khác không mang thông tin khách của phiên trước sang.
- Nghiệm thu: booking → xác nhận/xếp bàn → preorder → nhận khách → QR gọi thêm vẫn hiện đúng tên/SĐT và bill/mâm; có thao tác gọi điện phù hợp quyền.

### UI-09 — Khắc phục mở màn in preorder mất 30–40 giây

- Phản ánh người dùng: bấm xác nhận/in món đặt trước theo booking rất lâu mới ra màn hình in.
- Đối chiếu sơ bộ: `admin-web/app/admin/cashier/cashier-client.tsx:470`–`:493` có chuỗi release → chờ reload queue/bàn → lấy lại toàn queue preorder → tạo print job → điều hướng tab in → tải dữ liệu trang in. Đây là dấu hiệu cần đo, chưa xác minh bước nào gây 30–40 giây.
- Plan phải đo trên môi trường triển khai và thiết bị thực tế: từng server action/RPC, reload, tải print snapshot, mở route, render/font/image và hộp in. Ghi baseline, p50/p95 và ngưỡng nghiệm thu đề xuất theo điều kiện mạng.
- Hướng khảo sát: sử dụng snapshot/kết quả RPC đúng revision, tránh chặn tab in bằng reload không cần thiết, tránh tải toàn queue để in một đơn; giữ popup mở từ thao tác người dùng, idempotency và audit.
- Nghiệm thu: màn có phản hồi đang xử lý rõ; tab in mở đúng snapshot, thử lại không tạo đơn/phiếu nghiệp vụ trùng; báo đúng lỗi và có cách in lại. Không coi request gửi đến browser là giấy đã ra.

## Nợ kỹ thuật và vấn đề bổ sung đã có bằng chứng

### TD-01 — Typecheck Mini App chưa sạch

Đã chạy lại `npm run typecheck` ngày 2026-10-01; cả core và instance Bảo Lương đều exit 1:

- Core `mini-app/`: 4 diagnostics, gồm 2 diagnostics cho `SnackbarProvider` ở `src/app.tsx:166`, thiếu module `../app-config.json` ở `src/index.ts:16`, và kiểu quan hệ category/menu ở `src/services/category/category.api.ts:65`.
- Instance Bảo Lương: 3 diagnostics, gồm 2 diagnostics cho `SnackbarProvider` ở `src/app.tsx:155` và lỗi kiểu category/menu ở `src/services/category/category.api.ts:65`.

Đây là 3 nhóm nguyên nhân trong core và 2 nhóm trong instance, tránh nhầm số diagnostics với số nguyên nhân. Ghi vào task chuẩn bị baseline; xác minh thiếu app-config là vấn đề setup instance hay declaration trước khi sửa. Build/test đã PASS trước đó không thay thế typecheck sạch.

### TD-02 — Thông báo lỗi gửi preorder che mất nguyên nhân thực

Lần test 5A đã có lỗi server do `reservation_preorder_enabled=false`, nhưng khách chỉ thấy Không thể gửi món, vui lòng thử lại. `mini-app/src/pages/reservations/preorder-checkout.tsx` kiểm `cause instanceof Error`; lỗi RPC được ném dưới dạng object có message nên có thể rơi vào câu chung. Plan cần hiển thị thông báo tiếng Việt phù hợp, giữ giỏ khi lỗi, hỗ trợ thử lại idempotent và làm rõ capability đang tắt.

### TD-03 — Prototype Timeline và Admin Suite chưa được nghiệm thu như UI sản phẩm

- Bổ sung theo chỉ đạo mới của anh Tú: project Stitch **Restaurant Table Booking Manager**, ID `11099609419664851651`, là hướng Timeline POS anh khá ưng ý; ưu tiên phát triển từ hướng này và tiếp tục điều chỉnh/hoàn thiện. Anh đã cấp quyền trao đổi thiết kế trực tiếp qua MCP Stitch. Danh sách 5 screen ID và phạm vi quyền nằm trong `SESSION-PROMPT.md`.
- Nguồn: `docs/design/stitch-pos-2026-09-21/REVIEW.md`, `docs/design/stitch-admin-suite-2026-09-21/BRIEF.md`, cùng ảnh/HTML đi kèm.
- Những review cũ chỉ ra: sai bàn/mâm giữa các màn, tổng bill mẫu không khớp, trạng thái booking/phiên không nhất quán, gộp duyệt với kết quả in, mở thanh toán bằng duyệt nhanh, thiếu giỏ riêng từng phiên và trạng thái mất mạng/lưu lỗi.
- Dùng làm tài liệu nghiên cứu và checklist khi thiết kế mới. Không khẳng định các lỗi trong prototype chính là lỗi backend hiện tại; kiểm lại từng điểm với code thật.

## Thứ tự đề xuất cho session lập kế hoạch

1. Rà baseline code/DB/workflow và debt; lập ma trận UI-01 đến UI-09/TD-01 đến TD-03, mỗi mục có bằng chứng, màn liên quan, phạm vi UI/API và tiêu chí nghiệm thu.
2. Chốt luồng nghiệp vụ staff/thanh toán/trạng thái đơn và phép ánh xạ lên Timeline trước khi vẽ màn.
3. Đo UI-09 song song với audit để quyết định phần hiệu năng cần đưa vào plan.
4. Chốt design system và prototype xuyên suốt Mini App, POS Timeline, Admin và Staff bằng cùng một bộ dữ liệu kịch bản.
5. Chia task nhỏ có file test riêng, giữ hồi quy Bảo Lương/Pubu; Testing trước, quyết định Publish sau nghiệm thu UI.
