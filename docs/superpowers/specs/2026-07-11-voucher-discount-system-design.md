# MEVO — Hệ mã giảm giá (vòng quay + mã shipper) — Design

> Ngày: 2026-07-11
> Trạng thái: Đã duyệt design, chờ implementation plan
> Liên quan: mig 025 (vòng quay), mig 014 (doanh thu tiền thật), mig 017 serving hours (create_order v4), quyết định 2026-07-08 (chuyển khoản BANK)

## 1. Bài toán

1. **Vòng quay trúng mã giảm giá**: hiện vòng quay (v2.3) chỉ có giải `gift`/`none`. Cần thêm giải "mã giảm giá" — khách trúng thì **lần thanh toán sau tự động trừ tiền**, không bắt khách nhớ/nhập code.
2. **Giải hiện vật báo nhân viên**: khách trúng trà đá/topping thì nhân viên phải **được báo tự động để mang ra luôn**, thay vì chờ khách đưa màn hình.
3. **Mã giảm giá cố định cho shipper**: quán ưu đãi shipper (VD mỗi đơn giảm 5k). Mã phải **khoá theo Zalo UID của shipper** — khách thường biết code cũng không dùng được. Quán quản lý mã + lịch sử dùng trên admin web.

Hiện checkout **chưa có khái niệm mã giảm giá** → phải bổ sung từ gốc.

## 2. Quyết định nghiệp vụ (đã chốt với anh Tú)

| Câu hỏi | Quyết định |
|---|---|
| Loại giảm | **Cả hai**: số tiền cố định (VNĐ) và phần trăm (kèm trần giảm tối đa). Quán chọn khi cấu hình |
| Hạn mã vòng quay | **30 ngày** mặc định, quán chỉnh được số ngày trong cấu hình ô |
| Gắn UID shipper | **Kích hoạt lần đầu**: admin tạo mã đưa shipper; lần đầu shipper dùng mã trên máy mình → mã khoá vĩnh viễn vào Zalo UID đó |
| Giới hạn mã shipper | **N đơn/ngày** (giờ Asia/Ho_Chi_Minh), quán chỉnh được |
| Báo nhân viên giải hiện vật | **Kitchen card realtime + loa TTS** (tận dụng loa đọc đơn v2.2), nút "Đã đưa" |
| Phạm vi áp mã | **Mọi loại đơn** (dine_in + pickup + delivery), cả 2 loại mã |
| Cộng dồn | **1 đơn = tối đa 1 mã** (pilot) |

## 3. Kiến trúc: một thực thể `vouchers` dùng chung (Hướng A)

Mã vòng quay và mã shipper là **cùng một thực thể voucher**, khác nguồn gốc (`kind`).
Một logic validate + trừ tiền duy nhất nằm trong `create_order` (server-side).

**Nguyên tắc sở hữu (bổ sung sau review CODEX 2026-07-11):** voucher `code` chỉ là nhãn hiển thị/nhập tay. Quyền sở hữu và quyền sử dụng voucher **luôn xác định bằng `zalo_user_id`** (lấy từ `getUserID()` của Zalo Mini App) và **validate lại trong RPC `create_order`** — client hay code lộ ra ngoài đều không tạo ra quyền dùng.

Nguyên tắc giữ nguyên từ hệ hiện tại:
- **Client không bao giờ tự tính tiền.** `create_order` tính `total_amount` sau giảm; `checkout-create-mac` ký MAC trên số tiền đọc từ DB → thanh toán + doanh thu tự đúng.
- **Cắm thêm, tắt là như chưa từng tồn tại**: quán không tạo mã, không thêm ô voucher → mọi luồng y như hiện tại.
- **`orders.total_amount` = số tiền phải trả sau giảm** (không đổi ngữ nghĩa hạ nguồn: MAC, doanh thu mig 014, màn bếp, ZNS đều dùng cột này).

## 4. Database — migration `027_vouchers.sql`

### 4.1 Bảng `vouchers`

