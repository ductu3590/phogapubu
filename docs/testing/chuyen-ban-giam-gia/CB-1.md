# CB-1 — Chuyển bàn (2026-11-02)

Nhánh `feat/chuyen-ban-giam-gia-bill` · Spec `docs/superpowers/specs/2026-11-02-chuyen-ban-giam-gia-bill-design.md` §3
Test trên **Bia lẩu Bảo Lương** (chủ quán hoặc thu ngân đăng nhập POS). **Migration 104 + 105 đã áp prod** — không cần làm gì thêm về DB.

## 0. Chuẩn bị (làm TRƯỚC khi test)

**A. Admin-web (POS + A04) — bài 1–5, 8, 9**
Đang chưa deploy Vercel, nên chạy local từ worktree của nhánh này:
1. Mở terminal, `cd D:\Code\mevo\.claude\worktrees\chuyen-ban-giam-gia-bill\admin-web` → `npm run dev` → mở `http://localhost:3000/admin/pos` (đã có `.env.local` sẵn trong thư mục này, trỏ đúng Supabase prod).
2. Đăng nhập tài khoản chủ quán / thu ngân Bảo Lương.
   (Hoặc: nếu nhánh đã được merge `main` + push và Vercel đã deploy thì test thẳng trên domain, bỏ qua bước 1.)

**B. Mini App — BẮT BUỘC làm trước bài 6, 7, 8, 10**
Nhánh này **chưa có trên origin** nên bước merge dưới đây chỉ chạy được sau khi nhánh đã được push hoặc merge vào `main`. Khi đó:
1. `cd D:\Code\mevo\mini-app-instances\bia-lau-bao-luong`
2. `git fetch origin && git merge origin/main` (hoặc `git merge origin/feat/chuyen-ban-giam-gia-bill` nếu chưa merge main)
3. `cd mini-app` → `zmp deploy`
4. **Khi `zmp deploy` hỏi: chọn đúng — "Development" để tự test (QR/link Development mở bản mới), "Testing" chỉ khi muốn tạo bản gửi duyệt.** Zalo giới hạn số lần deploy/tháng, đừng deploy thừa.
5. Mở Mini App bằng đúng QR/link của bản vừa deploy. QR bàn đang in cho khách mở bản **đã publish cũ** — bài 6 trên bản cũ sẽ chỉ pass nửa (xem ghi chú bài 6).

(Chỉ muốn thử nhanh ngoài Zalo: `npm run dev` trong `mini-app-instances\bia-lau-bao-luong\mini-app` sau khi merge như trên, mở `http://localhost:5173/?table=<id bàn>&tableNumber=Bàn%20X` ở chế độ điện thoại. Không thay được bài thật trong Zalo.)

**C. Dữ liệu cần có**
Cần ít nhất: 2 bàn đang có khách (ví dụ **Bàn 1, Bàn 2**), vài bàn trống ở nhiều khu, 1 mâm 2 bàn (ví dụ **Bàn 3 + Bàn 4**), và một lịch đặt bàn sắp tới để thử bài 3, 4.

---

## Phần 1 — POS (admin-web)

### 1. Bàn lẻ chuyển sang bàn trống
1. POS: mở bill **Bàn 1** (đang có khách, có ít nhất 1 món) → **Thao tác khác** → mục đầu tiên **"Chuyển sang bàn trống"**.
2. Danh sách hiện **bàn trống nhóm theo khu**. Chọn một bàn trống, ví dụ **Bàn 12**.
3. Mong đợi: thông báo **"Đã chuyển Bàn 1 → Bàn 12"** (hiện đang tô màu cảnh báo — lỗi nhỏ đã biết, không tính FAIL). Panel bill vẫn mở trên phiên đó nhưng tên bàn là **Bàn 12**; Timeline/sơ đồ: Bàn 1 chuyển sang trống, Bàn 12 có khách; tổng tiền và món **không đổi**.
- [ ] PASS  [ ] FAIL

### 2. Bàn đích đang có khách không có trong danh sách
1. Mở lại "Chuyển sang bàn trống" của một bàn bất kỳ đang có khách.
2. Mong đợi: **Bàn 2** (đang có khách) và mọi bàn đang có khách khác **không xuất hiện** trong danh sách. Bàn chính nó cũng không có.
- [ ] PASS  [ ] FAIL

### 3. Bàn đang trong khung giữ đặt bàn không có trong danh sách
1. Tạo/để sẵn một lịch đặt bàn **sắp tới trong khung giữ** (Bảo Lương khung giữ hiện 120 phút — bàn có hẹn trong vòng đó coi là đang bị giữ), ví dụ giờ hẹn cách bây giờ 30–60 phút, tại **Bàn 15**.
2. Mở "Chuyển sang bàn trống" từ một bill khác.
3. Mong đợi: **Bàn 15 không xuất hiện** (chặn chuyển vào bàn đang giữ đặt bàn — quyết định của chủ quán).
- [ ] PASS  [ ] FAIL

### 4. Bàn có lịch muộn hơn trong ngày → hỏi xác nhận
1. Để sẵn một lịch đặt bàn **muộn hơn trong ngày, nằm NGOÀI khung giữ** (ví dụ hẹn 21:00 khi bây giờ mới 17:00) tại **Bàn 16**.
2. Chuyển bill sang **Bàn 16**.
3. Mong đợi: hiện hộp xác nhận (của trình duyệt) **kèm giờ hẹn** ("…có lịch đặt lúc 21:00…"). Bấm **Huỷ** → không chuyển gì cả, bill vẫn ở bàn cũ. Làm lại, bấm **OK** → chuyển thành công như bài 1.
- [ ] PASS  [ ] FAIL

