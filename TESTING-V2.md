# MEVO — Testing Guide v2.0

> **Quy tắc bắt buộc cho Claude Code:**
> Sau khi hoàn thành BẤT KỲ Sprint v2 nào, PHẢI dừng lại,
> đưa ra checklist test tương ứng bên dưới và chờ anh Tú xác nhận
> "test pass" trước khi chuyển sang Sprint kế.
> KHÔNG được tự động chuyển Sprint khi chưa có xác nhận.
>
> File này TÁCH RIÊNG khỏi `TESTING.md` (Sprint 0–…) cho đỡ dài.
> Căn cứ kế hoạch: `docs/superpowers/specs/2026-07-04-mevo-core-v2-plan.md`.

---

## NGUYÊN TẮC TEST CỦA DỰ ÁN MEVO

```
Viết code → Chạy được → Test trên browser → Test trên điện thoại thật → Xác nhận → Tiếp tục
                                                        ↑
                                              BƯỚC NÀY KHÔNG ĐƯỢC BỎ QUA
```

**Thiết bị test bắt buộc:**
- Máy tính Windows (dev server)
- 1 điện thoại Android thật (chạy Zalo) — đây là thiết bị của KHÁCH HÀNG
- 1 tablet hoặc điện thoại thứ 2 (giả lập màn hình bếp) — nếu có

---

## SPRINT v2.1 — Chia sẻ wifi

### Claude Code làm xong khi:
- Migration `024_store_wifi.sql` đã apply (thêm cột `wifi_name`, `wifi_password` vào `stores`).
- `/admin/settings` có mục nhập **Tên wifi** + **Mật khẩu wifi** (chủ quán tự sửa).
- Mini-app tab **"Nhà hàng"** hiện dòng Wifi (📶) ngay dưới "Điện thoại", có nút **Sao chép**.
- Đọc wifi runtime từ DB — đổi wifi trong admin KHÔNG cần build lại mini-app.
- `tsc` mini-app + admin-web không phát sinh lỗi mới.

### ✅ Checklist test — Anh Tú tự làm:

**Test 1 — Chủ quán nhập wifi trong admin**
1. Đăng nhập `/admin/settings` bằng tài khoản **chủ quán Phở Gà Pubu**.
2. Nhập "Tên wifi" (VD: `PhoGaPubu_Free`) + "Mật khẩu wifi" (VD: `pubu2024`) → bấm **Lưu**.
3. ✅ PASS nếu: hiện "✓ Đã lưu", tải lại trang vẫn thấy giá trị vừa nhập.

**Test 2 — Mini-app hiện wifi (KHÔNG build lại)**
1. Mở mini-app đã deploy trên điện thoại thật (KHÔNG `zmp deploy` lại).
2. Vào tab **"Nhà hàng"**.
3. ✅ PASS nếu: thấy dòng 📶 Wifi ngay DƯỚI dòng "Điện thoại", nội dung `{tên wifi} · {mật khẩu}`.

**Test 3 — Nút Sao chép**
1. Ở dòng Wifi bấm nút **Sao chép**.
2. Mở 1 ô nhập text bất kỳ (ghi chú Zalo, ô tìm kiếm...) → dán (paste).
3. ✅ PASS nếu: dán ra ĐÚNG mật khẩu wifi + có toast "Đã sao chép mật khẩu wifi".

**Test 4 — Không rò rỉ chỗ khác**
1. Xem trang chủ / trang menu của mini-app.
2. ✅ PASS nếu: KHÔNG thấy wifi ở bất kỳ đâu ngoài tab "Nhà hàng".

**Test 5 — Để trống = ẩn**
1. Vào `/admin/settings` → xoá trống ô "Tên wifi" → **Lưu**.
2. Mở lại tab "Nhà hàng" trên mini-app.
3. ✅ PASS nếu: dòng Wifi biến mất hoàn toàn (không dòng trống, không lỗi).

**Test 6 — Cách ly quán (RLS)**
1. Với tài khoản chủ quán A, thử sửa wifi của quán B (nếu có quán 2) — hoặc xác nhận
   `/admin/settings` chỉ thao tác trên quán của chính mình.
2. ✅ PASS nếu: chủ quán A KHÔNG sửa được wifi quán B.

**→ Báo Claude Code:** "Sprint v2.1 PASS" hoặc mô tả lỗi cụ thể để fix.
**Sau PASS:** merge core vào worktree `mini-app-instances/pho-ga-pubu` + `zmp deploy`.

---

