-- Mig 121: gỡ trigger print_mode_policy_guard (mig 114).
--
-- Vì sao: Yên Garden muốn dùng phần mềm in (print_mode='agent') cùng chính sách
-- vào bếp 'automatic', và cần đổi chính sách sau một thời gian vận hành mà không bị khoá
-- (spec Yên Garden §4.2 + §5.2). Đường in tự động nằm ở POS nên không còn cần ràng hai chiều.
--
-- Chỉ DROP, không vá hàm sống. Hàm set_print_mode của 114 vẫn còn dòng comment nhắc tới
-- trigger này — cố ý không sửa, vì sửa là phải CREATE OR REPLACE một hàm đang chạy.
-- Chạy lại nhiều lần an toàn (IF EXISTS).

DROP TRIGGER IF EXISTS print_mode_policy_guard ON public.store_workflow_settings;
DROP FUNCTION IF EXISTS public.print_mode_policy_guard();
