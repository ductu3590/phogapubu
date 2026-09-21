-- 061 — Tách app cha tích hợp Zalo OA khỏi Mini App riêng của từng quán.
-- Một app OA API có thể được cấp quyền cho nhiều OA quán; Mini App ID vẫn chỉ dùng QR/deploy.
alter table public.store_zalo_configs
  add column if not exists zalo_oa_app_id text;

alter table public.store_zalo_configs
  drop constraint if exists store_zalo_configs_zalo_oa_app_id_not_blank;

alter table public.store_zalo_configs
  add constraint store_zalo_configs_zalo_oa_app_id_not_blank
  check (zalo_oa_app_id is null or length(btrim(zalo_oa_app_id)) > 0);
