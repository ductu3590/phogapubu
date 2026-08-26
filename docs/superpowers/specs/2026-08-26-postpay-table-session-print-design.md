# MEVO Quy trình "Đặt trước — Trả sau" + Màn quầy in phiếu 2 liên — đặc tả thiết kế

> **Ngày:** 2026-08-26 (v3 — sau review; xem §13 phản hồi từng finding)
> **Trạng thái:** ĐÃ CHỐT hướng, sẵn sàng lập plan
> **Quán mở đường:** Quán nhậu **Bảo Lương** (mini-app riêng, backend chung)
> **Phạm vi:** Thêm quy trình vận hành thứ 2 cho MEVO, chủ quán tự chọn trong `/admin`.
> **Không đụng:** Phở Gà Pubu giữ nguyên 100% luồng trả-trước hiện tại.

> ### Đọc trước khi code — 5 điểm dễ sai nhất
>
> 1. **`order_flow` mặc định `prepay`.** Mọi nhánh mới chỉ chạy khi `order_flow='postpay'`.
>    Nguyên tắc cũ của repo: *"cắm thêm, tắt là như chưa từng tồn tại"*. Quán đang chạy
>    không được đổi hành vi dù chỉ một pixel.
> 2. **Máy in ở QUẦY, không ở bếp — và bếp làm SAU khi khách xác nhận.** Thứ tự vật lý này
>    (§4) là trụ chống đơn ma của cả thiết kế. Đừng "tối ưu" bằng cách cho đơn xuống bếp
>    thẳng: làm thế là ném lại đúng lỗ hổng mà quy trình giấy đang bịt.
> 3. **Trả sau ≠ tiền mặt.** Đừng tái dùng `payment_method='cash'` cho tiện (§2.2). Repo này
>    đã ăn một lần đau vì cột `payment_method` bị hiểu sai nghĩa (mig 032 phải rename
>    `zalopay`→`zalo_checkout`). Thêm kênh `counter`, ghi instrument thật lúc thu tiền.
> 4. **"Trả một lần cuối bữa" bắt buộc phải có PHIÊN BÀN.** Gộp theo `table_id` trần là sai:
>    bàn quay vòng, khách mới ngồi vào bàn cũ sẽ thấy — và bị tính — đơn của khách trước (§3.1).
> 5. **Hộp thoại "Bạn còn đơn chưa thanh toán" phải TẮT ở postpay.** Ở luồng trả sau thì đơn
>    nào cũng "chưa thanh toán" — quên guard chỗ này là khách Bảo Lương bị hỏi mỗi lần mở app,
>    và giỏ hàng bị khoá bởi `lockedByOrderId` không cho gọi thêm món (§8.2).

---

## 0. Việc KHÔNG cần code — dựng mini-app cho Bảo Lương

Phần "tạo mini-app cho quán khác" đã có sẵn quy trình, không nằm trong spec này:

- Skill `.claude/skills/replicate-mini-app/SKILL.md` → lệnh nhanh `onboard quán bao-luong`.
- Tạo store ở `/mevo` (wizard), Zalo App ID + OA riêng, worktree riêng
  `mini-app-instances/bao-luong/` (branch `deploy/bao-luong`, sparse-checkout chỉ `mini-app/`).
- Backend Supabase dùng chung, phân theo `store_id`; admin-web dùng chung.

Spec này chỉ trả lời phần MỚI: **Bảo Lương vận hành khác Phở Gà Pubu, và sự khác nhau đó
phải là một công tắc trong admin chứ không phải một nhánh code riêng.**

---

## 1. Hai quy trình khác nhau ở đâu

| | **`prepay`** — Phở Gà Pubu (đang chạy) | **`postpay`** — Bảo Lương (mới) |
|---|---|---|
| Khách quét QR | chọn món → **trả tiền** → bếp mới nhận | chọn món → gửi đơn, **chưa trả tiền** |
| Bằng chứng khách có mặt thật | **tiền đã về** (`payment_received_at`) | **nhân viên cầm phiếu ra bàn, khách xác nhận** — rồi bếp mới làm |
| Số lần gọi món | mỗi lần gọi = 1 đơn, trả 1 lần | gọi nhiều lượt suốt bữa, **trả 1 lần cuối** |
| Thiết bị của quán | tablet ở bếp (Kitchen Display) | **1 máy tính ở quầy** + máy in nhiệt 80mm USB |
| Theo dõi món ra | app + màn bếp | **gạch bút trên phiếu giấy tại bàn** |
| Thanh toán | ZaloPay / chuyển khoản trong app, trước khi ăn | tại quầy cuối bữa — tiền mặt hoặc quét QR tĩnh quán đã có |
| Hợp với | quán ăn nhanh, một lượt gọi, khách vãng lai | **quán nhậu** — ngồi lâu, gọi thêm liên tục, gọi cả bàn |

MEVO hôm nay **đã làm được 60%** luồng postpay mà không ai nhận ra. Đơn `payment_method='cash'`
vào bếp ngay không cần tiền (`admin-web/lib/kitchen-announce.ts`), `sweep_abandoned_orders`
cố tình bỏ qua đơn cash, `hasRealMoney` đã tách "tiền thật" khỏi "status". Ba thứ còn thiếu:
**phiên bàn**, **màn quầy + in phiếu**, và **công tắc chọn quy trình**.

---

## 2. Công tắc: `stores.order_flow`

### 2.1 Một cột, hai giá trị

```sql
alter table stores
  add column if not exists order_flow text not null default 'prepay';
alter table stores add constraint stores_order_flow_check
  check (order_flow in ('prepay','postpay'));
```

