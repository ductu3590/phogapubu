# Pha 3 — POS dựng theo bố cục Stitch P01–P05

Ngày: 2026-10-03 · Trạng thái: **duyệt 2026-10-03** — dựng thành TRANG MỚI `/admin/pos`; POS-1..4 PASS 2026-10-03, `/admin/cashier` đã xoá (URL cũ chuyển hướng) · Nền: design system đã chốt (UI-1..UI-5, CLAUDE.md 2026-10-02)

## 1. Mục tiêu

Đổi **bố cục và luồng thao tác** của `/admin/cashier` theo 5 màn Stitch (`docs/design/p01..p05`), không chỉ đổi màu.
Pha 2 mới thay lớp da; Pha 3 thay khung trang.

**Ràng buộc (anh Tú chốt 2026-10-03):** chỉ dựng phần làm được bằng **dữ liệu và RPC đang chạy**. Mọi thứ cần
migration / đổi RPC tách thành mục riêng, có spec riêng, hỏi riêng (mục 5).

## 2. Khung trang mới (P01, chung cho P02–P05)

```
┌ Thanh trên ───────────────────────────────────────────────────────────────┐
│ Quán · Ca (theo serving_hours) · trạng thái kết nối  [+ Đặt bàn] [Khách vãng lai] │
│ Hàng đợi: Đặt bàn chờ duyệt 2 · Khách trễ 1 · Lượt món chờ duyệt 2 · Gọi NV 1  │  ← chip bấm được, lọc panel phải
├ Tab: [Timeline] [Sơ đồ bàn] [Danh sách]   Khu vực: [Tất cả][Sân][Tầng 1]…  [Về bây giờ] ┤
│                                                     │ Panel phải          │
│  Vùng chính (theo tab)                              │ (bill / việc cần    │
│                                                     │  xử lý / tiếp nhận) │
├ Chân: tổng bàn · đang phục vụ · đã đặt · trống · chú giải 5 màu trạng thái ┤
```

- **Timeline** (mới, mặc định): mỗi hàng một bàn, nhóm theo khu vực (`table_areas`, mig 048); trục giờ theo ca
  (`serving_hours`, rỗng thì 10:00–24:00), vạch đỏ "bây giờ", nút "Về bây giờ" cuộn về giờ hiện tại.
  - Thanh **phiên đang mở**: `opened_at` → bây giờ, màu xanh lá; mâm N bàn = thanh trên từng bàn + vạch trái màu mâm + "Mâm N".
  - Thanh **đặt bàn**: `arrival_at` → `+planning_hold_minutes`, xanh dương (đã xác nhận) / vàng (chờ duyệt);
    quá giờ hẹn chưa đến = đỏ "Trễ Np".
  - **Xung đột** (đỏ): phiên đang mở trùng khung giữ bàn của đặt bàn sắp tới — tính ở client, hàm thuần có test.
  - Bấm thanh phiên → mở bill; bấm thanh đặt bàn → panel tiếp nhận (P02); bấm khoảng trống tương lai →
    form đặt bàn có sẵn giờ + bàn (`createManualReservation` đang có).
  - Trên điện thoại / tablet dọc: Timeline cuộn ngang trong khung, cột tên bàn dính trái.
- **Sơ đồ bàn**: giữ nguyên floor-map hiện tại (UI-2).
- **Danh sách**: bảng các phiên đang mở + đặt bàn trong ca (bàn, khách, giờ, tạm tính, trạng thái).

## 3. Panel phải — 4 chế độ

