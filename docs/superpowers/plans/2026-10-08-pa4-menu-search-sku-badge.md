# PA-4 — Thực đơn: tìm, lọc, mã món, nhãn món — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tab Thực đơn & Giá có ô tìm (tên hoặc mã) + lọc Tất cả / Đang bán / Tạm hết có đếm; mỗi món có mã món (SKU) tự sinh theo tiền tố danh mục, sửa tay được; mỗi món gắn được nhãn "Best seller" / "Món của quán" hiện cả trên Mini App.

**Architecture:** Mig 095 thêm `menu_categories.sku_prefix`, `menu_items.sku`, `menu_items.badge` + 2 trigger BEFORE INSERT tự sinh tiền tố/mã khi để trống (mọi đường tạo món đều có mã) + backfill 65 món Bảo Lương. Logic thuần (bỏ dấu, sinh tiền tố, lọc/tìm) ở `admin-web/lib/menu/*` có test; bản SQL của hàm sinh tiền tố được đối chiếu với bản TS bằng dữ liệu thật. Mini App chỉ đọc `badge` và vẽ nhãn.

**Tech Stack:** Next.js 16 admin-web, Supabase Postgres (trigger plpgsql), Zalo Mini App (React + Vite, vitest node), Tailwind.

**Spec:** `docs/superpowers/specs/2026-10-07-pos-admin-complete-design.md` (mục PA-4). Anh Tú chốt: mã món **tự sinh theo danh mục**, sinh luôn cho món cũ; nhãn hiện **cả admin lẫn Mini App**.

## Global Constraints

- Chữ người dùng thấy + comment logic phức tạp: tiếng Việt. Không hardcode ID/key/URL.
- Server action dùng `createAdminClient` bỏ qua RLS → PHẢI kiểm quyền + lọc `.eq('store_id', storeId)` ở MỌI câu đọc/ghi (bài học PA-2/PA-3).
- Mã món: chữ in hoa A–Z, số, gạch ngang; 1–20 ký tự; KHÔNG trùng trong cùng quán. Tiền tố: A–Z, 0–9, 1–6 ký tự, không trùng trong quán. Đổi danh mục KHÔNG đổi mã cũ.
- Nhãn: `best_seller` = "Best seller", `signature` = "Món của quán"; tối đa 1 nhãn/món; không hiện mã món cho khách.
- Thu ngân (PA-2) KHÔNG sửa được mã/nhãn (chỉ xem mã + tìm theo mã ở màn Tạm hết).
- Migration áp prod bằng Supabase MCP (`dlkgdpexjtyynbotkwka`). File có hàm mới; không đụng hàm sống nào.
- Mini App sửa ở **code lõi** `mini-app/src` (CLAUDE.md "3 tầng"); vitest mini-app chạy node → hàm thuần đặt ở `src/utils/`.
- Lệnh: admin-web `npx vitest run <file>`, `npx tsc --noEmit`, `npx eslint <files>`, `npm run build`; mini-app `npx vitest run <file>`, `npx tsc --noEmit` (nếu repo có script `typecheck` thì dùng nó).
- Commit `feat:/fix:/docs:` + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Test tay trên **Bảo Lương** (9 danh mục, 65 món).

## Review Focus

1. **Hai món / hai danh mục bị đặt cùng mã/tiền tố** (sửa tay, hoặc hai người thêm món cùng lúc) → DB UNIQUE chặn, admin báo "Mã món đã dùng cho «tên món»", không ghi; trigger sinh mã không bao giờ tự tạo trùng. → test action Task 3 + kiểm SQL Task 2.
2. **Tên danh mục có dấu / ký tự lạ / toàn ký hiệu** ("Cơm rang - Mỳ xào", "Đồ khô", "🍺 !!!") → tiền tố bỏ dấu đúng (CRMX, DK), rỗng thì "MON"; bản SQL và bản TS cho CÙNG kết quả. → test Task 1 + đối chiếu Task 2.
3. **Đang tìm / đang lọc mà kéo thả sắp xếp** → kéo bị tắt (sắp trên tập con sẽ ghi sai thứ tự cả danh mục). → test `visibleMenuItems` Task 1 (`canReorder=false`).
4. **Sửa/xoá món hoặc danh mục của QUÁN KHÁC bằng id** (lỗ hổng có sẵn: `updateMenuItem`, `deleteMenuItem`, `updateCategory`, `deleteCategory` không lọc `store_id`) → không đụng gì. → test Task 3.
5. **Mini App gặp `badge` lạ / null / món tạm hết có nhãn** → không vỡ, nhãn lạ không hiện, món tạm hết vẫn mờ như cũ. → test `badgeLabel` Task 5.

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `admin-web/lib/menu/sku.ts` (mới) | Bỏ dấu, sinh tiền tố, tiền tố duy nhất, định dạng mã, kiểm mã/tiền tố gõ tay, nhãn món |
| `admin-web/lib/menu/menu-filter.ts` (mới) | Tìm (bỏ dấu, theo tên/mã) + lọc trạng thái + đếm + `canReorder` |
| `supabase/migrations/095_menu_sku_badge.sql` (mới) | Cột, hàm `menu_sku_prefix`, 2 trigger, backfill, UNIQUE |
| `admin-web/lib/actions/menu.ts` (sửa) | Lưu mã/nhãn/tiền tố + báo trùng; vá lọc `store_id` |
| `admin-web/app/admin/menu/menu-client.tsx` (sửa) | Thanh tìm + lọc, hiện mã + nhãn, ô mã/nhãn trong form, ô tiền tố trong form danh mục |
| `admin-web/app/admin/menu/menu-availability-client.tsx` (sửa) | Thu ngân: tìm theo cả mã, hiện mã |
| `mini-app/src/utils/menu-badge.ts` (mới) + `types/product.types.ts`, `services/category/category.api.ts`, `components/ui/product-card.tsx`, `components/menu/option-sheet.tsx` (sửa) | Nhãn trên Mini App |
| `docs/testing/pos-admin-complete/PA-4.md` (mới) | Checklist |

---

### Task 1: Hàm thuần mã món + tìm/lọc

**Files:**
- Create: `admin-web/lib/menu/sku.ts`, `admin-web/lib/menu/sku.test.ts`
- Create: `admin-web/lib/menu/menu-filter.ts`, `admin-web/lib/menu/menu-filter.test.ts`

