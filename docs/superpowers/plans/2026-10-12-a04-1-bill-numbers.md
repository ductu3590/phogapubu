# A04-1 — Số hoá đơn thật (mig 100) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mỗi bill thu tiền được cấp một số thứ tự thật theo quán (`HD-000123`), bill gộp N mâm dùng chung một số, và số in lên hoá đơn 80mm khi in lại.

**Architecture:** Một bảng đếm `store_bill_counters` + cột `bill_no` trên `table_sessions` (bill trả sau) và `orders` (đơn không phiên, trả trước). Số được cấp bằng **trigger BEFORE UPDATE/INSERT**, KHÔNG sửa `close_table_session` / `get_sessions_bill` đang chạy thật. Gộp bill nhận biết bằng biến cấu hình **cục bộ theo transaction** (`set_config(..., true)`): `close_table_sessions_bulk` đóng N phiên trong MỘT transaction nên phiên đầu lấy số mới, các phiên sau dùng lại. Trang in đọc `bill_no` bằng một truy vấn riêng.

**Tech Stack:** PostgreSQL (Supabase) · PGlite + `node:test` cho test SQL · Next.js 16 / React 19 · Vitest.

**Spec:** `docs/superpowers/specs/2026-10-12-a04-bills-report-design.md` (mục 4.1, bước A04-1)

## Global Constraints

- Text UI tiếng Việt; comment logic phức tạp bằng tiếng Việt (CLAUDE.md §9).
- Hiển thị số: `HD-` + 6 chữ số, ví dụ `HD-000123`.
- Số tăng dần theo quán, KHÔNG reset theo ngày; bill gộp N mâm dùng CHUNG một số.
- KHÔNG sửa hàm SQL đang chạy (`close_table_session`, `close_table_sessions_bulk`, `get_sessions_bill`, `create_order`).
- Bill cũ trước migration: KHÔNG backfill (để `NULL`, không in số).
- Tạm tính (phiên chưa thu) KHÔNG có số.
- Migration số **100**, file `supabase/migrations/100_bill_numbers.sql`.
- Được phép tự áp migration lên prod qua Supabase MCP (memory `feedback_apply_sql_via_mcp`).
- Commit: `feat: ...` / `fix: ...` / `docs: ...`, kết thúc bằng dòng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Xong task cuối: DỪNG, báo anh Tú test theo `docs/testing/a04-bills-report/A04-1.md`, chờ PASS (CLAUDE.md "QUY TẮC BẮT BUỘC VỀ TEST").

## Review Focus

1. **Phiên hết hạn (job đóng sẵn, cùng `closed_at`) rồi thu riêng từng bàn** — `close_table_session` giữ `closed_at = COALESCE(closed_at, now())` nên hai phiên trùng `closed_at` + `closed_by`; người dùng mong đợi **hai số khác nhau** (vì vậy KHÔNG nhận biết gộp bill bằng `closed_by@closed_at`). Test: Task 1 "phiên hết hạn thu riêng".
2. **Một transaction thu tiền ở hai quán khác nhau** — không được lấy số của quán A cho quán B. Test: Task 1 "hai quán trong một transaction".
3. **In lại một bill gồm mâm đã thu + mâm chưa thu, hoặc hai mâm thu ở hai lần khác nhau** — không được in một số gây hiểu nhầm. Test: Task 2 `commonBillNo`.
4. **Phiên đã có số bị UPDATE lại** (sửa `closed_by`, chạy lại `close_table_session` idempotent) — số giữ nguyên, bộ đếm không nhảy. Test: Task 1 "cập nhật lại".
5. **Đơn trả trước nhận tiền rồi bị UPDATE tiếp** (trigger `auto_complete_dine_in` đổi `status='paid'`) — chỉ cấp số đúng một lần. Test: Task 1 "đơn trả trước".

---

### Task 1: Migration 100 — bảng đếm, cột `bill_no`, hai trigger cấp số

**Files:**
- Create: `supabase/migrations/100_bill_numbers.sql`
- Test: `supabase/tests/100_bill_numbers.test.mjs`

