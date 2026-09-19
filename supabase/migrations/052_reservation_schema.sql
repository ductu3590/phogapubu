-- BL-1 Task 1: nền dữ liệu đặt bàn theo quán.
-- Khách không được ghi/đọc trực tiếp các bảng này; mọi thao tác sau đó đi qua RPC.

CREATE TABLE IF NOT EXISTS public.reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'confirmed', 'rejected', 'change_requested',
      'cancelled_by_customer', 'cancelled_by_store', 'arrived', 'completed', 'no_show'
    )),
  customer_name text NOT NULL CHECK (length(btrim(customer_name)) > 0),
  customer_phone text NOT NULL CHECK (length(btrim(customer_phone)) > 0),
  zalo_user_id text,
  party_size integer NOT NULL CHECK (party_size BETWEEN 1 AND 100),
  arrival_at timestamptz NOT NULL,
  note text,
  client_request_id uuid NOT NULL,
  customer_token_hash text NOT NULL
    CHECK (customer_token_hash ~ '^[0-9a-f]{64}$'),

  -- Chụp cấu hình lúc khách gửi để việc xét duyệt không đổi theo cấu hình về sau.
  minimum_advance_minutes integer NOT NULL CHECK (minimum_advance_minutes BETWEEN 0 AND 1440),
  booking_horizon_days integer NOT NULL CHECK (booking_horizon_days BETWEEN 1 AND 90),
  slot_interval_minutes integer NOT NULL CHECK (slot_interval_minutes IN (5, 10, 15, 30, 60)),
  default_table_capacity integer NOT NULL CHECK (default_table_capacity BETWEEN 1 AND 100),
  planning_hold_minutes integer NOT NULL CHECK (planning_hold_minutes BETWEEN 15 AND 720),
  reservation_preorder_edit_cutoff_minutes integer NOT NULL
    CHECK (reservation_preorder_edit_cutoff_minutes BETWEEN 0 AND 1440),

  requested_arrival_at timestamptz,
  requested_party_size integer CHECK (requested_party_size BETWEEN 1 AND 100),
  change_note text,
  session_id uuid REFERENCES public.table_sessions(id),

  confirmed_at timestamptz,
  confirmed_by uuid REFERENCES auth.users(id),
  rejected_at timestamptz,
  rejected_by uuid REFERENCES auth.users(id),
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES auth.users(id),
  arrived_at timestamptz,
  arrived_by uuid REFERENCES auth.users(id),
  completed_at timestamptz,
  completed_by uuid REFERENCES auth.users(id),
  no_show_at timestamptz,
  no_show_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT reservations_id_store_unique UNIQUE (id, store_id),
  CONSTRAINT reservations_store_client_request_unique UNIQUE (store_id, client_request_id)
);

CREATE INDEX IF NOT EXISTS reservations_store_arrival
  ON public.reservations(store_id, arrival_at);

