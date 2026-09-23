// Bảo Lương: món đặt trước là snapshot ngay sau lần gửi đầu tiên.
import { test, after, before } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const pgliteModule = process.env.PGLITE_MODULE
  ? process.env.PGLITE_MODULE.startsWith('file:') ? process.env.PGLITE_MODULE : pathToFileURL(process.env.PGLITE_MODULE).href
  : '@electric-sql/pglite'
const { PGlite } = await import(pgliteModule)
const db = new PGlite()
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const store = id(710), reservation = id(711), menuItem = id(712), token = 'a'.repeat(64)

async function asAnon(sql, args) { await db.exec('SET LOCAL ROLE anon'); return (await db.query(sql, args)).rows[0]?.value }
async function rejected(fn, expected) { await db.exec('SAVEPOINT expected_error'); await assert.rejects(fn, expected); await db.exec('ROLLBACK TO SAVEPOINT expected_error') }

before(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE public.stores(id uuid PRIMARY KEY, payment_timing text NOT NULL DEFAULT 'postpay', payment_methods text[] NOT NULL DEFAULT ARRAY['cash']);
    CREATE TABLE public.store_workflow_settings(store_id uuid PRIMARY KEY REFERENCES public.stores(id), reservation_preorder_enabled boolean NOT NULL DEFAULT true);
    CREATE TABLE public.reservations(id uuid PRIMARY KEY,store_id uuid NOT NULL REFERENCES public.stores(id),customer_token_hash text NOT NULL,status text NOT NULL,arrival_at timestamptz NOT NULL,reservation_preorder_edit_cutoff_minutes integer NOT NULL DEFAULT 30,UNIQUE(id,store_id));
    CREATE TABLE public.orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid NOT NULL REFERENCES public.stores(id),reservation_id uuid,table_id uuid,session_id uuid,order_type text NOT NULL DEFAULT 'dine_in',order_source text NOT NULL DEFAULT 'customer_zalo',status text NOT NULL DEFAULT 'pending',total_amount integer NOT NULL DEFAULT 0,payment_amount integer NOT NULL DEFAULT 0,payment_method text,payment_instrument text,client_request_id uuid,note text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.menu_items(id uuid PRIMARY KEY,store_id uuid NOT NULL REFERENCES public.stores(id),name text NOT NULL,price integer NOT NULL,is_available boolean NOT NULL DEFAULT true);
    CREATE TABLE public.order_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,menu_item_id uuid NOT NULL,item_name text NOT NULL,item_price integer NOT NULL,quantity integer NOT NULL,note text,variant_id uuid,variant_name text,selected_toppings jsonb NOT NULL DEFAULT '[]'::jsonb,void_type text);
    CREATE FUNCTION public.reservation_customer_token_hash(p_token text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT p_token $$;
    CREATE FUNCTION public.add_order_line(p_order_id uuid,p_store_id uuid,p_item jsonb) RETURNS void LANGUAGE plpgsql AS $$ DECLARE m public.menu_items%ROWTYPE; BEGIN SELECT * INTO m FROM public.menu_items WHERE id=(p_item->>'menu_item_id')::uuid AND store_id=p_store_id AND is_available; IF NOT FOUND THEN RAISE EXCEPTION 'Món không còn phục vụ'; END IF; INSERT INTO public.order_items(order_id,menu_item_id,item_name,item_price,quantity,note) VALUES(p_order_id,m.id,m.name,m.price,(p_item->>'quantity')::integer,NULLIF(p_item->>'note','')); END $$;
    CREATE FUNCTION public.recompute_order_total(p_order_id uuid) RETURNS integer LANGUAGE plpgsql AS $$ DECLARE t integer; BEGIN SELECT COALESCE(sum(item_price*quantity),0) INTO t FROM public.order_items WHERE order_id=p_order_id AND void_type IS NULL; UPDATE public.orders SET total_amount=t WHERE id=p_order_id; RETURN t; END $$;
    ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY; ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA public TO anon, authenticated; GRANT SELECT ON public.orders,public.order_items TO anon;
    INSERT INTO public.stores(id) VALUES('${store}'); INSERT INTO public.store_workflow_settings(store_id) VALUES('${store}');
    INSERT INTO public.reservations(id,store_id,customer_token_hash,status,arrival_at) VALUES('${reservation}','${store}','${token}','confirmed',now()+interval '2 hours');
    INSERT INTO public.menu_items(id,store_id,name,price) VALUES('${menuItem}','${store}','Lẩu gà',120000);
  `)
  await db.exec(await readFile(new URL('../migrations/066_reservation_preorders.sql', import.meta.url), 'utf8'))
  await db.exec(await readFile(new URL('../migrations/071_reservation_preorder_lock_on_submit.sql', import.meta.url), 'utf8'))
})
after(async () => { await db.close() })

test('khách gửi món xong không thể sửa, hủy hoặc tạo batch thứ hai', async () => {
  await db.exec('BEGIN')
  try {
    const items = JSON.stringify([{ menu_item_id: menuItem, quantity: 1 }])
    const first = await asAnon('SELECT submit_reservation_preorder($1,$2,$3,$4::jsonb,$5) AS value', [reservation, token, id(713), items, null])
    assert.equal(first.can_edit, false)
    assert.equal(first.can_cancel, false)
    assert.equal(first.customer_message, 'Đã gửi món đặt trước. Món đã chốt, vui lòng gọi thêm tại quán nếu cần.')
    await rejected(() => asAnon('SELECT revise_reservation_preorder($1,$2,$3,$4,$5::jsonb,$6)', [first.order_id, token, 1, id(714), items, null]), /đã khóa ngay sau khi gửi/)
    await rejected(() => asAnon('SELECT cancel_reservation_preorder($1,$2,$3,$4)', [first.order_id, token, 1, id(715)]), /đã khóa ngay sau khi gửi/)
    await rejected(() => asAnon('SELECT submit_reservation_preorder($1,$2,$3,$4::jsonb,$5)', [reservation, token, id(716), items, null]), /Món đặt trước đã gửi/)
    const replay = await asAnon('SELECT submit_reservation_preorder($1,$2,$3,$4::jsonb,$5) AS value', [reservation, token, id(713), items, null])
    assert.equal(replay.order_id, first.order_id)
  } finally { await db.exec('ROLLBACK'); await db.exec('RESET ROLE') }
})
