# Đợt 1 phần còn lại: thanh toán kết hợp, ngày kinh doanh + ca, in hai nơi, VietQR

> Ngày: 2026-11-05 · Trạng thái: anh Tú đã duyệt 2026-11-05 · Go-live dự kiến: 2026-12-01 · Nền: `main` ở `fc96dc7` (mig tới 110)
> Báo cáo gốc: [docs/research/2026-11-02-kiotviet-fnb-gap-analysis.md](../../research/2026-11-02-kiotviet-fnb-gap-analysis.md)

Ký hiệu trong tài liệu: **[anh Tú]** = anh Tú đã chốt · **[em]** = em tự quyết, anh xem lại khi đọc.

## 1. Vì sao làm

Yên Garden là quán bia sân vườn chọn MEVO thay KiotViet, nên sẽ so sánh ngay tuần đầu. Chuyển bàn và giảm giá bill đã xong. Còn những việc thu ngân đụng tới mỗi tối:

- Bàn nhậu góp tiền: một phần tiền mặt, một phần chuyển khoản.
- Quán mở qua 0h: báo cáo theo ngày lịch cắt đôi ca tối.
- Két phải khớp cuối ca, kể cả khi có chi tiền mua đá, trả nhà cung cấp.
- Bếp ở chỗ khác quầy: phiếu bếp phải ra máy in bếp, không phải máy ở quầy.
- Khách chuyển khoản phải gõ tay số tiền và số tài khoản, dễ sai.

Thành công nghĩa là: một tối ở Yên Garden, thu ngân thu tiền, đối chiếu két và in phiếu hoàn toàn trên MEVO, không cần sổ tay hay máy tính bỏ túi.

## 2. Phạm vi

**Làm:** bốn mục A, B, C, D dưới đây.

**Không làm:**
- Thu từng phần (trả một số món, phần còn lại để bàn). Quy tắc "bàn trả sau thu cả bàn một lần" giữ nguyên.
- Tự xác nhận tiền chuyển khoản, đọc biến động số dư, đọc số tiền qua loa **[anh Tú]**.
- QR trong Mini App **[anh Tú]**.
- Sổ quỹ đầy đủ. Chỉ có khoản chi trong ca (mục B3).
- Số hoá đơn thật, hoàn tiền, trả hàng.
- In hoá đơn sau khi thu **[anh Tú]**: khách cầm tờ tạm tính, cần in lại thì vào A04.
- Tự viết driver máy in (ESC/POS) **[em]**.

**Tuyệt đối tránh:**
- Tổng TM + CK trong báo cáo khác doanh thu.
- Bill thu nửa chừng: một phiên đã đóng mà khoản thu lỗi, hoặc ngược lại.
- Quán đang chạy bị đổi hành vi. Ngày kinh doanh, ca, in hai nơi, VietQR đều tắt mặc định: quán không bật thì như hôm nay. Riêng mục A không có công tắc **[em]**: Kết hợp chỉ là thêm một lựa chọn ở màn thu, không chọn thì thu như cũ; báo cáo vẫn ra cùng số.
- Phiếu bếp in trùng, hoặc mất phiếu mà không ai biết.

## 3. Mục A: Thanh toán kết hợp

### A1. Trải nghiệm

- Chỉ ở màn Thanh toán POS (`PaymentView` trong `admin-web/app/admin/pos/bill-panel.tsx`) **[anh Tú]**.
- Ba lựa chọn: Tiền mặt · Chuyển khoản · Kết hợp.
- Kết hợp hiện hai ô: Tiền mặt và Chuyển khoản. Gõ một ô, ô kia tự điền phần còn lại. Tổng phải đúng số cần thu thì nút thu mới bấm được.
- Chỉ hai phương tiện TM + CK **[em]**.
- Tiền khách đưa và tiền thối so với **phần tiền mặt**, không so với cả bill.
- Nút mệnh giá gợi ý đã có (`cashSuggestions` trong `lib/cash-change.ts`). Thêm mốc làm tròn lên 10.000 để giống KiotViet, và tính theo phần tiền mặt **[em]**.
- `/staff/tables` và ngăn A04 vẫn thu một phương tiện **[anh Tú]**, nhưng đi qua cùng RPC mới để báo cáo và ca đọc một nguồn.
- Gộp bill N mâm thu kết hợp được: một lần thu cho cả nhóm.

