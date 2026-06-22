# MEVO — Kiến trúc Core + Theme (Multi-instance) — Thiết kế

> Ngày 2026-06-22. Quyết định mô hình SaaS của MEVO: **một bộ code lõi dùng chung, nhân bản thành N mini-app — mỗi quán một mini-app riêng, mỗi mini-app một merchant ZaloPay riêng.** Thay cho ý tưởng cũ "một mini-app đa quán" (đã chứng minh bất khả thi vì giới hạn thanh toán của Zalo Mini App).

---

## 1. Bối cảnh & vì sao đổi hướng

**Phát hiện quyết định (2026-06-22):** Trong MỘT Zalo Mini App, luồng thanh toán mượt (`Payment.createOrder` / CheckoutSDK) lấy cấu hình merchant **một lần** ở console Zalo Mini App Studio — gắn với **một** secret key, **một** tài khoản nhận tiền. Không có cơ chế công khai cho phép một mini-app route tiền về nhiều merchant theo từng đơn (marketplace/sub-merchant không self-serve). `extradata.storeId` chỉ là metadata, KHÔNG định tuyến tiền.

→ "Nhiều quán trong một app" + "mỗi quán tự nhận tiền" + "mượt 1-2 chạm" là **mâu thuẫn kỹ thuật** trên nền Zalo Mini App.

**Cách thoát:** đổi đơn vị multi-tenancy. Thay vì *một app dùng chung nhiều quán* (multi-tenant) → *mỗi quán một app riêng từ một bộ code lõi chung* (multi-instance). Khi đó mỗi app là single-merchant (đúng cái Zalo cho phép) và đạt cả 3:

| Tiêu chí | Đạt được nhờ |
|---|---|
| ① Mượt 1-2 chạm | Mỗi app dùng CheckoutSDK với merchant riêng của quán |
| ② Quán là merchant của chính nó | App của quán nào trỏ về tài khoản ZaloPay quán đó |
| ③ MEVO KHÔNG giữ tiền | Tiền về thẳng quán → MEVO không là trung gian thanh toán, không cần giấy phép NHNN |

**Định vị MEVO:** đơn vị **làm + vận hành mini-app** cho quán (mô hình agency/SaaS sản phẩm hoá theo kiểu WordPress core + theme), KHÔNG phải ví điện tử.

---

## 2. Nguyên tắc kiến trúc — ánh xạ WordPress

MEVO khác WordPress ở một điểm định hình toàn bộ thiết kế: mỗi mini-app là **một bản build (Vite) phải nộp Zalo duyệt**, không hot-swap theme lúc runtime trên app đã publish như server WordPress. → Theme KHÔNG phải code upload tuỳ ý cho từng quán, mà là **thư viện template dựng sẵn trong core, chọn + tuỳ biến bằng cấu hình/dữ liệu.**

Bốn tầng:

| Tầng | MEVO | ~ WordPress | Cập nhật |
|---|---|---|---|
| **Core engine** | routing, render menu, giỏ, checkout (CheckoutSDK), theo dõi đơn realtime, services | WP core | Sửa code → rebuild + deploy lại N app (pipeline) |
| **Theme library** | tập theme dựng sẵn trong core; mỗi theme = layout components + token mặc định | Themes đã cài | Như trên (ship kèm core) |
| **Customizer** | token theo quán trong DB: màu, font, logo, banner, vài tuỳ chọn layout | WP Customizer | Đổi trong admin → **ăn ngay, KHÔNG build** |
| **Content** | menu, giá, ảnh món, info quán, bàn | Posts/Pages | Đổi trong admin → **ăn ngay, KHÔNG build** |

**Quyết định cơ chế (đã chốt): Theme RUNTIME + một bundle dùng chung.** Một mã nguồn chứa core + cả thư viện theme, build **một lần**, deploy thành N app, mỗi app chỉ ghim một `STORE_ID`. Theme/token/menu đọc từ Supabase lúc chạy. Lý do chọn runtime (kể cả khi chỉ MEVO thao tác): đổi banner/menu/màu/theme của quán không cần rebuild + nộp Zalo duyệt lại.

---

## 3. Phạm vi v1 (YAGNI)

**Trong phạm vi v1:**
- Bộ code lõi multi-instance + thư viện ít nhất 1–2 theme.
- Backend Supabase dùng chung (đã có), thêm cột theme/branding + Vault per-store key.
- Pipeline deploy theo config (`zmp deploy` per store).
- Admin web: **chỉ một vai — MEVO operator** (quản trị tất cả quán, đổi theme/menu/banner/màu, onboard quán mới, theo dõi core version từng quán).

**NGOÀI phạm vi v1 (hoãn sang phase sau):**
- Quán tự đăng nhập tự phục vụ (thêm món, đổi banner...). **Giai đoạn này mọi thay đổi do MEVO thực hiện.**
- RLS/phân quyền admin theo từng quán (chưa cần vì chỉ MEVO thao tác). RLS cho luồng đặt món của mini-app (anon) giữ nguyên.
- Marketplace/sub-merchant ZaloPay (không cần với mô hình một-app-một-merchant).
- Theme version tách rời core (v1: theme ship kèm core, cùng version).

---

