-- BL-1 Task 3 hotfix: Supabase cấp EXECUTE riêng cho anon/authenticated,
-- vì vậy REVOKE PUBLIC đơn thuần không đủ để bảo vệ SECURITY DEFINER RPC.

REVOKE ALL ON FUNCTION public.reservation_operator_actor_kind(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reservation_active_table_summary(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_reservation_tables(uuid, uuid, timestamptz, integer, uuid[], uuid)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.create_manual_reservation(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_reservation(uuid, uuid[], text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_reservation(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_reservation_change(uuid, boolean, uuid[], text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_reservation_no_show(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_store_reservations(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_manual_reservation(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_reservation(uuid, uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_reservation(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_reservation_change(uuid, boolean, uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_reservation_no_show(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_store_reservations(uuid, timestamptz, timestamptz) TO authenticated;

NOTIFY pgrst, 'reload schema';
