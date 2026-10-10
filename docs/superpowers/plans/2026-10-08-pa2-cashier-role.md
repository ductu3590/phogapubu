# PA-2 — Vai trò Thu ngân — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm vai trò `store_cashier`: thao tác POS như chủ quán (duyệt/từ chối lượt, in, thu tiền, mâm, bỏ/tặng món, món ghi tay), xem Báo cáo ngày, quản lý Đặt bàn, bật/tắt "Tạm hết" — KHÔNG sửa menu/giá, cài đặt, bàn & QR, nhân viên, ưu đãi, vòng quay, sơ đồ.

**Architecture:** Một hàm SQL `is_store_pos_operator(store)` = chủ quán HOẶC thu ngân. Migration **vá tại chỗ** đúng 16 RPC POS/đặt bàn đang gọi `is_store_owner_of(` bằng cách đọc định nghĩa ĐANG CHẠY trên prod (`pg_get_functiondef`), thay chuỗi, `EXECUTE` lại — không chép thân hàm cũ nên không thể lùi phiên bản. Phía Next gom luật vai trò vào MỘT module thuần `lib/auth/roles.ts` dùng chung cho middleware, đăng nhập, guard server, nav.

**Tech Stack:** Next.js 16 App Router, Supabase Postgres (plpgsql, RLS), Vitest 4, lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-07-pos-admin-complete-design.md` (mục PA-2). Quyết định đã chốt: thu ngân được bỏ/tặng món (bắt buộc lý do, ghi tên); ngoài POS được Báo cáo + Đặt bàn + bật/tắt Tạm hết.

## Global Constraints

- Chữ người dùng thấy và comment logic phức tạp: tiếng Việt. Không hardcode ID/key/URL.
- RLS / RPC là khoá thật; guard Next chỉ để báo lỗi đẹp và chặn sớm. Mặc định **giữ owner-only** khi không chắc.
- `is_store_owner_of` GIỮ nguyên nghĩa "chỉ chủ quán" (không đổi thân hàm này).
- Hàm sống chỉ được sửa bằng cách vá định nghĩa hiện tại trên prod (helper `pg_temp` trong migration), không chép lại thân hàm từ file migration cũ (quyết định 2026-09-01).
- Migration áp prod bằng Supabase MCP `apply_migration` (project `dlkgdpexjtyynbotkwka`), được phép tự chạy.
- Không poll bằng server action; POS đọc định kỳ từ trình duyệt (`lib/pos-browser-reads.ts`) giữ nguyên.
- Lệnh từ `admin-web/`: `npx vitest run <file>`, `npx tsc --noEmit`, `npx eslint <files>`, `npm run build`.
- Commit `feat:/fix:/docs:` + dòng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Test tay trên **Bảo Lương**: chủ `baoluong@mevo.vn`, nhân viên `baoluong-nv@mevo.vn` (dùng tạm làm thu ngân khi test SQL, trong transaction ROLLBACK).

## Review Focus

1. **Thu ngân gọi thẳng RPC/bảng cấu hình** (sửa giá món, đổi cài đặt quy trình, lưu sơ đồ, thêm bàn, sửa voucher) bằng client Supabase → phải bị DB từ chối, không chỉ bị ẩn nút. → test SQL Task 2 Step 4.
2. **Thu ngân mở thẳng URL trang cấm** (`/admin/settings`, `/admin/tables`, `/admin/staff`, `/admin/vouchers`, `/admin/spin`, `/admin/orders`, `/admin/kitchen`) hoặc qua hộp thoại → về `/admin/pos`, không lộ dữ liệu. → test `adminPathAllowed` Task 1 + bài tay.
3. **Đổi vai trò khi người đó đang đăng nhập** (cashier → staff hoặc bị vô hiệu hoá) → lần tải trang kế tiếp bị chuyển đúng khu; RPC POS bị chặn ngay vì DB đọc vai trò mỗi lần gọi. → test SQL Task 2 + bài tay.
4. **Thêm thu ngân bằng email đã là chủ quán / nhân viên quán khác / superadmin** → từ chối, không chiếm quyền. → test `createStoreStaff` Task 6.
5. **Nhật ký đặt bàn / thu tiền do thu ngân làm** → ghi đúng người (`actor_id`/`payment_received_by` = uid thu ngân), không lỗi CHECK constraint. → test SQL Task 2 Step 4 (arrive/no-show) + bài tay.

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `admin-web/lib/auth/roles.ts` (mới) | Luật vai trò THUẦN: parse dòng operator, đích về, ai vào khu nào, trang admin nào thu ngân được vào |
| `admin-web/lib/auth/operator.ts` (sửa) | Thêm `store_cashier`; `requirePosOperatorStoreId`, `requireAdminPageOrRedirect` |
| `admin-web/proxy.ts`, `admin-web/app/(auth)/login/actions.ts` (sửa) | Dùng `roles.ts` |
| `supabase/migrations/093_store_cashier_role.sql` (mới) | Role, `is_store_pos_operator`, vá 16 RPC + 3 hàm có literal role, RLS `table_areas`, RPC `set_menu_item_available` |
| `admin-web/lib/actions/*.ts` (sửa) | Đổi guard đường POS sang owner-hoặc-cashier |
| `admin-web/app/admin/admin-nav.tsx`, `config-dialog.tsx`, `config-modal.tsx`, `layout.tsx` (sửa) | Rail / Thêm / tab theo vai trò |
| `admin-web/app/admin/*/page.tsx` (sửa) | Guard trang theo vai trò |
| `admin-web/app/admin/menu/menu-availability-client.tsx` (mới) | Danh sách món chỉ có công tắc Tạm hết (thu ngân) |
| `admin-web/lib/actions/staff.ts`, `app/admin/staff/*` (sửa) | Chọn / đổi vai trò Nhân viên phục vụ ↔ Thu ngân |
| `admin-web/app/mevo/accounts/accounts-client.tsx`, `app/mevo/stores/[storeId]/page.tsx`, `lib/actions/mevo-accounts.ts` (sửa) | Nhãn "Thu ngân" |
| `docs/testing/pos-admin-complete/PA-2.md` (mới) | Checklist test tay |

---

### Task 1: Luật vai trò thuần `lib/auth/roles.ts`

**Files:**
- Create: `admin-web/lib/auth/roles.ts`
- Test: `admin-web/lib/auth/roles.test.ts`

**Interfaces:**
- Produces:
  - `type OperatorRole = 'mevo_superadmin' | 'store_owner' | 'store_staff' | 'store_cashier'`
  - `parseOperatorRow(op: { role?: string | null; store_id?: string | null; is_active?: boolean | null } | null | undefined): { role: OperatorRole; storeId: string | null } | null`
  - `homeForRole(role: OperatorRole): string`
  - `canEnterAdmin(role: OperatorRole | null): boolean` (owner, cashier)
  - `canEnterStaffArea(role: OperatorRole | null): boolean` (owner, staff, cashier)
  - `isPosRole(role: OperatorRole | null): boolean` (owner, cashier)
  - `CASHIER_ADMIN_PATHS: readonly string[]`
  - `adminPathAllowed(role: OperatorRole, pathname: string): boolean`
  - `ROLE_LABEL: Record<OperatorRole, string>`

- [ ] **Step 1: Viết test**

```ts
import { describe, expect, it } from 'vitest'
import { adminPathAllowed, canEnterAdmin, canEnterStaffArea, homeForRole, isPosRole, parseOperatorRow, ROLE_LABEL } from './roles'

describe('đọc dòng mevo_operators', () => {
  it('đủ 4 vai trò, đúng ràng buộc store_id', () => {
    expect(parseOperatorRow({ role: 'mevo_superadmin', store_id: null, is_active: true })).toEqual({ role: 'mevo_superadmin', storeId: null })
    expect(parseOperatorRow({ role: 'store_owner', store_id: 's1', is_active: true })).toEqual({ role: 'store_owner', storeId: 's1' })
    expect(parseOperatorRow({ role: 'store_staff', store_id: 's1', is_active: true })).toEqual({ role: 'store_staff', storeId: 's1' })
    expect(parseOperatorRow({ role: 'store_cashier', store_id: 's1', is_active: true })).toEqual({ role: 'store_cashier', storeId: 's1' })
  })
  it('đã vô hiệu hoá / thiếu quán / vai trò lạ → null', () => {
    expect(parseOperatorRow({ role: 'store_cashier', store_id: 's1', is_active: false })).toBeNull()
    expect(parseOperatorRow({ role: 'store_cashier', store_id: null, is_active: true })).toBeNull()
    expect(parseOperatorRow({ role: 'mevo_superadmin', store_id: 's1', is_active: true })).toBeNull()
    expect(parseOperatorRow({ role: 'hacker', store_id: 's1', is_active: true })).toBeNull()
    expect(parseOperatorRow(null)).toBeNull()
  })
  it('is_active null coi như đang bật (giữ hành vi cũ)', () => {
    expect(parseOperatorRow({ role: 'store_owner', store_id: 's1', is_active: null })).toEqual({ role: 'store_owner', storeId: 's1' })
  })
})

describe('khu được vào', () => {
  it('thu ngân về thẳng POS', () => {
    expect(homeForRole('store_cashier')).toBe('/admin/pos')
    expect(homeForRole('store_owner')).toBe('/admin')
    expect(homeForRole('store_staff')).toBe('/staff/order')
    expect(homeForRole('mevo_superadmin')).toBe('/mevo')
  })
  it('admin: chủ quán + thu ngân; khu nhân viên: thêm cả thu ngân (in hoá đơn nằm ở /staff/tables/print)', () => {
    expect(canEnterAdmin('store_cashier')).toBe(true)
    expect(canEnterAdmin('store_staff')).toBe(false)
    expect(canEnterAdmin(null)).toBe(false)
    expect(canEnterStaffArea('store_cashier')).toBe(true)
    expect(canEnterStaffArea('mevo_superadmin')).toBe(false)
    expect(isPosRole('store_cashier')).toBe(true)
    expect(isPosRole('store_staff')).toBe(false)
  })
})

describe('trang admin thu ngân được mở', () => {
  it.each([
    ['/admin/pos', true], ['/admin/pos/print-order', true], ['/admin/dashboard', true],
    ['/admin/reservations', true], ['/admin/menu', true], ['/admin/account', true],
    ['/admin', false], ['/admin/settings', false], ['/admin/tables', false], ['/admin/staff', false],
    ['/admin/vouchers', false], ['/admin/spin', false], ['/admin/orders', false], ['/admin/kitchen', false],
    ['/admin/posx', false], ['/admin/menu-hack', false],
  ])('%s → %s', (path, ok) => {
    expect(adminPathAllowed('store_cashier', path)).toBe(ok)
  })
  it('chủ quán mở được mọi trang admin', () => {
    expect(adminPathAllowed('store_owner', '/admin/settings')).toBe(true)
  })
  it('nhãn tiếng Việt', () => {
    expect(ROLE_LABEL.store_cashier).toBe('Thu ngân')
    expect(ROLE_LABEL.store_staff).toBe('Nhân viên phục vụ')
  })
})
```

- [ ] **Step 2: Chạy → FAIL** (`npx vitest run lib/auth/roles.test.ts`, module not found)

- [ ] **Step 3: Viết `lib/auth/roles.ts`**

```ts
// Luật vai trò vận hành (PA-2, 2026-10-08) — MỘT chỗ cho middleware, đăng nhập, guard server và nav.
// Thuần (không gọi mạng) để test được. RLS / RPC trong DB mới là khoá thật; đây là cổng UX.

export type OperatorRole = 'mevo_superadmin' | 'store_owner' | 'store_staff' | 'store_cashier'

export const ROLE_LABEL: Record<OperatorRole, string> = {
  mevo_superadmin: 'MEVO superadmin',
  store_owner: 'Chủ quán',
  store_staff: 'Nhân viên phục vụ',
  store_cashier: 'Thu ngân',
}

const STORE_ROLES = new Set<OperatorRole>(['store_owner', 'store_staff', 'store_cashier'])

export function parseOperatorRow(
  op: { role?: string | null; store_id?: string | null; is_active?: boolean | null } | null | undefined,
): { role: OperatorRole; storeId: string | null } | null {
  if (!op || op.is_active === false) return null
  if (op.role === 'mevo_superadmin') return op.store_id === null || op.store_id === undefined ? { role: 'mevo_superadmin', storeId: null } : null
  if (STORE_ROLES.has(op.role as OperatorRole) && op.store_id) return { role: op.role as OperatorRole, storeId: op.store_id }
  return null
}

export function homeForRole(role: OperatorRole): string {
  return { mevo_superadmin: '/mevo', store_owner: '/admin', store_staff: '/staff/order', store_cashier: '/admin/pos' }[role]
}

export function canEnterAdmin(role: OperatorRole | null): boolean {
  return role === 'store_owner' || role === 'store_cashier'
}

// Thu ngân vào được khu /staff vì trang in hoá đơn 80mm nằm ở /staff/tables/print (POS + Báo cáo mở nó).
export function canEnterStaffArea(role: OperatorRole | null): boolean {
  return role === 'store_owner' || role === 'store_staff' || role === 'store_cashier'
}

export function isPosRole(role: OperatorRole | null): boolean {
  return role === 'store_owner' || role === 'store_cashier'
}

/** Trang /admin thu ngân được mở (kể cả trang con). Thực đơn: chỉ có công tắc Tạm hết. */
export const CASHIER_ADMIN_PATHS = ['/admin/pos', '/admin/dashboard', '/admin/reservations', '/admin/menu', '/admin/account'] as const

