-- BL-2B Task 1: outbox thông báo booking mới cho chủ quán qua đúng Zalo OA.
-- Không gửi mạng trong transaction tạo reservation; provider lỗi không được rollback booking.

CREATE TABLE IF NOT EXISTS public.store_zalo_notification_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose = 'reservation_owner_alert'),
  oa_id text NOT NULL CHECK (length(btrim(oa_id)) > 0),
  oa_user_id text,
  operator_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'disabled')),
  verified_at timestamptz,
  disabled_at timestamptz,
  last_tested_at timestamptz,
  last_test_status text CHECK (last_test_status IS NULL OR last_test_status IN ('sent', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_zalo_notification_recipient_identity CHECK (
    (status = 'pending' AND oa_user_id IS NULL AND verified_at IS NULL)
    OR (status IN ('verified', 'disabled') AND length(btrim(oa_user_id)) > 0 AND verified_at IS NOT NULL)
  ),
  CONSTRAINT store_zalo_notification_recipient_store_purpose_unique UNIQUE (store_id, purpose),
  CONSTRAINT store_zalo_notification_recipient_id_store_unique UNIQUE (id, store_id)
);

CREATE TABLE IF NOT EXISTS public.zalo_oa_onboarding_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose = 'reservation_owner_alert'),
  code_hash text NOT NULL CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  expires_at timestamptz NOT NULL,
  claimed_at timestamptz,
  recipient_id uuid,
  provider_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT zalo_oa_challenge_expiry CHECK (expires_at > created_at),
  CONSTRAINT zalo_oa_challenge_recipient_store_fkey
    FOREIGN KEY (recipient_id, store_id)
    REFERENCES public.store_zalo_notification_recipients(id, store_id) ON DELETE SET NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.reservation_events'::regclass
      AND conname = 'reservation_events_id_store_unique'
  ) THEN
    ALTER TABLE public.reservation_events
      ADD CONSTRAINT reservation_events_id_store_unique UNIQUE (id, store_id);
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.reservation_notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  reservation_id uuid,
  reservation_event_id uuid,
  recipient_id uuid,
  kind text NOT NULL CHECK (kind IN ('owner_new_reservation', 'owner_test')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'sent', 'failed', 'action_required')),
  idempotency_key text NOT NULL UNIQUE CHECK (length(btrim(idempotency_key)) > 0),
  dispatch_token uuid NOT NULL DEFAULT gen_random_uuid(),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  processing_started_at timestamptz,
  last_attempt_at timestamptz,
  provider_code text,
  provider_message_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reservation_notification_reservation_store_fkey
    FOREIGN KEY (reservation_id, store_id)
    REFERENCES public.reservations(id, store_id) ON DELETE CASCADE,
  CONSTRAINT reservation_notification_event_store_fkey
    FOREIGN KEY (reservation_event_id, store_id)
    REFERENCES public.reservation_events(id, store_id) ON DELETE CASCADE,
  CONSTRAINT reservation_notification_recipient_store_fkey
    FOREIGN KEY (recipient_id, store_id)
    REFERENCES public.store_zalo_notification_recipients(id, store_id) ON DELETE RESTRICT,
  CONSTRAINT reservation_notification_kind_payload CHECK (
    (kind = 'owner_new_reservation' AND reservation_id IS NOT NULL AND reservation_event_id IS NOT NULL)
    OR (kind = 'owner_test' AND reservation_event_id IS NULL)
  ),
  CONSTRAINT reservation_notification_ready_recipient CHECK (
    status = 'action_required' OR recipient_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS reservation_notification_deliveries_store_created
  ON public.reservation_notification_deliveries(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reservation_notification_deliveries_status_created
  ON public.reservation_notification_deliveries(status, created_at)
  WHERE status IN ('queued', 'failed', 'action_required');
CREATE INDEX IF NOT EXISTS zalo_oa_onboarding_challenges_store_created
  ON public.zalo_oa_onboarding_challenges(store_id, created_at DESC);

ALTER TABLE public.store_zalo_notification_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zalo_oa_onboarding_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_notification_deliveries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.store_zalo_notification_recipients FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.zalo_oa_onboarding_challenges FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.reservation_notification_deliveries FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_reservation_owner_notification(p_event_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event public.reservation_events%ROWTYPE;
  v_recipient_id uuid;
  v_ready boolean := false;
  v_delivery_id uuid;
BEGIN
  SELECT * INTO v_event
  FROM public.reservation_events
  WHERE id = p_event_id;

  IF NOT FOUND OR v_event.actor_kind <> 'customer' OR v_event.event_type <> 'created' THEN
    RETURN NULL;
  END IF;

  SELECT recipient.id INTO v_recipient_id
  FROM public.store_zalo_notification_recipients recipient
  JOIN public.stores store_row
    ON store_row.id = recipient.store_id
   AND store_row.zalo_oa_id = recipient.oa_id
  WHERE recipient.store_id = v_event.store_id
    AND recipient.purpose = 'reservation_owner_alert'
    AND recipient.status = 'verified'
  LIMIT 1;

  IF v_recipient_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.store_zalo_configs config
      WHERE config.store_id = v_event.store_id
        AND config.is_enabled
        AND length(btrim(config.zalo_oa_access_token)) > 0
        AND length(btrim(config.zalo_app_secret_key)) > 0
    ) INTO v_ready;
  END IF;

  INSERT INTO public.reservation_notification_deliveries(
    store_id, reservation_id, reservation_event_id, recipient_id,
    kind, status, idempotency_key
  ) VALUES (
    v_event.store_id, v_event.reservation_id, v_event.id, v_recipient_id,
    'owner_new_reservation',
    CASE WHEN v_ready THEN 'queued' ELSE 'action_required' END,
    'reservation-event:' || v_event.id::text || ':owner_new_reservation'
  )
  ON CONFLICT(idempotency_key) DO UPDATE
    SET idempotency_key = EXCLUDED.idempotency_key
  RETURNING id INTO v_delivery_id;

  RETURN v_delivery_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_reservation_owner_notification_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.enqueue_reservation_owner_notification(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_reservation_owner_notification
  ON public.reservation_events;
CREATE TRIGGER trg_enqueue_reservation_owner_notification
  AFTER INSERT ON public.reservation_events
  FOR EACH ROW
  WHEN (NEW.actor_kind = 'customer' AND NEW.event_type = 'created')
  EXECUTE FUNCTION public.enqueue_reservation_owner_notification_trigger();

CREATE OR REPLACE FUNCTION public.claim_reservation_owner_notification(
  p_delivery_id uuid,
  p_dispatch_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_delivery public.reservation_notification_deliveries%ROWTYPE;
  v_reservation public.reservations%ROWTYPE;
  v_oa_user_id text;
  v_oa_id text;
  v_access_token text;
BEGIN
  UPDATE public.reservation_notification_deliveries delivery
  SET status = 'processing',
      processing_started_at = now(),
      last_attempt_at = now(),
      attempt_count = attempt_count + 1,
      updated_at = now()
  WHERE delivery.id = p_delivery_id
    AND delivery.dispatch_token = p_dispatch_token
    AND delivery.status = 'queued'
    AND EXISTS (
      SELECT 1
      FROM public.store_zalo_notification_recipients recipient
      JOIN public.stores store_row
        ON store_row.id = recipient.store_id
       AND store_row.zalo_oa_id = recipient.oa_id
      JOIN public.store_zalo_configs config ON config.store_id = recipient.store_id
      WHERE recipient.id = delivery.recipient_id
        AND recipient.store_id = delivery.store_id
        AND recipient.status = 'verified'
        AND config.is_enabled
        AND length(btrim(config.zalo_oa_access_token)) > 0
        AND length(btrim(config.zalo_app_secret_key)) > 0
    )
  RETURNING delivery.* INTO v_delivery;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT reservation.* INTO v_reservation
  FROM public.reservations reservation
  WHERE reservation.id = v_delivery.reservation_id
    AND reservation.store_id = v_delivery.store_id;

  SELECT recipient.oa_user_id, recipient.oa_id, config.zalo_oa_access_token
  INTO v_oa_user_id, v_oa_id, v_access_token
  FROM public.store_zalo_notification_recipients recipient
  JOIN public.store_zalo_configs config ON config.store_id = recipient.store_id
  WHERE recipient.id = v_delivery.recipient_id
    AND recipient.store_id = v_delivery.store_id;

  RETURN jsonb_build_object(
    'delivery_id', v_delivery.id,
    'store_id', v_delivery.store_id,
    'reservation_id', v_delivery.reservation_id,
    'kind', v_delivery.kind,
    'oa_id', v_oa_id,
    'oa_user_id', v_oa_user_id,
    'oa_access_token', v_access_token,
    'customer_name', v_reservation.customer_name,
    'customer_phone', v_reservation.customer_phone,
    'party_size', v_reservation.party_size,
    'arrival_at', v_reservation.arrival_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_reservation_owner_notification(
  p_delivery_id uuid,
  p_dispatch_token uuid,
  p_status text,
  p_provider_code text,
  p_provider_detail text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_status NOT IN ('sent', 'failed', 'action_required') THEN
    RAISE EXCEPTION 'Trạng thái kết thúc thông báo không hợp lệ';
  END IF;

  UPDATE public.reservation_notification_deliveries
  SET status = p_status,
      provider_code = NULLIF(btrim(p_provider_code), ''),
      provider_message_id = CASE WHEN p_status = 'sent' THEN NULLIF(btrim(p_provider_detail), '') ELSE NULL END,
      last_error = CASE WHEN p_status <> 'sent' THEN NULLIF(btrim(p_provider_detail), '') ELSE NULL END,
      sent_at = CASE WHEN p_status = 'sent' THEN now() ELSE NULL END,
      updated_at = now()
  WHERE id = p_delivery_id
    AND dispatch_token = p_dispatch_token
    AND status = 'processing';

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_reservation_owner_notification(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.enqueue_reservation_owner_notification_trigger()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.claim_reservation_owner_notification(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.finish_reservation_owner_notification(uuid, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.claim_reservation_owner_notification(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_reservation_owner_notification(uuid, uuid, text, text, text)
  TO service_role;

NOTIFY pgrst, 'reload schema';
