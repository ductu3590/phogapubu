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

## D-008 · 2026-11-17 · gate: deploy · task: công nợ NCC (mig 143–146) · trạng thái: xong
- Cần làm: `git push origin main` (main đã fast-forward gồm nhánh `claude/import-payables-payment-vouchers-1c9d16`).
- Vì sao: anh Tú PASS hết CONG-NO-NCC.md (B13 cuối cùng) và bảo "merge vào main và push". Mig 143–146 đã ở prod từ
  sáng nay → bản Vercel cũ đang từ chối phiếu nhập Chưa trả không có NCC; push xong Vercel dựng bản mới là hết.
- Phương án đề xuất: anh mở cổng deploy 1 giờ, agent push.
- Rủi ro nếu duyệt: thấp — verify xanh sau khi gộp main (vitest 1772/1772, DB, mini-app, print-agent).
- Trả lời của anh: Đã mở cổng
- **Đã áp dụng 2026-11-17:** push main c1e63a9..f94ac99.

## D-009 · 2026-11-17 · gate: test · task: POS Sơ đồ (e2e) · trạng thái: đã chốt — để nguyên
- Cần làm: thêm `test.skip(...)` có điều kiện vào bài e2e "bàn có đặt xa (now+3h)" ở `admin-web/e2e/pos-so-do.spec.ts`,
  bỏ qua khi now+3h đã sang ngày mai giờ VN (chạy sau ~21:00).
- Vì sao: dòng nhắc "Bàn này có khách đặt lúc HH:mm" chỉ tính đặt bàn muộn hơn TRONG NGÀY (`buildMoveTargets`), nên chạy
  e2e sau 21:00 bài này đỏ giả (2026-11-17 21:05: đặt 00:05 hôm sau → không có dòng nhắc). 33/34 còn lại xanh; trước
  21:00 cùng code 34/34.
- Phương án đề xuất (khuyến nghị): skip có điều kiện kèm lý do "chạy lại trước 21:00". Anh mở cổng `test` 1 giờ rồi nói
  "áp dụng D-009".
- Phương án khác: (a) để nguyên, ai chạy sau 21:00 tự biết bỏ qua; (b) nếu quán mở qua nửa đêm và muốn nhắc cả đặt bàn
  sau 0h → đổi hành vi app (nhắc theo ngày kinh doanh `business_date_of`), là việc riêng.
- Rủi ro nếu duyệt: thấp — chỉ bỏ qua đúng khung giờ không kiểm được.
- Trả lời của anh: Chỉ cần hiện cảnh báo 3h là được. Ai làm sau 9h tự biết bỏ qua, chọn bàn khác
- **Đã chốt 2026-11-17:** KHÔNG thêm skip, KHÔNG đổi hành vi app (nhắc vẫn chỉ tính đặt bàn trong ngày). Chạy e2e sau
  21:00 thấy đúng bài này đỏ thì bỏ qua; đã ghi chú ngay trên bài trong `admin-web/e2e/pos-so-do.spec.ts`.

## D-010 · 2026-11-17 · gate: secrets · task: sửa chữ màn nhân viên (sau test prod 4 vai) · trạng thái: đã chốt — bỏ qua xem local
- Cần làm: chép `admin-web/.env.local` sang worktree `mevo-report-professional-17b25f/admin-web/` để chạy dev server xem
  màn `/staff/order` (câu báo gửi đơn) và `/staff/orders` (nhãn "Thu ngân ghi", mã đơn) trước khi merge.
- Vì sao: worktree không có `.env.local`; cổng secrets chặn cả lệnh kiểm file có tồn tại.
- Phương án đề xuất (khuyến nghị): anh mở cổng `secrets` 1 giờ như D-005, agent chép file + xem bằng trình duyệt.
  Phương án khác: bỏ xem local, merge rồi kiểm luôn trên mevo.vn sau khi Vercel deploy (đổi chỉ là chữ, đã có unit test).
- Rủi ro nếu duyệt: thấp — chép sang thư mục gitignored trên máy anh, không in nội dung.
- Trả lời của anh: "Bỏ qua, commit" (chat 2026-11-18) → không mở cổng; kiểm bằng S1–S5 sau khi bản này chạy.

## D-011 · 2026-11-18 · gate: deploy · task: sửa chữ màn nhân viên (d81a18e) · trạng thái: xong
- Cần làm: đẩy `main` lên `origin` (main ở máy đã fast-forward tới d81a18e, gồm nhánh
  `claude/mevo-production-test-guide-d0ce6c`) để Vercel dựng bản mới.
- Vì sao: anh Tú bảo "Merge + push" để test S1–S5 ở `docs/testing/staff-chu/STAFF-CHU.md` trên mevo.vn.
- Phương án đề xuất: anh mở cổng deploy 1 giờ, agent đẩy main.
- Rủi ro nếu duyệt: thấp — chỉ đổi chữ màn `/staff`, không migration; vitest admin-web 1846/1846 xanh trên cùng cây code.
- Trả lời của anh: Đã mở cổng
- **Đã áp dụng 2026-11-18:** đẩy main bf5f629..cef7308.

