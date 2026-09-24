# Bảo Lương BL-3 — Mini App đặt bàn và gọi món liên tục Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` để thực hiện lần lượt. Các bước dùng checkbox. Quy tắc AGENTS.md ưu tiên: hết mỗi task cập nhật file test riêng, dừng chờ anh Tú PASS. Không tự triển khai toàn plan trong một lượt.

**Goal:** Khách đặt/theo dõi/đổi/hủy bàn từ Mini App, chọn món trước sau xác nhận, rồi gọi thêm qua mọi QR trong mâm mà không mất đơn hoặc in trùng.

**Architecture:** Supabase giữ quyền và trạng thái; Mini App React/Zustand/React Query gọi RPC bằng capability token lưu kín trên thiết bị. Booking độc lập với phiên bàn; preorder là order batch liên kết booking, chuyển vào cùng phiên khi nhận khách. BL-2C là checkpoint phụ thuộc trong plan này: POS phải xử lý phiên bản/in món trước khi bật UI gửi preorder.

**Tech Stack:** PostgreSQL/Supabase RPC + PGlite; React 18, TypeScript, Zustand, React Query, ZaUI, Vitest; Next.js Admin/POS hiện hữu.

**Spec:** `docs/superpowers/specs/2026-09-10-bao-luong-reservation-pos-workflow-design.md`; cập nhật thông báo tại `docs/superpowers/specs/2026-09-22-bao-luong-bl2b-zca-relay-design.md`.

**Trạng thái:** ✅ `BL-3 PASS` — anh Tú xác nhận ngày 2026-09-24. Tất cả task theo plan đã được nghiệm thu; các hồi quy POS bổ sung được ghi trong `SPRINT-BL-3.md`.

## Global Constraints

- UI tiếng Việt, mobile-first, không hardcode slug/ID quán/secret/URL hạ tầng.
- Bảo Lương: root xem menu + đặt bàn; Mang về/Ship tắt. Pubu giữ cấu hình prepay/takeaway và policy hiện tại.
- 30 phút tối thiểu, 7 ngày, bước 15 phút theo cấu hình server. Giữ nghĩa BL-1: ngày hôm nay tới ngày thứ 6 tiếp theo, không thêm ngày thứ 8.
- Giờ phục vụ là ca phẳng mọi ngày; `[]` phục vụ 24h. Booking tương lai không bị `is_accepting_orders=false` hoặc giờ hiện tại chặn.
- UTC trong DB, tính/hiển thị `Asia/Ho_Chi_Minh`. Client chọn chính instant từ slot server, không tự ghép ngày/giờ theo timezone máy.
- Không công bố bàn trống; không tự xác nhận/no-show/đóng booking pending quá giờ. Không PIN/mã nhập tay.
- Chỉ `confirmed` được gửi preorder; `Gọi sau tại quán` không tạo order. Bảo Lương khóa preorder ngay sau khi gửi: khách không sửa/hủy hoặc tạo batch thứ hai; chỉ gọi thêm sau khi đến quán và mở phiên QR/bill.
- Chủ quán được in sớm dù chưa cọc, có cảnh báo; nhắc ba giờ không giới hạn thời gian ăn. Phiên giữ timeout hiện tại 6 giờ không hoạt động.
- Không gửi ZCA cho khách. Trạng thái trong Mini App + gọi điện là kênh khách. Chat OA nếu giữ chỉ là liên hệ tùy chọn, không ghi “sẽ nhận xác nhận tự động”.
- Server kiểm tenant, quyền, capability, giá/biến thể/topping, phiên, cutoff và idempotency; UI không thay thế các kiểm tra này.
- Không sao chép preorder thành order mới khi nhận khách. Không tự in. Không tự gửi lại nội dung đã có lệnh in gốc.
- Task tự động do Codex chạy và ghi kết quả; không bắt anh Tú chạy lại lệnh đã PASS. Test UI/thiết bị thật có checklist riêng.
- Số migration dự kiến 065–070: kiểm tra số đã dùng tại thời điểm thực thi, đổi đồng bộ tên file/test nếu có nhánh khác chiếm số. Không sửa migration đã áp.

## Hiện trạng đã đối chiếu ngày 2026-09-23

| Bằng chứng trong repo | Hệ quả cho BL-3 |
| --- | --- |
| `053_reservation_customer_rpcs.sql`: slots, create/get/change/cancel bằng token | Tái sử dụng nền BL-1; cần phục hồi khi response tạo booking bị mất |
| `create_reservation` chỉ trả raw token ở lần `created=true`; nhánh replay trả public JSON trước kiểm token | Không dùng request ID làm quyền truy cập; Task 1 phải sửa hợp đồng trước khi UI gửi thật |
| `reservation_public_json` thiếu cutoff, hành động cho phép, lý do từ chối an toàn | Thêm projection riêng phía khách, không trả toàn bộ audit |
| `055_reservation_arrival.sql`: tạo phiên/mâm, chưa nối preorder | Task 5 bổ sung liên kết nguyên tử |
| `046_pos_bill_edit.sql`: source chỉ customer_zalo/staff/pos | Chưa có `reservation_preorder`, revision hoặc lịch sử lệnh in |
| `007a_kitchen_isolation.sql`: anon đọc orders/order_items rộng | Preorder mới phải bị loại khỏi đường SELECT công khai, kể cả sau nhận khách |
| `045_pos_confirm_order.sql`: xác nhận đơn một lần, không có revision/in audit | BL-2C phải biết phiên bản để duyệt/in món đổi sau lần in đầu |
| `mini-app/src/pages/menu/index.tsx`: CTA placeholder chỉ ở DEV; `storeOpen` chặn chọn món | CTA đặt bàn cần chạy bản TESTING/release và độc lập giờ gọi món ngay |
| `workflow.api.ts`/`workflow.types.ts`: chỉ bốn cờ kênh | Bổ sung public config tối thiểu cho form, không lấy audit/secret |
| `cart.store.tsx`: một giỏ `mevo_cart`, TTL 6h | Giỏ preorder phải tách theo store + reservation, không dùng chung với tại bàn |
| `order.queries.ts`: bill theo phiên, polling 30 giây | Tái dùng bill để hiển thị lượt món; cập nhật nhanh khi quay lại app |
| `057`/`058` + `reservation-reminders.ts`: nhắc đến/quá giờ | Chưa có tác vụ gọi khách trước 60 phút có trạng thái xử lý bền vững |

