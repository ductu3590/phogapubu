-- 021 — store_zalo_configs: secret Zalo OA/webhook theo từng quán.
-- KHÔNG có cột zalo_oa_id — cột đó không phải secret, đã có sẵn trên stores.zalo_oa_id.
create table if not exists store_zalo_configs (
  store_id uuid primary key references stores(id) on delete cascade,
  zalo_oa_access_token text,
  zalo_app_secret_key text,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table store_zalo_configs enable row level security;
-- Cố ý KHÔNG tạo policy nào — chỉ service_role (bypass RLS) đọc/ghi được, giống store_checkout_configs.

revoke all on store_zalo_configs from anon, authenticated;

drop trigger if exists store_zalo_configs_updated_at on store_zalo_configs;
create trigger store_zalo_configs_updated_at
  before update on store_zalo_configs
  for each row execute function update_updated_at();
