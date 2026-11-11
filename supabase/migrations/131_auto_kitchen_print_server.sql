-- Mig 131: phiếu bếp của đơn "tự vào bếp" do SERVER tự xếp hàng (không còn nhờ tab POS).
--
-- Vì sao: quán in qua phần mềm in (store_workflow_settings.print_mode = 'agent') mà kênh đơn có chính sách xuống bếp
-- 'automatic' thì không ai bấm "Duyệt & in bếp". Từ mig 121 việc xếp phiếu do TAB POS làm (hook useAutoKitchenPrint →
-- server action enqueueAutoKitchenPrints). Đóng tab POS, hoặc thu ngân tải cứng một trang cấu hình, là bếp không có
-- phiếu và không ai được báo. Từ mig này phần mềm in mỗi lần hỏi việc (print_agent_poll, ~2 giây/lần) sẽ tự xếp phiếu
-- cho các đơn đó; trình duyệt không còn dính vào.
--
-- Nội dung:
--   1) Index print_jobs (store_id, left(dedupe_key, 43)): tra "đơn này đã có phiếu chưa" bằng so khớp BẰNG, vì hàm chạy
--      2 giây/lần ('order:' + uuid + ':' dài đúng 43 ký tự).
--   2) Hàm nội bộ MỚI auto_kitchen_print_enqueue(p_store_id) — không GRANT cho ai.
--   3) Vá TẠI CHỖ print_agent_poll (pg_get_functiondef + replace + EXECUTE): thêm đúng một dòng PERFORM ngay sau dòng
--      PERFORM expire_print_jobs(a.store_id). Neo một dòng, phải khớp đúng một lần; không khớp hoặc đã vá thì RAISE.
--
-- ⛔ KHÔNG chạy lại được (CREATE FUNCTION / CREATE INDEX không IF NOT EXISTS, bước vá RAISE khi đã vá). Áp NGUYÊN VĂN.
--
-- Thứ tự áp: TRƯỚC hay SAU khi admin-web mới lên Vercel đều được. Trình duyệt cũ (còn hook tự in) và server dùng
-- CÙNG khoá chống trùng ('order:<id>:kitchen:<trạm>' / 'order:<id>:table') nên không bao giờ ra hai phiếu; cả hai
-- cùng bỏ qua đơn đã có bất kỳ phiếu nào mang tiền tố 'order:<id>:'.
--
-- ⚠️ Hàm này dựng ĐÚNG các job mà planOrderJobs (admin-web/lib/print/print-plan.ts) + enqueuePrint
--    (admin-web/lib/actions/print-jobs.ts) dựng cho { kind: 'order', orderId } không in lại: cùng kind, station_id,
--    dedupe_key, hình dạng ref. Đổi một bên phải đổi cả hai. Luật "đơn nào tự vào bếp" khớp orderInKitchen
--    (admin-web/lib/kitchen-announce.ts) với status coi như 'confirmed'.

-- ============================================================
-- 1) Index tra phiếu theo đơn
-- ============================================================
CREATE INDEX print_jobs_store_order_prefix ON public.print_jobs (store_id, left(dedupe_key, 43));

