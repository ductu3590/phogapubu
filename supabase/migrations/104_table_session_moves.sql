-- 104_table_session_moves.sql — Chuyển bàn: dời một bàn đang có khách sang một bàn TRỐNG.
-- Spec: docs/superpowers/specs/2026-11-02-chuyen-ban-giam-gia-bill-design.md §3.1–3.3
-- Quán đích: Yên Garden (bia garden), dùng chung cho mọi quán trả sau.
--
-- Tách riêng một migration: file chỉ chứa hàm MỚI (không CREATE OR REPLACE đè lên RPC sống nào).
-- Các RPC sống cần sửa (get_table_session_state, create_table_order_batch, create_order,
-- staff_create_order) vá ở mig 105 bằng pg_get_functiondef + replace — KHÔNG chép thân hàm từ đây.
--
-- GỒM:
--   1) table_session_moves  — nhật ký ai chuyển bàn nào, lúc nào (chỉ ghi qua RPC)
--   2) orders.device_id     — nhận ra khách không cho Zalo UID sau khi bàn đã chuyển
--   3) moved_session_for_caller() — helper nội bộ: "người này có thuộc phiên vừa chuyển đi khỏi bàn X không"
--   4) pos_move_session_table()   — RPC chuyển bàn (thu ngân / chủ quán)

-- ============================================================
-- 1) Nhật ký chuyển bàn
-- ============================================================
CREATE TABLE IF NOT EXISTS public.table_session_moves (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      uuid NOT NULL REFERENCES public.stores(id),
  session_id    uuid NOT NULL REFERENCES public.table_sessions(id) ON DELETE CASCADE,
  from_table_id uuid NOT NULL REFERENCES public.tables(id),
  to_table_id   uuid NOT NULL REFERENCES public.tables(id),
  moved_by      uuid NOT NULL,
  moved_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.table_session_moves IS
  'Nhật ký chuyển bàn của phiên: moved_by chuyển phiên từ from_table_id sang to_table_id lúc moved_at. Chỉ ghi qua pos_move_session_table. Mini App dùng bảng này để biết "bàn cũ này đã chuyển sang bàn nào".';

CREATE INDEX IF NOT EXISTS table_session_moves_session
  ON public.table_session_moves(session_id, moved_at);
-- moved_session_for_caller tìm theo bàn đã bị chuyển ĐI, mới nhất trước
CREATE INDEX IF NOT EXISTS table_session_moves_from_table
  ON public.table_session_moves(from_table_id, moved_at DESC);

ALTER TABLE public.table_session_moves ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.table_session_moves FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.table_session_moves FROM authenticated;
GRANT SELECT ON public.table_session_moves TO authenticated;
DROP POLICY IF EXISTS "auth_read_table_session_moves" ON public.table_session_moves;
CREATE POLICY "auth_read_table_session_moves" ON public.table_session_moves
  FOR SELECT TO authenticated USING (public.is_store_scoped_operator(store_id));

-- ============================================================
-- 2) orders.device_id
--    Hiện orders chỉ lưu zalo_user_id nên khách trong mâm mở không cho Zalo UID sẽ không được nhận ra
--    sau khi chuyển bàn. Ghi vào ở mig 105 (create_order / staff_create_order); cột này nullable,
--    đơn cũ để NULL.
-- ============================================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS device_id text;

COMMENT ON COLUMN public.orders.device_id IS
  'Device id (localStorage mevo_device_id) của máy gửi đơn. Cùng zalo_user_id dùng để nhận ra khách thuộc phiên đã chuyển bàn.';