Chủ quán đổi ở `/admin/settings`, dạng 2 thẻ chọn kèm mô tả một câu — **không phải toggle
trần**, vì đổi nhầm là đổi cả cách quán chạy:

```
◉ Trả trước  — Khách thanh toán trong app rồi bếp mới làm. Hợp quán ăn nhanh.
○ Trả sau    — Khách gọi món nhiều lượt, in phiếu xác nhận tại bàn, thanh toán
               một lần tại quầy. Hợp quán nhậu, quán ngồi lâu.
```

Đổi quy trình khi **đang có bàn mở** thì chặn: *"Còn 3 bàn chưa thanh toán, đóng hết rồi mới
đổi được"*. Không thì đơn nửa phiên treo lơ lửng giữa hai luật.

### 2.2 Kênh thanh toán mới: `counter`

Cám dỗ lớn nhất là tái dùng `payment_method='cash'` — vì `cash` **đã** vào bếp ngay, **đã**
không bị sweep, **đã** vào doanh thu đúng. Gần như free.

Đừng làm. Khách Bảo Lương phần lớn **chuyển khoản** ở quầy chứ không đưa tiền mặt. Ghi `cash`
cho mọi đơn là ghi sai vào đúng cột mà báo cáo đọc — báo cáo sẽ nói *"hôm nay thu tiền mặt
12 triệu"* trong khi 10 triệu nằm trong tài khoản ngân hàng. Đúng loại lỗi mà spec PM (§2)
đã phải viết cả chương để gỡ.

```sql
-- orders.payment_method: thêm 'counter'   (KÊNH: thu tại quầy, cuối bữa)
-- stores.payment_methods: thêm 'counter'  (Bảo Lương: payment_methods = '{counter}')
-- payment_instrument ghi lúc THU: 'cash' | 'bank'   ← PHƯƠNG TIỆN, để báo cáo tách 2 loại
```

`counter` là **kênh**, `payment_instrument` là **phương tiện** — đúng mô hình 3 cột mà mig 030
đã dựng, không phát minh gì mới. Chủ quán không bao giờ nhìn thấy chữ `counter` trên màn hình.

---

## 3. Phiên bàn — nền của "gọi nhiều lượt, trả một lần"

### 3.1 Vì sao không gộp theo `table_id` trần

- Bàn 5 khách trước quên thanh toán → khách sau ngồi vào **thấy luôn** hoá đơn 800k của người lạ.
- Không có mốc "bữa này bắt đầu lúc nào" → không in được tạm tính, không biết bàn mở bao lâu.
- Cửa sổ 6h của "Món đã gọi" (`zalo_user_id + table_id + 6h`) là luật của **khách**, không
  phải luật của **bàn**. Quán nhậu thì **một bàn, nhiều điện thoại, một hoá đơn** — 4 người
  cùng bàn mỗi người gọi từ máy mình phải chung một bill. Đây là lý do quan trọng nhất.

### 3.2 Schema

```sql
create table table_sessions (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references stores(id),
  table_id     uuid not null references tables(id),
  opened_at    timestamptz not null default now(),
  closed_at    timestamptz null,
  close_reason text null check (close_reason in ('paid','void')),
  closed_by    uuid null,           -- auth.uid() của người bấm thu tiền (audit)
  instrument   text null check (instrument in ('cash','bank')),
  needs_review_at timestamptz null, -- phiên quá hạn, CHỜ nhân viên xử lý (§3.5)
  total_amount int not null default 0
);

-- Một bàn chỉ có ĐÚNG MỘT phiên mở — chốt chặn ở DB, không ở app code.
create unique index table_sessions_one_open_per_table
  on table_sessions(table_id) where closed_at is null;

alter table orders add column if not exists table_session_id uuid null;
create index orders_table_session_idx on orders(table_session_id) where table_session_id is not null;
```

**FK phải là composite, không phải FK đơn lẻ.** `table_session_id → table_sessions(id)` KHÔNG
đảm bảo đơn và phiên cùng quán, cùng bàn — chỉ cần một chỗ gán nhầm là bill bàn 5 nuốt đơn bàn 2:

```sql
alter table table_sessions add constraint table_sessions_id_store_table_key
  unique (id, store_id, table_id);

alter table orders add constraint orders_session_same_store_table_fk
  foreign key (table_session_id, store_id, table_id)
  references table_sessions(id, store_id, table_id);
```

⚠️ FK nhiều cột mặc định là `MATCH SIMPLE`: **có bất kỳ cột nào NULL thì không kiểm tra**. Đúng
điều ta cần — đơn `prepay` và đơn takeaway có `table_session_id`/`table_id` NULL nên đi qua tự
do; đơn postpay tại bàn có đủ 3 cột nên bị soi chặt. Đừng đổi sang `MATCH FULL`.

### 3.3 RLS — khoá thẳng, mọi thay đổi đi qua RPC

Bảng này quyết định **ai nợ bao nhiêu tiền**. Không bật RLS là để `anon` (mini-app khách) sửa
thẳng qua REST.

```sql
alter table table_sessions enable row level security;
revoke all on table_sessions from anon;

-- ĐỌC: operator đúng quán (nếp mig 019) + role kitchen cho màn quầy (nếp mig 007a)
create policy "op_select_table_sessions" on table_sessions
  for select to authenticated using (is_store_scoped_operator(store_id));
create policy "kitchen_select_table_sessions" on table_sessions
  for select to kitchen using (store_id = kitchen_store_id());

-- GHI: KHÔNG policy nào. Mọi INSERT/UPDATE chỉ qua RPC SECURITY DEFINER đã kiểm quyền.
```

