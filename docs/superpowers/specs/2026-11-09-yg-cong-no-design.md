# Công nợ khách hàng

> Ngày: 2026-11-09 · Thuộc: [spec tổng Yên Garden](2026-11-09-yen-garden-trien-khai-design.md) · Migration: **119** · Cần trước: mục A thu kết hợp (mig 112a/b), ca + sổ thu chi (mig 113)

Ký hiệu: **[anh Tú]** = anh Tú đã chốt · **[em]** = em tự quyết.

## 1. Mục tiêu

Khách cơ quan và khách quen ăn trước, trả sau nhiều ngày **[anh Tú]**. Thu ngân ghi nợ ngay lúc thu tiền bàn, khách trả nợ một phần hoặc trả gộp nhiều bill, chủ quán xem ai đang nợ bao nhiêu.

Chốt **[anh Tú]**: thu ngân **tự thêm** khách nợ ngay lúc thu, **không hạn mức**.

## 2. Không làm

- Hạn mức, chặn ghi nợ, nhắc nợ tự động (Zalo/SMS).
- Xuất hoá đơn VAT (quán xuất trên phần mềm khác **[anh Tú]**).
- Lãi chậm trả, chiết khấu thanh toán sớm.
- Công nợ nhà cung cấp.

## 3. Dữ liệu (mig 119)

```
debt_customers
  id, store_id, name, phone (null), kind ('company'|'person'), note,
  created_by, created_at, is_active
  UNIQUE (store_id, phone) WHERE phone IS NOT NULL

-- mở rộng mục A:
bill_payment_lines.instrument CHECK ('cash','bank','debt')
bill_payments.debt_customer_id (null, FK) -- bắt buộc khi có dòng 'debt'

debt_payments                       -- một lần khách trả nợ
  id, store_id, debt_customer_id, amount bigint > 0, method ('cash'|'bank'),
  cash_shift_id (null), business_date, note,
  client_request_id, created_by, created_at, voided_by, voided_at, void_reason
  UNIQUE (store_id, client_request_id)

debt_payment_allocations            -- trả cho bill nào
  id, debt_payment_id, bill_payment_id, amount bigint > 0
```

**Số nợ của một bill** = tổng dòng `debt` của `bill_payments` đó − tổng `debt_payment_allocations` còn hiệu lực trỏ vào nó.
**Số nợ của khách** = tổng số nợ các bill của khách.

## 4. Quy tắc

1. Ghi nợ chỉ ở **màn Thanh toán POS** (cùng chỗ thu kết hợp) **[em]**. `/staff/tables` và A04 không ghi nợ.
2. Lựa chọn thứ tư "Ghi nợ" bên cạnh Tiền mặt · Chuyển khoản · Kết hợp; Kết hợp cho phép thêm dòng Ghi nợ (VD khách trả 500k tiền mặt, nợ phần còn lại).
3. Có dòng nợ thì phải chọn khách: ô tìm theo tên / SĐT (không dấu), hoặc "+ Khách mới" (tên bắt buộc, SĐT tuỳ chọn, loại cơ quan / cá nhân) tạo ngay trong cùng lần thu **[anh Tú]**.
4. Phiên được đóng `paid` như thu bình thường — **bàn trống ngay**, doanh thu tính vào ngày kinh doanh đó. Nợ không giữ bàn **[em]**.
5. Trả nợ: chọn khách → danh sách bill còn nợ (cũ nhất trước) → nhập số tiền → hệ thống **tự phân bổ từ bill cũ nhất**, người dùng có thể bỏ tick bill để trả bill cụ thể **[em]**. Không cho trả quá tổng nợ.
6. Trả nợ tiền mặt khi bật ca: bắt buộc có ca mở, tiền vào két của ca (spec tổng §4.4).
7. Ai được làm: ghi nợ lúc thu — Chủ quán, Quản lý, Thu ngân **[anh Tú]**; nhận trả nợ — cùng ba vai; huỷ lần trả nợ — Chủ quán, Quản lý; sửa / ngừng khách nợ — Chủ quán, Quản lý **[em]**.
8. Huỷ lần trả nợ: có lý do; tiền mặt chỉ huỷ được khi ca còn mở (như sổ thu chi).
9. Không xoá khách đang có nợ.

## 5. Báo cáo và hiển thị

- `get_bills_report`: cột / chip mới "Ghi nợ"; tổng ngày tách TM / CK / **Nợ**; bất biến `cash + bank + debt + other = revenue`. Bill ghi nợ hiện nhãn "Nợ — <tên khách>".
- Tiền khách trả nợ **không** là doanh thu ngày trả; là **dòng tiền vào** ngày đó (báo cáo thu chi / dòng tiền ở spec báo cáo).
- Phiếu cuối ngày + phiếu bàn giao ca: dòng "Ghi nợ hôm nay", "Thu nợ tiền mặt / CK".
- Excel A04: cột Ghi nợ.
- Hoá đơn in (`/print/bill`) của bill có nợ: dòng "Ghi nợ: <số tiền> — <tên khách>".

## 6. Màn hình — trang Công nợ `/admin/debts`

Quyền xem: Chủ quán, Quản lý, Thu ngân.

- Danh sách khách: tên, SĐT, loại, tổng nợ, bill nợ cũ nhất (ngày), số bill nợ; sắp theo nợ giảm dần; tìm không dấu; lọc "còn nợ".
- Chi tiết khách: các bill nợ (ngày, bàn, tổng bill, đã trả, còn nợ, mở Xem bill A04), lịch sử trả nợ, nút **Thu nợ**.
- Nút **In bảng kê công nợ** khổ 80mm (danh sách bill còn nợ + tổng) để đưa khách cơ quan đối chiếu **[em]**.
- Xuất Excel danh sách nợ.

## 7. RPC

- `collect_table_bill` (mục A) nhận thêm dòng `{instrument:'debt', amount}` và `p_debt_customer_id` hoặc `p_new_debt_customer jsonb`. Tạo khách mới trong cùng transaction.
- `debt_customer_upsert(...)`, `debt_customer_set_active(...)`
- `debt_collect(p_customer_id, p_amount, p_method, p_allocations jsonb null, p_note, p_client_request_id)`
- `debt_payment_void(p_id, p_reason)`
- `debt_list(p_store_id, p_only_open boolean)`, `debt_customer_detail(p_customer_id)` — đọc

## 8. Kiểm thử bắt buộc

- Thu bill 100% nợ, kết hợp TM + nợ, TM + CK + nợ: tổng khớp, phiên đóng, bàn trống.
- Có dòng nợ mà thiếu khách → lỗi, không gì được ghi.
- Trả nợ phân bổ bill cũ nhất trước; trả một phần; trả đúng hết; trả quá → lỗi.
- Trả nợ TM khi bật ca mà không có ca → lỗi; có ca → két tăng đúng.
- Bất biến báo cáo ngày sau khi có bill nợ.
- Huỷ lần trả nợ → nợ bill khôi phục.
- Idempotent `client_request_id` cho cả thu bill có nợ lẫn trả nợ.
- Quyền + cách ly quán.

Checklist tay: `docs/testing/yen-garden/CONG-NO.md`.