export function adminPathAllowed(role: OperatorRole, pathname: string): boolean {
  if (role === 'store_owner') return true
  if (role !== 'store_cashier') return false
  return CASHIER_ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}
```

- [ ] **Step 4: Chạy → PASS** (`npx vitest run lib/auth/roles.test.ts`)

- [ ] **Step 5: Commit**

```bash
git add admin-web/lib/auth/roles.ts admin-web/lib/auth/roles.test.ts
git commit -m "feat: luat vai tro thu ngan dung chung (PA-2)"
```

---

### Task 2: Migration 093 — role, `is_store_pos_operator`, vá RPC

**Files:**
- Create: `supabase/migrations/093_store_cashier_role.sql`

**Interfaces:**
- Produces (SQL): `public.is_store_pos_operator(p_store_id uuid) RETURNS boolean`; `public.set_menu_item_available(p_item_id uuid, p_available boolean) RETURNS jsonb` (`{ok:true, is_available}`); `mevo_operators.role` nhận `'store_cashier'`.

Danh sách 16 RPC chuyển sang `is_store_pos_operator` (đã rà prod 2026-10-08 — mọi hàm đang gọi `is_store_owner_of` đều là thao tác POS/đặt bàn; quyền cấu hình dùng `is_store_owner_or_admin` / service-role nên KHÔNG bị ảnh hưởng):
`cancel_store_reservation(uuid,text)`, `close_table_session(uuid,text,text)`, `get_daily_report(uuid,date)`, `get_reservation_preorder_print_job(uuid)`, `list_prearrival_reserved_table_ids(uuid)`, `list_reservation_customer_calls(uuid)`, `list_reservation_preorder_queue(uuid)`, `pos_add_manual_items(uuid,jsonb,uuid)`, `pos_confirm_order(uuid)`, `pos_reject_order(uuid,text,text)`, `pos_restore_order_item(uuid)`, `pos_void_order_item(uuid,text,text)`, `release_reservation_preorder(uuid,integer,uuid)`, `request_reservation_preorder_print(uuid,integer,text,uuid,text)`, `resolve_preorder_waste(uuid,text,uuid)`, `resolve_reservation_customer_call(uuid,text)`.

Ba hàm có literal vai trò cần vá: `reservation_operator_actor_kind(uuid)` (thu ngân → `'owner'` vì CHECK `reservation_events.actor_kind` chỉ nhận customer/owner/mevo/system; người làm vẫn ghi bằng uid), `pos_get_floor_layout()` (thu ngân xem sơ đồ; `pos_save_floor_layout` GIỮ owner-only), `staff_create_order(uuid,jsonb,text,uuid,text)` (thu ngân vào khu /staff nên đặt hộ được).

GIỮ owner-only (không đụng): `pos_save_floor_layout`, `update_store_workflow_settings`, `get_store_workflow_settings`, `revoke_reservation_customer_access`, `confirm_manual_payment`, `redeem_spin_result`, `sweep_abandoned_orders`, mọi RLS dùng `is_store_owner_or_admin`.

- [ ] **Step 1: Viết migration**

`supabase/migrations/093_store_cashier_role.sql`:

```sql
-- 093 (PA-2, 2026-10-08): vai trò Thu ngân (store_cashier).
-- Thu ngân làm được MỌI thao tác POS / đặt bàn / báo cáo như chủ quán; KHÔNG sửa cấu hình (menu, giá,
-- bàn, sơ đồ, cài đặt, nhân viên, ưu đãi, vòng quay) — các quyền đó dùng is_store_owner_or_admin / service-role.
--
-- ⚠️ Cách sửa hàm sống: đọc định nghĩa ĐANG CHẠY (pg_get_functiondef) → thay chuỗi → EXECUTE. Không chép
-- thân hàm từ file migration cũ (chạy lại file cũ sẽ lùi hàm về bản cũ — quyết định 2026-09-01). File này
-- vì thế KHÔNG tự đứng một mình: nó vá lên prod hiện tại; chuỗi cần thay không còn thì DỪNG (raise).

