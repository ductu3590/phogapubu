-- 032_rename_zalo_checkout.sql — đổi tên KÊNH 'zalopay' → 'zalo_checkout'
-- Quán CHƯA chạy thật (dữ liệu là test) → rename THẲNG, không cần expand/contract.
-- 'zalopay' là tên mập mờ: kênh này khách còn chọn CHUYỂN KHOẢN bên trong Zalo, không chỉ ví.
-- ⚠️ Sau migration này, create_order CHỈ nhận 'zalo_checkout' → mini-app cũ (gửi 'zalopay') sẽ
--    bị từ chối cho tới khi redeploy bản mới. Không sao vì chưa có khách thật.

-- 1) DROP constraint cũ TRƯỚC (nếu không, UPDATE sang 'zalo_checkout' vi phạm constraint cũ
--    vốn chỉ cho 'zalopay'/'cash'/'bank_transfer')
alter table orders drop constraint if exists orders_payment_method_check;
alter table stores drop constraint if exists stores_payment_methods_valid;

-- 2) Backfill data test
update orders set payment_method = 'zalo_checkout' where payment_method = 'zalopay';
update stores set payment_methods = array_replace(payment_methods, 'zalopay', 'zalo_checkout');

-- 3) Add constraint mới (sau khi data đã sạch)
alter table orders add constraint orders_payment_method_check
  check (payment_method in ('zalo_checkout','cash','bank_transfer'));
alter table stores add constraint stores_payment_methods_valid
  check (array_length(payment_methods, 1) >= 1
         and payment_methods <@ array['zalo_checkout','cash']);

-- 3) create_order v7 = 030 v6 + đổi 'zalopay' → 'zalo_checkout' (default/validate/pickup)
CREATE OR REPLACE FUNCTION create_order(
  p_store_id uuid, p_table_id uuid DEFAULT NULL, p_items jsonb DEFAULT NULL,
  p_payment_method text DEFAULT 'zalo_checkout', p_zalo_user_id text DEFAULT NULL, p_note text DEFAULT NULL,
  p_order_type text DEFAULT 'dine_in', p_customer_name text DEFAULT NULL,
  p_customer_phone text DEFAULT NULL, p_delivery_address text DEFAULT NULL,
  p_voucher_code text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order orders%ROWTYPE; v_total int := 0; v_token text := gen_random_uuid()::text;
  v_item jsonb; v_menu menu_items%ROWTYPE; v_qty int;
  v_topping_ids uuid[]; v_item_toppings jsonb; v_topping_total int; v_topping_count int;
  v_voucher vouchers%ROWTYPE; v_discount int := 0; v_reason text;
BEGIN
  IF p_payment_method NOT IN ('zalo_checkout','cash') THEN RAISE EXCEPTION 'payment_method không hợp lệ: %', p_payment_method; END IF;
  IF p_order_type NOT IN ('dine_in','pickup','delivery') THEN RAISE EXCEPTION 'order_type không hợp lệ: %', p_order_type; END IF;

  IF NOT store_accepting_now(p_store_id) THEN
    RAISE EXCEPTION 'Quán đang tạm nghỉ hoặc ngoài giờ phục vụ';
  END IF;

  IF p_order_type = 'dine_in' THEN
    IF p_table_id IS NULL THEN RAISE EXCEPTION 'Đơn tại bàn cần có table_id'; END IF;
    IF NOT EXISTS (SELECT 1 FROM tables WHERE id = p_table_id AND store_id = p_store_id AND is_active = true) THEN
      RAISE EXCEPTION 'Bàn không thuộc quán hoặc không hoạt động'; END IF;
  END IF;

  IF p_order_type IN ('pickup','delivery') THEN
    IF p_customer_name IS NULL THEN RAISE EXCEPTION 'Đơn mang về cần tên khách hàng'; END IF;
    IF p_order_type = 'delivery' THEN
      IF p_customer_phone IS NULL THEN RAISE EXCEPTION 'Đơn ship cần số điện thoại'; END IF;
      IF p_delivery_address IS NULL THEN RAISE EXCEPTION 'Đơn ship cần địa chỉ giao hàng'; END IF;
    END IF;
    IF p_payment_method <> 'zalo_checkout' THEN RAISE EXCEPTION 'Đơn mang về chỉ chấp nhận thanh toán online'; END IF;
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Đơn không có món nào'; END IF;

  INSERT INTO orders (store_id, table_id, total_amount, zalo_user_id, note, payment_method, status, capability_token,
    order_type, customer_name, customer_phone, delivery_address)
  VALUES (p_store_id, p_table_id, 0, p_zalo_user_id, p_note, p_payment_method, 'pending', v_token,
    p_order_type, p_customer_name, p_customer_phone, p_delivery_address)
  RETURNING * INTO v_order;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := COALESCE((v_item->>'quantity')::int, 0);
    IF v_qty <= 0 THEN RAISE EXCEPTION 'Số lượng không hợp lệ'; END IF;

    SELECT * INTO v_menu FROM menu_items
    WHERE id = (v_item->>'menu_item_id')::uuid AND store_id = p_store_id AND is_available = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'Món không thuộc quán hoặc ngừng bán: %', v_item->>'menu_item_id'; END IF;

    v_item_toppings := '[]'::jsonb; v_topping_total := 0;
    IF v_item ? 'topping_ids' AND jsonb_typeof(v_item->'topping_ids') = 'array'
       AND jsonb_array_length(v_item->'topping_ids') > 0 THEN
      SELECT array_agg(DISTINCT value::uuid) INTO v_topping_ids
        FROM jsonb_array_elements_text(v_item->'topping_ids');
      SELECT
        COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'price',t.price) ORDER BY t.sort_order, t.created_at), '[]'::jsonb),
        COALESCE(SUM(t.price),0), COUNT(*)
      INTO v_item_toppings, v_topping_total, v_topping_count
      FROM toppings t
      JOIN menu_item_toppings mit ON mit.topping_id = t.id AND mit.menu_item_id = v_menu.id
      WHERE t.id = ANY(v_topping_ids) AND t.store_id = p_store_id AND t.is_available = true;
      IF v_topping_count <> array_length(v_topping_ids,1) THEN
        RAISE EXCEPTION 'Topping không hợp lệ / chưa gán cho món / ngừng bán: %', v_menu.name; END IF;
    END IF;

    INSERT INTO order_items (order_id, menu_item_id, item_name, item_price, quantity, note, selected_toppings)
    VALUES (v_order.id, v_menu.id, v_menu.name, v_menu.price, v_qty, v_item->>'note', v_item_toppings);
    v_total := v_total + (v_menu.price + v_topping_total) * v_qty;
  END LOOP;

  IF p_voucher_code IS NOT NULL AND trim(p_voucher_code) <> '' THEN
    SELECT * INTO v_voucher FROM vouchers
     WHERE store_id = p_store_id AND upper(code) = upper(trim(p_voucher_code))
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Mã giảm giá không tồn tại'; END IF;
    v_reason := voucher_reject_reason(v_voucher, p_zalo_user_id);
    IF v_reason IS NOT NULL THEN RAISE EXCEPTION '%', v_reason; END IF;
    IF v_voucher.zalo_user_id IS NULL THEN
      UPDATE vouchers SET zalo_user_id = p_zalo_user_id WHERE id = v_voucher.id;
    END IF;
    v_discount := voucher_discount(v_voucher, v_total);
    IF v_total - v_discount < 1000 THEN RAISE EXCEPTION 'Đơn quá nhỏ để áp mã giảm giá'; END IF;
  END IF;

  UPDATE orders SET total_amount = v_total - v_discount,
                    payment_amount = v_total - v_discount,
                    discount_amount = v_discount,
                    voucher_id = v_voucher.id
   WHERE id = v_order.id RETURNING * INTO v_order;
  RETURN to_jsonb(v_order);
