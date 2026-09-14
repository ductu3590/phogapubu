-- BL-0 Task 7: listener bếp dùng JWT role kitchen, không có phiên Auth của staff.
-- Cấp SELECT đúng quán để tải snapshot và nhận Realtime; mọi resolve vẫn qua owner/staff.
GRANT SELECT ON public.service_requests TO kitchen;
DROP POLICY IF EXISTS kitchen_read_service_requests ON public.service_requests;
CREATE POLICY kitchen_read_service_requests ON public.service_requests
  FOR SELECT TO kitchen
  USING (store_id = public.kitchen_store_id());
