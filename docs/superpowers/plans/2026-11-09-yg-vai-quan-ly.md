# Yên Garden — Vai Quản lý (`store_manager`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm vai Quản lý: làm được mọi việc của thu ngân, cộng kho, thu chi, công nợ, báo cáo tài chính (các module sau dùng helper của plan này), không đụng cấu hình quán.

**Architecture:** Mig 116 mở rộng hai CHECK của `mevo_operators`, vá tại chỗ `is_store_pos_operator` cùng 3 hàm còn so chuỗi vai, và thêm helper `is_store_back_office`. Mọi RPC POS / đặt bàn / báo cáo đang gọi `is_store_pos_operator` tự nhận Quản lý, không sửa từng RPC. Phía web, luật vai vẫn ở một chỗ `lib/auth/roles.ts`; guard server ở `lib/auth/operator.ts`; rail, hộp thoại, trang Món, trang Nhân viên và 5 server action so chuỗi vai được nối thêm vai mới.

**Tech Stack:** Postgres (Supabase, plpgsql), Next.js 16 App Router, React 19, vitest, `node --test` + pglite.

**Spec:** `docs/superpowers/specs/2026-11-09-yg-vai-quan-ly-design.md` (cùng spec tổng `2026-11-09-yen-garden-trien-khai-design.md` §4.5, §6, §7 và ràng buộc kỹ thuật `2026-11-05-dot1-thanh-toan-ca-in-vietqr-design.md` §7). Hợp đồng chung: `docs/superpowers/plans/2026-11-09-yg-hop-dong-chung.md`.

**Nhánh:** worktree riêng cắt từ `claude/yen-garden-survey-e9a44a`. Worktree mới chưa có `node_modules`: chạy `npm ci` trong `admin-web` trước. Agent code không áp prod, không push, không merge `main`.

## Global Constraints

- Quản lý làm được mọi việc thu ngân làm được (POS, thu tiền, mâm, bỏ/tặng/sửa SL, giảm giá bill, chuyển bàn, đặt bàn, A04, bật/tắt Tạm hết, gọi món hộ ở `/staff`).
- Quản lý **không** sửa: món, giá, danh mục, trạm in, Bàn & QR, sơ đồ, khu, Cài đặt quán, In ấn, Tài khoản nhận tiền, Nhân viên, Ưu đãi & Vòng quay. Không vào màn Bếp (spec không liệt kê).
- `is_store_owner_of` và `is_store_owner_or_admin` **giữ nguyên nghĩa** (chỉ chủ quán). Không sửa thân hai hàm này.
- `is_store_back_office(p_store_id uuid) RETURNS boolean`, `LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public`, true khi `auth.uid()` là `store_owner` hoặc `store_manager` đang `is_active` của đúng `p_store_id`. Superadmin **không** tính (đúng hợp đồng).
- Chỉ chủ quán tạo, sửa vai, khoá, đặt lại mật khẩu cho Quản lý. Không có xoá vĩnh viễn.
- Nhãn vai: `Quản lý`. Trang chủ của vai: `/admin/pos`.
- `MANAGER_ADMIN_PATHS` = mọi đường của thu ngân + `/admin/inventory`, `/admin/cashbook`, `/admin/debts`, `/admin/reports`. `CASHIER_ADMIN_PATHS` thêm `/admin/reports`, `/admin/debts`. Plan này **không** tạo 4 trang đó, không thêm mục rail/tab cho chúng.
- Hộp thoại A04 giữ `canManage = chủ quán` (nút Đã nhận tiền / Hoàn tất / Huỷ đơn / Đổi thưởng gọi RPC `is_store_owner_or_admin`, Quản lý bấm sẽ lỗi). Sơ đồ POS giữ `canArrange = chủ quán` (`pos_save_floor_layout` chỉ chủ quán).
- Migration vá hàm sống: `pg_get_functiondef` + `replace` + `EXECUTE`, helper `pg_temp.mevo_patch` theo mẫu mig 111 (raise khi neo khớp 0 hoặc hơn 1 lần), neo bọc `$a$ … $a$` / `$b$ … $b$`. Neo chép từ **prod**.
- Không ghi "rerun-safe" trong migration. Chạy lại mig 116 phải dừng ở helper vá.
- Hàm mới `is_store_back_office` dùng trong RLS của module sau nên: `REVOKE ALL … FROM PUBLIC, anon` rồi `GRANT EXECUTE … TO authenticated` (như `is_store_pos_operator` mig 093).
- Server action có lỗi người dùng trả `{ ok, error }`, không ném; action dùng `createAdminClient` tự kiểm quyền và lọc `store_id`.
- Chữ giao diện tiếng Việt, comment tiếng Việt cho logic khó. Commit `feat:`, `fix:`, `chore:`, `docs:`.
- Trước khi báo xong mỗi task: `cd admin-web; npm test`, `npx tsc --noEmit`, `npm run lint` (không lỗi mới); test SQL theo lệnh ở Task 1.

## Review Focus

