# T-007 — Đường đọc dự phòng lọc bàn theo quán

Trạng thái: chờ 👤 anh Tú (chưa PASS).

Chuẩn bị: worktree quán phải `git merge main` trước (`cd mini-app-instances/bia-lau-bao-luong && git merge main`),
rồi `cd mini-app && npm run dev`. Ép rơi về đường dự phòng: DevTools → Network → chuột phải request
`rpc/get_mini_app_bootstrap` → Block request URL → tải lại trang.

## Test 1 — 👤 anh Tú: bàn đúng quán vẫn vào được
Mở link kèm slug Bảo Lương + id một bàn của Bảo Lương (đang chặn RPC). Kỳ vọng: menu hiện, đầu trang có đúng số bàn.

## Test 2 — 👤 anh Tú: bàn quán khác bị bỏ
Mở link slug Bảo Lương + id bàn của quán khác (vd. Yên Garden). Kỳ vọng: vào như lối thường (không bàn), KHÔNG hiện số bàn quán khác.

## Test 3 — 👤 anh Tú: đối chứng đường chính
Bỏ chặn RPC, lặp lại Test 2. Kỳ vọng: kết quả y hệt Test 2.