-- ============================================================
-- 3) moved_session_for_caller — "người gọi có thuộc một phiên ĐANG MỞ vừa chuyển đi khỏi bàn này không?"
--    Dùng chung cho get_table_session_state / create_table_order_batch / create_order (mig 105).
--    Chỉ gọi nội bộ từ RPC SECURITY DEFINER khác → KHÔNG grant cho anon/authenticated
--    (nếu mở, ai cũng dò được "bàn nào vừa chuyển sang đâu" bằng UID đoán).
--
--    "Thuộc" = khớp chủ phiên (UID hoặc device) HOẶC đã từng gửi một đơn trong phiên (UID hoặc device).
--    Giá trị NULL / rỗng KHÔNG bao giờ khớp (nullif) — tránh "NULL = NULL" nhận nhầm khách lạ.
--    table_id trả về = bàn hiện tại của phiên: to_table_id nếu bàn đó còn trong phiên; nếu đã chuyển tiếp
--    (A→B rồi B→C) thì lùi về bàn gốc hiện tại của phiên (table_sessions.table_id, luôn đi theo bàn được chuyển).
-- ============================================================
CREATE OR REPLACE FUNCTION public.moved_session_for_caller(
  p_table_id uuid,
  p_zalo_user_id text,
  p_device_id text
) RETURNS TABLE(session_id uuid, table_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id,
         CASE WHEN EXISTS (
                SELECT 1 FROM public.session_tables st
                 WHERE st.session_id = s.id AND st.table_id = m.to_table_id AND st.is_open)
              THEN m.to_table_id
              ELSE s.table_id
         END
    FROM public.table_session_moves m
    JOIN public.table_sessions s ON s.id = m.session_id
   WHERE m.from_table_id = p_table_id
     AND s.status = 'open'
     AND (
          (nullif(p_zalo_user_id, '') IS NOT NULL AND s.host_zalo_user_id = nullif(p_zalo_user_id, ''))
       OR (nullif(p_device_id, '')    IS NOT NULL AND s.host_device_id   = nullif(p_device_id, ''))
       OR EXISTS (
            SELECT 1 FROM public.orders o
             WHERE o.session_id = s.id
               AND (
                    (nullif(p_zalo_user_id, '') IS NOT NULL AND o.zalo_user_id = nullif(p_zalo_user_id, ''))
                 OR (nullif(p_device_id, '')    IS NOT NULL AND o.device_id    = nullif(p_device_id, ''))
               ))
     )
   ORDER BY m.moved_at DESC
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.moved_session_for_caller(uuid, text, text) FROM PUBLIC;

-- ============================================================
-- 4) pos_move_session_table — chuyển MỘT bàn của phiên sang bàn trống, một giao dịch
-- ============================================================
CREATE OR REPLACE FUNCTION public.pos_move_session_table(
  p_session_id uuid,
  p_from_table_id uuid,
  p_to_table_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_store uuid;
  v_s public.table_sessions%ROWTYPE;
  v_from_number text;
  v_to public.tables%ROWTYPE;
BEGIN
  -- Quyền kiểm TRƯỚC khi khoá: người không có quyền không được giữ advisory lock của bàn nào.
  SELECT store_id INTO v_store FROM public.table_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy phiên'; END IF;
  IF NOT public.is_store_pos_operator(v_store) THEN RAISE EXCEPTION 'Không có quyền'; END IF;

  IF p_from_table_id = p_to_table_id THEN
    RAISE EXCEPTION 'Không thể chuyển sang chính bàn đó';
  END IF;

  -- Khoá hai bàn theo thứ tự id tăng dần (cùng quy ước ghép mâm → không deadlock khi hai máy chuyển chéo
  -- nhau), RỒI mới khoá dòng phiên. Hai máy cùng chuyển vào một bàn trống: máy sau chờ ở đây, thức dậy
  -- thấy bàn đã có phiên → bị từ chối ở bước kiểm bên dưới.
  PERFORM public.lock_table_for_session(least(p_from_table_id, p_to_table_id));
  PERFORM public.lock_table_for_session(greatest(p_from_table_id, p_to_table_id));

  SELECT * INTO v_s FROM public.table_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy phiên'; END IF;
  IF v_s.status <> 'open' THEN RAISE EXCEPTION 'Phiên đã đóng'; END IF;

  -- Bàn nguồn phải đang thuộc phiên này (mâm N bàn: chỉ đổi từng bàn một)
  IF NOT EXISTS (
    SELECT 1 FROM public.session_tables
     WHERE session_id = p_session_id AND table_id = p_from_table_id AND is_open
  ) THEN
    RAISE EXCEPTION 'Bàn nguồn không thuộc phiên này';
  END IF;

  SELECT * INTO v_to FROM public.tables
   WHERE id = p_to_table_id AND store_id = v_s.store_id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bàn đích không thuộc quán hoặc đã ngừng dùng'; END IF;

  -- table_number đã có chữ "Bàn" ('Bàn 12') nên thông báo không thêm tiền tố nữa.
  IF public.open_session_id_for_table(p_to_table_id) IS NOT NULL THEN
    RAISE EXCEPTION '% đang có khách', v_to.table_number;
  END IF;

  -- Bàn đang trong khung giữ cho khách đặt: server vốn chặn mọi đơn khách gọi vào bàn này (mig 076/078),
  -- cho chuyển vào thì nhóm khách vừa chuyển sẽ không gọi thêm được → chặn từ đầu.
  IF public.table_has_current_reservation_hold(p_to_table_id, now()) THEN
    RAISE EXCEPTION '% đang giữ cho khách đặt trước', v_to.table_number;
  END IF;

  SELECT table_number INTO v_from_number FROM public.tables WHERE id = p_from_table_id;

  -- Đổi TẠI CHỖ, không để lại dòng bàn cũ: mọi chỗ đọc nhãn bàn từ session_tables (kể cả chỗ không lọc
  -- is_open như bills_report_table_label) chỉ thấy bàn mới. Lịch sử nằm ở table_session_moves.
  -- Unique index session_tables_one_open_per_table là chốt chặn race cuối cùng nếu advisory lock hở.
  UPDATE public.session_tables
     SET table_id = p_to_table_id
   WHERE session_id = p_session_id AND table_id = p_from_table_id;

  -- Bàn gốc đi theo bàn được chuyển (moved_session_for_caller và hiển thị rút gọn đọc cột này)
  UPDATE public.table_sessions
     SET table_id = p_to_table_id
   WHERE id = p_session_id AND table_id = p_from_table_id;

  -- Mọi đơn của bàn đó trong phiên: để phiếu bàn / phiếu bếp in SAU khi chuyển (lượt chờ duyệt mới được
  -- xác nhận) mang đúng số bàn mới. Đơn của các bàn khác trong mâm giữ nguyên.
  UPDATE public.orders
     SET table_id = p_to_table_id
   WHERE session_id = p_session_id AND table_id = p_from_table_id;

  -- Yêu cầu gọi nhân viên CHƯA xử lý: đi theo sang bàn mới (cả table_id lẫn table_number snapshot) để
  -- chuông không báo "Bàn 4" ở bàn đã trống. Loại có session_id gắn đúng phiên này luôn an toàn (unique
  -- index theo phiên); loại chưa gắn phiên (gọi trước khi mở phiên) chỉ chuyển khi bàn đích chưa có
  -- yêu cầu cùng loại, để không đụng service_requests_one_open_table.
  UPDATE public.service_requests r
     SET table_id = p_to_table_id,
         table_number = v_to.table_number
   WHERE r.store_id = v_s.store_id
     AND r.table_id = p_from_table_id
     AND r.resolved_at IS NULL
     AND (
          r.session_id = p_session_id
       OR (r.session_id IS NULL AND NOT EXISTS (
             SELECT 1 FROM public.service_requests x
              WHERE x.store_id = r.store_id AND x.table_id = p_to_table_id
                AND x.type = r.type AND x.resolved_at IS NULL AND x.session_id IS NULL))
     );

  -- clock_timestamp(): nhiều lần chuyển trong cùng một giao dịch vẫn có thứ tự "mới nhất" đúng
  INSERT INTO public.table_session_moves (store_id, session_id, from_table_id, to_table_id, moved_by, moved_at)
  VALUES (v_s.store_id, p_session_id, p_from_table_id, p_to_table_id, v_uid, clock_timestamp());

  UPDATE public.table_sessions SET last_activity_at = now() WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'ok', true,
    'from_table_number', v_from_number,
    'to_table_number', v_to.table_number
  );
END $$;
REVOKE ALL ON FUNCTION public.pos_move_session_table(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pos_move_session_table(uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.pos_move_session_table(uuid, uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
