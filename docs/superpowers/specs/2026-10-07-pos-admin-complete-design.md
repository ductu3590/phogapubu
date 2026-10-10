# Hoàn thiện quản lý quán qua POS (đối chiếu A01–A05)

Ngày 2026-10-07 · Anh Tú duyệt hướng 2026-10-07 · Nguồn: rà soát bản vẽ `D:\Code\mevo\docs\design\a01…a05`
so với admin-web trên `main` (4421fd8).

## Vì sao

Khung hộp thoại quản trị đè lên POS (ST-3) đã xong, nhưng nội dung từng tab còn thiếu so với bản vẽ ở đúng những
chỗ vận hành hằng ngày của quán trả sau (Bảo Lương) cần:

- Cuối ngày **không đối chiếu được két**: báo cáo chỉ có tổng hôm nay, không tách tiền mặt / chuyển khoản, liệt kê
  theo lượt gọi chứ không theo bill.
- **Không có vai trò Thu ngân**: muốn có người ngồi quầy thì phải đưa mật khẩu chủ quán.
- 20 bàn phải **tải QR từng cái**; khu vực chỉ quản lý được trong sơ đồ POS.
- Menu 65 món **không tìm được**, không có mã món, không có nhãn nổi bật cho khách.

## Không làm (đã chốt)

- **Ca làm việc** (giờ ca, người trực, chốt ca, phiếu bàn giao) — để sau, báo cáo theo NGÀY trước.
- **Số ghế từng bàn**.
- **Gợi ý nhả bàn khi khách trễ** — POS đã có sẵn.
- Cấu hình máy in mạng LAN (IP / model / còi) — web không nói chuyện trực tiếp với máy in; in qua trình duyệt như cũ.
- VietQR trên bill (đã hoãn từ 2026-08-31), PIN quản lý, ma trận RBAC đầy đủ, xuất Excel, điều chỉnh giá hàng loạt.
- Toàn bộ A06–A11 (`/mevo`) ngoài phần ST-4 đã làm.

## Quyết định của anh Tú (2026-10-07)

| Câu hỏi | Chốt |
|---|---|
| Kiểu chuông / âm lượng lưu ở đâu | **Kiểu theo quán** (DB), **âm lượng theo máy** (localStorage) |
| Thu ngân bỏ/tặng món | **Được**, bắt buộc lý do, ghi tên người làm |
| Thu ngân vào được gì ngoài POS | **Báo cáo ngày + Hoá đơn**, **Đặt bàn**, **bật/tắt "Tạm hết"** món |
| Nhãn món hiện ở đâu | **Cả admin lẫn Mini App** |
| Mã món | **Tự sinh theo danh mục**, sửa tay được, sinh luôn cho món cũ |

## Sprint (mỗi sprint dừng chờ PASS)

| Sprint | Nội dung | Migration |
|---|---|---|
| **PA-1** | Bánh răng trên rail · chọn kiểu chuông + âm lượng · Báo cáo ngày theo bill | 091 |
| **PA-2** | Vai trò Thu ngân | 092 |
| **PA-3** | Sơ đồ bàn & QR theo khu + màu khu + in QR hàng loạt | 093 |
| **PA-4** | Thực đơn: tìm, lọc, mã món, nhãn món (+ Mini App) | 094 |
| **PA-5** | In địa chỉ chân bill + nút In thử | không |

Số migration là dự kiến; lấy số kế tiếp thật lúc làm. Mỗi file chỉ chứa DDL + hàm của sprint đó. Hàm sống bị
`CREATE OR REPLACE` lại phải nằm ở file riêng và không ghi "rerun-safe" (quyết định 2026-09-01).

---

## PA-1 — Bánh răng, chuông, Báo cáo ngày

### 1.1 Bánh răng trên rail

- Rail khu chủ quán (`admin-nav.tsx`) thêm mục **⚙ Cài đặt** đặt **ngay trên ô "Thêm"** (cuối rail, không lẫn với
  nhóm POS · Món · Đơn · Báo cáo). Trỏ `/admin/settings` → mở hộp thoại cấu hình ở tab **Cấu hình quán**
  (intercepting route sẵn có).
