-- 102 (2026-10-13): xoá RPC get_daily_report (mig 092, PA-1 — quyền vá ở 093).
-- Trang Báo cáo ngày cũ đã bị thay bằng "Hoá đơn & Báo cáo" (A04) dùng get_bills_report (mig 100 + 100b) và đã xoá ở A04-4.
-- Trước khi xoá đã kiểm: không code admin-web / Mini App / edge function nào gọi, không hàm SQL nào trên prod nhắc tới.
DROP FUNCTION IF EXISTS public.get_daily_report(uuid, date);
