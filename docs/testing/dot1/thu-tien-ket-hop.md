# A — Thu tiền kết hợp (mig 112a + 112b)

Màn Thanh toán POS có ba lựa chọn: Tiền mặt · Chuyển khoản · **Kết hợp**. Mọi lần thu (POS, `/staff/tables`, ngăn
kéo A04) đi qua RPC `collect_table_bill`: một lần thu = một khoản, mỗi phương tiện = một dòng. A04, Excel và hoá đơn
in lại hiện từng khoản.

Spec `docs/superpowers/specs/2026-11-05-dot1-thanh-toan-ca-in-vietqr-design.md` §3 · Plan
`docs/superpowers/plans/2026-11-05-dot1-a-thu-tien-ket-hop.md`.

## Trước khi test

- **Thứ tự áp:** mig **112a** lên prod → merge + Vercel lên code mới → test **bài 1–13** → nhờ quán **tải lại POS** →
  áp mig **112b** → test **bài 14, 15**. Áp 112b sớm hơn thì tab POS cũ bấm Thanh toán sẽ báo "tải lại trang".
- Test trên **Bia lẩu Bảo Lương** (hoặc Yên Garden nếu đã có bàn), đăng nhập POS bằng chủ quán; bài 10 cần thêm tài
  khoản thu ngân.
- Mỗi bài dùng một bàn riêng, dọn xong mới sang bài sau.
- **Dựng bill có món:** nút **Khách lẻ** → chọn bàn → chọn món → gửi.

> **ĐÂY LÀ QUÁN THẬT.** Các bài 1, 2, 3, 6, 7, 10, 13 thu tiền thật nên **cộng vào doanh thu hôm nay** và **không xoá
> được** khỏi báo cáo. Chọn **món rẻ nhất** của menu, test **ngoài giờ mở cửa**, và **ghi lại từng số đã thu** vào
> bảng dưới để trừ khi đối chiếu két / báo cáo ngày. Các con số trong bài (1.000.000đ, 400.000đ…) chỉ để minh hoạ phép
> tính; với món rẻ thì tự tính lại theo cùng công thức.

| Bài | Bàn | Đã thu thật (ghi lại) |
|---|---|---|
| 1 | Bàn 1 | ……… đ (tiền mặt) |
| 2 | Bàn 2 | ……… đ (chuyển khoản) |
| 3 | Bàn 3 | ……… đ (kết hợp) |
| 6 | Bàn 6 | ……… đ (kết hợp) |
| 7 | Bàn 7 + Bàn 8 (hai bill riêng, gộp khi thu) | ……… đ (kết hợp) |
| 10 | Bàn 10 (`/staff/tables`) + Bàn 11 (A04) | ……… đ + ……… đ |
| 13 | Bàn 13 (ngắt mạng) | ……… đ |
| **Tổng doanh thu giả** | | **……… đ** |

## Các bài

