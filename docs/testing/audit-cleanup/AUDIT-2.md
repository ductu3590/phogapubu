| A2 ✅ PASS 2026-11-12 || A1 ✅ PASS 2026-11-12 |# AUDIT-2 — Các thay đổi theo 14 câu trả lời của anh Tú (2026-11-11)

Nhánh `claude/codebase-audit-cleanup-da23f0` (phần này CHƯA merge main). Test trên **Bảo Lương**.
In bếp do máy chủ xếp có checklist riêng: [IN-BEP-SERVER.md](IN-BEP-SERVER.md). Test đua: [RACE.md](RACE.md).

Đã tự kiểm bằng máy: admin-web `tsc` sạch, vitest xanh, eslint không thêm lỗi; mini-app vitest 236 test xanh (1 file
hỏng có sẵn do thiếu `.env`), tsc giữ 4 dòng lỗi có sẵn. **Chưa kiểm trên trình duyệt / Zalo.**

## Nhóm A — Chỉ thu tiền ở POS (admin-web)

| # | Việc | Kỳ vọng |
|---|---|---|
| A1 | Tài khoản thu ngân mở `/staff/tables`, bấm vào một bàn đang có khách | Thấy bill, danh sách lượt, In bill, Thao tác khác (thêm bàn vào mâm, Bỏ bàn — từ mig 133 không còn nhập vào mâm, xem nhóm E). KHÔNG còn nút "Thu tiền & đóng bàn", không còn ô tick gộp bill; có dòng "Thu tiền ở POS (Thanh toán)" | ✅ PASS 2026-11-12 |
| A2 | Tài khoản nhân viên phục vụ mở `/staff/tables` | Như A1 nhưng không có Bỏ bàn | ✅ PASS 2026-11-12 |
| A3 | `/admin/bills` → dòng **Chờ thu** của một bàn đang mở → Xem bill | Không còn nút "Đã nhận tiền mặt / chuyển khoản"; có dòng "Thu tiền ở POS (Thanh toán): thu cả bàn một lần, thu xong bill đóng lại." và In tạm tính |
| A4 | POS → chọn bàn đó → Thanh toán → thu (thử cả Kết hợp) | Thu được như cũ, bàn trống, A04 ghi đúng |
| A5 | **Phiên hết hạn còn nợ**: nếu chưa có thì mở một bàn, gọi món, để quá hạn phiên (hoặc nhờ em dựng). Mở POS | Cột Việc cần xử lý có khối đỏ **"Bàn hết hạn còn tiền chưa thu (N)"** ghi tên bàn + số tiền |
| A6 | Bấm dòng đó → Thanh toán → thu | Mở đúng bill của phiên hết hạn (có băng báo hết hạn), thu được; khối đỏ biến mất; A04 ghi doanh thu |
| A7 | `/admin/bills` → Xem bill một đơn KHÔNG thuộc bàn (nếu có đơn trả trước / mang về cũ của Pubu) bằng tài khoản chủ quán | Vẫn có nút từng đơn như cũ (Đã nhận tiền / Hoàn tất / Huỷ đơn) |

## Nhóm E — Nhân viên chỉ còn "Thêm bàn vào mâm" (mig 133, đã áp prod 2026-11-12)

| # | Việc | Kỳ vọng |
|---|---|---|
| E1 | Tài khoản **nhân viên phục vụ** mở `/staff/tables` | Không còn nút **Ghép mâm** ở thanh trên |
| E2 | Bấm "Thao tác khác" (⋯) của một bàn đang có khách | Chỉ còn **Thêm bàn vào mâm** (mô tả: khách đang ngồi có thêm bạn tới, kê thêm bàn trống cạnh nhau). Không còn "Nhập vào mâm khác", "Chuyển quyền gọi món", không có Bỏ bàn |
| E3 | Thêm bàn vào mâm → chọn một bàn trống | Bàn đó vào chung bill với bàn đang ngồi; quét QR của bàn mới ra đúng bill đó; POS hiện hai bàn là một mâm |
| E4 | Tài khoản **thu ngân** mở `/staff/tables` → ⋯ | Thêm bàn vào mâm + Bỏ bàn. Không còn Ghép mâm / Nhập vào mâm / Chuyển quyền |
| E5 | Trên **POS**: ghép mâm, nhập một bàn vào mâm khác, chuyển quyền gọi món | Vẫn làm được như cũ |

## Nhóm B — POS vẫn cập nhật tức thì (lõi realtime chung)

