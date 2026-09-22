# Bảo Lương BL-2B — Zalo OA Owner Notifications Implementation Plan

> **Đã thay thế ngày 2026-09-22. Không triển khai tiếp Task 3–4 của plan này cho Bảo Lương.**
> OA Open API không phù hợp chi phí pilot. Thiết kế thay thế dùng relay `zca-js` tới nhóm Zalo
> vận hành nằm tại `docs/superpowers/specs/2026-09-22-bao-luong-bl2b-zca-relay-design.md`.
> Các migration/task 1–2 đã có vẫn giữ làm lịch sử/audit, nhưng không còn là điều kiện gửi cảnh báo.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kết nối đúng Zalo OA-scoped user ID của chủ quán Bảo Lương và gửi thông báo có đặt bàn
mới qua OA, có audit/idempotency và không bao giờ báo thành công giả khi Zalo từ chối.

**Architecture:** `reservation_events` vẫn là nguồn sự thật. Event `created` do khách tạo sẽ sinh
một outbox delivery duy nhất; Supabase Database Webhook chỉ chuyển `delivery_id + dispatch_token`
sang Edge Function. Edge Function dùng service role để claim delivery, đọc credential/recipient
đúng store, gọi Zalo OA và ghi kết quả. Chủ quán được liên kết bằng mã thử thách gửi vào đúng OA;
webhook có chữ ký hợp lệ mới lưu OA-scoped user ID.

**Tech Stack:** PostgreSQL/Supabase RLS + Database Webhooks, Supabase Edge Functions (Deno),
Next.js 16 Server Actions/API Route, TypeScript/Vitest, Node test + PGlite.

**Spec:** `docs/superpowers/specs/2026-09-10-bao-luong-reservation-pos-workflow-design.md`

## Global Constraints

- BL-2B chỉ làm **OA cho chủ quán + thông báo booking khách mới**. Tin xác nhận cho khách, CTA
  chọn món trước và nhắc khách 60 phút thuộc BL-3/BL-4, khi luồng khách và credential/template
  tương ứng tồn tại.
- Supabase là nguồn sự thật; gửi OA thất bại không rollback hoặc đổi trạng thái reservation.
- Không hardcode slug, store ID, OA ID, Mini App ID, domain, access token hay secret.
- OA user ID là định danh theo đúng OA; không dùng `reservations.zalo_user_id`, số điện thoại hoặc
  Zalo user ID từ Mini App làm người nhận thông báo của chủ quán.
- Credential và OA user ID không được trả cho anon/authenticated hoặc log nguyên văn.
- Chỉ `mevo_superadmin` cấu hình credential, tạo mã liên kết, gửi thử và retry delivery.
- Một event chỉ tạo một delivery logic; retry dùng cùng delivery và không tạo hàng loạt tin.
- Zalo chỉ được coi là thành công khi HTTP thành công **và** body provider có `error = 0`.
- Existing `/api/zalo-webhook/[storeId]` xử lý thu hồi consent Mini App phải giữ nguyên; webhook
  OA dùng route riêng để không trộn hai hợp đồng/chữ ký.
- Mỗi task hoàn thành phải cập nhật `docs/testing/bao-luong/SPRINT-BL-2B.md`, dừng và chờ PASS.

## External Readiness Gate

Remote ngày 21/09/2026 đã có:

- Store `bia-lau-bao-luong` và OA ID `1032571232737103554`.
- Mini App ID `671794256689452743`.

Remote chưa có row OA bật, access token hoặc app secret. Không dán secret vào chat, commit, log
hay file `.env`. Sau Task 3, nhập chúng tại `/mevo/stores/<store-id>`, cấu hình OA webhook bằng
URL mà UI hiển thị, rồi gửi tin thử thật. Nếu Zalo Console chưa cấp token/secret thì chỉ Task 1
được nghiệm thu; Task 2 phải chờ webhook ký thật và Task 3 phải chờ tin gửi thử thật.

## File Map

