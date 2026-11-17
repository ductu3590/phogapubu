# Công nợ nhà cung cấp và phiếu chi tiền hàng

Ngày: 2026-11-17 · Người duyệt: anh Tú · Quán đích: Yên Garden (go-live 2026-12-01), mọi quán dùng kho.

## 1. Vì sao

Yên Garden nhập bia / đồ khô của đại lý theo kiểu **gối đầu** (nhận hàng trước, trả sau). Hiện phiếu nhập "Chưa trả"
chỉ lưu một cờ `paid_status = 'unpaid'` — không ai biết đang nợ đại lý nào bao nhiêu. Trang Công nợ hiện chỉ có nợ
**khách hàng** (mig 123). Kho đã tự ghi phiếu chi khi nhập hàng trả ngay (mig 122b). Khi quán trả tiền sau,
trang Công nợ cần ghi số tiền trả vào từng phiếu nhập và tạo phiếu chi tương ứng để quản lý đối chiếu với đại lý.

## 2. Mục tiêu

| Tình huống | Người dùng thao tác | MEVO ghi nhận |
|---|---|---|
| Nhận hàng và trả ngay | Kho → Phiếu nhập → Đã trả, chọn tiền mặt hoặc chuyển khoản | Nhập kho và tự lập một phiếu chi “Nhập hàng” cho số tiền đã trả. |
| Nhận hàng gối đầu | Kho → Phiếu nhập → Chưa trả, chọn nhà cung cấp (NCC) | Nhập kho và ghi nợ theo phiếu. Tiền trong két và ngân hàng chưa thay đổi. |
| Thanh toán nợ cho đại lý | Công nợ → Nhà cung cấp → chọn một hoặc nhiều phiếu của cùng NCC → Trả nợ | Phân bổ tiền vào phiếu, giảm nợ và tự lập một phiếu chi “Nhập hàng” cho cả lần trả. |
| Trả tiền điện, lương, sửa tủ lạnh hoặc khoản chi ngoài nhập kho | Sổ thu chi → Tạo phiếu chi, hoặc Chi két theo quyền hiện có | Ghi khoản chi theo danh mục đã chọn. Tồn kho và công nợ NCC giữ nguyên. |

Trang Công nợ có hai tab **Khách hàng** và **Nhà cung cấp**. Danh mục NCC lưu tên, SĐT, ghi chú và trạng thái đang dùng/ngừng.

**Giao ca tại Yên Garden.** Khi lấy tiền két trả người giao rau, nhân viên báo chủ quán hoặc quản lý lập phiếu nhập
**Đã trả · Tiền mặt** ngay trong ca đã chi, trước khi kết ca. Nếu nhận rau hôm qua nhưng thực trả hôm nay, lúc nhận
hàng lập phiếu **Chưa trả**, hôm nay trả ở Công nợ. Ngày nhập có thể ghi lùi theo quy tắc Kho. Phiếu chi tiền mặt
gắn với ca đang mở lúc ghi, nên nhập lùi ngày không chuyển khoản chi về ca hôm qua.

### 2.1 Đi chợ và trả tiền thừa trong cùng ca

1. Khi giao tiền đi chợ, thu ngân chờ nhân viên về quyết toán trước khi kết ca. Số tiền giao ban đầu chưa phải số tiền ghi chi.
2. Khi nhân viên về, thu ngân nhận tiền thừa vào két và đối chiếu với tiền mua hàng. Ví dụ giao **1.000.000đ**,
   mua rau **820.000đ**, nhận lại **180.000đ**. Chủ quán hoặc quản lý lập Phiếu nhập **Đã trả · Tiền mặt** theo các dòng
   hàng thực nhận, tổng **820.000đ**. Kho sinh một phiếu chi 820.000đ. Số thực chi đã trừ tiền thừa nên không lập phiếu thu 180.000đ.
   Với khoản mua ngoài nhập kho, người có quyền ghi phiếu chi tay theo số thực chi.
