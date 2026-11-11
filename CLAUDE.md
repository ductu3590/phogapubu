# MEVO — Claude Code Master Context

> **Đọc file này đầu tiên trước khi làm bất kỳ việc gì.**
> File này chỉ giữ thứ đang ĐÚNG và cần cho mọi phiên. Lịch sử quyết định + các bẫy đã vấp nằm ở
> [docs/decisions.md](docs/decisions.md) — tìm trong đó theo tên file / hàm / bảng / số migration trước khi sửa một khu vực.

---

## ⚠️ QUY TẮC BẮT BUỘC VỀ TEST

Sau khi hoàn thành BẤT KỲ Sprint hoặc task nào, Claude Code PHẢI:
1. Dừng lại — KHÔNG tự động chuyển sang task tiếp theo
2. Tạo / cập nhật file test riêng của Sprint trong `docs/testing/<tên-đợt>/`; `TESTING.md` chỉ là mục lục
   (thêm một dòng link + trạng thái), không nối checklist vào đó
3. Nói với anh Tú chính xác file và nhóm test cần chạy: *"Xong rồi anh, test theo `docs/testing/.../X.md` — Test Y nhé"*
4. Chờ anh Tú xác nhận "PASS" trước khi tiếp tục

Vi phạm quy tắc này = build trên nền không ổn định = mất gấp đôi thời gian fix sau.

---

## 1. Dự án là gì?

**MEVO** (Menu Evolution) — nền tảng gọi món + quản lý quán cho quán ăn Việt Nam: khách quét QR tại bàn bằng
**Zalo Mini App**, quán vận hành trên **admin web** (POS thu ngân, màn nhân viên, cấu hình, báo cáo).

**Người sáng lập:** Đỗ Đức Tú — Lào Cai. **Giai đoạn:** chưa có người dùng thật; dữ liệu trên prod đều là dữ liệu test.

| Quán | Mô hình | Trạng thái |
|---|---|---|
| Bia lẩu Bảo Lương | Trả sau, thu ngân duyệt đơn ở POS rồi in phiếu, không màn bếp, thanh toán tại quầy | Đang bật — quán dùng để test mọi thứ |
| Yên Garden | Trả sau (bia garden), cần kho / ca / sổ thu chi / công nợ / báo cáo | Go-live dự kiến 2026-12-01 |
| Phở Gà Pubu (+ Căng tin PUBU) | Trả trước qua Zalo Checkout, có màn bếp, mang về / ship | Tạm dừng (`is_active = false`) |

Hai mô hình **trả trước** và **trả sau** cùng sống trong code lõi (`stores.payment_timing`) và **đều được giữ lâu dài**
(quyết định 2026-11-11): trả trước không phải mã thừa. Chỉ kiểm Mini App trên Bảo Lương, không cần kiểm Pubu, nhưng
mọi thay đổi phải giữ đúng cả hai nhánh; UI chỉ có nghĩa với trả trước (mã giảm giá, lời hứa báo món xong…) thì
không hiện cho quán trả sau.

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

## 3. Tech stack (đúng với code hiện tại)

| Phần | Công nghệ | Ghi chú |
|---|---|---|
| `mini-app/` | React 18 + TypeScript, zmp-sdk / zmp-ui, zustand, @tanstack/react-query, Tailwind 3, Vite, vitest | Deploy bằng `zmp deploy` từ worktree của từng quán |
| `admin-web/` | Next.js 16 (App Router) + React 19, Tailwind 4, lucide-react, vitest | ⚠️ Next 16 khác bản quen thuộc — đọc `admin-web/AGENTS.md` và `node_modules/next/dist/docs/` trước khi viết. Deploy Vercel |
| `supabase/` | PostgreSQL + RLS, RPC `SECURITY DEFINER`, Realtime, Storage, Edge Functions (Deno) | Một project dùng chung mọi quán, phân theo `store_id` |
| `print-agent/` | Electron | Phần mềm in ở quầy cho chế độ in "Nhiều nơi" (`print_mode = 'agent'`) |
| `ops/phone-proxy/` | Node | Proxy đặt tại VN để đổi token số điện thoại Zalo (edge function `zalo-phone` gọi) |

## 4. Cấu trúc thư mục

```
mevo/
├── CLAUDE.md                ← File này
├── TESTING.md               ← Mục lục checklist test (nội dung nằm ở docs/testing/)
├── mini-app/                ← Zalo Mini App — SOURCE LÕI, không deploy trực tiếp từ đây
│   └── src/  pages/ components/ services/ stores/ utils/
├── mini-app-instances/      ← Worktree riêng theo quán (gitignored): <slug>/mini-app
├── admin-web/
│   ├── app/admin/           ← POS (/admin/pos) + cấu hình chủ quán dạng hộp thoại đè lên POS
│   ├── app/staff/           ← Màn nhân viên (điện thoại)
│   ├── app/mevo/            ← Cockpit superadmin MEVO
│   ├── app/kitchen/         ← Màn bếp (chỉ quán có chính sách xuống bếp không phải pos_confirmation)
│   ├── app/print/           ← Trang in 80mm (ngoài khung /admin, /staff)
│   ├── app/api/             ← Webhook Zalo
│   └── lib/                 ← Hàm thuần + server action (lib/actions) + client Supabase (lib/supabase)
├── supabase/
│   ├── migrations/          ← Đánh số; file hậu tố chữ (103b_, 112a_…) bị `supabase db push` bỏ qua
│   ├── functions/           ← checkout-create-mac, checkout-notify, reservation-zca-notify, zalo-phone, zns-notify
│   └── tests/               ← `node --test` trên PGlite, mỗi test nạp migration nó cần
├── print-agent/
├── scripts/                 ← create-mini-app-instance.sh, gen-mini-app-icons.cjs, cai-pos-bao-luong.bat…
└── docs/
    ├── decisions.md         ← Nhật ký quyết định + bẫy đã vấp
    ├── superpowers/specs/   ← Thiết kế từng tính năng
    ├── superpowers/plans/   ← Plan của việc ĐANG làm (plan đã thực thi xong thì xoá)
    └── testing/             ← Checklist test của việc đang / vừa làm
```