## 4. Thành phần & ranh giới cô lập

### 4.1 Mini-app (front-end, nhân bản)
- **Một biến `STORE_ID`** ghim lúc deploy là cấu hình per-app DUY NHẤT. Mọi thứ khác runtime.
- **Boot sequence:** `STORE_ID` → fetch store config (theme_key + theme_tokens + branding) → fetch menu content → áp theme + token → render.
- **Theme registry:** `src/themes/<themeKey>/` — mỗi theme export đúng một bộ "slot" chuẩn (vd: `MenuLayout`, `ProductCard`, `Header`, `OrderStatus`). Core chỉ phụ thuộc **interface `Theme`**, không phụ thuộc nội tại từng theme → thêm/sửa theme không đụng core.
- **ThemeProvider:** nạp theme theo `theme_key`, bơm `theme_tokens` thành **CSS variables** → màu/font/banner là dữ liệu từ DB, đổi tức thì.

### 4.2 Backend (Supabase dùng chung — đã tồn tại)
- Dữ liệu phân tách theo `store_id` + RLS (đã có).
- **Thêm vào bảng `stores`:**
  - `theme_key text` — theme đang chọn (mặc định theme gốc)
  - `theme_tokens jsonb` — overrides màu/font/banner/logo
  - `core_version_deployed text` — app của quán đang chạy core version nào (để biết quán nào cần deploy lại khi nâng cấp lõi)
- **Secret ZaloPay per-store trong Supabase Vault, khoá theo `store_id`.** `checkout-create-mac`/`checkout-notify` đọc đúng key của quán để ký/verify MAC. (Hiện tại đang dùng một secret toàn cục `ZALO_CHECKOUT_SECRET_KEY` — phải đổi sang per-store. Xem mục 6.)

### 4.3 Deploy pipeline (chi phí per-app duy nhất, tự động hoá)
- Nguồn cấu hình: một bảng/`stores.config` liệt kê mỗi quán `{ store_id, zalo_app_id, app_name, theme_key }`.
- Lệnh: `npm run deploy -- --store=<slug>` → ghi `STORE_ID` + metadata vào `app-config.json` → `zmp deploy` → nộp Zalo duyệt.
- **Nâng cấp lõi:** tăng version → loop từng quán: rebuild với `STORE_ID` → deploy → duyệt → ghi `core_version_deployed`. (Đây là "update core trên từng site" của WordPress, chạy bằng script.)

### 4.4 Admin web (chỉ MEVO operator ở v1)
- Thấy tất cả quán; onboard quán mới (tạo `store` + chọn theme + nhập merchant key vào Vault); sửa menu/giá/ảnh/banner/màu/theme của bất kỳ quán nào; theo dõi `core_version_deployed`.

**Ranh giới:** Core ⟷ Theme qua *interface chuẩn*; Theme ⟷ branding qua *token (data)*, không hardcode; App ⟷ danh tính quán qua *đúng một biến STORE_ID*; backend chung, cô lập dữ liệu bằng *RLS + store_id*, secret bằng *Vault*.

---

## 5. Luồng QR (đơn giản hoá)
- App đã là của một quán → QR **không cần** mang `storeSlug` để chọn quán nữa, chỉ cần mang `table` và deep-link mở đúng mini-app của quán đó. (Hiện QR mang cả `storeSlug` + `table` — sẽ tinh gọn.)

---

## 6. Tác động lên code hiện tại
- **Giữ gần như nguyên** logic lõi (menu/giỏ/checkout/realtime). Đây là đổi mô hình cấu hình + deploy, không phải viết lại.
- **Đổi:** resolve store từ `STORE_ID` ghim (thay vì parse `storeSlug` từ QR để chọn trong nhiều quán).
- **Đổi (bảo mật, nối tiếp spec checkout 2026-06-21):** `checkout-create-mac` + `checkout-notify` đọc secret ZaloPay **theo store_id** từ Vault, thay cho secret toàn cục.
- **Thêm:** ThemeProvider + theme registry + ít nhất theme gốc (tách từ UI Pubu hiện tại) + theme thứ hai để chứng minh cơ chế.
- **Thêm:** migration cột `theme_key`, `theme_tokens`, `core_version_deployed`.
- **Thêm:** script deploy theo store + bảng/file `stores.config`.

---

## 7. Sequencing (không đụng tới timeline pilot)
- **Pilot Phở Gà Pubu vẫn cash-first**, không bị chặn bởi bất kỳ phần nào ở trên.
- Phần per-store ZaloPay credentials chỉ test được khi có merchant ZaloPay thật của quán được duyệt → triển khai khi điều kiện đó tới.
- Việc tách theme + pipeline có thể làm sớm vì không phụ thuộc ZaloPay.

---

## 8. Câu hỏi còn mở (cần xác minh, không chặn thiết kế)
- Chính sách Zalo về một tài khoản phát triển publish nhiều mini-app theo template (rủi ro "app trùng lặp"). Anh Tú khẳng định Zalo cho phép nhiều app/1 tài khoản; cần xác nhận thêm về app gần giống nhau khi scale.
- Khai báo Bộ Công Thương: MEVO làm một lần cho nền tảng; xác nhận thủ tục cho thương mại của từng app khi cần.
