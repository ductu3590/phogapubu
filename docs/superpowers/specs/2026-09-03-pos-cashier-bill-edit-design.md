# Màn POS thu ngân (admin web) + Sửa bill lúc thanh toán

Ngày: 2026-09-03 · Trạng thái: đã duyệt (anh Tú) · Quán đầu tiên dùng: Bia lẩu Bảo Lương (postpay)

## 1. Vấn đề

Hai việc chủ quán đang không làm được:

1. **Bill chốt cứng từ lúc khách gọi.** Khách chờ lâu bỏ món, khách gọi miệng một chai bia
   lấy tủ mang ra ngay, chủ quán tặng khách đĩa lạc — cả ba đều không ghi được vào bill.
   Hiện chỉ có hai lối: đặt thêm đơn ở `/staff/order` (chui vào bếp, kêu loa, sai) hoặc
   nhẩm miệng rồi thu tiền lệch bill in ra.
2. **Không có màn thu ngân trên máy tính.** `/staff/tables` là danh sách dọc mobile-first,
   hợp cho nhân viên cầm điện thoại chạy bàn, không hợp cho người ngồi quầy nhìn cả quán.

## 2. Quyết định đã chốt

| # | Quyết định | Vì sao |
|---|---|---|
| 1 | Bớt món = **đánh dấu huỷ, giữ nguyên dòng** (`void_type='cancelled'` + ai huỷ + lý do) | Xoá hẳn là mất dấu: cuối ca không biết đã bỏ bao nhiêu món, không truy được ai bỏ |
| 2 | Món thu ngân thêm tay **KHÔNG BAO GIỜ báo bếp** | Đúng bản chất: bia/nước/đồ nguội lấy tủ mang ra ngay, đã phục vụ rồi mới ghi tiền. Muốn bếp làm thì vẫn đặt ở `/staff/order` như cũ |
| 3 | Tặng khách = **đặt dòng món về 0đ**, in kèm chữ "Tặng" | Khách nhìn thấy ưu đãi trên bill; chủ quán đếm được đã tặng bao nhiêu tiền hàng. Không làm "dòng giảm giá tự do" — không gắn với món nào thì không kiểm soát được |
| 4 | "Khách lẻ" = **bàn lẻ** (phiên chiếm 1 bàn), khác mâm. **Không** làm luồng bán tại quầy | Mô hình phiên bàn mig 039/040 đã phủ đủ; bán tại quầy là tính năng khác, chưa quán nào hỏi |
| 5 | Sửa bill: **chỉ `store_owner`** | Chặn nhân viên tự tặng món cho người quen. Khớp sẵn với việc POS nằm trong `/admin` (layout đã fail-closed về `/mevo` nếu không phải store_owner) |
| 6 | Vị trí bàn lưu theo **ô lưới**, không phải pixel | Snap lưới nên không chồng nhau, không vỡ khi đổi cỡ màn hình, không cần thư viện kéo thả nặng |
| 7 | Món bị huỷ **có** hiện gạch đỏ trên màn bếp nếu đơn còn đang nấu | Đúng ca gốc anh Tú nêu: khách chờ lâu bỏ món nên bếp cần biết để khỏi làm tiếp |

## 3. Chia hai sprint

Mỗi sprint tự đứng được và test được riêng — theo quy tắc test bắt buộc ở CLAUDE.md.

- **Sprint 1 — POS**: sơ đồ bàn kéo thả + luồng đơn mới + thu tiền/ghép mâm/gộp bill.
  Chỉ thêm 2 cột `tables.pos_x/pos_y`. **Không đụng một dòng nào của luồng tiền** — mọi
  thao tác tiền đều gọi lại RPC mig 039/040 đang chạy thật.
- **Sprint 2 — Sửa bill**: cột `void_type` + 3 RPC mới + gắn nút vào panel bill của POS.

---

# Sprint 1 — Màn POS `/admin/cashier`

## 1.1 Route & quyền

`admin-web/app/admin/cashier/page.tsx` (server) + `cashier-client.tsx` (client).
Nằm trong `/admin` nên `AdminLayout` đã chặn sẵn: không phải `store_owner` thì đá về `/mevo`
hoặc `/login`. Nav: nhóm **Vận hành**, trên "Đơn hàng", nhãn "Thu ngân (POS)", icon
`Calculator` (lucide).

Không thay `/staff/tables`. Nhân viên vẫn dùng màn cũ: xem bàn, thu tiền, ghép mâm —
**không có nút sửa bill**.

## 1.2 Migration 044 — toạ độ bàn

```sql
alter table tables add column if not exists pos_x smallint;
alter table tables add column if not exists pos_y smallint;
```

