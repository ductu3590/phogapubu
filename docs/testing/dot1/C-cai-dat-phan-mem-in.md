# Đợt 1 C — Bản cài phần mềm in (MEVO In 0.2.0)

File cài: `print-agent/dist/MEVO In Setup 0.2.0.exe` (115 MB, build 2026-11-12 trên nhánh
`claude/printer-software-setup-autostart-15e01b`). Một file dùng cho mọi quán.

Đã tự kiểm trên máy dev (cài im lặng `/S`): lối tắt Desktop + Start menu có, dòng tự chạy `MEVO In` có,
cài đè lần hai vẫn giữ dòng tự chạy, gỡ thì xoá lối tắt + dòng tự chạy nhưng giữ token ghép máy.
Các bài dưới là phần máy dev không thay được: bấm tay, khởi động lại, máy quầy thật.

Làm trên **máy quầy** (hoặc một máy Windows chưa từng cài MEVO In).

## Test 1 — Cài một chạm

1. Chép file cài sang máy, bấm đúp.
2. SmartScreen hiện "Windows protected your PC": bấm "More info" rồi "Run anyway".

- [ ] Không hỏi thư mục, không hỏi quyền quản trị, chỉ có thanh tiến trình rồi tự đóng
- [ ] Desktop có lối tắt "MEVO In", icon bát phở cam (không phải icon Electron xanh)
- [ ] Start menu có "MEVO In"
- [ ] Cửa sổ "MEVO In - Ghép máy" tự mở ngay sau khi cài (máy chưa ghép bao giờ)

## Test 2 — Ghép máy và in thử

1. Trên web quản lý: Cài đặt, In ấn, "Thêm máy", nhập mã 6 số vào cửa sổ ghép.
2. Chọn máy in cho từng trạm, bấm In thử.

- [ ] Ghép thành công, hiện tên quán
- [ ] Biểu tượng khay cạnh đồng hồ, chuột phải thấy "Đang chạy"
- [ ] In thử ra giấy đúng máy

## Test 3 — Tự khởi động khi bật máy

1. Khởi động lại máy quầy (Restart), đăng nhập Windows như bình thường.

- [ ] Không bấm gì, sau khoảng 30 giây biểu tượng MEVO In đã nằm ở khay, chuột phải thấy "Đang chạy"
- [ ] Không phải ghép lại
- [ ] Task Manager, tab Startup apps: có đúng MỘT dòng "MEVO In", trạng thái Enabled
- [ ] Gửi một phiếu từ POS: ra giấy

## Test 4 — Bấm lối tắt khi đang chạy

1. Phần mềm đang chạy, bấm đúp lối tắt "MEVO In" trên Desktop.

- [ ] Hiện thông báo góc phải dưới "MEVO In đang chạy — Đang chạy. Biểu tượng nằm ở khay…"
- [ ] Không có biểu tượng khay thứ hai (Task Manager chỉ một nhóm "MEVO In")

2. Chuột phải biểu tượng khay, Thoát. Bấm đúp lối tắt Desktop.

- [ ] Phần mềm lên lại, khay "Đang chạy", không phải ghép lại

## Test 5 — Gỡ và cài lại

1. Settings, Apps, "MEVO In", Uninstall, xác nhận.

- [ ] Lối tắt Desktop + Start menu biến mất
- [ ] Task Manager, Startup apps không còn "MEVO In"

2. Cài lại bằng file cài.

- [ ] Phần mềm lên thẳng "Đang chạy", KHÔNG hỏi ghép lại (token được giữ)

KẾT QUẢ: PASS (anh Tú, 2026-11-12)
