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
2. Bấm Chọn món trước: menu mở dù quán đang ngoài giờ gọi món. Với món thường, dùng cụm **− / số lượng / +** để kiểm soát số lượng; món có biến thể/topping vẫn mở lựa chọn. Giỏ chỉ là giỏ đặt trước, không làm xuất hiện giỏ QR/mang về.
3. Vào **Gửi món trước** rồi bấm **Xác nhận đặt trước món**. Sau khi thành công phải hiện đúng thông báo: **“Đã gửi món đặt trước. Món đã chốt, vui lòng gọi thêm tại quán nếu cần.”**
4. Quay lại booking: không có nút sửa/hủy món. Bấm lại đường chọn món cũng không được tạo batch đặt trước thứ hai.
5. Trên POS `/admin/cashier`, booking có đúng một card món chờ chủ quán **Xác nhận & in 2 liên**, ghi đúng bàn đã được phân bổ và giờ đến, kể cả bàn đó đang có bill của khách hiện tại. Món chưa tự xuống Kitchen Display.
6. In xong: card rời **Món đặt trước cần xử lý**, xuất hiện gọn trong **Đã duyệt/in hôm nay**; vẫn thấy bàn và tổng để đối soát.
7. Tắt mạng đúng lúc bấm xác nhận, bật lại rồi thử gửi lại: chỉ một batch xuất hiện ở POS, không nhân đôi món.

### Codex đã tự kiểm

- Mini App: `65/65 PASS`, gồm API capability/request-ID, giỏ tách theo booking và tăng/giảm số lượng.
- Server PGlite: `16/16 PASS` cho preorder/lifecycle/release/khóa món; production đã có migration `071`.
- `npm run typecheck` vẫn còn 4 lỗi nền đã ghi ở Test 2; không có lỗi từ file Task 7.

**Nghiệm thu:** ✅ `Task 7 PASS` — anh Tú xác nhận ngày 2026-09-23.

## Test 8 — QR bàn đã giữ, mâm và gọi thêm an toàn

### Chuẩn bị

1. Deploy đúng instance **Bia lẩu Bảo Lương** sau commit Task 8; migration `073_reservation_table_ordering` đã có trên Supabase.
2. Chủ quán xác nhận một booking và phân một bàn có giờ giữ đang hiệu lực.

### Anh cần test

1. Khi chưa bấm **Khách đã đến**, quét QR của bàn đã giữ: chỉ hiện **“Bàn đã được đặt trước. Vui lòng báo chủ quán để mở bàn.”** và nút **Gọi nhân viên**. Không hiện nút thêm món/giỏ; bấm gọi nhân viên vẫn thành công.
2. Booking của ngày mai hoặc ngoài khoảng giờ giữ không khóa QR hôm nay.
3. Chủ quán bấm **Khách đã đến** cho booking nhiều bàn: mở QR bất kỳ bàn nào trong mâm, menu hoạt động; gọi thêm từ hai máy/bàn đều về cùng một bill/mâm trên POS.
4. Trước khi gửi món gọi thêm trùng hoàn toàn món đã đặt trước hoặc đã gọi (cùng biến thể/topping), Mini App hiện cảnh báo. Bấm **Kiểm tra lại** thì chưa tạo đơn; bấm **Vẫn gọi thêm** thì đơn vẫn được tạo đúng một lượt.
5. Tắt mạng đúng lúc bấm gọi món, bật lại rồi bấm lại với giỏ không đổi: POS chỉ có một batch mới. Đóng bill hoặc để chủ quán đổi phiên giữa lúc đang chọn món: Mini App phải báo cần kiểm tra lại, không tự gửi giỏ cũ vào phiên mới.
6. Regression Pubu: QR Pubu vẫn tạo/thanhtoán đơn như cũ, không có banner đặt bàn hoặc yêu cầu POS xác nhận của Bảo Lương.

### Codex đã tự kiểm

- Mini App: `67/67 PASS` (API batch QR và đối sánh món trùng).
- SQL contract: `3/3 PASS`; migration `073` đã áp dụng và kiểm tra RPC/table tồn tại trên Supabase.
- `npm run typecheck` còn đúng 4 lỗi nền BL-3 ở `SnackbarProvider`, `app-config.json`, và cast category; Task 8 không phát sinh lỗi typecheck mới.

**Nghiệm thu:** ✅ `Task 8 PASS` — anh Tú xác nhận ngày 2026-09-24.

## Test 9 — Gọi nhắc khách trước giờ đến 60 phút

### Chuẩn bị

Migration `074_reservation_customer_call_tasks` đã áp dụng. Chạy Admin Web từ `D:\Code\mevo\admin-web` bằng `npm run dev`, đăng nhập tài khoản chủ quán Bảo Lương.

### Anh cần test