1. Chủ quán đổi vai một người đang là Quản lý xuống Phục vụ, hoặc khoá Quản lý. `updateStaff` / `setStaffActive` lọc `.in('role', TEAM_ROLES)`: thiếu `store_manager` thì thao tác trúng 0 dòng và báo "không phải nhân viên của quán anh". Test ở Task 4.
2. Form bị sửa tay gửi `role=store_owner` hoặc `role=mevo_superadmin`. Phải ra `store_staff`; `role=store_manager` thì nhận. Test ở Task 4.
3. Quản lý quán A gọi thẳng RPC với `store_id` hoặc id món của quán B. Mọi helper trả false, RPC từ chối. Test ở Task 1.
4. Quản lý đã bị khoá (`is_active=false`) còn phiên đăng nhập cũ. Helper SQL trả false, `parseOperatorRow` trả null, proxy đẩy về `/login`. Test ở Task 1, Task 2.
5. Quản lý gõ tay `/admin/settings`, `/admin/staff`, `/admin/tables`, `/admin/vouchers`, `/admin/kitchen`, `/print/table-qr`. Proxy và guard trang đưa về `/admin/pos`. Test ở Task 2.

---

### Task 1: Migration 116 và test SQL

**Files:**
- Create: `supabase/migrations/116_store_manager_role.sql`
- Create: `supabase/tests/prod-defs/116/is_store_pos_operator.sql`, `reservation_operator_actor_kind.sql`, `pos_get_floor_layout.sql`, `pos_save_floor_layout.sql`, `staff_create_order.sql`, `set_menu_item_available.sql`
- Test: `supabase/tests/116_store_manager.test.mjs`

**Interfaces:**
- Produces (SQL, GRANT `authenticated`): `is_store_back_office(p_store_id uuid) RETURNS boolean`.
- Produces (vá tại chỗ, chữ ký không đổi): `is_store_pos_operator(uuid)`, `reservation_operator_actor_kind(uuid)`, `pos_get_floor_layout()`, `staff_create_order(uuid,jsonb,text,uuid,text)` nhận thêm `store_manager`.
- Produces (ràng buộc): `mevo_operators_role_check`, `mevo_operators_role_store_check` có `store_manager` (bắt buộc `store_id`).

**Rà chỗ so chuỗi vai trên prod (đã chạy 2026-11-09, `pg_proc` + `pg_policies`):**

| Chỗ | Quyết định |
|---|---|
| `is_store_pos_operator` | Vá: thêm `store_manager` |
| `reservation_operator_actor_kind` | Vá: Quản lý ghi `actor_kind='owner'` như thu ngân (CHECK nhật ký chỉ nhận customer/owner/mevo/system) |
| `pos_get_floor_layout` | Vá: Quản lý xem sơ đồ POS |
| `staff_create_order` | Vá: Quản lý gọi món hộ ở `/staff` (spec **[em]**) |
| `pos_save_floor_layout` | Giữ chỉ chủ quán (sơ đồ là cấu hình) |
| `revoke_reservation_customer_access` | Giữ chỉ chủ quán (như thu ngân sau mig 093) |
| `get_store_workflow_settings`, `update_store_workflow_settings`, RLS `workflow_settings_operator_read`, `workflow_events_operator_read` | Giữ: cài đặt quán là của chủ quán |
| `is_store_owner_of`, `is_store_owner_or_admin` | Giữ nguyên nghĩa |
| `is_store_scoped_operator`, `get_print_mode`, `is_operator` | Không so vai, Quản lý tự có như mọi operator của quán |
| RLS `table_areas.pos_read_table_areas`, `order_item_quantity_changes.pos_read_qty_changes` | Gọi `is_store_pos_operator`, tự nhận Quản lý |

Hàm thứ 16 của mig 093 `get_daily_report` đã bị DROP ở mig 102; các RPC thêm sau 093 (104, 107, 110, 114, …) đều gọi `is_store_pos_operator`, không cần vá.

- [ ] **Step 1: Chụp định nghĩa prod**

Dùng Supabase MCP `execute_sql` của prod (chỉ SELECT; phiên viết plan dùng được `mcp__supabase-account-mrtu__execute_sql`) lấy `pg_get_functiondef(...)` của 6 hàm, ghi nguyên byte vào `prod-defs/116/` (không thêm xuống dòng cuối). md5 phải khớp (đo trên prod 2026-11-09, cả 6 hàm không lẫn CR):

| File | Chữ ký | md5 |
|---|---|---|
| `is_store_pos_operator.sql` | `public.is_store_pos_operator(uuid)` | `1b6a40e5a006e2ec952c0061e21930ba` |
| `reservation_operator_actor_kind.sql` | `public.reservation_operator_actor_kind(uuid)` | `4658db73231706dda4cad4a449908598` |
| `pos_get_floor_layout.sql` | `public.pos_get_floor_layout()` | `1f26e4d3d3ce07b48419aebb81d60ebd` |
| `pos_save_floor_layout.sql` | `public.pos_save_floor_layout(integer,jsonb,jsonb)` | `f436d5710305c7242ec9e835052c45d4` |
| `staff_create_order.sql` | `public.staff_create_order(uuid,jsonb,text,uuid,text)` | `334a01c4383234d24078bc8bb1518506` |
| `set_menu_item_available.sql` | `public.set_menu_item_available(uuid,boolean)` | `ee5b12c05bd061da8e1d218c5e4627d1` |

