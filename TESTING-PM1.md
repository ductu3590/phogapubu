# TESTING-PM1 — Vá bug notify + gộp doanh thu (Multi-method Payment, additive)

> Sprint **PM-1 additive**: migration `030` đã áp prod + edge function `checkout-notify` v13 đã
> deploy. KHÔNG rename kênh (mini-app vẫn gửi `zalopay`) → mini-app KHÔNG cần deploy lại cho PM-1.
> Giá trị lớn nhất: **thoát app ngân hàng không còn được tính là đã trả tiền**.

## Chuẩn bị
- **KHÔNG cần deploy admin-web.** Migration `030` + edge function `checkout-notify` v13 đã ở prod
  là ĐỦ. Dashboard đọc `get_daily_revenue` (đã cập nhật trong DB); trang Đơn hàng dùng
  `hasRealMoney` bản cũ nhưng cho **cùng con số** với luật mới trên mọi đơn (bản cũ tính đơn
  zalopay theo `trans_id`, mà `checkout-notify` v13 không còn ghi `trans_id` cho BANK → tự loại
  đúng đơn bỏ dở). PM-1 không đổi giao diện admin nào, chỉ đổi `revenue.ts` — sẽ tự lên Vercel
  khi merge vào `main`.
- 1 điện thoại Zalo thật (khách), 1 màn admin/bếp.

## Test tự động (Claude đã chạy prod — anh không phải làm)
- [x] Migration `030` applied + backfill verify (7 BANK rời doanh thu, 32 ví giữ, 0 lỗi state/amount).
- [x] `checkout-notify` v13 deployed + smoke test (input xấu → từ chối, không mutation).
- [x] `create_order` e2e (rollback): `payment_amount = total_amount`, `has_payment_tail=false`.
- [x] Function bodies prod: `confirm_manual_payment` có `via='owner'`; `staff_create_order` set
  `payment_amount`+instrument; `spin_wheel` chặn đơn staff.
- [ ] `cd admin-web && npx vitest run` → **63 pass** (gồm `revenue.test.ts` luật mới).
- [ ] `cd admin-web && npx vitest run --root ../supabase/functions/checkout-notify` → **10 pass**
  (`decide.test.ts`: BANK chỉ handoff, ví đủ 5 trường, method lạ no-op, mismatch reject, idempotent).

## Test tay — thứ tự ưu tiên

1. [ ] **BUG §1.1 (quan trọng nhất):** Khách bấm "Đặt & Thanh toán" → chọn chuyển khoản → Zalo
   mở app ngân hàng → **thoát ngay, KHÔNG chuyển tiền**. Kết quả đúng:
   - Đơn **KHÔNG** vào bếp (không kêu chuông/loa), **KHÔNG** vào doanh thu.
   - DB: đơn có `bank_handoff_at` (thời điểm), `status='pending'`, `payment_received_at IS NULL`,
     `zalopay_trans_id IS NULL`.

2. [ ] **Ví ZaloPay vẫn chạy (bẫy regression):** Khách trả bằng **ví ZaloPay** thật (hoặc sandbox)
   → callback thành công. Kết quả: đơn `confirmed`, `payment_received_at` có, **vào doanh thu ngay**,
   vào bếp như cũ.

3. [ ] **Đơn khách MỚI + đơn staff MỚI tạo được** (không vỡ NOT NULL `payment_amount`):
   - Khách đặt món bình thường → tạo đơn OK.
   - Nhân viên đặt hộ (`/staff`) 1 đơn cash + 1 đơn chuyển khoản → tạo OK.
   - DB: cả hai đơn có `payment_amount = total_amount`; đơn staff có `payment_instrument`
     đúng (`cash` / `bank`).

4. [ ] **Owner xác nhận tiền KHÔNG vỡ constraint (P0):** Ở `/admin` (hoặc `/staff` owner), bấm
   "Đã nhận tiền" cho 1 đơn cash và 1 đơn chuyển khoản → thành công, không lỗi. DB:
   `payment_received_via='owner'`, `payment_received_by` = user.

5. [ ] **Doanh thu khớp:** Số doanh thu ở **Dashboard** == trang **Đơn hàng** (một luật). 7 đơn
   BANK cũ (test 08–11/07) đã **biến khỏi** doanh thu; 32 đơn ví cũ **giữ nguyên**.

6. [ ] **Vòng quay (nếu quán bật `spin_enabled`):** đơn khách đã thu tiền → quay được; đơn **staff
   KHÔNG** quay được (không có `zalo_user_id`).

7. [ ] **Voucher không regression:** đơn **cash** dùng mã giảm giá → chiếm lượt ngay, để >30' vẫn
   KHÔNG nhả lượt (không vượt `max_uses`).

8. [ ] **Không regression:** Topping, giờ phục vụ (tạm nghỉ chặn đơn), đặt món thường vẫn chạy.

## Ghi chú kỹ thuật
- Migration `030` **additive** — an toàn với mini-app prod đang gửi `'zalopay'`. Rename kênh
  `zalopay→zalo_checkout` là **rollout riêng** sau khi mini-app mới publish (xem plan).
- Dashboard (`get_daily_revenue`, đã ở DB) và Đơn hàng (`hasRealMoney` cũ) **cho cùng số** — nếu
  lệch nhau ở bất kỳ đơn nào, báo lại (đó sẽ là dấu hiệu có đường set `payment_received_at` ngoài
  dự kiến).