**Interfaces:**
- Consumes: bảng `stores(id)`, `table_sessions(id, store_id, status, closed_at, closed_by, close_reason)`, `orders(id, store_id, session_id, status, payment_received_at)` đã có trên prod.
- Produces:
  - Cột `public.table_sessions.bill_no integer NULL`, `public.orders.bill_no integer NULL`.
  - Hàm `public.next_bill_no(p_store_id uuid) RETURNS integer` (chỉ trigger gọi; đã REVOKE khỏi anon/authenticated).
  - Trigger `trg_zz_assign_session_bill_no` (BEFORE UPDATE ON table_sessions), `trg_zz_assign_order_bill_no` (BEFORE INSERT OR UPDATE ON orders). Tiền tố `zz_` để chạy SAU mọi trigger BEFORE khác (Postgres chạy theo thứ tự tên).
  - A04-2 sẽ dùng `bill_no` làm khoá gom bill trong RPC báo cáo.

- [ ] **Step 0: Cài thư viện cho worktree (worktree mới chưa có `node_modules`)**

Run (PowerShell, từ gốc worktree):
```powershell
cd admin-web; npm ci; cd ..
```
Expected: kết thúc không lỗi, có `admin-web/node_modules/@electric-sql/pglite/dist/index.js`.

- [ ] **Step 1: Viết test thất bại**

Tạo `supabase/tests/100_bill_numbers.test.mjs`:

```js
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

// Test mig 100 (A04-1): số hoá đơn thật cấp bằng trigger. Schema tối thiểu — chỉ các cột trigger đọc.
const pgliteModule = process.env.PGLITE_MODULE
  ? pathToFileURL(process.env.PGLITE_MODULE).href
  : '@electric-sql/pglite'
const { PGlite } = await import(pgliteModule)
const db = new PGlite()
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const cashier = id(1), storeA = id(10), storeB = id(11), storeC = id(12)
let seq = 100
const newId = () => id(seq++)

// Mô phỏng đúng câu UPDATE của close_table_session (mig 085): giữ closed_at cũ nếu đã có.
const CLOSE = `UPDATE table_sessions
  SET status = 'closed', closed_at = COALESCE(closed_at, now()), closed_by = $2, close_reason = $3
  WHERE id = $1`

async function openSession(store = storeA) {
  const s = newId()
  await db.query('INSERT INTO table_sessions(id, store_id) VALUES ($1, $2)', [s, store])
  return s
}
async function close(s, reason = 'paid', q = db) { await q.query(CLOSE, [s, cashier, reason]) }
async function billNo(table, rowId) {
  return (await db.query(`SELECT bill_no FROM ${table} WHERE id = $1`, [rowId])).rows[0].bill_no
}

before(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE stores(id uuid PRIMARY KEY);
    CREATE TABLE table_sessions(
      id uuid PRIMARY KEY, store_id uuid NOT NULL REFERENCES stores(id),
      status text NOT NULL DEFAULT 'open', closed_at timestamptz, closed_by uuid, close_reason text,
      CONSTRAINT table_sessions_closed_state CHECK (
        (status = 'open' AND closed_at IS NULL AND close_reason IS NULL)
        OR (status = 'closed' AND closed_at IS NOT NULL AND close_reason IS NOT NULL))
    );
    CREATE TABLE orders(
      id uuid PRIMARY KEY, store_id uuid NOT NULL REFERENCES stores(id), session_id uuid,
      status text NOT NULL DEFAULT 'pending', payment_received_at timestamptz
    );
    INSERT INTO stores VALUES ('${storeA}'), ('${storeB}'), ('${storeC}');
  `)
  await db.exec(await readFile(new URL('../migrations/100_bill_numbers.sql', import.meta.url), 'utf8'))
})

after(async () => db.close())

test('thu tiền một bàn → có số; bàn sau → số kế tiếp', async () => {
  const s1 = await openSession(), s2 = await openSession()
  await close(s1)
  await close(s2)
  const n1 = await billNo('table_sessions', s1)
  assert.ok(Number.isInteger(n1) && n1 > 0)
  assert.equal(await billNo('table_sessions', s2), n1 + 1)
})

test('gộp bill 2 mâm trong MỘT transaction → chung một số; bill sau lấy số kế tiếp', async () => {
  const m1 = await openSession(), m2 = await openSession(), lone = await openSession()
  await db.transaction(async (tx) => {
    await close(m1, 'paid', tx)
    await close(m2, 'paid', tx)
  })
  const merged = await billNo('table_sessions', m1)
  assert.equal(await billNo('table_sessions', m2), merged)
  await close(lone)
  assert.equal(await billNo('table_sessions', lone), merged + 1)
})

test('phiên hết hạn (job đóng sẵn cùng giờ) rồi thu RIÊNG từng bàn → hai số khác nhau', async () => {
  const e1 = await openSession(), e2 = await openSession()
  // Job hết hạn đóng nhiều phiên một lượt: cùng closed_at, closed_by NULL, không cấp số.
  await db.query(`UPDATE table_sessions SET status = 'closed', closed_at = now(), close_reason = 'expired'
    WHERE id IN ($1, $2)`, [e1, e2])
  assert.equal(await billNo('table_sessions', e1), null)
  await close(e1)
  await close(e2)
  const n1 = await billNo('table_sessions', e1), n2 = await billNo('table_sessions', e2)
  assert.ok(n1 > 0 && n2 > 0)
  assert.notEqual(n1, n2)
})

test('bỏ bàn / hết hạn không cấp số và không làm nhảy dãy số', async () => {
  const before1 = await openSession(), reset = await openSession(), after1 = await openSession()
  await close(before1)
  await close(reset, 'staff_reset')
  await close(after1)
  assert.equal(await billNo('table_sessions', reset), null)
  assert.equal(await billNo('table_sessions', after1), (await billNo('table_sessions', before1)) + 1)
})

test('cập nhật lại phiên đã có số → số giữ nguyên, bộ đếm không nhảy', async () => {
  const s = await openSession(), next = await openSession()
  await close(s)
  const n = await billNo('table_sessions', s)
  await close(s) // chạy lại y hệt close_table_session idempotent
  await db.query('UPDATE table_sessions SET closed_by = $2 WHERE id = $1', [s, id(2)])
  assert.equal(await billNo('table_sessions', s), n)
  await close(next)
  assert.equal(await billNo('table_sessions', next), n + 1)
})

test('đơn trả trước nhận tiền → số riêng, chung bộ đếm với phiên; UPDATE tiếp không cấp lại', async () => {
  const s = await openSession()
  await close(s)
  const sessionNo = await billNo('table_sessions', s)
  const o = newId()
  await db.query("INSERT INTO orders(id, store_id, status) VALUES ($1, $2, 'confirmed')", [o, storeA])
  assert.equal(await billNo('orders', o), null)
  await db.query('UPDATE orders SET payment_received_at = now() WHERE id = $1', [o])
  assert.equal(await billNo('orders', o), sessionNo + 1)
  await db.query("UPDATE orders SET status = 'paid' WHERE id = $1", [o]) // như auto_complete_dine_in
  assert.equal(await billNo('orders', o), sessionNo + 1)
})

test('đơn chèn sẵn tiền (INSERT) cũng có số; đơn thuộc phiên / đơn huỷ thì không', async () => {
  const paidInsert = newId(), inSession = newId(), cancelled = newId()
  const s = await openSession()
  await db.query("INSERT INTO orders(id, store_id, status, payment_received_at) VALUES ($1, $2, 'confirmed', now())", [paidInsert, storeA])
  await db.query("INSERT INTO orders(id, store_id, session_id, status, payment_received_at) VALUES ($1, $2, $3, 'confirmed', now())", [inSession, storeA, s])
  await db.query("INSERT INTO orders(id, store_id, status, payment_received_at) VALUES ($1, $2, 'cancelled', now())", [cancelled, storeA])
  assert.ok((await billNo('orders', paidInsert)) > 0)
  assert.equal(await billNo('orders', inSession), null)
  assert.equal(await billNo('orders', cancelled), null)
})

test('mỗi quán một dãy số riêng, bắt đầu từ 1', async () => {
  const b1 = await openSession(storeB), b2 = await openSession(storeB)
  await close(b1)
  await close(b2)
  assert.equal(await billNo('table_sessions', b1), 1)
  assert.equal(await billNo('table_sessions', b2), 2)
})

test('một transaction thu tiền ở hai quán → không lấy số của quán kia', async () => {
  const a = await openSession(storeA), c = await openSession(storeC)
  await db.transaction(async (tx) => {
    await close(a, 'paid', tx)
    await close(c, 'paid', tx)
  })
  assert.equal(await billNo('table_sessions', c), 1)
  assert.ok((await billNo('table_sessions', a)) > 1)
})

test('khách/nhân viên không đọc, không ghi được bộ đếm và không gọi được next_bill_no', async () => {
  await db.exec('SET ROLE authenticated')
  try {
    await assert.rejects(db.query('SELECT * FROM store_bill_counters'))
    await assert.rejects(db.query(`SELECT next_bill_no('${storeA}')`))
  } finally {
    await db.exec('RESET ROLE')
  }
})
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run (PowerShell, từ gốc worktree):
```powershell
$env:PGLITE_MODULE=(Resolve-Path 'admin-web/node_modules/@electric-sql/pglite/dist/index.js').Path
node --test supabase/tests/100_bill_numbers.test.mjs
```
Expected: FAIL ở `before` — `ENOENT ... 100_bill_numbers.sql`.

- [ ] **Step 3: Viết migration**

Tạo `supabase/migrations/100_bill_numbers.sql`:

```sql
-- 100 (A04-1, 2026-10-12): SỐ HOÁ ĐƠN THẬT — mỗi quán một dãy số tăng dần, cấp lúc thu tiền.
-- Spec: docs/superpowers/specs/2026-10-12-a04-bills-report-design.md §4.1
--
-- • Bill trả sau = phiên bàn đóng với close_reason='paid' → table_sessions.bill_no.
--   Gộp bill N mâm (close_table_sessions_bulk) đóng N phiên trong MỘT transaction → dùng CHUNG một số.
-- • Đơn không phiên (trả trước / mang về) nhận tiền lần đầu → orders.bill_no.
-- • Hai loại dùng CHUNG một bộ đếm/quán → số không trùng giữa hai bảng.
-- • KHÔNG sửa close_table_session / get_sessions_bill / create_order: cấp số bằng trigger.
-- • KHÔNG backfill bill cũ (NULL = không in số).
--
-- ⚠️ Vì sao KHÔNG nhận biết gộp bill bằng closed_by@closed_at (như báo cáo mig 092):
--   close_table_session giữ closed_at = COALESCE(closed_at, now()). Phiên bị job hết hạn đóng sẵn
--   (nhiều phiên cùng now()) rồi mới thu → các phiên trùng closed_at + closed_by dù thu ở các lần khác nhau.
--   Dùng biến cấu hình CỤC BỘ THEO TRANSACTION thay thế: hết transaction là tự xoá.

CREATE TABLE IF NOT EXISTS public.store_bill_counters (
  store_id uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  last_no  integer NOT NULL DEFAULT 0 CHECK (last_no >= 0)
);
ALTER TABLE public.store_bill_counters ENABLE ROW LEVEL SECURITY;
-- Không policy nào: chỉ hàm SECURITY DEFINER bên dưới đụng được bảng này.
REVOKE ALL ON public.store_bill_counters FROM PUBLIC, anon, authenticated;

ALTER TABLE public.table_sessions ADD COLUMN IF NOT EXISTS bill_no integer;
ALTER TABLE public.orders         ADD COLUMN IF NOT EXISTS bill_no integer;

COMMENT ON COLUMN public.table_sessions.bill_no IS
  'Số hoá đơn (mig 100), cấp bằng trigger lúc đóng phiên với close_reason=paid. Gộp bill N mâm = cùng một số. NULL = chưa thu / bill trước mig 100.';
COMMENT ON COLUMN public.orders.bill_no IS
  'Số hoá đơn (mig 100) của đơn KHÔNG thuộc phiên, cấp lúc payment_received_at có giá trị lần đầu. Đơn thuộc phiên luôn NULL — số nằm ở table_sessions.';

-- Phiên: gộp bill chia sẻ số nên KHÔNG unique; tính duy nhất do bộ đếm bảo đảm.
CREATE INDEX IF NOT EXISTS table_sessions_store_bill_no
  ON public.table_sessions(store_id, bill_no) WHERE bill_no IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS orders_store_bill_no_unique
  ON public.orders(store_id, bill_no) WHERE bill_no IS NOT NULL;

-- Lấy số kế tiếp. Upsert khoá dòng bộ đếm của quán → hai máy thu cùng lúc phải xếp hàng, không trùng số.
CREATE OR REPLACE FUNCTION public.next_bill_no(p_store_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_no integer;
BEGIN
  INSERT INTO public.store_bill_counters AS c (store_id, last_no)
  VALUES (p_store_id, 1)
  ON CONFLICT (store_id) DO UPDATE SET last_no = c.last_no + 1
  RETURNING c.last_no INTO v_no;
  RETURN v_no;
END;
$function$;

REVOKE ALL ON FUNCTION public.next_bill_no(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.assign_session_bill_no()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ctx text;
BEGIN
  IF NEW.bill_no IS NOT NULL OR NEW.status <> 'closed' OR NEW.close_reason IS DISTINCT FROM 'paid' THEN
    RETURN NEW;
  END IF;

  -- 'mevo.bill_ctx' = '<store_id>:<số>' do phiên đầu tiên của transaction này ghi lại.
  -- Ngoài transaction đó giá trị là NULL hoặc '' → luôn lấy số mới.
  v_ctx := current_setting('mevo.bill_ctx', true);
  IF v_ctx IS NOT NULL AND split_part(v_ctx, ':', 1) = NEW.store_id::text THEN
    NEW.bill_no := split_part(v_ctx, ':', 2)::integer;
  ELSE
    NEW.bill_no := public.next_bill_no(NEW.store_id);
    PERFORM set_config('mevo.bill_ctx', NEW.store_id::text || ':' || NEW.bill_no::text, true);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_zz_assign_session_bill_no ON public.table_sessions;
CREATE TRIGGER trg_zz_assign_session_bill_no
  BEFORE UPDATE ON public.table_sessions
  FOR EACH ROW EXECUTE FUNCTION public.assign_session_bill_no();

CREATE OR REPLACE FUNCTION public.assign_order_bill_no()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.bill_no IS NULL
     AND NEW.session_id IS NULL
     AND NEW.payment_received_at IS NOT NULL
     AND NEW.status <> 'cancelled' THEN
    NEW.bill_no := public.next_bill_no(NEW.store_id);
  END IF;
  RETURN NEW;
END;
$function$;

-- Tên 'trg_zz_' → chạy SAU mọi trigger BEFORE khác trên orders (Postgres chạy theo thứ tự tên),
-- để nhìn thấy giá trị cuối cùng của session_id / payment_received_at / status.
DROP TRIGGER IF EXISTS trg_zz_assign_order_bill_no ON public.orders;
CREATE TRIGGER trg_zz_assign_order_bill_no
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.assign_order_bill_no();
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: như Step 2.
Expected: `# pass 10`, `# fail 0`.

- [ ] **Step 5: Commit**

```powershell
git add supabase/migrations/100_bill_numbers.sql supabase/tests/100_bill_numbers.test.mjs
git commit -m "feat: so hoa don that theo quan (mig 100, trigger cap so luc thu tien)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: In số hoá đơn lên hoá đơn 80mm

**Files:**
- Create: `admin-web/lib/bill-no.ts`
- Create: `admin-web/lib/bill-no.test.ts`
- Modify: `admin-web/lib/actions/table-session.ts` (thêm `getSessionsBillNo` ngay sau `getSessionsBill`, ~dòng 302)
- Modify: `admin-web/app/print/bill/print-bill.tsx` (prop `billNo`, dòng "Số HD" sau dòng "In lúc")
- Modify: `admin-web/app/print/bill/page.tsx`
- Test: `admin-web/app/print/bill/print-bill.test.tsx`

**Interfaces:**
- Consumes: cột `table_sessions.bill_no` (Task 1); `staffClient()` trong `lib/actions/table-session.ts:87`.
- Produces (A04-2..5 dùng lại):
  - `formatBillNo(n: number | null | undefined): string | null` → `'HD-000123'` hoặc `null`.
  - `commonBillNo(values: Array<number | null>): number | null`.
  - `getSessionsBillNo(sessionIds: string[]): Promise<number | null>`.
  - `PrintBill` nhận thêm prop `billNo?: number | null`.

- [ ] **Step 1: Viết test thất bại cho hàm thuần**

Tạo `admin-web/lib/bill-no.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { commonBillNo, formatBillNo } from './bill-no'

