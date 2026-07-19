# Plan — Sprint SA-3: UI mobile-first đặt hộ

> Spec: [2026-07-15-staff-assisted-ordering-design.md](../specs/2026-07-15-staff-assisted-ordering-design.md) §7, §10 (SA-3).
> Ngày: 2026-07-19. Trạng thái: **ĐÃ code + test PASS, chờ anh Tú nghiệm thu theo `TESTING-SA3.md`.**

## Chốt trước khi code

- **KHÔNG migration mới.** Dùng RPC `staff_create_order` (SA-1, đã test §11) + policy SELECT
  `authenticated = is_store_scoped_operator(store_id)` sẵn có trên menu/bàn/topping → nhân viên đọc
  được menu quán mình; nhân viên tắt (mig 029) đọc rỗng.
- **Gọi RPC bằng phiên nhân viên** qua Server Action + `createClient` (cookie → JWT → auth.uid()),
  KHÔNG dùng service role. RPC tự suy store_id, tính giá từ DB, idempotent theo `client_request_id`.

## Thay đổi (thuần admin-web)

| File | Việc |
|---|---|
| `lib/actions/staff-order.ts` (mới) | `createStaffOrder(input)`: guard staff/owner → gọi `staff_create_order`. Trả `{ok}` thay vì throw. Không gửi store/giá từ client. |
| `app/staff/order/page.tsx` | Loader: tables (active), categories→items (available) + topping khả dụng mỗi món, qua `createClient` (RLS khoá theo quán). |
| `app/staff/order/staff-order-client.tsx` (mới) | Máy trạng thái: chọn bàn → menu (tabs + tìm món) → tap thêm (bottom sheet topping/ghi chú cho món có topping) → sticky cart → checkout 2 nút CASH/bank_transfer → màn thành công. |

## Điểm cẩn thận đã xử lý (§7)

- **Chống double-submit**: nút khoá khi `submitting`; `client_request_id` sinh 1 lần/lần đặt, **giữ
  nguyên khi retry** (lỗi mạng bấm lại không tạo trùng — RPC idempotent), **reset khi giỏ đổi** để
  giỏ mới không "dính" đơn cũ.
- **Lỗi mạng giữ nguyên giỏ + bàn**; chỉ reset giỏ **sau khi** server xác nhận thành công.
- **Màn thành công dùng response RPC** (order_id/total), không query lại.
- Giá/tên/topping **tính & snapshot ở RPC** — client chỉ gửi id + số lượng + topping_ids + note.
- Target chạm lớn (nút +, bàn, thanh toán ≥ 44px), thao tác một tay.

## Ngoài phạm vi (đúng spec)

- Realtime theo dõi đơn `/staff/orders` → SA-4.
- Màn xác nhận đã thu tiền + doanh thu thực nhận → SA-5.

## Verify đã chạy

- `vitest` 64/64 PASS (thêm `staff-order.test.ts`: guard role, truyền đúng tham số RPC, map lỗi, giỏ rỗng).
- `tsc --noEmit` 0 · `eslint` (file SA-3) 0 · `next build` sạch.
- RPC `staff_create_order` đã được SA-1 verify (giá từ DB, idempotent, cross-store, cross-role).

## Còn lại

1. Anh Tú nghiệm thu `TESTING-SA3.md` **trên điện thoại thật**.
2. Redeploy Vercel.
3. PASS → SA-4 (realtime ba màn hình).
