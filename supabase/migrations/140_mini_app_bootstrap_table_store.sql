-- 140: get_mini_app_bootstrap chỉ trả bàn thuộc ĐÚNG quán của slug.
--
-- Mig 135 lấy bàn theo `t.id = p_table_id AND t.is_active` mà không so store_id, nên QR ghép slug
-- quán A với table_id quán B sẽ hiện bàn của B dưới tên A. Không phải lỗ rò (anon vốn đọc được bàn
-- đang bật; create_order vẫn kiểm store_id) nhưng sai. Thêm `AND t.store_id = s.id`; mọi thứ khác
-- (chữ ký, cột trả về, SECURITY INVOKER, GRANT) giữ nguyên như 135.

CREATE OR REPLACE FUNCTION public.get_mini_app_bootstrap(p_slug text, p_table_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'store', (
      SELECT to_jsonb(x) FROM (
        SELECT s.id, s.name, s.slug, s.logo_url, s.address, s.google_maps_url, s.phone,
               s.zalo_oa_id, s.zalo_oa_url, s.payment_methods, s.payment_timing,
               s.takeaway_banner_url, s.about_text, s.wifi_name, s.wifi_password,
               s.primary_color, s.mini_app_theme, s.is_accepting_orders, s.serving_hours,
               s.delivery_area_note, s.terms_of_use
      ) x
    ),
    'table', (
      SELECT jsonb_build_object('id', t.id, 'table_number', t.table_number)
        FROM public.tables t
       WHERE t.id = p_table_id AND t.is_active = true AND t.store_id = s.id
    ),
    'workflow', public.get_public_store_workflow(s.id),
    'discounts', public.get_active_menu_discounts(s.id)
  )
  FROM public.stores s
  WHERE s.slug = p_slug AND s.is_active = true
$$;

REVOKE ALL ON FUNCTION public.get_mini_app_bootstrap(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_mini_app_bootstrap(text, uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.get_mini_app_bootstrap(text, uuid) IS
  'Mini App: quán + bàn + workflow + giảm giá đang chạy trong một lần gọi theo slug (mig 135, bàn lọc theo quán mig 140).';