3. Trước khi bấm lưu, người lập được chỉnh các dòng hàng hoặc số tiền trên form. “Nháp” ở đây chỉ là form chưa gửi.
   Sau khi ghi sổ, nếu đã lỡ ghi chi tay 1.000.000đ, chủ quán hoặc quản lý huỷ phiếu sai khi ca còn mở, ghi lý do
   “Ghi nhầm tiền đưa đi chợ”, rồi lập chứng từ đúng theo bước 2. Phiếu đã huỷ còn trong lịch sử với người huỷ và lý do.
   Nếu sai ở phiếu do Kho hoặc Công nợ sinh, thực hiện huỷ tại chứng từ nguồn theo mục 5.

## 3. Không làm (đợt này)

- Trả trước một phần ngay lúc nhập (kiểu "Tiền trả NCC" của KiotViet). Muốn vậy: lưu Chưa trả rồi trả một phần ở Công nợ.
- Xuất Excel / in bảng kê nợ NCC; báo cáo "Phải trả" trong trang Báo cáo. (Để đợt sau, theo mẫu nợ khách.)
- Tích chọn nhanh ở tab **Khách hàng** (hộp Thu nợ khách đã có tích chọn bill bên trong).
- Liên kết phiếu chi tay với phiếu nhập hoặc lần trả nợ, ghi chi hồi tố vào ca đã kết, hay mở luồng nhập hàng nhanh cho thu ngân.
- Tạm ứng đi chợ qua ca và quyết toán theo người cầm tiền để dành cho đợt sau. Nếu giao 1.000.000đ ở ca A và nhận lại
  180.000đ ở ca B, tiền két thực tế biến động ở hai ca. Quy trình v1 ở mục 2.1 chỉ áp dụng khi nhân viên về trước khi kết ca.
- Trả nợ NCC từ POS / màn nhân viên. Chỉ ở trang Công nợ (admin).

**Phản mục tiêu:** Sổ thu chi bị trùng tiền ra (một khoản trả mà hai phiếu chi), số nợ NCC tự lưu sẵn rồi lệch khỏi phiếu,
hoặc tiền mặt trả NCC không đi qua két ca đang mở khi quán bật ca.

## 4. Cách làm đã chọn — Cách A: nợ theo từng phiếu nhập (giống nợ khách)

| Cách | Đánh đổi | Chọn? |
|---|---|---|
| **A. Nợ theo phiếu nhập**: mỗi phiếu Chưa trả là một khoản nợ; mỗi lần trả phân bổ vào phiếu (chọn phiếu hoặc cũ nhất trước) | Nhiều việc nhất; biết rõ phiếu nào còn nợ; chặn huỷ phiếu đã trả một phần; cùng khuôn với nợ khách | ✅ anh Tú chọn |
| B. Chỉ số dư tổng (nhập chưa trả − đã trả) | Nhanh; không biết phiếu nào còn nợ; huỷ phiếu cũ làm số dư âm | ✗ |
| C. Phiếu chi trong Sổ thu chi chính là lần trả nợ | Sửa sâu Sổ thu chi đang ổn; vẫn phải phân bổ như A | ✗ |

## 5. Thiết kế

### 5.1 Dữ liệu (một migration mới, số 143)

- **`suppliers`**: `id, store_id, name (1–120, duy nhất theo lower(btrim(name)) mỗi quán), phone (tuỳ chọn, chuẩn hoá như
  debt_normalize_phone), note ≤ 500, is_active, created_by, created_at`, `UNIQUE (id, store_id)`. RLS bật, không policy,
  mọi đọc / ghi qua RPC (như debt_customers).
- **`inventory_documents.supplier_id`** (FK ghép quán `(supplier_id, store_id)`). `supplier_name` giữ làm **bản chụp tên**
  lúc lưu (hiển thị lịch sử không đổi khi đổi tên NCC).
- **`supplier_payments`**: `id, store_id, supplier_id, amount (1..2.000.000.000), method cash|bank, business_date,
  note ≤ 500, cash_book_entry_id NOT NULL UNIQUE (FK), client_request_id (UNIQUE theo quán), requested_document_ids uuid[] NULL, created_by/at, voided_by/at/reason`.
