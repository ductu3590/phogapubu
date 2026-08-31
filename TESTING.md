# MEVO — Testing Guide

> **Quy tắc bắt buộc cho Claude Code:**
> Sau khi hoàn thành BẤT KỲ Sprint hoặc task nào, PHẢI dừng lại,
> đưa ra checklist test tương ứng bên dưới và chờ anh Tú xác nhận
> "test pass" trước khi chuyển sang bước tiếp theo.
> KHÔNG được tự động chuyển Sprint khi chưa có xác nhận.

---

## NGUYÊN TẮC TEST CỦA DỰ ÁN MEVO

```
Viết code → Chạy được → Test trên browser → Test trên điện thoại thật → Xác nhận → Tiếp tục
                                                        ↑
                                              BƯỚC NÀY KHÔNG ĐƯỢC BỎ QUA
```

**Thiết bị test bắt buộc:**
- Máy tính Windows (dev server)
- 1 điện thoại Android thật (chạy Zalo) — đây là thiết bị của KHÁCH HÀNG
- 1 tablet hoặc điện thoại thứ 2 (giả lập màn hình bếp) — nếu có

---

## SPRINT 0 — Setup & Kết nối

### Claude Code làm xong khi:
- Monorepo `mevo/` tạo xong với 3 thư mục: `mini-app/`, `admin-web/`, `supabase/`
- SQL migration chạy xong trên Supabase
- Seed data Phở Gà Pubu đã có trong database
- Cả 2 app đều `npm run dev` không lỗi

### ✅ Checklist test — Anh Tú tự làm:

**Test 1 — Supabase database**
1. Vào https://supabase.com → project MEVO → Table Editor
2. Mở bảng `stores` → xác nhận thấy dòng "Phở Gà Pubu"
3. Mở bảng `tables` → xác nhận thấy "Bàn 1" đến "Bàn 10"
4. Mở bảng `menu_items` → xác nhận thấy Phở gà, Phở gà đặc biệt, Nước cam...
5. ✅ PASS nếu: tất cả dữ liệu hiển thị đúng

**Test 2 — Admin web chạy được**
1. Mở terminal → `cd admin-web` → `npm run dev`
2. Mở trình duyệt → vào `http://localhost:3000`
3. ✅ PASS nếu: trang hiển thị, không có lỗi đỏ trên console (F12)

**Test 3 — Mini App chạy được trên điện thoại**
1. Mở terminal → `cd mini-app` → `zmp preview`
2. Zalo CLI tạo QR code trên terminal
3. Mở Zalo trên **điện thoại thật** → Camera → Quét QR đó
4. ✅ PASS nếu: Zalo mở Mini App, dù trang trống hay placeholder cũng được
5. ❌ FAIL nếu: Zalo báo lỗi "không tìm thấy Mini App" hoặc màn hình trắng hoàn toàn

**→ Báo Claude Code:** "Sprint 0 PASS" hoặc mô tả lỗi cụ thể để fix

---

## SPRINT 1 — Menu Khách Hàng

### Claude Code làm xong khi:
- Trang menu load dữ liệu từ Supabase
- Giỏ hàng hoạt động (thêm/bớt/xóa món)
- Tạo đơn hàng lưu vào database
- Trang trạng thái đơn hiển thị

### ✅ Checklist test — Anh Tú tự làm:

**Test 1 — Menu hiển thị đúng (trên điện thoại thật)**
1. Mở Zalo → quét QR preview của mini-app
2. Kiểm tra từng mục:
   - [ ] Tên quán hiển thị: "Phở Gà Pubu"
   - [ ] Chữ "Bàn X" hiển thị rõ ràng (X = số bàn từ QR)
   - [ ] Tab danh mục: "Món chính", "Đồ uống" — có thể bấm chuyển tab
   - [ ] Mỗi món hiện: tên, giá (định dạng 65.000đ, không phải 65000)
   - [ ] Nút [+] bên cạnh mỗi món bấm được
3. ✅ PASS nếu: tất cả checkbox trên đúng

**Test 2 — Giỏ hàng hoạt động đúng**
1. Thêm "Phở gà" → số hiện trên icon giỏ = 1
2. Thêm "Phở gà" lần nữa → số = 2
3. Thêm "Nước cam tươi" → số = 3
4. Mở giỏ hàng:
   - [ ] Phở gà: số lượng 2 × 65.000đ = 130.000đ
   - [ ] Nước cam: số lượng 1 × 25.000đ = 25.000đ
   - [ ] Tổng: 155.000đ (PHẢI đúng chính xác)
5. Bấm [-] bớt 1 Phở gà → tổng đổi thành 90.000đ
6. ✅ PASS nếu: tất cả con số đúng

**Test 3 — Đặt món lưu vào database**
1. Giỏ có ít nhất 1 món → bấm "Đặt món"
2. Mở Supabase → bảng `orders` → F5 refresh
   - [ ] Xuất hiện 1 dòng mới với `status = 'pending'`
   - [ ] `total_amount` đúng với tổng giỏ hàng
   - [ ] `table_id` không rỗng
3. Mở bảng `order_items`:
   - [ ] Có đúng số dòng tương ứng với số món đã chọn
   - [ ] `item_name` và `item_price` là bản snapshot (không phải foreign key)
4. ✅ PASS nếu: database lưu đúng và đầy đủ

**Test 4 — Trang trạng thái đơn**
1. Sau khi đặt món → app chuyển sang trang trạng thái
   - [ ] Hiển thị mã đơn hàng (Order ID hoặc số thứ tự)
   - [ ] Hiển thị trạng thái: "⏳ Đang chờ xác nhận"
   - [ ] Liệt kê đúng các món đã đặt
2. Vào Supabase → đổi `status` của đơn đó thành `confirmed` thủ công
   - [ ] Trang tự động cập nhật (không cần F5): "🍳 Bếp đang làm"
3. Đổi thành `ready`:
   - [ ] Trang cập nhật: "✅ Xong! Nhân viên đang mang ra"
4. ✅ PASS nếu: realtime cập nhật không cần refresh

**Test 5 — Edge cases quan trọng**
1. Mở menu khi **không có mạng** → app báo lỗi rõ ràng (không crash trắng màn hình)
2. Vào Supabase → tắt `is_available = false` cho món "Phở gà"
   - [ ] Về Mini App → "Phở gà" hiển thị mờ + badge "Tạm hết"
   - [ ] Không thể bấm [+] thêm món đó vào giỏ
3. ✅ PASS nếu: cả 2 edge case xử lý đúng

**→ Báo Claude Code:** "Sprint 1 PASS" hoặc liệt kê test nào FAIL + mô tả thấy gì

---

## SPRINT 2 — Thanh Toán ZaloPay

### Claude Code làm xong khi:
- ZaloPay Sandbox tích hợp được trong Mini App
- Callback xử lý đúng (thành công / thất bại)
- Order status tự động cập nhật sau thanh toán

### ✅ Checklist test — Anh Tú tự làm:

> ⚠️ Sprint này dùng **ZaloPay Sandbox** (tiền ảo, không mất tiền thật)
> Tài khoản sandbox test lấy tại: https://developers.zalopay.vn

**Test 1 — ZaloPay mở được trong Zalo**
1. Đặt món → bấm "Thanh toán qua ZaloPay"
   - [ ] ZaloPay mở ngay BÊN TRONG Zalo (không thoát ra app khác)
   - [ ] Hiển thị đúng số tiền của đơn hàng
   - [ ] Tên cửa hàng hiển thị: "MEVO - Phở Gà Pubu"
2. ✅ PASS nếu: ZaloPay mở và hiện đúng thông tin

**Test 2 — Thanh toán thành công (Sandbox)**
1. Dùng tài khoản ZaloPay Sandbox → bấm xác nhận thanh toán
2. Sau khi thanh toán xong:
   - [ ] App quay về trang trạng thái đơn
   - [ ] Trạng thái đổi thành: "🍳 Bếp đang làm" (đã qua confirmed)
3. Vào Supabase → bảng `orders`:
   - [ ] `status = 'confirmed'`
   - [ ] `zalopay_trans_id` có giá trị (không rỗng)
4. ✅ PASS nếu: tất cả đúng

**Test 3 — Khách HUỶ thanh toán**
1. Đặt món → bấm "Thanh toán" → ZaloPay mở → bấm "Huỷ" hoặc back
   - [ ] App quay về trang đơn hàng (không crash)
   - [ ] Vẫn có nút "Thanh toán lại"