| File | Trách nhiệm |
|---|---|
| `supabase/migrations/059_reservation_owner_oa_notifications.sql` | Recipient, challenge, outbox, trigger, claim/finish RPC nội bộ |
| `supabase/tests/059_reservation_owner_oa_notifications.test.mjs` | Tenant/RLS/idempotency/event matrix |
| `admin-web/lib/zalo/oa-contract.ts` | Parse event OA và chuẩn hóa kết quả API, logic thuần |
| `admin-web/lib/zalo/oa-contract.test.ts` | Fixture signature/event/provider success/failure |
| `admin-web/app/api/zalo-oa-webhook/[storeId]/route.ts` | Nhận sự kiện OA đã ký và claim mã liên kết |
| `admin-web/app/api/zalo-oa-webhook/[storeId]/route.test.ts` | Bad signature, wrong OA/store, expired/mismatch code |
| `admin-web/lib/actions/zalo-owner-notifications.ts` | Server actions superadmin: trạng thái, challenge, test, retry |
| `admin-web/lib/actions/zalo-owner-notifications.test.ts` | Role guard, không lộ secret/UID, gọi đúng store |
| `admin-web/app/mevo/stores/[storeId]/zalo-owner-notifications.tsx` | Cockpit onboarding và delivery health |
| `admin-web/app/mevo/stores/[storeId]/page.tsx` | Gắn panel BL-2B vào chi tiết quán |
| `supabase/functions/_shared/zalo-oa.ts` | Gửi OA và phân loại lỗi provider dùng chung trong Edge runtime |
| `supabase/functions/_shared/zalo-oa.test.ts` | HTTP 2xx/error=0, HTTP lỗi, provider error, JSON lỗi |
| `supabase/functions/reservation-owner-notify/index.ts` | Claim outbox, dựng tin, gửi và finish delivery |
| `supabase/functions/reservation-owner-notify/handler.ts` | Handler inject dependency để test không gọi mạng thật |
| `supabase/functions/reservation-owner-notify/handler.test.ts` | Missing/bad token, idempotency, sent/failed/action_required |
| `docs/testing/bao-luong/SPRINT-BL-2B.md` | Checklist riêng từng task và live OA acceptance |

---

### Task 1: Notification outbox và tenant security

**Files:**
- Create: `supabase/migrations/059_reservation_owner_oa_notifications.sql`
- Create: `supabase/tests/059_reservation_owner_oa_notifications.test.mjs`
- Create: `docs/testing/bao-luong/SPRINT-BL-2B.md`
- Modify: `TESTING.md`

**Interfaces:**
- Consumes: `reservations`, `reservation_events`, `stores`, `mevo_operators`.
- Produces: `store_zalo_notification_recipients`, `zalo_oa_onboarding_challenges`,
  `reservation_notification_deliveries`; internal functions
  `claim_reservation_owner_notification(uuid, uuid)` and
  `finish_reservation_owner_notification(uuid, uuid, text, text, text)`.

- [ ] **Step 1: Viết test đỏ cho schema và event matrix**

Test phải chứng minh:

```js
// customer-created -> đúng 1 delivery; manual_created -> 0
// gọi append/event lặp không tạo delivery thứ hai
// delivery giữ store_id/reservation_id/event_id đúng tenant
// anon/authenticated không SELECT/INSERT/UPDATE recipient, challenge hoặc delivery
// recipient quán A không bao giờ được dùng cho delivery quán B
// claim sai dispatch_token hoặc claim lần hai không trả payload
// finish chỉ chuyển processing -> sent|failed|action_required
```

- [ ] **Step 2: Chạy test và xác nhận RED**

```powershell
$modulePath=(Resolve-Path 'admin-web/node_modules/@electric-sql/pglite/dist/index.js').Path
$env:PGLITE_MODULE=([System.Uri]::new($modulePath)).AbsoluteUri
node --test supabase/tests/059_reservation_owner_oa_notifications.test.mjs
```

Expected: FAIL vì migration/bảng chưa tồn tại.

- [ ] **Step 3: Tạo schema tối thiểu**

Các invariant bắt buộc:

```sql
-- Một recipient active cho mục đích thông báo đặt bàn ở mỗi quán.
purpose text NOT NULL CHECK (purpose = 'reservation_owner_alert')
status text NOT NULL CHECK (status IN ('pending', 'verified', 'disabled'))
UNIQUE (store_id, purpose)

-- Challenge chỉ lưu hash, hết hạn sau 15 phút, claim một lần.
code_hash text NOT NULL CHECK (code_hash ~ '^[0-9a-f]{64}$')
expires_at timestamptz NOT NULL
claimed_at timestamptz

-- Outbox không chứa access token/secret; dispatch_token là UUID ngẫu nhiên, bảng không public.
kind text NOT NULL CHECK (kind IN ('owner_new_reservation', 'owner_test'))
status text NOT NULL CHECK (status IN ('queued','processing','sent','failed','action_required'))
idempotency_key text NOT NULL UNIQUE
```

Trigger chỉ enqueue khi `NEW.actor_kind = 'customer' AND NEW.event_type = 'created'`. Nếu chưa có
recipient verified hoặc OA config chưa đủ, vẫn tạo delivery `action_required` để cockpit nhìn thấy;
không gọi provider và không ảnh hưởng booking.

- [ ] **Step 4: Chạy test Task 1 và regression BL-1/BL-2A**

Run migration 052–059 trong PGlite; expected toàn bộ PASS. Kiểm `git diff --check`.

- [ ] **Step 5: Cập nhật Test 1 và commit**

`SPRINT-BL-2B.md` phải có Test 1A schema/RLS, Test 1B event matrix và Test 1C remote migration.

```powershell
git commit -m "feat: tao outbox thong bao dat ban OA"
```

**Dừng:** Anh Tú chạy Test 1A–1C và trả `Task 1 PASS`.

---

### Task 2: Onboarding đúng OA-scoped owner user ID

**Files:**
- Create: `admin-web/lib/zalo/oa-contract.ts`
- Create: `admin-web/lib/zalo/oa-contract.test.ts`
- Create: `admin-web/app/api/zalo-oa-webhook/[storeId]/route.ts`
- Create: `admin-web/app/api/zalo-oa-webhook/[storeId]/route.test.ts`
- Create: `admin-web/lib/actions/zalo-owner-notifications.ts`
- Create: `admin-web/lib/actions/zalo-owner-notifications.test.ts`
- Create: `admin-web/app/mevo/stores/[storeId]/zalo-owner-notifications.tsx`
- Modify: `admin-web/app/mevo/stores/[storeId]/page.tsx`
- Modify: `admin-web/lib/actions/mevo-stores.ts`
- Test: existing `admin-web/lib/actions/mevo-stores.test.ts`

**Interfaces:**
- Produces `createOwnerOaChallenge(storeId)`, `getOwnerOaNotificationState(storeId)`,
  `disableOwnerOaRecipient(storeId)`.
- Webhook consumes signed OA event and calls an internal service-role claim function; it never
  accepts an OA user ID from browser/server-action input.

- [ ] **Step 1: Viết test đỏ cho challenge và webhook**

Test contract:

```ts
type NormalizedOaMessage = {
  appId: string
  oaId: string
  senderOaUserId: string
  messageId: string
  text: string
  timestamp: number
}
```

Cases bắt buộc: chữ ký thiếu/sai; `app_id` không khớp Mini App của store; `recipient.id` không
khớp `stores.zalo_oa_id`; event không phải text; code sai/hết hạn/đã claim; cùng code qua store
khác; event lặp cùng `message_id`; event hợp lệ tạo recipient verified đúng một lần.

- [ ] **Step 2: Xác nhận test RED**

```powershell
cd admin-web
npm test -- --run lib/zalo/oa-contract.test.ts app/api/zalo-oa-webhook/[storeId]/route.test.ts lib/actions/zalo-owner-notifications.test.ts
```

- [ ] **Step 3: Implement parser/verifier fail-closed**

`oa-contract.ts` nhận raw body + header và chuẩn hóa đúng payload OA. Chữ ký phải được kiểm bằng
fixture đã lấy từ công cụ test webhook/Zalo Console của chính OA; so sánh constant-time. Không
tái sử dụng thuật toán “sort toàn bộ field” của Mini App revoke route nếu fixture OA không khớp.
Fixture commit phải thay toàn bộ ID/text/signature bằng giá trị test và không chứa token/secret.

