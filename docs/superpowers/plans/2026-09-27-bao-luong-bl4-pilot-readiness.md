# Bảo Lương BL-4 — Pilot readiness Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` để thực hiện tuần tự trong task hiện tại. Các bước dùng checkbox. Quy tắc AGENTS.md ưu tiên: hoàn thành một task thì cập nhật/đọc file test riêng, dừng chờ anh Tú PASS; nhận PASS thì commit ngay. Không chạy hết plan trong một lượt.

**Goal:** Sửa lỗi đồng bộ khi mạng chậm, kiểm chứng giao dịch đồng thời trên PostgreSQL thật, bổ sung phục hồi Thông báo nội bộ và nghiệm thu Bảo Lương trên bản khách thực sự sử dụng.

**Architecture:** Giữ Supabase/RPC là nguồn sự thật; dùng bộ điều phối tải snapshot chung cho các watcher hiện có. Kiểm thử tuần tự tách khỏi PostgreSQL nhiều kết nối. Delivery được phục hồi thủ công trên cùng ID, có audit và token theo lần thử; chỉ mở retry khi relay thật đã chứng minh dedup. Testing và Publish là hai cổng nghiệm thu riêng.

**Tech Stack:** Next.js 16.2.6/React 19, TypeScript/Vitest; Mini App React 18/Vite; PostgreSQL/Supabase, PGlite, Node test runner; Edge Function TypeScript và relay ZCA hiện hữu.

**Spec:** [Design đã duyệt](../specs/2026-09-24-bao-luong-bl4-pilot-readiness-design.md), `SPEC BL-4 PASS` ngày 2026-09-27.

**Trạng thái:** `PLAN BL-4 PASS` ngày 2026-09-29. Task 1 đã PASS và commit `7b6670a`; Task 2 đã PASS ngày 2026-09-30 với ma trận PostgreSQL nhiều kết nối đầy đủ.

## Global Constraints

- Bảo Lương dùng POS duyệt và phiếu giấy hai liên có giá, không Kitchen Display; không gửi ZCA/OA/ZNS cho khách. Pubu giữ policy hiện tại.
- PGlite chỉ kiểm tuần tự/idempotency; PostgreSQL ít nhất hai kết nối mới là evidence concurrency. Thiếu môi trường ghi BLOCKED, không đổi thành PASS.
- Watcher visible: interval 2s/2s/5s; preorder 5s, gọi nhắc 15s. Hidden tối thiểu 30s; lỗi backoff 5/10/20/30s. Không chồng load cùng nguồn.
- Mục tiêu visible khi load <=1s: hai queue <=5s, sơ đồ bàn <=7s. Idle budget năm nguồn <=88 load/phút/tab visible, <=10 hidden, loại init/event/thao tác khỏi phép đo idle.
- Delivery kẹt sau 120s; requeue cooldown 60s, tối đa 3 lần, cửa sổ 24h; relay dedup bền tối thiểu 48h. Không retry daemon.
- Dispatch token, Group ID đầy đủ, HMAC, payload khách và bot session không ra browser/log. UI gọi là **Thông báo nội bộ**.
- Migration tương thích ngược -> Edge nếu đổi -> admin-web -> Mini App Testing -> Publish -> QR khách thật. Không đổi chữ ký RPC của bản đang Publish.
- Không fault injection vào production, không dùng secret production cho fixture. Không tự đăng ký dịch vụ tính phí để có test database.
- Mỗi task tự chạy automated tests liên quan; anh Tú chỉ làm phần UI/thiết bị thật được chỉ rõ. Commit sau PASS, không tự push/deploy chỉ vì commit.
- Trước sửa code admin đọc `admin-web/AGENTS.md` và guide Next tương ứng trong `node_modules/next/dist/docs/`. Kiểm git status; không ghi đè thay đổi khác.

## Review Focus

1. Response về sau khi owner resolve/confirm không được làm card sống lại: Task 1 kiểm mutation epoch và tất cả đường reload thủ công.
2. Test đồng thời chạy trên DB có stub nghiệp vụ sẽ cho cảm giác an toàn sai: Task 2 dùng migrations/role thật, xác nhận PID khác nhau và chờ khóa thực tế.
3. Bot gửi xong nhưng mất response hoặc restart: Task 3 kiểm relay thật, payload bất biến, finish worker cũ và trạng thái chưa rõ; không dựa chỉ vào mock.
4. Công tắc server tắt tính năng có thể làm owner mất khả năng xử lý booking cũ: Task 4 kiểm cả nhận mới bị chặn lẫn quản lý dữ liệu đang mở.
5. QR Testing lẫn QR Publish hoặc bản Publish cũ gọi API mới: Task 4 lưu contract cũ, Task 5 kiểm URL/version bằng tài khoản khách không là tester.

## Bản đồ file và môi trường

