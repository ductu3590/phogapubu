# Topping v2 (kho dùng chung) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Chuyển topping từ per-món (v1, đã trên main) sang **kho topping dùng chung** + mỗi món **tick chọn** topping áp dụng (nhiều-nhiều).

**Architecture:** Bảng `toppings` (kho) + bảng nối `menu_item_toppings(menu_item_id, topping_id, store_id)` (2 composite FK chống lệch store). RPC `create_order` v3 validate topping qua JOIN bảng nối. Admin: khu "Topping" trong trang menu + checkbox chọn topping trong modal sửa món. Mini-app: chỉ đổi cách load (join qua bảng nối); sheet/cart/checkout/đơn/bếp giữ nguyên.

**Spec:** `docs/superpowers/specs/2026-06-30-menu-toppings-design.md` mục 11 (v2). Làm trên nhánh `main` (trunk tích hợp hiện tại).

**Testing gate:** mini-app `tsc --noEmit` (baseline 147, không thêm lỗi mới); admin `tsc --noEmit` = 0; admin `npx vitest run` (2/2); admin `npm run build`. Migration áp prod qua Supabase MCP (đã được phép). Commit từng task, trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

**Bối cảnh quan trọng:** `admin-web/app/admin/menu/menu-client.tsx` đang có CẢ drag-sort (codex) LẪN v1 ToppingEditor. v2 phải **gỡ phần v1 ToppingEditor**, thêm khu Topping + checkbox selector, **KHÔNG phá drag-sort**. Luôn đọc file hiện tại trước khi sửa.

---

## Task 1: Migration 016 — kho topping + bảng nối + RPC v3

**File:** Create `supabase/migrations/016_toppings_shared.sql`

