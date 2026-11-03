# CB-2 — Chuyển cả mâm sang một bàn + hộp thoại xác nhận trong app (2026-11-03)

Nhánh `feat/chuyen-ban-giam-gia-bill` · Spec `docs/superpowers/specs/2026-11-02-chuyen-ban-giam-gia-bill-design.md` §3
Test trên **Bia lẩu Bảo Lương** (chủ quán hoặc thu ngân đăng nhập POS). **Migration 104 + 105 + 106 đã áp prod** — không cần làm gì thêm về DB.
Làm sau khi **CB-1 đã PASS**.

CB-2 gồm hai thay đổi:
- **Hộp thoại trong app** thay khung xác nhận của trình duyệt/Windows (`window.confirm`) cho hai chỗ trên POS: chọn bàn có khách đặt muộn khi chuyển bàn, và **Bỏ bàn (không thu tiền)**.
- Mâm nhiều bàn có thêm lựa chọn **"Chuyển cả mâm sang một bàn"**: dồn mọi bàn của mâm vào MỘT bàn trống, vẫn một bill.

## Cách làm cho khỏi nhầm

- **Mỗi bài dùng bàn riêng** (bảng dưới) và **dọn bàn xong mới sang bài sau**. Bài nào có dòng "Dọn" thì làm đủ dòng đó — nếu bỏ qua, bài sau sẽ báo FAIL oan (bàn đích còn đang có khách).
- **"Dọn — bỏ bàn"** = POS → mở bill bàn đó → **Thao tác khác** → **Bỏ bàn (không thu tiền)** → bấm **Bỏ bàn** trong hộp thoại.
- **"Dọn — thu tiền"** = POS → bill bàn đó → **Thanh toán** → **Xác nhận đã nhận** (tiền mặt). Chỉ dùng ở bài 3 (để bài 6 xem lại trong báo cáo). Ghi món rẻ thôi, đơn này sẽ vào báo cáo hôm nay.
- **Dựng một bill có món trên POS** (khi bài cần "bàn đang có khách"): nút **Khách lẻ** → chọn bàn → ghi 1 món → gửi.
- **Dựng mâm**: POS → **Ghép mâm** → chọn các bàn → ghi 1–2 món.
- **Hai điện thoại khác nhau**: **Điện thoại 1** (khách trong mâm) và **Điện thoại 2** (khách lạ). "Khách lạ" phải là **máy khác hẳn**, KHÔNG phải cùng máy đăng nhập tài khoản Zalo khác — hệ thống nhận khách theo tài khoản Zalo **hoặc** theo máy, nên cùng một máy đổi tài khoản vẫn có thể bị nhận ra.
- Còn vài chỗ khác trên POS vẫn dùng khung xác nhận cũ của trình duyệt (bỏ/tặng món trong bill, đánh dấu đặt bàn "không đến"…). Đó **không phải** nội dung CB-2 và **không tính FAIL**.

| Bài | Bàn nguồn | Bàn đích / bàn khác |
|---|---|---|
| 1 | Bàn 1 | Bàn 12 (có lịch đặt muộn) |
| 2 | Bàn 2 | — |
| 3 | Mâm Bàn 6 + Bàn 7 | Bàn 13 |
| 4 | Mâm Bàn 8 + Bàn 9 | Bàn 14 |
| 5 | Mâm Bàn 4 + Bàn 5 | Bàn 3 (đang có khách, phải KHÔNG hiện), Bàn 15 (đang giữ đặt bàn, phải KHÔNG hiện) |
| 6 | (xem lại bill bài 3) | |

## 0. Chuẩn bị (làm TRƯỚC khi test)

