# MEVO Internal Backend — Onboarding Cockpit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **CLAUDE.md override — read before dispatching any subagent:** after ALL tasks in this plan are
> done (Task E committed), STOP. Do not merge, deploy, or start unrelated work. Tell anh Tú to test
> theo `TESTING.md` (mục "Sprint — Onboarding Cockpit" thêm ở Task E) and wait for "PASS" before
> continuing. This overrides subagent-driven-development's "continuous execution" default — that
> default is for moving between tasks *within* this plan, not for what happens after the plan is done.

**Goal:** Cho MEVO một backend nội bộ (`/mevo`) để quản lý nhiều quán/mini-app, dựa trên
`mevo_operators.role`, và vá lỗ hổng RLS chưa scope theo `store_id` — bắt buộc xong trước khi
onboard quán thứ 2 thật với tài khoản `store_owner` riêng.

**Architecture:** Vẫn 1 app Next.js `admin-web`. Thêm cột `role` vào `mevo_operators`, thêm route
`/mevo` (superadmin) song song `/admin` (store_owner) đã có. Sửa RLS ở tầng Postgres để scope theo
`store_id` (lớp khoá thật), sau đó mới sửa tầng ứng dụng (helper `requireOperator()`, bỏ mọi
fallback "quán active đầu tiên"). Cuối cùng vá 2 edge function còn đọc secret toàn cục.

**Tech Stack:** Next.js 14 (App Router) + Supabase (Postgres RLS, Auth, Edge Functions/Deno) +
Tailwind. Supabase project id: `dlkgdpexjtyynbotkwka` (region ap-south-1, tên "MEVO"). Không dùng
Supabase CLI local — migration áp thẳng lên remote qua MCP `apply_migration`, file `.sql` trong
`supabase/migrations/` chỉ là bản ghi lịch sử (đúng pattern 001→017 đã có).

**Spec gốc:** [docs/superpowers/specs/2026-07-01-mevo-internal-backend-onboarding-cockpit-design.md](../specs/2026-07-01-mevo-internal-backend-onboarding-cockpit-design.md)
(đã review + sửa — bản này là nguồn sự thật, bao gồm mục 3.4 RLS store-scoped mới thêm).

---

## Task A: DB Foundation — role, RLS store-scoped, bảng config mới

**Files:**
- Create: `supabase/migrations/018_operator_role.sql`
- Create: `supabase/migrations/019_store_scoped_rls.sql`
- Create: `supabase/migrations/020_store_app_configs.sql`
- Create: `supabase/migrations/021_store_zalo_configs.sql`
- Apply tất cả 4 file lên project `dlkgdpexjtyynbotkwka` qua MCP tool `apply_migration`
  (KHÔNG dùng `execute_sql` cho DDL).

Không có test tự động cho RLS trong repo này (không có harness Postgres test). Verify bằng
`execute_sql` (đọc dữ liệu, không phải DDL) mô phỏng — chi tiết ở Step 5.

- [ ] **Step 1: Migration 018 — thêm `role` cho `mevo_operators`**

Nội dung file `supabase/migrations/018_operator_role.sql`:

```sql
-- 018 — Onboarding Cockpit: thêm role cho mevo_operators.
-- role NULL ban đầu để backfill an toàn trước khi bật NOT NULL + constraint
-- (tránh tự khoá mình ra ngoài nếu backfill sai).

alter table mevo_operators
  add column if not exists role text,
  add column if not exists updated_at timestamptz not null default now();

update mevo_operators
set role = case when store_id is null then 'mevo_superadmin' else 'store_owner' end
where role is null;

alter table mevo_operators
  alter column role set not null;

alter table mevo_operators
  drop constraint if exists mevo_operators_role_check;
alter table mevo_operators
  add constraint mevo_operators_role_check
  check (role in ('mevo_superadmin', 'store_owner'));

alter table mevo_operators
  drop constraint if exists mevo_operators_role_store_check;
alter table mevo_operators
  add constraint mevo_operators_role_store_check
  check (
    (role = 'mevo_superadmin' and store_id is null)
    or
    (role = 'store_owner' and store_id is not null)
  );

drop trigger if exists mevo_operators_updated_at on mevo_operators;
create trigger mevo_operators_updated_at
  before update on mevo_operators
  for each row execute function update_updated_at();
```

Áp bằng MCP:

```
apply_migration(project_id="dlkgdpexjtyynbotkwka", name="operator_role", query=<nội dung file trên>)
```

Expected: không lỗi. Verify:

```
execute_sql(project_id="dlkgdpexjtyynbotkwka", query="select user_id, store_id, role from mevo_operators")
```
Kỳ vọng: mọi row hiện có (tài khoản MEVO hiện tại, `store_id IS NULL`) có `role = 'mevo_superadmin'`.
Nếu có row nào `store_id NOT NULL` thì phải ra `role = 'store_owner'`.

- [ ] **Step 2: Migration 019 — hàm store-scoped + viết lại toàn bộ policy dùng `is_operator()`**

`is_operator()` (từ migration 006) chỉ trả lời "có phải operator không" — không biết `store_id`.
Danh sách đầy đủ policy đang dùng `is_operator()` (đã grep xác nhận, không sót):
`stores.auth_read_all_stores`, `tables.auth_read_all_tables/auth_insert_tables/auth_update_tables/auth_delete_tables`,
`menu_categories.auth_read_all_categories/auth_insert_menu_categories`,
`menu_items.auth_read_all_items/auth_insert_menu_items/auth_update_menu_items/auth_delete_menu_items`,
`orders.auth_update_orders/auth_read_orders`, `order_items.auth_read_order_items`,
`service_requests.auth_select_service_requests`, `toppings.auth_read_toppings`,
`menu_item_toppings.auth_read_mit`.

Nội dung file `supabase/migrations/019_store_scoped_rls.sql`:

```sql
-- 019 — RLS phải scope theo store_id, không chỉ "có phải operator không".
-- Trước file này: store_owner của quán A gọi thẳng Supabase (không qua admin-web) vẫn
-- đọc/sửa được dữ liệu quán B, vì is_operator() không phân biệt quán nào.
-- Giữ nguyên is_operator() (còn dùng ở nơi khác/tương lai) — thêm hàm mới, không sửa hàm cũ.

create or replace function is_store_scoped_operator(target_store_id uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from mevo_operators
    where user_id = auth.uid()
      and (role = 'mevo_superadmin' or store_id = target_store_id)
  );
$$;

-- ── stores ──────────────────────────────────────────────────────────────
drop policy if exists "auth_read_all_stores" on stores;
create policy "auth_read_all_stores" on stores
  for select to authenticated using (is_store_scoped_operator(id));

-- ── tables ──────────────────────────────────────────────────────────────
drop policy if exists "auth_read_all_tables" on tables;
create policy "auth_read_all_tables" on tables
  for select to authenticated using (is_store_scoped_operator(store_id));
drop policy if exists "auth_insert_tables" on tables;
create policy "auth_insert_tables" on tables
  for insert to authenticated with check (is_store_scoped_operator(store_id));
drop policy if exists "auth_update_tables" on tables;
create policy "auth_update_tables" on tables
  for update to authenticated using (is_store_scoped_operator(store_id)) with check (is_store_scoped_operator(store_id));
drop policy if exists "auth_delete_tables" on tables;
create policy "auth_delete_tables" on tables
  for delete to authenticated using (is_store_scoped_operator(store_id));

-- ── menu_categories ─────────────────────────────────────────────────────
drop policy if exists "auth_read_all_categories" on menu_categories;
create policy "auth_read_all_categories" on menu_categories
  for select to authenticated using (is_store_scoped_operator(store_id));
drop policy if exists "auth_insert_menu_categories" on menu_categories;
create policy "auth_insert_menu_categories" on menu_categories
  for insert to authenticated with check (is_store_scoped_operator(store_id));

-- ── menu_items ──────────────────────────────────────────────────────────
drop policy if exists "auth_read_all_items" on menu_items;
create policy "auth_read_all_items" on menu_items
  for select to authenticated using (is_store_scoped_operator(store_id));
drop policy if exists "auth_insert_menu_items" on menu_items;
create policy "auth_insert_menu_items" on menu_items
  for insert to authenticated with check (is_store_scoped_operator(store_id));
drop policy if exists "auth_update_menu_items" on menu_items;
create policy "auth_update_menu_items" on menu_items
  for update to authenticated using (is_store_scoped_operator(store_id)) with check (is_store_scoped_operator(store_id));
drop policy if exists "auth_delete_menu_items" on menu_items;
create policy "auth_delete_menu_items" on menu_items
  for delete to authenticated using (is_store_scoped_operator(store_id));

-- ── orders / order_items ────────────────────────────────────────────────
drop policy if exists "auth_update_orders" on orders;
create policy "auth_update_orders" on orders
  for update to authenticated using (is_store_scoped_operator(store_id)) with check (is_store_scoped_operator(store_id));
drop policy if exists "auth_read_orders" on orders;
create policy "auth_read_orders" on orders
  for select to authenticated using (is_store_scoped_operator(store_id));
drop policy if exists "auth_read_order_items" on order_items;
create policy "auth_read_order_items" on order_items
  for select to authenticated using (
    exists (select 1 from orders o where o.id = order_items.order_id and is_store_scoped_operator(o.store_id))
  );

-- ── service_requests / toppings / menu_item_toppings ───────────────────
drop policy if exists "auth_select_service_requests" on service_requests;
create policy "auth_select_service_requests" on service_requests
  for select to authenticated using (is_store_scoped_operator(store_id));
drop policy if exists "auth_read_toppings" on toppings;
create policy "auth_read_toppings" on toppings
  for select to authenticated using (is_store_scoped_operator(store_id));
drop policy if exists "auth_read_mit" on menu_item_toppings;
create policy "auth_read_mit" on menu_item_toppings
  for select to authenticated using (is_store_scoped_operator(store_id));
```

Áp qua `apply_migration(project_id="dlkgdpexjtyynbotkwka", name="store_scoped_rls", query=<nội dung trên>)`.

- [ ] **Step 3: Migration 020 — bảng `store_app_configs`**

```sql
-- 020 — store_app_configs: metadata công khai (KHÔNG bí mật) theo từng quán cho /mevo.
create table if not exists store_app_configs (
  store_id uuid primary key references stores(id) on delete cascade,
  zalo_mini_app_name text,
  zmp_app_config jsonb not null default '{}'::jsonb,
  onboarding_status text not null default 'draft'
    check (onboarding_status in ('draft', 'in_progress', 'ready', 'live')),
  deployment_status text not null default 'not_deployed'
    check (deployment_status in ('not_deployed', 'deployed', 'submitted', 'published')),
  submitted_at timestamptz,
  published_at timestamptz,
  last_error text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table store_app_configs enable row level security;

drop policy if exists "operator_read_app_configs" on store_app_configs;
create policy "operator_read_app_configs" on store_app_configs
  for select to authenticated using (is_store_scoped_operator(store_id));
-- Ghi chỉ qua service_role trong server action /mevo — không tạo policy insert/update.

drop trigger if exists store_app_configs_updated_at on store_app_configs;
create trigger store_app_configs_updated_at
  before update on store_app_configs
  for each row execute function update_updated_at();
```

- [ ] **Step 4: Migration 021 — bảng `store_zalo_configs`**

```sql
-- 021 — store_zalo_configs: secret Zalo OA/webhook theo từng quán.
-- KHÔNG có cột zalo_oa_id — cột đó không phải secret, đã có sẵn trên stores.zalo_oa_id.
create table if not exists store_zalo_configs (
  store_id uuid primary key references stores(id) on delete cascade,
  zalo_oa_access_token text,
  zalo_app_secret_key text,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table store_zalo_configs enable row level security;
-- Cố ý KHÔNG tạo policy nào — chỉ service_role (bypass RLS) đọc/ghi được, giống store_checkout_configs.

revoke all on store_zalo_configs from anon, authenticated;

drop trigger if exists store_zalo_configs_updated_at on store_zalo_configs;
create trigger store_zalo_configs_updated_at
  before update on store_zalo_configs
  for each row execute function update_updated_at();
```

- [ ] **Step 5: Verify RLS bằng execute_sql (không có test harness Postgres trong repo)**

Không thể giả JWT session qua MCP `execute_sql` (nó chạy bằng service role, bypass RLS). Verify
gián tiếp bằng cách kiểm tra định nghĩa policy đã đổi đúng:

```
execute_sql(project_id="dlkgdpexjtyynbotkwka", query="
  select tablename, policyname, qual
  from pg_policies
  where policyname in (
    'auth_read_all_stores','auth_read_all_tables','auth_insert_tables','auth_update_tables',
    'auth_delete_tables','auth_read_all_categories','auth_insert_menu_categories',
    'auth_read_all_items','auth_insert_menu_items','auth_update_menu_items','auth_delete_menu_items',
    'auth_update_orders','auth_read_orders','auth_read_order_items',
    'auth_select_service_requests','auth_read_toppings','auth_read_mit'
  )
  order by tablename;
")
```

Expected: cột `qual` của MỌI dòng chứa `is_store_scoped_operator`, KHÔNG còn dòng nào chỉ có
`is_operator()` trần (trừ khi đã cố ý join qua `orders o` cho `order_items`, vẫn phải gọi
`is_store_scoped_operator` bên trong). Việc test thật với 2 session JWT khác nhau (quán A vs B)
để lại cho checklist thủ công ở Task E (cần 2 tài khoản Auth thật để lấy JWT authenticated, MCP
không tạo session người dùng được).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/018_operator_role.sql supabase/migrations/019_store_scoped_rls.sql supabase/migrations/020_store_app_configs.sql supabase/migrations/021_store_zalo_configs.sql
git commit -m "feat: mevo_operators.role + RLS store-scoped + store_app_configs/store_zalo_configs"
```

---

## Task B: App layer — `requireOperator()`, bỏ fallback, routing theo role

**Files:**
- Create: `admin-web/lib/auth/operator.ts`
- Modify: `admin-web/proxy.ts`
- Modify: `admin-web/app/(auth)/login/actions.ts`
- Modify: `admin-web/app/admin/layout.tsx`
- Modify: `admin-web/app/admin/dashboard/page.tsx:5-16`
- Modify: `admin-web/app/admin/tables/page.tsx:9-20`
- Modify: `admin-web/app/admin/menu/page.tsx:10-15`
- Modify: `admin-web/app/admin/settings/page.tsx:10-16`
- Modify: `admin-web/app/admin/orders/page.tsx:29-35`
- Modify: `admin-web/app/admin/kitchen/page.tsx:12-16` (giữ phần fetch `storeName` phía sau)
- Modify: `admin-web/lib/actions/store.ts:10-22`
- Modify: `admin-web/lib/actions/menu.ts:27-41`
- Modify: `admin-web/lib/actions/tables.ts:6-18`

**Đây là task cơ khí (mechanical)** — cùng một phép biến đổi lặp lại ở nhiều file, phù hợp để
model rẻ hơn thực hiện nếu người điều phối muốn tiết kiệm chi phí.

- [ ] **Step 1: Tạo helper `admin-web/lib/auth/operator.ts`**

```ts
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export type Operator =
  | { userId: string; role: 'mevo_superadmin'; storeId: null }
  | { userId: string; role: 'store_owner'; storeId: string }

