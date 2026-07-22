# MEVO Hệ thống thanh toán đa phương thức — đặc tả thiết kế

> **Ngày:** 2026-07-15
> **Trạng thái:** Đã chốt thiết kế, chờ lập plan
> **Phạm vi:** Chủ quán chọn phương thức thanh toán; xác nhận tiền thật cho từng phương thức.
> **Phụ thuộc:** Làm **SAU** khi `2026-07-15-staff-assisted-ordering-design.md` (SA-1…SA-5) PASS.
> Spec đó dựng `payment_received_at` + `confirm_manual_payment` mà spec này xây tiếp lên.

> ### Đọc trước khi code — 4 điểm dễ sai nhất
>
> 1. **§1 — Notify của Zalo KHÔNG phải bằng chứng thanh toán.** Nó là sự kiện *"khách vừa
>    chọn phương thức"*. Code hiện tại hiểu sai điều này và đang tính doanh thu sai.
>    Đây là **bug đã xác nhận trên prod**, không phải rủi ro lý thuyết.
> 2. **§2 — Zalo KHÔNG ghim `method`.** Khách chọn ví/chuyển khoản/Momo **bên trong UI Zalo,
>    sau khi đơn đã tạo và MAC đã ký**. Nên `payment_method` là **KÊNH** (`zalo_checkout`),
>    không phải instrument — 54/90 đơn `zalopay` trên prod chưa từng có instrument nào. Mọi
>    thiết kế giả định biết trước khách trả bằng gì đều sai.
> 3. **§5.3 — MỘT số tiền cho mọi instrument.** MAC ký `payment_amount` trước khi biết
>    instrument. Rẽ nhánh "ví so `total_amount`, bank so `payment_amount`" = **mọi giao dịch ví
>    amount mismatch**.
> 4. **§6 — Bếp không có `auth.uid()`.** Kitchen Display chạy role Postgres `kitchen` + token,
>    không qua Supabase Auth. Không dùng chung RPC của owner được.

---

## 1. Phát hiện nền tảng: Zalo không đụng vào tiền chuyển khoản

Tài liệu Zalo Mini App phân biệt hai URL, và đây là gốc của mọi thứ trong spec này:

| URL | Bắn khi | Dùng cho |
|---|---|---|
| **Callback URL** | *"khi tiền của user bị trừ thành công"* | Đối tác thanh toán: ZaloPay, Momo, VNPay, PayME |
| **Notify URL** | *"khi user **chọn** phương thức"* | **COD và chuyển khoản ngân hàng** |

Zalo xếp **COD chung nhóm với chuyển khoản**. COD là trả tiền mặt khi giao hàng — Zalo hiển
nhiên không thể biết tiền đã trao tay chưa. Nghĩa là Notify **theo thiết kế** chỉ báo
*"khách đã chọn phương thức này"*, không bao giờ là *"khách đã trả tiền"*.

Điều này khớp chính xác với payload đã brute-force được (`checkout-notify/index.ts:4-8`):
`{appId, method, orderId, extradata}` — **không có `amount`, không có `resultCode`,
không có `transId`**. Payload không chứa trường kết quả nào vì nó không mô tả kết quả.

### 1.1 Bug đã xác nhận trên prod

`supabase/functions/checkout-notify/index.ts:97-103` đang coi notify BANK là bằng chứng
thanh toán:

```ts
// MAC hợp lệ = khách đã hoàn tất chuyển khoản → confirm đơn.   ← GIẢ ĐỊNH SAI
const zaloRef = data.orderId ? `BANK:${data.orderId}` : `BANK:${appOrderId}`
await supabase.from('orders')
  .update({ status: 'confirmed', zalopay_trans_id: zaloRef })   ← vào bếp + tính doanh thu
```

**Đã kiểm chứng thực tế 2026-07-15:** bấm "Đặt & Thanh toán" → Zalo mở app ngân hàng →
**thoát ngay, không chuyển tiền** → đơn vẫn vào bếp và vẫn được tính doanh thu.

Hệ quả: bất kỳ ai cũng ăn miễn phí được, và doanh thu chuyển khoản báo cáo là số
**"khách đã bấm nút"**, không phải tiền thật.

**Mức phơi nhiễm (đo trên prod 2026-07-15):** 7 đơn / 190.000đ tại Phở Gà Pubu, toàn bộ nằm
trong cửa sổ test 08/07–11/07, không có đơn BANK nào 4 ngày gần nhất → **chưa có tiền thật
của khách nào đi qua lỗ hổng**. Không cần dọn dữ liệu, nhưng phải vá trước khi Pubu bật
chuyển khoản cho khách thật.

### 1.2 Suy ra: không thể vá từ phía Zalo

Thứ mình cần (tiền đã về TK quán chưa) **không tồn tại trong dữ liệu Zalo gửi**, và sẽ không
bao giờ tồn tại, vì Zalo không giữ tiền chuyển khoản. Xác nhận **bắt buộc phải đến từ phía
ngân hàng**: tai người nghe loa báo (§6), hoặc webhook giao dịch (§9).

---

## 2. `payment_method='zalopay'` là KÊNH, không phải phương thức

Đây là phát hiện lật lại bản đầu của spec này. Bản đầu khai *"7 đơn test gắn nhãn sai"* —
**không hề sai**.

`checkout-create-mac` **cố ý không gửi `method`** (`index.ts:4`) → *"Payment.createOrder tự mở
màn CHỌN phương thức"*. Mini-app chỉ cho khách chọn đúng **hai** thứ
(`mini-app/src/pages/checkout/index.tsx:450-466`): `zalopay` hoặc `cash`.

Nên `payment_method='zalopay'` thật ra nghĩa là **"thanh toán online qua Zalo Checkout"**.
Khách chọn ví / chuyển khoản / Momo **bên trong UI của Zalo, SAU khi đơn đã tạo và MAC đã ký**.
Instrument thật chỉ lộ ra ở `data.method` lúc notify/callback về.

Số liệu prod (2026-07-15) xác nhận:

| `payment_method` | Số đơn | Thực tế bank | Thực tế ví | **Chưa trả gì** |
|---|---|---|---|---|
| `zalopay` | 90 | 7 | 29 | **54** |
| `cash` | 22 | — | — | 22 |

54/90 đơn `zalopay` **chưa từng có instrument nào** — khách bấm rồi bỏ. Cái nhãn mô tả *kênh
khách chọn*, không phải *tiền đi đường nào*.

### 2.1 Hệ quả: không thể phân nhóm đơn trước

**Cùng một đơn** nằm ở cả nhóm "tự động xác nhận" lẫn nhóm "phải xác nhận tay", cho tới khi
khách bấm chọn trong Zalo. Mọi thiết kế giả định biết trước instrument đều sai.

Suy ra ba ràng buộc cứng:

1. Đơn `zalo_checkout` phải được coi là **chưa trả tiền** cho tới khi có bằng chứng thật
   (callback ví, hoặc bếp/SePay xác nhận chuyển khoản).
2. Ở quán có bật chuyển khoản, **mọi** đơn `zalo_checkout` phải mang đuôi định danh — vì có
   thể kết thúc bằng bank. Khách trả ví cũng trả số lẻ (§5.3).
3. **Một số tiền duy nhất được ký trong MAC**, dùng chung cho mọi instrument (§5.3).

### 2.2 Chuyển khoản: chỉ có một, dù khởi tạo bằng gì

Zalo Checkout không phải phương thức — nó là **một cách khởi tạo** (deeplink mở app ngân hàng
kèm số tiền). QR dán ở quầy là cách khởi tạo khác. Tiền đi cùng một đường: app ngân hàng của
khách → **thẳng TK ngân hàng quán**. Nên không có "chuyển khoản qua Zalo" vs "chuyển khoản thủ
công" — chỉ có một instrument `bank`.

---

## 3. Ba cột, ba câu hỏi khác nhau

| Câu hỏi | Cột | Giá trị | Biết lúc nào |
|---|---|---|---|
| Khách chọn **kênh** nào? | `payment_method` | `zalo_checkout` `cash` `bank_transfer`¹ | **Lúc tạo đơn** |
| Tiền thật sự đi bằng **instrument** nào? | `payment_instrument` | `wallet` `bank` `momo` `vnpay` / NULL | **Lúc notify/callback** (`data.method`) |
| Mình **biết tiền về** bằng cách nào? | `payment_received_via` | `zalo_callback` `sepay` `kitchen` `owner` `legacy` | Lúc được xác nhận |

¹ `bank_transfer` chỉ dành cho **đơn staff** — nhân viên biết chắc khách sẽ chuyển khoản tại
quầy, không qua Zalo Checkout. Đây là kênh duy nhất mà kênh = instrument.

**Vì sao ba cột chứ không hai:** bản đầu spec này gộp kênh và instrument vào `payment_method`
rồi khai *"cố định theo đơn"* — sai với đơn Zalo Checkout, nơi instrument chỉ lộ ra sau. Tách
ra thì:

- `payment_method` trả lời được **ngay lúc tạo đơn** (cần cho việc cấp đuôi, cho UI).
- `payment_instrument` điền sau, **chỉ để báo cáo** — không logic nào phụ thuộc nó.
- `payment_received_via` đổi tự do theo cấu hình quán, bật SePay **không migrate dữ liệu**.

### 3.1 Hai đường xác nhận — phân theo INSTRUMENT, không phân theo đơn

| Instrument (lộ ra ở callback/notify) | Zalo báo qua | Xác nhận |
|---|---|---|
| `wallet` `momo` `vnpay` | **Callback** — *"tiền của user bị trừ thành công"* | Tự động, tin được |
| `bank` | **Notify** — *"khách vừa chọn"* | **Mình tự lo**: bếp bấm hoặc SePay |
| `cash` (không qua Zalo) | — | Bếp/owner bấm |

Nhánh ví trong `checkout-notify` (`index.ts:116-160`, có `resultCode` + đối chiếu `amount`) đã
đúng về nguyên tắc và dùng lại được cho cả Momo/VNPay — **không xây gì thêm**. Nhưng phải sửa
hai chỗ: ghi `payment_received_at` (§12 PM-1) và đối chiếu `payment_amount` thay vì
`total_amount` (§5.3).

