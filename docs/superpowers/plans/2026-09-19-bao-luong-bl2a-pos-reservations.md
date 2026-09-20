# Bảo Lương BL-2A — POS/Admin Mobile đặt bàn Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.
> Các bước dùng checkbox (`- [ ]`) để theo dõi.

**Goal:** Cho chủ quán xử lý toàn bộ vòng đời đặt bàn trên điện thoại và POS, đồng bộ nhiều màn
hình, có nhắc gộp/Snooze nhưng không tự quyết thay chủ quán.

**Architecture:** Giữ reservation BL-1 là source of truth và bổ sung đúng một migration vận hành.
Admin Mobile và POS dùng chung typed server actions, queue classifier và watcher realtime + polling
2 giây. DB khóa transaction cho phân/đổi bàn; UI chỉ trình bày gợi ý và giữ lỗi thao tác.

**Tech Stack:** PostgreSQL/Supabase SECURITY DEFINER RPC + RLS, Next.js 16 App Router, React 19,
TypeScript, Supabase Realtime, Vitest và Node/PGlite.

**Specs:**

- `docs/superpowers/specs/2026-09-10-bao-luong-reservation-pos-workflow-design.md`
- `docs/superpowers/specs/2026-09-19-bao-luong-bl2a-pos-reservations-design.md`

## Global Constraints

- Migration mới bắt đầu ở `057`; không sửa migration `001`–`056` đã áp remote.
- Không hardcode slug/ID Bảo Lương. Capability lấy từ `store_workflow_settings` theo store.
- Chỉ owner đúng store ra quyết định; staff/anon/owner quán khác bị chặn cả server action lẫn RPC.
- Timestamp lưu UTC; hiển thị và nhập theo `Asia/Ho_Chi_Minh`.
- Không OA/ZNS, preorder, Mini App, payment hay kitchen/order schema trong BL-2A.
- Không tự no-show/hủy/xác nhận/chọn bàn. Snooze chỉ trì hoãn nhắc, không đổi hold hoặc status.
- Realtime không được là đường duy nhất: mọi queue watcher phải có polling action đã auth mỗi 2 giây,
  focus/reconnect refresh và chống snapshot cũ ghi đè event mới.
- Đọc tài liệu App Router tương ứng trong `admin-web/node_modules/next/dist/docs/` trước khi sửa
  page/layout/client boundary, theo `admin-web/AGENTS.md`.
- Sau **mỗi task**: cập nhật `docs/testing/bao-luong/SPRINT-BL-2A.md`, chỉ cập nhật link/trạng thái
  trong `TESTING.md`, commit, dừng và chờ anh Tú xác nhận `Task N PASS`.

---

## File map và contracts

| File | Trách nhiệm |
|---|---|
| `supabase/migrations/057_reservation_operations_queue.sql` | Snooze fields/events, queue snapshot, atomic reschedule và Snooze RPC. |
| `supabase/tests/057_reservation_operations_queue.test.mjs` | PGlite tests quyền, unresolved queue, conflict, Snooze và audit. |
| `admin-web/lib/actions/reservations.ts` | Typed wrappers cho queue/create/resolve/reschedule/Snooze. |
| `admin-web/lib/actions/reservations.test.ts` | Chứng minh owner scope/payload/error mapping. |
| `admin-web/lib/reservation-queue.ts` | Pure classification/sort/bucket/reminder group. |
| `admin-web/lib/reservation-queue.test.ts` | Unit tests timezone/status/30 phút/bucket 5 phút. |
| `admin-web/lib/reservation-queue-watcher.ts` | Realtime + authenticated polling/focus/reconnect, revision guard. |
| `admin-web/lib/reservation-queue-watcher.test.ts` | Fake timers test event/poll/dispose/race. |
| `admin-web/app/admin/reservations/page.tsx` | Server load workflow/floor/initial queue; owner-only fail closed. |
| `admin-web/app/admin/reservations/reservations-client.tsx` | Mobile-first queue state/actions/sheets/reminder banner. |
| `admin-web/app/admin/reservations/reservation-card.tsx` | Card trạng thái và action theo lifecycle. |
| `admin-web/app/admin/reservations/reservation-table-picker.tsx` | Chọn bàn theo khu/snapshot, mobile và POS dùng chung. |
| `admin-web/app/admin/reservations/reservation-form.tsx` | Tạo booking tay/đổi giờ-số khách. |
| `admin-web/app/admin/reservations/reservation-ui.ts` | Pure view model, validation local và định dạng giờ. |
| `admin-web/app/admin/cashier/page.tsx` | Server load initial reservation queue cho POS. |
| `admin-web/app/admin/cashier/cashier-client.tsx` | Queue compact, mở picker và mở bill sau arrival. |
| `admin-web/app/admin/cashier/reservation-queue-panel.tsx` | Bản POS của queue dùng chung contracts. |
| `docs/testing/bao-luong/SPRINT-BL-2A.md` | Checklist tăng dần sau từng task. |

