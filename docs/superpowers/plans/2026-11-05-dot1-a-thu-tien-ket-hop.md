# Đợt 2 — Thu tiền kết hợp (Mục A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thu một bill bằng tiền mặt, chuyển khoản, hoặc kết hợp cả hai, và ghi mỗi lần thu thành một bản ghi thật để báo cáo và ca đọc chung một nguồn.

**Architecture:** Thêm hai bảng `bill_payments` + `bill_payment_lines`. Lõi `close_table_session` được nhân sang hàm nội bộ `close_table_session_core`; RPC mới `collect_table_bill` gọi lõi cho từng phiên rồi so tổng ở cấp cả nhóm, lệch thì RAISE và cả giao dịch huỷ. Mig 112a chỉ thêm, đường thu cũ vẫn chạy; mig 112b khoá đường cũ, áp SAU khi Vercel lên code mới.

**Tech Stack:** PostgreSQL (Supabase), plpgsql, Next.js 16, TypeScript, Vitest, `node --test` + PGlite.

**Spec:** [docs/superpowers/specs/2026-11-05-dot1-thanh-toan-ca-in-vietqr-design.md](../specs/2026-11-05-dot1-thanh-toan-ca-in-vietqr-design.md) §3, §7, §8, §9

## Global Constraints

- Làm trên worktree riêng cắt từ `main`, sau khi Đợt 1 đã merge. `103b` phải có trên `main`; mig 111 phải đã áp prod.
- Không có công tắc cho Mục A. Không chọn Kết hợp thì thu như cũ, báo cáo ra cùng số.
- `payment_received_at` vẫn là cờ "đã thu" duy nhất. Không thêm cờ thứ hai.
- Tiền là số nguyên VNĐ. `bill_payment_lines.amount` của tiền mặt là số **ròng** sau khi thối.
- Server tự tính số phải thu. Tiền ở TS phải khớp SQL; `billTotals()` là bản tham chiếu.
- Vá hàm sống: `pg_get_functiondef` + `replace`, helper RAISE khi chuỗi neo không khớp đúng 1 lần. Neo lấy từ prod, không từ `supabase/tests/prod-defs/108|110`.
- `get_sessions_bill` trên prod lẫn CRLF: neo của hàm này phải nằm gọn một dòng.
- Hàm nội bộ mới: `REVOKE ALL ... FROM PUBLIC, anon, authenticated`. Bảng mới: bật RLS, `REVOKE ALL ... FROM anon, authenticated`, chỉ `GRANT SELECT` cho authenticated.
- Server action có lỗi người dùng trả `{ok, error}`, không ném. Thu tiền dùng `createClient()` (cần `auth.uid()` cho audit), không dùng service role.
- Không `window.confirm` ở chỗ đang sửa; dùng `ConfirmDialog` (`admin-web/app/admin/pos/confirm-dialog.tsx`).
- Next.js 16 có thay đổi phá vỡ: đọc `admin-web/node_modules/next/dist/docs` trước khi viết route.
- UI tiếng Việt, comment tiếng Việt cho logic khó, commit `feat:` / `fix:` / `chore:`.
- Plan không tự áp prod. Các bước prod nằm ở mục **Controller** cuối file, do một người làm.

**Tên cố định, không đổi** (Plan B, D dựa vào):
`bill_payments`, `bill_payment_lines`, `orders.bill_payment_id`, `table_sessions.bill_payment_id`, `collect_table_bill(uuid[], jsonb, integer, uuid)`, `collectTableBill`, `bill_payments.cash_shift_id`.

## Review Focus

1. Bill đổi trong lúc thu ngân đang ở màn Thanh toán (khách gọi thêm, máy khác bỏ món): ô Kết hợp cũ phải khoá nút, server phải từ chối và không ghi gì. Test ở Task 1 (`lệch một đồng`) và Task 5 (`tổng đổi`).
2. Mạng đứt sau khi server đã thu xong, thu ngân bấm lại: không được có khoản thứ hai. Test ở Task 1 (`gọi lại cùng mã`).
3. Bill 0đ (tặng hết món): vẫn thu và đóng được, `lines` rỗng. Test ở Task 1 (`bill 0đ`) và Task 5.
4. Gộp bill mà một mâm vừa được máy khác thu: không thu nửa nhóm. Test ở Task 1 (`hai máy`).
5. Phiên vừa tự hết hạn trong lúc POS đang vẽ số sau giảm: server bỏ qua giảm giá nên số lệch, phải từ chối chứ không thu thiếu. Test ở Task 1 (`phiên hết hạn`).

---

## Sơ đồ file

| File | Việc |
|---|---|
| `supabase/migrations/112a_collect_table_bill.sql` | Mới. Bảng, lõi, RPC, vá 4 hàm đọc/ghi |
| `supabase/migrations/112b_lock_old_paid_path.sql` | Mới. Khoá đường cũ |
| `supabase/tests/prod-defs/112/*.sql` | Mới. Bản chụp prod sau mig 111 |
| `supabase/tests/helpers/collect-bill-db.mjs` | Mới. Dựng DB PGlite chung cho 3 file test |
| `supabase/tests/112a_collect_table_bill.test.mjs` | Mới |
| `supabase/tests/112a_single_order_payment.test.mjs` | Mới |
| `supabase/tests/112a_payment_readers.test.mjs` | Mới |
| `supabase/tests/112b_lock_old_paid_path.test.mjs` | Mới |
| `admin-web/lib/collect-payment.ts` (+ `.test.ts`) | Mới. Logic thuần: chia khoản, dòng hiển thị |
| `admin-web/lib/cash-change.ts` | Thêm mốc 10.000 |
| `admin-web/lib/actions/table-session.ts` | Thêm `collectTableBill`; thu hẹp `closeTableSession`; bỏ bulk |
| `admin-web/app/admin/pos/payment-method-fields.tsx` (+ test) | Mới. Ba lựa chọn và các ô tiền |
| `admin-web/app/admin/pos/bill-panel.tsx`, `pos-client.tsx` | Nối màn Thanh toán |
| `admin-web/app/staff/tables/tables-client.tsx`, `admin-web/app/admin/bills/bill-drawer.tsx`, `admin-web/lib/actions/bill-detail.ts` | Thu một phương tiện qua RPC mới |
| `admin-web/lib/bills-report.ts`, `bills-report-xlsx.ts`, `daily-report.ts`, `app/print/bill/print-bill.tsx` | Hiển thị từng khoản |
| `docs/testing/chuyen-ban-giam-gia/sql/gg-verify.sql`, `gg2-verify.sql` | Đổi sang RPC mới |
| `docs/testing/dot1/thu-tien-ket-hop.md`, `CLAUDE.md` | Checklist, quyết định |

---

### Task 1: Bảng, lõi và RPC `collect_table_bill`

**Files:**
- Create: `supabase/tests/prod-defs/112/` (9 file, xem Step 2)
- Create: `supabase/tests/helpers/collect-bill-db.mjs`
- Create: `supabase/migrations/112a_collect_table_bill.sql`
- Test: `supabase/tests/112a_collect_table_bill.test.mjs`

**Interfaces:**
- Produces: bảng và cột ở Step 5; `close_table_session_core(p_session_id uuid, p_reason text, p_instrument text, p_payment_id uuid) RETURNS jsonb` (nội bộ); `collect_table_bill(p_session_ids uuid[], p_lines jsonb, p_cash_given int, p_client_request_id uuid) RETURNS jsonb` trả `{ok, already, payment_id, total, orders_settled}`.
- Produces cho mig 113: `collect_table_bill` có một câu `INSERT INTO public.bill_payments (...) VALUES (...)` với cột `cash_shift_id` giá trị chữ `NULL`, đứng SAU mọi nhánh trả `already`. Plan B neo vào nguyên câu này.
- Produces: helper test `openCollectDb({ lock })` trả `{ db, ids, reset, login, session, order, collect, rid, one, count }`:
  - `reset()`: xoá sạch dữ liệu đơn, phiên, khoản thu. Mọi file test gọi trong `beforeEach`, vì các ca so số đếm tuyệt đối.
  - `session({ discount: [type, value], expired, closeReason })` trả id phiên; `expired` là `status='closed'`, `close_reason='expired'`.
  - `order(sessionId | null, amount, { status = 'confirmed', method = 'cash', instrument, paid })` trả id đơn.
  - `collect(sessionIds, lines, cashGiven, requestId, uid = ids.cashier)` gọi RPC dưới role `authenticated` rồi trả JSON.
  - `one(sql, params)` trả dòng đầu; `count(fromExpr, params)` chạy `SELECT count(*) FROM <fromExpr>`; `rid()` sinh UUID.

- [ ] **Step 1: Kiểm điều kiện trước**

Chạy `git log --oneline main -- supabase/migrations/103b_baseline_prod_drift.sql` và `ls supabase/migrations/111_*`. Cả hai phải có kết quả. Controller chạy SELECT trên prod, phải có 1 dòng:

```sql
SELECT name FROM supabase_migrations.schema_migrations WHERE name LIKE '111_%';
```

Thiếu thì dừng, báo controller. Chạy `npm ci` trong `admin-web/`.

- [ ] **Step 2: Chụp 9 hàm từ prod**

Controller chạy SELECT này trên prod. Dùng base64 để giữ nguyên CRLF:

```sql
SELECT p.proname, encode(convert_to(pg_get_functiondef(p.oid), 'UTF8'), 'base64') AS b64
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN (
  'close_table_session','close_table_sessions_bulk','confirm_manual_payment','kitchen_confirm_payment',
  'get_bills_report','get_sessions_bill','bills_report_table_label','bill_discount_amount','session_unpaid_subtotal');
```

Giải mã từng dòng thành `supabase/tests/prod-defs/112/<proname>.sql`. `.gitattributes` đã giữ nguyên byte cho `supabase/tests/prod-defs/**`. Chỉ đọc, không ghi gì lên prod.

- [ ] **Step 3: Viết helper và test (đang đỏ)**

