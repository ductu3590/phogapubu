# Tasks

Mỗi task một file `T-NNN-<slug>.md`. Frontmatter được `python scripts/tasks.py` và hook `guard_files.py` đọc — giữ đúng định dạng.

```markdown
---
id: T-003
title: API đăng ký giải đấu
agent: backend-dev            # orchestrator | backend-dev | frontend-dev | qa-tester
status: todo                  # todo | in_progress | review | done | blocked
depends_on: [T-000]
paths:
  - src/modules/registration/**
  - src/app/api/registrations/**
---
## Mục tiêu
## Đầu vào / contract dùng
## Tiêu chí chấp nhận
- [ ] (kiểm được bằng test/lệnh)
## Ghi chú
```

- Chỉ orchestrator sửa `status` (`python scripts/tasks.py set T-003 done`).
- `paths` = vùng sở hữu. Hook chặn subagent sửa file ngoài vùng (trừ `docs/features/<ID>*`).
- Tạo task mới giữa chừng: skill `/new-task`.
