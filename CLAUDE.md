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
| 2026-07-11 | **Hệ mã giảm giá** (mig 027): bảng `vouchers` chung (kind `spin`/`shipper`), trừ tiền TRONG `create_order` v5 → `orders.total_amount` = tiền SAU giảm nên MAC/doanh thu tự đúng, không sửa checkout-create-mac. Quyền dùng mã = `zalo_user_id` (code chỉ là nhãn); mã spin luôn gắn UID (đơn không UID thì loại ô voucher khỏi vòng quay). Mã shipper khoá UID lần dùng đầu tại checkout, code tự sinh `SHIP-XXXXXX`, giới hạn N đơn/ngày; quản lý ở `/admin/vouchers`. Giải hiện vật (gift) báo bếp realtime `spin_results` + loa TTS, nút "Đã đưa". Spec: `docs/superpowers/specs/2026-07-11-voucher-discount-system-design.md`, plan `docs/superpowers/plans/2026-07-11-voucher-discount-system.md`, test `TESTING-VOUCHER.md` | Vòng quay trúng mã phải tự áp lần sau (không bắt khách nhớ code); ưu đãi shipper 5k/đơn không cho khách thường dùng ké → khoá Zalo UID. ⚠️ RỦI RO #1 phải test đầu tiên: Zalo Checkout có bắt `sum(item)=amount` khi amount đã giảm không — nếu có thì thêm item giá âm |
