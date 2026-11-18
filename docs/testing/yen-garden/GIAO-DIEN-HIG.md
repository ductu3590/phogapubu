# Yên Garden — Giao diện mới theo Apple HIG (font, Trang chủ, Gọi món, Đơn gọi)

Nhánh `claude/yg-astryx-redesign-67a515`. Chỉ đổi **theme garden** (Yên Garden); theme classic (Bảo Lương, Pubu) giữ nguyên.
Không migration, không đổi luật tiền. Bản vẽ đã duyệt: `docs/design/yen-garden/apple-hig/so-sanh.html` (ảnh ở `apple-hig/moi/`).

Đã đổi:
- Font garden: chữ thân = font của máy; tên quán / tên mục / tiêu đề = **Fraunces 600** lưu trong app
  (`mini-app/src/static/fonts/`, 2 tệp ~25 KB, giấy phép OFL). Không còn tải 8 tệp Be Vietnam Pro ở quán garden.
- Màu garden: nền `#EDE9DE` (= nền kem của logo), nhóm hàng `#F7F4EC`, chữ chính `#23271A`, chữ phụ `#545A40`.
- Thanh đầu: bỏ "Chào mừng bạn đến với", tên quán viết Fraunces; ở bàn có dòng "tạm tính …đ" dưới tên quán (thay dải
  "Bàn · N lần gọi" — dải này vẫn hiện nếu là **mâm**). Cách xếp icon giữ như cũ.
- Trang chủ: ảnh bìa thấp 168 px, bo 20; địa chỉ / giờ / gọi quán / đặt bàn trên nền kem sáng; gợi ý quét QR nhẹ hơn.
- Gọi món: tên món 17, mô tả 15, giá 17 màu chữ chính; ảnh 104 px; nút + 44 px; bộ − 1 + to hơn, nằm giữa dưới ảnh;
  "Best seller" / "Món của quán" thành chữ nâu có lá; tên mục Fraunces 24 thường; ô tìm cao 44.
- Dải gọi thêm bia: nút "Thêm 1" màu nhạt (nút đậm duy nhất là thanh giỏ), ghi thêm "· bàn đã gọi N".
- Đơn gọi: số tạm tính to ở đầu; mỗi lượt là một nhóm hàng, trạng thái = icon + chữ; số lượng "2×" đứng đầu dòng.

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
**B3.** Khối "Quý khách đang ngồi tại quán?" không còn khung viền; vẫn đủ hai dòng chữ.

## Nhóm C — Gọi món tại bàn (bàn đã gọi ít nhất 1 lượt có bia)

**C1. Thanh đầu.** Dưới "Yên Garden" có dòng "tạm tính …đ" = đúng số "Tạm tính" ở tab Đơn gọi. Dải "A1 · N lần gọi"
không còn. Hàng 2 vẫn là Gọi nhân viên + chip bàn + ♡ / giỏ / tài khoản như cũ.
**C2. Thẻ món.** Tên món to hơn trước, giá màu chữ đen (không còn ô-liu), ảnh vuông to hơn. Món có nhãn hiện chữ nâu kèm lá
("Best seller", "Món của quán"), không có viên nền.
**C3. Nút +.** Bấm + ở món không có lựa chọn → nút đổi thành bộ "− 1 +" nằm giữa dưới ảnh; bấm − về 0 thì quay lại nút +.
Nút dễ bấm bằng ngón cái (không trượt sang ảnh / món khác). Món có lựa chọn: bấm + mở bảng chọn như cũ, có số đếm nhỏ.
**C4. Dải bia.** (Bàn đã gọi bia ở lượt trước) Dải hiện "Bia hơi … · Ca 1 lít · 60.000đ · bàn đã gọi N", N = tổng ca đã gọi
ở các lượt không bị huỷ. Nút "Thêm 1" màu nhạt; bấm → thanh giỏ tăng 1, dải đổi thành bộ − / +.
**C5. Tên mục + danh mục.** Tên mục ("Nướng (mẫu)") viết Fraunces chữ thường, không in hoa. Danh mục đang chọn: chữ đậm đen,
gạch chân ô-liu. Cuộn danh sách → gạch chân đổi theo mục đang xem.
**C6. Mâm.** (Nếu có bàn ghép mâm) Dải "Bàn A, Bàn B · N lần gọi" vẫn hiện để biết tiền là của cả mâm.

## Nhóm D — Đơn gọi

**D1.** Đầu trang: "Tạm tính" + số to; dưới là "A1 · vào lúc HH:mm · N lượt gọi" và "Thanh toán tại quầy…".
Không còn thẻ trắng, không còn tiêu đề in hoa "CÁC LƯỢT GỌI MÓN".
**D2.** Mỗi lượt: tiêu đề "Lượt #02 · 14:10" bên trái, trạng thái bên phải có icon + chữ (đồng hồ = chờ xác nhận, mũ bếp =
vào bếp, dấu tích = xong). Chữ trạng thái giống hệt bản cũ.
**D3.** Món trong lượt: "1×" đứng đầu dòng thẳng cột, giá căn phải. Tổng các lượt khớp số tạm tính.
**D4.** (Nếu thu ngân đã giảm giá bill) có dòng "Giảm giá −…đ" và "Tạm tính sau giảm"; lượt bị từ chối gạch ngang + dòng đỏ
"Quán không nhận lượt này…".

## Nhóm E — Bảo Lương không đổi

**E1.** Mở `?store=bia-lau-bao-luong`: font Be Vietnam Pro, lời chào "Chào mừng bạn đến với", thẻ món / Đơn gọi y như trước.
So với ảnh `docs/testing/yen-garden/screens/bl-0*.png`.
