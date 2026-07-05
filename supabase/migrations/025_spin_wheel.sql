-- 025_spin_wheel.sql — Vòng quay may mắn sau thanh toán (Sprint v2.3)
-- Nguyên tắc: CẮM THÊM, tắt là như chưa từng tồn tại. Mặc định TẮT mọi quán.
-- Kết quả do SERVER quyết định (RPC theo weight), client chỉ vẽ animation dừng
-- đúng ô. KHÔNG sửa bảng/RPC/luồng hiện có — toàn bộ là bảng mới + RPC mới.

-- Feature flag: mặc định TẮT cho MỌI quán (kể cả Pubu)
ALTER TABLE stores ADD COLUMN IF NOT EXISTS spin_enabled boolean NOT NULL DEFAULT false;

-- Cấu hình phần thưởng per-store
CREATE TABLE IF NOT EXISTS spin_rewards (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id   uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  label      text NOT NULL,
  type       text NOT NULL DEFAULT 'gift' CHECK (type IN ('gift','none')),  -- none = không trúng
  weight     int  NOT NULL DEFAULT 1 CHECK (weight > 0),
  sort_order int  NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_spin_rewards_store ON spin_rewards(store_id);

-- Kết quả quay: 1 đơn = tối đa 1 lượt (UNIQUE order_id)
CREATE TABLE IF NOT EXISTS spin_results (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  order_id      uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  zalo_user_id  text,
  reward_id     uuid REFERENCES spin_rewards(id) ON DELETE SET NULL,
  reward_label  text NOT NULL,   -- snapshot phòng quán sửa/xoá reward
  reward_type   text NOT NULL,
  status        text NOT NULL DEFAULT 'won' CHECK (status IN ('won','redeemed')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  redeemed_at   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_spin_results_store ON spin_results(store_id);

-- ── RLS: operator store-scoped; anon KHÔNG truy cập trực tiếp (mọi thứ qua RPC) ──
ALTER TABLE spin_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE spin_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "op_all_spin_rewards" ON spin_rewards;
CREATE POLICY "op_all_spin_rewards" ON spin_rewards
  FOR ALL TO authenticated
  USING (is_store_scoped_operator(store_id))
  WITH CHECK (is_store_scoped_operator(store_id));

DROP POLICY IF EXISTS "op_read_spin_results" ON spin_results;
CREATE POLICY "op_read_spin_results" ON spin_results
  FOR SELECT TO authenticated
  USING (is_store_scoped_operator(store_id));
DROP POLICY IF EXISTS "op_update_spin_results" ON spin_results;
CREATE POLICY "op_update_spin_results" ON spin_results
  FOR UPDATE TO authenticated
  USING (is_store_scoped_operator(store_id))
  WITH CHECK (is_store_scoped_operator(store_id));

-- ── RPC: trạng thái vòng quay cho 1 đơn (READ-ONLY, không tạo kết quả) ──
-- Trả: {status: 'not_eligible'|'disabled'|'available'|'done', rewards?, result?}
CREATE OR REPLACE FUNCTION get_spin_state(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_enabled boolean;
  v_paid boolean;
  v_existing spin_results%ROWTYPE;
  v_rewards jsonb;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','not_eligible'); END IF;

  -- "Tiền thật" (khớp mig 014): ZaloPay có trans_id (chưa huỷ) HOẶC cash đã paid
  v_paid := (v_order.payment_method='zalopay' AND v_order.zalopay_trans_id IS NOT NULL AND v_order.status<>'cancelled')
         OR (v_order.payment_method='cash' AND v_order.status='paid');
  IF NOT v_paid THEN RETURN jsonb_build_object('status','not_eligible'); END IF;

  SELECT spin_enabled INTO v_enabled FROM stores WHERE id = v_order.store_id;

  SELECT jsonb_agg(jsonb_build_object('id',id,'label',label,'type',type) ORDER BY sort_order, id)
    INTO v_rewards FROM spin_rewards WHERE store_id=v_order.store_id AND is_active;

  IF NOT COALESCE(v_enabled,false) OR v_rewards IS NULL THEN
    RETURN jsonb_build_object('status','disabled');
  END IF;

  SELECT * INTO v_existing FROM spin_results WHERE order_id = p_order_id;
  IF FOUND THEN
    RETURN jsonb_build_object('status','done','already',true,'rewards',v_rewards,
      'result', jsonb_build_object('result_id',v_existing.id,'reward_id',v_existing.reward_id,
        'label',v_existing.reward_label,'type',v_existing.reward_type,
        'code',upper(left(v_existing.id::text,6)),'redeem_status',v_existing.status));
  END IF;

  RETURN jsonb_build_object('status','available','rewards',v_rewards);
END; $$;

-- ── RPC: QUAY (server quyết định theo weight; idempotent 1 lượt/đơn) ──
CREATE OR REPLACE FUNCTION spin_wheel(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_enabled boolean;
  v_paid boolean;
  v_existing spin_results%ROWTYPE;
  v_rewards jsonb;
  v_total int;
  v_r numeric;
  v_pick spin_rewards%ROWTYPE;
  v_new spin_results%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','not_eligible'); END IF;

  v_paid := (v_order.payment_method='zalopay' AND v_order.zalopay_trans_id IS NOT NULL AND v_order.status<>'cancelled')
         OR (v_order.payment_method='cash' AND v_order.status='paid');
  IF NOT v_paid THEN RETURN jsonb_build_object('status','not_eligible'); END IF;

  SELECT spin_enabled INTO v_enabled FROM stores WHERE id = v_order.store_id;
  IF NOT COALESCE(v_enabled,false) THEN RETURN jsonb_build_object('status','disabled'); END IF;

  SELECT jsonb_agg(jsonb_build_object('id',id,'label',label,'type',type) ORDER BY sort_order, id)
    INTO v_rewards FROM spin_rewards WHERE store_id=v_order.store_id AND is_active;
  IF v_rewards IS NULL THEN RETURN jsonb_build_object('status','disabled'); END IF;

  -- Idempotent: đã quay rồi → trả lại kết quả cũ (khách mở lại không quay lần 2)
  SELECT * INTO v_existing FROM spin_results WHERE order_id = p_order_id;
  IF FOUND THEN
    RETURN jsonb_build_object('status','done','already',true,'rewards',v_rewards,
      'result', jsonb_build_object('result_id',v_existing.id,'reward_id',v_existing.reward_id,
        'label',v_existing.reward_label,'type',v_existing.reward_type,
        'code',upper(left(v_existing.id::text,6)),'redeem_status',v_existing.status));
  END IF;

  -- Random theo weight (cumulative): v_r ∈ [0,total), chọn ô đầu tiên có running > v_r
  SELECT sum(weight) INTO v_total FROM spin_rewards WHERE store_id=v_order.store_id AND is_active;
  v_r := random() * v_total;
  SELECT s.* INTO v_pick FROM (
    SELECT sr.*, sum(sr.weight) OVER (ORDER BY sr.sort_order, sr.id) AS running
    FROM spin_rewards sr WHERE sr.store_id=v_order.store_id AND sr.is_active
  ) s WHERE v_r < s.running ORDER BY s.running ASC LIMIT 1;
  IF v_pick.id IS NULL THEN
    SELECT * INTO v_pick FROM spin_rewards WHERE store_id=v_order.store_id AND is_active ORDER BY sort_order, id LIMIT 1;
  END IF;

  INSERT INTO spin_results (store_id, order_id, zalo_user_id, reward_id, reward_label, reward_type)
  VALUES (v_order.store_id, p_order_id, v_order.zalo_user_id, v_pick.id, v_pick.label, v_pick.type)
  ON CONFLICT (order_id) DO NOTHING
  RETURNING * INTO v_new;

  -- 2 lần bấm sát nhau → ON CONFLICT bỏ qua, lấy kết quả đã tồn tại
  IF v_new.id IS NULL THEN
    SELECT * INTO v_new FROM spin_results WHERE order_id = p_order_id;
  END IF;

  RETURN jsonb_build_object('status','done','already',false,'rewards',v_rewards,
    'result', jsonb_build_object('result_id',v_new.id,'reward_id',v_new.reward_id,
      'label',v_new.reward_label,'type',v_new.reward_type,
      'code',upper(left(v_new.id::text,6)),'redeem_status',v_new.status));
END; $$;

-- ── RPC: đổi thưởng (operator/kitchen bấm "Đã đổi thưởng") ──
CREATE OR REPLACE FUNCTION redeem_spin_result(p_result_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_res spin_results%ROWTYPE;
BEGIN
  SELECT * INTO v_res FROM spin_results WHERE id = p_result_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy kết quả'; END IF;
  IF NOT is_store_scoped_operator(v_res.store_id) THEN
    RAISE EXCEPTION 'Không có quyền với quán này';
  END IF;
  UPDATE spin_results SET status='redeemed', redeemed_at=now()
    WHERE id=p_result_id AND status='won';
  RETURN jsonb_build_object('ok', true, 'already', v_res.status='redeemed');
END; $$;

-- Quyền gọi RPC
GRANT EXECUTE ON FUNCTION get_spin_state(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION spin_wheel(uuid)     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION redeem_spin_result(uuid) TO authenticated;
