# 06 — Chạy thử, ngày đầu và xử lý sự cố

## A. Kịch bản chạy thử (làm cả quán cùng xem, 30–40 phút, giờ vắng)

Chuẩn bị: POS mở, máy in sẵn giấy, 1–2 nhân viên cầm điện thoại, anh Tú một điện thoại có Zalo (đã là tester của Mini App).
Dùng **Bàn 20** làm bàn thử; xong **Bỏ bàn (không thu tiền)** để không vào doanh thu.

| # | Kịch bản | Kết quả đúng | ☐ |
|---|---|---|---|
| 1 | Nhân viên: Đặt món → Bàn 20 → 2 món → Gửi đơn | Thông báo đã gửi; **không** hỏi TM/CK | ☐ |
| 2 | POS | Chuông kêu, thẻ **Lượt 1**, thanh Bàn 20 vàng nhấp nháy | ☐ |
| 3 | Thu ngân bấm **Duyệt & in bếp** | Ra **2 phiếu** đúng 1 lần; phiếu bếp **không giá**; phiếu bàn **có ô ☐** | ☐ |
| 4 | Anh Tú quét QR Bàn 20 bằng Zalo → gọi 1 món | Hiện lượt mới ở POS; duyệt được | ☐ |
| 5 | Máy thứ hai quét Bàn 20 | Banner đỏ "Bàn này đang có khách…", **không** thêm món được | ☐ |
| 6 | Khách bấm **Gọi nhân viên** | Điện thoại nhân viên kêu + dải vàng; chạm thẻ → tắt; POS cũng báo | ☐ |
| 7 | Thu ngân **In tạm tính** | Hoá đơn 80mm: tên quán, địa chỉ, SĐT, món gộp theo tên, TỔNG | ☐ |
| 8 | **Bỏ 1 món** có lý do; **Tặng 1 món** có lý do | Tổng giảm đúng; bill in dòng Bỏ/Tặng kèm lý do | ☐ |
| 9 | Ghép **Bàn 18+19** thành mâm → đặt hộ vào Bàn 19 | Đơn vào mâm, không đẻ ra bàn riêng | ☐ |
| 10 | Gộp bill 2 mâm (nếu có) → in 1 hoá đơn | Dòng từng mâm + TỔNG CỘNG | ☐ |
| 11 | **Thu tiền** (Chuyển khoản) | Bàn về Trống, đơn Hoàn tất | ☐ |
| 12 | Mở **Báo cáo** | Số thu khớp, đúng cột CK | ☐ |
| 13 | Thực đơn → gạt **Tạm hết** 1 món | Mini App khách thấy "Tạm hết"; bật lại được | ☐ |
| 14 | Tắt wifi POS 10 giây | Báo mất kết nối, tự nối lại khi có mạng | ☐ |
| 15 | Dọn bàn thử | Bàn 20 và các bàn thử trống; không còn phiên treo | ☐ |

Bài **bắt buộc đạt trước go-live:** 1, 2, 3, 5, 7, 11, 12.

Không đạt bài nào → dừng, chụp màn hình + ghi "đang ở màn nào, bấm gì, chờ gì". Nếu lỗi tiền hoặc đơn không vào bếp, kèm kết quả câu SQL ở mục 6 của `TESTING-BAO-LUONG.md`.

## B. Danh sách cuối trước khi mở cửa

- [ ] POS: đăng nhập thu ngân, tiếng bật, in thử OK, máy in có **giấy dự phòng**
- [ ] Mỗi nhân viên phục vụ đăng nhập `/staff` OK
- [ ] 20 bàn đều có QR, đã quét thử OK
- [ ] Menu đúng giá, món hết đã gạt **Tạm hết**
- [ ] Giờ phục vụ đúng; không bật Tạm nghỉ nhận đơn
- [ ] Có sổ + bút ghi tay dự phòng ở quầy
- [ ] 4G dự phòng (điện thoại phát wifi) sẵn
- [ ] Số anh Tú dán ở quầy
- [ ] Zalo Publish đã **duyệt**; hai biến Vercel `NEXT_PUBLIC_ZALO_ENV/VERSION` đã để trống (nếu chưa, QR khách thật chưa dùng được)
- [ ] Đã dọn mọi đơn / phiên thử (xem Báo cáo = 0 trước giờ mở)

## C. Ngày đầu chạy thật

**Giờ cao điểm anh Tú có mặt** (hoặc người quán đã tập kỹ). Sáng: quét thử 3 bàn. Trong ca ghi nhanh ra giấy:

| Quan sát | Ghi |
|---|---|
| Đơn bị chậm duyệt (khách đợi lâu chưa thấy in) | |
| Lượt trùng / in 2 lần | |
| Khách không quét được QR | |
| Nhân viên bối rối ở bước nào | |
| Chuông có bị bỏ lỡ không | |

Cuối ngày: đối chiếu `Báo cáo` với **két + app ngân hàng**. Lệch → ghi lại, đừng sửa số.

## D. Sự cố nhanh

| Sự cố | Người xử lý | Cách |
|---|---|---|
| Mất mạng POS | Thu ngân | Ghi tay, **không** thu/đóng bill. Bật 4G dự phòng. Có mạng → tải lại POS, đối chiếu sổ tay |
| Mất điện | Chủ quán | Ghi tay. Có điện, PC tự bật (nếu đã cài BIOS), mở POS, **các lượt chờ duyệt sẽ kêu chuông cả loạt** — bình thường, duyệt lần lượt |
| Máy in lỗi | Thu ngân | Kiểm giấy/cáp, thử in lại; không được thì đọc món từ thẻ POS cho bếp |
| Khách quét QR bàn không vào | Nhân viên | Đặt hộ bằng `/staff/order`; ghi lại cho anh Tú |
| Khách phàn nàn đơn bị lạ | Thu ngân | **Từ chối** lượt, hỏi bàn, báo chủ quán |
| Bàn bị "khoá" (máy khác đang giữ) | Nhân viên/thu ngân | **Chuyển quyền gọi món** cho đúng máy |
| Nhân viên mất điện thoại / nghỉ việc | Chủ quán | `Nhân viên → Vô hiệu hoá` |
| Cần dừng khẩn | Chủ quán / anh Tú | `Cài đặt → Tạm nghỉ nhận đơn` (đơn cũ vẫn xử lý được) |

## E. Hỗ trợ sau go-live (tuần đầu)

- Anh Tú nhắn nhóm Zalo cuối mỗi ngày: "Hôm nay có gì vướng?"
- Ngày 3 và ngày 7: gặp quán 15 phút xem lại những chỗ nhân viên hay quên.
- Nhóm điều chỉnh ưu tiên khi quán mở rộng: thêm thu ngân, **tắt in ra 2 tờ nếu quán thấy thừa**, bật **vòng quay/voucher** (đang tắt), kiosk POS (xem `cai-pos-bao-luong.bat`).
