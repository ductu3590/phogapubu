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
- **Ngày ghi:** 2026-06-28
- Webhook `https://pubu.soccernow.net/api/zalo-webhook` (admin-web) đã set + Kiểm tra 200 OK.
- **Cần kiểm:** chữ ký webhook OA ký bằng **"OA Secret Key"** (hiện ở màn Webhook
  developers.zalo.me) hay **app secret**? Env Vercel `ZALO_APP_SECRET_KEY` hiện đặt = app
  secret `o2Sd2dPVAS21ORQiV6La`. Nếu test sự kiện thật mà KHÔNG xử lý (chữ ký không khớp) →
  đổi env sang giá trị **OA Secret Key**. (Webhook luôn ack 200 nên không lộ ra khi duyệt.)
- 🔁 Nhớ **reset app secret / OA secret** đã lộ trong chat, rồi cập nhật lại env Vercel.

## Dọn dẹp
- Cột `stores.zalopay_app_id/key1/key2` — tàn dư model ZaloPay API cũ, không dùng từ khi
  chuyển sang Checkout SDK (thay bằng `store_checkout_configs`, xem
  `docs/superpowers/specs/2026-07-01-per-store-zalopay-checkout-secret-design.md`).

## BẮT BUỘC làm trước khi có quán thứ 2 thật (phát hiện 2026-07-01)
- **Bối cảnh:** viết skill `.claude/skills/replicate-mini-app/SKILL.md` để chuẩn bị nhân bản
  mini-app, phát hiện 3 lỗ hổng chỉ lộ ra khi có ≥2 quán active cùng lúc (hiện chỉ 1 quán nên
  chưa gây hại, nhưng KHÔNG được onboard quán 2 thật trước khi xử lý):
  1. **Fallback chọn quán sai trong admin-web** — nhiều file (`admin-web/app/admin/*`,
     `lib/actions/*`) fallback `SELECT * FROM stores WHERE is_active=true LIMIT 1` khi operator
     thiếu `store_id`. Với 2 quán active, operator có thể sửa nhầm menu/bàn của quán khác mà
     không có cảnh báo gì. Grep `is_active.*limit(1)` để tìm hết các chỗ.
  2. **ZNS chưa multi-tenant** — `supabase/functions/zns-notify/index.ts` đọc 1 secret toàn cục
     `ZALO_OA_ACCESS_TOKEN`. Quán 2 có OA riêng sẽ nhận ZNS sai OA hoặc không nhận được gì.
  3. **Webhook xoá dữ liệu chưa multi-tenant** — `admin-web/app/api/zalo-webhook/route.ts` đọc
     1 secret toàn cục `ZALO_APP_SECRET_KEY`. Quán 2 có Zalo App riêng sẽ cần secret riêng.
- **Việc cần làm:** sửa cả 3 theo đúng pattern đã dùng cho ZaloPay Checkout (bảng riêng theo
  `store_id`, xem `docs/superpowers/specs/2026-07-01-per-store-zalopay-checkout-secret-design.md`
  làm mẫu) — làm TRƯỚC khi insert `stores` row thứ 2 với `is_active=true`.

## Hardening (không gấp, RLS đã chặn đủ)
- **Ngày ghi:** 2026-07-01
- `store_checkout_configs` đang chặn anon/authenticated hoàn toàn nhờ RLS bật + không có
  policy nào (default-deny). Nhưng bảng vẫn còn GRANT mặc định của Postgres/Supabase cho
  anon/authenticated (SELECT/INSERT/UPDATE/DELETE...) — hiện không gây rủi ro vì RLS chặn hết,
  nhưng là "bẫy" nếu sau này có ai thêm 1 policy permissive cho mục đích khác (vd admin UI nhập
  secret) mà quên xét lại GRANT. Nên chạy `REVOKE ALL ON store_checkout_configs FROM anon,
  authenticated;` trong 1 migration nhỏ riêng, làm phòng thủ thêm (defense-in-depth), không
  bắt buộc.
