# Trang Báo cáo trông chuyên nghiệp — thiết kế

Ngày: 2026-11-16 · Người yêu cầu: anh Tú · Trạng thái: chờ duyệt (đã qua đọc thử, đã chốt cách so kỳ chưa hết)

## 1. Ý định

Anh Tú muốn trang **Báo cáo** (`/admin/reports`) trông như một bảng điều khiển chuyên nghiệp, theo ảnh mẫu
"FoodAnalytics" anh gửi: thẻ số có biểu tượng màu và mũi tên tăng/giảm, biểu đồ vùng mềm, biểu đồ tròn, danh sách
món bán chạy có xếp hạng, ô nhận xét nhanh. Yêu cầu:

- Giữ **màu MEVO** (cam `--primary #c2410c`, nền slate) và giữ **đủ 8 loại báo cáo** đang có.
- Được **thêm thông tin** như ảnh mẫu nếu làm trang đẹp và có ích hơn, nhưng chỉ từ dữ liệu thật đã có.

Hiện tại mỗi tab chỉ có vài thẻ số trơn và một bảng. Chủ quán khó thấy ngay "hôm nay hơn hay kém", "món nào kéo
doanh thu", "giờ nào đông".

**Mockup đã duyệt hướng:** `bao-cao-mockup.html` (8 tab bấm được, số mẫu). Bản chép hiện nằm ở scratchpad của phiên
`C:\Users\ductu\AppData\Local\Temp\claude\367cbb6e3687544b\0c642e0e-845e-477b-8f9b-904ba2c73a65\scratchpad\bao-cao-mockup.html`,
sẽ chép vào `docs/superpowers/specs/2026-11-16-bao-cao-mockup.html` khi làm. Mockup là **chuẩn về bố cục và cảm giác**;
chỗ nào mockup khác văn bản này thì theo văn bản này.

## 2. Mục tiêu / không làm / không được xảy ra

**Mục tiêu**
- 8 tab cùng một phong cách: thẻ số kiểu ảnh mẫu, biểu đồ đẹp, khối "nhìn là hiểu" ở mỗi tab.
- Mỗi thẻ số chính có **"↑/↓ x% so với kỳ trước"**.
- Điện thoại (375px) vẫn đọc được đủ, như hiện nay.

**Không làm**
- Không thêm tab "Tổng quan" (anh Tú chọn cách 2: làm đẹp 8 tab, không làm trang tổng quan).
- **Không có biểu đồ mini (sparkline) trong thẻ số** (anh Tú đã bỏ: không có nhãn thì không hiểu, 4 thẻ vẽ cùng một hình).
- Không có "Khách mới", "Trạng thái đơn" như ảnh mẫu (quán trả sau không ghi khách; trạng thái đơn không hợp với báo cáo
  theo kỳ đã thu tiền).
- Không sửa DB / RPC / migration. Không đổi bất kỳ con số nào server đang trả. Không đổi file Excel và trang in.
- Không thêm thư viện biểu đồ: vẽ SVG tay như `RevenueLine` hiện có.

**Không được xảy ra**
- Bịa số: mọi thứ hiện ra đều tính từ dữ liệu RPC trả về (xếp hạng, %, max/min, gom nhóm là được; tự nghĩ công thức
  tiền là không — luật CLAUDE.md §6 "Tiền").
- Kỳ trước tải lỗi làm sập trang: lỗi thì chỉ ẩn dòng "% so với kỳ trước", phần còn lại vẫn hiện.
- Thu ngân thấy tab tài chính (giữ nguyên phân quyền `reportTabsFor` / `loadReport`).
- Viền nét đứt, nhãn "MỚI" của mockup lọt vào trang thật (chỉ là dấu trong mockup).

## 3. Ràng buộc

- Next 16 + React 19 + Tailwind 4 (đọc `admin-web/AGENTS.md`). Trang là server component; view nào cần tương tác
  (đổi sắp xếp, lọc) mới `'use client'`.
