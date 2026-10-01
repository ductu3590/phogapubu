# Bảo Lương — BL-4 Release Evidence

**Trạng thái:** BL-4 PASS theo xác nhận của anh Tú ngày 2026-10-01. Test 5A PASS; Test 5B hoãn có chủ đích đến sau cải tổ giao diện Mini App + web POS; chưa Publish.

Tài liệu này chỉ ghi bằng chứng có thể kiểm tra được sau mỗi lượt nghiệm thu. Không ghi QR token, Group ID Zalo, access token, API key, mật khẩu hay dữ liệu khách thật.

## 5A — Testing

| Trường | Giá trị |
| --- | --- |
| Ngày/giờ Asia/Ho_Chi_Minh | 2026-10-01 — anh Tú xác nhận Test 5A PASS; giờ cụ thể chưa ghi |
| Instance Mini App | `mini-app-instances/bia-lau-bao-luong/mini-app` |
| Commit instance | Chưa chạy release gate |
| Zalo Testing version | Chưa deploy |
| Admin Web deployment/commit | Chưa ghi |
| Migrations vận hành đã áp | 078, 078a, 079–083 — xác minh qua Supabase MCP ngày 2026-10-01 |
| Dispatch URL | Đã cấu hình trong `mevo_private.runtime_settings`; schema không truy cập được bởi anon/authenticated |
| Điện thoại/tài khoản test | Chưa ghi |
| Kết quả Test 5A | PASS — chủ quán xác nhận; chi tiết version/deployment không được cung cấp trong checkpoint |

## 5B — Publish

| Trường | Giá trị |
| --- | --- |
| Ngày/giờ Publish | Chưa Publish |
| Zalo Publish version | Chưa Publish |
| QR vật lý/tài khoản không phải tester | Chưa chạy |
| Kết quả Test 5B | DEFERRED_UI_REDESIGN — không Publish giao diện hiện tại; kiểm lại sau đợt cải tổ |

## Quyết định tiếp theo

Hoàn tất phần core BL-4. Trước khi Publish Bảo Lương cho khách thường, lập kế hoạch cải tổ giao diện đồng bộ cho Mini App và web POS, sau đó chạy lại kiểm thử trên bản Testing.

## Ghi nhận sự cố / quyết định rollback

| Thời điểm | Sự cố | Công tắc server đã dùng | Kết quả |
| --- | --- | --- | --- |
| — | — | — | — |
