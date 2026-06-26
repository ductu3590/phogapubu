# MEVO — Codex Master Context

> **Đọc file này đầu tiên trước khi làm bất kỳ việc gì.**
> Cập nhật file này mỗi khi có quyết định lớn thay đổi hướng đi.

---

## ⚠️ QUY TẮC BẮT BUỘC VỀ TEST

Sau khi hoàn thành BẤT KỲ Sprint hoặc task nào, Codex PHẢI:
1. Dừng lại — KHÔNG tự động chuyển sang task tiếp theo
2. Đọc `TESTING.md` — lấy đúng checklist test của Sprint vừa xong
3. Nói với anh Tú: *"Xong rồi anh, test theo TESTING.md — Sprint X, Test Y nhé"*
4. Chờ anh Tú xác nhận "PASS" trước khi tiếp tục

Vi phạm quy tắc này = build trên nền không ổn định = mất gấp đôi thời gian fix sau.

---

## 1. Dự án là gì?

**MEVO** (Menu Evolution) — Nền tảng QR Order SaaS cho quán ăn Việt Nam, chạy trực tiếp trên **Zalo Mini App**.

Khách ngồi vào bàn → quét QR bằng Zalo → Mini App mở ngay trong Zalo → chọn món → thanh toán ZaloPay 1 chạm → bếp nhận đơn realtime → khách nhận thông báo qua Zalo.

Không cần cài app. Không cần mở app ngân hàng. Toàn bộ hành trình trong Zalo.

**Người sáng lập:** Đỗ Đức Tú — Lào Cai, Việt Nam.
**Giai đoạn:** MVP — pilot 2–3 quán quen trước khi scale.
**Quán pilot:** Phở Gà Pubu (Lào Cai) + 1–2 quán nhậu bình dân.

---

## 2. Quyết định kiến trúc cốt lõi

### ✅ Zalo Mini App FIRST — không làm PWA

| Lý do | Chi tiết |
|---|---|
| Không ma sát | Khách đã có Zalo → quét QR → mở ngay, 0 bước thừa |
| Thanh toán 1 chạm | ZaloPay tích hợp sẵn trong Zalo, không cần rời app |
| Thông báo realtime | ZNS gửi thẳng vào Zalo của khách, không cần push notification |
| 76M user sẵn có | Không cần educate thói quen mới |
| Template sẵn có | Zalo có `zaui-bistro` và `zaui-menu` — template F&B chính thức |

### ✅ Backend hoàn toàn độc lập với Zalo
Supabase là source of truth. Zalo Mini App chỉ là lớp UI gọi API.
Nếu sau này cần web app hoặc mobile app khác → backend không thay đổi.

### ✅ Admin Dashboard là Next.js Web App riêng
Chủ quán dùng máy tính/điện thoại để quản lý. Không nhét vào Mini App.

### ✅ Multi-instance "Core + Theme" — MỖI QUÁN MỘT MINI-APP RIÊNG (quyết định 2026-06-22)
MEVO **KHÔNG** dùng một mini-app đa quán. Lý do: Zalo Mini App khoá thanh toán mượt về **một merchant/app**. Để đạt cùng lúc (mượt 1-2 chạm) + (tiền về thẳng quán) + (MEVO không giữ tiền) → mỗi quán có **mini-app riêng + merchant ZaloPay riêng**, dựng từ **một bộ code lõi chung** (kiểu WordPress core + theme):
- **Core engine** dùng chung, update tập trung; **theme** runtime chọn từ DB; **content** (menu/banner/màu) đọc lúc chạy → đổi không cần build lại.
- Backend Supabase **dùng chung** (phân theo `store_id`), admin web tập trung do **MEVO vận hành** (v1 quán chưa tự phục vụ).
- MEVO là đơn vị **làm + vận hành mini-app**, không phải ví điện tử.
- 📄 Thiết kế đầy đủ: [docs/superpowers/specs/2026-06-22-mevo-core-theme-architecture-design.md](docs/superpowers/specs/2026-06-22-mevo-core-theme-architecture-design.md)