### A2. Dữ liệu

Hiện không có khái niệm "bill" trong DB: bill được suy ra từ `closed_by@giờ nhận tiền`. Cần một thực thể ghi "một lần thu".

```
bill_payments              -- một dòng = một lần thu ở quầy
  id, store_id, cash_shift_id (null), client_request_id,
  total_amount, cash_given (null), change_amount (null),
  collected_by, collected_at, source  -- 'pos' | 'staff' | 'a04' | 'manual_order' | 'kitchen'
  UNIQUE (store_id, client_request_id)

bill_payment_lines         -- một dòng = một phương tiện trong lần thu
  id, payment_id, instrument ('cash' | 'bank'), amount (> 0)
  -- amount tiền mặt là số RÒNG sau khi thối, không phải tiền khách đưa

orders.bill_payment_id          (null, FK)
table_sessions.bill_payment_id  (null, FK)
orders.payment_instrument       CHECK thêm 'mixed'
```

Đơn trả trước qua Zalo (`checkout-notify`) không ghi vào hai bảng này và không đổi: không có tiền mặt vào két, báo cáo đọc theo đường cũ **[em]**.

### A3. RPC

RPC mới `collect_table_bill(p_session_ids uuid[], p_lines jsonb, p_cash_given int, p_client_request_id uuid)`, dùng cho cả một bàn lẫn gộp bill.

Quy tắc bắt buộc, có test riêng:

1. Tất cả hoặc không có gì, trong một transaction. Cột `payment_received_at` vẫn là cờ "đã thu" duy nhất, nhiều nơi đang đọc nó.
2. Client gửi số tiền từng phương tiện. Server **tự tính** số phải thu sau khi khoá phiên và chia giảm giá, rồi so ở **cấp cả nhóm**. Lệch một đồng thì RAISE và huỷ toàn bộ.
3. Số so sánh là **phần thu lần này**, không phải tổng phiên: đơn đã thu trước đó không tính.
4. Gọi lại cùng `client_request_id` trả kết quả cũ, không tạo khoản thứ hai.
5. Phiên `expired` còn nợ vẫn thu được, bỏ qua giảm giá như hiện tại.
6. Một phương tiện thì `orders.payment_instrument` ghi `cash`/`bank`, hai phương tiện ghi `mixed`.
7. Không còn đường nào cho client thu phiên mà không tạo `bill_payments`. Nhánh `staff_reset` (Bỏ bàn) giữ nguyên.

`confirm_manual_payment` và `kitchen_confirm_payment` (đơn không phiên) cũng ghi một `bill_payments` một dòng, phương tiện suy từ `payment_method`, để két tính đúng.

**Thứ tự deploy:** RPC cũ phải còn chạy cho tới khi Vercel lên code mới, vì tab POS đang mở vẫn cầm bản cũ. Khoá đường cũ bằng một migration riêng sau đó. Bản RPC cũ khác chữ ký thì phải drop và gỡ EXECUTE khỏi `PUBLIC, anon, authenticated`.

### A4. Hiển thị

- `get_bills_report`: gom bill theo `bill_payment_id` nếu có, không có thì theo khoá cũ. TM/CK lấy từ `bill_payment_lines` nếu có, không có thì theo đường cũ. Giữ bất biến cash + bank + other = revenue.
- A04: dòng bill kết hợp hiện nhãn "Kết hợp", ngăn Xem bill hiện từng khoản.
- Excel: thêm cột Tiền mặt, Chuyển khoản, giữ cột Phương thức.
- Phiếu cuối ngày: tổng TM/CK đúng theo khoản.
- `/print/bill` khi in lại bill đã thu ở A04: thêm dòng từng khoản, tiền khách đưa, tiền thối. `get_sessions_bill` phải trả các khoản này.
- POS không thêm bước in sau khi thu **[anh Tú]**.

## 4. Mục B: Ngày kinh doanh và ca

### B1. Ngày kinh doanh

Làm giống KiotViet **[anh Tú]**.

- Cột mới `store_workflow_settings.business_day_start time NOT NULL DEFAULT '00:00'`. Mặc định 00:00 nên quán cũ không đổi.
- Chủ quán cài ở Cài đặt chung, cho chọn 00:00 tới 12:00, bước 30 phút **[em]**. Yên Garden đề xuất 05:00, chốt khi onboard.
- Ngày kinh doanh D chạy từ D + giờ bắt đầu tới đúng 24 giờ sau. Giao dịch đúng giờ bắt đầu thuộc ngày mới, giống KiotViet.
- Không lưu ngày kinh doanh vào từng giao dịch, chỉ tính lúc đọc. Đổi giờ thì báo cáo cũ tính lại theo mốc mới **[em]**.
- Áp cho: `get_bills_report` (mọi mốc cắt ở `v_from`, `v_to`, `v_today`), A04, Excel, phiếu cuối ngày. Cả ba mặt đi qua `loadBillsReport`.
- `vnToday` trong `lib/daily-report.ts` đổi thành hàm tính "ngày kinh doanh hiện tại" theo giờ bắt đầu. Lúc 01:00 sáng, "hôm nay" ở A04 vẫn là ngày hôm trước.
- Không đổi: Timeline, đặt bàn, giờ phục vụ. `get_daily_revenue` không ai gọi, để nguyên.

### B2. Ca

- Công tắc `store_workflow_settings.require_cash_shift boolean DEFAULT false`, theo quán **[anh Tú: chặn]**.
- Mỗi quán mỗi lúc **một ca đang mở**, chung một két **[anh Tú]**. Chủ quán và thu ngân đều thu vào ca đó, ai có quyền POS cũng mở và kết được.
- Ca độc lập với ngày kinh doanh **[anh Tú]**: ca là khoảng từ lúc mở tới lúc đóng. Quên kết ca không làm sai báo cáo ngày.
- Một ngày thường một ca. Đổi người thì kết ca rồi mở ca mới, không giới hạn số ca.

```
cash_shifts
  id, store_id, status ('open' | 'closed'),
  opened_by, opened_at, opening_cash, open_note,
  closed_by, closed_at, counted_cash, expected_cash, difference, close_note
  UNIQUE partial (store_id) WHERE status = 'open'
```

**Mở ca:** vào POS khi bật công tắc mà chưa có ca thì hiện hộp nhập tiền đầu ca. Xem POS vẫn được; chặn ở lúc thu tiền.

**Chặn ở server:** `collect_table_bill`, `confirm_manual_payment`, `kitchen_confirm_payment` báo lỗi "Chưa mở ca" khi bật công tắc mà không có ca mở. Thu chuyển khoản cũng phải có ca, giống KiotViet **[em]**. Đơn trả trước Zalo không bị chặn.

**Kết ca:** đếm trước, thấy sau **[anh Tú]**.
1. Thu ngân nhập tiền đếm được, ghi chú nếu cần.
2. Bấm xác nhận thì server tính và lưu `expected_cash`, `difference`, đóng ca.
3. Hiện kết quả, in phiếu bàn giao 80mm ở `/print/shift-report`.

Công thức, giống KiotViet:

```
Tiền dự kiến = tiền đầu ca + tiền mặt thu trong ca − khoản chi trong ca
Chênh lệch   = tiền đếm được − tiền dự kiến   (âm = thiếu)
```

Server **không trả** tiền dự kiến của ca đang mở cho client. Giới hạn đã biết: A04 vẫn cho thu ngân xem tiền mặt theo ngày, nên người chủ tâm vẫn tính được. Em không chặn thêm vì thu ngân cần A04 **[em]**.

**Quy tắc khác:**
- Một ca đóng một lần, không mở lại, không sửa. Sai thì ghi trong ghi chú ca sau **[em]**.
- Không tự đóng ca.
- Ca quên kết **[anh Tú]**: ca mở từ trước mốc bắt đầu ngày kinh doanh hiện tại thì POS hiện cảnh báo với hai lựa chọn: **Kết ca cũ rồi mở ca mới**, hoặc **Tiếp tục gộp vào ca đó**. Server không chặn thu tiền. Chọn tiếp tục thì ghi người và giờ vào ca, cảnh báo không hiện lại trong ngày kinh doanh đó, phiếu bàn giao ghi "Ca gộp qua N ngày" **[em]**. Ai có quyền POS cũng kết hộ được.
- Kết ca lúc còn bàn đang mở: được, chỉ hiện cảnh báo số bàn còn mở. Tiền thu sau đó vào ca kế tiếp **[em]**.
- Thu bill cũ ở A04 thì tiền vào ca đang mở.
- Phiếu bàn giao gồm: người mở, người kết, giờ mở, giờ đóng, tiền đầu ca, tiền mặt thu, khoản chi, tiền dự kiến, tiền đếm được, chênh lệch, số bill, tổng theo TM/CK, ghi chú.

