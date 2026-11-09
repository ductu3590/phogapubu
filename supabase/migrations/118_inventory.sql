-- 118_inventory.sql — Kho nhập–xuất và giá vốn (Yên Garden). Spec docs/superpowers/specs/2026-11-09-yg-kho-design.md,
-- plan docs/superpowers/plans/2026-11-09-yg-kho.md.
--
-- Không có bảng tồn: tồn tính lúc đọc từ phiếu + đơn bán, nên migration này KHÔNG vá một hàm sống nào (không đụng
-- create_order, close_table_session, bỏ/tặng/sửa số lượng). Chỉ CREATE mới.
--
-- Quyết định bổ sung so với spec (chi tiết ở plan):
-- 1) Phiếu kiểm là mốc neo: Tồn(hàng, T) = SL đếm của dòng kiểm gần nhất trước T (không có thì 0) + nhập − huỷ − bán
--    sau mốc đó. Huỷ/ghi lùi một phiếu nhập trước phiếu kiểm không làm tồn sau kiểm lệch khỏi số đã đếm.
--    system_qty trên dòng kiểm chỉ là ảnh chụp lúc lưu.
-- 2) Liên kết món có hiệu lực theo thời gian (valid_from, valid_to): đổi SL trừ hay đổi hàng = đóng dòng cũ, mở dòng
--    mới; bán tra liên kết đang hiệu lực lúc tạo đơn → đổi liên kết không viết lại tồn quá khứ, gắn món muộn không trừ
--    ngược đơn cũ. Unique (món, biến thể) chỉ áp cho dòng đang mở. variant_id không FK (xoá biến thể không được làm
--    đổi lịch sử).
-- 3) Giờ bán = orders.created_at; trạng thái đơn đọc lúc tính.
-- 4) effective_at của phiếu: phiếu ngày hôm nay (ngày kinh doanh) = now(); nhập/huỷ ghi lùi (≤ 7 ngày) = cuối ngày
--    kinh doanh đó − 1 giây. Phiếu kiểm chỉ được ngày hôm nay. Kỳ báo cáo cắt theo effective_at.
-- 5) Giá vốn đầu kỳ = bình quân gia quyền mọi dòng có giá (nhập + kiểm có unit_cost) trước kỳ; không có thì phần tồn
--    đầu kỳ không vào công thức.
-- 6) Có nguyên liệu biến động trong kỳ mà chưa kiểm trong kỳ → ingredient_uncounted = true, ingredient_cogs = 0.
-- 7) Chênh lệch kiểm kho của hàng goods không vào giá vốn (thấy qua thẻ kho).
-- 8) JSON inventory_cogs có thêm writeoff_qty, writeoff_cost, counted từng dòng và from, to ở gốc.
--
-- Quyền: ghi = is_store_back_office (mig 116, Chủ quán + Quản lý). Bảng bật RLS không policy, mọi đọc/ghi qua RPC
-- SECURITY DEFINER. Sổ thu chi KHÔNG ở đây: mig 122b thêm FK cash_book_entry_id và vá hai hàm phiếu tại dòng neo.

-- ============================================================
-- 0) Điều kiện trước
-- ============================================================
DO $pre$
BEGIN
  IF to_regprocedure('public.is_store_back_office(uuid)') IS NULL THEN
    RAISE EXCEPTION 'mig 118: thiếu hàm is_store_back_office(uuid) (mig 116)';
  END IF;
  IF to_regprocedure('public.business_day_bounds(uuid,date)') IS NULL THEN
    RAISE EXCEPTION 'mig 118: thiếu hàm business_day_bounds(uuid,date) (mig 111)';
  END IF;
  IF to_regprocedure('public.current_business_date(uuid)') IS NULL THEN
    RAISE EXCEPTION 'mig 118: thiếu hàm current_business_date(uuid) (mig 111)';
  END IF;
  IF to_regclass('public.menu_item_variants') IS NULL THEN
    RAISE EXCEPTION 'mig 118: thiếu bảng menu_item_variants';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'confirmed_at') THEN
    RAISE EXCEPTION 'mig 118: thiếu cột orders.confirmed_at';
  END IF;
END
$pre$;

-- ============================================================
-- 1) Bảng
-- ============================================================
CREATE TABLE public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL CONSTRAINT inventory_items_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  unit text NOT NULL CONSTRAINT inventory_items_unit_check CHECK (length(btrim(unit)) BETWEEN 1 AND 20),
  kind text NOT NULL CONSTRAINT inventory_items_kind_check CHECK (kind IN ('goods', 'ingredient')),
  sku text NULL CONSTRAINT inventory_items_sku_check CHECK (sku IS NULL OR length(sku) <= 40),
  min_stock numeric(12,3) NULL CONSTRAINT inventory_items_min_stock_check CHECK (min_stock IS NULL OR min_stock >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_items_id_store_uniq UNIQUE (id, store_id)
);
-- Trùng tên chỉ cấm giữa hàng đang dùng: ngừng dùng rồi tạo lại cùng tên được. RPC kiểm trước, index là chốt cuối.
CREATE UNIQUE INDEX inventory_items_active_name_uniq ON public.inventory_items (store_id, lower(name)) WHERE is_active;

