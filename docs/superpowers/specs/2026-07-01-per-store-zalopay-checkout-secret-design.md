# ZaloPay Checkout — secret theo từng quán — Thiết kế

> Ngày 2026-07-01. Sub-project 1/2 của việc chuẩn bị nhân bản mini-app (mục 2 tách ra sau,
> xem "hướng dẫn nhân bản mini-app" — file riêng). Bản v2 sau review của CODEX (tách secret
> ra bảng riêng, không lưu trong `stores`).

## 1. Bối cảnh

Thanh toán hiện dùng **Zalo Checkout SDK** (`Payment.createOrder`), ký/verify bằng **một
secret duy nhất** đọc từ biến môi trường toàn cục `ZALO_CHECKOUT_SECRET_KEY` trong 2 edge
function `checkout-create-mac` và `checkout-notify`. Việc này đúng cho 1 quán (Phở Gà Pubu)
nhưng **chặn nhân bản** — quán thứ 2 có merchant ZaloPay riêng thì không có chỗ nào lưu secret
riêng của quán đó.

Ba cột có sẵn `stores.zalopay_app_id/key1/key2` là tàn dư từ thiết kế ban đầu (model ZaloPay
Open API cổ điển, app_id + key1 + key2) — **không áp dụng** cho Checkout SDK hiện tại (chỉ cần
1 secret). Giữ nguyên, không dùng, dọn sau (không chặn).

**Ràng buộc bắt buộc (review CODEX):** `stores` có RLS `anon_read_stores FOR SELECT USING
(is_active)` — SELECT toàn cột, RLS chỉ lọc dòng không lọc cột. Secret **không được** thêm
làm cột của `stores` vì rủi ro lộ qua REST API nếu sau này có chỗ `select('*')`. Phải nằm bảng
riêng không có policy nào cho anon/authenticated.

## 2. Mục tiêu

- Mỗi quán có secret Checkout SDK + Mini App ID riêng, lưu tách biệt, chỉ edge function
  (service role) đọc được.
- `checkout-notify` map đúng quán bằng `appId` **trước khi** verify MAC (chặn callback giả
  mạo từ app khác ngay từ đầu).
- Đối chiếu `order.store_id` khớp với quán suy ra từ `appId` — chặn callback đúng chữ ký nhưng
  gắn nhầm đơn của quán khác.
- Phở Gà Pubu **không bị gián đoạn** trong lúc chuyển đổi.

## 3. Thay đổi Database

Migration mới `supabase/migrations/017_store_checkout_configs.sql` — **chỉ tạo bảng, không
chứa secret thật**:

```sql
create table store_checkout_configs (
  store_id uuid primary key references stores(id) on delete cascade,
  zalo_mini_app_id text not null unique,
  zalo_checkout_secret_key text not null,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table store_checkout_configs enable row level security;
-- Cố ý KHÔNG tạo policy nào: anon/authenticated không có quyền gì trên bảng này.
-- Chỉ service role (dùng trong 2 edge function, bypass RLS) đọc/ghi được.
```

`zalo_mini_app_id` chỉ sống trong bảng này — không lặp lại ở `stores` (hiện chưa có chỗ nào
khác cần đọc nó ngoài 2 edge function; tránh 2 nguồn sự thật).

`updated_at` dùng trigger `update_updated_at()` có sẵn (đã dùng cho bảng khác trong
`001_init.sql`) để tự cập nhật khi đổi secret — biết được "đổi lúc nào" tối thiểu. Audit log
đầy đủ (ai đổi, đổi gì) chưa cần v1, ghi backlog.

**Set secret thật cho Pubu — làm SAU khi migration áp dụng, bằng SQL thủ công qua Supabase
MCP (`execute_sql`), KHÔNG viết secret vào file migration / không commit vào git:**

```sql
insert into store_checkout_configs (store_id, zalo_mini_app_id, zalo_checkout_secret_key)
select id, '383290948854768685', '<secret lấy từ Supabase Edge Function secret ZALO_CHECKOUT_SECRET_KEY hiện tại>'
from stores where slug = 'pho-ga-pubu';
```

## 4. Thay đổi `checkout-create-mac`

- Query `order` thêm cột `store_id` (đã có sẵn trên bảng `orders`, chỉ cần select thêm).
- Query `store_checkout_configs` theo `store_id` lấy `zalo_checkout_secret_key`, `is_enabled`.
- Thiếu row hoặc `is_enabled = false` → trả `400 { error: "Quán chưa bật ZaloPay" }`, không
  crash, không lộ chi tiết nội bộ.
- Dùng secret lấy được thay cho `Deno.env.get('ZALO_CHECKOUT_SECRET_KEY')`.
- Phần còn lại (tính `amount` từ DB, build MAC) giữ nguyên logic hiện tại.

## 5. Thay đổi `checkout-notify`

Thứ tự xử lý (đúng tinh thần "không tin gì trước khi verify"):

1. Parse `body.data`. Thiếu `data.appId` (rỗng/undefined) → `resp(-1, 'unknown app')` ngay,
   không đi tiếp.
2. Query `store_checkout_configs` theo `zalo_mini_app_id = data.appId`. Không tìm thấy →
   `resp(-1, 'unknown app')`.
3. Verify MAC bằng `zalo_checkout_secret_key` của **đúng config vừa tra được** (không dùng
   secret toàn cục nữa). Sai MAC → `resp(-1, 'invalid mac')` (giữ hành vi cũ).
4. **Chỉ sau khi MAC hợp lệ** mới `decodeURIComponent` + parse `extradata.orderId` (giữ
   nguyên, không đổi).
5. **Giữ đúng thứ tự gốc — check `resultCode` NGAY sau khi parse `extradata`, TRƯỚC khi query
   `order`:** `resultCode !== 1` → ack ngay `resp(1, 'payment failed acknowledged')`, **không**
   đụng DB, **không** cần order/store/amount tồn tại. Lý do (P1 review): nếu order đã bị xoá
   hoặc dữ liệu amount lệch kiểu, để các check đó chạy trước sẽ khiến callback thất bại (mà ta
   không cần làm gì) trả `-1` → Zalo hiểu là lỗi và **retry** không cần thiết. Có thể log
   best-effort `appOrderId` để theo dõi, nhưng không được biến failed payment thành retry loop.
6. (Chỉ tiếp tục nếu `resultCode === 1`.) Query `order` theo `appOrderId` → thiếu →
   `resp(-1, 'order not found')` (giữ nguyên).
7. **Mới:** so `order.store_id === config.store_id` (config tra được ở bước 2) → lệch →
   log lỗi + `resp(-1, 'store mismatch')` — chặn trường hợp chữ ký đúng của quán A nhưng gắn
   nhầm order của quán B.
8. So `amount === order.total_amount` (giữ nguyên, đã có).
9. Update `status = 'confirmed'`, `zalopay_trans_id` — idempotent bằng `where status='pending'`
   (giữ nguyên).

## 6. Không đổi

- `ZALO_PAYMENT_METHOD` (sandbox/production) vẫn là env toàn cục — đây là cấu hình môi
  trường deploy (test vs live), không phải secret riêng quán. Nếu sau này có quán chạy khác
  môi trường nhau thì tách khi cần (YAGNI).
- Cột `stores.zalopay_app_id/key1/key2` — giữ nguyên, không dùng, ghi backlog dọn sau.
- Toàn bộ logic tính tiền từ DB, snapshot order_items — không đổi.

## 7. Rollout an toàn cho Pubu (không gián đoạn)

Thứ tự bắt buộc:
1. Chạy migration 017 (tạo bảng rỗng) — không ảnh hưởng gì đang chạy vì chưa có code nào đọc
   bảng này.
2. Insert dòng config cho Pubu bằng secret thật (mục 3) — verify bằng SELECT lại, không log
   secret ra console/response.
3. Sửa code 2 edge function, deploy — sau bước 2 đã có data nên deploy xong chạy được ngay,
   không có khoảng trống thiếu secret.
4. Test thật: đặt 1 đơn ZaloPay sandbox/thật ở Pubu → xác nhận `confirmed` đúng như trước.
5. Xoá biến môi trường `ZALO_CHECKOUT_SECRET_KEY` khỏi 2 edge function (dọn, không bắt buộc
   ngay, nhưng nên làm để tránh nhầm "còn secret cũ" sau này).

## 8. Testing (thủ công, TESTING.md)

Thêm mục mới "ZaloPay per-store secret":
1. Đặt đơn ZaloPay ở Pubu như bình thường (giao dịch thật/sandbox, config đúng từ đầu đến
   cuối) → PASS nếu xác nhận `confirmed` đúng như trước khi đổi.
2. Test "unknown app" **không dùng giao dịch thật đang chờ xử lý** (tránh rủi ro Zalo retry
   callback sau khi trả lại config đúng, làm confirm muộn 1 đơn cũ ngoài ý muốn). Thay vào đó:
   gọi thẳng `checkout-notify` bằng request giả lập (`curl`/Postman) với `data.appId` không
   tồn tại trong `store_checkout_configs` (và MAC bất kỳ, vì sẽ bị chặn ở bước tra `appId`
   trước khi verify MAC) → PASS nếu response `resp(-1, 'unknown app')` và **không có order nào
   bị đổi trạng thái**.
3. (Tuỳ chọn, không bắt buộc) Test "store mismatch": capture lại body callback thật đã nhận
   được của 1 đơn Pubu (đã xử lý xong, không dùng lại đơn đang pending) → sửa `extradata`
   trỏ sang 1 `orderId` giả không thuộc quán đó → gọi lại `checkout-notify` với `appId`/MAC
   đúng của Pubu → PASS nếu bị reject (`order not found` hoặc `store mismatch` tuỳ có tìm thấy
   order giả hay không) và không đơn thật nào bị ảnh hưởng.
4. (Không thể test cross-store thật vì chỉ có 1 quán — bước 2/3 là cách giả lập trong giới hạn
   hiện tại, không động đến giao dịch thật đang chờ xử lý.)

## 9. Ngoài phạm vi

- Chưa cần admin UI để MEVO nhập secret qua form (v1 vẫn thao tác SQL trực tiếp, đúng quyết
  định "v1 MEVO làm hết" trong CLAUDE.md).
- Chưa dọn cột `zalopay_app_id/key1/key2` cũ.
- Chưa có audit log đầy đủ (ai đổi secret, đổi lúc nào ngoài `updated_at`) — ghi backlog, làm
  khi có nhiều quán/nhiều người thao tác hơn.
- Việc nhân bản mini-app (tạo Zalo Mini App mới, `zmp deploy`, tạo QR...) — xem hướng dẫn
  riêng (skill), không nằm trong spec này.
