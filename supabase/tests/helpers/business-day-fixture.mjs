import { readFile } from 'node:fs/promises'

// Fixture cho mig 111 (ngày kinh doanh), Task 5 dùng lại qua setupThrough111.
// Schema tối thiểu chép từ 100_bills_report.test.mjs + các cột mig 107 và store_workflow_snapshot đọc.
// Tách hai bước để test chụp được báo cáo TRƯỚC khi vá: setupBefore111 dừng ở bản chụp prod, apply111 chạy mig.
// Fixture chỉ dựng schema, dữ liệu mẫu do từng test tự nạp.
const url = (path) => new URL(path, import.meta.url)

export async function setupBefore111(db) {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    -- Supabase cấp thẳng EXECUTE cho 3 role này trên mọi hàm mới; REVOKE ... FROM PUBLIC một mình không gỡ được.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}'::jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE stores(
      id uuid PRIMARY KEY, payment_timing text NOT NULL DEFAULT 'postpay',
      payment_methods text[] NOT NULL DEFAULT '{cash}', is_accepting_orders boolean NOT NULL DEFAULT true,
      serving_hours jsonb NOT NULL DEFAULT '[]'::jsonb, is_active boolean DEFAULT true
    );
    CREATE TABLE mevo_operators(user_id uuid PRIMARY KEY, store_id uuid, role text, is_active boolean DEFAULT true);
    CREATE FUNCTION is_store_pos_operator(p_store_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT EXISTS(SELECT 1 FROM mevo_operators WHERE user_id = auth.uid() AND store_id = p_store_id
        AND role IN ('store_owner','store_cashier') AND is_active)
    $$;
    -- Hai hàm dưới đúng định nghĩa prod (2026-11-06).
    CREATE FUNCTION public.is_store_owner_of(p_store_id uuid) RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
      select exists (
        select 1 from mevo_operators
         where user_id = auth.uid()
           and is_active
           and role = 'store_owner'
           and store_id = p_store_id
      );
    $$;
    CREATE FUNCTION public.is_store_owner_or_admin(target_store_id uuid) RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
      select exists (
        select 1 from mevo_operators
        where user_id = auth.uid()
          and is_active
          and (
            role = 'mevo_superadmin'
            or (role = 'store_owner' and store_id = target_store_id)
          )
      );
    $$;
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
    CREATE TABLE tables(id uuid PRIMARY KEY, store_id uuid, table_number text);
    CREATE TABLE table_sessions(
      id uuid PRIMARY KEY, store_id uuid NOT NULL, table_id uuid, status text NOT NULL DEFAULT 'open',
      opened_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz, closed_by uuid, close_reason text,
      is_open_ordering boolean NOT NULL DEFAULT false
    );
    CREATE TABLE session_tables(session_id uuid, table_id uuid, is_open boolean NOT NULL DEFAULT true);
    CREATE TABLE reservations(id uuid PRIMARY KEY, store_id uuid, session_id uuid, customer_name text, party_size integer, arrived_at timestamptz);
    CREATE TABLE orders(
      id uuid PRIMARY KEY, store_id uuid NOT NULL, table_id uuid, session_id uuid, status text NOT NULL,
      total_amount integer NOT NULL DEFAULT 0, discount_amount integer DEFAULT 0,
      bill_discount_amount integer NOT NULL DEFAULT 0, payment_method text NOT NULL DEFAULT 'cash',
      payment_instrument text, payment_received_at timestamptz, payment_received_by uuid,
      order_type text NOT NULL DEFAULT 'dine_in', order_source text NOT NULL DEFAULT 'customer',
      customer_name text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz, rejected_at timestamptz, rejection_reason_code text, rejection_reason_note text
    );
    CREATE TABLE order_items(
      id uuid PRIMARY KEY, order_id uuid NOT NULL, item_name text NOT NULL, item_price integer NOT NULL,
      quantity integer NOT NULL, selected_toppings jsonb, void_type text, voided_at timestamptz, voided_by uuid, void_reason text
    );
    CREATE TABLE order_item_quantity_changes(
      id uuid PRIMARY KEY, store_id uuid, order_id uuid, order_item_id uuid, item_name text,
      old_quantity integer, new_quantity integer, reason text, changed_by uuid, changed_at timestamptz
    );
  `)
  await db.exec(await readFile(url('../../migrations/100_bills_report.sql'), 'utf8'))
  await db.exec(await readFile(url('../prod-defs/111/get_bills_report.sql'), 'utf8'))
  await db.exec(await readFile(url('../prod-defs/111/store_workflow_snapshot.sql'), 'utf8'))
  // Đúng định nghĩa prod; cần stores.is_active ở trên.
  await db.exec(`
    CREATE OR REPLACE FUNCTION public.get_public_store_workflow(p_store_id uuid)
     RETURNS jsonb
     LANGUAGE sql
     STABLE SECURITY DEFINER
     SET search_path TO 'public'
    AS $function$
      SELECT public.store_workflow_snapshot(s.id)
      FROM public.stores s
      WHERE s.id = p_store_id AND s.is_active = true;
    $function$;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
  `)
}

export async function apply111(db) {
  await db.exec(await readFile(url('../../migrations/111_business_day.sql'), 'utf8'))
}

export async function setupThrough111(db) {
  await setupBefore111(db)
  await apply111(db)
}
