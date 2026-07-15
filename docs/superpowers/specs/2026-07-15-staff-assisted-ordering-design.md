# MEVO Staff Assisted Ordering — đặc tả thiết kế và triển khai

> **Ngày:** 2026-07-15 (rà soát lại đối chiếu code cùng ngày)  
> **Trạng thái:** Đã chốt nghiệp vụ, sẵn sàng triển khai  
> **Phạm vi:** Nhân viên đặt món hộ khách tại bàn; khách thanh toán tiền mặt hoặc chuyển khoản thủ công tại quầy sau khi ăn.  
> **Nguyên tắc:** Khách tự quét QR và order bằng Zalo Mini App vẫn là luồng mặc định.

> ### Đọc trước khi code — 2 điểm dễ sai nhất
>
> 1. **§5.1 — RLS hiện tại không phân biệt role.** Chỉ cần thêm dòng `role='store_staff'`
>    vào `mevo_operators` là nhân viên có ngay quyền ghi ngang owner (sửa giá, tự xác nhận
>    đã nhận tiền) qua Supabase REST. Migration 028 **phải** viết lại 8 policy ghi của `019`.
> 2. **§3.1 — `bank_manual` KHÔNG phải chuyển khoản qua Zalo.** Luồng chuyển khoản qua Zalo
>    (quyết định 2026-07-08) đã chạy thật và lưu `payment_method='zalopay'`. Hai thứ khác
>    nhau, luật doanh thu khác nhau.

## 1. Luồng nghiệp vụ

1. Nhân viên mời khách ngồi và hướng dẫn quét QR bàn để tự gọi món bằng MEVO.
2. Chỉ khi khách không biết thao tác, không có Zalo hoặc không thể tự order, nhân viên mới dùng điện thoại của mình đặt hộ.
3. Nhân viên đã biết bàn khách đang ngồi: chọn bàn, món, topping và ghi chú.
4. Hỏi khách dự kiến thanh toán bằng **tiền mặt** hay **chuyển khoản**, chọn phương thức rồi bấm **Đặt món**.
5. Đơn xuất hiện trên Kitchen Display ngay, không refresh.
6. Nhân viên báo khách thanh toán tại quầy sau; không thu tiền tại bàn.
7. Tại quầy: CASH thu đủ tiền; `bank_manual` chỉ xác nhận sau khi thấy tiền thực sự vào tài khoản quán.

Staff Assisted Ordering là luồng hỗ trợ ngoại lệ, không phải POS đầy đủ.

## 2. Mục tiêu

- Một đơn phổ biến hoàn thành trong 30–45 giây.
- Bấm đặt đến khi Kitchen thấy card: mục tiêu dưới 1 giây, chấp nhận tối đa 3 giây.
- Không thao tác vận hành nào yêu cầu refresh.
- CASH/`bank_manual` vào bếp ngay nhưng chưa tính doanh thu.
- Truy vết được người tạo đơn và người xác nhận nhận tiền.
- Không regression luồng khách tự order, ZaloPay, topping, voucher và giờ phục vụ.

## 3. Quyết định sản phẩm

Tạo khu vực mobile-first trong `admin-web`:

```text
/staff/order   — tạo đơn hộ
/staff/orders  — theo dõi đơn realtime
```

Không dùng Mini App khách làm giao diện staff vì nhân viên cần đăng nhập, phân quyền và audit riêng.

### 3.1 Phương thức thanh toán

| `payment_method` | Ý nghĩa | Vào bếp | Tính doanh thu |
|---|---|---|---|
| `zalopay` | Khách tự thanh toán qua Zalo Checkout SDK — **gồm cả chuyển khoản ngân hàng qua Zalo** (`method=BANK`) | Sau callback/notify thành công | Có `zalopay_trans_id`, không cancelled |
| `cash` | Tiền mặt trả sau tại quầy | Ngay khi staff tạo | Quầy xác nhận đã nhận tiền |
| `bank_manual` | Chuyển khoản thủ công tại quầy, **không qua Zalo** | Ngay khi staff tạo | Quầy kiểm tra và xác nhận đã nhận tiền |

#### ⚠️ `bank_manual` KHÁC chuyển khoản qua Zalo — đừng nhầm hai thứ

