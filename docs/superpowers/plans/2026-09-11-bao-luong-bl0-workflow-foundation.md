# Bảo Lương BL-0 — Workflow Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây nền cấu hình quy trình theo quán trong Admin Web, giữ nguyên Pubu, bật cổng POS và hàng đợi Gọi nhân viên cho Bảo Lương, đồng thời tách entry Mini App khỏi suy diễn “không có bàn = mang về”.

**Architecture:** Dùng `store_workflow_settings` có kiểu dữ liệu rõ ràng làm nguồn sự thật cho capability/policy mới; các trường hiện hữu trên `stores` không bị nhân đôi. Mọi cập nhật đi qua một RPC nguyên tử có audit, còn Mini App/POS đọc một public-safe RPC hợp nhất. BL-0 không tạo bảng đặt bàn; reservation, preorder và OA booking thuộc BL-1/BL-2/BL-3.

**Tech Stack:** PostgreSQL/Supabase RLS + RPC, Next.js 16/React 19/Vitest, Zalo Mini App React 18/Zustand/Vitest, PGlite SQL tests.

**Spec:** `docs/superpowers/specs/2026-09-10-bao-luong-reservation-pos-workflow-design.md`

## Global Constraints

- Không hardcode slug để quyết định quy trình runtime; slug chỉ được dùng trong migration backfill dữ liệu đã biết.
- Default và backfill phải giữ Pubu: prepay, Tại bàn/Mang về/Ship bật, đơn hợp lệ tự vào bếp.
- Bảo Lương: postpay, Tại bàn bật, Mang về/Ship tắt, Đặt bàn/đặt món trước bật, mọi nguồn đơn chờ POS.
- Giờ phục vụ là mảng ca phẳng áp dụng cho mọi ngày, timezone `Asia/Ho_Chi_Minh`.
- Chỉ `store_owner` và `mevo_superadmin` được sửa cấu hình; `store_staff` không được sửa.
- Quyền và validation bắt buộc nằm trong RPC/DB, không chỉ ở UI.
- Mọi text người dùng thấy phải là tiếng Việt và giao diện mobile-first ở Mini App.
- Không sửa migration 001–048; tạo migration mới theo thứ tự.
- Mỗi task theo TDD: test đỏ → code tối thiểu → test xanh → commit.
- Kết thúc BL-0 phải tạo `docs/testing/bao-luong/SPRINT-BL-0.md`, chỉ thêm link/trạng thái vào `TESTING.md`, rồi dừng chờ PASS.

## File map

**Database**

- Create `supabase/migrations/049_store_workflow_settings.sql`: schema, RLS, public reader, update RPC, audit, backfill Pubu/Bảo Lương.
- Create `supabase/tests/049_store_workflow_settings.test.mjs`: PGlite tests cho quyền, preset values, transaction và validation.
- Modify `admin-web/package.json` và `admin-web/package-lock.json`: thêm `@electric-sql/pglite` làm dev dependency dùng chung cho SQL tests 048–050.
- Create `supabase/migrations/050_pos_gate_service_requests.sql`: service request lifecycle/RPC, timeout theo store, siết role đóng bill.
- Create `supabase/tests/050_pos_gate_service_requests.test.mjs`: PGlite tests cho cổng POS, spam, resolve và quyền.

**Admin Web**

- Create `admin-web/lib/workflow-settings.ts`: type, preset và hàm thuần dùng chung UI.
- Create `admin-web/lib/workflow-settings.test.ts`: test preset/normalization/dependency.
- Create `admin-web/lib/actions/workflow-settings.ts`: load/save workflow bằng Supabase RPC.
- Create `admin-web/lib/actions/workflow-settings.test.ts`: test role và payload RPC.
- Create `admin-web/app/admin/settings/workflow-settings-form.tsx`: form Quy trình vận hành.
- Modify `admin-web/app/admin/settings/page.tsx`: tải workflow và render form tách biệt.
- Modify `admin-web/app/admin/settings/settings-client.tsx`: bỏ các field workflow khỏi form thông tin quán.
- Modify `admin-web/lib/actions/store.ts`: chỉ còn lưu profile; không ghi policy rời rạc.
- Modify `admin-web/app/mevo/stores/[storeId]/page.tsx`: render cùng workflow form cho superadmin.
- Modify `admin-web/lib/kitchen-announce.ts` và `.test.ts`: policy theo nguồn đơn + `confirmed_at`.
- Create `admin-web/lib/actions/service-requests.ts`: list/resolve request.
- Create `admin-web/lib/actions/service-requests.test.ts`: role/payload/error tests cho action request.
- Create `admin-web/app/admin/cashier/service-request-queue.tsx`: hàng đợi bền vững trên POS.
- Modify `admin-web/app/admin/cashier/page.tsx` và `cashier-client.tsx`: nạp policy, request và realtime.
- Modify `admin-web/lib/actions/table-session.ts`: action đóng bill chỉ nhận owner; action mâm vẫn cho staff.
- Modify `admin-web/app/staff/tables/page.tsx` và `tables-client.tsx`: ẩn thu tiền/Bỏ bàn với staff.
- Modify `admin-web/app/kitchen/[storeSlug]/kitchen-display.tsx`: truyền policy/confirmedAt vào predicate, không hồi quy Pubu.

**Mini App**

- Create `mini-app/src/types/workflow.types.ts`: public workflow contract.
- Create `mini-app/src/services/workflow/workflow.api.ts`: đọc public-safe config.
- Create `mini-app/src/utils/entry-context.ts` và `.test.ts`: parse `root | table` độc lập capability.
- Modify `mini-app/src/stores/app.store.ts`: lưu entry context/workflow, bỏ `no table => takeaway`.
- Modify `mini-app/src/app.tsx`: tải store + workflow trước khi chọn route.
- Modify `mini-app/src/pages/menu/index.tsx` và `checkout/index.tsx`: read-only root cho Bảo Lương, giữ Pubu takeaway.
- Create `mini-app/src/services/service-request.ts` và `.test.ts`: gọi RPC ping thay INSERT trực tiếp.
- Modify `mini-app/src/pages/menu/index.tsx` và `session-orders/index.tsx`: dùng service request mới.
- Modify `mini-app/src/types/database.types.ts`: đồng bộ shape public RPC/service request.

**Documentation/test gate**

