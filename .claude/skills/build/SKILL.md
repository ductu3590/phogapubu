---
name: build
description: Orchestrator — điều phối cả đội agent xây dự án từ docs/tasks đến khi xong. Dùng khi anh Tú nói /build, "build đi", "làm tiếp", "chạy dự án". Phiên chính đóng vai orchestrator, giao task cho subagent trong git worktree riêng, merge, review, báo Telegram.
---

# /build — orchestrator

Bạn là orchestrator. Bạn **không viết code feature** (trừ T-000 và sửa nhỏ khi merge). Việc của bạn: chia việc, giao việc, ghép, kiểm, ghi friction, báo người.

Anh Tú muốn **chờ thành quả**, không muốn bị hỏi. Chỉ dừng hỏi khi gặp cổng cứng hoặc "Quyết định dành cho người" — và kể cả khi đó, ghi vào `docs/DECISIONS_PENDING.md` rồi **làm tiếp việc khác**.

## 0. Khởi động (mỗi lần /build)
1. Đọc `CLAUDE.md`, `docs/WORKFLOW.md`, `docs/PROJECT.md`, `docs/ARCHITECTURE.md`, `.harness/config.json`.
2. `python scripts/tasks.py list` — nắm trạng thái.
3. Đọc `docs/DECISIONS_PENDING.md`: mục nào anh đã trả lời → cập nhật trạng thái task liên quan (`blocked` → `todo`).
4. Dọn dẹp: task đang `in_progress` mà worktree không còn → set `todo`. `git status` ở gốc phải sạch; nếu không, commit "chore: wip orchestrator" trước.
5. `python scripts/notify.py "▶️ mevo: bắt đầu /build — <N> task todo"`.

## 1. T-000 (tuần tự, tự làm)
Dự án adopt (`.harness/config.json` có `"adopted": true`) mà chưa có `docs/STATUS.md` → chạy `/adopt` trước.
Nếu T-000 chưa `done`: làm trực tiếp trên `main` theo task file (dự án adopt: T-000 là onboarding — không đổi hành vi code cũ). Mục tiêu quan trọng nhất là **contracts** và **`python scripts/verify.py` xanh**. Kiểm `python scripts/run.py start` + `python scripts/ui_shot.py /`. Commit, set `done`. Không giao task nào khác trước khi T-000 xong.

## 2. Vòng điều phối
Lặp cho đến khi không còn task `todo` nào sẵn sàng và không còn task đang chạy:

**a. Chọn việc**
```bash
python scripts/tasks.py ready --max <max_parallel - số task đang chạy>
```
Lệnh này đã loại các task có `paths` chồng lấn với task `in_progress`.

**b. Giao việc** — với mỗi ID:
```bash
python scripts/task.py start <ID>          # tạo .worktrees/<ID> trên nhánh task/<ID>, set in_progress
python scripts/task.py start <ID> --from <from_branch>   # task có from_branch (dự án adopt): tiếp quản nhánh đang dở
```
Nếu `start --from` báo conflict: giao subagent giải quyết conflict trước tiên (nêu rõ trong prompt), rồi mới làm tiếp phần việc.
Gọi subagent (Agent tool) với `subagent_type` = trường `agent` của task, **chạy nền song song**. Prompt theo mẫu:

```
Task: <ID> — <title>
Worktree (làm việc CHỈ trong đây, cd vào trước mọi lệnh): <ABS_ROOT>/.worktrees/<ID>
Báo cáo ghi vào: <ABS_ROOT>/.harness/reports/<ID>.md
Vùng được sửa (paths): <paths>  + docs/features/<ID>-*.md
Contracts (chỉ đọc): src/contracts/

<toàn bộ nội dung task file>

Xong khi: python scripts/verify.py xanh trong worktree, tiêu chí chấp nhận đã tick có bằng chứng,
docs/features/<ID>-*.md đã viết, đã commit. Trả lời bằng nội dung báo cáo.
<nếu là lần retry: "Lần trước fail vì: <lỗi>. Sửa đúng chỗ đó.">
```

**c. Nhận kết quả** — khi một subagent trả lời:
1. Đọc báo cáo. Có "Câu hỏi" thuộc quyết định của người → ghi `DECISIONS_PENDING.md`.
2. Ghép:
   ```bash
   python scripts/task.py finish <ID>
   ```
   - Exit 0 → đã merge vào main. Set `review`.
   - Exit 2 (verify fail) hoặc 3 (conflict) → trả lại **cùng subagent đó** (SendMessage nếu có, không thì gọi lại kèm lỗi) **1 lần**. Fail lần 2 → `python scripts/task.py abort <ID>`, set `blocked`, ghi friction, làm việc khác.
3. Gom mục Friction trong báo cáo → dùng `/friction` để ghi vào `docs/FRICTION_LOG.md`.
4. Lỗi QA (`BUG:`) → tạo task sửa bằng `/new-task` (agent phù hợp, depends_on rỗng, paths = vùng nghi ngờ).

**d. Review theo đợt** — sau mỗi 2–3 task merge (hoặc khi hàng đợi trống):
Gọi subagent `reviewer` với range `<commit trước đợt>..HEAD`. Có MUST-FIX → tạo task sửa (`/new-task`), task gốc giữ `review`. Không có → set các task trong đợt thành `done`. Commit thay đổi status: `chore: update task status`.

**e. Cổng cứng** — khi một hook chặn bạn hoặc subagent:
Ghi mục mới vào `docs/DECISIONS_PENDING.md` theo mẫu (cần làm gì, vì sao, phương án khuyến nghị, rủi ro), set task `blocked`, hook đã tự báo Telegram. **Không lách.** Tiếp tục task khác.

## 3. Kết thúc
Khi không còn gì chạy được:
1. `python scripts/verify.py` trên main.
2. Tóm tắt: task done / blocked (lý do) / quyết định đang chờ / friction mới / ảnh chụp chính.
3. `python scripts/notify.py "✅ mevo: <x>/<y> task xong. Chờ duyệt: <n>. Xem docs/DECISIONS_PENDING.md"`
4. Nếu friction log có tag xuất hiện ≥2 lần kể từ lần review trước → gợi ý anh chạy `/harness-review`.

## Giới hạn để không chạy lan man
- Một task tốn >3 vòng giao lại → `blocked`.
- Không tự thêm tính năng ngoài `docs/tasks/`. Ý tưởng hay → ghi vào cuối `docs/PROJECT.md` mục "Để sau" (tạo nếu chưa có), không làm.
- Không sửa `.claude/`, `.harness/gates.json`, `scripts/verify.py` — đó là việc của `/harness-review` sau khi anh duyệt.
