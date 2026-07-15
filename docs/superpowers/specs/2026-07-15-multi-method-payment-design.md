# MEVO Hệ thống thanh toán đa phương thức — đặc tả thiết kế

> **Ngày:** 2026-07-15
> **Trạng thái:** Đã chốt thiết kế, chờ lập plan
> **Phạm vi:** Chủ quán chọn phương thức thanh toán; xác nhận tiền thật cho từng phương thức.
> **Phụ thuộc:** Làm **SAU** khi `2026-07-15-staff-assisted-ordering-design.md` (SA-1…SA-5) PASS.
> Spec đó dựng `payment_received_at` + `confirm_manual_payment` mà spec này xây tiếp lên.

> ### Đọc trước khi code — 3 điểm dễ sai nhất
>
> 1. **§1 — Notify của Zalo KHÔNG phải bằng chứng thanh toán.** Nó là sự kiện *"khách vừa
>    chọn phương thức"*. Code hiện tại hiểu sai điều này và đang tính doanh thu sai.
>    Đây là **bug đã xác nhận trên prod**, không phải rủi ro lý thuyết.
> 2. **§3 — Hai trục.** `payment_method` = tiền đi đường nào (đứng yên).
>    `payment_received_via` = mình biết tiền về bằng cách nào (đổi theo cấu hình quán).
>    Nhét chung một cột là nguồn gốc mọi mâu thuẫn.
> 3. **§6 — Bếp không có `auth.uid()`.** Kitchen Display chạy role Postgres `kitchen` + token,
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

## 2. Chỉ có MỘT phương thức chuyển khoản

Zalo Checkout **không phải một phương thức thanh toán** — nó là **một cách khởi tạo**
(deeplink mở app ngân hàng kèm sẵn số tiền). QR dán ở quầy là cách khởi tạo khác. Tiền đi
cùng một đường: app ngân hàng của khách → **thẳng TK ngân hàng quán**.

Nên **không có** "chuyển khoản qua Zalo" và "chuyển khoản thủ công" như hai method. Chỉ có
`bank_transfer`, với vài cách khởi tạo. Cách khởi tạo không cần lưu thành cột (YAGNI).

7 đơn test hiện tại đang **gắn nhãn sai** `payment_method='zalopay'` — thực chất là
`bank_transfer`. Xử lý ở §5.2.

---

## 3. Hai trục — quyết định kiến trúc trung tâm

| Trục | Cột | Giá trị | Đổi khi nào |
|---|---|---|---|
| Tiền đi đường nào | `payment_method` | `zalopay` `momo` `vnpay` `bank_transfer` `cash` | Khách chọn lúc đặt, cố định theo đơn |
| Mình biết tiền về bằng cách nào | `payment_received_via` | `zalo_callback` `sepay` `kitchen` `owner` | Theo cấu hình quán, đổi bất cứ lúc nào |

**Vì sao phải tách:** quán bật SePay thì đơn vẫn là chuyển khoản y hệt, chỉ khác ai xác nhận.
Nếu nhét chung một cột (kiểu `bank_manual`) thì bật SePay là tên cột tự mâu thuẫn với dữ liệu
(`bank_manual` + xác nhận tự động), và phải migrate đơn cũ mỗi lần đổi cấu hình.

Tách ra thì bật/tắt SePay **không đụng một dòng dữ liệu nào**.

### 3.1 Hai nhóm phương thức

| Nhóm | Method | Zalo báo qua | Xác nhận |
|---|---|---|---|
| **Đối tác trừ tiền** | `zalopay` `momo` `vnpay` | **Callback** — tiền đã trừ | Tự động, tin được |
| **Zalo không đụng tiền** | `bank_transfer` `cash` | **Notify** — khách vừa chọn | **Mình tự lo**: bếp bấm hoặc SePay |

