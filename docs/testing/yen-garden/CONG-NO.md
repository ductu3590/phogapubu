# Yên Garden — Công nợ khách hàng (mig 123)

Thu ngân ghi nợ ngay lúc thu tiền bàn (Ghi nợ cả bill, hoặc Kết hợp + "Ghi nợ phần còn lại"), chọn khách có sẵn hoặc
thêm khách mới tại chỗ. Trang **Công nợ** (`/admin/debts`) xem ai đang nợ bao nhiêu, thu nợ (một phần / gộp nhiều bill,
bill cũ nhất trước), huỷ lần thu, in bảng kê, xuất Excel. A04, Excel ngày, phiếu cuối ngày, hoá đơn in lại và phiếu bàn
giao ca hiện phần nợ; quán không dùng nợ thấy mọi thứ như cũ.

Spec: `docs/superpowers/specs/2026-11-09-yg-cong-no-design.md` · Plan: `docs/superpowers/plans/2026-11-09-yg-cong-no.md` ·
Migration: `supabase/migrations/123_customer_debt.sql` · Test SQL: `supabase/tests/123_customer_debt.test.mjs`

Bất biến: **Tiền mặt + Chuyển khoản + Ghi nợ + Khác = Doanh thu** (A04, Excel). Tiền khách trả nợ **không** là doanh thu,
chỉ là dòng tiền vào ngày trả (tiền mặt trả nợ vào két ca đang mở). Số nợ luôn tính lúc đọc = phần ghi nợ − các lần trả
còn hiệu lực; lần trả đã huỷ coi như chưa từng có.

## Deploy (Controller áp — trước khi anh Tú test)

1. **Phụ thuộc:** 123 cần **112a + 112b** (thu tiền kết hợp, `bill_payments`, khoá đường thu cũ), **116** (vai Quản lý,
   `is_store_back_office`), **122** (+ **122b**) (ca thu ngân: `cash_shifts`, `require_open_cash_shift`,
   `cash_shift_totals` có dòng neo của 123) đã áp. Khối `$pre$` của 123 raise nếu thiếu bảng / hàm / ràng buộc
   `bill_payment_lines_instrument_check`, nên áp sai thứ tự sẽ dừng sạch (cả file bọc `BEGIN … COMMIT`).
2. **Áp nguyên văn nội dung LF:** lấy bằng `git show <commit>:supabase/migrations/123_customer_debt.sql` (không mở file
   checkout Windows rồi chép, không lược comment, không gộp dòng). Mọi neo vá đều nằm gọn một dòng nên khớp cả hàm prod LF
   lẫn hàm lẫn CRLF.