| # | Việc | Kỳ vọng |
|---|---|---|
| B1 | POS mở trên máy tính; dùng điện thoại nhân viên gọi một lượt món cho một bàn | Trong 1–2 giây ô bàn / Timeline trên POS đổi, không phải chờ 5 giây |
| B2 | Mini App khách bấm "Gọi nhân viên" | POS và thanh chuông ở `/staff` hiện thẻ gọi + kêu chuông trong 1–2 giây; chạm thẻ là xong |
| B3 | Tạo một đặt bàn mới từ Mini App | Thẻ đặt bàn xuất hiện ở POS (Việc cần xử lý) và trang Đặt bàn trong 1–2 giây |
| B4 | Tắt Wi-Fi máy POS 10 giây rồi bật lại | Sau khi có mạng lại, POS tự tải lại và đúng dữ liệu, không cần F5 |

## Nhóm C — `/mevo`

| # | Việc | Kỳ vọng |
|---|---|---|
| C1 | Đăng nhập superadmin → `/mevo` | Có khối "Dịch vụ phụ trợ (máy đặt tại Việt Nam)" với hai dòng: Proxy số điện thoại Zalo, Relay thông báo nhóm Zalo |
| C2 | Chưa đặt biến `MEVO_PHONE_PROXY_URL` trên Vercel | Dòng proxy ghi "Chưa rõ · Chưa đặt MEVO_PHONE_PROXY_URL trên Vercel…". Đặt biến = `https://zalo.soccernow.net/mevo/phone` (KHÔNG có `/health` ở cuối) rồi Redeploy → "Đang chạy" |
| C3 | (Tuỳ) tắt dịch vụ proxy trên MiniPC rồi tải lại `/mevo` | Khối chuyển nền đỏ, dòng proxy "Không hoạt động" |

## Nhóm D — Mini App (merge vào worktree Bảo Lương + `zmp deploy` bản Development)

| # | Việc | Kỳ vọng |
|---|---|---|
| D1 | Quét QR bàn → chọn món → màn Gọi món | KHÔNG còn ô "Nhập mã giảm giá" |
| D2 | Bàn đã gọi một lượt bia; gọi tiếp đúng món bia đó | Gửi thẳng, KHÔNG còn hộp hỏi "món đã có trong bill" |
| D3 | Đặt bàn kèm đặt món trước 1 món → thu ngân tiếp nhận khách → tại bàn gọi lại đúng món đó | Hiện hộp "Món này bạn đã đặt trước" (Kiểm tra lại / Vẫn gọi thêm) |
| D4 | Mở tấm quan tâm OA (tab Thông tin nhà hàng → thẻ quan tâm) | Dòng 1: "Quan tâm trang Zalo của quán — Nhận tin tức, ưu đãi của quán và nhắn tin cho quán qua Zalo. Hoàn toàn miễn phí."; dòng 2: "Điền sẵn khi bạn đặt bàn. Không spam." Không còn chữ ZNS / món xong / mang về |
| D5 | Thông tin nhà hàng → Điều khoản sử dụng | Bản cho quán trả sau: Gọi món tại bàn · Thanh toán tại quầy · Thông tin cá nhân · Liên hệ. Không còn hoàn tiền / mang về. **Anh đọc kỹ mục "Thông tin cá nhân"** — em viết theo trang Tài khoản, cần anh duyệt câu chữ |

## Việc anh Tú tự làm

- ✅ Đã xoá 3 edge function cũ trên Supabase Dashboard (2026-11-12).
- ✅ Sổ Tay Buôn Đá đã có Webhook URL riêng (2026-11-12) → MEVO đã gỡ hẳn phần chuyển tiếp.
- Vercel → Project → Settings → Environment Variables: thêm `MEVO_PHONE_PROXY_URL` = `https://zalo.soccernow.net/mevo/phone`
  (Production), rồi Redeploy. Giá trị này lấy từ `ops/phone-proxy/README.md` — cùng giá trị với secret cùng tên bên
  Supabase (Edge Functions → Secrets; Supabase chỉ cho xem tên, không cho xem giá trị). Trên MiniPC KHÔNG có biến
  này: MiniPC chỉ có `MEVO_HMAC_SECRET` và `PORT` trong `/etc/mevo-phone-proxy.env`; đường `/mevo/phone` do
  Cloudflare Tunnel (`/etc/cloudflared/config.yml`) trỏ về cổng 3100.
