# Thiết kế: Thanh toán lại khi khách bấm back ở màn chọn phương thức

**Ngày:** 2026-08-06
**Trạng thái:** Đã duyệt (anh Tú), chờ viết plan
**Phạm vi:** mini-app `checkout` + 1 migration siết `cancel_order`

---

## 1. Vấn đề

Khi khách bấm "Đặt món và thanh toán", `create_order` tạo đơn `pending` trong DB **trước**, rồi
mini-app mới mở sheet Zalo Checkout. Sheet đó hiện màn **chọn phương thức thanh toán** có nút
**Xác nhận** và nút **Quay lại**.

Hiện tại [`handleZaloPayPayment`](../../../mini-app/src/pages/checkout/index.tsx) **bỏ hoàn toàn
kết quả** mà `payWithCheckoutSDK` trả về: mọi trường hợp đều `clearCart()` rồi `navigate` sang
trang trạng thái đơn. Hệ quả:

- Khách bấm nhầm **Quay lại** → chưa trả đồng nào, nhưng **giỏ hàng bị xoá sạch** và bị đẩy sang
  màn trạng thái đơn, không có đường nào để trả tiền lại.
- Khách gọi món cho cả bàn xong mới bấm nhầm → phải hỏi lại cả bàn từ đầu. Đây là lý do chính
  khiến tính năng này đáng làm.

Hành vi "luôn navigate" là **có chủ đích** (commit `2a5d159` gỡ dialog "Thanh toán chưa hoàn tất"
vì nó báo nhầm cho khách đã chuyển khoản thật). Thiết kế này **không quay lại dialog đó** — nó chỉ
tách riêng đúng một nhánh mà tín hiệu là chắc chắn.

## 2. Bốn nhánh và độ tin cậy của tín hiệu

Từ màn chọn phương thức, luồng rẽ 4 nhánh:

| Nhánh | Khách làm gì | Tín hiệu SDK | Kết luận |
|---|---|---|---|
| **A** | Bấm **Quay lại** ngay | `PaymentDone` bắn nhưng `zpOrderId` rỗng → `outcome='cancelled'` | ✅ **Chắc chắn chưa trả tiền.** Zalo chưa hề tạo giao dịch nên không webhook nào sẽ về |
| **B** | Bấm Xác nhận → app NH → **chuyển tiền thật** | `resultCode≠1` + `isCustom=true` → `outcome='unpaid'` | ❌ Không phân biệt được với C |
| **C** | Bấm Xác nhận → app NH → **không chuyển** | Giống hệt B | ❌ Không phân biệt được với B |
| **D** | Ví ZaloPay, trả xong | `resultCode=1` → `outcome='success'` | ✅ Đã trả tiền |

Zalo **không nhìn thấy giao dịch bank→bank**, nên B và C là một khối mù — đây là giới hạn Option A
đã ghi trong `CLAUDE.md` (2026-07-08), thiết kế này **không cố giải quyết**. B/C vẫn giữ nguyên
luồng cũ: chủ quán/bếp liếc app ngân hàng rồi bấm xác nhận.

`orders.bank_handoff_at` **không dùng làm tín hiệu** — migration 035 đã ghi nhận notify BANK của
Zalo về rất chập chờn và phải bỏ phụ thuộc vào nó.

**Nhánh D đã chạy sẵn ở server**, không phải viết mới: [`decide.ts`](../../../supabase/functions/checkout-notify/decide.ts)
nhánh `wallet_confirm` tự set `status='confirmed'` + `payment_received_at` + `payment_instrument='wallet'`.
Quán nào bật Zalo Merchant là đơn tự vào bếp. Yêu cầu với thiết kế này là **không được làm hỏng
nhánh D**, chứ không phải bổ sung gì.

## 3. Quyết định thiết kế

### 3.1 Chỉ tách riêng nhánh A

Chỉ `outcome === 'cancelled'` mới đổi hành vi. B/C/D giữ nguyên đường cũ (`clearCart` + navigate).
Lý do: A là nhánh duy nhất mà tín hiệu chắc chắn, nên là nhánh duy nhất được phép nói với khách
"chưa thanh toán".

### 3.2 Ở lại trang giỏ hàng, không chuyển trang

Nhánh A **không** `clearCart()`, **không** `navigate`. Khách ở nguyên trang giỏ hàng với giỏ còn
nguyên vẹn. Lý do: khách bấm nhầm khi "chưa chọn xong món" cần sửa món ngay tại chỗ — đẩy sang màn
trạng thái đơn rồi bắt nạp `order_items` ngược về giỏ là vòng vo và dễ sai (topping, voucher phải
dựng lại đúng).