- [ ] **Step 4: Implement challenge và cockpit**

`createOwnerOaChallenge` sinh tối thiểu 96 bit ngẫu nhiên, lưu SHA-256, trả chuỗi dạng
`MEVO <code>` đúng một lần và hết hạn 15 phút. Panel hiển thị:

- Credential: OA ID / token / app secret dưới dạng `Đã có` hoặc `Còn thiếu`, không trả giá trị.
- OA webhook URL riêng có nút copy.
- `Tạo mã kết nối`; hướng dẫn chủ quán follow OA rồi tự gửi đúng nội dung.
- Trạng thái recipient `Chưa kết nối / Đã xác minh / Đã tắt` và thời gian gửi thử gần nhất.

`updateZaloConfig` lần đầu phải từ chối bật nếu thiếu token hoặc app secret; để trống khi update
không xóa credential cũ. Không log FormData hoặc secret.

- [ ] **Step 5: Chạy test + lint/build, cập nhật Test 2 và commit**

```powershell
cd admin-web
npm test
npx tsc --noEmit
npx eslint lib/zalo app/api/zalo-oa-webhook lib/actions/zalo-owner-notifications.ts app/mevo/stores/[storeId]/zalo-owner-notifications.tsx
npm run build
```

```powershell
git commit -m "feat: onboarding nguoi nhan Zalo OA chu quan"
```

**Dừng:** Anh Tú test mobile/cross-store/bad-code theo `SPRINT-BL-2B.md — Test 2A–2D` và trả
`Task 2 PASS`.

---

### Task 3: Sender thật, gửi thử và xử lý kết quả không giả

**Files:**
- Create: `supabase/functions/_shared/zalo-oa.ts`
- Create: `supabase/functions/_shared/zalo-oa.test.ts`
- Create: `supabase/functions/reservation-owner-notify/handler.ts`
- Create: `supabase/functions/reservation-owner-notify/handler.test.ts`
- Create: `supabase/functions/reservation-owner-notify/index.ts`
- Modify: `admin-web/lib/actions/zalo-owner-notifications.ts`
- Modify: `admin-web/app/mevo/stores/[storeId]/zalo-owner-notifications.tsx`

**Interfaces:**
- Edge endpoint consumes only `{ delivery_id, dispatch_token }` hoặc Database Webhook envelope có
  đúng hai giá trị đó.
- Sender returns discriminated union:

```ts
type OaSendResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; providerCode: string; message: string; retryable: boolean }
```

- [ ] **Step 1: Viết test đỏ cho provider result và handler**

Cases: HTTP 200 + `error=0`; HTTP 200 + `error<>0`; 401/429/5xx; body không phải JSON; timeout;
token delivery sai; delivery đã sent; không recipient/config; claim thành công rồi Zalo fail;
retry không tạo delivery mới.

- [ ] **Step 2: Implement sender theo API OA hiện hành**

Payload người nhận luôn lấy từ recipient verified của delivery; text tối thiểu:

```text
📅 Có đặt bàn mới
Khách: <tên> · <số người> khách
Đến: <dd/MM/yyyy HH:mm, Asia/Ho_Chi_Minh>
SĐT: <số điện thoại>
Mở để xử lý: <ADMIN_PUBLIC_ORIGIN>/admin/reservations
```

Không đưa note tự do vào tin pilot. URL lấy từ Edge secret `ADMIN_PUBLIC_ORIGIN`. Sender chỉ trả
`ok: true` khi transport và provider cùng thành công; log chỉ delivery ID, store ID và mã lỗi.

- [ ] **Step 3: Implement claim/send/finish idempotent**

Handler claim delivery trước khi gọi Zalo. Delivery `sent` trả no-op; `processing` không gửi lặp;
thiếu config/recipient thành `action_required`; provider retryable thành `failed`. Mọi nhánh ghi
`attempt_count`, `last_attempt_at`, mã lỗi rút gọn và tuyệt đối không ghi access token/UID vào log.