Nullable có chủ đích: bàn chưa sắp thì client tự xếp theo tên (`localeCompare` tiếng Việt,
`numeric: true`) vào lưới trái sang phải. Không backfill — quán 20 bàn sắp một lần là xong.

RLS: policy `auth_update_tables` (mig 006b) đã cho operator đúng quán update — không thêm gì.
Ghi qua server action `saveTableLayout()` dùng phiên đăng nhập (không service role).

## 1.3 Sơ đồ bàn

Lưới cố định **12 cột**, cao tuỳ số bàn, mỗi bàn chiếm 1 ô. Ô 96x96px, gap 12px.

- **Chế độ thường** (mặc định): bấm ô = chọn bàn, mở panel bill bên phải. Tick nhiều ô để
  ghép mâm / gộp bill.
- **Chế độ Sắp xếp** (nút bật/tắt ở thanh trên): kéo thả ô sang vị trí trống bất kỳ; thả vào
  ô đã có bàn thì **đổi chỗ hai bàn** (không chồng). Lưu ngay sau mỗi lần thả (server action,
  optimistic + hoàn tác nếu lỗi). Bấm ô không mở bill ở chế độ này nên không kéo nhầm lúc đông khách.

Kéo thả dùng HTML5 drag & drop thuần (`draggable`, `onDragStart/onDragOver/onDrop`) —
không thêm dependency.

Màu ô theo trạng thái, **dùng lại `lib/tray-colors.ts`** để một mâm có đúng một màu trên cả
POS lẫn màn nhân viên:

| Trạng thái | Hiển thị |
|---|---|
| Trống | viền xám nhạt, chỉ tên bàn |
| Bàn lẻ có khách | viền cam + tổng tiền + số đơn |
| Thuộc mâm | màu của mâm + nhãn "Mâm N" |
| Còn món chưa xong (`cooking_count > 0`) | chấm đỏ góc trên |
| Phiên quá hạn còn nợ (`needs_review`) | viền hổ phách + ⏰ |

## 1.4 Khối "Đơn mới"

Dải ngang dưới sơ đồ, cuộn dọc, mới nhất trước. Nguồn: chính mảng `orders` trong
`listOpenTableSessions()` (đã có `order_source`, `created_at`, `items`, `status`) — **không
query thêm**, nên không có nguy cơ hai màn hai số. Mỗi dòng: bàn · số món · "N phút trước" ·
nguồn (khách / nhân viên) · trạng thái. Bấm thì chọn đúng bàn đó trên sơ đồ.

Đơn "mới" = tạo trong 15 phút gần nhất. Không lưu trạng thái đã-xem (thêm cột chỉ để tô đậm
một dòng là không đáng).

## 1.5 Panel bill (cột phải, 400px)

Chưa chọn bàn thì hiện hướng dẫn ngắn + tổng quan (số bàn đang có khách, tổng chưa thu).
Chọn rồi thì hiện tên bàn/mâm, giờ mở, danh sách món gộp theo tên, tổng tiền, và:

- `[In bill]` mở `/staff/tables/print?ids=...` (đã có, dùng lại nguyên).
- `[Tiền mặt]` / `[Chuyển khoản]` gọi `closeTableSession(id, 'paid', instrument)`.
- `[...]`: Bỏ bàn (`staff_reset`), Thêm bàn vào mâm, Nhập vào mâm, Nhả chủ phiên — tất cả gọi
  lại action sẵn có ở `lib/actions/table-session.ts`.
- Tick từ 2 mâm trở lên thì hiện thanh dưới: gộp bill, in 1 hoá đơn, thu một lần
  (`closeTableSessionsBulk`).
- Cảnh báo "còn N món chưa xong" giữ y như màn nhân viên.

## 1.6 Realtime

Giống `staff/tables/tables-client.tsx`: subscribe `orders`, `table_sessions` (lọc theo
`store_id`), `session_tables` (không có `store_id` nên nghe hết), rồi **tải lại cả danh sách**
qua `listOpenTableSessions()`, không cộng dồn tại chỗ. Chấm xanh/xám báo trạng thái kết nối.

## 1.7 Quán trả trước

`payment_timing='prepay'` không có phiên bàn. POS vẫn vào được: sơ đồ hiện toàn bàn trống +
dòng giải thích "Quán đang chạy trả trước — phiên bàn chỉ dùng ở chế độ trả sau", khối Đơn mới
vẫn chạy. Chức năng sắp xếp vị trí bàn vẫn dùng được (chuẩn bị sẵn cho khi chuyển postpay).

---

# Sprint 2 — Sửa bill

## 2.1 Migration 045 — cột + RPC mới (KHÔNG chứa `CREATE OR REPLACE` RPC sống)

