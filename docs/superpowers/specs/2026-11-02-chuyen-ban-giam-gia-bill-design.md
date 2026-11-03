# Chuyển bàn + Giảm giá bill — thiết kế

> Ngày: 2026-11-02 · Nhánh: `feat/chuyen-ban-giam-gia-bill` · Quán đích: **Yên Garden** (bia garden), dùng chung cho mọi quán trả sau.
> Bối cảnh so sánh: [docs/research/2026-11-02-kiotviet-fnb-gap-analysis.md](../../research/2026-11-02-kiotviet-fnb-gap-analysis.md) — đây là mục 1 + 2 của "Đợt 1".

## 1. Vì sao làm

Yên Garden chọn MEVO thay KiotViet. Hai thao tác quầy mà quán bia garden gặp **mỗi tối** và KiotViet có sẵn:

- **Chuyển bàn** — khách đang ngồi phải dời: mưa phải vào nhà; đi 5 người ngồi bàn bé rồi rủ thêm thành 8–10 người phải sang bàn to; phòng hỏng điều hoà. Hôm nay MEVO chỉ có *Thêm bàn vào mâm* và *Nhập vào mâm khác*, không có "dời cả bàn sang bàn trống".
- **Giảm giá cả bill** — thu ngân bớt cho khách (bớt lẻ, khách quen…). Hôm nay MEVO chỉ có Tặng/Bỏ từng món và voucher qua Mini App.

Thành công = thu ngân Yên Garden làm được hai việc này trên POS **không cần hỏi MEVO**, và báo cáo cuối ngày vẫn khớp tiền thật trong két.

## 2. Phạm vi

### Làm
1. Chuyển một bàn đang có khách sang một **bàn trống**, trên POS `/admin/pos`.
2. Giảm giá **cả bill** theo **VNĐ hoặc %**, đặt ở màn Thanh toán POS, giống hộp "Giảm giá hoá đơn" của KiotViet.
3. Hiển thị giảm giá trên: bill POS, phiếu tạm tính, hoá đơn in, trang Hoá đơn & Báo cáo (A04, Excel, in báo cáo cuối ngày), tab Đơn gọi của Mini App.
4. Mini App: khách đã chuyển bàn mà vẫn mở app của bàn cũ thì gọi món vẫn vào **đúng bill ở bàn mới**.

### Không làm (đã chốt với anh Tú)
- **Thu khác / phụ thu** (phí khăn lạnh, đá, phí phục vụ) — anh Tú bỏ.
- Giảm giá / sửa giá **từng dòng món** (KiotViet có) — chỉ làm giảm giá thông thường cả bill.
- In phiếu báo bếp khi chuyển bàn — thu ngân tự báo nhân viên bằng miệng.
- Cấu hình riêng từng quán cho hai tính năng này — "dùng chung, không cá nhân hoá".
- Ô **lý do** giảm giá — KiotViet không có, MEVO cũng không bắt.

### Điều tuyệt đối không được xảy ra (anti-goal)
- Sau khi chuyển bàn, khách gọi thêm mà đơn rơi vào **một bill mới ở bàn cũ** (bill ma).
- Chuyển vào bàn **đang có khách**.
- Doanh thu báo cáo **khác** số tiền thu ngân thật sự nhận sau khi có giảm giá.
- Giảm giá lớn hơn tiền hàng → bill âm.

## 3. Chuyển bàn

### 3.1 Hành vi (anh Tú đã duyệt)
- Chỉ **thu ngân / chủ quán** thao tác trên POS (`is_store_pos_operator`). Nhân viên phục vụ không có nút này.
- Bàn đích phải **đang trống** (không thuộc phiên mở nào). Bàn đang có khách không xuất hiện trong danh sách chọn; RPC cũng chặn lại.
- Mọi thứ của bàn đi theo: lượt đã gọi, lượt chờ duyệt, món Bỏ/Tặng/sửa số lượng, giờ khách bắt đầu ngồi, cờ mâm mở, chủ phiên. Không tính lại gì, không mất gì.
- Bàn thuộc **mâm nhiều bàn**: đổi **từng bàn một** (mâm Bàn 3 + Bàn 4 → chỉ đổi Bàn 4 sang Bàn 12). Muốn dời cả mâm thì đổi lần lượt.
  - *Bổ sung Sprint CB-2 (mig 106)*: mâm nhiều bàn có thêm lựa chọn **"Chuyển cả mâm sang một bàn"** — dồn N bàn của mâm vào MỘT bàn trống (N→1) trong một giao dịch, vẫn một phiên/một bill; cùng luật bàn đích (trống, chặn khung giữ đặt bàn, hỏi khi có lịch muộn). Đổi từng bàn một vẫn giữ.
