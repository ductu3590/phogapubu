---
name: feature
description: Thêm một tính năng mới vào dự án đã có harness — đối chiếu phạm vi, chốt yêu cầu với tối đa 3 câu hỏi, đổi contract nếu cần, chia thành task song song được, cập nhật PROJECT/STATUS, rồi chạy /build. Dùng khi anh Tú nói /feature <mô tả>, "thêm tính năng", "làm thêm chức năng".
---

# /feature — thêm tính năng mới

Mục tiêu: tính năng mới đi vào đúng khuôn (contract trước, task không đè nhau, test đặc tả cho code cũ) mà anh chỉ phải trả lời vài câu.

## 1. Đọc (không hỏi)
`docs/PROJECT.md` (đặc biệt **Không làm**, **Quyết định dành cho người**), `docs/ARCHITECTURE.md`, `docs/STATUS.md` (nếu có), `src/contracts/`, `python scripts/tasks.py list`, và phần code liên quan đến tính năng (route, module, bảng DB).

## 2. Đối chiếu phạm vi
- Tính năng nằm trong mục **Không làm** → nói rõ, hỏi anh có đổi phạm vi không (quyết định của người). Không tự làm.
- Đụng vùng `legacy` / `payments` / `auth` trong `.harness/gates.json` → ghi chú: task đó sẽ cần anh duyệt cổng khi chạy.

## 3. Hỏi một lượt, tối đa 3 câu
Chỉ những gì code và tài liệu không trả lời được, ưu tiên: ai dùng / luồng chính; quy tắc nghiệp vụ mấu chốt (tiền, quyền, trạng thái); điểm cắt "bản đầu" của tính năng. Mỗi câu có phương án khuyến nghị (AskUserQuestion).

## 4. Thiết kế ngắn
- **Contract**: cần schema/type mới hoặc đổi schema cũ? → tạo task `agent: orchestrator` làm trước (đổi `src/contracts/` + ADR `docs/decisions/NNNN-<tên>.md`), các task khác `depends_on` nó.
- **Dữ liệu**: bảng/cột mới → migration MỚI (không sửa migration cũ), có RLS.
- **Code cũ chưa có test** mà tính năng phải sửa vào → tiêu chí đầu tiên của task đó: test đặc tả hành vi hiện tại.

## 5. Tạo task (dùng quy ước của `/new-task`)
- ID kế tiếp: `python scripts/tasks.py next-id`.
- Thường: 1 task contract (nếu cần) → 1–3 task backend/frontend chạy song song (`paths` không chồng nhau, không chứa `src/contracts/**`) → 1 task QA `depends_on` tất cả.
- Mỗi task ≤ nửa ngày agent-work, tiêu chí chấp nhận kiểm được bằng test/lệnh/ảnh chụp.
- `python scripts/tasks.py lint` phải sạch.

## 6. Cập nhật tài liệu
- `docs/PROJECT.md`: thêm tính năng vào Phạm vi; quy tắc nghiệp vụ mới (nếu có).
- `docs/STATUS.md` (nếu có): thêm dòng tính năng, trạng thái ❌ chưa làm.

## 7. Duyệt một lần rồi chạy
Tóm tắt ≤15 dòng: tính năng, các task (ID – tên – agent – phụ thuộc), cổng sẽ phải duyệt, giả định đã tự đặt. Hỏi "Duyệt để build?".
Duyệt → commit chỉ `docs/` (`git add docs && git commit -m "docs(feature): <tên>"`) → chuyển sang làm theo `/build` (`.claude/skills/build/SKILL.md`) — orchestrator sẽ chỉ lấy các task `todo` mới.
