---
name: see-ui
description: Cho agent "đôi mắt" — chạy app, chụp màn hình trang/luồng, đọc log console/server để tự kiểm giao diện thay vì đoán. Dùng trước khi báo xong bất kỳ thay đổi UI nào, hoặc khi điều tra lỗi giao diện.
---

# /see-ui — nhìn trước khi báo xong

## Chụp nhanh một trang
```bash
python scripts/run.py start                          # idempotent: đã chạy thì thôi
python scripts/ui_shot.py /tournaments list --mobile # 390x844
python scripts/ui_shot.py /tournaments list-desktop  # 1280x800
```
Rồi đọc ảnh: Read `.harness/screens/list.png`. Lần đầu nếu thiếu trình duyệt, script tự cài chromium.

## Luồng nhiều bước (đăng nhập, điền form, bấm nút)
Dùng Playwright MCP (plugin Playwright đã cài trong Claude Desktop; hoặc trình duyệt tích hợp của Desktop — mở được `localhost`): `browser_navigate` → `browser_snapshot` (đọc cấu trúc trang, tìm ref) → `browser_click` / `browser_fill_form` → `browser_take_screenshot`. Ưu tiên `browser_snapshot` để tìm phần tử, chỉ chụp ảnh ở các bước cần nhìn.

Không có MCP → viết test Playwright tạm trong vùng `paths` của task (`e2e/`), chạy `pnpm exec playwright test <file> --reporter=line`.

## Khi giao diện sai
1. `python scripts/logs.py dev` — lỗi server / build.
2. Console trình duyệt: Playwright MCP `browser_console_messages`.
3. Sửa → chụp lại → so ảnh.

## Checklist khi nhìn ảnh
- Chữ tiếng Việt hiển thị đúng dấu, không tràn, không bị cắt trên 390px.
- Có trạng thái loading / rỗng / lỗi.
- Nút chính dễ thấy, vùng bấm ≥44px.
- Số tiền định dạng `1.250.000 ₫`, ngày `dd/MM/yyyy`.