## D-012 · 2026-11-18 · gate: deploy · task: Mini App — màn Xác nhận đơn gọn (5689078) · trạng thái: chờ
- Cần làm: đẩy `main` lên `origin` (main ở máy đã fast-forward gồm nhánh `claude/yen-garden-mini-app-aa37d2`, commit
  5689078: bỏ khối "Bàn … — Món sẽ được gửi cho bàn này" và dòng "Tạm tính món" trùng Tổng cộng ở màn Xác nhận đơn).
- Vì sao: anh Tú bảo "Gộp và push" (chat 2026-11-18).
- Phương án đề xuất: anh mở cổng deploy 1 giờ, agent đẩy main.
- Rủi ro nếu duyệt: thấp — chỉ đổi giao diện Mini App, không migration, không đụng admin-web (Vercel dựng lại nhưng
  không đổi gì). Mini App KHÔNG tự lên Zalo, cần `zmp deploy` riêng từ worktree quán. tsc sạch, vitest mini-app 265/265.
- Trả lời của anh:

## D-013 · 2026-11-18 · gate: harness · task: mất mạng Đợt 1, Task 4 (kiểm toàn bộ) · trạng thái: xong
- Cần làm: chạy `python scripts/verify.py` (bước 5 của task) để xác nhận docs không làm tăng nợ cũ.
- Vì sao: hook harness chặn lệnh này (thông báo "Đụng vào file harness được bảo vệ (chỉ đọc)"); agent không đổi lệnh để lách.
- Phương án đề xuất: anh mở cổng `harness` 1 giờ rồi agent chạy lại; hoặc anh tự chạy verify và báo kết quả.
- Rủi ro nếu duyệt: thấp — chỉ đọc/kiểm, task này chỉ đổi tài liệu.
- Ghi chú của phiên điều phối (2026-11-18, chưa phải trả lời của anh): lệnh bị chặn là bản có thêm tiền tố giới hạn thời
  gian. Phiên điều phối sau đó chạy đúng lệnh chuẩn ghi trong `docs/HARNESS.md`, cổng cho qua, kết quả XANH trên
  `fa5de71`. Việc chạy này diễn ra khi mục này chưa có trả lời của anh; anh xác nhận thì mới đóng mục.
- Trả lời của anh: mở cổng harness 1 giờ, bảo làm D-013 (chat 2026-11-19).
- **Xong 2026-11-19:** chạy lại kiểm toàn bộ theo lệnh chuẩn trên main `642da5b` (đã gồm mất mạng Đợt 1 + giao diện HIG
  Yên Garden): XANH, 10-admin-web "nợ cũ 1/1, không tăng".

## D-014 · 2026-11-18 · gate: secrets · task: mất mạng Đợt 1 (nhìn tận mắt trên trình duyệt + mở sẵn POS cho anh test) · trạng thái: xong
- Cần làm: worktree `.claude/worktrees/mat-mang-tam-thoi-311b27` chưa có tệp cấu hình môi trường của admin-web, nên không
  chạy được màn POS ở đây để xem hai băng mất mạng và để anh test theo `docs/testing/mat-mang/DOT-1.md`.
- Vì sao: tệp đó thuộc vùng bí mật; agent không đọc, không chép khi anh chưa cho phép.
- Phương án đề xuất: anh mở cổng `secrets` (1 giờ) để agent chép tệp từ repo gốc sang worktree rồi chạy admin-web
  (khuyến nghị)  /  Phương án khác: anh tự chép tệp đó; hoặc ghép nhánh này về repo gốc rồi test ở đó.
- Rủi ro nếu duyệt: thấp — tệp chỉ nằm trong worktree trên máy anh, không vào git.
- Trả lời của anh: Đã mở cổng
- **Đã áp dụng 2026-11-18:** chép tệp cấu hình admin-web sang worktree, xem băng mất mạng trên POS Bảo Lương; anh test DOT-1 PASS.
- **Đóng 2026-11-19** theo lời anh (chat): không còn việc gì; tệp cấu hình chỉ nằm trong worktree, không vào git.

## D-015 · 2026-11-18 · gate: harness · task: thử skill Astryx cho Mini App Yên Garden (nhánh claude/yg-astryx-redesign-67a515) · trạng thái: chờ
- Cần làm: chép 1 file `SKILL.md` của Meta (repo `meta/astryx`, `plugins/astryx/skills/astryx/SKILL.md`, MIT, chỉ là chữ
  hướng dẫn, không có script) vào `.claude/skills/astryx/SKILL.md` trên nhánh thử này.
- Vì sao: anh Tú bảo cài skill Astryx, chọn "Riêng repo, CLI tạm" (chat 2026-11-18); `.claude/skills/**` là đường dẫn
  harness được bảo vệ nên hook chặn tạo thư mục.