-- 1. Vai trò mới
ALTER TABLE public.mevo_operators DROP CONSTRAINT IF EXISTS mevo_operators_role_check;
ALTER TABLE public.mevo_operators ADD CONSTRAINT mevo_operators_role_check
  CHECK (role = ANY (ARRAY['mevo_superadmin', 'store_owner', 'store_staff', 'store_cashier']));
ALTER TABLE public.mevo_operators DROP CONSTRAINT IF EXISTS mevo_operators_role_store_check;
ALTER TABLE public.mevo_operators ADD CONSTRAINT mevo_operators_role_store_check
  CHECK ((role = 'mevo_superadmin' AND store_id IS NULL)
      OR (role = ANY (ARRAY['store_owner', 'store_staff', 'store_cashier']) AND store_id IS NOT NULL));

-- 2. Người vận hành POS của quán = chủ quán HOẶC thu ngân (đang bật).
CREATE OR REPLACE FUNCTION public.is_store_pos_operator(p_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from mevo_operators
     where user_id = auth.uid()
       and is_active
       and role in ('store_owner', 'store_cashier')
       and store_id = p_store_id
  );
$function$;
REVOKE ALL ON FUNCTION public.is_store_pos_operator(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_store_pos_operator(uuid) TO authenticated;

-- 3. Helper vá tại chỗ (chỉ sống trong phiên chạy migration).
CREATE OR REPLACE FUNCTION pg_temp.mevo_patch(p_sig text, p_from text, p_to text)
RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef(p_sig::regprocedure);
  IF position(p_from IN v_def) = 0 THEN
    RAISE EXCEPTION 'mig 093: % không còn chuỗi cần vá: %', p_sig, p_from;
  END IF;
  EXECUTE replace(v_def, p_from, p_to);
END
$patch$;

-- 4. 16 RPC POS / đặt bàn / báo cáo: chủ quán → chủ quán hoặc thu ngân.
SELECT pg_temp.mevo_patch(sig, 'is_store_owner_of(', 'is_store_pos_operator(')
FROM unnest(ARRAY[
  'public.cancel_store_reservation(uuid,text)',
  'public.close_table_session(uuid,text,text)',
  'public.get_daily_report(uuid,date)',
  'public.get_reservation_preorder_print_job(uuid)',
  'public.list_prearrival_reserved_table_ids(uuid)',
  'public.list_reservation_customer_calls(uuid)',
  'public.list_reservation_preorder_queue(uuid)',
  'public.pos_add_manual_items(uuid,jsonb,uuid)',
  'public.pos_confirm_order(uuid)',
  'public.pos_reject_order(uuid,text,text)',
  'public.pos_restore_order_item(uuid)',
  'public.pos_void_order_item(uuid,text,text)',
  'public.release_reservation_preorder(uuid,integer,uuid)',
  'public.request_reservation_preorder_print(uuid,integer,text,uuid,text)',
  'public.resolve_preorder_waste(uuid,text,uuid)',
  'public.resolve_reservation_customer_call(uuid,text)'
]) AS sig;

-- 5. Ba hàm có literal vai trò.
-- Nhật ký đặt bàn: thu ngân ghi actor_kind 'owner' (CHECK chỉ nhận customer/owner/mevo/system); uid vẫn là thu ngân.
SELECT pg_temp.mevo_patch('public.reservation_operator_actor_kind(uuid)',
  $$IF v_role = 'store_owner' AND v_operator_store = p_store_id THEN RETURN 'owner'; END IF;$$,
  $$IF v_role IN ('store_owner', 'store_cashier') AND v_operator_store = p_store_id THEN RETURN 'owner'; END IF;$$);
-- Sơ đồ POS: thu ngân XEM được; lưu sơ đồ (pos_save_floor_layout) vẫn chỉ chủ quán.
SELECT pg_temp.mevo_patch('public.pos_get_floor_layout()',
  $$AND role = 'store_owner' AND is_active = true;$$,
  $$AND role IN ('store_owner', 'store_cashier') AND is_active = true;$$);
-- Đặt hộ ở khu /staff: thu ngân vào được khu nhân viên nên cũng đặt hộ được.
SELECT pg_temp.mevo_patch('public.staff_create_order(uuid,jsonb,text,uuid,text)',
  $$v_role not in ('store_owner','store_staff')$$,
  $$v_role not in ('store_owner','store_staff','store_cashier')$$);

-- 6. Sơ đồ khu: POS (chủ quán + thu ngân) nghe realtime bảng table_areas.
DROP POLICY IF EXISTS owner_read_table_areas ON public.table_areas;
DROP POLICY IF EXISTS pos_read_table_areas ON public.table_areas;
CREATE POLICY pos_read_table_areas ON public.table_areas
  FOR SELECT TO authenticated USING (public.is_store_pos_operator(store_id));

-- 7. Bật/tắt "Tạm hết" — RPC riêng, KHÔNG mở RLS UPDATE menu_items cho thu ngân (sẽ sửa được giá).
CREATE OR REPLACE FUNCTION public.set_menu_item_available(p_item_id uuid, p_available boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_store uuid;
BEGIN
  IF p_item_id IS NULL OR p_available IS NULL THEN RAISE EXCEPTION 'Thiếu món hoặc trạng thái'; END IF;
  SELECT store_id INTO v_store FROM public.menu_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy món'; END IF;
  IF NOT public.is_store_pos_operator(v_store) THEN RAISE EXCEPTION 'Không có quyền đổi trạng thái món'; END IF;
  UPDATE public.menu_items SET is_available = p_available WHERE id = p_item_id;
  RETURN jsonb_build_object('ok', true, 'is_available', p_available);
END;
$function$;
REVOKE ALL ON FUNCTION public.set_menu_item_available(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_menu_item_available(uuid, boolean) TO authenticated;
```

- [ ] **Step 2: Áp prod** — MCP `apply_migration` name `store_cashier_role`, query = nội dung file. Nếu raise "không còn chuỗi cần vá" → DỪNG, đọc `pg_get_functiondef` hàm đó, sửa chuỗi `p_from` cho khớp, ghi Ruling.

- [ ] **Step 3: Kiểm vá đủ**

```sql
select p.proname,
       pg_get_functiondef(p.oid) ilike '%is_store_owner_of(%' still_owner,
       pg_get_functiondef(p.oid) ilike '%is_store_pos_operator(%' pos_ok
from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f'
  and (pg_get_functiondef(p.oid) ilike '%is_store_owner_of(%' or pg_get_functiondef(p.oid) ilike '%is_store_pos_operator(%')
order by 1;
```

Expected: 16 hàm ở danh sách có `pos_ok=true, still_owner=false`; chỉ còn `is_store_owner_of` tự thân (và không hàm POS nào khác) có `still_owner=true`.

- [ ] **Step 4: Test quyền bằng giả lập thu ngân (ROLLBACK)**

Chạy từng khối bằng `execute_sql` (mỗi khối một transaction riêng, kết thúc `rollback`):

```sql
begin;
update mevo_operators set role='store_cashier'
 where user_id=(select id from auth.users where email='baoluong-nv@mevo.vn');
select set_config('request.jwt.claims', json_build_object('sub',(select id::text from auth.users where email='baoluong-nv@mevo.vn'),'role','authenticated')::text, true);
set local role authenticated;
select public.is_store_pos_operator('2139c162-9677-4cbd-87e3-d2e1ac22e6e8') pos_op,
       public.is_store_owner_of('2139c162-9677-4cbd-87e3-d2e1ac22e6e8') owner_of,
       public.is_store_owner_or_admin('2139c162-9677-4cbd-87e3-d2e1ac22e6e8') owner_admin,
       (public.get_daily_report('2139c162-9677-4cbd-87e3-d2e1ac22e6e8', current_date) ? 'totals') report_ok,
       (public.pos_get_floor_layout() ? 'tables') floor_ok,
       public.set_menu_item_available((select id from menu_items where store_id='2139c162-9677-4cbd-87e3-d2e1ac22e6e8' limit 1), true) toggle_ok;
rollback;
```

Expected: `pos_op=true, owner_of=false, owner_admin=false, report_ok=true, floor_ok=true, toggle_ok={"ok":true,...}`.

Mỗi câu sau (khối riêng, cùng phần đầu `begin; update…; set_config…; set local role authenticated;` rồi `rollback;`) phải **LỖI hoặc ảnh hưởng 0 dòng**:

```sql
update menu_items set price = 1 where store_id='2139c162-9677-4cbd-87e3-d2e1ac22e6e8' returning id;          -- 0 dòng (RLS)
insert into tables(store_id, table_number) values ('2139c162-9677-4cbd-87e3-d2e1ac22e6e8','Hack') returning id; -- lỗi RLS
select public.pos_save_floor_layout(0, '[]'::jsonb, '[]'::jsonb);                                             -- 'Chỉ chủ quán được sửa sơ đồ POS'
select public.update_store_workflow_settings('2139c162-9677-4cbd-87e3-d2e1ac22e6e8', '{}'::jsonb, 'owner');   -- lỗi quyền
update vouchers set code='X' where store_id='2139c162-9677-4cbd-87e3-d2e1ac22e6e8' returning id;              -- 0 dòng
```

Và nhân viên phục vụ (KHÔNG đổi role) vẫn bị chặn POS:

```sql
begin;
select set_config('request.jwt.claims', json_build_object('sub',(select id::text from auth.users where email='baoluong-nv@mevo.vn'),'role','authenticated')::text, true);
set local role authenticated;
select public.is_store_pos_operator('2139c162-9677-4cbd-87e3-d2e1ac22e6e8');   -- false
select public.get_daily_report('2139c162-9677-4cbd-87e3-d2e1ac22e6e8', current_date); -- lỗi 'Không có quyền xem báo cáo quán này'
rollback;
```

Ghi kết quả vào ledger.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/093_store_cashier_role.sql
git commit -m "feat: vai tro thu ngan store_cashier + va 16 RPC POS (PA-2, mig 093)"
```

---

### Task 3: Guard Next dùng luật vai trò mới

**Files:**
- Modify: `admin-web/lib/auth/operator.ts`
- Modify: `admin-web/lib/auth/operator.test.ts`
- Modify: `admin-web/proxy.ts`
- Modify: `admin-web/app/(auth)/login/actions.ts`

**Interfaces:**
- Consumes: Task 1 (`parseOperatorRow`, `homeForRole`, `canEnterAdmin`, `canEnterStaffArea`, `adminPathAllowed`, `isPosRole`).
- Produces:
  - `Operator` thêm nhánh `{ userId: string; role: 'store_cashier'; storeId: string }`
  - `requirePosOperatorStoreId(): Promise<string>` — throw `'Chỉ chủ quán hoặc thu ngân mới thao tác được ở đây'` nếu không phải owner/cashier
  - `requireAdminPageOrRedirect(area: 'owner' | 'pos'): Promise<{ userId: string; role: 'store_owner' | 'store_cashier'; storeId: string }>` — superadmin → `/mevo`; staff → `/staff/order`; cashier + `area='owner'` → `/admin/pos`
  - `requireStaffAreaOrRedirect()` trả thêm `'store_cashier'` trong union role

- [ ] **Step 1: Thêm test vào `operator.test.ts`**

Đổi dòng import thành `const { requireAdminPageOrRedirect, requirePosOperatorStoreId, requireSuperadmin } = await import('./operator')` và đổi mock `next/navigation` để redirect ném lỗi có đường dẫn:

```ts
vi.mock('next/navigation', () => ({ redirect: vi.fn((to: string) => { throw new Error(`REDIRECT:${to}`) }) }))
```

Thêm cuối file:

```ts
describe('thu ngân (PA-2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.user.value = { id: 'c1' }
    mocks.operatorRow.value = { role: 'store_cashier', store_id: 's1', is_active: true }
  })

  it('requirePosOperatorStoreId cho thu ngân qua', async () => {
    await expect(requirePosOperatorStoreId()).resolves.toBe('s1')
  })

  it('nhân viên phục vụ bị chặn ở thao tác POS', async () => {
    mocks.operatorRow.value = { role: 'store_staff', store_id: 's1', is_active: true }
    await expect(requirePosOperatorStoreId()).rejects.toThrow('Chỉ chủ quán hoặc thu ngân')
  })

  it('trang chỉ dành cho chủ quán → thu ngân về /admin/pos', async () => {
    await expect(requireAdminPageOrRedirect('owner')).rejects.toThrow('REDIRECT:/admin/pos')
  })

  it('trang POS → thu ngân vào được', async () => {
    await expect(requireAdminPageOrRedirect('pos')).resolves.toEqual({ userId: 'c1', role: 'store_cashier', storeId: 's1' })
  })

  it('thu ngân đã bị vô hiệu hoá → về đăng nhập', async () => {
    mocks.operatorRow.value = { role: 'store_cashier', store_id: 's1', is_active: false }
    await expect(requireAdminPageOrRedirect('pos')).rejects.toThrow('REDIRECT:/login?error=not_operator')
  })
})
```

Nếu các bài `requireSuperadmin` cũ dựa trên `redirect` không ném, chúng không gọi redirect nên không bị ảnh hưởng — chạy để xác nhận.

- [ ] **Step 2: Chạy → FAIL** (`npx vitest run lib/auth/operator.test.ts`: not a function)

- [ ] **Step 3: Sửa `operator.ts`**

- Import `parseOperatorRow, isPosRole` từ `./roles`.
- Kiểu `Operator` thêm `| { userId: string; role: 'store_cashier'; storeId: string }`.
- Thay thân `toOperator` bằng:

```ts
function toOperator(userId: string, op: { role: string; store_id: string | null }): Operator | null {
  const parsed = parseOperatorRow({ ...op, is_active: true })
  if (!parsed) return null
  return { userId, role: parsed.role, storeId: parsed.storeId } as Operator
}
```

- Thêm sau `requireStoreOwnerStoreId`:

```ts
// Thao tác POS / đặt bàn / báo cáo / bật tắt Tạm hết (PA-2): chủ quán HOẶC thu ngân.
// Chỉ để báo lỗi đẹp — RPC kiểm lại bằng is_store_pos_operator.
export async function requirePosOperatorStoreId(): Promise<string> {
  const operator = await requireOperator()
  if (!isPosRole(operator.role)) throw new Error('Chỉ chủ quán hoặc thu ngân mới thao tác được ở đây')
  return operator.storeId as string
}

// Trang /admin: 'owner' = chỉ chủ quán (thu ngân bị đưa về POS), 'pos' = chủ quán + thu ngân.
export async function requireAdminPageOrRedirect(
  area: 'owner' | 'pos',
): Promise<{ userId: string; role: 'store_owner' | 'store_cashier'; storeId: string }> {
  const operator = await requireOperatorOrRedirect()
  if (operator.role === 'mevo_superadmin') redirect('/mevo')
  if (operator.role === 'store_staff') redirect('/staff/order')
  if (operator.role === 'store_cashier' && area === 'owner') redirect('/admin/pos')
  return operator as { userId: string; role: 'store_owner' | 'store_cashier'; storeId: string }
}
```

- `requireStaffAreaOrRedirect`: kiểu trả về đổi thành `role: 'store_owner' | 'store_staff' | 'store_cashier'`; comment thêm "thu ngân vào để in hoá đơn 80mm".

- [ ] **Step 4: Chạy → PASS** (`npx vitest run lib/auth/`)

- [ ] **Step 5: `proxy.ts` dùng `roles.ts`**

- Import `adminPathAllowed, canEnterAdmin, canEnterStaffArea, homeForRole, parseOperatorRow, type OperatorRole` từ `@/lib/auth/roles`.
- Thay khối tính `role` (từ `let role: ... = null` tới hết `if (user && ...) {...}`) bằng:

```ts
  let role: OperatorRole | null = null
  if (user && (isAdminRoute || isMevoRoute || isStaffRoute || isLoginPage)) {
    const { data: op } = await supabase
      .from('mevo_operators')
      .select('role, store_id, is_active')
      .eq('user_id', user.id)
      .maybeSingle()
    // Nhân viên bị vô hiệu hoá (is_active=false) coi như không có role → bị đẩy về /login.
    role = parseOperatorRow(op)?.role ?? null
  }

  const homeFor = (r: OperatorRole | null): string | null => (r ? homeForRole(r) : null)
```

- Khối `/admin`:

```ts
  // /admin — chủ quán + thu ngân. Thu ngân chỉ vào trang POS / báo cáo / đặt bàn / thực đơn (Tạm hết) / tài khoản.
  if (isAdminRoute && (!canEnterAdmin(role) || !adminPathAllowed(role as OperatorRole, request.nextUrl.pathname))) {
    const home = homeFor(role)
    return home ? NextResponse.redirect(new URL(home, request.url)) : toLogin()
  }
```

- Khối `/staff`: điều kiện thành `if (isStaffRoute && !canEnterStaffArea(role))`.
- Xoá hàm `homeFor` cũ.

- [ ] **Step 6: `login/actions.ts`**

Thay khối `active … isValidStoreStaff` và `redirectTo` bằng:

```ts
  const parsed = parseOperatorRow(op)
  if (!parsed) {
    await supabase.auth.signOut()
    return { error: 'Tài khoản chưa được cấp quyền vận hành. Liên hệ MEVO để được cấp quyền.' }
  }

  // Không gọi redirect() trong Server Action được invoke từ Client Component —
  // React 19 sẽ treat NEXT_REDIRECT throw như unhandled error.
  // Trả về success + đích đến, để client tự navigate.
  return { success: true, redirectTo: homeForRole(parsed.role) }
```

(import `parseOperatorRow, homeForRole` từ `@/lib/auth/roles`.)

- [ ] **Step 7: Kiểm** — `npx vitest run && npx tsc --noEmit && npx eslint lib/auth proxy.ts "app/(auth)/login/actions.ts"`. Lỗi tsc ở chỗ khác do union `Operator` rộng ra (vd. code giả định `role !== 'store_owner'` ⇒ staff) → sửa đúng chỗ, ghi Ruling nếu đổi hành vi.

- [ ] **Step 8: Commit**

```bash
git add admin-web/lib/auth admin-web/proxy.ts "admin-web/app/(auth)/login/actions.ts"
git commit -m "feat: guard dang nhap/middleware/server nhan vai tro thu ngan (PA-2)"
```

---

### Task 4: Server action đường POS cho thu ngân

**Files:**
- Modify: `admin-web/lib/actions/pos-order.ts` (5 chỗ `requireStoreOwnerStoreId` → `requirePosOperatorStoreId`)
- Modify: `admin-web/lib/actions/table-session.ts` (`staffClient` nhận cashier; `closeTableSession`, `closeTableSessionsBulk` kiểm `isPosRole`)
- Modify: `admin-web/lib/actions/reservations.ts`, `reservation-preorders.ts`, `reservation-customer-calls.ts` (`ownerClient` kiểm `isPosRole`)
- Modify: `admin-web/lib/actions/service-requests.ts`, `staff-reservations.ts` (thêm cashier)
- Modify: `admin-web/lib/actions/floor-layout.ts` (`loadFloorLayout` → POS; `saveFloorLayout` giữ owner)
- Modify: `admin-web/lib/actions/daily-report.ts` (→ POS)
- Modify: `admin-web/lib/actions/menu.ts` (thêm `setMenuItemAvailable`)
- Tests: các file `lib/actions/*.test.ts` tương ứng

**Interfaces:**
- Consumes: `requirePosOperatorStoreId` (Task 3), `isPosRole` (Task 1), RPC `set_menu_item_available` (Task 2).
- Produces: `setMenuItemAvailable(itemId: string, isAvailable: boolean): Promise<{ ok: true } | { ok: false; error: string }>`.

- [ ] **Step 1: Test hồi quy cho thu ngân**

Trong `lib/actions/pos-order.test.ts`, `reservations.test.ts`, `reservation-customer-calls.test.ts`, `service-requests.test.ts`, `daily-report.test.ts`: mỗi file thêm một bài "thu ngân gọi được" — đặt operator mock thành `{ userId: 'c1', role: 'store_cashier', storeId: 'store-1' }` (hoặc cho `requirePosOperatorStoreId` mock resolve `'store-1'`) rồi gọi một action chính của file và kỳ vọng RPC được gọi (không trả lỗi quyền). Ví dụ cho `pos-order.test.ts` (đổi mock `@/lib/auth/operator` để có thêm `requirePosOperatorStoreId: vi.fn(async () => 'store-1')`):

```ts
  it('thu ngân xác nhận lượt được (PA-2)', async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: true }, error: null })
    const res = await confirmOrder('order-1')
    expect(mocks.rpc).toHaveBeenCalledWith('pos_confirm_order', { p_order_id: 'order-1' })
    expect(res).not.toMatchObject({ ok: false })
  })
```

Cho `reservations.test.ts` (operator mock):

```ts
  it('thu ngân nhận khách đặt bàn được (PA-2)', async () => {
    mocks.operator.value = { userId: 'c1', role: 'store_cashier', storeId: 'store-1' } as never
    mocks.rpc.mockResolvedValue({ data: { id: 'r1', status: 'arrived' }, error: null })
    const res = await arriveReservation('r1')
    expect(res).not.toMatchObject({ ok: false, error: expect.stringContaining('Chỉ chủ quán') })
  })

  it('nhân viên phục vụ vẫn bị chặn đặt bàn', async () => {
    mocks.operator.value = { userId: 's1', role: 'store_staff', storeId: 'store-1' } as never
    const res = await arriveReservation('r1')
    expect(res).toMatchObject({ ok: false })
  })
```

Đọc từng file test để dùng đúng tên mock / hình dạng kết quả hiện có; giữ nguyên các bài cũ.

Thêm test cho `setMenuItemAvailable` vào `lib/actions/menu.test.ts` (tạo mới nếu chưa có):

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requirePosOperatorStoreId: vi.fn(async () => 'store-1'),
  requireStoreOwnerStoreId: vi.fn(async () => 'store-1'),
  rpc: vi.fn(),
  revalidatePath: vi.fn(),
}))
vi.mock('@/lib/auth/operator', () => ({
  requirePosOperatorStoreId: mocks.requirePosOperatorStoreId,
  requireStoreOwnerStoreId: mocks.requireStoreOwnerStoreId,
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ rpc: mocks.rpc })),
  createAdminClient: vi.fn(() => ({})),
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

