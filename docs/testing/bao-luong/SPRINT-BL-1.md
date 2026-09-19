# Bảo Lương — Sprint BL-1: Nền tảng đặt bàn

**Trạng thái:** ⏳ Task 1 chờ nghiệm thu

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
