# Bảo Lương — Sprint BL-4

## Test 1 — Đồng bộ POS khi mạng chậm

### Codex đã chạy

- ✅ Watcher đặt bàn và Gọi nhân viên vẫn áp snapshot sau khi request chậm hơn chu kỳ polling; event đến trong lúc tải chỉ đánh dấu cần tải lại, không làm snapshot bị bỏ vô hạn.
- ✅ Cashier session watcher không chồng nhiều lần tải; khi request đang chạy, event/poll được gộp và chạy một lượt sau khi request hiện tại hoàn tất.
- ✅ Cashier watcher refresh khi kết nối lại, focus, online và quay lại tab; dispose gỡ timer/listener/channel.
- ✅ Admin Web: `61` file test, `370/370 PASS`.
- ✅ TypeScript: `npx tsc --noEmit --pretty false` PASS.
- ✅ Production build: `npm run build` PASS.

### Anh Tú cần test tay — Test 1A

1. Mở `/admin/cashier` và `/staff/tables` cùng lúc. Gọi **Gọi nhân viên** từ Mini App; không F5, không bấm lại tab. Card phải xuất hiện ở POS/staff.
2. Khi đang có request, đổi tab hoặc giả lập mạng chậm. Khi quay lại, danh sách bàn/đơn phải hội tụ đúng dữ liệu mới; không mất card.
3. Bấm **Đã xử lý** hoặc xác nhận một thao tác trên POS trong lúc đang tải. Kết quả đã xử lý không được xuất hiện lại sau khi request cũ hoàn tất.

### Test 1B — tab nền/mạng chậm

1. Để POS ở tab riêng, chuyển sang tab khác ít nhất 5 phút rồi quay lại.
2. Ghi thời gian từ lúc quay lại đến khi card/bàn mới xuất hiện; không yêu cầu đúng một con số cố định, chỉ cần không phải F5 và ghi lại số đo thực tế.
3. Tắt/mở mạng một lần. Lỗi phải giữ nguyên trên màn hình; khi mạng trở lại, dữ liệu tự hồi phục.

### Test 1C — giới hạn phạm vi

- Chưa cần deploy Mini App mới; Task 1 chỉ thay đổi Admin Web.
- Bảo Lương vẫn duyệt/in phiếu giấy từ POS; không thêm bước Kitchen Display.
- Pubu vẫn giữ luồng Kitchen/đơn trả trước hiện tại.

**Nghiệm thu:** ✅ `Task 1 PASS` — anh Tú xác nhận ngày 2026-09-29. Codex đã commit thay đổi Task 1; chưa chuyển Task 2.

## Test 2 — Nghiệp vụ tuần tự và PostgreSQL đồng thời

### Codex đã chạy

- ✅ `npm run test:bl4:sequential`: **45/45 PASS**; có hồi quy cho migration 078 và order source QR thật `customer_zalo`.
- ✅ Admin Web hồi quy: **370/370 PASS**.
- ✅ Harness có preflight marker/hostname, phiên bản PostgreSQL, hai PID riêng, quan sát `pg_blocking_pids`, timeout và chặn outbound transport.
- ✅ Anh Tú đã chạy bản integration ban đầu trên PostgreSQL **17.6**: `BL-4 PostgreSQL concurrency PASS: reservation lock 36666 -> 36667`. Ca này xác nhận được một lock thật, chưa đại diện cho toàn ma trận Task 2.
- ✅ PostgreSQL lần chạy ma trận đầu phát hiện lỗi thật: release preorder không khóa booking trước order nên khách có thể hủy sau khi quán duyệt; trigger khóa bàn so sai `order_source` (`customer` thay vì `customer_zalo`), làm QR dùng session cũ vẫn gửi món được. Rà soát bổ sung thấy phân bổ bàn dùng row lock khác advisory lock của QR, nên không thật sự serialize đổi bàn với QR.
- ✅ Migration additive `078_bl4_concurrency_fixes.sql` sửa thứ tự khóa reservation → order, từ chối release trên booking đã kết thúc, khớp trigger với order source QR thật, và cho booking/QR dùng chung advisory lock theo từng bàn trước row lock.
- ✅ Harness đã sửa fixture đổi booking qua RPC khách thật, cho hai xác nhận mâm cùng giờ đến, đếm order qua `table_order_batch_requests`, đồng thời cleanup/recover fixture BL4 bị sót sau lần chạy lỗi.
- ✅ `npm run test:bl4:sequential`: **46/46 PASS**; kiểm tra cú pháp các script và `git diff --check` PASS.
- ❌ Log PostgreSQL tiếp theo: 3 ca còn FAIL (đổi bàn thắng QR; hai xác nhận mâm; QR dùng session cũ). Cleanup PASS. Hai lỗi QR do `078` ghi đè nhầm công thức giữ bàn của `075`; lỗi xác nhận mâm do dùng lại bàn đang có booking từ ca trước, chưa tới bước tranh khóa.
- ✅ Thêm `078a_bl4_restore_prearrival_hold.sql`, không sửa hash/nội dung `078` đã áp: giữ advisory lock, khôi phục mốc đến trừ 60 phút cho phân bổ và kiểm tra chồng giờ; sửa phân bổ confirmed còn hiệu lực, không sửa lịch sử đã giải phóng/booking kết thúc.
- ✅ Tái hiện trước sửa bằng test thực thi hàm phân bổ: mốc giữ trước bằng 0 thay vì 3.600 giây; booking chồng khoảng giữ trước không bị chặn. Sau sửa: **50/50 PASS** tuần tự, gồm hồi quy khoảng giữ, giờ liền kề, backfill và quyền helper; các ca PostgreSQL giữ bàn gần giờ đến/mâm dùng bàn riêng.
- ✅ Anh Tú đã áp `078a` trên PostgreSQL test và chạy toàn bộ ma trận nhiều kết nối: kết quả cuối `BL-4 PostgreSQL concurrency PASS: full lock/race matrix`.