Nhóm đối tác: **không xây gì thêm**. Nhánh ví trong `checkout-notify` (có `resultCode`, đối
chiếu `amount` với DB — `index.ts:116-160`) đã đúng và dùng lại được. Chủ quán bật/tắt trong
cấu hình; quán nào có merchant thì chạy. Momo/VNPay chưa test thật — xem §11 Rủi ro.

---

## 4. Một nguồn sự thật cho "tiền đã về"

Hiện tại "đã có tiền" được suy ra bằng **ba luật** tuỳ phương thức, chép ở **4 nơi**
(`get_daily_revenue` trong `014`, `admin/orders/page.tsx:65`, `admin/dashboard/page.tsx`, và
spec staff §4.4). Chắc chắn lệch nhau theo thời gian.

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
| `bank_handoff_at` | Khách đã sang app ngân hàng (từ notify). **Chỉ để hiển thị**, không bao giờ tính tiền. |

¹ `legacy` chỉ xuất hiện ở dữ liệu backfill (§5.2) — dữ liệu cũ không ghi ai thu tiền. Code
mới không bao giờ ghi giá trị này.

---

## 5. Dữ liệu và migration

```text
supabase/migrations/029_multi_method_payment.sql
```

*(028 dành cho staff spec. Kiểm lại số mới nhất trước khi code.)*

### 5.1 Thay đổi schema

```sql
-- Mở method: bank_manual (từ spec staff) → bank_transfer, thêm nhóm đối tác
-- Sửa CHECK orders.payment_method  → ('zalopay','momo','vnpay','bank_transfer','cash')
-- Sửa stores_payment_methods_valid → <@ ARRAY['zalopay','momo','vnpay','bank_transfer','cash']

alter table orders
  add column payment_received_via text null,
  add column bank_handoff_at timestamptz null;

alter table orders
  add constraint orders_payment_received_via_check
  check (payment_received_via in ('zalo_callback','sepay','kitchen','owner','legacy'));
-- 'legacy' CHỈ dành cho dữ liệu backfill (§5.2) — code mới KHÔNG bao giờ ghi giá trị này.
-- Có nó để không phải bịa ra người thu cho dữ liệu cũ vốn không ghi.

-- Bất biến: có via ⟺ có at
alter table orders
  add constraint orders_payment_received_consistency
  check ((payment_received_at is null) = (payment_received_via is null));

-- via='owner' thì phải biết ai; các via khác không có danh tính người
alter table orders
  add constraint orders_payment_received_by_check
  check (
    (payment_received_via = 'owner' and payment_received_by is not null)
    or (payment_received_via <> 'owner' and payment_received_by is null)
    or payment_received_via is null
  );

alter table stores
  add column kitchen_can_confirm_cash boolean not null default false;
```

`kitchen_can_confirm_cash` **mặc định false** — theo tiền lệ default an toàn của MEVO
(`spin_enabled` false, tiền mặt tắt mặc định). Quán siêu nhỏ tự bật, và khi bật là **chấp
nhận mất dấu vết ai thu tiền mặt** (§6.2).

### 5.2 Backfill dữ liệu cũ

> **Thứ tự chạy trong migration:** thêm cột → **backfill** → **rồi mới** add constraint.
> Constraint kiểm cả dòng cũ lúc ADD, nên backfill sai thứ tự là migration vỡ giữa chừng.

```sql
-- Đơn ví đã có tiền thật (29 đơn) → nguồn sự thật mới
update orders set payment_received_at = updated_at, payment_received_via = 'zalo_callback'
where zalopay_trans_id is not null and zalopay_trans_id not like 'BANK:%';

-- Legacy tiền mặt đã thu — via='legacy' vì dữ liệu cũ KHÔNG ghi ai thu.
-- Không dùng via='owner' ở đây: sẽ vi phạm orders_payment_received_by_check
-- (owner phải có payment_received_by), và bịa ra một người thu là sai sự thật.
update orders set payment_received_at = updated_at, payment_received_via = 'legacy'
where payment_method = 'cash' and status = 'paid' and payment_received_at is null;

-- 7 đơn BANK gắn nhãn sai → đúng bản chất, và KHÔNG có bằng chứng tiền về
update orders
set payment_method = 'bank_transfer',
    zalopay_trans_id = null,
    bank_handoff_at = updated_at,
    payment_received_at = null,
    payment_received_via = null
where zalopay_trans_id like 'BANK:%';
```

