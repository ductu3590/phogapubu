-- 018 — Onboarding Cockpit: thêm role cho mevo_operators.
-- role NULL ban đầu để backfill an toàn trước khi bật NOT NULL + constraint
-- (tránh tự khoá mình ra ngoài nếu backfill sai).

alter table mevo_operators
  add column if not exists role text,
  add column if not exists updated_at timestamptz not null default now();

update mevo_operators
set role = case when store_id is null then 'mevo_superadmin' else 'store_owner' end
where role is null;

alter table mevo_operators
  alter column role set not null;

alter table mevo_operators
  drop constraint if exists mevo_operators_role_check;
alter table mevo_operators
  add constraint mevo_operators_role_check
  check (role in ('mevo_superadmin', 'store_owner'));

alter table mevo_operators
  drop constraint if exists mevo_operators_role_store_check;
alter table mevo_operators
  add constraint mevo_operators_role_store_check
  check (
    (role = 'mevo_superadmin' and store_id is null)
    or
    (role = 'store_owner' and store_id is not null)
  );

drop trigger if exists mevo_operators_updated_at on mevo_operators;
create trigger mevo_operators_updated_at
  before update on mevo_operators
  for each row execute function update_updated_at();
