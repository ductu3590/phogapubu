# GG-1 — Giảm giá hoá đơn (VNĐ / %) (2026-11-03)

Nhánh `feat/chuyen-ban-giam-gia-bill` · Spec `docs/superpowers/specs/2026-11-02-chuyen-ban-giam-gia-bill-design.md` §4
Test trên **Bia lẩu Bảo Lương** (đăng nhập POS bằng chủ quán; bài 10 dùng tài khoản thu ngân). **Migration 107 + 108 đã áp prod.** **Migration 110** (chặn thu lẻ từng lượt của bàn trả sau + khoá 2 hàm nội bộ) Claude áp sau khi review xong — bài 12 cần 110 đã áp; các bài khác không phụ thuộc.
Làm sau khi **CB-1 và CB-2 đã PASS**.

> **ĐÂY LÀ QUÁN THẬT.** Bài 1 và bài 6 thu tiền thật trên POS nên **cộng thêm vào doanh thu hôm nay** (bài 1: 139.500đ, bài 6: 90.000đ — tổng 229.500đ giả). Hoá đơn đã thu **không xoá được** khỏi báo cáo. Cách giảm thiệt hại: test **ngoài giờ mở cửa**, hoặc test xong ghi lại 229.500đ này để trừ khi đối chiếu két / báo cáo ngày. Các bài còn lại đều kết thúc bằng **Bỏ bàn** (không vào doanh thu). Nhớ dọn hết bill test trước khi quán mở cửa kẻo nhân viên thấy bàn lạ.
>
> **Giảm doanh thu giả:** ở bài 1 và bài 6 (hai bài thu tiền thật) nên chọn **món rẻ nhất** của menu (vd vài món đồ nhắm/nước rẻ) thay vì ra đúng 155.000đ / 100.000đ — các con số mẫu trong bài chỉ để minh hoạ, điều cần kiểm là phép tính khớp (xem "Chọn món cho ra đúng tổng tiền" bên dưới). Ghi lại số thật đã thu để trừ khi đối chiếu.

## Cách làm cho khỏi nhầm

- **Mỗi bài dùng bàn riêng** (bảng dưới) và **dọn xong mới sang bài sau**. Bài nào có dòng "Dọn" thì làm đủ dòng đó — bỏ qua thì bài sau báo FAIL oan (bàn còn khách).
- **"Dọn — bỏ bàn"** = POS → mở bill bàn đó → **Thao tác khác** → **Bỏ bàn (không thu tiền)** → bấm **Bỏ bàn** trong hộp thoại.
- **"Dọn — thu tiền"** = POS → bill bàn đó → **Thanh toán** → **Xác nhận đã nhận …** (tiền mặt).
- **Dựng một bill có món** (mọi bài): nút **Khách lẻ** → chọn bàn → chọn món → gửi. Gọi thêm sau đó: bill bàn → **Gọi thêm món**.
- **Chọn món cho ra đúng tổng tiền ghi trong bài.** Menu của quán có giá riêng nên có thể không ra đúng con số mẫu (155.000đ, 100.000đ…). Không sao: chọn tổng gần nhất rồi **tự tính lại** theo công thức — giảm % = tổng hàng × % (làm tròn đến đồng); khách cần trả = tổng hàng − giảm. Điều cần kiểm là máy tính **khớp** với công thức đó ở mọi chỗ (POS, bản in, A04), không phải con số cụ thể.
- **Vào màn giảm giá:** bill bàn → **Thanh toán · …đ** → trong màn Thanh toán, hàng **Giảm giá** có ô bấm (chữ **Thêm giảm giá** khi chưa giảm, hoặc số tiền giảm **−…đ** khi đã giảm) → mở hộp **Giảm giá hoá đơn**. Hộp có hai nút chọn **VNĐ** / **%**, ô nhập, khung cam "**Giảm: …đ**" xem trước, và nút **Bỏ giảm giá** (chỉ khi đang có giảm giá) / **Bỏ qua** / **Lưu**.
- Không có ô "lý do" khi giảm giá (giống KiotViet) — không phải lỗi.

