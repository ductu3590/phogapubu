# MEVO — Testing Guide BL (quán Bảo Lương: Đặt trước — Trả sau)

> **Quy tắc bắt buộc cho Claude Code:**
> Sau khi hoàn thành BẤT KỲ Sprint BL nào, PHẢI dừng lại, đưa ra checklist test tương ứng
> bên dưới và chờ anh Tú xác nhận "test pass" trước khi chuyển sang Sprint kế.
> KHÔNG được tự động chuyển Sprint khi chưa có xác nhận.
>
> Căn cứ: `docs/superpowers/specs/2026-08-26-postpay-table-session-print-design.md`

---

## NGUYÊN TẮC

```
Viết code → Chạy được → Test trên browser → Test trên điện thoại thật → Xác nhận → Tiếp tục
                                                        ↑
                                              BƯỚC NÀY KHÔNG ĐƯỢC BỎ QUA
```

**Điều quan trọng nhất của cả đợt BL:** mỗi sprint đều phải kiểm tra
**Phở Gà Pubu KHÔNG đổi hành vi**. Quán đang bán hàng thật — mọi công tắc mới mặc định
bằng đúng hành vi hôm nay, và test đầu tiên của mỗi sprint luôn là "quán cũ có sao không".

---

## SPRINT BL-1 — Nền: công tắc quy trình + bảng phiên bàn

**Đã làm gì:** migration 039 (4 công tắc + kênh `counter`), migration 040 (bảng
`table_sessions` + RLS + composite FK), khối "Quy trình vận hành" ở `/admin/settings`.

**Chưa làm gì:** mini-app chưa đụng tới. Bảng `table_sessions` còn rỗng, chưa ai ghi vào —
RPC mở/đóng phiên nằm ở BL-2 và BL-4. **Chưa in được phiếu, chưa thu tiền được.**

### Chuẩn bị

```bash
# 1. Chạy migration lên Supabase (Dashboard → SQL Editor, chạy lần lượt)
supabase/migrations/039_store_order_flow_config.sql
supabase/migrations/040_table_sessions.sql

# 2. Chạy admin-web
cd admin-web && npm run dev
```

### Test 1 — Phở Gà Pubu KHÔNG đổi gì (quan trọng nhất)

- [ ] Vào `/admin/settings` bằng tài khoản chủ Phở Gà Pubu
- [ ] Khối mới **"Quy trình vận hành"** hiện ra, đang chọn **"Trả trước"**
- [ ] Công tắc "Đơn nhân viên đặt hộ phải thu tiền trước" đang **TẮT**
- [ ] Công tắc "Tự in phiếu khi có đơn mới" đang **TẮT**
- [ ] Khối "Phương thức thanh toán" vẫn như cũ, vẫn đúng phương thức quán đang bật
- [ ] **Không bấm gì**, mở mini-app Phở Gà Pubu trên điện thoại thật → đặt 1 đơn như mọi khi
      → đơn vào bếp đúng như trước, không có gì khác lạ

> Test này hỏng = dừng ngay, không đi tiếp. Mọi thứ còn lại đều xây trên giả định này.

### Test 2 — Lưu cài đặt không làm hỏng gì

- [ ] Ở `/admin/settings`, đổi một thứ bất kỳ không liên quan (VD: tên wifi) → bấm **Lưu**
- [ ] Hiện "✓ Đã lưu", tải lại trang → giá trị mới còn nguyên
- [ ] Khối "Quy trình vận hành" vẫn ở "Trả trước", các công tắc vẫn TẮT

### Test 3 — Chuyển sang "Trả sau" (làm trên quán TEST, đừng làm trên Pubu)

- [ ] Chọn **"Trả sau"** → khối "Phương thức thanh toán" **đổi thành dòng giải thích**
      (không còn ZaloPay / Tiền mặt để chọn)
- [ ] Công tắc "Đơn nhân viên đặt hộ phải thu tiền trước" **biến mất**
      (ở trả sau không đơn nào chờ tiền để vào bếp nên nó vô nghĩa)
- [ ] Bấm **Lưu** → thành công
- [ ] Kiểm tra DB: `select order_flow, payment_methods from stores where slug='<quán test>'`
      → phải ra `postpay` và `{counter}`
- [ ] Chọn lại **"Trả trước"** → khối phương thức thanh toán quay lại, chọn ZaloPay → Lưu
      → DB về lại `prepay` + `{zalo_checkout}`

### Test 4 — Công tắc tự in

- [ ] Bật **"Tự in phiếu khi có đơn mới"** → hiện thêm dòng chọn khổ giấy **58mm / 80mm**
- [ ] Mặc định đang chọn **80mm**
- [ ] Chọn 58mm → Lưu → tải lại trang → vẫn là 58mm
- [ ] Tắt công tắc tự in → dòng chọn khổ giấy biến mất
- [ ] *(BL-1 chưa in gì cả — công tắc này chỉ lưu cấu hình, máy in dùng ở BL-3)*

### Test 5 — Công tắc đặt hộ (chỉ ở "Trả trước")

- [ ] Ở quán test, để **"Trả trước"**, bật **"Đơn nhân viên đặt hộ phải thu tiền trước"** → Lưu
- [ ] Kiểm tra DB: `staff_order_needs_payment = true`
- [ ] *(BL-1 mới chỉ lưu cấu hình. Công tắc này thực sự có tác dụng ở BL-2, khi
      `orderInKitchen` đọc cấu hình quán — nhớ test lại ở BL-2)*

### Test 6 — Chặn đổi quy trình khi còn bàn mở

Bàn mở chỉ sinh ra từ BL-2 trở đi. Ở BL-1 test bằng tay qua SQL Editor:

- [ ] Tạo phiên giả:
      `insert into table_sessions (store_id, table_id) values ('<store test>','<bàn của quán đó>');`
- [ ] Vào `/admin/settings` quán test → đổi quy trình → bấm **Lưu**
- [ ] Phải hiện lỗi đỏ: **"Còn 1 bàn chưa thanh toán..."**, KHÔNG lưu được
- [ ] Đóng phiên: `update table_sessions set closed_at=now(), close_reason='void' where closed_at is null;`
- [ ] Đổi quy trình lại → **Lưu thành công**

### Test 7 — Test tự động (tuỳ chọn, chạy trên máy có PostgreSQL)

```bash
psql -f supabase/tests/_supabase_shim.sql
for f in supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -f $f; done
psql -f supabase/tests/bl1_order_flow_table_sessions_test.sql
```

- [ ] Tất cả 14 dòng đều in **PASS**, không có dòng nào FAIL

> Bộ này Claude đã chạy sẵn (14/14 PASS trên PostgreSQL 16.13) trước khi giao BL-1.
> Anh chỉ cần chạy nếu muốn tự kiểm chứng.

---

### ⚠️ Điều BL-1 CỐ Ý chưa làm

Đừng test những thứ sau ở BL-1, chúng chưa tồn tại:

| Chưa có | Sẽ có ở |
|---|---|
| Mini-app đặt món trả sau, nút "Gửi đơn" | BL-2 |
| Màn "bàn này đang gọi món" khi máy thứ 2 quét QR | BL-2 |
| Phiên bàn tự mở khi khách đặt | BL-2 |
| In phiếu 2 liên, màn quầy | BL-3 |
| Nút Huỷ đơn ảo | BL-3 |
| Thu tiền, đóng bàn, báo cáo tách tiền mặt/chuyển khoản | BL-4 |

---

## SPRINT BL-2 — *(chưa làm)*
## SPRINT BL-3 — *(chưa làm)*
## SPRINT BL-4 — *(chưa làm)*
