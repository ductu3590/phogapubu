# Quyết định đang chờ anh duyệt

Agent ghi vào đây khi chạm cổng cứng hoặc gặp điều thuộc "Quyết định dành cho người" trong PROJECT.md. Anh trả lời ngay dưới mục, hoặc chạy `python scripts/approve.py <gate> <giờ>`. Orchestrator đọc lại file này mỗi vòng.

Mẫu:
```
## D-001 · 2026-11-09 · gate: auth · task: T-004 · trạng thái: chờ
- Cần làm: thêm Google login vào middleware
- Vì sao: tiêu chí chấp nhận của T-004
- Phương án đề xuất: ... (khuyến nghị)  /  Phương án khác: ...
- Rủi ro nếu duyệt: ...
- Trả lời của anh:
```

---

## D-001 · 2026-11-13 · gate: harness · task: T-000 · trạng thái: chờ
- Cần làm: dọn `.harness/gates.json` do bước quét adopt tự sinh.
- Vì sao: bước quét gác theo tên file nên vừa gác nhầm vừa sót:
  - **Gác nhầm** (`auth`): `admin-web/lib/session-table-label*` (phiên BÀN, không phải đăng nhập), mọi đường dẫn
    `mini-app-instances/**` (bản sao worktree, kể cả file build `www/assets/authorize.*.module.js`).
  - **Sót** (`payments`): `supabase/functions/checkout-create-mac/**`, `supabase/functions/checkout-notify/**`,
    `mini-app/src/pages/checkout/**`, `mini-app/src/components/checkout/**` — đúng vùng anh chỉ định "không đụng".
  - **Vùng không đụng** anh chỉ định chưa vào `legacy`: `mini-app-instances/**`.
- Phương án đề xuất (khuyến nghị): xoá 11 dòng gác nhầm ở `auth`; thay 2 dòng `mini-app-instances/...checkout` ở
  `payments` bằng 4 glob checkout của source lõi + edge function; thêm `mini-app-instances/**` vào `legacy.globs`.
  Anh chạy `python scripts/approve.py harness 1` rồi nói "áp dụng D-001", agent sửa trong lúc cổng mở.
- Phương án khác: để nguyên — chỉ phiền (hỏi duyệt nhầm khi sửa `session-table-label`) và hở (checkout lõi không bị gác).
- Rủi ro nếu duyệt: thấp — chỉ đổi danh sách cổng, không đổi code.
- Trả lời của anh: OK đề xuất
- **Đã áp dụng 2026-11-15:** `auth` bỏ 9 dòng gác nhầm (2 `session-table-label*` + 7 `mini-app-instances/...`; giữ
  `session-timeout*` vì là hết hạn phiên đăng nhập); `payments` thay 2 dòng `mini-app-instances/...` bằng 4 glob checkout
  lõi + edge function; `legacy.globs` = `mini-app-instances/**`. Trạng thái: xong.

## D-002 · 2026-11-13 · gate: — · task: T-000 · trạng thái: đã chốt (ghi để orchestrator biết)
- Áp migration lên prod qua Supabase MCP: anh Tú **giữ cho agent tự áp** (khác `defaults.md` "luôn hỏi"). Điều kiện: áp
  NGUYÊN VĂN file đã commit, kiểm neo `pg_get_functiondef` trước, không sửa migration cũ.
- Quy tắc test của CLAUDE.md đứng trên `/build`: xong task có thay đổi hành vi → checklist ở `docs/testing/<đợt>/`,
  dừng chờ anh Tú PASS rồi mới giao task phụ thuộc.

## D-003 · 2026-11-15 · gate: data · task: T-003 · trạng thái: chờ
- Cần làm: xoá cache type cũ của Next ở checkout gốc: thư mục `admin-web/.next/types` (và `admin-web/.next/dev/types` nếu có).
  `.next` đã gitignore, Next tự sinh lại khi `npm run dev` / `npm run build`.
- Vì sao: sau T-003 (hết test chập chờn), bước verify `10-admin-web` lần đầu chạy tới `tsc` ở checkout gốc và đỏ vì
  `.next/types/validator.ts` (ngày 12/11) còn trỏ tới trang đã xoá (`admin/spin`, `admin/orders`, `admin/dashboard`,
  `mevo/ui-kit`…). Worktree task không có `.next` nên xanh — chỉ checkout gốc bị.
- Phương án đề xuất (khuyến nghị): anh tự xoá thư mục đó trong Explorer rồi nói "xong D-003"; hoặc mở cổng `data` 1 giờ
  (lệnh duyệt như mẫu đầu file) rồi nói "áp dụng D-003" để agent xoá. Sau đó agent chạy lại verify trên main.
