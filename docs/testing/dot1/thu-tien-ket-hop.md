# A — Thu tiền kết hợp (mig 112a + 112b)

Màn Thanh toán POS có bốn lựa chọn: Tiền mặt · Chuyển khoản · **Kết hợp** · Ghi nợ (Ghi nợ thêm từ mig 123, kiểm ở `docs/testing/yen-garden/CONG-NO.md`, không thuộc bài này). Mọi lần thu tiền bàn đi qua RPC `collect_table_bill`, và từ 2026-11-11 chỉ còn MỘT nơi thu là POS
(`/staff/tables` và ngăn kéo A04 không còn nút thu): một lần thu = một khoản, mỗi phương tiện = một dòng. A04, Excel và hoá đơn
in lại hiện từng khoản.

Spec `docs/superpowers/specs/2026-11-05-dot1-thanh-toan-ca-in-vietqr-design.md` §3 · Plan
`docs/superpowers/plans/2026-11-05-dot1-a-thu-tien-ket-hop.md`.

## Trước khi test

- **(Đã lỗi thời 2026-11-15)** mig 112a→129 đã áp prod (ghi chú dự án) nên bỏ qua thứ tự áp dưới đây; bài 14 không dựng lại được (xem bài 14). Gốc: mig **112a** lên prod → merge + Vercel lên code mới → test **bài 1–13** → nhờ quán **tải lại POS** →
  áp mig **112b** → test **bài 14, 15**. Áp 112b sớm hơn thì tab POS cũ bấm Thanh toán sẽ báo "tải lại trang".
- Test trên **Bia lẩu Bảo Lương** (hoặc Yên Garden nếu đã có bàn), đăng nhập POS bằng chủ quán; bài 10 cần thêm tài
  khoản thu ngân.
- Mỗi bài dùng một bàn riêng, dọn xong mới sang bài sau.
- **Dựng bill có món:** nút **Khách lẻ** → chọn bàn → chọn món → gửi.

> **ĐÂY LÀ QUÁN THẬT.** Các bài 1, 2, 3, 6, 7, 10, 13 thu tiền thật nên **cộng vào doanh thu hôm nay** và **không xoá
> được** khỏi báo cáo. Chọn **món rẻ nhất** của menu, test **ngoài giờ mở cửa**, và **ghi lại từng số đã thu** vào
> bảng dưới để trừ khi đối chiếu két / báo cáo ngày. Các con số trong bài (1.000.000đ, 400.000đ…) chỉ để minh hoạ phép
> tính; với món rẻ thì tự tính lại theo cùng công thức.

| Bài | Bàn | Đã thu thật (ghi lại) |
|---|---|---|
| 1 | Bàn 1 | ……… đ (tiền mặt) |
| 2 | Bàn 2 | ……… đ (chuyển khoản) |
| 3 | Bàn 3 | ……… đ (kết hợp) |
| 6 | Bàn 6 | ……… đ (kết hợp) |
| 7 | Bàn 7 + Bàn 8 (hai bill riêng, gộp khi thu) | ……… đ (kết hợp) |
| 10 | (bỏ — xem bài 10) | — |
| 13 | Bàn 13 (ngắt mạng) — BẮT BUỘC | ……… đ |
| **Tổng doanh thu giả** | | **……… đ** |

## Các bài

