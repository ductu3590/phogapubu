# Bảo Lương — Sprint BL-2B ZCA relay: thông báo nội bộ

Ngày cập nhật: 2026-09-23

Trạng thái: **Task 1–4 đã triển khai — chờ anh Tú nghiệm thu Test 4**

> Production hiện đã có request relay thành công. Chi tiết triển khai và bằng chứng E2E nằm ở
> Task 4; Group ID, HMAC và các secret không được ghi trong tài liệu này.

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

## Task 3 — cockpit MEVO cấu hình nhóm Zalo

Panel OA recipient cũ trên cockpit quán được thay bằng **Thông báo nội bộ (best-effort)**.
Các form credential Mini App, OA/Webhook và ZaloPay vẫn giữ nguyên. Chỉ MEVO superadmin có thể:

- lưu Group ID (sau khi lưu chỉ hiện `Đã lưu (ẩn)`, không trả ID ra client);
- bật/tắt channel; tắt không xoá delivery đã có;
- tạo delivery `owner_test` và gọi Edge Function khi bấm **Gửi tin thử**.

Nút Lưu chỉ ghi DB, không gọi relay. Bởi Task 4 chưa tạo Database Webhook/deploy function nên không
có booking thật nào có thể tự gửi tin ở giai đoạn này.

## Test 3A — tự động (Codex đã chạy, không cần chạy lại)

```text
reservation-group-notifications action/UI: 6/6 PASS
toàn bộ Admin Web: 353/353 PASS
npx tsc --noEmit: PASS
npm run build: PASS
```

Các case action/UI bao phủ: superadmin-only, state không lộ Group ID, lưu/tắt không fetch relay,
test delivery snapshot và text/response không lộ Group ID.

## Test 3B — UI local (chưa deploy)

Tại worktree, chạy `cd admin-web; npm run dev`, đăng nhập bằng MEVO superadmin rồi mở
`/mevo/stores/<Bảo Lương>`:

1. Trong khung **Zalo — cấu hình tích hợp**, xác nhận panel **Thông báo nội bộ** xuất hiện;
   panel yêu cầu OA recipient/mã kết nối không còn hiển thị.
2. Chưa nhập Group ID: trạng thái `Chưa lưu`; không bấm Gửi tin thử được.
3. Nhập một Group ID thử, **bỏ chọn Bật cảnh báo**, Lưu: trang không gửi tin và reload chỉ ghi
   `Đã lưu (ẩn)`, không cho nhìn lại ID.
4. Bấm **Tắt cảnh báo**: trạng thái `Đang tắt`; booking/POS không bị ảnh hưởng.

Không bật bằng Group ID vận hành hoặc bấm Gửi tin thử trước Task 4 allowlist + secret + deploy.

**PASS:** `Task 3 PASS` — 2026-09-22. Task 4 chỉ bắt đầu gửi thật sau khi Supabase deploy được
Edge Function, HMAC secret được nhập và relay xác nhận allowlist.

## Task 4 — Deploy, webhook và relay thật

Đã triển khai production:

- Edge Function `reservation-zca-notify` với `--no-verify-jwt`;
- secrets relay/HMAC đã được nhập trực tiếp qua terminal, không lưu trong repository;
- Database Webhook `trg_dispatch_reservation_zca_delivery_webhook` chỉ gọi Function khi có
  delivery `queued` của provider `zca_group`;
- channel Bảo Lương được bật sau khi relay allowlist; Group ID không được ghi trong tài liệu này.

## Test 4A — tin thử từ cockpit: PASS

MEVO superadmin đã bấm **Gửi tin thử**. Relay trả `sent`/`OK`; một tin thử đến đúng nhóm vận hành.

## Test 4B — booking E2E và idempotency: PASS

Ngày 2026-09-23, Codex tạo đúng một reservation kiểm thử rõ nhãn **KIỂM THỬ RELAY BL-2B**,
2 khách, giờ đến 19:00 ngày hôm sau. Kết quả production:

```text
reservation: pending
delivery: owner_new_reservation / zca_group
attempt_count: 1
status: sent
provider_code: OK
```

Relay hoàn tất sau khoảng 7 giây. Gọi lại `create_reservation` cùng `client_request_id` cho kết quả
`created=false`; kiểm tra DB còn đúng **1** customer-created event và **1** ZCA delivery. Nhóm chỉ
nhận một tin. Reservation thử được giữ ở `pending` để nhìn thấy trên hàng đợi và phải được chủ quán
đóng tay như một bản ghi test, không xóa trực tiếp.

## Test 4C — giới hạn phạm vi hiện tại

Booking tạo từ màn Mini App chưa thể test vì form đặt bàn thuộc **BL-3**, không thuộc BL-2B.
Đường được kiểm ở Test 4B chính là RPC `create_reservation` mà BL-3 sẽ gọi; trigger/outbox/Function
không phụ thuộc client. Case bot offline và `PROVIDER_REJECTED` đã được unit test ở Task 2:
delivery chuyển `failed` hoặc `action_required`, booking/POS không bị rollback và không tự gửi lại.

## Test 4D — anh Tú nghiệm thu

1. Mở nhóm Zalo vận hành: xác nhận chỉ có **một** tin về booking `KIỂM THỬ RELAY BL-2B`.
2. Mở `/admin/reservations`: xác nhận booking thử có trạng thái `Chờ duyệt`/`pending`, không ảnh hưởng
   các thao tác POS khác. Sau khi xem, chủ quán đóng tay bản ghi test theo quy trình vận hành.
3. Trên cockpit Bảo Lương, xác nhận trạng thái gửi gần nhất là `Đã gửi`; tắt channel rồi bật lại chỉ
   khi cần dừng/tái mở cảnh báo — không cần gửi thêm booking thử.

**Chờ nghiệm thu:** trả `BL-2B ZCA PASS` nếu ba bước trên đúng. Không chuyển BL-2C hoặc BL-3 trước
khi nhận PASS.
