# Mini App theo bản Stitch M01–M08 (gọt lại) — Design

**Ngày:** 2026-10-05 · **Trạng thái:** đã duyệt từng phần trong hội thoại, chờ anh Tú đọc spec
**Bản vẽ:** `docs/design/m01` … `m08` (`code.html`; `screen.png` của m01/m04 bị hỏng — dựng lại từ HTML ở khổ 390px)
**Thay:** giao diện UI-5 (2026-10-02) của Mini App. Logic đặt món / thanh toán / voucher / vòng quay / quy tắc vào bếp **giữ nguyên**.

## 1. Mục tiêu

Mini App mang đúng bố cục, tab, header và cách trình bày của Stitch, nhưng:
- **Một hệ thống**: Stitch vẽ hai họ màn lệch nhau (m01–m05 tông nâu, tiêu đề lớn; m06–m08 tông đỏ/xanh, thanh công cụ). Sau khi làm, 8 màn trông như một app.
- **Màu chủ đạo của quán** (`stores.primary_color`, runtime) cho mọi điểm nhấn. Ngoại lệ có chủ đích: nút Gọi NV luôn đỏ; màu trạng thái theo ý nghĩa (vàng chờ duyệt · xanh dương đã vào bếp · xanh lá đã thanh toán · đỏ từ chối/huỷ).
- **Chỉ dữ liệu thật**: không hiện số/nhãn bịa của Stitch (danh sách bỏ ở §6).

Thành công = anh Tú đi hết hai lối vào (QR bàn / mở thường) trên Bảo Lương và Pubu, thấy giống Stitch, không có ô trống, không có chữ giả, không có thành phần đè nhau.

## 2. Quyết định đã chốt

| # | Quyết định |
|---|---|
| Q1 | **Cách A**: dựng bộ component dùng chung trước, rồi thay từng màn. Không chép HTML Stitch. |
| Q2 | **Hai bộ tab theo lối vào.** Mở thường: **Trang chủ · Đặt bàn · Đơn của tôi**. Quét QR bàn: **Thực đơn · Đơn gọi**. Không có tab/trang Hỗ trợ. |
| Q3 | **Thanh công cụ kiểu m06–m08 cho mọi màn** (không dùng header tiêu đề lớn của m01–m05). |
| Q4 | **Thực đơn tự đổi theo ảnh**: danh mục mà phần lớn món có ảnh → lưới 2 cột (m06); còn lại → danh sách gọn, không ô ảnh trống. (Bảo Lương 0/65 món có ảnh, Pubu 16/17.) |
| Q5 | **Gọi nhân viên = một nút** trên thanh công cụ, icon chuông rung ở đầu nút; bấm → thông báo nổi "Đã gọi nhân viên". **Server chặn 3 phút** (thay 10 giây). |
| Q6 | **Bấm logo quán** → trang Thông tin nhà hàng (trang `store-info` cũ, làm lại giao diện). |
| Q7 | **Icon tài khoản giữ lại** → trang Tài khoản "Cập nhật trong phiên bản sắp tới" (chỗ sau này: thông tin Zalo, điểm tích luỹ, mã giảm giá). |
| Q8 | **Ngôi sao Stitch → nút "Quan tâm" OA** (dùng chức năng follow OA sẵn có); đã quan tâm → tim đặc "Đã quan tâm"; quán không có OA → ẩn. |
| Q9 | **Địa chỉ luôn kèm nút "Chỉ đường"** mở link Google Maps cấu hình trong quán (trường mới `stores.google_maps_url`). |

## 3. Bộ khung (component dùng chung)

Đặt ở `mini-app/src/components/ui/` (mới). Mỗi component một file, không đọc store trực tiếp — nhận props, để test và tái dùng được.

