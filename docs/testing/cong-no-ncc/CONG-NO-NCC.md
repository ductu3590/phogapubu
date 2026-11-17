# Công nợ nhà cung cấp + phiếu chi tiền hàng (mig 143–145)

Phiếu nhập **Chưa trả** thành nợ theo phiếu của nhà cung cấp (NCC). Trang **Công nợ** có thêm tab **Nhà cung cấp**:
tích chọn nhiều phiếu còn nợ → **Trả các phiếu đã chọn** → một lần trả, **một** phiếu chi "Nhập hàng" ở Sổ thu chi, ghi
chú liệt kê số phiếu. Phiếu nhập **Đã trả** vẫn tự ghi phiếu chi như trước (không có ô tích bỏ qua — anh Tú chốt trong spec).

Spec: `docs/superpowers/specs/2026-11-17-cong-no-ncc-design.md` · Plan: `docs/superpowers/plans/2026-11-17-cong-no-ncc.md`
Migration: `143_supplier_debt.sql`, `144_supplier_inventory_patch.sql`, `145_supplier_payments.sql` (áp đúng thứ tự)
Test tự động: `supabase/tests/143_supplier_debt.test.mjs` (25 bài), `supabase/tests/race/05-supplier-debt.test.mjs` (3 kịch bản đua)

Bất biến: **nợ một phiếu = tiền phiếu − các lần trả còn hiệu lực** (không lưu sẵn). Mỗi lần trả còn hiệu lực có đúng một
phiếu chi cùng số tiền. Tiền mặt trả NCC đi qua két ca đang mở khi quán bật ca.

## Kết quả agent (2026-11-17)

- ✓ DB PGlite 640/640 (gồm 25 bài mig 143–145), vitest 1771/1771, test đua 43/43 (25 vòng), `python scripts/verify.py` XANH.
- ✓ Bài **B4, B5, B6, B8, C2** đã có test tự động tương ứng (vẫn nên xem lại trên giao diện).
- Còn lại cần anh Tú bấm tay.

## Chuẩn bị

- Đăng nhập **chủ quán** hoặc **quản lý** quán Bảo Lương (tab NCC chỉ hai vai này thấy).
- Có ít nhất 2 hàng hoá ở Kho. Nếu muốn thử tiền mặt: bật "Bắt buộc mở ca" và **mở ca** trên POS.

## A. Phiếu nhập

| # | Thao tác | Kết quả đúng |
|---|---|---|
| A1 | Kho → Nhập hàng → Tạo phiếu nhập, chọn **Chưa trả**, để trống Nhà cung cấp | Hiện "Chọn nhà cung cấp — phiếu chưa trả sẽ ghi vào công nợ NCC đó.", nút **Lưu** tắt |
| A2 | Gõ NCC mới "Đại lý bia Hà", 10 thùng × 500.000đ, Chưa trả → Lưu | Dưới nút chọn hiện "Phiếu sẽ ghi vào công nợ NCC Đại lý bia Hà."; lưu được; danh sách phiếu hiện nhãn **Còn nợ 5.000.000đ** |
| A3 | Tạo phiếu nhập thứ hai, gõ "  đại lý   BIA hà " (khác hoa thường, thừa dấu cách), Chưa trả 4.200.000đ | Lưu được; phiếu ghi NCC **Đại lý bia Hà** (không sinh NCC thứ hai — tab NCC chỉ có một dòng) |
| A4 | Tạo phiếu nhập **Đã trả · Chuyển khoản** | Dưới nút hiện "Khi có tiền trả, Kho tự ghi phiếu chi “Nhập hàng”."; Sổ thu chi có một phiếu chi Nhập hàng |
| A5 | Ô Nhà cung cấp gợi ý tên | Gợi ý là danh sách NCC **đang dùng** (NCC đã "Ngừng theo dõi" không hiện) |

## B. Tab Nhà cung cấp + trả nợ