- **`supplier_payment_allocations`**: `supplier_payment_id, inventory_document_id, amount > 0`, UNIQUE cặp.
- **Số nợ không lưu sẵn**: nợ một phiếu = `total_amount` (phiếu nhập `posted`, `unpaid`) − tổng phân bổ của các lần trả
  chưa huỷ. Nợ NCC = tổng nợ các phiếu. Kho và Công nợ dùng chung phép tính theo phiếu. Tạo index phân bổ theo
  `inventory_document_id` và áp dụng RLS cho cả ba bảng mới theo mẫu mig 123.
- **Sổ thu chi**: `cash_book_entries.source` thêm `'supplier_payment'` (source_ref = id lần trả, bắt buộc); `cash_book_void`
  chặn huỷ thẳng phiếu nguồn này ("Huỷ ở trang Công nợ"), như phiếu nguồn `inventory_receipt`. Danh mục = "Nhập hàng"
  (hệ thống) — báo cáo lãi lỗ đã loại nhóm này (mig 125) nên không tính trùng giá vốn.
  Cả hai nguồn tiền hàng chỉ sinh phiếu loại chi. Mỗi chứng từ nguồn có tối đa một phiếu chi còn hiệu lực.
  RPC ghi tay và Chi két tiếp tục từ chối danh mục hệ thống này.
- **Backfill**: tạo NCC từ các `supplier_name` khác nhau đã có (gộp theo lower+trim), nối `supplier_id`. Phiếu nhập Chưa trả
  cũ có NCC tự thành nợ; phiếu Chưa trả cũ không có tên NCC không vào nợ (dữ liệu prod đều là test).

### 5.2 Lưu phiếu nhập (`inventory_post_document`, vá tại chỗ)

- Nhận `supplier_id` **hoặc** `supplier_name`. Có tên mà chưa có NCC trùng tên (không phân biệt hoa thường) → **tạo NCC mới
  luôn** trong cùng giao dịch; trùng tên một NCC đã ngừng → dùng lại NCC đó và bật lại.
- **Chưa trả bắt buộc có NCC** ("Phiếu chưa trả cần nhà cung cấp"). Đã trả thì NCC vẫn tuỳ chọn.
- **Đã trả** dùng luồng mig 122b. Khi tổng tiền lớn hơn 0, Kho tự tạo đúng một phiếu chi cùng giao dịch lưu phiếu nhập.
  Phiếu tổng 0đ không phát sinh tiền ra. Nếu ghi chi thất bại (ví dụ trả tiền mặt khi quán bật ca nhưng chưa mở ca),
  toàn bộ giao dịch được hoàn tác. Huỷ phiếu nhập Đã trả sẽ huỷ phiếu chi đi kèm theo quy tắc ca hiện hành.
- Huỷ phiếu nhập: phiếu Chưa trả còn **phân bổ chưa huỷ** → chặn "Phiếu đã trả nợ một phần — huỷ lần trả trước". Phiếu
  Chưa trả chưa trả đồng nào → huỷ bình thường, khoản nợ tự mất.

### 5.3 RPC trả nợ NCC

- `supplier_pay(p_supplier_id, p_amount, p_method, p_document_ids uuid[] NULL, p_note, p_client_request_id)`
  dành cho chủ quán và quản lý. Với yêu cầu mới, khoá NCC rồi khoá các phiếu theo thứ tự ID và đọc lại số dư.
  Nếu một phiếu được chọn sai quán, sai NCC, đã huỷ hoặc hết nợ, từ chối toàn bộ và yêu cầu tải lại.
  Số tiền trả phải lớn hơn 0 và tối đa bằng tổng còn nợ của tập phiếu. NULL nghĩa là mọi phiếu còn nợ của NCC.
  Phân bổ theo ngày phiếu cũ nhất trước, cùng ngày thì theo thời điểm tạo rồi ID.