## SPRINT v2.2 — Chuông + loa đọc đơn (TTS) cho Kitchen Display

### Claude Code làm xong khi:
- Module `admin-web/lib/tts.ts` dùng Web Speech API (miễn phí, chạy client) — hàng đợi
  tuần tự không chồng tiếng, fallback im lặng nếu thiết bị không có giọng vi-VN.
- Kitchen Display có toggle **🔊 Đọc đơn** trên header, mặc định TẮT, lưu `localStorage` theo quán.
- Đơn mới → chuông beep + đọc *"Đơn mới, Bàn X: 2 phở gà đặc biệt, 1 nước cam."*
  (takeaway: *"Đơn mang về: ..."*, tối đa 4 món rồi "và N món khác").
- Nút gọi nhân viên → đọc *"Bàn X gọi thanh toán"* / *"Bàn X cần hỗ trợ"*.
- Không đụng schema, không đụng mini-app. `tsc` admin-web sạch.

> ⚠️ Test sprint này **BẮT BUỘC trên thiết bị thật** (tablet/điện thoại Chrome + Safari) —
> giọng đọc lấy từ hệ điều hành, máy tính dev/preview thường KHÔNG có giọng vi-VN nên
> sẽ chỉ nghe chuông (đúng fallback). Android thường có sẵn giọng Google TTS tiếng Việt;
> iPad/iPhone vào Cài đặt → Trợ năng → Nội dung được đọc để tải giọng vi nếu chưa có.

### ✅ Checklist test — Anh Tú tự làm (trên tablet/điện thoại thật):

> 🔑 **Về mở khoá âm thanh:** trình duyệt chặn tự phát tiếng tới khi có 1 lần CHẠM màn hình
> trong phiên. Vì vậy **mỗi lần MỞ / TẢI LẠI trang kitchen, hãy chạm màn hình 1 lần** (bấm
> toggle, hay chạm bất kỳ đâu) để mở khoá — sau đó chuông + đọc đơn mới kêu. Toggle bật sẵn
> từ lần trước KHÔNG tự mở khoá được nếu chưa chạm.

**Test 1 — Bật loa**
1. Mở `/kitchen/pho-ga-pubu` (có token bếp) trên tablet/điện thoại thật (thử cả Chrome và Safari).
2. Bấm toggle **🔇 Đọc đơn** trên header → chuyển thành **🔊 Đọc đơn** (xanh).
3. ✅ PASS nếu: nghe đọc *"Đã bật đọc đơn"* ngay khi bấm.
   (Nếu máy không có giọng vi-VN → không nghe gì là ĐÚNG fallback; cài giọng vi rồi thử lại.)
4. **Sau khi TẢI LẠI trang** (vd sau deploy mới): chạm màn hình 1 lần → đơn mới về sẽ kêu bình thường.

**Test 2 — Đọc đơn ZaloPay ĐÚNG THỜI ĐIỂM (quan trọng)**
1. Đặt 1 đơn ZaloPay (2 món). Bấm **"Đặt món và thanh toán"** nhưng CHƯA trả tiền.
2. ✅ PASS nếu: kitchen **KHÔNG kêu chuông, KHÔNG đọc** lúc này (đơn chưa vào bếp).
3. Hoàn tất thanh toán ZaloPay (sandbox) thành công.
4. ✅ PASS nếu: **ngay khi trả xong** kitchen nghe **chuông trước**, rồi đọc đúng bàn + đúng
   món + đúng số lượng, và đơn hiện ở cột "CHỜ XỬ LÝ".

**Test 2b — Đơn tiền mặt đọc ngay**
1. Đặt 1 đơn **tiền mặt** (nếu quán bật) — không có bước thanh toán online.
2. ✅ PASS nếu: kitchen nghe chuông + đọc ngay khi đặt (tiền mặt vào bếp luôn).

**Test 3 — Nhiều đơn không chồng tiếng**
1. Đặt 2 đơn (đã thanh toán) sát nhau.
2. ✅ PASS nếu: đọc lần lượt từng đơn, KHÔNG chồng tiếng lên nhau.

**Test 4 — Đọc gọi nhân viên**
1. Trên mini-app bấm nút chuông gọi nhân viên (thanh toán).
2. ✅ PASS nếu: kitchen nghe *"Bàn X gọi thanh toán"*.

**Test 5 — Tắt + nhớ trạng thái**
1. Bấm toggle về **🔇** → đặt đơn mới.
2. ✅ PASS nếu: chỉ còn chuông, KHÔNG đọc.
3. Reload trang.
4. ✅ PASS nếu: toggle giữ nguyên trạng thái (tắt vẫn tắt / bật vẫn bật).

