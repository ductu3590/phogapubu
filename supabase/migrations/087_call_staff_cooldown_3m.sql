-- 087: Gọi nhân viên chặn 3 PHÚT cho mỗi phiên bàn (hoặc mỗi bàn khi chưa có phiên),
-- KỂ CẢ khi yêu cầu trước đã được nhân viên xử lý xong (bản 050 chỉ chặn 10 giây và chỉ khi
-- yêu cầu còn mở). DETAIL = giờ được gọi lại (UTC ISO) để Mini App hiện "gọi lại sau HH:MM".
-- File này CHỈ chứa ping_service_request — không gộp RPC khác (quy tắc 2026-09-01).
CREATE OR REPLACE FUNCTION public.ping_service_request(p_table_id uuid, p_type text, p_device_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_table public.tables%ROWTYPE;
  v_session_id uuid;
  v_request public.service_requests%ROWTYPE;
  v_last_ping timestamptz;
BEGIN
  IF p_type IS DISTINCT FROM 'call_staff' THEN
    RAISE EXCEPTION 'Loại yêu cầu không hợp lệ';
  END IF;

  SELECT * INTO v_table FROM public.tables WHERE id = p_table_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bàn không thuộc quán hoặc không hoạt động';
  END IF;

  SELECT s.id INTO v_session_id
  FROM public.table_sessions s
  WHERE s.id = public.open_session_id_for_table(v_table.id)
    AND s.store_id = v_table.store_id
    AND s.status = 'open';

  -- Lần gọi gần nhất của CÙNG phiên (hoặc cùng bàn khi chưa có phiên), đã xử lý hay chưa.
  SELECT max(r.last_ping_at) INTO v_last_ping
  FROM public.service_requests r
  WHERE r.store_id = v_table.store_id
    AND r.type = 'call_staff'
    AND CASE WHEN v_session_id IS NOT NULL THEN r.session_id = v_session_id
             ELSE r.session_id IS NULL AND r.table_id = v_table.id END;

  IF v_last_ping IS NOT NULL AND v_last_ping > now() - interval '3 minutes' THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Vui lòng chờ trước khi gọi nhân viên lần nữa',
      DETAIL = to_char((v_last_ping + interval '3 minutes') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  END IF;

  IF v_session_id IS NOT NULL THEN
    INSERT INTO public.service_requests AS current_request (
      store_id, table_id, table_number, type, session_id, last_ping_at, last_device_id, ping_count
    ) VALUES (
      v_table.store_id, v_table.id, v_table.table_number, 'call_staff', v_session_id, now(), p_device_id, 1
    )
    ON CONFLICT (store_id, session_id, type)
      WHERE resolved_at IS NULL AND session_id IS NOT NULL
    DO UPDATE
      SET table_id = EXCLUDED.table_id,
          table_number = EXCLUDED.table_number,
          last_ping_at = EXCLUDED.last_ping_at,
          last_device_id = EXCLUDED.last_device_id,
          ping_count = current_request.ping_count + 1
      -- Chốt chặn thứ hai cho 2 lần gọi chạy song song cùng lúc.
      WHERE current_request.last_ping_at <= EXCLUDED.last_ping_at - interval '3 minutes'
    RETURNING * INTO v_request;
  ELSE
    INSERT INTO public.service_requests AS current_request (
      store_id, table_id, table_number, type, session_id, last_ping_at, last_device_id, ping_count
    ) VALUES (
      v_table.store_id, v_table.id, v_table.table_number, 'call_staff', NULL, now(), p_device_id, 1
    )
    ON CONFLICT (store_id, table_id, type)
      WHERE resolved_at IS NULL AND session_id IS NULL
    DO UPDATE
      SET table_number = EXCLUDED.table_number,
          last_ping_at = EXCLUDED.last_ping_at,
          last_device_id = EXCLUDED.last_device_id,
          ping_count = current_request.ping_count + 1
      WHERE current_request.last_ping_at <= EXCLUDED.last_ping_at - interval '3 minutes'
    RETURNING * INTO v_request;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Vui lòng chờ trước khi gọi nhân viên lần nữa',
      DETAIL = to_char((now() + interval '3 minutes') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  END IF;

  RETURN to_jsonb(v_request);
END;
$function$;
