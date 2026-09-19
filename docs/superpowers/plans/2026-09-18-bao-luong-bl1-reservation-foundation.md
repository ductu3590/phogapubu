# Bảo Lương BL-1 — Nền tảng đặt bàn Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây lớp reservation an toàn ở DB/RPC để Bảo Lương nhận, phân bổ, đổi/hủy/no-show và nhận khách mà không mở sẵn bill hoặc làm hồi quy Pubu.

**Architecture:** Reservation là lịch tương lai tách khỏi `table_sessions`. Chỉ `arrive_reservation` của owner mới biến bàn đã phân bổ thành một session/mâm `is_open_ordering=true`; thao tác khóa transaction và idempotent. Customer không ghi bảng trực tiếp: opaque token chỉ truy cập booking của chính họ; owner quyết định phân bàn trong RPC.

**Tech Stack:** PostgreSQL/Supabase migrations + RLS + SECURITY DEFINER RPC, Node/PGlite `node:test`. Không làm UI Mini App/POS ở BL-1.

**Spec:** `docs/superpowers/specs/2026-09-10-bao-luong-reservation-pos-workflow-design.md` (§3.2, §4–5, §7.1–7.2, §9, §11 BL-1).

## Global Constraints

- Migration mới bắt đầu `052`; không sửa `001`–`051` đã áp remote.
- Timestamp là `timestamptz` UTC; slot/giờ/cutoff tính server-side theo `Asia/Ho_Chi_Minh`.
- Không hardcode slug; capability/giới hạn lấy từ `stores` + `store_workflow_settings` theo `store_id`.
- `is_accepting_orders` không chặn booking tương lai; chỉ `reservations_enabled` quyết định nhận booking.
- Không tự phân bàn/xác nhận/no-show; không xuất bàn trống, không tạo order/preorder/UI/OA/ZNS trong BL-1.
- RLS chặn ghi trực tiếp; mọi thay đổi booking append event audit. Staff và owner khác quán bị chặn ở RPC.
- Sau mỗi task, cập nhật `docs/testing/bao-luong/SPRINT-BL-1.md`, dừng chờ PASS trước task kế tiếp.

---

## File map và interfaces

| File | Trách nhiệm |
|---|---|
| `supabase/migrations/052_reservation_schema.sql` | Tables reservation/phân bổ/event, state guard, RLS, index/publication. |
| `supabase/migrations/053_reservation_customer_rpcs.sql` | Slot server-side, create/read/change/cancel customer bằng opaque token. |
| `supabase/migrations/054_reservation_operator_rpcs.sql` | Owner manual/confirm/reject/change/no-show/list và conflict bàn. |
| `supabase/migrations/055_reservation_arrival.sql` | `arrive_reservation`: tạo session/mâm chung idempotent. |
| `supabase/migrations/056_reservation_session_completion.sql` | Nối close bill `paid` sang `reservation.completed`. |
| `supabase/tests/052_reservation_foundation.test.mjs` | PGlite schema/RLS/slot/token/idempotency. |
| `supabase/tests/054_reservation_operator_flow.test.mjs` | PGlite allocation/conflict/change/arrival/completion. |
| `admin-web/lib/actions/reservations.ts` | Typed owner-only wrapper chuẩn bị BL-2, không render UI. |
| `docs/testing/bao-luong/SPRINT-BL-1.md` | File test riêng, tạo từ Task 1 và cập nhật sau từng task. |

`reservations` có `store_id`, status (`pending`, `confirmed`, `arrived`, `completed`, `rejected`, `cancelled_by_customer`, `cancelled_by_store`, `no_show`), customer name/phone, `zalo_user_id` tham chiếu, pax, arrival, note, `client_request_id`, hash token, snapshot năm giới hạn booking, request change và `session_id` nullable. `reservation_tables` giữ cả `store_id` để hai composite FK ép reservation và table cùng quán, cùng hold half-open `[arrival_at, arrival_at + planning_hold_minutes)`; `reservation_events` append-only với actor/event/before/after/note.

