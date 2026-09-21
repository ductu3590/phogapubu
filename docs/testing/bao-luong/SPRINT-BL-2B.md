# Bảo Lương — Sprint BL-2B: thông báo Zalo OA cho chủ quán

Ngày cập nhật: 2026-09-21
Trạng thái: **Task 1 PASS — Task 2 code hoàn tất, chờ credential/live OA**

## Phạm vi Task 1

- Tạo recipient theo từng quán/OA, challenge onboarding và outbox thông báo đặt bàn.
- Booking do khách tạo sinh đúng một delivery; booking chủ quán tạo tay không sinh thông báo mới.
- Delivery được khóa theo `store_id`, idempotent theo event và chỉ `service_role` được claim/finish.
- Chưa có webhook onboarding và chưa có sender gọi Zalo OA ở Task 1, nên không phát sinh tin thật.
- Migration `059` và `059a` đã chạy trên Supabase production.

## Test 1A — schema/RLS tự động

Chạy từ thư mục gốc `D:\Code\mevo` bằng PowerShell:

```powershell
$modulePath=(Resolve-Path 'admin-web/node_modules/@electric-sql/pglite/dist/index.js').Path
$env:PGLITE_MODULE=([System.Uri]::new($modulePath)).AbsoluteUri
node --test supabase/tests/059_reservation_owner_oa_notifications.test.mjs
```

Kỳ vọng:

- File `059`: **8/8 PASS**.
- Có test chứng minh anon/authenticated không đọc/ghi trực tiếp ba bảng nội bộ.
- Có test chứng minh claim sai token, claim lặp và recipient khác quán đều bị chặn.
- Có test chứng minh các khóa ngoại mới có index phủ.

## Test 1B — event matrix và hồi quy reservation

```powershell
node --test supabase/tests/052_reservation_foundation.test.mjs supabase/tests/054_reservation_operator_flow.test.mjs supabase/tests/057_reservation_operations_queue.test.mjs supabase/tests/059_reservation_owner_oa_notifications.test.mjs
```

Kỳ vọng: **29/29 PASS**, trong đó:

- Booking do khách tạo sinh đúng một delivery.
- Booking chủ quán tạo tay không sinh delivery.
- Enqueue lặp cùng event vẫn chỉ có một delivery.
- Không hồi quy các luồng BL-1/BL-2A.

## Test 1C — migration production và không gửi nhầm tin

Trong Supabase SQL Editor, chạy:

```sql
select
  (select count(*) from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in (
       'store_zalo_notification_recipients',
       'zalo_oa_onboarding_challenges',
       'reservation_notification_deliveries'
     )
     and c.relrowsecurity) as rls_table_count,
  has_table_privilege('anon', 'public.store_zalo_notification_recipients', 'SELECT') as anon_recipient_select,
  has_table_privilege('authenticated', 'public.reservation_notification_deliveries', 'SELECT') as auth_delivery_select,
  has_function_privilege('anon', 'public.claim_reservation_owner_notification(uuid,uuid)', 'EXECUTE') as anon_claim,
  has_function_privilege('authenticated', 'public.claim_reservation_owner_notification(uuid,uuid)', 'EXECUTE') as auth_claim,
  has_function_privilege('service_role', 'public.claim_reservation_owner_notification(uuid,uuid)', 'EXECUTE') as service_claim;
```

Kỳ vọng một dòng:

```text
rls_table_count = 3
anon_recipient_select = false
auth_delivery_select = false
anon_claim = false
auth_claim = false
service_claim = true
```

Kiểm tra sáu index phủ khóa ngoại:

```sql
select indexname
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'store_zalo_notification_recipients_operator_user',
    'zalo_oa_onboarding_challenges_recipient_store',
    'zalo_oa_onboarding_challenges_created_by',
    'reservation_notification_deliveries_reservation_store',
    'reservation_notification_deliveries_event_store',
    'reservation_notification_deliveries_recipient_store'
  )
order by indexname;
```

Kỳ vọng: **6 dòng**. Sau đó chạy:

```sql
select
  (select count(*) from public.store_zalo_notification_recipients) as recipient_count,
  (select count(*) from public.zalo_oa_onboarding_challenges) as challenge_count,
  (select count(*) from public.reservation_notification_deliveries) as delivery_count;
```

