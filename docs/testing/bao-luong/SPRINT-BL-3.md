# Bảo Lương — Sprint BL-3

## Test 1 — RPC khách đặt bàn và khôi phục retry

Task 1 đã được kiểm thử tự động bằng PGlite. Anh Tú không cần chạy lại lệnh; chỉ xác nhận kết quả trước khi em tiếp tục Task 2.

- ✅ Intent cấp token 256-bit, không tạo booking/event; bảng intent không đọc/ghi trực tiếp được từ anon.
- ✅ Gọi lại prepare không trả token lần nữa; retry create cùng request ID + token lấy đúng booking, chỉ một event.
- ✅ Token sai và RPC `create_reservation` cũ không thể replay để lấy dữ liệu khách; response không lộ token/hash.
- ✅ Slot được chuẩn hóa theo ngày lịch `Asia/Ho_Chi_Minh`, gồm ca qua nửa đêm, sắp xếp instant, giới hạn 7 ngày.
- ✅ Booking vẫn xem được khi quán tắt nhận mới; giờ phục vụ/giới hạn của booking là snapshot khi yêu cầu đổi.
- ✅ Projection khách phân biệt booking pending/yêu cầu đổi, hỗ trợ trạng thái và cutoff mà không lộ ghi chú vận hành.
- ✅ Chỉ chủ đúng quán thu hồi được token; thu hồi có audit và token cũ hết quyền.
- ✅ Event Snooze/reschedule đang có của POS vẫn được migration chấp nhận.
- ✅ Migration chạy lặp lại an toàn trong test harness.

**Kết quả Codex:** Test mới `12/12 PASS`; hồi quy `052/054/057/063` `26/26 PASS`; `git diff --check` sạch.

**Phạm vi:** chỉ mã local trên nhánh `codex/bl3-task1-reservation-access`; migration chưa áp dụng lên Supabase, chưa deploy Mini App. Test giao diện/điện thoại sẽ thuộc Task 3.

Lệnh tái chạy nếu cần (PowerShell, một dòng):

```powershell
$env:PGLITE_MODULE='D:/Code/mevo/admin-web/node_modules/@electric-sql/pglite/dist/index.js'; node --test supabase/tests/065_reservation_customer_access.test.mjs
```

**Nghiệm thu:** `Task 1 PASS` hoặc nêu test chưa đạt. Chưa tiếp tục Task 2 trước khi được xác nhận.

## Test 2 — Service và lưu quyền đặt bàn trên Mini App

Task 2 đã được kiểm thử tự động. Chưa có route/UI để thao tác tay; phần đó thuộc Test 3.

- ✅ Token chỉ nhận từ RPC server, không tự sinh ở Mini App.
- ✅ Token + draft được lưu trước create; nếu không ghi được storage thì không gửi create và hướng dẫn gọi quán.
- ✅ Nếu response create mất, draft vẫn còn nguyên request ID/token/payload để retry, không prepare/create mới.
- ✅ Sau thành công, access được lưu trước khi xóa draft; tên/SĐT lưu riêng, không trộn với token.
- ✅ Access/draft tách theo quán; một thiết bị lưu được nhiều booking của cùng quán mà không ghi đè token cũ.
- ✅ JSON hỏng, storage bị chặn/quota không làm app vỡ; không có cơ chế tìm booking bằng phone hoặc UID.
- ✅ Query key không chứa token; polling booking 5 giây chỉ khi trang hiển thị, refetch khi focus/kết nối lại.

**Kết quả Codex:** service/storage `11/11 PASS`; toàn Mini App `58/58 PASS`.

`npm run typecheck` vẫn dừng vì 4 lỗi nền có trước Task 2: `SnackbarProvider` của ZaUI, thiếu `app-config.json` declaration, và cast ở `category.api.ts`. Không có lỗi typecheck nào trong `services/reservation` hay type RPC BL-3 mới.

**Nghiệm thu:** ✅ `Task 2 PASS` — anh Tú xác nhận ngày 2026-09-23.

### Nợ kỹ thuật BL-3 — bắt buộc xử lý trước khi chốt Sprint

`npm run typecheck` hiện còn 4 lỗi nền, không phát sinh từ Task 2: `SnackbarProvider` của ZaUI trong `src/app.tsx`, thiếu declaration cho `app-config.json` trong `src/index.ts`, và cast quan hệ menu trong `src/services/category/category.api.ts`. Để mở đến khi toàn bộ BL-3 hoàn thành; phải sửa và chạy lại typecheck trước nghiệm thu cuối Sprint.

## Test 3 — Form và theo dõi đặt bàn trên Mini App

**Chuẩn bị:** Mini App Bảo Lương build mới có commit Task 3; migration `065_reservation_customer_access.sql` đã áp dụng. Có cấu hình Bảo Lương bật **Đặt bàn trước**. Có thể để quán ngoài giờ phục vụ để xác nhận hai luồng tách biệt.