Khách không cần đọc trực tiếp bảng này — tạm tính của bàn lấy qua RPC ở §3.6.

### 3.4 Vòng đời

| Mốc | Ai làm | Chuyện gì xảy ra |
|---|---|---|
| **Mở** | tự động, trong `create_order` | Quán `postpay` + đơn `dine_in` → tìm phiên mở của bàn; không có thì INSERT. Đơn gắn `table_session_id`. |
| **Gọi thêm** | khách | Đơn mới rơi vào **đúng phiên đang mở**, bất kể Zalo UID nào gọi. |
| **Đóng — thu tiền** | nhân viên tại quầy | RPC `close_table_session(session_id, instrument)` → đơn **chưa huỷ, chưa thu** nhận `payment_received_at` + `payment_instrument` + `status='paid'`; `close_reason='paid'`. |
| **Đóng — huỷ** | nhân viên/chủ quán | Bàn đơn ma / khách bỏ về: `close_reason='void'`, đơn `cancelled`, **không** ghi tiền. |
| **Quá hạn** | sweep | Phiên mở > 8h → set `needs_review_at`, **KHÔNG đóng, KHÔNG ghi tiền, KHÔNG mở bàn** (§3.5). |

⚠️ Trigger `auto_complete_dine_in` (mig 031) tự đóng đơn khi `status='ready'` **và** có
`payment_received_at`. Đơn Bảo Lương không ai bấm "ready" (không có màn bếp), nên
`close_table_session` phải **tự set `status='paid'`** — đừng trông chờ trigger đó. Ghi ở đây vì
đọc mig 031 rất dễ tưởng nó lo hộ.

### 3.5 Khoá phiên — thứ tự lock giống nhau ở MỌI RPC

Kịch bản hỏng: nhân viên bấm "Thu tiền" đúng lúc khách bấm "Gửi đơn". `close_table_session`
tính tổng xong, chưa kịp set `closed_at`; `create_order` chen vào thấy phiên **vẫn mở** nên gắn
đơn mới vào. Kết quả: phiên `paid` chứa một đơn **chưa ai thu tiền**, và nó biến mất khỏi màn
quầy vì bàn đã đóng.

Luật, không có ngoại lệ — **mọi RPC đụng tới phiên phải khoá phiên TRƯỚC MỌI VIỆC KHÁC:**

```sql
select * into v_session from table_sessions
 where id = p_session_id and closed_at is null
 for update;                    -- ← dòng đầu tiên, trước khi tính bất cứ thứ gì
if not found then raise exception 'Phiên không tồn tại hoặc đã đóng'; end if;
```

`create_order` khoá cùng dòng đó khi tìm/mở phiên. Cùng một thứ tự lock ở mọi hàm → không
deadlock. Settlement:

```sql
update orders
   set payment_received_at = now(), payment_instrument = p_instrument, status = 'paid'
 where table_session_id = p_session_id
   and status <> 'cancelled'          -- ← KHÔNG đánh dấu đơn đã huỷ là đã thu tiền
   and payment_received_at is null;
```

Điều kiện `status <> 'cancelled'` phải khớp **đúng** bộ lọc lúc tính tổng bill. Lệch nhau là
tiền thu một đằng, đơn ghi một nẻo.

**Test bắt buộc ở BL-4:** chạy song song `close_table_session` và `create_order` cùng một bàn,
lặp 50 lần → không bao giờ có đơn `payment_received_at IS NULL` nằm trong phiên `close_reason='paid'`.

### 3.6 Phiên quá hạn — KHÔNG tự đóng

Bản đầu của spec cho sweep 8h tự đóng phiên (`auto_stale`) và mở bàn cho bill mới. Sai: nó
**xoá bàn khỏi màn quầy trong khi đơn vẫn chưa ai trả tiền**, và cắt một bữa dài thành hai bill
— nhân viên mất luôn nút thu tổng.

Thay bằng: sweep chỉ **cắm cờ** `needs_review_at`, phiên vẫn mở, bàn vẫn khoá, vẫn nằm trên
màn quầy với badge đỏ **"QUÁ HẠN — cần xử lý"**. Nhân viên tự quyết: **Thu tiền** (đóng bình
thường) hoặc **Đóng bàn không thu** (`void`).

Đánh đổi: bàn bị khoá tới khi có người xử lý. Chấp nhận được — quán luôn có nhân viên tại chỗ,
và một cái bàn kẹt nhìn thấy được thì tốt hơn một khoản nợ biến mất im lặng.

### 3.7 Xem tạm tính: RPC mới, KHÔNG sửa chữ ký hàm cũ

`get_session_orders(p_zalo_user_id, p_table_id)` (mig 008) lọc theo **Zalo UID** — mỗi người
trong bàn chỉ thấy đơn của chính mình. Ở quán nhậu bốn người gọi từ bốn máy, đó là bốn nửa hoá
đơn khác nhau, không ai thấy tổng.

Thêm hàm **tên mới**, không đụng hàm cũ:

```sql
-- Lấy MỌI đơn của phiên đang mở tại bàn. table_id đến từ QR khách vừa quét —
-- cùng mức tin cậy như get_session_orders hiện tại, KHÔNG nhận session_id từ client.
create function get_table_bill(p_table_id uuid) returns table (...) ...
```