### B3. Khoản chi trong ca

**[anh Tú]**: nút "Chi tiền từ két" trong ca, trừ vào tiền dự kiến. Không phải sổ quỹ.

```
cash_shift_expenses
  id, shift_id, store_id, amount (> 0), reason (bắt buộc),
  created_by, created_at, voided_by, voided_at
```

Chỉ trừ khi ca đang mở. Huỷ khoản chi được khi ca còn mở, có ghi người và giờ huỷ **[em]**.

### B4. Xem lại ca

Tab "Ca" trong trang Hoá đơn & Báo cáo: danh sách ca, mở từng ca xem chi tiết, in lại phiếu. Chủ quán xem mọi ca; thu ngân xem được ca do mình mở hoặc kết **[em]**.

RPC, RLS theo `is_store_pos_operator` (chủ quán + thu ngân). Quyền xem như trên.

## 5. Mục C: In hai nơi

### C1. Yêu cầu

- Tuỳ chọn cấu hình theo quán **[anh Tú]**: `print_mode` là `browser` (một nơi, in trình duyệt như hôm nay, mặc định) hoặc `agent` (nhiều nơi, qua phần mềm in).
- Yên Garden dùng **2 máy in: 1 cho POS, 1 cho bếp** **[anh Tú]**.
- Cách làm là phần mềm in cài ở quầy **[anh Tú]**, vì trình duyệt chỉ in ngầm ra một máy mặc định.
- Khi `print_mode='agent'`, phần mềm in mọi phiếu **[em]**, vì Yên Garden có đúng hai máy và quầy không nên phải giữ cả hai cách in. Riêng tờ QR bàn A4 vẫn in trình duyệt.

| Phiếu | Ra máy |
|---|---|
| Phiếu chế biến | Theo trạm của danh mục món |
| Phiếu bàn | Quầy |
| Tạm tính, hoá đơn | Quầy |
| Phiếu cuối ngày, phiếu bàn giao ca | Quầy |

### C2. Trạm in

```
print_stations
  id, store_id, name, is_pos boolean, is_default_kitchen boolean, printer_name (null)
menu_categories.print_station_id (null)
```

- Một đơn chia thành một phiếu cho mỗi trạm có món. Đơn chỉ có món của một trạm thì ra một phiếu.
- Gán theo danh mục, không gán theo từng món **[em]**. Đồ uống ở Yên Garden gán trạm Quầy hay Bếp là do quán chọn.
- Danh mục chưa gán, hoặc món không còn danh mục, ra trạm `is_default_kitchen`.
- Đặt món trước (`?job=`) tra trạm theo `menu_item_id` trong snapshot.
- Phiếu chế biến **bỏ giá khi in hai nơi** **[anh Tú]**. Chế độ `browser` giữ nguyên hai liên cùng có giá theo quyết định 2026-09-23, Bảo Lương không đổi.
- Lúc nào in không đổi: khi thu ngân bấm "Duyệt & in bếp". Yên Garden chạy `kitchen_release_policy='pos_confirmation'` như Bảo Lương **[anh Tú]**. Cài đặt không cho bật `print_mode='agent'` khi quán để `automatic`, vì khi đó không có gì kích hoạt in **[em]**.

### C3. Hàng đợi in

```
print_jobs
  id, store_id, station_id, kind, ref jsonb,
  dedupe_key, status ('queued' | 'printing' | 'done' | 'failed' | 'expired'),
  attempts, error, created_by, created_at, printed_at
  UNIQUE (store_id, dedupe_key)

print_agents
  id, store_id, name, token_hash, last_seen_at, version, printers jsonb
```

