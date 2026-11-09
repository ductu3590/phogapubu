# Yên Garden — Báo cáo

Trang **Báo cáo** (`/admin/reports`) đọc số từ RPC chỉ đọc. Không có thao tác nào ghi dữ liệu.
Spec: `docs/superpowers/specs/2026-11-09-yg-bao-cao-design.md`. Plan: `docs/superpowers/plans/2026-11-09-yg-bao-cao.md`.

# Part 1 — Bán hàng (mig 117)

Bốn tab: **Theo món**, **Theo danh mục**, **Theo giờ**, **Món huỷ**. Kỳ tính theo **ngày kinh doanh** của quán (mig 111). Ba tab bán hàng chỉ tính bill **đã thu tiền**. Tab Món huỷ lọc theo giờ thao tác, có cả món ở bàn chưa thu.

## Controller áp migration 117 (làm trước khi test, không phải việc của agent code)

1. Kiểm prod đã có mig 111 (`business_day_bounds`) và **chưa** có `report_paid_orders`:
   `select to_regprocedure('public.business_day_bounds(uuid,date)'), to_regprocedure('public.report_paid_orders(uuid,timestamptz,timestamptz)');`
   Phải ra hàm thứ nhất có, hàm thứ hai `null`.
2. Đối chiếu điều kiện WHERE của CTE `money` trong `pg_get_functiondef('public.get_bills_report(uuid,date)')` trên prod với WHERE của `report_paid_orders` trong `117_sales_reports.sql`. Hai đoạn phải trùng nguyên văn, chỉ khác tên biến `v_from`/`v_to` ↔ `p_from`/`p_to`. Lệch thì **dừng**: nếu 112a đã đổi đoạn này thì doanh thu báo cáo và doanh thu A04 sẽ lệch nhau.
3. Áp `117_sales_reports.sql` từ nội dung LF: `git show <commit>:supabase/migrations/117_sales_reports.sql`, không lấy file CRLF trên đĩa Windows.
4. Kiểm trên một quán có bill hôm qua (Bảo Lương):
   `select (report_sales_by_item('<store>', <hôm qua>, <hôm qua>))->'summary'->>'revenue'` phải bằng
   `get_bills_report('<store>', <hôm qua>)->'totals'->>'revenue'`.
   Hai hàm đều kiểm quyền theo `auth.uid()`. Chạy bằng SQL editor (không có uid) sẽ báo "Không có quyền". Muốn chạy trong SQL editor thì `set local request.jwt.claim.sub = '<uid chủ quán>'` trong cùng transaction.
5. Deploy Vercel. Thứ tự áp DB và deploy không gây lỗi: nếu trang mới gặp DB chưa áp mig thì chỉ hiện "Không tải được báo cáo".

## Trước khi test

- Quán thử: **Bia lẩu Bảo Lương**, hoặc **Yên Garden** khi đã tạo. Cần một ngày có **ít nhất 3 bill đã thu**.
- Ba tài khoản: chủ quán, thu ngân và quản lý (bài 10). Nhánh Quản lý (mig 116) đã gộp: thu ngân và quản lý đều có mục **Hoá đơn** và **Báo cáo** trên thanh icon. Mig 116 phải áp prod trước thì tài khoản quản lý mới đăng nhập được.
- Mở Báo cáo từ thanh icon bên trái: mục **Báo cáo** (biểu đồ cột), nằm ngay dưới **Hoá đơn**.

## Bài 1. Doanh thu khớp Hoá đơn (A04)

1. Mở Báo cáo, chọn **Hôm nay**, tab **Theo món**.
2. Mở **Hoá đơn** cùng ngày, ghi lại **Tổng thực thu**.
3. Ô **Doanh thu** ở Báo cáo phải **bằng đúng** Tổng thực thu.
4. **Tiền món − Giảm giá = Doanh thu**, và **không** hiện banner vàng "Chênh lệch …".

## Bài 2. Bill có bỏ món, tặng món, giảm SL, giảm giá bill

1. Mở một bàn, gọi ít nhất 4 món. Trên POS lần lượt làm:
   - **Bỏ** một món, ghi lý do;
   - **Tặng** một món;
   - **giảm số lượng** một món (ví dụ 3 → 2), ghi lý do;
   - giảm giá bill (ví dụ 20.000đ).
