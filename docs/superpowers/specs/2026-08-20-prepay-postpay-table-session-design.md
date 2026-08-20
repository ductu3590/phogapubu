# Chế độ vận hành Trả trước / Trả sau + Phiên bàn (table session)

- **Ngày:** 2026-08-20
- **Trạng thái:** Spec — chờ anh Tú duyệt
- **Người viết:** Claude Code (theo yêu cầu của Đỗ Đức Tú)
- **Liên quan:** [2026-07-15-multi-method-payment-design.md](2026-07-15-multi-method-payment-design.md),
  [2026-07-15-staff-assisted-ordering-design.md](2026-07-15-staff-assisted-ordering-design.md),
  [2026-08-06-repay-abandoned-checkout-design.md](2026-08-06-repay-abandoned-checkout-design.md)

---

## 1. Yêu cầu gốc

Chủ quán chọn **phương pháp vận hành** trong admin web. Hai luồng:

1. **Trả trước** — mọi thao tác (QR khách tự đặt, nhân viên đặt hộ, ship) đều phải thanh toán
   trước khi bếp làm.
2. **Trả sau** — đơn QR **tại bàn** được ăn trước trả sau, nhưng phải có **cơ chế phiên**:
   điện thoại A đang giữ bàn 1 và chưa thanh toán thì điện thoại B **không** gọi thêm được;
   A vẫn gọi thêm được; A thanh toán xong thì B mới được đặt.

Chủ quán cấu hình một lần, hệ thống cứ thế mà chạy.

---

## 2. Phản biện — những chỗ yêu cầu gốc va vào thực tế

Anh bảo phản biện nếu thấy cần, nên tôi nói thẳng 6 điểm dưới đây. Mỗi điểm đều dẫn tới một
quyết định thiết kế cụ thể ở §4–§6, không phải bàn cho vui.

### PB1. Khoá cứng "một điện thoại một bàn" hạ cấp chính điểm hay của QR order

Bàn 4–6 người ở quán nhậu thường **mỗi người tự quét QR gọi món của mình** — đó là lý do QR order
hơn gọi nhân viên. Khoá cứng biến nó thành "một người order hộ cả bàn", tức là quay về mô hình cũ
nhưng bắt khách tự bấm.

Ca hỏng chắc chắn gặp: nhóm 6 người, anh A gọi trước, 20 phút sau anh B tới, muốn gọi thêm chai
bia → phải mượn máy anh A.

**Quyết định:** giữ nguyên yêu cầu của anh (khoá theo chủ phiên) làm **mặc định**, nhưng phiên là
của **bàn**, không phải của thiết bị — nên có sẵn hai đường thoát rẻ tiền:

- Nhân viên bấm **"Chuyển quyền gọi món"** → nhả chủ phiên, máy nào quét QR tiếp theo thành chủ.
- Nhân viên bấm **"Đóng bàn"** → kết thúc phiên (có/không thu tiền).

Không làm chế độ "nhiều máy cùng gọi vào một bill" ở v1 (YAGNI) — nhưng data model dưới đây
**không chặn** làm sau: chỉ cần cho phép nhiều `host` trên một `table_session`.

### PB2. Trả sau mở ra rủi ro "khoá bàn từ xa" (DoS bàn)

Người xấu chụp QR bàn 1, ngồi nhà mở phiên, gọi một ly trà đá → **bàn 1 bị khoá**, khách thật ngồi
vào không gọi được, và bếp còn làm ra một ly trà đá không ai lấy.

Đây là cái giá cố hữu của trả sau, không có cách nào triệt tiêu bằng phần mềm. Giảm nhẹ:

- Nhân viên đóng/mở khoá bàn một chạm (§6.4).
- Phiên **tự hết hạn** sau 6 giờ không hoạt động (khớp cửa sổ "Món đã gọi" hiện có).
- Bếp vẫn thấy đơn và vẫn huỷ được — đơn trả sau **không** bỏ qua mắt người.

**Phải nói rõ với chủ quán ngay trong admin**, không giấu: bật trả sau = chấp nhận có thể có đơn
ma. Đó chính là lý do nó phải là **lựa chọn của chủ quán**, không phải mặc định của hệ thống.

### PB3. Hôm nay hệ thống đã có "trả sau" trá hình — và đó là chỗ rối nhất phải dọn

`orderInKitchen()` hiện tại (`admin-web/lib/kitchen-announce.ts:19`):

```ts
return o.paymentReceivedAt !== null || o.paymentMethod === 'cash'
```

Nghĩa là: **bật `cash` trong `payment_methods` = quán đó đang chạy trả sau rồi**, chỉ thiếu phiên
bàn. Hệ quả xấu: một quán muốn trả trước nhưng bật tiền mặt (để nhân viên thu hộ) thì **đơn QR
tiền mặt vẫn vào bếp không cần tiền** — đúng con lỗ hổng mà mig 037 mới vá được một nửa (037 chỉ
chặn phương thức quán đã tắt, không chặn phương thức quán bật nhưng chỉ định cho nhân viên).

Gốc rễ: hiện **trục "khi nào thu tiền" đang bị suy ra từ trục "thu bằng gì"**. Hai trục khác nhau
bị nhét vào một cột.

**Quyết định:** tách tường minh.

| Trục | Cột | Quyết định điều gì |
|---|---|---|
| 1. **Khi nào thu** | `stores.payment_timing` (`prepay`/`postpay`) — MỚI | Đơn có được vào bếp khi chưa có tiền không |
| 2. **Thu bằng gì** | `orders.payment_method` + `orders.payment_instrument` (đã có) | Kênh/phương tiện, chỉ để vận hành + báo cáo |

