-- BL-4: create_order mở session trước store_accepting_now, nên session vừa tạo bị nhầm
-- là session cũ trong ân hạn 2 giờ. Chặn ở INSERT đầu tiên; exception rollback cả session mới.
CREATE OR REPLACE FUNCTION public.block_new_order_when_store_closed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.store_accepting_now(NEW.store_id)
     AND (NEW.session_id IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.orders prior
       WHERE prior.session_id = NEW.session_id
     )) THEN
    RAISE EXCEPTION 'Quán đang tạm nghỉ hoặc ngoài giờ phục vụ';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_new_order_when_store_closed ON public.orders;
CREATE TRIGGER trg_block_new_order_when_store_closed
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.block_new_order_when_store_closed();

NOTIFY pgrst, 'reload schema';
