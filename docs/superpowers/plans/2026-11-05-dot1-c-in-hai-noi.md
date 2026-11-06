# Đợt 1 mục C: In hai nơi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quán bật chế độ `agent` thì phiếu bếp tự ra máy in bếp, phiếu quầy ra máy in quầy, qua một phần mềm in cài ở quầy; quán không bật thì in như hôm nay.

**Architecture:** Lớp `lib/print/` nhận một `PrintRequest`. Chế độ `browser` gọi `printInPlace` như cũ; chế độ `agent` tạo dòng trong `print_jobs` (mỗi trạm một phiếu). Phần mềm Electron hỏi việc 2 giây một lần qua RPC bằng token thiết bị, mở trang `/print/agent/<jobId>` trong cửa sổ ẩn rồi in thẳng ra máy đã gán, nên dùng lại nguyên các trang in HTML 80mm.

**Tech Stack:** Postgres (Supabase), Next.js 16 App Router, React 19, vitest, `node --test` + PGlite cho SQL, Electron **44.9.3**, electron-builder **26.18.0**, TypeScript.

**Spec:** `docs/superpowers/specs/2026-11-05-dot1-thanh-toan-ca-in-vietqr-design.md` §5, §7, §9

**Chia đợt:** Part 1 (Task 1–10) chạy ở Đợt 1, song song VietQR nền và Ngày KD. Part 2 (Task 11–13) chạy ở Đợt 3, sau khi anh Tú PASS Đợt 2.

## Quyết định kỹ thuật đã chốt trong plan này

**Phần mềm in nói chuyện với server bằng RPC, không dùng edge function.** RPC `SECURITY DEFINER` gọi qua PostgREST bằng khoá công khai, nhận token thiết bị làm tham số, tự băm và đối chiếu. Bảng in vẫn khoá hẳn với `anon`. Lý do:
- Hỏi 2 giây một lần là 43.200 lượt/ngày, khoảng 1,3 triệu lượt/tháng cho **mỗi quán**. Edge function tính theo lượt gọi và có độ trễ khởi động; RPC không có hai thứ đó.
- Nhận việc phải nguyên tử (`FOR UPDATE SKIP LOCKED`), việc này vốn nằm trong DB. Edge function chỉ thêm một chặng mà không thêm lớp bảo mật nào, vì kiểm token vẫn là so hash trong DB.
- Test được bằng PGlite như mọi RPC khác, không thêm chỗ deploy mới.

**Trang `/print/agent` đọc dữ liệu bằng JWT ngắn hạn mang danh người tạo phiếu.** Mọi RPC in (`get_sessions_bill`, `get_bills_report`, `get_reservation_preorder_print_job`) kiểm quyền bằng `auth.uid()`, nên service role gọi sẽ bị từ chối. Thay vì vá các RPC này (đúng hai điểm nóng của mục A và B), trang ký JWT HS256 sống 120 giây với `sub = print_jobs.created_by`, cùng cách `lib/kitchen-token.ts` đang làm. Phiếu tự nhận mọi thay đổi của plan A, B, D mà không sửa gì thêm.

**Mig 114 chỉ tạo đối tượng mới, không vá hàm sống nào.** Vì vậy không cần neo `pg_get_functiondef`. Khoá hai chiều `print_mode` với `kitchen_release_policy` dùng trigger, không đụng `update_store_workflow_settings`.

**Hết hạn job làm kiểu lười** trong `expire_print_jobs`, vì prod không có `pg_cron` (đã kiểm `pg_extension`).

**`printDocument` và `enqueuePrint` nằm ở Part 1** dù Part 2 mới dùng, vì plan B Part 2 chạy song song Part 2 và cần gọi được `printDocument({kind:'shift_report',...})`.

## Global Constraints

- `print_mode` mặc định `browser`. Quán không bật thì hành vi in giữ nguyên, kể cả giá trên phiếu bếp.
- Phiếu chế biến **chỉ bỏ giá ở chế độ `agent`** (anh Tú chốt 2026-11-06). Chế độ `browser` giữ hai liên cùng có giá theo quyết định 2026-09-23.
- Khi `print_mode='agent'`, phần mềm in mọi phiếu; riêng tờ QR bàn A4 vẫn in trình duyệt.
- Hỏi việc mỗi 2 giây. Thất bại thử lại 3 lần. Job chờ quá 30 phút thành `expired`. Phần mềm im quá 30 giây thì POS hiện "Máy in chưa kết nối". Mã ghép 6 số dùng trong 10 phút.
- DB chỉ lưu hash của token thiết bị và token trang in. Hash: `encode(sha256(convert_to(x,'UTF8')),'hex')`, hàm có sẵn, không cần `pgcrypto` (prod để `pgcrypto` ở schema `extensions`, ngoài `search_path`).
- Hàm mới: `REVOKE ALL ... FROM PUBLIC, anon, authenticated`, rồi `GRANT` đúng vai cần. Bảng mới: `ENABLE ROW LEVEL SECURITY` + `REVOKE ALL ... FROM anon, authenticated`.
- Server action có lỗi người dùng trả `{ok:false,error}`, không ném. Action dùng `createAdminClient` phải tự kiểm quyền và lọc `store_id`.
- Không poll bằng server action trên POS. Trạng thái in đọc qua `lib/pos-browser-reads.ts`.
- Không `window.confirm`, dùng `ConfirmDialog`. Text UI tiếng Việt. Comment logic khó bằng tiếng Việt. Không hardcode URL/khoá: phần mềm in đọc từ file cấu hình.
- Next.js 16: đọc `admin-web/node_modules/next/dist/docs` trước khi viết route. `params` và `searchParams` là Promise.
- Mỗi worktree phải `npm ci` trong `admin-web` trước khi chạy test (worktree không có sẵn `node_modules`).
- Commit: `feat: ...` / `fix: ...` / `chore: ...`, không kèm dòng ghi tên tác giả.
- Xong mỗi Part: dừng, báo anh Tú test theo checklist, chờ PASS. Không tự chuyển tiếp.
- Tên hợp đồng chung, không đổi: `print_stations`, `print_jobs`, `print_agents`, `menu_categories.print_station_id`, `store_workflow_settings.print_mode text NOT NULL DEFAULT 'browser' CHECK IN ('browser','agent')`, `printDocument(req: PrintRequest)`, `enqueuePrint(req)`, các `kind` `order`, `preorder_job`, `bill`, `day_report`, `shift_report`.

**Lệnh test dùng lại trong plan:**

```bash
# SQL (chạy trong admin-web)
PGLITE_MODULE="$PWD/node_modules/@electric-sql/pglite/dist/index.js" node --test ../supabase/tests/114_print_stations_jobs.test.mjs
# admin-web
npx vitest run <file> && npx tsc --noEmit
# print-agent
npx vitest run <file> && npx tsc --noEmit
```

## Review Focus

1. Máy in bị rút dây hoặc tắt: Windows vẫn nhận việc vào hàng đợi, `print()` báo thành công, giấy không ra rồi in muộn hàng giờ sau. Người dùng mong POS báo lỗi và phiếu đó không tự in sau. Test ở Task 7.
2. Phần mềm chết hoặc mất mạng sau khi in mà chưa kịp báo: người dùng mong không in lại tự động, phiếu hiện trên POS là "Không rõ đã in chưa" để người quyết định. Test ở Task 3.
3. Duyệt đơn xong nhưng tạo job lỗi (mất mạng, chưa có trạm): đơn đã vào bếp mà không có phiếu. Người dùng mong POS báo ngay và còn nút in lại. Test ở Task 11.
4. Trạm bị xoá, món đổi danh mục, món bị bỏ sau khi job đã xếp hàng: phiếu vẫn ra trạm bếp mặc định; phiếu không còn món thì báo lỗi, không in tờ trắng. Test ở Task 5 và Task 6.
5. Dò mã ghép 6 số bằng khoá công khai, dùng lại token trang in cho job khác, dùng token cũ sau khi ghép máy mới: đều phải bị từ chối. Test ở Task 3.

---

# PART 1 — Đợt 1

### Task 1: Bài thử Electron in ngầm 80mm

Chạy không cần DB hay Next, nên làm trước và độc lập. Trả lời: Electron có in ngầm được khổ 80mm với độ dài theo nội dung không, trong hai cách đặt khổ giấy.

**Files:**
- Create: `print-agent/package.json`, `print-agent/.npmrc` (`save-exact=true`), `print-agent/tsconfig.json`, `print-agent/.gitignore` (`dist/`, `out/`, `agent.config.json`, `spike-output/`)
- Create: `print-agent/src/slip-size.ts`, `print-agent/src/slip-size.test.ts`
- Create: `print-agent/src/spike/print-spike.ts`, `print-agent/src/spike/fixture-short.html`, `fixture-long.html`, `fixture-qr.html`
- Create: `print-agent/scripts/setup-pdf-printer.ps1`
- Create: `docs/testing/dot1/C-0-may-in-that.md`