Sau thay đổi này, `payment_method='cash'` **không còn tự động** cho đơn vào bếp; nó phải kèm
`stores.payment_timing='postpay'` (chi tiết §6.5).

### PB4. "Thanh toán xong" cho **cái gì** — một đơn hay cả bữa?

Yêu cầu viết "sau khi thanh toán xong **đơn hàng đó**". Nhưng trả sau thì một bữa ăn = **N đơn**
(gọi 3 lần là 3 `orders`). Không thể mở khoá bàn theo từng đơn — phải theo **cả phiên**.

Kéo theo: khách muốn tự trả trong app thì phải trả **tổng của N đơn** trong một lần mở Zalo
Checkout. Mà `checkout-create-mac` hiện ký MAC theo **một** `order_id`. Mở rộng nó = đụng đúng
chỗ mong manh nhất của hệ thống (MAC + notify), nơi đã tốn nhiều vòng debug (xem quyết định
2026-07-08 trong `CLAUDE.md`).

**Quyết định — chia hai giai đoạn:**

- **Giai đoạn 1 (spec này):** phiên do **nhân viên/chủ quán chốt**. Khách bấm **"Gọi thanh toán"**
  trong app (dùng lại `service_requests` type `payment` — **đã có sẵn**, không viết mới), nhân viên
  ra bàn thu tiền mặt hoặc cho quét VietQR, rồi bấm "Thu tiền & đóng bàn". Đúng nếp quán Việt.
- **Giai đoạn 2 (hoãn, §11):** khách tự thanh toán cả phiên qua Zalo Checkout.

Giai đoạn 1 đã thoả đủ yêu cầu gốc: thanh toán xong → phiên đóng → máy B đặt được.

### PB5. Định danh "chiếc điện thoại A" bằng gì cho chắc?

`zalo_user_id` là thứ ổn định nhất đang có, nhưng `getUserID()` có thể fail (khách không ở trong
Zalo, hoặc lỗi SDK) — hiện `app.tsx:18` nuốt lỗi im lặng. Nếu chỉ khoá theo Zalo UID thì khách
không lấy được UID sẽ **không bao giờ làm chủ phiên được**.

**Quyết định:** chủ phiên khớp **một trong hai**: `host_zalo_user_id` HOẶC `host_device_id`
(uuid tự sinh lưu `localStorage` key `mevo_device_id`). Mất app = mất device id, nhưng vẫn còn Zalo
UID; không có Zalo UID thì vẫn còn device id. Hai chân, gãy một vẫn đứng.

### PB6. Giờ phục vụ đang cắt ngang bữa ăn

`store_accepting_now()` chặn `create_order` khi ngoài giờ. Quán đóng 22:00, khách vào 21:50,
22:05 muốn gọi thêm bia → **bị từ chối**. Hôm nay chưa lộ vì chưa có phiên; có trả sau thì lộ ngay
và trông rất ngu ngốc với khách đang ngồi trong quán.

**Quyết định:** **ân hạn phiên đang mở** — đơn thuộc một phiên đã mở trước giờ đóng vẫn được tạo,
trong vòng **2 giờ** kể từ khi mở phiên. Ngoài 2 giờ đó thì chặn như thường.

---

## 3. Mô hình khái niệm

```
stores.payment_timing = 'prepay' | 'postpay'    ← chủ quán chọn trong /admin/settings
        │
        ├── prepay ─────────────────────────────────────────────────────────
        │     • Khách QR (dine_in)  → CHỈ zalo_checkout, trả xong mới vào bếp
        │     • Nhân viên đặt hộ    → tiền mặt (thu ngay) hoặc VietQR (khách quét)
        │                             → nhân viên bấm "Đã nhận tiền"
        │     • Pickup / Delivery   → luôn zalo_checkout trả trước (không đổi)
        │     • KHÔNG có phiên bàn
        │
        └── postpay ────────────────────────────────────────────────────────
              • Khách QR (dine_in)  → gọi món không cần trả, vào bếp ngay
              │                       nhưng PHẢI qua PHIÊN BÀN (khoá theo chủ phiên)
              • Nhân viên đặt hộ    → gắn vào phiên đang mở của bàn đó
              • Pickup / Delivery   → VẪN trả trước (không có COD — §11)
              • Chốt bill           → nhân viên "Thu tiền & đóng bàn" → mở khoá
```

**Một phiên = một bàn đang có khách = một bill.** Mỗi lần gọi vẫn là một `orders` riêng (bếp giữ
nguyên logic hiện tại — không đụng vào cột trạng thái/loa đọc đơn), các đơn cùng phiên nối với
nhau qua `orders.session_id`.

---

## 4. Cấu hình trong admin web

### 4.1 Mục mới "Cách vận hành quán" — `/admin/settings`

Đặt **trên** mục "Phương thức thanh toán" hiện có, vì nó quyết định mục kia còn nghĩa gì.

```
┌─ Cách vận hành quán ─────────────────────────────────────────┐
│ ( ) Trả trước — khách thanh toán rồi bếp mới làm             │
│     An toàn nhất. Không có đơn ma. Hợp quán bán mang về,     │
│     quán đông, quán không đủ người trông bàn.               │
│                                                              │
│ (•) Trả sau — khách ăn xong mới thanh toán                   │
│     Giống quán truyền thống. Khách gọi thêm thoải mái.      │
│     ⚠️ Người lạ chụp QR bàn vẫn có thể đặt đơn từ xa và làm  │
│        bàn đó bị khoá. Nhân viên mở khoá ở màn "Bàn".        │
└──────────────────────────────────────────────────────────────┘
```