```sql
CREATE TABLE vouchers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id       uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  code           text NOT NULL,              -- lưu UPPER; hiển thị + nhập tay
  kind           text NOT NULL CHECK (kind IN ('spin','shipper')),
  label          text NOT NULL,              -- 'Giảm 10k vòng quay' / 'Shipper Tuấn Anh'
  discount_type  text NOT NULL CHECK (discount_type IN ('fixed','percent')),
  discount_value int  NOT NULL CHECK (discount_value > 0),  -- VNĐ hoặc %
  max_discount   int,                        -- trần giảm cho percent; NULL với fixed
  zalo_user_id   text,                       -- chủ mã. spin: gán khi trúng. shipper: NULL → khoá vào UID người dùng ĐẦU TIÊN
  max_uses       int,                        -- spin: 1. shipper: NULL = không giới hạn tổng
  daily_limit    int,                        -- shipper: N đơn/ngày giờ VN. NULL = không giới hạn
  expires_at     timestamptz,                -- spin: now() + N ngày. shipper: NULL
  spin_result_id uuid REFERENCES spin_results(id) ON DELETE SET NULL,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT spin_voucher_has_owner CHECK (kind <> 'spin' OR zalo_user_id IS NOT NULL)
);
CREATE UNIQUE INDEX uq_vouchers_store_code ON vouchers(store_id, upper(code));
CREATE INDEX idx_vouchers_store_user ON vouchers(store_id, zalo_user_id);
```

**Không có cột đếm lượt dùng.** Lượt dùng đếm qua `orders.voucher_id` → không bao giờ lệch.

### 4.2 Định nghĩa "voucher đang bị chiếm" (khoá mềm 30 phút)

Một voucher tính là *đã dùng 1 lượt* khi tồn tại đơn:
- `voucher_id` = voucher đó, VÀ
- `status <> 'cancelled'`, VÀ
- một trong ba: **`payment_method='cash'`** (đơn cash vào bếp ngay khi tạo — chiếm ngay), HOẶC **đã có tiền thật** (`zalopay_trans_id IS NOT NULL`), HOẶC **`created_at > now() - interval '30 minutes'`** (khoá mềm cho đơn online đang chờ thanh toán).

→ Khách bấm thanh toán online rồi bỏ ngang (đơn pending treo): mã bị giữ 30 phút rồi **tự nhả**, không cần cron dọn. Đơn huỷ (`cancelled`) nhả ngay. Đơn ZaloPay bỏ dở chuyển sang cash (mig 005) → thành đơn cash, chiếm mã — đúng, vì đơn đó đã vào bếp.

### 4.3 Cột mới trên `orders`

```sql
ALTER TABLE orders
  ADD COLUMN voucher_id      uuid REFERENCES vouchers(id) ON DELETE SET NULL,
  ADD COLUMN discount_amount int NOT NULL DEFAULT 0;
```

`total_amount` = `sum(order_items)` − `discount_amount` (đã trừ). Tổng gốc suy ra được từ `order_items` (đã snapshot giá) — không thêm cột subtotal.

### 4.4 Mở rộng `spin_rewards`

```sql
ALTER TABLE spin_rewards
  DROP CONSTRAINT spin_rewards_type_check,
  ADD  CONSTRAINT spin_rewards_type_check CHECK (type IN ('gift','none','voucher')),
  ADD COLUMN discount_type  text CHECK (discount_type IN ('fixed','percent')),
  ADD COLUMN discount_value int,
  ADD COLUMN max_discount   int,
  ADD COLUMN voucher_days   int NOT NULL DEFAULT 30;
```

### 4.5 RLS

- `vouchers`: operator store-scoped (`is_store_scoped_operator`) FULL; **anon KHÔNG truy cập trực tiếp** — mọi thứ qua RPC SECURITY DEFINER (giống spin mig 025).
- Realtime: thêm `spin_results` vào publication (Kitchen subscribe; RLS operator read đã có từ mig 025).

## 5. RPC

### 5.1 `spin_wheel` v2 (sửa)

Khi ô trúng có `type='voucher'`: trong **cùng transaction** tạo dòng `vouchers`:
- `kind='spin'`, `code` = 6 ký tự đầu của `spin_results.id` (khớp code đang hiển thị), `zalo_user_id` = của đơn, `max_uses=1`, `expires_at = now() + voucher_days`, `spin_result_id` trỏ về kết quả quay.
- **Bất biến: `kind='spin'` ⇒ `zalo_user_id NOT NULL`** (enforce bằng CHECK constraint). Nếu đơn **không có `zalo_user_id`** (cực hiếm — đơn quay được là đơn đã thanh toán): server **loại các ô `type='voucher'` khỏi lượt bốc thăm** (thêm điều kiện WHERE, weight tự chia lại cho các ô còn lại) — không tồn tại voucher spin vô chủ, không cần nhánh NULL-bind cho spin.
- Response thêm `voucher: {code, label, discount..., expires_at}` để client hiện "tự áp dụng lần sau, HSD ...".