**Interfaces:**
- Produces: `pxToMicrons(px: number): number`; `type PageSizeMode = 'measured' | 'printer-default'`; `buildPrintOptions(input: {deviceName: string; mode: PageSizeMode; contentHeightPx: number}): Electron.WebContentsPrintOptions`

- [ ] **Step 1: Dựng `print-agent/package.json`**

Ghim đúng bản: `electron` `44.9.3`, `electron-builder` `26.18.0` (devDependencies, không có `^`), `typescript` `^5`, `vitest` `^4.1.9`. Script: `build` (tsc ra `out/`), `start`, `spike`, `test`, `dist`. Chọn 44.9.3 vì là bản vá mới nhất của nhánh 44 đã ra đủ 2 tuần (2026-10-21), và tài liệu tag `v44.9.3` có sẵn `usePrinterDefaultPageSize`. Nhánh 45 mới có `45.0.0` cùng ngày, chưa nên dùng cho quán thật.

- [ ] **Step 2: Viết test `slip-size.test.ts`**

```ts
it('302px = 80mm cộng lề đáy 5mm', () => expect(pxToMicrons(302)).toBe(Math.ceil(302 * 25400 / 96) + 5000))
it('measured: rộng 80000, cao theo nội dung, lề none, silent', () => {
  const o = buildPrintOptions({ deviceName: 'XP', mode: 'measured', contentHeightPx: 400 })
  expect(o).toMatchObject({ silent: true, printBackground: true, deviceName: 'XP', margins: { marginType: 'none' }, pageSize: { width: 80000, height: pxToMicrons(400) } })
  expect(o.usePrinterDefaultPageSize).toBeUndefined()
})
it('printer-default: bật usePrinterDefaultPageSize và không có pageSize', () => {
  const o = buildPrintOptions({ deviceName: 'XP', mode: 'printer-default', contentHeightPx: 400 })
  expect(o.usePrinterDefaultPageSize).toBe(true)
  expect(o.pageSize).toBeUndefined()
})
```

- [ ] **Step 3: Chạy test, thấy FAIL** (`Cannot find module './slip-size'`)

- [ ] **Step 4: Viết `slip-size.ts`, chạy test, thấy PASS**

- [ ] **Step 5: Viết `print-spike.ts` và 3 file fixture**

Lệnh: `npm run spike -- --printer "<tên>" --mode measured|printer-default --fixture short|long|qr`. Mở `BrowserWindow` với `show: false`, `width: 302`, `height: 100`, `webPreferences: { backgroundThrottling: false }`; đo `document.documentElement.scrollHeight`; gọi `webContents.print(buildPrintOptions(...), cb)`. Đặt `document.title = 'MEVO-spike-<fixture>'` để biết tên việc trong hàng đợi Windows. In ra `success`, `failureReason`, chiều cao đo được. Không có `--printer` thì liệt kê `getPrintersAsync()`.

Fixture chép CSS từ `admin-web/app/print/order/print-order.tsx:46-65`: `short` 3 món tiếng Việt có dấu; `long` 60 món; `qr` thêm ảnh QR data URL rộng 35mm.

- [ ] **Step 6: Viết `scripts/setup-pdf-printer.ps1`**

Máy in "Microsoft Print to PDF" gốc mở hộp thoại Lưu file nên không in ngầm được. Script (chạy quyền admin) tạo một máy in cùng driver, xuất thẳng ra file:

```powershell
New-Item -ItemType Directory -Force C:\mevo-print-test | Out-Null
Add-PrinterPort -Name 'C:\mevo-print-test\out.pdf'
Add-Printer -Name 'MEVO PDF' -DriverName 'Microsoft Print To PDF' -PortName 'C:\mevo-print-test\out.pdf'
```

Không có quyền admin thì dùng máy in gốc và tự chọn chỗ lưu trong hộp thoại.

- [ ] **Step 7: Chạy thử với máy in ảo**

Chạy cả 6 tổ hợp (2 mode × 3 fixture) với `--printer "MEVO PDF"`, đổi tên `out.pdf` sau mỗi lần.
Đạt khi: cả 6 báo `success true`; mỗi PDF lớn hơn 0 byte; mở lên thấy tiếng Việt đúng dấu, không tờ trắng, `long` đủ 60 món. Driver ảo có thể bỏ qua khổ giấy và ra A4: ghi nhận, không tính lỗi, đó là lý do phải thử máy thật.

- [ ] **Step 8: Viết `docs/testing/dot1/C-0-may-in-that.md`**

Checklist cho người thử trên máy nhiệt đúng model. Mục bắt buộc:
- Chuẩn bị: cài driver hãng, cuộn 80mm mặc định, bật cắt tự động trong driver, ghi model và cổng (LAN/USB).
- Chạy 6 tổ hợp trên. Mỗi tổ hợp ghi: đúng rộng 80mm, không co nhỏ; đuôi giấy trắng dưới 1cm; dao tự cắt; dấu tiếng Việt rõ; `long` không bị cắt giữa chừng.
- QR: rộng tối thiểu 35mm, quét được bằng app ngân hàng thật.
- Rút dây mạng rồi in `short`: ghi `Get-PrintJob` thấy gì, tên việc có chứa `MEVO-spike-short` không, cắm lại thì có in muộn không.
- Kết luận cuối file: dòng `KẾT QUẢ: PASS` hoặc `FAIL`, và `pageSizeMode` được chọn.
- Không đạt: dừng, báo anh Tú. Phương án lùi là mở bán chế độ `browser` với một máy in ở quầy, không làm ESC/POS.

- [ ] **Step 9: Commit**

```bash
git add print-agent docs/testing/dot1/C-0-may-in-that.md
git commit -m "feat: print-agent bai thu Electron in ngam 80mm + checklist may that"
```

---

### Task 2: Mig 114 phần bảng và cấu hình chủ quán

**Files:**
- Create: `supabase/migrations/114_print_stations_jobs.sql`
- Create: `supabase/tests/114_print_stations_jobs.test.mjs`

**Interfaces:**
- Consumes: `is_store_owner_of(uuid)`, `is_store_pos_operator(uuid)`, bảng `mevo_operators`, `store_workflow_settings`, `menu_categories`, `stores`
- Produces (bảng):
  - `print_stations(id, store_id, name, is_pos bool, is_default_kitchen bool, printer_name text NULL, created_at)`, `UNIQUE(id, store_id)`, partial unique `(store_id) WHERE is_pos`, `(store_id) WHERE is_default_kitchen`
  - `print_jobs(id, store_id, station_id NULL, kind, ref jsonb, dedupe_key, status, attempts int DEFAULT 0, error, created_by uuid NOT NULL, created_at, claimed_at, printed_at, render_token_hash, render_token_expires_at, resolved_at, resolved_by)`, `UNIQUE(store_id, dedupe_key)`, index `(store_id, status, created_at)`
  - `print_jobs.kind` CHECK IN `('kitchen_ticket','table_slip','bill','day_report','shift_report','test')`; `status` CHECK IN `('queued','printing','done','failed','expired')`
  - `print_agents(id, store_id, name, token_hash NULL UNIQUE, last_seen_at, version, printers jsonb DEFAULT '[]', pair_code_hash, pair_expires_at, pair_fail_count int DEFAULT 0, created_by, created_at)`, partial unique `(store_id) WHERE token_hash IS NOT NULL` (mỗi quán một máy đang sống)
  - `menu_categories.print_station_id` FK composite `(print_station_id, store_id)` → `print_stations(id, store_id)` `ON DELETE SET NULL (print_station_id)`; `print_jobs.station_id` tương tự
- Produces (RPC, cấp `authenticated`):
  - `get_print_mode() RETURNS text`: quán lấy từ `auth.uid()` (mọi vai có `store_id`, kể cả `store_staff`), không có quán thì `'browser'`
  - `set_print_mode(p_store_id uuid, p_mode text) RETURNS jsonb`: chỉ chủ quán. Chuyển sang `agent` mà quán chưa có trạm thì tạo `Quầy` (`is_pos`) và `Bếp` (`is_default_kitchen`)
  - `get_print_settings(p_store_id uuid) RETURNS jsonb`: `{mode, stations:[...], agent:{id,name,version,last_seen_at,online,printers}|null, kitchen_release_policy, staff_order_release_policy}`, không bao giờ trả cột hash. Chủ quán hoặc thu ngân
  - `create_print_pair_code(p_store_id uuid, p_name text) RETURNS jsonb`: chỉ chủ quán, trả `{code, expires_at}`, hạn 10 phút
  - `revoke_print_agent(p_agent_id uuid) RETURNS jsonb`: chỉ chủ quán, đặt `token_hash = NULL`

- [ ] **Step 1: Viết test theo mẫu `supabase/tests/100_bills_report.test.mjs`**

Dựng schema tối thiểu + hàm `login(uid)`. Trước khi nạp migration chạy `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated` và `... ON FUNCTIONS ...` để bắt lỗi quên REVOKE như mig 110. Tạo thêm role `service_role`.

