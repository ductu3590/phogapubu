# Công nợ nhà cung cấp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phiếu nhập Chưa trả thành nợ theo phiếu của nhà cung cấp; trang Công nợ có tab Nhà cung cấp với tích chọn nhiều phiếu → một lần trả → một phiếu chi "Nhập hàng".

**Architecture:** Một migration 143 (bảng `suppliers`, `supplier_payments`, `supplier_payment_allocations`; vá tại chỗ RPC kho + sổ thu chi; RPC NCC mới). Số nợ luôn tính lúc đọc. admin-web thêm `lib/suppliers.ts` (thuần), `lib/actions/suppliers.ts` (server action), tab NCC ở `/admin/debts`, sửa form phiếu nhập + nhãn Kho + nhãn nguồn Sổ thu chi.

**Tech Stack:** PostgreSQL plpgsql (test `node --test` trên PGlite), Next.js 16 + React 19, vitest.

**Spec:** `docs/superpowers/specs/2026-11-17-cong-no-ncc-design.md`

## Global Constraints

- Migration số **143**, một file `supabase/migrations/143_supplier_debt.sql`, bọc `BEGIN; … COMMIT;`, có khối `$pre$` kiểm hàm cần có; vá hàm đang sống bằng `pg_temp.mevo_patch` (mẫu 122b: neo khớp đúng 1 lần, CRLF→LF). Không `CREATE OR REPLACE` hàm đang sống.
- Hàm nội bộ mới: `REVOKE ALL … FROM PUBLIC, anon, authenticated`. RPC client: `REVOKE … FROM PUBLIC, anon` + `GRANT EXECUTE … TO authenticated`.
- Mọi RPC NCC chỉ cho **back office** (`is_store_back_office`). Lỗi "Không có quyền" cho cả NCC không tồn tại lẫn NCC quán khác.
- Thứ tự khoá: **NCC (`suppliers` FOR UPDATE) trước, phiếu nhập sau** (theo `id`), rồi phiếu chi.
- Tiền: số nguyên VNĐ, 1..2.000.000.000. Ô tiền dùng `parseVnd`. Server action trả `{ok, error}`, không ném.
- Chữ UI tiếng Việt, đúng nguyên văn spec: "Phiếu chưa trả cần nhà cung cấp", "Phiếu sẽ ghi vào công nợ NCC <tên>.", "Khi có tiền trả, Kho tự ghi phiếu chi “Nhập hàng”.", "Đã trả hết qua công nợ", "Chưa trả · Thiếu nhà cung cấp", "Còn nợ <số>", "Trả các phiếu đã chọn", "Xác nhận trả", "Tổng phải trả", "NCC đang nợ", "Chỉ NCC còn nợ", "+ Thêm NCC", "Tiền mua hàng nhập kho ghi ở Kho. Trả nợ nhà cung cấp ghi ở Công nợ.", "Chi đi chợ ngoài nhập kho", nguồn "Trả nợ NCC".
- Ghi chú phiếu chi trả nợ: `Trả nợ NCC: PN-0003, PN-0005` (chỉ phiếu thực nhận tiền, theo thứ tự phân bổ); ≤ 500 ký tự, lược đuôi thành `… (+N phiếu)`. Ghi chú người dùng chỉ lưu ở `supplier_payments.note` (không chép vào phiếu chi).

## Review Focus

1. **Hai máy trả cùng khoản nợ cuối bằng hai mã khác nhau** → một thành công, một bị từ chối "vượt số còn nợ"/"tải lại"; Sổ chỉ một phiếu chi. (Task 3, test đua Task 3.)
2. **Huỷ phiếu nhập trong lúc đang trả nợ phiếu đó** → không có phân bổ trỏ vào phiếu đã huỷ. (Task 2 + test đua Task 3.)
3. **Gửi lại cùng mã sau khi ca đã kết** → trả lần cũ (`already: true`), không "Chưa mở ca". (Task 3.)
4. **Gõ tên NCC khác hoa thường / thừa dấu cách** ("  đại lý bia hà ") → dùng NCC "Đại lý bia Hà" có sẵn, bản chụp tên = tên chuẩn. (Task 2.)
5. **NCC đã ngừng còn nợ** vẫn hiện ở tab NCC khi tắt "Chỉ NCC còn nợ"… và khi bật nếu còn nợ; trả nợ NCC đã ngừng vẫn được. (Task 3 + Task 5.)

