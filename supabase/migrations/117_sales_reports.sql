-- 117_sales_reports.sql — Báo cáo bán hàng (chỉ đọc): Theo món, Theo danh mục, Theo giờ, Món huỷ cho trang /admin/reports.
--
-- 1) Phạm vi "đã bán" có MỘT định nghĩa: report_paid_orders. Điều kiện WHERE chép nguyên văn CTE `money` của
--    get_bills_report (A04) — đơn không huỷ, đã nhận tiền (hoặc tiền mặt cũ status='paid'), mốc giờ
--    COALESCE(payment_received_at, completed_at, updated_at) trong kỳ — nên Σ tiền món − giảm giá = doanh thu A04
--    từng đồng. Bàn chưa thu không vào báo cáo. Mig 125 sẽ vá get_bills_report gọi lại hàm này (và so nguyên văn
--    điều kiện), nên ĐỪNG sửa WHERE ở đây mà không sửa A04 cùng lúc.
-- 2) Tiền một dòng món giống recompute_order_total: (item_price + Σ topping.price) × quantity, chỉ dòng void_type
--    NULL có tiền; dòng 'gift' 0đ nhưng đếm vào SL tặng; dòng 'cancelled' bỏ hẳn.
-- 3) Kỳ = các ngày kinh doanh p_from … p_to (mig 111), cắt từ business_day_bounds(p_from).day_from tới
--    business_day_bounds(p_to).day_to. Tối đa 366 ngày.
-- 4) Danh mục = danh mục HIỆN TẠI của order_items.menu_item_id; món đã xoá / mất danh mục → 'Khác' (category_id null).
--    Giờ = giờ vào bếp COALESCE(confirmed_at, created_at) theo giờ VN (thiếu cả hai thì giờ nhận tiền), xếp theo
--    ngày kinh doanh của quán: khung chứa giờ bắt đầu ngày đứng đầu. Bill vẫn về ngày theo giờ NHẬN TIỀN.
-- 5) Chỉ thêm hàm mới (CREATE FUNCTION, không OR REPLACE), không vá hàm đang chạy.

-- ============================================================
-- 0) Điều kiện trước
-- ============================================================
DO $pre$
BEGIN
  IF to_regprocedure('public.business_day_bounds(uuid,date)') IS NULL THEN
    RAISE EXCEPTION 'mig 117: thiếu hàm business_day_bounds(uuid,date) (mig 111)';
  END IF;
  IF to_regprocedure('public.get_bills_report(uuid,date)') IS NULL THEN
    RAISE EXCEPTION 'mig 117: thiếu hàm get_bills_report(uuid,date)';
  END IF;
  IF to_regprocedure('public.bills_report_table_label(uuid[],uuid[],text)') IS NULL THEN
    RAISE EXCEPTION 'mig 117: thiếu hàm bills_report_table_label(uuid[],uuid[],text) (mig 100)';
  END IF;
  IF to_regprocedure('public.is_store_pos_operator(uuid)') IS NULL THEN
    RAISE EXCEPTION 'mig 117: thiếu hàm is_store_pos_operator(uuid)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'confirmed_at') THEN
    RAISE EXCEPTION 'mig 117: thiếu cột orders.confirmed_at';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'bill_discount_amount') THEN
    RAISE EXCEPTION 'mig 117: thiếu cột orders.bill_discount_amount';
  END IF;
END
$pre$;

-- ============================================================
-- 1) Index: quét đơn theo giờ nhận tiền, đúng biểu thức báo cáo dùng
-- ============================================================
CREATE INDEX IF NOT EXISTS orders_store_report_received_idx
  ON public.orders (store_id, (COALESCE(payment_received_at, completed_at, updated_at)));