| Phần | File hiện có / file tạo mới | Trách nhiệm |
| --- | --- | --- |
| Điều phối snapshot | tạo `admin-web/lib/snapshot-poller.ts`, `.test.ts`; `snapshot-poller-browser.ts`, `.test.ts` | concurrency một nguồn, retry/backoff, lifecycle browser |
| Watcher | sửa `admin-web/lib/reservation-queue-watcher.ts`, `service-request-queue.ts`, `cashier-session-watcher.ts` và test tương ứng | adapter socket, normalize data, chuông |
| Call site | sửa `admin-web/app/admin/cashier/cashier-client.tsx`, `service-request-queue.tsx`, `admin-web/app/admin/reservations/reservations-client.tsx`, `admin-web/app/kitchen/[storeSlug]/kitchen-display.tsx` nếu chữ ký adapter đổi | mọi load/mutation đi chung coordinator; giữ hồi quy Kitchen Pubu |
| PostgreSQL test | tạo `supabase/tests/helpers/bl4-postgres.mjs`, `bl4-fixtures.mjs`, `supabase/tests/bl4-postgres.integration.mjs`, `scripts/bl4-prepare-test-db.mjs` | migrations, fixture, nhiều kết nối và quan sát khóa |
| Sequential tests | tạo `supabase/tests/bl4-sequential.test.mjs`; sửa test 065/067/069/073/075/076/077/078 khi thêm ca hồi quy | capability, retry, lifecycle; ghi rõ fixture stub |
| Relay recovery | tạo `079_reservation_notification_recovery.sql`, `080_reservation_notification_recovery_dispatch.sql` trong `supabase/migrations/` và test cùng tên trong `supabase/tests/` | schema, RPC, audit, dispatch |
| Relay handler/UI | sửa `supabase/functions/reservation-zca-notify/{handler,index}.ts`, `_shared/zca-relay.ts` và test; `admin-web/lib/actions/reservation-group-notifications.ts` và test; cockpit `reservation-group-notifications.tsx` và test | payload ổn định, trạng thái đủ, retry có quyền |
| Contract triển khai | tạo `scripts/bl4-check-release.mjs`, `supabase/tests/bl4-release-contract.integration.mjs`, `supabase/tests/fixtures/bl4-published-contract.json` | kiểm build/instance và tương thích RPC client cũ |
| Evidence/runbook | tạo `docs/testing/bao-luong/SPRINT-BL-4.md`, `docs/operations/bao-luong-pilot-runbook.md`; cập nhật AGENTS/PRD/ARCHITECTURE/TESTING | checkpoint từng task và ca vận hành |

Test PostgreSQL Task 2 đã chứng minh hai lỗi concurrency/server thật, nên migration additive
`078_bl4_concurrency_fixes.sql` đã được dùng để chuẩn hóa thứ tự khóa và sửa guard QR.
`078a_bl4_restore_prearrival_hold.sql` sửa hồi quy công thức giữ bàn 60 phút bị 078 ghi đè;
giữ nguyên khóa chung và backfill phân bổ confirmed còn hiệu lực. Không sửa
migration đã chạy; nếu cần sửa tiếp, dùng migration mới kế tiếp.

Kiểm tra tại thời điểm lập plan: chưa có `supabase/config.toml`; `docker`, `psql`, `supabase` chưa tìm thấy trong PATH, chỉ thấy Node/npm. Điều này chưa chứng minh máy không cài ở nơi khác. Task 1 không phụ thuộc Docker. Task 2 có bước preflight, dùng Supabase local nếu khả dụng hoặc DB test riêng đã được cung cấp; không lấy production thay thế. Không tạo hạ tầng khi chỉ đang duyệt plan.

## Task 1 — Sửa watcher mạng chậm và đồng bộ POS

**Files:** snapshot-poller/browser + ba watcher/test; cashier-client, reservation-client, ServiceRequestQueue và call site Kitchen trong bảng trên. Tạo `admin-web/lib/bl4-poll-budget.test.ts` và test tích hợp call site `admin-web/app/admin/cashier/cashier-refresh.test.ts`.

**Interface mới:** các watcher dùng cùng primitive sau; `load` không set React state trước khi coordinator chấp nhận kết quả.

```ts
export type SnapshotResult<T> = { ok: true; value: T } | { ok: false; error: string }
export type RefreshReason = 'event' | 'manual' | 'mutation' | 'focus' | 'online' | 'visible'
export type SnapshotPoller<T> = {
  refresh(reason?: RefreshReason): Promise<boolean>
  setHidden(hidden: boolean): void
  dispose(): void
}
export function createSnapshotPoller<T>(options: {
  load: () => Promise<SnapshotResult<T>>
  onValue: (value: T) => void
  onError: (error: string | null) => void
  intervalMs: number
  errorMessage: string
}): SnapshotPoller<T>
// snapshot-poller-browser.ts: lắng nghe window focus/online và document visibilitychange.
export function bindSnapshotPollerBrowser(
  poller: Pick<SnapshotPoller<unknown>, 'refresh' | 'setHidden'>,
  sources?: { window: EventTarget; document: EventTarget & { hidden: boolean } },
): () => void
```

`refresh` trả true khi một snapshot đủ mới cho yêu cầu đã áp; false khi tải lỗi hoặc dispose.
Nhiều waiter gộp lại, không thêm load riêng. `mutation` tăng epoch để vô hiệu hóa request bắt đầu
trước mutation đã thành công; event/poll thông thường không tăng epoch. Mỗi source giữ một load.
Event trong load đánh dấu dirty, áp kết quả hợp lệ rồi lên lịch thêm một load; tối thiểu 100ms
giữa các lượt do event, không vòng while vô hạn. Lỗi lên lịch backoff; event thường không vượt
backoff, thao tác manual/focus/online/visible được thử sớm và vẫn gộp. Timer poll bắt đầu sau finish.

- [ ] **1.1 Tái hiện bằng tests trước khi sửa.** Thêm ca load 5s/poll 2s vào cả hai queue bằng helper deferred có sẵn; assert onRows được gọi, không chỉ đếm load. Chạy riêng để thấy FAIL đúng nguyên nhân:

```ts
// Bổ sung vào reservation-queue-watcher.test.ts với fakeClient/fakeEvents/reservation hiện có.
it('load 5s vẫn được áp khi poll 2s', async () => {
  vi.useFakeTimers()
  const first = deferred<{ ok: true; reservations: ReservationRow[] }>()
  const load = vi.fn().mockReturnValue(first.promise)
  const onRows = vi.fn()
  const watcher = watchReservationQueue({
    client: fakeClient().client as never, storeId: 'store-1', load,
    onRows, onError: vi.fn(), onConnected: vi.fn(), eventTarget: fakeEvents(),
  })
  await vi.advanceTimersByTimeAsync(5_100)
  first.resolve({ ok: true, reservations: [reservation('slow')] })
  await vi.advanceTimersByTimeAsync(0)
  expect(onRows).toHaveBeenCalledWith([reservation('slow')])
  watcher.dispose()
})
```

Run từ `admin-web`: `npm test -- lib/reservation-queue-watcher.test.ts lib/service-request-queue.test.ts lib/cashier-session-watcher.test.ts`.

- [ ] **1.2 Viết primitive/test và browser binding theo interface trên.** Guard epoch sau await, chỉ có một timer/request; hủy timer và resolve waiter false khi dispose. Không tạo AbortController giả vờ hủy Server Action. Test error sau 5s vẫn hiện, event mỗi 500ms không starvation, hidden đổi giữa load, dispose khi request còn chạy, mutation làm bỏ snapshot cũ và lượt kế tiếp áp kết quả mới. Sửa các test cũ coi mọi event là lý do bỏ snapshot cho đúng hợp đồng mới; giữ test mutation thật.

```ts
// Đoạn quyết định sau await trong primitive, các biến thuộc closure của poller.
const startedEpoch = mutationEpoch
const result = await options.load()
if (stopped) return
if (startedEpoch !== mutationEpoch) { dirty = true; return }
if (result.ok) {
  options.onValue(result.value)
  options.onError(null)
} else options.onError(result.error)
// finally luôn thả running và lên lịch bounded next load/backoff; không return bỏ cleanup.
```

- [ ] **1.3 Nối adapters và mọi call site.** Reservation/service watcher normalize `{reservations}`/`{requests}` sang value; giữ lọc store/resolve và dedup chuông `(id,last_ping_at)`. Cashier watcher đổi từ callback reload có side effect sang `load/onRows/onError`, trả refresh cùng API. `reload`, `reloadReservations`, `reloadPreorders`, `reloadCustomerCalls` ở cashier trở thành facade gọi poller; không còn direct await rồi setState song song. Sau RPC mutation thành công gọi `refresh('mutation')`; lỗi giữ action error. Preorder và gọi nhắc dùng poller với interval 5s/15s. Gỡ listener focus ngoài component khi browser binding đã sở hữu. Staff dùng ServiceRequestQueue được kiểm hồi quy; Kitchen Pubu giữ chuông/request và không thêm bước duyệt Bảo Lương.

- [ ] **1.4 Test call site và budget.** Dùng deferred kết hợp spy apply: bắt đầu load cũ, resolve/confirm thành công ở tab hiện tại, load cũ hoàn tất, chỉ snapshot tải sau mutation được áp. Hai tab/mutation remote có snapshot kế tiếp hội tụ, không tuyên bố cấm mọi snapshot tạm cũ từ server. Fake timer 60 phút sau warmup: năm nguồn visible <=5.280 load/giờ, hidden <=600; maxInFlight mỗi source =1. Test focus+online+visible cùng tick chỉ thêm một lượt. Thử request mạng lỗi, tổng số gọi không tăng vì retry. Đo browser 10 phút idle ở dev/prod preview với Network để ghi số Server Action thực, không suy giá Vercel từ unit test.

- [ ] **1.5 Verify và checkpoint.** Từ admin-web chạy `npm test`, `npx tsc --noEmit --pretty false`, `npm run build`; ghi lỗi nền riêng nếu có, không đổi thành PASS. Anh Tú test POS+staff và đặt bàn trên mạng chậm, trở lại sau tab ẩn >5 phút, resolve không sống lại, thao tác lỗi còn nguyên. Không yêu cầu deploy Mini App mới vì Task 1 chỉ đổi admin. Viết/đọc `SPRINT-BL-4.md` — Test 1A (automated evidence), 1B (UI), 1C (budget/tab nền). Dừng. Sau `Task 1 PASS` commit `fix: dong bo pos khi mang cham` với đúng file task.

## Task 2 — Test nghiệp vụ tuần tự và PostgreSQL đồng thời

**Files:** helpers/fixture/test/prepare script trong bảng; thêm devDependency `pg` vào `admin-web/package.json` và lockfile, scripts `test:bl4:postgres`, `test:bl4:sequential`; tạo `supabase/tests/fixtures/bl4-test-transport.sql`. Sửa migration mới `078_bl4_concurrency_fixes.sql` và RPC liên quan chỉ khi có failing test thật, không sửa migration đã chạy.

**Interfaces:**

