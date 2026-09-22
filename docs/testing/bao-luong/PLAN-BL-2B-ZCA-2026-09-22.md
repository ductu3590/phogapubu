# Bảo Lương — Duyệt implementation plan BL-2B ZCA relay

Ngày: 2026-09-22

Trạng thái: **chờ anh Tú duyệt**

## Review plan

Đọc `docs/superpowers/specs/2026-09-22-bao-luong-bl2b-zca-relay-design.md` và
`docs/superpowers/plans/2026-09-22-bao-luong-bl2b-zca-relay-notifications.md`.

Xác nhận bốn điểm:

1. Chỉ gửi vào nhóm Zalo nội bộ qua bot nick phụ; không gửi khách hàng và không dùng OA Open API.
2. Relay chỉ nhận payload đã ký HMAC raw-body; Supabase/Edge giữ dữ liệu booking và không giao
   service-role key cho relay.
3. `notification_id` dùng delivery UUID, retry cùng ID; `PROVIDER_REJECTED` không tự gửi lại.
4. Chưa có tin thật trước khi relay add allowlist `<store_id>:<group_id>` và superadmin bật channel.

**PASS:** Anh Tú trả `PLAN BL-2B ZCA PASS`.
