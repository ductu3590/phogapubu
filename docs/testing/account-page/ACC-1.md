# ACC-1 — Trang Tài khoản Mini App (test trên Bảo Lương, Zalo thật)

Spec: `docs/superpowers/specs/2026-10-09-mini-app-account-page-design.md`

Tự động (đã chạy): `account-profile`, `account-storage`, `zalo-phone` (client) — mini-app vitest;
`supabase/functions/zalo-phone/handler.test.ts` — chạy từ GỐC repo
(`admin-web/node_modules/.bin/vitest run supabase/functions/zalo-phone`).

⚠️ Bài 2–3 cần Zalo DUYỆT quyền #100 (SĐT) cho app Bảo Lương. Chưa duyệt → chỉ chạy bài 1, 4–8.

| # | Thao tác | Kỳ vọng |
|---|---|---|
| 1 | Mở app → icon người góc phải | Trang Tài khoản; chưa cho quyền: "Khách" + "Kết nối Zalo". Bấm → cho phép → tên + ảnh Zalo hiện, ô Tên điền tên Zalo |
| 2 | Bấm "Lấy số từ Zalo" → Cho phép | Số hiện dạng `09xx xxx xxx` + dòng xanh "Đã lấy từ Zalo" |
| 3 | Bấm "Cập nhật" lần nữa | Lấy lại được số (không lỗi token đã dùng) |
| 4 | Bấm "Lấy số từ Zalo" → Từ chối | Câu lỗi "Bạn chưa cho phép…" + ô nhập tay mở. Nhập `123` → báo sai; nhập số đúng → Lưu → số hiện |
| 5 | Sửa ô Tên thành "Anh Nam bàn 5", thoát app, mở lại Tài khoản | Tên vẫn "Anh Nam bàn 5" (không bị tên Zalo đè) |
| 6 | Tab Đặt bàn → form | Tên + SĐT đã điền sẵn |
| 7 | Tài khoản → Xoá thông tin cá nhân → Xoá | Toast "Đã xoá…"; form Đặt bàn trống; lịch hẹn cũ VẪN xem được; nếu đang ngồi bàn thì vẫn gọi món được |
| 8 | Điều khoản sử dụng | Mở đúng nội dung điều khoản của quán; khổ 360px không vỡ, góc phải thanh công cụ không bị nút Zalo đè |