- `helpers/bl4-postgres.mjs`: `openTestDatabase()` trả `{ observer, connectActor, close }`. Resolve `pg` từ `admin-web/package.json` bằng `createRequire`. `connectActor({ userId, role })` tạo `pg.Client` riêng, role chỉ `anon/authenticated/service_role`; `close()` chờ đóng toàn bộ kết nối.
- `waitForBlock(observer, blockedPid, blockerPid)` trả `Promise<void>` khi observer thấy đúng quan hệ khóa; ném lỗi khi deadline 5s hết, không coi timeout là thành công.
- `helpers/bl4-fixtures.mjs`: `seedBl4Fixture(client)` trả `{ storeId, otherStoreId, ownerId, staffId, superadminId, reservationId, customerToken, preorderId, orderId, tableIds, cleanup }`. ID/token đều từ fixture test; `cleanup()` bất đồng bộ chỉ xóa dữ liệu của fixture. Tạo nghiệp vụ bằng RPC thật, không thay implementation RPC.

`BL4_TEST_DATABASE_URL` chỉ đọc từ môi trường, không log. Preflight cho phép loopback mặc định;
remote phải có `BL4_TEST_ALLOWED_HOST` khớp hostname chính xác và DB marker test được tạo riêng.
Không suy test URL từ `.env.local` production. Helper xác nhận marker, schema migrations và
`server_version`; client thiếu cấu hình phải exit khác 0 với thông báo BLOCKED, không skip xanh.

- [ ] **2.1 Chuẩn bị PostgreSQL test.** Kiểm Docker/Supabase CLI ở PATH và nơi cài đã biết. Dùng Supabase local riêng nếu có, hoặc test database được cấu hình. `scripts/bl4-prepare-test-db.mjs` chỉ áp vào database test trống/được đánh dấu; không DROP/RESET DB hiện hữu. Manifest lưu tên/hash migration, sắp đúng 050/050a/059/059a/078/078a, áp 001–078a nguyên bản. Lỗi migration dừng và báo file; không tự bỏ qua bằng catch hoặc thay RPC bằng stub. Nếu bootstrap lịch sử cần prerequisite Supabase auth/storage/realtime/pg_net, dùng local Supabase đầy đủ hoặc clone schema test không chứa dữ liệu thật; ghi baseline manifest rõ.
- [ ] **2.2 Chặn outbound trước khi tạo fixture.** Migration 064 chứa URL production; ở DB test thay **transport trigger** bằng capture vào bảng `bl4_test.dispatch_log` trước fixture, sau đó assert không có HTTP network. Đây là transport double, không thay business RPC/locks. Marker test và bảng capture chỉ tồn tại DB test, không đưa vào migrations production. Task 3 kiểm dispatch thực qua stub HTTP loopback riêng. Nếu không cô lập được transport thì không chạy fixture.
- [ ] **2.3 Viết fixture/lifecycle tuần tự.** Store giả Bảo Lương postpay/cash + Pubu prepay/automatic; users/roles, 3 bàn, menu items, booking confirmed, batch preorder/QR được tạo qua RPC thật. PGlite mới kiểm create retry đúng/sai token, payload đổi cùng request ID, batch thứ hai bị cấm, no-show món chưa in/đã in và waste audit; bàn/mâm/order không mồ côi. Ghi rõ test nào dùng stub nền. PostgreSQL fixture cleanup theo ID của chính test sau khi mọi connection đóng transaction; không xóa quán thật.
- [ ] **2.4 Viết test thật chứng minh tranh khóa.** Dùng client A giữ transaction và row lock, client B gọi RPC khi A chưa commit; observer nhìn `pg_blocking_pids`, có deadline 5s và statement timeout 10s. Release barrier rồi await B, kiểm kết quả DB/audit. Ví dụ khung confirm/reject (fixture dùng order QR pending):

```js
const a = await db.connectActor({ userId: fixture.ownerId, role: 'authenticated' })
const b = await db.connectActor({ userId: fixture.ownerId, role: 'authenticated' })
await a.query('BEGIN')
await b.query('BEGIN')
await a.query("SET LOCAL statement_timeout = '10s'")
await b.query("SET LOCAL statement_timeout = '10s'")
const pidA = (await a.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
const pidB = (await b.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
assert.notEqual(pidA, pidB)
await a.query('SELECT id FROM orders WHERE id=$1 FOR UPDATE', [fixture.orderId])
const competing = b.query('SELECT pos_reject_order($1,$2,NULL)', [fixture.orderId, 'out_of_stock'])
  .then(value => ({ value }), error => ({ error }))
await waitForBlock(db.observer, pidB, pidA)
await a.query('SELECT pos_confirm_order($1)', [fixture.orderId])
await a.query('COMMIT')
const result = await competing
assert.match(result.error.message, /đang chờ xác nhận/)
await b.query('ROLLBACK')
// finally rollback nếu còn transaction, đóng clients và cleanup fixture kể cả khi assert fail.
```

