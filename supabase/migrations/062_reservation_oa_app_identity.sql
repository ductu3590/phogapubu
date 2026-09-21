-- 062 — OA webhook app_id là app cha tích hợp OA, không phải Mini App ID của quán.
-- Giữ nguyên store/OA/replay isolation; chỉ đổi nguồn định danh app trong bước xác minh.

create or replace function public.claim_zalo_oa_onboarding_challenge(
  p_store_id uuid,
  p_app_id text,
  p_oa_id text,
  p_oa_user_id text,
  p_message_id text,
  p_code_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_challenge public.zalo_oa_onboarding_challenges%rowtype;
  v_recipient_id uuid;
  v_delivery_ready boolean := false;
begin
  if length(btrim(coalesce(p_app_id, ''))) = 0
    or length(btrim(coalesce(p_oa_id, ''))) = 0
    or length(btrim(coalesce(p_oa_user_id, ''))) = 0
    or length(btrim(coalesce(p_message_id, ''))) = 0
    or p_code_hash !~ '^[0-9a-f]{64}$'
  then
    return jsonb_build_object('status', 'invalid');
  end if;

  perform 1
  from public.stores store_row
  where store_row.id = p_store_id
  for update;

  if not found or not exists (
    select 1
    from public.stores store_row
    join public.store_zalo_configs zalo_config on zalo_config.store_id = store_row.id
    where store_row.id = p_store_id
      and btrim(store_row.zalo_oa_id) = btrim(p_oa_id)
      and btrim(zalo_config.zalo_oa_app_id) = btrim(p_app_id)
      and zalo_config.is_enabled
      and length(btrim(zalo_config.zalo_app_secret_key)) > 0
  ) then
    return jsonb_build_object('status', 'invalid');
  end if;

  select challenge.*
  into v_challenge
  from public.zalo_oa_onboarding_challenges challenge
  where challenge.store_id = p_store_id
    and challenge.provider_message_id = p_message_id
    and challenge.claimed_at is not null
  limit 1;

  if found then
    return jsonb_build_object(
      'status', 'replay',
      'recipient_id', v_challenge.recipient_id
    );
  end if;

  select challenge.*
  into v_challenge
  from public.zalo_oa_onboarding_challenges challenge
  where challenge.store_id = p_store_id
    and challenge.purpose = 'reservation_owner_alert'
    and challenge.code_hash = p_code_hash
    and challenge.claimed_at is null
    and challenge.expires_at > now()
  order by challenge.created_at desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  insert into public.store_zalo_notification_recipients(
    store_id, purpose, oa_id, oa_user_id, operator_user_id,
    status, verified_at, disabled_at, updated_at
  ) values (
    p_store_id, 'reservation_owner_alert', btrim(p_oa_id), btrim(p_oa_user_id),
    v_challenge.created_by, 'verified', now(), null, now()
  )
  on conflict(store_id, purpose) do update
  set oa_id = excluded.oa_id,
      oa_user_id = excluded.oa_user_id,
      operator_user_id = excluded.operator_user_id,
      status = 'verified',
      verified_at = now(),
      disabled_at = null,
      updated_at = now()
  returning id into v_recipient_id;

  update public.zalo_oa_onboarding_challenges
  set claimed_at = now(),
      recipient_id = v_recipient_id,
      provider_message_id = btrim(p_message_id)
  where id = v_challenge.id;

  select exists (
    select 1
    from public.store_zalo_configs config
    where config.store_id = p_store_id
      and config.is_enabled
      and length(btrim(config.zalo_oa_access_token)) > 0
      and length(btrim(config.zalo_app_secret_key)) > 0
  ) into v_delivery_ready;

  update public.reservation_notification_deliveries
  set recipient_id = v_recipient_id,
      status = case when v_delivery_ready then 'queued' else 'action_required' end,
      updated_at = now()
  where store_id = p_store_id
    and kind = 'owner_new_reservation'
    and status = 'action_required';

  return jsonb_build_object(
    'status', 'claimed',
    'recipient_id', v_recipient_id
  );
end;
$$;

revoke all on function public.claim_zalo_oa_onboarding_challenge(uuid, text, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_zalo_oa_onboarding_challenge(uuid, text, text, text, text, text)
  to service_role;

notify pgrst, 'reload schema';

