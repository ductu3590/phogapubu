# POS Bill Editing — Sprint 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a store owner safely cancel, gift, restore, and add already-served items to an open postpay table bill from `/admin/cashier`, with correct totals, printouts, and kitchen behavior.

**Architecture:** Two forward-only SQL migrations own financial state and authorization. Migration 046 adds immutable void audit columns and three owner-only mutations; migration 047 updates bill-reader RPCs to project cancelled lines away and gift lines at zero. The POS receives detailed item rows through `list_open_table_sessions`, calls guarded server actions, then reloads server-calculated session state.

**Tech Stack:** PostgreSQL/Supabase RPCs, Next.js Server Actions, React 19, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-03-pos-cashier-bill-edit-design.md`

## Global Constraints

- Only `store_owner` may edit a bill; staff must be rejected in each RPC.
- Never trust totals, prices, stores, or item snapshots sent by the browser.
- POS-added items use `order_source='pos'`, are already served, and never enter the kitchen or TTS.
- A cancelled item remains auditable; a gift remains visible at 0đ; voucher orders cannot be edited.
- Preserve `045_pos_confirm_order.sql`. Use `046_pos_bill_edit.sql` and `047_bill_read_voids.sql`; migration 047 is intentionally not rerun-safe.
- All UI copy and complex-logic comments are Vietnamese.

---

### Task 1: Model editable bill state and exclude POS orders from kitchen

**Files:**
- Create: `admin-web/lib/pos-bill.ts`
- Create: `admin-web/lib/pos-bill.test.ts`
- Modify: `admin-web/lib/kitchen-announce.ts`
- Modify: `admin-web/lib/kitchen-announce.test.ts`

**Interfaces:**
- Produces `isEditableOrder({ paymentReceivedAt, status, voucherId })` and `isVisibleBillItem({ voidType })`.
- `orderInKitchen` returns false whenever `orderSource === 'pos'`.

- [ ] **Step 1: Write failing tests**

```ts
it('never sends a POS-added item to the kitchen', () => {
  expect(orderInKitchen(o({ orderSource: 'pos', status: 'pending' }))).toBe(false)
})
it('allows only unpaid, non-cancelled, non-voucher orders to be edited', () => {
  expect(isEditableOrder({ paymentReceivedAt: null, status: 'confirmed', voucherId: null })).toBe(true)
  expect(isEditableOrder({ paymentReceivedAt: '2026-09-07T00:00:00Z', status: 'confirmed', voucherId: null })).toBe(false)
})
```

- [ ] **Step 2: Verify RED**

Run: `cd admin-web && npx vitest run lib/kitchen-announce.test.ts lib/pos-bill.test.ts`

Expected: FAIL because the POS predicate and module do not exist.

- [ ] **Step 3: Implement minimally**

```ts
export function isEditableOrder(input: EditableOrder): boolean {
  return input.paymentReceivedAt === null && input.status !== 'cancelled' && input.voucherId === null
}
export function orderInKitchen(o: KitchenPredicateFields): boolean {
  if (o.orderSource === 'pos') return false
  // retain existing payment timing rules
}
```

- [ ] **Step 4: Verify GREEN**

Run: `cd admin-web && npx vitest run lib/kitchen-announce.test.ts lib/pos-bill.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add admin-web/lib/kitchen-announce.ts admin-web/lib/kitchen-announce.test.ts admin-web/lib/pos-bill.ts admin-web/lib/pos-bill.test.ts
git commit -m "feat(pos): them predicate sua bill va chan mon POS vao bep"
```

### Task 2: Add audited owner-only database mutations

**Files:**
- Create: `supabase/migrations/046_pos_bill_edit.sql`

**Interfaces:**
- Produces `pos_void_order_item(uuid,text,text)`, `pos_restore_order_item(uuid)`, and `pos_add_manual_items(uuid,jsonb,uuid)`.
- All mutations return JSON with `ok`, optional `already`, and optional `order_id`.

- [ ] **Step 1: Put acceptance cases beside the SQL**

```sql
-- store_staff caller raises 'Chỉ chủ quán mới sửa được bill'.
-- voided item remains in order_items with voided_by/voided_at.
-- repeated p_client_request_id creates only one POS order.
```

- [ ] **Step 2: Add schema state**

```sql
alter table order_items add column if not exists void_type text;
alter table order_items add column if not exists voided_at timestamptz;
alter table order_items add column if not exists voided_by uuid references auth.users(id);
alter table order_items add column if not exists void_reason text;
alter table orders drop constraint if exists orders_order_source_check;
alter table orders add constraint orders_order_source_check
  check (order_source in ('customer_zalo','staff','pos'));
```

- [ ] **Step 3: Implement the helpers and three RPCs**

`recompute_order_total` sums only rows where `void_type is null`, including snapshot toppings. Every RPC checks owner, unpaid, non-cancelled, and no voucher. `pos_add_manual_items` validates the menu item, each topping, and required variants from DB before inserting a `pending` POS order.

- [ ] **Step 4: Apply 046 and exercise ownership/idempotency in Supabase**

Expected: owner succeeds, staff fails, and a repeated client UUID returns the original POS order.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/046_pos_bill_edit.sql
git commit -m "feat(db): them sua bill POS co audit"
```

### Task 3: Project void state into every bill reader

**Files:**
- Create: `supabase/migrations/047_bill_read_voids.sql`
- Modify: `admin-web/lib/actions/table-session.ts`

**Interfaces:**
- `SessionOrderItem` gains `id`, `price`, `toppings`, `void_type`, `void_reason`, and `is_gift`.
- `get_table_session_bill`, `list_open_table_sessions`, and `get_sessions_bill` omit cancelled lines but retain gifts at zero.

- [ ] **Step 1: Document the database fixture**

```sql
-- Normal 50k + cancelled 30k + gift 20k => total 50k.
-- Reader lists normal 50k and gift 'Tặng' 0đ; cancelled line is absent.
```

- [ ] **Step 2: Replace exactly the three readers in migration 047**

Keep their authorization and session semantics. Update only JSON item projection and leave `close_table_session`, `create_order`, and `staff_create_order` untouched.

- [ ] **Step 3: Update transport types**

```ts
export type SessionOrderItem = {
  id: string; name: string; quantity: number; price: number
  toppings: { id: string; name: string; price: number }[]
  void_type: 'cancelled' | 'gift' | null; void_reason: string | null; is_gift: boolean
}
```

- [ ] **Step 4: Apply 047 and inspect a real bill**

Expected: cancelled values never affect totals/printed rows; gift rows render at zero.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/047_bill_read_voids.sql admin-web/lib/actions/table-session.ts
git commit -m "feat(db): hien dung mon huy va tang tren bill"
```

### Task 4: Expose guarded server actions and owner-scoped menu data

**Files:**
- Modify: `admin-web/lib/actions/pos-order.ts`
- Create: `admin-web/lib/actions/pos-order.test.ts`
- Modify: `admin-web/app/admin/cashier/page.tsx`
- Modify: `admin-web/app/admin/cashier/cashier-client.tsx`

**Interfaces:**
- Exports `voidPosOrderItem`, `restorePosOrderItem`, and `addPosManualItems`, all guarded by `requireStoreOwnerStoreId()`.
- `CashierClient` receives the same owner-scoped category/item/topping/variant payload as the menu page.

- [ ] **Step 1: Write failing server-action tests**

```ts
it('does not call RPC when the owner guard rejects', async () => {
  mocks.requireStoreOwnerStoreId.mockRejectedValue(new Error('Không có quyền'))
  await expect(voidPosOrderItem('item-1', 'gift', null)).resolves.toEqual({ ok: false, error: 'Không có quyền' })
  expect(mocks.rpc).not.toHaveBeenCalled()
})
it('sends only identifiers and request UUID to pos_add_manual_items', async () => {
  await addPosManualItems('session-1', [{ menu_item_id: 'm1', quantity: 1, topping_ids: [], variant_id: null, note: null }], 'req-1')
  expect(mocks.rpc).toHaveBeenCalledWith('pos_add_manual_items', expect.objectContaining({ p_session_id: 'session-1', p_client_request_id: 'req-1' }))
})
```

- [ ] **Step 2: Verify RED**

Run: `cd admin-web && npx vitest run lib/actions/pos-order.test.ts`

Expected: FAIL because the new actions do not exist.

- [ ] **Step 3: Implement actions and menu query**

Use the authenticated Supabase client. The menu is display data only; the RPC remains the authority for price, availability, variants, and toppings.

- [ ] **Step 4: Verify GREEN**

Run: `cd admin-web && npx vitest run lib/actions/pos-order.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add admin-web/lib/actions/pos-order.ts admin-web/lib/actions/pos-order.test.ts admin-web/app/admin/cashier/page.tsx admin-web/app/admin/cashier/cashier-client.tsx
git commit -m "feat(pos): them server action sua bill cho chu quan"
```

### Task 5: Build POS controls, print behavior, and kitchen cancellation feedback

**Files:**
- Create: `admin-web/app/admin/cashier/manual-item-sheet.tsx`
- Modify: `admin-web/app/admin/cashier/bill-panel.tsx`
- Modify: `admin-web/app/admin/cashier/cashier-client.tsx`
- Modify: `admin-web/app/kitchen/[storeSlug]/kitchen-display.tsx`
- Modify: `admin-web/app/admin/cashier/print-order/page.tsx`
- Modify: `admin-web/app/admin/cashier/print-order/print-order.tsx`

**Interfaces:**
- `ManualItemSheet` emits only `{ menu_item_id, quantity, topping_ids, variant_id, note }[]`.
- The bill panel calls void/restore/add callbacks; client creates one `crypto.randomUUID()` per add and reloads after success.

- [ ] **Step 1: Add a failing pure UI-state test**

```ts
it('shows gifts at zero while excluding cancelled lines', () => {
  expect(isVisibleBillItem({ voidType: 'cancelled' })).toBe(false)
  expect(displayedLinePrice({ price: 50000, voidType: 'gift' })).toBe(0)
})
```

- [ ] **Step 2: Implement controls without changing settlement**

Render individual order-item lines when edit mode is available. Offer “Khách bỏ món”, “Tặng khách”, and “Hoàn tác”; collect optional cancellation reason; disable edits for paid/cancelled/voucher orders. Add “+ Thêm món (không báo bếp)” using the existing staff-order variant/topping selection pattern.

- [ ] **Step 3: Update kitchen and print views**

On an order UPDATE, refetch the affected order items. Draw cancelled kitchen items red and struck through with “Khách bỏ”. Exclude POS orders through the shared predicate. POS slips exclude cancelled items and render gifts as “Tặng 0đ”.

- [ ] **Step 4: Verify focused tests**

Run: `cd admin-web && npx vitest run lib/pos-bill.test.ts lib/kitchen-announce.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add admin-web/app/admin/cashier admin-web/app/kitchen/[storeSlug]/kitchen-display.tsx admin-web/lib/pos-bill.ts admin-web/lib/pos-bill.test.ts
git commit -m "feat(pos): sua bill huy tang va them mon tay"
```

### Task 6: Verify and stop for manual PASS

**Files:**
- Modify: `TESTING.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Run the full automated suite**

Run: `cd admin-web && npx tsc --noEmit && npx vitest run && npm run lint && npm run build`

Expected: all commands exit 0.

- [ ] **Step 2: Add manual tests**

Cover cancellation total/kitchen strike-through; gift “Tặng 0đ”; POS manual order absent from kitchen/TTS; restore; staff RPC denial; paid/voucher lockout; and settlement revenue matching printed bill.

- [ ] **Step 3: Record migration numbering and invariant**

Document: 045 confirmation/printing, 046 bill mutations, 047 non-rerunnable reader replacements.

- [ ] **Step 4: Commit**

```bash
git add TESTING.md CLAUDE.md
git commit -m "docs: checklist test Sprint 2 sua bill POS"
```

- [ ] **Step 5: Stop**

Say exactly: `Xong rồi anh, test theo TESTING.md — Sprint 2 sửa bill POS nhé` and wait for `PASS`.