| Bài | Việc | Mong đợi |
|---|---|---|
| 1 | Thu **Tiền mặt**, ô khách đưa gõ số lớn hơn bill (hoặc bấm nút gợi ý, có mốc làm tròn 10.000) | Hiện "Tiền thối lại cho khách" đúng số; thu xong bàn trống. A04: dòng bill ghi **Tiền mặt** |
| 2 | Thu **Chuyển khoản** | Có câu nhắc "nghe loa báo tiền về đủ …"; không có ô khách đưa. A04 ghi **Chuyển khoản** |
| 3 | Bill 1.000.000: chọn **Kết hợp**, gõ ô Tiền mặt 400.000 → ô Chuyển khoản **tự thành 600.000**; khách đưa 500.000 | Tiền thối **100.000** (so với phần tiền mặt, không so cả bill). Trên nút thu có dòng "Tiền mặt 400.000đ · Chuyển khoản 600.000đ"; nhắc nghe loa đủ **600.000đ** |
| 4 | Xem bill bài 3 ở **A04** (bảng + ngăn kéo Xem bill), **Xuất Excel**, **phiếu cuối ngày**, **In lại hoá đơn** | Nhãn **"Kết hợp"**. Ngăn kéo có khối "Các khoản đã thu": Tiền mặt 400.000 · Chuyển khoản 600.000 · Khách đưa 500.000 · Tiền thối 100.000. Excel: cột Tiền mặt 400.000, Chuyển khoản 600.000, Khác trống. Hoá đơn in lại có đủ 4 dòng đó dưới tổng. Thẻ TM + CK + khác của A04 và phiếu cuối ngày **cộng đúng doanh thu** |
| 5 | Kết hợp, gõ hai ô **không** cộng đúng tổng (vd sửa ô Chuyển khoản thành số khác) | Chữ đỏ "Tổng hai khoản phải đúng …đ"; **nút thu khoá**; không có câu nhắc nghe loa. Dọn — bỏ bàn |
| 6 | Bill có **giảm giá %** (Thanh toán → Thêm giảm giá → 10%), thu Kết hợp | Gõ một ô, ô kia tự điền theo **số SAU giảm**; thu được; A04 đúng số sau giảm |
| 7 | Hai bàn riêng → **Gộp bill** → Thanh toán → thu Kết hợp | A04 chỉ **một dòng** cho cả hai mâm (nhãn Ghép), từng khoản đúng |
| 8 | Mở màn Thanh toán chọn Kết hợp (đã gõ đủ số), **máy khác** gọi thêm món cho bàn đó, rồi bấm thu | Báo "**Số tiền không khớp bill** … Tải lại bill rồi thu lại"; **bill chưa đóng**, không có khoản thu nào ghi; màn hiện số mới, thu lại được. Dọn — bỏ bàn hoặc thu |
| 9 | Mở **hai tab** POS cùng một bàn, cùng vào Thanh toán; tab 1 thu xong (vd Tiền mặt), rồi tab 2 chọn **Chuyển khoản** bấm thu | Tab 2 báo "**Bàn đã được thu trước đó: Tiền mặt …đ**" (đúng khoản tab 1 đã ghi, không phải chuyển khoản); A04 chỉ **một** khoản cho bàn này |
| 10 | Thu một bàn ở `/staff/tables` (tài khoản thu ngân) và một bàn ở **A04** → ngăn kéo bàn chờ thu → "Đã nhận tiền mặt" | Doanh thu tăng đúng hai số. A04 hiện **hộp xác nhận trong app** (không phải hộp thoại trình duyệt), ghi đúng số sau giảm giá |
| 11 | Xem một bill **đã thu trước khi áp 112a** ở A04 và Excel | Hiện như cũ: một phương thức (hoặc "Kết hợp" nếu ngày đó trộn phương thức), không có khối "Các khoản đã thu"; Excel: TM hoặc CK đủ số, bill trộn / ví nằm ở cột **Khác** |
| 12 | **Bỏ bàn** một bàn có món chưa nấu | Vẫn chạy như trước; bàn trống; **không** vào doanh thu, không có khoản thu |
| 13 | Màn Thanh toán chọn **Tiền mặt**, **ngắt mạng** máy POS (tắt Wi-Fi) **ngay sau khi bấm** "Xác nhận đã nhận"; bật lại mạng; màn báo lỗi kết nối → **đổi sang Chuyển khoản** rồi bấm lại | Nếu lần đầu server đã ghi: báo "**Bàn đã được thu trước đó: Tiền mặt …đ**" (nói rõ ĐÃ GHI tiền mặt, không ghi thêm chuyển khoản); A04 chỉ **một** khoản, phương thức **Tiền mặt**. Nếu lần đầu chưa tới server: thu bình thường bằng Chuyển khoản |
| 14 | **Sau khi áp 112b:** một tab POS **chưa tải lại** (code cũ) bấm Thanh toán → thu | Báo "**Màn thu tiền đã cập nhật, tải lại trang rồi thu lại**"; bill chưa đóng. Tải lại trang thì thu được bình thường |
| 15 | **Sau khi áp 112b:** chủ quán thử huỷ / sửa tiền một đơn **đã thu** bằng cách gọi thẳng API (Supabase dashboard dưới vai chủ quán, hoặc nhờ Claude chạy SQL `SET ROLE authenticated`) | Báo "**Đơn đã thu tiền, không huỷ hay sửa số tiền được**"; nút "Hoàn tất" ở A04 (đóng đơn) vẫn chạy |

## SQL kiểm bất biến (controller, chỉ đọc)

Chạy sau bài 1–13 và sau bài 15. Kết quả phải **0 dòng**: mỗi khoản thu có tổng các dòng = tổng khoản = tổng các đơn
mang khoản đó.

```sql
SELECT bp.id FROM bill_payments bp
LEFT JOIN LATERAL (SELECT COALESCE(SUM(amount), 0) s FROM bill_payment_lines WHERE payment_id = bp.id) l ON true
LEFT JOIN LATERAL (SELECT COALESCE(SUM(total_amount), 0) s FROM orders WHERE bill_payment_id = bp.id AND status <> 'cancelled') o ON true
WHERE l.s <> bp.total_amount OR o.s <> bp.total_amount;
```

Bài 13 cần ngắt mạng đúng lúc nên có thể làm vài lần; điều cần kiểm là KHÔNG BAO GIỜ thấy câu "đã được chốt"
chung chung khi đã có khoản ghi — câu báo phải nêu đúng phương tiện đã ghi.

Sau bài 15 chạy lại `docs/testing/chuyen-ban-giam-gia/sql/gg-verify.sql` và `gg2-verify.sql` (đã đổi sang
`collect_table_bill`, tự ROLLBACK): phải in "TẤT CẢ CA ĐÃ PASS".
