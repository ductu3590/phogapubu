# Yên Garden — Vai Quản lý (`store_manager`)

Quản lý làm được mọi việc của thu ngân (POS, thu tiền, đặt bàn, báo cáo, bật/tắt Tạm hết, gọi món hộ ở `/staff`)
nhưng **không** đụng cấu hình quán. Kho, Thu chi, Công nợ, Báo cáo tài chính là module sau — checklist này chưa test.

Spec: `docs/superpowers/specs/2026-11-09-yg-vai-quan-ly-design.md` · Plan: `docs/superpowers/plans/2026-11-09-yg-vai-quan-ly.md` · Migration: `116_store_manager_role.sql`

## Trước khi test

- Chỉ test **sau khi** Controller đã áp mig 116 lên prod **và** deploy Vercel (code mới chạy trước migration thì "Thêm Quản lý" báo lỗi CHECK).
- Test trên **Bia lẩu Bảo Lương**. Cần ba tài khoản: chủ quán, thu ngân, và một email riêng để tạo Quản lý thử.
- Tài khoản Quản lý thử: xong bài 10 thì **Vô hiệu hoá** (không có xoá vĩnh viễn — cố ý).
- Mở hai trình duyệt (hoặc một cửa sổ ẩn danh) để chủ quán và Quản lý đăng nhập cùng lúc — cookie dùng chung theo trang.

## Bài 1. Chủ quán tạo Quản lý

1. Chủ quán mở ⚙ Cài đặt → **Nhân viên**.
2. Ô lọc vai trò có lựa chọn **Quản lý**.
3. Bấm Thêm nhân viên: ô Vai trò có **Quản lý**; chữ gợi ý dưới ô có câu "Quản lý: việc của thu ngân, cộng kho, thu chi, công nợ, báo cáo tài chính."
4. Tạo một Quản lý bằng email riêng → hiện **mật khẩu tạm** một lần. Ghi lại.
5. Dòng mới trong bảng có huy hiệu **Quản lý** màu cam đặc (khác huy hiệu Thu ngân nền cam nhạt).

## Bài 2. Quản lý đăng nhập

1. Đăng nhập bằng tài khoản Quản lý → vào thẳng **POS** (`/admin/pos`).
2. Thanh trái ghi **MEVO · Quản lý** dưới tên quán.
3. Rail: **POS · (Đặt bàn nếu quán bật) · Món · Báo cáo**. Không có Bếp, không có Bàn QR.
4. Thanh trên POS ghi nhãn vai **Quản lý** (không phải "Thu ngân").
5. Bấm ⚙ Cài đặt: hộp thoại chỉ có **Bảo mật**, không có hàng tab Cài đặt chung / Nhân viên / Ưu đãi & Vòng quay.
6. POS **không** có nút Sắp xếp bàn.

## Bài 3. POS — mọi việc của thu ngân

Làm trên một bàn có khách (quét QR gọi món bằng Mini App, hoặc dùng bài 8 để tạo đơn).

1. Duyệt một lượt gọi đang chờ → in phiếu bếp + phiếu bàn.
2. Bỏ một món có lý do; tặng một món có lý do.
3. Giảm giá bill.
4. Chuyển bàn.
5. Thu tiền, đóng bàn.
6. Không bước nào báo lỗi quyền ("Không có quyền…", "Chỉ chủ quán…").

## Bài 4. Đặt bàn

1. Tạo một đặt bàn mới từ POS (hoặc trang Đặt bàn).
2. Xếp bàn cho lượt đó.
3. Huỷ một lượt.
4. Nhật ký lượt đặt bàn ghi đúng người thao tác là tài khoản Quản lý.

## Bài 5. Thực đơn — chỉ bật/tắt Tạm hết

1. Mở **Món**: tiêu đề "Thực đơn — bật/tắt Tạm hết", **không** có nút thêm/sửa món, không sửa được giá.
2. Tắt một món → Mini App và màn nhân viên `/staff/order` thấy món đó "Tạm hết".
3. Bật lại món đó.

## Bài 6. Báo cáo A04

1. Mở **Báo cáo** (`/admin/bills`): xem được ngày hôm nay, dòng "Đang xem: … · Quản lý".
2. Mở ngăn kéo một bill: **không** thấy nút Hoàn tất / Huỷ đơn / Đổi thưởng (các nút này vẫn chỉ của chủ quán).

## Bài 7. Gõ tay trang cấu hình → về POS

Trong tài khoản Quản lý, gõ từng địa chỉ vào thanh địa chỉ. Mỗi trang phải **quay về POS**:

- `/admin/settings`
- `/admin/staff`
- `/admin/tables`
- `/admin/vouchers`
- `/admin/kitchen`
- `/print/table-qr`

## Bài 8. Gọi món hộ ở `/staff`

1. Quản lý mở `/staff/order`, chọn một bàn, gọi một món.
2. Đơn hiện ở POS như đơn nhân viên gọi hộ (chờ thu ngân/Quản lý xác nhận).

## Bài 9. Thu ngân không đổi

1. Đăng nhập Thu ngân: rail vẫn **POS · Món · Báo cáo**, nhãn "MEVO · Thu ngân", POS ghi "Thu ngân".
2. Gõ tay `/admin/staff` → về POS (trang Nhân viên vẫn không mở được).

## Bài 10. Đổi vai và vô hiệu hoá

1. Chủ quán sửa tài khoản Quản lý, đổi vai sang **Thu ngân**: cảnh báo có thêm câu "Người này sẽ không còn vào được Kho, Thu chi, Công nợ và báo cáo tài chính." Bấm **Huỷ** (không lưu).
2. Đổi vai sang **Phục vụ**, Lưu. Bên tài khoản đó tải lại trang → về `/staff/order`.
3. Đổi lại **Quản lý**, Lưu. Tải lại → về POS.
4. **Vô hiệu hoá** tài khoản đó. Bên tài khoản đó tải lại trang → về trang đăng nhập.

## Kết quả

| Bài | PASS / FAIL | Ghi chú |
|---|---|---|
| 1 | | |
| 2 | | |
| 3 | | |
| 4 | | |
| 5 | | |
| 6 | | |
| 7 | | |
| 8 | | |
| 9 | | |
| 10 | | |
