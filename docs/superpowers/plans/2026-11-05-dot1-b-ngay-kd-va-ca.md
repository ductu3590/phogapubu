# Đợt 1 mục B: Ngày kinh doanh và ca — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Báo cáo A04, Excel, phiếu cuối ngày cắt theo ngày kinh doanh của quán (Part 1); thu ngân mở ca, chi tiền từ két, kết ca và đối chiếu két ngay trên MEVO (Part 2).

**Architecture:** Part 1 thêm một cột giờ bắt đầu ngày, ba hàm SQL nội bộ tính ngày, và vá ba mốc `v_from`, `v_to`, `v_today` của `get_bills_report`; ngày không lưu vào giao dịch, chỉ tính lúc đọc. Part 2 thêm bảng ca và khoản chi, RPC gác `require_open_cash_shift` ghi `bill_payments.cash_shift_id`, tiền mặt của ca tính từ `bill_payment_lines`. Mọi con số tiền do server tính; POS đọc trạng thái ca bằng `lib/pos-browser-reads.ts`, ghi bằng server action.

**Tech Stack:** Postgres (Supabase, plpgsql), Next.js 16 App Router, React 19, vitest, `node --test` + pglite.

**Spec:** `docs/superpowers/specs/2026-11-05-dot1-thanh-toan-ca-in-vietqr-design.md` §4 (cùng §2, §7, §8, §9).

**Thứ tự chạy:**

| Part | Đợt | Điều kiện bắt đầu | Migration | Nhánh đề xuất |
|---|---|---|---|---|
| Part 1 (Task 1–4) | 1 | Không phụ thuộc mục A | 111 | `feat/dot1-ngay-kd` |
| Part 2 (Task 5–11) | 3 | Anh Tú đã PASS Đợt 2, mig 112a + 112b đã áp prod, Part 1 đã merge | 113 | `feat/dot1-ca` |

Mỗi part một worktree riêng từ `main`. Worktree mới chưa có `node_modules`: chạy `npm ci` trong `admin-web` trước. Xong một part thì dừng, báo anh Tú theo checklist, chờ PASS (quy tắc đầu `CLAUDE.md`).

## Global Constraints

- Mặc định phải như hôm nay: `business_day_start = '00:00'`, `require_cash_shift = false`. Quán không bật thì báo cáo ra đúng số cũ, POS không hiện gì thêm.
- Không lưu ngày kinh doanh vào từng giao dịch. Đổi giờ thì báo cáo cũ tính lại theo mốc mới.
- Ngày kinh doanh D chạy từ D + giờ bắt đầu tới đúng 24 giờ sau. Giao dịch đúng giờ bắt đầu thuộc ngày mới.
- Giờ bắt đầu chọn được: 00:00 tới 12:00, bước 30 phút. Chỉ chủ quán sửa.
- Không đổi: Timeline, đặt bàn, giờ phục vụ. `get_daily_revenue` để nguyên.
- Mỗi quán mỗi lúc một ca đang mở. Chủ quán và thu ngân đều mở, kết, thu vào ca đó. Ca độc lập với ngày kinh doanh.
- `Tiền dự kiến = tiền đầu ca + tiền mặt thu trong ca − khoản chi trong ca`. `Chênh lệch = tiền đếm được − tiền dự kiến` (âm = thiếu).
- Tiền mặt thu trong ca = tổng `bill_payment_lines` cash của các `bill_payments` có `cash_shift_id` = ca.
- Server không trả tiền dự kiến của ca đang mở cho client, kể cả chủ quán.
- Một ca đóng một lần, không mở lại, không sửa. Không tự đóng ca.
- Đơn trả trước Zalo không bị chặn, không vào ca.
- Migration vá hàm sống: `pg_get_functiondef` + `replace` + `EXECUTE`, helper `pg_temp.mevo_patch` theo mẫu mig 110, raise nếu chuỗi neo khớp 0 hoặc hơn 1 lần. Neo chép từ **prod**, không từ `supabase/tests/prod-defs/108`, `110` (đã cũ).
- Không ghi "rerun-safe" trong migration.
- Hàm nội bộ mới: `REVOKE ALL ... FROM PUBLIC, anon, authenticated`. `REVOKE ... FROM PUBLIC` một mình không gỡ quyền cấp thẳng cho anon/authenticated.
- Agent code không tự áp prod. Mỗi part có mục "Controller áp migration" riêng.
- Server action có lỗi người dùng trả `{ ok, error }`, không ném (Next prod giấu nội dung lỗi ném). Bọc cả bước kiểm quyền trong `try/catch`.
- Không poll bằng server action trên POS. Đọc định kỳ đi qua `lib/pos-browser-reads.ts`.
- Không `window.confirm`, dùng `ConfirmDialog`.
- Ô nhập tiền dùng `parseVnd` của `lib/cash-change.ts`, không `Number(...)` (`Number('80.000')` ra 80).
- Next.js 16: đọc `admin-web/node_modules/next/dist/docs` trước khi viết route. `searchParams` của page là Promise.
- Chữ giao diện tiếng Việt, comment tiếng Việt cho logic khó. Commit `feat:`, `fix:`, `chore:`.

## Review Focus

1. Thu ngân gõ "500.000", "500k", để trống ô tiền. Rỗng phải bị chặn, "0" phải hợp lệ, không ra 500đ. Test ở Task 7.
2. Mạng rớt hoặc bấm hai lần lúc kết ca. Lần gọi sau cùng số đếm phải trả đúng kết quả đã lưu, không báo lỗi làm thu ngân tưởng chưa kết. Test ở Task 5.
3. Một người đang thu bill đúng lúc người khác bấm kết ca. Khoản thu phải nằm trọn trong ca cũ hoặc bị báo "Chưa mở ca", không rơi ra ngoài phép tính két. Test ở Task 5, Task 6.
4. Chủ quán tắt công tắc khi ca còn mở, hoặc đổi giờ bắt đầu ngày khi ca đang mở. Tắt phải bị từ chối; đổi giờ thì cảnh báo ca cũ tính lại theo mốc mới, không lỗi. Test ở Task 5.
5. URL gõ tay: `?date=` là ngày lịch đã sang nhưng ngày kinh doanh chưa sang; `/print/shift-report?id=` của ca người khác. Ngày phải kẹp về ngày kinh doanh hiện tại; thu ngân không xem được ca không phải của mình. Test ở Task 2, Task 5.

---

# Part 1: Ngày kinh doanh (spec §4 B1)

### Task 1: Migration 111

**Files:**
- Create: `supabase/migrations/111_business_day.sql`
- Create: `supabase/tests/prod-defs/111/get_bills_report.sql`, `supabase/tests/prod-defs/111/store_workflow_snapshot.sql`
- Create: `supabase/tests/helpers/business-day-fixture.mjs`
- Test: `supabase/tests/111_business_day.test.mjs`

**Interfaces:**
- Produces (SQL, nội bộ, REVOKE khỏi `PUBLIC, anon, authenticated`):
  - `business_date_of(p_store_id uuid, p_at timestamptz) RETURNS date`
  - `current_business_date(p_store_id uuid) RETURNS date`
  - `business_day_bounds(p_store_id uuid, p_date date) RETURNS TABLE(day_from timestamptz, day_to timestamptz)`
- Produces (SQL, GRANT authenticated): `set_business_day_start(p_store_id uuid, p_start time) RETURNS jsonb` gồm `{ok, business_day_start}`.
- Produces (JSON): `get_bills_report` thêm `day_from`, `day_to`; `store_workflow_snapshot` thêm `business_day_start` dạng `'HH:MM'`, nên `get_public_store_workflow` cũng có.
- Produces (test): `setupThrough111(db)` trong `helpers/business-day-fixture.mjs`, dựng schema tối thiểu, nạp `100_bills_report.sql`, hai bản chụp prod, rồi `111_business_day.sql`. Task 5 dùng lại.

**Vì sao không sửa `update_store_workflow_settings`:** hàm này bắt đủ 19 khoá và từ chối khoá lạ. Thêm khoá vào đó thì Vercel cũ lưu cài đặt sẽ lỗi "Thiếu cấu hình bắt buộc", Vercel mới chạy trước migration sẽ lỗi "Cấu hình không hỗ trợ". RPC riêng `set_business_day_start` tránh cả hai và không đụng neo của mig 113, 114.

