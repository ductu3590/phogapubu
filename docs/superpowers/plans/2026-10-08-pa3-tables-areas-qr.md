# PA-3 — Sơ đồ bàn & QR theo khu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tab "Sơ đồ bàn & QR" nhóm bàn theo khu, mỗi khu có màu nhận diện + nút Tuỳ chỉnh khu (đổi tên, đổi màu, xoá khi trống), thêm khu / thêm bàn vào khu, và in QR hàng loạt (A4, 12 mã/trang) theo cả quán hoặc từng khu; POS dùng cùng màu khu.

**Architecture:** Cột `table_areas.color` (mig 094) + vá `pos_get_floor_layout` trả thêm màu. Màu là một bảng hằng THUẦN `lib/area-colors.ts` (class Tailwind nguyên vẹn). Quản lý khu ở tab Bàn & QR bằng server action owner-only (service-role, LUÔN lọc `store_id`). Trang in `/admin/tables/print-qr` là server component sinh QR (thư viện `qrcode` sẵn có) + CSS in, không thêm thư viện PDF.

**Tech Stack:** Next.js 16, Supabase Postgres, Tailwind v4, `qrcode`, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-10-07-pos-admin-complete-design.md` (mục PA-3). Anh Tú chốt: KHÔNG số ghế; có khu + Tuỳ chỉnh khu + nhãn màu từng khu như thiết kế A03; in QR hàng loạt.

## Global Constraints

- Chữ người dùng thấy + comment logic phức tạp: tiếng Việt. Không hardcode ID/key/URL.
- **Màu khu chỉ là NHẬN DIỆN**: chấm/viền + chữ; nền ô bàn vẫn trắng. KHÔNG dùng màu trạng thái và sắc sát chúng (quyết định 2026-10-02): cấm xanh lá/emerald/lime/teal, xanh dương/sky/cyan, vàng/amber, đỏ/rose, cam, xám/slate/zinc/stone.
- Tailwind v4 KHÔNG safelist: mọi class màu phải là chuỗi nguyên vẹn trong source (không ghép `bg-${x}-50`).
- Server action dùng `createAdminClient` bỏ qua RLS → PHẢI `requireStoreOwnerStoreId()` + lọc `.eq('store_id', storeId)` ở MỌI câu ghi/đọc (bài học PA-2).
- Hàm SQL sống chỉ vá tại chỗ bằng helper `pg_temp.mevo_patch` (raise nếu không còn chuỗi cần vá) — như mig 093.
- Migration áp prod bằng Supabase MCP `apply_migration` (project `dlkgdpexjtyynbotkwka`), được phép tự chạy.
- Lệnh từ `admin-web/`: `npx vitest run <file>`, `npx tsc --noEmit`, `npx eslint <files>`, `npm run build`.
- Commit `feat:/fix:/docs:` + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Test tay trên **Bảo Lương** (2 khu: Trong nhà 7 bàn, Ngoài trời 13 bàn).

## Lệch spec (đã chốt trong plan)

- Spec ghi **8 màu** gồm cyan, rose, nâu, slate — trái quy tắc màu 2026-10-02 (cấm cyan/rose/xám). Plan dùng **5 màu**: tím (violet), chàm (indigo), tím đậm (purple), hồng tím (fuchsia), hồng (pink). Khu thứ 6 trở đi dùng lại màu (quán thật thường 2–4 khu).

## Review Focus

1. **Xoá khu còn bàn** (gọi thẳng action, bỏ qua nút đã ẩn) → từ chối, không đổi gì; FK `tables_area_store_fk` cũng chặn. → test action Task 3.
2. **Gán bàn / sửa / xoá khu của QUÁN KHÁC** bằng id đoán được → không đụng gì (mọi câu lọc `store_id`). → test Task 3.
3. **Tên khu trùng (khác hoa thường) / rỗng / > 60 ký tự** → báo lỗi tiếng Việt, không ghi. → test Task 3.
4. **POS đang "Sắp xếp bàn" thì chủ quán sửa khu ở tab QR** → version tăng (trigger), POS báo "Sơ đồ đã được máy khác thay đổi" khi lưu — không ghi đè ngầm. Màu khu do POS lưu sơ đồ KHÔNG bị mất (save chỉ upsert name/sort_order). → kiểm SQL Task 2 Step 4.
5. **In QR khi quán chưa có Zalo Mini App ID / khu không có bàn đang bật / `area` sai** → trang in báo rõ, không vỡ. → test `pickPrintTables` Task 1 + bài tay.

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `admin-web/lib/area-colors.ts` (mới) | Bảng 5 màu khu (class nguyên vẹn), `parseAreaColor`, `nextAreaColor` |
| `admin-web/lib/table-groups.ts` (mới) | Nhóm bàn theo khu + sắp tự nhiên; chọn bàn để in |
| `supabase/migrations/094_table_area_color.sql` (mới) | Cột `color`, backfill, vá `pos_get_floor_layout` |
| `admin-web/lib/area-layout.ts` (sửa) | `TableArea` thêm `color` |
| `admin-web/lib/actions/table-areas.ts` (mới) | createArea / updateArea / deleteArea / setTableArea |
| `admin-web/lib/actions/tables.ts` (sửa) | `addTable` nhận khu; `toggleTable` lọc `store_id` |
| `admin-web/app/admin/tables/*` (sửa/mới) | Trang nhóm theo khu, hộp Tuỳ chỉnh khu, nút In QR |
| `admin-web/app/admin/tables/print-qr/page.tsx` + `qr-sheet.tsx` (mới) | Trang in A4 |
| `admin-web/app/admin/pos/timeline-view.tsx`, `area-controls.tsx`, `use-floor-layout.ts` (sửa) | POS dùng màu khu |
| `docs/testing/pos-admin-complete/PA-3.md` (mới) | Checklist |

---

### Task 1: Màu khu + nhóm bàn (thuần)

**Files:**
- Create: `admin-web/lib/area-colors.ts`, `admin-web/lib/area-colors.test.ts`
- Create: `admin-web/lib/table-groups.ts`, `admin-web/lib/table-groups.test.ts`

**Interfaces:**
- Produces:
  - `type AreaColor = 'violet' | 'indigo' | 'purple' | 'fuchsia' | 'pink'`
  - `AREA_COLORS: ReadonlyArray<{ key: AreaColor; label: string; dot: string; chip: string; header: string; bar: string; text: string }>`
  - `areaColorClasses(c: unknown): (typeof AREA_COLORS)[number]` (rác → violet)
  - `parseAreaColor(v: unknown): AreaColor`
  - `nextAreaColor(used: string[]): AreaColor` (màu đầu tiên chưa dùng; dùng hết → quay vòng theo số khu)
  - `type GroupArea = { id: string; name: string; color: string; sort_order?: number }`, `type GroupTable = { id: string; table_number: string; area_id: string | null; is_active: boolean }`
  - `groupTablesByArea<T extends GroupTable>(areas: GroupArea[], tables: T[]): Array<{ area: GroupArea | null; tables: T[] }>` — khu theo thứ tự mảng `areas` (đã sắp `sort_order`), MỌI khu đều có nhóm kể cả rỗng; nhóm "Chưa phân khu" (`area: null`) ở CUỐI và chỉ khi có bàn; bàn trong nhóm sắp tự nhiên ("Bàn 2" trước "Bàn 10")
  - `pickPrintTables<T extends GroupTable>(areas: GroupArea[], tables: T[], area: string | undefined, table?: string): { ok: true; title: string; groups: Array<{ area: GroupArea | null; tables: T[] }> } | { ok: false; error: string }` — chỉ bàn `is_active`; có `table` → đúng 1 bàn đó (title = tên bàn; không thấy / đang đóng → "Không tìm thấy bàn"); `area` = `undefined`/`'all'` → cả quán (bỏ nhóm rỗng); id khu → đúng khu đó; `'none'` → chưa phân khu; id lạ → lỗi "Không tìm thấy khu"; không còn bàn nào → lỗi "Không có bàn đang mở để in"

- [ ] **Step 1: Test `area-colors.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { AREA_COLORS, areaColorClasses, nextAreaColor, parseAreaColor } from './area-colors'

describe('màu khu', () => {
  it('đúng 5 màu nhận diện, không màu trạng thái', () => {
    expect(AREA_COLORS.map((c) => c.key)).toEqual(['violet', 'indigo', 'purple', 'fuchsia', 'pink'])
    const all = AREA_COLORS.flatMap((c) => [c.dot, c.chip, c.header, c.bar, c.text]).join(' ')
    expect(all).not.toMatch(/\b(?:bg|text|border|border-l)-(?:green|emerald|lime|teal|sky|cyan|blue|yellow|amber|red|rose|orange|slate|zinc|gray|stone)-/)
  })
  it('class là chuỗi nguyên vẹn (Tailwind v4 không safelist)', () => {
    for (const c of AREA_COLORS) expect(c.dot).toMatch(new RegExp(`bg-${c.key}-500`))
  })
  it('giá trị rác → tím', () => {
    expect(parseAreaColor('cyan')).toBe('violet')
    expect(parseAreaColor(null)).toBe('violet')
    expect(areaColorClasses('xyz').key).toBe('violet')
    expect(parseAreaColor('pink')).toBe('pink')
  })
  it('khu mới lấy màu chưa dùng, hết thì quay vòng', () => {
    expect(nextAreaColor([])).toBe('violet')
    expect(nextAreaColor(['violet', 'indigo'])).toBe('purple')
    expect(nextAreaColor(['violet', 'indigo', 'purple', 'fuchsia', 'pink'])).toBe('violet')
    expect(nextAreaColor(['violet', 'indigo', 'purple', 'fuchsia', 'pink', 'violet'])).toBe('indigo')
  })
})
```

- [ ] **Step 2: Test `table-groups.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { groupTablesByArea, pickPrintTables } from './table-groups'

const areas = [
  { id: 'a1', name: 'Trong nhà', color: 'violet' },
  { id: 'a2', name: 'Ngoài trời', color: 'pink' },
  { id: 'a3', name: 'Tầng 2', color: 'indigo' },
]
const t = (id: string, table_number: string, area_id: string | null, is_active = true) => ({ id, table_number, area_id, is_active })
const tables = [t('1', 'Bàn 10', 'a1'), t('2', 'Bàn 2', 'a1'), t('3', 'Bàn 5', 'a2'), t('4', 'Bàn 9', null), t('5', 'Bàn 7', 'a2', false)]

describe('nhóm bàn theo khu', () => {
  it('khu theo thứ tự, khu rỗng vẫn có, chưa phân khu ở cuối, sắp tự nhiên', () => {
    const g = groupTablesByArea(areas, tables)
    expect(g.map((x) => x.area?.id ?? null)).toEqual(['a1', 'a2', 'a3', null])
    expect(g[0].tables.map((x) => x.table_number)).toEqual(['Bàn 2', 'Bàn 10'])
    expect(g[2].tables).toEqual([])
  })
  it('không có bàn chưa phân khu → không có nhóm đó', () => {
    expect(groupTablesByArea(areas, tables.filter((x) => x.area_id)).some((x) => x.area === null)).toBe(false)
  })
  it('bàn trỏ tới khu đã mất → vào Chưa phân khu', () => {
    const g = groupTablesByArea(areas, [t('9', 'Bàn 1', 'gone')])
    expect(g.at(-1)?.area).toBeNull()
    expect(g.at(-1)?.tables.map((x) => x.id)).toEqual(['9'])
  })
})

describe('chọn bàn để in QR', () => {
  it('cả quán: chỉ bàn đang mở, bỏ nhóm rỗng', () => {
    const r = pickPrintTables(areas, tables, 'all')
    expect(r.ok && r.groups.flatMap((g) => g.tables.map((x) => x.id))).toEqual(['2', '1', '3', '4'])
    expect(r.ok && r.title).toBe('Cả quán')
  })
  it('một khu', () => {
    const r = pickPrintTables(areas, tables, 'a2')
    expect(r.ok && r.title).toBe('Ngoài trời')
    expect(r.ok && r.groups.flatMap((g) => g.tables.map((x) => x.id))).toEqual(['3'])
  })
  it('chưa phân khu', () => {
    const r = pickPrintTables(areas, tables, 'none')
    expect(r.ok && r.groups.flatMap((g) => g.tables.map((x) => x.id))).toEqual(['4'])
  })
  it('một bàn', () => {
    const r = pickPrintTables(areas, tables, undefined, '3')
    expect(r.ok && r.title).toBe('Bàn 5')
    expect(r.ok && r.groups.flatMap((g) => g.tables.map((x) => x.id))).toEqual(['3'])
    expect(pickPrintTables(areas, tables, undefined, '5')).toEqual({ ok: false, error: 'Không tìm thấy bàn' })
  })
  it('khu lạ / khu không có bàn mở → lỗi rõ', () => {
    expect(pickPrintTables(areas, tables, 'zzz')).toEqual({ ok: false, error: 'Không tìm thấy khu' })
    expect(pickPrintTables(areas, tables, 'a3')).toEqual({ ok: false, error: 'Không có bàn đang mở để in' })
  })
})
```

- [ ] **Step 3: Chạy → FAIL** (`npx vitest run lib/area-colors.test.ts lib/table-groups.test.ts`)

- [ ] **Step 4: `lib/area-colors.ts`**

```ts
// Màu nhận diện KHU (PA-3, 2026-10-08) — giống quy tắc màu mâm (lib/tray-colors.ts): chỉ NHẬN DIỆN, không
// phải trạng thái. Chấm/viền + chữ; nền ô bàn vẫn trắng. Cố tình KHÔNG có xanh lá / xanh dương / vàng / đỏ /
// cam / xám và các sắc sát chúng (teal, emerald, lime, sky, cyan, rose, amber, slate…) — quyết định 2026-10-02.
// ⚠️ Tailwind v4 không safelist: mọi class phải là chuỗi NGUYÊN VẸN, không ghép động.

export type AreaColor = 'violet' | 'indigo' | 'purple' | 'fuchsia' | 'pink'

export const AREA_COLORS = [
  { key: 'violet', label: 'Tím', dot: 'bg-violet-500', chip: 'bg-violet-50 text-violet-700 ring-violet-200', header: 'bg-violet-50 text-violet-800 border-violet-100', bar: 'border-l-4 border-l-violet-400', text: 'text-violet-700' },
  { key: 'indigo', label: 'Chàm', dot: 'bg-indigo-500', chip: 'bg-indigo-50 text-indigo-700 ring-indigo-200', header: 'bg-indigo-50 text-indigo-800 border-indigo-100', bar: 'border-l-4 border-l-indigo-400', text: 'text-indigo-700' },
  { key: 'purple', label: 'Tím đậm', dot: 'bg-purple-500', chip: 'bg-purple-50 text-purple-700 ring-purple-200', header: 'bg-purple-50 text-purple-800 border-purple-100', bar: 'border-l-4 border-l-purple-400', text: 'text-purple-700' },
  { key: 'fuchsia', label: 'Hồng tím', dot: 'bg-fuchsia-500', chip: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200', header: 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-100', bar: 'border-l-4 border-l-fuchsia-400', text: 'text-fuchsia-700' },
  { key: 'pink', label: 'Hồng', dot: 'bg-pink-500', chip: 'bg-pink-50 text-pink-700 ring-pink-200', header: 'bg-pink-50 text-pink-800 border-pink-100', bar: 'border-l-4 border-l-pink-400', text: 'text-pink-700' },
] as const satisfies ReadonlyArray<{ key: AreaColor; label: string; dot: string; chip: string; header: string; bar: string; text: string }>

export function parseAreaColor(v: unknown): AreaColor {
  return AREA_COLORS.some((c) => c.key === v) ? (v as AreaColor) : 'violet'
}

export function areaColorClasses(c: unknown): (typeof AREA_COLORS)[number] {
  const key = parseAreaColor(c)
  return AREA_COLORS.find((x) => x.key === key)!
}

/** Màu cho khu mới: màu đầu tiên chưa dùng; dùng hết thì quay vòng theo số khu đang có. */
export function nextAreaColor(used: string[]): AreaColor {
  const free = AREA_COLORS.find((c) => !used.includes(c.key))
  return free ? free.key : AREA_COLORS[used.length % AREA_COLORS.length].key
}
```

- [ ] **Step 5: `lib/table-groups.ts`**

```ts
// Nhóm bàn theo khu cho tab Sơ đồ bàn & QR và trang in QR (PA-3). Thuần để test được.

