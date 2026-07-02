-- 020 — store_app_configs: metadata công khai (KHÔNG bí mật) theo từng quán cho /mevo.
create table if not exists store_app_configs (
  store_id uuid primary key references stores(id) on delete cascade,
  zalo_mini_app_name text,
  zmp_app_config jsonb not null default '{}'::jsonb,
  onboarding_status text not null default 'draft'
    check (onboarding_status in ('draft', 'in_progress', 'ready', 'live')),
  deployment_status text not null default 'not_deployed'
    check (deployment_status in ('not_deployed', 'deployed', 'submitted', 'published')),
  submitted_at timestamptz,
  published_at timestamptz,
  last_error text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table store_app_configs enable row level security;

drop policy if exists "operator_read_app_configs" on store_app_configs;
create policy "operator_read_app_configs" on store_app_configs
  for select to authenticated using (is_store_scoped_operator(store_id));
-- Ghi chỉ qua service_role trong server action /mevo — không tạo policy insert/update.

drop trigger if exists store_app_configs_updated_at on store_app_configs;
create trigger store_app_configs_updated_at
  before update on store_app_configs
  for each row execute function update_updated_at();