- Font Be Vietnam Pro, token màu trong `app/globals.css`. Admin chưa có chế độ tối → không cần làm.
- Trang đọc một lần mỗi lần điều hướng, không poll (luật admin-web).
- Hàm thuần có test vitest, đặt ở `admin-web/lib/reports/`.

## 4. Các cách đã cân nhắc

| Cách | Đổi lại | Kết quả |
|---|---|---|
| 1. Thêm tab "Tổng quan" kiểu ảnh mẫu + làm đẹp 8 tab | Giống ảnh nhất, việc lớn nhất | Không chọn |
| **2. Chỉ làm đẹp 8 tab, thêm khối thông tin trong từng tab** | Nhanh hơn, không có màn "nhìn một cái thấy hết" | **Anh Tú chọn** |

Biểu đồ: dùng SVG tự vẽ (code đã có tiền lệ, không thêm gói) thay vì thư viện như Recharts (nặng thêm bundle, phải
chỉnh lại theme). Quyết định của em.

## 5. Thiết kế

### 5.1 Khung chung (mọi tab)

- **Đầu trang**: "Báo cáo" + dòng phụ (kỳ + `reportScopeNote` như hiện nay; thêm tên quán đầu dòng nếu lấy được rẻ,
  không thì bỏ). Bên phải: **ô ngày** (icon lịch + `periodLabel` của kỳ; bấm vào mở form Tuỳ chọn) và nút **Xuất
  Excel** thành nút chính màu cam (trước là nút viền). Tab chưa có Excel thì ẩn nút như hiện nay.
- **Thanh kỳ**: 6 nút như cũ, kiểu segmented nền trắng; nút đang chọn nền `--primary-light`, chữ cam. Nút Ngày | Tháng
  của tab Doanh thu giữ chỗ cũ.
- **Thanh tab**: một khung trắng bo góc, hai nhóm có nhãn nhỏ **BÁN HÀNG** | **TÀI CHÍNH** ngăn bằng vạch dọc, mỗi tab
  có icon lucide (Theo món `Utensils`, Theo danh mục `Layers`, Theo giờ `Clock`, Món huỷ `Undo2`, Doanh thu `TrendingUp`,
  Thu chi `Wallet`, Lãi lỗ `Scale`, Công nợ `Users`). Tab đang chọn: nền cam, chữ trắng. Thu ngân chỉ thấy nhóm Bán hàng.
  Điện thoại: các nút tự xuống dòng (không cuộn ngang, không giấu tab), nhãn nhóm ẩn.
- **Thẻ số (KPI)** — một component dùng chung thay 3 bản `Stat`/`Total`/`AgeBox` đang lặp: ô icon bo góc tô màu nhạt +
  nhãn; số to (28px desktop, ~21px mobile, `tabular`, đơn vị "đ" nhỏ hơn); dòng dưới: chip delta + "so với kỳ trước" +
  ghi chú phụ (vd "Tặng 6", "1,8% tiền món"). Lưới 4 cột desktop, 2 cột ≤1024px.
- **Thẻ khối**: nền trắng, viền `--border`, bo 16px, đổ bóng rất nhẹ, tiêu đề 15px đậm + dòng gợi ý nhỏ.
- **Bảng**: giữ nguyên cột, thẻ mobile như hiện nay; đầu bảng nền `#f8fafc`, rê dòng nền cam rất nhạt, dòng Tổng đậm.
- **Bảng màu biểu đồ**: thêm token `--chart-1..6` vào `globals.css`: cam `#ea580c`, hổ phách `#f59e0b`, xanh lá `#10b981`,
  xanh trời `#0ea5e9`, tím `#8b5cf6`, xám `#94a3b8`. Đồng nghĩa: tiền mặt = xanh lá, chuyển khoản = xanh trời,
  ghi nợ = hổ phách, ví/khác = tím.