async function loadOperator(): Promise<
  { user: { id: string }; op: { role: string; store_id: string | null } } | null
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: op } = await supabase
    .from('mevo_operators')
    .select('role, store_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!op) return null

  return { user: { id: user.id }, op }
}

function toOperator(userId: string, op: { role: string; store_id: string | null }): Operator | null {
  if (op.role === 'mevo_superadmin' && op.store_id === null) {
    return { userId, role: 'mevo_superadmin', storeId: null }
  }
  if (op.role === 'store_owner' && op.store_id) {
    return { userId, role: 'store_owner', storeId: op.store_id }
  }
  return null
}

// Dùng trong Server Component (page.tsx/layout.tsx) — redirect thay vì throw.
export async function requireOperatorOrRedirect(): Promise<Operator> {
  const loaded = await loadOperator()
  if (!loaded) redirect('/login?error=not_operator')
  const operator = toOperator(loaded.user.id, loaded.op)
  if (!operator) redirect('/login?error=not_operator')
  return operator
}

// Dùng trong Server Action — throw (action không redirect được khi gọi từ Client Component).
export async function requireOperator(): Promise<Operator> {
  const loaded = await loadOperator()
  if (!loaded) throw new Error('Tài khoản chưa được cấp quyền vận hành')
  const operator = toOperator(loaded.user.id, loaded.op)
  if (!operator) throw new Error('Tài khoản chưa được cấp quyền vận hành')
  return operator
}

// Dùng trong action/page CHỈ dành cho /admin — fail closed nếu không phải store_owner.
export async function requireStoreOwnerStoreId(): Promise<string> {
  const operator = await requireOperator()
  if (operator.role !== 'store_owner') throw new Error('Chỉ chủ quán mới thao tác được ở đây')
  return operator.storeId
}
```

- [ ] **Step 2: Sửa `admin-web/proxy.ts` — routing theo role**

Thay toàn bộ nội dung file (giữ nguyên phần khởi tạo `supabase`/`supabaseResponse` ở đầu, chỉ đổi
phần logic operator + redirect):

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // Refresh session (bắt buộc — đừng xoá)
  const { data: { user } } = await supabase.auth.getUser()

  const isAdminRoute = request.nextUrl.pathname.startsWith('/admin')
  const isMevoRoute = request.nextUrl.pathname.startsWith('/mevo')
  const isLoginPage = request.nextUrl.pathname === '/login'

  // Role-aware routing (Onboarding Cockpit): mevo_operators.role quyết định /admin hay /mevo.
  // RLS (019) mới là lớp khoá thật — đây vẫn chỉ là cổng UX để redirect sớm.
  let role: 'mevo_superadmin' | 'store_owner' | null = null
  if (user && (isAdminRoute || isMevoRoute || isLoginPage)) {
    const { data: op } = await supabase
      .from('mevo_operators')
      .select('role, store_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (op?.role === 'mevo_superadmin' && op.store_id === null) role = 'mevo_superadmin'
    else if (op?.role === 'store_owner' && op.store_id) role = 'store_owner'
  }

  // Vào /admin mà chưa đăng nhập, không phải operator, HOẶC là superadmin (không có store riêng) → /login
  if (isAdminRoute && (!user || role !== 'store_owner')) {
    const url = new URL('/login', request.url)
    if (user && !role) url.searchParams.set('error', 'not_operator')
    return NextResponse.redirect(url)
  }

  // Vào /mevo mà không phải superadmin → /login
  if (isMevoRoute && (!user || role !== 'mevo_superadmin')) {
    const url = new URL('/login', request.url)
    if (user && !role) url.searchParams.set('error', 'not_operator')
    return NextResponse.redirect(url)
  }

  // Đã đăng nhập và có role mà vào /login → về đúng khu (KHÔNG bounce non-operator, tránh vòng lặp)
  if (isLoginPage && user && role === 'mevo_superadmin') {
    return NextResponse.redirect(new URL('/mevo', request.url))
  }
  if (isLoginPage && user && role === 'store_owner') {
    return NextResponse.redirect(new URL('/admin', request.url))
  }

  return supabaseResponse
}

export const config = {
  // Chạy proxy trên mọi route, trừ static files
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

- [ ] **Step 3: Sửa `admin-web/app/(auth)/login/actions.ts` — redirect theo role**

Thay khối kiểm tra operator (giữ nguyên phần `signIn`/`signOut` khác):

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function signIn(formData: FormData) {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.signInWithPassword({
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  })

  if (error || !data.user) {
    return { error: 'Email hoặc mật khẩu không đúng' }
  }

  const { data: op } = await supabase
    .from('mevo_operators')
    .select('role, store_id')
    .eq('user_id', data.user.id)
    .maybeSingle()

  const isValidSuperadmin = op?.role === 'mevo_superadmin' && op.store_id === null
  const isValidStoreOwner = op?.role === 'store_owner' && !!op.store_id

  if (!isValidSuperadmin && !isValidStoreOwner) {
    await supabase.auth.signOut()
    return { error: 'Tài khoản chưa được cấp quyền vận hành. Liên hệ MEVO để được cấp quyền.' }
  }

  // Không gọi redirect() trong Server Action được invoke từ Client Component —
  // React 19 sẽ treat NEXT_REDIRECT throw như unhandled error.
  // Trả về success + đích đến, để client tự navigate.
  return { success: true, redirectTo: isValidSuperadmin ? '/mevo' : '/admin' }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
```

Kiểm tra file client gọi `signIn` (form login) có đọc `result.redirectTo` để `router.push` đúng —
nếu hiện tại nó luôn `router.push('/admin')`, sửa theo `result.redirectTo`. Tìm bằng:
`grep -rn "signIn(" admin-web/app/\(auth\)` để xác định file client component gọi hàm này rồi sửa.

- [ ] **Step 4: Sửa `admin-web/app/admin/layout.tsx` — bỏ fallback, dùng helper**

Thay toàn bộ phần đầu file (giữ nguyên phần JSX sidebar phía dưới không đổi):

```tsx
import { requireOperatorOrRedirect } from '@/lib/auth/operator'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { signOut } from '@/app/(auth)/login/actions'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const operator = await requireOperatorOrRedirect()
  if (operator.role !== 'store_owner') {
    // Superadmin lỡ vào /admin — đưa về đúng khu, không fallback vào "quán đầu tiên".
    const { redirect } = await import('next/navigation')
    redirect('/mevo')
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let storeName = 'Quán của tôi'
  const { data } = await supabase.from('stores').select('name').eq('id', operator.storeId).single()
  if (data) storeName = data.name

  // ... giữ nguyên phần return JSX phía dưới, dùng user!.email và storeName như cũ
```

