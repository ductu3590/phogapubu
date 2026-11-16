# RAIL-1 — Nút "+ Mở bàn" trên Timeline, rail gọn, Báo cáo thành trang riêng (2026-11-16)

Nhánh `claude/timeline-ui-buttons-43fcde`. Chỉ đổi admin-web, không migration, không đổi Mini App.
Agent đã chạy: `npx tsc --noEmit` sạch, `npx vitest run` 1627/1627 xanh (cập nhật `admin-nav.test.tsx`,
`config-dialog.test.ts`, `manager-frame.test.tsx`).

**Agent đã test bằng Playwright (2026-11-16, dev server local + DB prod, quán Bảo Lương):**
✅ A1–A5, A8 · ✅ B1–B7 (thu ngân `baoluong-pos`, quản lý `baoluong-quanly`) · ✅ C1–C4 · ✅ D1 (25 QR dạng SVG,
trang tables còn 33KB, không còn ảnh nhúng).
A5 tạo 1 đơn thật (Bàn 1, Mề ngan 89.000đ) rồi **đã Bỏ bàn** ngay, Bảo Lương về lại 25 bàn trống.
Chưa test, chờ anh Tú: **A6** (không có đặt bàn trễ để dựng), **A7** (Gộp bill cần ≥2 bàn đang mở), **D2** (quét QR
bằng Zalo thật), **D3**, **E1** (sau khi deploy production).

Đăng nhập **chủ quán** Bảo Lương (hoặc Yên Garden), mở `/admin/pos`, khung **Timeline**.

## A. Nút "+ Mở bàn" thay "+ Đặt lúc"

| # | Bước | Kỳ vọng |
|---|---|---|
| A1 | Nhìn hàng của một bàn TRỐNG | Có nút viền nét đứt **"+ Mở bàn"** đứng ngay vạch đỏ "bây giờ"; không còn nút "+ Đặt lúc HH:MM" |
| A2 | Nhìn hàng của bàn ĐANG CÓ KHÁCH (thanh phiên đang mở) | KHÔNG có nút "+ Mở bàn" |
| A3 | Bấm "+ Mở bàn" ở bàn trống (vd. B5) | Mở thẳng hộp chọn món tiêu đề **"Khách lẻ · B5"** (bỏ qua bước chọn bàn) |
| A4 | Ở A3, bấm đóng không gửi món | Bàn vẫn trống, không có phiên rỗng (như nút Khách lẻ cũ) |
| A5 | Ở A3, chọn 1 món → gửi | Bàn B5 thành thanh "đang phục vụ", nút "+ Mở bàn" ở B5 biến mất |
| A6 | Bàn có đặt bàn đang trễ (thanh đặt bàn phủ vạch "bây giờ") | Nút "+ Mở bàn" nằm SAU thanh đặt bàn, không đè lên thanh |
| A7 | Bật chế độ Gộp bill / Sắp xếp bàn | Nút "+ Mở bàn" ẩn |
| A8 | Dòng gợi ý trên đầu Timeline | Ghi "Bấm thanh để mở bill · "+ Mở bàn" để gọi món khách lẻ" |
| A9 | Đặt bàn mới vẫn làm được | Nút **"Đặt bàn mới"** ở đầu POS vẫn mở form đặt bàn (quán bật đặt bàn) |

## B. Rail bên trái

| # | Bước | Kỳ vọng |
|---|---|---|
| B1 | Đếm mục rail (chủ quán) | Không còn ô **Bàn QR**; **Báo cáo** là mục CUỐI của nhóm trên (sau Kho) |
| B2 | Chân rail | ⚙ Cài đặt và nút Đăng xuất **chỉ còn icon**, không chữ; rê chuột hiện "Cài đặt" / "Đăng xuất (email)" |
| B3 | Bấm ⚙ Cài đặt | Hộp thoại có hàng tab: Cài đặt chung · **Sơ đồ bàn & QR** · Nhân viên · Ưu đãi & Vòng quay · Bảo mật |
| B4 | Bấm tab Sơ đồ bàn & QR | Trang bàn + QR như cũ trong hộp thoại; nút ⚙ trên rail vẫn sáng cam |
| B5 | Bấm Đăng xuất (icon) | Vẫn hỏi lại "Đăng xuất?" như cũ |
| B6 | Đăng nhập **thu ngân**, rồi **quản lý** | Rail: … Thu chi · Kho · **Báo cáo** (cuối); ⚙ chỉ icon; không thấy tab Sơ đồ bàn & QR |
| B7 | Màn hẹp (< 768px), mở menu ☰ | Ngăn kéo vẫn có chữ đầy đủ cho mọi mục, có "Cài đặt" ở nhóm Thiết lập |