Cảnh báo ⚠️ là **bắt buộc**, không phải trang trí — xem PB2.

### 4.2 Mục "Phương thức thanh toán" đổi nghĩa theo lựa chọn trên

- **Trả trước:** giữ nguyên UI hiện tại, nhưng toggle **"Tiền mặt" bị vô hiệu hoá** kèm chú thích
  *"Chế độ trả trước: khách tự đặt qua QR chỉ thanh toán online. Tiền mặt vẫn dùng được khi nhân
  viên đặt hộ."* — nói đúng sự thật thay vì để chủ quán bật một thứ không có tác dụng.
- **Trả sau:** ẩn hẳn mục này, thay bằng dòng *"Khách trả tiền lúc ra về — nhân viên chọn tiền mặt
  hay chuyển khoản khi chốt bill."*

### 4.3 Mục mới "Tài khoản nhận chuyển khoản (VietQR)"

Phục vụ yêu cầu *"nhân viên đặt hộ → sinh mã QR để khách chuyển khoản luôn"*.

| Trường | Cột `stores` | Ghi chú |
|---|---|---|
| Ngân hàng | `bank_bin` text | Dropdown, lưu mã BIN 6 số (VD Vietcombank `970436`) |
| Số tài khoản | `bank_account_number` text | |
| Tên chủ tài khoản | `bank_account_name` text | In hoa không dấu, hiện dưới mã QR |

Để trống cả ba = tắt luôn nút "Khách chuyển khoản" ở màn nhân viên.

**Vì sao VietQR tự sinh chứ không dùng lại Zalo Checkout:** mã VietQR do MEVO sinh **có chèn được
nội dung chuyển khoản** (`addInfo = MEVO <8 ký tự đầu order id>`), còn Zalo Checkout kênh BANK thì
không — đó chính là lý do PM-5 (SePay) bị bỏ ngày 2026-07-24. Nghĩa là **luồng này để ngỏ đường
đối soát tự động sau này**; v1 vẫn xác nhận tay.

---

## 5. Data model

### 5.1 Cột thêm vào `stores`

```sql
alter table stores
  add column if not exists payment_timing text not null default 'prepay'
    check (payment_timing in ('prepay','postpay')),
  add column if not exists bank_bin            text null,
  add column if not exists bank_account_number text null,
  add column if not exists bank_account_name   text null;
```

**Backfill giữ nguyên hành vi đang chạy** (quan trọng — không được đổi hành vi quán đang hoạt động
lúc migrate):

```sql
-- Quán đang bật 'cash' = thực tế đang chạy trả sau (PB3) → giữ nguyên
update stores set payment_timing = 'postpay' where 'cash' = any(payment_methods);
```

### 5.2 Bảng mới `table_sessions`

```sql
create table table_sessions (
  id                 uuid primary key default gen_random_uuid(),
  store_id           uuid not null references stores(id),
  table_id           uuid not null references tables(id),
  status             text not null default 'open' check (status in ('open','closed')),

  -- Chủ phiên: khớp MỘT TRONG HAI là được (PB5). NULL cả hai = phiên "chưa có chủ"
  -- (do nhân viên mở) → khách đầu tiên quét QR sẽ nhận quyền.
  host_zalo_user_id  text null,
  host_device_id     text null,

  opened_by          text not null check (opened_by in ('customer','staff')),
  opened_at          timestamptz not null default now(),
  last_activity_at   timestamptz not null default now(),

  closed_at          timestamptz null,
  closed_by          uuid null,          -- auth.uid() của nhân viên/chủ quán đóng phiên
  close_reason       text null check (close_reason in ('paid','staff_reset','expired')),

  constraint table_sessions_closed_state check (
    (status = 'open'   and closed_at is null and close_reason is null) or
    (status = 'closed' and closed_at is not null and close_reason is not null)
  )
);

-- MỘT phiên mở duy nhất trên mỗi bàn. Đây là thứ chặn race hai máy cùng bấm đặt (PB1/§6.2).
create unique index table_sessions_one_open_per_table
  on table_sessions(table_id) where status = 'open';

create index table_sessions_store_open on table_sessions(store_id) where status = 'open';
```

**Không** lưu `total_amount` trên phiên. Tổng luôn tính lại từ `orders` — một nguồn sự thật, không
có cache để lệch.

**Không** lưu `payment_received_at` trên phiên. Tiền vẫn ghi ở **từng đơn** (`orders.
payment_received_at`), đúng nguồn sự thật đã thống nhất từ PM-1. `close_reason='paid'` chỉ là nhãn.

### 5.3 Cột thêm vào `orders`

```sql
alter table orders
  add column if not exists session_id uuid null references table_sessions(id);
create index orders_session on orders(session_id) where session_id is not null;
```

### 5.4 Nới `payment_received_via` cho nhân viên

Hiện `orders_payment_received_state_check` (mig 030) chỉ cho `via='owner'` khi có `by`. Nhân viên
(`store_staff`) chốt bill cũng có `auth.uid()` nhưng **không phải owner** — ghi `'owner'` là nói dối
sổ sách.

