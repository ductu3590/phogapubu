# ST-3 — Trang cấu hình mở thành hộp thoại đè lên POS (bản Stitch A01–A05)

Nhánh `feat/pos-timeline`. Không đổi nội dung / thao tác của các trang cấu hình — chỉ đổi CÁCH mở.
Không đổi API / RPC / database.

## Đã làm

| Chỗ | Sau ST-3 |
|---|---|
| Mở từ trong ứng dụng | Bấm **Món · Đơn · Báo cáo** trên thanh icon, hoặc mục trong ô **Thêm** (Cài đặt quán, Bàn & QR, Nhân viên, Ưu đãi, Vòng quay, Tài khoản) → trang đó hiện trong **hộp thoại lớn đè lên POS**. POS phía sau **vẫn chạy** (đơn mới, chuông, gọi nhân viên không tắt) |
| Hộp thoại | Đầu: icon cánh răng cam + "Quản trị & cấu hình quán" + tên quán, nút X. Hàng **tab**: Cấu hình quán · Thực đơn & Giá · Sơ đồ bàn & QR · Hoá đơn · Báo cáo · Nhân viên · Ưu đãi · Vòng quay · Tài khoản — đổi tab không rời hộp thoại |
| Đóng | **X**, phím **Esc**, bấm nền tối bên ngoài, hoặc nút Back của trình duyệt → về đúng trang nền (kể cả khi trong hộp thoại đã đổi ngày lọc Đơn hàng) |
| Mở thẳng URL / F5 | `/admin/settings`, `/admin/menu`… vẫn ra **trang đầy đủ** như cũ (dán link, đánh dấu trang vẫn dùng được) |
| Không đổi | POS, Bếp, Đặt bàn vẫn là trang riêng. Đường dẫn sai `/admin/...` vẫn báo 404 |
| Điện thoại | Hộp thoại phủ kín màn; hàng tab cuộn ngang, tab đang chọn tự cuộn vào giữa |

## Test (chủ quán Bảo Lương, nhớ khởi động lại dev server)

1. Đang ở POS, bấm **Món** trên thanh icon → hộp thoại "Quản trị & cấu hình quán", tab **Thực đơn & Giá** sáng; POS mờ phía sau; URL là `/admin/menu`.
2. Bấm lần lượt các tab → nội dung đổi ngay trong hộp thoại; sửa thử một món / bật tắt món → lưu được như trang cũ.
3. Trong lúc hộp thoại mở, dùng Mini App gọi một món ở một bàn → **chuông vẫn kêu**; đóng hộp thoại → POS đã có thẻ lượt món mới (không cần F5).
4. Đóng bằng **X**, bằng **Esc**, bằng bấm nền tối → mỗi lần đều về POS, không mất bàn đang mở bill.
5. Tab **Hoá đơn** → đổi ngày lọc 2–3 lần → bấm X → về thẳng POS (không phải bấm Back nhiều lần).
6. Ô **Thêm** → Bàn & QR / Nhân viên / Ưu đãi / Vòng quay / Tài khoản / Cài đặt quán đều mở trong hộp thoại.
7. Đang ở hộp thoại, bấm **F5** → ra trang đầy đủ (không hộp thoại), vẫn dùng được.
8. Bấm **Bếp** / **Đặt bàn** trên thanh icon (khi không mở hộp thoại) → vẫn là trang riêng như trước.
9. Điện thoại: menu ☰ → Bàn & QR → hộp thoại phủ kín, tab "Sơ đồ bàn & QR" thấy rõ; nút X đóng về POS.

## Vá vòng 1 (2026-10-04) — tab cấu hình load "siêu chậm"

| Nguyên nhân (đo trên bản build) | Sửa |
|---|---|
| POS chạy phía sau gọi **server action đọc dữ liệu liên tục ~1 lần/giây** (gọi nhân viên 2s, đặt bàn 2s, phiên bàn 5s, món đặt trước 5s, gọi nhắc 15s). Next xếp server action CHUNG hàng đợi với chuyển trang → mỗi lần đổi tab phải chờ 4–10 giây, có lúc kẹt hẳn ở tab cũ | POS đọc định kỳ **thẳng từ trình duyệt** bằng client Supabase (`lib/pos-browser-reads.ts`), không qua server action. Tần suất giữ nguyên nên chuông gọi nhân viên vẫn chắc ăn; các hàm RPC tự kiểm quyền theo quán. Đo 10 giây ở POS: **0** server action |
| Mỗi trang hỏi lại phiên đăng nhập 3–4 lần (layout, trang, vỏ hộp thoại…) — mỗi lần 2 chặng mạng tới Supabase | `loadOperator` bọc `cache()` → 1 lần mỗi lần tải |
| Đổi tab dựng lại cả vỏ hộp thoại, không có gì hiện trong lúc chờ | Vỏ hộp thoại nằm ở **layout dùng chung** (không dựng lại khi đổi tab) + **khung chờ** hiện ngay |