const { setMenuItemAvailable } = await import('./menu')

describe('setMenuItemAvailable (PA-2)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('gọi RPC bằng phiên đăng nhập, KHÔNG dùng service key', async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: true, is_available: false }, error: null })
    await expect(setMenuItemAvailable('item-1', false)).resolves.toEqual({ ok: true })
    expect(mocks.rpc).toHaveBeenCalledWith('set_menu_item_available', { p_item_id: 'item-1', p_available: false })
  })

  it('RPC từ chối → trả lỗi', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Không có quyền đổi trạng thái món' } })
    await expect(setMenuItemAvailable('item-1', true)).resolves.toEqual({ ok: false, error: 'Không có quyền đổi trạng thái món' })
  })
})
```

- [ ] **Step 2: Chạy → FAIL** (`npx vitest run lib/actions/`)

- [ ] **Step 3: Sửa action**

- `pos-order.ts`: đổi import + 5 lời gọi thành `requirePosOperatorStoreId()`; sửa comment dòng 35 cho khớp.
- `table-session.ts`:

```ts
async function staffClient() {
  const operator = await requireOperator()
  if (operator.role !== 'store_staff' && operator.role !== 'store_owner' && operator.role !== 'store_cashier') {
    return { operator: null, supabase: null, error: 'Không có quyền' as const }
  }
  return { operator, supabase: await createClient(), error: null }
}
```

và trong `closeTableSession` + `closeTableSessionsBulk`: `if (!isPosRole(operator.role)) { return { ok: false, error: 'Chỉ chủ quán hoặc thu ngân được thu tiền hoặc bỏ bàn' } }` (import `isPosRole` từ `@/lib/auth/roles`).
- `reservations.ts`, `reservation-preorders.ts`, `reservation-customer-calls.ts`: trong `ownerClient` đổi `operator.role !== 'store_owner'` → `!isPosRole(operator.role)`; câu báo lỗi đổi "Chỉ chủ quán" → "Chỉ chủ quán hoặc thu ngân". `storeId: operator.storeId` cần ép `as string` nếu tsc báo.
- `service-requests.ts` (2 chỗ), `staff-reservations.ts`: thêm `&& operator.role !== 'store_cashier'` vào điều kiện chặn.
- `floor-layout.ts`: `loadFloorLayout` dùng `requirePosOperatorStoreId`; `saveFloorLayout` giữ `requireStoreOwnerStoreId`. Câu lỗi load: "Kiểm tra kết nối và quyền chủ quán / thu ngân."
- `daily-report.ts`: `requireStoreOwnerStoreId` → `requirePosOperatorStoreId`; xoá dòng comment "PA-2 đổi guard…". Cập nhật mock trong `daily-report.test.ts` cho khớp tên mới.
- `menu.ts`: thêm cuối file

```ts
// Bật/tắt "Tạm hết" cho chủ quán VÀ thu ngân (PA-2). Đi qua RPC bằng phiên đăng nhập — KHÔNG dùng
// service key: RPC chỉ đổi is_available, thu ngân không có đường nào sửa giá/tên món.
export async function setMenuItemAvailable(itemId: string, isAvailable: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requirePosOperatorStoreId()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Không có quyền' }
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_menu_item_available', { p_item_id: itemId, p_available: isAvailable })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/menu')
  return { ok: true }
}
```

(import `requirePosOperatorStoreId` và `createClient` nếu file chưa có.)

- [ ] **Step 4: Chạy → PASS** — `npx vitest run lib/ && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add admin-web/lib/actions
git commit -m "feat: thu ngan goi duoc cac action POS, dat ban, bao cao, Tam het (PA-2)"
```

---

### Task 5: Nav, hộp thoại, guard trang, Thực đơn chế độ Tạm hết, POS ẩn sắp xếp

**Files:**
- Modify: `admin-web/app/admin/admin-nav.tsx`, `admin-nav.test.tsx`
- Modify: `admin-web/app/admin/layout.tsx`
- Modify: `admin-web/app/admin/config-dialog.tsx`, `config-dialog.test.ts`, `config-modal.tsx`
- Modify: page guard ở `app/admin/{pos,pos/print-order,dashboard,reservations,menu,account}/page.tsx` (→ `'pos'`) và `app/admin/{settings,tables,staff,vouchers,spin,orders,kitchen}/page.tsx` (→ `'owner'`); `app/admin/page.tsx`
- Create: `admin-web/app/admin/menu/menu-availability-client.tsx`
- Modify: `admin-web/app/admin/pos/page.tsx`, `pos-client.tsx`

**Interfaces:**
- Consumes: `requireAdminPageOrRedirect` (Task 3), `setMenuItemAvailable` (Task 4), `OperatorRole` (Task 1).
- Produces: `adminRailItems(kitchenEnabled = true, role: OperatorRole = 'store_owner')`, `adminBottomItems(role = 'store_owner')`, `adminMoreItems(reservationsEnabled = false, role = 'store_owner')`, `adminNavGroups(reservationsEnabled, kitchenEnabled, role = 'store_owner')`; `CONFIG_TABS` mỗi tab có `cashier?: true`; `ConfigDialog` prop `role`; `PosClient` prop `canArrange: boolean`.

- [ ] **Step 1: Test nav + tab cho thu ngân**

Thêm vào `admin-nav.test.tsx`:

```tsx
describe('thu ngân (PA-2)', () => {
  it('rail chỉ POS · Báo cáo; không có ⚙', () => {
    expect(adminRailItems(true, 'store_cashier').map((i) => i.href)).toEqual(['/admin/pos', '/admin/dashboard'])
    expect(adminBottomItems('store_cashier')).toEqual([])
  })
  it('ô Thêm: Đặt bàn (nếu bật) · Thực đơn (Tạm hết) · Tài khoản', () => {
    expect(adminMoreItems(true, 'store_cashier').map((i) => i.href)).toEqual(['/admin/reservations', '/admin/menu', '/admin/account'])
    expect(adminMoreItems(false, 'store_cashier').map((i) => i.href)).toEqual(['/admin/menu', '/admin/account'])
  })
  it('mọi mục của thu ngân đều là trang thu ngân được mở', () => {
    const all = adminNavGroups(true, true, 'store_cashier').flatMap((g) => g.items.map((i) => i.href))
    expect(all.every((h) => adminPathAllowed('store_cashier', h))).toBe(true)
  })
})
```

(import `adminPathAllowed` từ `@/lib/auth/roles`.) Thêm vào `config-dialog.test.ts` một bài: lọc `CONFIG_TABS` bằng hàm mới `visibleConfigTabs({ reservationsEnabled: true, role: 'store_cashier' })` cho ra đúng `['/admin/reservations', '/admin/menu', '/admin/dashboard', '/admin/account']` và với `role: 'store_owner'` vẫn đủ 10 tab như cũ.

- [ ] **Step 2: Chạy → FAIL** (`npx vitest run app/admin/admin-nav.test.tsx app/admin/config-dialog.test.ts`)

- [ ] **Step 3: Sửa nav**

`admin-nav.tsx`:

```tsx
import type { OperatorRole } from '@/lib/auth/roles'