Doanh thu Pubu tự đúng lại sau backfill, không cần thao tác tay.

### 5.3 Số tiền duy nhất

Loa ngân hàng **chỉ đọc số tiền**. Hai đơn cùng 105.000đ thì người xác nhận không biết loa vừa
đọc đơn nào — **cột "chờ thanh toán" vô dụng nếu thiếu cái này**, và SePay cũng không tự khớp
được đơn.

Với đơn `bank_transfer`, `total_amount` được cộng thêm đuôi 3 chữ số:

```text
105.000đ  →  105.037đ
```

- **Bất biến:** đuôi duy nhất trong tập đơn `bank_transfer` **chưa thanh toán** của quán đó.
- Gán lúc tạo đơn, **sau** khi trừ voucher (`create_order` v5 ở `027` đã sửa `total_amount` rồi
  → cộng đuôi không phá gì; MAC ký sau nên tự khớp).
- Chỉ áp cho `bank_transfer`. Tiền mặt không cần; ví tự confirm.
- Doanh thu lệch vài trăm đồng mỗi đơn — chấp nhận, đổi lại đối soát chạy được.

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
- `bank_transfer`: luôn cho phép.
- `cash`: chỉ khi `stores.kitchen_can_confirm_cash = true`, ngược lại RAISE.
- `zalopay`/`momo`/`vnpay`: **TỪ CHỐI** — ví tự confirm, bấm tay = gian lận.
- Đơn `cancelled`: từ chối.
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

## 7. Vào bếp — một predicate, không quan tâm phương thức

```text
Đơn cancelled → không bao giờ vào bếp (chặn trước mọi nhánh dưới)

Đơn tại bàn  (table_id IS NOT NULL) → vào bếp NGAY, không cần tiền
Đơn mang về  (table_id IS NULL)     → chỉ vào bếp khi payment_received_at IS NOT NULL
```

Thay `orderInKitchen(status, paymentMethod)` hiện tại
(`admin-web/lib/kitchen-announce.ts:10`). Predicate mới **không còn nhìn `payment_method`** —
đúng tinh thần hai trục.

**Lý do tách theo `table_id`, không theo phương thức:** rủi ro không đều nhau. Đơn tại bàn mà
bùng thì đồ ăn ra bàn trống, nhân viên thấy ngay — trò nghịch, không phải gian lận có lợi.
Đơn mang về/ship mà bùng thì mất đồ thật. Đây là tinh chỉnh của quyết định 2026-06-26
(bắt trả trước chống QR abuse): giữ nguyên tinh thần, nhưng nhắm đúng chỗ rủi ro thật.

Loa TTS vẫn báo đúng khoảnh khắc vào bếp (quyết định 2026-07-06) — chỉ định nghĩa "vào bếp"
đổi. Dedupe theo order ID giữ nguyên.

---

## 8. UI

### 8.1 Kitchen Display — cột thứ 4, chỉ hiện khi cần

```text
[💰 CHỜ THANH TOÁN]  [⏳ CHỜ XỬ LÝ]  [🔥 ĐANG LÀM]  [✅ SẴN SÀNG]
   đơn mang về            như hiện tại
   chưa có tiền
```

- Cột 1 **chỉ render khi có đơn trong đó** → bình thường bếp vẫn thấy đúng 3 cột như hiện tại.
- Đơn tại bàn không bao giờ vào cột này.
- Card hiện **số tiền có đuôi** (105.**037**đ) to, rõ — để đối chiếu với loa.
- Nút "Đã nhận tiền" → `kitchen_confirm_payment` → đơn nhảy sang Chờ xử lý → TTS đọc đơn.
- Đơn `cash` chỉ hiện nút này khi `kitchen_can_confirm_cash = true`.