Lưu ý: `user` sau `requireOperatorOrRedirect()` chắc chắn tồn tại (helper đã redirect nếu không),
nhưng TypeScript không biết — giữ `const { data: { user } } = await supabase.auth.getUser()` để có
kiểu `user.email` dùng ở JSX, tránh non-null assertion tràn lan.

- [ ] **Step 5: Sửa các page.tsx còn fallback — áp cùng 1 pattern**

Pattern chung: xoá đoạn lấy `user` + fallback `is_active=true limit 1`, thay bằng:

```ts
const operator = await requireOperatorOrRedirect()
if (operator.role !== 'store_owner') redirect('/mevo')
const storeId = operator.storeId
```

(cần `import { requireOperatorOrRedirect } from '@/lib/auth/operator'` và `import { redirect } from 'next/navigation'`
ở đầu file nếu chưa có).

Áp dụng cụ thể:

- `admin-web/app/admin/dashboard/page.tsx:5-16` — xoá hẳn hàm `getStoreId(supabase)` (dòng 5-16) và
  ở `DashboardPage` (hiện đang gọi `const storeId = await getStoreId(supabase)` + check `!storeId`)
  thay bằng pattern trên. `supabase`/`admin` client phía dưới giữ nguyên.
- `admin-web/app/admin/tables/page.tsx:9-20` — thay khối lấy `storeId`/`storeSlug` (dòng 9-20).
  Sau khi có `storeId` từ operator, vẫn cần fetch `slug` riêng: `const { data: storeRow } = await supabase.from('stores').select('slug').eq('id', storeId).single(); const storeSlug = storeRow?.slug ?? ''`.
- `admin-web/app/admin/menu/page.tsx:10-15` — thay khối lấy `storeId` (dòng 10-15) bằng pattern trên.
- `admin-web/app/admin/settings/page.tsx:10-16` — thay khối lấy `storeId` (dòng 10-16) bằng pattern trên.
- `admin-web/app/admin/orders/page.tsx:29-35` — thay khối lấy `storeId` (dòng 29-35) bằng pattern trên.
- `admin-web/app/admin/kitchen/page.tsx:12-16` — thay khối lấy `storeId` (dòng 12-16) bằng pattern
  trên; GIỮ NGUYÊN phần code fetch `storeName` phía sau (dòng 17+) không đổi logic, chỉ dùng
  `storeId` mới thay cho biến cũ.

- [ ] **Step 6: Sửa 3 file server action còn fallback**

`admin-web/lib/actions/store.ts:10-22` — thay hàm `getStoreId()`:

```ts
async function getStoreId(): Promise<string> {
  return requireStoreOwnerStoreId()
}
```

(thêm `import { requireStoreOwnerStoreId } from '@/lib/auth/operator'`, có thể xoá import
`createAdminClient` nếu không còn dùng nơi khác trong file — kiểm tra trước khi xoá).

Áp tương tự cho `admin-web/lib/actions/menu.ts:27-41` và `admin-web/lib/actions/tables.ts:6-18` —
cùng 1 thay đổi: thân hàm `getStoreId()` chỉ còn `return requireStoreOwnerStoreId()`.

- [ ] **Step 7: Chạy lint + build để bắt lỗi kiểu/import thừa**

```bash
cd admin-web && npm run lint && npm run build
```

Expected: không lỗi TypeScript/ESLint. Nếu `createAdminClient`/`createClient` import thừa (không
còn dùng biến `supabase` cũ trong 1 file nào đó), xoá import thừa đó.

- [ ] **Step 8: Commit**

```bash
git add admin-web/lib/auth/operator.ts admin-web/proxy.ts "admin-web/app/(auth)/login/actions.ts" admin-web/app/admin/layout.tsx admin-web/app/admin/dashboard/page.tsx admin-web/app/admin/tables/page.tsx admin-web/app/admin/menu/page.tsx admin-web/app/admin/settings/page.tsx admin-web/app/admin/orders/page.tsx admin-web/app/admin/kitchen/page.tsx admin-web/lib/actions/store.ts admin-web/lib/actions/menu.ts admin-web/lib/actions/tables.ts
git commit -m "fix: requireOperator() theo role, bỏ toàn bộ fallback quán active đầu tiên"
```

---

## Task C: `/mevo` Onboarding Cockpit UI

**Files:**
- Create: `admin-web/app/mevo/layout.tsx`
- Create: `admin-web/app/mevo/page.tsx`
- Create: `admin-web/app/mevo/stores/page.tsx`
- Create: `admin-web/app/mevo/stores/new/page.tsx`
- Create: `admin-web/app/mevo/stores/[storeId]/page.tsx`
- Create: `admin-web/lib/actions/mevo-stores.ts`

- [ ] **Step 1: Layout `/mevo` — guard + sidebar tối giản**

```tsx
// admin-web/app/mevo/layout.tsx
import { requireOperatorOrRedirect } from '@/lib/auth/operator'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { signOut } from '@/app/(auth)/login/actions'

export default async function MevoLayout({ children }: { children: React.ReactNode }) {
  const operator = await requireOperatorOrRedirect()
  if (operator.role !== 'mevo_superadmin') redirect('/admin')

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <aside className="flex w-56 flex-shrink-0 flex-col border-r border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-6 py-5">
          <p className="text-xs font-bold uppercase tracking-wider text-orange-500">MEVO</p>
          <p className="text-sm font-semibold text-gray-800">Backend nội bộ</p>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          <Link href="/mevo" className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-orange-50 hover:text-orange-600">
            📊 Dashboard
          </Link>
          <Link href="/mevo/stores" className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-orange-50 hover:text-orange-600">
            🏪 Danh sách quán
          </Link>
        </nav>
        <div className="border-t border-gray-100 px-3 py-4">
          <form action={signOut}>
            <button type="submit" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-red-500 hover:bg-red-50">
              🚪 Đăng xuất
            </button>
          </form>
        </div>
      </aside>
      <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  )
}
```

- [ ] **Step 2: Dashboard `/mevo` — thống kê tổng quan**

