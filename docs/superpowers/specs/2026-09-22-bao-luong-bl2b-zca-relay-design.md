# Bảo Lương BL-2B — Relay cảnh báo nhóm Zalo nội bộ

Ngày: 2026-09-22

Trạng thái: đã duyệt hướng kiến trúc, chờ anh Tú duyệt spec trước khi viết implementation plan

## 1. Quyết định và lý do

Zalo OA Open API bị loại khỏi đường găng BL-2B. Runtime đã trả mã `-224`, yêu cầu OA Tier Package
có chi phí khoảng 2,5 triệu đồng/tháng, không phù hợp giai đoạn pilot.

Pilot dùng hạ tầng `zca-js` tự quản lý sẵn có để tài khoản Zalo bot gửi một cảnh báo vào nhóm Zalo
vận hành của từng quán. `zca-js` là API không chính thức; bản thân tài liệu thư viện cảnh báo việc
dùng có thể trái chính sách Zalo và làm tài khoản bị vô hiệu hóa. Vì vậy đây là **kênh best-effort**,
không phải nguồn sự thật, không phải kênh gửi khách hàng, và không được làm thay đổi trạng thái
booking.

## 2. Phạm vi pilot

Nhóm Bảo Lương được anh Tú tạo thủ công gồm ba thành viên:

1. Chủ quán bằng Zalo chính chủ;
2. Một Zalo nick phụ chuyên làm bot;
3. Một Zalo của thu ngân.

Khi khách tạo booking, nhóm nhận đúng một tin tóm tắt:

```text
📅 Có đặt bàn mới
Khách: <tên> · <số người> khách
Đến: <dd/MM/yyyy HH:mm, Asia/Ho_Chi_Minh>
Mở để xử lý: <admin-origin>/admin/reservations
```

Tin không chứa số điện thoại, ghi chú khách hay token. Người có quyền mở admin mới xem chi tiết.
Booking vẫn `pending` và có card trên POS/Admin Mobile dù relay gửi thành công, thất bại hay không
có relay.

Ngoài phạm vi:

- gửi tự động cho khách, bao gồm xác nhận booking và nhắc 60 phút;
- trả lời/nhận lệnh booking từ nhóm Zalo;
- dùng tài khoản Zalo cá nhân chính của chủ quán làm bot;
- dùng `zca-js` cho Pubu hoặc quán khác mặc định;
- xóa OA onboarding/migration đã có; chúng bị tắt khỏi đường gửi Bảo Lương và giữ lịch sử audit.

## 3. Quy trình vận hành

1. Khách tạo reservation qua Mini App; `reservation_events.created` và hàng đợi POS vẫn là nguồn
   sự thật.
2. Một outbox delivery nội bộ được tạo idempotent cho sự kiện đó.
3. Edge Function dựng tin tối thiểu rồi gọi HTTPS relay `zca-js` tự quản lý.
4. Relay dùng bot đã đăng nhập để gửi vào đúng nhóm quán và trả trạng thái provider về Edge Function.
5. Chủ quán/thu ngân mở link, đăng nhập Admin Mobile, rồi xác nhận/từ chối/sắp bàn trong POS.
6. Relay thất bại hoặc bot mất phiên: delivery hiện lỗi trên cockpit; POS/Admin Mobile vẫn có hàng
   đợi và âm báo. Nếu booking cần xử lý gấp, chủ quán/thu ngân xử lý trực tiếp hoặc gọi điện.

Không có thao tác xác nhận, từ chối hay thu tiền nào được phép thực hiện trong Zalo nhóm.

## 4. Kiến trúc và biên bảo mật

```text
reservation_events.created
  -> reservation notification outbox (Supabase, idempotent)
  -> Supabase Edge Function (claim delivery)
  -> HTTPS POST ký HMAC tới zca relay riêng
  -> Zalo bot phụ -> nhóm Zalo vận hành
```

Edge Function là phía duy nhất đọc reservation và dựng nội dung. Relay hiện có endpoint
`POST https://zalo.soccernow.net/mevo/relay`; Edge Function lấy URL này từ secret
`MEVO_ZCA_RELAY_URL`. Relay không nhận Supabase service-role key, không gọi trực tiếp database,
không giữ thông tin khách ngoài request đang xử lý.

Mỗi request có body JSON:

```json
{
  "version": 1,
  "notification_id": "uuid delivery",
  "store_id": "uuid",
  "group_id": "string cấu hình kín theo quán",
  "text": "nội dung tóm tắt đã dựng"
}
```

Headers bắt buộc:

```text
Content-Type: application/json
X-Mevo-Timestamp: <Unix seconds>
X-Mevo-Signature: sha256=<HMAC-SHA256(secret, timestamp + "." + raw body)>
```

`timestamp` là Unix giây nguyên, `raw body` là chính bytes UTF-8 gửi qua `fetch`; Edge Function
phải serialize đúng một lần, ký `timestamp + '.' + raw body`, sau đó gửi lại đúng bytes đó, không
nén request. Relay từ chối chữ ký sai, timestamp lệch quá 5 phút, `notification_id` đã xử lý, hoặc
`group_id` không nằm trong allow-list của store. Relay lưu idempotency key đủ lâu để retry Edge
Function không tạo tin thứ hai. Chỉ HTTPS, URL relay và HMAC secret `MEVO_HMAC_SECRET` để trong
Supabase Edge secrets; group ID và enable/disable để trong bảng cấu hình theo store, không trả cho
anon/staff.

Nhóm thử hiện có ID `3531071701486961908` (`TEST-ZALO BL`). Giá trị này chỉ được nhập vào cấu
hình Bảo Lương sau khi phía relay allowlist cặp canonical `store_id:group_id`; không được hardcode
vào Mini App, Admin Web hay Edge Function.

Relay trả một trong các kết quả chuẩn:

```ts
type RelayResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; code: 'BOT_OFFLINE' | 'GROUP_NOT_FOUND' | 'RATE_LIMITED' | 'PROVIDER_REJECTED' | 'INVALID_REQUEST'; message: string; retryable: boolean }
```

`BOT_OFFLINE`, timeout, HTTP 429 và HTTP 5xx là retryable. `PROVIDER_REJECTED` là trạng thái mơ
hồ: không tạo delivery mới hay retry vòng lặp; relay dedup cùng `notification_id` nên chỉ cho phép
kiểm tra/retry thủ công cùng ID. Chữ ký sai, group sai và request sai là `action_required`. HTTP
2xx không đủ để coi delivery thành công: body phải có `ok: true`.

## 5. Cấu hình theo quán và quan sát

Thêm cấu hình notification channel theo store thay vì hardcode Bảo Lương:

- `provider`: `none` | `zca_group` | `zalo_oa` (để mở rộng, chỉ `zca_group` được triển khai pilot);
- `is_enabled`;
- `destination_group_id` chỉ dùng với `zca_group`;
- `updated_by`, `updated_at` cho audit.

Chỉ MEVO superadmin cấu hình group và gửi tin thử. Cockpit hiển thị không lộ group ID đầy đủ:

- channel đang bật/tắt;
- bot/relay health lần cuối;
- lần gửi thử gần nhất và kết quả;
- delivery cuối cùng lỗi/sent cùng mã lỗi đã rút gọn;
- CTA tắt channel ngay khi bot gặp rủi ro.

Không hiển thị, log hoặc trả browser HMAC secret, cookie/session zca-js hoặc Zalo UID bot.

## 6. Phục hồi và trách nhiệm vận hành

| Tình huống | Hệ thống | Người vận hành |
| --- | --- | --- |
| Relay gửi thành công | Ghi delivery `sent`; POS vẫn chờ chủ quán xử lý | Mở Admin Mobile/POS từ link |
| Relay timeout/mất phiên bot | Ghi `failed`, retry có backoff hữu hạn; cockpit báo đỏ | Đăng nhập lại bot, retry cùng delivery |
| Bot bị Zalo hạn chế/vô hiệu hóa | Tắt channel; không tự đổi sang tài khoản khác | Dùng POS/Admin Mobile + điện thoại; tạo bot mới nếu chấp nhận rủi ro |
| Không có mạng/relay | Không rollback booking | Dùng hàng đợi POS hoặc gọi điện |
| Khách cần xác nhận/nhắc 60 phút | Không gửi zca-js cho khách | Khách xem Mini App; quán gọi điện khi cần |

Số điện thoại là fallback vận hành chính cho khách trong pilot. Không có SLA giao tin nhóm và không
đánh dấu booking "đã thông báo" theo nghĩa chủ quán đã đọc.

## 7. Thay đổi với spec và plan cũ

- Thay mục 8 của spec 2026-09-10: OA/ZNS chuyển thành tùy chọn sau pilot; nhóm Zalo relay là cảnh
  báo nội bộ pilot.
- BL-2B đổi mục tiêu từ OA-scoped recipient sang relay group theo store.
- Plan `2026-09-21-bao-luong-bl2b-zalo-oa-owner-notifications.md` bị thay thế và không triển khai
  tiếp Task 3–4. Migration OA hiện hữu được giữ, không xóa dữ liệu hay secret.
- Một implementation plan mới chỉ được viết sau khi spec này được anh Tú duyệt.

## 8. Tiêu chí nghiệm thu tương lai

1. Một reservation event tạo tối đa một tin nhóm, kể cả retry/reconnect.
2. Tin không chứa số điện thoại/ghi chú/token và link mở đúng reservation queue của quán.
3. Relay trả lỗi hoặc bot offline không làm mất booking/POS queue, không rollback trạng thái.
4. Chỉ MEVO superadmin cấu hình, test, retry hoặc tắt channel; staff/owner/anon không xem group ID,
   HMAC secret hay session bot.
5. Pubu không thay đổi hành vi, và store có `provider = none` không gọi relay.
6. Khi relay bị tắt, POS/Admin Mobile và nút gọi điện vẫn đủ để vận hành booking.
