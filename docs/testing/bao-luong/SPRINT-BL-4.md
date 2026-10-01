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

## Test 4 — Runbook, công tắc server và release gate

### Codex đã chạy

- ✅ Release checker kiểm instance sạch, không merge/cherry-pick dở, commit là ancestor và App ID trong `.env` khớp expected; test **2/2 PASS**, không in secret.
- ✅ Checker chạy trên instance Bảo Lương hiện có với App ID Bảo Lương và commit `b68ff0d`: PASS.
- ✅ PostgreSQL thật: `BL-4 release contract PASS: server switches block new traffic and preserve existing reservation`.
- ✅ Test này đã phát hiện lỗi thật: `create_order` mở session mới trước khi kiểm quán tạm nghỉ, khiến session mới bị coi là phiên cũ ân hạn. Migration additive `081_bl4_block_new_session_when_store_closed.sql` chặn đơn đầu tiên và rollback session mới.
- ✅ `npm run test:bl4:sequential` **55/55 PASS**; Admin Web **62 file / 372 test PASS**; typecheck và production build PASS.
- ✅ Runbook: [bao-luong-pilot-runbook.md](../../operations/bao-luong-pilot-runbook.md). Contract baseline bản Publish tạm ghi rõ chưa có evidence version Publish thật; không tự coi `HEAD` là Publish.

### Anh Tú cần test tay — Test 4A

Thực hiện trên **quán/test booking riêng**, không dùng booking khách thật:

1. Tạo một booking test, xác nhận và phân bàn nhưng chưa bấm **Khách đã đến**.
2. Vào Cài đặt quán, tắt **Nhận đơn**. Quét QR một bàn khác và thử gọi món: phải bị chặn ngay.
3. Quay lại `/admin/reservations`: booking test vẫn mở được. Bấm **Khách đã đến**: phải tạo được phiên/bill cho booking cũ.
4. Tắt **Đặt bàn trước** và **Đặt món trước**. Mở Mini App root: không tạo được booking mới; nhưng booking test cũ vẫn xem được trên POS và xử lý tiếp được.
5. Bật lại toàn bộ công tắc sau test. Xác nhận QR mới gọi món bình thường.

**PASS khi:** công tắc chỉ chặn yêu cầu mới; booking/bill cũ không biến mất và chủ quán vẫn nhận khách/đóng bill được. Nếu gặp lỗi, chụp màn hình kèm thời điểm và công tắc đang tắt.

**Nghiệm thu:** ✅ `Task 4 PASS` — anh Tú xác nhận ngày 2026-10-01. Commit checkpoint `746ed3a`; chưa tự deploy hoặc Publish Mini App.

## Test 5 — Diễn tập Testing và bằng chứng bản Publish

### Trước khi bắt đầu

- Mục tiêu Test 5A là nghiệm thu **bản Testing**; chưa được coi là QR khách thật/Pubish.
- Dùng instance `D:\Code\mevo\mini-app-instances\bia-lau-bao-luong\mini-app`. Trước khi deploy phải chạy release gate, không dùng thư mục `D:\Code\mevo\mini-app` mặc định.
- Chỉ dùng dữ liệu có tên `TEST BL4`; kết thúc từng lượt bằng thao tác nghiệp vụ (từ chối/no-show/đóng bill), không xóa thẳng dữ liệu.
- Không ghi token QR, nhóm Zalo, key hoặc mật khẩu vào evidence.

### Test 5A — Testing E2E (thực hiện sau khi Codex báo chuẩn bị xong)

1. Ghi vào evidence: commit instance, version Testing do Zalo trả về, thời gian Asia/Ho_Chi_Minh, điện thoại dùng test và URL Admin đang dùng. Không ghi QR token.
2. Từ Mini App root không có mã bàn, tạo booking `TEST BL4` cho ngày/giờ hợp lệ. Trên POS xác nhận, chọn **hai bàn**, nhưng chưa nhận khách.
3. Từ màn khách, chọn **Đặt món trước**, gửi một batch. POS phải thấy đúng booking/bàn đã gán; owner duyệt và in hai liên giấy. Hai liên đều có giá/tổng, nhưng nhãn rõ `Bếp` và `Khách`.
4. Một giờ trước giờ đến, quét QR của bàn đã gán: không tạo phiên/đơn mới; phải báo bàn đã được đặt và yêu cầu báo chủ quán.
5. Owner bấm **Khách đã đến**. Dùng hai điện thoại quét QR hai bàn trong mâm, mỗi máy gọi thêm một món. POS phải nhận đúng **một mâm/bill**, xác nhận một đơn và từ chối một đơn với lý do; không xuất hiện màn Kitchen Display cho Bảo Lương.
6. Tạo thêm một booking `TEST BL4 - gọi sau`; xác nhận/nhận khách nhưng không gửi món trước. Luồng QR sau khi đến vẫn gọi thêm bình thường.
7. Kiểm nhánh vận hành: booking pending quá giờ được owner đóng tay; no-show và huỷ trước/sau khi release ghi dấu vết/audit, không tự xóa booking hoặc giấu món đã in.
8. Tắt mạng rồi bật lại trên một màn POS; dữ liệu phải tự hội tụ, không F5. Để POS tab nền ít nhất 5 phút, quay lại và ghi độ trễ nhận cập nhật vào evidence.
9. Tắt thử kênh Thông báo nội bộ/relay (nếu có quyền môi trường test): booking vẫn vào POS, không tự xác nhận. Bật lại sau test.
10. Kiểm Pubu riêng: root còn `Tự qua lấy` + `Ship`, đơn trả trước/đơn staff giữ luồng Kitchen như trước.

**PASS 5A khi:** toàn bộ 10 bước đạt trên bản **Testing** và evidence có đủ version/commit/môi trường. Sau PASS Codex chỉ commit evidence; Publish là Test 5B riêng.

### Test 5B — QR bản Publish (chỉ thực hiện sau 5A PASS)

1. Publish đúng artifact Testing đã đạt; ghi version Publish và thời điểm console xác nhận công khai.
2. Bằng một tài khoản Zalo **không nằm trong tester**, quét QR bàn vật lý và mở root Mini App. Xác nhận không còn nhận bản Testing cũ.
3. Lặp lại tối thiểu luồng: booking → POS xác nhận/chọn bàn → preorder → nhận khách → QR gọi thêm. Kiểm bill/mâm/bàn đúng và Bảo Lương vẫn chỉ dùng POS + phiếu giấy.
4. Mở Pubu bằng khách thường và kiểm pickup/delivery/prepay không hồi quy.

**PASS 5B khi:** QR khách thường chạy đúng bản Publish. Bản Testing đạt nhưng QR vẫn mở bản cũ là `WAITING_PUBLISH`, không được kết luận BL-4 PASS.

**Nghiệm thu:** chờ Test 5A PASS trước; chưa tự Publish Mini App.