export function adminRailItems(kitchenEnabled = true, role: OperatorRole = 'store_owner'): AppNavItem[] {
  // Thu ngân (PA-2): chỉ việc ở quầy — POS + Báo cáo ngày.
  if (role === 'store_cashier') {
    return [
      { href: '/admin/pos', label: 'POS', icon: <LayoutGrid /> },
      { href: '/admin/dashboard', label: 'Báo cáo', icon: <BarChart3 /> },
    ]
  }
  return [ /* giữ nguyên mảng cũ */ ]
}

export function adminMoreItems(reservationsEnabled = false, role: OperatorRole = 'store_owner'): AppNavItem[] {
  const booking = reservationsEnabled ? [{ href: '/admin/reservations', label: 'Đặt bàn', icon: <CalendarDays /> }] : []
  if (role === 'store_cashier') {
    return [...booking, { href: '/admin/menu', label: 'Thực đơn (Tạm hết)', icon: <UtensilsCrossed /> }, { href: '/admin/account', label: 'Tài khoản', icon: <User /> }]
  }
  return [...booking, /* giữ nguyên các mục cũ sau Đặt bàn */]
}

export function adminBottomItems(role: OperatorRole = 'store_owner'): AppNavItem[] {
  if (role === 'store_cashier') return []
  return [{ href: '/admin/settings', label: 'Cài đặt', icon: <Settings /> }]
}