export type GroupArea = { id: string; name: string; color: string; sort_order?: number }
export type GroupTable = { id: string; table_number: string; area_id: string | null; is_active: boolean }
export type TableGroup<T> = { area: GroupArea | null; tables: T[] }

const byName = (a: GroupTable, b: GroupTable) =>
  a.table_number.localeCompare(b.table_number, 'vi', { numeric: true, sensitivity: 'base' })

export function groupTablesByArea<T extends GroupTable>(areas: GroupArea[], tables: T[]): TableGroup<T>[] {
  const known = new Set(areas.map((a) => a.id))
  const groups: TableGroup<T>[] = areas.map((area) => ({ area, tables: tables.filter((t) => t.area_id === area.id).sort(byName) }))
  const loose = tables.filter((t) => !t.area_id || !known.has(t.area_id)).sort(byName)
  if (loose.length > 0) groups.push({ area: null, tables: loose })
  return groups
}

export function pickPrintTables<T extends GroupTable>(
  areas: GroupArea[],
  tables: T[],
  area: string | undefined,
  table?: string,
): { ok: true; title: string; groups: TableGroup<T>[] } | { ok: false; error: string } {
  if (table) {
    const one = tables.find((t) => t.id === table && t.is_active)
    if (!one) return { ok: false, error: 'Không tìm thấy bàn' }
    return { ok: true, title: one.table_number, groups: groupTablesByArea(areas, [one]).filter((g) => g.tables.length > 0) }
  }
  const all = groupTablesByArea(areas, tables.filter((t) => t.is_active))
  let title = 'Cả quán'
  let groups = all
  if (area && area !== 'all') {
    if (area === 'none') {
      title = 'Chưa phân khu'
      groups = all.filter((g) => g.area === null)
    } else {
      const found = areas.find((a) => a.id === area)
      if (!found) return { ok: false, error: 'Không tìm thấy khu' }
      title = found.name
      groups = all.filter((g) => g.area?.id === area)
    }
  }
  groups = groups.filter((g) => g.tables.length > 0)
  if (groups.length === 0) return { ok: false, error: 'Không có bàn đang mở để in' }
  return { ok: true, title, groups }
}
```

- [ ] **Step 6: Chạy → PASS**, `npx eslint lib/area-colors.ts lib/table-groups.ts`

- [ ] **Step 7: Commit** — `git add admin-web/lib/area-colors.* admin-web/lib/table-groups.* && git commit -m "feat: mau khu + nhom ban theo khu (PA-3)"`

---

### Task 2: Migration 094 — màu khu

**Files:**
- Create: `supabase/migrations/094_table_area_color.sql`
- Modify: `admin-web/lib/area-layout.ts`

**Interfaces:**
- Produces: `table_areas.color` (NOT NULL, mặc định `'violet'`, CHECK 5 màu); `pos_get_floor_layout()` trả `areas[].color`; `TableArea = { id: string; name: string; color?: string }`.

- [ ] **Step 1: Kiểm RED** — `execute_sql`: `select column_name from information_schema.columns where table_name='table_areas' and column_name='color';` → 0 dòng.

- [ ] **Step 2: Viết migration**

```sql
-- 094 (PA-3, 2026-10-08): màu nhận diện KHU. Chỉ nhận diện, không phải trạng thái (5 màu, không trùng màu
-- trạng thái — quyết định 2026-10-02). pos_save_floor_layout chỉ upsert name/sort_order nên KHÔNG làm mất màu;
-- khu POS tạo mới lấy mặc định 'violet', chủ quán đổi ở tab Sơ đồ bàn & QR.
-- ⚠️ pos_get_floor_layout vá tại chỗ (đọc bản đang chạy → replace → EXECUTE), như mig 093.

