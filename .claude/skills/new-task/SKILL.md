---
name: new-task
description: Tạo một task mới trong docs/tasks đúng định dạng (id, agent, paths, depends_on, tiêu chí chấp nhận). Dùng khi orchestrator cần task sửa lỗi QA/reviewer, hoặc anh Tú yêu cầu thêm tính năng giữa chừng.
---

# /new-task

1. Lấy ID kế tiếp: `python scripts/tasks.py next-id`.
2. Xác định:
   - `agent`: backend-dev | frontend-dev | qa-tester.
   - `paths`: vùng nhỏ nhất đủ để làm xong. Kiểm tra không chồng với task `in_progress` (`python scripts/tasks.py list`). Không đưa `src/contracts/**` vào — đổi contract thì orchestrator làm trên main + ADR.
   - `depends_on`: task nào phải merge trước.
3. Nếu là yêu cầu mới từ anh Tú: đối chiếu `docs/PROJECT.md` mục **Không làm**. Trùng → nói rõ và hỏi anh có muốn đổi phạm vi không (đây là quyết định của người).
4. Tạo `docs/tasks/<ID>-<slug>.md`:
   ```markdown
   ---
   id: <ID>
   title: <tiêu đề>
   agent: <agent>
   status: todo
   depends_on: [<...>]
   paths:
     - <glob>
   ---
   ## Mục tiêu
   ## Bối cảnh (link báo cáo QA/review nếu là task sửa lỗi)
   ## Tiêu chí chấp nhận
   - [ ] <kiểm được bằng test/lệnh>
   ```
5. `python scripts/tasks.py lint` phải sạch. Commit: `chore(tasks): add <ID>`.
