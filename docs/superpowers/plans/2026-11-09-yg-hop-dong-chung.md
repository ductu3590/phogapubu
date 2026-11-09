# Yên Garden — hợp đồng chung giữa các plan

> Mọi plan `2026-11-09-yg-*.md` phải khớp file này. Ai đổi một mục ở đây phải báo controller.

## Nhánh và cách chạy

- Nhánh tích hợp: `claude/yen-garden-survey-e9a44a` (worktree `D:\Code\mevo\.claude\worktrees\yen-garden-survey-e9a44a`).
- Mỗi agent code chạy trong worktree riêng (Agent `isolation: "worktree"`) cắt từ nhánh tích hợp; controller gộp về.
- Agent code **không** áp migration lên prod, **không** push, **không** merge `main`.
- Migration áp từ nội dung LF (`git show`), file worktree có thể là CRLF.

## Số migration (theo thứ tự phụ thuộc)

| Số | Chủ | Nội dung |
|---|---|---|
| 112a, 112b | THU | plan sẵn `2026-11-05-dot1-a-thu-tien-ket-hop.md` |
| 116 | QL | vai Quản lý |
| 117 | BC | báo cáo bán hàng (chỉ đọc) |
| 118 | KHO | kho |
| 121 | CFG | gỡ trigger `print_mode_policy_guard` |
| 122 | CA | ca + sổ thu chi (thay số 113 cũ) |
| 122b | CA | nối phiếu nhập kho ↔ phiếu chi |
| 123 | NO | công nợ |
| 125 | BC | báo cáo tài chính (chỉ đọc) |

113, 115 (phiên khác), 119, 120, 124 không dùng.

## Hàm và kiểu dùng chung

```sql
-- mig 116 (QL)
is_store_back_office(p_store_id uuid) RETURNS boolean
  -- LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  -- true khi auth.uid() là store_owner hoặc store_manager is_active của p_store_id
is_store_pos_operator(p_store_id uuid)   -- vá tại chỗ: nhận thêm store_manager

-- mig 118 (KHO)
inventory_sales_qty(p_store_id uuid, p_from timestamptz, p_to timestamptz)
  RETURNS TABLE(inventory_item_id uuid, qty numeric)              -- nội bộ, REVOKE client
inventory_cogs(p_store_id uuid, p_from date, p_to date) RETURNS jsonb
  -- {items:[{inventory_item_id,name,unit,kind,qty_used,unit_cost,cogs,missing_cost}],
  --  goods_cogs, ingredient_cogs, writeoff_cost, ingredient_uncounted boolean, missing_cost_items int}
  -- kiểm is_store_back_office

-- mig 122 (CA)
cash_book_create_internal(p_store_id uuid, p_kind text, p_method text, p_category_id uuid,
  p_amount bigint, p_note text, p_counterparty text, p_source text, p_source_ref uuid,
  p_actor uuid, p_client_request_id uuid) RETURNS uuid           -- nội bộ, REVOKE client
cash_book_system_category(p_store_id uuid, p_report_group text) RETURNS uuid  -- nội bộ
require_open_cash_shift(p_store_id uuid) RETURNS uuid              -- null khi quán không bật ca
cash_shift_totals(p_shift_id uuid) RETURNS jsonb
  -- {opening_cash, cash_sales, cash_receipts, cash_payments, debt_cash, expected_cash, bills_count, bank_sales}
  -- debt_cash = 0 cho tới khi mig 123 vá

cash_book_void_internal(p_entry_id uuid, p_reason text, p_actor uuid)       -- nội bộ
-- cash_shift_totals giữ dòng neo: `  v_debt_cash := 0; -- mevo-anchor:123 cash_shift_totals.debt_cash`
-- JSON phiếu ca dùng tên: cash_sales, cash_payments, entries (KHÔNG dùng cash_collected/expense_total/expenses của plan B cũ)

-- mig 118 (KHO) phải để sẵn cho 122b:
--   inventory_documents.paid_method ('cash'|'bank') null, cash_book_entry_id uuid (chưa FK)
--   dòng neo `  -- mevo-anchor:122b inventory_post_document.cash_book(v_doc_id)` (sau khi chèn dòng phiếu, sau nhánh gọi lại)
--   dòng neo `  -- mevo-anchor:122b inventory_void_document.cash_book(v_doc_id)` (sau kiểm quyền, sau nhánh "đã huỷ")
-- mig 122b (CA): inventory_receipt_cash_book(p_doc_id uuid), inventory_receipt_cash_book_void(p_doc_id uuid, p_reason text)

-- mig 112a (THU): câu INSERT INTO public.bill_payments của collect_table_bill giữ phần values(...) trên MỘT dòng,
--   chữ NULL ở vị trí cash_shift_id, sau mọi nhánh trả already (122 neo vào đây)

-- mig 123 (NO): bill_payment_lines.instrument thêm 'debt'; vá cash_shift_totals.debt_cash;
--   get_bills_report totals thêm 'debt'
```

## Web