**Vì sao không đọc qua `get_store_workflow_settings`:** hàm đó và RLS của `store_workflow_settings` chỉ cho chủ quán + superadmin, trong khi thu ngân mở A04. Đọc qua `get_public_store_workflow`.

- [ ] **Step 1: Chụp định nghĩa prod**

Dùng Supabase MCP `execute_sql` (project `dlkgdpexjtyynbotkwka`, chỉ SELECT) lấy `pg_get_functiondef('public.get_bills_report(uuid,date)'::regprocedure)` và `pg_get_functiondef('public.store_workflow_snapshot(uuid)'::regprocedure)`, ghi nguyên byte vào hai file `prod-defs/111/`. `.gitattributes` đã để `prod-defs/** -text`. Hai hàm này không lẫn CRLF (đã kiểm prod 2026-11-05).

- [ ] **Step 2: Viết fixture và test thất bại**

`helpers/business-day-fixture.mjs`: chép khối schema trong `before()` của `100_bills_report.test.mjs`, thêm:
- `orders.bill_discount_amount integer NOT NULL DEFAULT 0`
- `stores`: `payment_timing text`, `payment_methods text[]`, `is_accepting_orders boolean`, `serving_hours jsonb`, `is_active boolean DEFAULT true`
- `store_workflow_settings`: `store_id` + đủ các cột `store_workflow_snapshot` đọc (có default), `updated_at`, `updated_by`
- `store_workflow_setting_events(id uuid DEFAULT gen_random_uuid(), store_id, before_value jsonb, after_value jsonb, changed_by uuid, changed_via text)`
- Stub `is_store_owner_of`, `is_store_owner_or_admin` đúng định nghĩa prod
- Role `service_role`

Fixture tách hai bước `setupBefore111(db)` (tới bản chụp prod) và `apply111(db)`, để test chụp báo cáo trước khi vá. `setupThrough111` gọi cả hai.

`supabase/tests/111_business_day.test.mjs`:

```js
const START = '05:00'
// quán s1 đặt 05:00; DAY = '2026-11-01'
test('biên ngày: 04:59:59 thuộc ngày cũ, 05:00:00 thuộc ngày mới, cả qua tháng', async () => {
  assert.equal(await dateOf(s1, '2026-11-02 04:59:59+07'), '2026-11-01')
  assert.equal(await dateOf(s1, '2026-11-02 05:00:00+07'), '2026-11-02')
  assert.equal(await dateOf(s1, '2026-12-01 04:00:00+07'), '2026-11-30')
  assert.deepEqual(await bounds(s1, '2026-11-01'), ['2026-11-01 05:00:00+07', '2026-11-02 05:00:00+07'])
})
test('quán chưa có dòng cài đặt coi như 00:00', ...)
test('bill theo giờ nhận tiền: 04:59:59 hôm sau vào báo cáo D, 05:00:00 vào D+1', ...)
test('phiên expired còn nợ theo opened_at', ...)
test('đơn chờ không phiên theo created_at', ...)
test('huỷ theo rejected_at; đơn huỷ không rejected_at theo updated_at', ...)
test('điều chỉnh theo voided_at và changed_at', ...)
test('phiên đang mở chỉ có trong Chờ thu khi xem current_business_date', async () => {
  // v_today đi theo ngày kinh doanh, không theo ngày lịch
})
test('quán 00:00: báo cáo sau mig 111 giống hệt trước mig, chỉ thêm day_from, day_to', async () => {
  const { day_from, day_to, ...rest } = await report(DAY, s0)
  assert.deepEqual(rest, reportBeforePatch)
  assert.equal(day_from, ...) // 00:00 VN của DAY
})
test('cash + bank + other = revenue ở quán 05:00', ...)
test('set_business_day_start: chủ quán ghi được, có event before/after, changed_via owner', ...)
test('set_business_day_start: thu ngân, phục vụ, chủ quán khác bị chặn', ...)
test('set_business_day_start: 12:30 và 05:15 bị chặn', ...)
test('snapshot trả business_day_start HH:MM', ...)
test('3 hàm nội bộ: role authenticated và anon không EXECUTE được', ...)
test('chuỗi neo khớp đúng 1 lần trong prod-defs/111', ...) // mẫu test 110, hàm patches()
```

Các test theo giờ nhận tiền dùng mỗi trường hai dòng dữ liệu, 04:59:59 và 05:00:00.

- [ ] **Step 3: Chạy test, phải FAIL**

Run: `PGLITE_MODULE=<đường dẫn>/admin-web/node_modules/@electric-sql/pglite/dist/index.js node --test supabase/tests/111_business_day.test.mjs`
Expected: FAIL vì chưa có file migration.

- [ ] **Step 4: Viết `111_business_day.sql`**

Thứ tự trong file: khối `$pre$` kiểm `store_workflow_settings` và `get_bills_report` tồn tại → cột → hàm → helper `pg_temp.mevo_patch` (thông báo `mig 111:`) → vá → REVOKE/GRANT → `NOTIFY pgrst, 'reload schema';`.

Cột:

```sql
ALTER TABLE public.store_workflow_settings
  ADD COLUMN business_day_start time NOT NULL DEFAULT '00:00'
  CONSTRAINT store_workflow_business_day_start_check CHECK (
    business_day_start BETWEEN time '00:00' AND time '12:00'
    AND EXTRACT(SECOND FROM business_day_start) = 0
    AND EXTRACT(MINUTE FROM business_day_start) IN (0, 30));
```

Công thức hai hàm (đã chạy thử trên pglite, `LANGUAGE sql STABLE SET search_path = public`, `COALESCE` về `time '00:00'` khi thiếu dòng cài đặt):

```sql
-- business_date_of
((p_at AT TIME ZONE 'Asia/Ho_Chi_Minh') - v_start::interval)::date
-- business_day_bounds
day_from = ((p_date + v_start) AT TIME ZONE 'Asia/Ho_Chi_Minh'); day_to = day_from + interval '24 hours'
```

`current_business_date(p_store_id)` = `business_date_of(p_store_id, now())`.

Vá `get_bills_report(uuid,date)`, hai neo (đã kiểm khớp đúng 1 lần trên prod 2026-11-05):

```
  v_from  := (p_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_to    := ((p_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_today := p_date = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
```
thay bằng
```
  SELECT b.day_from, b.day_to INTO v_from, v_to FROM public.business_day_bounds(p_store_id, p_date) b;
  v_today := p_date = public.current_business_date(p_store_id);
```
và neo `'date', p_date,` thay bằng `'date', p_date, 'day_from', v_from, 'day_to', v_to,`.

Mọi CTE đã cắt qua ba biến này nên không vá gì thêm: bill theo `COALESCE(payment_received_at, completed_at, updated_at)`, phiên mở trong Chờ thu chỉ khi `v_today`, phiên expired theo `opened_at`, đơn chờ theo `created_at`, huỷ theo `COALESCE(rejected_at, updated_at)`, điều chỉnh theo `voided_at` và `changed_at`.

Vá `store_workflow_snapshot(uuid)`, neo `'reservation_preorder_edit_cutoff_minutes', w.reservation_preorder_edit_cutoff_minutes` thay bằng chính nó + `,` xuống dòng `'business_day_start', to_char(w.business_day_start, 'HH24:MI')`.

`set_business_day_start`, `SECURITY DEFINER`, `SET search_path = public`:
- Không phải `is_store_owner_or_admin(p_store_id)`: raise `'Chỉ chủ quán được đổi giờ bắt đầu ngày'`.
- Giờ sai quy tắc cột: raise `'Giờ bắt đầu ngày phải từ 00:00 đến 12:00, bước 30 phút'`.
- `FOR UPDATE` dòng cài đặt, ghi `business_day_start`, `updated_at`, `updated_by`.
- Ghi `store_workflow_setting_events` với snapshot trước, sau; `changed_via` = `'owner'` nếu `is_store_owner_of`, ngược lại `'mevo'`.