| Component | Việc | Ghi chú |
|---|---|---|
| `AppToolbar` | Thanh công cụ 2 hàng | Hàng 1: quay lại (nếu route có `back`) + tiêu đề trang. Hàng 2: logo quán (→ `/store-info`) · [Gọi NV] · [Bàn 09] · … · [Quan tâm] [Giỏ + số] [Tài khoản]. **Góc phải hàng 1 chừa trống ~96px** cho nút "··· ⊗" Zalo tự đè. Lối vào thường: không có Gọi NV / chip bàn; giỏ chỉ hiện khi quán cho mang về/ship. |
| `CallStaffButton` | Nút Gọi NV đỏ, chuông rung | Gọi `useCallStaff` sẵn có. Thành công → toast "Đã gọi nhân viên, vui lòng chờ trong giây lát". Server báo đang trong 3 phút → toast "Bạn vừa gọi lúc HH:MM, có thể gọi lại sau HH:MM". Đang gửi → khoá nút. Chuông chỉ rung theo nhịp nhẹ, tắt khi người dùng bật "giảm chuyển động". |
| `TabBar` | 2 hoặc 3 tab theo lối vào | Thay `bottom-tabs.tsx`; giữ safe-area đáy. Tab Đơn gọi có chấm khi còn lượt chờ duyệt. |
| `SectionCard` | Khối nội dung trắng bo góc | Tiêu đề + icon tròn nền màu chủ đạo nhạt + mô tả phụ (kiểu m02). |
| `SectionHeading` | Tiêu đề nhóm có vạch trái màu chủ đạo + số đếm phải | m06 "SALAD - KHAI VỊ · 4 món". |
| `StatusPill` | Nhãn trạng thái | Bảng tone ở §1; luôn kèm chữ. |
| `StickyActionBar` | Thanh hành động dính đáy | Nằm **trên** TabBar (không đè); dạng tối (giỏ m06) hoặc nút lớn màu chủ đạo (m02/m05). Tự cộng chiều cao TabBar + safe-area vào padding cuối trang. |
| `ProductCard` | Thẻ món, 2 biến thể `grid` / `list` | Nút + tròn; đã có trong giỏ → `QuantityStepper` [− n +]; món có loại/topping → mở `OptionSheet` sẵn có; hết hàng → mờ + "Tạm hết". Ảnh lỗi tải → rơi về biến thể không ảnh. |
| `CategoryChips` | Chip danh mục cuộn ngang, dính đầu | Bấm → cuộn tới danh mục; cuộn tới đâu chip đó sáng (IntersectionObserver). |
| `Toast` | Thông báo nổi | Thay mọi `window.alert` trong luồng khách. |

Màu: token `primary` đã đọc từ `primary_color` (UI-5) — dùng lại, thêm các mức nhạt (`primary/5`, `/10`) cho nền icon/chip. Font Be Vietnam Pro, icon lucide như UI-5.

Quy tắc chọn lưới/danh sách (hàm thuần `pickProductLayout(products)` có test): danh mục có ≥ 60% món có `image` → `grid`, ngược lại `list`.

## 4. Các màn

### MA-1 — Khung + Thực đơn tại bàn (m06) + Giỏ hàng
- **Thực đơn** (`/menu`, lối QR bàn): ô tìm món + `CategoryChips` dính đầu → các nhóm `SectionHeading` + `ProductCard` (lưới/danh sách theo Q4) → `StickyActionBar` tối: "N món đã chọn · Bàn 09 · tổng" + **Xem đơn**.
- **Giỏ hàng / gửi món** (`/checkout`, không có bản vẽ — ngôn ngữ m05): thẻ bàn → danh sách món (sửa số lượng) → ghi chú cho bếp → tạm tính → nút đáy "Gửi món". Voucher, thanh toán quán trả trước, vòng quay giữ nguyên logic, chỉ đổi giao diện.
- **Trang Tài khoản** (`/account`, mới): khung trống + "Cập nhật trong phiên bản sắp tới".
- **DB (mig 087)**: `ping_service_request` đổi khoảng chặn `10 seconds` → `3 minutes`; khi bị chặn trả về thời điểm gọi gần nhất để client hiện "gọi lại sau HH:MM". POS vẫn một thẻ gọi/bàn như hiện nay.

