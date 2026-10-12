# ACC-2 — Form Đặt bàn tự điền Tên + SĐT từ Zalo (test trên Bảo Lương, Zalo thật)

Lối vào thường (KHÔNG quét QR bàn). Lần đầu mở form Đặt bàn mới mà Tên/SĐT còn trống → bật hộp xin
quyền của Zalo (tên + SĐT) → đồng ý thì tự điền, từ chối thì nhập tay. Hỏi MỘT lần mỗi máy, mỗi quán.
Trang Tài khoản giữ nguyên (vẫn có nút "Nhập tay" để khách dùng SĐT khác).

Code: `mini-app/src/services/zalo-contact.ts`, `components/reservations/reservation-form.tsx`.
Tự động (đã chạy): `zalo-contact.test.ts` (9 bài), `account-storage.test.ts` — mini-app vitest.

**Đưa máy về trạng thái "lần đầu"** (làm trước bài 1, 2, 3):
1. Zalo → Cá nhân → Cài đặt → Quyền riêng tư → Ứng dụng đã cấp quyền → app Bảo Lương → thu hồi.
2. Mở app → Tài khoản → **Xoá thông tin cá nhân** → Xoá (xoá hồ sơ + cờ "đã hỏi").
3. Thoát hẳn app rồi mở lại (trang Tài khoản cũng tự xin quyền 1 lần/phiên — đừng mở trang đó trước bài test).

| # | Thao tác | Kỳ vọng |
|---|---|---|
| 1 | Máy "lần đầu" → tab **Đặt bàn** (hoặc nút "Đặt bàn trước" ở Trang chủ) | Hộp xin quyền của Zalo hiện ngay (tên + SĐT) |
| 2 | Ở bài 1 bấm **Cho phép** | Ô Họ và tên = tên Zalo, ô SĐT = số thật (`09…`), dưới hai ô có dòng xanh "Đã điền từ Zalo · bạn có thể sửa". Sửa được cả hai ô |
| 3 | Đưa máy về "lần đầu" → tab Đặt bàn → **Từ chối** | Không báo lỗi; hai ô trống, gõ tay bình thường, đặt bàn được |
| 4 | Sau bài 3, thoát app → mở lại → tab Đặt bàn | KHÔNG hỏi lại; hai ô trống (hoặc chữ đã gõ ở nháp) |
| 5 | Sau bài 2, gửi đặt bàn xong → "Đặt thêm bàn khác" | Tên + SĐT điền sẵn, không hiện hộp xin quyền |
| 6 | Sau bài 2 → Tài khoản → "Nhập tay" → nhập một số KHÁC → Lưu → quay lại tab Đặt bàn, form mới | Form điền **số vừa nhập tay**, KHÔNG bị số Zalo đè; Tài khoản vẫn hiện số nhập tay |
| 7 | Đã cấp quyền Zalo (vd sau bài 2) → Tài khoản → Xoá thông tin cá nhân (KHÔNG thu hồi quyền trong Zalo) → thoát, mở lại → tab Đặt bàn | Không hiện hộp xin quyền, vẫn tự điền Tên + SĐT |
| 8 | Lịch hẹn → Đổi lịch | Không hiện hộp xin quyền |
| 9 | Đang gõ tên trong lúc hộp Zalo còn mở / đang lấy số | Chữ khách đã gõ được giữ, chỉ ô còn trống mới được điền |

## Gọi điện cho quán từ Trang chủ

Trong Zalo link `tel:` không gọi được → mọi chỗ gọi quán dùng `openPhone` (zmp-sdk): Trang chủ + Thông tin quán
bấm ra hộp "Gọi cho quán"; Chi tiết lịch hẹn vốn có nút "Gọi ngay" nên bấm là gọi luôn. Code: `mini-app/src/utils/call-phone.ts` (5 test), `components/ui/call-phone-button.tsx`.

| # | Thao tác | Kỳ vọng |
|---|---|---|
| 10 | Trang chủ → bấm số điện thoại quán (dòng có icon điện thoại, chữ gạch chân) | Hộp đáy "Gọi cho quán" hiện số dạng `09xx xxx xxx`, hai nút Đóng / Gọi ngay |
| 11 | Bấm **Gọi ngay** | Mở màn gọi điện của máy với đúng số quán (iPhone có thể hỏi xác nhận thêm 1 lần — bình thường) |
| 12 | Bấm **Đóng** / chạm vùng tối | Hộp đóng, không gọi |
| 13 | Tab Thông tin quán → dòng **Điện thoại** | Hộp "Gọi cho quán" như bài 10 → Gọi ngay mở màn gọi điện |
| 14 | Lịch hẹn → mở một lịch hẹn → khối thông tin quán → nút **Gọi ngay** | Mở thẳng màn gọi điện với số quán (không qua hộp) |