REVOKE/GRANT: ba hàm nội bộ REVOKE; `set_business_day_start` REVOKE khỏi `PUBLIC, anon` rồi GRANT `authenticated`.

- [ ] **Step 5: Chạy test, phải PASS**

Run: lệnh Step 3, cùng `supabase/tests/100_bills_report.test.mjs`.
Expected: PASS hết. Test 100 không đổi vì chỉ nạp mig 100.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/111_business_day.sql supabase/tests/prod-defs/111 supabase/tests/helpers/business-day-fixture.mjs supabase/tests/111_business_day.test.mjs
git commit -m "feat: mig 111 ngay kinh doanh va moc cat bao cao"
```

### Task 2: Ngày kinh doanh ở TS và ba mặt báo cáo

**Files:**
- Modify: `admin-web/lib/daily-report.ts:6-21`
- Modify: `admin-web/lib/daily-report.test.ts`
- Modify: `admin-web/lib/bills-report.ts:34-42`, `:58-66`, cuối file
- Modify: `admin-web/lib/bills-report.test.ts`
- Modify: `admin-web/lib/actions/bills-report.ts`
- Create: `admin-web/lib/actions/bills-report.test.ts`
- Modify: `admin-web/app/admin/bills/bills-screen.tsx:4`, `:19-20`, `:44-45`
- Modify: `admin-web/app/admin/bills/bills-report-view.tsx:74`
- Modify: `admin-web/app/print/day-report/page.tsx:4`, `:16`, truyền thêm prop
- Modify: `admin-web/app/print/day-report/day-report-slip.tsx:8-15`, `:58`
- Modify: `admin-web/app/print/day-report/day-report-slip.test.tsx`
- Modify: `admin-web/app/admin/bills/export/route.ts:5`, `:22`
- Modify: `admin-web/lib/bills-report-xlsx.ts:35`

**Interfaces:**
- Consumes: `get_public_store_workflow` trả `business_day_start`; `get_bills_report` trả `day_from`, `day_to` (Task 1).
- Produces (`lib/daily-report.ts`):
  - `businessToday(start: string, now?: Date): string` trả `'YYYY-MM-DD'`
  - `BUSINESS_DAY_START_OPTIONS: string[]` 25 giá trị `'00:00'` … `'12:00'`
  - `normalizeBusinessDayStart(raw: unknown): string` nhận `'HH:MM'`, `'HH:MM:SS'`, còn lại `'00:00'`
  - `clampReportDate(input: string | undefined, today: string): string` (đổi chữ ký)
  - Xoá `vnToday`, `isViewingToday`. Giữ `instrumentLabel`, `ReportInstrument`.
- Produces (`lib/actions/bills-report.ts`, không `'use server'`):
  - `loadBusinessDayStart(storeId: string): Promise<string>`
  - `resolveReportDay(rawDate: string | undefined, now: Date): Promise<{ date: string; today: string; isToday: boolean }>`
- Produces (`lib/bills-report.ts`): `BillsReport` thêm `dayFrom: string; dayTo: string`; `businessDayRangeLabel(report: Pick<BillsReport, 'dayFrom' | 'dayTo'>): string | null`.

- [ ] **Step 1: Viết test thất bại**

`daily-report.test.ts`, bỏ test `vnToday`, `isViewingToday`, thêm:

```ts
describe('businessToday', () => {
  it('05:00: 04:59:59 VN còn ngày cũ, 05:00:00 sang ngày mới', () => {
    expect(businessToday('05:00', new Date('2026-11-01T21:59:59Z'))).toBe('2026-11-01')
    expect(businessToday('05:00', new Date('2026-11-01T22:00:00Z'))).toBe('2026-11-02')
  })
  it('01:00 sáng vẫn là hôm trước', () => {
    expect(businessToday('05:00', new Date('2026-11-01T18:00:00Z'))).toBe('2026-11-01')
  })
  it('00:00 giống ngày lịch giờ VN', () => {
    expect(businessToday('00:00', new Date('2026-10-07T16:30:00Z'))).toBe('2026-10-07')
    expect(businessToday('00:00', new Date('2026-10-07T17:30:00Z'))).toBe('2026-10-08')
  })
  it('qua tháng, qua năm', () => {
    expect(businessToday('05:00', new Date('2026-11-30T21:00:00Z'))).toBe('2026-11-30')
    expect(businessToday('05:00', new Date('2026-12-31T21:00:00Z'))).toBe('2026-12-31')
  })
  it('12:00 và dạng HH:MM:SS', () => {
    expect(businessToday('12:00', new Date('2026-11-02T04:59:00Z'))).toBe('2026-11-01')
    expect(businessToday('05:00:00', new Date('2026-11-01T22:00:00Z'))).toBe('2026-11-02')
  })
})
it('giờ sai coi như 00:00', () => expect(normalizeBusinessDayStart('abc')).toBe('00:00'))
it('25 lựa chọn, bước 30 phút', () => {
  expect(BUSINESS_DAY_START_OPTIONS).toHaveLength(25)
  expect(BUSINESS_DAY_START_OPTIONS[1]).toBe('00:30')
  expect(BUSINESS_DAY_START_OPTIONS.at(-1)).toBe('12:00')
})
it('clampReportDate: rỗng, sai, tương lai về today; ngày cũ giữ nguyên', () => {
  expect(clampReportDate(undefined, '2026-11-01')).toBe('2026-11-01')
  expect(clampReportDate('2026-13-40', '2026-11-01')).toBe('2026-11-01')
  expect(clampReportDate('2026-11-02', '2026-11-01')).toBe('2026-11-01')
  expect(clampReportDate('2026-10-30', '2026-11-01')).toBe('2026-10-30')
})
```

`lib/actions/bills-report.test.ts`, mock theo mẫu `workflow-settings.test.ts`:

```ts
it('01:00 sáng 02/11, quán 05:00: gõ ?date=2026-11-02 kẹp về 2026-11-01', ...)
it('xem ngày cũ: isToday false', ...)
it('RPC lỗi hoặc trả null: coi như 00:00, không ném', ...)
```

`bills-report.test.ts`: parse `day_from`, `day_to`; `businessDayRangeLabel` trả `'05:00 01/11 – 05:00 02/11'` cho quán 05:00, `null` khi `dayFrom` là 00:00 giờ VN hoặc rỗng (server chưa áp mig).

`day-report-slip.test.tsx`: có prop `rangeLabel` thì hiện dòng đó, `null` thì không.

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `cd admin-web && npx vitest run lib/daily-report.test.ts lib/bills-report.test.ts lib/actions/bills-report.test.ts app/print/day-report`
Expected: FAIL.

- [ ] **Step 3: Sửa `lib/daily-report.ts`**

`businessToday` chuẩn hoá `start`, lấy `now.getTime()` cộng 7 giờ trừ số phút của `start`, cắt 10 ký tự đầu của `toISOString()`. Việt Nam không đổi giờ mùa nên cộng cố định đúng; công thức phải khớp `business_date_of`.

- [ ] **Step 4: Sửa `lib/actions/bills-report.ts` và `lib/bills-report.ts`**

`loadBusinessDayStart`: gọi `get_public_store_workflow`, đưa `business_day_start` qua `normalizeBusinessDayStart`; lỗi hoặc null trả `'00:00'`, vì mốc thật vẫn do server cắt.

`resolveReportDay`: `requirePosOperatorStoreId()` → `loadBusinessDayStart` → `businessToday` → `clampReportDate`.

`businessDayRangeLabel` dùng `VN_DATE`, `VN_TIME` đang có ở `bills-report.ts:225-226`. Không đổi `startedLabel`: bill 01:30 ngày 02/11 trong báo cáo 01/11 hiện `02/11 01:30` là đúng.

- [ ] **Step 5: Đổi ba mặt báo cáo**

Cả trang, Excel, phiếu ngày vẫn lấy số qua `loadBillsReport`; chỉ đổi cách chọn ngày.

- `bills-screen.tsx`: thay `clampReportDate` + `isViewingToday` bằng `const { date, today: todayDate, isToday } = await resolveReportDay(rawDate, now)`; `maxDate={todayDate}`, `today={isToday}`.
- `bills-report-view.tsx:74`: sau `dateTitle`, nếu `businessDayRangeLabel(report)` khác null thì hiện thêm span nhãn đó. Sửa comment dòng 69.
- `print/day-report/page.tsx` và `export/route.ts`: dùng `resolveReportDay`. Route đã kiểm vai trò trước đó.
- `day-report-slip.tsx`: prop `rangeLabel?: string | null`, hiện dưới dòng `Ngày ...`. Sửa comment dòng 28.
- `bills-report-xlsx.ts:35`: sau dòng `Ngày`, nếu có nhãn thì `line('Khoảng giờ', nhãn)`.

- [ ] **Step 6: Chạy test và kiểu**

Run: `cd admin-web && npx vitest run && npx tsc --noEmit`
Expected: PASS, không còn tham chiếu `vnToday`.

- [ ] **Step 7: Commit**

```bash
git add admin-web/lib admin-web/app/admin/bills admin-web/app/print/day-report
git commit -m "feat: A04, Excel, phieu cuoi ngay theo ngay kinh doanh"
```

### Task 3: Cài giờ bắt đầu ngày

**Files:**
- Create: `admin-web/lib/actions/business-day.ts`
- Create: `admin-web/lib/actions/business-day.test.ts`
- Create: `admin-web/app/admin/settings/business-day-section.tsx`
- Create: `admin-web/app/admin/settings/business-day-section.test.tsx`
- Modify: `admin-web/app/admin/settings/page.tsx:18-25`, thêm section trước "Quy trình vận hành"

**Interfaces:**
- Consumes: `set_business_day_start` (Task 1); `loadBusinessDayStart`, `BUSINESS_DAY_START_OPTIONS` (Task 2).
- Produces: `saveBusinessDayStart(start: string): Promise<{ ok: true } | { ok: false; error: string }>` trong file `'use server'`.

- [ ] **Step 1: Viết test thất bại**

```ts
it('giờ không có trong danh sách: trả lỗi, không gọi RPC', ...)
it('không phải chủ quán: trả {ok:false}, không ném', ...)
it('RPC lỗi: trả nguyên message', ...)
it('thành công: gọi set_business_day_start với store của operator, revalidate /admin layout', ...)
```

Test section, `renderToStaticMarkup` theo mẫu `workflow-settings-form.test.tsx`: có tiêu đề `Ngày kinh doanh`, 25 `<option>`, đúng giá trị `initial` được chọn.

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `cd admin-web && npx vitest run lib/actions/business-day.test.ts app/admin/settings/business-day-section.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Viết action và section**