Phạm vi này bao gồm nền preorder còn thiếu, không phải chỉ gắn form vào RPC. BL-2A/2B đã PASS; không làm lại OA onboarding hoặc relay.

## Review Focus

1. Response tạo booking mất sau commit: cùng một booking, thiết bị vẫn lấy lại được quyền quản lý; Task 1–3.
2. Món đã in rồi khách sửa, đồng thời POS nhận khách: bếp nhận phiếu thay đổi rõ phiên bản, bill chỉ một bản hiện hành; Task 4–6.
3. Anon có UUID booking/order, QR cùng mâm hoặc UID tự khai: không đọc PII/token hoặc sửa preorder của người đặt; Task 1, 4, 8.
4. Điện thoại timezone khác, qua nửa đêm, ca 22:00–02:00, sát cutoff: không lệch ngày/slot, quyền server thắng cache; Task 1, 3, 4.
5. Webview đóng, mất storage, popup in bị chặn, relay tắt: trạng thái không báo thành công giả, có phục hồi/gọi quán; Task 2, 6, 10.

## Phân chia và thứ tự nghiệm thu

| Task | Kết quả độc lập | Gate |
| --- | --- | --- |
| 1 | Hợp đồng customer RPC an toàn, phục hồi retry | BL-3 Test 1 |
| 2 | Service, token storage và query phía Mini App | BL-3 Test 2 |
| 3 | Root đặt bàn + theo dõi/đổi/hủy hoạt động | BL-3 Test 3 |
| 4 | Preorder có giá server, revision và cutoff | BL-3 Test 4 |
| 5 | Nhận khách/hủy/no-show liên thông preorder | BL-3 Test 5 |
| 6 | BL-2C POS duyệt/in phiên bản + hao hụt | BL-2C Test 1–3; `BL-2C PASS` |
| 7 | Mini App chọn và gửi món đặt trước đã khóa | BL-3 Test 7 |
| 8 | QR bàn đã giữ, lịch sử lượt, gọi thêm không trùng | BL-3 Test 8 |
| 9 | Tác vụ gọi nhắc khách trước 60 phút | BL-3 Test 9 |
| 10 | Deploy đúng instance và E2E thiết bị thật | `BL-3 PASS` |

Task 3 có thể deploy để nghiệm thu đặt bàn độc lập. Chưa mở CTA gửi preorder trước Task 6 PASS. Sau mỗi gate chỉ tiếp tục khi anh Tú xác nhận.

## Task 1: Customer RPC phục hồi được sau mất mạng

**Files:** Create `supabase/migrations/065_reservation_customer_access.sql`, `supabase/tests/065_reservation_customer_access.test.mjs`. Tham chiếu 052/053/054/057 và harness `supabase/tests/052_reservation_foundation.test.mjs`.

**Interfaces (SQL mới):**

```sql
prepare_reservation_request(p_store_id uuid, p_client_request_id uuid) returns jsonb
-- {customer_token, expires_at}; token ngẫu nhiên 256 bit trở lên, server cấp một lần.
create_customer_reservation(p_store_id uuid, p_client_request_id uuid,
  p_customer_token text, p_customer_name text, p_customer_phone text,
  p_party_size integer, p_arrival_at timestamptz,
  p_note text default null, p_zalo_user_id text default null) returns jsonb
-- {created, reservation: CustomerReservation}; không trả raw token.
get_customer_reservation(p_reservation_id uuid, p_customer_token text) returns jsonb
-- CustomerReservation; mở rộng response hiện hữu bằng trường mới.
get_public_reservation_config(p_store_id uuid) returns jsonb
-- server_now, timezone, local_today, min/max date, giới hạn tạo, preorder_enabled.
revoke_reservation_customer_access(p_reservation_id uuid, p_reason text) returns jsonb
-- owner đúng quán; thu hồi hash và ghi event, không trả token mới.
```

`CustomerReservation` giữ tên trường snake_case cũ, thêm `server_now`, `preorder_edit_deadline`,
`can_request_change`, `can_cancel`, `can_preorder`, `customer_message`, `has_change_request`.
Booking quá giờ pending vẫn pending, `customer_message` nói chưa bảo đảm, không cho tự hủy.

- [ ] Viết test PGlite: tạo intent không tạo reservation/event/outbox; tạo booking từ intent có đúng một event; mất response rồi gọi lại token đúng lấy lại cùng booking; token sai/cùng request ID không lộ JSON; slot hôm nay/ngày cuối/ca qua đêm không trả instant ngoài ngày khách chọn.

```js
assert.equal(first.reservation.reservation_id, replay.reservation.reservation_id)
assert.equal(replay.created, false)
assert.equal(await countCreatedEvents(first.reservation.reservation_id), 1)
await assert.rejects(() => createWithToken(requestId, 'wrong-token'))
```

