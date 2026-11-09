# Yên Garden CFG: Tạo bàn hàng loạt + In tự động khi đơn vào bếp ngay — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chủ quán tạo một loạt bàn theo khu trong một lần (A1…A20); quán chạy chế độ phần mềm in vẫn đổi được chính sách đơn vào bếp sang "Tự động", và khi đó POS ở quầy tự xếp phiếu bếp cho đơn vừa vào bếp.

**Architecture:** Mig 121 chỉ gỡ trigger khoá `print_mode` ↔ policy của mig 114; form Cài đặt bỏ lời chặn tương ứng. POS đọc cấu hình in + chính sách bằng client trình duyệt, lọc đơn tự vào bếp từ danh sách phiên đã có, rồi gọi **một** server action theo lô cho đơn mới. Server action kiểm lại từng đơn bằng giờ server và cùng một hàm thuần, rồi gọi `enqueuePrint({kind:'order'})` — đúng đường chia phiếu theo trạm của "Duyệt & in bếp"; khoá chống trùng tự nhiên `order:<id>:kitchen:<stationId>` / `order:<id>:table` (upsert `ignoreDuplicates`) giữ cho hai tab POS không in đôi. Tạo bàn hàng loạt là một hàm thuần sinh tên + một server action chèn một lệnh.

**Tech Stack:** Postgres (Supabase), Next.js 16 App Router, React 19, vitest, `node --test` + PGlite.

**Spec:** `docs/superpowers/specs/2026-11-09-yen-garden-trien-khai-design.md` §5.1, §5.2 (nền: `docs/superpowers/specs/2026-11-05-dot1-thanh-toan-ca-in-vietqr-design.md` §5, §7). Hợp đồng chung: `docs/superpowers/plans/2026-11-09-yg-hop-dong-chung.md`.

## Quyết định kỹ thuật đã chốt trong plan này

**POS biết "đơn đã tự vào bếp" bằng dữ liệu nó đang đọc sẵn.** `list_open_table_sessions` (POS đọc qua `readOpenSessions`) trả mỗi đơn `id, status, created_at, order_source, payment_received_at`, KHÔNG trả `confirmed_at` lẫn `payment_method` (đã kiểm `supabase/tests/prod-defs/108/list_open_table_sessions.sql`). Đơn trong phiên luôn là đơn tại bàn của quán trả sau, mà `create_order` ép `payment_method='cash'` cho loại đơn này, nên ở trình duyệt coi `paymentMethod='cash'`, `confirmedAt=null`. Đây chỉ là **lọc sơ bộ** để bớt gọi server; quyết định cuối nằm ở server action, đọc đủ cột thật của `orders`.

**Không đọc `print_jobs` từ trình duyệt** (bảng khoá hẳn với `authenticated`, mig 114). "Đã có job in bếp chưa" dựa vào khoá chống trùng tự nhiên của `enqueuePrint`: gọi lại cho đơn đã xếp hàng trả `queued: 0`, không tạo dòng mới, kể cả khi job cũ đã `done`/`failed`/`expired`. Nên job lỗi không bao giờ tự in lại; người xử lý qua nút In lại (QRIN, Part 2 Task 12).

**Một server action theo lô, không phải một lần gọi cho mỗi đơn.** Mở lại POS giữa giờ đông có thể có 20–30 đơn trong 30 phút gần nhất; gọi từng đơn sẽ xếp hàng chặn điều hướng (CLAUDE.md 2026-10-04). Lô tối đa 20 đơn. Server action chỉ được gọi khi có đơn mới cần in, không gọi định kỳ.

**Server quyết bằng giờ server.** Máy quầy lệch giờ thì quy tắc 30 phút vẫn đúng. Server cũng bỏ qua đơn có `confirmed_at` (đã qua nút "Duyệt & in bếp", nút đó tự in) và đơn mà chính sách hiện tại của nguồn không còn là `automatic` (cache POS cũ tối đa 30 giây).

**Phạm vi in tự động: đơn trong phiên bàn đang mở**, tức quán trả sau. Quán trả trước không có phiên nên POS không thấy đơn; khi đó POS hiện băng cảnh báo thay vì băng "giữ POS mở" **[em]**. Yên Garden là trả sau.

**Tên bàn trùng kiểm ở action.** `tables` không có ràng buộc unique `(store_id, table_number)` (đã kiểm `001_init.sql`, `048_pos_table_areas.sql`, `103b_baseline_prod_drift.sql`), nên không cần migration. So khớp sau khi chuẩn hoá (bỏ khoảng trắng hai đầu, gộp khoảng trắng giữa, NFC, chữ thường), so với **mọi** bàn của quán kể cả bàn đã Đóng **[em]**. Hai chủ quán bấm Tạo cùng lúc có thể ra tên trùng: chấp nhận, chỉ chủ quán làm được.

## Global Constraints

