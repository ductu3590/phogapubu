-- BL-3 Task 9: tác vụ gọi nhắc khách trước giờ đến 60 phút.
-- Đây là hàng việc bền vững cho chủ quán, không phải cam kết gửi Zalo/SMS cho khách.

CREATE TABLE IF NOT EXISTS public.reservation_customer_call_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id),
  reservation_id uuid NOT NULL REFERENCES public.reservations(id),
  scheduled_arrival_at timestamptz NOT NULL,
  due_at timestamptz NOT NULL,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id),
  outcome text,
  retired_at timestamptz,
  retired_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reservation_customer_call_tasks_outcome_check
    CHECK (outcome IS NULL OR outcome IN ('called', 'unreachable')),
  CONSTRAINT reservation_customer_call_tasks_resolution_check
    CHECK ((resolved_at IS NULL AND resolved_by IS NULL AND outcome IS NULL)
       OR (resolved_at IS NOT NULL AND resolved_by IS NOT NULL AND outcome IS NOT NULL)),
  UNIQUE (reservation_id, scheduled_arrival_at)
);

CREATE INDEX IF NOT EXISTS reservation_customer_call_tasks_due_open
  ON public.reservation_customer_call_tasks(store_id, due_at)
  WHERE resolved_at IS NULL AND retired_at IS NULL;

ALTER TABLE public.reservation_events
  DROP CONSTRAINT IF EXISTS reservation_events_event_type_check;
ALTER TABLE public.reservation_events
  ADD CONSTRAINT reservation_events_event_type_check
  CHECK (event_type IN (
    'created', 'confirmed', 'rejected', 'change_requested', 'change_accepted',
    'change_rejected', 'cancelled_by_customer', 'cancelled_by_store', 'arrived',
    'completed', 'no_show', 'manual_created', 'reminder_snoozed', 'rescheduled_by_store', 'customer_access_revoked',
    'reservation_customer_call_resolved'
  ));

CREATE OR REPLACE FUNCTION public.sync_reservation_customer_call_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_due_at timestamptz;
BEGIN
  IF NEW.status = 'confirmed' THEN
    -- Khi xác nhận sát giờ, task hiện ngay khi POS/Admin mở lại thay vì bị bỏ lỡ.
    v_due_at := GREATEST(NEW.arrival_at - interval '60 minutes', now());

    UPDATE public.reservation_customer_call_tasks
    SET retired_at = now(), retired_reason = 'rescheduled', updated_at = now()
    WHERE reservation_id = NEW.id
      AND scheduled_arrival_at IS DISTINCT FROM NEW.arrival_at
      AND resolved_at IS NULL
      AND retired_at IS NULL;

    INSERT INTO public.reservation_customer_call_tasks (
      store_id, reservation_id, scheduled_arrival_at, due_at
    ) VALUES (NEW.store_id, NEW.id, NEW.arrival_at, v_due_at)
    ON CONFLICT (reservation_id, scheduled_arrival_at) DO UPDATE
    SET due_at = EXCLUDED.due_at,
        retired_at = NULL,
        retired_reason = NULL,
        updated_at = now();
  ELSIF NEW.status IN ('arrived', 'cancelled_by_customer', 'cancelled_by_store', 'no_show', 'completed', 'rejected') THEN
    UPDATE public.reservation_customer_call_tasks
    SET retired_at = now(), retired_reason = NEW.status, updated_at = now()
    WHERE reservation_id = NEW.id AND resolved_at IS NULL AND retired_at IS NULL;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_reservation_customer_call_task() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_reservation_customer_call_task ON public.reservations;
CREATE TRIGGER trg_reservation_customer_call_task
AFTER INSERT OR UPDATE OF status, arrival_at ON public.reservations
FOR EACH ROW EXECUTE FUNCTION public.sync_reservation_customer_call_task();

-- Backfill an toàn cho các booking đã confirmed khi migration được áp vào quán đang chạy.
INSERT INTO public.reservation_customer_call_tasks (
  store_id, reservation_id, scheduled_arrival_at, due_at
)
SELECT r.store_id, r.id, r.arrival_at, GREATEST(r.arrival_at - interval '60 minutes', now())
FROM public.reservations r
WHERE r.status = 'confirmed'
ON CONFLICT (reservation_id, scheduled_arrival_at) DO NOTHING;

CREATE OR REPLACE FUNCTION public.list_reservation_customer_calls(
  p_store_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.reservation_operator_actor_kind(p_store_id);
  IF NOT public.is_store_owner_of(p_store_id) THEN
    RAISE EXCEPTION 'Chỉ chủ quán được xem việc gọi nhắc khách';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'task_id', t.id,
      'reservation_id', t.reservation_id,
      'customer_name', r.customer_name,
      'customer_phone', r.customer_phone,
      'party_size', r.party_size,
      'arrival_at', r.arrival_at,
      'due_at', t.due_at,
      'created_at', t.created_at
    ) ORDER BY t.due_at, t.created_at)
    FROM public.reservation_customer_call_tasks t
    JOIN public.reservations r ON r.id = t.reservation_id
    WHERE t.store_id = p_store_id
      AND t.due_at <= now()
      AND t.resolved_at IS NULL
      AND t.retired_at IS NULL
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_reservation_customer_call(
  p_task_id uuid,
  p_outcome text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task public.reservation_customer_call_tasks%ROWTYPE;
  v_actor_kind text;
BEGIN
  IF p_outcome NOT IN ('called', 'unreachable') THEN
    RAISE EXCEPTION 'Kết quả gọi nhắc không hợp lệ';
  END IF;
  SELECT * INTO v_task FROM public.reservation_customer_call_tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy việc gọi nhắc khách'; END IF;
  IF NOT public.is_store_owner_of(v_task.store_id) THEN
    RAISE EXCEPTION 'Chỉ chủ quán được xử lý việc gọi nhắc khách';
  END IF;
  IF v_task.retired_at IS NOT NULL THEN
    RAISE EXCEPTION 'Việc gọi nhắc này không còn hiệu lực';
  END IF;
  IF v_task.resolved_at IS NOT NULL THEN
    RETURN jsonb_build_object('task_id', v_task.id, 'already', true, 'outcome', v_task.outcome);
  END IF;

  UPDATE public.reservation_customer_call_tasks
  SET resolved_at = now(), resolved_by = auth.uid(), outcome = p_outcome, updated_at = now()
  WHERE id = v_task.id
  RETURNING * INTO v_task;

  v_actor_kind := public.reservation_operator_actor_kind(v_task.store_id);
  PERFORM public.append_reservation_event(
    v_task.reservation_id, v_task.store_id, auth.uid(), v_actor_kind,
    'reservation_customer_call_resolved', '{}'::jsonb,
    jsonb_build_object('task_id', v_task.id, 'outcome', v_task.outcome),
    CASE WHEN v_task.outcome = 'called' THEN 'Đã gọi nhắc khách' ELSE 'Chưa liên hệ được khách' END
  );
  RETURN jsonb_build_object('task_id', v_task.id, 'already', false, 'outcome', v_task.outcome);
END;
$$;

REVOKE ALL ON TABLE public.reservation_customer_call_tasks FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_reservation_customer_calls(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_reservation_customer_call(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_reservation_customer_calls(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_reservation_customer_call(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