`collect-bill-db.mjs` theo mẫu `supabase/tests/100_bills_report.test.mjs`: nạp PGlite qua `PGLITE_MODULE`, tạo role `anon, authenticated, service_role, kitchen`, schema `auth`, bảng tối thiểu, rồi `exec` 9 bản chụp, rồi `exec` file 112a, và 112b nếu `lock: true`.

Hàm dựng tay trong helper: `is_store_pos_operator`, `is_store_scoped_operator`, `is_store_owner_or_admin`, `kitchen_store_id` (đọc GUC `test.kitchen_store`), `reservation_public_json`, `reservation_active_table_summary`, `append_reservation_event`. Bản chụp `get_bills_report` sau mig 111 có gọi hàm ngày kinh doanh: dựng `business_day_bounds` và `current_business_date` theo mốc 00:00 giờ VN.

Bảng `orders` phải chép hai CHECK thật từ prod để lỗi lộ ra trong test: `orders_payment_instrument_check` và `orders_payment_received_state_check` (`via` là `kitchen` thì `payment_received_by` phải NULL).

```js
// supabase/tests/112a_collect_table_bill.test.mjs — trích các ca chính
const cash = (amount) => ({ instrument: 'cash', amount })
const bank = (amount) => ({ instrument: 'bank', amount })

test('một phương tiện: đóng phiên, tiền mặt lưu số ròng', async () => {
  const s = await session(); const o = await order(s, 100000)
  const r = await collect([s], [cash(100000)], 200000, rid())
  assert.deepEqual([r.ok, r.already, r.total, r.orders_settled], [true, false, 100000, 1])
  const p = await one('SELECT * FROM bill_payments WHERE id = $1', [r.payment_id])
  assert.deepEqual([Number(p.total_amount), p.cash_given, p.change_amount, p.source, p.collected_by],
    [100000, 200000, 100000, 'pos', ids.cashier])
  const row = await one('SELECT * FROM orders WHERE id = $1', [o])
  assert.deepEqual([row.payment_instrument, row.bill_payment_id, row.status], ['cash', r.payment_id, 'paid'])
  assert.equal(row.payment_received_by, ids.cashier)
  const ss = await one('SELECT * FROM table_sessions WHERE id = $1', [s])
  assert.deepEqual([ss.status, ss.close_reason, ss.bill_payment_id], ['closed', 'paid', r.payment_id])
})

test('kết hợp: 2 dòng, đơn ghi mixed, thối theo phần tiền mặt', async () => {
  const s = await session(); const o = await order(s, 1000000)
  const r = await collect([s], [cash(400000), bank(600000)], 500000, rid())
  assert.equal(await count('bill_payment_lines WHERE payment_id = $1', [r.payment_id]), 2)
  assert.equal((await one('SELECT change_amount FROM bill_payments WHERE id = $1', [r.payment_id])).change_amount, 100000)
  assert.equal((await one('SELECT payment_instrument FROM orders WHERE id = $1', [o])).payment_instrument, 'mixed')
})

test('lệch một đồng: huỷ toàn bộ, không ghi gì', async () => {
  const s = await session(); const o = await order(s, 100000)
  await assert.rejects(collect([s], [cash(99999)], null, rid()), /Số tiền không khớp bill/)
  assert.equal(await count('bill_payments'), 0)
  assert.equal((await one('SELECT payment_received_at FROM orders WHERE id = $1', [o])).payment_received_at, null)
  assert.equal((await one('SELECT status FROM table_sessions WHERE id = $1', [s])).status, 'open')
})

test('gộp 2 mâm có giảm giá: chia xong mới so ở cấp cả nhóm', async () => {
  const a = await session({ discount: ['percent', 10] }); await order(a, 155000)
  const b = await session(); await order(b, 60000)
  const r = await collect([a, b], [cash(100000), bank(99500)], null, rid())
  assert.equal(r.total, 199500)
  assert.equal((await one('SELECT sum(bill_discount_amount)::int v FROM orders WHERE session_id = $1', [a])).v, 15500)
  assert.equal(await count('table_sessions WHERE bill_payment_id = $1', [r.payment_id]), 2)
})

test('chỉ tính phần thu lần này: đơn đã thu trước không vào tổng', async () => {
  const s = await session(); const old = await order(s, 50000, { paid: true }); await order(s, 80000)
  await assert.rejects(collect([s], [cash(130000)], null, rid()), /Số tiền không khớp bill/)
  const r = await collect([s], [cash(80000)], null, rid())
  assert.equal(r.total, 80000)
  assert.equal((await one('SELECT bill_payment_id FROM orders WHERE id = $1', [old])).bill_payment_id, null)
})

test('gọi lại cùng mã: trả kết quả cũ, không tạo khoản thứ hai', async () => {
  const s = await session(); await order(s, 100000); const id = rid()
  const a = await collect([s], [cash(100000)], null, id)
  const b = await collect([s], [cash(100000)], null, id)
  assert.deepEqual([b.already, b.payment_id, b.total, b.orders_settled], [true, a.payment_id, 100000, 1])
  assert.equal(await count('bill_payments'), 1)
  const other = await session(); await order(other, 1000)
  await assert.rejects(collect([other], [cash(1000)], null, id), /đã dùng cho bill khác/)
})

test('hai máy: một mâm đã thu thì không thu nửa nhóm; thu hết rồi thì báo already', async () => {
  const a = await session(); await order(a, 1000); const b = await session(); await order(b, 2000)
  await collect([a], [cash(1000)], null, rid())
  await assert.rejects(collect([a, b], [cash(2000)], null, rid()), /vừa được thu ở máy khác/)
  assert.equal((await one('SELECT status FROM table_sessions WHERE id = $1', [b])).status, 'open')
  await collect([b], [cash(2000)], null, rid())
  const r = await collect([a, b], [cash(3000)], null, rid())
  assert.deepEqual([r.already, r.orders_settled, r.total], [true, 0, 3000])
})

test('phiên hết hạn: thu được, bỏ qua giảm giá; số sau giảm bị từ chối', async () => {
  const s = await session({ expired: true, discount: ['amount', 10000] }); await order(s, 100000)
  await assert.rejects(collect([s], [cash(90000)], null, rid()), /Số tiền không khớp bill/)
  assert.equal((await collect([s], [cash(100000)], null, rid())).total, 100000)
})

test('phiên đã bỏ hoặc đã nhập mâm: không thu', async () => {
  for (const reason of ['staff_reset', 'merged']) {
    const s = await session({ closeReason: reason })
    await assert.rejects(collect([s], [], null, rid()), /Phiên đã đóng/)
  }
})

test('bill 0đ: lines rỗng thu được; còn tiền mà lines rỗng thì không', async () => {
  const s = await session(); await order(s, 0)
  const r = await collect([s], [], null, rid())
  assert.deepEqual([r.ok, r.total], [true, 0])
  const t = await session(); await order(t, 5000)
  await assert.rejects(collect([t], [], null, rid()), /Số tiền không khớp bill/)
})

test('đầu vào xấu bị chặn, lỗi tiếng Việt', async () => {
  const s = await session(); await order(s, 1000)
  for (const lines of [[{ instrument: 'wallet', amount: 1000 }], [cash(0)], [cash(-1)], [{ instrument: 'cash', amount: 1.5 }], [{ instrument: 'cash', amount: '1000' }], {}]) {
    await assert.rejects(collect([s], lines, null, rid()), /Khoản thu không hợp lệ/)
  }
  await assert.rejects(collect([s], [cash(500), cash(500)], null, rid()), /Mỗi phương tiện chỉ ghi một khoản/)
  await assert.rejects(collect([s], [cash(1000)], 999, rid()), /Tiền khách đưa thiếu/)
  await assert.rejects(collect([s], [bank(1000)], 1000, rid()), /Không có phần tiền mặt/)
})

test('còn lượt chờ duyệt thì không thu', async () => {
  const s = await session(); await order(s, 1000, { status: 'pending' })
  await assert.rejects(collect([s], [cash(1000)], null, rid()), /chưa được chủ quán xác nhận/)
})

test('quyền: phục vụ, quán khác bị chặn; anon không gọi được; lõi không ai gọi thẳng được', async () => {
  const s = await session(); await order(s, 1000)
  for (const uid of [ids.staff, ids.otherOwner]) {
    await assert.rejects(collect([s], [cash(1000)], null, rid(), uid), /Chỉ chủ quán hoặc thu ngân/)
  }
  const can = async (role, fn) => (await one('SELECT has_function_privilege($1, $2, \'EXECUTE\') v', [role, fn])).v
  const collectSig = 'collect_table_bill(uuid[],jsonb,integer,uuid)'
  const coreSig = 'close_table_session_core(uuid,text,text,uuid)'
  assert.equal(await can('anon', collectSig), false)
  assert.equal(await can('authenticated', collectSig), true)
  assert.equal(await can('anon', coreSig), false)
  assert.equal(await can('authenticated', coreSig), false)
})
```

- [ ] **Step 4: Chạy để thấy đỏ**

```powershell
$env:PGLITE_MODULE=(Resolve-Path 'admin-web/node_modules/@electric-sql/pglite/dist/index.js').Path
node --test supabase/tests/112a_collect_table_bill.test.mjs
```

Expected: FAIL, thiếu file `112a_collect_table_bill.sql`.

- [ ] **Step 5: Viết phần bảng của `112a_collect_table_bill.sql`**

Bọc cả file trong `BEGIN; ... COMMIT;` để lỗi neo không để lại nửa migration. Ghi đầu file: chưa khoá đường cũ, được áp TRƯỚC khi Vercel lên code mới.

