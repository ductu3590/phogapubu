# Sprint BL-0 — Kiểm thử theo task

Trạng thái Sprint: đang triển khai; Task 7 PASS, chờ Task 8.

## Task 3 — Server action cấu hình quy trình

### Điều kiện chuẩn bị

- Checkout branch `feat/pos-cashier` tại hoặc sau commit Task 3.
- Dependencies của `admin-web` đã được cài.

### Test tự động Codex đã chạy

Từ thư mục `admin-web`:

```powershell
npm test -- --run lib/actions/workflow-settings.test.ts lib/workflow-settings.test.ts
npx tsc --noEmit
npm test
npx eslint lib/actions/workflow-settings.ts lib/actions/workflow-settings.test.ts --max-warnings=0
```

Kết quả tại thời điểm bàn giao Task 3:

- Action + workflow model: 15/15 test PASS.
- Toàn bộ Admin Web: 220/220 test PASS.
- TypeScript: PASS.
- ESLint hai file Task 3: PASS, không có warning.
- Full-project ESLint đã chạy nhưng đang FAIL do 15 lỗi và 4 warning có sẵn ngoài phạm vi Task 3
  tại các file menu, settings, kitchen, privacy, terms, spin và TTS.

### Test 3A — Role, store đích và nguồn audit

Chạy:

```powershell
cd D:\Code\mevo\admin-web
npm test -- --run lib/actions/workflow-settings.test.ts
```

Mong đợi:

- 8/8 test PASS.
- Owner luôn dùng `storeId` trong operator và nguồn audit `owner`.
- MEVO superadmin dùng store đích được truyền vào và nguồn audit `mevo`.
- Staff/owner sai khu vực bị chặn trước RPC.

### Test 3B — Payload form, Pubu và lỗi nghiệp vụ

Trong output Test 3A, xác nhận các case sau đều PASS:

- Snapshot RPC được đổi từ snake_case sang model camelCase cho form.
- Payload lưu có đủ key snake_case; preset Pubu vẫn là prepay, bật Mang về/Ship và tự xuống bếp.
- Preorder bị chuẩn hóa về tắt khi Đặt bàn tắt nhưng draft form không bị mutate.
- Lỗi nghiệp vụ RPC như `Còn phiên đang hoạt động` được trả nguyên văn.

### Mẫu báo lỗi

Gửi lại tên test fail, toàn bộ error output và commit đang test (`git rev-parse --short HEAD`).

## Task 4 — Form cấu hình quy trình vận hành

### Điều kiện chuẩn bị

- Checkout branch `feat/pos-cashier` tại hoặc sau commit `e4cb08b`.
- Đã có tài khoản owner của một quán và tài khoản `mevo_superadmin`.
- Migration `049_store_workflow_settings.sql` đã được áp vào môi trường đang test.

### Test tự động Codex đã chạy

Từ thư mục `admin-web`:

```powershell
npx tsc --noEmit
npm test -- --run app/admin/settings/workflow-settings-form.test.tsx lib/actions/store.test.ts lib/workflow-settings.test.ts
npm test
```

Kết quả tại thời điểm bàn giao: 21/21 test mục tiêu, 226/226 test Admin Web và TypeScript đều PASS.

### Test 4A — Owner tách hồ sơ và quy trình

1. Đăng nhập owner, mở `/admin/settings`.
2. Xác nhận có hai khu độc lập: **Thông tin hiển thị** và **Quy trình vận hành**.
3. Trong Quy trình vận hành, chọn preset **Bảo Lương**, xác nhận hộp thoại rồi lưu.
4. Refresh trang và xác nhận: trả sau, chỉ tiền mặt, tắt Mang về/Ship, bật Đặt bàn + Đặt món trước, và hai policy đều **cần POS xác nhận**.
5. Chọn preset **Pubu**, lưu và refresh: trả trước, Zalo Checkout, bật Mang về/Ship, tự xuống bếp.
6. Sửa riêng tên/logo/địa chỉ trong Thông tin hiển thị, lưu; xác nhận cấu hình workflow không bị đổi.

### Test 4B — Cockpit MEVO và quyền

1. Đăng nhập `mevo_superadmin`, mở trang chi tiết một quán trong `/mevo/stores/<storeId>`.
2. Xác nhận section **Quy trình vận hành** dùng đúng các field/preset như owner, không phải bản copy thiếu field.
3. Chọn/lưu một preset rồi refresh để xác nhận dữ liệu được giữ.
4. Đăng nhập owner của quán khác và thử truy cập/lưu: phải bị chặn, không được ghi sang quán đích.
5. Khi có phiên bàn hoặc đơn đang hoạt động, đổi payment timing/policy xuống bếp/timeout: phải nhận đúng lỗi nghiệp vụ, không được lưu nửa chừng.

### Mẫu báo lỗi

Gửi URL đang test, preset đã chọn, thao tác, ảnh hoặc toàn bộ lỗi, và commit đang test (`git rev-parse --short HEAD`).

## Task 5 — Cổng POS xuống bếp theo policy

### Điều kiện chuẩn bị

- Checkout branch `feat/pos-cashier` tại hoặc sau commit `ba5b8ee`.
- Migration 049 đã áp trên Supabase.
- Có một quán Bảo Lương (policy **Cần POS xác nhận**) và Pubu (policy **Tự động**), cùng màn POS + Kitchen Display.

### Test tự động Codex đã chạy

Từ thư mục `admin-web`:

```powershell
npm test -- --run lib/kitchen-announce.test.ts
npm test
npx tsc --noEmit
```

Kết quả: ma trận Kitchen 20/20 PASS; toàn bộ Admin Web 231/231 PASS; TypeScript PASS.

### Test 5A — Bảo Lương chỉ xuống bếp sau POS xác nhận

1. Tại Bảo Lương, để Kitchen Display mở và tạo đơn khách hoặc nhân viên từ một bàn đang mở.
2. Xác nhận đơn vẫn hiện ở POS là **chờ xác nhận**, nhưng không xuất hiện/không chuông ở Kitchen Display.
3. Trên POS, bấm **Xác nhận & in** cho đơn đó.
4. Xác nhận đơn xuất hiện tại Kitchen Display đúng một lần và bắt đầu theo dõi trạng thái bình thường.
5. Nếu thao tác hai tab cùng xác nhận, chỉ được có một release/phiếu bếp; tab còn lại phải báo đơn đã được xác nhận.

### Test 5B — Không hồi quy Pubu và món POS

1. Tại Pubu, nhân viên tạo đơn; xác nhận đơn vẫn vào Kitchen Display ngay theo flow trả trước/tự động cũ.
2. Tại Bảo Lương, thêm **món ghi tay POS** vào bill.
3. Xác nhận món ghi tay không tạo thẻ, âm thanh hay đơn mới ở Kitchen Display.
4. Đặt tình huống có `status=confirmed` nhưng không có `confirmed_at` (nếu test DB): Kitchen Display vẫn không được thấy đơn Bảo Lương.

### Mẫu báo lỗi

Gửi tên quán, nguồn đơn (khách/nhân viên/POS), trạng thái + `confirmed_at` nếu thấy trong DB, thao tác đã bấm, và ảnh/video lỗi.

## Task 6 — Hàng đợi gọi nhân viên, timeout và quyền đóng bill

### Phạm vi kiểm thử

- Commit: `e1b2f9e`.
- Migration 050 **chưa áp Supabase remote**; chỉ áp cùng Task 7 vì migration sẽ thay đường ghi trực tiếp `service_requests` bằng RPC `ping_service_request`.

### Test tự động Codex đã chạy

Từ thư mục gốc repository:

```powershell
$modulePath=(Resolve-Path 'admin-web/node_modules/@electric-sql/pglite/dist/index.js').Path
$env:PGLITE_MODULE=([System.Uri]::new($modulePath)).AbsoluteUri
node --test supabase/tests/048_pos_table_areas.test.mjs supabase/tests/049_store_workflow_settings.test.mjs supabase/tests/050_pos_gate_service_requests.test.mjs
```

Kết quả: 050 focused 10/10 PASS; regression 048/049/050 là 31/31 PASS.

### Test 6A — Contract DB qua PGlite

1. Chạy lệnh trên tại checkout chứa commit `e1b2f9e` hoặc mới hơn.
2. Xác nhận 31 test PASS, không có fail hoặc skipped.
3. Chú ý các case phải PASS: hai bàn trong cùng mâm tạo đúng một request `call_staff` mở; ping dưới 10 giây bị chặn; resolve rồi ping tạo lượt mới; staff không thể đóng bill; bill còn đơn pending chưa POS xác nhận bị chặn; timeout 360 phút tạo cờ cần review.

### Test 6B — Điều kiện phát hành

1. Không áp riêng migration 050 vào môi trường Mini App đang dùng đường insert cũ `service_requests`.
2. Chỉ áp migration sau khi Task 7 chuyển Mini App sang `ping_service_request` và cập nhật Kitchen/POS đọc/resolve hàng đợi mới.
3. Các request lịch sử loại `payment`/`help` phải được giữ lịch sử nhưng đánh dấu đã xử lý sau migration.

### Mẫu báo lỗi

Gửi toàn bộ output lệnh PGlite, tên test fail và commit đang test (`git rev-parse --short HEAD`).

## Task 7 — Queue Gọi nhân viên trên POS/Kitchen và quyền staff

**Trạng thái: PASS — 2026-09-16.**

Nghiệm thu thực tế: card gọi nhân viên lên POS 0,28 giây và màn nhân viên 1,42 giây ngay cả ở
tab nền; resolve đồng bộ đủ ba màn; lỗi Bỏ bàn được giữ; nhãn bàn/mâm khớp POS và Kitchen.

### Phạm vi kiểm thử

- Commit gốc: `249e585`; bản vá hồi quy chờ nghiệm thu sau đó.
- Migration 050, 050a và 051 **đã áp trên Supabase remote**. Mini App phải dùng RPC
  `ping_service_request`, không được ghi trực tiếp `service_requests`.

### Test tự động Codex đã chạy

Từ `admin-web`:

```powershell
npm test -- --run lib/actions/service-requests.test.ts lib/service-request-queue.test.ts lib/session-timeout.test.ts app/staff/tables/tables-client.test.ts
npm test
npx tsc --noEmit
```

Từ thư mục gốc:

```powershell
$modulePath=(Resolve-Path 'admin-web/node_modules/@electric-sql/pglite/dist/index.js').Path
$env:PGLITE_MODULE=([System.Uri]::new($modulePath)).AbsoluteUri
node --test supabase/tests/050_pos_gate_service_requests.test.mjs supabase/tests/050a_kitchen_service_request_queue.test.mjs
```

Kết quả bản gốc: 27/27 test tập trung, 258/258 test Admin Web, 11/11 test SQL,
TypeScript và lint các file đổi đều PASS.

Kết quả bản vá hồi quy đầu: Mini App 36/36 test PASS; Admin Web 260/260 test PASS,
TypeScript PASS. ESLint toàn Admin Web hiện còn các lỗi nền ngoài phạm vi Task 7, được theo dõi riêng. Typecheck toàn Mini App vẫn có 3 lỗi nền ngoài phạm vi
(kiểu `SnackbarProvider`, import `app-config.json`, và relation ở `category.api.ts`); RPC mới
đã có khai báo type và không tạo lỗi typecheck mới.

Kết quả bản vá vòng 2: Admin Web 265/265 test PASS; SQL PGlite 12/12 PASS; TypeScript PASS.
ESLint toàn Admin Web còn 13 lỗi nền ngoài phạm vi Task 7 (menu, Kitchen cũ, Privacy và Terms);
không có warning. Migration 051 đã áp remote.

### Test 7A — Hồi quy Mini App, queue và xử lý request

1. Deploy lại Mini App chứa bản vá hồi quy (version mới hơn v3), dùng Zalo đóng hẳn Mini App
   rồi mở lại bằng QR bàn. Trong tab **Đơn hàng**, nút phải là **Gọi nhân viên**, không còn
   chữ “Gọi thanh toán”.
2. Bấm nút: hiện thông báo thành công; POS `/admin/cashier` **và** `/staff/tables` xuất hiện một
   card **Gọi nhân viên** trong tối đa 3 giây, không F5/click/focus lại cửa sổ.
   Bấm lại trong 60 giây: Mini App báo đã gọi, không tạo card thứ hai. Nếu hai bàn cùng mâm gọi,
   POS vẫn chỉ một card và cập nhật số lần/lần gọi gần nhất.
3. Mở POS bằng build mới, để màn hình đứng yên. Từ QR một bàn thuộc mâm, gửi một đơn khách;
   đơn phải xuất hiện trong POS tối đa 5 giây mà không bấm F5. Lặp lại khi vừa chuyển tab POS
   sang tab khác rồi quay lại để xác nhận cơ chế snapshot dự phòng bắt kịp event đã lỡ.

4. Mở Kitchen Display và `/staff/tables` cùng quán: card cũng hiện ở hai màn; Kitchen chỉ
   đọc/hiển thị cảnh báo. Bấm card ở POS: mở đúng bàn/mâm. Bấm **Đã xử lý**: card chỉ biến mất
   sau khi server trả thành công, và biến mất ở các màn còn lại.
5. Tắt/bật mạng hoặc đổi tab rồi quay lại: queue tải lại đầy đủ, không mất request đang mở và
   không phát chuông lặp cho snapshot cũ.

### Test 7C — Hồi quy vòng 2: phản hồi thao tác và nhãn mâm

1. Trên POS, tạo một bill có đơn khách đang **chờ xác nhận**, bấm **Bỏ bàn** và xác nhận hộp
   thoại. Câu `Còn N đơn chưa được chủ quán xác nhận` phải giữ trên màn hình cho tới khi bấm
   **Đóng**, kể cả sau tối thiểu 10 giây polling nền.
2. Để một phiên hết hạn còn nợ: thẻ review phải ghi đúng tên bàn/mâm, ví dụ `Bàn 2, Bàn 3`,
   không được là `?`.
3. Với mâm Bàn 2 + Bàn 3, gửi đơn từ QR Bàn 3. POS và Kitchen Display đều phải hiện cùng nhãn
   `Bàn 2, Bàn 3` cho đơn đó.

### Test 7B — Quyền staff và timeout

1. Đăng nhập `store_staff` vào `/staff/tables`: vẫn xem bill, ghép mâm/thêm bàn và xử lý Gọi nhân viên.
2. Xác nhận không có nút **Thu tiền & đóng bàn**, **Bỏ bàn**, checkbox gộp/thu nhiều mâm hoặc sheet thanh toán.
3. Gọi RPC close bằng staff: server từ chối `Chỉ chủ quán được thu tiền hoặc bỏ bàn`.
4. Owner vẫn thấy và dùng đủ thao tác thu tiền/bỏ bàn.
5. Phiên timeout của Bảo Lương hiển thị 6 giờ; quán có timeout khác hiển thị số từ server, không hardcode 6 giờ.

### Mẫu báo lỗi

Gửi role đăng nhập, URL/màn hình, bàn hoặc mâm, request id nếu có, thao tác, và ảnh/video hoặc output lỗi.
