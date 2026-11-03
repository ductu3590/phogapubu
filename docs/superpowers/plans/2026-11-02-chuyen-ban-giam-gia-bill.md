# Chuyển bàn + Giảm giá bill — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thu ngân POS chuyển được một bàn đang có khách sang bàn trống, và giảm giá cả bill theo VNĐ hoặc %, mà doanh thu báo cáo vẫn khớp tiền thật.

**Architecture:** Chuyển bàn = đổi `session_tables.table_id` tại chỗ trong một RPC + nhật ký `table_session_moves`. Một helper SQL nhận ra "người gọi thuộc phiên đã chuyển khỏi bàn này" và được dùng ở `get_table_session_state`, `create_table_order_batch`, `create_order` để không sinh bill ma. Giảm giá lưu dạng **ý định** trên `table_sessions`, được chia vào `orders.bill_discount_amount` và trừ thẳng vào `orders.total_amount` lúc `close_table_session(paid)`, nên mọi báo cáo đang cộng `total_amount` tự đúng.

**Tech Stack:** Supabase Postgres (plpgsql, RLS), Next.js admin-web (bản có breaking changes — đọc `admin-web/node_modules/next/dist/docs/` trước khi viết), vitest, `node --test` cho test tĩnh migration, Zalo Mini App (React + zustand, vitest node).

**Spec:** [docs/superpowers/specs/2026-11-02-chuyen-ban-giam-gia-bill-design.md](../specs/2026-11-02-chuyen-ban-giam-gia-bill-design.md) — đọc cả spec trước khi làm bất kỳ task nào.

## Global Constraints

- **Hai sprint, dừng giữa chừng:** Sprint CB (Task 1–7) xong → DỪNG, nói anh Tú test theo `docs/testing/chuyen-ban-giam-gia/CB-1.md`, chờ "PASS" rồi mới sang Sprint GG (Task 8–14). Sprint GG xong → DỪNG, test `GG-1.md`. (Quy tắc bắt buộc của CLAUDE.md.)
- Migration đánh số tiếp từ **104**. File có `CREATE OR REPLACE` / vá một RPC **đang chạy** nằm RIÊNG một migration và KHÔNG ghi "rerun-safe".
- Vá hàm đang chạy bằng helper `pg_temp.mevo_patch(sig, from, to)` (mẫu ở `supabase/migrations/093_store_cashier_role.sql` dòng 36–47): `pg_get_functiondef` + `replace` + `EXECUTE`, raise nếu không còn chuỗi cần vá. **Không chép thân hàm từ file cũ** — file migration của `close_table_session`, `create_order`… đã cũ hơn prod. Trước khi viết chuỗi `from`, lấy định nghĩa thật trên prod: `select pg_get_functiondef('public.<fn>(<args>)'::regprocedure);`
- Quyền thao tác POS: `is_store_pos_operator(store_id)` (chủ quán HOẶC thu ngân). RLS đọc: `is_store_scoped_operator(store_id)`. Không cho anon đọc bảng mới.
- Server action: dùng `createClient()` (phiên đăng nhập, để `auth.uid()` ghi được người thao tác), kiểm `isPosRole(operator.role)`, lỗi người dùng **trả `{ ok: false, error }`, không ném**.
- POS đọc định kỳ từ trình duyệt qua `admin-web/lib/pos-browser-reads.ts`; không poll bằng server action.
- Text UI tiếng Việt; chữ nhỏ nhất POS 13px; màu nhấn cam MEVO; màu trạng thái không đổi.
- Mini App: hàm thuần đặt ở `mini-app/src/utils/` (vitest chỉ chạy node). Tham số RPC mới luôn thêm ở CUỐI với `DEFAULT NULL`.
- **Áp migration lên prod:** project Supabase MEVO hiện KHÔNG nằm trong tài khoản MCP của phiên này. Bước "Áp lên prod" = dùng Supabase MCP nếu anh Tú đã kết nối lại; nếu chưa, đưa anh Tú file + lệnh chạy trong SQL Editor và chờ anh báo đã chạy. Không bỏ qua bước kiểm SQL sau khi áp.
- Commit format `feat: …` / `fix: …` / `chore: …`, tiếng Việt.

## Review Focus

1. **Hai máy POS cùng chuyển hai bàn khác nhau vào CÙNG một bàn trống** → đúng một thành công, máy kia nhận "Bàn 12 đang có khách". (Test: Task 1, case `move_race`.)
2. **Chuyển hai lần liên tiếp** (Bàn 3 → 12 → 15): điện thoại chủ phiên vẫn mở QR Bàn 3 phải được đưa tới **Bàn 15**, không phải 12. (Test: Task 2, case `move_chain`.)
3. **App khách bản cũ (chưa `zmp deploy`) gọi món ở bàn cũ** qua `create_table_order_batch` với `p_expected_session_id` = phiên đã chuyển hoặc `NULL` → đơn vào đúng phiên ở bàn mới, không lỗi, không mở phiên mới. (Test: Task 2, case `stale_app_batch`.)
4. **Đặt giảm giá % rồi khách gọi thêm lượt mới trước khi thu** → số giảm tính lại theo tiền hàng mới; giảm VNĐ giữ nguyên. Tạm tính in ra = số thu ngân thấy = số server ghi. (Test: Task 8 `percent recalculates`, Task 10 case `discount_after_new_round`.)
5. **Bill có một đơn đã nhận tiền từ trước** (`payment_received_at` có sẵn) + giảm giá → chỉ trừ trên phần chưa thu; A04 doanh thu ngày = tiền thật nhận. (Test: Task 10 case `discount_skips_paid_order`.)

---

## Sprint CB — Chuyển bàn

### Task 1: Migration 104 — bảng nhật ký, `orders.device_id`, helper nhận diện, RPC chuyển bàn

**Files:**
- Create: `supabase/migrations/104_table_session_moves.sql`
- Create: `supabase/tests/104_table_session_moves.test.mjs`
- Create: `docs/testing/chuyen-ban-giam-gia/sql/cb-verify.sql`

**Interfaces:**
- Produces:
  - Bảng `public.table_session_moves(id uuid pk default gen_random_uuid(), store_id uuid not null → stores, session_id uuid not null → table_sessions on delete cascade, from_table_id uuid not null → tables, to_table_id uuid not null → tables, moved_by uuid not null, moved_at timestamptz not null default now())`; index `(session_id, moved_at)` và `(from_table_id, moved_at desc)`; RLS select `is_store_scoped_operator(store_id)`; `revoke all from anon`; `revoke insert, update, delete from authenticated`.
  - Cột `public.orders.device_id text` (nullable).
  - `public.moved_session_for_caller(p_table_id uuid, p_zalo_user_id text, p_device_id text) RETURNS TABLE(session_id uuid, table_id uuid)` — STABLE, SECURITY DEFINER, `revoke all from public`, chỉ gọi nội bộ (không grant anon/authenticated).
  - `public.pos_move_session_table(p_session_id uuid, p_from_table_id uuid, p_to_table_id uuid) RETURNS jsonb` → `{ok:true, from_table_number, to_table_number}`; grant `authenticated`, revoke `anon`.