---

### Task 1: Migration 143 — bảng, backfill, vá sổ thu chi

**Files:**
- Create: `supabase/migrations/143_supplier_debt.sql` (phần 0–3)
- Create: `supabase/tests/143_supplier_debt.test.mjs`

**Interfaces:**
- Produces bảng: `suppliers(id, store_id, name, phone, note, is_active, created_by, created_at)`, unique index `suppliers_store_name_uq ON (store_id, lower(btrim(name)))`; `inventory_documents.supplier_id` (FK ghép quán); `supplier_payments(id, store_id, supplier_id, amount, method, business_date, note, cash_book_entry_id UNIQUE NOT NULL, client_request_id, requested_document_ids uuid[], created_by, created_at, voided_by, voided_at, void_reason)`; `supplier_payment_allocations(id, supplier_payment_id, inventory_document_id, amount)`.
- `cash_book_entries.source` nhận `'supplier_payment'`; `cash_book_create_internal_result` nhận nguồn này (source_ref bắt buộc, chỉ phiếu chi); `cash_book_void` từ chối với "Phiếu chi trả nợ nhà cung cấp, huỷ ở trang Công nợ".
- Hàm nội bộ `supplier_normalize_name(text) → text` (btrim + gộp khoảng trắng), dùng chung Task 2/3.

- [ ] **Step 1: Test** (`describe('143 bảng + sổ thu chi')`, fixture `openDebtDb({ through: '122b' })` rồi nạp file 143):
  - backfill: hai phiếu cũ `'Đại lý Hà'` và `' đại lý hà '` cùng quán → 1 NCC, cả hai phiếu có `supplier_id`; phiếu không tên giữ `supplier_id NULL`; quán B tên trùng → NCC riêng.
  - `cash_book_create_internal(..., 'supplier_payment', NULL, ...)` raise; `'supplier_payment'` + kind `'receipt'` raise; hợp lệ thì ghi được.
  - `cash_book_void` trên phiếu nguồn supplier_payment → reject `/huỷ ở trang Công nợ/`.
  - hai phiếu chi `supplier_payment` còn hiệu lực cùng `source_ref` → unique violation.
- [ ] **Step 2:** `node --test supabase/tests/143_supplier_debt.test.mjs` → FAIL (file chưa có).
- [ ] **Step 3:** Viết phần 0 (`$pre$`), 1 (bảng + RLS + REVOKE bảng + index `supplier_payment_allocations(inventory_document_id)`), 2 (đổi CHECK `cash_book_entries_source_check`, `_source_ref_pair`, `_inventory_payment_only` sang `source IN ('inventory_receipt','supplier_payment')`; index `cash_book_entries_supplier_payment_once`), 3 (vá ba dòng nguồn trong `cash_book_create_internal_result`, vá `cash_book_void`), backfill (DISTINCT ON tên chuẩn hoá, giữ cách viết mới nhất).
- [ ] **Step 4:** Chạy lại test → PASS; chạy `node --test supabase/tests/122b_inventory_cashbook.test.mjs supabase/tests/122_cash_shift_cashbook.test.mjs` → vẫn PASS.
- [ ] **Step 5:** Commit `feat: mig 143 bảng công nợ NCC + nguồn phiếu chi trả nợ`.

### Task 2: Migration 143 — vá lưu / huỷ / JSON phiếu nhập

**Files:** Modify `supabase/migrations/143_supplier_debt.sql` (phần 4); Test `supabase/tests/143_supplier_debt.test.mjs`

**Interfaces:**
- Consumes Task 1.
- Produces: `inventory_resolve_supplier(p_store_id uuid, p_doc jsonb) → uuid` (nội bộ; nhận `supplier_id` hoặc `supplier_name`; tên mới → `INSERT … ON CONFLICT (store_id, lower(btrim(name))) DO UPDATE SET is_active = true RETURNING id`; id lạ / quán khác → "Nhà cung cấp không hợp lệ"); `inventory_receipt_outstanding(p_doc_id uuid) → bigint` (nội bộ; NULL trừ khi `receipt` + `posted` + `unpaid` + có `supplier_id`).
- `inventory_document_json` trả thêm `supplier_id`, `outstanding`.

