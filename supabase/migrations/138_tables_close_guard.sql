-- 138_tables_close_guard.sql — không cho ĐÓNG bàn đang có khách / đang giữ cho lượt đặt bàn.
-- Việc: docs/testing/yen-garden/FIX-BAN-CAU-HINH.md (2026-11-13).
--
-- Vì sao chặn bằng trigger chứ không chỉ ở server action: chủ quán (và superadmin) có quyền UPDATE
-- thẳng bảng tables qua RLS (policy auth_update_tables), nên phiên đăng nhập gọi PostgREST trực tiếp
-- vẫn đóng được bàn. Trigger giữ luật cho MỌI đường ghi.
--
-- Bàn đóng mà phiên còn mở thì: sơ đồ POS (pos_get_floor_layout lọc is_active) không còn ô bàn để
-- thu tiền, khách đang ngồi gọi thêm bị create_order từ chối. Bàn đang giữ cho lượt đặt bàn sắp tới thì
-- lượt đó trỏ vào bàn không còn trên sơ đồ.
--
-- Hàm MỚI (không thay RPC đang sống). Mở lại bàn (false → true) không bị chặn.

CREATE FUNCTION public.tables_guard_close()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.is_active IS TRUE AND NEW.is_active IS NOT TRUE THEN
    -- Bàn lẻ lẫn mâm ghép đều có dòng session_tables (mig 040); xem thêm table_sessions.table_id cho chắc.
    IF EXISTS (SELECT 1 FROM public.session_tables st WHERE st.table_id = NEW.id AND st.is_open)
       OR EXISTS (SELECT 1 FROM public.table_sessions ts WHERE ts.table_id = NEW.id AND ts.status = 'open') THEN
      RAISE EXCEPTION 'Bàn "%" đang có khách (phiên chưa đóng). Thu tiền hoặc đóng phiên ở POS rồi mới đóng bàn.',
        NEW.table_number;
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.reservation_tables rt
      JOIN public.reservations r ON r.id = rt.reservation_id
      WHERE rt.table_id = NEW.id
        AND rt.released_at IS NULL
        AND rt.hold_ends_at > now()
        AND r.status IN ('pending', 'confirmed', 'change_requested')
    ) THEN
      RAISE EXCEPTION 'Bàn "%" đang được giữ cho một lượt đặt bàn sắp tới. Đổi bàn cho lượt đặt đó trước rồi mới đóng bàn.',
        NEW.table_number;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.tables_guard_close() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_tables_guard_close
  BEFORE UPDATE OF is_active ON public.tables
  FOR EACH ROW
  EXECUTE FUNCTION public.tables_guard_close();