-- ============================================================
-- 2) Hàm nội bộ (chỉ gọi từ RPC SECURITY DEFINER)
-- ============================================================
-- Kỳ ngày kinh doanh → mốc giờ. Viết plpgsql vì cần RAISE.
CREATE FUNCTION public.report_period_bounds(p_store_id uuid, p_from date, p_to date)
RETURNS TABLE(period_from timestamptz, period_to timestamptz)
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RAISE EXCEPTION 'Kỳ báo cáo không hợp lệ';
  END IF;
  IF p_to - p_from + 1 > 366 THEN
    RAISE EXCEPTION 'Kỳ báo cáo tối đa 366 ngày';
  END IF;
  RETURN QUERY
    SELECT f.day_from, t.day_to
    FROM public.business_day_bounds(p_store_id, p_from) f,
         public.business_day_bounds(p_store_id, p_to) t;
END;
$$;

-- Đơn đã thu trong [p_from, p_to). WHERE giữ NGUYÊN VĂN CTE `money` của get_bills_report.
CREATE FUNCTION public.report_paid_orders(p_store_id uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE(order_id uuid, session_id uuid, received_at timestamptz, kitchen_at timestamptz,
              total_amount bigint, discount_amount bigint, bill_discount_amount bigint)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT o.id,
         o.session_id,
         COALESCE(o.payment_received_at, o.completed_at, o.updated_at),
         -- Giờ vào bếp; rơi tiếp về giờ nhận tiền (luôn có, do WHERE) để Theo giờ không có khung NULL.
         COALESCE(o.confirmed_at, o.created_at, o.payment_received_at, o.completed_at, o.updated_at),
         o.total_amount::bigint,
         COALESCE(o.discount_amount, 0)::bigint,
         o.bill_discount_amount::bigint
  FROM public.orders o
  WHERE o.store_id = p_store_id
    AND o.status <> 'cancelled'
    AND (o.payment_received_at IS NOT NULL OR (o.payment_method = 'cash' AND o.status = 'paid'))
    AND COALESCE(o.payment_received_at, o.completed_at, o.updated_at) >= p_from
    AND COALESCE(o.payment_received_at, o.completed_at, o.updated_at) < p_to
$$;

-- Đơn giá một đơn vị món = item_price + Σ topping.price, đúng công thức recompute_order_total và cột Điều chỉnh A04.
-- Một chỗ duy nhất cho cả Theo món (tiền bán) lẫn Món huỷ (tiền bỏ / tặng / giảm SL).
CREATE FUNCTION public.report_line_unit_price(p_item_price integer, p_toppings jsonb)
RETURNS bigint
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT p_item_price::bigint + COALESCE((
    SELECT SUM(COALESCE((e->>'price')::integer, 0))
    FROM jsonb_array_elements(COALESCE(p_toppings, '[]'::jsonb)) e
  ), 0)::bigint
$$;

-- Dòng món của các đơn đã thu: bỏ dòng 'cancelled'; dòng tặng amount = 0 (giống recompute_order_total chỉ cộng void_type NULL).
CREATE FUNCTION public.report_sold_lines(p_store_id uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE(order_id uuid, order_item_id uuid, menu_item_id uuid, item_name text, quantity integer,
              is_gift boolean, amount bigint, kitchen_at timestamptz)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT p.order_id,
         oi.id,
         oi.menu_item_id,
         oi.item_name,
         oi.quantity,
         COALESCE(oi.void_type = 'gift', false),
         CASE WHEN oi.void_type IS NULL
              THEN public.report_line_unit_price(oi.item_price, oi.selected_toppings) * oi.quantity
              ELSE 0 END::bigint,
         p.kitchen_at
  FROM public.report_paid_orders(p_store_id, p_from, p_to) p
  JOIN public.order_items oi ON oi.order_id = p.order_id
  WHERE oi.void_type IS DISTINCT FROM 'cancelled'
$$;

-- Nhóm món dùng chung cho Theo món và Theo danh mục. Khoá nhóm (tên đã chụp, danh mục HIỆN TẠI): hai món cùng tên
-- ở hai danh mục là hai dòng; món đã xoá / mất danh mục / danh mục đã xoá → category_id null, 'Khác'.
CREATE FUNCTION public.report_item_groups(p_store_id uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE(item_name text, category_id uuid, category_name text, qty_sold bigint, qty_gift bigint, amount bigint)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT l.item_name, mc.id, COALESCE(mc.name, 'Khác'),
         COALESCE(SUM(l.quantity) FILTER (WHERE NOT l.is_gift), 0)::bigint,
         COALESCE(SUM(l.quantity) FILTER (WHERE l.is_gift), 0)::bigint,
         COALESCE(SUM(l.amount), 0)::bigint
  FROM public.report_sold_lines(p_store_id, p_from, p_to) l
  LEFT JOIN public.menu_items mi ON mi.id = l.menu_item_id
  LEFT JOIN public.menu_categories mc ON mc.id = mi.category_id
  GROUP BY l.item_name, mc.id, mc.name
$$;

-- Khối tổng chung của mọi báo cáo bán hàng. open_tables_count chỉ có nghĩa khi kỳ chứa lúc này.
CREATE FUNCTION public.report_sales_summary(p_store_id uuid, p_from timestamptz, p_to timestamptz)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = public
AS $$
  WITH o AS (SELECT * FROM public.report_paid_orders(p_store_id, p_from, p_to)),
       l AS (SELECT * FROM public.report_sold_lines(p_store_id, p_from, p_to))
  SELECT jsonb_build_object(
    'items_amount',   (SELECT COALESCE(SUM(l.amount), 0) FROM l),
    'discount_total', (SELECT COALESCE(SUM(o.discount_amount + o.bill_discount_amount), 0) FROM o),
    'revenue',        (SELECT COALESCE(SUM(o.total_amount), 0) FROM o),
    'qty_sold',       (SELECT COALESCE(SUM(l.quantity) FILTER (WHERE NOT l.is_gift), 0) FROM l),
    'qty_gift',       (SELECT COALESCE(SUM(l.quantity) FILTER (WHERE l.is_gift), 0) FROM l),
    'open_tables_count', CASE
      WHEN now() >= p_from AND now() < p_to THEN (
        SELECT COUNT(*) FROM public.session_tables st
        JOIN public.table_sessions s ON s.id = st.session_id
        WHERE s.store_id = p_store_id AND s.status = 'open' AND st.is_open)
      ELSE 0 END)
$$;

-- ============================================================
-- 3) RPC. Thứ tự kiểm: tham số → quyền → kỳ.
-- ============================================================
CREATE FUNCTION public.report_sales_by_item(p_store_id uuid, p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from timestamptz;
  v_to   timestamptz;
BEGIN
  IF p_store_id IS NULL OR p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION 'Thiếu quán hoặc kỳ';
  END IF;
  IF NOT public.is_store_pos_operator(p_store_id) THEN
    RAISE EXCEPTION 'Không có quyền xem báo cáo quán này';
  END IF;
  SELECT b.period_from, b.period_to INTO v_from, v_to FROM public.report_period_bounds(p_store_id, p_from, p_to) b;

  RETURN jsonb_build_object(
    'from', p_from, 'to', p_to, 'period_from', v_from, 'period_to', v_to,
    'summary', public.report_sales_summary(p_store_id, v_from, v_to),
    'rows', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'item_name', g.item_name, 'category_id', g.category_id, 'category_name', g.category_name,
        'qty_sold', g.qty_sold, 'qty_gift', g.qty_gift, 'amount', g.amount
      ) ORDER BY g.amount DESC, g.qty_sold DESC, g.item_name, g.category_name), '[]'::jsonb)
      FROM public.report_item_groups(p_store_id, v_from, v_to) g)
  );
