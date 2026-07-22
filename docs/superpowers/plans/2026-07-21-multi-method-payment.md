# Multi-Method Payment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vá bug "notify = đã trả tiền" (đang cho ăn free trên prod), gộp mọi luật "đã thu tiền" về một cột `payment_received_at`, và dựng nền (cột, instrument, đuôi) cho thanh toán đa phương thức — **thuần additive, không rename, không phá checkout prod**.

**Architecture:** Supabase Postgres (RPC SECURITY DEFINER + RLS) là source of truth; edge functions Deno cho Zalo Checkout; admin-web Next.js 16 + mini-app Zalo. Logic thuần (doanh thu, báo bếp, badge, quyết định notify) tách ra module test được (vitest); logic DB test bằng SQL tay + checklist theo nếp SA-1…SA-5.

**Tech Stack:** PostgreSQL, Supabase MCP (`apply_migration`/`execute_sql`), Deno edge functions, Next.js 16, TypeScript, vitest.

---

## ⚠️ Hai quyết định nền (đọc trước khi code)

1. **PM-1 THUẦN ADDITIVE — KHÔNG rename `zalopay`→`zalo_checkout`.** Mini-app prod hardcode
   `"zalopay"` (`mini-app/src/pages/checkout/index.tsx:60,176,450`) và bản mới phải publish qua
   Zalo (không tức thì). Rename + siết CHECK trước khi mini-app lên = **checkout pilot hỏng ngay**.
   Mọi luật doanh thu/vào bếp key theo `payment_received_at`/`order_source`/`payment_method IN
   ('cash','bank_transfer')` — **không cần tên kênh**. Rename tách thành **rollout riêng** (cuối
   file). Quyết định 2026-07-21 (review deploy-safety).
2. **Nền tảng ĐÃ deploy prod:** staff spec (mig `028`+`029`) đang chạy. Cột
   `payment_received_at`/`payment_received_by`/`order_source`/`created_by`/`client_request_id`,
   `staff_create_order`, `confirm_manual_payment`, `get_daily_revenue` (nhánh bank) **đã tồn tại**.
   Migration mới của PM là **`030`** (KHÔNG phải 029).

**Spec nguồn:** [`2026-07-15-multi-method-payment-design.md`](../specs/2026-07-15-multi-method-payment-design.md) — mọi "§x" trỏ vào đó.

## Phạm vi

- **PM-1** (dưới, bite-sized đầy đủ): additive migration + vá bug notify + gộp doanh thu. Sprint quan trọng nhất, chứa 2 P0. Xong → **DỪNG, test `TESTING-PM1.md`, chờ anh Tú PASS.**
- **PM-2** (task-level): predicate `order_source` + đuôi `payment_amount` + vá `cancel_order`. Mở bite-sized khi bắt đầu.
- **PM-3 / PM-4 / PM-5 / Rename rollout** (roadmap): mở plan riêng khi tới.

---

## File Structure (PM-1)

| File | Trách nhiệm | Thao tác |
|---|---|---|
| `supabase/migrations/030_multi_method_payment.sql` | Cột mới + constraint + index (trống) + backfill + rewrite `create_order`/`staff_create_order`/`confirm_manual_payment`/`get_daily_revenue`/`voucher_uses`/`get_spin_state`/`spin_wheel` | Create |
| `admin-web/lib/revenue.ts` + `.test.ts` | `hasRealMoney` → `payment_received_at` | Modify |
| `supabase/functions/checkout-notify/decide.ts` | **Logic THUẦN**: phân loại payload + quyết định mutation (không import Deno) | Create |
| `supabase/functions/checkout-notify/decide.test.ts` | vitest cho 8 kịch bản notify | Create |
| `supabase/functions/checkout-notify/index.ts` | Gọi `decide()` rồi apply patch; BANK thôi confirm | Modify |
| `TESTING.md` | Thêm section + link PM-1 | Modify |
| `TESTING-PM1.md` | Checklist nghiệm thu tay | Create |

**KHÔNG đụng ở PM-1** (để rename rollout): 2 union TS `PaymentMethod`, `mini-app/src/pages/checkout|payment`, `orders_payment_method_check`, `stores_payment_methods_valid`.

---

## Prerequisites

- [ ] **P0: Worktree cô lập** qua superpowers:using-git-worktrees, nhánh `feat/multi-method-payment-pm1`.
- [ ] **P1: Số migration** — `ls -1 supabase/migrations/ | tail -3` phải kết ở `029_staff_active_toggle.sql`. Nếu đã có `030`, tăng số.
- [ ] **P2: Snapshot prod ngay trước migration** (không hard-code số):

