# Plan — Sprint SA-2: Auth và tài khoản staff

> Spec: [2026-07-15-staff-assisted-ordering-design.md](../specs/2026-07-15-staff-assisted-ordering-design.md) §5, §10 (SA-2).
> Ngày: 2026-07-19. Trạng thái: **ĐÃ code + test PASS, chờ anh Tú nghiệm thu theo `TESTING-SA2.md`.**

## Chốt trước khi code

- Role `store_staff` + hai constraint đã cho phép từ 028 (SA-1); RLS ghi do `is_store_owner_or_admin()` gác.
- **"Vô hiệu hoá" = SOFT-DISABLE (bật/tắt), KHÔNG xoá** — theo yêu cầu anh Tú 2026-07-19: nhân viên
  bị tắt phải **bật lại** được để làm việc tiếp, không "biến mất". → cần **migration 029**: cột
  `mevo_operators.is_active` + siết mọi cửa quyền đọc `is_active` (nhân viên tắt mất quyền cả ở tầng DB).

### Migration 029 (đã áp prod)

| Việc | Vì sao |
|---|---|
| `mevo_operators.is_active boolean not null default true` | Cột bật/tắt. Operator cũ = đang bật. |
| `is_store_scoped_operator()` + `is_store_owner_or_admin()` thêm `and is_active` | Nhân viên tắt mất quyền ĐỌC + GHI qua REST ngay. |
| `staff_create_order()` operator lookup thêm `and is_active` (chỉ 1 dòng, giữ nguyên logic khác) | RPC là SECURITY DEFINER tự đọc operator, bỏ qua RLS → phải tự chặn. |

Đã verify tầng DB (rollback test): staff BẬT đọc được đơn + `scoped=true`; TẮT đọc 0 đơn,
`scoped=false`, `staff_create_order` bị từ chối "Không có quyền đặt món hộ".

## Thay đổi (thuần admin-web)

| File | Việc |
|---|---|
| `lib/auth/operator.ts` | `Operator` union + `toOperator()` nhận `store_staff`; thêm `requireStaffAreaOrRedirect()` (cho phép owner+staff, đẩy superadmin về `/mevo`). `requireStoreOwnerStoreId()` giữ nguyên fail-closed → staff không gọi được action admin. |
| `app/(auth)/login/actions.ts` | Cho `store_staff` đăng nhập; điều hướng `store_staff → /staff/order`. |
| `proxy.ts` | Role-aware cho `/staff`: chỉ owner+staff. Staff lỡ vào `/admin`/`/mevo` → đẩy về `/staff/order` (không dead-end `/login`). `/login` khi đã đăng nhập → về đúng khu theo role. |
| `lib/actions/staff.ts` (mới) | `createStoreStaff` (store_id LẤY TỪ guard, role `store_staff`, `is_active:true`, mật khẩu tạm 1 lần, **chặn chiếm quyền** tài khoản operator quán/role khác), `setStaffActive` (bật/tắt, scope `store_id`+`role='store_staff'`), `listStoreStaff` (trả `isActive`). |
| `lib/auth/operator.ts`, `login/actions.ts`, `proxy.ts` | Đọc `is_active`: nhân viên tắt → coi như không có quyền (chặn login + đẩy về /login). |
| `app/admin/staff/{page,staff-client}.tsx` (mới) | Màn chủ quán: thêm nhân viên, badge "Đã tắt", nút **Vô hiệu hoá/Bật lại**. |
| `app/admin/layout.tsx` | Nav link 🧑‍🍳 Nhân viên. |
| `app/staff/{layout,page,order/page,orders/page}.tsx` (mới) | Khung khu nhân viên (auth đúng). UI đặt món thật để **SA-3**. |

## Bảo mật đã kiểm (unit test)

- `createStoreStaff` lấy `store_id` từ `requireStoreOwnerStoreId()`, **không tin client** → chủ quán A
  không tạo được nhân viên cho quán B.
- Chặn `upsert` chiếm một tài khoản đang là operator của quán/role khác.
- `removeStoreStaff` xoá có scope `store_id` + `role='store_staff'` → không xoá nhầm chủ quán/operator quán khác.
- `signIn` điều hướng đúng theo role; role lạ/thiếu `store_id` bị từ chối + signOut.

## Verify đã chạy

- `npx vitest run` → 38/38 PASS (gồm `staff.test.ts`, `login/actions.test.ts`).
- `npx tsc --noEmit` → 0 lỗi. `eslint` → 0. `next build` → 24 route + Middleware biên dịch sạch.

## Còn lại

1. Anh Tú nghiệm thu `TESTING-SA2.md`.
2. **Redeploy Vercel** (push `main`) — SA-2 là code admin-web.
3. PASS → SA-3 (UI mobile-first đặt hộ).