- Một lớp `lib/print/` mới: chế độ `browser` gọi `printInPlace` như cũ, chế độ `agent` tạo job. Mọi nơi gọi in đổi sang lớp này, gồm: `pos-client.tsx`, `staff/tables/tables-client.tsx`, `bill-drawer.tsx`, `bills-report-view.tsx`.
- `dedupe_key` chống in trùng khi bấm hai lần. Nút "In lại" tạo khoá mới.
- Job chờ quá 30 phút thì chuyển `expired`, không tự in nữa, vì phiếu bếp in muộn gây làm món hai lần **[em]**.

### C4. Phần mềm in

- Thư mục mới `print-agent/`. Electron + TypeScript, chạy Windows 10/11, tự chạy cùng Windows, nằm khay hệ thống **[em]**.
- Electron mở trang in ẩn rồi in thẳng ra máy đã gán. Như vậy dùng lại **nguyên** các trang in HTML 80mm hiện có, tiếng Việt và QR không phải làm lại. Trang mới `/print/agent/<jobId>` kèm token ngắn hạn, render đúng các component đang có.
- Ghép máy: Cài đặt → In ấn → "Thêm máy" sinh mã 6 số dùng trong 10 phút. Phần mềm đổi mã lấy token thiết bị; DB chỉ lưu hash.
- Lấy việc bằng hỏi định kỳ 2 giây, nhận job nguyên tử để không in đôi. Thất bại thử lại 3 lần **[em]**.
- Phần mềm báo danh sách máy in Windows lên `print_agents.printers`. Chủ quán chọn máy cho từng trạm ở Cài đặt.
- Chỉ cần cài trên **một máy tính ở quầy**. Máy in bếp nối LAN, miễn là Windows máy đó thấy.
- MEVO cài hộ. Phiên bản đầu cập nhật bằng tay, không làm tự cập nhật **[em]**. Bản cài chưa ký số nên Windows sẽ cảnh báo lúc cài.

**Rủi ro số 1:** Electron in ngầm khổ 80mm có thể sai khổ giấy, sai độ dài, không cắt giấy. Kết quả phụ thuộc driver, nên phải thử trên **đúng model sẽ lắp ở quán**.

- Yên Garden chưa mua thiết bị, MEVO tư vấn toàn bộ **[anh Tú]**, nên model do mình chọn: xem C7.
- Mua trước **một máy** đúng model để thử, trước khi quán mua đủ.
- Trong lúc chờ máy, agent In làm được phần còn lại và thử bằng máy in ảo "Microsoft Print to PDF". Không được báo xong khi chưa qua bài thử trên máy thật.
- Máy thật không đạt: dừng và báo anh Tú. Phương án lùi **[em]**: quán mở bán ở chế độ `browser`, một máy in ở quầy, không làm ESC/POS trong spec này.

### C5. Khi hỏng

- Phần mềm im quá 30 giây: POS hiện băng đỏ "Máy in chưa kết nối".
- Job `failed` hoặc `expired`: hiện trên POS với nút In lại và nút "In bằng trình duyệt" để quán không bị đứng.
- Phần mềm chạy lại thì tự in phần còn trong hàng đợi chưa quá hạn.

### C6. Cài đặt

Cài đặt → In ấn: chọn chế độ, trạm, máy in cho trạm, trạng thái phần mềm, In thử theo từng trạm. Gán trạm cho danh mục nằm ở trang Món. Chỉ chủ quán sửa được.

### C7. Thiết bị đề xuất cho Yên Garden

**[em]**, anh chốt model và giá với nhà cung cấp trước khi báo quán.

| Thiết bị | Số lượng | Yêu cầu |
|---|---|---|
| Máy in nhiệt 80mm | 2, cùng một model | Cổng **LAN**, dao cắt tự động, có driver Windows. Cùng model để chỉ phải thử một lần |
| Máy tính ở quầy | 1 | Windows 10/11 64-bit, chạy Chrome + phần mềm in |
| Router và dây mạng tới bếp | 1 bộ | Dây mạng, không dùng Wi-Fi cho máy in bếp vì sân vườn dễ rớt sóng. Đặt IP tĩnh cho máy in |

