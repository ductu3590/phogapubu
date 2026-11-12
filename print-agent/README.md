# MEVO In (print-agent)

Phần mềm cài ở máy tính quầy. Cứ 2 giây hỏi server một lần, có phiếu thì mở trang in trong cửa sổ ẩn rồi in thẳng ra máy đã gán cho trạm. Dùng khi quán bật chế độ in `agent`. Quán ở chế độ `browser` không cần phần mềm này.

Chỉ cần cài trên một máy ở quầy. Máy in bếp nối LAN, miễn là Windows máy đó thấy máy in.

## Build

Cần Node 22.12 trở lên, chạy trên Windows.

```
npm ci
cp agent.config.example.json agent.config.json
```

Sửa `agent.config.json` (xem mục dưới), rồi:

```
npm run dist
```

File cài nằm ở `dist/MEVO In Setup <phiên bản>.exe`. Thiếu `agent.config.json`, hoặc file còn giá trị mẫu `YOUR-...`, thì lệnh dừng ngay, không ra bản cài.

`agent.config.json` giống nhau cho mọi quán (quán nào là do bước ghép máy quyết định), nên một file cài dùng chung cho tất cả quán, không phải build riêng từng quán.

Icon lấy từ `logo/logo.png` (phần bát phở), nằm ở `assets/icon.ico` + `assets/icon.png`. Đổi logo thì sinh lại hai file này.

Lệnh kiểm tra khi sửa code:

```
npx tsc --noEmit
npx vitest run
```

## Sửa agent.config.json

File này đóng thẳng vào bản cài và không đưa lên git. Sửa xong phải build lại.

| Trường | Giá trị |
|---|---|
| `supabaseUrl` | URL dự án Supabase |
| `anonKey` | Khoá công khai (anon) của Supabase. KHÔNG dùng khoá service role |
| `webOrigin` | Địa chỉ web quản lý, không có dấu `/` cuối |
| `pageSizeMode` | `measured` hoặc `printer-default`, lấy theo kết quả bài thử `docs/testing/dot1/C-0-may-in-that.md` |

Bản đã cài vẫn đọc file ở `<thư mục cài>\resources\agent.config.json`. Sửa tại chỗ rồi mở lại phần mềm cũng được, dùng khi cần đổi gấp ở quán.

## Cài ở quầy

1. Cài driver hãng cho từng máy in nhiệt, in được trang test của Windows.
2. Chép file cài sang máy quầy (USB, Zalo…) rồi bấm đúp. Windows sẽ hiện cảnh báo SmartScreen "Windows protected your PC" vì bản cài chưa ký số. Bấm "More info" rồi "Run anyway". Bản cài chạy một chạm, không hỏi gì, không cần quyền quản trị. Nó tự làm ba việc:
   - cài vào `%LOCALAPPDATA%\Programs\mevo-print-agent`,
   - tạo lối tắt "MEVO In" trên Desktop và trong Start menu,
   - ghi dòng tự chạy "MEVO In" vào `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, nên bật máy là phần mềm tự lên.
3. Cài xong phần mềm tự mở cửa sổ ghép máy. Trên web quản lý vào Cài đặt, mục In ấn, bấm "Thêm máy", rồi nhập mã 6 số. Mã dùng trong 10 phút.
4. Vẫn trên trang đó, chọn máy in cho từng trạm rồi bấm In thử.

Phần mềm nằm ở khay hệ thống cạnh đồng hồ và tự chạy cùng Windows. Bấm chuột phải vào biểu tượng để xem trạng thái (Đang chạy, Mất kết nối, Cần ghép máy), ghép lại hoặc thoát. Lỡ bấm Thoát thì bấm đúp lối tắt "MEVO In" trên Desktop để mở lại. Bấm lối tắt khi phần mềm đang chạy thì không mở bản thứ hai, chỉ hiện thông báo trạng thái ở góc màn hình (hoặc mở cửa sổ ghép máy nếu chưa ghép).

Gỡ: Settings, Apps, "MEVO In", Uninstall. Gỡ xoá lối tắt và dòng tự chạy, nhưng giữ khoá ghép máy ở `%APPDATA%\mevo-print-agent`, nên cài lại không phải ghép lại.

Ghép máy mới thì máy cũ của quán mất quyền ngay. Mỗi quán chỉ có một máy đang chạy.

Phiên bản này không tự cập nhật. Muốn lên bản mới thì chạy file cài mới đè lên.

## Khi in lỗi

Phần mềm không báo xong chỉ vì Windows đã nhận việc. Nó canh hàng đợi Windows tối đa 15 giây. Việc còn kẹt (máy in bị rút dây, hết giấy) sẽ bị xoá khỏi hàng đợi và báo "Máy in không phản hồi" lên POS, để phiếu không tự in muộn khi cắm lại. Người ở quầy kiểm tra máy in rồi bấm In lại.

POS báo "phiếu còn trong hàng đợi Windows" nghĩa là phần mềm không xoá được việc đó. Mở hàng đợi của máy in trong Windows, xoá tay rồi mới bấm In lại, không thì sẽ ra hai phiếu.

Biểu tượng ở khay hiện "Cảnh báo: không đọc được hàng đợi Windows" nghĩa là phần mềm vẫn in nhưng không phát hiện được phiếu kẹt. Chi tiết ở `%APPDATA%\mevo-print-agent\agent.log`. File này không chứa token.

Hàng đợi Windows phải đọc được tên việc (`MEVO-<mã phiếu>`) thì bước canh này mới có tác dụng. Lần đầu lắp máy in mới, chạy lại mục 4 của `docs/testing/dot1/C-0-may-in-that.md`.

## Bài thử in

`src/spike/` và `npm run spike` chỉ dùng cho bài thử C-0, không nằm trong bản cài.