```js
test('anon và authenticated không đọc được 3 bảng in', ...)          // SET ROLE anon/authenticated → 'permission denied' với print_jobs, print_agents, print_stations
test('set_print_mode: thu ngân bị từ chối, chủ quán được', ...)
test('bật agent tạo Quầy + Bếp đúng một lần', ...)                    // gọi 2 lần → count = 2, đúng 1 is_pos, đúng 1 is_default_kitchen
test('không bật agent khi một trong hai policy là automatic', ...)     // rejects /thu ngân xác nhận/
test('đang agent không đổi policy về automatic được', ...)             // UPDATE store_workflow_settings → rejects /thu ngân xác nhận/
test('get_print_mode: mặc định browser, store_staff đọc được agent', ...)
test('mỗi quán một trạm is_pos, một is_default_kitchen', ...)          // INSERT trạm is_pos thứ hai → lỗi unique
test('xoá trạm: danh mục về NULL, store_id giữ nguyên', ...)
test('không gán được trạm của quán khác vào danh mục', ...)            // UPDATE → lỗi foreign key
test('get_print_settings không lộ token_hash, pair_code_hash', ...)    // JSON.stringify(r) không chứa 'hash'
test('mã ghép 6 chữ số, hết hạn sau 10 phút', ...)                     // /^\d{6}$/, expires_at ≈ now + 10 phút
```

- [ ] **Step 2: Chạy test, thấy FAIL** (chưa có file migration)

- [ ] **Step 3: Viết phần bảng và RPC trên trong `114_print_stations_jobs.sql`**

Đầu file ghi chú: chỉ tạo đối tượng mới, không vá hàm sống, không phụ thuộc mig 111–113 nên áp trước được. Trigger `BEFORE INSERT OR UPDATE ON store_workflow_settings`: `NEW.print_mode='agent'` mà `kitchen_release_policy` hoặc `staff_order_release_policy` là `automatic` thì `RAISE EXCEPTION 'Chế độ phần mềm in cần cả đơn khách và đơn nhân viên xuống bếp theo thu ngân xác nhận'`. Kiểm cả `staff_order_release_policy` vì đơn nhân viên `automatic` cũng không qua nút "Duyệt & in bếp", sẽ mất phiếu y như đơn khách.

Sinh mã ghép từ `gen_random_uuid()`, không dùng `random()`; trùng mã đang sống thì sinh lại. Kết thúc file bằng `NOTIFY pgrst, 'reload schema';`. Test chạy trên pglite nên kiểm được `ON DELETE SET NULL (cột)`.

- [ ] **Step 4: Chạy test, thấy PASS**

- [ ] **Step 5: Commit** — `git commit -m "feat: mig 114 bang tram in, hang doi, cau hinh print_mode"`

---

### Task 3: Mig 114 phần RPC của phần mềm in

**Files:**
- Modify: `supabase/migrations/114_print_stations_jobs.sql` (thêm trước dòng `NOTIFY`)
- Modify: `supabase/tests/114_print_stations_jobs.test.mjs`

**Interfaces:**
- Consumes: bảng của Task 2
- Produces:
  - `expire_print_jobs(p_store_id uuid) RETURNS void`, nội bộ, không GRANT ai. `queued` quá 30 phút → `expired`. `printing` có `claimed_at` quá 2 phút → `failed`, `error = 'Không rõ đã in chưa, kiểm tra máy in rồi bấm In lại'`
  - `print_agent_pair(p_code text, p_name text, p_version text) RETURNS jsonb` → `{ok:true, agent_id, token, store_name}` hoặc `{ok:false, error}`. GRANT `anon`
  - `print_agent_poll(p_token text, p_version text, p_printers jsonb) RETURNS jsonb` → `{ok:true, job:null|{id, kind, printer_name, render_token, attempts}}` hoặc `{ok:false, error:'revoked'}`. GRANT `anon`. `p_printers` NULL = không đổi
  - `print_agent_report(p_token text, p_job_id uuid, p_ok boolean, p_error text, p_retryable boolean) RETURNS jsonb`. GRANT `anon`
  - `print_job_for_render(p_job_id uuid, p_render_token text) RETURNS jsonb` → `{id, store_id, kind, ref, created_by, station_name}` hoặc NULL. Chỉ GRANT `service_role`
  - `get_print_status(p_store_id uuid) RETURNS jsonb` → `{mode, agent_online, last_seen_at, queued_count, problem_jobs:[{id, kind, status, error, created_at, label, request}]}`. Chủ quán + thu ngân. Gọi `expire_print_jobs` trước. Chỉ trả job `failed`/`expired` có `resolved_at IS NULL`
  - `retry_print_job(p_job_id uuid) RETURNS jsonb`: tạo job mới cùng `kind/ref/station`, `created_by = auth.uid()`, `dedupe_key = <cũ>:r<uuid>`, đặt `resolved_at` cho job cũ. Gọi lại lần hai trả `{ok:true, already:true}`
  - `dismiss_print_job(p_job_id uuid) RETURNS jsonb`: đặt `resolved_at`, dùng sau khi đã in bằng trình duyệt

Quy tắc trong `print_agent_poll`, theo thứ tự: tra token → `expire_print_jobs` → cập nhật `last_seen_at` chỉ khi cũ hơn 10 giây (đỡ ghi mỗi 2 giây, ngưỡng 30 giây vẫn đúng) → khoá job `queued` cũ nhất `FOR UPDATE SKIP LOCKED` → trạm không có `printer_name` hoặc `station_id` NULL thì đánh `failed` với lỗi `'Trạm chưa chọn máy in'` và lấy job kế tiếp → nhận job: `status='printing'`, `attempts+1`, `claimed_at`, token trang in mới hạn 2 phút.

Quy tắc `print_agent_report`: chỉ nhận job đang `printing` của đúng quán. `p_ok` → `done`, `printed_at`. Lỗi có `p_retryable` và `attempts < 3` → về `queued`. Còn lại → `failed` với `error`.

Quy tắc `print_agent_pair`: lỗi trả `{ok:false}`, **không RAISE**, vì RAISE sẽ huỷ luôn bộ đếm. Sai mã thì cộng `pair_fail_count` cho **mọi** mã đang sống của mọi quán; mã nào tới 20 thì xoá. Bảo vệ khỏi việc dò 1 triệu tổ hợp bằng khoá công khai, vì lần đoán sai không biết nhắm mã nào. Đúng mã thì huỷ token của máy cũ cùng quán, sinh token 64 ký tự hex từ hai `gen_random_uuid()`.

- [ ] **Step 1: Thêm test**

```js
test('ghép đúng mã trả token, DB chỉ giữ hash; mã không dùng lại được', ...)
test('ghép máy mới: token máy cũ bị từ chối', ...)                  // poll(tokenCu) → {ok:false,error:'revoked'}
test('sai 20 lần thì mã đang sống bị huỷ', ...)                     // lần 21 dùng mã đúng → {ok:false}
test('poll: một job chỉ giao một lần', ...)                         // poll lần 2 → job null trong khi lần 1 đang printing
test('poll: FIFO theo created_at, đúng quán', ...)
test('poll: trạm chưa có máy thì job failed, lấy job kế tiếp', ...)
test('job chờ quá 30 phút: expired, không giao cho phần mềm', ...)   // created_at = now()-31 phút
test('job chờ 29 phút vẫn được giao', ...)
test('printing quá 2 phút: failed "Không rõ đã in chưa", KHÔNG về queued', ...)
test('report lỗi retryable: lần 1, 2 về queued, lần 3 thành failed', ...)
test('report không retryable: failed ngay', ...)
test('report của quán khác không đổi job', ...)
test('token trang in: đúng job được, job khác NULL, quá 2 phút NULL', ...)
test('print_job_for_render: anon và authenticated không gọi được', ...)
test('get_print_status: thu ngân đọc được, quán khác và nhân viên bị từ chối', ...)
test('agent_online: last_seen 29 giây true, 31 giây false', ...)
test('retry_print_job: job mới queued, job cũ ẩn khỏi problem_jobs, gọi lại không tạo thêm', ...)
test('retry_print_job: nhân viên bị từ chối', ...)
test('dedupe: INSERT trùng (store_id, dedupe_key) ON CONFLICT DO NOTHING không tạo dòng thứ hai', ...)
test('tĩnh: có FOR UPDATE SKIP LOCKED; mọi hàm mới có REVOKE ... FROM PUBLIC, anon, authenticated', ...)
```

- [ ] **Step 2: Chạy test, thấy FAIL**
- [ ] **Step 3: Viết các hàm**
- [ ] **Step 4: Chạy test, thấy PASS**
- [ ] **Step 5: Commit** — `git commit -m "feat: mig 114 RPC ghep may, nhan viec, bao ket qua, trang thai in"`

---

### Task 4: Tách liên phiếu, tuỳ chọn giá phiếu bếp, tắt tự in

**Files:**
- Modify: `admin-web/app/print/order/print-order.tsx:41-159`
- Modify: `admin-web/app/print/order/print-order.test.tsx:12-17`
- Modify: `admin-web/app/print/bill/print-bill.tsx:42-45,91-108`
- Modify: `admin-web/app/print/day-report/day-report-slip.tsx:29-30,46-52`
- Modify: `admin-web/app/print/bill/print-bill.test.tsx`, `admin-web/app/print/day-report/day-report-slip.test.tsx`

