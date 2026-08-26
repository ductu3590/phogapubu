# MEVO Quy trình "Đặt trước — Trả sau" + In phiếu bếp 2 liên — đặc tả thiết kế

> **Ngày:** 2026-08-26
> **Trạng thái:** ĐỀ XUẤT — chờ anh Tú chốt, chưa code dòng nào
> **Quán mở đường:** Quán nhậu **Bảo Lương** (mini-app riêng, backend chung)
> **Phạm vi:** Thêm quy trình vận hành thứ 2 cho MEVO, chủ quán tự chọn trong `/admin`.
> **Không đụng:** Phở Gà Pubu giữ nguyên 100% luồng trả-trước hiện tại.

> ### Đọc trước khi code — 5 điểm dễ sai nhất
>
> 1. **`order_flow` mặc định `prepay`.** Mọi nhánh mới chỉ chạy khi `order_flow='postpay'`.
>    Nguyên tắc cũ của repo: *"cắm thêm, tắt là như chưa từng tồn tại"*. Quán đang chạy
>    không được đổi hành vi dù chỉ một pixel.
> 2. **Trả sau ≠ tiền mặt.** Đừng tái dùng `payment_method='cash'` cho tiện (§2.2). Repo này
>    đã ăn một lần đau vì cột `payment_method` bị hiểu sai nghĩa (mig 032 phải rename
>    `zalopay`→`zalo_checkout`). Thêm kênh `counter` và ghi instrument thật lúc thu tiền.
> 3. **"Trả một lần cuối bữa" bắt buộc phải có PHIÊN BÀN.** Gộp theo `table_id` trần là sai:
>    bàn quay vòng, khách mới ngồi vào bàn cũ sẽ thấy — và bị tính — đơn của khách trước (§3.1).
> 4. **Server KHÔNG in được.** Supabase không nói chuyện với máy in ở Lào Cai. In là việc của
>    trình duyệt trên máy cạnh máy in. Cái server phải lo là *"đơn này đã in chưa"* — và phải
>    lo bằng UPDATE nguyên tử, không phải bằng state trong React (§5.4).
> 5. **Hộp thoại "Bạn còn đơn chưa thanh toán" phải TẮT ở postpay.** Ở luồng trả sau thì đơn
>    nào cũng "chưa thanh toán" — quên guard chỗ này là khách Bảo Lương bị hỏi mỗi lần mở app,
>    và giỏ hàng bị khoá bởi `lockedByOrderId` không cho gọi thêm món (§6.3).

---

## 0. Việc KHÔNG cần code — dựng mini-app cho Bảo Lương

Phần "tạo mini-app cho quán khác" đã có sẵn quy trình, không nằm trong spec này:

- Skill `.claude/skills/replicate-mini-app/SKILL.md` → lệnh nhanh `onboard quán bao-luong`.
- Tạo store ở `/mevo` (wizard, mig 2026-07-24), Zalo App ID + OA riêng, worktree riêng
  `mini-app-instances/bao-luong/` (branch `deploy/bao-luong`, sparse-checkout chỉ `mini-app/`).
- Backend Supabase dùng chung, phân theo `store_id`; admin-web dùng chung.

Spec này chỉ trả lời phần MỚI: **Bảo Lương vận hành khác Phở Gà Pubu, và sự khác nhau đó
phải là một công tắc trong admin chứ không phải một nhánh code riêng.**

---

## 1. Hai quy trình khác nhau ở đâu

