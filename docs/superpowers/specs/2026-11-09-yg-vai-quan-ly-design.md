# Vai Quản lý (`store_manager`)

> Ngày: 2026-11-09 · Thuộc: [spec tổng Yên Garden](2026-11-09-yen-garden-trien-khai-design.md) · Migration: **116** · Làm theo đúng khuôn của vai Thu ngân (mig 093, PA-2)

Ký hiệu: **[anh Tú]** = anh Tú đã chốt · **[em]** = em tự quyết.

## 1. Mục tiêu

Yên Garden có quản lý vận hành thay chủ (chủ ít có mặt **[anh Tú]**). Quản lý làm kho, thu chi, xem báo cáo **[anh Tú]**, và làm được mọi việc của thu ngân, nhưng **không** đụng cấu hình quán.

## 2. Bảng quyền

| Việc | Chủ quán | Quản lý | Thu ngân | Phục vụ |
|---|---|---|---|---|
| POS: duyệt đơn, in, thu tiền, mâm, bỏ/tặng/sửa SL món, giảm giá bill, chuyển bàn | ✓ | ✓ | ✓ | — |
| Ghi nợ lúc thu, nhận trả nợ | ✓ | ✓ | ✓ | — |
| Huỷ lần trả nợ, sửa/ngừng khách nợ | ✓ | ✓ | — | — |
| Mở / kết ca, Thu/Chi két trên POS | ✓ | ✓ | ✓ | — |
| Sổ thu chi: ghi TM + CK, huỷ, danh mục | ✓ | ✓ | xem phiếu của mình | — |
| Kho: hàng hoá, nhập, kiểm, xuất huỷ, gắn món với hàng | ✓ | ✓ | xem tồn | — |
| Đặt bàn | ✓ | ✓ | ✓ | (như hiện tại) |
| Hoá đơn & Báo cáo ngày (A04), tab Ca | ✓ | ✓ mọi ca | ✓ ca của mình | — |
| Báo cáo bán hàng (món, giờ, danh mục, huỷ) | ✓ | ✓ | ✓ | — |
| Báo cáo tài chính (doanh thu tháng, thu chi, lãi lỗ, công nợ) | ✓ | ✓ | — | — |
| Bật/tắt Tạm hết món | ✓ | ✓ | ✓ | — |
| Sửa món, giá, danh mục, trạm in | ✓ | — | — | — |
| Bàn & QR, sơ đồ, khu | ✓ | — | — | — |
| Cài đặt quán, In ấn, Tài khoản nhận tiền | ✓ | — | — | — |
| Nhân viên (tạo, khoá, đặt lại mật khẩu) | ✓ | — | — | — |
| Ưu đãi & Vòng quay | ✓ | — | — | — |
| Gọi món hộ ở `/staff` | ✓ | ✓ **[em]** | (như hiện tại) | ✓ |

Gắn món với hàng hoá kho nằm ở trang Món nhưng là quyền **kho**: Quản lý mở trang Món chỉ thấy bật/tắt Tạm hết + ô "Trừ kho" **[em]**.

## 3. Thay đổi

**DB (mig 116):**
- Mở rộng hai CHECK của `mevo_operators` thêm `store_manager` (và ràng buộc phải có `store_id`).
- **Vá tại chỗ** `is_store_pos_operator(p_store_id)` để nhận `store_manager` — mọi RPC POS / đặt bàn / báo cáo đang dùng hàm này tự có quyền, không phải sửa từng RPC **[em]**.
- Helper mới `is_store_back_office(p_store_id)` = Chủ quán hoặc Quản lý của quán (có `is_active`). Kho, sổ thu chi (ghi CK, huỷ, danh mục), huỷ trả nợ, báo cáo tài chính dùng helper này.
- Rà các chỗ so chuỗi vai trực tiếp (`role in ('store_owner','store_cashier')`, `reservation_operator_actor_kind`, `pos_get_floor_layout`, `staff_create_order`, RLS `table_areas`…) — bản liệt kê ở mig 093 — và thêm `store_manager` đúng chỗ.
- `is_store_owner_of` và `is_store_owner_or_admin` **giữ nguyên nghĩa** (chỉ chủ quán).

**Web:**
- `lib/auth/roles.ts`: thêm `store_manager` vào `OperatorRole`, `ROLE_LABEL` ("Quản lý"), `homeForRole` → `/admin/pos`, `canEnterAdmin`, `canEnterStaffArea`, `isPosRole`; danh sách đường dẫn riêng `MANAGER_ADMIN_PATHS` = của thu ngân + `/admin/inventory`, `/admin/cashbook`, `/admin/debts`, `/admin/reports`.
- `proxy.ts`, `lib/auth/operator.ts`, rail (`admin-nav.tsx`), tab cấu hình (`config-dialog.tsx`): Quản lý thấy POS · Món (Tạm hết) · Đặt bàn · Báo cáo · Kho · Thu chi · Công nợ; ⚙ chỉ có Bảo mật.
- Trang Nhân viên: chọn vai thêm "Quản lý"; `TEAM_ROLES` thêm `store_manager`. Chỉ chủ quán tạo được Quản lý.
- Các server action đang kiểm vai bằng chuỗi (`staff-order.ts`, `service-requests.ts`, `table-session.ts`, `staff-reservations.ts`…) thêm `store_manager`.

## 4. Kiểm thử bắt buộc

- Test SQL: Quản lý gọi được các RPC POS (thu tiền, duyệt đơn) qua `is_store_pos_operator`; không gọi được RPC cấu hình (`is_store_owner_or_admin`); Quản lý quán A không gọi được RPC quán B.
- Test `roles.ts`: bảng đường dẫn cho cả 4 vai.
- Test trang Nhân viên tạo Quản lý; Thu ngân không tạo được.

Checklist tay: `docs/testing/yen-garden/QUAN-LY.md`.
