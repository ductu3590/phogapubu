-- 097 (2026-10-09): nhân viên chạy bàn (store_staff) đọc được KHU để màn Đặt món / Ghép mâm chia bàn theo khu.
-- pos_read_table_areas (mig 094) chỉ mở cho chủ quán + thu ngân. Chỉ ĐỌC tên/màu khu của đúng quán mình.

DROP POLICY IF EXISTS staff_read_table_areas ON public.table_areas;
CREATE POLICY staff_read_table_areas ON public.table_areas
  FOR SELECT TO authenticated
  USING (public.is_store_scoped_operator(store_id));
