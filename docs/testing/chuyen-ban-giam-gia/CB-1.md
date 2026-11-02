# CB-1 — Chuyển bàn (2026-11-02)

Nhánh `feat/chuyen-ban-giam-gia-bill` · Spec `docs/superpowers/specs/2026-11-02-chuyen-ban-giam-gia-bill-design.md` §3
Test trên **Bia lẩu Bảo Lương** (chủ quán hoặc thu ngân đăng nhập POS). **Migration 104 + 105 đã áp prod** — không cần làm gì thêm về DB.

## Cách làm cho khỏi nhầm

- **Mỗi bài dùng bàn riêng** (bảng dưới) và **dọn bàn xong mới sang bài sau**. Bài nào có dòng "Dọn" thì làm đủ dòng đó — nếu bỏ qua, bài sau sẽ báo FAIL oan (bàn đích còn đang có khách).
- **"Dọn — bỏ bàn"** = POS → mở bill bàn đó → **Thao tác khác** → **Bỏ bàn (không thu tiền)**.
- **"Dọn — thu tiền"** = POS → bill bàn đó → **Thanh toán** → **Xác nhận đã nhận** (tiền mặt). Chỉ dùng ở bài 1 và 5 (để bài 12 xem lại trong báo cáo). Ghi món rẻ thôi, đơn này sẽ vào báo cáo hôm nay.
- **Dựng một bill có món trên POS** (khi bài cần "bàn đang có khách"): nút **Khách lẻ** → chọn bàn → ghi 1 món → gửi.
- **Hai điện thoại khác nhau**: **Điện thoại 1** (khách A) và **Điện thoại 2** (khách lạ / khách B). "Khách lạ" phải là **máy khác hẳn**, KHÔNG phải cùng máy đăng nhập tài khoản Zalo khác — hệ thống nhận khách theo tài khoản Zalo **hoặc** theo máy, nên cùng một máy đổi tài khoản vẫn có thể bị nhận ra.

| Bài | Bàn nguồn | Bàn đích / bàn khác |
|---|---|---|
| 1 | Bàn 1 | Bàn 12 |
| 2 | Bàn 2 | Bàn 3 (đang có khách, phải KHÔNG hiện) |
| 3 | Bàn 4 | Bàn 15 (đang giữ đặt bàn, phải KHÔNG hiện) |
| 4 | Bàn 5 | Bàn 16 (có lịch đặt muộn) |
| 5 | Mâm Bàn 6 + Bàn 7 | Bàn 13 |
| 6 (app cũ) | Bàn 8 | Bàn 17 |
| 7, 8, 9 (app mới) | Bàn 9 | Bàn 18 |
| 10 | Bàn 10 | Bàn 19 |
| 11 | Bàn 11 | Bàn 20 |
| 12 | (xem lại bill bài 1) | |

## 0. Chuẩn bị (làm TRƯỚC khi test)

**A. Admin-web (POS + A04) — bài 1–5 và 12; cũng cần để thao tác POS ở bài 6–11**
Đang chưa deploy Vercel, nên chạy local từ worktree của nhánh này (đã có `.env.local` sẵn, trỏ đúng Supabase prod):
```
cd D:\Code\mevo\.claude\worktrees\chuyen-ban-giam-gia-bill\admin-web
npm run dev
```
Mở `http://localhost:3000/admin/pos` (nếu cổng 3000 đang bận, terminal sẽ in cổng khác — dùng cổng đó). Đăng nhập tài khoản chủ quán / thu ngân Bảo Lương.
(Nếu nhánh đã merge `main` + push và Vercel đã deploy thì test thẳng trên domain, bỏ qua bước này.)

**B. Mini App — ĐỪNG làm bây giờ.** Làm đúng thứ tự: bài 1–5 → **bài 6 (bản Mini App CŨ)** → mục B dưới đây → bài 7–11. Lý do: khách thật hiện đang dùng bản đã publish cũ (QR in sẵn mở bản đó), bài 6 kiểm bản cũ đó trước khi bị thay.
Khi tới bước deploy (chỉ làm khi Claude báo "sprint sẵn sàng"):
```
cd D:\Code\mevo\mini-app-instances\bia-lau-bao-luong
git merge feat/chuyen-ban-giam-gia-bill
cd mini-app
zmp deploy
```
(Worktree quán dùng chung kho git với repo nên nhánh local này nhìn thấy được, không cần push.)
- Khi `zmp deploy` hỏi: chọn **Development** để tự test (QR/link Development mở bản mới); **Testing** chỉ khi muốn tạo bản gửi duyệt. Zalo giới hạn số lần deploy/tháng, đừng deploy thừa.
- ⚠️ Lệnh `git merge` ở trên kéo về **mọi commit hiện có** của nhánh tính năng (kể cả các phần khác của sprint, ví dụ giảm giá bill nếu đã có trên nhánh), không riêng chuyển bàn. Chỉ deploy khi Claude xác nhận nhánh đã sẵn sàng, đừng deploy nửa chừng.
- Mở Mini App bằng đúng QR/link của bản vừa deploy (bài 7–11 dùng bản này).

