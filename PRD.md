# MEVO — Product Requirements Document (PRD)

**Version:** 2.0 — Zalo Mini App First
**Cập nhật:** 2026-05-10

---

## 1. Vấn đề & Giải pháp

**Pain point:** Quán đông khách, nhân viên chạy không kịp gọi món. Khách ngồi chờ. Giờ cao điểm hỗn loạn.

**Giải pháp MEVO:** Khách tự order qua Zalo — app đã có trên điện thoại. Thanh toán ZaloPay 1 chạm ngay trong Zalo. Bếp nhận đơn tức thì.

---

## 2. Người dùng & Thiết bị

| Nhóm | Thiết bị | App |
|---|---|---|
| Khách ăn | Điện thoại cá nhân | Zalo (Mini App MEVO) |
| Nhân viên bếp | Tablet cố định tại bếp | Trình duyệt (Kitchen Display) |
| Chủ quán | PC hoặc điện thoại | Trình duyệt (Admin Web) |

---

## 3. Tính năng MVP

---

### MODULE 1 — Zalo Mini App (Khách hàng)

#### 1.1 Trang menu chính
- Hiển thị tên quán + "Bàn số X" rõ ràng
- Danh mục tabs cuộn ngang: Món chính / Đồ uống / Tráng miệng...
- Mỗi món: ảnh, tên, giá, nút [+] thêm vào giỏ
- Món hết hàng: hiển thị mờ + badge "Tạm hết", không cho thêm
- Giỏ hàng sticky bottom: "Xem giỏ (X món) — XXX.000đ"
- Khách có thể gọi thêm nhiều lần trong cùng phiên

#### 1.2 Giỏ hàng
- Danh sách món, điều chỉnh số lượng (tăng/giảm/xóa)
- Ghi chú cho toàn đơn: "Ít đường", "Không hành"
- Tổng tiền
- Nút "Đặt món và Thanh toán" → chuyển sang payment

#### 1.3 Thanh toán (ZaloPay SDK)
- Backend tạo ZaloPay order → nhận `zp_trans_token`
- Mini App gọi `ZaloPay.payOrder(token)` → ZaloPay mở ngay trong Zalo
- Khách xác nhận bằng vân tay / Face ID / PIN
- ZaloPay callback → backend confirm → chuyển sang trang trạng thái
- **Fallback:** Nếu khách chọn "Trả tiền mặt" → đặt đơn không cần thanh toán online

#### 1.4 Trạng thái đơn hàng (Realtime)
- Subscribe Supabase Realtime cho order_id
- Hiển thị timeline:
  - ⏳ Đơn đã gửi — đang chờ xác nhận
  - 🍳 Bếp đang làm món
  - ✅ Xong! Nhân viên đang mang ra
- Danh sách món trong đơn
- Khách nhận thêm ZNS qua Zalo khi trạng thái thay đổi

---

### MODULE 2 — Kitchen Display (Màn hình bếp)

**URL:** `mevo.vn/kitchen/[store-slug]` (trình duyệt, không cần login phức tạp — dùng secret URL)

#### 2.1 Layout 3 cột realtime
```
[CHỜ XỬ LÝ]       [ĐANG LÀM]         [XEM LẠI]
──────────────     ──────────────      ──────────────
Bàn 3 — #045       Bàn 1 — #044       Bàn 5 — #043
⏱ vừa xong        ⏱ 4 phút            ⏱ 12 phút
• Phở gà x2        • Bún bò x1         ✅ Đã xong
• Nước cam x1      • Bia Hà Nội x2
[Bắt đầu làm]      [Đã xong]
```

#### 2.2 Hành vi
- Đơn mới → chuông báo + card nổi bật ở cột trái
- Bấm "Bắt đầu làm" → chuyển sang cột giữa, order status: `cooking`
- Bấm "Đã xong" → chuyển sang cột phải, order status: `ready`
  → Trigger ZNS gửi thông báo cho khách
- Tối ưu cho tablet 10" dựng cố định, chữ to, contrast cao

---

### MODULE 3 — Admin Web (Chủ quán)

**URL:** `mevo.vn/admin`

#### 3.1 Đăng nhập
- Email + password (Supabase Auth)
- Nhớ đăng nhập 30 ngày

#### 3.2 Dashboard tổng quan
- Doanh thu hôm nay (tổng đơn `paid`)
- Số đơn hôm nay / đang xử lý
- Shortcut nhanh: Menu / Bàn / Đơn hàng

#### 3.3 Quản lý menu
- Danh sách món theo danh mục
- Toggle bật/tắt từng món (hết hàng) — **1 click**
- Thêm món: tên, giá, danh mục, upload ảnh, mô tả
- Sửa / xóa món
- Thêm / sắp xếp danh mục

#### 3.4 Quản lý bàn & QR
- Danh sách bàn
- Thêm bàn mới (nhập tên tuỳ ý: "Bàn 1", "Bàn VIP", "Sân thượng A")
- Mỗi bàn: xem QR → **download PNG** để in dán
- QR encode URL Zalo Mini App: `zalo.me/s/[APP_ID]/?table=[TABLE_ID]&store=[STORE_ID]`
- Bật/tắt bàn (bàn đang sửa chữa)

#### 3.5 Danh sách đơn hàng
- Lọc theo ngày
- Mỗi đơn: bàn, thời gian, món, tổng tiền, trạng thái, hình thức thanh toán
- Bấm "Đã thanh toán" cho đơn trả tiền mặt
- Xem chi tiết đơn

---

## 4. Tiêu chí DONE của MVP

MVP hoàn thành khi:
- [ ] Khách quét QR bàn trong Zalo → xem menu → đặt món thành công
- [ ] Thanh toán ZaloPay trong Zalo (không rời app)
- [ ] Đơn hiện trên kitchen display trong vòng 3 giây
- [ ] Khách nhận ZNS khi bếp báo xong
- [ ] Chủ quán thêm/sửa món, tạo bàn, tải QR được
- [ ] Test thực tế tại Phở Gà Pubu ít nhất 1 ngày liên tục

---

## 5. Out of Scope — Không làm trong MVP

- ❌ Loyalty / tích điểm / voucher
- ❌ Takeaway / pre-order online
- ❌ Đặt bàn trước
- ❌ In bill qua máy in nhiệt
- ❌ Quản lý nhân viên / ca làm
- ❌ Multi-branch (nhiều chi nhánh)
- ❌ Tích hợp CukCuk / Sapo / KiotViet
- ❌ Báo cáo nâng cao (theo món bán chạy, giờ cao điểm)
- ❌ MoMo / VNPay (chỉ ZaloPay cho MVP)

---

## 6. Câu hỏi đã quyết định

| Câu hỏi | Quyết định |
|---|---|
| Khách có cần đăng nhập không? | Không — Zalo tự lấy user_id ngầm |
| 1 bàn có nhiều đơn cùng lúc? | Có — mỗi lần bấm "Đặt món" = 1 đơn mới |
| Ai xác nhận tiền mặt? | Chủ quán bấm "Đã thanh toán" trong admin |
| Menu có combo/set meal? | Không — MVP chỉ món đơn |
| Kitchen display cần login không? | Không — dùng secret URL (store-specific) |
