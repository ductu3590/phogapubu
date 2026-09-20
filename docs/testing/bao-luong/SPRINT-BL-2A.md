# Bảo Lương — Sprint BL-2A: POS và Admin Mobile đặt bàn

**Trạng thái:** ✅ Task 1 PASS · ✅ Task 2 PASS · ✅ Task 3 PASS · ✅ Task 4 PASS · ✅ Task 5 PASS.

BL-2A chỉ làm vận hành đặt bàn trên POS/Admin Mobile. Không có Zalo OA, ZNS, Mini App hoặc món
đặt trước trong Sprint này.

## Task 1 — Queue vận hành, đổi lịch/bàn và Snooze

Đã tạo migration `057_reservation_operations_queue.sql`. Migration này chỉ bổ sung vận hành vào
nền đặt bàn BL-1:

- cột `reminder_snoozed_until`/`reminder_snoozed_by`;
- event audit `reminder_snoozed` và `rescheduled_by_store`;
- RPC queue không làm booking pending/confirmed cũ biến mất;
- RPC đổi lịch/bàn có transaction, giữ bàn cũ nếu bàn mới conflict;
- RPC Snooze 10/15/30 phút, owner-only và audit từng booking.

### Test 1A — Contract tự động

Tại thư mục gốc repo, chạy:

```powershell
$modulePath=(Resolve-Path 'admin-web/node_modules/@electric-sql/pglite/dist/index.js').Path
$env:PGLITE_MODULE=([System.Uri]::new($modulePath)).AbsoluteUri
node --test supabase/tests/057_reservation_operations_queue.test.mjs supabase/tests/054_reservation_operator_flow.test.mjs supabase/tests/052_reservation_foundation.test.mjs supabase/tests/050_pos_gate_service_requests.test.mjs
```

✅ PASS khi đủ **31/31**:

1. Queue vẫn có booking `pending`/`confirmed` đã quá giờ, nhưng không kéo terminal cũ ngoài cửa
   sổ vận hành vào queue.
2. Đổi lịch sang bàn conflict bị chặn và allocation cũ vẫn giữ nguyên; đổi hợp lệ thay bàn đúng
   một lần và có event `rescheduled_by_store`.
3. Snooze chỉ nhận 10/15/30 phút, lưu thời điểm, audit từng booking và chỉ áp dụng booking
   `confirmed`.
4. Staff, owner quán khác và direct `UPDATE reservations` không lách được; `anon` không execute
   RPC mới.
5. Regression BL-0/BL-1: reservation foundation, arrival/mâm/bill và POS gate/Gọi nhân viên đều
   xanh.

### Test 1B — Apply và smoke Supabase thật

**Chưa chạy migration 057 lên Supabase trong Task này.** Sau khi anh đồng ý áp migration, dùng
Supabase MCP hoặc SQL Editor chạy nội dung của
[`057_reservation_operations_queue.sql`](../../../supabase/migrations/057_reservation_operations_queue.sql).

Sau đó chạy SQL chỉ đọc sau để kiểm schema và quyền public:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'reservations'
  AND column_name IN ('reminder_snoozed_until', 'reminder_snoozed_by')
ORDER BY column_name;

SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'list_reservation_queue',
    'reschedule_reservation',
    'snooze_reservation_reminders'
  )