md5 lệch nghĩa là prod đã đổi sau 2026-11-09: dừng, chép lại neo từ bản mới và báo Controller.

- [ ] **Step 2: Viết test thất bại**

`116_store_manager.test.mjs`, khung theo `111_business_day.test.mjs` (`PGLITE_MODULE`, `login`/`as`, `id(n)`). Dựng trong `before()`:
- Role `anon`, `authenticated`, `service_role`; `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role` (như `helpers/business-day-fixture.mjs`); `auth.uid()` đọc `request.jwt.claim.sub`.
- `mevo_operators(user_id uuid PK, store_id uuid, role text, is_active boolean DEFAULT true, display_name text)` với hai CHECK đúng định nghĩa prod hiện tại (bản mig 093).
- `stores(id uuid PK, table_layout_version int DEFAULT 1)`, `table_areas(id, store_id, name, color, sort_order)`, `tables(id, store_id, table_number, area_id, pos_x, pos_y, is_active)`, `menu_items(id, store_id, name, price int, is_available boolean)`, `menu_item_variants(id uuid)`, `orders(id, store_id, client_request_id, total_amount)`, `order_items(order_id uuid)` — đủ để `%ROWTYPE` và truy vấn của các hàm trên biên dịch. Nếu pglite vẫn kêu thiếu bảng khi nạp `staff_create_order`, `SET check_function_bodies = off` trong lúc nạp bản chụp.
- `menu_items`: `ENABLE ROW LEVEL SECURITY`, policy `auth_update_menu_items` FOR UPDATE TO authenticated `USING/WITH CHECK (is_store_owner_or_admin(store_id))` như prod, cộng policy SELECT `USING (true)` cho fixture; `GRANT SELECT, UPDATE ON menu_items TO authenticated`.
- `is_store_owner_of`, `is_store_owner_or_admin` chép đúng bản prod trong `helpers/business-day-fixture.mjs`.
- Nạp 6 file `prod-defs/116/`, rồi `116_store_manager_role.sql`.

Dữ liệu: quán `sA`, `sB`; `ownerA`, `managerA`, `cashierA`, `staffA`, `managerOff` (quán A, `is_active=false`), `managerB`, `admin` (superadmin). Mỗi quán một món, một bàn, một khu.

```js
test('CHECK: store_manager cần store_id; vai lạ bị chặn', async () => {
  // INSERT store_manager store_id NULL → lỗi mevo_operators_role_store_check
  // INSERT role 'store_kitchen' → lỗi mevo_operators_role_check
  // INSERT store_manager store_id sA → được
})
test('is_store_pos_operator(sA): chủ, quản lý, thu ngân = true; phục vụ, quản lý tắt, quản lý B, superadmin = false', ...)
test('is_store_back_office(sA): chủ, quản lý = true; thu ngân, phục vụ, quản lý tắt, quản lý B, superadmin = false', ...)
test('is_store_owner_of / is_store_owner_or_admin giữ nghĩa: quản lý A = false cả hai', ...)
test('set_menu_item_available: quản lý A đổi món A được; món B bị "Không có quyền đổi trạng thái món"', ...)
test('RLS menu_items: quản lý A UPDATE price món A → 0 dòng, giá giữ nguyên; chủ quán A → 1 dòng', ...)
test('pos_get_floor_layout: quản lý A nhận sơ đồ quán A; phục vụ bị "Chỉ chủ quán được xem sơ đồ POS"', ...)
test('pos_save_floor_layout vẫn chỉ chủ quán: quản lý A bị từ chối', ...)
test('reservation_operator_actor_kind: quản lý A với sA → owner; với sB → "Không có quyền quản lý đặt bàn của quán này"', ...)
test('staff_create_order: quản lý A qua cổng vai (lỗi kế tiếp "Thiếu client_request_id"); quản lý tắt → "Không có quyền đặt món hộ"', async () => {
  // gọi với p_client_request_id = null để dừng ngay sau cổng vai
})
test('EXECUTE: anon gọi is_store_back_office bị permission denied; authenticated gọi được', ...)
test('chuỗi neo khớp đúng 1 lần trong prod-defs/116, md5 khớp prod', ...) // mẫu SIG + patches() của test 111, 4 chữ ký, mỗi chữ ký count 1
test('migration: đúng mẫu vá tại chỗ', async () => {
  // khớp /mig 116: % không còn chuỗi cần vá/, /mig 116: % có hơn một chỗ khớp chuỗi cần vá/
  // không có /rerun-safe/i; kết thúc bằng NOTIFY pgrst, 'reload schema';
  // không có 'CREATE OR REPLACE FUNCTION public.is_store_owner_of' hay '…is_store_owner_or_admin' (không đụng hai helper chủ quán)
})
test('chạy lại mig 116 lần hai thì dừng ở helper vá', async () => {
  // để cuối file; expect reject /mig 116: .* không còn chuỗi cần vá/
})
```

