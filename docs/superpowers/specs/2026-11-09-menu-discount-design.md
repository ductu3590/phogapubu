# Giảm giá theo món / theo danh mục, có lịch (MD-1)

Ngày: 2026-11-09 · Nhánh: `claude/discount-item-category-feature-c6612e` · Migration: **115**

## 1. Vì sao

Quán nhậu / bia garden (Yên Garden, Bảo Lương) hay chạy khuyến mãi theo món hoặc cả nhóm món:
"bia hơi giảm 20% từ 16h–18h thứ 2–6", "tuần khai trương giảm 10.000đ mọi món nướng". Hiện MEVO chỉ có
giảm giá cả bill (mig 107) và mã giảm giá (mig 027). Chủ quán muốn đặt giảm giá ngay trong
**cấu hình Thực đơn**, cho từng món hoặc cả danh mục, **có đặt thời gian**.

Anh Tú giao qua /goal, không có vòng hỏi đáp. Mọi lựa chọn dưới đây đánh dấu **[em chốt]** là em tự quyết,
anh rà lại khi test.

## 2. Mục tiêu / không làm

Làm:
- Chương trình giảm giá gắn vào **một món** hoặc **một danh mục**, kiểu **%** hoặc **VNĐ**.
- Lịch: khoảng ngày (từ ngày / đến ngày, đều tuỳ chọn), khung giờ trong ngày (tuỳ chọn, cho phép
  qua nửa đêm như 22:00–02:00), ngày trong tuần (tuỳ chọn). Bật/tắt nhanh.
- Giá giảm áp ở **server lúc tạo đơn**, cho MỌI đường tạo đơn: khách quét QR (`create_order`),
  nhân viên đặt hộ (`staff_create_order`), POS ghi tay / khách lẻ / đặt món trước (`add_order_line`).
- Hiển thị giá gạch + giá giảm ở Mini App (thẻ món, sheet tuỳ chọn), màn đặt hộ `/staff/order`,
  sheet ghi tay ở POS, danh sách món ở `/admin/menu`.
- Màn tổng quan "Giảm giá" trong Thực đơn: xem mọi chương trình, trạng thái, bật/tắt, sửa, xoá.

Không làm (để sau nếu quán hỏi):
- Combo / mua X tặng Y / giảm theo số lượng.
- Giảm giá topping. **[em chốt]** Chỉ giảm giá món (hoặc giá lựa chọn), topping giữ giá.
- Báo cáo riêng "tiền đã giảm theo món" ở A04. Dữ liệu đã lưu sẵn (`order_items.item_original_price`)
  để làm sau.
- In giá gốc gạch trên hoá đơn. Hoá đơn in giá đã giảm (đúng tiền khách trả).
- Thu ngân sửa chương trình giảm giá. Chỉ **chủ quán** (và MEVO superadmin) — giống sửa giá món.

## 3. Quy tắc tính giá

1. Giá gốc của dòng = giá lựa chọn (nếu món có lựa chọn, giá tuyệt đối) hoặc giá món.
2. Chương trình **đang hiệu lực** tại thời điểm tạo đơn (giờ `Asia/Ho_Chi_Minh`):
   - đang bật;
   - "ngày của khung" nằm trong [từ ngày, đến ngày] (đầu nào trống thì không giới hạn đầu đó);
   - ngày trong tuần của "ngày của khung" thuộc danh sách (trống = mọi ngày);
   - giờ hiện tại nằm trong [giờ bắt đầu, giờ kết thúc) nếu có khung giờ.
   "Ngày của khung" = hôm nay, trừ khung qua nửa đêm mà giờ hiện tại < giờ kết thúc thì là hôm qua
   (khung 22:00–02:00 thứ 6 chạy tới 02:00 sáng thứ 7).
3. **Món thắng danh mục** **[em chốt]**: món có chương trình riêng đang hiệu lực thì bỏ qua chương trình
   của danh mục — để chủ quán "giảm cả danh mục trừ món X" (đặt món X một chương trình nhỏ hơn) được.
4. Cùng cấp có nhiều chương trình hiệu lực → lấy **mức giảm cao nhất** cho khách. Không cộng dồn.
5. Tiền giảm: `%` → `round(giá × % / 100)` làm tròn nửa lên tới đồng **[em chốt: không làm tròn nghìn]**;
   `VNĐ` → số đó. Luôn chặn không vượt giá (giá sau giảm ≥ 0). % từ 1 tới 100.
6. Giảm giá món tính TRƯỚC mã giảm giá (voucher) và giảm giá bill; hai cái đó tính trên tổng đã giảm.
7. Giá chụp vào `order_items.item_price` lúc tạo đơn (đúng nguyên tắc snapshot). Bàn trả sau gọi món lúc
   16:30 trong happy hour thì giữ giá giảm dù thu tiền lúc 22:00. Đặt món trước tính giá lúc khách gửi.