---

## 3. Kiến trúc hệ thống

```
┌──────────────────────────────────────────────────────────────┐
│                        NGƯỜI DÙNG                           │
│  [Khách - Zalo]    [Nhân viên bếp - tablet]  [Chủ quán - PC]│
└────────┬────────────────────┬──────────────────────┬─────────┘
         │                    │                      │
         ▼                    ▼                      ▼
┌──────────────────┐ ┌─────────────────┐ ┌───────────────────┐
│  ZALO MINI APP   │ │  KITCHEN DISPLAY │ │  ADMIN WEB APP    │
│  (ZaUI + React)  │ │  (Next.js PWA)  │ │  (Next.js)        │
│                  │ │                 │ │                   │
│  • Menu + Giỏ    │ │  • Xem đơn mới  │ │  • Quản lý menu   │
│  • ZaloPay SDK   │ │  • Cập nhật     │ │  • Quản lý bàn    │
│  • Trạng thái    │ │    trạng thái   │ │  • Tạo & tải QR   │
│  • ZNS nhận      │ │  • Realtime     │ │  • Xem doanh thu  │
└────────┬─────────┘ └────────┬────────┘ └──────────┬────────┘
         │                    │                      │
         └────────────────────┴──────────────────────┘
                              │ REST API + Realtime WebSocket
                              ▼
                ┌─────────────────────────────┐
                │          SUPABASE            │
                │  PostgreSQL + Realtime       │
                │  Auth + Storage              │
                │  (Singapore region)          │
                └──────────────┬──────────────┘
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
             ┌────────────┐       ┌─────────────┐
             │  ZALOPAY   │       │  ZALO OA    │
             │  Payment   │       │  ZNS Notify │
             │  Callback  │       │             │
             └────────────┘       └─────────────┘
```

---

## 4. Tech Stack chi tiết

### A. Zalo Mini App — UI cho khách hàng
```
Framework:    Zalo Mini App SDK (zmp-cli)
UI Library:   ZaUI (component library chính thức của Zalo)
Language:     TypeScript + React 18
State:        Recoil (Zalo recommend cho Mini App)
Build:        Vite
Template:     zaui-bistro (official Zalo F&B template)
Payment:      ZaloPay Checkout SDK (tích hợp trong ZaUI)
Notification: Zalo OA Message + ZNS
Deploy:       Zalo Mini App Platform (qua zmp-cli deploy)
```

### B. Backend — Supabase
```
Database:     PostgreSQL (Supabase managed)
Realtime:     Supabase Realtime (WebSocket, pub/sub)
Auth:         Supabase Auth (chủ quán login)
Storage:      Supabase Storage (ảnh món ăn, logo quán)
Region:       ap-southeast-1 (Singapore)
```

### C. Admin Web + Kitchen Display — Next.js
```
Framework:    Next.js 14 (App Router)
UI:           Tailwind CSS + shadcn/ui
Auth:         Supabase Auth (SSR)
Deploy:       Vercel
```

---

## 5. Cấu trúc thư mục Monorepo

```
mevo/
├── AGENTS.md               ← File này (đọc đầu tiên)
├── PRD.md                  ← Chi tiết tính năng
├── ARCHITECTURE.md         ← Setup guide & patterns
│
├── mini-app/               ← Zalo Mini App (khách hàng)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── index.tsx         ← Trang menu chính
│   │   │   ├── cart.tsx          ← Giỏ hàng
│   │   │   ├── payment.tsx       ← Thanh toán ZaloPay
│   │   │   └── order-status.tsx  ← Trạng thái đơn realtime
│   │   ├── components/
│   │   │   ├── menu/             ← MenuCard, CategoryTab...
│   │   │   ├── cart/             ← CartItem, CartSummary...
│   │   │   └── order/            ← OrderStatus, OrderItem...
│   │   ├── services/
│   │   │   ├── supabase.ts       ← Supabase client
│   │   │   ├── order.service.ts  ← Tạo/theo dõi đơn hàng
│   │   │   └── zalopay.service.ts← Tạo giao dịch ZaloPay
│   │   ├── state.ts              ← Recoil atoms (menu, cart, store)
│   │   └── app.tsx               ← Route config
│   ├── app-config.json           ← Zalo Mini App config
│   ├── package.json
│   └── .env
│
├── admin-web/              ← Next.js Admin + Kitchen
│   ├── app/
│   │   ├── (auth)/
│   │   │   └── login/page.tsx
│   │   ├── admin/
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── menu/page.tsx
│   │   │   ├── tables/page.tsx
│   │   │   └── orders/page.tsx
│   │   └── kitchen/
│   │       └── [storeSlug]/page.tsx
│   ├── components/
│   ├── lib/supabase/
│   └── package.json
│
└── supabase/
    └── migrations/
        └── 001_init.sql
```