Action dùng `createClient()` theo phiên, không dùng service key; RPC tự kiểm quyền. `requireStoreOwnerStoreId` nằm trong `try/catch`.

Section theo mẫu `bell-settings-section.tsx` (`useTransition`, nút Lưu tắt khi chưa đổi). Dùng `<select>`. Chữ:
- Nhãn: `Giờ bắt đầu ngày`
- Gợi ý: `Giao dịch trước giờ này tính vào ngày hôm trước. Đổi giờ thì báo cáo cũ cũng tính lại theo mốc mới.`

`page.tsx`: thêm `loadBusinessDayStart(storeId)` vào `Promise.all`. Không thêm vào `WorkflowSettingsForm`, form đó gửi đủ 19 khoá.

- [ ] **Step 4: Chạy test, phải PASS**

Run: `cd admin-web && npx vitest run && npx tsc --noEmit && npx eslint app/admin/settings lib/actions/business-day.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add admin-web/lib/actions/business-day.ts admin-web/lib/actions/business-day.test.ts admin-web/app/admin/settings
git commit -m "feat: cai gio bat dau ngay kinh doanh"
```

### Task 4: Checklist Part 1

**Files:**
- Create: `docs/testing/dot1/B1-ngay-kinh-doanh.md`
- Modify: `TESTING.md` (thêm link, quy ước từ 2026-09-10)
- Modify: `CLAUDE.md` (thêm dòng cuối bảng §10)

- [ ] **Step 1: Viết checklist**

Test trên Bảo Lương, làm buổi sáng trước 12:00, xong phải đặt lại 00:00. Các bài:
1. Quán để 00:00: A04, Excel, phiếu ngày ra đúng số như trước, không có dòng khoảng giờ.
2. Đặt giờ bắt đầu muộn hơn giờ hiện tại (đang 10:20 thì đặt 11:00): A04 "Hôm nay" là ngày hôm trước, có nhãn khoảng giờ, ô chọn ngày không chọn được ngày lịch hôm nay.
3. Đặt giờ sớm hơn giờ hiện tại: A04 về ngày lịch.
4. Excel và phiếu cuối ngày cùng số với màn hình ở bài 2.
5. Thu ngân mở A04 ở bài 2: cùng kết quả, không thấy mục cài đặt.
6. Gõ tay `?date=` ngày lịch hôm nay ở bài 2: kẹp về ngày kinh doanh.
7. Timeline, đặt bàn, giờ phục vụ không đổi.
8. Đặt lại 00:00.

- [ ] **Step 2: Thêm link `TESTING.md`, dòng quyết định `CLAUDE.md`, commit**

Dòng `CLAUDE.md` ghi: mig 111, RPC riêng thay vì `update_store_workflow_settings` và lý do, đọc giờ qua `get_public_store_workflow` vì thu ngân không đọc được bảng.

```bash
git add docs/testing/dot1 TESTING.md CLAUDE.md
git commit -m "docs: checklist ngay kinh doanh"
```

- [ ] **Step 3: Dừng, báo anh Tú**

"Xong rồi anh, test theo `docs/testing/dot1/B1-ngay-kinh-doanh.md` nhé." Chờ PASS rồi mới merge.

### Controller áp migration 111 (không phải việc của agent code)

1. Kiểm prod chưa có mig 111 và hai neo vẫn khớp đúng 1 lần.
2. Áp `111_business_day.sql`.
3. Deploy Vercel. Thứ tự giữa hai bước không gây lỗi khi giờ còn 00:00: code cũ bỏ qua trường mới, code mới thiếu trường thì coi như 00:00.
4. Kiểm: `get_bills_report` quán Bảo Lương ra cùng `totals` như trước khi áp.

---

# Part 2: Ca, khoản chi, xem lại ca (spec §4 B2, B3, B4)

**Chuẩn bị trước Task 5:** kiểm trên prod `bill_payments`, `bill_payment_lines`, `collect_table_bill`, `current_business_date` đã có và mig 112b đã áp. Thiếu 112b thì đường thu cũ còn sống và đi vòng qua ca, dừng lại báo Controller.

### Task 5: Migration 113, bảng ca và RPC ca

**Files:**
- Create: `supabase/migrations/113_cash_shifts.sql`
- Create: `supabase/tests/prod-defs/113/store_workflow_snapshot.sql`
- Test: `supabase/tests/113_cash_shifts.test.mjs`

**Interfaces:**
- Consumes: `setupThrough111(db)`, `business_day_bounds`, `current_business_date`, `business_date_of` (Task 1); bảng `bill_payments`, `bill_payment_lines` (plan A).
- Produces (bảng): `cash_shifts`, `cash_shift_expenses`. Thêm `store_workflow_settings.require_cash_shift boolean NOT NULL DEFAULT false`. Thêm FK `bill_payments.cash_shift_id → cash_shifts(id)` + index một phần.
- Produces (RPC, GRANT authenticated, kiểm `is_store_pos_operator`):
  - `open_cash_shift(p_store_id uuid, p_opening_cash int, p_note text) RETURNS jsonb` gồm `{ok, shift_id}`
  - `close_cash_shift(p_shift_id uuid, p_counted_cash int, p_note text) RETURNS jsonb` gồm `{ok, already, shift_id, opening_cash, cash_collected, expense_total, expected_cash, counted_cash, difference}`
  - `add_cash_expense(p_shift_id uuid, p_amount int, p_reason text) RETURNS jsonb` gồm `{ok, expense_id}`
  - `void_cash_expense(p_expense_id uuid) RETURNS jsonb` gồm `{ok, already}`
  - `continue_stale_shift(p_shift_id uuid) RETURNS jsonb` gồm `{ok, already}`
  - `get_open_cash_shift(p_store_id uuid) RETURNS jsonb` gồm `{required, shift}`; `shift` null hoặc `{id, opened_at, opened_by_name, opening_cash, open_note, stale, expenses: [{id, amount, reason, created_at, created_by_name, voided_at}]}`
  - `list_cash_shifts(p_store_id uuid, p_limit int DEFAULT 60) RETURNS jsonb` gồm `{required, shifts: [{id, status, opened_at, closed_at, opened_by_name, closed_by_name, opening_cash, expected_cash, counted_cash, difference}]}`
  - `get_cash_shift_report(p_shift_id uuid) RETURNS jsonb`
