-- BL-4: store closed blocks a NEW QR session, not a confirmed booking's preorder.
-- Preorder validates its own reservation/arrival rules and is reviewed manually on POS.
CREATE OR REPLACE FUNCTION public.block_new_order_when_store_closed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.order_source IS DISTINCT FROM 'reservation_preorder'
     AND NOT public.store_accepting_now(NEW.store_id)
     AND (NEW.session_id IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.orders prior
       WHERE prior.session_id = NEW.session_id
     )) THEN
    RAISE EXCEPTION 'Quán đang tạm nghỉ hoặc ngoài giờ phục vụ';
  END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