- [ ] **Step 1: Viết test tĩnh** `supabase/tests/104_table_session_moves.test.mjs` theo mẫu `supabase/tests/073_reservation_table_ordering.test.mjs` (đọc file SQL, `assert.match`). Các assert:
  - `/CREATE TABLE IF NOT EXISTS public\.table_session_moves/`
  - `/ADD COLUMN IF NOT EXISTS device_id text/`
  - `/FUNCTION public\.pos_move_session_table\(\s*p_session_id uuid,\s*p_from_table_id uuid,\s*p_to_table_id uuid/`
  - `/is_store_pos_operator\(/` trong thân `pos_move_session_table`
  - `/table_has_current_reservation_hold\(p_to_table_id, now\(\)\)/`
  - `/UPDATE public\.session_tables\s+SET table_id = p_to_table_id/`
  - `/UPDATE public\.orders\s+SET table_id = p_to_table_id/`
  - `/UPDATE public\.service_requests/`
  - `/INSERT INTO public\.table_session_moves/`
  - không có chuỗi `rerun-safe`.

- [ ] **Step 2: Chạy test, phải FAIL**
  Run: `node --test supabase/tests/104_table_session_moves.test.mjs`
  Expected: FAIL (file migration chưa tồn tại → ENOENT).

- [ ] **Step 3: Viết migration 104.** `pos_move_session_table` làm đúng thứ tự spec §3.2 bước 1–8. Chi tiết dễ sai:
  - Khoá: `lock_table_for_session(least(from,to))` rồi `lock_table_for_session(greatest(from,to))`, SAU ĐÓ `SELECT … FROM table_sessions WHERE id = p_session_id FOR UPDATE`.
  - Lỗi (tiếng Việt, đúng chữ): `'Bàn % đang có khách'`, `'% đang giữ cho khách đặt trước'` (chèn `table_number`), `'Bàn nguồn không thuộc phiên này'`, `'Không thể chuyển sang chính bàn đó'`, `'Phiên đã đóng'`, `'Không có quyền'`.
  - Yêu cầu gọi NV: cập nhật `table_id` + `table_number` của dòng `service_requests` chưa xử lý thuộc bàn nguồn và cùng `store_id` (đọc mig 050/087 để biết cột đánh dấu "đã xử lý").
  - `moved_session_for_caller`: lấy dòng `table_session_moves` mới nhất có `from_table_id = p_table_id` mà phiên còn `open`, và người gọi khớp: `host_zalo_user_id = p_zalo_user_id` HOẶC `host_device_id = p_device_id` HOẶC tồn tại đơn trong phiên có `zalo_user_id = p_zalo_user_id` hoặc `device_id = p_device_id` (bỏ qua giá trị NULL/rỗng). `table_id` trả về = `to_table_id` nếu còn nằm trong `session_tables` mở của phiên, nếu không thì `table_sessions.table_id` (bàn gốc hiện tại — xử lý chuỗi chuyển nhiều lần).

- [ ] **Step 4: Chạy test, phải PASS**
  Run: `node --test supabase/tests/104_table_session_moves.test.mjs`
  Expected: PASS hết.

- [ ] **Step 5: Viết `docs/testing/chuyen-ban-giam-gia/sql/cb-verify.sql`** — script chạy trong `BEGIN; … ROLLBACK;`, dùng `set_config('request.jwt.claims', …)` giả lập thu ngân Bảo Lương, `RAISE NOTICE 'PASS …'`/`RAISE EXCEPTION 'FAIL …'` cho từng case: `move_basic` (bàn lẻ: session_tables, bàn gốc, orders.table_id đổi; 1 dòng nhật ký), `move_busy_target` (lỗi "đang có khách"), `move_held_target` (lỗi "giữ cho khách đặt"), `move_tray_one_table` (mâm 2 bàn đổi 1 bàn, bàn còn lại giữ nguyên), `move_service_request` (gọi NV đi theo), `move_race` (mô phỏng: chuyển phiên A vào bàn X rồi chuyển phiên B vào X → lỗi).

- [ ] **Step 6: Commit**
  ```bash
  git add supabase/migrations/104_table_session_moves.sql supabase/tests/104_table_session_moves.test.mjs docs/testing/chuyen-ban-giam-gia/sql/cb-verify.sql
  git commit -m "feat: mig 104 chuyển bàn - nhật ký, device_id trên đơn, RPC pos_move_session_table"
  ```

### Task 2: Migration 105 — vá 3 RPC để không sinh bill ma

**Files:**
- Create: `supabase/migrations/105_moved_session_redirect.sql`
- Create: `supabase/tests/105_moved_session_redirect.test.mjs`
- Modify: `docs/testing/chuyen-ban-giam-gia/sql/cb-verify.sql` (thêm case)

**Interfaces:**
- Consumes: `moved_session_for_caller` (Task 1), cột `orders.device_id` (Task 1).
- Produces: `get_table_session_state(...)` trả thêm biến thể `{mode:'postpay', state:'moved', session_id, table_id, table_number}` — kiểm **trước** nhánh `reserved` và trước tra phiên của bàn. Chữ ký 3 hàm KHÔNG đổi.

- [ ] **Step 1: Test tĩnh** `105_moved_session_redirect.test.mjs`: file có `pg_temp.mevo_patch` cho đúng 3 chữ ký `public.get_table_session_state(uuid,text,text)`, `public.create_table_order_batch(uuid,uuid,jsonb,text,uuid,text,text,text,text,uuid)`, `public.create_order(uuid,uuid,jsonb,text,text,text,text,text,text,text,text,text)`; có `'moved'`; có `moved_session_for_caller(`; INSERT orders có `device_id`; không có `CREATE OR REPLACE FUNCTION public.create_order`.
- [ ] **Step 2: Chạy** `node --test supabase/tests/105_moved_session_redirect.test.mjs` → FAIL (chưa có file).
- [ ] **Step 3: Viết migration 105** (chỉ vá tại chỗ, lấy chuỗi neo từ `pg_get_functiondef` trên prod):
  - `get_table_session_state`: ngay sau khi xác định quán là `postpay` (trước `table_has_current_reservation_hold`), nếu `moved_session_for_caller(p_table_id, p_zalo_user_id, p_device_id)` có dòng → `RETURN` biến thể `moved` (kèm `table_number` của bàn hiện tại).
  - `create_table_order_batch`: SAU khối replay `table_order_batch_requests` (để replay so `table_id` gốc vẫn đúng), nếu người gọi khớp `moved_session_for_caller(p_table_id, …)` (bất kể bàn cũ đã có khách mới hay chưa) → đổi bàn làm việc sang `table_id` hiện tại của phiên đó; chấp nhận `p_expected_session_id` là `NULL` hoặc bằng phiên đã chuyển. Bản ghi `table_order_batch_requests` vẫn lưu `p_table_id` gốc.
  - `create_order`: trong KHỐI PHIÊN BÀN, trước `lock_table_for_session(p_table_id)`, nếu khớp `moved_session_for_caller` → `p_table_id :=` bàn hiện tại của phiên. Thêm `device_id` vào câu INSERT orders (giá trị `NULLIF(btrim(p_device_id), '')`).