- [ ] Chạy `node --test supabase/tests/065_reservation_customer_access.test.mjs` với `PGLITE_MODULE` trỏ dependency admin-web; xác nhận test mới thất bại đúng lý do thiếu RPC.
- [ ] Tạo bảng private `reservation_customer_requests`: store/request unique, token hash, expiry 24h cho intent chưa dùng, reservation_id sau commit. Không raw token trong bảng, log, URL. Intent đã dùng vẫn xác thực retry qua booking, không mất quyền sau 24h. Prepare lặp không tiết lộ token hay đổi token intent đã dùng; nếu mất response prepare, tạo request ID mới vì chưa có booking nào được tạo.
- [ ] `create_customer_reservation` khóa intent, kiểm token trước mọi nhánh replay; tạo booking và append event nguyên tử. Tên trim 1–100, phone 6–20, note tối đa 1000 ký tự, số khách 1–100. Không coi UID client là bằng chứng quyền. Token phải lưu bền vững trước lời gọi create; Task 2 chịu trách nhiệm.
- [ ] Thu hồi quyền anon/authenticated của RPC create cũ sau kiểm tra toàn repo không có caller sản phẩm; giữ function nội bộ/test nếu cần. Không còn cửa public replay đọc PII chỉ bằng request UUID. RPC read/change/cancel kiểm hash và tenant, không SELECT trực tiếp từ Mini App. Hỗ trợ thu hồi token bằng đổi hash qua RPC owner có audit, không cho client đổi hash. Intent đã dùng phải kiểm hash hiện hành trên booking, tránh token bị thu hồi vẫn đọc qua replay. Tests BL-1 cũ chạy với quyền nội bộ khi test nền; thêm test anon chứng minh chỉ cửa mới được public.
- [ ] Projection lý do từ chối: chỉ lấy lý do đã xác định được phép báo khách, không trả `reservation_events` hoặc ghi chú operator. Bổ sung trường `customer_message` nếu dữ liệu hiện tại chưa phân tách rõ. Update reject action truyền riêng lời nhắn khách khi cần; mặc định không công bố note cũ.
- [ ] Chuẩn hóa slots thành ngày lịch HCM được chọn: giao ca hôm trước qua nửa đêm với ngày đang xem; loại trùng, sort instant, áp horizon/min advance sau cùng. Edit booking dùng snapshot giới hạn cũ, không để tắt nhận booking mới chặn xem/hủy booking đang có. Test cấu hình thay đổi giữa tạo và yêu cầu đổi.
- [ ] Chạy test mới + 052/054/057/063; cập nhật `SPRINT-BL-3.md — Test 1`, commit `feat: phuc hoi quyen dat ban khi gui lai`, dừng `Task 1 PASS`.

## Task 2: Service và storage quản lý booking

**Files:** Create `mini-app/src/types/reservation.types.ts`, `services/reservation/reservation.api.ts`, `reservation.api.test.ts`, `reservation.queries.ts`, `reservation-storage.ts`, `reservation-storage.test.ts` (bốn file cuối cùng cùng thư mục `services/reservation`).

**Interfaces:**

```ts
type ReservationAccess = { storeId: string; reservationId: string; token: string }
type BookingDraft = { requestId: string; token: string; storeId: string;
  customerName: string; customerPhone: string; partySize: number;
  arrivalAt: string; note: string }
// reservation.api.ts
prepareBooking(storeId: string, requestId: string): Promise<{ token: string; expiresAt: string }>
submitBooking(draft: BookingDraft): Promise<{ created: boolean; reservation: CustomerReservation }>
getBooking(access: ReservationAccess): Promise<CustomerReservation>
requestBookingChange(access: ReservationAccess, arrivalAt: string, partySize: number, note: string): Promise<CustomerReservation>
cancelBooking(access: ReservationAccess, reason: string): Promise<CustomerReservation>
// storage: get/set access và draft theo storeId; profile tên/phone lưu riêng.
```

- [ ] Viết test service mock RPC giống `services/order/order.api.test.ts`: token dùng đúng tham số; retry giữ request ID/payload; không đọc bảng; sai tenant không dùng access cũ. Storage bị chặn/quota/JSON hỏng không crash.
- [ ] Chạy `npm test -- src/services/reservation` trong mini-app, xác nhận RED.
- [ ] Persist intent/token + payload trước create. Nếu lưu thất bại, chặn gửi và hiện hướng dẫn gọi quán; nếu prepare response mất, bỏ intent chưa dùng và prepare mới. Nếu create response mất, giữ draft đóng băng, retry cùng ID/token, không tạo request mới; nút đổi draft chỉ mở sau biết server chưa tạo booking.
- [ ] Sau success ghi access rồi xóa draft. Storage keyed store, danh sách booking trên thiết bị; không hứa khôi phục đa thiết bị theo UID. Mất storage hiện thông báo liên hệ quán, không tìm booking bằng phone/UID chưa xác minh. Token không vào query key, analytics hoặc console.
- [ ] React Query key gồm store + reservation + access-generation không chứa token; đổi access phải clear cache cũ. Poll 5 giây khi màn booking đang visible, refetch khi focus/reconnect, backoff khi lỗi, dừng khi ẩn/terminal. Không mở anon SELECT/Realtime reservation chỉ để nhận update.
- [ ] Test hồi quy/typecheck, ghi `Test 2`, commit `feat: them dich vu dat ban mini app`, dừng `Task 2 PASS`.

## Task 3: Form root, Đặt bàn của tôi và đổi/hủy

**Files:** Modify `mini-app/src/router.tsx`, `pages/menu/index.tsx`, `components/layout/bottom-tabs.tsx`; Create `pages/reservations/index.tsx`, `pages/reservations/detail.tsx`, `components/reservations/reservation-form.tsx`, `components/reservations/reservation-status.tsx`, `utils/reservation-display.ts`, `utils/reservation-display.test.ts`.

