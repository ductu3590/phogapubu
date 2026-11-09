# Yên Garden — Kho nhập–xuất và giá vốn (mig 118)

Quản lý xem tồn bia/nước bất kỳ lúc nào, ghi phiếu nhập (có giá), kiểm kho, xuất huỷ, xem thẻ kho; hàng bán nguyên tự
trừ kho khi bán. Tồn **không lưu sẵn** — tính lúc đọc từ phiếu + đơn bán, phiếu kiểm là mốc neo (số đếm là sự thật).

Spec: `docs/superpowers/specs/2026-11-09-yg-kho-design.md` · Plan: `docs/superpowers/plans/2026-11-09-yg-kho.md` ·
Migration: `supabase/migrations/118_inventory.sql` · Kiểm số liệu: `docs/testing/yen-garden/sql/kho-verify.sql`

## Controller áp migration 118 (trước khi anh Tú test)

1. Thứ tự: 111 → 112a/112b → 116 → 117 → **118**. Khối `$pre$` của 118 raise nếu 116 chưa áp (`is_store_back_office`),
   nên áp sai thứ tự sẽ dừng sạch, không để nửa chừng.
2. Áp nội dung LF: `git show <nhánh>:supabase/migrations/118_inventory.sql` (file worktree có thể là CRLF).
3. Kiểm sau áp:
   - `SELECT count(*) FROM inventory_items` = 0.
   - `SELECT has_function_privilege('authenticated', 'public.inventory_sales_qty(uuid,timestamptz,timestamptz)', 'EXECUTE')` = false.
   - `SELECT has_function_privilege('anon', 'public.inventory_stock_levels(uuid,timestamptz)', 'EXECUTE')` = false.
   - Hai dòng `  -- mevo-anchor:122b inventory_post_document.cash_book(v_doc_id)` và
     `  -- mevo-anchor:122b inventory_void_document.cash_book(v_doc_id)` có đúng 1 lần trong `pg_get_functiondef` của hai
     hàm trên **prod** (mig 122b vá theo đó; neo chép từ prod, không từ file). `kho-verify.sql` ca `anchor_*` kiểm sẵn.
4. Deploy Vercel sau khi áp. Deploy trước cũng không vỡ: trang Kho báo "Không tải được kho", trang Món không hiện ô
   Trừ kho (RPC lỗi → `null`).
5. Mig 118 không đổi số liệu tiền nào: báo cáo A04, thu tiền, đóng bàn không bị ảnh hưởng — kiểm nhanh một bill
   Bảo Lương sau áp.

## Trước khi test

- Test trên quán **Yên Garden chưa mở bán** (hoặc một quán thử). **Không** test trên Bảo Lương.
- Cần 3 tài khoản của quán đó: **chủ quán**, **quản lý** (tạo ở ⚙ Cài đặt → Nhân viên, xem `QUAN-LY.md`), **thu ngân**.
- Thực đơn cần có: một món thường "Bia Hà Nội" và một món có lựa chọn (vd. "Bia tháp" với lựa chọn "Tháp to", "Tháp nhỏ").
- Mỗi bài ghi PASS/FAIL ở ô cuối. FAIL thì chụp màn hình + ghi bước.
- **Kiểm kho khi không còn đơn chờ duyệt**: đơn đang chờ thu ngân duyệt chưa trừ kho, duyệt sau giờ kiểm thì trừ sau mốc kiểm → số máy lúc đếm thiếu đúng phần đó. Duyệt / từ chối hết đơn chờ rồi mới đếm.

---

## Bài 1. Mở Kho, hộp thoại đè POS, 375px

1. Chủ quán đăng nhập → POS. Rail trái có mục **Kho** (icon hộp) ngay sau **Báo cáo**.
2. Bấm **Kho** → hiện **hộp thoại "Kho" đè lên POS** (POS vẫn chạy phía sau). Có 4 tab: Tồn kho · Nhập hàng · Kiểm kho · Xuất huỷ.
3. F5 (hoặc mở thẳng `/admin/inventory`) → ra **trang đầy đủ** có tiêu đề "Kho".
4. Điện thoại 375px (hoặc DevTools → 375px): trang không cuộn ngang; danh sách tồn kho là **thẻ**, không phải bảng.

Kết quả: ☐ PASS ☐ FAIL

## Bài 2. Thêm 4 hàng hoá

1. Tab Tồn kho → **Thêm hàng hoá** (hộp trượt từ phải; trên điện thoại trượt từ dưới).
2. Thêm lần lượt:
   - **Bia Hà Nội lon** — đơn vị `lon` (bấm nút gợi ý "lon"), loại **Bán nguyên**, mức tối thiểu **48**.
   - **Tiger lon** — `lon`, Bán nguyên.
   - **Thịt ba chỉ** — `kg`, **Nguyên liệu**.
   - **Nước suối** — `chai`, Bán nguyên.
3. Mỗi lần lưu: toast "Đã lưu hàng hoá", danh sách hiện hàng mới, tồn 0.
4. Thử thêm "bia hà nội lon" (khác hoa thường) → lỗi **"Đã có hàng hoá tên này"** hiện ngay trong hộp.
5. Gõ dở rồi bấm **Esc** (hoặc X) → hỏi **"Bỏ thay đổi?"**; chọn Huỷ thì hộp còn nguyên chữ đã gõ.

Kết quả: ☐ PASS ☐ FAIL

## Bài 3. Kiểm đầu kỳ có giá vốn

1. Tab **Kiểm kho** → **Tạo phiếu kiểm**. Ngày là hôm nay (chỉ là chữ, không chọn được).
2. Bật **"Kiểm đầu kỳ — nhập giá vốn"** → mỗi hàng có thêm ô Giá vốn.
3. Bia Hà Nội lon: đếm **100**, giá vốn **10.000**. Thịt ba chỉ: đếm **5**, giá vốn **120.000**. Hai hàng còn lại để trống ("Không kiểm").
4. Cột Chênh: Bia **+100**, Thịt **+5** (máy đang 0).
5. Lưu → toast "Đã chốt PK-0001". Tab Tồn kho: Bia **100**, Thịt **5**; cột Giá vốn gần nhất **10.000đ** / **120.000đ**; Giá trị tồn 1.000.000đ / 600.000đ.

Kết quả: ☐ PASS ☐ FAIL

## Bài 4. Gắn món với hàng hoá (chủ quán)

1. Trang **Món** → sửa món **Bia Hà Nội** → cuối hộp có khung **"Trừ kho khi bán"**.
2. Chọn **Bia Hà Nội lon** × **1** → Lưu → khung hiện "Bia Hà Nội lon × 1" + nút **Gỡ**.
3. Sửa món **Bia tháp** (có lựa chọn): có dòng **Cả món** + một dòng cho mỗi lựa chọn.
   - Cả món: Tiger lon × **3** → Lưu.
   - Tháp to: Tiger lon × **5** → Lưu.
   - Tháp nhỏ (chưa gắn riêng) hiện **"Theo cả món (Tiger lon × 3)"**.
4. Gõ SL "1.500" → chữ vàng dưới ô "Đang hiểu là 1,5 — số lượng kho không dùng dấu ngăn nghìn".

Kết quả: ☐ PASS ☐ FAIL

## Bài 5. Bán trừ kho: bỏ món, tặng, sửa số lượng

1. Gọi **5 Bia Hà Nội** (QR Mini App hoặc nhân viên gọi hộ ở `/staff`); đơn vào bếp (duyệt ở POS nếu quán cần duyệt).
2. Tab Tồn kho: Bia Hà Nội lon **95**.
3. Thu ngân **Bỏ** 1 dòng Bia (có lý do) → tồn quay lại tương ứng.
4. **Tặng** 1 Bia → tồn **vẫn trừ** (hàng đã ra khỏi tủ).
5. Gọi một dòng 4 Bia, rồi **sửa số lượng 4 → 2** → chỉ trừ 2.
6. Gọi 1 **Tháp to** + 1 **Tháp nhỏ** → Tiger trừ **5 + 3 = 8**.

Kết quả: ☐ PASS ☐ FAIL

## Bài 6. Đơn bị từ chối không trừ kho

1. Quán bật duyệt ở POS (hoặc dùng đơn khách chưa duyệt): khách gọi 3 Bia.
2. Trước khi duyệt: tồn **chưa trừ** (đơn chờ duyệt).
3. Thu ngân **Từ chối** đơn → tồn không đổi. (Nếu duyệt thay vì từ chối → trừ 3.)

Kết quả: ☐ PASS ☐ FAIL

## Bài 7. Phiếu nhập — số lẻ, đơn giá có dấu chấm, đã trả

1. Tab **Nhập hàng** → **Tạo phiếu nhập**. Nhà cung cấp: gõ "Chợ Cốc Lếu".
2. Dòng: **Thịt ba chỉ**, SL **"1,5"**, đơn giá gõ **"126000"** (ô tự thành "126.000") → thành tiền **189.000đ**; Tổng tiền hàng 189.000đ.
3. Thử SL "1.5" → cũng là 1,5. Thử "0" hoặc "abc" → bấm Lưu báo lỗi **ở chân hộp, cạnh nút Lưu** ("Dòng 1: Số lượng…") — kể cả trên điện thoại.
4. Chọn **Đã trả** → bắt chọn **Tiền mặt / Chuyển khoản** (chưa chọn thì nút Lưu tắt, chữ "Chọn phương thức trả tiền"). Chọn Tiền mặt.
5. Có dòng chữ "Phiếu chi vào sổ thu chi sẽ tự tạo khi có Sổ thu chi." (chưa tạo phiếu chi — bài của mig 122b).
6. Lưu → toast "Đã lưu PN-0001". Danh sách: PN-0001, 189.000đ, **"Đã trả · Tiền mặt"**. Tồn Thịt tăng 1,5.
7. Mở form phiếu mới lần nữa: ô Nhà cung cấp gợi ý "Chợ Cốc Lếu".

Kết quả: ☐ PASS ☐ FAIL

## Bài 8. Bấm Lưu hai lần / mất mạng → chỉ một phiếu

1. Tạo phiếu nhập Tiger 24 × 10.500, bấm **Lưu hai lần thật nhanh** → chỉ **một** phiếu mới trong danh sách.
2. Tạo phiếu khác, **tắt mạng** (DevTools → Offline) rồi bấm Lưu → lỗi ở chân hộp; **bật mạng**, bấm Lưu lại → lưu được, vẫn **một** phiếu (không có phiếu thứ hai nếu lần đầu thực ra đã tới server). Nếu lần đầu đã tới server: toast **"Phiếu đã lưu trước đó: PN-… — kiểm tra lại nội dung"** thay cho "Đã lưu".

Kết quả: ☐ PASS ☐ FAIL

## Bài 9. Xuất huỷ — thiếu lý do bị chặn

1. Tab **Xuất huỷ** → **Tạo phiếu huỷ**, dòng Bia Hà Nội lon × **2**, để trống Lý do → nút Lưu tắt, chữ "Nhập lý do huỷ".
2. Gõ lý do "Vỡ 2 lon" → Lưu → PX-0001; tồn Bia giảm 2. Danh sách hiện lý do.

Kết quả: ☐ PASS ☐ FAIL

## Bài 10. Kiểm kho — chênh lệch, tồn sau kiểm = số đếm

0. Trước khi đếm: POS không còn lượt gọi **chờ duyệt** (duyệt / từ chối hết).
1. Tạo phiếu kiểm: các ô đã điền sẵn tồn máy ở cột **Máy**. Bia: đếm ít hơn máy 6 → Chênh **"-6"** đỏ. Một hàng đếm đúng bằng máy → "Khớp".
2. Gõ "abc" ở một hàng, rồi lọc sang **Nguyên liệu** (ẩn hàng đó) → nút Lưu vẫn tắt, chân hộp ghi **"Số đếm không hợp lệ: <tên hàng>"**. Sửa lại thì lưu được.
3. Lưu → "Đã chốt PK-0002". Tab Tồn kho: Bia = đúng số vừa đếm.

Kết quả: ☐ PASS ☐ FAIL

## Bài 11. Nhập lùi ngày sau khi đã kiểm hôm nay

1. Sau Bài 10 (đã kiểm hôm nay): tạo phiếu nhập **ngày hôm qua**, Bia × 24.
2. Lưu → thêm toast **"Phiếu ghi lùi ngày trước phiếu kiểm PK-0002 nên tồn hiện tại không đổi"**.
3. Tồn Bia **không đổi** (số đếm là sự thật). Thẻ kho Bia: phiếu nhập nằm **trước** dòng kiểm.
4. Ô ngày không cho chọn quá 7 ngày trước / ngày mai.

Kết quả: ☐ PASS ☐ FAIL

## Bài 12. Huỷ phiếu nhập

1. Mở một phiếu nhập (bấm số phiếu; trên điện thoại bấm cả thẻ) → **Huỷ phiếu** → ô lý do bắt buộc (trống thì nút tắt).
2. Gõ lý do → Huỷ → toast "Đã huỷ PN-…". Danh sách: số phiếu **gạch ngang** + nhãn **"Đã huỷ"**. Tồn giảm đúng SL phiếu đó (nếu phiếu sau mốc kiểm cuối).
3. Mở lại phiếu đã huỷ: hiện giờ huỷ + lý do, không còn nút Huỷ phiếu.

Kết quả: ☐ PASS ☐ FAIL

## Bài 13. Thẻ kho

1. Tab Tồn kho → bấm hàng **Bia Hà Nội lon** (điện thoại: bấm cả phần trên của thẻ) → hộp **"Thẻ kho · Bia Hà Nội lon"**.
2. Dòng đầu **Tồn đầu kỳ**, các dòng: giờ, loại (Nhập hàng / Xuất huỷ / Kiểm kho / **"Bán ngày dd/mm"**), số phiếu, thay đổi (**+ xanh / − đỏ**), tồn chạy. Dòng kiểm: **"Đếm X (lệch -Y)"**. Dòng cuối **Tồn cuối kỳ** = số ở tab Tồn kho.
3. Đổi khoảng ngày (Từ ngày sau Đến ngày → tự đảo, có dòng báo).

Kết quả: ☐ PASS ☐ FAIL

## Bài 14. Hộp chồng hộp — Esc

1. Trong thẻ kho (Bài 13), bấm một **số phiếu** → hộp chi tiết phiếu mở **đè lên** thẻ kho.
2. Bấm **Esc** một lần → chỉ đóng hộp phiếu, thẻ kho **vẫn mở**. Esc lần nữa → đóng thẻ kho.
3. Từ hộp phiếu → **Huỷ phiếu** → hộp lý do mở đè lên: Esc khi ô lý do trống thì đóng hộp lý do; đã gõ lý do thì Esc **không** đóng (bấm "Không huỷ").
4. Form phiếu nhập đang gõ dở → Esc → hỏi **"Bỏ phiếu đang nhập?"**; chưa gõ gì → Esc đóng luôn.
5. Huỷ phiếu từ thẻ kho → thẻ kho tự tải lại, tab Tồn kho cũng đúng số mới.

Kết quả: ☐ PASS ☐ FAIL

## Bài 15. Tồn âm và Sắp hết

1. Bán **Nước suối** (chưa nhập, tồn 0) 3 chai → tồn **-3**, nhãn đỏ **"Âm kho"**, số đỏ; bán vẫn được, không bị chặn.
2. Bia Hà Nội lon xuống dưới 48 (bán hoặc huỷ) → nhãn vàng **"Sắp hết"**. Bằng đúng 48 → không có nhãn.
3. Giá trị tồn của hàng âm = 0đ.

Kết quả: ☐ PASS ☐ FAIL

## Bài 16. Ngừng dùng hàng đang gắn món

1. **Tiger lon** đang gắn 2 dòng (Bia tháp: cả món + Tháp to) → **Ngừng dùng** → hộp xác nhận "Ngừng dùng Tiger lon? … món đang trừ kho hàng này sẽ thôi trừ."
2. Xác nhận → toast "Đã ngừng dùng Tiger lon" + **"Đã gỡ 2 món đang trừ kho hàng này"**. Trang Món: Bia tháp không còn trừ kho.
3. Bật "Hiện hàng ngừng dùng" → Tiger hiện xám "Ngừng dùng" cuối danh sách, có nút **Dùng lại**.
4. Tạo hàng mới tên **Tiger lon** → được (trùng tên chỉ cấm giữa hàng đang dùng). Bấm Dùng lại hàng cũ → lỗi "Đã có hàng hoá tên này".
5. Ngừng dùng một hàng **còn tồn** (vd. Nước suối đang -3): hộp xác nhận có thêm câu **"Còn tồn -3 chai — nên kiểm kho về 0 trước khi ngừng dùng."**; vẫn bấm Ngừng dùng được.
6. Sửa hàng **Bia Hà Nội lon** (đã gắn món) đổi Loại sang Nguyên liệu → lỗi **"Hàng đã từng gắn món — không đổi loại được; tạo hàng mới"** (kể cả khi đã gỡ hết liên kết).

Kết quả: ☐ PASS ☐ FAIL

## Bài 17. Thu ngân — chỉ xem tồn

1. Đăng nhập **thu ngân** → rail có **Kho**. Mở: **chỉ một tab Tồn kho** (không có hàng tab).
2. Không có nút **Thêm hàng hoá**, **Sửa**, **Ngừng dùng**; bấm tên hàng **không** mở thẻ kho.
3. **Không** thấy cột Giá vốn gần nhất, Giá trị tồn, dòng Tổng giá trị tồn (thẻ mobile cũng không có) — chỉ tên, đơn vị, loại, số tồn, nhãn Âm kho / Sắp hết. Giá bị gỡ ngay ở server: xem nguồn trang / DevTools → Network cũng không thấy giá vốn của hàng.
4. Trang **Món** (màn Tạm hết): **không** có nút "Trừ kho" nào, phụ đề như cũ.

Kết quả: ☐ PASS ☐ FAIL

## Bài 18. Quản lý — kho + Trừ kho trên màn Tạm hết (kể cả lựa chọn)

1. Đăng nhập **quản lý** → rail có **Kho**; làm lại nhanh Bài 2, 3, 7, 9, 10, 12, 13 bằng tài khoản quản lý: không bước nào báo "Không có quyền".
2. Trang **Món** → màn bật/tắt Tạm hết, phụ đề có "Bật/tắt Tạm hết và gắn trừ kho."
3. Mỗi món có nút **"Trừ kho"** cạnh nút Đang bán/Tạm hết (điện thoại: nút cao vừa ngón tay). Món đang trừ có dòng phụ "Trừ kho: Bia Hà Nội lon × 1".
4. Bấm **Trừ kho** ở **Bia tháp** → hộp trượt có dòng **Cả món** + **từng lựa chọn** (Tháp to, Tháp nhỏ). Gắn Tháp nhỏ × 2 → Lưu → dòng hiện "… × 2"; Gỡ → về "Theo cả món (…)" nếu Cả món đang gắn, không thì "Không trừ kho" (sau Bài 16 Cả món đã bị gỡ — gắn lại Cả món trước nếu muốn thấy dòng "Theo cả món").
   - Nếu chỉ thấy MỘT dòng (không có dòng lựa chọn) → ghi FAIL kèm ảnh (nghi quản lý không đọc được bảng lựa chọn món).
5. Bán 1 Tháp nhỏ → tồn trừ theo số vừa gắn.

Kết quả: ☐ PASS ☐ FAIL

## Bài 19. Điện thoại 375px — đi một vòng

Trên điện thoại thật (hoặc DevTools 375 × 812), lần lượt: tab Tồn kho (thẻ, tìm, lọc, công tắc) · form Thêm hàng hoá · form phiếu nhập
(dòng xếp dọc, nút Thêm dòng, chân hộp có Lưu + lỗi) · danh sách phiếu (bấm cả thẻ để mở) · form kiểm kho (cả khi bật giá vốn: Máy | Đếm
một hàng, Giá vốn dòng riêng) · thẻ kho · màn Tạm hết của quản lý (nút Trừ kho + hộp Trừ kho).

- Không màn nào cuộn ngang; chữ nhỏ nhất vẫn đọc được; nút bấm vừa ngón tay; nút Lưu ở chân hộp luôn thấy được.

Kết quả: ☐ PASS ☐ FAIL

## Bài 20. Đối chiếu số liệu bằng SQL

1. Mở SQL editor của Supabase, dán nguyên `docs/testing/yen-garden/sql/kho-verify.sql` (mặc định tìm quán tên chứa "Yên Garden";
   quán khác thì sửa dòng `kho_params`).
2. Kết quả: toàn **`NOTICE: PASS …`** (stock_matches, sales_today, links_valid, receipt_totals, count_lines, anchor_*, quyền…), **không có `FAIL`**.
   File chỉ đọc và kết thúc bằng ROLLBACK.

Kết quả: ☐ PASS ☐ FAIL

---

## Không test ở đây

- **Phiếu chi tự tạo** khi phiếu nhập "Đã trả" và **huỷ phiếu chi cùng** phiếu nhập là bài của **mig 122b** (sổ thu chi), không test ở mig 118.
  Mig 118 chỉ lưu `paid_status` + `paid_method` và để sẵn hai dòng neo.
- Giá vốn (`inventory_cogs`) không có màn riêng — dùng ở báo cáo lãi lỗ (plan BC).
- **Lưu ý khi đọc lại báo cáo kỳ cũ:** bảng hàng hoá không lưu ngày ngừng dùng (`deactivated_at`). Giá vốn bỏ nguyên liệu đã ngừng dùng mà không biến động trong kỳ dựa trên trạng thái HIỆN TẠI, nên chạy lại báo cáo một kỳ cũ sau khi ngừng dùng một nguyên liệu có thể ra cờ "chưa kiểm" / tổng nguyên liệu khác lần chạy trước. Muốn số kỳ cũ cố định thì chốt (xuất Excel / in) trước khi ngừng dùng hàng.