RPC tạo bởi plan:

```sql
get_reservation_slots(uuid, date) returns jsonb
create_reservation(uuid, text, text, integer, timestamptz, text, text, uuid) returns jsonb
get_customer_reservation(uuid, text) returns jsonb
request_reservation_change(uuid, text, timestamptz, integer, text) returns jsonb
cancel_customer_reservation(uuid, text, text) returns jsonb
create_manual_reservation(uuid, jsonb) returns jsonb
confirm_reservation(uuid, uuid[], text) returns jsonb
reject_reservation(uuid, text) returns jsonb
resolve_reservation_change(uuid, boolean, uuid[], text) returns jsonb
mark_reservation_no_show(uuid, text) returns jsonb
arrive_reservation(uuid) returns jsonb
list_store_reservations(uuid, timestamptz, timestamptz) returns jsonb
```

### Task 1: Schema reservation, allocation, event audit và RLS

**Files:**
- Create: `supabase/migrations/052_reservation_schema.sql`
- Create: `supabase/tests/052_reservation_foundation.test.mjs`
- Create: `docs/testing/bao-luong/SPRINT-BL-1.md`
- Modify: `TESTING.md`

**Produces:** Tables `reservations`, `reservation_tables`, `reservation_events`; `reservation_status_guard`; helper event internal.

- [x] **Step 1: Viết test đỏ PGlite**

Fixture theo `050_pos_gate_service_requests.test.mjs` có `stores`, `tables`, `table_sessions`, `session_tables`, workflow và operator. Thêm test:

```js
test('anon không SELECT/INSERT/UPDATE trực tiếp reservation', async () => {
  await db.exec('SET LOCAL ROLE anon')
  await rejected(() => db.query('select * from reservations'), /permission denied/)
  await rejected(() => db.query("insert into reservations(store_id,status) values($1,'pending')", [store]), /permission denied/)
})

test('status và table allocation sai quán bị chặn', async () => {
  await rejected(() => db.query("insert into reservations(store_id,status,customer_name,customer_phone,party_size,arrival_at) values($1,'completed','A','0900',2,now())", [store]), /reservation_status_transition/)
  await rejected(() => assign(reservation, otherStoreTable), /cùng quán/)
})
```

- [x] **Step 2: Chạy đỏ**

```powershell
$modulePath=(Resolve-Path 'admin-web/node_modules/@electric-sql/pglite/dist/index.js').Path
$env:PGLITE_MODULE=([System.Uri]::new($modulePath)).AbsoluteUri
node --test supabase/tests/052_reservation_foundation.test.mjs
```

Expected: FAIL vì migration 052 chưa tồn tại.

- [x] **Step 3: Implement migration 052**

Tạo constraints pax/hold/actor; trigger insert chỉ chấp nhận booking mới có `status='pending'`; trigger update chỉ cho phép transition:

```text
pending → confirmed | rejected | cancelled_by_customer | cancelled_by_store
confirmed → arrived | cancelled_by_customer | cancelled_by_store | no_show
arrived → completed | cancelled_by_store
```

Index `(store_id, arrival_at)` và `(table_id, hold_starts_at, hold_ends_at)`. Allocation/history không bị xóa; conflict về sau chỉ xét status `confirmed`. Bật RLS/revoke mọi ghi `anon`/`authenticated`; chỉ operator đúng store đọc event. Add tables vào publication. Raw customer token không lưu vào event/log. Vì trigger insert chặn mọi trạng thái khác `pending`, test trạng thái `completed` ở Step 1 phải fail cả khi chạy với DB owner trong PGlite, không chỉ nhờ RLS.

- [x] **Step 4: Chạy xanh, tạo Test 1 và commit**

```powershell
node --test supabase/tests/052_reservation_foundation.test.mjs
git add supabase/migrations/052_reservation_schema.sql supabase/tests/052_reservation_foundation.test.mjs docs/testing/bao-luong/SPRINT-BL-1.md TESTING.md
git commit -m "feat: reservation schema va audit"
```