-- ============================================================
-- 2) Hàm nội bộ: xếp phiếu bếp + phiếu bàn cho đơn tự vào bếp của một quán. Trả số dòng print_jobs đã thêm.
-- ============================================================
CREATE FUNCTION public.auto_kitchen_print_enqueue(p_store_id uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_mode           text;
  v_kitchen_policy text;
  v_staff_policy   text;
  v_timing         text;
  -- Chỉ đơn vào bếp trong 30 phút gần nhất theo giờ server (phần mềm in bật lại sau giờ nghỉ không xả phiếu cũ).
  v_cutoff         timestamptz := now() - interval '30 minutes';
  v_ready          boolean := false;
  v_pos            uuid;
  v_kitchen        uuid;
  v_kitchen_name   text;
  v_actor          uuid;
  v_label          text;
  v_source         text;
  v_request        jsonb;
  v_rows           integer;
  v_total          integer := 0;
  r                record;
BEGIN
  -- Khối bọc: lỗi gì trong này cũng KHÔNG được làm hỏng print_agent_poll (phần mềm in sẽ ngừng in mọi thứ).
  BEGIN
    SELECT print_mode, kitchen_release_policy, staff_order_release_policy
      INTO v_mode, v_kitchen_policy, v_staff_policy
      FROM store_workflow_settings WHERE store_id = p_store_id;
    IF v_mode IS DISTINCT FROM 'agent' THEN
      RETURN 0;
    END IF;
    -- Không kênh nào tự vào bếp: mọi đơn đi qua nút "Duyệt & in bếp".
    IF v_kitchen_policy IS DISTINCT FROM 'automatic' AND v_staff_policy IS DISTINCT FROM 'automatic' THEN
      RETURN 0;
    END IF;
    SELECT payment_timing INTO v_timing FROM stores WHERE id = p_store_id;

    FOR r IN
      SELECT o.id, o.session_id, o.table_id
        FROM orders o
       WHERE o.store_id = p_store_id
         -- Lọc thô cho index (idx_orders_store_created / orders_store_report_received_idx); luật chính xác ở dưới.
         AND (o.created_at >= v_cutoff
              OR (o.payment_received_at >= v_cutoff
                  AND COALESCE(o.payment_received_at, o.completed_at, o.updated_at) >= v_cutoff))
         -- Món thu ngân ghi tay / món đặt trước không bao giờ tự in
         AND o.order_source NOT IN ('pos', 'reservation_preorder')
         -- Chính sách của KÊNH đơn phải là tự vào bếp
         AND CASE WHEN o.order_source = 'staff' THEN v_staff_policy ELSE v_kitchen_policy END = 'automatic'
         -- Đơn đã qua nút "Duyệt & in bếp" có đường in riêng
         AND o.confirmed_at IS NULL
         AND o.status IN ('pending', 'confirmed', 'cooking', 'ready')
         -- Đã vào bếp (orderInKitchen): đơn nhân viên vào ngay; đơn khách khi có tiền thật, hoặc quán trả sau
         AND (o.order_source = 'staff'
              OR o.payment_received_at IS NOT NULL
              OR (v_timing = 'postpay' AND o.payment_method = 'cash'))
         -- Giờ vào bếp: lúc tạo đơn; riêng đơn khách đã có tiền là lúc nhận tiền (nếu muộn hơn)
         AND CASE WHEN o.order_source <> 'staff' AND o.payment_received_at IS NOT NULL
                  THEN GREATEST(o.created_at, o.payment_received_at)
                  ELSE o.created_at END >= v_cutoff
         -- Đơn đã có BẤT KỲ phiếu nào (mọi trạng thái, kể cả đã bỏ qua / lỗi / in lại) thì không tạo lại
         AND NOT EXISTS (
               SELECT 1 FROM print_jobs pj
                WHERE pj.store_id = p_store_id
                  AND left(pj.dedupe_key, 43) = 'order:' || o.id::text || ':')
         -- Đơn không còn món (món "Khách bỏ" không in; món tặng vẫn in) thì bỏ qua
         AND EXISTS (
               SELECT 1 FROM order_items oi
                WHERE oi.order_id = o.id AND oi.void_type IS DISTINCT FROM 'cancelled')
       ORDER BY o.created_at, o.id
    LOOP
      -- Trạm + người đứng tên phiếu: chỉ đọc khi thật sự có đơn cần in (đường "không có việc" phải rẻ).
      IF NOT v_ready THEN
        SELECT id INTO v_pos FROM print_stations WHERE store_id = p_store_id AND is_pos;
        SELECT id, name INTO v_kitchen, v_kitchen_name
          FROM print_stations WHERE store_id = p_store_id AND is_default_kitchen;
        IF v_pos IS NULL OR v_kitchen IS NULL THEN
          RETURN 0;
        END IF;
        -- Trang in vẽ phiếu bằng JWT ngắn hạn mang sub = print_jobs.created_by, nên phải là người vận hành THẬT của
        -- quán, đọc được đơn: chủ quán đang bật (cũ nhất trước), không có thì quản lý, rồi thu ngân.
        SELECT user_id INTO v_actor
          FROM mevo_operators
         WHERE store_id = p_store_id AND is_active
           AND role IN ('store_owner', 'store_manager', 'store_cashier')
         ORDER BY CASE role WHEN 'store_owner' THEN 0 WHEN 'store_manager' THEN 1 ELSE 2 END,
                  created_at, user_id
         LIMIT 1;
        IF v_actor IS NULL THEN
          RETURN 0;
        END IF;
        v_ready := true;
      END IF;

      -- Mỗi đơn một khối riêng: một đơn lỗi không chặn phiếu của các đơn khác.
      BEGIN
        -- Tên bàn như loadOrderSlip (admin-web/lib/print/load-order-slip.ts): mâm → các bàn đang mở của phiên;
        -- không có thì bàn của đơn; không có nữa thì '—'. Thứ tự: số đứng đầu, rồi phần chữ, rồi số đầu tiên trong
        -- tên ("Bàn 2" trước "Bàn 10"). KHÔNG khớp localeCompare('vi', numeric) của JS trong mọi trường hợp —
        -- nhãn chỉ để hiển thị, không nằm trong khoá chống trùng.
        v_label := NULL;
        IF r.session_id IS NOT NULL THEN
          SELECT string_agg(t.table_number, ', ' ORDER BY
                   (substring(t.table_number from '^[0-9]+'))::numeric NULLS LAST,
                   regexp_replace(t.table_number, '[0-9]+', '', 'g'),
                   (substring(t.table_number from '[0-9]+'))::numeric NULLS FIRST,
                   t.table_number)
            INTO v_label
            FROM session_tables st
            JOIN tables t ON t.id = st.table_id
           WHERE st.session_id = r.session_id AND st.is_open AND t.table_number <> '';
        END IF;
        IF COALESCE(v_label, '') = '' AND r.table_id IS NOT NULL THEN
          SELECT table_number INTO v_label FROM tables WHERE id = r.table_id;
        END IF;
        v_label := COALESCE(NULLIF(v_label, ''), '—');

        v_source  := 'order:' || r.id::text;
        v_request := jsonb_build_object('kind', 'order', 'orderId', r.id::text);

        -- MỘT lệnh cho cả đơn (nguyên tử): mỗi trạm có món một phiếu bếp + một phiếu bàn ở trạm Quầy.
        -- Trạm của món: menu_items → menu_categories.print_station_id khi trạm đó còn trong quán; còn lại
        -- (chưa gán trạm, trạm đã xoá, món đã xoá khỏi menu, menu_item_id NULL) ra trạm bếp mặc định.
        INSERT INTO print_jobs (store_id, station_id, kind, ref, dedupe_key, created_by)
        WITH items AS (
          SELECT oi.id,
                 COALESCE(ps.id, v_kitchen) AS station_id,
                 COALESCE(ps.name, v_kitchen_name, 'Bếp') AS station_name
            FROM order_items oi
            LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id AND mi.store_id = p_store_id
            LEFT JOIN menu_categories mc ON mc.id = mi.category_id AND mc.store_id = p_store_id
            LEFT JOIN print_stations ps ON ps.id = mc.print_station_id AND ps.store_id = p_store_id
           WHERE oi.order_id = r.id AND oi.void_type IS DISTINCT FROM 'cancelled'
        )
        SELECT p_store_id, i.station_id, 'kitchen_ticket',
               jsonb_build_object(
                 'label', 'Phiếu bếp · ' || i.station_name || ' · ' || v_label,
                 'request', v_request,
                 'source', v_source,
                 'itemKeys', jsonb_agg(i.id::text ORDER BY i.id)),
               v_source || ':kitchen:' || i.station_id::text,
               v_actor
          FROM items i
         GROUP BY i.station_id, i.station_name
        UNION ALL
        SELECT p_store_id, v_pos, 'table_slip',
               jsonb_build_object(
                 'label', 'Phiếu bàn · ' || v_label,
                 'request', v_request,
                 'source', v_source),
               v_source || ':table',
               v_actor
         WHERE EXISTS (SELECT 1 FROM items)
        ON CONFLICT (store_id, dedupe_key) DO NOTHING;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        v_total := v_total + v_rows;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'auto_kitchen_print_enqueue: quán % đơn %: %', p_store_id, r.id, SQLERRM;
      END;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'auto_kitchen_print_enqueue: quán %: %', p_store_id, SQLERRM;
    RETURN 0;
  END;
  RETURN v_total;
END
$fn$;
REVOKE ALL ON FUNCTION public.auto_kitchen_print_enqueue(uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 3) print_agent_poll gọi hàm trên mỗi lần phần mềm in hỏi việc.
--    Vá tại chỗ: neo MỘT dòng (thân hàm trên prod có thể lẫn CRLF), dòng thêm vào ghép bằng chr(10) nên không phụ
--    thuộc kiểu xuống dòng của file này. Đã vá rồi cũng RAISE — không chạy lại lần hai.
-- ============================================================
DO $mig$
DECLARE
  v_sig    regprocedure := 'public.print_agent_poll(text,text,jsonb)'::regprocedure;
  v_def    text := pg_get_functiondef(v_sig);
  v_anchor text := $a$  PERFORM expire_print_jobs(a.store_id);$a$;
  v_add    text := $n$  PERFORM auto_kitchen_print_enqueue(a.store_id);$n$;
  v_count  integer;
BEGIN
  IF position('auto_kitchen_print_enqueue' in v_def) > 0 THEN
    RAISE EXCEPTION 'mig 131: print_agent_poll đã được vá rồi';
  END IF;
  v_count := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'mig 131: neo khớp % lần (cần đúng 1) — thân hàm prod đã khác, không vá', v_count;
  END IF;
  EXECUTE replace(v_def, v_anchor, v_anchor || chr(10) || v_add);
END
$mig$;

NOTIFY pgrst, 'reload schema';
