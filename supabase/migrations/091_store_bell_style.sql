-- 091 (PA-1, 2026-10-07): kiểu chuông báo của quán. Âm lượng KHÔNG ở đây — mỗi máy tự chỉnh (localStorage).
-- Cột thường trên stores: anon / kitchen / authenticated đã có SELECT cả bảng nên màn bếp đọc được ngay.
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS bell_style text NOT NULL DEFAULT 'double';

ALTER TABLE public.stores
  DROP CONSTRAINT IF EXISTS stores_bell_style_check;
ALTER TABLE public.stores
  ADD CONSTRAINT stores_bell_style_check CHECK (bell_style IN ('double', 'soft', 'repeat'));

COMMENT ON COLUMN public.stores.bell_style IS 'Kiểu chuông báo việc mới: double (chuẩn) | soft (gõ nhẹ) | repeat (lặp tới khi có người).';
