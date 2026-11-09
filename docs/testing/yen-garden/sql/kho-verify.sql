-- kho-verify.sql — kiểm tra số liệu kho (mig 118) của MỘT quán trên DB thật, trong MỘT giao dịch rồi ROLLBACK.
--
-- CÁCH CHẠY: SAU KHI mig 118 đã áp. Sửa store_id ở dòng `INSERT INTO kho_params` ngay dưới BEGIN (mặc định tìm theo
-- tên quán "Yên Garden"), dán nguyên file vào SQL editor. Mỗi ca in `NOTICE: PASS <tên ca>`; ca sai → RAISE
-- EXCEPTION 'FAIL …' và cả giao dịch dừng. Không ghi gì: chỉ đọc, kết thúc bằng ROLLBACK.
--
-- Các ca TỰ TÍNH LẠI bằng truy vấn độc lập (không gọi inventory_sales_lines / inventory_stock_at để so với chính nó):
--   a) stock_matches      — inventory_stock_at(now()) mỗi hàng = SL đếm của lần kiểm posted cuối (không có thì 0)
--                            + nhập − huỷ − bán từ mốc kiểm đó (bán đếm lại từ orders / order_items / menu_stock_links).
--   b) sales_today        — inventory_sales_qty trong ngày kinh doanh hôm nay = đếm tay order_items của món đã gắn.
--   c) links_valid        — không có liên kết món đang hiệu lực trỏ hàng `ingredient` hoặc hàng đã ngừng dùng,
--                            không có (món, biến thể) nào có hai liên kết hiệu lực chồng nhau.
--   d) receipt_totals     — mỗi phiếu nhập: total_amount = Σ line_amount, line_amount = round(qty × unit_cost).
--   e) count_lines        — dòng phiếu kiểm có counted_qty, không có qty; dòng nhập/huỷ có qty > 0.
--   f) anchors_122b       — hai dòng neo cho sổ thu chi có đúng 1 lần, hai hàm không có khối EXCEPTION.
--   g) privileges         — client (anon, authenticated) không đọc thẳng được 5 bảng kho, không gọi được hàm nội bộ.

BEGIN;

CREATE TEMP TABLE kho_params ON COMMIT DROP AS
SELECT id AS store_id FROM public.stores WHERE name ILIKE '%Yên Garden%' ORDER BY created_at LIMIT 1;
-- Quán khác: thay câu trên bằng
--   INSERT INTO kho_params VALUES ('<store uuid>');  (sau khi TRUNCATE kho_params)