⚠️ **Vì sao tên mới chứ không thêm tham số mặc định vào hàm cũ:** PostgreSQL định danh hàm bằng
tên **+ kiểu tham số**. `CREATE OR REPLACE` với tham số mới **tạo thêm** một overload chứ không
thay hàm cũ, và PostgREST sẽ báo `ambiguous function` cho mini-app bản cũ đang chạy ngoài quán.
Nếu về sau buộc phải đổi chữ ký thật thì migration phải `DROP FUNCTION` **đúng chữ ký cũ** rồi
tạo lại + `revoke/grant` trong **cùng một transaction** — không bao giờ để hai overload sống chung.

## 4. Luồng đầy đủ Bảo Lương — thứ tự vật lý là phần quan trọng nhất

```
[19:40] Bàn 5 — 4 khách ngồi xuống, anh A quét QR
        → Mini App Bảo Lương mở → chọn Lòng nướng x2, Nem chua x1, Bia Hà Nội x3
        → bấm "GỬI ĐƠN"   (không có bước thanh toán)

[19:40] Server: create_order → chưa có phiên bàn 5 → MỞ PHIÊN #S-118
        → đơn #045 gắn vào phiên, payment_method='counter'

[19:40] MÀN QUẦY kêu chuông + đọc "Bàn 5, hai lòng nướng, một nem chua, ba bia"
        → máy in ở quầy nhả 2 LIÊN, nhân viên cầm CẢ HAI

[19:41] NV mang 2 liên ra bàn 5
        ├─ CÓ khách  → khách nhìn phiếu xác nhận đúng món
        │              → để lại LIÊN KHÁCH tại bàn (để gạch món)
        │              → NV cầm LIÊN BẾP xuống bếp → BẾP MỚI BẮT ĐẦU LÀM
        └─ BÀN TRỐNG → đơn ma. NV bấm "Huỷ đơn" trên điện thoại,
                       vứt 2 mẩu giấy. BẾP CHƯA ĐỤNG VÀO GÌ — mất 0 nguyên liệu.

[19:52] Bia ra → NV gạch dòng "Bia Hà Nội" trên liên khách tại bàn
[20:05] Lòng nướng ra → gạch tiếp. Khách nhìn phiếu biết nem chua chưa ra.

[20:30] Anh B (cùng bàn, Zalo khác) gọi thêm → đơn #051
        → rơi vào ĐÚNG phiên #S-118 → in tiếp 2 liên "LƯỢT 2" → lặp lại y hệt

[22:10] Khách ra quầy thanh toán
        → NV mở màn quầy → Bàn 5 · 3 lượt · 1.240.000đ
        → bấm "THU TIỀN" → chọn [Tiền mặt] hoặc [Chuyển khoản]
          (chuyển khoản: khách quét QR TĨNH đã dán sẵn ở quầy, NV liếc app NH)
        → bấm xác nhận → phiên đóng, 3 đơn ghi payment_received_at + instrument
        → bàn 5 rời danh sách "Bàn đang mở", vào doanh thu ngày đúng cột
```

**Trụ của thiết kế nằm ở dòng "BẾP MỚI BẮT ĐẦU LÀM".** Bếp không nhận đơn từ máy — bếp nhận
tờ giấy từ tay nhân viên, và tờ giấy đó chỉ tới bếp sau khi có người thật ngồi ở bàn xác nhận.
Không có API nào, không có công tắc nào, không lách được. Đây là lý do spec này **không cần**
cơ chế "xác nhận bàn có khách" trong phần mềm — quy trình giấy đã làm chặt hơn.

---

## 5. Màn quầy + in phiếu

### 5.1 Màn quầy = Kitchen Display ở chế độ `postpay`

Máy tính quầy mở **một màn hình duy nhất**, làm hết mọi việc. Không dựng trang mới từ đầu —
tái dùng `/kitchen/[storeSlug]` vì nó đã có sẵn đúng ba thứ khó:

- **Realtime** đơn mới (Supabase channel), đã chạy ổn định
- **Chuông + loa đọc đơn TTS** (Web Speech, miễn phí) — ở quầy vẫn có ích: nhân viên đang bận
  nghe tiếng là biết có đơn cần cầm ra bàn
- **Đăng nhập bằng role `kitchen` + token, không qua Supabase Auth** — mở suốt ngày không phải
  login lại, đúng thứ một máy tính quầy cần

Ở `order_flow='postpay'`, màn này đổi bố cục thành 2 khối:

```
┌── ĐƠN MỚI — CẦN IN & MANG RA BÀN ──┐  ┌── BÀN ĐANG MỞ (4) ───────────┐
│ 🔔 BÀN 5 · LƯỢT 1 · 19:40          │  │ BÀN 5   3 lượt  1.240.000đ   │
│    2 Lòng nướng · 1 Nem chua       │  │         [Chi tiết][THU TIỀN] │
│    3 Bia Hà Nội                    │  │ BÀN 2   1 lượt    285.000đ   │
│    [ĐÃ IN ✓]  [In lại]  [Huỷ đơn]  │  │ ...                          │
└────────────────────────────────────┘  └──────────────────────────────┘
```

Ba cột "Chờ xử lý / Đang làm / Xong" của luồng `prepay` **ẩn hẳn** — đơn Bảo Lương không có
ai bấm chuyển trạng thái, tiến độ món nằm trên tờ giấy tại bàn.

### 5.2 In: Chrome kiosk-printing

Máy in nhiệt **80mm USB** cắm thẳng vào máy tính quầy, cài driver như máy in thường. Chrome
mở màn quầy bằng cờ `--kiosk-printing` → `window.print()` **in thẳng, không hiện hộp thoại**.

```
chrome.exe --kiosk-printing --app=https://<admin-web>/kitchen/bao-luong?token=...
```

