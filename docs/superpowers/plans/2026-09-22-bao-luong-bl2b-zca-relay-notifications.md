# Bảo Lương BL-2B — Zalo Group Relay Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gửi cảnh báo booking mới của Bảo Lương vào nhóm Zalo vận hành qua relay `zca-js` đã có,
với outbox bền vững, HMAC raw-body, idempotency và không làm booking phụ thuộc kênh gửi tin.

**Architecture:** Giữ `reservation_events` và `reservation_notification_deliveries` làm nguồn audit.
Migration 063 thêm channel theo store và delivery snapshot cho `zca_group`; Edge Function mới claim
delivery rồi POST sang relay. Relay chỉ nhận text tóm tắt, không có quyền Supabase. Cockpit MEVO
cấu hình/tắt/test channel; POS/Admin Mobile và gọi điện là fallback khi relay lỗi.

**Tech Stack:** PostgreSQL/Supabase RLS + Database Webhooks, Supabase Edge Functions (Deno/Web
Crypto), Next.js Server Actions/React, TypeScript/Vitest, Node test + PGlite.

**Spec:** `docs/superpowers/specs/2026-09-22-bao-luong-bl2b-zca-relay-design.md`

## Global Constraints

- Relay endpoint là `POST https://zalo.soccernow.net/mevo/relay`, nhưng URL phải lấy từ Edge secret
  `MEVO_ZCA_RELAY_URL`; secret ký là `MEVO_HMAC_SECRET`.
- Serialize JSON đúng một lần thành UTF-8 bytes; ký `timestamp + '.' + rawBody` bằng HMAC-SHA256,
  sau đó gửi đúng bytes đã ký, không `Content-Encoding`.
- `X-Mevo-Timestamp` là Unix giây nguyên; timeout caller tối thiểu 20 giây.
- `notification_id` chính là delivery UUID; retry luôn dùng lại UUID đó nhưng tạo timestamp/chữ ký mới.
- Không log/công khai text, HMAC secret, signature, group ID đầy đủ, cookie hay session bot.
- Text chỉ có tên khách, số người, giờ đến và URL `/admin/reservations`; không có SĐT/ghi chú/token.
- `PROVIDER_REJECTED` là kết quả mơ hồ: không tạo delivery mới hoặc retry tự động vô hạn.
- Không xây hoặc sửa server relay/zca-js; công việc này chỉ là caller MEVO.
- Không gọi relay thật trước khi phía relay add allowlist cặp store Bảo Lương với group ID.
- Chỉ `mevo_superadmin` cấu hình, gửi thử, retry hoặc tắt channel. Store `provider = none` không
  tạo network call; Pubu không đổi hành vi.
- Sau mỗi task, cập nhật `docs/testing/bao-luong/SPRINT-BL-2B-ZCA.md`, dừng và chờ anh Tú PASS.

## External Readiness Gate

Trước Task 3 live, MEVO phải gửi cho phía relay canonical store UUID
`2139c162-9677-4cbd-87e3-d2e1ac22e6e8` và group ID đã cấu hình. Phía relay phải thêm allowlist:

```text
2139c162-9677-4cbd-87e3-d2e1ac22e6e8:<group_id>
```

Anh Tú nhập `MEVO_HMAC_SECRET` vào Supabase Edge secrets, không vào chat, source, Vercel hay DB.
Không nhập group ID `3531071701486961908` nếu đó không còn là nhóm vận hành cuối cùng.

## File Map

| File | Responsibility |
| --- | --- |
| `supabase/migrations/063_reservation_zca_group_notifications.sql` | Channel theo store, snapshot delivery, enqueue/claim/finish RPC relay |
| `supabase/tests/063_reservation_zca_group_notifications.test.mjs` | RLS, tenant, event/idempotency, claim/finish SQL contracts |
| `supabase/functions/_shared/zca-relay.ts` | Serialize, HMAC raw-body, gọi relay, parse `RelayResult` |
| `supabase/functions/_shared/zca-relay.test.ts` | Raw-body/signature/response/timeout contract |
| `supabase/functions/reservation-zca-notify/handler.ts` | Claim, dựng text tối thiểu, map kết quả relay, finish delivery |
| `supabase/functions/reservation-zca-notify/handler.test.ts` | No-op, success, retryable, ambiguous, không lộ PII |
| `supabase/functions/reservation-zca-notify/index.ts` | HTTP entrypoint, dependency/env validation, service role client |
| `admin-web/lib/actions/reservation-group-notifications.ts` | Superadmin read/config/test/retry/tắt channel |
| `admin-web/app/mevo/stores/[storeId]/reservation-group-notifications.tsx` | Cockpit nhóm Zalo relay |
| `admin-web/app/mevo/stores/[storeId]/page.tsx` | Nạp và render panel relay thay panel OA notification cũ |
| `docs/testing/bao-luong/SPRINT-BL-2B-ZCA.md` | Checklist từng task và nghiệm thu relay thật |