CREATE TABLE public.menu_stock_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  menu_item_id uuid NOT NULL,
  variant_id uuid NULL, -- cố ý không FK: xoá biến thể không được làm đổi lịch sử bán
  inventory_item_id uuid NOT NULL,
  qty_per_sale numeric(12,3) NOT NULL CONSTRAINT menu_stock_links_qty_check CHECK (qty_per_sale > 0),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT menu_stock_links_valid_check CHECK (valid_to IS NULL OR valid_to >= valid_from),
  CONSTRAINT menu_stock_links_menu_fkey FOREIGN KEY (menu_item_id, store_id)
    REFERENCES public.menu_items(id, store_id) ON DELETE CASCADE,
  CONSTRAINT menu_stock_links_item_fkey FOREIGN KEY (inventory_item_id, store_id)
    REFERENCES public.inventory_items(id, store_id)
);
-- Mỗi (món, biến thể) tối đa một liên kết đang mở; dòng đã đóng là lịch sử.
CREATE UNIQUE INDEX menu_stock_links_open_uniq ON public.menu_stock_links
  (menu_item_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE valid_to IS NULL;
CREATE INDEX menu_stock_links_store_menu_idx ON public.menu_stock_links (store_id, menu_item_id);
CREATE INDEX menu_stock_links_item_idx ON public.menu_stock_links (inventory_item_id) WHERE valid_to IS NULL;

CREATE TABLE public.inventory_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  kind text NOT NULL CONSTRAINT inventory_documents_kind_check CHECK (kind IN ('receipt', 'count', 'writeoff')),
  doc_no text NOT NULL,
  doc_date date NOT NULL,
  effective_at timestamptz NOT NULL,
  supplier_name text NULL,
  note text NULL,
  total_amount bigint NOT NULL DEFAULT 0 CONSTRAINT inventory_documents_total_check CHECK (total_amount >= 0),
  paid_status text NULL CONSTRAINT inventory_documents_paid_status_check CHECK (paid_status IN ('paid', 'unpaid')),
  paid_method text NULL CONSTRAINT inventory_documents_paid_method_check CHECK (paid_method IN ('cash', 'bank')),
  cash_book_entry_id uuid NULL, -- FK tới sổ thu chi thêm ở mig 122b
  status text NOT NULL DEFAULT 'posted' CONSTRAINT inventory_documents_status_check CHECK (status IN ('posted', 'voided')),
  client_request_id uuid NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_by uuid,
  voided_at timestamptz,
  void_reason text,
  CONSTRAINT inventory_documents_doc_no_uniq UNIQUE (store_id, doc_no),
  CONSTRAINT inventory_documents_request_uniq UNIQUE (store_id, client_request_id),
  CONSTRAINT inventory_documents_id_store_uniq UNIQUE (id, store_id),
  -- Chỉ phiếu nhập có trạng thái trả tiền; đã trả thì phải có phương thức, chưa trả thì không.
  CONSTRAINT inventory_documents_paid_kind_check CHECK ((kind = 'receipt') = (paid_status IS NOT NULL)),
  CONSTRAINT inventory_documents_paid_method_kind_check
    CHECK (kind <> 'receipt' OR (paid_status = 'paid') = (paid_method IS NOT NULL)),
  CONSTRAINT inventory_documents_method_receipt_check CHECK (kind = 'receipt' OR paid_method IS NULL),
  CONSTRAINT inventory_documents_void_check
    CHECK (status <> 'voided' OR (voided_at IS NOT NULL AND voided_by IS NOT NULL AND void_reason IS NOT NULL))
);
CREATE INDEX inventory_documents_store_kind_idx ON public.inventory_documents (store_id, kind, effective_at DESC);

CREATE TABLE public.inventory_document_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL,
  store_id uuid NOT NULL,
  inventory_item_id uuid NOT NULL,
  qty numeric(12,3) NULL CONSTRAINT inventory_document_lines_qty_check CHECK (qty IS NULL OR qty > 0),
  unit_cost bigint NULL CONSTRAINT inventory_document_lines_unit_cost_check
    CHECK (unit_cost IS NULL OR unit_cost BETWEEN 0 AND 100000000),
  counted_qty numeric(12,3) NULL CONSTRAINT inventory_document_lines_counted_check
    CHECK (counted_qty IS NULL OR counted_qty >= 0),
  system_qty numeric(12,3) NULL,
  line_amount bigint NOT NULL DEFAULT 0,
  CONSTRAINT inventory_document_lines_item_uniq UNIQUE (document_id, inventory_item_id),
  CONSTRAINT inventory_document_lines_doc_fkey FOREIGN KEY (document_id, store_id)
    REFERENCES public.inventory_documents(id, store_id) ON DELETE CASCADE,
  CONSTRAINT inventory_document_lines_item_fkey FOREIGN KEY (inventory_item_id, store_id)
    REFERENCES public.inventory_items(id, store_id)
);
CREATE INDEX inventory_document_lines_store_item_idx ON public.inventory_document_lines (store_id, inventory_item_id);

CREATE TABLE public.inventory_doc_counters (
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  kind text NOT NULL CONSTRAINT inventory_doc_counters_kind_check CHECK (kind IN ('receipt', 'count', 'writeoff')),
  last_no int NOT NULL,
  PRIMARY KEY (store_id, kind)
);

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_stock_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_document_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_doc_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.inventory_items, public.menu_stock_links, public.inventory_documents,
  public.inventory_document_lines, public.inventory_doc_counters FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 2) Trigger liên kết món: chỉ trỏ tới hàng bán nguyên đang dùng của đúng quán; dòng chỉ được đóng, không sửa
-- ============================================================
CREATE FUNCTION public.inventory_link_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_item record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Lịch sử bán tra theo dòng liên kết cũ: chỉ cho đóng một dòng đang mở, mọi cột khác giữ nguyên.
    IF OLD.valid_to IS NOT NULL
       OR NEW.valid_to IS NULL
       OR (NEW.id, NEW.store_id, NEW.menu_item_id, NEW.variant_id, NEW.inventory_item_id, NEW.qty_per_sale,
           NEW.valid_from, NEW.created_by, NEW.created_at)
          IS DISTINCT FROM
          (OLD.id, OLD.store_id, OLD.menu_item_id, OLD.variant_id, OLD.inventory_item_id, OLD.qty_per_sale,
           OLD.valid_from, OLD.created_by, OLD.created_at) THEN
      RAISE EXCEPTION 'Liên kết kho chỉ được đóng, không sửa';
    END IF;
    -- Đóng dòng luôn được, kể cả khi hàng vừa ngừng dùng.
    RETURN NEW;
  END IF;

  SELECT i.store_id, i.kind, i.is_active INTO v_item
    FROM public.inventory_items i WHERE i.id = NEW.inventory_item_id
     FOR SHARE; -- giữ dòng hàng tới hết giao dịch: ngừng dùng / đổi loại song song phải chờ, không lọt liên kết
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy hàng hoá';
  END IF;
  IF v_item.store_id IS DISTINCT FROM NEW.store_id THEN
    RAISE EXCEPTION 'Hàng hoá không thuộc quán này';
  END IF;
  IF v_item.kind <> 'goods' THEN
    RAISE EXCEPTION 'Chỉ gắn được hàng bán nguyên';
  END IF;
  IF NOT v_item.is_active THEN
    RAISE EXCEPTION 'Hàng hoá đã ngừng dùng';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.inventory_link_guard() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER inventory_link_guard
  BEFORE INSERT OR UPDATE ON public.menu_stock_links
  FOR EACH ROW EXECUTE FUNCTION public.inventory_link_guard();