Quyết định 2026-07-08 đã có luồng **chuyển khoản ngân hàng qua Zalo Checkout SDK** (`method=BANK`) và
đang là phương thức chính. Luồng đó **lưu `payment_method='zalopay'`** kèm
`zalopay_trans_id='BANK:<zaloOrderId>'` (xem `supabase/functions/checkout-notify/index.ts`).

Vì vậy tên `bank` trần bị loại — hai thứ khác hẳn nhau sẽ cùng tên:

| | Chuyển khoản qua Zalo (đã có) | `bank_manual` (spec này) |
|---|---|---|
| `payment_method` | `zalopay` | `bank_manual` |
| Có notify/MAC? | Có | Không |
| `zalopay_trans_id` | `BANK:<zaloOrderId>` | `null` |
| Tính doanh thu khi | có `zalopay_trans_id` | có `payment_received_at` |
| Ai tạo đơn | Khách tự order | Staff đặt hộ |

**Luồng chuyển khoản qua Zalo giữ nguyên `payment_method='zalopay'`, spec này KHÔNG đụng tới.**
Badge ở §8.2 chỉ áp cho `cash`/`bank_manual`; đơn BANK-qua-Zalo không mang badge "chưa nhận"
vì tiền đã được Zalo xác nhận.

`bank_manual` không được giả làm `zalopay`: không callback và không có `zalopay_trans_id`.

Màn hình đặt hộ không có nút “Đã thu tiền”. Sau thành công chỉ hiện mã đơn, bàn, tổng tiền và “Khách thanh toán tại quầy sau”.

Đơn staff không dùng voucher sở hữu theo `zalo_user_id`, vì không có danh tính Zalo của khách để chứng minh quyền sử dụng.

## 4. Dữ liệu và migration

Migration dự kiến:

```text
supabase/migrations/028_staff_assisted_ordering.sql
```

Trước khi code phải kiểm tra số migration mới nhất để tránh trùng.
*(Đã kiểm tra 2026-07-15: mới nhất là `027_vouchers.sql` → `028` còn trống.)*

### 4.1 Mở payment method

Mở constraint `orders.payment_method`, `stores.payment_methods` và TypeScript union thành:

```text
zalopay | cash | bank_manual
```

Chi tiết phải làm — cả ba đều là constraint/union **có tên sẵn**, phải drop rồi tạo lại:

| Nơi | Hiện tại | Ghi chú |
|---|---|---|
| `orders.payment_method` CHECK | `001_init.sql:76` — `('zalopay','cash')` | constraint inline, phải tìm đúng tên sinh tự động |
| `stores.payment_methods` CHECK | `008` — `stores_payment_methods_valid`, `<@ ARRAY['zalopay','cash']` | drop/recreate theo tên |
| TS union `PaymentMethod` | `admin-web/types/database.types.ts:3` **và** `mini-app/src/types/database.types.ts:100` | union bị lặp ở **2 file**, sửa cả hai |

#### ⚠️ `stores.payment_methods` đang điều khiển UI mini-app khách

Cột này là nguồn dữ liệu cho danh sách phương thức mà **khách** thấy trong mini-app. Nếu bật
`bank_manual` cho quán mà không chặn gì, mini-app sẽ hiện luôn nút "chuyển khoản thủ công"
cho khách tự order — sai hoàn toàn, vì `bank_manual` chỉ dành cho staff đặt hộ tại quầy.

Quy tắc: `bank_manual` là **staff-only method**. Mini-app phải lọc bỏ nó khỏi danh sách
phương thức hiển thị cho khách (whitelist `['zalopay','cash']` phía mini-app, không phải
blacklist), và `create_order` (RPC khách) tiếp tục **chỉ nhận `zalopay`/`cash`** — chỉ
`staff_create_order` mới nhận `bank_manual`. Xem thêm §6.1 bước 5.

### 4.2 Audit đơn và thanh toán

```sql
alter table orders
  add column order_source text not null default 'customer_zalo',
  add column created_by uuid null references auth.users(id),
  add column payment_received_at timestamptz null,
  add column payment_received_by uuid null references auth.users(id),
  add column client_request_id uuid null;

alter table orders
  add constraint orders_order_source_check
  check (order_source in ('customer_zalo', 'staff'));

create unique index orders_store_client_request_unique
  on orders(store_id, client_request_id)
  where client_request_id is not null;
```