- [ ] **2.5 Chạy đủ ma trận hai thứ tự.** confirm/confirm và arrive/arrive cùng booking; cancel/no-show so với arrive; cancel/no-show so với release preorder; đổi bàn/giờ so với create_table_order_batch; pos_confirm_order/pos_reject_order; QR retry cùng request-ID; khóa 60 phút với session cũ. Với hai RPC khóa nhiều hàng, thêm barrier giữ mỗi hàng ở hai connection rồi gọi hai RPC để lộ thứ tự khóa trái nhau; không chỉ tuần tự hóa mọi case bằng một khóa đầu vào. Kiểm timeout/deadlock SQLSTATE là FAIL; kiểm lỗi nghiệp vụ có chủ đích và tổng trạng thái cuối, session/order/print-job/audit. Rà thứ tự khóa các RPC làm evidence bổ trợ.
- [ ] **2.6 Fix nếu có FAIL, rerun mục liên quan.** Đã tạo migration 078 sau khi PostgreSQL chứng minh: release preorder không khóa reservation trước order, trigger khóa bàn so nhầm order source `customer` trong khi QR tạo `customer_zalo`. Rà soát lock cho thấy phân bổ booking dùng row lock khác advisory lock của QR; migration chuẩn hóa cả hai về advisory lock theo bàn rồi row lock, đồng thời khóa reservation rồi order cho release và kiểm trạng thái booking. Harness sửa fixture đổi booking qua RPC thật, thời điểm tranh bàn cùng nhau, phép đếm retry qua batch mapping và cleanup fixture sót. Log tiếp theo phát hiện 078 ghi đè công thức giữ bàn 60 phút: thêm 078a, không sửa migration đã áp. Tách bàn riêng cho ca đổi bàn/QR, mâm và session cũ để tránh booking ca trước làm sai tiền điều kiện. Test thực thi phân bổ đã RED trước sửa, PGlite sau sửa 50/50 PASS; cần chạy lại ma trận PostgreSQL sau khi test DB áp 078a, không lấy PGlite làm bằng chứng race.

Commands sau khi scripts được thêm:

```powershell
cd D:\Code\mevo\admin-web
npm run test:bl4:prepare-db
npm run test:bl4:sequential
npm run test:bl4:postgres
```

Script sequential gọi Node test runner với PGLITE_MODULE resolve từ dependency admin; script postgres gọi `../supabase/tests/bl4-postgres.integration.mjs` qua pg thật. Codex tự chạy phần sequential. Ma trận PostgreSQL phải chạy trong PowerShell của anh Tú đang giữ các biến môi trường test DB; không cần nhập hoặc gửi connection string nếu cửa sổ đó vẫn mở.

- [x] **2.7 Checkpoint Test 2.** PostgreSQL test chạy đầy đủ sau 078a, kết thúc `BL-4 PostgreSQL concurrency PASS: full lock/race matrix`; không đưa connection string vào evidence. Sau `Task 2 PASS` commit `fix: khoa giao dich dong thoi bl4`.

## Task 3 — Phục hồi Thông báo nội bộ có kiểm soát

**Files:** migrations 079/080, test cùng tên, handler/sender/actions/cockpit/test trong bảng. Tạo `admin-web/lib/reservation-delivery-status.ts`, `.test.ts`, `docs/testing/bao-luong/BL-4-RELAY-EVIDENCE.md` và `supabase/tests/bl4-delivery-concurrency.integration.mjs`.

**Schema/RPC mới:** tên sau dùng nhất quán ở migration, action và test. Đây là schema additive; giữ claim/finish hiện có để worker cũ không lỗi chữ ký.

```sql
-- reservation_notification_deliveries bổ sung:
-- queued_at timestamptz, recovery_version integer NOT NULL DEFAULT 0,
-- message_snapshot jsonb, relay_payload jsonb, requeue_count integer NOT NULL DEFAULT 0
-- store_reservation_notification_channels bổ sung:
-- retry_contract_verified_at timestamptz, retry_contract_evidence text,
-- retry_contract_version integer; mặc định NULL => không được retry.
-- reservation_notification_recovery_events: id, store_id, delivery_id, request_id,
-- actor_id, reason, from_status, from_updated_at, to_updated_at, created_at;
-- UNIQUE(delivery_id, request_id); RLS/revoke trực tiếp anon/authenticated.

requeue_reservation_zca_notification(
  p_store_id uuid, p_delivery_id uuid, p_expected_updated_at timestamptz,
  p_request_id uuid, p_reason text
) RETURNS jsonb
-- { ok: true, already: boolean, delivery_id: uuid, status: 'queued' }

freeze_reservation_zca_payload(
  p_delivery_id uuid, p_dispatch_token uuid, p_text text
) RETURNS jsonb -- service_role only: payload bất biến, hoặc NULL nếu token hết hiệu lực.
```

Requeue dùng session authenticated của superadmin (`await createClient()`), DB kiểm `auth.uid()`
và operator active/role/store_id NULL; không dùng service-role + actor do browser tự gửi.
Audit ghi actor lấy từ auth, không nhận actor parameter. Claim/freeze/finish chỉ service_role.

Type trình duyệt trong `reservation-delivery-status.ts`:

```ts
export type DeliveryStatus = 'queued' | 'processing' | 'sent' | 'failed' | 'action_required'
export type DeliverySummary = {
  id: string; status: DeliveryStatus; updatedAt: string; createdAt: string;
  queuedAt: string | null; processingStartedAt: string | null;
  attemptCount: number; requeueCount: number; providerCode: string | null;
  stale: boolean; canRetry: boolean; retryBlockedReason: string | null;
}
// Actions: tất cả requireSuperadmin; read dùng projection allow-list.
// listGroupNotificationDeliveries(storeId, before?: { createdAt: string; id: string })
//   -> Promise<{ rows: DeliverySummary[]; nextCursor: { createdAt: string; id: string } | null }>
// retryGroupNotificationDelivery(storeId, { deliveryId, expectedUpdatedAt, requestId, reason })
//   -> Promise<{ ok: boolean; error?: string; already?: boolean }>
```

