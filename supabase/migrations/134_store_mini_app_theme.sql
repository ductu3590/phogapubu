-- 134: theme giao diện Mini App theo quán (stores.mini_app_theme).
--
-- Code lõi mini-app có nhiều bộ giao diện; quán chọn bộ nào là dữ liệu, đọc lúc chạy cùng lúc
-- với primary_color (không build lại). 'classic' = giao diện hiện tại (Bảo Lương, Pubu);
-- 'garden' = bộ tối giản nền kem, dựng cho Yên Garden.
--
-- Chỉ thêm cột + ràng buộc. Không đụng hàm nào: mini-app đọc thẳng bảng stores (anon có quyền
-- SELECT cấp bảng nên cột mới tự đọc được). Bản mini-app cũ không select cột này nên không ảnh
-- hưởng; quán không đặt gì thì mặc định 'classic' = y như trước.

ALTER TABLE public.stores
  ADD COLUMN mini_app_theme text NOT NULL DEFAULT 'classic';

ALTER TABLE public.stores
  ADD CONSTRAINT stores_mini_app_theme_check
  CHECK (mini_app_theme IN ('classic', 'garden'));

COMMENT ON COLUMN public.stores.mini_app_theme IS
  'Bộ giao diện Mini App của quán: classic (mặc định) | garden (tối giản, nền kem). Mini-app đọc lúc chạy.';