## C. Báo cáo mở thành trang

| # | Bước | Kỳ vọng |
|---|---|---|
| C1 | Đang ở POS, bấm Báo cáo | Mở **trang** Báo cáo chiếm vùng chính (KHÔNG còn hộp thoại tối nền đè lên POS, không nút X) |
| C2 | Đang mở hộp thoại Hoá đơn, bấm Báo cáo trên rail | Hộp thoại tự đóng, trang Báo cáo hiện ra |
| C3 | Trong Báo cáo đổi tab / kỳ, bấm Xuất Excel | Chạy như cũ |
| C4 | Từ Báo cáo bấm POS trên rail | Về POS bình thường; nút Back trình duyệt quay lại Báo cáo |

## D. Sơ đồ bàn & QR nhẹ hơn

| # | Bước | Kỳ vọng |
|---|---|---|
| D1 | ⚙ Cài đặt → Sơ đồ bàn & QR | Mỗi thẻ bàn có ảnh QR (vẽ ở trình duyệt, chớp ô xám rất ngắn rồi hiện QR) |
| D2 | Dùng app Zalo quét một QR trên màn hình | Mở đúng Mini App của quán, đúng bàn (link y hệt trước, chỉ đổi cách vẽ) |
| D3 | Bấm "Tải QR PNG" / "In QR" | Tải / in như cũ |

## F. Quét chuột chọn chữ trong form không làm mất popup (2026-11-16)

Lỗi cũ: nhấn trong ô nhập, kéo chuột lố ra vùng nền tối rồi thả → popup đóng mất (trình duyệt bắn `click` lên phần tử
cha chung của chỗ nhấn và chỗ thả, chính là nền). Giờ popup chỉ đóng khi nhấn VÀ thả đều trên nền
(`lib/backdrop-dismiss.ts`, hook `components/ui/use-backdrop-dismiss.ts`). Áp cho: mọi `Dialog` chung (Đặt bàn mới,
Khách lẻ, sửa bill…), hộp thoại cấu hình ⚙, hộp Đăng xuất, ngăn kéo menu màn hẹp, form Thêm bàn, các form ở trang Món.

**Agent đã chạy Playwright:** ✅ F1 (Đặt bàn mới) · ✅ F2 (Thêm bàn trong ⚙ Cài đặt) · ✅ F4.

| # | Bước | Kỳ vọng |
|---|---|---|
| F1 | POS → Đặt bàn mới → gõ Tên khách → nhấn cuối chữ, quét chuột sang trái lố ra nền tối, thả | Form VẪN mở, chữ được bôi đen hết, gõ đè được |
| F2 | ⚙ Cài đặt → Sơ đồ bàn & QR → Thêm bàn → gõ tên → quét lố ra nền, thả | Form Thêm bàn và hộp Cài đặt vẫn mở |
| F3 | Trang Món: mở form sửa món / danh mục → quét chọn chữ lố ra ngoài | Form vẫn mở |
| F4 | Bấm hẳn (nhấn + thả) vào vùng nền tối | Popup đóng như cũ |

## G. Xoá bàn đã có đơn + chọn nhiều bàn (2026-11-16, mig 141 + 142 đã áp prod)

- Xoá được bàn đã từng có đơn. Đơn, phiên, mâm, đặt bàn cũ, lịch sử chuyển bàn của bàn bị xoá dồn sang **bàn nhận** =
  bàn đầu tiên theo tên tự nhiên trong số bàn còn lại (Bảo Lương: "Bàn 1"; xoá chính Bàn 1 thì là "Bàn 2"). Doanh thu
  giữ nguyên; `updated_at` của đơn cũ giữ nguyên nên đơn cũ không nhảy sang báo cáo hôm nay (mig 141).
- Chặn như Đóng bàn: bàn đang có khách, bàn đang giữ cho đặt bàn sắp tới, bàn có đơn trả trước đang làm dở. Chặn là
  chặn cả lô, không xoá nửa vời.
- Mỗi thẻ bàn có ô tích; đầu khu có "Chọn cả khu"; tích ≥1 bàn thì hiện thanh dính đáy: Chuyển sang khu… · Xoá N bàn · Bỏ chọn.

