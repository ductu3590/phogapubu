# Báo cáo — giao diện mới (biểu đồ, % so với kỳ trước)

Trang **Báo cáo** (`/admin/reports`) được dựng lại: thẻ số có **% so với kỳ trước**, biểu đồ vẽ tay (donut, vùng, thác nước), dải tóm tắt, xếp hạng. **Không đổi RPC, không đổi migration, không đổi cách tính tiền** — chỉ đổi cách hiển thị. Nên mọi con số tổng phải y hệt trước đây.

Spec: `docs/superpowers/specs/2026-11-16-bao-cao-chuyen-nghiep-design.md` · Mockup: `docs/superpowers/specs/2026-11-16-bao-cao-mockup.html` (mở bằng trình duyệt; dấu "MỚI" và viền nét đứt chỉ có trong mockup, trang thật không có).

## Trước khi test

- Quán: **Bia lẩu Bảo Lương**. Cần dữ liệu **hôm nay** và **hôm qua** đều có bill đã thu, và vài ngày trong tháng này.
- Hai tài khoản: **chủ quán** (thấy cả 8 tab) và **thu ngân** (chỉ thấy 4 tab Bán hàng). Đăng nhập từng vai một (cookie dùng chung theo trình duyệt).
- Vào Báo cáo bằng thanh icon bên trái, mục **Báo cáo**.
- Ghi sẵn ra giấy: **Tổng thực thu** trên trang **Hoá đơn** của hôm nay, hôm qua, và tháng này (dùng cho Test 7).

---

# Test 1 — Khung trang (chủ quán)

1. Đầu trang có chữ **Báo cáo**, dòng phụ ghi kỳ đang xem. Bên phải có **ô ngày** (icon lịch + ngày/khoảng ngày) và nút cam **Xuất Excel**.
   - Đạt: nút Xuất Excel màu cam đặc (không còn là nút viền).
2. Thanh kỳ có 6 nút: Hôm nay, Hôm qua, 7 ngày, Tháng này, Tháng trước, Tuỳ chọn. Nút đang chọn nền cam nhạt, chữ cam.
3. Thanh tab là **một khung trắng**, hai nhóm có nhãn nhỏ **BÁN HÀNG** (Theo món, Theo danh mục, Theo giờ, Món huỷ) và **TÀI CHÍNH** (Doanh thu, Thu chi, Lãi lỗ, Công nợ), mỗi tab có icon. Tab đang chọn nền cam, chữ trắng.
4. Bấm lần lượt cả 8 tab: tab nào cũng hiện, **không có chữ `NaN`, `undefined`, `Infinity`** ở đâu cả.
5. Bấm **ô ngày** (hoặc nút Tuỳ chọn): hiện form chọn ngày Từ / Đến. Chọn một khoảng 3 ngày, áp dụng: trang tải lại đúng khoảng, ô ngày ghi đúng khoảng.
6. Bấm **Xuất Excel** ở tab Theo món: tải được file, mở ra đúng số liệu của kỳ đang xem. Thử thêm ở tab Doanh thu hoặc Thu chi. Tab nào chưa có Excel thì nút ẩn như trước.
7. **Thu ngân**: đăng nhập tài khoản thu ngân, vào Báo cáo.
   - Đạt: chỉ có 4 tab Bán hàng, **không có nhãn TÀI CHÍNH**, không có 4 tab tài chính.
   - Gõ tay `/admin/reports?tab=pnl` lên thanh địa chỉ: không xem được Lãi lỗ (về tab Bán hàng hoặc báo không có quyền).

# Test 2 — % so với kỳ trước

Mỗi thẻ số có chip % (xanh ↑ tăng tốt, đỏ ↓ giảm) và chữ **so với …** ngay sau.

