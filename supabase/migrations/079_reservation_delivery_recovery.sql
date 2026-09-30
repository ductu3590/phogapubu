-- BL-4 Task 3: recovery có kiểm soát cho outbox Thông báo nội bộ.
-- Delivery cũ không có snapshot đáng tin cậy nên không được tự gửi lại.

ALTER TABLE public.reservation_notification_deliveries
  ADD COLUMN IF NOT EXISTS queued_at timestamptz,
  ADD COLUMN IF NOT EXISTS recovery_version integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS message_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS relay_payload jsonb,
  ADD COLUMN IF NOT EXISTS requeue_count integer NOT NULL DEFAULT 0;

UPDATE public.reservation_notification_deliveries
SET queued_at = created_at
WHERE queued_at IS NULL AND status = 'queued';

ALTER TABLE public.store_reservation_notification_channels
  ADD COLUMN IF NOT EXISTS retry_contract_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS retry_contract_evidence text,
  ADD COLUMN IF NOT EXISTS retry_contract_version integer;

-- Thay nhóm đích hoặc thay phiên bản giao kèo relay thì phải xác minh lại trước
-- khi một delivery lỗi được phép gửi lại.
CREATE OR REPLACE FUNCTION public.clear_reservation_retry_contract_on_channel_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.destination_group_id IS DISTINCT FROM OLD.destination_group_id
     OR NEW.provider IS DISTINCT FROM OLD.provider THEN
    NEW.retry_contract_verified_at := NULL;
    NEW.retry_contract_evidence := NULL;
    NEW.retry_contract_version := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_clear_reservation_retry_contract_on_channel_change
  ON public.store_reservation_notification_channels;
CREATE TRIGGER trg_clear_reservation_retry_contract_on_channel_change
  BEFORE UPDATE OF destination_group_id, provider ON public.store_reservation_notification_channels
  FOR EACH ROW EXECUTE FUNCTION public.clear_reservation_retry_contract_on_channel_change();

CREATE TABLE IF NOT EXISTS public.reservation_notification_recovery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  delivery_id uuid NOT NULL REFERENCES public.reservation_notification_deliveries(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 300),
  from_status text NOT NULL,
  from_updated_at timestamptz NOT NULL,
  to_updated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reservation_notification_recovery_delivery_request_unique UNIQUE(delivery_id, request_id),
  CONSTRAINT reservation_notification_recovery_request_unique UNIQUE(request_id)
);
ALTER TABLE public.reservation_notification_recovery_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reservation_notification_recovery_events FROM PUBLIC, anon, authenticated;
CREATE INDEX IF NOT EXISTS reservation_notification_recovery_delivery_created
  ON public.reservation_notification_recovery_events(delivery_id, created_at DESC);

