# RACE — Test tranh chấp nhiều kết nối cho các RPC tiền (2026-11-11)

Mọi test trong `supabase/tests/*.test.mjs` chạy trên PGlite **một kết nối**, nên chưa có gì kiểm chuyện hai thu
ngân bấm cùng lúc. Bộ này chạy trên **Postgres thật trong Docker**, mỗi "người" là một kết nối riêng, để khoá dòng
(`FOR UPDATE` / `FOR SHARE`), advisory lock và unique index hoạt động đúng như prod.

⛔ Không đụng prod: script tự dựng một container tạm trên `127.0.0.1` (cổng ngẫu nhiên, mật khẩu ngẫu nhiên) và
không nhận chuỗi kết nối từ ngoài.

## Cách chạy

Cần Docker Desktop đang chạy và đã `npm install` trong `admin-web/` (`pg` là devDependency).

```bash
cd admin-web && npm run test:race          # hoặc từ gốc repo: node scripts/test-race.mjs
```

| Lệnh | Việc |
|---|---|
| `node scripts/test-race.mjs` | Dựng container tạm → nạp toàn bộ `supabase/migrations/*` → chạy 4 file test → **xoá container** (kể cả khi đỏ / Ctrl+C) |
| `node scripts/test-race.mjs --keep` | Như trên nhưng giữ container, in tên + chuỗi kết nối để soi tay |
| `node scripts/test-race.mjs --reuse <tên>` | Chạy lại test trên container đã giữ (tên phải bắt đầu `mevo-race-`), không nạp lại migration |
| `node scripts/test-race.mjs -- --test-name-pattern="2b"` | Truyền tham số cho `node --test` |
| `RACE_ITERATIONS=100 node scripts/test-race.mjs` | Số vòng lặp mỗi kịch bản "tự nhiên" (mặc định 25) |

`node --test "supabase/tests/race/*.test.mjs"` chạy trực tiếp thì cả 40 test **tự bỏ qua** (thiếu biến môi trường
do script cấp) — cố ý, để ai quét cả thư mục `supabase/tests` không bị đỏ.

### Cách dựng schema (và các chỗ phải lách trong harness)

Dựng bằng **replay toàn bộ migration** trên ảnh `public.ecr.aws/supabase/postgres:17.11.0.004` (có sẵn role
`anon` / `authenticated` / `service_role`, schema `auth`, publication `supabase_realtime`): `psql -f` từng file,
role `postgres`, thứ tự `LC_ALL=C`, dừng ở lỗi đầu tiên. Không file migration nào bị sửa. Ba chỗ harness phải lách:

1. **CRLF của Windows.** "Đúng từng byte" là byte ĐÃ COMMIT. Máy này `core.autocrlf=true` nên 134/137 file trong
   thư mục làm việc bị git đổi LF → CRLF lúc checkout; nạp nguyên như vậy thì mig 115 RAISE
   (`staff_create_order … không còn chuỗi cần vá`) vì chuỗi neo nhiều dòng mang `\r\n` trong khi thân hàm do
   `103b` (file `-text`, giữ nguyên byte) tạo ra là `\n`. Script hỏi `git check-attr text`: file `-text` giữ nguyên
   byte, file còn lại đổi CRLF → LF (đúng phép biến đổi git làm khi commit), rồi so SHA-1 với blob trong index và
   cảnh báo file nào lệch (đang sửa dở / file mới chưa add).
2. **`auth.uid()` của ảnh trần** (không có GoTrue) đọc `request.jwt.claim.sub`; PostgREST mới chỉ đặt
   `request.jwt.claims`. Mỗi kết nối test đặt **cả hai** rồi `SET ROLE authenticated` (hoặc `anon`).
3. **Dữ liệu mẫu ghi thẳng bằng role `postgres`** (quán, người dùng, bàn, phiên, đơn, khách nợ, hàng kho). Mọi thao
   tác được đem ra tranh chấp đều đi qua RPC thật dưới role `authenticated` / `anon`.

Không cần tạo thêm extension / publication nào: ảnh đã đủ cho cả 138 file (tới `131_auto_kitchen_print_server.sql`).

## Mỗi kịch bản chứng minh điều gì

