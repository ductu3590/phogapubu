-- 106_move_tray_to_one_table.sql — Chuyển bàn (Sprint CB-2): dồn CẢ MÂM (phiên chiếm N bàn) sang MỘT bàn trống.
-- Spec: docs/superpowers/specs/2026-11-02-chuyen-ban-giam-gia-bill-design.md
-- Cần mig 104 (table_session_moves, moved_session_for_caller) và mig 040 (session_tables) đã áp.
--
-- Tách riêng một migration: file chỉ chứa hàm MỚI, không CREATE OR REPLACE đè lên RPC sống nào.
-- KHÔNG cần sửa mig 105: nhật ký có MỘT dòng cho MỖI bàn cũ cùng trỏ về bàn đích, nên
-- moved_session_for_caller(bàn cũ nào cũng được) tìm ra dòng mới nhất của bàn đó → trả bàn đích
-- (đích còn là bàn mở của phiên; nếu sau này lại chuyển tiếp thì lùi về table_sessions.table_id).
--
-- pos_move_session_to_table — thu ngân / chủ quán dồn mâm N bàn về đúng MỘT bàn trống, một giao dịch.
-- Khác pos_move_session_table (mig 104, đổi từng bàn một): ở đây phiên CHỈ CÒN một dòng session_tables,
-- các dòng bàn cũ bị XOÁ (lịch sử nằm ở table_session_moves). is_open_ordering giữ nguyên: mâm vẫn là
-- mâm mở dù chỉ còn một bàn.

