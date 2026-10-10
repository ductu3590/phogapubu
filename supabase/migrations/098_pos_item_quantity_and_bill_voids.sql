-- 098 (2026-10-09, Đợt 2 POS): thu ngân sửa SỐ LƯỢNG món có lý do + tạm tính/hoá đơn in đủ dòng 0đ.
--
-- A4. Bảng order_item_quantity_changes = lịch sử sửa số lượng (tăng hoặc giảm), mỗi lần một dòng, có lý do bắt
--     buộc + người sửa + giờ. RPC pos_set_order_item_quantity cùng khuôn pos_void_order_item (mig 046/093):
--     chủ quán hoặc thu ngân, chặn bill đã thu / đã huỷ / có voucher; tổng do recompute_order_total tính lại.
--     Muốn bớt về 0 thì dùng "Bỏ món" (đã có audit riêng), không cho số lượng = 0.
-- A3. get_sessions_bill trước đây LOẠI dòng "Bỏ" và in "Tặng" không kèm lý do → khách không biết vì sao tổng
--     thấp hơn. Giờ in mọi dòng: dòng Bỏ/Tặng giá 0đ kèm loại + lý do; mỗi phiên thêm `qty_changes`.
-- ⚠️ Vá hàm sống TẠI CHỖ (pg_get_functiondef → replace → EXECUTE), như mig 093 — không chép thân hàm từ file cũ.

-- ============================================================
-- 1) Lịch sử sửa số lượng
-- ============================================================
CREATE TABLE IF NOT EXISTS public.order_item_quantity_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  old_quantity integer NOT NULL CHECK (old_quantity > 0),
  new_quantity integer NOT NULL CHECK (new_quantity > 0),
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_item_quantity_changes_item_idx ON public.order_item_quantity_changes(order_item_id);
CREATE INDEX IF NOT EXISTS order_item_quantity_changes_order_idx ON public.order_item_quantity_changes(order_id);

ALTER TABLE public.order_item_quantity_changes ENABLE ROW LEVEL SECURITY;
-- Chỉ đọc cho người ở quầy; ghi duy nhất qua RPC SECURITY DEFINER.
DROP POLICY IF EXISTS pos_read_qty_changes ON public.order_item_quantity_changes;
CREATE POLICY pos_read_qty_changes ON public.order_item_quantity_changes
  FOR SELECT TO authenticated USING (public.is_store_pos_operator(store_id));