**→ Báo Claude Code:** "Sprint v2.2 PASS" hoặc mô tả lỗi cụ thể để fix.
**Sau PASS:** chỉ cần deploy Vercel (không đụng mini-app).

---

## SPRINT v2.3 — Vòng quay may mắn sau thanh toán

### Claude Code làm xong khi:
- Migration `025_spin_wheel`: cột `stores.spin_enabled` (default **false** mọi quán) + bảng
  `spin_rewards`, `spin_results` + RPC `get_spin_state` / `spin_wheel` / `redeem_spin_result`.
- Kết quả quay do **SERVER quyết định** (RPC theo weight), idempotent 1 lượt/đơn, chỉ đơn **có
  tiền thật** (ZaloPay có trans_id, hoặc cash đã `paid`).
- Mini-app `order-status`: khi đơn đủ điều kiện + quán bật → hiện vòng quay; bấm quay → dừng
  đúng ô server trả về → hiện kết quả + mã đổi. Bọc try/catch: lỗi vòng quay KHÔNG làm hỏng trang đơn.
- Admin `/admin/spin`: toggle bật/tắt + CRUD quà (bộ mặc định 6 ô) + cảnh báo bật mà chưa có quà.
- Admin `/admin/orders`: badge 🎁 + nút "Đã đổi thưởng" (`redeem_spin_result`).
- `spin_enabled` = **false** trên mọi quán; `get_advisors` không WARN RLS mới.

### ✅ Checklist test — Anh Tú tự làm:

**Test 1 — REGRESSION khi TẮT (QUAN TRỌNG NHẤT)**
1. Giữ nguyên `spin_enabled=false` (mặc định). Chạy trọn luồng: quét QR → đặt món →
   ZaloPay sandbox → kitchen → món xong.
2. ✅ PASS nếu: mọi thứ y HỆT trước v2.3, trang `order-status` KHÔNG có gì lạ (không vòng quay).

**Test 2 — Bật + tạo quà**
1. `/admin/spin` (đăng nhập chủ quán Pubu) → "Tạo bộ mặc định 6 ô" → chỉnh 1 ô tỉ lệ rất cao
   để test trúng ổn định → **Lưu quà** → bật toggle.
2. ✅ PASS nếu: lưu OK; bật khi chưa có quà active thì bị chặn + cảnh báo.

**Test 3 — Quay**
1. Đặt đơn ZaloPay sandbox, thanh toán xong → ở `order-status` thấy **Vòng quay may mắn**.
2. Bấm "Quay thưởng" → đĩa quay → dừng đúng ô → hiện kết quả + mã 6 ký tự.

**Test 4 — 1 lượt/đơn (idempotent)**
1. Mở lại trang đơn đó (reload / vào lại).
2. ✅ PASS nếu: KHÔNG quay lại được, thấy đúng kết quả cũ.

**Test 5 — Chưa thanh toán không được quay**
1. Đơn ZaloPay chưa trả tiền (hoặc cash chưa `paid`).
2. ✅ PASS nếu: KHÔNG thấy vòng quay.

**Test 6 — Đổi thưởng**
1. `/admin/orders` → đơn vừa trúng có badge 🎁 → bấm "Đã đổi thưởng".
2. ✅ PASS nếu: chuyển "✓ Đã đổi"; bấm lại (reload) không đổi được nữa.

**Test 7 — Tắt lại**
1. `/admin/spin` tắt toggle → đặt đơn mới thanh toán xong.
2. ✅ PASS nếu: đơn mới KHÔNG thấy vòng quay; kết quả cũ vẫn xem/đổi được.

**Test 8 — Cách ly quán**
1. Operator quán A không thấy/sửa được rewards + results quán B; quán B (chưa bật) không bị ảnh hưởng.

**Test 9 — Vòng quay lỗi không làm chết trang**
1. (Tuỳ chọn) Ngắt mạng lúc mở order-status của đơn đủ điều kiện.
2. ✅ PASS nếu: trang đơn vẫn hiển thị bình thường, chỉ thiếu phần vòng quay.

**→ Báo Claude Code:** "Sprint v2.3 PASS" hoặc mô tả lỗi cụ thể để fix.
**Sau PASS:** merge worktree pho-ga-pubu + `zmp deploy` (mini-app có thay đổi); deploy Vercel.

---
