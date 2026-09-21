---
description: Chạy trọn dây chuyền bốn agent (planner - coder - tester - reviewer) cho một yêu cầu tính năng MEVO.
---

Chạy trọn dây chuyền làm tính năng cho: **$ARGUMENTS**

Bạn là **nhạc trưởng**. Bạn không tự viết code, không tự viết test, không tự đánh giá — bạn giao việc cho bốn subagent theo đúng thứ tự và xử lý những lúc dây chuyền khựng lại.

Nguyên tắc xuyên suốt: **gặp chỗ cần quyết định thì dùng công cụ `AskUserQuestion` hỏi anh Tú, nhận câu trả lời rồi chạy tiếp** — không tự đoán, và cũng không bỏ dở giữa chừng chỉ vì có một câu hỏi.

Làm lần lượt, không nhảy cóc. Sau mỗi chặng, kiểm tra file bàn giao đã tồn tại thật rồi mới sang chặng kế tiếp.

---

## Chặng 0 — Dọn chỗ

1. Chạy `git status` xem đang đứng trên nhánh nào.
   - Nếu đang ở **`main` hoặc `master`**: dùng `AskUserQuestion` hỏi anh Tú muốn (a) tạo nhánh mới `feat/<slug-của-tính-năng>` rồi chạy tiếp, (b) tự đặt tên nhánh khác, hay (c) dừng lại. Theo lựa chọn mà làm, rồi mới đi tiếp.
   - Nếu cây làm việc đang bẩn (có thay đổi chưa commit không liên quan): báo cho anh Tú biết và hỏi có chạy tiếp không.
2. Dọn `.bangiao/`: xoá `ke-hoach.md`, `thay-doi.md`, `ket-qua-test.md`, `danh-gia.md`, `tra-loi.md` của lần chạy trước để không ai đọc nhầm file cũ. Nếu `danh-gia.md` cũ còn nội dung đáng giữ, chép sang `.bangiao/luu/` trước khi xoá.

## Chặng 1 — Planner

Giao việc cho **subagent `planner`** kèm nguyên văn yêu cầu ở trên. Chờ tới khi có `.bangiao/ke-hoach.md`.

## Chặng 2 — Cửa hỏi thứ nhất: câu hỏi còn bỏ ngỏ

Mở `.bangiao/ke-hoach.md`:

- **Không có mục CÂU HỎI CÒN BỎ NGỎ** → sang Chặng 3.
- **Có** → dùng `AskUserQuestion` đưa các câu hỏi đó cho anh Tú (tối đa 4 câu mỗi lần gọi; nhiều hơn thì gọi nhiều lần, ưu tiên câu chặn đường trước). Mỗi câu kèm các phương án Planner đã đề xuất, đặt phương án khuyến nghị lên đầu và ghi rõ "(Khuyến nghị)".
  Nhận câu trả lời xong:
  1. Ghi nguyên văn hỏi–đáp vào `.bangiao/tra-loi.md`.
  2. Giao lại cho **subagent `planner`**, bảo nó đọc `.bangiao/tra-loi.md` và cập nhật `.bangiao/ke-hoach.md`, xoá mục câu hỏi đã được trả lời.
  3. Quay lại đầu Chặng 2. Tối đa **2 vòng**; sang vòng thứ 3 vẫn còn câu hỏi thì dừng hẳn và báo anh Tú — lúc đó vấn đề nằm ở chỗ yêu cầu chưa đủ rõ để làm tự động.

Nếu Planner kết luận đây thật ra là việc **tầng 3** (chỉ cần đổi dữ liệu qua `/mevo` hoặc `/admin`, không cần code), dừng dây chuyền và nói thẳng điều đó cho anh Tú.

## Chặng 3 — Coder

Giao việc cho **subagent `coder`**. Chờ tới khi có `.bangiao/thay-doi.md`.

Nếu Coder dừng lại vì phát hiện thêm chỗ mơ hồ: dùng `AskUserQuestion` hỏi, ghi vào `.bangiao/tra-loi.md`, rồi giao lại cho `coder` chạy tiếp. Tối đa 2 vòng.

## Chặng 4 — Tester

Giao việc cho **subagent `tester`**. Chờ tới khi có `.bangiao/ket-qua-test.md`.

Đọc file đó. **Có ca rớt** → dùng `AskUserQuestion` cho anh Tú xem phần rớt (tóm tắt ngắn trong câu hỏi, chi tiết in ra ngoài chat) và hỏi muốn:
- **Cho Coder sửa rồi test lại** (khuyến nghị nếu lỗi rõ ràng là lỗi cài đặt) → giao lại `coder` kèm nguyên văn phần rớt, xong thì chạy lại `tester`. Tối đa **2 vòng**.
- **Chạy tiếp tới Reviewer** để Reviewer phán trên tình trạng đang đỏ.
- **Dừng lại** để anh Tú tự xem.

## Chặng 5 — Reviewer

Giao việc cho **subagent `reviewer`**. In `.bangiao/danh-gia.md` ra cho anh Tú xem.

Xử theo phán quyết:
- **CHOT** → sang Chặng 6.
- **CAN SUA** → dùng `AskUserQuestion` hỏi: (a) cho Coder sửa theo đúng danh sách góp ý rồi chạy lại Tester và Reviewer, hay (b) dừng để anh Tú tự sửa. Chọn (a) thì làm, tối đa **1 vòng** — sau vòng đó dù còn CAN SUA cũng dừng và báo.
- **CHAN** → dừng ngay, không hỏi gì thêm. In rõ lý do và gốc rễ.

## Chặng 6 — Bàn giao cho anh Tú

Đây là quy tắc **bắt buộc** của dự án (xem đầu `CLAUDE.md` và `TESTING.md`), không được bỏ:

1. **Dừng lại. KHÔNG tự động chuyển sang task tiếp theo.**
2. Báo cáo gọn trong chat: phán quyết cuối, những file đã đổi, **migration nào đã áp lên prod**, và những việc chỉ anh Tú làm được (chạy `zmp deploy`, đổi env trên Vercel, in lại QR bàn...).
3. Chỉ đúng file checklist test tay mà Tester vừa tạo trong `docs/testing/`, rồi nói: *"Xong rồi anh, test theo `docs/testing/.../<tên file>.md` nhé."*
4. Chờ anh Tú xác nhận **PASS** trước khi làm bất cứ việc gì tiếp theo.

## Tuyệt đối không làm

Không `git commit`, không `git push`, không `git merge`, không tạo pull request, không `zmp deploy`. Dây chuyền làm việc, anh Tú ra quyết định — ranh giới đó không xoá.

Và đừng sửa file này để nó tự gộp nhánh cho nhanh. Nghe thì tiện, nhưng lúc đó cửa chốt cuối cùng là con người đã mất.
