-- BL-2B Task 1: index phủ các khóa ngoại phục vụ claim, audit và dọn hàng đợi OA.

CREATE INDEX IF NOT EXISTS store_zalo_notification_recipients_operator_user
  ON public.store_zalo_notification_recipients(operator_user_id)
  WHERE operator_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS zalo_oa_onboarding_challenges_recipient_store
  ON public.zalo_oa_onboarding_challenges(recipient_id, store_id)
  WHERE recipient_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS zalo_oa_onboarding_challenges_created_by
  ON public.zalo_oa_onboarding_challenges(created_by);

CREATE INDEX IF NOT EXISTS reservation_notification_deliveries_reservation_store
  ON public.reservation_notification_deliveries(reservation_id, store_id)
  WHERE reservation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS reservation_notification_deliveries_event_store
  ON public.reservation_notification_deliveries(reservation_event_id, store_id)
  WHERE reservation_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS reservation_notification_deliveries_recipient_store
  ON public.reservation_notification_deliveries(recipient_id, store_id)
  WHERE recipient_id IS NOT NULL;
