# 05 — Quy trình làm việc với MEVO (đào tạo cả quán)

Đọc / diễn lại cho quán nghe trong buổi đào tạo (~45 phút). Có 4 vai: **Khách · Nhân viên phục vụ · Thu ngân · Bếp**. Chủ quán có thể kiêm thu ngân.

## 1. Bức tranh một vòng gọi món

```
KHÁCH quét QR bàn  ──►  chọn món, bấm "Gọi món"
                                │
                                ▼
THU NGÂN (POS): chuông kêu, bàn nhấp nháy, thẻ "Lượt N"
   soát món  ──►  [Duyệt & in bếp]   hoặc   [Từ chối + lý do]
                                │
                ┌───────────────┴───────────────┐
                ▼                               ▼
         Phiếu BẾP (không giá)           Phiếu BÀN (có giá, có ô ☐)
         đưa bếp làm                     nhân viên cầm bưng món, gạch ☐
                                │
                                ▼
Khách ăn xong ──► xin tính tiền ──► THU NGÂN: in hoá đơn ──► [Thu tiền] TM / CK
                                │
                                ▼
                    Bàn về "Trống", đơn tự "Hoàn tất", vào Báo cáo ngày
```

Điểm khác với quán trả trước: **khách chưa trả đồng nào lúc gọi**. Tiền thu ở quầy khi ra về. Vì vậy **thu ngân duyệt mới in** là chốt chặn chính.

## 2. Việc của từng vai

### Khách
- Quét QR bàn bằng Zalo → chọn món (có thể chọn loại: Tháp/Ca/Cốc, topping) → **Gọi món**.
- Gọi thêm lúc nào cũng được, cộng dồn một bill.
- Bấm **Gọi nhân viên** (chuông) khi cần; bấm **Gọi thanh toán** khi muốn tính tiền. Mỗi bàn bấm cách nhau tối thiểu 3 phút.
- Xem tab **Đơn gọi** thấy các lượt, tạm tính. Không phải trả gì trong app.

### Nhân viên phục vụ (điện thoại `/staff`)
1. **Khách không biết dùng QR / gọi hộ:** tab **Đặt món** → chọn bàn → thêm món → **Gửi đơn**. (Không hỏi tiền mặt hay CK. Thu ngân sẽ hỏi lúc thu.)
2. Chuông vàng **"Khách gọi nhân viên"** → ra bàn → **chạm thẻ** để báo đã xử lý.
3. **Bưng món** theo **phiếu bàn** → gạch ☐ từng món đã ra (gạch trên giấy, không bấm điện thoại giữa lúc bê đồ).
4. **Khách đoàn:** tab **Bàn → Ghép mâm** (chọn nhiều bàn thành một mâm). Mâm = một bill con. **Thêm bàn vào mâm** nếu khách kéo thêm bàn. **Nhập vào mâm** nếu một bàn lẻ muốn gộp.
5. Không duyệt đơn, không thu tiền.

### Thu ngân (POS ở quầy)
1. **Giữ POS luôn mở**, bật tiếng. Chuông kêu = có việc.
2. **Cột "Việc cần xử lý"** (bên phải) hiện theo thứ tự ưu tiên: Gọi nhân viên → lượt món chờ duyệt → khách trễ… Làm từ trên xuống.
3. **Lượt món chờ duyệt:** thẻ ghi *Mâm/Bàn · Lượt N · giờ gọi · nguồn (Khách QR / Nhân viên đặt hộ) · món + topping + tiền*.
   - Món đúng, bàn đúng → **Duyệt & in bếp** → ra **2 phiếu** → đưa phiếu bếp cho bếp, phiếu bàn cho người bưng.
   - Nghi ngờ (bàn đang trống, đơn quá nhiều, trò đùa) → **Từ chối** + chọn lý do. Lượt bị từ chối vẫn lưu để đối chiếu.
4. **Khách xin tính tiền:** bấm vào bàn (thanh trên Timeline / ô sơ đồ) → mở **bill** → **In tạm tính** đưa khách.
5. **Thu tiền:** chọn **Tiền mặt** hoặc **Chuyển khoản** (khách quét QR loa của quán, thu ngân nhìn app ngân hàng/loa báo đã nhận) → **Thu tiền** → bàn về Trống.
   - **Thu xong mới bấm Thu tiền.** Bấm rồi thì đơn tự hoàn tất.
