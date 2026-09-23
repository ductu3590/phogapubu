// BL-3 Task 5 — preorder phải đi nguyên order ID vào bill khi khách đến.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const pgliteModule = process.env.PGLITE_MODULE
  ? process.env.PGLITE_MODULE.startsWith('file:') ? process.env.PGLITE_MODULE : pathToFileURL(process.env.PGLITE_MODULE).href
  : '@electric-sql/pglite'
const { PGlite } = await import(pgliteModule)
const db = new PGlite()
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const storeId = id(671)

before(async () => {
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '${id(679)}'::uuid $$;
    CREATE TABLE public.stores(id uuid PRIMARY KEY);
    CREATE TABLE public.reservations(
      id uuid PRIMARY KEY, store_id uuid NOT NULL, status text NOT NULL, arrival_at timestamptz NOT NULL,
      session_id uuid, reservation_preorder_edit_cutoff_minutes integer NOT NULL DEFAULT 30,
      cancelled_at timestamptz, cancelled_by uuid, updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE public.table_sessions(id uuid PRIMARY KEY, table_id uuid NOT NULL);
    CREATE TABLE public.orders(
      id uuid PRIMARY KEY, reservation_id uuid, store_id uuid NOT NULL, table_id uuid, session_id uuid,
      order_source text NOT NULL, status text NOT NULL DEFAULT 'pending', preorder_revision integer NOT NULL DEFAULT 1,
      released_preorder_revision integer NOT NULL DEFAULT 0, preorder_edit_deadline timestamptz,
      waste_review_required boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE public.reservation_preorder_print_jobs(id uuid PRIMARY KEY, order_id uuid NOT NULL);
    CREATE TABLE public.reservation_preorder_mutations(order_id uuid NOT NULL, client_request_id uuid NOT NULL, action text NOT NULL, payload jsonb NOT NULL, result_revision integer NOT NULL);
    CREATE FUNCTION public.is_store_owner_of(p_store_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
    CREATE FUNCTION public.reservation_operator_actor_kind(p_store_id uuid) RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'owner' $$;
    CREATE FUNCTION public.reservation_public_json(p public.reservations) RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('reservation_id', p.id, 'status', p.status) $$;
    CREATE FUNCTION public.append_reservation_event(uuid, uuid, uuid, text, text, jsonb, jsonb, text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN END $$;
    CREATE FUNCTION public.assert_preorder_customer(uuid, text) RETURNS public.reservations LANGUAGE plpgsql AS $$ DECLARE r public.reservations%ROWTYPE; BEGIN SELECT * INTO r FROM public.reservations WHERE id=$1 FOR UPDATE; RETURN r; END $$;
    CREATE FUNCTION public.preorder_customer_json(p public.orders) RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('order_id', p.id, 'status', p.status) $$;
    INSERT INTO public.stores VALUES ('${storeId}');
  `)
  await db.exec(await readFile(new URL('../migrations/067_reservation_preorder_lifecycle.sql', import.meta.url), 'utf8'))
})

after(async () => { await db.close() })

test('migration lifecycle định nghĩa settle preorder và hủy phía quán', async () => {
  const sql = await readFile(new URL('../migrations/067_reservation_preorder_lifecycle.sql', import.meta.url), 'utf8')
  assert.match(sql, /settle_reservation_preorders/)
  assert.match(sql, /cancel_store_reservation/)
  assert.match(sql, /trg_reservation_preorder_lifecycle_after/)
  assert.match(sql, /NEW\.status IN \('cancelled_by_customer', 'cancelled_by_store', 'no_show'\)/)
})

test('arrival giữ order ID và chỉ gắn preorder còn hiệu lực vào session', async () => {
  const sql = await readFile(new URL('../migrations/067_reservation_preorder_lifecycle.sql', import.meta.url), 'utf8')
  assert.match(sql, /UPDATE public\.orders[\s\S]*session_id\s*=\s*NEW\.session_id/)
  assert.match(sql, /order_source\s*=\s*'reservation_preorder'/)
  assert.match(sql, /status\s*<>\s*'cancelled'/)
})

test('hủy hoặc no-show không để preorder pending không có session', async () => {
  const sql = await readFile(new URL('../migrations/067_reservation_preorder_lifecycle.sql', import.meta.url), 'utf8')
  assert.match(sql, /waste_review_required\s*=\s*EXISTS/)
  assert.match(sql, /status\s*=\s*'cancelled'/)
  assert.match(sql, /cancelled_by_store/)
})

test('customer cancellation also locks reservation before order', async () => {
  const sql = await readFile(new URL('../migrations/067_reservation_preorder_lifecycle.sql', import.meta.url), 'utf8')
  const functionBody = sql.slice(sql.lastIndexOf('CREATE OR REPLACE FUNCTION public.cancel_reservation_preorder'))
  assert.ok(functionBody.indexOf('assert_preorder_customer') < functionBody.indexOf('WHERE id = p_order_id FOR UPDATE'))
})

test('lifecycle chạy thật: arrived giữ order ID, no-show/hủy không để pending mồ côi', async () => {
  const arrivedReservation = id(672)
  const arrivedOrder = id(673)
  const session = id(674)
  const table = id(675)
  const noShowReservation = id(676)
  const noShowOrder = id(677)
  const printedReservation = id(678)
  const printedOrder = id(680)
  const printJob = id(681)

  await db.exec('BEGIN')
  try {
    await db.query("INSERT INTO public.reservations(id,store_id,status,arrival_at,session_id) VALUES($1,$2,'confirmed',now()+interval '1 hour',NULL)", [arrivedReservation, storeId])
    await db.query("INSERT INTO public.orders(id,reservation_id,store_id,order_source,status) VALUES($1,$2,$3,'reservation_preorder','pending')", [arrivedOrder, arrivedReservation, storeId])
    await db.query('INSERT INTO public.table_sessions(id,table_id) VALUES($1,$2)', [session, table])
    await db.query("UPDATE public.reservations SET status='arrived', session_id=$2 WHERE id=$1", [arrivedReservation, session])
    const attached = (await db.query('SELECT id, session_id, table_id, status FROM public.orders WHERE id=$1', [arrivedOrder])).rows[0]
    assert.deepEqual(attached, { id: arrivedOrder, session_id: session, table_id: table, status: 'pending' })

    await db.query("INSERT INTO public.reservations(id,store_id,status,arrival_at) VALUES($1,$2,'confirmed',now()+interval '1 hour')", [noShowReservation, storeId])
    await db.query("INSERT INTO public.orders(id,reservation_id,store_id,order_source,status) VALUES($1,$2,$3,'reservation_preorder','pending')", [noShowOrder, noShowReservation, storeId])
    await db.query("UPDATE public.reservations SET status='no_show' WHERE id=$1", [noShowReservation])
    const noShow = (await db.query('SELECT status, waste_review_required FROM public.orders WHERE id=$1', [noShowOrder])).rows[0]
    assert.deepEqual(noShow, { status: 'cancelled', waste_review_required: false })

    await db.query("INSERT INTO public.reservations(id,store_id,status,arrival_at) VALUES($1,$2,'confirmed',now()+interval '1 hour')", [printedReservation, storeId])
    await db.query("INSERT INTO public.orders(id,reservation_id,store_id,order_source,status) VALUES($1,$2,$3,'reservation_preorder','pending')", [printedOrder, printedReservation, storeId])
    await db.query('INSERT INTO public.reservation_preorder_print_jobs(id,order_id) VALUES($1,$2)', [printJob, printedOrder])
    await db.query("SELECT public.cancel_store_reservation($1,$2)", [printedReservation, 'Quán đóng đột xuất'])
    const cancelled = (await db.query('SELECT status, waste_review_required FROM public.orders WHERE id=$1', [printedOrder])).rows[0]
    assert.deepEqual(cancelled, { status: 'cancelled', waste_review_required: true })
  } finally {
    await db.exec('ROLLBACK')
  }
})

test('khách không thể hủy booking khi preorder đã release/in; owner vẫn có thể kết thúc có lý do', async () => {
  const reservationId = id(682)
  const orderId = id(683)
  await db.exec('BEGIN')
  try {
    await db.query("INSERT INTO public.reservations(id,store_id,status,arrival_at) VALUES($1,$2,'confirmed',now()+interval '1 hour')", [reservationId, storeId])
    await db.query("INSERT INTO public.orders(id,reservation_id,store_id,order_source,status,released_preorder_revision) VALUES($1,$2,$3,'reservation_preorder','pending',1)", [orderId, reservationId, storeId])
    await db.exec('SAVEPOINT customer_cancel')
    await assert.rejects(
      () => db.query("UPDATE public.reservations SET status='cancelled_by_customer' WHERE id=$1", [reservationId]),
      /đã được quán chuẩn bị/,
    )
    await db.exec('ROLLBACK TO SAVEPOINT customer_cancel')
    await db.query("SELECT public.cancel_store_reservation($1,$2)", [reservationId, 'Khách báo hủy qua điện thoại'])
    assert.equal((await db.query('SELECT status FROM public.orders WHERE id=$1', [orderId])).rows[0].status, 'cancelled')
  } finally {
    await db.exec('ROLLBACK')
  }
})