**MEVO không chọn được instrument.** Quyết định 2026-07-08 đã ghi: *"Thứ tự/ẩn-hiện PT chỉnh ở
console Zalo (kéo thả danh sách PT), không phải code"*. Nên yêu cầu "chủ quán chọn phương thức"
chỉ thực hiện được ở mức **online vs tiền mặt** (§8.2). Momo/VNPay chưa test thật — §11 Rủi ro.

### 3.2 Ghi `payment_instrument` ở ĐÂU (nếu không chốt, cột báo cáo NULL vĩnh viễn)

`payment_instrument` chỉ để báo cáo (§3), nhưng phải **thực sự được ghi** ở từng đường, nếu
không đơn mới toàn NULL:

| Đường tạo/xác nhận | Ghi `payment_instrument` | Lúc nào |
|---|---|---|
| `staff_create_order(cash)` | `'cash'` | Lúc tạo đơn |
| `staff_create_order(bank_transfer)` | `'bank'` | Lúc tạo đơn |
| Notify BANK hợp lệ (`checkout-notify`) | `'bank'` | Cùng UPDATE set `bank_handoff_at` |
| Callback ví (`checkout-notify`) | map `data.method` đã xác thực → `wallet`/`momo`/`vnpay` | Cùng UPDATE set `payment_received_at` |
| `create_order(cash)` khách | `'cash'` | Lúc tạo đơn |
| Backfill (§5.2) | cũ: bank/wallet suy từ `trans_id`; **thêm `cash → 'cash'`** | Migration |

⚠️ Đơn `zalo_checkout` **chưa** notify/callback thì `payment_instrument = NULL` — đúng, vì chưa
biết khách trả bằng gì (§2.1). NULL ở đây có nghĩa, không phải thiếu sót.

---

## 4. Một nguồn sự thật cho "tiền đã về"

Hiện tại "đã có tiền" được suy ra bằng **ba luật** tuỳ phương thức, và khối logic đó bị chép
ở **ít nhất 6 nơi** — không chỉ báo cáo:

| Nơi | Ghi chú |
|---|---|
| `get_daily_revenue()` — `014` | Doanh thu |
| `admin/orders/page.tsx:65` | Tính lại bằng TS |
| `admin/dashboard/page.tsx` | Tính lại bằng TS |
| **`get_spin_state()` — `027:287`** | `v_paid := (zalopay AND trans_id) OR (cash AND paid)` |
| **`spin_wheel()` — `027:335`** | **Chép nguyên khối trên, lần thứ hai** |
| **`voucher_uses()` — `027:80`** | Luật "chiếm lượt" riêng: cash chiếm khi tạo; online chiếm khi có `trans_id` HOẶC còn trẻ <30' |

Không nơi nào trong số này **biết `bank_transfer` tồn tại**. Hậu quả nếu chỉ sửa báo cáo:

- Đơn chuyển khoản **đã thu tiền thật vẫn không được quay** vòng quay (`v_paid` = false).
- Voucher của đơn chuyển khoản đã trả nhưng quá 30' có thể tuột khỏi giới hạn lượt dùng.
- "Một nguồn sự thật" chỉ đúng ở báo cáo, sai ở phần còn lại của hệ thống.

⚠️ **PM-1 phải rà TOÀN REPO** tìm mọi predicate "đã thanh toán" và chuyển hết sang
`payment_received_at`, không dừng ở danh sách trên. Danh sách này là điểm khởi đầu, không phải
điểm kết thúc.

**Mọi đường thanh toán ghi vào cùng một cột** — kể cả callback ví:

```text
Doanh thu   = payment_received_at IS NOT NULL AND status <> 'cancelled'
Đã thu?     = payment_received_at IS NOT NULL
Ai xác nhận = payment_received_via
```

Một luật, một chỗ. `zalopay_trans_id` **giữ lại nhưng hạ vai trò** xuống tham chiếu đối soát
ví — không còn là căn cứ tính tiền.

Bảng cột sau khi xong (mở rộng từ spec staff §4.2):

| Cột | Ý nghĩa |
|---|---|
| `payment_received_at` | Lúc tiền được ghi nhận. **Nguồn sự thật duy nhất.** |
| `payment_received_via` | `zalo_callback` / `sepay` / `kitchen` / `owner` / `legacy`¹ |
| `payment_received_by` | `auth.users(id)` — **chỉ điền khi `via='owner'`**, còn lại NULL |
| `payment_instrument` | `wallet`/`bank`/`momo`/`vnpay`/`cash` — điền lúc notify/callback. **Chỉ báo cáo**, không logic nào rẽ nhánh theo nó (§3). |
| `payment_amount` | Số khách trả (có đuôi định danh nếu quán bật CK). **`default 0` + NOT NULL từ PM-1**; đuôi thật cấp ở PM-2 (§5.3a). |
| `has_payment_tail` | Cờ đóng băng "đơn này mang đuôi không", set lúc tạo đơn. Index cấp đuôi lọc theo cột này (§5.3). |
| `bank_handoff_at` | Khách đã sang app ngân hàng (từ notify). **Chỉ để hiển thị** + gate bếp xác nhận `zalo_checkout` (§6.1), không bao giờ tính tiền. |

¹ `legacy` chỉ xuất hiện ở dữ liệu backfill (§5.2) — dữ liệu cũ không ghi ai thu tiền. Code
mới không bao giờ ghi giá trị này.

### 4.1 Báo cáo: tách "doanh thu bán hàng" khỏi "tiền thực nhận"

Đuôi định danh làm `payment_amount` **lớn hơn** `total_amount` (tối đa 999đ/đơn). Nên báo cáo
phải dùng ĐÚNG cột cho ĐÚNG câu hỏi, không gộp:

| Chỉ số | Công thức | Khớp với |
|---|---|---|
| **Doanh thu bán hàng** | `SUM(total_amount)` where `payment_received_at IS NOT NULL AND status<>'cancelled'` | Giá trị món − voucher; đối chiếu vòng quay/voucher |
| **Tiền thực nhận** | `SUM(payment_amount)` cùng điều kiện | **Sao kê ngân hàng** (khách chuyển số có đuôi) |
| **Chênh lệch định danh** | `SUM(payment_amount − total_amount)` | Tổng phần đuôi, để đối soát không hụt |

⚠️ Gọi `SUM(total_amount)` là "tiền thực nhận" thì con số **không khớp sao kê ngân hàng** (thiếu
phần đuôi). Dashboard/`get_daily_revenue` hiện dùng `total_amount` cho doanh thu — **giữ nguyên
cho doanh thu bán hàng**, nhưng khi cần đối chiếu tiền vào tài khoản phải dùng `payment_amount`.
Ở quán chỉ-ví/không-đuôi hai cột bằng nhau nên hiện chưa lệch; chốt hiển thị cả hai ở PM-4.

---

## 5. Dữ liệu và migration

```text
supabase/migrations/030_multi_method_payment.sql
```

*(⚠️ Cập nhật 2026-07-21: staff spec ĐÃ deploy prod với mig **028** (`staff_assisted_ordering`)
và **029** (`staff_active_toggle`). Số tự do tiếp theo là **030**, không phải 029 như bản đầu
spec. Kiểm `ls supabase/migrations/` lại trước khi tạo file.)*

> ### ⚠️ Cập nhật 2026-07-21 (review deploy-safety) — RENAME KÊNH TÁCH KHỎI PM-1
>
> Mini-app prod hardcode `"zalopay"` cả khi gọi `create_order` lẫn `paymentMethods.includes("zalopay")`
> (`mini-app/src/pages/checkout/index.tsx:60,176,450`), và bản mini-app mới phải **publish qua
> Zalo (KHÔNG tức thì)**. Nếu migration đổi `'zalopay'→'zalo_checkout'` + siết CHECK **trước khi**
> mini-app mới lên, checkout của quán pilot **hỏng ngay** (RPC từ chối `zalopay`, UI mất nút).
>
> → **PM-1 thuần additive:** thêm cột + backfill + gộp doanh thu + vá bug. **KHÔNG rename, KHÔNG
> siết CHECK, KHÔNG đụng `stores_payment_methods_valid`.** Mọi luật doanh thu/vào bếp key theo
> `payment_received_at`/`order_source`/`payment_method IN ('cash','bank_transfer')` — **không cần
> tên kênh**, nên rename không phải điều kiện cho PM-1.
>
> → **Rename thành rollout backward-compatible riêng** (sau khi mini-app mới đã publish & xác
> minh không còn client cũ): (1) RPC/stores nhận CẢ `zalopay` lẫn `zalo_checkout`; (2) deploy
> code dual-read; (3) publish mini-app; (4) backfill đổi canonical + siết CHECK; (5) bỏ hỗ trợ
> `zalopay`. Các câu "rename ở PM-1" bên dưới đọc là "ở rollout rename", KHÔNG phải PM-1.

### 5.1 Thay đổi schema

```sql
-- ⚠️ RENAME KÊNH KHÔNG NẰM Ở PM-1 (xem callout trên). PM-1 giữ nguyên 'zalopay',
--    giữ nguyên CHECK orders.payment_method = ('zalopay','cash','bank_transfer') của mig 028,
--    giữ nguyên stores_payment_methods_valid = ('zalopay','cash'). Chỉ THÊM cột.
-- (Rollout rename sau: 'zalopay'→'zalo_checkout' + siết CHECK, backward-compatible.)

alter table orders
  add column payment_instrument text null,
  add column payment_received_via text null,
  add column bank_handoff_at timestamptz null;

alter table orders
  add constraint orders_payment_instrument_check
  check (payment_instrument in ('wallet','bank','momo','vnpay','cash'));
-- Chỉ để BÁO CÁO. Không logic nào được rẽ nhánh theo cột này — instrument chỉ biết
-- sau khi khách đã chọn trong Zalo, nên mọi quyết định trước đó không dùng được nó.

alter table orders
  add constraint orders_payment_received_via_check
  check (payment_received_via in ('zalo_callback','sepay','kitchen','owner','legacy'));
-- 'legacy' CHỈ dành cho dữ liệu backfill (§5.2) — code mới KHÔNG bao giờ ghi giá trị này.
-- Có nó để không phải bịa ra người thu cho dữ liệu cũ vốn không ghi.

-- Ba trạng thái hợp lệ, không có trạng thái thứ tư.
-- KHÔNG tách thành 2 constraint riêng: nhánh "via is null" sẽ cho lọt
-- (at=NULL, via=NULL, by=<user bất kỳ>) — chưa thu tiền mà đã có người nhận tiền.
alter table orders
  add constraint orders_payment_received_state_check
  check (
    (
      payment_received_at is null
      and payment_received_via is null
      and payment_received_by is null
    )
    or (
      payment_received_at is not null
      and payment_received_via = 'owner'
      and payment_received_by is not null
    )
    or (
      payment_received_at is not null
      and payment_received_via in ('zalo_callback','sepay','kitchen','legacy')
      and payment_received_by is null
    )
  );

-- Số tiền khách phải trả — TÁCH khỏi total_amount (§5.3).
-- LUÔN có giá trị (= total_amount khi không cần đuôi) để không nơi nào phải COALESCE
-- rồi quên.
alter table orders
  add column payment_amount int null;   -- thêm nullable → backfill → set default 0 + NOT NULL
                                        -- (thứ tự ở §5.2). `default 0` để INSERT đầu của
                                        -- create_order qua được NOT NULL; UPDATE cuối set số
                                        -- thật, cùng transaction (§5.3a).

-- Cờ ĐÓNG BĂNG "đơn này có mang đuôi định danh không", quyết định LÚC TẠO ĐƠN theo cấu
-- hình quán tại thời điểm đó. Partial unique index (§5.3) lọc theo cột NÀY, KHÔNG đọc
-- stores.payment_methods trực tiếp — vì cấu hình quán đổi được sau khi đơn đã tạo, mà đã
-- ký MAC thì đuôi của đơn cũ phải bất biến.
alter table orders
  add column has_payment_tail boolean not null default false;

alter table stores
  add column kitchen_can_confirm_cash boolean not null default false;
```