**Interfaces:** Routes `/reservations`, `/reservations/new`, `/reservations/:reservationId`; URL chỉ UUID, access từ Task 2. Config/slots từ Task 1. `formatReservationTime(iso)` luôn HCM; `reservationActions(booking, now)` phản ánh quyền server và cutoff, không tự cấp quyền.

- [ ] Test form/model: ngoài giờ 09:00 vẫn đặt 19:00; pending không nói đã giữ bàn; quá giờ có nút gọi quán; tắt reservations chặn tạo nhưng booking đã có vẫn xem/đổi/hủy theo quyền server.

```ts
expect(reservationActions(pendingOverdue, now).message)
  .toBe('Quán chưa xác nhận — đặt bàn chưa được bảo đảm')
expect(formatReservationTime('2026-09-24T12:00:00Z')).toContain('19:00')
```

- [ ] Chạy test RED rồi làm CTA **Đặt bàn trước** bản release, độc lập `storeOpen`. Root read-only giữ menu; banner giải thích ngoài giờ gọi món ngay nhưng vẫn đặt trước được. Tab **Đặt bàn** hiện nếu capability bật hoặc thiết bị còn booking; không xóa tab Pubu hiện tại.
- [ ] Form ZaUI tên/phone/số người/ngày/slot/note; tên phone điền profile cục bộ. Chỉ render slot server, không date parser theo timezone máy. Đổi ngày reset giờ cũ. Trước gửi refresh quyền/slot; server hết slot thì giữ draft và báo chọn lại.
- [ ] Thành công pending hiện **Đã gửi yêu cầu đặt bàn — chờ quán xác nhận**. Khi confirmed hiển thị lời mời chọn món, nhưng trong bản Task 3 chưa nối hành động gửi preorder; Task 7 mới mở sau BL-2C PASS. **Gọi sau tại quán** không tạo món. Không dựng nút giả disabled “sẽ mở ở BL-3” trong bản release.
- [ ] Detail/list hiển thị trạng thái mới nhất, lịch đang có hiệu lực và yêu cầu đổi riêng; loading/lỗi offline không giả thành rejected. Hủy có xác nhận; change giữ lịch cũ đến khi owner duyệt. Không đưa token lên UI. CTA điện thoại dùng số quán; thiếu số hiện hỏi nhân viên.
- [ ] Chạy tests/typecheck; test browser 390px và Zalo TESTING: root ngoài giờ, mất response, reopen, owner xác nhận/từ chối/đổi. Ghi `Test 3`, commit `feat: dat va theo doi ban tren mini app`, dừng `Task 3 PASS`.

## Task 4: Preorder batch, revision, giá server và cutoff

**Files:** Create `supabase/migrations/066_reservation_preorders.sql`, `supabase/tests/066_reservation_preorders.test.mjs`; Extend `mini-app/src/types/reservation.types.ts`. Tham chiếu pricing 043, tổng/void 046 và policy 007a.

**Interfaces:**

```sql
submit_reservation_preorder(p_reservation_id uuid, p_customer_token text,
 p_client_request_id uuid, p_items jsonb, p_note text default null) returns jsonb
revise_reservation_preorder(p_order_id uuid, p_customer_token text,
 p_expected_revision integer, p_client_request_id uuid, p_items jsonb,
 p_note text default null) returns jsonb
cancel_reservation_preorder(p_order_id uuid, p_customer_token text,
 p_expected_revision integer, p_client_request_id uuid) returns jsonb
get_customer_reservation_preorders(p_reservation_id uuid, p_customer_token text) returns jsonb
-- PreorderBatch: order_id, revision, released_revision, status, total_amount,
-- items snapshots, can_edit, edit_deadline, needs_pos_review.
```

- [ ] PGlite RED: confirmed mới được gửi; pending/sai token/quán từ chối; ngoài giờ hiện tại vẫn được nếu giờ đến hợp lệ; giá client sai không được dùng; variant/topping quán khác hoặc hết bán bị chặn. Cutoff trước/đúng/sau; đã in vẫn sửa trước cutoff; sửa phiên bản cũ báo xung đột.
- [ ] Thêm orders.reservation_id với FK ghép store; source `reservation_preorder`, revision/current released revision. Không cho thiếu table/session ngoài preorder chưa đến. Public RPC không nhận source/payment tự do; source do server gán, Bảo Lương cash/postpay theo config. Quán chưa hỗ trợ preorder với timing/phương thức hiện tại trả lỗi cấu hình rõ ràng, không âm thầm chuyển prepay sang cash.
- [ ] Bảng private `reservation_preorder_revisions`: order, store, revision, snapshot món/tổng/note, actor, created_at, mutation request ID unique. Định nghĩa luôn schema private `reservation_preorder_print_jobs` và cờ `waste_review_required` ở Task 4 để lifecycle Task 5 đọc được trước khi Task 6 thêm RPC ghi lệnh in. Current order_items phản ánh phiên bản hiện hành; giữ snapshot bất biến của bản cũ. Retry mutation phải kiểm token trước trả kết quả và trả cùng revision đã tạo; replay payload khác báo xung đột.
- [ ] Lock theo reservation trước order ở mọi đường viết. Kiểm feature khi tạo mới; quyền sửa/hủy dựa cutoff snapshot và trạng thái reservation. Chỉ `confirmed` trước giờ đến được gửi batch mới; sau `arrived` gọi món bằng QR. New batch sát giờ nhưng sau cutoff được phép gửi nếu vẫn confirmed và chưa đến, kèm UI báo không thể sửa/hủy; cutoff áp cho sửa/hủy, không tự suy thành cấm gửi mới.
- [ ] Validate item quantity nguyên 1–99, tối đa 100 dòng, tổng từ DB, note có giới hạn. Snapshot tên/giá/variant/topping; menu đổi không âm thầm tính lại các dòng khách chưa sửa. Phần thay đổi phải lấy giá/menu hiện tại và trả tổng để khách xác nhận khi giá đổi.
- [ ] Exclude preorder khỏi **mọi** policy public/anon orders và order_items (policy permissive OR phải rà hết). Đọc bằng token RPC hoặc bill session sau arrival; không trả phone/note booking từ bill. Operator/kitchen vẫn đọc theo tenant/policy. Không trả raw token trong orders/capability cũ. Test UUID + anon SELECT không lấy preorder.
- [ ] Duyệt phiên bản: `needs_pos_review = revision > released_revision`; giữ dấu đã release và snapshot cũ để Kitchen/POS không tự đọc bản khách vừa sửa thành lệnh bếp. Không dùng riêng `confirmed_at != null` để coi revision mới đã duyệt. Task 6 cập nhật mọi consumer trước UI khách bật.
- [ ] Chạy test mới + regression order pricing/permission, ghi `Test 4`, commit `feat: tao mon dat truoc co phien ban`, dừng `Task 4 PASS`.