-- ============================================================
-- 3) RPC hàng hoá + liên kết món
-- ============================================================

-- Tạo (p_id null) hoặc sửa hàng hoá. Trả {ok, id}.
CREATE FUNCTION public.inventory_upsert_item(
  p_store_id uuid, p_id uuid, p_name text, p_unit text, p_kind text, p_sku text, p_min_stock numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := btrim(coalesce(p_name, ''));
  v_unit text := btrim(coalesce(p_unit, ''));
  v_sku text := nullif(btrim(coalesce(p_sku, '')), '');
  v_row public.inventory_items%ROWTYPE;
  v_id uuid;
BEGIN
  IF p_store_id IS NULL OR NOT public.is_store_back_office(p_store_id) THEN
    RAISE EXCEPTION 'Không có quyền';
  END IF;

  IF v_name = '' THEN
    RAISE EXCEPTION 'Tên hàng hoá không được để trống';
  END IF;
  IF length(v_name) > 80 THEN
    RAISE EXCEPTION 'Tên hàng hoá tối đa 80 ký tự';
  END IF;
  IF v_unit = '' THEN
    RAISE EXCEPTION 'Đơn vị tính không được để trống';
  END IF;
  IF length(v_unit) > 20 THEN
    RAISE EXCEPTION 'Đơn vị tính tối đa 20 ký tự';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('goods', 'ingredient') THEN
    RAISE EXCEPTION 'Loại hàng hoá không hợp lệ';
  END IF;
  IF v_sku IS NOT NULL AND length(v_sku) > 40 THEN
    RAISE EXCEPTION 'Mã hàng tối đa 40 ký tự';
  END IF;
  IF p_min_stock IS NOT NULL THEN
    IF p_min_stock < 0 THEN
      RAISE EXCEPTION 'Mức tồn tối thiểu không được âm';
    END IF;
    IF p_min_stock >= 1000000 THEN
      RAISE EXCEPTION 'Mức tồn tối thiểu phải nhỏ hơn 1.000.000';
    END IF;
    -- numeric(12,3) tự làm tròn âm thầm; chặn để số lưu đúng số người gõ.
    IF p_min_stock <> round(p_min_stock, 3) THEN
      RAISE EXCEPTION 'Mức tồn tối thiểu tối đa 3 chữ số thập phân';
    END IF;
  END IF;

  IF p_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.inventory_items
     WHERE id = p_id AND store_id = p_store_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Không tìm thấy hàng hoá';
    END IF;
    -- Đơn đã bán tra liên kết theo hàng goods; đổi sang nguyên liệu khi còn liên kết mở thì tồn hàng bán sai.
    IF v_row.kind <> p_kind AND EXISTS (
      SELECT 1 FROM public.menu_stock_links l WHERE l.inventory_item_id = p_id AND l.valid_to IS NULL) THEN
      RAISE EXCEPTION 'Hàng đang gắn với món — gỡ liên kết trước khi đổi loại';
    END IF;
  END IF;

  -- Trùng tên chỉ tính giữa hàng đang dùng (hàng tạo mới luôn đang dùng).
  IF (p_id IS NULL OR v_row.is_active) AND EXISTS (
    SELECT 1 FROM public.inventory_items i
     WHERE i.store_id = p_store_id AND i.is_active AND lower(i.name) = lower(v_name)
       AND i.id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION 'Đã có hàng hoá tên này';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.inventory_items (store_id, name, unit, kind, sku, min_stock)
    VALUES (p_store_id, v_name, v_unit, p_kind, v_sku, p_min_stock)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.inventory_items
       SET name = v_name, unit = v_unit, kind = p_kind, sku = v_sku, min_stock = p_min_stock
     WHERE id = p_id;
    v_id := p_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

-- Ngừng dùng / dùng lại. Ngừng dùng thì đóng mọi liên kết món đang mở trỏ tới hàng (không xoá, giữ lịch sử).
-- Trả {ok, id, is_active, links_closed}.
CREATE FUNCTION public.inventory_set_item_active(p_id uuid, p_active boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.inventory_items%ROWTYPE;
  v_closed int := 0;
BEGIN
  SELECT * INTO v_row FROM public.inventory_items WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy hàng hoá';
  END IF;
  IF NOT public.is_store_back_office(v_row.store_id) THEN
    RAISE EXCEPTION 'Không có quyền';
  END IF;
  IF p_active IS NULL THEN
    RAISE EXCEPTION 'Thiếu trạng thái hàng hoá';
  END IF;

  IF NOT p_active THEN
    UPDATE public.menu_stock_links SET valid_to = now()
     WHERE inventory_item_id = p_id AND valid_to IS NULL;
    GET DIAGNOSTICS v_closed = ROW_COUNT;
  ELSIF NOT v_row.is_active AND EXISTS (
    SELECT 1 FROM public.inventory_items i
     WHERE i.store_id = v_row.store_id AND i.is_active AND lower(i.name) = lower(v_row.name) AND i.id <> p_id) THEN
    RAISE EXCEPTION 'Đã có hàng hoá tên này';
  END IF;

  UPDATE public.inventory_items SET is_active = p_active WHERE id = p_id;

  RETURN jsonb_build_object('ok', true, 'id', p_id, 'is_active', p_active, 'links_closed', v_closed);
END;
$$;

-- Gắn / đổi / gỡ (p_inventory_item_id null) liên kết trừ kho của một món hoặc một biến thể.
-- Đổi = đóng dòng đang mở rồi mở dòng mới cùng mốc now(); gửi lại y hệt thì không đổi gì.
-- Trả {ok, link_id (dòng đang mở sau khi gọi, null khi đã gỡ), changed}.
CREATE FUNCTION public.inventory_set_menu_link(
  p_menu_item_id uuid, p_variant_id uuid, p_inventory_item_id uuid, p_qty numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
  v_cur public.menu_stock_links%ROWTYPE;
  v_new_id uuid;
BEGIN
  SELECT m.store_id INTO v_store_id FROM public.menu_items m WHERE m.id = p_menu_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy món';
  END IF;
  IF NOT public.is_store_back_office(v_store_id) THEN
    RAISE EXCEPTION 'Không có quyền';
  END IF;

  IF p_inventory_item_id IS NOT NULL THEN
    IF p_variant_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.menu_item_variants v
       WHERE v.id = p_variant_id AND v.menu_item_id = p_menu_item_id AND v.store_id = v_store_id) THEN
      RAISE EXCEPTION 'Lựa chọn không thuộc món này';
    END IF;
    IF p_qty IS NULL OR p_qty <= 0 THEN
      RAISE EXCEPTION 'Số lượng trừ phải lớn hơn 0';
    END IF;
    IF p_qty >= 1000000 THEN
      RAISE EXCEPTION 'Số lượng trừ phải nhỏ hơn 1.000.000';
    END IF;
    IF p_qty <> round(p_qty, 3) THEN
      RAISE EXCEPTION 'Số lượng trừ tối đa 3 chữ số thập phân';
    END IF;
  END IF;

  -- Hai người cùng sửa một (món, biến thể): khoá theo cặp đó để chưa có dòng mở cũng không đua nhau chèn.
  -- Unique index menu_stock_links_open_uniq là chốt chặn cuối.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'inventory_link:' || p_menu_item_id::text || ':' || coalesce(p_variant_id::text, '-'), 0));

  SELECT * INTO v_cur FROM public.menu_stock_links l
   WHERE l.menu_item_id = p_menu_item_id AND l.variant_id IS NOT DISTINCT FROM p_variant_id AND l.valid_to IS NULL
   FOR UPDATE;

  IF p_inventory_item_id IS NULL THEN
    IF v_cur.id IS NULL THEN
      RETURN jsonb_build_object('ok', true, 'link_id', NULL, 'changed', false);
    END IF;
    UPDATE public.menu_stock_links SET valid_to = now() WHERE id = v_cur.id;
    RETURN jsonb_build_object('ok', true, 'link_id', NULL, 'changed', true);
  END IF;

  IF v_cur.id IS NOT NULL AND v_cur.inventory_item_id = p_inventory_item_id AND v_cur.qty_per_sale = p_qty THEN
    RETURN jsonb_build_object('ok', true, 'link_id', v_cur.id, 'changed', false);
  END IF;

  IF v_cur.id IS NOT NULL THEN
    UPDATE public.menu_stock_links SET valid_to = now() WHERE id = v_cur.id;
  END IF;
  -- Trigger inventory_link_guard kiểm hàng: đúng quán, bán nguyên, đang dùng.
  INSERT INTO public.menu_stock_links
    (store_id, menu_item_id, variant_id, inventory_item_id, qty_per_sale, valid_from, created_by)
  VALUES (v_store_id, p_menu_item_id, p_variant_id, p_inventory_item_id, p_qty, now(), auth.uid())
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('ok', true, 'link_id', v_new_id, 'changed', true);
END;
$$;

-- Dữ liệu cho ô "Trừ kho" ở trang Món: hàng bán nguyên đang dùng + liên kết đang mở. Chỉ đọc.
CREATE FUNCTION public.inventory_menu_links(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_store_id IS NULL OR NOT public.is_store_back_office(p_store_id) THEN
    RAISE EXCEPTION 'Không có quyền';
  END IF;

  RETURN jsonb_build_object(
    'goods', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'unit', i.unit)
                       ORDER BY lower(i.name), i.id)
        FROM public.inventory_items i
       WHERE i.store_id = p_store_id AND i.kind = 'goods' AND i.is_active), '[]'::jsonb),
    'links', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'menu_item_id', l.menu_item_id, 'variant_id', l.variant_id,
               'inventory_item_id', l.inventory_item_id, 'qty_per_sale', l.qty_per_sale)
             ORDER BY l.menu_item_id, l.variant_id NULLS FIRST)
        FROM public.menu_stock_links l
       WHERE l.store_id = p_store_id AND l.valid_to IS NULL), '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_upsert_item(uuid, uuid, text, text, text, text, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inventory_set_item_active(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inventory_set_menu_link(uuid, uuid, uuid, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inventory_menu_links(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_upsert_item(uuid, uuid, text, text, text, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_set_item_active(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_set_menu_link(uuid, uuid, uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_menu_links(uuid) TO authenticated;

