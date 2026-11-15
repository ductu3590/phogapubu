---
name: harness-review
description: Soát định kỳ friction log và log cổng cứng để sửa macro (workflow, agent, skill, gate). Dùng khi anh Tú nói /harness-review, hằng tuần, hoặc khi /build gợi ý vì một tag friction lặp ≥2 lần.
---

# /harness-review — vòng xoắn micro ↔ macro

Một lần vấp là một con ốc. Hai, ba lần cùng kiểu = harness thiếu bước hoặc thiếu luật.

## 1. Thu thập
```bash
python scripts/tasks.py friction-stats          # đếm theo tag, liệt kê mục chưa có "Thực tế"
tail -n 100 .harness/gate-events.log             # cổng nào bị chạm, bao nhiêu lần
ls .harness/reports/                              # báo cáo gần đây
```
Đọc thêm `docs/HARNESS_CHANGES.md` (lần review trước đã đổi gì).

## 2. Phân loại
| Tín hiệu | Kết luận | Hướng sửa macro |
|---|---|---|
| Tag lặp ≥2 lần | Thiếu bước/luật | Thêm bước vào `WORKFLOW.md` hoặc agent `.claude/agents/*.md`, hoặc skill mới |
| Dự đoán sai ở dòng "Thực tế" | Cách sửa micro không tác dụng | Đổi cách sửa (script thay cho tài liệu, gate thay cho lời nhắc) |
| Luật trong CLAUDE.md bị vi phạm ≥2 lần | Lời nhắc không đủ | Nâng thành cổng máy trong `.harness/gates.json` |
| Gate bị chạm nhiều nhưng lần nào anh cũng duyệt | Gate quá chặt → thành thủ tục | Nới gate hoặc chuyển thành quy tắc mặc định |
| CLAUDE.md > 80 dòng, luật chồng luật | Nặng micro | Gộp, xoá luật không còn ai vi phạm |
| Agent làm đủ bước mà vẫn sai | Nặng macro | Bỏ bước thừa, kiểm bằng `verify.sh` thay vì checklist |

## 3. Đề xuất (KHÔNG tự sửa file được bảo vệ)
Ghi `.harness/proposals/<YYYY-MM-DD>.md`:
```
# Đề xuất sửa harness <ngày>
## Thay đổi 1: <tên>
- Bằng chứng: F-003, F-007, F-011 (tag tim-file)
- Sửa: <file> — <diff hoặc nội dung chính xác>
- Kỳ vọng: <đo thế nào ở lần review sau>
## Thay đổi 2: ...
## Bỏ đi (luật/bước không còn tác dụng)
```
Các thay đổi ở file **không** bảo vệ (docs/, scripts/ trừ verify.py/approve.py/baseline.py) → làm luôn, commit.

`python scripts/notify.py "🔧 mevo: có đề xuất sửa harness — .harness/proposals/<ngày>.md. Duyệt: python scripts/approve.py harness 1"`

## 4. Áp dụng (sau khi anh chạy `python scripts/approve.py harness <giờ>` và nói "áp dụng")
1. Sửa đúng như đề xuất.
2. Ghi `docs/HARNESS_CHANGES.md`: ngày, thay đổi, bằng chứng, kỳ vọng.
3. Nếu thay đổi có giá trị cho **mọi dự án** (ví dụ agent mới, gate mới) → ghi thêm dòng "Đưa về harness-kit" để anh cập nhật template gốc `~/.harness-kit/template/`.
4. Commit: `chore(harness): <tóm tắt>`.