ORDER BY p.proname;
```

✅ PASS khi có đúng hai cột và cả ba RPC có `anon_execute = false`,
`authenticated_execute = true`. Quyền owner vẫn được kiểm trong thân RPC, nên `authenticated`
không đồng nghĩa nhân viên được phép thao tác.

**Không cần tạo booking thật ở production trong Task 1** vì chưa có UI vận hành; không để dữ liệu
test rơi vào queue của quán.

→ Báo Codex: `Task 1 PASS` hoặc gửi nguyên log lỗi. Sau PASS mới làm Task 2 (typed actions,
queue classifier và watcher realtime + polling).

## Task 2 — Typed actions, phân loại queue và watcher chống mất sự kiện

Task này chưa dựng màn hình. Nó tạo một contract dùng chung cho Admin Mobile/POS ở các task sau:

- action owner-only cho queue, tạo tay, xử lý yêu cầu đổi, đổi lịch/bàn và Snooze;
- `ReservationRow` map thêm hai trường Snooze từ RPC;
- một classifier thuần TypeScript cho pending/sắp đến/quá giờ/đã đến/kết thúc;
- watcher `reservations` có realtime, polling 2 giây, refresh khi focus/online/reconnect và revision
  guard chống snapshot cũ ghi đè event mới.

### Test 2A — Action và queue logic tự động

Tại `admin-web`, chạy:

```powershell
npm test -- --run lib/actions/reservations.test.ts lib/reservation-queue.test.ts lib/reservation-queue-watcher.test.ts
npm run lint -- lib/actions/reservations.ts lib/reservation-queue.ts lib/reservation-queue-watcher.ts
npx tsc --noEmit
```

✅ PASS khi đủ **18/18**, lint không có lỗi và TypeScript không in lỗi. Nhóm test chứng minh:

1. Action chỉ lấy `storeId` từ operator; staff bị chặn trước RPC; payload tạo tay/list có scope
   đúng, còn thao tác theo reservation không nhận store từ browser.
2. Quá giờ từ 30 phút là cảnh báo đỏ; Snooze/pending/arrived/terminal không sinh nhắc; sort không
   mutate snapshot gốc.
3. Polling vẫn tải queue mỗi 2 giây khi socket im lặng; reconnect/focus tải lại; event chen vào
   request làm snapshot cũ bị bỏ; dispose dừng timer/listener/channel.

**Không cần deploy hoặc mở UI ở Task 2.** Đây là lớp contract nội bộ được Task 3 sử dụng.

✅ **Task 2 PASS** — đã nghiệm thu.

→ Sau PASS làm Task 3 (màn Admin Mobile chỉ đọc có đồng bộ realtime).

## Task 3 — Admin Mobile: hàng đợi đặt bàn chỉ đọc

Task này thêm mục **Đặt bàn** vào Admin chỉ khi quán bật `reservations_enabled`; route cũng kiểm
lại capability và quyền owner để URL trực tiếp không lộ dữ liệu quán chưa dùng mô hình này.

Trang `/admin/reservations` có:

- đồng bộ realtime, polling 2 giây, và tự tải lại khi quay lại tab/online;
- nhóm Chờ duyệt, Khách yêu cầu đổi, Quá giờ chưa đến, Sắp đến, Đã đến và Lịch sử gần đây;
- lọc ngày chỉ áp dụng lịch sắp tới/lịch sử — việc chưa xử lý luôn hiện;
- số liệu nhanh, badge cảnh báo và link `tel:` **Gọi khách** an toàn;
- trạng thái rỗng/lỗi rõ ràng.

Đây vẫn là màn **chỉ đọc**: chưa có Xác nhận, chọn bàn, Khách đã đến hay tạo đặt bàn tay. Những
thao tác đó thuộc Task 4.

### Test 3A — Tự động

Tại `admin-web`, chạy:

```powershell
npm test -- --run app/admin/admin-nav.test.tsx app/admin/reservations/reservation-ui.test.ts app/admin/reservations/reservation-card.test.tsx lib/reservation-queue.test.ts lib/reservation-queue-watcher.test.ts
npx tsc --noEmit
npm run build
```

✅ PASS khi đủ **16/16**, TypeScript không lỗi và build có route `ƒ /admin/reservations`.

### Test 3B — Owner, capability và responsive

**Điều kiện:** migration `057_reservation_operations_queue.sql` đã được apply trước khi mở route;
nếu Test 1B chưa chạy, thực hiện Test 1B trước. Chạy Admin Web rồi đăng nhập owner Bảo Lương.

1. Tại `/admin/dashboard`, sidebar có đúng mục **Đặt bàn** trong nhóm Vận hành. Mở
   `/admin/reservations`; xem cả viewport 390px và desktop: header, bộ lọc ngày, trạng thái kết
   nối và empty state không tràn ngang.
2. Mở cùng URL bằng owner Pubu: sidebar không có **Đặt bàn** và route tự về dashboard Pubu.
3. Tắt `reservations_enabled` của Bảo Lương tại Settings, refresh trang: mục nav biến mất và URL
   `/admin/reservations` về dashboard; bật lại thì mục quay lại.
4. Khi queue có booking (dữ liệu BL-1 hoặc dữ liệu test), card phải hiện tên, giờ Việt Nam, số
   khách/gợi ý số bàn/bàn đang giữ, badge và nút **Gọi khách**. Kiểm link nút bắt đầu bằng
   `tel:`; Task 3 chưa hiện nút xác nhận hay chọn bàn.
5. Với tab `/admin/reservations` để nền, tạo/cập nhật một booking từ một tab/hệ thống test khác:
   queue tự cập nhật không F5. Nếu socket bị chậm, polling tối đa khoảng 2 giây vẫn phải tải lại.
   Đổi bộ lọc sang ngày khác: booking pending, yêu cầu đổi, quá giờ và đã đến không được biến mất.

→ Báo Codex: `Task 3 PASS` hoặc gửi bước FAIL kèm ảnh/log. Sau PASS mới làm Task 4.

### Test 3C — Regression mobile shell (bổ sung 2026-09-20)

**Kết quả cũ:** Test 3A PASS. Test 3B mục 1 FAIL: sidebar desktop rộng 240px vẫn hiện ở
viewport 390px, làm nội dung đặt bàn chỉ còn khoảng 150px. Mục 2/3 PASS hoặc được bỏ qua theo
ghi nhận; mục 4/5 chưa có booking Mini App để tạo dữ liệu thật.

Đã sửa layout dùng chung `/admin`: sidebar desktop chỉ hiện từ `md`; điện thoại có thanh đầu trang
và drawer **Menu**, vì vậy mọi route Admin nhận đủ chiều rộng màn hình. Đây là regression fix của
Task 3, không mở thêm mutation đặt bàn.

1. Mở `/admin/reservations` ở viewport **390px**: không còn sidebar desktop bên trái; nội dung
   chiếm toàn bộ chiều rộng, card/bộ lọc không bị cắt hay tràn ngang.
2. Bấm biểu tượng Menu góc phải: drawer mở, có các link Admin và **Đặt bàn**; bấm một link hoặc
   nút X/lớp nền thì drawer đóng. Nút đăng xuất vẫn có trong drawer.
3. Mở lại viewport desktop (`≥768px`): sidebar cũ vẫn hiện, không xuất hiện thanh Menu mobile.

→ Báo Codex: `Task 3C PASS` hoặc gửi ảnh bước FAIL. Chỉ sau PASS mới chuyển Task 4.

### Test 3D — Thu gọn sidebar desktop (bổ sung 2026-09-20)

Tại viewport desktop (`≥768px`), mở `/admin/cashier` hoặc `/admin/reservations`:

1. Sidebar đang mở có icon ở góc trên phải. Bấm icon: sidebar biến mất hoàn toàn và vùng POS/nội
   dung giãn thêm khoảng 240px; icon mở sidebar vẫn thấy ở mép trái.
2. Bấm icon ở mép trái: sidebar và toàn bộ navigation trở lại đúng như trước.
3. F5: sidebar mặc định mở lại. Đây là chủ ý — trạng thái chỉ thuộc tab hiện tại, không ghi DB hay
   tạo cấu hình riêng cho quán.
4. Ở viewport 390px: không thấy icon desktop; header + drawer Menu của Test 3C vẫn hoạt động.

→ Báo Codex: `Task 3D PASS` hoặc gửi ảnh bước FAIL. Chỉ sau PASS mới chuyển Task 4.

✅ **Task 3 PASS** — Test 3A, 3C và 3D đã nghiệm thu. Hai kiểm tra Test 3B mục 4–5 cần dữ liệu
booking thật sẽ được lặp lại trong lifecycle Task 4, khi màn tạo/xác nhận đặt bàn đã có.

## Task 4 — Thao tác owner trên Admin Mobile

Owner Bảo Lương nay có thể tạo đặt bàn tay, chọn bàn theo khu vực, xác nhận/từ chối, xử lý yêu cầu
đổi, đổi lịch/bàn, nhận khách và đánh dấu no-show ngay tại `/admin/reservations`. Bộ chọn bàn tải
lại sơ đồ + phiên đang mở trước khi mở sheet; DB vẫn là lớp cuối chống race.

### Test 4A — Tự động

Tại `admin-web`, chạy:

```powershell
npm test -- --run app/admin/reservations/reservation-table-picker.test.ts app/admin/reservations/reservation-form.test.ts app/admin/reservations/reservation-card.test.tsx app/admin/reservations/reservation-ui.test.ts lib/actions/reservations.test.ts lib/reservation-queue.test.ts lib/reservation-queue-watcher.test.ts
npx tsc --noEmit
npm run build
```

✅ PASS khi đủ **34/34**, TypeScript không lỗi và build có `ƒ /admin/reservations`.

### Test 4B — Lifecycle trên Admin Mobile/POS

Đăng nhập owner Bảo Lương, mở `/admin/reservations` tại viewport 390px. Giữ thêm một tab owner
thứ hai để thử race. Các tạo đặt bàn tay dưới đây được phép ngoài giờ/ngoài slot theo đúng policy.

1. **Tạo tay:** bấm `+ Tạo đặt bàn`, nhập tên, điện thoại, số khách, giờ đến, lý do và lưu. Card
   xuất hiện `Chờ duyệt` không cần F5. Bỏ trống từng field bắt buộc phải báo lỗi tiếng Việt.
2. **Xác nhận + chọn bàn:** mở card pending → `Xác nhận & chọn bàn`. Bàn đang có phiên báo `Đang
   có khách`, bàn đã giữ cho booking khác báo đúng lý do; số bàn gợi ý chỉ là hint. Chọn 1+ bàn,
   xác nhận: card thành `Đã xác nhận`, ghi đúng tên bàn. Từ chối một card pending khác: sang
   lịch sử gần đây.
3. **Race/giữ bàn:** tạo hai booking khác nhau, ở hai tab cùng chọn một bàn rồi lưu. Chỉ một tab
   thành công; tab còn lại giữ sheet và hiển thị lỗi conflict. Chờ ít nhất 10 giây/polling: lỗi
   action vẫn còn cho tới khi bấm Đóng hoặc thao tác khác.
4. **Đổi lịch/bàn:** booking đã xác nhận → `Đổi lịch/bàn`, đổi giờ/số khách/bàn và bắt buộc điền
   lý do. Thử đổi sang bàn đang có khách/đang giữ: server từ chối và booking vẫn giữ bàn cũ. Đổi
   hợp lệ: giờ, số khách, bàn mới cập nhật ở cả hai tab không F5.
5. **Yêu cầu đổi:** với booking `change_requested` từ fixture BL-1, sheet có cả `Chấp nhận thay
   đổi` và `Từ chối thay đổi`; kiểm chọn bàn rồi chấp nhận, hoặc từ chối kèm ghi chú. Cả hai cập
   nhật queue không F5.
6. **Nhận khách/no-show:** card confirmed → `Khách đã đến`; bấm cùng lúc ở hai tab thì chỉ một
   `table_session`/mâm được tạo. Card thành `Khách đã đến`, có `Mở bill trên POS`. Với booking
   confirmed khác, `Không đến` chuyển card sang lịch sử; không làm thay đổi booking khác.
7. **Regression Task 3B:** card có tên, giờ Việt Nam, số khách, bàn, badge, `tel:` Gọi khách;
   tạo/cập nhật từ tab kia hiện trong tối đa khoảng 2 giây khi tab này ở nền. Pubu vẫn không thấy
   mục/route Đặt bàn.

→ Báo Codex: `Task 4 PASS` hoặc gửi bước FAIL kèm ảnh/log. Sau PASS mới làm Task 5.

✅ **Task 4 PASS** — đã nghiệm thu lifecycle owner trên Admin Mobile/POS.

### Test 4C — Regression khóa bàn đúng khung giờ (bổ sung 2026-09-20)

**Nguyên nhân đã sửa:** UI trước đây khóa mọi bàn của booking `confirmed` trong toàn bộ queue 7 ngày,
trong khi DB chỉ chặn hai khoảng giữ thực sự chồng nhau. Migration
[`058_reservation_queue_hold_window.sql`](../../../supabase/migrations/058_reservation_queue_hold_window.sql)
đã được áp lên Supabase; queue nay trả `planning_hold_minutes` snapshot để UI dùng cùng luật 3 giờ
(hoặc cấu hình snapshot của booking) với server.

1. Tạo/xác nhận booking A vào **20/09 lúc 11:00**, giữ Bàn 1. Mở tạo/xác nhận booking B vào
   **21/09 lúc 11:00**: Bàn 1 phải chọn được; không hiện `Đã giữ cho booking khác`.
2. Tạo/xác nhận booking C vào **20/09 lúc 12:30**: Bàn 1 phải bị khóa với nhãn
   `Đã giữ cho booking khác`, vì đang chồng khoảng giữ 11:00–14:00 của booking A.
3. Lưu booking B. Nếu có race do tab/máy khác giữ cùng thời điểm, server vẫn là lớp quyết định cuối
   và báo lỗi conflict; không được xuất hiện lỗi giả giữa hai ngày không chồng nhau.

→ Báo Codex: `Task 4C PASS` hoặc gửi ảnh/log bước FAIL. Sau PASS mới làm Task 5.

✅ **Task 4C PASS** — đã nghiệm thu regression khóa bàn đúng khung giờ.

---

## Task 5 — Queue đặt bàn trên POS

POS chỉ hiện queue này khi quán bật capability `reservations_enabled`. Luồng chọn bàn cho booking
được tách khỏi chọn/gộp bill: bill đang mở được giữ nguyên trong nền, nhưng không thể thao tác cho
đến khi xác nhận hoặc hủy chọn bàn.

### Test 5A — Tự động

Tại `admin-web`, chạy:

```powershell
npm test -- --run app/admin/cashier/reservation-pos-state.test.ts app/admin/cashier/reservation-queue-panel.test.tsx lib/table-layout.test.ts lib/table-status.test.ts lib/cashier-error-state.test.ts lib/actions/reservations.test.ts
npm test
npx tsc --noEmit
npm run build
```

✅ PASS khi tất cả test xanh, TypeScript không lỗi và build có route `ƒ /admin/cashier`.

### Test 5B — Queue và chọn bàn trên POS

Đăng nhập **owner Bảo Lương** trên desktop, mở `/admin/cashier`. Mở thêm một tab owner thứ hai để
thử race. Chuẩn bị ít nhất một bill/mâm đang mở và hai booking `pending` ở các giờ còn hợp lệ.

1. **Capability:** tại Bảo Lương, trên đầu POS có dải `📅 Đặt bàn cần xử lý`; chỉ có pending,
   booking confirmed sắp đến trong 3 giờ và booking quá giờ. Bấm `Mở mọi đặt bàn` đi tới
   `/admin/reservations`. Tại Pubu (tắt capability), cả dải và dữ liệu booking không xuất hiện.
2. **Không mất bill:** mở một bill/mâm, tick thêm một bàn trống để chuẩn bị ghép mâm. Bấm
   `Xác nhận & chọn bàn` cho booking pending: panel bill đổi sang panel xanh `Xác nhận đặt bàn`,
   sơ đồ có thể chọn bàn nhưng không kéo bàn, không chọn/gộp bill và không mở `Đơn mới`/`Gọi nhân
   viên`. Bấm `Hủy`: bill/mâm và các lựa chọn ghép mâm cũ trở lại nguyên trạng.
3. **Chọn bàn đúng luật:** trong panel xanh, bàn đang có phiên mờ đi, hover thấy `Bàn đang có khách`;
   bàn được booking khác giữ trong khoảng thời gian chồng nhau mờ đi, hover thấy `Đã giữ cho booking
   khác`. Bàn đã chọn của booking có viền xanh. Đổi tab khu vực nếu cần rồi chọn 1 hoặc nhiều bàn;
   nút `Xác nhận bàn` chỉ bật sau khi có ít nhất một bàn.
4. **Xác nhận/race:** xác nhận booking → card biến thành `Đã xác nhận`, hiện đúng các bàn; POS trở
   về bill ban đầu. Ở tab owner thứ hai thử xác nhận booking khác cùng bàn: chỉ một lần thành công;
   lần còn lại giữ panel xanh và hiện lỗi server, không làm mất trạng thái bill cũ.
5. **Khách đến:** booking confirmed bấm `Khách đã đến` → POS tải lại phiên bàn rồi mở đúng bill/mâm
   mới tạo. Bấm đồng thời ở hai tab: chỉ một phiên/mâm được tạo, cả hai tab sau đồng bộ đều mở đúng
   bill đó. Với booking nhiều bàn, tên bill/mâm phải chứa đủ các bàn đã phân.
6. **Hồi quy POS:** sau khi hủy panel hoặc nhận khách, thực hiện lại các thao tác cũ: khách QR đặt
   món → POS thấy đơn chờ/xác nhận & in; `Gọi nhân viên` hiện/xử lý queue; tạo mâm, thêm bàn, gộp
   bill, thu tiền và bỏ bàn. Không thao tác nào được phép bị kẹt sau khi rời chế độ booking.

→ Báo Codex: `Task 5 PASS` hoặc gửi bước FAIL kèm ảnh/log. Sau PASS mới làm Task 6.

✅ **Task 5 PASS** — đã nghiệm thu queue và chọn bàn trên POS.

---

## Task 6 — Nhắc đặt bàn 5 phút và Snooze

POS và Admin Mobile cùng dùng một coordinator theo `store_id` + bucket 5 phút. Booking đến giờ
được gộp một banner; chuông chỉ chạy sau tương tác đầu tiên mở được audio. Booking `arrived`,
`no_show`, bị hủy hoặc đang Snooze không còn nằm trong banner; quá 30 phút vẫn đỏ nhưng hệ thống
không tự đổi trạng thái.

### Remote migration/RPC đã kiểm

Kiểm trên Supabase ngày 20/09: cột `reservations.reminder_snoozed_until` và RPC
`snooze_reservation_reminders(uuid[], integer)` **đang tồn tại**; `anon` không có EXECUTE,
`authenticated` có EXECUTE để RPC tự kiểm owner. Tuy nhiên bảng migration không có dòng tên
`057_reservation_operations_queue`, dù chức năng của migration này đã có trên schema. **Không áp
lại 057 tự động**; cần đối chiếu/ghi nhận lịch sử migration riêng trước migration DB tiếp theo.

### Test 6A — Tự động

Tại thư mục gốc repo, chạy:

```powershell
$modulePath=(Resolve-Path 'admin-web/node_modules/@electric-sql/pglite/dist/index.js').Path
$env:PGLITE_MODULE=([System.Uri]::new($modulePath)).AbsoluteUri
node --test supabase/tests/057_reservation_operations_queue.test.mjs supabase/tests/054_reservation_operator_flow.test.mjs supabase/tests/052_reservation_foundation.test.mjs supabase/tests/049_store_workflow_settings.test.mjs supabase/tests/050_pos_gate_service_requests.test.mjs