### MA-2 — Đơn gọi (m07) + Trạng thái đơn + Thông tin nhà hàng
- **Đơn gọi** (`/session-orders`): thẻ đầu (Bàn 09 / "Mâm ghép 09 + 10", giờ vào bàn, chấm "Đang phục vụ", **Tổng tạm tính** lớn) → "Các lượt gọi món (N lượt) · mới nhất ở trên": mỗi lượt = số lượt, giờ, `StatusPill` (Chờ duyệt / Đã vào bếp / Đã thanh toán / Bị từ chối), món kèm loại + topping, món tặng "Đã tặng · 0đ", món bỏ gạch ngang, tiểu kế → khối **Đối soát tạm tính** (đã vào bếp / đang chờ duyệt / tổng; trả sau thêm "Thanh toán tại quầy khi kết thúc"; trả trước đổi chữ cho đúng) → `StickyActionBar` một nút **Gọi thêm món**.
- **Trạng thái đơn** (`/order-status/:id`) và **Thông tin nhà hàng** (`/store-info`): ngôn ngữ mới, giữ nguyên nội dung (địa chỉ + Chỉ đường, điện thoại, wifi + sao chép, quan tâm OA, giới thiệu, phạm vi ship, điều khoản).

### MA-3 — Lối vào thường: Trang chủ (m01) + Đặt bàn (m02) + Đơn của tôi (m03)
- **Trang chủ** (`/`, lối thường): ảnh bìa (`takeaway_banner_url` nếu có; không có → khối màu chủ đạo + logo + tên quán) → địa chỉ + **nút Chỉ đường** (Q9) · **giờ phục vụ thật** kèm nhãn "Đang mở"/"Đã đóng cửa" (từ `serving_hours` + `is_accepting_orders`) · nút gọi điện → nút **Đặt bàn trước** (nếu bật đặt bàn) → thẻ "Đang ngồi tại quán? Quét QR trên bàn" (nếu quán cho gọi tại bàn) → thực đơn: quán cho mang về/ship → đặt được như ở bàn; không → **"Thực đơn tham khảo"** không có nút +.
- **Đặt bàn** (`/reservations/new`, cũng là form sửa): `SectionCard` Người đặt (họ tên, SĐT) → Thời gian (chip ngày theo `bookingHorizonDays`, lưới giờ theo `slotIntervalMinutes`, tôn trọng `minimumAdvanceMinutes`) → Số khách (± + chip 2/4/6/10) → Ghi chú → `StickyActionBar` **Xác nhận đặt bàn**. Thẻ quy định giữ bàn chỉ hiện nếu có cấu hình thật.
- **Đơn của tôi** (`/reservations` + `/reservations/:id`): danh sách lượt đặt; chi tiết = thẻ trạng thái thật → khối "Đặt món trước khi đến" (nếu `canPreorder`) → chi tiết lịch hẹn (người đặt, số khách, giờ, bàn đã xếp nếu có, ghi chú) → địa chỉ + Chỉ đường + gọi quán → **Sửa đặt bàn / Huỷ bàn** (theo `can_request_change` / `can_cancel`).
- **DB (mig 088)**: `stores.google_maps_url text` (NULL được). Admin `/admin/settings` thêm ô "Link Google Maps" (chỉ nhận `https://`, rỗng = xoá). Mini App đọc thêm cột này ở `app.tsx`. Chưa cấu hình link → nút Chỉ đường mở tìm kiếm Google Maps theo địa chỉ (`https://www.google.com/maps/search/?api=1&query=<địa chỉ>`); không có cả địa chỉ → ẩn nút.