- [ ] **Step 1: Test** (`describe('143 phiếu nhập')`):
  - Chưa trả không NCC → reject "Phiếu chưa trả cần nhà cung cấp"; Đã trả không NCC → OK, `supplier_id NULL`.
  - Chưa trả `supplier_name: '  đại lý BIA hà '` khi đã có "Đại lý bia Hà" → dùng NCC đó, `supplier_name` phiếu = "Đại lý bia Hà"; NCC đã ngừng → bật lại.
  - Tên mới → tạo NCC (created_by = người lập).
  - `supplier_id` của quán khác → reject.
  - JSON: phiếu chưa trả 500.000 → `outstanding 500000`; đã trả → `null`; phiếu chưa trả không NCC (chèn thẳng) → `null`.
  - Huỷ phiếu chưa trả có phân bổ chưa huỷ (chèn thẳng lần trả + phân bổ) → reject "Phiếu đã trả nợ một phần — huỷ lần trả trước"; phân bổ của lần trả đã huỷ → huỷ được.
- [ ] **Step 2:** Chạy → FAIL.
- [ ] **Step 3:** Vá `inventory_post_document`: neo `  v_before text;` (+ `v_supplier_id uuid;`), neo `RAISE EXCEPTION 'Phiếu chưa trả không có phương thức trả';\n    END IF;` (+ gọi resolve, gán `v_supplier` = tên chuẩn, chưa trả mà NULL → raise), neo `  RETURNING id INTO v_doc_id;` (+ UPDATE supplier_id). Vá `inventory_void_document`: trước `SELECT * INTO v_doc … FOR UPDATE` khoá NCC của phiếu; sau nhánh `already` kiểm phân bổ. Vá `inventory_document_json` ở neo `'cash_book_entry_id', d.cash_book_entry_id)`.
- [ ] **Step 4:** Test 143 + 118 + 122b → PASS.
- [ ] **Step 5:** Commit `feat: mig 143 phiếu nhập gắn NCC, chặn huỷ phiếu đã trả nợ`.

### Task 3: Migration 143 — RPC NCC + test đua

**Files:** Modify `supabase/migrations/143_supplier_debt.sql` (phần 5–6); Test `supabase/tests/143_supplier_debt.test.mjs`; Create `supabase/tests/race/05-supplier-debt.test.mjs` (theo mẫu `03-debt.test.mjs`, nạp 143 qua helper race).

**Interfaces (RPC client, SECURITY DEFINER, trả jsonb):**
- `supplier_list(p_store_id uuid)` → `[{id, name, phone, note, is_active, outstanding, open_docs, oldest_open_date}]` (mọi NCC của quán).
- `supplier_detail(p_supplier_id uuid)` → `{supplier: {…như trên}, documents: [{id, doc_no, doc_date, created_at, total_amount, paid_amount, outstanding}], payments: [{id, amount, method, note, business_date, created_at, created_by_name, voided_at, voided_by_name, void_reason, cash_book_entry_id, allocations: [{document_id, doc_no, amount}]}]}`. `documents` = phiếu `receipt`/`posted`/`unpaid` của NCC, sắp `doc_date, created_at, id`. `payments` mới nhất trước.
- `supplier_upsert(p_store_id uuid, p_supplier_id uuid, p_name text, p_phone text, p_note text)` → `{supplier_id}`; trùng tên → "Đã có nhà cung cấp tên này"; SĐT chuẩn hoá bằng `debt_normalize_phone`.
- `supplier_set_active(p_supplier_id uuid, p_active boolean)` → `{is_active}`.
- `supplier_pay(p_supplier_id uuid, p_amount bigint, p_method text, p_document_ids uuid[], p_note text, p_client_request_id uuid)` → `{ok, already, supplier_payment_id, cash_book_entry_id, allocations: [{document_id, doc_no, amount}], remaining}`.
- `supplier_payment_void(p_id uuid, p_reason text)` → `{ok, already}`.

Thứ tự trong `supplier_pay`: kiểm quyền (SELECT không khoá) → `pg_advisory_xact_lock(hashtextextended(p_client_request_id::text, 0))` → tra lần trả cùng `(store_id, client_request_id)`: khác NCC / số tiền / phương thức / `requested_document_ids` (đã sắp, khử trùng) / người ghi → "Mã chống ghi trùng đã dùng cho lần trả khác", khớp → trả `already: true` (không kiểm ca) → kiểm đầu vào (mảng rỗng → "Chọn ít nhất một phiếu") → khoá NCC → khoá phiếu ORDER BY id → phiếu chọn sai/hết nợ → "Danh sách phiếu đã thay đổi, tải lại trang" → số tiền > tổng còn nợ → "Số tiền vượt số còn nợ (<số>đ)" → phân bổ cũ nhất trước → `v_payment_id := gen_random_uuid()` → `cash_book_create_internal(store, 'payment', method, cash_book_system_category(store,'inventory_purchase'), amount, <ghi chú>, tên NCC, 'supplier_payment', v_payment_id, auth.uid(), v_payment_id)` → INSERT lần trả + phân bổ.

