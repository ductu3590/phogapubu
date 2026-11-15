---
id: T-006
title: Sửa checklist thu tiền + trang gom trước go-live theo review đợt T-002
agent: qa-tester
status: in_progress
depends_on: []
paths:
  - docs/testing/dot1/thu-tien-ket-hop.md
  - docs/testing/dot1/C-part2-goi-in.md
  - docs/testing/TRUOC-GO-LIVE.md
  - docs/testing/dot1/README.md
  - TESTING.md
---
## Mục tiêu
Bằng chứng "Agent ✓" ở các bài thu tiền dẫn đúng test của hàm `collect_table_bill` / đóng phiên ĐANG chạy trên prod,
và trang gom `TRUOC-GO-LIVE.md` không sót bài 👤.

## Bối cảnh
Review đợt T-002/T-003/T-005 (2026-11-15), SHOULD 1/2/4:
- `thu-tien-ket-hop.md` bài 8, 9, 13 dẫn `112a_collect_table_bill.test.mjs` (thân hàm 112a) trong khi prod đã định nghĩa lại
  ở mig 122/123/129/132 → bằng chứng đúng là bộ test đua `supabase/tests/race/01-collect-table-bill.test.mjs`
  (orchestrator chạy lại `npm run test:race` 2026-11-15, kết quả ghi trong prompt giao việc).
- Bài 13 (đứt mạng rồi đổi PT) không có test khẳng định `clientRequestId` giữ nguyên → bỏ "tuỳ chọn", bắt buộc anh Tú.
- Bài 12 (Bỏ bàn không vào doanh thu) chỉ dẫn test 112b; đường đóng phiên đổi ở mig 129 → dẫn test hiện hành nếu có, không thì đưa vào lượt thu tiền của anh Tú.
- `TRUOC-GO-LIVE.md:11` nói "bài không có ở đây là agent đã kiểm đủ" nhưng sót `C-part2-goi-in.md` bài 8 và `thu-tien-ket-hop.md` bài 10.
- Con số "588/589 (1 đỏ = 048)" đã cũ sau T-003 (048 xanh).

## Tiêu chí chấp nhận
- [ ] Bài 8, 9 dẫn test đua (tên file + ngày + kết quả); bài 13 bắt buộc anh Tú; bài 12 dẫn test của hàm hiện hành hoặc chuyển 👤
- [ ] `TRUOC-GO-LIVE.md` gồm mọi bài 👤 (kể cả C-part2 bài 8, thu-tiền bài 10) — kiểm bằng grep đối chiếu
- [ ] Con số DB test cập nhật (048 xanh)
- [ ] Không bài nào đổi sang PASS khi chưa chạy thật
