import { readFile, readdir } from 'node:fs/promises'
import { openCollectDb } from './collect-bill-db.mjs'

// Fixture cho mig 122 (ca + sổ thu chi) và 122b (nối phiếu nhập kho ↔ phiếu chi).
// Dựng trên openCollectDb (112a + 112b) rồi thêm những gì 122 cần mà helper thu tiền không có:
//   • store_workflow_settings + store_workflow_setting_events (như business-day-fixture.mjs) và bản chụp prod
//     store_workflow_snapshot sau mig 111 (prod-defs/122);
//   • ba hàm ngày kinh doanh ĐÚNG công thức mig 111 (đọc business_day_start), thay stub 00:00 của helper thu tiền;
//   • stub mig 116 đúng hợp đồng: is_store_back_office = chủ quán hoặc quản lý; is_store_pos_operator thêm quản lý.
// File migration nạp sau khi đổi CRLF → LF, giống cách controller áp (git show).
const url = (path) => new URL(path, import.meta.url)
const load = async (u) => (await readFile(u, 'utf8')).replace(/\r\n/g, '\n')
const fixedId = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`

// Ba hàm ngày kinh doanh: nguyên văn mig 111 (CREATE OR REPLACE vì helper thu tiền đã tạo bản stub).
const BUSINESS_DAY_111 = `
  CREATE OR REPLACE FUNCTION public.business_date_of(p_store_id uuid, p_at timestamptz)
  RETURNS date LANGUAGE sql STABLE SET search_path = public AS $$
    SELECT ((p_at AT TIME ZONE 'Asia/Ho_Chi_Minh') - COALESCE(
      (SELECT w.business_day_start FROM public.store_workflow_settings w WHERE w.store_id = p_store_id),
      time '00:00')::interval)::date;
  $$;
  CREATE OR REPLACE FUNCTION public.current_business_date(p_store_id uuid)
  RETURNS date LANGUAGE sql STABLE SET search_path = public AS $$
    SELECT public.business_date_of(p_store_id, now());
  $$;
  CREATE OR REPLACE FUNCTION public.business_day_bounds(p_store_id uuid, p_date date)
  RETURNS TABLE(day_from timestamptz, day_to timestamptz) LANGUAGE sql STABLE SET search_path = public AS $$
    SELECT b.day_from, b.day_from + interval '24 hours'
    FROM (
      SELECT ((p_date + COALESCE(
        (SELECT w.business_day_start FROM public.store_workflow_settings w WHERE w.store_id = p_store_id),
        time '00:00')) AT TIME ZONE 'Asia/Ho_Chi_Minh') AS day_from
    ) b;
  $$;
  REVOKE ALL ON FUNCTION public.business_date_of(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON FUNCTION public.current_business_date(uuid) FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON FUNCTION public.business_day_bounds(uuid, date) FROM PUBLIC, anon, authenticated;
`

const WORKFLOW = `
  -- Cột store_workflow_snapshot đọc (prod có sẵn, helper thu tiền không cần nên chưa có).
  ALTER TABLE stores ADD COLUMN payment_timing text NOT NULL DEFAULT 'postpay';
  ALTER TABLE stores ADD COLUMN payment_methods text[] NOT NULL DEFAULT '{cash}';
  ALTER TABLE stores ADD COLUMN is_accepting_orders boolean NOT NULL DEFAULT true;
  ALTER TABLE stores ADD COLUMN serving_hours jsonb NOT NULL DEFAULT '[]'::jsonb;

  -- Như business-day-fixture.mjs, cộng cột mig 111.
  CREATE TABLE store_workflow_settings(
    store_id uuid PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
    table_ordering_enabled boolean NOT NULL DEFAULT true,
    takeaway_enabled boolean NOT NULL DEFAULT true,
    shipping_enabled boolean NOT NULL DEFAULT true,
    reservations_enabled boolean NOT NULL DEFAULT false,
    reservation_preorder_enabled boolean NOT NULL DEFAULT false,
    minimum_advance_minutes integer NOT NULL DEFAULT 30,
    booking_horizon_days integer NOT NULL DEFAULT 7,
    slot_interval_minutes integer NOT NULL DEFAULT 15,
    default_table_capacity integer NOT NULL DEFAULT 6,
    planning_hold_minutes integer NOT NULL DEFAULT 180,
    kitchen_release_policy text NOT NULL DEFAULT 'automatic',
    staff_order_release_policy text NOT NULL DEFAULT 'automatic',
    open_ordering_on_arrival boolean NOT NULL DEFAULT true,
    table_session_idle_timeout_minutes integer NOT NULL DEFAULT 360,
    reservation_preorder_edit_cutoff_minutes integer NOT NULL DEFAULT 30,
    business_day_start time NOT NULL DEFAULT '00:00',
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid
  );
  CREATE TABLE store_workflow_setting_events(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    before_value jsonb NOT NULL, after_value jsonb NOT NULL, changed_by uuid NOT NULL,
    changed_via text NOT NULL CHECK (changed_via IN ('owner', 'mevo')),
    created_at timestamptz NOT NULL DEFAULT now()
  );
  -- Trigger mig 049: quán mới tự có dòng cài đặt.
  CREATE FUNCTION public.ensure_store_workflow_settings() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
  BEGIN
    INSERT INTO public.store_workflow_settings(store_id) VALUES (NEW.id) ON CONFLICT (store_id) DO NOTHING;
    RETURN NULL;
  END;
  $$;
  CREATE TRIGGER trg_stores_ensure_workflow_settings AFTER INSERT ON public.stores
    FOR EACH ROW EXECUTE FUNCTION public.ensure_store_workflow_settings();
  INSERT INTO store_workflow_settings(store_id) SELECT id FROM stores;
`

// Stub mig 116 đúng hợp đồng (cả SECURITY DEFINER và quyền EXECUTE).
const ROLES_116 = (ids) => `
  CREATE OR REPLACE FUNCTION public.is_store_back_office(p_store_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    select exists (select 1 from mevo_operators where user_id = auth.uid() and is_active
      and role in ('store_owner', 'store_manager') and store_id = p_store_id);
  $$;
  REVOKE ALL ON FUNCTION public.is_store_back_office(uuid) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.is_store_back_office(uuid) TO authenticated;
  CREATE OR REPLACE FUNCTION public.is_store_pos_operator(p_store_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
    select exists (select 1 from mevo_operators where user_id = auth.uid() and is_active
      and role in ('store_owner', 'store_cashier', 'store_manager') and store_id = p_store_id);
  $$;
  CREATE OR REPLACE FUNCTION public.is_store_owner_or_admin(target_store_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
    select exists (select 1 from mevo_operators where user_id = auth.uid() and is_active
      and role = 'store_owner' and store_id = target_store_id);
  $$;
  CREATE OR REPLACE FUNCTION public.is_store_owner_of(p_store_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
    select exists (select 1 from mevo_operators where user_id = auth.uid() and is_active
      and role = 'store_owner' and store_id = p_store_id);
  $$;
  INSERT INTO auth.users(id, email) VALUES ('${ids.manager}', 'quanly@quan.vn');
  INSERT INTO mevo_operators VALUES ('${ids.manager}', '${ids.store}', 'store_manager', true);
`

// through '122b': nạp thêm mig 118 (kho) TRƯỚC 122 như thứ tự prod, rồi 122b. `before122b(h)` chạy ngay trước khi nạp
// 122b (test backfill chèn phiếu nhập cũ ở đây).
export async function openCashShiftDb({ through = '122', lock = true, before122b = null } = {}) {
  const base = await openCollectDb({ lock })
  try {
    return await extend(base, through, before122b)
  } catch (err) {
    // Dựng hỏng (vd. $pre$ của mig dừng): đóng DB để không treo tiến trình test.
    await base.db.close()
    throw err
  }
}

// Cột / bảng mig 118 đọc mà helper thu tiền không có (theo helpers/inventory-fixture.mjs, đối chiếu prod 2026-11-09).
const KHO_EXTRAS = `
  ALTER TABLE mevo_operators ADD COLUMN display_name text;
  ALTER TABLE orders ADD COLUMN confirmed_at timestamptz;
  ALTER TABLE order_items ADD COLUMN menu_item_id uuid, ADD COLUMN variant_id uuid, ADD COLUMN variant_name text;
  CREATE TABLE menu_items(
    id uuid PRIMARY KEY, store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE, name text NOT NULL,
    CONSTRAINT menu_items_id_store_uniq UNIQUE (id, store_id)
  );
  CREATE TABLE menu_item_variants(
    id uuid PRIMARY KEY, store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    menu_item_id uuid NOT NULL, name text NOT NULL,
    CONSTRAINT miv_item_store_fkey FOREIGN KEY (menu_item_id, store_id) REFERENCES menu_items(id, store_id) ON DELETE CASCADE
  );
`

async function extend(base, through, before122b) {
  const { db, ids, login, rid, one } = base
  ids.manager = fixedId(5)

  await db.exec(WORKFLOW)
  await db.exec(await load(url('../prod-defs/122/store_workflow_snapshot.sql')))
  await db.exec(BUSINESS_DAY_111)
  await db.exec(ROLES_116(ids))
  // Supabase cấp sẵn mọi quyền bảng mới cho anon/authenticated: dựng lại để REVOKE của mig 122 được kiểm thật.
  await db.exec('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;')
  const migrations = url('../../migrations/')
  if (through === '122b') {
    await db.exec(KHO_EXTRAS)
    const kho = (await readdir(migrations)).filter((f) => /^118_.*\.sql$/.test(f)).sort()
    for (const f of kho) await db.exec(await load(new URL(f, migrations)))
  }
  await db.exec(await load(url('../../migrations/122_cash_shift_cashbook.sql')))

  // Chạy một câu dưới role authenticated với auth.uid() = uid; trả cả kết quả query.
  async function as(uid, sql, params = []) {
    await login(uid)
    try {
      return await db.query(sql, params)
    } finally {
      await db.exec('RESET ROLE')
    }
  }

  async function setShiftRequired(storeId, on) {
    await db.exec('RESET ROLE')
    await db.query(`INSERT INTO store_workflow_settings(store_id, require_cash_shift) VALUES ($1, $2)
      ON CONFLICT (store_id) DO UPDATE SET require_cash_shift = EXCLUDED.require_cash_shift`, [storeId, on])
  }

  async function setDayStart(storeId, hhmm) {
    await db.exec('RESET ROLE')
    await db.query(`INSERT INTO store_workflow_settings(store_id, business_day_start) VALUES ($1, $2::time)
      ON CONFLICT (store_id) DO UPDATE SET business_day_start = EXCLUDED.business_day_start`, [storeId, hhmm])
  }

  // Chèn thẳng một ca (bỏ qua RPC). Ca đóng thì điền đủ số đếm để qua CHECK.
  async function insertShift({
    storeId = ids.store, openedAt, status = 'open', continuedAt = null, openingCash = 0, openedBy = ids.cashier,
  } = {}) {
    await db.exec('RESET ROLE')
    const closed = status === 'closed'
    const r = await one(`INSERT INTO cash_shifts(store_id, status, opened_by, opened_at, opening_cash,
        closed_by, closed_at, counted_cash, expected_cash, difference, continued_by, continued_at)
      VALUES ($1, $2, $3, COALESCE($4::timestamptz, now()), $5,
        CASE WHEN $6 THEN $3::uuid END, CASE WHEN $6 THEN now() END,
        CASE WHEN $6 THEN 0 END, CASE WHEN $6 THEN 0 END, CASE WHEN $6 THEN 0 END,
        CASE WHEN $7::timestamptz IS NULL THEN NULL ELSE $3::uuid END, $7::timestamptz)
      RETURNING id`, [storeId, status, openedBy, openedAt ?? null, openingCash, closed, continuedAt])
    return r.id
  }

  async function category(storeId, name) {
    await db.exec('RESET ROLE')
    const r = await one('SELECT id FROM cash_book_categories WHERE store_id = $1 AND name = $2', [storeId, name])
    if (!r) throw new Error(`không có danh mục ${name}`)
    return r.id
  }

  // Xoá dữ liệu giao dịch của helper thu tiền + ca/phiếu; trả công tắc về mặc định; danh mục về đúng bộ seed
  // (test sửa / ẩn / thêm danh mục không lây sang test sau). Id danh mục đổi sau mỗi reset: luôn tra qua category().
  async function reset() {
    await base.reset()
    // 122b: phiếu nhập trỏ tới phiếu chi (FK) → xoá phiếu kho trước.
    if (through === '122b') await db.exec('DELETE FROM inventory_document_lines; DELETE FROM inventory_documents;')
    await db.exec(`
      DELETE FROM cash_book_entries; DELETE FROM cash_shifts;
      DELETE FROM cash_book_categories; SELECT seed_cash_book_categories(id) FROM stores;
      UPDATE store_workflow_settings SET require_cash_shift = false, business_day_start = '00:00';
    `)
  }

  const api = { ...base, ids, rid, reset, as, setShiftRequired, setDayStart, insertShift, category }
  if (through === '122b') {
    if (before122b) await before122b(api)
    await db.exec('RESET ROLE')
    await db.exec(await load(new URL('122b_inventory_cashbook.sql', migrations)))
  }
  return api
}