**Interfaces:**
- Produces (`sku.ts`):
  - `stripVietnamese(s: string): string` — NFD, bỏ dấu, `đ→d`, `Đ→D`
  - `skuPrefixFromName(name: string): string` — chữ cái đầu mỗi từ (từ = chuỗi a-z0-9 sau bỏ dấu), in hoa, tối đa 4; rỗng → `'MON'`
  - `uniquePrefix(base: string, used: string[]): string` — base chưa dùng thì giữ; trùng → `base2`, `base3`… (cắt base để tổng ≤ 6)
  - `formatSku(prefix: string, n: number): string` — `PREFIX-001`
  - `nextSkuNumber(prefix: string, existing: string[]): number` — 1 + lớn nhất trong các mã dạng `PREFIX-<số>`
  - `parseManualSku(raw: string): { ok: true; sku: string | null } | { ok: false; error: string }` — trim + in hoa; rỗng → `sku: null` (để DB tự sinh); sai → `'Mã món chỉ gồm chữ không dấu, số, gạch ngang (tối đa 20 ký tự)'`
  - `parsePrefix(raw: string): { ok: true; prefix: string | null } | { ok: false; error: string }` — rỗng → null; sai → `'Tiền tố chỉ gồm chữ không dấu và số (1–6 ký tự)'`
  - `type MenuBadge = 'best_seller' | 'signature'`; `MENU_BADGES: ReadonlyArray<{ value: MenuBadge; label: string }>`; `parseBadge(v: unknown): MenuBadge | null`; `badgeLabel(b: unknown): string | null`
- Produces (`menu-filter.ts`):
  - `type StatusFilter = 'all' | 'on' | 'off'`
  - `type FilterItem = { id: string; name: string; sku: string | null; is_available: boolean; category_id: string }`
  - `visibleMenuItems<T extends FilterItem>(input: { categories: Array<{ id: string; name: string; menu_items: T[] }>; selectedCatId: string; query: string; status: StatusFilter; isAvailable?: (item: T) => boolean }): { items: Array<T & { categoryName: string }>; counts: { all: number; on: number; off: number }; searching: boolean; canReorder: boolean }` — có `query` (sau trim) → tìm TRÊN MỌI danh mục theo tên (bỏ dấu, không phân biệt hoa thường) hoặc mã (chứa chuỗi); không có → chỉ danh mục đang chọn. `counts` đếm TRƯỚC khi lọc trạng thái (để nút lọc luôn hiện đúng số). `canReorder = !searching && status === 'all'`. `isAvailable` mặc định đọc `item.is_available` (UI truyền hàm có tính "overrides" lạc quan).

- [ ] **Step 1: `sku.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { badgeLabel, formatSku, MENU_BADGES, nextSkuNumber, parseBadge, parseManualSku, parsePrefix, skuPrefixFromName, stripVietnamese, uniquePrefix } from './sku'

describe('tiền tố mã món từ tên danh mục', () => {
  it.each([
    ['Món ngon tuần này', 'MNTN'],
    ['Các món quê', 'CMQ'],
    ['Các món trâu - bò', 'CMTB'],
    ['Cơm rang - Mỳ xào', 'CRMX'],
    ['Đồ ăn nhanh', 'DAN'],
    ['Đồ khô', 'DK'],
    ['Đồ uống', 'DU'],
    ['Bia & Đồ uống', 'BDU'],
    ['Lẩu riêu cua bắp bò sườn sụn', 'LRCB'],
    ['🍺 !!!', 'MON'],
    ['  ', 'MON'],
  ])('%s → %s', (name, prefix) => expect(skuPrefixFromName(name)).toBe(prefix))
  it('bỏ dấu đủ chữ Việt', () => expect(stripVietnamese('Đặc biệt ẩm thực Ỷ')).toBe('Dac biet am thuc Y'))
  it('trùng tiền tố → thêm số, tối đa 6 ký tự', () => {
    expect(uniquePrefix('DU', [])).toBe('DU')
    expect(uniquePrefix('DU', ['DU'])).toBe('DU2')
    expect(uniquePrefix('DU', ['DU', 'DU2'])).toBe('DU3')
    expect(uniquePrefix('MNTN', ['MNTN', 'MNTN2', 'MNTN3', 'MNTN4', 'MNTN5', 'MNTN6', 'MNTN7', 'MNTN8', 'MNTN9'])).toBe('MNTN10')
    expect(uniquePrefix('ABCDEF', ['ABCDEF'])).toBe('ABCDE2')
  })
})

describe('mã món', () => {
  it('định dạng 3 chữ số', () => {
    expect(formatSku('DU', 1)).toBe('DU-001')
    expect(formatSku('DU', 1234)).toBe('DU-1234')
  })
  it('số kế tiếp bỏ qua mã sửa tay không đúng mẫu', () => {
    expect(nextSkuNumber('DU', [])).toBe(1)
    expect(nextSkuNumber('DU', ['DU-001', 'DU-007', 'DU-ABC', 'DUX-050', 'BIA-THAP'])).toBe(8)
  })
  it('mã gõ tay', () => {
    expect(parseManualSku('  bia-thap-03 ')).toEqual({ ok: true, sku: 'BIA-THAP-03' })
    expect(parseManualSku('')).toEqual({ ok: true, sku: null })
    expect(parseManualSku('bia tháp')).toMatchObject({ ok: false })
    expect(parseManualSku('-ABC')).toMatchObject({ ok: false })
    expect(parseManualSku('A'.repeat(21))).toMatchObject({ ok: false })
  })
  it('tiền tố gõ tay', () => {
    expect(parsePrefix(' bia ')).toEqual({ ok: true, prefix: 'BIA' })
    expect(parsePrefix('')).toEqual({ ok: true, prefix: null })
    expect(parsePrefix('BIA-1')).toMatchObject({ ok: false })
    expect(parsePrefix('ABCDEFG')).toMatchObject({ ok: false })
  })
})

describe('nhãn món', () => {
  it('2 nhãn, giá trị lạ → null', () => {
    expect(MENU_BADGES.map((b) => b.value)).toEqual(['best_seller', 'signature'])
    expect(parseBadge('signature')).toBe('signature')
    expect(parseBadge('hot')).toBeNull()
    expect(parseBadge('')).toBeNull()
    expect(badgeLabel('best_seller')).toBe('Best seller')
    expect(badgeLabel('signature')).toBe('Món của quán')
    expect(badgeLabel(null)).toBeNull()
  })
})
```