CREATE FUNCTION pg_temp.must(p_label text, p_ok boolean, p_detail text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  IF coalesce(p_ok, false) THEN
    RAISE NOTICE 'PASS %', p_label;
  ELSE
    RAISE EXCEPTION 'FAIL % %', p_label, coalesce('— ' || p_detail, '');
  END IF;
END $f$;

-- "Bán" đếm lại ĐỘC LẬP (viết lại từ Global Constraints của plan, không gọi hàm của mig 118):
-- đơn không huỷ / không bị từ chối, dòng không bị bỏ (tặng vẫn trừ), đơn đã vào bếp hoặc có tiền hoặc món ghi tay,
-- liên kết (món, biến thể) trước rồi (món, null), hiệu lực nửa mở tại giờ tạo đơn, chỉ hàng goods.
CREATE FUNCTION pg_temp.kho_sales(p_store uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE(item_id uuid, sold_at timestamptz, qty numeric) LANGUAGE sql STABLE AS $f$
  WITH sold AS (
    SELECT o.id, o.created_at
      FROM public.orders o
      JOIN public.stores s ON s.id = o.store_id
      LEFT JOIN public.store_workflow_settings w ON w.store_id = o.store_id
     WHERE o.store_id = p_store AND o.created_at >= p_from AND o.created_at < p_to
       AND o.status <> 'cancelled' AND o.rejected_at IS NULL
       AND (o.status IN ('confirmed', 'cooking', 'ready', 'paid')
            OR o.confirmed_at IS NOT NULL OR o.payment_received_at IS NOT NULL OR o.order_source = 'pos'
            OR (o.status = 'pending' AND o.order_source <> 'reservation_preorder'
                AND (CASE WHEN o.order_source = 'staff' THEN coalesce(w.staff_order_release_policy, 'automatic')
                          ELSE coalesce(w.kitchen_release_policy, 'automatic') END) = 'automatic'
                AND (o.order_source = 'staff' OR (s.payment_timing = 'postpay' AND o.payment_method = 'cash'))))
  ),
  lines AS (
    SELECT oi.id, oi.menu_item_id, oi.variant_id, oi.quantity, so.created_at
      FROM sold so JOIN public.order_items oi ON oi.order_id = so.id
     WHERE oi.void_type IS DISTINCT FROM 'cancelled' AND oi.menu_item_id IS NOT NULL
  ),
  matched AS (
    SELECT l.id AS line_id, l.created_at, l.quantity, ms.inventory_item_id, ms.qty_per_sale,
           row_number() OVER (PARTITION BY l.id ORDER BY (ms.variant_id IS NULL)) AS rn
      FROM lines l
      JOIN public.menu_stock_links ms ON ms.menu_item_id = l.menu_item_id AND ms.store_id = p_store
       AND (ms.variant_id = l.variant_id OR ms.variant_id IS NULL)
       AND ms.valid_from <= l.created_at AND (ms.valid_to IS NULL OR l.created_at < ms.valid_to)
  )
  SELECT m.inventory_item_id, m.created_at, m.quantity * m.qty_per_sale
    FROM matched m JOIN public.inventory_items ii ON ii.id = m.inventory_item_id AND ii.kind = 'goods'
   WHERE m.rn = 1;
$f$;

DO $$
DECLARE
  v_store uuid := (SELECT store_id FROM kho_params);
  v_bad text;
  v_n int;
  v_from timestamptz;
  v_to timestamptz;
BEGIN
  PERFORM pg_temp.must('store_found', v_store IS NOT NULL, 'không tìm thấy quán — sửa kho_params');
  RAISE NOTICE 'Quán: % (%), % hàng hoá, % phiếu', (SELECT name FROM public.stores WHERE id = v_store), v_store,
    (SELECT count(*) FROM public.inventory_items WHERE store_id = v_store),
    (SELECT count(*) FROM public.inventory_documents WHERE store_id = v_store);

  -- a) Tồn hiện tại = công thức neo tính lại độc lập.
  WITH anchor AS (
    SELECT DISTINCT ON (dl.inventory_item_id) dl.inventory_item_id, dl.counted_qty, d.effective_at
      FROM public.inventory_document_lines dl JOIN public.inventory_documents d ON d.id = dl.document_id
     WHERE d.store_id = v_store AND d.kind = 'count' AND d.status = 'posted' AND d.effective_at < now()
     ORDER BY dl.inventory_item_id, d.effective_at DESC, d.created_at DESC, d.doc_no DESC
  ),
  moves AS (
    SELECT dl.inventory_item_id, d.effective_at AS at, CASE d.kind WHEN 'receipt' THEN dl.qty ELSE -dl.qty END AS q
      FROM public.inventory_document_lines dl JOIN public.inventory_documents d ON d.id = dl.document_id
     WHERE d.store_id = v_store AND d.status = 'posted' AND d.kind IN ('receipt', 'writeoff') AND d.effective_at < now()
    UNION ALL
    SELECT s.item_id, s.sold_at, -s.qty FROM pg_temp.kho_sales(v_store, '-infinity', now()) s
  ),
  expected AS (
    SELECT i.id, i.name, coalesce(a.counted_qty, 0)
             + coalesce((SELECT sum(m.q) FROM moves m WHERE m.inventory_item_id = i.id
                          AND (a.effective_at IS NULL OR m.at >= a.effective_at)), 0) AS qty
      FROM public.inventory_items i LEFT JOIN anchor a ON a.inventory_item_id = i.id
     WHERE i.store_id = v_store
  )
  SELECT string_agg(format('%s: máy %s, tính lại %s', e.name, st.qty, e.qty), '; ')
    INTO v_bad
    FROM expected e JOIN public.inventory_stock_at(v_store, now()) st ON st.inventory_item_id = e.id
   WHERE abs(st.qty - e.qty) >= 0.0005;
  PERFORM pg_temp.must('stock_matches', v_bad IS NULL, v_bad);

  -- b) Bán trong ngày kinh doanh hôm nay.
  SELECT b.day_from, b.day_to INTO v_from, v_to
    FROM public.business_day_bounds(v_store, public.current_business_date(v_store)) b;
  WITH fn AS (SELECT inventory_item_id AS item_id, qty FROM public.inventory_sales_qty(v_store, v_from, v_to)),
  hand AS (SELECT item_id, sum(qty) AS qty FROM pg_temp.kho_sales(v_store, v_from, v_to) GROUP BY item_id)
  SELECT string_agg(format('%s: hàm %s, đếm tay %s', coalesce(i.name, coalesce(fn.item_id, hand.item_id)::text),
                           coalesce(fn.qty, 0), coalesce(hand.qty, 0)), '; ')
    INTO v_bad
    FROM fn FULL JOIN hand ON hand.item_id = fn.item_id
    LEFT JOIN public.inventory_items i ON i.id = coalesce(fn.item_id, hand.item_id)
   WHERE abs(coalesce(fn.qty, 0) - coalesce(hand.qty, 0)) >= 0.0005;
  PERFORM pg_temp.must('sales_today', v_bad IS NULL, v_bad);
  RAISE NOTICE 'Bán hôm nay: % dòng hàng có bán', (SELECT count(*) FROM public.inventory_sales_qty(v_store, v_from, v_to));

  -- c) Liên kết hiệu lực hợp lệ.
  SELECT string_agg(format('%s → %s (%s%s)', m.name, i.name, i.kind, CASE WHEN i.is_active THEN '' ELSE ', ngừng dùng' END), '; ')
    INTO v_bad
    FROM public.menu_stock_links l
    JOIN public.inventory_items i ON i.id = l.inventory_item_id
    JOIN public.menu_items m ON m.id = l.menu_item_id
   WHERE l.store_id = v_store AND l.valid_to IS NULL AND (i.kind <> 'goods' OR NOT i.is_active OR i.store_id <> l.store_id);
  PERFORM pg_temp.must('links_valid', v_bad IS NULL, v_bad);
  SELECT count(*) INTO v_n FROM (
    SELECT menu_item_id, variant_id FROM public.menu_stock_links
     WHERE store_id = v_store AND valid_to IS NULL GROUP BY menu_item_id, variant_id HAVING count(*) > 1) x;
  PERFORM pg_temp.must('links_one_open_per_pair', v_n = 0, v_n || ' cặp món/biến thể có 2 liên kết mở');
  SELECT count(*) INTO v_n FROM public.menu_stock_links l1 JOIN public.menu_stock_links l2
      ON l1.menu_item_id = l2.menu_item_id AND l1.variant_id IS NOT DISTINCT FROM l2.variant_id AND l1.id < l2.id
   WHERE l1.store_id = v_store
     AND l1.valid_from < coalesce(l2.valid_to, 'infinity') AND l2.valid_from < coalesce(l1.valid_to, 'infinity');
  PERFORM pg_temp.must('links_no_overlap', v_n = 0, v_n || ' cặp liên kết chồng thời gian');

  -- d) Tiền phiếu nhập.
  SELECT string_agg(format('%s: total %s, Σ dòng %s', d.doc_no, d.total_amount, x.s), '; ')
    INTO v_bad
    FROM public.inventory_documents d
    JOIN (SELECT document_id, sum(line_amount) AS s FROM public.inventory_document_lines GROUP BY document_id) x
      ON x.document_id = d.id
   WHERE d.store_id = v_store AND d.kind = 'receipt' AND d.total_amount <> x.s;
  PERFORM pg_temp.must('receipt_totals', v_bad IS NULL, v_bad);
  SELECT string_agg(format('%s: %s × %s = %s', d.doc_no, l.qty, l.unit_cost, l.line_amount), '; ')
    INTO v_bad
    FROM public.inventory_document_lines l JOIN public.inventory_documents d ON d.id = l.document_id
   WHERE d.store_id = v_store AND d.kind = 'receipt' AND l.line_amount <> round(l.qty * l.unit_cost);
  PERFORM pg_temp.must('receipt_line_amounts', v_bad IS NULL, v_bad);

  -- e) Hình dạng dòng phiếu.
  SELECT count(*) INTO v_n
    FROM public.inventory_document_lines l JOIN public.inventory_documents d ON d.id = l.document_id
   WHERE d.store_id = v_store AND (
         (d.kind = 'count' AND (l.counted_qty IS NULL OR l.qty IS NOT NULL))
      OR (d.kind IN ('receipt', 'writeoff') AND (l.qty IS NULL OR l.qty <= 0 OR l.counted_qty IS NOT NULL))
      OR (d.kind = 'receipt' AND l.unit_cost IS NULL));
  PERFORM pg_temp.must('count_lines', v_n = 0, v_n || ' dòng phiếu sai hình dạng');
  SELECT count(*) INTO v_n FROM public.inventory_documents
   WHERE store_id = v_store AND status = 'voided' AND (voided_at IS NULL OR voided_by IS NULL OR coalesce(void_reason, '') = '');
  PERFORM pg_temp.must('voided_have_reason', v_n = 0, v_n || ' phiếu huỷ thiếu người/giờ/lý do');