Không thêm hạ tầng nào: không agent cục bộ, không máy in cloud, không phụ thuộc nhà cung cấp
nào. Sửa mẫu phiếu = sửa CSS, deploy như mọi thay đổi web khác.

> **Đã cân nhắc và loại:** máy in cloud có API (FEIE/Xprinter cloud) — cần khi bếp/quầy **không**
> có máy tính. Quầy Bảo Lương có sẵn máy tính nên phương án này chỉ thêm ~1tr tiền máy, thêm
> phụ thuộc server nhà cung cấp, mà không được gì. Ghi lại ở đây để sau này quán nào không có
> máy tính thì biết đường mở lại.

⚠️ **Lưu ý mua máy in:** máy in **WiFi thường** ≠ máy in **cloud** — bài tiếng Việt gọi cả hai
là "máy in wifi". Với phương án này thì chỉ cần loại **USB thường**, rẻ nhất, không cần WiFi.

### 5.3 Mẫu phiếu

Khổ 80mm, monospace. Hai liên trong **một** trang, cách nhau đường cắt — in **một lần** ra hai
liên, không phụ thuộc chuyện đặt `copies=2` (web không set được tin cậy).

```
    ══════════════════════
     QUÁN NHẬU BẢO LƯƠNG
    ══════════════════════
     LIÊN 1 — BẾP
     BÀN 5        ĐƠN #045
     19:40  26/08   LƯỢT 1
    ──────────────────────
     ☐  2   Lòng nướng
     ☐  1   Nem chua rán
              (ít cay)
     ☐  3   Bia Hà Nội
    ──────────────────────
     Tạm tính lượt này
                 285.000đ
     Cả bàn (3 lượt)
               1.240.000đ
    ──────────────────────
     Món ra → gạch tên món
    ✂ - - - - - - - - - - -
        (LIÊN 2 — KHÁCH,
         nội dung y hệt)
```

- Ô `☐` trước mỗi món — chỗ gạch bút khi bê ra.
- Ghi chú món (ít cay, không hành) in thụt dưới tên món, **không** bỏ qua — đây là thứ hay mất
  nhất khi chuyển từ gọi miệng sang gọi app.
- "Cả bàn (N lượt)" giúp khách tự đối chiếu cuối bữa, giảm cãi nhau ở quầy.

CSS: `@page { size: 80mm auto; margin: 0 }`, `@media print` ẩn toàn bộ màn quầy, chỉ chừa
`#print-ticket`.

### 5.4 Chống in trùng — chỗ dễ vỡ nhất

Bếp mở màn hình trên 2 thiết bị, hoặc F5 giữa ca → mỗi đơn in 2–4 lần.

```sql
alter table orders
  add column if not exists printed_at  timestamptz null,
  add column if not exists print_count int not null default 0;
```

RPC `kitchen_claim_print(p_order_id)` (role `kitchen`, theo nếp `kitchen_confirm_payment`):

```sql
update orders set printed_at = now(), print_count = print_count + 1
 where id = p_order_id and store_id = kitchen_store_id() and printed_at is null
returning id;
-- không trúng dòng nào → trả {ok:false, already:true}
```

Luật: **gọi RPC TRƯỚC, chỉ in khi RPC trả `ok:true`.** Hai tab cùng nhận realtime thì chỉ một
tab thắng UPDATE. Chống-trùng nguyên tử ở DB, không phải `useRef` trong React (reload là mất).

Đánh đổi phải nói thẳng: **đánh dấu trước khi in** nghĩa là hết giấy → đơn ghi "đã in" mà phiếu
không ra. Bù bằng nút **"In lại"** (tăng `print_count`, không đụng `printed_at`) và badge đỏ
**"CHƯA IN"** cho đơn quá 2 phút.

Chiều ngược lại (in xong mới đánh dấu) thì mỗi lần mạng chớp là in trùng — mà ở đây in trùng
tệ hơn in sót: **in sót thì nhân viên vẫn thấy đơn trên màn quầy**, còn in trùng thì có 2 tờ
phiếu cho cùng một lượt gọi, dễ thành 2 lần xuống bếp.

---

## 6. Chống đơn phá hoại — quy trình giấy đã lo

Không cần cơ chế phần mềm nào thêm. Thứ tự ở §4 đã bịt kín:

| Lớp | Có sẵn / mới | Chặn được gì |
|---|---|---|
| QR gắn cứng từng bàn | có sẵn | đơn không có bàn |
| Chặn ngoài giờ / tạm nghỉ (mig 017, chặn ở RPC) | có sẵn | gọi lúc quán đóng cửa |
| **Xác nhận tại bàn trước khi xuống bếp** | **§4** | **toàn bộ đơn ma — mất 0 nguyên liệu** |
| Nút "Huỷ đơn" trên màn quầy + `/staff/orders` | mới/có sẵn | dọn đơn ma khỏi phiên |

Chi phí một đơn phá hoại = một mẩu giấy nhiệt + 30 giây của nhân viên. Chấp nhận được.

> **Đã cân nhắc và loại:** công tắc `require_open_table` (bắt nhân viên bấm "Có khách" trên app
> trước khi đơn đầu tiên vào bếp) — thừa, vì việc xác nhận đã xảy ra ngoài đời với tờ phiếu
> trong tay. Thêm nó chỉ là bắt nhân viên làm hai lần cùng một việc.

---

## 7. Thu tiền cuối bữa + báo cáo tách 2 loại

### 7.1 Thu tiền

Từ khối "Bàn đang mở" trên màn quầy (và `/staff/tables` cho nhân viên cầm điện thoại):