- [ ] **Step 2: `menu-filter.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { visibleMenuItems } from './menu-filter'

const it_ = (id: string, name: string, sku: string | null, on: boolean, cat: string) => ({ id, name, sku, is_available: on, category_id: cat })
const categories = [
  { id: 'c1', name: 'Đồ uống', menu_items: [it_('1', 'Bia hơi', 'DU-001', true, 'c1'), it_('2', 'Nước cam', 'DU-002', false, 'c1')] },
  { id: 'c2', name: 'Đồ khô', menu_items: [it_('3', 'Mực nướng', 'DK-001', true, 'c2'), it_('4', 'Bò khô', 'DK-002', true, 'c2')] },
]

describe('lọc + tìm món', () => {
  it('không tìm: chỉ danh mục đang chọn; đếm trước khi lọc; kéo được khi xem Tất cả', () => {
    const r = visibleMenuItems({ categories, selectedCatId: 'c1', query: '', status: 'all' })
    expect(r.items.map((i) => i.id)).toEqual(['1', '2'])
    expect(r.counts).toEqual({ all: 2, on: 1, off: 1 })
    expect(r.canReorder).toBe(true)
  })
  it('lọc Tạm hết: chỉ món tắt, đếm vẫn đủ, KHÔNG kéo được', () => {
    const r = visibleMenuItems({ categories, selectedCatId: 'c1', query: '', status: 'off' })
    expect(r.items.map((i) => i.id)).toEqual(['2'])
    expect(r.counts).toEqual({ all: 2, on: 1, off: 1 })
    expect(r.canReorder).toBe(false)
  })
  it('tìm không dấu trên MỌI danh mục, kèm tên danh mục, KHÔNG kéo được', () => {
    const r = visibleMenuItems({ categories, selectedCatId: 'c1', query: 'kho', status: 'all' })
    expect(r.items.map((i) => [i.id, i.categoryName])).toEqual([['4', 'Đồ khô']])
    expect(r.searching).toBe(true)
    expect(r.canReorder).toBe(false)
  })
  it('tìm theo mã (không phân biệt hoa thường)', () => {
    expect(visibleMenuItems({ categories, selectedCatId: 'c1', query: 'dk-00', status: 'all' }).items.map((i) => i.id)).toEqual(['3', '4'])
  })
  it('dùng trạng thái lạc quan do UI truyền vào', () => {
    const r = visibleMenuItems({ categories, selectedCatId: 'c1', query: '', status: 'on', isAvailable: (i) => i.id === '2' })
    expect(r.items.map((i) => i.id)).toEqual(['2'])
  })
})
```

- [ ] **Step 3: Chạy → FAIL** (`npx vitest run lib/menu/sku.test.ts lib/menu/menu-filter.test.ts`)

- [ ] **Step 4: `lib/menu/sku.ts`**

```ts
// Mã món (SKU) + nhãn món (PA-4, 2026-10-08) — hàm THUẦN để test được.
// ⚠️ skuPrefixFromName PHẢI cho cùng kết quả với hàm SQL public.menu_sku_prefix (mig 095) — DB tự sinh
// tiền tố khi danh mục được tạo từ đường khác (wizard, import). Đổi một bên thì đổi cả bên kia.

export function stripVietnamese(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
}

export function skuPrefixFromName(name: string): string {
  const words = stripVietnamese(name ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  const prefix = words.map((w) => w[0]).join('').toUpperCase().slice(0, 4)
  return prefix || 'MON'
}

export function uniquePrefix(base: string, used: string[]): string {
  if (!used.includes(base)) return base
  for (let n = 2; ; n++) {
    const suffix = String(n)
    const candidate = base.slice(0, 6 - suffix.length) + suffix
    if (!used.includes(candidate)) return candidate
  }
}

export function formatSku(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(3, '0')}`
}

export function nextSkuNumber(prefix: string, existing: string[]): number {
  const re = new RegExp(`^${prefix}-(\\d+)$`)
  return 1 + existing.reduce((max, s) => {
    const m = re.exec(s)
    return m ? Math.max(max, Number(m[1])) : max
  }, 0)
}

export function parseManualSku(raw: string): { ok: true; sku: string | null } | { ok: false; error: string } {
  const sku = (raw ?? '').trim().toUpperCase()
  if (!sku) return { ok: true, sku: null }
  return /^[A-Z0-9][A-Z0-9-]{0,19}$/.test(sku)
    ? { ok: true, sku }
    : { ok: false, error: 'Mã món chỉ gồm chữ không dấu, số, gạch ngang (tối đa 20 ký tự)' }
}

export function parsePrefix(raw: string): { ok: true; prefix: string | null } | { ok: false; error: string } {
  const prefix = (raw ?? '').trim().toUpperCase()
  if (!prefix) return { ok: true, prefix: null }
  return /^[A-Z0-9]{1,6}$/.test(prefix)
    ? { ok: true, prefix }
    : { ok: false, error: 'Tiền tố chỉ gồm chữ không dấu và số (1–6 ký tự)' }
}

export type MenuBadge = 'best_seller' | 'signature'

export const MENU_BADGES: ReadonlyArray<{ value: MenuBadge; label: string }> = [
  { value: 'best_seller', label: 'Best seller' },
  { value: 'signature', label: 'Món của quán' },
]

export function parseBadge(v: unknown): MenuBadge | null {
  return v === 'best_seller' || v === 'signature' ? v : null
}

export function badgeLabel(b: unknown): string | null {
  const v = parseBadge(b)
  return v ? MENU_BADGES.find((x) => x.value === v)!.label : null
}
```

- [ ] **Step 5: `lib/menu/menu-filter.ts`**

```ts
import { stripVietnamese } from './sku'

// Tìm + lọc món cho tab Thực đơn & Giá (PA-4). Đang tìm hoặc đang lọc trạng thái thì TẮT kéo-sắp-xếp:
// kéo trên tập con rồi ghi thứ tự sẽ làm sai thứ tự cả danh mục.