**A. Admin-web (POS + A04) — cần cho mọi bài**
Hộp thoại và nút "Chuyển cả mâm sang một bàn" nằm ở admin-web của nhánh này. Làm giống CB-1 mục 0.A: đang chưa deploy Vercel, nên chạy local từ worktree của nhánh (đã có `.env.local` sẵn, trỏ đúng Supabase prod):
```
cd D:\Code\mevo\.claude\worktrees\chuyen-ban-giam-gia-bill\admin-web
npm run dev
```
Mở `http://localhost:3000/admin/pos` (nếu cổng 3000 đang bận, terminal sẽ in cổng khác — dùng cổng đó). Đăng nhập tài khoản chủ quán / thu ngân Bảo Lương. Nếu nhánh đã merge `main` + push và Vercel đã deploy thì test thẳng trên domain, bỏ qua bước này.
Nếu CB-1 vẫn đang chạy `npm run dev` thì **tắt đi chạy lại** để chắc chắn đang chạy bản code mới nhất của nhánh.

**B. Mini App — chỉ bài 4 cần**
CB-2 **không có code Mini App mới**. Bản Mini App đã `zmp deploy` ở CB-1 (mục 0.B) đã biết chuyển hướng khách sang bàn mới — dùng lại đúng QR/link Development của bản đó. Không cần deploy thêm.

**C. Dữ liệu cần có**
Bàn 1–15 của Bảo Lương đang trống (hoặc bạn tự dọn trước).

---

## Phần 1 — Hộp thoại trong app

### 1. Bàn đích có lịch đặt muộn → hộp thoại trong app (không còn khung của Windows)
Luật: lịch đặt bàn **Đã xác nhận** (khách chưa đến) giữ bàn **từ 60 phút TRƯỚC giờ hẹn cho tới 120 phút SAU giờ hẹn** (Bảo Lương). Lịch hẹn **muộn hơn bây giờ trên 60 phút và vẫn trong hôm nay** thì bàn còn chuyển vào được nhưng POS phải hỏi lại. Lịch **Chờ xác nhận** không giữ bàn và không hỏi gì.
Ví dụ bây giờ **19:00**.
1. Tạo trên POS (Đặt bàn) lịch **Bàn 12, giờ hẹn 21:00** (hôm nay) rồi bấm **Xác nhận** (trạng thái *Đã xác nhận*). (Nếu test vào buổi tối muộn, chọn giờ hẹn cách bây giờ trên ~1 tiếng rưỡi nhưng vẫn trong hôm nay; sau 22:30 thì bài này không dựng được — để hôm sau.)
2. Dựng bill có món ở **Bàn 1** (Khách lẻ). Mở bill → **Thao tác khác** → **"Chuyển sang bàn trống"**. Bill bàn lẻ **không** có hai nút "Đổi một bàn" / "Chuyển cả mâm sang một bàn" (chỉ mâm từ 2 bàn mới có).
3. Trong danh sách, **Bàn 12** hiện kèm chữ "· có khách đặt lúc 21:00". Chọn **Bàn 12**.
4. Mong đợi: một **hộp thoại nằm trong chính màn POS** (nền mờ phía sau, cùng kiểu với các hộp thoại khác của POS) — **không phải** khung cửa sổ của trình duyệt/Windows. Nội dung:
   - Tiêu đề: **"Bàn 12 có khách đặt lúc 21:00"**
   - Dòng chữ: **"Từ 20:00 khách không tự gọi món qua QR được."**
   - Hai nút: **Huỷ** / **Vẫn chuyển**.
5. Bấm **Huỷ** (hoặc Esc / bấm ra ngoài) → hộp thoại đóng, không chuyển gì, bill vẫn ở Bàn 1. Chọn lại Bàn 12, bấm **Vẫn chuyển** → nút quay vòng một lát, hộp đóng, hiện thông báo nổi xanh **"Đã chuyển Bàn 1 → Bàn 12"**; panel bill vẫn mở nhưng tên bàn là **Bàn 12**.
6. **Dọn**: huỷ lịch đặt Bàn 12; **bỏ bàn** Bàn 12 (bill vừa chuyển tới).
- [ ] PASS  [ ] FAIL