### 5.2 `create_order` v5 (sửa — thêm 1 tham số)

Chữ ký: thêm `p_voucher_code text DEFAULT NULL` (11 tham số). Sau khi tính `v_total` từ order_items:

1. `SELECT * FROM vouchers WHERE store_id=p_store_id AND upper(code)=upper(p_voucher_code) FOR UPDATE` — khoá row chống 2 đơn dùng đồng thời.
2. Validate lần lượt, sai ở đâu `RAISE EXCEPTION` message tiếng Việt ở đó:
   - tồn tại + `is_active` + chưa `expires_at`;
   - `p_zalo_user_id IS NOT NULL` (bắt buộc — không có UID không dùng mã);
   - nếu `zalo_user_id` NULL → **khoá luôn**: `UPDATE vouchers SET zalo_user_id = p_zalo_user_id` (kích hoạt lần đầu); nếu đã có → phải khớp `p_zalo_user_id`;
   - `max_uses`: đếm đơn "chiếm" (định nghĩa 4.2) < max_uses;
   - `daily_limit`: đếm đơn "chiếm" có `created_at` trong ngày hiện tại giờ VN < daily_limit.
3. Tính giảm: fixed → `LEAST(discount_value, v_total)`; percent → `LEAST(round(v_total*discount_value/100), COALESCE(max_discount, v_total), v_total)`.
4. Nếu `v_total - v_discount < 1000` → từ chối ("Đơn quá nhỏ để áp mã").
5. `UPDATE orders SET voucher_id, discount_amount, total_amount = v_total - v_discount`.

Response (`to_jsonb(v_order)`) đã tự chứa `discount_amount`, `total_amount`.

### 5.3 RPC mới cho mini-app (anon, SECURITY DEFINER)

- `get_my_vouchers(p_store_id uuid, p_zalo_user_id text)` → danh sách voucher của UID này còn hiệu lực (lọc theo định nghĩa 4.2 + expiry + daily_limit hôm nay), kèm mức giảm. Dùng để **tự áp mã** ở checkout.
- `check_voucher(p_store_id uuid, p_code text, p_zalo_user_id text, p_subtotal int)` → preview: `{valid, label, discount_amount, reason?}`. **Không ghi gì** — kích hoạt/khoá UID chỉ xảy ra trong `create_order`. Rule tường minh:
  - mã đã gắn UID **khác** `p_zalo_user_id` (mọi kind) → `valid=false`, reason "Mã này thuộc về tài khoản Zalo khác";
  - mã spin luôn có UID (bất biến 5.1) → chỉ chủ mã dùng được;
  - mã shipper **chưa kích hoạt** (`zalo_user_id NULL`) → `valid=true` — người nhập sẽ trở thành chủ mã khi đặt đơn (checkout chính là bước kích hoạt, quyết định giữ nguyên sau review CODEX: xem 8.1 và mục 10);
  - hết hạn / hết lượt / vượt daily_limit / quán tắt mã → `valid=false` kèm reason tiếng Việt tương ứng.

### 5.4 Admin (authenticated, qua RLS trực tiếp — không cần RPC riêng)

CRUD `vouchers` qua bảng (RLS operator). Lịch sử dùng: query `orders` theo `voucher_id`.

## 6. Mini-app

### 6.1 Checkout — section "Mã giảm giá" (mới)

Đặt giữa "Hình thức thanh toán" và "Tóm tắt tiền":
- Mount → gọi `get_my_vouchers`; có mã → **tự chọn mã giảm sâu nhất** (tính trên subtotal hiện tại), hiện card "🎟️ {label} −5.000đ" kèm nút bỏ chọn; nhiều mã → cho đổi.
- Ô "Nhập mã" (collapse): nhập → `check_voucher` → hợp lệ thì chọn, sai thì hiện `reason`.
- Tóm tắt tiền: `Tổng tiền món` / `Giảm giá −X` / `Tổng cộng` (footer dùng tổng sau giảm).
- `createOrder` gửi thêm `voucherCode`. Lỗi voucher từ server (hết hạn giữa chừng, vượt limit...) → snackbar message server, bỏ chọn mã, **không chặn** khách đặt lại không mã.
- Vòng quay/voucher chết → section ẩn im lặng (try/catch như SpinSection).

### 6.2 Sau khi quay trúng voucher (`spin-section.tsx`)

Kết quả `type='voucher'` → thay dòng "Đưa màn hình này cho nhân viên" bằng: *"Mã tự động áp dụng cho lần đặt món sau • HSD {dd/MM}"*. Giữ hiện code làm dự phòng.