```sql
alter table orders drop constraint if exists orders_payment_received_state_check;
alter table orders add constraint orders_payment_received_state_check check (
  (payment_received_at is null and payment_received_via is null and payment_received_by is null)
  or (payment_received_at is not null
      and payment_received_via in ('owner','staff')      -- ← thêm 'staff'
      and payment_received_by is not null)
  or (payment_received_at is not null
      and payment_received_via in ('zalo_callback','sepay','kitchen','legacy')
      and payment_received_by is null)
);

alter table orders drop constraint if exists orders_payment_received_via_check;
alter table orders add constraint orders_payment_received_via_check
  check (payment_received_via in ('zalo_callback','sepay','kitchen','owner','staff','legacy'));
```

---

## 6. Luồng chi tiết

### 6.1 Mở app, quét QR bàn (mini-app)

Sau khi `app.tsx` load xong store + table, nếu `payment_timing='postpay'` và có `tableId` thì gọi
thêm một RPC:

```
get_table_session_state(p_table_id, p_zalo_user_id, p_device_id) → jsonb
```

| Kết quả | Mini-app làm gì |
|---|---|
| `{mode:'prepay'}` | Không có gì đổi so với hiện tại |
| `{mode:'postpay', state:'free'}` | Cho gọi món bình thường; phiên sẽ mở khi đơn đầu tiên được tạo |
| `{mode:'postpay', state:'owner', session_id, order_count, total}` | Hiện thanh phiên ở đầu trang menu: *"Bàn 3 · 5 món · 245.000đ"*, tab "Món đã gọi" thêm nút **"Gọi thanh toán"** |
| `{mode:'postpay', state:'locked', opened_at}` | **Chặn đặt món**: banner đỏ *"Bàn này đang có khách gọi món (từ 19:20). Nếu bạn vừa ngồi vào, nhờ nhân viên mở bàn giúp."* + nút **"Gọi nhân viên"** (`service_requests` type `help`). Vẫn xem được menu. |

`p_device_id`: uuid sinh lần đầu, lưu `localStorage` key `mevo_device_id`.

Đây chỉ là **lớp hiển thị**. Chốt chặn thật nằm trong `create_order` (§6.2) — client luôn có thể là
bản cũ, đúng bài học của mig 037.

### 6.2 Tạo đơn — `create_order` v10

**Thứ tự trong hàm phải đổi.** Bản hiện tại (mig 037) chạy: validate method → check
`payment_methods` → check `store_accepting_now` → validate bàn. Bản mới phải là: validate
`order_type` → **validate bàn** → **khối phiên dưới đây** (nó ghi đè `p_payment_method` và cần biết
bàn hợp lệ) → check `payment_methods` → check `store_accepting_now` (đã có ân hạn phiên). Đảo thứ
tự này là lỗi dễ mắc nhất khi implement.

Khối phiên:

```
p_device_id text DEFAULT NULL          ← tham số MỚI (thêm cuối, giữ tương thích client cũ)

v_timing := (select payment_timing from stores where id = p_store_id);

IF v_timing = 'postpay' AND p_order_type = 'dine_in' THEN
    -- (a) Trả sau tại bàn: không chọn phương thức lúc đặt.
    p_payment_method := 'cash';        -- "thu tại quán, chưa thu" (xem ghi chú dưới)
    -- BỎ QUA check stores.payment_methods: ở trả sau, thu tại quán luôn hợp lệ.

    -- (b) Tìm hoặc mở phiên. INSERT ... ON CONFLICT DO NOTHING dựa vào
    --     unique index partial → hai máy bấm cùng lúc chỉ một phiên ra đời.
    SELECT * INTO v_session FROM table_sessions
      WHERE table_id = p_table_id AND status = 'open' FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO table_sessions (store_id, table_id, host_zalo_user_id, host_device_id, opened_by)
        VALUES (p_store_id, p_table_id, p_zalo_user_id, p_device_id, 'customer')
        ON CONFLICT DO NOTHING
        RETURNING * INTO v_session;
        IF v_session.id IS NULL THEN
            SELECT * INTO v_session FROM table_sessions
              WHERE table_id = p_table_id AND status = 'open' FOR UPDATE;
        END IF;
    END IF;

    -- (c) Phiên chưa có chủ (nhân viên mở hộ) → người này nhận quyền
    IF v_session.host_zalo_user_id IS NULL AND v_session.host_device_id IS NULL THEN
        UPDATE table_sessions
           SET host_zalo_user_id = p_zalo_user_id, host_device_id = p_device_id
         WHERE id = v_session.id RETURNING * INTO v_session;
    END IF;

    -- (d) KHOÁ: phải khớp một trong hai chân định danh
    IF NOT (
         (p_zalo_user_id IS NOT NULL AND v_session.host_zalo_user_id = p_zalo_user_id)
      OR (p_device_id   IS NOT NULL AND v_session.host_device_id   = p_device_id)
    ) THEN
        RAISE EXCEPTION 'Bàn này đang có khách khác gọi món. Nhờ nhân viên mở bàn giúp bạn.';
    END IF;

    v_session_id := v_session.id;

ELSIF v_timing = 'prepay' AND p_order_type = 'dine_in' THEN
    -- Trả trước: khách tự đặt qua QR CHỈ được online. Đóng nốt lỗ hổng PB3.
    IF p_payment_method <> 'zalo_checkout' THEN
        RAISE EXCEPTION 'Quán yêu cầu thanh toán trước khi bếp làm.';
    END IF;
END IF;
```

Và sửa `store_accepting_now` gate cho ân hạn phiên (PB6):

```
IF NOT store_accepting_now(p_store_id)
   AND NOT (v_session_id IS NOT NULL AND v_session.opened_at > now() - interval '2 hours') THEN
    RAISE EXCEPTION 'Quán đang tạm nghỉ hoặc ngoài giờ phục vụ';
END IF;
```