describe('formatBillNo (A04-1)', () => {
  it('đệm đủ 6 chữ số', () => {
    expect(formatBillNo(1)).toBe('HD-000001')
    expect(formatBillNo(123)).toBe('HD-000123')
  })
  it('quá 6 chữ số thì giữ nguyên, không cắt', () => {
    expect(formatBillNo(1234567)).toBe('HD-1234567')
  })
  it('không có số / số không hợp lệ → null', () => {
    expect(formatBillNo(null)).toBeNull()
    expect(formatBillNo(undefined)).toBeNull()
    expect(formatBillNo(0)).toBeNull()
    expect(formatBillNo(-3)).toBeNull()
    expect(formatBillNo(1.5)).toBeNull()
  })
})

describe('commonBillNo (A04-1)', () => {
  it('một mâm đã thu → số của mâm đó', () => {
    expect(commonBillNo([42])).toBe(42)
  })
  it('gộp bill: mọi mâm cùng số → số đó', () => {
    expect(commonBillNo([42, 42, 42])).toBe(42)
  })
  it('có mâm chưa thu (tạm tính) → null', () => {
    expect(commonBillNo([42, null])).toBeNull()
    expect(commonBillNo([null, 42])).toBeNull()
  })
  it('các mâm thu ở những lần khác nhau → null, không in số gây hiểu nhầm', () => {
    expect(commonBillNo([42, 43])).toBeNull()
  })
  it('danh sách rỗng → null', () => {
    expect(commonBillNo([])).toBeNull()
  })
})
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `cd admin-web; npx vitest run lib/bill-no.test.ts`
Expected: FAIL — `Failed to resolve import "./bill-no"`.

- [ ] **Step 3: Viết hàm thuần**

Tạo `admin-web/lib/bill-no.ts`:

```ts
// Số hoá đơn (A04-1, mig 100): một bộ đếm mỗi quán, cấp lúc thu tiền. Hiển thị dạng HD-000123.

export function formatBillNo(n: number | null | undefined): string | null {
  if (n == null || !Number.isInteger(n) || n <= 0) return null
  return `HD-${String(n).padStart(6, '0')}`
}

// In lại bill N mâm: chỉ có số khi MỌI mâm đã thu và cùng một số (gộp bill thu trong một lần).
// Có mâm chưa thu (tạm tính) hoặc các mâm thu ở những lần khác nhau → không in số, tránh in nhầm.
export function commonBillNo(values: Array<number | null>): number | null {
  if (values.length === 0) return null
  const first = values[0]
  if (first == null) return null
  return values.every((v) => v === first) ? first : null
}
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `cd admin-web; npx vitest run lib/bill-no.test.ts`
Expected: PASS 8 test.

- [ ] **Step 5: Viết test thất bại cho hoá đơn in**

Thêm vào cuối khối `describe` trong `admin-web/app/print/bill/print-bill.test.tsx` (trước dấu `})` cuối file):

```tsx
  it('A04-1: bill đã thu có dòng "Số HD" dạng HD-000123', () => {
    const html = renderToStaticMarkup(<PrintBill bill={buildTestBill(store, now)} billNo={123} />)
    expect(html).toContain('Số HD')
    expect(html).toContain('HD-000123')
  })

  it('A04-1: tạm tính (chưa có số) và phiếu in thử KHÔNG có dòng "Số HD"', () => {
    expect(renderToStaticMarkup(<PrintBill bill={buildTestBill(store, now)} />)).not.toContain('Số HD')
    expect(renderToStaticMarkup(<PrintBill bill={buildTestBill(store, now)} billNo={null} />)).not.toContain('Số HD')
    expect(renderToStaticMarkup(<PrintBill bill={buildTestBill(store, now)} billNo={7} testMode />)).not.toContain('Số HD')
  })
```

- [ ] **Step 6: Chạy test, xác nhận thất bại**

Run: `cd admin-web; npx vitest run app/print/bill/print-bill.test.tsx`
Expected: FAIL ở test "bill đã thu có dòng Số HD" (chuỗi `Số HD` không có).

- [ ] **Step 7: Thêm prop `billNo` vào `PrintBill`**

Trong `admin-web/app/print/bill/print-bill.tsx`:

Thêm import sau dòng `import { useAutoPrint } ...`:
```tsx
import { formatBillNo } from '@/lib/bill-no'
```

Đổi chữ ký hàm:
```tsx
export default function PrintBill({ bill, billNo = null, testMode = false }: { bill: SessionsBill; billNo?: number | null; testMode?: boolean }) {
  useAutoPrint()

  // Số hoá đơn chỉ có khi bill đã thu (mig 100). Tạm tính / in thử không in số.
  const soHD = testMode ? null : formatBillNo(billNo)
```
(giữ nguyên các dòng `const nhieuMam ...`, `const soMon ...` phía sau)

Ngay SAU khối dòng "In lúc":
```tsx
        <div className="row">
          <span className="name">In lúc</span>
          <span className="num">{gio(bill.printed_at)}</span>
        </div>
```
thêm:
```tsx
        {soHD && (
          <div className="row">
            <span className="name">Số HD</span>
            <span className="num">{soHD}</span>
          </div>
        )}
```

- [ ] **Step 8: Chạy test, xác nhận PASS**

Run: `cd admin-web; npx vitest run app/print/bill/print-bill.test.tsx lib/bill-no.test.ts`
Expected: PASS toàn bộ (các test PA-5 / mig 098 / 2026-10-12 cũ vẫn xanh).

- [ ] **Step 9: Đọc số từ DB và truyền vào trang in**

Trong `admin-web/lib/actions/table-session.ts`, thêm import ở đầu file (cạnh các import khác):
```ts
import { commonBillNo } from '@/lib/bill-no'
```
và thêm ngay SAU hàm `getSessionsBill` (sau dòng `return { ok: true, bill: data as unknown as SessionsBill }` + `}`):
```ts
// Số hoá đơn của bill đang in (A04-1). Đọc thẳng cột bill_no — RLS auth_read_table_sessions đã giới hạn
// đúng quán. KHÔNG sửa RPC get_sessions_bill đang chạy thật. Lỗi đọc → không in số (không chặn việc in).
export async function getSessionsBillNo(sessionIds: string[]): Promise<number | null> {
  const { operator, supabase } = await staffClient()
  if (!operator || !supabase || sessionIds.length === 0) return null
  const { data, error } = await supabase.from('table_sessions').select('id, bill_no').in('id', sessionIds)
  if (error || !data || data.length !== sessionIds.length) return null
  return commonBillNo((data as Array<{ bill_no: number | null }>).map((r) => r.bill_no))
}
```

Nếu file có dòng `'use server'` ở đầu: hàm async export ở trên hợp lệ, không cần đổi gì.

Trong `admin-web/app/print/bill/page.tsx`, đổi import:
```tsx
import { getSessionsBill, getSessionsBillNo } from '@/lib/actions/table-session'
```
đổi dòng `const res = await getSessionsBill(sessionIds)` thành:
```tsx
  const [res, billNo] = await Promise.all([getSessionsBill(sessionIds), getSessionsBillNo(sessionIds)])
```
và dòng cuối thành:
```tsx
  return <PrintBill bill={res.bill} billNo={billNo} />
```

- [ ] **Step 10: Kiểm tra kiểu + lint + toàn bộ test admin-web**

Run:
```powershell
cd admin-web; npx tsc --noEmit -p .; npx eslint lib/bill-no.ts lib/actions/table-session.ts app/print/bill; npx vitest run
```
Expected: tsc không lỗi; eslint không lỗi; vitest toàn bộ PASS.

- [ ] **Step 11: Commit**

```powershell
git add admin-web/lib/bill-no.ts admin-web/lib/bill-no.test.ts admin-web/lib/actions/table-session.ts admin-web/app/print/bill/print-bill.tsx admin-web/app/print/bill/page.tsx admin-web/app/print/bill/print-bill.test.tsx
git commit -m "feat: in so hoa don HD-xxxxxx len hoa don 80mm khi bill da thu" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Áp mig 100 lên prod + checklist test tay

**Files:**
- Create: `docs/testing/a04-bills-report/A04-1.md`

**Interfaces:**
- Consumes: `supabase/migrations/100_bill_numbers.sql` (Task 1), trang in (Task 2).
- Produces: prod có cột + trigger; tài liệu test cho anh Tú.

- [ ] **Step 1: Áp migration lên prod**

Dùng Supabase MCP `apply_migration` với `name: "100_bill_numbers"` và `query` = nguyên nội dung file `supabase/migrations/100_bill_numbers.sql`.

- [ ] **Step 2: Kiểm tra prod đã có đủ**

Supabase MCP `execute_sql`:
```sql
SELECT
  (SELECT count(*) FROM pg_trigger WHERE tgname IN ('trg_zz_assign_session_bill_no','trg_zz_assign_order_bill_no') AND NOT tgisinternal) AS triggers,
  (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND column_name='bill_no' AND table_name IN ('table_sessions','orders')) AS columns,
  (SELECT count(*) FROM public.store_bill_counters) AS counters,
  (SELECT has_table_privilege('authenticated','public.store_bill_counters','SELECT')) AS auth_can_read_counters;
```
Expected: `triggers = 2`, `columns = 2`, `counters = 0`, `auth_can_read_counters = false`.

- [ ] **Step 3: Viết checklist test tay**

Tạo `docs/testing/a04-bills-report/A04-1.md`:

```markdown
# A04-1 — Số hoá đơn thật (mig 100)

Quán test: **Bia lẩu Bảo Lương** (prod). Mig 100 đã áp prod. Code chạy local hoặc bản deploy có commit A04-1.
Số hoá đơn hiện chỉ thấy khi **In lại** từ tab **Báo cáo** (A04-3 mới đưa số vào bảng).

## Test tự động đã chạy
- `node --test supabase/tests/100_bill_numbers.test.mjs` — 10/10 PASS
- `npx vitest run` (admin-web) — PASS

## Test tay

| # | Làm gì | Mong đợi |
|---|---|---|
| 1 | POS → Khách lẻ bàn bất kỳ, ghi 1 món → Thanh toán tiền mặt. Mở Báo cáo → dòng bill vừa thu → **Xem / In lại** | Hoá đơn có dòng **Số HD  HD-000001** (bill đầu tiên của quán sau mig 100) |
| 2 | Thu thêm một bàn khác, In lại từ Báo cáo | **HD-000002** |
| 3 | Bàn đang mở → **In tạm tính** | KHÔNG có dòng Số HD |
| 4 | Gộp bill 2 mâm → thu tiền → In lại từ Báo cáo | "HOÁ ĐƠN TỔNG" có **một** số chung, là số kế tiếp (HD-000003) |
| 5 | Mở một bàn → **Bỏ bàn**. Rồi thu một bàn khác → In lại | Số kế tiếp liền mạch (HD-000004), bàn bỏ không ăn số |
| 6 | In lại một bill của **hôm trước** (Báo cáo → chọn ngày cũ) | KHÔNG có dòng Số HD (bill cũ không đánh số) |
| 7 | Máy 1 ở POS, máy 2 ở `/staff/tables`: thu 2 bàn khác nhau gần cùng lúc | Hai số khác nhau, liền nhau, không trùng |
| 8 | Cài đặt quán → In thử | Phiếu in thử KHÔNG có dòng Số HD |

## Kiểm tra DB sau khi test (Claude chạy)
```sql
SELECT bill_no, count(*) AS so_mam, min(closed_at) AS luc_thu
FROM table_sessions
WHERE store_id = '<id Bảo Lương>' AND bill_no IS NOT NULL
GROUP BY bill_no ORDER BY bill_no;
```
Mong đợi: dãy 1, 2, 3, … không hở; bill gộp 2 mâm có `so_mam = 2`.
```

- [ ] **Step 4: Commit**

```powershell
git add docs/testing/a04-bills-report/A04-1.md
git commit -m "docs: checklist test A04-1 so hoa don" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: DỪNG — báo anh Tú**

Nói: *"Xong rồi anh, test theo `docs/testing/a04-bills-report/A04-1.md` nhé"* và chờ PASS. KHÔNG sang A04-2.

---

## Sau A04-1

A04-2 (RPC `get_bills_report`, gom bill theo `bill_no` khi có — sửa luôn chỗ báo cáo 092 gộp nhầm phiên hết-hạn-rồi-thu-riêng) viết kế hoạch riêng sau khi A04-1 PASS.