- Create `docs/testing/bao-luong/SPRINT-BL-0.md`.
- Modify `TESTING.md` chỉ thêm link + trạng thái.
- Modify `AGENTS.md`, `PRD.md`, `ARCHITECTURE.md` khi BL-0 hoàn tất để phản ánh nguồn cấu hình mới.

---

### Task 1: Contract cấu hình và preset thuần TypeScript

**Files:**
- Create: `admin-web/lib/workflow-settings.ts`
- Create: `admin-web/lib/workflow-settings.test.ts`

**Interfaces:**
- Produces `StoreWorkflowSettings`, `WorkflowPresetKey`, `PUBU_PRESET`, `BAO_LUONG_PRESET`, `applyWorkflowPreset()`.
- Consumed by Tasks 3–5 và làm chuẩn tên camelCase khớp RPC JSON.

- [ ] **Step 1: Viết test đỏ cho hai preset và dependency**

```ts
import { describe, expect, it } from 'vitest'
import { applyWorkflowPreset, normalizeWorkflowSettings } from './workflow-settings'

describe('workflow presets', () => {
  it('Pubu giữ trả trước và tự xuống bếp', () => {
    const v = applyWorkflowPreset('pubu')
    expect(v).toMatchObject({
      paymentTiming: 'prepay', tableOrderingEnabled: true,
      takeawayEnabled: true, shippingEnabled: true, reservationsEnabled: false,
      kitchenReleasePolicy: 'automatic', staffOrderReleasePolicy: 'automatic',
    })
  })

  it('Bảo Lương tắt mang về/ship và chờ POS', () => {
    const v = applyWorkflowPreset('bao_luong')
    expect(v).toMatchObject({
      paymentTiming: 'postpay', tableOrderingEnabled: true,
      takeawayEnabled: false, shippingEnabled: false,
      reservationsEnabled: true, reservationPreorderEnabled: true,
      kitchenReleasePolicy: 'pos_confirmation',
      staffOrderReleasePolicy: 'pos_confirmation',
      tableSessionIdleTimeoutMinutes: 360,
      reservationPreorderEditCutoffMinutes: 30,
    })
  })

  it('tắt đặt bàn thì tắt hiệu lực preorder nhưng giữ giá trị nhập', () => {
    const v = normalizeWorkflowSettings({
      ...applyWorkflowPreset('bao_luong'), reservationsEnabled: false,
    })
    expect(v.effectiveReservationPreorderEnabled).toBe(false)
    expect(v.reservationPreorderEnabled).toBe(true)
  })
})
```

- [ ] **Step 2: Chạy test để thấy đỏ**

Run: `cd admin-web; npm test -- --run lib/workflow-settings.test.ts`

Expected: FAIL vì module chưa tồn tại.

- [ ] **Step 3: Tạo contract và preset**

```ts
export type ReleasePolicy = 'automatic' | 'pos_confirmation'
export type WorkflowPresetKey = 'pubu' | 'bao_luong' | 'custom'

export interface StoreWorkflowSettings {
  paymentTiming: 'prepay' | 'postpay'
  paymentMethods: Array<'zalo_checkout' | 'cash'>
  isAcceptingOrders: boolean
  servingHours: Array<{ open: string; close: string }>
  tableOrderingEnabled: boolean
  takeawayEnabled: boolean
  shippingEnabled: boolean
  reservationsEnabled: boolean
  reservationPreorderEnabled: boolean
  minimumAdvanceMinutes: number
  bookingHorizonDays: number
  slotIntervalMinutes: number
  defaultTableCapacity: number
  planningHoldMinutes: number
  kitchenReleasePolicy: ReleasePolicy
  staffOrderReleasePolicy: ReleasePolicy
  openOrderingOnArrival: boolean
  tableSessionIdleTimeoutMinutes: number
  reservationPreorderEditCutoffMinutes: number
}

export type EffectiveWorkflowSettings = StoreWorkflowSettings & {
  effectiveReservationPreorderEnabled: boolean
}
```

Đặt `PUBU_PRESET` và `BAO_LUONG_PRESET` bằng `satisfies StoreWorkflowSettings`; không dùng object thiếu field hoặc merge default ngầm ở component.

```ts
export const PUBU_PRESET = {
  paymentTiming: 'prepay', paymentMethods: ['zalo_checkout'], isAcceptingOrders: true,
  servingHours: [], tableOrderingEnabled: true, takeawayEnabled: true, shippingEnabled: true,
  reservationsEnabled: false, reservationPreorderEnabled: false,
  minimumAdvanceMinutes: 30, bookingHorizonDays: 7, slotIntervalMinutes: 15,
  defaultTableCapacity: 6, planningHoldMinutes: 180,
  kitchenReleasePolicy: 'automatic', staffOrderReleasePolicy: 'automatic',
  openOrderingOnArrival: true, tableSessionIdleTimeoutMinutes: 360,
  reservationPreorderEditCutoffMinutes: 30,
} satisfies StoreWorkflowSettings

export const BAO_LUONG_PRESET = {
  ...PUBU_PRESET,
  paymentTiming: 'postpay', paymentMethods: ['cash'], takeawayEnabled: false,
  shippingEnabled: false, reservationsEnabled: true, reservationPreorderEnabled: true,
  kitchenReleasePolicy: 'pos_confirmation', staffOrderReleasePolicy: 'pos_confirmation',
} satisfies StoreWorkflowSettings
```

- [ ] **Step 4: Chạy test xanh**

Run: `cd admin-web; npm test -- --run lib/workflow-settings.test.ts`

Expected: 3 test PASS.

- [ ] **Step 5: Commit**

```bash
git add admin-web/lib/workflow-settings.ts admin-web/lib/workflow-settings.test.ts
git commit -m "feat: dinh nghia preset quy trinh theo quan"
```

### Task 2: Migration 049 — nguồn cấu hình, audit và RPC nguyên tử

**Files:**
- Create: `supabase/migrations/049_store_workflow_settings.sql`
- Create: `supabase/tests/049_store_workflow_settings.test.mjs`
- Modify: `admin-web/package.json`
- Modify: `admin-web/package-lock.json`

**Interfaces:**
- Produces `get_public_store_workflow(uuid) returns jsonb`.
- Produces `get_store_workflow_settings(uuid) returns jsonb` cho owner/superadmin.
- Produces `update_store_workflow_settings(uuid,jsonb,text) returns jsonb`.
- Produces `assert_order_channel_enabled(uuid,text) returns void` và trigger
  `trg_orders_enforce_workflow`, để mọi đường ghi order đều không thể bypass capability.

