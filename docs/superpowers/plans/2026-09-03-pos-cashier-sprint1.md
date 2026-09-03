# Sprint 1 — Màn POS thu ngân `/admin/cashier` (sơ đồ bàn + thu tiền)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chủ quán ngồi máy tính nhìn sơ đồ bàn của cả quán, kéo thả sắp đúng vị trí thật, thấy đơn mới chạy về realtime, bấm một bàn là ra bill và thu tiền / ghép mâm / gộp bill.

**Architecture:** Một trang mới `/admin/cashier` trong khu `/admin` (đã fail-closed về `store_owner`). Toàn bộ thao tác tiền **gọi lại các server action sẵn có** ở `lib/actions/table-session.ts` (bọc RPC mig 039/040) — sprint này không viết một dòng logic tiền nào. Việc duy nhất chạm DB là thêm 2 cột toạ độ `tables.pos_x/pos_y`. Logic xếp lưới tách hẳn ra `lib/table-layout.ts` — hàm thuần, test bằng vitest, không dính React.

**Tech Stack:** Next.js 16 App Router · React 19 · Tailwind v4 · Supabase (postgres + realtime) · vitest · HTML5 drag & drop thuần (không thêm dependency)

**Spec:** `docs/superpowers/specs/2026-09-03-pos-cashier-bill-edit-design.md`

---

## Cấu trúc file

| File | Trách nhiệm |
|---|---|
| `supabase/migrations/044_table_layout.sql` | Thêm `tables.pos_x/pos_y` |
| `admin-web/lib/table-layout.ts` | Hàm thuần: xếp bàn vào lưới, di chuyển/đổi chỗ, tính diff để lưu |
| `admin-web/lib/table-layout.test.ts` | Test cho file trên |
| `admin-web/lib/actions/table-layout.ts` | Server action `saveTableLayout()` |
| `admin-web/app/admin/cashier/page.tsx` | Server component: nạp bàn + phiên + `payment_timing` |
| `admin-web/app/admin/cashier/cashier-client.tsx` | State + realtime + điều phối 3 khối con |
| `admin-web/app/admin/cashier/floor-map.tsx` | Lưới bàn, màu trạng thái, kéo thả |
| `admin-web/app/admin/cashier/bill-panel.tsx` | Cột phải: bill, thu tiền, các thao tác mâm |
| `admin-web/app/admin/cashier/new-orders-feed.tsx` | Dải "Đơn mới" |
| `admin-web/app/admin/admin-nav.tsx` | Thêm mục "Thu ngân (POS)" |
| `admin-web/types/database.types.ts` | Thêm `pos_x/pos_y` vào `TableRow` |

Tách 3 file con vì `cashier-client.tsx` gom hết sẽ vượt 700 dòng — đúng vết xe của `staff/tables/tables-client.tsx` (592 dòng) mà sprint 2 còn phải nhét thêm UI sửa bill vào.

---

## Task 1: Migration 044 — toạ độ bàn

**Files:**
- Create: `supabase/migrations/044_table_layout.sql`
- Modify: `admin-web/types/database.types.ts:51-56`

- [ ] **Step 1: Viết migration**

Tạo `supabase/migrations/044_table_layout.sql`:

```sql
-- 044_table_layout.sql — toạ độ ô lưới cho sơ đồ bàn ở màn POS /admin/cashier
-- Spec: docs/superpowers/specs/2026-09-03-pos-cashier-bill-edit-design.md §1.2
--
-- Chỉ ALTER TABLE ... IF NOT EXISTS. File này KHÔNG chứa CREATE OR REPLACE của bất kỳ RPC
-- đang chạy thật, nên chạy lại an toàn (quyết định 2026-09-01).
--
-- Toạ độ là Ô LƯỚI (cột 0..11, hàng 0..n), KHÔNG phải pixel: snap lưới thì hai bàn không bao
-- giờ chồng nhau và sơ đồ không vỡ khi đổi cỡ màn hình.

alter table tables add column if not exists pos_x smallint;
alter table tables add column if not exists pos_y smallint;

comment on column tables.pos_x is
  'Cột trong lưới sơ đồ bàn (0..11) ở /admin/cashier. NULL = chưa sắp, client tự xếp theo tên bàn.';
comment on column tables.pos_y is
  'Hàng trong lưới sơ đồ bàn (0..n) ở /admin/cashier. NULL = chưa sắp.';

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Áp lên Supabase prod**

Dùng Supabase MCP `apply_migration` với name `044_table_layout` và đúng nội dung file trên
(anh Tú đã cho phép tự chạy migration — memory `feedback_apply_sql_via_mcp`).

- [ ] **Step 3: Kiểm tra cột đã có**

Chạy qua MCP `execute_sql`:

```sql
select column_name, data_type from information_schema.columns
 where table_name = 'tables' and column_name in ('pos_x','pos_y');
```

Expected: 2 dòng, `smallint`.

- [ ] **Step 4: Bổ sung type**

Trong `admin-web/types/database.types.ts`, sửa `interface TableRow` thành:

```ts
interface TableRow {
  id: string
  store_id: string
  table_number: string
  is_active: boolean
  pos_x: number | null
  pos_y: number | null
}
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/044_table_layout.sql admin-web/types/database.types.ts
git commit -m "feat(db): them toa do o luoi cho so do ban (mig 044)"
```

---

## Task 2: `lib/table-layout.ts` — logic xếp lưới (TDD)

**Files:**
- Create: `admin-web/lib/table-layout.ts`
- Test: `admin-web/lib/table-layout.test.ts`

- [ ] **Step 1: Viết test trước**

Tạo `admin-web/lib/table-layout.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  LAYOUT_COLS,
  layoutTables,
  moveTable,
  changedPositions,
  type LayoutTable,
} from './table-layout'

const ban = (
  id: string,
  table_number: string,
  pos_x: number | null = null,
  pos_y: number | null = null,
): LayoutTable => ({ id, table_number, pos_x, pos_y })

