# C-0 — Bài thử in ngầm 80mm trên máy nhiệt thật

Mục đích: xác nhận Electron in ngầm được khổ 80mm, dài theo nội dung, trên đúng model máy in của quán. Chưa đạt thì dừng, báo anh Tú.

Chạy trên máy quầy (hoặc máy cùng driver với máy quầy), trong thư mục `print-agent`:

```
npm run spike -- --printer "<tên máy in>" --mode measured|printer-default --fixture short|long|qr
```

Không có `--printer` thì lệnh chỉ liệt kê tên máy in Windows đang thấy.

## 1. Chuẩn bị

- [ ] Cài driver hãng cho máy in nhiệt, in thử trang test của Windows được.
- [ ] Cuộn giấy 80mm là mặc định trong driver.
- [ ] Bật cắt tự động (auto cut) trong driver.
- [ ] Ghi lại:
  - Model máy in: ______________________
  - Cổng kết nối: LAN / USB (khoanh một)
  - Tên máy in trong Windows: ______________________

## 2. Sáu tổ hợp (2 chế độ khổ giấy x 3 phiếu mẫu)

Với mỗi dòng, chạy lệnh rồi đánh dấu từng cột.

| # | mode | fixture | Rộng đúng 80mm, không co nhỏ | Đuôi giấy trắng dưới 1cm | Dao tự cắt | Dấu tiếng Việt rõ | Không cắt giữa chừng |
|---|------|---------|---|---|---|---|---|
| 1 | measured | short | [ ] | [ ] | [ ] | [ ] | [ ] |
| 2 | measured | long | [ ] | [ ] | [ ] | [ ] | [ ] |
| 3 | measured | qr | [ ] | [ ] | [ ] | [ ] | [ ] |
| 4 | printer-default | short | [ ] | [ ] | [ ] | [ ] | [ ] |
| 5 | printer-default | long | [ ] | [ ] | [ ] | [ ] | [ ] |
| 6 | printer-default | qr | [ ] | [ ] | [ ] | [ ] | [ ] |

Riêng `long`: phiếu phải đủ 60 món, dòng cuối "Hết phiếu — món cuối cùng là số 60" còn nguyên.

## 3. QR

- [ ] QR ở fixture `qr` rộng tối thiểu 35mm (đo bằng thước).
- [ ] Quét được bằng app ngân hàng thật (nội dung `https://mevo.vn/spike-qr-test`; app ngân hàng báo không phải mã thanh toán là chấp nhận, miễn đọc ra được chuỗi).

## 4. Rút dây mạng rồi in

Chỉ áp dụng nếu máy in nối LAN.

- [ ] Rút dây mạng máy in, in `short` (mode nào đạt ở bảng mục 2).
- [ ] Ghi lại `Get-PrintJob -PrinterName "<tên>"` thấy gì: ______________________
- [ ] Tên việc có chứa `MEVO-spike-short` không: Có / Không
- [ ] Cắm lại dây mạng: phiếu có in muộn không: Có / Không (mấy phút sau: ____)

### Tên việc dài 41 ký tự

Phần mềm in nhận ra phiếu trong hàng đợi Windows qua tên việc `MEVO-<uuid>`, dài 41 ký tự. Driver cắt tên quá ngắn thì phần mềm không thấy phiếu kẹt và báo in xong dù giấy chưa ra. Bài này áp dụng cả máy USB: thay vì rút dây, mở hàng đợi của máy in trong Windows rồi chọn Printer > Pause Printing để việc đứng lại.

- [ ] Rút dây mạng (hoặc Pause Printing), rồi chạy:

```
npm run spike -- --printer "<tên máy in>" --mode <mode đạt> --fixture short --title MEVO-11111111-2222-3333-4444-555555555555
```

- [ ] Xem tên thật trong hàng đợi:

```
Get-PrintJob -PrinterName "<tên máy in>" | Select-Object Id,DocumentName,JobStatus
```

- [ ] Chép nguyên văn `DocumentName`: ______________________
- [ ] Chép nguyên văn `JobStatus`: ______________________
- [ ] Đạt khi `DocumentName` chứa đủ `11111111-2222-3333-4444-555555555555`, hoặc bắt đầu bằng `MEVO-` và phần sau là đoạn đầu của mã đó, dài ít nhất 8 ký tự: Đạt / Không đạt
- [ ] Xoá việc này khỏi hàng đợi trước khi cắm lại dây hoặc bỏ Pause Printing, để phiếu không in ra.

Không đạt: dừng, báo anh Tú. Phần mềm không canh được hàng đợi trên model này.

## 5. Kết luận

- pageSizeMode được chọn: `measured` / `printer-default`
- Ghi chú thêm: ______________________

KẾT QUẢ: PASS / FAIL

Không đạt: dừng, báo anh Tú. Phương án lùi là mở bán chế độ `browser` với một máy in ở quầy, không làm ESC/POS.
