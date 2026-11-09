CREATE OR REPLACE FUNCTION public.is_store_pos_operator(p_store_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from mevo_operators
     where user_id = auth.uid()
       and is_active
       and role in ('store_owner', 'store_cashier')
       and store_id = p_store_id
  );
$function$