- [ ] **Step 1: Cài test runtime PGlite và viết test đỏ**

Run: `cd admin-web; npm install --save-dev @electric-sql/pglite`

Test dựng tối thiểu `stores`, `mevo_operators`, `table_sessions`, `orders`, role
`anon/authenticated`, rồi load migration 049 hai lần. Dùng helper `login(uid)`, `rejected(fn,re)` và
`workflow(storeId)` cùng kiểu với test 048, nhưng các assertion phải có nội dung cụ thể sau:

```js
const validPayload = {
  payment_timing: 'postpay', payment_methods: ['cash'], is_accepting_orders: true,
  serving_hours: [], table_ordering_enabled: true, takeaway_enabled: false,
  shipping_enabled: false, reservations_enabled: true,
  reservation_preorder_enabled: true, minimum_advance_minutes: 30,
  booking_horizon_days: 7, slot_interval_minutes: 15, default_table_capacity: 6,
  planning_hold_minutes: 180, kitchen_release_policy: 'pos_confirmation',
  staff_order_release_policy: 'pos_confirmation', open_ordering_on_arrival: true,
  table_session_idle_timeout_minutes: 360,
  reservation_preorder_edit_cutoff_minutes: 30,
}

test('backfill Pubu và Bảo Lương đúng policy', async () => {
  const p = await workflow(pubu)
  assert.equal(p.payment_timing, 'prepay')
  assert.equal(p.table_ordering_enabled, true)
  assert.equal(p.takeaway_enabled, true)
  assert.equal(p.shipping_enabled, true)
  assert.equal(p.reservations_enabled, false)
  assert.equal(p.kitchen_release_policy, 'automatic')
  assert.equal(p.staff_order_release_policy, 'automatic')
  const b = await workflow(baoLuong)
  assert.equal(b.payment_timing, 'postpay')
  assert.equal(b.table_ordering_enabled, true)
  assert.equal(b.takeaway_enabled, false)
  assert.equal(b.shipping_enabled, false)
  assert.equal(b.reservations_enabled, true)
  assert.equal(b.kitchen_release_policy, 'pos_confirmation')
  assert.equal(b.staff_order_release_policy, 'pos_confirmation')
})

test('public reader không lộ audit hay operator', async () => {
  await db.exec('SET LOCAL ROLE anon')
  const value = (await db.query('select get_public_store_workflow($1) value', [pubu])).rows[0].value
  assert.equal(value.store_id, undefined)
  assert.equal(value.updated_by, undefined)
  assert.equal(value.changed_by, undefined)
  assert.equal(value.payment_timing, 'prepay')
})

test('owner chỉ sửa quán mình; staff và owner khác bị chặn', async () => {
  await login(owner)
  await rejected(() => update(otherStore, validPayload), /Chỉ được sửa quán của mình/)
  await login(staff)
  await rejected(() => update(pubu, validPayload), /Chỉ chủ quán/)
})

test('RPC cập nhật nguyên tử và ghi đúng một event', async () => {
  await login(owner)
  const saved = await update(pubu, validPayload)
  assert.equal(saved.table_session_idle_timeout_minutes, 360)
  assert.equal((await db.query('select count(*) n from store_workflow_setting_events')).rows[0].n, 1)
  await rejected(() => update(pubu, { ...validPayload, slot_interval_minutes: -1 }), /Bước chọn giờ/)
  assert.deepEqual(await workflow(pubu), saved)
})

test('đổi policy nguy hiểm bị chặn khi còn phiên mở', async () => {
  await db.query('insert into table_sessions(id,store_id,status) values($1,$2,$3)', [session, pubu, 'open'])
  await login(owner)
  await rejected(
    () => update(pubu, { ...validPayload, kitchen_release_policy: 'pos_confirmation' }),
    /Còn phiên đang hoạt động/,
  )
})
```

`validPayload` trong fixture phải chứa đủ mọi key đúng contract Task 1; `update()` gọi đúng
`update_store_workflow_settings(storeId, payload, 'owner')`. Thêm một test superadmin với
`changed_via='mevo'` và assert event lưu `changed_via = 'mevo'`.

- [ ] **Step 2: Chạy test để thấy đỏ**

Run: `$env:PGLITE_MODULE=(Resolve-Path 'admin-web/node_modules/@electric-sql/pglite/dist/index.js').Path; node --test supabase/tests/049_store_workflow_settings.test.mjs`

Expected: FAIL vì migration 049 chưa tồn tại.

- [ ] **Step 3: Tạo bảng typed và audit**

Migration phải chứa cấu trúc tương đương:

```sql
create table store_workflow_settings (
  store_id uuid primary key references stores(id) on delete cascade,
  table_ordering_enabled boolean not null default true,
  takeaway_enabled boolean not null default true,
  shipping_enabled boolean not null default true,
  reservations_enabled boolean not null default false,
  reservation_preorder_enabled boolean not null default false,
  minimum_advance_minutes integer not null default 30 check (minimum_advance_minutes between 0 and 1440),
  booking_horizon_days integer not null default 7 check (booking_horizon_days between 1 and 90),
  slot_interval_minutes integer not null default 15 check (slot_interval_minutes in (5,10,15,30,60)),
  default_table_capacity integer not null default 6 check (default_table_capacity between 1 and 100),
  planning_hold_minutes integer not null default 180 check (planning_hold_minutes between 15 and 720),
  kitchen_release_policy text not null default 'automatic'
    check (kitchen_release_policy in ('automatic','pos_confirmation')),
  staff_order_release_policy text not null default 'automatic'
    check (staff_order_release_policy in ('automatic','pos_confirmation')),
  open_ordering_on_arrival boolean not null default true,
  table_session_idle_timeout_minutes integer not null default 360
    check (table_session_idle_timeout_minutes between 60 and 1440),
  reservation_preorder_edit_cutoff_minutes integer not null default 30
    check (reservation_preorder_edit_cutoff_minutes between 0 and 1440),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint preorder_requires_reservation
    check (not reservation_preorder_enabled or reservations_enabled)
);

create table store_workflow_setting_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  before_value jsonb not null,
  after_value jsonb not null,
  changed_by uuid not null,
  changed_via text not null check (changed_via in ('owner','mevo')),
  created_at timestamptz not null default now()
);
```

