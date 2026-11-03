-- 107_bill_discount.sql — Giảm giá bill (VNĐ hoặc %): lưu "ý định" trên phiên + RPC đặt giảm giá.
-- Spec: docs/superpowers/specs/2026-11-02-chuyen-ban-giam-gia-bill-design.md §4
-- Phép tính khớp từng bước với admin-web/lib/bill-discount.ts (discountAmount / validateDiscount / allocateDiscount).
--
-- Tách riêng một migration: file chỉ chứa cột/bảng/hàm MỚI (không CREATE OR REPLACE đè lên RPC sống nào).
-- Việc CHIA giảm giá vào đơn lúc thu tiền (close_table_session) và trừ trong recompute_order_total
-- vá ở mig 108 bằng pg_get_functiondef + replace — KHÔNG chép thân hàm từ đây.
--
-- GỒM:
--   1) table_sessions.bill_discount_*  — ý định giảm giá của phiên (chưa phải tiền đã trừ)
--   2) orders.bill_discount_amount     — phần giảm giá bill đã chia về từng đơn (ghi ở mig 108 lúc thu tiền)
--   3) table_session_discount_changes  — nhật ký ai đặt/sửa/bỏ giảm giá (chỉ ghi qua RPC)
--   4) bill_discount_amount()          — helper nội bộ: số tiền giảm từ (tiền hàng, loại, giá trị)
--   5) session_unpaid_subtotal()       — helper nội bộ: tiền hàng CHƯA thu của phiên
--   6) pos_set_session_discount()      — RPC đặt/bỏ giảm giá cho MỘT phiên
--   7) pos_set_sessions_discount()     — RPC đặt/bỏ giảm giá cho nhiều phiên (gộp bill)

-- ============================================================
-- 1) Ý định giảm giá trên phiên
--    type và value cùng NULL (không giảm) hoặc cùng có; percent không vượt 100.
-- ============================================================
ALTER TABLE public.table_sessions
  ADD COLUMN IF NOT EXISTS bill_discount_type text
    CHECK (bill_discount_type IN ('amount', 'percent')),
  ADD COLUMN IF NOT EXISTS bill_discount_value integer
    CHECK (bill_discount_value >= 0),
  ADD COLUMN IF NOT EXISTS bill_discount_set_by uuid,
  ADD COLUMN IF NOT EXISTS bill_discount_set_at timestamptz;

ALTER TABLE public.table_sessions
  ADD CONSTRAINT table_sessions_bill_discount_pair
    CHECK ((bill_discount_type IS NULL) = (bill_discount_value IS NULL)),
  ADD CONSTRAINT table_sessions_bill_discount_percent_max
    CHECK (bill_discount_type IS DISTINCT FROM 'percent' OR bill_discount_value <= 100);

COMMENT ON COLUMN public.table_sessions.bill_discount_type IS
  'Ý định giảm giá cả bill: amount (VNĐ) hoặc percent (%); NULL = không giảm. Tiền chỉ thực sự trừ vào đơn lúc close_table_session(paid) (mig 108).';

-- ============================================================
-- 2) orders.bill_discount_amount — phần giảm giá bill chia về đơn này
-- ============================================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS bill_discount_amount integer NOT NULL DEFAULT 0
    CHECK (bill_discount_amount >= 0);

COMMENT ON COLUMN public.orders.bill_discount_amount IS
  'Phần giảm giá cả bill đã chia về đơn này lúc thu tiền; total_amount đã là số SAU giảm (doanh thu tự đúng).';

-- ============================================================
-- 3) Nhật ký giảm giá
-- ============================================================
CREATE TABLE IF NOT EXISTS public.table_session_discount_changes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    uuid NOT NULL REFERENCES public.stores(id),
  session_id  uuid NOT NULL REFERENCES public.table_sessions(id) ON DELETE CASCADE,
  old_type    text,
  old_value   integer,
  new_type    text,
  new_value   integer,
  changed_by  uuid NOT NULL,
  changed_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.table_session_discount_changes IS
  'Nhật ký giảm giá bill: changed_by đổi giảm giá của phiên từ (old_type, old_value) sang (new_type, new_value) lúc changed_at; NULL = không giảm. Chỉ ghi qua pos_set_session_discount / pos_set_sessions_discount.';

