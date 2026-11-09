import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'

// Fixture cho mig 112a/112b (thu tiền kết hợp) và các mig sau dựa vào bill_payments (ca, công nợ, báo cáo).
// Thứ tự dựng: role + auth → bảng tối thiểu (cột/CHECK chép từ prod) → hàm dựng tay → 9 bản chụp prod
// (prod-defs/112) → 112a → 112b nếu lock. Dữ liệu mẫu do từng test tự nạp qua session()/order().
const pgliteModule = process.env.PGLITE_MODULE
  ? pathToFileURL(process.env.PGLITE_MODULE).href
  : '@electric-sql/pglite'
const url = (path) => new URL(path, import.meta.url)
const fixedId = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`

export const SNAPSHOTS = [
  // Hàm LANGUAGE sql được kiểm thân lúc tạo → bảng phải có trước; plpgsql thì không.
  'bill_discount_amount', 'session_unpaid_subtotal', 'bills_report_table_label',
  'close_table_session', 'close_table_sessions_bulk', 'confirm_manual_payment', 'kitchen_confirm_payment',
  'get_bills_report', 'get_sessions_bill',
]

// ---------------------------------------------------------------------------
// Ngày kinh doanh: bản GIẢ theo mốc 00:00 giờ VN (đúng hành vi mig 111 khi quán chưa đặt giờ mở ngày).
// Để riêng một khối: fixture sau có thể bỏ khối này và nạp định nghĩa thật của mig 111 thay vào.
// Chữ ký khớp mig 111: current_business_date(uuid) → date, business_day_bounds(uuid, date) → (day_from, day_to).
// ---------------------------------------------------------------------------
export const BUSINESS_DAY_STUBS = `
  CREATE OR REPLACE FUNCTION public.current_business_date(p_store_id uuid)
  RETURNS date LANGUAGE sql STABLE SET search_path = public AS $$
    SELECT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  $$;
  CREATE OR REPLACE FUNCTION public.business_day_bounds(p_store_id uuid, p_date date)
  RETURNS TABLE(day_from timestamptz, day_to timestamptz) LANGUAGE sql STABLE SET search_path = public AS $$
    SELECT (p_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'),
           ((p_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  $$;
`

const BASE_SCHEMA = (ids) => `
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE kitchen;
  -- Supabase cấp thẳng EXECUTE cho các role này trên mọi hàm mới; REVOKE ... FROM PUBLIC một mình không gỡ được.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}'::jsonb);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

  CREATE TABLE stores(
    id uuid PRIMARY KEY, name text, address text, phone text,
    kitchen_can_confirm_cash boolean NOT NULL DEFAULT false
  );
  CREATE TABLE mevo_operators(user_id uuid PRIMARY KEY, store_id uuid, role text, is_active boolean DEFAULT true);
  CREATE TABLE tables(id uuid PRIMARY KEY, store_id uuid, table_number text);
  CREATE TABLE table_sessions(
    id uuid PRIMARY KEY, store_id uuid NOT NULL REFERENCES stores(id), table_id uuid,
    status text NOT NULL DEFAULT 'open', opened_at timestamptz NOT NULL DEFAULT now(),
    closed_at timestamptz, closed_by uuid, close_reason text,
    is_open_ordering boolean NOT NULL DEFAULT false,
    bill_discount_type text, bill_discount_value integer, bill_discount_set_by uuid, bill_discount_set_at timestamptz,
    CONSTRAINT table_sessions_id_store_unique UNIQUE (id, store_id),
    CONSTRAINT table_sessions_status_check CHECK (status = ANY (ARRAY['open'::text, 'closed'::text])),
    CONSTRAINT table_sessions_close_reason_check CHECK (((close_reason IS NULL) OR (close_reason = ANY (ARRAY['paid'::text, 'staff_reset'::text, 'expired'::text, 'merged'::text])))),
    CONSTRAINT table_sessions_closed_state CHECK ((((status = 'open'::text) AND (closed_at IS NULL) AND (close_reason IS NULL)) OR ((status = 'closed'::text) AND (closed_at IS NOT NULL) AND (close_reason IS NOT NULL)))),
    CONSTRAINT table_sessions_bill_discount_pair CHECK (((bill_discount_type IS NULL) = (bill_discount_value IS NULL))),
    CONSTRAINT table_sessions_bill_discount_type_check CHECK ((bill_discount_type = ANY (ARRAY['amount'::text, 'percent'::text])))
  );
  CREATE TABLE session_tables(session_id uuid, table_id uuid, is_open boolean NOT NULL DEFAULT true);
  CREATE TABLE reservations(
    id uuid PRIMARY KEY, store_id uuid, session_id uuid, status text, customer_name text, party_size integer,
    arrived_at timestamptz, completed_at timestamptz, completed_by uuid, updated_at timestamptz
  );
  CREATE TABLE orders(
    id uuid PRIMARY KEY, store_id uuid NOT NULL REFERENCES stores(id), table_id uuid, session_id uuid,
    status text NOT NULL, total_amount integer NOT NULL DEFAULT 0, discount_amount integer DEFAULT 0,
    bill_discount_amount integer NOT NULL DEFAULT 0, payment_amount integer,
    payment_method text NOT NULL DEFAULT 'cash', payment_instrument text,
    payment_received_at timestamptz, payment_received_by uuid, payment_received_via text,
    order_type text NOT NULL DEFAULT 'dine_in', order_source text NOT NULL DEFAULT 'customer_zalo',
    customer_name text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz, rejected_at timestamptz, rejection_reason_code text, rejection_reason_note text,
    CONSTRAINT orders_id_store_unique UNIQUE (id, store_id),
    CONSTRAINT orders_session_same_store FOREIGN KEY (session_id, store_id) REFERENCES table_sessions(id, store_id),
    CONSTRAINT orders_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'cooking'::text, 'ready'::text, 'paid'::text, 'cancelled'::text]))),
    -- Hai CHECK dưới chép nguyên văn prod (2026-11-09): ghi sai cặp via/by hay phương tiện lạ là lộ ra ở test.
    CONSTRAINT orders_payment_instrument_check CHECK ((payment_instrument = ANY (ARRAY['wallet'::text, 'bank'::text, 'momo'::text, 'vnpay'::text, 'cash'::text]))),
    CONSTRAINT orders_payment_received_state_check CHECK ((((payment_received_at IS NULL) AND (payment_received_via IS NULL) AND (payment_received_by IS NULL)) OR ((payment_received_at IS NOT NULL) AND (payment_received_via = ANY (ARRAY['owner'::text, 'staff'::text])) AND (payment_received_by IS NOT NULL)) OR ((payment_received_at IS NOT NULL) AND (payment_received_via = ANY (ARRAY['zalo_callback'::text, 'sepay'::text, 'kitchen'::text, 'legacy'::text])) AND (payment_received_by IS NULL))))
  );
  CREATE TABLE order_items(
    id uuid PRIMARY KEY, order_id uuid NOT NULL, item_name text NOT NULL, item_price integer NOT NULL,
    quantity integer NOT NULL, selected_toppings jsonb, void_type text, voided_at timestamptz, voided_by uuid, void_reason text
  );
  CREATE TABLE order_item_quantity_changes(
    id uuid PRIMARY KEY, store_id uuid, order_id uuid, order_item_id uuid, item_name text,
    old_quantity integer, new_quantity integer, reason text, changed_by uuid, changed_at timestamptz
  );

  -- Hàm quyền: đúng định nghĩa prod (2026-11-09).
  CREATE FUNCTION public.is_store_pos_operator(p_store_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
    select exists (select 1 from mevo_operators where user_id = auth.uid() and is_active
      and role in ('store_owner', 'store_cashier') and store_id = p_store_id);
  $$;
  CREATE FUNCTION public.is_store_scoped_operator(target_store_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
    select exists (select 1 from mevo_operators where user_id = auth.uid() and is_active
      and (role = 'mevo_superadmin' or store_id = target_store_id));
  $$;
  CREATE FUNCTION public.is_store_owner_or_admin(target_store_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
    select exists (select 1 from mevo_operators where user_id = auth.uid() and is_active
      and (role = 'mevo_superadmin' or (role = 'store_owner' and store_id = target_store_id)));
  $$;
  -- Bếp: prod đọc claim JWT; test đọc GUC test.kitchen_store.
  CREATE FUNCTION public.kitchen_store_id() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT NULLIF(current_setting('test.kitchen_store', true), '')::uuid $$;
  -- Đặt bàn: chỉ cần chạy được nhánh "khách đặt bàn đã đến" của close_table_session.
  CREATE FUNCTION public.reservation_public_json(p public.reservations) RETURNS jsonb LANGUAGE sql STABLE AS
    $$ SELECT jsonb_build_object('reservation_id', p.id, 'status', p.status) $$;
  CREATE FUNCTION public.reservation_active_table_summary(uuid) RETURNS jsonb LANGUAGE sql STABLE AS
    $$ SELECT '{}'::jsonb $$;
  CREATE FUNCTION public.append_reservation_event(uuid, uuid, uuid, text, text, jsonb, jsonb, text)
    RETURNS void LANGUAGE plpgsql AS $$ BEGIN END $$;

  INSERT INTO auth.users(id, email, raw_user_meta_data) VALUES
    ('${ids.owner}', 'chu@quan.vn', '{}'), ('${ids.cashier}', 'thungan@quan.vn', '{"full_name":"Thu ngân Lan"}'),
    ('${ids.staff}', 'nv@quan.vn', '{}'), ('${ids.otherOwner}', 'khac@quan.vn', '{}');
  INSERT INTO stores(id, name) VALUES ('${ids.store}', 'Yên Garden'), ('${ids.otherStore}', 'Quán khác');
  INSERT INTO mevo_operators VALUES
    ('${ids.owner}', '${ids.store}', 'store_owner', true), ('${ids.cashier}', '${ids.store}', 'store_cashier', true),
    ('${ids.staff}', '${ids.store}', 'store_staff', true), ('${ids.otherOwner}', '${ids.otherStore}', 'store_owner', true);
  INSERT INTO tables VALUES ('${ids.t1}', '${ids.store}', 'Bàn 1'), ('${ids.t2}', '${ids.store}', 'Bàn 2'),
    ('${ids.t3}', '${ids.store}', 'Bàn 3');
`

export async function openCollectDb({ lock = false, businessDay = BUSINESS_DAY_STUBS } = {}) {
  const { PGlite } = await import(pgliteModule)
  const db = new PGlite()
  // Mutable: test sau có thể thêm uid (vd. ids.manager) rồi tự INSERT mevo_operators.
  const ids = {
    owner: fixedId(1), cashier: fixedId(2), staff: fixedId(3), otherOwner: fixedId(4),
    store: fixedId(10), otherStore: fixedId(11),
    t1: fixedId(21), t2: fixedId(22), t3: fixedId(23),
  }

  await db.exec(BASE_SCHEMA(ids))
  await db.exec(businessDay)
  for (const name of SNAPSHOTS) {
    await db.exec(await readFile(url(`../prod-defs/112/${name}.sql`), 'utf8'))
  }
  // Quyền EXECUTE của 2 hàm xác nhận tay đúng như prod (2026-11-09): không anon; bếp gọi bằng role kitchen.
  await db.exec(`
    REVOKE ALL ON FUNCTION public.confirm_manual_payment(uuid) FROM PUBLIC, anon;
    REVOKE ALL ON FUNCTION public.kitchen_confirm_payment(uuid) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.kitchen_confirm_payment(uuid) TO kitchen;
  `)
  await db.exec(await readFile(url('../../migrations/112a_collect_table_bill.sql'), 'utf8'))
  if (lock) await db.exec(await readFile(url('../../migrations/112b_lock_old_paid_path.sql'), 'utf8'))

  const rid = () => randomUUID()

  async function login(uid) {
    await db.exec('RESET ROLE')
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [uid ?? ''])
    await db.exec('SET ROLE authenticated')
  }

  async function one(sql, params = []) {
    return (await db.query(sql, params)).rows[0]
  }

  async function count(fromExpr, params = []) {
    return Number((await one(`SELECT count(*) AS n FROM ${fromExpr}`, params)).n)
  }

  // Xoá sạch dữ liệu giao dịch (giữ quán, bàn, người dùng). Gọi trong beforeEach: test so số đếm tuyệt đối.
  async function reset() {
    await db.exec('RESET ROLE')
    await db.exec(`
      DELETE FROM order_item_quantity_changes; DELETE FROM order_items;
      DELETE FROM reservations; DELETE FROM orders;
      UPDATE table_sessions SET bill_payment_id = NULL;
      DELETE FROM bill_payment_lines; DELETE FROM bill_payments;
      DELETE FROM session_tables; DELETE FROM table_sessions;
    `)
  }

  async function session({ discount, expired = false, closeReason, table = ids.t1 } = {}) {
    const id = rid()
    const reason = closeReason ?? (expired ? 'expired' : null)
    const [dType, dValue] = discount ?? [null, null]
    await db.query(`INSERT INTO table_sessions(id, store_id, table_id, status, closed_at, close_reason,
        bill_discount_type, bill_discount_value)
      VALUES ($1, $2, $3, $4, CASE WHEN $5::text IS NULL THEN NULL ELSE now() END, $5, $6, $7)`,
    [id, ids.store, table, reason ? 'closed' : 'open', reason, dType, dValue])
    await db.query('INSERT INTO session_tables(session_id, table_id, is_open) VALUES ($1, $2, $3)', [id, table, !reason])
    return id
  }

  async function order(sessionId, amount, { status = 'confirmed', method = 'cash', instrument, paid = false } = {}) {
    const id = rid()
    await db.query(`INSERT INTO orders(id, store_id, table_id, session_id, status, total_amount, payment_amount,
        payment_method, payment_instrument, payment_received_at, payment_received_via, payment_received_by)
      VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8,
        CASE WHEN $9 THEN now() END, CASE WHEN $9 THEN 'owner' END, CASE WHEN $9 THEN $10::uuid END)`,
    [id, ids.store, sessionId ? ids.t1 : null, sessionId, status, amount, method,
      instrument ?? (paid ? 'cash' : null), paid, ids.cashier])
    return id
  }

  async function collect(sessionIds, lines, cashGiven, requestId, uid = ids.cashier) {
    await login(uid)
    try {
      return (await db.query('SELECT collect_table_bill($1::uuid[], $2::jsonb, $3::int, $4::uuid) AS r',
        [sessionIds, JSON.stringify(lines), cashGiven, requestId])).rows[0].r
    } finally {
      await db.exec('RESET ROLE')
    }
  }

  // Chủ quán bấm "Đã nhận tiền" cho một đơn (A04 / completeOrder).
  async function confirm(orderId, uid = ids.owner) {
    await login(uid)
    try {
      return (await db.query('SELECT confirm_manual_payment($1) AS r', [orderId])).rows[0].r
    } finally {
      await db.exec('RESET ROLE')
    }
  }

  // Bếp xác nhận: token bếp không có auth.uid(); quán lấy từ GUC test.kitchen_store (thay claim JWT).
  async function kitchenConfirm(orderId, storeId = ids.store) {
    await db.exec('RESET ROLE')
    await db.query("SELECT set_config('request.jwt.claim.sub', '', false)")
    await db.query("SELECT set_config('test.kitchen_store', $1, false)", [storeId])
    await db.exec('SET ROLE kitchen')
    try {
      return (await db.query('SELECT kitchen_confirm_payment($1) AS r', [orderId])).rows[0].r
    } finally {
      await db.exec('RESET ROLE')
      await db.query("SELECT set_config('test.kitchen_store', '', false)")
    }
  }

  return { db, ids, reset, login, session, order, collect, confirm, kitchenConfirm, rid, one, count }
}