3. **Trước khi áp — chụp prod và đối chiếu neo.** Chạy `pg_get_functiondef` trên prod cho 6 hàm 123 vá tại chỗ
   (`close_table_session_core`, `collect_table_bill` (4 tham số), `cash_shift_totals`, `get_bills_report`,
   `get_sessions_bill`, `bill_payment_lines_json`) và so 5 hàm đầu với `supabase/tests/prod-defs/123/` (bản chụp nhánh tích hợp sau
   122; `bill_payment_lines_json` của 112a không có bản chụp, chỉ cần qua truy vấn neo). Rồi chạy truy vấn **chỉ đọc** dưới đây: **mọi dòng phải ra `hits = 1`**. Có dòng 0 hoặc > 1 thì KHÔNG áp, sửa neo
   trên nhánh tích hợp trước.

   ```sql
   -- Mỗi neo 123 vá phải khớp ĐÚNG MỘT lần trong định nghĩa hàm đang chạy trên prod.
   WITH a(sig, anchor) AS (VALUES
     ('public.cash_shift_totals(uuid)', $q$  v_debt_cash := 0; -- mevo-anchor:123 cash_shift_totals.debt_cash$q$),
     ('public.close_table_session_core(uuid,text,text,uuid)', $q$    IF p_instrument IS NULL OR p_instrument NOT IN ('cash', 'bank', 'mixed') THEN$q$),
     ('public.collect_table_bill(uuid[],jsonb,integer,uuid)', $q$CREATE OR REPLACE FUNCTION public.collect_table_bill(p_session_ids uuid[], p_lines jsonb, p_cash_given integer, p_client_request_id uuid)$q$),
     ('public.collect_table_bill(uuid[],jsonb,integer,uuid)', $q$  v_bank integer;$q$),
     ('public.collect_table_bill(uuid[],jsonb,integer,uuid)', $q$OR jsonb_array_length(p_lines) > 2 THEN$q$),
     ('public.collect_table_bill(uuid[],jsonb,integer,uuid)', $q$       OR (v_line ->> 'instrument') NOT IN ('cash', 'bank')$q$),
     ('public.collect_table_bill(uuid[],jsonb,integer,uuid)', $q$      IF v_bank IS NOT NULL THEN RAISE EXCEPTION 'Mỗi phương tiện chỉ ghi một khoản'; END IF;$q$),
     ('public.collect_table_bill(uuid[],jsonb,integer,uuid)', $q$      v_bank := v_amount;$q$),
     ('public.collect_table_bill(uuid[],jsonb,integer,uuid)', $q$    FROM (VALUES ('cash', v_cash), ('bank', v_bank)) AS l(instrument, amount)$q$),
     ('public.collect_table_bill(uuid[],jsonb,integer,uuid)', $q$  FOREACH v_sid IN ARRAY v_ids LOOP$q$),
     -- Không phải neo vá, nhưng 123 dựa vào: câu INSERT bill_payments sau 122 (cổng ca) đứng TRƯỚC khối ghi nợ.
     ('public.collect_table_bill(uuid[],jsonb,integer,uuid)', $q$    VALUES (v_store, public.require_open_cash_shift(v_store), p_client_request_id, v_sum, p_cash_given, v_change, v_uid, 'pos')$q$),
     ('public.get_bills_report(uuid,date)', $q$               WHEN o.payment_instrument = 'cash' THEN 'cash'$q$),
     ('public.get_bills_report(uuid,date)', $q$COALESCE(SUM(l.amount) FILTER (WHERE l.instrument = 'bank'), 0)::bigint AS bank,$q$),
     ('public.get_bills_report(uuid,date)', $q$ORDER BY l.instrument DESC) FILTER (WHERE l.id IS NOT NULL)$q$),
     ('public.get_bills_report(uuid,date)', $q$- (SELECT COALESCE(SUM(cash + bank), 0) FROM pay),$q$),
     ('public.get_bills_report(uuid,date)', $q$'instrument', b.instrument,$q$),
     ('public.get_bills_report(uuid,date)', $q$'date', p_date, 'day_from', v_from, 'day_to', v_to,$q$),
     ('public.get_sessions_bill(uuid[])', $q$'grand_discount', v_discount,$q$),
     ('public.get_sessions_bill(uuid[])', $q$ORDER BY x.instrument DESC)$q$),
     ('public.bill_payment_lines_json(uuid[])', $q$ORDER BY x.instrument DESC)$q$)
   )
   SELECT a.sig, left(a.anchor, 60) AS anchor,
          (length(d.def) - length(replace(d.def, a.anchor, ''))) / length(a.anchor) AS hits
     FROM a CROSS JOIN LATERAL (SELECT pg_get_functiondef(a.sig::regprocedure) AS def) d
    ORDER BY a.sig;
   ```

   ⚠️ Dòng neo `-- mevo-anchor:123 cash_shift_totals.debt_cash` là comment: nếu lúc áp 122 lên prod đã lược comment thì
   dòng đó mất → 123 RAISE "không còn chuỗi cần vá". Khi đó áp lại 122 nguyên văn trước (không sửa 123).
