# Yên Garden — Giao diện mới theo Apple HIG (font, Trang chủ, Gọi món, Đơn gọi)

Nhánh `claude/yg-astryx-redesign-67a515`. Chỉ đổi **theme garden** (Yên Garden); theme classic (Bảo Lương, Pubu) giữ nguyên.
Không migration, không đổi luật tiền. Bản vẽ đã duyệt: `docs/design/yen-garden/apple-hig/so-sanh.html` (ảnh ở `apple-hig/moi/`).

Đã đổi:
- Font garden: chữ thân = font của máy; tên quán / tên mục / tiêu đề = **Fraunces 600** lưu trong app
  (`mini-app/src/static/fonts/`, 2 tệp ~25 KB, giấy phép OFL). Không còn tải 8 tệp Be Vietnam Pro ở quán garden.
- Màu garden: nền `#EDE9DE` (= nền kem của logo), nhóm hàng `#F7F4EC`, chữ chính `#23271A`, chữ phụ `#545A40`.
- Thanh đầu (vòng 3, 2026-11-19 — dựng lại đúng bản vẽ): hàng 1 luôn là logo + "Yên Garden" (Fraunces) + icon, cạnh cụm nút
  Zalo. Thực đơn tại bàn: hàng 1 có giỏ + tài khoản; hàng 2 là Gọi nhân viên + chip "A2 · 325.000đ" (bàn + tạm tính) + ♡.
  Đơn gọi: hàng 2 là tiêu đề "Đơn gọi" + dòng "A2 · vào lúc 12:43", nút Gọi nhân viên bên phải; không còn chip bàn.
  Dải "Bàn · N lần gọi" chỉ còn khi là **mâm**.
- Trang chủ: ảnh bìa thấp 168 px, bo 20; địa chỉ / giờ / gọi quán / đặt bàn trên nền kem sáng; gợi ý quét QR nhẹ hơn.
- Gọi món: tên món 17, mô tả 15, giá 17 màu chữ chính; ảnh 104 px; nút + 44 px; bộ − 1 + to hơn, nằm giữa dưới ảnh;
  "Best seller" / "Món của quán" thành chữ nâu có lá; tên mục Fraunces 24 thường; ô tìm cao 44.
- Dải gọi thêm bia: "Bia hơi Hà Nội · Ca 1 lít" / "Bàn đã gọi N · 60.000đ"; nút "Thêm 1" màu nhạt.
- Thanh giỏ: một dòng "N món  tiền" + nút "Xem giỏ ›" (bàn + tạm tính đã ở chip trên đầu).
- Đơn gọi: "Tạm tính" + số to + "N món · N lượt · trả tại quầy khi về"; nút chọn **Theo lượt / Gộp món** (mới: cộng dồn
  cùng món + cùng cỡ qua mọi lượt); lượt ghi "Lượt 2 · 14:10"; cỡ món ("Ca 1 lít") nằm dòng phụ dưới tên món.
- Lề trang 20 px; thanh tab thấp như bản vẽ, icon tab vẽ y bản vẽ (mục đang chọn tô đặc).

## Trước khi test

1. Đồng bộ code vào worktree quán rồi chạy dev (hoặc chạy ngay trong worktree nhánh này nếu đã có `mini-app/.env`):
   ```bash
   cd mini-app-instances/yen-garden && git fetch origin && git merge <nhánh này>   # chỉ khi đã gộp
   cd mini-app && npm run dev
   ```
   Chrome, F12 → khung điện thoại 390×844.
2. Lối vào (bàn mẫu cũ "Bàn mẫu 1/2" đã không còn, bàn giờ là A1, A2…):
   - tại bàn A2: `http://localhost:5173/?store=yen-garden&table=7c7f6c23-7687-4347-9a22-3a5abd6c6fa2`
     (A1 đang có phiên thật gọi từ Zalo lúc 20:45 ngày 18/11 — nếu là của anh thì test luôn trên A1 bằng đúng máy đó)
   - lối thường `http://localhost:5173/?store=yen-garden`
   - Bảo Lương `http://localhost:5173/?store=bia-lau-bao-luong` (chỉ xem, không gửi đơn).
   Thử Bảo Lương bằng **cửa sổ ẩn danh** khác: cùng một trình duyệt, app nhớ theme của quán mở trước để vẽ khung đầu,
   nên khung đầu tiên có thể thoáng màu Yên Garden (chỉ xảy ra khi dev mở 2 quán chung một trình duyệt, mỗi quán thật là
   một Mini App riêng nên không gặp).