export function adminNavGroups(reservationsEnabled = false, kitchenEnabled = true, role: OperatorRole = 'store_owner'): AppNavGroup[] {
  return [
    { items: adminRailItems(kitchenEnabled, role) },
    { items: adminBottomItems(role) },
    { items: adminMoreItems(reservationsEnabled, role) },
  ]
}
```

`config-dialog.tsx`: thêm `cashier: true` vào 4 tab Đặt bàn, Thực đơn & Giá, Báo cáo, Tài khoản; đổi type của mảng cho phép `cashier?: boolean`; thêm và dùng hàm:

```tsx
export function visibleConfigTabs({ reservationsEnabled, role }: { reservationsEnabled: boolean; role: OperatorRole }) {
  return CONFIG_TABS.filter((t) =>
    (!('needsReservations' in t) || reservationsEnabled) &&
    (role !== 'store_cashier' || ('cashier' in t && t.cashier)))
}
```

`ConfigDialog` thêm prop `role: OperatorRole`, thay `CONFIG_TABS.filter(...)` trong JSX bằng `visibleConfigTabs({ reservationsEnabled, role })`. `config-modal.tsx` truyền `role={operator.role === 'store_cashier' ? 'store_cashier' : 'store_owner'}`.

`app/admin/layout.tsx`: thay `requireOperatorOrRedirect` + `if (operator.role !== 'store_owner') redirect('/mevo')` bằng `const operator = await requireAdminPageOrRedirect('pos')`; truyền `operator.role` vào 3 hàm nav; `subtitle` = `operator.role === 'store_cashier' ? 'MEVO · Thu ngân' : 'MEVO · Chủ quán'`.

- [ ] **Step 4: Chạy → PASS**

- [ ] **Step 5: Guard từng trang**

Mỗi trang dưới đây: thay cặp `const operator = await requireOperatorOrRedirect()` + `if (operator.role !== 'store_owner') redirect('/mevo')` bằng `const operator = await requireAdminPageOrRedirect('<area>')` (xoá import `redirect` nếu không dùng nữa):
- `'pos'`: `pos/page.tsx`, `pos/print-order/page.tsx`, `dashboard/page.tsx`, `reservations/page.tsx` (giữ dòng `if (!reservationsEnabled) redirect(...)` nhưng đổi đích thành `'/admin/pos'`), `menu/page.tsx`, `account/page.tsx`.
- `'owner'`: `settings`, `tables`, `staff`, `vouchers`, `spin`, `orders`, `kitchen`.
- `app/admin/page.tsx`: đọc operator; thu ngân → `redirect('/admin/pos')`, còn lại giữ redirect cũ.

- [ ] **Step 6: Thực đơn chế độ Tạm hết**

`app/admin/menu/menu-availability-client.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { Search } from 'lucide-react'
import { setMenuItemAvailable } from '@/lib/actions/menu'
import { cn, formatVND } from '@/lib/utils'

