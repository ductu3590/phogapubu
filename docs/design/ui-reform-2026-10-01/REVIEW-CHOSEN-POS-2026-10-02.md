# Rà bản POS anh Tú chọn — 02/10/2026

Nguồn: [Stitch preview](https://stitch.withgoogle.com/preview/11099609419664851651?node-id=cd57300e6e1a4a2baee056e84949713e&raw=1), screen `cd57300e6e1a4a2baee056e84949713e`.

**Giữ bố cục và bộ nhận diện của bản này.** Không tạo thiết kế thay thế. Codex chỉ đối chiếu và viết góp ý; anh Tú trực tiếp yêu cầu Stitch sửa. Việc chọn bản gốc chưa mở phần B code.

Khung Timeline theo khu + panel bill/lượt món/lịch sử phù hợp hướng POS hợp nhất. Mâm 09+10 dùng chung bill, nguồn QR/staff và phân biệt gọi món với ghi nhận món đã phục vụ nên giữ. Các lỗi dưới là lỗi hoặc khoảng thiếu của prototype, không phải kết luận backend đang lỗi.

## Kết luận cập nhật sau khi trao đổi

Quy trình **“Xác nhận in thành công & Nối vào Bill mâm”** phù hợp với cách Bảo Lương vận hành: thu ngân duyệt lượt QR, hệ thống gửi lệnh in, món được đưa vào bill; nếu giấy không ra thì thu ngân tự viết phiếu giấy cho bếp/khách. Core không cần phát hiện lỗi kẹt giấy/hết giấy để tiếp tục thu tiền. Vì vậy đây không phải xung đột nghiệp vụ và không cần thêm nhánh “tiếp tục không in” hay bắt lý do.

Điều kiện duy nhất cho thiết kế là nút **In lại** phải tạo lệnh in lại cho đúng lượt đã duyệt, đúng hai liên cần in, có thể dùng sau khi nạp giấy, và không cộng món/tăng bill lần hai. Nút này có thể hiện ngay sau lần in đầu hoặc trong lịch sử lượt món. “Đã duyệt/nối bill” và “in lại” là hai trạng thái hiển thị để thao tác rõ ràng, không phải hai bước bắt buộc để thu tiền.

Các số tiền, tên khách và trạng thái trong preview là fixture minh họa màu/layout. Không dùng chúng làm lỗi cần sửa; khi triển khai, dữ liệu phải đi theo luồng core hiện có.

## Các điểm cần Stitch xác nhận trong bản sửa

### 1. Duyệt lượt, in lần đầu và In lại
Giữ nút “Xác nhận in thành công & Nối vào Bill mâm” theo quy trình anh chốt.
Thêm “In lại” cho đúng lượt đã duyệt; in lại không tạo lượt/bill mới, có nhãn lần in và chọn đúng liên.
Không thêm phát hiện kẹt giấy/hết giấy, nhánh tiếp tục không in, lý do không in hoặc chặn thu tiền.

### 2. Ngữ cảnh bàn/booking và phương án đổi bàn — ưu tiên cao
Hiện tại: review bản xuất ghi nhận chọn Bàn 04 vẫn mở mâm 09+10; chọn VIP 01 nhưng nút xác nhận còn 04+05; VIP đã đặt 20h lại được gợi ý trống tới 20:30.
Core: bàn/booking/phiên thật quyết định bill và món; bàn ưu tiên từ 60 phút trước giờ đến, phiên đang có khách không tự đóng.
Sửa: header→giỏ→phiếu→thu theo đúng bàn đang chọn; phương án đổi phải phản ánh bàn đã chọn và booking tiếp theo, báo xung đột thay vì hứa bàn trống.

### 2. Đường tắt thanh toán và QR — ưu tiên cao
Hiện tại: “Duyệt nhanh tất cả” chuyển thẳng sang thu 4.190.000đ, badge còn 2 lượt; QR được gọi VietQR động nhưng bản xuất chỉ mã hóa chuỗi minh họa.
Core: lượt chờ phải được xử lý/rà món trước đóng bill, bill thay đổi phải rà lại; owner xác nhận tiền thật. D02 chỉ bỏ chọn phương thức khi staff đặt hộ trả sau, không bỏ phương thức thực thu ở quầy.
Sửa: từ thu tiền mở danh sách lượt cần xử lý rồi cập nhật queue/bill; thể hiện thực thu tiền mặt/chuyển khoản và kết quả đóng cả mâm, in lỗi vẫn thu; không vẽ tích hợp VietQR động mới cho pilot.

### 3. Dữ liệu vận hành khi triển khai
Các số tiền/trạng thái trong preview chỉ là dữ liệu minh họa cho màu và bố cục, không phải nội dung cần Stitch sửa.
Khi code, UI đọc dữ liệu thật theo core: tổng server, bill đã duyệt, lượt chờ và trạng thái bàn/mâm.
Không mở thêm phạm vi fixture hoặc sửa số minh họa trong vòng thiết kế này.

## 4 nhóm tính năng còn thiếu màn thể hiện

### 4. Đặt bàn → khách đến → mâm
Hiện tại: có ví dụ xung đột và mâm đã ghép, chưa đủ form đặt mới bình thường, duyệt chưa xếp bàn và các bước mở/ghép mâm.
Core: owner tạo/duyệt booking chọn bàn, xác nhận khách đến, ghép phiên vào mâm; có đổi yêu cầu/giờ, hủy/không đến thủ công và snooze nhắc 10/15/30 phút.
Bổ sung: panel từng việc + chọn nhiều bàn + xem trước mâm; khách đến liên kết preorder không sao chép/in lại; lịch cũ giữ tới khi duyệt đổi, không thêm tự no-show/tách bill/cọc.

### 5. Duyệt preorder, QR/staff và chỉnh bill
Hiện tại: chủ yếu minh họa hai lượt QR/staff; menu/giỏ còn cố định trong bản xuất, thiếu các thao tác Bỏ/Tặng/Khôi phục trên bill.
Core: preorder một batch khóa ngay sau gửi; POS owner duyệt trước xuống bếp; Bỏ/Tặng/Khôi phục và món đã phục vụ có audit, món ghi tay không in/báo bếp.
Bổ sung: preorder gắn booking, trạng thái đã duyệt/chờ in/in lại đúng lượt; giỏ có biến thể/topping/ghi chú/số lượng; chỉnh bill có lý do và lịch sử, tách khỏi gọi món cần chế biến.

### 6. Gọi nhân viên và thông báo trong POS
Hiện tại: đã có chip gọi nhân viên nhưng chưa đủ danh sách→chi tiết→đã xử lý; thông báo/nhắc booking và lỗi gửi nội bộ chưa có luồng hoàn chỉnh.
Core: queue gọi nhân viên có thao tác theo quyền; BL-4 có trạng thái delivery/retry và phục hồi có audit, relay Zalo best-effort, POS là nguồn vận hành.
Bổ sung: panel việc hợp nhất, badge số chờ thật, mở đúng booking/bàn, xử lý call và gọi/hoãn nhắc; trạng thái gửi/lỗi/thử lại theo core, không bắt OA/ZNS hay thêm gửi bill trong hệ thống.

### 7. Quyền, lỗi và kích thước vận hành
Hiện tại: còn nav “Bếp”, thanh mô phỏng, nhãn online/máy in giả; chưa đủ các trạng thái lỗi và bản phone/tablet để nghiệm thu.
Core: Bảo Lương không KDS, chỉ owner sửa/thu/đóng; realtime/mạng chậm/retry phải giữ nháp, ngữ cảnh và không tạo trùng; Pubu prepay/KDS giữ nguyên.
Bổ sung: ẩn Bếp theo policy Bảo Lương, bỏ thanh demo khi triển khai; loading/rỗng/mất mạng/đang gửi/chưa rõ kết quả/bill đổi/bàn vừa bị nhận; rà 1366×768, tablet1024, phone390/360 và nút chạm đủ lớn.

## Bộ nhận diện đã chốt theo bản gốc

| Vai trò | Màu nguồn |
|---|---|
| Thương hiệu/nút chính | Orange 600 `#EA580C`; hover 700 `#C2410C` |
| Thanh queue/header bill tối | Slate 900 `#0F172A` |
| Chữ chính/nút phụ tối | Slate 800 `#1E293B` |
| Nền/bề mặt/viền | Slate 100 `#F1F5F9` / trắng `#FFFFFF` / Slate 200 `#E2E8F0` |
| Đang phục vụ | Emerald 600 `#059669` |
| Booking đã chốt | Orange 500 `#F97316` |
| Chờ duyệt/đổi | Amber 400/500 `#FBBF24` / `#F59E0B` |
| Trễ/xung đột | Red 500 `#EF4444` |
| Gọi nhân viên/thông tin | Blue 500 `#3B82F6` |
| Bàn trống | Slate nhạt/trung tính, giữ nhãn “Trống” |

Font nguồn Inter; giữ kiểu chữ và mật độ của bản chọn, kiểm dấu Việt và độ đọc được. Không ép đổi sang Geist/cam đất hoặc đỏ-có-khách/xanh-trống của brief trước. Màu trạng thái luôn kèm nhãn; bộ màn sau dùng cùng nhận diện, cấu hình thương hiệu quán vẫn theo Core + Theme.

## Bằng chứng và giới hạn

- Ngày 02/10 xem trực tiếp preview đúng ID: Timeline/Bill, In 2 liên, Thanh toán bị chặn và mô phỏng sau duyệt nhanh. Không thu tiền, chuyển khoản, in giấy hay sửa DB thật.
- Các thử nghiệm chi tiết Bàn04/VIP/menu/QR dựa trên [review 21/09](../stitch-pos-2026-09-21/REVIEW.md) và [HTML xuất chính thức](../stitch-pos-2026-09-21/code.html); chưa thử lại toàn bộ nút ngày 02/10. Không chỉnh nguồn xuất.
- Code tại HEAD `c26838f`: `admin-web/lib/actions/reservations.ts` (tạo/duyệt/arrival/đổi/hủy/no-show/snooze); `table-session.ts` (merge/close); `reservation-preorders.ts:66` và `:76` (release và print riêng); `pos-order.ts:98`, `:121`, `:147` (void/restore/manual); `service-requests.ts`; BL-4 đã PASS theo [SPRINT-BL-4](../../testing/bao-luong/SPRINT-BL-4.md).
- Đây là checklist sửa thiết kế, chưa phải kiểm thử realtime, mobile, máy in hoặc backend live; các khả năng tính tiền thừa/QR tự động không được mặc định coi là core đã PASS.

## Đoạn ngắn anh gửi Stitch

Giữ nguyên bố cục và bộ nhận diện của bản POS này, sửa các luồng thay vì tạo mới.
Ưu tiên: giữ quy trình duyệt→gửi in→nối bill; thêm In lại đúng lượt, không nhân đôi. Sau đó hoàn thiện các panel anh đã giao Stitch ở mục 4–7.
Máy in không cần phát hiện lỗi; không thêm nhánh/lý do không in; staff trả sau không chọn phương thức; Bảo Lương không màn bếp, không cọc/QR động mới. Dựng thêm trạng thái thao tác và phone/tablet theo cùng bộ màu.