```
BÀN 5 · 3 lượt · 2h30 · 1.240.000đ
[Xem chi tiết]  [In tạm tính]  [ THU TIỀN ]
        ↓
   Thu 1.240.000đ bằng:
   [ 💵 Tiền mặt ]   [ 🏦 Chuyển khoản ]
```

- **Tiền mặt** → `instrument='cash'`
- **Chuyển khoản** → khách quét **QR tĩnh quán đã dán sẵn ở quầy**, nhân viên liếc app ngân
  hàng thấy tiền về rồi bấm xác nhận → `instrument='bank'`

**Không sinh QR động trong app** (quán đã có QR riêng) → bỏ hẳn ý VietQR ở bản v1 của spec,
không cần lưu số tài khoản trong DB, bớt một khối cấu hình và một chỗ để lộ thông tin.

**v1: một phiên = một hình thức.** Nhóm khách chia tiền thì thường một người trả hết rồi tự
chia nhau — YAGNI. Nếu quán kêu thật thì mới thêm bảng `table_session_payments` cho phép chia
nhiều dòng; lúc đó `close_table_session` nhận mảng thay vì một `instrument`.

### 7.2 Báo cáo tách 2 loại

Đây là câu "tổng hợp 2 loại thanh toán" của anh Tú. Ở `/admin/dashboard`, quán `postpay` thấy:

```
DOANH THU HÔM NAY          12.450.000đ
  💵 Tiền mặt               4.980.000đ   (12 bàn)
  🏦 Chuyển khoản           7.470.000đ   (19 bàn)
```

Đọc từ `orders.payment_instrument` — **không** thêm cột nào, không thêm luật doanh thu nào:
`hasRealMoney()` vẫn là nguồn sự thật duy nhất, chỉ nhóm kết quả theo instrument. Đây chính là
lý do §2.2 không chịu tái dùng `cash`: có `counter` + `instrument` thì hai dòng này tự đúng.

### 7.3 Quyền: nhân viên có được thu tiền không?

`confirm_manual_payment` hiện là **owner-only**, và mig 028 đã cố tình siết `store_staff` khỏi
việc tự set `payment_received_at` qua REST. Nhưng ở quán nhậu, người đứng quầy lúc 22h là
nhân viên, không phải chủ.

Đề xuất: RPC **riêng** `close_table_session(p_session_id, p_instrument)` cho phép cả
`store_owner` lẫn `store_staff`, ghi `closed_by = auth.uid()`. Đây **không** phải nới lỏng
mig 028 — 028 chặn staff **ghi thẳng vào `orders` qua REST**; RPC có kiểm quyền, có audit,
có phạm vi hẹp là đúng cửa mà spec 028 đã chừa. Không đụng `confirm_manual_payment`.

---

## 8. Danh sách đầy đủ chỗ phải sửa

### 8.1 Migration

| # | Nội dung |
|---|---|
| **039** | `stores.order_flow`, `printer_paper_width` (mặc định `'80'`); nới CHECK `payment_methods` + `orders.payment_method` cho `'counter'` |
| **040** | `table_sessions` + unique index 1-phiên-mở + **composite FK** (§3.2) + **RLS + revoke anon** (§3.3) + `orders.table_session_id` |
| **041** | `orders.printed_at/print_count` + RPC `kitchen_claim_print` (grant role `kitchen`) |
| **042** | `create_order` v10: nhận `counter`, tự mở/gắn phiên khi `postpay`, **`FOR UPDATE` phiên ở dòng đầu** (§3.5) |
| **043** | RPC `close_table_session` / `void_table_session` (khoá phiên trước, loại đơn `cancelled`); sweep chỉ **cắm cờ** `needs_review_at` (§3.6) |
| **044** | RPC **`get_table_bill(p_table_id)`** — hàm TÊN MỚI, không đụng `get_session_orders` (§3.7) |

### 8.2 Code — điểm phải rà, không được sót

| File | Sửa gì | Sót thì sao |
|---|---|---|
| `admin-web/lib/kitchen-announce.ts` | `orderInKitchen`: thêm `payment_method === 'counter'` | Đơn Bảo Lương không bao giờ hiện ở màn quầy |
| `admin-web/lib/revenue.ts` | `isAwaitingPayment`: thêm `counter` | Cột "chờ thanh toán" bỏ sót cả quán |
| `admin-web/lib/actions/orders.ts` | `completeOrder`: `canConfirmManual` thêm `counter` | Chủ quán không đóng tay được đơn kẹt |
| `supabase` `sweep_abandoned_orders` | loại trừ `counter` (như đang loại `cash`) | **Đơn khách đang ăn bị tự huỷ sau 30 phút** |
| `mini-app/src/pages/checkout/index.tsx` | `postpay` → bỏ chọn PT, nút "Gửi đơn", bỏ nhánh Zalo Checkout | Khách bị đẩy vào màn thanh toán không tồn tại |
| `mini-app/src/services/unpaid-order.ts` + `components/common/unpaid-order-prompt.tsx` | tắt hẳn ở `postpay` | Khách bị hỏi "còn đơn chưa thanh toán" **mỗi lần mở app** |
| `mini-app/src/stores/cart.store.tsx` | không set `lockedByOrderId` ở `postpay` | **Khách không gọi thêm được món** — vỡ toàn bộ ý tưởng quán nhậu |
| `mini-app/src/pages/session-orders/index.tsx` + `services/order/order.api.ts` | `postpay` → gọi **`get_table_bill`** thay `get_session_orders` | Mỗi người trong bàn chỉ thấy đơn của chính mình — bốn nửa hoá đơn, không ai thấy tổng |
| `admin-web/app/kitchen/[storeSlug]/kitchen-display.tsx` | bố cục `postpay` 2 khối, khối in ẩn, auto-print, In lại, badge CHƯA IN, Huỷ đơn | — |
| `admin-web/app/admin/settings/settings-client.tsx` | khối chọn quy trình + khổ giấy | — |
| `admin-web/app/admin/dashboard/page.tsx` | tách doanh thu theo `payment_instrument` | Mất đúng con số anh Tú cần |
| `mini-app` spin (`spin-section`) | tắt ở `postpay` v1 | Vòng quay gắn với "đơn có tiền thật"; ở postpay chỉ đúng lúc đóng phiên — v1 để yên |

