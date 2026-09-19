# Bảo Lương — Sprint BL-2A: POS và Admin Mobile đặt bàn

**Trạng thái:** ⏳ Task 1 hoàn tất code, chờ anh Tú nghiệm thu.

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