3. Lần đầu mở sau khi đổi: tải lại cứng (Ctrl+Shift+R) để không dính CSS cũ.

## Ảnh đối chiếu với bản vẽ (vòng 3, 2026-11-19)

`docs/design/yen-garden/apple-hig/doi-chieu/`: `trang-chu.png`, `goi-mon.png`, `don-goi.png` — trái bản vẽ, phải app; cả hai
có thanh trạng thái 44 px + cụm "··· | X" Zalo vẽ giả lên trên để đặt đúng vị trí. `don-goi-gop-mon.png` = chế độ Gộp món.
Khác bản vẽ còn lại (cố ý): dữ liệu thật (tên bàn A2, "(mẫu)" ở danh mục, "Best seller"); Trang chủ không có dòng khẩu hiệu
"Chill · Relax · Xanh" (quán chưa có trường này) nên "Đang mở" vẫn ở hàng giờ mở cửa; Trang chủ vẫn có ô tìm + danh mục
+ cả thực đơn (bản vẽ chỉ có "Xem tất cả" + 1 món — app chưa có trang thực đơn riêng ngoài bàn); nút dải bia ghi "Thêm 1".

## Ảnh trước / sau (agent chụp 2026-11-18, khung 390×844)

| Màn | Trước (theme garden cũ) | Sau |
|---|---|---|
| Trang chủ | `screens/yg-03-trang-chu.png` | `screens/hig/yg-trang-chu.png` |
| Gọi món (bàn trống, đã thêm 2 món vào giỏ) | `screens/yg-01-thuc-don-tai-ban.png` | `screens/hig/yg-goi-mon.png` |
| Gọi món (bàn đã gọi 2 lượt) | `screens/yg-01-thuc-don-tai-ban.png` | `screens/hig/yg-goi-mon-co-phien.png` * |
| Đơn gọi | `screens/yg-02-don-goi.png` | `screens/hig/yg-don-goi-co-mon.png` * · trống: `screens/hig/yg-don-goi.png` |
| Bảo Lương (phải y cũ) | `screens/bl-01-trang-chu.png` | `screens/hig/bl-trang-chu.png` |

\* Không tạo đơn trên prod: hai ảnh này chặn 2 RPC đọc phiên bàn (`get_table_session_state`, `get_table_session_bill`)
ngay trong trình duyệt chụp ảnh và trả dữ liệu mẫu (2 lượt, 325.000đ). Quán / menu / bàn đọc thật. Anh kiểm số thật ở C1, C4, D1–D3.

## Nhóm A — Chữ và màu

**A1. Font tiêu đề.** Lối thường. Tên "Yên Garden" ở thanh đầu và chữ "Thực đơn" là kiểu chữ có chân mềm (Fraunces), đủ dấu
(Yên, Thực đơn — dấu không bị rơi sang font khác). Tên món, mô tả, giá là font thường của máy.
**A2. Không tải Be Vietnam Pro.** F12 → Network → lọc "font" → tải lại. Có 1–2 tệp `fraunces-600-…woff2`, **không** có tệp
`fonts.gstatic.com/s/bevietnampro`. (Tệp CSS nhỏ `fonts.googleapis.com/css2…` vẫn có thể xuất hiện — là của theme classic.)
**A3. Nền kem khớp logo.** Logo tròn ở thanh đầu không có ô vuông / viền mờ quanh logo.

## Nhóm B — Trang chủ (lối thường)

**B1.** Hàng đầu: logo + "Yên Garden", bên phải ♡ (nếu quán có OA) và Tài khoản; không đè lên vùng nút "··· | X" của Zalo
(trên trình duyệt: không có gì nằm trong 96 px bên phải hàng đầu).
**B2.** Ảnh bìa thấp hơn trước (168 px), bo góc, đọc rõ biển hiệu. Dưới ảnh: địa chỉ + Chỉ đường, giờ + Đang mở, Gọi quán,
nút "Đặt bàn trước" — tất cả trên một khối nền kem sáng.
**B3.** Gợi ý quét QR là một câu xám "Đang ngồi ở quán? Quét mã QR trên bàn để gọi món." kèm icon, không khung.
Ngay dưới là tiêu đề "Thực đơn" (không còn "Thực đơn tham khảo" + dòng phụ).

## Nhóm C — Gọi món tại bàn (bàn đã gọi ít nhất 1 lượt có bia)

