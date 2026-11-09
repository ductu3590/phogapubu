import { readFile } from 'node:fs/promises'
import { setupThrough111 } from './business-day-fixture.mjs'

// Fixture cho mig 118 (kho). Task 1–3 của plan 2026-11-09-yg-kho dùng chung.
// Dựng trên setupThrough111 rồi thêm đúng những cột/bảng 118 đọc. Kiểu cột đối chiếu prod (2026-11-09,
// information_schema.columns):
//   mevo_operators.display_name text
//   orders.confirmed_at timestamptz (prod còn confirmed_by uuid, 118 không đọc)
//   order_items.menu_item_id uuid, variant_id uuid, variant_name text
//   menu_items(id uuid, store_id uuid, name text, ...) + UNIQUE (id, store_id) "menu_items_id_store_uniq",
//     FK store_id → stores ON DELETE CASCADE
//   menu_item_variants(id uuid, menu_item_id uuid, store_id uuid, name text, ...) +
//     FK (menu_item_id, store_id) → menu_items(id, store_id) ON DELETE CASCADE "miv_item_store_fkey"
// Cột prod 118 không đọc (price, sort_order, is_available...) không dựng.
//
// is_store_back_office là của mig 116 (plan QL, chạy song song) — stub ở đây giống hệt hợp đồng chung,
// KHÔNG nằm trong migration. is_store_pos_operator được vá cho nhận thêm store_manager như mig 116 sẽ làm.
const url = (path) => new URL(path, import.meta.url)

export async function setupThrough118(db) {
  await setupThrough111(db)
  await db.exec(`
    -- Supabase cấp sẵn quyền bảng + hàm mới cho anon/authenticated; mô phỏng để test REVOKE của 118 có nghĩa
    -- (setupBefore111 đã cấp EXECUTE trên hàm; dòng ON FUNCTIONS ở đây giữ cho fixture này tự đủ).
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

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
      CONSTRAINT miv_item_store_fkey FOREIGN KEY (menu_item_id, store_id)
        REFERENCES menu_items(id, store_id) ON DELETE CASCADE
    );

    -- Stub mig 116, đúng hợp đồng chung (kể cả SECURITY DEFINER và quyền EXECUTE).
    CREATE FUNCTION public.is_store_back_office(p_store_id uuid) RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT EXISTS (
        SELECT 1 FROM mevo_operators
         WHERE user_id = auth.uid()
           AND is_active
           AND role IN ('store_owner', 'store_manager')
           AND store_id = p_store_id
      );
    $$;
    REVOKE ALL ON FUNCTION public.is_store_back_office(uuid) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.is_store_back_office(uuid) TO authenticated;

    CREATE OR REPLACE FUNCTION is_store_pos_operator(p_store_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT EXISTS(SELECT 1 FROM mevo_operators WHERE user_id = auth.uid() AND store_id = p_store_id
        AND role IN ('store_owner','store_cashier','store_manager') AND is_active)
    $$;
  `)
  await db.exec(await readFile(url('../../migrations/118_inventory.sql'), 'utf8'))
}

// Đăng nhập như một người dùng Supabase: gán sub vào JWT claim rồi chuyển sang role authenticated.
export async function login(db, uid) {
  await db.exec('RESET ROLE')
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [uid])
  await db.exec('SET ROLE authenticated')
}

export async function as(db, uid, fn) {
  await login(db, uid)
  try {
    return await fn()
  } finally {
    await db.exec('RESET ROLE')
  }
}