- [ ] **Step 3: Chạy test, phải FAIL**

Run (PowerShell, trong worktree):
`$env:PGLITE_MODULE="$PWD/admin-web/node_modules/@electric-sql/pglite/dist/index.js"; node --test supabase/tests/116_store_manager.test.mjs`
Expected: FAIL vì chưa có `116_store_manager_role.sql`.

- [ ] **Step 4: Viết `116_store_manager_role.sql`**

Thứ tự trong file: comment đầu (mục tiêu, bảng rà ở trên rút gọn, ngày chụp neo) → khối `DO $pre$` raise `'mig 116: thiếu hàm %'` khi `to_regprocedure` của 4 chữ ký cần vá là NULL → hai CHECK → `is_store_back_office` → `pg_temp.mevo_patch` (chép mẫu mig 111, thông báo `mig 116:`) → 4 lời vá → REVOKE/GRANT → `NOTIFY pgrst, 'reload schema';`.

CHECK:

```sql
CHECK (role = ANY (ARRAY['mevo_superadmin', 'store_owner', 'store_staff', 'store_cashier', 'store_manager']))
CHECK ((role = 'mevo_superadmin' AND store_id IS NULL)
    OR (role = ANY (ARRAY['store_owner', 'store_staff', 'store_cashier', 'store_manager']) AND store_id IS NOT NULL))
```
(`DROP CONSTRAINT IF EXISTS` rồi `ADD CONSTRAINT` cùng tên như mig 093.)

Thân `is_store_back_office` (copy hợp đồng chốt):

```sql
  select exists (
    select 1 from mevo_operators
     where user_id = auth.uid()
       and is_active
       and role in ('store_owner', 'store_manager')
       and store_id = p_store_id
  );
```

Bốn lời vá (neo đã kiểm khớp đúng 1 lần trên prod 2026-11-09):

| Chữ ký | `$a$` | `$b$` |
|---|---|---|
| `public.is_store_pos_operator(uuid)` | `role in ('store_owner', 'store_cashier')` | `role in ('store_owner', 'store_cashier', 'store_manager')` |
| `public.reservation_operator_actor_kind(uuid)` | `IF v_role IN ('store_owner', 'store_cashier') AND v_operator_store = p_store_id THEN RETURN 'owner'; END IF;` | `IF v_role IN ('store_owner', 'store_cashier', 'store_manager') AND v_operator_store = p_store_id THEN RETURN 'owner'; END IF;` |
| `public.pos_get_floor_layout()` | `AND role IN ('store_owner', 'store_cashier') AND is_active = true;` | `AND role IN ('store_owner', 'store_cashier', 'store_manager') AND is_active = true;` |
| `public.staff_create_order(uuid,jsonb,text,uuid,text)` | `v_role not in ('store_owner','store_staff','store_cashier')` | `v_role not in ('store_owner','store_staff','store_cashier','store_manager')` |

Grant: `REVOKE ALL ON FUNCTION public.is_store_back_office(uuid) FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION public.is_store_back_office(uuid) TO authenticated;`. Bốn hàm vá giữ quyền cũ (`CREATE OR REPLACE` không đổi privilege).

- [ ] **Step 5: Chạy test, phải PASS**

