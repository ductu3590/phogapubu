# MEVO — Kiến trúc Core + Theme (Multi-instance) — Thiết kế

> Ngày 2026-06-22. **v2** (sau review của CODEX — bổ sung 4 contract bắt buộc: server-owned order creation + cô lập tenant; callback mapping bằng `appId` đã ký; chốt chiến lược build/deploy per-app; enforce quan hệ `STORE_ID ↔ table ↔ order ↔ payment merchant`).
>
> Quyết định mô hình SaaS của MEVO: **một bộ code lõi dùng chung, nhân bản thành N mini-app — mỗi quán một mini-app riêng, mỗi mini-app một merchant ZaloPay riêng.** Thay cho ý tưởng cũ "một mini-app đa quán" (bất khả thi vì Zalo Mini App khoá thanh toán về một merchant/app).

---

## 1. Bối cảnh & vì sao đổi hướng

**Phát hiện quyết định (2026-06-22):** Trong MỘT Zalo Mini App, luồng thanh toán mượt (`Payment.createOrder`/CheckoutSDK) lấy cấu hình merchant **một lần** ở console Zalo Mini App Studio — gắn với **một** secret, **một** tài khoản nhận tiền. Không có cơ chế công khai route tiền nhiều merchant theo từng đơn. `extradata.storeId` chỉ là metadata.

→ "Nhiều quán trong một app" + "mỗi quán tự nhận tiền" + "mượt 1-2 chạm" là **mâu thuẫn kỹ thuật** trên nền Zalo Mini App. **Cách thoát:** mỗi quán một app riêng từ một bộ code lõi chung (multi-instance). Khi đó mỗi app là single-merchant và đạt cả 3:

| Tiêu chí | Đạt nhờ |
|---|---|
| ① Mượt 1-2 chạm | Mỗi app dùng CheckoutSDK với merchant riêng của quán |
| ② Quán là merchant của chính nó | App quán nào trỏ về tài khoản ZaloPay quán đó |
| ③ MEVO KHÔNG giữ tiền | Tiền về thẳng quán → giảm rủi ro phải làm trung gian thanh toán |

**Định vị:** MEVO là đơn vị **làm + vận hành mini-app** cho quán (kiểu WordPress core + theme), KHÔNG phải ví điện tử.

> ⚠️ **Pháp lý (giả định, CẦN luật sư xác nhận):** kiến trúc tiền-về-thẳng-quán *giảm* khả năng MEVO bị xem là trung gian thanh toán (cần giấy phép NHNN), nhưng **đây không phải kết luận pháp lý**. Phải hỏi luật sư trước khi scale.

---

## 2. Nguyên tắc kiến trúc — ánh xạ WordPress

MEVO khác WordPress ở điểm định hình toàn bộ thiết kế: mỗi mini-app là **một bản build (Vite) phải nộp Zalo duyệt**, không hot-swap theme runtime trên app đã publish. → Theme là **thư viện template dựng sẵn trong core, chọn + tuỳ biến bằng dữ liệu**, KHÔNG phải code upload tuỳ ý cho từng quán.

| Tầng | MEVO | ~ WordPress | Cập nhật |
|---|---|---|---|
| **Core engine** | routing, render menu, giỏ, checkout, theo dõi đơn realtime, services | WP core | Sửa code → rebuild + deploy lại từng app (pipeline) |
| **Theme library** | tập theme dựng sẵn trong core; mỗi theme = layout components + token mặc định | Themes đã cài | Như trên (ship kèm core) |
| **Customizer** | `theme_tokens` (màu/font) + `branding` (logo/banner/tên) theo quán trong DB | WP Customizer | Đổi trong admin → **ăn ngay, KHÔNG build** |
| **Content** | menu, giá, ảnh món, info quán, bàn | Posts/Pages | Đổi trong admin → **ăn ngay, KHÔNG build** |

**Cơ chế đã chốt:**
- **Theme RUNTIME:** theme/token/branding/menu đọc từ Supabase lúc chạy → đổi không cần build lại.
- **Store BUILD-TIME (chốt sau review):** `VITE_STORE_ID` **nhúng lúc build**, mỗi quán một artifact riêng. Lý do: mỗi quán là một Zalo Mini App (APP_ID riêng) nên **đằng nào cũng phải `zmp deploy` riêng** — nhúng STORE_ID lúc build là gần như miễn phí và bỏ được điểm-hỏng-runtime khi suy ra store. (Runtime-theme và build-time-store là hai trục độc lập; chốt này KHÔNG đụng quyết định theme runtime.)

---

## 3. Phạm vi v1 (YAGNI)

**Trong v1:**
- Code lõi multi-instance + thư viện ít nhất 1–2 theme.
- Backend Supabase dùng chung + **cô lập tenant + tạo đơn phía server** (mục 4 — bắt buộc, không hoãn được vì nhiều quán chung 1 DB + tiền thật).
- Pipeline per-store build/deploy theo config.
- Admin web: **một vai — MEVO operator** (có authz thật, mục 4.4).