Run (Supabase MCP `execute_sql`):
```sql
select payment_method, count(*),
  count(*) filter (where zalopay_trans_id like 'BANK:%') as bank,
  count(*) filter (where zalopay_trans_id is not null and zalopay_trans_id not like 'BANK:%') as wallet,
  count(*) filter (where payment_received_at is not null) as has_paid_at,
  count(*) filter (where payment_received_by is not null and payment_received_at is not null) as owner_confirmed
from orders group by payment_method;
```
Ghi lại snapshot vào commit message. **Kiểm invariant** (không phải số tuyệt đối): mọi đơn có `zalopay_trans_id` là `zalopay`; `owner_confirmed` = số đơn sẽ cần backfill `via='owner'`.

---

## PM-1 — Additive: vá bug + ba cột + gộp doanh thu

### Task 1: Migration 030 — schema additive (KHÔNG rename)

**Files:** Create `supabase/migrations/030_multi_method_payment.sql`

- [ ] **Step 1: Mở file + phần cột** (chưa constraint 3-state, chưa NOT NULL)

```sql
-- 030_multi_method_payment.sql — PM-1 ADDITIVE (spec 2026-07-15-multi-method-payment-design.md)
-- KHÔNG rename kênh, KHÔNG siết CHECK payment_method/payment_methods (callout §5).
begin;

alter table orders
  add column if not exists payment_instrument   text null,
  add column if not exists payment_received_via  text null,
  add column if not exists bank_handoff_at        timestamptz null,
  add column if not exists has_payment_tail       boolean not null default false,
  add column if not exists payment_amount         int null;   -- default 0 + NOT NULL ở Task 2

alter table stores
  add column if not exists kitchen_can_confirm_cash boolean not null default false;

alter table orders drop constraint if exists orders_payment_instrument_check;
alter table orders add constraint orders_payment_instrument_check
  check (payment_instrument in ('wallet','bank','momo','vnpay','cash'));

alter table orders drop constraint if exists orders_payment_received_via_check;
alter table orders add constraint orders_payment_received_via_check
  check (payment_received_via in ('zalo_callback','sepay','kitchen','owner','legacy'));
```

- [ ] **Step 2:** Để `begin;` mở; constraint 3-state + NOT NULL + index nằm SAU backfill (Task 2). `commit;` ở cuối Task 5.

---

### Task 2: Migration 030 — backfill + constraint 3-state + NOT NULL + index

**Files:** Modify `030_multi_method_payment.sql`

- [ ] **Step 1: Backfill (KHÔNG có bước rename)**

```sql
-- Instrument (chỉ báo cáo). bank_transfer KHÔNG có zalopay_trans_id nên cần nhánh riêng (§3.2).
update orders set payment_instrument='bank'   where zalopay_trans_id like 'BANK:%';
update orders set payment_instrument='wallet' where zalopay_trans_id is not null and zalopay_trans_id not like 'BANK:%';
update orders set payment_instrument='cash'   where payment_method='cash';
update orders set payment_instrument='bank'   where payment_method='bank_transfer' and payment_instrument is null;

-- Nguồn sự thật: ví đã trả (29) → zalo_callback
update orders set payment_received_at=updated_at, payment_received_via='zalo_callback'
 where payment_instrument='wallet';

-- Legacy tiền mặt đã thu
update orders set payment_received_at=updated_at, payment_received_via='legacy'
 where payment_method='cash' and status='paid' and payment_received_at is null;

-- ⚠️ Đơn do confirm_manual_payment (028) xác nhận: có at+by, chưa có via → 'owner'
-- (không có bước này thì constraint 3-state VỠ NGAY lúc ADD)
update orders set payment_received_via='owner'
 where payment_received_at is not null and payment_received_via is null and payment_received_by is not null;

-- 7 đơn BANK cũ: có handoff, KHÔNG bằng chứng tiền về (§1.1) → rời doanh thu
update orders set zalopay_trans_id=null, bank_handoff_at=updated_at,
       payment_received_at=null, payment_received_via=null
 where payment_instrument='bank' and zalopay_trans_id like 'BANK:%';

-- payment_amount đơn cũ = total_amount (has_payment_tail giữ false)
update orders set payment_amount=total_amount where payment_amount is null;
```

- [ ] **Step 2: Constraint 3-state + default 0 + NOT NULL + index (SAU backfill)**

```sql
alter table orders drop constraint if exists orders_payment_received_state_check;
alter table orders add constraint orders_payment_received_state_check check (
  (payment_received_at is null and payment_received_via is null and payment_received_by is null)
  or (payment_received_at is not null and payment_received_via='owner' and payment_received_by is not null)
  or (payment_received_at is not null and payment_received_via in ('zalo_callback','sepay','kitchen','legacy') and payment_received_by is null)
);

alter table orders alter column payment_amount set default 0;   -- đỡ INSERT đầu create_order (§5.3a)
alter table orders alter column payment_amount set not null;

-- Index cấp đuôi — lọc theo has_payment_tail (đóng băng), KHÔNG đọc stores config (§5.3). Trống
-- tới PM-2 (has_payment_tail toàn false). KHÔNG dùng now() trong predicate (Postgres cấm — §5.3).
create unique index if not exists orders_pending_payment_amount_unique
  on orders(store_id, payment_amount)
  where has_payment_tail = true and payment_received_at is null and status <> 'cancelled';
```

- [ ] **Step 3: Verify (execute_sql sau khi apply nháp hoặc `do $$ assert`)**

```sql
select count(*) from orders where payment_instrument='bank' and payment_received_at is not null; -- 0 (7 BANK đã rời)
select count(*) from orders where payment_instrument='wallet' and payment_received_at is not null; -- = wallet snapshot
select count(*) from orders where payment_received_at is not null and payment_received_via is null; -- 0 (constraint)
```
Expected: 0 đơn vi phạm 3-state; 7 BANK rời doanh thu; ví giữ nguyên.

---

### Task 3: Migration 030 — `create_order` + `staff_create_order` set `payment_amount`

**Files:** Modify `030_multi_method_payment.sql`

- [ ] **Step 1: `create_order`** — copy NGUYÊN [`027_vouchers.sql:169-266`](../../supabase/migrations/027_vouchers.sql) (11 tham số), **giữ validation `('zalopay','cash')`** (KHÔNG rename), chỉ thêm `payment_amount` ở UPDATE cuối:

```sql
-- Chỉ thay đổi so với 027: UPDATE cuối set payment_amount. Giữ nguyên MỌI thứ khác kể cả
-- 'zalopay' (rename ở rollout riêng). COPY ĐẦY ĐỦ phần thân 027:181-257.
create or replace function create_order( /* …11 tham số y hệt 027… */ )
returns jsonb language plpgsql security definer set search_path = public as $$
declare /* …y hệt 027… */ begin
  if p_payment_method not in ('zalopay','cash') then raise exception 'payment_method không hợp lệ: %', p_payment_method; end if;
  -- … COPY NGUYÊN 027:183-257 (order_type, store_accepting_now, loop món, voucher) …
  update orders set total_amount = v_total - v_discount,
                    payment_amount = v_total - v_discount,   -- ← THÊM (PM-1, chưa đuôi)
                    discount_amount = v_discount, voucher_id = v_voucher.id
   where id = v_order.id returning * into v_order;
  return to_jsonb(v_order);
end; $$;
revoke all on function create_order(uuid,uuid,jsonb,text,text,text,text,text,text,text,text) from public;
grant execute on function create_order(uuid,uuid,jsonb,text,text,text,text,text,text,text,text) to anon;
```

- [ ] **Step 2: `staff_create_order`** — copy NGUYÊN bản MỚI NHẤT [`029_staff_active_toggle.sql`](../../supabase/migrations/029_staff_active_toggle.sql) (giữ kiểm `mevo_operators.is_active`, `store_accepting_now`, idempotency `client_request_id`), thêm **instrument lúc INSERT** + **payment_amount lúc UPDATE cuối**:

```sql
-- COPY NGUYÊN 029 staff_create_order. Hai thay đổi:
-- (a) INSERT thêm cột payment_instrument:
insert into orders (
  store_id, table_id, total_amount, payment_method, status,
  note, order_source, created_by, client_request_id, payment_instrument   -- ← thêm cột
) values (
  v_store, p_table_id, 0, p_payment_method, 'pending',
  p_note, 'staff', v_uid, p_client_request_id,
  case p_payment_method when 'bank_transfer' then 'bank' else 'cash' end   -- ← §3.2
)
on conflict (store_id, client_request_id) where client_request_id is not null do nothing
returning id into v_order_id;
-- (b) UPDATE cuối (029:173):
update orders set total_amount = v_total, payment_amount = v_total where id = v_order_id;  -- ← thêm payment_amount
```

> ⚠️ Bỏ Step 2 = mọi đơn staff mới `payment_amount=0` + instrument NULL (review P1 #3).

---

### Task 4: Migration 030 — `confirm_manual_payment` set `via='owner'` (P0)

**Files:** Modify `030_multi_method_payment.sql`

- [ ] **Step 1: Rewrite** — copy NGUYÊN [`028:372-413`](../../supabase/migrations/028_staff_assisted_ordering.sql), thêm một dòng `payment_received_via`:

```sql
create or replace function confirm_manual_payment(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order orders%rowtype;
begin
  select * into v_order from orders where id = p_order_id;
  if not found then raise exception 'Không tìm thấy đơn'; end if;
  if v_order.payment_method not in ('cash','bank_transfer') then
    raise exception 'Chỉ xác nhận tay đơn tiền mặt/chuyển khoản'; end if;   -- (nới zalo_checkout ở PM-3)
  if v_order.payment_received_at is not null then
    return jsonb_build_object('already', true, 'received_at', v_order.payment_received_at); end if;
  update orders set payment_received_at = now(),
                    payment_received_via = 'owner',        -- ← THÊM (P0: không có = vỡ 3-state)
                    payment_received_by = auth.uid()
   where id = p_order_id;
  return jsonb_build_object('ok', true);
end; $$;
revoke all on function confirm_manual_payment(uuid) from public;
revoke all on function confirm_manual_payment(uuid) from anon;
grant execute on function confirm_manual_payment(uuid) to authenticated;
```
> ⚠️ Giữ **owner-only guard thật** của 028 (nếu 028 dùng helper `is_store_owner_or_admin()` bên trong — mở 028 kiểm và copy nguyên, đoạn trên là khung).

---

### Task 5: Migration 030 — gộp predicate "đã thanh toán"; `commit;`

**Files:** Modify `030_multi_method_payment.sql`

- [ ] **Step 1: `get_daily_revenue`** — một luật `payment_received_at` (giữ chữ ký 028).

```sql
-- COPY chữ ký get_daily_revenue của 028 (tên tham số/cột trả về), thay thân:
--   total_revenue/order_count: payment_received_at is not null and status<>'cancelled'
--   cash_pending: payment_received_at is null and status not in ('cancelled') and payment_method in ('cash','bank_transfer')
```

- [ ] **Step 2: `voucher_uses` (027:82) — GIỮ nhánh cash** (review P1 #5):

```sql
create or replace function voucher_uses(p_voucher_id uuid, p_since timestamptz default null)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from orders o
  where o.voucher_id = p_voucher_id and o.status <> 'cancelled'
    and (o.payment_method = 'cash'                 -- ← GIỮ: cash vào bếp ngay = chiếm lượt ngay
         or o.payment_received_at is not null
         or o.created_at > now() - interval '30 minutes')
    and (p_since is null or o.created_at >= p_since);
$$;
```
> Bỏ nhánh `cash` = đơn cash đã làm/giao sau 30' nhả lượt → vượt `max_uses`. `bank_transfer` là staff-only, không dùng voucher → không cần nhánh riêng.

- [ ] **Step 3: `get_spin_state` (027:287) + `spin_wheel` (027:335)** — copy nguyên hai hàm, thay dòng `v_paid`:

```sql
  v_paid := v_order.payment_received_at is not null and v_order.status <> 'cancelled'
            and v_order.order_source = 'customer_zalo' and v_order.zalo_user_id is not null;
```
> `order_source='customer_zalo' AND zalo_user_id is not null` chặn đơn staff quay (Rủi ro #6).

- [ ] **Step 4:** `commit;` cuối file.

- [ ] **Step 5: Apply** (Supabase MCP `apply_migration`, name `030_multi_method_payment`). Được phép tự chạy (feedback apply-SQL-via-MCP).

- [ ] **Step 6: Verify**

```sql
-- owner confirm không vỡ constraint: thử một đơn cash test
select payment_received_via, payment_received_by is not null from orders
where payment_received_via='owner' limit 3;   -- via='owner' + by not null, hợp lệ 3-state
```

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/030_multi_method_payment.sql
git commit -m "feat(payment): mig 030 additive — vá bug notify, ba cột, gộp doanh thu, via=owner (PM-1)"
```

---

### Task 6: `admin-web/lib/revenue.ts` — luật TS về `payment_received_at`

**Files:** Modify `admin-web/lib/revenue.ts` + `.test.ts`

- [ ] **Step 1: Sửa test (đỏ)** — thêm case:

```ts
it('zalopay đã callback (payment_received_at) → có tiền', () => {
  expect(hasRealMoney({ payment_method:'zalopay', status:'confirmed',
    zalopay_trans_id:'123', payment_received_at:'2026-07-21T00:00:00Z' })).toBe(true)
})
it('zalopay BANK chưa payment_received_at → CHƯA có tiền (bug §1.1 đã vá)', () => {
  expect(hasRealMoney({ payment_method:'zalopay', status:'confirmed',
    zalopay_trans_id:null, payment_received_at:null })).toBe(false)
})
it('bank_transfer đã xác nhận tay → có tiền', () => {
  expect(hasRealMoney({ payment_method:'bank_transfer', status:'pending',
    zalopay_trans_id:null, payment_received_at:'2026-07-21T00:00:00Z' })).toBe(true)
})
```

- [ ] **Step 2: Run → đỏ** — `cd admin-web && npx vitest run lib/revenue.test.ts` → FAIL (case BANK chưa-trả trả true theo luật cũ đọc `zalopay_trans_id`).

- [ ] **Step 3: Rewrite `hasRealMoney`** (channel-agnostic, không đọc `zalopay_trans_id` nữa):

```ts
export function hasRealMoney(o: MoneyFields): boolean {
  if (o.status === 'cancelled') return false
  if (o.payment_received_at !== null) return true          // nguồn sự thật duy nhất (§4)
  if (o.payment_method === 'cash' && o.status === 'paid') return true  // legacy cash cũ
  return false
}
```
> Giữ `zalopay_trans_id` trong type `MoneyFields` (badge/đối soát dùng), nhưng KHÔNG còn là căn cứ tính tiền.

- [ ] **Step 4: Run → xanh** — `npx vitest run lib/revenue.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add admin-web/lib/revenue.ts admin-web/lib/revenue.test.ts
git commit -m "feat(payment): hasRealMoney = payment_received_at, bỏ căn cứ zalopay_trans_id (PM-1)"
```

---

### Task 7: `checkout-notify` — tách logic thuần + test + hardening

**Files:** Create `supabase/functions/checkout-notify/decide.ts` + `decide.test.ts`; Modify `index.ts`

- [ ] **Step 1: `decide.ts`** — hàm THUẦN (không import), nhận payload + order, trả quyết định:

```ts
// Pure — không network, không Deno. Test bằng vitest; index.ts (Deno) import lại.
export type NotifyPayload = { method?: string; resultCode?: unknown; amount?: unknown; transId?: unknown }
export type OrderRow = { status: string; total_amount: number; payment_received_at: string | null; bank_handoff_at: string | null }
export type Decision =
  | { action: 'ignore'; reason: string }
  | { action: 'reject'; reason: string }
  | { action: 'bank_handoff'; patch: { bank_handoff_at: string; payment_instrument: 'bank' } }
  | { action: 'wallet_confirm'; patch: { status:'confirmed'; zalopay_trans_id:string; payment_received_at:string; payment_received_via:'zalo_callback'; payment_received_by:null; payment_instrument:'wallet'|'momo'|'vnpay'|null } }

const WALLET_METHODS: Record<string, 'wallet'|'momo'|'vnpay'> = { zalopay:'wallet', wallet:'wallet' }
// momo/vnpay CHƯA test (Rủi ro #1) → cố ý KHÔNG map ở PM-1; method lạ → instrument null.

export function decideNotify(p: NotifyPayload, order: OrderRow, nowIso: string): Decision {
  const isCustom = p.resultCode == null
  if (isCustom) {
    // Chỉ method BANK đã whitelist. Method lạ = fail-closed thật (Rủi ro #1).
    if (p.method !== 'BANK') return { action: 'ignore', reason: 'unknown custom method' }
    if (order.status === 'cancelled') return { action: 'ignore', reason: 'cancelled' }
    if (order.payment_received_at !== null) return { action: 'ignore', reason: 'already paid (ví callback tới trước)' }
    if (order.status !== 'pending') return { action: 'ignore', reason: 'not pending' }
    if (order.bank_handoff_at !== null) return { action: 'ignore', reason: 'handoff đã set (idempotent)' }
    return { action: 'bank_handoff', patch: { bank_handoff_at: nowIso, payment_instrument: 'bank' } }
  }
  if (Number(p.resultCode) !== 1) return { action: 'ignore', reason: 'payment failed' }
  if (Number(p.amount) !== Number(order.total_amount)) return { action: 'reject', reason: 'amount mismatch' }
  if (order.payment_received_at !== null) return { action: 'ignore', reason: 'already paid (idempotent)' }
  return { action: 'wallet_confirm', patch: {
    status:'confirmed', zalopay_trans_id:String(p.transId), payment_received_at: nowIso,
    payment_received_via:'zalo_callback', payment_received_by:null,
    payment_instrument: WALLET_METHODS[String(p.method ?? '').toLowerCase()] ?? null } }
}
```

- [ ] **Step 2: `decide.test.ts`** — 8 kịch bản (review P1 #7):

```ts
import { describe, expect, it } from 'vitest'
import { decideNotify } from './decide'
const ord = (o = {}) => ({ status:'pending', total_amount:105000, payment_received_at:null, bank_handoff_at:null, ...o })
const NOW = '2026-07-21T00:00:00Z'
describe('decideNotify', () => {
  it('BANK hợp lệ → handoff, KHÔNG confirm', () => {
    expect(decideNotify({ method:'BANK' }, ord(), NOW)).toMatchObject({ action:'bank_handoff' }) })
  it('custom method lạ → ignore, không mutation', () => {
    expect(decideNotify({ method:'FOO' }, ord(), NOW).action).toBe('ignore') })
  it('BANK trên đơn đã nhận tiền (ví tới trước) → ignore, không ghi đè', () => {
    expect(decideNotify({ method:'BANK' }, ord({ payment_received_at:NOW }), NOW).action).toBe('ignore') })
  it('BANK lặp (handoff đã set) → ignore', () => {
    expect(decideNotify({ method:'BANK' }, ord({ bank_handoff_at:NOW }), NOW).action).toBe('ignore') })
  it('ví thành công → wallet_confirm đủ 5 trường', () => {
    const d = decideNotify({ resultCode:1, amount:105000, transId:'T1', method:'zalopay' }, ord(), NOW)
    expect(d).toMatchObject({ action:'wallet_confirm', patch:{ payment_received_via:'zalo_callback', payment_instrument:'wallet' } }) })
  it('ví thất bại (resultCode≠1) → ignore, không ghi tiền', () => {
    expect(decideNotify({ resultCode:0, amount:105000 }, ord(), NOW).action).toBe('ignore') })
  it('ví amount mismatch → reject', () => {
    expect(decideNotify({ resultCode:1, amount:999, transId:'T1' }, ord(), NOW).action).toBe('reject') })
  it('ví lặp (đã nhận tiền) → ignore', () => {
    expect(decideNotify({ resultCode:1, amount:105000, transId:'T1' }, ord({ payment_received_at:NOW }), NOW).action).toBe('ignore') })
})
```

- [ ] **Step 3: Run test** — `cd admin-web && npx vitest run ../supabase/functions/checkout-notify/decide.test.ts`. Nếu vitest không resolve path ngoài root, thêm `../supabase/functions/**/*.test.ts` vào `admin-web/vitest.config.*` `test.include`, hoặc chạy `npx vitest run --root ..`. Expected: 8 PASS.

- [ ] **Step 4: `index.ts`** — sau khi verify MAC (giữ nguyên verify), đọc order (cần thêm `bank_handoff_at`, `payment_received_at` vào SELECT) rồi:

```ts
import { decideNotify } from './decide.ts'
// … sau verify MAC + parseAppOrderId + load order (SELECT id,store_id,total_amount,status,
//    payment_received_at,bank_handoff_at; kiểm store_id === config.store_id) …
const d = decideNotify(data, order, new Date().toISOString())
if (d.action === 'ignore')  { console.log('[notify]', d.reason); return resp(1, d.reason) }
if (d.action === 'reject')  { console.error('[notify]', d.reason); return resp(-1, d.reason) }
const { error } = await supabase.from('orders').update(d.patch)
  .eq('id', appOrderId).eq('store_id', config.store_id).eq('status','pending')
if (error) return resp(-1, 'update failed')
return resp(1, 'success')
```
> ⚠️ Bỏ nhánh confirm BANK cũ (index.ts:97-113) và nhánh ví cũ (162-171) — thay bằng khối trên. MAC verify BANK (overallMac) và ví (mac cố định) GIỮ NGUYÊN.

- [ ] **Step 5: Deploy** (Supabase MCP `deploy_edge_function`, `checkout-notify`, verify_jwt false).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/checkout-notify/decide.ts supabase/functions/checkout-notify/decide.test.ts supabase/functions/checkout-notify/index.ts
git commit -m "fix(payment): notify BANK thôi confirm (chỉ handoff, method=BANK); ví ghi payment_received_at; logic thuần + test (PM-1)"
```

---

### Task 8: `TESTING.md` + `TESTING-PM1.md` + điểm dừng

**Files:** Modify `TESTING.md`; Create `TESTING-PM1.md`

- [ ] **Step 1: `TESTING-PM1.md`** — checklist tay (§13 mục PM-1 chạm):

```markdown
# TESTING-PM1 — Additive: vá bug notify + gộp doanh thu
1.  [ ] Bấm trả tiền → thoát app NH → đơn KHÔNG vào bếp, KHÔNG doanh thu (bug §1.1)
2.  [ ] Đơn ví ZaloPay mới → callback → có payment_received_at → vào doanh thu (bẫy §12)
3.  [ ] Đơn khách MỚI + đơn staff MỚI tạo được (không vỡ NOT NULL payment_amount — P0 §5.3a)
4.  [ ] Owner xác nhận đơn cash/bank → KHÔNG vỡ constraint 3-state (P0 #2)
5.  [ ] Đơn staff mới: payment_amount = total_amount, instrument đúng cash/bank (P1 #3)
6.  [ ] Đơn bank đã thu → quay được; đơn staff KHÔNG quay (Rủi ro #6)
7.  [ ] Đơn cash chiếm lượt voucher NGAY, không nhả sau 30' (P1 #5)
8.  [ ] Doanh thu dashboard == trang Đơn hàng (một luật §4)
9.  [ ] Backfill: 7 BANK rời doanh thu; ví giữ nguyên; instrument bank/wallet/cash/bank_transfer
10. [ ] vitest: decide.test.ts 8 PASS; revenue.test.ts PASS
11. [ ] Topping, serving hours, voucher, vòng quay không regression
```

- [ ] **Step 2: Link từ `TESTING.md`** — thêm dòng vào mục lục: `- PM-1: xem TESTING-PM1.md (vá bug notify + gộp doanh thu)`.

- [ ] **Step 3: Commit checklist (TRƯỚC điểm dừng)**

```bash
git add TESTING.md TESTING-PM1.md
git commit -m "docs(payment): checklist nghiệm thu PM-1"
```

- [ ] **Step 4: DỪNG.** Báo anh Tú: *"Xong PM-1 (additive) rồi anh, test theo TESTING-PM1.md nhé"*. Chờ **PASS** trước PM-2.

**Điểm dừng: PM-1 PASS.**

---

## PM-2 — `order_source` + đuôi định danh (task-level)

- [ ] **Task A — VIỆC 0 test contract Zalo:** đơn `payment_amount=total+37`, `sum(item)≠amount`, ký MAC, mở Zalo thật → Zalo có từ chối không? (§5.3). Quyết định Task D.
- [ ] **Task B — Predicate vào bếp theo `order_source`** (§7): `kitchen-announce.ts` nhận thêm `orderSource`; staff vào bếp ngay, customer_zalo chỉ khi `payment_received_at` hoặc `cash`. TDD.
- [ ] **Task C — Vá `cancel_order` (§7.1) CÙNG sprint:** từ chối khi `payment_received_at is not null` HOẶC đã vào bếp theo predicate mới. TDD SQL.
- [ ] **Task D — Cấp đuôi:** `create_order`/`staff_create_order` set `has_payment_tail=true` + retry `payment_amount=total+random(000-999)` khi quán bật CK; cột cờ "quán nhận CK" (chủ tự khai §8.2). `checkout-create-mac:77` + `checkout-notify` đổi sang `payment_amount` ĐỒNG THỜI (gỡ TODO Task 7). Nếu Task A "Zalo bắt sum" → thêm dòng item đuôi trong create-mac.
- [ ] **Task E — TTL + rate limit** (§5.3): ⚠️ **KHÔNG** `now()` trong index predicate (Postgres cấm). Dùng cột đóng băng `payment_reservation_active boolean` + cron set false cho đơn `pending` chưa trả quá `T` phút; index lọc theo boolean. **Không giải phóng** đơn staff `cooking`/`ready`. `T` > cách ly tái dùng đuôi. Rate limit tạo đơn theo `zalo_user_id`.
- [ ] **Task F — Checkout khách giải thích đuôi** (§8.4).
- [ ] `TESTING-PM2.md` → DỪNG.

## PM-3 — Bếp xác nhận + gate `bank_handoff_at` (roadmap)

- `kitchen_confirm_payment(p_order_id)` role `kitchen`, `store_id` từ `kitchen_store_id()` (§6.1). Set `payment_received_at`, `via='kitchen'`, `by=null`, idempotent, không đụng `status`.
- **Gate (không lỗ mới):** `zalo_checkout`/`zalopay` chỉ cho xác nhận khi `bank_handoff_at IS NOT NULL` — enforce RPC **và** UI. `cash` chỉ khi `kitchen_can_confirm_cash`. `cancelled` từ chối.
- **Nới `confirm_manual_payment`** cho `zalo_checkout`+`bank_handoff` (§16.1; `via='owner'` đã có từ PM-1).
- Kitchen Display cột 4 "Chờ thanh toán", nút "Đã nhận tiền" chỉ hiện khi đủ điều kiện.
- `TESTING-PM3.md` → DỪNG.

## PM-4 — Cấu hình + badge + báo cáo tiền thực nhận (roadmap)

- Tab Cửa hàng: phương thức, cờ "quán nhận CK", `kitchen_can_confirm_cash` (§8.2, §6.2). Badge (§8.3). Báo cáo tách `total_amount` vs `payment_amount` + chênh lệch (§4.1).
- `TESTING-PM4.md` → DỪNG.

## PM-5 — SePay *(có thể hoãn)* (roadmap)

- Sau khi trả lời 3 câu chặn §9. Webhook set `payment_received_at`, `via='sepay'`, khớp `payment_amount`. 4 lớp chống webhook trễ §5.3.

## Rename rollout — `zalopay` → `zalo_checkout` (tách riêng, backward-compatible)

> Chạy **sau khi mini-app mới đã publish qua Zalo** và xác minh không còn client cũ gửi `zalopay`.

1. RPC (`create_order`) + `stores_payment_methods_valid` nhận CẢ `zalopay` lẫn `zalo_checkout` (normalize `zalopay`→`zalo_checkout` trong RPC).
2. Deploy admin + mini-app dual-read (union TS gồm cả hai); publish mini-app mới gửi `zalo_checkout`.
3. Chờ xác minh (log/DB) không còn `zalopay` client-side.
4. Migration: backfill `update orders/stores 'zalopay'→'zalo_checkout'`; siết `orders_payment_method_check` + `stores_payment_methods_valid` sang tập mới.
5. Bỏ nhánh chấp nhận `zalopay` khỏi RPC/union.
- `TESTING-RENAME.md` → DỪNG.

---

## Self-Review (PM-1)

**Spec coverage PM-1:** §1.1 bug (Task 7) ✓ · §3 ba cột (Task 1) ✓ · §3.2 instrument write-points (Task 2,3,7) ✓ · §4 gộp doanh thu (Task 5,6) ✓ · §5.1/5.2 additive schema+backfill (Task 1,2) ✓ · §5.3a payment_amount lifecycle (Task 1,3) ✓ · confirm_manual_payment via=owner P0 (Task 4) ✓ · staff_create_order P1 (Task 3) ✓ · voucher_uses giữ cash P1 (Task 5) ✓ · BANK method guard + fail-closed P1 (Task 7) ✓ · Rủi ro #6 spin (Task 5) ✓. **Hoãn có chủ đích:** rename (rollout riêng), đuôi thật/order_source/cancel_order (PM-2), kitchen confirm/gate (PM-3), badge (PM-4), SePay (PM-5).

**Placeholder scan:** phần thân `create_order`/`staff_create_order`/spin/`get_daily_revenue` ghi "COPY NGUYÊN từ 027/028/029" + dòng cụ thể thay vì chép 70 dòng — có chủ đích (chép sai nguy hiểm hơn trỏ nguồn chính xác). Người thực thi mở đúng file/dòng đã trỏ. `confirm_manual_payment` khung có ghi "copy owner-guard thật của 028".

**Type consistency:** `MoneyFields` giữ `zalopay_trans_id` (badge dùng) dù `hasRealMoney` không đọc — khớp. `decideNotify` patch khớp cột migration (`payment_received_via`/`payment_instrument`). `OrderRow` gồm `bank_handoff_at`/`payment_received_at` → index.ts SELECT phải lấy hai cột này (đã ghi Task 7 Step 4).

**Không lỗ mới ở điểm review-divergence:** BANK branch (Task 7) chỉ handoff khi `method==='BANK'` + `pending` + `payment_received_at IS NULL` + `bank_handoff_at IS NULL` → không ghi đè ví, không confirm, method lạ no-op. Gate `bank_handoff_at` cho bếp/owner để PM-3 nhưng dữ liệu đúng đã sinh từ PM-1.

**Deploy-safe:** PM-1 additive, giữ `zalopay` → mini-app prod đang gửi `zalopay` vẫn chạy suốt PM-1. Không cửa sổ gián đoạn checkout.
