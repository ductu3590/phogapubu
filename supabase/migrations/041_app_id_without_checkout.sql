-- 041_app_id_without_checkout.sql
-- Tách "Mini App ID của quán" ra khỏi cấu hình Zalo Checkout.
--
-- Vì sao: `store_checkout_configs.zalo_checkout_secret_key` là NOT NULL, và
-- `updateCheckoutConfig` bắt buộc nhập secret ở lần cấu hình đầu. Toàn hệ thống trước nay
-- ngầm định "quán nào cũng dùng Zalo Checkout" nên nhét luôn Mini App ID vào bảng secret đó.
--
-- Quyết định 2026-08-30 (#4) phá vỡ giả định ấy: quán TRẢ SAU (Bia lẩu Bảo Lương) thu tiền tại
-- quầy bằng QR loa sẵn có → KHÔNG có merchant, KHÔNG có Checkout secret. Hệ quả: không lưu nổi
-- Mini App ID ⇒ `/admin` → Bàn & QR không sinh được QR bàn ⇒ không onboard được quán.
--
-- Hai cột cùng tên nhưng KHÁC nghĩa, cố ý giữ cả hai:
--   • store_app_configs.zalo_mini_app_id      = "khách mở Mini App nào" — QR bàn, deploy. Quán nào cũng cần.
--   • store_checkout_configs.zalo_mini_app_id = KHOÁ ĐỊNH TUYẾN callback thanh toán: checkout-notify
--     nhận data.appId rồi tra ngược ra store + secret. Chỉ quán dùng Zalo Checkout mới có.
-- Không gộp làm một vì xoá cấu hình thanh toán của một quán KHÔNG được phép làm chết QR bàn của nó.

alter table store_app_configs
  add column if not exists zalo_mini_app_id text null;

comment on column store_app_configs.zalo_mini_app_id is
  'Mini App ID khách sẽ mở (QR bàn, zmp deploy). Quán không dùng Zalo Checkout vẫn phải có. Khác với store_checkout_configs.zalo_mini_app_id — cột kia là khoá định tuyến callback thanh toán.';

-- Backfill từ cấu hình checkout của các quán đang chạy để không quán nào mất QR.
update store_app_configs a
   set zalo_mini_app_id = c.zalo_mini_app_id
  from store_checkout_configs c
 where c.store_id = a.store_id
   and a.zalo_mini_app_id is null;
