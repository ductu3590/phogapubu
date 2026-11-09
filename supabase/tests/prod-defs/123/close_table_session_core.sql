-- Chụp từ nhánh tích hợp sau mig 122 (PGlite: 112a + 112b + 122 trên bản chụp prod-defs/112). Controller PHẢI đối chiếu pg_get_functiondef trên prod trước khi áp mig 123.
CREATE OR REPLACE FUNCTION public.close_table_session_core(p_session_id uuid, p_reason text, p_instrument text, p_payment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_session public.table_sessions%ROWTYPE;
  v_reservation public.reservations%ROWTYPE;
  v_uid uuid := auth.uid();
  v_settled integer := 0;
  v_cancelled integer := 0;
  v_left integer := 0;
  v_pending integer := 0;
  v_total bigint := 0;
  v_before jsonb;
  v_sub bigint := 0;
  v_disc bigint := 0;
BEGIN
  IF p_reason NOT IN ('paid', 'staff_reset') THEN
    RAISE EXCEPTION 'Lý do đóng bàn không hợp lệ: %', p_reason;
  END IF;

  -- Giữ thứ tự khoá của migration 039 để không chen đơn mới trong lúc chốt bill.
  SELECT * INTO v_session
  FROM public.table_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy phiên';
  END IF;
  IF NOT public.is_store_pos_operator(v_session.store_id) THEN
    RAISE EXCEPTION 'Chỉ chủ quán mới được đóng bill';
  END IF;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Thiếu danh tính người chốt bill';
  END IF;

  -- Idempotent: không ghi đè người đã chốt lần đầu.
  IF v_session.status = 'closed'
     AND v_session.close_reason IN ('paid', 'staff_reset') THEN
    SELECT COALESCE(SUM(total_amount), 0)
    INTO v_total
    FROM public.orders
    WHERE session_id = p_session_id
      AND status <> 'cancelled';

    RETURN jsonb_build_object(
      'ok', true,
      'already', true,
      'orders_settled', 0,
      'orders_cancelled', 0,
      'orders_left_in_kitchen', 0,
      'total', v_total
    );
  END IF;

  SELECT COUNT(*)
  INTO v_pending
  FROM public.orders
  WHERE session_id = p_session_id
    AND status = 'pending'
    AND order_source <> 'pos';

  IF v_pending > 0 THEN
    RAISE EXCEPTION 'Còn % đơn chưa được chủ quán xác nhận', v_pending;
  END IF;

  IF p_reason = 'paid' THEN
    IF p_payment_id IS NULL THEN RAISE EXCEPTION 'Thiếu khoản thu'; END IF;
    IF p_instrument IS NULL OR p_instrument NOT IN ('cash', 'bank', 'mixed') THEN
      RAISE EXCEPTION 'Phương tiện thanh toán không hợp lệ: %', COALESCE(p_instrument, '(trống)');
    END IF;

    -- mig 108: giảm giá bill. Phiên hết hạn còn nợ thu đúng tiền đang ghi (spec §6.11) → bỏ qua giảm giá.
    IF v_session.close_reason IS DISTINCT FROM 'expired' AND v_session.bill_discount_type IS NOT NULL THEN
      v_sub := public.session_unpaid_subtotal(p_session_id);
      v_disc := public.bill_discount_amount(v_sub, v_session.bill_discount_type, v_session.bill_discount_value);
      IF v_disc > v_sub THEN
        RAISE EXCEPTION 'Giảm giá lớn hơn tiền hàng — sửa lại giảm giá';
      END IF;
      IF v_disc > 0 THEN
        WITH parts AS (
          SELECT o.id, o.total_amount::bigint AS amt
            FROM public.orders o
           WHERE o.session_id = p_session_id
             AND o.status <> 'cancelled'
             AND o.payment_received_at IS NULL
        ),
        tot AS (SELECT coalesce(sum(amt), 0) AS total FROM parts),
        shares AS (
          SELECT p.id, p.amt,
                 CASE WHEN t.total = 0 THEN 0::numeric
                      ELSE div(v_disc::numeric * p.amt, t.total) END AS share
            FROM parts p CROSS JOIN tot t
        ),
        -- Thứ tự nhận dư: total_amount giảm dần, hoà → id nhỏ nhất (so chuỗi). room = chỗ còn trống của đơn.
        ranked AS (
          SELECT sh.id, sh.amt, sh.share,
                 v_disc - sum(sh.share) OVER () AS rem,
                 coalesce(sum(GREATEST(sh.amt - sh.share, 0)) OVER (
                   ORDER BY sh.amt DESC, sh.id::text COLLATE "C"
                   ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS room_before,
                 sum(GREATEST(sh.amt - sh.share, 0)) OVER () AS room_total,
                 row_number() OVER (ORDER BY sh.amt DESC, sh.id::text COLLATE "C") AS rn
            FROM shares sh
        ),
        alloc AS (
          SELECT rk.id,
                 (rk.share
                  + GREATEST(0, LEAST(GREATEST(rk.amt - rk.share, 0), rk.rem - rk.room_before))
                  -- chỉ còn dư khi giảm > tổng tiền hàng (không xảy ra: đã RAISE ở trên) → đơn đứng đầu
                  + CASE WHEN rk.rn = 1 THEN GREATEST(rk.rem - rk.room_total, 0) ELSE 0 END)::integer AS part
            FROM ranked rk
        )
        UPDATE public.orders o
           SET bill_discount_amount = o.bill_discount_amount + a.part,
               total_amount = o.total_amount - a.part,
               payment_amount = o.total_amount - a.part,
               updated_at = now()
          FROM alloc a
         WHERE o.id = a.id
           AND a.part <> 0;
      END IF;
    END IF;

    UPDATE public.orders
    SET payment_received_at = now(),
        payment_received_via = 'owner',
        payment_received_by = v_uid,
        payment_instrument = p_instrument,
        bill_payment_id = p_payment_id
    WHERE session_id = p_session_id
      AND status <> 'cancelled'
      AND payment_received_at IS NULL;
    GET DIAGNOSTICS v_settled = ROW_COUNT;

    -- Mig 085: thu ngân xác nhận đã nhận tiền = bữa ăn KẾT THÚC → mọi đơn còn hiệu lực của bàn
    -- chuyển "Hoàn tất" (status 'paid' + completed_at), cùng quy ước với trigger auto_complete_dine_in.
    UPDATE public.orders
    SET status = 'paid',
        completed_at = COALESCE(completed_at, now())
    WHERE session_id = p_session_id
      AND status NOT IN ('cancelled', 'paid');
  ELSE
    UPDATE public.orders
    SET status = 'cancelled'
    WHERE session_id = p_session_id
      AND status IN ('pending', 'confirmed')
      AND payment_received_at IS NULL;
    GET DIAGNOSTICS v_cancelled = ROW_COUNT;

    SELECT COUNT(*)
    INTO v_left
    FROM public.orders
    WHERE session_id = p_session_id
      AND status IN ('cooking', 'ready');
  END IF;

  SELECT COALESCE(SUM(total_amount), 0)
  INTO v_total
  FROM public.orders
  WHERE session_id = p_session_id
    AND status <> 'cancelled';

  UPDATE public.table_sessions
  SET status = 'closed',
      closed_at = COALESCE(closed_at, now()),
      closed_by = v_uid,
      close_reason = p_reason,
      bill_payment_id = p_payment_id
  WHERE id = p_session_id;

  IF p_reason = 'paid' THEN
    SELECT * INTO v_reservation
    FROM public.reservations
    WHERE session_id = p_session_id
      AND status = 'arrived'
    FOR UPDATE;

    IF FOUND THEN
      v_before := public.reservation_public_json(v_reservation)
        || public.reservation_active_table_summary(v_reservation.id);
      UPDATE public.reservations
      SET status = 'completed',
          completed_at = now(),
          completed_by = v_uid,
          updated_at = now()
      WHERE id = v_reservation.id
      RETURNING * INTO v_reservation;

      PERFORM public.append_reservation_event(
        v_reservation.id, v_reservation.store_id, v_uid, 'owner', 'completed',
        v_before,
        public.reservation_public_json(v_reservation)
          || public.reservation_active_table_summary(v_reservation.id)
          || jsonb_build_object('session_id', p_session_id),
        NULL
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'already', false,
    'orders_settled', v_settled,
    'orders_cancelled', v_cancelled,
    'orders_left_in_kitchen', v_left,
    'total', v_total
  );
END;
$function$