- [ ] **Step 1:** Viết file với nội dung:
```sql
-- 016 — Topping v2: kho dùng chung + bảng nối nhiều-nhiều
-- Restructure menu_item_toppings (v1 per-item) → junction. DROP data test cũ (chấp nhận).
-- Idempotent rerun-safe.

-- 1) Bảng kho toppings
CREATE TABLE IF NOT EXISTS toppings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name         text NOT NULL,
  price        int  NOT NULL DEFAULT 0 CHECK (price >= 0),
  is_available boolean NOT NULL DEFAULT true,
  sort_order   int  NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'toppings_id_store_uniq') THEN
    ALTER TABLE toppings ADD CONSTRAINT toppings_id_store_uniq UNIQUE (id, store_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_toppings_store ON toppings (store_id, is_available, sort_order);

-- 2) Restructure menu_item_toppings → junction (drop bảng v1 per-item)
DROP TABLE IF EXISTS menu_item_toppings;
CREATE TABLE menu_item_toppings (
  menu_item_id uuid NOT NULL,
  topping_id   uuid NOT NULL,
  store_id     uuid NOT NULL,
  PRIMARY KEY (menu_item_id, topping_id),
  CONSTRAINT mit_item_fkey    FOREIGN KEY (menu_item_id, store_id) REFERENCES menu_items(id, store_id) ON DELETE CASCADE,
  CONSTRAINT mit_topping_fkey FOREIGN KEY (topping_id, store_id)   REFERENCES toppings(id, store_id)   ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_mit_topping ON menu_item_toppings (topping_id);
CREATE INDEX IF NOT EXISTS idx_mit_item    ON menu_item_toppings (menu_item_id);

-- 3) RLS
ALTER TABLE toppings ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_item_toppings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_toppings" ON toppings;
CREATE POLICY "anon_read_toppings" ON toppings FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "auth_read_toppings" ON toppings;
CREATE POLICY "auth_read_toppings" ON toppings FOR SELECT TO authenticated USING (is_operator());
DROP POLICY IF EXISTS "anon_read_mit" ON menu_item_toppings;
CREATE POLICY "anon_read_mit" ON menu_item_toppings FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "auth_read_mit" ON menu_item_toppings;
CREATE POLICY "auth_read_mit" ON menu_item_toppings FOR SELECT TO authenticated USING (is_operator());
-- Ghi: chỉ service-role (bypass RLS). Không policy kitchen (đọc snapshot order_items).

-- 4) RPC create_order v3 (validate topping qua JOIN bảng nối)
CREATE OR REPLACE FUNCTION create_order(
  p_store_id uuid, p_table_id uuid DEFAULT NULL, p_items jsonb DEFAULT NULL,
  p_payment_method text DEFAULT 'zalopay', p_zalo_user_id text DEFAULT NULL, p_note text DEFAULT NULL,
  p_order_type text DEFAULT 'dine_in', p_customer_name text DEFAULT NULL,
  p_customer_phone text DEFAULT NULL, p_delivery_address text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order orders%ROWTYPE; v_total int := 0; v_token text := gen_random_uuid()::text;
  v_item jsonb; v_menu menu_items%ROWTYPE; v_qty int;
  v_topping_ids uuid[]; v_item_toppings jsonb; v_topping_total int; v_topping_count int;
BEGIN
  IF p_payment_method NOT IN ('zalopay','cash') THEN RAISE EXCEPTION 'payment_method không hợp lệ: %', p_payment_method; END IF;
  IF p_order_type NOT IN ('dine_in','pickup','delivery') THEN RAISE EXCEPTION 'order_type không hợp lệ: %', p_order_type; END IF;

  IF p_order_type = 'dine_in' THEN
    IF p_table_id IS NULL THEN RAISE EXCEPTION 'Đơn tại bàn cần có table_id'; END IF;
    IF NOT EXISTS (SELECT 1 FROM tables WHERE id = p_table_id AND store_id = p_store_id AND is_active = true) THEN
      RAISE EXCEPTION 'Bàn không thuộc quán hoặc không hoạt động'; END IF;
  END IF;

  IF p_order_type IN ('pickup','delivery') THEN
    IF p_customer_name IS NULL THEN RAISE EXCEPTION 'Đơn mang về cần tên khách hàng'; END IF;
    IF p_order_type = 'delivery' THEN
      IF p_customer_phone IS NULL THEN RAISE EXCEPTION 'Đơn ship cần số điện thoại'; END IF;
      IF p_delivery_address IS NULL THEN RAISE EXCEPTION 'Đơn ship cần địa chỉ giao hàng'; END IF;
    END IF;
    IF p_payment_method <> 'zalopay' THEN RAISE EXCEPTION 'Đơn mang về chỉ chấp nhận ZaloPay'; END IF;
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Đơn không có món nào'; END IF;

  INSERT INTO orders (store_id, table_id, total_amount, zalo_user_id, note, payment_method, status, capability_token,
    order_type, customer_name, customer_phone, delivery_address)
  VALUES (p_store_id, p_table_id, 0, p_zalo_user_id, p_note, p_payment_method, 'pending', v_token,
    p_order_type, p_customer_name, p_customer_phone, p_delivery_address)
  RETURNING * INTO v_order;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := COALESCE((v_item->>'quantity')::int, 0);
    IF v_qty <= 0 THEN RAISE EXCEPTION 'Số lượng không hợp lệ'; END IF;

    SELECT * INTO v_menu FROM menu_items
    WHERE id = (v_item->>'menu_item_id')::uuid AND store_id = p_store_id AND is_available = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'Món không thuộc quán hoặc ngừng bán: %', v_item->>'menu_item_id'; END IF;

    v_item_toppings := '[]'::jsonb; v_topping_total := 0;
    IF v_item ? 'topping_ids' AND jsonb_typeof(v_item->'topping_ids') = 'array'
       AND jsonb_array_length(v_item->'topping_ids') > 0 THEN
      SELECT array_agg(DISTINCT value::uuid) INTO v_topping_ids
        FROM jsonb_array_elements_text(v_item->'topping_ids');
      SELECT
        COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'price',t.price) ORDER BY t.sort_order, t.created_at), '[]'::jsonb),
        COALESCE(SUM(t.price),0), COUNT(*)
      INTO v_item_toppings, v_topping_total, v_topping_count
      FROM toppings t
      JOIN menu_item_toppings mit ON mit.topping_id = t.id AND mit.menu_item_id = v_menu.id
      WHERE t.id = ANY(v_topping_ids) AND t.store_id = p_store_id AND t.is_available = true;
      IF v_topping_count <> array_length(v_topping_ids,1) THEN
        RAISE EXCEPTION 'Topping không hợp lệ / chưa gán cho món / ngừng bán: %', v_menu.name; END IF;
    END IF;

    INSERT INTO order_items (order_id, menu_item_id, item_name, item_price, quantity, note, selected_toppings)
    VALUES (v_order.id, v_menu.id, v_menu.name, v_menu.price, v_qty, v_item->>'note', v_item_toppings);
    v_total := v_total + (v_menu.price + v_topping_total) * v_qty;
  END LOOP;

  UPDATE orders SET total_amount = v_total WHERE id = v_order.id RETURNING * INTO v_order;
  RETURN to_jsonb(v_order);
END; $$;
REVOKE ALL ON FUNCTION create_order(uuid,uuid,jsonb,text,text,text,text,text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION create_order(uuid,uuid,jsonb,text,text,text,text,text,text,text) TO anon;
```