2. Vào Supabase → `orders`:
   - [ ] `status` vẫn là `pending` (không đổi)
3. ✅ PASS nếu: huỷ không làm hỏng đơn hàng

**Test 4 — Chọn "Trả tiền mặt"**
1. Đặt món → chọn "Thanh toán tiền mặt"
   - [ ] Đơn được tạo với `payment_method = 'cash'`
   - [ ] Không mở ZaloPay
   - [ ] Trang trạng thái hiện: "⏳ Đơn đã gửi — thanh toán khi về"
2. ✅ PASS nếu: flow tiền mặt hoạt động độc lập

**Test 5 — Callback bảo mật**
1. Kiểm tra trong Supabase Edge Function logs:
   - [ ] Callback từ ZaloPay có chữ ký MAC hợp lệ
   - [ ] Log không có lỗi 500 hay authentication error
2. ✅ PASS nếu: không có lỗi trong logs

**→ Báo Claude Code:** "Sprint 2 PASS" hoặc mô tả lỗi

---

## SPRINT 3 — Kitchen Display & ZNS

### Claude Code làm xong khi:
- Kitchen Display hiển thị đơn realtime
- Nhân viên bếp cập nhật trạng thái được
- ZNS gửi thông báo Zalo đến khách

### ✅ Checklist test — Anh Tú tự làm:

> 💡 Test này cần 2 thiết bị: điện thoại (khách) + máy tính hoặc tablet (bếp)

**Test 1 — Kitchen Display load đúng**
1. Mở trình duyệt máy tính → vào `http://localhost:3000/kitchen/pho-ga-pubu`
   - [ ] Trang hiển thị tên quán
   - [ ] Có 3 cột: "Chờ xử lý" / "Đang làm" / "Xem lại"
   - [ ] Không có lỗi console (F12)
2. ✅ PASS nếu: trang hiển thị đúng layout

**Test 2 — Đơn mới hiện realtime (QUAN TRỌNG NHẤT)**
1. Mở Kitchen Display trên máy tính — để màn hình này luôn hiển thị
2. Trên điện thoại → đặt 1 đơn mới qua Mini App
3. Quan sát màn hình Kitchen:
   - [ ] Đơn xuất hiện trong cột "Chờ xử lý" mà KHÔNG cần F5
   - [ ] Thời gian xuất hiện: dưới 5 giây
   - [ ] Hiển thị đúng: số bàn, tên món, số lượng
   - [ ] Có âm thanh thông báo (nếu đã implement)
4. ✅ PASS nếu: đơn hiện trong vòng 5 giây, không cần refresh

**Test 3 — Cập nhật trạng thái đơn**
1. Trên Kitchen Display → bấm "Bắt đầu làm" cho đơn vừa tạo
   - [ ] Card chuyển sang cột "Đang làm"
   - [ ] Trên điện thoại khách: trạng thái đổi thành "🍳 Bếp đang làm"
2. Bấm "Đã xong":
   - [ ] Card chuyển sang cột "Xem lại"
   - [ ] Vào Supabase → `orders.status = 'ready'`
3. ✅ PASS nếu: cả 2 chiều cập nhật đúng

**Test 4 — ZNS thông báo Zalo**
1. Sau khi bếp bấm "Đã xong":
   - [ ] Trong vòng 30 giây: điện thoại nhận tin nhắn Zalo từ MEVO OA
   - [ ] Nội dung đúng: tên quán, số bàn, số đơn
2. Vào Zalo OA Manager → Message logs:
   - [ ] Có bản ghi ZNS được gửi với `status = success`
3. ✅ PASS nếu: tin nhắn đến trong 30 giây

**Test 5 — Kitchen hoạt động liên tục (stress test nhẹ)**
1. Đặt 5 đơn liên tiếp từ điện thoại (mỗi đơn cách nhau 10 giây)
   - [ ] Tất cả 5 đơn xuất hiện đủ trên Kitchen
   - [ ] Thứ tự đúng (mới nhất lên đầu)
   - [ ] Không có đơn nào bị mất hoặc duplicate
2. ✅ PASS nếu: 5/5 đơn hiển thị đúng

**→ Báo Claude Code:** "Sprint 3 PASS" hoặc mô tả lỗi

---

## SPRINT 4 — Admin Dashboard

### Claude Code làm xong khi:
- Login/logout hoạt động
- CRUD menu đầy đủ
- Tạo bàn + download QR
- Danh sách đơn hàng

### ✅ Checklist test — Anh Tú tự làm:

**Test 1 — Authentication**
1. Vào `http://localhost:3000/admin/login`
   - [ ] Nhập sai mật khẩu → thông báo lỗi rõ ràng (không crash)
   - [ ] Nhập đúng → chuyển vào dashboard
2. Copy URL dashboard → mở tab ẩn danh (Ctrl+Shift+N) → paste URL
   - [ ] Tự động redirect về trang login (không vào được khi chưa đăng nhập)
3. Đăng nhập → bấm "Đăng xuất"
   - [ ] Quay về trang login
   - [ ] Bấm Back trên browser → không vào được dashboard
4. ✅ PASS nếu: tất cả 3 scenario đúng

**Test 2 — Quản lý menu: Thêm món mới**
1. Admin → Menu → bấm "Thêm món"
2. Điền: tên "Phở bò tái", giá 75000, danh mục "Món chính"
3. Bấm Lưu
4. Ngay lập tức: mở Mini App trên điện thoại → vào menu
   - [ ] "Phở bò tái" xuất hiện với giá 75.000đ
   - [ ] Không cần restart hay clear cache
5. ✅ PASS nếu: xuất hiện ngay trên Mini App

**Test 3 — Tắt món hết hàng**
1. Admin → Menu → tìm "Phở gà" → toggle tắt (is_available = false)
2. Mở Mini App:
   - [ ] "Phở gà" hiển thị mờ + badge "Tạm hết"
   - [ ] Không bấm [+] được
3. Admin → bật lại → Mini App: Phở gà hoạt động bình thường
4. ✅ PASS nếu: toggle hoạt động 2 chiều

**Test 4 — Tạo bàn và QR**
1. Admin → Quản lý bàn → "Thêm bàn" → nhập "Bàn VIP 1"
2. Bấm download QR cho "Bàn VIP 1"
   - [ ] File PNG tải xuống thành công
   - [ ] Tên file có chứa tên bàn (ví dụ: `mevo-ban-vip-1.png`)
3. Mở file PNG → dùng Google Lens hoặc camera Zalo quét
   - [ ] URL decode ra đúng: có `store=pho-ga-pubu` và `table=[uuid của bàn VIP 1]`
4. Quét QR đó bằng Zalo:
   - [ ] Mini App mở với tên "Bàn VIP 1"
5. ✅ PASS nếu: toàn bộ flow tạo QR → quét → mở đúng bàn

**Test 5 — Danh sách đơn hàng**
1. Admin → Đơn hàng
   - [ ] Thấy các đơn đã tạo trong quá trình test
   - [ ] Lọc theo ngày hôm nay → hiện đúng số đơn
2. Tìm đơn có `payment_method = 'cash'` → bấm "Đã thanh toán"
   - [ ] Status đổi thành `paid`
   - [ ] Dashboard: doanh thu tăng thêm đúng số tiền đơn đó
3. ✅ PASS nếu: đánh dấu thanh toán và tính doanh thu đúng

**→ Báo Claude Code:** "Sprint 4 PASS" hoặc mô tả lỗi

---

## SPRINT 5 — Deploy & Test Thực Tế

### ✅ Checklist deploy:

**Deploy Admin Web lên Vercel**
1. Push code lên GitHub → Vercel tự deploy
2. Vào URL Vercel thật (không phải localhost):
   - [ ] Login được
   - [ ] Tất cả tính năng hoạt động như localhost
   - [ ] Không có lỗi CORS hay missing env vars

**Deploy Mini App lên Zalo**
1. `zmp deploy` thành công
2. Zalo tạo QR production
3. Quét QR bằng **tài khoản Zalo khác** (không phải tài khoản developer):
   - [ ] Mini App mở được
   - [ ] Menu load được
   - [ ] Đặt món được
   - [ ] ZaloPay production hoạt động (thanh toán tiền thật, dùng số tiền nhỏ 1.000đ)