cd admin-web
npm test
npx tsc --noEmit
npm run build
npx eslint lib/reservation-reminders.ts lib/reservation-reminders.test.ts lib/bell.ts app/admin/reservations/reservation-reminder-banner.tsx app/admin/reservations/reservation-reminder-banner.test.tsx app/admin/reservations/reservation-card.tsx app/admin/reservations/reservation-card.test.tsx app/admin/reservations/reservations-client.tsx app/admin/cashier/reservation-queue-panel.tsx app/admin/cashier/cashier-client.tsx
```

✅ PASS khi DB **45/45**, Admin Web **319/319**, TypeScript/build và lint các file Task 6 đều xanh.

> `npm run lint` toàn repo hiện vẫn fail do 13 lỗi cũ ngoài Task 6 ở `menu-client`, Kitchen,
> Privacy và Terms; không có lỗi lint trong file Task 6. Không gộp các lỗi cũ này vào task hiện tại.

### Test 6B — Nhắc gộp, Snooze và đồng bộ

Đăng nhập owner Bảo Lương. Mở đồng thời `/admin/reservations` (có thể viewport 390px) và
`/admin/cashier`; để thêm một tab thứ hai hoặc một máy khác ở nền.

1. Tạo/xác nhận **hai booking đã quá giờ**. Cả Admin Mobile lẫn POS hiện **một** banner
   `⏰ 2 đặt bàn đã tới giờ`; không có hai chuông/card nhắc riêng lẻ. Click/chạm một lần bất kỳ để
   cho phép âm thanh: trong cùng 5 phút chỉ nghe tối đa một chuông trên mỗi tab.
2. Giữ hai tab mở, để watcher polling/realtime chạy trong ít nhất 10 giây: banner không tự biến
   mất và không kêu lặp trong bucket 5 phút đó. Qua bucket 5 phút kế tiếp, vẫn chưa xử lý → nhắc
   lại đúng một lần; không có ý nghĩa giục khách ăn nhanh.
3. Tại POS bấm `Nhắc lại sau 10 phút`; banner biến mất ở POS và Admin Mobile không cần F5 (tối đa
   khoảng 2 giây). Kiểm từng booking có `reminder_snoozed_until` mới và event `reminder_snoozed`.
   Lặp với 15 và 30 phút. Hết Snooze, banner xuất hiện/được phép nhắc lại.
4. Trên card quá giờ của Admin Mobile có `Nhắc lại 10 phút`; bấm nút này chỉ Snooze booking đó.
   Trong lúc RPC chạy, nút bị khóa; booking Snooze không còn banner/card Snooze cho đến khi hết hạn.
5. Bấm `Khách đã đến`, `Không đến` hoặc hủy booking quá giờ từ tab khác: banner biến mất ở mọi
   tab; hệ thống không tự no-show/hủy bất kỳ booking nào. Booking quá 30 phút chuyển cảnh báo đỏ
   nhưng vẫn chờ chủ quán quyết định.

### Test 6C — Reconnect, quyền và cross-store

1. Để Admin Mobile/POS ở tab nền, tắt mạng vài giây rồi bật lại; queue/banner phải tải lại khi
   online/focus, không mất booking đã quá giờ hoặc trạng thái Snooze.
2. Mở owner Pubu: không có reservation queue/banner và không phát chuông đặt bàn. Mở bằng
   `store_staff`, owner quán khác hoặc anon gọi thẳng `snooze_reservation_reminders`: bị từ chối;
   không cập nhật `reminder_snoozed_until`, không sinh event. Owner Bảo Lương vẫn Snooze được.
3. Nếu mở Bảo Lương và quán khác trên cùng trình duyệt, mỗi quán dùng khóa chuông riêng — một quán
   đã nhắc không được làm quán còn lại mất nhắc. Storage bị chặn/private mode không làm màn trắng;
   banner vẫn hiển thị.

### Test 6D — Hồi quy vận hành cuối BL-2A

1. Bảo Lương: tạo tay, xác nhận/chọn bàn, race giữ bàn, đổi lịch, nhận khách/no-show và mở bill
   từ Task 4–5 vẫn chạy. QR gọi món, POS xác nhận/in, `Gọi nhân viên`, mâm, ghép bill, thu tiền và
   bỏ bàn không bị kẹt sau Snooze/banner.
2. Pubu: root Mini App, QR, Mang về/Ship, đơn trả trước và Kitchen giữ nguyên; không thấy đặt bàn
   hay banner reservation.
3. Chỉ sau khi 6A–6D đều PASS mới báo **`BL-2A PASS`**. Không chuyển BL-2B hoặc BL-3 trước đó.

→ Báo Codex: `BL-2A PASS` hoặc gửi bước FAIL kèm ảnh/log.
