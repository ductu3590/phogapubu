# Kho nhập – xuất và giá vốn

> Ngày: 2026-11-09 · Thuộc: [spec tổng Yên Garden](2026-11-09-yen-garden-trien-khai-design.md) · Migration: **118**

Ký hiệu: **[anh Tú]** = anh Tú đã chốt · **[em]** = em tự quyết.

## 1. Mục tiêu

Quản lý biết tồn kho bia, nước đóng chai bất kỳ lúc nào, nhập hàng có giá, kiểm kho cuối kỳ, và có **giá vốn** để báo cáo lãi lỗ **[anh Tú]**.

Mức chốt **[anh Tú]**: hàng bán nguyên (bia, nước) trừ kho tự động khi bán + nguyên liệu bếp chỉ ghi nhập và kiểm kho cuối kỳ. **Không** làm định lượng công thức từng món.

## 2. Không làm

- Định lượng (BOM) món chế biến, tự trừ nguyên liệu khi bán.
- Nhiều kho, chuyển kho, lô / hạn dùng, mã vạch.
- Đơn đặt hàng nhà cung cấp, công nợ nhà cung cấp (chỉ ghi "đã trả / chưa trả" trên phiếu nhập).
- Chặn bán khi hết kho. Tồn âm được phép, hiện cảnh báo **[em]**: quán bia không được từ chối khách vì số liệu kho sai.

## 3. Khái niệm

| Khái niệm | Nghĩa |
|---|---|
| Hàng hoá (`inventory_items`) | Một thứ quán mua về và đếm được: "Bia Hà Nội lon", "Thịt ba chỉ" |
| Loại | `goods` = bán nguyên, trừ kho khi bán; `ingredient` = nguyên liệu, chỉ nhập + kiểm |
| Liên kết bán (`menu_stock_links`) | Món / biến thể nào khi bán thì trừ hàng hoá nào, bao nhiêu đơn vị |
| Phiếu nhập | Lần nhập hàng, nhiều dòng, có giá nhập |
| Phiếu kiểm kho | Lần đếm thực tế; chênh lệch thành điều chỉnh |
| Phiếu xuất huỷ | Hàng hỏng, vỡ, mất; có lý do |

## 4. Dữ liệu (mig 118)

```
inventory_items
  id, store_id, name, unit (text: 'lon','chai','két','kg','gói'...), kind ('goods'|'ingredient'),
  sku (null), min_stock numeric(12,3) null, is_active, created_at
  UNIQUE (store_id, lower(name)) WHERE is_active

menu_stock_links
  id, store_id, menu_item_id, variant_id (null), inventory_item_id, qty_per_sale numeric(12,3) > 0
  UNIQUE (menu_item_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'))
  -- chỉ trỏ tới inventory_items.kind='goods' (trigger kiểm)

inventory_documents
  id, store_id, kind ('receipt'|'count'|'writeoff'), doc_no (text, tự sinh 'PN-0001','PK-0001','PX-0001'),
  doc_date (date, ngày kinh doanh), supplier_name (null), note, total_amount bigint (receipt),
  paid_status ('paid'|'unpaid') null, cash_book_entry_id (null, FK sổ thu chi — mig 113),
  status ('posted'|'voided'), created_by, created_at, voided_by, voided_at, void_reason

inventory_document_lines
  id, document_id, inventory_item_id, qty numeric(12,3), unit_cost bigint null,
  counted_qty numeric(12,3) null, system_qty numeric(12,3) null   -- dòng phiếu kiểm
```

Không có bảng "tồn kho" lưu sẵn. **Tồn tính lúc đọc** **[em]**:

```
Tồn(item, tới thời điểm T) =
    Σ nhập (phiếu receipt posted)
  − Σ xuất huỷ (writeoff posted)
  + Σ điều chỉnh kiểm kho (counted_qty − system_qty, phiếu count posted)
  − Σ bán (order_items còn hiệu lực × qty_per_sale, chỉ hàng goods)
```

Lý do chọn tính lúc đọc: **không đụng vào RPC tiền** (`create_order`, `close_table_session`, bỏ/tặng/sửa số lượng). Bỏ món thì tồn tự đúng vì dòng đó hết hiệu lực. Rủi ro hiệu năng thấp: một quán vài trăm dòng order mỗi tối.

**"Bán" tính thế nào [em]:**
- Dòng `order_items` của đơn **đã vào bếp** (đã xác nhận / đã thu), không phải đơn bị từ chối hay huỷ, không bị bỏ (`void_type='cancelled'`). Món **tặng vẫn trừ kho** (hàng đã ra khỏi tủ).
- Số lượng = `quantity` hiện tại của dòng (đã tính các lần sửa số lượng).
- Biến thể: tìm liên kết theo (món, biến thể) trước, không có thì theo (món, null).
- Hàm SQL nội bộ duy nhất tính "bán" để tồn kho và báo cáo dùng chung: `inventory_sales_qty(p_store_id, p_from, p_to)`.

## 5. Giá vốn [em]