**C. Dữ liệu cần có**
Bàn 1–20 của Bảo Lương đang trống (hoặc bạn tự dọn trước). Cần dựng được: bill bàn lẻ có món, một mâm 2 bàn (Bàn 6 + Bàn 7), và hai lịch đặt bàn **Đã xác nhận** (làm ở bài 3, 4).

---

## Phần 1 — POS (admin-web)

> Bài 1 và 5 là **lần đầu nút "Chuyển sang bàn trống" được nhìn trên trình duyệt thật** (chưa ai xem bằng mắt). Nhìn kỹ bố cục ô chọn: nhãn, ô thả xuống, nhóm theo khu, chữ có bị cắt/tràn không — chỗ nào xấu hay khó bấm thì ghi vào FAIL kèm mô tả.

### 1. Bàn lẻ chuyển sang bàn trống
1. Dựng bill **Bàn 1** có khách + ít nhất 1 món (Khách lẻ). Mở bill → **Thao tác khác** → mục **"Chuyển sang bàn trống"**.
2. Ô thả xuống hiện **bàn trống nhóm theo khu**. Chọn **Bàn 12** — chọn là chuyển ngay, không hỏi lại.
3. Mong đợi: thông báo nổi màu xanh ở góc dưới **"Đã chuyển Bàn 1 → Bàn 12"**, tự tắt sau vài giây. Panel bill vẫn mở trên phiên đó nhưng tên bàn là **Bàn 12**; Timeline/sơ đồ: Bàn 1 trống, Bàn 12 có khách; tổng tiền và món **không đổi**.
4. **Dọn — thu tiền** bill Bàn 12 (để bài 12 xem lại).
- [ ] PASS  [ ] FAIL

### 2. Bàn đang có khách không có trong danh sách
1. Dựng bill có món ở **Bàn 2** và **Bàn 3** (hai bill riêng).
2. Mở bill Bàn 2 → "Chuyển sang bàn trống".
3. Mong đợi: **Bàn 3** (đang có khách) **không xuất hiện** trong danh sách; Bàn 2 (chính nó) cũng không có. Bàn trống thì có.
4. **Dọn — bỏ bàn** cả Bàn 2 và Bàn 3.
- [ ] PASS  [ ] FAIL

### 3. Bàn đang trong khung giữ đặt bàn không có trong danh sách
Luật: một lịch đặt bàn **Đã xác nhận** (khách chưa đến) giữ bàn **từ 60 phút TRƯỚC giờ hẹn cho tới khi hết khoảng giữ SAU giờ hẹn** (Bảo Lương: 120 phút). Lịch **Chờ xác nhận** (chưa bấm xác nhận) **không** giữ bàn và không bị cảnh báo gì.
1. Giả sử bây giờ là **19:00**. Tạo trên POS (Đặt bàn) một lịch **Bàn 15, giờ hẹn 19:30** rồi bấm **Xác nhận** (trạng thái phải là *Đã xác nhận*). Khung giữ của nó là 18:30 → 21:30, bây giờ nằm trong đó.
2. Dựng bill có món ở **Bàn 4** → "Chuyển sang bàn trống".
3. Mong đợi: **Bàn 15 không xuất hiện** trong danh sách.
4. (Thêm, không bắt buộc) đổi lịch đó về trạng thái chưa xác nhận hoặc tạo một lịch chưa xác nhận ở bàn khác trong cùng khung giờ → bàn đó **vẫn hiện** trong danh sách, chọn được không hỏi gì.
5. **Dọn**: huỷ lịch đặt Bàn 15; **bỏ bàn** Bàn 4.
- [ ] PASS  [ ] FAIL

### 4. Bàn có lịch muộn hơn trong ngày → hỏi xác nhận
Ví dụ bây giờ **19:00**. Lịch hẹn **21:00** (Đã xác nhận) có khung giữ bắt đầu từ 20:00 — chưa tới, nên Bàn 16 vẫn cho chuyển vào, nhưng POS phải hỏi lại.
1. Tạo lịch **Bàn 16, giờ hẹn 21:00** (hôm nay) và **xác nhận**. (Nếu test vào buổi tối muộn, chọn giờ hẹn cách bây giờ trên ~1 tiếng rưỡi nhưng vẫn trong hôm nay; sau 22:30 thì bài này không dựng được — để hôm sau.)
2. Dựng bill có món ở **Bàn 5** → "Chuyển sang bàn trống". Trong danh sách, **Bàn 16** hiện kèm chữ "· có khách đặt lúc 21:00".
3. Chọn Bàn 16. Mong đợi: hộp xác nhận của trình duyệt đúng nội dung: **"Bàn 16 có khách đặt lúc 21:00. Từ 20:00 khách không tự gọi món qua QR được. Vẫn chuyển?"**
4. Bấm **Huỷ** → không chuyển gì, bill vẫn ở Bàn 5. Chọn lại Bàn 16, bấm **OK** → chuyển thành công như bài 1.
5. **Dọn**: huỷ lịch đặt Bàn 16; **bỏ bàn** Bàn 16 (bill vừa chuyển tới).
- [ ] PASS  [ ] FAIL

