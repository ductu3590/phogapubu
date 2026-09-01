# Module quản lý tài khoản (`/mevo/accounts`) — thiết kế

**Ngày:** 2026-09-01
**Trạng thái:** đã code, chờ test theo `TESTING.md`
**Phạm vi:** admin-web, khu `/mevo` (superadmin `admin@mevo.vn`). Không đụng mini-app, không migration.

---

## 1. Vấn đề

Chủ quán quên mật khẩu thì không có đường nào cấp lại. Toàn hệ thống chỉ có một chỗ dính tới
tài khoản chủ quán: form "Gán / tạo tài khoản" trong trang chi tiết quán — và nó chỉ sinh mật
khẩu tạm **lúc tạo mới**. Email đã tồn tại thì nó bỏ qua, giữ nguyên mật khẩu cũ.

Thêm nữa, không có chỗ nào nhìn thấy toàn bộ tài khoản đang có: trang chi tiết quán chỉ hiện
`"2 tài khoản đã gán"` — một con số, không có email.

## 2. Quyết định phạm vi

| Quyết định | Lý do |
|---|---|
| **KHÔNG có chức năng xoá tài khoản** | Anh Tú chốt bỏ hẳn. Không có nút xoá nghĩa là không có thao tác nào trong module này hỏng dữ liệu vĩnh viễn — mọi thứ đều sửa lại được |
| **KHÔNG có tạm khoá/mở khoá ở đây** | Cột `is_active` chỉ *hiển thị*. Chủ quán tự bật/tắt nhân viên ở `/admin/staff` như cũ |
| **KHÔNG đổi email đăng nhập** | Gõ sai email lần nữa là mất luôn đường vào; gán lại tài khoản khác ở trang chi tiết quán đã đủ |
| Hiện **mọi** role (chủ quán + nhân viên + superadmin), nhóm theo quán | Chủ quán gọi "nhân viên tôi không đăng nhập được" thì anh Tú xử ngay, không phải hướng dẫn họ tự vào `/admin/staff` — mà trang đó hiện cũng chưa có nút đặt lại mật khẩu |
| Superadmin **tự gõ** mật khẩu mới, xác nhận 2 ô, **không hỏi mật khẩu cũ** | Anh Tú đọc mật khẩu qua điện thoại cho chủ quán lớn tuổi được; chuỗi ngẫu nhiên đọc qua điện thoại rất dễ sai |

## 3. Kiến trúc

Không có bảng mới, không có migration. `mevo_operators` đã có sẵn `role` + `is_active`;
email và lần đăng nhập cuối lấy từ Supabase Auth.

```
/mevo/accounts (Server Component)
      │  listOperatorAccounts()
      ▼
lib/actions/mevo-accounts.ts  ── requireSuperadmin() ──▶ lib/auth/operator.ts
      │                        ── listAllAuthUsers() ──▶ lib/supabase/auth-users.ts
      ▼
accounts-client.tsx (Client) ── resetOperatorPassword(userId, formData) ──▶ cùng file action
```

### 3.1 `lib/supabase/auth-users.ts` (mới, dùng chung)

`listAllAuthUsers(admin)` và `findAuthUserByEmail(admin, email)`.

Sửa luôn một **lỗi ngầm sẵn có**: `assignStoreOwner` và `listStoreStaff` gọi
`admin.auth.admin.listUsers()` trần, mà API này phân trang **mặc định 50 user/trang**. Qua mốc
50 tài khoản là im lặng sai — `listStoreStaff` hiện "(không rõ email)", còn `assignStoreOwner`
tưởng email chưa tồn tại rồi tạo tài khoản trùng. Cả ba nơi giờ đi qua helper lặp hết trang.

### 3.2 `lib/auth/operator.ts` — thêm `requireSuperadmin()`

`requireSuperadmin` trước đây là hàm private lặp trong `mevo-stores.ts`. Nâng lên thành guard
dùng chung của cả khu `/mevo`, có test riêng.

### 3.3 `lib/actions/mevo-accounts.ts` (mới)

**`listOperatorAccounts()`** → nhóm theo quán (quán chưa có tài khoản vẫn hiện nhóm rỗng — đó là
tín hiệu onboarding còn dở), nhóm "MEVO (nội bộ)" xếp cuối. Trong nhóm: chủ quán trước, nhân
viên sau, rồi theo email. Giờ đăng nhập cuối **format ngay ở server** theo `Asia/Ho_Chi_Minh` —
để client tự `toLocaleString` thì chuỗi lúc SSR và lúc hydrate lệch nhau.

**`resetOperatorPassword(userId, formData)`** — ba lớp chặn:

1. Người gọi phải là `mevo_superadmin` (không tin client);
2. `userId` đích **bắt buộc nằm trong `mevo_operators`** — chặn kiểu gửi thẳng userId lạ vào
   action để chiếm một tài khoản Auth bất kỳ. Đây là ca nguy hiểm nhất, có test riêng;
3. Hai ô phải khớp, tối thiểu 8 ký tự, không có dấu cách đầu/cuối (lỗi copy-paste kinh điển —
   chủ quán gõ lại sẽ không vào được).

Mật khẩu không bao giờ được log hay trả ngược về client.

### 3.4 Giao diện

`/mevo/accounts` — thêm mục "👤 Tài khoản" vào sidebar `/mevo`. Mỗi quán một khối; mỗi dòng:
email · nhãn vai trò · "Đã khoá" (nếu có) · lần đăng nhập cuối · nút **Đổi mật khẩu** bung form
2 ô ngay tại dòng. Mỗi lúc chỉ mở form của MỘT tài khoản, tránh gõ mật khẩu vào nhầm dòng.

Tài khoản của chính anh Tú nằm ở nhóm "MEVO (nội bộ)", có nhãn *"tài khoản của anh"*. Đổi được
mật khẩu chính mình tại đây vì **không có chỗ nào khác** cho superadmin làm việc đó; đổi qua
admin API không đá phiên đăng nhập hiện tại ra.

Tiện thể: mục "Tài khoản chủ quán" ở trang chi tiết quán đổi từ `"2 tài khoản đã gán"` thành
danh sách email thật + link sang `/mevo/accounts`.

## 4. Test

- **Tự động:** 19 test mới (`auth-users.test.ts` 5, `operator.test.ts` 4, `mevo-accounts.test.ts` 10).
  `vitest.config.ts` mới khai báo alias `@/` — trước đây không có config nên mọi test buộc phải
  `vi.mock` tất cả import `@/` của module đang test, kể cả helper thuần tuý.
- **Tay:** `TESTING.md`, mục "2026-09-01 — Module quản lý tài khoản".

## 5. Cố ý không làm (YAGNI)

Xoá tài khoản; tạm khoá từ `/mevo`; đổi email; gửi email đặt lại mật khẩu tự động (quán liên lạc
qua Zalo, không dùng email); log lịch sử ai đổi mật khẩu cho ai (một mình anh Tú vận hành).
