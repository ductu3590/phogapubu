CREATE OR REPLACE FUNCTION public.recompute_order_total(p_order_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total integer;
BEGIN
  SELECT COALESCE(SUM(
    (
      oi.item_price + COALESCE((
        SELECT SUM(COALESCE((topping->>'price')::integer, 0))
        FROM jsonb_array_elements(COALESCE(oi.selected_toppings, '[]'::jsonb)) AS topping
      ), 0)
    ) * oi.quantity
  ), 0)
  INTO v_total
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id
    AND oi.void_type IS NULL;

  UPDATE public.orders
  SET total_amount = v_total,
      payment_amount = v_total,
      updated_at = now()
  WHERE id = p_order_id;

  RETURN v_total;
END;
$function$