### 5.2 So với kỳ trước

- **Kỳ trước** (`previousRange` trong `lib/reports/compare.ts`, hàm thuần):
  - Tháng trước → tháng liền trước nữa (trọn tháng).
  - Tháng này (1 → hôm nay, n ngày) → n ngày đầu của tháng trước (cắt ở cuối tháng nếu tháng trước ngắn hơn).
  - Hôm nay, Hôm qua, 7 ngày, Tuỳ chọn → khoảng **cùng độ dài liền ngay trước**.
  - Doanh thu chế độ Tháng (12 tháng) → **không so** (không hiện delta).
- `reports-screen.tsx` gọi `loadReport` cho kỳ này và kỳ trước **song song** (`Promise.all`), cùng tab, cùng RPC.
  Kỳ trước chỉ dùng phần tổng. Lỗi kỳ trước → bỏ qua, không hiện delta.
- **Công nợ**: không gọi thêm; delta của "Nợ cuối kỳ" = so với "Nợ đầu kỳ" của chính báo cáo.
- `deltaPercent(cur, prev)`: làm tròn 1 chữ số. **Kỳ trước ≤ 0 → không hiện** (tránh % vô nghĩa khi gốc âm hoặc 0).
  Bằng nhau → "— 0%" xám.
- **Kỳ chưa hết vẫn so % bình thường** (anh Tú chốt 2026-11-16): "Hôm nay" lúc 14h so với **cả ngày** hôm qua, "Tháng
  này" so với n ngày đầu tháng trước — để người bán biết hôm nay đang ở đâu so với hôm qua. Không ẩn, không đổi sang số.
  RPC chỉ tính trọn ngày nên không có so sánh "đến cùng giờ" (ngoài phạm vi).
- **Nhãn** sau chip gọi đúng tên kỳ trước *(em quyết)*: Hôm nay → "so với hôm qua"; Hôm qua → "so với hôm kia";
  7 ngày → "so với 7 ngày trước"; Tháng này / Tháng trước → "so với tháng trước"; Tuỳ chọn → "so với kỳ trước".
  Công nợ: "so với đầu kỳ".
- **Màu**: tăng là tốt → xanh lá, giảm → đỏ; với chỉ số "càng ít càng tốt" (Giảm giá, tiền huỷ/tặng/giảm SL, Chi phí,
  Nợ cuối kỳ) thì đảo màu. Mũi tên luôn theo chiều số thật.

| Tab | Thẻ có delta |
|---|---|
| Theo món / danh mục / giờ | Doanh thu, Tiền món, Giảm giá (đảo), SL bán |
| Món huỷ | Tiền bỏ, Tiền tặng, Giảm SL (cả 3 đảo) |
| Doanh thu (Ngày) | Doanh thu, Số bill, TB/bill, Giảm giá (đảo) |
| Thu chi | Chênh lệch quỹ Tiền mặt, quỹ Ngân hàng |
| Lãi lỗ | Doanh thu thuần, Lãi gộp, Chi phí hoạt động (đảo), Lãi ròng |
| Công nợ | Nợ cuối kỳ (đảo, so với đầu kỳ) |

### 5.3 Từng tab (thêm gì, lấy từ đâu)

Mọi phép tính dưới đây là hàm thuần trong `lib/reports/insights.ts` (có test), chỉ xếp hạng / gom / lấy max-min / % trên
dữ liệu RPC đã trả.

**Theo món** — 4 KPI bán hàng; hàng 2 cột (≈ 1,65 : 1):
- *Món bán chạy*: top 5, nút nhỏ Theo tiền | Theo SL (client). Mỗi dòng: huy hiệu hạng (màu 1→5), ô chữ cái đầu tên món
  tô màu danh mục, tên + "x phần · danh mục", tiền + %.
