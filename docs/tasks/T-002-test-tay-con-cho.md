---
id: T-002
title: Đóng các checklist test tay còn chờ trước go-live (sửa lỗi phát sinh)
agent: qa-tester
status: in_progress
depends_on: [T-000]
paths:
  - docs/testing/**
  - TESTING.md
---
## Mục tiêu
Các checklist ⏳ trong `TESTING.md` đều PASS trước 24/11 (ngày lắp máy Yên Garden). Agent chạy được phần tự động
(agent trình duyệt trên Bảo Lương, SQL kiểm), anh Tú test phần cần tay/thiết bị thật. Lỗi phát sinh → tạo task sửa
riêng bằng `/new-task` (paths hẹp đúng module), không sửa trong task này.

## Danh sách
- `docs/testing/yen-garden/FIX-BAN-CAU-HINH.md` (mig 138/139)
- `docs/testing/audit-cleanup/AUDIT-1.md` (mig 130)
- `docs/testing/dot1/thu-tien-ket-hop.md`, `vietqr-nen.md`, `vietqr-ghep.md`
- `docs/testing/dot1/C-part1-in-hai-noi.md`, `C-part2-goi-in.md`, `C-part2-in-ghep.md`
- `docs/testing/dot1/C-0-may-in-that.md` — điền số đo; máy nhiệt 80mm thử khi lắp 24–25/11

## Tiêu chí chấp nhận
- [ ] Mỗi checklist có kết quả từng bài (PASS/FAIL + ghi chú) và dòng trạng thái trong `TESTING.md` cập nhật
- [ ] Mọi FAIL đã thành task sửa riêng
- [ ] Không bài nào bị đánh PASS khi chưa chạy thật (ghi rõ bài nào do agent, bài nào anh Tú)
