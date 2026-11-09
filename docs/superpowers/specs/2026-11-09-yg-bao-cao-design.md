# Báo cáo bán hàng và 4 báo cáo tài chính

> Ngày: 2026-11-09 · Thuộc: [spec tổng Yên Garden](2026-11-09-yen-garden-trien-khai-design.md) · Migration: **117** (bán hàng), **125** (tài chính)

Ký hiệu: **[anh Tú]** = anh Tú đã chốt · **[em]** = em tự quyết.

## 1. Mục tiêu

Quản lý Yên Garden yêu cầu **[anh Tú]**:
- Báo cáo theo món, theo khung giờ, món huỷ, theo danh mục ("lẩu nào bán nhiều, loại nướng nào được ưa chuộng").
- 4 báo cáo tài chính: doanh thu theo ngày/tháng, thu chi / dòng tiền, lãi lỗ (có giá vốn), công nợ phải thu.

Chủ quán ít có mặt, xem từ xa trên điện thoại **[anh Tú]**: mọi báo cáo đọc tốt ở 375px.

## 2. Không làm

- Báo cáo theo nhân viên phục vụ, theo khu, theo khách hàng thân thiết.
- So sánh cùng kỳ năm trước, dự báo.
- Báo cáo thuế, VAT.
- Biểu đồ phức tạp: mỗi báo cáo tối đa một biểu đồ đơn giản (cột / đường) **[em]**.

## 3. Trang Báo cáo `/admin/reports`

- Trang mới, có trong rail ("Báo cáo" hiện trỏ A04 — đổi thành nhóm: **Hoá đơn** (A04, giữ nguyên) và **Báo cáo** (trang mới)) **[em]**.
- Thanh chọn kỳ dùng chung: Hôm nay · Hôm qua · 7 ngày · Tháng này · Tháng trước · Tuỳ chọn (từ – đến). Kỳ tính theo **ngày kinh doanh** (`business_day_bounds`, mig 111).
- Tab: Theo món · Theo danh mục · Theo giờ · Món huỷ · Doanh thu · Thu chi · Lãi lỗ · Công nợ.
- Mỗi tab có nút **Xuất Excel**.
- Quyền: 4 tab bán hàng — Chủ quán, Quản lý, Thu ngân; 4 tab tài chính — Chủ quán, Quản lý (`is_store_back_office`).

## 4. Định nghĩa số liệu

### 4.1. Phạm vi "đã bán" [em]

Mọi báo cáo bán hàng tính trên các **đơn đã thu tiền** có giờ nhận tiền nằm trong kỳ (cùng gốc với doanh thu A04), để tổng các báo cáo khớp nhau:

```
Σ tiền món (theo món) − giảm giá bill trong kỳ = Doanh thu A04 của kỳ
```

Bàn chưa thu không vào báo cáo; trang ghi dòng nhỏ "Chưa gồm N bàn đang mở".

### 4.2. Báo cáo bán hàng (mig 117, chỉ đọc)

| Tab | Mỗi dòng | Cột |
|---|---|---|
| Theo món | Một tên món đã chụp (`order_items.item_name`, đã gồm biến thể "Bia hơi (Tháp)") | SL bán, SL tặng, Tiền (giá × SL, tặng = 0đ, kèm topping), % doanh thu; sắp theo tiền hoặc SL; lọc danh mục |
| Theo danh mục | Danh mục hiện tại của món (món mất danh mục → "Khác") | SL, Tiền, % ; bấm một danh mục xổ ra top món trong danh mục đó |
| Theo giờ | Khung 1 giờ theo giờ món **vào bếp** (`confirmed_at`, không có thì `created_at`) | Số lượt gọi, số món, tiền món; biểu đồ cột theo giờ |
| Món huỷ | Một lần bỏ món / tặng món / giảm số lượng | Giờ, bàn, món, SL, tiền, loại (Bỏ / Tặng / Giảm SL), lý do, người làm; tổng tiền bỏ, tổng tiền tặng |