- `adminMoreItems()` **bỏ** mục "Cài đặt quán".
- Màn điện thoại (menu ☰): mục Cài đặt hiện ở đầu nhóm "Thêm".
- Mục đang chọn: rail sáng ⚙ khi đang ở `/admin/settings`.

### 1.2 Kiểu chuông + âm lượng

**Dữ liệu**
- `stores.bell_style text NOT NULL DEFAULT 'double' CHECK (bell_style IN ('double','soft','repeat'))`.
- Đọc qua `get_public_store_workflow` hoặc truy vấn `stores` sẵn có của POS — chọn chỗ đang được cả POS, màn nhân
  viên, màn bếp đọc lúc tải; không thêm round-trip mới.
- Âm lượng: localStorage key `mevo_bell_volume` (0–100, mặc định 80). Đọc/ghi bọc try/catch; lỗi thì dùng 80.

**3 kiểu** (Web Audio tổng hợp, không file âm thanh):

| Giá trị | Tên hiển thị | Âm |
|---|---|---|
| `double` | Ding-dong kép (chuẩn) | Đúng tiếng `playBell()` hiện tại |
| `soft` | Gõ nhẹ (không gây ồn) | 1 nốt ngắn, âm lượng đỉnh thấp hơn |
| `repeat` | Báo liên tục tới khi nhận | Ding-dong kép lặp mỗi ~3 giây cho tới khi việc gây chuông được xử lý / thấy |

- `lib/bell.ts`: `playBell(opts?)` nhận `{ style, volume }`; gain đỉnh nhân theo volume (0 = im). Thêm
  `startRepeatingBell(key)` / `stopRepeatingBell(key)` cho kiểu `repeat`.
- Kiểu `repeat` dừng khi **một trong hai** xảy ra: người dùng có thao tác bất kỳ trên trang (bấm / chạm / gõ phím
  — nghĩa là đã có người ở quầy), hoặc mục gây chuông không còn trong hàng việc (đã duyệt / đã nhận gọi NV). Có
  việc mới đến sau đó thì bắt đầu lặp lại. **Không bao giờ** kêu tiếp khi hàng việc đã rỗng.
- Mọi nơi gọi `playBell()` (POS, đặt bàn, `/staff/tables` hàng gọi NV, màn bếp) dùng chung kiểu + âm lượng.
  Màn bếp hiện có bộ âm riêng trong `kitchen-display.tsx` → chuyển sang `lib/bell.ts`.

**Giao diện** — tab Cấu hình quán, khối mới "Âm thanh thông báo":
- Chọn kiểu chuông (3 lựa chọn, lưu DB bằng nút Lưu của khối, chỉ chủ quán).
- Thanh trượt "Âm lượng trên máy này" + nút **Nghe thử** (lưu ngay localStorage, không cần bấm Lưu). Ghi chú nhỏ:
  "Mỗi máy chỉnh riêng".
- Thu ngân (PA-2) không vào được tab này → thanh trượt âm lượng cũng hiện ở **POS** (một nút loa nhỏ trên thanh
  trên mở ô chỉnh âm lượng + Nghe thử) để máy quầy chỉnh được.

### 1.3 Báo cáo ngày

**Thay** nội dung tab "Báo cáo" (`/admin/dashboard`). Tab "Đơn" (`/admin/orders`) **giữ nguyên** (Pubu trả trước
còn dùng).

**RPC** `get_daily_report(p_store_id uuid, p_date date) RETURNS jsonb`, `SECURITY DEFINER`, `STABLE`:
- Kiểm quyền: PA-1 dùng `is_store_owner_of(p_store_id)`; PA-2 đổi sang `is_store_pos_operator`.
- Ngày tính theo `Asia/Ho_Chi_Minh` ( `[p_date 00:00, p_date+1 00:00)` giờ VN ).
- Trả về:
  - `totals`: `{ revenue, cash, bank, other, bills_count }` — **tiền thật đã nhận** trong ngày, khớp định nghĩa
    doanh thu 2026-06-28: bill trả sau đóng `paid` (theo `payment_instrument` của phiên) + đơn trả trước có tiền
    thật (`zalopay_trans_id` / `payment_received_at`). Đơn trả trước không thuộc phiên nào được tính như một
    "bill" riêng với `instrument` = phương thức của đơn (`other` nếu không xác định được TM/CK).
  - `open`: `{ tables_count, provisional_total }` — phiên đang mở lúc gọi, tạm tính theo `recompute_order_total`.
  - `bills[]`: mỗi bill đã đóng `{ session_id | order_id, closed_at, table_labels, tray_label, items_count, total,
    instrument, closed_by_name, merged_group }`. Bill gộp (gộp N mâm) hiện **một dòng** với tổng chung.
  - `adjustments[]`: món bỏ/tặng trong ngày `{ at, table_label, item_name, quantity, amount, type: cancelled|gift,
    reason, by_name }`.
