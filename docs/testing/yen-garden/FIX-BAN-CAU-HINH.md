# FIX-BAN-CAU-HINH — Đóng / mở lại bàn + khoá cấu hình quy trình cho chủ quán

Nhánh `claude/fix-dong-ban-khoa-cau-hinh-4f56c7` (2026-11-13). Hai lỗi anh Tú báo khi dọn dữ liệu mẫu Yên Garden:

1. Xoá bàn đã có đơn → báo *Bấm "Đóng"* nhưng không thấy nút. Nút thật ra vẫn có — là cái nhãn nhỏ "Mở"/"Đóng" ở góc
   thẻ bàn, trông như nhãn trạng thái. Nay góc thẻ chỉ là **nhãn** "Đang dùng" / "Đã đóng"; nút thật là **"Đóng bàn"** /
   **"Mở lại bàn"** nằm trên nút Xoá, câu báo lỗi xoá bàn nhắc đúng chữ *"Đóng bàn"*. Bàn đang có khách (phiên chưa
   đóng, kể cả bàn trong mâm ghép) hoặc đang giữ cho một lượt đặt bàn sắp tới thì **DB từ chối đóng** (mig 138).
2. Cấu hình quy trình vận hành: bỏ mọi chữ "như Pubu" / "như Bảo Lương". Mẫu điền nhanh đổi tên theo mô hình
   (**Trả trước** / **Trả sau, POS duyệt** / Tùy chỉnh) và **chỉ hiện ở `/mevo`**. Chủ quán (`/admin`) **chỉ xem** phần
   quy trình, trừ hai mục anh chọn chừa lại: **Đang nhận đơn** và **Giờ phục vụ**. Chặn ở cả server action lẫn RPC
   `update_store_workflow_settings` (mig 139). Các cài đặt khác (In ấn, Ngày kinh doanh, Bắt buộc mở ca, Tài khoản nhận
   tiền, Thông tin quán, Âm thanh) **không đổi** — chủ quán vẫn tự chỉnh (anh chọn "Không khoá thêm").

> ✅ **Mig 138 + 139 ĐÃ áp prod 2026-11-13**, nguyên văn file. Đã thử trên prod bằng phiên của chủ quán Yên Garden
> trong một khối tự huỷ (không để lại gì): đổi chính sách bếp → bị từ chối; đổi phương thức thanh toán → bị từ chối;
> đổi giờ phục vụ + tắt nhận đơn → lưu được; đóng bàn **A1** (đang có phiên mở) → bị từ chối; đóng **B40** (trống) → được.
>
> **Thứ tự áp so với deploy: không có rủi ro.** Trang `/admin` cũ (Vercel hiện tại) gửi đủ cấu hình lấy từ giá trị đang
> lưu, nên chủ quán chỉ đổi Đang nhận đơn / Giờ phục vụ vẫn lưu được; đổi mục khác thì bị từ chối nhưng trang cũ chỉ
> hiện câu lỗi chung của Next (trang cũ ném lỗi). Nút "Mở/Đóng" kiểu cũ trên Vercel vẫn chạy; đóng bàn đang có khách bị
> DB từ chối, nhưng trang cũ không báo gì (nhãn đổi rồi tải lại thấy về như cũ).

Đã tự kiểm bằng máy: admin-web `tsc` sạch, vitest **176 file / 1598 test xanh**; test SQL
`supabase/tests/138_139_dong_ban_khoa_cau_hinh.test.mjs` **15/15 xanh** (PGlite, vá đúng bản chụp prod — md5 khớp). Đã
mở trang thật ở máy local: thẻ bàn có nhãn "Đang dùng" + nút "Đóng bàn"; Cài đặt của chủ quán có khối "Nhận đơn và giờ
phục vụ" mở, phần dưới có dòng khoá và mọi ô bị vô hiệu, không có mẫu điền nhanh; `/mevo` có 3 mẫu tên mới, sửa được hết.

## Chuẩn bị

- Code CHƯA lên Vercel → chạy local ở worktree này: `cd admin-web && npm run dev` rồi mở `http://localhost:3000`
  (đã có sẵn `.env.local`).
- ⚠️ Tài khoản **`yg-admin@mevo.vn` đang bật cờ bắt đổi mật khẩu**, mà mig 137 trên prod chặn mọi thao tác DB của tài
  khoản chưa đổi mật khẩu. Nhánh có màn đổi mật khẩu (`claude/yg-accounts-force-password-8d711a`) chưa gộp vào nhánh
  này. Anh chọn một trong hai:
  - đổi mật khẩu `yg-admin` trước (chạy nhánh kia, hoặc nhờ em gỡ cờ), rồi test bằng `yg-admin` như dưới; **hoặc**
  - test phần **B** (quyền chủ quán) bằng `baoluong@mevo.vn` — cùng vai chủ quán, kết quả như nhau. Phần **A** (bàn mẫu
    Yên Garden) thì cần `yg-admin`.
- Hiện trạng Yên Garden (2026-11-13): còn **Bàn mẫu 1** (có đơn cũ, phiên đã đóng); bàn **A1** đang có một phiên mở.

## A. Đóng / mở lại bàn (đăng nhập `yg-admin@mevo.vn`, trang **Bàn QR**)

| # | Việc | Kỳ vọng | Kết quả |
|---|---|---|---|
| A1 | Nhìn thẻ **Bàn mẫu 1** | Góc thẻ là nhãn **"Đang dùng"** (không bấm được); dưới ảnh QR có các nút **Tải QR PNG**, **In QR**, **Đóng bàn**, **Xoá** | |
| A2 | Bấm **Xoá** ở Bàn mẫu 1 → OK | Báo: *Bàn này đã có đơn hàng nên không thể xoá. Bấm "Đóng bàn" để ẩn bàn thay vì xoá.* — bàn vẫn còn | |
| A3 | Bấm **Đóng bàn** ở Bàn mẫu 1 | Hộp xác nhận nói rõ bàn sẽ ẩn khỏi POS / màn nhân viên / bản in QR, khách quét QR không gọi được, hoá đơn cũ giữ tên bàn | |
| A4 | Bấm OK | Thẻ chuyển nhãn **"Đã đóng"**, nền mờ, nút **In QR** biến mất, nút đổi thành **"Mở lại bàn"**; dòng đếm trên cùng có "· 1 bàn đã đóng". Tải lại trang (F5) vẫn thế | |
| A5 | Mở **POS** (sơ đồ bàn) | Không còn ô **Bàn mẫu 1** | |
| A6 | Mở **In QR cả quán** | Không có tờ QR của Bàn mẫu 1 | |
| A7 | Điện thoại nhân viên Yên Garden (`/staff`) — danh sách bàn, màn gọi món, Ghép bàn | Không thấy Bàn mẫu 1 | |
| A8 | **Hoá đơn** (A04) — tìm bill cũ của Bàn mẫu 1 | Bill vẫn hiện tên **Bàn mẫu 1** | |
| A9 | Bấm **Đóng bàn** ở bàn **A1** (đang có khách) → OK | Báo: *Bàn "A1" đang có khách (phiên chưa đóng). Thu tiền hoặc đóng phiên ở POS rồi mới đóng bàn.* — thẻ trở lại "Đang dùng" | |
| A10 | Bấm **Mở lại bàn** ở Bàn mẫu 1 | Nhãn về "Đang dùng", ô bàn hiện lại trên POS, có lại nút In QR | |
| A11 | Đóng lại Bàn mẫu 1 lần nữa (để dọn) | Như A4 | |
| A12 | (Quan sát, không bắt buộc) Quét QR của Bàn mẫu 1 khi đã đóng bằng Mini App Yên Garden | Không gọi món được. Hiện tại thanh gọi món **quay mãi**, chưa có câu "Bàn đang tạm đóng" — ghi lại em làm ở việc sau | |

## B. Chủ quán chỉ xem quy trình, trừ Đang nhận đơn + Giờ phục vụ (đăng nhập chủ quán, **Cài đặt**)

| # | Việc | Kỳ vọng | Kết quả |
|---|---|---|---|
| B1 | Cuộn tới **Quy trình vận hành** | Không có ô mẫu điền nhanh nào; không có chữ "Pubu" hay "Bảo Lương" ở đâu. Câu đầu: *Bạn tự đổi được Đang nhận đơn và Giờ phục vụ…* | |
| B2 | Khối **Nhận đơn và giờ phục vụ** | Công tắc **Đang nhận đơn** và các ô **Giờ phục vụ** bấm / sửa được | |
| B3 | Các khối dưới (Kênh nhận đơn, Duyệt đơn và bếp, Đặt bàn, Phiên bàn/mâm, Món đặt trước) | Có dòng 🔒 *Các mục dưới đây chỉ MEVO sửa được…*; mọi công tắc, ô số, ô chọn **bấm không đổi được** nhưng vẫn hiện đúng giá trị đang dùng | |
| B4 | Thêm một ca phục vụ **16:00 – 23:30** → **Lưu** | Báo ✓ Đã lưu; tải lại trang vẫn còn ca đó | |
| B5 | Xoá ca vừa thêm → **Lưu** | Về như cũ (mở cả ngày nếu trước đó không có ca) | |
| B6 | Ô thông tin quán (Tên quán, wifi, lời nhắn) | Gợi ý trong ô trống không còn chữ "Phở Gà Pubu" | |
| B7 | Các khối **In ấn**, **Ngày kinh doanh**, **Bắt buộc mở ca**, **Tài khoản nhận tiền** | Vẫn sửa được như trước (không khoá) | |

Lớp chặn ở DB (chủ quán gọi thẳng RPC bằng phiên của mình) em đã thử trên prod như ghi ở đầu file và có test máy; anh không
cần tự thử.

## C. Superadmin sửa được ở `/mevo` (đăng nhập `admin@mevo.vn`)

| # | Việc | Kỳ vọng | Kết quả |
|---|---|---|---|
| C1 | `/mevo` → quán **Yên Garden** → khối quy trình | Có 3 ô mẫu: **Trả trước**, **Trả sau, POS duyệt**, **Tùy chỉnh**; không có chữ "Pubu"/"Bảo Lương"; mọi ô sửa được | |
| C2 | Đổi **Bước chọn giờ** (Đặt bàn) sang **15 phút** → **Lưu quy trình** | Báo ✓ Đã lưu | |
| C3 | Đăng nhập lại chủ quán Yên Garden → Cài đặt | Bước chọn giờ hiện **15 phút** (chỉ xem) | |
| C4 | Về `/mevo`, trả **Bước chọn giờ** về **30 phút** → Lưu | Đã lưu (giá trị gốc của quán là 30) | |
| C5 | Ở `/mevo`, đổi **Đơn khách xuống bếp** → Lưu (trong lúc A1 còn phiên mở) | Báo *Còn phiên đang hoạt động…* — luật cũ, không đổi. Không cần lưu thật | |