END $$;

-- f) Neo 122b + không có khối EXCEPTION (chung cho cả DB, không theo quán).
DO $$
DECLARE
  v_post text := pg_get_functiondef('public.inventory_post_document(text,jsonb,jsonb,uuid)'::regprocedure);
  v_void text := pg_get_functiondef('public.inventory_void_document(uuid,text)'::regprocedure);
  v_post_anchor text := '  -- mevo-anchor:122b inventory_post_document.cash_book(v_doc_id)';
  v_void_anchor text := '  -- mevo-anchor:122b inventory_void_document.cash_book(v_doc_id)';
BEGIN
  -- Bỏ \r phòng hàm được áp từ file CRLF.
  v_post := replace(v_post, E'\r', '');
  v_void := replace(v_void, E'\r', '');
  PERFORM pg_temp.must('anchor_post_once',
    (length(v_post) - length(replace(v_post, v_post_anchor || E'\n', ''))) / length(v_post_anchor || E'\n') = 1);
  PERFORM pg_temp.must('anchor_void_once',
    (length(v_void) - length(replace(v_void, v_void_anchor || E'\n', ''))) / length(v_void_anchor || E'\n') = 1);
  PERFORM pg_temp.must('no_exception_block',
    v_post !~* '\mEXCEPTION\s+WHEN\M' AND v_void !~* '\mEXCEPTION\s+WHEN\M'
    AND v_post !~ '(^|\n)\s*EXCEPTION\s*(\n|$)' AND v_void !~ '(^|\n)\s*EXCEPTION\s*(\n|$)');