Run: lệnh Step 3, cùng `supabase/tests/111_business_day.test.mjs` và `supabase/tests/048_pos_table_areas.test.mjs`.
Expected: PASS hết.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/116_store_manager_role.sql supabase/tests/prod-defs/116 supabase/tests/116_store_manager.test.mjs
git commit -m "feat: mig 116 vai quan ly store_manager va helper is_store_back_office"
```

### Task 2: Luật vai và guard server

**Files:**
- Modify: `admin-web/lib/auth/roles.ts`
- Modify: `admin-web/lib/auth/roles.test.ts`
- Modify: `admin-web/lib/auth/operator.ts`
- Modify: `admin-web/lib/auth/operator.test.ts`
- Modify: `admin-web/proxy.ts:80-81`, `:93` (chỉ comment, logic đã đi qua `roles.ts`)

**Interfaces:**
- Produces (`lib/auth/roles.ts`):
  - `OperatorRole` thêm `'store_manager'`; `ROLE_LABEL.store_manager = 'Quản lý'`; `homeForRole('store_manager') === '/admin/pos'`
  - `canEnterAdmin`, `canEnterStaffArea`, `isPosRole` trả true cho `store_manager`
  - `isBackOfficeRole(role: OperatorRole | null): boolean` — true chỉ với `store_owner`, `store_manager`
  - `CASHIER_ADMIN_PATHS = ['/admin/pos', '/admin/bills', '/admin/reservations', '/admin/menu', '/admin/account', '/admin/reports', '/admin/debts'] as const`
  - `MANAGER_ADMIN_PATHS = [...CASHIER_ADMIN_PATHS, '/admin/inventory', '/admin/cashbook'] as const`
  - `adminPathAllowed(role, pathname)`: chủ quán mọi trang; thu ngân theo `CASHIER_ADMIN_PATHS`; quản lý theo `MANAGER_ADMIN_PATHS`; vai khác false. So khớp như cũ (`=== p` hoặc `startsWith(p + '/')`).
- Produces (`lib/auth/operator.ts`):
  - `Operator` thêm `{ userId: string; role: 'store_manager'; storeId: string }`
  - `export type AdminPageOperator = { userId: string; role: 'store_owner' | 'store_cashier' | 'store_manager'; storeId: string }`
  - `requireAdminPageOrRedirect(area: 'owner' | 'pos' | 'back_office'): Promise<AdminPageOperator>` — `'owner'`: thu ngân và quản lý về `/admin/pos`; `'back_office'`: thu ngân về `/admin/pos`; `'pos'`: cả ba vào.
  - `requireBackOfficeStoreId(): Promise<string>` — ném `'Chỉ chủ quán hoặc quản lý mới thao tác được ở đây'` khi `!isBackOfficeRole`. Module KHO/CA/NO/BC bọc trong `try/catch` rồi trả `{ok:false}`.
  - `requireStaffAreaOrRedirect` trả thêm `store_manager` trong kiểu.
  - `requireStoreOwnerStoreId`, `requirePosOperatorStoreId` giữ nguyên thông báo lỗi.

- [ ] **Step 1: Viết test thất bại**

`roles.test.ts`: thay khối "trang admin thu ngân được mở" bằng bảng 4 vai.

```ts
const PATHS: Array<[string, { owner: boolean; manager: boolean; cashier: boolean }]> = [
  ['/admin/pos', { owner: true, manager: true, cashier: true }],
  ['/admin/pos/print-order', { owner: true, manager: true, cashier: true }],
  ['/admin/bills', { owner: true, manager: true, cashier: true }],
  ['/admin/reservations', { owner: true, manager: true, cashier: true }],
  ['/admin/menu', { owner: true, manager: true, cashier: true }],
  ['/admin/account', { owner: true, manager: true, cashier: true }],
  ['/admin/reports', { owner: true, manager: true, cashier: true }],
  ['/admin/debts', { owner: true, manager: true, cashier: true }],
  ['/admin/inventory', { owner: true, manager: true, cashier: false }],
  ['/admin/cashbook', { owner: true, manager: true, cashier: false }],
  ['/admin/settings', { owner: true, manager: false, cashier: false }],
  ['/admin/staff', { owner: true, manager: false, cashier: false }],
  ['/admin/tables', { owner: true, manager: false, cashier: false }],
  ['/admin/vouchers', { owner: true, manager: false, cashier: false }],
  ['/admin/kitchen', { owner: true, manager: false, cashier: false }],
  ['/admin', { owner: true, manager: false, cashier: false }],
  ['/admin/inventoryx', { owner: true, manager: false, cashier: false }],
  ['/admin/menu-hack', { owner: true, manager: false, cashier: false }],
]
it.each(PATHS)('%s', (path, ok) => {
  expect(adminPathAllowed('store_owner', path)).toBe(ok.owner)
  expect(adminPathAllowed('store_manager', path)).toBe(ok.manager)
  expect(adminPathAllowed('store_cashier', path)).toBe(ok.cashier)
  expect(adminPathAllowed('store_staff', path)).toBe(false)
  expect(adminPathAllowed('mevo_superadmin', path)).toBe(false)
})
it('MANAGER_ADMIN_PATHS chứa trọn CASHIER_ADMIN_PATHS', ...)
it('quản lý: đọc dòng, về POS, vào admin + khu nhân viên, là vai POS và back office', () => {
  expect(parseOperatorRow({ role: 'store_manager', store_id: 's1', is_active: true })).toEqual({ role: 'store_manager', storeId: 's1' })
  expect(parseOperatorRow({ role: 'store_manager', store_id: null, is_active: true })).toBeNull()
  expect(parseOperatorRow({ role: 'store_manager', store_id: 's1', is_active: false })).toBeNull()
  expect(homeForRole('store_manager')).toBe('/admin/pos')
  expect(canEnterAdmin('store_manager')).toBe(true)
  expect(canEnterStaffArea('store_manager')).toBe(true)
  expect(isPosRole('store_manager')).toBe(true)
  expect(ROLE_LABEL.store_manager).toBe('Quản lý')
})
it('isBackOfficeRole: chỉ chủ quán và quản lý', () => {
  expect(['store_owner', 'store_manager', 'store_cashier', 'store_staff', 'mevo_superadmin', null].map((r) => isBackOfficeRole(r as never)))
    .toEqual([true, true, false, false, false, false])
})
```

`operator.test.ts`, thêm `describe('quản lý (QL)')` theo mẫu khối "thu ngân (PA-2)":

```ts
it('requirePosOperatorStoreId và requireBackOfficeStoreId cho quản lý qua', ...)        // resolves 's1'
it('requireStoreOwnerStoreId chặn quản lý và thu ngân', ...)                             // rejects 'Chỉ chủ quán'
it('requireBackOfficeStoreId chặn thu ngân', ...)                                         // rejects 'Chỉ chủ quán hoặc quản lý'
it("trang 'owner' → quản lý về /admin/pos", ...)                                          // REDIRECT:/admin/pos
it("trang 'back_office' → quản lý vào, thu ngân về /admin/pos, phục vụ về /staff/order", ...)
it('quản lý đã khoá → về đăng nhập', ...)                                                 // REDIRECT:/login?error=not_operator
```

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `cd admin-web; npx vitest run lib/auth`
Expected: FAIL (`isBackOfficeRole`, `requireBackOfficeStoreId` chưa có; quản lý bị chặn).

- [ ] **Step 3: Sửa `roles.ts`, `operator.ts`, comment `proxy.ts`**

Comment `proxy.ts` nhắc thêm Quản lý ở hai chỗ khu `/admin` và `/staff`; không đổi logic.

- [ ] **Step 4: Chạy test và kiểu**

Run: `cd admin-web; npx vitest run lib/auth; npx tsc --noEmit`
Expected: `lib/auth` PASS. `tsc` có thể báo các `Record<OperatorRole, …>` và kiểu `'store_owner' | 'store_cashier'` ở trang/khung (Task 3 xử lý); ghi lại danh sách lỗi, không sửa ngoài `lib/auth` trong task này.

- [ ] **Step 5: Commit**

```bash
git add admin-web/lib/auth admin-web/proxy.ts
git commit -m "feat: luat vai quan ly va guard back office"
```

### Task 3: Khung `/admin` cho Quản lý

**Files:**
- Modify: `admin-web/app/admin/admin-nav.tsx:22-47`
- Modify: `admin-web/app/admin/admin-nav.test.tsx`
- Modify: `admin-web/app/admin/config-dialog.tsx:33-36`
- Modify: `admin-web/app/admin/config-dialog.test.ts`
- Modify: `admin-web/app/admin/config-modal.tsx:12`
- Modify: `admin-web/app/admin/layout.tsx:11`, `:31`
- Modify: `admin-web/app/admin/menu/page.tsx:13-14`
- Modify: `admin-web/lib/actions/mevo-accounts.ts:11`, `admin-web/app/mevo/accounts/accounts-client.tsx:7-12`, `admin-web/app/mevo/stores/[storeId]/page.tsx:136`
- Sửa thêm mọi lỗi `tsc` Task 2 ghi lại (chỉ nối thêm vai, không đổi hành vi chủ quán / thu ngân).

**Interfaces:**
- Consumes: `OperatorRole`, `ROLE_LABEL`, `adminPathAllowed` (Task 2).
- Produces: `adminRailItems(kitchenEnabled, reservationsEnabled, 'store_manager')` = POS · Đặt bàn (khi `reservationsEnabled`) · Món · Báo cáo (`/admin/bills`); `adminBottomItems('store_manager')` = `[{ href: '/admin/account', label: 'Cài đặt' }]`; `settingsTabs('store_manager')` = chỉ `/admin/account`. Module KHO, CA, NO, BC thêm mục của mình vào **nhánh Quản lý** của `adminRailItems` (và nhánh chủ quán).

- [ ] **Step 1: Viết test thất bại**

`admin-nav.test.tsx`: mở kiểu `role` của hàm `all` thành `OperatorRole`, thêm:

```ts
describe('quản lý (QL)', () => {
  it('rail: POS · Đặt bàn · Món · Báo cáo; không có Bếp, Bàn QR', () => {
    expect(hrefs(adminRailItems(true, true, 'store_manager'))).toEqual(['/admin/pos', '/admin/reservations', '/admin/menu', '/admin/bills'])
    expect(hrefs(adminRailItems(true, false, 'store_manager'))).toEqual(['/admin/pos', '/admin/menu', '/admin/bills'])
    expect(adminBottomItems('store_manager')).toMatchObject([{ href: '/admin/account', label: 'Cài đặt' }])
  })
  it('mọi mục của quản lý đều là trang quản lý được mở', () => {
    expect(all(true, true, 'store_manager').every((h) => adminPathAllowed('store_manager', h))).toBe(true)
  })
})
```

`config-dialog.test.ts`: `settingsTabs('store_manager')` ra `['/admin/account']` và mở được bằng `adminPathAllowed('store_manager', …)`.

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `cd admin-web; npx vitest run app/admin/admin-nav.test.tsx app/admin/config-dialog.test.ts`
Expected: FAIL (quản lý đang nhận rail chủ quán).

- [ ] **Step 3: Sửa khung**

- `admin-nav.tsx`: nhánh riêng cho `store_manager` trước nhánh chủ quán; nhánh thu ngân giữ nguyên.
- `config-dialog.tsx` `settingsTabs`: chủ quán thấy mọi tab cài đặt, vai khác chỉ tab có cờ `cashier` (sửa comment: cờ này = "tài khoản của chính mình", dùng cho thu ngân và quản lý).
- `config-modal.tsx`: truyền thẳng `operator.role`.
- `layout.tsx`: subtitle `` `MEVO · ${ROLE_LABEL[operator.role]}` ``; comment dòng 11 thêm quản lý.
- `menu/page.tsx`: điều kiện màn bật/tắt Tạm hết thành `operator.role !== 'store_owner'`; comment: thu ngân + quản lý; ô "Trừ kho" cho quản lý do module KHO thêm.
- `mevo-accounts.ts`, `accounts-client.tsx`, `mevo/stores/[storeId]/page.tsx`: thêm `store_manager` / nhãn `Quản lý`.

- [ ] **Step 4: Chạy toàn bộ**

Run: `cd admin-web; npm test; npx tsc --noEmit; npm run lint`
Expected: PASS, `tsc` sạch.

- [ ] **Step 5: Commit**

```bash
git add admin-web/app/admin admin-web/app/mevo admin-web/lib/actions/mevo-accounts.ts
git commit -m "feat: rail, hop thoai, trang Mon cho vai quan ly"
```

### Task 4: Trang Nhân viên và các server action so chuỗi vai

**Files:**
- Modify: `admin-web/lib/actions/staff.ts:8-14`
- Modify: `admin-web/lib/actions/staff.test.ts`
- Modify: `admin-web/app/admin/staff/staff-client.tsx:127-130`, `:190`, `:318-323`, `:403-417`
- Modify: `admin-web/lib/actions/service-requests.ts:25`, `:42`
- Modify: `admin-web/lib/actions/service-requests.test.ts:107`
- Modify: `admin-web/lib/actions/staff-order.ts:33`
- Modify: `admin-web/lib/actions/staff-order.test.ts`
- Modify: `admin-web/lib/actions/staff-reservations.ts:21`
- Modify: `admin-web/lib/actions/table-session.ts:95`

**Interfaces:**
- Consumes: `ROLE_LABEL.store_manager` (Task 2).
- Produces: `StoreTeamRole = 'store_staff' | 'store_cashier' | 'store_manager'`; `TEAM_ROLES = ['store_staff', 'store_cashier', 'store_manager']`; `parseTeamRole(v)` trả `v` khi nằm trong `TEAM_ROLES`, ngược lại `'store_staff'`.

- [ ] **Step 1: Viết test thất bại**

`staff.test.ts`:

```ts
it('thêm quản lý: ghi role store_manager', ...)                       // upsert { role: 'store_manager', store_id: 'store-1', is_active: true }
it('role mevo_superadmin trong form → store_staff', ...)
it('email đang là quản lý CÙNG quán → thêm lại được, vai trò theo form', ...)
it('updateStaff hạ quản lý xuống phục vụ: lọc in:role đủ 3 vai', ...) // _eqCalls chứa ['in:role', ['store_staff','store_cashier','store_manager']]
it('không phải chủ quán (guard ném) → createStoreStaff không ghi gì', ...) // requireStoreOwnerStoreId.mockRejectedValue('Chỉ chủ quán…'); _upsertArgs null
```
Sửa 3 kỳ vọng `['in:role', ['store_staff', 'store_cashier']]` hiện có (dòng 185, 214, 266) thành 3 vai. Guard thật chặn thu ngân / quản lý đã được test ở Task 2 (`requireStoreOwnerStoreId`).

`service-requests.test.ts:107`: `it.each(['store_owner', 'store_staff', 'store_manager'] as const)`.
`staff-order.test.ts`: thêm `it('quản lý đặt hộ gọi RPC staff_create_order (mig 116)')` theo mẫu khối thu ngân dòng 71-77.

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `cd admin-web; npx vitest run lib/actions/staff.test.ts lib/actions/service-requests.test.ts lib/actions/staff-order.test.ts`
Expected: FAIL.

- [ ] **Step 3: Sửa action và trang Nhân viên**

- `staff.ts`: theo Interfaces; sửa comment dòng 8 và 25-27 (ba vai chủ quán tự tạo, giá trị lạ về phục vụ, không bao giờ thành chủ quán).
- 5 chỗ so chuỗi vai: thêm `&& operator.role !== 'store_manager'` vào chuỗi điều kiện. Giữ dạng so sánh tường minh, **không** đổi sang `canEnterStaffArea(...)`: hàm boolean không thu hẹp kiểu, `operator.storeId` sẽ thành `string | null` và `tsc` lỗi.
- `staff-client.tsx`: thêm `<option value="store_manager">{ROLE_LABEL.store_manager}</option>` vào cả 3 `<select>` (lọc, thêm, sửa). Huy hiệu vai Quản lý `bg-orange-600 text-white` (đặc, phân biệt với thu ngân `bg-orange-50`). Chữ gợi ý ở form Thêm và Sửa:
  - `Phục vụ: đặt món hộ khách. Thu ngân: thu tiền, bỏ/tặng món, xem báo cáo ngày. Quản lý: việc của thu ngân, cộng kho, thu chi, công nợ, báo cáo tài chính.`
  - Cảnh báo khi đổi sang Quản lý: `Người này sẽ làm mọi việc của thu ngân, cộng kho, thu chi, công nợ và xem lãi lỗ.` (giữ nguyên hai câu của Thu ngân / Phục vụ và đoạn `Có hiệu lực từ lần tải trang kế tiếp của họ.`)

- [ ] **Step 4: Chạy toàn bộ**

Run: `cd admin-web; npm test; npx tsc --noEmit; npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add admin-web/lib/actions admin-web/app/admin/staff
git commit -m "feat: chu quan tao quan ly, action /staff nhan vai quan ly"
```

### Task 5: Checklist tay và ghi quyết định

**Files:**
- Create: `docs/testing/yen-garden/QUAN-LY.md`
- Modify: `TESTING.md` (thêm link, quy ước từ 2026-09-10)
- Modify: `CLAUDE.md` (thêm dòng cuối bảng §10)

- [ ] **Step 1: Viết checklist**

Test trên Bảo Lương sau khi Controller áp mig 116 + deploy. Tài khoản Quản lý thử tạo bằng email riêng, xong thì **Vô hiệu hoá** (không xoá). Các bài:
1. Chủ quán mở Nhân viên: lọc và form Thêm có "Quản lý"; tạo một Quản lý, nhận mật khẩu tạm.
2. Đăng nhập Quản lý: vào thẳng POS; nhãn rail "MEVO · Quản lý"; rail POS · (Đặt bàn) · Món · Báo cáo; ⚙ chỉ có Bảo mật.
3. POS: duyệt một đơn, in, bỏ/tặng một món có lý do, giảm giá bill, chuyển bàn, thu tiền đóng bàn — không lỗi quyền.
4. Đặt bàn: tạo, xếp bàn, huỷ một lượt; nhật ký ghi tên Quản lý.
5. Trang Món chỉ có bật/tắt Tạm hết; tắt một món, Mini App / màn nhân viên thấy "Tạm hết"; bật lại.
6. Báo cáo A04 mở được, không thấy nút Hoàn tất / Huỷ đơn / Đổi thưởng trong ngăn kéo bill.
7. Gõ tay `/admin/settings`, `/admin/staff`, `/admin/tables`, `/admin/vouchers`, `/admin/kitchen`, `/print/table-qr`: đều về POS.
8. Vào `/staff/order` gọi món hộ một bàn: đơn vào POS như đơn nhân viên.
9. Đăng nhập Thu ngân: trang Nhân viên vẫn không mở được; rail không đổi so với trước.
10. Chủ quán đổi Quản lý thành Phục vụ: lần tải trang kế tiếp, người đó về `/staff/order`. Đổi lại Quản lý, rồi Vô hiệu hoá: lần tải kế tiếp về đăng nhập.

- [ ] **Step 2: Thêm link `TESTING.md`, dòng quyết định `CLAUDE.md`, commit**

Dòng `CLAUDE.md`: mig 116 vai `store_manager` = thu ngân + back office (`is_store_back_office`, superadmin không tính); vá tại chỗ 4 hàm (`is_store_pos_operator`, `reservation_operator_actor_kind`, `pos_get_floor_layout`, `staff_create_order`); giữ chủ quán: `pos_save_floor_layout`, `revoke_reservation_customer_access`, cài đặt quán, A04 `canManage`; guard web `requireAdminPageOrRedirect('back_office')` / `requireBackOfficeStoreId()` cho module KHO/CA/NO/BC; ⚠️ action so vai bằng chuỗi phải giữ so sánh tường minh để `tsc` thu hẹp kiểu.

```bash
git add docs/testing/yen-garden/QUAN-LY.md TESTING.md CLAUDE.md
git commit -m "docs: checklist vai quan ly"
```

- [ ] **Step 3: Dừng, báo anh Tú**

"Xong rồi anh, test theo `docs/testing/yen-garden/QUAN-LY.md` nhé" — sau khi Controller đã áp mig 116 và deploy.

---

### Controller áp migration 116 (không phải việc của agent code)

1. Kiểm prod: `mevo_operators_role_check` chưa có `store_manager`; md5 6 hàm ở Task 1 Step 1 còn khớp (hoặc 4 neo vẫn khớp đúng 1 lần nếu hàm khác đổi vì lý do không liên quan).
2. Áp `116_store_manager_role.sql` (nội dung LF lấy bằng `git show`). Theo thứ tự hợp đồng: sau 112a/112b, trước 117.
3. Deploy Vercel **sau** khi áp. Code mới chạy trước migration thì "Thêm Quản lý" dính CHECK và báo lỗi; code cũ chạy sau migration không sao (chưa có dòng `store_manager` nào).
4. Kiểm: `SELECT pg_get_functiondef('public.is_store_pos_operator(uuid)'::regprocedure)` có `store_manager`; `SELECT has_function_privilege('anon', 'public.is_store_back_office(uuid)', 'EXECUTE')` = false; POS Bảo Lương bằng tài khoản chủ quán và thu ngân vẫn chạy như cũ.
