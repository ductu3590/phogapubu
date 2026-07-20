# Plan — Sprint SA-4: Realtime ba màn hình

> Spec: [2026-07-15-staff-assisted-ordering-design.md](../specs/2026-07-15-staff-assisted-ordering-design.md) §8, §10 (SA-4).
> Ngày: 2026-07-20. Trạng thái: **ĐÃ code + verify, chờ anh Tú nghiệm thu `TESTING-SA4.md`.**

## Chốt trước khi code

- **KHÔNG migration mới.** `orders` đã ở publication `supabase_realtime`; RLS SELECT `authenticated`
  = `is_store_scoped_operator(store_id)` (nhân viên tắt = không đọc). Đã xác minh bằng `pg_policies`.
- **Bếp đã realtime** (channel `kitchen-<store>`, dedupe bằng ref) và đã live cho đơn staff sau fix
  `orderInKitchen` (bank_transfer). **Không đụng kitchen** để tránh regression bản đang chạy prod.

## Thay đổi (thuần admin-web)

| File | Việc |
|---|---|
| `lib/order-payment-badge.ts` (mới) | Hàm thuần `paymentBadge()`: chưa thu / chưa nhận / đã nhận. Có test. |
| `app/staff/orders/types.ts` (mới) | `StaffOrder` + `mapStaffOrderRow` + `STAFF_ORDER_SELECT` dùng chung loader/client. |
| `app/staff/orders/page.tsx` | Loader: đơn active hôm nay (createClient authenticated → RLS khoá quán). |
| `app/staff/orders/staff-orders-client.tsx` (mới) | Realtime list: subscribe INSERT/UPDATE (filter store), merge; INSERT fetch items; UPDATE merge status/payment; **reconnect → refetch 1 lần**; chấm xanh/xám báo kết nối; badge thanh toán. |
| `app/admin/orders/orders-realtime.tsx` (mới) + `page.tsx` | Client nhỏ nghe `orders` đổi → `router.refresh()` (debounce 500ms). **Giữ nguyên** toàn bộ logic doanh thu/hành động của Server Component (ít rủi ro nhất). |

## Quyết định thiết kế

- **Admin dùng `router.refresh()`** thay vì rewrite sang client: page đơn hàng có nhiều logic
  (doanh thu gộp `lib/revenue`, spin redeem, markOrderPaid, huỷ, voucher, lọc ngày). Rewrite =
  rủi ro cao. Cò realtime + refresh giữ 1 nguồn logic, vẫn "không bắt F5".
- **Degrade an toàn**: nếu realtime không giao (rủi ro của authenticated realtime), cả hai màn vẫn
  hiện đúng dữ liệu lúc mở trang — chỉ mất tính "tự cập nhật", không vỡ.

## Rủi ro #1 (ghi ở TESTING-SA4)

Đây là chỗ đầu tiên trong app dùng realtime cho client **`authenticated`** (bếp dùng token role
`kitchen` riêng; mini-app khách dùng `anon`). Cần test thật rằng postgres_changes có giao theo RLS
cho JWT nhân viên. Nếu không giao → chỉnh nạp token realtime (`setAuth`) hoặc đổi cách.

## Verify đã chạy

- `vitest` (order-payment-badge) 5/5 · `tsc` 0 · `eslint` (file SA-4) 0 · `next build` sạch.

## Còn lại

1. Anh Tú nghiệm thu `TESTING-SA4.md` (cần ≥2 màn hình).
2. Redeploy Vercel.
3. PASS → SA-5 (xác nhận thu tiền + doanh thu thực nhận + badge "Đã nhận tiền" live).