2. Thu tiền bàn đó.
3. Tab **Theo món**:
   - **Không có** dòng nào cho món đã bỏ (trừ khi món đó còn bán ở bill khác).
   - Món tặng có **SL tặng** ≥ 1 và không cộng tiền phần tặng.
   - Món giảm SL ghi đúng số lượng sau khi giảm.
4. Ô Giảm giá tăng đúng 20.000đ. Doanh thu vẫn bằng Tổng thực thu ở A04 cùng ngày.

## Bài 3. Ba tab cùng một tổng

1. Ghi lại **Tiền món** ở tab Theo món.
2. Mở tab **Theo danh mục**: cộng cột tiền của các danh mục (hoặc xem ô Tiền món) phải ra cùng số.
3. Mở tab **Theo giờ**: cộng tiền các giờ phải ra cùng số.
4. Món đã bị xoá khỏi menu hoặc không có danh mục thì nằm ở danh mục **Khác**, không bị mất tiền.

## Bài 4. Theo giờ là giờ vào bếp

1. Gọi món lúc khoảng **giờ A**. Thu ngân bấm **Xác nhận** đơn. Đợi sang **giờ khác** (ví dụ qua 1 tiếng, hoặc làm từ trước) rồi mới thu tiền.
2. Tab **Theo giờ**: tiền của đơn nằm ở khung **giờ thu ngân bấm Xác nhận**, không nằm ở khung giờ thu tiền.
3. Quán bắt đầu ngày lúc 05:00: khung 18:00 đứng **trước** khung 04:00, vì thứ tự đi theo ngày kinh doanh chứ không theo đồng hồ.

## Bài 5. Món huỷ

1. Tab **Món huỷ**, cùng ngày với bài 2: có đủ **ba dòng**: **Bỏ**, **Tặng**, **Giảm SL**.
2. Mỗi dòng đúng **bàn**, đúng **lý do** đã ghi, đúng **người làm** (tên hoặc email tài khoản đã bấm).
3. Ba ô trên cùng: **Tiền bỏ**, **Tiền tặng**, **Giảm SL** đúng bằng tiền của các dòng đó.
4. Nếu lỡ **tăng** số lượng một món thì lần tăng đó **không** hiện ở đây. Chỉ lần giảm mới hiện.

## Bài 6. Bàn đang mở

1. Để một bàn đang có khách, chưa thu.
2. Chọn **Hôm nay**: dưới thanh chọn có dòng nhỏ **"Chưa gồm N bàn đang mở"**, N bằng số bàn đang mở.
3. Tiền của bàn đó **chưa** vào Theo món, Theo danh mục, Theo giờ.
4. Chọn **Hôm qua**: dòng đó biến mất.

## Bài 7. Kỳ nhiều ngày

1. Chọn **7 ngày**, rồi **Tháng này**: Doanh thu bằng **cộng Tổng thực thu A04 từng ngày** trong kỳ.
2. Chọn **Tuỳ chọn**, nhập một khoảng 3 ngày, bấm **Xem**:
   - Nhãn kỳ dưới tiêu đề đổi đúng (ví dụ `05/11 – 07/11/2026`).
   - Doanh thu bằng cộng A04 của 3 ngày đó.
3. Ở Tuỳ chọn, ô ngày không cho chọn ngày sau hôm nay.

## Bài 8. Xuất Excel

1. Ở từng tab, bấm **Xuất Excel**. Tên file có dạng `bao-cao-<tab>-<tên quán>-<từ>_<đến>.xlsx`.
2. Mở file trên máy:
   - Một sheet, tên trùng tên tab.
   - Đầu sheet có Quán, Kỳ, Xuất lúc, Người xuất.
   - Số trong bảng bằng số trên màn hình.
3. Bôi đen cột **Tiền**: Excel tự cộng ra tổng ở thanh trạng thái, tức tiền là **số** chứ không phải chữ. Dòng **Tổng** khớp với ô Tiền món.
4. Ba tab bán hàng có thêm 3 dòng **Tiền món**, **Giảm giá**, **Doanh thu** dưới bảng.

## Bài 9. Điện thoại 375px

1. Mở Báo cáo trên điện thoại, hoặc Chrome DevTools ở cỡ 375px.
2. **Không** cuộn ngang được.
3. 6 nút kỳ xuống dòng và thấy được cả nút **Tuỳ chọn**. 4 loại báo cáo xếp **lưới 2 × 2**, đọc đủ chữ.
4. Mỗi tab hiện **thẻ** thay cho bảng.