**Test thực tế tại Phở Gà Pubu**
1. In QR của "Bàn 1" → dán lên bàn thật
2. Nhờ chủ quán (người em) dùng điện thoại của họ quét:
   - [ ] Chưa bao giờ dùng MEVO → quét QR → tự order được không cần hướng dẫn
   - [ ] Đơn ra màn hình bếp đúng
   - [ ] ZNS đến điện thoại họ
3. Quan sát và ghi lại:
   - [ ] Họ bị stuck ở bước nào?
   - [ ] Có từ ngữ nào trên UI họ không hiểu?
   - [ ] Tốc độ load có chấp nhận được không?
4. ✅ PASS nếu: người không biết gì tự dùng được trong 2 phút

---

## PLAN 2 — Siết bảo mật (2a + 2b)

> Thiết kế: `docs/superpowers/specs/2026-06-24-mevo-plan2-security-2a-2b-design.md`
> Apply migration theo ĐÚNG thứ tự rollout. Mỗi task test xong mới sang task sau.

### TASK 2a — Operator allowlist (chặn "ai đăng nhập cũng là admin")

**Trước khi test — apply theo thứ tự (Supabase → SQL Editor):**
1. Chạy `supabase/migrations/006_operator_table.sql` (tạo bảng, CHƯA siết RLS → admin vẫn vào được).
2. **Seed tài khoản admin của anh** (thay email cho đúng tài khoản đang đăng nhập):
   ```sql
   insert into mevo_operators (user_id, store_id)
   select id, null from auth.users where email = 'EMAIL_ADMIN_CUA_ANH'
   on conflict (user_id) do nothing;
   ```
   → Vào bảng `mevo_operators` xác nhận có 1 dòng với `user_id` của anh.
3. Đăng nhập admin thử — phải vào được bình thường (lúc này RLS chưa siết).
4. Chạy `supabase/migrations/006b_tighten_admin_rls.sql` (giờ mới siết RLS).

**✅ Checklist test — Anh Tú tự làm:**

**Test 1 — Operator (tài khoản anh) vẫn dùng admin bình thường**
1. Đăng nhập admin bằng tài khoản đã seed
   - [ ] Vào được dashboard
   - [ ] Menu / Bàn / Đơn hàng đều **hiển thị dữ liệu** (không trống, không lỗi đỏ)
   - [ ] Sửa 1 món / bật-tắt 1 món → lưu được
2. ✅ PASS nếu: admin hoạt động y như trước khi siết

**Test 2 — Tài khoản KHÔNG phải operator bị chặn**
1. Tạo 1 user mới trong Supabase (Authentication → Add user, email bất kỳ) — **không** thêm vào `mevo_operators`
2. Đăng nhập admin bằng tài khoản mới đó
   - [ ] Ngay sau khi bấm "Đăng nhập": hiện thông báo đỏ "Tài khoản chưa được cấp quyền vận hành" **ngay tại trang login** (không treo "Đang đăng nhập", không cần F5)
   - [ ] **Không** vào được dashboard dù thử gõ thẳng URL `/admin/menu`, `/admin/orders`
   - [ ] Console F12 **không** có lỗi hydration
3. ✅ PASS nếu: người ngoài allowlist không vào được bất kỳ trang admin nào

**Test 3 — Không tự khoá, không vòng lặp**
1. Với tài khoản operator: đăng xuất → đăng nhập lại vài lần
   - [ ] Không bị kẹt vòng lặp redirect, không màn hình trắng
2. ✅ PASS nếu: ra/vào mượt

**→ Báo Claude Code:** "2a PASS" hoặc mô tả lỗi (kèm Console F12). Chưa sang 2b khi 2a chưa PASS.

---

### TASK 2b — Token bếp theo quán + khoá anon UPDATE

**Chuẩn bị (BẮT BUỘC trước khi test):**
1. **Env admin-web** — thêm vào `admin-web/.env.local` (server-only, KHÔNG có `NEXT_PUBLIC_`):
   ```
   SUPABASE_JWT_SECRET=<Supabase → Settings → API → JWT Secret>
   ```
   Restart `npm run dev` sau khi thêm.
2. **Apply `supabase/migrations/007a_kitchen_isolation.sql`** (additive — CHƯA khoá anon UPDATE, bếp cũ vẫn chạy).
   - Sau khi chạy: mở bảng `stores` xác nhận có cột `kitchen_token_version` = 1.

> ⚠️ CHƯA chạy `007b` ở giai đoạn này. `007b` chỉ chạy ở Test 5 (cuối cùng).

**✅ Checklist test — Anh Tú tự làm:**

**Test 1 — Lấy link bếp + mở được màn hình bếp**
1. Admin → "Màn hình bếp" → bấm "Lấy link bếp" → bấm "Copy"
2. Mở link đó trên tablet/tab mới
   - [ ] Màn hình bếp hiện đúng tên quán + 3 cột (Chờ/Đang làm/Xem lại)
   - [ ] Thanh địa chỉ KHÔNG còn `?k=...` (token đã ẩn vào localStorage)
   - [ ] Console F12 không lỗi
3. Mở `/kitchen/pho-ga-pubu` **không** kèm token trên 1 trình duyệt chưa từng mở
   - [ ] Hiện màn hình "Chưa cấu hình bếp" (không tải đơn)
4. ✅ PASS nếu: có token thì vào được, không token thì bị chặn

**Test 2 — Đơn mới realtime + đổi trạng thái qua token**
1. Mở bếp (đã có token) — để màn hình hiển thị
2. Điện thoại → đặt 1 đơn mới (tiền mặt cho nhanh)
   - [ ] Đơn hiện ở cột "Chờ xử lý" trong 5 giây, không cần F5
3. Bấm "Bắt đầu làm" → "Đã xong"
   - [ ] Card chuyển cột đúng
   - [ ] Supabase: `orders.status` của đơn đó = `cooking` rồi `ready`
4. ✅ PASS nếu: realtime + đổi trạng thái chạy bằng token

**Test 3 — Cô lập giữa các quán (QUAN TRỌNG NHẤT — đây là lỗ P0)**
> Cần 1 quán thứ 2 trong DB. Nếu chưa có, tạo nhanh trong Supabase:
> `insert into stores (name, slug) values ('Quán Test 2', 'quan-test-2');`
> rồi `insert into tables (store_id, table_number) select id, 'Bàn 1' from stores where slug='quan-test-2';`
1. Lấy link bếp của **Phở Gà Pubu**. Mở màn hình bếp Phở Gà Pubu.
2. Đặt 1 đơn cho **Quán Test 2** (hoặc tạo thủ công 1 dòng `orders` với `store_id` của Quán Test 2 trong Supabase).
   - [ ] Đơn của Quán Test 2 **KHÔNG** xuất hiện trên bếp Phở Gà Pubu
3. (Nâng cao, nếu rành) lấy token bếp Phở Gà Pubu, thử query đơn Quán Test 2 → phải **rỗng**.
4. ✅ PASS nếu: bếp quán này tuyệt đối không thấy đơn quán khác

**Test 4 — Thu hồi token**
1. Mở bếp Phở Gà Pubu bằng token đang dùng (đang chạy bình thường)
2. Admin → "Màn hình bếp" → "Thu hồi & cấp lại" → xác nhận
3. Trên tablet bếp đang mở (token cũ): F5 lại trang
   - [ ] Không tải được đơn nữa (token cũ đã chết) — hiện lỗi/không có đơn
4. Mở link MỚI vừa cấp
   - [ ] Bếp chạy lại bình thường
5. ✅ PASS nếu: token cũ chết ngay, token mới chạy

**Test 5 — Khoá anon UPDATE (007b) + mini-app không hỏng**
> Chỉ chạy bước này SAU khi Test 1–4 PASS và tablet đã dùng token.
1. **Apply `supabase/migrations/007b_lock_anon_update.sql`**
2. Trên bếp (token): đặt đơn mới → "Bắt đầu làm" → "Đã xong"
   - [ ] Vẫn đổi trạng thái được (qua RPC, không phải anon UPDATE)
3. Mini-app: đặt đơn ZaloPay → huỷ/bỏ dở → chọn "Trả tiền mặt"
   - [ ] Đơn chuyển `payment_method = 'cash'` (abandon qua RPC + token chạy)
   - [ ] Bếp hiện đơn đó ở cột chờ
4. Admin → Đơn hàng → đánh dấu 1 đơn tiền mặt là "Đã thanh toán"
   - [ ] `status = paid` (operator vẫn update được)
5. ✅ PASS nếu: sau khi khoá anon, mọi luồng hợp lệ vẫn chạy

