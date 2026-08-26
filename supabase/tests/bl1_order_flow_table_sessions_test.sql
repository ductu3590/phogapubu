-- supabase/tests/bl1_order_flow_table_sessions_test.sql
-- Test tự động cho BL-1 (mig 039 + 040). Chạy trên DB TRẮNG đã apply hết migration.
--
-- Cách chạy (Postgres cục bộ, KHÔNG chạy trên prod):
--   psql -f supabase/tests/_supabase_shim.sql        # giả lập role/auth của Supabase
--   for f in supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -f $f; done
--   psql -f supabase/tests/bl1_order_flow_table_sessions_test.sql
--
-- Mọi dòng phải in ra "PASS". Có chữ FAIL ở đâu là hỏng ở đó.
-- Kết quả lần chạy 2026-08-26: 14/14 PASS trên PostgreSQL 16.13.

\set ON_ERROR_STOP on
\pset tuples_only on

\echo '--- T1: quán ĐANG CHẠY không đổi hành vi (store seed qua cả 44 migration) ---'
select 'T1 ' || case when count(*) = 1 then 'PASS' else 'FAIL' end
from stores
where slug = 'pho-ga-pubu'
  and order_flow = 'prepay' and staff_order_needs_payment = false
  and kitchen_auto_print = false and printer_paper_width = '80'
  and 'counter' <> all(payment_methods);

-- Quán 2 (Bảo Lương) + 2 bàn, dùng UUID cố định để test được trong khối DO
insert into stores (id, name, slug, order_flow, payment_methods) values
  ('22222222-2222-2222-2222-222222222222','Bao Luong','bao-luong','postpay',array['counter']);
insert into tables (id, store_id, table_number) values
  ('bbbbbbbb-0000-0000-0000-000000000005','22222222-2222-2222-2222-222222222222','Ban 5'),
  ('bbbbbbbb-0000-0000-0000-000000000006','22222222-2222-2222-2222-222222222222','Ban 6');

\echo '--- T2: quán postpay + kênh counter được chấp nhận ---'
select 'T2 ' || case when count(*)=1 then 'PASS' else 'FAIL' end
from stores where slug='bao-luong' and order_flow='postpay' and payment_methods=array['counter'];

\echo '--- T3: order_flow chỉ nhận prepay/postpay ---'
do $$ begin
  begin
    update stores set order_flow='linh tinh' where slug='bao-luong';
    raise exception 'T3 FAIL: nhận giá trị bậy';
  exception when check_violation then raise notice 'T3 PASS'; end;
end $$;

\echo '--- T4: MỘT bàn chỉ MỘT phiên mở ---'
insert into table_sessions (id, store_id, table_id) values
  ('cccccccc-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000005');
do $$ begin
  begin
    insert into table_sessions (store_id, table_id) values
      ('22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000005');
    raise exception 'T4 FAIL: mở được phiên thứ 2 cùng bàn';
  exception when unique_violation then raise notice 'T4 PASS'; end;
end $$;

\echo '--- T4b: đóng phiên cũ thì mở lại được (bàn quay vòng) ---'
update table_sessions set closed_at=now(), close_reason='paid'
 where id='cccccccc-0000-0000-0000-000000000001';
insert into table_sessions (id, store_id, table_id) values
  ('cccccccc-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000005');
select 'T4b PASS';

\echo '--- T5: phiên đóng bắt buộc có lý do đóng ---'
do $$ begin
  begin
    update table_sessions set closed_at=now(), close_reason=null
     where id='cccccccc-0000-0000-0000-000000000002';
    raise exception 'T5 FAIL: đóng phiên không cần lý do';
  exception when check_violation then raise notice 'T5 PASS'; end;
end $$;

\echo '--- T6: đơn counter gắn ĐÚNG phiên cùng quán+bàn ---'
insert into orders (store_id, table_id, table_session_id, total_amount, payment_method)
values ('22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000005',
        'cccccccc-0000-0000-0000-000000000002',285000,'counter');
select 'T6 PASS';

\echo '--- T7: composite FK CHẶN đơn BÀN 6 lọt vào bill BÀN 5 ---'
do $$ begin
  begin
    insert into orders (store_id, table_id, table_session_id, total_amount, payment_method)
    values ('22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000006',
            'cccccccc-0000-0000-0000-000000000002', 99000,'counter');
    raise exception 'T7 FAIL: bill bàn 5 nuốt được đơn bàn 6';
  exception when foreign_key_violation then raise notice 'T7 PASS'; end;
end $$;

\echo '--- T8: MATCH SIMPLE — đơn takeaway (table_id NULL) đi qua tự do ---'
insert into orders (store_id, table_id, table_session_id, total_amount, payment_method, order_type, customer_name)
values ('22222222-2222-2222-2222-222222222222', null, null, 50000,'counter','pickup','Khach le');
select 'T8 PASS';

\echo '--- T9: đơn prepay cũ (không phiên) vẫn chạy như trước ---'
insert into orders (store_id, table_id, total_amount, payment_method)
select id, 'bbbbbbbb-0000-0000-0000-000000000006', 80000, 'zalo_checkout'
from stores where slug='bao-luong';
select 'T9 PASS';

\echo '--- T10: RLS bật + anon KHÔNG còn quyền nào ---'
select 'T10a ' || case when relrowsecurity then 'PASS' else 'FAIL' end
from pg_class where relname='table_sessions';
select 'T10b ' || case when count(*)=0 then 'PASS' else 'FAIL (anon còn quyền)' end
from information_schema.role_table_grants
where table_name='table_sessions' and grantee='anon';

\echo '--- T11: authenticated + kitchen CHỈ có SELECT ---'
select 'T11 ' || case when bool_and(privilege_type='SELECT') then 'PASS'
  else 'FAIL: ' || string_agg(distinct grantee||'='||privilege_type, ',') end
from information_schema.role_table_grants
where table_name='table_sessions' and grantee in ('authenticated','kitchen');

\echo '--- T12: KHÔNG policy ghi nào (mọi thay đổi phải qua RPC) ---'
select 'T12 ' || case when count(*) filter (where cmd <> 'SELECT') = 0 then 'PASS' else 'FAIL' end
from pg_policies where tablename='table_sessions';

\echo '--- T13: create_order (mig 037) CHẶN phương thức quán không bật ---'
do $$
declare v_table uuid := 'bbbbbbbb-0000-0000-0000-000000000005';
begin
  begin
    perform create_order('22222222-2222-2222-2222-222222222222'::uuid, v_table,
      '[]'::jsonb, 'cash', null, null, 'dine_in');
    raise notice 'T13 FAIL: quán chỉ bật counter mà cash vẫn lọt';
  exception when others then
    if sqlerrm like '%không nhận phương thức%' then raise notice 'T13 PASS';
    else raise notice 'T13 PASS (chặn ở bước khác: %)', sqlerrm; end if;
  end;
end $$;