1. **Hôm nay**, tab Theo món: chip ghi **so với hôm qua**. Hôm nay mới bán nửa ngày thì chip đỏ ↓ là **bình thường** (so với cả ngày hôm qua — anh Tú đã chốt vậy).
2. **Hôm qua**: ghi **so với hôm kia**.
3. **7 ngày**: ghi **so với 7 ngày trước**.
4. **Tháng này**: ghi **so với tháng trước**. Ví dụ hôm nay là mùng 16 thì so với **16 ngày đầu** của tháng trước, không phải cả tháng trước.
5. **Tháng trước**: ghi **so với tháng trước** (tức tháng liền trước nữa, trọn tháng).
6. **Tuỳ chọn** (chọn 5 ngày): ghi **so với kỳ trước**; kỳ trước là 5 ngày liền ngay trước đó.
7. Tính tay một thẻ: lấy Doanh thu kỳ này và kỳ trước (chọn đúng kỳ trước ở bước 1–6 rồi đọc số), % = (nay − trước) ÷ trước. Đạt: khớp, làm tròn 1 chữ số thập phân.
8. **Màu đảo**: thẻ Giảm giá (tab Bán hàng), Chi phí hoạt động (Lãi lỗ), Nợ cuối kỳ (Công nợ), 3 thẻ ở Món huỷ — **tăng thì đỏ, giảm thì xanh** (mũi tên vẫn theo chiều số thật: tăng là ↑).
9. **Kỳ trước = 0đ**: chọn một kỳ mà kỳ liền trước không có bill nào (ví dụ Tuỳ chọn 1 ngày đầu tiên quán có dữ liệu, hoặc một kỳ trước ngày quán bắt đầu bán).
   - Đạt: thẻ số **không có chip %**, không chữ "Infinity%" hay "NaN%". Số vẫn hiện bình thường.
10. Hai kỳ **bằng nhau** (nếu gặp, ví dụ cùng 0 bill): chip xám **— 0%**.
11. Tab **Doanh thu**, bấm **Tháng** (12 tháng): các thẻ **không có** chữ "so với". Bấm lại **Ngày**: có chip như bình thường.
12. Tab **Công nợ**: thẻ **Nợ cuối kỳ** ghi **so với đầu kỳ**, đúng bằng so với thẻ Nợ đầu kỳ cùng trang.
13. Tab **Thu chi**: 2 thẻ quỹ (Tiền mặt, Ngân hàng) có chip; tab **Lãi lỗ**: 4 thẻ có chip. Quỹ hoặc lãi ròng của kỳ trước **âm hay 0** thì không hiện chip (đúng yêu cầu bước 9).

# Test 3 — Bán hàng, 3 tab (Theo món, Theo danh mục, Theo giờ)

**Theo món**
1. 4 thẻ: Doanh thu, Tiền món, Giảm giá, SL bán. **Tiền món − Giảm giá = Doanh thu**. Không có banner vàng "Chênh lệch …".
2. Khối **Món bán chạy**: 5 món, huy hiệu hạng 1→5, tên, "x phần · danh mục", tiền và %. Bấm **Theo SL**: danh sách xếp lại theo số lượng; bấm **Theo tiền**: xếp lại theo tiền.
3. Khối **Tỉ trọng theo danh mục**: donut, tâm ghi tổng SL "MÓN BÁN RA". Chú giải cộng lại 100%. Nhận xét cam ghi danh mục đứng đầu và % — đúng với danh mục có tiền lớn nhất trong bảng.
4. Quán có **hơn 5 danh mục** (hoặc món không còn danh mục): donut chỉ 5 lát + 1 lát **Khác**, không có hai dòng "Khác".
5. Bảng **Tất cả món**: lọc theo danh mục, đổi sắp xếp vẫn chạy; cột % có thanh nhỏ; dòng **Tổng** khớp thẻ số.
6. Dòng "Chưa gồm n bàn đang mở" (nếu đang có bàn chưa thu) vẫn còn.

**Theo danh mục**
7. 4 thẻ như trên. Danh sách danh mục có **chấm màu + thanh tỉ lệ**; bấm một danh mục mở/gập danh sách món bên trong.
8. Bên phải donut, tâm ghi tổng tiền món rút gọn (ví dụ "18,1tr"). Màu chấm trong danh sách trùng màu lát donut.