Kỳ vọng tại checkpoint Task 1 hiện tại: cả ba bằng `0`. Không có recipient và sender nên chưa thể gửi tin Zalo thật.

## Kết quả Codex đã chạy

- Test đỏ trước khi thêm schema/index: đúng kỳ vọng.
- Contract Task 1: **8/8 PASS**.
- Hồi quy reservation: **29/29 PASS**.
- Production: RLS/quyền đúng; sáu index tồn tại; ba bảng đều chưa có dữ liệu.
- Supabase advisor: không còn cảnh báo khóa ngoại thiếu index do Task 1 tạo. Cảnh báo `RLS enabled no policy` cho ba bảng là chủ đích vì chỉ service role được truy cập.

Xác nhận: **Task 1 PASS ngày 2026-09-21** — chuyển Task 2 theo chỉ đạo trực tiếp của anh Tú;
không yêu cầu chạy lại các test tự động Codex đã ghi kết quả ở trên.

## Task 2 — Onboarding đúng OA-scoped owner UID

Đã triển khai:

- Webhook riêng `/api/zalo-oa-webhook/<storeId>` xác minh chữ ký trên raw body theo công thức Zalo OA.
- Kiểm tra đồng thời `storeId`, Mini App ID và OA ID trước khi claim.
- Mã kết nối 96-bit, chỉ lưu SHA-256, hết hạn 15 phút và dùng một lần.
- Claim/replay chạy nguyên tử trong PostgreSQL; app/OA/store/code sai không tạo recipient.
- Cockpit MEVO chỉ hiện trạng thái credential, không trả Access Token, App Secret hay OA UID xuống client.
- Cấu hình OA lần đầu bắt buộc đủ Access Token + App Secret; để trống khi cập nhật không xóa secret cũ.

### Kết quả tự động do Codex đã chạy — không cần chạy lại

- Admin Web: **344/344 PASS**.
- SQL BL-1/BL-2A/BL-2B: **34/34 PASS**.
- TypeScript: `npx tsc --noEmit` — exit `0`.
- ESLint phạm vi Task 2 — exit `0`.
- Production build: `npm run build` — exit `0`, route webhook mới xuất hiện trong manifest.
- Migration `060_reservation_owner_oa_onboarding.sql` đã chạy trên Supabase production.
- Production hiện có `recipient_count = 0`, `challenge_count = 0`; chưa gửi hay lưu UID thử.

### Test 2A — cockpit sau khi deploy Admin Web

1. Đăng nhập MEVO superadmin, mở trang chi tiết **Bia lẩu Bảo Lương**.
2. Trong **Zalo OA / Webhook**, kiểm tra panel **Người nhận thông báo đặt bàn**.
3. Kỳ vọng hiện tại:
   - OA ID: `Đã có`.
   - Mini App ID: `Đã có`.
   - Access Token: `Còn thiếu`.
   - App Secret: `Còn thiếu`.
   - Trạng thái: `Chưa kết nối`.
   - Nút **Tạo mã kết nối** bị khóa.
4. Không được nhìn thấy giá trị token, secret hoặc OA UID ở trang.

### Test 2B — nhập credential và cấu hình webhook thật

Chỉ chạy khi Zalo đã cấp **OA Access Token** và **App Secret Key** cho Bảo Lương:

1. Nhập đủ hai credential trong form Zalo OA và lưu.
2. Refresh: cả Access Token và App Secret phải thành `Đã có`; giá trị thật không được hiện lại.
3. Bấm **Sao chép URL đầy đủ**, đăng ký URL đó trong Zalo Developer Console và bật event
   `user_send_text`.
   - Khi Developer Console gửi POST **Kiểm tra URL** không có chữ ký, webhook phải trả HTTP `200`
     trong dưới 1 giây. Request này chỉ xác nhận đường dẫn, không thể claim mã hay tạo recipient.
4. Bấm **Tạo mã kết nối**: xuất hiện đúng một câu `MEVO <24 ký tự hex>` và giờ hết hạn sau
   khoảng 15 phút.

### Test 2C — claim bằng Zalo thật

1. Tài khoản Zalo của chủ quán quan tâm đúng OA Bảo Lương.
2. Gửi một mã sai: refresh cockpit vẫn chưa được `Đã xác minh`.
3. Gửi nguyên văn mã còn hạn từ Test 2B vào OA.
4. Refresh cockpit: trạng thái thành `Đã xác minh`; không hiện OA UID.
5. Gửi lại cùng tin nhắn hoặc cùng mã lần hai: không tạo recipient thứ hai và trạng thái không đổi.