- [ ] **Step 4: Chạy test tĩnh** → PASS.
- [ ] **Step 5: Thêm case vào `cb-verify.sql`:** `state_moved_host` (chủ phiên hỏi bàn cũ → `state='moved'`, đúng bàn mới), `state_stranger_free` (người lạ hỏi bàn cũ → `free`), `move_chain` (3→12→15, chủ phiên hỏi bàn 3 → bàn 15), `stale_app_batch` (batch ở bàn cũ với expected = phiên đã chuyển → đơn có `session_id` = phiên đó, `table_id` = bàn mới; với expected NULL → như trên), `device_only_member` (mâm, khách chỉ có device id đã gọi món → nhận ra).
- [ ] **Step 6: Commit** `feat: mig 105 không sinh bill ma sau khi chuyển bàn (state moved + chuyển hướng đơn)`.

### Task 3: Áp 104 + 105 lên prod và kiểm

- [ ] **Step 1:** Lấy `pg_get_functiondef` hiện tại của 3 hàm ở Task 2, đối chiếu chuỗi neo trong 105 có mặt NGUYÊN VĂN (nếu không → sửa 105, chạy lại test tĩnh, commit `fix:`).
- [ ] **Step 2:** Áp 104 rồi 105 (MCP `apply_migration` nếu kết nối được; nếu không, đưa anh Tú chạy trong SQL Editor theo đúng thứ tự).
- [ ] **Step 3:** Chạy `cb-verify.sql`. Expected: mọi dòng `PASS`, không có `FAIL`, kết thúc bằng `ROLLBACK`.
- [ ] **Step 4:** `NOTIFY pgrst, 'reload schema';` đã có ở cuối 105 (thêm nếu thiếu).

### Task 4: POS — nút "Chuyển sang bàn trống"

**Files:**
- Create: `admin-web/lib/table-move.ts`, `admin-web/lib/table-move.test.ts`
- Modify: `admin-web/lib/actions/table-session.ts` (thêm action)
- Modify: `admin-web/app/admin/pos/bill-panel.tsx` (`OtherActions`, props `PosBillPanelProps`)
- Modify: `admin-web/app/admin/pos/pos-client.tsx` (nối action, truyền dữ liệu bàn + lịch đặt)

**Interfaces:**
- Consumes: RPC `pos_move_session_table` (Task 1); `reservations` + `now` đã có trong `pos-client.tsx` (cùng nguồn với `prearrivalReservedTableIds`, dòng ~344).
- Produces:
  - `export type MoveTarget = { id: string; table_number: string; area_id: string | null; laterReservationAt: string | null }`
  - `export function moveTargets(freeTables: { id: string; table_number: string; area_id: string | null }[], reservations: ReservationLike[], nowMs: number): MoveTarget[]` — loại bàn đang trong khung giữ (cùng điều kiện với `prearrivalReservedTableIds`: `status==='confirmed' && sessionId===null && arrival-60' <= now < arrival + planningHoldMinutes`); với bàn còn lại, `laterReservationAt` = giờ hẹn `confirmed` sớm nhất **cùng ngày giờ VN** có `arrival-60' > now`, không có thì `null`.
  - `export async function moveSessionTable(sessionId: string, fromTableId: string, toTableId: string): Promise<{ ok: true; from: string; to: string } | { ok: false; error: string }>` trong `lib/actions/table-session.ts`.

- [ ] **Step 1: Test** `admin-web/lib/table-move.test.ts`:
  - `excludes tables inside hold window`: bàn có lịch `confirmed`, `sessionId:null`, arrival = now+30' → không có trong kết quả.
  - `flags later reservation same day`: arrival = now+3h → có, `laterReservationAt` = arrival đó.
  - `ignores tomorrow reservation`: arrival = ngày mai 19:00 (giờ VN) → `laterReservationAt === null`.
  - `ignores arrived reservation`: `sessionId` khác null → không loại, không cảnh báo.
- [ ] **Step 2:** `cd admin-web && npx vitest run lib/table-move.test.ts` → FAIL.
- [ ] **Step 3:** Viết `lib/table-move.ts` và action `moveSessionTable` (mẫu: `addTableToSession` cùng file; thêm kiểm `isPosRole`; trả `from`/`to` = `from_table_number`/`to_table_number`).
- [ ] **Step 4:** `npx vitest run lib/table-move.test.ts` → PASS.
- [ ] **Step 5: UI** trong `OtherActions` (chỉ khi xem một phiên): mục đầu tiên **"Chuyển sang bàn trống"**. Phiên >1 bàn → một `Select` "Bàn cần đổi" trước. Danh sách bàn đích nhóm theo khu (dùng lại cách nhóm của `lib/staff-area-groups.ts` hoặc `table-groups.ts`). Chọn bàn có `laterReservationAt` → hộp xác nhận "Bàn 12 có khách đặt lúc 20:30. Vẫn chuyển?". Thành công → toast `Đã chuyển ${from} → ${to}`, panel giữ nguyên phiên. Lỗi → toast lỗi nguyên văn từ server. Prop mới trong `PosBillPanelProps`: `moveTargets: MoveTarget[]`, `onMoveTable: (sessionId: string, fromTableId: string, toTableId: string) => void`.
- [ ] **Step 6:** `cd admin-web && npx vitest run && npx tsc --noEmit && npm run lint` → không lỗi mới.
- [ ] **Step 7:** Kiểm trên trình duyệt (preview `/admin/pos`, đăng nhập bằng phiên mint theo memory "tự đăng nhập admin khi test"): chuyển một bàn trên quán test, chụp màn hình.
- [ ] **Step 8: Commit** `feat: POS chuyển bàn sang bàn trống (cảnh báo bàn có lịch đặt muộn)`.