- [ ] **Step 2:** Áp qua Supabase MCP `apply_migration` (name `016_toppings_shared`, project `dlkgdpexjtyynbotkwka`).
- [ ] **Step 3:** Verify `execute_sql`:
```sql
SELECT
 (SELECT count(*) FROM information_schema.tables WHERE table_name='toppings') AS has_toppings,
 (SELECT count(*) FROM information_schema.columns WHERE table_name='menu_item_toppings' AND column_name='topping_id') AS is_junction,
 (SELECT count(*) FROM pg_constraint WHERE conname='mit_topping_fkey') AS has_fk;
```
Expected: `has_toppings=1, is_junction=1, has_fk=1`.
- [ ] **Step 4:** Commit `supabase/migrations/016_toppings_shared.sql`:
```
git add supabase/migrations/016_toppings_shared.sql
git commit -m "feat: migration 016 topping dùng chung (kho toppings + bảng nối + RPC v3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Types — bảng toppings + junction (mini-app + admin)

**Files:** Modify `mini-app/src/types/database.types.ts`; check `admin-web/types/database.types.ts`.

- [ ] **Step 1:** Trong `mini-app/src/types/database.types.ts`: thay block `menu_item_toppings` (v1 per-item Row) thành junction + thêm block `toppings`:
```ts
      toppings: {
        Row: { id: string; store_id: string; name: string; price: number; is_available: boolean; sort_order: number; created_at: string }
        Insert: Omit<Database['public']['Tables']['toppings']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['toppings']['Insert']>
        Relationships: []
      }
      menu_item_toppings: {
        Row: { menu_item_id: string; topping_id: string; store_id: string }
        Insert: Database['public']['Tables']['menu_item_toppings']['Row']
        Update: Partial<Database['public']['Tables']['menu_item_toppings']['Row']>
        Relationships: []
      }
```
(`Product.toppings`, `OrderItem.selectedToppings`, `order_items.selected_toppings` GIỮ NGUYÊN — không đổi.)
- [ ] **Step 2:** `admin-web/types/database.types.ts`: nếu file có khai báo bảng (typed client) thì thêm `toppings` + sửa `menu_item_toppings` tương tự; nếu client untyped (admin v1 dùng `.from('menu_item_toppings')` không lỗi type) thì bỏ qua. Kiểm bằng admin `tsc`.
- [ ] **Step 3:** Verify: mini-app `tsc` (147, không thêm lỗi mới), admin `tsc` (0). Commit cả 2 file (hoặc 1 nếu admin không cần):
```
git add mini-app/src/types/database.types.ts admin-web/types/database.types.ts
git commit -m "feat: types topping v2 (bảng toppings + menu_item_toppings junction)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Admin server actions — kho topping + gán link (thay v1)

**File:** Modify `admin-web/lib/actions/menu.ts`

- [ ] **Step 1:** GỠ 3 action v1 `addTopping`, `updateTopping`, `deleteTopping` (per-item). Sửa `assertToppingInStore` để tra bảng `toppings` (thay vì bảng cũ). Thêm:
```ts
// Kho topping dùng chung
export async function addPoolTopping(name: string, price: number) {
  const storeId = await getStoreId()
  const admin = createAdminClient()
  const { data: maxRow } = await admin.from('toppings').select('sort_order')
    .eq('store_id', storeId).order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const nextSort = (maxRow?.sort_order ?? -1) + 1
  const { error } = await admin.from('toppings').insert({
    store_id: storeId, name: name.trim(), price: Math.max(0, Math.round(price)),
    is_available: true, sort_order: nextSort,
  })
  if (error) throw new Error(`addPoolTopping: ${error.message}`)
  revalidatePath('/admin/menu')
}

export async function updatePoolTopping(toppingId: string, patch: { name?: string; price?: number; is_available?: boolean }) {
  const storeId = await getStoreId()
  await assertToppingInStore(toppingId, storeId)
  const admin = createAdminClient()
  const update: Record<string, unknown> = {}
  if (patch.name !== undefined) update.name = patch.name.trim()
  if (patch.price !== undefined) update.price = Math.max(0, Math.round(patch.price))
  if (patch.is_available !== undefined) update.is_available = patch.is_available
  const { error } = await admin.from('toppings').update(update).eq('id', toppingId)
  if (error) throw new Error(`updatePoolTopping: ${error.message}`)
  revalidatePath('/admin/menu')
}

export async function deletePoolTopping(toppingId: string) {
  const storeId = await getStoreId()
  await assertToppingInStore(toppingId, storeId)
  const admin = createAdminClient()
  const { error } = await admin.from('toppings').delete().eq('id', toppingId)
  if (error) throw new Error(`deletePoolTopping: ${error.message}`)
  revalidatePath('/admin/menu')
}

// Gán/thay toàn bộ topping cho 1 món (replace-all link)
export async function setMenuItemToppings(menuItemId: string, toppingIds: string[]) {
  const storeId = await getStoreId()
  await assertMenuItemInStore(menuItemId, storeId)
  const admin = createAdminClient()
  const ids = [...new Set(toppingIds)]
  if (ids.length > 0) {
    const { data, error } = await admin.from('toppings').select('id').eq('store_id', storeId).in('id', ids)
    if (error) throw new Error(`setMenuItemToppings(check): ${error.message}`)
    if ((data?.length ?? 0) !== ids.length) throw new Error('Có topping không thuộc quán')
  }
  // Xoá hết link cũ rồi insert link mới
  const { error: delErr } = await admin.from('menu_item_toppings').delete().eq('menu_item_id', menuItemId)
  if (delErr) throw new Error(`setMenuItemToppings(del): ${delErr.message}`)
  if (ids.length > 0) {
    const rows = ids.map((tid) => ({ menu_item_id: menuItemId, topping_id: tid, store_id: storeId }))
    const { error: insErr } = await admin.from('menu_item_toppings').insert(rows)
    if (insErr) throw new Error(`setMenuItemToppings(ins): ${insErr.message}`)
  }
  revalidatePath('/admin/menu')
}
```
`assertToppingInStore` sửa thành (tra `toppings`):
```ts
async function assertToppingInStore(toppingId: string, storeId: string): Promise<void> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('toppings').select('id, store_id').eq('id', toppingId).single()
  if (error || !data) throw new Error('Không tìm thấy topping')
  if (data.store_id !== storeId) throw new Error('Topping không thuộc quán của bạn')
}
```
- [ ] **Step 2:** Verify admin `tsc` = 0 (sẽ còn lỗi cho tới khi menu-client bỏ import v1 — Task 5; nếu lỗi do menu-client còn import addTopping…, đó là dự kiến, Task 5 làm liền sau). Nếu tách commit khiến tsc đỏ tạm, ghi nhận và làm Task 5 ngay.
- [ ] **Step 3:** Commit:
```
git add admin-web/lib/actions/menu.ts
git commit -m "feat: server actions kho topping + setMenuItemToppings (thay v1 per-item)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Admin page.tsx — load kho topping + link của món

**File:** Modify `admin-web/app/admin/menu/page.tsx`

- [ ] **Step 1:** Sửa query để: (a) lấy `menu_item_toppings(topping_id)` cho mỗi món (biết món gán topping nào), (b) lấy toàn bộ kho `toppings` của store. Truyền cả 2 xuống `MenuClient`.
```ts
  const { data: categories } = await supabase
    .from('menu_categories')
    .select('*, menu_items(*, menu_item_toppings(topping_id))')
    .eq('store_id', storeId).eq('is_active', true).order('sort_order')

  const { data: toppings } = await supabase
    .from('toppings')
    .select('id, name, price, is_available, sort_order')
    .eq('store_id', storeId).order('sort_order')
```
Và truyền `toppings={toppings ?? []}` vào `<MenuClient ... />` (thêm prop).
- [ ] **Step 2:** Verify admin `tsc` (sẽ 0 sau Task 5 thêm prop type). Commit:
```
git add admin-web/app/admin/menu/page.tsx
git commit -m "feat: admin menu load kho topping + link topping của món

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Admin menu-client — khu Topping + checkbox chọn topping cho món (gỡ v1)

**File:** Modify `admin-web/app/admin/menu/menu-client.tsx`

> ĐỌC file hiện tại trước. File đang có drag-sort (codex) + v1 ToppingEditor. KHÔNG phá drag-sort.

- [ ] **Step 1: Gỡ v1.** Xoá component `ToppingEditor` (v1) và chỗ render nó trong modal sửa món. Xoá import `addTopping, updateTopping, deleteTopping`. Xoá type `Topping` cũ nếu chỉ phục vụ v1 (sẽ khai báo lại bên dưới). Xoá field `menu_item_toppings?: Topping[]` kiểu cũ trên `MenuItem` (sẽ thay bằng kiểu link).

- [ ] **Step 2: Prop + type mới.**
```tsx
import { addPoolTopping, updatePoolTopping, deletePoolTopping, setMenuItemToppings } from '@/lib/actions/menu'
type Topping = { id: string; name: string; price: number; is_available: boolean; sort_order: number }
// MenuItem.menu_item_toppings giờ là mảng link { topping_id }
type MenuItem = { /* ...các field cũ... */; menu_item_toppings?: { topping_id: string }[] }
```
`MenuClient` nhận thêm prop `toppings: Topping[]`.

- [ ] **Step 3: Sidebar khu Topping.** Dưới list danh mục (trước/sau nút "Thêm danh mục"), thêm nút sentinel:
```tsx
        <button
          onClick={() => setSelectedCatId('__toppings__')}
          className={`mt-2 w-full px-4 py-2.5 text-left text-sm font-medium ${selectedCatId === '__toppings__' ? 'bg-orange-50 text-orange-600' : 'text-gray-600 hover:bg-gray-100'}`}
        >🧀 Topping <span className="ml-1 text-xs text-gray-400">({toppings.length})</span></button>
```
Cột phải: khi `selectedCatId === '__toppings__'` → render `<ToppingPool toppings={toppings} router={router} />` thay cho danh sách món.

- [ ] **Step 4: Component `ToppingPool`** (cuối file) — quản kho:
```tsx
function ToppingPool({ toppings, router }: { toppings: Topping[]; router: ReturnType<typeof useRouter> }) {
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState(''); const [price, setPrice] = useState('')
  const add = () => {
    const n = name.trim(); const p = parseInt(price, 10)
    if (!n || Number.isNaN(p) || p < 0) { alert('Nhập tên và giá topping hợp lệ'); return }
    startTransition(async () => { await addPoolTopping(n, p); setName(''); setPrice(''); router.refresh() })
  }
  const toggle = (t: Topping) => startTransition(async () => { await updatePoolTopping(t.id, { is_available: !t.is_available }); router.refresh() })
  const del = (t: Topping) => { if (!confirm(`Xoá topping "${t.name}"? Sẽ gỡ khỏi mọi món.`)) return
    startTransition(async () => { await deletePoolTopping(t.id); router.refresh() }) }
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-gray-100 px-5 py-3"><p className="font-semibold text-gray-700">🧀 Kho topping</p></div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-2">
          {toppings.slice().sort((a,b)=>a.sort_order-b.sort_order).map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
              <button onClick={() => toggle(t)} disabled={isPending}
                className={`h-6 w-11 flex-shrink-0 rounded-full ${t.is_available ? 'bg-green-500' : 'bg-gray-300'}`}
                title={t.is_available ? 'Đang bán — bấm để tạm hết' : 'Tạm hết — bấm để bán lại'}>
                <span className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${t.is_available ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
              </button>
              <span className={`min-w-0 flex-1 truncate font-medium ${t.is_available ? 'text-gray-900' : 'text-gray-400 line-through'}`}>{t.name}</span>
              <span className="flex-shrink-0 font-semibold text-gray-700">{formatVND(t.price)}</span>
              <button onClick={() => del(t)} disabled={isPending} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-40" title="Xoá">🗑️</button>
            </div>
          ))}
          {toppings.length === 0 && <p className="px-1 py-6 text-center text-sm text-gray-400">Chưa có topping nào trong kho</p>}
        </div>
      </div>
      <div className="border-t border-gray-100 p-4">
        <div className="flex flex-col gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên topping (VD: Thêm trứng)" className="input" />
          <div className="flex gap-2">
            <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" min="0" placeholder="Giá (VNĐ)" className="input min-w-0 flex-1" />
            <button onClick={add} disabled={isPending} className="flex-shrink-0 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-40">+ Thêm</button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Checkbox chọn topping trong modal sửa món.** Component `ItemToppingPicker` (cuối file) — checkbox toàn kho, tick = gán:
```tsx
function ItemToppingPicker({ item, toppings, router }: { item: MenuItem; toppings: Topping[]; router: ReturnType<typeof useRouter> }) {
  const [isPending, startTransition] = useTransition()
  const linked = new Set((item.menu_item_toppings ?? []).map((l) => l.topping_id))
  const toggle = (toppingId: string) => {
    const next = new Set(linked); next.has(toppingId) ? next.delete(toppingId) : next.add(toppingId)
    startTransition(async () => { await setMenuItemToppings(item.id, [...next]); router.refresh() })
  }
  return (
    <div className="mt-2 border-t border-gray-100 pt-3">
      <p className="mb-2 text-sm font-semibold text-gray-700">Topping của món (tick để gán)</p>
      {toppings.length === 0 && <p className="text-xs text-gray-400">Kho topping trống — thêm ở khu "🧀 Topping" trước.</p>}
      <div className="flex flex-col gap-1.5">
        {toppings.slice().sort((a,b)=>a.sort_order-b.sort_order).map((t) => (
          <label key={t.id} className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={linked.has(t.id)} disabled={isPending} onChange={() => toggle(t.id)} className="h-4 w-4" />
            <span className="flex-1 text-gray-800">{t.name}</span>
            <span className="text-gray-500">{formatVND(t.price)}</span>
          </label>
        ))}
      </div>
    </div>
  )
}
```
Render `<ItemToppingPicker item={editItem} toppings={toppings} router={router} />` trong modal sửa món, thay chỗ `<ToppingEditor>` cũ.

- [ ] **Step 6: Badge** dòng món = số topping đã gán: đổi `item.menu_item_toppings?.length ?? 0` (giờ là mảng link) — vẫn đúng vì `.length` của mảng link. Giữ badge.

- [ ] **Step 7: Auto-open edit sau khi thêm món** — object `setEditItem({...})` dùng `menu_item_toppings: []` (mảng link rỗng) cho khớp type mới.

- [ ] **Step 8:** Verify admin `tsc` = 0 + `npx vitest run` (drag-sort 2/2 vẫn pass) + `npm run build`. Commit:
```
git add admin-web/app/admin/menu/menu-client.tsx
git commit -m "feat: admin khu kho topping + checkbox gán topping cho món (gỡ v1 per-item)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Mini-app — load topping qua bảng nối