| Bài | Bàn dùng |
|---|---|
| 1 | Bàn 1 (thu tiền) |
| 2 | Bàn 2 |
| 3 | Bàn 3 |
| 4 | Bàn 4 |
| 5 | Bàn 5 |
| 6 | Bàn 6 + Bàn 7 (hai bill RIÊNG, không Ghép mâm; thu tiền) |
| 7 | (xem lại bill bài 1 và bài 6) |
| 8 | Bàn 8 + Bàn 9 |
| 9 (Mini App) | Bàn 10 |
| 10 (thu ngân) | Bàn 11 |
| 11 | (không bắt buộc) |
| 12 | Bàn 12 (bỏ bàn, cần mig 110 đã áp) |

## 0. Chuẩn bị (làm TRƯỚC khi test)

**A. Admin-web (POS + A04 + bản in) — cần cho mọi bài trừ phần Mini App của bài 9**
Đang chưa deploy Vercel, nên chạy local từ worktree của nhánh này (đã có `.env.local` sẵn, trỏ đúng Supabase prod):
```
cd D:\Code\mevo\.claude\worktrees\chuyen-ban-giam-gia-bill\admin-web
npm run dev
```
Mở `http://localhost:3000/admin/pos` (nếu cổng 3000 đang bận, terminal sẽ in cổng khác — dùng cổng đó). Nếu CB-2 vẫn đang chạy `npm run dev` thì **tắt đi chạy lại** để chắc chắn là code mới nhất của nhánh. (Nếu nhánh đã merge `main` + push và Vercel đã deploy thì test thẳng trên domain, bỏ qua bước này.)

**B. Mini App — chỉ bài 9 cần**
Bản Mini App đã `zmp deploy` ở CB-1 **chưa có** dòng giảm giá ở tab Đơn gọi. Chỉ làm khi bạn sẵn sàng test bài 9 (Claude sẽ nhắc), vì Zalo giới hạn số lần deploy/tháng:
```
cd D:\Code\mevo\mini-app-instances\bia-lau-bao-luong
git merge feat/chuyen-ban-giam-gia-bill
cd mini-app
zmp deploy
```
(Worktree quán dùng chung kho git với repo nên nhánh local này thấy được, không cần push.)
- Khi `zmp deploy` hỏi: chọn **Development** để tự test (QR/link Development mở bản mới); **Testing** chỉ khi muốn tạo bản gửi duyệt.
- Mở Mini App bằng đúng QR/link của bản vừa deploy.
- Chưa deploy được thì **bỏ qua bài 9** (ghi "chưa test"), các bài khác không phụ thuộc. Bản cũ vẫn tính đúng bill, chỉ không hiện dòng giảm giá.

**C. Dữ liệu cần có**
Bàn 1–12 của Bảo Lương đang trống (hoặc bạn tự dọn trước). Có sẵn tài khoản **thu ngân** (không phải chủ quán) để làm bài 10.

---

## Phần 1 — POS: giảm giá và hiển thị số

### 1. Giảm 10% → tạm tính in dòng giảm, thu đúng số sau giảm
1. Dựng bill **Bàn 1**, tổng hàng **155.000đ** (ví dụ). Mở bill → **Thanh toán**.
2. Bấm **Thêm giảm giá** → chọn **%** → gõ **10**. Mong đợi: khung cam xem trước **"Giảm: 15.500đ"**. Bấm **Lưu**.
3. Mong đợi trong màn Thanh toán, khung cam, đúng thứ tự dòng:
   - **Tổng tiền hàng 155.000đ**
   - **Giảm giá (10%)** và nút bấm **−15.500đ**
   - **KHÁCH CẦN TRẢ 139.500đ** (số lớn màu cam)
   - Góc phải đầu màn: **Cần thu 139.500đ**; nút xanh dưới cùng: **Xác nhận đã nhận 139.500đ**.
   - Không có dòng "Đã thu trước" (chưa ai trả trước gì).