| Bài | Việc | Mong đợi | Kết quả |
|---|---|---|---|
| 1 | Thu **Tiền mặt**, ô khách đưa gõ số lớn hơn bill (hoặc bấm nút gợi ý, có mốc làm tròn 10.000) | Hiện "Tiền thối lại cho khách" đúng số; thu xong bàn trống. A04: dòng bill ghi **Tiền mặt** | 👤 anh Tú (thu thật). Agent ✓ logic: `cash-change.test`, `payment-method-fields.test` "tiền mặt: có ô tiền khách đưa", SQL `112a_collect_table_bill` "một phương tiện" (15/11). |
| 2 | Thu **Chuyển khoản** | Có câu nhắc "nghe loa báo tiền về đủ …"; không có ô khách đưa. A04 ghi **Chuyển khoản** | 👤 anh Tú (thu thật). Agent ✓ logic: `payment-method-fields.test` "chuyển khoản: nhắc nghe loa, không có ô khách đưa"; SQL 112a "chuyển khoản một phương tiện" (15/11). |
| 3 | Bill 1.000.000: chọn **Kết hợp**, gõ ô Tiền mặt 400.000 → ô Chuyển khoản **tự thành 600.000**; khách đưa 500.000 | Tiền thối **100.000** (so với phần tiền mặt, không so cả bill). Trên nút thu có dòng "Tiền mặt 400.000đ · Chuyển khoản 600.000đ"; nhắc nghe loa đủ **600.000đ** | 👤 anh Tú (thu thật). Agent ✓ logic: `collect-payment.test`, `payment-method-fields.test` "kết hợp: tiền thối theo PHẦN TIỀN MẶT" + "nhắc nghe loa đúng số chuyển khoản"; SQL 112a "kết hợp: 2 dòng… thối theo phần tiền mặt" (15/11). |
| 4 | Xem bill bài 3 ở **A04** (bảng + ngăn kéo Xem bill), **Xuất Excel**, **phiếu cuối ngày**, **In lại hoá đơn** | Nhãn **"Kết hợp"**. Ngăn kéo có khối "Các khoản đã thu": Tiền mặt 400.000 · Chuyển khoản 600.000 · Khách đưa 500.000 · Tiền thối 100.000. Excel: cột Tiền mặt 400.000, Chuyển khoản 600.000, Khác trống. Hoá đơn in lại có đủ 4 dòng đó dưới tổng. Thẻ TM + CK + khác của A04 và phiếu cuối ngày **cộng đúng doanh thu** | 👤 anh Tú nhìn A04 / Excel / hoá đơn in lại. Agent ✓ logic: `app/print/bill/print-bill.test.tsx` "in lại bill đã thu: từng khoản, khách đưa, tiền thối"; SQL `112a_payment_readers` "TM + CK + khác = doanh thu" (15/11). |
| 5 | Kết hợp, gõ hai ô **không** cộng đúng tổng (vd sửa ô Chuyển khoản thành số khác) | Chữ đỏ "Tổng hai khoản phải đúng …đ"; **nút thu khoá**; không có câu nhắc nghe loa. Dọn — bỏ bàn | 👤 anh Tú (không thu tiền, làm cùng bàn bài 3). Agent ✓ logic: `collect-payment.test` "tổng đổi hoặc gõ sai: không có dòng, có lỗi", `payment-method-fields.test` "kết hợp còn lệch: hiện lỗi" + "đang lệch: ẩn nhắc nghe loa" (15/11). |
| 6 | Bill có **giảm giá %** (Thanh toán → Thêm giảm giá → 10%), thu Kết hợp | Gõ một ô, ô kia tự điền theo **số SAU giảm**; thu được; A04 đúng số sau giảm | 👤 anh Tú (thu thật). Agent ✓ logic: SQL 112a "gộp 2 mâm có giảm giá: chia xong mới so ở cấp cả nhóm", `bill-qr.test` (số sau giảm) (15/11). |
| 7 | Hai bàn riêng → **Gộp bill** → Thanh toán → thu Kết hợp | A04 chỉ **một dòng** cho cả hai mâm (nhãn Ghép), từng khoản đúng | 👤 anh Tú (thu thật). Agent ✓ logic: SQL 112a "gộp 2 mâm…", `112a_payment_readers` "gộp N mâm thu một lần: MỘT dòng bill" (15/11). |
| 8 | Mở màn Thanh toán chọn Kết hợp (đã gõ đủ số), **máy khác** gọi thêm món cho bàn đó, rồi bấm thu | Báo "**Số tiền không khớp bill** … Tải lại bill rồi thu lại"; **bill chưa đóng**, không có khoản thu nào ghi; màn hiện số mới, thu lại được. Dọn — bỏ bàn hoặc thu | Agent ✓ trên hàm ĐANG chạy prod (sau mig 122/123/129/132): `supabase/tests/race/01-collect-table-bill.test.mjs` ca "1c. thu tiền ‖ pos_add_manual_items / create_order / staff_create_order" (vòng chẵn thu số CŨ khi máy kia vừa thêm món: báo `Số tiền không khớp bill`, phiên còn `open`; không món nào lọt vào phiên đã thu); `npm run test:race` (Postgres thật trong Docker, `main` @ dd971b3, áp migration tới 140) ngày 15/11/2026: **40/40 pass, 0 fail**, log `.harness/verify/race-2026-11-15.log` (repo gốc). Logic UI: `collect-outcome.test` "bill vừa đổi (số lệch): stale, giữ nguyên câu của server"; SQL 112a "lệch một đồng" (thân hàm 112a cũ, chỉ để tham khảo). 👤 tuỳ chọn (xem hai máy bằng mắt). |
| 9 | Mở **hai tab** POS cùng một bàn, cùng vào Thanh toán; tab 1 thu xong (vd Tiền mặt), rồi tab 2 chọn **Chuyển khoản** bấm thu | Tab 2 báo "**Bàn đã được thu trước đó: Tiền mặt …đ**" (đúng khoản tab 1 đã ghi, không phải chuyển khoản); A04 chỉ **một** khoản cho bàn này | Agent ✓ trên hàm ĐANG chạy prod: `supabase/tests/race/01-collect-table-bill.test.mjs` ca "1a. hai thu ngân thu cùng một bàn, khác mã: đúng một khoản thu (25 vòng)" (vòng lẻ một máy Tiền mặt, một máy Chuyển khoản: đúng một khoản thu; bên thua nhận `already` kèm ĐÚNG khoản bên thắng đã ghi, không phải thứ nó vừa gửi) + "1a. dựng xen kẽ: máy 1 ROLLBACK → máy 2 thu trọn vẹn"; `npm run test:race` (Postgres thật trong Docker, `main` @ dd971b3, áp migration tới 140) ngày 15/11/2026: **40/40 pass, 0 fail**, log `.harness/verify/race-2026-11-15.log` (repo gốc). Logic UI: `collect-outcome.test` "already kèm khoản đã ghi: báo ĐÚNG cái đã ghi". 👤 tuỳ chọn (hai tab bằng mắt). |
| 10 | ~~Thu ở `/staff/tables` và A04~~ — **bỏ từ 2026-11-11** (chỉ thu tiền bàn ở POS). Mở `/staff/tables` bằng tài khoản thu ngân và ngăn kéo A04 của một bàn chờ thu | Cả hai nơi KHÔNG còn nút thu, chỉ còn dòng "Thu tiền ở POS (Thanh toán)" | Agent ✓ đọc code: `app/staff/tables/tables-client.tsx:33` (`Thu tiền ở POS (Thanh toán)`), `lib/bills-report.ts:245` cho ngăn kéo A04 (15/11). 👤 xem lướt nếu tiện. |
| 11 | Xem một bill **đã thu trước khi áp 112a** ở A04 và Excel | Hiện như cũ: một phương thức, hoặc "**Nhiều phương thức**" nếu bill đó trộn phương thức ("Kết hợp" chỉ dành cho bill thu sau 112a có từng khoản); không có khối "Các khoản đã thu"; Excel: TM hoặc CK đủ số, bill trộn / ví nằm ở cột **Khác** | Agent ✓ DB: `112a_payment_readers` "bill cũ chưa có bill_payment_id: khoá và số giữ nguyên như trước" (15/11). 👤 tuỳ chọn: mở một bill cũ trên A04. |
| 12 | **Bỏ bàn** một bàn có món chưa nấu | Vẫn chạy như trước; bàn trống; **không** vào doanh thu, không có khoản thu | Agent ✓ một phần, KHÔNG đủ: `112b_lock_old_paid_path` "Bỏ bàn vẫn chạy, không tạo khoản thu" chạy trên thân `close_table_session` bản 112 (`supabase/tests/prod-defs/112/`), còn prod đã đổi đường đóng phiên ở mig 129 (`close_table_session_core`); không test PGlite hay test đua nào nạp thân hàm hiện hành cho nhánh `staff_reset` (đã grep 15/11). 👤 anh Tú: làm cùng lượt thu tiền, một bàn có món chưa nấu, bấm Bỏ bàn, rồi kiểm A04 không có khoản thu mới và doanh thu không tăng. |
| 13 | Màn Thanh toán chọn **Tiền mặt**, **ngắt mạng** máy POS (tắt Wi-Fi) **ngay sau khi bấm** "Xác nhận đã nhận"; bật lại mạng; màn báo lỗi kết nối → **đổi sang Chuyển khoản** rồi bấm lại | Nếu lần đầu server đã ghi: báo "**Bàn đã được thu trước đó: Tiền mặt …đ**" (nói rõ ĐÃ GHI tiền mặt, không ghi thêm chuyển khoản); A04 chỉ **một** khoản, phương thức **Tiền mặt**. Nếu lần đầu chưa tới server: thu bình thường bằng Chuyển khoản | **👤 anh Tú BẮT BUỘC** (thu tiền thật, ngắt Wi-Fi thật). Máy chưa khẳng định được điều bài này cần: không có test nào chứng minh `clientRequestId` GIỮ NGUYÊN sau lỗi mạng rồi người dùng đổi phương thức. Phần máy đã kiểm chỉ là mảnh rời: `collect-outcome.test` "server action ném (mất mạng): retry, KHÔNG ném" + "already kèm khoản đã ghi"; SQL 112a "mất phản hồi rồi đổi cách thu, bấm lại cùng mã: already trả ĐÚNG khoản đã ghi" (thân hàm 112a cũ); race `1b. cùng mã chống trùng gửi hai lần song song` (cùng mã, KHÔNG đổi phương thức). |
| 14 | **Sau khi áp 112b:** một tab POS **chưa tải lại** (code cũ) bấm Thanh toán → thu | Báo "**Màn thu tiền đã cập nhật, tải lại trang rồi thu lại**"; bill chưa đóng. Tải lại trang thì thu được bình thường | Không dựng lại được (112b đã áp prod, không còn tab "code cũ + DB cũ"). Agent ✓ DB: `112b_lock_old_paid_path` "thu bằng đường cũ bị từ chối, đơn không đổi" (15/11). |
| 15 | **Sau khi áp 112b:** chủ quán thử huỷ / sửa tiền một đơn **đã thu** bằng cách gọi thẳng API (Supabase dashboard dưới vai chủ quán, hoặc nhờ Claude chạy SQL `SET ROLE authenticated`) | Báo "**Đơn đã thu tiền, không huỷ hay sửa số tiền được**"; nút "Hoàn tất" ở A04 (đóng đơn) vẫn chạy | Agent ✓ DB: `112b_lock_old_paid_path` "đơn ĐÃ THU: client không huỷ, không sửa tiền được; đóng đơn vẫn được" (15/11). |