**→ Báo Claude Code:** "2b PASS" hoặc mô tả lỗi (ghi rõ Test mấy + Console F12).

---

## TÍNH NĂNG TOPPING — Topping dùng chung (v2, 2026-06-30)

### Claude Code làm xong khi:
- Migration `016_toppings_shared.sql` đã áp prod (kho `toppings` + bảng nối `menu_item_toppings(menu_item_id,topping_id)` + RPC `create_order` v3 validate topping qua bảng nối).
- Admin: khu "🧀 Topping" trong trang menu để quản kho; modal sửa món tick checkbox gán topping. Mini-app chọn topping qua bottom sheet; bếp + màn theo dõi đơn hiển thị topping.
- `tsc` mini-app không thêm lỗi mới (baseline 147); admin `tsc` = 0 + vitest 2/2; admin `next build` xanh.

### ✅ Checklist test — Anh Tú tự làm:

**Admin (máy tính) — kho topping dùng chung:**
1. Quản lý menu → cột trái bấm **"🧀 Topping"** → khu kho hiện ra. Thêm 2 topping (VD "Thêm trứng" 10000, "Quẩy" 5000) bằng ô tên + ô giá + "+ Thêm". (Ô tên giờ rộng full hàng — nhập tên được bình thường.)
2. Trong kho: toggle 1 topping sang "tạm hết" → topping đó KHÔNG hiện cho khách ở mini-app. Xoá 1 topping → biến mất khỏi kho VÀ khỏi mọi món đã gán.
3. Sửa 1 **món** → mục "Topping của món (tick để gán)": tick các topping phù hợp → reload thấy badge "N topping" trên dòng món; bỏ tick → giảm.
4. Gán cùng 1 topping cho nhiều món khác nhau → đều dùng chung 1 topping trong kho (sửa giá/tên trong kho 1 lần, mọi món cập nhật).
5. Thêm MÓN MỚI → modal sửa tự mở → tick gán topping ngay.

**Mini-app (điện thoại thật):**
5. Món KHÔNG topping: nút +/- quick-add hoạt động như cũ.
6. Món CÓ topping: bấm "+" mở bottom sheet; tick topping → tổng tiền 1 suất cập nhật đúng; "Thêm vào giỏ" = +1 suất.
7. Thêm cùng món với 2 tổ hợp topping khác nhau → giỏ có 2 dòng riêng; cùng tổ hợp → gộp số lượng.
8. Badge trên nút "+" của món có topping = tổng số mọi tổ hợp đã thêm.
9. Checkout: mỗi dòng hiện topping dạng "+ Trứng, + Quẩy" + đơn giá gồm topping; tổng tiền khớp.

**Đơn hàng (server tính đúng + snapshot):**
10. Đặt 1 đơn có topping → DB `order_items.selected_toppings` có `[{id,name,price}]`; `orders.total_amount` = Σ (giá món + Σ topping) × số lượng.
11. Màn theo dõi đơn (mini-app): mỗi món hiện dòng "+ Trứng, + Quẩy"; tiền từng dòng đúng (gồm topping).
12. Màn bếp: hiện topping dưới tên món.
13. (Bảo mật) Thử đặt đơn với topping đã "tạm hết" (giả lập sửa client) → RPC từ chối ("Topping không hợp lệ").

**Deploy (BẮT BUỘC trước khi test đơn thật):**
14. Đã `cd mini-app && zmp deploy` bản mới. (RPC v2 đã áp prod ở bước migration, tương thích ngược app cũ.)

**→ Báo Claude Code:** "Topping PASS" hoặc mô tả lỗi (ghi rõ Test mấy + Console F12).

---

## ZALOPAY — SECRET THEO TỪNG QUÁN (2026-07-01)

### Claude Code làm xong khi:
- Migration 017 áp dụng, bảng `store_checkout_configs` có đúng 1 dòng cho Pubu.
- 2 edge function `checkout-create-mac`/`checkout-notify` đọc secret từ DB, không còn biến
  môi trường `ZALO_CHECKOUT_SECRET_KEY`.

### ✅ Checklist test — Anh Tú tự làm:

**Test 1: Đặt đơn ZaloPay bình thường**
1. Mở mini-app Pubu → đặt món → thanh toán ZaloPay.
2. ✅ PASS nếu: thanh toán thành công, đơn chuyển sang bếp bình thường — y hệt trước khi đổi.

**Test 2: Không có gì đổi ở phía khách hàng**
1. Kiểm tra toàn bộ luồng đặt món/giỏ hàng/theo dõi đơn — không có màn hình nào thay đổi.
2. ✅ PASS nếu: không thấy khác biệt gì so với trước.

**→ Báo Claude Code:** "ZaloPay per-store PASS" hoặc mô tả lỗi (kèm Console F12 nếu có).

---

## SPRINT — Onboarding Cockpit (`/mevo`) — 2026-07-01

### Claude Code làm xong khi:
- Migration 018-021 đã áp lên Supabase (role, RLS store-scoped, store_app_configs, store_zalo_configs).
- `/mevo` chạy được: dashboard, danh sách quán, tạo quán, chi tiết quán, gán operator.
- `/admin` không còn fallback "quán active đầu tiên" ở bất kỳ trang/action nào.
- `zns-notify` và `zalo-webhook` đọc secret theo `store_id`, không còn dùng biến môi trường toàn cục.

### ✅ Checklist test — Anh Tú tự làm:

**Test 1 — Routing theo role**
1. Đăng nhập bằng tài khoản MEVO hiện tại (superadmin) → phải vào `/mevo`, không bị đẩy sang `/admin`.
2. Vào thẳng URL `/admin` khi đang là superadmin → phải bị đẩy về `/mevo` (không vào được).
3. Đăng xuất, thử vào `/mevo` hoặc `/admin` khi chưa đăng nhập → phải về `/login`.

**Test 2 — Tạo quán thử + gán operator**
1. Vào `/mevo/stores/new`, tạo 1 quán test (vd "Test Quán 2").
2. Vào chi tiết quán vừa tạo, điền Mini App ID + Checkout secret bất kỳ (giá trị test) → bấm Lưu.
3. Load lại trang → xác nhận ô secret **không hiện lại giá trị cũ**, chỉ thấy "Đã cấu hình".
4. Gán 1 email test làm chủ quán → nhận được tài khoản/mật khẩu tạm.
5. Đăng nhập bằng tài khoản chủ quán test đó → phải vào `/admin`, thấy đúng tên quán test (không
   phải Phở Gà Pubu).

**Test 3 — RLS store-scoped (quan trọng nhất — bắt buộc PASS trước khi onboard quán 2 thật)**
1. Mở DevTools (tab Network hoặc Console) khi đã đăng nhập bằng tài khoản chủ quán test (Test 2).
2. Copy `access_token` từ cookie/session, gọi thẳng Supabase REST
   (`GET {SUPABASE_URL}/rest/v1/stores?select=*` với header `apikey: <anon key>` và
   `Authorization: Bearer <access_token>` của tài khoản chủ quán test).
3. Kỳ vọng: CHỈ thấy row "Test Quán 2" (quán của chính họ), KHÔNG thấy "Phở Gà Pubu" hay quán khác.
4. Thử `PATCH` vào `menu_items` của Phở Gà Pubu (biết `id` món ăn thật) bằng session của tài khoản
   Test Quán 2 → phải bị từ chối (0 rows affected hoặc lỗi RLS), không được sửa thành công.

**Test 4 — Dọn quán test**
1. Xoá quán "Test Quán 2" và tài khoản operator test đã tạo (qua Supabase Dashboard hoặc SQL),
   không để lại rác trong production DB.

**Test 5 — ZNS + webhook (nếu có sẵn OA token thật để test)**
1. Đặt 1 đơn ở quán Phở Gà Pubu (quán thật, đã có `store_zalo_configs`), để bếp bấm "Xong".
2. Xác nhận vẫn nhận được tin nhắn Zalo như trước (hành vi không đổi vì đã có secret theo store_id).

---

## SPRINT SA-1 — Database, role và RPC (Staff Assisted Ordering) — 2026-07-16

> 📄 **Checklist đầy đủ nằm ở file riêng: [`TESTING-SA1.md`](TESTING-SA1.md)** (theo lệ
> `TESTING-V2.md`, `TESTING-VOUCHER.md`). Đừng chép lại nội dung vào đây — hai bản song song
> chắc chắn sẽ lệch nhau.