### 8.3 Không đụng

`checkout-create-mac`, `checkout-notify`, `payment.service.ts`, `checkout-result.ts`,
`confirm_manual_payment`, `auto_complete_dine_in`, toàn bộ luồng takeaway/ship. Quán `prepay`
đi đúng nhánh cũ, không một dòng điều kiện nào chạy khác trước.

---

## 9. Rủi ro

| # | Rủi ro | Mức | Xử lý |
|---|---|---|---|
| 1 | **Máy in hết giấy / Chrome bị tắt** | Cao | Đơn **vẫn hiện trên màn quầy** — in hỏng làm chậm chứ không mất đơn. Badge "CHƯA IN" quá 2' + nút In lại (§5.4) |
| 2 | **Nhân viên quên đóng phiên** → bàn treo, doanh thu ngày thiếu | Trung bình | "Bàn đang mở" luôn hiện trên màn quầy + cảnh báo bàn mở > 4h; sweep 8h đánh `auto_stale` **không** ghi tiền |
| 3 | **Khách về không trả tiền** | Trung bình | Rủi ro *vận hành*, không phải phần mềm — quán nhậu sổ giấy cũng chịu. Màn "Bàn đang mở" làm nó dễ phát hiện hơn |
| 4 | Chuyển khoản chưa về mà nhân viên bấm xác nhận | Trung bình | `closed_by` ghi lại ai bấm. Bật SePay (PM-5) sau này thì tự đối soát, xoá hẳn rủi ro |
| 5 | Hai tab màn quầy in trùng | Đã xử lý | UPDATE nguyên tử (§5.4) |
| 6 | Chủ quán đổi `order_flow` giữa lúc có bàn mở | Thấp | Chặn ở server (§2.1) |
| 7 | Đơn ma tốn nguyên liệu | **Đã xoá** | Bếp chỉ làm sau khi phiếu được xác nhận tại bàn (§4) |
| 8 | **Đơn chen vào giữa lúc thu tiền** → phiên `paid` chứa đơn chưa thu | Đã xử lý | `FOR UPDATE` phiên ở dòng đầu mọi RPC + test đồng thời 50 vòng (§3.5) |
| 9 | **Khách sửa thẳng `table_sessions` qua REST** | Đã xử lý | RLS bật, `revoke all from anon`, ghi chỉ qua RPC (§3.3) |
| 10 | **Đơn đã huỷ bị đánh dấu đã thu tiền** | Đã xử lý | `status <> 'cancelled'` khớp đúng bộ lọc tính tổng (§3.5) |
| 11 | **Phiên quá hạn mang theo công nợ biến mất** | Đã xử lý | Sweep chỉ cắm cờ, không tự đóng bàn (§3.6) |

---

## 10. Kế hoạch triển khai

Theo **QUY TẮC BẮT BUỘC VỀ TEST** của CLAUDE.md: mỗi sprint xong thì dừng, anh Tú test theo
`TESTING-BL.md`, PASS rồi mới sang sprint sau.

| Sprint | Nội dung | Test gate |
|---|---|---|
| **BL-1** | Mig 039+040: `order_flow`, `table_sessions`, `counter`. UI chọn quy trình ở `/admin/settings`. **Chưa đụng mini-app.** | Phở Gà Pubu không đổi gì; bật postpay cho store test không vỡ |
| **BL-2** | `create_order` v10 + mini-app postpay: nút "Gửi đơn", tắt unpaid-prompt, tắt khoá giỏ, session-orders gộp phiên | Gọi 3 lượt từ 2 Zalo khác nhau → cùng 1 phiên |
| **BL-3** | Màn quầy: bố cục postpay, mig 041, mẫu phiếu 2 liên, auto-print, In lại, badge CHƯA IN, Huỷ đơn | **In thật ra giấy**; F5 màn quầy 5 lần không in trùng; tắt máy in → badge đỏ |
| **BL-4** | Thu tiền: `close_table_session`, khối "Bàn đang mở", báo cáo tách tiền mặt / chuyển khoản, cờ quá hạn | Thu 1 bàn 3 lượt → đúng tổng, dashboard tách đúng 2 dòng, bàn rời danh sách. **Test đồng thời close-vs-create 50 vòng** (§3.5). Huỷ 1 đơn giữa phiên → đơn đó KHÔNG bị ghi là đã thu tiền |

Bốn sprint (bản v1 có 5 — bỏ `require_open_table` nhờ quyết định xác nhận-trước-khi-làm).
Sau BL-4: onboard Bảo Lương thật theo skill `replicate-mini-app`, chạy pilot 1 tuần.

---

## 11. Phần cứng cần chuẩn bị

