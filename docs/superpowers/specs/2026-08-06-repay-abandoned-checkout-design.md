# Thiết kế: Thanh toán lại khi khách thoát màn chọn phương thức

**Ngày:** 2026-08-06
**Trạng thái:** Bản 2 — đã sửa theo review CODEX, chờ anh Tú duyệt
**Phạm vi:** mini-app (`payment.service.ts` + `checkout`) + 1 migration `cancel_order`

---

## 1. Vấn đề

Khi khách bấm "Đặt món và thanh toán", `create_order` tạo đơn `pending` trong DB **trước**, rồi
mini-app mới mở sheet Zalo Checkout. Sheet hiện màn **chọn phương thức thanh toán** có nút
**Xác nhận** và nút **Quay lại**.

Hiện tại [`handleZaloPayPayment`](../../../mini-app/src/pages/checkout/index.tsx) **bỏ hoàn toàn
kết quả** mà `payWithCheckoutSDK` trả về: mọi trường hợp đều `clearCart()` rồi `navigate` sang
trang trạng thái đơn. Hệ quả: khách bấm nhầm **Quay lại** → chưa trả đồng nào nhưng **giỏ hàng bị
xoá sạch**, bị đẩy sang màn trạng thái đơn, không có đường nào trả tiền lại. Khách gọi món cho cả
bàn xong mới bấm nhầm thì phải hỏi lại từ đầu — đây là lý do chính khiến tính năng này đáng làm.

Hành vi "luôn navigate" là **có chủ đích** (commit `2a5d159` gỡ dialog "Thanh toán chưa hoàn tất"
vì nó báo nhầm cho khách đã chuyển khoản thật). Thiết kế này **không quay lại dialog đó** — nó chỉ
tách riêng những nhánh mà tín hiệu là chắc chắn.

## 2. Nguồn sự thật: `resultCode` từ `PaymentDone`

### 2.1 Cách làm đúng theo tài liệu Zalo