-- ============================================================
-- 4) "Bán" và tồn (hàm nội bộ, không client nào gọi thẳng)
-- ============================================================

-- Định nghĩa "bán" duy nhất của kho: mỗi dòng order_items đã bán có liên kết tới hàng bán nguyên.
-- sold_at = orders.created_at, khoảng nửa mở [p_from, p_to). qty = quantity hiện tại × qty_per_sale.
CREATE FUNCTION public.inventory_sales_lines(p_store_id uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE(inventory_item_id uuid, sold_at timestamptz, qty numeric)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT lk.inventory_item_id, o.created_at, oi.quantity * lk.qty_per_sale
    FROM public.orders o
    JOIN public.stores s ON s.id = o.store_id
    LEFT JOIN public.store_workflow_settings w ON w.store_id = o.store_id
    JOIN public.order_items oi ON oi.order_id = o.id
    -- Liên kết đang hiệu lực LÚC TẠO ĐƠN, ưu tiên (món, biến thể) rồi (món, null). Khoảng nửa mở
    -- [valid_from, valid_to): đóng dòng cũ và mở dòng mới cùng một now(), đóng kín hai đầu thì đơn đúng khoảnh
    -- khắc đó bị tính hai lần.
    JOIN LATERAL (
      SELECT l.inventory_item_id, l.qty_per_sale
        FROM public.menu_stock_links l
       WHERE l.store_id = o.store_id
         AND l.menu_item_id = oi.menu_item_id
         AND (l.variant_id = oi.variant_id OR l.variant_id IS NULL)
         AND l.valid_from <= o.created_at AND (l.valid_to IS NULL OR o.created_at < l.valid_to)
       ORDER BY (l.variant_id IS NULL)
       LIMIT 1) lk ON true
    JOIN public.inventory_items ii ON ii.id = lk.inventory_item_id AND ii.kind = 'goods'
   WHERE o.store_id = p_store_id
     AND o.created_at >= p_from AND o.created_at < p_to
     -- Bị từ chối = cancelled + rejected_at (mig 077); huỷ thường cũng không trừ.
     AND o.status <> 'cancelled' AND o.rejected_at IS NULL
     -- Món bỏ không trừ; món tặng vẫn trừ (hàng đã ra khỏi tủ).
     AND oi.void_type IS DISTINCT FROM 'cancelled'
     AND (
       o.status IN ('confirmed', 'cooking', 'ready', 'paid')
       OR o.confirmed_at IS NOT NULL
       OR o.payment_received_at IS NOT NULL
       OR o.order_source = 'pos' -- món thu ngân ghi tay là món đã phục vụ
       -- giữ khớp orderInKitchen — admin-web/lib/kitchen-announce.ts
       OR (o.status = 'pending'
           AND o.order_source <> 'reservation_preorder'
           AND CASE WHEN o.order_source = 'staff' THEN coalesce(w.staff_order_release_policy, 'automatic')
                    ELSE coalesce(w.kitchen_release_policy, 'automatic') END = 'automatic'
           AND (o.order_source = 'staff' OR (s.payment_timing = 'postpay' AND o.payment_method = 'cash')))
     );
$$;

-- Hợp đồng chung (báo cáo dùng): chỉ cộng inventory_sales_lines.
CREATE FUNCTION public.inventory_sales_qty(p_store_id uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE(inventory_item_id uuid, qty numeric)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT s.inventory_item_id, sum(s.qty)
    FROM public.inventory_sales_lines(p_store_id, p_from, p_to) s
   GROUP BY s.inventory_item_id;
$$;

-- Tồn mọi hàng của quán ngay trước p_at (sự kiện có thời điểm < p_at).
-- Phiếu kiểm là mốc neo: tồn = SL đếm của dòng kiểm gần nhất + nhập − huỷ − bán từ mốc đó (không neo thì từ đầu,
-- SL đầu = 0). Công thức tồn chỉ nằm ở đây.
CREATE FUNCTION public.inventory_stock_at(p_store_id uuid, p_at timestamptz)
RETURNS TABLE(inventory_item_id uuid, qty numeric)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH anchor AS (
    SELECT DISTINCT ON (dl.inventory_item_id) dl.inventory_item_id, dl.counted_qty, d.effective_at
      FROM public.inventory_document_lines dl
      JOIN public.inventory_documents d ON d.id = dl.document_id
     WHERE d.store_id = p_store_id AND d.kind = 'count' AND d.status = 'posted' AND d.effective_at < p_at
     ORDER BY dl.inventory_item_id, d.effective_at DESC, d.created_at DESC, d.doc_no DESC
  ),
  ev AS (
    SELECT dl.inventory_item_id, d.effective_at AS at,
           CASE d.kind WHEN 'receipt' THEN dl.qty ELSE -dl.qty END AS q
      FROM public.inventory_document_lines dl
      JOIN public.inventory_documents d ON d.id = dl.document_id
     WHERE d.store_id = p_store_id AND d.kind IN ('receipt', 'writeoff') AND d.status = 'posted'
       AND d.effective_at < p_at
    UNION ALL
    SELECT sl.inventory_item_id, sl.sold_at, -sl.qty
      FROM public.inventory_sales_lines(p_store_id, '-infinity', p_at) sl
  )
  SELECT i.id,
         coalesce(a.counted_qty, 0)
           + coalesce(sum(e.q) FILTER (WHERE a.effective_at IS NULL OR e.at >= a.effective_at), 0)
    FROM public.inventory_items i
    LEFT JOIN anchor a ON a.inventory_item_id = i.id
    LEFT JOIN ev e ON e.inventory_item_id = i.id
   WHERE i.store_id = p_store_id
   GROUP BY i.id, a.counted_qty, a.effective_at;
$$;

-- Số phiếu tự sinh theo quán + loại: PN-0001 / PK-0001 / PX-0001; quá 9999 thì dài thêm (không cắt).
-- Dòng counter bị khoá tới hết giao dịch nên hai phiếu cùng lúc không trùng số; giao dịch lỗi thì số quay lại.
CREATE FUNCTION public.inventory_next_doc_no(p_store_id uuid, p_kind text)
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_n int;
BEGIN
  INSERT INTO public.inventory_doc_counters AS c (store_id, kind, last_no)
  VALUES (p_store_id, p_kind, 1)
  ON CONFLICT (store_id, kind) DO UPDATE SET last_no = c.last_no + 1
  RETURNING c.last_no INTO v_n;
  RETURN CASE p_kind WHEN 'receipt' THEN 'PN-' WHEN 'count' THEN 'PK-' ELSE 'PX-' END
    || lpad(v_n::text, greatest(4, length(v_n::text)), '0');
END;
$$;

-- Đọc số từ JSON: nhận số JSON hoặc chuỗi số thập phân dấu chấm; còn lại null (để RPC báo lỗi tiếng Việt thay vì
-- lỗi ép kiểu của Postgres).
CREATE FUNCTION public.inventory_json_numeric(p_value jsonb)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN jsonb_typeof(p_value) = 'number' THEN (p_value #>> '{}')::numeric
    WHEN jsonb_typeof(p_value) = 'string' AND btrim(p_value #>> '{}') ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN btrim(p_value #>> '{}')::numeric
  END;
$$;

-- ============================================================
-- 5) Ghi phiếu nhập / kiểm / huỷ. KHÔNG có khối EXCEPTION: lỗi từ 122b (chưa mở ca...) phải huỷ cả phiếu.
-- ============================================================

-- Trả {ok, id, doc_no, replayed, before_count_doc_no}. Gửi lại cùng client_request_id trả đúng phiếu cũ.
CREATE FUNCTION public.inventory_post_document(p_kind text, p_doc jsonb, p_lines jsonb, p_client_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid := nullif(btrim(p_doc ->> 'store_id'), '')::uuid;
  v_doc_id uuid;
  v_prev record;
  v_today date;
  v_doc_date date;
  v_effective_at timestamptz;
  v_supplier text;
  v_note text;
  v_paid_status text;
  v_paid_method text;
  v_line jsonb;
  v_item_id uuid;
  v_qty numeric;
  v_counted numeric;
  v_cost_raw numeric;
  v_cost bigint;
  v_amount bigint;
  v_items uuid[] := '{}';
  v_qtys numeric[] := '{}';
  v_costs bigint[] := '{}';
  v_counteds numeric[] := '{}';
  v_amounts bigint[] := '{}';
  v_systems numeric[];
  v_total bigint := 0;
  v_doc_no text;
  v_before text;
BEGIN
  IF v_store_id IS NULL OR NOT public.is_store_back_office(v_store_id) THEN
    RAISE EXCEPTION 'Không có quyền';
  END IF;
  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'Thiếu mã yêu cầu';
  END IF;

  -- Bấm hai lần / mạng rớt gửi lại: khoá theo mã yêu cầu, phiếu đã có thì trả lại phiếu đó (không đi tới neo 122b).
  PERFORM pg_advisory_xact_lock(hashtextextended(p_client_request_id::text, 0));
  SELECT d.id, d.kind, d.doc_no INTO v_prev
    FROM public.inventory_documents d
   WHERE d.store_id = v_store_id AND d.client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_prev.kind IS DISTINCT FROM p_kind THEN
      RAISE EXCEPTION 'Mã yêu cầu đã dùng cho phiếu khác';
    END IF;
    RETURN jsonb_build_object('ok', true, 'id', v_prev.id, 'doc_no', v_prev.doc_no, 'replayed', true,
      'before_count_doc_no', NULL);
  END IF;

  IF p_kind IS NULL OR p_kind NOT IN ('receipt', 'count', 'writeoff') THEN
    RAISE EXCEPTION 'Loại phiếu không hợp lệ';
  END IF;

  -- Ngày phiếu: hôm nay (ngày kinh doanh) → mốc là lúc ghi; nhập/huỷ ghi lùi ≤ 7 ngày → cuối ngày đó − 1 giây.
  v_today := public.current_business_date(v_store_id);
  v_doc_date := coalesce(nullif(btrim(p_doc ->> 'doc_date'), '')::date, v_today);
  IF p_kind = 'count' AND v_doc_date <> v_today THEN
    RAISE EXCEPTION 'Phiếu kiểm kho chỉ ghi cho hôm nay';
  END IF;
  IF v_doc_date > v_today THEN
    RAISE EXCEPTION 'Không ghi phiếu cho ngày chưa tới';
  END IF;
  IF v_doc_date < v_today - 7 THEN
    RAISE EXCEPTION 'Chỉ ghi lùi tối đa 7 ngày';
  END IF;
  IF v_doc_date = v_today THEN
    v_effective_at := now();
  ELSE
    SELECT b.day_to - interval '1 second' INTO v_effective_at
      FROM public.business_day_bounds(v_store_id, v_doc_date) b;
  END IF;

  -- Đầu phiếu. Trạng thái trả tiền chỉ có ở phiếu nhập; phiếu khác bỏ qua.
  v_note := nullif(btrim(coalesce(p_doc ->> 'note', '')), '');
  IF length(v_note) > 500 THEN
    RAISE EXCEPTION 'Ghi chú tối đa 500 ký tự';
  END IF;
  IF p_kind = 'writeoff' AND v_note IS NULL THEN
    RAISE EXCEPTION 'Phiếu xuất huỷ cần lý do';
  END IF;
  IF p_kind = 'receipt' THEN
    v_supplier := nullif(btrim(coalesce(p_doc ->> 'supplier_name', '')), '');
    IF length(v_supplier) > 120 THEN
      RAISE EXCEPTION 'Tên nhà cung cấp tối đa 120 ký tự';
    END IF;
    v_paid_status := nullif(btrim(coalesce(p_doc ->> 'paid_status', '')), '');
    v_paid_method := nullif(btrim(coalesce(p_doc ->> 'paid_method', '')), '');
    IF v_paid_status IS NULL OR v_paid_status NOT IN ('paid', 'unpaid') THEN
      RAISE EXCEPTION 'Chọn đã trả hay chưa trả';
    END IF;
    IF v_paid_method IS NOT NULL AND v_paid_method NOT IN ('cash', 'bank') THEN
      RAISE EXCEPTION 'Phương thức trả tiền không hợp lệ';
    END IF;
    IF v_paid_status = 'paid' AND v_paid_method IS NULL THEN
      RAISE EXCEPTION 'Chọn phương thức trả tiền';
    END IF;
    IF v_paid_status = 'unpaid' AND v_paid_method IS NOT NULL THEN
      RAISE EXCEPTION 'Phiếu chưa trả không có phương thức trả';
    END IF;
  END IF;

  -- Dòng phiếu.
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Phiếu cần ít nhất một dòng';
  END IF;
  IF jsonb_array_length(p_lines) > 500 THEN
    RAISE EXCEPTION 'Phiếu tối đa 500 dòng';
  END IF;
  FOR v_line IN SELECT e.value FROM jsonb_array_elements(p_lines) e LOOP
    v_item_id := CASE WHEN jsonb_typeof(v_line) = 'object'
                      AND (v_line ->> 'inventory_item_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                      THEN (v_line ->> 'inventory_item_id')::uuid END;
    -- FOR SHARE: ngừng dùng hàng song song phải chờ phiếu này xong.
    PERFORM 1 FROM public.inventory_items i
      WHERE i.id = v_item_id AND i.store_id = v_store_id AND i.is_active
      FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Hàng hoá không thuộc quán hoặc đã ngừng dùng';
    END IF;
    IF v_item_id = ANY (v_items) THEN
      RAISE EXCEPTION 'Một hàng chỉ một dòng trong phiếu';
    END IF;

    v_qty := NULL;
    v_counted := NULL;
    v_cost := NULL;
    v_amount := 0;
    IF p_kind IN ('receipt', 'writeoff') THEN
      v_qty := public.inventory_json_numeric(v_line -> 'qty');
      IF v_qty IS NULL OR v_qty <= 0 OR v_qty <> round(v_qty, 3) THEN
        RAISE EXCEPTION 'Số lượng phải lớn hơn 0 và tối đa 3 chữ số thập phân';
      END IF;
      IF v_qty >= 1000000 THEN
        RAISE EXCEPTION 'Số lượng phải nhỏ hơn 1.000.000';
      END IF;
    ELSE
      v_counted := public.inventory_json_numeric(v_line -> 'counted_qty');
      IF v_counted IS NULL OR v_counted < 0 OR v_counted <> round(v_counted, 3) THEN
        RAISE EXCEPTION 'Số lượng đếm phải từ 0 và tối đa 3 chữ số thập phân';
      END IF;
      IF v_counted >= 1000000 THEN
        RAISE EXCEPTION 'Số lượng phải nhỏ hơn 1.000.000';
      END IF;
    END IF;
    -- Đơn giá: bắt buộc ở phiếu nhập, tuỳ chọn ở phiếu kiểm (giá vốn đầu kỳ), không có ở phiếu huỷ.
    IF p_kind = 'receipt' OR (p_kind = 'count' AND coalesce(jsonb_typeof(v_line -> 'unit_cost'), 'null') <> 'null') THEN
      v_cost_raw := public.inventory_json_numeric(v_line -> 'unit_cost');
      IF v_cost_raw IS NULL OR v_cost_raw <> trunc(v_cost_raw) OR v_cost_raw < 0 OR v_cost_raw > 100000000 THEN
        RAISE EXCEPTION 'Đơn giá không hợp lệ';
      END IF;
      v_cost := v_cost_raw::bigint;
    END IF;
    IF p_kind = 'receipt' THEN
      v_amount := round(v_qty * v_cost)::bigint; -- nửa lên, khớp lib/inventory.ts
      v_total := v_total + v_amount;
    END IF;

    v_items := array_append(v_items, v_item_id);
    v_qtys := array_append(v_qtys, v_qty);
    v_costs := array_append(v_costs, v_cost);
    v_counteds := array_append(v_counteds, v_counted);
    v_amounts := array_append(v_amounts, v_amount);
  END LOOP;

  -- Phiếu kiểm: chụp tồn theo máy TRƯỚC khi chèn phiếu.
  IF p_kind = 'count' THEN
    SELECT array_agg(coalesce(st.qty, 0) ORDER BY u.ord) INTO v_systems
      FROM unnest(v_items) WITH ORDINALITY AS u(item_id, ord)
      LEFT JOIN public.inventory_stock_at(v_store_id, now()) st ON st.inventory_item_id = u.item_id;
  END IF;

  v_doc_no := public.inventory_next_doc_no(v_store_id, p_kind);
  INSERT INTO public.inventory_documents
    (store_id, kind, doc_no, doc_date, effective_at, supplier_name, note, total_amount, paid_status, paid_method,
     client_request_id, created_by)
  VALUES
    (v_store_id, p_kind, v_doc_no, v_doc_date, v_effective_at, v_supplier, v_note, v_total, v_paid_status, v_paid_method,
     p_client_request_id, auth.uid())
  RETURNING id INTO v_doc_id;

  INSERT INTO public.inventory_document_lines
    (document_id, store_id, inventory_item_id, qty, unit_cost, counted_qty, system_qty, line_amount)
  SELECT v_doc_id, v_store_id, u.item_id, u.qty, u.cost, u.counted, v_systems[u.ord], u.amount
    FROM unnest(v_items, v_qtys, v_costs, v_counteds, v_amounts)
         WITH ORDINALITY AS u(item_id, qty, cost, counted, amount, ord);

  -- 122b nối phiếu nhập đã trả ↔ phiếu chi ở dòng dưới (hàm 122b tự lọc loại phiếu).
  -- mevo-anchor:122b inventory_post_document.cash_book(v_doc_id)

  -- Ghi lùi ngày mà đã có phiếu kiểm sau mốc đó cho cùng hàng: tồn hiện tại không đổi (số đếm là sự thật), báo
  -- cho người dùng biết phiếu kiểm nào đã "nuốt" phiếu này.
  IF v_effective_at < now() THEN
    SELECT d.doc_no INTO v_before
      FROM public.inventory_documents d
     WHERE d.store_id = v_store_id AND d.kind = 'count' AND d.status = 'posted' AND d.effective_at > v_effective_at
       AND EXISTS (SELECT 1 FROM public.inventory_document_lines cl
                    WHERE cl.document_id = d.id AND cl.inventory_item_id = ANY (v_items))
     ORDER BY d.effective_at, d.created_at
     LIMIT 1;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_doc_id, 'doc_no', v_doc_no, 'replayed', false,
    'before_count_doc_no', v_before);
END;
$$;

-- Huỷ phiếu (không sửa phiếu đã lưu). Trả {ok, id, already}.
CREATE FUNCTION public.inventory_void_document(p_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc_id uuid := p_id;
  v_doc public.inventory_documents%ROWTYPE;
  v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  SELECT * INTO v_doc FROM public.inventory_documents WHERE id = v_doc_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy phiếu';
  END IF;
  IF NOT public.is_store_back_office(v_doc.store_id) THEN
    RAISE EXCEPTION 'Không có quyền';
  END IF;
  IF v_doc.status = 'voided' THEN
    RETURN jsonb_build_object('ok', true, 'id', v_doc_id, 'already', true);
  END IF;
  IF v_reason = '' THEN
    RAISE EXCEPTION 'Cần lý do huỷ phiếu';
  END IF;
  IF length(v_reason) > 500 THEN
    RAISE EXCEPTION 'Lý do huỷ tối đa 500 ký tự';
  END IF;

  UPDATE public.inventory_documents
     SET status = 'voided', voided_by = auth.uid(), voided_at = now(), void_reason = v_reason
   WHERE id = v_doc_id;

  -- 122b huỷ phiếu chi đi kèm phiếu nhập ở dòng dưới.
  -- mevo-anchor:122b inventory_void_document.cash_book(v_doc_id)

  RETURN jsonb_build_object('ok', true, 'id', v_doc_id, 'already', false);
END;
$$;

-- ============================================================
-- 6) Đọc tồn, danh sách phiếu, chi tiết phiếu
-- ============================================================

-- Một phiếu dạng JSON (dùng chung cho danh sách + chi tiết). Nội bộ.
CREATE FUNCTION public.inventory_document_json(p_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', d.id, 'kind', d.kind, 'doc_no', d.doc_no, 'doc_date', d.doc_date, 'effective_at', d.effective_at,
    'supplier_name', d.supplier_name, 'note', d.note, 'total_amount', d.total_amount,
    'paid_status', d.paid_status, 'paid_method', d.paid_method, 'status', d.status,
    'line_count', (SELECT count(*) FROM public.inventory_document_lines l WHERE l.document_id = d.id),
    'created_at', d.created_at,
    'created_by_name', coalesce(
      (SELECT nullif(btrim(mo.display_name), '') FROM public.mevo_operators mo
        WHERE mo.user_id = d.created_by AND nullif(btrim(mo.display_name), '') IS NOT NULL LIMIT 1),
      (SELECT u.email FROM auth.users u WHERE u.id = d.created_by)),
    'voided_at', d.voided_at, 'void_reason', d.void_reason)
    FROM public.inventory_documents d
   WHERE d.id = p_id;
$$;

-- Tồn kho tại p_at: chủ quán, quản lý, thu ngân (chỉ xem). Hàng ngừng dùng xếp sau.
CREATE FUNCTION public.inventory_stock_levels(p_store_id uuid, p_at timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_at timestamptz := coalesce(p_at, now());
BEGIN
  IF p_store_id IS NULL
     OR NOT (public.is_store_back_office(p_store_id) OR public.is_store_pos_operator(p_store_id)) THEN
    RAISE EXCEPTION 'Không có quyền';
  END IF;

  RETURN jsonb_build_object('at', v_at, 'items', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', i.id, 'name', i.name, 'unit', i.unit, 'kind', i.kind, 'sku', i.sku, 'min_stock', i.min_stock,
             'is_active', i.is_active, 'qty', st.qty, 'last_unit_cost', c.unit_cost,
             'stock_value', round(greatest(st.qty, 0) * coalesce(c.unit_cost, 0))::bigint)
           ORDER BY i.is_active DESC, lower(i.name), i.id)
      FROM public.inventory_items i
      JOIN public.inventory_stock_at(p_store_id, v_at) st ON st.inventory_item_id = i.id
      LEFT JOIN LATERAL (
        SELECT l.unit_cost
          FROM public.inventory_document_lines l
          JOIN public.inventory_documents d ON d.id = l.document_id
         WHERE l.inventory_item_id = i.id AND d.store_id = p_store_id AND d.status = 'posted'
           AND d.kind IN ('receipt', 'count') AND l.unit_cost IS NOT NULL AND d.effective_at < v_at
         ORDER BY d.effective_at DESC, d.created_at DESC
         LIMIT 1) c ON true
     WHERE i.store_id = p_store_id), '[]'::jsonb));
END;
$$;

-- Danh sách phiếu theo ngày phiếu [p_from, p_to] (≤ 93 ngày), p_kind null = mọi loại; kèm gợi ý nhà cung cấp.
CREATE FUNCTION public.inventory_list_documents(p_store_id uuid, p_kind text, p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_store_id IS NULL OR NOT public.is_store_back_office(p_store_id) THEN
    RAISE EXCEPTION 'Không có quyền';
  END IF;
  IF p_kind IS NOT NULL AND p_kind NOT IN ('receipt', 'count', 'writeoff') THEN
    RAISE EXCEPTION 'Loại phiếu không hợp lệ';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
    RAISE EXCEPTION 'Khoảng ngày không hợp lệ';
  END IF;
  IF p_to - p_from > 92 THEN
    RAISE EXCEPTION 'Chỉ xem tối đa 93 ngày';
  END IF;

  RETURN jsonb_build_object(
    'documents', coalesce((
      SELECT jsonb_agg(public.inventory_document_json(d.id) ORDER BY d.effective_at DESC, d.created_at DESC, d.doc_no DESC)
        FROM public.inventory_documents d
       WHERE d.store_id = p_store_id AND (p_kind IS NULL OR d.kind = p_kind)
         AND d.doc_date BETWEEN p_from AND p_to), '[]'::jsonb),
    -- Tên nhà cung cấp đã dùng 365 ngày gần nhất, không trùng (bỏ qua hoa thường, giữ cách viết mới nhất).
    'suppliers', coalesce((
      SELECT jsonb_agg(x.name ORDER BY x.last_at DESC)
        FROM (
          SELECT t.name, t.last_at
            FROM (
              SELECT DISTINCT ON (lower(d.supplier_name)) d.supplier_name AS name, d.effective_at AS last_at
                FROM public.inventory_documents d
               WHERE d.store_id = p_store_id AND d.kind = 'receipt' AND d.status = 'posted'
                 AND d.supplier_name IS NOT NULL
                 AND d.doc_date >= public.current_business_date(p_store_id) - 365
               ORDER BY lower(d.supplier_name), d.effective_at DESC, d.created_at DESC) t
           ORDER BY t.last_at DESC
           LIMIT 50) x), '[]'::jsonb));
END;
$$;

-- Chi tiết một phiếu + các dòng.
CREATE FUNCTION public.inventory_get_document(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
BEGIN
  SELECT d.store_id INTO v_store_id FROM public.inventory_documents d WHERE d.id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy phiếu';
  END IF;
  IF NOT public.is_store_back_office(v_store_id) THEN
    RAISE EXCEPTION 'Không có quyền';
  END IF;

  RETURN public.inventory_document_json(p_id) || jsonb_build_object('lines', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'inventory_item_id', l.inventory_item_id, 'name', i.name, 'unit', i.unit, 'qty', l.qty,
             'unit_cost', l.unit_cost, 'counted_qty', l.counted_qty, 'system_qty', l.system_qty,
             'line_amount', l.line_amount)
           ORDER BY lower(i.name), l.id)
      FROM public.inventory_document_lines l
      JOIN public.inventory_items i ON i.id = l.inventory_item_id
     WHERE l.document_id = p_id), '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_sales_lines(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.inventory_sales_qty(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.inventory_stock_at(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.inventory_next_doc_no(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.inventory_json_numeric(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.inventory_document_json(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.inventory_post_document(text, jsonb, jsonb, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inventory_void_document(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inventory_stock_levels(uuid, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inventory_list_documents(uuid, text, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inventory_get_document(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_post_document(text, jsonb, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_void_document(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_stock_levels(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_list_documents(uuid, text, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_get_document(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