### Task 5: A04 — hiện lịch sử chuyển bàn trong ngăn "Xem bill"

**Files:**
- Modify: `admin-web/lib/actions/bill-detail.ts`, `admin-web/lib/bill-detail.ts`, `admin-web/lib/bill-detail.test.ts`
- Modify: `admin-web/app/admin/bills/bill-drawer.tsx`

**Interfaces:**
- Produces: `export type SessionMove = { moved_at: string; from_table: string; to_table: string; moved_by_name: string | null }`; action `getSessionMoves(sessionIds: string[]): Promise<{ ok: true; moves: SessionMove[] } | { ok: false; error: string }>` — đọc `table_session_moves` bằng `createClient()` (RLS) + lọc `store_id = requirePosOperatorStoreId()`, join `tables` 2 lần lấy `table_number`; tên người = `display_name` của operator (mig 101) nếu đọc được, không thì `null`.
- [ ] **Step 1: Test** `parseSessionMoves` trong `bill-detail.test.ts`: dữ liệu thô 2 dòng → sắp theo `moved_at` tăng dần, map đúng `from_table`/`to_table`.
- [ ] **Step 2:** `npx vitest run lib/bill-detail.test.ts` → FAIL.
- [ ] **Step 3:** Viết `parseSessionMoves` + action; trong `bill-drawer.tsx` thêm khối "Chuyển bàn" (mỗi dòng `HH:mm · Bàn 4 → Bàn 12 · <tên>`), chỉ hiện khi có dữ liệu.
- [ ] **Step 4:** Test PASS; `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `feat: A04 hiện lịch sử chuyển bàn trong ngăn Xem bill`.

### Task 6: Mini App — xử lý `state: 'moved'`

**Files:**
- Modify: `mini-app/src/types/order.types.ts` (union `TableSessionState`)
- Create: `mini-app/src/utils/session-moved.ts`, `mini-app/src/utils/session-moved.test.ts`
- Modify: `mini-app/src/app.tsx` (effect trạng thái phiên, dòng ~131–160)

**Interfaces:**
- Consumes: biến thể `moved` (Task 2).
- Produces: `| { mode: "postpay"; state: "moved"; session_id: string; table_id: string; table_number: string }`; `export function movedTableNotice(prevTableNumber: string, st: TableSessionState): { tableId: string; tableNumber: string; message: string } | null` — trả `null` nếu không phải `moved`; `message` = `Bàn của bạn đã chuyển sang ${table_number}`.
- [ ] **Step 1: Test** `session-moved.test.ts`: `moved` → đúng `tableId`, `tableNumber`, `message === "Bàn của bạn đã chuyển sang Bàn 12"`; `owner`/`free`/`prepay` → `null`.
- [ ] **Step 2:** `cd mini-app && npx vitest run src/utils/session-moved.test.ts` → FAIL.
- [ ] **Step 3:** Viết hàm; trong `app.tsx`, khi `refresh()` nhận `moved` → `setTableInfo({ tableId, tableNumber })` + snackbar `message` (dùng snackbar sẵn có của ZaUI như các thông báo khác), KHÔNG `setSessionState(moved)` (effect tự chạy lại với `tableId` mới vì `tableId` nằm trong deps). Kiểm các chỗ đọc `sessionState.state` không vỡ với giá trị mới (`grep -rn "sessionState" mini-app/src`).
- [ ] **Step 4:** `npx vitest run && npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat: Mini App tự chuyển sang bàn mới khi thu ngân chuyển bàn`.

### Task 7: Checklist test tay CB-1 + cập nhật CLAUDE.md — rồi DỪNG

**Files:**
- Create: `docs/testing/chuyen-ban-giam-gia/CB-1.md`
- Modify: `CLAUDE.md` (bảng "Lịch sử quyết định", thêm 1 dòng 2026-11-02 chuyển bàn: đổi `session_tables` tại chỗ + nhật ký; chặn bàn đang giữ đặt bàn; helper `moved_session_for_caller` dùng ở 3 RPC)
- [ ] **Step 1:** Viết CB-1.md theo nếp `docs/testing/staff-pos-fixes/DOT-1.md`, test trên **Bảo Lương**: (1) bàn lẻ chuyển sang bàn trống, (2) bàn đích đang có khách không có trong danh sách, (3) bàn đang trong khung giữ đặt bàn không có trong danh sách, (4) bàn có lịch muộn → hỏi xác nhận, (5) mâm 2 bàn đổi 1 bàn, (6) khách đang mở Mini App bàn cũ → thấy thông báo + gọi món vào bill bàn mới, phiếu in số bàn mới, (7) khách lạ quét QR bàn cũ → bàn trống, (8) gọi nhân viên trước khi chuyển → POS hiện ở bàn mới, (9) A04 hiện dòng chuyển bàn, (10) giới hạn đã biết: bạn cùng nhóm chưa gọi món lần nào mở lại bàn cũ → thấy bàn trống. Ghi rõ phải `git merge origin/main` vào worktree quán + `zmp deploy` (nhắc chọn Development hay Testing) trước bài 6.
- [ ] **Step 2: Commit** `docs: checklist test CB-1 chuyển bàn + ghi quyết định vào CLAUDE.md`.
- [ ] **Step 3: DỪNG.** Nói: *"Xong Sprint CB rồi anh, test theo docs/testing/chuyen-ban-giam-gia/CB-1.md nhé"*. Chờ "PASS".

---

## Sprint GG — Giảm giá bill

### Task 8: Hàm thuần tính và chia giảm giá

**Files:**
- Create: `admin-web/lib/bill-discount.ts`, `admin-web/lib/bill-discount.test.ts`

**Interfaces:**
- Produces:
  - `export type BillDiscount = { type: 'amount' | 'percent'; value: number } | null`
  - `export function discountAmount(subtotal: number, d: BillDiscount): number` — `amount` → `value`; `percent` → `Math.round(subtotal * value / 100)`; `null` → 0. Không cắt bớt (vượt tiền hàng do `validateDiscount` chặn).
  - `export function validateDiscount(subtotal: number, d: BillDiscount): string | null` — lỗi: `'Giảm giá phải là số nguyên không âm'`, `'Phần trăm phải từ 0 đến 100'`, `'Giảm giá lớn hơn tiền hàng — sửa lại giảm giá'`.
  - `export function allocateDiscount(total: number, parts: { id: string; amount: number }[]): Record<string, number>` — chia theo tỉ lệ `amount`, `Math.floor` từng phần, phần dư cộng vào phần có `amount` lớn nhất (hoà thì `id` nhỏ nhất theo so sánh chuỗi). Tổng kết quả === `total`.
- [ ] **Step 1: Test** (giá trị cụ thể):
  - `discountAmount(155000, {type:'percent', value:10}) === 15500`
  - `discountAmount(155000, {type:'amount', value:5000}) === 5000`
  - `percent recalculates`: `discountAmount(200000, {type:'percent', value:10}) === 20000`
  - `validateDiscount(100000, {type:'amount', value:120000})` === chuỗi "lớn hơn tiền hàng"
  - `validateDiscount(100000, {type:'percent', value:101})` === "Phần trăm phải từ 0 đến 100"; `value: 12.5` → "số nguyên"
  - `allocateDiscount(10000, [{id:'a',amount:30000},{id:'b',amount:70000}])` → `{a:3000,b:7000}`
  - `allocateDiscount(10001, [{id:'a',amount:1},{id:'b',amount:1},{id:'c',amount:1}])` → tổng 10001, phần dư vào `'a'`.
- [ ] **Step 2:** `cd admin-web && npx vitest run lib/bill-discount.test.ts` → FAIL.
- [ ] **Step 3:** Viết `lib/bill-discount.ts`.
- [ ] **Step 4:** Test → PASS.
- [ ] **Step 5: Commit** `feat: hàm tính và chia giảm giá bill`.

### Task 9: Migration 107 — schema giảm giá + RPC đặt giảm giá

**Files:**
- Create: `supabase/migrations/107_bill_discount.sql`, `supabase/tests/107_bill_discount.test.mjs`
- Create: `docs/testing/chuyen-ban-giam-gia/sql/gg-verify.sql`

**Interfaces:**
- Produces:
  - `table_sessions`: `bill_discount_type text check (bill_discount_type in ('amount','percent'))`, `bill_discount_value integer check (bill_discount_value >= 0)`, `bill_discount_set_by uuid`, `bill_discount_set_at timestamptz`; check: type và value cùng NULL hoặc cùng có; percent ≤ 100.
  - `orders.bill_discount_amount integer not null default 0 check (>= 0)`.
  - Bảng `table_session_discount_changes(id, store_id, session_id, old_type, old_value, new_type, new_value, changed_by uuid not null, changed_at timestamptz default now())` — RLS như `table_session_moves`.
  - `public.bill_discount_amount(p_subtotal bigint, p_type text, p_value integer) RETURNS bigint` IMMUTABLE — cùng phép tính `discountAmount` (Task 8): percent dùng `round(p_subtotal * p_value / 100.0)`.
  - `public.session_unpaid_subtotal(p_session_id uuid) RETURNS bigint` — `sum(total_amount)` đơn `status <> 'cancelled' AND payment_received_at IS NULL`.
  - `public.pos_set_session_discount(p_session_id uuid, p_type text, p_value integer) RETURNS jsonb` — `p_type IS NULL OR p_value = 0` = bỏ giảm giá; quyền `is_store_pos_operator`; phiên `open`; kiểm như `validateDiscount`; ghi nhật ký; trả `{ok, subtotal, discount}`.
  - `public.pos_set_sessions_discount(p_session_ids uuid[], p_type text, p_value integer) RETURNS jsonb` — percent: cùng % cho mọi phiên; amount: chia theo `session_unpaid_subtotal` bằng đúng thuật toán `allocateDiscount` (dư vào phiên lớn nhất, hoà thì id nhỏ nhất), lưu mỗi phiên dạng `amount`; khoá phiên theo id tăng dần; một giao dịch.
- [ ] **Step 1: Test tĩnh**: có 2 `ADD COLUMN`, bảng nhật ký, 4 hàm với đúng chữ ký trên, `is_store_pos_operator(` trong 2 RPC, `'Giảm giá lớn hơn tiền hàng — sửa lại giảm giá'`.
- [ ] **Step 2:** `node --test supabase/tests/107_bill_discount.test.mjs` → FAIL.
- [ ] **Step 3:** Viết migration 107 (toàn hàm MỚI, không vá hàm sống).
- [ ] **Step 4:** Test tĩnh → PASS.
- [ ] **Step 5:** `gg-verify.sql` (BEGIN…ROLLBACK) case: `set_percent`, `set_amount_over_subtotal` (lỗi), `clear_discount`, `combined_amount_split` (2 phiên 30k/70k, giảm 10.001 → 3.000 / 7.001), `log_written`.
- [ ] **Step 6: Commit** `feat: mig 107 giảm giá bill - ý định trên phiên + RPC đặt giảm giá`.

### Task 10: Migration 108 — vá RPC sống cho giảm giá; áp prod

**Files:**
- Create: `supabase/migrations/108_bill_discount_patch_rpcs.sql`, `supabase/tests/108_bill_discount_patch_rpcs.test.mjs`
- Modify: `docs/testing/chuyen-ban-giam-gia/sql/gg-verify.sql`

**Interfaces:**
- Consumes: Task 9.
- Produces (chữ ký KHÔNG đổi, chỉ thêm trường JSON):
  - `close_table_session(paid)`: trước UPDATE ghi `payment_received_*`, nếu `close_reason` của phiên khác `'expired'` và có ý định giảm giá → `v_sub := session_unpaid_subtotal`, `v_disc := bill_discount_amount(...)`; nếu `v_disc > v_sub` → `RAISE EXCEPTION 'Giảm giá lớn hơn tiền hàng — sửa lại giảm giá'`; chia `v_disc` vào các đơn chưa thu (thuật toán Task 8, theo `total_amount`, hoà thì `id` nhỏ nhất), `UPDATE orders SET bill_discount_amount = share, total_amount = total_amount - share, payment_amount = total_amount - share`. Trả `total` sau giảm.
  - `recompute_order_total`: `total_amount = v_total - bill_discount_amount`, `payment_amount` như vậy.
  - `merge_session_into_tray`: xoá ý định giảm giá của phiên nguồn (ghi nhật ký `new_type NULL`).
  - `list_open_table_sessions`: mỗi phiên thêm `bill_discount_type`, `bill_discount_value`.
  - `get_sessions_bill`: mỗi session thêm `discount` (phiên mở: tính từ ý định trên `subtotal` chưa thu; phiên đã thu: `sum(bill_discount_amount)`), `discount_label` (`'10%'` hoặc `null`); `grand_total` = sau giảm; thêm `grand_discount`.
  - `get_bills_report`: `discount_total` cộng `bill_discount_amount`; mỗi bill thêm `bill_discount`.
  - `get_table_session_bill` + `get_table_session_state(owner)`: thêm `bill_discount` (số tiền, tính như `get_sessions_bill`).
- [ ] **Step 1: Test tĩnh**: có `mevo_patch` cho đúng 8 chữ ký (lấy chữ ký thật trên prod bằng `pg_get_function_identity_arguments`), có chuỗi lỗi giảm giá trong vá `close_table_session`, có `'expired'`, không có `CREATE OR REPLACE FUNCTION public.close_table_session`.
- [ ] **Step 2:** → FAIL. **Step 3:** viết 108 với chuỗi neo lấy từ `pg_get_functiondef` prod. **Step 4:** → PASS.
- [ ] **Step 5:** Thêm vào `gg-verify.sql`: `pay_with_percent` (tổng thu = tiền hàng − giảm, các đơn có `bill_discount_amount` cộng = số giảm), `discount_after_new_round` (thêm lượt sau khi đặt % → số giảm theo tiền mới), `discount_skips_paid_order`, `void_after_amount_blocks_pay` (lỗi khi thu), `expired_ignores_discount`, `merge_drops_source_discount`, `bulk_pay_split`, `bills_report_revenue` (doanh thu = tổng `total_amount` sau giảm, `discount_total` gồm giảm giá bill), `recompute_keeps_discount`.
- [ ] **Step 6:** Áp 107 + 108 lên prod (như Task 3), chạy `gg-verify.sql` → toàn `PASS`.
- [ ] **Step 7: Commit** `feat: mig 108 trừ giảm giá bill lúc thu tiền + trả giảm giá cho POS, in, A04, Mini App`.

### Task 11: POS — hộp "Giảm giá hoá đơn"

**Files:**
- Modify: `admin-web/lib/actions/table-session.ts` (types + 2 action)
- Create: `admin-web/app/admin/pos/discount-dialog.tsx`
- Modify: `admin-web/app/admin/pos/bill-panel.tsx` (`PaymentView`, tổng bill tab, `OtherActions` cảnh báo khi nhập vào mâm), `admin-web/app/admin/pos/pos-client.tsx`

**Interfaces:**
- Consumes: `discountAmount`, `validateDiscount` (Task 8); RPC Task 9; trường mới của `list_open_table_sessions` (Task 10).
- Produces: `OpenTableSession` thêm `bill_discount_type: 'amount' | 'percent' | null`, `bill_discount_value: number | null`; `setSessionDiscount(sessionId: string, d: BillDiscount): Promise<SimpleResult>`; `setSessionsDiscount(sessionIds: string[], d: BillDiscount): Promise<SimpleResult>`.
- [ ] **Step 1: Test** thêm vào `bill-discount.test.ts`: `sessionDiscountOf(session)` (hàm mới trong `bill-discount.ts`) đổi `{bill_discount_type:'percent', bill_discount_value:10}` → `{type:'percent', value:10}`, cả hai null → `null`; `combinedDiscount(sessions)` = tổng `discountAmount` từng phiên.
- [ ] **Step 2–4:** FAIL → viết → PASS (`npx vitest run lib/bill-discount.test.ts`).
- [ ] **Step 5: UI.** `PaymentView`: giữa "Món đã dùng" và "Tổng thanh toán" thêm 3 dòng **Tổng tiền hàng · Giảm giá (bấm được, kèm "10%" nếu là %) · Khách cần trả**; `total` truyền vào `cashSuggestions`/`cashChange`/nút xác nhận = *Khách cần trả*. Lỗi `validateDiscount` khác null → khoá nút thu + hiện chữ lỗi đỏ. `DiscountDialog` (dùng `Dialog` dùng chung, như `QtyDialog`): tiêu đề "Giảm giá hoá đơn", nút chuyển `VNĐ`/`%`, một `Input` (VNĐ dùng `formatVndInput`/`parseVnd` của `lib/cash-change.ts` — nhớ bẫy `Number('80.000')`), dòng "Giảm: 15.500đ" xem trước, nút **Bỏ giảm giá** / **Bỏ qua** / **Lưu**. Gộp bill (`list.length > 1`) → gọi `setSessionsDiscount`. Màn bill (trước Thanh toán) hiện dòng giảm giá nếu có. `OtherActions` "Nhập vào mâm khác" khi phiên có giảm giá → `confirm` "Giảm giá của bàn này sẽ bị bỏ — đặt lại ở mâm đích".
- [ ] **Step 6:** `npx vitest run && npx tsc --noEmit && npm run lint`; kiểm trên preview `/admin/pos`: đặt 10% → số đúng, sửa → bỏ → thu; chụp màn hình.
- [ ] **Step 7: Commit** `feat: POS giảm giá hoá đơn VNĐ/% ở màn thanh toán`.

### Task 12: Phiếu in + A04

**Files:**
- Modify: `admin-web/lib/actions/table-session.ts` (`BillSession.discount`, `discount_label`; `SessionsBill.grand_discount`)
- Modify: `admin-web/app/print/bill/print-bill.tsx`, `print-bill.test.tsx`
- Modify: `admin-web/lib/bills-report.ts` (+ test), `admin-web/app/admin/bills/bill-drawer.tsx`, `admin-web/lib/bills-report-xlsx.ts` (+ test), `admin-web/app/print/day-report/day-report-slip.tsx`
- [ ] **Step 1: Test** `print-bill.test.tsx`: bill có `discount: 15500, discount_label: '10%'` → in dòng `Giảm giá (10%)` và `-15.500`; `discount: 0` → không có chữ "Giảm giá". `bills-report.test.ts`: `parseBillsReport` giữ `bill_discount`. `bills-report-xlsx.test.ts`: có cột "Giảm giá bill".
- [ ] **Step 2–4:** FAIL → sửa → PASS (`npx vitest run app/print/bill lib/bills-report.test.ts lib/bills-report-xlsx.test.ts`).
- [ ] **Step 5:** Ngăn Xem bill hiện dòng "Giảm giá"; in báo cáo cuối ngày hiện tổng giảm giá (đã nằm trong `discount_total`, chỉ cần đổi nhãn nếu đang ghi "Voucher").
- [ ] **Step 6: Commit** `feat: in và báo cáo hiện giảm giá bill`.

### Task 13: Mini App — dòng giảm giá ở tab Đơn gọi

**Files:**
- Modify: `mini-app/src/types/order.types.ts` (`TableSessionState` owner + `TableSessionBill`: `bill_discount?: number`)
- Create: `mini-app/src/utils/bill-total.ts`, `bill-total.test.ts`
- Modify: `mini-app/src/pages/session-orders/index.tsx`
- Produces: `export function billTotals(subtotal: number, billDiscount: number | undefined): { subtotal: number; discount: number; payable: number }`.
- [ ] **Step 1: Test:** `billTotals(155000, 15500)` → `{subtotal:155000, discount:15500, payable:139500}`; `undefined` → discount 0 (server cũ).
- [ ] **Step 2–4:** FAIL → viết + hiện dòng "Giảm giá" và "Tạm tính sau giảm" ở thẻ tổng của tab Đơn gọi khi `discount > 0` → PASS (`cd mini-app && npx vitest run && npm run typecheck`).
- [ ] **Step 5: Commit** `feat: Mini App hiện giảm giá bill ở tab Đơn gọi`.

### Task 14: Checklist test tay GG-1 + CLAUDE.md — rồi DỪNG

**Files:**
- Create: `docs/testing/chuyen-ban-giam-gia/GG-1.md`
- Modify: `CLAUDE.md` (1 dòng 2026-11-02: giảm giá bill lưu ý định trên phiên, chia vào `orders.bill_discount_amount` + trừ `total_amount` lúc thu → báo cáo tự đúng; không lý do; phiên hết hạn bỏ qua; nhập mâm bỏ giảm giá nguồn)
- [ ] **Step 1:** GG-1.md trên Bảo Lương: (1) giảm 10% → tạm tính in dòng giảm, (2) giảm VNĐ, sửa, bỏ, (3) gợi ý tiền khách đưa theo số sau giảm, (4) bỏ món sau khi giảm VNĐ lớn → không cho thu, (5) đặt % rồi khách gọi thêm → số giảm tăng theo, (6) gộp 2 mâm giảm VNĐ → hoá đơn tổng đúng, A04 mỗi mâm đúng phần, (7) thu xong → A04 doanh thu = tiền thật, cột giảm giá đúng, Excel + in báo cáo ngày, (8) nhập bàn có giảm giá vào mâm → cảnh báo + giảm giá mất, (9) Mini App tab Đơn gọi hiện giảm giá, (10) thu ngân (không phải chủ quán) làm được hết.
- [ ] **Step 2: Commit** `docs: checklist test GG-1 giảm giá bill + ghi quyết định vào CLAUDE.md`.
- [ ] **Step 3: DỪNG.** Nói: *"Xong Sprint GG rồi anh, test theo docs/testing/chuyen-ban-giam-gia/GG-1.md nhé"*. Chờ "PASS". Sau PASS mới bàn chuyện merge `main` + `zmp deploy`.

---

## Sprint CB-2 — Bổ sung sau CB-1 PASS (2026-11-03, anh Tú duyệt trong chat)

Hai yêu cầu của anh Tú sau khi test CB-1: (a) xác nhận "bàn có lịch đặt muộn" phải là **hộp thoại trong app**, không phải `confirm()` của trình duyệt — đổi luôn hộp "Bỏ bàn (không thu tiền)" cho đồng bộ; (b) **chuyển cả mâm (N bàn) sang MỘT bàn trống** (vd mâm Bàn 6 + Bàn 7 → Bàn 13). Đích luôn là bàn TRỐNG; dồn vào mâm đang có khách vẫn dùng "Nhập vào mâm khác". Chỉ làm N → 1. Migration chuyển cả mâm là **106** (giảm giá dời 107/108). Chạy trước Sprint GG; xong thì DỪNG chờ test CB-2.

### Task 15: Migration 106 — RPC chuyển cả mâm sang một bàn

**Files:**
- Create: `supabase/migrations/106_move_tray_to_one_table.sql`, `supabase/tests/106_move_tray_to_one_table.test.mjs`
- Create: `docs/testing/chuyen-ban-giam-gia/sql/cb2-verify.sql`

**Interfaces:**
- Consumes: bảng `table_session_moves`, helper `moved_session_for_caller`, `lock_table_for_session`, `table_has_current_reservation_hold`, `is_store_pos_operator` (mig 104 — đọc file 104 để theo đúng nếp: khoá, lỗi, service_requests, revoke).
- Produces: `public.pos_move_session_to_table(p_session_id uuid, p_to_table_id uuid) RETURNS jsonb` → `{ok:true, from_table_numbers text (vd "Bàn 6, Bàn 7"), to_table_number text, tables_moved int}`; grant `authenticated`, revoke `PUBLIC, anon`. Hàm MỚI (không vá hàm sống).

Hành vi (một giao dịch):
1. Khoá: lấy danh sách bàn đang mở của phiên + bàn đích, `lock_table_for_session` theo `table_id` tăng dần cho TẤT CẢ, rồi `FOR UPDATE` phiên. Quyền `is_store_pos_operator` kiểm trước khi khoá (như 104).
2. Kiểm: phiên `open`; đích cùng quán, `is_active`, KHÔNG thuộc phiên này và `open_session_id_for_table(đích) IS NULL` (lỗi `'% đang có khách'`), không trong khung giữ (`'% đang giữ cho khách đặt trước'`).
3. `session_tables`: giữ đúng MỘT dòng mở của phiên và đổi `table_id` thành đích; XOÁ các dòng mở còn lại của phiên (lịch sử nằm ở `table_session_moves`). Unique index `session_tables_one_open_per_table` là chốt chặn cuối.
4. `table_sessions.table_id` (bàn gốc) = đích; `is_open_ordering` GIỮ NGUYÊN (mâm vẫn là mâm mở dù chỉ còn 1 bàn); `last_activity_at = now()`.
5. `orders.table_id` của phiên thuộc các bàn cũ → đích.
6. `service_requests` chưa xử lý của các bàn cũ (theo đúng điều kiện 104) → đích; nếu dồn về làm trùng unique index "một yêu cầu mở / bàn / loại" thì giữ yêu cầu MỚI NHẤT, các yêu cầu trùng còn lại đánh dấu đã xử lý (cùng cột 104 dùng) — không để lỗi tiếng Anh.
7. Ghi MỖI bàn cũ một dòng `table_session_moves(from = bàn cũ, to = đích)`.
8. Phiên chỉ có 1 bàn → vẫn chạy được (tương đương chuyển một bàn).

- [ ] **Step 1: Test tĩnh** (mẫu `104_table_session_moves.test.mjs`): có `FUNCTION public.pos_move_session_to_table(\s*p_session_id uuid,\s*p_to_table_id uuid`; `is_store_pos_operator(`; `table_has_current_reservation_hold(`; `DELETE FROM public.session_tables`; `INSERT INTO public.table_session_moves`; `REVOKE ALL ON FUNCTION public.pos_move_session_to_table(uuid, uuid) FROM PUBLIC, anon`; không có `rerun-safe`; không có `CREATE OR REPLACE FUNCTION public.create_order`.
- [ ] **Step 2:** `node --test supabase/tests/106_move_tray_to_one_table.test.mjs` → FAIL.
- [ ] **Step 3:** Viết 106.
- [ ] **Step 4:** → PASS (chạy kèm test 104, 105).
- [ ] **Step 5:** `cb2-verify.sql` (BEGIN…ROLLBACK, fixture lỗi phải `RAISE 'FAIL …'`, mẫu `cb-verify.sql`): `tray_to_one` (mâm 2 bàn → 1 bàn: còn đúng 1 dòng session_tables mở = đích, bàn gốc = đích, `is_open_ordering` vẫn true, đơn của cả 2 bàn cũ có `table_id` = đích, 2 dòng nhật ký, 2 bàn cũ trống), `tray_to_one_busy` (đích có khách → lỗi), `tray_to_one_own_table` (đích là một bàn của chính mâm → lỗi "đang có khách"), `tray_to_one_held` (lỗi giữ đặt bàn), `tray_to_one_redirect` (khách đã gọi ở bàn cũ thứ 2 → `get_table_session_state(bàn cũ 2)` trả `moved` về đích), `tray_to_one_service_dupe` (2 bàn cũ cùng có yêu cầu gọi NV mở → còn đúng 1 yêu cầu mở ở đích, không lỗi), `single_table_session` (phiên 1 bàn → chạy như chuyển 1 bàn), `privileges` (anon không gọi được, authenticated gọi được).
- [ ] **Step 6: Commit** `feat: mig 106 chuyển cả mâm sang một bàn trống`.

### Task 16: POS — hộp thoại trong app + chế độ "Chuyển cả mâm sang một bàn"

**Files:**
- Create: `admin-web/app/admin/pos/confirm-dialog.tsx` (hộp thoại xác nhận dùng lại `Dialog` chung, như `QtyDialog` trong `bill-panel.tsx`)
- Modify: `admin-web/lib/actions/table-session.ts` (action mới), `admin-web/app/admin/pos/bill-panel.tsx` (`MoveTableControl`), `admin-web/app/admin/pos/pos-client.tsx` (`onMoveTable`, `onReset` — bỏ `window.confirm`), `admin-web/lib/table-move.ts` (+ test) nếu cần hàm thuần cho nội dung hộp thoại.

**Interfaces:**
- Consumes: RPC `pos_move_session_to_table` (Task 15); `laterReservationConfirmText` / `moveTargets` (đã có trong `lib/table-move.ts`).
- Produces: `moveSessionToTable(sessionId: string, toTableId: string): Promise<{ ok: true; from: string; to: string } | { ok: false; error: string }>` (kiểm `isPosRole`, `createClient()`, trả lỗi không ném — như `moveSessionTable`). Hộp thoại: `ConfirmDialog({ open, title, description, confirmLabel, tone?: 'default' | 'danger', busy, onConfirm, onCancel })`.

- [ ] **Step 1: Test** `lib/table-move.test.ts`: hàm thuần `laterReservationDialog(tableNumber, arrivalAt)` → `{ title: 'Bàn 16 có khách đặt lúc 21:00', description: 'Từ 20:00 khách không tự gọi món qua QR được.' }` (giờ VN; dùng lại logic `laterReservationConfirmText`, bỏ hàm cũ nếu không còn chỗ dùng).
- [ ] **Step 2–4:** FAIL → viết → PASS (`cd admin-web && npx vitest run lib/table-move.test.ts`).
- [ ] **Step 5: UI.**
  - Mọi chỗ `window.confirm` của luồng chuyển bàn và "Bỏ bàn (không thu tiền)" → `ConfirmDialog` trong app. Chuyển bàn: nút **Huỷ** / **Vẫn chuyển** (cam). Bỏ bàn: giữ nguyên câu chữ của confirm cũ làm nội dung, nút **Huỷ** / **Bỏ bàn** (tone danger). Huỷ thì không làm gì, ô chọn trở về trống.
  - `MoveTableControl` khi phiên có ≥2 bàn: hai lựa chọn rõ ràng **"Đổi một bàn"** (luồng hiện có) và **"Chuyển cả mâm sang một bàn"** (chọn bàn đích từ cùng danh sách `moveTargets` → gọi `moveSessionToTable`). Phiên 1 bàn: giữ nguyên như hiện tại, không hiện lựa chọn mới.
  - Thành công → toast thành công như hiện có: `Đã chuyển ${from} → ${to}` (from có thể là "Bàn 6, Bàn 7"). Lỗi → lỗi nguyên văn từ server.
- [ ] **Step 6:** `npx vitest run && npx tsc --noEmit && npx eslint <file đã sửa>`.
- [ ] **Step 7: Commit** `feat: POS hộp thoại xác nhận trong app + chuyển cả mâm sang một bàn`.

### Task 17: Áp 106 lên prod + checklist CB-2 + CLAUDE.md — rồi DỪNG

**Files:**
- Create: `docs/testing/chuyen-ban-giam-gia/CB-2.md`
- Modify: `CLAUDE.md` (thêm 1 dòng 2026-11-03: chuyển cả mâm N→1 bằng `pos_move_session_to_table`, xoá dòng `session_tables` thừa, mâm vẫn mở; xác nhận dùng hộp thoại trong app)
- [ ] **Step 1:** Như Task 3: kiểm `list_migrations` (chưa có 106), chạy thử 106 + `cb2-verify.sql` trong BEGIN…ROLLBACK, xác nhận không còn gì sót lại, rồi `apply_migration` tên theo nếp (`106_move_tray_to_one_table`), chạy lại `cb2-verify.sql`, kiểm quyền.
- [ ] **Step 2:** CB-2.md trên Bảo Lương (cùng nếp CB-1: điện thoại khác cho "khách lạ", bàn riêng từng bài, bước Dọn): (1) bàn có lịch muộn → hộp thoại trong app (không còn khung của Windows), Huỷ → không chuyển, Vẫn chuyển → chuyển; (2) Bỏ bàn → hộp thoại trong app; (3) mâm 2 bàn → "Chuyển cả mâm sang một bàn" → còn 1 bàn, 2 bàn cũ trống, bill nguyên vẹn, khách trong mâm vẫn gọi thêm được; (4) khách đã gọi món ở bàn cũ thứ hai mở app → thấy "đã chuyển sang Bàn X", gọi món vào đúng bill; (5) A04 hiện 2 dòng chuyển bàn; (6) đích là bàn đang có khách / đang giữ đặt bàn → không có trong danh sách.
- [ ] **Step 3: Commit** `docs: checklist CB-2 + ghi quyết định chuyển cả mâm vào CLAUDE.md`.
- [ ] **Step 4: DỪNG** — controller cho review cả đợt CB-2, rồi nói: *"Xong CB-2 rồi anh, test theo docs/testing/chuyen-ban-giam-gia/CB-2.md nhé"*.