- [ ] **Step 4: Gửi thử thật từ cockpit**

Server action tạo delivery `owner_test`, gọi cùng Edge Function và refresh trạng thái. UI chỉ hiện
`Đã gửi` sau khi DB ghi `sent`; Zalo trả lỗi phải hiện mã/lời giải thích và nút `Thử lại`.

- [ ] **Step 5: Deploy function + cấu hình Database Webhook**

Deploy `reservation-owner-notify` với JWT verification tắt; an toàn dựa trên dispatch UUID không
đọc public và claim RPC service-role. Database Webhook chỉ theo dõi INSERT delivery `queued`, body
không chứa dữ liệu khách/token OA. URL/secret không được commit.

- [ ] **Step 6: Verification, Test 3 và commit**

Chỉ PASS khi tin test xuất hiện trên đúng Zalo chủ quán và cockpit lưu provider success thật.

```powershell
git commit -m "feat: gui thong bao dat ban qua Zalo OA"
```

**Dừng:** Anh Tú trả `Task 3 PASS`; nếu credential chưa sẵn sàng thì ghi `chờ credential`, không
dùng mock để đánh PASS.

---

### Task 4: Booking mới end-to-end, failure/retry và hồi quy Pubu

**Files:**
- Modify: `supabase/tests/059_reservation_owner_oa_notifications.test.mjs`
- Modify: `admin-web/lib/actions/zalo-owner-notifications.test.ts`
- Modify: `supabase/functions/reservation-owner-notify/handler.test.ts`
- Modify: `docs/testing/bao-luong/SPRINT-BL-2B.md`
- Modify: `TESTING.md`

- [ ] **Step 1: Tạo booking khách qua RPC thật**

Dùng `create_reservation` hiện có với Bảo Lương. Kiểm một event `created`, một delivery, một tin
OA; thao tác retry/reconnect không tạo tin thứ hai khi delivery đã `sent`.

- [ ] **Step 2: Kiểm failure matrix**

Tắt OA config, disable recipient, dùng token provider hết hạn và mô phỏng HTTP 5xx. Booking vẫn
`pending`, vẫn lên `/admin/reservations` và POS; delivery hiện `action_required/failed`; retry sau
khi sửa credential chuyển cùng delivery sang `sent`.

- [ ] **Step 3: Kiểm quyền/cross-store**

Anon, staff, owner Bảo Lương và owner quán khác không xem UID/credential, không tạo challenge,
gửi test hoặc retry. Event quán A không gửi bằng OA/recipient quán B.

- [ ] **Step 4: Regression**

Chạy toàn bộ SQL 049–059, Admin Web tests/build và Mini App tests. Pubu ordering/Kitchen/ZNS cũ
không đổi; BL-2A queue/Snooze/call staff/bill vẫn hoạt động.

- [ ] **Step 5: Chốt tài liệu và commit**

`SPRINT-BL-2B.md` phải ghi remote migration/function/webhook/config thực tế và Test 4A–4D. Dòng
`TESTING.md` chuyển sang `⏳ chờ BL-2B PASS`, chưa tự đánh PASS.

```powershell
git commit -m "test: hoan tat nghiem thu BL-2B"
```

**Dừng:** Anh Tú test theo `docs/testing/bao-luong/SPRINT-BL-2B.md — Test 4A–4D` và trả
`BL-2B PASS`. Không tự chuyển BL-2C hoặc BL-3.

## Self-review

- Spec coverage: đúng OA-scoped owner ID, follow + chủ động gửi tin, live test, CTA admin mobile,
  provider failure không rollback, audit/idempotency và tenant isolation đều có task.
- Scope: không kéo customer confirmation, preorder, ZNS hoặc nhắc 60 phút vào BL-2B.
- Security: browser không truyền owner OA UID; webhook signed + challenge hash + store/OA/app
  match; outbox và secrets không public.
- Recovery: booking không phụ thuộc Zalo; failed/action-required có retry rõ ràng.
- External blocker: OA access token/app secret hiện thiếu, được giữ thành gate thật ở Task 3.