- Mig 121 chỉ `DROP TRIGGER` + `DROP FUNCTION` của mig 114, không vá hàm sống nào, không tạo đối tượng mới.
- Không poll bằng server action trên POS. Cấu hình in và chính sách đọc qua `lib/pos-browser-reads.ts`; server action chỉ chạy khi có đơn mới cần in.
- Server action có lỗi người dùng trả `{ok:false,error}`, không ném. Action dùng `createAdminClient` phải tự kiểm quyền và lọc `store_id` ở mọi truy vấn.
- Đơn cũ hơn **30 phút** (tính từ lúc vào bếp, theo giờ server) không tự in. Lô tối đa **20** đơn. Tạo bàn tối đa **100** bàn một lần.
- Băng POS đúng chữ: `Đơn tự vào bếp — giữ POS mở để in`.
- Mỗi đơn xét theo chính sách của nguồn: `order_source='staff'` → `staff_order_release_policy`, còn lại → `kitchen_release_policy`. Không bao giờ tự in đơn `pos` hoặc `reservation_preorder`.
- `pos-client.tsx` là điểm nóng chung với CA, NO, QRIN: chỉ thêm một lời gọi hook và một khối băng. `lib/actions/print-jobs.ts` không sửa (QRIN Part 2 Task 12 sửa file này).
- Text UI tiếng Việt, comment logic khó bằng tiếng Việt. Không `window.confirm` mới; dùng `Dialog`/`ConfirmDialog` có sẵn. Trang `/admin/tables` đọc tốt ở 375px.
- Mỗi worktree `npm ci` trong `admin-web` trước khi chạy test.
- Commit: `feat: ...` / `fix: ...` / `chore: ...` / `docs: ...`, không kèm dòng ghi tên tác giả. Không áp migration prod, không push, không merge `main`.

**Lệnh test dùng lại trong plan (PowerShell, chạy trong `admin-web`):**

```powershell
$env:PGLITE_MODULE="$PWD/node_modules/@electric-sql/pglite/dist/index.js"; node --test ../supabase/tests/121_print_policy_guard_drop.test.mjs
npx vitest run <file>; npx tsc --noEmit
npm test; npm run lint
```

## Review Focus

1. **Hai tab / hai máy POS cùng mở lúc đơn tự vào bếp:** người dùng mong ra đúng một bộ phiếu. Test ở Task 4 (`queued: 0` → `already`) dựa trên upsert `ignoreDuplicates` của `enqueuePrint`.
2. **Mở lại POS sau khi tắt lâu, hoặc máy quầy lệch giờ:** đơn vào bếp quá 30 phút không in, dù giờ máy quầy nói khác. Test ở Task 4 (giờ server 29/31 phút) và Task 3 (đơn khách trả trước tính từ `payment_received_at`).
3. **Chủ quán vừa đổi `automatic` → `pos_confirmation` mà POS còn giữ cấu hình cũ:** đơn đang chờ duyệt không được tự in. Test ở Task 4 (server đọc chính sách hiện tại → `skipped`).
4. **Hai chính sách khác nhau** (khách chờ duyệt, nhân viên tự động): chỉ đơn nhân viên tự in; đơn khách chờ "Duyệt & in bếp". Test ở Task 3.
5. **Tạo bàn trùng tên khác hoa/thường hoặc khoảng trắng** (`a1`, ` A1 `) và cả loạt đều trùng: báo bỏ qua, không lỗi, không chèn dòng rỗng. Test ở Task 6.

---

### Task 1: Mig 121 gỡ trigger khoá chế độ in

**Files:**
- Create: `supabase/migrations/121_drop_print_mode_policy_guard.sql`
- Create: `supabase/tests/121_print_policy_guard_drop.test.mjs`

**Interfaces:**
- Consumes: mig 114 (`print_mode_policy_guard` trigger trên `store_workflow_settings`, hàm `print_mode_policy_guard()`, `set_print_mode`, `print_stations`)
- Produces: không đối tượng mới. Sau 121: `print_mode='agent'` sống chung được với `kitchen_release_policy`/`staff_order_release_policy` = `automatic`.

- [ ] **Step 1: Viết test**

Dựng fixture y hệt `before()` của `supabase/tests/114_print_stations_jobs.test.mjs:44-83` (role, `auth.uid()`, `stores`, `mevo_operators`, `is_store_owner_of`, `is_store_pos_operator`, `store_workflow_settings`, `menu_categories`, cùng dữ liệu `store` = cả hai `pos_confirmation`, `otherStore` = cả hai `automatic`), rồi `exec` file 114 và file 121.

```js
test('trigger và hàm print_mode_policy_guard không còn', ...)
  // SELECT count(*) FROM pg_trigger WHERE tgname = 'print_mode_policy_guard' → 0
  // SELECT to_regprocedure('public.print_mode_policy_guard()') → null
test('bật agent được khi cả hai policy là automatic', ...)
  // rpc(otherOwner, set_print_mode(otherStore,'agent')) → mode 'agent'; tạo Quầy + Bếp (count 2)
test('đang agent đổi policy về automatic được', ...)
  // store: set_print_mode agent rồi UPDATE kitchen_release_policy='automatic', staff_order_release_policy='automatic' → không lỗi, đọc lại đúng
test('set_print_mode vẫn chỉ cho chủ quán', ...)       // cashier → rejects /Không có quyền/
test('chạy lại 121 lần hai không lỗi', ...)            // db.exec(sql121) lần nữa
```

- [ ] **Step 2: Chạy test, thấy FAIL** (chưa có file migration)

- [ ] **Step 3: Viết `121_drop_print_mode_policy_guard.sql`**

Đầu file ghi chú: vì sao gỡ (anh Tú cần đổi chính sách sau một thời gian vận hành, spec Yên Garden §4.2 + §5.2; đường in tự động nằm ở POS); chỉ drop, không vá hàm sống; hàm `set_print_mode` của 114 vẫn còn dòng comment nhắc trigger, cố ý không sửa vì sửa phải `CREATE OR REPLACE` hàm sống. Thân file:

```sql
DROP TRIGGER IF EXISTS print_mode_policy_guard ON public.store_workflow_settings;
DROP FUNCTION IF EXISTS public.print_mode_policy_guard();
```

- [ ] **Step 4: Chạy test 121 và test 114, thấy PASS** (test 114 chỉ nạp file 114 nên các bài về trigger vẫn đúng với riêng mig đó)

- [ ] **Step 5: Commit** — `git commit -m "feat: mig 121 go trigger khoa che do phan mem in voi chinh sach vao bep"`

