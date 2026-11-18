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
Tải lại trang giữa lúc mất mạng thì mất mốc, không có băng "Vừa có mạng lại". Đồng hồ máy quầy lệch quá 2 phút thì số lượt đếm
có thể thiếu. Chưa có Quầy dự phòng (Đợt 2) và xử lý tiền mặt lúc mất mạng (Đợt 3).
## Tài liệu
Kiểm tay: `docs/testing/mat-mang/DOT-1.md`. Thiết kế: `docs/superpowers/specs/2026-11-18-xu-ly-mat-mang-tam-thoi-design.md`.