**Tóm tắt:** sprint hạ tầng, **không có giao diện** (nhân viên chưa có gì để bấm; UI `/staff` ở
SA-3). Giá trị đo bằng những việc nhân viên **KHÔNG làm được nữa** → test bằng script SQL +
đối chiếu quyền chủ quán, không phải mở app bấm thử.

**Xong khi:** migration `028` áp prod (2026-07-16) · helper `is_store_owner_or_admin()` gác 11
policy GHI / 6 bảng · role `store_staff` · RPC `staff_create_order` + `confirm_manual_payment` ·
`bank_transfer` + cột audit đơn · `lib/revenue.ts` gộp luật doanh thu (27 test pass, tsc 0 lỗi).

**Hai test quan trọng nhất:** Test 1 (script `sa1-verify.sql` → 15 dòng `: OK`) và Test 2 (chủ
quán Pubu **không** bị khoá nhầm khỏi `/admin`).

---

## SPRINT PM-1 — Vá bug notify + gộp doanh thu (Multi-method Payment) — 2026-07-21

> 📄 **Checklist đầy đủ nằm ở file riêng: [`TESTING-PM1.md`](TESTING-PM1.md)** (theo lệ
> `TESTING-SA1.md`, `TESTING-VOUCHER.md`).

**Tóm tắt:** sprint **additive** — vá bug "notify BANK = đã trả tiền" (thoát app ngân hàng vẫn
được tính doanh thu), gộp mọi luật "đã thu tiền" về `payment_received_at`. **KHÔNG rename kênh**
(mini-app vẫn gửi `zalopay`) nên mini-app KHÔNG cần deploy lại.

**Xong khi:** migration `030` áp prod (2026-07-21) · `checkout-notify` v13 (BANK chỉ handoff) ·
`confirm_manual_payment` set `via='owner'` · `staff_create_order`/`create_order` set
`payment_amount` · cột `payment_instrument`/`payment_received_via`/`bank_handoff_at`/
`has_payment_tail`/`payment_amount` · doanh thu/spin/voucher gộp về `payment_received_at`
(revenue 63 test + decide 10 test pass).

**Test quan trọng nhất:** Test 1 (thoát app ngân hàng → đơn KHÔNG vào bếp/doanh thu) và Test 2
(ví ZaloPay mới vẫn vào doanh thu — bẫy regression).

---

## SPRINT — 3 việc sau PM-1 (UX CK mini-app + badge + tự huỷ/tự hoàn tất) — 2026-07-22

> 📄 **Checklist đầy đủ: [`TESTING-PM-FOLLOWUPS.md`](TESTING-PM-FOLLOWUPS.md).**

**Tóm tắt:** ① mini-app đơn chuyển khoản bỏ chờ 20-30s + hộp "thanh toán lại" (coi
`bank_handoff_at` = đã ghi nhận); ② badge nguồn/loại đơn ở Admin Đơn hàng; ③ migration `031`:
tự hoàn tất đơn TẠI BÀN khi bếp xong + đã nhận tiền (trigger, live prod) + tự huỷ đơn khách
online bỏ dở > 30' (lazy quét khi mở Admin Đơn hàng).

**Cần deploy:** admin-web (②③a lên Vercel khi merge) + **mini-app `zmp deploy`** (①). ③b (auto
hoàn tất) đã live prod.

---

## SPRINT PM-3 — Bếp/quán xác nhận đơn khách chuyển khoản + vào bếp theo order_source — 2026-07-22

> 📄 **Checklist đầy đủ: [`TESTING-PM3.md`](TESTING-PM3.md).** KHÔNG đụng mini-app → không cần zmp deploy.

**Tóm tắt:** vá lỗ đơn khách chuyển khoản bị KẸT (không ai xác nhận được → không vào doanh thu).
Migration `033`: `kitchen_confirm_payment` (bếp bấm trên màn bếp) + nới `confirm_manual_payment`
(owner xác nhận đơn khách CK). Màn bếp thêm cột "💰 CHỜ THANH TOÁN" (tự ẩn khi rỗng). Predicate
vào bếp đổi theo `order_source` (§7): khách tự đặt chỉ vào bếp khi đã có tiền; staff vào ngay.

**Test quan trọng nhất:** khách CK → cột "Chờ thanh toán" ở màn bếp → bấm "Đã nhận tiền" → đơn
vào bếp + vào doanh thu.

---

## SPRINT — Wizard tạo quán + onboard mini-app — 2026-07-24

> Checklist chi tiết tách ra file riêng cho gọn:
> **[docs/CHECKLIST-TEST-WIZARD-TAO-QUAN-2026-07-24.md](docs/CHECKLIST-TEST-WIZARD-TAO-QUAN-2026-07-24.md)**
> — 3 test (wizard đủ 5 bước / bỏ qua + F5 + slug trùng / `onboard quán`) + SQL kiểm DB + dọn dẹp.
> PASS cả 3 rồi mới merge `feat/store-wizard` vào main.

---

## KHI GẶP LỖI — Cách báo cáo hiệu quả

Khi test FAIL, báo Claude Code theo format này để fix nhanh nhất:

```
❌ FAIL: [Tên test]
Bước thực hiện: [Anh làm gì]
Kết quả mong đợi: [Anh expect thấy gì]
Kết quả thực tế: [Anh thực sự thấy gì]
Console error (nếu có): [Copy paste lỗi từ F12]
Thiết bị: [Android Samsung Galaxy / Chrome Windows...]
```

**Ví dụ báo lỗi tốt:**
```
❌ FAIL: Sprint 1 - Test 2 - Giỏ hàng
Bước: Thêm Phở gà 2 lần + Nước cam 1 lần
Expect: Tổng = 155.000đ
Thực tế: Tổng = 65.000đ (chỉ tính 1 món)
Console: Không có lỗi
Thiết bị: Samsung Galaxy A54, Android 13, Zalo 23.11
```

---

## VÒNG LẶP VÀNG

```
Claude Code code xong task
       ↓
Claude Code nói: "Xong rồi anh Tú, test theo TESTING.md — [Sprint X, Test Y] nhé"
       ↓
Anh Tú test trên điện thoại thật
       ↓
    PASS? ──────YES──────→ "OK pass, tiếp tục"
      │                           ↓
      NO                   Claude Code làm task tiếp
      ↓
Báo lỗi theo format trên
      ↓
Claude Code fix → test lại từ đầu Sprint đó
```

## Thanh toán lại khi khách thoát màn chọn phương thức (2026-08-06)

Spec: `docs/superpowers/specs/2026-08-06-repay-abandoned-checkout-design.md`
Cần `zmp deploy` bản **Development** rồi thử trên Zalo thật — Checkout SDK không chạy trên trình duyệt.

**Ghi lại `orderId` của đơn vừa tạo** để kiểm DB đúng đơn đó. Đừng lọc theo "10 phút gần nhất" —
quán có thể đang có đơn thật chạy song song.

Câu kiểm dùng chung (thay `<orderId>`):
```sql
select status, payment_received_at, payment_method from orders where id = '<orderId>';
```

### Nhóm 1 — luồng chính

1. Bấm "Đặt món & Thanh toán" → thoát ngay ở màn chọn phương thức
   → **giỏ còn nguyên món**, banner đỏ "Thanh toán chưa thành công" hiện, KHÔNG bị chuyển trang.
2. Khi banner hiện: KHÔNG thấy nút "Đặt món & Thanh toán" gốc; nút tăng/giảm số lượng, ghi chú,
   mã giảm giá, chọn phương thức thanh toán, form mang về đều mờ và KHÔNG bấm được.
3. Bấm "Thanh toán lại" → sheet Zalo mở lại → chọn chuyển khoản và trả tiền
   → vào trang trạng thái đơn. Kiểm DB: status khác `cancelled`, và **không có đơn thứ hai**
   (`select count(*) from orders where store_id='<storeId>' and created_at > '<lúc bắt đầu test>';`)
4. Bấm "Sửa món" → banner tắt, nút "Đặt món & Thanh toán" quay lại, form mở khoá
   → thêm 1 món → đặt lại → đơn cũ `cancelled`, đơn mới tổng tiền đúng.
5. Chuyển khoản: bấm Xác nhận → sang app ngân hàng → quay lại Zalo
   → vào trang trạng thái đơn như cũ, **KHÔNG** thấy banner.
6. Ví ZaloPay (chỉ quán đã đăng ký Zalo Merchant): trả xong → đơn tự `confirmed`, vào bếp,
   KHÔNG thấy banner.