END; $$;
REVOKE ALL ON FUNCTION create_order(uuid,uuid,jsonb,text,text,text,text,text,text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION create_order(uuid,uuid,jsonb,text,text,text,text,text,text,text,text) TO anon;

-- 3b) sweep_abandoned_orders (mig 031): đổi điều kiện quét sang 'zalo_checkout'
--     (nếu không, sau backfill hàm này không quét được đơn nào nữa)
create or replace function sweep_abandoned_orders(p_store_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  if not is_store_owner_or_admin(p_store_id) then
    raise exception 'Không có quyền';
  end if;

  update orders set status = 'cancelled'
  where store_id = p_store_id
    and order_source = 'customer_zalo'
    and payment_method = 'zalo_checkout'
    and status = 'pending'
    and payment_received_at is null
    and created_at < now() - interval '30 minutes';
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function sweep_abandoned_orders(uuid) from public;
revoke all on function sweep_abandoned_orders(uuid) from anon;
grant execute on function sweep_abandoned_orders(uuid) to authenticated;

-- 4) abandon_zalopay_to_cash: đổi điều kiện 'zalopay' → 'zalo_checkout'
CREATE OR REPLACE FUNCTION abandon_zalopay_to_cash(p_order_id uuid, p_token text)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order orders%ROWTYPE;
BEGIN
  UPDATE orders
     SET payment_method = 'cash'
   WHERE id = p_order_id
     AND status = 'pending'
     AND payment_method = 'zalo_checkout'
     AND zalopay_trans_id IS NULL
     AND capability_token = p_token
  RETURNING * INTO v_order;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN to_jsonb(v_order);
END $$;