## Task 1: Schema channel và outbox relay

**Files:**
- Create: `supabase/migrations/063_reservation_zca_group_notifications.sql`
- Create: `supabase/tests/063_reservation_zca_group_notifications.test.mjs`
- Create: `docs/testing/bao-luong/SPRINT-BL-2B-ZCA.md`

**Interfaces:**

```sql
create table public.store_reservation_notification_channels (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null unique references public.stores(id) on delete cascade,
  provider text not null check (provider in ('none', 'zca_group', 'zalo_oa')),
  is_enabled boolean not null default false,
  destination_group_id text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check ((provider = 'zca_group') = (destination_group_id is not null and length(btrim(destination_group_id)) > 0))
);
```

Migration thêm `delivery_provider` và `destination_group_id` snapshot vào
`reservation_notification_deliveries`; backfill delivery cũ là `zalo_oa`, drop constraint bắt buộc
`recipient_id` cho mọi queued delivery và thay bằng constraint theo provider. Không xóa row OA,
challenge hay secret cũ.

`enqueue_reservation_owner_notification(p_event_id)` chỉ enqueue `zca_group` khi channel store
`is_enabled = true`; snapshot group ID và đặt `queued`. `provider = none` hoặc channel disabled
không enqueue/call relay. Thêm RPC service-role-only:

```sql
claim_reservation_zca_notification(p_delivery_id uuid, p_dispatch_token uuid) returns jsonb
finish_reservation_zca_notification(
  p_delivery_id uuid, p_dispatch_token uuid, p_status text,
  p_provider_code text, p_provider_detail text
) returns boolean
```

Claim chỉ transition `queued -> processing` cho `delivery_provider = 'zca_group'`; trả delivery
UUID, store UUID, group ID, kind và reservation fields cần dựng text. Không trả OA token/UID hoặc
customer phone/note. Finish chỉ nhận `sent`, `failed`, `action_required` từ `processing` với đúng
dispatch token.

- [ ] **Step 1: Viết test PGlite đỏ**

```js
test('zca channel enabled tạo đúng một delivery snapshot, không cần OA recipient', async () => {
  await sql`insert into store_reservation_notification_channels (...) values (${storeId}, 'zca_group', true, ${groupId}, ${operatorId})`
  const eventId = await createCustomerReservationEvent(storeId)
  const rows = await sql`select delivery_provider, destination_group_id, status from reservation_notification_deliveries where reservation_event_id = ${eventId}`
  assert.deepStrictEqual(rows, [{ delivery_provider: 'zca_group', destination_group_id: groupId, status: 'queued' }])
})
```

Bao phủ: disabled/`none` không enqueue; event lặp vẫn một delivery; group quán A không dùng cho
quán B; anon/authenticated không SELECT/INSERT/UPDATE channel hoặc delivery; claim sai token/lặp
trả null; finish sai token không đổi trạng thái; `zalo_oa` row cũ giữ nguyên.

- [ ] **Step 2: Chạy test để xác nhận RED**

Run:

```powershell
$modulePath=(Resolve-Path 'admin-web/node_modules/@electric-sql/pglite/dist/index.js').Path
$env:PGLITE_MODULE=([System.Uri]::new($modulePath)).AbsoluteUri
node --test supabase/tests/063_reservation_zca_group_notifications.test.mjs
```

Expected: FAIL vì migration/RPC/channel chưa tồn tại.

- [ ] **Step 3: Viết migration tối thiểu**

Tạo channel table, RLS/revoke fail-closed, index `store_id`, snapshot fields/constraints/index cho
delivery, cập nhật enqueue trigger và hai RPC. Gọi `NOTIFY pgrst, 'reload schema'`. Chỉ grant claim/
finish cho `service_role`.

- [ ] **Step 4: Chạy contract và hồi quy reservation**