Cuối cùng `INSERT INTO orders (..., session_id) VALUES (..., v_session_id)` và
`UPDATE table_sessions SET last_activity_at = now()`.

**Vì sao đơn trả sau lưu `payment_method='cash'` thay vì thêm giá trị enum mới:**
`'cash'` trong hệ thống này vốn đã có nghĩa *"thanh toán với nhân viên khi ra về"* (đúng chữ trong
`mini-app/src/pages/checkout/index.tsx:549`) — tức là trả sau. Thêm `'postpay'` vào enum buộc phải
sửa 8 chỗ đang rẽ nhánh theo `payment_method` (constraint, `orderInKitchen`, `order-payment-badge`,
`get_daily_revenue`, `revenue.ts`, `kitchen_confirm_payment`, `confirm_manual_payment`,
`sweep_abandoned_orders`) trên một hệ đang chạy thật, đổi lại chỉ được cái tên đẹp hơn. Phương tiện
thật khách dùng lúc chốt bill ghi vào `payment_instrument` — cột đã có sẵn đúng cho việc này.
Nhãn hiển thị lấy theo `session_id` (§6.6), không lấy theo `payment_method`.

### 6.3 Nhân viên đặt hộ

**`staff_create_order`** thêm tham số `p_session_id uuid DEFAULT NULL` và logic:

- Quán **postpay**: tìm phiên mở của bàn; chưa có thì mở với `opened_by='staff'`,
  **host để NULL** (khách quét QR sau đó sẽ nhận quyền — §6.2c). Gắn `session_id`.
- Quán **prepay**: không đụng phiên. Giữ nguyên `payment_method in ('cash','bank_transfer')`.
- **Nhân viên không bao giờ bị khoá phiên chặn.** Họ đứng cạnh khách — đó là bằng chứng mạnh hơn
  bất kỳ token nào.

**Màn hình `/staff/order` — sau khi đặt xong (quán prepay):**

```
✅ Đã gửi vào bếp
Bàn 3 · #a1b2c3d4 · Tổng 245.000đ

[ 💵 Khách trả tiền mặt ]   [ 🏦 Khách chuyển khoản ]
```

- **Tiền mặt** → gọi `staff_confirm_payment(order_id, 'cash')` → xong.
- **Chuyển khoản** → hiện **VietQR** sinh tại chỗ: payload EMVCo với
  `amount = total_amount`, `addInfo = 'MEVO ' || left(order_id, 8)`, render bằng `qrcode`
  (**đã có trong `admin-web/package.json`**, dùng cho QR bàn). Bên dưới có nút **"Đã nhận tiền"**
  → `staff_confirm_payment(order_id, 'bank')`.

Ở quán **postpay** thì màn này không hiện hai nút đó, mà hiện *"Đã thêm vào bàn 3 — thu tiền khi
khách ra về."*

### 6.4 Chốt bill / mở khoá bàn — màn mới `/staff/tables`

