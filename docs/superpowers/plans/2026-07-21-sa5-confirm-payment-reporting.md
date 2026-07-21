# Plan — Sprint SA-5: Thu tiền và báo cáo

> Spec: [2026-07-15-staff-assisted-ordering-design.md](../specs/2026-07-15-staff-assisted-ordering-design.md) §6.2, §9, §4.4, §10 (SA-5).
> Ngày: 2026-07-21. Trạng thái: **ĐÃ code + verify, chờ anh Tú nghiệm thu `TESTING-SA5.md`.**

## Chốt trước khi code

- **KHÔNG migration mới.** RPC `confirm_manual_payment` (owner-only, ghi `payment_received_at` +
  `payment_received_by`, không đổi status, idempotent) đã có + đã test ở SA-1 (Test 4/5/10).
  Doanh thu `get_daily_revenue` đã đếm `payment_received_at` từ SA-1.

## Thay đổi (thuần admin-web)

| File | Việc |
|---|---|
| `lib/actions/orders.ts` | **Thay `markOrderPaid`** (set `status='paid'` bằng service role, KHÔNG kiểm quyền) **bằng `confirmManualPayment`**: `requireStoreOwnerStoreId()` + client authenticated gọi RPC `confirm_manual_payment` → owner-only, audit, không đổi status (§4.3/§4.4). |
| `lib/order-payment-badge.ts` | Đổi chữ ký `paymentBadge(paymentMethod, received)` — `received` do caller tính (staff: `payment_received_at`\|`trans_id`; admin: `hasRealMoney` để đúng cả đơn legacy `cash+paid`). |
| `app/admin/orders/page.tsx` | Badge thanh toán đầy đủ (mọi phương thức, legacy-aware); nút **"✓ Đã nhận tiền"** → `confirmManualPayment`; **filter "Chưa thu"** (`?unpaid=1`, lọc `isAwaitingPayment`); header thêm số "Chưa thu"; doanh thu tính trên TOÀN BỘ đơn (không theo filter). |
| `app/staff/orders/staff-orders-client.tsx` | Cập nhật caller `paymentBadge` theo chữ ký mới (badge "✓ Đã nhận tiền" lên live qua UPDATE realtime SA-4). |

## Quyết định

- **confirm KHÔNG đổi status** (khác `markOrderPaid` cũ): tiến độ bếp tách khỏi thanh toán (§4.3).
  Đơn có thể `ready` mà chưa thu, hoặc `cooking` mà đã thu. Doanh thu theo `payment_received_at`.
- **Chỉ chủ quán xác nhận tiền** (RPC `is_store_owner_or_admin`): nhân viên chỉ THẤY badge trên
  `/staff/orders`, không có nút xác nhận (chống nhân viên tự đánh dấu đã thu — §5.1).
- **Bảo mật tăng**: `markOrderPaid` cũ dùng service role không kiểm quyền → mọi session craft request
  đều set paid được. Luồng mới qua RPC authenticated đóng lỗ này.
- `cancelOrder` vẫn giữ nguyên (ngoài phạm vi SA-5; vẫn là gap service-role — ghi chú cho sau).

## Verify đã chạy

- `vitest` (order-payment-badge + orders) 7/7 · `tsc` 0 · `eslint` 0 · `next build` sạch.
- RPC `confirm_manual_payment` đã verify ở SA-1 (staff bị từ chối, owner xác nhận + idempotent, vào doanh thu).

## Còn lại

1. Anh Tú nghiệm thu `TESTING-SA5.md`.
2. Redeploy Vercel.
3. PASS → **hoàn tất SA-1…SA-5**. Bước sau: loạt PM (multi-method payment).