---

### Task 2: Cài đặt bỏ lời chặn chế độ phần mềm in

**Files:**
- Modify: `admin-web/lib/print/print-settings.ts:36-39` (xoá `canUseAgentMode`)
- Modify: `admin-web/app/admin/settings/print-settings-section.tsx:18,63,96-106`
- Modify: `admin-web/app/admin/settings/print-settings-section.test.tsx:68-77`
- Modify: `admin-web/app/admin/settings/workflow-settings-form.tsx:15-22,35-41,49-62,94-95,326-343`
- Modify: `admin-web/app/admin/settings/workflow-settings-form.test.tsx:49-82`
- Modify: `admin-web/app/admin/settings/page.tsx:98`
- Modify: `admin-web/lib/actions/print-settings.ts:30` (chỉ sửa comment)

**Interfaces:**
- Consumes: không
- Produces: `WorkflowSettingsForm` bỏ prop `printMode` (hai nơi dùng: `app/admin/settings/page.tsx`, `app/mevo/stores/[storeId]/page.tsx` — nơi thứ hai vốn không truyền). `PrintSettings` giữ nguyên hai trường policy (dùng cho ghi chú bên dưới).

Hành vi mới:
- Ô "Nhiều nơi (qua phần mềm in)" chỉ khoá khi `pending`. Lời gợi ý luôn là câu hiện có `Phiếu bếp ra máy in bếp, phiếu quầy ra máy in quầy, qua phần mềm in cài ở quầy.`
- Khi `mode='agent'` và ít nhất một policy là `automatic`: trong khối In ấn, ngay dưới fieldset, hiện `<p>` chữ `Có đơn vào bếp tự động: phiếu bếp của các đơn này chỉ in khi màn POS đang mở ở quầy.`
- Form Quy trình: hai `PolicySelect` không còn `disabled`, không còn câu `Đang dùng phần mềm in, phải giữ thu ngân xác nhận.`; xoá `lockPoliciesForPrintMode` và `useEffect` đồng bộ draft theo `printMode`; `applyPreset` gọi thẳng `applyWorkflowPreset(key)`.
- Comment ở `print-settings.ts:30`: bỏ phần "trigger DB chặn bật agent", giữ ý "giữ nguyên câu lỗi RPC".

- [ ] **Step 1: Đổi test**

```tsx
// print-settings-section.test.tsx — thay bài 'policy automatic: nút Nhiều nơi bị khoá kèm giải thích'
it('policy automatic, đang browser: Nhiều nơi chọn được', () => {
  const html = render({ ...base, kitchen_release_policy: 'automatic' })
  expect(html).not.toMatch(/<input(?=[^>]*value="agent")(?=[^>]*disabled="")[^>]*>/)
})
it('agent + một policy automatic: có ghi chú giữ POS mở', () => {
  expect(render({ ...agentSettings, staff_order_release_policy: 'automatic' })).toContain('chỉ in khi màn POS đang mở ở quầy')
})
it('agent + cả hai pos_confirmation: không có ghi chú', () => {
  expect(render(agentSettings)).not.toContain('chỉ in khi màn POS đang mở')
})
// workflow-settings-form.test.tsx — xoá 2 bài dùng printMode (dòng 49-62, 71-82), giữ bài dòng 64-69, thêm:
it('quán automatic: hai ô policy không bị khoá', () => {
  const html = renderToStaticMarkup(createElement(WorkflowSettingsForm, {
    initial: { ...PUBU_PRESET, kitchenReleasePolicy: 'automatic', staffOrderReleasePolicy: 'automatic' },
    context: 'owner', onSave: vi.fn(async () => undefined) }))
  expect((html.match(/<option value="automatic" selected/g) ?? []).length).toBe(2)
  expect(html).not.toContain('Đang dùng phần mềm in')
})
```

- [ ] **Step 2: Chạy `npx vitest run app/admin/settings`, thấy FAIL**
- [ ] **Step 3: Sửa code theo "Hành vi mới"**
- [ ] **Step 4: Chạy `npx vitest run app/admin/settings lib/actions/print-settings.test.ts; npx tsc --noEmit`, thấy PASS** (`tsc` bắt mọi chỗ còn truyền `printMode` hoặc import `canUseAgentMode`)
- [ ] **Step 5: Commit** — `git commit -m "feat: Cai dat cho bat phan mem in khi don vao bep tu dong"`

---

### Task 3: Hàm thuần nhận diện đơn cần tự in

**Files:**
- Create: `admin-web/lib/print/auto-kitchen-print.ts`, `admin-web/lib/print/auto-kitchen-print.test.ts`

**Interfaces:**
- Consumes: `orderInKitchen`, `KitchenReleasePolicy`, `StorePaymentTiming` từ `lib/kitchen-announce.ts`; `OpenTableSession` từ `lib/actions/table-session.ts` (chỉ import type)
- Produces:

```ts
export const AUTO_PRINT_MAX_AGE_MS = 30 * 60_000
export const AUTO_PRINT_BATCH_MAX = 20
export type AutoPrintConfig = {
  mode: 'browser' | 'agent'
  kitchenReleasePolicy: KitchenReleasePolicy
  staffOrderReleasePolicy: KitchenReleasePolicy
  paymentTiming: StorePaymentTiming
}
export type AutoPrintOrder = {
  status: string; orderSource: string; createdAt: string
  paymentReceivedAt: string | null; paymentMethod: string; confirmedAt: string | null
}
export function isAutoKitchenOrder(o: AutoPrintOrder, cfg: AutoPrintConfig, nowMs: number): boolean
export function autoKitchenPrintCandidates(
  sessions: Pick<OpenTableSession, 'status' | 'table_number' | 'orders'>[], cfg: AutoPrintConfig, nowMs: number,
): { orderId: string; tableLabel: string }[]
export function autoPrintBanner(cfg: AutoPrintConfig | null): { tone: 'info' | 'warning'; title: string } | null
export function createAutoPrintTracker(opts?: { maxAttempts?: number; retryMs?: number }): {
  due(orderIds: string[], nowMs: number): string[]
  start(orderIds: string[]): void
  finish(orderId: string, outcome: 'done' | 'failed', nowMs: number): 'done' | 'retry' | 'gave_up'
}
```

