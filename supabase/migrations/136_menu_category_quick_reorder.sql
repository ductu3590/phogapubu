-- 136: menu_categories.quick_reorder — danh mục được gợi ý "gọi thêm nhanh" ở Mini App.
--
-- Quán nhậu: bàn đã uống loại bia / rượu nào thì gọi tiếp đúng loại đó suốt bữa. Mini App hiện
-- một nút gọi thêm đúng món (kèm đúng cỡ) mà bàn đã gọi gần nhất, khỏi phải tìm lại trong menu.
-- Món nào được gợi ý là do chủ quán quyết: tick cột này ở danh mục (Bia, Rượu…) trong trang Món.
--
-- Chỉ thêm cột. Không đụng hàm nào: Mini App đọc menu_categories bằng select '*' nên cột mới tự
-- có mặt; bản Mini App cũ bỏ qua cột lạ. Mặc định false = không quán nào đổi hành vi.

ALTER TABLE public.menu_categories
  ADD COLUMN quick_reorder boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.menu_categories.quick_reorder IS
  'true = món thuộc danh mục này được Mini App gợi ý gọi thêm nhanh khi bàn đã gọi (bia, rượu…).';