**C1. Thanh đầu.** Hàng 1: logo + "Yên Garden" + giỏ (số món đỏ) + tài khoản, không đè cụm nút Zalo. Hàng 2: "Gọi nhân viên"
+ chip "A2 · …đ" (số = đúng "Tạm tính" ở tab Đơn gọi; bàn chưa gọi gì thì chỉ "A2") + ♡ sát phải. Dải "A2 · N lần gọi" không còn.
Ô tìm ghi "Tìm món", cách lề 20 px như danh mục và thẻ món.
**C2. Thẻ món.** Tên món to hơn trước, giá màu chữ đen (không còn ô-liu), ảnh vuông to hơn. Món có nhãn hiện chữ nâu kèm lá
("Best seller", "Món của quán"), không có viên nền.
**C3. Nút +.** Bấm + ở món không có lựa chọn → nút đổi thành bộ "− 1 +" nằm giữa dưới ảnh; bấm − về 0 thì quay lại nút +.
Nút dễ bấm bằng ngón cái (không trượt sang ảnh / món khác). Món có lựa chọn: bấm + mở bảng chọn như cũ, có số đếm nhỏ.
**C4. Dải bia.** (Bàn đã gọi bia ở lượt trước) Dòng 1 "Bia hơi … · Ca 1 lít", dòng 2 "Bàn đã gọi N · 60.000đ", N = tổng ca
đã gọi ở các lượt không bị huỷ. Nút "Thêm 1" màu nhạt; bấm → thanh giỏ tăng 1, dải đổi thành bộ − / +.
**C7. Thanh giỏ.** Có món trong giỏ: thanh ô-liu một dòng "N món  …đ" + nút "Xem giỏ ›" → mở màn Xác nhận đơn như cũ.
Bộ "− 1 +" dưới ảnh món gọn hơn (cao 40 px), vẫn bấm được − và + riêng.
**C5. Tên mục + danh mục.** Tên mục ("Nướng (mẫu)") viết Fraunces chữ thường, không in hoa. Danh mục đang chọn: chữ đậm đen,
gạch chân ô-liu. Cuộn danh sách → gạch chân đổi theo mục đang xem.
**C6. Mâm.** (Nếu có bàn ghép mâm) Dải "Bàn A, Bàn B · N lần gọi" vẫn hiện để biết tiền là của cả mâm.

## Nhóm D — Đơn gọi

**D1. Phần trên.** Hàng 1: logo + "Yên Garden" + tài khoản. Hàng 2: "Đơn gọi" to, dưới là "A2 · vào lúc HH:mm" (giờ mở
bàn); nút "Gọi nhân viên" bên phải (bấm gọi được như cũ). Không còn chip "A2" riêng.
Rồi "Tạm tính" + số to + "N món · N lượt · trả tại quầy khi về" (N món = tổng số phần, không tính lượt bị từ chối / món huỷ).
**D2.** Mỗi lượt: "Lượt 2 · 14:10" bên trái, trạng thái bên phải có icon + chữ (đồng hồ cam = chờ xác nhận, dấu tích ô-liu =
vào bếp / xong). Chữ trạng thái giống hệt bản cũ.
**D3.** Món trong lượt: "1×" đứng đầu dòng thẳng cột, tên món 17 px, cỡ ("Ca 1 lít") ở dòng phụ nhỏ, giá căn phải. Tổng các
lượt khớp số tạm tính.
**D5. Gộp món.** Bấm "Gộp món": một khối duy nhất, cùng món + cùng cỡ cộng dồn qua các lượt (vd 1 ca ở lượt 2 + 2 ca ở lượt 1
→ "3× Bia hơi Hà Nội / Ca 1 lít · 180.000đ"); lượt bị từ chối không tính; món tặng là dòng riêng "Đã tặng 0đ". Bấm "Theo lượt"
quay lại như cũ. Chuyển tab khác rồi quay lại → về "Theo lượt".
**D6.** Nút "Gọi thêm món" nằm thẳng trên nền trang (không còn dải trắng + vạch kẻ phía trên), bấm → về Thực đơn.
**D4.** (Nếu thu ngân đã giảm giá bill) có dòng "Giảm giá −…đ" và "Tạm tính sau giảm"; lượt bị từ chối gạch ngang + dòng đỏ
"Quán không nhận lượt này…".

## Nhóm E — Bảo Lương không đổi

**E1.** Mở `?store=bia-lau-bao-luong`: font Be Vietnam Pro, lời chào "Chào mừng bạn đến với", thẻ món / Đơn gọi y như trước.
So với ảnh `docs/testing/yen-garden/screens/bl-0*.png`.