### Test 2A — ma trận PostgreSQL thật

Project test đã có marker và đã chạy migration 078. **Không cần tạo lại project, user hoặc marker, không cần restart Admin Web/deploy Mini App.** Trong **cùng cửa sổ PowerShell đã giữ** `BL4_TEST_DATABASE_URL`, `BL4_TEST_ALLOWED_HOST` và `BL4_TEST_OWNER_ID`, chạy lần lượt:

```powershell
cd D:\Code\mevo\admin-web
npm run test:bl4:prepare-db
npm run test:bl4:postgres
```

Lệnh đầu bỏ qua các migration đã áp đúng hash, thêm `078a_bl4_restore_prearrival_hold.sql` vào test database; không reset DB. Lần chạy đầu cần thấy `Applied 078a_bl4_restore_prearrival_hold.sql`, cuối lệnh có `test schema ready` đến file này. Nếu đã áp thì không in lại dòng `Applied`.

Lệnh sau tự thu hồi fixture BL4 còn sót từ lần chạy lỗi trước (chỉ trong DB có marker, đúng owner và store fixture), tạo dữ liệu kiểm thử rồi chạy ma trận và cleanup. Không dùng connection string production và không gửi connection string vào chat.

Kết quả đạt cần có `BL-4 PostgreSQL concurrency PASS: full lock/race matrix`, mọi dòng `PASS ...`, và không có `FAIL`, timeout (`57014`), lock timeout (`55P03`) hay deadlock (`40P01`). Nếu có lỗi, gửi phần output từ dòng `FAIL` đầu tiên đến lỗi tổng kết; không gửi connection string.

**Nghiệm thu:** ✅ `Task 2 PASS` — anh Tú xác nhận ngày 2026-09-30. Bằng chứng đồng thời là output kết thúc `BL-4 PostgreSQL concurrency PASS: full lock/race matrix`; không có deadlock, lock timeout hay timeout trong ma trận.

## Test 3 — Phục hồi Thông báo nội bộ có kiểm soát

### Codex đã chạy

- ✅ Outbox delivery mới đóng băng payload trước khi relay gửi; retry dùng lại chính `notification_id` và payload đã đóng băng. Delivery legacy không có snapshot không thể gửi lại.
- ✅ Worker không gửi nếu không freeze được payload; nếu claim/finish mất quyền thì kết quả là `lost_claim`, không báo gửi thành công giả.
- ✅ Retry chỉ mở cho MEVO superadmin, có optimistic version, audit request id, cooldown 60 giây, giới hạn 3 lần/24 giờ, và chỉ khi booking còn `pending`/chưa đến giờ.
- ✅ Đổi Group ID hoặc provider tự xóa bằng chứng retry. Nút **Gửi lại** bị khóa cho đến khi relay được MEVO xác minh khử trùng theo `notification_id`.
- ✅ Trigger dispatch chỉ nhận delivery `queued` có dispatch token mới; thiếu URL dispatch giữ delivery ở `queued` với mã `DISPATCH_URL_MISSING`, không rollback booking.
- ✅ `npm run test:bl4:sequential`: **55/55 PASS**.
- ✅ Admin action/UI: **8/8 PASS**; TypeScript `npx tsc --noEmit --pretty false` PASS.
- ✅ Production build `npm run build` PASS.
- ✅ PostgreSQL test thật ngày 2026-09-30: `BL-4 PostgreSQL delivery recovery PASS: requeue lock 133176 -> 133177`.