**Agent đã chạy:** 12 test DB (`supabase/tests/141_142_xoa_ban_giu_doanh_thu.test.mjs`) + vitest; Playwright trên Bảo
Lương ✅ G1–G6 (tạo 3 bàn "Thử 1–3", Thử 1 có đơn huỷ, Thử 3 đang có khách; xong đã dọn sạch: Bảo Lương về 25 bàn,
0 phiên mở). Hệ quả còn lại: "Bàn 1" của Bảo Lương có thêm 2 đơn **đã huỷ** 89.000đ (đơn test của Thử 1, Thử 3) — không
tính doanh thu.

| # | Bước | Kỳ vọng |
|---|---|---|
| G1 | ⚙ → Sơ đồ bàn & QR → tích 2 bàn | Thẻ viền cam; thanh đáy "Đã chọn 2 bàn" |
| G2 | Thanh đáy → Chuyển sang khu… → chọn khu khác | Hai bàn sang khu mới, thanh đáy biến mất; POS thấy bàn ở khu mới |
| G3 | "Chọn cả khu" ở đầu một khu | Tích hết bàn của khu, nút đổi thành "Bỏ chọn khu" |
| G4 | Chọn bàn đã từng có đơn → Xoá | Câu hỏi lại nêu "đơn cũ và doanh thu chuyển sang "Bàn 1""; xoá xong báo "N đơn cũ đã chuyển sang Bàn 1" |
| G5 | Chọn cả bàn đang có khách → Xoá | Báo "Bàn … đang có khách…", KHÔNG bàn nào bị xoá |
| G6 | Nút Xoá lẻ trên một thẻ bàn | Như G4 cho một bàn |
| G7 | Báo cáo (Theo món / Doanh thu) hôm qua trước và sau khi xoá một bàn có đơn đã thu | Số tiền không đổi |

## H. Mở lại trang đã xem: hiện ngay, dữ liệu mới về sau (2026-11-16)

`next.config.ts` `experimental.staleTimes.dynamic = 300`: trình duyệt giữ trang vừa xem 5 phút. `components/revisit-refresh.tsx`
(gắn ở layout /admin, /staff, /mevo) thấy trang hiện TỪ CACHE (không có request tải trang) thì gọi `router.refresh()` phía
sau → dữ liệu mới thay vào, không mất ô đang nhập / vị trí cuộn. Trang nào cache đã bị xoá (vd. Hoá đơn nghe Realtime)
thì Next tự hỏi máy chủ như cũ, không tải hai lần.

**Agent đã chạy:** 8 test `lib/revisit-refresh.test.ts`; Playwright trên bản BUILD production chạy tại máy (dev không
giống production ở phần cache): mở lại Món 37ms, Báo cáo 37–40ms (lần đầu ~850–930ms) + đúng 1 lần tải nền; Hoá đơn
~1,1 s, 1 request (như cũ). Dữ liệu mới: thêm bàn "Thử cache" thẳng vào DB khi đang ở trang khác → quay lại Sơ đồ bàn
thấy ngay "25 bàn", tự đổi thành "26 bàn" (đã xoá bàn thử). ✅ H1, H2, H3.

| # | Bước | Kỳ vọng |
|---|---|---|
| H1 | Mở Món → Báo cáo → bấm lại Món | Lần quay lại hiện gần như tức thì |
| H2 | Đang ở trang khác, dùng điện thoại (/staff) đổi "Tạm hết" một món → quay lại Món ở máy POS | Hiện bản cũ ngay, ~0,5 s sau tự cập nhật đúng |
| H3 | Mở lại Hoá đơn | Như trước (Hoá đơn tự làm mới theo Realtime) |
| H4 | Đang gõ dở trong ô tìm món → chuyển trang → quay lại | Không lỗi; nếu ô còn chữ thì chữ không mất khi dữ liệu mới về |

## E. Đổi vùng máy chủ sang Mumbai (`admin-web/vercel.json`: `sin1` → `bom1`)

| # | Bước | Kỳ vọng |
|---|---|---|
| E1 | Sau khi deploy, mở mevo.vn, bấm lần lượt Món · Hoá đơn · Thu chi · Báo cáo · Cài đặt | Mỗi lần bấm nhanh hơn rõ (trước đo 670–1150ms). Agent đo lại được nếu anh bảo |