ALTER TABLE public.table_areas ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT 'violet';
ALTER TABLE public.table_areas DROP CONSTRAINT IF EXISTS table_areas_color_check;
ALTER TABLE public.table_areas ADD CONSTRAINT table_areas_color_check
  CHECK (color IN ('violet', 'indigo', 'purple', 'fuchsia', 'pink'));

-- Khu đang có: gán màu lần lượt theo thứ tự trong quán để hai khu cạnh nhau không trùng màu.
UPDATE public.table_areas a
SET color = (ARRAY['violet', 'indigo', 'purple', 'fuchsia', 'pink'])[((r.rn - 1) % 5) + 1]
FROM (
  SELECT id, row_number() OVER (PARTITION BY store_id ORDER BY sort_order, id) AS rn
  FROM public.table_areas
) r
WHERE r.id = a.id;

CREATE OR REPLACE FUNCTION pg_temp.mevo_patch(p_sig text, p_from text, p_to text)
RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef(p_sig::regprocedure);
  IF position(p_from IN v_def) = 0 THEN
    RAISE EXCEPTION 'mig 094: % không còn chuỗi cần vá: %', p_sig, p_from;
  END IF;
  EXECUTE replace(v_def, p_from, p_to);
END
$patch$;

SELECT pg_temp.mevo_patch('public.pos_get_floor_layout()',
  $$jsonb_build_object('id', a.id, 'name', a.name)$$,
  $$jsonb_build_object('id', a.id, 'name', a.name, 'color', a.color)$$);