CREATE INDEX IF NOT EXISTS table_session_discount_changes_session
  ON public.table_session_discount_changes(session_id, changed_at);

ALTER TABLE public.table_session_discount_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.table_session_discount_changes FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.table_session_discount_changes FROM authenticated;
GRANT SELECT ON public.table_session_discount_changes TO authenticated;
DROP POLICY IF EXISTS "auth_read_table_session_discount_changes" ON public.table_session_discount_changes;
CREATE POLICY "auth_read_table_session_discount_changes" ON public.table_session_discount_changes
  FOR SELECT TO authenticated USING (public.is_store_scoped_operator(store_id));

-- ============================================================
-- 4) bill_discount_amount — cùng phép tính discountAmount (admin-web/lib/bill-discount.ts)
--    amount → đúng value; percent → làm tròn subtotal * value / 100 tới đồng.
--    Tính trên NUMERIC (không dùng double) để không lệch 1 đồng ở các ca .5; round() của numeric
--    làm tròn nửa ra xa 0 = Math.round với số không âm.
--    KHÔNG cắt bớt khi vượt tiền hàng: trường hợp đó do RPC đặt giảm giá chặn trước khi lưu.
--    Loại lạ báo lỗi thay vì lặng lẽ tính 0 (validator phía TS không kiểm loại, server kiểm).
--    Helper nội bộ: chỉ RPC SECURITY DEFINER (và các hàm vá ở mig 108) gọi.
-- ============================================================
CREATE OR REPLACE FUNCTION public.bill_discount_amount(
  p_subtotal bigint,
  p_type text,
  p_value integer
) RETURNS bigint
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN
  IF p_type IS NULL THEN RETURN 0; END IF;
  IF p_type = 'amount' THEN RETURN p_value; END IF;
  IF p_type = 'percent' THEN
    RETURN round(p_subtotal::numeric * p_value::numeric / 100)::bigint;
  END IF;
  RAISE EXCEPTION 'Loại giảm giá không hợp lệ';
END $$;
-- Phải gỡ tường minh anon/authenticated: default privileges của schema public cấp EXECUTE thẳng cho 2 role
-- này, REVOKE FROM PUBLIC không đụng tới (mẫu: mig 104).
REVOKE ALL ON FUNCTION public.bill_discount_amount(bigint, text, integer) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 5) session_unpaid_subtotal — tiền hàng CHƯA thu của phiên
--    Đơn bị huỷ/từ chối đều là status 'cancelled' (mig 088/089); món Bỏ/Tặng đã nằm sẵn trong
--    total_amount (recompute_order_total) nên chỉ cần cộng total_amount. Đơn voucher: total_amount đã là
--    tiền SAU voucher. Đơn đã nhận tiền (payment_received_at) không dính giảm giá.
-- ============================================================
CREATE OR REPLACE FUNCTION public.session_unpaid_subtotal(
  p_session_id uuid
) RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum(o.total_amount), 0)::bigint
    FROM public.orders o
   WHERE o.session_id = p_session_id
     AND o.status <> 'cancelled'
     AND o.payment_received_at IS NULL;