```sql
CREATE TABLE public.bill_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id),
  cash_shift_id uuid,            -- FK thêm ở mig 113
  client_request_id uuid,        -- NULL cho manual_order, kitchen: hai đường đó chống trùng bằng khoá đơn
  total_amount bigint NOT NULL CHECK (total_amount >= 0),
  cash_given integer CHECK (cash_given >= 0),
  change_amount integer CHECK (change_amount >= 0),
  collected_by uuid,             -- NULL khi bếp xác nhận: token bếp không có auth.uid()
  collected_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL CHECK (source IN ('pos','staff','a04','manual_order','kitchen')),
  UNIQUE (store_id, client_request_id),
  UNIQUE (id, store_id)
);
CREATE TABLE public.bill_payment_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.bill_payments(id) ON DELETE CASCADE,
  instrument text NOT NULL CHECK (instrument IN ('cash','bank')),
  amount integer NOT NULL CHECK (amount > 0),
  UNIQUE (payment_id, instrument)
);
```

Thêm `orders.bill_payment_id` và `table_sessions.bill_payment_id` kiểu `uuid`, FK ghép `(bill_payment_id, store_id) REFERENCES bill_payments(id, store_id)` như `orders_session_same_store`. Index riêng cho hai cột `WHERE bill_payment_id IS NOT NULL`, index `bill_payments(store_id, collected_at)`.

Đổi CHECK:

```sql
ALTER TABLE public.orders DROP CONSTRAINT orders_payment_instrument_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_instrument_check
  CHECK (payment_instrument IN ('wallet','bank','momo','vnpay','cash','mixed'));
```

RLS: bật cho cả hai bảng. `bill_payments` đọc được khi `is_store_pos_operator(store_id)`. `bill_payment_lines` đọc qua `EXISTS` trên `bill_payments`.

- [ ] **Step 6: Tạo lõi bằng cách nhân từ hàm prod**

Chép helper `pg_temp.mevo_patch` từ mig 110 (dòng 52–68), đổi nhãn thành `mig 112a`, tách phần thay chuỗi thành `pg_temp.mevo_sub(p_text, p_from, p_to) RETURNS text` để dùng được cho cả việc nhân hàm. Khối `DO` đọc `pg_get_functiondef('public.close_table_session(uuid,text,text)')`, chạy 4 lần thay sau rồi `EXECUTE`. `close_table_session` không đổi ở mig này.

| Chuỗi neo (đã đối chiếu prod 2026-11-05, khớp đúng 1 lần) | Thay bằng |
|---|---|
| `CREATE OR REPLACE FUNCTION public.close_table_session(p_session_id uuid, p_reason text, p_instrument text DEFAULT NULL::text)` | `CREATE OR REPLACE FUNCTION public.close_table_session_core(p_session_id uuid, p_reason text, p_instrument text, p_payment_id uuid)` |
| `    IF p_instrument IS NULL OR p_instrument NOT IN ('cash', 'bank') THEN` | Trước dòng này thêm `IF p_payment_id IS NULL THEN RAISE EXCEPTION 'Thiếu khoản thu'; END IF;`, rồi đổi danh sách thành `('cash', 'bank', 'mixed')` |
| `        payment_instrument = p_instrument` | Giữ nguyên, thêm `,` và dòng `bill_payment_id = p_payment_id` |
| `      close_reason = p_reason` | Giữ nguyên, thêm `,` và dòng `bill_payment_id = p_payment_id` |

Sau đó `REVOKE ALL ON FUNCTION public.close_table_session_core(uuid,text,text,uuid) FROM PUBLIC, anon, authenticated;`.

- [ ] **Step 7: Viết `collect_table_bill`**

`LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'`. `REVOKE ALL ... FROM PUBLIC, anon`, `GRANT EXECUTE ... TO authenticated`. Làm đúng thứ tự:

1. Kiểm `p_client_request_id` ('Thiếu mã chống thu trùng'), danh sách phiên ('Chưa chọn phiên nào'), `auth.uid()` ('Thiếu danh tính người chốt bill').
2. `v_ids` = id phân biệt, sắp tăng dần. Khoá `PERFORM 1 FROM table_sessions WHERE id = ANY(v_ids) ORDER BY id FOR UPDATE`.
3. Thiếu phiên: 'Không tìm thấy phiên'. Khác quán: 'Các phiên không cùng một quán'. Không qua `is_store_pos_operator`: 'Chỉ chủ quán hoặc thu ngân được thu tiền'.
4. Tìm `bill_payments` theo `(store_id, client_request_id)`, **sau khi** đã khoá để lần gọi song song thấy được kết quả lần đầu. Có rồi: tập phiên của khoản đó khác `v_ids` thì RAISE 'Mã thu tiền đã dùng cho bill khác'; trùng thì trả `already=true`, `total=total_amount`, `orders_settled` = số đơn mang `bill_payment_id` đó.
5. Trạng thái phiên: có `staff_reset` hoặc `merged` thì RAISE 'Phiên đã đóng, không thu được'. Tất cả đã `paid` thì trả `already=true`, `orders_settled=0`, `total` = tổng đơn chưa huỷ, `payment_id` = id chung nếu mọi phiên cùng một khoản, không thì NULL. Chỉ một phần `paid` thì RAISE 'Có mâm vừa được thu ở máy khác, tải lại bill'.
6. Đọc `p_lines`: phải là mảng, không quá 2 phần tử; mỗi phần tử có `instrument` trong `cash`, `bank`, `jsonb_typeof(amount)='number'`, `amount` là số nguyên từ 1 tới 2.000.000.000. Sai: 'Khoản thu không hợp lệ'. Trùng phương tiện: 'Mỗi phương tiện chỉ ghi một khoản'.
7. `p_cash_given` khác NULL: không có dòng tiền mặt thì RAISE 'Không có phần tiền mặt để nhận tiền khách đưa'; nhỏ hơn phần tiền mặt thì RAISE 'Tiền khách đưa thiếu so với phần tiền mặt'. `change_amount` = `p_cash_given` − phần tiền mặt.
8. `v_instrument`: 2 dòng là `mixed`, 1 dòng là phương tiện đó, 0 dòng là `cash`.
9. INSERT `bill_payments` dạng `INSERT ... VALUES`, cột `cash_shift_id` ghi chữ `NULL`, `total_amount` = tổng `p_lines`, `source='pos'`, `collected_by=auth.uid()`; INSERT các dòng.
10. `FOREACH` qua `v_ids`, gọi `close_table_session_core(id, 'paid', v_instrument, v_payment_id)`, cộng `orders_settled`.
11. `v_due` = tổng `orders.total_amount` có `bill_payment_id = v_payment_id`. Khác tổng `p_lines` thì `RAISE EXCEPTION 'Số tiền không khớp bill: cần thu %, đang ghi %. Tải lại bill rồi thu lại', v_due, v_sum`. Exception huỷ cả giao dịch, đây chính là quy tắc "tất cả hoặc không".
12. Trả `{ok:true, already:false, payment_id, total:v_due, orders_settled}`.

- [ ] **Step 8: Chạy test**

Lệnh ở Step 4. Expected: PASS hết.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/112a_collect_table_bill.sql supabase/tests/prod-defs/112 supabase/tests/helpers/collect-bill-db.mjs supabase/tests/112a_collect_table_bill.test.mjs
git commit -m "feat: RPC collect_table_bill va bang bill_payments (mig 112a)"
```

---

### Task 2: Đơn lẻ ghi khoản thu một dòng

**Files:**
- Modify: `supabase/migrations/112a_collect_table_bill.sql` (thêm trước `COMMIT;`)
- Test: `supabase/tests/112a_single_order_payment.test.mjs`

**Interfaces:**
- Consumes: `openCollectDb` từ Task 1.
- Produces: `attach_order_payment(p_order_id uuid, p_payment_id uuid) RETURNS void` (nội bộ).
- Produces cho mig 113: `confirm_manual_payment` và `kitchen_confirm_payment` mỗi hàm có một câu `INSERT INTO public.bill_payments (...) VALUES (...)` với `cash_shift_id` là chữ `NULL`, đứng sau nhánh `already`. Plan B neo vào nguyên câu này.
- Produces: helper thêm `confirm(orderId)` (chạy dưới `ids.owner`) và `kitchenConfirm(orderId)` (đặt GUC `test.kitchen_store`).

- [ ] **Step 1: Viết test**

```js
test('owner xác nhận đơn tiền mặt: một khoản một dòng, gọi lại không tạo thêm', async () => {
  const o = await order(null, 70000, { method: 'cash' })
  await confirm(o); await confirm(o)
  assert.equal(await count('bill_payments'), 1)
  const p = await one('SELECT * FROM bill_payments')
  assert.deepEqual([p.source, p.collected_by, Number(p.total_amount)], ['manual_order', ids.owner, 70000])
  const l = await one('SELECT * FROM bill_payment_lines WHERE payment_id = $1', [p.id])
  assert.deepEqual([l.instrument, l.amount], ['cash', 70000])
  const row = await one('SELECT bill_payment_id, payment_instrument FROM orders WHERE id = $1', [o])
  assert.deepEqual([row.bill_payment_id, row.payment_instrument], [p.id, 'cash'])
})

test('phương tiện suy từ payment_method, không đọc payment_instrument ghi sẵn', async () => {
  const a = await order(null, 1000, { method: 'bank_transfer', instrument: 'cash' })
  const b = await order(null, 2000, { method: 'zalo_checkout', instrument: null })
  await confirm(a); await confirm(b)
  assert.equal(await count("bill_payment_lines WHERE instrument = 'bank'"), 2)
})

test('bếp xác nhận: source kitchen, collected_by NULL', async () => {
  const o = await order(null, 3000, { method: 'zalo_checkout', instrument: 'bank' })
  await kitchenConfirm(o)
  const p = await one('SELECT source, collected_by FROM bill_payments')
  assert.deepEqual([p.source, p.collected_by], ['kitchen', null])
})

test('đơn 0đ: ghi nhận tiền, không tạo khoản thu', async () => {
  const o = await order(null, 0, { method: 'cash' })
  await confirm(o)
  assert.equal(await count('bill_payments'), 0)
})