`kitchen_can_confirm_cash` **mặc định false** — theo tiền lệ default an toàn của MEVO
(`spin_enabled` false, tiền mặt tắt mặc định). Quán siêu nhỏ tự bật, và khi bật là **chấp
nhận mất dấu vết ai thu tiền mặt** (§6.2).

### 5.2 Backfill dữ liệu cũ

> **Thứ tự chạy trong migration:** thêm cột → **backfill** → **rồi mới** add constraint.
> Constraint kiểm cả dòng cũ lúc ADD, nên backfill sai thứ tự là migration vỡ giữa chừng.

Số liệu prod 2026-07-15 (tham khảo, **KHÔNG hard-code**): ~90 đơn `zalopay` (7 bank, 29 ví, 54
chưa trả gì) + ~22 `cash`. ⚠️ Backfill dùng **predicate** (`zalopay_trans_id like 'BANK:%'`…),
không phụ thuộc con số cụ thể. Chạy `select payment_method, count(*)…` **ngay trước migration**
để chụp snapshot thật + kiểm invariant (không còn `payment_received_at` mâu thuẫn), đừng bắt
đúng tuyệt đối 90/7/29/22 — đơn mới có thể đã phát sinh.

```sql
-- 1) ⛔ RENAME KÊNH — KHÔNG chạy ở PM-1 (callout §5). Để cho rollout rename backward-compatible
--    sau khi mini-app mới đã publish. PM-1 giữ nguyên 'zalopay'.
--    (Rollout rename: update orders/stores 'zalopay'→'zalo_checkout' + siết CHECK.)

-- 2) Instrument suy ngược từ zalopay_trans_id (chỉ để báo cáo)
update orders set payment_instrument = 'bank'
where zalopay_trans_id like 'BANK:%';                                   -- 7 đơn (khách BANK cũ)
update orders set payment_instrument = 'wallet'
where zalopay_trans_id is not null and zalopay_trans_id not like 'BANK:%'; -- 29 đơn
-- 54 đơn còn lại: instrument = NULL, đúng — chưa từng trả gì.

-- 2b) Đơn tiền mặt cũ: instrument = 'cash'; đơn staff bank_transfer: instrument = 'bank'
--     (§3.2 — không để NULL cho báo cáo; bank_transfer KHÔNG có zalopay_trans_id nên bước 2 sót)
update orders set payment_instrument = 'cash' where payment_method = 'cash';
update orders set payment_instrument = 'bank' where payment_method = 'bank_transfer'
  and payment_instrument is null;

-- 3) Đơn ví đã có tiền thật (29) → nguồn sự thật mới
update orders set payment_received_at = updated_at, payment_received_via = 'zalo_callback'
where payment_instrument = 'wallet';

-- 4) Legacy tiền mặt đã thu — via='legacy' vì dữ liệu cũ KHÔNG ghi ai thu.
--    Không dùng via='owner': sẽ vi phạm constraint (owner phải có payment_received_by),
--    và bịa ra một người thu là sai sự thật.
update orders set payment_received_at = updated_at, payment_received_via = 'legacy'
where payment_method = 'cash' and status = 'paid' and payment_received_at is null;

-- 5) ⚠️ Đơn đã được confirm_manual_payment của migration 028 xác nhận.
--    028 set payment_received_at + payment_received_by, lúc đó payment_received_via
--    CHƯA TỒN TẠI. Không có bước này thì constraint 3 trạng thái VỠ NGAY lúc ADD.
update orders set payment_received_via = 'owner'
where payment_received_at is not null
  and payment_received_via is null
  and payment_received_by is not null;

-- 6) 7 đơn BANK: có bank_handoff, KHÔNG có bằng chứng tiền về (§1.1)
update orders
set zalopay_trans_id = null,
    bank_handoff_at = updated_at,
    payment_received_at = null,
    payment_received_via = null
where payment_instrument = 'bank';

-- 7) payment_amount: đơn cũ không có đuôi (has_payment_tail giữ default false)
update orders set payment_amount = total_amount where payment_amount is null;
alter table orders alter column payment_amount set default 0;   -- cho INSERT đầu create_order
alter table orders alter column payment_amount set not null;    -- OK vì create_order (PM-1)
--    đã set payment_amount = total_amount ở UPDATE cuối, và default 0 đỡ INSERT đầu (§5.3a).
```

Doanh thu Pubu tự đúng lại sau backfill (29 đơn ví giữ nguyên, 7 đơn bank biến khỏi doanh
thu), không cần thao tác tay.

### 5.3 Số tiền định danh — `payment_amount`, KHÔNG đụng `total_amount`

Loa ngân hàng **chỉ đọc số tiền**. Hai đơn cùng 105.000đ thì người xác nhận không biết loa vừa
đọc đơn nào — **cột "chờ thanh toán" vô dụng nếu thiếu cái này**, và SePay cũng không tự khớp
được đơn.

**Hai cột, không phải một:**

```text
total_amount   = 105.000đ   ← giá trị bán hàng thật = tổng món − voucher. BẤT BIẾN.
payment_amount = 105.037đ   ← số khách cần chuyển, mang đuôi định danh
```

**Vì sao không cộng thẳng vào `total_amount`:** `create_order` v5 (`027`) giữ bất biến
`total_amount = tổng món − voucher`. Cộng đuôi vào đó sẽ phá:
hoá đơn không khớp dòng món; doanh thu cộng thêm khoản không có dòng hàng; hoàn tiền và báo
cáo voucher không đối chiếu được; thống kê giá trị đơn sai có hệ thống.

#### ⚠️ MỘT số tiền cho mọi instrument — không được rẽ nhánh

Đề xuất từ review (*"callback ví đối chiếu `total_amount`, chuyển khoản đối chiếu
`payment_amount`"*) **không làm được**, và làm theo sẽ **vỡ toàn bộ thanh toán ví**:

MAC ký **một** số tiền, **trước** khi biết instrument (`checkout-create-mac:77`, method không
được ghim — §2). Nếu ký `payment_amount` (có đuôi) mà callback ví lại so với `total_amount` →
**mọi giao dịch ví đều "amount mismatch"** (`checkout-notify:157`) → không đơn ví nào được
confirm nữa.

Quy tắc đúng — **`payment_amount` là số duy nhất được ký và khách trả, bất kể instrument**:

| Nguồn | Đối chiếu với |
|---|---|
| MAC ở `checkout-create-mac` | **`payment_amount`** (thay `total_amount` hiện tại, dòng 77) |
| Callback ví ở `checkout-notify:157` | **`payment_amount`** (thay `total_amount` hiện tại) |
| SePay webhook | **`payment_amount`** |
| Hoá đơn, doanh thu, báo cáo voucher | `total_amount` |

#### ⚠️ RỦI RO PM-2 phải test ĐẦU TIÊN — `sum(item) = amount` của Zalo

`checkout-create-mac:77-97` ký **cả mảng `item`** (tên/giá/SL từ `order_items`) **cùng với**
`amount`. Hiện `amount = total_amount` và `sum(item.price*qty)` cũng ≈ `total_amount`. Khi PM-2
ký `payment_amount = total_amount + đuôi`, **`sum(item) ≠ amount`** (lệch đúng phần đuôi 37đ).

**Nếu Zalo Checkout enforce `sum(item) == amount`** thì mọi đơn có đuôi **bị Zalo từ chối** —
đây chính là **rủi ro #1 chưa đóng của hệ voucher** (voucher cũng làm `total_amount < sum(item)`;
CLAUDE.md 2026-07-11). PM-2 **phải test kịch bản này trước khi làm gì khác**:

- **Nếu Zalo KHÔNG bắt** (nhiều khả năng — voucher đã chạy prod với `total_amount < sum(item)`):
  ký `payment_amount` là đủ, không cần đụng `item`.
- **Nếu Zalo CÓ bắt:** thêm **một dòng `item` tổng hợp "Mã định danh giao dịch" giá = +đuôi**
  vào mảng `item` gửi Zalo (CHỈ trong `checkout-create-mac`, **KHÔNG** tạo `order_items` thật —
  bếp không thấy dòng rác), để `sum(item) == payment_amount`. Bonus: màn Zalo tự hiện dòng giải
  thích đuôi (đỡ một phần §8.4).

Chốt kết quả test này **trước** khi viết logic cấp đuôi — đúng bài học "đọc/thử contract trước".

**Khi nào cấp đuôi** — quyết định được **lúc tạo đơn**, chỉ cần biết cấu hình quán:

```text
Quán có bật chuyển khoản  → MỌI đơn zalo_checkout + bank_transfer mang đuôi
                             (đơn zalo_checkout CÓ THỂ kết thúc bằng bank — §2.1)
Quán chỉ bật ví           → payment_amount = total_amount, không đuôi
Đơn cash                  → payment_amount = total_amount, không đuôi
```

