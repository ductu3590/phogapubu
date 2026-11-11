-- 130: gỡ hàm / bảng / cột không còn ai dùng (audit 2026-11-11).
--
-- ⚠️ THỨ TỰ ÁP: chỉ áp SAU KHI code của nhánh audit đã lên Vercel. Bản admin-web cũ còn route
-- /api/zalo-oa-webhook gọi claim_zalo_oa_onboarding_challenge; gỡ hàm trước thì route đó trả 503.
--
-- Mọi mục dưới đây đã đối chiếu trên prod ngày 2026-11-11: không có nơi gọi trong admin-web, mini-app,
-- print-agent, edge function; không hàm SQL, trigger, policy, default, CHECK hay index nào khác nhắc tới.
-- Chỉ có DROP, không CREATE OR REPLACE hàm nào đang sống. Chạy lại được (IF EXISTS).

BEGIN;

-- 1. Hàm không còn nơi gọi ---------------------------------------------------------------------------
-- Luồng "ZaloPay bỏ dở → chuyển tiền mặt": mig 039 đã ghi "không UI nào còn gọi"; còn GRANT cho anon.
DROP FUNCTION IF EXISTS public.abandon_zalopay_to_cash(uuid, text);
-- Trang dashboard đã thay bằng A04 (get_bills_report).
DROP FUNCTION IF EXISTS public.get_daily_revenue(uuid, date);
-- Thu tiền đi qua collect_table_bill từ mig 112a; bỏ bàn gọi close_table_session('staff_reset').
DROP FUNCTION IF EXISTS public.close_table_sessions_bulk(uuid[], text, text);
-- Thay bằng prepare_reservation_request + create_customer_reservation (mig 065).
DROP FUNCTION IF EXISTS public.create_reservation(uuid, text, text, integer, timestamptz, text, text, uuid);
-- Từ mig 071 hai hàm này luôn RAISE 'Món đặt trước đã khóa'.
DROP FUNCTION IF EXISTS public.revise_reservation_preorder(uuid, text, integer, uuid, jsonb, text);
DROP FUNCTION IF EXISTS public.cancel_reservation_preorder(uuid, text, integer, uuid);
-- Màn nhân viên dùng list_staff_upcoming_reserved_tables (mig 084).
DROP FUNCTION IF EXISTS public.list_prearrival_reserved_table_ids(uuid);
-- 17 policy dùng is_operator() đã thay bằng is_store_scoped_operator() ở mig 019.
DROP FUNCTION IF EXISTS public.is_operator();

-- 2. Thông báo đặt bàn cho chủ quán qua Zalo OA --------------------------------------------------------
-- Từ mig 063 thông báo đi qua nhóm Zalo (delivery_provider = 'zca_group'); đường OA chỉ còn nút "gửi thử"
-- và luồng nhắn mã MEVO vào OA, cả hai đã gỡ khỏi admin-web. Edge function reservation-owner-notify cũng bỏ.
DROP FUNCTION IF EXISTS public.claim_reservation_owner_notification(uuid, uuid);
DROP FUNCTION IF EXISTS public.finish_reservation_owner_notification(uuid, uuid, text, text, text);
DROP FUNCTION IF EXISTS public.create_zalo_oa_onboarding_challenge(uuid, text, uuid, timestamptz);
DROP FUNCTION IF EXISTS public.claim_zalo_oa_onboarding_challenge(uuid, text, text, text, text, text);
DROP TABLE IF EXISTS public.zalo_oa_onboarding_challenges;
-- store_zalo_notification_recipients CỐ Ý để lại: reservation_notification_deliveries còn FK
-- (recipient_id, store_id) trỏ vào nó và CHECK reservation_notification_delivery_target còn nhánh 'zalo_oa'.
-- Gỡ nốt cần sửa bảng deliveries mà đường ZCA đang dùng — làm riêng.
ALTER TABLE public.store_zalo_configs DROP COLUMN IF EXISTS zalo_oa_app_id;

-- 3. Cột không còn nơi đọc / ghi -----------------------------------------------------------------------
-- stores.zalo_app_id (mig 002): Mini App ID nằm ở store_app_configs.zalo_mini_app_id.
ALTER TABLE public.stores DROP COLUMN IF EXISTS zalo_app_id;
-- store_app_configs (mig 020): ba cột dự phòng cho quy trình submit Zalo, chưa từng được ghi.
ALTER TABLE public.store_app_configs
  DROP COLUMN IF EXISTS zmp_app_config,
  DROP COLUMN IF EXISTS submitted_at,
  DROP COLUMN IF EXISTS published_at;
-- orders.has_payment_tail (mig 030): "đuôi số tiền" để khớp chuyển khoản SePay — hướng PM-5 đã bỏ.
-- orders.payment_amount GIỮ: create_order, recompute_order_total, close_table_session_core còn ghi.
DROP INDEX IF EXISTS public.orders_pending_payment_amount_unique;
ALTER TABLE public.orders DROP COLUMN IF EXISTS has_payment_tail;

COMMIT;