---

## 6. Database Schema

```sql
-- Quán ăn
stores (
  id uuid PK,
  name text,
  slug text UNIQUE,           -- URL-friendly: 'pho-ga-pubu'
  phone text,
  address text,
  logo_url text,
  zalopay_app_id text,        -- ZaloPay merchant app_id
  zalopay_key1 text,          -- ZaloPay key (encrypted)
  zalopay_key2 text,          -- ZaloPay key (encrypted)
  zalo_oa_id text,            -- Zalo OA để gửi ZNS
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
)

-- Bàn ăn
tables (
  id uuid PK,
  store_id uuid FK stores,
  table_number text,          -- 'Bàn 1', 'Bàn VIP A'
  is_active boolean DEFAULT true
)

-- Danh mục món
menu_categories (
  id uuid PK,
  store_id uuid FK stores,
  name text,                  -- 'Món chính', 'Đồ uống'
  sort_order int DEFAULT 0,
  is_active boolean DEFAULT true
)

-- Món ăn
menu_items (
  id uuid PK,
  store_id uuid FK stores,
  category_id uuid FK menu_categories,
  name text,
  description text,
  price int,                  -- VNĐ, không dùng decimal
  image_url text,
  is_available boolean DEFAULT true,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
)

-- Đơn hàng
orders (
  id uuid PK,
  store_id uuid FK stores,
  table_id uuid FK tables,
  status text DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','cooking','ready','paid')),
  total_amount int,
  zalopay_trans_id text,      -- ID giao dịch ZaloPay (sau khi thanh toán)
  zalo_user_id text,          -- Zalo User ID (để gửi ZNS thông báo)
  note text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
)

-- Chi tiết đơn
order_items (
  id uuid PK,
  order_id uuid FK orders,
  menu_item_id uuid FK menu_items,
  item_name text,             -- Snapshot tên lúc order
  item_price int,             -- Snapshot giá lúc order
  quantity int DEFAULT 1,
  note text
)
```

---

## 7. Luồng hoàn chỉnh (Happy Path)

```
[KHÁCH]
  1. Mở Zalo → Camera → Quét QR trên bàn số 3
  2. MEVO Mini App mở ngay trong Zalo
     → Zalo tự lấy user_id (không cần đăng nhập thêm)
     → Load menu Phở Gà Pubu từ Supabase

  3. Chọn món:
     + Phở gà đặc biệt    80.000đ
     + Nước cam tươi       25.000đ
     ─────────────────────────────
     Tổng                 105.000đ

  4. Bấm "Đặt món và Thanh toán"
     → Backend tạo order (status: pending)
     → Gọi ZaloPay API → nhận payment_token
     → Gọi ZaloPay SDK → ZaloPay mở ngay trong Zalo
     → Khách xác nhận bằng vân tay/Face ID
     → ZaloPay callback → Backend confirm đơn (status: confirmed)

[BACKEND]
  5. Supabase Realtime push update → Kitchen Display

[BẾP]
  6. Màn hình bếp tablet hiển thị:
     ┌─────────────────────────┐
     │ 🔔 Bàn 3 — #045  14:32 │
     │ • Phở gà đặc biệt  x1  │
     │ • Nước cam tươi    x1  │
     │ [Bắt đầu làm]          │
     └─────────────────────────┘
  7. Bấm "Bắt đầu làm" → status: cooking
  8. Bấm "Xong" → status: ready

[KHÁCH]
  9. Nhận tin nhắn Zalo (ZNS) từ MEVO OA:
     "🍜 Món của bạn đã xong!
      Bàn 3 — Đơn #045
      Nhân viên đang mang ra cho bạn."
```

