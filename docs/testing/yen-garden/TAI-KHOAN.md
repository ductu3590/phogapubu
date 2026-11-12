# Yên Garden — Tài khoản vận hành + bắt đổi mật khẩu lần đầu

Ngày làm: 2026-11-12. Nhánh `claude/yg-accounts-force-password-8d711a`. Không có migration.

## Đã có trên prod

Năm tài khoản của quán **Yên Garden** (`e1847559-f1c3-4778-acfd-2f1ec6347af7`), mật khẩu ban đầu là mật khẩu anh Tú
đã đưa (không ghi vào repo), cả năm đều mang cờ `app_metadata.must_change_password = true`:

| Email | Vai | Trang sau khi đổi mật khẩu |
|---|---|---|
| `yg-admin@mevo.vn` | Chủ quán | `/admin` |
| `yg-quanly@mevo.vn` | Quản lý | `/admin/pos` |
| `yg-pos@mevo.vn` | Thu ngân | `/admin/pos` |
| `yg-nv1@mevo.vn` | Nhân viên phục vụ ("Nhân viên 1") | `/staff/order` |
| `yg-nv2@mevo.vn` | Nhân viên phục vụ ("Nhân viên 2") | `/staff/order` |

⚠️ Cờ chỉ có tác dụng khi code nhánh này đã chạy. Trên `mevo.vn` (bản Vercel hiện tại) năm tài khoản vẫn đăng nhập
bình thường bằng mật khẩu ban đầu, không bị hỏi đổi, cho tới khi nhánh được merge và deploy.

## Cách chạy thử trước khi merge

```bash
cd admin-web && npm run dev
```

Mở `http://localhost:3000/login` (cổng có thể khác nếu 3000 bận). Dùng cửa sổ ẩn danh, **mỗi lần một tài khoản**
(cookie đăng nhập dùng chung theo địa chỉ).

## Cơ chế (để đối chiếu khi test)

- Cờ nằm trong `app_metadata`. Người dùng không tự xoá được, chỉ máy chủ (service role) bật hoặc xoá.
- Còn cờ thì mọi trang `/admin`, `/staff`, `/mevo`, `/print/*` và `/login` đều chuyển sang `/change-password`. Chặn ở
  hai lớp: proxy (tải trang) và guard dùng chung `requireOperator*` (điều hướng mềm + server action).
- Đổi xong thì máy chủ xoá cờ rồi đưa về trang theo vai.
- Cờ được bật lại khi: superadmin đặt lại mật khẩu ở `/mevo/accounts`; chủ quán đặt lại mật khẩu nhân viên ở
  **Nhân viên**; tạo tài khoản mới có mật khẩu tạm (thêm nhân viên, gán chủ quán ở wizard tạo quán).

---

## Test 1. Đăng nhập lần đầu theo từng vai

Làm với **yg-admin** và **yg-nv1** (ít nhất), tốt nhất cả năm.

1. Đăng nhập bằng email + mật khẩu ban đầu.
2. Phải sang màn **Đổi mật khẩu** (ổ khoá, hiện đúng email), **không** vào thẳng POS / Đặt hộ.
3. Gõ mật khẩu mới ở hai ô, bấm **Lưu mật khẩu mới**.
4. Phải vào đúng trang theo bảng trên (chủ quán `/admin`, quản lý + thu ngân `/admin/pos`, nhân viên `/staff/order`).
5. Đăng xuất, đăng nhập lại bằng **mật khẩu mới**: vào thẳng trang theo vai, không bị hỏi đổi nữa.
6. Đăng nhập bằng **mật khẩu ban đầu**: báo "Email hoặc mật khẩu không đúng".

| Tài khoản | Bước 2 | Bước 4 | Bước 5 | Bước 6 |
|---|---|---|---|---|
| yg-admin | | | | |
| yg-quanly | | | | |
| yg-pos | | | | |
| yg-nv1 | | | | |
| yg-nv2 | | | | |

## Test 2. Màn Đổi mật khẩu kiểm lỗi

Đăng nhập một tài khoản còn cờ, ở màn Đổi mật khẩu thử lần lượt:

1. Hai ô khác nhau → "Hai ô mật khẩu không khớp nhau".
2. Mật khẩu 7 ký tự → trình duyệt hoặc máy chủ chặn ("Mật khẩu phải từ 8 ký tự trở lên").
3. Gõ lại **đúng mật khẩu ban đầu** ở cả hai ô → "Mật khẩu mới phải khác mật khẩu đang dùng"; vẫn ở màn Đổi mật khẩu.
4. Bấm **Đăng xuất** dưới form → về màn đăng nhập.

## Test 3. Không lách được khi chưa đổi

Đăng nhập một tài khoản còn cờ (đừng đổi), rồi:

1. Gõ thẳng lên thanh địa chỉ lần lượt: `/admin`, `/admin/pos`, `/admin/staff`, `/staff/order`, `/mevo`,
   `/print/bill`, `/login`. Lần nào cũng phải quay về `/change-password`.
2. Bấm Back của trình duyệt: không vào được trang vận hành nào.
3. (Claude đã thử lúc làm, ghi để biết) gọi thẳng server action `listOpenServiceRequests` / `listOpenTableSessions`
   kèm phiên còn cờ → máy chủ trả lỗi "Anh/chị cần đổi mật khẩu trước khi tiếp tục…". Không cần anh làm lại.

## Test 4. Tài khoản cũ không bị ảnh hưởng

1. Đăng nhập tài khoản chủ quán / thu ngân **Bảo Lương** đang dùng: vào thẳng trang thường, không bị hỏi đổi.
2. Đăng nhập tài khoản superadmin: vào thẳng `/mevo`.

## Test 5. Đặt lại mật khẩu thì phải đổi lại

1. Superadmin vào `/mevo/accounts`, đặt lại mật khẩu cho **yg-pos** (sau khi yg-pos đã đổi ở Test 1).
2. Đăng nhập yg-pos bằng mật khẩu vừa đặt → phải sang màn Đổi mật khẩu.
3. Chủ quán **yg-admin** vào **Nhân viên**, đặt lại mật khẩu cho **yg-nv2** → yg-nv2 đăng nhập bằng mật khẩu đó cũng
   phải sang màn Đổi mật khẩu.
4. Chủ quán thêm một nhân viên mới (email thử) → đăng nhập bằng mật khẩu tạm hiện ra → phải sang màn Đổi mật khẩu.
   Thử xong thì tắt tài khoản thử ở trang Nhân viên.

## Sau khi test

Những tài khoản anh đã đổi mật khẩu khi test: muốn giao cho quán ở trạng thái "chưa đổi lần nào" thì đặt lại mật
khẩu ở `/mevo/accounts` (cờ tự bật lại).

## Kiểm bằng SQL (tuỳ chọn)

```sql
select u.email, o.role, o.is_active, u.raw_app_meta_data->>'must_change_password' as phai_doi
from auth.users u join mevo_operators o on o.user_id = u.id
where o.store_id = 'e1847559-f1c3-4778-acfd-2f1ec6347af7'
order by o.role, u.email;
```