Expected: 0 fail; RLS, FK và state guard được chứng minh.

`SPRINT-BL-1.md` ghi Test 1 (schema/RLS/audit) và trạng thái Task 1 chờ PASS; `TESTING.md` chỉ thêm link `⏳`. Dừng chờ anh Tú PASS trước Task 2.

### Task 2: Slot server-side và booking customer idempotent

**Files:**
- Create: `supabase/migrations/053_reservation_customer_rpcs.sql`
- Modify: `supabase/tests/052_reservation_foundation.test.mjs`

**Produces:** Five customer RPC ở interface map; dùng `customer_token_hash` SHA-256, không dùng Zalo UID để authorize.

- [x] **Step 1: Viết test đỏ**

Fixture serving-hours `11:00–22:00`, min 30, horizon 7, interval 15. Test slot được sinh từ server, không chấp nhận 10:07, ngày thứ 8 hay arrival dưới 30 phút:

```js
test('slot theo Asia/Ho_Chi_Minh, 15 phút và nằm trong ca', async () => {
  const slots = await slotsFor(store, '2026-09-20')
  assert.equal(slots[0].local_time, '11:00')
  assert.equal(slots.at(-1).local_time, '21:45')
})

test('create idempotent, bỏ qua is_accepting_orders và không lộ hash', async () => {
  const first = await createAsAnon(payload)
  const retry = await createAsAnon(payload)
  assert.equal(first.reservation_id, retry.reservation_id)
  assert.ok(first.customer_token)
  assert.equal('customer_token_hash' in first, false)
})
```

- [x] **Step 2: Chạy đỏ**

Run Task 1 command sau khi loader thêm migration 053. Expected: FAIL vì RPC chưa tồn tại.

- [x] **Step 3: Implement một nguồn validation**

`get_reservation_slots` nhận store/date local, convert timezone server-side và sinh slot theo `serving_hours`. `create_reservation` lock workflow, yêu cầu `reservations_enabled`, validate name/phone/pax/client request/slot/minimum/horizon; không gọi `store_accepting_now`. Sinh token random, chỉ lưu hash, snapshot workflow, event `created`; unique `(store_id, client_request_id)` trả booking cũ khi retry mà không thêm event.

Read/change/cancel customer so hash token; change chỉ lưu `requested_arrival_at`, `requested_party_size`, `change_note` và giữ allocation cũ. Customer chỉ cancel pending/confirmed trước arrival; booking quá giờ pending không tự hủy.

- [x] **Step 4: Chạy xanh và regression**

```powershell
node --test supabase/tests/052_reservation_foundation.test.mjs supabase/tests/049_store_workflow_settings.test.mjs supabase/tests/050_pos_gate_service_requests.test.mjs
git add supabase/migrations/053_reservation_customer_rpcs.sql supabase/tests/052_reservation_foundation.test.mjs
git commit -m "feat: reservation slots va customer rpc"
```

Expected: all pass; Pubu workflow không thay đổi.

### Task 3: Owner phân bổ bàn, đổi/hủy/no-show và ngoại lệ tay

**Files:**
- Create: `supabase/migrations/054_reservation_operator_rpcs.sql`
- Create: `supabase/tests/054_reservation_operator_flow.test.mjs`

**Produces:** Six owner/MEVO RPC trong interface map, gồm `create_manual_reservation`.

- [x] **Step 1: Viết test đỏ role/conflict/change**

```js
test('staff và owner quán khác không xác nhận/no-show được', async () => {
  await login(staff)
  await rejected(() => confirm(reservation, [table1], null), /Chỉ chủ quán/)
  await login(otherOwner)
  await rejected(() => noShow(reservation, null), /Không có quyền/)
})

test('confirm chặn overlap booking và phiên đang mở', async () => {
  await login(owner)
  await confirm(reservationA, [table1, table2], 'đoàn 10 khách')
  await rejected(() => confirm(reservationB, [table1], null), /đã được giữ/)
  await openSessionFor(table3)
  await rejected(() => confirm(reservationB, [table3], null), /đang có khách/)
})
```

- [x] **Step 2: Chạy đỏ**

```powershell
node --test supabase/tests/054_reservation_operator_flow.test.mjs
```

Expected: FAIL vì migration 054 chưa tồn tại.

- [x] **Step 3: Implement transactional allocation**

Owner RPC lock reservation, kiểm role owner/MEVO; staff bị từ chối. MEVO explicit store/actor event. `confirm_reservation` bắt ít nhất một bàn active/cùng store, khoá row bàn theo thứ tự ID, tính hold end snapshot `planning_hold_minutes`, chặn overlap allocation `confirmed` và `open_session_id_for_table`. Sau toàn bộ checks mới replace allocation cũ, update status/timestamps và append event.

Trả gợi ý `ceil(party_size/default_table_capacity)`, nhưng không tự chọn bàn. Manual create chỉ owner/MEVO, cho phép vượt min/horizon/slot/giờ phục vụ, vẫn audit lý do. Reject, store cancel, no-show và resolve change giữ lịch sử; no-show/cancel giải phóng qua status chứ không DELETE allocation/event.

- [x] **Step 4: Chạy xanh và commit**

```powershell
node --test supabase/tests/052_reservation_foundation.test.mjs supabase/tests/054_reservation_operator_flow.test.mjs
git add supabase/migrations/054_reservation_operator_rpcs.sql supabase/tests/054_reservation_operator_flow.test.mjs
git commit -m "feat: reservation owner allocation va lifecycle"
```

Expected: role, conflict và allocation atomic PASS.

### Task 4: Nhận khách idempotent, mâm mở gọi chung và hoàn tất bill

**Files:**
- Create: `supabase/migrations/055_reservation_arrival.sql`
- Create: `supabase/migrations/056_reservation_session_completion.sql`
- Modify: `supabase/tests/054_reservation_operator_flow.test.mjs`

**Produces:** `arrive_reservation`; close bill paid cập nhật reservation completed.

- [x] **Step 1: Viết test đỏ arrival/lifecycle**

```js
test('arrival tạo đúng một mâm mở gọi chung và idempotent', async () => {
  await login(owner)
  const first = await arrive(twoTableReservation)
  const retry = await arrive(twoTableReservation)
  assert.equal(first.session_id, retry.session_id)
  assert.equal((await countOpenSessions()).rows[0].n, 1)
  assert.equal((await session(first.session_id)).is_open_ordering, true)
})

test('arrival không đè phiên cũ; staff reset giữ arrived còn paid complete booking', async () => {
  await openSessionFor(table1)
  await rejected(() => arrive(reservationOnTable1), /đang có khách/)
  const reset = await arrive(reservationOnTable2)
  await close(reset.session_id, 'staff_reset')
  assert.equal(await reservationStatus(reservationOnTable2), 'arrived')
  const paid = await arrive(reservationOnAnotherTable)
  await close(paid.session_id, 'paid')
  assert.equal(await reservationStatus(reservationOnAnotherTable), 'completed')
})
```

- [x] **Step 2: Chạy đỏ**

Run Task 3 command. Expected: FAIL vì arrival/completion chưa có.

- [x] **Step 3: Implement migration 055**

`arrive_reservation` chỉ owner. Lock booking và trả `session_id` cũ nếu already arrived/completed. Với confirmed booking, sort/lock allocation, check `open_session_id_for_table` lần cuối, tạo một `table_sessions` (bàn đầu là base, `opened_by='staff'`, `is_open_ordering=true`) và toàn bộ `session_tables`, rồi update reservation arrived/session/event trong một transaction. Không tạo order/in phiếu. Conflict rollback toàn bộ.

- [x] **Step 4: Implement migration 056**

Recreate `close_table_session`/bulk từ migration 050 nguyên vẹn, thêm sau close `paid`: reservation `arrived` cùng `session_id` thành `completed` với event/timestamp/actor. `staff_reset`, `expired`, `merged` không complete booking; giữ owner-only và pending-order gate BL-0.

- [x] **Step 5: Chạy regression, commit**

```powershell
node --test supabase/tests/052_reservation_foundation.test.mjs supabase/tests/054_reservation_operator_flow.test.mjs supabase/tests/049_store_workflow_settings.test.mjs supabase/tests/050_pos_gate_service_requests.test.mjs supabase/tests/050a_kitchen_service_request_queue.test.mjs
git add supabase/migrations/055_reservation_arrival.sql supabase/migrations/056_reservation_session_completion.sql supabase/tests/054_reservation_operator_flow.test.mjs
git commit -m "feat: reservation arrival va bill completion"
```

Expected: 0 fail, không hồi quy Pubu/BL-0.

### Task 5: Typed Admin contract và cổng nghiệm thu BL-1

**Files:**
- Create: `admin-web/lib/actions/reservations.ts`
- Create: `admin-web/lib/actions/reservations.test.ts`
- Modify: `docs/testing/bao-luong/SPRINT-BL-1.md`
- Modify: `TESTING.md`

**Produces:** `listReservations`, `confirmReservation`, `rejectReservation`, `arriveReservation`, `markReservationNoShow`; không render page/queue.

- [x] **Step 1: Viết test action đỏ**

```ts
it('owner dùng store operator, không tin store client truyền', async () => {
  mocks.operator.value = { role: 'store_owner', storeId: 'store-1' }
  await listReservations(range)
  expect(mocks.rpc).toHaveBeenCalledWith('list_store_reservations', { p_store_id: 'store-1', p_starts_at: range.startsAt, p_ends_at: range.endsAt })
})

it('staff không gọi RPC quyết định booking', async () => {
  mocks.operator.value = { role: 'store_staff', storeId: 'store-1' }
  await expect(arriveReservation('reservation-1')).resolves.toEqual({ ok: false, error: 'Chỉ chủ quán được xử lý đặt bàn' })
  expect(mocks.rpc).not.toHaveBeenCalled()
})
```

- [x] **Step 2: Chạy đỏ, implement, chạy gates**

Action dùng `requireOperator()` + session-bound `createClient()`, fail closed với staff, map RPC snake_case sang `ReservationRow`; không `createAdminClient`, không UI.

```powershell
cd admin-web
npm test -- --run lib/actions/reservations.test.ts
npm test
npx tsc --noEmit
```

Expected: targeted test đỏ trước implementation; sau implementation toàn bộ Admin/typecheck PASS.

- [x] **Step 3: Viết file test riêng, commit và dừng**

`SPRINT-BL-1.md`: migrations 052–056, PGlite command, Test 1 schema/RLS, Test 2 slot/timezone, Test 3 token/idempotency/change-cancel, Test 4 owner conflict/manual exception, Test 5 arrival/multi-table/completion, Test 6 Pubu regression. `TESTING.md` chỉ thêm `⏳` link.

```powershell
git add admin-web/lib/actions/reservations.ts admin-web/lib/actions/reservations.test.ts docs/testing/bao-luong/SPRINT-BL-1.md TESTING.md
git commit -m "feat: reservation foundation contracts"
```

Nói: *“Xong rồi anh, test theo `docs/testing/bao-luong/SPRINT-BL-1.md` — Test 1–6 nhé”*. Dừng chờ `BL-1 PASS`; không làm BL-2/BL-3.

## Self-review

- Task 1: schema/RLS/audit; Task 2: slot/timezone/token/customer; Task 3: owner allocation/lifecycle; Task 4: arrival/mâm/completion; Task 5: typed BL-2 contract và gate.
- Explicitly deferred: queue/nhắc/OA/POS UI BL-2; form/menu preorder/QR copy BL-3; không có availability UI.
- `create_order`, workflow Pubu và migrations cũ không bị sửa; mọi control theo store/role.