```powershell
node --test supabase/tests/052_reservation_foundation.test.mjs supabase/tests/054_reservation_operator_flow.test.mjs supabase/tests/057_reservation_operations_queue.test.mjs supabase/tests/059_reservation_owner_oa_notifications.test.mjs supabase/tests/063_reservation_zca_group_notifications.test.mjs
```

Expected: tất cả PASS; test 059 chỉ cập nhật assertion cần thiết cho delivery OA lịch sử, không gọi
relay/network.

- [ ] **Step 5: Cập nhật checklist và commit**

Ghi Test 1A SQL tự động, Test 1B migration production và matrix channel vào
`SPRINT-BL-2B-ZCA.md`.

```powershell
git add supabase/migrations/063_reservation_zca_group_notifications.sql supabase/tests/063_reservation_zca_group_notifications.test.mjs docs/testing/bao-luong/SPRINT-BL-2B-ZCA.md
git commit -m "feat: tao outbox relay Zalo theo quan"
```

**Dừng:** Anh Tú chạy `SPRINT-BL-2B-ZCA.md — Test 1` và trả `Task 1 PASS`.

## Task 2: Sender HMAC raw-body và handler Edge Function

**Files:**
- Create: `supabase/functions/_shared/zca-relay.ts`
- Create: `supabase/functions/_shared/zca-relay.test.ts`
- Create: `supabase/functions/reservation-zca-notify/handler.ts`
- Create: `supabase/functions/reservation-zca-notify/handler.test.ts`
- Create: `supabase/functions/reservation-zca-notify/index.ts`

**Interfaces:**

```ts
type RelayResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; code: 'INVALID_REQUEST' | 'GROUP_NOT_FOUND' | 'BOT_OFFLINE' | 'RATE_LIMITED' | 'PROVIDER_REJECTED'; message: string; retryable: boolean }

sendZcaGroupMessage(input: {
  notificationId: string; storeId: string; groupId: string; text: string
}, deps: { relayUrl: string; hmacSecret: string; now?: () => number; fetchImpl?: typeof fetch }): Promise<RelayResult>
```

Sender dùng `TextEncoder().encode(JSON.stringify(payload))` một lần, import Web Crypto HMAC key,
ký bytes `timestamp + '.' + bodyBytes`, gửi bytes ấy với timeout 20_000ms. Parse JSON body dù HTTP
200; HTTP không JSON/network/timeout map lỗi retryable phù hợp mà không log body/text/signature.

Handler dùng RPC Task 1, dựng message không có phone/note, gọi sender và map:

```text
ok true                         -> sent
BOT_OFFLINE/RATE_LIMITED/timeout -> failed
PROVIDER_REJECTED               -> action_required (mơ hồ; không auto retry)
INVALID_REQUEST/GROUP_NOT_FOUND -> action_required
```

`notification_id` luôn `delivery_id`. `owner_test` chỉ gửi “MEVO gửi thử thành công” và URL admin,
không cần dữ liệu reservation.

- [ ] **Step 1: Viết tests đỏ cho sender**

```ts
it('ký và gửi chính bytes body', async () => {
  const fetchImpl = vi.fn(async (_url, init) => {
    expect(init?.body).toBeInstanceOf(Uint8Array)
    expect(init?.headers).toMatchObject({ 'x-mevo-timestamp': '1700000000' })
    return Response.json({ ok: true, providerMessageId: 'm1' })
  })
  await expect(sendZcaGroupMessage(payload, { relayUrl, hmacSecret: 'secret', now: () => 1700000000000, fetchImpl })).resolves.toEqual({ ok: true, providerMessageId: 'm1' })
})
```

So sánh signature với vector HMAC cố định trên bytes thật. Bao phủ HTTP 200 + `ok:false`, JSON lỗi,
timeout/network, `BOT_OFFLINE`, `RATE_LIMITED`, `GROUP_NOT_FOUND`, `INVALID_REQUEST`,
`PROVIDER_REJECTED`; không test bằng secret thật.

- [ ] **Step 2: Chạy tests đỏ**

```powershell
cd supabase/functions
npx vitest run _shared/zca-relay.test.ts reservation-zca-notify/handler.test.ts
```

Expected: FAIL vì sender/handler chưa tồn tại.

- [ ] **Step 3: Implement sender và handler tối thiểu**

Không import hoặc sửa `zalo-oa.ts`; code OA cũ giữ phục vụ audit lịch sử. Handler mockable qua `Db`
và `send`, không gọi mạng trong test.

