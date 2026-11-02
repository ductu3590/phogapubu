# MEVO POS so với KiotViet F&B — khoảng trống tính năng cho Yên Garden

> Ngày khảo sát: 2026-11-02 · Nguồn: tài khoản demo KiotViet F&B (`fnb.kiotviet.vn`, phiên bản 26.10.37), màn Quản lý + màn Thu ngân · Đối chiếu với code MEVO nhánh `main` (mig tới 103).
> Bối cảnh: **Yên Garden** — nhà hàng sân vườn / bia garden, chọn MEVO thay vì KiotViet.

## 1. Tóm tắt nhanh

KiotViet là **phần mềm quản lý bán hàng toàn diện** (kho, giá vốn, sổ quỹ, nhân sự, thuế, hoá đơn điện tử). MEVO mạnh ở **khách tự gọi món trong Zalo + luồng bàn/mâm/đặt bàn**, nhưng phần **"tiền & hàng" sau quầy** còn mỏng.

Với một quán bia garden, những chỗ sẽ bị so sánh ngay trong tuần đầu là:

1. **Giảm giá / phụ thu trên bill** và **sửa giá dòng món** tại quầy (MEVO chỉ có Tặng/Bỏ món và voucher qua Mini App).
2. **Thanh toán nhiều phương thức một bill** (một phần tiền mặt, một phần chuyển khoản) và **tách bill theo món**.
3. **Chuyển bàn** khi khách đổi chỗ (mưa, đông người) — MEVO có ghép mâm/thêm bàn nhưng chưa có thao tác "dời cả bàn sang bàn khác".
4. **Mở ca / kết ca** và **khung giờ tính doanh thu** — quán bia mở quá 0h, báo cáo theo ngày lịch sẽ cắt đôi ca tối.
5. **In tách bar / bếp** — đồ uống ra máy in quầy bia, đồ ăn ra máy in bếp.
6. **Tồn kho hàng đóng chai** (bia lon/chai/thùng, thuốc lá, nước ngọt) và **sổ quỹ thu/chi**.

## 2. Bản đồ tính năng KiotViet F&B (đã xem trực tiếp)

### 2.1 Màn Quản lý — menu chính

| Menu | Mục con |
|---|---|
| Tổng quan | Doanh thu hôm nay (so hôm qua), số đơn, tỉ lệ phủ bàn, doanh thu thuần 7 ngày theo giờ/ngày/thứ, lượng khách theo giờ, hoạt động gần đây |
| Thực đơn | Món · Ghi chú món (lấy chọn) · Thiết lập bảng giá |
| Kho hàng | Danh sách hàng hoá · Kiểm kho · Xuất dùng nội bộ · Xuất huỷ · Nhập hàng · Hoá đơn đầu vào · Trả hàng nhập · Nhà cung cấp |
| Phòng/Bàn | Danh sách phòng bàn · Gọi món qua mã QR |
| Đơn hàng | Hoá đơn · Trả hàng · Đối tác giao hàng |
| Khách hàng | Khách hàng · Chăm sóc khách hàng qua Zalo |
| Nhân viên | Danh sách · Lịch làm việc · Bảng chấm công · Bảng lương · Bảng hoa hồng · Thiết lập nhân viên |
| Sổ quỹ | Phiếu thu / phiếu chi |
| Báo cáo | Cuối ngày · Bán hàng · Hàng hoá · Khách hàng · Nhà cung cấp · Nhân viên · Kênh bán hàng · Tài chính |
| Bán Online | Website bán hàng · Bán hàng Zalo · Bán hàng Facebook |
| Thuế & Kế toán | Thuế & kế toán · Hoá đơn điện tử |

Loại món khi tạo mới: **Món · Topping · Dịch vụ (tính giờ) · Combo/Buffet**.

### 2.2 Thiết lập cửa hàng (các công tắc đáng chú ý)

