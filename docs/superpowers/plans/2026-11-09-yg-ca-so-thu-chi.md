# Yên Garden — Ca thu ngân + Sổ thu chi (module CA) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Thay thế** Part 2 (Task 5–11) của `2026-11-05-dot1-b-ngay-kd-va-ca.md`. Part 1 của plan đó (mig 111) giữ nguyên, đã PASS. Không làm theo Part 2 cũ nữa: bảng `cash_shift_expenses`, RPC `add_cash_expense`/`void_cash_expense` và số mig 113 đều bỏ.

**Goal:** Thu ngân mở ca, thu/chi tiền két, kết ca đối chiếu két ngay trên POS; chủ quán và quản lý ghi mọi khoản thu/chi ngoài bán hàng (tiền mặt + chuyển khoản) ở trang Sổ thu chi; phiếu nhập kho đã trả tự sinh phiếu chi.

**Architecture:** Mig 122 tạo `cash_shifts`, `cash_book_categories`, `cash_book_entries`, các hàm nội bộ (`require_open_cash_shift`, `cash_shift_totals`, `cash_book_create_internal`, `cash_book_void_internal`, `cash_book_system_category`), RPC ca + sổ, và vá tại chỗ ba RPC thu tiền của mig 112a để ghi `bill_payments.cash_shift_id`. Mig 122b vá tại chỗ hai RPC kho của mig 118 tại hai dòng neo đặt sẵn, gọi hai hàm nối kho ↔ sổ trong cùng giao dịch, rồi backfill. Mọi con số tiền do server tính; POS đọc trạng thái ca qua `lib/pos-browser-reads.ts`, ghi bằng server action.

**Tech Stack:** Postgres (Supabase, plpgsql), Next.js 16 App Router, React 19, `exceljs`, vitest, `node --test` + pglite.

**Spec:**
- `docs/superpowers/specs/2026-11-09-yen-garden-trien-khai-design.md` §4 mục 4, 5; §6; §8
- `docs/superpowers/specs/2026-11-09-yg-so-thu-chi-design.md` (toàn bộ)
- `docs/superpowers/specs/2026-11-05-dot1-thanh-toan-ca-in-vietqr-design.md` §4 B2, B4 (B3 bị thay bởi sổ thu chi), §7
- `docs/superpowers/specs/2026-11-09-yg-kho-design.md` §4, §6, §7 (phần nối sổ)
- `docs/superpowers/specs/2026-11-09-yg-vai-quan-ly-design.md` §2 (bảng quyền)
- **Hợp đồng chung:** `docs/superpowers/plans/2026-11-09-yg-hop-dong-chung.md` — tên hàm, số migration, đường dẫn trang phải khớp file này.

**Thứ tự chạy:**

| Phần | Task | Điều kiện bắt đầu | Migration |
|---|---|---|---|
| A. Ca + sổ (DB) | 1–4 | THU (112a, 112b) và QL (116) đã gộp vào nhánh tích hợp `claude/yen-garden-survey-e9a44a` | 122 |
| B. Web | 5–10 | Task 1–4 xong | — |
| C. Nối kho | 11 | KHO (118) đã gộp vào nhánh tích hợp | 122b |
| D. Checklist | 12 | Task 1–11 xong | — |

Agent chạy trong worktree riêng cắt từ nhánh tích hợp (Agent `isolation: "worktree"`). Worktree mới chưa có `node_modules`: `cd admin-web; npm ci` trước. Không áp migration lên prod, không push, không merge `main`.

## Global Constraints

- Mặc định như hôm nay: `require_cash_shift = false`. Quán không bật thì POS không hiện gì thêm (kể cả nút Thu/Chi két), thu tiền như cũ, `cash_shift_id` NULL.
- Mỗi quán mỗi lúc một ca đang mở, chung một két. Ai có quyền POS (chủ quán, quản lý, thu ngân) mở, kết, thu vào ca đó. Ca độc lập với ngày kinh doanh. Một ca đóng một lần, không mở lại, không sửa. Không tự đóng ca.
- Công thức két (spec tổng §4.4), không viết công thức thứ hai ở TS:
  `expected_cash = opening_cash + cash_sales + debt_cash + cash_receipts − cash_payments`; `difference = counted_cash − expected_cash` (âm = thiếu).
  - `cash_sales` = Σ `bill_payment_lines.amount` có `instrument='cash'` của các `bill_payments` có `cash_shift_id` = ca.
  - `cash_receipts` / `cash_payments` = Σ `cash_book_entries.amount` `method='cash'`, `kind='receipt'`/`'payment'`, `cash_shift_id` = ca, `voided_at IS NULL`.
  - `debt_cash` = 0 cho tới mig 123 (dòng neo ở Task 1).
- Server không trả tiền dự kiến (cũng như `cash_sales`, `bank_sales`, `bills_count`) của ca đang mở cho client, kể cả chủ quán.
- Phiếu tiền mặt khi quán bật ca **bắt buộc** gắn ca đang mở, không có ca thì lỗi `Chưa mở ca`. Phiếu chuyển khoản không gắn ca. Phiếu ghi xong không sửa. Huỷ có lý do; phiếu tiền mặt chỉ huỷ khi ca của nó còn mở; phiếu `source='inventory_receipt'` chỉ huỷ qua huỷ phiếu nhập.
- `business_date` của phiếu = `current_business_date(store_id)` lúc ghi. Không có tham số ngày, không ghi lùi ngày.
- Quyền (bảng vai Quản lý §2): Chủ quán + Quản lý (`is_store_back_office`) ghi TM + CK, huỷ, sửa danh mục, xem mọi ca. Thu ngân (`is_store_pos_operator` không back office) chỉ ghi **tiền mặt** nguồn `pos_drawer`, không huỷ, chỉ xem ca do mình mở hoặc kết. Phục vụ không gì cả. Chỉ chủ quán bật/tắt công tắc ca.
- Danh mục hệ thống ("Nhập hàng", `report_group='inventory_purchase'`) không xoá, không đổi tên, không ẩn. Danh mục người dùng tạo không được chọn nhóm `inventory_purchase`.
- Số tiền `bigint` VNĐ, phiếu từ 1 tới 2.000.000.000; tiền đầu ca / đếm được `bigint` ≥ 0.
- Vá hàm sống: helper `pg_temp.mevo_patch` theo mẫu mig 110 (nhãn `mig 122` / `mig 122b`), raise khi neo khớp 0 hoặc hơn 1 lần. Neo nằm gọn **một dòng** (chống CRLF).
- Neo của ba RPC thu tiền **không chép từ prod** (112a chưa áp prod lúc làm): chép nguyên văn từ `supabase/migrations/112a_collect_table_bill.sql` trên nhánh tích hợp; test so neo trên `pg_get_functiondef` sau khi nạp 112a+112b vào pglite. Controller kiểm lại trên prod trước khi áp 122.
- Không ghi "rerun-safe" trong migration. Bọc mỗi file `BEGIN; … COMMIT;`, cuối có `NOTIFY pgrst, 'reload schema';`.
- Hàm nội bộ: `REVOKE ALL ... FROM PUBLIC, anon, authenticated`. RPC: `SECURITY DEFINER`, `SET search_path = public`, `REVOKE ... FROM PUBLIC, anon`, `GRANT EXECUTE ... TO authenticated`.
- Bảng mới bật RLS, `REVOKE ALL ... FROM anon, authenticated`. Chỉ `cash_book_categories` có policy SELECT cho `is_store_pos_operator(store_id)`. `cash_shifts`, `cash_book_entries` không policy: đọc qua RPC.
- Server action có lỗi người dùng trả `{ ok: false, error }`, không ném; bọc cả bước kiểm quyền trong `try/catch`. Action dùng `createClient()` (cần `auth.uid()`), không dùng service role.
- Không poll bằng server action trên POS. Không `window.confirm`, dùng `ConfirmDialog` (`app/admin/pos/confirm-dialog.tsx`).
- Ô nhập tiền dùng `parseVnd` của `lib/cash-change.ts` (`Number('80.000')` ra 80).
- Next.js 16: đọc `admin-web/node_modules/next/dist/docs` trước khi viết route; `searchParams` là Promise. Trang mới đọc được ở 375px.
- Chữ giao diện tiếng Việt, comment tiếng Việt cho logic khó. Font, màu theo design system 2026-10-02 (màu nhấn cam, trạng thái tách khỏi màu nhấn).
- Commit `feat:` / `fix:` / `chore:` / `docs:`.
- Chạy trước khi báo xong mỗi task: `cd admin-web; npm test; npx tsc --noEmit; npm run lint` và test SQL: `$env:PGLITE_MODULE='<worktree>/admin-web/node_modules/@electric-sql/pglite/dist/index.js'; node --test supabase/tests/<file>.test.mjs`.

## Review Focus

1. **Mạng rớt / bấm hai lần khi ghi phiếu hoặc kết ca.** Gửi lại cùng `client_request_id` phải trả phiếu cũ (`already: true`), kể cả khi ca đã đóng giữa hai lần; kết ca lặp cùng số đếm trả kết quả đã lưu. Test ở Task 2, Task 3.
2. **Một người ghi phiếu / thu bill đúng lúc người khác bấm Kết ca.** Khoản tiền phải nằm trọn trong ca cũ hoặc bị báo `Chưa mở ca`, không rơi ra ngoài két. Test tĩnh khoá `FOR SHARE`/`FOR UPDATE` ở Task 2, Task 3, Task 4.
3. **Quản lý nhập kho trả tiền mặt lúc chưa mở ca** (sáng sớm, shipper giao bia). Theo quy tắc sổ §4.1, cả phiếu nhập bị từ chối với lời dễ hiểu `Chưa mở ca — mở ca trên POS hoặc chọn Chuyển khoản / Chưa trả`, không lưu nửa vời. Test ở Task 11. (Câu hỏi mở cho anh Tú, xem cuối file.)
4. **Huỷ phiếu nhập kho đã trả tiền mặt sau khi ca đã kết.** Phải bị từ chối toàn bộ (phiếu nhập vẫn `posted`, phiếu chi vẫn còn), không để kho và sổ lệch nhau. Test ở Task 11.
5. **Thu ngân gõ tay URL / gọi thẳng RPC:** ghi phiếu chuyển khoản, huỷ phiếu, xem ca người khác, xem sổ quán khác. Tất cả bị chặn ở server. Test ở Task 2, Task 3.

---

## Sơ đồ file

