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

NOTIFY pgrst, 'reload schema';
