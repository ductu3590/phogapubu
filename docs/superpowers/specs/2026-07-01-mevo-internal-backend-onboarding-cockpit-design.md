# MEVO Internal Backend - Onboarding Cockpit - Thiet ke

> Ngay 2026-07-01. Thiet ke bo quan tri noi bo cua MEVO de quan ly cac quan dang dung MEVO
> va giam sai sot khi nhan ban mini-app cho quan moi.

## 1. Boi canh

MEVO da co `admin-web` cho quan/chua quan van hanh menu, ban, QR, don hang va cai dat quan.
Tuy nhien mo hinh multi-instance da chot moi quan co mot Zalo Mini App va merchant ZaloPay rieng,
nen MEVO can mot backend noi bo de quan ly nhieu app/quyen/cau hinh bi mat theo tung `store_id`.

Yeu cau chinh:

- Dung tiep `admin-web`, khong tao app Next.js moi.
- Dung chung man hinh dang nhap `/login`.
- Sau dang nhap, dieu huong dua tren quyen trong `mevo_operators`.
- MEVO superadmin vao `/mevo`.
- Chu quan vao `/admin` va chi thay dung quan cua minh.
- Khong co dong trong `mevo_operators` thi khong vao duoc he quan tri, du co Supabase Auth user.
- Khong bat dang ky tu do. Tai khoan do MEVO tao/gan quyen.

## 2. Pham vi v1

Chon huong **Onboarding Cockpit**: day la lop quan tri noi bo gon, phuc vu 1-3 quan dau tien va van du
duong mo rong khi co nhieu quan hon.

Trong v1:

- Danh sach quan/mini-app MEVO dang van hanh.
- Tao quan moi o muc registry: store, slug, thong tin lien he, trang thai onboarding.
- Gan Supabase Auth user voi mot quan.
- Nhap/cap nhat cau hinh mini-app va cac secret theo tung quan.
- Checklist onboarding: tao store, nhap Mini App ID, nhap Zalo OA, nhap Checkout secret, tao QR, deploy, submit, publish.
- Xem trang thai publish/deploy va loi gan nhat.

Ngoai v1:

- CRM day du: hop dong, goi dich vu, billing, ticket ho tro, cham soc khach hang.
- Permission chi tiet theo tung hanh dong.
- Tai khoan nhan vien bep trong `mevo_operators`; bep tiep tuc dung URL/token rieng da co.
- Tu dong goi Zalo/Vercel/ZMP deploy trong UI. V1 chi luu cau hinh va checklist/trang thai thao tac.

## 3. Quyet dinh kien truc

### 3.1 Mot codebase, hai khu giao dien

`admin-web` tiep tuc la ung dung Next.js duy nhat cho quan tri web:

- `/login`: dang nhap chung.
- `/mevo`: backend noi bo cua MEVO.
- `/admin`: admin cua tung quan.
- `/kitchen/[storeSlug]`: giu luong bep hien tai dung token rieng.

Ly do:

- Tan dung Supabase Auth, server actions, service-role client, layout va deployment hien co.
- Tranh tao them app khi MVP con it quan.
- De chia se cac helper quan trong nhu `createClient`, `createAdminClient`, upload asset, QR.

### 3.2 Bang quyen `mevo_operators`

`mevo_operators` tro thanh nguon su that cho quyen quan tri.

Schema muc tieu:

```sql
alter table mevo_operators
  add column role text,
  add column updated_at timestamptz not null default now();

update mevo_operators
set role = case
  when store_id is null then 'mevo_superadmin'
  else 'store_owner'
end
where role is null;

alter table mevo_operators
  alter column role set not null;

alter table mevo_operators
  add constraint mevo_operators_role_check
  check (role in ('mevo_superadmin', 'store_owner'));

alter table mevo_operators
  add constraint mevo_operators_role_store_check
  check (
    (role = 'mevo_superadmin' and store_id is null)
    or
    (role = 'store_owner' and store_id is not null)
  );
```

Quy tac:

- `mevo_superadmin + store_id = NULL` -> vao `/mevo`.
- `store_owner + store_id = <id quan>` -> vao `/admin`.
- Co Auth nhung khong co operator row -> chan, redirect ve `/login?error=not_operator`.
- Khong co `store_staff` trong v1.
- Khong tao store noi bo cua MEVO; `store_id = NULL` la du ro rang cho superadmin.

### 3.3 Bo fallback "lay quan active dau tien"

Hien code co nhieu fallback kieu `stores where is_active = true limit 1` khi thieu `store_id`.
Khi co quan thu 2, fallback nay co the lam operator thao tac nham quan.

Quyet dinh:

- `/admin` va server actions cho quan phai lay `store_id` tu `mevo_operators` cua user hien tai.
- Neu role la `store_owner` nhung thieu `store_id`, fail closed.
- Neu role la `mevo_superadmin`, khong vao `/admin` mac dinh bang fallback quan dau tien; vao `/mevo`.
- Neu superadmin can mo admin cua mot quan de ho tro, lam sau bang route ro rang nhu `/mevo/stores/[storeId]/admin-link` hoac switch context co ghi nhan, khong dung fallback am tham.

## 4. Du lieu cau hinh mini-app

V1 nen tach cau hinh cong khai va secret.

### 4.1 Cau hinh cong khai/trang thai

Them bang moi `store_app_configs` hoac bo sung cac cot khong bi mat vao bang rieng theo `store_id`.
Khuyen nghi bang rieng:

```sql
create table store_app_configs (
  store_id uuid primary key references stores(id) on delete cascade,
  zalo_mini_app_id text unique,
  zalo_mini_app_name text,
  zalo_oa_id text,
  zalo_oa_url text,
  zmp_app_config jsonb not null default '{}'::jsonb,
  onboarding_status text not null default 'draft',
  deployment_status text not null default 'not_deployed',
  submitted_at timestamptz,
  published_at timestamptz,
  last_error text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Ghi chu:

- `zalo_oa_url` hien co tren `stores` co the giu tam de mini-app doc, nhung `/mevo` nen la noi quan ly nguon cau hinh tong.
- `zmp_app_config` chi chua metadata khong bi mat, vi du ten app, mau, domain, checklist deployment.

### 4.2 Secret theo tung quan

`store_checkout_configs` da ton tai va dung de luu:

- `zalo_mini_app_id`
- `zalo_checkout_secret_key`
- `is_enabled`

V1 `/mevo` co the ghi/cap nhat bang nay qua server action dung `service_role`.

Can them secret cho Zalo OA/webhook khi lam multi-tenant:

```sql
create table store_zalo_configs (
  store_id uuid primary key references stores(id) on delete cascade,
  zalo_oa_id text,
  zalo_oa_access_token text,
  zalo_app_secret_key text,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Bao mat:

- Bat RLS va khong tao policy cho anon/authenticated tren cac bang secret.
- Revoke grant mac dinh cho anon/authenticated neu co the:

```sql
revoke all on store_checkout_configs from anon, authenticated;
revoke all on store_zalo_configs from anon, authenticated;
```

- UI khong bao gio hien secret da luu. Chi hien trang thai "Da cau hinh" / "Chua cau hinh" va thoi gian cap nhat.
- Khi update secret, operator nhap lai gia tri moi; server action ghi de.

## 5. Man hinh `/mevo` v1

### 5.1 Dashboard

Hien tong quan:

- Tong so quan.
- So quan dang onboarding.
- So quan da publish.
- So quan thieu cau hinh thanh toan/OA.
- Loi deploy/publish gan nhat.

### 5.2 Danh sach quan

Bang danh sach:

- Ten quan, slug, trang thai active.
- Mini App ID.
- OA status.
- Checkout status.
- Deployment status.
- Publish status.
- Nut mo chi tiet.

Can co search/filter theo ten, slug, status.

### 5.3 Chi tiet quan

Tabs de giam roi:

- **Thong tin quan**: ten, slug, phone, address, logo, active.
- **Mini App**: Zalo Mini App ID, ten app, app config metadata, deployment status.
- **Zalo OA**: OA ID, OA URL, OA access token status, webhook secret status.
- **ZaloPay Checkout**: Mini App ID mapping, secret status, enabled/disabled.
- **Onboarding checklist**: cac buoc setup va ghi chu.
- **Tai khoan quan**: gan user Auth voi role `store_owner` cho store nay.

### 5.4 Tao quan moi

Wizard gon:

1. Nhap thong tin quan co ban.
2. Tao row `stores`.
3. Tao config rong trong `store_app_configs`.
4. Tao ban/QR mac dinh neu can.
5. Nhap credential ngay hoac de checklist "con thieu".

V1 khong can tu dong tao Zalo Mini App tren Zalo Developer; MEVO van tao thu cong ben Zalo roi nhap ID vao cockpit.

## 6. Auth flow

### 6.1 Sau login

`login/actions.ts` sau khi sign in:

1. Query `mevo_operators` theo `user_id`.
2. Khong co row -> sign out hoac redirect `/login?error=not_operator`.
3. `role = 'mevo_superadmin'` -> redirect `/mevo`.
4. `role = 'store_owner'` -> redirect `/admin`.

### 6.2 Proxy/layout guard

`proxy.ts`:

- Route `/mevo`: bat buoc user co operator row role `mevo_superadmin`.
- Route `/admin`: bat buoc user co operator row role `store_owner` va `store_id` khong null.
- Route `/login`: neu da dang nhap va co role thi redirect ve dung khu.

Layout:

- `app/mevo/layout.tsx`: lap lai guard server-side, fail closed.
- `app/admin/layout.tsx`: lap lai guard server-side, fail closed va lay store name theo `store_id`.

## 7. Tac dong code hien co

Can sua cac diem sau:

- `admin-web/proxy.ts`: them role-aware routing.
- `admin-web/app/(auth)/login/actions.ts`: redirect theo role.
- `admin-web/app/admin/layout.tsx`: bo fallback quan dau tien.
- Cac page/action admin dang doc `user.user_metadata?.store_id`: doi sang helper doc `mevo_operators`.
- Cac fallback `is_active=true limit 1`: xoa hoac thay bang fail closed.
- Tao helper server dung chung, vi du `requireOperator()`:

```ts
type Operator =
  | { userId: string; role: 'mevo_superadmin'; storeId: null }
  | { userId: string; role: 'store_owner'; storeId: string }
```

Helper nay la cach duy nhat page/server action lay quyen.

## 8. Rollout an toan

Thu tu:

1. Migration them `role`, `updated_at` cho `mevo_operators`.
2. Backfill row hien tai truoc khi bat `not null` va constraint:
   - User hien co co `store_id = NULL` -> `role = 'mevo_superadmin'`.
   - Neu sau nay co user quan -> `role = 'store_owner'`, `store_id` bat buoc.
3. Bat `role not null`, them role/store constraint.
4. Them helper `requireOperator()`.
5. Sua login/proxy/layout theo role.
6. Sua cac admin page/action bo fallback quan dau tien.
7. Them route `/mevo` read-only dashboard/list truoc.
8. Them form tao/sua store va config.
9. Them form update secret nhung khong hien lai secret.

## 9. Testing

Can them checklist rieng vao `TESTING.md` khi implement:

- `mevo_superadmin` dang nhap -> vao `/mevo`, khong bi day sang `/admin`.
- `store_owner` dang nhap -> vao `/admin`, khong vao duoc `/mevo`.
- User co Auth nhung khong co `mevo_operators` -> khong vao duoc `/admin` hoac `/mevo`.
- `store_owner` chi thay/sua dung store cua minh.
- Khong con fallback lay quan active dau tien.
- Tao quan moi trong `/mevo` tao dung row `stores` va config rong.
- Update Checkout secret -> UI chi hien "Da cau hinh", khong render secret.
- Tat/mat config Checkout -> mini-app/checkout fail co thong bao ro, khong crash.

## 10. Cau hoi da chot

- Dung `admin-web`, khong tao app rieng.
- Chon Onboarding Cockpit, khong lam CRM v1.
- Chon `role + store_id` trong `mevo_operators`.
- Khong co `store_staff` trong v1.
- Khong tao store noi bo cua MEVO.
- `mevo_superadmin` dung `store_id = NULL`.
- Auth user khong co operator row thi khong vao duoc he quan tri.