- **Thực đơn & kho**: thực đơn đa ngôn ngữ + in hoá đơn song ngữ; tag món (bán chạy, nên thử, món mới); đơn vị tính quy đổi (lon / lốc / thùng); thuộc tính size; giá vốn cố định hoặc bình quân; sản xuất (định lượng nguyên liệu → thành phẩm); chi phí nhập hàng.
- **Đơn hàng**: bán khi hết tồn; báo bếp khi hết tồn; **hết món tạm thời ngay trên màn bán hàng**; **tạo món nhanh khi bán**; cho phép sửa thời gian giao dịch; **làm tròn thời gian dịch vụ tính giờ theo block 15 phút**; số liên in hoá đơn/tạm tính theo chi nhánh; in tạm tính; **trả món (huỷ một phần món đã báo bếp)**; **thu khác (phí dịch vụ, phí giao hàng)**; xuất file hoá đơn điện tử VNPT.
- **Bar/Bếp**: máy in phiếu chế biến / tem nhãn / phiếu huỷ món theo khu bar–bếp; danh mục lý do huỷ món.
- **Đặt bàn**: màn Lễ tân, nhắc lịch khách đến trước N giờ.
- **Khách hàng**: tích điểm (quy đổi thanh toán); khuyến mại theo giá trị đơn.
- **Báo cáo**: **khung giờ tính doanh thu tuỳ chỉnh** (không bắt buộc 00:00–24:00); **kết ca** (thu ngân mở ca / kết ca).
- **Tiện ích**: VietQR tích hợp — **tự báo tiền về và xác nhận giao dịch trên màn thu ngân**, đọc số tiền qua loa; giao hàng (đối tác, thu hộ); gửi Zalo ZNS.
- **Cửa hàng**: người dùng + **vai trò tuỳ chỉnh quyền**; nhiều chi nhánh; **khoá sổ** (không sửa giao dịch trước ngày khoá); lịch sử thao tác.
- **Thiết bị**: **màn hình phụ hướng về khách** (ảnh quảng cáo khi chờ, danh sách món + tiền khi order); cân điện tử.

### 2.3 Màn Thu ngân (POS)

- Ba tab trái: **Phòng bàn** (lọc theo khu/lầu, lọc Đang dùng / Còn trống, ô "Mang về" và "Giao đi") · **Thực đơn** (lưới ảnh theo nhóm) · **Giao đi**.
- Ô tìm món (F3), **chế độ nhập nhanh** (⚡), **tạo món nhanh** (+), nhiều đơn mở song song dạng tab, phím tắt F-key.
- Dòng món: +/- số lượng, ghi chú / món thêm (topping), **bấm vào giá → sửa giá bán, giảm giá dòng theo VNĐ hoặc %, chọn bảng giá**.
- Thanh dưới: chọn nhân viên phục vụ, ghi chú đơn, **lịch sử báo bếp**, **tách / ghép đơn** (ghép sang bàn khác hoặc tách một phần sang đơn mới).
- Nút **Thông báo (F10)** = báo bếp; **Thanh toán (F9)**.
- Màn thanh toán: giảm giá cả đơn, **nút gợi ý mệnh giá tiền khách đưa** (155k / 156k / 160k / 200k / 500k), Tiền mặt / Chuyển khoản / Thẻ, **"Kết hợp phương thức"** (chia một bill ra nhiều phương thức), **"Thanh toán từng phần"** (trả một số món, phần còn lại để lại bàn), sửa ngày giờ giao dịch.
- Menu ☰: Quản lý · Nhà bếp · **Lễ tân** · **Màn hình phụ** · Báo cáo cuối ngày · **Lập phiếu thu** · **Chọn hoá đơn trả hàng** · Danh sách đặt bàn · Thiết lập giá · Món có sẵn trong đơn · Phím tắt.
- Tuỳ chọn hiển thị: hiện khách trên ô bàn; ghi chú bàn/đơn trên ô bàn; nhận thông báo đơn QR; hiện thành phần combo; hiện topping khi thêm món; tự điền tiền khách trả; **tự động thanh toán khi chuyển khoản thành công**; **đọc số tiền chuyển khoản qua loa**; hình thức thanh toán mặc định; **báo bếp khi thanh toán**.
- Có **đồng bộ dữ liệu offline** và **ứng dụng Thu ngân bản desktop**.

> Chưa mở được (mở cửa sổ riêng, không nằm trong phiên khảo sát): màn Nhà bếp, Lễ tân, chi tiết từng báo cáo, chi tiết Khuyến mại. Các mục này chỉ ghi theo tên menu/thiết lập.

