-- 039_prepay_postpay_table_session.sql — Sprint 1 "Trả trước / Trả sau + Phiên bàn"
-- Spec:   docs/superpowers/specs/2026-08-20-prepay-postpay-table-session-design.md (duyệt 2026-08-30)
-- Review: docs/superpowers/reviews/2026-08-26-postpay-table-session-print-design-review.md
--         (P0-2 RLS, P0-3 lock ordering, P1-1 bill theo phiên, P1-2 drop chữ ký cũ,
--          P1-3 composite FK, P1-4 loại đơn huỷ khỏi settlement, P2-1 phiên hết hạn còn nợ)
--
-- GỐC RỄ: trục "KHI NÀO thu tiền" đang bị suy ra từ trục "thu BẰNG GÌ".
--   orderInKitchen() cũ: payment_method='cash' => vào bếp không cần tiền.
--   => quán trả trước mà bật tiền mặt cho nhân viên thì đơn QR tiền mặt vẫn lọt vào bếp (PB3).
-- Tách thành: stores.payment_timing (prepay|postpay) quyết định vào bếp;
--             payment_method / payment_instrument chỉ còn là kênh/phương tiện để báo cáo.
--
-- THỨ TỰ TRONG FILE NÀY QUAN TRỌNG — mỗi mục phụ thuộc mục trước:
--   1) cột stores + backfill      (mọi hàm bên dưới đọc payment_timing)
--   2) table_sessions + RLS       (orders.session_id tham chiếu tới)
--   3) orders.session_id + FK toàn vẹn
--   4) nới payment_received_via = 'staff'
--   5) helper phiên (expire, resolve)   <- ĐIỂM MỞ RỘNG DUY NHẤT CHO SPRINT 2 (lớp Mâm)
--   6) create_order v10           (DROP chữ ký cũ trước — chống overload PostgREST)
--   7) staff_create_order         (GIỮ chữ ký 5 tham số)
--   8) 5 RPC phiên bàn
--   9) get_daily_revenue
--  10) bịt cửa hậu abandon_zalopay_to_cash
--  11) realtime publication
--
-- Idempotent rerun-safe.

-- ============================================================
-- 1) Cột mới trên stores + backfill giữ nguyên hành vi đang chạy
-- ============================================================
alter table stores
  add column if not exists payment_timing      text not null default 'prepay',
  add column if not exists bank_bin            text,
  add column if not exists bank_account_number text,
  add column if not exists bank_account_name   text;

alter table stores drop constraint if exists stores_payment_timing_check;
alter table stores add constraint stores_payment_timing_check
  check (payment_timing in ('prepay','postpay'));

comment on column stores.payment_timing is
  'prepay = phải có tiền rồi bếp mới làm; postpay = ăn trước trả sau, bắt buộc qua phiên bàn';
comment on column stores.bank_bin is
  'Mã BIN ngân hàng 6 số (VietQR). Dựng sẵn cho sprint thanh toán — Sprint 1 chưa có UI đọc/ghi';

-- Quán đang bật 'cash' = thực tế đang chạy trả sau (PB3) -> giữ nguyên hành vi.
-- ⚠️ Trên prod 2026-08-31 KHÔNG quán nào bật cash (cả hai quán = {zalo_checkout})
--    -> câu này đổi 0 dòng. Pubu ở lại 'prepay', đúng hành vi hiện tại: đơn Pubu là
--    zalo_checkout và đã có payment_received_at do callback ví ghi nên vẫn vào bếp.
--    Giữ câu lệnh phòng quán khác bật cash trước lúc migrate.
update stores set payment_timing = 'postpay' where 'cash' = any(payment_methods);

-- ============================================================
-- 2) Bảng table_sessions + RLS (review P0-2)
-- ============================================================
create table if not exists table_sessions (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references stores(id),
  table_id          uuid not null references tables(id),
  status            text not null default 'open' check (status in ('open','closed')),

  -- Chủ phiên: khớp MỘT TRONG HAI là được (PB5 — getUserID() có thể fail vĩnh viễn).
  -- NULL cả hai = phiên "chưa có chủ" (nhân viên mở hộ) -> khách đầu tiên gọi món nhận quyền.
  host_zalo_user_id text,
  host_device_id    text,

  opened_by         text not null check (opened_by in ('customer','staff')),
  opened_at         timestamptz not null default now(),
  last_activity_at  timestamptz not null default now(),

  closed_at         timestamptz,
  closed_by         uuid,
  close_reason      text,

  -- Constraint có TÊN RIÊNG: Sprint 2 (lớp Mâm) drop + add lại để thêm 'merged'.
  constraint table_sessions_close_reason_check
    check (close_reason is null or close_reason in ('paid','staff_reset','expired')),
  constraint table_sessions_closed_state check (
    (status = 'open'   and closed_at is null     and close_reason is null)
 or (status = 'closed' and closed_at is not null and close_reason is not null)
  )
);

comment on table table_sessions is
  'Một phiên = một bàn đang có khách = một bill. Các đơn cùng phiên nối qua orders.session_id. KHÔNG lưu total_amount / payment_received_at ở đây — tổng luôn tính lại từ orders (một nguồn sự thật), tiền vẫn ghi ở từng đơn. close_reason chỉ là nhãn.';