Vận hành: **loa ngân hàng đặt cạnh màn hình bếp**. Loa đọc số tiền → bếp so với card → bấm.
Đây là hướng dẫn lắp đặt, đưa vào tài liệu onboarding quán.

### 8.2 Admin — cấu hình phương thức

- Tab Cửa hàng: chọn phương thức bật/tắt (ghi `stores.payment_methods`).
- Công tắc `kitchen_can_confirm_cash`, kèm giải thích đánh đổi audit ở §6.2.
- Mini-app đọc `stores.payment_methods` để dựng danh sách cho khách.

### 8.3 Badge trạng thái tiền

- `Chuyển khoản — chưa nhận` / `Tiền mặt — chưa thu` → `payment_received_at IS NULL`
- `Đã nhận tiền` + nguồn (`bếp` / `chủ quán` / `SePay` / `ví Zalo`) → từ `payment_received_via`
- `Khách đang chuyển khoản…` → `bank_handoff_at` có mà `payment_received_at` chưa có

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
| 2 | Quán bật `bank_transfer` nhưng chưa có ai xác nhận (không loa, không SePay) → đơn mang về kẹt ở cột chờ | Admin cảnh báo khi bật `bank_transfer` mà chưa cấu hình nguồn xác nhận nào |
| 3 | Bếp bấm bừa "đã nhận" cho đủ chỉ tiêu | Đối chiếu sao kê cuối ngày; báo cáo lọc theo `payment_received_via` để thấy tỉ lệ xác nhận tay |
| 4 | Đuôi số tiền trùng nhau trong tập đơn chưa thanh toán | Bất biến ở §5.3 kiểm lúc gán; test riêng |
| 5 | **Khách đổi ý phương thức lúc ra quầy** (đặt `bank_transfer`, đến quầy lại trả tiền mặt). `payment_method` ghi lúc đặt nên sẽ sai. | Chấp nhận: `payment_received_at` vẫn đúng nên **doanh thu không sai**, chỉ thống kê theo phương thức lệch chút. Khách trả đúng số tiền có đuôi. Không xây UI đổi method (YAGNI) — gặp nhiều mới làm. |

---

## 12. Kế hoạch triển khai

> Sau mỗi Sprint: dừng, đọc checklist trong `TESTING.md`, báo anh Tú test, chờ **PASS**.
> Không tự chuyển Sprint.

### Sprint PM-1 — Vá bug + hai trục (quan trọng nhất)
- Migration `029`: method mới, `payment_received_via`, `bank_handoff_at`,
  `kitchen_can_confirm_cash`, constraint, backfill §5.2.
