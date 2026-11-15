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