**NGOÀI v1 (hoãn):**
- Quán tự đăng nhập tự phục vụ. **Giai đoạn này mọi thay đổi do MEVO làm.**
- RLS chi tiết phân quyền *theo quán cho người dùng quán* (chưa cần — chỉ MEVO thao tác).
- Marketplace/sub-merchant ZaloPay (không cần với 1-app-1-merchant).
- Theme version tách rời core.

---

## 4. Bảo mật & cô lập tenant (BẮT BUỘC — sửa lỗ hổng hiện tại)

> Trạng thái hiện tại (đã kiểm chứng) là **không cô lập**: `public_read_orders USING(true)`, `public_update_orders` cho anon set `paid/cancelled/ready`, mọi `authenticated` là super-admin toàn hệ thống ([001_init.sql:121](../../../supabase/migrations/001_init.sql), [002_indexes_rls_realtime.sql:60](../../../supabase/migrations/002_indexes_rls_realtime.sql)). Spec v1 phải thay bằng các contract dưới.

### 4.1 Tạo đơn phía server (`create_order` RPC / Edge, `SECURITY DEFINER`)
Mini-app **KHÔNG insert order/order_items trực tiếp nữa.** Gọi `create_order(store_id, table_id, items[])`:
1. Kiểm `table.store_id === store_id` (enforce P1-4 phía DB).
2. Kiểm mỗi `menu_item.store_id === store_id` và đang bán.
3. **Tính `total_amount` từ `menu_items.price` trên server** (không nhận giá từ client) → chống sửa giá tận gốc.
4. Snapshot `item_name`, `item_price` vào order_items.
5. Sinh **capability token** ngẫu nhiên lưu trên order, trả về client.
6. Trả `order_id` + token.

### 4.2 RLS siết lại
- **orders/order_items:** bỏ `public insert` + `public update` của anon. Anon **không** đổi trạng thái đơn.
- **Đọc order-status:** không `public read all`. Scope theo **capability token** (hoặc `zalo_user_id` đã xác thực). Realtime order-status phải lọc theo đúng order của người gọi.
- **Chuyển trạng thái vận hành** (`cooking/ready/paid/cancelled`): chuyển sang **operator đã xác thực** (kitchen/admin), không phải anon. (Hiện kitchen/admin dùng anon — phải nâng cấp; xem 4.4.)
- **Xác nhận `confirmed`:** chỉ service role qua `checkout-notify` (giữ tinh thần migration 002, nhưng đặt trong RLS sạch).

### 4.3 Gộp & đánh số lại migration
Hai file cùng số `002_` (`002_indexes_rls_realtime.sql` + `002_tighten_order_rls.sql`) → thứ tự mơ hồ. v1 đánh số lại + gộp RLS về một nguồn rõ ràng (vd `003_rls_tenant_isolation.sql` thay thế các policy `USING(true)`).

### 4.4 Authorization model cho admin (MEVO operator)
"Đã đăng nhập" CHƯA đủ. Yêu cầu:
- Tài khoản phải có **role/allowlist `mevo_operator`** (vd bảng `operators` hoặc custom claim).
- Mọi Server Action **kiểm operator trước** khi gọi admin/service-role client.
- **Audit log** cho onboarding quán + mọi lần đọc secret.
- **Secret không bao giờ trả về UI** sau khi lưu.

---

## 5. Thanh toán multi-merchant — contract callback (sửa P0-2)

### 5.1 Bảng mapping
`payment_merchants ( app_id text PK, store_id uuid FK, vault_secret_ref text, env text )` — `app_id` là khoá tra cứu **đáng tin** (vì nằm trong chuỗi MAC của callback).

### 5.2 `checkout-create-mac`
- Đọc `order.store_id` → tra merchant của quán → lấy secret từ **Vault qua RPC `SECURITY DEFINER`** (KHÔNG query thẳng `vault.decrypted_secrets`) → ký MAC.

### 5.3 `checkout-notify` — đúng thứ tự (KHÔNG tin `extradata` trước khi verify)
1. Đọc `data.appId` từ callback.
2. Tra `payment_merchants(app_id) → store_id, vault_secret_ref`.
3. Lấy secret qua RPC Vault.
4. **Verify MAC** (template cố định, `appId` là một phần chuỗi).
5. Chỉ sau khi verify mới parse `extradata.orderId`.
6. Kiểm `order.store_id === mapped store_id`, `amount === total_amount`, `resultCode === 1`, idempotent (`where status='pending'`) → `confirmed` + `zalopay_trans_id`.

> Hiện `checkout-create-mac`/`checkout-notify` dùng secret toàn cục `ZALO_CHECKOUT_SECRET_KEY` → đổi sang per-store theo contract trên. Chỉ test được khi có merchant ZaloPay thật của quán → triển khai khi điều kiện tới.

