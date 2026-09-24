// BL-2C / Task 6 — release + in preorder phải bảo vệ tenant, revision và snapshot bất biến.
import { after, before, beforeEach, afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const pgliteModule = process.env.PGLITE_MODULE
  ? (process.env.PGLITE_MODULE.startsWith('file:') ? process.env.PGLITE_MODULE : pathToFileURL(process.env.PGLITE_MODULE).href)
  : '@electric-sql/pglite'
const { PGlite } = await import(pgliteModule)
const db = new PGlite()
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const store = id(690), otherStore = id(691), owner = id(692), staff = id(693), otherOwner = id(694)
const reservation = id(695), order = id(696), table = id(697), session = id(698)

async function login(user) {
  await db.exec('RESET ROLE')
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [user])
  await db.exec('SET LOCAL ROLE authenticated')
}
async function reject(fn, message) {
  await db.exec('SAVEPOINT expected_error')
  await assert.rejects(fn, message)
  await db.exec('ROLLBACK TO SAVEPOINT expected_error')
}
async function rpc(sql, args) { return (await db.query(sql, args)).rows[0].value }

before(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    CREATE TABLE public.stores(id uuid PRIMARY KEY);
    CREATE TABLE public.mevo_operators(user_id uuid PRIMARY KEY,store_id uuid,role text,is_active boolean NOT NULL DEFAULT true);
    CREATE FUNCTION public.is_store_owner_of(p_store_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
      SELECT EXISTS(SELECT 1 FROM public.mevo_operators WHERE user_id=auth.uid() AND store_id=p_store_id AND role='store_owner' AND is_active) $$;
    CREATE TABLE public.tables(id uuid PRIMARY KEY, store_id uuid NOT NULL REFERENCES public.stores(id), table_number text NOT NULL);
    CREATE TABLE public.table_sessions(id uuid PRIMARY KEY, store_id uuid NOT NULL REFERENCES public.stores(id));
    CREATE TABLE public.session_tables(session_id uuid NOT NULL REFERENCES public.table_sessions(id), table_id uuid NOT NULL REFERENCES public.tables(id), is_open boolean NOT NULL DEFAULT true);
    CREATE TABLE public.reservations(id uuid PRIMARY KEY,store_id uuid NOT NULL REFERENCES public.stores(id),customer_name text NOT NULL,customer_phone text NOT NULL,party_size integer NOT NULL,arrival_at timestamptz NOT NULL,status text NOT NULL,UNIQUE(id,store_id));
    CREATE TABLE public.orders(
      id uuid PRIMARY KEY,store_id uuid NOT NULL REFERENCES public.stores(id),reservation_id uuid,table_id uuid,session_id uuid,
      order_type text NOT NULL DEFAULT 'dine_in',order_source text NOT NULL,status text NOT NULL DEFAULT 'pending',
      total_amount integer NOT NULL DEFAULT 0,preorder_revision integer NOT NULL DEFAULT 0,released_preorder_revision integer NOT NULL DEFAULT 0,waste_review_required boolean NOT NULL DEFAULT false,
      confirmed_at timestamptz,confirmed_by uuid,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE public.reservation_preorder_revisions(order_id uuid NOT NULL REFERENCES public.orders(id),store_id uuid NOT NULL,reservation_id uuid NOT NULL,revision integer NOT NULL,items_snapshot jsonb NOT NULL,total_amount integer NOT NULL,note text,PRIMARY KEY(order_id,revision));
    CREATE TABLE public.reservation_preorder_print_jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid NOT NULL REFERENCES public.orders(id),store_id uuid NOT NULL,revision integer NOT NULL,kind text NOT NULL,snapshot jsonb NOT NULL,requested_by uuid,requested_at timestamptz NOT NULL DEFAULT now());
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated;
    INSERT INTO auth.users VALUES('${owner}'),('${staff}'),('${otherOwner}');
    INSERT INTO public.stores VALUES('${store}'),('${otherStore}');
    INSERT INTO public.mevo_operators VALUES('${owner}','${store}','store_owner',true),('${staff}','${store}','store_staff',true),('${otherOwner}','${otherStore}','store_owner',true);
    INSERT INTO public.tables VALUES('${table}','${store}','Bàn 2');
    INSERT INTO public.table_sessions VALUES('${session}','${store}'); INSERT INTO public.session_tables VALUES('${session}','${table}',true);
    INSERT INTO public.reservations VALUES('${reservation}','${store}','Nguyễn Văn A','0900000000',6,now()+interval '2 hours','confirmed');
    INSERT INTO public.orders(id,store_id,reservation_id,order_type,order_source,status,total_amount,preorder_revision) VALUES('${order}','${store}','${reservation}','dine_in','reservation_preorder','pending',120000,1);
    INSERT INTO public.reservation_preorder_revisions VALUES('${order}','${store}','${reservation}',1,'[{"name":"Lẩu gà","quantity":1,"price":120000}]',120000,NULL);
  `)
  await db.exec(await readFile(new URL('../migrations/069_reservation_preorder_release.sql', import.meta.url), 'utf8'))
  await db.exec(await readFile(new URL('../migrations/070_reservation_preorder_print_job_access.sql', import.meta.url), 'utf8'))
})
beforeEach(async () => { await db.exec('BEGIN') })
afterEach(async () => { await db.exec('ROLLBACK'); await db.exec('RESET ROLE') })
after(async () => db.close())

test('owner duyệt đúng revision một lần; staff, anon và quán khác bị chặn', async () => {
  await login(staff)
  await reject(() => rpc('SELECT release_reservation_preorder($1,1,$2) AS value',[order,id(699)]), /Chỉ chủ quán/)
  await login(otherOwner)
  await reject(() => rpc('SELECT release_reservation_preorder($1,1,$2) AS value',[order,id(700)]), /Chỉ chủ quán/)
  await login(owner)
  const first = await rpc('SELECT release_reservation_preorder($1,1,$2) AS value',[order,id(701)])
  assert.equal(first.already, false); assert.equal(first.released_revision, 1)
  const replay = await rpc('SELECT release_reservation_preorder($1,1,$2) AS value',[order,id(701)])
  assert.equal(replay.already, true)
  await db.exec('RESET ROLE'); await db.exec('SET LOCAL ROLE anon')
  await reject(() => rpc('SELECT release_reservation_preorder($1,1,$2) AS value',[order,id(702)]), /permission denied/)
})

test('revision cũ không thể release revision mới; print cùng request trả một job immutable', async () => {
  await login(owner)
  await rpc('SELECT release_reservation_preorder($1,1,$2) AS value',[order,id(703)])
  const original = await rpc("SELECT request_reservation_preorder_print($1,1,'original',$2,NULL) AS value",[order,id(704)])
  assert.ok(original.print_job_id); assert.equal(original.snapshot.revision, 1)
  const fetched = await rpc('SELECT get_reservation_preorder_print_job($1) AS value',[original.print_job_id])
  assert.equal(fetched.snapshot.revision, 1)
  const replay = await rpc("SELECT request_reservation_preorder_print($1,1,'original',$2,NULL) AS value",[order,id(704)])
  assert.equal(replay.print_job_id, original.print_job_id)
  await db.exec('RESET ROLE')
  await db.query("UPDATE public.orders SET preorder_revision=2,total_amount=240000 WHERE id=$1",[order])
  await db.query("INSERT INTO public.reservation_preorder_revisions VALUES($1,$2,$3,2,'[{\"name\":\"Lẩu gà\",\"quantity\":2,\"price\":120000}]',240000,NULL)",[order,store,reservation])
  await login(owner)
  await reject(() => rpc('SELECT release_reservation_preorder($1,1,$2) AS value',[order,id(705)]), /Phiên bản món đã thay đổi/)
  await rpc('SELECT release_reservation_preorder($1,2,$2) AS value',[order,id(706)])
  const adjustment = await rpc("SELECT request_reservation_preorder_print($1,2,'adjustment',$2,NULL) AS value",[order,id(707)])
  assert.equal(adjustment.snapshot.kind, 'adjustment'); assert.equal(adjustment.snapshot.previous_snapshot.revision, 1)
})

test('queue chỉ lộ cho owner, nhận khách không tự sinh print job và hao hụt cần owner đóng', async () => {
  await login(owner)
  const queue = await rpc('SELECT list_reservation_preorder_queue($1) AS value',[store])
  assert.equal(queue[0].customer_name, 'Nguyễn Văn A'); assert.equal(queue[0].needs_review, true)
  await db.exec('RESET ROLE')
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.reservation_preorder_print_jobs')).rows[0].n, 0)
  await db.query("UPDATE public.orders SET session_id=$2,table_id=$3 WHERE id=$1",[order,session,table])
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.reservation_preorder_print_jobs')).rows[0].n, 0)
  await db.query('UPDATE public.orders SET status=\'cancelled\',waste_review_required=true WHERE id=$1',[order])
  await login(owner)
  const done = await rpc('SELECT resolve_preorder_waste($1,$2,$3) AS value',[order,'Bếp chưa làm',id(708)])
  assert.equal(done.ok, true)
  await db.exec('RESET ROLE')
  assert.equal((await db.query('SELECT waste_review_required FROM public.orders WHERE id=$1',[order])).rows[0].waste_review_required, false)
})
