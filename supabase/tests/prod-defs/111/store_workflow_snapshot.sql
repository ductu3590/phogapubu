CREATE OR REPLACE FUNCTION public.store_workflow_snapshot(p_store_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'payment_timing', s.payment_timing,
    'payment_methods', to_jsonb(s.payment_methods),
    'is_accepting_orders', s.is_accepting_orders,
    'serving_hours', s.serving_hours,
    'table_ordering_enabled', w.table_ordering_enabled,
    'takeaway_enabled', w.takeaway_enabled,
    'shipping_enabled', w.shipping_enabled,
    'reservations_enabled', w.reservations_enabled,
    'reservation_preorder_enabled', w.reservation_preorder_enabled,
    'minimum_advance_minutes', w.minimum_advance_minutes,
    'booking_horizon_days', w.booking_horizon_days,
    'slot_interval_minutes', w.slot_interval_minutes,
    'default_table_capacity', w.default_table_capacity,
    'planning_hold_minutes', w.planning_hold_minutes,
    'kitchen_release_policy', w.kitchen_release_policy,
    'staff_order_release_policy', w.staff_order_release_policy,
    'open_ordering_on_arrival', w.open_ordering_on_arrival,
    'table_session_idle_timeout_minutes', w.table_session_idle_timeout_minutes,
    'reservation_preorder_edit_cutoff_minutes', w.reservation_preorder_edit_cutoff_minutes
  )
  FROM public.stores s
  JOIN public.store_workflow_settings w ON w.store_id = s.id
  WHERE s.id = p_store_id;
$function$