```sql
alter table order_items
  add column if not exists void_type   text,
  add column if not exists voided_at   timestamptz,
  add column if not exists voided_by   uuid references auth.users(id),
  add column if not exists void_reason text;

alter table order_items drop constraint if exists order_items_void_type_check;
alter table order_items add constraint order_items_void_type_check
  check (void_type is null or void_type in ('cancelled','gift'));

alter table orders drop constraint if exists orders_order_source_check;
alter table orders add constraint orders_order_source_check
  check (order_source in ('customer_zalo','staff','pos'));
```

**Một cột trạng thái, không phải hai cờ boolean** — không tồn tại được trạng thái vô nghĩa
"vừa huỷ vừa tặng".

`order_source='pos'` = đơn do thu ngân thêm tay, đã phục vụ, không vào bếp.

### Helper

```sql
is_store_owner_of(p_store_id uuid) returns boolean   -- role='store_owner' + đúng quán + is_active
recompute_order_total(p_order_id uuid) returns int   -- server tự tính, client KHÔNG gửi tổng
add_order_line(p_order_id uuid, p_store_id uuid, p_item jsonb) returns int
```

`recompute_order_total` = tổng các dòng **`void_type is null`** của
`(item_price + tổng giá topping trong selected_toppings) * quantity`, rồi
`update orders set total_amount = v, payment_amount = v`. Đúng công thức `create_order` đang dùng.

