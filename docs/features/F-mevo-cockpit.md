# F · Cockpit MEVO `/mevo` + tài khoản
## Làm gì
Superadmin tạo quán (wizard), gán chủ quán/nhân viên, đặt lại mật khẩu (không xoá/khoá tài khoản — cố ý), bắt đổi
mật khẩu lần đầu (`app_metadata.must_change_password`, DB chặn ở mig 137).
## File chính
`admin-web/app/mevo/`, `admin-web/app/(auth)/`, `admin-web/lib/supabase/auth-users.ts`, `admin-web/lib/auth/`.
## Tài liệu
`docs/superpowers/specs/2026-07-24-store-creation-wizard-design.md`, `2026-09-01-mevo-account-management-design.md`,
skill `replicate-mini-app` (onboard quán mới).