$$;
REVOKE ALL ON FUNCTION public.session_unpaid_subtotal(uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 6) pos_set_session_discount — đặt / sửa / bỏ giảm giá của MỘT phiên đang mở
--    p_type IS NULL hoặc p_value = 0 → bỏ giảm giá. Kiểm giá trị đúng như validateDiscount.
--    Nhật ký chỉ ghi khi giá trị thật sự đổi (bấm Lưu lại y hệt không sinh dòng thừa);
--    changed_at = clock_timestamp() để nhiều lần đổi trong cùng một giao dịch vẫn có thứ tự đúng.
-- ============================================================
CREATE OR REPLACE FUNCTION public.pos_set_session_discount(
  p_session_id uuid,
  p_type text,
  p_value integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_store uuid;
  v_s public.table_sessions%ROWTYPE;
  v_subtotal bigint;
  v_discount bigint := 0;
  v_new_type text;
  v_new_value integer;
BEGIN
  -- Quyền kiểm TRƯỚC khi khoá: người không có quyền không được giữ khoá dòng phiên nào.
  SELECT store_id INTO v_store FROM public.table_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy phiên'; END IF;
  IF NOT public.is_store_pos_operator(v_store) THEN RAISE EXCEPTION 'Không có quyền'; END IF;

  IF p_type IS NOT NULL AND p_type NOT IN ('amount', 'percent') THEN
    RAISE EXCEPTION 'Loại giảm giá không hợp lệ';
  END IF;

  SELECT * INTO v_s FROM public.table_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy phiên'; END IF;
  IF v_s.status <> 'open' THEN RAISE EXCEPTION 'Phiên đã đóng'; END IF;

  v_subtotal := public.session_unpaid_subtotal(p_session_id);

  IF p_type IS NULL OR p_value = 0 THEN
    -- bỏ giảm giá
    v_new_type := NULL;
    v_new_value := NULL;
  ELSE
    IF p_value IS NULL OR p_value < 0 THEN
      RAISE EXCEPTION 'Giảm giá phải là số nguyên không âm';
    END IF;
    IF p_type = 'percent' AND p_value > 100 THEN
      RAISE EXCEPTION 'Phần trăm phải từ 0 đến 100';
    END IF;
    IF p_type = 'amount' AND p_value > v_subtotal THEN
      RAISE EXCEPTION 'Giảm giá lớn hơn tiền hàng — sửa lại giảm giá';
    END IF;
    v_new_type := p_type;
    v_new_value := p_value;
    v_discount := public.bill_discount_amount(v_subtotal, v_new_type, v_new_value);
  END IF;

  IF (v_s.bill_discount_type, v_s.bill_discount_value) IS DISTINCT FROM (v_new_type, v_new_value) THEN
    INSERT INTO public.table_session_discount_changes
      (store_id, session_id, old_type, old_value, new_type, new_value, changed_by, changed_at)
    VALUES
      (v_s.store_id, p_session_id, v_s.bill_discount_type, v_s.bill_discount_value, v_new_type, v_new_value, v_uid,
       clock_timestamp());
  END IF;

  UPDATE public.table_sessions
     SET bill_discount_type   = v_new_type,
         bill_discount_value  = v_new_value,
         bill_discount_set_by = CASE WHEN v_new_type IS NULL THEN NULL ELSE v_uid END,
         bill_discount_set_at = CASE WHEN v_new_type IS NULL THEN NULL ELSE now() END,
         last_activity_at     = now()
   WHERE id = p_session_id;

  RETURN jsonb_build_object('ok', true, 'subtotal', v_subtotal, 'discount', v_discount);
END $$;
REVOKE ALL ON FUNCTION public.pos_set_session_discount(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_set_session_discount(uuid, text, integer) TO authenticated;

-- ============================================================
-- 7) pos_set_sessions_discount — gộp bill: MỘT dòng giảm giá cho N phiên, một giao dịch
--    percent: đặt cùng % cho từng phiên.
--    amount : chia p_value về từng phiên theo tỉ lệ session_unpaid_subtotal đúng thuật toán allocateDiscount:
--      mỗi phiên = floor(p_value * tiền_hàng / tổng tiền_hàng) (div() trên numeric: chia nguyên đúng,
--      không rủi ro làm tròn của phép chia thập phân); phần dư chia lần lượt theo tiền hàng giảm dần,
--      hoà thì id nhỏ nhất theo so sánh CHUỖI (id::text COLLATE "C" = so sánh chuỗi của JS), mỗi phiên
--      nhận thêm min(dư còn lại, tiền hàng − phần đã chia) → không phiên nào được giảm quá tiền hàng của nó
--      (3 mâm × 1.000đ giảm 2.999 → 1.000 / 1.000 / 999; cách cũ 999/999/1.001 làm mâm đó không thu được).
--      Dư còn lại sau khi lấp đầy (chỉ khi p_value > tổng tiền hàng — đã chặn trước) → phiên đứng đầu.
--      Mỗi phiên lưu dạng amount; phần chia = 0 → phiên không giảm.
--    Ghi đè giảm giá riêng từng phiên (nếu có). Khoá phiên theo id tăng dần (cùng quy ước
--    close_table_sessions_bulk / merge_session_into_tray mig 040 → hai máy gộp chéo nhau không deadlock).
-- ============================================================
CREATE OR REPLACE FUNCTION public.pos_set_sessions_discount(
  p_session_ids uuid[],
  p_type text,
  p_value integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ids uuid[];
  v_found int;
  v_stores int;
  v_store uuid;
  -- coalesce: loại có mà giá trị NULL cho ra NULL, phải coi là KHÔNG phải bỏ giảm giá để rơi vào bước kiểm giá trị
  v_clear boolean := coalesce(p_type IS NULL OR p_value = 0, false);
  v_total_sub bigint;
  v_total_disc bigint := 0;
  v_row record;
  v_old public.table_sessions%ROWTYPE;
  v_new_type text;
  v_new_value integer;
  v_disc bigint;
  v_detail jsonb := '[]'::jsonb;
BEGIN
  IF p_type IS NOT NULL AND p_type NOT IN ('amount', 'percent') THEN
    RAISE EXCEPTION 'Loại giảm giá không hợp lệ';
  END IF;
  IF p_session_ids IS NULL OR cardinality(p_session_ids) = 0 THEN
    RAISE EXCEPTION 'Chưa chọn phiên nào';
  END IF;
  SELECT array_agg(DISTINCT x ORDER BY x) INTO v_ids FROM unnest(p_session_ids) AS x;

  -- Quyền kiểm TRƯỚC khi khoá. Phiên không tồn tại hoặc khác quán đều bị từ chối trước.
  SELECT count(*), count(DISTINCT store_id), min(store_id::text)::uuid
    INTO v_found, v_stores, v_store
    FROM public.table_sessions WHERE id = ANY(v_ids);
  IF v_found <> cardinality(v_ids) THEN RAISE EXCEPTION 'Không tìm thấy phiên'; END IF;
  IF v_stores <> 1 THEN RAISE EXCEPTION 'Các phiên không cùng một quán'; END IF;
  IF NOT public.is_store_pos_operator(v_store) THEN RAISE EXCEPTION 'Không có quyền'; END IF;

  -- Khoá toàn bộ dòng phiên theo id tăng dần
  PERFORM 1 FROM public.table_sessions
    WHERE id = ANY(v_ids)
    ORDER BY id
    FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.table_sessions WHERE id = ANY(v_ids) AND status <> 'open') THEN
    RAISE EXCEPTION 'Phiên đã đóng';
  END IF;

  SELECT coalesce(sum(public.session_unpaid_subtotal(x)), 0)::bigint
    INTO v_total_sub FROM unnest(v_ids) AS x;

  IF NOT v_clear THEN
    IF p_value IS NULL OR p_value < 0 THEN
      RAISE EXCEPTION 'Giảm giá phải là số nguyên không âm';
    END IF;
    IF p_type = 'percent' AND p_value > 100 THEN
      RAISE EXCEPTION 'Phần trăm phải từ 0 đến 100';
    END IF;
    IF p_type = 'amount' AND p_value > v_total_sub THEN
      RAISE EXCEPTION 'Giảm giá lớn hơn tiền hàng — sửa lại giảm giá';
    END IF;
  END IF;

  FOR v_row IN
    WITH parts AS (
      SELECT s.id, public.session_unpaid_subtotal(s.id) AS amt
        FROM unnest(v_ids) AS s(id)
    ),
    tot AS (SELECT coalesce(sum(amt), 0) AS total FROM parts),
    shares AS (
      SELECT p.id, p.amt,
             CASE WHEN t.total = 0 THEN 0::numeric
                  ELSE div(p_value::numeric * p.amt, t.total) END AS share
        FROM parts p CROSS JOIN tot t
    ),
    -- Thứ tự nhận dư: tiền hàng giảm dần, hoà → id nhỏ nhất (so chuỗi). room = chỗ còn trống của phiên.
    ranked AS (
      SELECT sh.id, sh.amt, sh.share,
             p_value - sum(sh.share) OVER () AS rem,
             coalesce(sum(GREATEST(sh.amt - sh.share, 0)) OVER (
               ORDER BY sh.amt DESC, sh.id::text COLLATE "C"
               ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS room_before,
             sum(GREATEST(sh.amt - sh.share, 0)) OVER () AS room_total,
             row_number() OVER (ORDER BY sh.amt DESC, sh.id::text COLLATE "C") AS rn
        FROM shares sh
    )
    SELECT rk.id, rk.amt,
           (rk.share
            + GREATEST(0, LEAST(GREATEST(rk.amt - rk.share, 0), rk.rem - rk.room_before))
            -- chỉ còn dư khi p_value > tổng tiền hàng (không xảy ra: đã chặn ở trên) → phiên đứng đầu
            + CASE WHEN rk.rn = 1 THEN GREATEST(rk.rem - rk.room_total, 0) ELSE 0 END)::bigint AS alloc
      FROM ranked rk
     ORDER BY rk.id
  LOOP
    IF v_clear THEN
      v_new_type := NULL;
      v_new_value := NULL;
      v_disc := 0;
    ELSIF p_type = 'percent' THEN
      v_new_type := 'percent';
      v_new_value := p_value;
      v_disc := public.bill_discount_amount(v_row.amt, 'percent', p_value);
    ELSE
      v_disc := v_row.alloc;
      IF v_disc = 0 THEN
        v_new_type := NULL;
        v_new_value := NULL;
      ELSE
        v_new_type := 'amount';
        v_new_value := v_disc::integer;
      END IF;
    END IF;

    SELECT * INTO v_old FROM public.table_sessions WHERE id = v_row.id;
    IF (v_old.bill_discount_type, v_old.bill_discount_value) IS DISTINCT FROM (v_new_type, v_new_value) THEN
      INSERT INTO public.table_session_discount_changes
        (store_id, session_id, old_type, old_value, new_type, new_value, changed_by, changed_at)
      VALUES
        (v_old.store_id, v_row.id, v_old.bill_discount_type, v_old.bill_discount_value, v_new_type, v_new_value, v_uid,
         clock_timestamp());
    END IF;

    UPDATE public.table_sessions
       SET bill_discount_type   = v_new_type,
           bill_discount_value  = v_new_value,
           bill_discount_set_by = CASE WHEN v_new_type IS NULL THEN NULL ELSE v_uid END,
           bill_discount_set_at = CASE WHEN v_new_type IS NULL THEN NULL ELSE now() END,
           last_activity_at     = now()
     WHERE id = v_row.id;

    v_total_disc := v_total_disc + v_disc;
    v_detail := v_detail || jsonb_build_object('session_id', v_row.id, 'subtotal', v_row.amt, 'discount', v_disc);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'subtotal', v_total_sub, 'discount', v_total_disc, 'sessions', v_detail);
END $$;
REVOKE ALL ON FUNCTION public.pos_set_sessions_discount(uuid[], text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_set_sessions_discount(uuid[], text, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