- [ ] **3.1 Viết failing tests schema/RPC.** Kiểm superadmin thật, owner/staff/anon và JWT không operator; trạng thái mới/già, ngưỡng 120s, cooldown 60s, lần 4, quá 24h, booking không pending/đã quá giờ, destination đổi, channel tắt, evidence chưa có. Requeue hai tab với cùng/different request-ID phải một lượt thành công; replay cùng request không đổi audit. Cùng request-ID nhưng đổi reason/delivery/precondition phải bị từ chối, không giả báo already.
- [ ] **3.2 Migration 079 và payload snapshot.** Hàng cũ recovery_version=0, không tự đoán payload đã gửi. Enqueue mới snapshot kind/name/party_size/arrival ngay transaction tạo delivery và recovery_version=1; không phone/note/token. Khi worker nhận queued lần đầu, lấy snapshot để dựng text; freeze lưu toàn bộ `{version,notification_id,store_id,group_id,text}` trước khi gọi mạng. freeze khóa row/token/status, trả lại payload cũ nếu có; RPC tự lấy ID/store/group, không tin input group. Snapshot text chứa origin được freeze một lần để đổi ADMIN_PUBLIC_ORIGIN không làm retry khác body. Queued mới chưa từng gửi có snapshot nhưng chưa relay_payload vẫn phục hồi được; worker tiếp theo freeze trước send. Legacy thiếu snapshot bị khóa retry. Version mới không có đường send trước freeze.
- [ ] **3.3 RPC requeue có khóa và audit.** Khóa channel/booking/delivery theo thứ tự thống nhất với enqueue/claim, rà lại deadlock bằng harness Task 2. Kiểm đầy đủ điều kiện spec rồi rotate dispatch_token, queued_at, status, requeue_count; audit nguyên tử. Gửi lại không đổi ID, idempotency key, snapshot/destination. Double-click retry HTTP cùng request chỉ đọc audit đã commit. Clear verification khi đổi destination hoặc cấu hình relay contract; evidence do MEVO ghi sau khi test thật, UI không có checkbox tự chứng nhận tùy ý. Không cho authenticated ghi trực tiếp field verification.
- [ ] **3.4 Migration 080 dispatch một đường.** Trigger INSERT queued hoặc UPDATE đổi token vào queued mới gọi pg_net một lần; UPDATE unrelated không dispatch. Bỏ fetch trực tiếp trong sendGroupNotificationTest; action chỉ enqueue rồi trả queued, UI tải trạng thái server. URL Edge lấy từ setting DB `app.settings.reservation_zca_notify_url`, không copy URL production cứng từ 064. Thiếu setting/enqueue HTTP lỗi: giữ queued, ghi mã lỗi rút gọn để phục hồi, không rollback booking; test phải chứng minh điều này. Supabase deployment cấu hình setting qua connection quản trị; test dùng loopback stub. Không ghi token/body vào log. Migration không tự gửi lại outbox cũ. Read-only preflight phải phát hiện chưa cấu hình URL trước khi bật channel.
- [ ] **3.5 Handler fencing và lỗi provider.** Send từ payload đã freeze. Claim NULL => skipped; freeze NULL => không send; finish false => trả lost_claim, không ok:true. Mã lỗi provider/UI dùng allow-list, unknown => thông báo chung; không echo message/secret từ provider vào UI/index catch log. Giữ raw UTF-8 HMAC test cũ.

Trong `handler.test.ts`, mở rộng fixture delivery hiện có với snapshot version 1; mock claim trả delivery, freeze trả payload cố định, send thành công nhưng finish trả `false`. Assert kết quả `{ ok: false, status: 'lost_claim' }`, send đúng một lần với payload đã freeze. Một test khác cho freeze trả NULL phải assert send không được gọi. Với delivery legacy version 0, giữ khả năng gửi lần đầu qua contract cũ khi deploy chuyển tiếp, nhưng không tự nâng thành bản có thể retry nếu thiếu snapshot đáng tin cậy.

- [ ] **3.6 Cockpit và actions.** Đủ năm trạng thái; failed ghi “Gửi thất bại”, queued “Đang chờ gửi”, processing “Đang gửi”, stale “Cần kiểm tra”, không “Sẽ thử lại”. Lỗi/kẹt được query riêng khỏi latest success, phân trang 20 row theo created_at/id. Reply UI chỉ projection cho phép; nút retry gửi expectedUpdatedAt + requestId giữ nguyên khi response mất. Nút bị khóa nếu chưa evidence hoặc DB điều kiện không đạt; server vẫn recheck. Poll bảng đang mở mỗi 10s và khi trở về tab qua primitive Task 1, không retry nền; 390px không tràn. Gửi test queued không giả hiển thị sent.
- [ ] **3.7 Test relay thật và limits.** Nhóm test riêng, ID fixture mới; lần 1 gửi thành công nhưng proxy test chặn response, lần 2 cùng ID/payload => một tin; hai request đồng thời => một tin; restart bot service rồi cùng ID => không thêm tin; payload khác cùng ID bị từ chối. Ghi relay revision, TTL >=48h, bằng chứng lưu bền, ID thử đã che dữ liệu và kết quả; mock không thay evidence này. Tình huống provider nhận rồi relay chưa ghi outcome phải giữ unknown, không blind resend. Chưa có quyền truy cập/code relay: ghi BLOCKED 3C, giữ retry tắt và dùng POS, không tuyên bố Task 3 đầy đủ PASS.

