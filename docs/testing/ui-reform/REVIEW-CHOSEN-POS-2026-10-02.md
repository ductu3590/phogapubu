# Test rà bản POS đã chọn — 02/10/2026

Trạng thái: **PASS — Codex tự rà theo ủy quyền của anh Tú, 02/10/2026**. Chỉ nghiệm thu tài liệu, không yêu cầu chạy sản phẩm.

## Test R1 — Đối chiếu nhận xét
- [ ] Đọc [review](../../design/ui-reform-2026-10-01/REVIEW-CHOSEN-POS-2026-10-02.md), xác nhận quy trình duyệt/in/nối bill được giữ; chỉ yêu cầu thêm In lại và các nhóm màn Stitch đang bổ sung.
- [ ] Góp ý giữ nguyên bố cục/màu nguồn `cd57300e6e1a4a2baee056e84949713e`; không tạo mới hay Codex gửi lệnh Stitch.
- [ ] D01/D02 và core PASS được giữ; không hiểu chọn bản này là duyệt code, không bổ sung cọc/KDS Bảo Lương/VietQR động mới.

Anh báo **R1 PASS** để commit tài liệu. Sau đó anh sửa màn với Stitch, hai bên rà A2/A3; chỉ lời **“duyệt thiết kế”** mới mở phần B.

## Test R2 — Rà nhóm Admin A01–A05 trên Stitch

Đã đối chiếu trực tiếp các màn A01–A05 trong project Stitch ngày 02/10/2026. Kết luận: giữ bố cục A01–A04; không làm lại giao diện. Các điểm dưới đây là ràng buộc khi code hoặc sửa nhãn mẫu.

| Màn | Đánh giá | Chốt xử lý |
| --- | --- | --- |
| A01 Cấu hình | Đủ nhóm thông tin, quy trình, một máy in K80/in hai liên và QR/chuông. | Giữ một máy in. Không triển khai tự nhả bàn; hold là 60 phút theo server. Bỏ VietQR động; chuyển khoản dùng QR quầy hiện có. Chỉ hiện trạng thái máy in khi có tín hiệu thật. |
| A02 Thực đơn | Đủ tìm, nhóm món, bật/tắt bán, giá và danh sách. | Form chi tiết khi code phải có ảnh, biến thể, topping, thứ tự và giữ nháp khi lỗi. Sửa giá/giá hàng loạt giới hạn quyền MEVO/owner; không trao quyền cho staff. |
| A03 Bàn & QR | Đủ khu, bàn, QR, in QR và thao tác hàng loạt. | QR luôn gắn bàn vật lý; không tạo QR ghép cố định. In bill tạm không khóa QR. Mở phiên và duyệt QR phải theo policy server, gồm hold booking 60 phút và POS bắt buộc duyệt. |
| A04 Hóa đơn & báo cáo ca | Đủ danh sách hóa đơn, thực thu, tiền mặt/chuyển khoản, chờ thu và audit bỏ/tặng. | Doanh thu chỉ tính tiền đã nhận thật; pending/chờ thu không cộng. Đổi nhãn VietQR thành chuyển khoản thực tế; In lại chỉ in, không làm phát sinh bill hay thay đổi tiền. |
| A05 Nhân sự & quyền | Có danh sách nhân sự và ma trận quyền, nhưng thiếu cockpit MEVO nhiều quán. | **Cần bổ sung thiết kế nhỏ trước khi duyệt:** trạng thái/route `/mevo` cho superadmin quản lý quán, app/theme/tích hợp mà không lộ secret. Ma trận hiện tại phải sửa thành owner-only cho sửa bill, thu tiền và đóng mâm; không để cashier/staff tự nâng quyền. Bỏ fixture “cọc”. |

### Quyết định cần anh chốt (3 dòng)

1. Giữ A01–A04, chỉ áp các note nghiệp vụ khi dựng thật.
2. Không cần redesign A05; chỉ cần Stitch bổ sung một state `/mevo` và sửa 3 ô quyền owner-only.
3. Sau đó mới có thể rà thiết kế tổng để anh quyết “duyệt thiết kế”.

Anh báo **R2 PASS** nếu đồng ý hướng xử lý trên. Việc này chưa mở code sản phẩm.

### A06–A10 — MEVO Admin `/mevo`

- [x] Đề bài đã gửi vào Stitch ngày 02/10/2026: cockpit riêng cho `mevo_superadmin`, chỉ dùng chung `/login` với Admin quán.
- [x] Rà bản Stitch sinh ra và chỉnh fixture: A06 danh sách quán/onboarding; A07 tạo quán và nháp; A08 theme/nội dung; A09 trạng thái tích hợp; A10 operator/audit.
- [x] Chỉ `mevo_superadmin` vào `/mevo`; `store_owner` chỉ vào `/admin` đúng quán. v1 chỉ MEVO đổi theme/menu/banner.
- [x] Bỏ trạng thái kỹ thuật giả và dữ liệu nhạy cảm: không key/token/email/IP/địa chỉ/số tài khoản/QR, ping/HTTP/SLA hay công nghệ nội bộ chưa có trong core.
- [x] A09 chỉ dùng trạng thái `Chưa bắt đầu / Cần bổ sung / Đã xác minh / Tạm dừng` và “Mở hướng dẫn”. A10 chỉ lưu Thời gian, Người thực hiện, Thay đổi.
- [x] Bảo Lương được mô tả đúng: POS duyệt, một máy quầy in hai liên, thu tiền sau, không KDS. Pubu prepay giữ luồng hiện hữu.

### Kết quả tự rà

Thiết kế UI Reform được **chốt** theo ủy quyền trực tiếp “tự duyệt luôn, ok thì chốt”. Bộ màn đã dùng chung nhận diện từ POS nguồn `cd57300e6e1a4a2baee056e84949713e`; A06–A10 là cockpit MEVO độc lập, không phải Admin quán. Không có code sản phẩm trong lượt này.
