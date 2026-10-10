# PA-4 — Thực đơn: tìm, lọc, mã món, nhãn món

Spec `docs/superpowers/specs/2026-10-07-pos-admin-complete-design.md` · Plan `docs/superpowers/plans/2026-10-08-pa4-menu-search-sku-badge.md`
Migration đã áp prod: 095 (`sku_prefix`, `sku`, `badge`, trigger tự sinh mã; đã sinh mã cho 65 món Bảo Lương). Test trên **Bảo Lương**, đăng nhập chủ quán.

## Tìm + lọc (Thêm → Thực đơn & Giá)
1. Mỗi món có **mã** chữ nhỏ dưới tên (VD "Món ngon tuần này" → MNTN-001…; "Đồ uống" → DU-001…; "Cơm rang - Mỳ xào" → CRMX-001…).
2. Gõ "bia" (không dấu) → ra mọi món có "bia" ở MỌI danh mục, mỗi dòng ghi tên danh mục; tiêu đề "Kết quả tìm «bia» (N)".
3. Gõ mã "du-00" → ra các món Đồ uống. Xoá ô tìm → về danh mục đang chọn.
4. Bấm **Tạm hết (N)** → chỉ món đang tắt; số trên 3 nút đúng. Khi đang tìm/lọc: không kéo sắp xếp được, có dòng nhắc.
5. Về **Tất cả** + không tìm → kéo sắp xếp hoạt động như cũ.

## Mã món + nhãn
6. Sửa một món → ô **Mã món** có mã hiện tại, ô **Nhãn** = Không có. Chọn nhãn **Best seller** → Lưu → dòng món có nhãn cam "Best seller".
7. Sửa món khác, gõ mã trùng với món đã có (VD DU-001) → báo ngay trong hộp "Mã món đã dùng cho «…»" (KHÔNG chuyển sang trang lỗi), không lưu — và chữ đã gõ trong form (tên, giá, mô tả, mã) VẪN CÒN, không bị xoá trắng.
8. Gõ mã sai ("bia tháp") → báo lỗi định dạng.
9. **Thêm món** vào "Đồ uống", để trống mã → lưu xong món có mã DU-0xx kế tiếp.
10. Sửa danh mục → có ô **Tiền tố mã món** (DU). Đổi thành "BIA" → thêm món mới vào danh mục → mã BIA-001; các món cũ giữ mã DU-…
11. Tạo danh mục mới "Lẩu" → tự có tiền tố "L".

## Thu ngân
12. Đăng nhập thu ngân → Thực đơn (Tạm hết): hiện mã món; gõ mã vào ô tìm ra đúng món. Không có ô sửa mã/nhãn.

## Mini App (sau khi merge vào worktree Bảo Lương + zmp deploy)
13. Món gắn **Best seller** / **Món của quán** hiện nhãn nhỏ màu chủ đạo của quán trên thẻ món (cả dạng lưới lẫn danh sách) và trong bảng chọn tuỳ chọn món.
14. Món không có nhãn không hiện gì; khách KHÔNG thấy mã món.

Migration bổ sung: 096 (mã tay số quá lớn như DU-99999999999 không còn làm hỏng việc tự sinh mã).

**→ Báo:** `PA-4 PASS` hoặc số bài FAIL kèm ảnh.
