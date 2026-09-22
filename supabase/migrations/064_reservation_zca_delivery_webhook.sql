-- BL-2B ZCA Task 4: Database Webhook bền vững cho outbox nhóm Zalo.
-- Chỉ đưa hai UUID không nhạy cảm vào Function; Function sẽ claim rồi tự lấy dữ liệu tối thiểu.

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.dispatch_reservation_zca_delivery_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, pg_temp
AS $$
BEGIN
  IF NEW.delivery_provider = 'zca_group' AND NEW.status = 'queued' THEN
    PERFORM net.http_post(
      url := 'https://dlkgdpexjtyynbotkwka.supabase.co/functions/v1/reservation-zca-notify',
      body := jsonb_build_object(
        'delivery_id', NEW.id,
        'dispatch_token', NEW.dispatch_token
      ),
      headers := '{"Content-Type":"application/json"}'::jsonb,
      timeout_milliseconds := 20000
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dispatch_reservation_zca_delivery_webhook
  ON public.reservation_notification_deliveries;
CREATE TRIGGER trg_dispatch_reservation_zca_delivery_webhook
  AFTER INSERT ON public.reservation_notification_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION public.dispatch_reservation_zca_delivery_webhook();

REVOKE ALL ON FUNCTION public.dispatch_reservation_zca_delivery_webhook()
  FROM PUBLIC, anon, authenticated, service_role;