RLS: anon chỉ EXECUTE public reader; authenticated không INSERT/UPDATE/DELETE trực tiếp; owner đọc store mình; superadmin đọc store được chọn; events chỉ owner store đó và superadmin được SELECT.

- [ ] **Step 4: Viết ba RPC và backfill**

`update_store_workflow_settings` nhận full snapshot JSON, không patch mơ hồ. Nó phải:

```sql
-- 1. resolve auth.uid() + role/store; 2. lock stores/workflow row FOR UPDATE;
-- 3. parse/validate mọi key; 4. kiểm tra session/order mở khi đổi policy nguy hiểm;
-- 5. update stores(payment_timing,payment_methods,is_accepting_orders,serving_hours);
-- 6. update store_workflow_settings; 7. insert event; 8. return unified JSON.
```

RPC tự suy role thực tế: owner chỉ được `p_changed_via='owner'`, superadmin chỉ được
`p_changed_via='mevo'`; truyền nhãn giả bị từ chối, không tin chuỗi audit do client tự khai.

Backfill dùng slug đúng `pho-ga-pubu` và `bia-lau-bao-luong`; sau backfill runtime không đọc slug. Các store khác nhận default Pubu-compatible để không đổi hành vi hiện tại.

Tạo trigger `BEFORE INSERT ON orders` gọi helper theo `NEW.store_id/NEW.order_type`; không copy lại
hai RPC lớn `create_order`/`staff_create_order`, tránh làm rơi logic variant/topping/voucher:

```sql
perform assert_order_channel_enabled(new.store_id, new.order_type);
-- dine_in -> table_ordering_enabled
-- pickup  -> takeaway_enabled
-- delivery -> shipping_enabled
```

Helper raise tiếng Việt “Quán hiện không nhận đơn Mang về/Ship/Tại bàn”. Thêm PGlite assertion:
Bảo Lương gọi helper với `pickup`/`delivery` bị từ chối, Pubu gọi đủ ba loại thành công. Không chỉ
ẩn checkout phía Mini App. Vì trigger chạy trong cùng transaction, nếu `create_order` vừa mở session
rồi bị chặn lúc INSERT order thì toàn bộ session tạm cũng rollback.

- [ ] **Step 5: Chạy PGlite test xanh và test idempotency migration**

Run: `$env:PGLITE_MODULE=(Resolve-Path 'admin-web/node_modules/@electric-sql/pglite/dist/index.js').Path; node --test supabase/tests/049_store_workflow_settings.test.mjs`

Expected: toàn bộ test PASS, bao gồm load migration lần hai.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/049_store_workflow_settings.sql supabase/tests/049_store_workflow_settings.test.mjs admin-web/package.json admin-web/package-lock.json
git commit -m "feat: cau hinh quy trinh quan co audit"
```

### Task 3: Server action workflow cho owner và MEVO

**Files:**
- Create: `admin-web/lib/actions/workflow-settings.ts`
- Create: `admin-web/lib/actions/workflow-settings.test.ts`

**Interfaces:**
- Produces `loadOwnerWorkflowSettings(): Promise<StoreWorkflowSettings>`.
- Produces `loadMevoWorkflowSettings(storeId: string): Promise<StoreWorkflowSettings>`.
- Produces `saveOwnerWorkflowSettings(input: StoreWorkflowSettings): Promise<void>`.
- Produces `saveMevoWorkflowSettings(storeId: string,input: StoreWorkflowSettings): Promise<void>`.

- [ ] **Step 1: Viết test đỏ cho role và payload**

```ts
it('owner gửi storeId từ operator', async () => {
  mocks.operator.value = { role: 'store_owner', storeId: 'store-1' }
  await saveOwnerWorkflowSettings(BAO_LUONG_PRESET)
  expect(mocks.rpc).toHaveBeenCalledWith('update_store_workflow_settings', expect.objectContaining({
    p_store_id: 'store-1', p_changed_via: 'owner',
  }))
})

it('MEVO gửi store đích và changed_via=mevo', async () => {
  mocks.operator.value = { role: 'mevo_superadmin', storeId: null }
  await saveMevoWorkflowSettings('store-2', PUBU_PRESET)
  expect(mocks.rpc).toHaveBeenCalledWith('update_store_workflow_settings', expect.objectContaining({
    p_store_id: 'store-2', p_changed_via: 'mevo',
  }))
})

it('staff bị chặn trước RPC', async () => {
  mocks.operator.value = { role: 'store_staff', storeId: 'store-1' }
  await expect(saveOwnerWorkflowSettings(PUBU_PRESET)).rejects.toThrow('Chỉ chủ quán')
  expect(mocks.rpc).not.toHaveBeenCalled()
})