Quy tắc:

- Đơn khách: `order_source='customer_zalo'`, `created_by=null`.
- Đơn staff: server tự gán `order_source='staff'`, `created_by=auth.uid()`.
- CASH/`bank_manual` đã thanh toán khi `payment_received_at is not null`.
- Client không được tự gán nguồn, người tạo/nhận tiền hoặc thời gian nhận tiền.
  **Không đủ nếu chỉ chặn ở RPC** — RLS phải chặn UPDATE trực tiếp, xem §5.1.

### 4.3 Không dùng `status='paid'` cho đơn mới

`orders.status` giữ nguyên enum hiện có (`001_init.sql:70`) — **không thu hẹp**, vì
`confirmed` là cửa vào bếp của ZaloPay (§8.1) và `paid` còn dữ liệu legacy:

```text
Đơn staff (cash / bank_manual) — vào bếp ngay từ pending:
  pending ─────────────────────────► cooking ──► ready

Đơn khách (zalopay, gồm BANK-qua-Zalo) — vào bếp sau khi có tiền:
  pending ──[notify OK]──► confirmed ─► cooking ──► ready

cancelled: đi được từ bất kỳ trạng thái nào ở trên.
paid:      chỉ còn cho dữ liệu legacy — code mới KHÔNG ghi.
```

- Đơn ZaloPay: `pending` → (notify) → `confirmed` → `cooking` → `ready`.
- Đơn staff CASH/`bank_manual`: `pending` → `cooking` → `ready` (vào bếp ngay từ `pending`, §8.1).

Thanh toán độc lập bằng `payment_received_at`. Một đơn có thể `ready` nhưng chưa thanh toán, hoặc `cooking` nhưng đã thanh toán. Code mới không đổi CASH/`bank_manual` thành `paid`; dữ liệu legacy `cash + paid` vẫn được đọc tương thích.

### 4.4 Doanh thu thực nhận

```text
ZaloPay (gồm BANK-qua-Zalo): zalopay_trans_id != null và không cancelled
CASH/bank_manual:            payment_received_at != null và không cancelled
Legacy CASH:                 payment_method='cash' và status='paid'
```

#### Luật này đang bị lặp ở 3 nơi — phải sửa đồng bộ cả 3

Nếu chỉ sửa RPC, dashboard sẽ hiển thị số khác báo cáo:

| Nơi | Hiện tại | Phải đổi |
|---|---|---|
| `get_daily_revenue()` — `014_cashless_default_revenue.sql` | hardcode `cash AND status='paid'` | thêm nhánh `payment_received_at`, thêm `bank_manual` |
| `get_daily_revenue().cash_pending` — cùng file | `cash AND status NOT IN ('paid','cancelled')` | đổi sang `payment_received_at is null`, gồm cả `bank_manual` (nên đổi tên → `manual_pending`) |
| `admin-web/app/admin/orders/page.tsx:65` | **tính lại doanh thu bằng TypeScript** | dùng chung luật |
| `admin-web/app/admin/dashboard/page.tsx` | đọc `zalopay_trans_id`, tính phía client | dùng chung luật |

Nên tách một helper TS dùng chung (kiểu `admin-web/lib/kitchen-announce.ts` đã làm với
predicate vào bếp) để `orders/page.tsx` và `dashboard/page.tsx` không lệch nhau theo thời gian.

Ngoài ra `admin-web/lib/actions/orders.ts:11` đang `update({ status: 'paid' })` — đúng thứ
§4.3 cấm. Action này phải thay bằng `confirm_manual_payment` (§6.2).

## 5. Auth và phân quyền

Mở `mevo_operators.role`:

```text
mevo_superadmin | store_owner | store_staff
```

- `mevo_superadmin`: `store_id is null`.
- `store_owner`, `store_staff`: `store_id is not null`.

Phải nới cả constraint `mevo_operators_role_check` **và** `mevo_operators_role_store_check`
(`018_operator_role.sql`) — constraint thứ hai đang liệt kê role tường minh nên sẽ chặn
`store_staff` nếu quên.

Staff được đọc quán tối thiểu, bàn active, menu/topping đang bán và đơn đúng quán; được tạo CASH/`bank_manual` và theo dõi realtime.

