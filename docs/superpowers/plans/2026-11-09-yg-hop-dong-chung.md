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

-- mig 123 (NO): bill_payment_lines.instrument thêm 'debt'; vá cash_shift_totals.debt_cash;
--   get_bills_report totals thêm 'debt'
```

## Web

- `admin-web/lib/auth/roles.ts` (QL): `store_manager`, `MANAGER_ADMIN_PATHS` gồm `/admin/inventory`, `/admin/cashbook`, `/admin/debts`, `/admin/reports` cộng mọi đường thu ngân có. Module khác chỉ thêm mục rail / tab của mình, không sửa luật vai.
- Thu ngân được vào `/admin/reports` (4 tab bán hàng), `/admin/debts`, `/admin/inventory` (chỉ xem tồn), `/admin/cashbook` (chỉ phiếu của mình) — QL thêm cả 4 vào `CASHIER_ADMIN_PATHS`; từng trang tự ẩn phần ghi theo vai.
- Guard web dùng chung (QL tạo, module khác DÙNG, không tự viết): `isBackOfficeRole(role)` trong `lib/auth/roles.ts`; `requireBackOfficeStoreId()` trong `lib/auth/operator.ts`; vùng `'back_office'` của `requireAdminPageOrRedirect`.
- `is_store_back_office`: `REVOKE ALL FROM PUBLIC, anon; GRANT EXECUTE TO authenticated`; KHÔNG gồm superadmin. Stub trong test phải giống hệt (cả `SECURITY DEFINER`).
- Mục rail của module mới phải thêm vào cả nhánh chủ quán lẫn nhánh quản lý (và thu ngân nếu có quyền) trong `adminRailItems`. `config-dialog.test.ts` đòi mỗi `CONFIG_TABS` có trang + route `(.)` — chỉ thêm tab khi trang đã có.
- Trang mới: `/admin/inventory` (KHO), `/admin/cashbook` (CA), `/admin/debts` (NO), `/admin/reports` (BC). Mỗi trang có bản intercept `app/admin/@modal/(config)/(.)<x>/page.tsx` như `(.)bills`.
- Test chạy trước khi báo xong mỗi task: `cd admin-web; npm test` (vitest), `npx tsc --noEmit`, `npm run lint`; SQL: `$env:PGLITE_MODULE='<worktree>/admin-web/node_modules/@electric-sql/pglite/dist/index.js'; node --test supabase/tests/<file>.test.mjs`.
- Test SQL của module chạy **trước** mig 116 có mặt (sóng 1 song song): fixture được định nghĩa stub `is_store_back_office` giống hệt hợp đồng trong setup của test, không đưa vào migration.