CREATE OR REPLACE FUNCTION public.pos_move_session_to_table(
  p_session_id uuid,
  p_to_table_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_store uuid;
  v_s public.table_sessions%ROWTYPE;
  v_to public.tables%ROWTYPE;
  v_old uuid[];          -- các bàn đang mở của phiên (đọc lần 1, trước khi khoá)
  v_old_now uuid[];      -- đọc lại SAU khi giữ khoá phiên, phải trùng lần 1
  v_tid uuid;
  v_keep uuid;           -- dòng session_tables được giữ lại và đổi sang bàn đích
  v_from_numbers text;
BEGIN
  -- Quyền kiểm TRƯỚC khi khoá: người không có quyền không được giữ advisory lock của bàn nào.
  SELECT store_id INTO v_store FROM public.table_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy phiên'; END IF;
  IF NOT public.is_store_pos_operator(v_store) THEN RAISE EXCEPTION 'Không có quyền'; END IF;

  IF p_to_table_id IS NULL THEN
    RAISE EXCEPTION 'Bàn đích không thuộc quán hoặc đã ngừng dùng';
  END IF;

  -- Khoá TẤT CẢ bàn liên quan (bàn cũ + bàn đích) theo id tăng dần — cùng quy ước ghép mâm / chuyển bàn
  -- (mig 040, 104) nên không deadlock khi hai máy thao tác chéo nhau — RỒI mới khoá dòng phiên.
  -- Danh sách bàn cũ đọc trước khoá chỉ để biết cần khoá bàn nào; sẽ đọc lại và đối chiếu bên dưới.
  SELECT coalesce(array_agg(table_id), '{}') INTO v_old
    FROM public.session_tables WHERE session_id = p_session_id AND is_open;

  FOR v_tid IN
    SELECT DISTINCT x FROM unnest(v_old || p_to_table_id) AS x ORDER BY x
  LOOP
    PERFORM public.lock_table_for_session(v_tid);
  END LOOP;

  SELECT * INTO v_s FROM public.table_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy phiên'; END IF;
  IF v_s.status <> 'open' THEN RAISE EXCEPTION 'Phiên đã đóng'; END IF;

  -- Có người ghép thêm / bớt bàn của mâm giữa lúc đọc và lúc giữ khoá phiên → bàn mới chưa được khoá.
  -- Báo thử lại thay vì chuyển với danh sách bàn lệch.
  SELECT coalesce(array_agg(table_id), '{}') INTO v_old_now
    FROM public.session_tables WHERE session_id = p_session_id AND is_open;
  IF (SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM unnest(v_old) x)
     IS DISTINCT FROM (SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM unnest(v_old_now) x) THEN
    RAISE EXCEPTION 'Mâm vừa thay đổi, vui lòng thử lại';
  END IF;
  IF coalesce(array_length(v_old, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Phiên không còn bàn nào';
  END IF;

  SELECT * INTO v_to FROM public.tables
   WHERE id = p_to_table_id AND store_id = v_s.store_id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bàn đích không thuộc quán hoặc đã ngừng dùng'; END IF;

  -- Đích là một bàn của chính mâm này, hoặc đang có phiên khác: cùng thông báo.
  -- table_number đã có chữ "Bàn" ('Bàn 12') nên thông báo không thêm tiền tố nữa.
  IF p_to_table_id = ANY (v_old) OR public.open_session_id_for_table(p_to_table_id) IS NOT NULL THEN
    RAISE EXCEPTION '% đang có khách', v_to.table_number;
  END IF;

  -- Bàn đang trong khung giữ cho khách đặt: server chặn mọi đơn khách gọi vào bàn này (mig 076/078),
  -- cho dồn vào thì cả mâm không gọi thêm được → chặn từ đầu.
  IF public.table_has_current_reservation_hold(p_to_table_id, now()) THEN
    RAISE EXCEPTION '% đang giữ cho khách đặt trước', v_to.table_number;
  END IF;

  SELECT string_agg(t.table_number, ', ' ORDER BY t.table_number) INTO v_from_numbers
    FROM public.tables t WHERE t.id = ANY (v_old);

  -- Yêu cầu gọi nhân viên CHƯA xử lý của các bàn cũ (và của chính bàn đích nếu có lượt gọi trước khi mở phiên)
  -- dồn về MỘT bàn: mỗi loại chỉ giữ yêu cầu MỚI NHẤT, các yêu cầu trùng loại còn lại đánh dấu đã xử lý
  -- (cùng cột resolved_at / resolved_by như khi nhân viên bấm xử lý) — làm trước bước dời để không đụng
  -- unique index service_requests_one_open_session / service_requests_one_open_table.
  -- Chỉ lấy yêu cầu gắn đúng phiên này hoặc chưa gắn phiên nào; yêu cầu của phiên khác để nguyên.
  WITH pool AS (
    SELECT r.id,
           row_number() OVER (PARTITION BY r.type
                              ORDER BY r.last_ping_at DESC, r.created_at DESC NULLS LAST, r.id DESC) AS rn
      FROM public.service_requests r
     WHERE r.store_id = v_s.store_id
       AND r.resolved_at IS NULL
       AND (
            (r.table_id = ANY (v_old) AND (r.session_id = p_session_id OR r.session_id IS NULL))
         OR (r.table_id = p_to_table_id AND r.session_id IS NULL)
       )
  )
  UPDATE public.service_requests r
     SET resolved_at = now(), resolved_by = v_uid
    FROM pool
   WHERE r.id = pool.id AND pool.rn > 1;

  UPDATE public.service_requests r
     SET table_id = p_to_table_id,
         table_number = v_to.table_number
   WHERE r.store_id = v_s.store_id
     AND r.table_id = ANY (v_old)
     AND r.resolved_at IS NULL
     AND (r.session_id = p_session_id OR r.session_id IS NULL);

  -- session_tables: giữ đúng MỘT dòng mở, đổi sang bàn đích; XOÁ các dòng mở còn lại của phiên.
  -- Ưu tiên giữ dòng của bàn gốc phiên; xoá trước rồi mới đổi nên không vướng khoá chính (session_id, table_id).
  -- Không có trigger nào trên session_tables. Unique index session_tables_one_open_per_table là chốt chặn
  -- race cuối cùng nếu advisory lock hở.
  SELECT x INTO v_keep FROM unnest(v_old) AS x ORDER BY (x = v_s.table_id) DESC, x LIMIT 1;

  DELETE FROM public.session_tables
   WHERE session_id = p_session_id AND table_id = ANY (v_old) AND table_id <> v_keep;

  UPDATE public.session_tables
     SET table_id = p_to_table_id
   WHERE session_id = p_session_id AND table_id = v_keep;

  -- Bàn gốc đi theo (moved_session_for_caller và hiển thị rút gọn đọc cột này)
  UPDATE public.table_sessions
     SET table_id = p_to_table_id, last_activity_at = now()
   WHERE id = p_session_id;

  -- Mọi đơn của phiên đang gắn ở các bàn cũ: để phiếu in SAU khi chuyển mang đúng số bàn mới.
  UPDATE public.orders
     SET table_id = p_to_table_id
   WHERE session_id = p_session_id AND table_id = ANY (v_old);

  -- Mỗi bàn cũ một dòng nhật ký cùng trỏ về bàn đích → khách ở BẤT KỲ bàn cũ nào quét lại đều được chuyển hướng.
  -- clock_timestamp(): thời điểm thật, đúng thứ tự "mới nhất" nếu cùng giao dịch còn chuyển tiếp.
  INSERT INTO public.table_session_moves (store_id, session_id, from_table_id, to_table_id, moved_by, moved_at)
  SELECT v_s.store_id, p_session_id, f, p_to_table_id, v_uid, clock_timestamp()
    FROM unnest(v_old) AS f;

  RETURN jsonb_build_object(
    'ok', true,
    'from_table_numbers', v_from_numbers,
    'to_table_number', v_to.table_number,
    'tables_moved', array_length(v_old, 1)
  );
END $$;
-- Default privileges của schema public cấp EXECUTE thẳng cho anon/authenticated nên phải gỡ tường minh anon.
REVOKE ALL ON FUNCTION public.pos_move_session_to_table(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_move_session_to_table(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