Staff không được vào `/admin` hoặc `/mevo`, sửa menu/giá/cấu hình, tạo ZaloPay, tự gửi có hiệu lực store/tổng/giá/created_by, hoặc xác nhận nhận tiền.

### 5.1 ⚠️ CHẶN TRƯỚC: RLS hiện tại không phân biệt role — thêm `store_staff` = cấp quyền owner

**Đây là việc bắt buộc của SA-1, không phải chi tiết triển khai bỏ qua được.**

`is_store_scoped_operator()` (`019_store_scoped_rls.sql:6`) chỉ kiểm tra *có phải operator của
quán này không* — nó **không đọc cột `role`**:

```sql
-- 019, hiện tại: role chỉ dùng để nhận diện superadmin, KHÔNG phân quyền
and (role = 'mevo_superadmin' or store_id = target_store_id)
```

Helper này đang gác **8 policy GHI** trong `019`: INSERT/UPDATE/DELETE trên `tables`,
INSERT trên `menu_categories`, INSERT/UPDATE/DELETE trên `menu_items`, và
UPDATE trên `orders` (`auth_update_orders`).

Hệ quả: **ngay khi 028 chèn dòng `role='store_staff'`**, nhân viên đó gọi thẳng Supabase REST
(không qua `admin-web`) sẽ:

- sửa giá món, xoá bàn, sửa menu — trái §5;
- **tự UPDATE `orders`, gồm tự set `payment_received_at`/`payment_received_by` cho chính mình**
  — phá thẳng §6.2 "chỉ owner xác nhận tiền" và toàn bộ audit trail của §4.2.

Không có guard nào chặn hộ: guard cột hiện có (`kitchen_set_status`, không GRANT UPDATE)
chỉ áp cho role Postgres `kitchen` (`007a_kitchen_isolation.sql:22`), **không** áp cho
`authenticated`.

**028 phải làm:**

1. Giữ `is_store_scoped_operator(store_id)` cho **SELECT** (staff cần đọc).
2. Thêm helper mới có check role cho **GHI**:

```sql
create or replace function is_store_owner_or_admin(target_store_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from mevo_operators
    where user_id = auth.uid()
      and (
        role = 'mevo_superadmin'
        or (role = 'store_owner' and store_id = target_store_id)
      )
  );
$$;
```

3. **Viết lại 8 policy ghi** của `019` sang `is_store_owner_or_admin()`.
   Đặc biệt `auth_update_orders` — nếu bỏ sót policy này thì mọi thứ còn lại vô nghĩa.
4. Không cấp INSERT `orders` cho `authenticated`; đơn staff chỉ sinh qua `staff_create_order`.

Kiểm chứng sau khi chạy: đăng nhập bằng tài khoản `store_staff`, gọi REST
`PATCH /orders?id=eq.<id>` với `{"payment_received_at":"..."}` → phải bị từ chối.

Bản đầu chỉ `store_owner` xác nhận tiền. Nếu pilot cần thu ngân riêng thì thêm `store_cashier`/capability sau; không cấp quyền này cho mọi nhân viên phục vụ.

Điều hướng:

- superadmin → `/mevo`.
- owner → `/admin`, được mở `/staff` để test/hỗ trợ.
- staff → `/staff/order`.
- không có operator row → từ chối.

## 6. RPC server-side

### 6.1 `staff_create_order`

```text
staff_create_order(
  p_table_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_client_request_id uuid,
  p_note text default null
)
```

Trong một transaction:

1. Lấy `auth.uid()` và operator; chỉ nhận staff/owner.
2. Suy ra `store_id` từ operator, không tin store từ client.
3. Kiểm tra quán active, công tắc nhận đơn và serving hours.
4. Kiểm tra bàn active thuộc đúng quán.
5. Chỉ nhận `cash` hoặc `bank_manual` — **không nhận `zalopay`** (staff không thu hộ ZaloPay).
   Ngược lại, `create_order` (RPC khách) **không được nhận `bank_manual`**: whitelist hai
   RPC là rời nhau, đừng dùng chung một danh sách.