```tsx
// admin-web/app/mevo/page.tsx
import { createAdminClient } from '@/lib/supabase/server'

export default async function MevoDashboard() {
  const admin = createAdminClient()

  const { count: totalStores } = await admin.from('stores').select('id', { count: 'exact', head: true })
  const { data: appConfigs } = await admin.from('store_app_configs').select('onboarding_status, deployment_status, last_error, store_id')
  const { data: checkoutConfigs } = await admin.from('store_checkout_configs').select('store_id, is_enabled')
  const { data: zaloConfigs } = await admin.from('store_zalo_configs').select('store_id, is_enabled')

  const published = (appConfigs ?? []).filter((c) => c.deployment_status === 'published').length
  const onboarding = (appConfigs ?? []).filter((c) => c.onboarding_status !== 'live').length
  const missingCheckout = (totalStores ?? 0) - (checkoutConfigs ?? []).filter((c) => c.is_enabled).length
  const missingOa = (totalStores ?? 0) - (zaloConfigs ?? []).filter((c) => c.is_enabled).length
  const lastErrors = (appConfigs ?? []).filter((c) => c.last_error)

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Dashboard — MEVO Onboarding Cockpit</h1>
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Tổng số quán" value={String(totalStores ?? 0)} icon="🏪" />
        <StatCard label="Đang onboarding" value={String(onboarding)} icon="🚧" />
        <StatCard label="Đã publish" value={String(published)} icon="✅" />
        <StatCard label="Thiếu thanh toán/OA" value={String(Math.max(missingCheckout, missingOa))} icon="⚠️" />
      </div>
      {lastErrors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="mb-2 text-sm font-semibold text-red-700">Lỗi deploy/publish gần nhất</p>
          {lastErrors.map((c) => (
            <p key={c.store_id} className="text-sm text-red-600">{c.store_id}: {c.last_error}</p>
          ))}
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <div className="mb-2 text-2xl">{icon}</div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="mt-1 text-xs font-medium text-gray-500">{label}</p>
    </div>
  )
}
```

- [ ] **Step 3: Danh sách quán `/mevo/stores`**

```tsx
// admin-web/app/mevo/stores/page.tsx
import { createAdminClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function MevoStoresPage() {
  const admin = createAdminClient()
  const { data: stores } = await admin
    .from('stores')
    .select('id, name, slug, is_active')
    .order('created_at', { ascending: false })

  const { data: appConfigs } = await admin.from('store_app_configs').select('store_id, onboarding_status, deployment_status')
  const { data: checkoutConfigs } = await admin.from('store_checkout_configs').select('store_id, is_enabled, zalo_mini_app_id')
  const { data: zaloConfigs } = await admin.from('store_zalo_configs').select('store_id, is_enabled')

  const appMap = new Map((appConfigs ?? []).map((c) => [c.store_id, c]))
  const checkoutMap = new Map((checkoutConfigs ?? []).map((c) => [c.store_id, c]))
  const zaloMap = new Map((zaloConfigs ?? []).map((c) => [c.store_id, c]))

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Danh sách quán</h1>
        <Link href="/mevo/stores/new" className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600">
          + Tạo quán mới
        </Link>
      </div>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Tên quán</th>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">Mini App ID</th>
              <th className="px-4 py-3">Checkout</th>
              <th className="px-4 py-3">OA</th>
              <th className="px-4 py-3">Deploy</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {(stores ?? []).map((store) => {
              const checkout = checkoutMap.get(store.id)
              const zalo = zaloMap.get(store.id)
              const app = appMap.get(store.id)
              return (
                <tr key={store.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-medium text-gray-800">{store.name}</td>
                  <td className="px-4 py-3 text-gray-500">{store.slug}</td>
                  <td className="px-4 py-3 text-gray-500">{checkout?.zalo_mini_app_id ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Badge ok={!!checkout?.is_enabled} okLabel="Đã cấu hình" noLabel="Chưa cấu hình" />
                  </td>
                  <td className="px-4 py-3">
                    <Badge ok={!!zalo?.is_enabled} okLabel="Đã cấu hình" noLabel="Chưa cấu hình" />
                  </td>
                  <td className="px-4 py-3 text-gray-500">{app?.deployment_status ?? 'not_deployed'}</td>
                  <td className="px-4 py-3">
                    <Link href={`/mevo/stores/${store.id}`} className="text-orange-500 hover:underline">Chi tiết →</Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Badge({ ok, okLabel, noLabel }: { ok: boolean; okLabel: string; noLabel: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ok ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
      {ok ? okLabel : noLabel}
    </span>
  )
}
```

- [ ] **Step 4: Server actions `admin-web/lib/actions/mevo-stores.ts`**

```ts
'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { requireOperator } from '@/lib/auth/operator'
import { revalidatePath } from 'next/cache'

async function requireSuperadmin() {
  const operator = await requireOperator()
  if (operator.role !== 'mevo_superadmin') throw new Error('Chỉ MEVO superadmin mới thao tác được ở đây')
}

// Tạo quán mới: row `stores` + config rỗng `store_app_configs`.
export async function createStore(formData: FormData) {
  await requireSuperadmin()
  const admin = createAdminClient()

  const name = (formData.get('name') as string).trim()
  const slug = (formData.get('slug') as string).trim()
  const phone = (formData.get('phone') as string | null)?.trim() || null
  const address = (formData.get('address') as string | null)?.trim() || null
  if (!name || !slug) throw new Error('Thiếu tên quán hoặc slug')

  const { data: store, error } = await admin
    .from('stores')
    .insert({ name, slug, phone, address, is_active: false })
    .select('id')
    .single()
  if (error) throw new Error(`createStore: ${error.message}`)

  const { error: cfgError } = await admin.from('store_app_configs').insert({ store_id: store.id })
  if (cfgError) throw new Error(`createStore(config): ${cfgError.message}`)

  revalidatePath('/mevo/stores')
  return store.id as string
}

// Sửa thông tin cơ bản quán
export async function updateStoreBasicInfo(storeId: string, formData: FormData) {
  await requireSuperadmin()
  const admin = createAdminClient()
  const patch = {
    name: (formData.get('name') as string).trim(),
    phone: (formData.get('phone') as string | null)?.trim() || null,
    address: (formData.get('address') as string | null)?.trim() || null,
    is_active: formData.get('is_active') === 'on',
  }
  const { error } = await admin.from('stores').update(patch).eq('id', storeId)
  if (error) throw new Error(`updateStoreBasicInfo: ${error.message}`)
  revalidatePath(`/mevo/stores/${storeId}`)
}

// Cập nhật app config công khai (không bí mật)
export async function updateAppConfig(storeId: string, formData: FormData) {
  await requireSuperadmin()
  const admin = createAdminClient()
  const patch = {
    zalo_mini_app_name: (formData.get('zalo_mini_app_name') as string | null)?.trim() || null,
    onboarding_status: formData.get('onboarding_status') as string,
    deployment_status: formData.get('deployment_status') as string,
    notes: (formData.get('notes') as string | null)?.trim() || null,
  }
  const { error } = await admin.from('store_app_configs').upsert({ store_id: storeId, ...patch })
  if (error) throw new Error(`updateAppConfig: ${error.message}`)
  revalidatePath(`/mevo/stores/${storeId}`)
}

// Ghi/cập nhật secret Checkout — KHÔNG BAO GIỜ trả lại secret cho client.
export async function updateCheckoutConfig(storeId: string, formData: FormData) {
  await requireSuperadmin()
  const admin = createAdminClient()
  const zaloMiniAppId = (formData.get('zalo_mini_app_id') as string).trim()
  const secret = (formData.get('zalo_checkout_secret_key') as string | null)?.trim()
  if (!zaloMiniAppId) throw new Error('Thiếu Zalo Mini App ID')

  const patch: Record<string, unknown> = { store_id: storeId, zalo_mini_app_id: zaloMiniAppId, is_enabled: true }
  if (secret) patch.zalo_checkout_secret_key = secret // chỉ ghi đè khi operator nhập giá trị mới

  const { error } = await admin.from('store_checkout_configs').upsert(patch)
  if (error) throw new Error(`updateCheckoutConfig: ${error.message}`)
  revalidatePath(`/mevo/stores/${storeId}`)
}

// Ghi/cập nhật secret Zalo OA/webhook — KHÔNG BAO GIỜ trả lại secret cho client.
export async function updateZaloConfig(storeId: string, formData: FormData) {
  await requireSuperadmin()
  const admin = createAdminClient()
  const oaAccessToken = (formData.get('zalo_oa_access_token') as string | null)?.trim()
  const appSecretKey = (formData.get('zalo_app_secret_key') as string | null)?.trim()

  const patch: Record<string, unknown> = { store_id: storeId, is_enabled: true }
  if (oaAccessToken) patch.zalo_oa_access_token = oaAccessToken
  if (appSecretKey) patch.zalo_app_secret_key = appSecretKey

  const { error } = await admin.from('store_zalo_configs').upsert(patch)
  if (error) throw new Error(`updateZaloConfig: ${error.message}`)
  revalidatePath(`/mevo/stores/${storeId}`)
}

// Gán tài khoản chủ quán: tạo Supabase Auth user nếu chưa có (email chưa tồn tại) rồi
// upsert vào mevo_operators với role store_owner. Trả về mật khẩu tạm SINH RA (chỉ 1 lần,
// không lưu lại được sau đó) để superadmin gửi cho chủ quán.
export async function assignStoreOwner(storeId: string, formData: FormData) {
  await requireSuperadmin()
  const admin = createAdminClient()
  const email = (formData.get('email') as string).trim().toLowerCase()
  if (!email) throw new Error('Thiếu email')

  const { data: existingList, error: listErr } = await admin.auth.admin.listUsers()
  if (listErr) throw new Error(`assignStoreOwner(list): ${listErr.message}`)
  const existing = existingList.users.find((u) => u.email?.toLowerCase() === email)

  let userId: string
  let tempPassword: string | null = null
  if (existing) {
    userId = existing.id
  } else {
    tempPassword = crypto.randomUUID().slice(0, 12)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    })
    if (createErr || !created.user) throw new Error(`assignStoreOwner(create): ${createErr?.message}`)
    userId = created.user.id
  }

  const { error: opError } = await admin
    .from('mevo_operators')
    .upsert({ user_id: userId, store_id: storeId, role: 'store_owner' })
  if (opError) throw new Error(`assignStoreOwner(operator): ${opError.message}`)

  revalidatePath(`/mevo/stores/${storeId}`)
  return { email, tempPassword }
}
```