| Màn Stitch | Chế độ panel | Dữ liệu / action dùng lại |
|---|---|---|
| P01 | **Bill mâm**: tab Hoá đơn / Lượt gọi mới (badge) / Lịch sử in; tặng / bỏ / khôi phục món; ghi món tay; in tạm tính; nút **Thanh toán** bị khoá khi còn lượt chờ duyệt (ghi rõ lý do) | `getSessionsBill`, mig 046/047, `manual-order-sheet`, print-order |
| P03 | **Duyệt lượt gọi**: mỗi lượt một thẻ (giờ, nguồn QR / NV đặt hộ, món, ghi chú, tiền) + Duyệt & in bếp / Từ chối (sheet lý do); "Duyệt nhanh tất cả" | `pos_confirm_order`, `reject-order-sheet` (mig 077) |
| P04 | **Thanh toán & đóng mâm** — một nút "Thanh toán" mở màn này: danh sách món + tặng/bỏ, tổng nguyên giá / giảm trừ / cần thu; chọn **Tiền mặt / Chuyển khoản**; tiền mặt có ô tiền khách đưa + gợi ý (vừa đủ, làm tròn 50k/100k) + tiền thối (chỉ tính ở UI); nút "Xác nhận đã nhận N đ"; máy in lỗi vẫn thu được tiền | `closeTableSession(…, 'paid', 'cash' \| 'bank')`, `closeTableSessionsBulk` |
| P02 / P05 | **Việc cần xử lý**: một danh sách gộp, lọc theo chip (Gọi NV / Đặt bàn / Trễ / Đơn chờ duyệt / Món đặt trước); thẻ đặt bàn mở ra **Tiếp nhận khách**: thông tin, món đặt trước, chọn bàn (gợi ý bàn đã gán), hoãn +10/+15/+30, báo vắng, huỷ, "Xác nhận khách đã đến & mở mâm" | `arriveReservation`, `snoozeReservationReminders`, `markReservationNoShow`, `cancelStoreReservation`, `resolveServiceRequest`, `resolveReservationCustomerCall`, preorder actions |

Dưới `xl` (1280px) panel phải vẫn là sheet như UI-3.

## 4. Chia sprint (mỗi sprint dừng chờ PASS)

| Sprint | Nội dung |
|---|---|
| **POS-1** | Khung mới (thanh trên + chip hàng đợi + tab + lọc khu vực + chân), tab **Timeline** chỉ đọc + Danh sách; Sơ đồ bàn giữ nguyên. Hàm thuần `lib/pos-timeline.ts` (thanh, trễ, xung đột) + test |
| **POS-2** | Panel **Việc cần xử lý** gộp (P05) + **Duyệt lượt gọi** (P03) |
| **POS-3** | Panel **Bill** dạng tab (P01) + màn **Thanh toán & đóng mâm** một nút (P04) |
| **POS-4** | **Tiếp nhận khách đặt bàn** (P02) + bấm khoảng trống Timeline để đặt bàn |

Không đụng: API, RPC, migration, logic tiền. Màn `/staff/*` không đổi trong Pha 3.

## 5. Có trong Stitch nhưng KHÔNG làm ở Pha 3 (cần DB / nghiệp vụ — hỏi riêng sau)

| Mục | Vì sao cần thay đổi nghiệp vụ / DB |
|---|---|
| "Chờ cọc" / "Đã cọc 1tr" | Chưa có khái niệm đặt cọc |
| Sức chứa từng bàn ("4–6 khách") | Chỉ có `default_table_capacity` cho cả quán |
| Mã VietQR động trên màn thanh toán | Mảng thanh toán trả trước đã hoãn (quyết định 2026-08-31) |
| Trạng thái gửi ZNS / Zalo relay | Chưa có log gửi tin theo đặt bàn trên POS |
| Gợi ý ghép bàn liền kề theo sức chứa | Cần sức chứa từng bàn |
| Nội dung gọi NV tự do ("xin thêm xô đá") | `service_requests.type` chỉ `payment` / `help` (cùng mục M08) |
| Xuất Excel, "Reset demo", "Mô phỏng" | Nút demo của bản vẽ, không phải tính năng |

Những ô này **ẩn đi**, không vẽ giả.

## 6. Rủi ro

- Timeline 20 bàn × ca 6–14 giờ: vẽ bằng CSS grid, không thư viện Gantt; thanh tính một lần mỗi phút (đồng hồ chung).
- Realtime đang có (sessions / orders / service_requests) cấp dữ liệu cho cả 3 tab — không thêm subscription mới.
- `cashier-client.tsx` đã ~900 dòng: tách khung / Timeline / panel thành file riêng trước khi thêm.
