# Bảo Lương — Sprint BL-2B ZCA relay: cảnh báo nhóm Zalo nội bộ

Ngày cập nhật: 2026-09-22

Trạng thái: **Task 1 PASS — Task 2 chờ nghiệm thu**

> Chưa có request HTTP nào đến `zalo.soccernow.net`. Migration production đã áp; channel vẫn trống,
> chưa nhập HMAC secret, chưa bật channel và chưa gửi tin Zalo.

## Task 1 — Schema channel và outbox relay

Migration `063_reservation_zca_group_notifications.sql` thêm:

- cấu hình cảnh báo theo từng quán (`none`/`zca_group`/`zalo_oa`), mặc định tắt;
- snapshot provider + group ID trong delivery để retry cùng notification ID không đổi đích gửi;
- outbox chỉ sinh cho channel `zca_group` đang bật; không còn phụ thuộc OA recipient;
- RPC claim/finish riêng, chỉ service role dùng được và không trả số điện thoại/ghi chú khách;
- disabled/`none` không tạo delivery, nên không có gì có thể gọi relay.

## Test 1A — tự động (Codex đã chạy, không cần chạy lại)

Tại worktree BL-2B ZCA, kết quả:

```text
supabase/tests/063_reservation_zca_group_notifications.test.mjs: 5/5 PASS
reservation/OA regression 052 + 054 + 057 + 059 + 063: 34/34 PASS
```

Các case gồm channel bật/tắt, snapshot group/idempotency, RLS anon/authenticated, claim đúng token
và không lộ số điện thoại/ghi chú.

## Test 1B — migration production

Migration production đã chạy sau Task 1 PASS. Kết quả kiểm tra quyền:

```sql
select
  has_table_privilege('anon', 'public.store_reservation_notification_channels', 'SELECT') as anon_channel_select,
  has_table_privilege('authenticated', 'public.store_reservation_notification_channels', 'UPDATE') as auth_channel_update,
  has_function_privilege('anon', 'public.claim_reservation_zca_notification(uuid,uuid)', 'EXECUTE') as anon_claim,
  has_function_privilege('service_role', 'public.claim_reservation_zca_notification(uuid,uuid)', 'EXECUTE') as service_claim;
```

Kết quả:

```text
anon_channel_select = false
auth_channel_update = false
anon_claim = false
service_claim = true
```

`channel_count = 0`: không tự tạo channel Bảo Lương. Task 3 mới có cockpit để superadmin lưu group
và Task 4 mới bật sau allowlist relay.

**PASS:** `Task 1 PASS` — 2026-09-22.

## Task 2 — sender HMAC raw-body và Edge Function

Tạo sender `zca-relay.ts`, handler `reservation-zca-notify` và HTTP entrypoint. Sender serialise
payload đúng một lần, ký HMAC SHA-256 trên `timestamp + '.' + raw UTF-8 bytes`, timeout 20 giây và
gửi chính bytes đó. Handler claim/finish delivery qua RPC Task 1; không có SĐT, ghi chú, HMAC,
signature hay group ID trong log/response.

## Test 2A — tự động (Codex đã chạy, không cần chạy lại)

```text
supabase/functions/_shared/zca-relay.test.ts
supabase/functions/reservation-zca-notify/handler.test.ts
14/14 PASS
```

Bao phủ: vector HMAC raw bytes cố định, response `ok:true`, đủ năm mã relay, HTTP/JSON/network
lỗi, no-op delivery đã claim và mapping `sent`/`failed`/`action_required`. Test cũng khẳng định text
gửi relay không chứa SĐT hoặc ghi chú.

Lưu ý môi trường Windows hiện không cài Deno CLI, nên không chạy được type-check Deno cục bộ; unit
test TypeScript chạy qua Vitest dùng dependency runtime của workspace chính. Chưa deploy Edge
Function và chưa gọi relay thật.

## Test 2B — nghiệm thu an toàn

Anh chỉ cần đọc nhanh thay đổi; không có thao tác UI/production ở Task 2. Việc deploy, nhập secret,
allowlist, tạo Database Webhook và gửi tin thử thuộc Task 4 sau khi cockpit Task 3 đã có.

**PASS:** Anh Tú trả `Task 2 PASS`. Khi đó mới làm Task 3 cockpit cấu hình; vẫn không bật channel
hay gọi relay thật.