## Task 5: Nối preorder với phiên và kết thúc booking

**Files:** Create `supabase/migrations/067_reservation_preorder_lifecycle.sql`, `supabase/tests/067_reservation_preorder_lifecycle.test.mjs`. Tham chiếu functions 054/055/056/057, không sửa file migration cũ.

**Interfaces:** Giữ chữ ký `arrive_reservation`, `cancel_customer_reservation`, `resolve_reservation_change`, `mark_reservation_no_show`, `reschedule_reservation`. Thêm RPC `cancel_store_reservation(p_reservation_id uuid, p_reason text) returns jsonb` cho owner đúng quán (repo chưa có RPC hủy booking phía quán) và helper private `settle_reservation_preorders(p_reservation_id uuid, p_reason text)` chỉ gọi trong transaction lifecycle. Bổ sung action/CTA hủy trong `admin-web/lib/actions/reservations.ts` và `admin-web/app/admin/reservations/reservation-card.tsx`, kèm tests của hai file.

- [ ] RED: hai lần nhận khách → một phiên, nguyên order IDs; tiền preorder + QR đúng một lần; hủy/no-show không để pending mồ côi; nhận khách cạnh tranh với khách sửa/hủy không deadlock/ghép nhầm.

```js
assert.deepEqual(orderIdsAfterArrival, orderIdsBeforeArrival)
assert.equal(sessionCountForReservation, 1)
assert.equal(await countOrphanPendingOrders(cancelledReservationId), 0)
```

- [ ] Nhận khách khóa reservation → bảng/bàn theo cơ chế hiện có → orders theo UUID; nối các preorder còn hiệu lực vào session và bàn gốc. Không gửi sự kiện in. Không kéo order đã hủy vào bill. Nhận khách lại trả session cũ.
- [ ] Customer hủy booking: chặn nếu có preorder đã khóa hoặc có lệnh chuẩn bị/in; gọi quán. Customer vẫn có thể chỉnh món đã in trước cutoff theo Task 4; không đánh đồng quyền sửa món với hủy toàn booking. Owner hủy/no-show được, phải có lý do.
- [ ] Chưa có lệnh chuẩn bị/in: kết thúc order cancelled; đã có lệnh: cancelled cho bill nhưng giữ revision/print audit và cờ cần đối soát hao hụt. Không tự xác nhận món đã nấu hoặc tự ghi nhận doanh thu/hoàn tiền. Task 6 cung cấp thao tác đối soát.
- [ ] Đổi giờ đã duyệt: tính cutoff từ giờ có hiệu lực + snapshot; không theo requested time chưa được duyệt. Với revision đã in, đánh dấu POS cần xem thay đổi giờ; owner thấy ảnh hưởng trước xác nhận. Từ chối đổi giữ lịch/món cũ.
- [ ] Guard đóng bill tính cả revision preorder chờ xử lý, giữ ngoại lệ món tay POS; bill/session reader tính món hiện hành và bỏ canceled/void đúng. Chạy hồi quy 054/055/056/057 cùng tests mới, ghi `Test 5`, commit `feat: noi preorder vao phien va xu ly huy`, dừng `Task 5 PASS`.

## Task 6: Checkpoint BL-2C — POS duyệt/in preorder

**Files:** Create `supabase/migrations/068_reservation_preorder_release.sql`, `supabase/tests/068_reservation_preorder_release.test.mjs`, `admin-web/lib/actions/reservation-preorders.ts`, `.test.ts`, `admin-web/app/admin/cashier/reservation-preorder-panel.tsx`, `.test.tsx`, `admin-web/lib/preorder-print.ts`, `.test.ts`, `docs/testing/bao-luong/SPRINT-BL-2C.md`. Modify `lib/actions/pos-order.ts`, `lib/kitchen-announce.ts`, `app/admin/cashier/print-order/page.tsx`, `print-order.tsx` và cashier client chứa queue; cập nhật kiểu/query Kitchen liên quan theo tìm kiếm consumer orders.

**Interfaces:**

```sql
list_reservation_preorder_queue(p_store_id uuid) returns jsonb
release_reservation_preorder(p_order_id uuid, p_expected_revision integer,
 p_request_id uuid) returns jsonb
request_reservation_preorder_print(p_order_id uuid, p_revision integer,
 p_kind text, p_request_id uuid) returns jsonb
-- kind: original | adjustment | reprint; trả immutable print_job_id + snapshot.
resolve_preorder_waste(p_order_id uuid, p_reason text, p_request_id uuid) returns jsonb
```

