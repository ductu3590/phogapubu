# C-Part1 — In hai nơi: trạm in, hàng đợi, phần mềm in (Đợt 1 mục C, Part 1)

Code đã gộp vào nhánh phiên `claude/mevo-vs-kiosviet-features-c14e43` (không dùng các nhánh `feat/dot1-*`) · Plan `docs/superpowers/plans/2026-11-05-dot1-c-in-hai-noi.md` · Spec `docs/superpowers/specs/2026-11-05-dot1-thanh-toan-ca-in-vietqr-design.md` §5, §7, §9
Test trên **quán thử** (khuyến nghị) hoặc Bia lẩu Bảo Lương. **Migration 114 phải được áp lên prod TRƯỚC** (việc của người quản lý hệ thống, không phải của người test).

> **Quan trọng — đọc trước khi làm:**
> - Part 1 **chưa đổi các nút in** trên POS/staff/báo cáo: chúng vẫn gọi in trình duyệt. Nên khi bật "Nhiều nơi", POS **vẫn in bằng trình duyệt** cho tới Part 2. Chuyện đó **không tính FAIL**.
> - **KHÔNG bật "Nhiều nơi" ở quán đang bán thật.** Dùng quán thử.
> - **Mọi bài 4–8 và 10–12 cần phần mềm in** (`print-agent`) đang chạy. Chưa có thì chỉ làm được bài 1, 2, 3, 9 và các bước ở phần Cài đặt.
> - Câu "N phiếu lỗi cần xem lại ở POS" trong Cài đặt: **POS chưa có màn xem phiếu lỗi ở Part 1** (làm ở Part 2), chưa xem được thì **không tính FAIL**.
> - Bài thử máy in nhiệt thật `C-0-may-in-that.md` là **cổng của Part 2**, không phải của Part 1.

## 0. Chuẩn bị

**A. Admin-web** chạy bản của nhánh (local: `cd admin-web && npm run dev`, mở `http://localhost:3000/admin/pos`) hoặc domain nếu đã deploy. Đăng nhập **chủ quán** của quán thử. Biến môi trường admin-web có `SUPABASE_JWT_SECRET` và `SUPABASE_SERVICE_ROLE_KEY` (thiếu thì trang in của phần mềm báo lỗi).

**B. Phần mềm in (`print-agent`, cùng nhánh phiên)** — máy Windows ở quầy, Node 22.12 trở lên:
1. `cd print-agent`, chạy `npm ci` (worktree chưa có `node_modules`, bắt buộc cài trước), rồi `npm start` ở bước 3.
2. Chép `agent.config.example.json` thành `agent.config.json` rồi sửa:
   ```json
   {
     "supabaseUrl": "https://<dự án>.supabase.co",
     "anonKey": "<khoá công khai (anon) của Supabase — KHÔNG dùng service role>",
     "webOrigin": "http://localhost:3000",
     "pageSizeMode": "measured"
   }
   ```
   (`webOrigin` là địa chỉ admin-web đang chạy ở bước A, không có dấu `/` cuối; `pageSizeMode` lấy theo kết quả `C-0-may-in-that.md`, chưa thử thì để `measured`.)
3. Chạy `npm start`. Phần mềm hiện ở khay hệ thống cạnh đồng hồ và mở cửa sổ ghép máy. Chuột phải icon khay để xem trạng thái (Đang chạy, Mất kết nối, Cần ghép máy), **Ghép lại** hoặc thoát.

**C. Máy in ảo "MEVO PDF"** (xuất thẳng ra file, không hộp thoại Lưu): **tạo máy in này bằng** `print-agent/scripts/setup-pdf-printer.ps1`, chạy bằng PowerShell **quyền Admin** (không có quyền Admin thì không tạo được). Máy in này **ghi đè** cùng một file `C:\mevo-print-test\out.pdf` mỗi lần in (không phải mỗi lần một file).