## 3. Đối chiếu với MEVO

Ký hiệu: ✅ có tương đương · 🟡 có một phần · ❌ chưa có · ⭐ MEVO hơn

### 3.1 Bán hàng tại quầy

| Tính năng | KiotViet | MEVO hiện tại | Đánh giá |
|---|---|---|---|
| Sơ đồ bàn theo khu, lọc trống/đang dùng | ✅ | Sơ đồ + Timeline theo khu, màu trạng thái | ✅ |
| Nhiều bàn một bill / gộp bill | Ghép đơn | Mâm (N bàn), gộp bill N mâm trong 1 giao dịch | ⭐ |
| **Chuyển bàn** (dời cả phiên sang bàn khác) | Ghép/tách đơn sang bàn khác | Chỉ thêm bàn vào mâm, nhập phiên vào mâm | 🟡 |
| **Tách bill theo món** | Thanh toán từng phần, tách đơn | Tách theo mâm (mâm = bill con) | 🟡 |
| **Giảm giá cả bill (VNĐ / %)** | ✅ | Chỉ voucher qua Mini App | ❌ |
| **Sửa giá / giảm giá từng dòng** | ✅ | Tặng (0đ) / Bỏ / sửa số lượng, có lý do | 🟡 |
| **Phụ thu / phí dịch vụ / thu khác** | ✅ | — | ❌ |
| **Thanh toán kết hợp nhiều phương thức** | ✅ | Một `payment_instrument` cho cả bill | ❌ |
| Gợi ý mệnh giá tiền khách đưa | ✅ | Ô nhập tiền + tiền thối | 🟡 |
| VietQR động + tự xác nhận tiền về + đọc loa | ✅ | Hoãn (cột `stores.bank_*` dựng sẵn) | ❌ |
| Tạo món nhanh khi bán | ✅ | Ghi món tay (`pos_add_manual_items`) | ✅ |
| Hết món tạm thời trên màn bán | ✅ | Tạm hết (thu ngân bật/tắt được) | ✅ |
| Huỷ món đã báo bếp có lý do | ✅ + danh mục lý do | Bỏ / Tặng kèm lý do + audit | ✅ |
| Trả hàng (hoàn tiền bill đã thu) | ✅ | — | ❌ |
| Phím tắt bàn phím, chế độ nhập nhanh | ✅ | — | ❌ |
| Offline + app desktop | ✅ | Backlog "POS offline queue" | ❌ |
| Khoá màn hình thu ngân | Chưa thấy | PIN 4 số | ⭐ |

### 3.2 Bếp, in ấn, thiết bị

| Tính năng | KiotViet | MEVO | Đánh giá |
|---|---|---|---|
| Màn hình bếp | ✅ | `/kitchen` realtime + loa đọc đơn TTS | ✅ |
| **In tách theo khu bar / bếp** (món nào ra máy nào) | ✅ | Một phiếu bếp chung | ❌ |
| Phiếu huỷ món xuống bếp | ✅ | — | ❌ |
| Tem nhãn | ✅ | — | ❌ (ít cần cho bia garden) |
| In hoá đơn / tạm tính / chọn số liên | ✅ | In ngầm 80mm, phiếu bếp + phiếu bàn 2 liên | ✅ |
| **Màn hình phụ hướng về khách** | ✅ | — | ❌ |
| Cân điện tử | ✅ | — | Không cần |

### 3.3 Thực đơn & kho