### 3.3 Giữ đơn `pending`, huỷ có chọn lọc

Đơn đã tạo **không huỷ ngay**. Chỉ huỷ khi khách chủ động bấm "Sửa món".

| Nút | Hành động | Vì sao |
|---|---|---|
| **Thanh toán lại** | `payWithCheckoutSDK(orderId cũ)` | Trả tiền cho đúng đơn đó. Không đẻ đơn mới, không rác. MAC ký lại từ `total_amount` trong DB nên số tiền luôn đúng |
| **Sửa món** | `cancel_order(orderId, token)` → tắt banner | Khách đổi ý thật thì đơn cũ mới thành vô nghĩa |

Phương án bị loại: *huỷ ngay rồi hai nút đều tạo đơn mới* — ít code hơn nhưng mỗi lần bấm nhầm đẻ
một đơn `cancelled`, mà `get_daily_revenue` đếm `total_orders = count(*)` **không lọc cancelled**
(mig 030) → số đơn/ngày của quán phồng lên vì thao tác nhầm.

Phương án bị loại: *không huỷ gì, để sweep 30' dọn* — đơn rác treo nửa tiếng, chiếm lượt voucher và
hiện trên màn bếp.

### 3.4 Banner không cần sống sót qua reload

Tín hiệu nhánh A truyền qua React state trong phiên, không ghi DB. Khách thoát app rồi quét QR lại
sẽ không thấy banner — chấp nhận được, vì đơn `pending` bỏ dở sẽ được `sweep_abandoned_orders` dọn
sau 30 phút. Đổi lại: không migration cho tín hiệu, không RPC mới, không có chuyện client tự khai
trạng thái thanh toán.

## 4. Thay đổi cụ thể

### 4.1 `mini-app/src/pages/checkout/index.tsx`

Thêm state:

```ts
const [unpaidOrder, setUnpaidOrder] = useState<{ id: string; token: string } | null>(null);
```

`handleZaloPayPayment` rẽ nhánh theo outcome (hiện đang bỏ giá trị trả về):

```
handleZaloPayPayment(orderId, capabilityToken)
   │
   ├── outcome === 'cancelled'  ────────────► Ở LẠI trang giỏ hàng
   │      (nhánh A)                             • KHÔNG clearCart()
   │                                            • KHÔNG navigate
   │                                            • setUnpaidOrder({ id, token })
   │                                            • localStorage.removeItem('mevo_last_takeaway_order')
   │
   └── 'success' | 'unpaid' | SDK ném lỗi ──► giữ nguyên hành vi hiện tại
          (nhánh B/C/D)                         • clearCart() + navigate(`/order-status/${id}`)
```

`capabilityToken` lấy từ `order.capabilityToken` mà `create_order` trả về — đã có sẵn trong RAM ở
callback `onSuccess`, không cần query lại.

**SDK ném lỗi vẫn đi đường cũ** (navigate): không rõ trạng thái thì không được kết luận "chưa trả tiền".

### 4.2 Banner

Hiện khi `unpaidOrder !== null`, ở cuối trang giỏ hàng.

- Tiêu đề: **Thanh toán chưa thành công**
- Phụ đề: *Đơn chưa được gửi tới bếp. Bạn có thể thanh toán lại hoặc sửa món.*
- Nút chính: **Thanh toán lại**
- Nút phụ: **Sửa món**

**Banner THAY THẾ nút "Đặt món và thanh toán" gốc, không nằm cạnh nó.** Nếu để cả hai cùng hiện,
khách bấm nút gốc sẽ gọi `create_order` lần nữa → hai đơn `pending` cùng lúc cho một giỏ hàng, đơn
cũ thành rác treo 30' và chiếm lượt voucher. Nút gốc chỉ quay lại sau khi khách bấm "Sửa món"
(lúc đó đơn cũ đã `cancelled`).

Hệ quả với việc sửa giỏ: khi banner đang hiện, khách vẫn **nhìn** thấy giỏ nhưng chưa nên đổi số
lượng — vì đơn `pending` đã chốt món rồi, sửa giỏ mà bấm "Thanh toán lại" thì trả tiền theo đơn cũ,
không theo giỏ đã sửa. Để tránh lệch: khi banner hiện, **khoá các nút tăng/giảm số lượng** trong
giỏ. Muốn sửa thì bấm "Sửa món" trước — đúng tên nút.