**Interfaces:**
- Produces: `export function SlipStyles()`, `export function KitchenSlip({slip, stationName, showPrices = true}: {slip: OrderSlip; stationName?: string | null; showPrices?: boolean})`, `export function TableSlip({slip}: {slip: OrderSlip})`; `PrintOrder` giữ nguyên chữ ký, ghép cả hai liên. `PrintBill` và `DayReportSlip` thêm prop `autoPrint?: boolean` (mặc định `true`); `false` thì không gọi `window.print()` và không vẽ khối `.no-print`

- [ ] **Step 1: Đổi test**

Giữ nguyên test dòng 13–16 (`in giá trên liên bếp...`), vì `PrintOrder` ở chế độ trình duyệt không đổi. Thêm:

```tsx
it('KitchenSlip showPrices=false: không in giá, không in Tổng phiếu, vẫn có số lượng', () => {
  const bep = renderToStaticMarkup(<KitchenSlip slip={slip} showPrices={false} />)
  expect(bep).not.toContain('120.000')
  expect(bep).not.toContain('Tổng phiếu')
  expect(bep).toContain('x1')
})
it('KitchenSlip mặc định vẫn in giá như quyết định 2026-09-23', () => {
  expect(renderToStaticMarkup(<KitchenSlip slip={slip} />)).toContain('120.000')
})
it('KitchenSlip có stationName thì in tên trạm ở tiêu đề', () => {
  expect(renderToStaticMarkup(<KitchenSlip slip={slip} stationName="Bếp nướng" />)).toContain('Bếp nướng')
})
```

Thêm vào test `PrintBill` và `DayReportSlip`: `autoPrint={false}` thì markup không có `no-print`.

- [ ] **Step 2: Chạy test, thấy FAIL**

- [ ] **Step 3: Sửa code**

`print-order.tsx`: tách hai khối `.lien` (dòng 85–118, 122–156) thành `KitchenSlip`, `TableSlip`, CSS dòng 46–65 thành `SlipStyles`. `showPrices=false` thì dòng 97 chỉ còn `x{it.quantity}` và bỏ khối "Tổng phiếu" dòng 111–115. `PrintOrder` gọi `KitchenSlip` với mặc định nên phiếu trình duyệt không đổi. Món tặng vẫn in trên phiếu bếp vì bếp vẫn phải làm.

- [ ] **Step 4: Chạy `npx vitest run app/print`, thấy PASS**

- [ ] **Step 5: Commit** — `git commit -m "feat: tach lien phieu, tuy chon gia phieu bep, them autoPrint cho trang in"`

---

### Task 5: Lớp in: yêu cầu, chia phiếu theo trạm, xếp hàng, `printDocument`

**Files:**
- Create: `admin-web/lib/print/print-request.ts`, `print-request.test.ts`
- Create: `admin-web/lib/print/print-plan.ts`, `print-plan.test.ts`
- Create: `admin-web/lib/print/load-order-slip.ts`
- Create: `admin-web/lib/print/print-document.ts`, `print-document.test.ts`
- Create: `admin-web/lib/actions/print-jobs.ts`, `print-jobs.test.ts`
- Modify: `admin-web/app/print/order/print-order.tsx:5-12` (`SlipItem` thêm `key: string`, `menuItemId: string | null`)
- Modify: `admin-web/app/print/order/page.tsx:19-120` (chỉ còn gọi `loadOrderSlip`)

**Interfaces:**
- Consumes: bảng + `get_print_mode` của Task 2, `SlipItem` của Task 4
- Produces:

```ts
// lib/print/print-request.ts
export type PrintRequest = (
  | { kind: 'order'; orderId: string } | { kind: 'preorder_job'; jobId: string }
  | { kind: 'bill'; sessionIds: string[] } | { kind: 'day_report'; date: string }
  | { kind: 'shift_report'; shiftId: string }
) & { reprint?: boolean }
export function browserPrintUrl(req: PrintRequest): string
export const AGENT_KINDS: ReadonlySet<PrintRequest['kind']>  // Part 1 chưa có 'shift_report', Task 13 thêm

// lib/print/print-plan.ts
export type PlannedJob = { stationId: string; kind: 'kitchen_ticket'|'table_slip'|'bill'|'day_report'|'shift_report'; ref: Record<string, unknown>; dedupeKey: string }
export function planOrderJobs(input: {
  request: PrintRequest; sourceKey: string  // 'order:<id>' | 'preorder:<id>'
  items: { key: string; stationId: string | null }[]
  posStationId: string; defaultKitchenStationId: string
  stationNames: Record<string, string>; tableLabel: string; reprintToken: string | null
}): PlannedJob[]
export function planDocumentJob(request: PrintRequest, posStationId: string, label: string, uniqueToken: string): PlannedJob

// lib/print/load-order-slip.ts
export function loadOrderSlip(client: SupabaseClient, storeId: string, source: { orderId: string } | { preorderJobId: string }):
  Promise<{ ok: true; slip: OrderSlip } | { ok: false; error: string }>

// lib/actions/print-jobs.ts ('use server')
export async function enqueuePrint(req: PrintRequest): Promise<{ ok: true; queued: number } | { ok: false; error: string }>

// lib/print/print-document.ts
export type { PrintRequest } from './print-request'
export async function printDocument(req: PrintRequest): Promise<{ ok: true } | { ok: false; error: string }>
```

`browserPrintUrl`: `/print/order?id=`, `/print/order?job=`, `/print/bill?ids=a,b`, `/print/day-report?date=`, `/print/shift-report?id=`.

`ref` của mọi job có `label` (vd `Phiếu bếp · Bếp · Bàn 5`) và `request`. Thêm: `kitchen_ticket` có `source`, `itemKeys`; `table_slip` có `source`. `key` của món: `order_items.id` với đơn thường, chỉ số trong snapshot (`'0'`, `'1'`) với đặt trước vì snapshot không đổi.

Khoá chống trùng: đơn dùng khoá tự nhiên `<sourceKey>:kitchen:<stationId>` và `<sourceKey>:table`; có `reprintToken` thì thêm `:r<token>`. `bill`, `day_report`, `shift_report` không có khoá tự nhiên (in tạm tính nhiều lần là hợp lệ) nên mỗi lần bấm một khoá ngẫu nhiên; chống bấm đúp ở `printDocument`.

- [ ] **Step 1: Viết test thuần**

```ts
// print-plan.test.ts
it('món hai trạm: 2 phiếu bếp + 1 phiếu bàn ở Quầy')
it('món một trạm: 1 phiếu bếp + 1 phiếu bàn')
it('stationId null ra trạm mặc định', () => /* items [{key:'a',stationId:null}] → kitchen job stationId === defaultKitchenStationId */)
it('trạm Quầy có món: vẫn 2 phiếu ở Quầy, phiếu bếp và phiếu bàn', ...)
it('khoá tự nhiên giống nhau giữa hai lần; reprintToken đổi khoá', ...)
it('đơn không còn món: chỉ trả [] để action báo lỗi', ...)
// print-request.test.ts
it('browserPrintUrl đúng từng kind, giữ nguyên URL hiện tại', ...)
it('AGENT_KINDS chưa có shift_report', ...)
```

- [ ] **Step 2: Viết test `enqueuePrint` theo mẫu `lib/actions/orders.test.ts`** (mock `requireOperator`, client, admin)

```ts
it('nhân viên phục vụ in được bill, không in được order và day_report')
it('thu ngân in được order')
it('quán đang browser: {ok:false, error:"Quán chưa bật phần mềm in"}')
it('đơn của quán khác: loadOrderSlip không thấy → {ok:false}, không insert')
it('phiên bill của quán khác: {ok:false}, không insert')          // đếm table_sessions theo store_id
it('chưa có trạm: {ok:false, error chứa "Chưa cài trạm in"}')
it('đơn không còn món: {ok:false, error:"Đơn không còn món để in"}')
it('món đã xoá khỏi menu (menu_item_id null) ra trạm mặc định')
it('insert một lần với ignoreDuplicates, created_by là người đang đăng nhập')
it('lỗi DB trả {ok:false}, không ném')
```

- [ ] **Step 3: Viết test `printDocument`** (mock `printInPlace`, `enqueuePrint`, browser client)

```ts
it('browser: gọi printInPlace đúng URL, không gọi enqueuePrint')
it('agent: gọi enqueuePrint, không gọi printInPlace')
it('agent + kind ngoài AGENT_KINDS: rơi về printInPlace')
it('đọc mode lỗi và chưa có cache: dùng browser để không kẹt in')
it('mode được nhớ 60 giây: 2 lần in chỉ đọc RPC 1 lần')
it('bấm đúp: 2 lần gọi cùng req trong 2 giây chỉ in 1 lần, cùng kết quả')
it('sau 2 giây bấm lại thì in lần nữa')
```