```

- [ ] **Step 3: Áp prod** — MCP `apply_migration` name `table_area_color`.

- [ ] **Step 4: Kiểm**

```sql
select store_id, name, sort_order, color from table_areas order by store_id, sort_order;
-- Bảo Lương: Trong nhà = violet, Ngoài trời = indigo
select pg_get_functiondef('public.pos_get_floor_layout()'::regprocedure) like '%''color'', a.color%' patched;
-- Chủ quán KHÔNG ghi thẳng được bảng khu (chỉ có SELECT) — ROLLBACK:
begin;
select set_config('request.jwt.claims', json_build_object('sub',(select id::text from auth.users where email='baoluong@mevo.vn'),'role','authenticated')::text, true);
set local role authenticated;
update table_areas set color='pink' where name='Trong nhà' and store_id='2139c162-9677-4cbd-87e3-d2e1ac22e6e8';
rollback;
```

Lệnh `update` trong khối trên PHẢI lỗi quyền (authenticated chỉ có SELECT trên `table_areas`). Khối kiểm bảo toàn màu khi lưu sơ đồ chạy bằng service role trong transaction ROLLBACK:

```sql
begin;
update table_areas set color='pink' where name='Trong nhà' and store_id='2139c162-9677-4cbd-87e3-d2e1ac22e6e8';
select set_config('request.jwt.claims', json_build_object('sub',(select id::text from auth.users where email='baoluong@mevo.vn'),'role','authenticated')::text, true);
set local role authenticated;
select (r->'areas') areas_after from (select public.pos_save_floor_layout(
  (select table_layout_version from stores where id='2139c162-9677-4cbd-87e3-d2e1ac22e6e8'),
  (public.pos_get_floor_layout())->'areas',
  (select jsonb_agg(jsonb_build_object('id',t->>'id','area_id',t->>'area_id','pos_x',t->'pos_x','pos_y',t->'pos_y')) from jsonb_array_elements((public.pos_get_floor_layout())->'tables') t)
) r) x;
rollback;
```

Expected: `areas_after` có "Trong nhà" màu `pink` (lưu sơ đồ không reset màu).

- [ ] **Step 5: `area-layout.ts`** — `export type TableArea = { id: string; name: string; color?: string }` (tuỳ chọn để bản nháp POS tạo khu mới chưa có màu vẫn hợp lệ). Chạy `npx tsc --noEmit`.

- [ ] **Step 6: Commit** — `git add supabase/migrations/094_table_area_color.sql admin-web/lib/area-layout.ts && git commit -m "feat: mau khu table_areas.color + pos_get_floor_layout tra mau (PA-3, mig 094)"`

---

### Task 3: Server action quản lý khu + bàn

**Files:**
- Create: `admin-web/lib/actions/table-areas.ts`, `admin-web/lib/actions/table-areas.test.ts`
- Modify: `admin-web/lib/actions/tables.ts` (+ test mới `admin-web/lib/actions/tables.test.ts`)

**Interfaces:**
- Consumes: `parseAreaColor`, `nextAreaColor` (Task 1).
- Produces (`'use server'`, mọi hàm trả `{ ok: true } | { ok: false; error: string }`, không throw):
  - `createArea(name: string, color?: string)`
  - `updateArea(areaId: string, patch: { name?: string; color?: string })`
  - `deleteArea(areaId: string)`
  - `setTableArea(tableId: string, areaId: string | null)`
  - `addTable(formData)` đọc thêm `area_id` (rỗng = chưa phân khu; khu không thuộc quán → báo lỗi)
  - `toggleTable` lọc `store_id`

Luật tên khu (dùng chung create/update): `btrim`, 1–60 ký tự, không trùng tên khu khác CÙNG quán (so `toLocaleLowerCase('vi')`). Lỗi: `'Tên khu từ 1 đến 60 ký tự'`, `'Đã có khu tên «X»'`. Xoá khu: còn bàn (kể cả bàn đang đóng) → `'Khu còn N bàn — chuyển hết bàn sang khu khác trước'`. Khu/bàn không thuộc quán → `'Không tìm thấy khu'` / `'Không tìm thấy bàn'`. `createArea` không truyền màu → `nextAreaColor(màu các khu đang có)`; `sort_order` = max + 1.

- [ ] **Step 1: Test `table-areas.test.ts`** (mock admin client ghi lại mọi `.eq`, payload `insert`/`update`, `delete`; dữ liệu đọc lấy từ biến `rows`):

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const state = {
    areas: [] as Array<{ id: string; store_id: string; name: string; color: string; sort_order: number }>,
    tables: [] as Array<{ id: string; store_id: string; area_id: string | null }>,
    writes: [] as Array<{ table: string; op: string; payload?: unknown; eq: Array<[string, unknown]> }>,
  }
  const from = vi.fn((table: string) => {
    const eq: Array<[string, unknown]> = []
    let op = 'select'
    let payload: unknown
    const rows = () => {
      const src = table === 'table_areas' ? state.areas : state.tables
      return (src as Array<Record<string, unknown>>).filter((r) => eq.every(([c, v]) => r[c] === v))
    }
    const b: Record<string, unknown> = {}
    b.select = vi.fn(() => b)
    b.eq = vi.fn((c: string, v: unknown) => { eq.push([c, v]); return b })
    b.insert = vi.fn((p: unknown) => { op = 'insert'; payload = p; return b })
    b.update = vi.fn((p: unknown) => { op = 'update'; payload = p; return b })
    b.delete = vi.fn(() => { op = 'delete'; return b })
    b.maybeSingle = vi.fn(async () => ({ data: rows()[0] ?? null, error: null }))
    b.then = (resolve: (v: unknown) => void) => {
      if (op !== 'select') state.writes.push({ table, op, payload, eq: [...eq] })
      resolve({ data: op === 'select' ? rows() : null, error: null, count: rows().length })
    }
    return b
  })
  return { state, from, requireStoreOwnerStoreId: vi.fn(async () => 'store-1'), revalidatePath: vi.fn() }
})

vi.mock('@/lib/auth/operator', () => ({ requireStoreOwnerStoreId: mocks.requireStoreOwnerStoreId }))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn(() => ({ from: mocks.from })) }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

const { createArea, deleteArea, setTableArea, updateArea } = await import('./table-areas')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.writes = []
  mocks.state.areas = [
    { id: 'a1', store_id: 'store-1', name: 'Trong nhà', color: 'violet', sort_order: 1 },
    { id: 'a2', store_id: 'store-1', name: 'Ngoài trời', color: 'indigo', sort_order: 2 },
    { id: 'x1', store_id: 'store-2', name: 'Khu quán khác', color: 'pink', sort_order: 1 },
  ]
  mocks.state.tables = [
    { id: 't1', store_id: 'store-1', area_id: 'a1' },
    { id: 'tx', store_id: 'store-2', area_id: 'x1' },
  ]
})

describe('khu (PA-3)', () => {
  it('tạo khu: màu chưa dùng + thứ tự cuối', async () => {
    await expect(createArea(' Tầng 2 ')).resolves.toEqual({ ok: true })
    expect(mocks.state.writes[0]).toMatchObject({ table: 'table_areas', op: 'insert', payload: { store_id: 'store-1', name: 'Tầng 2', color: 'purple', sort_order: 3 } })
  })
  it('tên trùng (khác hoa thường) / rỗng / quá dài → lỗi, không ghi', async () => {
    await expect(createArea('trong NHÀ')).resolves.toEqual({ ok: false, error: 'Đã có khu tên «Trong nhà»' })
    await expect(createArea('   ')).resolves.toEqual({ ok: false, error: 'Tên khu từ 1 đến 60 ký tự' })
    await expect(createArea('x'.repeat(61))).resolves.toEqual({ ok: false, error: 'Tên khu từ 1 đến 60 ký tự' })
    expect(mocks.state.writes).toEqual([])
  })
  it('đổi tên + màu: lọc đúng quán; màu rác → tím', async () => {
    await expect(updateArea('a2', { name: 'Sân vườn', color: 'cyan' })).resolves.toEqual({ ok: true })
    expect(mocks.state.writes[0]).toMatchObject({ op: 'update', payload: { name: 'Sân vườn', color: 'violet' } })
    expect(mocks.state.writes[0].eq).toEqual(expect.arrayContaining([['id', 'a2'], ['store_id', 'store-1']]))
  })
  it('khu của quán khác → không tìm thấy, không ghi', async () => {
    await expect(updateArea('x1', { color: 'pink' })).resolves.toEqual({ ok: false, error: 'Không tìm thấy khu' })
    await expect(deleteArea('x1')).resolves.toEqual({ ok: false, error: 'Không tìm thấy khu' })
    expect(mocks.state.writes).toEqual([])
  })
  it('xoá khu còn bàn → từ chối', async () => {
    await expect(deleteArea('a1')).resolves.toEqual({ ok: false, error: 'Khu còn 1 bàn — chuyển hết bàn sang khu khác trước' })
    expect(mocks.state.writes).toEqual([])
  })
  it('xoá khu trống → xoá đúng quán', async () => {
    await expect(deleteArea('a2')).resolves.toEqual({ ok: true })
    expect(mocks.state.writes[0]).toMatchObject({ table: 'table_areas', op: 'delete' })
    expect(mocks.state.writes[0].eq).toEqual(expect.arrayContaining([['id', 'a2'], ['store_id', 'store-1']]))
  })
  it('gán bàn vào khu / bỏ khu; bàn hoặc khu quán khác → lỗi', async () => {
    await expect(setTableArea('t1', 'a2')).resolves.toEqual({ ok: true })
    expect(mocks.state.writes[0]).toMatchObject({ table: 'tables', op: 'update', payload: { area_id: 'a2' } })
    expect(mocks.state.writes[0].eq).toEqual(expect.arrayContaining([['id', 't1'], ['store_id', 'store-1']]))
    await expect(setTableArea('t1', null)).resolves.toEqual({ ok: true })
    await expect(setTableArea('tx', 'a1')).resolves.toEqual({ ok: false, error: 'Không tìm thấy bàn' })
    await expect(setTableArea('t1', 'x1')).resolves.toEqual({ ok: false, error: 'Không tìm thấy khu' })
  })
  it('không phải chủ quán → lỗi, không ghi', async () => {
    mocks.requireStoreOwnerStoreId.mockRejectedValueOnce(new Error('Chỉ chủ quán mới thao tác được ở đây'))
    await expect(createArea('Tầng 3')).resolves.toEqual({ ok: false, error: 'Chỉ chủ quán mới thao tác được ở đây' })
    expect(mocks.state.writes).toEqual([])
  })
})
```