- Số tiền đều tính ở server, client chỉ hiển thị.

**Giao diện** (theo A04, bỏ phần ca):
- Đầu: bộ chọn ngày (mặc định hôm nay, chọn được ngày trước; không chọn ngày tương lai).
- 4 thẻ: **Tổng thực thu** (kèm số bill) · **Tiền mặt** · **Chuyển khoản** · **Đang mở / chưa thu** (N bàn ·
  tạm tính). Có `other` > 0 thì thẻ Tổng ghi chú "trong đó X khác".
- **Danh sách bill**: giờ đóng · bàn/mâm · số món · tổng · nhãn TM/CK · người thu. Bấm dòng → xem chi tiết bill
  (dùng lại thành phần hiển thị bill sẵn có ở POS/print) + nút **In lại** (mở trang in 80mm sẵn có của bill đó).
- **Điều chỉnh bill**: danh sách bỏ/tặng của ngày; trống thì "Không có điều chỉnh nào".
- Điện thoại: thẻ xếp 2×2, bảng thành danh sách dòng.
- Dữ liệu tải lại khi đổi ngày; hôm nay thì có nút "Làm mới" (không poll).

---

## PA-2 — Vai trò Thu ngân

**Dữ liệu**
- `mevo_operators.role` thêm giá trị `store_cashier` (sửa CHECK; `store_id` bắt buộc như `store_staff`).
- Hàm `is_store_pos_operator(p_store_id uuid) RETURNS boolean` = người gọi là `store_owner` **hoặc**
  `store_cashier` đang active của đúng quán.
- **Thay** `is_store_owner_of` → `is_store_pos_operator` **chỉ trong** các RPC thao tác POS / đặt bàn / báo cáo:
  duyệt & từ chối lượt (`pos_confirm_order`, từ chối), đóng / gộp bill, mở / ghép / thêm bàn / nhập mâm, nhả quyền
  gọi món, thêm món tay, bỏ / tặng / khôi phục món, in lại phiếu, các RPC đặt bàn POS dùng (nhận khách, no-show,
  đổi giờ / đổi bàn, huỷ), RPC đọc POS (`list_open_table_sessions`, gọi NV, đặt bàn…), `get_daily_report`, bật/tắt
  `menu_items.is_available`.
- Plan phải **liệt kê đầy đủ** từng hàm đang dùng `is_store_owner_of` (≈31 hàm trong 14 file) và đánh dấu
  chuyển / giữ. Mặc định **giữ owner-only** nếu không chắc.
- Bật/tắt "Tạm hết": RPC riêng `set_menu_item_available(p_item_id, p_available)` kiểm `is_store_pos_operator`
  (không mở RLS UPDATE `menu_items` cho thu ngân — tránh sửa được giá).
- RLS đọc: thu ngân đọc được các bảng POS đang đọc trực tiếp từ trình duyệt (`lib/pos-browser-reads.ts`) — rà
  từng bảng; ghi trực tiếp bảng vẫn chỉ qua RPC.

**Server (Next)**
- `Operator` thêm `{ role: 'store_cashier'; storeId }`. Thay các guard TS owner-only ở đường POS / đặt bàn / báo
  cáo / toggle tạm hết bằng guard "owner hoặc cashier"; còn lại giữ owner-only (≈64 chỗ — plan liệt kê).
- `/admin` layout: thu ngân vào `/admin` → chuyển `/admin/pos`. Mở thẳng URL trang cấm (settings, menu sửa,
  tables, staff, vouchers, spin) → chuyển `/admin/pos`.