- [ ] **Step 4: Chạy các test, thấy FAIL**

- [ ] **Step 5: Viết code**

`loadOrderSlip`: chuyển nguyên logic `page.tsx:19-118`, thêm `menu_item_id` vào select dòng 53, gán `key`, `menuItemId`. Nhánh đặt trước lấy `menuItemId` từ `snapshot.items[i].menu_item_id` (đã kiểm trên prod, snapshot có trường này). Không gọi `requireOperator` trong hàm này: Task 6 gọi nó không có cookie.

`enqueuePrint`: đọc đơn bằng client phiên (`createClient`, để `get_reservation_preorder_print_job` thấy `auth.uid()`), đọc trạm và ghi job bằng `createAdminClient` có lọc `store_id`. Trạm của món: `menu_items → menu_categories.print_station_id`, lọc `store_id`. `reprintToken = req.reprint ? crypto.randomUUID() : null`. Ghi bằng `.upsert(rows, { onConflict: 'store_id,dedupe_key', ignoreDuplicates: true })`, một lệnh cho cả đơn nên nguyên tử.

`printDocument`: đọc mode bằng `createClient()` trình duyệt gọi `rpc('get_print_mode')`, không qua server action; nhớ 60 giây. `Map` theo `JSON.stringify(req)` giữ promise, xoá sau khi xong 2 giây.

- [ ] **Step 6: Chạy `npx vitest run lib/print lib/actions/print-jobs.test.ts app/print && npx tsc --noEmit`, thấy PASS**

- [ ] **Step 7: Commit** — `git commit -m "feat: lop in printDocument, chia phieu theo tram, hang doi enqueuePrint"`

---

### Task 6: Trang `/print/agent/<jobId>`

**Files:**
- Create: `admin-web/app/print/agent/[jobId]/page.tsx`, `page.test.tsx`
- Create: `admin-web/app/print/agent/[jobId]/print-ready.tsx`
- Create: `admin-web/lib/print/agent-user-client.ts`, `agent-user-client.test.ts`
- Create: `admin-web/lib/print/load-day-report.ts`
- Create: `admin-web/lib/print/wait-for-images.ts`
- Modify: `admin-web/lib/print/use-auto-print.ts:13` (dùng `waitForImages`)
- Modify: `admin-web/lib/kitchen-token.ts:8` (export `supabaseJwtSecret()`, giữ nguyên hành vi)
- Modify: `admin-web/proxy.ts:17` (thêm `/print/agent` vào nhánh đi thẳng)

**Interfaces:**
- Consumes: `print_job_for_render` (Task 3), `loadOrderSlip` (Task 5), `KitchenSlip`, `TableSlip`, `SlipStyles`, prop `autoPrint` (Task 4), `buildTestBill`
- Produces:
  - `createPrintUserClient(userId: string): Promise<SupabaseClient>`: JWT HS256 `{role:'authenticated', aud:'authenticated', sub:userId}`, hạn 120 giây, client anon key + `accessToken` như `lib/supabase/kitchen-client.ts`. Dự án không có gói `server-only`, nên đầu file ghi cảnh báo như `kitchen-token.ts:3`
  - `loadDayReport(client, storeId, date, printedBy, now): Promise<{ok:true; props: DayReportSlipProps}|{ok:false;error}>`: gọi thẳng `client.rpc('get_bills_report', ...)` + `parseBillsReport` + `daySummary`. Không sửa `/print/day-report/page.tsx`: plan B Part 1 sửa file đó cùng đợt, tách ở đây sẽ xung đột, nên chấp nhận chép vài dòng
  - Tín hiệu cho phần mềm in, đặt trên `<html>`: `data-print-ready="1"` khi xong; `data-print-error="<lý do>"` khi có lỗi; `document.title = 'MEVO-<jobId>'`

`<PrintReady jobId error? />` là client component: chờ `waitForImages()`, tìm `[role="alert"]` (bắt lỗi giảm giá của `PrintBill`, hàm đó là client nên server không gọi được), rồi đặt tín hiệu.

Trang đọc `t` từ `searchParams`, gọi `createAdminClient().rpc('print_job_for_render', ...)`. NULL thì hiện lỗi `Phiếu đã hết hạn`. Rồi rẽ theo `kind`:

| `kind` | Vẽ gì |
|---|---|
| `kitchen_ticket` | `loadOrderSlip`, lọc `items` theo `ref.itemKeys`, `KitchenSlip` với `station_name` và `showPrices={false}` |
| `table_slip` | `loadOrderSlip`, `TableSlip` |
| `bill` | `client.rpc('get_sessions_bill')`, `PrintBill autoPrint={false}` |
| `day_report` | `loadDayReport`, `DayReportSlip autoPrint={false}` |
| `test` | `buildTestBill`, `PrintBill testMode autoPrint={false}`; `stores` đọc qua client của job |
| `shift_report` | lỗi `Chưa hỗ trợ` cho tới Task 13 |

`printedBy` của `day_report`: `display_name` trong `mevo_operators` của `created_by` + `ROLE_LABEL`.

- [ ] **Step 1: Viết test**

```ts
// agent-user-client.test.ts
it('JWT có sub, role authenticated, aud authenticated, exp <= 120 giây')
it('thiếu SUPABASE_JWT_SECRET thì ném lỗi rõ ràng')
// page.test.tsx  (await Page({ params, searchParams }), renderToStaticMarkup)
it('token sai: hiện "Phiếu đã hết hạn", có PrintReady error, không đọc đơn')
it('kitchen_ticket chỉ vẽ món trong itemKeys, không có giá')
it('kitchen_ticket mà mọi món đã bị bỏ: lỗi "Các món trên phiếu đã bị bỏ", không vẽ phiếu')
it('table_slip vẽ phiếu bàn có giá')
it('bill không có khối no-print')
it('RPC đọc bill lỗi: hiện lỗi, không vẽ phiếu')
```

- [ ] **Step 2: Chạy test, thấy FAIL**
- [ ] **Step 3: Viết code** (đọc `admin-web/node_modules/next/dist/docs` phần dynamic route trước)
- [ ] **Step 4: Chạy `npx vitest run app/print lib/print && npx tsc --noEmit`, thấy PASS**
- [ ] **Step 5: Commit** — `git commit -m "feat: trang /print/agent ve phieu bang token ngan han"`

---

### Task 7: Phần mềm in `print-agent`

**Files:**
- Create: `print-agent/src/api.ts`, `api.test.ts`
- Create: `print-agent/src/job-loop.ts`, `job-loop.test.ts`
- Create: `print-agent/src/spooler.ts`, `spooler.test.ts`
- Create: `print-agent/src/print-page.ts`
- Create: `print-agent/src/config.ts`, `print-agent/agent.config.example.json`
- Create: `print-agent/src/token-store.ts`
- Create: `print-agent/src/main.ts`, `print-agent/src/pair-window.html`, `print-agent/assets/tray.png`
- Create: `print-agent/electron-builder.yml`, `print-agent/README.md`

**Interfaces:**
- Consumes: RPC Task 3, tín hiệu trang Task 6, `buildPrintOptions` Task 1
- Produces:

```ts
// api.ts — fetch thẳng `${supabaseUrl}/rest/v1/rpc/<tên>` với header apikey + Authorization = khoá công khai
export function createApi(config: AgentConfig, fetchImpl?: typeof fetch): {
  pair(code: string, name: string, version: string): Promise<PairResult>
  poll(token: string, version: string, printers: PrinterEntry[] | null): Promise<PollResult>
  report(token: string, jobId: string, ok: boolean, error: string | null, retryable: boolean): Promise<void>
}
// spooler.ts
export function parsePrintJobs(json: string): { id: number; documentName: string; status: string }[]
export function waitForSpool(input: { printer: string; jobId: string; timeoutMs: number; list: ListFn; remove: RemoveFn; sleep: SleepFn }): Promise<'clear' | 'stuck'>
// job-loop.ts
export function createJobLoop(deps: JobLoopDeps): { tick(): Promise<void>; stop(): void }
```

`AgentConfig = { supabaseUrl, anonKey, webOrigin, pageSizeMode }`, đọc từ `agent.config.json` đóng kèm qua `extraResources`. File này gitignored, có bản `.example` tracked.

Luồng một lần `tick`: không chạy chồng → `poll` → có job thì `printers` phải chứa `printer_name` → `printJob` (load trang, chờ tín hiệu tối đa 20 giây, đo chiều cao, `webContents.print`) → `waitForSpool` tối đa 15 giây → `report`.

`print-page.ts`: mỗi job một `BrowserWindow` ẩn như Task 1, đóng cửa sổ sau khi in. `spooler.ts` gọi `powershell.exe -NoProfile -NonInteractive` chạy `Get-PrintJob -PrinterName $env:MEVO_PRINTER` / `Remove-PrintJob`, truyền tên máy qua biến môi trường để tên có dấu nháy không làm hỏng lệnh; ép `[Console]::OutputEncoding` UTF-8; bọc `@(...)` trước `ConvertTo-Json`. Việc khớp theo `DocumentName` chứa `jobId`.