6. Kiểm tra món/topping đang bán và thuộc đúng quán.
7. Tính giá từ DB; không tin giá/tổng từ client.
8. Snapshot tên, giá và topping.
9. Insert order + items; gán source/user server-side.
10. Trả order + items để UI hiển thị ngay.

RPC idempotent theo `(store_id, client_request_id)`: retry cùng ID trả đơn đã có, không tạo trùng.

**Phải bắt `unique_violation`, không được check-then-insert.** Double-tap sinh hai request
gần như đồng thời: cả hai cùng `select` thấy chưa có đơn, cùng `insert`, một cái vỡ unique
index. Nếu RPC chỉ kiểm tra trước khi insert thì nhân viên nhận lỗi đỏ dù đơn đã vào bếp —
đúng ca test §11 mục 9. Cấu trúc đúng:

```sql
insert into orders (...) values (...)
on conflict (store_id, client_request_id) where client_request_id is not null
do nothing
returning id into v_order_id;

if v_order_id is null then          -- request khác đã thắng race
  select id into v_order_id from orders
  where store_id = v_store_id and client_request_id = p_client_request_id;
  -- trả đơn đã có + items, KHÔNG insert items lần hai
  return ...;
end if;
```

Không gọi RPC anon rồi UPDATE audit sau, vì có thể tạo dữ liệu nửa vời. Logic phải bám `create_order` mới nhất trong `027_vouchers.sql`; ưu tiên tách phần tính/validate dùng chung để hai RPC không lệch theo thời gian.

### 6.2 `confirm_manual_payment`

```text
confirm_manual_payment(p_order_id uuid)
```

- Chỉ owner đúng store (`is_store_owner_or_admin()`, §5.1) — staff gọi phải bị từ chối.
- Chỉ CASH/`bank_manual`, không cancelled. Đơn `zalopay` (gồm BANK-qua-Zalo) bị từ chối:
  tiền đã do Zalo xác nhận, không xác nhận tay.
- Gán `payment_received_at=now()`, `payment_received_by=auth.uid()`.
- Idempotent, không ghi đè người xác nhận đầu tiên.
- Không thay đổi `orders.status`.

### 6.3 RLS

- Staff SELECT đúng `store_id` (giữ `is_store_scoped_operator()`).
- Không GRANT trực tiếp INSERT/UPDATE orders cho staff — **hiện tại `auth_update_orders`
  đang GRANT; phải viết lại policy này, xem §5.1**. Đây không phải trạng thái sẵn có.
- Mọi ghi đi qua RPC kiểm tra role/store; policy ghi dùng `is_store_owner_or_admin()`.
- Test trực tiếp Supabase REST **hai chiều**:
  - staff quán A đọc/sửa quán B → từ chối (cross-store);
  - staff quán A sửa `orders`/`menu_items` của **chính quán A** → từ chối (cross-role).

## 7. UX đặt hộ tốc độ cao

- Preload/cache bàn, menu, topping sau login.
- Header: quán, nhân viên, trạng thái kết nối.
- Grid bàn bằng nút lớn; chỉ bàn active.
- Tìm món luôn sẵn, tabs danh mục ngang.
- Chạm món tăng nhanh; bottom sheet cho topping/ghi chú.
- Sticky cart hiển thị số món và tổng tạm tính.
- Checkout xác nhận lại bàn, có hai nút lớn CASH/`bank_manual`; không ZaloPay/voucher.
- Disable khi đang gửi; lỗi mạng giữ nguyên bàn/giỏ.
- Success dùng response RPC, không query lại mới hiển thị.
- Chỉ reset giỏ sau khi server xác nhận thành công.
- Target chạm tối thiểu khoảng 44 px, thao tác một tay.

## 8. Realtime — không refresh

### 8.1 Kitchen

Đơn vào bếp khi:

```text
status = confirmed
OR
(status = pending AND payment_method IN (cash, bank_manual))
```

Helper `admin-web/lib/kitchen-announce.ts:10` hiện là
`status === 'confirmed' || (status === 'pending' && paymentMethod === 'cash')`
— phải mở cho `bank_manual`.

Lưu ý `confirmed` vẫn cần thiết: đó là cửa vào bếp của ZaloPay **và** của chuyển khoản
qua Zalo (`checkout-notify` UPDATE → `confirmed`). Không được bỏ khỏi predicate.