`supplier_payment_void`: quyền → khoá NCC → khoá lần trả → đã huỷ → `already` → lý do rỗng / > 500 → raise → `cash_book_void_internal(entry, left('Huỷ trả nợ NCC: ' || lý do, 500), auth.uid())` (ca đã kết → raise nguyên văn) → UPDATE lần trả.

- [ ] **Step 1: Test** theo bảng nghiệm thu spec §8: (a) chọn PN còn 3tr + PN còn 4,2tr, CK 4tr → phân bổ 3tr/1tr, một phiếu chi bank 4tr ghi chú `Trả nợ NCC: PN-0001, PN-0002`, `remaining 3200000`; (b) TM khi bật ca không ca → "Chưa mở ca", không có gì ghi; có ca → `cash_shift_totals.cash_payments` tăng; (c) gửi lại cùng mã → `already`, sau khi kết ca vẫn `already`; cùng mã khác số tiền → reject; (d) vượt nợ → reject; (e) phiếu đã hết nợ trong danh sách → reject "tải lại"; (f) huỷ lần trả khi ca mở → nợ khôi phục, phiếu chi `voided_at` có; ca đã kết → reject "Ca của phiếu này đã kết", không đổi; (g) ghi chú 60 phiếu → ≤ 500 ký tự, kết bằng `(+N phiếu)`; (h) thu ngân / quán khác → "Không có quyền"; (i) `supplier_list`/`supplier_detail` số khớp; NCC ngừng vẫn trả được; `supplier_upsert` trùng tên → reject.
- [ ] **Step 2:** Test đua: hai `supplier_pay` mã khác nhau cùng trả hết khoản nợ cuối → đúng một thành công, một phiếu chi; `supplier_pay` song song `inventory_void_document` cùng phiếu → hoặc trả xong và huỷ bị chặn, hoặc huỷ xong và trả bị từ chối; không bao giờ phân bổ vào phiếu `voided`.
- [ ] **Step 3:** Chạy → FAIL. Viết phần 5 (hàm) + 6 (REVOKE/GRANT, `NOTIFY pgrst`).
- [ ] **Step 4:** `node --test supabase/tests/143_supplier_debt.test.mjs` PASS; `cd admin-web && npm run test:race` PASS (Docker).
- [ ] **Step 5:** Commit `feat: mig 143 RPC trả nợ nhà cung cấp`.

### Task 4: admin-web — lib thuần + server action NCC

**Files:**
- Create: `admin-web/lib/suppliers.ts`, `admin-web/lib/suppliers.test.ts`
- Create: `admin-web/lib/actions/suppliers.ts`, `admin-web/lib/actions/suppliers.test.ts` (mẫu `debts.test.ts`)
- Create: `admin-web/lib/actions/supplier-reads.ts` (không 'use server', như `debt-reads.ts`)

**Interfaces:**
- `type SupplierSummary = { id; name; phone: string|null; note: string|null; isActive: boolean; outstanding: number; openDocs: number; oldestOpenDate: string|null }`
- `type SupplierDoc = { id; docNo; docDate; createdAt; totalAmount; paidAmount; outstanding }`
- `type SupplierPaymentRow = { id; amount; method: 'cash'|'bank'; note; businessDate; createdAt; createdByName; voidedAt; voidedByName; voidReason; allocations: { documentId; docNo; amount }[] }`
- `type SupplierDetail = { supplier: SupplierSummary; documents: SupplierDoc[]; payments: SupplierPaymentRow[] }`
- `parseSupplierList(raw): SupplierSummary[]`, `parseSupplierDetail(raw): SupplierDetail | null`
- `allocateSupplierPayment(docs: SupplierDoc[], amount: number, selected: string[] | null): { allocations: { documentId: string; amount: number }[]; error: string | null }` — cùng thông báo lỗi với server.
- `selectedOutstanding(docs, ids: string[]): number`; `filterSuppliers(list, query, { onlyOpen }): SupplierSummary[]` (tìm tên không dấu + SĐT, như `filterDebtCustomers`).
- Action: `paySupplier({ supplierId, amount, method, documentIds: string[]|null, note, clientRequestId })`, `voidSupplierPayment({ paymentId, reason })`, `saveSupplier({ supplierId|null, name, phone, note })`, `setSupplierActive(id, active)`, `loadSupplierDetail(id)` — mọi hàm `requireBackOfficeStoreId()`.
- Read: `loadSupplierList(storeId): Promise<{ok:true; suppliers}|{ok:false; error}>`.