---

## 6. Theme system — contract tương thích version (sửa P1-5)

- **`Theme` interface versioned**: mỗi theme export đúng bộ "slot" chuẩn (`MenuLayout`, `ProductCard`, `Header`, `OrderStatus`...) + khai báo version tương thích core. Core chỉ phụ thuộc interface, không phụ thuộc nội tại theme.
- **Fallback `default`**: `theme_key` không hợp lệ/không có trong bundle → render theme default, KHÔNG trắng màn hình.
- **Admin chỉ cho chọn theme mà `published_core_version` của quán hỗ trợ.**
- **`theme_tokens`**: có **JSON schema + default-merge** (thiếu key → lấy default).
- **Tách branding khỏi design token**: `branding jsonb { logo_url, banner_url, app_name }` (dữ liệu thương hiệu) **riêng** với `theme_tokens jsonb { colors, fonts, ... }` (CSS variables). Không trộn lẫn.
- **ThemeProvider**: boot đọc `theme_key` + `theme_tokens` + `branding` theo `VITE_STORE_ID` → nạp theme + bơm token thành CSS variables.

---

## 7. Deploy pipeline & vòng đời Zalo (sửa P1-3, P1-6)

- **Build per-store**: `VITE_STORE_ID=<id> npm run build` → artifact riêng → `zmp deploy` vào **đúng Zalo Mini App của quán**. Pipeline phải cấu hình **APP_ID / deployment identity của ZMP** (liên kết khi `zmp init`/config), KHÔNG chỉ sửa `app-config.json`.
- **Nguồn cấu hình**: bảng/`stores.config` liệt kê `{ store_id, zalo_app_id, app_name, theme_key }`.
- **Tách trạng thái vòng đời** (deploy ≠ submit ≠ publish). Trên `stores` (v1 gọn):
  - `desired_core_version`, `published_core_version`, `deployment_status`, `last_error` (thêm `submitted_core_version` + `submitted_at`/`published_at` khi cần).
  - Script **không** đánh dấu "published" ngay sau `zmp deploy` — chỉ cập nhật khi Zalo thực sự publish.

---

## 8. Thay đổi Database (Supabase dùng chung)
- `stores`: `theme_key text`, `theme_tokens jsonb`, `branding jsonb`, `desired_core_version`, `published_core_version`, `deployment_status`, `last_error`.
- `orders`: thêm `capability_token` (cho 4.2) — hoặc bảng phụ nếu muốn token nhiều lần.
- Mới: `payment_merchants` (5.1), `operators` (4.4), bảng/luồng audit log.
- RPC `SECURITY DEFINER`: `create_order` (4.1), `get_merchant_secret` (5.2/5.3).
- Migration mới gộp + đánh số lại RLS (4.3).

---

## 9. Tác động lên code hiện tại
- **Giữ gần như nguyên** logic lõi (menu/giỏ/checkout/realtime) — đổi mô hình cấu hình/deploy + siết bảo mật, không viết lại.
- **Đổi:** resolve store từ `VITE_STORE_ID` (bỏ parse `storeSlug` từ QR để chọn quán). QR chỉ mang `table`.
- **Đổi:** tạo đơn qua `create_order` RPC (bỏ insert trực tiếp ở [order.service.ts](../../../mini-app/src/services/order.service.ts)); enforce table↔store; order-status đọc theo token.
- **Đổi:** RLS siết (4.2/4.3); admin/kitchen lên operator-authz (4.4); `checkout-*` đọc secret per-store (5).
- **Thêm:** ThemeProvider + theme registry + theme default (tách từ UI Pubu) + 1 theme thứ hai để chứng minh cơ chế.

---

## 10. Sequencing
- **Pilot Phở Gà Pubu vẫn cash-first**, không bị chặn.
- **Ưu tiên sớm (độc lập ZaloPay):** siết RLS + `create_order` server-side + operator authz + table↔store — vì đây là lỗ hổng **đang tồn tại** dù mới một quán cash (anon hiện set được `paid/cancelled` đơn người khác).
- **Per-store ZaloPay credentials**: chỉ test được khi có merchant ZaloPay thật của quán → làm khi tới.
- **Tách theme + pipeline**: làm sớm, không phụ thuộc ZaloPay.

---

## 11. Câu hỏi còn mở (cần xác minh/quyết, không chặn thiết kế)
- Chính sách Zalo về một tài khoản phát triển publish nhiều mini-app theo template (rủi ro "app trùng lặp" khi scale). Anh Tú khẳng định Zalo cho phép nhiều app/1 tài khoản; cần xác nhận thêm khi nhiều app gần giống nhau.
- Khai báo Bộ Công Thương cho thương mại của từng app (MEVO làm một lần cho nền tảng; xác nhận thủ tục per-app khi cần).
- **Pháp lý NHNN**: cần luật sư xác nhận giả định ở mục 1.