- `admin-web/lib/auth/roles.ts` (QL): `store_manager`, `MANAGER_ADMIN_PATHS` gồm `/admin/inventory`, `/admin/cashbook`, `/admin/debts`, `/admin/reports` cộng mọi đường thu ngân có. Module khác chỉ thêm mục rail / tab của mình, không sửa luật vai.
- Thu ngân được vào `/admin/reports` (4 tab bán hàng), `/admin/debts`, `/admin/inventory` (chỉ xem tồn), `/admin/cashbook` (chỉ phiếu của mình) — QL thêm cả 4 vào `CASHIER_ADMIN_PATHS`; từng trang tự ẩn phần ghi theo vai.
- Guard web dùng chung (QL tạo, module khác DÙNG, không tự viết): `isBackOfficeRole(role)` trong `lib/auth/roles.ts`; `requireBackOfficeStoreId()` trong `lib/auth/operator.ts`; vùng `'back_office'` của `requireAdminPageOrRedirect`.
- Trang mà thu ngân được xem (`/admin/inventory`, `/admin/cashbook`, `/admin/debts`, `/admin/reports`) dùng guard trang `requireAdminPageOrRedirect('pos')` rồi tự ẩn phần ghi theo vai; **không** dùng `'back_office'` cho cả trang (sẽ đá thu ngân ra). `'back_office'` chỉ cho trang/tab chỉ Chủ quán + Quản lý (VD tab tài chính). Server action ghi dùng `requireBackOfficeStoreId()`.
- `is_store_back_office`: `REVOKE ALL FROM PUBLIC, anon; GRANT EXECUTE TO authenticated`; KHÔNG gồm superadmin. Stub trong test phải giống hệt (cả `SECURITY DEFINER`).
- Mục rail của module mới phải thêm vào cả nhánh chủ quán lẫn nhánh quản lý (và thu ngân nếu có quyền) trong `adminRailItems`. `config-dialog.test.ts` đòi mỗi `CONFIG_TABS` có trang + route `(.)` — chỉ thêm tab khi trang đã có.
- Trang mới: `/admin/inventory` (KHO), `/admin/cashbook` (CA), `/admin/debts` (NO), `/admin/reports` (BC). Mỗi trang có bản intercept `app/admin/@modal/(config)/(.)<x>/page.tsx` như `(.)bills`.
- Test chạy trước khi báo xong mỗi task: `cd admin-web; npm test` (vitest), `npx tsc --noEmit`, `npm run lint`; SQL: `$env:PGLITE_MODULE='<worktree>/admin-web/node_modules/@electric-sql/pglite/dist/index.js'; node --test supabase/tests/<file>.test.mjs`.
- Test SQL của module chạy **trước** mig 116 có mặt (sóng 1 song song): fixture được định nghĩa stub `is_store_back_office` giống hệt hợp đồng trong setup của test, không đưa vào migration.

## Bổ sung sau khi có plan công nợ (2026-11-09)

- Sau mig 123: `collect_table_bill(uuid[], jsonb, integer, uuid, uuid DEFAULT NULL, jsonb DEFAULT NULL)` (thêm `p_debt_customer_id`, `p_new_debt_customer`); bản 4 tham số bị drop trong cùng giao dịch. Gọi 4 tham số cũ vẫn chạy.
- `orders.payment_instrument` thêm `'debt'` (bill 100% nợ); bill nhiều phương tiện vẫn `'mixed'`. `ReportInstrument` (TS) thêm `'debt'`.
- `get_bills_report` thêm `totals.debt`, `debt_collections`, `bills[].debt_customer`. RPC `get_debt_shift_summary(p_shift_id)` cho phiếu ca.
- ⚠️ `debt_customer_bills(uuid)` chỉ là số nợ **TẠI LÚC NÀY** (cộng mọi lần trả chưa huỷ, không xét lần trả / lần huỷ xảy ra lúc nào). Báo cáo theo kỳ của 125 KHÔNG dùng được nó cho "nợ đầu kỳ / cuối kỳ": 125 phải tự định nghĩa số nợ tại một mốc (as-of), và lấy ngày của lần trả nợ bằng **`debt_payments.business_date` đọc thẳng** (ngày kinh doanh lúc ghi, lưu sẵn), KHÔNG BAO GIỜ tính lại bằng `business_date_of(created_at)` — đổi giờ bắt đầu ngày thì bill dời ngày nhưng lần trả nợ thì không.
- ⚠️ 125 vá `get_bills_report` phải chụp định nghĩa SAU 123 (123 đã vá 6 chỗ: bucket `debt`, cột `debt` của `pay`, thứ tự `array_position(ARRAY['cash','bank','debt'], …)`, `other` trừ cả `debt`, `debt_customer`, `debt_collections`) và giữ xanh test 123 "bất biến ngày: TM + CK + nợ + khác = doanh thu". Neo `ORDER BY l.instrument DESC)` / `ORDER BY x.instrument DESC)` KHÔNG còn sau 123 (trong `get_bills_report`, `get_sessions_bill`, `bill_payment_lines_json`): ai vá ba hàm đó phải lấy chữ sau 123.
- CA (122): `expected_cash` PHẢI đã cộng `v_debt_cash` (=0 tới khi 123 vá). `ShiftReportSlip` nhận prop tuỳ chọn `debt` (123 thêm).
- Bảng kê công nợ 80mm in qua trình duyệt kể cả `print_mode='agent'` (chưa có `print_jobs.kind` cho nó).