"Món huỷ" lấy từ `order_items.void_*` và `order_item_quantity_changes` (dùng lại nguồn của cột Lịch sử điều chỉnh A04), lọc theo **giờ thao tác** trong kỳ.

RPC: `report_sales_by_item`, `report_sales_by_category`, `report_sales_by_hour`, `report_voids` — tham số `(p_store_id, p_from date, p_to date)`, kiểm `is_store_pos_operator`.

### 4.3. Báo cáo tài chính (mig 125, chỉ đọc)

**Doanh thu theo ngày / tháng**
- Chế độ Ngày: mỗi ngày kinh doanh trong kỳ một dòng. Chế độ Tháng: mỗi tháng trong 12 tháng gần nhất một dòng.
- Cột: Doanh thu, Giảm giá bill, Tiền mặt, Chuyển khoản, Ghi nợ, Số bill, TB/bill. Một biểu đồ đường doanh thu.
- Số liệu mỗi ngày phải **bằng đúng** `get_bills_report` ngày đó (dùng chung hàm tính, không viết công thức thứ hai).

**Thu chi / dòng tiền**
- Hai quỹ: Tiền mặt, Ngân hàng.
- Tiền vào: thu bill (TM / CK), thu nợ (TM / CK), phiếu thu theo danh mục.
- Tiền ra: phiếu chi theo danh mục (TM / CK).
- Chênh lệch kỳ = vào − ra, theo từng quỹ. Không có số dư đầu kỳ **[em]**.
- Ghi nợ **không** là tiền vào.

**Lãi lỗ**
```
Doanh thu thuần          = doanh thu kỳ (đã trừ giảm giá bill)
− Giá vốn hàng bán       = inventory_cogs(kỳ)   (spec kho §5)
= Lãi gộp
− Chi phí hoạt động      = phiếu chi report_group='operating_expense'
− Hàng huỷ (xuất huỷ kho theo giá vốn)
+ Thu nhập khác          = phiếu thu report_group='other_income'
= Lãi ròng
```
- Không tính: phiếu chi "Nhập hàng" (đã vào giá vốn qua kho), "Chủ quán rút", "Nộp thêm vào két" **[em]**.
- Khi nguyên liệu chưa có phiếu kiểm cuối kỳ: dòng cảnh báo vàng "Giá vốn nguyên liệu chưa tính — cần kiểm kho"; khi có hàng thiếu giá nhập: liệt kê.
- Ghi nợ vẫn là doanh thu (cơ sở dồn tích).

**Công nợ phải thu**
- Mỗi khách: Nợ đầu kỳ, Phát sinh nợ trong kỳ, Đã thu trong kỳ, Nợ cuối kỳ, Bill nợ cũ nhất.
- Tuổi nợ của nợ cuối kỳ: 0–7 ngày, 8–30 ngày, trên 30 ngày.
- Dòng tổng; bấm khách mở trang Công nợ của khách đó.

RPC: `report_revenue_series(p_store_id, p_from, p_to, p_grain 'day'|'month')`, `report_cash_flow`, `report_profit_loss`, `report_receivables` — kiểm `is_store_back_office`.

## 5. Kiểm thử bắt buộc

- Đối chiếu: Σ theo món − giảm giá bill = doanh thu A04, cho một ngày có bỏ món, tặng món, sửa SL, giảm giá bill, bill kết hợp, bill ghi nợ.
- Σ theo danh mục = Σ theo món; Σ theo giờ (tiền món) = Σ theo món.
- Doanh thu theo ngày = `get_bills_report` từng ngày (test so sánh trực tiếp).
- Ranh giới ngày kinh doanh (giao dịch đúng giờ bắt đầu, phút trước đó).
- Lãi lỗ với số cụ thể: có giá vốn bia lon, có nguyên liệu kiểm kho, có phiếu chi các nhóm.
- Công nợ: đầu kỳ + phát sinh − thu = cuối kỳ.
- Quyền: Thu ngân bị từ chối 4 RPC tài chính; cách ly quán.

Checklist tay: `docs/testing/yen-garden/BAO-CAO.md`.
