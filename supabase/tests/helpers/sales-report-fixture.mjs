import { readFile } from 'node:fs/promises'
import { setupThrough111 } from './business-day-fixture.mjs'

// Fixture cho mig 117 (báo cáo bán hàng). Dựng tiếp trên schema của mig 111, thêm đúng các cột/bảng mig 117 đọc:
// orders.confirmed_at (giờ vào bếp), order_items.menu_item_id (tra danh mục hiện tại), menu_items, menu_categories.
// is_store_pos_operator được thay bằng bản nhận thêm store_manager — mô phỏng mig 116, chỉ sống trong test.
// Fixture chỉ dựng schema, dữ liệu mẫu do từng test tự nạp.
const url = (path) => new URL(path, import.meta.url)

export async function setupThrough117(db) {
  await setupThrough111(db)
  await db.exec(`
    ALTER TABLE orders ADD COLUMN confirmed_at timestamptz;
    ALTER TABLE order_items ADD COLUMN menu_item_id uuid, ADD COLUMN variant_id uuid, ADD COLUMN variant_name text;
    CREATE TABLE menu_categories(id uuid PRIMARY KEY, store_id uuid, name text, sort_order int DEFAULT 0);
    CREATE TABLE menu_items(id uuid PRIMARY KEY, store_id uuid, category_id uuid, name text, price int);
    -- Như prod (2026-11-09) cộng store_manager; không gồm superadmin.
    CREATE OR REPLACE FUNCTION public.is_store_pos_operator(p_store_id uuid) RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
      SELECT EXISTS(SELECT 1 FROM mevo_operators WHERE user_id = auth.uid() AND store_id = p_store_id
        AND role IN ('store_owner','store_cashier','store_manager') AND is_active)
    $$;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
  `)
  await db.exec(await readFile(url('../../migrations/117_sales_reports.sql'), 'utf8'))
}