-- ============================================================
-- 2) RPC sửa số lượng
-- ============================================================
CREATE OR REPLACE FUNCTION public.pos_set_order_item_quantity(
  p_order_item_id uuid,
  p_quantity integer,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.order_items%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_total integer;
BEGIN
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 999 THEN
    RAISE EXCEPTION 'Số lượng phải từ 1 đến 999 (bỏ hẳn món thì dùng "Bỏ món")';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Cần ghi lý do sửa số lượng';
  END IF;

  SELECT oi.* INTO v_item FROM public.order_items oi WHERE oi.id = p_order_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy món trong bill';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_item.order_id FOR UPDATE;

  IF NOT public.is_store_pos_operator(v_order.store_id) THEN
    RAISE EXCEPTION 'Bạn không có quyền sửa bill';
  END IF;

  IF v_order.payment_received_at IS NOT NULL
    OR v_order.status = 'cancelled'
    OR v_order.voucher_id IS NOT NULL THEN
    RAISE EXCEPTION 'Bill này không còn được điều chỉnh';
  END IF;

  IF v_item.void_type IS NOT NULL THEN
    RAISE EXCEPTION 'Món đã được Bỏ/Tặng, hãy khôi phục trước khi sửa số lượng';
  END IF;

  -- Bấm lặp (mạng chậm, bấm 2 lần) với cùng con số → không ghi thêm lịch sử.
  IF v_item.quantity = p_quantity THEN
    RETURN jsonb_build_object('order_id', v_order.id, 'total_amount', v_order.total_amount, 'already_applied', true);
  END IF;

  INSERT INTO public.order_item_quantity_changes
    (store_id, order_id, order_item_id, item_name, old_quantity, new_quantity, reason, changed_by)
  VALUES
    (v_order.store_id, v_order.id, v_item.id, v_item.item_name, v_item.quantity, p_quantity, v_reason, auth.uid());

  UPDATE public.order_items SET quantity = p_quantity WHERE id = v_item.id;

  v_total := public.recompute_order_total(v_order.id);

  UPDATE public.table_sessions SET last_activity_at = now() WHERE id = v_order.session_id;

  RETURN jsonb_build_object('order_id', v_order.id, 'total_amount', v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.pos_set_order_item_quantity(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pos_set_order_item_quantity(uuid, integer, text) TO authenticated;

-- ============================================================
-- 3) Vá tại chỗ
-- ============================================================
CREATE OR REPLACE FUNCTION pg_temp.mevo_patch(p_sig text, p_from text, p_to text)
RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef(p_sig::regprocedure);
  IF position(p_from IN v_def) = 0 THEN
    RAISE EXCEPTION 'mig 098: % không còn chuỗi cần vá: %', p_sig, p_from;
  END IF;
  EXECUTE replace(v_def, p_from, p_to);
END
$patch$;

-- 3a) Panel bill POS: mỗi món kèm lịch sử sửa số lượng (cả 2 chỗ dựng items: đơn thường + đơn bị từ chối).
SELECT pg_temp.mevo_patch('public.list_open_table_sessions(uuid)',
  $s$'is_gift', oi.void_type = 'gift'$s$,
  $s$'is_gift', oi.void_type = 'gift',
                   'qty_changes', COALESCE((
                     SELECT jsonb_agg(jsonb_build_object(
                       'old_quantity', c.old_quantity,
                       'new_quantity', c.new_quantity,
                       'reason', c.reason,
                       'changed_at', c.changed_at
                     ) ORDER BY c.changed_at)
                     FROM public.order_item_quantity_changes c
                     WHERE c.order_item_id = oi.id
                   ), '[]'::jsonb)$s$);

-- 3b) Tạm tính / hoá đơn: giữ dòng Bỏ (0đ), kèm loại + lý do.
SELECT pg_temp.mevo_patch('public.get_sessions_bill(uuid[])',
  $s$AND oi.void_type IS DISTINCT FROM 'cancelled'$s$, '');
SELECT pg_temp.mevo_patch('public.get_sessions_bill(uuid[])',
  $s$WHEN line_data.void_type = 'gift' THEN 0$s$,
  $s$WHEN line_data.void_type IS NOT NULL THEN 0$s$);
SELECT pg_temp.mevo_patch('public.get_sessions_bill(uuid[])',
  $s$'is_gift', line_data.void_type = 'gift'$s$,
  $s$'is_gift', line_data.void_type = 'gift',
               'void_type', line_data.void_type,
               'void_reason', line_data.void_reason$s$);
SELECT pg_temp.mevo_patch('public.get_sessions_bill(uuid[])',
  $s$AS unit_price,$s$,
  $s$AS unit_price,
                      oi.void_reason,$s$);
SELECT pg_temp.mevo_patch('public.get_sessions_bill(uuid[])',
  $s$GROUP BY oi.item_name, oi.item_price, oi.void_type,$s$,
  $s$GROUP BY oi.item_name, oi.item_price, oi.void_type, oi.void_reason,$s$);
SELECT pg_temp.mevo_patch('public.get_sessions_bill(uuid[])',
  $s$ORDER BY line_data.name)$s$,
  $s$ORDER BY line_data.name, line_data.void_type NULLS FIRST)$s$);
-- 3c) Mỗi phiên kèm lịch sử sửa số lượng để in ra cho khách.
SELECT pg_temp.mevo_patch('public.get_sessions_bill(uuid[])',
  $s$), '[]'::jsonb) AS items$s$,
  $s$), '[]'::jsonb) AS items,
           COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
               'name', c.item_name,
               'old_quantity', c.old_quantity,
               'new_quantity', c.new_quantity,
               'reason', c.reason,
               'changed_at', c.changed_at
             ) ORDER BY c.changed_at)
             FROM public.order_item_quantity_changes c
             JOIN public.orders o ON o.id = c.order_id
             WHERE o.session_id = s.id
               AND o.status <> 'cancelled'
           ), '[]'::jsonb) AS qty_changes$s$);