### Nhóm 2 — lách khoá (đây là chỗ dễ hỏng nhất)

7. Đang có banner → bấm back về menu → thử **thêm món** và **đổi số lượng** ở menu
   → giỏ KHÔNG đổi → quay lại giỏ hàng → banner còn nguyên, món vẫn đúng như trước.
8. Đang có banner → rời sang tab khác rồi quay lại giỏ hàng → banner dựng lại đúng.
9. Đang có banner → **thoát hẳn mini-app rồi quét QR mở lại** → hiện hộp thoại
   **"Bạn còn đơn chưa thanh toán"** kèm đúng số tiền của đơn cũ, với hai nút.
9a. Bấm **"Tiếp tục đặt món"** → sang màn giỏ hàng: **món vẫn còn nguyên trong giỏ**, tổng tiền
    khớp đúng số hiện trong hộp thoại (KHÔNG phải 0đ), banner "Thanh toán chưa thành công"
    nằm trên. Bấm "Thanh toán lại" → trả đúng số tiền đó.
9b. Làm lại từ bước 9, lần này bấm **"Huỷ món"** → hộp thoại tắt, hiện "Đã huỷ đơn cũ",
    ở lại menu. Kiểm DB: `select status from orders where id='<orderId>';` ra `cancelled`.
9c. Mở lại app lần nữa → **KHÔNG** còn hộp thoại (đơn đã chết, key đã được dọn im lặng).
9d. Nhờ bếp bấm "Đã nhận tiền" cho đơn cũ → thoát app → mở lại
    → **KHÔNG** hiện hộp thoại, và **giỏ hàng trống** (món đó đã mua rồi).
9e. Sau 9b (đã huỷ món) → **giỏ hàng vẫn còn nguyên món**, sửa/thêm được bình thường,
    bấm "Đặt món & Thanh toán" tạo đơn mới đúng tổng tiền.

### Nhóm 2b — lưu giỏ hàng (mới)

9f. Chọn vài món, **KHÔNG** bấm thanh toán → thoát hẳn app → mở lại
    → giỏ còn nguyên món, nút giỏ nổi hiện đúng số lượng và tổng tiền.
    (Đây là ca "chọn cả loạt cho bạn bè rồi lỡ thoát app".)
9g. Thanh toán xong một đơn (trả tiền thật) → thoát app → mở lại → **giỏ trống**.
9h. Để máy qua hơn 6 tiếng rồi mở lại → giỏ cũ đã bị bỏ, không hiện lại.
    (Khó test nhanh — có thể sửa tay `savedAt` trong localStorage key `mevo_cart` để giả lập.)

### Nhóm 3 — ba ca mà bản plan đầu tiên làm sai

10. **Đơn bị sweep:** đang có banner → chạy
    `update orders set status='cancelled' where id='<orderId>';`
    → bấm "Thanh toán lại" → banner tắt, hiện "Đơn cũ đã hết hạn. Mời bạn đặt lại.",
    **giỏ hàng VẪN CÒN MÓN**, nút "Đặt món & Thanh toán" quay lại.
11. **Đơn đã thu tiền:** đang có banner → nhờ bếp bấm "Đã nhận tiền" trên màn bếp
    → bấm "Thanh toán lại" → chuyển thẳng sang trang trạng thái đơn, giỏ được xoá.
12. **Mất mạng:** đang có banner → bật chế độ máy bay → bấm "Thanh toán lại"
    → banner **VẪN CÒN**, giỏ vẫn còn món, hiện thông báo lỗi.
    Tắt chế độ máy bay → bấm lại → thanh toán bình thường.

### Nhóm 4 — dọn dẹp

13. Đơn mang về, thoát ở màn chọn phương thức → kiểm `localStorage`:
    `mevo_last_takeaway_order` đã bị xoá, `mevo_unpaid_order` có giá trị.
14. Sau khi hoàn tất thanh toán (bất kỳ đường nào) → `mevo_unpaid_order` đã bị xoá.

### Nhóm 5 — không được hồi quy

15. Đặt món trả tiền mặt (quán có bật) → vẫn vào thẳng trang trạng thái đơn như trước,
    không banner, không khoá giỏ.
16. Quán tạm nghỉ / ngoài giờ → vẫn chặn đặt đơn như cũ.


---

## 2026-08-31 — Trả trước / Trả sau + Phiên bàn (Sprint 1, mig 039)

> Spec: `docs/superpowers/specs/2026-08-20-prepay-postpay-table-session-design.md`
> Review đã xử lý: `docs/superpowers/reviews/2026-08-26-postpay-table-session-print-design-review.md`

### Chuẩn bị trước khi test

1. **Migration 039 đã áp lên prod rồi** (2026-08-31) — không cần chạy gì thêm.
2. **Mini-app phải deploy lại** thì nhóm B mới test được:
   ```bash
   cd mini-app-instances/pho-ga-pubu && git fetch origin && git merge origin/main
   ```
   **Merge TRƯỚC rồi mới `zmp deploy`** — quên bước merge là deploy ra bản code cũ, mất một
   vòng test. Sau khi merge: `cd mini-app && zmp deploy` (chọn **Development** để tự test,
   **Testing** khi muốn phát hành — Zalo giới hạn số lần deploy/tháng).
3. **Chưa có quán trả sau thật** (Bảo Lương onboard ở Sprint 3). Để test nhóm B: vào
   `/admin/settings` → **Cách vận hành quán** → chọn **Trả sau** → Lưu. Test xong nhớ
   **đổi lại Trả trước**.

---

### Nhóm A — Quán TRẢ TRƯỚC (hành vi Pubu, không được đổi)

**A1.** Quán prepay, khách quét QR chọn ZaloPay, trả xong → đơn vào bếp (cột "Chờ xử lý"),
loa đọc đơn. ✅ *phải giống hệt hôm nay*

**A2.** Quán prepay, khách quét QR, tạo đơn rồi **không** trả tiền → đơn **không** vào bếp;
mở `/admin/orders` (lazy sweep) sau 30' → đơn thành `cancelled`.

**A3.** ⭐ **Bài đóng lỗ hổng PB3.** Giả lập mini-app bản cũ gọi thẳng RPC với tiền mặt:
```sql
select create_order(
  (select id from stores where slug='pho-ga-pubu'),
  (select id from tables where store_id=(select id from stores where slug='pho-ga-pubu') limit 1),
  jsonb_build_array(jsonb_build_object('menu_item_id',
    (select id from menu_items where store_id=(select id from stores where slug='pho-ga-pubu') and is_available limit 1),
    'quantity', 1)),
  'cash', 'TEST_UID');
```
→ phải báo lỗi **"Quán yêu cầu thanh toán trước khi bếp làm."**