1. Mở Mini App Bảo Lương ở root, không có mã bàn, lúc ngoài giờ: menu vẫn chỉ đọc và có banner ngoài giờ; đồng thời có nút **Đặt bàn trước**. Nút mở form, không còn nút disabled/placeholder.
2. Form: nhập tên/SĐT/số khách, chọn ngày và chỉ một trong các slot server trả về. Đổi ngày phải bỏ giờ đã chọn. Không có slot ngoài giờ phục vụ hoặc trước 30 phút. Gửi thành công hiển thị **Đã gửi yêu cầu đặt bàn — chờ quán xác nhận**, không nói bàn đã được giữ.
3. Tắt cấu hình nhận đặt bàn sau khi đã tạo: không tạo booking mới; mở lại link/detail booking cũ vẫn xem được. Nếu server cho phép đổi/hủy thì hai thao tác hoạt động; nếu từ chối, hiển thị đúng lỗi server, không tự báo bị từ chối.
4. Từ POS xác nhận, từ chối và yêu cầu đổi giờ: mở lại màn **Đặt bàn của tôi**/detail sẽ cập nhật trong tối đa 5 giây hoặc khi quay lại app. Lịch cũ giữ nguyên trong khi yêu cầu đổi đang chờ. Booking xác nhận hiện lời mời chọn món trước nhưng không có nút đặt món giả; **Gọi sau tại quán** không tạo món ở giai đoạn này.
5. Tắt mạng khi bấm gửi rồi mở lại form: phải thấy thông báo lỗi và nút **Gửi lại yêu cầu đặt bàn**. Lần retry chỉ tạo một booking. Đổi máy/xóa storage: app không tìm booking bằng SĐT/UID; hướng dẫn liên hệ quán.
6. Kiểm viewport 390px trong Zalo: không tràn ngang; Tab **Đặt bàn** chỉ hiện tại root khi quán bật tính năng hoặc thiết bị còn booking. Pubu không bị thêm tab nếu không bật đặt bàn; luồng QR bàn và Mang về/Ship cũ không đổi.

**Kết quả Codex:** utility display `3/3 PASS`; toàn Mini App `61/61 PASS`; `git diff --check` sạch. `npm run typecheck` còn đúng 4 lỗi nợ kỹ thuật BL-3 đã ghi ở trên, không có lỗi mới từ Task 3.

**Nghiệm thu:** ✅ `Task 3 PASS` — anh Tú xác nhận ngày 2026-09-23.

## Test 4 — Server tạo, sửa và hủy món đặt trước theo phiên bản

### Anh cần làm gì?

**Không cần thao tác tay, không cần deploy Mini App, cũng không cần chạy SQL.** Chưa có màn chọn món ở Task 4; màn đó thuộc Task 7. Vì vậy, ở checkpoint này anh chỉ cần đọc và xác nhận 5 quy tắc bên dưới đúng với cách quán muốn vận hành.

1. Khách chỉ gửi món sau khi đặt bàn đã được chủ quán **xác nhận** và trước giờ đến. Quán Bảo Lương phải là mô hình **trả sau + tiền mặt**; quán khác không phù hợp sẽ bị chặn, không tự chuyển sang thanh toán online.
2. Khách được sửa hoặc hủy món đến **trước giờ đến 30 phút**. Đến đúng mốc 30 phút thì hệ thống khóa sửa/hủy. Chủ quán đã in món trước đó vẫn không làm mất quyền sửa trước cutoff; bản sửa sẽ chờ POS xem và in điều chỉnh ở Task 6.
3. Gửi lại do mất mạng không tạo đơn thứ hai: cùng một lần gửi trả lại cùng bản món. Nếu cùng mã gửi nhưng nội dung khác, hệ thống từ chối thay vì ghi đè.
4. Giá/biến thể/topping do server tự lấy từ menu hiện tại. Khách không thể sửa giá trong request; món hết bán hoặc thuộc quán khác bị từ chối.
5. Món đặt trước chưa thuộc bàn hay bill nào cho đến khi chủ quán bấm **Khách đã đến** ở Task 5. Nó chưa xuống bếp và chưa tự in; chỉ POS mới release/in ở Task 6.

Nếu cả 5 quy tắc trên đúng ý anh, chỉ cần trả lời **`Task 4 PASS`**. Sau đó em sẽ áp migration `066` lên Supabase và bắt đầu Task 5.

### Codex đã tự kiểm gì?

- Token sai, booking pending, quán sai cấu hình, request trùng nhưng khác nội dung đều bị từ chối.
- Giá do server tính; revision/retry/cutoff chạy qua PGlite thật; anon không đọc trực tiếp được preorder.
- Bảo Lương đang tắt QR gọi món vẫn không làm hỏng preorder; Pubu/QR hiện có giữ nguyên trigger workflow.
- Schema đã chuẩn bị audit phiên bản, print-job và cờ đối soát hao hụt cho Task 5–6, nhưng chưa kích hoạt in/bếp.

**Kết quả Codex:** PGlite Task 4 `6/6 PASS`; hồi quy RPC booking Task 1 `12/12 PASS`; toàn Mini App `61/61 PASS`; `git diff --check` sạch.

`npm run typecheck` vẫn còn 4 lỗi nền đã ghi tại Test 2 (không có lỗi từ type preorder mới). Sẽ xử lý trước nghiệm thu cuối BL-3.

**Nghiệm thu:** Không có thao tác tay ở Test 4. Xác nhận 5 quy tắc ở trên bằng `Task 4 PASS`. Chưa áp migration `066_reservation_preorders.sql` lên Supabase và chưa tiếp tục Task 5 trước khi anh xác nhận.
