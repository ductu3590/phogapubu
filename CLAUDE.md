# MEVO — Claude Code Master Context

> **Đọc file này đầu tiên trước khi làm bất kỳ việc gì.**
> Cập nhật file này mỗi khi có quyết định lớn thay đổi hướng đi.

---

## ⚠️ QUY TẮC BẮT BUỘC VỀ TEST

Sau khi hoàn thành BẤT KỲ Sprint hoặc task nào, Claude Code PHẢI:
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

### ⚠️ Sửa mini-app đúng chỗ — 3 tầng, đừng nhầm (quyết định 2026-07-03)

Trước khi sửa bất kỳ file nào trong `mini-app/` hoặc `mini-app-instances/`, xác định đang sửa
tầng nào — nhầm tầng là lỗi hay gặp nhất khi có ≥2 quán:

| Tầng | Sửa ở đâu | Khi nào sửa | Áp dụng cho |
|---|---|---|---|
| **1. Core code** (logic, UI, luồng đặt món...) | `mini-app/src/` (thư mục gốc repo, nhánh `main`) | Sửa bug, thêm tính năng dùng chung cho MỌI quán | Tất cả quán, sau khi mỗi quán tự `git merge origin/main` vào worktree của mình |
| **2. Cấu hình riêng quán** (Zalo App ID, Supabase key, tên app hiển thị trên Zalo) | `mini-app-instances/<slug>/mini-app/.env` + `app-config.json` (KHÔNG tracked, mỗi quán 1 bản) | Onboard quán mới, đổi Zalo App ID | Chỉ 1 quán — không bao giờ sửa ở `mini-app/` gốc, gốc không có 2 file này |
| **3. Nội dung/theme runtime** (tên quán, logo, banner, menu, **màu chủ đạo**) | Bảng `stores`/`menu_items`/... qua `/mevo` hoặc `/admin` | Đổi nội dung hiển thị, không đổi hành vi | Chỉ 1 quán — KHÔNG cần sửa code, KHÔNG cần deploy lại, chỉ cần quán đó đã `zmp deploy` ít nhất 1 lần |

**Quy tắc:**
- `mini-app/` (thư mục gốc) = **source lõi**, không `npm run dev`/`zmp deploy` trực tiếp từ đây
  (thiếu `.env`/`app-config.json` cố ý — nhắc đang cầm nhầm thư mục).
- Mỗi quán có 1 **git worktree riêng** tại `mini-app-instances/<slug>/` (branch `deploy/<slug>`,
  tạo bằng `scripts/create-mini-app-instance.sh`) — `cd` vào `mini-app-instances/<slug>/mini-app`
  để `npm run dev`/`zmp deploy` cho ĐÚNG quán đó, không lo đụng `.env` quán khác.
- Worktree quán **chỉ chứa `mini-app/`** (sparse-checkout, quyết định 2026-07-27). `admin-web/`,
  `supabase/`, `docs/`, `scripts/` là hạ tầng DÙNG CHUNG — 1 bản admin-web phục vụ mọi quán, nhân
  bản vào từng quán chỉ tốn chỗ và dễ sửa nhầm bản chết. **Sửa admin-web/DB → về repo gốc
  `D:\Code\mevo`**, không sửa trong `mini-app-instances/`.
- Sửa core xong trên `main` → từng quán tự đồng bộ: `cd mini-app-instances/<slug> && git fetch
  origin && git merge origin/main` — KHÔNG copy tay file.
- 📄 Chi tiết đầy đủ + lịch sử: `.claude/skills/replicate-mini-app/SKILL.md`.

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
├── CLAUDE.md               ← File này (đọc đầu tiên)
├── PRD.md                  ← Chi tiết tính năng
├── ARCHITECTURE.md         ← Setup guide & patterns
│
├── mini-app/               ← Zalo Mini App — SOURCE LÕI, không deploy trực tiếp từ đây
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
│   ├── app-config.example.json   ← Template (tracked); app-config.json thật = gitignored
│   ├── package.json
│   └── .env.example              ← Template (tracked); .env thật = gitignored
│
├── mini-app-instances/     ← Worktree riêng theo quán (gitignored, xem quyết định 2026-07-03)
│   └── <slug>/mini-app/    ← cd vào đây để npm run dev / zmp deploy cho ĐÚNG quán này
│                              (tạo bằng scripts/create-mini-app-instance.sh)
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
  zalo_oa_id text,            -- Zalo OA để gửi ZNS + prompt follow
  payment_methods text[] NOT NULL DEFAULT '{zalopay,cash}',  -- phương thức thanh toán được bật
  is_accepting_orders boolean DEFAULT true,  -- công tắc tạm nghỉ; false = chặn mọi đơn (mig 017)
  serving_hours jsonb DEFAULT '[]',          -- mảng ca [{open,close}] giờ Asia/Ho_Chi_Minh; rỗng = cả ngày (mig 017)
  delivery_area_note text,                   -- text phạm vi ship, chỉ hiển thị (mig 017)
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
)

