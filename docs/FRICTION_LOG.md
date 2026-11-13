# Friction Log — nhật ký vấp

Thứ quan trọng nhất của harness. Ngay đầu nó trống — đúng như vậy.

**Ghi khi:** agent thử ≥3 lần mới được · mở >5 file mới tìm ra chỗ · phải đoán vì thiếu thông tin · bị cổng cứng chặn · người phải can thiệp.
**Không ghi:** lời nhắc chung chung kiểu "nhớ cẩn thận".

Mẫu (đúng 4 dòng + tiêu đề có `tag` để gom nhóm):

```
### F-001 · 2026-11-09 · T-003 · tag: tim-file
- Vấp: sửa bug tính phí, mở 6 file mới thấy chỗ tính giá
- Sửa: thêm mục "Luồng tính giá" vào ARCHITECTURE.md
- Dự đoán: lần sau 1–2 lần là trúng
- Thực tế: (điền khi gặp lại)
```

Tag gợi ý: `tim-file` · `mu-ui` (báo xong mà chưa nhìn giao diện) · `contract-lech` · `de-file` · `thieu-lenh` · `test-gia` · `hoi-nguoi` · `gate` · `moi-truong` · `spec-mo-ho`.

`/harness-review`: tag xuất hiện ≥2 lần → không còn là con ốc, mà là harness thiếu bước hoặc thiếu luật → sửa macro.

---

<!-- Các mục mới thêm bên dưới, mới nhất ở cuối -->
