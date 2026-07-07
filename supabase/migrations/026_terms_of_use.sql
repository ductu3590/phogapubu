-- Điều khoản sử dụng hiển thị tab "Nhà hàng" mini-app (Markdown nhẹ).
-- NULL/rỗng = mini-app dùng mẫu điều khoản mặc định (DEFAULT_TERMS).
alter table stores
  add column if not exists terms_of_use text;

comment on column stores.terms_of_use is
  'Điều khoản sử dụng (Markdown nhẹ) hiển thị tab "Nhà hàng" mini-app. NULL/rỗng = dùng mẫu mặc định trong mini-app.';
