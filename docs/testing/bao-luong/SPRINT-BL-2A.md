# Bảo Lương — Sprint BL-2A: POS và Admin Mobile đặt bàn

**Trạng thái:** ✅ Task 1 PASS · ✅ Task 2 PASS · ✅ Task 3 PASS.

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