Test `tables.test.ts` (cùng kiểu mock; tạo file mới): `addTable` với `area_id='a1'` ghi `{ store_id: 'store-1', table_number: 'Bàn 21', is_active: true, area_id: 'a1' }`; `area_id=''` ghi `area_id: null`; `area_id='x1'` (quán khác) → throw `'Không tìm thấy khu'` và không insert; `toggleTable('t1', false)` có `['store_id','store-1']` trong `eq`.

- [ ] **Step 2: Chạy → FAIL**

- [ ] **Step 3: `lib/actions/table-areas.ts`**

```ts
'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { requireStoreOwnerStoreId } from '@/lib/auth/operator'
import { nextAreaColor, parseAreaColor } from '@/lib/area-colors'
import { revalidatePath } from 'next/cache'

// Quản lý KHU ở tab Sơ đồ bàn & QR (PA-3) — chỉ chủ quán. Dùng service key nên MỌI câu đọc/ghi lọc
// store_id lấy từ phiên đăng nhập (không tin id client gửi — bài học PA-2). Ghi bảng tables / table_areas
// làm tăng table_layout_version (trigger mig 048) → bản nháp "Sắp xếp bàn" đang mở ở POS hết hiệu lực,
// POS báo tải lại thay vì ghi đè ngầm.

type Result = { ok: true } | { ok: false; error: string }
type AreaRow = { id: string; name: string; color: string; sort_order: number }

async function owner(): Promise<{ storeId: string } | { error: string }> {
  try {
    return { storeId: await requireStoreOwnerStoreId() }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Không có quyền' }
  }
}

async function storeAreas(storeId: string): Promise<AreaRow[]> {
  const { data } = await createAdminClient().from('table_areas').select('id, name, color, sort_order').eq('store_id', storeId)
  return (data ?? []) as AreaRow[]
}

function checkName(raw: string, areas: AreaRow[], selfId: string | null): { name: string } | { error: string } {
  const name = (raw ?? '').trim()
  if (name.length < 1 || name.length > 60) return { error: 'Tên khu từ 1 đến 60 ký tự' }
  const dup = areas.find((a) => a.id !== selfId && a.name.toLocaleLowerCase('vi') === name.toLocaleLowerCase('vi'))
  return dup ? { error: `Đã có khu tên «${dup.name}»` } : { name }
}

function done(): Result {
  revalidatePath('/admin/tables')
  revalidatePath('/admin/pos')
  return { ok: true }
}

export async function createArea(name: string, color?: string): Promise<Result> {
  const o = await owner()
  if ('error' in o) return { ok: false, error: o.error }
  const areas = await storeAreas(o.storeId)
  const checked = checkName(name, areas, null)
  if ('error' in checked) return { ok: false, error: checked.error }
  const { error } = await createAdminClient().from('table_areas').insert({
    store_id: o.storeId,
    name: checked.name,
    color: color ? parseAreaColor(color) : nextAreaColor(areas.map((a) => a.color)),
    sort_order: Math.max(0, ...areas.map((a) => a.sort_order)) + 1,
  })
  if (error) return { ok: false, error: `Không tạo được khu: ${error.message}` }
  return done()
}

export async function updateArea(areaId: string, patch: { name?: string; color?: string }): Promise<Result> {
  const o = await owner()
  if ('error' in o) return { ok: false, error: o.error }
  const areas = await storeAreas(o.storeId)
  if (!areas.some((a) => a.id === areaId)) return { ok: false, error: 'Không tìm thấy khu' }
  const update: { name?: string; color?: string } = {}
  if (patch.name !== undefined) {
    const checked = checkName(patch.name, areas, areaId)
    if ('error' in checked) return { ok: false, error: checked.error }
    update.name = checked.name
  }
  if (patch.color !== undefined) update.color = parseAreaColor(patch.color)
  const { error } = await createAdminClient().from('table_areas').update(update).eq('id', areaId).eq('store_id', o.storeId)
  if (error) return { ok: false, error: `Không lưu được khu: ${error.message}` }
  return done()
}

export async function deleteArea(areaId: string): Promise<Result> {
  const o = await owner()
  if ('error' in o) return { ok: false, error: o.error }
  const areas = await storeAreas(o.storeId)
  if (!areas.some((a) => a.id === areaId)) return { ok: false, error: 'Không tìm thấy khu' }
  const { data: inArea } = await createAdminClient().from('tables').select('id').eq('store_id', o.storeId).eq('area_id', areaId)
  const n = (inArea ?? []).length
  if (n > 0) return { ok: false, error: `Khu còn ${n} bàn — chuyển hết bàn sang khu khác trước` }
  const { error } = await createAdminClient().from('table_areas').delete().eq('id', areaId).eq('store_id', o.storeId)
  if (error) return { ok: false, error: `Không xoá được khu: ${error.message}` }
  return done()
}

export async function setTableArea(tableId: string, areaId: string | null): Promise<Result> {
  const o = await owner()
  if ('error' in o) return { ok: false, error: o.error }
  const admin = createAdminClient()
  const { data: table } = await admin.from('tables').select('id').eq('id', tableId).eq('store_id', o.storeId).maybeSingle()
  if (!table) return { ok: false, error: 'Không tìm thấy bàn' }
  if (areaId && !(await storeAreas(o.storeId)).some((a) => a.id === areaId)) return { ok: false, error: 'Không tìm thấy khu' }
  const { error } = await admin.from('tables').update({ area_id: areaId }).eq('id', tableId).eq('store_id', o.storeId)
  if (error) return { ok: false, error: `Không chuyển được bàn: ${error.message}` }
  return done()
}
```

