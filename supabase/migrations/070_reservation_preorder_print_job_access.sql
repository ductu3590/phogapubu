-- BL-2C hotfix: print-job là bảng private, trang in owner phải lấy qua RPC thay vì SELECT trực tiếp.
CREATE OR REPLACE FUNCTION public.get_reservation_preorder_print_job(p_print_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE j public.reservation_preorder_print_jobs%ROWTYPE;
BEGIN
  SELECT * INTO j FROM public.reservation_preorder_print_jobs WHERE id=p_print_job_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy phiếu in'; END IF;
  IF NOT public.is_store_owner_of(j.store_id) THEN RAISE EXCEPTION 'Chỉ chủ quán được xem phiếu in'; END IF;
  RETURN jsonb_build_object('id',j.id,'store_id',j.store_id,'kind',j.kind,'revision',j.revision,'snapshot',j.snapshot,'requested_at',j.requested_at);
END;
$$;
REVOKE ALL ON FUNCTION public.get_reservation_preorder_print_job(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_reservation_preorder_print_job(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