> **Lưu ý:** đây là **lần đầu phần mềm in chạy nối thật với server** (trước đó chỉ có test tự động). Gặp lỗi ở Bài 4 (ghép máy) hoặc Bài 6 (in thử) thì **báo lại chi tiết** (thông báo lỗi, dòng `print_jobs`, log phần mềm), **chưa kết luận FAIL cả mục** — có thể là lỗi môi trường/cấu hình cần dò.

**D. Dữ liệu:** có sẵn **một đơn khách** đang chờ thu ngân duyệt (cho bài 1) và **ít nhất 2 danh mục món**.

**E. Kiểm DB** sau mỗi bài khi cần (Supabase SQL editor, chỉ đọc). Thay `<id quán test>` bằng id quán đang test (xem ở `/mevo/stores/<id>`):
```sql
SELECT kind, status, error, attempts, created_at
FROM print_jobs
WHERE store_id = '<id quán test>'
ORDER BY created_at DESC LIMIT 5;
```

---

## Bài 1 — Quán để "Một nơi": mọi thứ như cũ
Cài đặt → In ấn đang là **Một nơi (in bằng trình duyệt)**.
1. POS: duyệt một đơn khách, in phiếu như mọi hôm.
2. In tạm tính một bàn; Hoá đơn & Báo cáo → In báo cáo cuối ngày.
- **Mong đợi:** y hệt trước khi có Đợt này. Phiếu bếp **vẫn có giá và dòng "Tổng phiếu"** (hai liên cùng có giá, quyết định 2026-09-23). Không có phiếu nào đi vào `print_jobs`.
- Kiểm: `SELECT count(*) FROM print_jobs WHERE store_id = '<id quán test>';` không tăng.

## Bài 2 — Bật "Nhiều nơi": tự có trạm Quầy và Bếp
Quán test phải đang có **cả hai** ô "Đơn khách xuống bếp" và "Đơn nhân viên xuống bếp" là **Chờ POS xác nhận**.
1. Cài đặt → In ấn → chọn **Nhiều nơi (qua phần mềm in)**.
- **Mong đợi:** hiện danh sách trạm gồm **Quầy** (nhãn "Quầy") và **Bếp** (nhãn "Bếp mặc định"), hai trạm này **không có nút Xoá**. Hiện ô "Phần mềm in: Chưa kết nối · chưa ghép máy nào" và nút **Thêm máy**.
2. Chuyển về **Một nơi** rồi lại **Nhiều nơi**.
- **Mong đợi:** vẫn đúng 2 trạm (không nhân đôi). Kiểm: `SELECT name, is_pos, is_default_kitchen FROM print_stations WHERE store_id = '<id quán test>' ORDER BY created_at;` đúng 2 dòng.

## Bài 3 — Khoá hai chiều với policy xuống bếp
(Không đổi policy trên quán thật: hệ thống từ chối đổi policy khi quán còn phiên bàn đang mở hoặc đơn đang xử lý. Bài này chỉ **quan sát** ô bị khoá, không cần lưu preset.)
1. Quán test đang ở chế độ **Nhiều nơi**: ở mục **Quy trình vận hành**, hai ô "Đơn khách xuống bếp" và "Đơn nhân viên xuống bếp" bị **khoá** (không bấm chọn được) kèm câu "Đang dùng phần mềm in, phải giữ thu ngân xác nhận". Hai ô đều đang là "Chờ POS xác nhận".
2. Mở Cài đặt của **một quán đang để Tự động** ở ít nhất một trong hai ô (vd. quán trả trước như Pubu; **nếu không có quán nào như vậy thì bỏ bước này**): mục In ấn, lựa chọn **Nhiều nơi bị khoá** kèm giải thích cần cả hai ô là "Chờ POS xác nhận".
3. (Tình huống chéo, không cần lưu) Quán test đang **Một nơi**: đổi một ô policy sang "Tự động chuyển cho bếp" **nhưng KHÔNG bấm Lưu**, rồi kéo lên bấm **Nhiều nơi**.
- **Mong đợi:** không văng trang; sau khi chuyển, hai ô policy hiện lại "Chờ POS xác nhận" (không còn "Tự động"). **Không bấm Lưu.**