test('mig 110 vẫn chặn thu lẻ đơn của phiên đang mở', async () => {
  const s = await session(); const o = await order(s, 1000)
  await assert.rejects(confirm(o), /thu cả bàn một lần/)
  assert.equal(await count('bill_payments'), 0)
})

test('hai hàm khoá dòng đơn trước khi đọc, chống ghi hai khoản khi bấm song song', async () => {
  for (const fn of ['confirm_manual_payment(uuid)', 'kitchen_confirm_payment(uuid)']) {
    const { def } = await one('SELECT pg_get_functiondef($1::regprocedure) def', [fn])
    assert.match(def, /select \* into v_order from orders where id = p_order_id[^;]*for update;/)
  }
})
```

- [ ] **Step 2: Chạy để thấy đỏ**

`node --test supabase/tests/112a_single_order_payment.test.mjs`. Expected: FAIL ở ca đầu, `bill_payments` rỗng.

- [ ] **Step 3: Viết hàm và vá**

`attach_order_payment`: đọc đơn; phương tiện = `cash` khi `payment_method='cash'`, còn lại `bank`; `UPDATE orders SET payment_instrument, bill_payment_id = p_payment_id`; `p_payment_id` khác NULL thì INSERT một dòng `bill_payment_lines` với `amount = total_amount`. REVOKE như Global Constraints.

Chèn khối này trước dòng `return` của mỗi hàm. `<nguồn>` là `'manual_order'`, `'kitchen'`; `<người>` là `auth.uid()`, `NULL`:

```sql
  -- mig 112a: ghi khoản thu một dòng. Đơn 0đ không có khoản thu.
  if v_order.total_amount > 0 then
    insert into public.bill_payments (store_id, cash_shift_id, total_amount, collected_by, source)
    values (v_order.store_id, NULL, v_order.total_amount, <người>, <nguồn>)
    returning id into v_payment_id;
  end if;
  perform public.attach_order_payment(p_order_id, v_payment_id);
```

| Hàm | Neo (khớp 1 lần trên prod) | Thay bằng |
|---|---|---|
| `confirm_manual_payment(uuid)` | `  select * into v_order from orders where id = p_order_id;` | thêm `for update` trước dấu `;` |
| `confirm_manual_payment(uuid)` | `declare v_order orders%rowtype;` | giữ nguyên, thêm `v_payment_id uuid;` |
| `confirm_manual_payment(uuid)` | `  return jsonb_build_object('ok', true, 'already', false);` | khối trên, rồi giữ nguyên dòng neo |
| `kitchen_confirm_payment(uuid)` | `  select * into v_order from orders where id = p_order_id and store_id = v_store;` | thêm `for update` trước dấu `;` |
| `kitchen_confirm_payment(uuid)` | `  v_can_cash boolean;` | giữ nguyên, thêm `  v_payment_id uuid;` |
| `kitchen_confirm_payment(uuid)` | `  return jsonb_build_object('ok', true);` | khối trên, rồi giữ nguyên dòng neo |

- [ ] **Step 4: Chạy test**

Lệnh ở Step 2, rồi `node --test supabase/tests/112a_collect_table_bill.test.mjs`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/112a_collect_table_bill.sql supabase/tests/112a_single_order_payment.test.mjs
git commit -m "feat: don le xac nhan tay ghi bill_payments (mig 112a)"
```

---

### Task 3: Báo cáo và hoá đơn đọc từng khoản

**Files:**
- Modify: `supabase/migrations/112a_collect_table_bill.sql` (thêm trước `COMMIT;`)
- Test: `supabase/tests/112a_payment_readers.test.mjs`

**Interfaces:**
- Produces: `get_bills_report` mỗi bill thêm `payments: [{instrument, amount}]`, `cash_given`, `change_amount`; khoá bill mới `P:<payment_id>`. `get_sessions_bill` thêm `payments`, `cash_given`, `change_amount` ở gốc JSON.

`100_bills_report.test.mjs` nạp thẳng file mig 100 nên không bị ảnh hưởng; ca mới nằm ở file test này.

- [ ] **Step 1: Viết test**

```js
test('bill kết hợp: một dòng, đúng từng khoản, TM + CK + khác = doanh thu', async () => {
  const s = await session(); await order(s, 1000000)
  const { payment_id } = await collect([s], [cash(400000), bank(600000)], 500000, rid())
  const r = await report()
  const b = r.bills.find((x) => x.key === `P:${payment_id}`)
  assert.equal(b.instrument, 'mixed')
  assert.deepEqual(b.payments, [{ instrument: 'cash', amount: 400000 }, { instrument: 'bank', amount: 600000 }])
  assert.deepEqual([b.cash_given, b.change_amount], [500000, 100000])
  assert.deepEqual([r.totals.cash, r.totals.bank, r.totals.other, r.totals.revenue], [400000, 600000, 0, 1000000])
})

test('gộp N mâm thu một lần: MỘT dòng bill', async () => {
  const a = await session(); await order(a, 1000); const b = await session(); await order(b, 2000)
  await collect([a, b], [cash(3000)], null, rid())
  const r = await report()
  assert.equal(r.bills.length, 1); assert.equal(r.bills[0].merged, true); assert.equal(r.bills[0].instrument, 'cash')
})

test('bill cũ chưa có bill_payment_id: khoá và số giữ nguyên như trước', async () => {
  const s = await legacyPaidSession({ amount: 5000, instrument: 'bank' })
  const r = await report()
  const b = r.bills.find((x) => x.session_ids.includes(s))
  assert.match(b.key, /^C:/); assert.equal(b.instrument, 'bank'); assert.deepEqual(b.payments, [])
  assert.deepEqual([r.totals.bank, r.totals.revenue], [5000, 5000])
})

test('đơn tiền mặt legacy (paid, không có payment_received_at) vẫn vào TM; ví vào khác', async () => {
  await legacyCashPaid(7000); await walletOrder(9000)
  const r = await report()
  assert.deepEqual([r.totals.cash, r.totals.other, r.totals.revenue], [7000, 9000, 16000])
})

test('đơn đã ghi sẵn cash nhưng chưa thu không vào doanh thu', async () => {
  const s = await session(); await order(s, 4000, { instrument: 'cash' })
  assert.equal((await report()).totals.revenue, 0)
})

test('xác nhận tay đơn zalo_checkout chưa ghi phương tiện: dòng bill và tổng đều là bank', async () => {
  const o = await order(null, 2000, { method: 'zalo_checkout', instrument: null })
  await confirm(o)
  const r = await report()
  assert.equal(r.totals.bank, 2000); assert.equal(r.bills[0].instrument, 'bank')
})

test('get_sessions_bill: bill đã thu trả khoản; bill chưa thu trả rỗng', async () => {
  const s = await session(); await order(s, 1000000)
  assert.deepEqual((await sessionsBill([s])).payments, [])
  await collect([s], [cash(400000), bank(600000)], 500000, rid())
  const b = await sessionsBill([s])
  assert.deepEqual(b.payments, [{ instrument: 'cash', amount: 400000 }, { instrument: 'bank', amount: 600000 }])
  assert.deepEqual([b.cash_given, b.change_amount], [500000, 100000])
})
```

Thêm vào helper: `report()` (hôm nay giờ VN, dưới `ids.owner`), `sessionsBill(ids)`, `legacyPaidSession({ amount, instrument })` (phiên `paid`, đơn có `payment_received_at`, không có `bill_payment_id`), `legacyCashPaid(amount)` (đơn cash, `status='paid'`, không có `payment_received_at`), `walletOrder(amount)` (zalo_checkout, `wallet`, via `zalo_callback`).

- [ ] **Step 2: Chạy để thấy đỏ**

`node --test supabase/tests/112a_payment_readers.test.mjs`. Expected: FAIL ở `b` là undefined.

- [ ] **Step 3: Vá `get_bills_report` bằng `pg_temp.mevo_patch`**

Chín neo sau đều khớp đúng 1 lần trên prod ngày 2026-11-05. Mig 111 chỉ đổi các mốc ngày nên không đụng chúng; nếu có đụng, helper RAISE và test đỏ.

| Neo | Thay bằng |
|---|---|
| `      SELECT o.id, o.session_id, o.order_type, o.total_amount, o.created_at,` | giữ nguyên, thêm dòng `             o.bill_payment_id,` |
| `               WHEN o.payment_instrument = 'cash' THEN 'cash'` | trước dòng: `               WHEN o.payment_instrument = 'mixed' THEN 'mixed'` |
| `               WHEN session_id IS NOT NULL AND close_reason = 'paid' AND session_paid_at IS NOT NULL` | trước dòng: `               WHEN bill_payment_id IS NOT NULL THEN 'P:' || bill_payment_id::text` |
| `    bills AS (` | trước dòng: thêm CTE `pay` bên dưới |
| `             MIN(order_type) AS order_type` | giữ nguyên, thêm `,` và `(array_agg(bill_payment_id))[1] AS payment_id` |
| dòng `'cash', ...`, `'bank', ...`, `'other', ...` trong `totals` | ba dòng bên dưới |
| `          'instrument', b.instrument,` | giữ nguyên, thêm `'payments'`, `'cash_given'`, `'change_amount'` đọc từ `pay` theo `b.payment_id`, `payments` mặc định `'[]'::jsonb` |

Dùng `(array_agg(...))[1]` vì Postgres không có `min(uuid)`.

```sql
pay AS (
  SELECT bp.id AS payment_id, bp.cash_given, bp.change_amount,
         COALESCE(SUM(l.amount) FILTER (WHERE l.instrument = 'cash'), 0)::bigint AS cash,
         COALESCE(SUM(l.amount) FILTER (WHERE l.instrument = 'bank'), 0)::bigint AS bank,
         COALESCE(jsonb_agg(jsonb_build_object('instrument', l.instrument, 'amount', l.amount)
                  ORDER BY l.instrument DESC) FILTER (WHERE l.id IS NOT NULL), '[]'::jsonb) AS lines
  FROM public.bill_payments bp
  LEFT JOIN public.bill_payment_lines l ON l.payment_id = bp.id
  WHERE bp.id IN (SELECT bill_payment_id FROM keyed WHERE bill_payment_id IS NOT NULL)
  GROUP BY bp.id
),
```

