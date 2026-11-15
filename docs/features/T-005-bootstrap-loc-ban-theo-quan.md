# T-005 — get_mini_app_bootstrap lọc bàn theo quán

- Mig `supabase/migrations/140_mini_app_bootstrap_table_store.sql`: `CREATE OR REPLACE get_mini_app_bootstrap`, thêm `AND t.store_id = s.id` vào khối `table`. QR ghép slug quán A với `table_id` quán B giờ cho `table = null` thay vì bàn của B.
- Chữ ký, cột trả về, SECURITY INVOKER, GRANT giữ nguyên như mig 135 (file 135 không sửa).
- Test: `supabase/tests/140_mini_app_bootstrap.test.mjs` (PGlite, schema giả tối thiểu; ca cuối chứng minh 135 để lọt bàn quán khác).
- `mini-app/src/utils/bootstrap.ts`: chỉ sửa chú thích (payload sai hình -> app dừng ở màn chờ; RPC lỗi mới chạy đường đọc cũ).
- **Việc của orchestrator:** áp mig 140 lên prod NGUYÊN VĂN file sau khi merge.