type Item = { id: string; name: string; price: number; is_available: boolean }
type Category = { id: string; name: string; menu_items?: Item[] | null }

// Thực đơn cho THU NGÂN (PA-2): chỉ bật/tắt "Tạm hết". Không có nút thêm/sửa/xoá/kéo — server cũng
// không cho (RPC set_menu_item_available chỉ đổi is_available).
export default function MenuAvailabilityClient({ categories }: { categories: Category[] }) {
  const [state, setState] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(categories.flatMap((c) => (c.menu_items ?? []).map((i) => [i.id, i.is_available]))))
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const needle = q.trim().toLowerCase()

  const toggle = (id: string) => {
    const next = !state[id]
    setState((s) => ({ ...s, [id]: next }))
    setError(null)
    start(async () => {
      const res = await setMenuItemAvailable(id, next)
      if (!res.ok) { setState((s) => ({ ...s, [id]: !next })); setError(res.error) }
    })
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6">
      <label className="mb-4 flex max-w-md items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
        <Search className="size-4 text-muted" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm món…" aria-label="Tìm món" className="w-full bg-transparent text-sm outline-none" />
      </label>
      {error && <p role="alert" className="mb-3 text-sm text-error-text">{error}</p>}
      <div className="space-y-5">
        {categories.map((c) => {
          const items = (c.menu_items ?? []).filter((i) => !needle || i.name.toLowerCase().includes(needle))
          if (items.length === 0) return null
          return (
            <section key={c.id}>
              <h2 className="mb-2 text-sm font-semibold text-foreground">{c.name}</h2>
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
                {items.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className={cn('min-w-0 truncate text-sm', state[i.id] ? 'text-foreground' : 'text-muted line-through')}>
                      {i.name} <span className="text-[13px] text-muted tabular">· {formatVND(i.price)}</span>
                    </span>
                    <button type="button" disabled={pending} onClick={() => toggle(i.id)} aria-pressed={!state[i.id]}
                      className={cn('shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-semibold',
                        state[i.id] ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-red-50 text-red-700 hover:bg-red-100')}>
                      {state[i.id] ? 'Đang bán' : 'Tạm hết'}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
```

`menu/page.tsx`: sau guard `'pos'`, nếu `operator.role === 'store_cashier'` thì chỉ truy vấn `menu_categories` kèm `menu_items(id, name, price, is_available, sort_order)` (sắp theo `sort_order`), render tiêu đề "Thực đơn — bật/tắt Tạm hết" và `<MenuAvailabilityClient categories={...} />`; chủ quán giữ nguyên nhánh cũ.

- [ ] **Step 7: POS ẩn Sắp xếp bàn với thu ngân**

`pos/page.tsx` truyền `canArrange={operator.role === 'store_owner'}`. `pos-client.tsx`: thêm prop `canArrange: boolean` vào kiểu props; khối nút "Sắp xếp bàn" (đoạn `{view === 'floor' && (<div className="ml-auto …">…`) chỉ render khi `canArrange`. Câu rỗng "Vào Sắp xếp bàn để phân bàn vào khu vực." đổi theo vai trò: thu ngân thấy "Khu vực này chưa có bàn."

- [ ] **Step 8: Kiểm** — `npx vitest run && npx tsc --noEmit && npx eslint app/admin lib && npm run build`

- [ ] **Step 9: Commit**

```bash
git add admin-web/app/admin admin-web/lib
git commit -m "feat: thu ngan thay dung muc cua minh, Thuc don chi Tam het, an Sap xep ban (PA-2)"
```

---

### Task 6: Tab Nhân viên chọn / đổi vai trò + nhãn ở /mevo

**Files:**
- Modify: `admin-web/lib/actions/staff.ts`, `admin-web/lib/actions/staff.test.ts`
- Modify: `admin-web/app/admin/staff/staff-client.tsx`, `page.tsx`
- Modify: `admin-web/lib/actions/mevo-accounts.ts`, `app/mevo/accounts/accounts-client.tsx`, `app/mevo/stores/[storeId]/page.tsx`

**Interfaces:**
- Consumes: `ROLE_LABEL` (Task 1).
- Produces:
  - `type StoreTeamRole = 'store_staff' | 'store_cashier'`
  - `createStoreStaff(formData)` đọc thêm `role` (mặc định `store_staff`)
  - `listStoreStaff(): Promise<Array<{ userId: string; email: string; isActive: boolean; role: StoreTeamRole }>>`
  - `setStaffRole(userId: string, role: StoreTeamRole): Promise<void>`
  - `setStaffActive` áp cho cả 2 vai trò

- [ ] **Step 1: Test** — trong `staff.test.ts`:
  - Builder mock thêm `.in` (ghi lại cột/giá trị vào `eqCalls` như `.eq`): `builder.in = vi.fn((col: string, val: unknown) => { eqCalls.value.push([`in:${col}`, val]); return builder })`.
  - Đổi import thành `const { createStoreStaff, setStaffActive, setStaffRole } = await import('./staff')`.
  - Thêm (trong `describe('createStoreStaff')` cho 4 bài đầu, `describe` mới cho bài cuối, `beforeEach` giống khối có sẵn):

```ts
  it('thêm thu ngân: ghi role store_cashier', async () => {
    const fd = emailForm('thungan@quan.vn'); fd.set('role', 'store_cashier')
    await createStoreStaff(fd)
    expect(mocks.admin._upsertArgs.value).toMatchObject({ role: 'store_cashier', store_id: 'store-1', is_active: true })
  })

  it('role lạ trong form → về store_staff (không bao giờ thành store_owner)', async () => {
    const fd = emailForm('x@quan.vn'); fd.set('role', 'store_owner')
    await createStoreStaff(fd)
    expect(mocks.admin._upsertArgs.value).toMatchObject({ role: 'store_staff' })
  })

  it('email đang là thu ngân CÙNG quán → thêm lại được, vai trò theo form', async () => {
    mocks.admin.auth.admin.listUsers.mockResolvedValue({ data: { users: [{ id: 'u-c', email: 'thungan@quan.vn' }] }, error: null })
    mocks.admin._operatorsRow.value = { user_id: 'u-c', store_id: 'store-1', role: 'store_cashier' }
    const fd = emailForm('thungan@quan.vn'); fd.set('role', 'store_staff')
    await expect(createStoreStaff(fd)).resolves.toMatchObject({ email: 'thungan@quan.vn', tempPassword: null })
    expect(mocks.admin._upsertArgs.value).toMatchObject({ user_id: 'u-c', role: 'store_staff' })
  })

  it('email là chủ quán → từ chối, không ghi gì', async () => {
    mocks.admin.auth.admin.listUsers.mockResolvedValue({ data: { users: [{ id: 'u-o', email: 'chu@quan.vn' }] }, error: null })
    mocks.admin._operatorsRow.value = { user_id: 'u-o', store_id: 'store-1', role: 'store_owner' }
    const fd = emailForm('chu@quan.vn'); fd.set('role', 'store_cashier')
    await expect(createStoreStaff(fd)).rejects.toThrow('đã gắn với một tài khoản khác')
    expect(mocks.admin._upsertArgs.value).toBeNull()
  })

describe('setStaffRole (PA-2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.admin._updateArgs.value = null
    mocks.admin._eqCalls.value = []
    mocks.requireStoreOwnerStoreId.mockResolvedValue('store-1')
  })

  it('chỉ đổi người staff/cashier của đúng quán', async () => {
    await setStaffRole('u1', 'store_cashier')
    expect(mocks.admin._updateArgs.value).toEqual({ role: 'store_cashier' })
    expect(mocks.admin._eqCalls.value).toEqual(expect.arrayContaining([
      ['user_id', 'u1'], ['store_id', 'store-1'], ['in:role', ['store_staff', 'store_cashier']],
    ]))
  })

  it('giá trị lạ → store_staff', async () => {
    await setStaffRole('u1', 'store_owner' as never)
    expect(mocks.admin._updateArgs.value).toEqual({ role: 'store_staff' })
  })
})
```

  Nếu `findAuthUserByEmail` không dùng `listUsers` (đọc `lib/supabase/auth-users.ts`), mock theo đúng hàm nó gọi. Bài `setStaffActive` cũ đang kỳ vọng `['role','store_staff']` → sửa thành `['in:role', ['store_staff','store_cashier']]`. Expected: FAIL (`setStaffRole` not a function, role chưa đọc từ form).

- [ ] **Step 2: Sửa `staff.ts`**

```ts
export type StoreTeamRole = 'store_staff' | 'store_cashier'
const TEAM_ROLES: StoreTeamRole[] = ['store_staff', 'store_cashier']
function parseTeamRole(v: unknown): StoreTeamRole {
  return v === 'store_cashier' ? 'store_cashier' : 'store_staff'
}
```

- `createStoreStaff`: `const role = parseTeamRole(formData.get('role'))`; điều kiện chặn email có sẵn đổi thành `existingOp && !(TEAM_ROLES.includes(existingOp.role as StoreTeamRole) && existingOp.store_id === storeId)`; upsert `role`.
- `setStaffActive`: `.eq('role', 'store_staff')` → `.in('role', TEAM_ROLES)`.
- `listStoreStaff`: select `user_id, is_active, role`, `.in('role', TEAM_ROLES)`, map thêm `role: parseTeamRole(o.role)`.
- Thêm:

```ts
// Đổi vai trò Nhân viên phục vụ ↔ Thu ngân. Chỉ đụng người staff/cashier của ĐÚNG quán — không bao giờ
// đổi được chủ quán hay người quán khác. Có hiệu lực ở lần tải trang kế tiếp của người đó; RPC thì ngay.
export async function setStaffRole(userId: string, role: StoreTeamRole): Promise<void> {
  const storeId = await requireStoreOwnerStoreId()
  const next = parseTeamRole(role)
  const { error } = await createAdminClient()
    .from('mevo_operators')
    .update({ role: next })
    .eq('user_id', userId)
    .eq('store_id', storeId)
    .in('role', TEAM_ROLES)
  if (error) throw new Error(`setStaffRole: ${error.message}`)
  revalidatePath('/admin/staff')
}
```

- [ ] **Step 3: Chạy → PASS** (`npx vitest run lib/actions/staff.test.ts`)

- [ ] **Step 4: Giao diện Nhân viên**

`staff-client.tsx`:
- Kiểu `Staff` thêm `role: 'store_staff' | 'store_cashier'`.
- Trong form, trước nút submit thêm:

```tsx
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-foreground/80">Vai trò</span>
            <select name="role" defaultValue="store_staff" className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-focus">
              <option value="store_staff">Nhân viên phục vụ</option>
              <option value="store_cashier">Thu ngân</option>
            </select>
          </label>
```

- Mỗi dòng: sau email hiện nhãn `ROLE_LABEL[s.role]` (pill `bg-secondary`; thu ngân dùng `bg-orange-50 text-orange-700`); thêm nút "Đổi thành Thu ngân" / "Đổi thành Phục vụ" gọi `setStaffRole` trong `startTransition`, có `confirm(...)`: "Đổi «email» thành Thu ngân? Người này sẽ thu tiền, bỏ/tặng món và xem doanh thu." (hoặc "…thành Nhân viên phục vụ? Người này sẽ không thu tiền được nữa.").
- Đếm "N người" thay "N nhân viên".

`staff/page.tsx`: mô tả đổi thành "Tạo tài khoản cho nhân viên phục vụ (đặt món hộ khách) hoặc thu ngân (thu tiền, xem báo cáo ngày). Mỗi người đăng nhập bằng tài khoản riêng — không dùng chung tài khoản chủ quán."

- [ ] **Step 5: Nhãn /mevo**

- `lib/actions/mevo-accounts.ts`: union `role` thêm `'store_cashier'`.
- `accounts-client.tsx`: map nhãn thêm `store_cashier: 'Thu ngân'`.
- `mevo/stores/[storeId]/page.tsx`: thay biểu thức nhãn bằng `ROLE_LABEL[op.role as OperatorRole] ?? op.role`.

- [ ] **Step 6: Kiểm** — `npx vitest run && npx tsc --noEmit && npx eslint app/admin/staff app/mevo lib/actions && npm run build`

- [ ] **Step 7: Commit**

```bash
git add admin-web/lib/actions/staff.ts admin-web/lib/actions/staff.test.ts admin-web/app/admin/staff admin-web/lib/actions/mevo-accounts.ts admin-web/app/mevo
git commit -m "feat: tab Nhan vien chon va doi vai tro Phuc vu / Thu ngan (PA-2)"
```

---

### Task 7: Chạy thật + checklist PA-2

**Files:**
- Create: `docs/testing/pos-admin-complete/PA-2.md`

- [ ] **Step 1: Chạy thật** — `npm run build && npx next start -p 3100`; tự mint phiên chủ quán Bảo Lương (memory `feedback_tu_dang_nhap_admin_khi_test`), vào Nhân viên đổi `baoluong-nv@mevo.vn` thành **Thu ngân**, mint phiên tài khoản đó, kiểm: vào `/admin` → về `/admin/pos`; rail chỉ POS · Báo cáo; mở `/admin/settings` → về `/admin/pos`; Báo cáo hiện số; Thực đơn (Tạm hết) bật/tắt 1 món rồi trả lại. **Xong đổi `baoluong-nv` về Nhân viên phục vụ** (ghi ledger). Không thu tiền / không đóng bill thật khi tự test.

- [ ] **Step 2: Viết checklist**

```markdown
# PA-2 — Vai trò Thu ngân

Spec `docs/superpowers/specs/2026-10-07-pos-admin-complete-design.md` · Plan `docs/superpowers/plans/2026-10-08-pa2-cashier-role.md`
Migration đã áp prod: 093 (`store_cashier`, `is_store_pos_operator`, vá 16 RPC, `set_menu_item_available`). Test trên **Bảo Lương**.
Chuẩn bị: đăng nhập chủ quán → **Thêm → Nhân viên** → thêm một email mới với vai trò **Thu ngân** (ghi lại mật khẩu tạm).

## Chủ quán quản lý vai trò
1. Form Thêm nhân viên có ô **Vai trò** (Nhân viên phục vụ / Thu ngân). Thêm thu ngân → danh sách hiện nhãn **Thu ngân**.
2. Bấm **Đổi thành Phục vụ** rồi **Đổi thành Thu ngân** → nhãn đổi theo.
3. Thêm thu ngân bằng email của chính chủ quán → báo lỗi "đã gắn với một tài khoản khác", không đổi gì.

## Thu ngân đăng nhập (trình duyệt ẩn danh / máy khác)
4. Đăng nhập tài khoản thu ngân → vào thẳng **POS**. Rail chỉ có **POS · Báo cáo**, không có ⚙. Ô **Thêm**: Đặt bàn · Thực đơn (Tạm hết) · Tài khoản.
5. Khách gọi món bằng Mini App → thu ngân **duyệt & in 2 liên** được; **từ chối** một lượt được.
6. Bỏ 1 món, tặng 1 món (có lý do) → được. Mở **Báo cáo** → khối Điều chỉnh bill ghi đúng tên/email thu ngân.
7. Thêm món ghi tay, ghép mâm, thêm bàn vào mâm → được.
8. **Thu tiền** (tiền mặt hoặc chuyển khoản) → bàn trống, đơn hoàn tất; Báo cáo hiện bill với người thu là thu ngân.
9. Đặt bàn: tạo đặt bàn mới, nhận khách, đánh dấu khách không đến → được.
10. **Thêm → Thực đơn (Tạm hết)**: chỉ có danh sách + ô tìm + nút Đang bán/Tạm hết, KHÔNG có nút sửa/xoá/thêm. Tắt một món → Mini App hiện "Tạm hết"; bật lại.
11. Trên POS, tab Sơ đồ bàn **không có** nút "Sắp xếp bàn".
12. Gõ thẳng các địa chỉ: `/admin/settings`, `/admin/tables`, `/admin/staff`, `/admin/vouchers`, `/admin/spin`, `/admin/orders` → đều về **POS**.
13. Bấm **Xem / In lại** ở Báo cáo hoặc **In tạm tính** ở bill → mở được hoá đơn 80mm.

## Thu hồi quyền
14. Chủ quán đổi người đó về **Nhân viên phục vụ** → bên thu ngân bấm F5: bị chuyển sang màn đặt hộ `/staff/order`; mọi thao tác POS đang mở báo lỗi quyền.
15. Chủ quán **Vô hiệu hoá** người đó → F5 → về trang đăng nhập.
16. `/mevo/accounts` (superadmin) hiện nhãn **Thu ngân** đúng người.

**→ Báo:** `PA-2 PASS` hoặc số bài FAIL kèm ảnh.
```

- [ ] **Step 3: Commit** — `git add docs/testing/pos-admin-complete/PA-2.md && git commit -m "docs: checklist test PA-2"`

- [ ] **Step 4: DỪNG** — báo anh Tú test theo `PA-2.md`.
