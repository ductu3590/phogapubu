# Yên Garden — màn chờ khởi động chỉ còn dòng chữ MEVO.VN (2026-11-19)

Theme garden: lúc mở Mini App, trong khi đọc quán, chỉ hiện ở giữa màn hình dòng
"MEVO.VN - Siêu ứng dụng cho nhà hàng, quán ăn, cà phê..." — không thanh đầu "M · MEVO", không thanh tab, không logo.
Đọc xong quán thì vào thẳng Trang chủ / Thực đơn có logo Yên Garden. Theme classic (Bảo Lương) giữ màn chờ cũ.
Code: `mini-app/src/components/ui/boot-splash.tsx`, `components/layout/layout.tsx`.

Lưu ý: trước màn này Zalo tự hiện màn tải của chính Zalo (icon + tên app đặt trên trang quản lý Zalo Mini App) — code
không đổi được phần đó. Lần mở đầu tiên app biết là theme garden nhờ `VITE_INITIAL_THEME=garden` trong `.env` của
worktree quán (agent chụp thử thì đã đúng garden ngay khung đầu).

**Test 1.** Thoát hẳn Mini App Yên Garden rồi quét QR bàn mở lại: thấy nền kem + đúng một dòng chữ ở giữa, rồi sang thực đơn.
Không lúc nào thấy vòng tròn chữ "M" hay chữ "MEVO" ở góc trên trái.
**Test 2.** Mở từ trang chủ (không quét bàn): như Test 1, rồi sang Trang chủ.
**Test 3.** Bảo Lương (`?store=bia-lau-bao-luong`, cửa sổ ẩn danh): màn chờ như cũ.
