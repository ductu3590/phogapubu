# MEVO — Hướng dẫn Deploy Sprint 5

## PHẦN 1 — Deploy Admin Web lên Vercel

### Bước 1: Push code lên GitHub

Mở PowerShell trong thư mục `D:\Code\mevo`, chạy từng lệnh:

```powershell
# Tạo repo trên GitHub trước (tại github.com/new), đặt tên: mevo
# Sau đó chạy:
git remote add origin https://github.com/<USERNAME>/mevo.git
git branch -M main
git push -u origin main
```

> Thay `<USERNAME>` bằng username GitHub của anh.

---

### Bước 2: Import vào Vercel

1. Vào https://vercel.com → **Add New Project**
2. Import repo `mevo` từ GitHub
3. **QUAN TRỌNG** — Trong màn hình cấu hình:
   - **Root Directory**: chọn `admin-web` (click Browse → chọn thư mục admin-web)
   - **Framework Preset**: Next.js (tự detect)
4. Mở tab **Environment Variables** → thêm lần lượt:

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://dlkgdpexjtyynbotkwka.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | *(lấy từ admin-web/.env.local)* |
| `SUPABASE_SERVICE_ROLE_KEY` | *(lấy từ admin-web/.env.local)* |
| `NEXT_PUBLIC_APP_URL` | *(URL Vercel của anh, ví dụ: https://mevo-admin.vercel.app)* |
| `NEXT_PUBLIC_ZALO_APP_ID` | `4311670425529575295` |

5. Bấm **Deploy**
6. Chờ ~2 phút → Vercel tạo URL production

---

### Bước 3: Cập nhật APP_URL

Sau khi deploy xong, Vercel sẽ cấp URL dạng `https://mevo-xxx.vercel.app`.

Vào Vercel → Settings → Environment Variables → cập nhật `NEXT_PUBLIC_APP_URL` = URL đó → Redeploy.

---

### Bước 4: Test Admin Web production

Theo TESTING.md Sprint 5:
- [ ] Vào URL Vercel → đăng nhập được
- [ ] Tất cả tính năng hoạt động (menu, bàn, QR, đơn hàng)
- [ ] Không có lỗi CORS hay 500 trên console (F12)

---

## PHẦN 2 — Deploy Mini App lên Zalo

### Bước 1: Đăng nhập Zalo Developer

```powershell
cd D:\Code\mevo\mini-app
zmp login
```

Browser sẽ mở → đăng nhập tài khoản Zalo developer → xác nhận.

---

### Bước 2: Cập nhật env cho production

Mở file `mini-app/.env` → cập nhật:

```env
VITE_APP_ENV=production
```

(Phần còn lại giữ nguyên — URL và key Supabase đã đúng)

---

### Bước 3: Build và deploy

```powershell
cd D:\Code\mevo\mini-app

# Build production bundle
zmp build

# Deploy lên Zalo platform
zmp deploy
```

Zalo CLI sẽ hỏi confirm → nhập `y` → upload bundle.

Sau khi deploy xong, CLI sẽ in ra:
- URL Mini App production
- QR code để test

---

### Bước 4: Test Mini App production

1. **Quét QR production bằng tài khoản Zalo khác** (không phải tài khoản developer)
   - [ ] Mini App mở được
   - [ ] Menu load từ Supabase production
   - [ ] Thêm món vào giỏ được

2. **Test thanh toán ZaloPay** (production — tiền thật, dùng 1.000đ)
   - [ ] ZaloPay mở trong Zalo
   - [ ] Thanh toán thành công
   - [ ] Đơn xuất hiện trên Kitchen Display

---

## PHẦN 3 — Test thực tế tại Phở Gà Pubu

### Chuẩn bị
1. Vào Admin Web production → Quản lý bàn → Tải QR của **Bàn 1**
2. In file PNG ra (A5 hoặc A6) → dán lên bàn thật

### Test với người thật
1. Nhờ người em (chủ quán) dùng điện thoại cá nhân quét QR
2. **Không hướng dẫn gì** — xem họ có tự dùng được không
3. Ghi lại:
   - [ ] Stuck ở bước nào?
   - [ ] Từ ngữ nào trên UI khó hiểu?
   - [ ] Tốc độ load OK không?

### Tiêu chí PASS
> Người chưa biết gì tự order được trong 2 phút → MVP hoàn thành

---

## Troubleshooting nhanh

| Lỗi | Nguyên nhân | Fix |
|-----|------------|-----|
| Vercel: "NEXT_PUBLIC_ not found" | Thiếu env var | Thêm vào Vercel dashboard → Redeploy |
| Vercel: "Can't find module" | Root directory sai | Set lại Root Directory = `admin-web` |
| Mini App: màn hình trắng | Thiếu SUPABASE_URL | Check `.env` |
| ZaloPay: "Invalid app_id" | Chưa khai báo sandbox→production | Liên hệ ZaloPay merchant support |
| Kitchen Display CORS | URL Supabase sai | Check `NEXT_PUBLIC_SUPABASE_URL` trên Vercel |