it('trả nguyên văn lỗi nghiệp vụ từ RPC', async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Còn phiên đang hoạt động' } })
  await expect(saveOwnerWorkflowSettings(BAO_LUONG_PRESET)).rejects.toThrow('Còn phiên đang hoạt động')
})
```

- [ ] **Step 2: Chạy test đỏ**

Run: `cd admin-web; npm test -- --run lib/actions/workflow-settings.test.ts`

Expected: FAIL vì action chưa tồn tại.

- [ ] **Step 3: Implement action mỏng**

Owner và MEVO đều dùng client phiên đăng nhập thật để RPC thấy `auth.uid()`; không dùng service role. Map camelCase ↔ snake_case trong đúng một hàm `toWorkflowRpcPayload()` đặt tại `workflow-settings.ts`.

```ts
await supabase.rpc('update_store_workflow_settings', {
  p_store_id: storeId,
  p_settings: toWorkflowRpcPayload(input),
  p_changed_via: 'owner',
})
```

- [ ] **Step 4: Chạy test xanh**

Run: `cd admin-web; npm test -- --run lib/actions/workflow-settings.test.ts lib/workflow-settings.test.ts`

Expected: toàn bộ PASS.

- [ ] **Step 5: Commit**

```bash
git add admin-web/lib/actions/workflow-settings.ts admin-web/lib/actions/workflow-settings.test.ts admin-web/lib/workflow-settings.ts
git commit -m "feat: action luu quy trinh quan"
```

### Task 4: Form Quy trình vận hành trong Admin Web

**Files:**
- Create: `admin-web/app/admin/settings/workflow-settings-form.tsx`
- Modify: `admin-web/app/admin/settings/page.tsx`
- Modify: `admin-web/app/admin/settings/settings-client.tsx`
- Modify: `admin-web/lib/actions/store.ts`
- Modify: `admin-web/app/mevo/stores/[storeId]/page.tsx`

**Interfaces:**
- Consumes Task 1 types/presets và Task 3 actions.
- Produces một form dùng lại cho owner và MEVO, prop `initial`, `onSave`, `context`.

- [ ] **Step 1: Tách form profile khỏi workflow hiện tại**

Trong `settings-client.tsx`, bỏ quyền ghi `payment_timing`, `payment_methods`, `is_accepting_orders`, `serving_hours`; giữ tên/logo/địa chỉ/OA/Wi-Fi/banner/điều khoản. Trong `updateStoreSettings`, bỏ đúng bốn nhóm operational tương ứng để hai form không có hai nguồn ghi.

- [ ] **Step 2: Tạo form workflow với interface cố định**

```tsx
type Props = {
  initial: StoreWorkflowSettings
  context: 'owner' | 'mevo'
  onSave: (value: StoreWorkflowSettings) => Promise<void>
}
```

Form có năm section theo spec, ba nút preset, preview thay đổi, confirm khi chọn preset, disable field phụ thuộc và hiển thị nguyên văn lỗi RPC. Nút Lưu bị khóa trong lúc gửi; lưu thành công cập nhật baseline để cảnh báo rời trang chỉ xuất hiện khi còn thay đổi chưa lưu.

- [ ] **Step 3: Gắn vào trang owner**

`page.tsx` tải profile và `loadOwnerWorkflowSettings()`, render hai card/form độc lập. Header đổi mô tả thành “Thông tin hiển thị và quy trình vận hành”.

- [ ] **Step 4: Gắn cùng component vào cockpit MEVO**

Trong `app/mevo/stores/[storeId]/page.tsx`, gọi `loadMevoWorkflowSettings(storeId)`, thêm section
**Quy trình vận hành** và bind `saveMevoWorkflowSettings(storeId, value)`. Không copy JSX field
sang một form khác.

- [ ] **Step 5: Typecheck, unit test và thử tay**

Run: `cd admin-web; npx tsc --noEmit; npm test -- --run lib/workflow-settings.test.ts lib/actions/workflow-settings.test.ts`

Expected: exit 0. Thử tay owner không sửa được quán khác; MEVO đổi preset Bảo Lương rồi reload vẫn đúng; Pubu preset hiện prepay + tự động.

- [ ] **Step 6: Commit**

```bash
git add admin-web/app/admin/settings admin-web/app/mevo/stores admin-web/lib/actions/store.ts admin-web/lib/actions/workflow-settings.ts
git commit -m "feat: cau hinh quy trinh trong admin web"
```

### Task 5: Cổng xuống bếp theo policy, không hồi quy Pubu

**Files:**
- Modify: `admin-web/lib/kitchen-announce.ts`
- Modify: `admin-web/lib/kitchen-announce.test.ts`
- Modify: `admin-web/app/kitchen/[storeSlug]/kitchen-display.tsx`
- Modify: `admin-web/app/admin/cashier/page.tsx`
- Modify: `admin-web/lib/actions/table-session.ts`

**Interfaces:**
- Extends `KitchenPredicateFields` với `confirmedAt`, `kitchenReleasePolicy`, `staffOrderReleasePolicy`.

- [ ] **Step 1: Viết test đỏ ma trận Pubu/Bảo Lương**

```ts
it('Pubu: staff automatic vào bếp ngay', () =>
  expect(orderInKitchen(o({ orderSource: 'staff', staffOrderReleasePolicy: 'automatic' }))).toBe(true))
it('Bảo Lương: staff chưa POS confirm không vào bếp', () =>
  expect(orderInKitchen(o({ orderSource: 'staff', staffOrderReleasePolicy: 'pos_confirmation', confirmedAt: null }))).toBe(false))
it('Bảo Lương: customer có confirmed_at mới vào bếp', () =>
  expect(orderInKitchen(o({ kitchenReleasePolicy: 'pos_confirmation', confirmedAt: '2026-09-11T12:00:00Z' }))).toBe(true))
it('status confirmed nhưng confirmed_at null vẫn bị giữ', () =>
  expect(orderInKitchen(o({ status: 'confirmed', kitchenReleasePolicy: 'pos_confirmation', confirmedAt: null }))).toBe(false))
it('order_source pos không bao giờ vào bếp', () =>
  expect(orderInKitchen(o({ orderSource: 'pos', confirmedAt: '2026-09-11T12:00:00Z' }))).toBe(false))
```

- [ ] **Step 2: Chạy test đỏ**

Run: `cd admin-web; npm test -- --run lib/kitchen-announce.test.ts`

Expected: case Bảo Lương FAIL.

- [ ] **Step 3: Implement predicate theo nguồn đơn**

```ts
const requiresPos = o.orderSource === 'staff'
  ? o.staffOrderReleasePolicy === 'pos_confirmation'
  : o.kitchenReleasePolicy === 'pos_confirmation'
if (requiresPos && o.confirmedAt === null) return false
```

Giữ thứ tự guard: `pos` → status active → policy confirmation → staff automatic → paid/prepay/postpay cũ.

- [ ] **Step 4: Truyền policy và confirmed_at tới mọi call site**

Kitchen tải `get_public_store_workflow`; query/order mapper thêm `confirmed_at`. POS vẫn hiển thị mọi đơn chờ, không dùng `orderInKitchen` để giấu đơn chưa duyệt.

- [ ] **Step 5: Chạy test**

Run: `cd admin-web; npm test -- --run lib/kitchen-announce.test.ts; npx tsc --noEmit`

Expected: PASS và typecheck exit 0.

- [ ] **Step 6: Commit**

```bash
git add admin-web/lib/kitchen-announce.ts admin-web/lib/kitchen-announce.test.ts admin-web/app/kitchen admin-web/app/admin/cashier admin-web/lib/actions/table-session.ts
git commit -m "feat: cong POS xuong bep theo cau hinh quan"
```

### Task 6: Migration 050 — service request, timeout và quyền đóng bill

**Files:**
- Create: `supabase/migrations/050_pos_gate_service_requests.sql`
- Create: `supabase/tests/050_pos_gate_service_requests.test.mjs`

**Interfaces:**
- Produces `ping_service_request(uuid,text,text) returns jsonb` cho anon.
- Produces `resolve_service_request(uuid) returns jsonb` cho staff/owner.
- Produces `list_open_service_requests(uuid) returns jsonb` cho staff/owner đúng store.
- Updates `expire_stale_table_sessions(uuid)` dùng timeout theo store.
- Recreates close RPC để chỉ owner được `paid`/`staff_reset`; RPC mâm không đổi quyền ghép.

- [ ] **Step 1: Viết PGlite test đỏ**

```js
test('hai QR trong cùng mâm chỉ tạo một request mở', async () => {
  await ping(table1, 'device-a')
  await db.exec("update service_requests set last_ping_at=now()-interval '61 seconds'")
  await ping(table2, 'device-b')
  const rows = (await db.query('select * from service_requests where resolved_at is null')).rows
  assert.equal(rows.length, 1)
  assert.equal(rows[0].session_id, traySession)
  assert.equal(rows[0].ping_count, 2)
})

