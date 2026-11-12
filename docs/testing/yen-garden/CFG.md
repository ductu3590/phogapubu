# CFG — Tạo bàn hàng loạt + in tự động (Yên Garden)

Plan `docs/superpowers/plans/2026-11-09-yg-cau-hinh-in-tu-dong.md` · Test trên **quán thử trả sau** (KHÔNG phải quán đang bán thật).

> **Chuẩn bị trước khi test:**
> - **Migration 121 đã áp lên prod** (gỡ trigger `print_mode_policy_guard`) — việc của người quản lý hệ thống. Chưa áp thì bài 5, 6 sẽ lỗi khi Lưu.
> - Phần mềm in (`print-agent`) đã ghép máy và chạy; có máy in ảo **MEVO PDF** như `docs/testing/dot1/C-part1-in-hai-noi.md` mục 0.
> - Quán thử đang ở chế độ **trả sau** (có phiên bàn), đăng nhập **chủ quán**.
> - Nút "Duyệt & in bếp" **vẫn in bằng trình duyệt** cho tới khi QRIN (Part 2 Task 11) gộp. Bấm Duyệt cho một đơn đã tự in ở giai đoạn này sẽ ra **thêm một tờ trình duyệt** — **không tính FAIL**.
> - Kiểm DB (chỉ đọc), thay `<id quán test>`:
>   ```sql
>   SELECT kind, status, dedupe_key FROM print_jobs
>   WHERE store_id = '<id quán test>' ORDER BY created_at DESC LIMIT 5;
>   ```

## A. Tạo bàn hàng loạt (`/admin/tables`)

### Bài 1 — Khu A, 1→20
Bấm **Tạo nhiều bàn**: khu **A** (tạo khu A trước nếu chưa có), tiền tố `A`, số đầu 1, số cuối 20.
- **Mong đợi:** xem trước liệt kê đủ 20 tên A1…A20 và nút **Tạo 20 bàn**. Bấm Tạo → hộp hiện "Đã tạo 20 bàn." → bấm **Xong**: trang có 20 bàn trong khu A. Mở POS: bàn mới **tự xếp lưới**.

### Bài 2 — Chạy lại 1→25
Cùng khu và tiền tố, 1→25.
- **Mong đợi:** xem trước ghi 20 tên "· đã có, bỏ qua" và nút **Tạo 5 bàn**. Tạo xong: "Đã tạo 5 bàn." và "Bỏ qua 20 bàn trùng tên: …". Chỉ có A21–A25 mới.

### Bài 3 — Trùng với bàn đã Đóng
Dùng **tiền tố mới chưa dùng**, ví dụ `C` (trùng tên được kiểm trong **toàn quán**, mọi khu, nên không dùng lại `A`). Trước tiên tạo bàn tên `c3` (chữ thường) rồi bấm **Đóng** bàn đó. Sau đó Tạo nhiều bàn: tiền tố `C`, 1→5.
- **Mong đợi:** `C3` bị bỏ qua, chỉ tạo C1, C2, C4, C5. Không phân biệt hoa/thường và bàn đã Đóng vẫn được tính. (Khoảng trắng ở giữa tên không bị bỏ: `c 3` sẽ KHÔNG trùng `C3`.)

### Bài 4 — Giới hạn, tiền tố có dấu cách, màn nhỏ
1. Số cuối 101 (số đầu 1): hiện "Tối đa 100 bàn một lần", nút Tạo bị **khoá**.
2. Tiền tố `Bàn ` (có dấu cách cuối), 1→3: xem trước `Bàn 1`, `Bàn 2`, `Bàn 3`.
3. Mở trang ở bề rộng **375px** (DevTools): hộp thoại đọc được, **không cuộn ngang**, nút bấm được.

## B. In tự động

> **Trước các bài 5, 9 và 12 (đổi policy xuống bếp):** hệ thống từ chối đổi policy khi quán còn phiên bàn mở hoặc đơn đang xử lý (mig 049, `update_store_workflow_settings`). Trước khi đổi: **đóng mọi phiên bàn** (Thanh toán hoặc Bỏ bàn) và bảo đảm **không còn đơn** ở trạng thái `pending / confirmed / cooking / ready`. Chưa dọn mà Lưu báo lỗi thì không tính FAIL — dọn rồi thử lại.