4. Quay lại bill (mũi tên trái): ở tab bill có dải cam **"Giảm giá (10%)  −15.500đ"**; nút dưới cùng ghi **Thanh toán · 139.500đ**. Ô tiền xám ở đầu bill (nền xanh than) ghi **"ĐÃ DUYỆT · CHƯA THU 155.000đ"** kèm dòng nhỏ **"Chưa trừ giảm giá 15.500đ"** (ô này là tiền hàng chưa thu TRƯỚC giảm giá — số khách trả là ở nút Thanh toán).
5. Bấm **In tạm tính / hoá đơn** (hoặc **In tạm tính** ở bill) → xem bản in (xem trước hộp thoại in, hoặc mở được tờ in thì xem). Mong đợi các dòng ở cuối tờ: **Tổng số món** → **Tổng tiền hàng 155.000** → **Giảm giá (10%)  -15.500** → **Khách cần trả 139.500đ** (chữ "TỔNG CỘNG" KHÔNG xuất hiện khi có giảm giá).
6. Ghi chú đã biết, **không tính FAIL**: nếu lúc này mở `/admin/bills` thì dòng **Chờ thu** của Bàn 1 vẫn hiện **155.000đ "Tạm tính"** — số chờ thu của bill còn mở tính **trước giảm giá** (cố ý, chỉ khi thu xong mới ra số sau giảm — kiểm ở bài 7).
7. **Dọn — thu tiền** bill Bàn 1 (tiền mặt, để vào bài 7): nhập tiền khách đưa tuỳ ý ≥ 139.500đ.
- [ ] PASS  [ ] FAIL

### 2. Giảm VNĐ → sửa → bỏ
1. Dựng bill **Bàn 2**, tổng hàng **100.000đ**. Thanh toán → **Thêm giảm giá** → để **VNĐ** → gõ **20000** (ô tự thêm dấu chấm thành 20.000). Mong đợi xem trước **"Giảm: 20.000đ"** → **Lưu**.
2. Mong đợi: hàng Giảm giá ghi **Giảm giá** (KHÔNG có "%") với nút **−20.000đ**; **Khách cần trả 80.000đ**.
3. Bấm nút **−20.000đ** để sửa. Mong đợi: hộp mở sẵn kiểu **VNĐ** với **20.000** trong ô; có nút đỏ **Bỏ giảm giá** bên trái. Đổi thành **30.000** → **Lưu** → **Khách cần trả 70.000đ**.
4. Mở lại → bấm **Bỏ giảm giá**. Mong đợi: hộp đóng, hàng giảm giá trở lại **Thêm giảm giá**, **Khách cần trả 100.000đ**, tab bill không còn dải cam giảm giá.
   - **Kiểm hồi quy bill KHÔNG giảm giá:** bấm **In tạm tính / hoá đơn**. Mong đợi tờ in như trước khi có tính năng giảm giá: dòng cuối **TỔNG CỘNG 100.000đ**; **KHÔNG** có dòng "Tổng tiền hàng", "Giảm giá" hay "Khách cần trả".
5. Mở hộp lần nữa, gõ thử **200000** (lớn hơn tiền hàng 100.000). Mong đợi: khung đỏ **"Giảm giá lớn hơn tiền hàng — sửa lại giảm giá"**, nút **Lưu** xám không bấm được. Bấm **Bỏ qua** — không có gì thay đổi.
6. **Dọn — bỏ bàn** Bàn 2.
- [ ] PASS  [ ] FAIL

### 3. Gợi ý tiền khách đưa theo số SAU giảm
1. Dựng bill **Bàn 3**, tổng hàng **155.000đ**, giảm **10%** (như bài 1) → **Khách cần trả 139.500đ**. Vẫn ở màn Thanh toán, chọn **Tiền mặt**.
2. Mong đợi: ô "Tiền khách đưa" gợi ý (placeholder xám) **139.500**; hàng **Gợi ý nhanh** có bốn nút: **Vừa đủ 139.500đ · 150.000đ · 200.000đ · 500.000đ** (tính theo 139.500, không phải 155.000).
   - Các nút gợi ý **phụ thuộc số Khách cần trả**: nút đầu = vừa đủ, các nút sau = làm tròn LÊN tới bội 50.000 / 100.000 / 500.000 / 1.000.000 (bỏ trùng, tối đa 4 nút). Nếu tổng của bạn khác 155.000đ thì tự tính lại theo quy tắc đó — điều cần kiểm là nút được tính từ số SAU giảm. Ví dụ tổng hàng 80.000đ giảm 10% → cần trả 72.000đ → **72.000 · 100.000 · 500.000 · 1.000.000**.