-- MỘT phiên mở duy nhất trên mỗi bàn. Đây là thứ chặn race hai máy cùng bấm đặt (rủi ro #1).
-- ⚠️ SPRINT 2: index này bị THAY bằng index tương đương trên session_tables.
create unique index if not exists table_sessions_one_open_per_table
  on table_sessions(table_id) where status = 'open';
create index if not exists table_sessions_store_open
  on table_sessions(store_id) where status = 'open';
create index if not exists table_sessions_store_closed
  on table_sessions(store_id, close_reason) where status = 'closed';

alter table table_sessions enable row level security;

-- Khách KHÔNG đụng bảng này trực tiếp — chỉ qua RPC SECURITY DEFINER đã validate.
-- Không có policy nào cho anon => Zalo UID / device id của chủ phiên không rò ra ngoài.
revoke all on table_sessions from anon;
revoke insert, update, delete on table_sessions from authenticated;

drop policy if exists "auth_read_table_sessions" on table_sessions;
create policy "auth_read_table_sessions" on table_sessions
  for select to authenticated using (is_store_scoped_operator(store_id));

-- ============================================================
-- 3) orders.session_id + ràng buộc toàn vẹn (review P1-3)
-- ============================================================
alter table orders add column if not exists session_id uuid;
create index if not exists orders_session on orders(session_id) where session_id is not null;

-- Composite FK: đơn và phiên BẮT BUỘC cùng quán -> chặn bug gắn đơn quán A vào phiên quán B.
-- CỐ TÌNH không ràng buộc theo table_id: Sprint 2 một phiên (mâm) sẽ chiếm N bàn.
alter table table_sessions drop constraint if exists table_sessions_id_store_unique;
alter table table_sessions add constraint table_sessions_id_store_unique unique (id, store_id);

alter table orders drop constraint if exists orders_session_same_store;
alter table orders add constraint orders_session_same_store
  foreign key (session_id, store_id) references table_sessions(id, store_id);

-- ============================================================
-- 4) Nới payment_received_via cho 'staff' (spec §5.4)
--    Nhân viên chốt bill có auth.uid() nhưng KHÔNG phải owner — ghi 'owner' là nói dối sổ sách.
-- ============================================================
alter table orders drop constraint if exists orders_payment_received_via_check;
alter table orders add constraint orders_payment_received_via_check
  check (payment_received_via in ('zalo_callback','sepay','kitchen','owner','staff','legacy'));

alter table orders drop constraint if exists orders_payment_received_state_check;
alter table orders add constraint orders_payment_received_state_check check (
  (
    payment_received_at is null
    and payment_received_via is null
    and payment_received_by is null
  )
  or (
    payment_received_at is not null
    and payment_received_via in ('owner','staff')       -- <- thêm 'staff'
    and payment_received_by is not null
  )
  or (
    payment_received_at is not null
    and payment_received_via in ('zalo_callback','sepay','kitchen','legacy')
    and payment_received_by is null
  )
);

-- ============================================================
-- 5) Helper phiên — ĐIỂM MỞ RỘNG DUY NHẤT CHO SPRINT 2 (lớp Mâm)
-- ============================================================