### 5. Mâm 2 bàn — đổi 1 bàn
1. Mở bill của mâm **Bàn 3 + Bàn 4** → Thao tác khác → "Chuyển sang bàn trống".
2. Mong đợi: trước hết hỏi **"Bàn cần đổi"** (Bàn 3 / Bàn 4). Chọn **Bàn 4** → chọn bàn đích trống, ví dụ **Bàn 13**.
3. Mong đợi: thông báo "Đã chuyển Bàn 4 → Bàn 13"; mâm giờ gồm **Bàn 3 + Bàn 13**, vẫn MỘT bill, tổng tiền không đổi. Bàn 4 trống lại.
- [ ] PASS  [ ] FAIL

---

## Phần 2 — Mini App (cần xong mục 0.B)

> Dựng cảnh chung cho bài 6–8, 10: dùng Zalo thật quét QR **Bàn 1** (bản vừa deploy), gọi 1 món (bill phiên mở ở Bàn 1). Giữ nguyên Mini App đang mở, chưa thoát.

### 6. Khách đang mở Mini App ở bàn cũ → thấy thông báo, gọi món vào bill bàn mới
1. Trên POS chuyển **Bàn 1 → Bàn 12** (như bài 1).
2. Trên điện thoại khách (Mini App vẫn mở, hoặc thoát ra mở lại bằng QR **Bàn 1** cũ): mong đợi hiện thông báo **"Bàn của bạn đã chuyển sang Bàn 12"**; tên bàn trong app đổi thành **Bàn 12**.
3. Vào tab **Đơn gọi**: thấy đúng bill đã gọi trước đó (món cũ vẫn còn).
4. Gọi thêm 1 món → món mới vào **cùng bill** (POS: bill Bàn 12 có thêm lượt chờ xác nhận; **không** xuất hiện bill mới ở Bàn 1).
5. Thu ngân **Xác nhận** lượt mới trên POS → phiếu bếp + phiếu bàn in ra mang số **Bàn 12**.
6. Ghi chú nếu thử trên **app cũ chưa deploy**: gọi món vẫn vào đúng bill Bàn 12 (server chuyển hướng), nhưng tab Đơn gọi chưa hiện bill cho tới khi app mới được deploy — đó là mong đợi, không tính FAIL.
- [ ] PASS  [ ] FAIL

### 7. Khách lạ quét QR bàn cũ → bàn trống
1. Sau bài 6, dùng **một tài khoản Zalo khác** (chưa từng gọi món ở Bàn 1) quét QR **Bàn 1**.
2. Mong đợi: **Bàn 1 là bàn trống bình thường** — không thông báo "đã chuyển", không thấy món/bill của khách kia. Gọi thử 1 món → mở phiên MỚI tại Bàn 1 (POS hiện bill riêng ở Bàn 1, không lẫn vào Bàn 12). Xong dọn: bỏ/thu bill đó.
- [ ] PASS  [ ] FAIL

### 8. Gọi nhân viên trước khi chuyển → POS hiện ở bàn mới
1. Khách ở **Bàn 2** bấm **Gọi nhân viên** (chưa ai xử lý).
2. Thu ngân chuyển **Bàn 2 → Bàn 14** trước khi xử lý.
3. Mong đợi: thẻ/chuông gọi nhân viên trên POS (và `/staff` nếu mở) hiện ở **Bàn 14**, không còn nhãn Bàn 2. Chạm xử lý được bình thường.
- [ ] PASS  [ ] FAIL

---

## Phần 3 — A04 và giới hạn đã biết

### 9. A04 hiện dòng chuyển bàn
1. Vào `/admin/bills` → mở ngăn **Xem bill** của bill đã chuyển bàn (bài 1 / 5).
2. Mong đợi: có khối **"Chuyển bàn"** với dòng dạng `HH:mm · Bàn 1 → Bàn 12 · <tên người chuyển>` (mâm chuyển 2 lần thì 2 dòng, theo thứ tự thời gian).
3. Ghi chú đã biết: **tên người chuyển chỉ hiện khi chính người đó đang xem** (RLS bảng `mevo_operators`); người khác xem thì giờ + bàn vẫn đúng, tên có thể trống. Không tính FAIL.
- [ ] PASS  [ ] FAIL

### 10. Giới hạn đã biết — bạn cùng nhóm chưa gọi món lần nào
1. Dùng 2 tài khoản Zalo: **khách A** quét QR **Bàn 1**, mở phiên và gọi món; **khách B** (bạn cùng nhóm) chỉ ngồi cùng bàn, **chưa từng gọi món** và không phải chủ phiên.
2. Thu ngân chuyển Bàn 1 → bàn khác.
3. **B** mở QR **Bàn 1** cũ: mong đợi (theo giới hạn đã chấp nhận) **B thấy Bàn 1 là bàn trống**, không biết nhóm đã chuyển. Còn **A** thì vẫn thấy thông báo chuyển bàn như bài 6.
4. Chỉ ghi nhận hành vi, không phải lỗi cần sửa. FAIL chỉ khi A cũng không được báo chuyển bàn.
- [ ] PASS  [ ] FAIL

---

## Sau khi PASS
Merge nhánh vào `main` + push để Vercel deploy admin-web. Mini App đã `zmp deploy` ở mục 0.B (nhớ deploy bản **Testing** nếu muốn release thật cho khách, thay vì Development).
