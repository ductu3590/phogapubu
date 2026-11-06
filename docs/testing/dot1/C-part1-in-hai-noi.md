# C-Part1 — In hai nơi: trạm in, hàng đợi, phần mềm in (Đợt 1 mục C, Part 1)

Nhánh `feat/dot1-in-hai-noi` · Plan `docs/superpowers/plans/2026-11-05-dot1-c-in-hai-noi.md` · Spec `docs/superpowers/specs/2026-11-05-dot1-thanh-toan-ca-in-vietqr-design.md` §5, §7, §9
Test trên **quán thử hoặc Bia lẩu Bảo Lương** (cả hai policy "Đơn khách xuống bếp" và "Đơn nhân viên xuống bếp" đã là **Chờ POS xác nhận**). **Migration 114 phải được áp lên prod TRƯỚC** (việc của người quản lý hệ thống, không phải của người test).

> **Quan trọng — đọc trước khi làm:**
> - Part 1 **chưa đổi các nút in** trên POS/staff/báo cáo: chúng vẫn gọi in trình duyệt. Nên khi bật "Nhiều nơi", POS **vẫn in bằng trình duyệt** cho tới Part 2. Chuyện đó **không tính FAIL**.
> - **KHÔNG bật "Nhiều nơi" ở quán đang bán thật.** Dùng quán thử.
> - Phần mềm in (`print-agent`) được làm ở **nhánh khác (Task 7)** và sẽ được **gộp vào trước khi test**. Bài 4, 5 (nhập mã), 6, 7, 8, 10 và bài 12 cần phần mềm này chạy; chưa gộp thì chỉ làm được bài 1, 2, 3, 9, 11 và phần Cài đặt của các bài khác.
> - Bài thử máy in nhiệt thật `C-0-may-in-that.md` là **cổng của Part 2**, không phải của Part 1.

## 0. Chuẩn bị

- **Admin-web** chạy bản của nhánh (local: `cd admin-web && npm run dev`, mở `http://localhost:3000/admin/pos`) hoặc domain nếu đã deploy. Đăng nhập **chủ quán**.
- **Biến môi trường** của admin-web có `SUPABASE_JWT_SECRET` và `SUPABASE_SERVICE_ROLE_KEY` (nếu thiếu, trang in của phần mềm báo lỗi).
- **Máy quầy** (bài cần phần mềm in): đã cài `print-agent` và máy in ảo **MEVO PDF** (xuất ra file, không hộp thoại Lưu). Cách tạo máy in ảo: chạy `print-agent/scripts/setup-pdf-printer.ps1` bằng PowerShell **quyền Admin**.
- Có sẵn **một đơn khách** đang chờ thu ngân duyệt (cho bài 1) và **ít nhất 2 danh mục món**.

Kiểm DB sau mỗi bài khi cần (Supabase SQL editor, chỉ đọc):
```sql
SELECT kind, status, error, attempts, created_at
FROM print_jobs ORDER BY created_at DESC LIMIT 5;
```

---

## Bài 1 — Quán để "Một nơi": mọi thứ như cũ
Cài đặt → In ấn đang là **Một nơi (in bằng trình duyệt)**.
1. POS: duyệt một đơn khách, in phiếu như mọi hôm.
2. In tạm tính một bàn; Hoá đơn & Báo cáo → In báo cáo cuối ngày.
- **Mong đợi:** y hệt trước khi có Đợt này. Phiếu bếp **vẫn có giá và dòng "Tổng phiếu"** (hai liên cùng có giá, quyết định 2026-09-23). Không có phiếu nào đi vào `print_jobs`.
- Kiểm: `SELECT count(*) FROM print_jobs;` không tăng.

## Bài 2 — Bật "Nhiều nơi": tự có trạm Quầy và Bếp
1. Cài đặt → In ấn → chọn **Nhiều nơi (qua phần mềm in)**.
- **Mong đợi:** hiện danh sách trạm gồm **Quầy** (nhãn "Quầy") và **Bếp** (nhãn "Bếp mặc định"), hai trạm này **không có nút Xoá**. Hiện ô "Phần mềm in: Chưa kết nối · chưa ghép máy nào" và nút **Thêm máy**.
2. Chuyển về **Một nơi** rồi lại **Nhiều nơi**.
- **Mong đợi:** vẫn đúng 2 trạm (không nhân đôi). Kiểm: `SELECT name, is_pos, is_default_kitchen FROM print_stations ORDER BY created_at;` đúng 2 dòng.

## Bài 3 — Khoá hai chiều với policy xuống bếp
1. Đang ở chế độ **Nhiều nơi**: ở mục **Quy trình vận hành**, hai ô "Đơn khách xuống bếp" và "Đơn nhân viên xuống bếp" bị **khoá** kèm câu "Đang dùng phần mềm in, phải giữ thu ngân xác nhận".
2. Bấm một nút "điền nhanh" (preset) rồi **Lưu**. **Mong đợi:** lưu được và hai ô vẫn là "Chờ POS xác nhận".
3. Chuyển về **Một nơi**, đổi "Đơn khách xuống bếp" sang **Tự động chuyển cho bếp** rồi **Lưu**. Quay lại In ấn.
- **Mong đợi:** lựa chọn **Nhiều nơi bị khoá**, kèm giải thích cần cả hai ô là "Chờ POS xác nhận". Trả ô về "Chờ POS xác nhận" thì chọn lại được.
4. (Tình huống chéo) Ở chế độ Một nơi, đổi ô policy sang Tự động **nhưng chưa Lưu**, rồi bấm **Nhiều nơi**.
- **Mong đợi:** không văng trang; hai ô policy về "Chờ POS xác nhận", Lưu không báo lỗi.