- Trong cùng giao dịch, cấp ID lần trả, ghi **một phiếu chi** danh mục “Nhập hàng” với số tiền trả, phương thức
  và tên NCC, rồi lưu lần trả cùng các phân bổ. Tổng phân bổ phải bằng số tiền phiếu chi. Ghi chú liệt kê các phiếu
  thực nhận tiền, ví dụ `Trả nợ NCC: PN-0003, PN-0005`. Khi ghi chú vượt 500 ký tự, rút gọn và dành chỗ cho
  `… (+N phiếu)` nếu phải lược số phiếu. Chi tiết lần trả luôn có đầy đủ phân bổ.
- Tiền mặt khi quán bật ca cần ca mở. Chuyển khoản ghi vào quỹ ngân hàng. Lỗi ở bất kỳ bước nào hoàn tác cả lần trả.
  Gửi lại cùng mã và cùng nội dung trả kết quả đã ghi, kể cả khi ca đã kết. Dùng lại mã với nội dung khác thì báo lỗi.
- `supplier_payment_void(p_id, p_reason)`: back office; huỷ lần trả + huỷ phiếu chi đi kèm trong cùng giao dịch. Phiếu chi
  tiền mặt mà ca đã kết → chặn như 122b.
- Đọc: `supplier_list(p_store_id)` (NCC + tổng nợ + số phiếu nợ + phiếu nợ cũ nhất), `supplier_detail(p_supplier_id)`
  (phiếu nợ từng dòng: số phiếu, ngày, tổng, đã trả, còn nợ; lịch sử trả), `supplier_upsert`, `supplier_set_active`.

### 5.4 Giao diện

**Phiếu nhập** (`receipt-form.tsx`):
```
Nhà cung cấp  [ Đại lý bia Hà            ▾ ]   ← gợi ý từ danh sách NCC đang dùng; gõ tên mới = tạo NCC
Trả tiền      ( Chưa trả ) ( Đã trả )
  Chưa trả:  "Phiếu sẽ ghi vào công nợ NCC Đại lý bia Hà." (chưa chọn NCC → nút Lưu báo "Chọn nhà cung cấp")
  Đã trả:    ( Tiền mặt ) ( Chuyển khoản )
             Khi có tiền trả, Kho tự ghi phiếu chi “Nhập hàng”.
```

**Công nợ** (`/admin/debts`): hai tab `Khách hàng | Nhà cung cấp`, tab nhớ trên URL `?tab=suppliers`. Tab NCC giống tab
khách: thẻ "Tổng phải trả" + "NCC đang nợ", tìm theo tên / SĐT, "Chỉ NCC còn nợ", "+ Thêm NCC", bảng (thẻ trên điện thoại).

**Ngăn kéo một NCC** — điểm mới anh Tú yêu cầu, tích chọn ngay trên dòng nợ:
```
Đại lý bia Hà · 0912…                       Đang nợ 12.400.000đ
[Trả nợ]  [Sửa NCC]  [Ngừng theo dõi]

PHIẾU CÒN NỢ (4)                              [☐ Chọn tất cả]
 ☑ PN-0003 · 02/11      tổng 5.000.000   còn 3.000.000
 ☑ PN-0005 · 06/11      tổng 4.200.000   còn 4.200.000
 ☐ PN-0007 · 10/11      ...
 ☐ PN-0009 · 15/11      ...
┌───────────────────────────────────────────────┐   ← thanh dính đáy, chỉ hiện khi có tích
│ Đã chọn 2 phiếu · 7.200.000đ  [Trả các phiếu đã chọn] │
└───────────────────────────────────────────────┘
Đã trả hết (n) ▸
LỊCH SỬ TRẢ NỢ  (mỗi lần: giờ · PT · người · số tiền · "PN-0003, PN-0005" · Huỷ)
```
- **Trả các phiếu đã chọn** → hộp xác nhận điền sẵn số tiền = tổng còn nợ các phiếu đã chọn (sửa được, nhỏ hơn thì trả
  một phần, cũ nhất trước). Hiện số tiền dự kiến trả cho từng phiếu. Người dùng chọn Tiền mặt / Chuyển khoản,
  có thể thêm ghi chú và bấm **Xác nhận trả**.