| File | Việc |
|---|---|
| `supabase/migrations/122_cash_shift_cashbook.sql` | Mới. Bảng, seed, trigger, hàm nội bộ, RPC ca + sổ, vá snapshot, gác 3 RPC thu |
| `supabase/migrations/122b_inventory_cashbook.sql` | Mới. Nối phiếu nhập kho ↔ phiếu chi, FK, backfill |
| `supabase/tests/prod-defs/122/store_workflow_snapshot.sql` | Mới. Bản chụp prod (sau mig 111) |
| `supabase/tests/helpers/cash-shift-db.mjs` | Mới. Dựng DB pglite tới 122 (và 122b) |
| `supabase/tests/122_cash_shift_cashbook.test.mjs` | Mới. Task 1–4 |
| `supabase/tests/122b_inventory_cashbook.test.mjs` | Mới. Task 11 |
| `admin-web/lib/cash-shift.ts` (+ test) | Mới. Kiểu, parse JSON ca, `parseShiftCash`, `differenceLabel` |
| `admin-web/lib/cash-book.ts` (+ test) | Mới. Kiểu, parse JSON sổ, bộ lọc, nhãn nhóm, gom theo danh mục |
| `admin-web/lib/actions/cash-shift.ts` (+ test) | Mới. Action ca + công tắc |
| `admin-web/lib/actions/cash-book.ts` (+ test) | Mới. Action phiếu + danh mục |
| `admin-web/lib/actions/cash-shift-reads.ts`, `cash-book-reads.ts` | Mới. Đọc cho server component |
| `admin-web/lib/pos-browser-reads.ts` | Thêm 3 hàm đọc |
| `admin-web/lib/cashbook-xlsx.ts` (+ test) | Mới. Excel sổ thu chi |
| `admin-web/app/admin/settings/cash-shift-setting.tsx`, `page.tsx` | Công tắc bắt buộc mở ca |
| `admin-web/app/admin/pos/use-cash-shift.ts`, `shift-controls.tsx`, `cash-drawer-dialog.tsx` (+ test), `pos-client.tsx` | Ca + Thu/Chi két trên POS |
| `admin-web/app/print/shift-report/*` | Phiếu bàn giao 80mm |
| `admin-web/app/admin/bills/bills-tabs.tsx`, `shifts-panel.tsx` (+ test), `bills-screen.tsx` | Tab Ca trong A04 |
| `admin-web/app/admin/cashbook/*`, `app/admin/@modal/(config)/(.)cashbook/page.tsx` | Trang Sổ thu chi + Excel |
| `admin-web/app/admin/admin-nav.tsx`, `config-dialog.tsx` (+ test) | Mục rail "Thu chi", tab hộp thoại |
| `docs/testing/yen-garden/THU-CHI.md`, `docs/testing/yen-garden/sql/thu-chi-verify.sql`, `TESTING.md`, `CLAUDE.md` | Checklist, quyết định |

---

# Phần A: Migration 122

**Chuẩn bị trước Task 1:** trên nhánh tích hợp phải có `supabase/migrations/112a_collect_table_bill.sql`, `112b_lock_old_paid_path.sql`, `116_*.sql`, `supabase/tests/helpers/collect-bill-db.mjs`. Thiếu thì dừng, báo controller.

### Task 1: Bảng, danh mục, hàm nội bộ

**Files:**
- Create: `supabase/migrations/122_cash_shift_cashbook.sql`
- Create: `supabase/tests/prod-defs/122/store_workflow_snapshot.sql`
- Create: `supabase/tests/helpers/cash-shift-db.mjs`
- Test: `supabase/tests/122_cash_shift_cashbook.test.mjs`

**Interfaces:**
- Consumes: `openCollectDb({ lock: true })` của plan A (`helpers/collect-bill-db.mjs`); bảng `bill_payments`, `bill_payment_lines`; `business_date_of`, `current_business_date`, `business_day_bounds` (mig 111); `is_store_back_office`, `is_store_pos_operator` (mig 116).
- Produces (bảng): `cash_shifts`, `cash_book_categories`, `cash_book_entries`; cột `store_workflow_settings.require_cash_shift boolean NOT NULL DEFAULT false`; FK ghép `bill_payments(cash_shift_id, store_id) → cash_shifts(id, store_id)` + index một phần `WHERE cash_shift_id IS NOT NULL`.
- Produces (nội bộ, REVOKE client — đúng chữ ký hợp đồng):
  - `require_open_cash_shift(p_store_id uuid) RETURNS uuid`
  - `cash_shift_totals(p_shift_id uuid) RETURNS jsonb` → `{opening_cash, cash_sales, cash_receipts, cash_payments, debt_cash, expected_cash, bills_count, bank_sales}` (đều số nguyên)
  - `cash_book_system_category(p_store_id uuid, p_report_group text) RETURNS uuid`
  - `cash_book_create_internal(p_store_id uuid, p_kind text, p_method text, p_category_id uuid, p_amount bigint, p_note text, p_counterparty text, p_source text, p_source_ref uuid, p_actor uuid, p_client_request_id uuid) RETURNS uuid`
  - `cash_book_void_internal(p_entry_id uuid, p_reason text, p_actor uuid) RETURNS jsonb` → `{ok, already}` (**bổ sung hợp đồng**, Task 3 và 122b dùng)
  - `seed_cash_book_categories(p_store_id uuid) RETURNS void`, trigger `trg_stores_seed_cash_book_categories AFTER INSERT ON public.stores`
- Produces (test): `openCashShiftDb({ through: '122' | '122b' })` trong `helpers/cash-shift-db.mjs`, trả mọi thứ của `openCollectDb` cộng `ids.manager`, `ids.otherStore`, `as(uid, sql, params)` (chạy dưới `authenticated` với `request.jwt.claim.sub`), `setShiftRequired(storeId, on)`, `setDayStart(storeId, 'HH:MM')`, `insertShift({ openedAt, status, continuedAt })`, `category(storeId, name)` trả id danh mục seed.

- [ ] **Step 1: Chụp prod và viết fixture**

Dùng Supabase MCP `execute_sql` (chỉ SELECT) lấy `pg_get_functiondef('public.store_workflow_snapshot(uuid)'::regprocedure)` ghi nguyên byte vào `prod-defs/122/`. Kiểm bản chụp có chứa dòng `'business_day_start', to_char(w.business_day_start, 'HH24:MI')` (neo Task 2).

`cash-shift-db.mjs`:
1. Gọi `openCollectDb({ lock: true })`. Nạp file migration bằng `readFile(...).replace(/\r\n/g, '\n')` để giống cách controller áp (LF).
2. Thêm (nếu helper A chưa có) `store_workflow_settings(store_id pk, business_day_start time NOT NULL DEFAULT '00:00', updated_at, updated_by)` và `store_workflow_setting_events` theo `helpers/business-day-fixture.mjs`; nạp `prod-defs/122/store_workflow_snapshot.sql` (thêm cột snapshot đọc nếu thiếu, có default).
3. `CREATE OR REPLACE` ba hàm ngày kinh doanh theo đúng công thức mig 111 (đọc `business_day_start`), thay cho stub 00:00 của helper A.
4. Stub mig 116 đúng hợp đồng: `is_store_back_office(p)` = `auth.uid()` là owner hoặc manager của `p`; `is_store_pos_operator(p)` = owner, manager hoặc cashier của `p`. Stub `is_store_owner_or_admin`, `is_store_owner_of` = chỉ owner.
5. `exec` `122_cash_shift_cashbook.sql`; `through: '122b'` thì nạp tiếp `118_*.sql` thật (Task 11) rồi `122b_inventory_cashbook.sql`.

- [ ] **Step 2: Viết test thất bại (khối `describe('122 nền')`)**

Hàm nhỏ trong file test (không đưa vào helper): `newStore()` chèn một quán, `totals(shiftId)` gọi `cash_shift_totals` dưới `postgres`, `def(sig)` trả `pg_get_functiondef`, `countOf(text, needle)` đếm số lần khớp, `create(uid, overrides)` gọi `cash_book_create` dưới `uid` với mặc định phiếu chi TM 10.000 danh mục Đá, mã mới.

```js
test('seed: quán có sẵn và quán tạo mới đều có 11 danh mục, Nhập hàng là hệ thống', async () => {
  for (const s of [ids.store, await newStore()]) {
    const rows = (await db.query('SELECT kind, name, is_system, report_group, requires_note FROM cash_book_categories WHERE store_id = $1 ORDER BY kind, sort_order', [s])).rows
    assert.equal(rows.length, 11)
    assert.deepEqual(rows.filter((r) => r.is_system).map((r) => [r.name, r.report_group]), [['Nhập hàng', 'inventory_purchase']])
    assert.deepEqual(rows.filter((r) => r.requires_note).map((r) => r.name).sort(), ['Khác', 'Thu khác'])
  }
})
test('cash_book_system_category trả đúng Nhập hàng; nhóm không có danh mục hệ thống thì raise', ...)
test('require_open_cash_shift: tắt trả NULL; bật không ca raise Chưa mở ca; bật có ca trả id', ...)
test('công thức két: 500k đầu + 300k TM bill + 100k phiếu thu TM − 50k phiếu chi TM = 850k', async () => {
  // thêm nhiễu không được tính: dòng bank 200k của cùng bill; phiếu chi CK 70k; phiếu chi TM 20k đã huỷ;
  // bill TM của ca khác; phiếu TM của quán khác
  const t = await totals(shift)
  assert.deepEqual(t, { opening_cash: 500000, cash_sales: 300000, cash_receipts: 100000, cash_payments: 50000,
    debt_cash: 0, expected_cash: 850000, bills_count: 1, bank_sales: 200000 })
})
test('create_internal: phiếu TM khi bật ca gắn ca; phiếu CK cash_shift_id NULL; business_date theo ngày kinh doanh 05:00', ...)
test('create_internal: danh mục sai loại thu/chi, danh mục quán khác, danh mục ẩn đều bị chặn', ...)
test('create_internal: số tiền 0, âm, 2.000.000.001 bị chặn; Khác thiếu ghi chú (hoặc toàn dấu cách) bị chặn', ...)
test('create_internal: cùng client_request_id trả cùng id, không thêm dòng', ...)
test('void_internal: phiếu TM ca đã đóng raise; lý do rỗng raise; huỷ lần hai already true; ghi người, giờ, lý do', ...)
test('hàm nội bộ: anon và authenticated không EXECUTE được', async () => {
  for (const fn of ['require_open_cash_shift(uuid)', 'cash_shift_totals(uuid)', 'cash_book_system_category(uuid,text)',
    'cash_book_create_internal(uuid,text,text,uuid,bigint,text,text,text,uuid,uuid,uuid)',
    'cash_book_void_internal(uuid,text,uuid)', 'seed_cash_book_categories(uuid)']) { /* has_function_privilege false */ }
})
test('neo debt_cash có đúng 1 lần trong cash_shift_totals (mig 123 vá vào đây)', async () => {
  assert.equal(countOf(await def('cash_shift_totals(uuid)'), '  v_debt_cash := 0; -- mevo-anchor:123 cash_shift_totals.debt_cash'), 1)
})
test('client không đọc thẳng được cash_shifts, cash_book_entries; đọc được danh mục quán mình, không đọc quán khác', ...)
```

- [ ] **Step 3: Chạy test, phải FAIL**

Run: `node --test supabase/tests/122_cash_shift_cashbook.test.mjs`
Expected: FAIL vì chưa có file migration.

- [ ] **Step 4: Viết phần bảng + hàm nội bộ của `122_cash_shift_cashbook.sql`**

Đầu file: khối `DO $pre$` dừng nếu thiếu `bill_payments`, `bill_payment_lines`, `collect_table_bill(uuid[],jsonb,integer,uuid)`, `current_business_date(uuid)`, `is_store_back_office(uuid)`, hoặc nếu `close_table_session(uuid,text,text)` còn nhận `'paid'` (tức 112b chưa áp — kiểm bằng `pg_get_functiondef` có chuỗi `tải lại trang rồi thu lại`).