### Test 2D — tắt và kết nối lại

1. Bấm **Tắt người nhận**: trạng thái thành `Đã tắt`.
2. Tạo mã mới, gửi từ đúng OA/app Bảo Lương: trạng thái trở lại `Đã xác minh`.

Tenant safety với app/OA/store khác đã được Codex kiểm tra tự động trong SQL và route tests; không
yêu cầu anh phải có thêm một OA thật chỉ để chạy lại trường hợp này.

### Điều kiện còn thiếu để test live

Kiểm tra production ngày 2026-09-21 cho thấy Bảo Lương đã có OA ID và Mini App ID, nhưng:

- `has_access_token = false`
- `has_app_secret = false`
- `oa_config_enabled = false`

Vì vậy Test 2B–2D phải chờ hai credential thật; đây là phụ thuộc Zalo, không phải lỗi code.

## Bản vá OA API app cha — Task 1

Đã tách `OA API App ID` khỏi `Zalo Mini App ID`. Trường này nhận App ID của ứng dụng cha tích hợp
Zalo OA, có thể dùng chung giữa nhiều OA quán; Mini App ID vẫn chỉ dành cho QR/deploy.

### Kết quả tự động do Codex đã chạy — không cần chạy lại

- `admin-web/lib/actions/mevo-stores.test.ts`: **6/6 PASS**.
- `npx tsc --noEmit`: exit `0`.
- ESLint các action/form OA: exit `0`.
- `git diff --check`: sạch.

### Test OA-parent Task 1 — checkpoint kỹ thuật

Không có thao tác live ở checkpoint này vì migration `061` chưa áp production và route vẫn đang dùng
logic cũ cho tới Task 2. Nghiệm thu checkpoint bằng kết quả tự động phía trên; không nhập lại
credential hoặc sửa webhook Mini App trong giai đoạn này.

## Bản vá OA API app cha — Task 2

Route webhook và RPC claim nay đối chiếu `store_zalo_configs.zalo_oa_app_id`, tức App ID của app
cha tích hợp OA. `store_app_configs.zalo_mini_app_id` chỉ còn dùng cho Mini App/QR và không được
dùng để xác minh OA webhook.

### Kết quả tự động và production migration

- Route + action + cấu hình: **20/20 PASS**.
- SQL onboarding với Mini App ID và OA API App ID khác nhau: **5/5 PASS**.
- TypeScript, ESLint phạm vi thay đổi và production build: **PASS**.
- Migration `061_store_zalo_oa_app_identity` đã chạy production.
- Migration `062_reservation_oa_app_identity` đã chạy production.
- Bảo Lương hiện có `zalo_oa_app_id = NULL`; chưa ghi đè secret hoặc Mini App ID. Cần nhập App ID
  `4311670425529575295` trong cockpit trước khi test live.

## Bản vá giao diện và chẩn đoán 403 — checkpoint

- Khung **Zalo — cấu hình tích hợp** gom Mini App/onboarding, ZaloPay Checkout và Official
  Account/Webhook trên cùng một vùng.
- Checkout Secret, OA Access Token và OA API App Secret có nút mắt để superadmin chủ động xem/ẩn
  giá trị; trạng thái public và onboarding không trả các secret này.
- Khi webhook trả 403, log production chỉ ghi `appIdMatches`, `oaIdMatches`, App ID nhận được và
  OA ID nhận được; không ghi token, secret hoặc chữ ký.
- Commit deploy: `bea6211`; production deployment đã Ready.

### Test giao diện/live cần chạy

1. Mở trang chi tiết Bảo Lương, xác nhận ba định danh hiển thị riêng: OA ID, Mini App ID và OA API
   App ID.
2. Bấm mắt từng key để xem/ẩn, refresh trang và xác nhận giá trị vẫn giữ nguyên.
3. Trong Zalo Developer Console của **MEVO SOLUTION**, bấm **Kiểm tra** webhook.
4. Nếu còn 403, báo lại thời điểm bấm; Codex sẽ đọc hai cờ `appIdMatches`/`oaIdMatches` trong log để
   sửa đúng nguyên nhân, không cần gửi secret.