Trong lúc một trong hai nút đang chạy, khoá cả hai (dùng lại `isProcessing` sẵn có).

### 4.3 Migration 038 — siết `cancel_order`

`cancel_order` hiện chỉ guard `status='pending'` + đúng `capability_token` (mig 007a). Đơn ví đã trả
có `status='confirmed'` nên không huỷ được — an toàn sẵn. Nhưng **đơn chuyển khoản đã handoff vẫn
`pending`**, về lý thuyết huỷ được đơn khách đã trả tiền. Thêm một dòng guard:

```sql
create or replace function cancel_order(p_order_id uuid, p_token text)
  returns void language plpgsql security definer set search_path = public as $$
begin
  update orders set status = 'cancelled'
  where id = p_order_id
    and status = 'pending'
    and capability_token = p_token
    and payment_received_at is null;   -- ← THÊM: không huỷ đơn đã có tiền
end $$;
```

Đây là siết chặt thuần tuý, không đổi hành vi của bất kỳ luồng nào đang chạy đúng.

## 5. Ca biên

| Tình huống | Xử lý |
|---|---|
| Khách thoát app khi banner đang hiện | Đơn `pending` treo → `sweep_abandoned_orders` dọn sau 30'. Không cần làm gì thêm |
| `cancel_order` lỗi mạng khi bấm "Sửa món" | Snackbar lỗi, **giữ banner**, không tắt. Không để khách tưởng đã huỷ mà thực ra chưa |
| Đơn có voucher, khách bấm "Sửa món" | `voucher_uses` đếm `status <> 'cancelled'` (mig 030) → **tự nhả lượt ngay**. Riêng mã shipper đã khoá `zalo_user_id` vĩnh viễn lúc `create_order`, không rollback — nhưng khoá đúng người đang dùng nên vô hại |
| Voucher đã chọn ở giỏ hàng | **Giữ nguyên**, không reset. Khách sẽ trả lại ngay |
| Đơn mang về (`pickup`/`delivery`) | `mevo_last_takeaway_order` được set **trước** khi gọi thanh toán → nhánh A phải xoá key này, không thì app nhớ nhầm một đơn sắp bị bỏ |
| Bấm "Thanh toán lại" rồi lại bấm back | Đệ quy an toàn: lại rơi vào nhánh A, `setUnpaidOrder` cùng orderId. Không tạo đơn, không tích luỹ gì |
| Khách sửa số lượng khi banner đang hiện | Không xảy ra — nút tăng/giảm bị khoá khi banner hiện (§4.2). Muốn sửa phải bấm "Sửa món" |
| Nhánh D (ví ZaloPay) | Không ảnh hưởng. `resultCode=1` → `'success'` → đường cũ; callback server tự `confirmed` |

## 6. Test

Tín hiệu đến từ SDK Zalo nên phần lớn phải test tay trên Zalo thật. Bổ sung vào `TESTING.md`:

1. Bấm thanh toán → back ngay ở màn chọn PT → **giỏ còn nguyên**, banner hiện, ở lại trang giỏ hàng
2. Bấm "Thanh toán lại" → sheet mở lại → trả bằng chuyển khoản → vào trang trạng thái đơn; kiểm DB
   **không có đơn `cancelled` nào**
3. Bấm "Sửa món" → banner tắt, nút "Đặt món và thanh toán" quay lại → thêm 1 món → đặt lại → đơn cũ
   `cancelled`, đơn mới đúng tổng tiền
3b. Khi banner đang hiện: **không** thấy nút "Đặt món và thanh toán" gốc, nút tăng/giảm số lượng bị khoá
4. Nhánh B/C: bấm Xác nhận → sang app NH → quay lại → vào trang trạng thái đơn như cũ, **không**
   thấy banner
5. Đơn mang về nhánh A: kiểm `localStorage` đã xoá `mevo_last_takeaway_order`
6. Migration 038: với một đơn `pending` đã set `payment_received_at`, gọi `cancel_order` đúng token
   → đơn **không** bị huỷ

## 7. Ngoài phạm vi

- Phân biệt nhánh B với C (Zalo không cung cấp đủ dữ liệu — giới hạn Option A)
- Nút "Thanh toán lại" trên trang trạng thái đơn (cho khách nhánh B/C đổi ý, hoặc mở lại app sau)
- Đối chiếu tiền về tài khoản ngân hàng tự động (SePay đã bị loại 2026-07-24)
