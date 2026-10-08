# PA-3 — Sơ đồ bàn & QR theo khu

Spec `docs/superpowers/specs/2026-10-07-pos-admin-complete-design.md` · Plan `docs/superpowers/plans/2026-10-08-pa3-tables-areas-qr.md`
Migration đã áp prod: 094 (`table_areas.color`, `pos_get_floor_layout` trả màu). Test trên **Bảo Lương**, đăng nhập chủ quán.

## Tab Sơ đồ bàn & QR (Thêm → Bàn & QR)
1. Bàn nhóm theo khu: **Trong nhà** (7 bàn, tím pastel) rồi **Ngoài trời** (13 bàn, chàm pastel). Mỗi khu có chấm màu + vạch màu bên trái + "N bàn".
2. **+ Thêm khu** → tên "Tầng 2" → chọn màu → Lưu → khu mới hiện cuối, ghi "Chưa có bàn".
3. Tạo khu trùng tên ("trong nhà") → báo "Đã có khu tên «Trong nhà»".
4. **Tuỳ chỉnh khu** ở "Tầng 2": đổi tên "Sân thượng", đổi màu → lưu → đổi ngay.
5. Ở một bàn bất kỳ chọn **Khu → Sân thượng** → bàn chuyển nhóm. **Tuỳ chỉnh khu** "Sân thượng" → nút Xoá bị khoá, ghi "Khu còn 1 bàn…".
6. Chuyển bàn đó về khu cũ → Tuỳ chỉnh "Sân thượng" → **Xoá khu** (bấm 2 lần) → khu biến mất.
7. **+ Thêm bàn** có ô Khu → thêm "Bàn test" vào Ngoài trời → bàn mới hiện NGAY trong đúng nhóm (không cần tải lại trang). (Xoá bàn test sau khi xong.)

## In QR
8. **In QR cả quán** → tab mới: lưới 3 cột, 20 mã, mỗi mã có tên bàn to + chấm màu + tên khu + tên quán. Bấm **In** → bản xem trước A4 12 mã/trang, KHÔNG thấy thanh bên admin. Chọn "Lưu dưới dạng PDF" → ra file.
8b. Bản xem trước in phải có **2 trang** (12 + 8 mã) — không được chỉ trang đầu. Địa chỉ tab in là `/print/table-qr?...` (không có thanh bên admin).
9. **In QR khu này** ở Trong nhà → chỉ 7 mã.
10. **In QR** ở một thẻ bàn → đúng 1 mã.
11. Quét thử 1 mã in ra bằng Zalo → mở Mini App đúng bàn.
12. Tắt (Đóng) một bàn → in cả quán → bàn đó không có trong tờ in.

## POS
13. POS → Timeline: dải tiêu đề khu tô đúng màu khu pastel (tím / chàm), KHÔNG còn xanh lá / xanh dương.
14. Tab Sơ đồ bàn trên POS: nút chọn khu có chấm màu đúng khu.
15. Đang bấm **Sắp xếp bàn** trên POS (chưa lưu), máy khác đổi khu một bàn ở tab Bàn & QR → bấm Lưu sơ đồ ở POS → báo sơ đồ đã bị máy khác thay đổi, tải lại (không ghi đè). Lưu sơ đồ xong màu khu vẫn giữ nguyên.

**→ Báo:** `PA-3 PASS` hoặc số bài FAIL kèm ảnh.