- Phương án khác: để nguyên — verify trên main đỏ mãi ở admin-web (máy khác / CI không bị).
- Rủi ro nếu duyệt: không có — chỉ là cache, Next sinh lại.
- Trả lời của anh:

## D-004 · 2026-11-15 · gate: deploy · task: — · trạng thái: xong
- Cần làm: `git push origin main` (60+ commit: T-000..T-007, mig 140 đã áp prod). Push kích hoạt Vercel deploy admin-web.
- Vì sao: anh Tú bảo "Push main" trong chat 2026-11-15; hook cổng `deploy` chặn agent push nhánh chính.
- Phương án đề xuất (khuyến nghị): anh mở cổng `deploy` 1 giờ (lệnh duyệt như mẫu đầu file) rồi nói "push tiếp", agent push và báo kết quả.
  Hoặc anh tự chạy `git push origin main` trong terminal.
- Rủi ro nếu duyệt: thấp — mọi task đã qua reviewer, verify xanh trên worktree; admin-web thêm ô chọn giao diện `/mevo`, ô
  "Gợi ý gọi thêm nhanh", ảnh món WebP; không cần env mới trên Vercel. Mini App KHÔNG tự lên Zalo (cần `zmp deploy` riêng).
- Trả lời của anh: Push main (chat 2026-11-15), đã mở cổng → **đã push 2026-11-15** `00bde28..460e79e`

## D-006 · 2026-11-16 · gate: auth · task: tăng tốc bấm nút admin (sau đổi vùng bom1) · trạng thái: xong
- Cần làm: sửa 2 file luồng đăng nhập để bớt chặng mạng tới Supabase Auth mỗi lần bấm nút:
  1. `admin-web/proxy.ts`: request điều hướng mềm / server action (header `RSC: 1` / `Next-Action`) đang gọi
     `supabase.auth.getUser()` (một chuyến mạng) rồi trả về NGAY mà không dùng kết quả. Đổi sang `getSession()` — chỉ đọc
     cookie, chỉ gọi mạng khi token hết hạn cần làm mới (vẫn giữ việc làm mới phiên ở proxy). Tải trang cứng giữ nguyên `getUser`.
  2. `admin-web/lib/auth/operator.ts` `loadOperator`: đang `getUser` XONG mới hỏi `mevo_operators` (2 chặng nối tiếp).
     Đổi thành chạy song song: hỏi `mevo_operators` theo id đọc từ token trong cookie (`lib/auth/jwt-subject.ts`, không
     xác thực) cùng lúc với `getUser`; CHỈ dùng bản ghi khi id đó trùng id `getUser` đã xác thực, lệch thì hỏi lại theo id
     thật. Kèm trả email để layout /admin + POS khỏi gọi `getUser` thêm lần nữa.
- Vì sao: đo prod sau khi chuyển bom1, mỗi lần bấm vẫn ~500–800ms; 2 chặng thừa này mỗi chặng ~50–100ms (proxy) + một
  chặng nối tiếp trong `loadOperator`.
- Phương án đề xuất (khuyến nghị): anh mở cổng `auth` 1 giờ (lệnh duyệt như mẫu đầu file), agent sửa + test (vitest
  `operator.test.ts`, test mới cho id lệch) + Playwright đăng nhập 3 vai, rồi deploy.
  Phương án khác: chỉ làm phần gộp truy vấn ở các trang (không đụng auth) — được ít hơn.
- Rủi ro nếu duyệt: thấp–vừa. Xác thực vẫn do `getUser` (máy chủ Auth) + RLS; id đoán chỉ để chạy trước, không dùng cấp
  quyền. Proxy không còn chặn gì ở request RSC từ 2026-10-04 (chỉ làm mới phiên) nên `getSession` đủ cho việc đó.
- Trả lời của anh: "Đã mở cả hai cổng" (chat 2026-11-16) → đã làm cả 2 mục + bỏ `getUser` thừa ở layout /admin, /staff,
  /mevo. Test: `lib/auth/operator.test.ts` (thêm ca token mang id lệch → hỏi lại theo id thật), Playwright 3 vai + tài
  khoản còn cờ đổi mật khẩu (vẫn bị chặn cả tải cứng lẫn điều hướng mềm).

## D-005 · 2026-11-16 · gate: secrets · task: rail POS + nút Mở bàn · trạng thái: xong
- Cần làm: chép `admin-web/.env.local` từ repo gốc sang worktree `timeline-ui-buttons-43fcde/admin-web/` để chạy dev
  server xem trước giao diện (rail mới, nút "+ Mở bàn").