**Theo giờ**
9. Biểu đồ vùng **hai đường**: Tiền món (cam, trục trái) và Lượt gọi (xanh lá, trục phải). Điểm cao nhất có vạch đứng và nhãn số.
10. Dải tóm tắt 4 ô: **Giờ cao điểm**, **Lượt gọi đông nhất**, **Tổng lượt gọi**, **TB tiền / lượt gọi**. Giờ cao điểm trùng giờ có tiền lớn nhất trong bảng.
11. Bảng giờ: dòng giờ cao nhất có nhãn **Cao điểm**, cột thanh so với giờ cao nhất.
12. Kỳ **không có bill** (ví dụ Hôm nay lúc quán chưa bán): 4 thẻ hiện **0đ / 0**, các khối biểu đồ thay bằng **"Chưa có dữ liệu trong kỳ này"**, không lỗi, không NaN.

# Test 4 — Món huỷ và Doanh thu

**Món huỷ** (cần một ngày có bỏ món, tặng món, giảm SL; nếu chưa có, làm vài thao tác trên POS trước)
1. 3 thẻ: Tiền bỏ, Tiền tặng, Giảm SL, mỗi thẻ ghi chú "n lần …" và chip % (màu đảo: tăng là đỏ).
2. **Món bị huỷ nhiều nhất**: top 4, gộp cả bỏ + tặng + giảm SL, theo tổng số lượng.
3. **Lý do hay gặp**: đếm theo lý do; lần nào không ghi lý do thì gom thành **"Không ghi lý do"**.
4. Bảng chi tiết bên dưới giữ nguyên, nhãn loại Bỏ / Tặng / Giảm SL có màu.

**Doanh thu — chế độ Ngày** (chọn Tháng này)
5. 4 thẻ: Doanh thu, Số bill, TB / bill, Giảm giá. Có chip % so với tháng trước.
6. Biểu đồ vùng hai đường (doanh thu + số bill) theo ngày. Dải 3 ô: **Ngày cao nhất**, **TB / ngày**, **Ngày thấp nhất** (chỉ tính ngày có bill). Đối chiếu với bảng: ngày cao nhất đúng là ngày có tiền lớn nhất, dòng đó có nhãn **Cao nhất**.
7. **Cơ cấu thanh toán**: donut **Tiền mặt (xanh lá), Chuyển khoản (xanh trời), Ghi nợ (hổ phách)**; có thêm **Ví / khác (tím)** chỉ khi có tiền loại đó. Tổng % = 100.
8. Bấm **Tháng**: biểu đồ đổi sang 12 tháng, nhãn dải tóm tắt đổi thành "Tháng cao nhất / TB / tháng / Tháng thấp nhất", **không còn chip so sánh** (đã kiểm ở Test 2 bước 11).

# Test 5 — Thu chi, Lãi lỗ, Công nợ (chủ quán)

**Thu chi**
1. 2 thẻ quỹ **Tiền mặt** và **Ngân hàng / ví**: số **Chênh lệch** to — xanh nếu ≥ 0, **đỏ nếu âm**; thanh vào (xanh) / ra (đỏ nhạt); số Vào, Ra khớp bảng bên dưới.
2. Khối **Tiền ra đi đâu**: mỗi hạng mục một thanh xếp chồng Tiền mặt + Chuyển khoản, sắp theo tổng. Có ghi chú **"Không gồm chuyển quỹ"** và **không có dòng chuyển quỹ** trong khối này (bảng Tiền ra bên dưới vẫn có đủ).
3. Kỳ không có khoản chi nào: khối **Tiền ra đi đâu ẩn hẳn**, không lỗi.

**Lãi lỗ**
4. 4 thẻ: Doanh thu thuần, Lãi gộp, Chi phí hoạt động, Lãi ròng; Lãi ròng có thêm **Biên x%** (= Lãi ròng ÷ Doanh thu thuần, tự tính tay thử).
5. **Thác nước 6 cột**: Doanh thu → −Giá vốn → Lãi gộp → −Chi phí hoạt động → −(Hàng huỷ − Thu nhập khác) → Lãi ròng. Cột cuối bằng số ở thẻ Lãi ròng.
6. Chọn kỳ mà **chi phí lớn hơn lãi gộp** (ví dụ ngày đầu tháng có tiền thuê nhà/điện): Lãi ròng **âm** → cột xuống **dưới trục 0**, không tràn khỏi khung; dòng Lãi ròng trong bảng dọc **nền đỏ nhạt** (còn lãi thì nền xanh nhạt).
7. Donut **Chi phí hoạt động** theo hạng mục (top 4 + Khác) và khối xám **Không tính vào lãi lỗ**. Hai banner cảnh báo giá vốn (nếu có) vẫn hiện đầu tab.

