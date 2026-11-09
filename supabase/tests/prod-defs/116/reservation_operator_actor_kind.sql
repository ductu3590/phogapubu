CREATE OR REPLACE FUNCTION public.reservation_operator_actor_kind(p_store_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
  v_operator_store uuid;
BEGIN
  SELECT role, store_id INTO v_role, v_operator_store
  FROM public.mevo_operators
  WHERE user_id = auth.uid() AND is_active IS TRUE;

  IF v_role = 'mevo_superadmin' THEN RETURN 'mevo'; END IF;
  IF v_role IN ('store_owner', 'store_cashier') AND v_operator_store = p_store_id THEN RETURN 'owner'; END IF;
  IF v_role = 'store_staff' AND v_operator_store = p_store_id THEN
    RAISE EXCEPTION 'Chỉ chủ quán mới được quản lý đặt bàn';
  END IF;
  RAISE EXCEPTION 'Không có quyền quản lý đặt bàn của quán này';
END;
$function$
