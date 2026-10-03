-- 084: Màn nhân viên (/staff/order) thấy bàn đã có khách đặt trước sắp đến (Pha 4 ST-1, 2026-10-03).
--
-- Trước đây chỉ chủ quán gọi được list_prearrival_reserved_table_ids (mig 075) → nhân viên bấm vào
-- bàn đã đặt lúc 09:00 thì vẫn thấy "Trống" và mở bàn cho khách vãng lai, tới giờ khách đặt đến
-- thì bàn còn người ngồi. Hàm này CHỈ ĐỌC, cho mọi operator đang bật của đúng quán (owner + staff),
-- trả thêm giờ hẹn để màn nhân viên cảnh báo "bàn có khách đặt 09:00".
--
-- Không đổi luật khoá bàn ở server (mig 075/076/078a giữ nguyên): nhân viên vẫn mở được bàn đó nếu
-- chọn "Vẫn dùng bàn này"; POS của chủ quán tự báo "Xung đột" trên Timeline để đổi bàn cho khách đặt.

CREATE OR REPLACE FUNCTION public.list_staff_upcoming_reserved_tables(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_store_scoped_operator(p_store_id) THEN
    RAISE EXCEPTION 'Không có quyền xem bàn đã đặt của quán này';
  END IF;

  -- Đặt bàn đã xác nhận, khách chưa đến, còn trong khoảng giữ bàn, giờ hẹn trong 12 giờ tới.
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'table_id', rt.table_id,
      'reservation_id', r.id,
      'customer_name', r.customer_name,
      'party_size', r.party_size,
      'arrival_at', r.arrival_at,
      'hold_ends_at', rt.hold_ends_at
    ) ORDER BY r.arrival_at)
    FROM public.reservation_tables rt
    JOIN public.reservations r ON r.id = rt.reservation_id
    WHERE rt.store_id = p_store_id
      AND rt.released_at IS NULL
      AND r.status = 'confirmed'
      AND r.session_id IS NULL
      AND rt.hold_ends_at > now()
      AND r.arrival_at < now() + interval '12 hours'
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.list_staff_upcoming_reserved_tables(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_staff_upcoming_reserved_tables(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
