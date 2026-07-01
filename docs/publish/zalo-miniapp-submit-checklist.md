# Checklist Submit Publish — Phở Gà PUBU Mini App

> App ID: **383290948854768685**  
> Tạo ngày: 2026-06-25 | Submit target: sau khi Zalo duyệt app  
> Cổng quản lý: https://developers.zalo.me/miniapp

---

## BƯỚC 0 — Deploy code lên app mới (làm TRƯỚC khi vào portal)

```bash
cd mini-app
zmp login          # đăng nhập tài khoản nhà phát triển MEVO
zmp deploy         # chọn app "Phở Gà PUBU" (383290948854768685) khi được hỏi
```

Ghi lại **số version** Zalo cấp sau khi deploy xong.

Sau đó vào Vercel Dashboard (admin-web):
- `NEXT_PUBLIC_ZALO_APP_ID` = `383290948854768685` (đã đúng)
- `NEXT_PUBLIC_ZALO_ENV` = `TESTING`
- `NEXT_PUBLIC_ZALO_VERSION` = `<version vừa deploy>`

---

## BƯỚC 1 — Chuẩn bị assets (cần làm trước khi vào form)

### 1.1 Logo app
- [ ] **Kích thước:** 240×240 px, định dạng PNG
- [ ] **Nền:** trắng hoặc màu thương hiệu — **KHÔNG** trong suốt
- [ ] **Không chứa:** số điện thoại, mã QR, chữ "App" hay "Mini App"
- [ ] **Tên file gợi ý:** `logo-pho-ga-pubu-240.png`
- [ ] Upload lên [Zalo Mini App Studio](https://miniapp.zalo.me)

### 1.2 Screenshots (tối thiểu 3 ảnh, tỷ lệ 9:16)
Chụp trên điện thoại thật trong Zalo, độ phân giải đề xuất 1080×1920 px:

| STT | Màn hình cần chụp | Hướng dẫn |
|-----|---|---|
| 1 | **Tab Menu** | Đang hiện danh sách món ăn phở, có ảnh món đẹp |
| 2 | **Tab Đã gọi** | Có ít nhất 1 đơn với trạng thái "Đang làm" hoặc "Đã xác nhận" |
| 3 | **Trang Checkout** | Đang hiện đơn hàng với tổng tiền, nút ZaloPay |
| 4 | **Tab Nhà hàng** | Hiện logo quán + địa chỉ + nút quan tâm OA |
| 5 | **OA Follow Sheet** | Bottom sheet "Nhận thông báo món ăn" (optional nhưng tốt) |

---

## BƯỚC 2 — Điền form trên Zalo Developer Console

Vào https://developers.zalo.me/miniapp → chọn app "Phở Gà PUBU" → **Duyệt ứng dụng**

### 2.1 Tên ứng dụng
```
Phở Gà PUBU
```
*(Không thay đổi — đã đặt khi tạo app)*

### 2.2 Mô tả ngắn (≤ 80 ký tự)
```
Đặt món phở và đồ uống trực tiếp từ Zalo — nhanh, không cần cài app
```

### 2.3 Mô tả đầy đủ
```
Phở Gà PUBU — Ứng dụng đặt món tại bàn dành cho khách đang có mặt tại nhà hàng Phở Gà PUBU, Lào Cai.

✅ Cách dùng đơn giản:
1. Quét mã QR trên bàn bằng Zalo
2. Chọn món từ thực đơn
3. Thanh toán qua ZaloPay (1 chạm) hoặc tiền mặt
4. Nhận thông báo Zalo khi món sắp được mang ra

🍜 Tính năng:
• Xem thực đơn đầy đủ với hình ảnh và giá
• Giỏ hàng và xác nhận đơn trước khi đặt
• Theo dõi trạng thái đơn realtime
• Xem lại các lần gọi món trong buổi ăn
• Gọi nhân viên ra thanh toán bằng 1 nút bấm
• Nhận thông báo Zalo khi món xong (cần quan tâm OA)

📍 Chỉ dành cho khách đang có mặt tại Phở Gà PUBU, Lào Cai.
Không hỗ trợ đặt hàng từ xa hay giao hàng tận nơi.
```

### 2.4 Danh mục
```
Ẩm thực (Food & Beverage)
```

### 2.5 URL Chính sách Bảo mật ⚠️ BẮT BUỘC
```
https://[URL_ADMIN_WEB_CỦA_ANH]/privacy
```
> **Cách tìm URL:** Vào Vercel Dashboard → project admin-web → copy Production URL  
> Ví dụ: `https://mevo-admin-abc123.vercel.app/privacy`  
> Trang `/privacy` đã được tạo sẵn trong code, chỉ cần deploy là dùng được.

### 2.6 URL Điều khoản Sử dụng (không bắt buộc nhưng nên có)
```
https://[URL_ADMIN_WEB_CỦA_ANH]/terms
```

### 2.7 Xác thực (Authentication)
Chọn **"Xác thực qua Zalo Official Account"** và nhập OA ID của Phở Gà PUBU.

> OA ID tìm ở: Zalo OA Dashboard → Cài đặt → ID OA  
> Hoặc xem trong Supabase: `SELECT zalo_oa_id FROM stores WHERE slug = 'pho-ga-pubu'`

---

## BƯỚC 3 — Kiểm tra kỹ thuật trước khi submit

### Performance (yêu cầu Zalo: LCP < 2.5s, PageLoad < 1.5s)
- [ ] Mở app trong Zalo → bấm vào từng tab, không có màn hình trắng
- [ ] Tab Menu load xong trong < 2 giây trên 4G
- [ ] Trang Checkout không bị crash khi thêm/xóa món

### Chức năng
- [ ] Quét QR bàn → menu hiện đúng quán Pubu
- [ ] Thêm món → checkout → ZaloPay sandbox thanh toán thành công
- [ ] Sau thanh toán → đơn xuất hiện ở tab "Đã gọi"
- [ ] Nút chuông "Gọi thanh toán" → nhân viên thấy alert trên màn hình bếp
- [ ] OA follow sheet hiện lần đầu → bấm "Quan tâm" → sheet đóng, không hiện lại

### Nội dung
- [ ] Không có link ngoài trong app (trừ `tel:` cho số điện thoại quán)
- [ ] Không có banner quảng cáo không liên quan
- [ ] Giá món hiện đúng, không hardcode

---

## BƯỚC 4 — Submit & chờ duyệt

1. Upload screenshots đã chuẩn bị
2. Điền đầy đủ thông tin theo Bước 2
3. Bấm **"Gửi duyệt"**
4. Thời gian xét duyệt: **3 ngày làm việc**
5. Zalo sẽ email kết quả về địa chỉ đăng ký nhà phát triển

---

## SAU KHI PUBLISH — Lộ trình ZaloPay Production

```
Bước A: Publish thành công trên Zalo
         ↓
Bước B: THÔNG BÁO ứng dụng bán hàng với Bộ Công Thương
         (không phải "Đăng ký Sàn TMĐT" — mini-app 1 quán = Thông báo, không phải Đăng ký)
         Chủ thể đứng tên: hộ kinh doanh Phở Gà PUBU (KHÔNG phải MEVO/Đỗ Đức Tú)
         Chi tiết đầy đủ: xem bo-cong-thuong-thong-bao-checklist.md
         Thời gian xử lý: 3–5 ngày làm việc
         ↓
Bước C: Gửi Giấy xác nhận đăng ký BCT cho ZaloPay Merchant
         Liên hệ: support@zalopay.vn
         Subject: "Yêu cầu mở Production mode — ZaloPay Merchant [APP_ID]"
         ↓
Bước D: ZaloPay unlock Production mode
         → Khách dùng ZaloPay thật, tiền về tài khoản quán ngay
```

---

## Sau khi Publish Production — cập nhật Vercel

Xóa 2 dòng dưới trong Vercel Dashboard (admin-web):
- `NEXT_PUBLIC_ZALO_ENV` ← XÓA TRỐNG
- `NEXT_PUBLIC_ZALO_VERSION` ← XÓA TRỐNG

QR bàn lúc này trỏ về Production, không cần version cụ thể.

---

## Files đã tạo sẵn

| File | URL sau deploy | Mục đích |
|------|---|---|
| `admin-web/app/privacy/page.tsx` | `/privacy` | Chính sách bảo mật — submit lên Zalo |
| `admin-web/app/terms/page.tsx` | `/terms` | Điều khoản sử dụng |
| `mini-app/app-config.json` | — | Title = "Phở Gà PUBU" ✅ |