Hai kiểu test:
- **Tự nhiên**: N lời gọi song song, mỗi lời trễ ngẫu nhiên 0–4 ms, lặp `RACE_ITERATIONS` vòng (mặc định 25).
- **Dựng xen kẽ**: ép đúng một thứ tự bằng `BEGIN … COMMIT/ROLLBACK` tường minh, hoặc bằng **rào chắn** — một kết
  nối giữ `FOR UPDATE` trên dòng `stores` (đúng khoá `set_require_cash_shift` giữ ở prod). `collect_table_bill`
  khoá phiên ở bước 2 rồi mới đụng dòng quán ở bước 9, nên dựng rào là "đóng băng" được lần thu ở đúng chỗ đã giữ
  khoá phiên mà chưa ghi gì. Test chờ tới khi `pg_stat_activity` báo kết nối kia đang đứng chờ khoá rồi mới đi tiếp.

Sau mỗi test, `assertClean` kiểm ba thứ cho cả quán của test đó (mỗi test một quán riêng):
1. **Bất biến tiền** (`helpers.mjs → audit`, 15 câu soát): khoản thu = tổng dòng phương tiện = tổng các đơn gắn vào
   nó; phiên đã thu không còn đơn chưa thu; phiên chưa thu không dính khoản thu; tổng đơn = tổng dòng món; mỗi quán
   tối đa một ca mở; **két dự kiến ĐÃ LƯU của ca đã kết = số tính lại bây giờ** (không khoản nào lọt vào sau khi
   kết); quán bật ca thì mọi khoản tiền mặt đều gắn ca; phân bổ trả nợ không vượt số nợ; số phiếu kho khớp bộ đếm;
   phiếu nhập đã trả có đúng một phiếu chi.
2. **Không deadlock**: không lời gọi nào nhận SQLSTATE `40P01`.
3. **Không lỗi "bẩn"**: lỗi trả về người gọi phải là lỗi nghiệp vụ có câu chữ (`P0001`), không phải
   `unique_violation` trần, timeout…

| # | File | Kịch bản | Chứng minh |
|---|---|---|---|
| 1a | `01-collect-table-bill` | Hai thu ngân thu cùng một bàn, **khác** mã chống trùng (tự nhiên + 2 xen kẽ: máy 1 commit / rollback) | Đúng một `bill_payments`, phiên đóng một lần; bên thua nhận `already: true` kèm đúng khoản **đã ghi** của bên thắng; máy 1 rollback thì máy 2 thu trọn |
| 1b | | **Cùng** mã gửi hai lần song song; cùng mã cho **hai bàn khác nhau** | Một khoản thu, lần kia `already`; hai bàn: một bàn thu được, bàn kia nhận "Mã thu tiền đã dùng cho bill khác" và còn mở |
| 1c | | Thu tiền ‖ thêm món vào cùng phiên, 3 đường: `pos_add_manual_items`, `create_order` (khách), `staff_create_order` (nhân viên) — tự nhiên (xen kẽ số cũ / số đã gồm món mới) + xen kẽ có rào | Hoặc lần thu thất bại "Số tiền không khớp bill", hoặc món vào trước và được tính; **không bao giờ phiên đã thu còn đơn chưa thu** |
| 1d | | Gộp `[A,B]` ‖ thu lẻ `A`; ba lần gộp chéo `[A,B]` ‖ `[B,C]` ‖ `[C,A]` (id truyền ngược thứ tự) | Đúng một khoản thu; bên thua nhận `already` hoặc "Có mâm vừa được thu ở máy khác"; không deadlock nhờ khoá phiên theo id tăng dần |
| 1e | | *(thêm ngoài đề bài)* Thu tiền ‖ sửa bill: `pos_void_order_item`, `pos_set_order_item_quantity` — tự nhiên + xen kẽ có rào | Bất biến tiền giữ; không deadlock |
| 2a | `02-cash-shift` | Ba người `open_cash_shift` cùng lúc | Đúng một ca mở; hai bên kia nhận "Đã có ca đang mở" |
| 2b | | `collect_table_bill` tiền mặt ‖ `close_cash_shift` (tự nhiên + 3 xen kẽ: thu trước / kết ca trước / kết ca rollback) | Khoản thu gắn ca và **nằm trong két đã lưu**, hoặc bị từ chối "Chưa mở ca" (phiên còn mở, không có khoản thu) |
| 2c | | `cash_book_create` (tiền mặt tại két) ‖ `close_cash_shift` (+ xen kẽ, + cùng mã gửi hai lần) | Như 2b cho phiếu chi; cùng mã → một phiếu, lần kia `already` |
| 2d | | `cash_book_void` ‖ `close_cash_shift` | Phiếu huỷ kịp thì két không trừ; không kịp thì "Ca của phiếu này đã kết" và két vẫn trừ |
| 2e | | Phiếu nhập kho trả tiền mặt (mig 122b) ‖ `close_cash_shift` | Phiếu chi tự sinh nằm trong két đã lưu, hoặc **cả phiếu nhập** bị từ chối (không để lại phiếu, không đốt số phiếu) |
| 3a | `03-debt` | Hai `debt_collect` cùng một khách: mỗi máy 100% / 60% / 50% số nợ (tự nhiên + 2 xen kẽ + cùng mã) | Tổng phân bổ không vượt nợ; 100% và 60%: một máy được, máy kia "Số tiền trả vượt số nợ: còn nợ …"; 50%: cả hai được |
| 3b | | `debt_collect` ‖ `debt_payment_void` lần trả trước; hai người cùng huỷ một lần trả | Không thu quá; thu 100% nợ gốc chỉ được khi lần huỷ xong trước; huỷ đôi → một lần huỷ, bên kia `already` |
| 3c | | Thu nợ **tiền mặt** ‖ kết ca; huỷ lần trả nợ tiền mặt ‖ kết ca (quán bật ca) | `debt_cash` trong két đã lưu khớp đúng trạng thái lần trả |
| 4a | `04-inventory` | Bốn `inventory_post_document` cùng lúc (4 phiếu nhập; rồi nhập / nhập đã trả / xuất huỷ / kiểm kho) trên cùng một hàng | Số phiếu khác nhau và **liền nhau** từ `PN-0001`; không `unique_violation` nào lọt ra |
| 4b | | Cùng mã yêu cầu gửi 3 lần; cùng mã cho hai **loại** phiếu; xen kẽ | Một phiếu (và một phiếu chi), các lần kia `replayed: true` đúng phiếu đó; khác loại → "Mã yêu cầu đã dùng cho phiếu khác" |