- [ ] **Step 5: Trang tạo quán mới `/mevo/stores/new`**

```tsx
// admin-web/app/mevo/stores/new/page.tsx
'use client'

import { createStore } from '@/lib/actions/mevo-stores'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function NewStorePage() {
  const router = useRouter()
  const [error, setError] = useState('')

  async function action(formData: FormData) {
    try {
      const storeId = await createStore(formData)
      router.push(`/mevo/stores/${storeId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Có lỗi xảy ra')
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Tạo quán mới</h1>
      <form action={action} className="max-w-md space-y-4 rounded-xl border border-gray-200 bg-white p-6">
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}
        <Field label="Tên quán" name="name" required />
        <Field label="Slug (URL-friendly, vd: pho-ga-pubu)" name="slug" required />
        <Field label="Số điện thoại" name="phone" />
        <Field label="Địa chỉ" name="address" />
        <button type="submit" className="w-full rounded-xl bg-orange-500 px-4 py-2 font-semibold text-white hover:bg-orange-600">
          Tạo quán
        </button>
      </form>
    </div>
  )
}

function Field({ label, name, required }: { label: string; name: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <input name={name} required={required} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
    </label>
  )
}
```

- [ ] **Step 6: Trang chi tiết quán `/mevo/stores/[storeId]`**

```tsx
// admin-web/app/mevo/stores/[storeId]/page.tsx
import { createAdminClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import {
  updateStoreBasicInfo, updateAppConfig, updateCheckoutConfig, updateZaloConfig, assignStoreOwner,
} from '@/lib/actions/mevo-stores'

export default async function StoreDetailPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params
  const admin = createAdminClient()

  const { data: store } = await admin.from('stores').select('*').eq('id', storeId).single()
  if (!store) notFound()

  const { data: appConfig } = await admin.from('store_app_configs').select('*').eq('store_id', storeId).maybeSingle()
  const { data: checkoutConfig } = await admin.from('store_checkout_configs').select('zalo_mini_app_id, is_enabled, updated_at').eq('store_id', storeId).maybeSingle()
  const { data: zaloConfig } = await admin.from('store_zalo_configs').select('is_enabled, updated_at').eq('store_id', storeId).maybeSingle()
  const { data: operators } = await admin.from('mevo_operators').select('user_id').eq('store_id', storeId)

  const updateInfo = updateStoreBasicInfo.bind(null, storeId)
  const updateApp = updateAppConfig.bind(null, storeId)
  const updateCheckout = updateCheckoutConfig.bind(null, storeId)
  const updateZalo = updateZaloConfig.bind(null, storeId)
  const assignOwner = assignStoreOwner.bind(null, storeId)

  return (
    <div className="flex-1 space-y-6 overflow-y-auto p-6">
      <h1 className="text-2xl font-bold text-gray-900">{store.name}</h1>

      <Section title="Thông tin quán">
        <form action={updateInfo} className="space-y-3">
          <Field label="Tên" name="name" defaultValue={store.name} required />
          <Field label="Điện thoại" name="phone" defaultValue={store.phone ?? ''} />
          <Field label="Địa chỉ" name="address" defaultValue={store.address ?? ''} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_active" defaultChecked={store.is_active} /> Đang hoạt động
          </label>
          <SubmitButton />
        </form>
      </Section>

      <Section title="Mini App / Onboarding checklist">
        <form action={updateApp} className="space-y-3">
          <Field label="Tên Mini App (Zalo Dev)" name="zalo_mini_app_name" defaultValue={appConfig?.zalo_mini_app_name ?? ''} />
          <SelectField label="Trạng thái onboarding" name="onboarding_status" defaultValue={appConfig?.onboarding_status ?? 'draft'}
            options={['draft', 'in_progress', 'ready', 'live']} />
          <SelectField label="Trạng thái deploy" name="deployment_status" defaultValue={appConfig?.deployment_status ?? 'not_deployed'}
            options={['not_deployed', 'deployed', 'submitted', 'published']} />
          <TextArea label="Ghi chú" name="notes" defaultValue={appConfig?.notes ?? ''} />
          <SubmitButton />
        </form>
      </Section>

      <Section title="ZaloPay Checkout">
        <p className="mb-3 text-sm text-gray-500">
          Trạng thái: <StatusText ok={!!checkoutConfig?.is_enabled} />
          {checkoutConfig?.updated_at && ` — cập nhật lúc ${new Date(checkoutConfig.updated_at).toLocaleString('vi-VN')}`}
        </p>
        <form action={updateCheckout} className="space-y-3">
          <Field label="Zalo Mini App ID" name="zalo_mini_app_id" defaultValue={checkoutConfig?.zalo_mini_app_id ?? ''} required />
          <Field label="Checkout Secret Key (bỏ trống nếu không đổi)" name="zalo_checkout_secret_key" type="password" />
          <SubmitButton />
        </form>
      </Section>

      <Section title="Zalo OA / Webhook">
        <p className="mb-3 text-sm text-gray-500">
          OA ID hiện tại: {store.zalo_oa_id ?? '—'} (sửa ở "Thông tin quán" nếu cần đổi — không phải secret)
        </p>
        <p className="mb-3 text-sm text-gray-500">Trạng thái secret: <StatusText ok={!!zaloConfig?.is_enabled} /></p>
        <form action={updateZalo} className="space-y-3">
          <Field label="OA Access Token (bỏ trống nếu không đổi)" name="zalo_oa_access_token" type="password" />
          <Field label="App Secret Key — webhook (bỏ trống nếu không đổi)" name="zalo_app_secret_key" type="password" />
          <SubmitButton />
        </form>
      </Section>

      <Section title="Tài khoản chủ quán">
        <p className="mb-3 text-sm text-gray-500">
          {operators && operators.length > 0 ? `${operators.length} tài khoản đã gán` : 'Chưa gán tài khoản nào'}
        </p>
        <form action={assignOwner} className="space-y-3">
          <Field label="Email chủ quán" name="email" type="email" required />
          <SubmitButton label="Gán / tạo tài khoản" />
        </form>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="mb-4 text-lg font-semibold text-gray-800">{title}</h2>
      {children}
    </div>
  )
}