Cột "Chờ xử lý" ở admin và predicate này phải dùng **chung một helper** (quyết định
2026-07-06) — sửa một chỗ, đừng chép logic.

Kitchen subscribe INSERT/UPDATE theo store. Khi INSERT, fetch items và render card. RPC transaction bảo đảm order/items commit cùng nhau; client có retry ngắn nếu items tạm rỗng. Dedupe theo order ID để chuông/TTS chỉ phát một lần.

### 8.2 Staff và quầy

- `/staff/orders` subscribe INSERT/UPDATE theo store và merge vào cache.
- Trạng thái cooking/ready/cancelled đổi ngay.
- Trang admin orders hiện dùng Server Component + `revalidatePath`; tách danh sách vận hành sang Client Component hoặc SWR/React Query + Supabase Realtime.
- INSERT thêm đơn; UPDATE merge trạng thái/thanh toán.
- Xác nhận tiền optimistic update rồi reconcile.
- Reconnect tự refetch một lần, không bắt refresh.

Badge:

- `Tiền mặt — chưa thu`.
- `Chuyển khoản — chưa nhận`.
- `Đã nhận tiền`.

## 9. Nghiệp vụ quầy

CASH: tìm đơn → thu đủ tiền → modal xác nhận bàn/mã/số tiền → gọi RPC.

BANK: hiển thị QR/tài khoản quán nếu có → khách chuyển → thu ngân kiểm tra tài khoản nhận tiền → chỉ xác nhận khi thấy tiền vào. Không coi ảnh chụp hoặc lời báo “đã chuyển” là bằng chứng.

Vòng quay/voucher:

- CASH/`bank_manual` chỉ có “tiền thật” sau `payment_received_at`.
- Đơn staff không có Zalo UID nên không sinh voucher gắn UID.

## 10. Kế hoạch triển khai

> Sau mỗi Sprint: dừng, đọc checklist tương ứng trong `TESTING.md`, báo anh Tú test và chờ **PASS**. Không tự chuyển Sprint.

### Sprint SA-1 — Database, `bank_manual`, role và RPC

- Migration `bank_manual` (3 nơi: CHECK orders, `stores_payment_methods_valid`, 2 file TS union).
- Audit columns + `client_request_id` + unique index.
- Nới `mevo_operators_role_check` **và** `mevo_operators_role_store_check` cho `store_staff`.
- **Helper `is_store_owner_or_admin()` + viết lại 8 policy ghi của `019` (§5.1)** — việc lớn
  nhất của sprint này, làm trước khi có bất kỳ dòng `store_staff` nào trong DB.
- Hai RPC (`staff_create_order` idempotent bằng `on conflict`, `confirm_manual_payment`).
- Doanh thu: `get_daily_revenue()` + `cash_pending`, và 2 chỗ tính lại phía TS (§4.4).
- Test cross-store **và cross-role** qua REST, giả giá/bàn/store/user, idempotency, doanh thu.
- Regression create_order, topping, serving hours, voucher, ZaloPay, **chuyển khoản qua Zalo**.

**Điểm dừng:** SA-1 PASS.

### Sprint SA-2 — Auth và tài khoản staff

- Proxy/auth nhận `store_staff`, điều hướng theo role.
- Owner tạo/vô hiệu hóa nhân viên đúng quán.
- Staff chỉ vào `/staff`; owner được vào `/staff` để hỗ trợ.
- Không dùng chung tài khoản owner.

**Điểm dừng:** SA-2 PASS.

### Sprint SA-3 — UI mobile-first

- Chọn bàn, món, topping, số lượng, ghi chú.
- CASH/`bank_manual` checkout, sticky cart, loading/error/retry.
- Double-submit guard + request ID.
- Success state báo thanh toán tại quầy sau.
- Test Android/iPhone thật, mục tiêu 30–45 giây/đơn.

**Điểm dừng:** SA-3 PASS.

### Sprint SA-4 — Realtime ba màn hình

- Kitchen nhận CASH/`bank_manual` live.
- Staff live trạng thái.
- Quầy/admin live order/payment.
- Dedupe chuông/TTS, reconnect/refetch, retry items.
- Test đồng thời staff phone, kitchen tablet, quầy PC/phone; latency tối đa 3 giây.