6. **Sửa bill (có lý do, có lưu ai làm):**
   - **Bỏ món** (khách trả lại / bếp hết) — món 0đ nhưng còn hiện trên bill kèm lý do.
   - **Tặng món** — 0đ, ghi lý do.
   - **Số lượng** — đổi số lượng món đã gọi, lý do bắt buộc.
   - **Thêm món ghi tay** — vào bill nhưng **không in ra bếp** (dùng cho món bếp đã làm miệng / bán trực tiếp).
7. **Khách đoàn:** ghép mâm / thêm bàn ở tab **Sơ đồ bàn**. Muốn tính chung nhiều mâm: **Gộp bill** → tick các mâm → in **1 hoá đơn** → thu một lần, cả mâm cùng đóng. Mặc định mỗi mâm là một bill riêng.
8. **Khách lẻ ngồi quầy / mang đi gọi tay:** nút **Khách lẻ** — ghi món, không vào bếp.
9. **Món hết:** `Thêm → Thực đơn (Tạm hết)` → gạt **Tạm hết** → Mini App khách thấy ngay "Tạm hết".
10. **Cuối ca:** `Báo cáo` → xem tiền thật đã thu trong ngày, tách **tiền mặt / chuyển khoản**, danh sách bill, mục **Điều chỉnh bill (Bỏ / Tặng)**. Đối chiếu với **két tiền mặt** và **app ngân hàng**.

### Bếp
- **Không dùng màn hình.** Chỉ nhận **phiếu bếp** từ máy in, làm theo phiếu.
- Phiếu có tên bàn / mâm, giờ, danh sách món, ghi chú. Không có giá.
- Hết món / không làm được → báo ngay thu ngân để bấm **Tạm hết** và xử lý lượt đó.

## 3. Các tình huống thường gặp

| Tình huống | Làm thế nào |
|---|---|
| Khách gọi thêm món giữa chừng | Cứ gọi; thu ngân thấy **Lượt 2, 3…**, duyệt từng lượt, in thêm phiếu |
| Hai điện thoại quét cùng **bàn lẻ** | Chỉ người gọi đầu (chủ phiên) gọi được; máy kia chỉ xem. Muốn đổi: thu ngân/nhân viên **Chuyển quyền gọi món** |
| Hai điện thoại quét **bàn trong mâm** | Cả hai gọi được, chung một bill |
| Khách đổi bàn | Ghi chú trên POS, ghép/nhập đúng bàn mới; báo anh Tú nếu chưa quen thao tác |
| Khách bỏ về không trả | Xem *Bỏ bàn (không thu tiền)* — **chủ quán** quyết định, ghi lại để báo cáo |
| Đã duyệt nhưng bếp nói chưa nhận phiếu | **Đừng duyệt lại.** Kiểm máy in/giấy, nhìn lịch sử in; bếp làm theo phiếu đang có |
| In hai lần | Báo bếp chỉ làm một phiếu |
| Hết giờ phục vụ | Hệ thống tự chặn đơn mới theo giờ cài (08:00–23:00); khách quét ngoài giờ sẽ thấy khoá |
| Cần nghỉ khẩn | Chủ quán: `Cài đặt → Tạm nghỉ nhận đơn` |

## 4. Đặt bàn (nếu quán bật)
Khách đặt qua Mini App (tab **Đặt bàn**) hoặc thu ngân tạo tay. Thu ngân **Xác nhận** → gán bàn → **Khách đã đến** khi tới. Khách không đến → đánh dấu **Không đến**. Timeline giữ bàn khoảng **2 tiếng** từ giờ hẹn (đã cài cho Bảo Lương).

## 5. Quy tắc vàng (in nhỏ dán ở quầy)

1. **Chưa duyệt = bếp chưa làm.** Đừng nhắc bếp làm món chưa duyệt.
2. **Chưa thu tiền thật = chưa bấm Thu tiền.**
3. **Sửa bill thì ghi lý do.** Ai bỏ / tặng món báo cáo đều lưu tên.
4. **Chuông lạ, đơn lạ → từ chối hoặc ra bàn hỏi.**
5. **Mất mạng:** ghi tay, **không** thu / đóng bill; có mạng lại đối chiếu.
6. **Có gì không hiểu: gọi anh Tú, không tự sửa dữ liệu.**
