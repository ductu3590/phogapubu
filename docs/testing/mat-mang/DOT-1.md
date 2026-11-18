# Mất mạng Đợt 1 — POS báo mất mạng + tờ quy trình: checklist test

Thiết kế: [2026-11-18-xu-ly-mat-mang-tam-thoi-design.md](../../superpowers/specs/2026-11-18-xu-ly-mat-mang-tam-thoi-design.md). Mô tả tính năng: [mat-mang-dot-1.md](../../features/mat-mang-dot-1.md). Trạng thái: **PASS** — anh Tú báo 2026-11-18.

Đợt 1 làm ba việc ở POS thu ngân: (1) mất mạng quá 60 giây thì hiện **băng đỏ** "Mất mạng từ HH:MM"; (2) có mạng lại thì hiện **băng vàng** "Vừa có mạng lại" báo có bao nhiêu lượt món khách gọi lúc mất mạng; (3) lượt món chờ duyệt từ 10 phút trở lên có nhãn **"Gọi lúc HH:MM · đã chờ N phút"**. Kèm một tờ quy trình A4 để in dán ở quầy.

Test trên **Bảo Lương**, bằng máy tính đăng nhập POS. Cần thêm một điện thoại dùng 4G để làm bài 4, 5 (gọi món qua `/staff`). Ghi PASS / FAIL vào cột Kết quả. FAIL thì chép nguyên văn lỗi + chụp ảnh.

## Bài 1. Ngày thường không có gì mới

| # | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| 1.1 | Mở POS, để yên 2 phút, thỉnh thoảng bấm qua lại các tab | Không có băng đỏ hay băng vàng nào mới. Nhãn "Trực tuyến" vẫn xanh như cũ | |

## Bài 2. Rớt ngắn thì không báo

| # | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| 2.1 | Tắt Wi-Fi của máy quầy 30 giây, rồi bật lại | **Không** có băng đỏ. Sau khi có mạng lại cũng **không** có băng "Vừa có mạng lại" | |

## Bài 3. Mất mạng quá 1 phút thì hiện băng đỏ

| # | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| 3.1 | Ghi lại giờ tắt. Tắt Wi-Fi máy quầy, chờ 2 phút (giữ POS mở) | Sau khoảng 1 phút hiện băng đỏ "Mất mạng từ HH:MM" với HH:MM đúng giờ vừa tắt, kèm câu "Các nút sẽ báo lỗi. Mất lâu thì làm theo tờ quy trình mất mạng." | |
| 3.2 | Nhìn băng đỏ | Không có nút đóng băng | |
| 3.3 | Nếu chạy riêng bài này: bật Wi-Fi lại sau khi xem xong. Nếu làm tiếp bài 4 ngay thì **để nguyên Wi-Fi tắt** | Chạy riêng: có mạng lại, băng đỏ tắt | |

## Bài 4. Món khách gọi lúc quầy mất mạng

| # | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| 4.1 | Chuẩn bị trước khi tắt Wi-Fi: phải có sẵn một bàn đang mở trên Bảo Lương (mở từ POS bằng "Khách lẻ"). Làm tiếp bài 3, Wi-Fi máy quầy vẫn đang tắt. Điện thoại phải dùng 4G, **không** dùng Wi-Fi của quán. Vào `/staff`, gửi **hai** lượt món, mỗi lần một lượt qua màn đặt món, vào cùng bàn đang mở hoặc vào hai bàn | Điện thoại báo gửi thành công cả hai lần | |
| 4.2 | Bật Wi-Fi máy quầy lại | Băng đỏ tắt. Hiện băng vàng "Vừa có mạng lại" với câu "Có 2 lượt món gọi lúc mất mạng (từ HH:MM). Hỏi lại khách trước khi duyệt; đã nhập tay rồi thì Từ chối." | |
| 4.3 | Bấm nút "Xem lượt chờ duyệt" trên băng vàng | Panel "Việc cần xử lý" mở ra, chỉ hiện các mục "Lượt món chờ duyệt", trong đó có hai lượt món vừa gửi ở bước 4.1 | |
| 4.4 | Chỉ xử lý **một** lượt món: Duyệt (hoặc Từ chối). Để lượt món còn lại nguyên đó chờ duyệt cho bài 6 | Duyệt / Từ chối chạy như cũ | |
| 4.5 | Bấm nút đóng trên băng vàng | Băng vàng mất | |

