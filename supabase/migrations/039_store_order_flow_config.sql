-- 039_store_order_flow_config.sql — BL-1 (a): khối cấu hình "Quy trình vận hành" per-store
-- Spec: docs/superpowers/specs/2026-08-26-postpay-table-session-print-design.md §2
--
-- Quyết định 2026-08-26: MEVO KHÔNG áp một quy trình đúng cho mọi quán. Pubu chạy kiểu Pubu,
-- Bảo Lương chạy kiểu Bảo Lương; chủ quán tự chỉnh trong /admin/settings.
--
-- ⚠️ LUẬT ĐẶT MẶC ĐỊNH (§2.3) — không có ngoại lệ:
--    mặc định của MỌI công tắc mới = ĐÚNG hành vi hệ thống đang chạy hôm nay.
--    Quán không đụng cài đặt thì sau deploy không được thấy bất cứ gì khác đi.
--    Nhờ vậy file này ADDITIVE hoàn toàn: không backfill, không đổi dữ liệu quán đang chạy.

-- ============================================================
-- 1) Bốn công tắc quy trình
-- ============================================================
alter table stores
  add column if not exists order_flow                text    not null default 'prepay',
  add column if not exists staff_order_needs_payment boolean not null default false,
  add column if not exists kitchen_auto_print        boolean not null default false,
  add column if not exists printer_paper_width       text    not null default '80';

-- prepay  = luồng hiện tại: khách trả tiền rồi bếp mới làm
-- postpay = gọi nhiều lượt suốt bữa, thu tiền một lần tại quầy cuối bữa
alter table stores drop constraint if exists stores_order_flow_check;
alter table stores add constraint stores_order_flow_check
  check (order_flow in ('prepay','postpay'));

alter table stores drop constraint if exists stores_printer_paper_width_check;
alter table stores add constraint stores_printer_paper_width_check
  check (printer_paper_width in ('58','80'));

comment on column stores.order_flow is
  'prepay = khách trả trước rồi bếp mới làm; postpay = gọi nhiều lượt, thu tiền tại quầy cuối bữa';
comment on column stores.staff_order_needs_payment is
  'CHỈ có nghĩa khi order_flow=prepay: đơn nhân viên đặt hộ có phải thu tiền xong mới vào bếp không. '
  'Mặc định false = giữ hành vi PM-3 §7 (nhân viên đứng cạnh khách = bằng chứng khách có mặt).';

-- ============================================================
-- 2) Kênh thanh toán 'counter' — THU TẠI QUẦY, cuối bữa (§2.2)
-- ============================================================
-- 'counter' là KÊNH (thu ở đâu / lúc nào), KHÔNG phải phương tiện.
-- Khách trả bằng gì ghi ở orders.payment_instrument ('cash'|'bank') lúc THU — mig 030 đã dựng.
-- Đây là lý do KHÔNG tái dùng 'cash': quán postpay phần lớn khách chuyển khoản, ghi hết là
-- 'cash' thì báo cáo doanh thu nói sai vào đúng cột nó đọc (đúng lỗi mig 032 phải đi gỡ).

alter table orders drop constraint if exists orders_payment_method_check;
alter table orders add constraint orders_payment_method_check
  check (payment_method in ('zalo_checkout','cash','bank_transfer','counter'));

alter table stores drop constraint if exists stores_payment_methods_valid;
alter table stores add constraint stores_payment_methods_valid
  check (array_length(payment_methods, 1) >= 1
         and payment_methods <@ array['zalo_checkout','cash','counter']);

-- ⚠️ KHÔNG đổi default của stores.payment_methods (vẫn array['zalo_checkout']).
--    Quán mới vẫn là quán prepay cho tới khi chủ quán tự chọn postpay.