- Rail thu ngân: **POS · Báo cáo**. Ô Thêm: **Đặt bàn** (nếu quán bật) · **Thực đơn (Tạm hết)** · **Tài khoản**.
  Không có ⚙. Hộp thoại cấu hình chỉ hiện các tab đó.
- Tab Thực đơn với thu ngân: chỉ danh sách + ô tìm/lọc (PA-4) + công tắc Tạm hết; ẩn mọi nút thêm/sửa/xoá/kéo.
- Bỏ/tặng món: giữ nguyên luồng bắt buộc lý do; người làm ghi theo tài khoản đăng nhập (đã có từ mig 046).

**Tab Nhân viên** (chủ quán)
- Form thêm: email + **vai trò** (Nhân viên phục vụ / Thu ngân).
- Danh sách hiện nhãn vai trò; nút **Đổi vai trò** (staff ↔ cashier). Vô hiệu hoá / bật lại như cũ.
- Đổi vai trò có hiệu lực ở lần tải trang kế tiếp của người đó (không đá phiên đang mở).

---

## PA-3 — Sơ đồ bàn & QR theo khu

**Dữ liệu**
- `table_areas.color text NOT NULL DEFAULT 'violet' CHECK (color IN ('violet','pink','indigo','fuchsia','cyan',
  'brown','slate','rose'))`. Khu cũ được gán màu lần lượt theo `sort_order`.
- Bảng màu (`lib/area-colors.ts`) — **không dùng** xanh lá / cam / vàng / đỏ / xám trạng thái và tránh trùng hẳn màu
  mâm: plan chọn mã Tailwind cụ thể, mỗi màu có nền nhạt + chữ đậm đủ tương phản.

**Tab Sơ đồ bàn & QR** (`/admin/tables`, theo A03, bỏ số ghế / QR ghép / ghi chú mica)
- Đầu tab: **+ Thêm khu** · **+ Thêm bàn** · **In QR hàng loạt**.
- Bàn nhóm theo khu (thứ tự `sort_order`), nhóm "Chưa phân khu" cuối nếu có bàn chưa phân.
- Đầu mỗi khu: **nhãn màu** (chấm/viền màu + tên khu) · "N bàn" · nút **Tuỳ chỉnh khu** → hộp nhỏ: đổi tên, chọn
  màu (8 ô), xoá khu (chỉ khi không còn bàn; còn bàn thì báo "Chuyển hết bàn sang khu khác trước").
- Mỗi bàn: tên · bật/tắt · tải QR PNG (như cũ) · **In QR** (1 bàn) · đổi khu (chọn khu) · xoá.
- **+ Thêm bàn**: tên + chọn khu.
- Thứ tự khu / vị trí bàn trên sơ đồ: vẫn chỉnh ở POS như cũ (không làm kéo thả ở tab này).
- Thao tác khu dùng lại server action / RPC sẵn có của `use-floor-layout` khi có; thêm hàm nếu thiếu (đổi màu).

**Màu khu ở POS**: tiêu đề khu trên Timeline + sơ đồ + thanh chọn khu dùng màu khu (nhận diện, không phải trạng
thái — giống quy tắc màu mâm 2026-10-02: vạch/nhãn màu, nền ô vẫn trắng).

**In QR hàng loạt** — trang in mới `/admin/tables/print-qr?area=<id|all>`:
- A4 dọc, lưới **3×4** (12 mã/trang), mỗi ô: QR (dùng `buildTableQRUrl` sẵn có) · tên bàn chữ to · tên khu + màu
  · tên quán nhỏ · đường cắt nét đứt.
- Nút trên trang: **In** (gọi `window.print()`); ghi chú "Chọn 'Lưu dưới dạng PDF' để lấy file".
- Bộ chọn: Cả quán / từng khu. Chỉ bàn đang bật.
- Không thêm thư viện PDF.

---

## PA-4 — Thực đơn: tìm, lọc, mã món, nhãn

**Dữ liệu**
- `menu_categories.sku_prefix text` — tự sinh khi tạo danh mục: bỏ dấu tiếng Việt, lấy chữ cái đầu mỗi từ (bỏ ký
  tự không phải chữ/số), viết hoa, tối đa 4 ký tự; trùng prefix trong quán thì thêm số (`BDU`, `BDU2`). Sửa tay
  được (A–Z, 0–9, 1–6 ký tự, không trùng trong quán).