## Bài 4 — Thêm máy: mã 6 số
1. Chế độ **Nhiều nơi** → **Thêm máy**.
- **Mong đợi:** hộp thoại hiện **mã 6 số** và giờ hết hạn (khoảng 10 phút sau).
2. Mở phần mềm in ở quầy, nhập mã.
- **Mong đợi:** phần mềm báo đã ghép. Đóng hộp thoại, Cài đặt hiện **Phần mềm in: Đã kết nối**. Trong vòng ~10 giây ô chọn máy in của mỗi trạm có **danh sách máy in Windows** (có "MEVO PDF").

## Bài 5 — Mã sai và mã quá hạn
1. Thêm máy, nhập vào phần mềm một mã **sai**. **Mong đợi:** bị từ chối, không báo lỗi lạ.
2. Thêm máy, **đợi quá 10 phút**, nhập mã đúng. **Mong đợi:** bị từ chối ("Mã không đúng hoặc đã hết hạn").
3. Ghép lại một lần nữa bằng mã đúng, còn hạn: ghép được.

## Bài 6 — In thử từng trạm
1. Gán máy in **MEVO PDF** cho trạm Quầy và trạm Bếp (chọn rồi bấm **Lưu**).
2. Bấm **In thử** ở từng trạm.
- **Mong đợi:** mỗi lần ra một file PDF đúng **tên quán**, khổ phiếu 80mm. Kiểm: các dòng mới nhất của `print_jobs` có `kind = 'test'`, `status = 'done'`.

## Bài 7 — Trạm chưa chọn máy in
Nút **In thử** bị khoá khi trạm chưa có máy in, nên dựng tình huống như sau:
1. Thêm trạm "Bar", chọn máy in **MEVO PDF**, **Lưu**.
2. **Tắt phần mềm in**, bấm **In thử** ở trạm Bar (job nằm chờ).
3. Đổi trạm Bar về **Chưa chọn máy in**, **Lưu**. Bật phần mềm in.
- **Mong đợi:** job in thử của Bar thành `status = 'failed'`, `error = 'Trạm chưa chọn máy in'`; phiếu khác vẫn in bình thường.

## Bài 8 — Tắt phần mềm 40 giây
(Cần phần mềm in; ghi nhận: gộp Task 7 trước khi test.)
1. Tắt phần mềm in, đợi ~40 giây. **Mong đợi:** Cài đặt báo **Chưa kết nối**.
2. Trong lúc tắt, bấm **In thử** ở trạm Quầy 2 lần.
3. Bật lại phần mềm. **Mong đợi:** tự kết nối (không cần mã mới), **tự in 2 phiếu còn trong hàng đợi**, trạng thái về "Đã kết nối".
4. Một phiếu chờ quá **30 phút** thì không in nữa, thành `expired` (không in muộn).

## Bài 9 — Gán trạm cho danh mục ở trang Món
1. Trang **Món** → sửa một danh mục → chọn trạm (vd. Bar) ở ô **Trạm in phiếu bếp** → Lưu → mở lại: thấy đúng trạm.
2. Chọn lại "Theo trạm bếp mặc định" → Lưu → mở lại: thấy mặc định.
3. Thêm danh mục mới có chọn trạm: lưu được.
4. Quán đang **Một nơi** và chưa có trạm nào: **không** thấy ô này.
5. Đăng nhập **thu ngân**: trang Món chỉ có công tắc Tạm hết, **không** có ô trạm.

## Bài 10 — Gỡ máy
1. Cài đặt → In ấn → **Gỡ máy** → xác nhận.
- **Mong đợi:** Cài đặt về "Chưa kết nối · chưa ghép máy nào"; phần mềm ở quầy chuyển sang **"Cần ghép máy"** và không nhận việc nữa. Ghép lại bằng mã mới được.

## Bài 11 — Xoá trạm khi phiếu đang chờ: phiếu ra bếp mặc định
1. Tạo trạm "Nướng", chọn máy in **MEVO PDF**.
2. **Tắt phần mềm in**. Bấm **In thử** ở trạm "Nướng".
3. Xoá trạm "Nướng" (xác nhận).
4. Bật phần mềm in.
- **Mong đợi:** phiếu in thử **vẫn ra** (ở máy của trạm Quầy/Bếp mặc định), **không** báo "Trạm chưa chọn máy in". Kiểm: job đó có `station_id` là id của trạm Bếp hoặc Quầy.
5. Danh mục đang trỏ trạm đã xoá: trong trang Món hiện "Theo trạm bếp mặc định".

## Bài 12 — Lỗi giữa chừng (đọc kết quả, không bắt buộc PASS ngay)
(Cần phần mềm in.)
- Rút "máy in" hoặc đổi tên máy in ảo trong Windows, bấm **In thử**: phiếu phải thành `failed` với lý do dễ hiểu, **không** tự in lại sau (không in trùng).
- Một phiếu ở trạng thái "đang in" quá 2 phút thì thành `failed` "Không rõ đã in chưa, kiểm tra máy in rồi bấm In lại".

---

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