Vì sao phải canh hàng đợi: `print()` thành công chỉ nghĩa là Windows đã nhận việc. Không canh thì rút dây máy in vẫn báo `done`, và phiếu tự in lúc cắm lại, trái đúng hai điều spec cấm. Việc còn kẹt sau 15 giây bị xoá khỏi hàng đợi và báo `failed` không thử lại.

`main.ts`: `requestSingleInstanceLock`; khay hệ thống với trạng thái (Đang chạy / Mất kết nối / Cần ghép máy), mục "Ghép lại", "Thoát"; `setLoginItemSettings({ openAtLogin: true })`; chưa có token thì mở `pair-window.html` nhập mã 6 số; `setInterval` 2000ms gọi `tick`; gửi danh sách máy in khi đổi hoặc 60 giây một lần. `token-store.ts` mã hoá bằng `safeStorage`, lưu ở `userData`. `electron-builder.yml`: `nsis`, Windows x64, không ký số, không tự cập nhật.

- [ ] **Step 1: Viết test**

```ts
// spooler.test.ts
it('parsePrintJobs: một object lẫn mảng đều ra mảng; chuỗi rỗng ra []')
it('waitForSpool: việc biến mất trong hạn trả clear, không gọi remove')
it('waitForSpool: quá 15 giây trả stuck và gọi remove đúng id')
it('waitForSpool: lệnh PowerShell lỗi không kết luận stuck, trả clear')
// job-loop.test.ts
it('tick đang chạy thì tick sau bỏ qua')
it('poll {ok:false,error:"revoked"}: gọi onRevoked và dừng vòng lặp')
it('poll lỗi mạng: không ném, báo onOffline, tick sau chạy tiếp')
it('không có job: không in, không report')
it('in xong, hàng đợi sạch: report(ok=true)')
it('print thất bại: report(ok=false, retryable=true)')
it('trang báo data-print-error: report(ok=false, retryable=false, lý do)')
it('chờ tín hiệu quá 20 giây: report(ok=false, retryable=true)')
it('hàng đợi kẹt: report(ok=false, retryable=false, "Máy in không phản hồi")')
it('không tìm thấy máy in: report(ok=false, retryable=false), không gọi print')
it('report lỗi mạng: thử lại 3 lần rồi bỏ, không in lại')
// api.test.ts
it('gọi đúng URL, header apikey, tên tham số p_token, p_version, p_printers')
it('HTTP lỗi ném để job-loop coi như mất mạng')
```

- [ ] **Step 2: Chạy test, thấy FAIL**
- [ ] **Step 3: Viết `api.ts`, `spooler.ts`, `job-loop.ts`, chạy test, thấy PASS**
- [ ] **Step 4: Viết `print-page.ts`, `config.ts`, `token-store.ts`, `main.ts`, `pair-window.html`, `electron-builder.yml`**
- [ ] **Step 5: Kiểm tra** — `npx tsc --noEmit && npx vitest run && npm run dist`. Đạt khi ra file cài `.exe` trong `print-agent/dist/`.
- [ ] **Step 6: Viết `README.md`** gồm cách build, sửa `agent.config.json`, cài ở quầy, cảnh báo Windows do chưa ký số.
- [ ] **Step 7: Commit** — `git commit -m "feat: phan mem in Electron, ghep may, hoi viec, canh hang doi Windows"`

---

### Task 8: Cài đặt In ấn

**Files:**
- Create: `admin-web/app/admin/settings/print-settings-section.tsx`, `print-settings-section.test.tsx`
- Create: `admin-web/lib/actions/print-settings.ts`, `print-settings.test.ts`
- Modify: `admin-web/lib/pos-browser-reads.ts` (thêm cuối file, sau dòng 75)
- Modify: `admin-web/app/admin/settings/page.tsx:18-25,53-75`
- Modify: `admin-web/app/admin/settings/workflow-settings-form.tsx:15-19,310-319`, `workflow-settings-form.test.tsx`

**Interfaces:**
- Consumes: `get_print_settings`, `set_print_mode`, `create_print_pair_code`, `revoke_print_agent`, `get_print_status`
- Produces:

```ts
// lib/pos-browser-reads.ts
export type PrintProblemJob = { id: string; kind: string; status: 'failed' | 'expired'; error: string | null; created_at: string; label: string; request: PrintRequest | null }
export type PrintStatus = { mode: 'browser' | 'agent'; agent_online: boolean; last_seen_at: string | null; queued_count: number; problem_jobs: PrintProblemJob[] }
export async function readPrintStatus(client: BrowserClient, storeId: string): Promise<{ ok: true; status: PrintStatus } | { ok: false; error: string }>

// lib/actions/print-settings.ts ('use server') — mọi hàm trả {ok:true,...}|{ok:false,error}, chỉ chủ quán
export async function savePrintMode(mode: 'browser' | 'agent')
export async function savePrintStation(input: { id: string | null; name: string; printerName: string | null })
export async function deletePrintStation(id: string)
export async function createPairCode(name: string)   // {ok:true, code, expiresAt}
export async function revokePrintAgent(agentId: string)
export async function enqueueTestPrint(stationId: string)
```

Giao diện theo design system 2026-10-02, dùng `Button`, `Select`, `Dialog` có sẵn trong `components/ui`. Khối In ấn chuyển thành section rộng cả hàng, đặt sau lưới Âm thanh, nội dung:
- Hai lựa chọn chế độ: "Một nơi (in bằng trình duyệt)" và "Nhiều nơi (qua phần mềm in)". Một trong hai policy là `automatic` thì khoá "Nhiều nơi" kèm câu giải thích.
- Chế độ `browser`: giữ link In thử `/print/test-slip` như hiện tại.
- Chế độ `agent`: trạng thái phần mềm (đọc `readPrintStatus` trình duyệt mỗi 5 giây, dừng khi unmount); danh sách trạm với tên, ô chọn máy in (từ `agent.printers`), nút In thử; thêm/sửa/xoá trạm (trạm `is_pos`, `is_default_kitchen` không xoá được); nút "Thêm máy" hiện mã 6 số và giờ hết hạn; nút "Gỡ máy".

Form quy trình: thêm prop `printMode?: 'browser'|'agent'`. Khi `agent`, khoá hai `PolicySelect` (dòng 310–319) kèm câu "Đang dùng phần mềm in, phải giữ thu ngân xác nhận". Cần khoá ở đây vì `saveOwnerWorkflowSettings` ném lỗi, mà Next production giấu nội dung lỗi ném, người dùng sẽ không đọc được câu tiếng Việt của trigger.

- [ ] **Step 1: Viết test**

```ts
// print-settings.test.ts
it('thu ngân bị từ chối ở mọi action')
it('savePrintStation sửa trạm quán khác: {ok:false}, update có .eq("store_id")')
it('tên trạm rỗng: {ok:false}')
it('deletePrintStation: trạm is_pos hoặc is_default_kitchen bị từ chối')
it('enqueueTestPrint: tạo job kind test đúng station, dedupe ngẫu nhiên, created_by người gọi')
it('enqueueTestPrint: trạm quán khác {ok:false}')
it('savePrintMode trả nguyên câu lỗi RPC trong {ok:false}')
// print-settings-section.test.tsx
it('browser: có link In thử, không có danh sách trạm')
it('agent: có trạm, nút In thử theo từng trạm, nút Thêm máy')
it('policy automatic: nút Nhiều nơi bị khoá kèm giải thích')
it('agent offline: hiện "Chưa kết nối"')
// workflow-settings-form.test.tsx
it('printMode agent: hai ô policy bị khoá')
```

- [ ] **Step 2: Chạy test, thấy FAIL**
- [ ] **Step 3: Viết code**
- [ ] **Step 4: Chạy `npx vitest run app/admin/settings lib/actions/print-settings.test.ts && npx tsc --noEmit`, thấy PASS**
- [ ] **Step 5: Commit** — `git commit -m "feat: Cai dat In an: che do, tram, ghep may, in thu theo tram"`

---

### Task 9: Gán trạm cho danh mục ở trang Món

**Files:**
- Modify: `admin-web/app/admin/menu/page.tsx:33-38,56`
- Modify: `admin-web/app/admin/menu/menu-client.tsx:61,70,482,509`
- Modify: `admin-web/lib/actions/menu.ts:317-337,342-354`
- Modify: `admin-web/lib/actions/menu.test.ts`

**Interfaces:**
- Consumes: `get_print_settings`
- Produces: `MenuClient` thêm prop `stations: {id: string; name: string}[]`; FormData có trường `print_station_id` (rỗng = chưa gán)

`page.tsx`: nhánh chủ quán gọi thêm `supabase.rpc('get_print_settings', ...)`, lỗi thì `stations = []`, trang vẫn chạy kể cả khi mig 114 chưa áp. `stations` rỗng thì không vẽ ô chọn, quán không bật không thấy gì mới. Ô chọn đặt ngay sau `PrefixField`, lựa chọn đầu là "Theo trạm bếp mặc định". Trang thu ngân (dòng 12–30) không đổi.

