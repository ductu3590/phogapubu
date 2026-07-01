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

## Hardening (không gấp, RLS đã chặn đủ)
- **Ngày ghi:** 2026-07-01
- `store_checkout_configs` đang chặn anon/authenticated hoàn toàn nhờ RLS bật + không có
  policy nào (default-deny). Nhưng bảng vẫn còn GRANT mặc định của Postgres/Supabase cho
  anon/authenticated (SELECT/INSERT/UPDATE/DELETE...) — hiện không gây rủi ro vì RLS chặn hết,
  nhưng là "bẫy" nếu sau này có ai thêm 1 policy permissive cho mục đích khác (vd admin UI nhập
  secret) mà quên xét lại GRANT. Nên chạy `REVOKE ALL ON store_checkout_configs FROM anon,
  authenticated;` trong 1 migration nhỏ riêng, làm phòng thủ thêm (defense-in-depth), không
  bắt buộc.
