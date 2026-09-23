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

## Test 4 — Server tạo và khóa món đặt trước ngay khi khách gửi

### Anh cần làm gì?

**Không cần thao tác tay, không cần deploy Mini App, cũng không cần chạy SQL.** Chưa có màn chọn món ở Task 4; màn đó thuộc Task 7. Vì vậy, ở checkpoint này anh chỉ cần đọc và xác nhận 5 quy tắc bên dưới đúng với cách quán muốn vận hành.

1. Khách chỉ gửi món sau khi đặt bàn đã được chủ quán **xác nhận** và trước giờ đến. Quán Bảo Lương phải là mô hình **trả sau + tiền mặt**; quán khác không phù hợp sẽ bị chặn, không tự chuyển sang thanh toán online.
2. Ngay khi khách gửi món, món đặt trước được **chốt ngay**: khách không có nút sửa/hủy và server cũng từ chối mọi lời gọi API sửa/hủy. Không áp dụng cutoff 30 phút cho Bảo Lương.
3. Gửi lại do mất mạng không tạo đơn thứ hai: cùng một lần gửi trả lại cùng bản món. Nếu cùng mã gửi nhưng nội dung khác, hệ thống từ chối thay vì ghi đè.
4. Giá/biến thể/topping do server tự lấy từ menu hiện tại. Khách không thể sửa giá trong request; món hết bán hoặc thuộc quán khác bị từ chối.
5. Gửi lại cùng mã yêu cầu sau lỗi mạng chỉ trả về batch cũ, không tạo đơn trùng; gửi một batch mới thứ hai bị chặn. Sau khi khách đến, món gọi thêm đi qua QR/bill ở Task 8 và không sửa batch đặt trước. Món đặt trước chưa thuộc bàn hay bill nào cho đến khi chủ quán bấm **Khách đã đến** ở Task 5. Nó chưa xuống bếp và chưa tự in; chỉ POS mới release/in ở Task 6.

Nếu cả 5 quy tắc trên đúng ý anh, chỉ cần trả lời **`Task 4 PASS`**. Sau đó em sẽ áp migration `066` lên Supabase và bắt đầu Task 5.

### Codex đã tự kiểm gì?

- Token sai, booking pending, quán sai cấu hình, request trùng nhưng khác nội dung đều bị từ chối.
- Giá do server tính; revision/retry/cutoff chạy qua PGlite thật; anon không đọc trực tiếp được preorder.
- Bảo Lương đang tắt QR gọi món vẫn không làm hỏng preorder; Pubu/QR hiện có giữ nguyên trigger workflow.
- Schema đã chuẩn bị audit phiên bản, print-job và cờ đối soát hao hụt cho Task 5–6, nhưng chưa kích hoạt in/bếp.

**Kết quả Codex:** PGlite Task 4 `6/6 PASS`; hồi quy RPC booking Task 1 `12/12 PASS`; toàn Mini App `61/61 PASS`; `git diff --check` sạch.

`npm run typecheck` vẫn còn 4 lỗi nền đã ghi tại Test 2 (không có lỗi từ type preorder mới). Sẽ xử lý trước nghiệm thu cuối BL-3.

**Nghiệm thu:** ✅ `Task 4 PASS` — anh Tú xác nhận ngày 2026-09-23. Migration `066_reservation_preorders.sql` đã áp dụng lên Supabase.

**Cập nhật sau nghiệm thu:** Quy tắc Bảo Lương đổi thành khóa món ngay sau khi gửi. Migration `071_reservation_preorder_lock_on_submit.sql` có regression test PGlite riêng: sửa, hủy hoặc gửi batch thứ hai đều bị từ chối; retry cùng request id vẫn idempotent.

## Test 5 — Nhận khách, đưa món đặt trước vào bill và hủy có kiểm soát

### Chuẩn bị

Không cần deploy Mini App. Migration `067_reservation_preorder_lifecycle.sql` đã áp dụng trên Supabase.

Chạy Admin Web tại thư mục `D:\Code\mevo\admin-web`:

```powershell
npm run dev
```