RPC mới:

```sql
list_reservation_queue(uuid, timestamptz, timestamptz) returns jsonb
reschedule_reservation(uuid, timestamptz, integer, uuid[], text) returns jsonb
snooze_reservation_reminders(uuid[], integer) returns jsonb
```

`ReservationRow` bổ sung:

```ts
reminderSnoozedUntil: string | null
reminderSnoozedBy: string | null
```

Queue load mặc định lấy terminal từ 24 giờ trước và booking tương lai đến hết 7 ngày, nhưng RPC
luôn trả mọi trạng thái unresolved (`pending`, `change_requested`, `confirmed`, `arrived`) bất kể
`arrival_at`; vì vậy booking cũ không biến mất khỏi việc cần xử lý.

---

## Task 1: Migration 057 — snapshot vận hành, đổi lịch/bàn và Snooze

**Files:**

- Create: `supabase/migrations/057_reservation_operations_queue.sql`
- Create: `supabase/tests/057_reservation_operations_queue.test.mjs`
- Create: `docs/testing/bao-luong/SPRINT-BL-2A.md`
- Modify: `TESTING.md`

**Produces:** Ba RPC mới, hai cột Snooze và hai event audit; không đổi RPC customer.

- [x] **Step 1: Viết test đỏ PGlite**

Reuse fixture/loader của test 054. Test tối thiểu:

```js
test('queue luôn giữ unresolved cũ nhưng chỉ lấy terminal trong cửa sổ', async () => {
  const rows = await listQueue(store, recentSince, futureUntil)
  assert.ok(rows.some(row => row.reservation_id === oldPending))
  assert.ok(rows.some(row => row.reservation_id === oldConfirmed))
  assert.ok(!rows.some(row => row.reservation_id === oldCompleted))
})

test('reschedule đổi giờ và allocation nguyên tử, conflict giữ nguyên bàn cũ', async () => {
  await rejected(() => reschedule(booking, clashAt, [busyTable]), /đã được giữ|đang có khách/)
  assert.deepEqual(await activeTables(booking), [oldTable])
  await reschedule(booking, freeAt, [newTable])
  assert.deepEqual(await activeTables(booking), [newTable])
})

test('snooze chỉ nhận 10 15 30, cùng store, confirmed và có audit', async () => {
  await rejected(() => snooze([confirmed], 5), /10, 15 hoặc 30/)
  await rejected(() => snooze([otherStoreBooking], 10), /Không có quyền/)
  const result = await snooze([confirmed], 15)
  assert.equal(result.updated_count, 1)
  assert.equal(await eventCount(confirmed, 'reminder_snoozed'), 1)
})
```

Thêm test staff/owner quán khác không gọi được cả ba RPC và anon/authenticated direct table update
vẫn bị RLS chặn.

- [x] **Step 2: Chạy đỏ**

```powershell
$modulePath=(Resolve-Path 'admin-web/node_modules/@electric-sql/pglite/dist/index.js').Path
$env:PGLITE_MODULE=([System.Uri]::new($modulePath)).AbsoluteUri
node --test supabase/tests/057_reservation_operations_queue.test.mjs
```

Expected: FAIL vì migration/RPC 057 chưa tồn tại.

