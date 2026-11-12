-- Mig 133: Ghép mâm / Nhập vào mâm / Chuyển quyền gọi món chỉ còn cho chủ quán, quản lý, thu ngân (làm ở POS).
--
-- Vì sao (anh Tú, 2026-11-12): nhân viên phục vụ chỉ được THÊM BÀN TRỐNG vào bàn đang có khách (khách đang ngồi có thêm
-- bạn tới, kê thêm bàn cạnh nhau — RPC add_table_to_session, KHÔNG đổi). Gộp hai bàn đang có khách vào nhau, ghép
-- nhiều bàn trống thành mâm, và chuyển quyền gọi món là việc của POS. Màn /staff/tables đã bỏ các nút đó; mig này
-- chặn cả ở server, vì nhân viên vẫn gọi thẳng RPC được bằng phiên đăng nhập của mình.
--
-- Ba hàm đang kiểm is_store_scoped_operator (mọi vai của quán, kể cả store_staff) → đổi sang is_store_pos_operator
-- (chủ quán / quản lý / thu ngân, mig 093 + 116). Không hàm nào khác gọi ba hàm này (đã kiểm prod 2026-11-12).
--
-- Vá tại chỗ (pg_get_functiondef + replace + EXECUTE). Neo là MỘT dòng nguyên văn trên prod, phải khớp đúng một lần;
-- đã vá rồi thì RAISE — không chạy lại lần hai. Áp NGUYÊN VĂN file.

CREATE FUNCTION pg_temp.mig133_patch(p_sig text, p_anchor text, p_new text) RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_def   text := pg_get_functiondef(p_sig::regprocedure);
  v_count integer;
BEGIN
  IF position('mig 133' in v_def) > 0 THEN
    RAISE EXCEPTION 'mig 133: % đã được vá rồi', p_sig;
  END IF;
  v_count := (length(v_def) - length(replace(v_def, p_anchor, ''))) / length(p_anchor);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'mig 133: % — neo "%" khớp % lần (cần đúng 1), thân hàm prod đã khác, không vá',
      p_sig, p_anchor, v_count;
  END IF;
  EXECUTE replace(v_def, p_anchor, p_new);
END
$fn$;

SELECT pg_temp.mig133_patch(
  'public.create_tray_session(uuid,uuid[])',
  $a$  if not is_store_scoped_operator(p_store_id) then raise exception 'Không có quyền'; end if;$a$,
  $n$  if not is_store_pos_operator(p_store_id) then raise exception 'Chỉ chủ quán, quản lý hoặc thu ngân được ghép mâm (làm ở POS)'; end if; -- mig 133$n$);

SELECT pg_temp.mig133_patch(
  'public.merge_session_into_tray(uuid,uuid)',
  $a$  if not is_store_scoped_operator(v_src.store_id) then raise exception 'Không có quyền'; end if;$a$,
  $n$  if not is_store_pos_operator(v_src.store_id) then raise exception 'Chỉ chủ quán, quản lý hoặc thu ngân được nhập mâm (làm ở POS)'; end if; -- mig 133$n$);

SELECT pg_temp.mig133_patch(
  'public.release_table_session_host(uuid)',
  $a$  if not is_store_scoped_operator(v_s.store_id) then raise exception 'Không có quyền'; end if;$a$,
  $n$  if not is_store_pos_operator(v_s.store_id) then raise exception 'Chỉ chủ quán, quản lý hoặc thu ngân được chuyển quyền gọi món (làm ở POS)'; end if; -- mig 133$n$);

NOTIFY pgrst, 'reload schema';