-- Enqueue snapshot tối thiểu ngay trong transaction delivery; tuyệt đối không lưu phone/note/token.
CREATE OR REPLACE FUNCTION public.enqueue_reservation_owner_notification(p_event_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event public.reservation_events%ROWTYPE;
  v_channel public.store_reservation_notification_channels%ROWTYPE;
  v_reservation public.reservations%ROWTYPE;
  v_delivery_id uuid;
  v_snapshot jsonb;
BEGIN
  SELECT * INTO v_event FROM public.reservation_events WHERE id = p_event_id;
  IF NOT FOUND OR v_event.actor_kind <> 'customer' OR v_event.event_type <> 'created' THEN RETURN NULL; END IF;

  SELECT * INTO v_channel FROM public.store_reservation_notification_channels
  WHERE store_id = v_event.store_id AND provider = 'zca_group' AND is_enabled
    AND length(btrim(destination_group_id)) > 0;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO v_reservation FROM public.reservations
  WHERE id = v_event.reservation_id AND store_id = v_event.store_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_snapshot := jsonb_build_object(
    'version', 1, 'kind', 'owner_new_reservation',
    'customer_name', v_reservation.customer_name,
    'party_size', v_reservation.party_size,
    'arrival_at', v_reservation.arrival_at
  );

  INSERT INTO public.reservation_notification_deliveries(
    store_id, reservation_id, reservation_event_id, recipient_id, kind, status,
    idempotency_key, delivery_provider, destination_group_id, queued_at,
    recovery_version, message_snapshot
  ) VALUES (
    v_event.store_id, v_event.reservation_id, v_event.id, NULL, 'owner_new_reservation', 'queued',
    'reservation-event:' || v_event.id::text || ':owner_zca_group', 'zca_group',
    v_channel.destination_group_id, now(), 1, v_snapshot
  ) ON CONFLICT(idempotency_key) DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
  RETURNING id INTO v_delivery_id;
  RETURN v_delivery_id;
END;
$$;

-- Claim cũ giữ nguyên chữ ký. Worker mới dùng snapshot để freeze body trước khi gửi.
CREATE OR REPLACE FUNCTION public.claim_reservation_zca_notification(p_delivery_id uuid, p_dispatch_token uuid)
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
  SET status = 'action_required', provider_code = 'CHANNEL_DISABLED',
      last_error = 'Kênh thông báo nội bộ đã tắt', updated_at = now()
  WHERE delivery.id = p_delivery_id AND delivery.dispatch_token = p_dispatch_token
    AND delivery.status = 'queued' AND delivery.delivery_provider = 'zca_group'
    AND NOT EXISTS (SELECT 1 FROM public.store_reservation_notification_channels channel
      WHERE channel.store_id = delivery.store_id AND channel.provider = 'zca_group' AND channel.is_enabled
        AND channel.destination_group_id = delivery.destination_group_id);

  UPDATE public.reservation_notification_deliveries delivery
  SET status = 'processing', processing_started_at = now(), last_attempt_at = now(),
      attempt_count = attempt_count + 1, updated_at = now()
  WHERE delivery.id = p_delivery_id AND delivery.dispatch_token = p_dispatch_token
    AND delivery.status = 'queued' AND delivery.delivery_provider = 'zca_group'
    AND EXISTS (SELECT 1 FROM public.store_reservation_notification_channels channel
      WHERE channel.store_id = delivery.store_id AND channel.provider = 'zca_group' AND channel.is_enabled
        AND channel.destination_group_id = delivery.destination_group_id)
  RETURNING delivery.* INTO v_delivery;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT reservation.* INTO v_reservation FROM public.reservations reservation
  WHERE reservation.id = v_delivery.reservation_id AND reservation.store_id = v_delivery.store_id;
  RETURN jsonb_build_object(
    'delivery_id', v_delivery.id, 'store_id', v_delivery.store_id,
    'reservation_id', v_delivery.reservation_id, 'kind', v_delivery.kind,
    'destination_group_id', v_delivery.destination_group_id,
    'customer_name', v_reservation.customer_name, 'party_size', v_reservation.party_size,
    'arrival_at', v_reservation.arrival_at, 'message_snapshot', v_delivery.message_snapshot
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.freeze_reservation_zca_payload(
  p_delivery_id uuid, p_dispatch_token uuid, p_text text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_delivery public.reservation_notification_deliveries%ROWTYPE; v_payload jsonb;
BEGIN
  SELECT * INTO v_delivery FROM public.reservation_notification_deliveries
  WHERE id = p_delivery_id AND dispatch_token = p_dispatch_token AND status = 'processing'
    AND delivery_provider = 'zca_group' FOR UPDATE;
  IF NOT FOUND OR v_delivery.recovery_version <> 1 OR v_delivery.message_snapshot IS NULL THEN RETURN NULL; END IF;
  IF v_delivery.relay_payload IS NOT NULL THEN RETURN v_delivery.relay_payload; END IF;
  IF p_text IS NULL OR length(btrim(p_text)) = 0 OR length(p_text) > 2000 THEN RAISE EXCEPTION 'Nội dung relay không hợp lệ'; END IF;
  v_payload := jsonb_build_object('version', 1, 'notification_id', v_delivery.id,
    'store_id', v_delivery.store_id, 'group_id', v_delivery.destination_group_id, 'text', p_text);
  UPDATE public.reservation_notification_deliveries SET relay_payload = v_payload, updated_at = now()
  WHERE id = v_delivery.id AND dispatch_token = p_dispatch_token AND status = 'processing';
  RETURN v_payload;
END;
$$;

CREATE OR REPLACE FUNCTION public.requeue_reservation_zca_notification(
  p_store_id uuid, p_delivery_id uuid, p_expected_updated_at timestamptz,
  p_request_id uuid, p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid(); v_delivery public.reservation_notification_deliveries%ROWTYPE;
  v_channel public.store_reservation_notification_channels%ROWTYPE;
  v_reservation public.reservations%ROWTYPE;
  v_event public.reservation_notification_recovery_events%ROWTYPE; v_now timestamptz := now();
  v_booking_found boolean := false;
BEGIN
  IF p_request_id IS NULL OR p_expected_updated_at IS NULL OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 300 THEN
    RAISE EXCEPTION 'Mã thao tác hoặc lý do gửi lại không hợp lệ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mevo_operators op
    WHERE op.user_id = v_actor AND op.role = 'mevo_superadmin' AND op.store_id IS NULL AND op.is_active) THEN
    RAISE EXCEPTION 'Chỉ MEVO superadmin được gửi lại thông báo nội bộ';
  END IF;
  SELECT * INTO v_event FROM public.reservation_notification_recovery_events WHERE request_id = p_request_id;
  IF FOUND THEN
    IF v_event.delivery_id = p_delivery_id AND v_event.reason = btrim(p_reason)
       AND v_event.from_updated_at = p_expected_updated_at THEN
      RETURN jsonb_build_object('ok', true, 'already', true, 'delivery_id', p_delivery_id, 'status', 'queued');
    END IF;
    RAISE EXCEPTION 'Mã thao tác đã dùng cho dữ liệu khác';
  END IF;

  SELECT * INTO v_channel FROM public.store_reservation_notification_channels
  WHERE store_id = p_store_id FOR UPDATE;
  -- Lấy khóa theo thứ tự channel -> booking -> delivery, để recovery không chen
  -- với thay đổi booking và không đảo khóa giữa hai thao tác gửi lại.
  SELECT * INTO v_delivery FROM public.reservation_notification_deliveries
  WHERE id = p_delivery_id AND store_id = p_store_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy delivery thông báo nội bộ'; END IF;
  IF v_delivery.reservation_id IS NOT NULL THEN
    SELECT * INTO v_reservation FROM public.reservations
    WHERE id = v_delivery.reservation_id AND store_id = p_store_id FOR UPDATE;
    v_booking_found := FOUND;
  END IF;
  SELECT * INTO v_delivery FROM public.reservation_notification_deliveries
  WHERE id = p_delivery_id AND store_id = p_store_id FOR UPDATE;
  IF v_delivery.updated_at <> p_expected_updated_at THEN RAISE EXCEPTION 'Delivery đã thay đổi, vui lòng tải lại'; END IF;
  IF v_delivery.delivery_provider <> 'zca_group' OR v_delivery.recovery_version <> 1
     OR v_delivery.message_snapshot IS NULL THEN RAISE EXCEPTION 'Delivery cũ không có payload an toàn để gửi lại'; END IF;
  IF v_delivery.requeue_count >= 3 THEN RAISE EXCEPTION 'Đã đạt giới hạn gửi lại'; END IF;
  IF v_delivery.created_at < v_now - interval '24 hours' THEN RAISE EXCEPTION 'Delivery đã quá 24 giờ, cần kiểm tra thủ công'; END IF;
  IF v_delivery.status NOT IN ('failed', 'action_required')
     AND NOT (v_delivery.status IN ('queued', 'processing') AND COALESCE(v_delivery.processing_started_at, v_delivery.queued_at, v_delivery.updated_at) < v_now - interval '120 seconds') THEN
    RAISE EXCEPTION 'Delivery chưa ở trạng thái có thể gửi lại';
  END IF;
  IF v_delivery.status IN ('failed', 'action_required') AND v_delivery.updated_at > v_now - interval '60 seconds' THEN
    RAISE EXCEPTION 'Vui lòng chờ 60 giây trước khi gửi lại';
  END IF;
  IF v_channel.provider <> 'zca_group' OR NOT v_channel.is_enabled
     OR v_channel.destination_group_id IS DISTINCT FROM v_delivery.destination_group_id
     OR v_channel.retry_contract_verified_at IS NULL OR length(btrim(COALESCE(v_channel.retry_contract_evidence,''))) = 0
     OR v_channel.retry_contract_version IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Kênh chưa có bằng chứng relay cho phép gửi lại';
  END IF;
  IF v_delivery.kind = 'owner_new_reservation' AND (NOT v_booking_found OR v_reservation.status <> 'pending' OR v_reservation.arrival_at <= v_now) THEN
    RAISE EXCEPTION 'Đặt bàn không còn chờ xử lý hoặc đã quá giờ';
  END IF;

  UPDATE public.reservation_notification_deliveries
  SET status = 'queued', dispatch_token = gen_random_uuid(), queued_at = v_now,
      processing_started_at = NULL, provider_code = NULL, last_error = NULL,
      requeue_count = requeue_count + 1, updated_at = v_now
  WHERE id = v_delivery.id;
  INSERT INTO public.reservation_notification_recovery_events(
    store_id, delivery_id, request_id, actor_id, reason, from_status, from_updated_at, to_updated_at
  ) VALUES (p_store_id, v_delivery.id, p_request_id, v_actor, btrim(p_reason),
    v_delivery.status, v_delivery.updated_at, v_now);
  RETURN jsonb_build_object('ok', true, 'already', false, 'delivery_id', v_delivery.id, 'status', 'queued');
END;
$$;

REVOKE ALL ON FUNCTION public.freeze_reservation_zca_payload(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.freeze_reservation_zca_payload(uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.requeue_reservation_zca_notification(uuid, uuid, timestamptz, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.requeue_reservation_zca_notification(uuid, uuid, timestamptz, uuid, text) TO authenticated;

CREATE INDEX IF NOT EXISTS reservation_notification_deliveries_recovery_queue
  ON public.reservation_notification_deliveries(store_id, created_at DESC)
  WHERE delivery_provider = 'zca_group' AND status IN ('queued', 'processing', 'failed', 'action_required');
NOTIFY pgrst, 'reload schema';