Quy tắc `isAutoKitchenOrder`, theo thứ tự, sai ở bước nào trả `false` ở bước đó:
1. `cfg.mode === 'agent'`.
2. `orderSource` không phải `pos`, `reservation_preorder`.
3. Chính sách của nguồn (`staff` → `staffOrderReleasePolicy`, còn lại → `kitchenReleasePolicy`) là `automatic`.
4. `confirmedAt === null`.
5. `status` thuộc `pending | confirmed | cooking | ready` (màn bếp có thể đã đẩy sang `cooking` trước khi POS kịp đọc).
6. Đã vào bếp: `orderInKitchen({...các trường, status: 'confirmed'})` đúng. Không chép lại luật trả trước/trả sau — dùng chung với màn bếp.
7. Lúc vào bếp `enteredAt` = `max(createdAt, paymentReceivedAt)` khi nguồn không phải `staff` và có `paymentReceivedAt` (đơn khách trả trước vào bếp lúc có tiền), còn lại `createdAt`. `nowMs - enteredAt <= AUTO_PRINT_MAX_AGE_MS`; `enteredAt` ở tương lai (lệch giờ) coi như mới.

`autoKitchenPrintCandidates`: chỉ phiên `status === 'open'`; mỗi đơn map `confirmedAt: o.confirmed_at ?? null` (RPC không trả cột này) và `paymentMethod: 'cash'` (comment: đơn trong phiên là đơn tại bàn quán trả sau, `create_order` ép `cash`); `tableLabel = session.table_number`.

`autoPrintBanner`: `null` khi `cfg` null, `mode='browser'`, hoặc cả hai policy `pos_confirmation`. Trả sau → `{tone:'info', title:'Đơn tự vào bếp — giữ POS mở để in'}`. Trả trước → `{tone:'warning', title:'Quán trả trước chưa tự in được phiếu bếp cho đơn tự vào bếp — đặt hai mục “xuống bếp” về “Chờ POS xác nhận” ở Cài đặt'}`.

Tracker: mặc định `maxAttempts = 3`, `retryMs = 30_000`. `due` loại id đã `done`, đã `gave_up`, đang chạy (`start` mà chưa `finish`), hoặc thất bại gần hơn `retryMs`. `finish('failed')` lần thứ `maxAttempts` trả `gave_up`.

- [ ] **Step 1: Viết test**

```ts
const cfg: AutoPrintConfig = { mode: 'agent', kitchenReleasePolicy: 'automatic', staffOrderReleasePolicy: 'automatic', paymentTiming: 'postpay' }
const now = Date.parse('2026-12-01T12:00:00Z')
const ord = (p: Partial<AutoPrintOrder>): AutoPrintOrder => ({ status: 'pending', orderSource: 'customer_zalo',
  createdAt: '2026-12-01T11:55:00Z', paymentReceivedAt: null, paymentMethod: 'cash', confirmedAt: null, ...p })

it('trả sau, đơn khách pending automatic: in', () => expect(isAutoKitchenOrder(ord({}), cfg, now)).toBe(true))
it('mode browser: không in')
it('đơn pos và reservation_preorder: không in')
it('khách pos_confirmation + nhân viên automatic: đơn staff in, đơn khách không', ...)
it('nhân viên pos_confirmation + khách automatic: đơn khách in, đơn staff không', ...)
it('đã có confirmedAt: không in')
it('cooking và ready vẫn in; paid và cancelled không', ...)
it('trả trước, khách chưa trả tiền: không in; có paymentReceivedAt: in', ...)
it('29 phút in, 31 phút không', ...)
it('trả trước: tạo 40 phút trước nhưng trả tiền 5 phút trước: in', ...)
it('createdAt ở tương lai: in', ...)
it('candidates: bỏ phiên closed, đơn không có confirmed_at vẫn xét được, kèm tableLabel', ...)
it('banner: browser null; cả hai pos_confirmation null; trả sau đúng chữ "Đơn tự vào bếp — giữ POS mở để in"; trả trước tone warning', ...)
it('tracker: id đã done không due lại; đang chạy không due', ...)
it('tracker: lỗi lần 1 chờ 30 giây mới due lại; lỗi lần 3 trả gave_up và không bao giờ due nữa', ...)
```

- [ ] **Step 2: Chạy `npx vitest run lib/print/auto-kitchen-print.test.ts`, thấy FAIL**
- [ ] **Step 3: Viết `auto-kitchen-print.ts`**
- [ ] **Step 4: Chạy lại, thấy PASS; `npx tsc --noEmit` sạch**
- [ ] **Step 5: Commit** — `git commit -m "feat: ham thuan nhan dien don tu vao bep can in phieu"`

---

### Task 4: Server action xếp phiếu bếp cho đơn tự vào bếp

**Files:**
- Create: `admin-web/lib/actions/auto-kitchen-print.ts`, `admin-web/lib/actions/auto-kitchen-print.test.ts`