- [ ] **Step 1:** Test thuần: parse bỏ dòng hỏng; `allocateSupplierPayment` (3tr + 4,2tr, 4tr → [3tr, 1tr]; vượt → lỗi; 0 → lỗi); `filterSuppliers`. Test action: input sai → `{ok:false}` không gọi RPC; RPC lỗi → trả message; tham số RPC đúng tên `p_*`.
- [ ] **Step 2:** `npx vitest run lib/suppliers.test.ts lib/actions/suppliers.test.ts` → FAIL. Viết code. → PASS.
- [ ] **Step 3:** Commit `feat: lib + action công nợ nhà cung cấp`.

### Task 5: Công nợ — tab Nhà cung cấp, ngăn kéo tích chọn, hộp trả nợ

**Files:**
- Modify: `admin-web/app/admin/debts/debts-screen.tsx` (đọc `?tab=`, back office thì tải `loadSupplierList`)
- Create: `admin-web/app/admin/debts/debts-tabs.tsx` (đổi tab bằng state + `history.replaceState`, KHÔNG điều hướng mềm — @modal/(.)debts bắt)
- Create: `admin-web/app/admin/debts/suppliers-view.tsx`, `supplier-drawer.tsx`, `supplier-pay-dialog.tsx`, `supplier-form-dialog.tsx`
- Test: `admin-web/app/admin/debts/suppliers-view.test.tsx`, `supplier-drawer.test.tsx`

**Interfaces:** Consumes Task 4. `SupplierDrawerBody` thuần props (test vẽ tĩnh) nhận `{ detail, selected: string[], onToggle(id), onToggleAll(), busy, onPaySelected, onPay, onVoid, onEdit, onToggleActive }`. `SupplierPayForm` thuần props như `DebtCollectForm` (prefill amount, xem trước phân bổ từng phiếu, nút **Xác nhận trả**).

- [ ] **Step 1: Test:** thu ngân (canManage=false) không thấy tab NCC; tab NCC hiện "Tổng phải trả", "NCC đang nợ"; ngăn kéo có checkbox mỗi phiếu còn nợ, "Chọn tất cả"; khi `selected` có 2 phiếu → thanh "Đã chọn 2 phiếu · 7.200.000 ₫" + nút "Trả các phiếu đã chọn"; không tích → không có thanh; "Đã trả hết (n)" chỉ gồm phiếu outstanding 0; dòng lịch sử hiện "PN-0003, PN-0005"; số phiếu là link `/admin/inventory?doc=<id>`.
- [ ] **Step 2:** FAIL → viết → `npx vitest run app/admin/debts` PASS.
- [ ] **Step 3:** Commit `feat: tab công nợ nhà cung cấp, tích chọn phiếu trả nhanh`.

### Task 6: Kho — form phiếu nhập, nhãn còn nợ, mở phiếu theo `?doc=`

**Files:**
- Modify: `admin-web/lib/inventory.ts` (`DocSummary` + `supplierId: string|null`, `outstanding: number|null`), `lib/inventory.test.ts`
- Modify: `admin-web/lib/actions/inventory.ts` (`loadInventoryDocuments` lấy gợi ý NCC từ `supplier_list` — tên NCC đang dùng; lỗi thì rơi về `suppliers` cũ)
- Modify: `admin-web/app/admin/inventory/receipt-form.tsx`, `doc-format.ts` (`paidLabel`), `documents-tab.tsx` (`?doc=` mở `DocumentDialog`)
- Test: `admin-web/app/admin/inventory/documents.test.tsx`