3. Bấm **200.000đ** → hiện khung xanh **"Tiền thối lại cho khách 60.500đ"**.
4. Gõ tay **100000** vào ô → hiện khung đỏ **"Khách đưa còn thiếu 39.500đ"** và nút **Xác nhận đã nhận 139.500đ** bị khoá (xám).
5. **Dọn — bỏ bàn** Bàn 3 (không thu).
- [ ] PASS  [ ] FAIL

### 4. Bỏ món khiến giảm giá VNĐ lớn hơn tiền hàng → không cho thu, không cho in
1. Dựng bill **Bàn 4** gồm **2 món**: món A **60.000đ** + món B **40.000đ** (tổng 100.000đ; nếu menu không ra đúng số, chọn gần nhất và tính lại tương ứng — quan trọng là giảm VNĐ đặt sau phải **lớn hơn** tiền hàng còn lại sau khi bỏ món B).
2. Thanh toán → **Thêm giảm giá** → VNĐ **80000** (≤ 100.000 nên hợp lệ) → **Lưu** → **Khách cần trả 20.000đ**.
3. Trong danh sách "Món đã dùng & điều chỉnh", bấm menu **⋮** của **món B** → **Bỏ món** (nhập lý do, xác nhận). Mong đợi, tiền hàng còn **60.000đ** nhỏ hơn giảm giá 80.000đ:
   - Trong khung cam hiện **khung đỏ** chữ **"Giảm giá lớn hơn tiền hàng — sửa lại giảm giá"**.
   - Hàng **Giảm giá** vẫn hiện mức đang lưu: nút viền đỏ chữ đỏ **"Sửa −80.000đ"** (KHÔNG phải "Thêm giảm giá"), không còn nhãn "(…%)".
   - **Khách cần trả** quay về số TRƯỚC giảm (**60.000đ**), không phải 0đ hay số âm.
   - Nút xanh **Xác nhận đã nhận …** bị **khoá**; nút **In tạm tính / hoá đơn** bị **khoá**.
4. Bấm **Quay lại bill** (mũi tên). Mong đợi: ở chân bill hiện khung đỏ **"Giảm giá lớn hơn tiền hàng — sửa lại giảm giá. Mở Thanh toán để sửa giảm giá."**, nút **In tạm tính** bị khoá, và dải cam giảm giá ở tab bill **không hiện**.
5. Mở Thanh toán → bấm nút đỏ **Sửa −80.000đ** → hộp **Giảm giá hoá đơn** mở sẵn VNĐ **80.000** → đổi thành **50.000** → **Lưu**. Mong đợi: khung đỏ biến mất, nút giảm giá trở lại màu cam **−50.000đ**, **Khách cần trả 10.000đ**, hai nút thu và in sáng lại.
6. **Dọn — bỏ bàn** Bàn 4.
- [ ] PASS  [ ] FAIL

### 5. Đặt % rồi khách gọi thêm → số giảm tăng theo
1. Dựng bill **Bàn 5**, tổng hàng **100.000đ**. Thanh toán → giảm **10%** → **Giảm giá (10%) −10.000đ**, **Khách cần trả 90.000đ**. Quay lại bill.
2. Bấm **Gọi thêm món** → ghi thêm món **50.000đ** → gửi. (Nếu bill còn lượt "chờ duyệt" thì Duyệt trước, vì POS khoá thanh toán khi còn lượt chờ.)
3. Mở lại Thanh toán. Mong đợi **KHÔNG phải đặt lại giảm giá**: **Tổng tiền hàng 150.000đ**, **Giảm giá (10%) −15.000đ**, **Khách cần trả 135.000đ**.
4. **Dọn — bỏ bàn** Bàn 5.
- [ ] PASS  [ ] FAIL