Đăng nhập bằng tài khoản **chủ quán Bảo Lương**, rồi mở [http://localhost:3000/admin/reservations](http://localhost:3000/admin/reservations).

### 5A — Hủy đặt bàn từ phía quán

1. Tạo một đặt bàn thủ công bằng nút **+ Tạo đặt bàn**, chọn giờ sắp tới và lưu.
2. Bấm **Xác nhận & chọn bàn**, chọn ít nhất một bàn, rồi bấm **Xác nhận**.
3. Trên card vừa xác nhận, phải có nút **Hủy đặt bàn**.
4. Bấm nút đó: ô **Lý do hủy (bắt buộc)** hiện ra; để trống thì nút hủy cuối cùng bị vô hiệu hóa.
5. Nhập ví dụ `Quán đóng đột xuất`, bấm **Hủy đặt bàn**.
6. Card biến khỏi nhóm “Sắp đến”, chuyển vào “Lịch sử gần đây” với nhãn **Quán đã hủy**. Không thể bấm “Khách đã đến” hay mở bill nữa.

### 5B — Không hồi quy nhận khách thành bill/mâm

1. Tạo thêm một đặt bàn thủ công khác, xác nhận và chọn bàn.
2. Bấm **Khách đã đến**.
3. Card đổi thành **Khách đã đến** và chỉ còn nút **Mở bill trên POS**.
4. Bấm nút đó: chuyển sang `/admin/cashier`; POS hiển thị đúng bàn/mâm vừa nhận khách và có thể tiếp tục nhận đơn QR như trước.

### Những gì đã được kiểm tự động (chưa có màn khách để tạo món thật)

Màn chọn món trước thuộc Task 7, nên hiện chưa thể tạo preorder bằng Mini App để nghiệm thu tay. Phần khó nhất đã chạy bằng PostgreSQL thật trong test:

- Khi **Khách đã đến**, preorder giữ nguyên `order_id`, được gắn vào đúng session/bàn/mâm và vì thế được tính chung khi đóng bill.
- No-show hoặc quán hủy làm preorder đang `pending` chuyển thành `cancelled`, không còn đơn mồ côi ngoài bill.
- Nếu POS đã in preorder, hủy vẫn giữ dữ liệu/audit và gắn cờ `waste_review_required`; không tự in bếp, thanh toán hay hoàn tiền.
- Khách không thể tự hủy đặt bàn khi món đã được release/in; chủ quán vẫn có quyền kết thúc với lý do.
- Hủy món của khách và nhận khách khóa dữ liệu theo cùng thứ tự, tránh deadlock khi hai thao tác diễn ra sát nhau.

**Kết quả Codex:** database/PGlite `25/25 PASS`; Admin Web `355/355 PASS`; Mini App hồi quy `61/61 PASS`; `git diff --check` sạch. Migration `067` đã áp dụng và xác minh có đủ RPC/trigger trên Supabase.

**Nghiệm thu:** Sau khi 5A và 5B đều đúng, trả lời **`Task 5 PASS`**. Em sẽ dừng ở đây chờ anh xác nhận trước khi sang Task 6.

### Cập nhật sau vòng test đầu

5A đã PASS. Vòng 5B đầu tiên phát hiện card đã đến thiếu nút **Mở bill trên POS** dù POS có đúng mâm. Nguyên nhân là queue owner thiếu `session_id`; migration `068_reservation_queue_session_id.sql` đã áp dụng để bổ sung đúng trường này, chỉ cho hàng đợi owner. Anh chỉ cần **tải lại `/admin/reservations`**, làm lại bước 5B và xác nhận card có nút **Mở bill trên POS**.

**Nghiệm thu:** ✅ `Task 5 PASS` — anh Tú xác nhận ngày 2026-09-23.

Task 6 là checkpoint BL-2C riêng trước khi mở UI chọn món đặt trước ở Task 7. Test tại [SPRINT-BL-2C.md](SPRINT-BL-2C.md).

## Test 7 — Chọn và gửi món đặt trước trên Mini App

### Chuẩn bị

1. Deploy instance **Bia lẩu Bảo Lương** từ `D:\Code\mevo\mini-app-instances\bia-lau-bao-luong` sau khi đã merge/cherry-pick commit Task 7.
2. Tạo một booking từ Mini App, sau đó chủ quán xác nhận và chọn bàn ở `/admin/reservations`.
3. Mở lại **Chi tiết đặt bàn** trên chính điện thoại đã tạo booking.

### Anh cần test

1. Booking đã xác nhận hiện hai lựa chọn: **Chọn món trước** và **Gọi sau tại quán**. Bấm Gọi sau chỉ hiện lời nhắn, không tạo đơn.
2. Bấm Chọn món trước: menu mở dù quán đang ngoài giờ gọi món; thêm món thường, món có biến thể/topping. Giỏ chỉ là giỏ đặt trước, không làm xuất hiện giỏ QR/mang về.
3. Vào **Gửi món trước** rồi bấm **Xác nhận đặt trước món**. Sau khi thành công phải hiện đúng thông báo: **“Đã gửi món đặt trước. Món đã chốt, vui lòng gọi thêm tại quán nếu cần.”**
4. Quay lại booking: không có nút sửa/hủy món. Bấm lại đường chọn món cũng không được tạo batch đặt trước thứ hai.
5. Trên POS `/admin/cashier`, booking có đúng một card món chờ chủ quán **Xác nhận & in 2 liên**. Món chưa tự xuống Kitchen Display.
6. Tắt mạng đúng lúc bấm xác nhận, bật lại rồi thử gửi lại: chỉ một batch xuất hiện ở POS, không nhân đôi món.

### Codex đã tự kiểm

- Mini App: `64/64 PASS`, gồm API capability/request-ID và giỏ tách theo booking.
- Server PGlite: `16/16 PASS` cho preorder/lifecycle/release/khóa món; production đã có migration `071`.
- `npm run typecheck` vẫn còn 4 lỗi nền đã ghi ở Test 2; không có lỗi từ file Task 7.

**→ Báo Codex:** `Task 7 PASS` hoặc ảnh/lỗi ở đúng bước bị fail. Không tự chuyển Task 8 trước khi có PASS.