### Bài 5 — Đổi policy khi đang "Nhiều nơi"
(Dọn phiên + đơn như ghi chú trên.) Cài đặt đang **Nhiều nơi**. Mục Quy trình: đổi "Đơn nhân viên xuống bếp" sang **Tự động chuyển cho bếp** → Lưu.
- **Mong đợi:** lưu được, không lỗi. Khối In ấn hiện ghi chú "Có đơn vào bếp tự động: phiếu bếp của các đơn này chỉ in khi màn POS đang mở ở quầy."

### Bài 6 — Bật "Nhiều nơi" khi policy tự động
Quán đang **Một nơi** với policy tự động.
- **Mong đợi:** ô **Nhiều nơi** chọn được (không bị khoá), bật thành công.

### Bài 7 — POS mở, đơn nhân viên tự in
> ⚠️ Từ 2026-11-11 (mig 131) phiếu bếp của đơn tự vào bếp do MÁY CHỦ xếp mỗi khi phần mềm in hỏi việc, không cần POS mở và không còn băng "giữ POS mở để in". Bài thay thế: `docs/testing/audit-cleanup/IN-BEP-SERVER.md`.
Mở POS (quán trả sau: **không** có băng thông báo nào về in tự động). Từ `/staff`, nhân viên gửi một đơn.
- **Mong đợi:** trong vài giây ra **phiếu bếp đúng trạm + phiếu bàn**, không bấm gì trên POS. Kiểm bằng câu SQL ở đầu file.
- **Mong đợi (mig 128 + 129):** POS **không** coi đơn đó là chờ duyệt — "Lượt món chờ duyệt" không tăng, ô bàn **xanh "Đang ăn"** (không
  vàng), bill ghi "Chờ duyệt mới 0đ". Bấm **Thanh toán** thu được ngay, không báo "Còn 1 đơn chưa được chủ quán xác nhận".

### Bài 8 — Hai tab POS không in đôi
Mở POS ở **hai tab**, gửi một đơn nhân viên.
- **Mong đợi:** chỉ **một bộ** phiếu (đếm dòng `print_jobs` có `dedupe_key` chứa id đơn).

### Bài 9 — Khách duyệt + nhân viên tự động
(Dọn phiên + đơn như ghi chú trước bài 5.) Đặt "Đơn khách xuống bếp" = **Chờ POS xác nhận**, "Đơn nhân viên xuống bếp" = **Tự động**.
Đơn khách QR cần Mini App của quán thử (quét QR bàn bằng Zalo, đặt món). **Mini App Bảo Lương đang tắt**: nếu quán thử không có Mini App thì **bỏ qua phần đơn khách** (ghi "bỏ qua" vào bảng kết quả), chỉ xác nhận đơn nhân viên vẫn tự in sau khi đổi policy.
- **Mong đợi:** đơn khách QR **không** tự in, vẫn chờ "Duyệt & in bếp"; đơn nhân viên tự in.

### Bài 10 — Đơn cũ quá 30 phút không in
Đóng POS, gửi đơn nhân viên, chờ **31 phút**, mở POS.
- **Mong đợi:** đơn đó **không** in. Gửi đơn mới: in.

### Bài 11 — Tắt phần mềm in
Tắt phần mềm in rồi gửi đơn.
- **Mong đợi:** job nằm `queued`; bật lại phần mềm thì in (đúng luật hàng đợi C-Part1).

### Bài 12 — Về lại "Chờ POS xác nhận"
(Dọn phiên + đơn như ghi chú trước bài 5.) Đổi **cả hai** policy về "Chờ POS xác nhận".
- **Mong đợi:** băng biến mất trong khoảng 30 giây, đơn mới không tự in.

## Ghi nhận kết quả

| Bài | PASS / FAIL | Ghi chú |
|---|---|---|
| 1 | | |
| 2 | | |
| 3 | | |
| 4 | | |
| 5 | | |
| 6 | | |
| 7 | | |
| 8 | | |
| 9 | | |
| 10 | | |
| 11 | | |
| 12 | | |

Kết luận: **PASS** / **FAIL**. FAIL thì chép nguyên văn thông báo lỗi và dòng `print_jobs` liên quan.