- Produces (RPC, kiểm `is_store_owner_or_admin`): `set_require_cash_shift(p_store_id uuid, p_enabled boolean) RETURNS jsonb` gồm `{ok, require_cash_shift}`
- Produces (nội bộ, REVOKE khỏi `PUBLIC, anon, authenticated`):
  - `require_open_cash_shift(p_store_id uuid) RETURNS uuid`
  - `cash_shift_totals(p_shift_id uuid) RETURNS TABLE(cash_collected bigint, bank_collected bigint, expense_total bigint, bills_count bigint)`
  - `cash_shift_report_json(p_shift_id uuid) RETURNS jsonb`, GRANT `service_role` để plan C render `/print/agent` (trang đó không có phiên đăng nhập)

Bảng theo spec §4 B2, B3, thêm hai cột spec không liệt kê nhưng quy tắc "ghi người và giờ vào ca" cần: `cash_shifts.continued_by uuid`, `cash_shifts.continued_at timestamptz`.

- [ ] **Step 1: Chụp prod và viết test thất bại**

Chụp `store_workflow_snapshot` sau mig 112 vào `prod-defs/113/`.

Test dùng `setupThrough111(db)`, tạo `bill_payments`, `bill_payment_lines` theo cột của hợp đồng rồi chạy mig 113. Giả ca trong quá khứ bằng cách INSERT `opened_at`, không giả `now()`.

```js
test('công thức két: 500k đầu ca + 300k TM − 50k chi = 750k, đếm 740k lệch −10k', async () => {
  // bill_payment_lines: cash 300k, bank 200k; chi 50k; chi 20k đã huỷ; bill ca khác và quán khác không tính
  const r = await rpc('close_cash_shift', shift, 740000, null)
  assert.equal(r.expected_cash, 750000); assert.equal(r.difference, -10000)
})
test('mỗi quán một ca mở: mở lần hai báo Đã có ca đang mở', ...)
test('công tắc tắt: open_cash_shift báo Quán chưa bật mở ca', ...)
test('get_open_cash_shift và get_cash_shift_report của ca mở không lộ tiền dự kiến', async () => {
  // JSON ca mở: expected_cash, cash_collected, difference, bank_collected, bills_count đều null hoặc vắng
})
test('kết ca lặp cùng số đếm: already true, đúng kết quả đã lưu', ...)
test('kết ca lặp khác số đếm: báo Ca đã đóng, không ghi đè', ...)
test('ca đã đóng: chi tiền, huỷ chi, tiếp tục đều báo Ca đã đóng', ...)
test('khoản chi: số tiền <= 0 và lý do rỗng hoặc toàn dấu cách bị chặn', ...)
test('huỷ khoản chi ghi người và giờ; huỷ lần hai already true; khoản huỷ không trừ két', ...)
test('stale: mở đúng day_from không stale, trước 1 giây thì stale', ...)
test('continue_stale_shift: ghi người và giờ, stale tắt; continued_at của ngày trước thì stale lại', ...)
test('continue_stale_shift trên ca không stale: already true, không ghi', ...)
test('đổi giờ bắt đầu ngày khi ca mở: stale tính lại theo mốc mới', ...)
test('tắt công tắc khi còn ca mở: báo Còn ca đang mở, kết ca trước khi tắt', ...)
test('require_open_cash_shift: tắt trả NULL; bật không ca raise Chưa mở ca; bật có ca trả id', ...)
test('khoá: require_open_cash_shift, add_cash_expense, void_cash_expense dùng FOR SHARE; close_cash_shift FOR UPDATE trước khi tính tổng', ...) // kiểm tĩnh nguồn SQL
test('quyền: phục vụ, chủ quán khác bị chặn ở mọi RPC; anon không EXECUTE được', ...)
test('list_cash_shifts: chủ quán thấy mọi ca, thu ngân chỉ ca mình mở hoặc kết', ...)
test('get_cash_shift_report: thu ngân xem ca người khác bị chặn', ...)
test('báo cáo ca đã đóng đủ trường phiếu; carried_days = 3 khi ca gộp qua 3 ngày, 1 khi chưa continue', ...)
test('3 hàm nội bộ: authenticated không EXECUTE được; cash_shift_report_json service_role được', ...)
```

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `PGLITE_MODULE=<...> node --test supabase/tests/113_cash_shifts.test.mjs`
Expected: FAIL vì chưa có file migration.

- [ ] **Step 3: Viết `113_cash_shifts.sql` phần bảng và hàm**

Bảng: `cash_shifts` có `CREATE UNIQUE INDEX ... (store_id) WHERE status = 'open'`, CHECK `opening_cash >= 0`, `counted_cash >= 0`, `status IN ('open','closed')`, `(status = 'open') = (closed_at IS NULL)`. `expected_cash`, `difference` là `bigint`. `cash_shift_expenses` CHECK `amount > 0`, `btrim(reason) <> ''`.

Cả hai bảng `ENABLE ROW LEVEL SECURITY`, `REVOKE ALL ... FROM anon, authenticated`, không policy. Mọi đọc đi qua RPC để client không tự cộng được tiền dự kiến.

`require_open_cash_shift`: đọc công tắc; tắt trả `NULL`; bật thì `SELECT id ... WHERE store_id = p AND status = 'open' FOR SHARE`, không có raise `'Chưa mở ca'`. Không kiểm quyền vì bếp gọi bằng token, không có `auth.uid()`.

`FOR SHARE` giữ ca khỏi bị kết giữa chừng. `close_cash_shift` lấy `FOR UPDATE` nên chờ các khoản thu đang chạy xong rồi mới cộng; khoản thu tới sau thấy ca đã đóng và nhận `'Chưa mở ca'`.

`close_cash_shift`, thứ tự: khoá `FOR UPDATE` → không thấy raise `'Không tìm thấy ca'` → kiểm quyền → `p_counted_cash` null hoặc âm raise `'Số tiền không hợp lệ'` → ca đã đóng: cùng số đếm trả bản đã lưu với `already: true`, khác số raise `'Ca đã đóng'` → `cash_shift_totals` → ghi `closed_by`, `closed_at`, `counted_cash`, `expected_cash`, `difference`, `close_note`, `status`.

`cash_shift_totals`: tiền từ `bill_payments p JOIN bill_payment_lines l ON l.payment_id = p.id WHERE p.cash_shift_id = p_shift_id`, `bills_count` = `COUNT(DISTINCT p.id)`; chi từ `cash_shift_expenses WHERE voided_at IS NULL`.

Stale trong `get_open_cash_shift` và `continue_stale_shift`:

```sql
SELECT b.day_from INTO v_day_from
  FROM public.business_day_bounds(v_store, public.current_business_date(v_store)) b;
v_stale := v_shift.opened_at < v_day_from
           AND (v_shift.continued_at IS NULL OR v_shift.continued_at < v_day_from);
```

`cash_shift_report_json`: ca đóng trả `{id, store_id, status, opened_at, closed_at, opened_by_name, closed_by_name, opening_cash, open_note, close_note, cash_collected, bank_collected, expense_total, expected_cash, counted_cash, difference, bills_count, carried_days, continued_at, continued_by_name, expenses}`. Ca mở: các trường tiền thu, dự kiến, lệch, `bills_count` là null.

`carried_days`: khi `continued_at IS NOT NULL` thì `business_date_of(store, COALESCE(closed_at, now())) - business_date_of(store, opened_at) + 1`, ngược lại 1.

`get_cash_shift_report`: chủ quán của quán đó, hoặc thu ngân có `opened_by` hay `closed_by` = `auth.uid()`; còn lại raise `'Không có quyền xem ca này'`. Tên người lấy như `get_bills_report`: `full_name`, rỗng thì `email`.