- Ưu tiên LAN cho cả hai máy: bếp xa quầy nên USB không với tới, và máy in không phụ thuộc một cổng trên máy tính.
- Tham khảo: Epson TM-T82III bản USB + LAN (một cửa hàng niêm yết khoảng 3,49 triệu), hoặc Xprinter XP-N160II rẻ hơn nhưng phải xác nhận đúng bản có LAN. Chưa thử model nào với phần mềm in; giá cần hỏi lại.
- Ngân sách và model cuối chốt sau bài thử ở C4.

## 6. Mục D: VietQR

- Thu ngân tự bấm xác nhận **[anh Tú]**: QR chỉ điền sẵn cho khách, không thay đổi cách ghi nhận tiền.
- Tài khoản: dùng `stores.bank_bin`, `bank_account_number`, `bank_account_name` đã có. Mục "Tài khoản nhận tiền" trong Cài đặt: chọn ngân hàng từ danh sách, số tài khoản, tên chủ tài khoản. Chỉ chủ quán sửa. Chưa khai báo thì không hiện QR ở đâu cả.
- Các cột này anon đọc được qua RLS của `stores`. Chấp nhận, vì số tài khoản vốn in trên bill **[em]**.
- Hàm thuần `lib/vietqr.ts`: sinh chuỗi EMVCo theo chuẩn Napas VietQR (dịch vụ `QRIBFTTA`, có số tiền, CRC16-CCITT). Test bằng mẫu đã biết. Ảnh QR dùng thư viện `qrcode` đã có.
- Nội dung chuyển khoản: không dấu, in hoa, tối đa 25 ký tự, gồm tên bàn rút gọn và mã bill 6 ký tự đang hiện ở A04 **[em]**.

**Hiện ở đâu [anh Tú]:**

| Chỗ | Số tiền trong QR |
|---|---|
| Màn Thanh toán POS, khi chọn Chuyển khoản | Số cần thu sau giảm giá |
| Màn Thanh toán POS, khi Kết hợp | Phần chuyển khoản, đổi theo ô nhập |
| Tờ in `/print/bill` của bill **chưa thu** | Số cần thu sau giảm giá |

- Bill **đã thu** không in QR, để khách không chuyển nhầm lần hai **[em]**.
- Tờ tạm tính đã in có thể cũ nếu khách gọi thêm hoặc đổi giảm giá. Thu ngân đối chiếu số tiền trên app ngân hàng như hôm nay. Tờ in ghi rõ giờ in.
- QR trên giấy in rộng tối thiểu 35mm, phải quét được bằng app ngân hàng thật sau khi in nhiệt.
- Mục Tài khoản nhận tiền có mã "Quét thử" 10.000đ để kiểm tra khai đúng bằng app ngân hàng, quét xem không cần chuyển **[anh Tú]**.
- Không đụng Zalo Checkout, không đụng Mini App.

## 7. Ràng buộc kỹ thuật

- Next.js 16 có thay đổi phá vỡ: đọc `admin-web/node_modules/next/dist/docs` trước khi viết route.
- Migration vá hàm đang chạy phải dùng `pg_get_functiondef` + `replace` + raise nếu không còn chuỗi cần vá, neo lấy từ **prod**, không từ `supabase/tests/prod-defs/` (đã cũ so với mig 108/110).
- File `CREATE OR REPLACE` RPC sống nằm riêng một migration.
- Hàm nội bộ mới: `REVOKE ... FROM PUBLIC, anon, authenticated`.
- Server action có lỗi người dùng phải trả `{ok, error}`, không ném. Action dùng `createAdminClient` phải tự kiểm quyền và lọc `store_id`.
- Đừng poll bằng server action trên trang có điều hướng mềm (POS). Trạng thái ca và máy in đọc qua `lib/pos-browser-reads.ts`.
- Kênh Realtime có thể mở hai nơi phải có hậu tố riêng.
- Công thức tiền ở TS và SQL phải giống nhau; `billTotals()` là bản tham chiếu.
- Không `window.confirm`, dùng `ConfirmDialog`.
- Test cần sửa cùng: `supabase/tests/100_*`, `108_*`, `110_*`, `bl4-postgres.integration.mjs`, `lib/bills-report.test.ts`, `bills-report-xlsx.test.ts`, `gg-verify.sql`.
- `@electric-sql/pglite` nằm trong devDependencies của `admin-web`: chạy `npm ci` rồi đặt `PGLITE_MODULE` trỏ vào đó khi chạy test SQL.

