// BL-3 Task 4 — preorder phải luôn do server định giá và có revision bất biến.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { after, before } from 'node:test'
import { pathToFileURL } from 'node:url'

const pgliteModule = process.env.PGLITE_MODULE
  ? process.env.PGLITE_MODULE.startsWith('file:') ? process.env.PGLITE_MODULE : pathToFileURL(process.env.PGLITE_MODULE).href
  : '@electric-sql/pglite'
const { PGlite } = await import(pgliteModule)
const db = new PGlite()
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const store = id(660)
const reservation = id(661)
const menuItem = id(662)
const token = 'a'.repeat(64)

async function asAnon(sql, args) {
  await db.exec('SET LOCAL ROLE anon')
  return (await db.query(sql, args)).rows[0]?.value
}

async function rejected(fn, expected) {
  await db.exec('SAVEPOINT expected_error')
  await assert.rejects(fn, expected)
  await db.exec('ROLLBACK TO SAVEPOINT expected_error')
}

before(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE public.stores(id uuid PRIMARY KEY, payment_timing text NOT NULL DEFAULT 'postpay', payment_methods text[] NOT NULL DEFAULT ARRAY['cash']);
    CREATE TABLE public.store_workflow_settings(store_id uuid PRIMARY KEY REFERENCES public.stores(id), reservation_preorder_enabled boolean NOT NULL DEFAULT true);
    CREATE TABLE public.reservations(
      id uuid PRIMARY KEY, store_id uuid NOT NULL REFERENCES public.stores(id), customer_token_hash text NOT NULL,
      status text NOT NULL, arrival_at timestamptz NOT NULL, reservation_preorder_edit_cutoff_minutes integer NOT NULL DEFAULT 30,
      UNIQUE(id, store_id)
    );
    CREATE TABLE public.orders(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid NOT NULL REFERENCES public.stores(id), reservation_id uuid,
      table_id uuid, session_id uuid, order_type text NOT NULL DEFAULT 'dine_in', order_source text NOT NULL DEFAULT 'customer_zalo',
      status text NOT NULL DEFAULT 'pending', total_amount integer NOT NULL DEFAULT 0, payment_amount integer NOT NULL DEFAULT 0,
      payment_method text, payment_instrument text, client_request_id uuid, note text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE public.menu_items(id uuid PRIMARY KEY, store_id uuid NOT NULL REFERENCES public.stores(id), name text NOT NULL, price integer NOT NULL, is_available boolean NOT NULL DEFAULT true);
    CREATE TABLE public.order_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE, menu_item_id uuid NOT NULL, item_name text NOT NULL, item_price integer NOT NULL, quantity integer NOT NULL, note text, variant_id uuid, variant_name text, selected_toppings jsonb NOT NULL DEFAULT '[]'::jsonb, void_type text);
    CREATE FUNCTION public.reservation_customer_token_hash(p_token text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT p_token $$;
    CREATE FUNCTION public.add_order_line(p_order_id uuid, p_store_id uuid, p_item jsonb) RETURNS void LANGUAGE plpgsql AS $$
    DECLARE m public.menu_items%ROWTYPE; BEGIN
      SELECT * INTO m FROM public.menu_items WHERE id=(p_item->>'menu_item_id')::uuid AND store_id=p_store_id AND is_available;
      IF NOT FOUND THEN RAISE EXCEPTION 'Món không còn phục vụ'; END IF;
      INSERT INTO public.order_items(order_id,menu_item_id,item_name,item_price,quantity,note) VALUES(p_order_id,m.id,m.name,m.price,(p_item->>'quantity')::integer,NULLIF(p_item->>'note',''));
    END $$;
    CREATE FUNCTION public.recompute_order_total(p_order_id uuid) RETURNS integer LANGUAGE plpgsql AS $$ DECLARE t integer; BEGIN SELECT COALESCE(sum(item_price*quantity),0) INTO t FROM public.order_items WHERE order_id=p_order_id AND void_type IS NULL; UPDATE public.orders SET total_amount=t WHERE id=p_order_id; RETURN t; END $$;
    ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY; ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA public TO anon, authenticated; GRANT SELECT ON public.orders, public.order_items TO anon;
    INSERT INTO public.stores(id) VALUES('${store}');
    INSERT INTO public.store_workflow_settings(store_id) VALUES('${store}');
    INSERT INTO public.reservations(id,store_id,customer_token_hash,status,arrival_at) VALUES('${reservation}','${store}','${token}','confirmed',now()+interval '2 hours');
    INSERT INTO public.menu_items(id,store_id,name,price) VALUES('${menuItem}','${store}','Lẩu gà',120000);
  `)
  await db.exec(await readFile(new URL('../migrations/066_reservation_preorders.sql', import.meta.url), 'utf8'))
})

after(async () => { await db.close() })

test('migration 066 định nghĩa RPC preorder theo capability và revision', async () => {
  const sql = await readFile(new URL('../migrations/066_reservation_preorders.sql', import.meta.url), 'utf8')
  for (const name of [
    'submit_reservation_preorder',
    'revise_reservation_preorder',
    'cancel_reservation_preorder',
    'get_customer_reservation_preorders',
    'reservation_preorder_revisions',
    'reservation_preorder_print_jobs',
  ]) assert.match(sql, new RegExp(name))
})

test('contract chặn giá client và dùng revision/version guard', async () => {
  const sql = await readFile(new URL('../migrations/066_reservation_preorders.sql', import.meta.url), 'utf8')
  assert.match(sql, /p_expected_revision integer/)
  assert.match(sql, /p_client_request_id uuid/)
  assert.match(sql, /public\.add_order_line\(/)
  assert.doesNotMatch(sql, /p_items->>'price'/)
  assert.match(sql, /NEW\.order_source\s*=\s*'reservation_preorder'/)
})

test('submit chỉ hoạt động cho quán đã cấu hình postpay tiền mặt và giới hạn ghi chú', async () => {
  const sql = await readFile(new URL('../migrations/066_reservation_preorders.sql', import.meta.url), 'utf8')
  assert.match(sql, /payment_timing\s*=\s*'postpay'/)
  assert.match(sql, /payment_methods\s*@>\s*ARRAY\['cash'\]/)
  assert.match(sql, /char_length\(normalized_note\).*1000/)
})

test('retry cùng request id kiểm payload và hủy có audit idempotent', async () => {
  const sql = await readFile(new URL('../migrations/066_reservation_preorders.sql', import.meta.url), 'utf8')
  assert.match(sql, /preorder_request_payload_mismatch/)
  assert.match(sql, /reservation_preorder_mutations/)
  assert.match(sql, /UNIQUE\s*\(order_id,\s*client_request_id\)/)
  assert.match(sql, /preorder_revision_json\(o,\s*existing\.result_revision\)/)
})

test('RPC chạy thật: token, giá server, retry và revision được bảo toàn', async () => {
  await db.exec('BEGIN')
  try {
    const requestId = id(663)
    const items = [{ menu_item_id: menuItem, quantity: 2, price: 1 }]
    const first = await asAnon('SELECT submit_reservation_preorder($1,$2,$3,$4::jsonb,$5) AS value', [reservation, token, requestId, JSON.stringify(items), 'Ít cay'])
    assert.equal(first.revision, 1)
    assert.equal(first.total_amount, 240000)
    assert.equal(first.needs_pos_review, true)
    // Anon không thể liệt kê preorder dù biết REST table name; chỉ RPC có token mới trả projection.
    assert.equal((await db.query('SELECT count(*)::int AS n FROM public.orders')).rows[0].n, 0)
    await db.exec('RESET ROLE')
    assert.equal((await db.query('SELECT count(*)::int AS n FROM public.orders')).rows[0].n, 1)

    const replay = await asAnon('SELECT submit_reservation_preorder($1,$2,$3,$4::jsonb,$5) AS value', [reservation, token, requestId, JSON.stringify(items), 'Ít cay'])
    assert.equal(replay.order_id, first.order_id)
    await rejected(() => asAnon('SELECT submit_reservation_preorder($1,$2,$3,$4::jsonb,$5) AS value', [reservation, token, requestId, JSON.stringify([{ menu_item_id: menuItem, quantity: 1 }]), 'Ít cay']), /preorder_request_payload_mismatch/)
    await rejected(() => asAnon('SELECT revise_reservation_preorder($1,$2,$3,$4,$5::jsonb,$6) AS value', [first.order_id, 'b'.repeat(64), 1, id(664), JSON.stringify(items), null]), /Không có quyền/)

    const revised = await asAnon('SELECT revise_reservation_preorder($1,$2,$3,$4,$5::jsonb,$6) AS value', [first.order_id, token, 1, id(665), JSON.stringify([{ menu_item_id: menuItem, quantity: 1 }]), null])
    assert.equal(revised.revision, 2)
    assert.equal(revised.total_amount, 120000)
    await rejected(() => asAnon('SELECT revise_reservation_preorder($1,$2,$3,$4,$5::jsonb,$6) AS value', [first.order_id, token, 1, id(666), JSON.stringify(items), null]), /vừa được thay đổi/)
  } finally { await db.exec('ROLLBACK'); await db.exec('RESET ROLE') }
})

test('RPC từ chối trạng thái/cấu hình không hợp lệ và tôn trọng cutoff kể cả đã release', async () => {
  await db.exec('BEGIN')
  try {
    const pendingReservation = id(670)
    await db.query("INSERT INTO public.reservations(id,store_id,customer_token_hash,status,arrival_at) VALUES($1,$2,$3,'pending',now()+interval '2 hours')", [pendingReservation, store, token])
    await rejected(() => asAnon('SELECT submit_reservation_preorder($1,$2,$3,$4::jsonb,$5)', [pendingReservation, token, id(671), JSON.stringify([{ menu_item_id: menuItem, quantity: 1 }]), null]), /Chỉ đặt món trước sau khi quán xác nhận/)

    const prepayStore = id(672)
    const prepayReservation = id(673)
    await db.query("INSERT INTO public.stores(id,payment_timing,payment_methods) VALUES($1,'prepay',ARRAY['zalo_checkout'])", [prepayStore])
    await db.query('INSERT INTO public.store_workflow_settings(store_id) VALUES($1)', [prepayStore])
    await db.query("INSERT INTO public.reservations(id,store_id,customer_token_hash,status,arrival_at) VALUES($1,$2,$3,'confirmed',now()+interval '2 hours')", [prepayReservation, prepayStore, token])
    await rejected(() => asAnon('SELECT submit_reservation_preorder($1,$2,$3,$4::jsonb,$5)', [prepayReservation, token, id(674), JSON.stringify([{ menu_item_id: menuItem, quantity: 1 }]), null]), /Cấu hình quán chưa hỗ trợ/)

    const batch = await asAnon('SELECT submit_reservation_preorder($1,$2,$3,$4::jsonb,$5) AS value', [reservation, token, id(675), JSON.stringify([{ menu_item_id: menuItem, quantity: 1 }]), null])
    await db.exec('RESET ROLE')
    await db.query("UPDATE public.orders SET released_preorder_revision=1, preorder_edit_deadline=now()+interval '5 minutes' WHERE id=$1", [batch.order_id])
    const editableAfterRelease = await asAnon('SELECT revise_reservation_preorder($1,$2,$3,$4,$5::jsonb,$6) AS value', [batch.order_id, token, 1, id(676), JSON.stringify([{ menu_item_id: menuItem, quantity: 2 }]), null])
    assert.equal(editableAfterRelease.revision, 2)
    await db.exec('RESET ROLE')
    await db.query('UPDATE public.orders SET preorder_edit_deadline=now() WHERE id=$1', [batch.order_id])
    await rejected(() => asAnon('SELECT revise_reservation_preorder($1,$2,$3,$4,$5::jsonb,$6)', [batch.order_id, token, 2, id(677), JSON.stringify([{ menu_item_id: menuItem, quantity: 1 }]), null]), /Đã quá thời hạn chỉnh món/)
    await rejected(() => asAnon('SELECT cancel_reservation_preorder($1,$2,$3,$4)', [batch.order_id, token, 2, id(678)]), /Đã quá thời hạn hủy món/)
  } finally { await db.exec('ROLLBACK'); await db.exec('RESET ROLE') }
})
