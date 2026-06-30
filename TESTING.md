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

---

*File này là bộ nhớ test của dự án MEVO.*
*Claude Code PHẢI đọc file này trước khi báo bất kỳ Sprint nào là "done".*