## Bài 4 — Thêm máy: mã 6 số
1. Chế độ **Nhiều nơi** → **Thêm máy**.
- **Mong đợi:** hộp thoại hiện **mã 6 số** và giờ hết hạn (khoảng 10 phút sau).
2. Nhập mã vào cửa sổ ghép của phần mềm in.
- **Mong đợi:** phần mềm báo đã ghép. Đóng hộp thoại, Cài đặt hiện **Phần mềm in: Đã kết nối**. Trong vòng ~15 giây ô chọn máy in của mỗi trạm có **danh sách máy in Windows** (có "MEVO PDF").

## Bài 5 — Mã sai và mã quá hạn
Sau khi bài 4 đã ghép xong, cửa sổ ghép đã đóng. Muốn nhập mã lần nữa: **chuột phải icon khay → Ghép lại**.
1. Cài đặt → **Thêm máy**; ở cửa sổ ghép nhập một mã **sai**. **Mong đợi:** bị từ chối, không báo lỗi lạ.
2. Thêm máy, **đợi quá 10 phút**, nhập mã đúng. **Mong đợi:** bị từ chối ("Mã không đúng hoặc đã hết hạn").
3. Thêm máy, nhập mã đúng và còn hạn: ghép được.

## Bài 6 — In thử từng trạm
1. Gán máy in **MEVO PDF** cho trạm Quầy và trạm Bếp (chọn rồi bấm **Lưu**).
2. Bấm **In thử** ở trạm Quầy. Mở `C:\mevo-print-test\out.pdf`: đúng **tên quán**, khổ phiếu 80mm. **Đóng file PDF** (và đổi tên/chép sang chỗ khác) trước khi làm tiếp.
3. Bấm **In thử** ở trạm Bếp, xem lại file như trên.
- Driver ảo có thể xuất ra **khổ A4** thay vì 80mm: **không tính FAIL**. Khổ 80mm chỉ kiểm ở bài máy in nhiệt thật `C-0-may-in-that.md`.
- Máy in ảo ghi đè cùng một file, và không in được nếu file đang mở trong trình xem PDF — nên **không mở sẵn PDF khi bấm In thử**.
- Kiểm: hai dòng mới nhất của `print_jobs` có `kind = 'test'`, `status = 'done'`.

## Bài 7 — Trạm chưa chọn máy in
Nút **In thử** bị khoá khi trạm chưa có máy in, nên dựng tình huống như sau:
1. Thêm trạm "Bar", chọn máy in **MEVO PDF**, **Lưu**.
2. **Tắt phần mềm in**, bấm **In thử** ở trạm Bar (job nằm chờ).
3. Đổi trạm Bar về **Chưa chọn máy in**, **Lưu**. Bật phần mềm in.
- **Mong đợi:** job in thử của Bar thành `status = 'failed'`, `error = 'Trạm chưa chọn máy in'`; phiếu khác vẫn in bình thường.

## Bài 7b — In lại một job lỗi: phiếu có chữ "IN LẠI"
Chuyển sang Part 2: nút In lại nằm ở POS, Part 1 chưa nối nên chưa bấm được. Hàm `retry_print_job` cũng không gọi được từ SQL editor vì cần phiên đăng nhập. Phần này đã có test tự động (`retried` trong test SQL 114, tiêu đề IN LẠI trong test trang `/print/agent`). Không tính FAIL.

## Bài 8 — Tắt phần mềm 40 giây
1. Tắt phần mềm in, đợi ~40 giây. **Mong đợi:** Cài đặt báo **Chưa kết nối**.
2. Trong lúc tắt, bấm **In thử** ở trạm Quầy **2 lần** (phải đã gán máy in MEVO PDF).
3. Bật lại phần mềm. **Mong đợi:** tự kết nối (không cần mã mới), **tự in 2 phiếu còn trong hàng đợi**, trạng thái về "Đã kết nối".
- Kiểm bằng `print_jobs` (máy in ảo chỉ giữ file cuối nên không đếm bằng PDF): **2 dòng mới nhất** `kind = 'test'`, `status = 'done'`.
4. Một phiếu chờ quá **30 phút** thì không in nữa, thành `expired` (không in muộn). Bước này tuỳ chọn (phải đợi lâu).

