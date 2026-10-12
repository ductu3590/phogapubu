# 01 — Cài đặt máy tính quầy (POS)

Máy POS là máy tính ở quầy thu ngân, **luôn mở trang POS**, có chuông báo đơn, và nối máy in bill.

## Yêu cầu máy

- Windows 10/11, trình duyệt **Chrome** (khuyên dùng) hoặc **Edge**, cập nhật bản mới.
- Màn hình ≥ 1280px chiều ngang (POS có đủ cột "Việc cần xử lý" ở cỡ này; nhỏ hơn vẫn dùng được nhưng mở bằng nút).
- Có loa (chuông báo đơn là âm thanh trên máy). **Nên cắm loa ngoài** nếu quán ồn.
- Mạng ổn định. Nên có **4G dự phòng** (điện thoại phát wifi) — đã thống nhất không làm chế độ offline.
- Máy nên **tự bật lại khi có điện** (BIOS: `Restore on AC Power Loss = Power On`) và **tắt chế độ ngủ**: `Settings → System → Power → Screen and sleep: Never`.

## Bước 1 — Đăng nhập thử bằng tài khoản thu ngân

1. Mở trình duyệt → vào link quản lý của quán (ghi ở `00-README`) → `/login`.
2. Đăng nhập bằng **tài khoản thu ngân** (hoặc chủ quán). Tài khoản thu ngân tự vào thẳng **POS**.
3. Chọn *Ghi nhớ đăng nhập* của trình duyệt nếu máy chỉ có người quán dùng.

> Thu ngân chỉ thấy **POS · Báo cáo · Đặt bàn · Thực đơn (Tạm hết) · Tài khoản**. Không sửa được giá, bàn, nhân viên, cài đặt — đó là thiết kế, chủ quán giữ.

## Bước 2 — Lối tắt mở POS 1 chạm (khuyến nghị)

Chạy file `scripts/cai-pos-bao-luong.bat` **trên máy quầy** (bấm đúp; sửa dòng `POS_URL` ở đầu file thành link thật trước). File sẽ:

- Tạo biểu tượng **"MEVO POS - Bảo Lương"** trên Desktop.
- Mở POS dạng cửa sổ riêng (không thanh địa chỉ, không bấm nhầm tab).
- Bật **in thẳng không hỏi hộp thoại** (`--kiosk-printing`) ra **máy in mặc định của Windows**.
- Tự mở khi bật máy (thư mục Startup).

⚠️ Điều kiện để in thẳng đúng: **đặt máy in bill làm máy in mặc định** (`02`, bước 3).

Nếu không muốn dùng file `.bat`: mở POS trong Chrome như thường, mỗi lần in sẽ hiện hộp thoại in — bấm **In** là được, chỉ chậm hơn.

## Bước 3 — Âm thanh chuông

1. Trên POS, bấm một lần vào trang để trình duyệt cho phép phát tiếng (trình duyệt chặn tự phát tiếng khi chưa có thao tác).
2. Vào `⚙ Cài đặt` (tài khoản chủ quán), mục chuông: chọn **kiểu chuông của quán** (đôi / nhẹ / lặp) — theo quán.
3. Chỉnh **âm lượng** (theo máy này) đến mức đứng ở bếp nghe được.
4. Thử: nhờ nhân viên đặt hộ một món → chuông phải kêu và bàn đó nhấp nháy.

## Bước 4 — Kiểm tra POS trước khi giao

- [ ] Thấy sơ đồ 20 bàn / Timeline, ô trạng thái góc phải là **Trực tuyến**.
- [ ] Đặt hộ 1 món (điện thoại nhân viên) → POS kêu chuông, hiện thẻ **Lượt 1**.
- [ ] Bấm **Duyệt & in bếp** → in ra 2 phiếu (xem `02`).
- [ ] Thu tiền → bàn trở về **Trống**.
- [ ] `Báo cáo` hiện đúng số vừa thu.
- [ ] Tắt wifi vài giây rồi bật lại → POS tự nối lại (chấm trạng thái trở về Trực tuyến).

## Lỗi hay gặp

| Triệu chứng | Cách xử lý |
|---|---|
| Không có tiếng chuông | Bấm vào trang 1 lần; kiểm loa/âm lượng Windows; kiểm âm lượng trong Cài đặt MEVO |
| Hiện "Mất kết nối — đang thử lại" | Chờ vài giây; không hết thì F5. Mất mạng thật: **không thu tiền/đóng bill**, ghi tay, có mạng thì nhập lại |
| Bị đẩy về trang đăng nhập | Phiên hết hạn / sai tài khoản; đăng nhập lại |
| Bấm in mà không ra giấy | Xem `02` (máy in mặc định, giấy, cáp) |

## Ghi chú cho anh Tú

- Link quản lý chính thức: **https://mevo.vn** (đã cấu hình trên Vercel). POS: `https://mevo.vn/admin/pos`.
- Máy quầy dùng **cố định một trình duyệt, một tài khoản**. Đừng cho nhân viên dùng chung tài khoản thu ngân ở máy khác — mỗi người một email để báo cáo ghi đúng người thu / bỏ / tặng món.