- *Tỉ trọng theo danh mục*: donut (tâm = tổng SL bán, "MÓN BÁN RA") gom từ dòng món theo danh mục; chú giải tên, "x món ·
  tiền", %. Quá 5 danh mục → 5 lớn nhất + "Khác". Ô nhận xét cam dưới donut: "**<danh mục đầu>** mang lại nhiều tiền
  nhất kỳ này — x% tiền món".
- Bảng *Tất cả món* như cũ (sắp, lọc danh mục), cột % thêm thanh tỉ lệ nhỏ (so với món đầu).
- Banner chênh lệch và dòng "Chưa gồm n bàn đang mở" giữ nguyên.

**Theo danh mục** — 4 KPI; 2 cột: danh sách danh mục gập/mở như cũ, thêm chấm màu + thanh tỉ lệ trên mỗi danh mục;
bên phải donut (tâm = tổng tiền món rút gọn "18,1tr") + chú giải.

**Theo giờ** — 4 KPI; khối biểu đồ vùng hai đường: **Tiền món** (cam, trục trái) và **Lượt gọi** (xanh lá, trục phải),
thứ tự giờ giữ theo server (ngày kinh doanh). Điểm cao nhất có vạch đứng + nhãn số. Dải tóm tắt 4 ô: **Giờ cao điểm**
(giờ + tiền), **Lượt gọi đông nhất**, **Tổng lượt gọi**, **TB tiền / lượt gọi**. Bảng như cũ + nhãn "Cao điểm" ở dòng
giờ cao nhất + cột thanh so với giờ cao nhất.
*(Mockup có "Ca trưa 10–14h / Ca tối 17–22h"; bỏ vì giờ mở cửa mỗi quán khác nhau, cửa sổ cứng sẽ sai.)*

**Món huỷ** — 3 KPI (Tiền bỏ, Tiền tặng, Giảm SL; ghi chú "n lần …"); 2 cột: *Món bị huỷ nhiều nhất* (top 4 theo tổng
số lượng, gộp cả 3 loại) và *Lý do hay gặp* (đếm theo chuỗi lý do, rỗng → "Không ghi lý do", top 5, thanh đỏ). Bảng
như cũ.

**Doanh thu** — 4 KPI; 2 cột:
- *Doanh thu & số bill theo ngày/tháng*: biểu đồ vùng hai đường (thay polyline hiện tại), nút Ngày | Tháng. Dải 3 ô:
  **Ngày (tháng) cao nhất**, **TB / ngày (tháng)** = tổng ÷ số dòng, **Ngày (tháng) thấp nhất** trong số dòng có bill > 0.
- *Cơ cấu thanh toán*: donut Tiền mặt / Chuyển khoản / Ghi nợ (+ "Ví / khác" nếu `other > 0`) từ `totals`.
- Bảng như cũ + nhãn "Cao nhất" ở dòng cao nhất.

**Thu chi** — 2 thẻ quỹ (Tiền mặt, Ngân hàng/ví): icon, số **Chênh lệch** to (xanh nếu ≥ 0, đỏ nếu âm), delta, thanh
tỉ lệ vào (xanh) / ra (đỏ nhạt), số Vào / Ra. Khối *Tiền ra đi đâu* *(em quyết)*: mỗi dòng của `outflows` một thanh
xếp chồng TM + CK (khớp bảng Tiền ra), sắp theo tổng, **bỏ dòng `reportGroup = 'cash_transfer'`** (chuyển quỹ không phải
tiêu tiền) và ghi chú nhỏ "Không gồm chuyển quỹ"; phần âm vẽ là 0 trên thanh (bảng bên dưới vẫn ghi số thật, tô đỏ như
nay). Không còn dòng nào → ẩn khối. Dưới: 2 bảng Tiền vào / Tiền ra như cũ (tiêu đề có chip tổng). Chú thích cuối giữ nguyên.

