-- BL-4 Task 3: một đường dispatch cho insert queued và requeue token mới.
-- URL chỉ nằm ở database setting; không copy endpoint production vào migration.
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.dispatch_reservation_zca_delivery_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, pg_temp
AS $$
DECLARE v_url text;
BEGIN
  IF NEW.delivery_provider <> 'zca_group' OR NEW.status <> 'queued'
     OR (TG_OP = 'UPDATE' AND NEW.dispatch_token = OLD.dispatch_token) THEN
    RETURN NEW;
  END IF;
  v_url := NULLIF(current_setting('app.settings.reservation_zca_notify_url', true), '');
  IF v_url IS NULL THEN
    -- Không rollback booking/outbox; token vẫn còn để MEVO cấu hình URL rồi requeue.
    UPDATE public.reservation_notification_deliveries
    SET provider_code = 'DISPATCH_URL_MISSING', last_error = 'Chưa cấu hình URL dispatch', updated_at = now()
    WHERE id = NEW.id AND status = 'queued' AND dispatch_token = NEW.dispatch_token;
    RETURN NEW;
  END IF;
  PERFORM net.http_post(
    url := v_url,
    body := jsonb_build_object('delivery_id', NEW.id, 'dispatch_token', NEW.dispatch_token),
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 20000
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  UPDATE public.reservation_notification_deliveries
  SET provider_code = 'DISPATCH_ENQUEUE_FAILED', last_error = 'Không xếp được request dispatch', updated_at = now()
  WHERE id = NEW.id AND status = 'queued' AND dispatch_token = NEW.dispatch_token;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dispatch_reservation_zca_delivery_webhook
  ON public.reservation_notification_deliveries;
CREATE TRIGGER trg_dispatch_reservation_zca_delivery_webhook
  AFTER INSERT OR UPDATE OF status, dispatch_token ON public.reservation_notification_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_reservation_zca_delivery_webhook();
REVOKE ALL ON FUNCTION public.dispatch_reservation_zca_delivery_webhook() FROM PUBLIC, anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
