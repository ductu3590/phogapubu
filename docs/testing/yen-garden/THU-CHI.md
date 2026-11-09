# Yên Garden — Ca thu ngân + Sổ thu chi (mig 122, 122b)

Thu ngân mở ca, thu/chi tiền két, kết ca đối chiếu két ngay trên POS ("đếm trước, thấy sau"); chủ quán + quản lý ghi mọi
khoản thu/chi ngoài bán hàng (tiền mặt + chuyển khoản) ở trang **Thu chi**; phiếu nhập kho đã trả tự sinh phiếu chi.

Spec: `docs/superpowers/specs/2026-11-09-yg-so-thu-chi-design.md`, `2026-11-05-dot1-thanh-toan-ca-in-vietqr-design.md` §4 B2, B4 ·
Plan: `docs/superpowers/plans/2026-11-09-yg-ca-so-thu-chi.md` · Migration: `supabase/migrations/122_cash_shift_cashbook.sql`,
`122b_inventory_cashbook.sql` · Kiểm số liệu: `docs/testing/yen-garden/sql/thu-chi-verify.sql`

Công thức két (chỉ server tính): **Tiền dự kiến = tiền đầu ca + tiền mặt thu bill + khách trả nợ TM + phiếu thu TM − phiếu chi TM**;
**Chênh lệch = tiền đếm được − tiền dự kiến** (âm = thiếu).

## Ghi chú triển khai (Controller áp — trước khi anh Tú test)

1. **Phụ thuộc:** 122 cần 112a + 112b (thu tiền kết hợp, khoá đường thu cũ), 116 (vai Quản lý, `is_store_back_office`) và
   111 (ngày kinh doanh) đã áp; 122b cần 118 (kho) + 122. Thứ tự hợp đồng: 112a/b → 116 → 117 → 118 → 121 → **122 → 122b** → 123 → 125.
   Khối `$pre$` của 122 / 122b raise nếu thiếu, nên áp sai thứ tự sẽ dừng sạch.
2. **Áp 122 + 122b trong CÙNG một đợt phát hành, TRƯỚC khi bất kỳ quán nào bật "Bắt buộc mở ca"** (công tắc mặc định tắt
   nên áp xong chưa ai bị ảnh hưởng). Chưa có 122b mà quán đã bật ca thì phiếu nhập trả tiền mặt không sinh phiếu chi → két lệch.
3. **Trước 122:** chạy `pg_get_functiondef` trên prod cho `collect_table_bill`, `confirm_manual_payment`,
   `kitchen_confirm_payment`, `store_workflow_snapshot`; mỗi chuỗi neo trong mục 10 + 13 của 122 phải khớp đúng 1 lần
   (neo của 3 RPC thu chép từ file 112a — kiểm lại trên prod). Lệch thì không áp, báo lại.
4. **Trước 122b:** `pg_get_functiondef` trên prod của `inventory_post_document(text,jsonb,jsonb,uuid)` và
   `inventory_void_document(uuid,text)` phải còn ĐỦ hai dòng `  -- mevo-anchor:122b inventory_post_document.cash_book(v_doc_id)` /
   `  -- mevo-anchor:122b inventory_void_document.cash_book(v_doc_id)` (comment có thể bị lược khi áp 118 lên prod — mất neo
   là 122b raise; khi đó áp lại 118 nguyên văn hoặc báo lại, KHÔNG sửa tay). Mỗi neo khớp đúng 1 lần.
5. Áp nội dung LF: `git show <nhánh>:supabase/migrations/122_cash_shift_cashbook.sql` rồi `…/122b_inventory_cashbook.sql`.
   122b in `NOTICE mig 122b: backfill N phiếu chi …` — ghi lại N.
6. Kiểm sau áp: `SELECT count(*) FROM store_workflow_settings WHERE require_cash_shift` = 0; mỗi quán 11 dòng
   `cash_book_categories`; thu một bill ở quán không bật ca vẫn được, `bill_payments.cash_shift_id` NULL; chạy
   `sql/thu-chi-verify.sql` → mọi ca PASS.
7. Deploy Vercel. Công tắc mặc định tắt nên deploy trước hay sau migration đều không vỡ (POS đọc trạng thái ca lỗi → coi như tắt).
8. **Không bật công tắc cho quán thật trước khi anh Tú PASS.**

