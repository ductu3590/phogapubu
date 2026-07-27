# Checklist test — Wizard tạo quán + onboard mini-app (2026-07-24)

> File hướng dẫn riêng cho sprint này (tách khỏi TESTING.md cho gọn).
> Nhánh code: `feat/store-wizard` — test PASS hết mới merge/deploy.
>
> **Chuẩn bị:** tài khoản đăng nhập **mevo_superadmin** + chạy admin-web local:
>
> ```bash
> cd admin-web && npm run dev
> ```
>
> Mở `http://localhost:3000/mevo/stores/new`. Dùng quán thử slug `test-wizard`
> và `test-wizard-2`, **xoá sạch sau khi test** (mục Dọn dẹp cuối file).

---

## Test 1 — Wizard đủ 5 bước (happy path)

**Bước 1 — Thông tin quán**
- [ ] Gõ tên `Quán Test Wizard` → ô Slug **tự gợi ý** `quan-test-wizard` (bỏ dấu đúng).
- [ ] Sửa slug thành `test-wizard` → gõ tiếp tên quán → slug **không bị ghi đè** nữa (đã tự sửa tay).
- [ ] Thử slug sai `Test_Wizard` → bấm Lưu & tiếp tục → báo lỗi đỏ ngay tại chỗ, không văng trang.
- [ ] Sửa lại `test-wizard`, điền SĐT + địa chỉ bất kỳ → Lưu & tiếp tục → sang bước 2,
      URL đổi thành `?store=<uuid>&slug=test-wizard&step=2`.

**Bước 2 — Giao diện**
- [ ] Chọn màu bất kỳ → Lưu & tiếp tục → sang bước 3.

**Bước 3 — Zalo Mini App**
- [ ] Điền Tên Mini App `Test App`, Mini App ID `9999`, Secret giả `secret-test` → Lưu & tiếp tục.
- [ ] (Thử phụ: nếu điền Mini App ID mà **bỏ trống secret** lần đầu → phải báo lỗi
      "Thiếu Checkout Secret Key", không sang bước.)

**Bước 4 — OA / Webhook**
- [ ] Thấy Webhook URL dạng `http://localhost:3000/api/zalo-webhook/<store_id>` + nút **Copy hoạt động**.
- [ ] Thấy dòng nhắc set **Notify Url** chuyển khoản.
- [ ] Điền OA ID giả `123456` → Lưu & tiếp tục.

**Bước 5 — Chủ quán**
- [ ] Gán email thử (email CHƯA từng dùng, vd `test-wizard@example.com`) →
      hiện **mật khẩu tạm 1 lần** + nút Copy hoạt động.
- [ ] Nút đổi từ "Bỏ qua, điền sau" thành "Tiếp tục" → bấm Tiếp tục.

**Màn hoàn tất**
- [ ] Checklist 5 dòng đều ✅.
- [ ] Có khối "Sinh mini-app" với lệnh `onboard quán test-wizard` + nút Copy hoạt động.
- [ ] Link "Mở trang chi tiết quán →" mở đúng `/mevo/stores/<id>` với dữ liệu vừa điền.

**Kiểm DB** (SQL Editor Supabase, hoặc nhờ Claude chạy):

```sql
select s.id, s.name, s.slug, s.zalo_oa_id, s.primary_color, s.is_active,
       ac.zalo_mini_app_name, ac.onboarding_status,
       cc.zalo_mini_app_id, cc.is_enabled as checkout_on,
       zc.is_enabled as zalo_secret_on,
       (select count(*) from mevo_operators o where o.store_id = s.id) as owners
from stores s
left join store_app_configs      ac on ac.store_id = s.id
left join store_checkout_configs cc on cc.store_id = s.id
left join store_zalo_configs     zc on zc.store_id = s.id
where s.slug = 'test-wizard';
```

- [ ] Đủ 1 row: đúng tên/OA ID/màu, `zalo_mini_app_id = 9999`, `checkout_on = true`,
      `owners = 1`, `is_active = false` (quán mới mặc định chưa bật).

## Test 2 — Bỏ qua + F5 + slug trùng

- [ ] Tạo quán 2: tên `Quán Test Wizard 2`, slug `test-wizard-2` → bước 2 bấm **"Bỏ qua, điền sau"**.
- [ ] Đang đứng bước 3 → **F5** → vẫn ở bước 3, URL còn nguyên `?store=...&step=3`.
- [ ] Bỏ qua nốt bước 3/4/5 → màn cuối: các mục bỏ qua hiện **⏳** kèm "điền sau ở trang chi tiết".
- [ ] Mở trang chi tiết quán → mục ZaloPay Checkout điền được bình thường (chỗ điền tiếp sau wizard).
- [ ] Quay lại `/mevo/stores/new`, tạo quán slug **trùng** `test-wizard` → bước 1 báo lỗi đỏ ngay,
      không văng trang, không tạo thêm row.
- [ ] (Guard URL tay: mở thẳng `/mevo/stores/new?step=4` **không có** `store=` → tự về bước 1.)

## Test 3 — `onboard quán` (Claude Code chạy local)

- [ ] Mở Claude Code tại `D:\Code\mevo`, gõ: `onboard quán test-wizard`
      → Claude tự: đọc DB, chạy `scripts/create-mini-app-instance.sh`, điền `.env`, `npm install`.
- [ ] Kiểm kết quả: có thư mục `mini-app-instances/test-wizard/mini-app`, file `.env` có
      `VITE_DEFAULT_STORE_SLUG=test-wizard` và `VITE_ZALO_APP_ID=9999`(+`APP_ID=9999`),
      Supabase URL/anon key giống instance Pubu.
- [ ] Báo cáo cuối của Claude liệt kê đủ việc thủ công: `zmp login`, `zmp deploy`
      (nhắc Development vs Testing), đăng ký webhook, set Notify Url, in QR bàn.
- [ ] Gõ `onboard quán khong-ton-tai` → Claude **dừng**, báo chưa có quán, KHÔNG tạo thư mục.

## Dọn dẹp sau khi test

```sql
-- Xoá 2 quán thử (con trước, cha sau). Chạy từng dòng, kiểm tra slug cẩn thận.
delete from mevo_operators where store_id in (select id from stores where slug in ('test-wizard','test-wizard-2'));
delete from store_zalo_configs where store_id in (select id from stores where slug in ('test-wizard','test-wizard-2'));
delete from store_checkout_configs where store_id in (select id from stores where slug in ('test-wizard','test-wizard-2'));
delete from store_app_configs where store_id in (select id from stores where slug in ('test-wizard','test-wizard-2'));
delete from stores where slug in ('test-wizard','test-wizard-2');
```

Xoá user thử trong Supabase Auth (dashboard → Authentication → tìm `test-wizard@example.com`).

```bash
git worktree remove mini-app-instances/test-wizard --force
```

```bash
git branch -D deploy/test-wizard
```

---

**PASS = tick hết cả 3 test.** Báo "PASS" để merge `feat/store-wizard` vào `main` + push (Vercel tự deploy).
Gặp lỗi ở dòng nào: chụp màn hình + copy nguyên văn lỗi đỏ, gửi lại — không tự sửa tiếp.
