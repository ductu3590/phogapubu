# mevo — bản đồ cho agent

Giữ file này mỏng. Chi tiết nằm ở file được link. Khi thêm luật mới, chỉ thêm nếu `docs/FRICTION_LOG.md` cho thấy cần.

## Đọc theo thứ tự
1. `docs/PROJECT.md` — làm gì, cho ai, **không làm gì**, quyết định dành cho người.
2. `docs/ARCHITECTURE.md` — module, thư mục sở hữu, contracts, cách chạy/đọc log.
3. `docs/WORKFLOW.md` — vòng đời task, ai làm bước nào, khi nào hỏi người.
4. Dự án tiếp quản giữa chừng: `docs/STATUS.md` — hiện trạng, việc dở, vùng không đụng, nợ cũ.
5. Task đang làm: `docs/tasks/<ID>-*.md`.
6. Quyết định cũ: `docs/decisions/` (ADR). Tính năng đã làm: `docs/features/`.

## Vai trò
- **Phiên chính = orchestrator.** Chạy `/build`. Không tự viết code feature (trừ T-000 và sửa nhỏ khi merge). Chỉ orchestrator sửa `status` trong task và `docs/FRICTION_LOG.md`.
- **Subagents** (`.claude/agents/`): `backend-dev`, `frontend-dev`, `qa-tester`, `reviewer`. Mỗi subagent làm trong git worktree riêng `.worktrees/<ID>/`, chỉ sửa file trong `paths` của task.

## Luật vàng
1. **Xong = `python scripts/verify.py` xanh** + đạt tiêu chí chấp nhận + docs của tính năng đã cập nhật. Không báo xong khi chưa chạy verify.
2. **Contracts trước.** FE và BE import type/schema từ `src/contracts/`. Không tự định nghĩa lại kiểu dữ liệu đã có ở đó. Cần đổi contract → báo orchestrator, không tự sửa.
3. **Đừng đoán, hãy nhìn.** Giao diện: `python scripts/ui_shot.py <path>` rồi đọc ảnh. Lỗi runtime: `python scripts/logs.py`. CI: `python scripts/logs.py ci`.
4. **Bị hook chặn (HARD GATE)** → không tìm cách lách. Ghi đề xuất vào `docs/DECISIONS_PENDING.md` theo mẫu trong file, rồi làm việc khác.
5. **Vấp thì ghi.** Thử ≥3 lần mới được, mở >5 file mới tìm ra chỗ, hoặc phải đoán vì thiếu thông tin → ghi mục Friction trong báo cáo (subagent) hoặc dùng `/friction` (orchestrator).
6. Code đổi đến đâu, tài liệu đổi đến đó: tính năng mới → `docs/features/<ID>-*.md`; quyết định kiến trúc → ADR mới.
7. **Code cũ chưa có test → viết test đặc tả hành vi hiện tại trước khi sửa** (hành vi có vẻ sai thì đánh dấu `BUG:`, không tự "sửa luôn" ngoài phạm vi task).
8. Verify báo "nợ cũ" là lỗi có từ trước — không cần sửa nếu ngoài task, nhưng **không được làm tăng**.
9. Không đọc/in `.env*`. Không cài dịch vụ trả phí, không gửi dữ liệu người dùng ra ngoài khi chưa có ADR được duyệt.

## Lệnh hay dùng
| Việc | Lệnh |
|---|---|
| Kiểm tra toàn bộ | `python scripts/verify.py` |
| Trạng thái task / task sẵn sàng | `python scripts/tasks.py list` · `python scripts/tasks.py ready` |
| Mở / đóng worktree cho task | `python scripts/task.py start T-003` · `python scripts/task.py finish T-003` |
| Chạy app (nền) | `python scripts/run.py start` · `python scripts/run.py status` · `python scripts/run.py stop` |
| Đọc log | `python scripts/logs.py dev` · `docker` · `supabase` · `ci` |
| Chụp màn hình | `python scripts/ui_shot.py /login login --mobile` |
| Báo người | `python scripts/notify.py "nội dung"` |

## Stack
Xem `docs/decisions/0001-stack.md`.
