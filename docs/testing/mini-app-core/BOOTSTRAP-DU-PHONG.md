# T-007 — Đường đọc dự phòng lọc bàn theo quán

Trạng thái: chờ 👤 anh Tú (chưa PASS).

Chuẩn bị: code này CHƯA vào main (chờ anh PASS) → worktree quán merge nhánh task: `cd mini-app-instances/bia-lau-bao-luong && git merge task/T-007`,
rồi `cd mini-app && npm run dev`. Ép rơi về đường dự phòng: DevTools → Network → chuột phải request
`rpc/get_mini_app_bootstrap` → Block request URL → tải lại trang.

## Test 1 — 👤 anh Tú: bàn đúng quán vẫn vào được
Mở link kèm slug Bảo Lương + id một bàn của Bảo Lương (đang chặn RPC). Kỳ vọng: menu hiện, đầu trang có đúng số bàn.

## Test 2 — 👤 anh Tú: bàn quán khác bị bỏ
Mở `http://localhost:5173/?store=bia-lau-bao-luong&table=4f99f479-4cbe-49b7-89fe-029d3216c576` (Bàn mẫu 1 của Yên Garden). Kỳ vọng: vào như lối thường (không bàn), KHÔNG hiện số bàn quán khác.

## Test 3 — 👤 anh Tú: đối chứng đường chính
Bỏ chặn RPC, lặp lại Test 2. Kỳ vọng: kết quả y hệt Test 2.
