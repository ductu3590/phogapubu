CREATE OR REPLACE FUNCTION public.merge_session_into_tray(p_session_id uuid, p_target_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_src table_sessions%rowtype; v_dst table_sessions%rowtype;
  v_first uuid; v_second uuid;
  v_orders int; v_tables int;
begin
  if p_session_id = p_target_session_id then raise exception 'Không thể nhập phiên vào chính nó'; end if;

  v_first  := least(p_session_id, p_target_session_id);
  v_second := greatest(p_session_id, p_target_session_id);
  perform 1 from table_sessions where id = v_first  for update;
  perform 1 from table_sessions where id = v_second for update;

  select * into v_src from table_sessions where id = p_session_id;
  if not found then raise exception 'Không tìm thấy phiên nguồn'; end if;
  select * into v_dst from table_sessions where id = p_target_session_id;
  if not found then raise exception 'Không tìm thấy mâm đích'; end if;

  if not is_store_scoped_operator(v_src.store_id) then raise exception 'Không có quyền'; end if;
  if v_src.store_id <> v_dst.store_id then raise exception 'Hai phiên không cùng quán'; end if;
  if v_src.status <> 'open' or v_dst.status <> 'open' then raise exception 'Chỉ gom được phiên đang mở'; end if;

  update orders set session_id = p_target_session_id where session_id = p_session_id;
  get diagnostics v_orders = row_count;

  update session_tables set session_id = p_target_session_id
   where session_id = p_session_id and is_open;
  get diagnostics v_tables = row_count;

  update table_sessions
     set status = 'closed', closed_at = now(), closed_by = v_uid, close_reason = 'merged'
   where id = p_session_id;

  update table_sessions
     set is_open_ordering = true, last_activity_at = now()
   where id = p_target_session_id;

  return jsonb_build_object('ok', true, 'orders_moved', v_orders, 'tables_moved', v_tables);
end $function$