## Bài 9 — Gán trạm cho danh mục ở trang Món
1. Trang **Món** → sửa một danh mục → chọn trạm (vd. Bar) ở ô **Trạm in phiếu bếp** → Lưu → mở lại: thấy đúng trạm.
2. Chọn lại "Theo trạm bếp mặc định" → Lưu → mở lại: thấy mặc định.
3. Thêm danh mục mới có chọn trạm: lưu được.
4. (Chỉ đúng ở **quán chưa từng có trạm in** — quán đã từng bật "Nhiều nơi" vẫn thấy ô này dù đang Một nơi. Nếu không có quán như vậy thì **bỏ bước này**.) Quán chưa từng có trạm: **không** thấy ô này.
5. Đăng nhập **thu ngân**: trang Món chỉ có công tắc Tạm hết, **không** có ô trạm.

## Bài 10 — Gỡ máy
1. Cài đặt → In ấn → **Gỡ máy** → xác nhận.
- **Mong đợi:** Cài đặt về "Chưa kết nối · chưa ghép máy nào"; phần mềm ở quầy chuyển sang **"Cần ghép máy"** và không nhận việc nữa. Ghép lại bằng mã mới được.

## Bài 11 — Xoá trạm khi phiếu đang chờ: phiếu ra trạm thay thế
Điều kiện: **trạm Quầy đã có máy in** (MEVO PDF) và phần mềm in đang chạy.
1. Tạo trạm "Nướng", chọn máy in **MEVO PDF**, **Lưu**.
2. **Gán trước:** trang Món → gán một danh mục cho trạm "Nướng" (bài 9).
3. **Tắt phần mềm in**. Bấm **In thử** ở trạm "Nướng" (job nằm chờ).
4. Xoá trạm "Nướng" (xác nhận).
5. Bật phần mềm in.
- **Mong đợi:** phiếu in thử **vẫn ra** ở máy của trạm **Quầy** (phiếu `test` không phải phiếu bếp nên thay thế là Quầy), **không** báo "Trạm chưa chọn máy in". Kiểm: job đó có `station_id` là id của trạm Quầy: `SELECT j.station_id, s.name FROM print_jobs j LEFT JOIN print_stations s ON s.id = j.station_id WHERE j.store_id = '<id quán test>' ORDER BY j.created_at DESC LIMIT 1;`
6. Trang Món: danh mục đã gán "Nướng" giờ hiện **"Theo trạm bếp mặc định"**.
- **Chưa kiểm được ở Part 1:** phiếu **bếp** của một đơn thật (món thuộc trạm đã xoá) ra trạm bếp mặc định — phần này chỉ kiểm được sau Part 2 (khi nút duyệt đơn trên POS đi qua hàng đợi). Phần thay thế ở mức hàng đợi đã có test tự động.

## Bài 12 — Lỗi giữa chừng (đọc kết quả, không bắt buộc PASS ngay)
- Đổi tên máy in ảo trong Windows rồi bấm **In thử**: phiếu phải thành `failed` với lý do dễ hiểu và **không** tự in lại sau khi đổi tên về (không in trùng).
- Ghi chú: trường hợp một phiếu ở trạng thái "đang in" quá 2 phút (thành `failed` "Không rõ đã in chưa, kiểm tra máy in rồi bấm In lại") **không có cách dựng tay**; đã có test tự động (`supabase/tests/114_print_stations_jobs.test.mjs`).

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
| 7b | Part 2 | |
| 8 | | |
| 9 | | |
| 10 | | |
| 11 | | |
| 12 | | |

Kết luận: **PASS** / **FAIL**. FAIL thì chép nguyên văn thông báo lỗi và dòng `print_jobs` liên quan.