Hệ quả chấp nhận: ở quán bật chuyển khoản, **khách trả ví cũng trả số lẻ** (105.037đ). Không
tránh được, vì lúc ký MAC chưa biết khách sẽ chọn gì.

`payment_amount` **NOT NULL** (= `total_amount` khi không đuôi) → không nơi nào phải
`COALESCE` rồi quên. Chi tiết vòng đời + vì sao PM-1 đã phải cấp nó — §5.3a.

#### §5.3a — Vòng đời `payment_amount` trong `create_order` (điểm dễ vỡ nhất)

⚠️ **`create_order` hiện INSERT `total_amount = 0` trước, tính món/voucher trong loop, rồi mới
UPDATE tổng ở cuối** (`027_vouchers.sql:208` và `:259`). Hệ quả BẮT BUỘC phải xử lý:

1. **Câu INSERT đầu chưa biết tổng tiền** → chưa cấp được `payment_amount`. Nhưng cột là
   NOT NULL, nên INSERT đầu phải có giá trị: **thêm `default 0`** cho cột (§5.1). INSERT đầu
   nhận `0`, `has_payment_tail = false` (default) → **không lọt vào partial unique index** (index
   lọc `has_payment_tail = true`), nên giá trị `0` tạm không va đơn nào.
2. **Giá trị thật set ở UPDATE cuối** (`:259`), cùng transaction, sau khi có `total_amount`:
   `payment_amount = total_amount` (PM-1) hoặc `= total_amount + đuôi` (PM-2, nếu
   `has_payment_tail`). Vì cùng transaction, `0` không bao giờ commit ra ngoài.
3. **PM-1 ĐÃ phải cấp `payment_amount = total_amount`** ở UPDATE cuối — không hoãn được — vì
   PM-1 đổi `checkout-create-mac` sang **ký `payment_amount`** (§12 PM-1). Nếu PM-1 để
   `payment_amount = NULL/0` mà MAC ký nó → **mọi giao dịch ví "amount mismatch"**. Nên PM-1:
   cột `not null default 0`, `create_order` set `= total_amount` (chưa đuôi), `has_payment_tail`
   vẫn `false`.
4. **PM-2 mới thêm logic đuôi**: khi quán bật CK, set `has_payment_tail = true` +
   `payment_amount = total_amount + đuôi ngẫu nhiên` (retry theo unique index). `staff_create_order`
   cũng cấp đuôi ở đây.

Tóm tắt sprint: **PM-1** = cột `not null default 0` + `create_order` set `payment_amount =
total_amount` (MAC ký được ngay). **PM-2** = cấp đuôi thật + `has_payment_tail` + enforce unique.

#### Thuật toán cấp đuôi — nguyên tử, không phải "kiểm lúc gán"

Bất biến phải do **DB** giữ, không phải do code kiểm rồi hy vọng. Index lọc theo cột cờ
**đóng băng** `has_payment_tail` (§5.1), **không** đọc `stores.payment_methods` — cấu hình
quán đổi được sau khi đơn tạo, mà MAC đã ký thì đuôi đơn cũ phải bất biến:

```sql
create unique index orders_pending_payment_amount_unique
  on orders(store_id, payment_amount)
  where has_payment_tail = true
        and payment_received_at is null
        and status <> 'cancelled';
```

`has_payment_tail` set lúc tạo đơn cho **cả `zalo_checkout` lẫn `bank_transfer`** khi quán bật
chuyển khoản — vì đơn `zalo_checkout` có thể kết thúc bằng bank (§2.1). Quán chỉ bật ví →
`has_payment_tail = false` → đơn **không vào index** → hai đơn cùng `payment_amount =
total_amount` **không va unique** (giải quyết bug quán-chỉ-ví). Đơn `cash` cũng
`has_payment_tail = false`.

`create_order`/`staff_create_order` cấp đuôi trong **cùng transaction**: thử đuôi, gặp
`unique_violation` thì thử tiếp (bốc ngẫu nhiên 000–999, tối đa N lần rồi RAISE). Hai
transaction đồng thời chọn trùng đuôi → một cái vỡ unique → retry. Không cần khoá bảng.

**Test bắt buộc ở PM-2:** hai đơn cùng giá ở quán bật-CK → `payment_amount` khác nhau; hai đơn
cùng giá ở quán chỉ-ví → **KHÔNG** vỡ unique (cả hai `has_payment_tail = false`).

#### ⚠️ Đuôi bị giữ vĩnh viễn ở đơn `pending` bỏ dở — cạn đuôi / DoS

Index là **partial** nên đuôi tự giải phóng khi đơn thanh toán hoặc huỷ — nhưng đơn `pending`
bỏ dở **giữ đuôi vô thời hạn**. Prod đã có **54 đơn khách bấm rồi bỏ**; với thiết kế mới mỗi
đơn như vậy chiếm một `payment_amount` mãi mãi. Kẻ xấu tạo liên tục nhiều đơn cùng tổng tiền
có thể **làm cạn 1.000 đuôi** ở một mức giá, hoặc đẩy vòng retry vượt `N` → `create_order`
RAISE, chặn cả đơn thật cùng giá.

Phải chốt **ở PM-2** (không hoãn sang PM-5, vì đuôi ra đời ở PM-2):

1. **TTL cho reservation — bằng CỜ ĐÓNG BĂNG + cron, KHÔNG bằng `now()` trong index.**
   ⚠️ Postgres **cấm** hàm biến đổi (`now()`) trong predicate của partial index (predicate phải
   IMMUTABLE) → `create_order` sẽ lỗi lúc `CREATE INDEX`. Cách đúng: thêm cột
   `payment_reservation_active boolean` (mặc định true khi cấp đuôi), index lọc
   `where has_payment_tail and payment_reservation_active and status<>'cancelled'`; một **cron/
   worker** định kỳ set `payment_reservation_active=false` cho đơn `pending` chưa
   `payment_received_at` quá `T` phút. **KHÔNG** giải phóng reservation của đơn staff đang
   `cooking`/`ready` (đồ đã làm) — cron loại các trạng thái đó ra.
2. **Quan hệ với cách ly tái dùng đuôi (§ "Chống webhook trễ", điểm 3):** `T` (TTL) phải
   **LỚN hơn** khoảng cách ly tái dùng đuôi, để đuôi của một đơn không vừa hết hạn đã bị cấp
   lại trước khi webhook trễ của chính nó về → khớp nhầm. Cả hai con số chốt cùng nhau ở PM-2
   (TTL) / PM-5 (cách ly, sau khi biết độ trễ webhook SePay thật).
3. **Rate limit tạo đơn** theo `zalo_user_id`/`store_id` — chặn spam làm cạn đuôi. Mức cụ thể
   chốt ở PM-2.

Với pilot Pubu, rủi ro cạn đuôi thực tế thấp (lưu lượng nhỏ), nhưng **TTL loại đơn bỏ dở khỏi
index là bắt buộc** — nếu không, sau vài tháng các đuôi rác tích lại tự bóp nghẹt một dải giá.

#### Chống webhook trễ khớp nhầm đơn mới

Kịch bản: đơn A dùng `105.037đ` → bếp xác nhận tay → đuôi `037` nhả ra → đơn B nhận `037` →
webhook SePay của A về trễ → nếu chỉ tìm "đơn chưa thanh toán có số tiền 105.037đ" thì **B bị
xác nhận nhầm**, A thì không.

Bốn lớp chặn, **tất cả bắt buộc** ở PM-5:

1. **Lưu transaction ID của webhook** + unique constraint → một giao dịch ngân hàng chỉ xác
   nhận được đúng một đơn, bắn lại bao nhiêu lần cũng vô hại.
2. **Chỉ khớp đơn có `created_at <= thời điểm giao dịch`** → giao dịch của A không thể khớp
   đơn B tạo sau đó.
3. **Thời gian cách ly trước khi tái dùng đuôi** — đuôi vừa nhả không cấp lại ngay
   (khoảng cách ly chốt ở PM-5, sau khi biết độ trễ webhook thật của SePay).
4. **Nhiều đơn cùng khớp → không tự xác nhận đơn nào**, đẩy vào hàng chờ xử lý tay. Thà chậm
   còn hơn ghi nhận nhầm đơn.

Thiết kế matching chi tiết chốt ở PM-5 **sau khi đọc tài liệu SePay** — đúng bài học đã đau
với MAC của Zalo (§9).

---

## 6. Bếp xác nhận thanh toán

### 6.1 RPC riêng cho role `kitchen`

Kitchen Display chạy role Postgres `kitchen` + JWT mang `store_id`/`kv`
(`007a_kitchen_isolation.sql`), **không có `auth.uid()`** → không dùng chung
`confirm_manual_payment` của owner được. Cần RPC song song, bám khuôn `kitchen_set_status`:

```sql
kitchen_confirm_payment(p_order_id uuid)
```

- `GRANT EXECUTE ... TO kitchen`, `REVOKE ALL FROM public`.
- `store_id` lấy từ `kitchen_store_id()` — JWT, fail-closed, **không tin client**.
- `bank_transfer` (đơn staff): luôn cho phép.
- `zalo_checkout`: cho phép **CHỈ KHI `bank_handoff_at IS NOT NULL`** — tức khách ít nhất đã
  sang app ngân hàng (notify BANK đã về, §1). Bếp không suy ra được instrument (§2.1) nên
  không phân biệt ví/bank được, nhưng `bank_handoff_at` chứng minh khách **đã qua bước chọn
  chuyển khoản**. Nếu khách trả ví thì callback đã set `payment_received_at` → RPC idempotent
  trả nguyên trạng, không ghi đè `via='zalo_callback'`.
  *(Bản đầu spec ghi "từ chối `zalopay`/`momo`/`vnpay`" — sai, vì đó là instrument chứ không
  phải kênh. Bản này gate theo `bank_handoff_at` thay vì mở toàn bộ — xem đánh đổi dưới.)*
- `cash`: chỉ khi `stores.kitchen_can_confirm_cash = true`, ngược lại RAISE.
- Đơn `cancelled`: từ chối.
- `bank_handoff_at IS NULL` (khách bấm checkout rồi thoát, chưa chọn gì): **RPC từ chối**, và
  nút "Đã nhận tiền" **không hiện** ở Kitchen (§8.1). Enforce ở **cả RPC lẫn UI**, không chỉ
  ẩn nút phía client.