---

## 8. Các bước đăng ký cần làm TRƯỚC KHI CODE

Anh cần hoàn thành các bước này để có credentials:

- [ ] **Zalo Developer**: https://developers.zalo.me → Tạo Mini App → lấy `ZALO_APP_ID`
- [ ] **Zalo OA**: Tạo Official Account → lấy `OA_ID` và `OA_ACCESS_TOKEN`
- [ ] **ZaloPay Merchant**: https://zalopay.vn/business → Đăng ký → lấy `APP_ID`, `KEY1`, `KEY2`
- [ ] **Supabase**: https://supabase.com → New project → Singapore → lấy URL + keys
- [ ] **Vercel**: https://vercel.com → New project → connect GitHub

---

## 9. Quy tắc code bắt buộc

- **Tiếng Việt** cho tất cả text UI người dùng thấy
- **Mobile-first tuyệt đối** — Zalo Mini App chỉ chạy trên điện thoại
- **Không hardcode** ID, key, URL nào trong code → dùng env vars
- **Ưu tiên ZaUI components** thay vì tự viết UI từ đầu
- **Comment bằng tiếng Việt** cho logic phức tạp
- **Snapshot tên + giá** vào order_items khi tạo đơn (phòng menu thay đổi)
- Commit format: `feat: [mô tả]` / `fix: [mô tả]` / `chore: [mô tả]`

---

## 10. Lịch sử quyết định

| Ngày | Quyết định | Lý do |
|---|---|---|
| 2026-05-10 | Zalo Mini App first, bỏ PWA | Thanh toán ZaloPay 1 chạm, UX liền mạch trong Zalo |
| 2026-05-10 | Admin web là Next.js riêng | Chủ quán dùng PC, không nhét vào Mini App |
| 2026-05-10 | Dùng zaui-bistro làm template gốc | Zalo official template, đúng use case F&B |
| 2026-05-10 | Monorepo: mini-app + admin-web + supabase | Dễ quản lý, backend dùng chung |
| 2026-05-10 | VietQR static → ZaloPay SDK | Thanh toán liền mạch, không rời Zalo |
| 2026-05-10 | Pilot: Phở Gà Pubu + quán nhậu Lào Cai | Có quan hệ, lấy feedback thật |
| 2026-06-22 | **Mỗi quán 1 mini-app riêng + 1 merchant ZaloPay riêng** (multi-instance), bỏ ý "1 app đa quán" | Zalo Mini App khoá thanh toán về 1 merchant/app → muốn mượt 1-2 chạm + tiền về thẳng quán + MEVO không giữ tiền thì buộc phải 1-app-1-merchant |
| 2026-06-22 | **Kiến trúc Core + Theme runtime** (kiểu WordPress), 1 bộ code lõi nhân bản N app | Update lõi tập trung, đổi theme/menu/banner đọc từ DB lúc runtime (không build lại). Chi tiết: [docs/superpowers/specs/2026-06-22-mevo-core-theme-architecture-design.md](docs/superpowers/specs/2026-06-22-mevo-core-theme-architecture-design.md) |
| 2026-06-22 | MEVO là đơn vị **làm + vận hành mini-app** cho quán, KHÔNG phải ví điện tử | Tiền về thẳng quán → tránh giấy phép trung gian thanh toán (NHNN) |
| 2026-06-22 | v1: **mọi thay đổi (theme/menu/banner) do MEVO làm**, quán chưa tự phục vụ | YAGNI — giảm phạm vi admin, hoãn login/phân quyền cho quán sang phase sau |