- **Trả nợ** (không tích) → cùng hộp, số tiền trống, mặc định mọi phiếu còn nợ, có danh sách tích bên trong như hộp Thu nợ khách.
- Bấm số phiếu nhập → mở chi tiết phiếu ở trang Kho.
- "Đã trả hết (n)" chỉ gồm phiếu lưu **Chưa trả** rồi trả xong qua Công nợ (phiếu lưu Đã trả không phải nợ, không hiện).

**Trang Kho** (danh sách + chi tiết phiếu nhập): `paid_status` không đổi sau khi trả nợ (số nợ không lưu sẵn), nên server
trả thêm `outstanding` tính sẵn. Phiếu Chưa trả có NCC hiện **"Còn nợ 3.000.000đ"** hoặc **"Đã trả hết qua công nợ"**.
Phiếu Chưa trả cũ thiếu NCC dùng nhãn và quy tắc số dư ở mục 7.

**Sổ thu chi và Chi két.** Trong form chi tay, ghi rõ “Tiền mua hàng nhập kho ghi ở Kho. Trả nợ nhà cung cấp ghi ở Công nợ.”
Trong ô chọn danh mục của cả **Sổ thu chi → Tạo phiếu chi** và **POS → Chi két**, danh mục loại chi có tên hiện tại đúng bằng
“Đi chợ” hiển thị là **“Chi đi chợ ngoài nhập kho”**. Danh mục quán đã đổi tên hiển thị theo tên quán đặt.
Đây là nhãn trong hai form. Sổ, Excel, báo cáo và phiếu cũ tiếp tục đọc tên danh mục đã lưu.
Hiển thị nguồn **Trả nợ NCC** trong Sổ, chi tiết ca và Excel Sổ thu chi.
Dòng chi do Kho hoặc Công nợ tạo chỉ dẫn về đúng nơi huỷ chứng từ gốc.

### 5.5 Quyền

- Xem tab NCC, trả nợ, huỷ lần trả, thêm / sửa / ngừng NCC: **chủ quán + quản lý** (back office, như Kho). Thu ngân không
  thấy tab NCC.

## 6. Ràng buộc

- Tiền do server tính (số nợ, phân bổ, tổng chọn). UI chỉ cộng để điền sẵn ô và xem trước; server kiểm lại.
- Ô tiền dùng `parseVnd`. Server action trả `{ok, error}`, tự kiểm quyền + lọc `store_id`.
- Trả nợ, huỷ lần trả và huỷ phiếu nhập có NCC dùng cùng thứ tự khoá **NCC trước, phiếu nhập sau**.
  Kiểm lại trạng thái và phân bổ sau khi lấy khoá. Kiểm thử các thao tác đồng thời trên PostgreSQL.
- Vá `inventory_post_document` / `inventory_void_document` / `cash_book_void` / `cash_book_create_internal_result` tại chỗ
  bằng `pg_get_functiondef` + neo khớp đúng một lần (mẫu 122b). Hàm nội bộ mới `REVOKE … FROM PUBLIC, anon, authenticated`.

## 7. Phần để người xây quyết

Tên hàm / file cụ thể, cách chia component, câu chữ thông báo lỗi phụ, thứ tự sắp NCC trong bảng (đề xuất: nợ nhiều trước).

Các quy tắc đã chốt cho v1:
- **"Cùng nội dung" khi gửi lại cùng mã** = cùng NCC, số tiền, phương thức, và danh sách phiếu yêu cầu (so sau khi sắp; NULL
  chỉ khớp NULL). So theo tập ID người dùng yêu cầu, kể cả phiếu chưa nhận phân bổ khi trả một phần. Gửi lại với ghi chú
  khác vẫn trả giao dịch đã ghi và giữ ghi chú lần đầu.
- **Phiếu Chưa trả cũ thiếu NCC sau backfill** hiện **“Chưa trả · Thiếu nhà cung cấp”** ở Kho, trả `outstanding = NULL`
  và nằm ngoài tổng phải trả theo NCC. Phiếu Chưa trả mới vẫn bắt buộc có NCC.
- **Hai người cùng lưu tên NCC mới** trong cùng quán dùng chung một NCC theo khoá tên ở mục 5.1. Cả hai phiếu nhập
  đều lưu được, lần sau giữ SĐT và ghi chú của NCC vừa tạo. Mỗi quán có danh mục NCC riêng.

## 8. Tình huống nghiệm thu

| Thao tác tại quán | Kết quả cần đối chiếu |
|---|---|
| Giao 1.000.000đ đi chợ, nhân viên trả lại 180.000đ trong ca. Chỉnh các dòng rau trên form về tổng thực mua 820.000đ rồi lưu Đã trả. | Trước khi lưu, Sổ chưa phát sinh thu chi. Sau khi lưu, Kho ghi đúng hàng thực nhận, Sổ có một phiếu chi 820.000đ, két dự kiến giảm 820.000đ, không phát sinh phiếu thu tiền thừa. |
| Cùng ví dụ trên nhưng đã ghi nhầm phiếu chi tay 1.000.000đ. Chủ quán huỷ trong ca rồi lập phiếu nhập rau 820.000đ. | Tra được phiếu 1.000.000đ đã huỷ, người huỷ và lý do. Chỉ phiếu chi 820.000đ còn hiệu lực. Nếu ca của phiếu sai đã kết, hệ thống từ chối huỷ và giữ số két đã chốt. |
| Ca A nhận rau 500.000đ, lấy tiền két trả ngay và lập phiếu nhập Đã trả trước khi kết ca. | Tồn kho tăng, nợ NCC không tăng. Sổ có đúng một phiếu chi “Nhập hàng” 500.000đ. Két dự kiến ca A giảm 500.000đ, ca B không bị trừ. Báo cáo lãi lỗ không cộng khoản mua vào chi phí hoạt động. |
| Hôm qua nhận rau 500.000đ, lập phiếu Chưa trả. Hôm nay mở ca B rồi trả tiền mặt ở Công nợ. | Hôm qua nợ NCC tăng 500.000đ, két chưa đổi. Hôm nay nợ về 0, két ca B giảm 500.000đ, lần trả có đúng một phiếu chi. |
| Chọn PN-0003 còn 3 triệu và PN-0005 còn 4,2 triệu, chuyển khoản 4 triệu. | PN-0003 hết nợ, PN-0005 còn 3,2 triệu. Một phiếu chi ngân hàng 4 triệu có cả hai số phiếu. Két tiền mặt không đổi. |
| Bấm xác nhận hai lần, hoặc hai máy cùng trả khoản nợ cuối bằng hai mã khác nhau. | Sổ chỉ có một phiếu chi cho khoản nợ cuối. Cùng yêu cầu nhận lại kết quả cũ. Yêu cầu mới vượt số còn nợ bị từ chối. |
| Khi quán bật ca, thử nhập Đã trả bằng tiền mặt hoặc trả nợ bằng tiền mặt lúc chưa mở ca. | Cả hai thao tác báo “Chưa mở ca”. Kho, số nợ và Sổ thu chi giữ nguyên. Chuyển khoản vẫn ghi được. |
| Huỷ lần trả tiền mặt khi ca còn mở, rồi thử huỷ một lần trả khác có ca đã kết. | Lần đầu khôi phục số nợ từng phiếu và huỷ phiếu chi cùng giao dịch. Lần sau báo ca đã kết, giữ nguyên nợ và phiếu chi. |
| Ghi chi sửa tủ lạnh ở Sổ hoặc Chi két. Thử chọn “Nhập hàng” ở form và gửi trực tiếp qua RPC chi tay. | Chi sửa tủ lạnh ghi đúng danh mục, không thêm hàng hay thay đổi nợ. Form chỉ cho chọn danh mục chi tay và RPC từ chối “Nhập hàng”. |
