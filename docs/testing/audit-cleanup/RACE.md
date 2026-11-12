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

Không cần tạo thêm extension / publication nào: ảnh đã đủ cho cả 137 file tới `130_drop_dead_functions_and_columns.sql`
(`131_auto_kitchen_print_server.sql` xuất hiện sau lần dựng đó, chưa được nạp thử).

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

## Kết quả lần chạy gần nhất — 2026-11-12 (sau mig 132)

`RACE_ITERATIONS=25`, cả 4 file, Postgres thật trong Docker. **40/40 xanh**, 71 giây (dựng container + nạp 139
file migration tới `132_fix_money_rpc_races.sql` mất 12,2 giây). Container tạm tự xoá sau khi chạy.

| Kịch bản | Kết quả | Vòng | Bên thua nhận |
|---|---|---|---|
| 1a hai thu ngân, cùng bàn, khác mã | ✅ | 25 | 25× `already: true` (kèm khoản đã ghi) |
| 1b cùng mã, cùng bàn / hai bàn | ✅ ✅ | 25 + 25 | `already: true` / "Mã thu tiền đã dùng cho bill khác" |
| 1c ‖ `pos_add_manual_items` (tự nhiên / xen kẽ) | ✅ ✅ | 25 + 1 | thu: "Số tiền không khớp bill…" · thêm món: "Phiên bàn không còn mở" |
| 1c ‖ `create_order` (tự nhiên / xen kẽ) | ✅ ✅ | 25 + 1 | khách: "Bàn vừa được đóng, vui lòng quét lại QR" |
| 1c ‖ `staff_create_order` (tự nhiên / xen kẽ) | ✅ ✅ (**đã vá #1**) | 25 + 1 | nhân viên: "Bàn vừa được thu tiền ở quầy, bấm gửi lại để mở lượt mới cho bàn"; 0/25 vòng lọt đơn |
| 1d gộp `[A,B]` ‖ thu lẻ `A`; ba lần gộp chéo | ✅ ✅ | 25 + 25 | "Có mâm vừa được thu ở máy khác, tải lại bill"; không deadlock |
| 1e ‖ `pos_void_order_item` (tự nhiên / xen kẽ) | ✅ ✅ (**đã vá #2**) | 25 + 1 | 0/25 deadlock; sửa bill: "Bill này không còn được điều chỉnh" |
| 1e ‖ `pos_set_order_item_quantity` (tự nhiên / xen kẽ) | ✅ ✅ (**đã vá #2**) | 25 + 1 | 0/25 deadlock; như trên |
| 2a ba người mở ca | ✅ | 25 | 50× "Đã có ca đang mở" |
| 2b thu tiền mặt ‖ kết ca | ✅ | 25 | 24× "Chưa mở ca" |
| 2c phiếu chi ‖ kết ca; cùng mã phiếu chi | ✅ ✅ | 25 + 25 | "Chưa mở ca" / `already` |
| 2d huỷ phiếu chi ‖ kết ca | ✅ | 25 | "Ca của phiếu này đã kết, không huỷ được" |
| 2e phiếu nhập trả tiền mặt ‖ kết ca | ✅ | 25 | 24× "Chưa mở ca" |
| 3a hai máy thu nợ một khách (100% / 60% / 50%); cùng mã | ✅ ✅ | 25 + 25 | "Số tiền trả vượt số nợ: còn nợ …"; 50%: cả hai được |
| 3b thu nợ ‖ huỷ lần trả; hai người cùng huỷ | ✅ ✅ | 25 + 25 | 100% nợ gốc chỉ được khi huỷ xong trước / `already` |
| 3c thu nợ / huỷ lần trả tiền mặt ‖ kết ca | ✅ ✅ | 25 + 25 | "Chưa mở ca" / "Ca của lần thu này đã kết, không huỷ được" |
| 4a bốn phiếu nhập; bốn loại phiếu cùng lúc | ✅ ✅ | 25 + 25 | số phiếu liền nhau, không `unique_violation` |
| 4b cùng mã ×3; cùng mã hai loại phiếu; xen kẽ | ✅ ✅ ✅ | 25 + 25 + 1 | `replayed` đúng phiếu / "Mã yêu cầu đã dùng cho phiếu khác" |

Chạy lại lần hai ngay sau đó (cùng ngày): 40/40 xanh, 84 giây.

⚠️ Lọc bằng `-- --test-name-pattern="^1"` đã TREO hơn 10 phút ở lần thử 2026-11-12 (Postgres không có truy vấn nào chờ khoá, nên kẹt ở phía Node; chưa rõ nguyên nhân). Tới khi tìm ra, chạy cả bộ.

Chưa có test riêng: `pos_restore_order_item` ‖ thu tiền (cùng cấu trúc với bỏ món, được vá cùng lúc ở mig 132).

### Lỗi #1 (đã vá, mig 132) — `staff_create_order` ghi đơn vào phiên ĐÃ THU

Thu ngân bấm thu (`collect_table_bill` khoá phiên) đúng lúc nhân viên gửi món cho bàn đó: `staff_create_order` thấy
phiên còn mở, đứng chờ khoá phiên, rồi sau khi lần thu commit vẫn chèn đơn `pending` vào phiên đã đóng `paid` —
bàn hiện trống, không ai thu khoản đó. Thiếu bước kiểm lại `status = 'open'` sau khi chờ khoá (`create_order` và
`pos_add_manual_items` có). Vá: khoá phiên kèm điều kiện `status = 'open'`, không còn mở thì báo lỗi; nhân viên
bấm gửi lại sẽ mở phiên mới cho bàn.

### Lỗi #2 (đã vá, mig 132) — deadlock giữa thu tiền và sửa bill

`collect_table_bill` khoá PHIÊN rồi ghi ĐƠN; `pos_void_order_item` / `pos_set_order_item_quantity` /
`pos_restore_order_item` khoá ĐƠN rồi mới ghi PHIÊN → Postgres huỷ một bên (`40P01`) sau 1 giây, trước khi vá là
2/5 và 4/5 vòng. Dữ liệu không sai nhưng thu ngân thấy lỗi lạ. Vá: ba hàm sửa bill khoá phiên của đơn trước khi khoá
đơn; đơn bị dời sang mâm khác giữa hai bước thì báo "Bill vừa thay đổi ở máy khác, tải lại rồi thử lại".

Hai nhóm test này giờ là test **hồi quy**: đỏ lại tức là một lần sửa sau đã làm hỏng thứ tự khoá.