## 8. Cách kiểm thử

Mỗi đợt có checklist ở `docs/testing/dot1/`. Theo quy tắc của repo, xong một đợt thì dừng chờ anh Tú báo PASS.

- SQL: kiểm mọi quy tắc A3, công thức két, ranh giới ngày kinh doanh (đúng giờ bắt đầu, phút trước đó).
- Bất biến: tổng khoản = tiền hàng thu; TM + CK + khác = doanh thu; quán không bật gì thì báo cáo ra đúng như trước.
- Thật: thu tiền bill kết hợp, kết ca lệch và khớp, quét QR bằng 3 app ngân hàng (chỉ xem, không cần chuyển), in trên máy thật đúng model, rút dây máy in rồi cắm lại.
- Test trên Bảo Lương (Mini App đã tắt nhưng POS vẫn dùng được) hoặc quán thử, không tạo dữ liệu giả ở quán thật.

## 9. Chia việc cho nhiều agent

Bốn mục đụng chung ba điểm nóng: `PaymentView`, `close_table_session`/`get_bills_report`, `/print/bill`. Chạy song song hết sẽ xung đột, nên chia ba đợt. Mỗi agent một worktree riêng từ `main`. Số migration giữ trước để không trùng; **một người duy nhất áp migration lên prod theo thứ tự**.

| Đợt | Agent | Việc | Migration | Đụng tới |
|---|---|---|---|---|
| 1 (song song) | **In** | Thử máy in thật, trạm, hàng đợi, `print-agent/`, Cài đặt In ấn | 114 | `print-agent/`, `lib/print/`, `/print/agent` |
| 1 | **VietQR nền** | `lib/vietqr.ts`, mục Tài khoản nhận tiền | không | `lib/vietqr.ts`, settings |
| 1 | **Ngày KD** | B1 trọn gói | 111 | `get_bills_report`, `lib/daily-report.ts`, settings |
| 2 | **Thu tiền** | Toàn bộ mục A | 112 | RPC thu, `PaymentView`, báo cáo, Excel, `/print/bill` |
| 3 (song song) | **Ca** | B2, B3, B4 | 113 | Bảng ca, gác RPC thu, POS, A04 |
| 3 | **VietQR ghép** | QR ở `PaymentView` và `/print/bill` | không | `PaymentView`, `/print/bill` |
| 3 | **In ghép** | Đổi mọi nơi gọi in sang lớp mới | không | Các màn gọi in |

- Agent **In** chạy dài nhất và độc lập, nên bắt đầu ngay từ đầu; **đợt 2 không chờ** nó xong. Mig 114 áp sớm hơn 112, 113 vì không phụ thuộc chúng; số migration chỉ là nhãn **[em]**.
- Đợt 2 chỉ một agent vì đây là phần tiền. Đợt 3 bắt đầu sau khi anh Tú PASS đợt 2.
- Mỗi agent code có một agent review độc lập trước khi báo xong.
- Migration baseline `103b` phải được anh Tú duyệt và merge trước **đợt 2**: test tiền cần chạy trên DB sạch, mà thiếu nó thì DB sạch lỗi ở mig 105/110. `103b` chỉ dành cho DB mới, không áp lên prod.
- Go-live dự kiến **2026-12-01** **[anh Tú]**, còn 26 ngày tính từ ngày viết spec. Máy in mẫu cần về trước **2026-11-15** để còn thời gian xử lý nếu bài thử không đạt **[em]**. Nếu thiếu thời gian, thứ tự ưu tiên là A → B → D → C **[em]**, vì C có phương án lùi về một máy in còn tiền và két thì không.

## 10. Việc để người làm tự quyết

- Tách lõi `close_table_session` thế nào để đạt quy tắc A3 số 7.
- Tên và cấu trúc component, giao diện chi tiết theo design system 2026-10-02.
- Cách token ngắn hạn của `/print/agent` hoạt động, miễn là không dùng lại được cho job khác.
- Danh sách ngân hàng: chép trong code hay file dữ liệu.