## Quy tắc đã chốt (đừng báo nhầm là lỗi)

- **"Đếm trước, thấy sau" chỉ là quy tắc GIAO DIỆN**, không chặn ở RLS: thu ngân vẫn tự tính được tiền dự kiến từ số tiền mặt
  theo ngày ở A04 (Hoá đơn & Báo cáo). Chấp nhận — thu ngân cần A04.
- **Bill bàn 0đ khi quán bật ca mà chưa mở ca: bị chặn "Chưa mở ca"** (vẫn ghi một khoản thu 0đ). Đơn lẻ 0đ (xác nhận tay /
  bếp) không tạo khoản thu nên không bị chặn. Chấp nhận.
- Ca độc lập với ngày kinh doanh; một ca đóng một lần, không mở lại, không sửa. Không tự đóng ca.
- Thu ngân chỉ ghi phiếu **tiền mặt tại két** (Thu/Chi két), **không huỷ** phiếu; chủ quán + quản lý ghi TM + CK, huỷ, sửa danh mục.
- Phiếu tiền mặt chỉ huỷ được khi ca của nó còn mở. Phiếu chuyển khoản không gắn ca, huỷ lúc nào cũng được.
- Phiếu nhập trả tiền mặt khi quán bật ca mà chưa mở ca → **chặn cả phiếu nhập**. Huỷ phiếu nhập trả tiền mặt sau khi ca kết → **chặn**.
- Phiếu nhập ghi lùi ngày mà trả tiền mặt: phiếu chi mang ngày HÔM NAY, gắn ca đang mở (tiền ra khỏi két hôm nay).

## Trước khi test

- Test trên **quán thử** (hoặc Yên Garden CHƯA mở bán), ngoài giờ mở cửa, dùng món rẻ nhất. **Không** test trên Bảo Lương.
- Cần 3 tài khoản của quán đó: **chủ quán**, **quản lý**, **thu ngân**. Đặt mã PIN khoá POS cho máy test (bài 18).
- Mỗi bài ghi PASS/FAIL. FAIL thì chụp màn hình + ghi bước. Sau bài 9 và bài 16 chạy `sql/thu-chi-verify.sql`.

---

## Bài 1. Công tắc tắt — như hôm nay
1. Chủ quán → POS. Thanh trên KHÔNG có nút "Mở ca", "Ca thu ngân", "Thu/Chi két".
2. Thu một bill tiền mặt bình thường. A04 không có tab "Ca" (quán chưa có ca nào).
- [ ] PASS / FAIL

## Bài 2. Bật công tắc
1. ⚙ Cài đặt → Cài đặt chung → khối **Ca thu ngân** → gạt **Bắt buộc mở ca trước khi thu tiền** → "Đã lưu".
2. Về POS (tải lại): tự hiện hộp **Mở ca thu ngân** MỘT lần; bấm **Để sau** → xem POS bình thường.
3. Thanh trên có **Mở ca** và **Thu/Chi két** bị khoá (rê chuột: "Mở ca trước").
- [ ] PASS / FAIL

## Bài 3. Chưa mở ca thì không thu được
1. Thu một bàn ở POS → báo **Chưa mở ca**, hộp **Mở ca thu ngân** tự bật; bàn KHÔNG bị đóng dở, màn Thanh toán còn mở.
2. Thử thu ở `/staff/tables` và ngăn kéo A04 → cùng báo **Chưa mở ca**.
- [ ] PASS / FAIL

## Bài 4. Mở ca + thu 3 bill
1. Mở ca, Tiền đầu ca `500.000` → nút đổi thành **Ca thu ngân · từ HH:MM**; băng lỗi "Chưa mở ca" tự mất.
2. Bấm thu lại bàn ở bài 3 (cùng màn) → thu được, không bị ghi 2 lần.
3. Thu thêm 1 bill chuyển khoản và 1 bill **Kết hợp** (TM + CK).
- [ ] PASS / FAIL