### 5. Mâm 2 bàn — đổi 1 bàn
1. Dựng mâm **Bàn 6 + Bàn 7** (Ghép mâm), ghi 1–2 món. Mở bill mâm → Thao tác khác → "Chuyển sang bàn trống".
2. Mong đợi: trước hết hỏi **"Bàn cần đổi"** (Bàn 6 / Bàn 7); ô chọn bàn đích bị khoá cho tới khi chọn xong. Chọn **Bàn 7** → chọn bàn đích trống **Bàn 13**.
3. Mong đợi: thông báo "Đã chuyển Bàn 7 → Bàn 13"; mâm giờ gồm **Bàn 6 + Bàn 13**, vẫn MỘT bill, tổng tiền không đổi. Bàn 7 trống lại.
4. **Dọn — thu tiền** mâm này.
- [ ] PASS  [ ] FAIL

---

## Phần 2 — Mini App bản CŨ (làm TRƯỚC khi deploy mục 0.B)

### 6. QR in sẵn / app cũ: gọi tiếp sau khi chuyển bàn vẫn vào bill bàn mới
Bài này mô phỏng đúng khách thật hôm nay (QR bàn in sẵn mở bản Mini App đã publish cũ).
1. **Điện thoại 1** quét **QR bàn thật của Bàn 8** (QR in/đang dùng, KHÔNG phải link Development). Gọi 1 món. POS: có bill ở Bàn 8.
2. Trên POS chuyển **Bàn 8 → Bàn 17** (làm xong thao tác như bài 1).
3. Cũng trên Điện thoại 1, vẫn trong app cũ đó, **gọi thêm 1 món**.
4. Mong đợi trên POS: món mới nằm trong **bill Bàn 17** (thêm một lượt chờ xác nhận); **Bàn 8 không có bill mới** (Bàn 8 là bàn trống).
5. Ghi chú đã biết, không tính FAIL: trong app cũ, tab **Đơn gọi** có thể không hiện bill, và nút **Gọi nhân viên** sau khi chuyển vẫn rung ở nhãn **Bàn 8** (bản mới sửa việc này, kiểm ở bài 10).
6. **Dọn — bỏ bàn** Bàn 17.
- [ ] PASS  [ ] FAIL

---

## Phần 3 — Deploy Mini App

Xong bài 6 mới làm **mục 0.B** ở trên (merge + `zmp deploy`, chọn Development). Làm xong rồi mới sang Phần 4.

---

## Phần 4 — Mini App bản MỚI (sau mục 0.B)

> Mở Mini App bằng QR/link của bản vừa deploy.

### 7. Khách đang mở Mini App ở bàn cũ → thấy thông báo, gọi món vào bill bàn mới
1. **Điện thoại 1** quét QR **Bàn 9** (bản mới), gọi 1 món. Giữ Mini App đang mở.
2. Trên POS chuyển **Bàn 9 → Bàn 18**.
3. Trên Điện thoại 1, **chờ tối đa khoảng 10 giây** (app tự kiểm tra mỗi 10 giây; hoặc thoát ra mở lại bằng QR **Bàn 9**). Mong đợi: hiện thông báo **"Bàn của bạn đã chuyển sang Bàn 18"**; tên bàn trong app đổi thành **Bàn 18**.
4. Vào tab **Đơn gọi**: thấy đúng bill đã gọi trước đó (món cũ vẫn còn).
5. Gọi thêm 1 món → vào **cùng bill** (POS: bill Bàn 18 có thêm lượt chờ xác nhận; **không** có bill mới ở Bàn 9).
6. Thu ngân **Xác nhận** lượt mới → phiếu bếp + phiếu bàn in ra mang số **Bàn 18**.
7. **KHÔNG dọn** — bài 8, 9 dùng tiếp (Bàn 18 còn bill của Điện thoại 1).
- [ ] PASS  [ ] FAIL