### Anh Tú cần chạy — Test 3A: PostgreSQL test thật

Đây là database test BL-4 đã có marker, **không phải database vận hành**. Không cần tạo project/user/marker lại. Cấu hình một lần vào file local (đã nằm trong `.gitignore`, không dán URL/password vào chat):

```powershell
cd D:\Code\mevo
Copy-Item .env.bl4-test.example .env.bl4-test.local
notepad .env.bl4-test.local
```

Điền đủ ba giá trị `BL4_TEST_DATABASE_URL`, `BL4_TEST_ALLOWED_HOST`, `BL4_TEST_OWNER_ID`, rồi lưu. Mọi lệnh BL-4 sẽ tự nạp file này; biến `$env:` nếu có vẫn được ưu tiên để phục vụ CI.

Sau đó, trong chính cửa sổ đó, chạy:

```powershell
cd D:\Code\mevo\admin-web
npm run test:bl4:prepare-db
npm run test:bl4:delivery-postgres
```

Lệnh prepare chỉ áp bổ sung `079_reservation_delivery_recovery.sql` và `080_reservation_zca_dispatch.sql` nếu chưa có đúng hash. Nó không reset database. URL dispatch trong DB test đang để trống nên không được gửi ra relay thật.

PASS khi lệnh hai kết thúc bằng dạng:

```text
BL-4 PostgreSQL delivery recovery PASS: requeue lock <PID A> -> <PID B>
```

và không có `40P01`, `55P03`, `57014` hoặc `FAIL`. Không gửi connection string vào chat nếu có lỗi.

### Test 3B — kiểm tra UI sau khi migration được áp lên môi trường Admin dùng để test

1. Đăng nhập MEVO superadmin, mở `/mevo/stores/<store-id>`.
2. Khu **Thông báo nội bộ (best-effort)** vẫn che Group ID đã lưu; không hiển thị giá trị cũ ở bất kỳ card/table/toast nào.
3. Bấm **Gửi tin thử**. Kết quả đúng lúc này là *“Đã xếp tin thử vào hàng đợi”*, không được hiện *“đã gửi”* trước khi server trả trạng thái thực.
4. Khi DB chưa cấu hình URL dispatch, delivery hiện **Đang chờ gửi · DISPATCH_URL_MISSING**. Booking/POS không bị lỗi hay bị rollback.
5. Với delivery lỗi hoặc quá hạn, cột thao tác hiển thị `—`; rê chuột thấy lý do relay chưa được xác minh. Không có cách gửi lại từ UI khi chưa có bằng chứng relay.
6. Sửa Group ID rồi lưu. Xác nhận trạng thái retry vẫn khóa; thay nhóm không được kế thừa quyền gửi lại của nhóm cũ.

### Test 3C — relay thật

✅ Chạy ngày 2026-10-01 trên relay `zca-js` đang vận hành, vào **nhóm MEVO riêng** (không dùng nhóm Pickleball):

- Hai request đồng thời cùng `notification_id` chỉ tạo một tin.
- Sau giả lập mất phản hồi, retry cùng mã và raw payload không tạo tin thứ hai.
- Phát hiện và vá lỗi thật: cùng mã nhưng payload khác trước đây trả cached-success. Relay nay lưu SHA-256 của raw JSON đã ký; payload khác trả `INVALID_REQUEST`, `retryable: false`, không dispatch.
- Rebuild/restart relay sau khi đã gửi fixture mới; retry lại raw payload cũ trả cached-success. Log chỉ có **một** lần `Đã gửi tin MEVO`; kho bền có entry `sent` với `payloadHash` hợp lệ.
- Relay source commit: `e6cca75 fix: bind mevo delivery id to payload`; `npm run build` và `npm test` đều PASS (**32/32**).

Anh Tú đã nhận đúng các tin fixture trong nhóm MEVO. Không có ID nhóm, secret hay nội dung dữ liệu vận hành nào được ghi vào evidence.

**Nghiệm thu:** ✅ `Task 3 PASS` — anh Tú xác nhận ngày 2026-09-30. ✅ `Test 3C PASS` ngày 2026-10-01; có thể ghi evidence/version 1 để mở retry thật sau khi migration 079/080 được áp lên môi trường vận hành.