```sql
'cash',  COALESCE(SUM(total_amount) FILTER (WHERE bucket = 'cash' AND bill_payment_id IS NULL), 0)
         + (SELECT COALESCE(SUM(cash), 0) FROM pay),
'bank',  COALESCE(SUM(total_amount) FILTER (WHERE bucket = 'bank' AND bill_payment_id IS NULL), 0)
         + (SELECT COALESCE(SUM(bank), 0) FROM pay),
-- Bất biến TM + CK + khác = doanh thu đúng theo cách tính: khác = phần còn lại.
'other', COALESCE(SUM(total_amount), 0)
         - COALESCE(SUM(total_amount) FILTER (WHERE bucket IN ('cash', 'bank') AND bill_payment_id IS NULL), 0)
         - (SELECT COALESCE(SUM(cash + bank), 0) FROM pay),
```

- [ ] **Step 4: Vá `get_sessions_bill`**

Neo một dòng `    'grand_discount', v_discount` (hàm này lẫn CRLF). Giữ nguyên dòng đó, thêm `'payments'`, `'cash_given'`, `'change_amount'` bằng subquery trên `bill_payments` có `id IN (SELECT bill_payment_id FROM table_sessions WHERE id = ANY(p_session_ids))`. `payments` cộng theo phương tiện, sắp `instrument DESC`, mặc định `'[]'::jsonb`. `cash_given`, `change_amount` chỉ trả khi đúng một khoản, không thì NULL.

- [ ] **Step 5: Chạy cả ba file test 112a**

```powershell
node --test supabase/tests/112a_collect_table_bill.test.mjs supabase/tests/112a_single_order_payment.test.mjs supabase/tests/112a_payment_readers.test.mjs
```

Expected: PASS hết.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/112a_collect_table_bill.sql supabase/tests/112a_payment_readers.test.mjs supabase/tests/helpers/collect-bill-db.mjs
git commit -m "feat: bao cao va hoa don doc tung khoan thu (mig 112a)"
```

---

### Task 4: Mig 112b khoá đường thu cũ

**Files:**
- Create: `supabase/migrations/112b_lock_old_paid_path.sql`
- Test: `supabase/tests/112b_lock_old_paid_path.test.mjs`

**Interfaces:**
- Consumes: `close_table_session_core`, `collect_table_bill` từ Task 1.
- Produces: `close_table_session` chỉ còn nhánh `staff_reset`, chữ ký giữ nguyên nên không có bản cũ để drop.

Quy tắc A3 số 7 cần chặn cả đường UPDATE thẳng: RLS `auth_update_orders` cho chủ quán sửa `orders` (CLAUDE.md 2026-11-03 đã ghi là chỗ còn hở). `table_sessions` chỉ có policy đọc nên không cần chặn. File này chỉ có hàm và trigger, không đụng dữ liệu.

- [ ] **Step 1: Viết test**

```js
const { db, ids, login, session, order, collect, rid, one } = await openCollectDb({ lock: true })

test('thu bằng đường cũ bị từ chối, đơn không đổi', async () => {
  const s = await session(); const o = await order(s, 1000)
  await login(ids.cashier)
  await assert.rejects(db.query("SELECT close_table_session($1, 'paid', 'cash')", [s]), /tải lại trang/)
  await assert.rejects(db.query("SELECT close_table_sessions_bulk($1::uuid[], 'paid', 'cash')", [[s]]), /tải lại trang/)
  assert.equal((await one('SELECT payment_received_at FROM orders WHERE id = $1', [o])).payment_received_at, null)
})

test('Bỏ bàn vẫn chạy, không tạo khoản thu', async () => {
  const s = await session(); await order(s, 1000)
  await login(ids.cashier)
  const r = (await db.query("SELECT close_table_session($1, 'staff_reset', NULL) v", [s])).rows[0].v
  assert.equal(r.orders_cancelled, 1)
  assert.equal((await one('SELECT close_reason FROM table_sessions WHERE id = $1', [s])).close_reason, 'staff_reset')
})

test('chủ quán không UPDATE thẳng được cột tiền của đơn', async () => {
  const o = await order(null, 1000, { method: 'cash' })
  await login(ids.owner)
  await assert.rejects(db.query('UPDATE orders SET payment_received_at = now() WHERE id = $1', [o]), /Không ghi tiền trực tiếp/)
  await assert.rejects(db.query("UPDATE orders SET payment_instrument = 'bank' WHERE id = $1", [o]), /Không ghi tiền trực tiếp/)
  await db.query("UPDATE orders SET status = 'confirmed' WHERE id = $1", [o]) // cột khác vẫn sửa được
})

test('đường mới vẫn thu được sau khi khoá', async () => {
  const s = await session(); await order(s, 1000)
  assert.equal((await collect([s], [{ instrument: 'bank', amount: 1000 }], null, rid())).total, 1000)
})
```

- [ ] **Step 2: Chạy để thấy đỏ**

`node --test supabase/tests/112b_lock_old_paid_path.test.mjs`. Expected: FAIL, thiếu file 112b.

- [ ] **Step 3: Viết `112b_lock_old_paid_path.sql`**

Đầu file ghi rõ: chỉ áp SAU khi Vercel đã lên code gọi `collect_table_bill` và các tab POS đã tải lại. Không ghi "rerun-safe". Bọc `BEGIN; ... COMMIT;`.

1. Khối `DO $pre$`: dừng nếu thiếu `public.collect_table_bill(uuid[],jsonb,integer,uuid)`. Dừng nếu có hàm SECURITY INVOKER ghi `payment_received_at` (mẫu `DO $pre$` của mig 110).
2. `CREATE OR REPLACE FUNCTION public.close_table_session(p_session_id uuid, p_reason text, p_instrument text DEFAULT NULL::text)`, `SECURITY DEFINER`, `SET search_path TO 'public'`. Thân: `p_reason = 'paid'` thì `RAISE EXCEPTION 'Màn thu tiền đã cập nhật, tải lại trang rồi thu lại'`; còn lại `RETURN public.close_table_session_core(p_session_id, p_reason, NULL, NULL)`. `close_table_sessions_bulk` gọi lại hàm này nên tự bị chặn.
3. `block_client_money_write() RETURNS trigger` và `trg_orders_block_client_money_write BEFORE UPDATE ON public.orders`. RAISE 'Không ghi tiền trực tiếp vào đơn' khi `current_user IN ('anon','authenticated','kitchen')` và một trong `payment_received_at, payment_received_via, payment_received_by, payment_instrument, bill_payment_id` đổi. RPC SECURITY DEFINER chạy quyền postgres, `checkout-notify` chạy `service_role` nên không bị chặn.
4. `NOTIFY pgrst, 'reload schema';`

- [ ] **Step 4: Chạy test**

Lệnh ở Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/112b_lock_old_paid_path.sql supabase/tests/112b_lock_old_paid_path.test.mjs
git commit -m "feat: khoa duong thu cu, chan ghi tien truc tiep (mig 112b)"
```

---

### Task 5: Logic thuần và server action

**Files:**
- Create: `admin-web/lib/collect-payment.ts`, `admin-web/lib/collect-payment.test.ts`
- Modify: `admin-web/lib/cash-change.ts:19-28`, `admin-web/lib/cash-change.test.ts`
- Modify: `admin-web/lib/actions/table-session.ts:82-91` (thêm kiểu), thêm action sau dòng 158
- Test: `admin-web/lib/actions/service-requests.test.ts` (khối `describe` thu tiền, dòng 188–198)

**Interfaces:**
- Produces, `lib/collect-payment.ts`:
  - `type PayMethod = 'cash' | 'bank' | 'mixed'`
  - `type PaymentLine = { instrument: 'cash' | 'bank'; amount: number }`
  - `fillOtherSide(total: number, typed: number | null): number | null`
  - `buildPaymentLines(total: number, method: PayMethod, cashPart: number | null, bankPart: number | null): { lines: PaymentLine[]; error: string | null }`
  - `cashPartOf(lines: PaymentLine[]): number`
  - `paymentRows(p: { payments?: PaymentLine[]; cashGiven?: number | null; changeAmount?: number | null }): { label: string; amount: number }[]`
- Produces, `lib/actions/table-session.ts`: `collectTableBill(input: { sessionIds: string[]; lines: { instrument: 'cash' | 'bank'; amount: number }[]; cashGiven: number | null; clientRequestId: string }): Promise<{ ok: true; already: boolean; paymentId: string | null; total: number; ordersSettled: number } | { ok: false; error: string }>`

- [ ] **Step 1: Viết test**