- Bàn đích **đang trong khung giữ cho khách đặt** (`table_has_current_reservation_hold` = true lúc chuyển): **CHẶN** — không có trong danh sách chọn, RPC cũng từ chối ("Bàn 12 đang giữ cho khách đặt lúc HH:MM"). Lý do: server đang chặn mọi đơn khách gọi vào bàn đang giữ (mig 076/078), cho chuyển vào thì nhóm khách vừa chuyển không gọi thêm được. Luật giữ bàn **không đổi**. *(anh Tú chốt 2026-11-02)*
- Bàn đích có **lịch đặt muộn hơn trong ngày** nhưng chưa tới khung giữ: vẫn cho chuyển, POS hỏi xác nhận kèm giờ hẹn, cùng tinh thần "Vẫn dùng bàn này" ở màn nhân viên.
- Không in gì, không báo bếp.
- Mỗi lần chuyển ghi **nhật ký**: ai, lúc nào, từ bàn nào sang bàn nào.

### 3.2 Dữ liệu
- Bảng mới **`table_session_moves`**: `id`, `store_id`, `session_id`, `from_table_id`, `to_table_id`, `moved_by uuid`, `moved_at timestamptz`. RLS đọc theo `is_store_scoped_operator(store_id)`, không cho ghi trực tiếp (chỉ qua RPC), không cho anon.
- RPC **`pos_move_session_table(p_session_id, p_from_table_id, p_to_table_id)`** (SECURITY DEFINER), trong **một** giao dịch:
  1. Khoá hai bàn bằng `lock_table_for_session` theo thứ tự `table_id` tăng dần (cùng quy ước chống deadlock của ghép mâm), rồi `FOR UPDATE` phiên.
  2. Kiểm: quyền `is_store_pos_operator`; phiên `open`; `from` đang thuộc phiên (`session_tables.is_open`); `to` cùng quán, `is_active`, khác `from`, `open_session_id_for_table(to) IS NULL`, `NOT table_has_current_reservation_hold(to, now())`.
  3. `UPDATE session_tables SET table_id = to WHERE session_id = p AND table_id = from` — **đổi tại chỗ, không để lại dòng bàn cũ**, để mọi chỗ đọc nhãn bàn từ `session_tables` (vd `bills_report_table_label` không lọc `is_open`) chỉ thấy bàn mới. Lịch sử nằm ở `table_session_moves`. Unique index `session_tables_one_open_per_table` là chốt chặn race cuối cùng.
  4. Nếu `table_sessions.table_id` (bàn gốc) = `from` → đổi sang `to`.
  5. `UPDATE orders SET table_id = to WHERE session_id = p AND table_id = from` — để phiếu bàn / phiếu bếp in **sau** khi chuyển (lượt chờ duyệt mới được xác nhận) mang đúng số bàn mới.
  6. Yêu cầu gọi nhân viên **chưa xử lý** của bàn cũ trong phiên này → chuyển sang bàn mới (cả `table_id` lẫn `table_number` snapshot).
  7. Ghi `table_session_moves`, cập nhật `last_activity_at`.
  8. Trả `{ok, from_table_number, to_table_number}`.
- Không sửa bản ghi đặt bàn (`reservations`). Builder phải kiểm: phiên đến từ một lượt đặt bàn rồi chuyển đi thì bàn cũ **không** còn bị coi là "đang giữ" (`table_has_current_reservation_hold`, `list_prearrival_reserved_table_ids`, Timeline POS).

### 3.3 Mini App — không sinh bill ma
- `get_table_session_state(p_table_id, p_zalo_user_id, p_device_id)`: **trước** khi tra phiên của bàn, kiểm xem người gọi có thuộc một phiên **đang mở** đã chuyển **đi khỏi** bàn này không (theo `table_session_moves`). "Thuộc" = khớp chủ phiên (`host_zalo_user_id` / `host_device_id`), hoặc (mâm mở) Zalo UID có đơn trong phiên. Nếu có → trả `state: 'moved'` kèm bàn hiện tại (`table_id`, `table_number`/`table_names`) của phiên. Luật này **đứng trước** cả nhánh "bàn cũ đã có khách mới".
- Mini App nhận `moved` → hiện thông báo **"Bàn của bạn đã chuyển sang Bàn 12"**, đổi `tableId` trong store sang bàn mới, rồi chạy tiếp như bình thường (tab Đơn gọi, gọi món, gọi nhân viên đều theo bàn mới).
- **Lớp phòng thủ ở server** (cho app chưa `zmp deploy`): `create_order` khi người gọi thuộc một phiên đã chuyển đi khỏi bàn truyền vào → gắn đơn vào phiên ấy với `table_id` = bàn hiện tại của phiên, thay vì mở phiên mới. Luật này áp dụng **kể cả khi bàn cũ đã có khách mới** (cùng thứ tự ưu tiên với `get_table_session_state`). Sau khi giữ khoá bàn, `create_order` kiểm lại một lần nữa; nếu phiên vừa bị chuyển trong lúc chờ khoá thì báo lỗi 'Bàn vừa được chuyển, vui lòng thử lại' để không sinh bill ma. Tách logic "tìm phiên đã chuyển của người gọi" thành **một hàm helper** dùng chung cho cả hai RPC.
- Khách **mới** ngồi vào bàn cũ (không khớp chủ/UID) → bàn cũ là bàn trống bình thường.
- **Nhận diện bằng cả máy**: hiện `orders` chỉ lưu `zalo_user_id`, nên khách trong mâm không cho Zalo UID sẽ không được nhận ra. Thêm `orders.device_id` (chỉ `create_order` ghi, khi khách gửi lên; `staff_create_order` — đơn nhân viên đặt hộ — không có máy khách nên không vá) và helper so khớp cả UID lẫn device id.
- **Giới hạn chấp nhận**: người trong nhóm **chưa gọi món lần nào** và không phải chủ phiên thì hệ thống không thể biết họ thuộc bàn vừa chuyển. Nếu họ mở lại app ở bàn cũ thì thấy bàn trống. Ghi rõ trong checklist test như một giới hạn đã biết.

### 3.4 POS
- Panel bill một bàn → "Thao tác khác" → thêm mục **"Chuyển sang bàn trống"**: nếu phiên có >1 bàn thì chọn bàn cần đổi trước, rồi chọn bàn đích trong danh sách bàn trống (nhóm theo khu như các ô chọn bàn khác; bỏ bàn đang trong khung giữ). Bàn đích có lịch đặt muộn hơn trong ngày → hộp xác nhận kèm giờ hẹn.
- Thành công → toast "Đã chuyển Bàn 4 → Bàn 12", sơ đồ/Timeline cập nhật, panel bill vẫn mở trên phiên đó.
- Lịch sử chuyển bàn hiện trong ngăn "Xem bill" của A04 (dòng thời gian: "21:05 Chuyển Bàn 4 → Bàn 12 · Thu ngân Lan").

## 4. Giảm giá bill

### 4.1 Hành vi
- **Thu ngân / chủ quán** quyết, không cần lý do. Hệ thống vẫn ghi ai đặt, lúc nào.
- Ở màn **Thanh toán** POS có dòng **Giảm giá** (giữa "Tổng tiền hàng" và "Khách cần trả"). Bấm → hộp **"Giảm giá hoá đơn"** giống KiotViet: nút chuyển **VNĐ / %**, một ô số, bên dưới hiện số tiền giảm tương ứng. Nút Lưu / Bỏ qua; có cách xoá giảm giá (về 0).
- Công thức: **Tổng tiền hàng − Giảm giá = Khách cần trả**. Gợi ý tiền khách đưa và tiền thối tính theo *Khách cần trả*.
- Sửa / bỏ bao nhiêu lần cũng được **tới lúc thu tiền**; thu xong thì khoá.
- Giá trị hợp lệ: VNĐ là số nguyên ≥ 0 và **không vượt** tiền hàng hiện tại; % là số nguyên 0–100. % tính tròn tới đồng.
- Nếu sau khi đặt giảm giá VNĐ, thu ngân bỏ/bớt món làm tiền hàng **nhỏ hơn** số giảm → không cho thu, báo "Giảm giá lớn hơn tiền hàng — sửa lại giảm giá".
- Giảm giá áp lên tiền hàng **chưa thu** của phiên (bỏ qua đơn đã có `payment_received_at`, lượt bị huỷ/từ chối). Đơn đã dùng voucher: lấy tiền **sau** voucher làm gốc.
- **Bỏ bàn** (không thu tiền) → giảm giá bị bỏ qua.
- **Nhập bàn vào mâm khác** khi bàn nguồn đang có giảm giá → giảm giá của bàn nguồn **bị bỏ**; POS báo trước "Giảm giá của bàn này sẽ bị bỏ — đặt lại ở mâm đích". Giảm giá của mâm đích giữ nguyên (nếu là % thì tự áp lên cả phần đơn mới nhập vào).
- **Phiên hết hạn** (`close_reason='expired'`): `close_table_session(paid)` **bỏ qua** ý định giảm giá — thu đúng tiền đang ghi (§6.11).

### 4.2 Gộp bill nhiều mâm
- Màn thanh toán gộp có **một** dòng Giảm giá cho bill tổng. Hiện = tổng giảm giá các mâm.
- Nhập % → đặt cùng % cho từng mâm. Nhập VNĐ → chia về từng mâm **theo tỉ lệ tiền hàng**, phần dư đồng lẻ dồn vào mâm lớn nhất. Ghi đè giảm giá riêng từng mâm nếu có.

### 4.3 Dữ liệu — nguyên tắc: doanh thu tự đúng
Mọi báo cáo đang cộng `orders.total_amount` của đơn đã nhận tiền (A04, `revenue.ts`, báo cáo ngày). Vì vậy giảm giá phải **trừ thẳng vào `total_amount` lúc thu tiền**, giống cách voucher trừ trong `create_order` — khỏi sửa từng báo cáo.

- `table_sessions` thêm **ý định** giảm giá (không phải tổng tiền): `bill_discount_type` (`'amount'|'percent'`, null = không giảm), `bill_discount_value int`, `bill_discount_set_by uuid`, `bill_discount_set_at timestamptz`.
- `orders` thêm **`bill_discount_amount int not null default 0`** — phần giảm giá bill chia về đơn này.
- Bảng nhật ký **`table_session_discount_changes`** (session_id, store_id, loại + giá trị cũ/mới, by, at).
- RPC **`pos_set_session_discount(p_session_id, p_type, p_value)`** (null/0 = bỏ). Quyền `is_store_pos_operator`, phiên phải `open`, kiểm giá trị theo §4.1, ghi nhật ký.
- RPC cho gộp bill (vd `pos_set_sessions_discount(p_session_ids, p_type, p_value)`) chia theo §4.2 trong **một** giao dịch.
- **`close_table_session(paid)`**: ngay trước khi ghi `payment_received_*`, tính số giảm từ ý định trên phiên, **chia về các đơn chưa thu** theo tỉ lệ `total_amount` (dư dồn vào đơn lớn nhất), ghi `bill_discount_amount`, trừ vào `total_amount` và `payment_amount`. Trả `total` = số tiền sau giảm. `close_table_sessions_bulk` gọi lại hàm này nên tự đúng.
- `recompute_order_total` phải **trừ `bill_discount_amount`** để không ai vô tình cộng ngược lại tiền đã giảm.
- Một hàm thuần dùng chung ở `admin-web/lib/` (vd `bill-discount.ts`) tính số tiền giảm + chia tỉ lệ, có unit test; SQL làm đúng cùng phép tính (cùng cách làm tròn). POS hiển thị theo hàm này để con số thu ngân thấy = số server ghi.

### 4.4 Đọc và hiển thị
- `list_open_table_sessions` trả thêm ý định giảm giá để POS vẽ bill.
- `get_sessions_bill` (in tạm tính / hoá đơn): trả tổng tiền hàng, giảm giá (kèm "10%" nếu là %), khách cần trả — cả khi bill **đang mở** (từ ý định) lẫn **đã thu** (từ `bill_discount_amount`). Phiếu in thêm dòng **"Giảm giá"** khi > 0.
- A04 `get_bills_report`: `discount_total` cộng thêm `bill_discount_amount`; ngăn "Xem bill" và file Excel có dòng/cột Giảm giá bill; in báo cáo cuối ngày có tổng giảm giá. Doanh thu không cần đổi (đã là tiền sau giảm).
- Mini App `get_table_session_bill` / `get_table_session_state`: trả giảm giá; tab **Đơn gọi** hiện dòng "Giảm giá" và tổng sau giảm.

## 5. Ràng buộc kỹ thuật (bẫy đã biết của repo)
- Hàm SQL đang chạy (`close_table_session`, `get_table_session_state`, `create_order`, `list_open_table_sessions`, `get_sessions_bill`, `get_table_session_bill`, `get_bills_report`, `recompute_order_total`) **vá tại chỗ** bằng `pg_get_functiondef` + `replace` + `EXECUTE` (helper `pg_temp`, raise nếu không còn chuỗi cần vá) — **không chép thân hàm từ file cũ**: file migration của nhiều hàm đã cũ hơn prod (vd `085` vẫn ghi `is_store_owner_of`, prod đã là `is_store_pos_operator` từ mig 093).
- File có `CREATE OR REPLACE` một RPC sống phải nằm **riêng một migration** và không ghi "rerun-safe".
- Quyền POS dùng `is_store_pos_operator`; RLS đọc dùng `is_store_scoped_operator` (mig 019).
- Server action dùng `createAdminClient` phải tự kiểm quyền + lọc `store_id`; lỗi người dùng **trả `{ok, error}`**, không ném.
- POS đọc định kỳ từ trình duyệt (`lib/pos-browser-reads.ts`), không poll bằng server action.
- `admin-web` là Next.js bản mới có thay đổi phá vỡ — đọc `node_modules/next/dist/docs/` trước khi viết.
- Mini App vitest chỉ chạy node → hàm thuần tách ra `src/utils/`.
- Đổi Mini App ⇒ phải `git merge origin/main` vào worktree quán rồi mới `zmp deploy`.
- Project Supabase của MEVO **không** nằm trong tài khoản MCP đang kết nối ở phiên này → muốn áp migration lên prod cần anh Tú kết nối lại hoặc tự chạy.

## 6. Quyết định do em (Claude) tự chọn — anh Tú kiểm khi đọc
1. Chủ quán cũng chuyển bàn / giảm giá được (không chỉ thu ngân) — dùng chung quyền POS `is_store_pos_operator`.
2. Chuyển bàn đổi `session_tables` **tại chỗ** + nhật ký riêng, thay vì giữ dòng bàn cũ.
3. Đơn cũ của phiên ở bàn cũ cũng đổi `table_id` sang bàn mới (lịch sử nằm ở nhật ký chuyển bàn).
4. Bàn gốc `table_sessions.table_id` đi theo bàn được chuyển.
5. Yêu cầu gọi nhân viên chưa xử lý đi theo sang bàn mới.
6. Có lớp chặn bill ma ở **server** (`create_order`), không chỉ ở Mini App.
7. Giảm giá lưu dạng **ý định** trên phiên, **chia vào đơn lúc thu tiền** (để doanh thu tự đúng).
8. % chỉ nhận số nguyên; làm tròn tới đồng.
9. Không cho thu khi giảm giá VNĐ vượt tiền hàng (thay vì tự cắt bớt).
10. Đơn không thuộc phiên (mang về / ship) **không** có giảm giá bill trong đợt này.
11. Phiên **hết hạn còn nợ** chỉ thu đúng tiền đang ghi, không đặt giảm giá được (giảm giá chỉ cho phiên đang mở).
12. Mini App hiện dòng giảm giá ở tab Đơn gọi.
13. Nhập bàn vào mâm khác thì giảm giá của bàn nguồn bị bỏ (có báo trước).
14. Thêm `orders.device_id` để nhận ra khách không cho Zalo UID sau khi chuyển bàn; người chưa gọi món lần nào là giới hạn chấp nhận.

## 7. Kiểm thử (định hướng — checklist chi tiết viết ở bước plan)
- Hàm thuần `bill-discount.ts`: %/VNĐ, làm tròn, chia tỉ lệ, phần dư, vượt tiền hàng.
- RPC chuyển bàn: bàn đích bận → lỗi; bàn đích đang trong khung giữ đặt bàn → lỗi; bàn có lịch muộn hơn → chuyển được; hai máy cùng chuyển vào một bàn → chỉ một thành công; mâm 2 bàn đổi 1 bàn; bàn gốc đổi theo; gọi NV đi theo; nhật ký ghi đúng.
- Mini App: chủ phiên mở lại QR bàn cũ → thấy "đã chuyển sang Bàn 12", gọi món vào đúng bill; khách lạ quét bàn cũ → bàn trống; app cũ (không cập nhật) gọi món → server vẫn gắn đúng phiên.
- Giảm giá: đặt → in tạm tính có dòng giảm → thu → A04 doanh thu = tiền thật; sửa/bỏ giảm giá trước khi thu; bỏ món sau khi giảm VNĐ lớn → chặn thu; gộp 2 mâm giảm VNĐ chia đúng; bỏ bàn bỏ qua giảm giá.
- Test tay trên **Bảo Lương** (quán trả sau đang chạy thật), theo quy ước dự án.
