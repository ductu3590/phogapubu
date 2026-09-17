# Sprint BL-0 — Kiểm thử theo task

Trạng thái Sprint: chờ nghiệm thu BL-0; Task 7–8 PASS, Task 9 đã hoàn tất kiểm chứng tự động.

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

## Task 8 — Context vào Mini App, capability theo quán và Gọi nhân viên RPC

**Trạng thái: PASS — 2026-09-17.** Commit: `1f298a6`.

Nghiệm thu thực tế: Test 8A PASS 5/5 và Test 8B PASS. Khi test ngoài giờ, `serving_hours`
đã được tạm xoá để tách capability khỏi chốt giờ phục vụ, rồi trả lại đúng 11:00–22:00.

### Kết quả tự động

- Mini App: 47/47 test PASS.
- `git diff --check`: PASS.
- Typecheck toàn Mini App vẫn dừng tại 3 lỗi nền có trước Task 8: `SnackbarProvider`, import
  `app-config.json` và relation ở `category.api.ts`. Không có lỗi mới từ các file Task 8.

### Test 8A — Root/table và capability theo cấu hình quán

1. **Pubu, root:** mở Mini App Pubu không quét QR bàn. Menu vẫn thêm món được; giỏ nổi và
   checkout xuất hiện; checkout có cả **Tự qua lấy** và **Ship tận nhà**.
2. **Bảo Lương, root:** mở Mini App Bảo Lương không quét QR bàn. Vẫn xem menu nhưng không có
   nút `+`/`-`, không có giỏ nổi, không có tab **Đơn hàng** và không thể tạo đơn bằng deep-link
   `/checkout`. Ở môi trường dev chỉ hiện nút vô hiệu hoá **Đặt bàn trước — sẽ mở ở BL-3**;
   không gửi request tạo đặt bàn.
3. **QR cũ vẫn chạy:** quét một QR bàn đã in từ trước BL-0 (URL chỉ có `table=<id>`, không có
   `tableNumber`). Sau khi tải xong phải hiện đúng tên bàn từ DB và cho gọi món như trước nếu
   `table_ordering_enabled=true`.
4. **Tắt table ordering:** owner vào `/admin/settings`, tắt **Nhận gọi món QR tại bàn** cho
   Bảo Lương, lưu, đóng hẳn rồi mở lại Mini App từ QR bàn. Menu chỉ đọc, không có nút thêm/giỏ;
   deep-link checkout không tạo được đơn. Bật lại cấu hình sau khi test và mở lại Mini App: gọi
   món từ QR hoạt động lại.
5. Với một quán chỉ bật một hình thức root (nếu có dữ liệu test), checkout chỉ hiện hình thức đó
   và không chấp nhận hình thức đã tắt.

### Test 8B — Hồi quy Gọi nhân viên

Từ một QR bàn đang có bill chưa thanh toán, bấm **Gọi nhân viên** một lần. Mini App báo thành
công và card chỉ xuất hiện một lần trên POS; thử lại trong 60 giây vẫn bị throttle. Đây là cùng
contract RPC `ping_service_request` đã nghiệm thu ở Task 7, nay được dùng qua service chung.

### Kiểm chứng server-side capability sau nghiệm thu

Ba cờ workflow không chỉ được chặn ở Mini App. Migration 049 tạo trigger
`trg_orders_enforce_workflow` **BEFORE INSERT** trên `public.orders`; remote ngày 2026-09-17
xác nhận trigger đang enabled (`tgenabled = O`) và gọi `enforce_order_workflow()`, từ đó gọi
`assert_order_channel_enabled(store_id, order_type)`. Vì `create_order` phải INSERT vào
`orders`, gọi RPC trực tiếp cũng bị chặn theo các cờ `table_ordering_enabled`,
`takeaway_enabled` và `shipping_enabled`.

Lần gọi thử `delivery` bằng `cash` nhận lỗi “Đơn mang về chỉ chấp nhận thanh toán online” ở
check đầu của `create_order`, trước khi có INSERT nên chưa chạm trigger; đó không phải bằng
chứng bypass workflow. Test SQL `049_store_workflow_settings.test.mjs` cũng kiểm tra trigger
chặn đường ghi trực tiếp với kênh đã tắt.

## Task 9 — Kiểm chứng tích hợp, hai instance và bàn giao BL-0

**Trạng thái: chờ nghiệm thu BL-0.** Không có thay đổi source ở Task 9.

### Kết quả kiểm chứng tự động

- SQL PGlite, migrations 048–050a: **32/32 PASS**.
- Admin Web: **265/265 test PASS**, TypeScript PASS, production build PASS (29 routes).
- Mini App core: **47/47 test PASS**.
- Cả hai instance `pho-ga-pubu` và `bia-lau-bao-luong`: **47/47 test PASS**. Instance Pubu
  thiếu `node_modules` ban đầu; cài dependency cục bộ để chạy test rồi hoàn nguyên
  `package-lock.json`, không có thay đổi source hay lockfile cần commit.
- Typecheck Mini App còn lỗi nền đã biết: `SnackbarProvider` và relation
  `category.api.ts` ở cả hai instance; checkout core có thêm import `app-config.json` do file
  cấu hình chỉ có trong instance. Không có lỗi BL-0 mới.
- Full ESLint Admin Web vẫn báo **13 lỗi / 4 warning nền** ở menu, Kitchen cũ, Privacy/Terms,
  settings/spin/TTS; không phải file BL-0. Đây không phải điều kiện PASS ngầm.

### Triển khai database và phương án khôi phục

Môi trường remote đang test đã có migrations `049`, `050`, `050a`, `051`. Với môi trường mới,
chỉ triển khai theo thứ tự tăng dần và sau khi Mini App đã có RPC `ping_service_request`:

```powershell
supabase db push --project-ref dlkgdpexjtyynbotkwka
```

Nếu chạy bằng SQL Editor, chạy nguyên từng file theo đúng thứ tự:

1. `supabase/migrations/049_store_workflow_settings.sql`
2. `supabase/migrations/050_pos_gate_service_requests.sql`
3. `supabase/migrations/050a_kitchen_service_request_queue.sql`
4. `supabase/migrations/051_session_labels_and_kitchen_tray_read.sql`

Trước khi chạy, tạo database backup/snapshot; tối thiểu xuất các bảng
`store_workflow_settings`, `store_workflow_setting_events`, `service_requests`,
`table_sessions` và `session_tables`. Đây là migration **forward-only**: không chạy lại app cũ
ghi trực tiếp `service_requests`, và không xóa thủ công 049–051 để “rollback”. Nếu phải quay
lại, dừng deploy, khôi phục database từ snapshot trước migration và đồng thời quay code về mốc
tương thích; nếu không có backup thì làm migration tiến sửa lỗi mới. Sau apply, dùng Test 2–3
bên dưới để xác nhận capability server-side, queue và quyền.

### Test BL-0 1 — Cấu hình workflow, preset và audit

1. Owner Bảo Lương mở `/admin/settings`, lưu preset **Bảo Lương**, refresh và kiểm tra: trả sau,
   tiền mặt, tắt Mang về/Ship, POS xác nhận đơn khách lẫn nhân viên, timeout 6 giờ.
2. Owner đổi riêng Thông tin hiển thị rồi lưu; cấu hình workflow không thay đổi.
3. MEVO superadmin vào `/mevo/stores/<storeId>`, lưu preset Pubu rồi trở lại Bảo Lương và lưu
   lại preset Bảo Lương. Mỗi lần phải reload đúng dữ liệu và tạo event audit đúng nguồn
   `mevo`/`owner`.
4. Staff và owner của quán khác không xem/lưu được cấu hình Bảo Lương. Khi còn phiên/đơn mở,
   đổi policy nhạy cảm phải bị chặn nguyên tử.

### Test BL-0 2 — Ma trận quán/kênh/POS

1. **Pubu root:** khách có thể chọn Mang về và Ship, checkout trả trước; đơn QR và đơn staff
   theo policy tự động vẫn tới Kitchen như trước.
2. **Bảo Lương root:** chỉ đọc menu, không tạo đơn qua root/deep-link checkout; Mang về và Ship
   bị tắt. QR bàn vẫn gọi món khi `table_ordering_enabled=true`.
3. Tại Bảo Lương, tạo đơn khách rồi đơn staff từ bàn/mâm mở: cả hai chờ POS, Kitchen không nhận
   trước. Owner bấm **Xác nhận & in**: mỗi đơn xuống Kitchen đúng một lần.
4. Tắt rồi bật `table_ordering_enabled`; QR cũ chỉ có `table=<id>` phải lấy đúng tên bàn từ DB
   và bị/được chặn tương ứng. Từ một client anon, thử gọi kênh đã tắt: trigger phải từ chối.

### Test BL-0 3 — Queue, bill và quyền vận hành

1. Từ QR bàn/mâm đang mở, bấm **Gọi nhân viên**. POS, `/staff/tables` và Kitchen có cùng một
   card trong 3 giây; bấm lại trong 60 giây không tạo card mới. Hai bàn cùng mâm vẫn là một card.
2. Owner bấm **Đã xử lý**: card biến mất ở cả ba màn sau khi server trả thành công. Tắt/bật mạng
   hoặc chuyển tab không làm mất queue hay phát chuông lặp.
3. Staff xem bill, ghép mâm và xử lý queue nhưng không có/không gọi được Thu tiền, Đóng bàn hay
   Bỏ bàn. Owner vẫn làm được; bill còn đơn pending bị chặn với lỗi giữ trên màn hình.
4. Một phiên timeout phải hiện đúng nhãn bàn/mâm và thời lượng cấu hình từ server, không hardcode.

### Test BL-0 4 — Hai Mini App và ranh giới deploy

1. Hai working tree deploy đều ở commit chứa Task 8/9, sạch trước deploy. Chạy `npm test` tại
   `mini-app-instances/pho-ga-pubu/mini-app` và
   `mini-app-instances/bia-lau-bao-luong/mini-app`: mỗi nơi 47/47 PASS.
2. Deploy đúng instance Bảo Lương, đóng hẳn rồi mở lại Mini App từ root và từ QR; thực hiện mục
   2–3 bằng build đã deploy, không dùng tab/cache cũ.
3. Deploy đúng instance Pubu và chạy lại mục Pubu ở Test 2 để xác nhận Bảo Lương không làm hồi
   quy thanh toán/kênh của Pubu.
4. Ghi riêng kết quả Zalo: App ID Bảo Lương `671794256689452743` **đã tồn tại**, nhưng trạng thái
   xác minh/phê duyệt chưa được xác nhận; Zalo OA Bảo Lương **chưa đăng ký**. Không đánh dấu hai
   hạng mục này là hoàn thành trong nghiệm thu code.

### Mẫu báo lỗi BL-0

Gửi số Test/mục, quán + instance, role, URL hoặc QR, thao tác, thời điểm, ảnh/video và output
console/RPC nếu có. Với lỗi capability, gửi cả `order_type` và trạng thái các cờ workflow.