## Bài 5. Thu/Chi két
1. **Thu/Chi két** → Chi · `50.000` · Đá → Ghi phiếu chi.
2. **Thu/Chi két** → Thu · `100.000` · Nộp thêm vào két → Ghi phiếu thu.
3. Chi · danh mục **Khác** · không ghi chú → nút **Ghi phiếu chi** khoá ("Danh mục này cần ghi chú").
4. Bấm nút ca → panel ca: phiếu thu hiện `+100.000đ`, phiếu chi `−50.000đ`.
- [ ] PASS / FAIL

## Bài 6. Huỷ phiếu (quản lý), thu ngân không huỷ được
1. Đăng nhập **thu ngân** → panel ca: KHÔNG có nút **Huỷ phiếu**.
2. Đăng nhập **quản lý** → panel ca → Huỷ phiếu chi Đá, lý do bắt buộc → phiếu gạch ngang, "Đã huỷ".
- [ ] PASS / FAIL

## Bài 7. Kết ca đếm khớp
1. Bấm **Kết ca**: hộp chỉ có ô **Tiền đếm được** + ghi chú, KHÔNG thấy số dự kiến.
2. Nhập đúng số trong két → **Xác nhận kết ca** → kết quả: Tiền dự kiến, Tiền đếm được, Chênh lệch **Khớp**.
3. **In phiếu bàn giao** (80mm): người mở/kết, giờ, tiền đầu ca, tiền mặt thu bill, phiếu thu/chi TM, dự kiến, đếm được,
   chênh lệch, số bill, tổng TM, tổng CK, dòng thu/chi theo danh mục (không có phiếu đã huỷ), ký Người giao / Người nhận.
- [ ] PASS / FAIL

## Bài 8. Kết ca lệch
1. **Mở ca mới** (từ hộp kết quả). Thu 1 bill TM. Kết ca, nhập ít hơn 50.000 → **Thiếu 50.000đ**.
2. In phiếu → đủ dòng như bài 7, chênh lệch "Thiếu 50.000đ".
3. Mất mạng lúc kết ca: mở ca mới, mở hộp **Kết ca**, nhập số đếm. Mở DevTools → Network → **Offline**, bấm **Xác nhận kết ca**
   → báo lỗi kết nối, ô số đếm vẫn giữ. Bật lại **Online**, bấm **Xác nhận kết ca** lần nữa (cùng số) → ra kết quả bình thường;
   tab Ca ở A04 chỉ có MỘT ca vừa đóng (không kết hai lần). Nếu lần đầu thật ra đã tới server thì lần hai hiện câu "Ca này đã kết
   trước đó — đây là kết quả đã lưu".
- [ ] PASS / FAIL

## Bài 9. Kết ca khi còn bàn mở
1. Mở ca, mở một bàn chưa thu, bấm Kết ca → cảnh báo "Còn N bàn đang mở. Tiền thu sau khi kết sẽ vào ca kế tiếp."
2. Kết ca, mở ca mới, thu bàn đó → tiền vào ca mới (tab Ca ở A04).
3. Chạy `sql/thu-chi-verify.sql` → mọi ca PASS.
- [ ] PASS / FAIL

## Bài 10. Tắt công tắc khi còn ca mở
1. Còn ca mở → ⚙ Cài đặt → gạt tắt → báo **Còn ca đang mở, kết ca trước khi tắt**, công tắc trả về bật.
- [ ] PASS / FAIL

## Bài 11. Ca quên kết
1. Trên quán thử chạy `UPDATE cash_shifts SET opened_at = now() - interval '2 days' WHERE store_id = '<quán thử>' AND status = 'open';`
2. POS hiện băng vàng **Ca mở từ … chưa kết** với 2 nút.
3. **Tiếp tục gộp vào ca đó** → băng mất (không hiện lại trong ngày kinh doanh này); kết ca → phiếu in **Ca gộp qua 3 ngày**.
4. Làm lại bước 1 với ca khác, chọn **Kết ca cũ rồi mở ca mới** → mở hộp kết ca của ca cũ.
- [ ] PASS / FAIL

## Bài 12. Tab Ca (Hoá đơn & Báo cáo)
1. Chủ quán, quản lý: tab **Ca** thấy mọi ca (60 ca gần nhất); ca đang mở hiện "Đang mở", không có dự kiến / chênh lệch.
2. Bấm một ca đã đóng → chi tiết + danh sách phiếu thu/chi TM + **In lại phiếu**. Ca đang mở: không có số két, không có nút in.
3. Thu ngân: chỉ thấy ca mình mở hoặc kết; gõ tay `/print/shift-report?id=<ca của người khác>` → "Không có quyền xem ca này".
- [ ] PASS / FAIL

