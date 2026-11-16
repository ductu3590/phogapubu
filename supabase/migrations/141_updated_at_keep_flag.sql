-- Mig 141: trigger update_updated_at() có thể GIỮ NGUYÊN updated_at khi giao dịch bật cờ `mevo.keep_updated_at`.
--
-- Vì sao (2026-11-16): xoá bàn đã từng có đơn phải chuyển orders.table_id của đơn cũ sang bàn khác (mig 142). Báo cáo
-- xếp đơn vào ngày theo COALESCE(payment_received_at, completed_at, updated_at) (mig 117) — đơn huỷ / đơn chưa thu
-- dùng updated_at. Trigger cũ luôn ghi updated_at = NOW() nên chỉ đổi số bàn cũng kéo đơn cũ sang báo cáo HÔM NAY.
-- Cờ là set_config(..., true) — chỉ sống trong giao dịch của hàm bật nó; PostgREST không cho client đặt GUC tuỳ ý.
-- Không bật cờ thì hành vi y như cũ (mọi bảng đang dùng trigger: orders, mevo_operators, store_*_configs).
--
-- Vá tại chỗ (pg_get_functiondef + replace + EXECUTE). Neo là MỘT dòng nguyên văn trên prod (đo 2026-11-16, thân hàm
-- có CRLF — neo không chứa xuống dòng), phải khớp đúng một lần; đã vá rồi thì RAISE. Áp NGUYÊN VĂN file.
-- Áp TRƯỚC mig 142.

CREATE FUNCTION pg_temp.mig141_patch(p_sig text, p_anchor text, p_new text) RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_def   text := pg_get_functiondef(p_sig::regprocedure);
  v_count integer;
BEGIN
  IF position('mig 141' in v_def) > 0 THEN
    RAISE EXCEPTION 'mig 141: % đã được vá rồi', p_sig;
  END IF;
  v_count := (length(v_def) - length(replace(v_def, p_anchor, ''))) / length(p_anchor);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'mig 141: % — neo "%" khớp % lần (cần đúng 1), thân hàm prod đã khác, không vá',
      p_sig, p_anchor, v_count;
  END IF;
  EXECUTE replace(v_def, p_anchor, p_new);
END
$fn$;

SELECT pg_temp.mig141_patch(
  'public.update_updated_at()',
  $a$  NEW.updated_at = NOW();$a$,
  $n$  -- mig 141: giao dịch bật cờ mevo.keep_updated_at (vd. xoá bàn chuyển đơn cũ sang bàn khác) thì giữ nguyên.
  IF TG_OP = 'UPDATE' AND current_setting('mevo.keep_updated_at', true) = 'on' THEN
    NEW.updated_at = OLD.updated_at;
  ELSE
    NEW.updated_at = NOW();
  END IF;$n$);

NOTIFY pgrst, 'reload schema';