4. **Thứ tự với Vercel:** áp 123 trước hay sau khi Vercel lên code mới đều được: `collect_table_bill` mới có hai tham số
   mặc định NULL nên tab POS cũ (gọi 4 tham số) vẫn thu bình thường. Code mới mà DB chưa có 123 thì màn Công nợ báo lỗi —
   áp 123 xong mới deploy là gọn nhất.
5. **Kiểm sau khi áp:** chạy SQL bất biến ở cuối file (phải 0 dòng) và
   `SELECT has_function_privilege('anon', 'public.debt_collect(uuid,bigint,text,jsonb,text,uuid)', 'EXECUTE');` → `false`.

### Còn hở đã biết

- **Phiếu bàn giao ca in qua phần mềm in** (`/print/agent`, chế độ "Nhiều nơi") **chưa có dòng nợ** ("Ghi nợ trong ca",
  "Thu nợ chuyển khoản"; "Thu nợ tiền mặt" vẫn có vì lấy từ số két). Trang agent hiện còn trả "Chưa hỗ trợ" cho
  `shift_report`; khi QRIN Task 13 nối nhánh đó phải gọi thêm `get_debt_shift_summary` (controller đang theo dõi). In bằng
  trình duyệt (`/print/shift-report`) đã đủ dòng.
- **Bảng kê công nợ chỉ in bằng trình duyệt**, kể cả khi quán ở chế độ phần mềm in (`print_jobs` chưa có loại này).

## Trước khi test

- Test trên **quán thử** (Yên Garden trước go-live, hoặc Bảo Lương ngoài giờ). Đăng nhập POS bằng chủ quán; bài 11, 12,
  18 cần quản lý; bài 13 cần thu ngân.
- Mỗi bài dùng một bàn riêng. Dựng bill có món: **Khách lẻ** → chọn bàn → chọn món → gửi.
- Bài 9–12 cần bật **Bắt buộc mở ca** (Cài đặt → Quy trình) cho quán thử; test xong tắt lại nếu quán chưa dùng ca.

> **ĐÂY LÀ QUÁN THẬT.** Thu tiền / ghi nợ ở các bài dưới **cộng vào doanh thu ngày** và **không xoá được** khỏi báo cáo;
> khách nợ thử **không xoá được** (chỉ Ngừng theo dõi). Chọn **món rẻ nhất**, test **ngoài giờ mở cửa**, đặt tên khách
> thử có chữ "Thử", và **ghi lại từng số** vào bảng dưới để trừ khi đối chiếu két / báo cáo. Các con số trong bài
> (350.000đ, 1.200.000đ…) chỉ minh hoạ phép tính; với món rẻ thì tự tính lại theo cùng công thức.

| Bài | Bàn | Doanh thu giả (ghi lại) | Nợ ghi | Thu nợ |
|---|---|---|---|---|
| 1 | Bàn 1 | ……… đ | ……… đ | |
| 2 | Bàn 2 | ……… đ | ……… đ | |
| 3 | Bàn 3 | ……… đ | ……… đ | |
| 6 | — | | | ……… đ (TM) |
| 7 | — | | | ……… đ (CK) |
| 9 | — | | | ……… đ (CK) |
| 10 | Bàn 10 | ……… đ (TM) | | ……… đ (TM) |
| **Tổng** | | **……… đ** | **……… đ** | **……… đ** |

## Các bài