Release trả `already`, `released_revision`, `needs_print`; print request retry cùng ID trả cùng job, không thêm audit. Print job snapshot gồm before/after/delta, số phiên bản, booking time, bàn đã phân nếu có, người thao tác; không chứa customer token.

- [ ] RED: owner khác quán/staff/anon không release/in; hai click cùng revision chỉ release một lần; revision cũ không release revision mới; customer đổi sau in tạo adjustment; nhận khách không sinh print job.
- [ ] POS có queue preorder trước khi có session/table; hiển thị tên/giờ/số khách, phiên bản và chênh lệch. Nút **Xác nhận & in 2 liên** cảnh báo in trước khi khách đến chưa có cọc. Mobile `/admin/reservations` chỉ duyệt booking; không thêm nút duyệt/in món ở đó. Không tuyên bố RPC có thể biết chủ quán đang dùng máy tính hay điện thoại; bảo mật dựa role/tenant.
- [ ] Print audit append-only lưu lệnh, không ghi “giấy đã in” chỉ từ `window.print`. Bản đầu hai liên; bản đổi in phiếu **ĐIỀU CHỈNH** nêu thêm/bớt/thay thế từ revision nào tới revision nào; in lại có nhãn **IN LẠI** + người/lý do. Nội dung render từ snapshot job, không query order_items live.
- [ ] Popup mở từ thao tác người dùng trước await nếu cần, nhưng chỉ fill snapshot sau RPC thành công. Popup bị chặn/in bị hủy hiện **Chưa xác nhận giấy đã ra — mở phiếu/in lại**, không rollback release. Không tự gọi print lại khi polling/reconnect.
- [ ] Chặn đường `pos_confirm_order` cũ lách version guard cho preorder. Kitchen dùng released snapshot cho preorder, revision chưa release không đổi món bếp/không phát chuông như batch mới. Policy Pubu QR/staff giữ nguyên; preorder config automatic nếu hỗ trợ phải đi chung release-version logic và vẫn không tự in.
- [ ] POS hiển thị preorder đã hủy/in cần đối soát, owner ghi nhận lý do/kết quả; không gộp sang khách khác. Queue polling ≤5 giây + focus/reconnect, trạng thái lỗi thao tác không bị polling xóa.
- [ ] Chạy SQL, admin tests/typecheck/build. Ghi Test 1 quyền/revision, Test 2 hai liên/adjustment/popup, Test 3 no-show/hao hụt vào `SPRINT-BL-2C.md`; thêm link + trạng thái TESTING. Commit `feat: duyet va in preorder theo phien ban`. Dừng chờ **BL-2C PASS**, mới mở Task 7.

## Task 7: Menu và giỏ preorder trên Mini App

**Files:** Create `mini-app/src/stores/preorder-cart.store.ts`, `.test.ts`, `services/reservation/preorder.api.ts`, `.test.ts`, `pages/reservations/preorder.tsx`, `pages/reservations/preorder-checkout.tsx`; Modify `router.tsx`, `pages/reservations/detail.tsx`. Extract menu presentation khi cần vào `components/menu/menu-catalog.tsx`; giữ OptionSheet/pricing helpers hiện hữu.

**Interfaces:** Routes `/reservations/:reservationId/preorder` và `/reservations/:reservationId/preorder/checkout`; giỏ key `(storeId,reservationId,orderId|null)`, chứa `expectedRevision` khi sửa và `clientRequestId` bền vững cho lần gửi.

- [ ] Test RED: giỏ hai booking và giỏ QR không trộn; option khác tạo dòng riêng; retry không tạo batch mới; confirmed → arrived/hủy khi đang chọn món bị chặn lúc gửi; cutoff đổi trong lúc mở màn.
- [ ] Hiện **Chọn món trước / Gọi sau tại quán** khi confirmed. Trước submit lấy booking mới; menu preorder không phụ thuộc `storeOpen`. Server tính giá, UI hiển thị ước tính đến khi nhận giá xác nhận. Không áp voucher/prepay checkout vào preorder.
- [ ] Dùng OptionSheet cho variant/topping, persist draft theo booking; không đụng `mevo_cart`. Hiện món đã gửi và giỏ chưa gửi riêng. Sau thành công clear đúng draft, hiển thị lượt + đủ món/tổng từ server; chờ quán duyệt, không nói bếp đã nhận khi chưa release.
- [ ] Không dựng UI sửa/hủy. Sau submit, clear đúng draft và hiển thị thông báo chốt món; batch thứ hai bị server chặn. Gọi thêm chỉ thuộc Task 8 sau khi khách đã đến.
- [ ] Network timeout giữ request ID và draft khóa, cho kiểm tra/gửi lại cùng yêu cầu; phiên bản xung đột không ghi đè, tải snapshot mới và để khách xem lại. Đổi booking pending giữ lịch cũ làm cơ sở cutoff.
- [ ] Chạy mini tests/typecheck và test Zalo hai thiết bị cùng owner POS. Ghi `Test 7`, commit `feat: chon va sua mon dat truoc tren mini app`, dừng `Task 7 PASS`.

## Task 8: QR giữ bàn, mâm và cảnh báo gọi trùng

**Files:** Create `supabase/migrations/069_reservation_table_ordering.sql`, `supabase/tests/069_reservation_table_ordering.test.mjs`, `mini-app/src/utils/order-duplicates.ts`, `.test.ts`; Modify `types/order.types.ts`, `services/order/order.api.ts`, `order.queries.ts`, `pages/menu/index.tsx`, `pages/session-orders/index.tsx`, `pages/checkout/index.tsx`.