## Bài 10. Thu ngân và quản lý

1. Đăng nhập thu ngân: thanh icon có **Hoá đơn** và **Báo cáo** (ngay dưới Hoá đơn), vào được trang Báo cáo.
2. Chỉ thấy 4 tab bán hàng.
3. Gõ tay `/admin/reports?tab=pnl` trên thanh địa chỉ: trang về tab **Theo món**, không báo lỗi.
4. Xuất Excel được.
5. Lặp lại bước 1–4 bằng tài khoản **quản lý**: kết quả giống hệt (4 tab tài chính: xem Part 2, bài 6–7).

## Bài 11. Hộp thoại và trang đầy đủ

1. Đang ở POS, bấm **Báo cáo** trên thanh icon: Báo cáo mở thành **hộp thoại đè lên POS**.
2. Trong hộp thoại, đổi kỳ: số đổi theo và **không** bật thêm hộp thoại thứ hai chồng lên.
3. Trong hộp thoại, chọn **Tuỳ chọn**, xem một khoảng, rồi bấm **Hôm nay**, rồi lại bấm **Tuỳ chọn**: hai ô ngày phải hiện **kỳ đang xem**, không giữ ngày cũ.
4. Bấm **F5**: ra trang đầy đủ (không còn POS phía sau). Đổi kỳ, đổi tab vẫn đúng, không bật hộp thoại.

# Part 2 — Tài chính (mig 125)

Bốn tab chỉ chủ quán và quản lý thấy: **Doanh thu**, **Thu chi**, **Lãi lỗ**, **Công nợ**. Thu ngân không thấy, gõ tay
URL cũng bị chặn (trang về Theo món, file Excel báo 403). Số doanh thu mỗi ngày dùng CHUNG hàm với Hoá đơn (A04).

## Deploy (controller làm, không phải việc của agent code)

Thứ tự migration trên prod (mỗi bước xong mới sang bước sau):

1. 111 (đã áp) → 112a → **deploy Vercel** (code thu tiền mới) → nhờ quán tải lại POS → 112b → 116 → 117 → 118 → 122 + 122b → 123 → **125**.
2. Trước khi áp 125: kiểm prod đã có đủ 112a, 116, 117, 118, 122, 122b, 123 và **chưa** có `report_day_totals`:
   `select to_regprocedure('public.report_paid_orders(uuid,timestamptz,timestamptz)'), to_regprocedure('public.report_day_totals(uuid,timestamptz,timestamptz)');`
   (cái đầu có, cái sau `null`).
3. So byte `pg_get_functiondef('public.get_bills_report(uuid,date)')` trên prod với
   `supabase/tests/prod-defs/125/get_bills_report.sql`, **kể cả byte CR**: lấy bản prod dạng base64
   (`select encode(convert_to(pg_get_functiondef('public.get_bills_report(uuid,date)'::regprocedure), 'UTF8'), 'base64')`)
   rồi so với file (đọc file ở dạng LF, đúng như `git show`). Khác bất kỳ chỗ nào thì **dừng**: hai neo vá và thân
   `report_day_totals` phải dựng lại từ bản prod.
4. Ghi lại `get_bills_report(<quán>, hôm qua)` (và một ngày có bill nợ nếu có) TRƯỚC khi áp.
5. Áp `125_financial_reports.sql` **ngoài giờ mở cửa**, từ nội dung LF nguyên văn (`git show <commit>:supabase/migrations/125_financial_reports.sql`),
   không lược comment, không gộp dòng.
6. Kiểm SAU khi áp: `get_bills_report` cùng ngày ra y như bước 4, `totals` chỉ thêm khoá `discount_total`;
   `report_revenue_series(<quán>, hôm qua, hôm qua, 'day')` ra cùng revenue / cash / bank / debt / other / bills_count.
   (Gọi với `set local request.jwt.claim.sub = '<uid chủ quán>'` trong cùng transaction nếu chạy ở SQL editor.)
7. Deploy Vercel (code 4 tab tài chính). Trang mới gặp DB chưa áp 125 chỉ báo "Không tải được báo cáo".

## Trước khi test

- Chạy trên quán thử sau khi đã có **2–3 ngày dữ liệu thật**: thu kết hợp TM + CK, ghi nợ, trả nợ, phiếu thu chi, nhập
  kho và kiểm kho.
- Ba tài khoản: chủ quán, quản lý, thu ngân.