- Phương án đề xuất (khuyến nghị): anh mở cổng `harness` 1 giờ (lệnh duyệt như mẫu đầu file) rồi nói "áp dụng D-015",
  agent chép file. Phương án khác: không cài vào repo — agent vẫn làm theo nội dung skill (đã đọc) và chạy CLI `astryx`
  bằng npx ở thư mục nháp ngoài repo; chỉ thiếu việc skill tự hiện trong danh sách skill của các phiên sau.
- Rủi ro nếu duyệt: thấp — 1 file chữ, chỉ nằm trên nhánh thử, không đổi code/cấu hình chạy.
- Trả lời của anh:

## D-016 · 2026-11-18 · gate: secrets · task: thử skill Astryx cho Mini App Yên Garden · trạng thái: bỏ — anh chọn "Giữ bản hiện tại" (chat 2026-11-18), không dựng vào app nên không cần chạy Mini App
- Cần làm: chép `mini-app-instances/yen-garden/mini-app/.env` sang `mini-app/.env` của worktree
  `yg-astryx-redesign-67a515` (gitignored) để `npm run dev` Mini App theme garden, không in nội dung.
- Vì sao: brief của phiên giao việc bảo chép để chụp ảnh trước/sau (Thực đơn, chi tiết món, Xác nhận đơn, Đơn gọi, Đặt bàn,
  Tài khoản + 1 ảnh Bảo Lương) và mở sẵn link cho anh xem; hook secrets chặn lệnh chép.
- Phương án đề xuất (khuyến nghị): chỉ cần khi anh duyệt dựng hướng Astryx vào app — lúc đó anh mở cổng `secrets` 1 giờ
  (lệnh duyệt như mẫu đầu file), agent chép file. Phương án khác: anh tự chép file trong Explorer.
- Rủi ro nếu duyệt: thấp — chép giữa hai thư mục gitignored trên máy anh, không in nội dung.
- Trả lời của anh:
- **Đã xong 2026-11-19:** anh tự chép `.env`; giao diện HIG PASS và đã gộp main (f0230a8).

## D-017 · 2026-11-19 · gate: data · task: gộp giao diện HIG Yên Garden vào main (kiểm toàn bộ trên repo gốc) · trạng thái: chờ
- Cần làm: xoá thư mục sinh tự động `admin-web/.next/types` ở repo gốc `D:\Code\mevo` (gitignored), rồi kiểm toàn bộ lại.
- Vì sao: sau khi gộp, bước kiểm toàn bộ ở repo gốc đỏ mục 10-admin-web vì `.next/types/validator.ts` của lần build cũ còn
  trỏ tới trang đã xoá (`app/mevo/ui-kit`, `app/staff/tables/print`). Lần gộp không đụng file admin-web nào (mini-app
  274/274, typecheck, DB, print-agent đều xanh). Hook chặn xoá đệ quy ngoài vùng an toàn.
  (Đã cài bổ sung `@playwright/test` — gói có sẵn trong package.json nhưng chưa cài ở repo gốc.)
- Phương án đề xuất (khuyến nghị): anh mở cổng `data` 1 giờ (lệnh duyệt như mẫu đầu file), agent xoá `.next/types` rồi
  kiểm lại. Phương án khác: anh tự xoá thư mục đó trong Explorer, hoặc chạy `npm run build` ở admin-web (Next sinh lại).
- Rủi ro nếu duyệt: rất thấp — chỉ là tệp kiểu do Next sinh, `next dev` / `next build` tự tạo lại.
- Ghi chú 2026-11-19 (sửa POS không báo khách xin đổi lịch): lại vướng đúng lỗi này — vitest admin-web 1883/1883, tsc
  ngoài `.next/` sạch, mini-app / DB / print-agent xanh; chỉ 10-admin-web đỏ vì `.next/types`.
- Trả lời của anh:

## D-018 · 2026-11-19 · gate: deploy · task: giao diện HIG Yên Garden + chữ đặt món trước · trạng thái: chờ
- Cần làm: đẩy `main` ở máy lên `origin` (hơn origin/main 18 commit, tới commit ghi mục này). Gồm: giao diện HIG theme
  garden (PASS GIAO-DIEN-HIG.md), chữ "Lưu ý quan trọng" + nút "Xác nhận" khi đặt món trước (PASS
  LUU-Y-DAT-MON-TRUOC.md), tài liệu thiết kế, đóng D-013/D-014, D-017.
- Vì sao: anh Tú bảo "Push main" (chat 2026-11-19); hook deploy chặn push lên nhánh chính.
- Phương án đề xuất (khuyến nghị): anh mở cổng `deploy` 1 giờ (lệnh duyệt như mẫu đầu file), agent đẩy main.
  Phương án khác: anh tự chạy `git push origin main` ở `D:\Code\mevo`.
- Rủi ro nếu duyệt: thấp — chỉ Mini App + tài liệu, không migration, không đổi file admin-web (Vercel dựng lại không đổi
  gì). Mini App không tự lên Zalo, cần `zmp deploy` riêng (worktree quán đã gộp sẵn). verify trên worktree XANH,
  vitest mini-app 274/274.
- Ghi chú: commit của D-012 (5689078) đã có trên origin/main từ trước — mục D-012 có thể đóng.
- Trả lời của anh:
