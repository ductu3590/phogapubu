# IN-BEP-SERVER — Phiếu bếp của đơn "tự vào bếp" do máy chủ tự xếp (mig 131)

Nhánh `claude/codebase-audit-cleanup-da23f0`. Trước đây tab POS là nơi xếp phiếu bếp cho đơn tự vào bếp: đóng tab POS
(hoặc tải cứng một trang cấu hình) là bếp không có phiếu và không ai được báo. Từ đợt này **phần mềm in ở quầy mỗi lần
hỏi việc (khoảng 2 giây một lần) thì máy chủ tự xếp phiếu** — không còn phụ thuộc màn POS.

> ✅ **Mig 131 (`supabase/migrations/131_auto_kitchen_print_server.sql`) ĐÃ áp lên prod ngày 2026-11-11**, trước khi
> admin-web mới lên Vercel (bắt buộc theo thứ tự này: admin-web mới đã xoá đường tự in ở POS). Trình duyệt cũ và máy chủ
> dùng cùng khoá chống trùng nên trong lúc chờ deploy không ra hai phiếu. File không chạy lại lần hai được.
>
> Đã thử trên prod trong một giao dịch rồi ROLLBACK: một đơn nhân viên của Bàn 3 ra đúng 1 phiếu bếp (trạm Bar) + 1
> phiếu bàn (Quầy), đứng tên chủ quán; gọi lần hai không tạo thêm; `print_agent_poll` đã có dòng gọi hàm mới.

Đã tự kiểm bằng máy: test SQL `supabase/tests/131_auto_kitchen_print_server.test.mjs` 27/27 xanh (PGlite, cả bản LF lẫn
CRLF), test mig 114 + 121 vẫn xanh; admin-web `tsc` sạch, vitest xanh.

## Chuẩn bị (quán **Bia lẩu Bảo Lương**)

- Cài đặt → In ấn: **Nhiều nơi (qua phần mềm in)**; phần mềm in ở quầy báo "Đã kết nối"; trạm **Quầy** và **Bếp** đều đã
  chọn máy in. Dưới mục chọn cách in có dòng: *"Có đơn vào bếp tự động: máy chủ tự xếp phiếu bếp và phiếu bàn… không cần
  mở màn POS. Đơn đã vào bếp quá 30 phút trước khi phần mềm in chạy lại thì không được in."* (không còn câu "chỉ in khi
  màn POS đang mở ở quầy").
- Cài đặt → Quy trình vận hành: **đơn nhân viên = Tự động vào bếp**, **đơn khách = Chờ POS xác nhận**.
- Cho bài 5: tạo thêm một trạm in (ví dụ **Bar**, chọn máy in), rồi ở Món → sửa danh mục đồ uống → gán trạm **Bar**.
- Một điện thoại đăng nhập tài khoản **nhân viên** (`/staff`), một máy đăng nhập **thu ngân / chủ quán** (`/admin/pos`).

## Bài test

| # | Việc | Kỳ vọng | Kết quả |
|---|---|---|---|
| 1 | **Đóng hẳn mọi tab POS** (không máy nào mở `/admin/pos`). Phần mềm in vẫn chạy. Nhân viên gọi món cho một bàn trống ở `/staff` (2 món cùng trạm Bếp) | Trong vài giây: **1 phiếu bếp** ở máy in Bếp + **1 phiếu bàn** ở máy in Quầy. Không cần ai bấm gì | |
| 2 | Mở lại POS ở quầy, để nguyên. Nhân viên gọi thêm một lượt cho bàn khác | Vẫn đúng **1 phiếu bếp + 1 phiếu bàn**, không có tờ thứ hai. POS **không** hiện băng "giữ POS mở để in"; lượt này **không** nằm ở "Chờ duyệt" | |
| 3 | Chờ 1 phút với POS đang mở, quan sát máy in | Không tờ nào in lại cho các đơn ở bài 1 và 2 | |
| 4 | Khách (Mini App, quét QR bàn) gọi một lượt → POS hiện "Chờ duyệt" → thu ngân bấm **Duyệt & in bếp** | Trước khi bấm: **không** có phiếu nào. Sau khi bấm: đúng **1 phiếu bếp + 1 phiếu bàn**, không thêm tờ nào sau đó. (Mini App Bảo Lương đang tắt thì ghi "bỏ qua") | |
| 5 | Nhân viên gọi một lượt có **1 món ăn + 1 đồ uống** (danh mục đồ uống đã gán trạm Bar) | **2 phiếu bếp**: tờ ở Bếp chỉ có món ăn, tờ ở Bar chỉ có đồ uống; **1 phiếu bàn** ở Quầy có đủ 2 món | |
| 6 | **Tắt phần mềm in** (thoát hẳn). Nhân viên gọi một lượt (ghi lại giờ). Chờ **ít nhất 31 phút**. Bật lại phần mềm in | Lượt đó **không** được in (đã vào bếp quá 30 phút). POS không báo lỗi phiếu nào cho lượt này. Muốn có giấy: mở bill → **In lại** ở lượt đó | |
| 7 | Tắt phần mềm in. Nhân viên gọi một lượt. Chờ khoảng **5 phút** rồi bật lại phần mềm in | Lượt đó **được in** ngay sau khi phần mềm kết nối lại (1 phiếu bếp + 1 phiếu bàn) | |
| 8 | Ở bill của một lượt đã tự in: bấm **In lại** | Ra thêm một bộ phiếu có chữ **IN LẠI** (như trước) | |
| 9 | Thu ngân ghi tay một món ở POS (Thêm món) / tạo **Khách lẻ** | **Không** có phiếu bếp tự in (món ghi tay là món đã phục vụ) | |
| 10 | Nhân viên gọi một lượt, rồi thu ngân **Bỏ** hết món của lượt đó ở POS trong lúc phần mềm in đang tắt; bật lại phần mềm in | Không in phiếu cho lượt đã bỏ hết món | |
| 11 | Thu tiền một bàn có lượt đã tự in | Thu được bình thường (lượt tự vào bếp không chặn thu tiền — mig 129) | |

## Ghi chú khi đọc kết quả

- Phiếu tự xếp đứng tên **chủ quán đang bật lâu nhất** của quán (không có thì quản lý, rồi thu ngân). Quán không còn
  tài khoản nào trong ba vai đó thì không tự in.
- Nếu một phiếu tự xếp không in được (máy in lỗi, trạm chưa chọn máy), POS hiện băng đỏ phiếu lỗi như mọi phiếu khác:
  **In lại** / **Bỏ qua**. Phiếu đã bỏ qua **không** tự tạo lại.
- Đơn tự vào bếp chỉ được xếp phiếu khi **phần mềm in đang chạy**. Phần mềm tắt quá 30 phút kể từ lúc đơn vào bếp thì
  đơn đó không bao giờ tự in — đây là cố ý (bật máy sau giờ nghỉ không xả phiếu cũ).

## SQL đối chiếu (chỉ đọc, sau khi áp mig 131)

```sql
-- Hàm poll đã gọi hàm mới đúng một lần
select (length(d) - length(replace(d, 'auto_kitchen_print_enqueue', ''))) / length('auto_kitchen_print_enqueue') as so_lan
  from (select pg_get_functiondef('public.print_agent_poll(text,text,jsonb)'::regprocedure) as d) x;   -- mong đợi 1

-- Hàm nội bộ không cấp cho anon / authenticated
select has_function_privilege('anon', 'public.auto_kitchen_print_enqueue(uuid)', 'EXECUTE') as anon,
       has_function_privilege('authenticated', 'public.auto_kitchen_print_enqueue(uuid)', 'EXECUTE') as authenticated;  -- false, false

-- Phiếu của một đơn (thay <order_id>)
select kind, status, dedupe_key, ref ->> 'label' as nhan, created_at
  from print_jobs where dedupe_key like 'order:<order_id>:%' order by created_at;
```