- [ ] **Step 1: Thêm test `menu.test.ts`**

```ts
it('updateCategory có print_station_id: ghi đúng trạm')
it('updateCategory print_station_id rỗng: ghi null')
it('updateCategory không gửi trường này: không đụng cột')
it('trạm của quán khác: {ok:false}, không ghi')
it('addCategory có trạm: insert kèm print_station_id')
```

- [ ] **Step 2: Chạy test, thấy FAIL**
- [ ] **Step 3: Viết code.** Hàm `assertStationInStore(admin, stationId, storeId)` trong `menu.ts`, đặt cạnh `assertCategoryInStore` dòng 47.
- [ ] **Step 4: Chạy `npx vitest run lib/actions/menu.test.ts app/admin/menu && npx tsc --noEmit`, thấy PASS**
- [ ] **Step 5: Commit** — `git commit -m "feat: gan tram in cho danh muc o trang Mon"`

---

### Controller áp migration (Part 1)

Do **một người** làm, không phải agent code, sau khi Task 2–3 đã review xong và **trước** khi Vercel lên code Part 1.

1. Áp `supabase/migrations/114_print_stations_jobs.sql` lên prod.
2. Kiểm: `SELECT to_regclass('public.print_jobs'), to_regclass('public.print_stations'), to_regclass('public.print_agents');` ra đủ 3 tên.
3. Kiểm: `SELECT DISTINCT print_mode FROM store_workflow_settings;` chỉ ra `browser`.
4. Kiểm Vercel có `SUPABASE_JWT_SECRET` và `SUPABASE_SERVICE_ROLE_KEY`.

Mig 114 áp trước 111–113 vì Đợt 1 cần nó để test. File không phụ thuộc ba mig đó, xem "Điểm cần anh Tú xác nhận".

---

### Task 10: Checklist test Part 1 và cập nhật tài liệu

**Files:**
- Create: `docs/testing/dot1/C-part1-in-hai-noi.md`
- Modify: `CLAUDE.md` (thêm dòng vào bảng §10)
- Modify: `AGENTS.md` (dòng quyết định 2026-09-23 về "Hai liên cùng có giá")

- [ ] **Step 1: Viết checklist, văn phong như `docs/testing/chuyen-ban-giam-gia/CB-2.md`**

Test trên quán thử hoặc Bảo Lương (cả hai policy đã là `pos_confirmation`), máy cài `print-agent` và máy in ảo `MEVO PDF`. Các bài:
1. Quán để `browser`: POS duyệt đơn, in tạm tính, in báo cáo y như cũ; phiếu bếp vẫn có giá như trước.
2. Cài đặt → In ấn: bật "Nhiều nơi", tự có trạm Quầy và Bếp.
3. Quán `automatic` không bật được; đang `agent` không đổi về `automatic` được.
4. Thêm máy: lấy mã 6 số, nhập vào phần mềm, trạng thái thành đã kết nối; danh sách máy in Windows hiện ở ô chọn.
5. Mã sai và mã quá 10 phút bị từ chối.
6. In thử từng trạm: ra PDF, đúng tên quán; lịch sử job `done` (`SELECT status, error FROM print_jobs ORDER BY created_at DESC LIMIT 5`).
7. Trạm chưa chọn máy: In thử ra `failed` với "Trạm chưa chọn máy in".
8. Tắt phần mềm 40 giây: Cài đặt báo chưa kết nối. Bật lại: tự kết nối, tự in phần còn trong hàng đợi.
9. Trang Món: gán trạm cho danh mục, lưu, mở lại thấy đúng; thu ngân không thấy ô này.
10. Gỡ máy: phần mềm chuyển "Cần ghép máy".

Ghi rõ: Part 1 chưa đổi nơi gọi in, nên bật `agent` thì POS **vẫn** in trình duyệt cho tới Part 2. Không tính FAIL. Không bật `agent` ở quán đang bán thật.

- [ ] **Step 2: Thêm dòng 2026-11-05 vào bảng §10 `CLAUDE.md`**

Nêu: mig 114, cơ chế trạm + hàng đợi + phần mềm in; RPC thay edge function và lý do; JWT 120 giây mang danh người tạo phiếu; phiếu chế biến bỏ giá chỉ ở chế độ `agent`. Các bẫy: `print()` thành công chưa phải đã ra giấy; job `printing` kẹt không tự in lại; phần mềm chỉ chạy khi cả hai policy là `pos_confirmation`.

- [ ] **Step 3: Commit** — `git commit -m "docs: checklist Part 1 in hai noi + quyet dinh mig 114"`

- [ ] **Step 4: Dừng.** Báo: *"Xong rồi anh, test theo docs/testing/dot1/C-part1-in-hai-noi.md nhé"*, kèm nhắc bài thử máy thật `C-0-may-in-that.md` là cổng của Part 2. Chờ PASS.

---

# PART 2 — Đợt 3

Điều kiện bắt đầu: anh Tú PASS Part 1 và PASS Đợt 2. Part 2 không có migration.

### Task 11: Cổng máy thật và đổi mọi nơi gọi in

**Files:**
- Modify: `admin-web/app/admin/pos/pos-client.tsx:7,497-513,534-536,693,1331`
- Modify: `admin-web/app/staff/tables/tables-client.tsx:3,188-191`
- Modify: `admin-web/app/admin/bills/bill-drawer.tsx:13,151`
- Modify: `admin-web/app/admin/bills/bills-report-view.tsx:21,86,219,254`
- Create: `admin-web/lib/print/print-call-sites.test.ts`
- Create: `admin-web/app/admin/pos/print-actions.ts`, `print-actions.test.ts`

Số dòng trên là của `main` lúc viết plan. Đợt 2 sửa `pos-client.tsx`, nên trước khi làm phải tìm lại theo tên hàm: `onPrintOrder`, `onConfirmOrder`, `onPrint`, `onPrintPreorder`.

**Interfaces:**
- Consumes: `printDocument`, `PrintRequest` (Task 5)
- Produces: `confirmAndPrint(orderId: string, deps: {confirmOrder, printDocument}): Promise<{ok:false; error:string} | {ok:true; already:boolean; printError:string|null}>`

| Chỗ | Lời gọi mới |
|---|---|
| `onConfirmOrder` | `printDocument({kind:'order', orderId})`, qua `confirmAndPrint` |
| `onPrintOrder` (nút In lại) | `printDocument({kind:'order', orderId, reprint:true})` |
| `onPrint` | `printDocument({kind:'bill', sessionIds})` |
| `onPrintPreorder` | `printDocument({kind:'preorder_job', jobId: result.printJobId})` |
| `tables-client printBill` | `printDocument({kind:'bill', sessionIds})`, lỗi vào `setError` |
| `bill-drawer` dòng 151 | `printDocument({kind:'bill', sessionIds: row.sessionIds, reprint:true})` |
| `bills-report-view` dòng 86 | `printDocument({kind:'day_report', date})` |
| `bills-report-view` dòng 254 | `printDocument({kind:'bill', sessionIds: r.sessionIds, reprint:true})`; biến `printUrl` dòng 219 đổi thành `canPrint` |

`bill` không có khoá tự nhiên nên `reprint` ở đây chỉ để đọc cho rõ, không đổi hành vi.

Lỗi in ở A04 hiện theo cách báo lỗi đang có của màn đó. `reportActionError` khi duyệt xong mà in lỗi: `Đơn đã duyệt nhưng chưa tạo được phiếu in: <lý do>. Bấm In lại ở lượt này.`. Câu `Đơn này đã được xác nhận trước đó — chỉ in lại phiếu.` (dòng 511) đổi thành `Đơn này đã được xác nhận trước đó.`, vì ở chế độ `agent` khoá tự nhiên chặn in trùng nên câu cũ sai.

- [ ] **Step 1: Kiểm cổng**

Mở `docs/testing/dot1/C-0-may-in-that.md`. Không có dòng `KẾT QUẢ: PASS`: **dừng và báo anh Tú**, không làm tiếp. Có `PASS`: đặt `pageSizeMode` trong `print-agent/agent.config.example.json` theo kết quả.

- [ ] **Step 2: Viết test**

```ts
// print-call-sites.test.ts — quét file .ts/.tsx trong app/ và components/
it('chỉ print-document.ts được import printInPlace')
// print-actions.test.ts
it('confirm lỗi: không gọi printDocument')
it('confirm được, in lỗi: {ok:true, printError:"..."}, đơn không bị coi là thất bại')
it('confirm already: vẫn gọi printDocument, không có reprint')
it('printDocument ném lỗi mạng: {ok:true, printError:"..."}')
```

- [ ] **Step 3: Chạy test, thấy FAIL**
- [ ] **Step 4: Đổi các nơi gọi theo bảng trên**
- [ ] **Step 5: Chạy `npx vitest run && npx tsc --noEmit && npm run lint`, thấy PASS**
- [ ] **Step 6: Commit** — `git commit -m "feat: moi noi goi in di qua printDocument"`

---

### Task 12: Băng đỏ và xử lý job lỗi trên POS

