-- BL-2B ZCA Task 1: channel nhóm Zalo theo quán và outbox relay.
-- Không gửi mạng trong transaction reservation; relay chỉ được gọi sau khi service_role claim delivery.

CREATE TABLE public.store_reservation_notification_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL UNIQUE REFERENCES public.stores(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'none'
    CHECK (provider IN ('none', 'zca_group', 'zalo_oa')),
  is_enabled boolean NOT NULL DEFAULT false,
  destination_group_id text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_reservation_notification_channel_destination CHECK (
    (provider = 'zca_group' AND length(btrim(destination_group_id)) > 0)
    OR (provider IN ('none', 'zalo_oa') AND destination_group_id IS NULL)
  ),
  CONSTRAINT store_reservation_notification_channel_id_store_unique UNIQUE (id, store_id)
);

ALTER TABLE public.store_reservation_notification_channels ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_reservation_notification_channels FROM PUBLIC, anon, authenticated;
CREATE INDEX store_reservation_notification_channels_updated_by
  ON public.store_reservation_notification_channels(updated_by)
  WHERE updated_by IS NOT NULL;

ALTER TABLE public.reservation_notification_deliveries
  ADD COLUMN IF NOT EXISTS delivery_provider text;
ALTER TABLE public.reservation_notification_deliveries
  ADD COLUMN IF NOT EXISTS destination_group_id text;

UPDATE public.reservation_notification_deliveries
SET delivery_provider = 'zalo_oa'
WHERE delivery_provider IS NULL;

ALTER TABLE public.reservation_notification_deliveries
  ALTER COLUMN delivery_provider SET DEFAULT 'zalo_oa';
ALTER TABLE public.reservation_notification_deliveries
  ALTER COLUMN delivery_provider SET NOT NULL;

ALTER TABLE public.reservation_notification_deliveries
  DROP CONSTRAINT IF EXISTS reservation_notification_ready_recipient;
ALTER TABLE public.reservation_notification_deliveries
  DROP CONSTRAINT IF EXISTS reservation_notification_delivery_target;
ALTER TABLE public.reservation_notification_deliveries
  ADD CONSTRAINT reservation_notification_delivery_provider
    CHECK (delivery_provider IN ('zalo_oa', 'zca_group'));
ALTER TABLE public.reservation_notification_deliveries
  ADD CONSTRAINT reservation_notification_delivery_target
    CHECK (
      (delivery_provider = 'zalo_oa'
        AND destination_group_id IS NULL
        AND (status = 'action_required' OR recipient_id IS NOT NULL))
      OR (delivery_provider = 'zca_group' AND length(btrim(destination_group_id)) > 0)
    );

CREATE INDEX reservation_notification_deliveries_zca_queued
  ON public.reservation_notification_deliveries(store_id, created_at)
  WHERE delivery_provider = 'zca_group' AND status IN ('queued', 'failed', 'action_required');

CREATE OR REPLACE FUNCTION public.enqueue_reservation_owner_notification(p_event_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event public.reservation_events%ROWTYPE;
  v_channel public.store_reservation_notification_channels%ROWTYPE;
  v_delivery_id uuid;
BEGIN
  SELECT * INTO v_event
  FROM public.reservation_events
  WHERE id = p_event_id;

  IF NOT FOUND OR v_event.actor_kind <> 'customer' OR v_event.event_type <> 'created' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_channel
  FROM public.store_reservation_notification_channels
  WHERE store_id = v_event.store_id
    AND provider = 'zca_group'
    AND is_enabled
    AND length(btrim(destination_group_id)) > 0;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.reservation_notification_deliveries(
    store_id, reservation_id, reservation_event_id, recipient_id,
    kind, status, idempotency_key, delivery_provider, destination_group_id
  ) VALUES (
    v_event.store_id, v_event.reservation_id, v_event.id, NULL,
    'owner_new_reservation', 'queued',
    'reservation-event:' || v_event.id::text || ':owner_zca_group',
    'zca_group', v_channel.destination_group_id
  )
  ON CONFLICT(idempotency_key) DO UPDATE
    SET idempotency_key = EXCLUDED.idempotency_key
  RETURNING id INTO v_delivery_id;

  RETURN v_delivery_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_reservation_zca_notification(
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
BEGIN
  UPDATE public.reservation_notification_deliveries delivery
  SET status = 'action_required',
      provider_code = 'CHANNEL_DISABLED',
      last_error = 'Kênh cảnh báo nhóm Zalo đã tắt',
      updated_at = now()
  WHERE delivery.id = p_delivery_id
    AND delivery.dispatch_token = p_dispatch_token
    AND delivery.status = 'queued'
    AND delivery.delivery_provider = 'zca_group'
    AND NOT EXISTS (
      SELECT 1
      FROM public.store_reservation_notification_channels channel
      WHERE channel.store_id = delivery.store_id
        AND channel.provider = 'zca_group'
        AND channel.is_enabled
    );

  UPDATE public.reservation_notification_deliveries delivery
  SET status = 'processing',
      processing_started_at = now(),
      last_attempt_at = now(),
      attempt_count = attempt_count + 1,
      updated_at = now()
  WHERE delivery.id = p_delivery_id
    AND delivery.dispatch_token = p_dispatch_token
    AND delivery.status = 'queued'
    AND delivery.delivery_provider = 'zca_group'
    AND EXISTS (
      SELECT 1
      FROM public.store_reservation_notification_channels channel
      WHERE channel.store_id = delivery.store_id
        AND channel.provider = 'zca_group'
        AND channel.is_enabled
    )
  RETURNING delivery.* INTO v_delivery;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT reservation.* INTO v_reservation
  FROM public.reservations reservation
  WHERE reservation.id = v_delivery.reservation_id
    AND reservation.store_id = v_delivery.store_id;

  RETURN jsonb_build_object(
    'delivery_id', v_delivery.id,
    'store_id', v_delivery.store_id,
    'reservation_id', v_delivery.reservation_id,
    'kind', v_delivery.kind,
    'destination_group_id', v_delivery.destination_group_id,
    'customer_name', v_reservation.customer_name,
    'party_size', v_reservation.party_size,
    'arrival_at', v_reservation.arrival_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_reservation_zca_notification(
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
    AND delivery_provider = 'zca_group'
    AND status = 'processing';

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_reservation_zca_notification(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.finish_reservation_zca_notification(uuid, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_reservation_zca_notification(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_reservation_zca_notification(uuid, uuid, text, text, text)
  TO service_role;

NOTIFY pgrst, 'reload schema';
