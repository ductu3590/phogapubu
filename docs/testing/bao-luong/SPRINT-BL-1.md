# Bảo Lương — Sprint BL-1: Nền tảng đặt bàn

**Trạng thái:** ✅ Task 1–3 PASS · ⏳ Task 4 chờ nghiệm thu

Sprint này chỉ xây nền DB/RPC cho đặt bàn. Chưa có form Mini App hoặc màn POS mới ở Task 1.

## Task 1 — Schema, phân bổ bàn, audit và RLS

Đã áp migration `052_reservation_schema` lên Supabase production. Ba bảng mới đang rỗng: `reservations`, `reservation_tables`, `reservation_events`.

### Test 1A — Contract tự động

Tại thư mục gốc repo, chạy:

```powershell
$modulePath=(Resolve-Path 'admin-web/node_modules/@electric-sql/pglite/dist/index.js').Path
$env:PGLITE_MODULE=([System.Uri]::new($modulePath)).AbsoluteUri
node --test supabase/tests/052_reservation_foundation.test.mjs
```

✅ PASS khi đủ **3/3**:

1. `anon`/`authenticated` không đọc hoặc ghi trực tiếp reservation.
2. Booking mới chỉ có thể bắt đầu ở `pending`.
3. Không thể gán bàn của quán khác vào booking.

### Test 1B — Kiểm tra Supabase thật

Trong Supabase Table Editor, xác nhận có ba bảng rỗng `reservations`, `reservation_tables`, `reservation_events`.

Đối chiếu kỹ thuật đã được chạy sau deploy migration: cả ba bảng bật RLS; `anon` và `authenticated` không có quyền INSERT; `reservations` đã nằm trong `supabase_realtime`.

**Không cần test Mini App/POS ở Task 1.**

→ Báo Codex: `Task 1 PASS` hoặc gửi nguyên lỗi. Sau PASS mới làm Task 2 (slot và tạo booking khách).

## Task 2 — Slot server-side và booking khách bằng opaque token

Đã áp migration `053_reservation_customer_rpcs` lên Supabase. Task này mới là API nền; form đặt bàn Mini App sẽ thuộc BL-3.

### Test 2A — Contract tự động

Tại thư mục gốc repo, chạy:

```powershell
$modulePath=(Resolve-Path 'admin-web/node_modules/@electric-sql/pglite/dist/index.js').Path
$env:PGLITE_MODULE=([System.Uri]::new($modulePath)).AbsoluteUri
node --test supabase/tests/052_reservation_foundation.test.mjs
```

✅ PASS khi đủ **8/8**. Nhóm mới xác minh slot 15 phút theo giờ Việt Nam, giới hạn 30 phút/7 ngày, tạm nghỉ không chặn booking tương lai, idempotency, opaque token, đổi/hủy và công tắc bật/tắt đặt bàn.

### Test 2B — Cấu hình thật của Bảo Lương

Hiện Supabase đang ghi `serving_hours = []` cho Bảo Lương, nghĩa là mở cả ngày theo quy ước hệ thống. Nếu đây không phải chủ đích, chủ quán cần vào `/admin/settings` và lưu lại giờ phục vụ **11:00–22:00** trước khi nghiệm thu slot thực tế.

Sau khi lưu, chạy trong Supabase SQL Editor:

```sql
SELECT get_reservation_slots(
  (SELECT id FROM stores WHERE slug = 'bia-lau-bao-luong'),
  ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 1)
);
```

✅ PASS khi slot đầu là `11:00`, slot cuối là `21:45`, mỗi slot cách 15 phút. Không tạo booking thử trực tiếp trên production ở Task 2 vì chưa có form khách để quản lý token.

→ Báo Codex: `Task 2 PASS` hoặc gửi nguyên lỗi. Sau PASS mới làm Task 3 (chủ quán phân bổ/xác nhận bàn).

## Task 3 — Chủ quán phân bổ và xử lý đặt bàn

Đã áp migrations `054_reservation_operator_rpcs` và `054a_reservation_operator_grants` lên Supabase. `054a` siết quyền EXECUTE riêng cho Supabase: anon không gọi được bất kỳ RPC owner hoặc helper nội bộ nào.

### Test 3A — Contract tự động

Tại thư mục gốc repo, chạy:

```powershell
$modulePath=(Resolve-Path 'admin-web/node_modules/@electric-sql/pglite/dist/index.js').Path
$env:PGLITE_MODULE=([System.Uri]::new($modulePath)).AbsoluteUri
node --test supabase/tests/054_reservation_operator_flow.test.mjs
```

✅ PASS khi đủ **5/5**:

1. Staff và owner quán khác không xác nhận/no-show được.
2. Xác nhận phân bổ nhiều bàn, chặn trùng booking và bàn đang có khách.
3. Đặt tay ngoài giới hạn, duyệt yêu cầu đổi, no-show đều có audit.
4. MEVO chỉ xem theo quán đang chọn; owner không đọc quán khác.
5. `anon` không gọi được RPC owner hay helper `SECURITY DEFINER`.

### Test 3B — Supabase thật

Đã đối chiếu sau deploy: ba cột giữ lịch sử phân bổ (`released_at`, `released_by`, `release_reason`) tồn tại; các RPC owner có `anon_execute = false`, còn `authenticated_execute = true` trước khi kiểm role chủ quán bên trong RPC.

**Chưa có màn duyệt đặt bàn ở POS/admin trong Task 3; UI thuộc BL-2.**

→ Báo Codex: `Task 3 PASS` hoặc gửi nguyên lỗi. Sau PASS mới làm Task 4 (nhận khách, tạo mâm/session và hoàn tất bill).

## Task 4 — Nhận khách, mâm mở gọi chung và hoàn tất bill

Đã áp migrations `055_reservation_arrival` và `056_reservation_session_completion` lên Supabase. Task này chưa thêm màn hình POS: nó chỉ cung cấp hai RPC/contract để BL-2 gọi sau này.

### Test 4A — Contract tự động

Tại thư mục gốc repo, chạy:

```powershell
$modulePath=(Resolve-Path 'admin-web/node_modules/@electric-sql/pglite/dist/index.js').Path
$env:PGLITE_MODULE=([System.Uri]::new($modulePath)).AbsoluteUri
node --test supabase/tests/054_reservation_operator_flow.test.mjs
```

✅ PASS khi đủ **7/7**. Hai bài cuối phải cùng xác minh:

1. Chủ quán nhận booking 2 bàn tạo đúng **một** `table_session`/mâm, hai bàn cùng thuộc mâm, `is_open_ordering = true`; retry không mở thêm session/event/order.
2. Không thể nhận khách đè lên phiên đang mở. `staff_reset` giữ booking ở `arrived`; một booking khác chỉ thành `completed` sau `paid`, và retry chốt tiền không nhân đôi event.

### Test 4B — Kiểm tra Supabase thật

Trong Supabase SQL Editor, chạy:

```sql
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('arrive_reservation', 'close_table_session', 'close_table_sessions_bulk')
ORDER BY p.proname, args;
```

✅ PASS khi cả ba hàm đều có `anon_execute = false`, `authenticated_execute = true`. Quyền owner vẫn được kiểm trong thân RPC; không tạo booking thử trực tiếp trên production vì BL-2 chưa có UI vận hành để dọn dữ liệu test.

→ Báo Codex: `Task 4 PASS` hoặc gửi nguyên lỗi. Sau PASS mới làm Task 5 (typed Admin contract và cổng nghiệm thu BL-1).