-- tables.id đã là PK, nhưng cặp này là target cần thiết để FK bắt buộc bàn cùng quán.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.tables'::regclass
      AND conname = 'tables_id_store_unique'
  ) THEN
    ALTER TABLE public.tables
      ADD CONSTRAINT tables_id_store_unique UNIQUE (id, store_id);
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.reservation_tables (
  reservation_id uuid NOT NULL,
  store_id uuid NOT NULL,
  table_id uuid NOT NULL,
  hold_starts_at timestamptz NOT NULL,
  hold_ends_at timestamptz NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES auth.users(id),
  PRIMARY KEY (reservation_id, table_id),
  CONSTRAINT reservation_tables_hold_range CHECK (hold_ends_at > hold_starts_at),
  CONSTRAINT reservation_tables_reservation_store_fkey
    FOREIGN KEY (reservation_id, store_id)
    REFERENCES public.reservations(id, store_id) ON DELETE CASCADE,
  CONSTRAINT reservation_tables_table_store_fkey
    FOREIGN KEY (table_id, store_id)
    REFERENCES public.tables(id, store_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS reservation_tables_store_table_hold
  ON public.reservation_tables(store_id, table_id, hold_starts_at, hold_ends_at);

CREATE TABLE IF NOT EXISTS public.reservation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL,
  store_id uuid NOT NULL,
  actor_id uuid REFERENCES auth.users(id),
  actor_kind text NOT NULL CHECK (actor_kind IN ('customer', 'owner', 'mevo', 'system')),
  event_type text NOT NULL
    CHECK (event_type IN (
      'created', 'confirmed', 'rejected', 'change_requested', 'change_accepted',
      'change_rejected', 'cancelled_by_customer', 'cancelled_by_store', 'arrived',
      'completed', 'no_show', 'manual_created'
    )),
  before_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reservation_events_reservation_store_fkey
    FOREIGN KEY (reservation_id, store_id)
    REFERENCES public.reservations(id, store_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS reservation_events_reservation_created
  ON public.reservation_events(reservation_id, created_at);

CREATE OR REPLACE FUNCTION public.reservation_status_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'pending' THEN
      RAISE EXCEPTION 'Đặt bàn mới phải bắt đầu ở trạng thái pending';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF (OLD.status = 'pending' AND NEW.status IN ('confirmed', 'rejected', 'cancelled_by_customer', 'cancelled_by_store'))
     OR (OLD.status = 'confirmed' AND NEW.status IN ('change_requested', 'cancelled_by_customer', 'cancelled_by_store', 'arrived', 'no_show'))
     OR (OLD.status = 'change_requested' AND NEW.status IN ('confirmed', 'cancelled_by_customer', 'cancelled_by_store'))
     OR (OLD.status = 'arrived' AND NEW.status IN ('completed', 'cancelled_by_store')) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Chuyển trạng thái đặt bàn không hợp lệ: % -> %', OLD.status, NEW.status;
END;
$$;

DROP TRIGGER IF EXISTS trg_reservations_status_transition ON public.reservations;
CREATE TRIGGER trg_reservations_status_transition
  BEFORE INSERT OR UPDATE OF status ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.reservation_status_guard();

CREATE OR REPLACE FUNCTION public.append_reservation_event(
  p_reservation_id uuid,
  p_store_id uuid,
  p_actor_id uuid,
  p_actor_kind text,
  p_event_type text,
  p_before_value jsonb DEFAULT '{}'::jsonb,
  p_after_value jsonb DEFAULT '{}'::jsonb,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
BEGIN
  INSERT INTO public.reservation_events(
    reservation_id, store_id, actor_id, actor_kind, event_type,
    before_value, after_value, note
  ) VALUES (
    p_reservation_id, p_store_id, p_actor_id, p_actor_kind, p_event_type,
    COALESCE(p_before_value, '{}'::jsonb), COALESCE(p_after_value, '{}'::jsonb), p_note
  ) RETURNING id INTO v_event_id;
  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.append_reservation_event(
  uuid, uuid, uuid, text, text, jsonb, jsonb, text
) FROM PUBLIC, anon, authenticated;

ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.reservations, public.reservation_tables, public.reservation_events
  FROM anon, authenticated;
GRANT SELECT ON public.reservations, public.reservation_tables, public.reservation_events
  TO authenticated;

DROP POLICY IF EXISTS reservations_operator_read ON public.reservations;
CREATE POLICY reservations_operator_read ON public.reservations
  FOR SELECT TO authenticated
  USING (public.is_store_scoped_operator(store_id));

DROP POLICY IF EXISTS reservation_tables_operator_read ON public.reservation_tables;
CREATE POLICY reservation_tables_operator_read ON public.reservation_tables
  FOR SELECT TO authenticated
  USING (public.is_store_scoped_operator(store_id));

DROP POLICY IF EXISTS reservation_events_operator_read ON public.reservation_events;
CREATE POLICY reservation_events_operator_read ON public.reservation_events
  FOR SELECT TO authenticated
  USING (public.is_store_scoped_operator(store_id));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'reservations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reservations;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