---

## Phần 2 — Gộp bill

### 6. Gộp 2 mâm, giảm VNĐ → hoá đơn tổng đúng, từng mâm đúng phần
Dựng **hai bill riêng** (mỗi bill Khách lẻ một bàn, KHÔNG dùng Ghép mâm): **Bàn 6 tổng 30.000đ**, **Bàn 7 tổng 70.000đ**.
1. Trên Timeline bấm **Gộp bill** (hàng "Về Bây giờ") → chọn cả hai bill → mở bill gộp (tiêu đề **"Gộp bill 2 mâm"**).
2. Thanh toán → **Thêm giảm giá** → VNĐ **10000**. Hộp ghi dòng mô tả **"Áp cho cả 2 mâm đang gộp bill."**, xem trước **Giảm: 10.000đ** → **Lưu**.
3. Mong đợi: **Tổng tiền hàng 100.000đ**, **Giảm giá −10.000đ**, **Khách cần trả 90.000đ**; dòng nhỏ bên dưới "Gộp 2 mâm · đóng cả loạt sau khi thu".
4. Bấm **In tạm tính / hoá đơn**. Mong đợi tờ in có **MỘT** dòng giảm giá tổng cho cả bill: **Tổng tiền hàng 100.000** → **Giảm giá  -10.000** → **Khách cần trả 90.000đ** (không có nhãn %, không tách theo mâm).
5. **Dọn — thu tiền** bill gộp (tiền mặt, 90.000đ) → cả Bàn 6 và Bàn 7 tự trống.
6. Xem kết quả ở A04 trong **bài 7**.
- [ ] PASS  [ ] FAIL

---

## Phần 3 — A04, Excel, in báo cáo

### 7. Thu xong → A04 hiện doanh thu = tiền thật + giảm giá đúng
Làm sau bài 1 và 6 (hoặc ngay sau bài 6). Ghi lại **Tổng thực thu** của hôm nay **trước** khi test nếu bạn muốn trừ về sau.
1. Vào `/admin/bills` (hôm nay). Tìm dòng bill **Bàn 1** (bài 1). Mong đợi: cột số tiền **139.500đ**, dòng phụ nhỏ **"Tiền mặt · giảm 15.500đ"** (số tiền thật khách trả, KHÔNG phải 155.000đ).
2. Bấm biểu tượng **Xem bill** của dòng Bàn 1 → ngăn kéo hiện món, trên dòng **Cộng lượt 139.500đ** có dòng xanh **"Giảm giá bill  −15.500đ"**.
   - **In lại sau khi đã thu:** trong ngăn kéo bấm **In lại hoá đơn**. Mong đợi tờ in VẪN có **Tổng tiền hàng 155.000** → **Giảm giá (10%)  -15.500** → **Khách cần trả 139.500đ** (đúng số đã thu, giảm giá không mất sau khi thu).
3. Dòng bill **gộp Bàn 6 + Bàn 7** (bài 6): hiện **MỘT dòng** (nhãn Ghép), số tiền **90.000đ**, phụ **"giảm 10.000đ"**. Mở **Xem bill**: hai lượt, lượt Bàn 6 (30.000đ) có **"Giảm giá bill −3.000đ"**, lượt Bàn 7 (70.000đ) có **"Giảm giá bill −7.000đ"** (10.000 chia theo tỉ lệ 30:70). Cộng hai lượt sau giảm: 27.000đ + 63.000đ = **90.000đ**.
4. Thẻ **Tổng thực thu** đã **tăng đúng 139.500 + 90.000 = 229.500đ** so với trước test (KHÔNG phải 255.000đ), và **Tiền mặt** cũng tăng đúng 229.500đ.
5. Bấm **Xuất Excel**, mở file. Mong đợi:
   - Phần tóm tắt có hai dòng **"Giảm giá (tổng)"** và **"Trong đó giảm giá bill"** — hôm nay ít nhất **25.500đ** (15.500 + 10.000) cho riêng hai bill test.
   - Bảng chi tiết có cột **"Giảm giá bill"**: dòng Bàn 1 ghi **15.500**, dòng gộp Bàn 6+7 ghi **10.000**.
   - Cột **Số tiền** của hai dòng đó là 139.500 và 90.000 (tiền sau giảm).
