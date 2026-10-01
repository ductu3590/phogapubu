-- Store the internal Edge Function URL in a private table because Supabase SQL Editor
-- does not grant ALTER DATABASE on arbitrary app.settings.* parameters.
CREATE SCHEMA IF NOT EXISTS mevo_private;
REVOKE ALL ON SCHEMA mevo_private FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS mevo_private.runtime_settings (
  setting_key text PRIMARY KEY,
  setting_value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE mevo_private.runtime_settings FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dispatch_reservation_zca_delivery_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, mevo_private, pg_temp
AS $$
DECLARE v_url text;
BEGIN
  IF NEW.delivery_provider <> 'zca_group' OR NEW.status <> 'queued'
     OR (TG_OP = 'UPDATE' AND NEW.dispatch_token = OLD.dispatch_token) THEN
    RETURN NEW;
  END IF;

  SELECT NULLIF(btrim(setting_value), '') INTO v_url
  FROM mevo_private.runtime_settings
  WHERE setting_key = 'reservation_zca_notify_url';

  IF v_url IS NULL THEN
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

REVOKE ALL ON FUNCTION public.dispatch_reservation_zca_delivery_webhook() FROM PUBLIC, anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
