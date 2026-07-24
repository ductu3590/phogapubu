# Wizard tạo quán mới trên `/mevo` + Claude tự sinh thư mục mini-app

**Ngày:** 2026-07-24
**Trạng thái:** Đã duyệt design (anh Tú duyệt cùng ngày)

## Vấn đề

Tạo quán mới hiện tại rời rạc: `/mevo/stores/new` chỉ thu tên/slug/SĐT/địa chỉ, các mục còn
lại (màu, Zalo Mini App ID + secret Checkout, OA token + webhook, tài khoản chủ quán) phải tự
nhớ mà điền ở trang chi tiết — dễ sót (quên webhook, quên Notify Url là lỗi đã từng mất cả
buổi debug). Sau đó khâu sinh thư mục mini-app (`mini-app-instances/<slug>/`) hoàn toàn thủ
công theo skill `replicate-mini-app`.

Mong muốn: tạo quán theo **wizard từng bước**, kết thúc là Claude **tự sinh thư mục mini-app**
cho quán đó trên máy local.

## Ràng buộc kiến trúc

- Admin web chạy trên Vercel — **không thể** tạo thư mục/worktree trên máy anh Tú. Khâu sinh
  mini-app bắt buộc chạy local (đã chốt: nhờ Claude Code chạy, không dựng agent thường trực).
- App Zalo thường được duyệt sau vài ngày → lúc tạo quán có thể chưa có Mini App ID → wizard
  phải **cho bỏ qua từng bước**, điền tiếp sau ở trang chi tiết.
- Hướng ghi dữ liệu đã chốt: **ghi dần từng bước** (bước 1 tạo quán thật, các bước sau gọi
  đúng các server action đang có) — không gom về 1 submit cuối.

## Thiết kế

### 1. Wizard tại `/mevo/stores/new` (thay form cũ)

Client component nhiều bước, thanh tiến trình 5 bước + màn kết thúc. Sau bước 1 thành công,
gắn `?store=<id>&step=2` vào URL (router.replace) để F5 vẫn đứng đúng bước; mất URL thì trang
chi tiết quán vẫn là chỗ điền tiếp như cũ.

| Bước | Trường | Ghi bằng | Bỏ qua? |
|---|---|---|---|
| 1. Thông tin quán | Tên, slug (tự gợi ý từ tên, validate `^[a-z0-9-]+$`), SĐT, địa chỉ | `createStore` (có sẵn) | Không |
| 2. Giao diện | Màu chủ đạo (color picker) | `updateStoreColor` (có sẵn) | Có |
| 3. Zalo Mini App | Tên Mini App (Zalo Dev), Zalo Mini App ID, Checkout Secret Key (password field) | `updateAppConfig` + `updateCheckoutConfig` (có sẵn) | Có |
| 4. OA / Webhook | Zalo OA ID, OA Access Token, App Secret Key (password); hiển thị sẵn webhook URL `https://<domain>/api/zalo-webhook/<storeId>` kèm nút copy + nhắc set Notify Url chuyển khoản trên console Zalo | `updateZaloConfig` (có sẵn) + action mới `updateStoreOaId` | Có |
| 5. Tài khoản chủ quán | Email; nếu tạo user mới → hiện mật khẩu tạm 1 LẦN + nút copy + cảnh báo không xem lại được | `assignStoreOwner` (có sẵn) | Có |

**Màn kết thúc:**
- Checklist tổng kết: mục nào ✅ đã cấu hình / ⏳ đã bỏ qua (dẫn link tới trang chi tiết).
- Khối "Sinh mini-app cho quán": hướng dẫn mở Claude Code tại repo + nút copy câu lệnh
  `onboard quán <slug>`.

Lỗi từng bước (vd slug trùng — `stores.slug` UNIQUE) hiện ngay tại bước đó, không mất dữ liệu
các bước khác. Secret luôn là input password, không bao giờ echo lại (giữ nguyên hành vi các
action có sẵn).

**Code server mới duy nhất:** `updateStoreOaId(storeId, formData)` trong
`admin-web/lib/actions/mevo-stores.ts` — chỉ ghi `stores.zalo_oa_id` (action
`updateStoreBasicInfo` hiện bắt gửi kèm name/phone/address nên không dùng lẻ được).

Trang chi tiết `/mevo/stores/<id>` **giữ nguyên** — vẫn là nơi sửa/điền tiếp sau wizard.

### 2. Claude sinh thư mục mini-app (cập nhật skill `replicate-mini-app`)

Thêm mục "Lệnh nhanh: `onboard quán <slug>`" vào
`.claude/skills/replicate-mini-app/SKILL.md`. Khi được gọi, Claude:

1. Đọc DB (Supabase MCP): `stores` (name, slug) + `store_app_configs` +
   `store_checkout_configs.zalo_mini_app_id` theo slug. Không đọc/chép secret nào ra file.
2. Chạy `scripts/create-mini-app-instance.sh <slug> "<tên quán>"` (worktree + branch
   `deploy/<slug>`, seed `.env`/`app-config.json`).
3. Tự điền `.env` của instance: `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` (anon key công
   khai — lấy từ instance có sẵn, vd `mini-app-instances/pho-ga-pubu/`),
   `VITE_ZALO_APP_ID`/`APP_ID` từ DB. Nếu quán chưa có Mini App ID (bước 3 wizard bị bỏ
   qua) → để trống và báo rõ trong kết quả.
4. `npm install` trong `mini-app-instances/<slug>/mini-app`.
5. Báo lại danh sách việc chỉ anh Tú làm được: `npx zmp login`, `npx zmp deploy` (nhắc chọn
   Development vs Testing theo quy ước), đăng ký webhook URL per-store + set Notify Url
   phương thức chuyển khoản trên console Zalo, in QR bàn.

`ZMP_TOKEN` không tự lấy được (Zalo bắt login tương tác) — nằm ngoài phạm vi.

### 3. Kiểm thử

Thêm mục vào `TESTING.md` — "SPRINT — Wizard tạo quán":
1. Chạy wizard đủ 5 bước với 1 quán thử → kiểm tra đủ các row
   `stores`/`store_app_configs`/`store_checkout_configs`/`store_zalo_configs`/`mevo_operators`.
2. Chạy lại wizard, bỏ qua bước 3–5, F5 giữa chừng → vẫn đứng đúng bước; điền tiếp được ở
   trang chi tiết.
3. Gõ `onboard quán <slug>` với quán thử → thư mục `mini-app-instances/<slug>/mini-app` có
   `.env` điền đúng, `npm run dev` chạy được.
4. Dọn quán thử (xoá rows + worktree + branch) sau khi PASS.

Theo quy tắc CLAUDE.md: làm xong dừng lại, chờ anh Tú xác nhận PASS.

## Ngoài phạm vi (YAGNI)

- Menu/bàn trong wizard — vẫn nhập ở `/admin` như cũ.
- Tự động `zmp login`/`zmp deploy` — Zalo bắt tương tác người thật.
- Nút trên web tự tạo thư mục local (agent thường trực) — quá tay cho giai đoạn 2–3 quán.
- Sửa/gộp gì thêm ở trang chi tiết quán.