function Field({ label, name, defaultValue, required, type }: { label: string; name: string; defaultValue?: string; required?: boolean; type?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <input name={name} type={type ?? 'text'} defaultValue={defaultValue} required={required} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
    </label>
  )
}

function TextArea({ label, name, defaultValue }: { label: string; name: string; defaultValue?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <textarea name={name} defaultValue={defaultValue} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" rows={3} />
    </label>
  )
}

function SelectField({ label, name, defaultValue, options }: { label: string; name: string; defaultValue: string; options: string[] }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <select name={name} defaultValue={defaultValue} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  )
}

function SubmitButton({ label }: { label?: string }) {
  return (
    <button type="submit" className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600">
      {label ?? 'Lưu'}
    </button>
  )
}

function StatusText({ ok }: { ok: boolean }) {
  return <span className={ok ? 'font-medium text-green-600' : 'font-medium text-gray-400'}>{ok ? 'Đã cấu hình' : 'Chưa cấu hình'}</span>
}
```

Lưu ý bảo mật khi implement: các form action ở trên **không bao giờ** truyền
`zalo_checkout_secret_key`/`zalo_oa_access_token`/`zalo_app_secret_key` hiện có làm `defaultValue`
— input luôn để trống, đúng yêu cầu "không hiện lại secret" của spec.

`assignStoreOwner` trả về `tempPassword` nhưng trang hiện tại (Server Component form action cơ bản)
không hiển thị lại giá trị trả về ngay — nếu muốn hiện mật khẩu tạm 1 lần cho superadmin copy, cần
đổi `assignOwner` form sang Client Component tương tự `NewStorePage` (dùng `useState` hiện kết quả).
Làm việc này nếu implementer thấy cần thiết cho UX, không bắt buộc cho v1 (superadmin có thể tự đặt
lại mật khẩu qua Supabase Dashboard nếu cần).

- [ ] **Step 7: Lint + build**

```bash
cd admin-web && npm run lint && npm run build
```

- [ ] **Step 8: Commit**

```bash
git add admin-web/app/mevo admin-web/lib/actions/mevo-stores.ts
git commit -m "feat: /mevo onboarding cockpit — dashboard, danh sách quán, tạo/sửa quán, gán operator"
```

---

## Task D: Multi-tenant hoá `zns-notify` + `zalo-webhook` (blocker #2/#3)

**Files:**
- Modify: `supabase/functions/zns-notify/index.ts`
- Delete: `admin-web/app/api/zalo-webhook/route.ts`
- Create: `admin-web/app/api/zalo-webhook/[storeId]/route.ts`

- [ ] **Step 1: `zns-notify` đọc secret theo `store_id` thay vì `process.env`**

Trong `supabase/functions/zns-notify/index.ts`, sau đoạn lấy `order` (đã có `order.store_id` qua
join `stores`), thay đoạn:

```ts
    const oaAccessToken = Deno.env.get('ZALO_OA_ACCESS_TOKEN')
```

bằng:

```ts
    const { data: zaloConfig } = await supabase
      .from('store_zalo_configs')
      .select('zalo_oa_access_token, is_enabled')
      .eq('store_id', order.store_id)
      .maybeSingle()
    const oaAccessToken = zaloConfig?.is_enabled ? zaloConfig.zalo_oa_access_token : null
```

Phần code phía sau (`if (!zaloUserId || !oaAccessToken) { ... skip ... }`) giữ nguyên không đổi —
hành vi "thiếu thì skip, không báo lỗi" vẫn đúng khi quán chưa cấu hình `store_zalo_configs`.

Deploy lại function qua MCP:

```
deploy_edge_function(
  project_id="dlkgdpexjtyynbotkwka",
  name="zns-notify",
  entrypoint_path="index.ts",
  verify_jwt=false,
  files=[{ name: "index.ts", content: <nội dung file đã sửa> }]
)
```

(Giữ `verify_jwt=false` — function hiện tại không yêu cầu JWT, không đổi hành vi này.)

- [ ] **Step 2: `zalo-webhook` đổi sang route theo `storeId` trong URL**

Payload webhook (`event`, `userId`) không mang thông tin quán, và phải biết đúng secret TRƯỚC khi
verify chữ ký — nên phải định danh quán qua URL, không qua payload.

Xoá `admin-web/app/api/zalo-webhook/route.ts`, tạo `admin-web/app/api/zalo-webhook/[storeId]/route.ts`:

```ts
// Webhook Zalo App (developers.zalo.me) — bắt buộc URL trên domain đã duyệt.
// Mỗi quán có 1 app Zalo riêng → mỗi quán đăng ký 1 URL webhook riêng dạng
// https://<domain>/api/zalo-webhook/<storeId> trên Zalo Developer Console của app đó.
// Nhận event "user.revoke.consent": khách rút đồng ý & yêu cầu xoá dữ liệu.
// Tài liệu: https://miniapp.zaloplatforms.com/documents/open-apis/open/revoke-and-remove-user-data/
//
// Bảo mật: header X-ZEvent-Signature = sha256( <value sort theo key A→Z, nối lại> + zalo_app_secret_key ).
// Secret đọc theo storeId trong URL (store_zalo_configs), KHÔNG dùng biến môi trường toàn cục nữa.

import { createHash } from 'crypto'
import { createAdminClient } from '@/lib/supabase/server'

function expectedSignature(payload: Record<string, unknown>, apiKey: string): string {
  const content = Object.keys(payload)
    .sort()
    .map((k) => {
      const v = payload[k]
      return typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)
    })
    .join('')
  return createHash('sha256').update(`${content}${apiKey}`).digest('hex')
}

export async function GET() {
  return new Response('ok', { status: 200 })
}