Tab thứ ba trong `staff-nav.tsx`: **🪑 Bàn**. Hiện khi quán ở chế độ postpay **hoặc** khi quán còn
phiên đang mở — không gắn cứng vào `payment_timing`, nếu không thì chủ quán đổi về trả trước lúc
đang có bàn mở sẽ mất luôn màn hình duy nhất đóng được những bàn đó (rủi ro #6).

```
🪑 Bàn 3          mở lúc 19:20 · 3 đơn · 245.000đ
   • Phở gà đặc biệt ×2, Nước cam ×1        19:20  Xong
   • Bia Hà Nội ×4                          19:52  Đang làm
   [ Thu tiền & đóng bàn ]   [ ⋯ ]
```

**"Thu tiền & đóng bàn"** → bottom sheet chọn *Tiền mặt* / *Chuyển khoản (hiện VietQR tổng phiên)*
→ `close_table_session(session_id, 'paid', instrument)`:

- Tính tổng từ `orders` của phiên (`status <> 'cancelled'`), **không tin số client gửi**.
- Set `payment_received_at = now()`, `payment_received_via = 'staff'`,
  `payment_received_by = auth.uid()`, `payment_instrument = <chọn>` cho **mọi** đơn của phiên
  chưa có tiền.
- Đóng phiên: `status='closed'`, `close_reason='paid'`.
- Đơn đang `ready` sẽ tự thành `paid` nhờ trigger `trg_auto_complete_dine_in` (mig 031) — **không
  cần viết thêm gì**. Đơn còn `cooking` vẫn ở bếp và vẫn phải làm; UI cảnh báo trước khi đóng:
  *"Bàn còn 1 món đang làm. Vẫn thu tiền và đóng bàn?"*
- **Idempotent**: gọi lại trên phiên đã đóng trả `{ok:true, already:true}`, không ghi đè người
  xác nhận đầu tiên (giữ nếp `confirm_manual_payment`).

**Menu `⋯`** có hai mục nguy hiểm, đều hỏi lại một lần:

- **Chuyển quyền gọi món** → `release_table_session_host(session_id)`: xoá `host_*`, phiên vẫn mở.
  Dùng khi khách A hết pin / đưa máy cho người khác.
- **Bỏ bàn (không thu tiền)** → `close_table_session(session_id, 'staff_reset', null)`:
  đơn `pending`/`confirmed` **chưa có tiền** → `cancelled`; đơn đã `cooking`/`ready` → giữ nguyên
  và báo *"Còn N món đã vào bếp — vẫn nằm ở màn bếp, xử lý tay."* Dùng cho đơn ma (PB2).

### 6.5 Đơn nào vào bếp — sửa `orderInKitchen`

`admin-web/lib/kitchen-announce.ts`:

```ts
export type KitchenPredicateFields = {
  status: string
  orderSource: string
  paymentReceivedAt: string | null
  paymentMethod: string
  storePaymentTiming: 'prepay' | 'postpay'   // ← MỚI
}

export function orderInKitchen(o: KitchenPredicateFields): boolean {
  if (o.status !== 'pending' && o.status !== 'confirmed') return false
  if (o.orderSource === 'staff') return true          // nhân viên đứng cạnh khách
  if (o.paymentReceivedAt !== null) return true       // đã có tiền thật
  // Trả sau: đơn thu tại quán vào bếp ngay. Ở TRẢ TRƯỚC thì KHÔNG — đây là chỗ vá PB3.
  return o.storePaymentTiming === 'postpay' && o.paymentMethod === 'cash'
}
```

Kitchen display đã đọc bảng `stores` (`kitchen-display.tsx:291`) nên chỉ cần thêm cột vào
`select`. Cùng sửa cho `/staff/orders` và `/admin/orders` để ba màn không lệch nhau.

Nhờ backfill ở §5.1 (quán đang bật cash → `postpay`), **hành vi của Pubu không đổi một li nào**
sau khi migrate.

### 6.6 Nhãn thanh toán — `order-payment-badge.ts`

Thêm tham số `hasSession: boolean`:

```ts
if (received) return { label: '✓ Đã nhận tiền', tone: 'received' }
if (hasSession) return { label: '🪑 Trả sau · chưa thu', tone: 'pending' }
// ... phần còn lại giữ nguyên
```

Không để đơn trả sau đội lốt "💵 Tiền mặt · chưa thu" — nhân viên nhìn nhãn đó sẽ tưởng khách đã
chọn trả tiền mặt, trong khi khách chưa chọn gì cả.

### 6.7 Phiên hết hạn

Không dùng `pg_cron` — theo nếp lazy on-read đã có (`get_takeaway_orders`, `sweep_abandoned_orders`).
`get_table_session_state` và `list_open_table_sessions` gọi trước:

```sql
update table_sessions
   set status='closed', closed_at=now(), close_reason='expired'
 where store_id = <store> and status='open'
   and last_activity_at < now() - interval '6 hours';
```

6 giờ khớp cửa sổ "Món đã gọi" (`get_session_orders`) và TTL giỏ hàng — ba con số cùng một nhịp,
không đẻ thêm hằng số mới.

Đơn chưa thu tiền của phiên hết hạn **không tự huỷ** — chúng vẫn là công nợ có thật, chủ quán tự
xử ở `/admin/orders`.

### 6.8 Doanh thu

`get_daily_revenue` (mig 030) và `admin-web/lib/revenue.ts` — cột "chờ thu" hiện lọc theo
`payment_method in ('cash','bank_transfer')`, sẽ **bỏ sót** nếu sau này có đơn trả sau mang
phương thức khác. Sửa thành luật thuần trạng thái:

```sql
(payment_received_at is null and status not in ('paid','cancelled')) as cho_thu
```

Hai file phải sửa **cùng lúc và giống hệt nhau**, đúng ghi chú đã có trong mig 030 §7.

---

## 7. Hợp đồng RPC

| RPC | Role | Vào | Ra |
|---|---|---|---|
| `get_table_session_state(p_table_id, p_zalo_user_id, p_device_id)` | `anon` | | `{mode, state, session_id?, order_count?, total?, opened_at?}` |
| `create_order(..., p_device_id)` | `anon` | thêm tham số cuối | như cũ (`to_jsonb(order)`) |
| `staff_create_order(..., p_session_id)` | `authenticated` | thêm tham số cuối | như cũ |
| `staff_confirm_payment(p_order_id, p_instrument)` | `authenticated` | | `{ok, already}` |
| `list_open_table_sessions(p_store_id)` | `authenticated` | | mảng phiên + đơn + tổng |
| `close_table_session(p_session_id, p_reason, p_instrument)` | `authenticated` | | `{ok, already, orders_settled, orders_cancelled}` |
| `release_table_session_host(p_session_id)` | `authenticated` | | `{ok}` |

**Phân quyền:** mọi RPC `authenticated` ở trên chấp nhận `store_owner` **và** `store_staff` của
đúng quán (suy `store_id` từ `mevo_operators`, **không tin client**), theo nếp `staff_create_order`.
`staff_confirm_payment` là hàm mới lấp đúng khoảng trống hiện tại: hôm nay
`confirm_manual_payment` là **owner-only** (`is_store_owner_or_admin`) nên **nhân viên không có
cách nào xác nhận đã thu tiền** — chính là thứ chặn cả luồng 6.3 lẫn 6.4.

Tất cả đều `SECURITY DEFINER SET search_path = public`, `revoke all from public` rồi grant đúng role.

---

## 8. Thay đổi phía mini-app

| File | Thay đổi |
|---|---|
| `stores/app.store.ts` | Thêm `paymentTiming`, `sessionState`, `deviceId` |
| `app.tsx` | Đọc thêm `payment_timing`; sinh/đọc `mevo_device_id`; gọi `get_table_session_state` khi `postpay` + có bàn |
| `pages/menu/index.tsx` | Banner **"Bàn đang có khách khác"** khi `state='locked'` (khoá nút thêm món, vẫn xem menu); thanh phiên khi `state='owner'` |
| `pages/checkout/index.tsx` | Postpay: ẩn khối chọn phương thức, nút đổi thành **"Gọi món"**, bỏ bước mở SDK thanh toán, đặt xong đi thẳng `/order-status` |
| `pages/session-orders/index.tsx` | Hiện tổng phiên + nút **"Gọi thanh toán"** (`service_requests` type `payment`) |
| `services/order/order.api.ts` | Truyền `p_device_id`; thêm `getTableSessionState` |

**Giữ nguyên không đụng:** toàn bộ luồng `checkout-create-mac` / `checkout-notify` /
`waitForConfirmation` / banner "Thanh toán chưa thành công" của quyết định 2026-08-07. Ở postpay
chúng đơn giản là không chạy. Đây là chủ ý — không mở lại vùng code đã tốn nhiều vòng debug.

---

## 9. Rủi ro và cách chặn

| # | Rủi ro | Chặn bằng |
|---|---|---|
| 1 | **Hai máy cùng bấm đặt lần đầu → hai phiên một bàn** | `unique index ... where status='open'` + `INSERT ON CONFLICT DO NOTHING` + `SELECT FOR UPDATE` |
| 2 | **Bàn khoá vĩnh viễn** (khách trả tiền mặt nhưng nhân viên quên bấm) | Nút "Bỏ bàn" một chạm + tự hết hạn 6h |
| 3 | **Đơn ma khoá bàn từ xa** (PB2) | Nhân viên mở khoá; bếp vẫn nhìn thấy và huỷ được; cảnh báo tường minh trong admin |
| 4 | **Client cũ không gửi `p_device_id`** | Tham số có `DEFAULT NULL`; thiếu device id thì rơi về khớp Zalo UID. Zalo cache bản publish cũ là chuyện **đã xảy ra** (mig 037) → tham số mới phải luôn thêm ở cuối và có default |
| 5 | **Quán đang chạy bị đổi hành vi lúc migrate** | Backfill `payment_timing` suy từ `payment_methods` (§5.1) → Pubu giữ nguyên hành vi |
| 6 | **Chủ quán bật trả sau rồi đổi lại trả trước khi đang có phiên mở** | `create_order` ở prepay bỏ qua phiên; phiên cũ vẫn đóng được ở `/staff/tables` (màn hiện khi *có phiên mở* HOẶC *quán postpay*, không chỉ khi postpay) |
| 7 | **Nhân viên tự chốt bill khống để ăn tiền** | `payment_received_via='staff'` + `payment_received_by=auth.uid()` ghi lại **ai** chốt; chủ quán đối chiếu ở `/admin/orders`. Không chặn được bằng code, chỉ audit được |
| 8 | **Đóng phiên khi món còn đang nấu** | Cảnh báo trước khi đóng; đơn `cooking` giữ nguyên ở bếp |
| 9 | **`abandon_zalopay_to_cash` là cửa hậu của trả trước** — RPC này grant cho `anon`, đổi đơn `zalo_checkout` đang `pending` thành `cash`. Khách có `capability_token` (do `create_order` trả về) nên gọi thẳng Supabase là lách được prepay. Không UI nào còn gọi nó (`abandonToCash` ở `order.api.ts:47` là code chết) | Predicate mới đã chặn hậu quả (đơn cash ở quán prepay không vào bếp). Ngoài ra **thêm gate trong chính RPC**: từ chối khi `stores.payment_timing='prepay'`. Cân nhắc xoá hẳn RPC + code chết ở OF-5 |

---

## 10. Kế hoạch triển khai

| Giai đoạn | Nội dung | Phụ thuộc |
|---|---|---|
| **OF-1** | Migration 039: cột `stores`, bảng `table_sessions`, `orders.session_id`, nới `via='staff'`, `create_order` v10, `staff_create_order` v-mới, 5 RPC phiên, `get_daily_revenue` | — |
| **OF-2** | `/admin/settings`: mục "Cách vận hành quán" + tài khoản VietQR; `store.ts` action | OF-1 |
| **OF-3** | Mini-app: device id, `payment_timing`, trạng thái phiên, banner khoá, checkout postpay | OF-1 |
| **OF-4** | `/staff/tables` (chốt bill, mở khoá, chuyển quyền) + VietQR ở `/staff/order` + `staff_confirm_payment` | OF-1, OF-2 |
| **OF-5** | Bếp/báo cáo: `orderInKitchen`, `order-payment-badge`, `revenue.ts` + test đơn vị | OF-1 |

Thứ tự bắt buộc: **OF-1 → OF-5 → OF-2/3/4**. OF-5 phải đi ngay sau OF-1 vì nó là chỗ hành vi cũ và
mới giao nhau (PB3); để trễ thì có cửa sổ mà đơn cash không vào bếp.

---

## 11. Cố tình KHÔNG làm ở v1 (YAGNI)

| Thứ | Vì sao hoãn |
|---|---|
| **Khách tự thanh toán cả phiên qua Zalo Checkout** | Phải mở rộng `checkout-create-mac` ký MAC theo phiên thay vì theo đơn — đúng vùng code mong manh nhất. Giai đoạn 1 đã đủ thoả yêu cầu gốc (PB4). Data model **đã sẵn sàng**: chỉ cần ký MAC trên tổng phiên rồi để `checkout-notify` set tiền cho mọi đơn có `session_id` đó |
| **Nhiều máy cùng gọi vào một bill** | Trái yêu cầu gốc; mở sau bằng cách cho nhiều host trên một phiên (PB1) |
| **COD cho đơn ship** | Ship trả sau không có cách nào ràng buộc khách. Giữ trả trước |
| **Đối soát chuyển khoản tự động (SePay)** | VietQR tự sinh đã chèn được mã đơn nên **về sau làm được** — khác hẳn Zalo Checkout BANK (lý do bỏ PM-5). Nhưng v1 xác nhận tay: một quán, một người, đủ dùng |
| **Gộp/tách bill, chuyển bàn, ghép bàn** | Chưa quán nào hỏi |
| **Chủ quán tự sửa TTL phiên / thời gian ân hạn** | Hằng số 6h và 2h đặt trong code. Có quán phàn nàn thì mới đưa ra cấu hình |

---

## 12. Kế hoạch test (ghi vào `TESTING.md` khi làm)

**Nhóm A — Trả trước**

1. Quán prepay, khách QR chọn ZaloPay, trả xong → đơn vào bếp. ✅
2. Quán prepay, khách QR **không** trả tiền → đơn **không** vào bếp, sweep huỷ sau 30'. ✅
3. Quán prepay, gọi thẳng `create_order` với `p_payment_method='cash'` (giả lập client cũ) →
   **bị từ chối**. ← đây là bài test đóng lỗ hổng PB3.
3b. Quán prepay, tạo đơn ZaloPay rồi gọi thẳng `abandon_zalopay_to_cash` với capability token →
   **bị từ chối**, và kể cả nếu lọt thì đơn vẫn **không** vào bếp. ← rủi ro #9.
4. Nhân viên đặt hộ → vào bếp ngay → bấm "Khách chuyển khoản" → VietQR đúng số tiền và có mã đơn
   trong nội dung → "Đã nhận tiền" → doanh thu tăng đúng.

**Nhóm B — Trả sau, phiên bàn**

5. Máy A quét QR bàn 1, gọi món → phiên mở, đơn vào bếp ngay dù chưa trả tiền.
6. Máy A gọi thêm lần 2 → vào **cùng phiên**, không bị chặn.
7. Máy B quét QR bàn 1 → thấy banner khoá, **không** thêm được món.
8. Máy B gọi thẳng `create_order` bỏ qua UI → RPC **từ chối**. ← chốt chặn server.
9. Nhân viên "Thu tiền & đóng bàn" → mọi đơn có `payment_received_at`, `via='staff'`,
   `by` = uid nhân viên; phiên `closed`/`paid`.
10. Máy B quét lại → đặt được (phiên mới).
11. Máy A **xoá app** (mất device id) nhưng cùng Zalo → vẫn là chủ phiên. ← PB5.
12. Hai máy bấm đặt **cùng lúc** trên bàn trống → đúng **một** phiên ra đời, máy kia bị chặn.
13. Nhân viên "Chuyển quyền gọi món" → máy B quét QR → thành chủ phiên, gọi thêm được.
14. Nhân viên "Bỏ bàn (không thu tiền)" → đơn chưa nấu bị huỷ, đơn đang nấu còn nguyên ở bếp.
15. Quán hết giờ phục vụ, phiên mở trước đó 30' → **vẫn gọi thêm được**. ← PB6.
16. Phiên `last_activity_at` lùi 7 giờ → lần đọc kế tiếp tự đóng, bàn mở khoá.

**Nhóm C — Không phá cái đang chạy**

17. Sau migrate, Pubu (đang bật cash) → `payment_timing='postpay'`, đơn cash cũ **vẫn ở cột "Chờ
    xử lý"** của bếp, loa vẫn đọc. ← PB3 backfill.
18. Đơn mang về / ship: không đổi gì ở cả hai chế độ.
19. Luồng "Thanh toán lại khi thoát màn chọn PT" (2026-08-07) ở quán prepay: không đổi.
20. Vòng quay may mắn: chỉ đơn có `payment_received_at` mới quay được — đơn trả sau quay được
    **sau khi** nhân viên chốt bill.

---

## 13. Phụ lục — vì sao không chọn các phương án khác

**Phương án B: một phiên = một `orders` duy nhất, gọi thêm = thêm `order_items`.**
Hấp dẫn vì dùng lại được toàn bộ hạ tầng thanh toán (một đơn, một MAC, một tổng). Loại vì **phá
màn bếp**: bếp làm việc theo đơn — món đợt 1 xong rồi, đợt 2 mới vào, mà cả hai nằm trong một
`orders` thì ba cột "Chờ xử lý / Đang làm / Xong" hết nghĩa, và loa đọc đơn (v2.2) sẽ đọc lại cả
đơn mỗi lần thêm món. Phải đẻ thêm khái niệm "đợt" trong `order_items` — tức là vẫn dựng lại đúng
cái mà `orders` đang làm sẵn, chỉ thấp hơn một tầng.

**Phương án C: khoá bàn bằng cột `tables.locked_by` thay vì bảng phiên.**
Gọn hơn một bảng. Loại vì mất lịch sử: không trả lời được "bàn 3 tối qua mở lúc mấy giờ, ai chốt,
thu bao nhiêu", và không có chỗ treo `close_reason` để phân biệt *đã thu tiền* với *nhân viên bỏ
bàn* — mà đó chính là hai con số chủ quán cần nhìn để biết mình mất bao nhiêu vì đơn ma.

**Phương án D: suy trả trước/trả sau từ `payment_methods` như hiện nay, chỉ thêm phiên bàn.**
Không thêm cột nào. Loại vì để nguyên lỗ hổng PB3 (quán trả trước bật tiền mặt cho nhân viên vẫn
bị đơn QR tiền mặt lọt vào bếp) và vì chủ quán không có cách nào diễn đạt *"tôi nhận tiền mặt,
nhưng chỉ khi nhân viên thu"*.