1. Tạo đặt bàn thủ công tại `/admin/reservations`, chọn giờ đến **trong 60 phút tới**, xác nhận và chọn bàn. Nếu chọn giờ đến còn xa hơn 60 phút, task chưa hiện là đúng.
2. Với booking trong 60 phút, tải lại `/admin/reservations` hoặc `/admin/cashier`: xuất hiện khung **☎️ Gọi nhắc khách** với tên, số khách, giờ đến và ba nút **Gọi nhắc khách**, **Đã gọi**, **Chưa liên hệ được**.
3. Bấm **Gọi nhắc khách**: ứng dụng mở cuộc gọi từ số khách. Quay lại màn hình: task vẫn còn; hệ thống không tự coi cuộc gọi là thành công.
4. Bấm **Đã gọi**: task biến mất ở cả `/admin/reservations` và POS sau khi tải lại/tối đa 15 giây. Lặp lại cùng thao tác không tạo thêm audit hoặc task mới.
5. Lặp lại với **Chưa liên hệ được**: task cũng rời hàng đợi nhưng được ghi kết quả khác trong audit. Không có tin Zalo/SMS nào được gửi cho khách.
6. Tạo booking đã xác nhận trong 60 phút, sau đó đổi giờ hoặc bấm **Khách đã đến** / **Không đến** / **Hủy đặt bàn**: task cũ không còn hiện. Đổi sang giờ mới trong 60 phút tạo task theo giờ mới; đổi xa hơn 60 phút thì task sẽ chỉ hiện khi đến hạn.
7. Đăng nhập staff hoặc owner quán khác: không truy cập được trang đặt bàn; gọi RPC trực tiếp cũng không được xem/đóng task của Bảo Lương.

### Codex đã tự kiểm

- Migration Task 9 contract `3/3 PASS`; migration `074` đã áp dụng và xác minh table, trigger, hai RPC có trên Supabase.
- Admin Web `362/362 PASS`; component gọi nhắc có test riêng, bao gồm `tel:` không tự hoàn tất.
- Task này không thêm chuông lặp, không thay đổi Snooze 10/15/30 phút của nhắc khách đã tới giờ, và không gửi ZCA/OA/ZNS cho khách.

**Nghiệm thu:** Khi 7 mục trên đúng, trả lời **`Task 9 PASS`**. Em sẽ dừng chờ anh trước Task 10.

**Nghiệm thu:** ✅ `Task 9 PASS` — anh Tú xác nhận ngày 2026-09-24.

### Hồi quy sau Task 9 — ưu tiên bàn đã đặt trước

Migration `075_reservation_prearrival_table_lock` đã áp dụng. Tạo/đổi một booking xác nhận có giờ đến trong 60 phút, chọn Bàn 9. Trên POS Bàn 9 phải có biểu tượng 📅, nhãn **đã giữ** và không thao tác như bàn trống. Quét QR Bàn 9 từ máy khác chỉ thấy yêu cầu báo chủ quán mở bàn; không thêm món hay mở bill mới. Sau khi bấm **Khách đã đến**, nhãn giữ biến mất và QR hoạt động với đúng mâm/bill. Booking xa hơn một giờ vẫn không khóa QR/POS sớm.

**Bổ sung trường hợp đã có phiên cũ:** Nếu Bàn 9 đã có một phiên mở trước khi bước vào 60 phút giữ bàn, QR vẫn phải hiện bàn đã được đặt trước và không tạo thêm món. POS không tự đóng phiên cũ; chủ quán xử lý khách đang ngồi theo thực tế.

## Test 10 — Từ chối đơn chờ xác nhận tại POS

### Chuẩn bị

Migration `077_pos_reject_pending_order` đã áp dụng. Chạy Admin Web từ `D:\Code\mevo\admin-web` bằng `npm run dev`, đăng nhập owner Bảo Lương và tạo một đơn QR mới để đơn nằm ở trạng thái chờ xác nhận.

### Anh cần test

1. Trong thanh **Đơn mới**, đơn pending có cả **Từ chối** và **Xác nhận & in**. Mở bill bàn đó: khung **Đơn chờ xác nhận** cũng có nút **Từ chối**.
2. Bấm **Từ chối**: hộp chọn hiện đủ **Hết đồ**, **Bếp quá tải**, **Đơn trùng**, **Khách yêu cầu huỷ**, **Lý do khác**. Chọn **Lý do khác** nhưng chưa nhập thì nút xác nhận bị vô hiệu hóa.
3. Chọn **Hết đồ** rồi **Xác nhận từ chối**: không mở cửa sổ in, đơn rời hàng đợi chờ xác nhận, tổng bill giảm đúng phần đơn vừa từ chối và bàn/phiên vẫn mở để khách gọi lại.
4. Trên Mini App, khách có thể gọi một đơn mới sau đó; đơn mới lại về POS chờ xác nhận bình thường. Đơn cũ không sống lại và không bị tính vào bill.
5. Với một đơn khác, bấm **Xác nhận & in** trước rồi thử thao tác từ một tab POS cũ: server phải báo chỉ được từ chối đơn đang chờ xác nhận, không huỷ đơn đã in.
6. Đăng nhập staff: giao diện staff không có quyền từ chối; gọi RPC trực tiếp cũng nhận lỗi **Chỉ chủ quán mới được từ chối đơn**.

### Codex đã tự kiểm

- Test TDD Admin Web `6/6 PASS`, gồm action, payload RPC, quyền và hai vị trí nút.
- PostgreSQL/PGlite `4/4 PASS`, gồm audit, idempotency, chặn staff, chặn đơn đã xác nhận và preorder.
- Toàn bộ Admin Web `368/368 PASS`; TypeScript và production build đều sạch.

**Nghiệm thu:** ✅ `Task 10 PASS` — anh Tú xác nhận ngày 2026-09-24.
