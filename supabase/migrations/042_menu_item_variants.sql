-- 042 — Tuỳ chọn quyết định giá cho món (menu item variants)
-- Một món = tối đa MỘT nhóm "chọn loại", chọn đúng 1, bắt buộc, giá TUYỆT ĐỐI thay giá món.
-- Chạy song song với topping (mig 015/016) — không đụng gì tới topping.
-- Spec: docs/superpowers/specs/2026-09-01-menu-item-variants-design.md
-- Idempotent: rerun-safe.
--
-- ⚠️ TRUNCATE menu_item_variants KHÔNG kích hoạt trigger FOR EACH ROW (Postgres bỏ qua
-- row-trigger khi TRUNCATE) → menu_items.price sẽ kẹt ở giá trị cuối cùng trước đó, không
-- tự cập nhật. Không dùng TRUNCATE trên bảng này; dùng DELETE nếu cần xoá sạch.

-- ─── 1. Bảng biến thể ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS menu_item_variants (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid NOT NULL,
  store_id     uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name         text NOT NULL,
  price        int  NOT NULL CHECK (price >= 0),
  is_available boolean NOT NULL DEFAULT true,
  sort_order   int  NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- FK GHÉP (menu_item_id, store_id): chặn ở tầng CSDL việc gán biến thể
  -- của quán này sang món quán khác, kể cả khi code phía trên có lỗi.
  -- Phụ thuộc ẩn: FK ghép này chỉ tạo được nhờ UNIQUE(id, store_id) trên menu_items —
  -- đã có sẵn từ mig 015 (constraint menu_items_id_store_uniq), KHÔNG phải migration này thêm.
  CONSTRAINT miv_item_store_fkey
    FOREIGN KEY (menu_item_id, store_id)
    REFERENCES menu_items (id, store_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_miv_lookup
  ON menu_item_variants (menu_item_id, is_available, sort_order);

-- ─── 2. Nhãn nhóm hiện cho khách ────────────────────────────────────────────
-- NULL → mini-app hiện 'Chọn loại'
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS variant_group_name text;

-- Ý nghĩa cột price đổi ngầm khi món có biến thể — nơi đọc cột này (admin-web, mini-app)
-- không có cách nào tự biết, nên ghi rõ ràng buộc ở đây (theo khuôn mig 017).
COMMENT ON COLUMN menu_items.price IS
  'Giá hiển thị mặc định. Với món CÓ biến thể (xem bảng menu_item_variants), cột này bị '
  'trigger trg_sync_menu_item_price ghi đè thành giá biến thể RẺ NHẤT còn bán — chỉ để hiện '
  '"Từ …đ", KHÔNG phải giá bán thật của một lựa chọn cụ thể. Chỗ tính tiền đơn hàng phải đọc '
  'menu_item_variants.price theo variant_id khách chọn, không được dùng menu_items.price.';

-- ─── 3. Snapshot vào đơn ────────────────────────────────────────────────────
-- KHÔNG đặt FK: snapshot phải sống sót khi biến thể bị xoá khỏi menu.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_id   uuid;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_name text;

-- Cặp phải đi cùng nhau: có variant_id mà thiếu variant_name → phiếu bếp in dòng trống,
-- nấu sai món, và không dựng lại được tên vì cố ý không có FK ở trên.
-- Theo đúng khuôn DO-block mig 015 (order_items_selected_toppings_is_array).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_variant_pair_check') THEN
    ALTER TABLE order_items ADD CONSTRAINT order_items_variant_pair_check
      CHECK ((variant_id IS NULL) = (variant_name IS NULL));
  END IF;
END $$;

-- ─── 4. Trigger đồng bộ giá hiển thị ────────────────────────────────────────
-- menu_items.price := giá biến thể RẺ NHẤT còn bán tại thời điểm ghi.
-- Mục đích: mọi câu truy vấn cũ đang đọc menu_items.price tự có số đúng để
-- hiện "Từ …đ" mà không phải sửa và không phải join thêm.
--
-- Nếu không còn biến thể nào còn bán → GIỮ NGUYÊN mức price hiện tại (không ghi đè, không
-- NULL). Đây KHÔNG phải "giá gốc của món" — giá gốc đã mất ngay từ lúc thêm biến thể ĐẦU
-- TIÊN (trigger ghi đè ngay lúc đó) và không được lưu ở đâu để khôi phục. Ví dụ: Bia 50k →
-- thêm Cốc 20k + Tháp 200k → price=20k → xoá Cốc → price=200k → xoá Tháp (hết biến thể) →
-- price KẸT ở 200.000đ, không tự về lại 50k. Admin PHẢI tự sửa menu_items.price bằng tay
-- sau khi xoá biến thể cuối cùng của một món.
--
-- Đồng thời (concurrency): ở mức isolation READ COMMITTED mặc định, hai giao dịch sửa biến
-- thể của CÙNG một món song song có thể mỗi bên chỉ thấy MIN tại lúc SELECT của riêng mình
-- (lost update), và có nguy cơ deadlock vì FK ghép ở mục 1 giữ khoá FOR KEY SHARE trên dòng
-- menu_items TRƯỚC KHI trigger này chạy UPDATE — nếu cả hai giao dịch cùng lúc đòi nâng lên
-- khoá độc quyền trên cùng dòng đó thì một bên phải chờ. Rủi ro THẤP ở quy mô MEVO (mỗi quán
-- một người vận hành, mỗi lần lưu form admin là một transaction chạy tuần tự nên vẫn ra đúng
-- MIN). Nếu gặp thật: chữa ở TẦNG ỨNG DỤNG bằng cách thử lại (retry) khi UPDATE báo deadlock —
-- KHÔNG thêm SELECT ... FOR UPDATE, vô ích vì khoá FOR KEY SHARE của FK đã cầm trước khi
-- trigger kịp chạy.
CREATE OR REPLACE FUNCTION sync_menu_item_price_from_variants()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ids uuid[];
  v_id  uuid;
  v_min int;
BEGIN
  -- Chạy cho cả món cũ lẫn món mới: phòng ca UPDATE đổi menu_item_id.
  SELECT array_agg(DISTINCT x) INTO v_ids FROM unnest(ARRAY[
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.menu_item_id END,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.menu_item_id END
  ]) AS x WHERE x IS NOT NULL;

  IF v_ids IS NULL THEN
    RETURN NULL;
  END IF;

  FOREACH v_id IN ARRAY v_ids LOOP
    SELECT MIN(price) INTO v_min
      FROM menu_item_variants
     WHERE menu_item_id = v_id AND is_available = true;
    IF v_min IS NOT NULL THEN
      UPDATE menu_items SET price = v_min WHERE id = v_id AND price <> v_min;
    END IF;
  END LOOP;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS trg_sync_menu_item_price ON menu_item_variants;
CREATE TRIGGER trg_sync_menu_item_price
AFTER INSERT OR UPDATE OR DELETE ON menu_item_variants
FOR EACH ROW EXECUTE FUNCTION sync_menu_item_price_from_variants();

-- ─── 5. RLS — sao đúng khuôn mig 019 (store-scoped), KHÔNG PHẢI khuôn cũ mig 016 ───────────
-- mig 016 dùng is_operator(), chỉ kiểm tra "có phải operator nào đó không" — KHÔNG kiểm tra
-- đúng quán. mig 019 sinh ra chính để vá lỗ hổng đó, và đã viết lại policy của
-- toppings/menu_item_toppings sang is_store_scoped_operator(store_id). Bảng mới này phải
-- theo bản vá 019, không theo bản gốc 016 đã lỗi thời — nếu dùng lại is_operator() thì chủ
-- quán A gọi thẳng Supabase (không qua admin-web) vẫn đọc được tên + giá biến thể của mọi
-- quán khác.
ALTER TABLE menu_item_variants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_variants" ON menu_item_variants;
CREATE POLICY "anon_read_variants" ON menu_item_variants
  FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "auth_read_variants" ON menu_item_variants;
CREATE POLICY "auth_read_variants" ON menu_item_variants
  FOR SELECT TO authenticated USING (is_store_scoped_operator(store_id));
-- Ghi: chỉ service-role (bypass RLS). Không policy cho role kitchen —
-- bếp chỉ đọc snapshot order_items.item_name / variant_name.
