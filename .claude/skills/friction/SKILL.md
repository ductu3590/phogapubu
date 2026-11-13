---
name: friction
description: Ghi một mục vào docs/FRICTION_LOG.md đúng mẫu 4 dòng và sửa ngay đúng chỗ vấp (micro). Dùng khi agent thử ≥3 lần, mở >5 file mới tìm ra, phải đoán, bị cổng cứng chặn, hoặc anh Tú phải can thiệp.
---

# /friction — ghi vấp, sửa đúng con ốc

Chỉ orchestrator ghi file này (tránh xung đột giữa các worktree). Subagent ghi friction vào báo cáo; orchestrator gom về đây.

## 1. Ghi
```bash
python scripts/tasks.py friction-id     # → F-00N kế tiếp
```
Thêm vào cuối `docs/FRICTION_LOG.md`:
```
### F-00N · <YYYY-MM-DD> · <task ID> · tag: <tag>
- Vấp: <ở đâu, mất mấy lần, vì sao — cụ thể, đo được>
- Sửa: <đã sửa gì để lần sau không vấp>
- Dự đoán: <lần sau sẽ ra sao>
- Thực tế: (điền khi gặp lại)
```
Tag dùng lại tag cũ nếu cùng kiểu (xem đầu file) — gom nhóm đúng mới phát hiện được mẫu lặp.

## 2. Sửa đúng chỗ (chọn MỘT, nhỏ nhất có tác dụng)
| Kiểu vấp | Cách sửa |
|---|---|
| Tìm file lâu | Thêm 1 dòng vào "Chỉ đường nhanh" trong `docs/ARCHITECTURE.md`, hoặc dọn/đổi tên thư mục |
| Lặp một chuỗi lệnh | Viết script trong `scripts/` (không đụng `scripts/verify.py`) |
| Thiếu hiểu biết nghiệp vụ | Thêm quy tắc vào `docs/PROJECT.md` mục Quy tắc nghiệp vụ |
| Báo xong mà chưa nhìn | Nhắc dùng `/see-ui`; nếu lặp → đề xuất thêm bước vào agent (qua `/harness-review`) |
| Contract lệch | Sửa contract trên main + ADR, rồi mới giao lại task |
| Cần sửa `.claude/` hoặc `gates.json` | Không tự sửa — ghi đề xuất, để `/harness-review` |

**Không** thêm câu chung chung kiểu "hãy cẩn thận" vào CLAUDE.md.

## 3. Cập nhật "Thực tế"
Gặp lại tình huống của một mục cũ → điền dòng Thực tế: dự đoán đúng hay sai. Sai → đó là tín hiệu cho `/harness-review`.

Commit: `docs(friction): F-00N <tag>`.
