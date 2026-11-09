CREATE OR REPLACE FUNCTION public.bills_report_table_label(p_session_ids uuid[], p_order_ids uuid[], p_order_type text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT string_agg(DISTINCT t.table_number, ', ' ORDER BY t.table_number)
       FROM public.session_tables st JOIN public.tables t ON t.id = st.table_id
      WHERE st.session_id = ANY(p_session_ids)),
    (SELECT string_agg(DISTINCT t.table_number, ', ' ORDER BY t.table_number)
       FROM public.orders o JOIN public.tables t ON t.id = o.table_id
      WHERE o.id = ANY(p_order_ids)),
    CASE p_order_type WHEN 'pickup' THEN 'Mang về' WHEN 'delivery' THEN 'Ship' ELSE '—' END)
$function$