- [ ] **Step 4: Viết HTTP entrypoint**

`index.ts` reject thiếu `delivery_id`/`dispatch_token` bằng 400. Trước claim, kiểm đủ
`ADMIN_PUBLIC_ORIGIN`, `MEVO_ZCA_RELAY_URL`, `MEVO_HMAC_SECRET`; thiếu config trả 503 không đổi
delivery. Chỉ log delivery ID/store ID/mã lỗi rút gọn.

- [ ] **Step 5: Chạy tests và commit**

```powershell
cd D:\Code\mevo\supabase\functions
npx vitest run _shared/zca-relay.test.ts reservation-zca-notify/handler.test.ts
```

Expected: PASS; test chứng minh customer phone/note không có trong `text`.

```powershell
git add supabase/functions/_shared/zca-relay.ts supabase/functions/_shared/zca-relay.test.ts supabase/functions/reservation-zca-notify
git commit -m "feat: gui canh bao booking qua relay Zalo"
```

**Dừng:** Anh Tú chạy `SPRINT-BL-2B-ZCA.md — Test 2` và trả `Task 2 PASS`.

## Task 3: Cockpit MEVO và cấu hình production không gửi sớm

**Files:**
- Create: `admin-web/lib/actions/reservation-group-notifications.ts`
- Create: `admin-web/lib/actions/reservation-group-notifications.test.ts`
- Create: `admin-web/app/mevo/stores/[storeId]/reservation-group-notifications.tsx`
- Create: `admin-web/app/mevo/stores/[storeId]/reservation-group-notifications.test.tsx`
- Modify: `admin-web/app/mevo/stores/[storeId]/page.tsx`
- Modify: `docs/testing/bao-luong/SPRINT-BL-2B-ZCA.md`

**Interfaces:**

```ts
type GroupNotificationState = {
  provider: 'none' | 'zca_group' | 'zalo_oa'
  enabled: boolean
  hasDestination: boolean
  lastDeliveryStatus: 'sent' | 'failed' | 'action_required' | null
  lastDeliveryAt: string | null
  lastProviderCode: string | null
}

saveGroupNotificationChannel(storeId: string, input: { enabled: boolean; groupId: string }): Promise<void>
sendGroupNotificationTest(storeId: string): Promise<{ ok: boolean; status: string; message: string | null }>
disableGroupNotificationChannel(storeId: string): Promise<void>
```

Server actions yêu cầu `requireSuperadmin`, validate group ID nonblank/string và chỉ trả
`hasDestination`, không trả group ID. Save khi `enabled=true` chỉ lưu cấu hình `zca_group`; **không
gọi relay**. Test tạo `owner_test` delivery snapshot rồi invoke `reservation-zca-notify`, display
status/error an toàn. Disable đặt `provider='none', is_enabled=false`; queued delivery đã snapshot
không được dispatch tự động sau disable.

- [ ] **Step 1: Viết action/UI tests đỏ**

```ts
it('staff không thể lưu, gửi thử hoặc tắt channel', async () => {
  mockedRequireSuperadmin.mockRejectedValue(new Error('Cần quyền MEVO superadmin'))
  await expect(saveGroupNotificationChannel(storeId, { enabled: true, groupId })).rejects.toThrow('superadmin')
})
```

Bao phủ: không lộ group ID, save không fetch relay, test call function với delivery/dispatch token,
provider result lỗi hiện tiếng Việt không phải generic Server Component error, owner/store khác bị
chặn, panel chỉ thay OA notification panel chứ không xóa form credential OA khác.

- [ ] **Step 2: Chạy tests đỏ**

```powershell
cd D:\Code\mevo\admin-web
npm test -- --run lib/actions/reservation-group-notifications.test.ts app/mevo/stores/[storeId]/reservation-group-notifications.test.tsx
```

Expected: FAIL vì action/component chưa tồn tại.

- [ ] **Step 3: Implement action/component và thay panel**

Panel hiển thị “Cảnh báo nhóm Zalo nội bộ (best-effort)”, trạng thái channel, health delivery gần
nhất, nút Lưu/Tắt/Gửi tin thử. Hướng dẫn không hiển thị OA onboarding/challenge. `page.tsx` chỉ
nạp state mới cho superadmin; các thông tin Mini App/OA/ZaloPay còn lại không đổi.

- [ ] **Step 4: Chạy hồi quy Admin Web**