- **Bình quân gia quyền theo kỳ** (đơn giản, hợp quán nhỏ): giá vốn đơn vị của hàng trong kỳ = (giá trị tồn đầu kỳ + giá trị nhập trong kỳ) / (SL tồn đầu kỳ + SL nhập trong kỳ). Nếu mẫu số ≤ 0 thì lấy giá nhập gần nhất; chưa từng nhập thì 0 và báo cáo ghi "thiếu giá nhập".
- Giá trị tồn đầu kỳ đầu tiên = phiếu kiểm kho đầu kỳ (ngày 30/11, nhập giá vốn ở dòng kiểm).
- **Giá vốn hàng bán trong kỳ** (cho lãi lỗ):
  - Hàng `goods`: SL bán × giá vốn đơn vị.
  - Hàng `ingredient`: SL dùng = tồn đầu + nhập − xuất huỷ − tồn cuối (theo phiếu kiểm gần cuối kỳ nhất) × giá vốn đơn vị. Kỳ chưa có phiếu kiểm cuối thì phần nguyên liệu ghi "chưa kiểm kho" và **không tính** vào lãi lỗ, báo rõ trên báo cáo.
  - Xuất huỷ tính riêng dòng "Hàng huỷ" trong chi phí.
- Hàm `inventory_cogs(p_store_id, p_from date, p_to date)` trả từng hàng + tổng, dùng cho báo cáo lãi lỗ (spec báo cáo).

## 6. Màn hình — trang Kho `/admin/inventory`

Quyền: **Chủ quán + Quản lý** sửa; Thu ngân chỉ xem tồn **[em]**. Đọc tốt trên điện thoại.

Tab:

1. **Tồn kho**: bảng hàng hoá — tên, đơn vị, loại, tồn hiện tại, giá vốn gần nhất, giá trị tồn; tô vàng khi dưới `min_stock`, đỏ khi âm. Tìm không dấu. Nút Thêm hàng hoá, Sửa, Ngừng dùng (không xoá cứng khi đã có phiếu).
2. **Nhập hàng**: danh sách phiếu nhập; tạo phiếu: ngày, nhà cung cấp (gõ tự do, gợi ý tên cũ), các dòng (hàng, SL, đơn giá, thành tiền tự tính), tổng, "Đã trả" + phương thức TM/CK → tạo phiếu chi tương ứng trong sổ thu chi (danh mục "Nhập hàng"); "Chưa trả" thì không tạo phiếu chi.
3. **Kiểm kho**: tạo phiếu kiểm; hệ thống điền tồn theo máy cho mọi hàng đang dùng (hoặc lọc theo loại), người dùng nhập SL đếm; hiện chênh lệch; Lưu = chốt điều chỉnh. Phiếu kiểm đầu kỳ cho phép nhập giá vốn từng dòng.
4. **Xuất huỷ**: phiếu xuất với lý do bắt buộc.
5. **Thẻ kho** của một hàng: lịch sử nhập / bán theo ngày / huỷ / điều chỉnh với tồn chạy.

Huỷ phiếu: được, có lý do, ghi người + giờ; phiếu nhập đã tạo phiếu chi thì huỷ luôn phiếu chi đó trong cùng giao dịch. Không sửa phiếu đã lưu — huỷ rồi tạo lại **[em]**.

**Gắn món với hàng hoá** ở trang Món: trong form món (và từng biến thể nếu có), ô "Trừ kho: [hàng hoá] × [SL]". Không gắn thì món đó không trừ kho.

## 7. RPC (đều kiểm quyền Chủ quán/Quản lý theo `store_id`)

- `inventory_upsert_item(...)`, `inventory_set_item_active(...)`
- `inventory_set_menu_link(p_menu_item_id, p_variant_id, p_inventory_item_id, p_qty)` (null = gỡ)
- `inventory_post_document(p_kind, p_doc jsonb, p_lines jsonb, p_client_request_id uuid)` — idempotent; với receipt + đã trả thì gọi hàm nội bộ của sổ thu chi để tạo phiếu chi trong cùng transaction (nếu mig 113 chưa có thì bỏ qua phần này — controller ghép sau).
- `inventory_void_document(p_id, p_reason)`
- `inventory_stock_levels(p_store_id, p_at timestamptz default now())` — đọc
- `inventory_item_ledger(p_item_id, p_from, p_to)` — đọc
- `inventory_cogs(p_store_id, p_from date, p_to date)` — đọc

## 8. Kiểm thử bắt buộc

- Tồn = nhập − huỷ + điều chỉnh − bán, với: món bị bỏ (không trừ), món tặng (trừ), sửa số lượng, biến thể có / không liên kết riêng, đơn bị từ chối (không trừ).
- Phiếu kiểm: chênh lệch đúng, tồn sau kiểm = SL đếm.
- Huỷ phiếu nhập đã trả: phiếu chi bị huỷ cùng.
- Giá vốn bình quân: ví dụ số cụ thể trong test; mẫu số 0; chưa có giá nhập.
- Quyền: Thu ngân không gọi được RPC ghi; quán A không đọc được kho quán B.
- `client_request_id` gửi lại không tạo phiếu thứ hai.

Checklist tay: `docs/testing/yen-garden/KHO.md`.