6. Bấm **In báo cáo cuối ngày** → trên tờ in có dòng **"Giảm giá"** với số tổng giảm giá hôm nay (≥ 25.500đ); doanh thu in ra đã là số sau giảm.
7. Ghi chú đã biết, **không tính FAIL**: ở A04, dòng **Chờ thu** của bill còn mở luôn là số **tạm tính trước giảm giá**; chỉ khi thu xong mới ra số sau giảm (đã nêu ở bài 1 bước 6).
- [ ] PASS  [ ] FAIL

---

## Phần 4 — Nhập bàn có giảm giá vào mâm khác

### 8. Cảnh báo + giảm giá mất
1. Dựng bill **Bàn 8** tổng hàng **50.000đ**, giảm VNĐ **5.000** (Khách cần trả 45.000đ). Dựng bill **Bàn 9** tổng hàng **40.000đ**, KHÔNG giảm giá.
2. Mở bill **Bàn 8** → **Thao tác khác** → ô **"Nhập bàn này vào một mâm khác (gộp cả đơn)"** → chọn mâm đích **Bàn 9**.
3. Mong đợi: hộp thoại **trong app** (nền mờ), tiêu đề **"Nhập Bàn 8 vào mâm khác?"**, dòng chữ **"Giảm giá của bàn này sẽ bị bỏ — đặt lại ở mâm đích."**, hai nút **Huỷ** / **Vẫn nhập**.
4. Bấm **Huỷ** → không có gì thay đổi: Bàn 8 vẫn là bill riêng, vẫn giảm 5.000đ (Khách cần trả 45.000đ).
5. Làm lại bước 2, bấm **Vẫn nhập**. Bảng bill có thể **tự đóng** (Bàn 8 không còn là bill riêng) — nếu vậy **mở lại bill Bàn 9** trên POS. Mong đợi: mâm giờ gồm **Bàn 8 và Bàn 9**, tổng hàng **90.000đ**, **KHÔNG còn giảm giá** (Thanh toán → hàng giảm giá ghi **Thêm giảm giá**, Khách cần trả 90.000đ — giảm 5.000đ cũ biến mất).
6. Đặt lại ở mâm đích: **Thêm giảm giá** → **%** → **10** → **Lưu** → Giảm giá (10%) **−9.000đ**, Khách cần trả **81.000đ**.
7. (Thêm, không bắt buộc) nhập một bàn KHÔNG có giảm giá vào mâm khác thì **không** hiện hộp cảnh báo.
   - **Đã biết, không tính FAIL:** nhân viên chạy bàn nhập bàn vào mâm ở màn `/staff` (Ghép mâm trên điện thoại) thì giảm giá của bàn nguồn **cũng bị bỏ** nhưng **không có hộp cảnh báo** — cảnh báo hiện chỉ có ở POS. Thu ngân nên kiểm lại giảm giá ở mâm đích trước khi thu.
8. **Dọn — bỏ bàn** mâm Bàn 9 + Bàn 8.
- [ ] PASS  [ ] FAIL

---

## Phần 5 — Mini App tab Đơn gọi (cần bản đã deploy ở mục 0.B)

### 9. Khách thấy giảm giá và tạm tính sau giảm
Bỏ qua bài này nếu chưa `zmp deploy` (ghi "chưa test").
> **Cảnh báo — IN PHIẾU THẬT:** Bảo Lương dùng chế độ "thu ngân xác nhận rồi in" — bấm **Xác nhận** lượt khách gọi ở bước 1 sẽ **in PHIẾU BẾP + PHIẾU BÀN ra máy in thật** (và có thể kêu chuông/loa). Trước khi bấm: **báo bếp** đây là đơn test (đừng làm món), hoặc **tắt / rút giấy máy in** bếp. Xong bài nhớ vứt 2 tờ phiếu.