## 4. Dữ liệu (mig 115)

- `menu_categories` thêm `UNIQUE (id, store_id)` để ràng FK ghép theo quán (giống `menu_items`).
- Bảng `menu_discounts`: `store_id`, đúng một trong `menu_item_id` / `category_id` (FK ghép theo
  `store_id`, xoá món/danh mục thì xoá theo), `name` (tuỳ chọn, ≤ 60 ký tự), `discount_type`
  (`percent`/`amount`), `value`, `starts_on`/`ends_on` (date), `time_from`/`time_to` (time, có cả hai
  hoặc không có, khác nhau), `days_of_week smallint[]` (ISO 1 = Thứ 2 … 7 = CN; NULL = mọi ngày),
  `is_active`, `created_by`, `created_at`, `updated_at`.
  RLS: chỉ SELECT cho `is_store_scoped_operator(store_id)` (mig 019). Ghi qua server action dùng
  service role, tự kiểm `requireStoreOwnerStoreId` + món/danh mục thuộc quán.
- `order_items` thêm `item_original_price int` (giá gốc trước giảm, NULL nếu không giảm) và
  `menu_discount_id uuid` (FK `ON DELETE SET NULL`).
- Hàm nội bộ (REVOKE khỏi PUBLIC/anon/authenticated): `menu_discount_is_active(rule, at)`,
  `menu_discount_amount(type, value, price)`, `menu_item_discounted_price(menu_item_id, price, at)`.
- RPC đọc công khai `get_active_menu_discounts(store_id)` (anon + authenticated, SECURITY DEFINER):
  `{ items: [{menu_item_id, rules:[{id, discount_type, value, name, time_to, ends_on}]}], active_ids: [...] }`
  — `rules` là các chương trình ở **cấp thắng** đang hiệu lực của món; client chọn mức cao nhất theo giá.
- Vá tại chỗ (mẫu mig 105/108/110, neo nguyên văn từ prod 2026-11-09) `create_order`,
  `staff_create_order`, `add_order_line`: tính giá giảm + ghi 2 cột mới.
  **Kèm vá lỗi có sẵn**: `add_order_line` đang lấy `giá món + giá lựa chọn` trong khi giá lựa chọn là
  giá TUYỆT ĐỐI (mig 042; `create_order` làm đúng) → món có lựa chọn ghi tay ở POS / đặt món trước bị
  tính gần gấp đôi (prod có 1 dòng đặt trước bị lệch). Đổi về `COALESCE(giá lựa chọn, giá món)`, và
  sheet ghi tay ở POS hiện giá lựa chọn tuyệt đối thay vì `+giá`.

## 5. Giao diện

- `/admin/menu`, sidebar thêm mục **Giảm giá (N)** dưới Topping: danh sách mọi chương trình, nhóm
  "Theo món" / "Theo danh mục", mỗi dòng: đối tượng, mức giảm, lịch dạng chữ, trạng thái
  (Đang áp dụng · Chưa bắt đầu · Ngoài khung giờ · Đã hết hạn · Đã tắt), nút bật/tắt, Sửa, Xoá.
- Hộp **Sửa món**: khối "Giảm giá món" (danh sách chương trình của món + nút Thêm). Hộp **Sửa danh mục**:
  khối "Giảm giá cả danh mục". Cùng một form: kiểu %/VNĐ, giá trị, tên, "Luôn áp dụng" hoặc lịch
  (từ ngày, đến ngày, khung giờ, chip Thứ 2…CN), xem trước "25.000đ → 20.000đ".
- Dòng món ở `/admin/menu`: đang giảm thì giá gốc gạch + giá giảm + chip "−20%".
- Mini App: thẻ món + sheet tuỳ chọn hiện giá gạch, giá giảm, chip "−20%"; có khung giờ thì
  "đến 18:00", có ngày hết thì "đến hết 20/11". Giỏ hàng dùng giá giảm (cart không phải sửa).
- `/staff/order` + sheet ghi tay POS: nạp giá đã giảm ở server component, hiện giá gạch.

## 6. Rủi ro đã biết, chấp nhận

- Mini App / màn nhân viên mở sẵn qua mốc khung giờ thì giá hiển thị cũ tới lần tải menu sau; server
  vẫn tính đúng, quán trả trước thì số tiền thanh toán theo server. Giỏ lưu 6h cũng vậy.
- App Mini App cũ chưa `zmp deploy` vẫn được giảm đúng ở server, chỉ không thấy giá gạch.

## 7. Test

`docs/testing/menu-discount/MD-1.md` (tay) + test đơn vị TS (admin-web, mini-app) cho hàm áp giảm giá,
mô tả lịch, trạng thái; SQL kiểm ở `docs/testing/menu-discount/sql/md1-verify.sql`.