`set_require_cash_shift`: tắt khi còn ca mở raise `'Còn ca đang mở, kết ca trước khi tắt'`; ghi `store_workflow_setting_events` như `set_business_day_start`.

Vá `store_workflow_snapshot`, neo `'business_day_start', to_char(w.business_day_start, 'HH24:MI')` thêm `'require_cash_shift', w.require_cash_shift`. Để sự kiện cài đặt thấy trước và sau.

- [ ] **Step 4: Chạy test, phải PASS**

Run: lệnh Step 2.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/113_cash_shifts.sql supabase/tests/prod-defs/113 supabase/tests/113_cash_shifts.test.mjs
git commit -m "feat: mig 113 bang ca, khoan chi, RPC mo ket ca"
```

### Task 6: Gác ba RPC thu tiền

**Files:**
- Modify: `supabase/migrations/113_cash_shifts.sql` (thêm trước `NOTIFY`)
- Create: `supabase/tests/prod-defs/113/collect_table_bill.sql`, `confirm_manual_payment.sql`, `kitchen_confirm_payment.sql`
- Test: `supabase/tests/113_collect_shift_gate.test.mjs`

**Interfaces:**
- Consumes: `require_open_cash_shift` (Task 5); ba RPC sau mig 112, mỗi hàm có một câu `INSERT INTO ... bill_payments`.
- Produces: `bill_payments.cash_shift_id` có giá trị khi công tắc bật; lỗi `'Chưa mở ca'` khi bật mà không có ca.

Neo của task này chưa viết sẵn được vì mục A mới tạo ra các câu INSERT đó. Quy tắc viết neo, áp cho cả ba hàm:

1. Chụp định nghĩa sau mig 112 vào `prod-defs/113/`. Ghi rõ trong đầu migration hàm nào lẫn CRLF.
2. Neo là nguyên câu `INSERT INTO ... bill_payments (...) VALUES (...)`.
3. Bản thay gán `cash_shift_id` bằng `public.require_open_cash_shift(<biến store của hàm>)` ngay trong VALUES. Câu INSERT đã có cột đó với `NULL` thì thay giá trị, chưa có thì thêm cột. Không cần biến mới, không vá `DECLARE`.
4. Nếu trong hàm câu INSERT đứng **trước** nhánh trả kết quả cũ (`already`, replay `client_request_id`): dừng, báo Controller. Replay phải trả kết quả cũ kể cả khi ca đã đóng.

Nếu A dùng `INSERT ... SELECT`, thêm vào danh sách SELECT theo cùng cách.

- [ ] **Step 1: Chụp prod và viết test thất bại**

Tái dùng fixture test của mig 112 do plan A tạo: helper thì import, chưa có helper thì chép khối schema sang đầu file test này. Thêm `kitchen_store_id()` stub.

```js
test('công tắc tắt: thu như cũ, cash_shift_id NULL', ...)                         // cả 3 RPC
test('bật, không ca: báo Chưa mở ca, không ghi gì', async () => {
  // orders.payment_received_at vẫn NULL; không có dòng bill_payments; phiên vẫn mở
})
test('bật, có ca: bill_payments.cash_shift_id = ca, tiền vào két khi kết ca', ...)
test('thu chuyển khoản cũng phải có ca; dòng bank không cộng vào tiền mặt ca', ...)
test('replay client_request_id sau khi ca đã đóng: trả kết quả cũ, không báo Chưa mở ca', ...)
test('confirm_manual_payment đơn đã thu: vẫn already, không báo Chưa mở ca', ...)
test('kitchen_confirm_payment không có auth.uid(): gác vẫn chạy', ...)
test('gộp bill N mâm: một bill_payments, một cash_shift_id', ...)
test('stale không chặn thu: ca quên kết vẫn nhận tiền', ...)
test('thu ở ca mới không ăn vào ca cũ đã đóng', ...)
test('neo khớp đúng 1 lần trong prod-defs/113', ...)
```

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `PGLITE_MODULE=<...> node --test supabase/tests/113_collect_shift_gate.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Thêm ba lời vá vào mig 113**

Theo quy tắc trên. Thêm khối `$pre$` đầu file kiểm `bill_payments`, `bill_payment_lines`, `collect_table_bill(uuid[],jsonb,integer,uuid)`, `current_business_date(uuid)`.

- [ ] **Step 4: Chạy test, phải PASS**

