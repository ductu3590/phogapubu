# Store Owner Account Settings Design

## Muc tieu

Them chuc nang cap nhat thong tin tai khoan co ban cho chu cua hang dang su dung he thong MEVO trong khu vuc `/admin`.

Pham vi MVP gom:
- Cap nhat ho ten / ten hien thi.
- Cap nhat so dien thoai ca nhan.
- Doi mat khau dang nhap.
- Hien thi email dang nhap o dang chi doc.

Khong lam trong MVP:
- Doi email dang nhap.
- Tao bang profile rieng.
- Mo rong cho `mevo_superadmin` tai `/mevo`.

## Kien truc

Them trang rieng `/admin/account` thay vi gop vao `/admin/settings`.

Ly do:
- `/admin/settings` dang la cai dat quan: logo, dia chi, Zalo OA, thanh toan.
- `/admin/account` la thong tin cua nguoi dang nhap: ten, so dien thoai, mat khau.
- Tach rieng giup tranh lan du lieu "quan" voi "tai khoan".

Trang moi van nam duoi `AdminLayout`, vi vay chi `store_owner` hop le moi vao duoc. Neu `mevo_superadmin` vao `/admin/account`, layout hien tai se redirect ve `/mevo`.

## Du lieu

Thong tin ca nhan luu trong `auth.users.user_metadata`:

```json
{
  "full_name": "Nguyen Van A",
  "phone": "0901234567"
}
```

Khong them migration moi vi Supabase Auth da co san metadata cho nhu cau profile co ban.

Email lay tu `auth.users.email` va chi hien thi, khong cho sua trong MVP de tranh rui ro lien quan xac thuc va login.

## Luong UI

Sidebar `/admin` them muc `Tai khoan`.

Trang `/admin/account` gom 2 khoi:

1. Thong tin ca nhan
   - Email dang nhap: readonly.
   - Ho ten: input text.
   - So dien thoai: input tel.
   - Nut `Luu thong tin`.

2. Doi mat khau
   - Mat khau moi.
   - Nhap lai mat khau moi.
   - Nut `Doi mat khau`.

Tat ca text UI hien thi bang tieng Viet.

## Server Actions

Them file action rieng cho tai khoan, vi logic nay thuoc auth user chu khong thuoc store:

- `updateAccountProfile(formData)`
  - Yeu cau `requireStoreOwnerStoreId()` de dam bao chi chu quan thao tac.
  - Lay user hien tai qua Supabase server client.
  - Validate `full_name` toi da 100 ky tu.
  - Validate `phone` toi da 30 ky tu.
  - Goi `supabase.auth.updateUser({ data: { full_name, phone } })`.
  - Revalidate `/admin/account`.

- `updateAccountPassword(formData)`
  - Yeu cau `requireStoreOwnerStoreId()`.
  - Validate mat khau moi toi thieu 8 ky tu.
  - Validate nhap lai mat khau khop.
  - Goi `supabase.auth.updateUser({ password })`.
  - Revalidate `/admin/account`.

## Bao mat

- Khong nhan `user_id` tu client.
- Khong cho store owner sua tai khoan nguoi khac.
- Khong luu mat khau vao database ung dung.
- Khong them API route public.
- Server action bat buoc xac thuc role `store_owner`.

## Kiem thu

Can kiem tra:
- Store owner vao duoc `/admin/account`.
- Email hien thi dung va khong sua duoc.
- Luu ho ten / so dien thoai xong reload van con du lieu.
- Doi mat khau loi neu duoi 8 ky tu.
- Doi mat khau loi neu nhap lai khong khop.
- Doi mat khau thanh cong voi mat khau hop le.
- Sidebar co muc `Tai khoan`.
- `mevo_superadmin` khong vao duoc `/admin/account`, bi dua ve `/mevo`.