`tables.ts`:
- `addTable`: sau khi lấy `storeId`, đọc `const areaRaw = (formData.get('area_id') as string | null) || null`; nếu có thì kiểm `admin.from('table_areas').select('id').eq('id', areaRaw).eq('store_id', storeId).maybeSingle()` → không thấy thì `throw new Error('Không tìm thấy khu')`; insert thêm `area_id: areaRaw`. Thêm `revalidatePath('/admin/pos')`.
- `toggleTable`: `const storeId = await getStoreId()` và thêm `.eq('store_id', storeId)` (trước đây sửa được bàn quán khác bằng id).

- [ ] **Step 4: Chạy → PASS** — `npx vitest run lib/actions/table-areas.test.ts lib/actions/tables.test.ts && npx tsc --noEmit`

- [ ] **Step 5: Commit** — `git add admin-web/lib/actions/table-areas.* admin-web/lib/actions/tables.* && git commit -m "feat: action quan ly khu + gan ban vao khu, toggleTable loc dung quan (PA-3)"`

---

### Task 4: Tab Sơ đồ bàn & QR theo khu

**Files:**
- Modify: `admin-web/app/admin/tables/page.tsx`, `tables-client.tsx`
- Create: `admin-web/app/admin/tables/area-dialog.tsx`

**Interfaces:**
- Consumes: Task 1 (`groupTablesByArea`, `AREA_COLORS`, `areaColorClasses`, `nextAreaColor`), Task 3 (actions).
- Produces: `<AreaDialog mode: 'create' | 'edit'; area?: { id: string; name: string; color: string; tableCount: number }; usedColors: string[]; onClose(): void />`.

- [ ] **Step 1: page.tsx** — thêm đọc khu `supabase.from('table_areas').select('id, name, color, sort_order').eq('store_id', storeId).order('sort_order')` (chủ quán có quyền SELECT qua RLS `pos_read_table_areas`); `tables` select thêm `area_id`; truyền `areas` xuống client. Tiêu đề trang đổi: "Sơ đồ bàn & QR" / mô tả "Nhóm bàn theo khu, in mã QR dán bàn".

