# Sổ thu chi (tiền mặt + chuyển khoản)

> Ngày: 2026-11-09 · Thuộc: [spec tổng Yên Garden](2026-11-09-yen-garden-trien-khai-design.md) · Migration: **113** (gộp với ca, mục B Part 2 của Đợt 1)

Ký hiệu: **[anh Tú]** = anh Tú đã chốt · **[em]** = em tự quyết.

## 1. Mục tiêu

Ghi mọi khoản tiền vào / ra **ngoài bán hàng**, bằng tiền mặt hoặc chuyển khoản **[anh Tú]**: đi chợ, ga, đá, trả nhà cung cấp, lương ngày, chủ quán rút tiền, nộp thêm tiền lẻ vào két… Đủ để làm báo cáo **thu chi / dòng tiền** và để két cuối ca khớp.

Thay thế "khoản chi trong ca" (spec Đợt 1 §B3): không tạo `cash_shift_expenses`.

## 2. Không làm

- Kế toán kép, hệ thống tài khoản kế toán, thuế.
- Đối soát sao kê ngân hàng tự động.
- Nhiều quỹ / nhiều tài khoản ngân hàng. Một quỹ tiền mặt (két) và một "quỹ ngân hàng" chung **[em]**.

## 3. Dữ liệu (mig 113, cùng file với ca)

```
cash_book_categories
  id, store_id, kind ('receipt'|'payment'), name, is_system boolean, is_active, sort_order,
  report_group ('operating_expense'|'inventory_purchase'|'owner_draw'|'other_income'|'cash_transfer')
  -- report_group quyết định dòng nào vào báo cáo lãi lỗ (spec báo cáo §4.3)
  -- seed mỗi quán khi tạo (và backfill quán cũ):
  --   chi: Nhập hàng (system, inventory_purchase), Đi chợ, Ga - than, Đá, Điện nước,
  --        Lương - thưởng, Sửa chữa, Khác (operating_expense), Chủ quán rút (owner_draw)
  --   thu: Nộp thêm vào két (cash_transfer), Thu khác (other_income)
  -- danh mục người dùng tạo: chọn nhóm khi tạo, mặc định operating_expense / other_income
  UNIQUE (store_id, kind, lower(name))

cash_book_entries
  id, store_id, kind ('receipt'|'payment'), method ('cash'|'bank'),
  category_id, amount bigint > 0, note (bắt buộc với danh mục 'Khác'),
  counterparty (null: tên người nhận / người nộp),
  business_date date,             -- ngày kinh doanh lúc ghi
  cash_shift_id (null),           -- tiền mặt ghi khi có ca mở thì gắn ca
  source ('manual'|'pos_drawer'|'inventory_receipt'), source_ref uuid null,
  client_request_id uuid, created_by, created_at,
  voided_by, voided_at, void_reason
  UNIQUE (store_id, client_request_id)
```

## 4. Quy tắc

1. **Tiền mặt + quán bật ca**: phiếu tiền mặt **bắt buộc** có ca đang mở và gắn `cash_shift_id`; không có ca thì báo "Chưa mở ca" **[em]**. Phiếu chuyển khoản không cần ca.
2. Phiếu ghi xong không sửa. Huỷ được, có lý do; phiếu tiền mặt chỉ huỷ được khi ca của nó **còn mở** (két đã chốt thì không đổi quá khứ) **[em]**. Phiếu nguồn `inventory_receipt` chỉ huỷ qua huỷ phiếu nhập.
3. Danh mục hệ thống ("Nhập hàng") không xoá, không đổi tên.
4. Két (spec tổng §4 mục 4): phiếu thu tiền mặt cộng, phiếu chi tiền mặt trừ vào tiền dự kiến của ca.
5. `business_date` = ngày kinh doanh tại thời điểm ghi (`business_date_of(now())`). Báo cáo lọc theo cột này.

## 5. Màn hình

**POS — nút "Thu/Chi két"** cạnh nút ca (thay nút "Chi tiền từ két" của spec Đợt 1): hộp nhập nhanh — Thu / Chi, số tiền, danh mục, ghi chú. Mặc định tiền mặt, gắn ca. Ai có quyền POS cũng dùng được.

**Trang Sổ thu chi `/admin/cashbook`** — Chủ quán + Quản lý ghi và huỷ; Thu ngân xem phiếu do mình tạo **[em]**.
- Bộ lọc khoảng ngày kinh doanh (mặc định hôm nay), loại, phương thức, danh mục.
- Ô tổng: Tổng thu, Tổng chi, Chênh lệch; tách TM / CK.
- Danh sách phiếu: giờ, loại, danh mục, số tiền, phương thức, người ghi, ca, ghi chú; phiếu huỷ gạch ngang.
- Tạo phiếu (TM hoặc CK, chọn ngày = hôm nay; không cho ghi lùi ngày **[em]**).
- Quản lý danh mục: thêm / đổi tên / ẩn danh mục không phải hệ thống.
- Xuất Excel theo bộ lọc.

**Phiếu bàn giao ca** (`/print/shift-report`, Đợt 1 §B2) liệt kê phiếu thu / chi tiền mặt trong ca.

## 6. RPC

- `cash_book_create(p_kind, p_method, p_category_id, p_amount, p_note, p_counterparty, p_client_request_id)` — kiểm quyền: Chủ quán/Quản lý mọi loại; Thu ngân chỉ tiền mặt qua POS **[em]**.
- `cash_book_void(p_id, p_reason)`
- `cash_book_list(p_store_id, p_from date, p_to date, p_filters jsonb)` — đọc
- Hàm nội bộ `cash_book_create_internal(...)` cho kho gọi (phiếu nhập đã trả). `REVOKE` khỏi client.
- `cash_shift_totals` (Đợt 1 plan B Task 5) đọc thêm `cash_book_entries` thay cho `cash_shift_expenses`, và tiền mặt khách trả nợ (spec công nợ).

## 7. Sửa plan Đợt 1 mục B Part 2

- Task 5 (mig 113): thay bảng `cash_shift_expenses` bằng hai bảng ở §3; công thức két theo spec tổng §4.4; seed danh mục.
- Task 8 (ca trên POS): nút "Thu/Chi két" thay "Chi tiền từ két".
- Thêm task: trang `/admin/cashbook` + Excel.
- Task 9 (phiếu bàn giao): dòng thu khác / chi theo danh mục.

## 8. Kiểm thử bắt buộc

- Công thức két với: thu bill TM, phiếu thu TM, phiếu chi TM, phiếu CK (không ảnh hưởng két), phiếu huỷ (không ảnh hưởng), khách trả nợ TM.
- Không có ca + bật ca + phiếu TM → lỗi; phiếu CK → được.
- Huỷ phiếu TM khi ca đã đóng → lỗi.
- Idempotent theo `client_request_id`.
- Quyền: Phục vụ không gọi được; quán A không thấy sổ quán B.

Checklist tay: `docs/testing/yen-garden/THU-CHI.md` (gộp với checklist ca).
