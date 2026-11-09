# Triển khai MEVO tại Yên Garden — spec tổng

> Ngày: 2026-11-09 · Nền: `main` ở `b02b7f9` (mig tới 114) · Go-live: **2026-12-01**, chạy thử 27–30/11
> Nguồn: khảo sát 35 câu với anh Tú ngày 2026-11-09 · Kế hoạch A–Z: https://claude.ai/artifact/DyR55BEaKQfLWLXunU8YJ1

Ký hiệu: **[anh Tú]** = anh Tú đã chốt · **[em]** = em tự quyết, anh xem lại khi đọc.

## 1. Vì sao làm

Yên Garden là quán bia sân vườn hơn 40 bàn, 3 khu, trả sau, 1 quầy thu ngân, 4 máy in, hơn 15 phục vụ. Quán chọn MEVO thay KiotViet, và quản lý quán yêu cầu ngay từ ngày khai trương phải có công nợ, sổ thu chi, kho và báo cáo tài chính **[anh Tú]**.

Thành công nghĩa là: tối 01/12, mọi đơn từ QR và từ điện thoại phục vụ ra đúng 4 máy in, thu ngân thu tiền mặt / chuyển khoản / ghi nợ trên POS, quản lý nhập kho và ghi thu chi, chủ quán ở xa mở điện thoại xem doanh thu, lãi lỗ, công nợ.

## 2. Bộ spec

| Spec | Nội dung | Trạng thái |
|---|---|---|
| Tài liệu này | Cấu hình quán, các thay đổi cho Đợt 1, thứ tự làm, chia agent, kiểm thử | Mới |
| [2026-11-05-dot1-thanh-toan-ca-in-vietqr-design.md](2026-11-05-dot1-thanh-toan-ca-in-vietqr-design.md) | Thu kết hợp, ca + két, in nhiều nơi, VietQR | Part 1 PASS; Part 2 làm theo plan sẵn, có sửa ở §4 dưới đây |
| [2026-11-09-yg-vai-quan-ly-design.md](2026-11-09-yg-vai-quan-ly-design.md) | Vai Quản lý | Mới |
| [2026-11-09-yg-cong-no-design.md](2026-11-09-yg-cong-no-design.md) | Công nợ | Mới |
| [2026-11-09-yg-so-thu-chi-design.md](2026-11-09-yg-so-thu-chi-design.md) | Sổ thu chi | Mới, thay khoản chi trong ca |
| [2026-11-09-yg-kho-design.md](2026-11-09-yg-kho-design.md) | Kho nhập–xuất, giá vốn | Mới |
| [2026-11-09-yg-bao-cao-design.md](2026-11-09-yg-bao-cao-design.md) | Báo cáo bán hàng + 4 báo cáo tài chính | Mới |

## 3. Cấu hình Yên Garden (việc có sẵn, chỉ cài)

| Hạng mục | Giá trị | Cài ở đâu |
|---|---|---|
| Tạo quán | Tên "Yên Garden", slug `yen-garden` **[em]** | `/mevo/stores/new` (wizard 6 bước) |
| Trả tiền | `payment_timing='postpay'`, `payment_methods={cash}` (bàn) | Wizard / `/mevo` |
| Đơn vào bếp | `kitchen_release_policy` và `staff_order_release_policy` = `pos_confirmation` **[anh Tú]**, đổi được sau ở Cài đặt chung | `/admin/settings` |
| Ngày kinh doanh | Bắt đầu 00:00 — quán đóng trước 0h **[anh Tú]** | `/admin/settings` |
| Ca | `require_cash_shift=true`, 1 ca/ngày, 1 thu ngân **[anh Tú]** | `/admin/settings` (sau Part 2 mục B) |
| In | `print_mode='agent'`, 4 trạm: Quầy (POS), Bếp chính (mặc định), Nướng, Bar **[anh Tú]** | Cài đặt → In ấn; gán trạm ở trang Món |
| Khu + bàn | 3 khu, tên bàn theo khu (A1, B1…) **[anh Tú]**; số bàn từng khu chờ quán gửi | `/admin/tables` (công cụ tạo hàng loạt, §5.1) |
| VietQR | Tài khoản quán gửi trước 15/11 | Cài đặt → Tài khoản nhận tiền |
| Đặt bàn | Bật, không cọc **[anh Tú]** | Có sẵn |
| Giá | Một giá cho cả quán **[anh Tú]** | Có sẵn |
| Mini App | Mini App riêng, chủ thể = hộ kinh doanh của quán **[anh Tú]** | Skill `replicate-mini-app` |
| Mang về / giao hàng | Tắt **[em]**, chờ quán xác nhận | `payment_methods={cash}` đã chặn |

