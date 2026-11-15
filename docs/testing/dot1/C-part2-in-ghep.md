# Test in hai nơi ghép đủ (Đợt 1, mục C Part 2, Task 13)

> **Agent 2026-11-15 (T-002):** vitest admin-web 178 file / 1627 test xanh, print-agent 8 file / 103 test xanh, `node --test supabase/tests/*.test.mjs` 588/589 (1 đỏ = nợ cũ 048 trên Windows). "Agent ✓" = đã kiểm đủ bằng máy; bài có chữ 👤 vẫn cần anh Tú (phần Agent ✓ đi kèm chỉ là logic đã có test, không thay cho nhìn bằng mắt / thiết bị thật). Gom thứ tự chạy ở [../TRUOC-GO-LIVE.md](../TRUOC-GO-LIVE.md).

Cần hai máy in thật đúng model (Quầy + Bếp) và phần mềm in ở chế độ `agent`. Cổng `C-0-may-in-that.md` chưa có KẾT QUẢ PASS: làm bước C-0 trước hoặc song song, các bài dưới là bài ghép.

1. Đơn món hai trạm: **Duyệt & in bếp** ra 2 phiếu bếp đúng trạm, không giá, và 1 phiếu bàn ở Quầy.
   - **Kết quả:** 👤 anh Tú (2 máy in thật). Agent ✓ logic: `print-plan.test.ts` "món hai trạm: 2 phiếu bếp + 1 phiếu bàn ở Quầy" (15/11).
2. Đơn món một trạm ra một phiếu bếp. Danh mục chưa gán ra trạm mặc định.
   - **Kết quả:** 👤 anh Tú. Agent ✓ logic: `print-plan.test.ts` "món một trạm…", "stationId null ra trạm mặc định" (15/11).
3. Bấm đúp **Duyệt & in bếp** không in trùng. Nút **In lại** ở lượt in thêm đúng một bộ.
   - **Kết quả:** 👤 anh Tú. Agent ✓ logic: SQL `114_*` "dedupe: INSERT trùng… không tạo dòng thứ hai"; `print-plan.test.ts` reprintToken (15/11).
4. Đặt món trước ra đúng trạm theo món trong snapshot.
   - **Kết quả:** 👤 anh Tú. Agent ✓ logic: `print-jobs.test.ts` "preorder_job: nguồn preorder…" (15/11).
5. Ra Quầy: **In tạm tính** (có QR nếu quán khai tài khoản và bill chưa còn đơn chờ duyệt), gộp bill, in lại ở A04 (không có QR), phiếu cuối ngày (quán bắt đầu ngày 05:00 có dòng khoảng giờ), **phiếu bàn giao ca** (chỉ ca đã kết; ca đang mở bấm in báo "Ca chưa kết, chưa có phiếu bàn giao" và không ra giấy). `/staff/tables` in bill được; tờ QR bàn vẫn mở trình duyệt.
   - **Kết quả:** 👤 anh Tú (Quầy: tạm tính/QR, gộp bill, A04, phiếu cuối ngày, bàn giao ca, /staff/tables, QR bàn). Agent ✓ logic: `print-jobs.test.ts` "ca đã đóng: xếp một phiếu ở trạm Quầy", "ca … chưa đóng … từ chối"; `print-call-sites.test.ts` (15/11).
6. Tắt phần mềm 40 giây: POS hiện băng đỏ. Bật lại: băng tắt, phiếu trong hàng đợi tự in.
   - **Kết quả:** 👤 anh Tú. Agent ✓ logic: SQL 114 "poll: một job chỉ giao một lần", `agent_online` 29/31 giây (15/11).
7. Rút dây máy in bếp, duyệt đơn: POS hiện job lỗi trong khoảng 1 phút, không có phiếu in muộn khi cắm lại. Bấm **In lại**: phiếu ra đúng một lần.
   - **Kết quả:** 👤 anh Tú (rút dây máy in). Agent ✓ logic: SQL 114 "printing quá 2 phút: failed Không rõ đã in chưa, KHÔNG về queued"; "retry_print_job: job mới queued" (15/11).
8. **In bằng trình duyệt** với job lỗi: in được, job biến khỏi POS.
   - **Kết quả:** 👤 anh Tú. Agent ✓ logic: `print-jobs.test.ts` "markPrintedInBrowser gọi dismiss_print_job"; SQL 114 "dismiss_print_job: ẩn khỏi problem_jobs" (15/11).
9. Để job chờ quá 30 phút (tắt phần mềm): `expired`, bật lại không tự in, POS có nút In lại.
   - **Kết quả:** Agent ✓ SQL 114 "job chờ quá 30 phút: expired, không giao cho phần mềm" (15/11). 👤 tuỳ chọn.
10. Quán `browser`: mọi thao tác in như hôm nay (kể cả phiếu bàn giao ca), không có băng.
   - **Kết quả:** 👤 anh Tú. Agent ✓ logic: `print-document.test.ts` browser + shift_report in trình duyệt như cũ; banner "browser: không vẽ gì" (15/11).
11. Phiếu bàn giao ca qua phần mềm in: so với bản in trình duyệt cùng ca, mọi con số giống hệt và không có nút In lại / dòng no-print. (Công nợ trong ca chưa có trên đường này: sẽ nối khi module công nợ vào nhánh chung, loader `loadShiftReportSlip` là chỗ duy nhất thêm.)
   - **Kết quả:** 👤 anh Tú (so tờ in hai đường cùng ca). Agent ✓ logic: `lib/print/load-shift-report.test.ts`, `app/print/shift-report/shift-report-slip.test.tsx` (15/11).