- [ ] **Step 2: `area-dialog.tsx`** — hộp nhỏ (dùng `Dialog` ở `components/ui/dialog.tsx`, đọc props của nó trước): ô **Tên khu** (maxLength 60), **5 ô màu** từ `AREA_COLORS` (nút tròn `dot`, `aria-pressed`, `title={label}`), nút **Lưu** (gọi `createArea(name, color)` hoặc `updateArea(id, { name, color })`), ở chế độ edit thêm nút **Xoá khu** chỉ bật khi `tableCount === 0` (khi còn bàn hiện chữ nhỏ "Khu còn N bàn — chuyển hết bàn sang khu khác trước rồi mới xoá được"). Xoá dùng xác nhận 2 bước trong hộp (bấm "Xoá khu" → hiện "Bấm lần nữa để xoá"), KHÔNG dùng `window.confirm`. Lỗi trả về hiện trong hộp; thành công → `router.refresh()` + đóng. Mặc định màu khi tạo: `nextAreaColor(usedColors)`.

- [ ] **Step 3: `tables-client.tsx`** — bố cục mới (giữ hành vi cũ: bật/tắt, tải PNG, xoá bàn):
  - Thanh trên: "N bàn · M khu" · nút **+ Thêm khu** (mở AreaDialog create) · **+ Thêm bàn** · link **In QR cả quán** (`/admin/tables/print-qr?area=all`, `target="_blank"`).
  - Với mỗi nhóm `groupTablesByArea(areas, tables)`:
    - Đầu nhóm: thanh có `bar` màu khu (vạch trái 4px) + chấm `dot` + tên khu đậm + "N bàn" + nút **Tuỳ chỉnh khu** (mở AreaDialog edit) + link **In QR khu này** (`?area=<id>`). Nhóm chưa phân khu: tên "Chưa phân khu", không có Tuỳ chỉnh, link `?area=none`.
    - Khu rỗng: dòng "Chưa có bàn — chọn khu cho bàn ở mục bàn bất kỳ".
    - Lưới thẻ bàn như cũ, mỗi thẻ thêm `<select>` **Khu** (`aria-label={`Khu của ${table_number}`}`; lựa chọn: Chưa phân khu + các khu) gọi `setTableArea` rồi `router.refresh()`; lỗi → `alert(res.error)`.
  - Modal **Thêm bàn**: thêm `<select name="area_id">` (mặc định khu đang lọc gần nhất nếu có, không thì "Chưa phân khu").
  - Bỏ hoàn toàn `confirm()` cũ? GIỮ `confirm` cho xoá bàn như hiện tại (không đổi hành vi ngoài phạm vi).

- [ ] **Step 4: Kiểm** — `npx tsc --noEmit && npx eslint app/admin/tables && npx vitest run && npm run build`

- [ ] **Step 5: Commit** — `git add admin-web/app/admin/tables && git commit -m "feat: tab So do ban & QR nhom theo khu, Tuy chinh khu, nhan mau (PA-3)"`

---

### Task 5: POS dùng màu khu

**Files:**
- Modify: `admin-web/app/admin/pos/timeline-view.tsx`, `area-controls.tsx`, `pos-client.tsx` (nếu bảng lọc khu hiển thị chấm)
- Test: `admin-web/lib/area-colors.test.ts` (đã có) — thêm bài cho hàm mới nếu tách

**Interfaces:**
- Consumes: `areaColorClasses` (Task 1), `TableArea.color` (Task 2).

- [ ] **Step 1: Timeline** — xoá `AREA_TINTS` (đang dùng emerald/sky/amber/teal — trùng màu trạng thái). `Group` thêm `color?: string`; khi dựng nhóm lấy `color: a.color`. Dải tiêu đề khu: `className={cn('border-y', g.id ? areaColorClasses(g.color).header : 'bg-slate-50 text-slate-700 border-slate-100')}` và thêm chấm `dot` trước tên khu.
- [ ] **Step 2: Thanh chọn khu** (`area-controls.tsx`) — mỗi nút khu có chấm `areaColorClasses(area.color).dot` (size-2 rounded-full) trước tên; "Chưa phân khu" không chấm.
- [ ] **Step 3: Bộ lọc khu** trong `pos-client.tsx` (thẻ `<select>` "Tất cả khu vực"): giữ nguyên (option không tô màu được) — không đổi.
- [ ] **Step 4: Kiểm** — `npx tsc --noEmit && npx vitest run && npx eslint app/admin/pos/timeline-view.tsx app/admin/pos/area-controls.tsx`; grep xác nhận `timeline-view.tsx` không còn `emerald|sky|amber|teal` cho khu.
- [ ] **Step 5: Commit** — `git add admin-web/app/admin/pos && git commit -m "feat: POS to tieu de khu theo mau khu, bo tint trung mau trang thai (PA-3)"`

---

### Task 6: Trang in QR hàng loạt

**Files:**
- Create: `admin-web/app/admin/tables/print-qr/page.tsx`, `admin-web/app/admin/tables/print-qr/qr-sheet.tsx`

**Interfaces:**
- Consumes: `pickPrintTables` (Task 1), `generateTableQR` (`lib/qr.ts`), `areaColorClasses`.

- [ ] **Step 1: `page.tsx`** (server, `requireAdminPageOrRedirect('owner')`):
  - Đọc `stores.slug, name`, `zalo_mini_app_id` theo đúng cách `tables/page.tsx` đang làm (store_app_configs rồi store_checkout_configs, admin client, chỉ cột ID).
  - Đọc `table_areas` (id, name, color, sort_order — sắp sort_order) và `tables` (id, table_number, area_id, is_active) của quán.
  - Không có Mini App ID → trả `<p className="p-6 text-sm text-red-600">Quán chưa có Zalo Mini App ID nên chưa in được QR. Liên hệ MEVO.</p>`.
  - `pickPrintTables(areas, tables, searchParams.area)`; lỗi → `<p className="p-6 text-sm text-red-600">{error}</p>`.
  - Sinh QR: `await generateTableQR(appId, slug, t.id)` cho từng bàn (Promise.all).
  - Render `<QrSheet storeName title cards={[{ tableNumber, areaName, areaColor, qr }]} />`.

- [ ] **Step 2: `qr-sheet.tsx`** (client):

