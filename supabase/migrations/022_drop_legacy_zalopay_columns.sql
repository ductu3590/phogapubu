-- 022 — Dọn cột ZaloPay API cũ (tàn dư trước khi chuyển sang Checkout SDK) + hardening REVOKE.
-- Đã verify không còn code nào (admin-web/mini-app/supabase/functions) đọc/ghi 3 cột này —
-- chỉ còn xuất hiện trong database.types.ts tự sinh, không có logic thật nào dùng.
-- Ghi trong docs/BACKLOG.md mục "Dọn dẹp" từ 2026-07-01.

alter table stores
  drop column if exists zalopay_app_id,
  drop column if exists zalopay_key1,
  drop column if exists zalopay_key2;

-- Hardening (docs/BACKLOG.md mục "Hardening" 2026-07-01): store_checkout_configs chặn
-- anon/authenticated hoàn toàn nhờ RLS bật + không có policy nào (default-deny), nhưng vẫn còn
-- GRANT mặc định của Postgres/Supabase. Revoke luôn để tránh "bẫy" nếu sau này có ai thêm
-- policy permissive mà quên xét lại GRANT — cùng pattern đã áp cho store_zalo_configs (021).
revoke all on store_checkout_configs from anon, authenticated;