test('ping dưới 10 giây bị throttle', async () => {
  await ping(table1, 'device-a')
  await rejected(() => ping(table1, 'device-a'), /Vui lòng chờ/)
  assert.equal((await db.query('select count(*) n from service_requests')).rows[0].n, 1)
})

test('resolve rồi ping tạo lượt mới', async () => {
  const first = await ping(table1, 'device-a')
  await login(staff)
  await resolve(first.id)
  assert.ok((await db.query('select resolved_at from service_requests where id=$1', [first.id])).rows[0].resolved_at)
  await db.exec('RESET ROLE')
  const second = await ping(table1, 'device-a')
  assert.notEqual(second.id, first.id)
})

test('staff không đóng bill; owner không đóng khi còn đơn chưa xác nhận', async () => {
  await login(staff)
  await rejected(() => close(traySession, 'paid'), /Chỉ chủ quán/)
  await login(owner)
  await db.query("insert into orders(id,store_id,session_id,status,order_source) values($1,$2,$3,'pending','staff')", [order, store, traySession])
  await rejected(() => close(traySession, 'paid'), /Còn 1 đơn chưa được chủ quán xác nhận/)
  await db.query("update orders set order_source='pos' where id=$1", [order])
  assert.equal((await close(traySession, 'paid')).already, false)
})

test('timeout 360 phút giữ phiên còn nợ để review', async () => {
  await db.query("update table_sessions set last_activity_at=now()-interval '361 minutes' where id=$1", [traySession])
  await expire(store)
  const row = (await db.query('select status from table_sessions where id=$1', [traySession])).rows[0]
  assert.equal(row.status, 'closed')
  const listed = await listSessions(store)
  assert.equal(listed[0].needs_review, true)
})
```

Thêm assertion permission trực tiếp: sau `SET LOCAL ROLE anon`, INSERT/UPDATE
`service_requests` đều reject `/permission denied/`; `ping_service_request` vẫn chạy được.

- [ ] **Step 2: Chạy test đỏ**

Run: `$env:PGLITE_MODULE=(Resolve-Path 'admin-web/node_modules/@electric-sql/pglite/dist/index.js').Path; node --test supabase/tests/050_pos_gate_service_requests.test.mjs`

Expected: FAIL vì migration 050 chưa tồn tại.

- [ ] **Step 3: Mở rộng service_requests và khóa ghi trực tiếp**

Thêm `session_id`, `resolved_at`, `resolved_by`, `last_ping_at`, `last_device_id`, `ping_count`; giữ
`table_id/table_number` snapshot. BL-0 chưa có `reservation_id`; migration BL-1 sẽ thêm FK đó.
`list_open_service_requests` chỉ trả row `resolved_at is null` thuộc store operator. Partial unique index:

```sql
create unique index service_requests_one_open_session
  on service_requests(store_id, session_id, type)
  where resolved_at is null and session_id is not null;
create unique index service_requests_one_open_table
  on service_requests(store_id, table_id, type)
  where resolved_at is null and session_id is null;
```

Chỉ chấp nhận type `call_staff`. Revoke INSERT/UPDATE anon/authenticated; mọi ghi qua SECURITY DEFINER RPC có `search_path` cố định và kiểm store/table/session.

- [ ] **Step 4: Sửa timeout và quyền**

`expire_stale_table_sessions` join `store_workflow_settings`, dùng `make_interval(mins => table_session_idle_timeout_minutes)`. Recreate `close_table_session`/bulk để `paid` và `staff_reset` yêu cầu active `store_owner`; staff chỉ còn RPC ghép mâm, thêm bàn, đặt hộ và resolve request.

Trước khi đóng bill, RPC đếm order `pending` có `order_source <> 'pos'`; nếu còn thì từ chối bằng
thông báo “Còn N đơn chưa được chủ quán xác nhận”. Đơn `order_source='pos'` được miễn vì chính chủ
quán đã thêm tay và không thuộc luồng bếp.

- [ ] **Step 5: Chạy test xanh**

Run: `$env:PGLITE_MODULE=(Resolve-Path 'admin-web/node_modules/@electric-sql/pglite/dist/index.js').Path; node --test supabase/tests/050_pos_gate_service_requests.test.mjs`

Expected: toàn bộ PASS và migration load lại an toàn.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/050_pos_gate_service_requests.sql supabase/tests/050_pos_gate_service_requests.test.mjs
git commit -m "feat: hang doi goi nhan vien va quyen dong bill"
```

### Task 7: Hàng đợi Gọi nhân viên trên POS và bỏ quyền thu tiền của staff

**Files:**
- Create: `admin-web/lib/actions/service-requests.ts`
- Create: `admin-web/lib/actions/service-requests.test.ts`
- Create: `admin-web/app/admin/cashier/service-request-queue.tsx`
- Modify: `admin-web/app/admin/cashier/page.tsx`
- Modify: `admin-web/app/admin/cashier/cashier-client.tsx`
- Modify: `admin-web/app/staff/tables/page.tsx`
- Modify: `admin-web/app/staff/tables/tables-client.tsx`
- Modify: `admin-web/lib/actions/table-session.ts`
- Modify: `admin-web/app/kitchen/[storeSlug]/kitchen-display.tsx`
- Modify: `admin-web/app/admin/cashier/bill-panel.tsx`

**Interfaces:**
- Produces `ServiceRequestRow`, `listOpenServiceRequests()`, `resolveServiceRequest(id)`.

- [ ] **Step 1: Viết action test đỏ**