**A3b.** ⭐ **Cửa hậu `abandon_zalopay_to_cash`** (rủi ro #9). Tạo đơn ZaloPay thật ở quán
prepay, lấy `capability_token`, rồi:
```sql
select abandon_zalopay_to_cash('<order_id>', '<capability_token>');
```
→ phải báo lỗi **"Quán yêu cầu thanh toán trước khi bếp làm."** Và kể cả nếu lọt thì đơn `cash`
ở quán prepay vẫn **không** vào bếp.

**A4.** Nhân viên `/staff/order` đặt hộ ở quán prepay → đơn vào bếp **ngay** (không đổi so với
hôm nay). Màn thành công vẫn hiện *"💵 Khách thanh toán tại quầy sau khi ăn."*
*(Phần VietQR + nút "Đã nhận tiền" của spec §6.3 đã HOÃN sang sprint thanh toán riêng — quyết
định của anh Tú 2026-08-31.)*

---

### Nhóm B — Quán TRẢ SAU, phiên bàn

*(nhớ bật "Trả sau" ở `/admin/settings` trước)*

**B5.** Máy A quét QR bàn 1 → gọi món → **đơn vào bếp NGAY dù chưa trả tiền**. Nút bấm ở giỏ
hàng ghi **"Gọi món"** (không phải "Đặt món & Thanh toán"), **không** mở màn thanh toán Zalo,
đặt xong nhảy thẳng sang trang trạng thái đơn.

**B6.** Máy A gọi thêm lần 2 → vào **cùng phiên**, không bị chặn. Đầu trang menu hiện thanh
`🪑 Bàn 1 · N lần gọi · <tổng>đ`.

**B7.** Máy B (điện thoại khác) quét QR **cùng bàn 1** → thấy banner đỏ *"Bàn này đang có khách
gọi món (từ HH:mm)"*, **không thấy nút +** ở món nào, có nút **🔔 Gọi nhân viên**.

**B8.** ⭐ **Chốt chặn server.** Máy B gọi thẳng RPC bỏ qua UI:
```sql
select create_order('<store_id>','<table_id>', '<items>'::jsonb, 'cash', 'UID_KHAC',
                    null,'dine_in',null,null,null,null,'DEVICE_KHAC');
```
→ **"Bàn này đang có khách khác gọi món. Nhờ nhân viên mở bàn giúp bạn."**

**B9.** Nhân viên vào `/staff` → tab **🪑 Bàn** → thấy bàn 1 với đủ danh sách đơn → bấm
**"Thu tiền & đóng bàn"** → chọn **Tiền mặt** → bàn biến mất khỏi danh sách. Kiểm DB:
```sql
select payment_received_at is not null, payment_received_via, payment_received_by, payment_instrument
from orders where session_id = '<session_id>';
-- via phải là 'staff', by phải là user id của NHÂN VIÊN vừa bấm
select status, close_reason from table_sessions where id = '<session_id>';  -- closed / paid
```

**B10.** Máy B quét lại bàn 1 → giờ đặt được (phiên mới mở).

**B11.** ⭐ **Hai chân định danh (PB5).** Máy A **xoá app** (mất `mevo_device_id`) rồi mở lại
bằng **cùng tài khoản Zalo** → vẫn là chủ phiên, gọi thêm được.
*(Test nhanh: xoá key `mevo_device_id` trong localStorage.)*

**B12.** ⭐ **Race.** Hai máy bấm "Gọi món" **cùng lúc** trên bàn đang trống → đúng **một** phiên
ra đời, máy kia bị chặn. Kiểm:
```sql
select count(*) from table_sessions where table_id='<table_id>' and status='open';  -- = 1
```

**B13.** Nhân viên `/staff/tables` → `⋯` → **"Chuyển quyền gọi món"** → máy B quét QR → thành chủ
phiên, gọi thêm được, và **thấy đủ bill cũ của máy A** ở tab Đơn hàng.

**B14.** Nhân viên → `⋯` → **"Bỏ bàn (không thu tiền)"** → xác nhận → đơn chưa nấu bị huỷ; nếu
còn đơn đang `cooking`/`ready` thì hiện dòng *"Còn N món đã vào bếp — vẫn nằm ở màn bếp, xử lý
tay"* và những đơn đó **giữ nguyên** ở màn bếp.

**B15.** ⭐ **Ân hạn giờ phục vụ (PB6).** Đặt giờ phục vụ kết thúc cách đây vài phút
(`/admin/settings`), phiên đã mở trước đó < 2 giờ → khách **vẫn gọi thêm được**. Sửa
`opened_at` lùi hơn 2 giờ → bị chặn *"Quán đang tạm nghỉ hoặc ngoài giờ phục vụ"*.
```sql
update table_sessions set opened_at = now() - interval '3 hours' where id='<session_id>';
```

**B16.** **Hết hạn 6h.** Lùi `last_activity_at`:
```sql
update table_sessions set last_activity_at = now() - interval '7 hours' where id='<session_id>';
```
→ lần đọc kế tiếp (mở mini-app hoặc mở `/staff/tables`) phiên **tự đóng**, bàn mở khoá.

**B16b.** ⭐ **Phiên hết hạn còn nợ** (review P2-1). Làm như B16 nhưng phiên **còn đơn chưa thu
tiền** → `/staff/tables` vẫn hiện bàn đó, **viền cam**, kèm dòng *"Phiên đã quá 6 giờ… vẫn còn
X đ chưa thu"*, và **vẫn bấm "Thu tiền & đóng bàn" được**.

---

### Nhóm C — Không được phá cái đang chạy

**C17.** ⭐ *(viết lại so với spec — xem bên dưới)* Sau migrate, kiểm:
```sql
select slug, payment_timing, payment_methods from stores;
```
→ Pubu = **`prepay`** (KHÔNG phải `postpay` như spec §5.1 dự đoán: câu backfill chỉ đổi quán
đang bật `cash`, mà hôm nay **không quán nào bật cash** — cả hai quán đều `{zalo_checkout}`).
Đây là kết quả **đúng**: đơn Pubu là `zalo_checkout` và đã có `payment_received_at` do callback
ví ghi, nên vẫn vào bếp như cũ.
→ Mở màn bếp: đơn ZaloPay đã trả tiền **vẫn ở cột "Chờ xử lý"**, loa vẫn đọc.
→ **Lưu ý:** 3 đơn `cash` + `pending` cũ từ tháng 6–7 sẽ **rơi khỏi màn bếp**. Đó là rác test,
rơi ra là đúng ý đồ, không phải lỗi.

**C18.** Đơn mang về / ship: không đổi gì ở **cả hai** chế độ — vẫn buộc trả trước qua Zalo
Checkout (kể cả khi quán bật trả sau).

**C19.** Luồng "Thanh toán lại khi thoát màn chọn phương thức" (2026-08-06) ở quán prepay:
chạy lại toàn bộ nhóm 1–3 của mục 2026-08-06 → không đổi.

**C20.** Vòng quay may mắn: chỉ đơn có `payment_received_at` mới quay được → đơn trả sau quay
được **sau khi** nhân viên chốt bill.

**C21.** Doanh thu: `/admin/dashboard` và `/admin/orders` báo **cùng một số**. Đơn trả sau chưa
thu nằm ở "chờ thu"; chốt bill xong nhảy sang doanh thu.

---

### Nhóm D — Bổ sung theo review 2026-08-26

**D22.** ⭐ **Nút chuông thật sự kêu.** Mở màn bếp `/kitchen/<slug>` ở một máy, mini-app ở máy
khác → bấm **"Gọi thanh toán"** (tab Đơn hàng) → màn bếp **phải kêu chuông + hiện thẻ gọi**.
*(Trước mig 039 bảng `service_requests` không nằm trong publication realtime nên nút này chưa
bao giờ tới được màn bếp — đây là bài test vá bug đó.)*

**D23.** **Bill theo phiên, không theo Zalo UID** (P1-1). Nhân viên đặt hộ 1 đơn cho bàn 1 →
khách quét QR bàn 1 → tab **Đơn hàng** của khách **phải thấy đơn nhân viên vừa đặt** và tổng
tiền khớp với số ở màn `/staff/tables`.

**D24.** **Khách không có Zalo UID.** Mở mini-app ngoài Zalo (trình duyệt thường, `getUserID`
fail) → vẫn gọi món được, vẫn xem được tab Đơn hàng bằng device id.

**D25.** **Client cũ không gửi `p_device_id`** (P1-2). Gọi RPC thiếu tham số cuối:
```sql
select create_order('<store_id>','<table_id>','<items>'::jsonb,'cash','UID_CU');
```
→ chạy bình thường, **không** lỗi *"could not choose the best candidate function"*.

**D26.** **Đơn đã huỷ không bị tính tiền** (P1-4). Phiên có 2 đơn, huỷ 1 → chốt bill → đơn đã
huỷ **vẫn** `cancelled`, `payment_received_at` vẫn NULL, tổng thu chỉ tính đơn còn lại.

**D27.** **Đóng bill đúng lúc khách gọi thêm** (P0-3). Mở 2 cửa sổ: một bên bấm "Thu tiền &
đóng bàn", một bên khách bấm "Gọi món" gần như cùng lúc → **không** được có đơn nào lọt vào
phiên đã đóng mà chưa thu tiền. Kiểm:
```sql
select count(*) from orders o join table_sessions s on s.id=o.session_id
 where s.close_reason='paid' and o.payment_received_at is null and o.status<>'cancelled';
-- phải = 0
```

**D28.** **Nhân viên quán khác không đóng được bill.** Đăng nhập tài khoản quán B, gọi
`close_table_session` với `session_id` của quán A → **"Không có quyền"**.

**D29.** **Khách bị khoá không đọc được thông tin phiên.** Máy B (đang bị khoá) gọi:
```sql
select get_table_session_state('<table_id>','UID_B','DEV_B');
```
→ chỉ trả `{mode, state:'locked', opened_at}` — **không** có `session_id`, **không** có Zalo UID
hay device id của chủ phiên.

**D30.** **Realtime nối lại.** Ở `/staff/tables`, tắt wifi vài giây rồi bật lại → chấm xanh
"Đang cập nhật trực tiếp" quay lại, danh sách **tự tải lại đúng**, không nhân đôi bàn/đơn.

---

### Đã HOÃN, không test ở Sprint 1

| Thứ | Vì sao |
|---|---|
| VietQR + "Khách chuyển khoản" ở `/staff/order` | Anh Tú quyết 2026-08-31: build phần thanh toán **riêng cho từng quán** ở sprint sau |
| RPC `staff_confirm_payment` | Chỉ phục vụ luồng thanh toán quán prepay ở trên; postpay settle qua `close_table_session` |
| Lớp **Mâm** (ghép bàn, gộp bill, in bill 80mm) | Sprint 2 |
| Khách tự thanh toán cả phiên qua Zalo Checkout | Spec §11 — cố tình hoãn, không mở lại vùng MAC/notify |


---

## 2026-08-31 — Lớp Mâm cho khách đoàn (Sprint 2, mig 040)

> Spec: `docs/superpowers/specs/2026-08-30-bao-luong-tray-group-design.md` §3–§4
> **Mâm = một phiên chiếm N bàn = một bill con.** Bàn lẻ = phiên chiếm đúng 1 bàn (khoá chủ
> phiên như Sprint 1). Một cơ chế, hai cách dùng.

### Chuẩn bị

**Quán Bia lẩu Bảo Lương đã được tạo sẵn trên prod** (2026-08-31): 20 bàn, `payment_timing =
postpay`, `payment_methods = {cash}`, chưa có menu, chưa có Zalo App ID.

Ba việc **chỉ anh Tú làm được** trước khi test:

1. **Tạo tài khoản nhân viên/chủ quán cho Bảo Lương** — vào `/mevo/stores/<id>` → mục chủ quán →
   nhập email → hệ thống tự sinh mật khẩu tạm. Không có tài khoản này thì **không vào được
   `/staff`** (superadmin bị đẩy về `/mevo`, đó là thiết kế).
2. **Nhập menu + giá** ở `/admin/menu` (đăng nhập bằng tài khoản vừa tạo). Chưa có món thì
   không đặt thử được.
3. **Đăng ký Zalo Mini App** để lấy App ID — nằm trên đường găng, lần trước Zalo duyệt khá lâu.
   Chỉ cần cho phần khách quét QR; toàn bộ nhóm E/F dưới đây test được **không cần** App ID
   (dùng màn `/staff` + `/kitchen` + gọi RPC).

---

### Nhóm E — Ghép mâm và gọi món trong mâm

**E1.** `/staff` → tab **🪑 Bàn** → **＋ Ghép mâm** → chọn Bàn 5, 6, 7 → **Ghép 3 bàn thành mâm**
→ danh sách hiện một dòng `🍲 Bàn 5, Bàn 6, Bàn 7` kèm nhãn *mâm 3 bàn*.

**E2.** Bấm **＋ Ghép mâm** lần nữa → **Bàn 5, 6, 7 không còn trong danh sách bàn trống**.

**E3.** ⭐ **Mâm không khoá ai.** Máy A quét QR **Bàn 5**, máy B quét QR **Bàn 7** → **cả hai đều
gọi món được**, không máy nào thấy banner khoá. Kiểm hai đơn rơi vào **cùng một** `session_id`:
```sql
select session_id, count(*) from orders where session_id is not null group by 1;
```

**E4.** Cả hai máy vào tab **Đơn hàng** → **thấy đủ món của nhau** và tổng bằng nhau, thanh đầu
trang menu hiện `🍲 Bàn 5, Bàn 6, Bàn 7`.

**E5.** `⋯` → **Thêm bàn vào mâm** → chọn Bàn 8 → mâm thành 4 bàn; máy quét QR Bàn 8 gọi được ngay.

**E6.** **Bàn lẻ vẫn khoá như cũ.** Máy A quét QR **Bàn 12** (không thuộc mâm nào) → gọi món →
máy B quét QR Bàn 12 → **vẫn thấy banner khoá**. (Đây là bài chứng minh lớp Mâm không phá Sprint 1.)

---

### Nhóm F — Nhập mâm, gộp bill, in bill

**F7.** ⭐ **Phiên lẻ lạc.** Khách quét QR **Bàn 9** trước khi nhân viên kịp ghép → gọi 1 món →
màn Bàn hiện thêm dòng `🪑 Bàn 9` riêng. Bấm `⋯` trên Bàn 9 → **Nhập vào mâm khác** → chọn mâm
Bàn 5-6-7 → Bàn 9 biến mất khỏi danh sách, **món và tiền của nó cộng vào mâm**.

**F8.** Sau F7, khách ngồi Bàn 9 mở lại mini-app → **không bị khoá**, thấy bill của cả mâm.

**F9.** **Gộp bill.** Ghép thêm một mâm thứ hai (Bàn 15, 16), gọi vài món → **tick cả hai mâm** →
thanh dưới hiện *Gộp 2 mâm* + tổng → bấm **🖨️ In 1 hoá đơn** → mở tab in khổ 80mm, có **dòng
cộng riêng từng mâm** rồi **TỔNG CỘNG** cuối.

**F10.** Bấm **Thu tiền** → chọn *Chuyển khoản* → **cả hai mâm cùng đóng một lượt**. Kiểm:
```sql
select s.id, s.status, s.close_reason,
       count(o.id) filter (where o.payment_received_at is not null) as don_da_thu
  from table_sessions s left join orders o on o.session_id = s.id
 group by 1,2,3 order by s.opened_at desc;
```
→ cả hai phiên `closed`/`paid`, mọi đơn đều có tiền, `payment_instrument = 'bank'`.

**F11.** ⭐ **Gộp bill là ATOMIC.** Không được có cảnh thu xong mâm 1, mâm 2 vẫn nợ. Nếu bấm mà
báo lỗi thì kiểm: **không mâm nào** được đánh dấu đã thu.

**F12.** **Tách bill vẫn là mặc định.** Không tick gì, bấm **Thu tiền & đóng bàn** trên riêng một
mâm → chỉ mâm đó đóng, mâm khác nguyên vẹn (mâm về sớm chốt riêng).

**F13.** Sau khi đóng mâm → **các bàn của mâm được nhả ra**, hiện lại trong danh sách bàn trống
khi bấm ＋ Ghép mâm. Kiểm:
```sql
select count(*) from session_tables where is_open;   -- không còn dòng của mâm vừa đóng
```

**F14.** **In bill một mâm** bằng nút 🖨️ trên thẻ → tờ bill chỉ có mâm đó, không có dòng "cộng
từng mâm" (chỉ một mâm thì không cần).

**F15.** Trang in: chọn đúng **máy in bill 80mm** trong hộp thoại, chữ không tràn lề, phần
"In lại" **không bị in ra giấy**.

---

### Nhóm G — Không phá Sprint 1

**G16.** Chạy lại **B5–B16b** của mục Sprint 1 trên Bảo Lương (bàn lẻ) → không đổi hành vi.

**G17.** ⭐ **Race giữa hai bàn cùng mâm.** Hai máy ở hai bàn khác nhau trong cùng mâm bấm "Gọi
món" **cùng lúc** → hai đơn, **một** phiên, không lỗi.

**G18.** **Ghép mâm chồng bàn.** Hai nhân viên cùng ghép mâm có chung một bàn → một người thành
công, người kia nhận lỗi *"Bàn X đang có khách…"*, **không** tạo hai phiên chiếm cùng một bàn.

**G19.** Phiên mâm để quá 6 giờ không hoạt động → tự đóng, **tất cả** bàn của mâm nhả ra cùng lúc.

---

### Đã kiểm bằng smoke test trên prod (anh không phải làm lại, ghi để đối chiếu)

Chạy trong DO block tự huỷ nên không để lại dữ liệu — 9 khẳng định đều đúng: ghép mâm 3 bàn ·
ghép lại bàn đã có khách bị từ chối · hai máy khác nhau ở hai bàn trong cùng mâm đều gọi được ·
nhập phiên lẻ vào mâm chuyển cả đơn lẫn bàn · khách lạ quét bàn thuộc mâm vẫn `owner` · bill in
gộp đúng tổng · gộp bill đóng mâm settle đủ 3 đơn · đóng xong bàn tự nhả ra.

---

---

*File này là bộ nhớ test của dự án MEVO.*
*Claude Code PHẢI đọc file này trước khi báo bất kỳ Sprint nào là "done".*