-- (a) Phiên quá 6h không hoạt động thì tự đóng, mở khoá bàn. Lazy on-read theo nếp
--     sweep_abandoned_orders / get_takeaway_orders — KHÔNG dùng pg_cron.
--     6h khớp cửa sổ "Món đã gọi" (get_session_orders) và TTL giỏ hàng — cùng một nhịp.
--     Đơn chưa thu tiền của phiên hết hạn KHÔNG tự huỷ (vẫn là công nợ có thật);
--     list_open_table_sessions vẫn trả những phiên đó về cho nhân viên xử lý (review P2-1).
create or replace function expire_stale_table_sessions(p_store_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  update table_sessions t
     set status = 'closed', closed_at = now(), close_reason = 'expired'
   where t.id in (
     select s.id from table_sessions s
      where s.store_id = p_store_id
        and s.status = 'open'
        and s.last_activity_at < now() - interval '6 hours'
      for update skip locked
   );
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function expire_stale_table_sessions(uuid) from public;
grant execute on function expire_stale_table_sessions(uuid) to anon, authenticated;

-- (b) Bàn này đang thuộc phiên mở nào?
-- ⚠️ SPRINT 2 (lớp Mâm) CHỈ CẦN SỬA ĐÚNG HÀM NÀY: đổi sang join session_tables.
--    Mọi RPC bên dưới đều gọi nó, không tự query table_sessions.table_id.
create or replace function open_session_id_for_table(p_table_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from table_sessions where table_id = p_table_id and status = 'open' limit 1;
$$;
revoke all on function open_session_id_for_table(uuid) from public;
grant execute on function open_session_id_for_table(uuid) to anon, authenticated;

-- QUY ƯỚC KHOÁ THỐNG NHẤT (review P0-3): mọi RPC đụng phiên đều
--   select * into v_session from table_sessions where id = <id> for update;
-- TRƯỚC TIÊN, rồi mới kiểm tra status='open', rồi mới đụng orders.
-- Một thứ tự duy nhất => không deadlock, và không có chuyện đóng bill xong đơn mới lọt vào.

-- ============================================================
-- 6) create_order v10 = 037 v9 + phiên bàn + payment_timing
--
-- ⚠️ P1-2: thêm tham số = tạo OVERLOAD mới; PostgREST có thể trả "could not choose the best
--    candidate function" khi mini-app cũ gọi. Phải DROP đúng chữ ký 11 tham số rồi tạo chữ ký
--    12 tham số. Client cũ (không gửi p_device_id) vẫn chạy vì tham số mới có DEFAULT NULL.
--
-- ⚠️ THỨ TỰ VALIDATE ĐẢO so với v9 (spec §6.2 cảnh báo — lỗi dễ mắc nhất khi implement):
--    order_type -> BÀN -> KHỐI PHIÊN -> payment_methods -> store_accepting_now.
--    Khối phiên phải chạy SAU khi bàn đã hợp lệ (nó mở phiên trên bàn đó) và TRƯỚC khi kiểm
--    payment_methods (nó ghi đè p_payment_method), và store_accepting_now cần biết phiên để
--    áp ân hạn 2h.
-- ============================================================
drop function if exists create_order(uuid,uuid,jsonb,text,text,text,text,text,text,text,text);

CREATE FUNCTION create_order(
  p_store_id uuid, p_table_id uuid DEFAULT NULL, p_items jsonb DEFAULT NULL,
  p_payment_method text DEFAULT 'zalo_checkout', p_zalo_user_id text DEFAULT NULL, p_note text DEFAULT NULL,
  p_order_type text DEFAULT 'dine_in', p_customer_name text DEFAULT NULL,
  p_customer_phone text DEFAULT NULL, p_delivery_address text DEFAULT NULL,
  p_voucher_code text DEFAULT NULL,
  p_device_id text DEFAULT NULL                      -- MỚI, luôn ở CUỐI (rủi ro #4)
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order orders%ROWTYPE; v_total int := 0; v_token text := gen_random_uuid()::text;
  v_item jsonb; v_menu menu_items%ROWTYPE; v_qty int;
  v_topping_ids uuid[]; v_item_toppings jsonb; v_topping_total int; v_topping_count int;
  v_voucher vouchers%ROWTYPE; v_discount int := 0; v_reason text;
  v_timing text; v_session table_sessions%ROWTYPE; v_session_id uuid;
  v_skip_method_check boolean := false;
BEGIN
  -- Tương thích mini-app cũ: 'zalopay' == 'zalo_checkout'
  IF p_payment_method = 'zalopay' THEN p_payment_method := 'zalo_checkout'; END IF;
  IF p_payment_method NOT IN ('zalo_checkout','cash') THEN RAISE EXCEPTION 'payment_method không hợp lệ: %', p_payment_method; END IF;

  IF p_order_type NOT IN ('dine_in','pickup','delivery') THEN RAISE EXCEPTION 'order_type không hợp lệ: %', p_order_type; END IF;

  -- Validate BÀN trước (khối phiên bên dưới cần bàn hợp lệ)
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
    -- Mang về/ship LUÔN trả trước, kể cả quán postpay (spec §3 — không có COD ở v1).
    IF p_payment_method <> 'zalo_checkout' THEN RAISE EXCEPTION 'Đơn mang về chỉ chấp nhận thanh toán online'; END IF;
  END IF;

  -- ---------- KHỐI PHIÊN BÀN ----------
  SELECT payment_timing INTO v_timing FROM stores WHERE id = p_store_id;
  IF v_timing IS NULL THEN RAISE EXCEPTION 'Không tìm thấy quán'; END IF;

  IF v_timing = 'postpay' AND p_order_type = 'dine_in' THEN
    -- (a) Trả sau tại bàn: khách không chọn phương thức lúc đặt.
    --     'cash' ở hệ này vốn đã có nghĩa "thanh toán với nhân viên khi ra về" = trả sau.
    --     KHÔNG thêm giá trị enum mới vì sẽ phải sửa 8 chỗ đang rẽ nhánh theo payment_method
    --     trên một hệ đang chạy thật (spec §6.2). Phương tiện thật ghi vào payment_instrument
    --     lúc chốt bill; nhãn hiển thị lấy theo session_id, không theo payment_method.
    p_payment_method := 'cash';
    v_skip_method_check := true;   -- ở trả sau, thu tại quán luôn hợp lệ

    -- (b) Tìm hoặc mở phiên. unique index partial + ON CONFLICT DO NOTHING => hai máy bấm
    --     cùng lúc chỉ một phiên ra đời (rủi ro #1).
    v_session_id := open_session_id_for_table(p_table_id);
    IF v_session_id IS NULL THEN
      INSERT INTO table_sessions (store_id, table_id, host_zalo_user_id, host_device_id, opened_by)
      VALUES (p_store_id, p_table_id, p_zalo_user_id, p_device_id, 'customer')
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_session_id;
      IF v_session_id IS NULL THEN                    -- máy kia vừa thắng race
        v_session_id := open_session_id_for_table(p_table_id);
      END IF;
    END IF;
    IF v_session_id IS NULL THEN RAISE EXCEPTION 'Không mở được phiên cho bàn này'; END IF;

    -- Khoá phiên TRƯỚC khi đọc/ghi bất cứ thứ gì khác (quy ước P0-3)
    SELECT * INTO v_session FROM table_sessions WHERE id = v_session_id FOR UPDATE;
    IF NOT FOUND OR v_session.status <> 'open' THEN
      RAISE EXCEPTION 'Bàn vừa được đóng, vui lòng quét lại QR';
    END IF;

    -- (c) Phiên chưa có chủ (nhân viên mở hộ) -> người này nhận quyền
    IF v_session.host_zalo_user_id IS NULL AND v_session.host_device_id IS NULL THEN
      UPDATE table_sessions
         SET host_zalo_user_id = p_zalo_user_id, host_device_id = p_device_id
       WHERE id = v_session.id RETURNING * INTO v_session;
    END IF;

    -- (d) KHOÁ: phải khớp MỘT TRONG HAI chân định danh (PB5)
    -- ⚠️ SPRINT 2: mâm đoàn (is_open_ordering = true) sẽ BỎ QUA đúng khối IF này.
    IF NOT (
         (p_zalo_user_id IS NOT NULL AND v_session.host_zalo_user_id = p_zalo_user_id)
      OR (p_device_id   IS NOT NULL AND v_session.host_device_id   = p_device_id)
    ) THEN
      RAISE EXCEPTION 'Bàn này đang có khách khác gọi món. Nhờ nhân viên mở bàn giúp bạn.';
    END IF;

  ELSIF v_timing = 'prepay' AND p_order_type = 'dine_in' THEN
    -- Trả trước: khách tự đặt qua QR CHỈ được online. Đóng nốt lỗ hổng PB3 mà mig 037 mới vá
    -- một nửa (037 chỉ chặn phương thức quán đã TẮT, không chặn phương thức quán BẬT cho nhân viên).
    IF p_payment_method <> 'zalo_checkout' THEN
      RAISE EXCEPTION 'Quán yêu cầu thanh toán trước khi bếp làm.';
    END IF;
  END IF;
  -- ---------- HẾT KHỐI PHIÊN ----------

  -- Chặn phương thức quán đã tắt: không tin danh sách client hiện ra (mig 037).
  IF NOT v_skip_method_check THEN
    IF NOT EXISTS (
      SELECT 1 FROM stores WHERE id = p_store_id AND p_payment_method = ANY(payment_methods)
    ) THEN
      RAISE EXCEPTION 'Quán không nhận phương thức thanh toán này, vui lòng chọn lại';
    END IF;
  END IF;

  -- Ân hạn phiên đang mở (PB6): quán đóng 22:00, khách vào 21:50, 22:05 gọi thêm bia vẫn được.
  -- Ngoài 2 giờ kể từ lúc mở phiên thì chặn như thường.
  IF NOT store_accepting_now(p_store_id)
     AND NOT (v_session_id IS NOT NULL AND v_session.opened_at > now() - interval '2 hours') THEN
    RAISE EXCEPTION 'Quán đang tạm nghỉ hoặc ngoài giờ phục vụ';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Đơn không có món nào'; END IF;

  INSERT INTO orders (store_id, table_id, total_amount, zalo_user_id, note, payment_method, status, capability_token,
    order_type, customer_name, customer_phone, delivery_address, session_id)
  VALUES (p_store_id, p_table_id, 0, p_zalo_user_id, p_note, p_payment_method, 'pending', v_token,
    p_order_type, p_customer_name, p_customer_phone, p_delivery_address, v_session_id)
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

  IF v_session_id IS NOT NULL THEN
    UPDATE table_sessions SET last_activity_at = now() WHERE id = v_session_id;
  END IF;

  RETURN to_jsonb(v_order);
END; $$;
REVOKE ALL ON FUNCTION create_order(uuid,uuid,jsonb,text,text,text,text,text,text,text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION create_order(uuid,uuid,jsonb,text,text,text,text,text,text,text,text,text) TO anon;

-- ============================================================
-- 7) staff_create_order = 030 + gắn phiên ở quán postpay
--    GIỮ NGUYÊN chữ ký 5 tham số (review P1-3): KHÔNG nhận p_session_id từ client — RPC tự tìm
--    phiên từ bàn đã validate, nên không có gì để client nói dối, và không phải drop/tạo lại.
--    Nhân viên KHÔNG BAO GIỜ bị khoá phiên chặn: họ đứng cạnh khách (spec §6.3).
-- ============================================================
CREATE OR REPLACE FUNCTION staff_create_order(
  p_table_id          uuid,
  p_items             jsonb,
  p_payment_method    text,
  p_client_request_id uuid,
  p_note              text default null
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_store        uuid;
  v_role         text;
  v_order_id     uuid;
  v_total        int := 0;
  v_item         jsonb;
  v_menu         menu_items%rowtype;
  v_qty          int;
  v_topping_ids  uuid[];
  v_item_tops    jsonb;
  v_top_total    int;
  v_top_count    int;
  v_timing       text;
  v_session_id   uuid;
  v_instrument   text;
BEGIN
  -- 1) Ai đang gọi? store_id suy từ operator, KHÔNG tin client. is_active=false = không có quyền.
  select store_id, role into v_store, v_role
  from mevo_operators where user_id = v_uid and is_active;
  if v_store is null or v_role not in ('store_owner','store_staff') then
    raise exception 'Không có quyền đặt món hộ';
  end if;

  if p_client_request_id is null then
    raise exception 'Thiếu client_request_id';
  end if;

  select id into v_order_id from orders
  where store_id = v_store and client_request_id = p_client_request_id;
  if v_order_id is not null then
    return jsonb_build_object(
      'order_id',   v_order_id,
      'total',      (select total_amount from orders where id = v_order_id),
      'idempotent', true,
      'items',      coalesce((select jsonb_agg(to_jsonb(oi))
                              from order_items oi where oi.order_id = v_order_id), '[]'::jsonb)
    );
  end if;

  if not exists (
    select 1 from tables
    where id = p_table_id and store_id = v_store and is_active
  ) then
    raise exception 'Bàn không thuộc quán hoặc đã ngừng dùng';
  end if;

  select payment_timing into v_timing from stores where id = v_store;

  if v_timing = 'postpay' then
    -- Trả sau: phương tiện thật quyết định lúc chốt bill, không phải lúc đặt.
    p_payment_method := 'cash';
    v_instrument     := null;

    v_session_id := open_session_id_for_table(p_table_id);
    if v_session_id is null then
      -- host để NULL: khách quét QR sau đó sẽ nhận quyền (create_order §c)
      insert into table_sessions (store_id, table_id, opened_by)
      values (v_store, p_table_id, 'staff')
      on conflict do nothing
      returning id into v_session_id;
      if v_session_id is null then
        v_session_id := open_session_id_for_table(p_table_id);
      end if;
    end if;
    if v_session_id is null then raise exception 'Không mở được phiên cho bàn này'; end if;
    perform 1 from table_sessions where id = v_session_id for update;   -- cùng thứ tự khoá
  else
    if p_payment_method not in ('cash','bank_transfer') then
      raise exception 'Phương thức không hợp lệ cho đơn đặt hộ: %', p_payment_method;
    end if;
    v_instrument := case p_payment_method when 'bank_transfer' then 'bank' else 'cash' end;
  end if;

  -- Giờ phục vụ: ân hạn cho phiên đang mở (PB6), giống create_order
  if not store_accepting_now(v_store)
     and not exists (
       select 1 from table_sessions
        where id = v_session_id and opened_at > now() - interval '2 hours'
     ) then
    raise exception 'Quán đang tạm nghỉ hoặc ngoài giờ phục vụ';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Đơn phải có ít nhất một món';
  end if;

  insert into orders (
    store_id, table_id, total_amount, payment_method, status,
    note, order_source, created_by, client_request_id, payment_instrument, session_id
  ) values (
    v_store, p_table_id, 0, p_payment_method, 'pending',
    p_note, 'staff', v_uid, p_client_request_id, v_instrument, v_session_id
  )
  on conflict (store_id, client_request_id) where client_request_id is not null
  do nothing
  returning id into v_order_id;

  if v_order_id is null then
    select id into v_order_id from orders
    where store_id = v_store and client_request_id = p_client_request_id;
    return jsonb_build_object(
      'order_id',   v_order_id,
      'total',      (select total_amount from orders where id = v_order_id),
      'idempotent', true,
      'items',      coalesce((select jsonb_agg(to_jsonb(oi))
                              from order_items oi where oi.order_id = v_order_id), '[]'::jsonb)
    );
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'quantity')::int, 0);
    if v_qty <= 0 then raise exception 'Số lượng không hợp lệ'; end if;

    select * into v_menu from menu_items
    where id = (v_item->>'menu_item_id')::uuid
      and store_id = v_store
      and is_available = true;
    if not found then
      raise exception 'Món không thuộc quán hoặc ngừng bán: %', v_item->>'menu_item_id';
    end if;

    v_item_tops := '[]'::jsonb; v_top_total := 0;
    if v_item ? 'topping_ids' and jsonb_typeof(v_item->'topping_ids') = 'array'
       and jsonb_array_length(v_item->'topping_ids') > 0 then
      select array_agg(distinct value::uuid) into v_topping_ids
        from jsonb_array_elements_text(v_item->'topping_ids');
      select
        coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'price',t.price)
                 order by t.sort_order, t.created_at), '[]'::jsonb),
        coalesce(sum(t.price),0), count(*)
      into v_item_tops, v_top_total, v_top_count
      from toppings t
      join menu_item_toppings mit on mit.topping_id = t.id and mit.menu_item_id = v_menu.id
      where t.id = any(v_topping_ids) and t.store_id = v_store and t.is_available = true;
      if v_top_count <> array_length(v_topping_ids,1) then
        raise exception 'Topping không hợp lệ / chưa gán cho món / ngừng bán: %', v_menu.name;
      end if;
    end if;

    insert into order_items (order_id, menu_item_id, item_name, item_price, quantity, note, selected_toppings)
    values (v_order_id, v_menu.id, v_menu.name, v_menu.price, v_qty,
            nullif(v_item->>'note',''), v_item_tops);

    v_total := v_total + (v_menu.price + v_top_total) * v_qty;
  end loop;

  update orders set total_amount = v_total, payment_amount = v_total where id = v_order_id;

  if v_session_id is not null then
    update table_sessions set last_activity_at = now() where id = v_session_id;
  end if;

  return jsonb_build_object(
    'order_id',   v_order_id,
    'total',      v_total,
    'idempotent', false,
    'items',      coalesce((select jsonb_agg(to_jsonb(oi))
                            from order_items oi where oi.order_id = v_order_id), '[]'::jsonb)
  );
end $$;
revoke all on function staff_create_order(uuid, jsonb, text, uuid, text) from public;
revoke all on function staff_create_order(uuid, jsonb, text, uuid, text) from anon;
grant execute on function staff_create_order(uuid, jsonb, text, uuid, text) to authenticated;

-- ============================================================
-- 8) RPC phiên bàn
--    Nhóm authenticated chấp nhận CẢ store_owner LẪN store_staff của đúng quán, suy store_id
--    từ mevo_operators (is_store_scoped_operator) — KHÔNG tin client, theo nếp staff_create_order.
-- ============================================================

-- (a) Trạng thái phiên cho mini-app. Đây chỉ là LỚP HIỂN THỊ — chốt chặn thật nằm trong
--     create_order (client luôn có thể là bản cũ, đúng bài học mig 037).
--     ⚠️ Máy bị khoá KHÔNG được thấy session_id / host id (review P0-2) — chỉ thấy opened_at.
create or replace function get_table_session_state(
  p_table_id uuid, p_zalo_user_id text default null, p_device_id text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_store uuid; v_timing text; v_s table_sessions%rowtype;
  v_count int; v_total bigint;
begin
  select t.store_id into v_store from tables t where t.id = p_table_id and t.is_active;
  if v_store is null then return jsonb_build_object('mode','prepay','state','free'); end if;

  select payment_timing into v_timing from stores where id = v_store;
  if v_timing <> 'postpay' then return jsonb_build_object('mode','prepay'); end if;

  perform expire_stale_table_sessions(v_store);   -- lazy on-read (§6.7)

  select * into v_s from table_sessions
   where id = open_session_id_for_table(p_table_id);
  if not found then
    return jsonb_build_object('mode','postpay','state','free');
  end if;

  -- Phiên chưa có chủ (nhân viên mở hộ) -> khách này sẽ nhận quyền khi tạo đơn đầu tiên.
  if not (
       (v_s.host_zalo_user_id is null and v_s.host_device_id is null)
    or (p_zalo_user_id is not null and v_s.host_zalo_user_id = p_zalo_user_id)
    or (p_device_id   is not null and v_s.host_device_id   = p_device_id)
  ) then
    return jsonb_build_object('mode','postpay','state','locked','opened_at',v_s.opened_at);
  end if;

  select count(*), coalesce(sum(total_amount),0) into v_count, v_total
    from orders where session_id = v_s.id and status <> 'cancelled';

  return jsonb_build_object(
    'mode','postpay', 'state','owner',
    'session_id', v_s.id, 'opened_at', v_s.opened_at,
    'order_count', v_count, 'total', v_total
  );
end $$;
revoke all on function get_table_session_state(uuid,text,text) from public;
grant execute on function get_table_session_state(uuid,text,text) to anon, authenticated;

-- (b) Bill CỦA CẢ PHIÊN cho khách (review P1-1).
--     get_session_orders (mig 008) chỉ lọc theo zalo_user_id nên SAI ở 4 ca mà spec chủ động
--     hỗ trợ: đơn nhân viên đặt hộ, sau khi chuyển quyền A->B, khách chỉ có device id, và
--     lệch giữa tổng phiên với danh sách chi tiết.
--     Nhận p_table_id (không nhận session id từ client) và chỉ trả khi caller khớp host.
create or replace function get_table_session_bill(
  p_table_id uuid, p_zalo_user_id text default null, p_device_id text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_s table_sessions%rowtype; v_orders jsonb; v_total bigint;
begin
  select * into v_s from table_sessions where id = open_session_id_for_table(p_table_id);
  if not found then return jsonb_build_object('found', false); end if;

  if not (
       (v_s.host_zalo_user_id is null and v_s.host_device_id is null)
    or (p_zalo_user_id is not null and v_s.host_zalo_user_id = p_zalo_user_id)
    or (p_device_id   is not null and v_s.host_device_id   = p_device_id)
  ) then
    return jsonb_build_object('found', false);   -- không phải chủ phiên: không lộ gì cả
  end if;

  select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb),
         coalesce(sum(x.total_amount), 0)
    into v_orders, v_total
  from (
    select o.id, o.status, o.created_at, o.total_amount, o.order_source,
           o.payment_received_at,
           coalesce((select jsonb_agg(jsonb_build_object(
                       'id', oi.id, 'name', oi.item_name, 'quantity', oi.quantity,
                       'price', oi.item_price, 'toppings', oi.selected_toppings))
                     from order_items oi where oi.order_id = o.id), '[]'::jsonb) as items
      from orders o
     where o.session_id = v_s.id and o.status <> 'cancelled'
  ) x;

  return jsonb_build_object(
    'found', true, 'session_id', v_s.id, 'opened_at', v_s.opened_at,
    'total', v_total, 'orders', v_orders
  );
end $$;
revoke all on function get_table_session_bill(uuid,text,text) from public;
grant execute on function get_table_session_bill(uuid,text,text) to anon, authenticated;

-- (c) Danh sách bàn đang mở cho màn /staff/tables.
--     Trả CẢ phiên đã hết hạn mà còn đơn chưa thu tiền (needs_review) — nếu không, bill quá 6h
--     biến mất khỏi màn nhân viên và thành công nợ rời rạc (review P2-1).
create or replace function list_open_table_sessions(p_store_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rows jsonb;
begin
  if not is_store_scoped_operator(p_store_id) then
    raise exception 'Không có quyền';
  end if;

  perform expire_stale_table_sessions(p_store_id);

  select coalesce(jsonb_agg(r order by r.opened_at), '[]'::jsonb) into v_rows
  from (
    select s.id             as session_id,
           s.table_id,
           t.table_number,
           s.status,
           s.close_reason,
           s.opened_at,
           s.opened_by,
           s.last_activity_at,
           (s.host_zalo_user_id is not null or s.host_device_id is not null) as has_host,
           (s.status = 'closed') as needs_review,
           coalesce(a.order_count, 0)   as order_count,
           coalesce(a.total, 0)          as total,
           coalesce(a.unpaid_total, 0)   as unpaid_total,
           coalesce(a.cooking_count, 0)  as cooking_count,
           coalesce(a.orders, '[]'::jsonb) as orders
      from table_sessions s
      join tables t on t.id = s.table_id
      left join lateral (
        select count(*)                                                   as order_count,
               sum(o.total_amount)                                        as total,
               sum(o.total_amount) filter (where o.payment_received_at is null) as unpaid_total,
               count(*) filter (where o.status in ('pending','confirmed','cooking'))   as cooking_count,
               jsonb_agg(jsonb_build_object(
                 'id', o.id, 'status', o.status, 'created_at', o.created_at,
                 'total_amount', o.total_amount, 'order_source', o.order_source,
                 'payment_received_at', o.payment_received_at,
                 'items', coalesce((select jsonb_agg(jsonb_build_object(
                             'name', oi.item_name, 'quantity', oi.quantity))
                           from order_items oi where oi.order_id = o.id), '[]'::jsonb)
               ) order by o.created_at) as orders
          from orders o
         where o.session_id = s.id and o.status <> 'cancelled'
      ) a on true
     where s.store_id = p_store_id
       and (
         s.status = 'open'
         or (s.close_reason = 'expired' and exists (
              select 1 from orders o
               where o.session_id = s.id and o.status <> 'cancelled'
                 and o.payment_received_at is null))
       )
  ) r;

  return v_rows;
end $$;
revoke all on function list_open_table_sessions(uuid) from public;
revoke all on function list_open_table_sessions(uuid) from anon;
grant execute on function list_open_table_sessions(uuid) to authenticated;

-- (d) Thu tiền & đóng bàn / Bỏ bàn.
--     ⚠️ review P0-3: KHOÁ phiên FOR UPDATE TRƯỚC khi tính tổng và settle. Không có bước này
--     thì khách gọi thêm đúng lúc nhân viên đóng bill -> phiên ghi "đã thanh toán" mà bên trong
--     còn công nợ.
--     ⚠️ review P1-4: settlement LOẠI đơn đã huỷ — đơn huỷ không nằm trong số tiền khách trả.
create or replace function close_table_session(
  p_session_id uuid, p_reason text, p_instrument text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_s table_sessions%rowtype;
  v_uid uuid := auth.uid();
  v_settled int := 0; v_cancelled int := 0; v_left int := 0; v_total bigint := 0;
begin
  if p_reason not in ('paid','staff_reset') then
    raise exception 'Lý do đóng bàn không hợp lệ: %', p_reason;
  end if;

  select * into v_s from table_sessions where id = p_session_id for update;
  if not found then raise exception 'Không tìm thấy phiên'; end if;
  if not is_store_scoped_operator(v_s.store_id) then raise exception 'Không có quyền'; end if;
  if v_uid is null then raise exception 'Thiếu danh tính người chốt bill'; end if;

  -- Idempotent: giữ nguyên người xác nhận ĐẦU TIÊN, không ghi đè (nếp confirm_manual_payment).
  -- Phiên 'expired' KHÔNG tính là đã chốt — nhân viên vẫn thu tiền được (review P2-1).
  if v_s.status = 'closed' and v_s.close_reason in ('paid','staff_reset') then
    select coalesce(sum(total_amount),0) into v_total
      from orders where session_id = p_session_id and status <> 'cancelled';
    return jsonb_build_object('ok', true, 'already', true,
      'orders_settled', 0, 'orders_cancelled', 0, 'orders_left_in_kitchen', 0, 'total', v_total);
  end if;

  if p_reason = 'paid' then
    if p_instrument is null or p_instrument not in ('cash','bank') then
      raise exception 'Phương tiện thanh toán không hợp lệ: %', coalesce(p_instrument,'(trống)');
    end if;
    update orders
       set payment_received_at  = now(),
           payment_received_via = 'staff',
           payment_received_by  = v_uid,
           payment_instrument   = p_instrument
     where session_id = p_session_id
       and status <> 'cancelled'
       and payment_received_at is null;
    get diagnostics v_settled = row_count;
    -- Đơn 'ready' tự thành 'paid' nhờ trigger trg_auto_complete_dine_in (mig 031).
  else
    -- Bỏ bàn (đơn ma — PB2): huỷ đơn chưa nấu và chưa có tiền; đơn đã vào bếp giữ nguyên.
    update orders set status = 'cancelled'
     where session_id = p_session_id
       and status in ('pending','confirmed')
       and payment_received_at is null;
    get diagnostics v_cancelled = row_count;
    select count(*) into v_left from orders
     where session_id = p_session_id and status in ('cooking','ready');
  end if;

  select coalesce(sum(total_amount),0) into v_total
    from orders where session_id = p_session_id and status <> 'cancelled';

  update table_sessions
     set status       = 'closed',
         closed_at    = coalesce(closed_at, now()),
         closed_by    = v_uid,
         close_reason = p_reason
   where id = p_session_id;

  return jsonb_build_object('ok', true, 'already', false,
    'orders_settled', v_settled, 'orders_cancelled', v_cancelled,
    'orders_left_in_kitchen', v_left, 'total', v_total);
end $$;
revoke all on function close_table_session(uuid,text,text) from public;
revoke all on function close_table_session(uuid,text,text) from anon;
grant execute on function close_table_session(uuid,text,text) to authenticated;

-- (e) Chuyển quyền gọi món: nhả chủ phiên, phiên vẫn mở. Máy nào gọi món tiếp theo thành chủ.
--     Dùng khi khách A hết pin / đưa máy cho người khác (PB1 — đường thoát rẻ tiền).
create or replace function release_table_session_host(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_s table_sessions%rowtype;
begin
  select * into v_s from table_sessions where id = p_session_id for update;
  if not found then raise exception 'Không tìm thấy phiên'; end if;
  if not is_store_scoped_operator(v_s.store_id) then raise exception 'Không có quyền'; end if;
  if v_s.status <> 'open' then raise exception 'Phiên đã đóng'; end if;

  update table_sessions
     set host_zalo_user_id = null, host_device_id = null, last_activity_at = now()
   where id = p_session_id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function release_table_session_host(uuid) from public;
revoke all on function release_table_session_host(uuid) from anon;
grant execute on function release_table_session_host(uuid) to authenticated;

-- ============================================================
-- 9) get_daily_revenue — cột "chờ thu"
--    Luật cũ lọc payment_method in ('cash','bank_transfer') nên (a) bỏ sót đơn khách chuyển
--    khoản qua Zalo Checkout mà admin-web/lib/revenue.ts ĐANG đếm -> hai màn báo hai số,
--    (b) sẽ bỏ sót nếu sau này đơn trả sau mang phương thức khác.
--    Luật mới = đúng isAwaitingPayment() + đơn phiên. PHẢI khớp y hệt revenue.ts (mig 030 §7).
-- ============================================================
create or replace function get_daily_revenue(
  p_store_id uuid,
  p_date date default current_date
)
returns table (
  total_revenue bigint,
  total_orders  bigint,
  paid_orders   bigint,
  cash_pending  bigint
) language sql stable as $$
  with tinh as (
    select
      total_amount,
      (
        (payment_received_at is not null and status <> 'cancelled')
        or (payment_method = 'cash' and status = 'paid')                 -- legacy
      ) as da_co_tien,
      (payment_received_at is null
       and status not in ('paid','cancelled')
       and (session_id is not null or payment_instrument is distinct from 'wallet')) as cho_thu
    from orders
    where store_id = p_store_id
      and created_at >= p_date::timestamptz
      and created_at <  (p_date + interval '1 day')::timestamptz
  )
  select
    coalesce(sum(total_amount) filter (where da_co_tien), 0)::bigint,
    count(*)::bigint,
    count(*) filter (where da_co_tien)::bigint,
    count(*) filter (where cho_thu)::bigint
  from tinh;
$$;

-- ============================================================
-- 10) Bịt cửa hậu abandon_zalopay_to_cash (spec §9 rủi ro #9)
--     RPC grant cho anon, đổi đơn zalo_checkout đang pending sang cash. Khách có
--     capability_token (do chính create_order trả về) nên gọi thẳng Supabase là LÁCH ĐƯỢC prepay.
--     Không UI nào còn gọi nó (abandonToCash ở mini-app là code chết) -> chỉ bịt, xoá hẳn hàm
--     để cùng sprint thanh toán.
-- ============================================================
CREATE OR REPLACE FUNCTION abandon_zalopay_to_cash(p_order_id uuid, p_token text)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order orders%ROWTYPE;
BEGIN
  IF EXISTS (
    SELECT 1 FROM orders o JOIN stores s ON s.id = o.store_id
     WHERE o.id = p_order_id AND s.payment_timing = 'prepay'
  ) THEN
    RAISE EXCEPTION 'Quán yêu cầu thanh toán trước khi bếp làm.';
  END IF;

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

-- ============================================================
-- 11) Realtime publication
--     ⚠️ service_requests CHƯA BAO GIỜ nằm trong publication: kitchen-display.tsx có subscribe
--     postgres_changes bảng này (dòng ~451) nhưng Postgres không phát sự kiện -> nút chuông
--     "Gọi nhân viên"/"Gọi thanh toán" bấm xong KHÔNG ai nghe thấy. Luồng trả sau dùng lại
--     đúng nút đó nên phải vá ở đây.
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and tablename = 'table_sessions') then
    alter publication supabase_realtime add table table_sessions;
  end if;
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and tablename = 'service_requests') then
    alter publication supabase_realtime add table service_requests;
  end if;
end $$;

-- Bắt PostgREST nạp lại schema cache sau khi drop/tạo lại create_order
notify pgrst, 'reload schema';