## Kết quả lần chạy gần nhất — 2026-11-11

> ⚠️ **Lần chạy này CHƯA TRỌN BỘ.** Chỉ file `01-collect-table-bill` đã chạy trên Postgres thật, với
> `RACE_ITERATIONS=5`. Docker Desktop bị thoát (menu khay hệ thống → Quit, 20:22) giữa buổi nên file 02, 03, 04
> **chưa chạy lần nào** và chưa có lần chạy 25 vòng. Bật lại Docker Desktop rồi chạy `npm run test:race`, sau đó
> cập nhật bảng dưới. Container giữ lại từ lần dựng thử (`mevo-race-29168-3d703c`) cũng chưa xoá được vì daemon
> đang tắt: `docker rm -f -v mevo-race-29168-3d703c`.

Dựng schema: 137 file migration (tới mig 130) nạp xong trong ~8 giây sau khi container sẵn sàng (~35 giây).

| Kịch bản | Kết quả | Vòng | Bên thua nhận |
|---|---|---|---|
| 1a tự nhiên | ✅ | 5 | 5× `already: true` (kèm khoản đã ghi) |
| 1a xen kẽ commit / rollback | ✅ ✅ | 1 + 1 | `already: true` / thu trọn vẹn |
| 1b cùng mã, cùng bàn | ✅ | 5 | 5× `already: true` |
| 1b cùng mã, hai bàn | ✅ | 5 | 5× "Mã thu tiền đã dùng cho bill khác" |
| 1c ‖ `pos_add_manual_items` (tự nhiên / xen kẽ) | ✅ ✅ | 5 + 1 | thu: "Số tiền không khớp bill…" · thêm món: "Phiên bàn không còn mở" |
| 1c ‖ `create_order` (tự nhiên / xen kẽ) | ✅ ✅ | 5 + 1 | thu: "Số tiền không khớp bill…" · khách: "Bàn vừa được đóng, vui lòng quét lại QR" |
| 1c ‖ `staff_create_order` (tự nhiên / xen kẽ) | ❌ ❌ **lỗi thật #1** | 5 + 1 | nhân viên nhận **ok** — đơn lọt vào phiên đã thu |
| 1d gộp `[A,B]` ‖ thu lẻ `A` | ✅ (đỏ ở lần chạy 5 vòng chỉ vì dùng chung quán với 1c — đã tách mỗi test một quán, chưa chạy lại) | 5 | gộp: 5× "Có mâm vừa được thu ở máy khác, tải lại bill" |
| 1d ba lần gộp chéo | ✅ (như trên) | 5 | 10× "Có mâm vừa được thu ở máy khác, tải lại bill"; không deadlock |
| 1e ‖ `pos_void_order_item` (tự nhiên / xen kẽ) | ❌ ❌ **lỗi thật #2** | 5 + 1 | 2/5 vòng deadlock (`40P01`), xen kẽ: deadlock chắc chắn |
| 1e ‖ `pos_set_order_item_quantity` (tự nhiên / xen kẽ) | ❌ ❌ **lỗi thật #2** | 5 + 1 | 4/5 vòng deadlock, xen kẽ: deadlock chắc chắn |
| 2a–2e, 3a–3c, 4a–4b | ⏳ chưa chạy | — | — |

### Lỗi thật #1 — `staff_create_order` ghi đơn vào phiên ĐÃ THU

- **RPC**: `collect_table_bill` ‖ `staff_create_order` (nhân viên gọi món hộ ở `/staff/order`, quán trả sau).
- **Xen kẽ**: (1) thu ngân bấm thu → `collect_table_bill` khoá phiên `FOR UPDATE`; (2) nhân viên gửi món cho đúng
  bàn đó → `staff_create_order` lấy advisory lock theo bàn (lần thu không giữ khoá này), `open_session_id_for_table`
  vẫn thấy phiên mở, rồi đứng chờ ở `perform 1 from table_sessions where id = v_session_id for update`; (3) lần thu
  commit (phiên `closed` / `paid`, mọi đơn đã thu); (4) `staff_create_order` chạy tiếp và `INSERT orders` với
  `session_id` của phiên vừa đóng.
- **Thấy**: phiên `status='closed', close_reason='paid'` có thêm một đơn `order_source='staff', status='pending'`,
  `payment_received_at IS NULL`, 30.000đ; nhân viên nhận kết quả thành công. Bàn hiện trống trên POS, đơn không nằm
  trong bill nào → món ra bếp (chính sách `automatic`) mà không ai thu tiền.
- **Mong**: lỗi nghiệp vụ như hai đường kia (`create_order`: "Bàn vừa được đóng, vui lòng quét lại QR";
  `pos_add_manual_items`: "Phiên bàn không còn mở"), hoặc mở phiên mới cho bàn.
- **Thiếu**: sau khi chờ được khoá phiên, `staff_create_order` **không kiểm lại `status = 'open'`** (khoá thì có,
  kiểm thì không). `create_order` có đúng đoạn kiểm này (`IF NOT FOUND OR v_session.status <> 'open'`).
- **Tái hiện**: `node scripts/test-race.mjs -- --test-name-pattern="staff_create_order"` — test xen kẽ đỏ 100%,
  test tự nhiên đỏ ngay vòng thứ 3 trong lần chạy 5 vòng.

### Lỗi thật #2 — deadlock giữa thu tiền và sửa bill

- **RPC**: `collect_table_bill` ‖ `pos_void_order_item` / `pos_set_order_item_quantity` (và `pos_restore_order_item`
  có cùng cấu trúc, chưa viết test riêng).
- **Xen kẽ**: sửa bill khoá `order_items` → `orders FOR UPDATE`, ghi, rồi cuối hàm mới
  `UPDATE table_sessions SET last_activity_at`; thu tiền khoá `table_sessions FOR UPDATE` trước rồi mới
  `UPDATE orders`. Hai bên giữ khoá bên kia cần → Postgres huỷ một bên sau `deadlock_timeout` (1 giây).
- **Thấy**: một bên nhận `deadlock detected` (SQLSTATE `40P01`) thay vì câu báo nghiệp vụ, cả hai máy đứng hình 1
  giây. Dữ liệu **không** sai (bên bị huỷ rollback sạch, phép soát bất biến vẫn sạch). Chạy tự nhiên với độ trễ
  0–4 ms: 2/5 và 4/5 vòng dính.
- **Mong**: bên tới sau chờ rồi nhận "Bill này không còn được điều chỉnh" / "Số tiền không khớp bill…".
- **Thiếu**: thứ tự khoá thống nhất — ba hàm sửa bill cần khoá phiên (`table_sessions … FOR UPDATE`) **trước** khi
  khoá đơn, như `pos_add_manual_items` và `collect_table_bill` đang làm.
- **Tái hiện**: `node scripts/test-race.mjs -- --test-name-pattern="1e"`.

Hai nhóm test trên được **giữ đỏ có chủ ý** cho tới khi SQL được vá; câu báo lỗi của chúng bắt đầu bằng
`LỖI THẬT (chưa vá)`. Chưa sửa migration nào.