## Bài 13. Trang Thu chi (quản lý)
1. Rail → **Thu chi** (hộp thoại đè POS; F5 ra trang đầy đủ).
2. **+ Phiếu chi** · Chuyển khoản · Điện nước khi KHÔNG có ca mở → ghi được (không gắn ca).
3. **+ Phiếu chi** · Tiền mặt khi không có ca → báo **Chưa mở ca**.
4. Lọc theo ngày / Thu-Chi / Tiền mặt-Chuyển khoản / danh mục; ô tổng (Tổng thu, Tổng chi, Chênh lệch, mỗi ô tách TM / CK) khớp danh sách.
5. **Xuất Excel** → mở được; sheet Tổng khớp ô tổng màn hình, sheet Phiếu đủ dòng (phiếu huỷ ghi "Đã huỷ: lý do").
- [ ] PASS / FAIL

## Bài 14. Danh mục
1. **Danh mục** → tab Chi → thêm "Rác thải" (Chi phí vận hành) → đổi tên → Ẩn → Hiện lại.
2. Dòng **Nhập hàng** có nhãn "Hệ thống", không có nút Đổi tên / Ẩn; ô chọn nhóm không có "Nhập hàng".
3. Danh mục đã có phiếu: đổi nhóm báo cáo bị chặn (đổi tên vẫn được).
- [ ] PASS / FAIL

## Bài 15. Điện thoại 375px
1. Mở trang Thu chi và POS (nút ca, hộp Thu/Chi két, hộp kết ca) ở bề rộng 375px: đọc được, không cuộn ngang trang.
- [ ] PASS / FAIL

## Bài 16. Kho ↔ sổ thu chi (122b)
1. Kho → Nhập hàng → **Đã trả · Chuyển khoản** → lưu → trang Thu chi có phiếu chi **Nhập hàng** nguồn "Phiếu nhập kho · Huỷ ở trang Kho", không có nút Huỷ.
2. Kho → huỷ phiếu nhập đó → hộp huỷ báo "Phiếu chi tương ứng trong sổ thu chi sẽ huỷ cùng"; phiếu chi gạch ngang.
3. Quán đang bật ca, KHÔNG có ca mở: nhập hàng **Đã trả · Tiền mặt** → báo "Chưa mở ca — mở ca trên POS hoặc chọn Chuyển khoản / Chưa trả", KHÔNG có phiếu nhập.
4. Mở ca, nhập hàng trả tiền mặt → phiếu chi gắn ca (panel ca thấy). Kết ca, rồi huỷ phiếu nhập đó → bị chặn "… trong ca đã kết — không huỷ được"; phiếu nhập vẫn còn.
5. Ghi lùi ngày nhập + Tiền mặt → form báo "tiền mặt vẫn tính ra khỏi két hôm nay".
6. Chạy `sql/thu-chi-verify.sql` → mọi ca PASS.
- [ ] PASS / FAIL

## Bài 17. Thu ngân ở trang Thu chi
1. Đăng nhập **thu ngân** → rail có **Thu chi**; mở được (gõ tay `/admin/cashbook` cũng được).
2. Chỉ thấy các phiếu **do chính mình ghi** (Thu/Chi két); không thấy phiếu của chủ quán / quản lý.
3. KHÔNG có nút **+ Phiếu thu**, **+ Phiếu chi**, **Danh mục**, **Huỷ phiếu**.
4. **Xuất Excel** → file chỉ có phiếu của mình, đúng bằng màn hình.
- [ ] PASS / FAIL

## Bài 18. Hộp mở ca không đè màn khoá PIN
1. Quán đang bật ca, chưa có ca mở. Trên POS bấm ổ khoá → màn khoá PIN.
2. Tải lại trang (F5): vẫn là màn khoá, **KHÔNG** có hộp "Mở ca thu ngân" nổi lên trên.
3. Nhập PIN mở khoá → lúc đó hộp **Mở ca thu ngân** mới hiện.
- [ ] PASS / FAIL
