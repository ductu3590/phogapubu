# MEVO — ZaloPay qua Zalo Checkout SDK (thiết kế)

> Ngày 2026-06-21. Thay thế mô hình ZaloPay openapi (đã hỏng: `openPayment` không tồn tại trong zmp-sdk 2.49.4) bằng **Zalo Checkout SDK** `Payment.createOrder`. Đã qua review của Plan agent — các fix bảo mật bên dưới là bắt buộc.

## Luồng
1. Checkout chọn ZaloPay → tạo đơn DB (`pending`) [giữ nguyên].
2. Mini app gọi edge `checkout-create-mac { orderId }` → server **tự đọc `total_amount` từ DB** (không tin client), build body `{amount,desc,item,extradata:{orderId},method}` + ký MAC bằng `ZALO_CHECKOUT_SECRET_KEY`, trả về.
3. Mini app `Payment.createOrder({...body, success, fail})`. success → `/order-status/:id`. fail → **KHÔNG huỷ đơn ở client** (để server quyết); hiện lỗi.
4. Zalo gọi `checkout-notify` (verify_jwt=false): verify MAC (template cố định), parse `extradata` (decodeURIComponent) → orderId của mình, kiểm `resultCode===1`, **đối chiếu `amount===total_amount`**, update `pending→confirmed` + `zalopay_trans_id=transId` (idempotent). `resultCode!==1` → huỷ đơn pending.
5. confirmed → realtime bếp + ZNS [giữ nguyên].

## Contract (chính thức)
- **createOrder MAC:** sort key a→z của `{amount,desc,extradata,item,method}`, `key=value` (object→JSON.stringify), join `&`, HMAC-SHA256(.,SECRET).
- **Callback `data`:** appId, orderId(Zalo), transId, method, amount, description, message, resultCode, extradata(URL-encoded), ...
- **Callback MAC (KHÔNG sort):** `appId={}&amount={}&description={}&orderId={}&message={}&resultCode={}&transId={}`.
- **Response:** `{returnCode:1}` ok / `2` trùng / khác = fail.

## Fix bảo mật bắt buộc (từ review)
- **C2:** amount lấy từ DB, không tin client → chống sửa giá.
- **C3:** map đơn qua `extradata`, không dùng `orderId` của Zalo.
- **C1:** chỉ confirmed khi `resultCode===1`.
- **H1/RLS:** siết `public_update_orders` → anon KHÔNG được set `confirmed`; chỉ service role (notify) mới xác nhận. (migration 002)
- **H4:** không client-cancel đơn zalopay khi fail.

## Thành phần
- MỚI: `supabase/functions/checkout-create-mac`, `supabase/functions/checkout-notify`.
- MỚI: `mini-app/src/services/payment.service.ts` (thay `zalopay.service.ts`).
- SỬA: `mini-app/src/pages/checkout/index.tsx`.
- MỚI: `supabase/migrations/002_tighten_order_rls.sql`.
- SECRET: `ZALO_CHECKOUT_SECRET_KEY` (+ tuỳ chọn `ZALO_PAYMENT_METHOD`, mặc định `ZALOPAY_SANDBOX`).
- Dọn: secrets `ZALOPAY_*` cũ + functions `zalopay-*` (có thể để lại, vô hại).

## Test
- Local node: round-trip MAC notify (ký bằng key thật) + dataMac create.
- Sandbox device: đặt đơn → Payment.createOrder → trả tiền sandbox → notify → confirmed → bếp.

## Theo dõi sau (follow-up, không làm đợt này)
- Đơn zalopay pending bị bỏ dở: thêm cron/timeout dọn.
- `paid` (tiền mặt, admin set qua anon) hardening khi admin chuyển sang phiên đăng nhập.