**Interfaces:** Mở rộng `get_table_session_state` bằng state `reserved` chỉ có thông báo an toàn, không reservation ID/name/phone/token. Helper server `table_has_current_reservation_hold(table_id, now)` dùng cùng cửa sổ phân bổ POS, không coi mọi booking tương lai là khóa ngay. `findOrderDuplicates(draftItems, sessionBill)` match món + variant + topping đã chuẩn hóa, bỏ cancelled/void.

Wrapper mới chỉ cho gọi tại bàn (order_type luôn dine_in), dùng cùng logic pricing/payment/capability của create_order:

```sql
create_table_order_batch(p_store_id uuid, p_table_id uuid, p_items jsonb,
 p_payment_method text, p_client_request_id uuid, p_zalo_user_id text default null,
 p_device_id text default null, p_note text default null, p_voucher_code text default null,
 p_expected_session_id uuid default null) returns jsonb
```

Trả cùng JSON order hiện tại; mapping UI hiện hữu vẫn nhận order ID/capability của chính batch. Lần đầu bàn trống cho expected session null; nếu client đã thấy session thì bắt buộc khớp khi tạo mới. Replay đúng request đã tạo không bị mất kết quả chỉ vì phiên vừa đóng, nhưng không cấp capability cho request khác thiết bị.

- [ ] Test RED: booking ngày mai không khóa bàn hôm nay; hold hiện tại chưa arrive chặn QR/create_order; bấm gọi nhân viên được; sau arrive mọi QR mâm tạo order cùng session. UUID table không cấp quyền xem/sửa booking.
- [ ] Dùng khoảng `[hold_starts_at, hold_ends_at)` đang hiệu lực và booking confirmed; không extends khóa sang ngày khác chỉ vì allocation chưa released. Không tự đóng booking quá hạn hold. Phiên thật đang mở vẫn là nguồn để gọi thêm; arrive không ghi đè khách hiện tại. Kiểm server dưới cùng advisory lock như tạo session để tránh race QR/arrive.
- [ ] Banner reserved **Bàn đã được đặt trước. Vui lòng báo chủ quán để mở bàn.**, chỉ action Gọi nhân viên; ping theo bàn trước arrival, sau arrival theo session/mâm. Không thêm PIN. Refetch state khi focus/reconnect và sau chủ quán nhận khách.
- [ ] Bill tách **Món đã đặt trước**, **Các lượt gọi thêm**, **Giỏ đang chọn**; giữ released/current revision rõ ràng. Trước gửi so sánh giỏ với bill mới nhất, hiện số lượng đã gọi và yêu cầu **Vẫn gọi thêm**; được phép gọi lại cùng món. Xác nhận gửi hiển thị nguyên batch server đã nhận.
- [ ] Bổ sung request ID bền vững cho batch QR bằng wrapper RPC `create_table_order_batch` trên; giữ chữ ký/logic root prepay Pubu. Lock unique store/request và xác thực context trước replay. Test timeout không tạo thêm lượt/tiền.
- [ ] Test mất phiên, bàn đã đóng, giỏ cũ từ session trước: không gửi vào phiên mới âm thầm, yêu cầu khách xác nhận ngữ cảnh mới. Chạy regression Pubu/Bảo Lương, ghi `Test 8`, commit `feat: goi them theo phien dat ban an toan`, dừng `Task 8 PASS`.

## Task 9: Tác vụ gọi nhắc trước 60 phút

**Files:** Create `supabase/migrations/070_reservation_customer_call_tasks.sql`, `supabase/tests/070_reservation_customer_call_tasks.test.mjs`, `admin-web/lib/actions/reservation-customer-calls.ts`, `.test.ts`, `admin-web/app/admin/reservations/customer-call-tasks.tsx`, `.test.tsx`; Modify `reservations-client.tsx`, `app/admin/cashier/reservation-queue-panel.tsx`.

**Interfaces:** Bảng private `reservation_customer_call_tasks` unique reservation + confirmed arrival, due_at, resolved_at/by, outcome. RPC owner `list_reservation_customer_calls(store_id)` và `resolve_reservation_customer_call(task_id, outcome)`; outcome `called` hoặc `unreachable`, không đánh dấu khách đã nhận SMS/Zalo.

- [ ] PGlite RED: confirm tạo một task due=arrival−60m; confirm sát giờ tạo task đến hạn ngay; đổi lịch retire task cũ và lập lịch mới; cancel/no-show/arrive retire task; retry resolve không nhân audit.
- [ ] Tạo task nguyên tử khi confirm/đổi lịch trong DB, không cần cron để biết đã đến hạn. Admin/POS query due tasks, poll/focus giống queue hiện có; nút **Gọi nhắc khách** dùng tel, nút **Đã gọi / Chưa liên hệ được** ghi kết quả. Mở tel không tự coi đã gọi thành công. Màn đóng thì không hứa phát chuông; task tồn tại để thấy khi mở lại.
- [ ] Gộp hiển thị/chuông, không thêm vòng chuông mỗi task; không làm thay đổi Snooze nhắc khách đến 10/15/30 của BL-2A. Không mở rộng relay thành kênh gửi khách hoặc gửi thêm sự kiện nhắc nhóm.
- [ ] Chạy test SQL/admin; test gọi nhắc ở mốc 60 phút và đổi giờ. Ghi `Test 9`, commit `feat: nhac quan goi khach truoc gio den`, dừng `Task 9 PASS`.

## Task 10: Nghiệm thu, deploy hai instance và bàn giao