## Bài 5. Mạng chập chờn

| # | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| 5.1 | Chuẩn bị như bài 4: có sẵn một bàn đang mở trên Bảo Lương, điện thoại dùng 4G (không dùng Wi-Fi của quán). Tắt Wi-Fi 70 giây. Trong lúc tắt, gửi một lượt món qua `/staff` bằng điện thoại 4G. Bật Wi-Fi 30 giây (để POS kịp nối lại), rồi tắt lại 70 giây. Trong lần tắt thứ hai, gửi thêm một lượt món qua `/staff`. Rồi bật Wi-Fi | Băng vàng "Vừa có mạng lại" tính lượt món của **cả hai** lần tắt (ví dụ "Có 2 lượt món…", nếu cả hai lượt món còn đang chờ duyệt) | |

## Bài 6. Nhãn "Gọi lúc … · đã chờ … phút"

| # | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| 6.1 | Để một lượt món chờ duyệt quá 10 phút (dùng lượt còn lại của bài 4, đừng duyệt, chờ đủ 10 phút). Nhìn thẻ lượt món trong "Việc cần xử lý" | Thẻ ghi "Gọi lúc HH:MM · đã chờ N phút" | |
| 6.2 | Mở bill của bàn đó, nhìn khung vàng "Có N lượt món đang chờ duyệt!" | Khung vàng cũng ghi nhãn "Gọi lúc HH:MM · đã chờ N phút" (của lượt chờ lâu nhất) | |
| 6.3 | Trong bill, mở tab "Lượt gọi mới" | Mỗi thẻ lượt chờ từ 10 phút trở lên có nhãn "Gọi lúc HH:MM · đã chờ N phút" | |
| 6.4 | Gửi một lượt món mới (vừa gửi, chưa chờ đủ 10 phút) | Lượt mới **không** có nhãn | |

## Bài 7. Tải lại trang giữa lúc mất mạng

| # | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| 7.1 | Tắt Wi-Fi, chờ băng đỏ hiện. Tải lại trang (nếu trình duyệt không tải được trang lúc mất mạng thì bật Wi-Fi rồi tải lại ngay) | Sau khi có mạng và tải lại: **không** có băng "Vừa có mạng lại". Đây là giới hạn đã biết, chấp nhận | |
| 7.2 | Nếu còn lượt món chờ từ 10 phút trở lên | Nhãn ở bài 6 vẫn hiện bình thường | |

## Bài 8. Tờ quy trình

| # | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| 8.1 | Mở `docs/van-hanh/quy-trinh-mat-mang.html` bằng Chrome, bấm Ctrl+P, chọn khổ A4 | Xem trước đúng **1 trang**, không chữ nào bị cắt | |
| 8.2 | Anh Tú đọc cả tờ | Chữ dễ hiểu với thu ngân. Sửa lại chữ nếu cần, đặc biệt ô ③ về khách chuyển khoản và "bảng giá in" | |
| 8.3 | In thử ra giấy | Chữ đủ to, đọc được từ xa cỡ một cánh tay | |

## Bài 9. Router còn, internet đứt

Đây là kiểu hỏng thật mà tính năng này sinh ra để báo. Tắt Wi-Fi ở bài 3 chỉ thử được trường hợp máy biết ngay là mất mạng.

| # | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| 9.1 | Để máy quầy vẫn nối router, nhưng cắt internet phía sau router: rút dây WAN / dây quang khỏi router, hoặc nối máy quầy vào điểm phát Wi-Fi của một điện thoại rồi tắt dữ liệu di động của điện thoại đó. Ghi lại giờ cắt, chờ vài phút (giữ POS mở). Nếu muốn thử băng vàng: trong lúc đó gửi một lượt món qua `/staff` bằng điện thoại 4G khác | Băng đỏ "Mất mạng từ HH:MM" hiện trong khoảng 2 phút (chậm hơn bài 3 vì máy vẫn tưởng còn mạng). Giờ ghi trên băng có thể muộn hơn giờ cắt thật tới khoảng 1 phút | |
| 9.2 | Nối internet lại (cắm lại dây hoặc bật lại dữ liệu di động) | Băng đỏ tắt. Nếu có gửi lượt món ở 9.1 thì băng vàng đếm lượt đó | |