export async function POST(request: Request, { params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params
  try {
    const admin = createAdminClient()

    const { data: config } = await admin
      .from('store_zalo_configs')
      .select('zalo_app_secret_key, is_enabled')
      .eq('store_id', storeId)
      .maybeSingle()

    if (!config?.is_enabled || !config.zalo_app_secret_key) {
      console.error(`[zalo-webhook] quán ${storeId} chưa cấu hình secret — ack nhưng bỏ qua`)
      return new Response('ok', { status: 200 })
    }

    const raw = await request.text()
    const payload = JSON.parse(raw) as Record<string, unknown>

    const sig = request.headers.get('x-zevent-signature') ?? ''
    const valid = sig === expectedSignature(payload, config.zalo_app_secret_key)

    if (!valid) {
      console.error(`[zalo-webhook] chữ ký không khớp cho quán ${storeId} — ack nhưng bỏ qua xử lý`)
      return new Response('ok', { status: 200 })
    }

    if (payload.event === 'user.revoke.consent' && payload.userId) {
      // Chỉ gỡ zalo_user_id (định danh Zalo) trong phạm vi ĐÚNG quán này — KHÔNG null
      // customer_name/phone (ràng buộc chk_customer_info_required), không đụng quán khác.
      const { error } = await admin
        .from('orders')
        .update({ zalo_user_id: null })
        .eq('zalo_user_id', String(payload.userId))
        .eq('store_id', storeId)
      if (error) console.error('[zalo-webhook] gỡ dữ liệu lỗi:', error.message)
      else console.log(`[zalo-webhook] đã gỡ zalo_user_id cho user ${payload.userId} tại quán ${storeId}`)
    }

    return new Response('ok', { status: 200 })
  } catch (e) {
    console.error(`[zalo-webhook] lỗi (quán ${storeId}):`, e)
    return new Response('ok', { status: 200 })
  }
}
```

Ghi chú vận hành (thêm vào phần "Onboarding checklist" ở Task C hoặc `docs/BACKLOG.md`, không phải
việc code): khi onboard quán mới, đăng ký URL webhook trên Zalo Dev Console của app đó là
`https://<domain hiện tại>/api/zalo-webhook/<storeId thật>` — lấy `storeId` sau khi đã `createStore`.

- [ ] **Step 3: Lint + build admin-web**

```bash
cd admin-web && npm run lint && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/zns-notify/index.ts admin-web/app/api/zalo-webhook
git commit -m "fix: zns-notify + zalo-webhook đọc secret theo store_id (blocker #2/#3)"
```

Sau commit, deploy `zns-notify` qua MCP như Step 1. `zalo-webhook` nằm trong `admin-web` (Vercel),
tự deploy theo pipeline hiện có khi push — không cần bước deploy riêng ở đây.

---

## Task E: Cập nhật `TESTING.md`

**Files:**
- Modify: `TESTING.md`

- [ ] **Step 1: Thêm mục checklist mới vào cuối `TESTING.md`**

```markdown
## SPRINT — Onboarding Cockpit (`/mevo`) — 2026-07-01

### Claude Code làm xong khi:
- Migration 018-021 đã áp lên Supabase (role, RLS store-scoped, store_app_configs, store_zalo_configs).
- `/mevo` chạy được: dashboard, danh sách quán, tạo quán, chi tiết quán, gán operator.
- `/admin` không còn fallback "quán active đầu tiên" ở bất kỳ trang/action nào.
- `zns-notify` và `zalo-webhook` đọc secret theo `store_id`, không còn dùng biến môi trường toàn cục.

### ✅ Checklist test — Anh Tú tự làm:

**Test 1 — Routing theo role**
1. Đăng nhập bằng tài khoản MEVO hiện tại (superadmin) → phải vào `/mevo`, không bị đẩy sang `/admin`.
2. Vào thẳng URL `/admin` khi đang là superadmin → phải bị đẩy về `/mevo` (không vào được).
3. Đăng xuất, thử vào `/mevo` hoặc `/admin` khi chưa đăng nhập → phải về `/login`.

**Test 2 — Tạo quán thử + gán operator**
1. Vào `/mevo/stores/new`, tạo 1 quán test (vd "Test Quán 2").
2. Vào chi tiết quán vừa tạo, điền Mini App ID + Checkout secret bất kỳ (giá trị test) → bấm Lưu.
3. Load lại trang → xác nhận ô secret **không hiện lại giá trị cũ**, chỉ thấy "Đã cấu hình".
4. Gán 1 email test làm chủ quán → nhận được tài khoản/mật khẩu tạm.
5. Đăng nhập bằng tài khoản chủ quán test đó → phải vào `/admin`, thấy đúng tên quán test (không
   phải Phở Gà Pubu).

**Test 3 — RLS store-scoped (quan trọng nhất — bắt buộc PASS trước khi onboard quán 2 thật)**
1. Mở DevTools (tab Network hoặc Console) khi đã đăng nhập bằng tài khoản chủ quán test (Test 2).
2. Copy `access_token` từ cookie/session, gọi thẳng Supabase REST
   (`GET {SUPABASE_URL}/rest/v1/stores?select=*` với header `apikey: <anon key>` và
   `Authorization: Bearer <access_token>` của tài khoản chủ quán test).
3. Kỳ vọng: CHỈ thấy row "Test Quán 2" (quán của chính họ), KHÔNG thấy "Phở Gà Pubu" hay quán khác.
4. Thử `PATCH` vào `menu_items` của Phở Gà Pubu (biết `id` món ăn thật) bằng session của tài khoản
   Test Quán 2 → phải bị từ chối (0 rows affected hoặc lỗi RLS), không được sửa thành công.

**Test 4 — Dọn quán test**
1. Xoá quán "Test Quán 2" và tài khoản operator test đã tạo (qua Supabase Dashboard hoặc SQL),
   không để lại rác trong production DB.

**Test 5 — ZNS + webhook (nếu có sẵn OA token thật để test)**
1. Đặt 1 đơn ở quán Phở Gà Pubu (quán thật, đã có `store_zalo_configs`), để bếp bấm "Xong".
2. Xác nhận vẫn nhận được tin nhắn Zalo như trước (hành vi không đổi vì đã có secret theo store_id).
```

- [ ] **Step 2: Commit**

```bash
git add TESTING.md
git commit -m "docs: checklist test Onboarding Cockpit + RLS store-scoped"
```

---

## Self-review (đã chạy trước khi giao việc)

- **Spec coverage:** Task A phủ mục 3.2/3.3/3.4/4.1/4.2 của spec (role, RLS, 2 bảng mới). Task B
  phủ mục 6/7 (auth flow, bỏ fallback). Task C phủ mục 5 (toàn bộ màn hình `/mevo` v1, trừ phần
  "tự động gọi Zalo/Vercel/ZMP deploy" — cố ý ngoài scope v1 theo mục 2 "Ngoài v1"). Task D phủ phần
  rollout step 11 (blocker #2/#3). Task E phủ mục 9 (testing) + bổ sung test RLS thật.
- **Không đưa vào plan này (đúng theo "Ngoài v1" của spec):** CRM đầy đủ, permission chi tiết theo
  hành động, tài khoản bếp trong `mevo_operators`, tự động hoá deploy Zalo/Vercel/ZMP trong UI.
- **Kiểm tra kiểu nhất quán:** `Operator` type dùng xuyên suốt Task B/C (`role`, `storeId`); tên hàm
  `requireOperatorOrRedirect` (Server Component) vs `requireOperator` (Server Action) vs
  `requireStoreOwnerStoreId` (action chỉ cho `/admin`) giữ đúng tên ở mọi chỗ dùng.
