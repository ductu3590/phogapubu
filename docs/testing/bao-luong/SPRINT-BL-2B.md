# Bảo Lương — Sprint BL-2B: thông báo Zalo OA cho chủ quán

Ngày cập nhật: 2026-09-21
Trạng thái: **Task 1 chờ PASS**

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
