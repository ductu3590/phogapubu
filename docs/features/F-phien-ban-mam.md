# F · Phiên bàn trả sau + Mâm + Đặt bàn
## Làm gì
Một bàn có khách = một `table_session` = một bill; mâm = phiên chiếm N bàn (`session_tables`), mâm đoàn mở gọi món;
gộp bill; đặt bàn + đặt món trước, khung giữ bàn `planning_hold_minutes`.
## File chính
mig 039/040/052–066/075/104–106/133, hàm `open_session_id_for_table()`, `admin-web/app/staff/`, `admin-web/app/admin/reservations/`.
## Có test
`supabase/tests/*` (PGlite) + `cd admin-web && npm run test:race`.
## Tài liệu
`docs/superpowers/specs/2026-08-30-bao-luong-tray-group-design.md`, `2026-09-10-bao-luong-reservation-pos-workflow-design.md`.