**Interfaces:**
- Consumes: `isAutoKitchenOrder`, `AUTO_PRINT_BATCH_MAX`, `AutoPrintConfig` (Task 3); `enqueuePrint` từ `lib/actions/print-jobs.ts` (chữ ký `enqueuePrint(req: PrintRequest): Promise<{ok:true;queued:number}|{ok:false;error:string}>`, không sửa); `requireOperator` (`lib/auth/operator.ts`), `isPosRole` (`lib/auth/roles.ts`), `createAdminClient` (`lib/supabase/server.ts`)
- Produces:

```ts
// 'use server'
export type AutoPrintResult = { orderId: string; status: 'queued' | 'already' | 'skipped' | 'error'; error?: string }
export async function enqueueAutoKitchenPrints(orderIds: string[]):
  Promise<{ ok: true; results: AutoPrintResult[] } | { ok: false; error: string }>
```

Luồng:
1. `requireOperator()`; không có `storeId` hoặc `!isPosRole(role)` → `{ok:false, error:'Bạn không có quyền in phiếu này'}`.
2. Lọc `orderIds` lấy chuỗi không rỗng, gộp trùng. Rỗng → `{ok:true, results:[]}`. Hơn `AUTO_PRINT_BATCH_MAX` → `{ok:false, error:'Tối đa 20 đơn một lần'}`.
3. Bằng `createAdminClient`, đọc song song, mọi truy vấn lọc quán:
   - `store_workflow_settings` `select('print_mode, kitchen_release_policy, staff_order_release_policy').eq('store_id', storeId).maybeSingle()`
   - `stores` `select('payment_timing').eq('id', storeId).maybeSingle()`
   - `orders` `select('id, status, order_source, created_at, payment_received_at, payment_method, confirmed_at').eq('store_id', storeId).in('id', ids)`
   Lỗi đọc → `{ok:false, error}`.
4. `print_mode !== 'agent'` → mọi id `skipped`, không gọi `enqueuePrint`.
5. Mỗi id theo thứ tự gửi: không có trong kết quả đọc (quán khác / không tồn tại) hoặc `isAutoKitchenOrder(..., Date.now())` sai → `skipped`. Đúng → `await enqueuePrint({ kind: 'order', orderId })` tuần tự (không `reprint`): `ok` và `queued > 0` → `queued`; `ok` và `queued === 0` → `already`; `!ok` → `error` kèm `error`. Một đơn lỗi không chặn đơn sau.
6. Bọc toàn bộ `try/catch` → `{ok:false, error}`, không ném.

- [ ] **Step 1: Viết test theo mẫu `lib/actions/print-jobs.test.ts`** (mock `@/lib/auth/operator`, `@/lib/supabase/server`, `@/lib/actions/print-jobs`; ghi lại mọi `.eq`/`.in`; `vi.setSystemTime`)

```ts
it('thu ngân, đơn staff automatic 5 phút trước: gọi enqueuePrint({kind:"order",orderId}) đúng 1 lần, status queued')
it('enqueuePrint trả queued 0: status already (tab POS thứ hai)')
it('store_staff bị từ chối, không đọc DB')
it('print_mode browser: mọi đơn skipped, không gọi enqueuePrint')
it('chính sách khách hiện là pos_confirmation: đơn khách skipped dù client gửi lên')
it('đơn có confirmed_at: skipped')
it('đơn tạo 31 phút trước theo giờ server: skipped; 29 phút: queued')
it('id không có trong kết quả đọc (quán khác): skipped; truy vấn orders có eq store_id')
it('enqueuePrint {ok:false}: status error kèm câu lỗi, đơn kế tiếp vẫn chạy')
it('21 id: {ok:false}; id trùng chỉ gọi enqueuePrint một lần')
it('lỗi đọc orders: {ok:false}, không ném')
```

- [ ] **Step 2: Chạy `npx vitest run lib/actions/auto-kitchen-print.test.ts`, thấy FAIL**
- [ ] **Step 3: Viết code**
- [ ] **Step 4: Chạy lại, thấy PASS; `npx tsc --noEmit` sạch**
- [ ] **Step 5: Commit** — `git commit -m "feat: server action xep phieu bep cho don tu vao bep"`

---

### Task 5: POS tự in và băng "giữ POS mở"

**Files:**
- Modify: `admin-web/lib/pos-browser-reads.ts` (thêm cuối file, sau `readPrintStatus`)
- Create: `admin-web/lib/pos-browser-reads.test.ts`
- Create: `admin-web/app/admin/pos/use-auto-kitchen-print.ts`
- Modify: `admin-web/app/admin/pos/pos-client.tsx` (hook ngay sau `useServiceRequests` dòng 202; băng ngay trước khối `{mergeMode && (` dòng 1018)

**Interfaces:**
- Consumes: Task 3 (`AutoPrintConfig`, `autoKitchenPrintCandidates`, `autoPrintBanner`, `createAutoPrintTracker`, `AUTO_PRINT_BATCH_MAX`), Task 4 (`enqueueAutoKitchenPrints`), RPC `get_public_store_workflow(p_store_id)` (trả `payment_timing`, `kitchen_release_policy`, `staff_order_release_policy`) và `get_print_mode()` (mig 114, GRANT `authenticated`), `Banner` từ `components/ui/feedback.tsx`
- Produces:

```ts
// lib/pos-browser-reads.ts
export async function readAutoPrintConfig(client: BrowserClient, storeId: string):
  Promise<{ ok: true; config: AutoPrintConfig } | { ok: false; error: string }>

// app/admin/pos/use-auto-kitchen-print.ts
export function useAutoKitchenPrint(input: {
  supabase: ReturnType<typeof createClient>
  storeId: string
  sessions: OpenTableSession[]
  onGiveUp: (message: string) => void
}): { banner: { tone: 'info' | 'warning'; title: string } | null }
```

