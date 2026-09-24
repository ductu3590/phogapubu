# Nghiên cứu POS kết hợp Timeline

2026-09-20 — đề xuất chờ anh Tú duyệt. Chưa sửa code ứng dụng, migration, quyết định kiến trúc hoặc Sprint ở phiên khác.

## Nguồn thiết kế đã lấy

Project: Restaurant Table Booking Manager — `11099609419664851651`.

| Màn | ID | HTML | Ảnh |
|---|---|---|---|
| Sơ đồ Timeline Đặt bàn - Quán Bia Lẩu | `36058e28eeff4bf596c174a8a772d923` | [timeline.html](timeline.html) | [timeline.png](timeline.png) |
| Quản lý Đặt bàn - Quán Bia Lẩu | `841be5b665d64ddab34d2b884045039a` | [reservations.html](reservations.html) | [reservations.png](reservations.png) |

Không có MCP Stitch trong bộ công cụ phiên này. Đã đọc hai preview trong Chrome và xuất trực tiếp hai màn đang được chọn bằng Stitch → Xuất → .zip. ZIP tải về tại `C:/Users/ductu/Downloads/stitch_restaurant_table_booking_manager.zip`; lấy nguyên bốn file bên trong. Không có hosted asset URL được cung cấp nên dùng chức năng download ZIP của Stitch thay cho curl; không dựng URL tải giả. HTML là nguyên mẫu Stitch, không phải code đã tích hợp MEVO.

## Kết luận và lựa chọn

Khả thi và phù hợp vận hành Bảo Lương. Đề xuất Timeline là trung tâm, panel theo bàn/mâm là nơi thao tác. Timeline, sơ đồ bàn và danh sách dùng chung lựa chọn và dữ liệu.

So với giữ đặt bàn và POS thành hai trang, cách này giảm việc tìm lại bàn/bill khi nhận khách. So với đặt toàn bộ thực đơn + bill + timeline đồng thời, panel theo ngữ cảnh giữ được diện tích timeline. Khi gọi món, mở rộng panel để thao tác nhanh; đóng lại về đúng điểm đang xem.

Ba đối tượng phải tách biệt dù UI dùng chung trang: booking giữ bàn trong tương lai; session/mâm biểu diễn khách đang ngồi và bill; order biểu diễn từng lượt gọi món. Không biến mỗi block timeline thành một bill mới.

## Đối chiếu backend trong workspace

| Nền tảng | Bằng chứng local | Ảnh hưởng |
|---|---|---|
| Khu vực và vị trí bàn | `supabase/migrations/048_pos_table_areas.sql` | Dùng lại cho nhóm hàng và sơ đồ; không tạo kho bàn thứ hai |
| Booking và phân bổ khoảng giữ bàn | `supabase/migrations/052_reservation_schema.sql` | Đã có arrival, hold start/end và session liên kết; đủ nền dựng timeline đặt trước |
| Nhận khách thành phiên/mâm | migrations 054–056; spec BL-2A | Dùng lại RPC arrival, không sao chép đơn hoặc tạo hai bill |
| Queue đặt bàn, đổi lịch và Snooze | migration 057; `admin-web/lib/actions/reservations.ts` | Dùng lại nghiệp vụ; timeline là lớp trình bày bổ sung |
| Duyệt đơn, bỏ/tặng/khôi phục và món tay | `admin-web/lib/actions/pos-order.ts` | Giữ action/RPC; món tay đã phục vụ không gửi bếp |
| Bill, ghép mâm và đóng phiên | `admin-web/lib/actions/table-session.ts` | Có nền POS tái sử dụng; phải giữ kiểm quyền và chống đóng bill khi còn đơn chưa xử lý |

Đây là đối chiếu file trong checkout, không xác nhận tất cả đã deploy hoặc nghiệm thu production. `TESTING.md` hiện ghi BL-2A Task 4 PASS; Task 5 chưa bắt đầu tại lúc đọc.

Backend ở phiên khác có thể tiếp tục đúng kế hoạch và checkpoint PASS hiện hành. Hướng UI này không đòi bỏ nền BL-1/BL-2A. Khi tích hợp cần kiểm tra thêm:

- Một read model/snapshot theo quán + khoảng ngày, gồm bàn/khu vực, allocation, phiên mở, bill, lượt chờ và gọi nhân viên. Queue hiện tại phục vụ vận hành; không mặc định đủ lịch sử và mọi khoảng ngày cho timeline.
- Tổng hợp không đếm trùng đoàn nhiều bàn; cache/realtime cập nhật sau reconnect và bảo toàn giỏ nháp.
- Giờ kết thúc dự kiến lấy từ khoảng giữ bàn, ghi rõ ý nghĩa. Không thêm khả năng chỉnh thời lượng độc lập nếu chưa bổ sung contract/RPC.
- Timeline đang phục vụ phải đọc phiên thực, không suy ra bàn trống chỉ vì hold hết giờ.
- Preorder và audit in/in lại vẫn thuộc BL-2C/BL-3; thông báo OA thuộc BL-2B. Thiết kế đích có thể mô tả đầy đủ, triển khai từng phần khi capability đã sẵn sàng; không đưa nút giả vào bản BL-2A.
- Chuyển bàn đang phục vụ, cọc/hoàn cọc, sức chứa từng bàn, dọn bàn, tách bill/thu nhiều lần cần khảo sát và có sprint riêng nếu chọn. Không hứa hỗ trợ chỉ vì mẫu Stitch có nhãn đó.

## Những chi tiết mẫu cần sửa

- Timeline ghi 17 bàn nhưng footer ghi 24; cần dữ liệu mẫu nhất quán.
- “Chờ cọc / Chờ duyệt” đang trộn hai trục nghiệp vụ. Cọc không là điều kiện mặc định để duyệt booking.
- Thời gian kết thúc block phải là dự kiến nếu khách chưa đóng bill; không dùng để xả bàn.
- Đoàn nhiều bàn phải hiện việc chiếm từng bàn theo thời gian; một hàng ghép riêng có thể che xung đột.
- “Đã lên đủ món” và “Đã dọn dẹp” cần dữ liệu thật, không suy từ in phiếu/thanh toán.
- Bản PNG danh sách có tên/giờ/badge chồng nhau ở một số card; prompt yêu cầu sửa responsive.

## Bàn giao

[STITCH-PROMPT.md](STITCH-PROMPT.md) là prompt đầy đủ để dán vào project và tạo thiết kế mới. Chưa gửi prompt hoặc tạo thiết kế mới trên Stitch. Dừng ở nghiên cứu/prompt đúng yêu cầu; chờ review trước khi triển khai UI.