END;
$$;

CREATE FUNCTION public.report_sales_by_category(p_store_id uuid, p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from timestamptz;
  v_to   timestamptz;
BEGIN
  IF p_store_id IS NULL OR p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION 'Thiếu quán hoặc kỳ';
  END IF;
  IF NOT public.is_store_pos_operator(p_store_id) THEN
    RAISE EXCEPTION 'Không có quyền xem báo cáo quán này';
  END IF;
  SELECT b.period_from, b.period_to INTO v_from, v_to FROM public.report_period_bounds(p_store_id, p_from, p_to) b;

  RETURN jsonb_build_object(
    'from', p_from, 'to', p_to, 'period_from', v_from, 'period_to', v_to,
    'summary', public.report_sales_summary(p_store_id, v_from, v_to),
    'rows', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'category_id', c.category_id, 'category_name', c.category_name,
        'qty_sold', c.qty_sold, 'qty_gift', c.qty_gift, 'amount', c.amount, 'items', c.items
      ) ORDER BY c.amount DESC, c.qty_sold DESC, c.category_name), '[]'::jsonb)
      FROM (
        -- Gom lần hai trên đúng nhóm của Theo món, nên tổng danh mục luôn bằng tổng món.
        SELECT g.category_id, g.category_name,
               SUM(g.qty_sold)::bigint AS qty_sold, SUM(g.qty_gift)::bigint AS qty_gift, SUM(g.amount)::bigint AS amount,
               jsonb_agg(jsonb_build_object(
                 'item_name', g.item_name, 'qty_sold', g.qty_sold, 'qty_gift', g.qty_gift, 'amount', g.amount
               ) ORDER BY g.amount DESC, g.qty_sold DESC, g.item_name) AS items
        FROM public.report_item_groups(p_store_id, v_from, v_to) g
        GROUP BY g.category_id, g.category_name
      ) c)
  );