`readAutoPrintConfig`: gọi song song hai RPC. Một trong hai lỗi, hoặc `payment_timing`/policy ngoài giá trị hợp lệ, hoặc `get_print_mode` không phải `browser|agent` → `{ok:false}`.

Hook:
- Đọc cấu hình lúc mount, mỗi 30 giây, và khi cửa sổ `focus`. Đọc lỗi thì giữ cấu hình cũ (lần đầu lỗi thì `null`, không in gì).
- Một tracker cho cả vòng đời trang (`useRef`). Hàm `evaluate()` chạy khi `sessions` hoặc cấu hình đổi, và mỗi 10 giây (để lô còn dư / đơn chờ thử lại được xét mà không cần dữ liệu mới; việc này thuần, không gọi mạng khi không có đơn đến hạn). Chỉ một lô chạy cùng lúc.
- `evaluate`: `cfg` chưa có hoặc `autoPrintBanner(cfg)` null → thôi. Lấy candidates, `tracker.due(...)`, cắt `AUTO_PRINT_BATCH_MAX` id đầu, `tracker.start`, gọi `enqueueAutoKitchenPrints`. `queued | already | skipped` → `finish(done)`; `error` → `finish(failed)`; `{ok:false}` hoặc ném → `finish(failed)` cho cả lô. Lô xong mà còn id đến hạn thì chạy lô kế ngay.
- `gave_up` → `onGiveUp('Không tự in được phiếu bếp của ' + tableLabel + ': ' + lỗi + '. In lại phiếu ở lượt này.')`.
- `banner = autoPrintBanner(cfg)`.

`pos-client.tsx`: `const autoPrint = useAutoKitchenPrint({ supabase, storeId, sessions, onGiveUp: reportActionError })`; khối băng `{autoPrint.banner && <Banner tone={autoPrint.banner.tone} title={autoPrint.banner.title} className="mx-4 mt-2 md:mx-5" />}`. Không đụng `onConfirmOrder`, `onPrintOrder` (QRIN Part 2 Task 11 đổi hai hàm này).

- [ ] **Step 1: Viết test `pos-browser-reads.test.ts`** (client giả có `rpc(name)` trả theo tên)

```ts
it('readAutoPrintConfig: ghép đúng mode + 2 policy + payment_timing')
it('get_public_store_workflow lỗi: {ok:false}')
it('get_print_mode lỗi: {ok:false}')
it('policy lạ: {ok:false}')
```

- [ ] **Step 2: Chạy `npx vitest run lib/pos-browser-reads.test.ts`, thấy FAIL**
- [ ] **Step 3: Viết `readAutoPrintConfig`, hook, sửa `pos-client.tsx`**
- [ ] **Step 4: Chạy `npx vitest run lib/pos-browser-reads.test.ts lib/print app/admin/pos; npx tsc --noEmit; npm run lint`, thấy PASS**
- [ ] **Step 5: Commit** — `git commit -m "feat: POS tu xep phieu bep cho don tu vao bep + bang giu POS mo"`

---

### Task 6: Sinh tên bàn hàng loạt + server action

**Files:**
- Create: `admin-web/lib/bulk-tables.ts`, `admin-web/lib/bulk-tables.test.ts`
- Modify: `admin-web/lib/actions/tables.ts` (thêm cuối file)
- Modify: `admin-web/lib/actions/tables.test.ts` (mock thêm `insert` mảng, `select('table_number')`)

**Interfaces:**
- Consumes: `requireStoreOwnerStoreId` (`lib/auth/operator.ts`, ném khi không phải chủ quán), `createAdminClient`
- Produces:

```ts
// lib/bulk-tables.ts
export const BULK_TABLES_MAX = 100
export type BulkTablesInput = { prefix: string; from: number; to: number }
export function normalizeTableName(name: string): string
export function previewBulkTables(input: BulkTablesInput, existingNames: string[]):
  { ok: true; create: string[]; skipped: string[] } | { ok: false; error: string }

// lib/actions/tables.ts
export async function addTablesBulk(input: { areaId: string | null; prefix: string; from: number; to: number }):
  Promise<{ ok: true; created: string[]; skipped: string[] } | { ok: false; error: string }>
```

`previewBulkTables`:
- Tên = `prefix` bỏ khoảng trắng đầu (giữ khoảng trắng cuối để `Bàn ` + `1` ra `Bàn 1`) nối số, rồi trim. Không đệm số 0.
- Kiểm theo thứ tự, câu lỗi đúng chữ: `from`/`to` không phải số nguyên trong `0..9999` → `Số đầu và số cuối phải là số nguyên từ 0 đến 9999`; `to < from` → `Số cuối phải lớn hơn hoặc bằng số đầu`; `to - from + 1 > 100` → `Tối đa 100 bàn một lần`; `prefix.trim().length > 20` → `Tiền tố tối đa 20 ký tự`.
- `normalizeTableName`: trim, gộp chuỗi khoảng trắng thành một dấu cách, `normalize('NFC')`, `toLocaleLowerCase('vi')`. Tên trùng (sau chuẩn hoá) với `existingNames` vào `skipped`, còn lại vào `create`, giữ thứ tự số tăng dần.

`addTablesBulk`: `try { storeId = await requireStoreOwnerStoreId() } catch → {ok:false, error: e.message}`; `previewBulkTables` lỗi → trả lỗi đó; `areaId` khác null thì kiểm `table_areas` `.eq('id', areaId).eq('store_id', storeId).maybeSingle()`, không thấy → `Không tìm thấy khu`; đọc `tables.select('table_number').eq('store_id', storeId)` (mọi bàn, kể cả đã Đóng); `create` rỗng → `{ok:true, created:[], skipped}` không chèn; còn lại chèn **một lệnh** mảng `{store_id, table_number, is_active: true, area_id}` (không có `pos_x/pos_y`, POS tự xếp lưới như bàn thêm lẻ); lỗi → `{ok:false, error:'Không tạo được bàn: ' + message}`; xong `revalidatePath('/admin/tables')`, `revalidatePath('/admin/pos')`.