| Bài | Việc | Mong đợi |
|---|---|---|
| 1 | Bill 350.000, chọn **Ghi nợ**, chọn khách có sẵn | Bàn trống ngay; A04 nhãn "Ghi nợ", dòng "Nợ — <tên>"; trang Công nợ khách nợ 350.000 |
| 2 | Bill 1.200.000, **Kết hợp**, TM 500.000, bật "Ghi nợ phần còn lại", khách đưa 500.000 | Nợ 700.000; thối 0 |
| 3 | Bill 1.000.000: TM 200.000 + CK 300.000 + nợ 500.000, khách mới "Cty Thử" SĐT `0912 000 111` | Khách mới hiện ở trang Công nợ, SĐT `0912000111` |
| 4 | Ghi nợ mà không chọn khách | Nút thu khoá, chữ "Chọn khách ghi nợ" |
| 5 | Khách mới trùng SĐT bài 3 (gõ `+84 912 000 111`) | Báo đã có khách, không tạo thêm |
| 6 | Trang Công nợ → khách bài 1 + 2 → Thu nợ 400.000 TM, để tick hết | Xem trước: bill cũ trả hết 350.000, bill sau 50.000; sau khi thu khớp |
| 7 | Thu nợ, bỏ tick bill cũ, trả 100.000 CK | Chỉ bill được tick giảm |
| 8 | Thu quá số nợ | Nút khoá; nếu ép bằng hai tab thì server báo vượt |
| 9 | Bật ca, chưa mở ca, thu nợ TM | "Chưa mở ca"; CK vẫn thu được |
| 10 | Mở ca 500.000, thu bill TM 100.000, thu nợ TM 250.000, kết ca đếm 850.000 | Khớp; phiếu bàn giao có dòng thu nợ |
| 11 | Quản lý huỷ lần thu nợ ở bài 6 (ca còn mở) | Nợ khôi phục; két giảm |
| 12 | Huỷ lần thu nợ TM của ca đã kết | Báo ca đã kết |
| 13 | Thu ngân mở trang Công nợ | Thấy danh sách, Thu nợ được; không có Huỷ / Sửa / Ngừng |
| 14 | A04 ngày có nợ: thẻ, chip Ghi nợ, Excel, In báo cáo cuối ngày | "Doanh thu"; TM + CK + Nợ + khác = Doanh thu; thu nợ tách riêng |
| 15 | In lại hoá đơn bill bài 2 ở A04 | Dòng "Ghi nợ — <tên>" 700.000 |
| 16 | In bảng kê khách bài 3 | Chỉ bill còn nợ, đúng tổng |
| 17 | Xuất Excel công nợ | Đúng danh sách đang lọc |
| 18 | Ngừng khách còn nợ / đã hết nợ | Bị chặn / ngừng được, không còn trong ô chọn ở POS |
| 19 | Quán không dùng nợ (Bảo Lương) mở A04, phiếu cuối ngày | Chữ "Tổng thực thu", không có dòng nợ, số như trước |

Ghi chú khi test:
- Bài 2: bật "Ghi nợ phần còn lại" **không xoá số đã gõ** — ô tự điền bị xoá, phần thiếu thành nợ.
- Bài 6–8, 11: trang Công nợ mở từ rail **Công nợ** (ngay sau Hoá đơn); bấm tên khách mở ngăn kéo.
- Bài 10: phiếu bàn giao in bằng **trình duyệt** (xem "Còn hở đã biết").
- Bài 14: Excel Hoá đơn có cột **Ghi nợ** riêng; cột **Khác** không bao giờ chứa nợ.

## SQL bất biến (controller, chỉ đọc — kết quả phải 0 dòng)

```sql
-- Phân bổ còn hiệu lực không vượt phần nợ của bill
SELECT bp.id FROM bill_payments bp
JOIN LATERAL (SELECT COALESCE(SUM(amount), 0) d FROM bill_payment_lines WHERE payment_id = bp.id AND instrument = 'debt') l ON true
JOIN LATERAL (SELECT COALESCE(SUM(a.amount), 0) p FROM debt_payment_allocations a JOIN debt_payments dp ON dp.id = a.debt_payment_id
              WHERE a.bill_payment_id = bp.id AND dp.voided_at IS NULL) x ON true
WHERE x.p > l.d OR (l.d > 0 AND bp.debt_customer_id IS NULL);
-- Tổng phân bổ mỗi lần trả = số tiền lần trả
SELECT dp.id FROM debt_payments dp
LEFT JOIN LATERAL (SELECT COALESCE(SUM(amount), 0) s FROM debt_payment_allocations WHERE debt_payment_id = dp.id) a ON true
WHERE a.s <> dp.amount;
```