## SQL kiểm bất biến (controller, chỉ đọc)

> Agent không có quyền SQL prod: 👤 anh Tú (hoặc phiên có Supabase MCP) chạy trên prod sau khi làm xong bài 1–13. Phiên bản chạy trên PGlite đã nằm trong `112a_payment_readers.test.mjs` (xanh 15/11).

Chạy sau bài 1–13 và sau bài 15. Kết quả phải **0 dòng**: mỗi khoản thu có tổng các dòng = tổng khoản = tổng các đơn
mang khoản đó.

```sql
SELECT bp.id FROM bill_payments bp
LEFT JOIN LATERAL (SELECT COALESCE(SUM(amount), 0) s FROM bill_payment_lines WHERE payment_id = bp.id) l ON true
LEFT JOIN LATERAL (SELECT COALESCE(SUM(total_amount), 0) s FROM orders WHERE bill_payment_id = bp.id AND status <> 'cancelled') o ON true
WHERE l.s <> bp.total_amount OR o.s <> bp.total_amount;
```

Bài 13 cần ngắt mạng đúng lúc nên có thể làm vài lần; điều cần kiểm là KHÔNG BAO GIỜ thấy câu "đã được chốt"
chung chung khi đã có khoản ghi — câu báo phải nêu đúng phương tiện đã ghi.

Sau bài 15 chạy lại `docs/testing/chuyen-ban-giam-gia/sql/gg-verify.sql` và `gg2-verify.sql` (đã đổi sang
`collect_table_bill`, tự ROLLBACK): phải in "TẤT CẢ CA ĐÃ PASS".
