# MD-1 — Giảm giá theo món / danh mục, có lịch

Spec: `docs/superpowers/specs/2026-11-09-menu-discount-design.md` · Mig 115 **đã áp prod** (2026-11-09).
SQL tự kiểm (12 ca, rollback): `docs/testing/menu-discount/sql/md1-verify.sql` — đã chạy, ALL PASS.

## Trước khi test

- Test ở http://localhost:3000 (dev server trên nhánh `claude/discount-item-category-feature-c6612e`, trỏ DB prod).
- Quán **Bia lẩu Bảo Lương**, tài khoản chủ quán + một tài khoản nhân viên + một tài khoản thu ngân.
- ⚠️ Đây là dữ liệu thật: chọn **một món ít ai gọi** để thử, và **xong phải xoá hết chương trình đã tạo (bài 10)**.
- Giảm giá nằm ở **Món** (thanh trái) → hộp **Sửa món** (bút chì cạnh món) / **Sửa danh mục** (bút chì cạnh
  tên danh mục), và mục **Giảm giá (N)** dưới Topping để xem tất cả.

## Bài 1. Giảm giá món theo %, luôn áp dụng

1. Mở Sửa món của món X (giá ví dụ 100.000đ) → kéo xuống khối **Giảm giá món** → **+ Thêm giảm giá**.
2. Chọn `%`, gõ `20`. Dòng xem trước hiện `Giá món 100.000đ → 80.000đ`. Để **Luôn áp dụng**, bấm **Thêm**.
3. Trong hộp hiện dòng `−20% · Luôn áp dụng`, chip xanh **Đang áp dụng**.
4. Đóng hộp: dòng món X hiện chip `−20%`, giá **80.000đ** màu cam, dưới là ~~100.000đ~~ gạch.

## Bài 2. Giá giảm ở màn đặt món và trên đơn

1. `/staff/order` (tài khoản nhân viên), chọn một bàn: món X hiện `80.000đ ~~100.000đ~~ −20%`.
2. Thêm món X × 2, gửi đơn. Mở POS → bill bàn đó: món X **80.000đ**, tổng **160.000đ**.
3. POS → **Khách lẻ** → chọn bàn → món X hiện giá giảm + giá gạch. (Không cần gửi.)
4. (Tuỳ chọn) SQL: `select item_price, item_original_price, menu_discount_id from order_items where order_id = '<id đơn>'`
   → `80000 | 100000 | <id chương trình>`.

## Bài 3. Giảm giá cả danh mục theo VNĐ, món riêng thắng danh mục

1. Mở Sửa danh mục của danh mục chứa X → **Giảm giá cả danh mục** → `VNĐ`, gõ `5.000` → Thêm.
2. Món khác Y trong cùng danh mục: giá giảm 5.000đ, chip `−5.000đ`.
3. Món X **vẫn** `−20%` (chương trình riêng của món thắng chương trình danh mục, không cộng dồn).
4. Tắt chương trình của món X (công tắc trong hộp Sửa món) → món X chuyển sang `−5.000đ`.

## Bài 4. Đặt lịch: khung giờ

1. Sửa chương trình danh mục: **Đặt lịch**, Từ giờ = 1 tiếng trước, Đến giờ = 1 tiếng sau → Lưu.
   Dòng hiện `HH:MM–HH:MM`, **Đang áp dụng**.
2. Đổi khung giờ sang một khung **đã qua** trong ngày (ví dụ 06:00–07:00) → chip vàng **Ngoài khung giờ**,
   món Y về giá gốc ở `/admin/menu` và `/staff/order` (tải lại trang).
3. Gửi một đơn có món Y → bill tính **giá gốc**.

## Bài 5. Đặt lịch: ngày và thứ

1. Sửa: bỏ trống giờ, chọn Từ ngày = ngày mai → **Chưa bắt đầu**.
2. Từ ngày trống, Đến hết ngày = hôm qua → **Đã hết hạn**.
3. Bỏ trống ngày, chỉ tick đúng **thứ hôm nay** → **Đang áp dụng**; tick một thứ khác (bỏ hôm nay) → **Ngoài khung giờ**.
4. Form chặn: Đến ngày trước Từ ngày; chỉ nhập Từ giờ không có Đến giờ; Từ giờ = Đến giờ; `%` > 100 — báo lỗi
   đỏ ngay trong form, **chữ đã gõ không mất**.

## Bài 6. Mục tổng quan "Giảm giá"

1. Bấm **Giảm giá (N)** ở thanh trái: hai nhóm **Theo món** / **Theo danh mục**, mỗi dòng có tên món/danh mục,
   mức giảm, lịch dạng chữ, trạng thái, công tắc, Sửa, Xoá.
2. Bấm tên món trong dòng → mở đúng hộp Sửa món đó.
3. Bật/tắt, Sửa ngay trong danh sách đều được, trạng thái cập nhật.

## Bài 7. Món có tuỳ chọn giá (Tháp/Ca/Cốc…)

1. Đặt `−10%` cho một món có tuỳ chọn (ví dụ giá lựa chọn 100.000 / 60.000).
2. `/staff/order`: món hiện `Từ 54.000đ ~~60.000đ~~`; mở chọn loại: mỗi lựa chọn hiện giá giảm + giá gạch.
3. POS → Khách lẻ → món đó: các lựa chọn hiện **giá tuyệt đối** (không còn dấu `+`), có giá gạch.
   Thêm lựa chọn 100.000 → dòng **90.000đ / phần** (trước đây bị cộng thành ~160.000đ — lỗi cũ đã vá).
4. Gửi đơn: bill đúng 90.000đ.

## Bài 8. Quyền

1. Đăng nhập **thu ngân** → Món: chỉ có màn bật/tắt Tạm hết như cũ, **không** có mục Giảm giá.
2. Thu ngân/nhân viên đặt đơn vẫn được hưởng giá giảm (bài 2 đã thấy).

## Bài 9. Mini App (chỉ khi đã `zmp deploy` bản mới cho quán — Bảo Lương đang tắt Mini App thì bỏ qua)

1. Thẻ món đang giảm: giá giảm + ~~giá gốc~~ + chip `−20%` (+ `đến 18:00` nếu có khung giờ, `đến hết 20/11` nếu có ngày hết).
2. Sheet chọn loại: từng lựa chọn có giá gạch. Giỏ hàng cộng theo giá giảm, khớp số tiền sau khi đặt.
3. App bản cũ chưa deploy: không thấy giá gạch nhưng **đơn vẫn được giảm** (server tự trừ).

## Bài 10. Xoá và dọn

1. Xoá một chương trình đã dùng ở bài 2 → đơn bài 2 vẫn giữ giá 80.000đ (giá đã chụp lúc đặt).
2. **Xoá hết** chương trình đã tạo trong lúc test (mục Giảm giá phải về `(0)`), hoặc chạy:
   `delete from menu_discounts where store_id = (select id from stores where slug like '%bao-luong%');`
3. Huỷ / bỏ các đơn thử ở bài 2, 4, 7 như các lần test trước.