export type StatusFilter = 'all' | 'on' | 'off'
export type FilterItem = { id: string; name: string; sku: string | null; is_available: boolean; category_id: string }

const norm = (s: string) => stripVietnamese(s).toLowerCase()

export function visibleMenuItems<T extends FilterItem>(input: {
  categories: Array<{ id: string; name: string; menu_items: T[] }>
  selectedCatId: string
  query: string
  status: StatusFilter
  isAvailable?: (item: T) => boolean
}): { items: Array<T & { categoryName: string }>; counts: { all: number; on: number; off: number }; searching: boolean; canReorder: boolean } {
  const isOn = input.isAvailable ?? ((i: T) => i.is_available)
  const q = norm(input.query.trim())
  const searching = q.length > 0
  const pool = (searching ? input.categories : input.categories.filter((c) => c.id === input.selectedCatId))
    .flatMap((c) => (c.menu_items ?? []).map((i) => ({ ...i, categoryName: c.name })))
    .filter((i) => !searching || norm(i.name).includes(q) || (i.sku ?? '').toLowerCase().includes(q))
  const on = pool.filter(isOn).length
  const items = input.status === 'all' ? pool : pool.filter((i) => (input.status === 'on' ? isOn(i) : !isOn(i)))
  return { items, counts: { all: pool.length, on, off: pool.length - on }, searching, canReorder: !searching && input.status === 'all' }
}
```

- [ ] **Step 6: Chạy → PASS**, eslint 4 file.
- [ ] **Step 7: Commit** — `git add admin-web/lib/menu/sku.* admin-web/lib/menu/menu-filter.* && git commit -m "feat: ham ma mon, nhan mon, tim/loc mon (PA-4)"`

---

### Task 2: Migration 095

**Files:**
- Create: `supabase/migrations/095_menu_sku_badge.sql`

**Interfaces:**
- Produces: `menu_categories.sku_prefix text` (UNIQUE theo quán), `menu_items.sku text` (UNIQUE theo quán, null được), `menu_items.badge text` (CHECK 2 giá trị hoặc null); `public.menu_sku_prefix(text) RETURNS text` (IMMUTABLE); trigger `menu_categories_sku_prefix_bi`, `menu_items_sku_bi`.

- [ ] **Step 1: RED** — `select column_name from information_schema.columns where table_name in ('menu_items','menu_categories') and column_name in ('sku','sku_prefix','badge');` → 0 dòng.

- [ ] **Step 2: Viết migration**

```sql
-- 095 (PA-4, 2026-10-08): mã món (SKU) tự sinh theo tiền tố danh mục + nhãn món.
-- ⚠️ public.menu_sku_prefix PHẢI khớp admin-web/lib/menu/sku.ts skuPrefixFromName (đã đối chiếu dữ liệu thật).
-- Trigger chỉ sinh khi cột để TRỐNG → mã gõ tay được giữ; đổi danh mục KHÔNG đổi mã cũ.
-- Backfill chạy MỘT lần; chạy lại file sẽ không ghi đè (chỉ điền chỗ còn NULL).

ALTER TABLE public.menu_categories ADD COLUMN IF NOT EXISTS sku_prefix text;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS sku text;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS badge text;

ALTER TABLE public.menu_categories DROP CONSTRAINT IF EXISTS menu_categories_sku_prefix_check;
ALTER TABLE public.menu_categories ADD CONSTRAINT menu_categories_sku_prefix_check
  CHECK (sku_prefix IS NULL OR sku_prefix ~ '^[A-Z0-9]{1,6}$');
ALTER TABLE public.menu_items DROP CONSTRAINT IF EXISTS menu_items_sku_check;
ALTER TABLE public.menu_items ADD CONSTRAINT menu_items_sku_check
  CHECK (sku IS NULL OR sku ~ '^[A-Z0-9][A-Z0-9-]{0,19}$');
ALTER TABLE public.menu_items DROP CONSTRAINT IF EXISTS menu_items_badge_check;
ALTER TABLE public.menu_items ADD CONSTRAINT menu_items_badge_check
  CHECK (badge IS NULL OR badge IN ('best_seller', 'signature'));

