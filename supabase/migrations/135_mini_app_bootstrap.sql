-- 135: get_mini_app_bootstrap — một lần gọi lấy đủ thứ Mini App cần để vẽ màn đầu.
--
-- Trước đây lúc mở app phải đi HAI lượt nối tiếp: (1) stores theo slug + tables theo id,
-- (2) có store_id rồi mới gọi get_public_store_workflow + get_active_menu_discounts + menu.
-- Hàm này nhận slug nên gộp (1) và phần RPC của (2) vào MỘT lượt; menu được mini-app đọc song
-- song theo slug (PostgREST, không qua hàm này).
--
-- Hàm MỚI, không sửa hàm nào đang chạy. Bản mini-app cũ không gọi hàm này nên không ảnh hưởng;
-- bản mới gọi lỗi thì tự rơi về đường đọc cũ.
--
-- SECURITY INVOKER: chạy bằng quyền người gọi (anon) nên RLS của stores / tables vẫn áp
-- (anon_read_stores, anon_read_tables: chỉ dòng is_active). Chỉ trả đúng các cột mini-app vốn
-- đã đọc thẳng từ bảng stores — không lộ thêm cột nào (không có bank_*, kitchen_token_version…).
-- Hai hàm con là SECURITY DEFINER sẵn có, anon vốn đã được gọi.
--
-- Không tìm thấy quán (sai slug / quán tắt) → trả NULL.

CREATE FUNCTION public.get_mini_app_bootstrap(p_slug text, p_table_id uuid DEFAULT NULL)
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
       WHERE t.id = p_table_id AND t.is_active = true
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
  'Mini App: quán + bàn + workflow + giảm giá đang chạy trong một lần gọi theo slug (mig 135).';