### MA-4 — Chọn món trước (m04) + Xác nhận (m05) + rà soát cuối
- **Chọn món trước** (`/reservations/:id/preorder`): thẻ lịch hẹn (tên, giờ, số khách) → `CategoryChips` → `ProductCard` (dùng chung với thực đơn) → `StickyActionBar` "N món đặt trước · tổng · Xem món đặt trước".
- **Xác nhận** (`/preorder/checkout`): thẻ lịch hẹn → thẻ cảnh báo "Món đặt trước chỉ gửi **một lần**, gửi xong không sửa được trên app" (khớp khoá sau gửi mig 071) → danh sách món → **ô ghi chú cho bếp** (tham số note của `submitPreorder` hiện đang truyền `null`) → tạm tính → **Khoá & gửi món đặt trước**. `window.alert` → `Toast`/sheet.
- **Rà soát**: khổ 360 và 390px, Bảo Lương + Pubu, cả hai lối vào, có/không có món trong giỏ, quán đóng cửa.

## 5. Dữ liệu & luồng

Không đổi luồng dữ liệu. Ngoài hai migration nhỏ (087 chặn gọi 3 phút, 088 link Google Maps), mọi màn chỉ đọc dữ liệu/RPC đang có. Các trường đọc thêm ở client: không có (ngoài `google_maps_url`).

## 6. Cố ý bỏ khỏi bản Stitch

"Giữ chỗ trong 15s", nhãn "Sân vườn & VIP", thẻ "Chính sách phục vụ" bịa, "Khu vực mong muốn" (DB không có), "Đã xác thực", "giữ bàn tối đa 15 phút" (trừ khi có cấu hình), mã QR check-in, "Khách quen Hạng Vàng", dải ảnh quảng cáo preorder, "Tiết kiệm 20 phút chờ", "Gợi ý cho đoàn N người", gợi ý riêng từng món, "hoàn tiền 100%", "Phí phục vụ miễn phí", "Sơ chế sẵn sàng", nhãn HOT/ĐẶC SẢN, nút "Thêm đá / Nước lẩu", mã "#BL-2409", "Chưa gồm giảm giá", trang Hỗ trợ m08 cùng lưới 6 loại yêu cầu và danh sách "Đang tới / Hoàn thành".

**Hoãn, hỏi riêng khi cần:** nhiều loại yêu cầu gọi NV (cần cột lý do + POS hiển thị), khách xem trạng thái yêu cầu gọi (cần RPC cho khách), trang Tài khoản thật.

## 7. Lỗi & trường hợp biên

- Ảnh món lỗi tải → biến thể không ảnh; không để khung ảnh vỡ.
- Gọi NV thất bại mạng → toast "Chưa gọi được, kiểm tra mạng rồi thử lại", không khoá nút.
- Quán đóng cửa / tạm nghỉ → giữ banner + khoá đặt như hiện nay (mig 017), hiển thị theo ngôn ngữ mới.
- Tên quán/món dài → cắt 1–2 dòng, không đẩy nút; giá luôn một dòng.
- Thanh đáy + TabBar + safe-area không bao giờ che nội dung cuối trang.

## 8. Kiểm thử

- Hàm thuần có test (vitest): `pickProductLayout`, tính giờ "gọi lại sau", trạng thái mở/đóng theo `serving_hours`, dựng link Chỉ đường, map trạng thái lượt gọi → nhãn.
- Migration 087/088: kiểm trên prod bằng SQL (gọi 2 lần trong 3 phút bị chặn; cột mới đọc được bằng anon).
- Mỗi sprint: em chụp Playwright khổ 360/390 cả hai quán; anh Tú test bằng `npm run dev` trong `mini-app-instances/bia-lau-bao-luong/mini-app` (sau `git merge` nhánh làm việc). **`zmp deploy` một lần** khi xong MA-4 (hoặc khi anh muốn xem trên máy thật) — nhắc chọn Development/Testing.
- Checklist: `docs/testing/mini-app-stitch/MA-1.md` … `MA-4.md`, mục lục trong `TESTING.md`.

## 9. Thứ tự làm

Nhánh `feat/mini-app-stitch` tách từ `main`. MA-1 → MA-2 → MA-3 → MA-4, mỗi sprint dừng chờ PASS (quy tắc CLAUDE.md).
