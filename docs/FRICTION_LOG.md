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

### F-001 · 2026-11-13 · T-000 · tag: moi-truong
- Vấp: `new_project.py --adopt` chạy `adopt_scan.py --apply` crash `UnicodeDecodeError` (Windows đọc `gates.json` bằng cp1252) → config/gates không được điền, verify "xanh" mà không chạy gì
- Sửa: chạy lại `PYTHONUTF8=1 python scripts/adopt_scan.py --apply`; thêm `scripts/verify.d/*.sh` vì repo không có `package.json` gốc. Gốc rễ ở harness-kit: `open()` thiếu `encoding="utf-8"`
- Dự đoán: dự án Windows tiếp theo không vấp nếu kit được vá
- Thực tế: (điền khi gặp lại)

### F-002 · 2026-11-13 · T-000 · tag: gate
- Vấp: hook `harness_guard.py` chặn `sed -n` (chỉ đọc) trên `scripts/verify.py`, và chặn lệnh Bash có heredoc ghi vào `docs/` chỉ vì NỘI DUNG heredoc nhắc tới đường dẫn được bảo vệ
- Sửa: đọc bằng Read, ghi docs bằng Write/Edit (cổng kiểm theo file đích) — không lách
- Dự đoán: guard nên coi `sed -n`/`cat` là đọc, và chỉ xét đường dẫn đích của redirect, không quét chuỗi trong heredoc
- Thực tế: (điền khi gặp lại)

### F-003 · 2026-11-15 · T-000 · tag: moi-truong
- Vấp: `python scripts/ui_shot.py /login` trong Git Bash → MSYS đổi `/login` thành `C:/Program Files/Git/login`, Playwright báo "invalid URL"; lần 2 mới qua bằng `MSYS_NO_PATHCONV=1`
- Sửa: `scripts/ui_shot.py` nhận ra đường dẫn đã bị MSYS đổi (`<ổ>:/…/Git/<path>`) và khôi phục `/<path>`
- Dự đoán: agent gọi `ui_shot.py /path` từ Git Bash chụp được ngay lần đầu, không cần biến môi trường
- Thực tế: (điền khi gặp lại)

### F-004 · 2026-11-15 · T-001 · tag: moi-truong
- Vấp: verify trong `.worktrees/T-001` đỏ 3 test mà `main` xanh — worktree mới checkout `.sql` với CRLF (`core.autocrlf=true`) nên test 080/083 xoá dòng `pg_net` bằng chuỗi `'…;\n'` trượt; test `call-staff-message` nạp `services/supabase.ts` vốn ném khi thiếu `VITE_SUPABASE_*` (checkout gốc có file cấu hình cục bộ, worktree không). Subagent mất 1 vòng, orchestrator mở ~6 file mới ra gốc
- Sửa: 60bb34e — 080/083 dùng regex `;\r?\n`; test `call-staff-message` `vi.mock("@/services/supabase")`. Không đổi code nghiệp vụ
- Dự đoán: worktree task kế tiếp (T-002/T-003) verify ra cùng kết quả như main; nếu còn test nào phụ thuộc file cấu hình cục bộ thì lộ ra ở đây
- Thực tế: (điền khi gặp lại)

### F-005 · 2026-11-15 · T-001 · tag: gate
- Vấp: hook `secrets` chặn subagent 2 lần (lệnh ghi `.harness/reports/T-001.md` và lệnh sửa test) chỉ vì nội dung nhắc tên file cấu hình trong chú thích/văn bản — không lệnh nào đọc/ghi file secret. Orchestrator cũng bị chặn 1 lần khi `ls` liệt kê tên file
- Sửa: chưa sửa (không tự sửa `.claude/`) — đề xuất cho `/harness-review`: hook chỉ chặn khi đường dẫn file secret là ĐỐI SỐ của lệnh đọc/ghi (cat/type/Get-Content/Write/Edit vào file đó), không chặn khi chuỗi chỉ xuất hiện trong nội dung
- Dự đoán: còn chặn nhầm cho tới khi hook được chỉnh; mỗi lần mất 1 vòng của subagent
- Thực tế: (điền khi gặp lại)