```ts
// lib/collect-payment.test.ts
describe('fillOtherSide', () => {
  it('gõ một ô, ô kia là phần còn lại, không âm', () => {
    expect(fillOtherSide(1_000_000, 400_000)).toBe(600_000)
    expect(fillOtherSide(1_000_000, 1_200_000)).toBe(0)
    expect(fillOtherSide(1_000_000, null)).toBeNull()
  })
})
describe('buildPaymentLines', () => {
  it('tiền mặt, chuyển khoản: một dòng đúng tổng', () => {
    expect(buildPaymentLines(100_000, 'cash', null, null)).toEqual({ lines: [{ instrument: 'cash', amount: 100_000 }], error: null })
    expect(buildPaymentLines(100_000, 'bank', null, null)).toEqual({ lines: [{ instrument: 'bank', amount: 100_000 }], error: null })
  })
  it('kết hợp đúng tổng: hai dòng; một ô bằng 0 thì còn một dòng', () => {
    expect(buildPaymentLines(1_000_000, 'mixed', 400_000, 600_000).lines).toHaveLength(2)
    expect(buildPaymentLines(1_000_000, 'mixed', 1_000_000, 0)).toEqual({ lines: [{ instrument: 'cash', amount: 1_000_000 }], error: null })
  })
  it('tổng đổi hoặc gõ sai: không có dòng, có lỗi', () => {
    const r = buildPaymentLines(1_100_000, 'mixed', 400_000, 600_000)
    expect(r.lines).toEqual([])
    expect(r.error).toBe('Tổng hai khoản phải đúng 1.100.000đ')
    expect(buildPaymentLines(1_000_000, 'mixed', null, null).error).toBe('Tổng hai khoản phải đúng 1.000.000đ')
  })
  it('bill 0đ: không dòng nào, không lỗi, ở mọi lựa chọn', () => {
    for (const m of ['cash', 'bank', 'mixed'] as const) expect(buildPaymentLines(0, m, null, null)).toEqual({ lines: [], error: null })
  })
})
describe('paymentRows', () => {
  it('đủ khoản, khách đưa, tiền thối', () => {
    expect(paymentRows({ payments: [{ instrument: 'cash', amount: 400_000 }, { instrument: 'bank', amount: 600_000 }], cashGiven: 500_000, changeAmount: 100_000 }))
      .toEqual([{ label: 'Tiền mặt', amount: 400_000 }, { label: 'Chuyển khoản', amount: 600_000 }, { label: 'Khách đưa', amount: 500_000 }, { label: 'Tiền thối', amount: 100_000 }])
  })
  it('không có khoản hoặc thối 0: bỏ dòng', () => {
    expect(paymentRows({ payments: [] })).toEqual([])
    expect(paymentRows({ payments: [{ instrument: 'bank', amount: 5 }], cashGiven: null, changeAmount: 0 })).toEqual([{ label: 'Chuyển khoản', amount: 5 }])
  })
})
```

```ts
// lib/cash-change.test.ts, thêm vào describe cashSuggestions
it('có mốc làm tròn lên 10.000', () => {
  expect(cashSuggestions(123_000)).toEqual([123_000, 130_000, 150_000, 200_000])
})
```

```ts
// lib/actions/service-requests.test.ts, thêm vào describe thu tiền
it('collectTableBill gửi đúng tham số RPC và đọc already thật', async () => {
  mocks.rpc.mockResolvedValue({ data: { ok: true, already: true, payment_id: 'p1', total: 100000, orders_settled: 0 }, error: null })
  const id = '11111111-1111-4111-8111-111111111111'
  const res = await collectTableBill({ sessionIds: [id], lines: [{ instrument: 'cash', amount: 100000 }], cashGiven: 200000, clientRequestId: id })
  expect(res).toEqual({ ok: true, already: true, paymentId: 'p1', total: 100000, ordersSettled: 0 })
  expect(mocks.rpc).toHaveBeenCalledWith('collect_table_bill', { p_session_ids: [id], p_lines: [{ instrument: 'cash', amount: 100000 }], p_cash_given: 200000, p_client_request_id: id })
})
it('collectTableBill chặn phục vụ, mã sai, chưa chọn mâm; lỗi RPC trả nguyên văn', async () => {
  const id = '11111111-1111-4111-8111-111111111111'
  const base = { sessionIds: [id], lines: [], cashGiven: null, clientRequestId: id }
  expect(await collectTableBill({ ...base, sessionIds: [] })).toEqual({ ok: false, error: 'Chưa chọn mâm nào' })
  expect(await collectTableBill({ ...base, clientRequestId: 'x' })).toEqual({ ok: false, error: 'Mã thu tiền không hợp lệ' })
  mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Số tiền không khớp bill' } })
  expect(await collectTableBill(base)).toEqual({ ok: false, error: 'Số tiền không khớp bill' })
  mocks.operator.value = { userId: 's', role: 'store_staff', storeId: 'store-1' }
  expect((await collectTableBill(base)).ok).toBe(false)
})
```

- [ ] **Step 2: Chạy để thấy đỏ**

Trong `admin-web/`: `npx vitest run lib/collect-payment.test.ts lib/cash-change.test.ts lib/actions/service-requests.test.ts`. Expected: FAIL, thiếu module và action.

- [ ] **Step 3: Viết code**

- `lib/collect-payment.ts`: theo chữ ký trên. Bill 0đ trả `lines: []` trước mọi kiểm tra. Kết hợp: `(cashPart ?? 0) + (bankPart ?? 0) !== total` thì trả lỗi; dòng bằng 0 thì bỏ.
- `cashSuggestions`: thêm `10_000` đầu mảng bước. Sửa comment đầu file `cash-change.ts`: tiền khách đưa nay được gửi lên server để lưu, số thu vẫn do server kiểm.
- `collectTableBill`: dùng `staffClient()` và `isPosRole` như `closeTableSession`, lỗi quyền 'Chỉ chủ quán hoặc thu ngân được thu tiền hoặc bỏ bàn'. Kiểm UUID bằng regex như `lib/actions/bill-detail.ts:15`.

- [ ] **Step 4: Chạy test**

Lệnh ở Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add admin-web/lib/collect-payment.ts admin-web/lib/collect-payment.test.ts admin-web/lib/cash-change.ts admin-web/lib/cash-change.test.ts admin-web/lib/actions/table-session.ts admin-web/lib/actions/service-requests.test.ts
git commit -m "feat: logic chia khoan va action collectTableBill"
```

---

### Task 6: Màn Thanh toán POS

**Files:**
- Create: `admin-web/app/admin/pos/payment-method-fields.tsx`, `admin-web/app/admin/pos/payment-method-fields.test.tsx`
- Modify: `admin-web/app/admin/pos/bill-panel.tsx:57,225,753-799,807,863-923`
- Modify: `admin-web/app/admin/pos/pos-client.tsx:18-19,424-438,1327`
- Test: `admin-web/app/admin/pos/bill-discount-ui.test.tsx` (khối `PaymentView`, dòng 77)

**Interfaces:**
- Consumes: `buildPaymentLines`, `fillOtherSide`, `cashPartOf`, `PayMethod`, `PaymentLine`, `collectTableBill` từ Task 5.
- Produces: kiểu `PosPayment = { lines: PaymentLine[]; cashGiven: number | null; clientRequestId: string }`, xuất từ `bill-panel.tsx`; `onPay` đổi thành `(list: OpenTableSession[], payment: PosPayment) => void`.
- Produces cho Plan D: trong `PaymentView` có biến `method`, `total`, `bankPart: number` (số chuyển khoản hiện tại, đổi theo ô nhập). Câu nhắc chuyển khoản nay nằm trong `PaymentMethodFields`, nên Plan D gắn khối QR ở file này, không phải ở `bill-panel.tsx`.
- Produces: `PaymentMethodFields` không giữ state. Props: `method: PayMethod`, `total: number`, `cashPart: number`, `cashText: string`, `bankText: string`, `givenText: string`, `mixedError: string | null`, `onMethod(m: PayMethod)`, `onCashText(t: string)`, `onBankText(t: string)`, `onGivenText(t: string)`. Tự tính tiền thối bằng `cashChange(cashPart, parseVnd(givenText))`.

Repo không có testing-library, test chỉ render tĩnh. Vì vậy `PaymentMethodFields` nhận `method` qua props để render được từng lựa chọn.

- [ ] **Step 1: Viết test**

```tsx
const fields = (over: Partial<Parameters<typeof PaymentMethodFields>[0]>) => renderToStaticMarkup(
  <PaymentMethodFields method="cash" total={1_000_000} cashPart={1_000_000} cashText="" bankText="" givenText=""
    mixedError={null} onMethod={vi.fn()} onCashText={vi.fn()} onBankText={vi.fn()} onGivenText={vi.fn()} {...over} />)