```ts
it('owner và staff list request đúng store operator', async () => {
  mocks.operator.value = { role: 'store_staff', storeId: 'store-1' }
  await listOpenServiceRequests()
  expect(mocks.rpc).toHaveBeenCalledWith('list_open_service_requests', { p_store_id: 'store-1' })
})

it('resolve gọi đúng RPC và trả lỗi nghiệp vụ', async () => {
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Yêu cầu đã được xử lý' } })
  await expect(resolveServiceRequest('request-1')).resolves.toEqual({
    ok: false, error: 'Yêu cầu đã được xử lý',
  })
})

it('staff không gọi action đóng bill', async () => {
  mocks.operator.value = { role: 'store_staff', storeId: 'store-1' }
  await expect(closeTableSession('session-1', 'paid', 'cash')).resolves.toEqual({
    ok: false, error: 'Chỉ chủ quán được thu tiền hoặc bỏ bàn',
  })
  expect(mocks.rpc).not.toHaveBeenCalledWith('close_table_session', expect.anything())
})
```

- [ ] **Step 2: Implement action và queue UI**

Queue hiển thị một card mỗi session/table, thời gian gọi cuối, số lần bấm và nút **Đã xử lý**. Realtime event không cộng state tại chỗ: debounce rồi reload toàn bộ request mở để reconnect không mất hàng.

Kitchen Display hiện có listener cũ phải chuyển sang shape mới: chỉ báo request chưa resolve và
không giữ bản ghi đã đóng. Không xoá hỗ trợ quán khác dù Bảo Lương dùng POS.

- [ ] **Step 3: Nối queue vào POS**

`cashier-client.tsx` subscribe `service_requests` theo `store_id`, phát tối đa một chuông cho batch mới và mở đúng bàn/mâm khi bấm card. Request chỉ biến mất sau RPC resolve thành công.

- [ ] **Step 4: Siết UI staff**

`staff/tables/page.tsx` truyền role/canClose. Với staff, không render **Thu tiền & đóng bàn**, **Bỏ bàn** hoặc bulk close; giữ xem bill/ghép mâm/thêm bàn/xử lý Gọi nhân viên. Owner vẫn thấy đầy đủ.

`list_open_table_sessions` trả thêm `idle_timeout_minutes`. `bill-panel.tsx` và
`staff/tables/tables-client.tsx` bỏ chuỗi hardcode “6 giờ”, dùng giá trị server hoặc câu chung
“Phiên đã hết hạn do không hoạt động”; Bảo Lương vẫn hiển thị 6 giờ, quán khác theo cấu hình.

- [ ] **Step 5: Chạy test/typecheck**

Run: `cd admin-web; npm test; npx tsc --noEmit`

Expected: toàn bộ test PASS, typecheck exit 0.

- [ ] **Step 6: Commit**

```bash
git add admin-web/lib/actions admin-web/app/admin/cashier admin-web/app/staff/tables
git commit -m "feat: quan ly goi nhan vien tren POS"
```

### Task 8: Mini App entry context, capability và RPC Gọi nhân viên

**Files:**
- Create: `mini-app/src/types/workflow.types.ts`
- Create: `mini-app/src/services/workflow/workflow.api.ts`
- Create: `mini-app/src/utils/entry-context.ts`
- Create: `mini-app/src/utils/entry-context.test.ts`
- Create: `mini-app/src/services/service-request.ts`
- Create: `mini-app/src/services/service-request.test.ts`
- Modify: `mini-app/src/stores/app.store.ts`
- Modify: `mini-app/src/app.tsx`
- Modify: `mini-app/src/pages/menu/index.tsx`
- Modify: `mini-app/src/pages/checkout/index.tsx`
- Modify: `mini-app/src/pages/session-orders/index.tsx`
- Modify: `mini-app/src/types/database.types.ts`

**Interfaces:**
- Produces `EntryContext = { kind:'root' } | { kind:'table'; tableId:string; tableNumber:string }`.
- Produces `getPublicWorkflow(storeId)` và `pingCallStaff(tableId)`.
- Produces `rootCapabilities(workflow)` trả `{readOnlyMenu,pickup,delivery,reservation}`.

- [ ] **Step 1: Viết test đỏ parse context**

```ts
const PUBU_PUBLIC_WORKFLOW = {
  takeawayEnabled: true, shippingEnabled: true, reservationsEnabled: false,
}
const BAO_LUONG_PUBLIC_WORKFLOW = {
  takeawayEnabled: false, shippingEnabled: false, reservationsEnabled: true,
}

it('không có table trả root', () => {
  expect(parseEntryContext(new URLSearchParams('store=pho-ga-pubu'))).toEqual({ kind: 'root' })
})
it('table hợp lệ trả table context', () => {
  expect(parseEntryContext(new URLSearchParams('table=t1&tableNumber=B%C3%A0n%201')))
    .toEqual({ kind: 'table', tableId: 't1', tableNumber: 'Bàn 1' })
})
it('table thiếu id hoặc number trả root', () => {
  expect(parseEntryContext(new URLSearchParams('table=t1'))).toEqual({ kind: 'root' })
})
it('Pubu root có takeaway và shipping', () => {
  expect(rootCapabilities(PUBU_PUBLIC_WORKFLOW)).toEqual({ readOnlyMenu: false, pickup: true, delivery: true, reservation: false })
})
it('Bảo Lương root chỉ đọc menu ở BL-0', () => {
  expect(rootCapabilities(BAO_LUONG_PUBLIC_WORKFLOW)).toEqual({ readOnlyMenu: true, pickup: false, delivery: false, reservation: true })
})
```

- [ ] **Step 2: Chạy test đỏ**

Run: `cd mini-app; npm test -- --run src/utils/entry-context.test.ts`

Expected: FAIL vì module chưa tồn tại.

- [ ] **Step 3: Tạo parser và workflow loader**

`parseEntryContext(searchParams)` chỉ parse URL. `app.tsx` tải store rồi `get_public_store_workflow`; capability quyết định hành động. Không đặt default rải ở component; khi RPC lỗi, hiển thị lỗi tải cấu hình và không tự mở takeaway.

- [ ] **Step 4: Áp hành vi root/table**

Pubu root giữ banner Mang về/Ship và checkout hiện tại. Bảo Lương root vẫn xem menu nhưng nút thêm giỏ/checkout bị ẩn; hiển thị CTA **Đặt bàn trước** ở trạng thái “sẽ mở ở BL-3” chỉ trong môi trường dev, không submit Zalo ở BL-0. Table context giữ gọi món nếu `table_ordering_enabled=true`.

