CREATE OR REPLACE FUNCTION public.set_menu_item_available(p_item_id uuid, p_available boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_store uuid;
BEGIN
  IF p_item_id IS NULL OR p_available IS NULL THEN RAISE EXCEPTION 'Thiếu món hoặc trạng thái'; END IF;
  SELECT store_id INTO v_store FROM public.menu_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy món'; END IF;
  IF NOT public.is_store_pos_operator(v_store) THEN RAISE EXCEPTION 'Không có quyền đổi trạng thái món'; END IF;
  UPDATE public.menu_items SET is_available = p_available WHERE id = p_item_id;
  RETURN jsonb_build_object('ok', true, 'is_available', p_available);
END;
$function$