it('ba lựa chọn', () => {
  const html = fields({})
  for (const label of ['Tiền mặt', 'Chuyển khoản', 'Kết hợp']) expect(html).toContain(label)
})
it('tiền mặt: có ô tiền khách đưa, gợi ý theo tổng', () => {
  expect(fields({ cashPart: 123_000 })).toContain('130.000đ')
})
it('kết hợp: hai ô tiền; gợi ý và tiền thối theo PHẦN TIỀN MẶT', () => {
  const html = fields({ method: 'mixed', cashPart: 400_000, cashText: '400.000', bankText: '600.000', givenText: '500.000' })
  expect(html).toContain('id="pos-mixed-cash"')
  expect(html).toContain('id="pos-mixed-bank"')
  expect(html).toContain('Tiền thối lại cho khách')
  expect(html).toContain('100.000đ')
})
it('kết hợp còn lệch: hiện lỗi', () => {
  expect(fields({ method: 'mixed', cashPart: 0, mixedError: 'Tổng hai khoản phải đúng 1.000.000đ' })).toContain('Tổng hai khoản phải đúng 1.000.000đ')
})
it('kết hợp phần tiền mặt 0: ẩn ô tiền khách đưa', () => {
  expect(fields({ method: 'mixed', cashPart: 0 })).not.toContain('id="pos-cash-given"')
})
it('chuyển khoản: nhắc nghe loa', () => {
  expect(fields({ method: 'bank' })).toContain('nghe loa báo tiền')
})
```

Trong `bill-discount-ui.test.tsx` thêm: `view({})` có chữ `Kết hợp`; nút thu vẫn ghi `Xác nhận đã nhận 155.000đ`.

- [ ] **Step 2: Chạy để thấy đỏ**

`npx vitest run app/admin/pos/payment-method-fields.test.tsx app/admin/pos/bill-discount-ui.test.tsx`. Expected: FAIL, thiếu `PaymentMethodFields`.

- [ ] **Step 3: Viết `PaymentMethodFields` và nối `PaymentView`**

- Chuyển nguyên phần chọn phương thức và ô tiền (`bill-panel.tsx:863-923`) sang file mới. Lưới ba cột. Ô Kết hợp dùng `formatVndInput`. Đoạn nhắc chuyển khoản hiện ở `bank`, và ở `mixed` khi có phần chuyển khoản.
- `PaymentView` giữ state `method`, `cashText`, `bankText`, `givenText`, và `const [clientRequestId] = useState(() => crypto.randomUUID())`. Mã này giữ nguyên suốt lần mở màn, kể cả khi bấm lại sau lỗi: lần trước lỗi thì giao dịch đã huỷ, lần trước mất mạng mà đã thu thì server trả `already`.
- Gõ ô tiền mặt: `setCashText`, rồi `setBankText` theo `fillOtherSide(total, parseVnd(text))`. Gõ ô chuyển khoản thì ngược lại.
- `draft = buildPaymentLines(total, method, parseVnd(cashText), parseVnd(bankText))`, `cashPart = method === 'mixed' ? parseVnd(cashText) ?? 0 : method === 'cash' ? total : 0`, `bankPart = method === 'mixed' ? parseVnd(bankText) ?? 0 : method === 'bank' ? total : 0`.
- `change = cashChange(cashPart, given)`. `short` khi `cashPart > 0` và thiếu. `blocked = short || !!draft.error || !!discountError`.
- Nút thu gọi `onPay({ lines: draft.lines, cashGiven: cashPart > 0 ? given : null, clientRequestId })`.
- `mixedError` chỉ truyền khi đang `mixed` và đã gõ ít nhất một ô.
- `pos-client.tsx`: bỏ import `closeTableSessionsBulk`, thêm `collectTableBill`. `onPay` gọi `collectTableBill({ sessionIds: ids, ...payment })`. Giữ thông báo 'Bàn này vừa được máy khác chốt xong.' khi `res.already`.

- [ ] **Step 4: Chạy test và typecheck**

Lệnh ở Step 2, rồi `npx tsc --noEmit`. Expected: test PASS. tsc chỉ được báo lỗi ở `tables-client.tsx` hoặc `bill-detail.ts` nếu Task 7 chưa làm, không có lỗi ở `pos/`.

- [ ] **Step 5: Commit**

```bash
git add admin-web/app/admin/pos
git commit -m "feat: man Thanh toan POS them Ket hop"
```

---

### Task 7: `/staff/tables` và A04 đi qua RPC mới

**Files:**
- Modify: `admin-web/app/staff/tables/tables-client.tsx:16-17,46,164-187,300,369,397-402,457`
- Modify: `admin-web/lib/actions/bill-detail.ts:9,111-123`
- Modify: `admin-web/app/admin/bills/bill-drawer.tsx:86-125,175-181`
- Modify: `admin-web/lib/actions/table-session.ts:123-158,310-345`
- Modify: `admin-web/app/admin/pos/pos-client.tsx:475`
- Test: `admin-web/lib/actions/service-requests.test.ts:61-97,194-198`

**Interfaces:**
- Consumes: `collectTableBill` từ Task 5.
- Produces: `collectSessionBill(sessionIds: string[], instrument: 'cash' | 'bank', amount: number, clientRequestId: string): Promise<{ ok: true } | { ok: false; error: string }>`; `closeTableSession(sessionId: string, reason: 'staff_reset'): Promise<CloseSessionResult>`. `closeTableSessionsBulk` bị xoá.

- [ ] **Step 1: Sửa test trước**

Trong `service-requests.test.ts`: bỏ mọi ca gọi `closeTableSession(..., 'paid', ...)` và `closeTableSessionsBulk`. Giữ ca: phục vụ bị chặn `staff_reset`; chủ quán gọi được với đúng tham số:

```ts
expect((await closeTableSession('session-1', 'staff_reset')).ok).toBe(true)
expect(mocks.rpc).toHaveBeenCalledWith('close_table_session', { p_session_id: 'session-1', p_reason: 'staff_reset', p_instrument: null })
```

- [ ] **Step 2: Chạy để thấy đỏ**

`npx vitest run lib/actions/service-requests.test.ts`. Expected: FAIL, RPC đang nhận `p_instrument: undefined` chứ chưa phải `null`.

- [ ] **Step 3: Sửa code**

- `table-session.ts`: thu hẹp `closeTableSession`, xoá `closeTableSessionsBulk`. Giữ comment giải thích `staff_reset`.
- `pos-client.tsx:475`: `closeTableSession(s.session_id, 'staff_reset')`.
- `tables-client.tsx`: `Sheet` kiểu `pay` thêm `requestId: string`, tạo bằng `crypto.randomUUID()` ở hai chỗ `setSheet` (dòng 300, 369). Tách `doClose` thành `doCollect(list, instrument, requestId)` và `doReset(session)`. `doCollect` lấy `t = billTotals(list)`, gửi `lines: t.payable > 0 ? [{ instrument, amount: t.payable }] : []`, `cashGiven: null`. Sau lỗi `finish` không chạy nên sheet còn nguyên mã, bấm lại không tạo trùng.
- `bill-detail.ts`: `collectSessionBill` theo chữ ký mới, gọi `collectTableBill`, giữ kiểm UUID và `revalidatePath`. `amount` nhỏ hơn 0 hoặc không nguyên thì trả 'Số tiền không hợp lệ'.
- `bill-drawer.tsx`: `onCollect` đổi thành hai bước. Bước 1 đọc `getSessionsBill` như hiện tại, tính `due = row.amount - discount`, đặt state `pendingCollect = { instrument, amount: due, requestId: crypto.randomUUID(), text }`. Bước 2 là `ConfirmDialog` thay `window.confirm`; xác nhận thì gọi `collectSessionBill(row.sessionIds, instrument, amount, requestId)`. `requestId` giữ trong state đến khi thành công hoặc huỷ hộp. `window.confirm` của `onOrderAction` để nguyên, không thuộc phần này.

- [ ] **Step 4: Chạy test và typecheck**

`npx vitest run lib/actions/service-requests.test.ts lib/bill-detail.test.ts` rồi `npx tsc --noEmit`. Expected: PASS, tsc 0 lỗi.

- [ ] **Step 5: Kiểm không còn đường cũ**

Dùng Grep tìm `'paid', ` và `closeTableSessionsBulk` trong `admin-web/app` và `admin-web/lib`, loại file test. Expected: không còn lời gọi thu tiền bằng RPC cũ.

- [ ] **Step 6: Commit**

```bash
git add admin-web/app/staff/tables/tables-client.tsx admin-web/lib/actions/bill-detail.ts admin-web/app/admin/bills/bill-drawer.tsx admin-web/lib/actions/table-session.ts admin-web/app/admin/pos/pos-client.tsx admin-web/lib/actions/service-requests.test.ts
git commit -m "feat: staff tables va A04 thu qua collect_table_bill"
```

---

### Task 8: A04, Excel, phiếu in hiện từng khoản

**Files:**
- Modify: `admin-web/lib/daily-report.ts:24`, `admin-web/lib/daily-report.test.ts:34`
- Modify: `admin-web/lib/bills-report.ts:6-14,66-75,119-149,161-167`, `admin-web/lib/bills-report.test.ts`
- Modify: `admin-web/lib/bills-report-xlsx.ts:66,75`, `admin-web/lib/bills-report-xlsx.test.ts`
- Modify: `admin-web/app/admin/bills/bill-drawer.tsx` (mục mới trên danh sách lượt)
- Modify: `admin-web/lib/actions/table-session.ts:379-387`
- Modify: `admin-web/app/print/bill/print-bill.tsx:192-195`, `admin-web/app/print/bill/print-bill.test.tsx`

**Interfaces:**
- Consumes: `paymentRows`, `PaymentLine` từ Task 5; trường JSON từ Task 3.
- Produces: `BillsReportBill` và `BillRow` thêm `payments: PaymentLine[]`, `cashGiven: number | null`, `changeAmount: number | null`. `billCashBank(row: BillRow): { cash: number | null; bank: number | null }` trong `lib/bills-report.ts`. `SessionsBill` thêm `payments?: PaymentLine[]`, `cash_given?: number | null`, `change_amount?: number | null`.

Phiếu cuối ngày đọc `totals` từ server nên đã đúng theo khoản sau Task 3, không phải sửa.

- [ ] **Step 1: Viết test**

```ts
// lib/daily-report.test.ts:34
expect(instrumentLabel('mixed')).toBe('Kết hợp')

// lib/bills-report.test.ts
it('đọc payments, cash_given, change_amount; thiếu thì rỗng', () => {
  const raw = { bills: [{ instrument: 'mixed', payments: [{ instrument: 'cash', amount: 400000 }, { instrument: 'bank', amount: 600000 }], cash_given: 500000, change_amount: 100000 }, {}] }
  const [a, b] = parseBillsReport(raw).bills
  expect(a.payments).toHaveLength(2); expect([a.cashGiven, a.changeAmount]).toEqual([500000, 100000])
  expect(b.payments).toEqual([]); expect(b.cashGiven).toBeNull()
})
it('billCashBank: theo khoản; bill cũ theo phương thức; bill cũ trộn thì để trống', () => {
  const row = (over: Partial<BillRow>) => ({ kind: 'paid', amount: 1000, instrument: 'cash', payments: [], ...over }) as BillRow
  expect(billCashBank(row({ instrument: 'mixed', payments: [{ instrument: 'cash', amount: 400 }, { instrument: 'bank', amount: 600 }] }))).toEqual({ cash: 400, bank: 600 })
  expect(billCashBank(row({}))).toEqual({ cash: 1000, bank: null })
  expect(billCashBank(row({ instrument: 'bank' }))).toEqual({ cash: null, bank: 1000 })
  expect(billCashBank(row({ instrument: 'mixed' }))).toEqual({ cash: null, bank: null })
  expect(billCashBank(row({ kind: 'waiting', instrument: null }))).toEqual({ cash: null, bank: null })
})