### 2. Bỏ bàn → hộp thoại trong app
1. Dựng bill có món ở **Bàn 2** (Khách lẻ). Mở bill → **Thao tác khác** → **Bỏ bàn (không thu tiền)**.
2. Mong đợi: hộp thoại **trong app** (không phải khung của trình duyệt/Windows):
   - Tiêu đề: **"Bỏ bàn Bàn 2?"**
   - Dòng chữ: **"Đơn chưa nấu và chưa thu tiền sẽ bị huỷ."**
   - Hai nút: **Huỷ** / **Bỏ bàn** (nút **Bỏ bàn** màu đỏ, vì không hoàn tác được).
3. Bấm **Huỷ** (hoặc Esc / bấm ra ngoài) → không có gì thay đổi, Bàn 2 vẫn có khách. Mở lại, bấm **Bỏ bàn** → nút quay vòng, bàn trở thành trống, bill biến mất khỏi POS.
- [ ] PASS  [ ] FAIL

---

## Phần 2 — Chuyển cả mâm sang một bàn

> Bài 3 và 5 là **lần đầu hai nút chọn cách chuyển được nhìn trên trình duyệt thật**. Nhìn kỹ: hai nút "Đổi một bàn" / "Chuyển cả mâm sang một bàn" có vừa khung không, chữ có bị cắt/tràn không, nút nào đang chọn có rõ không — chỗ nào xấu hay khó bấm thì ghi vào FAIL kèm mô tả.

### 3. Mâm 2 bàn dồn về một bàn
1. Dựng mâm **Bàn 6 + Bàn 7** (Ghép mâm), ghi 2 món (ghi nhớ tổng tiền). Mở bill mâm → **Thao tác khác**.
2. Mong đợi: ở mục chuyển bàn có **hai nút chọn cách chuyển**: **"Đổi một bàn"** (đang chọn sẵn) và **"Chuyển cả mâm sang một bàn"**.
3. Bấm **"Chuyển cả mâm sang một bàn"**. Mong đợi: ô "Bàn cần đổi" **biến mất**; nhãn ô chọn bàn đích đổi thành "Chuyển cả mâm (…) sang bàn trống"; danh sách chỉ có bàn trống, nhóm theo khu.
4. Chọn **Bàn 13** — chọn là chuyển ngay, không hỏi lại (Bàn 13 không có lịch đặt).
5. Mong đợi:
   - Thông báo nổi xanh kiểu **"Đã chuyển Bàn 6, Bàn 7 → Bàn 13"**.
   - Panel bill vẫn mở trên phiên đó; mâm giờ chỉ còn **một bàn là Bàn 13**. **Bàn 6 và Bàn 7 đều trống**; Bàn 13 có khách (Timeline/sơ đồ).
   - Bill **nguyên vẹn**: cùng các món, **tổng tiền không đổi**.
   - Vẫn là **mâm** (còn nhãn/màu mâm): ai trong nhóm cũng gọi thêm được qua QR (kiểm ở bài 4).
6. Dựng thêm một **mâm khác 2 bàn** trong lúc chưa dọn thì bấm "Đổi một bàn" ở mâm đó để chắc chế độ cũ vẫn chạy: hiện lại ô "Bàn cần đổi", chọn một bàn rồi chọn bàn đích → chuyển một bàn như CB-1 bài 5. (Không bắt buộc nếu CB-1 bài 5 đã PASS gần đây; nếu làm thì dọn mâm đó bằng bỏ bàn.)
7. **Dọn — thu tiền** bill Bàn 13 (để bài 6 xem lại).
- [ ] PASS  [ ] FAIL

