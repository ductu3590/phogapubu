# MEVO — Backlog (việc để sau, đừng quên)

> Ghi việc đã quyết làm nhưng hoãn lại. Khi làm xong thì xoá khỏi đây.

## Tự điền Tên + SĐT cho đơn mang về (Zalo getPhoneNumber)
- **Ngày ghi:** 2026-06-28
- **Bối cảnh:** form checkout mang về hiện cho khách **nhập tay** tên + SĐT.
  Code đã gọi `authorize(scope.userPhonenumber)` trong `permission-sheet.tsx` nhưng
  **chưa thực sự lấy/dùng** SĐT.
- **Việc cần làm:**
  1. Gọi `getPhoneNumber()` (zmp-sdk) → nhận `token`.
  2. Backend (edge function) đổi `token` → số điện thoại thật qua Open API của Zalo
     (cần `access_token` của app + secret).
  3. Prefill `customerName` + `customerPhone` ở [checkout](mini-app/src/pages/checkout/index.tsx).
- **Phụ thuộc khi duyệt Zalo:** lúc đó MỚI cần xin quyền
  **"Thông báo xin người dùng cấp quyền truy cập số điện thoại"** ở Bước 1 xét duyệt phiên bản
  (lần publish 2026-06-28 đã CỐ TÌNH bỏ qua vì chưa dùng → tránh bị làm khó khi duyệt).
- **⚠️ Ràng buộc IP Việt Nam:** việc giải mã token getPhoneNumber (và mọi API đọc thông tin
  user như getUserInfo) gọi **từ server**. Zalo **giới hạn dữ liệu trả về cho server có IP
  ngoài Việt Nam** (Vercel US, Supabase Singapore đều là IP ngoại) → data bị cắt/ẩn.
  Khi làm tính năng này phải có **IP Việt Nam**: dựng 1 VPS/route trung gian đặt tại VN làm
  proxy cho riêng các call đọc thông tin user. Tham khảo: Zalo "Giới hạn dữ liệu theo địa chỉ IP".
- **Lý do hoãn:** khách nhập tay vẫn đủ chức năng; ưu tiên publish trước.

## Cần verify khi test sự kiện xoá dữ liệu (user.revoke.consent)
- **Ngày ghi:** 2026-06-28. **Cập nhật 2026-07-02:** URL + nơi lưu secret đã đổi (xem mục
  Onboarding Cockpit ở trên) — webhook giờ là
  `https://pubu.soccernow.net/api/zalo-webhook/87f4c6bc-07b5-4dcd-99d8-067f3417ab5e`
  (đã cập nhật trên Zalo Dev Console), secret đọc từ `store_zalo_configs.zalo_app_secret_key`
  qua `/mevo`, KHÔNG còn dùng env Vercel `ZALO_APP_SECRET_KEY` nữa.
- **Cần kiểm:** chữ ký webhook OA ký bằng **"OA Secret Key"** (hiện ở màn Webhook
  developers.zalo.me) hay **app secret**? Nếu test sự kiện thật mà KHÔNG xử lý (chữ ký không
  khớp) → thử nhập giá trị **OA Secret Key** vào `/mevo/stores/<id>` thay vì app secret.
  (Webhook luôn ack 200 nên không lộ ra khi duyệt — phải xem log Vercel để biết chữ ký có khớp
  không.)
- 🔁 Nhớ **reset app secret cũ `o2Sd2dPVAS21ORQiV6La`** đã lộ trong chat trước đây (không còn
  dùng qua env Vercel nữa nhưng vẫn nên revoke phía Zalo Dev Console cho chắc), rồi nhập secret
  mới vào `/mevo`.

## ✅ ĐÃ XONG — BẮT BUỘC làm trước khi có quán thứ 2 thật (phát hiện 2026-07-01, xong 2026-07-02)
- **Bối cảnh:** viết skill `.claude/skills/replicate-mini-app/SKILL.md` để chuẩn bị nhân bản
  mini-app, phát hiện 3 lỗ hổng chỉ lộ ra khi có ≥2 quán active cùng lúc. Đã xử lý cả 3 trong
  Onboarding Cockpit (xem `docs/superpowers/plans/2026-07-01-mevo-internal-backend-onboarding-cockpit.md`):
  1. **Fallback chọn quán sai** — đã xoá hết, thay bằng `requireOperator()`
     (`admin-web/lib/auth/operator.ts`) đọc `mevo_operators.role/store_id`, fail closed nếu
     thiếu. Đồng thời vá thêm ở tầng RLS (mục 2 bên dưới) — lớp khoá thật, không chỉ tầng UI.
  2. **ZNS multi-tenant** — `zns-notify` đọc `store_zalo_configs.zalo_oa_access_token` theo
     `store_id`, đã deploy production (migration 021, function version 17).
  3. **Webhook multi-tenant** — route đổi thành `admin-web/app/api/zalo-webhook/[storeId]/route.ts`,
     đọc secret theo `storeId` trong URL. **Đã đổi URL trên Zalo Dev Console cho Phở Gà Pubu**
     thành `https://pubu.soccernow.net/api/zalo-webhook/87f4c6bc-07b5-4dcd-99d8-067f3417ab5e`
     (anh Tú xác nhận xong 2026-07-02).
- **Thêm ngoài 3 blocker gốc:** RLS (`006b`) trước đây chỉ check "có phải operator", không check
  đúng quán — đã thêm `is_store_scoped_operator(store_id)` (migration 019), viết lại 17 policy
  trên 9 bảng. Test cross-store (đọc + ghi) đã PASS 2026-07-02.
- Tài khoản `pubu@mevo.vn` đã gán `store_owner` cho Phở Gà Pubu qua `mevo_operators`.

## ✅ ĐÃ XONG — Dọn dẹp cột ZaloPay cũ (2026-07-02)
- Cột `stores.zalopay_app_id/key1/key2` (tàn dư model ZaloPay API cũ) đã xoá — xem migration
  `022_drop_legacy_zalopay_columns.sql`.

## ✅ ĐÃ XONG — Hardening REVOKE (2026-07-02)
- Đã `REVOKE ALL ON store_checkout_configs FROM anon, authenticated` — cùng migration 022.