- [ ] **Step 5: Viết test đỏ cho service request**

```ts
it('gửi table/device vào RPC, không insert trực tiếp', async () => {
  await pingCallStaff('table-1')
  expect(mocks.rpc).toHaveBeenCalledWith('ping_service_request', {
    p_table_id: 'table-1', p_type: 'call_staff', p_device_id: 'device-1',
  })
  expect(mocks.from).not.toHaveBeenCalled()
})
```

- [ ] **Step 6: Chạy test để thấy đỏ**

Run: `cd mini-app; npm test -- --run src/services/service-request.test.ts`

Expected: FAIL vì `pingCallStaff` chưa tồn tại.

- [ ] **Step 7: Thay INSERT service_requests bằng RPC**

```ts
export async function pingCallStaff(tableId: string) {
  return supabase.rpc('ping_service_request', {
  p_table_id: tableId,
  p_type: 'call_staff',
  p_device_id: getDeviceId(),
  })
}
```

UI chỉ có một nút **Gọi nhân viên**, throttle client 60 giây để UX gọn; server vẫn throttle độc lập để chống bypass.

- [ ] **Step 8: Chạy test/typecheck**

Run: `cd mini-app; npm test; npm run typecheck`

Expected: toàn bộ test PASS và typecheck exit 0.

- [ ] **Step 9: Commit**

```bash
git add mini-app/src
git commit -m "feat: entry context va cau hinh Mini App theo quan"
```

### Task 9: Verify toàn BL-0, đồng bộ instance, tài liệu và cổng test

**Files:**
- Create: `docs/testing/bao-luong/SPRINT-BL-0.md`
- Modify: `TESTING.md`
- Modify: `AGENTS.md`
- Modify: `PRD.md`
- Modify: `ARCHITECTURE.md`

**Interfaces:**
- Produces checklist nghiệm thu duy nhất cho BL-0; không chuyển BL-1 trước PASS.

- [ ] **Step 1: Chạy toàn bộ SQL tests**

```powershell
$env:PGLITE_MODULE=(Resolve-Path 'admin-web/node_modules/@electric-sql/pglite/dist/index.js').Path
node --test supabase/tests/049_store_workflow_settings.test.mjs supabase/tests/050_pos_gate_service_requests.test.mjs supabase/tests/048_pos_table_areas.test.mjs
```

Expected: 0 failed.

- [ ] **Step 2: Chạy Admin Web đầy đủ**

```powershell
Set-Location admin-web
npm test
npx tsc --noEmit
npm run lint
npm run build
```

Expected: bốn lệnh exit 0.

- [ ] **Step 3: Chạy Mini App đầy đủ**

```powershell
Set-Location mini-app
npm test
npm run typecheck
```

Expected: hai lệnh exit 0.

- [ ] **Step 4: Đồng bộ và kiểm tra hai mini-app instance**

Chỉ thực hiện sau khi mọi thay đổi BL-0 đã commit và cả hai worktree instance sạch:

```powershell
$implementationBranch = git branch --show-current
git -C mini-app-instances/pho-ga-pubu status --short
git -C mini-app-instances/bia-lau-bao-luong status --short
git -C mini-app-instances/pho-ga-pubu merge $implementationBranch
git -C mini-app-instances/bia-lau-bao-luong merge $implementationBranch
npm --prefix mini-app-instances/pho-ga-pubu/mini-app test
npm --prefix mini-app-instances/pho-ga-pubu/mini-app run typecheck
npm --prefix mini-app-instances/bia-lau-bao-luong/mini-app test
npm --prefix mini-app-instances/bia-lau-bao-luong/mini-app run typecheck
```

Expected: hai lệnh `status` đầu không có output trước merge; hai merge không conflict; bốn lệnh
test/typecheck exit 0. Nếu instance bẩn hoặc merge conflict, dừng và báo anh Tú, không ghi đè thay
đổi trong worktree deploy.

- [ ] **Step 5: Viết checklist `SPRINT-BL-0.md`**

File test phải có bốn nhóm cụ thể:

1. Admin owner/MEVO: preset, lưu/reload, validation, audit, chặn staff.
2. Ma trận Pubu/Bảo Lương: root/table, prepay/postpay, staff/customer, POS confirmation.
3. Gọi nhân viên: một request/mâm, ping, realtime, reconnect, resolve, chống spam.
4. Quyền và phiên: staff không thu/Bỏ bàn; owner vẫn đóng; timeout 6 giờ không hoạt động.
5. Hai instance: Pubu vẫn Mang về/Ship; Bảo Lương root chỉ đọc menu và không có checkout.

Ghi chính xác migration cần apply và cách rollback an toàn trước khi test production. Không đưa checklist chi tiết vào `TESTING.md`.

- [ ] **Step 6: Cập nhật tài liệu nguồn sự thật**

AGENTS/PRD/ARCHITECTURE phải nêu `store_workflow_settings`, hai preset, quyền owner/MEVO,
public-safe reader và nguyên tắc không hardcode slug. Ghi trạng thái thủ tục Zalo App/OA Bảo
Lương là việc ngoài code cần khởi động song song: App ID `671794256689452743` đã có nhưng còn
xác minh/xét duyệt, OA chưa đăng ký; không báo đã hoàn thành nếu chưa có bằng chứng.

- [ ] **Step 7: Commit tài liệu và dừng**

```bash
git add docs/testing/bao-luong/SPRINT-BL-0.md TESTING.md AGENTS.md PRD.md ARCHITECTURE.md
git commit -m "docs: checklist nghiem thu BL-0"
```

Nói: *“Xong rồi anh, test theo `docs/testing/bao-luong/SPRINT-BL-0.md` — Test 1–4 nhé”*. Dừng và chờ `BL-0 PASS`; không viết/triển khai BL-1 trong cùng lượt.

## Sau cổng BL-0

Sau khi anh Tú xác nhận `BL-0 PASS`, viết plan riêng cho `BL-1 — Nền tảng đặt bàn`. Plan BL-1 bắt đầu ở migration 051 và tiêu thụ đúng public workflow/RPC đã nghiệm thu ở BL-0; không sửa ngược contract BL-0 trừ khi test thực tế phát hiện lỗi.