Run: `PGLITE_MODULE=<...> node --test supabase/tests/113_cash_shifts.test.mjs supabase/tests/113_collect_shift_gate.test.mjs`, rồi các test của mig 112 và `110_*`.
Expected: PASS. Test 110 so neo trên `prod-defs/110` nên không bị ảnh hưởng.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/113_cash_shifts.sql supabase/tests/prod-defs/113 supabase/tests/113_collect_shift_gate.test.mjs
git commit -m "feat: gac ca o collect_table_bill, confirm_manual_payment, kitchen_confirm_payment"
```

### Task 7: Lớp TS cho ca và công tắc trong Cài đặt

**Files:**
- Create: `admin-web/lib/cash-shift.ts`, `admin-web/lib/cash-shift.test.ts`
- Create: `admin-web/lib/actions/cash-shift.ts`, `admin-web/lib/actions/cash-shift.test.ts`
- Create: `admin-web/lib/actions/cash-shift-reads.ts`
- Modify: `admin-web/lib/pos-browser-reads.ts` (thêm cuối file)
- Create: `admin-web/app/admin/settings/cash-shift-setting.tsx`
- Modify: `admin-web/app/admin/settings/page.tsx`

**Interfaces:**
- Consumes: RPC ở Task 5.
- Produces (`lib/cash-shift.ts`, thuần):
  - `type CashExpense = { id: string; amount: number; reason: string; createdAt: string; createdByName: string | null; voidedAt: string | null }`
  - `type OpenCashShift = { id: string; openedAt: string; openedByName: string | null; openingCash: number; openNote: string | null; stale: boolean; expenses: CashExpense[] }`
  - `type CashShiftState = { required: boolean; shift: OpenCashShift | null }`
  - `type CashShiftCloseResult = { shiftId: string; already: boolean; openingCash: number; cashCollected: number; expenseTotal: number; expectedCash: number; countedCash: number; difference: number }`
  - `type CashShiftListItem`, `type CashShiftReport` (đổi tên trường theo JSON Task 5 sang camelCase)
  - `parseCashShiftState(raw: unknown): CashShiftState`, `parseCashShiftList(raw: unknown): { required: boolean; shifts: CashShiftListItem[] }`, `parseCashShiftReport(raw: unknown): CashShiftReport | null`
  - `parseShiftCash(text: string): number | null`
  - `differenceLabel(difference: number): string`
- Produces (`lib/actions/cash-shift.ts`, `'use server'`, mọi hàm trả `{ ok: true, ... } | { ok: false, error: string }`):
  - `openCashShift(input: { openingCash: number; note: string | null })`
  - `closeCashShift(input: { shiftId: string; countedCash: number; note: string | null })` kèm `result: CashShiftCloseResult`
  - `addCashExpense(input: { shiftId: string; amount: number; reason: string })`
  - `voidCashExpense(expenseId: string)`
  - `continueStaleShift(shiftId: string)`
  - `saveRequireCashShift(enabled: boolean)`
- Produces (`lib/actions/cash-shift-reads.ts`, không `'use server'`, cho server component): `loadCashShiftList(storeId: string)`, `loadCashShiftReport(shiftId: string)`, `loadCashShiftRequired(storeId: string): Promise<boolean>`.
- Produces (`lib/pos-browser-reads.ts`): `readCashShiftState(client, storeId): Promise<{ ok: true; state: CashShiftState } | { ok: false; error: string }>`, `readCashShiftReport(client, shiftId): Promise<{ ok: true; report: CashShiftReport } | { ok: false; error: string }>`.

- [ ] **Step 1: Viết test thất bại**

```ts
describe('parseShiftCash', () => {
  it('kiểu Việt Nam', () => {
    expect(parseShiftCash('500.000')).toBe(500000)
    expect(parseShiftCash('500k')).toBe(500000)
    expect(parseShiftCash('1.000.000đ')).toBe(1000000)
  })
  it('0 hợp lệ, rỗng không', () => {
    expect(parseShiftCash('0')).toBe(0)
    expect(parseShiftCash('')).toBeNull()
    expect(parseShiftCash('   ')).toBeNull()
    expect(parseShiftCash('abc')).toBeNull()
  })
  it('vượt int4 bị chặn', () => expect(parseShiftCash('3000000000')).toBeNull())
})
it('differenceLabel', () => {
  expect(differenceLabel(0)).toBe('Khớp')
  expect(differenceLabel(-50000)).toBe('Thiếu 50.000đ')
  expect(differenceLabel(20000)).toBe('Thừa 20.000đ')
})
it('parseCashShiftState: rác và null an toàn, required false', ...)
it('parseCashShiftReport: ca mở giữ null, không ép về 0', ...)
```

`cash-shift.test.ts` cho action: lỗi quyền trả `{ok:false}`, RPC lỗi trả nguyên message, `closeCashShift` trả đủ `result`, số âm không gọi RPC.

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `cd admin-web && npx vitest run lib/cash-shift.test.ts lib/actions/cash-shift.test.ts`
Expected: FAIL.

- [ ] **Step 3: Viết `lib/cash-shift.ts`, `lib/actions/cash-shift.ts`, `cash-shift-reads.ts`, hai hàm đọc trong `pos-browser-reads.ts`**

`parseShiftCash` gọi `parseVnd` của `lib/cash-change.ts`, chặn trên `2_147_483_647`. Action dùng `createClient()` theo phiên; `requirePosOperatorStoreId`, riêng `saveRequireCashShift` dùng `requireStoreOwnerStoreId`; đều nằm trong `try/catch`. `saveRequireCashShift` gọi `revalidatePath('/admin', 'layout')`.

- [ ] **Step 4: Viết `cash-shift-setting.tsx`, gắn vào `page.tsx`**

`Switch` nhãn `Bắt buộc mở ca trước khi thu tiền`, gợi ý `Bật thì thu ngân phải mở ca mới thu được tiền. Cuối ca đếm két và in phiếu bàn giao.`. Lưu ngay khi gạt, lỗi thì trả công tắc về cũ và hiện lỗi. Đặt trong cùng section với giờ bắt đầu ngày.

- [ ] **Step 5: Chạy test, phải PASS**

Run: `cd admin-web && npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add admin-web/lib admin-web/app/admin/settings
git commit -m "feat: lop TS cho ca va cong tac bat buoc mo ca"
```

### Task 8: Ca trên POS

**Files:**
- Create: `admin-web/app/admin/pos/use-cash-shift.ts`
- Create: `admin-web/app/admin/pos/shift-controls.tsx`, `admin-web/app/admin/pos/shift-controls.test.tsx`
- Modify: `admin-web/app/admin/pos/pos-client.tsx:995`, `:1018`

**Interfaces:**
- Consumes: `readCashShiftState`, các action Task 7, `ConfirmDialog`, `Dialog`.
- Consumes: `printDocument({ kind: 'shift_report', shiftId })` của `lib/print/print-document.ts` (plan C Part 1). Spec cho phép agent In xong muộn, nên nếu file đó chưa có trên `main` thì gọi `printInPlace('/print/shift-report?id=' + shiftId)`, plan C Part 2 đổi sau.
- Produces: `useCashShift(storeId: string): { state: CashShiftState | null; reload: () => void }`; `<ShiftControls state reload openTablesCount />`; `<ShiftStaleBanner state reload onCloseOld />`.

Không sửa `PaymentView`: lỗi `Chưa mở ca` đi theo đường báo lỗi có sẵn. Tránh đụng agent VietQR ghép.

- [ ] **Step 1: Viết test thất bại**

`renderToStaticMarkup`:

```ts
it('required false: không vẽ gì', ...)
it('chưa có ca: nút Mở ca', ...)
it('có ca: nút Ca thu ngân kèm giờ mở', ...)
it('form kết ca không chứa số dự kiến trước khi xác nhận', ...)
it('kết quả: hiện dự kiến, đếm được, Thiếu 50.000đ', ...)
it('còn 3 bàn mở: cảnh báo Còn 3 bàn đang mở', ...)
it('banner stale có đủ hai lựa chọn', ...)
```

Tách các phần vẽ thành component nhận props để test được không cần effect.

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `cd admin-web && npx vitest run app/admin/pos/shift-controls.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Viết `use-cash-shift.ts`**

Đọc khi mount, mỗi 15 giây, khi `focus`, theo mẫu `use-service-requests.ts`. Đọc lỗi thì giữ `state` cũ. RPC chưa có (Vercel lên trước migration) thì `state` null và POS như hôm nay.

- [ ] **Step 4: Viết `shift-controls.tsx`**

`state` null hoặc `required` false: không vẽ gì.

- **Nút trên thanh trên.** Không có ca: `Mở ca`. Có ca: `Ca thu ngân · từ HH:MM`. Không ghi trơn "Ca": pill ở `pos-client.tsx:980` đang dùng "Ca 17:00–23:00" cho giờ phục vụ.
- **Hộp mở ca.** Tự bật một lần mỗi lần vào POS khi chưa có ca, đóng được để xem POS. Ô `Tiền đầu ca`, ô `Ghi chú`. Rỗng thì khoá nút.
- **Panel ca** (`Dialog placement="side"`): người mở, giờ mở, tiền đầu ca, danh sách khoản chi (khoản đã huỷ gạch ngang), nút `Chi tiền từ két`, nút `Kết ca`. Huỷ khoản chi qua `ConfirmDialog`.
- **Hộp chi tiền.** Ô số tiền, ô lý do bắt buộc. Khoá nút trong lúc gửi vì RPC không có khoá chống trùng.
- **Hộp kết ca** (`dismissible={false}`). Ô `Tiền đếm được`, ô ghi chú. `openTablesCount > 0` thì hiện `Còn N bàn đang mở. Tiền thu sau khi kết sẽ vào ca kế tiếp.`.
- **Kết quả kết ca.** Giữ trong state riêng để lần đọc định kỳ không xoá mất. Hiện tiền dự kiến, đếm được, `differenceLabel`. Nút `In phiếu bàn giao`, `Mở ca mới`, `Đóng`.
- **Mất mạng lúc xác nhận.** `closeCashShift` trả lỗi thì giữ nguyên số đã nhập cho bấm lại; server trả `already` nên an toàn.

`ShiftStaleBanner`: `state.shift?.stale` thì hiện băng vàng `Ca mở từ <ngày giờ> chưa kết.` kèm hai nút `Kết ca cũ rồi mở ca mới` (mở hộp kết ca) và `Tiếp tục gộp vào ca đó` (`continueStaleShift`). Băng không chặn POS, server cũng không chặn thu.

Trạng thái hộp giữ trong `ShiftControls`; banner gọi `onCloseOld` để mở hộp kết ca. Giữ hai thứ trong một wrapper nếu vị trí cho phép, hoặc nâng state `closeOpen` lên `pos-client.tsx`.

Con của `<Dialog>` vẫn sống khi đóng: vẽ form có điều kiện để form mở lại là form trống.

- [ ] **Step 5: Gắn vào `pos-client.tsx`**

Sau `<PosLockButton />` dòng 995 thêm `<ShiftControls ... />`. Trước khối `{mergeMode && (` dòng 1018 thêm banner. `openTablesCount` = `sessions.filter((s) => s.status === 'open').reduce((n, s) => n + s.tables.length, 0)`.

- [ ] **Step 6: Chạy test, phải PASS**

Run: `cd admin-web && npx vitest run && npx tsc --noEmit && npx eslint app/admin/pos`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add admin-web/app/admin/pos
git commit -m "feat: mo ca, chi tien tu ket, ket ca tren POS"
```

### Task 9: Phiếu bàn giao 80mm

**Files:**
- Create: `admin-web/app/print/shift-report/page.tsx`
- Create: `admin-web/app/print/shift-report/shift-report-slip.tsx`, `shift-report-slip.test.tsx`

**Interfaces:**
- Consumes: `loadCashShiftReport`, `CashShiftReport`, `differenceLabel`.
- Produces: URL `/print/shift-report?id=<shiftId>`; `<ShiftReportSlip report storeName printedAt printedBy />` nhận props thuần để `/print/agent` của plan C dùng lại với dữ liệu từ `cash_shift_report_json`.

- [ ] **Step 1: Viết test thất bại**

```ts
it('đủ các dòng spec: người mở, người kết, giờ mở, giờ đóng, tiền đầu ca, tiền mặt thu, khoản chi, tiền dự kiến, tiền đếm được, chênh lệch, số bill, tổng TM, tổng CK, ghi chú', ...)
it('giờ in theo giờ VN', ...)
it('carriedDays 3: có dòng Ca gộp qua 3 ngày; 1: không có', ...)
it('liệt kê khoản chi, bỏ khoản đã huỷ', ...)
```

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `cd admin-web && npx vitest run app/print/shift-report`
Expected: FAIL.

- [ ] **Step 3: Viết slip và page**

Slip theo mẫu `day-report-slip.tsx` (CSS 80mm, `useAutoPrint`, nút In lại, khối ký), tiêu đề `PHIẾU BÀN GIAO CA`. Page theo mẫu `print/day-report/page.tsx`, nằm ngoài khung `/admin`: `requireAdminPageOrRedirect('pos')`, không có `id` hoặc RPC lỗi thì hiện lỗi; `status = 'open'` thì hiện `Ca chưa kết, chưa có phiếu bàn giao`, không tự in.

- [ ] **Step 4: Chạy test, phải PASS**

Run: `cd admin-web && npx vitest run app/print && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add admin-web/app/print/shift-report
git commit -m "feat: phieu ban giao ca 80mm"
```

### Task 10: Tab Ca trong Hoá đơn & Báo cáo

**Files:**
- Create: `admin-web/app/admin/bills/bills-tabs.tsx`
- Create: `admin-web/app/admin/bills/shifts-panel.tsx`, `shifts-panel.test.tsx`
- Modify: `admin-web/app/admin/bills/bills-screen.tsx:27`, `:39-55`

**Interfaces:**
- Consumes: `loadCashShiftList`, `readCashShiftReport`, `CashShiftListItem`, `differenceLabel`, `printDocument` (hoặc `printInPlace` như Task 8).
- Produces: `<BillsTabs showShifts shifts>{children}</BillsTabs>`.

Tab giữ bằng state client, không dùng URL. Lý do: trên trang đầy đủ, điều hướng mềm bị `@modal/(.)bills` bắt và hiện chồng hộp thoại (xem comment `report-date-picker.tsx`).

- [ ] **Step 1: Viết test thất bại**

```ts
it('showShifts false: chỉ render children, không có thanh tab', ...)
it('danh sách: người mở, giờ, tiền đầu ca, chênh lệch bằng differenceLabel', ...)
it('ca đang mở: nhãn Đang mở, không hiện dự kiến và chênh lệch', ...)
it('trống: Chưa có ca nào', ...)
```

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `cd admin-web && npx vitest run app/admin/bills/shifts-panel.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Viết `bills-tabs.tsx`, `shifts-panel.tsx`**

`Tabs` variant `underline`, hai tab `Hoá đơn` và `Ca`. `showShifts` = `list.required || list.shifts.length > 0`, nên quán chưa bật không thấy gì mới.

`ShiftsPanel`: bảng 60 ca gần nhất, ghi rõ con số đó ở chân bảng. Bấm một ca mở `Dialog placement="side"`, đọc `readCashShiftReport` một lần khi mở, hiện đủ dòng phiếu kèm khoản chi, nút `In lại phiếu` chỉ khi ca đã đóng. Dùng lại `Badge`, `EmptyState`.

- [ ] **Step 4: Gắn vào `bills-screen.tsx`**

Thêm `loadCashShiftList(operator.storeId)` vào `Promise.all` dòng 27; lỗi thì coi như `{ required: false, shifts: [] }`, tab không được làm hỏng báo cáo. Bọc `BillsReportView` trong `BillsTabs`.

- [ ] **Step 5: Chạy test, phải PASS**

Run: `cd admin-web && npx vitest run && npx tsc --noEmit && npx eslint app/admin/bills`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add admin-web/app/admin/bills
git commit -m "feat: tab Ca trong Hoa don va Bao cao"
```

### Task 11: Checklist Part 2

**Files:**
- Create: `docs/testing/dot1/B2-ca-va-khoan-chi.md`
- Create: `docs/testing/dot1/sql/b2-verify.sql`
- Modify: `TESTING.md`, `CLAUDE.md`

- [ ] **Step 1: Viết `b2-verify.sql`**

Theo mẫu `docs/testing/chuyen-ban-giam-gia/sql/gg-verify.sql`: chạy trong một transaction, cuối `ROLLBACK`, `RAISE EXCEPTION 'FAIL ...'` khi lệch. Kiểm công thức két và `cash + bank + other = revenue` trên dữ liệu thật.

- [ ] **Step 2: Viết checklist**

Test trên Bảo Lương, ngoài giờ mở cửa, món rẻ nhất, ghi số đã thu để trừ khi đối chiếu. Các bài:
1. Công tắc tắt: POS, A04 như trước.
2. Bật công tắc: POS hiện hộp mở ca, đóng được, xem POS bình thường.
3. Chưa mở ca: thu tiền báo `Chưa mở ca` ở POS, `/staff/tables`, ngăn A04; bàn không bị đóng dở.
4. Mở ca 500.000, thu 1 bill tiền mặt, 1 bill chuyển khoản, 1 bill kết hợp.
5. Chi tiền từ két, huỷ một khoản chi.
6. Kết ca đếm khớp: chênh lệch `Khớp`, không thấy số dự kiến trước khi xác nhận.
7. Mở ca mới, kết ca lệch: `Thiếu ...`, in phiếu đủ dòng.
8. Kết ca khi còn bàn mở: có cảnh báo, thu bàn đó ở ca kế tiếp.
9. Thu bill cũ ở A04: tiền vào ca đang mở.
10. Tắt công tắc khi còn ca mở: bị từ chối.
11. Ca quên kết: dùng `UPDATE` lùi `opened_at` trên quán thử, cảnh báo hiện; Tiếp tục thì cảnh báo tắt và phiếu ghi `Ca gộp qua N ngày`; hoặc Kết ca cũ rồi mở ca mới.
12. Tab Ca: chủ quán thấy mọi ca; thu ngân chỉ ca của mình; gõ tay URL phiếu ca người khác bị chặn.
13. Đổi người giữa ngày: kết ca, thu ngân khác mở ca mới.
14. Quán Zalo trả trước: không bị ảnh hưởng.

- [ ] **Step 3: Thêm link `TESTING.md`, dòng quyết định `CLAUDE.md`, commit**

Dòng `CLAUDE.md` ghi: mig 113, hai cột `continued_*`, khoá `FOR SHARE`/`FOR UPDATE`, không cho tắt công tắc khi còn ca mở, `cash_shift_report_json` cho service role.

```bash
git add docs/testing/dot1 TESTING.md CLAUDE.md
git commit -m "docs: checklist ca va khoan chi"
```

- [ ] **Step 4: Dừng, báo anh Tú**

"Xong rồi anh, test theo `docs/testing/dot1/B2-ca-va-khoan-chi.md` nhé." Chờ PASS rồi mới merge.

### Controller áp migration 113 (không phải việc của agent code)

1. Kiểm 112a, 112b đã áp, và neo trong mig 113 vẫn khớp định nghĩa prod lúc áp. Áp theo thứ tự 111 → 112 → 113 → 114.
2. Áp `113_cash_shifts.sql`.
3. Deploy Vercel. Công tắc mặc định tắt nên thứ tự không gây lỗi: POS đọc lỗi thì không hiện gì.
4. Kiểm: `SELECT count(*) FROM store_workflow_settings WHERE require_cash_shift` ra 0; thu một bill ở quán không bật vẫn được, `cash_shift_id` NULL.
5. Không bật công tắc cho quán thật trước khi anh Tú PASS.