Commands: từ admin-web `npm test -- lib/actions/reservation-group-notifications.test.ts lib/reservation-delivery-status.test.ts`; chạy component test qua đường dẫn literal khi shell có `[storeId]`; Edge tests bằng Vitest binary từ admin, cwd repo và truyền `supabase/functions/reservation-zca-notify/handler.test.ts supabase/functions/_shared/zca-relay.test.ts`. PGlite migration 079 + PostgreSQL delivery concurrency, TypeScript/build sau thay đổi UI/action.

- [ ] **3.8 Checkpoint Test 3A/3B/3C.** 3A automated, 3B cockpit, 3C relay thật. Deploy tương thích migration -> setting URL -> Edge -> admin với retry gate tắt; xác minh mới bật theo evidence. Không đăng nhập lại hoặc restart bot production dùng cho Pickleball chỉ để diễn tập. Sau `Task 3 PASS` commit `feat: phuc hoi thong bao noi bo co audit`.

## Task 4 — Runbook và tương thích phát hành

**Files:** release check script/contract fixture/test và runbook trong bảng; cập nhật AGENTS.md, PRD.md, ARCHITECTURE.md, TESTING.md. Chỉ thêm migration sửa nếu test server switch/compatibility thực sự fail; không sửa migration lịch sử.

**Interfaces:** `scripts/bl4-check-release.mjs --instance <absolute-dir> --expected-commit <sha>` exit 0 khi instance sạch/không MERGE_HEAD/CHERRY_PICK_HEAD, package/config đúng App ID, commit chứa code dự định deploy. Không đọc/in secret .env; nếu cần env chỉ báo có/không. Fixture published contract ghi RPC name, tên args/types và payload giả hợp lệ cho store test, không chứa token khách thật.

- [ ] **4.1 Lưu contract bản Publish.** Xác minh version/commit từ artifact/Console hoặc evidence trước; không mặc định HEAD là Publish. Trích lời gọi create_order/create_table_order_batch/reservation của bản ấy vào fixture giả. Nếu chưa xác định được bản đang Publish, ghi thiếu evidence và chưa đạt release gate; vẫn viết/test compatibility với baseline 07aab7f nhưng gắn nhãn baseline.
- [ ] **4.2 Test thực thi payload cũ trên DB mới.** PostgreSQL harness Task 2 chạy đủ kênh/role; assert function signature tồn tại **và** gọi được với named arguments, defaults, shape response. Replay migration additive không xóa overload cũ. Mini App core `npm test` + typecheck; build instance Bảo Lương và Pubu nếu thực sự thay core, không deploy nhầm quán.
- [ ] **4.3 Kiểm server switch bằng RPC.** Dùng fixture có booking/bill cũ; is_accepting_orders=false chặn món tức thời đúng luật nhưng booking tương lai vẫn hoạt động; tắt reservations kèm preorder chặn mới, vẫn đọc/xử lý booking cũ; tắt preorder chỉ chặn batch mới; tắt table_ordering chặn QR kể cả client cũ; channel none ngừng enqueue/claim/requeue mới, audit cũ còn. Khôi phục fixture sau test. UI quản lý booking cũ nếu bị mất vì capability tắt là FAIL cần sửa, không ghi runbook rằng vẫn dùng được.

Trong `bl4-release-contract.integration.mjs`, đọc booking confirmed qua `get_customer_reservation(p_reservation_id, p_customer_token)` bằng kết nối anon và token fixture; ghi tổng bill hiện hữu bằng truy vấn DB. Kết nối setup tắt đồng thời `reservation_preorder_enabled` và `reservations_enabled`. Assert RPC tạo booking mới bị từ chối; đọc lại booking cũ vẫn cùng ID; owner gọi `arrive_reservation(p_reservation_id)` vẫn thành công và có session; bill hiện hữu không đổi tổng. Mỗi assertion dựa trên RPC/query thật, không dùng object kết quả tự dựng. Chạy ca bill và ca nhận khách trên fixture độc lập để việc gắn preorder vào phiên không bị nhầm là thay đổi sai tổng bill.

- [ ] **4.4 Viết runbook với đường thao tác cụ thể.** Trước ca: owner mở `/admin/cashier`, cửa sổ hiển thị, mở âm thanh, thử máy in; nhóm chỉ nhắc. Booking: `/admin/reservations`, xác nhận/chọn bàn, gọi nhắc 60 phút, khách đến/no-show đóng tay. Món: duyệt/in 2 liên, mục đã duyệt/in hôm nay; nếu chưa rõ in xong phải nhìn giấy/job trước in lại. Sự cố relay: owner tiếp tục POS, MEVO xem `/mevo/stores/<storeId>` -> Thông báo nội bộ; không tạo test tin thay cho retry delivery booking. Mất mạng không nhận thanh toán/đóng bill như đã sync; ghi nhận thủ công rồi đối soát. Mỗi sự cố ghi triệu chứng -> người xử lý -> thao tác -> dấu hiệu hồi phục.
- [ ] **4.5 Ghi deploy/recovery chính xác.** DB backward compatible, cấu hình transport, Edge/admin, preflight instance, Testing env/version, Publish và QR thật. Lệnh zmp chạy trong `<instance>/mini-app`, không ở root repo/worktree; kiểm App ID trước deploy. Hồi phục ưu tiên cờ server đã test; admin rollback chỉ deployment còn tương thích DB; Mini App cần version thật đã Publish, không hứa duyệt nhanh. Không hướng dẫn git merge khi MERGE_HEAD/CHERRY_PICK_HEAD còn tồn tại; xử lý trạng thái checkout trước. Biến NEXT_PUBLIC_ZALO_ENV/VERSION của admin dùng chung không đổi để test riêng một quán.
- [ ] **4.6 Evidence và checkpoint Test 4.** Codex tự chạy release checker trên checkout đúng và các ca từ chối giả trong thư mục test; SQL contract và diff-check. Anh Tú đọc runbook rồi làm một diễn tập tắt/bật đúng capability trên quán test, xác nhận booking/bill cũ còn thao tác. Ghi số request/ca thực đo từ Task 1, không ước giá dịch vụ chưa đo. Sau `Task 4 PASS` commit `docs: huong dan van hanh va phat hanh bao luong` (kèm fix nếu có).