- [x] **Step 3: Implement migration**

Thêm cột nullable, index queue phù hợp `(store_id, status, arrival_at)` và thay event CHECK bằng
danh sách cũ cộng `reminder_snoozed`, `rescheduled_by_store`.

`list_reservation_queue`:

```sql
WHERE r.store_id = p_store_id
  AND (
    r.status IN ('pending','change_requested','confirmed','arrived')
    OR (r.updated_at >= p_recent_since AND r.arrival_at < p_future_until)
  )
```

Validate khoảng thời gian; trả `reservation_public_json || active_table_summary || suggested count
|| snooze fields`, sort unresolved trước rồi `arrival_at`.

`reschedule_reservation` chỉ cho `pending`, `confirmed`, `change_requested`, chưa có `session_id`.
Operator được override customer min/horizon/slot/serving-hours, nhưng `arrival_at` phải hợp lệ,
party 1–100, note/lý do không rỗng. Với confirmed/change_requested bắt buộc bàn; gọi
`assign_reservation_tables` để giữ locking/conflict convention BL-1. Chỉ sau khi assignment thành
công mới update arrival/pax, clear requested fields + Snooze và append event.

`snooze_reservation_reminders` validate mảng không rỗng/không duplicate, phút thuộc 10/15/30,
lock rows `ORDER BY id`, ép tất cả cùng store của actor và `status='confirmed'`; update một
`reminder_snoozed_until = now() + interval`, append event từng row, trả snapshot cập nhật.

Mỗi SECURITY DEFINER function:

```sql
REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ... TO authenticated;
```

Cuối migration `NOTIFY pgrst, 'reload schema';`.

- [x] **Step 4: Chạy xanh và regression DB**

```powershell
node --test supabase/tests/057_reservation_operations_queue.test.mjs supabase/tests/054_reservation_operator_flow.test.mjs supabase/tests/052_reservation_foundation.test.mjs supabase/tests/050_pos_gate_service_requests.test.mjs
```

Expected: all pass; event/state guards BL-1 và POS gate BL-0 không hồi quy.

- [x] **Step 5: Tạo test checkpoint và commit**

`SPRINT-BL-2A.md` có Test 1 (migration/RPC) với lệnh apply 057 và SQL smoke tests. `TESTING.md`
chỉ thêm/cập nhật một link `⏳ Bảo Lương — Sprint BL-2A`.

```powershell
git add supabase/migrations/057_reservation_operations_queue.sql supabase/tests/057_reservation_operations_queue.test.mjs docs/testing/bao-luong/SPRINT-BL-2A.md TESTING.md
git commit -m "feat: reservation operations queue va snooze"
```

**Dừng:** báo anh Tú chạy `SPRINT-BL-2A.md — Test 1`, chờ `Task 1 PASS`.

---

## Task 2: Typed actions, queue classifier và watcher chống mất sự kiện

**Files:**

- Modify: `admin-web/lib/actions/reservations.ts`
- Modify: `admin-web/lib/actions/reservations.test.ts`
- Create: `admin-web/lib/reservation-queue.ts`
- Create: `admin-web/lib/reservation-queue.test.ts`
- Create: `admin-web/lib/reservation-queue-watcher.ts`
- Create: `admin-web/lib/reservation-queue-watcher.test.ts`
- Modify: `docs/testing/bao-luong/SPRINT-BL-2A.md`

**Produces:** Một API TypeScript dùng chung cho mobile/POS, không nhân đôi logic status/time.

- [x] **Step 1: Viết test đỏ actions**

Test `listReservationQueue`, `createManualReservation`, `resolveReservationChange`,
`rescheduleReservation`, `snoozeReservationReminders`. Chứng minh:

- `store_id` list luôn lấy từ operator;
- action theo reservation không nhận store từ browser;
- staff fail trước RPC;
- snake_case map đủ Snooze/session/table fields;
- DB error trả nguyên văn và không bị background reload xóa.

- [x] **Step 2: Viết test đỏ classifier**

Inject `now` thay vì gọi `Date.now()` bên trong test:

```ts
expect(classifyReservation(confirmedAtMinus(29), now).kind).toBe('overdue')
expect(classifyReservation(confirmedAtMinus(31), now).severity).toBe('critical')
expect(reminderBucket(arrivalAt, now)).toBe(3)
expect(groupDueReminders([a, b], now)).toMatchObject({ count: 2 })
```

Cover pending quá giờ vẫn `pending`, arrived không nhắc, Snooze tương lai không nhắc, đúng boundary
0/5/30 phút và sort theo arrival/created.

- [x] **Step 3: Viết test đỏ watcher bằng fake timers**

Fake Supabase channel và action loader. Verify:

- realtime event debounce rồi tải snapshot;
- polling 2 giây tải dù channel báo `SUBSCRIBED`;
- focus và reconnect tải lại;
- event đến giữa request tăng revision, snapshot cũ không ghi đè;
- `dispose` dọn interval/listener/channel.

- [x] **Step 4: Implement tối thiểu**

Action owner guard tái sử dụng `ownerClient`. `watchReservationQueue` theo pattern
`watchServiceRequests`, nhưng thêm `window.focus`/`online` listener qua dependency injectable để
unit test không cần browser thật. Initial snapshot không phát callback “new”; reminder logic để
classifier/client quyết định.

- [x] **Step 5: Chạy tests/lint và commit**

```powershell
cd admin-web
npm test -- lib/actions/reservations.test.ts lib/reservation-queue.test.ts lib/reservation-queue-watcher.test.ts
npm run lint -- lib/actions/reservations.ts lib/reservation-queue.ts lib/reservation-queue-watcher.ts
cd ..
git add admin-web/lib/actions/reservations.ts admin-web/lib/actions/reservations.test.ts admin-web/lib/reservation-queue.ts admin-web/lib/reservation-queue.test.ts admin-web/lib/reservation-queue-watcher.ts admin-web/lib/reservation-queue-watcher.test.ts docs/testing/bao-luong/SPRINT-BL-2A.md
git commit -m "feat: reservation queue actions va watcher"
```

**Dừng:** báo `SPRINT-BL-2A.md — Test 2`, chờ `Task 2 PASS`.

---

## Task 3: Trang Admin Mobile và queue chỉ đọc có đồng bộ

**Files:**

- Create: `admin-web/app/admin/reservations/page.tsx`
- Create: `admin-web/app/admin/reservations/reservations-client.tsx`
- Create: `admin-web/app/admin/reservations/reservation-card.tsx`
- Create: `admin-web/app/admin/reservations/reservation-ui.ts`
- Create: `admin-web/app/admin/reservations/reservation-ui.test.ts`
- Modify: `admin-web/app/admin/layout.tsx`
- Modify: `admin-web/app/admin/admin-nav.tsx`
- Modify/Create: focused nav tests near `admin-nav.tsx`
- Modify: `docs/testing/bao-luong/SPRINT-BL-2A.md`

**Produces:** Owner xem queue trên điện thoại, gọi khách, thấy trạng thái/realtime; chưa bật mutation
phân bàn ở task này.

- [x] **Step 1: Đọc Next docs và viết test đỏ view model/nav**

Đọc tối thiểu docs local về Server/Client Components, data fetching và layouts. Test pure
`reservation-ui.ts`:

- label/màu/action visibility theo status;
- giờ Việt Nam ổn định, không phụ thuộc timezone máy chạy test;
- `telHref` chỉ giữ ký tự số và dấu `+`, không nhúng chuỗi nguy hiểm;
- summary `8 khách · gợi ý 2 bàn · Bàn 1, Bàn 2`.

Test nav render có `Đặt bàn` khi `reservationsEnabled=true`, không có khi false.

- [x] **Step 2: Implement page shell fail-closed**

Server page owner-only, load song song workflow + initial queue. Nếu capability tắt thì redirect về
dashboard hoặc render thông báo khóa; không render dữ liệu. Layout load public workflow và truyền
`reservationsEnabled` vào `AdminNav`.