1. **Điện thoại** quét QR **Bàn 10** (bản Development vừa deploy), gọi món tổng **100.000đ** (nên chọn món rẻ, tự tính lại số theo công thức). Thu ngân **Xác nhận** lượt đó trên POS (để món vào bill) — xem cảnh báo in phiếu ở trên.
2. Trên POS: bill Bàn 10 → Thanh toán → giảm **10%** → **Lưu** (Khách cần trả 90.000đ). Không cần thu tiền.
3. Trên điện thoại mở tab **Đơn gọi** (nếu đang mở thì chờ vài giây hoặc thoát vào lại). Mong đợi ở **thẻ đầu tiên**: **Tổng tạm tính 100.000đ**, kế dưới dòng xanh **"Giảm giá  -10.000đ"**, rồi **"Tạm tính sau giảm"** với **90.000đ**.
4. Trên POS bỏ giảm giá (Bỏ giảm giá) → điện thoại mở lại tab Đơn gọi: **không còn** dòng Giảm giá và "Tạm tính sau giảm", chỉ còn **Tổng tạm tính 100.000đ**.
5. (Nếu muốn kiểm bản cũ) mở bằng QR bàn thật (bản cũ chưa deploy lại): bill vẫn đúng như trước, chỉ không hiện dòng giảm giá — không phải lỗi.
6. **Dọn — bỏ bàn** Bàn 10.
- [ ] PASS  [ ] FAIL

---

## Phần 6 — Thu ngân (không phải chủ quán)

### 10. Thu ngân làm được hết các thao tác giảm giá
Đăng xuất chủ quán, **đăng nhập POS bằng tài khoản thu ngân** (cookie dùng chung theo địa chỉ web nên chỉ đăng nhập một vai tại một thời điểm).
1. Dựng bill **Bàn 11** tổng hàng **100.000đ**. Thanh toán → **Thêm giảm giá** → **%** → **10** → **Lưu**. Mong đợi: lưu được, không báo "Không có quyền"; **Khách cần trả 90.000đ**.
2. Sửa sang VNĐ **20.000** → **Lưu** → **80.000đ**.
3. **Bỏ giảm giá** → **Khách cần trả 100.000đ**. Đặt lại **10%** → **90.000đ**.
4. **In tạm tính / hoá đơn** → tờ in có dòng **Giảm giá (10%) -10.000** và **Khách cần trả 90.000đ**.
5. **Dọn — bỏ bàn** Bàn 11. (Không cần thu tiền thật. Muốn kiểm cả việc thu thì thu bill này, nhưng sẽ cộng 90.000đ vào doanh thu thật.)
- [ ] PASS  [ ] FAIL

---

## Phần 7 — Không bắt buộc

### 11. Phiên hết hạn không giảm giá được
Không dựng bằng tay được trong buổi test (phải chờ phiên mở quá 6 giờ không ai thu — job tự đóng, bill còn nợ). **Chỉ làm khi trên POS tình cờ đang có sẵn một bàn hết hạn còn nợ** (trên POS hoặc dòng "Hết hạn · còn nợ" ở A04). Nếu không có, ghi "không bắt buộc, bỏ qua" — đã có test tự động và SQL (`docs/testing/chuyen-ban-giam-gia/sql/gg-verify.sql`).
1. Mở bill bàn hết hạn → Thanh toán.
2. Mong đợi: hàng Giảm giá **không có** nút bấm, thay bằng dòng chữ **"Phiên hết hạn không giảm giá được"**.
3. **KHÔNG thu tiền** bill này (là nợ thật của quán) — chỉ xem rồi đóng.
- [ ] PASS  [ ] FAIL  [ ] Bỏ qua (không có phiên hết hạn)

---

## Phần 8 — Không cho thu lẻ từng lượt của bàn trả sau (mig 110)

