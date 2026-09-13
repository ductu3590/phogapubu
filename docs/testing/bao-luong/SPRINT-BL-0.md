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

## Task 4 — Form cấu hình quy trình vận hành

### Điều kiện chuẩn bị

- Checkout branch `feat/pos-cashier` tại hoặc sau commit `e4cb08b`.
- Đã có tài khoản owner của một quán và tài khoản `mevo_superadmin`.
- Migration `049_store_workflow_settings.sql` đã được áp vào môi trường đang test.

### Test tự động Codex đã chạy

Từ thư mục `admin-web`:

```powershell
npx tsc --noEmit
npm test -- --run app/admin/settings/workflow-settings-form.test.tsx lib/actions/store.test.ts lib/workflow-settings.test.ts
npm test
```

Kết quả tại thời điểm bàn giao: 21/21 test mục tiêu, 226/226 test Admin Web và TypeScript đều PASS.

### Test 4A — Owner tách hồ sơ và quy trình

1. Đăng nhập owner, mở `/admin/settings`.
2. Xác nhận có hai khu độc lập: **Thông tin hiển thị** và **Quy trình vận hành**.
3. Trong Quy trình vận hành, chọn preset **Bảo Lương**, xác nhận hộp thoại rồi lưu.
4. Refresh trang và xác nhận: trả sau, chỉ tiền mặt, tắt Mang về/Ship, bật Đặt bàn + Đặt món trước, và hai policy đều **cần POS xác nhận**.
5. Chọn preset **Pubu**, lưu và refresh: trả trước, Zalo Checkout, bật Mang về/Ship, tự xuống bếp.
6. Sửa riêng tên/logo/địa chỉ trong Thông tin hiển thị, lưu; xác nhận cấu hình workflow không bị đổi.

### Test 4B — Cockpit MEVO và quyền

1. Đăng nhập `mevo_superadmin`, mở trang chi tiết một quán trong `/mevo/stores/<storeId>`.
2. Xác nhận section **Quy trình vận hành** dùng đúng các field/preset như owner, không phải bản copy thiếu field.
3. Chọn/lưu một preset rồi refresh để xác nhận dữ liệu được giữ.
4. Đăng nhập owner của quán khác và thử truy cập/lưu: phải bị chặn, không được ghi sang quán đích.
5. Khi có phiên bàn hoặc đơn đang hoạt động, đổi payment timing/policy xuống bếp/timeout: phải nhận đúng lỗi nghiệp vụ, không được lưu nửa chừng.

### Mẫu báo lỗi

Gửi URL đang test, preset đã chọn, thao tác, ảnh hoặc toàn bộ lỗi, và commit đang test (`git rev-parse --short HEAD`).