Client giữ `rows`, `connected`, `reloadError`; watcher thay toàn snapshot. Chia nhóm bằng pure
classifier, có skeleton/empty/error rõ. Card có link `Gọi khách` (`tel:`), giờ, pax, suggested/held
tables và badges `Chờ duyệt`, `Sắp đến`, `Quá giờ`, `Đã đến`, `Đã xử lý`.

- [x] **Step 3: Chạy tests/build và manual responsive check**

```powershell
cd admin-web
npm test -- app/admin/reservations/reservation-ui.test.ts app/admin/admin-nav.test.tsx lib/reservation-queue.test.ts
npm run build
cd ..
```

Manual Test 3 trong file Sprint: viewport 390px, desktop, background tab, tắt/bật capability và
điện thoại `tel:`.

- [x] **Step 4: Commit**

```powershell
git add admin-web/app/admin/reservations admin-web/app/admin/layout.tsx admin-web/app/admin/admin-nav.tsx admin-web/app/admin/admin-nav.test.tsx docs/testing/bao-luong/SPRINT-BL-2A.md
git commit -m "feat: admin mobile reservation queue"
```

**Dừng:** báo `SPRINT-BL-2A.md — Test 3`, chờ `Task 3 PASS`.

---

## Task 4: Chọn bàn và toàn bộ thao tác owner trên Admin Mobile

**Files:**

- Create: `admin-web/app/admin/reservations/reservation-table-picker.tsx`
- Create: `admin-web/app/admin/reservations/reservation-table-picker.test.ts`
- Create: `admin-web/app/admin/reservations/reservation-form.tsx`
- Create: `admin-web/app/admin/reservations/reservation-form.test.ts`
- Modify: `admin-web/app/admin/reservations/reservations-client.tsx`
- Modify: `admin-web/app/admin/reservations/reservation-card.tsx`
- Modify: `admin-web/app/admin/reservations/page.tsx`
- Modify: `docs/testing/bao-luong/SPRINT-BL-2A.md`

**Produces:** Mobile xử lý đầy đủ pending/change/confirmed/arrived bằng các RPC đã test.

- [x] **Step 1: Viết test đỏ pure selection/form validation**

Tách helper khỏi React để test:

- group bàn theo area, giữ thứ tự layout;
- bàn có session bị disabled, bàn đang giữ bởi booking này vẫn selected;
- suggested count chỉ là hint, không ép đúng số;
- local datetime round-trip sang UTC đúng `Asia/Ho_Chi_Minh`;
- manual create bắt name/phone/pax/time/reason; reschedule bắt reason và ít nhất một bàn nếu booking
  đã confirmed.

- [x] **Step 2: Implement table picker và forms**

Page server truyền `FloorSnapshot` và initial open sessions; client watcher session hoặc reload floor
trước khi mở picker để đánh dấu bàn đang có khách. Picker mobile nhóm theo area, nút tối thiểu 44px,
hiện `Đang có khách`/`Đã chọn`; submit vẫn chấp nhận DB từ chối race và giữ sheet + lỗi.

Action matrix:

| Status | Action |
|---|---|
| pending | Xác nhận & chọn bàn, Từ chối |
| change_requested | Chấp nhận + chọn lại bàn, Từ chối thay đổi |
| confirmed | Khách đã đến, Đổi lịch/bàn, Không đến |
| arrived | Mở bill trên POS (link), không no-show |
| terminal | Chỉ xem |

`Tạo đặt bàn` gọi BL-1 `create_manual_reservation`, sau đó cho owner xác nhận/chọn bàn như booking
thường. Không ghép hai thao tác client thành một ảo tưởng atomic; card pending xuất hiện ngay nếu
bước chọn bàn bị bỏ dở.

- [x] **Step 3: Giữ lỗi action qua polling**

Dùng error state phân biệt `action`/`reload` như POS. Background refresh chỉ xóa lỗi reload, không
xóa lỗi conflict/permission. Disable submit khi request đang chạy; mutation thành công reload queue.

- [x] **Step 4: Chạy test/build và manual lifecycle**

```powershell
cd admin-web
npm test -- app/admin/reservations/reservation-table-picker.test.ts app/admin/reservations/reservation-form.test.ts lib/actions/reservations.test.ts
npm run build
cd ..
```

Manual Test 4: hai owner tab tranh cùng bàn; create tay ngoài giờ; customer change accept/reject;
reschedule conflict giữ bàn cũ; arrival bấm hai lần chỉ một session; no-show thủ công.

- [x] **Step 5: Commit**

```powershell
git add admin-web/app/admin/reservations admin-web/lib/actions/reservations.ts admin-web/lib/actions/reservations.test.ts docs/testing/bao-luong/SPRINT-BL-2A.md
git commit -m "feat: reservation owner operations tren mobile"
```

**Dừng:** báo `SPRINT-BL-2A.md — Test 4`, chờ `Task 4 PASS`.

---

## Task 5: Tích hợp queue và chọn bàn vào POS hiện có

**Files:**

- Create: `admin-web/app/admin/cashier/reservation-queue-panel.tsx`
- Create: `admin-web/app/admin/cashier/reservation-pos-state.ts`
- Create: `admin-web/app/admin/cashier/reservation-pos-state.test.ts`
- Modify: `admin-web/app/admin/cashier/page.tsx`
- Modify: `admin-web/app/admin/cashier/cashier-client.tsx`
- Modify: `admin-web/app/admin/cashier/floor-map.tsx`
- Reuse: `admin-web/app/admin/reservations/reservation-table-picker.tsx`
- Modify: `docs/testing/bao-luong/SPRINT-BL-2A.md`

**Produces:** Chủ quán không cần rời POS để duyệt booking, chọn bàn trên layout và mở bill sau arrival.

- [ ] **Step 1: Viết test đỏ POS state**

Pure reducer/state helper chứng minh:

- chọn booking không làm mất bill/session đang mở cho tới khi owner xác nhận chuyển ngữ cảnh;
- table pick mode dùng đúng booking/table IDs và không đụng `pickedTableIds` dùng cho ghép mâm;
- arrival result có `sessionId` thì select đúng session sau session reload;
- cancel/close picker trả POS về state cũ.

- [ ] **Step 2: Load queue song song ở server**

`cashier/page.tsx` load reservations cùng floor/sessions/service requests; chỉ load khi capability
bật. Truyền initial rows/error, không để lỗi queue làm sập POS/bill.

- [ ] **Step 3: Add compact panel và floor selection mode**

Panel chỉ nổi bật pending + confirmed gần giờ/quá giờ, có nút mở mọi booking. Reuse shared card
contracts/actions. Khi chọn bàn, `FloorMap` nhận mode rõ ràng (`normal | reservation`) và callback
riêng; mode reservation:

- vô hiệu drag/merge/session bill actions;
- tô bàn booking đang giữ;
- vô hiệu bàn có phiên mở với tooltip;
- không tái sử dụng `pickedTableIds` của ghép mâm.

Sau `arriveReservation`, reload sessions rồi select `reservation.sessionId`; nếu máy khác đã arrival,
RPC idempotent trả cùng session và POS vẫn mở đúng bill.

- [ ] **Step 4: Regression POS tests/build**

```powershell
cd admin-web
npm test -- app/admin/cashier/reservation-pos-state.test.ts lib/table-layout.test.ts lib/table-status.test.ts lib/cashier-error-state.test.ts lib/actions/reservations.test.ts
npm test
npm run build
cd ..
```

Manual Test 5: bill đang mở + booking mới; xác nhận 1/nhiều bàn; conflict phiên đang mở; arrival mở
mâm đúng; đơn QR/Gọi nhân viên/ghép mâm/thu tiền cũ vẫn hoạt động.

- [ ] **Step 5: Commit**

```powershell
git add admin-web/app/admin/cashier admin-web/app/admin/reservations/reservation-table-picker.tsx docs/testing/bao-luong/SPRINT-BL-2A.md
git commit -m "feat: reservation queue tren POS"
```

**Dừng:** báo `SPRINT-BL-2A.md — Test 5`, chờ `Task 5 PASS`.

---

## Task 6: Nhắc gộp 5 phút, Snooze và nghiệm thu BL-2A

**Files:**

- Create: `admin-web/lib/reservation-reminders.ts`
- Create: `admin-web/lib/reservation-reminders.test.ts`
- Modify: `admin-web/app/admin/reservations/reservations-client.tsx`
- Modify: `admin-web/app/admin/cashier/reservation-queue-panel.tsx`
- Modify: `admin-web/app/admin/cashier/cashier-client.tsx`
- Modify: `docs/testing/bao-luong/SPRINT-BL-2A.md`
- Modify: `TESTING.md`

**Produces:** Chuông đúng chu kỳ, gộp, Snooze đồng bộ và test hồi quy cuối Sprint.

- [ ] **Step 1: Viết test đỏ reminder coordinator**

Coordinator nhận storage/clock/play callback injectable. Test:

- hai booking cùng đến hạn chỉ gọi `playBell` một lần;
- polling lặp trong cùng bucket không gọi lại;
- sang bucket 5 phút kế tiếp gọi một lần nữa;
- Snooze tương lai loại booking khỏi nhóm, hết Snooze nhắc lại;
- arrival/no-show/cancel loại ngay;
- đổi store không dùng nhầm storage key;
- storage lỗi/disabled không làm crash queue.

- [ ] **Step 2: Implement shared reminder banner**

Cả POS và Admin Mobile dùng cùng coordinator. Lần snapshot đầu có booking quá hạn được phép phát
một chuông sau `unlockBell`/tương tác đầu tiên; nếu browser chặn audio, banner vẫn hiện. Banner:

```text
⏰ 3 đặt bàn đã tới giờ — kiểm tra khách đã đến chưa
[Xem] [Nhắc lại sau 10 phút] [15 phút] [30 phút]
```

Group Snooze gửi đúng reservation IDs đang eligible. Card individual Snooze dùng cùng RPC. Card
quá 30 phút có mức đỏ nhưng không tự đổi trạng thái.

- [ ] **Step 3: Chạy full verification**

```powershell
$modulePath=(Resolve-Path 'admin-web/node_modules/@electric-sql/pglite/dist/index.js').Path
$env:PGLITE_MODULE=([System.Uri]::new($modulePath)).AbsoluteUri
node --test supabase/tests/057_reservation_operations_queue.test.mjs supabase/tests/054_reservation_operator_flow.test.mjs supabase/tests/052_reservation_foundation.test.mjs supabase/tests/049_store_workflow_settings.test.mjs supabase/tests/050_pos_gate_service_requests.test.mjs
cd admin-web
npm test
npm run lint
npm run build
cd ..
git status --short
```

Expected: 0 fail; only intended files changed before final commit.

- [ ] **Step 4: Hoàn thiện test file và commit**

`SPRINT-BL-2A.md` có:

- Test 6A reminder 5 phút/gộp/Snooze/30 phút;
- Test 6B multi-tab/reconnect/background;
- Test 6C role/cross-store/direct RPC;
- Test 6D regression Pubu/POS/Gọi nhân viên/ghép mâm/bill;
- bảng ghi migration remote 057 đã/chưa apply.

`TESTING.md` chỉ đổi link Sprint BL-2A sang `⏳ chờ PASS`; chưa đánh PASS thay người dùng.

```powershell
git add admin-web supabase/tests/057_reservation_operations_queue.test.mjs docs/testing/bao-luong/SPRINT-BL-2A.md TESTING.md
git commit -m "feat: reservation reminders va hoan tat BL-2A"
```

**Dừng:** báo chính xác `docs/testing/bao-luong/SPRINT-BL-2A.md — Test 6A–6D`, chờ
`BL-2A PASS`. Không tự chuyển BL-2B hoặc BL-3.

---

## Deployment order sau khi từng checkpoint PASS

1. Apply migration 057 qua Supabase MCP và kiểm tra schema cache/RPC grants.
2. Deploy Admin Web preview; test owner Bảo Lương mobile + POS song song.
3. Chỉ sau `BL-2A PASS` mới merge/push theo yêu cầu của anh Tú.
4. BL-2B chờ OA; BL-2C chờ preorder BL-3, không dùng stub trong production.