Schema DB: không chép vào đây (bản chép cũ đã lệch xa). Xem `supabase/migrations/` hoặc hỏi thẳng DB
(Supabase MCP `list_tables`, `pg_get_functiondef`).

## 5. Quy tắc code bắt buộc

- **Tiếng Việt** cho tất cả text UI người dùng thấy
- **Mobile-first tuyệt đối** cho Mini App và màn nhân viên
- **Không hardcode** ID, key, URL nào trong code → dùng env vars
- **Comment bằng tiếng Việt** cho logic phức tạp
- **Snapshot tên + giá** vào order_items khi tạo đơn (phòng menu thay đổi)
- Commit format: `feat: [mô tả]` / `fix: [mô tả]` / `chore: [mô tả]`

## 6. Luật đang có hiệu lực (rút từ nhật ký — chi tiết ở docs/decisions.md)

**Tiền**
- Tổng tiền, giảm giá, số phải thu do **server tính**; UI không tự nghĩ công thức. Doanh thu = tiền THẬT đã nhận.
- Bàn trả sau **thu cả bàn một lần** qua `collect_table_bill`, và **chỉ thu ở POS** (Thanh toán); `/staff/tables` và
  ngăn kéo A04 không có nút thu. Phiên hết hạn còn nợ vào POS qua khối "Bàn hết hạn còn tiền chưa thu".
- Không chắc khách đã trả hay chưa thì rơi về "chờ xác nhận", KHÔNG BAO GIỜ suy đoán "khách chưa trả tiền".
- Ô TIỀN dùng `parseVnd`, ô SỐ LƯỢNG kho dùng `parseQty` — dùng lẫn là sai 1000 lần.

**SQL / migration**
- File có `CREATE OR REPLACE` một RPC đang sống phải nằm RIÊNG một migration và không ghi "rerun-safe".
- Sửa hàm đang chạy: vá tại chỗ bằng `pg_get_functiondef` + `replace` + `EXECUTE`, raise nếu không còn chuỗi neo.
  Áp migration lên prod phải áp NGUYÊN VĂN file.
- Hàm nội bộ mới luôn `REVOKE … FROM PUBLIC, anon, authenticated` (REVOKE FROM PUBLIC không gỡ quyền cấp thẳng).
- Đơn "tự vào bếp" vẫn ở `status = 'pending'`: mọi chỗ suy "chờ duyệt" đi qua `isReviewableOrder` /
  `orderInKitchen`, đừng so status trần. Đơn `order_source` là `pos` / `reservation_preorder` nằm pending mãi.

**admin-web**
- Server action có lỗi người dùng phải **TRẢ `{ok, error}`, không ném** (Next production giấu nội dung lỗi ném).
- Server action dùng `createAdminClient` bỏ qua RLS → PHẢI tự kiểm quyền + lọc `store_id`.
- Không poll bằng server action trên trang có điều hướng mềm (POS đọc định kỳ thẳng từ trình duyệt, `lib/pos-browser-reads.ts`).
- Luật vai trò ở MỘT chỗ: `admin-web/lib/auth/roles.ts` (khớp `is_store_pos_operator`, `is_store_back_office`,
  `is_store_owner_of` trong DB).
- Công thức TS phải khớp tay với SQL — đổi một bên phải đổi cả hai: `lib/bill-discount.ts` ↔ mig 107/108;
  `lib/menu/menu-discount.ts` + `mini-app/src/utils/menu-discount.ts` ↔ `menu_discount_amount` (mig 115);
  `businessToday` (`lib/daily-report.ts`) ↔ `business_date_of` (mig 111);
  `planOrderJobs` (`lib/print/print-plan.ts`) ↔ `auto_kitchen_print_enqueue` (mig 131, phiếu bếp của đơn tự vào bếp do
  máy chủ xếp trong `print_agent_poll`).
- Màn "nghe Realtime rồi tải lại" dùng lõi chung `lib/realtime-watch.ts`; đừng viết bộ theo dõi thứ tư.

**Mini App**
- Deploy: `git merge origin/main` vào worktree quán TRƯỚC rồi mới `zmp deploy`; nhắc anh Tú chọn Development hay Testing.
- Test thuần chạy node (vitest): hàm cần test tách ra `src/utils/`.

## 7. Ghi quyết định mới

Quyết định lớn / bẫy vừa vấp: thêm MỘT dòng vào cuối bảng chính của [docs/decisions.md](docs/decisions.md).
Chỉ sửa file này khi một điều ở trên không còn đúng.
