# TESTING-PM3 — Bếp/quán xác nhận đơn khách chuyển khoản + vào bếp theo order_source

> Migration `033` đã ở prod. Admin-web (màn bếp + trang Đơn hàng) lên khi Vercel deploy.
> **KHÔNG đụng mini-app → KHÔNG cần zmp deploy.**

## Bối cảnh (vì sao cần)
Trước PM-3: khách chọn **chuyển khoản** trong Zalo → đơn ghi "đã sang app ngân hàng" nhưng
**không ai xác nhận được tiền về** (nút "Đã nhận tiền" trong admin không hiện cho đơn khách CK;
bếp chưa có nút). → Đơn kẹt, không vào doanh thu. PM-3 vá lỗ này.

## Test tự động (Claude đã chạy)
- [x] `cd admin-web && npx vitest run` → **80 pass** (gồm §7 predicate + isAwaitingPayment).
- [x] `npx tsc --noEmit` → 0 lỗi.
- [x] Mô phỏng trên prod (rollback): đơn tại-bàn CK 'ready' + xác nhận (via='kitchen') → tự
  hoàn tất 'paid' (trigger auto-complete + constraint 3-state OK).

## Test tay

### A. Bếp xác nhận (màn bếp)
1. [ ] Khách đặt món tại bàn → chọn **chuyển khoản** → sang app ngân hàng → chuyển tiền → quay lại.
   Sau vài giây (notify về) → **màn bếp hiện cột mới "💰 CHỜ THANH TOÁN"** với đơn đó + nút
   "✓ Đã nhận tiền".
2. [ ] Bếp nhìn app ngân hàng thấy tiền về → bấm **"Đã nhận tiền"** → đơn **rời cột Chờ thanh toán,
   sang "Chờ xử lý"** + **chuông/loa báo đơn mới**. → bếp bắt đầu làm bình thường.
3. [ ] Cột "Chờ thanh toán" **tự ẩn** khi không còn đơn nào trong đó (bình thường bếp thấy 3 cột).

### B. Owner xác nhận (admin › Đơn hàng)
4. [ ] Đơn khách chuyển khoản (chưa xác nhận) giờ **có nút "✓ Đã nhận tiền"** ở admin (trước
   KHÔNG có). Bấm → đơn **vào doanh thu**.
5. [ ] Bấm "Hoàn tất" cho đơn khách CK chưa xác nhận → cũng ghi nhận tiền (vào doanh thu), không
   còn đóng đơn mà mất doanh thu như trước.

### C. §7 — vào bếp theo ai đặt (chống đơn ma)
6. [ ] Đơn **khách tự đặt** chuyển khoản **chưa xác nhận tiền** → **KHÔNG** ở cột "Chờ xử lý"
   (chưa vào bếp). Chỉ sau khi bếp/owner xác nhận tiền mới vào.
7. [ ] Đơn **nhân viên đặt hộ** → vào cột "Chờ xử lý" **ngay** (không cần tiền).
8. [ ] Đơn khách tiền mặt → vào bếp ngay (giữ hành vi cũ).

### D. Không mở nhầm
9. [ ] Đơn khách trả bằng **ví ZaloPay** (callback tự xác nhận) → **KHÔNG** hiện ở cột "Chờ thanh
   toán" (ví tự lo, khỏi bấm tay).

### E. Không regression
10. [ ] Luồng cũ: tiền mặt, đơn staff, ví ZaloPay, auto-complete, auto-cancel, badge, vòng quay,
    voucher vẫn chạy đúng.
