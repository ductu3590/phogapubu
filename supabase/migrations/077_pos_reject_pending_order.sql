-- Chủ quán có thể từ chối toàn bộ đơn đang chờ POS thay vì buộc phải xác nhận/in.
-- Giữ nguyên order + items để đối soát; status=cancelled loại đơn khỏi bill theo logic hiện có.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS rejection_reason_code text CHECK (
    rejection_reason_code IS NULL OR rejection_reason_code IN (
      'out_of_stock', 'kitchen_overloaded', 'duplicate', 'customer_requested', 'other'
    )
  ),
  ADD COLUMN IF NOT EXISTS rejection_reason_note text;

COMMENT ON COLUMN public.orders.rejected_at IS 'Lúc chủ quán từ chối toàn bộ đơn đang chờ POS.';
COMMENT ON COLUMN public.orders.rejected_by IS 'Chủ quán đã từ chối đơn.';
COMMENT ON COLUMN public.orders.rejection_reason_code IS 'Lý do chuẩn hoá khi POS từ chối đơn.';
COMMENT ON COLUMN public.orders.rejection_reason_note IS 'Nội dung tự nhập khi chọn lý do khác.';

CREATE OR REPLACE FUNCTION public.pos_reject_order(
  p_order_id uuid,
  p_reason_code text,
  p_reason_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_note text := NULLIF(btrim(p_reason_note), '');
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy đơn';
  END IF;
  IF NOT public.is_store_owner_of(v_order.store_id) THEN
    RAISE EXCEPTION 'Chỉ chủ quán mới được từ chối đơn';
  END IF;
  IF v_order.order_source = 'reservation_preorder' THEN
    RAISE EXCEPTION 'Món đặt trước phải xử lý tại hàng đợi món đặt trước';
  END IF;

  -- Retry sau khi server đã commit: không ghi đè người/lý do của lần xử lý đầu tiên.
  IF v_order.status = 'cancelled' AND v_order.rejected_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'status', 'cancelled');
  END IF;
  IF v_order.status <> 'pending' THEN
    RAISE EXCEPTION 'Chỉ được từ chối đơn đang chờ xác nhận';
  END IF;
  IF p_reason_code IS NULL OR p_reason_code NOT IN (
    'out_of_stock', 'kitchen_overloaded', 'duplicate', 'customer_requested', 'other'
  ) THEN
    RAISE EXCEPTION 'Lý do từ chối không hợp lệ';
  END IF;
  IF p_reason_code = 'other' AND v_note IS NULL THEN
    RAISE EXCEPTION 'Nhập lý do khác';
  END IF;

  UPDATE public.orders
  SET status = 'cancelled',
      rejected_at = now(),
      rejected_by = auth.uid(),
      rejection_reason_code = p_reason_code,
      rejection_reason_note = CASE WHEN p_reason_code = 'other' THEN v_note ELSE NULL END,
      updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('ok', true, 'already', false, 'status', 'cancelled');
END;
$$;

REVOKE ALL ON FUNCTION public.pos_reject_order(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_reject_order(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