Bảng (ngoài cột liệt kê ở spec sổ §3 và spec Đợt 1 §B2):
- `cash_shifts`: `opening_cash`, `counted_cash`, `expected_cash`, `difference` là `bigint`; thêm `continued_by uuid`, `continued_at timestamptz`; `UNIQUE (id, store_id)`; `CREATE UNIQUE INDEX cash_shifts_one_open ON cash_shifts(store_id) WHERE status = 'open'`; CHECK `opening_cash >= 0`, `counted_cash >= 0`, `status IN ('open','closed')`, `(status = 'open') = (closed_at IS NULL)`.
- `cash_book_categories`: thêm `requires_note boolean NOT NULL DEFAULT false`, `created_at`; `UNIQUE (id, store_id)`; `CREATE UNIQUE INDEX ... (store_id, kind, lower(name))`; `CREATE UNIQUE INDEX ... (store_id, report_group) WHERE is_system`; CHECK `btrim(name) <> '' AND length(name) <= 60`; CHECK cặp loại–nhóm: chi nhận `operating_expense | inventory_purchase | owner_draw | cash_transfer`, thu nhận `other_income | cash_transfer`.
- `cash_book_entries`: FK ghép `(category_id, store_id)` và `(cash_shift_id, store_id)`; CHECK `amount BETWEEN 1 AND 2000000000`; `length(note) <= 500`, `length(counterparty) <= 120`; `method = 'cash' OR cash_shift_id IS NULL`; `source <> 'pos_drawer' OR method = 'cash'`; `(source = 'inventory_receipt') = (source_ref IS NOT NULL)`; `(voided_at IS NULL) = (void_reason IS NULL)`; `client_request_id uuid NOT NULL`; `UNIQUE (store_id, client_request_id)`; index `(store_id, business_date)`, `(cash_shift_id) WHERE cash_shift_id IS NOT NULL`; `CREATE UNIQUE INDEX ... (source_ref) WHERE source = 'inventory_receipt' AND voided_at IS NULL`.

Seed (thứ tự `sort_order` 10, 20, …):

| kind | name | report_group | is_system | requires_note |
|---|---|---|---|---|
| payment | Nhập hàng | inventory_purchase | true | false |
| payment | Đi chợ · Ga - than · Đá · Điện nước · Lương - thưởng · Sửa chữa | operating_expense | false | false |
| payment | Khác | operating_expense | false | true |
| payment | Chủ quán rút | owner_draw | false | false |
| receipt | Nộp thêm vào két | cash_transfer | false | false |
| receipt | Thu khác | other_income | false | true |

`seed_cash_book_categories` chèn `ON CONFLICT (store_id, kind, lower(name)) DO NOTHING`. Backfill `SELECT seed_cash_book_categories(id) FROM stores`. Trigger theo mẫu `trg_stores_ensure_workflow_settings` (mig 049): hàm trigger `SECURITY DEFINER`, `RETURN NULL`.

`require_open_cash_shift`: theo plan B Task 5 cũ — công tắc tắt trả NULL; bật thì `SELECT id … WHERE store_id = p AND status = 'open' FOR SHARE`, không có raise `'Chưa mở ca'`. Không kiểm quyền (bếp gọi bằng token).

`cash_shift_totals`: plpgsql, đọc ca (không thấy raise `'Không tìm thấy ca'`), cộng theo Global Constraints. Dòng debt **đúng nguyên văn**, đứng một mình một dòng, và `v_debt_cash` phải đi vào `expected_cash`:

```sql
  v_debt_cash := 0; -- mevo-anchor:123 cash_shift_totals.debt_cash
```

`cash_book_create_internal`, thứ tự:
1. Đã có dòng `(p_store_id, p_client_request_id)`: cùng `kind, method, category_id, amount` thì trả id cũ; khác thì raise `'Mã chống ghi trùng đã dùng cho phiếu khác'`. Làm **trước** bước 4 để lần gửi lại sau khi ca đóng vẫn trả phiếu cũ.
2. Kiểm `p_kind`, `p_method`, `p_source` trong danh sách; số tiền; danh mục `FOR SHARE` thuộc `p_store_id`, `is_active`, cùng `kind` (sai: `'Danh mục không hợp lệ'`); `requires_note` mà ghi chú rỗng sau `btrim`: `'Danh mục này cần ghi chú'`.
3. Chuỗi rỗng sau `btrim` của `note`, `counterparty` lưu NULL.
4. `p_method = 'cash'` thì `v_shift := require_open_cash_shift(p_store_id)`; ngược lại NULL.
5. `INSERT … ON CONFLICT (store_id, client_request_id) DO NOTHING RETURNING id`; không ra id (hai lần gọi song song) thì quay lại bước 1. `business_date = current_business_date(p_store_id)`, `created_by = p_actor`.

`cash_book_void_internal`: khoá phiếu `FOR UPDATE`; không thấy raise `'Không tìm thấy phiếu'`; đã huỷ trả `{ok:true, already:true}`; lý do rỗng raise `'Cần ghi lý do huỷ'`; phiếu có `cash_shift_id` thì khoá ca `FOR SHARE`, ca đóng raise `'Ca của phiếu này đã kết, không huỷ được'`; ghi `voided_by = p_actor`, `voided_at = now()`, `void_reason = btrim(p_reason)`. Hàm này **không** chặn nguồn `inventory_receipt` — chặn ở RPC Task 3.

`cash_book_system_category`: trả id danh mục `is_system` của nhóm; không có raise `'mig 122: quán chưa có danh mục hệ thống %'`.

- [ ] **Step 5: Chạy test, phải PASS**

Run: lệnh Step 3. Expected: PASS khối `122 nền`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/122_cash_shift_cashbook.sql supabase/tests/prod-defs/122 supabase/tests/helpers/cash-shift-db.mjs supabase/tests/122_cash_shift_cashbook.test.mjs
git commit -m "feat: mig 122 bang ca, so thu chi, danh muc va ham noi bo"
```

### Task 2: RPC ca

**Files:**
- Modify: `supabase/migrations/122_cash_shift_cashbook.sql` (thêm trước `NOTIFY`)
- Test: `supabase/tests/122_cash_shift_cashbook.test.mjs` (khối `describe('122 ca')`)

**Interfaces:**
- Consumes: Task 1.
- Produces (RPC, GRANT authenticated, kiểm `is_store_pos_operator` trừ khi ghi khác):
  - `open_cash_shift(p_store_id uuid, p_opening_cash bigint, p_note text) RETURNS jsonb` → `{ok, shift_id}`
  - `close_cash_shift(p_shift_id uuid, p_counted_cash bigint, p_note text) RETURNS jsonb` → `{ok, already, shift_id, opening_cash, cash_sales, cash_receipts, cash_payments, debt_cash, expected_cash, counted_cash, difference}`
  - `continue_stale_shift(p_shift_id uuid) RETURNS jsonb` → `{ok, already}`
  - `get_open_cash_shift(p_store_id uuid) RETURNS jsonb` → `{required, can_manage_entries, shift}`; `shift` null hoặc `{id, opened_at, opened_by_name, opening_cash, open_note, stale, entries}`; `entries`: `[{id, kind, method, category_name, amount, note, counterparty, source, created_at, created_by_name, voided_at}]` — phiếu TM gắn ca này, mới nhất trước
  - `list_cash_shifts(p_store_id uuid, p_limit int DEFAULT 60) RETURNS jsonb` → `{required, shifts: [{id, status, opened_at, closed_at, opened_by_name, closed_by_name, opening_cash, expected_cash, counted_cash, difference}]}`
  - `get_cash_shift_report(p_shift_id uuid) RETURNS jsonb` (= `cash_shift_report_json` sau khi kiểm quyền)
  - `set_require_cash_shift(p_store_id uuid, p_enabled boolean) RETURNS jsonb` → `{ok, require_cash_shift}`, kiểm `is_store_owner_or_admin`
- Produces (nội bộ, REVOKE client, GRANT `service_role`): `cash_shift_report_json(p_shift_id uuid) RETURNS jsonb` → `{id, store_id, status, opened_at, closed_at, opened_by_name, closed_by_name, opening_cash, open_note, close_note, cash_sales, bank_sales, cash_receipts, cash_payments, debt_cash, expected_cash, counted_cash, difference, bills_count, carried_days, continued_at, continued_by_name, entries}` (cùng dạng `entries` như trên, gồm cả phiếu đã huỷ). Plan C Part 2 Task 13 dùng hàm này cho `/print/agent`.

- [ ] **Step 1: Viết test thất bại**

```js
test('kết ca lệch: đếm 840k so với 850k dự kiến → difference −10000, lưu vào ca', async () => {
  const r = await as(ids.cashier, 'SELECT close_cash_shift($1, 840000, NULL) v', [shift])
  assert.deepEqual([r.expected_cash, r.difference, r.cash_receipts, r.cash_payments], [850000, -10000, 100000, 50000])
})
test('mỗi quán một ca mở: mở lần hai báo Đã có ca đang mở', ...)
test('công tắc tắt: open_cash_shift báo Quán chưa bật mở ca', ...)
test('tiền đầu ca, tiền đếm: NULL hoặc âm báo Số tiền không hợp lệ; 0 hợp lệ', ...)
test('ca mở không lộ số: get_open_cash_shift và get_cash_shift_report không có cash_sales, bank_sales, expected_cash, difference, bills_count (vắng hoặc null)', ...)
test('kết ca lặp cùng số đếm: already true, đúng kết quả cũ; khác số đếm: Ca đã đóng, không ghi đè', ...)
test('continue_stale_shift trên ca đã đóng: Ca đã đóng', ...)
test('stale: mở đúng day_from không stale, trước 1 giây thì stale; đổi giờ bắt đầu ngày thì tính lại', ...)
test('continue_stale_shift: ghi người, giờ, stale tắt; continued_at của ngày kinh doanh trước thì stale lại; ca không stale: already true', ...)
test('carried_days = 3 khi ca mở 3 ngày kinh doanh trước rồi continue; 1 khi chưa continue', ...)
test('tắt công tắc khi còn ca mở: Còn ca đang mở, kết ca trước khi tắt; bật/tắt ghi store_workflow_setting_events', ...)
test('set_require_cash_shift: quản lý, thu ngân bị chặn', ...)
test('list_cash_shifts: chủ quán và quản lý thấy mọi ca; thu ngân chỉ ca mình mở hoặc kết', ...)
test('get_cash_shift_report: thu ngân xem ca người khác bị chặn Không có quyền xem ca này; quản lý xem được', ...)
test('get_open_cash_shift: can_manage_entries true với chủ quán, quản lý; false với thu ngân', ...)
test('quyền: phục vụ và chủ quán quán khác bị chặn ở mọi RPC ca; anon không EXECUTE được', ...)
test('cash_shift_report_json: service_role EXECUTE được, authenticated không', ...)
test('khoá: close_cash_shift lấy FOR UPDATE trên ca trước khi gọi cash_shift_totals', ...) // kiểm tĩnh nguồn
test('snapshot cài đặt có require_cash_shift; neo store_workflow_snapshot khớp đúng 1 lần trong prod-defs/122', ...)
```

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `node --test supabase/tests/122_cash_shift_cashbook.test.mjs`
Expected: FAIL ở khối `122 ca`.

- [ ] **Step 3: Viết các RPC ca**

Giữ đúng hành vi plan B Task 5 cũ (đã duyệt), đổi phần tiền sang `cash_shift_totals` jsonb:
- `close_cash_shift`: khoá `FOR UPDATE` → không thấy `'Không tìm thấy ca'` → kiểm quyền → `p_counted_cash` NULL/âm `'Số tiền không hợp lệ'` → ca đã đóng: cùng số đếm trả bản đã lưu với `already: true` (số liệu đọc lại bằng `cash_shift_totals`, khớp vì phiếu và bill của ca đóng không đổi được), khác số raise `'Ca đã đóng'` → `cash_shift_totals` → ghi `closed_by, closed_at, counted_cash, expected_cash, difference, close_note, status`.
- Stale: `opened_at < day_from` của `current_business_date` và (`continued_at IS NULL` hoặc `continued_at < day_from`).
- `carried_days`: `continued_at IS NOT NULL` thì `business_date_of(store, COALESCE(closed_at, now())) − business_date_of(store, opened_at) + 1`, ngược lại 1.
- Tên người lấy như `get_bills_report`: `full_name`, rỗng thì `email`.
- Quyền xem mọi ca = `is_store_back_office`; thu ngân chỉ khi `opened_by` hoặc `closed_by` = `auth.uid()`.
- `set_require_cash_shift`: mẫu `set_business_day_start` (mig 111 dòng 130–171) — khoá dòng cài đặt, snapshot trước/sau, `changed_via`.

Vá `store_workflow_snapshot(uuid)` bằng `pg_temp.mevo_patch`, neo `'business_day_start', to_char(w.business_day_start, 'HH24:MI')` → chính nó + `,` + `'require_cash_shift', w.require_cash_shift`.

- [ ] **Step 4: Chạy test, phải PASS**

Run: lệnh Step 2. Expected: PASS khối `122 nền`, `122 ca`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/122_cash_shift_cashbook.sql supabase/tests/122_cash_shift_cashbook.test.mjs
git commit -m "feat: RPC mo, ket, gop ca va bao cao ca (mig 122)"
```