**Files:** Create/update `docs/testing/bao-luong/SPRINT-BL-3.md`, `SPRINT-BL-2C.md`; Modify `TESTING.md` chỉ link/status. Cập nhật hướng dẫn deploy hiện có được xác định từ `rg --files docs` và metadata build nếu cần; không đổi App ID theo suy đoán.

- [ ] Chạy test liên quan toàn chuỗi SQL 052–070 + Mini App `npm test`, `npm run typecheck`; admin `npm test -- --run`, `npx tsc --noEmit`, `npm run build`. Kiểm `git diff --check`. Ghi command/commit/kết quả thực, không ghi PASS trước khi chạy.
- [ ] Rà từng consumer order_source, status, confirmed_at, table/session nullable, RLS, realtime và receipt print; không để preorder không có bàn crash dashboard/POS/Kitchen. Rà privilege mới và bản RPC cũ trước áp migration production.
- [ ] Apply từng migration đã test theo phụ thuộc, kiểm production metadata/RPC; deploy Admin/POS trước bật Mini App preorder. Xác minh instance Bảo Lương và Pubu qua config build + store config, ghi commit/version/description TESTING cụ thể. Không lấy nhầm main/build cũ đã gây lỗi BL-0.
- [ ] Anh Tú test thiết bị thật: root ngoài giờ → pending → nhóm thông báo một tin → owner mobile xác nhận bàn → app confirmed → chọn món → POS in → sửa trước cutoff → POS in điều chỉnh → nhận khách nhiều bàn → QR gọi thêm → đóng bill. Case Gọi sau tại quán chạy độc lập.
- [ ] Test hủy/no-show đã in/chưa in, mất mạng lúc submit, hai lần gửi, popup blocked, hết cutoff/đổi giờ, app mở lại, token sai, relay unavailable; DB không mất booking và không treo order pending không session. Không tắt bot vận hành để test lỗi nếu mock/staging đã đủ; đánh dấu rõ cấp độ bằng chứng.
- [ ] Pubu root pickup/delivery, prepay và staff policy, Bảo Lương root không takeaway, QR cũ thiếu tableNumber, bảng/mâm đang dùng không hồi quy. Không thay lại giờ phục vụ 24h anh đang dùng để test trừ khi được yêu cầu.
- [ ] Ghi trạng thái test khách thật khác test mock, điểm còn mở và cách đóng bản ghi test bằng RPC/UI. Commit `test: nghiem thu mini app dat ban BL-3`; dừng chờ `BL-3 PASS` trước BL-4.

## Quy ước lệnh và bằng chứng

PGlite chạy từ repo root; chuẩn bị một lần mỗi shell:

```powershell
$bl3ModulePath = (Resolve-Path 'admin-web/node_modules/@electric-sql/pglite/dist/index.js').Path
$env:PGLITE_MODULE = ([System.Uri]::new($bl3ModulePath)).AbsoluteUri
node --test supabase/tests/065_reservation_customer_access.test.mjs
```

Lệnh Mini App chạy trong `mini-app`, Admin chạy trong `admin-web`. Test migration kế tiếp dùng đúng file mới của task. Sửa code theo test RED/GREEN; không yêu cầu anh Tú lặp lại tests tự động Codex đã chạy. UI integration tests nếu thiếu renderer cần thêm dependency test trong task sở hữu UI và ghi lockfile; logic service/model vẫn Vitest hiện hữu.

## Quyết định kỹ thuật đề xuất trong plan để duyệt

1. Server cấp token trước bước tạo booking qua intent private, thiết bị lưu token trước commit: tránh booking thành công nhưng mất quyền theo dõi. Không thêm bước người dùng hay mã nhập tay.
2. Quản lý booking pilot trên thiết bị đã đặt; mất storage/đổi máy liên hệ quán. Không dùng UID client để tìm toàn bộ lịch sử.
3. Preorder giữ một order ID qua các revision; phiếu in snapshot/delta và released revision riêng. Sửa sau in trước cutoff vẫn được như đã duyệt.
4. BL-2C thực hiện ở Task 6 với gate riêng, trước UI preorder Task 7. Task 3 có thể phát hành đặt bàn sớm.
5. Nhắc 60 phút là tác vụ gọi điện bền vững, không hứa tự gửi khách. Tác vụ có ngay sau xác nhận, chỉ hiện đến hạn.

Các quyết định vận hành đã chốt (thời gian, quyền owner, in trước khi đến, đóng pending tay) giữ nguyên. Giới hạn mới về chiều dài/quantity là validation kỹ thuật; nếu quán cần vượt phải cấu hình hoặc xử lý owner, không âm thầm truncate dữ liệu.

## Self-review và coverage

- Spec §3/§6.1: Task 1–3, root capability, giờ/slot/snapshot, safe token.
- §5.3/§6.2: Task 4–7, confirmed-only, cutoff, revision, mất mạng, hủy/no-show.
- §4/§6.3/§7.3: Task 5–8, một mâm/bill, POS release/in, QR/privacy/duplicate warning.
- §8: Task 3/9/10, kênh trạng thái khách, gọi nhắc 60 phút, ZCA vẫn chỉ nội bộ.
- §9/§10: cross-tenant, no anon preorder reads, idempotency/locks, Pubu regression trong Task 1/4/5/8/10.
- §12: file test Sprint riêng và gate mỗi task; BL-2C tách file như đã thống nhất.
- Không dùng placeholder OA nhận xác nhận tự động của §6.1 làm điều kiện hoàn thành; quyết định pilot mới tại §8 và spec relay có ưu tiên.
- Không mở lại POS layout/design đang được làm ở nhánh khác. Paths mới trong plan là file dự kiến; paths hiện hữu đã đối chiếu repo. Đối chiếu tên SQL thực trước replace để không tạo overload ngoài ý muốn.
