# A04 — "Hoá đơn & Báo cáo" thay hai trang Đơn hàng + Báo cáo

**Ngày:** 2026-10-12 · **Trạng thái:** chờ anh Tú duyệt
**Bản vẽ:** `docs/design/a04/code.html` + `screen.png` (Stitch, tab A04 trong hộp thoại cấu hình)
**Thay thế:** `/admin/orders` (Đơn hàng) và `/admin/dashboard` (Báo cáo ngày PA-1). Hai trang cũ chạy song
song tới khi trang mới PASS, rồi mới xoá (như cách làm POS 2026-10-03).

## 1. Quyết định đã chốt (2026-10-12)

| Câu hỏi | Chọn |
|---|---|
| Báo cáo theo ca hay theo ngày | **Theo ngày** (giờ VN). Ca làm việc (mở ca, tiền đầu ca, đếm két, chênh lệch, phiếu bàn giao) để spec riêng sau |
| Mã hoá đơn | ~~Số thứ tự thật~~ **HOÃN (anh Tú, 2026-10-12)**. Tạm dùng **mã rút gọn `#XXXXXX`** = 6 ký tự cuối ID phiên đầu tiên của bill (bill gộp lấy ID nhỏ nhất) hoặc ID đơn (đơn không phiên) — cùng kiểu mã trang Đơn hàng đang hiện. Không migration, không in lên hoá đơn. Kế hoạch số thật để sẵn: `docs/superpowers/plans/2026-10-12-a04-1-bill-numbers.md` |
| Cột Khách hàng | **Giữ**, lấy từ đặt bàn (`reservations.session_id` → `customer_name`, `party_size`); đơn mang về/ship lấy `orders.customer_name`; khách vãng lai để "—" |
| Xuất file | **Excel thật `.xlsx`** |

## 2. Lệch bản vẽ có chủ đích

- "Ca tối 17:00–23:30 · Đang chạy", "Thu ngân trực máy", "Thời gian phiên làm việc" → thay bằng **ngày đang xem**
  + **người đang đăng nhập** + chọn ngày. Nút cuối "Chốt ca & In báo cáo tổng kết" → **"In báo cáo cuối ngày"**.
- Thẻ "Chuyển khoản VietQR · Khớp tài khoản ngân hàng" → **"Chuyển khoản · Đối chiếu app ngân hàng"**. Hệ thống
  KHÔNG xác minh được tiền chuyển khoản đã về (Option A, 2026-07-08) — không được ghi "khớp".
- "Tiền trong két an toàn ca" → "Đối chiếu với két".
- Bỏ nút "Lưu thay đổi" / "Hủy bỏ" (trang chỉ đọc + thao tác từng đơn, không có gì để lưu chung).
- Font Be Vietnam Pro + icon lucide + màu trạng thái theo design system (2026-10-02 / Pha 4), không dùng Geist/Material.

## 3. Bố cục (theo A04)

1. **Đầu trang:** ngày (thứ, dd/mm/yyyy) + nhãn "Hôm nay" + người đăng nhập · chọn ngày · nút **Xuất Excel** ·
   nút **In báo cáo cuối ngày**.
2. **4 thẻ:** Tổng thực thu (N hoá đơn) · Tiền mặt · Chuyển khoản (+ dòng "ví/khác" nếu có) · Đang phục vụ / chưa
   thu (N bàn, tạm tính). Ngày cũ: thẻ 4 đổi thành "Số hoá đơn" như hiện nay.
3. **Thanh lọc:** chip `Tất cả` · `Đã thanh toán` · `Đã huỷ / giảm trừ` · `Chờ thu` (mỗi chip kèm số đếm) + ô tìm
   "Bàn, mã HD, tên khách". Lọc + tìm ở trình duyệt (dữ liệu 1 ngày đủ nhỏ).
4. **Bảng hoá đơn (8/12 cột):** Mã (`#XXXXXX`) · Bàn (nhãn Ghép / Mang về / Ship) · Khách hàng (tên · số khách) · Vào / Món
   · Tổng tiền & phương thức · Trạng thái · Thao tác (Xem bill, In lại). Phân trang 20 dòng. "Cập nhật lúc
   HH:MM:SS" + tự làm mới (dùng lại `OrdersRealtime`).
5. **Cột phải (4/12): Lịch sử điều chỉnh bill** — Bỏ / Tặng / Sửa số lượng, giờ, người làm, bàn, lý do.
6. **Ngăn kéo "Xem bill"** (mở từ dòng): danh sách món theo lượt, dòng Bỏ/Tặng 0đ kèm lý do, giảm giá voucher,
   kết quả vòng quay, ghi chú + các nút thao tác (mục 5).
7. Màn hẹp: bảng thành danh sách thẻ, cột điều chỉnh xuống dưới (container query như trang Ưu đãi).

## 4. Dữ liệu — RPC mới `get_bills_report(p_store_id, p_date)` (mig riêng)

Hàm MỚI, không `CREATE OR REPLACE get_daily_report` → trang Báo cáo cũ chạy nguyên trong lúc làm. Chỉ đọc,
`SECURITY DEFINER`, kiểm quyền `is_store_pos_operator` (mig 093). Luật tiền thật + gom bill **giữ nguyên** mig 092
(`closed_by@closed_at` chỉ khi `close_reason='paid'`; `S:<session>`; `O:<order>`). Tiền tính ở server, client
chỉ hiển thị.

Trả về:
- `totals` (như 092) · `open` (như 092).
- `bills[]` = 092 + thêm: `opened_at` (min `table_sessions.opened_at`; đơn không phiên = `created_at`),
  `order_type`, `customer_name`, `party_size`, `discount_total`, `adjustments_count`.