⚠️ **Vì sao gate `bank_handoff_at` thay vì mở mọi `zalo_checkout`** (đổi so với bản đầu):
54/90 đơn prod là khách bấm checkout rồi bỏ, **không hề có notify → không có `bank_handoff_at`**.
Mở toàn bộ `zalo_checkout` cho bếp bấm = 54 đơn đó đều có nút "Đã nhận tiền" dù chưa ai chọn
gì. Gate theo `bank_handoff_at` loại sạch nhóm này khỏi bề mặt bấm nhầm/bấm gian, chỉ để lại
đúng những đơn khách thật sự đã sang app ngân hàng.

**Đánh đổi còn lại (nhỏ):** nếu notify BANK của Zalo **bị mất** (khách chuyển tiền thật nhưng
notify không về → `bank_handoff_at` NULL), bếp không bấm được. **Đường thoát: owner** —
`confirm_manual_payment` (mig 028:401) đối chiếu app ngân hàng rồi xác nhận tay. ⚠️ Hai việc
với RPC này: **PM-1 bắt buộc thêm `via='owner'`** (không thì vỡ constraint 3 trạng thái — §16.1);
**PM-3 nới nó cho `zalo_checkout`** (hiện từ chối sạch) để cứu đơn notify-mất. Đổi rủi ro "bếp
bấm nhầm 54 đơn rác" lấy rủi ro hiếm hơn nhiều "notify mất + phải nhờ owner" là đáng.

Đuôi định danh (§5.3) vẫn bắt buộc: kể cả trong nhóm đã `bank_handoff_at`, bếp phải khớp số loa
đọc với số trên card thay vì bấm bừa.
- Set `payment_received_at = now()`, `payment_received_via = 'kitchen'`, `by = null`.
- **Idempotent:** đã có `payment_received_at` thì trả nguyên trạng, không ghi đè lần đầu.
- **KHÔNG** đụng `orders.status`.

Owner vẫn dùng `confirm_manual_payment` (spec staff §6.2), chỉ bổ sung
`payment_received_via = 'owner'`, `payment_received_by = auth.uid()`.

### 6.2 Đánh đổi về audit — phải nói thẳng

Khi bếp bấm, audit chỉ ghi được **"máy bếp quán X"**, không ghi được ai bấm — máy tính bảng
dùng chung, không có danh tính người.

- **Chuyển khoản:** chấp nhận được. Tiền đã nằm trong TK ngân hàng quán, bếp không cầm được;
  bấm ẩu/gian thì đối chiếu sao kê cuối ngày lộ ra ngay.
- **Tiền mặt:** cầm được → đây chính là lý do `kitchen_can_confirm_cash` mặc định tắt. Bật là
  chủ quán chấp nhận đánh đổi, dành cho mô hình siêu nhỏ (chủ quán chính là bếp).

Điều này **đảo lại** spec staff §5 (*"chỉ `store_owner` xác nhận tiền"*) — có chủ ý, vì rủi ro
chuyển khoản và tiền mặt khác hẳn nhau.

---

## 7. Vào bếp — theo bằng chứng hiện diện, không theo phương thức

```text
Đơn cancelled → không bao giờ vào bếp (chặn trước mọi nhánh dưới)

order_source = 'staff'   → vào bếp NGAY, không cần tiền
                            (nhân viên đứng tại bàn = bằng chứng hiện diện thật)

order_source = 'customer_zalo' → vào bếp khi:
    payment_received_at IS NOT NULL          (đã có tiền thật)
    OR payment_method = 'cash'               (giữ nguyên hành vi hôm nay)
```

Thay `orderInKitchen(status, paymentMethod)` hiện tại
(`admin-web/lib/kitchen-announce.ts:10`).

**Vì sao `order_source` chứ không phải `table_id`:** `table_id` **không chứng minh khách có
mặt**. QR bàn bị chụp/chia sẻ thì người ở nhà vẫn tạo được đơn chưa trả tiền vào một bàn đang
có khách — quán mất đồ thật, và "nhân viên thấy bàn trống" chỉ là **phát hiện sau khi đã nấu**,
không phải phòng ngừa. Ngược lại, đơn `staff` chỉ tồn tại khi có nhân viên đăng nhập đứng cạnh
khách: đó là bằng chứng hiện diện duy nhất mà hệ thống thật sự có.

Cách này giữ **trọn vẹn** ý chống-abuse của quyết định 2026-06-26 cho đơn khách tự đặt, thay vì
nới ra như bản trước của spec này.

**Giá phải trả:** khách tự đặt tại bàn + chuyển khoản phải chờ bếp bấm xác nhận (~30s sau khi
loa đọc) thay vì vào bếp ngay. Chấp nhận — nút thắt chỉ rơi vào đơn khách tự đặt bằng chuyển
khoản, không rơi vào luồng staff.

Nhánh `cash` cho đơn khách giữ nguyên hành vi hiện tại (`pending + cash` → vào bếp) để **không
regression**: quán nào bật tiền mặt là đã chấp nhận đánh đổi đó từ trước (quyết định
2026-06-28, tiền mặt mặc định tắt).

Loa TTS vẫn báo đúng khoảnh khắc vào bếp (quyết định 2026-07-06) — chỉ định nghĩa "vào bếp"
đổi. Dedupe theo order ID giữ nguyên.

### 7.1 ⚠️ Predicate mới làm vỡ `cancel_order` — phải vá cùng lúc

Xác nhận thanh toán **không đổi `status`** (§6.1), nên đơn staff nằm ở `pending` suốt từ lúc
vào bếp tới khi bếp bấm "Bắt đầu làm". Mà `cancel_order` (`007a:99`) cho huỷ **mọi đơn
`pending`** có capability token:

```sql
UPDATE orders SET status = 'cancelled'
WHERE id = p_order_id AND status = 'pending' AND capability_token = p_token;
```

Trước đây đơn phải trả tiền → `confirmed` rồi mới vào bếp, nên `cancel_order` (chỉ đụng
`pending`) không với tới được. Predicate mới phá đúng lớp bảo vệ tình cờ đó. Sau khi đổi, đơn
**đã được báo bếp, bếp đang chuẩn bị, thậm chí đã xác nhận nhận tiền** vẫn có thể bị huỷ — chỉ
cần bếp chưa bấm "Bắt đầu làm".

Áp cho **cả đơn staff** (vào bếp ngay từ `pending`) lẫn đơn khách tiền mặt (`pending + cash`,
hành vi sẵn có).

`cancel_order` phải từ chối khi:

- `payment_received_at IS NOT NULL` — đã nhận tiền thì huỷ là việc của quán, không phải một
  nút trong app khách; **và**
- đơn đã vào bếp theo predicate §7 — đồ ăn có thể đã lên chảo.

Vá này **bắt buộc nằm cùng sprint với predicate mới (PM-2)**, không được tách ra sau.

---

## 8. UI

### 8.1 Kitchen Display — cột thứ 4, chỉ hiện khi cần

```text
[💰 CHỜ THANH TOÁN]  [⏳ CHỜ XỬ LÝ]  [🔥 ĐANG LÀM]  [✅ SẴN SÀNG]
   đơn khách tự đặt        như hiện tại
   chưa có tiền
   chưa có tiền
```