**Công nợ**
8. 4 thẻ: **Nợ cuối kỳ** (ghi chú "n khách đang nợ"), Nợ đầu kỳ, Phát sinh, Đã thu (ghi chú **"Thu được x%"** = Đã thu ÷ (Đầu kỳ + Phát sinh)).
9. **Tuổi nợ**: thanh ngang 3 màu (xanh 0–7 ngày, hổ phách 8–30, đỏ trên 30) và 3 ô số; cộng 3 ô = Nợ cuối kỳ.
10. **Nợ nhiều nhất**: top 4 khách; bấm tên khách mở `/admin/debts?customer=…` đúng khách đó.
11. Bảng khách: bill nợ cũ nhất quá 30 ngày (tính đến ngày cuối kỳ) có nhãn đỏ **"n ngày"**.

# Test 6 — Điện thoại (375px)

Mở bằng điện thoại thật hoặc F12 → chế độ điện thoại, rộng **375px**. Làm một lượt với **thu ngân** (4 tab Bán hàng) và một lượt với **chủ quán** (cả 8 tab).

1. Trên **cả 8 tab (chủ quán) và 4 tab (thu ngân)**: **không cuộn ngang trang** (vuốt sang trái/phải không dịch nội dung; thước cuộn ngang dưới cùng không có).
2. Thanh tab tự **xuống dòng**, không giấu tab; nhãn BÁN HÀNG / TÀI CHÍNH **ẩn** trên điện thoại.
3. Thẻ số xếp **2 cột**, số không bị cắt hay tràn ra ngoài thẻ, kể cả số tiền lớn (hàng chục triệu).
4. Bảng chuyển thành **thẻ** (như trước đây), không bị tràn ngang.
5. Biểu đồ (vùng, donut, thác nước) co vừa chiều rộng màn hình, đọc được nhãn; không chữ đè nhau thành mảng đen.
6. Thanh kỳ (6 nút) và ô ngày + nút Xuất Excel xuống dòng gọn, bấm được bằng ngón tay.

# Test 7 — Số liệu khớp trước và sau (quan trọng nhất)

Giao diện đổi nhưng **số phải giữ nguyên**. Đối chiếu với các nguồn không thuộc giao diện mới.

1. **Hôm nay**, tab Theo món: **Doanh thu** = **Tổng thực thu** của trang **Hoá đơn** hôm nay (đã ghi ở phần "Trước khi test").
2. Lặp lại với **Hôm qua** và **Tháng này**: Doanh thu ở Báo cáo = Tổng thực thu trang Hoá đơn cùng kỳ.
3. Bấm **Xuất Excel** (tab Theo món, kỳ Tháng này): trong file, tổng Doanh thu / Tiền món / Giảm giá **bằng đúng** thẻ số trên màn hình.
4. Đổi qua 3 tab Theo món, Theo danh mục, Theo giờ cùng một kỳ: **Doanh thu và Tiền món giống nhau ở cả 3 tab**.
5. Tab Doanh thu (Ngày) cùng kỳ Tháng này: **Doanh thu bằng** tab Theo món cùng kỳ; **Số bill** bằng số bill đã thu trên trang Hoá đơn.
6. Tab Lãi lỗ: **Doanh thu thuần** khớp tab Doanh thu cùng kỳ (sau khi trừ phần chưa tính theo mô tả trên màn hình); Lãi ròng ở thẻ = dòng Lãi ròng trong bảng = cột cuối thác nước.
7. Tab Công nợ: Nợ cuối kỳ = Nợ đầu kỳ + Phát sinh − Đã thu; so với trang **Công nợ** (`/admin/debts`) hôm nay: tổng nợ hiện tại khớp.
8. Banner vàng "Chênh lệch …" **không xuất hiện** ở tab Bán hàng cùng kỳ (nếu xuất hiện: ghi lại kỳ + số hiển thị).

---

Ghi kết quả: PASS / FAIL từng bài. FAIL thì ghi bài số mấy, kỳ nào, số thấy trên màn hình và số kỳ vọng. Chụp màn hình giúp càng tốt.