| Món | Gợi ý | Giá tham khảo |
|---|---|---|
| Máy in nhiệt **80mm USB** (loại thường, KHÔNG cần wifi/cloud) | Xprinter XP-80 / Gprinter dòng phổ thông | 1.000.000 – 1.800.000đ |
| Máy tính quầy | **đã có** — chỉ cần cài Chrome + driver máy in | 0đ |
| Giấy in nhiệt K80 | cuộn 80mm | 8.000 – 12.000đ/cuộn |
| Bút bi | gạch món trên phiếu | — |

Không phát sinh phí phần mềm hàng tháng: in bằng trình duyệt, QR thanh toán dùng QR tĩnh quán
đã có, loa đọc đơn bằng Web Speech (đã có sẵn trong Kitchen Display).

---

## 12. Điểm còn để ngỏ (không chặn việc code)

1. **Bếp có muốn xem màn hình không?** Hiện thiết kế cho bếp làm hoàn toàn theo giấy. Nếu sau
   này bếp muốn một màn hình phụ thì mở lại 3 cột trạng thái — không đụng gì tới thiết kế này.
2. **Chia hoá đơn nhiều hình thức** (nửa tiền mặt nửa CK) — hoãn tới khi quán kêu thật (§7.1).
3. **SePay đối soát tự động** — PM-5 đã có kế hoạch sẵn, bật sau khi pilot ổn định (§9 rủi ro 4).
4. **In tạm tính giữa bữa** — có nút trong thiết kế, nhưng chưa rõ quán dùng nhiều không; quan
   sát trong tuần pilot.

---

## 13. Phản hồi review (bản review đề 20/08)

| # | Finding | Kết luận | Xử lý |
|---|---|---|---|
| 2 | Thiếu RLS `table_sessions` | **Nhận** P0 | §3.3 — bật RLS, `revoke all from anon`, ghi chỉ qua RPC |
| 3 | Race "gọi thêm" vs "thu tiền" | **Nhận** P0 | §3.5 — `FOR UPDATE` dòng đầu mọi RPC, cùng thứ tự lock, + test 50 vòng ở BL-4 |
| 4 | "Món đã gọi" lọc theo UID, không theo phiên | **Nhận** P1 | §3.7 — RPC `get_table_bill(p_table_id)` |
| 5 | Thêm tham số mặc định tạo overload RPC | **Nhận thành luật** P1 | §3.7 — dùng hàm TÊN MỚI; nếu buộc đổi chữ ký thì `DROP` đúng chữ ký cũ trong cùng transaction |
| 6 | Thiếu ràng buộc phiên–bàn–quán | **Nhận một nửa** P1 | §3.2 — composite FK. *Nửa còn lại (bỏ `p_session_id` từ client) spec đã làm sẵn: phiên luôn suy từ `table_id` đã xác thực, không hàm nào nhận session id từ client* |
| 7 | Settlement đánh dấu cả đơn đã huỷ là đã thu | **Nhận** P1 | §3.5 — `status <> 'cancelled'`, khớp đúng bộ lọc tính tổng |
| 8 | Auto-expire để lại công nợ | **Nhận** P2 | §3.6 — sweep chỉ cắm cờ `needs_review_at`, không tự đóng bàn |
| 1 | `prepay` cho đơn staff vào bếp trước khi thu tiền | **Không thuộc phạm vi spec này** — cần anh Tú quyết riêng | Xem §13.1 |

### 13.1 Finding #1 — thật, nhưng là chuyện của Phở Gà Pubu, không phải Bảo Lương

Review đúng về mặt sự thật: `orderInKitchen()` trả `true` vô điều kiện cho
`order_source='staff'` (`admin-web/lib/kitchen-announce.ts`). Nhưng:

- Đây là hành vi **đang chạy trên prod**, do PM-3 §7 cố ý chọn: *nhân viên đứng cạnh khách =
  bằng chứng khách có mặt*, nên đơn đặt hộ không cần chờ tiền.
- Bảo Lương chạy `postpay` — **không đơn nào chờ tiền để vào bếp cả**, nên finding này không
  chạm vào quán mới.
- Sửa nó là **đổi hành vi quán đang bán hàng**: từ mai nhân viên Phở Gà Pubu đặt hộ xong phải
  thu tiền rồi bếp mới làm.

Đó là quyết định vận hành của chủ quán, không phải lỗi để lặng lẽ vá trong spec Bảo Lương.
Ghi lại ở đây; nếu anh Tú muốn siết thì làm thành thay đổi riêng cho `prepay`, có test gate riêng.

### 13.2 Phần review nói tới mà spec này KHÔNG có

Review nhắc `device_id`, "Chuyển quyền gọi món" (host transfer), phiên do staff mở,
`staff_create_order(p_session_id)`, `orders.session_id`, trạng thái `expired_needs_review`.
Grep toàn repo: **không có thứ nào tồn tại**, và spec này cũng không đề xuất chúng.

Thiết kế ở đây đơn giản hơn hẳn: phiên **tự mở từ `table_id`**, không có chủ phiên, không có
thiết bị, ai ngồi bàn đó gọi món cũng vào chung một bill — đúng cái quán nhậu cần. Việc chống
người lạ quét QR từ xa do **quy trình giấy §4** lo, không cần quyền sở hữu phiên trong phần mềm.

Nếu anh Tú muốn thêm tầng host/device thì đó là một quyết định mở rộng phạm vi, cần chốt riêng
trước khi code (xem câu hỏi cuối phần trả lời).

---

> Khi bắt đầu code: thêm 1 dòng vào bảng **§10 Lịch sử quyết định** của `CLAUDE.md`, dựng
> `docs/superpowers/plans/2026-08-26-postpay-table-session-print.md` và `TESTING-BL.md`,
> rồi mới làm BL-1.