Huỷ món: thu ngân / quản lý bỏ món có lý do (đã có), báo bếp bằng bộ đàm, **không in phiếu huỷ** **[anh Tú]**.

## 4. Sửa các spec Đợt 1 cho Yên Garden

1. **4 máy in thay vì 2.** Trạm in đã hỗ trợ số trạm tuỳ ý (mig 114); chỉ đổi cấu hình và checklist C. Không đổi code.
2. **Chế độ in qua phần mềm khi đơn vào bếp tự động.** Spec Đợt 1 §C2 chặn `print_mode='agent'` khi chính sách là `automatic`. Anh Tú cần đổi được chính sách sau một thời gian vận hành **[anh Tú]**, nên phải gỡ chặn và có đường in tự động — xem §5.2.
3. **Công nợ là phương tiện thứ ba trong lần thu.** `bill_payment_lines.instrument` nhận `cash | bank | debt`. Kết hợp được TM + CK + Ghi nợ. Mục A (mig 112a) phải để CHECK mở rộng được; spec công nợ thêm giá trị `debt` ở mig 119. Bất biến báo cáo đổi thành `cash + bank + debt + other = revenue`.
4. **Khoản chi trong ca (B3) chuyển thành sổ thu chi.** Không tạo bảng `cash_shift_expenses`. Mig 113 tạo `cash_book_entries` theo spec sổ thu chi; nút "Chi tiền từ két" trên POS ghi một phiếu chi tiền mặt gắn ca. Công thức két:

   ```
   Tiền dự kiến = tiền đầu ca
                + tiền mặt thu bill trong ca (bill_payment_lines cash)
                + tiền mặt khách trả nợ trong ca
                + phiếu thu tiền mặt trong ca
                − phiếu chi tiền mặt trong ca
   ```
5. **Vai Quản lý** dùng mọi RPC thu ngân dùng được. Mọi chỗ kiểm `is_store_pos_operator` tự nhận Quản lý khi hàm này được mở rộng (spec vai Quản lý).

## 5. Việc nhỏ mới

### 5.1. Tạo bàn hàng loạt theo khu

- Ở `/admin/tables`, nút "Tạo nhiều bàn": chọn khu, tiền tố (VD `A`), số đầu, số cuối → xem trước danh sách tên → Tạo.
- Tối đa 100 bàn một lần **[em]**. Tên trùng bàn đang có trong quán thì bỏ qua và báo lại số bàn bị bỏ qua, không lỗi cả loạt.
- Server action kiểm quyền chủ quán, lọc `store_id`, chèn trong một lệnh. Không cần migration nếu `tables` đã có ràng buộc trùng tên; nếu chưa có thì kiểm trùng ở action **[em]**.
- Toạ độ sơ đồ để trống, bàn mới xếp lưới tự động như bàn thêm lẻ.

### 5.2. In tự động khi đơn vào bếp ngay

- Gỡ trigger `print_mode_policy_guard` (mig 114) bằng một migration riêng, **mig 121**, chỉ drop trigger + hàm guard **[em]**. Form Cài đặt bỏ luôn lời chặn tương ứng.
- Khi chính sách là `automatic` và `print_mode='agent'`: **POS** (luôn mở ở quầy, cùng máy với phần mềm in) phát hiện đơn mới đã vào bếp mà chưa có job in bếp, rồi gọi chính hàm chia phiếu theo trạm đang dùng cho nút "Duyệt & in bếp". `dedupe_key` theo `order_id` nên hai tab POS cùng mở không in đôi **[em]**.
- Giới hạn chấp nhận: POS đóng thì không in tự động. POS hiện băng "Đơn tự vào bếp — giữ POS mở để in" khi chính sách `automatic` + `agent` **[em]**.
- Đơn cũ hơn 30 phút khi POS mở lại thì không tự in (giống quy tắc job hết hạn).
- Hai chính sách có thể khác nhau (đơn khách duyệt, đơn nhân viên tự động): mỗi đơn xét theo chính sách của nguồn đơn.

## 6. Thứ tự làm và chia agent

Mỗi agent một worktree (Agent `isolation: "worktree"`), từ nhánh tích hợp `claude/yen-garden-survey-e9a44a`. **Chỉ controller áp migration lên prod**, theo thứ tự, sau khi anh Tú cho phép.

| Sóng | Agent | Việc | Migration | Điểm nóng |
|---|---|---|---|---|
| 1 | THU | Mục A thu kết hợp (plan sẵn) + chừa CHECK `debt` | 112a, 112b | `close_table_session`, `PaymentView`, `get_bills_report` |
| 1 | QL | Vai Quản lý | 116 | `roles.ts`, helper SQL, trang Nhân viên |
| 1 | KHO | Kho trọn gói | 118 | Bảng mới, trang mới, trang Món (gắn hàng) |
| 1 | BC1 | Báo cáo bán hàng (món, giờ, danh mục, huỷ) | 117 | RPC đọc mới, trang Báo cáo mới |
| 1 | CFG | §5.1 tạo bàn hàng loạt + §5.2 in tự động | 121 | `/admin/tables`, POS (phần in) |
| 2 | CA | Mục B Part 2 + sổ thu chi | 113 | Bảng ca, sổ thu chi, gác RPC thu |
| 2 | NO | Công nợ | 119 | `PaymentView`, `collect_table_bill`, trang Công nợ |
| 2 | QRIN | Mục D Part 2 + mục C Part 2 | — | `PaymentView`, `/print/bill`, các màn gọi in |
| 3 | BC2 | 4 báo cáo tài chính | 120 | Trang Báo cáo |

- Sóng 2 bắt đầu khi THU xong review và đã gộp vào nhánh tích hợp. CA, NO, QRIN cùng đụng `PaymentView`: chạy song song, controller gộp và giải xung đột.
- Sóng 3 cần NO, CA, KHO đã gộp.
- Mig 115 đang được một phiên khác giữ (giảm giá theo món). Sau khi gộp, nếu nhánh đó đã vào `main` thì rebase nhánh tích hợp lên `main` trước khi áp migration.

## 7. Hoàn thành khi nào

"Xanh" nghĩa là tất cả các điều sau, trên nhánh tích hợp sau khi gộp hết:

1. `admin-web`: `npm run test` (vitest) qua hết, `npx tsc --noEmit` không lỗi, `npm run lint` không lỗi mới.
2. `supabase/tests/*.test.mjs` qua hết trên pglite (gồm test cũ 100–114 và test mới).
3. `print-agent`: test qua hết.
4. Mỗi nhánh agent có review độc lập "clean" (không còn Critical/Important).
5. Mỗi module có checklist test tay ở `docs/testing/yen-garden/` cho anh Tú chạy lúc chạy thử.

Không gộp vào `main`, không push, không áp migration prod khi chưa hỏi anh Tú **[em]**.

## 8. Ràng buộc kỹ thuật chung

Giữ nguyên §7 của spec Đợt 1, cộng thêm:

- Mọi RPC mới ghi tiền hoặc kho: kiểm quyền theo `store_id` trong hàm, `SECURITY DEFINER` + `SET search_path`, `REVOKE ... FROM PUBLIC, anon`.
- Số tiền là `bigint`/`int` VNĐ, số lượng kho là `numeric(12,3)`.
- Mọi báo cáo cắt theo **ngày kinh doanh** (`business_date_of`, mig 111).
- Trang mới phải đọc tốt ở bề rộng 375px (chủ quán xem trên điện thoại **[anh Tú]**).
- Tiếng Việt cho mọi chữ người dùng thấy; font, màu theo design system 2026-10-02.
