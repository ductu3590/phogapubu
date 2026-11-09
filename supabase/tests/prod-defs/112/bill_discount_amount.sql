CREATE OR REPLACE FUNCTION public.bill_discount_amount(p_subtotal bigint, p_type text, p_value integer)
 RETURNS bigint
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_type IS NULL THEN RETURN 0; END IF;
  IF p_type = 'amount' THEN RETURN p_value; END IF;
  IF p_type = 'percent' THEN
    RETURN round(p_subtotal::numeric * p_value::numeric / 100)::bigint;
  END IF;
  RAISE EXCEPTION 'Loại giảm giá không hợp lệ';
END $function$