END;
$$;

CREATE FUNCTION public.report_sales_by_hour(p_store_id uuid, p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from timestamptz;
  v_to   timestamptz;
  v_start_min integer;
BEGIN
  IF p_store_id IS NULL OR p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION 'Thiếu quán hoặc kỳ';
  END IF;
  IF NOT public.is_store_pos_operator(p_store_id) THEN
    RAISE EXCEPTION 'Không có quyền xem báo cáo quán này';
  END IF;
  SELECT b.period_from, b.period_to INTO v_from, v_to FROM public.report_period_bounds(p_store_id, p_from, p_to) b;

  -- Phút bắt đầu ngày kinh doanh; thiếu dòng cài đặt coi như 00:00.
  v_start_min := COALESCE(
    (SELECT (EXTRACT(hour FROM w.business_day_start) * 60 + EXTRACT(minute FROM w.business_day_start))::integer
       FROM public.store_workflow_settings w WHERE w.store_id = p_store_id),
    0);

  RETURN jsonb_build_object(
    'from', p_from, 'to', p_to, 'period_from', v_from, 'period_to', v_to,
    'summary', public.report_sales_summary(p_store_id, v_from, v_to),
    'rows', (
      -- Xếp theo ngày kinh doanh, không theo đồng hồ: quán mở 05:00 thì 18h đứng trước 04h sáng hôm sau.
      -- Khung chứa giờ bắt đầu ngày đứng ĐẦU (quán 05:30 → khung 5h đầu tiên), nên chia nguyên v_start_min / 60.
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'hour', h.hour, 'orders_count', h.orders_count, 'items_qty', h.items_qty, 'amount', h.amount
      ) ORDER BY (h.hour - v_start_min / 60 + 24) % 24), '[]'::jsonb)
      FROM (
        SELECT EXTRACT(hour FROM l.kitchen_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer AS hour,
               COUNT(DISTINCT l.order_id) AS orders_count,
               SUM(l.quantity)::bigint AS items_qty, -- gồm cả SL tặng
               SUM(l.amount)::bigint AS amount
        FROM public.report_sold_lines(p_store_id, v_from, v_to) l
        GROUP BY 1
      ) h)
  );
END;
$$;