| | **`prepay`** — Phở Gà Pubu (đang chạy) | **`postpay`** — Bảo Lương (mới) |
|---|---|---|
| Khách quét QR | chọn món → **trả tiền** → bếp mới nhận | chọn món → **gửi bếp ngay**, chưa trả tiền |
| Bằng chứng khách có mặt thật | **tiền đã về** (`payment_received_at`) | **phiếu in mang ra tận bàn** — không có khách thì không ai nhận phiếu |
| Số lần gọi món | mỗi lần gọi = 1 đơn, trả 1 lần | gọi nhiều lượt suốt bữa, **trả 1 lần cuối** |
| Theo dõi món ra | app + màn bếp | **gạch bút trên phiếu giấy tại bàn** |
| Thanh toán | ZaloPay / chuyển khoản trong app, trước khi ăn | tại quầy, cuối bữa — CK hoặc quét QR quầy |
| Rủi ro chính | khách bỏ dở giữa chừng (đã có sweep 30') | đơn ma từ QR bị chụp (§6) |
| Hợp với | quán ăn nhanh, một lượt gọi, khách vãng lai | **quán nhậu** — ngồi lâu, gọi thêm liên tục, gọi cả bàn |

Điều đáng nói: MEVO hôm nay **đã làm được 60%** luồng postpay mà không ai nhận ra. Đơn
`payment_method='cash'` vào bếp ngay lập tức không cần tiền (`admin-web/lib/kitchen-announce.ts`),
`sweep_abandoned_orders` cố tình bỏ qua đơn cash, `hasRealMoney` đã tách "tiền thật" khỏi
"status". Ba thứ còn thiếu là: **phiên bàn**, **in phiếu**, và **công tắc chọn quy trình**.

---

## 2. Công tắc: `stores.order_flow`

### 2.1 Một cột, hai giá trị

```sql
alter table stores
  add column if not exists order_flow text not null default 'prepay';
alter table stores add constraint stores_order_flow_check
  check (order_flow in ('prepay','postpay'));
```

- `prepay` — luồng hiện tại, mặc định mọi quán cũ và mọi quán mới.
- `postpay` — đặt trước, thu tiền cuối bữa tại quầy.

Chủ quán đổi ở `/admin/settings`, ngay dưới khối "Phương thức thanh toán", dạng 2 thẻ chọn
kèm mô tả một câu — **không phải toggle trần**, vì đổi nhầm là đổi cả cách quán chạy:

```
◉ Trả trước  — Khách thanh toán trong app rồi bếp mới làm. Hợp quán ăn nhanh.
○ Trả sau    — Khách gọi món nhiều lượt, in phiếu ra bàn, thanh toán một lần tại quầy.
               Hợp quán nhậu, quán ngồi lâu.
```

Đổi quy trình khi **đang có bàn mở** thì chặn, báo: *"Còn 3 bàn chưa thanh toán, đóng hết
rồi mới đổi được"*. Không thì đơn nửa phiên treo lơ lửng giữa hai luật.

### 2.2 Kênh thanh toán mới: `counter`

Cám dỗ lớn nhất của spec này là tái dùng `payment_method='cash'` cho đơn Bảo Lương — vì
`cash` **đã** vào bếp ngay, **đã** không bị sweep, **đã** vào doanh thu đúng. Gần như free.

Đừng làm. Lý do:

- Khách Bảo Lương phần lớn sẽ **chuyển khoản** ở quầy, không trả tiền mặt. Ghi `cash` là
  ghi sai vào chính cột mà báo cáo đọc — đúng loại lỗi mà spec PM (§2) đã phải viết cả
  chương để gỡ.
- Quán `prepay` nào bật tiền mặt sẽ vô tình được nửa luồng postpay (đơn vào bếp không cần
  tiền) mà không ai cố ý bật.

Nên:

```sql
-- orders.payment_method: thêm 'counter'   (kênh: thu tại quầy, cuối bữa)
-- stores.payment_methods: thêm 'counter'  (Bảo Lương: payment_methods = '{counter}')
-- payment_instrument ghi lúc THU: 'cash' | 'bank'   ← chỗ trả lời "khách trả bằng gì"
```

`counter` là **kênh**, `payment_instrument` là **phương tiện** — đúng mô hình 3 cột mà mig 030
đã dựng, không phát minh gì mới.

> **Đường tắt nếu cần chạy gấp trong 1 sprint:** dùng `cash` cho v1, ghi instrument thật lúc
> thu, và trả nợ đổi tên ở sprint sau. Chi phí trả nợ: 1 migration backfill + sửa 6 chỗ ở §8.
> Tôi không khuyên, nhưng nếu Bảo Lương cần khai trương gấp thì đây là chỗ cắt được.

---

## 3. Phiên bàn — nền của "gọi nhiều lượt, trả một lần"

### 3.1 Vì sao không gộp theo `table_id` trần

Nghe thì đơn giản: bill của bàn 5 = tổng mọi đơn của bàn 5 chưa thanh toán. Nhưng:

- Bàn 5 khách trước quên thanh toán / nhân viên quên bấm → khách sau ngồi vào **thấy luôn**
  hoá đơn 800k của người lạ.
- Không có mốc "bữa này bắt đầu lúc nào" → không in được "tạm tính từ đầu bữa", không biết
  bàn nào đang mở bao lâu.
- Cửa sổ 6h của "Món đã gọi" (`zalo_user_id + table_id + 6h`) là luật của **khách**, không
  phải luật của **bàn** — hai khách khác Zalo cùng bàn (đi nhậu theo nhóm, mỗi người gọi món
  từ máy mình) phải chung một bill.

Điểm cuối là quan trọng nhất với quán nhậu: **một bàn, nhiều điện thoại, một hoá đơn.**

### 3.2 Schema

```sql
create table table_sessions (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references stores(id),
  table_id     uuid not null references tables(id),
  opened_at    timestamptz not null default now(),
  closed_at    timestamptz null,
  close_reason text null check (close_reason in ('paid','void','auto_stale')),
  closed_by    uuid null,           -- auth.uid() của người bấm thu tiền (audit)
  total_amount int not null default 0
);

-- Một bàn chỉ có ĐÚNG MỘT phiên mở tại một thời điểm — chốt chặn ở DB, không ở app code.
create unique index table_sessions_one_open_per_table
  on table_sessions(table_id) where closed_at is null;

alter table orders add column if not exists table_session_id uuid null references table_sessions(id);
create index orders_table_session_idx on orders(table_session_id) where table_session_id is not null;
```

### 3.3 Vòng đời

| Mốc | Ai làm | Chuyện gì xảy ra |
|---|---|---|
| **Mở** | tự động, trong `create_order` | Quán `postpay` + đơn `dine_in` → tìm phiên mở của bàn; không có thì INSERT. Đơn gắn `table_session_id`. |
| **Gọi thêm** | khách | Đơn mới rơi vào **đúng phiên đang mở**, bất kể Zalo UID nào gọi. |
| **Đóng — thu tiền** | nhân viên/chủ quán tại quầy | RPC `close_table_session` → mọi đơn trong phiên nhận `payment_received_at`, `payment_instrument`; `close_reason='paid'`. |
| **Đóng — huỷ** | chủ quán | Bàn đơn ma / khách bỏ về: `close_reason='void'`, đơn `cancelled`, **không** ghi tiền. |
| **Bỏ quên** | sweep | Phiên mở > 8h → `close_reason='auto_stale'`, **KHÔNG tự ghi tiền**, hiện cảnh báo ở `/admin`. Máy không được phép tự kết luận là quán đã thu tiền. |

Một chi tiết đẹp: trigger `auto_complete_dine_in` (mig 031) đã tự đóng đơn `dine_in` khi
`status='ready'` **và** có `payment_received_at`. Nên lúc đóng phiên, các đơn bếp đã làm xong
**tự chuyển `paid`** — không cần viết thêm logic đóng đơn. Đơn còn `cooking` thì chuyển `paid`
khi bếp bấm xong. Trigger cũ lo đúng việc, không đụng vào.

---

## 4. Luồng đầy đủ Bảo Lương

```
[19:40] Bàn 5 — 4 khách ngồi xuống, anh A quét QR
        → Mini App Bảo Lương mở, menu quán nhậu
        → chọn: Lòng nướng x2, Nem chua rán x1, Bia Hà Nội x3
        → bấm "GỬI ĐƠN XUỐNG BẾP"   (không có bước thanh toán)

[19:40] Server: create_order → chưa có phiên bàn 5 → MỞ PHIÊN #S-118
        → đơn #045 gắn vào phiên, payment_method='counter', vào bếp NGAY

[19:40] Màn bếp: chuông + loa đọc "Bàn 5, hai lòng nướng, một nem chua rán, ba bia Hà Nội"
        → máy in nhiệt tự nhả 2 LIÊN:
             LIÊN 1 — BẾP    (bếp kẹp lên dây, làm theo)
             LIÊN 2 — KHÁCH  (nhân viên cầm ra bàn 5)

[19:41] Nhân viên mang LIÊN 2 ra bàn 5 → có khách thật, đưa phiếu.
        (Bàn trống → biết ngay là đơn ma → bấm "Huỷ đơn này" ngay trên phiếu/màn bếp)

[19:52] Bia ra trước → nhân viên gạch dòng "Bia Hà Nội" trên LIÊN 2 tại bàn
[20:05] Lòng nướng ra → gạch tiếp. Khách nhìn phiếu biết còn nem chua chưa ra.

[20:30] Anh B (cùng bàn, Zalo khác) quét QR gọi thêm → đơn #051
        → rơi vào ĐÚNG phiên #S-118 → in tiếp 2 liên "LƯỢT 2"

[22:10] Khách ra quầy thanh toán
        → Nhân viên mở /staff/tables → Bàn 5 · 3 lượt · 1.240.000đ
        → bấm "Thu tiền" → chọn Chuyển khoản → màn hình hiện QR VietQR
          đúng 1.240.000đ, nội dung "BAN5 S118"
        → khách quét bằng app ngân hàng, chuyển
        → nhân viên liếc app NH thấy tiền về → bấm "Đã nhận"
        → phiên đóng, 3 đơn nhận payment_received_at + instrument='bank'
        → bàn 5 biến mất khỏi danh sách "Bàn đang mở", vào doanh thu ngày
```

---

## 5. In phiếu 2 liên

### 5.1 Ba phương án phần cứng

| | Cách làm | Ưu | Nhược | Chi phí |
|---|---|---|---|---|
| **P1 ⭐ khuyến nghị** | Màn bếp (web) chạy trên **mini-PC/laptop Windows**, Chrome mở bằng cờ `--kiosk-printing`, máy in nhiệt 80mm cắm USB. Web gọi `window.print()` → in thẳng, **không hiện hộp thoại** | Không thêm hạ tầng nào. Cập nhật theo deploy web như mọi tính năng khác. Sửa mẫu phiếu = sửa CSS | Phải có máy tính ở bếp và Chrome mở sẵn | Máy in 80mm USB ~1–1,8tr + máy tính (dùng máy có sẵn) |
| **P2** | **Android + RawBT**: máy in bluetooth 58mm, app RawBT làm print service, Chrome Android in qua nó | Rẻ nhất, chỉ cần điện thoại cũ | Vẫn phải bấm xác nhận in mỗi đơn (không thật sự tự động), bluetooth hay rớt giữa ca | Máy in BT ~700k–1,2tr |
| **P3** | **Agent in cục bộ**: Node/Python trên mini-PC, nghe Supabase Realtime, bắn ESC/POS thẳng tới máy in LAN cổng 9100 | In cả khi không ai mở màn bếp; chắc chắn nhất | Phải cài, phải tự khởi động cùng máy, hỏng thì phải hỗ trợ từ xa — thứ khó nhất khi quán ở xa | +1 ngày công, +gánh vận hành |

**Chốt: làm P1 cho Bảo Lương.** P3 chỉ làm nếu chạy thật một tháng và đo được là P1 sót phiếu.
Đừng dựng agent khi chưa có bằng chứng là cần — nó là thứ duy nhất trong hệ thống mà MEVO
không sửa được từ xa.

### 5.2 Vì sao không in từ server

Supabase không có đường tới máy in đặt trong bếp ở Lào Cai. Muốn server in được thì phải có
máy in cloud (Sunmi/Xprinter cloud — phí thuê bao + phụ thuộc nhà cung cấp) hoặc agent cục bộ
(P3). Trình duyệt ở bếp thì **đã** ngồi ngay cạnh máy in và **đã** nhận realtime đơn mới. Việc
duy nhất server phải làm là chống in trùng (§5.4).

### 5.3 Mẫu phiếu

Khổ 80mm, font monospace, in đen trắng. Hai liên trong **một** trang, cách nhau đường cắt —
bấm in **một lần** ra hai liên, không phụ thuộc chuyện đặt `copies=2` (web không set được
tin cậy).

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

- Ô `☐` trước mỗi món — chỗ nhân viên gạch bút khi bê ra.
- Ghi chú món (ít cay, không hành) in thụt vào dưới tên món, **không** bỏ qua — đây là thứ
  hay mất nhất khi chuyển từ gọi miệng sang gọi app.
- "Cả bàn (N lượt)" giúp khách tự đối chiếu cuối bữa, giảm cãi nhau ở quầy.

CSS: `@page { size: 80mm auto; margin: 0 }`, `@media print` ẩn toàn bộ màn bếp, chỉ chừa
`#print-ticket`. Khổ giấy đọc từ `stores.printer_paper_width` (`'58'|'80'`).

### 5.4 Chống in trùng và in sót — chỗ dễ vỡ nhất

Vấn đề thật: bếp mở màn hình trên 2 thiết bị, hoặc F5 giữa ca → mỗi đơn in 2–4 lần. Ngược lại,
trình duyệt sập lúc đơn về → phiếu không bao giờ ra.

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

Luật ở màn bếp: **gọi RPC TRƯỚC, chỉ in khi RPC trả `ok:true`.** Hai tab cùng nhận realtime
thì chỉ một tab thắng UPDATE — tab kia không in. Đây là chống-trùng nguyên tử ở DB, không
phải `useRef` trong React (reload là mất).

Đánh đổi phải nói thẳng: **đánh dấu trước khi in** nghĩa là hết giấy / máy in tắt → đơn ghi
"đã in" mà phiếu không ra. Bù bằng:
- Nút **"In lại"** trên mọi đơn ở màn bếp (tăng `print_count`, không đụng `printed_at`).
- Badge đỏ **"CHƯA IN"** cho đơn `printed_at is null` quá 2 phút — bếp nhìn thấy ngay là
  máy in đang chết, không phát hiện lúc đóng ca.

Chiều ngược lại (in xong mới đánh dấu) thì mọi lần mạng chớp là in trùng — với giấy nhiệt
và một quán nhậu đông thì in trùng khó chịu hơn in sót, vì in sót có badge báo còn in trùng
thì bếp làm gấp đôi món.

Cấu hình quán: `kitchen_auto_print boolean default false`, `print_copies int default 2`,
`printer_paper_width text default '80'`.

---

## 6. Chống đơn phá hoại

### 6.1 Cơ chế anh mô tả — và chỗ nó hở

Phiếu mang ra bàn là kiểm soát tốt: bàn trống thì phiếu không có ai nhận, nhân viên biết ngay.
Nhưng nó là kiểm soát **sau khi bếp đã bắt tay làm**. Trình tự thật:

```
đơn ma về ──→ bếp bắt đầu làm ──→ phiếu in ──→ NV ra bàn (~1-2') ──→ phát hiện bàn trống
                    └─ 1-2 phút nguyên liệu đã lên bếp ─┘
```

Với món nhậu (nướng, lẩu, đồ chiên) 1–2 phút có thể đã là mất đồ thật. Không phải thảm hoạ,
nhưng cũng không phải bằng không — và kẻ phá hoại có thể bắn liên tục 10 đơn.

Ba lớp đã có sẵn, không phải làm gì: QR gắn cứng từng bàn, chặn ngoài giờ/tạm nghỉ
(mig 017, chặn ở cả RPC nên không lách được), và mỗi quán một mini-app riêng.

### 6.2 Đề xuất thêm: `require_open_table` (mặc định TẮT)

Một công tắc nữa ở `/admin/settings`, chỉ hiện khi `order_flow='postpay'`:

> **Xác nhận bàn có khách trước khi làm món đầu tiên**
> Đơn ĐẦU TIÊN của mỗi bàn chờ nhân viên liếc qua bàn rồi bấm "Có khách". Các lượt gọi sau
> trong cùng bữa vào bếp thẳng. Tốn 1 lần bấm mỗi bàn.

Cụ thể: đơn mở phiên nằm ở cột mới **"Chờ xác nhận bàn"** trên màn bếp (và trên `/staff/orders`
cho nhân viên chạy bàn); bấm "Có khách" → phiên mở, đơn vào bếp, in phiếu. Đơn cùng phiên
sau đó bỏ qua bước này hoàn toàn.

Tôi khuyên **để TẮT lúc khai trương** đúng như anh mô tả — chạy vài hôm, nếu không có đơn ma
thì thôi, đỡ một thao tác cho nhân viên. Có đơn ma thì bật, không cần deploy lại.

---

## 7. Thanh toán cuối bữa tại quầy

### 7.1 Màn "Bàn đang mở"

Thêm `/staff/tables` (nhân viên) + tab tương ứng trong `/admin` (chủ quán) — mobile-first,
nhân viên cầm điện thoại:

```
BÀN ĐANG MỞ (4)
┌────────────────────────────────┐
│ BÀN 5      3 lượt · 2h30       │
│ 1.240.000đ                     │
│ [Xem chi tiết] [In tạm tính]   │
│ [ THU TIỀN ]                   │
└────────────────────────────────┘
```

"Thu tiền" → chọn **Tiền mặt** hoặc **Chuyển khoản**:

- **Tiền mặt** → xác nhận → đóng phiên, `payment_instrument='cash'`.
- **Chuyển khoản** → hiện **QR VietQR động** đúng số tiền để khách quét tại quầy:
  `https://img.vietqr.io/image/<BIN>-<STK>-compact2.png?amount=1240000&addInfo=BAN5%20S118`
  — chỉ là URL ảnh, không cần API key, không cần tài khoản. Nhân viên nhìn app ngân hàng
  thấy tiền về → bấm "Đã nhận" → đóng phiên, `payment_instrument='bank'`.

Cần thêm vào `stores`: `bank_bin`, `bank_account_no`, `bank_account_name` (nhập ở
`/admin/settings`). Thiếu thì nút "Chuyển khoản" ẩn, chỉ còn tiền mặt.

### 7.2 Đối soát tự động — để sau, đã có đường

`payment_received_via` đã dự trù sẵn giá trị `'sepay'` từ mig 030, và **PM-5** trong
`docs/superpowers/plans/2026-07-21-multi-method-payment.md` đã lên kế hoạch webhook SePay.
Khi bật, webhook khớp theo **nội dung chuyển khoản** (`BAN5 S118` → session id) và tự đóng
phiên — nhân viên không phải nhìn app ngân hàng nữa.

Khớp theo nội dung CK đơn giản hơn hẳn thuật toán "đuôi định danh `payment_amount`" của PM-2,
vì ở quầy ta **chủ động sinh nội dung CK**, không phụ thuộc khách gõ. Đây là lý do phụ để
làm phiên bàn: nó cho ta một mã ngắn, duy nhất, có thời hạn để khớp tiền.

### 7.3 Quyền: nhân viên có được thu tiền không?

`confirm_manual_payment` hiện là **owner-only**, và mig 028 đã cố tình siết `store_staff` khỏi
việc tự set `payment_received_at` qua REST. Nhưng ở quán nhậu, người đứng quầy lúc 22h là
nhân viên, không phải chủ.

Đề xuất: RPC **riêng** `close_table_session(p_session_id, p_instrument)` cho phép cả
`store_owner` lẫn `store_staff`, ghi `closed_by = auth.uid()`. Đây **không** phải nới lỏng
mig 028 — 028 chặn staff **ghi thẳng vào `orders` qua REST**; RPC có kiểm quyền, có audit,
có phạm vi hẹp là đúng cách mà spec 028 đã chừa. Không đụng vào `confirm_manual_payment`.

---

## 8. Danh sách đầy đủ chỗ phải sửa

### 8.1 Migration

| # | Nội dung |
|---|---|
| **039** | `stores.order_flow` + `require_open_table` + `kitchen_auto_print` + `print_copies` + `printer_paper_width` + `bank_bin/bank_account_no/bank_account_name`; nới CHECK `payment_methods` cho `'counter'` |
| **040** | `table_sessions` + unique index 1-phiên-mở + `orders.table_session_id` |
| **041** | `orders.printed_at/print_count` + RPC `kitchen_claim_print` (grant role `kitchen`) |
| **042** | `create_order` v10: nhận `counter`, tự mở/gắn phiên khi `postpay`, tôn trọng `require_open_table` |
| **043** | RPC `close_table_session` / `void_table_session` / `open_table_session`; sweep phiên quá hạn |

### 8.2 Code — điểm phải rà, không được sót

| File | Sửa gì | Sót thì sao |
|---|---|---|
| `admin-web/lib/kitchen-announce.ts` | `orderInKitchen`: thêm `payment_method === 'counter'` | Đơn Bảo Lương không bao giờ hiện ở bếp |
| `admin-web/lib/revenue.ts` | `isAwaitingPayment`: thêm `counter` | Cột "chờ thanh toán" bỏ sót cả quán |
| `admin-web/lib/actions/orders.ts` | `completeOrder`: `canConfirmManual` thêm `counter` | Chủ quán không đóng tay được đơn kẹt |
| `supabase` `sweep_abandoned_orders` | loại trừ `counter` (như đang loại `cash`) | **Đơn khách đang ăn bị tự huỷ sau 30 phút** |
| `mini-app/src/pages/checkout/index.tsx` | `postpay` → bỏ bước chọn PT, nút "Gửi đơn xuống bếp", bỏ nhánh Zalo Checkout | Khách bị đẩy vào màn thanh toán không tồn tại |
| `mini-app/src/services/unpaid-order.ts` + `components/common/unpaid-order-prompt.tsx` | tắt hẳn ở `postpay` | Khách bị hỏi "còn đơn chưa thanh toán" **mỗi lần mở app** |
| `mini-app/src/stores/cart.store.tsx` | không set `lockedByOrderId` ở `postpay` | **Khách không gọi thêm được món** — vỡ toàn bộ ý tưởng quán nhậu |
| `mini-app/src/pages/session-orders/index.tsx` | hiện cả phiên bàn + tạm tính, không chỉ đơn của UID mình | Mỗi người trong bàn thấy một nửa hoá đơn |
| `admin-web/app/kitchen/[storeSlug]/kitchen-display.tsx` | khối in ẩn + auto-print + nút "In lại" + badge "CHƯA IN" (+ cột "Chờ xác nhận bàn" nếu bật) | — |
| `admin-web/app/admin/settings/settings-client.tsx` | khối chọn quy trình + cấu hình in + tài khoản NH | — |
| `mini-app` spin (`spin-section`) | tắt ở `postpay` v1 | Vòng quay gắn với "đơn có tiền thật", ở postpay chỉ đúng lúc đóng phiên — v1 để yên |

### 8.3 Không đụng

`checkout-create-mac`, `checkout-notify`, `payment.service.ts`, `checkout-result.ts`,
`confirm_manual_payment`, `auto_complete_dine_in`, toàn bộ luồng takeaway/ship. Quán `prepay`
đi đúng nhánh cũ, không có một dòng điều kiện nào chạy khác trước.

---

## 9. Rủi ro

| # | Rủi ro | Mức | Xử lý |
|---|---|---|---|
| 1 | **Máy in chết giữa ca, không ai biết** | Cao | Badge "CHƯA IN" quá 2' + nút In lại (§5.4). Bếp vẫn thấy đơn trên màn hình — in hỏng làm chậm chứ không mất đơn |
| 2 | **Đơn ma tốn nguyên liệu 1-2 phút đầu** | Trung bình | `require_open_table` bật được bất cứ lúc nào (§6.2) |
| 3 | **Nhân viên quên đóng phiên** → bàn treo, doanh thu ngày thiếu | Trung bình | Danh sách "Bàn đang mở" luôn hiện + cảnh báo bàn mở > 4h; sweep 8h đánh `auto_stale` **không** ghi tiền |
| 4 | **Khách về không trả tiền** | Trung bình | Đây là rủi ro *vận hành*, không phải rủi ro phần mềm — quán nhậu truyền thống cũng chịu. Phiếu tại bàn + màn "Bàn đang mở" làm nó dễ phát hiện hơn sổ giấy |
| 5 | Hai tab màn bếp in trùng | Đã xử lý | UPDATE nguyên tử (§5.4) |
| 6 | Chuyển khoản chưa về mà nhân viên bấm "Đã nhận" | Trung bình | `closed_by` ghi lại ai bấm; SePay (§7.2) xoá hẳn rủi ro này khi bật |
| 7 | Chủ quán đổi `order_flow` giữa lúc có bàn mở | Thấp | Chặn ở server (§2.1) |

---

## 10. Kế hoạch triển khai

Theo **QUY TẮC BẮT BUỘC VỀ TEST** của CLAUDE.md: mỗi sprint xong thì dừng, anh Tú test theo
`TESTING-BL.md`, PASS rồi mới sang sprint sau.

| Sprint | Nội dung | Test gate |
|---|---|---|
| **BL-1** | Mig 039+040: `order_flow`, `table_sessions`, `counter`. UI chọn quy trình ở `/admin/settings`. **Chưa đụng mini-app.** | Phở Gà Pubu không đổi gì; bật postpay cho store test không vỡ |
| **BL-2** | `create_order` v10 + mini-app postpay: nút "Gửi đơn xuống bếp", tắt unpaid-prompt, tắt khoá giỏ, session-orders gộp phiên | Gọi 3 lượt từ 2 Zalo khác nhau → cùng 1 phiên, bếp thấy cả 3 |
| **BL-3** | In phiếu: mig 041, mẫu phiếu 2 liên, auto-print, In lại, badge CHƯA IN | In thật ra giấy; F5 màn bếp 5 lần không in trùng; tắt máy in → badge đỏ |
| **BL-4** | Thu tiền: `/staff/tables`, `close_table_session`, QR VietQR động, cấu hình TK ngân hàng | Thu 1 bàn 3 lượt → đúng tổng, đúng doanh thu ngày, bàn rời danh sách |
| **BL-5** | `require_open_table` + sweep phiên quá hạn + cảnh báo bàn treo | Bật/tắt công tắc, đơn đầu chờ xác nhận đúng như mô tả |

Sau BL-5: onboard Bảo Lương thật theo skill `replicate-mini-app`, chạy pilot 1 tuần rồi mới
quyết P3 (agent in) có cần không.

---

## 11. Phần cứng cần mua cho Bảo Lương

| Món | Gợi ý | Giá tham khảo |
|---|---|---|
| Máy in nhiệt 80mm USB | Xprinter XP-80 / Gprinter dòng phổ thông | 1.000.000 – 1.800.000đ |
| Máy tính chạy màn bếp | mini-PC hoặc laptop cũ (Chrome `--kiosk-printing`) | dùng máy có sẵn, hoặc 2–4tr |
| Màn hình bếp | màn cũ / TV có HDMI | có sẵn |
| Giấy in nhiệt K80 | cuộn 80mm | 8.000 – 12.000đ/cuộn |
| Bút bi | để gạch món | — |

Không phát sinh phí phần mềm hàng tháng: in bằng trình duyệt, QR bằng ảnh VietQR miễn phí,
loa đọc đơn bằng Web Speech (đã có).

---

## 12. Cần anh Tú chốt trước khi lập plan

1. **Bếp Bảo Lương có máy tính không**, hay chỉ có điện thoại/tablet Android? → quyết P1 hay P2.
2. **58mm hay 80mm?** 80mm dễ đọc hơn cho phiếu nhiều món (quán nhậu hay gọi 8–10 món/lượt),
   tôi khuyên 80mm.
3. **Bật `require_open_table` ngay từ đầu, hay để tắt như anh mô tả?** Tôi khuyên tắt, bật sau
   nếu gặp đơn ma.
4. **Số tài khoản ngân hàng của quán** để sinh QR quầy (tên NH + STK + tên chủ TK).
5. **Mỗi lượt gọi in một phiếu riêng** (như §4), hay in gộp cả bàn mỗi lần? Tôi khuyên in
   theo lượt — bếp cần biết món nào mới, không cần đọc lại món đã làm.
6. **Kênh `counter` hay dùng tạm `cash`?** (§2.2) — chỉ hỏi nếu Bảo Lương cần khai trương gấp.

---

> Khi anh chốt: thêm 1 dòng vào bảng **§10 Lịch sử quyết định** của `CLAUDE.md`, dựng
> `docs/superpowers/plans/2026-08-26-postpay-table-session-print.md` và `TESTING-BL.md`,
> rồi mới code BL-1. Spec này chưa được ghi vào CLAUDE.md vì chưa phải quyết định đã chốt.
