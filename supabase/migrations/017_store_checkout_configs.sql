-- 017_store_checkout_configs.sql
-- Secret ZaloPay Checkout SDK theo từng quán — tách bảng riêng (KHÔNG nằm trong `stores`)
-- vì RLS `anon_read_stores` cho anon SELECT toàn cột của `stores`; secret ở bảng riêng
-- không có policy nào nên chỉ service role (bypass RLS) đọc được.

CREATE TABLE store_checkout_configs (
  store_id uuid PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  zalo_mini_app_id text NOT NULL UNIQUE,
  zalo_checkout_secret_key text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE store_checkout_configs ENABLE ROW LEVEL SECURITY;
-- Cố ý KHÔNG tạo policy nào: anon/authenticated không có quyền gì trên bảng này.

CREATE TRIGGER store_checkout_configs_updated_at
  BEFORE UPDATE ON store_checkout_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