-- Yêu cầu gọi nhân viên (nút chuông)
service_requests (
  id uuid PK,
  store_id uuid FK stores,
  table_id uuid FK tables,
  table_number text,          -- Snapshot số bàn
  type text DEFAULT 'payment' CHECK (type IN ('payment','help')),
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
| 2026-06-26 | **Hướng tới ZaloPay-only** — tiền mặt là option bật/tắt per-store, không phải default | Bắt buộc thanh toán trước khi bếp làm → tránh QR abuse (gọi từ xa, không ai ăn); đơn chỉ vào bếp sau khi có tiền |
| 2026-06-26 | **"Món đã gọi" scope: `zalo_user_id + table_id + 6h`** — không phải `table_id` đơn thuần | Khách mới ngồi vào bàn cũ → Zalo ID khác → clean slate. Bàn bên quét nhầm → không thấy đơn bàn khác |
| 2026-06-26 | **Follow OA trước khi gửi ZNS** — prompt bottom sheet lần đầu mở app | ZNS chỉ gửi được cho user đã follow OA; không follow = không nhận thông báo món xong |
| 2026-06-28 | **Quán mới mặc định TẮT tiền mặt** (`payment_methods` default `{zalopay}`) | Cashless-first; bắt trả trước qua ZaloPay chống chơi xấu (chụp QR bàn → ngồi nhà đặt rồi chọn tiền mặt). Quán cũ không đổi tự động, tự bật trong admin nếu cần |
| 2026-06-28 | **Doanh thu = tiền THẬT đã nhận** (ZaloPay `trans_id` + cash `paid`), không chỉ `status='paid'` | Đơn ZaloPay trả trước dừng ở confirmed/ready, không bao giờ thành `paid` → trước đây doanh thu ZaloPay bị tính = 0 |
| 2026-07-02 | **MEVO Onboarding Cockpit (`/mevo`)** — `mevo_operators.role` (`mevo_superadmin`/`store_owner`), RLS scope theo `store_id` (`is_store_scoped_operator()`), thay toàn bộ fallback "quán active đầu tiên" bằng `requireOperator()` | Chuẩn bị quán thứ 2 thật — RLS cũ chỉ check "có phải operator", không check đúng quán → chủ quán A gọi thẳng Supabase vẫn đọc/sửa được quán B |
| 2026-07-03 | **Mỗi quán 1 git worktree riêng cho mini-app** (`mini-app-instances/<slug>/`, nhánh `deploy/<slug>`), KHÔNG sửa tay `.env`/`app-config.json` dùng chung nữa | Sửa tay `.env` mỗi lần deploy dễ nhầm quán, không chạy song song 2 `npm run dev` được. Worktree cho thư mục vật lý riêng nhưng vẫn chung lịch sử `mini-app/src` — vá lỗi core 1 chỗ, đồng bộ qua `git merge origin/main`, không copy tay. `mini-app/` gốc giờ là source lõi, không dùng để deploy trực tiếp nữa. Script: `scripts/create-mini-app-instance.sh` |
| 2026-07-06 | **Core v2.0**: wifi trên menu (mig 024) + loa đọc đơn TTS Kitchen (Web Speech, miễn phí) + vòng quay may mắn sau thanh toán (mig 025). Cả 3 sprint PASS. Kế hoạch: `docs/superpowers/specs/2026-07-04-mevo-core-v2-plan.md`, checklist `TESTING-V2.md` | Bám đối thủ (phân tích `docs/research/2026-07-04-cola-vn-competitor-analysis.md`): wifi giảm hỏi pass; loa đọc đơn cho quán ồn; vòng quay kéo khách quay lại |
| 2026-07-06 | **Loa đọc đơn báo đúng lúc đơn VÀO BẾP** (confirmed/pending+cash), không phải lúc `create_order` (pending, khách mới bấm pay chưa trả tiền). Predicate `admin-web/lib/kitchen-announce.ts` dùng chung với cột "Chờ xử lý" | `create_order` tạo đơn 'pending' NGAY khi bấm thanh toán; ZaloPay chỉ vào bếp sau callback → confirmed. Báo ở INSERT/pending = kêu cho đơn chưa trả tiền |
| 2026-07-06 | **Vòng quay: kết quả do SERVER quyết định** (RPC `spin_wheel` theo weight, idempotent 1 lượt/đơn), client chỉ vẽ animation dừng đúng ô. `spin_enabled` mặc định **false** mọi quán, chỉ đơn có tiền thật mới quay | Chống gian lận (client không tự chọn quà); "cắm thêm, tắt là như chưa từng tồn tại" để không ảnh hưởng quán chưa dùng |
| 2026-07-06 | **Giờ phục vụ + tạm nghỉ** (mig 017): `stores.is_accepting_orders` + `serving_hours` (jsonb nhiều ca, rỗng=cả ngày, giờ Asia/Ho_Chi_Minh). Ngoài giờ/tạm nghỉ **chặn CẢ đơn tại bàn lẫn ship**, 2 lớp: mini-app (banner + khoá đặt) + RPC `create_order` (helper `store_accepting_now`). Cấu hình ở `/admin` settings | Quán nghỉ lễ/ngoài giờ vẫn bị quét QR đặt từ xa; chặn ở server mới chống lách thật. Spec `docs/superpowers/specs/2026-07-06-serving-hours-branding-oa-follow-design.md` |
| 2026-07-06 | **Phạm vi ship chỉ hiển thị** (`stores.delivery_area_note`, text ở tab Cửa hàng), KHÔNG geocoding/không chặn theo địa chỉ | YAGNI — pilot thị xã nhỏ, geocoding/maps API quá nặng; chủ quán tự lọc đơn ngoài vùng |
| 2026-07-06 | **Splash thương hiệu MEVO** thay màn `!storeId` trang menu (logo `mini-app/src/static/mevo-logo.png` 512px + "MEVO.VN" + tagline) | Màn chờ/cold-start trước đây trống trơn ("Quét QR"), giờ nhận diện thương hiệu MEVO |
| 2026-07-06 | **Fix prompt quan tâm OA "biến mất"** (tab Cửa hàng): đổi sang key `mevo_oa_connected_v2_<storeId>`, chỉ đánh dấu khi `followOA` thật sự thành công; CTA card luôn hiện tới khi kết nối, sheet tự bật 1 lần/phiên | Cờ cũ `mevo_perms_granted` set cả khi user từ chối → ẩn vĩnh viễn cả sheet lẫn card (không phải mất code/data) |
| 2026-07-08 | **Chuyển khoản ngân hàng qua Zalo Checkout SDK** (method=BANK): bỏ ghim `method` để Zalo hiện màn chọn PT (`checkout-create-mac` không truyền method). Notify BANK là **contract KHÁC ví**: payload chỉ `{appId, method, orderId, extradata}`, KHÔNG có amount/resultCode/transId; verify **`overallMac`** ký trên field `data` **sort a→z** (đã brute-force xác nhận). `checkout-notify` thêm nhánh BANK; client `waitForConfirmation()` chờ server confirm trước khi kết luận thất bại (notify trễ ~5-7s). Đơn BANK lưu `zalopay_trans_id='BANK:<zaloOrderId>'` (vào doanh thu). PASS end-to-end | Ví khoá về 1 merchant; chuyển khoản đưa tiền thẳng TK quán + **miễn phí**. ⚠️ **Option A**: MAC BANK hợp lệ = khách ĐÃ QUA bước chuyển khoản, KHÔNG chắc tiền đã về (Zalo không thấy giao dịch bank→bank) → payload không có amount, không đối chiếu được số tiền; chủ quán tự liếc app NH đối chiếu |
| 2026-07-08 | **Ưu tiên chuyển khoản ngân hàng làm PT chính** (miễn phí); ZaloPay/Momo tích hợp sau, per-store khi chủ quán muốn | Đảo hướng "ZaloPay-only" (2026-06-26): chuyển khoản 0 phí + tiền về thẳng quán. Vẫn giữ được chống-abuse tương đối vì là trả trước (khách qua bước chuyển khoản mới confirm). Thứ tự/ẩn-hiện PT chỉnh ở **console Zalo** (kéo thả danh sách PT), không phải code |
| 2026-07-27 | **Worktree quán chỉ sparse-checkout `mini-app/`** — không mang theo `admin-web/`, `supabase/`, `docs/`, `scripts/`, `logo/` | Toàn hệ thống dùng CHUNG 1 admin-web + 1 Supabase; copy vào từng quán chỉ tốn dung lượng và sớm muộn có người sửa nhầm bản copy chết. Vẫn chung lịch sử git nên `git merge origin/main` đồng bộ code lõi như cũ. ⚠️ Sparse-ify worktree đã có: chạy 1 lệnh `git sparse-checkout set --cone mini-app`; KHÔNG chạy `init --cone` trước (nó xoá sạch `mini-app/` kèm `.env`/`app-config.json`/`node_modules`) |
| 2026-07-11 | **Hệ mã giảm giá** (mig 027): bảng `vouchers` chung (kind `spin`/`shipper`), trừ tiền TRONG `create_order` v5 → `orders.total_amount` = tiền SAU giảm nên MAC/doanh thu tự đúng, không sửa checkout-create-mac. Quyền dùng mã = `zalo_user_id` (code chỉ là nhãn); mã spin luôn gắn UID (đơn không UID thì loại ô voucher khỏi vòng quay). Mã shipper khoá UID lần dùng đầu tại checkout, code tự sinh `SHIP-XXXXXX`, giới hạn N đơn/ngày; quản lý ở `/admin/vouchers`. Giải hiện vật (gift) báo bếp realtime `spin_results` + loa TTS, nút "Đã đưa". Spec: `docs/superpowers/specs/2026-07-11-voucher-discount-system-design.md`, plan `docs/superpowers/plans/2026-07-11-voucher-discount-system.md`, test `TESTING-VOUCHER.md` | Vòng quay trúng mã phải tự áp lần sau (không bắt khách nhớ code); ưu đãi shipper 5k/đơn không cho khách thường dùng ké → khoá Zalo UID. ⚠️ RỦI RO #1 phải test đầu tiên: Zalo Checkout có bắt `sum(item)=amount` khi amount đã giảm không — nếu có thì thêm item giá âm |
| 2026-08-07 | **Thanh toán lại khi khách thoát màn chọn PT**: nguồn sự thật đổi sang `resultCode` lấy từ payload sự kiện `PaymentDone` đưa thẳng vào `checkTransaction({data})` (tài liệu Zalo, SDK ≥2.45; `-2` = thoát không chọn PT). Đơn `pending` được GIỮ, "Thanh toán lại" trả tiền cho đúng đơn đó, chỉ huỷ khi khách bấm "Sửa món". Mig 038: `cancel_order` trả `jsonb {result, reason}` thay vì `void` + chặn huỷ đơn đã có `payment_received_at`. Khoá giỏ đặt ở **cart store** (không phải trang checkout) vì `/checkout` có `back: true`. Spec `docs/superpowers/specs/2026-08-06-repay-abandoned-checkout-design.md`, test `TESTING.md` mục 2026-08-06 | Code cũ đoán kết quả qua biến `zpOrderId` cục bộ nên gộp 4 tình huống khác nhau thành một, và mọi trường hợp đều `clearCart()` + navigate → khách gọi món cho cả bàn, bấm nhầm Quay lại là mất sạch giỏ, phải hỏi lại từ đầu. ⚠️ Nguyên tắc xuyên suốt: **không chắc chắn thì luôn rơi về `pending_confirm`**, KHÔNG BAO GIỜ suy đoán "khách chưa trả tiền" — báo nhầm cho người đã chuyển khoản là lỗi nặng nhất (đúng con bug khiến `2a5d159` phải gỡ dialog). `cancel_order` cũ RETURNS void: UPDATE trúng 0 dòng không sinh lỗi nên client tưởng đã huỷ trong khi đơn còn nguyên |
| 2026-08-07 | **Giỏ hàng lưu qua lần mở app** (zustand persist, key `mevo_cart`, **TTL 6h**). CHỈ lưu `items` — tổng tiền tính lại lúc khôi phục; KHÔNG lưu `lockedByOrderId`. Kèm hộp thoại "Bạn còn đơn chưa thanh toán" lúc mở app (Tiếp tục đặt món / Huỷ món) vì banner chỉ sống trong trang giỏ hàng mà nút giỏ nổi tự ẩn khi giỏ trống → không có đường vào `/checkout` | Khách chọn cả loạt món cho bạn bè, lỡ thoát app là mất hết. Còn gây cảnh giỏ hiện 0đ mà "Thanh toán lại" vẫn ra tiền — hai số lệch vì đơn thì được lưu, giỏ thì không. TTL 6h khớp cửa sổ "Món đã gọi" (`zalo_user_id + table_id + 6h`). Không cần scope theo `store_id` vì mỗi quán là một Zalo Mini App riêng nên localStorage đã tách sẵn. ⚠️ KHÔNG lưu khoá: lưu mà đơn đã chết thì giỏ đóng băng vĩnh viễn, không ai mở ra được |
| 2026-08-30 | **Duyệt spec "Trả sau + Phiên bàn" (2026-08-20, mig 039)** — build làm móng cho quán mới **Bia lẩu Bảo Lương** (quán nhậu vỉa hè 20 bàn, Lào Cai, trả sau, thanh toán tại quầy bằng QR loa sẵn có → KHÔNG cần ZaloPay merchant, OA hoãn) | Bảo Lương là quán đầu tiên cần postpay thật; onboarding nhẹ hơn Pubu vì không đụng Zalo Checkout. Spec: `docs/superpowers/specs/2026-08-20-prepay-postpay-table-session-design.md` |
| 2026-08-30 | **Lớp "Mâm" cho khách đoàn**: mâm = 1 `table_session` chiếm N bàn (bảng nối `session_tables` MỚI) = 1 bill con; mâm đoàn đặt cờ `is_open_ordering=true` → BỎ khoá chủ phiên (bàn lẻ vẫn khoá như spec 039); gộp bill = tick N phiên → in 1 hoá đơn tổng → đóng cả loạt; tách bill là mặc định vì mỗi mâm vốn là bill con. Kèm: in bill 80mm từ admin web; sơ đồ bàn 2D kéo thả hoãn sang Sprint 4 SAU go-live | Đoàn 20-30 khách ngồi 5-6 bàn ăn theo 2-3 mâm, 1 người trả chung — spec 039 từng hoãn "ghép bàn" vì chưa quán nào hỏi, giờ Bảo Lương hỏi. Nhân viên đứng ra ghép bàn nên mâm mở không sợ đơn ma. Spec: `docs/superpowers/specs/2026-08-30-bao-luong-tray-group-design.md` |
| 2026-08-31 | **Sprint 1 XONG (mig 039)** — tách `stores.payment_timing` (`prepay`/`postpay`) khỏi `payment_method`; bảng `table_sessions` (một bàn đang có khách = một phiên = một bill, khoá theo chủ phiên khớp **Zalo UID HOẶC device id**); `orders.session_id`; `create_order` v10; màn `/staff/tables` chốt bill. `orderInKitchen` giờ đọc `payment_timing`, KHÔNG đọc `payment_method` nữa | Trước đây trục "KHI NÀO thu tiền" bị suy ra từ trục "thu BẰNG GÌ" (`payment_method='cash'` ⇒ vào bếp) nên quán trả trước bật tiền mặt cho nhân viên thì đơn QR tiền mặt của khách vẫn lọt vào bếp — mig 037 mới vá được một nửa. ⚠️ **Sprint 2 (lớp Mâm) chỉ cần sửa hàm `open_session_id_for_table()`**: mọi RPC đều resolve phiên qua nó, và composite FK cố tình ràng theo `(session_id, store_id)` chứ KHÔNG theo `table_id` để một phiên chiếm được N bàn |
| 2026-08-31 | **Backfill 039 để Pubu ở `prepay`, không phải `postpay`** như spec §5.1 dự đoán | Câu backfill chỉ đổi quán đang bật `cash`, mà thực tế prod **không quán nào bật cash** (cả hai đều `{zalo_checkout}`) → 0 dòng đổi. Vẫn đúng: đơn Pubu có `payment_received_at` do callback ví ghi nên vẫn vào bếp. Hệ quả nhỏ: 3 đơn `cash`+`pending` rác từ tháng 6–7 rơi khỏi màn bếp |
| 2026-08-31 | **Hoãn toàn bộ mảng thanh toán của quán TRẢ TRƯỚC sang sprint riêng** (VietQR/EMVCo, nút "Khách chuyển khoản" ở `/staff/order`, RPC `staff_confirm_payment`, mục tài khoản VietQR trong settings) — 3 cột `stores.bank_*` vẫn dựng sẵn | Anh Tú: *"trả trước tức là 100% chuyển khoản hoặc Zalo/Momo merchant; với từng quán build riêng phần thanh toán dễ hơn gộp hết vào một hệ thống. Sau khi có đủ các luồng thanh toán mới làm phần cấu hình bật/tắt"*. Bảo Lương thanh toán tại quầy bằng QR loa sẵn có nên không cần MEVO sinh QR |
| 2026-08-31 | **Vá bug: `service_requests` chưa bao giờ nằm trong publication `supabase_realtime`** | `kitchen-display.tsx` có subscribe bảng này nhưng Postgres không phát sự kiện ⇒ nút chuông "Gọi nhân viên"/"Gọi thanh toán" bấm xong **không ai nghe thấy** kể từ khi làm (2026-06-26). Luồng trả sau dùng lại đúng nút đó nên phải vá cùng mig 039 |
| 2026-08-31 | **Sprint 2 XONG (mig 040) — lớp Mâm**: `session_tables` (phiên chiếm N bàn) + `table_sessions.is_open_ordering`. Mâm đoàn BỎ khoá chủ phiên, bàn lẻ vẫn khoá. Ghép mâm / thêm bàn / nhập phiên lẻ vào mâm / gộp bill N mâm trong MỘT transaction / in bill 80mm từ admin web | Đúng như đã dự phòng ở mig 039: cả hệ hiểu lớp Mâm chỉ bằng việc sửa **một** hàm `open_session_id_for_table()`. Unique index chống race chuyển từ `table_sessions(table_id)` sang `session_tables(table_id) where is_open`, giữ đồng bộ bằng trigger. ⚠️ Postgres KHÔNG có `min(uuid)` — vấp một lần ở `get_sessions_bill` |
| 2026-08-31 | **Tạo quán Bia lẩu Bảo Lương trên prod** (20 bàn, `postpay`, `payment_methods={cash}`, chưa có menu/Zalo App ID) | Anh Tú tạm dừng Pubu nên không muốn test trên đó nữa; cần quán thật để chạy 22 bài nhóm B/D của Sprint 1 + nhóm E/F/G của Sprint 2. `{cash}` khiến đơn mang về/ship bị RPC từ chối — đúng quyết định "pilot chỉ chạy tại bàn". CÒN LẠI (chỉ anh Tú làm được): tạo tài khoản chủ quán ở `/mevo/stores/<id>`, nhập menu, đăng ký Zalo App ID |
| 2026-09-01 | **Tuỳ chọn quyết định giá cho món** (mig 042 bảng `menu_item_variants` + mig 043 vá 2 RPC): mỗi món tối đa MỘT nhóm "chọn loại", chọn đúng 1, **bắt buộc**, giá **tuyệt đối** THAY giá món. Chạy song song topping, không đụng topping. Trigger đồng bộ `menu_items.price` = giá rẻ nhất còn bán → mọi query cũ tự hiện "Từ …đ". `order_items.item_name` ghép sẵn `"Bia hơi (Tháp)"` nên bếp/bill/TTS/Món-đã-gọi chạy đúng không phải sửa. Nhóm "chọn 1 trong N không đổi giá" (cay/không cay) dùng **topping 0đ**, không làm loại nhóm thứ hai. Spec: `docs/superpowers/specs/2026-09-01-menu-item-variants-design.md` | Menu Bảo Lương nhiều món cùng tên khác cỡ khác giá (bia Tháp/Ca/Cốc, đĩa to/nhỏ, bia lon theo hãng) — tách thành món riêng thì menu phình gấp đôi. ⚠️ 4 cái bẫy đã vấp và vá, đừng vấp lại: (1) server đếm **TỔNG** biến thể không lọc `is_available` — đếm bản còn-bán thì món tắt hết lựa chọn rơi về nhánh "món thường" và **bán được ở giá cũ**; client cũng phải có cờ `hasVariantGroup` đếm thô vì `variants` đã lọc; (2) RLS phải dùng `is_store_scoped_operator(store_id)` của **mig 019**, KHÔNG phải `is_operator()` của mig 016 (đã bị 019 thay thế) — dùng nhầm là chủ quán A đọc được menu quán B; (3) `Number('80.000')` ra **80** — phải bỏ dấu ngăn nghìn kiểu VN trước khi parse, không thì giá món mất 1000 lần; (4) ô Giá ở admin phải `readOnly` (KHÔNG `disabled`, submit rỗng → `NaN`) và phải remount theo giá mới, không thì trigger đặt giá 15k xong người dùng bấm Lưu ghi đè ngược 99k |
| 2026-09-01 | **File chứa `CREATE OR REPLACE` một RPC sống phải nằm RIÊNG một migration** (tách 043 khỏi 042) và **KHÔNG được ghi "rerun-safe"** | 042 vốn gộp cả DDL lẫn ảnh chụp nguyên văn `create_order`. Chạy lại 042 sau khi có 044 sửa `create_order` sẽ **âm thầm lùi hàm về bản cũ** — không lỗi, không xung đột. Đúng cái bẫy khiến phải gộp nhánh `feat/postpay-table-session` vào `main` trước khi làm tính năng này (main thiếu mig 039+040, `create_order` trên đĩa là bản 10 tham số trong khi prod chạy bản 12) |
| 2026-09-01 | **Module quản lý tài khoản `/mevo/accounts`** (superadmin): danh sách MỌI tài khoản vận hành nhóm theo quán + đặt lại mật khẩu (superadmin tự gõ, xác nhận 2 ô, KHÔNG hỏi mật khẩu cũ). **KHÔNG có chức năng xoá tài khoản, không tạm khoá, không đổi email** — cố ý. Không migration. Kèm helper `lib/supabase/auth-users.ts` vá lỗi `listUsers()` không phân trang (mặc định 50 user/trang) ở `assignStoreOwner`/`listStoreStaff`. Spec: `docs/superpowers/specs/2026-09-01-mevo-account-management-design.md` | Chủ quán quên mật khẩu thì trước đây KHÔNG có đường cấp lại — form gán chủ quán chỉ sinh mật khẩu tạm lúc tạo mới, email đã tồn tại thì bỏ qua. Bỏ nút xoá để module này không có thao tác nào hỏng dữ liệu vĩnh viễn. Tự gõ mật khẩu vì anh Tú phải đọc qua điện thoại cho chủ quán lớn tuổi |
| 2026-09-03 | **Màn POS thu ngân `/admin/cashier`** (Sprint 1): sơ đồ bàn kéo thả lưu ở `tables.pos_x/pos_y` (toạ độ **ô lưới**, không phải pixel — mig 044), dải "Đơn mới" 15 phút, panel bill dùng lại **nguyên** các server action mig 039/040 (thu tiền, bỏ bàn, ghép mâm, thêm bàn vào mâm, nhập vào mâm, gộp bill, in bill). Chỉ `store_owner` vào được vì nằm trong `/admin` | Chủ quán ngồi quầy cần nhìn cả quán trên máy tính; `/staff/tables` là danh sách dọc mobile-first cho nhân viên chạy bàn. Sprint này **không viết một dòng logic tiền nào** — mọi thao tác tiền gọi lại RPC đang chạy thật, nên rủi ro chỉ nằm ở tầng hiển thị. Logic xếp lưới tách ra `lib/table-layout.ts` (hàm thuần + 15 test) vì kéo thả sai một ô là mất dấu bàn trên sơ đồ. Sprint 2 (sửa bill: huỷ/tặng/thêm món tay, mig 045+046) làm sau khi Sprint 1 PASS |
| 2026-09-04 | **Thu ngân xác nhận đơn rồi in 2 liên** (mig 045: `orders.confirmed_at/confirmed_by`, RPC `pos_confirm_order`, helper `is_store_owner_of`): đơn khách gọi về POS ở trạng thái `pending`, ô bàn **nhấp nháy + chuông**, thu ngân soát món rồi bấm Xác nhận → in **PHIẾU BẾP** (không giá) + **PHIẾU BÀN** (có ô ☐ để nhân viên gạch khi bưng món ra). Chấm trên ô bàn đổi nghĩa: **đỏ = đang có khách, xanh = trống** (mâm chưa gọi món vẫn xanh), logic ở `lib/table-status.ts` dùng chung với `/staff/order`. Màn nhân viên thêm chấm màu + khối "Khách đã gọi N món" | Bia lẩu Bảo Lương **không dùng màn hình bếp**: đơn phải biến thành tờ giấy thì bếp mới làm được, nên "vào bếp" ở quán này = "thu ngân bấm xác nhận". Chấm đỏ cũ (nghĩa "còn món chưa nấu xong") bỏ đi vì không ai cập nhật trạng thái đó → màu sẽ đứng im và nói dối. Gạch món đã bưng ra làm **trên giấy**, không bắt nhân viên rút điện thoại giữa lúc bê đồ. Nhân viên KHÔNG được xác nhận — một cửa duy nhất quyết định đơn nào vào bếp |
| 2026-09-07 | **Sprint 2 POS — sửa bill có audit, không xoá món** (mig 046/047): `order_items.void_type` là `cancelled` hoặc `gift`, kèm người/giờ/lý do; owner dùng RPC để bỏ/tặng/khôi phục. Món thêm tay tạo một order `order_source='pos'` riêng, vào cùng `table_session`, idempotent theo client UUID và **không vào bếp**. Tổng order luôn do `recompute_order_total` tính lại từ snapshot món+topping còn hiệu lực. | UI không được tự tính tổng hay xoá audit; món ghi tay vốn đã phục vụ nên không được đẩy vào bếp/chuông/in bếp. Reader bill loại Khách bỏ, giữ Tặng ở 0đ. |
| 2026-10-02 | **Chốt design system thống nhất (rà 24 màn `docs/design`)**: Hướng 1 "sáng, hai mật độ" — nền slate phẳng, viền mảnh, bóng chỉ cho lớp nổi; màu nhấn là **vai**: POS/admin/staff/`/mevo` dùng cam MEVO `#EA580C`, Mini App giữ `stores.primary_color` runtime. **Font Be Vietnam Pro** toàn hệ (thay Arial admin-web, Roboto mini-app, Inter/Geist trong bản vẽ). Icon lucide. **Màu trạng thái bàn tách khỏi màu nhấn**: xanh lá = đang phục vụ, xanh dương = đã đặt, vàng = chờ duyệt, đỏ = trễ/xung đột, xám = trống — luôn kèm chữ/icon. Quản trị chủ quán giữ **trang riêng `/admin/*` có sidebar** (không làm hộp thoại đè POS như A01–A05). POS chữ nhỏ nhất 13px | Bản vẽ đang có 5 màu nhấn, 4 font, 3 bộ icon, 3 vỏ `/mevo`; cam vừa là CTA vừa là "đã đặt" nên timeline không phân biệt được cái bấm được với trạng thái. **Thay** quy ước đỏ-có-khách/xanh-trống (2026-09-04) và bảng màu trạng thái của design.md 02/10; UI-03 cũ (đỏ/cam/xanh) cũng không dùng |
| 2026-10-02 | **Màu mâm chỉ còn là nhận diện**: vạch trái 4px + chữ "Mâm N", nền ô/khối luôn trắng; bảng màu mâm (`lib/tray-colors.ts`) chỉ còn tím / hồng / chàm / fuchsia. Trạng thái bàn đọc từ MỘT hàm `tableVisualState()` (`lib/table-status.ts`) cho cả POS lẫn màn nhân viên | Bảng màu mâm cũ có xanh lá, xanh dương, teal — trùng đúng màu trạng thái mới, "mâm tô xanh lá" bị đọc thành "đang phục vụ". THAY phần tô nền khối/nút mâm của quyết định 2026-09-02 |
| 2026-10-03 | **POS dựng lại theo bản Stitch P01–P05 thành trang `/admin/pos`, xoá `/admin/cashier`** (POS-1..4 PASS): Timeline theo giờ (mỗi bàn một hàng, thanh phiên ≥80 phút để đọc được tên, đặt bàn = khoảng giữ bàn của server), cột phải "Việc cần xử lý" gộp một danh sách, bill dạng tab + Thanh toán một nút (khoá khi còn lượt chờ duyệt, tiền thối chỉ hiển thị), Tiếp nhận khách đặt bàn, nút "+ Đặt lúc HH:MM" theo bước giờ đặt bàn. Bỏ cảnh báo "Còn N món chưa xong" khi thu tiền. URL cũ chuyển hướng (next.config). Spec `docs/superpowers/specs/2026-10-03-pos-stitch-layout-design.md`, test `docs/testing/pos-stitch/` | Pha 2 (UI-1..5) mới thay lớp da; anh Tú muốn bố cục Stitch. Làm trang mới chạy song song rồi mới xoá trang cũ để không lúc nào mất POS. ⚠️ Thanh đặt bàn trên Timeline = `planning_hold_minutes` (Cài đặt quán → Khoảng giữ bàn kiểm tra trùng) — Bảo Lương đổi 180→120 theo yêu cầu "khoá 2 tiếng". ⚠️ `list_open_table_sessions` KHÔNG trả `confirmed_at` dù kiểu `SessionOrderRow` khai có — đừng lọc theo nó. Quá giờ hẹn là đỏ ngay (không có ân hạn). Phần cần DB (đặt cọc, sức chứa bàn, VietQR, gọi NV 6 loại) hoãn, hỏi riêng |
| 2026-10-03 | **Pha 4 — admin-web giống bản Stitch**: (1) màu trạng thái **tô đặc như Stitch**: xanh lá đang phục vụ · **cam = đã đặt** · vàng chờ duyệt/chờ cọc · đỏ trễ/xung đột · xám trống — bỏ "cam chỉ cho nút"; (2) khu chủ quán = **thanh icon hẹp + hộp thoại tab A01–A05 đè lên POS** — bỏ "trang riêng /admin/* có sidebar"; (3) /mevo = sidebar rộng A06–A11. Spec `docs/superpowers/specs/2026-10-03-stitch-fidelity-design.md` | Anh Tú: POS Pha 3 "không giống màn Stitch đã duyệt, màn kia màu sắc đẹp hơn, màn này ít màu"; muốn thay cả cấu trúc admin web + sidebar cho giống thiết kế. THAY quyết định màu trạng thái và "trang riêng có sidebar" ngày 2026-10-02 |
| 2026-10-03 | **Thu ngân xác nhận đã thu tiền → đơn TỰ HOÀN TẤT** (mig 085): `close_table_session(paid)` (và gộp bill, vì gọi lại hàm này) chuyển mọi đơn chưa huỷ của phiên sang `status='paid'` + `completed_at`. Đã backfill 17 đơn cũ Bảo Lương. Kèm mig 084: hàm chỉ đọc `list_staff_upcoming_reserved_tables` cho màn nhân viên thấy bàn đặt trước + cảnh báo "Vẫn dùng bàn này"; POS báo xung đột từ 60 phút trước giờ hẹn (khớp khung giữ bàn mig 075) | Anh Tú: quy trình lõi — đã thu tiền thì đơn phải hoàn tất. Trước đây đơn đứng mãi ở confirmed/cooking/ready dù bàn đã đóng. `paid` là trạng thái "Hoàn tất" sẵn có (trigger `auto_complete_dine_in` cũng dùng); bảng `orders` KHÔNG có trạng thái `completed` |
| 2026-10-04 | **ST-3: khu chủ quán = hộp thoại cấu hình đè lên POS** (intercepting route `app/admin/@modal/(config)/(.)<tab>`, vỏ hộp thoại ở layout chung + khung chờ). Thanh icon: **ẩn Bếp** khi `kitchen_release_policy='pos_confirmation'` (mô hình Bảo Lương, không có màn bếp); **Đặt bàn rời thanh icon** → ô Thêm + tab đầu hộp thoại. **POS đọc định kỳ thẳng từ trình duyệt** (`lib/pos-browser-reads.ts`), KHÔNG qua server action; `loadOperator` bọc `cache()`; `proxy.ts` bỏ tra role cho request `next-action`/`rsc` | Tab cấu hình load 4–10 giây/kẹt: server action Next xếp CHUNG hàng đợi với điều hướng, POS poll ~1 lần/giây chặn mọi lần chuyển tab. ⚠️ Đừng poll bằng server action trên trang có điều hướng mềm. ⚠️ Client Supabase trình duyệt dùng chung một bản: `channel()` trùng tên trả kênh đang chạy → `.on()` sau `subscribe()` lỗi — kênh nào có thể mở 2 nơi cùng lúc phải thêm hậu tố riêng |
| 2026-10-05 | **Mini App theo Stitch M01–M08 (MA-1..4, nhánh `feat/mini-app-stitch`)** — spec `docs/superpowers/specs/2026-10-05-mini-app-stitch-design.md`. Quán trả sau gọi món xong **sang thẳng tab Đơn gọi** (không qua màn Trạng thái đơn). Nhãn lượt theo `kitchen_release_policy`: quán `pos_confirmation` chỉ có **Chờ xác nhận → Đã vào bếp**. Gọi NV chặn **3 phút** ở server (mig 087). **Lượt bị thu ngân từ chối vẫn hiện** ở Mini App (mig 088 `get_table_session_bill`) và tab Lịch sử POS (mig 089 trường RIÊNG `rejected_orders`, không đụng `orders`/total) để đối chứng. **Số "Lượt #NN" một quy tắc cho POS + Mini App**: chỉ lượt khách/nhân viên, tính cả lượt bị từ chối; ghi tay / đặt trước không mang số | Quán nhậu gọi nhiều lượt — màn chờ một đơn khiến khách không biết làm gì tiếp. ⚠️ Đơn `order_source='pos'` / `reservation_preorder` nằm `pending` MÃI (không ai xác nhận) — mọi chỗ đếm "chờ duyệt" phải loại chúng như `isReviewableOrder`. ⚠️ Mini App vitest chỉ chạy node: hàm thuần tách ra `src/utils/` để test |
| 2026-10-05 | **Lối vào thường của Mini App: MỘT tab "Đặt bàn" thông minh** thay hai tab Đặt bàn + Đơn của tôi (quán chỉ xem menu: Trang chủ · Đặt bàn). Trang `/reservations` tự chia: đang có lịch hẹn (`pending`/`confirmed`) → thẻ lịch hẹn + nút phụ "Đặt thêm bàn khác"; chưa có → form ngay; lượt đã xong → "Lịch sử đặt bàn" thu gọn (`utils/booking-groups.ts`). Quán có mang về vẫn giữ tab "Đơn của tôi" cho đơn mang về | Anh Tú: tab Đặt bàn luôn mở form trống khiến khách đã đặt rồi lại đặt tiếp hoặc tưởng lần trước chưa đặt được; tab Đơn của tôi chỉ để xem lại — hai tab trùng chức năng |
| 2026-10-08 | **PA-1 PASS — Báo cáo ngày theo bill + chuông theo quán** (mig 091 `stores.bell_style`, mig 092 RPC `get_daily_report`). Nút ⚙ Cài đặt tách khỏi ô Thêm. Kiểu chuông theo QUÁN (double/soft/repeat), âm lượng theo MÁY (localStorage `mevo_bell_volume`). Báo cáo: tiền thật nhận trong ngày giờ VN, tách TM/CK/ví-khác, bill gộp N mâm = MỘT dòng, khối Điều chỉnh bill nhãn **Bỏ / Tặng** (không ghi "Khách bỏ" — lý do bỏ có thể từ bếp). Spec `docs/superpowers/specs/2026-10-07-pos-admin-complete-design.md`, test `docs/testing/pos-admin-complete/PA-1.md` | Cuối ngày thu ngân không đối chiếu được két. ⚠️ Gom bill theo `closed_by@closed_at` CHỈ khi `close_reason='paid'`: job hết hạn đóng nhiều phiên cùng `now()` sẽ gộp nhầm. ⚠️ Kiểu `repeat` phải gọi `stopBell()` khi hàng việc rỗng ở MỌI màn có chuông; nhắc đặt bàn dùng `ringBellOnce` |
| 2026-10-08 | **PA-2 PASS — vai trò Thu ngân `store_cashier`** (mig 093): hàm `is_store_pos_operator` = chủ quán HOẶC thu ngân; 16 RPC POS/đặt bàn/báo cáo chuyển sang hàm này; RPC `set_menu_item_available` cho bật/tắt Tạm hết. Thu ngân làm mọi việc ở quầy (duyệt, in, thu tiền, mâm, bỏ/tặng món có lý do, đặt bàn, báo cáo), KHÔNG sửa menu/giá/bàn/sơ đồ/cài đặt/nhân viên/ưu đãi. Luật vai trò ở MỘT chỗ `admin-web/lib/auth/roles.ts` (middleware, đăng nhập, guard trang, nav). Kèm vá 2 lỗ hổng có sẵn: `cancelOrder` không kiểm quyền, link bếp chỉ kiểm "có operator". Plan `docs/superpowers/plans/2026-10-08-pa2-cashier-role.md`, test `docs/testing/pos-admin-complete/PA-2.md` | Chủ quán không phải đưa mật khẩu chủ quán cho người ngồi quầy. ⚠️ **Sửa hàm SQL đang chạy: vá tại chỗ** bằng `pg_get_functiondef` + `replace` + `EXECUTE` (helper `pg_temp`, raise nếu không còn chuỗi cần vá) — không chép thân hàm từ file cũ. ⚠️ `is_store_owner_of` GIỮ nghĩa "chỉ chủ quán"; quyền cấu hình dùng `is_store_owner_or_admin`/service-role. ⚠️ Server action dùng `createAdminClient` bỏ qua RLS → PHẢI tự kiểm quyền + lọc `store_id` (proxy bỏ qua request next-action) |
| 2026-10-08 | **PA-3 PASS — Bàn & QR theo khu** (mig 094 `table_areas.color`): 5 màu khu **pastel** (violet/indigo/purple/fuchsia/pink, chấm/vạch -300, nền -50) — chỉ nhận diện, KHÔNG dùng màu trạng thái; tab Sơ đồ bàn & QR nhóm theo khu + Tuỳ chỉnh khu (đổi tên/màu, xoá khi trống) + in QR hàng loạt A4 3×4 ở `/print/table-qr` (cả quán / khu / bàn); POS tô tiêu đề khu theo màu khu. Tab "Chưa phân khu" trên sơ đồ POS chỉ hiện khi còn bàn chưa có khu (`areaTabs` trong `lib/area-layout.ts`). Plan `docs/superpowers/plans/2026-10-08-pa3-tables-areas-qr.md`, test `docs/testing/pos-admin-complete/PA-3.md` | ⚠️ Trang in nhiều trang PHẢI nằm ngoài khung `/admin` (main overflow-auto + h-dvh overflow-hidden → Chrome không chia trang). ⚠️ Danh sách giữ trong state cho cập nhật lạc quan phải có `key` theo dữ liệu server, không thì `router.refresh()` không hiện bản ghi mới |
| 2026-10-09 | **PA-4 PASS — Thực đơn: tìm/lọc + mã món + nhãn** (mig 095 `menu_categories.sku_prefix`, `menu_items.sku/badge` + trigger tự sinh `PREFIX-001`; mig 096 chỉ đếm đuôi 1–6 chữ số). Tiền tố tự sinh từ chữ đầu tên danh mục (bỏ dấu), trùng thì thêm số; mã gõ tay giữ nguyên; đổi danh mục/tiền tố KHÔNG đổi mã cũ. Nhãn `best_seller`/`signature` hiện ở admin + Mini App (theo màu quán), khách không thấy mã. Thu ngân tìm món Tạm hết theo mã. Plan `docs/superpowers/plans/2026-10-08-pa4-menu-search-sku-badge.md`, test `docs/testing/pos-admin-complete/PA-4.md` | Menu Bảo Lương 65+ món, thu ngân cần tìm nhanh và gọi tên món thống nhất. ⚠️ Server action thêm/sửa có lỗi người dùng phải **TRẢ `{ok,error}`, không ném** — Next prod giấu nội dung lỗi ném. ⚠️ Form React 19 dùng `action` tự reset sau khi chạy xong, kể cả khi báo lỗi → form cần giữ chữ đang gõ thì dùng `onSubmit` + `preventDefault` |
| 2026-10-09 | **PA-5 PASS — In ấn** (không migration): phiếu bàn 80mm (`print-order`, cả nhánh đặt trước `?job=`) in **địa chỉ quán** dưới tên, trước SĐT; phiếu bếp KHÔNG in. Nút **In thử** ở Cài đặt quán → khối In ấn → `/print/test-slip` (chỉ chủ quán, chỉ đọc `stores`, dùng lại `PrintBill` với `testMode`: tiêu đề "PHIẾU IN THỬ", 2 món mẫu, chân phiếu "Không phải hoá đơn — không tạo đơn"). Địa chỉ/SĐT rỗng hoặc toàn dấu cách thì bỏ hẳn dòng (`lib/print/store-lines.ts`). Khép lại loạt PA-1..5. Plan `docs/superpowers/plans/2026-10-09-pa5-print-address-test-slip.md`, test `docs/testing/pos-admin-complete/PA-5.md` | Hoá đơn thanh toán vốn đã có địa chỉ (`get_sessions_bill`), chỉ phiếu bàn thiếu. In thử để chủ quán canh máy in mà không phải tạo đơn giả rồi huỷ. Giờ "In lúc" trên phiếu in thật đã kiểm: đúng giờ VN, không lệch |
| 2026-10-09 | **Sửa lặt vặt /staff + POS (Đợt 1+2 PASS, mig 097–099)**: chuông "Gọi nhân viên" ở MỌI tab `/staff` (chạm thẻ = đã xử lý); màn chọn bàn / Ghép mâm của nhân viên chia theo khu (mig 097 cho `store_staff` đọc `table_areas`); quán trả sau bỏ bước chọn TM/CK khi nhân viên gửi đơn; phiên hết hạn còn nợ gom xuống mục gập cuối tab Bàn. POS: gộp bill thu xong tự thoát chế độ gộp; nhãn **Chủ quán / Thu ngân**; nút **Số lượng** cạnh Tặng/Bỏ (mig 098: bảng `order_item_quantity_changes`, RPC `pos_set_order_item_quantity`, lý do bắt buộc, ≥1); tạm tính/hoá đơn in cả dòng Bỏ/Tặng 0đ kèm lý do + mục "Điều chỉnh số lượng"; nút **Khách lẻ** (mig 099 `pos_walk_in_order`: mở phiên + ghi món tay trong MỘT giao dịch, KHÔNG vào bếp). Kèm: Gộp bill dời xuống hàng "Về Bây giờ" của Timeline; tab Đơn gọi Mini App chỉ còn tổng tạm tính ở thẻ đầu. Plan `docs/superpowers/plans/2026-10-09-staff-pos-fixes.md`, test `docs/testing/staff-pos-fixes/` | Phiên "hết hạn sau 6 giờ" còn hiện là CỐ Ý (job đóng phiên không được nuốt tiền chưa thu) — 9 phiên test cũ đã dọn bằng tay. ⚠️ Khách lẻ không được tách "mở phiên" rồi mới "chọn món": bỏ ngang sẽ để lại phiên rỗng 0đ giữ bàn. ⚠️ Nhân viên gửi đơn trả sau ghi `payment_method='cash'` chỉ là giữ chỗ — phương tiện thật là `payment_instrument` thu ngân chọn lúc thu, báo cáo đọc trường đó |
| 2026-10-11 | **Gộp Ưu đãi + Vòng quay thành MỘT trang `/admin/vouchers` ("Ưu đãi & Vòng quay"), xoá `/admin/spin`** (kèm route `@modal/(.)spin`; `next.config` chuyển hướng `/admin/spin` → `/admin/vouchers`). Desktop: bảng mã giảm giá bên trái, cấu hình vòng quay bên phải (xếp dọc khi khung hẹp, container query). Cùng đợt chỉnh desktop: Đặt bàn dạng danh sách (nút cuối dòng), Nhân viên dạng bảng + tìm/lọc 1 hàng + **đặt lại mật khẩu** (`resetStaffPassword`, chỉ phục vụ/thu ngân đúng quán), Tài khoản 2 cột. Không migration | Hai trang cùng là "cấu hình ưu đãi cho khách", tách ra chỉ tốn một tab. ⚠️ Server action có lỗi người dùng phải TRẢ `{ok,error}` (account, resetStaffPassword) — Next prod giấu nội dung lỗi ném. ⚠️ Nhân viên: không có xoá vĩnh viễn, "Vô hiệu hoá" là đường duy nhất (giữ lịch sử bill) |
| 2026-10-09 | **Trang Tài khoản Mini App = hồ sơ + quyền riêng tư** (ACC-1): tên/ảnh Zalo (chỉ đọc khi đã cho quyền), **SĐT thật từ Zalo** qua edge function `zalo-phone` (đổi token bằng `store_zalo_configs.zalo_app_secret_key`, **KHÔNG ghi DB, không log số**), dự phòng nhập tay. Hồ sơ dùng lại `ReservationProfile` trên máy. "Xoá thông tin cá nhân" = `clearPersonalData()` — CỐ Ý giữ `mevo_reservation_access*`, `mevo_device_id`, `mevo_cart`. Spec `docs/superpowers/specs/2026-10-09-mini-app-account-page-design.md` | Khách gõ lại SĐT mỗi lần đặt bàn; giữ dữ liệu cá nhân ngoài server để không phải lo RLS/xoá phía server. ⚠️ Quyền SĐT phải xin RIÊNG từng app ở console Zalo Mini App (quyền #100, kèm ảnh + lý do) — quán chưa được duyệt thì nút Zalo rơi về nhập tay. ⚠️ Token `getPhoneNumber` dùng 1 lần, hết hạn 2 phút — không cache |
| 2026-10-12 | **In ngầm + trang in tách khỏi khung** (không migration): `printInPlace()` nạp trang in vào iframe ẩn thay `window.open`; trang in dời ra `/print/bill` (hoá đơn) và `/print/order` (phiếu bếp + phiếu bàn), URL cũ `/staff/tables/print`, `/admin/pos/print-order` chuyển hướng. **Phiếu bàn thật ngắn** (tên quán, bàn, món ☐, lần này + cả bàn, `mevo.vn`) — bỏ địa chỉ/SĐT/lời dặn (THAY quyết định PA-5 in địa chỉ trên phiếu bàn); **hoá đơn thanh toán** có thêm thời gian ngồi, tổng số món, và chân phiếu giới thiệu MEVO + `mevo.vn` (KHÔNG in logo — anh Tú bỏ cùng ngày); phiếu bếp KHÔNG quảng cáo. | Trang in nằm trong khung /staff nên in ra cả thanh tên quán + nav, và nạp iframe sẽ dựng thêm cả khung (realtime, chuông). Phiếu bàn đưa tận tay khách nên phải gọn; địa chỉ/SĐT chỉ cần ở hoá đơn |
| 2026-10-13 | **A04 "Hoá đơn & Báo cáo" (`/admin/bills`, bản Stitch A04) THAY trang Đơn hàng + Báo cáo ngày** (A04-1..4, mig 100 + 100b `get_bills_report`, chỉ đọc). Báo cáo theo **NGÀY** giờ VN (ca làm việc để sau). 4 thẻ · chip Tất cả / Đã thanh toán / Đã huỷ-giảm trừ / Chờ thu · tìm không dấu · bảng + cột Lịch sử điều chỉnh (Bỏ / Tặng / **Sửa số lượng**) · ngăn kéo **Xem bill** · **Xuất Excel** (`exceljs`, `/admin/bills/export`) · **In báo cáo cuối ngày** 80mm (`/print/day-report`). Cột Khách lấy từ đặt bàn (`reservations.session_id`). URL cũ chuyển hướng (next.config). Spec `docs/superpowers/specs/2026-10-12-a04-bills-report-design.md`, test `docs/testing/a04-bills-report/` | Hai trang cũ trùng chức năng, bản A04 trực quan hơn. ⚠️ **Bàn trả sau thu CẢ BÀN một lần** (anh Tú): nút "Đã nhận tiền" trong ngăn kéo gọi `close_table_session` như POS → Thanh toán; lượt thuộc phiên KHÔNG còn nút thu/hoàn tất từng lượt (tạo bàn "thu một nửa": đơn có tiền mà phiên vẫn mở). Đơn không phiên (trả trước/mang về) giữ nút từng đơn. ⚠️ Gom bill theo **giờ nhận tiền của phiên**, KHÔNG theo `closed_at` (092 gộp nhầm các phiên hết-hạn-rồi-thu-riêng vì `closed_at = COALESCE(closed_at, now())`). ⚠️ Phiên **hết hạn còn nợ** nằm trong Chờ thu ngày mở phiên (092 bỏ sót). **Số hoá đơn thật HOÃN** — mã hiện là `#XXXXXX` rút gọn từ ID; plan để sẵn `docs/superpowers/plans/2026-10-12-a04-1-bill-numbers.md` (lưu ý: POS in tạm tính TRƯỚC khi thu nên tờ khách cầm sẽ không có số). `get_daily_report` (092) đã DROP ở mig 102 |
| 2026-10-13 | **Khoá màn hình POS bằng PIN 4 số + thanh icon dọc thay ô "Thêm"** (không migration). Nút ổ khoá cạnh nút loa: lần đầu đặt mã (nhập 2 lần) rồi khoá, lần sau bấm là khoá; màn khoá đè MỌI trang `/admin` (`<dialog>` top layer, nền là POS làm mờ), sai 5 lần chờ 30 giây, "Quên mã PIN" = đăng xuất + xoá mã. Bật/tắt + đổi mã ở tab **Bảo mật** (đổi tên từ Tài khoản). Mã lưu **localStorage theo máy + theo tài khoản** (`components/pos-lock.tsx`, `lib/pos-lock.ts`). Rail chủ quán: POS · Bếp · Đặt bàn · Món · Bàn QR · Báo cáo; chân rail ⚙ Cài đặt (tab: Cài đặt chung · Nhân viên · Ưu đãi & Vòng quay · Bảo mật) + nút Đăng xuất. Thu ngân: POS · Món · Báo cáo, ⚙ = Bảo mật của mình. Hộp thoại cấu hình chừa rail (`md:left-[76px]`) để bấm icon chuyển mục | Khoá khi rời quầy, mất mạng vẫn mở được. ⚠️ PIN là khoá chống bấm bậy, KHÔNG phải ranh giới bảo mật (phiên đăng nhập vẫn còn phía sau). ⚠️ `<Dialog>` dùng chung giữ con khi đóng — thứ nghe phím trên cả cửa sổ (bàn phím PIN) chỉ được gắn khi đang mở, không thì nuốt chữ số gõ ở ô tiền POS |
| 2026-10-13 | **Trang Đặt bàn làm lại (phương án B, qua wireframe)** + mig 103: trái là MỘT bảng phẳng việc cần làm + lịch 7 ngày tới (nút chỉ icon, nút đầu đặc = việc chính), phải là cột "Đã qua" 7/30/90 ngày (ô số + thanh tỉ lệ Hoàn tất / Không đến / Huỷ + lượt gần đây). Bỏ lọc ngày. Mig 103: `list_reservation_queue` trả thêm `session_closed` (vá tại chỗ), RPC chỉ đọc `list_reservation_history` | Lượt "đã đến" kẹt mãi vì `close_table_session` chỉ chuyển → completed khi đóng `paid` (mig 056); Bỏ bàn / hết hạn để lại `arrived` (prod có 7 lượt). Quyết định: **đã đến + bill đã đóng = xong** ở tầng hiển thị, KHÔNG đổi status trong DB (giữ nguyên ý mig 056). "Khách đã đến" chỉ đếm khách của lượt hoàn tất |
| 2026-11-02 | **Chuyển bàn (mig 104+105, nhánh `feat/chuyen-ban-giam-gia-bill`)**: thu ngân/chủ quán đổi một bàn đang có khách sang **bàn trống** ngay tại bill POS ("Thao tác khác"). Đổi `session_tables` **tại chỗ** (cùng phiên, cùng bill, đơn + yêu cầu gọi NV chưa xử lý theo sang bàn mới) + nhật ký `table_session_moves` (hiện ở ngăn Xem bill A04). **Chặn bàn đích đang trong khung giữ đặt bàn**; bàn có lịch muộn hơn trong ngày thì hỏi xác nhận kèm giờ hẹn. Helper `moved_session_for_caller()` (khớp chủ phiên hoặc Zalo UID / `orders.device_id` có đơn trong mâm mở) dùng ở **3 RPC**: `get_table_session_state` (trả state `moved`), `create_table_order_batch`, `create_order` | Khách vẫn cầm điện thoại ở bàn cũ: không có lớp chuyển hướng thì gọi tiếp sẽ mở phiên MỚI ở bàn cũ = "bill ma" tách khỏi bill thật. ⚠️ `create_order` chuyển hướng cả khi bàn cũ đã có khách mới (cùng thứ tự ưu tiên với `get_table_session_state`) và kiểm lại SAU khi giữ khoá bàn, báo 'Bàn vừa được chuyển, vui lòng thử lại' nếu bị chuyển giữa chừng. Chỉ `create_order` ghi `orders.device_id` (`staff_create_order` không có máy khách nên không vá). ⚠️ Giới hạn chấp nhận: người trong nhóm chưa gọi món lần nào và không phải chủ phiên mở lại QR bàn cũ thì thấy bàn trống. App cũ chưa `zmp deploy` vẫn ra bill đúng nhờ server chuyển hướng nhưng tab Đơn gọi chưa hiện bill. Spec `docs/superpowers/specs/2026-11-02-chuyen-ban-giam-gia-bill-design.md`, test `docs/testing/chuyen-ban-giam-gia/CB-1.md` |
| 2026-11-03 | **Chuyển cả mâm sang MỘT bàn (mig 106, nhánh `feat/chuyen-ban-giam-gia-bill`)**: CB-1 PASS. RPC `pos_move_session_to_table` dồn mâm N bàn → 1 bàn trống trong một giao dịch: **XOÁ** các dòng `session_tables` thừa (phiên chỉ còn 1 bàn), `is_open_ordering` giữ nguyên (vẫn là mâm mở), đơn + bàn gốc phiên theo sang bàn mới, yêu cầu gọi NV chưa xử lý dồn về 1 bàn (mỗi loại giữ bản mới nhất, bản trùng đánh dấu đã xử lý). Nhật ký `table_session_moves` ghi **MỘT dòng cho MỖI bàn cũ** cùng trỏ về đích → redirect mig 104/105 (`moved_session_for_caller`) chạy nguyên không sửa; A04 hiện mỗi bàn cũ một dòng. Chặn đích đang có khách / đang trong khung giữ đặt bàn. **Xác nhận trên POS (chuyển bàn có lịch muộn, Bỏ bàn) dùng hộp thoại trong app `ConfirmDialog`, không còn `window.confirm`** | Mâm đoàn dọn về một bàn thì không nên để lại các dòng bàn ma. Tách mig riêng (chỉ hàm MỚI, không `CREATE OR REPLACE` đè RPC sống). Hộp thoại trình duyệt/Windows lạc tông với POS và bị trình duyệt chặn được. Còn `window.confirm` ở chỗ khác (bỏ/tặng món, đặt bàn "không đến") — chưa đổi. Test `docs/testing/chuyen-ban-giam-gia/CB-2.md`, SQL `docs/testing/chuyen-ban-giam-gia/sql/cb2-verify.sql` ⚠️ Sau khi chuyển cả mâm về một bàn, `is_open_ordering` vẫn true nhưng POS hiện như bàn lẻ bình thường (không còn màu/nhãn mâm) vì mâm = từ 2 bàn trở lên (`assignTrayColors`). |
| 2026-11-03 | **Giảm giá hoá đơn VNĐ/% (mig 107+108, nhánh `feat/chuyen-ban-giam-gia-bill`)**: thu ngân/chủ quán đặt giảm giá ở màn Thanh toán POS. **Ý định** (loại + giá trị) lưu trên `table_sessions`; lúc `close_table_session(paid)` mới **chia vào `orders.bill_discount_amount` và trừ khỏi `orders.total_amount`** → doanh thu, A04, Excel, in báo cáo tự đúng (= tiền thật đã nhận), `recompute_order_total` không cộng ngược. Gộp bill: một giảm giá chung chia về từng mâm theo tỉ lệ tiền hàng chưa thu. **Không có ô lý do** (như KiotViet). Phiên hết hạn (còn nợ) bỏ qua giảm giá (RPC báo 'Phiên đã đóng'); nhập mâm (`merge`) **xoá** giảm giá của phiên nguồn (POS hỏi xác nhận trước, đặt lại ở mâm đích). Phần dư khi chia không bao giờ vượt tiền hàng của từng phần; công thức TS `admin-web/lib/bill-discount.ts` **==** SQL mig 107/108 (đổi một bên phải đổi cả hai). Giảm VNĐ > tiền hàng (vd. bỏ món sau khi đặt giảm) → POS khoá nút thu + in tạm tính cho tới khi sửa. Mini App tab Đơn gọi hiện 'Giảm giá' + 'Tạm tính sau giảm'; A04 'Chờ thu' của bill còn mở là tạm tính TRƯỚC giảm (cố ý) | Chủ quán cần bớt tiền cho khách quen/đoàn đông mà không phải sửa giá món hay tặng từng món. Lưu ý định thay vì số tiền để khách gọi thêm / bỏ món thì số giảm % tự đi theo, không lệch. ⚠️ Mig 107/108 đã áp prod SAU mig 109 của nhánh khác (không đụng nhau, thứ tự không ảnh hưởng). ⚠️ Bàn đã thu tiền một phần (đơn trả trước) chỉ giảm trên phần CHƯA thu. Test `docs/testing/chuyen-ban-giam-gia/GG-1.md`, SQL `docs/testing/chuyen-ban-giam-gia/sql/gg-verify.sql` |
| 2026-11-03 | **Chặn thu lẻ từng lượt của bàn trả sau ở server + khoá 2 hàm nội bộ (mig 110)**: `confirm_manual_payment` và `kitchen_confirm_payment` (hai hàm DUY NHẤT ngoài `close_table_session` ghi `payment_received_at`) từ chối đơn thuộc phiên bàn còn phải thu (đang mở, hoặc hết hạn còn nợ): 'Bàn trả sau thu cả bàn một lần ở POS (Thanh toán)'. Thu phiên vẫn qua `close_table_session(s_bulk)`. Kèm REVOKE EXECUTE `recompute_order_total(uuid)` + `add_order_line(uuid,uuid,jsonb)` khỏi PUBLIC/anon/authenticated (mọi caller là SECURITY DEFINER của postgres). Trang in (`PrintBill`) báo lỗi thay vì in khi giảm giá > tiền hàng | Review đợt GG: bill có lượt đã thu lẻ trước thì phiếu in "Khách cần trả" cao hơn số POS thu (POS tính trên phần chưa thu) — kể cả khi không giảm giá. Quy tắc "bàn trả sau thu cả bàn một lần" đã chốt từ 2026-10-13 nhưng server còn đường thu lẻ (prod: 6 đơn / 4 phiên đã đóng, lần cuối 2026-10-13). ⚠️ Hai hàm nội bộ trên từ mig 046 đã cho **anon** gọi thẳng (bẫy default privileges: `REVOKE … FROM PUBLIC` KHÔNG gỡ quyền cấp thẳng cho anon/authenticated) → ai có khoá công khai cũng thêm món / tính lại tiền đơn bất kỳ được. Hàm nội bộ mới luôn `REVOKE … FROM PUBLIC, anon, authenticated`. Còn lại: owner vẫn UPDATE thẳng được `orders.payment_received_at` qua RLS `auth_update_orders` (không có UI) — trigger mới đóng hẳn |
| 2026-11-03 | **Đặt bàn mới từ POS: bỏ ô "Lý do tạo tay", chọn bàn ngay trong form** (nhánh `feat/pos-dat-ban-chon-ban`, mig 109). Lý do ghi cố định `Thu ngân tạo tại POS` (RPC `create_manual_reservation` vẫn bắt lý do — trang `/admin/reservations` vẫn hỏi). Nút "+ Đặt lúc" trên Timeline chọn sẵn bàn đó; chọn bàn → tạo xong giữ luôn, không chọn → "Chưa xếp bàn". **Mig 109**: `assign_reservation_tables` chỉ chặn bàn đang có khách khi khung giữ bàn đã bắt đầu (giờ hẹn − 60 phút ≤ bây giờ); nút "+ Đặt lúc" của bàn đang có khách lùi tới ≥ bây giờ + 70 phút | Bàn đang có khách bấm "+ Đặt lúc" thì server từ chối giữ bàn ("Bàn đang có khách") dù giờ hẹn còn xa → đặt bàn rơi về "Chưa xếp bàn", thu ngân phải xác nhận lại lần hai. ⚠️ Form chặn trước khi tạo nếu bàn đã chọn bị khoá theo giờ mới — để server từ chối thì đặt bàn đã tạo mất bàn |
| 2026-11-04 | **Baseline `103b_baseline_prod_drift.sql`: DB dựng mới từ `supabase/migrations/*` chạy thông 119 file, khớp prod.** `CREATE OR REPLACE` 36 hàm về bản prod ngay TRƯỚC mig 104 (13 hàm bị vá ở 105/108/109/110 lấy bản trước vá; 23 hàm còn lại lấy bản prod) + bật RLS `reservation_customer_call_tasks`. ⛔ **KHÔNG áp lên prod**: sẽ lùi hàm về bản cũ, nên file tự RAISE nếu đã có `table_session_moves`. Đã replay trên `supabase/postgres:17.6.1.178` cả bản LF lẫn CRLF: 151 hàm (trừ `rls_auto_enable` của nền tảng) khớp md5 prod sau khi bỏ `\r`, 9 nhóm cấu trúc (cột, ràng buộc, index, policy, trigger, RLS, quyền bảng/hàm, publication) khớp hoàn toàn | Mig 105/108/110 vá tại chỗ bằng chuỗi neo chép từ prod, mà thân hàm prod khác file cũ (nhiều lần áp lên prod đã lược comment, gộp dòng) nên DB mới RAISE ở 105. So sau khi bỏ comment + khoảng trắng thì không hàm nào lệch logic, trừ `create_tray_session` (repo ghi `closed_by = NULL`, kết quả như nhau). ⚠️ Áp migration lên prod phải áp NGUYÊN VĂN file, lược comment/gộp dòng là lệch lại. ⚠️ File là `-text` trong `.gitattributes`: `get_sessions_bill`, `recompute_order_total` lẫn CRLF và mig 108 neo vào đúng byte đó. ⚠️ `supabase db reset`/`db push` BỎ QUA `103b_` (như 7 file `006b_`, `007a_`...: tên phải khớp `^[0-9]+_`), số 002/017 trùng, repo không có `config.toml`: dựng DB = chạy psql từng file theo thứ tự `LC_ALL=C` |
| 2026-11-05 | **In hai nơi (Đợt 1 mục C, Part 1, mig 114)**: quán bật `store_workflow_settings.print_mode='agent'` thì phiếu bếp ra máy in bếp, phiếu quầy ra máy in quầy qua MỘT phần mềm in Electron (`print-agent/`) cài ở quầy; mặc định `browser` in như cũ. Bảng `print_stations` (mỗi quán 1 trạm `is_pos` + 1 `is_default_kitchen`, danh mục gán trạm qua `menu_categories.print_station_id`), `print_jobs` (hàng đợi, khoá chống trùng `(store_id, dedupe_key)`), `print_agents` (1 máy sống/quán, DB chỉ giữ hash token + hash mã ghép). Lớp `lib/print/`: `printDocument(req)` ở client (mode nhớ 60 giây, đọc bằng RPC trình duyệt), `enqueuePrint` ở server chia phiếu theo trạm; trang `/print/agent/<jobId>?t=<token>` vẽ phiếu bằng JWT 120 giây mang danh người tạo phiếu. Phiếu chế biến BỎ giá CHỈ ở chế độ `agent` (chế độ trình duyệt giữ hai liên cùng có giá, quyết định 2026-09-23). Spec `docs/superpowers/specs/2026-11-05-dot1-thanh-toan-ca-in-vietqr-design.md`, plan `docs/superpowers/plans/2026-11-05-dot1-c-in-hai-noi.md`, test `docs/testing/dot1/C-part1-in-hai-noi.md` | Quán nhậu cần phiếu bếp ra đúng bếp (nướng, bar…) và phiếu quầy ra quầy; trình duyệt chỉ in được ra một máy mặc định. **Phần mềm nói chuyện với server bằng RPC, KHÔNG dùng edge function**: hỏi việc 2 giây/lần = ~1,3 triệu lượt/tháng/quán, edge function tính theo lượt + trễ khởi động, mà nhận việc phải nguyên tử (`FOR UPDATE SKIP LOCKED`) vốn nằm trong DB; RPC `SECURITY DEFINER` gọi bằng khoá công khai, nhận token thiết bị, tự băm đối chiếu. **JWT 120 giây thay vì vá các RPC in**: mọi RPC in kiểm quyền bằng `auth.uid()` nên service role bị từ chối; ký JWT `sub = print_jobs.created_by` (cùng cách `lib/kitchen-token.ts`) để phiếu tự nhận mọi thay đổi của RPC. Hết hạn job làm kiểu lười trong `expire_print_jobs` vì prod không có `pg_cron`. ⚠️ `webContents.print()` thành công chưa phải đã ra giấy (máy rút dây vẫn nhận việc vào hàng đợi Windows, in muộn hàng giờ sau) → thử máy thật `C-0-may-in-that.md` là cổng của Part 2. ⚠️ Job `printing` quá 2 phút KẸT thành `failed` 'Không rõ đã in chưa', KHÔNG tự in lại (tự in lại sẽ ra hai phiếu); người bấm 'In lại' quyết định. ⚠️ Phần mềm in chỉ chạy khi CẢ HAI policy xuống bếp là `pos_confirmation` (trigger DB chặn hai chiều; đơn `automatic` không qua nút 'Duyệt & in bếp' sẽ mất phiếu); form quy trình khoá hai ô khi `agent` vì action ném lỗi mà Next production giấu nội dung. ⚠️ Trạm bị xoá làm `station_id` của job đang chờ thành NULL → poll/retry tra trạm thay thế (phiếu bếp → bếp mặc định, loại khác → Quầy). ⚠️ `INSERT … ON CONFLICT DO UPDATE` chạy trigger BEFORE INSERT với giá trị mặc định trước khi phát hiện trùng → `set_print_mode` UPDATE trước, INSERT sau. Part 1 CHƯA đổi nơi gọi in của POS/staff/báo cáo (Part 2) nên bật `agent` thì POS vẫn in trình duyệt |
| 2026-11-06 | **Ngày kinh doanh theo quán (mig 111, nhánh `feat/dot1-ngay-kd`)**: cột `store_workflow_settings.business_day_start` (00:00–12:00, bước 30 phút, mặc định 00:00 nên quán không đổi gì thì số như cũ). Ngày D chạy từ D + giờ bắt đầu tới đúng 24 giờ sau, giao dịch đúng giờ bắt đầu thuộc ngày mới. A04, Excel, phiếu cuối ngày cắt theo mốc này qua `get_bills_report` (trả thêm `day_from`, `day_to`); ngày không lưu vào giao dịch nên đổi giờ thì báo cáo cũ tính lại. Ghi bằng **RPC riêng `set_business_day_start`** (chỉ chủ quán/MEVO, có nhật ký), KHÔNG thêm khoá vào `update_store_workflow_settings`. Đọc giờ **thẳng bảng `store_workflow_settings` bằng service key** (`loadBusinessDayStart`, `storeId` lấy từ operator đã kiểm quyền), KHÔNG qua `get_public_store_workflow` vì hàm public lọc `is_active = true`: quán onboard chưa bật sẽ luôn đọc ra 00:00 trong khi `get_bills_report` cắt theo giờ thật. Timeline, đặt bàn, giờ phục vụ, `get_daily_revenue` không đổi. Spec `docs/superpowers/specs/2026-11-05-dot1-thanh-toan-ca-in-vietqr-design.md` §4, test `docs/testing/dot1/B1-ngay-kinh-doanh.md` | Quán nhậu bán qua nửa đêm: bill 1 giờ sáng phải vào ngày hôm trước để cuối ca đối chiếu đúng két. RPC riêng vì `update_store_workflow_settings` bắt đủ 19 khoá và từ chối khoá lạ: thêm khoá thì Vercel cũ lỗi "Thiếu cấu hình bắt buộc", Vercel mới chạy trước migration lỗi "Cấu hình không hỗ trợ". Đọc bằng service key vì thu ngân mở A04 mà `get_store_workflow_settings` và RLS của bảng chỉ cho chủ quán + superadmin. ⚠️ `businessToday` (`lib/daily-report.ts`) phải khớp `business_date_of` (mig 111), đổi một bên phải đổi cả hai. ⚠️ `?date=` kẹp về ngày kinh doanh, không phải ngày lịch: dùng `resolveReportDay`, đừng tự tính "hôm nay" ở trang báo cáo |
| 2026-11-09 | **Tạo bàn hàng loạt + in tự động cho đơn tự vào bếp (mig 121)** — **THAY** ghi chú 2026-11-05 "chế độ phần mềm in cần cả hai policy xuống bếp là `pos_confirmation`" (trigger 114 chặn hai chiều, nay đã gỡ): mig 121 gỡ trigger `print_mode_policy_guard` (114) nên "Nhiều nơi" sống chung được với policy xuống bếp `automatic`; Cài đặt bỏ các ô khoá, chỉ hiện ghi chú "giữ POS mở". POS tự in phiếu bếp cho đơn trong phiên bàn (quán trả sau): hook `useAutoKitchenPrint` → server action `enqueueAutoKitchenPrints` → `enqueuePrint`, khoá chống trùng sẵn có chống in đôi (hai tab POS vẫn một bộ phiếu). Chỉ in đơn vào bếp trong 30 phút theo giờ SERVER; POS đóng thì không in. Hộp thoại "Tạo nhiều bàn" ở `/admin/tables` (`addTablesBulk`, tối đa 100 bàn một lần). Checklist `docs/testing/yen-garden/CFG.md`, plan `docs/superpowers/plans/2026-11-09-yg-cau-hinh-in-tu-dong.md` | Yên Garden (trả sau, 20+ bàn) cần tạo bàn nhanh và phiếu bếp ra mà không ai bấm duyệt. ⚠️ `list_open_table_sessions` KHÔNG trả `confirmed_at`/`payment_method` nên lọc ở trình duyệt chỉ là sơ bộ, SERVER quyết (đọc lại `orders` + cấu hình). ⚠️ Quán TRẢ TRƯỚC chưa có đường in tự động (POS chỉ thấy đơn trong phiên bàn, chỉ quán trả sau có phiên): hiện băng cảnh báo vàng. ⚠️ Tạo bàn hàng loạt kiểm trùng tên ở action (so cả bàn đã Đóng, không phân biệt hoa/thường/khoảng trắng) vì `tables` không có unique tên. ⚠️ Refresh trang Bàn SAU khi đóng hộp thoại: `TablesClient` có `key` theo dữ liệu nên refresh sớm làm mất hộp trước khi đọc kết quả. Nút "Duyệt & in bếp" (Task 11) giờ đi qua lớp in `printDocument`/`enqueuePrint` với đúng khoá chống trùng của đường tự in (`order:<id>:kitchen:<trạm>` / `order:<id>:table`), nên không ra phiếu bếp thứ hai |
| 2026-11-09 | **Vai Quản lý `store_manager` (mig 116, Yên Garden)** = mọi việc của thu ngân (POS, thu tiền, đặt bàn, A04, bật/tắt Tạm hết, gọi món hộ ở `/staff`) + hậu cần qua helper mới `is_store_back_office(p_store_id)` (chủ quán HOẶC quản lý đang bật của đúng quán; **superadmin không tính**; REVOKE PUBLIC/anon, GRANT authenticated). Vá tại chỗ 4 hàm so chuỗi vai: `is_store_pos_operator`, `reservation_operator_actor_kind` (Quản lý ghi `actor_kind='owner'`), `pos_get_floor_layout`, `staff_create_order`. GIỮ chỉ chủ quán: `pos_save_floor_layout`, `revoke_reservation_customer_access`, cài đặt quán, A04 `canManage`, sửa món/giá (RLS `is_store_owner_or_admin`). Web: `lib/auth/roles.ts` (`isBackOfficeRole`, `MANAGER_ADMIN_PATHS`; thu ngân cũng vào `/admin/reports`, `/admin/debts`, `/admin/inventory`, `/admin/cashbook` theo hợp đồng chung, trang tự ẩn phần ghi); guard `requireAdminPageOrRedirect('back_office')` / `requireBackOfficeStoreId()` cho trang/action CHỈ chủ quán + quản lý (KHO/CA/NO/BC dùng, không tự viết). Chủ quán tạo Quản lý ở trang Nhân viên (`TEAM_ROLES` 3 vai). Plan `docs/superpowers/plans/2026-11-09-yg-vai-quan-ly.md`, test `docs/testing/yen-garden/QUAN-LY.md` | Yên Garden có quản lý vận hành thay chủ (chủ ít có mặt): làm kho, thu chi, xem báo cáo, nhưng không đụng cấu hình. Vá `is_store_pos_operator` một chỗ là mọi RPC POS / đặt bàn / báo cáo tự nhận Quản lý. ⚠️ Action so vai bằng chuỗi (`service-requests`, `staff-order`, `staff-reservations`, `table-session`) phải GIỮ so sánh tường minh `operator.role !== '…'` — đổi sang hàm boolean (`canEnterStaffArea`) thì `tsc` không thu hẹp kiểu, `storeId` thành `string | null`. ⚠️ `TEAM_ROLES` cũng là bộ lọc `in('role')` của sửa/khoá/đặt lại mật khẩu: thiếu vai nào là chủ quán không đụng được người giữ vai đó |
| 2026-11-09 | **Kho nhập–xuất và giá vốn (mig 118, Yên Garden)**: 5 bảng (`inventory_items`, `menu_stock_links`, `inventory_documents`, `inventory_document_lines`, `inventory_doc_counters`), RLS bật không policy, mọi đọc/ghi qua RPC `SECURITY DEFINER` (ghi = `is_store_back_office`, xem tồn = back office HOẶC thu ngân; thu ngân nhận tồn ĐÃ gỡ giá vốn / giá trị ở server — `readStockLevels(…, { withCost })`). **Không có bảng tồn**: tồn tính lúc đọc, **phiếu kiểm là mốc neo** (tồn = SL đếm lần kiểm cuối + nhập − huỷ − bán sau mốc) — một chỗ duy nhất `inventory_stock_at`. **Liên kết món theo hiệu lực thời gian** (`valid_from`/`valid_to` nửa mở; đổi SL/hàng = đóng dòng cũ, mở dòng mới; trigger chỉ cho đóng, không sửa) → đổi liên kết không viết lại tồn quá khứ. **Định nghĩa "bán" duy nhất ở `inventory_sales_lines`** (khớp `orderInKitchen`; tặng vẫn trừ, bỏ món / đơn từ chối không trừ; `inventory_sales_qty` của hợp đồng chỉ cộng nó). Giá vốn `inventory_cogs` bình quân gia quyền theo kỳ, tiền tính `round(SL × tử / mẫu)`; nguyên liệu biến động mà chưa kiểm trong kỳ → `ingredient_uncounted` và **`ingredient_cogs = 0`** (không cộng dở) — khi đó **các dòng `items` của nguyên liệu đã kiểm vẫn có `cogs` riêng nên cộng các dòng ≠ `ingredient_cogs`; UI báo cáo phải nói rõ** (hàng ngừng dùng không biến động trong kỳ thì bỏ, không giữ cờ này mãi — theo trạng thái HIỆN TẠI vì không có `deactivated_at`: chạy lại báo cáo kỳ cũ sau khi ngừng dùng một nguyên liệu có thể ra số khác lần trước); tồn đầu âm không mang giá vào bình quân (`greatest(open, 0)`). Hàng đã từng gắn món (kể cả liên kết đã đóng) **không đổi loại được** — "bán" lọc theo loại hiện tại nên đổi sẽ viết lại quá khứ. Hai dòng neo cho sổ thu chi (mig 122b): `  -- mevo-anchor:122b inventory_post_document.cash_book(v_doc_id)` / `  -- mevo-anchor:122b inventory_void_document.cash_book(v_doc_id)` — hai hàm KHÔNG bọc `EXCEPTION`, chống trùng `client_request_id` bằng `pg_advisory_xact_lock`. Web: trang `/admin/inventory` (4 tab + thẻ kho, hộp thoại đè POS), mục rail Kho cả 3 vai, ô "Trừ kho" ở hộp sửa món (chủ quán) và màn Tạm hết (quản lý). Plan `docs/superpowers/plans/2026-11-09-yg-kho.md`, test `docs/testing/yen-garden/KHO.md` + `sql/kho-verify.sql` | Yên Garden cần tồn bia/nước + phiếu nhập/kiểm/huỷ + giá vốn khi go-live. Tính lúc đọc để **không đụng một RPC tiền nào** (`create_order`, đóng bàn, bỏ/tặng/sửa SL); neo ở phiếu kiểm để huỷ/ghi lùi phiếu cũ không làm lệch số đã đếm. ⚠️ Ô SỐ LƯỢNG kho dùng `parseQty` (dấu chấm/phẩy là thập phân: "1.500" = 1,5, có `qtyWarning`), ô TIỀN dùng `parseVnd` — dùng lẫn là sai 1000 lần. ⚠️ Phiếu nhập "Đã trả" ở 118 chỉ lưu `paid_status`/`paid_method`, CHƯA tạo phiếu chi — 122b vá tại hai dòng neo (xoá luôn dòng chữ "sẽ tự tạo khi có Sổ thu chi" ở `receipt-form.tsx`) |
| 2026-11-09 | **Báo cáo bán hàng `/admin/reports` (Yên Garden, Part 1, mig 117, chỉ đọc)**: 4 tab Theo món · Theo danh mục · Theo giờ · Món huỷ, kỳ = các ngày kinh doanh (mig 111, tối đa 366 ngày), Xuất Excel từng tab. Hàm nội bộ `report_paid_orders` là định nghĩa DUY NHẤT "đơn đã thu trong kỳ": chép nguyên văn điều kiện CTE `money` của `get_bills_report` (mig 125 sẽ cho A04 gọi lại hàm này) → Σ tiền món − giảm giá = doanh thu A04 từng đồng. Tiền dòng món qua `report_line_unit_price` (giá + topping, như `recompute_order_total`); tặng 0đ nhưng đếm SL tặng; bỏ thì không có dòng. Danh mục = danh mục HIỆN TẠI của món, thiếu món/danh mục thì "Khác". Theo giờ = giờ VÀO BẾP (`confirmed_at`, rồi `created_at`), khung chứa giờ bắt đầu ngày đứng đầu. Món huỷ lọc theo giờ thao tác, chỉ tính lần GIẢM số lượng, bỏ đơn bị từ chối/huỷ cả đơn. Rail tách **Hoá đơn** (A04) / **Báo cáo**. Spec `docs/superpowers/specs/2026-11-09-yg-bao-cao-design.md`, test `docs/testing/yen-garden/BAO-CAO.md` | Chủ quán Yên Garden cần biết món nào bán chạy, giờ nào đông, ai bỏ/tặng món — A04 chỉ có danh sách bill trong một ngày. ⚠️ Đổi điều kiện "đã thu" thì phải đổi CẢ `report_paid_orders` lẫn CTE `money` (tới khi mig 125 gộp làm một). Mục Báo cáo đã thêm vào nhánh thu ngân/quản lý của rail khi gộp nhánh QL (`CASHIER_ADMIN_PATHS`/`MANAGER_ADMIN_PATHS` có `/admin/reports`, 4 tab bán hàng mở cho cả ba vai POS) |
| 2026-11-09 | **Thu tiền kết hợp TM + CK (Đợt 1 mục A, mig 112a + 112b)**: một lần thu ở quầy = một dòng `bill_payments` (`source`, `collected_by`, `cash_given`, `change_amount`, `client_request_id` UNIQUE theo quán, `cash_shift_id` để sẵn NULL), mỗi phương tiện = một dòng `bill_payment_lines` (`cash`/`bank`, tiền mặt là số **RÒNG** sau thối; CHECK tên cố định `bill_payment_lines_instrument_check`). `orders.bill_payment_id` + `table_sessions.bill_payment_id`, `orders.payment_instrument` thêm `'mixed'`. RPC **`collect_table_bill(uuid[], jsonb, integer, uuid)`** cho cả một bàn lẫn gộp bill: khoá phiên theo id, server **tự tính** số phải thu (sau giảm giá, chỉ phần thu lần này) rồi so với tổng các dòng ở cấp cả nhóm — lệch một đồng là RAISE, huỷ toàn bộ; gọi lại cùng `client_request_id` trả `already`, không ghi khoản thứ hai. Lõi **`close_table_session_core`** NHÂN từ `close_table_session` prod bằng neo (nội bộ, REVOKE khỏi client). `confirm_manual_payment` / `kitchen_confirm_payment` (đơn không phiên) ghi khoản một dòng (`manual_order` / `kitchen`). A04 gom bill theo `P:<payment_id>`, TM/CK đọc từ dòng khoản, 'khác' = phần còn lại để TM + CK + khác = doanh thu; Excel thêm cột Tiền mặt / Chuyển khoản / Khác; hoá đơn in lại có từng khoản + khách đưa + tiền thối. POS Thanh toán có lựa chọn **Kết hợp** (gõ một ô, ô kia tự điền); `/staff/tables` và A04 thu một phương tiện nhưng cùng RPC. `source` luôn `'pos'` với `collect_table_bill` (cả POS, `/staff`, A04). **Mig 112b** khoá đường cũ: `close_table_session` chỉ còn `staff_reset` (`'paid'` → 'Màn thu tiền đã cập nhật, tải lại trang rồi thu lại'), trigger `trg_orders_block_client_money_write` chặn anon/authenticated/kitchen UPDATE thẳng cột tiền của đơn (`payment_received_*`, `payment_instrument`, `bill_payment_id`) — vá chỗ hở RLS `auth_update_orders` ghi ở dòng mig 110 — và chặn client **huỷ / sửa `total_amount`, `bill_discount_amount`, `discount_amount` của đơn ĐÃ THU** (chuyển sang `paid` như `completeOrder` vẫn được; `service_role` không bị chặn). Nhánh `already` của `collect_table_bill` trả kèm **các khoản ĐÃ GHI** (`lines`, `cash_given`, `change_amount`) → POS / `/staff` / A04 báo "Bàn đã được thu trước đó: Tiền mặt …đ" thay vì câu chung chung (mất phản hồi rồi đổi cách thu vẫn biết đúng cái đã ghi). Nhãn "Kết hợp" chỉ cho bill có từng khoản; bill cũ trộn phương tiện giữ "Nhiều phương thức". Ô khách đưa chặn > 2.000.000.000 ở client | Yên Garden (và KiotViet) thu một bill bằng cả tiền mặt lẫn chuyển khoản; két và báo cáo phải biết đúng từng phần. Server tự tính + so ở cấp nhóm để bill đổi giữa chừng (khách gọi thêm, máy khác bỏ món) không bao giờ bị thu thiếu. ⚠️ **Thứ tự áp: 112a → merge + Vercel lên code mới → nhờ quán tải lại POS → 112b**; áp 112b sớm thì tab POS cũ thu không được. ⚠️ Mig ca làm việc (cash shift) và mig công nợ neo vào câu `INSERT INTO public.bill_payments … VALUES (…)` (giá trị một dòng, `cash_shift_id` = chữ `NULL`) trong `collect_table_bill` + 2 hàm xác nhận tay — đừng định dạng lại câu đó. **Từ mig 122:** chữ `NULL` đó đã được thay bằng `public.require_open_cash_shift(v_store)` (`v_order.store_id` ở 2 hàm xác nhận tay); mig 123 neo vào văn bản SAU 122 — đừng đưa `NULL` trở lại. ⚠️ CTE `pay` của `get_bills_report` cộng NGUYÊN dòng khoản thu: chỉ đúng vì đơn đã thu không huỷ/sửa được (038/046/098 + `cancelOrder` lọc `payment_received_at IS NULL`). Test `docs/testing/dot1/thu-tien-ket-hop.md`, SQL `supabase/tests/112a_*`, `112b_*` |
| 2026-11-09 | **VietQR ghép vào màn Thanh toán POS và tờ in `/print/bill`** (không migration): QR chỉ cho phần chuyển khoản (Chuyển khoản = số cần thu, Kết hợp = ô Chuyển khoản), ẩn khi chia lệch / giảm giá lỗi / 0đ; tờ in chỉ cho bill CHƯA thu, cả qua `/print/agent`. Test `docs/testing/dot1/vietqr-ghep.md` | Thu ngân khỏi đọc số tài khoản cho khách. ⚠️ Số trong QR đi qua `pickBillQr` (`list_open_table_sessions` + `billTotals`), KHÔNG lấy `get_sessions_bill.grand_total` vì số đó cộng cả đơn đã thu trước. ⚠️ QR là SVG dựng ĐỒNG BỘ vì `useAutoPrint` không chờ ảnh dựng sau. ⚠️ Tờ in rộng 44mm vì 42mm chỉ còn 33,8mm phần mã, không đủ 35mm |
| 2026-11-09 | **Ca thu ngân + Sổ thu chi (mig 122 + 122b, Yên Garden)** — mig **122 THAY số 113** của plan B cũ (bỏ `cash_shift_expenses` / `add_cash_expense`): **sổ thu chi thay "khoản chi trong ca"**. `store_workflow_settings.require_cash_shift` (mặc định false, chỉ chủ quán bật, `set_require_cash_shift`, tắt khi còn ca mở bị chặn). `cash_shifts` (mỗi quán MỘT ca mở, chung một két, ai có quyền POS mở / kết; ca độc lập với ngày kinh doanh, đóng một lần không mở lại; ca quên kết → băng "Tiếp tục gộp" / "Kết ca cũ"). **Công thức két chỉ ở server**: `cash_shift_totals(shift) RETURNS jsonb {opening_cash, cash_sales, cash_receipts, cash_payments, debt_cash, expected_cash, bills_count, bank_sales}`, expected = đầu ca + TM thu bill + **debt_cash** + phiếu thu TM − phiếu chi TM; dòng neo `  v_debt_cash := 0; -- mevo-anchor:123 cash_shift_totals.debt_cash` cho mig 123 (công nợ) vá. **Đếm trước, thấy sau**: server không trả dự kiến / tiền bán / lệch của ca ĐANG MỞ, kết ca lặp chỉ trả số đã lưu cho người kết hoặc chủ quán / quản lý. `cash_book_categories` (11 danh mục seed bằng hàm `seed_cash_book_categories` + trigger `trg_stores_seed_cash_book_categories` trên `stores`; "Nhập hàng" `is_system` không sửa / ẩn / ghi tay; danh mục đã có phiếu không đổi nhóm báo cáo) + `cash_book_entries` (TM/CK, nguồn `manual` / `pos_drawer` / `inventory_receipt`, chống trùng `client_request_id` theo quán + người ghi, `already` do hàm nội bộ quyết định). Phân quyền: chủ quán + quản lý (`is_store_back_office` của 116) ghi TM + CK, huỷ, sửa danh mục; **thu ngân chỉ ghi TM nguồn `pos_drawer`, không huỷ**, ở `/admin/cashbook` + Excel chỉ thấy phiếu mình ghi (guard trang `'pos'`). Phiếu TM khi bật ca **bắt buộc** gắn ca mở (`require_open_cash_shift`, khoá `stores` → `store_workflow_settings` → ca FOR SHARE); phiếu TM chỉ huỷ khi ca còn mở. Gác 3 RPC thu (`collect_table_bill`, `confirm_manual_payment`, `kitchen_confirm_payment`) vá đúng chữ `NULL` → `require_open_cash_shift(store)` trong dòng `values` của câu INSERT `bill_payments` (sau mọi nhánh already; thu CK cũng cần ca; checkout-notify không bị gác). **122b**: vá 2 RPC kho tại neo `mevo-anchor:122b` → **phiếu nhập đã trả tự sinh phiếu chi "Nhập hàng" trong cùng giao dịch**, huỷ phiếu nhập huỷ luôn phiếu chi; **phiếu nhập trả TM bắt buộc có ca** (không ca → chặn cả phiếu nhập; huỷ sau khi ca kết → chặn); backfill theo `doc_date`. POS: nút ca + Thu/Chi két + kết ca + phiếu bàn giao 80mm `/print/shift-report`; A04 thêm tab Ca; trang Sổ thu chi `/admin/cashbook` + Excel. Plan `docs/superpowers/plans/2026-11-09-yg-ca-so-thu-chi.md`, test `docs/testing/yen-garden/THU-CHI.md` + `sql/thu-chi-verify.sql` | Yên Garden cần két khớp cuối ca kể cả thu/chi ngoài bán hàng (đi chợ, đá, trả nhà cung cấp, chủ rút tiền). Một sổ cho cả TM + CK để làm báo cáo thu chi / lãi lỗ (mig 125 nhóm theo `report_group`). ⚠️ **Áp 122 + 122b CÙNG đợt, TRƯỚC khi bất kỳ quán nào bật ca**; 122 cần 112a/112b + 111 + 116 đã áp, 122b cần thêm 118; trước 122b kiểm `pg_get_functiondef` của `inventory_post_document` / `inventory_void_document` trên prod còn đủ hai dòng `mevo-anchor:122b` (áp lên prod có thể lược comment). ⚠️ "Đếm trước thấy sau" chỉ là quy tắc GIAO DIỆN, không chặn RLS: thu ngân đọc `bill_payments` / A04 vẫn tính được tiền dự kiến — chấp nhận. ⚠️ Bill bàn 0đ khi bật ca mà chưa mở ca bị chặn "Chưa mở ca" — chấp nhận. ⚠️ Hộp mở ca trên POS không tự bật khi màn khoá PIN đang hiện (`usePosLocked`): `showModal` sau nằm trên màn khoá |