describe('layoutTables', () => {
  it('danh sách rỗng → không có ô nào', () => {
    expect(layoutTables([])).toEqual([])
  })

  it('bàn chưa sắp được xếp trái sang phải theo tên, số hiểu theo kiểu số', () => {
    const out = layoutTables([ban('c', 'Bàn 10'), ban('a', 'Bàn 2'), ban('b', 'Bàn 1')])
    expect(out.map((t) => t.table_number)).toEqual(['Bàn 1', 'Bàn 2', 'Bàn 10'])
    expect(out.map((t) => [t.x, t.y])).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
    ])
  })

  it('xếp quá số cột thì xuống hàng mới', () => {
    const nhieu = Array.from({ length: LAYOUT_COLS + 2 }, (_, i) =>
      ban(`t${i}`, `Bàn ${i + 1}`),
    )
    const out = layoutTables(nhieu)
    expect(out[LAYOUT_COLS]).toMatchObject({ x: 0, y: 1 })
    expect(out[LAYOUT_COLS + 1]).toMatchObject({ x: 1, y: 1 })
  })

  it('bàn đã có toạ độ thì giữ nguyên, không bị xếp lại', () => {
    const out = layoutTables([ban('a', 'Bàn 1', 5, 3)])
    expect(out[0]).toMatchObject({ x: 5, y: 3 })
  })

  it('bàn chưa sắp không được đè lên ô mà bàn đã sắp đang chiếm', () => {
    const out = layoutTables([ban('a', 'Bàn 1', 0, 0), ban('b', 'Bàn 2')])
    const b = out.find((t) => t.id === 'b')!
    expect([b.x, b.y]).toEqual([1, 0])
  })

  it('hai bàn cùng toạ độ (dữ liệu hỏng) thì bàn sau bị đẩy sang ô trống kế tiếp', () => {
    const out = layoutTables([ban('a', 'Bàn 1', 2, 0), ban('b', 'Bàn 2', 2, 0)])
    expect(out.find((t) => t.id === 'a')).toMatchObject({ x: 2, y: 0 })
    expect(out.find((t) => t.id === 'b')).toMatchObject({ x: 3, y: 0 })
  })

  it('toạ độ ngoài lưới bị coi như chưa sắp', () => {
    const out = layoutTables([ban('a', 'Bàn 1', LAYOUT_COLS + 4, 0)])
    expect(out[0]).toMatchObject({ x: 0, y: 0 })
  })
})

describe('moveTable', () => {
  const base = () => layoutTables([ban('a', 'Bàn 1'), ban('b', 'Bàn 2')])

  it('chuyển sang ô trống', () => {
    const out = moveTable(base(), 'a', 4, 2)
    expect(out.find((t) => t.id === 'a')).toMatchObject({ x: 4, y: 2 })
    expect(out.find((t) => t.id === 'b')).toMatchObject({ x: 1, y: 0 })
  })

  it('thả vào ô đã có bàn khác → ĐỔI CHỖ hai bàn, không chồng', () => {
    const out = moveTable(base(), 'a', 1, 0)
    expect(out.find((t) => t.id === 'a')).toMatchObject({ x: 1, y: 0 })
    expect(out.find((t) => t.id === 'b')).toMatchObject({ x: 0, y: 0 })
  })

  it('thả vào đúng ô cũ → không đổi gì', () => {
    const out = moveTable(base(), 'a', 0, 0)
    expect(out).toEqual(base())
  })

  it('id không có thật → trả nguyên danh sách', () => {
    expect(moveTable(base(), 'khong-co', 3, 3)).toEqual(base())
  })

  it('toạ độ ngoài lưới → từ chối, trả nguyên danh sách', () => {
    expect(moveTable(base(), 'a', LAYOUT_COLS, 0)).toEqual(base())
    expect(moveTable(base(), 'a', -1, 0)).toEqual(base())
  })
})

describe('changedPositions', () => {
  it('không đổi gì → mảng rỗng', () => {
    const p = layoutTables([ban('a', 'Bàn 1', 0, 0)])
    expect(changedPositions(p, p)).toEqual([])
  })

  it('chỉ trả về bàn thực sự đổi toạ độ', () => {
    const before = layoutTables([ban('a', 'Bàn 1'), ban('b', 'Bàn 2')])
    const after = moveTable(before, 'a', 1, 0) // đổi chỗ a với b
    expect(changedPositions(before, after).sort((x, y) => x.id.localeCompare(y.id))).toEqual([
      { id: 'a', pos_x: 1, pos_y: 0 },
      { id: 'b', pos_x: 0, pos_y: 0 },
    ])
  })

  it('bàn lần đầu được xếp (pos NULL → có toạ độ) cũng phải được lưu', () => {
    const chuaSap: LayoutTable[] = [ban('a', 'Bàn 1')]
    const after = layoutTables(chuaSap)
    expect(changedPositions([], after)).toEqual([{ id: 'a', pos_x: 0, pos_y: 0 }])
  })
})
```

- [ ] **Step 2: Chạy test cho chắc là ĐỎ**

```bash
cd admin-web && npx vitest run lib/table-layout.test.ts
```

Expected: FAIL — `Failed to resolve import "./table-layout"`.

- [ ] **Step 3: Viết implementation tối thiểu**

Tạo `admin-web/lib/table-layout.ts`:

```ts
// Sơ đồ bàn của màn POS (/admin/cashier) — logic xếp lưới tách hẳn khỏi React để test được.
//
// Toạ độ là Ô LƯỚI, không phải pixel (spec 2026-09-03 §1.2): snap lưới thì không bao giờ có
// hai bàn chồng nhau, và sơ đồ không vỡ khi cửa sổ đổi cỡ.

export const LAYOUT_COLS = 12

export type LayoutTable = {
  id: string
  table_number: string
  pos_x: number | null
  pos_y: number | null
}

/** Bàn đã có chỗ đứng chắc chắn trên lưới. */
export type PlacedTable = LayoutTable & { x: number; y: number }

export type PositionPatch = { id: string; pos_x: number; pos_y: number }

const key = (x: number, y: number) => `${x},${y}`

function inGrid(x: number | null, y: number | null): boolean {
  return (
    x !== null && y !== null && Number.isInteger(x) && Number.isInteger(y) &&
    x >= 0 && x < LAYOUT_COLS && y >= 0
  )
}

// Ô trống đầu tiên tính từ (0,0) sang phải rồi xuống hàng.
function firstFree(taken: Set<string>): { x: number; y: number } {
  for (let y = 0; ; y++) {
    for (let x = 0; x < LAYOUT_COLS; x++) {
      if (!taken.has(key(x, y))) return { x, y }
    }
  }
}

/**
 * Xếp danh sách bàn vào lưới.
 *
 * Bàn đã có toạ độ hợp lệ giữ nguyên chỗ. Bàn chưa sắp (hoặc toạ độ hỏng/ngoài lưới) được
 * nhét vào ô trống đầu tiên, duyệt theo tên bàn kiểu số ("Bàn 2" trước "Bàn 10").
 * Hai bàn tranh nhau một ô (dữ liệu hỏng) thì bàn xét sau bị đẩy sang ô trống kế tiếp —
 * thà lệch một ô còn hơn vẽ đè mất một bàn.
 */
export function layoutTables(tables: LayoutTable[]): PlacedTable[] {
  const theoTen = [...tables].sort((a, b) =>
    a.table_number.localeCompare(b.table_number, 'vi', { numeric: true, sensitivity: 'base' }),
  )

  const taken = new Set<string>()
  const out: PlacedTable[] = []

  // Vòng 1: bàn đã sắp — giữ chỗ trước để bàn chưa sắp không cướp mất.
  for (const t of theoTen) {
    if (!inGrid(t.pos_x, t.pos_y)) continue
    const k = key(t.pos_x!, t.pos_y!)
    if (taken.has(k)) continue // tranh ô — để vòng 2 xử
    taken.add(k)
    out.push({ ...t, x: t.pos_x!, y: t.pos_y! })
  }

  // Vòng 2: mọi bàn còn lại.
  for (const t of theoTen) {
    if (out.some((p) => p.id === t.id)) continue
    const { x, y } = firstFree(taken)
    taken.add(key(x, y))
    out.push({ ...t, x, y })
  }

  return out.sort((a, b) => a.y - b.y || a.x - b.x)
}

/**
 * Kéo một bàn sang ô (x, y). Ô đang có bàn khác thì ĐỔI CHỖ hai bàn — không cho chồng, và
 * cũng không "đẩy dây chuyền" (khó đoán khi kéo nhanh giữa ca).
 * Toạ độ ngoài lưới hoặc id không tồn tại: trả nguyên danh sách, coi như thao tác không xảy ra.
 */
export function moveTable(
  placed: PlacedTable[],
  tableId: string,
  x: number,
  y: number,
): PlacedTable[] {
  if (!inGrid(x, y)) return placed
  const keo = placed.find((t) => t.id === tableId)
  if (!keo) return placed
  if (keo.x === x && keo.y === y) return placed

  const cho = placed.find((t) => t.x === x && t.y === y)
  const next = placed.map((t) => {
    if (t.id === keo.id) return { ...t, x, y }
    if (cho && t.id === cho.id) return { ...t, x: keo.x, y: keo.y }
    return t
  })
  return next.sort((a, b) => a.y - b.y || a.x - b.x)
}

/** Những bàn có toạ độ khác trước → đúng phần cần ghi xuống DB, không ghi thừa. */
export function changedPositions(before: PlacedTable[], after: PlacedTable[]): PositionPatch[] {
  const cu = new Map(before.map((t) => [t.id, t]))
  const out: PositionPatch[] = []
  for (const t of after) {
    const truoc = cu.get(t.id)
    if (!truoc || truoc.x !== t.x || truoc.y !== t.y) {
      out.push({ id: t.id, pos_x: t.x, pos_y: t.y })
    }
  }
  return out
}
```

- [ ] **Step 4: Chạy test cho XANH**

```bash
cd admin-web && npx vitest run lib/table-layout.test.ts
```

Expected: PASS toàn bộ (17 test).

- [ ] **Step 5: Commit**

```bash
git add admin-web/lib/table-layout.ts admin-web/lib/table-layout.test.ts
git commit -m "feat(admin): logic xep luoi so do ban + test"
```

---

## Task 3: Server action lưu vị trí bàn

**Files:**
- Create: `admin-web/lib/actions/table-layout.ts`

- [ ] **Step 1: Viết action**

Tạo `admin-web/lib/actions/table-layout.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { requireStoreOwnerStoreId } from '@/lib/auth/operator'
import type { PositionPatch } from '@/lib/table-layout'

export type SaveLayoutResult = { ok: true } | { ok: false; error: string }

/**
 * Lưu vị trí các bàn vừa kéo. Chỉ chủ quán (requireStoreOwnerStoreId fail-closed).
 *
 * Dùng createClient() — phiên đăng nhập thật — chứ KHÔNG createAdminClient(): policy
 * auth_update_tables (mig 006b) đã giới hạn theo đúng quán, để RLS làm việc của nó thay vì
 * cầm service role đi vòng qua. Mỗi bàn một câu update kèm .eq('store_id') làm chốt chặn thứ hai.
 */
export async function saveTableLayout(patches: PositionPatch[]): Promise<SaveLayoutResult> {
  if (patches.length === 0) return { ok: true }

  let storeId: string
  try {
    storeId = await requireStoreOwnerStoreId()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Không có quyền' }
  }

  const supabase = await createClient()
  for (const p of patches) {
    const { error } = await supabase
      .from('tables')
      .update({ pos_x: p.pos_x, pos_y: p.pos_y })
      .eq('id', p.id)
      .eq('store_id', storeId)
    if (error) return { ok: false, error: `Không lưu được vị trí bàn: ${error.message}` }
  }
  return { ok: true }
}
```

Không `revalidatePath`: sơ đồ là state phía client, revalidate chỉ làm trang nhấp nháy giữa lúc kéo.

- [ ] **Step 2: Kiểm tra biên dịch**

```bash
cd admin-web && npx tsc --noEmit
```

Expected: không lỗi mới (file `.tsbuildinfo` có sẵn nên chạy nhanh).

- [ ] **Step 3: Commit**

```bash
git add admin-web/lib/actions/table-layout.ts
git commit -m "feat(admin): server action luu vi tri ban"
```

---

## Task 4: Trang `/admin/cashier` + sơ đồ bàn kéo thả

**Files:**
- Create: `admin-web/app/admin/cashier/page.tsx`
- Create: `admin-web/app/admin/cashier/floor-map.tsx`
- Create: `admin-web/app/admin/cashier/cashier-client.tsx`

- [ ] **Step 1: Server component nạp dữ liệu**

Tạo `admin-web/app/admin/cashier/page.tsx`:

```tsx
import { requireOperatorOrRedirect } from '@/lib/auth/operator'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { listOpenTableSessions } from '@/lib/actions/table-session'
import type { LayoutTable } from '@/lib/table-layout'
import CashierClient from './cashier-client'

// Màn POS thu ngân — chỉ chủ quán. AdminLayout đã chặn, kiểm lại ở đây cho fail-closed
// theo tầng (page có thể bị render ngoài layout khi Next thay đổi cách nhóm route).
export default async function CashierPage() {
  const operator = await requireOperatorOrRedirect()
  if (operator.role !== 'store_owner') redirect('/mevo')

  const supabase = await createClient()

  const { data: store } = await supabase
    .from('stores')
    .select('payment_timing')
    .eq('id', operator.storeId)
    .single()

  const { data: tableRows } = await supabase
    .from('tables')
    .select('id, table_number, pos_x, pos_y')
    .eq('store_id', operator.storeId)
    .eq('is_active', true)

  const tables: LayoutTable[] = (tableRows ?? []).map((t) => ({
    id: t.id as string,
    table_number: t.table_number as string,
    pos_x: (t.pos_x as number | null) ?? null,
    pos_y: (t.pos_y as number | null) ?? null,
  }))

  const res = await listOpenTableSessions()

  return (
    <CashierClient
      storeId={operator.storeId}
      paymentTiming={(store?.payment_timing as 'prepay' | 'postpay' | null) ?? 'prepay'}
      initialTables={tables}
      initialSessions={res.ok ? res.sessions : []}
      initialError={res.ok ? null : res.error}
    />
  )
}
```

- [ ] **Step 2: Component sơ đồ bàn**

Tạo `admin-web/app/admin/cashier/floor-map.tsx`:

```tsx
'use client'

import { LAYOUT_COLS, type PlacedTable } from '@/lib/table-layout'
import type { OpenTableSession } from '@/lib/actions/table-session'
import type { TrayAssignment } from '@/lib/tray-colors'

const dong = (n: number) => n.toLocaleString('vi-VN') + 'đ'

export type TableState = {
  session: OpenTableSession
  tray: TrayAssignment | undefined
}