**Files:**
- Create: `admin-web/app/admin/pos/use-print-status.ts`
- Create: `admin-web/app/admin/pos/print-status-banner.tsx`, `print-status-banner.test.tsx`
- Modify: `admin-web/lib/actions/print-jobs.ts`, `print-jobs.test.ts`
- Modify: `admin-web/lib/print/print-call-sites.test.ts` (cho phép thêm `print-status-banner.tsx`)
- Modify: `admin-web/app/admin/pos/pos-client.tsx` (hook gần `useServiceRequests` dòng 202; banner trên thanh trên, trong `return` dòng 944)

**Interfaces:**
- Consumes: `readPrintStatus`, `PrintProblemJob` (Task 8), `retry_print_job`, `dismiss_print_job`, `browserPrintUrl`
- Produces:
  - `usePrintStatus(storeId: string): { status: PrintStatus | null; reload: () => Promise<void> }`: đọc bằng client trình duyệt, 5 giây một lần khi `agent`, 60 giây khi `browser`, đọc lại khi cửa sổ focus
  - `retryPrintJob(jobId: string): Promise<{ok:true}|{ok:false;error:string}>`, `markPrintedInBrowser(jobId: string): Promise<{ok:true}|{ok:false;error:string}>` trong `lib/actions/print-jobs.ts`
  - `<PrintStatusBanner status onRetry onBrowserPrint />`

Banner không vẽ gì khi `mode='browser'`, hoặc khi `agent` mà online và không có job lỗi. Offline: băng đỏ "Máy in chưa kết nối". Job lỗi: mỗi job một dòng với `label`, `error`, nút "In lại", nút "In bằng trình duyệt". Nút trình duyệt gọi thẳng `printInPlace(browserPrintUrl(job.request))` rồi `markPrintedInBrowser`; `printDocument` sẽ đẩy lại vào hàng đợi nên không dùng được ở đây. Vì vậy `print-call-sites.test.ts` cho phép thêm file này. `kitchen_ticket` lỗi in bằng trình duyệt ra cả hai liên với mọi món của đơn: chấp nhận, ghi rõ trong checklist. Job `test` có `request = null` thì ẩn nút trình duyệt.

- [ ] **Step 1: Viết test**

```tsx
it('browser: không vẽ gì')
it('agent online không lỗi: không vẽ gì')
it('agent offline: có "Máy in chưa kết nối"')
it('job failed: hiện label, lỗi, 2 nút')
it('job expired: hiện như failed')
it('job test: không có nút In bằng trình duyệt')
it('agent offline và có job lỗi: hiện cả hai')
// print-jobs.test.ts
it('retryPrintJob trả nguyên lỗi RPC trong {ok:false}')
it('markPrintedInBrowser gọi dismiss_print_job')
```

- [ ] **Step 2: Chạy test, thấy FAIL**
- [ ] **Step 3: Viết code.** Bấm "In lại" và "In bằng trình duyệt" xong gọi `reload()` của hook.
- [ ] **Step 4: Chạy `npx vitest run app/admin/pos lib/actions/print-jobs.test.ts lib/print && npx tsc --noEmit`, thấy PASS**
- [ ] **Step 5: Commit** — `git commit -m "feat: POS bao may in chua ket noi va xu ly phieu loi"`

---

### Task 13: Nối phần của plan B và D vào trang agent, checklist Part 2

Trang `/print/agent` phải ra phiếu giống hệt trang in thường. Ba thứ chỉ có sau khi plan B và D merge: phiếu bàn giao ca, QR trên tạm tính, dòng khoảng giờ ngày kinh doanh. Làm **sau cùng**, khi B Part 2 và D Part 2 đã vào nhánh chung. Chưa có thì Task 11–12 vẫn xong và test được; `shift_report` vẫn in trình duyệt nhờ `AGENT_KINDS`.

**Files:**
- Modify: `admin-web/lib/print/print-request.ts`, `print-request.test.ts` (thêm `shift_report` vào `AGENT_KINDS`)
- Modify: `admin-web/app/print/agent/[jobId]/page.tsx`, `page.test.tsx`
- Modify: `admin-web/app/print/shift-report/shift-report-slip.tsx`, `shift-report-slip.test.tsx` (thêm prop `autoPrint` như Task 4, plan B chưa có)
- Modify: `admin-web/lib/print/load-bill-qr.ts`, `load-bill-qr.test.ts` (tách hàm nhận client)
- Modify: `admin-web/lib/print/load-day-report.ts` (thêm `rangeLabel`)
- Create: `docs/testing/dot1/C-part2-in-ghep.md`

**Interfaces:**
- Consumes từ plan B: RPC `cash_shift_report_json(p_shift_id uuid)` (chỉ `service_role`), `parseCashShiftReport`, `<ShiftReportSlip report storeName printedAt printedBy />`, `businessDayRangeLabel(report)`
- Consumes từ plan D: `pickBillQr({sessionIds, openSessions, bank})`, prop `qr` của `PrintBill`
- Produces: `loadBillQrWith(client: SupabaseClient, storeId: string, sessionIds: string[]): Promise<BillQr | null>`; `loadBillQr` của plan D gọi lại hàm này, giữ nguyên chữ ký

Cách nối:
- `shift_report`: gọi `cash_shift_report_json` bằng `createAdminClient`, **phải** so `store_id` trong kết quả với `job.store_id` vì service role không tự lọc quán. Ca chưa đóng thì lỗi `Ca chưa kết, chưa có phiếu bàn giao`.
- `bill`: dùng client của job (Task 6) gọi `list_open_table_sessions` và đọc 3 cột `stores`. Plan D Task 6 dự phòng ghi "chế độ agent chưa có QR" vì nghĩ agent không có phiên đăng nhập; client JWT của Task 6 có đủ quyền nên không cần dòng đó.

- [ ] **Step 1: Sửa test**

```ts
it('AGENT_KINDS có shift_report')
it('shift_report: vẽ phiếu, không có no-print')
it('shift_report: ca của quán khác thì lỗi, không vẽ số tiền')
it('shift_report: ca chưa đóng thì lỗi')
it('bill chưa thu: có QR; bill đã thu: không có QR')
it('đọc QR lỗi: vẫn in bill, không có QR')
it('day_report quán 05:00: có dòng khoảng giờ')
it('ShiftReportSlip autoPrint={false}: không có no-print')
```

- [ ] **Step 2: Chạy test, thấy FAIL**
- [ ] **Step 3: Viết code**
- [ ] **Step 4: Chạy `npx vitest run app/print lib/print && npx tsc --noEmit`, thấy PASS**
- [ ] **Step 5: Viết `docs/testing/dot1/C-part2-in-ghep.md`**

Test trên hai máy in thật đúng model (Quầy + Bếp) đã qua `C-0`. Các bài:
1. Đơn món hai trạm: "Duyệt & in bếp" ra 2 phiếu bếp đúng trạm, không giá, và 1 phiếu bàn ở Quầy.
2. Đơn món một trạm ra một phiếu bếp. Danh mục chưa gán ra trạm mặc định.
3. Bấm đúp "Duyệt & in bếp" không in trùng. Nút In lại ở lượt in thêm đúng một bộ.
4. Đặt món trước ra đúng trạm theo món trong snapshot.
5. In tạm tính (có QR nếu quán khai tài khoản), gộp bill, in lại ở A04 (không có QR), phiếu cuối ngày, phiếu bàn giao ca đều ra Quầy; `/staff/tables` in bill được; tờ QR bàn vẫn mở trình duyệt.
6. Tắt phần mềm 40 giây: POS hiện băng đỏ. Bật lại: băng tắt, phiếu trong hàng đợi tự in.
7. Rút dây máy in bếp, duyệt đơn: POS hiện job lỗi trong khoảng 1 phút, không có phiếu in muộn khi cắm lại. Bấm In lại: phiếu ra đúng một lần.
8. "In bằng trình duyệt" với job lỗi: in được, job biến khỏi POS.
9. Để job chờ quá 30 phút (tắt phần mềm): `expired`, bật lại không tự in, POS có nút In lại.
10. Quán `browser`: mọi thao tác in như hôm nay, không có băng.

- [ ] **Step 6: Commit** — `git commit -m "feat: trang agent noi phieu ca, QR, khoang gio ngay kinh doanh + checklist Part 2"`

- [ ] **Step 7: Dừng.** Báo: *"Xong rồi anh, test theo docs/testing/dot1/C-part2-in-ghep.md nhé"*. Chờ PASS.

---

## Điểm cần anh Tú xác nhận

1. **Giá phiếu bếp: đã chốt 2026-11-06.** Chỉ bỏ giá ở chế độ `agent`, chế độ `browser` giữ nguyên quyết định 2026-09-23, Bảo Lương không đổi.
2. **Mig 114 áp trước 112, 113: đã chốt.** C Part 1 ở Đợt 1 cần mig 114 để test. File không phụ thuộc ba mig kia nên áp sớm an toàn; số migration chỉ là nhãn, như 107/108 từng áp sau 109.