- `menu_items.sku text` — tự sinh `PREFIX-NNN` (NNN = số kế tiếp lớn nhất của prefix đó trong quán, 3 chữ số) khi
  tạo món. **UNIQUE (store_id, sku)** (sku null được phép). Sửa tay được. Đổi danh mục **không** đổi mã cũ.
- Migration **backfill**: sinh prefix cho mọi danh mục, sinh mã cho mọi món theo `sort_order`.
- Sinh mã làm ở **DB** (trigger BEFORE INSERT khi `sku` null) để món tạo từ mọi đường đều có mã; hàm sinh prefix
  thuần cũng có bản TS để form xem trước — hai bản phải cho cùng kết quả (test chung bộ ca).
- `menu_items.badge text NULL CHECK (badge IN ('best_seller','signature'))`.

**Admin** (tab Thực đơn & Giá)
- Thanh trên danh sách: **ô tìm** (tên hoặc mã, bỏ dấu khi so) · **lọc** Tất cả (N) / Đang bán (N) / Tạm hết (N).
  Đang tìm/lọc thì **tắt kéo-sắp-xếp** (tránh sắp sai thứ tự trên tập con), có dòng nhắc.
- Mỗi món hiện **mã** (chữ nhỏ, đơn cách) + **nhãn** (Best seller / Món của quán) cạnh tên.
- Form món: ô **Mã món** (điền sẵn mã sẽ sinh, sửa được) + chọn **Nhãn** (Không / Best seller / Món của quán).
- Form danh mục: ô **Tiền tố mã**.
- Lỗi trùng mã → báo "Mã món đã dùng cho «tên món»".

**Mini App** (code lõi `mini-app/src`)
- Thẻ món + trang chi tiết món hiện nhãn nhỏ: "Best seller" / "Món của quán", dùng `stores.primary_color`.
- Không hiện mã món cho khách.
- Sau PASS: merge `main` vào worktree Bảo Lương rồi `zmp deploy` (anh Tú chạy; nhắc chọn Development / Testing).

---

## PA-5 — Vá nhỏ in ấn

- Phiếu in 80mm (bill tạm tính / hoá đơn, `print-order`, `/staff/tables/print`) in thêm **địa chỉ quán** dưới
  tên + SĐT, nếu có.
- Tab Cấu hình quán, khối mới "In ấn": nút **In thử** → mở phiếu mẫu 80mm (tên/địa chỉ/SĐT quán thật, 2 món mẫu,
  ghi "PHIẾU IN THỬ"), không tạo đơn, không ghi DB.

---

## Kiểm thử

- Vitest cho hàm thuần: sinh prefix/mã món (cả bộ ca tiếng Việt), gom số liệu báo cáo phía hiển thị, chọn màu khu
  cho khu cũ, guard quyền theo vai trò (`admin-nav`, redirect), âm lượng/kiểu chuông đọc localStorage hỏng.
- Migration: áp prod qua Supabase MCP (được phép tự chạy); mỗi RPC mới có câu SQL kiểm tra nhanh trong plan
  (gọi bằng owner / cashier / quán khác).
- Mỗi sprint có checklist test tay `docs/testing/pos-admin-complete/PA-N.md`, test trên **Bảo Lương**.
- Mỗi sprint xong: dừng, báo "test theo PA-N", chờ PASS.

## Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| PA-2 mở quyền nhầm một RPC tiền / cấu hình cho thu ngân | Plan liệt kê từng hàm + lý do; mặc định giữ owner-only; test gọi RPC cấm bằng tài khoản thu ngân phải lỗi |
| `CREATE OR REPLACE` lại RPC sống lùi bản mới hơn | Lấy định nghĩa **hiện tại trên prod** (`pg_get_functiondef`) làm gốc trước khi sửa, không chép từ file migration cũ |
| Chuông `repeat` kêu mãi | Điều kiện dừng rõ ràng + test tay |
| Backfill SKU trùng | UNIQUE + sinh tuần tự trong một transaction; chạy thử SELECT trước |
| Doanh thu báo cáo lệch dashboard cũ | Dùng đúng định nghĩa "tiền thật đã nhận"; test đối chiếu tổng ngày có cả bill trả sau lẫn đơn trả trước |
