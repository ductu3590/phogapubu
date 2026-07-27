-- 036_fix_payment_methods_default.sql — vá default lệch constraint sau lần rename ở mig 032
--
-- Mig 032 đổi kênh 'zalopay' → 'zalo_checkout': siết lại constraint
-- stores_payment_methods_valid (chỉ còn 'zalo_checkout'/'cash') và backfill dữ liệu cũ,
-- NHƯNG quên đổi DEFAULT của cột — vẫn là ARRAY['zalopay'].
-- Hệ quả: mọi INSERT vào stores không truyền payment_methods (vd createStore ở /mevo)
-- đều chết vì "violates check constraint stores_payment_methods_valid".
--
-- Quyết định 2026-06-28 giữ nguyên: quán mới mặc định TẮT tiền mặt (cashless-first),
-- nên default đúng là mảng chỉ có kênh online, chỉ đổi tên cho khớp constraint.

alter table stores alter column payment_methods set default array['zalo_checkout']::text[];

-- Dọn nốt row cũ (nếu còn) lỡ lọt qua trước khi constraint được siết.
update stores
   set payment_methods = array_replace(payment_methods, 'zalopay', 'zalo_checkout')
 where 'zalopay' = any(payment_methods);