- `checkout-notify`: nhánh BANK **thôi confirm** → chỉ set `bank_handoff_at`. Fail-closed cho
  method lạ (Rủi ro #1).
- Doanh thu về **một luật** `payment_received_at` — sửa `get_daily_revenue` + 2 chỗ tính lại
  phía TS.
- Test: bấm trả tiền → thoát app ngân hàng → **đơn KHÔNG vào bếp, KHÔNG vào doanh thu**.

**Điểm dừng:** PM-1 PASS.

### Sprint PM-2 — Vào bếp theo `table_id` + số tiền duy nhất
- Predicate §7, đuôi số tiền §5.3.
- Test: đơn tại bàn vào bếp ngay; đơn mang về nằm chờ.

**Điểm dừng:** PM-2 PASS.

### Sprint PM-3 — Bếp xác nhận
- `kitchen_confirm_payment`, cột 4 Kitchen Display, nút "Đã nhận tiền".
- Test: bếp bấm → đơn sang Chờ xử lý + TTS; `cash` bị chặn khi cờ tắt.

**Điểm dừng:** PM-3 PASS.

### Sprint PM-4 — Cấu hình + badge
- Tab Cửa hàng chọn phương thức, công tắc `kitchen_can_confirm_cash`, badge §8.3.
- Test: tắt/bật phương thức → mini-app đổi theo; regression khách tự order + ví.

**Điểm dừng:** PM-4 PASS.

### Sprint PM-5 — SePay *(có thể hoãn sang giai đoạn sau)*
- Chỉ làm sau khi trả lời được 3 câu chặn ở §9.

**Điểm dừng:** PM-5 PASS.

---

## 13. Checklist nghiệm thu

1. **Bấm trả tiền → thoát app ngân hàng ngay → đơn KHÔNG vào bếp, KHÔNG vào doanh thu.** *(bug §1.1)*
2. Chuyển khoản thật → loa đọc → bếp bấm → đơn vào bếp + TTS đọc + doanh thu tăng đúng.
3. Đơn tại bàn vào bếp ngay dù chưa trả tiền.
4. Đơn mang về nằm cột Chờ thanh toán tới khi xác nhận.
5. Hai đơn cùng giá gốc → đuôi số tiền khác nhau.
6. Bếp bấm hai lần / hai máy cùng bấm → `payment_received_at` không đổi sau lần đầu.
7. `kitchen_can_confirm_cash=false` → bếp không thấy nút cho đơn tiền mặt; gọi thẳng RPC bị từ chối.
8. Bếp gọi `kitchen_confirm_payment` cho đơn **quán khác** → từ chối.
9. Bếp gọi `kitchen_confirm_payment` cho đơn **ví** → từ chối.
10. Doanh thu ở dashboard và trang Đơn hàng **khớp nhau** (một luật, §4).
11. Backfill: 29 đơn ví giữ nguyên doanh thu; 7 đơn BANK biến khỏi doanh thu.
12. Khách tự order + ví ZaloPay callback vẫn chạy.
13. Topping, serving hours, voucher, vòng quay không regression.

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
supabase/migrations/029_multi_method_payment.sql
supabase/functions/checkout-notify/index.ts     ← nhánh BANK thôi confirm + fail-closed
admin-web/lib/kitchen-announce.ts               ← predicate theo table_id
admin-web/lib/revenue.ts (mới)                  ← một luật dùng chung
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

## 16. Việc phải làm ở spec staff

`2026-07-15-staff-assisted-ordering-design.md` đang dùng `bank_manual`. Phải sửa:

- `bank_manual` → `bank_transfer` toàn file.
- Bỏ bảng đối chiếu "hai luồng bank" ở §3.1 — không còn hai luồng (§2 spec này).
- §4.4 ghi chú: luật doanh thu sẽ gộp về một ở PM-1.
- §4.2 thêm `payment_received_via` vào nhóm cột audit.

Rẻ vì chưa có dòng code nào.

---

## 17. Lịch sử quyết định của spec này

| Quyết định | Lý do |
|---|---|
| Notify Zalo = "khách chọn phương thức", KHÔNG phải bằng chứng trả tiền | Tài liệu Zalo xếp COD chung nhóm chuyển khoản; payload không có `resultCode`/`amount`; test thực tế 2026-07-15 xác nhận thoát app NH đơn vẫn confirmed |
| Chỉ một method `bank_transfer`, Zalo Checkout chỉ là cách khởi tạo | Tiền đi cùng một đường bank→bank; Zalo không giữ tiền |
| Hai trục `payment_method` × `payment_received_via` | Bật SePay không phải migrate dữ liệu; tên cột không nói dối |
| `payment_received_at` là nguồn sự thật duy nhất, cả ví cũng ghi | Gộp 3 luật doanh thu chép ở 4 nơi về 1 |
| Vào bếp theo `table_id`, không theo phương thức | Rủi ro bùng đơn tại bàn ≪ đơn ship; nhắm đúng chỗ rủi ro thật |
| Bếp xác nhận CK; tiền mặt theo cờ `kitchen_can_confirm_cash` (default false) | CK bếp không cầm được tiền; tiền mặt cầm được nên default an toàn |
| SePay thay VietQR Pro | Free 50 gd/tháng giữ được "miễn phí"; 11 ngân hàng + TK cá nhân vs MB/BIDV |