### 8. Khách lạ quét QR bàn cũ → bàn trống
1. Sau bài 7, **Điện thoại 2 (máy khác hẳn, chưa từng gọi món ở Bàn 9)** quét QR **Bàn 9**.
2. Mong đợi: **Bàn 9 là bàn trống bình thường** — không thông báo "đã chuyển", không thấy món/bill của Điện thoại 1. Gọi thử 1 món → mở phiên **MỚI** tại Bàn 9 (POS hiện bill riêng ở Bàn 9, không lẫn vào Bàn 18).
3. **KHÔNG dọn** — bài 9 dùng tiếp (Bàn 9 đang có bill của khách lạ).
- [ ] PASS  [ ] FAIL

### 9. Khách cũ quét lại QR bàn cũ khi bàn đó đã có người lạ → vẫn được đưa về bàn mới
1. Điện thoại 1 (khách đã chuyển ở bài 7) thoát Mini App rồi quét lại QR **Bàn 9** (lúc này Bàn 9 đang có bill của khách lạ từ bài 8).
2. Mong đợi: Điện thoại 1 vẫn thấy **"Bàn của bạn đã chuyển sang Bàn 18"**, KHÔNG thấy món/bill của khách lạ ở Bàn 9.
3. Gọi thêm 1 món. Mong đợi: món vào **bill Bàn 18**; bill Bàn 9 (khách lạ) **không đổi**.
4. **Dọn — bỏ bàn** cả Bàn 18 và Bàn 9.
- [ ] PASS  [ ] FAIL

### 10. Gọi nhân viên trước khi chuyển → POS hiện ở bàn mới
1. **Điện thoại 1** quét QR **Bàn 10**, gọi 1 món (để có bill), rồi bấm **Gọi nhân viên** (chưa ai xử lý).
2. Thu ngân chuyển **Bàn 10 → Bàn 19** trước khi xử lý.
3. Mong đợi: thẻ/chuông gọi nhân viên trên POS (và `/staff` nếu mở) hiện ở **Bàn 19**, không còn nhãn Bàn 10. Chạm xử lý được bình thường.
4. **Dọn — bỏ bàn** Bàn 19.
- [ ] PASS  [ ] FAIL

### 11. Giới hạn đã biết — bạn cùng nhóm chưa gọi món lần nào
Cần trước: bài 9 đã dọn xong (Điện thoại 1 không còn thuộc bill nào đang mở). Nếu còn bill cũ chưa dọn, Điện thoại 1 sẽ bị đưa về bàn đó — là đúng, không phải FAIL, nhưng làm bài này rối.
1. **Điện thoại 1 = khách A** quét QR **Bàn 11**, mở phiên và gọi món. **Điện thoại 2 = khách B** (bạn cùng nhóm) chỉ ngồi cùng bàn, **chưa từng gọi món ở Bàn 11**, không phải chủ phiên.
2. Thu ngân chuyển **Bàn 11 → Bàn 20**.
3. **B** mở QR **Bàn 11** cũ: mong đợi (theo giới hạn đã chấp nhận) **B thấy Bàn 11 là bàn trống**, không biết nhóm đã chuyển. Còn **A** (chờ tới ~10 giây) vẫn thấy thông báo chuyển bàn như bài 7.
4. Chỉ ghi nhận hành vi, không phải lỗi cần sửa. FAIL chỉ khi A cũng không được báo chuyển bàn. Đừng cho B gọi món (sẽ mở bill ma ở Bàn 11).
5. **Dọn — bỏ bàn** Bàn 20 (và Bàn 11 nếu B lỡ gọi món).
- [ ] PASS  [ ] FAIL

---

## Phần 5 — A04

### 12. A04 hiện dòng chuyển bàn
1. Vào `/admin/bills` (hôm nay) → mở ngăn **Xem bill** của bill **Bàn 12** (đã thu tiền ở bài 1). Có thể mở thêm bill mâm Bàn 6 + Bàn 13 (bài 5). Mở lần lượt hai bill: lịch sử của bill này **không** được hiện dưới bill kia.
2. Mong đợi: có khối **"Chuyển bàn"** với dòng dạng `HH:mm · Bàn 1 → Bàn 12 · <tên người chuyển>` (bill mâm: `Bàn 7 → Bàn 13`). Mâm chuyển 2 lần thì 2 dòng, theo thứ tự thời gian.
3. Ghi chú đã biết: **tên người chuyển chỉ hiện khi chính người đó đang xem** (RLS bảng `mevo_operators`); người khác xem thì giờ + bàn vẫn đúng, tên có thể trống. Không tính FAIL.
- [ ] PASS  [ ] FAIL

---

## Sau khi PASS
Merge nhánh vào `main` + push để Vercel deploy admin-web. Mini App đã `zmp deploy` ở mục 0.B (nhớ deploy bản **Testing** nếu muốn release thật cho khách, thay vì Development).