`add_order_line` xác thực y hệt `staff_create_order` (món thuộc quán + còn bán; biến thể bắt
buộc khi `count(*) from menu_item_variants > 0` — **đếm TỔNG, không lọc `is_available`**, đúng
bẫy #1 của mig 042; topping phải đã gán cho món và còn bán) và ghi snapshot
`item_name = 'Món (Biến thể)'`. Chỉ `pos_add_manual_items` gọi nó — **không** sửa
`create_order`/`staff_create_order` để dùng chung: mỗi lần `CREATE OR REPLACE` một RPC sống là
một lần rủi ro lùi hàm, đổi lấy việc gỡ trùng lặp là không đáng lúc này.

### RPC

```sql
pos_void_order_item(p_order_item_id uuid, p_void_type text, p_reason text default null) returns jsonb
pos_restore_order_item(p_order_item_id uuid) returns jsonb
pos_add_manual_items(p_session_id uuid, p_items jsonb, p_client_request_id uuid) returns jsonb
```

Cả ba `security definer`, `revoke from public/anon`, `grant to authenticated`.

**Rào chắn chung — kiểm ở server, không tin client:**

1. `is_store_owner_of(order.store_id)` — sai thì `raise exception 'Chỉ chủ quán mới sửa được bill'`.
2. `order.payment_received_at is null` — đã thu tiền thì không sửa. Sửa sau khi thu là sửa
   doanh thu đã chốt.
3. `order.status <> 'cancelled'`.
4. `order.voucher_id is null` — đơn có mã giảm giá thì **từ chối kèm lý do**: voucher tính %
   trên tổng, bớt món xong số giảm sẽ sai. Thà chặn còn hơn ra bill lệch tiền.
5. `pos_add_manual_items`: phiên phải `status='open'` và thuộc quán của chủ.

**Idempotent:** void một dòng đã void đúng loại đó thì trả `{ok:true, already:true}`, không ghi
đè `voided_by` (giữ nếp `confirm_manual_payment`/`close_table_session`).

`pos_add_manual_items` tạo đơn: `order_source='pos'`, `status='pending'`,
`payment_method='cash'`, `session_id`, `table_id` = bàn gốc của phiên, `created_by=auth.uid()`,
`client_request_id` (chống bấm hai lần — `on conflict do nothing` rồi đọc lại, y nếp
`staff_create_order`). Đơn này sẽ được `close_table_session` gắn `payment_received_at` lúc chốt
bill như mọi đơn khác nên **doanh thu tự đúng, không phải sửa `revenue.ts` hay `get_daily_revenue`**.

## 2.2 Migration 046 — cập nhật 3 RPC đọc bill (file riêng, KHÔNG ghi "rerun-safe")

`get_sessions_bill`, `get_table_session_bill`, `list_open_table_sessions` phải:

- **bỏ hẳn** dòng `void_type='cancelled'` khỏi danh sách món;
- giữ dòng `void_type='gift'` nhưng `price/line_total = 0` và gắn cờ `is_gift` để in chữ "Tặng".

Tổng tiền của các RPC này vốn lấy từ `orders.total_amount` (đã được
`recompute_order_total` cập nhật) nên **không phải sửa công thức tổng** — chỉ sửa phần liệt kê món.

Theo quyết định 2026-09-01: file này chứa `CREATE OR REPLACE` của RPC đang chạy thật nên phải
đứng riêng một migration và **không** được ghi là chạy lại an toàn.

## 2.3 `orderInKitchen` + màn bếp

`admin-web/lib/kitchen-announce.ts`, thêm **một dòng** ngay sau check status:

```ts
if (o.orderSource === 'pos') return false   // món thu ngân thêm tay: đã phục vụ, không vào bếp
```

Cả hệ dùng chung predicate này nên đơn `pos` biến mất khỏi cột "Chờ xử lý" và không kêu loa.
Đơn `pos` mang `status='pending'` nên cũng không lọt vào cột "Đang làm"/"Xong".

Món bị huỷ trên đơn còn ở bếp: `kitchen-display.tsx` khi nhận event UPDATE của `orders` sẽ
**tải lại `order_items` của đúng đơn đó** (hiện chỉ cập nhật status/total), rồi vẽ dòng
`void_type='cancelled'` gạch ngang màu đỏ kèm nhãn "Khách bỏ". Không kêu loa cho việc này —
bếp đang nhìn màn hình.

## 2.4 UI trong panel bill của POS

Danh sách món ở chế độ sửa hiện **từng dòng `order_item`** (không gộp theo tên — gộp thì không
biết huỷ dòng nào). Mỗi dòng có menu `...`: **Khách bỏ món** (hỏi lý do, cho bỏ trống) ·
**Tặng khách** · **Hoàn tác** (dòng đã void). Dòng đã void hiện mờ + nhãn + tên người thao tác.

`[+ Thêm món]` mở bảng chọn menu (dùng lại cấu trúc `categories/items/variants/toppings` của
`/staff/order`), chọn xong bấm "Thêm vào bill". Nhãn nút ghi rõ **"không báo bếp"** để không ai
nhầm đây là đường đặt món.

## 3. Bẫy đã biết

1. **Đơn có voucher**: chặn sửa (§2.1 rào chắn 4). Nếu sau này cần, phải tính lại discount
   trong cùng transaction — không làm bây giờ.
2. **Huỷ hết mọi món của một đơn**: đơn còn lại tổng 0đ, `status` **giữ nguyên**, không tự
   `cancelled`. Tự đổi status là đụng vào state machine của bếp từ một màn khác.
3. **`payment_amount`**: `recompute_order_total` phải ghi cả `total_amount` lẫn `payment_amount`,
   nếu không đơn trả trước (nếu sau này dùng) sẽ lệch MAC. Đơn postpay không ký MAC nên vô hại,
   nhưng để hai cột lệch nhau là mời lỗi cho sprint sau.
4. **Kéo thả**: chỉ lưu khi thả vào ô hợp lệ; lỗi mạng thì hoàn tác vị trí cũ trên UI, không để
   sơ đồ trên máy này khác với DB.
5. **Hai máy cùng thu một bàn**: `close_table_session` vốn idempotent (trả `already:true`) nên
   POS phải hiện đúng thông báo "bàn này vừa được máy khác chốt", không báo lỗi đỏ.
6. **`session_tables` không có `store_id`** nên subscribe không lọc được — nghe hết rồi tải lại,
   y như màn nhân viên.

## 4. Ngoài phạm vi

- Bán tại quầy không gắn bàn (quyết định #4).
- Dòng giảm giá tự do theo số tiền (quyết định #3).
- Sửa bill cho quán trả trước / đơn mang về / đơn ship.
- Nhân viên sửa bill (quyết định #5).
- Vẽ sơ đồ tự do theo pixel, xoay bàn, bàn to nhỏ khác nhau (quyết định #6).

## 5. Test

Checklist chi tiết viết vào `TESTING.md` khi làm xong từng sprint. Trục chính:

**Sprint 1**: sắp xếp vị trí 20 bàn của Bảo Lương rồi F5 thấy giữ nguyên · đổi chỗ hai bàn ·
tắt Sắp xếp thì bấm bàn ra bill · khách quét QR gọi món thì ô bàn đổi màu + hiện ở Đơn mới
trong vài giây · ghép mâm 3 bàn · gộp bill 2 mâm in một tờ · thu tiền mặt đóng bàn · hai tab
cùng thu một bàn.

**Sprint 2**: bớt món thì tổng giảm đúng, bill in không còn món đó, màn bếp gạch đỏ · tặng món
thì bill in "Tặng 0đ", tổng giảm đúng · thêm món tay thì tổng tăng, **bếp không kêu loa, không
hiện đơn** · hoàn tác · nhân viên (`store_staff`) gọi thẳng RPC thì bị từ chối · đơn đã thu tiền
thì nút sửa mờ · thu tiền xong doanh thu cuối ngày khớp tổng bill.