- [ ] **Step 1: Viết test**

```ts
// bulk-tables.test.ts
it('A, 1→3: A1, A2, A3')
it('"Bàn " giữ dấu cách: Bàn 1, Bàn 2; tiền tố rỗng: 1, 2')
it('đúng 100 bàn được; 101 bàn: "Tối đa 100 bàn một lần"')
it('to < from, số âm, số lẻ thập phân, NaN: đúng câu lỗi')
it('tiền tố 21 ký tự: lỗi')
it('đã có "a1" và " A3 ": A1, A3 vào skipped; A2 vào create')
it('cả loạt trùng: create rỗng, skipped đủ')
// tables.test.ts
it('addTablesBulk: một lệnh insert mảng đúng store_id, area_id, is_active, không có pos_x')
it('addTablesBulk: tên trùng bàn đang có (kể cả bàn đã đóng) bị bỏ qua và trả về skipped')
it('addTablesBulk: cả loạt trùng thì không insert, ok:true')
it('addTablesBulk: khu của quán khác → {ok:false, error:"Không tìm thấy khu"}, không insert')
it('addTablesBulk: không phải chủ quán → {ok:false}, không ném')
it('addTablesBulk: 101 bàn → {ok:false}, không đọc DB')
```

- [ ] **Step 2: Chạy `npx vitest run lib/bulk-tables.test.ts lib/actions/tables.test.ts`, thấy FAIL**
- [ ] **Step 3: Viết code**
- [ ] **Step 4: Chạy lại, thấy PASS; `npx tsc --noEmit` sạch**
- [ ] **Step 5: Commit** — `git commit -m "feat: tao ban hang loat theo khu (ham sinh ten + server action)"`

---

### Task 7: Hộp thoại "Tạo nhiều bàn" ở `/admin/tables`

**Files:**
- Create: `admin-web/app/admin/tables/bulk-tables-dialog.tsx`, `admin-web/app/admin/tables/bulk-tables-dialog.test.tsx`
- Modify: `admin-web/app/admin/tables/tables-client.tsx:3-14,99-112` (nút ở thanh trên, cạnh "Thêm bàn"; state mở hộp thoại)

**Interfaces:**
- Consumes: `previewBulkTables`, `BULK_TABLES_MAX` (Task 6), `addTablesBulk` (Task 6), `Dialog` (`components/ui/dialog.tsx`), `Button` (`components/ui/button.tsx`)
- Produces:

```tsx
export default function BulkTablesDialog(props: {
  open: boolean
  areas: { id: string; name: string }[]
  existingNames: string[]
  initial?: { areaId: string | null; prefix: string; from: number; to: number }  // mặc định khu đầu tiên (hoặc null), '', 1, 10
  onClose: (changed: boolean) => void
}): JSX.Element
```

Giao diện (`Dialog` `placement="center"`, `dismissible={false}` khi đang gửi):
- Ô chọn khu (có "Chưa phân khu"), ô tiền tố (placeholder `VD: A`), số đầu, số cuối (`inputMode="numeric"`), xếp 2 cột ở ≥ 640px, 1 cột ở 375px.
- Xem trước sống theo `previewBulkTables(input, existingNames)`: lỗi hiện dưới ô; không lỗi thì hiện `Sẽ tạo N bàn` và danh sách tên (cuộn tối đa ~12rem), tên trùng ghi `<tên> · đã có, bỏ qua`.
- Nút chính `Tạo N bàn`, khoá khi lỗi, `N = 0`, hoặc đang gửi.
- Gửi xong: thay form bằng kết quả `Đã tạo N bàn.` và, nếu có, `Bỏ qua M bàn trùng tên: A3, A7.`; nút `Xong` gọi `onClose(true)`. Lỗi `{ok:false}` hiện tại chỗ, giữ nguyên chữ đang gõ.

`tables-client.tsx`: nút `Tạo nhiều bàn` (icon `Plus`, `getButtonClasses('outline')`) mở hộp thoại với `existingNames = tables.map((t) => t.table_number)`. `onClose(changed)`: đóng, rồi `router.refresh()` chỉ khi `changed`. Phải refresh **sau** khi người dùng đọc kết quả: `TablesClient` có `key={tablesVersion(...)}` (page.tsx:53) nên refresh làm nó dựng lại và mất state hộp thoại.

- [ ] **Step 1: Viết test** (`renderToStaticMarkup`, mock `@/lib/actions/tables` như `print-settings-section.test.tsx` mock action)

```tsx
it('xem trước A 1→5, đã có A3: liệt kê A1, A2, A4, A5, có "A3 · đã có, bỏ qua", nút "Tạo 4 bàn"')
it('1→101: hiện "Tối đa 100 bàn một lần", nút Tạo bị khoá')
it('cả loạt trùng: nút "Tạo 0 bàn" bị khoá')
it('có ô chọn khu với "Chưa phân khu" và tên các khu')
```

- [ ] **Step 2: Chạy `npx vitest run app/admin/tables`, thấy FAIL**
- [ ] **Step 3: Viết code**
- [ ] **Step 4: Chạy `npx vitest run app/admin/tables; npx tsc --noEmit; npm run lint`, thấy PASS**
- [ ] **Step 5: Commit** — `git commit -m "feat: hop thoai Tao nhieu ban o trang Ban & QR"`