## Task 5 — Diễn tập Testing và nghiệm thu QR Publish

**Files:** cập nhật `docs/testing/bao-luong/SPRINT-BL-4.md`, tạo `docs/testing/bao-luong/BL-4-RELEASE-EVIDENCE.md`; chỉ sửa code kèm regression khi kịch bản phát hiện lỗi. Không tự đánh PASS từ kiểm tra local.

**Đầu vào:** các task 1–4 PASS, migration manifest, Edge/admin build, relay evidence hoặc blocker, version/commit Mini App xác minh được. **Đầu ra:** bảng evidence 5A Testing PASS, 5B Publish PASS hoặc WAITING_PUBLISH, không nhập nhằng.

- [ ] **5.1 Chuẩn bị release evidence.** Ghi commit, dirty=false, App ID quán, version Testing, admin deployment, migration list/hash, browser/điện thoại, giờ `Asia/Ho_Chi_Minh`, URL QR đã bỏ token. Fixture có tên TEST BL4 để không nhầm khách thật; booking/bill test được owner kết thúc có audit, không xóa trực tiếp lịch sử.
- [ ] **5.2 Test 5A trên Testing.** Mở đúng env/version trên hai máy khách + POS + Admin Mobile. Root ngoài giờ -> đặt bàn -> owner xác nhận/chọn hai bàn -> chọn một batch preorder -> POS duyệt/in 2 liên -> khóa QR trước giờ 60 phút -> nhận khách -> hai QR cùng mâm gọi thêm -> confirm một order/reject một order -> đóng bill đúng tổng. Thêm nhánh Gọi sau tại quán; no-show/hủy trước và sau release, kiểm waste audit. Đổi giờ/yêu cầu đổi; khách quá ba giờ không bị giục/kết thúc tự động, session 6h hết hạn vẫn xử lý công nợ theo UI hiện có. Khách pending quá giờ do owner đóng tay.
- [ ] **5.3 Test lỗi/multi-device.** Bấm gửi lặp/mất response không thêm booking/batch/session; capability token sai/thu hồi không đọc/sửa; đổi thiết bị/storage mất hướng dẫn liên hệ quán. Realtime không có event nhưng visible vẫn hội tụ; hidden >5 phút/minimized và trở lại ghi số đo riêng. Ngắt relay test/tắt channel không mất booking; quay lại POS thấy đủ, không tự đánh xác nhận. Máy in báo lỗi không âm thầm in trùng. Pubu root pickup/delivery, prepay/customer/staff policy và Kitchen không thay đổi.
- [ ] **5.4 Dừng tại cổng 5A.** Anh Tú xác nhận `BL-4 Testing PASS`; commit evidence sau PASS. Nếu chờ duyệt thì ghi WAITING_PUBLISH; không dùng tester để giả khách production. Không tự chuyển phiên bản công khai chỉ do automated test xanh.
- [ ] **5.5 Test 5B sau Publish.** Kiểm Console/version thực sự công khai; tài khoản không tester quét QR bàn in thực tế không env/version. Root mở đặt bàn, owner xử lý, khách chọn món trước, nhận khách và QR gọi thêm; POS thấy đúng table/session/batch, bill/2 liên đúng. Bản Pubu công khai kiểm hồi quy luồng liên quan. Nếu QR mở bản cũ, chưa đạt dù Testing PASS; xác minh build/Publish trước sửa nghiệp vụ.
- [ ] **5.6 Chốt Sprint.** Ghi đủ evidence/blocker đã giải quyết, đọc lại file test và runbook, cập nhật TESTING link/status. Sau anh Tú `BL-4 PASS` commit `chore: nghiem thu bl4 pilot` và báo SHA; không tự tuyên bố deploy/merge/push đã xong nếu chưa thực hiện.

## Kiểm tra plan của Codex

- Phủ design 4A -> Task 2; 4B -> Task 1; 4C -> Task 3; 4D -> Task 4–5; cả hai model -> Task 2/4/5.
- Các tham số thời gian, budget, retry limits giữ đúng spec đã duyệt; setting/evidence được kiểm ở server.
- Review Focus đều có test tại task sở hữu. Không coi mock relay, regex SQL, PGlite hoặc Testing là bằng chứng thay thế hệ thống thật.
- Các bước trên là công việc dự kiến, không phải kết quả PASS. Automated results điền vào Sprint file sau khi thực sự chạy.

**Checkpoint duyệt plan:** [PLAN-BL-4-2026-09-27.md](../../testing/bao-luong/PLAN-BL-4-2026-09-27.md). Sau `PLAN BL-4 PASS`, triển khai Task 1 theo cách làm hiện tại; không cần chọn lại phương thức thực hiện.