-- Món huỷ: cùng nguồn cột Điều chỉnh của get_bills_report (order_items.void_* + order_item_quantity_changes), lọc theo
-- GIỜ THAO TÁC trong kỳ, không giới hạn trong đơn đã thu. Khác A04 hai chỗ, đều cố ý:
--   • chỉ lần GIẢM số lượng (lần tăng không phải "huỷ"); quantity = old − new, amount = (old − new) × đơn giá;
--   • bỏ đơn bị từ chối / huỷ cả đơn (status 'cancelled' hoặc rejected_at): đã nằm ở mục Đơn huỷ của A04, tính lại
--     từng món ở đây là đếm hai lần.
CREATE FUNCTION public.report_voids(p_store_id uuid, p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from timestamptz;
  v_to   timestamptz;
BEGIN
  IF p_store_id IS NULL OR p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION 'Thiếu quán hoặc kỳ';
  END IF;
  IF NOT public.is_store_pos_operator(p_store_id) THEN
    RAISE EXCEPTION 'Không có quyền xem báo cáo quán này';
  END IF;
  SELECT b.period_from, b.period_to INTO v_from, v_to FROM public.report_period_bounds(p_store_id, p_from, p_to) b;

  RETURN (
    WITH ev AS (
      -- Bỏ / tặng: tiền theo số lượng hiện tại của dòng.
      SELECT oi.voided_at AS at, oi.void_type AS type, oi.order_id, oi.item_name, oi.quantity,
             public.report_line_unit_price(oi.item_price, oi.selected_toppings) * oi.quantity AS amount,
             oi.void_reason AS reason, oi.voided_by AS by_user
      FROM public.order_items oi
      WHERE oi.void_type IS NOT NULL
        AND oi.voided_at >= v_from AND oi.voided_at < v_to
      UNION ALL
      -- Giảm số lượng. Dòng món có thể đã mất (LEFT JOIN) thì đơn giá 0 như A04.
      SELECT c.changed_at, 'quantity', c.order_id, c.item_name, c.old_quantity - c.new_quantity,
             public.report_line_unit_price(COALESCE(oi.item_price, 0), oi.selected_toppings)
               * (c.old_quantity - c.new_quantity),
             c.reason, c.changed_by
      FROM public.order_item_quantity_changes c
      LEFT JOIN public.order_items oi ON oi.id = c.order_item_id
      WHERE c.store_id = p_store_id
        AND c.new_quantity < c.old_quantity
        AND c.changed_at >= v_from AND c.changed_at < v_to
    ),
    r AS (
      SELECT ev.*, o.session_id, o.order_type
      FROM ev
      JOIN public.orders o ON o.id = ev.order_id
      WHERE o.store_id = p_store_id
        AND o.status <> 'cancelled'
        AND o.rejected_at IS NULL
    )
    SELECT jsonb_build_object(
      'from', p_from, 'to', p_to, 'period_from', v_from, 'period_to', v_to,
      'totals', jsonb_build_object(
        'cancelled_amount', COALESCE(SUM(r.amount) FILTER (WHERE r.type = 'cancelled'), 0),
        'gift_amount',      COALESCE(SUM(r.amount) FILTER (WHERE r.type = 'gift'), 0),
        'reduced_amount',   COALESCE(SUM(r.amount) FILTER (WHERE r.type = 'quantity'), 0),
        'count',            COUNT(*)),
      'rows', COALESCE(jsonb_agg(jsonb_build_object(
        'at', r.at,
        'type', r.type,
        'table_label', public.bills_report_table_label(
          CASE WHEN r.session_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[r.session_id] END, ARRAY[r.order_id], r.order_type),
        'item_name', r.item_name,
        'quantity', r.quantity,
        'amount', r.amount,
        'reason', NULLIF(btrim(r.reason), ''),
        'by_name', (SELECT COALESCE(NULLIF(u.raw_user_meta_data->>'full_name', ''), u.email)
                    FROM auth.users u WHERE u.id = r.by_user)
      ) ORDER BY r.at DESC, r.type, r.item_name), '[]'::jsonb))
    FROM r
  );
END;
$$;

-- ============================================================
-- 4) Quyền. REVOKE FROM PUBLIC một mình không gỡ quyền Supabase cấp thẳng cho anon/authenticated.
-- ============================================================
REVOKE ALL ON FUNCTION public.report_period_bounds(uuid, date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_paid_orders(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_sold_lines(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_item_groups(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_line_unit_price(integer, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_sales_summary(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.report_sales_by_item(uuid, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.report_sales_by_category(uuid, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.report_sales_by_hour(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_sales_by_item(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_sales_by_category(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_sales_by_hour(uuid, date, date) TO authenticated;
REVOKE ALL ON FUNCTION public.report_voids(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_voids(uuid, date, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