- `waiting[]` (**Chờ thu**): mỗi phiên đang mở = 1 dòng (bàn, mâm/ghép, `opened_at`, khách đặt bàn, số món, tạm
  tính) + đơn trả trước chưa nhận tiền trong ngày (luật `isAwaitingPayment` của `lib/revenue.ts`).
- `cancelled[]`: đơn `status='cancelled'` hoặc `rejected_at` trong ngày (bàn, giờ, tổng, nguồn đơn).
- `adjustments[]` = 092 + **sửa số lượng** (`order_item_quantity_changes`, mig 098: từ → tới, lý do, người làm).

**Sửa luôn lỗi gom bill của 092:** phiên đóng `paid` gom theo `closed_by` + **giờ nhận tiền của phiên**
(`MAX(payment_received_at)` các đơn trong phiên — `close_table_session` ghi `now()` của transaction thu tiền),
KHÔNG theo `closed_at`. Lý do: `close_table_session` giữ `closed_at = COALESCE(closed_at, now())`, nên các phiên bị
job hết hạn đóng cùng lúc rồi thu RIÊNG từng bàn sẽ trùng `closed_at` + `closed_by` và bị 092 gộp nhầm thành một bill.
Gộp bill N mâm vẫn gom đúng vì N phiên thu trong MỘT transaction (cùng `now()`).

Chip "Đã huỷ / giảm trừ" = `cancelled[]` + bill có `adjustments_count > 0` hoặc `discount_total > 0`.
"Tất cả" = bills + waiting + cancelled.

### 4.1 Số hoá đơn — HOÃN

Anh Tú quyết định 2026-10-12 bỏ qua ở giai đoạn này. Kế hoạch đầy đủ (mig bộ đếm + trigger + test) để ở
`docs/superpowers/plans/2026-10-12-a04-1-bill-numbers.md`, ghi trong memory `project_ideas_backlog`.

## 5. Chuyển chức năng từ trang Đơn hàng sang

Trang Đơn hàng đang có những việc A04 không có chỗ — đưa vào **ngăn kéo Xem bill** của dòng đơn trả trước /
mang về:
- **Đã nhận tiền** (`confirmManualPayment`), **Hoàn tất** (`completeOrder`), **Huỷ đơn** (`cancelOrder`, chỉ đơn
  chưa có tiền thật), **Đã đổi thưởng** (`redeemSpin`).
- Nhãn nguồn/loại đơn (`orderTags`), giảm giá + mã voucher, ghi chú.
- Lazy-quét `sweep_abandoned_orders` khi mở trang (như trang cũ).

Quyền giữ NGUYÊN kiểm tra ở server action hiện có; nút nào vai trò không được dùng thì ẩn. Thu ngân xem được
trang (như Báo cáo hiện nay).

## 6. Xuất Excel + In báo cáo cuối ngày

- **Excel:** route handler `GET /admin/bills/export?date=` (kiểm quyền POS + lọc `store_id`), thư viện **exceljs**
  (không dùng gói npm `xlsx` — bản trên npm đã ngừng cập nhật). 3 sheet: Tổng hợp · Hoá đơn · Điều chỉnh. Cột
  tiền là số (định dạng `#,##0`), không phải chữ. Tên file `bao-cao-<slug>-<yyyy-mm-dd>.xlsx`.
- **In cuối ngày 80mm:** trang `/print/day-report?date=` NGOÀI khung `/admin` (bài học PA-3 + 2026-10-12), in bằng
  `printInPlace()`: tên quán, ngày, giờ in, người in · 3 dòng tổng (TM / CK / ví) · số hoá đơn · bàn chưa thu +
  tạm tính · tổng Bỏ / Tặng. Không in danh sách từng bill (dài quá với khổ 80mm).

## 7. Các bước (mỗi bước dừng chờ test PASS)

| Bước | Nội dung | Migration |
|---|---|---|
| **A04-1** | RPC `get_bills_report` + bộ đọc `lib/bills-report.ts` (hàm thuần + test) + trang `/admin/bills` (đầu trang, 4 thẻ, chip, tìm, bảng, phân trang, cột điều chỉnh, tự làm mới) + route hộp thoại + thanh icon/tab. Chỉ XEM, chưa thao tác | mig 100 |
| **A04-2** | Ngăn kéo Xem bill + chuyển 4 thao tác từ trang Đơn hàng + In lại | — |
| **A04-3** | Xuất Excel + In báo cáo cuối ngày | — |
| **A04-4** | Dọn dẹp: xoá `/admin/orders`, `/admin/dashboard`, 2 route `@modal`; chuyển hướng URL cũ trong `next.config`; sửa `admin-nav.tsx`, `config-dialog.tsx`, `lib/auth/roles.ts` (`CASHIER_ADMIN_PATHS`), trang đăng nhập, `revalidatePath` trong `lib/actions/orders.ts` + `spin.ts`, test liên quan; cập nhật CLAUDE.md | (tuỳ) drop `get_daily_report` |

## 8. Rủi ro / cần để ý

- `list_open_table_sessions` không trả `confirmed_at` (CLAUDE.md 2026-10-03) — `waiting[]` lấy thẳng từ bảng,
  không dựa hàm đó.
- Đơn `order_source='pos'` / `reservation_preorder` nằm `pending` mãi — không đếm vào "Chờ thu" của đơn trả trước.
- Trang có điều hướng mềm: KHÔNG poll bằng server action (bài học ST-3) — làm mới bằng realtime + `router.refresh()`.

## 9. Ngoài phạm vi

Ca làm việc · số hoá đơn thật (hoãn, §4.1) · lọc nhiều ngày / theo tháng · biểu đồ.