**File:** Modify `mini-app/src/services/category/category.api.ts`

- [ ] **Step 1:** Đổi select sang join qua bảng nối + sửa `mapToppings` đọc object `toppings` lồng:
```ts
      .select(
        "*, menu_items(*, menu_item_toppings(toppings(id, name, price, is_available, sort_order)))",
      )
```
`mapToppings` (nhận mảng link, mỗi link có `toppings` lồng):
```ts
function mapToppings(links: Record<string, unknown>[] | null | undefined): Topping[] {
  return (links ?? [])
    .map((l) => l.toppings as Record<string, unknown> | null)
    .filter((t): t is Record<string, unknown> => !!t && t.is_available === true)
    .sort((a, b) => (a.sort_order as number) - (b.sort_order as number))
    .map((t) => ({ id: t.id as string, name: t.name as string, price: t.price as number }));
}
```
`mapProduct`: `toppings: mapToppings(row.menu_item_toppings as Record<string, unknown>[] | undefined)`.
- [ ] **Step 2:** Verify mini-app `tsc` (147, không thêm lỗi). Commit:
```
git add mini-app/src/services/category/category.api.ts
git commit -m "feat: mini-app load topping qua bảng nối (kho dùng chung)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Verify tổng + cập nhật TESTING.md

- [ ] **Step 1:** mini-app `tsc` (147), admin `tsc` (0), `npx vitest run` (2/2), admin `npm run build` (exit 0).
- [ ] **Step 2:** Sửa mục "TÍNH NĂNG TOPPING" trong `TESTING.md`: đổi checklist admin sang luồng mới (khu "🧀 Topping" thêm vào kho; trong sửa món tick checkbox gán). Mini-app/đơn/bếp giữ nguyên.
- [ ] **Step 3:** Commit `TESTING.md`.
- [ ] **Step 4: DỪNG** — báo anh Tú test theo TESTING.md mục Topping (v2). Nhắc cần `zmp deploy` mini-app trước khi test đơn thật.

## Rủi ro
- Migration 016 DROP `menu_item_toppings` v1 (mất topping test) — đã được duyệt.
- Task 3↔5 đi cặp (gỡ v1 actions + gỡ import v1 ở menu-client) — làm liền, đừng để tsc đỏ giữa chừng kéo dài.
- `is_operator()` đã có; bảng nối có policy authenticated SELECT để admin đọc link của món.