END $$;

-- g) Quyền.
DO $$
DECLARE
  t text;
  f text;
BEGIN
  FOREACH t IN ARRAY ARRAY['inventory_items', 'menu_stock_links', 'inventory_documents', 'inventory_document_lines',
                           'inventory_doc_counters'] LOOP
    PERFORM pg_temp.must('no_table_select_' || t,
      NOT has_table_privilege('anon', 'public.' || t, 'SELECT') AND NOT has_table_privilege('authenticated', 'public.' || t, 'SELECT'));
  END LOOP;
  FOREACH f IN ARRAY ARRAY['inventory_sales_lines(uuid,timestamptz,timestamptz)', 'inventory_sales_qty(uuid,timestamptz,timestamptz)',
                           'inventory_stock_at(uuid,timestamptz)', 'inventory_next_doc_no(uuid,text)',
                           'inventory_json_numeric(jsonb)', 'inventory_document_json(uuid)', 'inventory_link_guard()'] LOOP
    PERFORM pg_temp.must('internal_fn_' || split_part(f, '(', 1),
      NOT has_function_privilege('anon', 'public.' || f, 'EXECUTE') AND NOT has_function_privilege('authenticated', 'public.' || f, 'EXECUTE'));
  END LOOP;
  FOREACH f IN ARRAY ARRAY['inventory_upsert_item(uuid,uuid,text,text,text,text,numeric)', 'inventory_set_item_active(uuid,boolean)',
                           'inventory_set_menu_link(uuid,uuid,uuid,numeric)', 'inventory_menu_links(uuid)',
                           'inventory_post_document(text,jsonb,jsonb,uuid)', 'inventory_void_document(uuid,text)',
                           'inventory_stock_levels(uuid,timestamptz)', 'inventory_list_documents(uuid,text,date,date)',
                           'inventory_get_document(uuid)', 'inventory_item_ledger(uuid,date,date)', 'inventory_cogs(uuid,date,date)'] LOOP
    PERFORM pg_temp.must('rpc_' || split_part(f, '(', 1),
      NOT has_function_privilege('anon', 'public.' || f, 'EXECUTE') AND has_function_privilege('authenticated', 'public.' || f, 'EXECUTE'));
  END LOOP;
END $$;

ROLLBACK;