export default function FloorMap({
  placed,
  stateByTable,
  arrange,
  selectedSessionId,
  pickedSessionIds,
  pickedTableIds,
  onPickTable,
  onSelectSession,
  onMove,
}: {
  placed: PlacedTable[]
  stateByTable: Map<string, TableState>
  arrange: boolean
  selectedSessionId: string | null
  pickedSessionIds: Set<string>
  pickedTableIds: Set<string>
  onPickTable: (tableId: string) => void
  /** additive = ctrl/cmd+click: tick thêm mâm để gộp bill thay vì mở bill một mâm */
  onSelectSession: (sessionId: string, additive: boolean) => void
  onMove: (tableId: string, x: number, y: number) => void
}) {
  const rows = Math.max(1, ...placed.map((t) => t.y + 1)) + (arrange ? 1 : 0)
  const byCell = new Map(placed.map((t) => [`${t.x},${t.y}`, t]))

  const cells: { x: number; y: number; table: PlacedTable | undefined }[] = []
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < LAYOUT_COLS; x++) {
      cells.push({ x, y, table: byCell.get(`${x},${y}`) })
    }
  }

  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(${LAYOUT_COLS}, minmax(0, 1fr))` }}
    >
      {cells.map(({ x, y, table }) => (
        <div
          key={`${x}-${y}`}
          onDragOver={arrange ? (e) => e.preventDefault() : undefined}
          onDrop={
            arrange
              ? (e) => {
                  e.preventDefault()
                  const id = e.dataTransfer.getData('text/plain')
                  if (id) onMove(id, x, y)
                }
              : undefined
          }
          className={
            arrange && !table ? 'min-h-24 rounded-xl border border-dashed border-gray-200' : 'min-h-24'
          }
        >
          {table && (
            <Tile
              table={table}
              state={stateByTable.get(table.id)}
              arrange={arrange}
              selected={
                selectedSessionId !== null &&
                stateByTable.get(table.id)?.session.session_id === selectedSessionId
              }
              picked={
                pickedTableIds.has(table.id) ||
                (!!stateByTable.get(table.id) &&
                  pickedSessionIds.has(stateByTable.get(table.id)!.session.session_id))
              }
              onClick={(e) => {
                if (arrange) return
                const st = stateByTable.get(table.id)
                if (st) onSelectSession(st.session.session_id, e.ctrlKey || e.metaKey)
                else onPickTable(table.id)
              }}
            />
          )}
        </div>
      ))}
    </div>
  )
}

function Tile({
  table,
  state,
  arrange,
  selected,
  picked,
  onClick,
}: {
  table: PlacedTable
  state: TableState | undefined
  arrange: boolean
  selected: boolean
  picked: boolean
  onClick: (e: React.MouseEvent) => void
}) {
  const s = state?.session
  const tray = state?.tray

  // Màu nền: mâm dùng bảng màu chung với màn nhân viên; bàn lẻ có khách = cam; trống = xám.
  const base = !s
    ? 'border-gray-200 bg-white text-gray-400'
    : tray
      ? `${tray.color.box} text-gray-800`
      : 'border-orange-200 bg-orange-50 text-gray-800'

  const viền = selected
    ? 'ring-2 ring-gray-900'
    : picked
      ? 'ring-2 ring-orange-400'
      : s?.needs_review
        ? 'ring-2 ring-amber-400'
        : ''

  return (
    <button
      type="button"
      draggable={arrange}
      onDragStart={(e) => e.dataTransfer.setData('text/plain', table.id)}
      onClick={onClick}
      className={`relative flex h-24 w-full flex-col items-center justify-center rounded-xl border p-1 text-center transition-colors ${base} ${viền} ${
        arrange ? 'cursor-move' : 'cursor-pointer hover:brightness-95'
      }`}
    >
      {s && s.cooking_count > 0 && (
        <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-red-500" />
      )}
      {s?.needs_review && <span className="absolute left-1.5 top-1.5 text-xs">⏰</span>}
      <span className="w-full truncate text-sm font-bold">{table.table_number}</span>
      {s ? (
        <>
          <span className="text-xs font-semibold">{dong(s.total)}</span>
          <span className="text-[10px] text-gray-500">
            {tray ? `Mâm ${tray.index}` : `${s.order_count} đơn`}
          </span>
        </>
      ) : (
        <span className="text-[10px]">trống</span>
      )}
    </button>
  )
}
```

- [ ] **Step 3: Client điều phối (bản chỉ có sơ đồ, panel bill làm ở Task 5)**

Tạo `admin-web/app/admin/cashier/cashier-client.tsx`:

```tsx
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { listOpenTableSessions, type OpenTableSession } from '@/lib/actions/table-session'
import { saveTableLayout } from '@/lib/actions/table-layout'
import {
  changedPositions,
  layoutTables,
  moveTable,
  type LayoutTable,
  type PlacedTable,
} from '@/lib/table-layout'
import { assignTrayColors } from '@/lib/tray-colors'
import FloorMap, { type TableState } from './floor-map'

export default function CashierClient({
  storeId,
  paymentTiming,
  initialTables,
  initialSessions,
  initialError,
}: {
  storeId: string
  paymentTiming: 'prepay' | 'postpay'
  initialTables: LayoutTable[]
  initialSessions: OpenTableSession[]
  initialError: string | null
}) {
  const [placed, setPlaced] = useState<PlacedTable[]>(() => layoutTables(initialTables))
  const [sessions, setSessions] = useState(initialSessions)
  const [error, setError] = useState(initialError)
  const [arrange, setArrange] = useState(false)
  const [connected, setConnected] = useState(false)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [pickedSessionIds, setPickedSessionIds] = useState<Set<string>>(new Set())
  const [pickedTableIds, setPickedTableIds] = useState<Set<string>>(new Set())
  const reloading = useRef(false)

  // Tải lại CẢ danh sách thay vì cộng dồn tại chỗ: tổng tiền phải do server tính, nhiều nguồn
  // cùng đổi một phiên (khách gọi thêm, bếp đổi trạng thái, nhân viên chốt bill ở máy khác).
  const reload = useCallback(async () => {
    if (reloading.current) return
    reloading.current = true
    try {
      const res = await listOpenTableSessions()
      if (res.ok) {
        setSessions(res.sessions)
        setError(null)
      } else {
        setError(res.error)
      }
    } finally {
      reloading.current = false
    }
  }, [])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`cashier-${storeId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'table_sessions', filter: `store_id=eq.${storeId}` },
        () => void reload(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `store_id=eq.${storeId}` },
        () => void reload(),
      )
      // session_tables không có cột store_id nên không lọc được — nghe hết rồi tải lại.
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'session_tables' },
        () => void reload(),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnected(true)
          void reload()
        } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
          setConnected(false)
        }
      })
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [storeId, reload])

  const trayColors = useMemo(() => assignTrayColors(sessions), [sessions])

  // Bàn nào đang thuộc phiên nào — nguồn cho màu ô và cho việc bấm ô ra bill.
  const stateByTable = useMemo(() => {
    const m = new Map<string, TableState>()
    for (const s of sessions) {
      if (s.status !== 'open') continue
      for (const t of s.tables) m.set(t.id, { session: s, tray: trayColors.get(s.session_id) })
    }
    return m
  }, [sessions, trayColors])

  const onMove = async (tableId: string, x: number, y: number) => {
    const truoc = placed
    const sau = moveTable(truoc, tableId, x, y)
    if (sau === truoc) return
    setPlaced(sau)
    const res = await saveTableLayout(changedPositions(truoc, sau))
    // Lỗi mạng: trả vị trí về đúng như DB, không để sơ đồ máy này khác máy khác.
    if (!res.ok) {
      setPlaced(truoc)
      setError(res.error)
    }
  }

  const togglePickTable = (id: string) =>
    setPickedTableIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // additive (ctrl/cmd+click) = tick thêm mâm để gộp bill; click thường = mở bill một mâm.
  const selectSession = (id: string, additive: boolean) => {
    if (additive) {
      setPickedSessionIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
      return
    }
    setSelectedSessionId(id)
    setPickedSessionIds(new Set())
    setPickedTableIds(new Set())
  }

  return (
    <div className="flex h-full min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-5 py-3">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-300'}`}
            />
            <span className="text-xs font-medium text-gray-500">
              {connected ? 'Đang cập nhật trực tiếp' : 'Mất kết nối — đang thử lại...'}
            </span>
            <span className="ml-3 text-xs text-gray-400">{placed.length} bàn</span>
          </div>
          <button
            onClick={() => {
              setArrange((v) => !v)
              setSelectedSessionId(null)
              setPickedTableIds(new Set())
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              arrange ? 'bg-gray-900 text-white' : 'border border-gray-200 text-gray-600'
            }`}
          >
            {arrange ? '✓ Xong sắp xếp' : '⇄ Sắp xếp bàn'}
          </button>
        </div>

        {error && (
          <div className="mx-5 mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {error}
            <button onClick={() => setError(null)} className="ml-2 font-semibold underline">
              Đóng
            </button>
          </div>
        )}

        {paymentTiming === 'prepay' && (
          <p className="mx-5 mt-3 rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-500">
            Quán đang chạy <b>trả trước</b> — phiên bàn chỉ dùng ở chế độ trả sau. Vẫn sắp xếp
            được vị trí bàn cho sau này.
          </p>
        )}

        {arrange && (
          <p className="mx-5 mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
            Kéo bàn sang ô trống để sắp lại. Thả lên bàn khác thì hai bàn đổi chỗ. Xong nhớ bấm
            <b> Xong sắp xếp</b> để quay về chế độ thu tiền.
          </p>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <FloorMap
            placed={placed}
            stateByTable={stateByTable}
            arrange={arrange}
            selectedSessionId={selectedSessionId}
            pickedSessionIds={pickedSessionIds}
            pickedTableIds={pickedTableIds}
            onPickTable={togglePickTable}
            onSelectSession={selectSession}
            onMove={(id, x, y) => void onMove(id, x, y)}
          />
        </div>
      </div>
    </div>
  )
}
```

`pickedSessionIds` chưa có nút bấm ở task này — Task 5 dùng tới; khai báo sẵn để không phải
sửa chữ ký `FloorMap` hai lần.

- [ ] **Step 4: Thêm mục nav**

Trong `admin-web/app/admin/admin-nav.tsx`: thêm `Calculator` vào danh sách import từ
`lucide-react`, và thêm dòng đầu tiên của nhóm **Vận hành**:

```ts
      { href: '/admin/cashier', icon: Calculator, label: 'Thu ngân (POS)' },
```

- [ ] **Step 5: Xem thật trên trình duyệt**

```bash
cd admin-web && npm run dev
```

Mở `/admin/cashier` bằng tài khoản chủ quán Bảo Lương. Kiểm: thấy đủ 20 bàn; bấm "Sắp xếp bàn"
rồi kéo một bàn sang ô trống; F5 thấy bàn vẫn ở chỗ mới.

- [ ] **Step 6: Commit**

```bash
git add admin-web/app/admin/cashier admin-web/app/admin/admin-nav.tsx
git commit -m "feat(admin): man POS - so do ban keo tha"
```

---

## Task 5: Panel bill + thu tiền + thao tác mâm

**Files:**
- Create: `admin-web/app/admin/cashier/bill-panel.tsx`
- Modify: `admin-web/app/admin/cashier/cashier-client.tsx`

- [ ] **Step 1: Viết panel**

Tạo `admin-web/app/admin/cashier/bill-panel.tsx`:

```tsx
'use client'

import type { OpenTableSession } from '@/lib/actions/table-session'

const dong = (n: number) => n.toLocaleString('vi-VN') + 'đ'
const gio = (iso: string) =>
  new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })

export default function BillPanel({
  selected,
  picked,
  freeTableCount,
  pickedFreeTables,
  busy,
  onPay,
  onPrint,
  onReset,
  onCreateTray,
  onClearPick,
}: {
  /** Phiên đang mở bill (bấm 1 bàn có khách) */
  selected: OpenTableSession | null
  /** Các phiên đã tick để gộp bill */
  picked: OpenTableSession[]
  freeTableCount: number
  /** Số bàn TRỐNG đang tick — để ghép mâm */
  pickedFreeTables: number
  busy: boolean
  onPay: (list: OpenTableSession[], instrument: 'cash' | 'bank') => void
  onPrint: (list: OpenTableSession[]) => void
  onReset: (s: OpenTableSession) => void
  onCreateTray: () => void
  onClearPick: () => void
}) {
  const list = picked.length > 0 ? picked : selected ? [selected] : []
  const tong = list.reduce((n, s) => n + s.total, 0)
  const chuaXong = list.reduce((n, s) => n + s.cooking_count, 0)

  if (pickedFreeTables >= 2) {
    return (
      <Khung tieuDe={`Đã chọn ${pickedFreeTables} bàn trống`}>
        <button
          onClick={onCreateTray}
          disabled={busy}
          className="w-full rounded-xl bg-gray-900 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          🍲 Ghép thành một mâm
        </button>
        <button onClick={onClearPick} className="mt-2 w-full py-2 text-xs text-gray-500 underline">
          Bỏ chọn
        </button>
      </Khung>
    )
  }

  if (list.length === 0) {
    return (
      <Khung tieuDe="Chưa chọn bàn">
        <p className="text-xs leading-relaxed text-gray-500">
          Bấm một bàn có khách để mở bill và thu tiền.
          <br />
          Bấm nhiều bàn <b>trống</b> để ghép mâm.
          <br />
          {freeTableCount} bàn đang trống.
        </p>
      </Khung>
    )
  }

  return (
    <Khung
      tieuDe={
        list.length > 1
          ? `Gộp bill ${list.length} mâm`
          : `${list[0].is_open_ordering ? '🍲' : '🪑'} ${list[0].table_number}`
      }
    >
      {list.length === 1 && (
        <p className="text-xs text-gray-400">
          mở lúc {gio(list[0].opened_at)} · {list[0].order_count} đơn
          {list[0].opened_by === 'staff' && ' · nhân viên mở'}
        </p>
      )}

      {list[0].needs_review && list.length === 1 && (
        <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
          ⏰ Phiên quá 6 giờ không hoạt động nên bàn đã mở khoá, nhưng còn
          <b> {dong(list[0].unpaid_total)} chưa thu</b>.
        </p>
      )}

      <ul className="mt-3 max-h-[45vh] space-y-2 overflow-y-auto border-y border-gray-100 py-3">
        {list.flatMap((s) =>
          s.orders.map((o) => (
            <li key={o.id} className="text-xs">
              <div className="flex justify-between text-gray-400">
                <span>
                  {gio(o.created_at)} · {o.order_source === 'staff' ? 'nhân viên' : 'khách'}
                </span>
                <span>
                  {dong(o.total_amount)}
                  {o.payment_received_at && ' ✓'}
                </span>
              </div>
              <p className="text-gray-700">
                {o.items.map((it) => `${it.name} ×${it.quantity}`).join(', ') || 'Không có món'}
              </p>
            </li>
          )),
        )}
      </ul>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-sm text-gray-500">TỔNG</span>
        <span className="text-xl font-bold text-gray-900">{dong(tong)}</span>
      </div>

      {chuaXong > 0 && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ⚠️ Còn {chuaXong} món chưa xong. Vẫn thu tiền và đóng bàn? Món đang làm vẫn nằm ở màn bếp.
        </p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={() => onPay(list, 'cash')}
          disabled={busy}
          className="rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
        >
          💵 Tiền mặt
        </button>
        <button
          onClick={() => onPay(list, 'bank')}
          disabled={busy}
          className="rounded-xl bg-gray-800 py-3 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-50"
        >
          🏦 Chuyển khoản
        </button>
      </div>
      <p className="mt-1.5 text-[11px] text-gray-400">
        Chuyển khoản: cho khách quét mã QR của quán, nghe loa báo tiền về rồi mới bấm.
      </p>

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => onPrint(list)}
          disabled={busy}
          className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          🖨️ In bill
        </button>
        {list.length === 1 && (
          <button
            onClick={() => onReset(list[0])}
            disabled={busy}
            className="rounded-lg border border-red-200 px-3 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
            title="Bỏ bàn: huỷ đơn chưa nấu và chưa thu tiền, đóng phiên"
          >
            Bỏ bàn
          </button>
        )}
      </div>

      {picked.length > 0 && (
        <button onClick={onClearPick} className="mt-2 w-full py-2 text-xs text-gray-500 underline">
          Bỏ chọn {picked.length} mâm
        </button>
      )}
    </Khung>
  )
}

function Khung({ tieuDe, children }: { tieuDe: string; children: React.ReactNode }) {
  return (
    <aside className="flex w-[400px] flex-shrink-0 flex-col overflow-y-auto border-l border-gray-200 bg-white p-4">
      <h2 className="text-base font-bold text-gray-900">{tieuDe}</h2>
      {children}
    </aside>
  )
}
```

- [ ] **Step 2: Nối panel vào client**

Trong `admin-web/app/admin/cashier/cashier-client.tsx`:

Thêm import:

```tsx
import {
  closeTableSession,
  closeTableSessionsBulk,
  createTraySession,
} from '@/lib/actions/table-session'
import BillPanel from './bill-panel'
```

Thêm state `busy` cạnh các state khác:

```tsx
  const [busy, setBusy] = useState(false)
```

Thêm các giá trị dẫn xuất và handler ngay trước `return (`:

```tsx
  const openSessions = sessions.filter((s) => s.status === 'open')
  const selected = sessions.find((s) => s.session_id === selectedSessionId) ?? null
  const pickedSessions = sessions.filter((s) => pickedSessionIds.has(s.session_id))
  const freeTableCount = placed.filter((t) => !stateByTable.has(t.id)).length

  const sauKhiXong = async (msg?: string) => {
    setBusy(false)
    setSelectedSessionId(null)
    setPickedSessionIds(new Set())
    setPickedTableIds(new Set())
    if (msg) setError(msg)
    await reload()
  }

  const onPay = async (list: OpenTableSession[], instrument: 'cash' | 'bank') => {
    setBusy(true)
    const ids = list.map((s) => s.session_id)
    const res =
      ids.length === 1
        ? await closeTableSession(ids[0], 'paid', instrument)
        : await closeTableSessionsBulk(ids, 'paid', instrument)
    if (!res.ok) {
      setBusy(false)
      setError(res.error)
      return
    }
    // close_table_session idempotent: máy khác vừa chốt thì báo cho biết, KHÔNG hiện lỗi đỏ.
    await sauKhiXong(
      'already' in res && res.already ? 'Bàn này vừa được máy khác chốt xong.' : undefined,
    )
  }

  const onReset = async (s: OpenTableSession) => {
    if (!confirm(`Bỏ bàn ${s.table_number}? Đơn chưa nấu và chưa thu tiền sẽ bị huỷ.`)) return
    setBusy(true)
    const res = await closeTableSession(s.session_id, 'staff_reset', null)
    if (!res.ok) {
      setBusy(false)
      setError(res.error)
      return
    }
    await sauKhiXong(
      res.ordersLeftInKitchen > 0
        ? `Đã bỏ bàn. Còn ${res.ordersLeftInKitchen} món đã vào bếp — vẫn nằm ở màn bếp, xử lý tay.`
        : undefined,
    )
  }

  const onCreateTray = async () => {
    setBusy(true)
    const res = await createTraySession([...pickedTableIds])
    if (!res.ok) {
      setBusy(false)
      setError(res.error)
      return
    }
    await sauKhiXong()
  }

  const onPrint = (list: OpenTableSession[]) => {
    window.open(`/staff/tables/print?ids=${list.map((s) => s.session_id).join(',')}`, '_blank')
  }
```

Đổi khối `return` để chèn panel: ngay trước thẻ `</div>` cuối cùng (đóng flex ngoài cùng),
sau `</div>` của cột trái, thêm:

```tsx
        <BillPanel
          selected={selected}
          picked={pickedSessions}
          freeTableCount={freeTableCount}
          pickedFreeTables={pickedTableIds.size}
          busy={busy}
          onPay={(list, ins) => void onPay(list, ins)}
          onPrint={onPrint}
          onReset={(s) => void onReset(s)}
          onCreateTray={() => void onCreateTray()}
          onClearPick={() => {
            setPickedSessionIds(new Set())
            setPickedTableIds(new Set())
          }}
        />
```

Thêm nút tick mâm để gộp bill: trong thanh trên cùng (cạnh nút Sắp xếp), thêm

```tsx
          {openSessions.length > 1 && !arrange && (
            <button
              onClick={() =>
                setPickedSessionIds((prev) =>
                  prev.size > 0 ? new Set() : new Set(openSessions.map((s) => s.session_id)),
                )
              }
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600"
            >
              {pickedSessionIds.size > 0 ? 'Bỏ chọn tất cả' : 'Chọn tất cả để gộp bill'}
            </button>
          )}
```

`floor-map.tsx` **không phải sửa gì**: chữ ký `onSelectSession(id, additive)` và ctrl/cmd+click
đã dựng sẵn ở Task 4.

- [ ] **Step 3: Kiểm tra biên dịch + test**

```bash
cd admin-web && npx tsc --noEmit && npx vitest run
```

Expected: không lỗi type; toàn bộ test cũ + test mới PASS.

- [ ] **Step 4: Thử tay trên dev**

Với quán Bảo Lương (postpay): tạo một đơn ở `/staff/order` cho Bàn 1 → ô Bàn 1 trên POS đổi
màu cam và hiện tiền trong vài giây; bấm ô → panel hiện bill; bấm "💵 Tiền mặt" → bàn về trống.

- [ ] **Step 5: Commit**

```bash
git add admin-web/app/admin/cashier
git commit -m "feat(admin): panel bill + thu tien + ghep mam tren man POS"
```

---

## Task 6: Dải "Đơn mới"

**Files:**
- Create: `admin-web/app/admin/cashier/new-orders-feed.tsx`
- Modify: `admin-web/app/admin/cashier/cashier-client.tsx`

- [ ] **Step 1: Viết component**

Tạo `admin-web/app/admin/cashier/new-orders-feed.tsx`:

```tsx
'use client'

import { useMemo } from 'react'
import type { OpenTableSession } from '@/lib/actions/table-session'

const dong = (n: number) => n.toLocaleString('vi-VN') + 'đ'

const STATUS_LABEL: Record<string, string> = {
  pending: 'Chờ xử lý',
  confirmed: 'Đã nhận',
  cooking: 'Đang làm',
  ready: 'Xong',
  paid: 'Hoàn tất',
}

const truoc = (iso: string, now: number) => {
  const phut = Math.floor((now - new Date(iso).getTime()) / 60000)
  if (phut < 1) return 'vừa xong'
  return `${phut}'  trước`
}

/** Đơn "mới" = tạo trong 15 phút gần nhất. Không lưu trạng thái đã-xem: thêm cột chỉ để tô
 *  đậm một dòng là không đáng. */
const CUA_SO_PHUT = 15

export default function NewOrdersFeed({
  sessions,
  onSelectSession,
}: {
  sessions: OpenTableSession[]
  onSelectSession: (sessionId: string) => void
}) {
  const now = Date.now()
  const rows = useMemo(() => {
    const moc = now - CUA_SO_PHUT * 60_000
    return sessions
      .flatMap((s) =>
        s.orders
          .filter((o) => new Date(o.created_at).getTime() >= moc)
          .map((o) => ({ o, s })),
      )
      .sort((a, b) => b.o.created_at.localeCompare(a.o.created_at))
  }, [sessions, now])

  return (
    <div className="flex max-h-44 flex-col border-t border-gray-200 bg-white">
      <div className="flex items-center gap-2 px-5 py-2">
        <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Đơn mới</span>
        <span className="text-[11px] text-gray-400">{CUA_SO_PHUT} phút gần nhất</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-3">
        {rows.length === 0 ? (
          <p className="py-2 text-xs text-gray-400">Chưa có đơn nào mới.</p>
        ) : (
          <ul className="space-y-1">
            {rows.map(({ o, s }) => (
              <li key={o.id}>
                <button
                  onClick={() => onSelectSession(s.session_id)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-gray-50"
                >
                  <span className="w-32 flex-shrink-0 truncate font-semibold text-gray-800">
                    {s.table_number}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-gray-600">
                    {o.items.map((it) => `${it.name} ×${it.quantity}`).join(', ') || 'Không có món'}
                  </span>
                  <span className="flex-shrink-0 text-gray-400">
                    {o.order_source === 'staff' ? '🧑‍🍳 nhân viên' : '👤 khách'}
                  </span>
                  <span className="w-20 flex-shrink-0 text-right text-gray-400">
                    {truoc(o.created_at, now)}
                  </span>
                  <span className="w-20 flex-shrink-0 text-right text-gray-500">
                    {STATUS_LABEL[o.status] ?? o.status}
                  </span>
                  <span className="w-24 flex-shrink-0 text-right font-semibold text-gray-800">
                    {dong(o.total_amount)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Nối vào client**

Trong `cashier-client.tsx`: import `NewOrdersFeed from './new-orders-feed'`, rồi đặt ngay sau
`</div>` đóng vùng cuộn sơ đồ (vẫn nằm trong cột trái):

```tsx
        <NewOrdersFeed sessions={sessions} onSelectSession={(id) => selectSession(id, false)} />
```

- [ ] **Step 3: Kiểm tra**

```bash
cd admin-web && npx tsc --noEmit
```

Expected: sạch. Trên dev: đặt một đơn ở `/staff/order` → dòng mới hiện ở dải dưới trong vài
giây, bấm vào thì panel bên phải mở đúng bàn đó.

- [ ] **Step 4: Commit**

```bash
git add admin-web/app/admin/cashier
git commit -m "feat(admin): dai don moi tren man POS"
```

---

## Task 7: Thao tác mâm nâng cao (thêm bàn / nhập vào mâm / nhả chủ phiên)

Ba việc `/staff/tables` đang có mà POS còn thiếu. Đều gọi lại action sẵn có, không viết logic mới.

**Files:**
- Modify: `admin-web/app/admin/cashier/bill-panel.tsx`
- Modify: `admin-web/app/admin/cashier/cashier-client.tsx`

- [ ] **Step 1: Thêm 3 nút vào panel**

Trong `bill-panel.tsx`, thêm 3 prop vào chữ ký component (ngay dưới `onCreateTray`):

```tsx
  /** Bàn TRỐNG để thêm vào mâm đang chọn */
  freeTables: { id: string; table_number: string }[]
  /** Các phiên đang mở KHÁC phiên đang chọn — để nhập phiên lẻ vào mâm */
  otherSessions: OpenTableSession[]
  onAddTable: (sessionId: string, tableId: string) => void
  onMergeInto: (sessionId: string, targetSessionId: string) => void
  onReleaseHost: (sessionId: string) => void
```

Và thêm khối này ngay trước nút "Bỏ chọn ... mâm" cuối component (chỉ hiện khi đang xem đúng
một phiên):

```tsx
      {list.length === 1 && (
        <details className="mt-3 rounded-lg border border-gray-200 p-2">
          <summary className="cursor-pointer text-xs font-semibold text-gray-600">
            Thao tác khác
          </summary>

          <label className="mt-2 block text-[11px] text-gray-500">Thêm bàn trống vào mâm này</label>
          <select
            disabled={busy || freeTables.length === 0}
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) onAddTable(list[0].session_id, e.target.value)
              e.target.value = ''
            }}
            className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
          >
            <option value="">— chọn bàn trống —</option>
            {freeTables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.table_number}
              </option>
            ))}
          </select>

          <label className="mt-3 block text-[11px] text-gray-500">
            Nhập bàn này vào một mâm khác (gộp cả đơn)
          </label>
          <select
            disabled={busy || otherSessions.length === 0}
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) onMergeInto(list[0].session_id, e.target.value)
              e.target.value = ''
            }}
            className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
          >
            <option value="">— chọn mâm đích —</option>
            {otherSessions.map((s) => (
              <option key={s.session_id} value={s.session_id}>
                {s.table_number}
              </option>
            ))}
          </select>

          <button
            onClick={() => onReleaseHost(list[0].session_id)}
            disabled={busy}
            className="mt-3 w-full rounded-lg border border-gray-200 py-2 text-xs font-semibold text-gray-600 disabled:opacity-50"
          >
            Nhả quyền gọi món (khách hết pin / đổi máy)
          </button>
        </details>
      )}
```

- [ ] **Step 2: Nối handler ở client**

Trong `cashier-client.tsx`, thêm import:

```tsx
import {
  addTableToSession,
  mergeSessionIntoTray,
  releaseTableSessionHost,
} from '@/lib/actions/table-session'
```

Thêm handler chung + 3 handler cạnh `onCreateTray`:

```tsx
  const chay = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true)
    const res = await fn()
    if (!res.ok) {
      setBusy(false)
      setError(res.error ?? 'Lỗi')
      return
    }
    await sauKhiXong()
  }
```

Và truyền thêm prop cho `<BillPanel ... />`:

```tsx
          freeTables={placed.filter((t) => !stateByTable.has(t.id))}
          otherSessions={openSessions.filter((s) => s.session_id !== selectedSessionId)}
          onAddTable={(sid, tid) => void chay(() => addTableToSession(sid, tid))}
          onMergeInto={(sid, target) => void chay(() => mergeSessionIntoTray(sid, target))}
          onReleaseHost={(sid) => void chay(() => releaseTableSessionHost(sid))}
```

`placed` có sẵn `id` + `table_number` nên khớp thẳng kiểu prop `freeTables`.

- [ ] **Step 3: Kiểm tra biên dịch**

```bash
cd admin-web && npx tsc --noEmit
```

Expected: sạch.

- [ ] **Step 4: Thử tay**

Mở một bàn có khách → "Thao tác khác" → thêm một bàn trống → hai ô cùng màu mâm.
Mở một bàn lẻ khác → "Nhập vào mâm" → chọn mâm vừa tạo → bàn lẻ biến mất, đơn của nó dồn vào mâm.

- [ ] **Step 5: Commit**

```bash
git add admin-web/app/admin/cashier
git commit -m "feat(admin): them ban vao mam / nhap vao mam / nha chu phien tren man POS"
```

---

## Task 8: Chốt sprint — kiểm tra toàn bộ + checklist test

**Files:**
- Modify: `TESTING.md`
- Modify: `CLAUDE.md` (bảng lịch sử quyết định)

- [ ] **Step 1: Chạy đủ bộ kiểm tra**

```bash
cd admin-web && npx tsc --noEmit && npx vitest run && npm run lint && npm run build
```

Expected: cả bốn lệnh thoát mã 0. Nếu `npm run build` báo lỗi Tailwind mất màu, kiểm lại
class động — mọi class phải là chuỗi nguyên vẹn (xem cảnh báo đầu `lib/tray-colors.ts`).

- [ ] **Step 2: Viết checklist test vào `TESTING.md`**

Thêm vào cuối file, mục `## 2026-09-03 — Sprint 1: Màn POS thu ngân`, đánh số tiếp bài test:

```markdown
1. Vào /admin/cashier bằng tài khoản chủ quán → thấy sơ đồ đủ số bàn của quán.
2. Bấm "⇄ Sắp xếp bàn" → kéo Bàn 5 sang ô trống → F5 → bàn vẫn ở chỗ mới.
3. Ở chế độ Sắp xếp, kéo Bàn 1 thả đúng lên Bàn 2 → hai bàn đổi chỗ, không chồng nhau.
4. Bấm "✓ Xong sắp xếp" → bấm vào một ô bàn → KHÔNG kéo được nữa, panel bill mở ra.
5. Khách quét QR đặt món ở Bàn 3 → trong ~3 giây ô Bàn 3 đổi màu cam, hiện tiền, và dòng đơn
   hiện ở dải "Đơn mới".
6. Bấm dòng trong "Đơn mới" → panel bên phải nhảy đúng sang bàn của đơn đó.
7. Bấm 3 ô bàn TRỐNG → panel hiện "Ghép thành một mâm" → bấm → 3 bàn cùng một màu mâm.
8. Ctrl+click 2 mâm khác nhau → panel hiện "Gộp bill 2 mâm" với tổng cộng đúng.
9. Bấm "🖨️ In bill" → mở tab in, đủ món của cả các mâm đã chọn.
10. Bấm "💵 Tiền mặt" → bàn về trống, doanh thu ở /admin/dashboard tăng đúng số vừa thu.
11. Mở 2 tab cùng bấm thu tiền một bàn → tab sau hiện "Bàn này vừa được máy khác chốt xong",
    KHÔNG hiện lỗi đỏ, tiền không bị cộng hai lần.
12. Đăng nhập bằng tài khoản nhân viên (store_staff) rồi vào /admin/cashier → bị đá ra.
13. Bàn có món đang nấu → ô bàn có chấm đỏ; bấm thu tiền → hiện cảnh báo "còn N món chưa xong".
14. Mở một bàn có khách → "Thao tác khác" → thêm một bàn trống vào mâm → hai ô cùng một màu mâm.
15. Bàn lẻ khác → "Nhập vào mâm" → chọn mâm ở bài 14 → bàn lẻ biến mất khỏi sơ đồ, đơn của nó
    dồn vào mâm, tổng tiền mâm tăng đúng.
```

- [ ] **Step 3: Ghi quyết định vào `CLAUDE.md`**

Thêm dòng cuối bảng "Lịch sử quyết định":

```markdown
| 2026-09-03 | **Màn POS thu ngân `/admin/cashier`** (Sprint 1): sơ đồ bàn kéo thả lưu ở `tables.pos_x/pos_y` (toạ độ **ô lưới**, không phải pixel — mig 044), dải "Đơn mới" 15 phút, panel bill dùng lại **nguyên** các server action mig 039/040 (thu tiền, bỏ bàn, ghép mâm, gộp bill, in bill) | Chủ quán ngồi quầy cần nhìn cả quán trên máy tính; `/staff/tables` là danh sách dọc mobile-first cho nhân viên chạy bàn. Sprint này **không viết một dòng logic tiền nào** — mọi thao tác tiền gọi lại RPC đang chạy thật, nên rủi ro chỉ nằm ở tầng hiển thị. Logic xếp lưới tách ra `lib/table-layout.ts` (hàm thuần + 17 test) vì kéo thả sai một ô là mất dấu bàn trên sơ đồ |
```

- [ ] **Step 4: Commit**

```bash
git add TESTING.md CLAUDE.md
git commit -m "docs: checklist test + quyet dinh man POS sprint 1"
```

- [ ] **Step 5: DỪNG — báo anh Tú test**

Theo quy tắc bắt buộc ở `CLAUDE.md`: không tự chuyển sang Sprint 2. Nói đúng câu:
*"Xong rồi anh, test theo TESTING.md — mục 2026-09-03 Sprint 1, bài 1–15 nhé"* rồi chờ PASS.

---

## Sprint 2

Kế hoạch sửa bill (mig 045/046 + 3 RPC + UI trong panel) viết **sau khi Sprint 1 PASS** —
UI panel bill lúc đó đã đứng thật, khỏi phải đoán chỗ nhét nút.
