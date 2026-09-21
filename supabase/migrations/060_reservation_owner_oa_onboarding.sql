-- BL-2B Task 2: tạo/claim mã liên kết chủ quán với OA UID theo đúng app + OA + store.

CREATE UNIQUE INDEX IF NOT EXISTS zalo_oa_onboarding_challenges_store_message_unique
  ON public.zalo_oa_onboarding_challenges(store_id, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS zalo_oa_onboarding_challenges_active_code
  ON public.zalo_oa_onboarding_challenges(store_id, code_hash, expires_at DESC)
  WHERE claimed_at IS NULL;

CREATE OR REPLACE FUNCTION public.create_zalo_oa_onboarding_challenge(
  p_store_id uuid,
  p_code_hash text,
  p_created_by uuid,
  p_expires_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_oa_id text;
  v_recipient_id uuid;
  v_recipient_oa_id text;
  v_challenge_id uuid;
BEGIN
  IF p_code_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Hash mã kết nối không hợp lệ';
  END IF;
  IF p_expires_at <= now() OR p_expires_at > now() + interval '20 minutes' THEN
    RAISE EXCEPTION 'Thời hạn mã kết nối không hợp lệ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_created_by) THEN
    RAISE EXCEPTION 'Người tạo mã kết nối không tồn tại';
  END IF;

  SELECT btrim(store_row.zalo_oa_id)
  INTO v_oa_id
  FROM public.stores store_row
  WHERE store_row.id = p_store_id
    AND length(btrim(store_row.zalo_oa_id)) > 0
  FOR UPDATE;

  IF v_oa_id IS NULL THEN
    RAISE EXCEPTION 'Quán chưa cấu hình Zalo OA ID';
  END IF;

  SELECT recipient.id, recipient.oa_id
  INTO v_recipient_id, v_recipient_oa_id
  FROM public.store_zalo_notification_recipients recipient
  WHERE recipient.store_id = p_store_id
    AND recipient.purpose = 'reservation_owner_alert';

  IF v_recipient_id IS NULL THEN
    INSERT INTO public.store_zalo_notification_recipients(
      store_id, purpose, oa_id, operator_user_id, status
    ) VALUES (
      p_store_id, 'reservation_owner_alert', v_oa_id, p_created_by, 'pending'
    )
    RETURNING id INTO v_recipient_id;
  ELSIF v_recipient_oa_id <> v_oa_id THEN
    UPDATE public.store_zalo_notification_recipients
    SET oa_id = v_oa_id,
        oa_user_id = NULL,
        operator_user_id = p_created_by,
        status = 'pending',
        verified_at = NULL,
        disabled_at = NULL,
        updated_at = now()
    WHERE id = v_recipient_id;
  END IF;

  -- Mỗi quán chỉ có một mã còn hiệu lực; tạo mã mới vô hiệu mã cũ nhưng không ngắt
  -- recipient đã verified nếu OA ID vẫn giữ nguyên.
  UPDATE public.zalo_oa_onboarding_challenges
  SET claimed_at = now()
  WHERE store_id = p_store_id
    AND purpose = 'reservation_owner_alert'
    AND claimed_at IS NULL;

  INSERT INTO public.zalo_oa_onboarding_challenges(
    store_id, purpose, code_hash, created_by, expires_at, recipient_id
  ) VALUES (
    p_store_id, 'reservation_owner_alert', p_code_hash, p_created_by,
    p_expires_at, v_recipient_id
  )
  RETURNING id INTO v_challenge_id;

  RETURN v_challenge_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_zalo_oa_onboarding_challenge(
  p_store_id uuid,
  p_app_id text,
  p_oa_id text,
  p_oa_user_id text,
  p_message_id text,
  p_code_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_challenge public.zalo_oa_onboarding_challenges%ROWTYPE;
  v_recipient_id uuid;
  v_delivery_ready boolean := false;
BEGIN
  IF length(btrim(coalesce(p_app_id, ''))) = 0
    OR length(btrim(coalesce(p_oa_id, ''))) = 0
    OR length(btrim(coalesce(p_oa_user_id, ''))) = 0
    OR length(btrim(coalesce(p_message_id, ''))) = 0
    OR p_code_hash !~ '^[0-9a-f]{64}$'
  THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  -- Khoá store để hai webhook đồng thời không thể cùng claim hoặc lách replay.
  PERFORM 1
  FROM public.stores store_row
  WHERE store_row.id = p_store_id
  FOR UPDATE;

  IF NOT FOUND OR NOT EXISTS (
    SELECT 1
    FROM public.stores store_row
    JOIN public.store_app_configs app_config ON app_config.store_id = store_row.id
    JOIN public.store_zalo_configs zalo_config ON zalo_config.store_id = store_row.id
    WHERE store_row.id = p_store_id
      AND btrim(store_row.zalo_oa_id) = btrim(p_oa_id)
      AND btrim(app_config.zalo_mini_app_id) = btrim(p_app_id)
      AND zalo_config.is_enabled
      AND length(btrim(zalo_config.zalo_app_secret_key)) > 0
  ) THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  SELECT challenge.*
  INTO v_challenge
  FROM public.zalo_oa_onboarding_challenges challenge
  WHERE challenge.store_id = p_store_id
    AND challenge.provider_message_id = p_message_id
    AND challenge.claimed_at IS NOT NULL
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'status', 'replay',
      'recipient_id', v_challenge.recipient_id
    );
  END IF;

  SELECT challenge.*
  INTO v_challenge
  FROM public.zalo_oa_onboarding_challenges challenge
  WHERE challenge.store_id = p_store_id
    AND challenge.purpose = 'reservation_owner_alert'
    AND challenge.code_hash = p_code_hash
    AND challenge.claimed_at IS NULL
    AND challenge.expires_at > now()
  ORDER BY challenge.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  INSERT INTO public.store_zalo_notification_recipients(
    store_id, purpose, oa_id, oa_user_id, operator_user_id,
    status, verified_at, disabled_at, updated_at
  ) VALUES (
    p_store_id, 'reservation_owner_alert', btrim(p_oa_id), btrim(p_oa_user_id),
    v_challenge.created_by, 'verified', now(), NULL, now()
  )
  ON CONFLICT(store_id, purpose) DO UPDATE
  SET oa_id = EXCLUDED.oa_id,
      oa_user_id = EXCLUDED.oa_user_id,
      operator_user_id = EXCLUDED.operator_user_id,
      status = 'verified',
      verified_at = now(),
      disabled_at = NULL,
      updated_at = now()
  RETURNING id INTO v_recipient_id;

  UPDATE public.zalo_oa_onboarding_challenges
  SET claimed_at = now(),
      recipient_id = v_recipient_id,
      provider_message_id = btrim(p_message_id)
  WHERE id = v_challenge.id;

  SELECT EXISTS (
    SELECT 1
    FROM public.store_zalo_configs config
    WHERE config.store_id = p_store_id
      AND config.is_enabled
      AND length(btrim(config.zalo_oa_access_token)) > 0
      AND length(btrim(config.zalo_app_secret_key)) > 0
  ) INTO v_delivery_ready;

  UPDATE public.reservation_notification_deliveries
  SET recipient_id = v_recipient_id,
      status = CASE WHEN v_delivery_ready THEN 'queued' ELSE 'action_required' END,
      updated_at = now()
  WHERE store_id = p_store_id
    AND kind = 'owner_new_reservation'
    AND status = 'action_required';

  RETURN jsonb_build_object(
    'status', 'claimed',
    'recipient_id', v_recipient_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_zalo_oa_onboarding_challenge(uuid, text, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.claim_zalo_oa_onboarding_challenge(uuid, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_zalo_oa_onboarding_challenge(uuid, text, uuid, timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_zalo_oa_onboarding_challenge(uuid, text, text, text, text, text)
  TO service_role;

NOTIFY pgrst, 'reload schema';