### 4. Khách đã gọi món ở bàn cũ thứ hai mở lại app → thấy "đã chuyển", gọi món vào đúng bill
Cần Mini App bản đã deploy ở CB-1 (mục 0.B). **Điện thoại 1** = khách trong mâm. **Điện thoại 2** = khách lạ (máy khác hẳn).
1. Dựng mâm **Bàn 8 + Bàn 9** trên POS (Ghép mâm), ghi 1 món.
2. **Điện thoại 1** quét QR **Bàn 9** (bàn **thứ hai** của mâm), gọi 1 món. POS: món nằm trong bill mâm. Giữ Mini App đang mở.
3. Trên POS chọn bill mâm → **Chuyển cả mâm sang một bàn** → **Bàn 14**.
4. Trên Điện thoại 1 **chờ tối đa khoảng 10 giây** (app tự kiểm tra mỗi 10 giây; hoặc thoát ra mở lại bằng QR **Bàn 9**). Mong đợi: hiện thông báo **"Bàn của bạn đã chuyển sang Bàn 14"**; tên bàn trong app đổi thành **Bàn 14**.
5. Vào tab **Đơn gọi**: thấy đúng bill đã gọi trước đó (món cũ vẫn còn).
6. Gọi thêm 1 món → vào **cùng bill** (POS: bill Bàn 14 có thêm lượt chờ xác nhận; **không** có bill mới ở Bàn 8 hay Bàn 9).
7. **Điện thoại 2 (máy khác hẳn, chưa từng gọi món ở Bàn 8/9)** quét QR **Bàn 8** (bàn cũ còn lại). Mong đợi: **Bàn 8 là bàn trống bình thường** — không thông báo "đã chuyển", không thấy món/bill của Điện thoại 1. (Chỉ nhìn, **đừng gọi món** để khỏi mở bill ma ở Bàn 8.)
8. **Dọn — bỏ bàn** Bàn 14.
- [ ] PASS  [ ] FAIL

### 5. Bàn đang có khách / đang giữ đặt bàn không có trong danh sách chuyển cả mâm
Luật giữ bàn: như bài 1 (lịch **Đã xác nhận** giữ từ 60 phút trước giờ hẹn). Bàn đã nằm **trong** khung giữ thì không cho chuyển cả mâm vào, vì khách trong mâm sẽ không gọi thêm được.
1. Dựng mâm **Bàn 4 + Bàn 5** (Ghép mâm), ghi 1 món.
2. Dựng bill có món ở **Bàn 3** (Khách lẻ).
3. Tạo lịch **Bàn 15, giờ hẹn khoảng 30 phút nữa** (ví dụ bây giờ 19:00 thì hẹn 19:30) rồi bấm **Xác nhận** (*Đã xác nhận*) → bây giờ đã nằm trong khung giữ.
4. Mở bill mâm Bàn 4 + 5 → Thao tác khác → **Chuyển cả mâm sang một bàn** → mở ô chọn bàn đích.
5. Mong đợi: **Bàn 3 không có** (đang có khách), **Bàn 15 không có** (đang giữ cho khách đặt), **Bàn 4 và Bàn 5 không có** (chính mâm). Các bàn trống khác thì có.
6. Không chuyển gì. **Dọn**: huỷ lịch đặt Bàn 15; **bỏ bàn** Bàn 3; **bỏ bàn** mâm Bàn 4 + 5.
- [ ] PASS  [ ] FAIL

---

## Phần 3 — A04

### 6. A04 hiện một dòng chuyển bàn cho mỗi bàn cũ của mâm
1. Vào `/admin/bills` (hôm nay) → mở ngăn **Xem bill** của bill **Bàn 13** (đã thu tiền ở bài 3).
2. Mong đợi: khối **"Chuyển bàn"** có **hai dòng**, dạng `HH:mm · Bàn 6 → Bàn 13 · <tên người chuyển>` và `HH:mm · Bàn 7 → Bàn 13 · <tên người chuyển>` — mỗi bàn cũ một dòng, cùng trỏ về bàn đích.
3. Mở thêm một bill khác (nếu CB-1 còn bill chuyển bàn trong ngày) rồi mở lại bill Bàn 13: lịch sử của bill này **không** được hiện dưới bill kia.
4. Ghi chú đã biết (giống CB-1 bài 12): **tên người chuyển chỉ hiện khi chính người đó đang xem**; người khác xem thì giờ + bàn vẫn đúng, tên có thể trống. Không tính FAIL.
- [ ] PASS  [ ] FAIL

---

## Sau khi PASS
Merge nhánh vào `main` + push để Vercel deploy admin-web. CB-2 không có thay đổi Mini App nên không cần `zmp deploy` thêm so với CB-1 (nhớ deploy bản **Testing** nếu muốn release thật cho khách, thay vì Development, theo CB-1).