### Task 3: RPC sổ thu chi

**Files:**
- Modify: `supabase/migrations/122_cash_shift_cashbook.sql`
- Test: `supabase/tests/122_cash_shift_cashbook.test.mjs` (khối `describe('122 sổ')`)

**Interfaces:**
- Consumes: `cash_book_create_internal`, `cash_book_void_internal` (Task 1).
- Produces (RPC, GRANT authenticated):
  - `cash_book_create(p_kind text, p_method text, p_category_id uuid, p_amount bigint, p_note text, p_counterparty text, p_client_request_id uuid, p_source text DEFAULT 'manual') RETURNS jsonb` → `{ok, already, id, cash_shift_id, business_date}`. Quán suy từ danh mục. `p_source` chỉ nhận `manual | pos_drawer`.
  - `cash_book_void(p_id uuid, p_reason text) RETURNS jsonb` → `{ok, already}`
  - `cash_book_list(p_store_id uuid, p_from date, p_to date, p_filters jsonb DEFAULT '{}') RETURNS jsonb` → `{entries, totals, truncated}`; `p_filters` khoá `kind`, `method`, `category_id`; `entries`: `[{id, kind, method, category_id, category_name, report_group, amount, note, counterparty, business_date, created_at, created_by_name, cash_shift_id, shift_opened_at, source, source_ref, voided_at, voided_by_name, void_reason}]` mới nhất trước, tối đa 2000; `totals`: `{receipt_cash, receipt_bank, payment_cash, payment_bank}` chỉ phiếu chưa huỷ
  - `cash_book_save_category(p_store_id uuid, p_id uuid, p_kind text, p_name text, p_report_group text) RETURNS jsonb` → `{ok, id}` (`p_id` NULL = tạo mới)
  - `cash_book_set_category_active(p_id uuid, p_active boolean) RETURNS jsonb` → `{ok}`

- [ ] **Step 1: Viết test thất bại**

```js
test('thu ngân: phiếu chi TM pos_drawer được; CK bị chặn; nguồn manual bị chặn', async () => {
  await assert.rejects(create(ids.cashier, { method: 'bank', source: 'pos_drawer' }), /Thu ngân chỉ ghi thu\/chi tiền mặt ở két/)
  await assert.rejects(create(ids.cashier, { method: 'cash', source: 'manual' }), /Thu ngân chỉ ghi thu\/chi tiền mặt ở két/)
})
test('quản lý: ghi CK không cần ca; ghi TM khi bật ca không có ca báo Chưa mở ca', ...)
test('gửi lại cùng mã sau khi ca đã đóng: trả phiếu cũ already true, không báo Chưa mở ca', ...)
test('p_source inventory_receipt từ client bị chặn', ...)
test('huỷ: thu ngân bị chặn; quản lý huỷ được; phiếu inventory_receipt báo Phiếu chi của phiếu nhập kho, huỷ ở trang Kho', ...)
test('huỷ phiếu TM ca đã đóng: Ca của phiếu này đã kết, không huỷ được; phiếu CK huỷ được bất kỳ lúc nào', ...)
test('phiếu huỷ không vào két và không vào totals của cash_book_list', ...)
test('cash_book_list: lọc ngày theo business_date, kind, method, category_id; quán khác bị chặn; thu ngân chỉ thấy phiếu mình tạo', ...)
test('cash_book_list: khoảng ngày ngược hoặc dài hơn 366 ngày bị chặn', ...)
test('danh mục: tạo trùng tên (khác hoa thường) bị chặn; nhóm inventory_purchase bị chặn; nhóm sai loại bị chặn', ...)
test('danh mục hệ thống: đổi tên, ẩn đều bị chặn; danh mục thường đổi tên, ẩn, hiện lại được', ...)
test('danh mục: thu ngân, phục vụ bị chặn', ...)
test('khoá: cash_book_void khoá phiếu FOR UPDATE và ca FOR SHARE', ...) // kiểm tĩnh nguồn cash_book_void_internal
```

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `node --test supabase/tests/122_cash_shift_cashbook.test.mjs`
Expected: FAIL ở khối `122 sổ`.

- [ ] **Step 3: Viết các RPC sổ**

`cash_book_create`: thiếu mã `'Thiếu mã chống ghi trùng'`; đọc `store_id` của danh mục (không thấy `'Danh mục không hợp lệ'`); `is_store_back_office` thì mọi `method`; không phải nhưng `is_store_pos_operator` thì bắt `method='cash' AND p_source='pos_drawer'`; còn lại `'Không có quyền ghi sổ thu chi'`. Tra `(store_id, p_client_request_id)` trước: đã có thì `already = true`. Rồi gọi `cash_book_create_internal(..., p_actor := auth.uid())` (hàm này tự trả id cũ hoặc raise khi mã trùng khác nội dung).

`cash_book_void`: đọc phiếu → kiểm `is_store_back_office` (`'Chỉ chủ quán hoặc quản lý được huỷ phiếu'`) → `source = 'inventory_receipt'` raise `'Phiếu chi của phiếu nhập kho, huỷ ở trang Kho'` → `cash_book_void_internal`.

`cash_book_list`: `is_store_back_office` thấy cả quán; chỉ `is_store_pos_operator` thì thêm `created_by = auth.uid()`; còn lại `'Không có quyền xem sổ thu chi'`. `p_from > p_to` hoặc `p_to − p_from > 366`: `'Khoảng ngày không hợp lệ'`.

`cash_book_save_category`, `cash_book_set_category_active`: chỉ `is_store_back_office`; `is_system` không đổi tên/nhóm/ẩn (`'Danh mục hệ thống không sửa được'`); trùng tên `'Danh mục đã có'`.

- [ ] **Step 4: Chạy test, phải PASS**

Run: lệnh Step 2. Expected: PASS ba khối.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/122_cash_shift_cashbook.sql supabase/tests/122_cash_shift_cashbook.test.mjs
git commit -m "feat: RPC ghi, huy, xem so thu chi va danh muc (mig 122)"
```

### Task 4: Gác ba RPC thu tiền

**Files:**
- Modify: `supabase/migrations/122_cash_shift_cashbook.sql`
- Test: `supabase/tests/122_cash_shift_cashbook.test.mjs` (khối `describe('122 gác thu')`)

**Interfaces:**
- Consumes: `require_open_cash_shift`; ba RPC sau 112a+112b: `collect_table_bill(uuid[],jsonb,integer,uuid)`, `confirm_manual_payment(uuid)`, `kitchen_confirm_payment(uuid)`; helper `collect`, `confirm`, `kitchenConfirm` của `openCollectDb`.
- Produces: `bill_payments.cash_shift_id` có giá trị khi công tắc bật; lỗi `'Chưa mở ca'` khi bật mà không có ca.

Quy tắc neo (thay plan B Task 6):
1. Neo là **một dòng** `values (...)` của câu `insert into public.bill_payments` trong mỗi hàm, chép nguyên văn từ file 112a. Theo plan A Task 2, hai hàm đơn lẻ có dòng `    values (v_order.store_id, NULL, v_order.total_amount, auth.uid(), 'manual_order')` và `    values (v_order.store_id, NULL, v_order.total_amount, NULL, 'kitchen')`; dòng của `collect_table_bill` lấy theo file thật (cột `cash_shift_id` là chữ `NULL`, plan A Task 1 Step 7.9).
2. Bản thay đổi đúng chữ `NULL` ở vị trí `cash_shift_id` thành `public.require_open_cash_shift(<biến store của hàm>)`. Không thêm biến, không vá `DECLARE`.
3. Nếu dòng `values` không nằm gọn một dòng, hoặc câu INSERT đứng **trước** nhánh trả `already`/replay: dừng, báo controller (plan A phải sửa, không phải CA).

- [ ] **Step 1: Viết test thất bại**

```js
test('công tắc tắt: cả 3 RPC thu như cũ, cash_shift_id NULL', ...)
test('bật, không ca: collect báo Chưa mở ca; không có dòng bill_payments; phiên vẫn mở; payment_received_at NULL', ...)
test('bật, có ca: cash_shift_id = ca; kết ca thấy cash_sales đúng phần TM, bank_sales đúng phần CK của bill kết hợp', ...)
test('thu chuyển khoản cũng phải có ca', ...)
test('replay client_request_id sau khi ca đã đóng: trả kết quả cũ, không báo Chưa mở ca', ...)
test('confirm_manual_payment đơn đã thu: vẫn already, không báo Chưa mở ca', ...)
test('kitchen_confirm_payment không có auth.uid(): gác vẫn chạy', ...)
test('gộp bill N mâm: một bill_payments, một cash_shift_id', ...)
test('ca stale vẫn nhận tiền; thu ở ca mới không ăn vào ca cũ đã đóng', ...)
test('đơn lẻ 0đ không tạo khoản thu nên không bị gác (đúng hợp đồng plan A)', ...)
test('neo values của 3 hàm khớp đúng 1 lần trên pg_get_functiondef sau 112a+112b', ...)
```

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `node --test supabase/tests/122_cash_shift_cashbook.test.mjs`
Expected: FAIL ở khối `122 gác thu`.

- [ ] **Step 3: Thêm ba lời vá**

Theo quy tắc trên. Đầu file ghi chú: neo lấy từ 112a, controller phải đối chiếu prod trước khi áp.

- [ ] **Step 4: Chạy test, phải PASS**

Run: `node --test supabase/tests/122_cash_shift_cashbook.test.mjs supabase/tests/112a_collect_table_bill.test.mjs supabase/tests/112a_single_order_payment.test.mjs supabase/tests/112b_lock_old_paid_path.test.mjs supabase/tests/111_business_day.test.mjs`
Expected: PASS hết (test 112a/112b không nạp 122 nên không đổi).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/122_cash_shift_cashbook.sql supabase/tests/122_cash_shift_cashbook.test.mjs
git commit -m "feat: gac ca o collect_table_bill, confirm_manual_payment, kitchen_confirm_payment (mig 122)"
```

---

# Phần B: Web

### Task 5: Lớp TS cho ca + sổ, công tắc trong Cài đặt