| Tính năng | KiotViet | MEVO | Đánh giá |
|---|---|---|---|
| Món, nhóm, ảnh, mã món | ✅ | SKU tự sinh theo danh mục | ✅ |
| Topping | ✅ | ✅ | ✅ |
| Size / thuộc tính | ✅ | Biến thể giá (Tháp / Ca / Cốc) | ✅ |
| Tag món (bán chạy…) | ✅ | Nhãn best_seller / signature | ✅ |
| **Combo / mâm set** | ✅ | — | ❌ |
| Dịch vụ tính giờ (block 15') | ✅ | — | Không cần (trừ khi có karaoke/bi-a) |
| **Bảng giá nhiều mức** (giá lễ, giá khu VIP) | ✅ | — | ❌ |
| Thực đơn đa ngôn ngữ / hoá đơn song ngữ | ✅ | — | ❌ (thấp) |
| **Tồn kho, nhập hàng, kiểm kho, nhà cung cấp** | ✅ | — | ❌ |
| **Đơn vị tính quy đổi (lon ↔ thùng)** | ✅ | — | ❌ |
| Định lượng nguyên liệu, giá vốn, lợi nhuận | ✅ | — | ❌ |

### 3.4 Khách hàng, khuyến mại, kênh bán

| Tính năng | KiotViet | MEVO | Đánh giá |
|---|---|---|---|
| Khách tự gọi món qua QR | Web QR (phải bật riêng) | **Zalo Mini App** — không cài, lấy được UID/SĐT | ⭐ |
| Thanh toán trong app khách | Chưa thấy | Zalo Checkout (ví / chuyển khoản) | ⭐ |
| Đặt bàn | Màn Lễ tân, nhắc lịch | Khách tự đặt qua Zalo + đặt món trước + Timeline POS | ⭐ |
| Gọi nhân viên từ bàn | Có "yêu cầu từ QR gọi món" (chưa xem chi tiết) | Nút chuông, chặn spam 3 phút, 6 loại | ✅ |
| Vòng quay may mắn | — | ✅ (server quyết định) | ⭐ |
| **Danh sách khách, lịch sử mua, công nợ** | ✅ | Có UID/SĐT trên đơn, chưa có trang khách | ❌ |
| **Tích điểm đổi thưởng** | ✅ | — | ❌ |
| **Khuyến mại theo giờ / theo giá trị đơn / mua X tặng Y** | ✅ | Voucher (spin, shipper) | 🟡 |
| ZNS chăm sóc khách | ✅ | Có hạ tầng, bị chặn gói OA | 🟡 |
| Giao hàng qua đối tác | ✅ | Mang về / ship tự giao | 🟡 |

### 3.5 Tiền, nhân sự, báo cáo, quản trị

| Tính năng | KiotViet | MEVO | Đánh giá |
|---|---|---|---|
| Dashboard tổng quan (hôm nay so hôm qua, theo giờ) | ✅ | Trang Hoá đơn & Báo cáo theo ngày | 🟡 |
| **Mở ca / kết ca thu ngân** | ✅ | Hoãn ("ca làm việc để sau") | ❌ |
| **Khung giờ tính doanh thu tuỳ chỉnh** | ✅ | Cố định 00:00 giờ VN | ❌ |
| Báo cáo cuối ngày, xuất Excel, in 80mm | ✅ | ✅ (A04) | ✅ |
| **Báo cáo món bán chạy / theo giờ / theo nhân viên / theo bàn** | ✅ | — | ❌ |
| **Sổ quỹ (phiếu thu / chi)** | ✅ | — | ❌ |
| Nhân viên: lịch, chấm công, lương, hoa hồng | ✅ | Chỉ tài khoản + vai trò | ❌ |
| **Vai trò tuỳ chỉnh quyền** | ✅ | 4 vai trò cố định (chủ / thu ngân / phục vụ / MEVO) | 🟡 |
| Lịch sử thao tác, khoá sổ | ✅ | Audit trên bill (bỏ/tặng/sửa SL) | 🟡 |
| Nhiều chi nhánh | ✅ | Một quán = một store | ❌ (chưa cần) |
| Hoá đơn điện tử, thuế | ✅ | — | ❌ (theo nhu cầu hộ kinh doanh) |

## 4. Đề xuất lộ trình cho Yên Garden

Nguyên tắc: **không đua làm ERP như KiotViet**. Chỉ bù những thứ thu ngân bia garden đụng tới mỗi tối; giữ lợi thế Zalo.

### Đợt 1 — bắt buộc trước khi go-live (thao tác quầy hằng ngày)

| # | Tính năng | Vì sao với bia garden | Phạm vi gợi ý |
|---|---|---|---|
| 1 | **Chuyển bàn** | Trời mưa / khách gọi thêm người là dời chỗ — ngày nào cũng có | RPC dời phiên (và mâm) sang bàn trống, giữ nguyên đơn, có audit; nút trên panel bill POS + màn nhân viên |
| 2 | **Giảm giá bill + phụ thu** | Chủ quán bớt lẻ cho khách quen, thu thêm phí khăn lạnh / đá / phục vụ ngày lễ | Điều chỉnh cấp phiên: giảm VNĐ hoặc %, phụ thu có tên, bắt buộc lý do; `recompute` tổng; hiện trên tạm tính + hoá đơn + A04 |
| 3 | **Thanh toán kết hợp** + nút mệnh giá gợi ý | Bàn nhậu hay "góp tiền": nửa tiền mặt nửa chuyển khoản | Bảng con các khoản thanh toán của phiên (instrument + số tiền), tổng phải khớp; báo cáo tách TM/CK theo khoản |
| 4 | **Khung giờ doanh thu + kết ca** | Quán mở tới 1–2h sáng; két phải khớp theo ca | Cài đặt "ngày kinh doanh bắt đầu lúc HH:MM"; mở ca (tiền đầu ca) → kết ca (đếm két, chênh lệch) |
| 5 | **In tách bar / bếp** | Quầy bia và bếp nướng ở hai chỗ | Gán danh mục → trạm in; xác nhận đơn in phiếu theo trạm |

### Đợt 2 — trong tháng đầu vận hành

| # | Tính năng | Ghi chú |
|---|---|---|
| 6 | **VietQR động trên bill** (đã có kế hoạch, cột `bank_*` sẵn) | Bản đầu: chỉ sinh QR đúng số tiền + nội dung; tự xác nhận tiền về để sau |
| 7 | **Tồn kho hàng đóng chai** | Chỉ món "hàng hoá" (bia lon/chai, thuốc lá, nước ngọt): nhập hàng, tồn, kiểm kho, quy đổi thùng ↔ lon, cảnh báo sắp hết. Chưa làm định lượng nguyên liệu |
| 8 | **Sổ quỹ đơn giản** | Phiếu chi (mua đá, ứng lương, trả nhà cung cấp) để két cuối ca khớp |
| 9 | **Báo cáo món bán chạy + theo giờ + theo nhân viên** | Đọc từ `order_items` sẵn có, không cần migration lớn |
| 10 | **Combo / set nhậu** | Một món bán ra gồm nhiều món con, phiếu bếp tách từng món |

### Đợt 3 — khi có nhu cầu thật

Khuyến mại khung giờ (happy hour) · trang Khách hàng + tích điểm qua Zalo UID · bảng giá nhiều mức · màn hình phụ cho khách · vai trò tuỳ chỉnh · chấm công / lương · POS offline · hoá đơn điện tử.

## 5. Lợi thế MEVO nên nói khi chủ quán so sánh

- Khách **quét Zalo là gọi món**, không cài app, không web lạ; quán biết khách là ai (Zalo UID / SĐT) để chăm sóc lại.
- **Mâm cho khách đoàn** (N bàn = 1 bill, gộp nhiều mâm một lần) — KiotViet chỉ ghép / tách đơn.
- **Đặt bàn từ Zalo + đặt món trước**, POS có Timeline giữ bàn.
- **Vòng quay may mắn** + voucher tự áp lần sau.
- **Thu ngân xác nhận rồi mới vào bếp** — chống đơn ma từ QR.
- MEVO **vận hành hộ** (nhập menu, cấu hình), không bắt chủ quán tự học phần mềm.

## 6. Câu hỏi cần hỏi Yên Garden trước khi chốt Đợt 1

1. Có mấy khu (trong nhà / sân vườn / tầng)? Bar và bếp có tách máy in không?
2. Bán bia kiểu gì: bia tươi theo lít / tháp, bia chai theo két, hay cả hai? Có cần theo dõi tồn kho bia không?
3. Mấy giờ đóng cửa? Có chia ca thu ngân không?
4. Có phụ thu nào cố định (khăn lạnh, đá, phí phục vụ, phí ngày lễ)?
5. Khách thường trả bằng gì; có hay chia tiền mặt + chuyển khoản trên cùng bill không?
6. Có cần xuất hoá đơn điện tử không (hộ kinh doanh hay công ty)?
7. Có combo / set nhậu cố định không? Có chương trình giờ vàng không?
