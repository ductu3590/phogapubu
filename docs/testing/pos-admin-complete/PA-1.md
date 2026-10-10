# PA-1 — Nút Cài đặt, chuông, Báo cáo ngày

Spec `docs/superpowers/specs/2026-10-07-pos-admin-complete-design.md` · Plan `docs/superpowers/plans/2026-10-07-pa1-settings-bell-daily-report.md`
Migration đã áp prod: 091 (`stores.bell_style`), 092 (`get_daily_report`). Test trên **Bảo Lương**, đăng nhập chủ quán.

## Nút ⚙ Cài đặt
1. Rail trái: có nút **⚙ Cài đặt** nằm ngay TRÊN ô "Thêm". Bấm → hộp thoại mở ở tab **Cấu hình quán**, nút ⚙ sáng cam.
2. Mở ô **Thêm** → KHÔNG còn mục "Cài đặt quán"; các mục khác (Đặt bàn, Bàn & QR, Nhân viên, Ưu đãi, Vòng quay, Tài khoản) vẫn đủ.
3. Điện thoại (≤ 400px): menu ☰ → nhóm Thiết lập có **Cài đặt** đứng đầu.

## Chuông
4. Tab Cấu hình quán có khối **Âm thanh thông báo**: 3 kiểu chuông; bấm chọn từng kiểu → nghe thử ngay tiếng của kiểu đó.
5. Chọn **Gõ nhẹ** → **Lưu kiểu chuông** → dùng Mini App gọi món một bàn → POS kêu một tiếng nhỏ.
6. Kéo thanh **Âm lượng trên máy này** về 0 → gọi món → POS im. Kéo lên 100 → Nghe thử to hơn. F5 → âm lượng giữ nguyên.
7. Mở POS trên máy/trình duyệt KHÁC → âm lượng là 80% (máy riêng), kiểu chuông vẫn là Gõ nhẹ (theo quán).
8. Trên POS bấm nút **loa** cạnh "Đặt bàn mới" → ô chỉnh âm lượng + Nghe thử hiện ra, chỉnh được.
9. Chọn **Báo liên tục** → Lưu → gọi món → POS kêu lặp ~3 giây/lần. Chạm bất kỳ đâu trên POS → im ngay.
10. Vẫn kiểu Báo liên tục: gọi món, KHÔNG chạm màn, duyệt lượt đó từ máy khác (hoặc từ chối) → hàng việc rỗng → im.
11. Màn **nhân viên** `/staff/tables`: khách bấm Gọi nhân viên → kêu đúng kiểu đã chọn.
12. Đổi lại **Ding-dong kép** sau khi test xong.

## Báo cáo ngày
13. Bấm **Báo cáo** trên rail → hộp thoại "Báo cáo ngày", hôm nay. 4 thẻ: Tổng thực thu · Tiền mặt · Chuyển khoản · Đang mở / chưa thu.
14. Thu tiền 1 bàn bằng **Tiền mặt**, 1 bàn bằng **Chuyển khoản** trên POS → mở lại Báo cáo (bấm Làm mới) → 2 bill mới, thẻ Tiền mặt / Chuyển khoản tăng đúng số.
15. **Gộp bill** 2 mâm rồi thu → báo cáo hiện **MỘT dòng** "Gộp 2 mâm" với tổng chung (không phải 2 dòng).
16. Thẻ "Đang mở" khớp số bàn đang có khách trên POS; tạm tính khớp tổng các bill đang mở.
17. Bỏ 1 món + tặng 1 món trên một bill (có lý do) → khối **Điều chỉnh bill** hiện 2 dòng, đủ giờ, người làm, lý do.
18. Bấm **Xem / In lại** ở một bill → mở tab hoá đơn 80mm đúng món, đúng tổng.
19. Đổi ngày sang hôm qua → số liệu đổi; thẻ thứ 4 thành "Số bill"; không chọn được ngày mai.
20. Đóng hộp thoại sau khi đổi ngày 2–3 lần → về thẳng POS.

**→ Báo:** `PA-1 PASS` hoặc số bài FAIL kèm ảnh.
