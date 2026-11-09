CREATE OR REPLACE FUNCTION public.session_unpaid_subtotal(p_session_id uuid)
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(sum(o.total_amount), 0)::bigint
    FROM public.orders o
   WHERE o.session_id = p_session_id
     AND o.status <> 'cancelled'
     AND o.payment_received_at IS NULL;
$function$