---

### Controller áp migration

Do **controller** làm, không phải agent code, sau khi Task 1 review xong, theo thứ tự số của hợp đồng chung (sau 118, trước 122) và **trước** khi Vercel lên code Task 2: nếu web lên trước, form cho chọn `automatic` trong lúc trigger 114 còn sống, lưu sẽ ném lỗi mà Next production giấu nội dung.

1. Áp `supabase/migrations/121_drop_print_mode_policy_guard.sql` (nội dung LF từ `git show`).
2. Kiểm: `SELECT count(*) FROM pg_trigger WHERE tgname = 'print_mode_policy_guard';` ra `0`; `SELECT to_regprocedure('public.print_mode_policy_guard()');` ra `NULL`.

---

### Task 8: Checklist test tay + cập nhật tài liệu

**Files:**
- Create: `docs/testing/yen-garden/CFG.md`
- Modify: `CLAUDE.md` (thêm một dòng vào bảng §10)

- [ ] **Step 1: Viết checklist, văn phong như `docs/testing/dot1/C-part1-in-hai-noi.md`**

Đầu file: test trên quán thử trả sau (không phải quán đang bán), mig 121 đã áp, phần mềm in đã ghép và có máy in ảo `MEVO PDF` như C-Part1. Ghi rõ: nút "Duyệt & in bếp" vẫn in trình duyệt cho tới khi QRIN (Part 2 Task 11) gộp; bấm Duyệt cho một đơn đã tự in ở giai đoạn này sẽ ra thêm một tờ trình duyệt, **không tính FAIL**. Các bài:

*Tạo bàn hàng loạt*
1. Khu A, tiền tố `A`, 1→20: xem trước đủ 20 tên, Tạo, thấy 20 bàn trong khu A, trên POS bàn mới tự xếp lưới.
2. Chạy lại 1→25: chỉ tạo A21–A25, báo bỏ qua 20 bàn.
3. Đã có bàn `a 3` (đã Đóng): tạo A1→A5 báo bỏ qua A3.
4. 1→101 bị chặn; tiền tố `Bàn ` ra `Bàn 1`. Mở trang ở bề rộng 375px: hộp thoại đọc được, không cuộn ngang.

*In tự động*
5. Cài đặt: đang "Nhiều nơi", đổi "Đơn nhân viên xuống bếp" sang "Tự động chuyển cho bếp", Lưu được; khối In ấn hiện ghi chú giữ POS mở.
6. Quán "Một nơi" với policy tự động: bật "Nhiều nơi" được.
7. POS mở: hiện băng `Đơn tự vào bếp — giữ POS mở để in`. Nhân viên gửi đơn từ `/staff`: trong vài giây ra phiếu bếp đúng trạm + phiếu bàn, không bấm gì trên POS (`SELECT kind, status, dedupe_key FROM print_jobs ORDER BY created_at DESC LIMIT 5`).
8. Mở POS ở hai tab, gửi một đơn nhân viên: chỉ một bộ phiếu (đếm dòng `print_jobs` theo `dedupe_key` chứa id đơn).
9. Khách duyệt (`pos_confirmation`) + nhân viên tự động: đơn khách QR không tự in, vẫn chờ "Duyệt & in bếp"; đơn nhân viên tự in.
10. Đóng POS, gửi đơn nhân viên, chờ 31 phút, mở POS: đơn đó không in. Gửi đơn mới: in.
11. Tắt phần mềm in rồi gửi đơn: job nằm `queued`, bật lại phần mềm thì in (đúng luật hàng đợi C-Part1).
12. Đổi cả hai policy về "Chờ POS xác nhận": băng biến mất trong khoảng 30 giây, đơn mới không tự in.

- [ ] **Step 2: Thêm dòng 2026-11-09 vào bảng §10 `CLAUDE.md`**

Nêu: mig 121 gỡ trigger `print_mode_policy_guard`; POS in tự động cho đơn trong phiên bàn (quán trả sau) qua `enqueueAutoKitchenPrints` → `enqueuePrint`, khoá chống trùng tự nhiên chống in đôi; 30 phút theo giờ server; POS đóng thì không in. Các bẫy: `list_open_table_sessions` không trả `confirmed_at`/`payment_method` nên lọc ở trình duyệt chỉ là sơ bộ, server quyết; quán trả trước chưa có đường in tự động; tạo bàn hàng loạt kiểm trùng ở action vì `tables` không có unique tên; refresh trang Bàn sau khi đóng hộp thoại vì `TablesClient` có `key` theo dữ liệu.

- [ ] **Step 3: Commit** — `git commit -m "docs: checklist CFG tao ban hang loat + in tu dong, quyet dinh mig 121"`

- [ ] **Step 4: Dừng.** Báo: *"Xong rồi anh, test theo docs/testing/yen-garden/CFG.md nhé"*. Chờ PASS.

---

## Điểm cần anh Tú xác nhận

1. **Quán trả trước chưa có in tự động** **[em]**. POS chỉ thấy đơn trong phiên bàn, mà chỉ quán trả sau mới có phiên. Quán trả trước + "Nhiều nơi" + tự động sẽ thấy băng cảnh báo vàng. Yên Garden trả sau nên không ảnh hưởng.
2. **Tên bàn trùng so cả bàn đã Đóng, không phân biệt hoa/thường và khoảng trắng** **[em]**.
3. **Bấm "Duyệt & in bếp" cho đơn đã tự in** ra thêm một tờ trình duyệt cho tới khi QRIN đổi nút này sang `printDocument` (Part 2 Task 11); sau đó khoá chống trùng tự nhiên chặn in đôi.