- Cột 1 **chỉ render khi có đơn trong đó** → bình thường bếp vẫn thấy đúng 3 cột như hiện tại.
- Đơn staff không bao giờ vào cột này (vào bếp ngay, §7).
- Card hiện **số tiền có đuôi** (105.**037**đ) to, rõ — để đối chiếu với loa.
- Nút "Đã nhận tiền" → `kitchen_confirm_payment` → đơn nhảy sang Chờ xử lý → TTS đọc đơn.
- **Đơn `zalo_checkout` chỉ hiện nút "Đã nhận tiền" khi `bank_handoff_at IS NOT NULL`** (§6.1) —
  khách chưa sang app ngân hàng thì card vẫn nằm cột chờ nhưng **không có nút** (badge "Khách
  chưa chuyển khoản"), tránh bếp bấm nhầm 54 đơn bỏ dở. Đây là ẩn ở UI; RPC vẫn enforce độc lập.
- Đơn `cash` chỉ hiện nút này khi `kitchen_can_confirm_cash = true`.

Vận hành: **loa ngân hàng đặt cạnh màn hình bếp**. Loa đọc số tiền → bếp so với card → bấm.
Đây là hướng dẫn lắp đặt, đưa vào tài liệu onboarding quán.

### 8.2 Admin — cấu hình phương thức (phạm vi thật hẹp hơn tưởng)

**MEVO chỉ chọn được `zalo_checkout` vs `cash`.** Việc bật/tắt/sắp xếp ZaloPay, Momo, VNPay,
chuyển khoản nằm ở **console Zalo** (kéo thả danh sách PT — quyết định 2026-07-08), không phải
ở admin MEVO và không phải trong code. Đừng dựng UI hứa điều mình không làm được.

- Tab Cửa hàng: bật/tắt `zalo_checkout`, `cash` (ghi `stores.payment_methods`).
- Cờ "quán có nhận chuyển khoản qua Zalo Checkout không" — **chủ quán tự khai**, vì MEVO không
  đọc được cấu hình console Zalo. Cờ này quyết định **có cấp đuôi hay không** (§5.3), nên khai
  sai là đối soát hỏng. Nhắc rõ trong UI.
- Công tắc `kitchen_can_confirm_cash`, kèm giải thích đánh đổi audit ở §6.2.
- Mini-app đọc `stores.payment_methods` để dựng danh sách cho khách (chỉ 2 lựa chọn).

### 8.3 Badge trạng thái tiền

- `Chuyển khoản — chưa nhận` / `Tiền mặt — chưa thu` → `payment_received_at IS NULL`
- `Đã nhận tiền` + nguồn (`bếp` / `chủ quán` / `SePay` / `ví Zalo`) → từ `payment_received_via`
- `Khách đang chuyển khoản…` → `bank_handoff_at` có mà `payment_received_at` chưa có

### 8.4 Checkout khách — giải thích đuôi định danh (bắt buộc khi `has_payment_tail`)

Ở quán bật chuyển khoản, `payment_amount` mang đuôi (105.**037**đ) trong khi giỏ hàng cộng ra
`total_amount` (105.000đ). Nếu màn checkout không giải thích, khách thấy Zalo đòi 105.037đ mà
giỏ ghi 105.000đ → **trông y hệt lỗi tính tiền**, khách nghi ngờ hoặc bỏ đơn.

Khi đơn `has_payment_tail = true`, màn checkout khách phải hiện rõ:

```text
Tổng đơn:         105.000đ
Số cần thanh toán: 105.037đ
  (37đ cuối là mã định danh giao dịch, giúp quán khớp đúng đơn của bạn)
```

- Chỉ hiện dòng giải thích khi thật sự có đuôi (`payment_amount <> total_amount`); quán chỉ-ví
  hoặc đơn cash **không** hiện, tránh gây rối vô cớ.
- Số Zalo Checkout mở app ngân hàng = `payment_amount` (MAC ký số này, §5.3) → khách chuyển
  đúng số có đuôi.

---

## 9. SePay — sprint cuối, có thể hoãn

> **Sprint này độc lập.** Hoãn hay bỏ đều không ảnh hưởng §1–§8. Khi chưa có SePay, quán chạy
> bằng loa + bếp bấm tay, **0đ**, đầy đủ chức năng.

Webhook biến động số dư → tự set `payment_received_at`, `payment_received_via='sepay'`. Cùng
cột với bếp bấm, nên **không đụng bếp/doanh thu/UI**.

- **Gói free 0đ / 50 giao dịch/tháng** phủ hết lưu lượng pilot → giữ nguyên lời hứa "miễn phí"
  của quyết định 2026-07-08. Trên ~80 giao dịch/tháng, gói 120k/tháng (~667đ/đơn) vẫn rẻ hơn
  VietQR Pro (~1.500đ/đơn).
- **11 ngân hàng API trực tiếp:** VCB, VPBank, ACB, Sacombank, VietinBank, MB, BIDV, MSB,
  TPBank, KienLong, OCB. Hỗ trợ cả **tài khoản cá nhân** — đúng phân khúc hộ kinh doanh.
- Khớp đơn bằng **số tiền duy nhất** (§5.3).
- Secret/cấu hình per-store → bảng riêng theo khuôn `store_checkout_configs` (RLS khoá, không
  để lộ anon — bài học từ quyết định 2026-07-01).

**Chặn trước khi làm:**
1. **Ngân hàng của Pubu có trong danh sách 11 không?** Chưa biết. Không có thì sprint này vô nghĩa với Pubu.
2. Payload + cách xác thực webhook SePay — **phải đọc tài liệu trước khi thiết kế**, đúng bài học đã đau với MAC của Zalo.
3. **Riêng tư:** SePay đọc **toàn bộ** biến động số dư TK quán, kể cả giao dịch không liên quan MEVO, và webhook về server MEVO. Chủ quán phải hiểu và đồng ý — cần dòng giải thích lúc onboard. Đây là quyết định của họ, không phải của MEVO.

**So sánh đã loại:** VietQR Pro (~1.500đ/đơn, BĐSD chủ yếu MB/BIDV) — đắt hơn theo đơn và phủ
ít ngân hàng hơn, phá mất lý do "miễn phí" của chuyển khoản.

---

## 10. Xử lý lỗi

- **Notify BANK đến trước khi đơn tồn tại** (race): ack 200, không tạo đơn ma.
- **Notify BANK đến nhiều lần:** `bank_handoff_at` set một lần, không ghi đè.
- **Bếp bấm khi mất mạng:** disable nút khi đang gửi; lỗi thì giữ card ở cột cũ + toast, không
  giả vờ thành công.
- **Bếp bấm hai lần / hai máy bếp cùng bấm:** RPC idempotent → lần sau trả nguyên trạng, không
  ghi đè `payment_received_at` đầu tiên.
- **SePay bắn trùng:** idempotent theo cùng cơ chế.
- **SePay bắn cho đơn đã bếp xác nhận tay:** giữ lần đầu (`via='kitchen'`), không ghi đè. Số
  tiền vẫn đúng vì chỉ đếm một lần.
- **Reconnect realtime:** refetch một lần, dedupe chuông/TTS theo order ID.

---

## 11. Rủi ro

| # | Rủi ro | Xử lý |
|---|---|---|
| 1 | **Momo/VNPay có thật sự đi đường Callback (auto-confirm) không?** Chưa test. Nếu chúng rơi vào nhánh `resultCode == null` thì **dính y hệt bug §1.1**. | `checkout-notify` phải **fail-closed**: method lạ + không có `resultCode` → **KHÔNG confirm**, chỉ log + ack. Không mở rộng nhánh custom-method cho bất kỳ method nào chưa test. |
| 2 | Quán bật `bank_transfer` nhưng chưa có ai xác nhận (không loa, không SePay) → đơn khách tự đặt kẹt ở cột chờ | Admin cảnh báo khi bật `bank_transfer` mà chưa cấu hình nguồn xác nhận nào |
| 3 | Bếp bấm bừa "đã nhận" cho đủ chỉ tiêu | Đối chiếu sao kê cuối ngày; báo cáo lọc theo `payment_received_via` để thấy tỉ lệ xác nhận tay |
| 4 | Đuôi số tiền trùng nhau trong tập đơn chưa thanh toán | Bất biến do **partial unique index** giữ (§5.3), không phải code kiểm lúc gán → retry khi `unique_violation`; test hai đơn cùng giá ở quán bật-CK và quán chỉ-ví |
| 4b | **Đuôi bị đơn `pending` bỏ dở giữ vĩnh viễn → cạn 1.000 đuôi / DoS.** 54 đơn prod đã bỏ dở; kẻ xấu spam đơn cùng giá làm cạn dải giá hoặc vượt N retry → chặn đơn thật. | PM-2: **TTL loại đơn `pending` bỏ dở khỏi index** (`created_at > now()-T` trong `where`, hoặc cron hết hạn) + **rate limit tạo đơn** theo `zalo_user_id`. `T` phải LỚN hơn cách ly tái dùng đuôi (§5.3) để webhook trễ không khớp nhầm. |
| 5 | **Owner huỷ đơn ĐÃ THU TIỀN → doanh thu bốc hơi, tiền vẫn ở ngân hàng.** §7.1 chỉ chặn `cancel_order` (phía khách); owner vẫn UPDATE `status='cancelled'` qua admin được. Doanh thu = `at IS NOT NULL AND status <> 'cancelled'` → tụt, tiền thật vẫn nằm trong TK. Chưa có luồng hoàn tiền nên đây là **lỗ đối soát thật**. | PM-4: admin cảnh báo khi huỷ đơn đã thu tiền, buộc ghi lý do; báo cáo có mục "đã thu nhưng đã huỷ" để không mất dấu. Hoàn tiền vẫn ngoài phạm vi (§14). |
| 6 | **Đơn staff sẽ đủ điều kiện quay vòng quay.** Đổi `v_paid` sang `payment_received_at` thì đơn staff (owner xác nhận) thành eligible — nhưng đơn staff **không có `zalo_user_id`**, khách không ở trong app, không ai quay được. | PM-1 chốt rõ: `get_spin_state`/`spin_wheel` yêu cầu **`order_source='customer_zalo'` VÀ có `zalo_user_id`**. Đơn staff không quay. |
| 7 | **Khách đổi ý phương thức lúc ra quầy** (đặt `bank_transfer`, đến quầy lại trả tiền mặt). `payment_method` ghi lúc đặt nên sẽ sai. | Chấp nhận: `payment_received_at` vẫn đúng nên **doanh thu không sai**, chỉ thống kê theo phương thức lệch chút. Khách trả đúng số tiền có đuôi. Không xây UI đổi method (YAGNI) — gặp nhiều mới làm. |

---

## 12. Kế hoạch triển khai

> Sau mỗi Sprint: dừng, đọc checklist trong `TESTING.md`, báo anh Tú test, chờ **PASS**.
> Không tự chuyển Sprint.
>
> ⚠️ **`TESTING.md` hiện chỉ có checklist SA-1…SA-5, CHƯA có PM-1…PM-5.** Lúc lập plan phải
> soạn checklist cho từng sprint PM (dựa trên §13 + các "Test:" trong §12) **trước khi bắt đầu
> PM-1** — nếu không, "đọc checklist trong TESTING.md" ở mỗi điểm dừng không có gì để đọc.

### Sprint PM-1 — Vá bug + ba cột + gộp doanh thu (ADDITIVE, quan trọng nhất)

> **KHÔNG rename kênh trong PM-1** (callout §5). PM-1 chỉ THÊM, không đổi giá trị/không siết
> CHECK → an toàn với mini-app prod đang gửi `'zalopay'`.

- Migration `030` **additive**: thêm `payment_instrument`, `payment_received_via`,
  `bank_handoff_at`, `has_payment_tail` (default false, inert tới PM-2), `payment_amount`
  (**default 0 + NOT NULL**, §5.3a), `kitchen_can_confirm_cash`, constraint 3 trạng thái, partial
  unique index (trống tới PM-2). **Giữ nguyên** `orders_payment_method_check` + `stores_payment_methods_valid`.
  Backfill §5.2 **bỏ bước rename**, gồm: instrument (`wallet`/`bank`/**`cash`** + **`bank_transfer→bank`**),
  nguồn sự thật ví, `via='owner'` cho đơn do 028 xác nhận (bước 5), 7 đơn BANK rời doanh thu,
  `payment_amount=total_amount`.
- **⚠️ [P0] `confirm_manual_payment` (mig 028:401) PHẢI rewrite Ở PM-1** — hiện set `at`+`by`
  KHÔNG set `via`. Sau khi thêm constraint 3 trạng thái, mọi lần owner xác nhận cash/bank **vỡ
  constraint**. Thêm `payment_received_via = 'owner'` (giữ owner-only + idempotent). *(Việc "nới
  cho `zalo_checkout`" vẫn để PM-3; nhưng `via='owner'` KHÔNG hoãn được.)*
- **⚠️ [P1] `create_order` VÀ `staff_create_order` đều phải set `payment_amount`:**
  - `create_order` (027:259): UPDATE cuối set `payment_amount = total_amount`, `has_payment_tail
    = false`.
  - `staff_create_order` (**mig 029:173** — bản mới nhất): UPDATE cuối set `payment_amount =
    v_total`; INSERT set `payment_instrument = case p_payment_method when 'bank_transfer' then
    'bank' else 'cash' end`. **Giữ nguyên** kiểm `mevo_operators.is_active` + `order_source='staff'`
    của 029. Bỏ sót hàm này = mọi đơn staff mới `payment_amount=0` + instrument NULL.
- `checkout-notify` **sửa CẢ HAI nhánh** (tách logic phân loại + quyết định mutation ra hàm
  THUẦN, test vitest — §12 test list):
  - **Nhánh BANK**: chỉ xử lý khi **`data.method === 'BANK'`** (whitelist đã normalize); method
    lạ → **log + ack, KHÔNG mutation** (Rủi ro #1, fail-closed thật). Update **chỉ** set
    `bank_handoff_at` + `payment_instrument='bank'`, và **chỉ khi** đơn `status='pending'` +
    `payment_received_at IS NULL` (KHÔNG ghi đè nếu callback ví đã tới trước) + `bank_handoff_at
    IS NULL` (idempotent). Thôi set `status`/`zalopay_trans_id`.
  - **Nhánh ví** (`index.ts:163`, chạy khi `resultCode==1`): ghi **trong cùng một UPDATE**:
    ```text
    status               = 'confirmed'
    zalopay_trans_id     = transId
    payment_received_at  = now()
    payment_received_via = 'zalo_callback'
    payment_received_by  = null
    payment_instrument   = map(data.method): whitelist → 'wallet'/'momo'/'vnpay', lạ → NULL
    ```
    PM-1 **giữ đối chiếu `total_amount`** (index.ts:157) — vì PM-1 `payment_amount=total_amount`.
    Ghi TODO(PM-2) đổi sang `payment_amount` ĐỒNG THỜI với `checkout-create-mac` (§5.3).
    **Bỏ 4 dòng `payment_*` = hỏng ví**: đơn ví mới `payment_received_at=NULL` → mất doanh thu.
- Doanh thu + **mọi predicate "đã thanh toán" toàn repo** về một luật `payment_received_at` —
  `get_daily_revenue`, `get_spin_state`, `spin_wheel`, `revenue.ts` (§4). ⚠️ **`voucher_uses`
  GIỮ nhánh `payment_method='cash'`**: `payment_method='cash' OR payment_received_at IS NOT NULL
  OR created_at > now()-30'` — đơn cash vào bếp ngay nên chiếm lượt ngay; bỏ nhánh cash =
  đơn cash đã làm/giao sau 30' nhả lượt → vượt `max_uses` (KHÔNG phải predicate "đã thanh toán").
- `get_spin_state`/`spin_wheel`: `v_paid := payment_received_at IS NOT NULL AND status<>'cancelled'
  AND order_source='customer_zalo' AND zalo_user_id IS NOT NULL` (Rủi ro #6, chặn đơn staff quay).
- Test: bấm trả tiền → thoát app NH → **đơn KHÔNG vào bếp, KHÔNG vào doanh thu** (bug §1.1).
- Test regression: đơn ví mới **vẫn vào doanh thu**; **đơn khách + đơn staff mới tạo được**
  (không vỡ NOT NULL `payment_amount`); **owner xác nhận cash/bank không vỡ constraint** (P0).
- Test đơn staff mới: `payment_amount = total_amount`, `payment_instrument` đúng cash/bank.
- Test: đơn bank đã thu **quay được**; đơn **staff KHÔNG quay**; **đơn cash chiếm lượt voucher
  ngay, không nhả sau 30'**.
- Test vitest hàm thuần checkout-notify: BANK hợp lệ→handoff-không-confirm; BANK invalid MAC→no
  mutation; method lạ→no mutation; ví thành công→5 trường; ví thất bại→không ghi tiền; amount
  mismatch→từ chối; lặp→idempotent; đơn cancelled/đã-nhận-tiền→không ghi đè.

**Điểm dừng:** PM-1 PASS.

### Sprint PM-2 — Vào bếp theo `order_source` + số tiền định danh
- **VIỆC 0 (test trước mọi thứ):** đơn có đuôi (`sum(item) ≠ amount`) → Zalo Checkout có từ
  chối không? (§5.3 "sum(item)=amount"). Kết quả quyết định có phải thêm dòng `item` đuôi trong
  `checkout-create-mac` hay không. **Không viết logic cấp đuôi trước khi biết.**
- Predicate §7, **cấp đuôi thật** §5.3/§5.3a: `create_order`/`staff_create_order` set
  `has_payment_tail = true` + `payment_amount = total_amount + đuôi` (retry theo unique index)
  khi quán bật CK. Chốt **biểu thức index cuối** + **TTL loại đơn `pending` bỏ dở** + **rate
  limit** (§5.3 "Đuôi bị giữ vĩnh viễn").
- **`SET NOT NULL` đã xong ở PM-1** — PM-2 không đụng lại; chỉ thêm logic đuôi.
- Test: đơn staff vào bếp ngay; đơn khách tự đặt + CK nằm chờ; đơn khách tiền mặt vào ngay (không regression).
- Test: hai đơn cùng giá ở quán bật-CK → `payment_amount` khác; quán chỉ-ví → KHÔNG vỡ unique.
- Checkout khách hiện dòng giải thích đuôi khi `has_payment_tail` (§8.4).
- **Vá `cancel_order` cùng sprint này** (§7.1) — không được tách ra sau.

**Điểm dừng:** PM-2 PASS.

### Sprint PM-3 — Bếp xác nhận
- `kitchen_confirm_payment`, cột 4 Kitchen Display, nút "Đã nhận tiền".
- **Gate `bank_handoff_at`** (§6.1): `zalo_checkout` chỉ xác nhận/hiện nút khi `bank_handoff_at
  IS NOT NULL` — enforce cả RPC lẫn UI.
- **Nới `confirm_manual_payment`** (owner) cho `zalo_checkout` + `bank_handoff_at` (§16 mục 3) —
  đường thoát khi notify mất.
- Test: bếp bấm → đơn sang Chờ xử lý + TTS; `cash` bị chặn khi cờ tắt.
- Test: đơn `zalo_checkout` chưa `bank_handoff` → **không có nút**, gọi thẳng RPC bị từ chối.
- Test: đơn ví (`payment_instrument='wallet'`) → owner `confirm_manual_payment` vẫn từ chối.

**Điểm dừng:** PM-3 PASS.

### Sprint PM-4 — Cấu hình + badge + báo cáo tiền thực nhận
- Tab Cửa hàng chọn phương thức, cờ "quán nhận CK qua Zalo" (§8.2), công tắc
  `kitchen_can_confirm_cash`, badge §8.3.
- **Báo cáo tách "doanh thu bán hàng" (`total_amount`) vs "tiền thực nhận" (`payment_amount`)**
  + chênh lệch định danh (§4.1) — để đối chiếu sao kê ngân hàng.
- Test: tắt/bật phương thức → mini-app đổi theo; regression khách tự order + ví.
- Test: quán bật-CK có đuôi → "tiền thực nhận" > "doanh thu bán hàng" đúng bằng tổng đuôi.

**Điểm dừng:** PM-4 PASS.

### Sprint PM-5 — SePay *(có thể hoãn sang giai đoạn sau)*
- Chỉ làm sau khi trả lời được 3 câu chặn ở §9.

**Điểm dừng:** PM-5 PASS.

---

## 13. Checklist nghiệm thu

1. **Bấm trả tiền → thoát app ngân hàng ngay → đơn KHÔNG vào bếp, KHÔNG vào doanh thu.** *(bug §1.1)*
2. Chuyển khoản thật → loa đọc → bếp bấm → đơn vào bếp + TTS đọc + doanh thu tăng đúng.
3. **Đơn ví ZaloPay mới → callback → CÓ `payment_received_at` → vào doanh thu ngay.** *(bẫy §12 PM-1)*
4. **Đơn `bank_transfer` đã thu tiền → quay được vòng quay** *(luật cũ trong `027`, §4)*.
5. Đơn staff vào bếp ngay dù chưa trả tiền.
6. Đơn khách tự đặt + chuyển khoản nằm cột Chờ thanh toán tới khi xác nhận.
6b. Đơn khách tiền mặt vẫn vào bếp ngay như hôm nay *(không regression)*.
7. **Khách KHÔNG huỷ được đơn đã thu tiền hoặc đã vào bếp** qua `cancel_order` *(§7.1)*.
8. Hai đơn cùng giá gốc → `payment_amount` khác nhau, `total_amount` **giống nhau**.
9. **`total_amount` luôn = tổng món − voucher**, không bao giờ mang đuôi *(§5.3)*.
9b. **Quán chỉ bật ví: hai đơn cùng giá KHÔNG vỡ unique index** *(§5.3)*.
9c. **Đơn staff KHÔNG quay được vòng quay** *(Rủi ro #6)*.
9d. Backfill xong: 90 đơn `zalopay` → `zalo_checkout`; instrument 7 bank / 29 ví / 54 NULL.
6. Bếp bấm hai lần / hai máy cùng bấm → `payment_received_at` không đổi sau lần đầu.
7. `kitchen_can_confirm_cash=false` → bếp không thấy nút cho đơn tiền mặt; gọi thẳng RPC bị từ chối.
8. Bếp gọi `kitchen_confirm_payment` cho đơn **quán khác** → từ chối.
9. Bếp gọi `kitchen_confirm_payment` cho đơn **ví** → từ chối.
10. Doanh thu ở dashboard và trang Đơn hàng **khớp nhau** (một luật, §4).
11. Backfill: 29 đơn ví giữ nguyên doanh thu; 7 đơn BANK biến khỏi doanh thu.
12. Khách tự order + ví ZaloPay callback vẫn chạy.
13. Topping, serving hours, voucher, vòng quay không regression.
14. **Đơn khách MỚI tạo được sau migration** — không vỡ NOT NULL `payment_amount` *(§5.3a, P0)*.
15. **Đơn `zalo_checkout` chưa `bank_handoff_at`: bếp KHÔNG thấy nút, RPC từ chối** *(§6.1)*.
16. **Notify BANK về (khách sang app NH): `bank_handoff_at` set → bếp thấy nút "Đã nhận tiền".**
17. **Owner `confirm_manual_payment` cứu được đơn `zalo_checkout`+`bank_handoff` (notify-mất)** *(§16.3)*.
18. **Quán bật-CK: "tiền thực nhận" (`payment_amount`) khớp sao kê; "doanh thu bán hàng"
    (`total_amount`) không đổi** *(§4.1)*.
19. **Checkout khách có đuôi → hiện dòng giải thích "37đ là mã định danh"** *(§8.4)*.
20. `payment_instrument` điền đúng: cash/bank staff lúc tạo; ví/bank lúc callback/notify *(§3.2)*.

---

## 14. Ngoài phạm vi

- Đối soát bank-to-bank tự động bằng API ngân hàng trực tiếp (không qua SePay).
- Hoàn tiền tự động.
- Gộp/tách hoá đơn, chuyển bàn.
- Đăng ký merchant Momo/VNPay hộ quán.
- POS đầy đủ.

---

## 15. File dự kiến ảnh hưởng

```text
supabase/migrations/030_multi_method_payment.sql
  ├─ cột mới (gồm has_payment_tail, payment_amount default 0 + NOT NULL) + constraint 3 trạng
  │   thái + backfill (§5.1, §5.2, §5.3a)
  ├─ unique index cấp đuôi payment_amount lọc theo has_payment_tail (§5.3)
  ├─ SỬA create_order — set payment_amount=total_amount (PM-1); cấp đuôi + has_payment_tail (PM-2, §5.3a)
  ├─ kitchen_confirm_payment() — gate bank_handoff_at cho zalo_checkout (§6.1)
  ├─ SỬA confirm_manual_payment — nới cho zalo_checkout+bank_handoff (§16.3)
  ├─ SỬA get_spin_state, spin_wheel, voucher_uses  ← luật cũ trong 027 (§4)
  ├─ SỬA cancel_order — chặn huỷ đơn đã thu tiền/đã vào bếp (§7.1)
  └─ SỬA get_daily_revenue — một luật (§4)

supabase/functions/checkout-notify/index.ts     ← sửa CẢ HAI nhánh:
                                                   ví ghi payment_received_at + payment_instrument (§3.2)
                                                   BANK thôi confirm + set payment_instrument='bank' + fail-closed
supabase/functions/checkout-create-mac/index.ts ← :77 ký payment_amount THAY total_amount (§5.3)
mini-app/src/pages/checkout/index.tsx           ← rename kênh + 2 lựa chọn + giải thích đuôi (§2, §8.2, §8.4)
supabase/migrations/027_vouchers.sql (qua 030)  ← spin: chi customer_zalo + co zalo_user_id
supabase/migrations/007a_kitchen_isolation.sql (qua 030) ← cancel_order guard + abandon_zalopay_to_cash rename kênh
admin-web/lib/kitchen-announce.ts               ← rename kênh (PM-1) + predicate order_source (PM-2, §7)
admin-web/lib/revenue.ts (ĐÃ CÓ, mig 028)       ← hasRealMoney → payment_received_at (§4)
admin-web/lib/order-payment-badge.ts (ĐÃ CÓ)    ← rename kênh + badge (§8.3)
admin-web/app/kitchen/[storeSlug]/kitchen-display.tsx  ← cột 4 + nút Đã nhận tiền
admin-web/app/admin/orders/*                    ← badge + bỏ luật tính riêng
admin-web/app/admin/dashboard/page.tsx          ← bỏ luật tính riêng
admin-web/app/admin/settings/*                  ← chọn phương thức + kitchen_can_confirm_cash
admin-web/types/database.types.ts               ← PaymentMethod union
mini-app/src/types/database.types.ts            ← union thứ hai
mini-app/src/pages/payment.tsx                  ← danh sách phương thức theo store
CLAUDE.md                                       ← ghi quyết định, sửa lại đánh giá Option A
TESTING.md
```

---

## 16. Quan hệ với spec staff — SA ĐÃ deploy prod

⚠️ **Cập nhật 2026-07-21:** `2026-07-15-staff-assisted-ordering-design.md` **đã triển khai xong
và deploy prod** (mig `028_staff_assisted_ordering` + `029_staff_active_toggle`; SA-1…SA-5 PASS).
Nên §16 **không còn là "sửa doc trước SA-1"** — mà là **những gì PM phải làm với code SA đang
chạy**. Đã đối chiếu với mig 028 thật:

- ✅ **Đã đúng sẵn:** mig 028 **KHÔNG** đụng `stores_payment_methods_valid` (giữ
  `('zalopay','cash')`), đúng như spec này chốt (§5.1). `bank_transfer` chỉ vào
  `orders_payment_method_check`, không vào cột khách-thấy. Không phải sửa gì.
- ✅ **Đã có sẵn:** cột `order_source`/`created_by`/`payment_received_at`/`payment_received_by`/
  `client_request_id`, `staff_create_order`, `confirm_manual_payment` (idempotent, owner-only),
  `get_daily_revenue` nhánh `bank_transfer`/`cash`+`payment_received_at`. PM xây tiếp lên.
- ⚠️ **`kitchen-announce.ts:15` đã mở `bank_transfer`** cho đơn staff vào bếp ngay — PM-2 mở
  rộng predicate này theo `order_source` (§7), không viết lại từ đầu.

**Ba việc PM phải làm với code SA đang chạy** (không phải sửa doc):

1. **⚠️ [P0] `confirm_manual_payment` (mig 028:401) set `at`+`by` nhưng KHÔNG set `via`.** Sau
   khi PM-1 thêm constraint 3 trạng thái, mọi lần owner xác nhận cash/bank **vỡ constraint** →
   RPC lỗi. → **PM-1 (bắt buộc, không hoãn): rewrite thêm `payment_received_via = 'owner'`.**
   Giữ owner-only + idempotent + audit `payment_received_by` như bản 028.
   → **PM-3 (tách riêng): nới cho `zalo_checkout`** (đường thoát notify-mất, §6.1): cho phép khi
   `bank_handoff_at IS NOT NULL` **và** `payment_instrument` chưa phải ví; vẫn từ chối
   `zalo_checkout` chưa `bank_handoff` và đơn ví (callback lo).

2. **Rename kênh `zalopay`→`zalo_checkout`** — **KHÔNG ở PM-1** (callout §5: mini-app prod còn
   gửi `zalopay`, republish qua Zalo không tức thì). Tách thành **rollout rename backward-compatible**
   riêng: RPC/stores nhận cả hai giá trị → deploy dual-read → publish mini-app → backfill đổi
   canonical + siết `orders_payment_method_check` (028:153) / `stores_payment_methods_valid` →
   bỏ hỗ trợ `zalopay`. Chạm `get_daily_revenue`, 2 union TS, checkout mini-app.

3. **Comment "PM-4 mở `bank_transfer` cho khách"** trong mig 028:164 nay **sai** với mô hình
   cuối: khách không bao giờ chọn `bank_transfer` trực tiếp (dùng `zalo_checkout`, Zalo tự cho
   bank — §2.1). `bank_transfer` là kênh **staff-only vĩnh viễn**. Chỉ là comment, không phải
   hành vi — sửa comment khi đụng file (không bắt buộc, không ảnh hưởng logic).

---

## 17. Lịch sử quyết định của spec này

| Quyết định | Lý do |
|---|---|
| Notify Zalo = "khách chọn phương thức", KHÔNG phải bằng chứng trả tiền | Tài liệu Zalo xếp COD chung nhóm chuyển khoản; payload không có `resultCode`/`amount`; test thực tế 2026-07-15 xác nhận thoát app NH đơn vẫn confirmed |
| Chỉ một method `bank_transfer`, Zalo Checkout chỉ là cách khởi tạo | Tiền đi cùng một đường bank→bank; Zalo không giữ tiền |
| Ba cột: `payment_method` (kênh) × `payment_instrument` (báo cáo) × `payment_received_via` (ai xác nhận) | Bản đầu gộp kênh+instrument rồi khai "cố định theo đơn" — sai: Zalo không ghim method, instrument chỉ lộ ra lúc callback. 54/90 đơn `zalopay` chưa từng có instrument nào |
| Rename `zalopay` → `zalo_checkout` | Nhãn cũ là KÊNH, không phải phương thức. Giữ tên cũ = tái phạm đúng bệnh đã chữa cho `bank_manual` |
| `payment_amount` là số duy nhất được ký + đối chiếu cho MỌI instrument | MAC ký trước khi biết instrument. Rẽ nhánh total/payment = mọi giao dịch ví amount mismatch |
| `payment_received_at` là nguồn sự thật duy nhất, cả ví cũng ghi | Gộp 3 luật doanh thu chép ở 4 nơi về 1 |
| Vào bếp theo `order_source`, không theo phương thức/`table_id` | `table_id` không chứng minh khách có mặt (QR bị chụp/chia sẻ). Đơn staff = có nhân viên đứng cạnh khách, bằng chứng hiện diện duy nhất hệ thống thật sự có. Giữ trọn chống-abuse 2026-06-26 cho đơn khách |
| Bếp xác nhận CK; tiền mặt theo cờ `kitchen_can_confirm_cash` (default false) | CK bếp không cầm được tiền; tiền mặt cầm được nên default an toàn |
| SePay thay VietQR Pro | Free 50 gd/tháng giữ được "miễn phí"; 11 ngân hàng + TK cá nhân vs MB/BIDV |
| **Bếp xác nhận `zalo_checkout` chỉ khi `bank_handoff_at IS NOT NULL`** (sửa 2026-07-21 theo review) | Mở toàn bộ `zalo_checkout` = 54/90 đơn bỏ dở đều có nút bấm nhầm. `bank_handoff_at` chứng minh khách ít nhất đã sang app NH. Owner (`confirm_manual_payment`) là đường thoát khi notify mất |
| **Cột đóng băng `has_payment_tail`; unique index lọc theo nó, KHÔNG đọc `stores.payment_methods`** (sửa 2026-07-21) | Cấu hình quán đổi được sau khi đơn tạo + MAC đã ký; index đọc config sống sẽ đổi tính duy nhất của đơn cũ. Cờ đóng băng lúc tạo đơn giữ bất biến, và loại nhóm không-đuôi (quán chỉ-ví) khỏi index |
| **`create_order` set `payment_amount` ở UPDATE cuối, cột `default 0` cho INSERT đầu; NOT NULL từ PM-1** (sửa 2026-07-21 — bug P0) | `create_order` INSERT `total_amount=0` trước rồi mới biết tổng. NOT NULL không kèm default = chặn mọi đơn mới. PM-1 phải cấp `payment_amount` vì MAC ký nó |
| **TTL loại đơn `pending` bỏ dở khỏi index + rate limit** (bổ sung 2026-07-21) | Đuôi của đơn bỏ dở giữ vĩnh viễn → cạn 1.000 đuôi / DoS. TTL phải lớn hơn cách ly tái dùng đuôi để webhook trễ không khớp nhầm |