```tsx
'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { areaColorClasses } from '@/lib/area-colors'
import { cn } from '@/lib/utils'

export type QrCard = { id: string; tableNumber: string; areaName: string | null; areaColor: string | null; qr: string }

// Tờ in QR A4 dọc, lưới 3×4 = 12 mã/trang (PA-3). In bằng hộp in của trình duyệt — chọn
// "Lưu dưới dạng PDF" để lấy file. Lớp phủ trắng che giao diện admin; khi in chỉ còn tờ QR.
export default function QrSheet({ storeName, title, cards }: { storeName: string; title: string; cards: QrCard[] }) {
  return (
    <div className="qr-root fixed inset-0 z-[100] overflow-auto bg-white">
      <style>{`
        @page { size: A4 portrait; margin: 10mm; }
        @media print {
          body * { visibility: hidden !important; }
          .qr-root, .qr-root * { visibility: visible !important; }
          .qr-root { position: absolute; inset: 0; overflow: visible; }
          .no-print { display: none !important; }
          .qr-grid { gap: 0 !important; }
          .qr-card { break-inside: avoid; }
        }
      `}</style>
      <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
        <div>
          <p className="text-lg font-bold text-slate-900">In QR bàn — {title}</p>
          <p className="text-sm text-slate-500">{cards.length} mã · A4, 12 mã/trang. Muốn lấy file: chọn &quot;Lưu dưới dạng PDF&quot; trong hộp in.</p>
        </div>
        <Button variant="primary" icon={<Printer />} onClick={() => window.print()}>In</Button>
      </div>
      <div className="qr-grid mx-auto grid max-w-[190mm] grid-cols-3 gap-2 p-4 print:p-0">
        {cards.map((c) => {
          const color = c.areaColor ? areaColorClasses(c.areaColor) : null
          return (
            <div key={c.id} className="qr-card flex h-[68mm] flex-col items-center justify-center border border-dashed border-slate-400 p-2 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.qr} alt={`QR ${c.tableNumber}`} className="size-[40mm]" />
              <p className="mt-1 text-xl font-bold text-black">{c.tableNumber}</p>
              {c.areaName && (
                <p className={cn('flex items-center gap-1 text-xs font-semibold', color?.text)}>
                  <span className={cn('inline-block size-2 rounded-full', color?.dot)} aria-hidden />{c.areaName}
                </p>
              )}
              <p className="text-[10px] text-slate-500">{storeName} · Quét bằng Zalo để gọi món</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

(3 cột × 68mm cao ≈ 4 hàng trên vùng in A4 277mm → 12 mã/trang.)

- [ ] **Step 3: Nút In QR từng bàn** — thẻ bàn ở Task 4 thêm link nhỏ **In QR** (`target="_blank"`) → `/admin/tables/print-qr?table=<id>`; page truyền `searchParams.table` làm tham số thứ 4 của `pickPrintTables` (Task 1 đã hỗ trợ).

- [ ] **Step 4: Kiểm** — `npx vitest run && npx tsc --noEmit && npx eslint app/admin/tables && npm run build`

- [ ] **Step 5: Commit** — `git add admin-web/app/admin/tables && git commit -m "feat: in QR hang loat A4 theo ca quan / tung khu / tung ban (PA-3)"`

---

### Task 7: Chạy thật + checklist PA-3

**Files:**
- Create: `docs/testing/pos-admin-complete/PA-3.md`

- [ ] **Step 1: Chạy thật** — `npm run build && npx next start -p 3100`, tự mint phiên chủ quán Bảo Lương. Kiểm: tab Bàn & QR nhóm 2 khu đúng màu (Trong nhà tím, Ngoài trời chàm); tạo khu "Test PA3" → đổi màu → xoá (khu trống) ; chuyển 1 bàn sang khu khác rồi trả lại; mở `print-qr?area=all` thấy 20 mã, `?area=<id Trong nhà>` thấy 7 mã; POS Timeline tiêu đề khu đúng màu. Không dùng nút có `confirm()` (treo công cụ). **Dọn**: xoá khu test, bàn về khu cũ (ghi ledger).

- [ ] **Step 2: Checklist**

```markdown
# PA-3 — Sơ đồ bàn & QR theo khu

Spec `docs/superpowers/specs/2026-10-07-pos-admin-complete-design.md` · Plan `docs/superpowers/plans/2026-10-08-pa3-tables-areas-qr.md`
Migration đã áp prod: 094 (`table_areas.color`, `pos_get_floor_layout` trả màu). Test trên **Bảo Lương**, đăng nhập chủ quán.

## Tab Sơ đồ bàn & QR (Thêm → Bàn & QR)
1. Bàn nhóm theo khu: **Trong nhà** (7 bàn, màu tím) rồi **Ngoài trời** (13 bàn, màu chàm). Mỗi khu có chấm màu + vạch màu bên trái + "N bàn".
2. **+ Thêm khu** → tên "Tầng 2" → chọn màu → Lưu → khu mới hiện cuối, ghi "Chưa có bàn".
3. Tạo khu trùng tên ("trong nhà") → báo "Đã có khu tên «Trong nhà»".
4. **Tuỳ chỉnh khu** ở "Tầng 2": đổi tên "Sân thượng", đổi màu → lưu → đổi ngay.
5. Ở một bàn bất kỳ chọn **Khu → Sân thượng** → bàn chuyển nhóm. **Tuỳ chỉnh khu** "Sân thượng" → nút Xoá bị khoá, ghi "Khu còn 1 bàn…".
6. Chuyển bàn đó về khu cũ → Tuỳ chỉnh "Sân thượng" → **Xoá khu** (bấm 2 lần) → khu biến mất.
7. **+ Thêm bàn** có ô Khu → thêm "Bàn test" vào Ngoài trời → hiện đúng nhóm. (Xoá bàn test sau khi xong.)

## In QR
8. **In QR cả quán** → tab mới: lưới 3 cột, 20 mã, mỗi mã có tên bàn to + chấm màu + tên khu + tên quán. Bấm **In** → bản xem trước A4 12 mã/trang, KHÔNG thấy thanh bên admin. Chọn "Lưu dưới dạng PDF" → ra file.
9. **In QR khu này** ở Trong nhà → chỉ 7 mã.
10. **In QR** ở một thẻ bàn → đúng 1 mã.
11. Quét thử 1 mã in ra bằng Zalo → mở Mini App đúng bàn.
12. Tắt (Đóng) một bàn → in cả quán → bàn đó không có trong tờ in.

## POS
13. POS → Timeline: dải tiêu đề khu tô đúng màu khu (tím / chàm), KHÔNG còn xanh lá / xanh dương.
14. Tab Sơ đồ bàn trên POS: nút chọn khu có chấm màu đúng khu.
15. Đang bấm **Sắp xếp bàn** trên POS (chưa lưu), máy khác đổi khu một bàn ở tab Bàn & QR → bấm Lưu sơ đồ ở POS → báo sơ đồ đã bị máy khác thay đổi, tải lại (không ghi đè). Lưu sơ đồ xong màu khu vẫn giữ nguyên.

**→ Báo:** `PA-3 PASS` hoặc số bài FAIL kèm ảnh.
```

- [ ] **Step 3: Commit** — `git add docs/testing/pos-admin-complete/PA-3.md && git commit -m "docs: checklist test PA-3"`
- [ ] **Step 4: DỪNG** — báo anh Tú test theo PA-3.md.