| # | Thao tác | Kết quả đúng |
|---|---|---|
| B1 | Công nợ → tab **Nhà cung cấp** | Thẻ **Tổng phải trả 9.200.000đ**, **NCC đang nợ 1 NCC**; dòng Đại lý bia Hà còn nợ 9.200.000đ, 2 phiếu. URL thành `?tab=suppliers`, F5 vẫn ở tab NCC |
| B2 | Bấm dòng NCC | Ngăn kéo: "Phiếu còn nợ (2)", mỗi phiếu có ô tích, có "Chọn tất cả" |
| B3 | Tích 2 phiếu | Thanh dưới cùng: **Đã chọn 2 phiếu · 9.200.000đ** + nút **Trả các phiếu đã chọn** |
| B4 | Bấm **Trả các phiếu đã chọn**, sửa số tiền còn **6.000.000**, Chuyển khoản, **Xác nhận trả** | Xem trước: phiếu cũ 5.000.000đ, phiếu mới 1.000.000đ. Sau khi trả: phiếu cũ vào "Đã trả hết (1)", phiếu mới còn 3.200.000đ; lịch sử trả hiện "PN-xxxx, PN-yyyy" |
| B5 | Sổ thu chi | Đúng **một** phiếu chi 6.000.000đ CK, danh mục Nhập hàng, người nhận "Đại lý bia Hà", ghi chú "Trả nợ NCC: PN-xxxx, PN-yyyy", nguồn **Trả nợ NCC · Huỷ ở trang Công nợ**, không có nút Huỷ phiếu |
| B6 | Trả tiếp bằng **Tiền mặt** khi quán bật ca nhưng **chưa mở ca** | Báo "Chưa mở ca", không ghi gì (nợ vẫn 3.200.000đ) |
| B7 | Mở ca, trả nốt 3.200.000đ tiền mặt (nút **Trả nợ** → "Trả hết") | Hết nợ; két dự kiến của ca giảm 3.200.000đ (POS → ca); dòng phiếu chi trong ca ghi "Huỷ ở trang Công nợ" |
| B8 | Ngăn kéo → Lịch sử trả nợ → **Huỷ** lần trả tiền mặt (ca còn mở), nhập lý do | Phiếu nợ được trả lại 3.200.000đ; phiếu chi trong Sổ bị gạch "Đã huỷ" kèm lý do "Huỷ trả nợ NCC: …" |
| B9 | Thử huỷ một lần trả tiền mặt **sau khi đã kết ca** | Báo "Ca của phiếu này đã kết, không huỷ được"; không đổi gì |
| B10 | Bấm số phiếu nhập trong ngăn kéo | Mở trang Kho, tab Nhập hàng, hộp chi tiết đúng phiếu đó |
| B11 | Kho → mở phiếu đã nhận tiền trả nợ → Huỷ phiếu | Báo "Phiếu đã trả nợ một phần — huỷ lần trả trước"; phiếu giữ nguyên |
| B12 | **+ Thêm NCC** "Chợ Cốc Lếu" có SĐT; rồi **Sửa NCC**, **Ngừng theo dõi** NCC còn nợ | Thêm / sửa được; NCC ngừng vẫn hiện ở tab (badge "Đã ngừng") khi còn nợ và **vẫn trả nợ được** |
| B13 | Đăng nhập **thu ngân** → Công nợ | Không có tab Nhà cung cấp (chỉ khách hàng như cũ) |
| B14 | Điện thoại (≤ 640px): tab NCC + ngăn kéo + thanh "Trả các phiếu đã chọn" | Thẻ thay bảng, ô tích đủ to để chạm, thanh dưới không che nút |

## C. Sổ thu chi + Chi két

| # | Thao tác | Kết quả đúng |
|---|---|---|
| C1 | Sổ thu chi → Tạo phiếu chi; POS → Thu/Chi két → Chi | Đầu form có dòng "Tiền mua hàng nhập kho ghi ở Kho. Trả nợ nhà cung cấp ghi ở Công nợ."; ô danh mục hiện **"Chi đi chợ ngoài nhập kho"** thay cho "Đi chợ"; không có "Nhập hàng" |
| C2 | Ghi một phiếu chi "Chi đi chợ ngoài nhập kho" rồi xem danh sách Sổ / Excel | Danh sách và Excel vẫn ghi tên danh mục **Đi chợ** (chỉ ô chọn đổi chữ) |
| C3 | Ví dụ đi chợ (spec 2.1): giao 1.000.000đ, nhận lại 180.000đ, lập phiếu nhập Đã trả · Tiền mặt tổng 820.000đ trong ca | Sổ có một phiếu chi 820.000đ (Nhập hàng); không có phiếu thu 180.000đ; két dự kiến giảm 820.000đ |
| C4 | Báo cáo → lãi lỗ kỳ có các khoản trên | Tiền trả NCC / Nhập hàng **không** cộng vào chi phí hoạt động (giá vốn tính qua kho) |

## SQL bất biến (chạy trên prod sau khi test, mọi truy vấn phải ra 0 dòng)

```sql
-- Phiếu bị trả quá tiền phiếu
SELECT d.doc_no FROM inventory_documents d
 WHERE (SELECT coalesce(sum(a.amount),0) FROM supplier_payment_allocations a JOIN supplier_payments p ON p.id = a.supplier_payment_id
         WHERE a.inventory_document_id = d.id AND p.voided_at IS NULL) > d.total_amount;
-- Lần trả lệch tổng phân bổ / lệch phiếu chi
SELECT p.id FROM supplier_payments p JOIN cash_book_entries e ON e.id = p.cash_book_entry_id
 WHERE p.amount <> (SELECT coalesce(sum(amount),0) FROM supplier_payment_allocations WHERE supplier_payment_id = p.id)
    OR (p.voided_at IS NULL) <> (e.voided_at IS NULL) OR e.amount <> p.amount;
```