Đo trên bản build: bấm tab → **phản hồi ~65 ms** (tab sáng + khung chờ), nội dung đầy đủ **~0,8–0,9 giây** (trước: 4–10 giây hoặc kẹt).
⚠️ Chạy `npm run dev` thì lần ĐẦU mở mỗi tab còn chậm thêm vài giây vì dev server biên dịch tại chỗ — lần sau mới nhanh. Bản build / Vercel không bị.

10. Mở hộp thoại từ POS, bấm lần lượt 9 tab: tab sáng ngay + khung chờ, nội dung ra trong khoảng 1 giây (bản build) — không còn kẹt ở tab cũ.
11. Trong lúc hộp thoại mở, khách bấm Gọi nhân viên → chuông vẫn kêu, đóng hộp thoại thấy thẻ gọi NV; khách gọi món → thẻ lượt mới hiện (đọc từ trình duyệt vẫn chạy).

## Vá vòng 2 (2026-10-04) — log dev của anh vẫn chậm

| Trong log | Là gì | Xử lý |
|---|---|---|
| `next.js: 49s / 16.2s / 12.5s` ("Compiling …") | **Dev server biên dịch trang lần đầu** — chỉ có ở `npm run dev`, chiếm ~95% thời gian chờ | Không phải lỗi hệ thống; bản build / Vercel không có bước này. Mở lại tab lần 2 sẽ nhanh |
| `proxy.ts: 300–1700ms` mỗi request | Middleware tra `mevo_operators` ở MỌI request, kể cả server action + request ngầm khi chuyển trang | Bỏ tra role cho server action + request RSC (layout /admin, /mevo, /staff tự kiểm quyền, RLS là khoá thật); vẫn làm mới phiên |
| `POST … loadFloorLayout()` sau mỗi lần chuyển | Sơ đồ bàn tự tải lại qua server action khi cửa sổ được focus | Đọc thẳng từ trình duyệt như các phần khác |

Vercel chạy ở **sin1 (Singapore)** cùng vùng với Supabase → trên bản thật mỗi lần gọi DB chỉ vài ms, nhanh hơn số đo trên máy (VN → Singapore). Đo bản build trên máy: phản hồi tab ~65 ms, nội dung ~0,8–0,9 s (Sơ đồ bàn & QR ~1,4 s vì dựng 20 mã QR).

## Vá vòng 3 (2026-10-04) — gọn thanh icon

- **Bếp** chỉ hiện với quán dùng màn hình bếp. Quán "thu ngân xác nhận rồi in phiếu" (`kitchen_release_policy = pos_confirmation`, như Bảo Lương) ẩn mục này. Pubu vẫn thấy Bếp như cũ.
- **Đặt bàn** bỏ khỏi thanh icon (việc hằng ngày đã làm trên POS), chuyển vào ô **Thêm** và thành **tab đầu tiên của hộp thoại cấu hình**. Quán không bật đặt bàn thì không thấy.
- Vá lỗi đi kèm: mở Đặt bàn trong hộp thoại làm hộp thoại **sập** (POS phía sau và trang Đặt bàn mở trùng một kênh realtime). Giờ mỗi lần theo dõi dùng kênh riêng.

12. Đăng nhập Bảo Lương: thanh icon chỉ còn **POS · Món · Đơn · Báo cáo** (không còn Bếp, Đặt bàn).
13. Bấm **Thêm → Đặt bàn**: hộp thoại mở, tab **Đặt bàn** sáng đầu hàng, danh sách hiện đủ, hộp thoại KHÔNG tự biến mất. Đổi sang tab khác rồi quay lại Đặt bàn vẫn bình thường.
14. Trong tab Đặt bàn, bấm **Mở bill trên POS** ở một khách đã đến → hộp thoại đóng, POS mở đúng bill.
15. (Nếu có) đăng nhập Pubu: vẫn thấy **Bếp** trên thanh icon; ô Thêm và hộp thoại không có Đặt bàn.

**→ Báo:** `ST-3 PASS` hoặc số bài FAIL kèm ảnh.