## 7. Kitchen — báo giải hiện vật

- Subscribe realtime INSERT `spin_results` theo `store_id` (kênh riêng, cạnh subscription orders hiện có).
- `reward_type='gift'` → card nổi **"🎁 {Bàn X / Mang về} trúng {label} — mang ra cho khách"** (join `orders`→`tables` lấy số bàn) + đẩy vào hàng đợi **loa TTS v2.2**: "Bàn 3 trúng trà đá".
- Nút **"Đã đưa"** → `redeem_spin_result` (sẵn có) → card gạch/ẩn; phía khách hiện "✓ Đã đổi thưởng" như hiện tại.
- `reward_type='voucher'`/`'none'` → **không** báo bếp.
- Load lần đầu: hiện các giải `gift` còn `status='won'` trong 6h gần nhất (phòng bếp F5 mất card).

## 8. Admin web

### 8.1 Trang mới `/admin/vouchers` — "Ưu đãi"

- **Tab "Mã shipper"**: tạo mã (tên shipper, **code bắt buộc tự sinh khó đoán** dạng `SHIP-X7K2M9` — không cho tự đặt code ngắn, vì code chưa kích hoạt chính là bí mật trao tay cho shipper), fixed/% + mức, daily_limit, bảng trạng thái: `Chưa kích hoạt` (zalo_user_id NULL) / `Đã khoá máy` / `Đã tắt`; nút bật/tắt (thu hồi = tắt `is_active`, chặn từ đơn sau); xem lịch sử dùng (đơn, ngày, tiền giảm, tổng cộng đã giảm).
- **Tab "Mã vòng quay"**: danh sách mã đã phát ra (đã dùng / còn hạn / hết hạn) — chỉ xem.

### 8.2 `/admin/spin` (sửa)

Form ô thưởng thêm loại **"Mã giảm giá"**: chọn fixed/%, mức giảm, trần (nếu %), số ngày hạn dùng.

### 8.3 Trang Orders (sửa nhỏ)

Đơn có `discount_amount > 0` → hiện dòng "Giảm giá −X (mã {code})".

## 9. Rủi ro & điểm phải test đầu tiên

1. **Zalo Checkout: `amount` < `sum(item)`** — MAC ký amount đã giảm nhưng `item` giữ giá gốc. **Test sandbox đầu tiên**; nếu Zalo bắt khớp tổng → thêm item "Giảm giá" quantity 1 price âm (và ký MAC theo đó).
2. Race 2 đơn cùng mã: chặn bằng `FOR UPDATE` + đếm lại trong transaction.
3. Đơn dùng mã rồi huỷ/bỏ ngang: khoá mềm 30' tự nhả (mục 4.2) — cần test case này.
4. Loa TTS chỉ đọc giải gift, không đọc voucher — tránh nhiễu predicate `kitchen-announce.ts` hiện có (kênh riêng, không đụng logic đọc đơn).

## 10. Ngoài phạm vi (YAGNI)

- Trang "Ví ưu đãi" riêng trong mini-app (mã tự áp ở checkout là đủ).
- Cộng dồn nhiều mã/đơn; ngân sách khuyến mãi theo tháng; mã theo món; geocoding shipper.
- ZNS nhắc mã sắp hết hạn.
- **Link/QR kích hoạt riêng cho mã shipper (`activation_token`)** — đề xuất từ review CODEX 2026-07-11, đã cân nhắc và hoãn: cả token lẫn code đều là "bí mật trao tay" (ai chiếm trước thành chủ mã — không khác nhau về bản chất), thiệt hại bị chặn trần bởi daily_limit + admin thấy trạng thái kích hoạt + thu hồi được, trong khi token flow tốn thêm deep link + trang kích hoạt + RPC + UI admin. Nâng cấp khi mã shipper phát đại trà (in giấy, gửi nhóm đông người).

## 11. Thứ tự triển khai đề xuất

1. Mig 027 + `spin_wheel` v2 + `create_order` v5 + 2 RPC mới (server trước, test SQL).
2. Mini-app: section mã giảm giá ở checkout + spin-section hiển thị voucher.
3. Kitchen: card + TTS giải hiện vật.
4. Admin: `/admin/vouchers` + mở rộng `/admin/spin` + dòng giảm giá ở Orders.
5. Test sandbox thanh toán với amount đã giảm (rủi ro #1) — **chặn release nếu fail**.