**Lãi lỗ** — 4 KPI (Lãi gộp, Lãi ròng có thêm "Biên x%" = ÷ doanh thu thuần); 2 cột: *Từ doanh thu đến lãi ròng* —
biểu đồ thác nước 6 cột: Doanh thu, −Giá vốn, Lãi gộp, −Chi phí hoạt động, −(Hàng huỷ − Thu nhập khác), Lãi ròng; phải
vẽ đúng khi lãi gộp / lãi ròng **âm** (cột xuống dưới trục 0). Bên phải: bảng lãi lỗ dọc như cũ (dòng Lãi ròng nền xanh
nhạt khi ≥ 0, nền đỏ nhạt khi âm). Hàng dưới: donut *Chi phí hoạt động* theo hạng mục (top 4 + Khác) và khối xám "Không
tính vào lãi lỗ". Hai banner cảnh báo giá vốn giữ nguyên ở đầu tab.

**Công nợ** — 4 KPI: Nợ cuối kỳ (delta so với đầu kỳ, ghi chú "n khách đang nợ"), Nợ đầu kỳ, Phát sinh, Đã thu
(ghi chú "Thu được x%" = đã thu ÷ (đầu kỳ + phát sinh)); 2 cột: *Tuổi nợ* — thanh ngang 3 màu (xanh 0–7, hổ phách 8–30,
đỏ >30) + 3 ô số; *Nợ nhiều nhất* — top 4 theo nợ cuối kỳ, tên là link `/admin/debts?customer=…` như hiện nay. Bảng như
cũ; bill nợ cũ nhất quá 30 ngày (so với ngày cuối kỳ) có nhãn đỏ "n ngày".

**Rỗng**: KPI vẫn hiện số 0; các khối biểu đồ / xếp hạng thay bằng `EmptyState` "Chưa có dữ liệu trong kỳ này".

### 5.4 Cấu trúc code (đề xuất)

- `lib/reports/compare.ts` — `previousRange`, `deltaPercent` (+ test).
- `lib/reports/insights.ts` — top món, gom danh mục (+ "Khác"), tóm tắt giờ, gom món huỷ / lý do, ngày cao/thấp,
  cơ cấu thanh toán, bước thác nước, tuổi nợ, top nợ (+ test).
- `app/admin/reports/charts/` — `Donut`, `AreaChart` (1–2 đường, trục phải tuỳ chọn, đánh dấu đỉnh), `Waterfall`,
  `RatioBar`. Hình học (toạ độ, đường cong) để hàm thuần có test.
- `app/admin/reports/kpi-card.tsx` — thẻ số dùng chung.
- `reports-screen.tsx` — tải kỳ trước song song, truyền tổng kỳ trước xuống view.
- Sửa `report-toolbar.tsx` (thanh kỳ, thanh tab nhóm + icon, ô ngày), các `*-view.tsx`.
- Cập nhật `report-views.test.tsx` (vd test polyline của Doanh thu phải đổi theo biểu đồ mới).

## 6. Để người dựng tự quyết

- Kích thước chính xác, khoảng cách, đổ bóng — bám mockup.
- Cách đặt nhãn trục và số đánh dấu đỉnh trên biểu đồ để không đè nhau khi bề ngang hẹp.
- Có lấy tên quán cho dòng phụ hay không (chỉ khi không tốn thêm truy vấn đáng kể).
- Chia nhỏ component thế nào, miễn hàm thuần có test.

## 7. Kiểm thử

- vitest: `compare.ts`, `insights.ts`, hình học biểu đồ; cập nhật `report-views.test.tsx`.
- Tự xem trên trình duyệt cả 8 tab, desktop + 375px, vai chủ quán và thu ngân; kỳ có dữ liệu, kỳ rỗng; Lãi lỗ lỗ âm.
- Checklist test tay: `docs/testing/bao-cao-chuyen-nghiep/BAO-CAO-UI.md`, thêm một dòng vào `TESTING.md`.
