# Workflow — một việc đi qua những bước nào

Quy trình cố ý mỏng. Chỉ thêm bước khi `FRICTION_LOG.md` cho thấy một kiểu lỗi lặp lại ≥2 lần.

## Vòng đời task

```
todo ──► in_progress ──► review ──► done
  │           │             │
  └───────────┴─────────────┴──► blocked (ghi lý do + DECISIONS_PENDING nếu cần người)
```

| Bước | Ai làm | Việc | Điều kiện qua bước |
|---|---|---|---|
| 1. Chọn task | orchestrator | `tasks.py ready` → task có `depends_on` đã done, `paths` không chồng task đang chạy | ≤ `max_parallel` task cùng lúc |
| 2. Mở worktree | orchestrator | `python scripts/task.py start <ID>`, set `in_progress` | worktree `.worktrees/<ID>` sẵn sàng |
| 3. Làm | subagent | code + test trong `paths`, cập nhật `docs/features/<ID>-*.md`, commit | `python scripts/verify.py` xanh trong worktree |
| 4. Báo cáo | subagent | ghi `.harness/reports/<ID>.md`: thay đổi, cách kiểm, friction, câu hỏi | báo cáo đủ 4 mục |
| 5. Merge | orchestrator | `task.py finish <ID>`: verify → ghép main mới nhất → verify → merge `--no-ff` | merge sạch, verify xanh trên main |
| 6. Review | reviewer | soát diff của đợt merge: bảo mật, contracts, docs, phạm vi PROJECT | không còn mục `MUST-FIX` |
| 7. Đóng | orchestrator | set `done`, gộp friction vào `FRICTION_LOG.md`, báo Telegram nếu là mốc | — |

Retry: một task fail ở bước 5 được trả lại subagent **1 lần** kèm lỗi. Fail lần 2 → `blocked`, ghi friction, làm task khác.

## Chỗ con người duyệt (chỉ 3 loại)
1. **Spec** — trước khi tạo dự án (kickoff).
2. **Cổng cứng** — hook chặn → agent ghi `docs/DECISIONS_PENDING.md` → anh chạy `python scripts/approve.py <gate> <giờ>` hoặc trả lời trong file.
3. **Release production** — chỉ qua CI, anh bấm.

Mọi câu hỏi khác: agent tự quyết theo `docs/PROJECT.md`, `docs/decisions/`, `~/.harness-kit/defaults.md`, và ghi giả định vào báo cáo.

## Thế nào là xong (Definition of Done)
- `python scripts/verify.py` xanh trên `main` sau merge.
- Mọi ô tiêu chí chấp nhận của task đã tick, có bằng chứng (test, ảnh chụp, log).
- `docs/features/<ID>-*.md` mô tả: tính năng làm gì, file chính, cách kiểm thủ công.
- Không còn `MUST-FIX` từ reviewer.