CREATE OR REPLACE FUNCTION public.menu_sku_prefix(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT COALESCE(NULLIF(left(upper(string_agg(left(w, 1), '' ORDER BY ord)), 4), ''), 'MON')
  FROM regexp_split_to_table(
         translate(lower(normalize(COALESCE(p_name, ''), NFC)),
           'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ',
           'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'),
         '[^a-z0-9]+') WITH ORDINALITY AS t(w, ord)
  WHERE w <> '';
$function$;

-- Tiền tố duy nhất trong quán: base, base2, base3… (tổng ≤ 6 ký tự) — khớp uniquePrefix (sku.ts).
CREATE OR REPLACE FUNCTION public.menu_unique_sku_prefix(p_store_id uuid, p_base text, p_self uuid)
RETURNS text
LANGUAGE plpgsql
AS $function$
DECLARE v_candidate text := p_base; v_n integer := 2;
BEGIN
  WHILE EXISTS (SELECT 1 FROM public.menu_categories
                WHERE store_id = p_store_id AND sku_prefix = v_candidate AND id IS DISTINCT FROM p_self) LOOP
    v_candidate := left(p_base, 6 - length(v_n::text)) || v_n::text;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_candidate;
END;
$function$;

CREATE OR REPLACE FUNCTION public.menu_categories_sku_prefix_fill()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.sku_prefix IS NULL THEN
    NEW.sku_prefix := public.menu_unique_sku_prefix(NEW.store_id, public.menu_sku_prefix(NEW.name), NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.menu_items_sku_fill()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE v_prefix text; v_next integer;
BEGIN
  IF NEW.sku IS NOT NULL THEN RETURN NEW; END IF;
  SELECT sku_prefix INTO v_prefix FROM public.menu_categories WHERE id = NEW.category_id;
  v_prefix := COALESCE(v_prefix, 'MON');
  -- Khoá theo quán+tiền tố để hai món thêm cùng lúc không lấy cùng số.
  PERFORM pg_advisory_xact_lock(hashtext(NEW.store_id::text || ':' || v_prefix));
  SELECT COALESCE(MAX((substring(sku FROM '^' || v_prefix || '-(\d+)$'))::integer), 0) + 1 INTO v_next
  FROM public.menu_items WHERE store_id = NEW.store_id AND sku ~ ('^' || v_prefix || '-\d+$');
  NEW.sku := v_prefix || '-' || lpad(v_next::text, 3, '0');
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS menu_categories_sku_prefix_bi ON public.menu_categories;
CREATE TRIGGER menu_categories_sku_prefix_bi BEFORE INSERT ON public.menu_categories
  FOR EACH ROW EXECUTE FUNCTION public.menu_categories_sku_prefix_fill();
DROP TRIGGER IF EXISTS menu_items_sku_bi ON public.menu_items;
CREATE TRIGGER menu_items_sku_bi BEFORE INSERT ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.menu_items_sku_fill();

-- Backfill: tiền tố theo thứ tự danh mục, rồi mã theo thứ tự món trong từng danh mục.
DO $backfill$
DECLARE r record; v_prefix text; v_next integer;
BEGIN
  FOR r IN SELECT id, store_id, name FROM public.menu_categories WHERE sku_prefix IS NULL ORDER BY store_id, sort_order, id LOOP
    UPDATE public.menu_categories
    SET sku_prefix = public.menu_unique_sku_prefix(r.store_id, public.menu_sku_prefix(r.name), r.id)
    WHERE id = r.id;
  END LOOP;
  FOR r IN SELECT i.id, i.store_id, c.sku_prefix FROM public.menu_items i JOIN public.menu_categories c ON c.id = i.category_id
           WHERE i.sku IS NULL ORDER BY i.store_id, c.sort_order, i.sort_order, i.id LOOP
    v_prefix := COALESCE(r.sku_prefix, 'MON');
    SELECT COALESCE(MAX((substring(sku FROM '^' || v_prefix || '-(\d+)$'))::integer), 0) + 1 INTO v_next
    FROM public.menu_items WHERE store_id = r.store_id AND sku ~ ('^' || v_prefix || '-\d+$');
    UPDATE public.menu_items SET sku = v_prefix || '-' || lpad(v_next::text, 3, '0') WHERE id = r.id;
  END LOOP;
END
$backfill$;

CREATE UNIQUE INDEX IF NOT EXISTS menu_categories_store_sku_prefix_uq ON public.menu_categories(store_id, sku_prefix) WHERE sku_prefix IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS menu_items_store_sku_uq ON public.menu_items(store_id, sku) WHERE sku IS NOT NULL;
```

- [ ] **Step 3: Áp prod** (MCP `apply_migration` name `menu_sku_badge`).

- [ ] **Step 4: Kiểm + đối chiếu TS**

```sql
select c.name, c.sku_prefix, count(i.*) items, min(i.sku) first_sku, max(i.sku) last_sku
from menu_categories c left join menu_items i on i.category_id = c.id
where c.store_id = '2139c162-9677-4cbd-87e3-d2e1ac22e6e8' group by c.name, c.sku_prefix, c.sort_order order by c.sort_order;
select count(*) filter (where sku is null) no_sku, count(*) total from menu_items;
select public.menu_sku_prefix(x) from unnest(array['Món ngon tuần này','Các món trâu - bò','Cơm rang - Mỳ xào','Đồ ăn nhanh','Bia & Đồ uống','🍺 !!!','  ']) x;
```

Expected BL: MNTN (5 món, MNTN-001..005), CMQ, CMTB, CML, CMCM, CRMX, DAN, DK, DU; `no_sku = 0`; dòng cuối = `MNTN, CMTB, CRMX, DAN, BDU, MON, MON` — khớp bảng test Task 1. Không khớp → sửa cho khớp (ưu tiên bản TS), ghi Ruling.

Kiểm trigger + UNIQUE trong ROLLBACK:

```sql
begin;
insert into menu_items(store_id, category_id, name, price) select store_id, id, 'Test SKU', 1000 from menu_categories where store_id='2139c162-9677-4cbd-87e3-d2e1ac22e6e8' and sku_prefix='DU' returning sku;  -- DU-005
insert into menu_categories(store_id, name, sort_order) values ('2139c162-9677-4cbd-87e3-d2e1ac22e6e8','Đồ uống mới', 99) returning sku_prefix;  -- DUM
insert into menu_categories(store_id, name, sort_order) values ('2139c162-9677-4cbd-87e3-d2e1ac22e6e8','Đồ uống', 100) returning sku_prefix;  -- DU2
rollback;
```

Và một khối: `update menu_items set sku='DU-001' where sku='DU-002' and store_id=...` → lỗi UNIQUE (ROLLBACK).

- [ ] **Step 5: Commit** — `git add supabase/migrations/095_menu_sku_badge.sql && git commit -m "feat: ma mon tu sinh + nhan mon (PA-4, mig 095)"`

---

### Task 3: Server action lưu mã / nhãn / tiền tố + vá lọc quán

**Files:**
- Modify: `admin-web/lib/actions/menu.ts`
- Modify: `admin-web/lib/actions/menu.test.ts`

**Interfaces:**
- Consumes: `parseManualSku`, `parsePrefix`, `parseBadge` (Task 1).
- Produces: `addMenuItem(formData)` / `updateMenuItem(itemId, formData)` đọc thêm `sku` (rỗng → để DB tự sinh khi thêm; khi sửa: rỗng → GIỮ mã cũ) và `badge` (`''` → null). `addCategory(formData)` / `updateCategory(id, formData)` đọc `sku_prefix`. Lỗi trùng → `throw new Error('Mã món đã dùng cho «<tên món>»')` / `'Tiền tố đã dùng cho danh mục «<tên>»'`. `updateMenuItem`, `deleteMenuItem`, `updateCategory`, `deleteCategory` lọc `store_id`.

- [ ] **Step 1: Test** — mở rộng `menu.test.ts` (đang mock `createAdminClient: () => ({})`): đổi mock admin client sang builder ghi lại `insert/update/delete` + `eq` và trả lỗi giả theo cờ `state.uniqueError` (code `'23505'`), `maybeSingle` trả dòng trùng từ `state.conflict`. Các bài:

```ts
  it('thêm món: mã gõ tay in hoa + nhãn; mã trống để DB tự sinh', async () => {
    await addMenuItem(form({ category_id: 'c1', name: 'Bia', price: '20000', sku: ' bia-01 ', badge: 'best_seller' }))
    expect(lastWrite('menu_items').payload).toMatchObject({ sku: 'BIA-01', badge: 'best_seller', store_id: 'store-1' })
    await addMenuItem(form({ category_id: 'c1', name: 'Bia 2', price: '20000', sku: '', badge: '' }))
    expect(lastWrite('menu_items').payload).not.toHaveProperty('sku')
    expect(lastWrite('menu_items').payload).toMatchObject({ badge: null })
  })
  it('mã sai định dạng → lỗi, không ghi', async () => {
    await expect(addMenuItem(form({ category_id: 'c1', name: 'X', price: '1000', sku: 'bia tháp' }))).rejects.toThrow('Mã món chỉ gồm')
  })
  it('mã trùng → báo tên món đang dùng', async () => {
    state.uniqueError = true; state.conflict = { name: 'Bia hơi' }
    await expect(addMenuItem(form({ category_id: 'c1', name: 'X', price: '1000', sku: 'DU-001' }))).rejects.toThrow('Mã món đã dùng cho «Bia hơi»')
  })
  it('sửa món: mã trống giữ mã cũ; lọc đúng quán', async () => {
    await updateMenuItem('i1', form({ category_id: 'c1', name: 'Bia', price: '20000', sku: '', badge: 'signature' }))
    const w = lastWrite('menu_items')
    expect(w.payload).not.toHaveProperty('sku')
    expect(w.payload).toMatchObject({ badge: 'signature' })
    expect(w.eq).toEqual(expect.arrayContaining([['id', 'i1'], ['store_id', 'store-1']]))
  })
  it('xoá món / sửa / xoá danh mục: lọc đúng quán', async () => {
    await deleteMenuItem('i1')
    expect(lastWrite('menu_items').eq).toEqual(expect.arrayContaining([['store_id', 'store-1']]))
    await updateCategory('c1', form({ name: 'Bia', sku_prefix: 'bia' }))
    expect(lastWrite('menu_categories')).toMatchObject({ payload: { name: 'Bia', sku_prefix: 'BIA' } })
    expect(lastWrite('menu_categories').eq).toEqual(expect.arrayContaining([['store_id', 'store-1']]))
    await deleteCategory('c9')
    expect(lastWrite('menu_categories').eq).toEqual(expect.arrayContaining([['store_id', 'store-1']]))
  })
  it('tiền tố trống khi sửa → giữ tiền tố cũ', async () => {
    await updateCategory('c1', form({ name: 'Bia', sku_prefix: '' }))
    expect(lastWrite('menu_categories').payload).not.toHaveProperty('sku_prefix')
  })
```

(`form(obj)` dựng FormData; `lastWrite(table)` lấy bản ghi ghi cuối của bảng đó từ `state.writes`. Viết hai helper này trong file test. Giữ nguyên 3 bài `setMenuItemAvailable` cũ — mock `createClient` không đổi.) Chạy → FAIL.

- [ ] **Step 2: Sửa `menu.ts`**
- Import `parseBadge, parseManualSku, parsePrefix` từ `@/lib/menu/sku`.
- Helper:

```ts
// Lỗi UNIQUE (23505) của mã món / tiền tố → câu báo dễ hiểu kèm tên đang dùng mã đó.
async function friendlyUniqueError(admin: ReturnType<typeof createAdminClient>, storeId: string, kind: 'sku' | 'prefix', value: string): Promise<Error> {
  if (kind === 'sku') {
    const { data } = await admin.from('menu_items').select('name').eq('store_id', storeId).eq('sku', value).maybeSingle()
    return new Error(`Mã món đã dùng cho «${(data?.name as string | undefined) ?? value}»`)
  }
  const { data } = await admin.from('menu_categories').select('name').eq('store_id', storeId).eq('sku_prefix', value).maybeSingle()
  return new Error(`Tiền tố đã dùng cho danh mục «${(data?.name as string | undefined) ?? value}»`)
}

function readSkuAndBadge(formData: FormData): { sku: string | null; badge: string | null } {
  const sku = parseManualSku((formData.get('sku') as string | null) ?? '')
  if (!sku.ok) throw new Error(sku.error)
  return { sku: sku.sku, badge: parseBadge(formData.get('badge')) }
}
```

- `addMenuItem`: `const { sku, badge } = readSkuAndBadge(formData)`; insert thêm `badge`, và `...(sku ? { sku } : {})`; nếu `error?.code === '23505' && sku` → `throw await friendlyUniqueError(admin, storeId, 'sku', sku)`.
- `updateMenuItem`: tương tự; patch thêm `badge` và `sku` chỉ khi có; `.eq('id', itemId).eq('store_id', storeId)`; trùng → báo như trên. Đổi `await getStoreId() // xác thực user` thành `const storeId = await getStoreId()` nếu đang bỏ giá trị.
- `deleteMenuItem`: `const storeId = await getStoreId()` + `.eq('store_id', storeId)`.
- `addCategory`: đọc `parsePrefix`; lỗi → throw; insert `...(prefix ? { sku_prefix: prefix } : {})`; trùng → `friendlyUniqueError(..., 'prefix', prefix)`.
- `updateCategory`: `const storeId = await getStoreId()`; patch `{ name, ...(prefix ? { sku_prefix: prefix } : {}) }`; `.eq('store_id', storeId)`; trùng → báo.
- `deleteCategory`: `const storeId = await getStoreId()`; đếm món thêm `.eq('store_id', storeId)`; delete `.eq('store_id', storeId)`.

- [ ] **Step 3: Chạy → PASS**, `npx tsc --noEmit`.
- [ ] **Step 4: Commit** — `git add admin-web/lib/actions/menu.* && git commit -m "feat: luu ma mon/nhan/tien to + loc dung quan khi sua/xoa mon va danh muc (PA-4)"`

---

### Task 4: Giao diện Thực đơn & Giá + màn Tạm hết của thu ngân

**Files:**
- Modify: `admin-web/app/admin/menu/menu-client.tsx`, `admin-web/app/admin/menu/page.tsx`
- Modify: `admin-web/app/admin/menu/menu-availability-client.tsx`

**Interfaces:**
- Consumes: `visibleMenuItems`, `StatusFilter` (Task 1), `MENU_BADGES`, `badgeLabel` (Task 1).

- [ ] **Step 1: Kiểu dữ liệu** — `MenuItem` thêm `sku: string | null; badge: string | null`; `Category` thêm `sku_prefix: string | null`. `page.tsx` đang `select('*, menu_items(*, …)')` nên đã có cột mới; nhánh thu ngân thêm `sku` vào select `menu_items(id, name, price, is_available, sort_order, sku)`.

- [ ] **Step 2: Thanh tìm + lọc** (đặt ngay dưới thanh tiêu đề danh mục, trên danh sách món):
  - State `query` (string), `status: StatusFilter` (mặc định `'all'`).
  - `const view = visibleMenuItems({ categories, selectedCatId, query, status, isAvailable: (i) => overrides[i.id] ?? i.is_available })`; danh sách render `view.items` thay `selectedItems`.
  - Ô tìm: icon `Search`, placeholder "Tìm theo tên hoặc mã món…", nút xoá chữ (X) khi có nội dung.
  - 3 nút lọc dạng pill: `Tất cả (${view.counts.all})`, `Đang bán (${view.counts.on})`, `Tạm hết (${view.counts.off})`, `aria-pressed`.
  - Tiêu đề phải: khi `view.searching` hiện "Kết quả tìm «q» (N)" thay tên danh mục.
  - `view.canReorder === false` → bỏ `draggable`/tay kéo trên từng dòng và hiện dòng nhỏ "Đang tìm/lọc — tạm tắt kéo để sắp xếp".
  - Khi `view.searching`, mỗi dòng hiện thêm tên danh mục (chữ nhỏ) vì kết quả lẫn nhiều danh mục.
  - Không có kết quả → "Không có món nào khớp".

- [ ] **Step 3: Dòng món** — dưới tên món: mã món `font-mono text-xs text-muted` (nếu có) và nhãn: `best_seller` = pill `bg-orange-50 text-orange-700 ring-1 ring-orange-200`, `signature` = pill `bg-violet-50 text-violet-700 ring-1 ring-violet-200`, nội dung `badgeLabel(item.badge)`.

- [ ] **Step 4: Form món (`ItemForm`)** — thêm 2 ô cạnh nhau:
  - **Mã món** `<input name="sku" defaultValue={item?.sku ?? ''} placeholder="Để trống: tự sinh (VD: DU-005)" className="input font-mono uppercase" maxLength={20} />`; ghi chú nhỏ "Để trống khi thêm: hệ thống tự sinh theo danh mục. Để trống khi sửa: giữ mã cũ."
  - **Nhãn** `<select name="badge" defaultValue={item?.badge ?? ''}>` với `Không có` + `MENU_BADGES`.
  - Lỗi từ action (đang hiện qua `alert`/state lỗi sẵn có của form) giữ cách hiện hiện tại.

- [ ] **Step 5: Form danh mục** (thêm + sửa) — thêm ô **Tiền tố mã món** `name="sku_prefix"` (`defaultValue={editCat?.sku_prefix ?? ''}`, maxLength 6, uppercase, placeholder "Để trống: tự sinh từ tên"), ghi chú "Mã món mới trong danh mục này sẽ có dạng TIỀNTỐ-001. Đổi tiền tố không đổi mã các món cũ."

- [ ] **Step 6: Màn Tạm hết (thu ngân)** — `MenuAvailabilityClient`: kiểu `Item` thêm `sku: string | null`; điều kiện tìm thêm `(i.sku ?? '').toLowerCase().includes(needle)` và so tên dùng `stripVietnamese(...).toLowerCase()` (import từ `@/lib/menu/sku`); hiện mã món chữ nhỏ cạnh giá.

- [ ] **Step 7: Kiểm** — `npx tsc --noEmit && npx vitest run && npx eslint app/admin/menu lib/menu && npm run build`. Lỗi eslint có sẵn ở `menu-client.tsx` (set-state-in-effect dòng ~85, ~637) không tính — chỉ đảm bảo không thêm lỗi mới.

- [ ] **Step 8: Commit** — `git add admin-web/app/admin/menu && git commit -m "feat: tim + loc mon, hien ma mon va nhan, o ma/nhan/tien to trong form (PA-4)"`

---

### Task 5: Nhãn món trên Mini App (code lõi)

**Files:**
- Create: `mini-app/src/utils/menu-badge.ts`, `mini-app/src/utils/menu-badge.test.ts`
- Modify: `mini-app/src/types/product.types.ts`, `mini-app/src/services/category/category.api.ts`, `mini-app/src/components/ui/product-card.tsx`, `mini-app/src/components/menu/option-sheet.tsx`

**Interfaces:**
- Produces: `Product.badge: 'best_seller' | 'signature' | null`; `menuBadge(v: unknown): { key: 'best_seller' | 'signature'; label: string } | null`.

- [ ] **Step 1: Test `menu-badge.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { menuBadge } from "./menu-badge";

describe("nhãn món trên Mini App (PA-4)", () => {
  it("2 nhãn có nhãn chữ tiếng Việt", () => {
    expect(menuBadge("best_seller")).toEqual({ key: "best_seller", label: "Best seller" });
    expect(menuBadge("signature")).toEqual({ key: "signature", label: "Món của quán" });
  });
  it("null / rỗng / giá trị lạ → không hiện", () => {
    expect(menuBadge(null)).toBeNull();
    expect(menuBadge("")).toBeNull();
    expect(menuBadge("hot")).toBeNull();
  });
});
```

- [ ] **Step 2: FAIL** (`cd mini-app && npx vitest run src/utils/menu-badge.test.ts`)

- [ ] **Step 3: `menu-badge.ts`**

```ts
// Nhãn món (PA-4): chủ quán gắn ở admin (menu_items.badge). Giá trị lạ → không hiện, không vỡ.
export type MenuBadgeKey = "best_seller" | "signature";

export function menuBadge(v: unknown): { key: MenuBadgeKey; label: string } | null {
  if (v === "best_seller") return { key: v, label: "Best seller" };
  if (v === "signature") return { key: v, label: "Món của quán" };
  return null;
}
```

- [ ] **Step 4: Nối dữ liệu** — `Product` thêm `badge: MenuBadgeKey | null; // nhãn món (PA-4), null = không nhãn`; `mapProduct` thêm `badge: menuBadge(row.badge)?.key ?? null`. Truy vấn dùng `menu_items(*, …)` nên đã có cột. Tìm mọi chỗ tạo `Product` thủ công (test fixture, mock) bằng `grep -rn "hasVariantGroup:" src` và thêm `badge: null`.

- [ ] **Step 5: Hiện nhãn** — thành phần nhỏ trong `product-card.tsx`:

```tsx
function BadgePill({ badge }: { badge: Product["badge"] }) {
  const b = menuBadge(badge);
  if (!b) return null;
  // Màu theo màu chủ đạo của quán (primary runtime) — nền nhạt + chữ đậm, không chói.
  return <span className="inline-flex shrink-0 items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-xxxsmall font-bold text-primary">{b.label}</span>;
}
```

  - Layout grid: chèn `<BadgePill badge={product.badge} />` ngay TRƯỚC tên món (dòng riêng, `self-start`).
  - Layout list: cùng hàng phía trên tên món.
  - Món tạm hết vẫn hiện nhãn nhưng cả thẻ đã `opacity-60` như cũ.
  - `option-sheet.tsx`: hiện `BadgePill` (import từ product-card hoặc tách sang `components/ui/badge-pill.tsx` nếu import vòng) cạnh tiêu đề món.

- [ ] **Step 6: Kiểm** — `cd mini-app && npx vitest run && npx tsc --noEmit` (hoặc script typecheck của repo) — PASS; `npm run build` của mini-app nếu có, không lỗi.

- [ ] **Step 7: Commit** — `git add mini-app/src && git commit -m "feat: nhan Best seller / Mon cua quan tren Mini App (PA-4)"`

---

### Task 6: Chạy thật + checklist PA-4

**Files:**
- Create: `docs/testing/pos-admin-complete/PA-4.md`

- [ ] **Step 1: Chạy thật admin** — `npm run build && npx next start -p 3100`, mint phiên chủ quán Bảo Lương: tab Thực đơn hiện mã món ở mọi món; tìm "bia" / "du-00" ra đúng; lọc Tạm hết; gắn nhãn Best seller cho 1 món rồi **gỡ lại** (ghi ledger); thêm 1 món test để trống mã → nhận mã tự sinh → **xoá món test**. Không bấm nút có `confirm()` bằng toạ độ (xoá món dùng confirm — gọi action qua SQL dọn dẹp nếu cần, ghi ledger). Tắt server bằng PID đúng commandline `next start -p 3100`.

- [ ] **Step 2: Checklist**

```markdown
# PA-4 — Thực đơn: tìm, lọc, mã món, nhãn món

Spec `docs/superpowers/specs/2026-10-07-pos-admin-complete-design.md` · Plan `docs/superpowers/plans/2026-10-08-pa4-menu-search-sku-badge.md`
Migration đã áp prod: 095 (`sku_prefix`, `sku`, `badge`, trigger tự sinh mã; đã sinh mã cho 65 món Bảo Lương). Test trên **Bảo Lương**, đăng nhập chủ quán.

## Tìm + lọc (Thêm → Thực đơn & Giá)
1. Mỗi món có **mã** chữ nhỏ dưới tên (VD "Đồ uống" → DU-001…; "Cơm rang - Mỳ xào" → CRMX-001…).
2. Gõ "bia" (không dấu) → ra mọi món có "bia" ở MỌI danh mục, mỗi dòng ghi tên danh mục; tiêu đề "Kết quả tìm «bia» (N)".
3. Gõ mã "du-00" → ra các món Đồ uống. Xoá ô tìm → về danh mục đang chọn.
4. Bấm **Tạm hết (N)** → chỉ món đang tắt; số trên 3 nút đúng. Khi đang tìm/lọc: không kéo sắp xếp được, có dòng nhắc.
5. Về **Tất cả** + không tìm → kéo sắp xếp hoạt động như cũ.

## Mã món + nhãn
6. Sửa một món → ô **Mã món** có mã hiện tại, ô **Nhãn** = Không có. Chọn nhãn **Best seller** → Lưu → dòng món có nhãn cam "Best seller".
7. Sửa món khác, gõ mã trùng với món đã có (VD DU-001) → báo "Mã món đã dùng cho «…»", không lưu.
8. Gõ mã sai ("bia tháp") → báo lỗi định dạng.
9. **Thêm món** vào "Đồ uống", để trống mã → lưu xong món có mã DU-0xx kế tiếp.
10. Sửa danh mục → có ô **Tiền tố mã món** (DU). Đổi thành "BIA" → thêm món mới vào danh mục → mã BIA-001; các món cũ giữ mã DU-…
11. Tạo danh mục mới "Lẩu" → tự có tiền tố "L".

## Thu ngân
12. Đăng nhập thu ngân → Thực đơn (Tạm hết): hiện mã món; gõ mã vào ô tìm ra đúng món. Không có ô sửa mã/nhãn.

## Mini App (sau khi merge vào worktree Bảo Lương + zmp deploy)
13. Món gắn **Best seller** / **Món của quán** hiện nhãn nhỏ màu chủ đạo của quán trên thẻ món (cả dạng lưới lẫn danh sách) và trong bảng chọn tuỳ chọn món.
14. Món không có nhãn không hiện gì; khách KHÔNG thấy mã món.

**→ Báo:** `PA-4 PASS` hoặc số bài FAIL kèm ảnh.
```

- [ ] **Step 3: Commit** — `git add docs/testing/pos-admin-complete/PA-4.md && git commit -m "docs: checklist test PA-4"`
- [ ] **Step 4: DỪNG** — báo anh Tú test admin theo PA-4.md (bài 1–12). Bài 13–14 cần merge `main` vào worktree Bảo Lương rồi `zmp deploy` — nhắc anh chọn **Development** (tự test) hay **Testing** (memory `feedback_zmp_deploy_status`), và PHẢI merge trước khi deploy (memory `feedback_deploy_can_merge_worktree_truoc`).
