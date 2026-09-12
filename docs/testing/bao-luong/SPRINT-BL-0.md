# Sprint BL-0 — Kiểm thử theo task

Trạng thái Sprint: đang triển khai, chờ PASS từng task.

## Task 3 — Server action cấu hình quy trình

### Điều kiện chuẩn bị

- Checkout branch `feat/pos-cashier` tại hoặc sau commit Task 3.
- Dependencies của `admin-web` đã được cài.

### Test tự động Codex đã chạy

Từ thư mục `admin-web`:

```powershell
npm test -- --run lib/actions/workflow-settings.test.ts lib/workflow-settings.test.ts
npx tsc --noEmit
npm test
npx eslint lib/actions/workflow-settings.ts lib/actions/workflow-settings.test.ts --max-warnings=0
```

Kết quả tại thời điểm bàn giao Task 3:

- Action + workflow model: 15/15 test PASS.
- Toàn bộ Admin Web: 220/220 test PASS.
- TypeScript: PASS.
- ESLint hai file Task 3: PASS, không có warning.
- Full-project ESLint đã chạy nhưng đang FAIL do 15 lỗi và 4 warning có sẵn ngoài phạm vi Task 3
  tại các file menu, settings, kitchen, privacy, terms, spin và TTS.

### Test 3A — Role, store đích và nguồn audit

Chạy:

```powershell
cd D:\Code\mevo\admin-web
npm test -- --run lib/actions/workflow-settings.test.ts
```

Mong đợi:

- 8/8 test PASS.
- Owner luôn dùng `storeId` trong operator và nguồn audit `owner`.
- MEVO superadmin dùng store đích được truyền vào và nguồn audit `mevo`.
- Staff/owner sai khu vực bị chặn trước RPC.

### Test 3B — Payload form, Pubu và lỗi nghiệp vụ

Trong output Test 3A, xác nhận các case sau đều PASS:

- Snapshot RPC được đổi từ snake_case sang model camelCase cho form.
- Payload lưu có đủ key snake_case; preset Pubu vẫn là prepay, bật Mang về/Ship và tự xuống bếp.
- Preorder bị chuẩn hóa về tắt khi Đặt bàn tắt nhưng draft form không bị mutate.
- Lỗi nghiệp vụ RPC như `Còn phiên đang hoạt động` được trả nguyên văn.

### Mẫu báo lỗi

Gửi lại tên test fail, toàn bộ error output và commit đang test (`git rev-parse --short HEAD`).