## Bài 1. Doanh thu chế độ Ngày

1. Tab **Doanh thu**, nút **Ngày**, chọn kỳ có 2–3 ngày dữ liệu.
2. Từng ngày: **Doanh thu**, **Tiền mặt**, **Chuyển khoản**, **Ghi nợ** bằng đúng **Tổng thực thu** và TM / CK / Nợ trên trang
   **Hoá đơn** ngày đó.
3. Ngày không bán vẫn có dòng 0đ. Dòng **Tổng** = cộng các ngày. **TB/bill** = Doanh thu ÷ Số bill (làm tròn đồng).

## Bài 2. Doanh thu chế độ Tháng

1. Bấm **Tháng**: có **12 dòng tháng**, tháng cuối là tháng của ngày "Đến".
2. Nhãn **Kỳ** đầu trang đổi thành 12 tháng thật (ví dụ `01/01 – 31/12/2026`), không phải kỳ đang chọn.
3. Tháng này = cộng các ngày của tháng (xem lại bằng chế độ Ngày, kỳ Tháng này).

## Bài 3. Thu chi

1. Tab **Thu chi**, kỳ có ca đã chốt.
2. **Tiền mặt vào** gồm: tiền mặt của bill, **trả nợ bằng tiền mặt**, các **phiếu thu** tiền mặt (vd. Nộp thêm vào két).
   **Tiền mặt ra** gồm các phiếu chi tiền mặt, kể cả **Nhập hàng** trả tiền mặt (phiếu chi tự sinh từ phiếu nhập kho, mig 122b).
3. Tiền mặt vào − ra khớp **chênh lệch két** các ca trong kỳ (không tính tiền đầu ca).
4. Bill ghi nợ **không** có trong Tiền vào (chỉ khi khách trả nợ mới vào). Phiếu đã huỷ **không** có.
5. Có thu qua ví: thẻ quỹ ghi **"Ngân hàng / ví"** và có dòng "Tiền ví về tài khoản ngân hàng khi đối soát".

## Bài 4. Lãi lỗ

1. Kỳ có nhập kho nhưng **chưa kiểm kho cuối kỳ**: có banner vàng **"Giá vốn nguyên liệu chưa tính — cần kiểm kho"**,
   dòng Nguyên liệu = 0đ.
2. Kiểm kho cuối kỳ rồi xem lại: banner mất, giá vốn nguyên liệu có số.
3. Khối xám **"Không tính vào lãi lỗ"** có **Nhập hàng**, **Chủ quán rút**, **Chuyển quỹ (tổng phiếu, không tính)**; các
   khoản này **không** trừ vào lãi.
4. Bấm **Chi phí hoạt động**: xổ ra từng danh mục, cộng đúng tổng. Lãi ròng âm thì tô đỏ.

## Bài 5. Công nợ

1. Một khách vừa trả **một phần** trong kỳ: **Nợ đầu kỳ + Phát sinh − Đã thu = Nợ cuối kỳ**.
2. Huỷ lần trả đó (ở trang Công nợ) rồi xem lại báo cáo: Đã thu giảm, Nợ cuối kỳ tăng lại đúng số đã huỷ — kể cả khi
   xem kỳ cũ.
3. Ba ô tuổi nợ (0–7, 8–30, trên 30 ngày) cộng lại = Nợ cuối kỳ.
4. Bấm tên khách: mở trang **Công nợ** đúng khách đó.

## Bài 6. Thu ngân

1. Không thấy 4 tab tài chính.
2. Gõ tay `/admin/reports?tab=pnl`: trang về **Theo món**, không báo lỗi.
3. Gõ tay `/admin/reports/export?tab=pnl`: trình duyệt báo **"Không có quyền xem báo cáo tài chính"** (không tải về file Theo món).

## Bài 7. Quản lý

1. Thấy đủ **8 tab**, số giống tài khoản chủ quán.

## Bài 8. Xuất Excel 4 tab

1. Ở từng tab tài chính, bấm **Xuất Excel**. Mở file: số bằng màn hình, cột tiền cộng được (là số), số âm là số âm.
2. Doanh thu chế độ Tháng: dòng **Kỳ** trong file là 12 tháng thật, có dòng **Chế độ: Tháng**.

## Bài 9. Điện thoại 375px

1. Mở 4 tab trên điện thoại (hoặc DevTools 375px): không cuộn ngang, bảng thành thẻ, biểu đồ doanh thu vừa khung.
