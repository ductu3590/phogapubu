# Bảo Lương — Sprint BL-2B ZCA relay: cảnh báo nhóm Zalo nội bộ

Ngày cập nhật: 2026-09-22

Trạng thái: **Task 1 hoàn tất kỹ thuật — chờ nghiệm thu**

> Không có request HTTP nào đến `zalo.soccernow.net` trong Task 1. Chưa áp migration production,
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

Codex sẽ chạy migration production sau khi anh xác nhận Task 1 PASS. Sau đó, trong Supabase SQL
Editor kiểm tra:

```sql
select
  has_table_privilege('anon', 'public.store_reservation_notification_channels', 'SELECT') as anon_channel_select,
  has_table_privilege('authenticated', 'public.store_reservation_notification_channels', 'UPDATE') as auth_channel_update,
  has_function_privilege('anon', 'public.claim_reservation_zca_notification(uuid,uuid)', 'EXECUTE') as anon_claim,
  has_function_privilege('service_role', 'public.claim_reservation_zca_notification(uuid,uuid)', 'EXECUTE') as service_claim;
```

Kỳ vọng:

```text
anon_channel_select = false
auth_channel_update = false
anon_claim = false
service_claim = true
```

Không tự tạo channel Bảo Lương trong Task 1. Bảng channel trống sau migration là đúng; Task 3 mới
có cockpit để superadmin lưu group và Task 4 mới bật sau allowlist relay.

**PASS:** Anh Tú trả `Task 1 PASS`. Khi đó mới bắt đầu Task 2 sender HMAC, vẫn chỉ unit test/mock,
không gọi relay thật.
