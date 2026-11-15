# Test đổi mọi nơi gọi in qua printDocument (Đợt 1, mục C Part 2, Task 11)

> **Agent 2026-11-15 (T-002):** vitest admin-web 178 file / 1627 test xanh, print-agent 8 file / 103 test xanh, `node --test supabase/tests/*.test.mjs` 603/603 xanh (T-006 chạy lại 15/11 sau khi T-003 sửa 048; con số cũ 588/589). "Agent ✓" = đã kiểm đủ bằng máy; bài có chữ 👤 vẫn cần anh Tú (phần Agent ✓ đi kèm chỉ là logic đã có test, không thay cho nhìn bằng mắt / thiết bị thật). Gom thứ tự chạy ở [../TRUOC-GO-LIVE.md](../TRUOC-GO-LIVE.md).

Cần máy in thật và phần mềm in ở quầy: thử ở CẢ HAI chế độ (`browser` và `agent`) trên Bảo Lương. Dựng đơn bằng Khách lẻ / đơn khách gọi, dọn bằng Bỏ bàn.

1. Chế độ `browser`: bấm **Duyệt và in bếp** một đơn mới: ra đúng một phiếu bếp + một phiếu bàn (như trước).
   - **Kết quả:** 👤 anh Tú (máy in thật, chế độ `browser`). Agent ✓ logic: `lib/print/print-document.test.ts` "browser: gọi printInPlace đúng URL, không gọi enqueuePrint" (15/11).
2. Chế độ `agent`: bấm **Duyệt và in bếp**: phần mềm in ra một phiếu bếp + một phiếu bàn, KHÔNG có phiếu bếp thứ hai (khoá chống trùng khớp với đường tự in).
   - **Kết quả:** 👤 anh Tú (phần mềm in thật). Agent ✓ logic: `print-plan.test.ts` "món một trạm: 1 phiếu bếp + 1 phiếu bàn", `print-jobs.test.ts` "insert một lần với ignoreDuplicates"; SQL `131_*` khoá chống trùng (15/11). Bằng chứng gián tiếp: `IN-BEP-SERVER.md` PASS 2026-11-12 (anh Tú), anh quyết có tính không.
3. Chế độ `agent`, đơn đã duyệt rồi bấm duyệt lại ở máy khác: hiện "Đơn này đã được xác nhận trước đó.", không in thêm.
   - **Kết quả:** Agent ✓ `print-actions.test.ts` "confirm already: vẫn gọi printDocument, không có reprint" (15/11). 👤 tuỳ chọn (hai máy).
4. Nút **In lại** ở lượt: in lại đủ phiếu (chế độ `agent` có chữ IN LẠI).
   - **Kết quả:** 👤 anh Tú. Agent ✓ logic: `print-jobs.test.ts` "reprint: khoá có hậu tố riêng mỗi lần"; `print-plan.test.ts` "reprintToken đổi khoá" (15/11).
5. In tạm tính ở POS, `/staff/tables`, ngăn kéo A04 (In lại hoá đơn), nút in lại ở dòng bảng A04, **In báo cáo cuối ngày**: ra tờ in ở cả hai chế độ.
   - **Kết quả:** 👤 anh Tú (5 nơi in x 2 chế độ). Agent ✓ logic: `print-call-sites.test.ts` chỉ `print-document.ts` được gọi printInPlace; `print-document.test.ts` hai chế độ (15/11).
6. Chế độ `agent`, tắt phần mềm in rồi bấm in: báo lỗi hoặc hàng đợi giữ việc, không im lặng. Duyệt đơn lúc đó: đơn vẫn vào bếp, hiện "Đơn đã duyệt nhưng chưa tạo được phiếu in: … Bấm In lại ở lượt này."
   - **Kết quả:** 👤 anh Tú (tắt phần mềm in thật). Agent ✓ logic: `print-actions.test.ts` "confirm được, in lỗi: ok kèm printError, đơn không bị coi là thất bại"; `print-document.test.ts` "agent: enqueuePrint lỗi thì trả lỗi, không tự rơi về trình duyệt" (15/11).
7. Phiếu đặt trước (nút In ở danh sách đặt trước): in qua cùng đường, lỗi (nếu có) hiện ở thanh báo POS.
   - **Kết quả:** 👤 anh Tú. Agent ✓ logic: `print-jobs.test.ts` "preorder_job: nguồn preorder…" (15/11).

8. Chuyển một danh mục sang trạm khác SAU khi đơn đã tự in, rồi bấm **Duyệt & in bếp**: in thêm một phiếu ở trạm mới (đã biết, chấp nhận được).
   - **Kết quả:** 👤 anh Tú (hành vi đã biết/chấp nhận; xem bài 2).

Chưa làm (cổng máy thật): `docs/testing/dot1/C-0-may-in-that.md` chưa có dòng `KẾT QUẢ: PASS`, nên `pageSizeMode` trong `print-agent/agent.config.example.json` chưa đổi.

## Băng đỏ và phiếu lỗi trên POS (Task 12)

Cần phần mềm in thật ở chế độ `agent`.

9. Tắt phần mềm in, chờ khoảng 30 giây: POS hiện băng đỏ "Máy in chưa kết nối". Bật lại: băng tự gỡ trong vài giây.
   - **Kết quả:** 👤 anh Tú (tắt phần mềm in ~30 giây). Agent ✓ logic: SQL `114_*` "agent_online: last_seen 29 giây true, 31 giây false"; `print-status-banner.test.tsx` "agent offline: có Máy in chưa kết nối" (15/11).
10. Rút giấy / tắt máy in rồi in một phiếu để nó lỗi: băng hiện tên phiếu, lý do, hai nút. **In lại** tạo phiếu mới (có chữ IN LẠI), băng gỡ khi in xong.
   - **Kết quả:** 👤 anh Tú (rút giấy). Agent ✓ logic: `print-status-banner.test.tsx` "job failed: hiện label, lỗi, 2 nút"; SQL 114 "retry_print_job: job mới queued" (15/11).
11. Bấm **In bằng trình duyệt** trên phiếu lỗi: tờ in ra bằng trình duyệt, băng gỡ. Phiếu bếp lỗi in bằng trình duyệt ra cả hai liên với mọi món của đơn (đã biết, chấp nhận được).
   - **Kết quả:** 👤 anh Tú. Agent ✓ logic: `print-jobs.test.ts` "markPrintedInBrowser gọi dismiss_print_job"; banner "job test (request null): không có nút In bằng trình duyệt" (15/11).
12. Phiếu quá 30 phút chưa in (hết hạn): hiện như phiếu lỗi, In lại được.
   - **Kết quả:** Agent ✓ SQL 114 "job chờ quá 30 phút: expired" + banner "job expired: hiện như failed" (15/11). 👤 tuỳ chọn.
13. Phiếu **In thử** lỗi: chỉ có nút In lại, không có nút In bằng trình duyệt.
   - **Kết quả:** Agent ✓ `print-status-banner.test.tsx` "job test (request null): không có nút In bằng trình duyệt" (15/11).
14. Chế độ `browser`: không có băng nào. Chuyển từ `agent` về `browser` khi còn phiếu đang xếp hàng: phần mềm in cũ không in các phiếu đó nữa.
   - **Kết quả:** Agent ✓ `print-settings.test.ts` "huỷ các phiếu còn xếp hàng của đúng quán…" + "bật agent: không đụng hàng đợi"; banner "chưa đọc được trạng thái / browser: không vẽ gì" (15/11).

## Vòng sửa cuối (review toàn nhánh)

15. Bill còn một đơn khách gọi CHƯA duyệt: **In tạm tính** không có QR (cả POS lẫn `/staff/tables`). Duyệt xong rồi in lại: có QR. Đơn ghi tay / đặt trước ở trạng thái chờ không chặn QR.
   - **Kết quả:** Agent ✓ `bill-qr.test.ts` "còn đơn khách gọi chờ thu ngân duyệt: không có QR", "đơn pending ghi tay / đặt trước… vẫn có QR", "gộp bill: một mâm còn đơn chờ duyệt thì cả bill không có QR" (15/11).
16. Sự cố dài: để phần mềm in lỗi/tắt rồi in nhiều phiếu (hoặc dựng nhiều phiếu lỗi): băng chỉ hiện một dòng "N phiếu in lỗi" + 3 phiếu đầu, có **Xem tất cả** / **Thu gọn**. **Bỏ qua** một phiếu và **Bỏ qua tất cả** làm băng gỡ mà KHÔNG in gì.
   - **Kết quả:** Agent ✓ `print-status-banner.test.tsx` "50 phiếu lỗi: một dòng tóm tắt + chỉ vài phiếu đầu…"; `print-jobs.test.ts` Bỏ qua tất cả gọi dismiss, KHÔNG in (15/11).
17. Chuyển từ `agent` về `browser` khi còn phiếu lỗi/hết hạn chưa xử lý: các phiếu đó được bỏ qua, bật lại `agent` không hiện băng cũ.
   - **Kết quả:** Agent ✓ `print-settings.test.ts` "cũng đánh dấu đã xử lý các phiếu lỗi/hết hạn chưa xử lý" (15/11).
18. Hai máy POS: máy A mở sẵn POS, máy B chuyển quán về `browser`. Bấm in ở máy A (cache còn `agent`): tờ in ra bằng trình duyệt ngay lần bấm đó, không báo lỗi.
   - **Kết quả:** Agent ✓ `print-document.test.ts` "enqueuePrint báo Quán chưa bật phần mềm in: lần bấm này in luôn bằng trình duyệt, xoá cache mode" (15/11). 👤 tuỳ chọn (hai máy).
19. Hai máy POS: máy B đổi tài khoản nhận tiền ở Cài đặt; máy A mở màn Thanh toán, chọn Chuyển khoản: QR dùng tài khoản MỚI (không cần tải lại trang).
   - **Kết quả:** Agent ✓ logic: `lib/print/load-bill-qr.test.ts` (đọc tài khoản mỗi lần) (15/11). 👤 tuỳ chọn (hai máy).
20. Bấm **In lại** / **Bỏ qua** trên một phiếu: nút của phiếu đó khoá tới khi xong, băng cập nhật ngay sau đó (không chờ lượt đọc 5 giây kế).
   - **Kết quả:** 👤 anh Tú xem nút khoá / băng cập nhật ngay. Agent ✓ `print-status-banner.test.tsx` "phiếu đang chạy thao tác: nút bị khoá" (15/11).