**Điểm dừng:** SA-4 PASS.

### Sprint SA-5 — Thu tiền và báo cáo

- UI xác nhận CASH/`bank_manual`, audit người/thời gian.
- Chưa thu, filter phương thức, doanh thu thực nhận.
- Badge live và regression vòng quay/voucher.

**Điểm dừng:** SA-5 PASS.

## 11. Checklist nghiệm thu end-to-end

1. Staff đăng nhập và thấy đúng quán.
2. Chọn Bàn 5, món/topping, CASH; Kitchen thấy ngay không refresh.
3. Lặp lại `bank_manual`; Kitchen xử lý giống CASH, badge đúng.
4. Đơn chưa thanh toán không vào doanh thu — kiểm ở **cả** dashboard và trang Đơn hàng
   (hai chỗ tính riêng, §4.4), số phải khớp nhau.
5. Owner xác nhận tại quầy; mọi màn hình mở cập nhật live.
6. `orders.status` vẫn giữ tiến độ bếp sau nhận tiền.
7. Staff quán A không đọc/tạo đơn quán B qua UI/REST *(cross-store)*.
8. **Staff quán A không sửa được `orders`/`menu_items`/`tables` của chính quán A qua REST**
   *(cross-role — ca này chặn bởi §5.1; không có nó, staff tự xác nhận tiền được)*.
9. **Staff gọi thẳng `confirm_manual_payment` qua REST → bị từ chối.**
10. Payload sửa giá/tổng/store/created_by không có tác dụng.
11. Double tap/retry không tạo trùng, **và không trả lỗi đỏ** dù đơn đã vào bếp (§6.1).
12. Mất mạng không mất giỏ; reconnect không phát chuông trùng.
13. Khách tự order + ZaloPay callback vẫn chạy.
14. **Khách tự order + chuyển khoản qua Zalo (`method=BANK`) vẫn chạy**, đơn vẫn
    `payment_method='zalopay'` + `zalopay_trans_id='BANK:...'`, vẫn vào doanh thu,
    **không** mang badge "chưa nhận".
15. **Mini-app khách không hiện phương thức `bank_manual`** kể cả khi quán đã bật (§4.1).
16. Topping, serving hours và voucher không regression.

## 12. Ngoài phạm vi

- Thu tiền tại bàn.
- Ca/chấm công/két tiền.
- Gộp/tách hóa đơn, chuyển bàn, hoàn tiền.
- Đối soát bank-to-bank tự động bằng API ngân hàng.
- Xây POS đầy đủ.

## 13. File dự kiến ảnh hưởng

```text
supabase/migrations/028_staff_assisted_ordering.sql
  ├─ payment_method CHECK (orders) + stores_payment_methods_valid
  ├─ audit columns + client_request_id + unique index
  ├─ mevo_operators: role_check + role_store_check
  ├─ is_store_owner_or_admin() + VIẾT LẠI 8 policy ghi của 019   ← §5.1
  ├─ staff_create_order() + confirm_manual_payment()
  └─ get_daily_revenue() (revenue + cash_pending)                ← §4.4

admin-web/proxy.ts
admin-web/lib/auth/operator.ts
admin-web/lib/actions/orders.ts            ← :11 đang set status='paid', phải bỏ
admin-web/lib/kitchen-announce.ts          ← :10 mở cho bank_manual
admin-web/lib/revenue.ts (mới)             ← helper doanh thu dùng chung, §4.4
admin-web/types/database.types.ts          ← :3 PaymentMethod union
admin-web/app/staff/layout.tsx
admin-web/app/staff/order/page.tsx
admin-web/app/staff/orders/page.tsx
admin-web/app/admin/orders/*               ← :65 tính lại doanh thu bằng TS
admin-web/app/admin/dashboard/page.tsx     ← cũng tính lại doanh thu
admin-web/app/kitchen/[storeSlug]/kitchen-display.tsx
mini-app/src/stores/app.store.ts
mini-app/src/types/database.types.ts       ← :100 union thứ hai
TESTING.md
AGENTS.md
PRD.md
```

Không đụng tới: `supabase/functions/checkout-notify/index.ts`, `checkout-create-mac`,
`zalopay-callback` — luồng chuyển khoản qua Zalo giữ nguyên (§3.1).