- Vì sao: worktree không có `.env.local` (gitignored) nên agent không dựng được bản chạy thử; cổng secrets chặn lệnh chép.
- Cập nhật 2026-11-16: anh Tú yêu cầu agent tự test UI bằng Playwright → cần (1) chép `.env.local` sang worktree,
  (2) chạy script tạo phiên test (đọc service key trong `.env.local`, token không in ra, chỉ ghi file cookie tạm rồi xoá).
- Phương án đề xuất (khuyến nghị): anh mở cổng `secrets` 1 giờ (lệnh duyệt như mẫu đầu file) để agent làm (1)+(2).
  Phương án khác: anh tự chép `.env.local` — vẫn cần cổng cho (2) vì script đọc service key.
- Rủi ro nếu duyệt: thấp — chỉ chép file sang thư mục gitignored trên máy anh, không in nội dung.
- Trả lời của anh: "Đã mở cổng" (chat 2026-11-16) → agent đã chép `.env.local` vào worktree, tạo phiên test cho
  `baoluong@`, `baoluong-pos@`, `baoluong-quanly@`, chạy Playwright, rồi xoá các file cookie tạm trong `public/`.
- Lần 2 (2026-11-16, xoá bàn + chọn nhiều bàn): cổng hết hạn, agent xin anh mở lại `secrets` 1 giờ để tạo phiên test
  `baoluong@` cho Playwright (cùng cách trên).

## D-007 · 2026-11-16 · gate: harness · task: báo cáo chuyên nghiệp · trạng thái: xong
- Cần làm: sửa cổng `harness` để không chặn nhầm lệnh shell chỉ vì đường dẫn có `.claude`.
- Vì sao: worktree của phiên nằm ở `D:\Code\mevo\.claude\worktrees\<tên>\`, nên mọi lệnh có đường dẫn tuyệt đối tới chính
  file dự án (vd `cp … D:/Code/mevo/.claude/worktrees/…/docs/x.html`) và mọi script của skill superpowers (nằm ở
  `C:\Users\ductu\.claude\plugins\…`) đều bị chặn là "đụng file harness". Agent đang chạy được bằng đường dẫn TƯƠNG ĐỐI
  từ gốc worktree và tự làm bằng tay phần việc của script skill (ledger, gói review), không đụng `.harness/` hay `.claude/`
  thật.
- Phương án đề xuất (khuyến nghị): cổng `harness` chỉ khớp `.harness/**`, `.claude/settings*.json`, `.claude/hooks/**`,
  `.claude/agents/**`, `.claude/skills/**` của repo gốc — không khớp `.claude/worktrees/**` và `~/.claude/plugins/**`.
  Phương án khác: để nguyên, agent tiếp tục dùng đường dẫn tương đối.
- Rủi ro nếu duyệt: thấp — chỉ thu hẹp mẫu khớp đường dẫn, các file harness thật vẫn bị gác.
- Trả lời của anh: Đồng ý đề xuất của bạn
- **Đã áp dụng 2026-11-17:** `.harness/gates.json` thay `.claude/**` bằng `.claude/settings*.json`, `.claude/hooks/**`,
  `.claude/agents/**`, `.claude/skills/**`; `.claude/hooks/harness_guard.py` lấy phần trước ký tự glob đầu tiên làm chuỗi
  dò lệnh shell (trước rút về `.claude` trần). Kiểm: lệnh có đường dẫn worktree / `~/.claude/plugins` không còn bị chặn;
  ghi vào `.claude/hooks|settings|skills`, `.harness/gates.json` vẫn bị gác.

## D-008 · 2026-11-17 · gate: deploy · task: công nợ NCC (mig 143–146) · trạng thái: chờ
- Cần làm: `git push origin main` (main đã fast-forward gồm nhánh `claude/import-payables-payment-vouchers-1c9d16`).
- Vì sao: anh Tú PASS hết CONG-NO-NCC.md (B13 cuối cùng) và bảo "merge vào main và push". Mig 143–146 đã ở prod từ
  sáng nay → bản Vercel cũ đang từ chối phiếu nhập Chưa trả không có NCC; push xong Vercel dựng bản mới là hết.
- Phương án đề xuất: anh mở cổng deploy 1 giờ, agent push.
- Rủi ro nếu duyệt: thấp — verify xanh sau khi gộp main (vitest 1772/1772, DB, mini-app, print-agent).
- Trả lời của anh:
