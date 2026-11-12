-- Mig 132: vá hai lỗi tranh chấp ở đường tiền, tìm ra bằng bộ test đua nhiều kết nối (supabase/tests/race/, 2026-11-11).
--
-- Lỗi 1 — staff_create_order chèn đơn vào phiên VỪA thu xong.
--   collect_table_bill khoá phiên (FOR UPDATE) rồi đóng nó 'paid'. staff_create_order (quán trả sau) lấy khoá bàn,
--   thấy phiên còn mở, rồi đứng chờ `perform 1 from table_sessions … for update`. Thu tiền commit xong, nó đi tiếp và
--   chèn đơn 'pending' chưa thu vào phiên ĐÃ ĐÓNG: bàn hiện trống, không ai thu khoản đó. create_order và
--   pos_add_manual_items đã kiểm lại status sau khi chờ khoá; staff_create_order thì không.
--   Vá: khoá phiên KÈM điều kiện status = 'open' (READ COMMITTED đánh giá lại điều kiện trên bản mới nhất sau khi chờ),
--   không còn mở thì báo lỗi để nhân viên gửi lại — lần gửi lại tự mở phiên mới cho bàn.
--
-- Lỗi 2 — deadlock giữa thu tiền và sửa bill.
--   collect_table_bill khoá PHIÊN rồi ghi ĐƠN. pos_void_order_item / pos_set_order_item_quantity / pos_restore_order_item
--   khoá ĐƠN rồi cuối hàm mới ghi PHIÊN (last_activity_at) → hai thứ tự ngược nhau, Postgres huỷ một bên (40P01).
--   Vá: ba hàm sửa bill khoá phiên của đơn TRƯỚC khi khoá đơn. Giữa lúc đọc session_id và lúc khoá đơn, đơn có thể bị
--   dời sang mâm khác (ghép mâm) → kiểm lại, lệch thì báo lỗi thay vì ghi phiên mà không giữ khoá.
--   Không trigger nào trên orders / order_items chạm table_sessions (đã kiểm prod 2026-11-12), và chỉ ba hàm này
--   vừa khoá orders FOR UPDATE vừa ghi table_sessions.
--
-- Vá tại chỗ (pg_get_functiondef + replace + EXECUTE). Mọi neo là MỘT dòng và phải khớp đúng một lần; thân
-- pos_void_order_item / pos_restore_order_item trên prod có CRLF nên đoạn chèn ghép bằng chr(10), không phụ thuộc kiểu
-- xuống dòng của file này. Đã vá rồi thì RAISE — không chạy lại lần hai. Áp NGUYÊN VĂN file.

CREATE FUNCTION pg_temp.mig132_patch(p_sig text, p_anchor text, p_new text) RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_def   text := pg_get_functiondef(p_sig::regprocedure);
  v_count integer;
BEGIN
  v_count := (length(v_def) - length(replace(v_def, p_anchor, ''))) / length(p_anchor);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'mig 132: % — neo "%" khớp % lần (cần đúng 1), thân hàm prod đã khác, không vá',
      p_sig, p_anchor, v_count;
  END IF;
  EXECUTE replace(v_def, p_anchor, p_new);
END
$fn$;

DO $mig$
DECLARE
  nl text := chr(10);
  v_sig text;
BEGIN
  -- Chặn chạy lại: mọi đoạn chèn đều mang chữ 'mig 132'
  FOREACH v_sig IN ARRAY ARRAY[
    'public.staff_create_order(uuid,jsonb,text,uuid,text)',
    'public.pos_void_order_item(uuid,text,text)',
    'public.pos_set_order_item_quantity(uuid,integer,text)',
    'public.pos_restore_order_item(uuid)'
  ] LOOP
    IF position('mig 132' in pg_get_functiondef(v_sig::regprocedure)) > 0 THEN
      RAISE EXCEPTION 'mig 132: % đã được vá rồi', v_sig;
    END IF;
  END LOOP;

  -- Lỗi 1: staff_create_order kiểm lại phiên còn mở sau khi chờ khoá
  PERFORM pg_temp.mig132_patch(
    'public.staff_create_order(uuid,jsonb,text,uuid,text)',
    '    perform 1 from table_sessions where id = v_session_id for update;',
    array_to_string(ARRAY[
      '    -- mig 132: chờ khoá xong mà phiên đã bị thu / đóng ở quầy thì KHÔNG chèn đơn vào phiên đã đóng.',
      '    perform 1 from table_sessions where id = v_session_id and status = ''open'' for update;',
      '    if not found then',
      '      raise exception ''Bàn vừa được thu tiền ở quầy, bấm gửi lại để mở lượt mới cho bàn'';',
      '    end if;'
    ], nl));

  -- Lỗi 2: ba hàm sửa bill khoá PHIÊN trước rồi mới khoá ĐƠN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.pos_void_order_item(uuid,text,text)',
    'public.pos_set_order_item_quantity(uuid,integer,text)',
    'public.pos_restore_order_item(uuid)'
  ] LOOP
    PERFORM pg_temp.mig132_patch(v_sig,
      '  v_total integer;',
      '  v_total integer;' || nl || '  v_lock_session uuid; -- mig 132');

    PERFORM pg_temp.mig132_patch(v_sig,
      '  SELECT * INTO v_order',
      array_to_string(ARRAY[
        '  -- mig 132: khoá PHIÊN trước rồi mới khoá ĐƠN, cùng thứ tự với collect_table_bill (khoá phiên → ghi đơn).',
        '  -- Ngược thứ tự là deadlock khi thu ngân bấm thu đúng lúc máy khác bỏ / tặng / sửa món.',
        '  SELECT o.session_id INTO v_lock_session FROM public.orders o WHERE o.id = v_item.order_id;',
        '  IF v_lock_session IS NOT NULL THEN',
        '    PERFORM 1 FROM public.table_sessions WHERE id = v_lock_session FOR UPDATE;',
        '  END IF;',
        '  SELECT * INTO v_order'
      ], nl));

    PERFORM pg_temp.mig132_patch(v_sig,
      '  IF NOT public.is_store_pos_operator(v_order.store_id) THEN',
      array_to_string(ARRAY[
        '  -- mig 132: đơn vừa bị dời sang mâm khác giữa hai bước khoá → khoá đang giữ không phải phiên của đơn.',
        '  IF v_order.session_id IS DISTINCT FROM v_lock_session THEN',
        '    RAISE EXCEPTION ''Bill vừa thay đổi ở máy khác, tải lại rồi thử lại'';',
        '  END IF;',
        '',
        '  IF NOT public.is_store_pos_operator(v_order.store_id) THEN'
      ], nl));
  END LOOP;
END
$mig$;

NOTIFY pgrst, 'reload schema';