**Files:**
- Create: `admin-web/lib/cash-shift.ts`, `cash-shift.test.ts`
- Create: `admin-web/lib/cash-book.ts`, `cash-book.test.ts`
- Create: `admin-web/lib/actions/cash-shift.ts`, `cash-shift.test.ts`
- Create: `admin-web/lib/actions/cash-book.ts`, `cash-book.test.ts`
- Create: `admin-web/lib/actions/cash-shift-reads.ts`, `cash-book-reads.ts`
- Modify: `admin-web/lib/pos-browser-reads.ts` (thêm cuối file)
- Create: `admin-web/app/admin/settings/cash-shift-setting.tsx`
- Modify: `admin-web/app/admin/settings/page.tsx` (cạnh `<BusinessDaySection …/>`)

**Interfaces:**
- Consumes: RPC Task 2, 3. Từ QL (116): `requireBackOfficeStoreId(): Promise<string>` và `requireAdminPageOrRedirect('back_office')` trong `lib/auth/operator.ts`, `isBackOfficeRole(role)` trong `lib/auth/roles.ts`. **Chưa có thì thêm** ba hàm này đúng chữ ký trên (back office = `store_owner | store_manager`) và báo controller (xem Vấn đề hợp đồng #6).
- Produces (`lib/cash-shift.ts`, thuần):
  - `type CashShiftEntry = { id: string; kind: 'receipt' | 'payment'; method: 'cash' | 'bank'; categoryName: string; amount: number; note: string | null; counterparty: string | null; source: CashBookSource; createdAt: string; createdByName: string | null; voidedAt: string | null }`
  - `type OpenCashShift = { id: string; openedAt: string; openedByName: string | null; openingCash: number; openNote: string | null; stale: boolean; entries: CashShiftEntry[] }`
  - `type CashShiftState = { required: boolean; canManageEntries: boolean; shift: OpenCashShift | null }`
  - `type CashShiftCloseResult = { shiftId: string; already: boolean; openingCash: number; cashSales: number; cashReceipts: number; cashPayments: number; debtCash: number; expectedCash: number; countedCash: number; difference: number }`
  - `type CashShiftListItem`, `type CashShiftReport` (camelCase của JSON Task 2; trường tiền của ca mở là `number | null`)
  - `parseCashShiftState(raw: unknown): CashShiftState`, `parseCashShiftList(raw: unknown): { required: boolean; shifts: CashShiftListItem[] }`, `parseCashShiftReport(raw: unknown): CashShiftReport | null`, `parseCashShiftCloseResult(raw: unknown): CashShiftCloseResult`
  - `parseShiftCash(text: string): number | null`, `differenceLabel(difference: number): string`
- Produces (`lib/cash-book.ts`, thuần):
  - `type CashBookSource = 'manual' | 'pos_drawer' | 'inventory_receipt'`, `type ReportGroup = 'operating_expense' | 'inventory_purchase' | 'owner_draw' | 'other_income' | 'cash_transfer'`
  - `type CashBookCategory = { id: string; kind: 'receipt' | 'payment'; name: string; reportGroup: ReportGroup; isSystem: boolean; isActive: boolean; requiresNote: boolean; sortOrder: number }`
  - `type CashBookEntry` (camelCase JSON Task 3), `type CashBookTotals = { receiptCash; receiptBank; paymentCash; paymentBank; receiptTotal; paymentTotal; net }` (ba trường cuối tính ở parse)
  - `type CashbookFilters = { from: string; to: string; kind: 'receipt' | 'payment' | null; method: 'cash' | 'bank' | null; categoryId: string | null }`
  - `REPORT_GROUP_LABEL: Record<ReportGroup, string>`, `userReportGroups(kind): ReportGroup[]`
  - `parseCashBookList(raw: unknown): { entries: CashBookEntry[]; totals: CashBookTotals; truncated: boolean }`, `parseCashBookCategories(rows: unknown): CashBookCategory[]`
  - `parseCashbookFilters(sp: Record<string, string | undefined>, today: string): CashbookFilters`, `filtersToSearch(f: CashbookFilters): string`, `filtersToRpc(f): Record<string, string>`
  - `groupByCategory(entries: CashShiftEntry[]): { kind; categoryName; total: number; count: number }[]` (bỏ phiếu đã huỷ; dùng cho phiếu bàn giao)
- Produces (`lib/actions/cash-shift.ts`, `'use server'`, trả `{ ok: true, ... } | { ok: false, error: string }`): `openCashShift({ openingCash, note })`, `closeCashShift({ shiftId, countedCash, note })` kèm `result: CashShiftCloseResult`, `continueStaleShift(shiftId)`, `saveRequireCashShift(enabled)`.
- Produces (`lib/actions/cash-book.ts`, `'use server'`): `createCashBookEntry({ kind, method, categoryId, amount, note, counterparty, source: 'manual' | 'pos_drawer', clientRequestId })` kèm `{ id, already }`; `voidCashBookEntry({ id, reason })`; `saveCashBookCategory({ id: string | null; kind; name; reportGroup })`; `setCashBookCategoryActive({ id, active })`.
- Produces (đọc cho server component, không `'use server'`): `loadCashShiftList(storeId)`, `loadCashShiftReport(shiftId)`, `loadCashShiftRequired(storeId): Promise<boolean>`, `loadCashBookList(storeId, filters: CashbookFilters)`, `loadCashBookCategories(storeId)`.
- Produces (`lib/pos-browser-reads.ts`): `readCashShiftState(client, storeId)`, `readCashShiftReport(client, shiftId)`, `readCashBookCategories(client, storeId)` — mỗi hàm trả `{ ok: true; ... } | { ok: false; error: string }`.

- [ ] **Step 1: Viết test thất bại**

```ts
describe('parseShiftCash', () => {
  it('kiểu Việt Nam', () => {
    expect(parseShiftCash('500.000')).toBe(500000)
    expect(parseShiftCash('500k')).toBe(500000)
    expect(parseShiftCash('1.000.000đ')).toBe(1000000)
  })
  it('0 hợp lệ, rỗng và chữ không', () => {
    expect(parseShiftCash('0')).toBe(0)
    for (const s of ['', '   ', 'abc']) expect(parseShiftCash(s)).toBeNull()
  })
  it('vượt 2.000.000.000 bị chặn', () => expect(parseShiftCash('3000000000')).toBeNull())
})
it('differenceLabel', () => {
  expect(differenceLabel(0)).toBe('Khớp')
  expect(differenceLabel(-50000)).toBe('Thiếu 50.000đ')
  expect(differenceLabel(20000)).toBe('Thừa 20.000đ')
})
it('parseCashShiftState: rác, null, mảng đều ra required false, shift null', ...)
it('parseCashShiftReport: ca mở giữ null, không ép về 0', ...)
it('parseCashBookList: totals tính receiptTotal, paymentTotal, net = thu − chi', ...)
it('parseCashbookFilters: mặc định hôm nay; to tương lai kẹp về hôm nay; from > to đổi chỗ; khoảng > 92 ngày cắt from; kind/method lạ bỏ qua', ...)
it('filtersToSearch rồi parse lại ra đúng bộ lọc', ...)
it('userReportGroups: chi không có inventory_purchase; thu chỉ other_income, cash_transfer', ...)
it('groupByCategory: gom theo loại + danh mục, bỏ phiếu đã huỷ', ...)
```

Test action (mock `@/lib/supabase/server` như `lib/actions/business-day.test.ts`): lỗi quyền trả `{ ok: false }`; RPC lỗi trả nguyên message; số âm hoặc `NaN` không gọi RPC; `createCashBookEntry` thiếu `clientRequestId` không gọi RPC; `saveRequireCashShift` gọi `revalidatePath('/admin', 'layout')`.

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `cd admin-web; npx vitest run lib/cash-shift.test.ts lib/cash-book.test.ts lib/actions/cash-shift.test.ts lib/actions/cash-book.test.ts`
Expected: FAIL.

- [ ] **Step 3: Viết các file lib + action + đọc**

`parseShiftCash` gọi `parseVnd` của `lib/cash-change.ts`, chặn trên `2_000_000_000`. Action ca dùng `requirePosOperatorStoreId` (QL đã cho nhận `store_manager`), `saveRequireCashShift` dùng `requireStoreOwnerStoreId`; action sổ dùng `requirePosOperatorStoreId` cho tạo phiếu (RPC tự phân quyền), `requireBackOfficeStoreId` cho huỷ và danh mục. `readCashBookCategories` đọc thẳng bảng `cash_book_categories` (RLS cho phép) lọc `store_id`, `is_active`, sắp `kind, sort_order`.

- [ ] **Step 4: Viết `cash-shift-setting.tsx`, gắn vào `page.tsx`**

`Switch` nhãn `Bắt buộc mở ca trước khi thu tiền`, gợi ý `Bật thì thu ngân phải mở ca mới thu được tiền. Cuối ca đếm két và in phiếu bàn giao.` Lưu ngay khi gạt; lỗi thì trả công tắc về cũ và hiện lỗi. Giá trị đầu đọc bằng `loadCashShiftRequired(storeId)` trong `Promise.all` của `page.tsx`.

- [ ] **Step 5: Chạy test, phải PASS**

Run: `cd admin-web; npm test; npx tsc --noEmit; npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add admin-web/lib admin-web/app/admin/settings
git commit -m "feat: lop TS cho ca va so thu chi, cong tac bat buoc mo ca"
```

### Task 6: Ca + Thu/Chi két trên POS

**Files:**
- Create: `admin-web/app/admin/pos/use-cash-shift.ts`
- Create: `admin-web/app/admin/pos/shift-controls.tsx`, `cash-drawer-dialog.tsx`, `shift-controls.test.tsx`
- Modify: `admin-web/app/admin/pos/pos-client.tsx` (sau `<PosLockButton />`; trước khối `{mergeMode && (`)

**Interfaces:**
- Consumes: `readCashShiftState`, `readCashBookCategories`, action Task 5, `ConfirmDialog`, `Dialog`, `printDocument({ kind: 'shift_report', shiftId })` của `lib/print/print-document.ts` (đã có; `AGENT_KINDS` chưa có `shift_report` nên tự rơi về in trình duyệt).
- Produces: `useCashShift(storeId: string): { state: CashShiftState | null; reload: () => void }`; `<ShiftControls state reload openTablesCount storeId />`; `<ShiftStaleBanner state onCloseOld onContinue />`; `<CashDrawerDialog open onClose categories onSaved />`.

Không sửa `PaymentView`: lỗi `Chưa mở ca` đi đường báo lỗi có sẵn.

- [ ] **Step 1: Viết test thất bại**

`renderToStaticMarkup`, các phần vẽ tách thành component nhận props:

```ts
it('required false: không vẽ gì, kể cả nút Thu/Chi két', ...)
it('chưa có ca: nút Mở ca; nút Thu/Chi két khoá kèm gợi ý Mở ca trước', ...)
it('có ca: nút Ca thu ngân · từ HH:MM và nút Thu/Chi két', ...)
it('panel ca: phiếu thu TM hiện +, phiếu chi TM hiện −, phiếu huỷ gạch ngang; nút Huỷ chỉ khi canManageEntries', ...)
it('form kết ca không chứa số dự kiến trước khi xác nhận', ...)
it('kết quả: dự kiến, đếm được, Thiếu 50.000đ, dòng Phiếu thu / Phiếu chi', ...)
it('còn 3 bàn mở: Còn 3 bàn đang mở. Tiền thu sau khi kết sẽ vào ca kế tiếp.', ...)
it('banner stale có đủ hai lựa chọn', ...)
it('hộp Thu/Chi: đổi Thu ↔ Chi thì danh sách danh mục đổi theo loại; danh mục cần ghi chú mà ghi chú trống thì nút khoá', ...)
it('hộp Thu/Chi: ô tiền rỗng khoá nút; 80.000 ra 80000', ...)
```

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `cd admin-web; npx vitest run app/admin/pos/shift-controls.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Viết `use-cash-shift.ts`**

Đọc khi mount, mỗi 15 giây, khi `focus`, theo mẫu `use-service-requests.ts`. Lỗi đọc thì giữ `state` cũ. RPC chưa có (Vercel lên trước migration) thì `state` null và POS như hôm nay.

- [ ] **Step 4: Viết `shift-controls.tsx`, `cash-drawer-dialog.tsx`**

Giữ hành vi plan B Task 8 cũ (nút trên thanh trên, hộp mở ca tự bật một lần mỗi lần vào POS, panel ca `Dialog placement="side"`, hộp kết ca `dismissible={false}`, kết quả giữ ở state riêng, mất mạng giữ số đã nhập, banner stale), với hai thay đổi:
- Nút `Chi tiền từ két` đổi thành **`Thu/Chi két`**, đặt cạnh nút ca trên thanh trên và trong panel ca. Mở `CashDrawerDialog`.
- Danh sách trong panel là `state.shift.entries` (cả thu lẫn chi), huỷ qua `ConfirmDialog` có ô lý do bắt buộc, gọi `voidCashBookEntry`.

`CashDrawerDialog`: hai nút chọn `Thu` / `Chi` (mặc định Chi), ô `Số tiền` (`parseVnd`), chọn danh mục (lọc theo loại, `isActive`), ô `Ghi chú` (bắt buộc khi `requiresNote`). Luôn `method: 'cash'`, `source: 'pos_drawer'`. `clientRequestId = crypto.randomUUID()` sinh **khi mở hộp** và giữ nguyên qua các lần bấm lại; lưu xong thì `reload()` và đóng. Vẽ form có điều kiện để mở lại là form trống (con của `<Dialog>` sống khi đóng).

- [ ] **Step 5: Gắn vào `pos-client.tsx`**

Sau `<PosLockButton />` thêm `<ShiftControls … />`. Trước `{mergeMode && (` thêm `<ShiftStaleBanner … />`. `openTablesCount` = `openSessions.reduce((n, s) => n + s.tables.length, 0)` (biến `openSessions` đã có). Nhãn nút không ghi trơn "Ca": pill giờ phục vụ đang dùng "Ca 17:00–23:00".

- [ ] **Step 6: Chạy test, phải PASS**

Run: `cd admin-web; npm test; npx tsc --noEmit; npx eslint app/admin/pos`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add admin-web/app/admin/pos
git commit -m "feat: mo ca, thu chi ket, ket ca tren POS"
```

### Task 7: Phiếu bàn giao 80mm

**Files:**
- Create: `admin-web/app/print/shift-report/page.tsx`, `shift-report-slip.tsx`, `shift-report-slip.test.tsx`

**Interfaces:**
- Consumes: `loadCashShiftReport`, `CashShiftReport`, `differenceLabel`, `groupByCategory`.
- Produces: URL `/print/shift-report?id=<shiftId>`; `<ShiftReportSlip report storeName printedAt printedBy />` nhận props thuần (plan C Part 2 Task 13 dùng lại với `cash_shift_report_json`).

- [ ] **Step 1: Viết test thất bại**

```ts
it('đủ dòng: người mở, người kết, giờ mở, giờ đóng, tiền đầu ca, tiền mặt thu bill, phiếu thu TM, phiếu chi TM, tiền dự kiến, tiền đếm được, chênh lệch, số bill, tổng TM, tổng CK, ghi chú', ...)
it('dòng Khách trả nợ (TM) chỉ hiện khi debtCash > 0', ...)
it('phiếu thu / chi gom theo danh mục kèm số phiếu, bỏ phiếu đã huỷ', ...)
it('giờ in theo giờ VN', ...)
it('carriedDays 3: có dòng Ca gộp qua 3 ngày; 1: không có', ...)
```

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `cd admin-web; npx vitest run app/print/shift-report`
Expected: FAIL.

- [ ] **Step 3: Viết slip và page**

Slip theo mẫu `app/print/day-report/day-report-slip.tsx` (CSS 80mm, `useAutoPrint`, nút In lại, khối ký hai bên Người giao / Người nhận), tiêu đề `PHIẾU BÀN GIAO CA`. Page theo mẫu `app/print/day-report/page.tsx`, ngoài khung `/admin`: `requireAdminPageOrRedirect('pos')`; thiếu `id` hoặc RPC lỗi thì hiện lỗi; `status = 'open'` thì hiện `Ca chưa kết, chưa có phiếu bàn giao`, không tự in.

- [ ] **Step 4: Chạy test, phải PASS**

Run: `cd admin-web; npx vitest run app/print; npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add admin-web/app/print/shift-report
git commit -m "feat: phieu ban giao ca 80mm"
```

### Task 8: Tab Ca trong Hoá đơn & Báo cáo

**Files:**
- Create: `admin-web/app/admin/bills/bills-tabs.tsx`, `shifts-panel.tsx`, `shifts-panel.test.tsx`
- Modify: `admin-web/app/admin/bills/bills-screen.tsx` (`Promise.all` gọi `loadBillsReport`; chỗ render `<BillsReportView …/>`)

**Interfaces:**
- Consumes: `loadCashShiftList`, `readCashShiftReport`, `CashShiftListItem`, `differenceLabel`, `printDocument`.
- Produces: `<BillsTabs showShifts shifts>{children}</BillsTabs>`.

Giữ nguyên plan B Task 10 cũ: tab giữ bằng state client (không URL, vì `@modal/(.)bills` bắt điều hướng mềm), `Tabs` variant `underline`, `showShifts = list.required || list.shifts.length > 0`, bảng 60 ca gần nhất (ghi rõ ở chân bảng), bấm ca mở `Dialog placement="side"` đọc `readCashShiftReport` một lần, `In lại phiếu` chỉ khi ca đã đóng. Chi tiết ca hiện thêm danh sách phiếu thu/chi TM của ca. `loadCashShiftList` lỗi thì coi như `{ required: false, shifts: [] }` để tab không làm hỏng báo cáo.

- [ ] **Step 1: Viết test thất bại**

```ts
it('showShifts false: chỉ render children, không có thanh tab', ...)
it('danh sách: người mở, giờ, tiền đầu ca, chênh lệch bằng differenceLabel', ...)
it('ca đang mở: nhãn Đang mở, không hiện dự kiến và chênh lệch', ...)
it('trống: Chưa có ca nào', ...)
```

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `cd admin-web; npx vitest run app/admin/bills/shifts-panel.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Viết `bills-tabs.tsx`, `shifts-panel.tsx`, gắn vào `bills-screen.tsx`**

- [ ] **Step 4: Chạy test, phải PASS**

Run: `cd admin-web; npm test; npx tsc --noEmit; npx eslint app/admin/bills`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add admin-web/app/admin/bills
git commit -m "feat: tab Ca trong Hoa don va Bao cao"
```

### Task 9: Trang Sổ thu chi `/admin/cashbook`

**Files:**
- Create: `admin-web/app/admin/cashbook/page.tsx`, `cashbook-screen.tsx`, `cashbook-view.tsx`, `entry-form-dialog.tsx`, `categories-dialog.tsx`, `cashbook-view.test.tsx`
- Create: `admin-web/app/admin/@modal/(config)/(.)cashbook/page.tsx`
- Modify: `admin-web/app/admin/admin-nav.tsx`, `admin-nav.test.tsx`
- Modify: `admin-web/app/admin/config-dialog.tsx` (`CONFIG_TABS`), `config-dialog.test.ts`

**Interfaces:**
- Consumes: `loadCashBookList`, `loadCashBookCategories`, `parseCashbookFilters`, `filtersToSearch`, `REPORT_GROUP_LABEL`, `userReportGroups`, action sổ (Task 5); `requireAdminPageOrRedirect('back_office')`; `businessToday` + `loadBusinessDayStart` (mig 111, `lib/daily-report.ts`, `lib/actions/bills-report.ts`).
- Produces: `CashbookScreen({ searchParams, inModal })` (server); `<CashbookView list categories filters today inModal />` (client).

- [ ] **Step 1: Viết test thất bại**

```ts
it('ô tổng: Tổng thu, Tổng chi, Chênh lệch, mỗi ô tách TM / CK', ...)
it('phiếu đã huỷ: gạch ngang, có lý do huỷ, không có nút Huỷ', ...)
it('phiếu nguồn kho: nhãn Phiếu nhập kho, không có nút Huỷ, có chữ Huỷ ở trang Kho', ...)
it('trống: Chưa có phiếu nào trong khoảng này', ...)
it('truncated: báo Chỉ hiện 2000 phiếu mới nhất, thu hẹp bộ lọc', ...)
it('form: Phiếu chi mặc định Tiền mặt; danh mục cần ghi chú thì ô ghi chú bắt buộc', ...)
it('danh mục: dòng hệ thống không có nút Đổi tên / Ẩn; chọn nhóm không có Nhập hàng', ...)
it('rail chủ quán có Thu chi sau Báo cáo; thu ngân không có', ...) // admin-nav.test.tsx
it('CONFIG_TABS có /admin/cashbook, không thuộc nhóm Cài đặt', ...) // config-dialog.test.ts
```

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `cd admin-web; npx vitest run app/admin/cashbook app/admin/admin-nav.test.tsx app/admin/config-dialog.test.ts`
Expected: FAIL.

- [ ] **Step 3: Viết trang**

- `page.tsx` + bản intercept `(.)cashbook/page.tsx` theo đúng mẫu cặp `bills/page.tsx` + `@modal/(config)/(.)bills/page.tsx`. `searchParams: Promise<{ from?, to?, kind?, method?, category? }>`.
- `cashbook-screen.tsx`: `requireAdminPageOrRedirect('back_office')`; `today = businessToday(await loadBusinessDayStart(storeId))`; `parseCashbookFilters`; `Promise.all([loadCashBookList, loadCashBookCategories])`; lỗi thì `ErrorState`.
- `cashbook-view.tsx`: hàng lọc (hai ô ngày `max=today`, chip Tất cả/Thu/Chi, chip Tất cả/Tiền mặt/Chuyển khoản, chọn danh mục); đổi lọc theo cách `report-date-picker.tsx`: trong hộp thoại `router.replace('?' + filtersToSearch(f))`, trang đầy đủ `window.location.replace(...)`. Ba ô tổng. Danh sách: bảng từ `md`, thẻ dưới `md` (đọc tốt ở 375px). Nút `+ Phiếu thu`, `+ Phiếu chi`, `Danh mục`, `Xuất Excel` (link `/admin/cashbook/export?` + `filtersToSearch`, Task 10).
- `entry-form-dialog.tsx`: loại cố định theo nút; `Tiền mặt` / `Chuyển khoản`; `Số tiền`; danh mục; `Người nộp / Người nhận` (tuỳ chọn); `Ghi chú`. Ngày luôn là hôm nay, không có ô ngày. `clientRequestId` sinh khi mở, giữ qua lần bấm lại; `source: 'manual'`. Lưu xong `router.refresh()`.
- Huỷ phiếu: `ConfirmDialog` có ô lý do bắt buộc → `voidCashBookEntry`.
- `categories-dialog.tsx`: hai nhóm Chi / Thu; thêm (tên + nhóm báo cáo từ `userReportGroups(kind)`, mặc định `operating_expense` / `other_income`), đổi tên, ẩn / hiện; dòng hệ thống có nhãn `Hệ thống`, không có nút.
- Rail (`adminRailItems`): thêm `{ href: '/admin/cashbook', label: 'Thu chi', icon: <Wallet /> }` sau `Báo cáo` cho nhánh chủ quán và nhánh `store_manager` (QL dựng nhánh này; nếu QL đã thêm sẵn mục Thu chi thì giữ của QL, không thêm đôi). Nhánh thu ngân không thêm.
- `CONFIG_TABS`: thêm `{ href: '/admin/cashbook', label: 'Sổ thu chi', icon: <Wallet /> }` sau mục `/admin/bills`, không có cờ `settings`.

- [ ] **Step 4: Chạy test, phải PASS**

Run: `cd admin-web; npm test; npx tsc --noEmit; npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add admin-web/app/admin/cashbook "admin-web/app/admin/@modal/(config)/(.)cashbook" admin-web/app/admin/admin-nav.tsx admin-web/app/admin/admin-nav.test.tsx admin-web/app/admin/config-dialog.tsx admin-web/app/admin/config-dialog.test.ts
git commit -m "feat: trang So thu chi /admin/cashbook"
```

### Task 10: Xuất Excel sổ thu chi

**Files:**
- Create: `admin-web/lib/cashbook-xlsx.ts`, `cashbook-xlsx.test.ts`
- Create: `admin-web/app/admin/cashbook/export/route.ts`

**Interfaces:**
- Consumes: `parseCashbookFilters`, `loadCashBookList`, `REPORT_GROUP_LABEL`, mẫu `lib/bills-report-xlsx.ts` + `app/admin/bills/export/route.ts`.
- Produces: `buildCashbookWorkbook(list, meta: { storeName: string; filters: CashbookFilters; exportedAt: Date; exportedBy: string }): ExcelJS.Workbook`, `cashbookWorkbookFileName(storeName: string, from: string, to: string): string`; `GET /admin/cashbook/export?from&to&kind&method&category`.

- [ ] **Step 1: Viết test thất bại**

```ts
it('sheet Phiếu: cột Ngày KD, Giờ, Loại, Danh mục, Nhóm báo cáo, Số tiền, Phương thức, Người nộp/nhận, Ghi chú, Người ghi, Ca, Nguồn, Trạng thái', ...)
it('phiếu huỷ có Trạng thái Đã huỷ: <lý do>, vẫn có dòng', ...)
it('sheet Tổng: thu TM, thu CK, chi TM, chi CK, chênh lệch — bằng totals của server, không cộng lại ở TS', ...)
it('Số tiền là số (không phải chuỗi), định dạng #,##0', ...)
it('tên file không dấu: so-thu-chi_<slug quán>_<from>_<to>.xlsx', ...)
```

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `cd admin-web; npx vitest run lib/cashbook-xlsx.test.ts`
Expected: FAIL.

- [ ] **Step 3: Viết `cashbook-xlsx.ts` và route**

Route: `requireOperator`, không phải chủ quán / quản lý thì 403; bộ lọc qua `parseCashbookFilters` (cùng kẹp ngày với trang); `Cache-Control: no-store`. Tên quán đọc theo `operator.storeId`, không nhận `store_id` từ URL.

- [ ] **Step 4: Chạy test, phải PASS**

Run: `cd admin-web; npm test; npx tsc --noEmit; npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add admin-web/lib/cashbook-xlsx.ts admin-web/lib/cashbook-xlsx.test.ts admin-web/app/admin/cashbook/export
git commit -m "feat: xuat Excel so thu chi"
```

---

# Phần C: Migration 122b — nối phiếu nhập kho với sổ thu chi

### Task 11: Phiếu nhập đã trả tạo phiếu chi trong cùng giao dịch

**Bắt đầu khi:** KHO (mig 118) đã gộp vào nhánh tích hợp. Mở `supabase/migrations/118_*.sql` và kiểm đủ các điều ở "Yêu cầu với plan KHO" bên dưới; thiếu điều nào thì dừng, báo controller.

**Yêu cầu với plan KHO (mig 118) — ghi vào plan `2026-11-09-yg-kho.md`:**
1. `inventory_documents` có `paid_method text NULL CHECK (paid_method IN ('cash','bank'))`, và CHECK `kind <> 'receipt' OR (paid_status = 'paid') = (paid_method IS NOT NULL)`.
2. `inventory_documents.cash_book_entry_id uuid NULL`, **không** FK (122b thêm).
3. Trong `inventory_post_document`, có một biến `v_doc_id uuid` giữ id phiếu vừa lưu, và **đúng một** dòng sau, đứng một mình (thụt 2 dấu cách), nằm SAU khi đã chèn phiếu + mọi dòng và SAU nhánh replay `client_request_id` (replay không đi qua dòng này):
   ```
     -- mevo-anchor:122b inventory_post_document.cash_book(v_doc_id)
   ```
4. Trong `inventory_void_document`, có biến `v_doc_id uuid` = `p_id`, và đúng một dòng sau, nằm SAU kiểm quyền và nhánh "phiếu đã huỷ → already", TRƯỚC `RETURN` cuối:
   ```
     -- mevo-anchor:122b inventory_void_document.cash_book(v_doc_id)
   ```
5. Hai hàm bọc trong cùng một giao dịch của RPC (không `EXCEPTION WHEN OTHERS` nuốt lỗi quanh dòng neo), để lỗi `Chưa mở ca` / `Ca … đã kết` huỷ cả phiếu.

**Files:**
- Create: `supabase/migrations/122b_inventory_cashbook.sql`
- Test: `supabase/tests/122b_inventory_cashbook.test.mjs`

**Interfaces:**
- Consumes: `cash_book_create_internal`, `cash_book_void_internal`, `cash_book_system_category` (Task 1); `inventory_post_document(p_kind, p_doc jsonb, p_lines jsonb, p_client_request_id uuid)`, `inventory_void_document(p_id uuid, p_reason text)` (mig 118); `openCashShiftDb({ through: '122b' })`.
- Produces (nội bộ, REVOKE client): `inventory_receipt_cash_book(p_doc_id uuid) RETURNS uuid`, `inventory_receipt_cash_book_void(p_doc_id uuid, p_reason text) RETURNS void`. FK `inventory_documents.cash_book_entry_id → cash_book_entries(id)`.

- [ ] **Step 1: Viết test thất bại**

```js
test('phiếu nhập đã trả CK 1.200.000: một phiếu chi Nhập hàng, source inventory_receipt, source_ref = phiếu, cash_shift_id NULL', async () => {
  const doc = await postReceipt({ paid: 'bank', lines: [[beer, 24, 50000]] })
  const e = await one('SELECT * FROM cash_book_entries WHERE source_ref = $1', [doc])
  assert.deepEqual([e.kind, e.method, Number(e.amount), e.source, e.cash_shift_id], ['payment', 'bank', 1200000, 'inventory_receipt', null])
  assert.equal(e.category_id, await systemCategory(ids.store))
  assert.equal((await one('SELECT cash_book_entry_id FROM inventory_documents WHERE id = $1', [doc])).cash_book_entry_id, e.id)
})
test('đã trả TM khi bật ca có ca: phiếu chi gắn ca, két giảm đúng', ...)
test('đã trả TM khi bật ca không có ca: lỗi Chưa mở ca, KHÔNG có phiếu nhập, không có phiếu chi', ...)
test('chưa trả: không có phiếu chi; phiếu kiểm và phiếu xuất huỷ: không có phiếu chi', ...)
test('gửi lại cùng client_request_id: một phiếu nhập, một phiếu chi', ...)
test('huỷ phiếu nhập đã trả: phiếu chi bị huỷ cùng, lý do có số phiếu nhập', ...)
test('huỷ phiếu nhập TM sau khi ca đã kết: lỗi, phiếu nhập vẫn posted, phiếu chi còn hiệu lực', ...)
test('cash_book_void trực tiếp phiếu chi nguồn kho: bị chặn (Task 3), phiếu nhập không đổi', ...)
test('backfill: phiếu nhập đã trả có từ trước 122b được tạo phiếu chi theo doc_date, cash_shift_id NULL; phiếu đã huỷ và chưa trả bỏ qua; chạy hai lần không nhân đôi', ...)
test('hai neo khớp đúng 1 lần trong pg_get_functiondef sau mig 118', ...)
test('hai hàm nội bộ: authenticated không EXECUTE được', ...)
```

Test backfill: nạp 118, chèn phiếu nhập `posted` + `paid` thẳng bằng SQL, rồi mới nạp 122b. "Chạy hai lần": test cắt đoạn giữa hai dòng `-- backfill-start` / `-- backfill-end` trong file 122b và `exec` lại, số phiếu chi không đổi. Hàm nhỏ trong file test: `postReceipt({ paid: 'cash' | 'bank' | null, lines })` gọi `inventory_post_document` dưới `ids.manager`, `systemCategory(storeId)`.

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `node --test supabase/tests/122b_inventory_cashbook.test.mjs`
Expected: FAIL vì chưa có file migration.

- [ ] **Step 3: Viết `122b_inventory_cashbook.sql`**

Thứ tự: `DO $pre$` (dừng nếu thiếu `inventory_post_document`, `inventory_void_document`, cột `paid_method`, `cash_book_entry_id`, hoặc `cash_book_create_internal`) → hai hàm nội bộ → helper `pg_temp.mevo_patch` (nhãn `mig 122b`) → hai lời vá → FK → backfill → REVOKE → `NOTIFY`.

`inventory_receipt_cash_book(p_doc_id)`: khoá phiếu `FOR UPDATE`; không phải `kind='receipt'`, không `posted`, không `paid`, `total_amount <= 0`, hoặc đã có `cash_book_entry_id` thì trả `cash_book_entry_id` hiện có (có thể NULL). Ngược lại gọi `cash_book_create_internal(store_id, 'payment', paid_method, cash_book_system_category(store_id, 'inventory_purchase'), total_amount, 'Phiếu nhập ' || doc_no, supplier_name, 'inventory_receipt', p_doc_id, created_by, p_doc_id)` — `client_request_id` = id phiếu nên gọi lại không nhân đôi; ghi id vào `cash_book_entry_id`.

`inventory_receipt_cash_book_void(p_doc_id, p_reason)`: phiếu có `cash_book_entry_id` thì `cash_book_void_internal(entry, 'Huỷ phiếu nhập ' || doc_no || ': ' || btrim(p_reason), auth.uid())`. Lỗi của hàm đó để nguyên (huỷ cả giao dịch).

Lời vá (thay dòng neo bằng chính nó + dòng gọi):

| Hàm | Neo | Thêm dòng ngay sau |
|---|---|---|
| `inventory_post_document(text,jsonb,jsonb,uuid)` | `  -- mevo-anchor:122b inventory_post_document.cash_book(v_doc_id)` | `  PERFORM public.inventory_receipt_cash_book(v_doc_id);` |
| `inventory_void_document(uuid,text)` | `  -- mevo-anchor:122b inventory_void_document.cash_book(v_doc_id)` | `  PERFORM public.inventory_receipt_cash_book_void(v_doc_id, p_reason);` |

Chữ ký regprocedure lấy theo file 118 thật; khác bảng trên thì theo file 118 và ghi chú lại.

Backfill (giữa hai dòng `-- backfill-start` / `-- backfill-end`): `INSERT INTO cash_book_entries` cho phiếu `kind='receipt' AND status='posted' AND paid_status='paid' AND total_amount > 0 AND cash_book_entry_id IS NULL`, với `business_date = doc_date`, `cash_shift_id = NULL`, `client_request_id = id phiếu`, `created_by`, `created_at` của phiếu, `ON CONFLICT (store_id, client_request_id) DO NOTHING`; rồi `UPDATE inventory_documents SET cash_book_entry_id` theo `source_ref`. `RAISE NOTICE 'mig 122b: backfill % phiếu chi'`. Không gọi `cash_book_create_internal` cho backfill vì hàm đó gắn ngày hôm nay và đòi ca mở.

- [ ] **Step 4: Chạy test, phải PASS**

Run: `node --test supabase/tests/122b_inventory_cashbook.test.mjs supabase/tests/122_cash_shift_cashbook.test.mjs supabase/tests/118_*.test.mjs`
Expected: PASS hết.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/122b_inventory_cashbook.sql supabase/tests/122b_inventory_cashbook.test.mjs supabase/tests/helpers/cash-shift-db.mjs
git commit -m "feat: phieu nhap kho da tra tu tao phieu chi (mig 122b)"
```

---

# Phần D: Checklist

### Task 12: Checklist test tay, TESTING.md, CLAUDE.md

**Files:**
- Create: `docs/testing/yen-garden/THU-CHI.md`
- Create: `docs/testing/yen-garden/sql/thu-chi-verify.sql`
- Modify: `TESTING.md`, `CLAUDE.md`

- [ ] **Step 1: Viết `thu-chi-verify.sql`**

Theo mẫu `docs/testing/chuyen-ban-giam-gia/sql/gg-verify.sql`: một transaction, cuối `ROLLBACK`, `RAISE EXCEPTION 'FAIL …'` khi lệch. Kiểm trên dữ liệu thật: mọi ca đã đóng có `expected_cash` = `cash_shift_totals(id)->>'expected_cash'`; không phiếu TM nào của quán bật ca thiếu `cash_shift_id`; mọi phiếu nhập `paid` có `cash_book_entry_id`; mọi quán có danh mục hệ thống Nhập hàng.

- [ ] **Step 2: Viết `THU-CHI.md`**

Test trên quán thử (không phải Yên Garden thật), ngoài giờ mở cửa, món rẻ nhất. Các bài:
1. Công tắc tắt: POS, A04 như trước, không có nút Thu/Chi két.
2. Bật công tắc: POS hiện hộp mở ca, đóng được, xem POS bình thường; Thu/Chi két khoá kèm `Mở ca trước`.
3. Chưa mở ca: thu tiền báo `Chưa mở ca` ở POS, `/staff/tables`, ngăn A04; bàn không bị đóng dở.
4. Mở ca 500.000; thu 1 bill tiền mặt, 1 bill chuyển khoản, 1 bill kết hợp.
5. Thu/Chi két: một phiếu chi Đá 50.000, một phiếu thu Nộp thêm vào két 100.000, một phiếu Khác không ghi chú (bị chặn).
6. Đăng nhập Quản lý: huỷ phiếu chi Đá trên POS; thu ngân không thấy nút Huỷ.
7. Kết ca đếm khớp: `Khớp`, không thấy số dự kiến trước khi xác nhận; phiếu bàn giao có dòng phiếu thu / chi theo danh mục.
8. Mở ca mới, kết ca lệch: `Thiếu …`, in phiếu đủ dòng.
9. Kết ca khi còn bàn mở: có cảnh báo; thu bàn đó ở ca kế tiếp.
10. Tắt công tắc khi còn ca mở: bị từ chối.
11. Ca quên kết: `UPDATE` lùi `opened_at` trên quán thử; cảnh báo hiện; Tiếp tục thì phiếu ghi `Ca gộp qua N ngày`; hoặc Kết ca cũ rồi mở ca mới.
12. Tab Ca: chủ quán, quản lý thấy mọi ca; thu ngân chỉ ca của mình; gõ tay URL phiếu ca người khác bị chặn.
13. Trang Thu chi (Quản lý): ghi phiếu chi CK Điện nước khi không có ca (được); ghi phiếu TM khi không có ca (báo `Chưa mở ca`); lọc theo ngày / loại / phương thức / danh mục; ô tổng khớp; Xuất Excel mở được, số khớp màn hình.
14. Danh mục: thêm "Rác thải" (chi phí hoạt động), đổi tên, ẩn; Nhập hàng không sửa được.
15. Trên điện thoại 375px: trang Thu chi đọc được, không cuộn ngang.
16. Kho: nhập hàng đã trả CK → trang Thu chi có phiếu chi Nhập hàng; huỷ phiếu nhập → phiếu chi gạch ngang; nhập hàng trả TM khi chưa mở ca → báo lỗi, không có phiếu nhập.
17. Gõ tay `/admin/cashbook` bằng tài khoản thu ngân: bị đưa về POS.

- [ ] **Step 3: Thêm link `TESTING.md`, dòng quyết định `CLAUDE.md`, commit**

Dòng `CLAUDE.md` ghi: mig 122 thay 113 (dùng `is_store_back_office` của 116); sổ thu chi thay khoản chi trong ca; công thức két; `cash_shift_totals` trả jsonb, neo `mevo-anchor:123` cho `debt_cash`; danh mục seed bằng trigger trên `stores`; thu ngân chỉ ghi TM `pos_drawer`, không huỷ; neo 122b `mevo-anchor:122b` trong hai RPC kho; phiếu nhập trả TM bắt buộc có ca.

```bash
git add docs/testing/yen-garden TESTING.md CLAUDE.md
git commit -m "docs: checklist ca va so thu chi Yen Garden"
```

- [ ] **Step 4: Dừng, báo anh Tú**

"Xong rồi anh, test theo `docs/testing/yen-garden/THU-CHI.md` nhé." Chờ PASS.

---

## Controller áp migration 122, 122b (không phải việc của agent code)

1. Kiểm prod đã có 112a, 112b, 116 (và 118 trước khi áp 122b) theo thứ tự hợp đồng: 112a/b → 116 → 117 → 118 → 121 → 122 → 122b → 123 → 125.
2. Trước 122: chạy `pg_get_functiondef` trên prod cho `collect_table_bill`, `confirm_manual_payment`, `kitchen_confirm_payment`, `store_workflow_snapshot`; mỗi dòng neo của mig 122 phải khớp đúng 1 lần. Lệch thì không áp, báo lại.
3. Áp `122_cash_shift_cashbook.sql` từ nội dung LF (`git show <commit>:supabase/migrations/122_cash_shift_cashbook.sql`).
4. Kiểm: `SELECT count(*) FROM store_workflow_settings WHERE require_cash_shift` = 0; mỗi quán có 11 dòng `cash_book_categories`; thu một bill ở quán không bật vẫn được, `cash_shift_id` NULL.
5. Deploy Vercel. Công tắc mặc định tắt nên thứ tự không gây lỗi.
6. Trước 122b: hai neo `mevo-anchor:122b` khớp đúng 1 lần trên prod. Áp 122b, đọc `NOTICE` số phiếu backfill.
7. Không bật công tắc cho quán thật trước khi anh Tú PASS.

---

## Vấn đề hợp đồng và câu hỏi mở (controller xử lý)

1. **Plan A, neo `values` một dòng.** CA neo vào dòng `values (...)` của câu `insert into public.bill_payments` trong `collect_table_bill`. Plan A Task 1 Step 7.9 chỉ tả câu INSERT, không chép nguyên văn: plan A phải viết dòng `values` gọn một dòng, chữ `NULL` ở vị trí `cash_shift_id`, và đứng sau mọi nhánh `already`. Hai hàm đơn lẻ đã đúng (plan A Task 2).
2. **Plan A, đơn lẻ 0đ không tạo `bill_payments`** nên không bị gác ca. Chấp nhận (không có tiền vào két). Ghi để không ai tưởng là lỗi.
3. **Plan A, `bill_payment_lines.instrument` CHECK chỉ `('cash','bank')`.** Spec tổng §4.3 đòi "để CHECK mở rộng được" cho `debt` (mig 123). CA lọc `instrument='cash'` nên không ảnh hưởng, nhưng NO cần plan A đặt tên ràng buộc rõ (để 123 `DROP CONSTRAINT` theo tên).
4. **Plan A, helper test `openCollectDb`.** CA dựa vào nó và cần: trả được `db`, cho thêm user `manager`, và stub ngày kinh doanh 00:00 bị CA thay bằng công thức thật. Plan A nên export `ids` dạng object sửa được.
5. **Bổ sung hợp đồng (mig 122):** `cash_book_void_internal(p_entry_id uuid, p_reason text, p_actor uuid) RETURNS jsonb`; mig 122b: `inventory_receipt_cash_book(uuid)`, `inventory_receipt_cash_book_void(uuid, text)`. Đề nghị controller thêm vào file hợp đồng.
6. **QL (116) thiếu helper web cho trang "chủ quán + quản lý".** Hợp đồng không có `requireAdminPageOrRedirect('back_office')`, `requireBackOfficeStoreId()`, `isBackOfficeRole()`; CA, KHO, NO, BC đều cần. Đề nghị QL làm; CA thêm nếu chưa có (Task 5).
7. **Thu ngân xem sổ:** spec sổ §5 nói thu ngân "xem phiếu do mình tạo" ở `/admin/cashbook`, nhưng hợp đồng không cho thu ngân vào `/admin/cashbook`. CA theo hợp đồng: thu ngân xem phiếu trong panel ca trên POS; RPC `cash_book_list` vẫn lọc `created_by` cho thu ngân phòng khi sau này mở đường.
8. **KHO (118):** năm yêu cầu ở Task 11 (cột `paid_method`, cột `cash_book_entry_id` không FK, hai dòng neo với biến `v_doc_id`, không nuốt lỗi). Plan `2026-11-09-yg-kho.md` chưa có lúc viết plan này — controller chuyển cho agent KHO.
9. **NO (123):** vá `cash_shift_totals` tại dòng `  v_debt_cash := 0; -- mevo-anchor:123 cash_shift_totals.debt_cash` (biến đã đi vào `expected_cash`); trả nợ tiền mặt gọi `require_open_cash_shift` và ghi `debt_payments.cash_shift_id`; huỷ trả nợ TM khoá ca `FOR SHARE` như `cash_book_void_internal`. `close_cash_shift`, `cash_shift_report_json`, phiếu bàn giao tự đọc `debt_cash`.
10. **QRIN / plan C Part 2 Task 13:** JSON ca đổi tên so với plan B cũ: `cash_collected` → `cash_sales`, `expense_total` → `cash_payments` (+ `cash_receipts`, `debt_cash`), `expenses` → `entries`. Tên hàm (`cash_shift_report_json`, `parseCashShiftReport`, `ShiftReportSlip`) giữ nguyên.
11. **BC (125):** `report_cash_flow` / `report_profit_loss` đọc `cash_book_entries` `voided_at IS NULL` theo `business_date`, nhóm theo `cash_book_categories.report_group`.
12. **Câu hỏi cho anh Tú:** (a) nhập kho trả tiền mặt lúc chưa mở ca thì chặn (như plan này) hay cho ghi không gắn ca; (b) huỷ phiếu nhập trả TM sau khi ca đã kết thì chặn (như plan này) hay huỷ phiếu nhập mà giữ phiếu chi; (c) thu ngân có được huỷ phiếu Thu/Chi két của chính mình khi ca còn mở không (plan này: không, theo bảng quyền vai Quản lý).