// lib/bills-report-xlsx.test.ts: fixture thêm một bill mixed có payments
const header = (ws.getRow(1).values as unknown[]).slice(1)
expect(header).toEqual(expect.arrayContaining(['Phương thức', 'Tiền mặt', 'Chuyển khoản']))
expect(mixedRow[header.indexOf('Phương thức')]).toBe('Kết hợp')
expect(mixedRow[header.indexOf('Tiền mặt')]).toBe(400000)
expect(mixedRow[header.indexOf('Chuyển khoản')]).toBe(600000)
```

```tsx
// app/print/bill/print-bill.test.tsx
it('in lại bill đã thu: từng khoản, khách đưa, tiền thối', () => {
  const bill = { ...buildTestBill(store, now), payments: [{ instrument: 'cash' as const, amount: 400_000 }, { instrument: 'bank' as const, amount: 600_000 }], cash_given: 500_000, change_amount: 100_000 }
  const html = renderToStaticMarkup(<PrintBill bill={bill} />)
  for (const t of ['Tiền mặt', 'Chuyển khoản', 'Khách đưa', 'Tiền thối', '600.000']) expect(html).toContain(t)
})
it('bill chưa thu: không có dòng khoản', () => {
  expect(renderToStaticMarkup(<PrintBill bill={buildTestBill(store, now)} />)).not.toContain('Khách đưa')
})
```

- [ ] **Step 2: Chạy để thấy đỏ**

`npx vitest run lib/daily-report.test.ts lib/bills-report.test.ts lib/bills-report-xlsx.test.ts app/print/bill/print-bill.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Viết code**

- `instrumentLabel`: `mixed` là 'Kết hợp'.
- `parseBillsReport`: đọc `payments` qua hàm lọc chỉ giữ phần tử có `instrument` là `cash`, `bank`. `buildBillRows`: bill đã thu mang 3 trường mới; dòng chờ thu và đã huỷ gán `payments: []`, hai trường kia `null`.
- `billCashBank`: chỉ dòng `kind === 'paid'`. Có `payments` thì cộng theo phương tiện, không có phần nào thì `null`. Không có `payments`: `cash` hoặc `bank` thì trả đủ `amount` vào đúng cột, còn lại cả hai `null`.
- Excel: thêm hai cột tiền `{ header: 'Tiền mặt', width: 13, style: { numFmt: MONEY } }` và `'Chuyển khoản'` ngay sau `'Phương thức'`.
- Drawer: `row.kind === 'paid'` và `paymentRows({ payments: row.payments, cashGiven: row.cashGiven, changeAmount: row.changeAmount })` có dữ liệu thì hiện khối "Các khoản đã thu", mỗi dòng nhãn + `formatVND`. Đặt trên khối Chuyển bàn.
- `print-bill.tsx`: sau dòng tổng (dòng 195) in các dòng `paymentRows` bằng `.row`, nhãn và số `dong(...)`.

- [ ] **Step 4: Chạy test**

Lệnh ở Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add admin-web/lib admin-web/app/admin/bills/bill-drawer.tsx admin-web/app/print/bill
git commit -m "feat: A04, Excel, phieu in hien tung khoan thu"
```

---

### Task 9: Hồi quy, script kiểm cũ, checklist

**Files:**
- Modify: `docs/testing/chuyen-ban-giam-gia/sql/gg-verify.sql`, `docs/testing/chuyen-ban-giam-gia/sql/gg2-verify.sql`
- Create: `docs/testing/dot1/thu-tien-ket-hop.md`
- Modify: `CLAUDE.md` (thêm dòng cuối §10)

`bl4-postgres.integration.mjs` chỉ gọi `staff_reset` và test BL4 chỉ dựng DB tới mig 83, nên không phải sửa. `108_*`, `110_*`, `100_*` ghim vào file mig của chính chúng nên cũng không phải sửa. Chạy lại ở Step 3 để chắc.

- [ ] **Step 1: Đổi hai script verify**

Sau 112b, `close_table_session(..., 'paid', ...)` bị chặn. Thêm vào đầu mỗi file:

```sql
-- Thu đúng số server tính: tiền chưa thu trừ giảm giá của phiên đang mở.
CREATE FUNCTION pg_temp.pay(p_ids uuid[], p_instrument text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_due bigint;
BEGIN
  SELECT COALESCE(SUM(public.session_unpaid_subtotal(s.id)
    - CASE WHEN s.status = 'open' THEN public.bill_discount_amount(public.session_unpaid_subtotal(s.id), s.bill_discount_type, s.bill_discount_value) ELSE 0 END), 0)
    INTO v_due FROM public.table_sessions s WHERE s.id = ANY(p_ids);
  RETURN public.collect_table_bill(p_ids,
    CASE WHEN v_due > 0 THEN jsonb_build_array(jsonb_build_object('instrument', p_instrument, 'amount', v_due)) ELSE '[]'::jsonb END,
    NULL, gen_random_uuid());
END $$;
```

Đổi mọi `close_table_session(x, 'paid', y)` thành `pg_temp.pay(ARRAY[x], y)`, gồm cả chuỗi `format(...)` ở `gg-verify.sql:551`. Đổi `close_table_sessions_bulk(ARRAY[...], 'paid', y)` ở dòng 643, 704 thành `pg_temp.pay(ARRAY[...], y)`, và bỏ phần so `r->>'sessions'` ở dòng 645. Dòng `staff_reset` giữ nguyên. Ghi ở đầu file: chỉ chạy được sau khi mig 112b đã áp.

- [ ] **Step 2: Viết `docs/testing/dot1/thu-tien-ket-hop.md`**

Theo mẫu `docs/testing/chuyen-ban-giam-gia/GG-1.md`, có cảnh báo quán thật và ghi lại số tiền giả. Bảng bài:

| Bài | Việc | Mong đợi |
|---|---|---|
| 1 | Thu tiền mặt, khách đưa dư | Báo tiền thối đúng; A04 ghi Tiền mặt |
| 2 | Thu chuyển khoản | A04 ghi Chuyển khoản |
| 3 | Bill 1.000.000: Kết hợp, TM 400.000, gõ xong ô CK tự thành 600.000, khách đưa 500.000 | Thối 100.000 |
| 4 | Xem bài 3 ở A04, Excel, phiếu cuối ngày, In lại hoá đơn | Nhãn "Kết hợp"; từng khoản đúng; thẻ TM và CK cộng đúng doanh thu |
| 5 | Kết hợp, gõ sai tổng | Nút thu khoá, có chữ đỏ |
| 6 | Bill có giảm giá %, thu Kết hợp | Tổng hai ô đúng số sau giảm |
| 7 | Gộp 2 mâm, thu Kết hợp | Một dòng ở A04 |
| 8 | Mở màn Kết hợp, máy khác thêm món, rồi bấm thu | Báo số tiền không khớp; bill chưa đóng |
| 9 | Hai tab cùng thu một bàn | Tab sau báo đã chốt; A04 chỉ một khoản |
| 10 | Thu ở `/staff/tables` và ở A04 | Doanh thu đúng; hộp xác nhận trong app, không phải hộp trình duyệt |
| 11 | Bill đã thu trước khi có 112a | Hiện như cũ |
| 12 | Bỏ bàn | Vẫn chạy, không vào doanh thu |
| 13 | Sau khi áp 112b: tab POS cũ chưa tải lại bấm thu | Báo tải lại trang; tải lại thì thu được |

Cuối file có SQL chỉ đọc cho controller, kết quả phải 0 dòng:

```sql
SELECT bp.id FROM bill_payments bp
LEFT JOIN LATERAL (SELECT COALESCE(SUM(amount), 0) s FROM bill_payment_lines WHERE payment_id = bp.id) l ON true
LEFT JOIN LATERAL (SELECT COALESCE(SUM(total_amount), 0) s FROM orders WHERE bill_payment_id = bp.id AND status <> 'cancelled') o ON true
WHERE l.s <> bp.total_amount OR o.s <> bp.total_amount;
```

- [ ] **Step 3: Thêm dòng quyết định vào CLAUDE.md §10, chạy hồi quy**

Dòng mới ghi: `bill_payments`, lõi `close_table_session_core`, thứ tự 112a → Vercel → 112b, chặn UPDATE thẳng cột tiền, `source` luôn `pos` với `collect_table_bill`.

```powershell
$env:PGLITE_MODULE=(Resolve-Path 'admin-web/node_modules/@electric-sql/pglite/dist/index.js').Path
node --test supabase/tests/100_bills_report.test.mjs supabase/tests/103b_baseline_prod_drift.test.mjs supabase/tests/107_bill_discount.test.mjs supabase/tests/108_bill_discount_patch_rpcs.test.mjs supabase/tests/110_block_session_order_single_payment.test.mjs supabase/tests/112a_collect_table_bill.test.mjs supabase/tests/112a_single_order_payment.test.mjs supabase/tests/112a_payment_readers.test.mjs supabase/tests/112b_lock_old_paid_path.test.mjs
cd admin-web; npx vitest run; npx tsc --noEmit; npx eslint app/admin/pos app/admin/bills app/staff/tables lib
```

Expected: tất cả PASS, tsc 0 lỗi.

- [ ] **Step 4: Commit**

```bash
git add docs/testing CLAUDE.md
git commit -m "docs: checklist thu tien ket hop, doi script verify sang RPC moi"
```

---

## Controller (không phải việc của agent code)

Một người làm, theo đúng thứ tự. Trước đó agent review độc lập đã xong.

1. **Áp 112a** lên prod. Mig 111 phải có trước. Chuỗi neo không khớp thì file RAISE và không có gì được ghi.
2. **Merge vào `main`, chờ Vercel lên.** Đường cũ vẫn chạy nên tab đang mở không bị ảnh hưởng.
3. **Anh Tú test** bài 1–12 ở `docs/testing/dot1/thu-tien-ket-hop.md`. Chạy SQL bất biến cuối checklist.
4. **Nhờ quán tải lại POS**, rồi **áp 112b**.
5. **Anh Tú test** bài 13. Chạy lại `gg-verify.sql`, `gg2-verify.sql` (giao dịch ROLLBACK).
6. Dừng, chờ anh Tú báo PASS. Đợt 3 chỉ bắt đầu sau đó.
