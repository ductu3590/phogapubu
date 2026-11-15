---
name: adopt
description: Áp harness vào dự án ĐANG LÀM DỞ — quét code thật, dựng PROJECT/ARCHITECTURE/STATUS từ hiện trạng, biến nhánh dở và TODO thành task, khoanh nợ cũ, rồi giao cho /build. Dùng khi anh Tú nói /adopt, "áp harness cho dự án này", "tiếp quản dự án đang làm", hoặc sau khi chạy new-project --adopt.
---

# /adopt — tiếp quản dự án đang làm dở

Nguyên tắc: **mô tả cái đang có trước, rồi mới lên kế hoạch cái còn thiếu.** Không sửa code nghiệp vụ trong /adopt. Không đụng vào việc dở của anh Tú (file chưa commit, nhánh đang làm) khi chưa được đồng ý.

## 1. Quét (không hỏi gì)
```bash
python scripts/adopt_scan.py --quiet && cat .harness/adopt-report.md
python scripts/verify.py; python scripts/baseline.py show
git log --oneline -30
```
Đọc thêm: README, CLAUDE.md cũ (nếu có, phần trên `@docs/HARNESS.md`), `.cursorrules`, ROADMAP/TODO, schema DB (`supabase/migrations`, `prisma/schema.prisma`), danh sách route/trang, và `gh issue list --limit 30` nếu có remote GitHub.
Chạy app và nhìn: `python scripts/run.py start` + `python scripts/ui_shot.py` các trang chính → đây là bằng chứng cho STATUS.md.

## 2. Hỏi đúng MỘT lượt, tối đa 5 câu
Dùng AskUserQuestion, mỗi câu có phương án khuyến nghị. Chỉ hỏi những gì code không trả lời được, ưu tiên:
1. **Đích đến**: bản tiếp theo cần đạt gì (MVP còn thiếu gì / sắp giao khách ngày nào)?
2. **Việc dở chưa commit** (nếu `dirty_count > 0`): commit nguyên trạng / cất sang nhánh `wip/<tên>` để thành task / anh tự xử lý.
3. **Nhánh chưa merge** (nếu có): nhánh nào tiếp tục (thành task), nhánh nào bỏ. Nếu nhánh hiện tại ≠ nhánh chính: nhánh nào là nhánh tích hợp?
4. **Vùng không đụng**: phần nào đang chạy production/đang có khách dùng, agent không được sửa nếu chưa hỏi?
5. **Nhất định không làm** ở giai đoạn này.
Bỏ câu nào đã rõ từ code hoặc `~/.harness-kit/defaults.md`.

## 3. Viết tài liệu từ hiện trạng
Giữ nội dung cũ có giá trị (README, CLAUDE.md cũ) — dẫn link, không chép lại.
- `docs/STATUS.md` — bảng tính năng: ✅ chạy / 🟡 dở / ❌ chưa / 💥 hỏng, **mỗi dòng có bằng chứng** (file, route, ảnh chụp, test). Mục "Việc đang dở", "Vùng không đụng", "Nợ cũ".
- `docs/PROJECT.md` — một câu, cho ai, phạm vi giai đoạn tới (từ câu trả lời 1), **Không làm**, quyết định dành cho người.
- `docs/ARCHITECTURE.md` — bản đồ module theo **thư mục thật** (dùng bảng "Cấu trúc" trong báo cáo quét), contracts đang ở đâu, cách chạy/đọc log, rủi ro → cổng. Ghi rõ vùng nào chưa có test.
- `docs/decisions/0001-stack.md` — stack **thực tế** đang dùng (kể cả khi khác defaults); lệch defaults thì ghi lý do "kế thừa".
- `docs/features/` — một file ngắn cho mỗi tính năng ✅ (tên `F-<slug>.md`, không cần ID task).

## 4. Lập backlog cho phần còn lại
`docs/tasks/T-000-onboard.md` đã có sẵn — chỉnh theo dự án. Sau đó tạo task bằng `/new-task`:
- **Nhánh dở** được giữ lại → task với `paths` lấy từ `python scripts/tasks.py paths-from-branch <nhánh>`; ghi trong task: "Bắt đầu bằng `python scripts/task.py start <ID> --from <nhánh>`" và thêm dòng `from_branch: <nhánh>` vào frontmatter.
- **Tính năng 🟡 dở / 💥 hỏng** → task sửa/hoàn thiện, tiêu chí chấp nhận bắt đầu bằng "test đặc tả hành vi hiện tại".
- **Tính năng ❌ chưa làm** trong phạm vi giai đoạn tới → task mới như dự án thường.
- **Nợ cũ** (baseline) → 1–2 task "trả nợ" (`agent: backend-dev`/`frontend-dev`, paths hẹp) — để sau cùng, không chặn tính năng.
- TODO/FIXME → gom vào task của module chứa nó, không tạo task riêng cho từng TODO.
- Mọi task đụng vùng ≥3 file chưa có test: tiêu chí đầu tiên là viết test đặc tả trước khi sửa.

## 5. Cổng cho code cũ
- Ghi danh sách "Vùng không đụng" vào `docs/STATUS.md` và đưa đường dẫn glob cho anh — `gates.json` được bảo vệ nên anh thêm vào `gated_paths.legacy.globs` sau khi chạy `python scripts/approve.py harness 1` (hoặc nói "áp dụng" để agent sửa trong lúc cổng mở).
- Nếu verify đỏ và anh chưa chụp baseline: dừng ở đây, nhắc anh: `python scripts/baseline.py capture` (agent không tự chạy được).

## 6. Trình duyệt một lần
Tóm tắt ≤25 dòng: hiện trạng (✅/🟡/❌/💥 đếm được), việc dở xử lý ra sao, nợ cũ, danh sách task (ID – tên – agent – phụ thuộc – from_branch), giả định đã tự đặt. Hỏi: "Duyệt để bắt đầu /build?". Anh duyệt → `python scripts/tasks.py lint`, commit docs (`git add docs && git commit -m "docs: adopt harness — hiện trạng & backlog"` — chỉ add `docs/`, không add file của anh), rồi `python scripts/notify.py "🧭 <dự án>: đã adopt — <n> task, nợ cũ: <...>"`.

Từ đây dùng `/build` như dự án mới. Orchestrator gặp task có `from_branch` thì mở worktree bằng `python scripts/task.py start <ID> --from <from_branch>`.