[Tài liệu Checkout SDK](https://docs.zaloplatforms.com/docs/MA/checkoutSdk/integration-process/overview/maResult)
(cập nhật 2026-08-05) quy định với **ZMP SDK ≥ 2.45.0**: sự kiện `PaymentDone` truyền `data` cho
handler, đưa **thẳng** `data` đó vào `checkTransaction({ data })`, rồi đọc `resultCode`:

| `resultCode` | Ý nghĩa (nguyên văn tài liệu) |
|---|---|
| `1` | Thanh toán thành công |
| `0` | Giao dịch đang được thực hiện hoặc chờ xử lý |
| `-1` | Thanh toán thất bại |
| `-2` | **Người dùng không chọn phương thức thanh toán và thoát Checkout SDK** |

Mini-app đang ở `zmp-sdk` **2.49.4** → thoả điều kiện.

### 2.2 Code hiện tại đang làm sai

Handler [`onPaymentDone`](../../../mini-app/src/services/payment.service.ts) **nhận 0 tham số** —
vứt đúng cái `data` cần dùng — rồi chống chế bằng `zpOrderId` bắt từ callback `createOrder`. Hệ quả
là `outcome='cancelled'` bị gộp từ **bốn** đường khác hẳn nhau:

| Nơi sinh ra `'cancelled'` | Thực chất |
|---|---|
| `zpOrderId` rỗng | Khách thoát không chọn PT |
| `resultCode ≠ 1` và `isCustom = false` | Ví thanh toán thất bại/huỷ |
| callback `fail` | Lỗi tạo giao dịch |
| promise `.catch()` | Lỗi tạo giao dịch |

Bản 1 của spec này khẳng định "nhánh A ⟺ `cancelled`" — **sai**. Nguy hiểm thật nằm ở dòng thứ 2:
nếu `isCustom` báo sai cho một đơn chuyển khoản, khách đang trả tiền sẽ bị gán `'cancelled'` và bị
báo "chưa thanh toán" — đúng con bug mà `2a5d159` từng gỡ dialog vì nó.

### 2.3 Phân loại mới

Thay `ZaloPayOutcome` bằng bốn trạng thái tách bạch:

```ts
export type CheckoutOutcome =
  | 'success'          // resultCode 1 — đã trả tiền
  | 'abandoned'        // resultCode -2 — thoát không chọn phương thức
  | 'failed'           // resultCode -1 (không phải custom) hoặc lỗi tạo giao dịch
  | 'pending_confirm'  // resultCode 0, chuyển khoản, hoặc KHÔNG RÕ → chờ webhook/quán xác nhận
```

Thứ tự phân loại trong `onPaymentDone(data)`:

```
r = await checkTransaction({ data })

r.resultCode === 1   → 'success'
r.resultCode === -2  → 'abandoned'
r.isCustom === true  → 'pending_confirm'   // CK: Zalo không thấy giao dịch bank→bank
r.resultCode === -1  → 'failed'
ngược lại (0, lạ)    → 'pending_confirm'
```

Fail-safe ở mọi chỗ không chắc chắn:

- `checkTransaction` ném lỗi, hoặc `PaymentDone` không kèm `data` → `'pending_confirm'`.
  **Không bao giờ suy đoán "chưa trả tiền" khi không rõ.**
- `createOrder` callback `fail` / promise reject → `'failed'` (giao dịch chưa hình thành,
  chắc chắn chưa mất tiền).

`isCustom` được kiểm **trước** `-1` vì Zalo không nhìn thấy giao dịch bank→bank, nên với chuyển
khoản `resultCode` không đáng tin — giữ nguyên kết luận đã rút ra từ thực nghiệm (commit `11c6931`).

### 2.4 Nhánh nào hiện banner

| Outcome | Hành vi | Vì sao |
|---|---|---|
| `abandoned`, `failed` | **Ở lại trang giỏ hàng + banner** | Chắc chắn chưa mất tiền, khách cần trả lại |
| `success`, `pending_confirm` | `clearCart()` + `navigate` (đường cũ) | Đã trả tiền, hoặc không đủ chắc để nói "chưa" |

`orders.bank_handoff_at` **không dùng làm tín hiệu** — mig 035 đã ghi nhận notify BANK của Zalo về
rất chập chờn và phải bỏ phụ thuộc vào nó.

**Nhánh ví ZaloPay đã chạy sẵn ở server**, không phải viết mới:
[`decide.ts`](../../../supabase/functions/checkout-notify/decide.ts) nhánh `wallet_confirm` tự set
`status='confirmed'` + `payment_received_at` + `payment_instrument='wallet'`. Quán bật Zalo Merchant
là đơn tự vào bếp. Yêu cầu ở đây là **không làm hỏng nó**, chứ không phải bổ sung gì.

## 3. Vòng đời đơn `pending`

### 3.1 Giữ đơn, huỷ có chọn lọc

Đơn đã tạo **không huỷ ngay** khi phát hiện `abandoned`/`failed`. Chỉ huỷ khi khách chủ động bấm
"Sửa món".

| Nút | Hành động |
|---|---|
| **Thanh toán lại** | `payWithCheckoutSDK(orderId cũ)` — trả tiền cho đúng đơn đó. Không đơn mới, không rác. MAC ký lại từ `total_amount` trong DB nên số tiền luôn đúng |
| **Sửa món** | `cancel_order(orderId, token)` → chỉ tắt banner khi RPC báo huỷ thành công (§4.3) |

Phương án bị loại — *huỷ ngay rồi hai nút đều tạo đơn mới*: mỗi lần bấm nhầm đẻ một đơn `cancelled`,
mà `get_daily_revenue` đếm `total_orders = count(*)` **không lọc cancelled** (mig 030) → số đơn/ngày
của quán phồng lên vì thao tác nhầm.

### 3.2 Đơn bỏ dở nằm trên màn bếp — và sweep không chạy đúng 30'

Đơn `abandoned` khớp **cả bốn** điều kiện cột "💰 CHỜ THANH TOÁN" của màn bếp
([kitchen-display.tsx:592](../../../admin-web/app/kitchen/[storeSlug]/kitchen-display.tsx)):
`status='pending'` + `payment_received_at=null` + `payment_method='zalo_checkout'` +
`instrument≠'wallet'`. Nghĩa là **nó đang hiện trên màn bếp thật**.

`sweep_abandoned_orders` là **lazy sweep**: nơi gọi duy nhất là
[admin/orders/page.tsx:41](../../../admin-web/app/admin/orders/page.tsx). Không có cron. Quán không
mở trang Đơn hàng thì đơn treo vô hạn — **không phải "tự huỷ sau 30 phút"** như bản 1 viết.

**Đây không phải hồi quy do thiết kế này gây ra**: hôm nay khách bấm back cũng để lại y hệt một đơn
`pending` như vậy (`clearCart` + `navigate` không huỷ gì cả). Thiết kế này chỉ *không* làm nó tệ hơn,
và cho khách một đường thoát mà trước đây không có. Tự động dọn đơn treo nằm ngoài phạm vi (§8).

### 3.3 Khôi phục khi rời trang

React state mất khi rời trang giỏ hàng, không chỉ khi reload. Nếu không xử lý, khách rời đi rồi quay
lại sẽ mất banner nhưng đơn cũ vẫn sống → bấm "Đặt món và thanh toán" là có **hai** đơn `pending`.

Cách xử lý:

- Khi vào `abandoned`/`failed`: ghi `localStorage['mevo_unpaid_order'] = {orderId, token}`
- Mỗi lần trang giỏ hàng mount: nếu có key → hỏi DB trạng thái thật của đơn
  (`status`, `payment_received_at`). Chỉ dựng lại banner khi `status='pending'` **và**
  `payment_received_at IS NULL`; ngược lại xoá key, không banner.
- Xoá key khi: "Sửa món" huỷ thành công, hoặc tạo đơn mới thành công, hoặc kiểm tra thấy không còn
  đủ điều kiện.

Luôn hỏi lại DB thay vì tin localStorage: đơn có thể đã được bếp xác nhận tiền, đã bị sweep, hoặc
callback ví đã về trong lúc khách đi chỗ khác.

## 4. Thay đổi cụ thể

| Chỗ sửa | Việc |
|---|---|
| `mini-app/src/services/payment.service.ts` | `onPaymentDone(data)` nhận payload; tách hàm map thuần `mapCheckoutResult`; đổi `ZaloPayOutcome` → `CheckoutOutcome` |
| `mini-app/src/services/order/order.api.ts` | Thêm `getPaymentState(orderId)`; `cancelOrder` trả về `result` của RPC |
| `mini-app/src/pages/checkout/index.tsx` | Rẽ nhánh theo outcome; state `unpaidOrder`; banner; **khoá toàn bộ form**; khôi phục khi mount |
| Migration 038 | `cancel_order` trả kết quả rõ ràng + không huỷ đơn đã có tiền |

Không đụng: edge function, admin-web, trang trạng thái đơn.

### 4.1 Luồng

```
handleZaloPayPayment(orderId, capabilityToken)
   │
   ├── 'abandoned' | 'failed' ──────────────► Ở LẠI trang giỏ hàng
   │                                            • KHÔNG clearCart()
   │                                            • KHÔNG navigate
   │                                            • setUnpaidOrder({ id, token })
   │                                            • localStorage: ghi mevo_unpaid_order
   │                                            •              xoá mevo_last_takeaway_order
   │
   └── 'success' | 'pending_confirm' ───────► giữ nguyên hành vi hiện tại
                                                • clearCart() + navigate(`/order-status/${id}`)
```

`capabilityToken` lấy từ `order.capabilityToken` mà `create_order` trả về — đã có sẵn trong RAM ở
callback `onSuccess`.

### 4.2 Banner và khoá form

Hiện khi `unpaidOrder !== null`, ở cuối trang giỏ hàng.

- Tiêu đề: **Thanh toán chưa thành công**
- Phụ đề: *Bếp chưa bắt đầu làm đơn này. Bạn có thể thanh toán lại hoặc sửa món.*
- Nút chính: **Thanh toán lại**
- Nút phụ: **Sửa món**

Chữ "chưa được gửi tới bếp" ở bản 1 là **sai sự thật** — đơn đã hiện ở cột "CHỜ THANH TOÁN" của màn
bếp (§3.2). "Bếp chưa bắt đầu làm" mới đúng.

**Banner THAY THẾ nút "Đặt món và thanh toán" gốc, không nằm cạnh nó.** Để cả hai cùng hiện thì khách
bấm nút gốc sẽ gọi `create_order` lần nữa → hai đơn `pending` cho một giỏ hàng.

**Khoá TOÀN BỘ dữ liệu đã chốt vào đơn**, không chỉ số lượng. Đơn `pending` đã snapshot món, giá,
voucher và tổng tiền; sửa bất cứ thứ gì trong lúc banner hiện đều làm màn hình nói dối, vì
"Thanh toán lại" trả theo `total_amount` của **đơn cũ**, không theo giỏ đang hiển thị. Đổi voucher là
ca lệch rõ nhất. Danh sách phải khoá:

| Thành phần | Vị trí |
|---|---|
| Nút tăng/giảm số lượng | `updateQuantity` trong danh sách món |
| Ghi chú đơn | [checkout:379](../../../mini-app/src/pages/checkout/index.tsx) |
| Chọn phương thức thanh toán | [checkout:395,405](../../../mini-app/src/pages/checkout/index.tsx) |
| Mã giảm giá | [`VoucherSection`](../../../mini-app/src/components/checkout/voucher-section.tsx) |
| Form mang về (kiểu, tên, SĐT, địa chỉ) | [checkout:248-310](../../../mini-app/src/pages/checkout/index.tsx) |

Cài bằng một cờ duy nhất `isLocked = unpaidOrder !== null`, truyền xuống các khối. Muốn sửa thì bấm
"Sửa món" — đúng tên nút. Trong lúc một trong hai nút đang chạy, khoá cả hai (dùng lại `isProcessing`).

### 4.3 Migration 038 — `cancel_order` trả kết quả

`cancel_order` hiện `RETURNS void` với `UPDATE ... WHERE status='pending' AND capability_token=...`
(mig 007a). UPDATE trúng 0 dòng **không sinh lỗi**, mà [order.api.ts](../../../mini-app/src/services/order/order.api.ts)
chỉ kiểm `error` → client tưởng đã huỷ trong khi đơn còn nguyên. Với thiết kế này, đó là ca: khách
bấm "Sửa món" đúng lúc bếp vừa bấm "Đã nhận tiền" → banner tắt, khách đặt đơn mới, quán ôm **hai**
đơn mà một đơn đã thu tiền.

Đổi kiểu trả về đòi `DROP` trước (Postgres không cho `CREATE OR REPLACE` khi đổi return type).
An toàn: `useCancelOrder` hiện **chưa nơi nào gọi**, RPC này đang không có consumer.

```sql
drop function if exists cancel_order(uuid, text);

create function cancel_order(p_order_id uuid, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order orders%rowtype;
begin
  select * into v_order from orders
   where id = p_order_id and capability_token = p_token;
  if not found then
    return jsonb_build_object('result','blocked','reason','not_found_or_bad_token');
  end if;
  if v_order.status = 'cancelled' then
    return jsonb_build_object('result','already_cancelled');
  end if;
  if v_order.payment_received_at is not null then
    return jsonb_build_object('result','blocked','reason','already_paid');
  end if;
  if v_order.status <> 'pending' then
    return jsonb_build_object('result','blocked','reason','in_progress');
  end if;

  update orders set status = 'cancelled'
   where id = p_order_id and status = 'pending' and payment_received_at is null;
  if not found then
    return jsonb_build_object('result','blocked','reason','race');
  end if;
  return jsonb_build_object('result','cancelled');
end $$;
revoke all on function cancel_order(uuid, text) from public;
grant execute on function cancel_order(uuid, text) to anon;
```

Quy tắc UI:

| `result` | UI làm gì |
|---|---|
| `cancelled`, `already_cancelled` | Tắt banner, xoá localStorage, mở khoá form |
| `blocked` + `already_paid` | **Giữ banner**, snackbar "Đơn này đã được thanh toán", chuyển sang trang trạng thái đơn |
| `blocked` (còn lại) | **Giữ banner**, snackbar lỗi, không mở khoá |
| Lỗi mạng | **Giữ banner**, snackbar lỗi |

## 5. Ca biên

| Tình huống | Xử lý |
|---|---|
| Khách rời trang giỏ hàng rồi quay lại | Khôi phục từ localStorage + hỏi lại DB (§3.3) |
| Khách thoát app hẳn | Đơn `pending` treo trên màn bếp tới khi chủ quán mở trang Đơn hàng (§3.2). Không phải hồi quy |
| Đơn có voucher, khách bấm "Sửa món" | `voucher_uses` đếm `status <> 'cancelled'` (mig 030) → **tự nhả lượt ngay**. Mã shipper đã khoá `zalo_user_id` lúc `create_order`, không rollback — nhưng khoá đúng người đang dùng nên vô hại |
| Voucher đã chọn ở giỏ hàng | **Giữ nguyên**, không reset. Khách sẽ trả lại ngay |
| Đơn mang về | `mevo_last_takeaway_order` set **trước** khi gọi thanh toán → `abandoned`/`failed` phải xoá key này |
| Bấm "Thanh toán lại" rồi lại thoát | Đệ quy an toàn: lại `abandoned`, cùng orderId. Không tạo đơn, không tích luỹ |
| `PaymentDone` không kèm `data` (SDK cũ/lỗi) | → `pending_confirm` → đi đường cũ. Banner không hiện; không nói sai với khách |
| Ví ZaloPay | `resultCode=1` → `success` → đường cũ; callback server tự `confirmed` |

## 6. Test

### 6.1 Unit test hàm map (cần dựng vitest cho mini-app)

`mapCheckoutResult` là hàm **thuần**, tách khỏi SDK — theo đúng nếp
[`decide.ts`](../../../supabase/functions/checkout-notify/decide.ts). Ca cần phủ:

| Input | Kỳ vọng |
|---|---|
| `resultCode=1` | `success` |
| `resultCode=-2` | `abandoned` |
| `resultCode=-1`, `isCustom=false` | `failed` |
| `resultCode=-1`, `isCustom=true` | `pending_confirm` |
| `resultCode=0` | `pending_confirm` |
| `resultCode` giá trị lạ | `pending_confirm` |
| `checkTransaction` ném lỗi | `pending_confirm` |
| không có `data` | `pending_confirm` |
| `createOrder` fail / reject | `failed` |

⚠️ **Mini-app hiện KHÔNG có hạ tầng test** — `package.json` chỉ có `typecheck`, không có vitest,
không có file `.test.ts` nào. Chạy được mục này cần thêm `vitest` + config vào `mini-app/`. Xem §7.

### 6.2 SQL test `cancel_order`

Chạy trực tiếp trên Supabase, kiểm `result` trả về đúng với: đơn `pending` sạch → `cancelled`;
đơn đã `payment_received_at` → `blocked/already_paid`; đơn `confirmed` → `blocked/in_progress`;
sai token → `blocked/not_found_or_bad_token`; gọi hai lần → `already_cancelled`.

### 6.3 Test tay trên Zalo thật (bổ sung `TESTING.md`)

1. Bấm thanh toán → thoát ngay ở màn chọn PT → **giỏ còn nguyên**, banner hiện, ở lại trang
2. Khi banner hiện: **không** thấy nút "Đặt món và thanh toán" gốc; số lượng, ghi chú, voucher,
   phương thức thanh toán, form mang về đều **không sửa được**
3. Bấm "Thanh toán lại" → sheet mở lại → trả bằng chuyển khoản → vào trang trạng thái đơn; DB
   **không có đơn `cancelled` nào**
4. Bấm "Sửa món" → banner tắt, nút gốc quay lại → thêm 1 món → đặt lại → đơn cũ `cancelled`,
   đơn mới đúng tổng tiền
5. Chuyển khoản (`pending_confirm`): bấm Xác nhận → sang app NH → quay lại → vào trang trạng thái
   đơn như cũ, **không** thấy banner
6. Rời trang giỏ hàng rồi quay lại khi đang có banner → banner dựng lại đúng
7. Sau khi bếp bấm "Đã nhận tiền", quay lại giỏ hàng → banner **không** dựng lại
8. Đơn mang về nhánh `abandoned`: `localStorage` đã xoá `mevo_last_takeaway_order`

## 7. Câu hỏi còn mở

**Có dựng vitest cho mini-app không?** Cần cho §6.1. Lợi: `mapCheckoutResult` đúng là loại logic
thuần đáng test, và nó là phần rủi ro nhất của thay đổi này. Tốn: thêm devDependency + config vào
`mini-app/`. Lưu ý `decide.test.ts` hiện nằm ngoài `admin-web/` nên `npm test` của admin-web
(vitest, không có config) **không quét tới** — nếp test của repo mỏng hơn vẻ ngoài.

## 8. Ngoài phạm vi

- Phân biệt "đã chuyển khoản thật" với "sang app ngân hàng rồi thoát" (Zalo không thấy giao dịch
  bank→bank — giới hạn Option A, `CLAUDE.md` 2026-07-08)
- Tự động dọn đơn `pending` treo (sweep hiện là lazy; cron/Edge Function định kỳ là việc riêng)
- Nút "Thanh toán lại" trên trang trạng thái đơn
- Đối chiếu tiền về tài khoản ngân hàng tự động (SePay đã loại 2026-07-24)