### 12. Bàn đang mở chỉ thu được cả bàn ở POS
Lý do: một lượt thu riêng trước khi chốt bill làm hoá đơn in "Khách cần trả" lớn hơn số POS thu (cả khi không giảm giá). Quy tắc đã chốt 2026-10-13: bàn trả sau thu **cả bàn một lần** ở POS → Thanh toán.
**Không có đường bấm trên giao diện để thử** — mọi nút thu từng lượt đã ẩn cho lượt thuộc bàn (A04 ngăn kéo Xem bill không có "Đã nhận tiền"/"Hoàn tất" cho lượt của bàn; màn bếp chỉ có nút "Đã nhận tiền" cho đơn khách chuyển khoản của quán trả trước). Server chặn thêm một lớp, đã kiểm bằng SQL tự động `docs/testing/chuyen-ban-giam-gia/sql/gg2-verify.sql` (chạy trong giao dịch rồi ROLLBACK, không để lại dữ liệu). Bài này chỉ cần nhìn:
1. Dựng bill **Bàn 12** (Khách lẻ, 1 món rẻ). Vào `/admin/bills` → dòng **Chờ thu** của Bàn 12 → **Xem bill**. Mong đợi: lượt của Bàn 12 **không có** nút "Đã nhận tiền" / "Hoàn tất" riêng; chỉ có khung vàng "Thu **cả bàn một lần**" với hai nút **Đã nhận tiền mặt** / **Đã nhận chuyển khoản** (= thu cả bill như POS).
2. Không bấm thu. **Dọn — bỏ bàn** Bàn 12.
3. Nếu có cách nào khác bấm được "đã nhận tiền" cho MỘT lượt của bàn đang mở (vd bản cũ còn mở ở máy khác): mong đợi báo lỗi **"Bàn trả sau thu cả bàn một lần ở POS (Thanh toán)"** và lượt đó vẫn chưa thu.
- [ ] PASS  [ ] FAIL

---

## Phần 9 — Thu tiền ngoài POS cũng trừ giảm giá (vá sau review cả nhánh)

### 13. A04 và màn nhân viên hiện đúng số SAU giảm giá
Lý do: thu ở ngăn kéo A04 hoặc `/staff/tables` thì server vẫn trừ giảm giá đặt ở POS, nhưng trước đây hai chỗ này hiện số TRƯỚC giảm → thu ngân thu đủ, báo cáo ghi ít hơn, két lệch. **Bài này KHÔNG thu tiền thật** — chỉ xem số rồi bấm Huỷ/đóng.
1. Dựng bill **Bàn 12** (Khách lẻ, 2 món, ví dụ tổng 100.000đ). POS → Thanh toán → Giảm giá **10%** → Lưu. Mong đợi POS: Khách cần trả **90.000đ**. Đóng màn Thanh toán (KHÔNG thu).
2. `/admin/bills` → dòng **Chờ thu** Bàn 12 → **Xem bill** → bấm **Đã nhận tiền mặt**. Mong đợi hộp xác nhận ghi: **"Đã nhận 90.000đ (tạm tính 100.000đ, đã trừ giảm giá 10.000đ) bằng TIỀN MẶT…"**. Bấm **Huỷ** (Cancel) — KHÔNG thu.
3. Mở `/staff/tables` bằng tài khoản chủ quán/thu ngân. Mong đợi thẻ Bàn 12 hiện **90.000đ**. Bấm **Thu tiền & đóng bàn** → tiêu đề "Thu **90.000đ** — Bàn 12", có dòng nhỏ **"Tiền hàng 100.000đ · Giảm giá −10.000đ (đặt ở POS)"**. Đóng tấm (KHÔNG bấm Tiền mặt/Chuyển khoản).
4. Dọn: POS → Giảm giá → **Bỏ giảm giá**, rồi **Bỏ bàn** Bàn 12.
- [ ] PASS  [ ] FAIL

---

## Sau khi PASS
Merge nhánh vào `main` + push để Vercel deploy admin-web. Mini App đã `zmp deploy` ở mục 0.B (nhớ deploy bản **Testing** nếu muốn release thật cho khách, thay vì Development; Zalo giới hạn số lần deploy/tháng). Nhớ ghi lại 229.500đ doanh thu test (bài 1 + bài 6) để đối chiếu báo cáo.
