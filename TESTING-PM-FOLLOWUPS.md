# TESTING — 3 việc sau PM-1 (2026-07-22)

> Batch làm sau khi anh Tú test PM-1 PASS. Gồm: ① UX mini-app đơn chuyển khoản, ② badge phân
> loại đơn ở Admin, ③ tự huỷ đơn bỏ dở + tự hoàn tất đơn tại bàn.

## Trạng thái deploy (đọc trước khi test)
- **Backend (migration `031`) ĐÃ ở prod** → auto-complete (③b) chạy NGAY.
- **Admin-web (badge ②, gọi hàm quét ③a)** — lên khi merge/Vercel deploy.
- **Mini-app (①)** — cần anh **`zmp deploy` + publish** (core mini-app, mọi quán merge sau).

---

## ① Mini-app — đơn chuyển khoản không còn treo 20-30s + đòi trả lại
*(cần zmp deploy mini-app)*

1. [ ] Đặt món → chọn **chuyển khoản** → sang app ngân hàng → **chuyển tiền thật** → quay lại Zalo.
   Kết quả: KHÔNG chờ 20-30s, KHÔNG hiện "thanh toán lại"; vào thẳng màn trạng thái đơn
   ("Đơn đã gửi / Đang chờ xác nhận"). Bếp thấy sau khi quán xác nhận nhận tiền.
2. [ ] Đặt món → chọn chuyển khoản → **thoát app ngân hàng KHÔNG trả** → quay lại Zalo.
   Kết quả: cũng vào màn trạng thái ("đã gửi") — KHÔNG treo/đòi trả lại. Đơn này sẽ tự huỷ sau
   30' nếu không có tiền (xem ③a).
3. [ ] Trả bằng **ví ZaloPay** (sandbox) → vẫn vào thành công như cũ (không regression).

> Ghi chú: bản này bỏ hộp "thử lại / tiền mặt" cho đơn chuyển khoản. Nếu anh vẫn muốn cho khách
> đổi phương thức khi bỏ dở, báo em thêm nút ở màn trạng thái.

## ② Admin Đơn hàng — badge phân loại
*(cần admin-web deploy)*

4. [ ] Mỗi đơn hiện 2 thẻ mới: **nguồn** (📱 Khách tự đặt / 🧑‍🍳 Nhân viên đặt) + **loại**
   (🍽️ Tại bàn / 🥡 Mang về / 🛵 Ship). Đối chiếu: đơn khách quét QR = "Khách tự đặt"; đơn
   `/staff` đặt hộ = "Nhân viên đặt".

## ③ Tự huỷ đơn bỏ dở + tự hoàn tất
*(③b live sẵn; ③a cần admin-web deploy)*

5. [ ] **Tự hoàn tất (③b, đơn TẠI BÀN):** đơn tại bàn đã nhận tiền (ví trả trước, HOẶC owner bấm
   "Đã nhận tiền") → khi **bếp bấm "Xong"** → đơn **tự chuyển "Đã TT"**, rời khỏi "Đang xử lý" +
   màn bếp. KHÔNG cần bấm "Hoàn tất".
   ⚠️ **Đánh đổi cần anh đánh giá:** đơn tại bàn trả trước sẽ **rời cột "Xong" ở màn bếp ngay khi
   bấm Xong** (vì đã đóng). Nếu anh cần nó nán lại cột "Xong" một lúc để nhân viên bưng ra, báo
   em đổi sang tự-hoàn-tất-sau-vài-phút.
6. [ ] **Đơn chưa trả tiền KHÔNG tự hoàn tất:** đơn staff tiền mặt tại bàn, bếp bấm "Xong" nhưng
   chưa thu tiền → vẫn ở "Xong"/"Đang xử lý", chờ owner bấm "Đã nhận tiền" (lúc đó mới tự đóng).
7. [ ] **Đơn mang về KHÔNG bị auto-complete kiểu này** — giữ luồng "Đã nhận" / tự-30-phút như cũ.
8. [ ] **Tự huỷ đơn bỏ dở (③a):** đơn khách tự đặt, chọn thanh toán online, bỏ dở (chưa trả tiền)
   quá **30 phút** → khi mở trang **Admin › Đơn hàng**, đơn tự chuyển "Huỷ" (không còn treo "Chờ
   thanh toán"). Đơn tiền mặt / đơn staff KHÔNG bị quét.

## Không regression
9. [ ] Doanh thu (dashboard == Đơn hàng), topping, voucher, vòng quay, giờ phục vụ vẫn đúng.
10. [ ] Test tự động: `cd admin-web && npx vitest run` → **72 pass**; `npx tsc --noEmit` → 0 lỗi.
    Trigger auto-complete đã test trên prod (rollback): dine-in ready+paid→paid; pickup & dine-in
    chưa-trả GIỮ 'ready'.
