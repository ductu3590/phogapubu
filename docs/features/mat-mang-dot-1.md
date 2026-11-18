# Mất mạng — Đợt 1
## Làm gì
POS thu ngân tự biết khi máy quầy mất mạng quá 60 giây: hiện băng đỏ "Mất mạng từ HH:MM". Khi có mạng lại, hiện băng vàng
"Vừa có mạng lại" báo có N lượt món khách gọi lúc mất mạng (quán tự vào bếp thì báo M đơn đã tự vào bếp, nhắc kiểm tra bếp),
kèm nút "Xem lượt chờ duyệt". Lượt món chờ duyệt từ 10 phút trở lên có nhãn "Gọi lúc HH:MM · đã chờ N phút" (thẻ Việc cần
xử lý, khung vàng trong bill, từng thẻ tab "Lượt gọi mới"). Kèm tờ quy trình A4 làm bằng giấy + 4G.
## File chính
`admin-web/lib/pos-offline-watch.ts` (toàn bộ luật), `admin-web/app/admin/pos/use-offline-watch.ts`,
`admin-web/app/admin/pos/offline-banner.tsx`, nhãn chờ trong `work-queue.tsx` và `bill-panel.tsx`;
tờ quy trình `docs/van-hanh/quy-trinh-mat-mang.html`.
## Giới hạn
- Tải lại trang giữa lúc mất mạng thì mất mốc, không có băng "Vừa có mạng lại".
- Mốc mất mạng cũng mất khi rời màn POS sang trang khác (ví dụ Báo cáo) rồi quay lại, giống như tải lại trang.
- Lệch đồng hồ máy quầy trong khoảng 2 phút (nhanh hoặc chậm) không làm đếm thiếu; lệch nhiều hơn thì băng vàng có thể đếm thiếu, nhưng lượt món vẫn nằm trong Việc cần xử lý và vẫn có nhãn chờ.
- Băng đỏ hiện cho MỌI trường hợp POS mất kết nối quá 60 giây, không chỉ đứt đường truyền — ví dụ phiên đăng nhập hết hạn, hoặc mạng dự phòng chặn kênh realtime trong khi các nút vẫn bấm được. Khi đó câu "Các nút sẽ báo lỗi" có thể không đúng.
- Hai lần mất mạng cách nhau quá 10 phút được báo thành hai lần riêng.
- Chưa có Quầy dự phòng (Đợt 2) và xử lý tiền mặt lúc mất mạng (Đợt 3).
### Chưa kiểm được
Sau một đêm mất mạng, phiên bàn có thể đã hết hạn nên bước "bàn đang mở: Thêm món" của tờ quy trình (ô ④, bước 6) có thể không làm được như ghi; cần thử một lần trên Bảo Lương trước khi quán dựa vào dòng đó.
## Tài liệu
Kiểm tay: `docs/testing/mat-mang/DOT-1.md`. Thiết kế: `docs/superpowers/specs/2026-11-18-xu-ly-mat-mang-tam-thoi-design.md`.