```powershell
cd D:\Code\mevo\admin-web
npm test -- --run
npx tsc --noEmit
npm run build
```

Expected: PASS. Chạy `git diff --check` trước commit.

- [ ] **Step 5: Cập nhật checklist và commit**

Ghi Test 3A role/UI/config không gửi sớm và Test 3B test sender mock vào sprint test file.

```powershell
git add admin-web/lib/actions/reservation-group-notifications.ts admin-web/lib/actions/reservation-group-notifications.test.ts admin-web/app/mevo/stores/[storeId]/reservation-group-notifications.tsx admin-web/app/mevo/stores/[storeId]/reservation-group-notifications.test.tsx admin-web/app/mevo/stores/[storeId]/page.tsx docs/testing/bao-luong/SPRINT-BL-2B-ZCA.md
git commit -m "feat: cau hinh canh bao nhom Zalo"
```

**Dừng:** Anh Tú chạy `SPRINT-BL-2B-ZCA.md — Test 3` và trả `Task 3 PASS`.

## Task 4: Deploy, allowlist và nghiệm thu relay thật

**Files:**
- Modify: `docs/testing/bao-luong/SPRINT-BL-2B-ZCA.md`
- Modify: `TESTING.md`

- [ ] **Step 1: Áp migration và deploy function, chưa enable channel**

```powershell
npx supabase db push
npx supabase functions deploy reservation-zca-notify --no-verify-jwt
npx supabase secrets set MEVO_ZCA_RELAY_URL=https://zalo.soccernow.net/mevo/relay
```

Anh Tú nhập `MEVO_HMAC_SECRET` bằng terminal/secret store của mình; không paste secret vào chat.
Deploy Admin Web sau Task 3. Database Webhook chỉ watch INSERT `reservation_notification_deliveries`
với delivery `queued` và `delivery_provider='zca_group'`; payload đúng `{ delivery_id, dispatch_token }`.

- [ ] **Step 2: Allowlist rồi enable channel**

Gửi đối tác relay đúng cặp:

```text
2139c162-9677-4cbd-87e3-d2e1ac22e6e8:<group_id đã lưu ở cockpit>
```

Chỉ khi đối tác xác nhận allowlist, superadmin lưu và bật channel trong cockpit. Không gửi real
booking trước bước này.

- [ ] **Step 3: Gửi tin thử thật**

Superadmin bấm **Gửi tin thử**. Kỳ vọng một tin `MEVO gửi thử thành công` vào đúng nhóm, cockpit
ghi `sent` và provider message ID; không có phone/note. Nếu `GROUP_NOT_FOUND`/`INVALID_REQUEST`,
tắt channel và sửa config/allowlist. Nếu `BOT_OFFLINE`, phục hồi bot rồi retry cùng delivery.

- [ ] **Step 4: Booking E2E và failure matrix**

Tạo một booking khách thật: đúng một event, delivery và tin nhóm. Reload/retry không sinh tin thứ
hai. Tắt channel/bot offline: booking vẫn `pending`, vẫn có POS/Admin card và được xử lý/từ chối
bình thường. Mô phỏng `PROVIDER_REJECTED`: cockpit hiển thị cần kiểm tra thủ công, không auto resend.

- [ ] **Step 5: Chốt test file và commit**

Ghi endpoint deploy, migration, allowlist xác nhận (không ghi secret/group ID đầy đủ), Test 4A–4D
và trạng thái PASS/FAIL thực tế.

```powershell
git add docs/testing/bao-luong/SPRINT-BL-2B-ZCA.md TESTING.md
git commit -m "test: nghiem thu relay Zalo BL-2B"
```

**Dừng:** Anh Tú chạy `SPRINT-BL-2B-ZCA.md — Test 4` và trả `BL-2B ZCA PASS`. Không tự chuyển
BL-2C hoặc BL-3.

## Self-review

- Contract relay: Task 2 ký raw bytes, timestamp giây, timeout, HTTP 200 body, code matrix và
  `PROVIDER_REJECTED` mơ hồ.
- Data/security: Task 1 snapshot group/provider, RLS/tenant; Task 2 không gửi phone/note; Task 3
  không lộ group/secret và chỉ superadmin thao tác.
- Operations: Task 4 allowlist trước enable, bot offline/failure fallback POS + gọi điện và không
  double-send.
- Scope: Không sửa relay/zca-js, không gửi khách hàng, không đổi Pubu/OA credential cũ.