**Interfaces:** `paidLabel(d: Pick<DocSummary,'paidStatus'|'paidMethod'|'supplierId'|'outstanding'|'totalAmount'|'status'>): string` — Chưa trả: không NCC → "Chưa trả · Thiếu nhà cung cấp"; `outstanding > 0` → "Còn nợ 3.000.000 ₫"; `outstanding === 0 && totalAmount > 0` → "Đã trả hết qua công nợ"; còn lại "Chưa trả". Đã trả giữ nhãn cũ.

- [ ] **Step 1: Test:** `receiptBlocker` Chưa trả + tên rỗng → "Chọn nhà cung cấp"; form Chưa trả có tên hiện "Phiếu sẽ ghi vào công nợ NCC Đại lý bia Hà."; Đã trả hiện "Khi có tiền trả, Kho tự ghi phiếu chi “Nhập hàng”."; `paidLabel` bốn nhánh; `parseDocuments` đọc `supplier_id`, `outstanding`.
- [ ] **Step 2:** FAIL → viết → `npx vitest run app/admin/inventory lib/inventory.test.ts lib/actions/inventory.test.ts` PASS.
- [ ] **Step 3:** Commit `feat: kho bắt NCC khi chưa trả, hiện số còn nợ`.

### Task 7: Sổ thu chi + Chi két — nguồn Trả nợ NCC, nhãn Đi chợ, dòng nhắc

**Files:**
- Modify: `admin-web/lib/cash-common.ts` (`SOURCES` + `'supplier_payment'`), `lib/cash-book.ts` (`cashEntryVoidable` loại nguồn này; thêm `cashCategoryOptionLabel(c: {kind; name}): string`), `lib/cashbook-xlsx.ts` (nhãn "Trả nợ NCC")
- Modify: `app/admin/cashbook/cashbook-view.tsx` (`SourceNote`: "Trả nợ NCC · Huỷ ở trang Công nợ"), `app/admin/pos/shift-controls.tsx` ("Huỷ ở trang Công nợ"), `app/admin/cashbook/entry-form-dialog.tsx` + `app/admin/pos/cash-drawer-dialog.tsx` (nhãn ô chọn qua `cashCategoryOptionLabel`; phiếu chi hiện dòng nhắc)
- Test: `lib/cash-book.test.ts`, `lib/cashbook-xlsx.test.ts`, `app/admin/cashbook/cashbook-view.test.tsx`, `app/admin/pos/shift-controls.test.tsx`

- [ ] **Step 1: Test:** `cashEntryVoidable({source:'supplier_payment'}, true) === false`; `cashCategoryOptionLabel({kind:'payment', name:'Đi chợ'}) === 'Chi đi chợ ngoài nhập kho'`, `'Đi chợ sáng'` giữ nguyên, `kind:'receipt'` giữ nguyên; xlsx nguồn "Trả nợ NCC"; Sổ hiện "Trả nợ NCC · Huỷ ở trang Công nợ"; form chi có dòng nhắc, danh sách Sổ vẫn ghi "Đi chợ".
- [ ] **Step 2:** FAIL → viết → `npx vitest run lib app/admin/cashbook app/admin/pos` PASS.
- [ ] **Step 3:** Commit `feat: sổ thu chi hiện nguồn trả nợ NCC, nhãn đi chợ ngoài nhập kho`.

### Task 8: Kiểm toàn bộ + tài liệu test

**Files:** Create `docs/testing/cong-no-ncc/CONG-NO-NCC.md`; Modify `TESTING.md` (một dòng), `docs/decisions.md` (một dòng).

- [ ] **Step 1:** `cd admin-web && npm test && npx tsc --noEmit && npm run lint` xanh; `node --test supabase/tests/143_supplier_debt.test.mjs supabase/tests/118_inventory.test.mjs supabase/tests/122b_inventory_cashbook.test.mjs supabase/tests/123_customer_debt.test.mjs` xanh; `python scripts/verify.py` (nếu chạy được trong worktree).
- [ ] **Step 2:** Checklist test tay theo 9 dòng nghiệm thu spec §8 + tab/tích chọn/mobile.
- [ ] **Step 3:** Commit `docs: checklist test công nợ NCC`.
- [ ] **Step 4:** Đối chiếu `pg_get_functiondef` prod của 5 hàm vá với neo, áp NGUYÊN VĂN mig 143 lên prod (dữ liệu prod là test; được phép tự áp), rồi mở sẵn admin-web của worktree (preview) cho anh Tú. Lưu ý: từ lúc áp, bản Vercel cũ lưu phiếu Chưa trả không NCC sẽ bị từ chối cho tới khi merge.
