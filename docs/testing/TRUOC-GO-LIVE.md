# Trước go-live Yên Garden — việc còn lại của anh Tú (gom theo màn / thiết bị)

Tạo bởi T-002 ngày 2026-11-15. Hạn: xong phần 1–4 trước **24/11** (ngày lắp máy); phần 5 làm khi lắp máy nhiệt 24–25/11.

Cách dùng: đi từ trên xuống, mỗi phần là MỘT lần ngồi một màn / một thiết bị. Mở file gốc ở link, điền PASS / FAIL vào cột
Kết quả của đúng bài (phần "Agent ✓" ghi sẵn trong bài là chỗ máy đã kiểm, anh không cần làm lại). Bài FAIL thì ghi nguyên văn
lỗi, báo để tạo task sửa riêng.

Agent đã chạy ngày 2026-11-15: vitest admin-web 178 file / 1627 test xanh · print-agent 8 file / 103 test xanh ·
`node --test supabase/tests/*.test.mjs` 588/589 xanh (1 đỏ = nợ cũ `048_pos_table_areas` trên Windows, không liên quan).
Các bài KHÔNG có trong trang này là bài agent đã kiểm đủ bằng máy (xem "Agent ✓" ở file gốc), trừ các bài ghi "tuỳ chọn" ở cuối.

> Quán thật: mọi bài **thu tiền** cộng vào doanh thu và không xoá được. Làm ngoài giờ mở cửa, dùng món rẻ nhất, ghi số đã
> thu ở bảng đầu `thu-tien-ket-hop.md`.

## Phần 1 — Máy tính, đăng nhập chủ quán Yên Garden (`yg-admin@mevo.vn`, chạy local hoặc Vercel đã deploy)

Điều kiện: `yg-admin` đã đổi mật khẩu (xem mục Chuẩn bị của FIX-BAN-CAU-HINH), code T-001/138/139 đã chạy ở nơi anh test.

- [ ] [FIX-BAN A1–A4](yen-garden/FIX-BAN-CAU-HINH.md) — Bàn QR: thẻ Bàn mẫu 1, thử Xoá (báo "Đóng bàn"), Đóng bàn, xác nhận nhãn "Đã đóng"
- [ ] [FIX-BAN A5–A6](yen-garden/FIX-BAN-CAU-HINH.md) — POS không còn Bàn mẫu 1; In QR cả quán không có tờ của bàn đó
- [ ] [FIX-BAN A8](yen-garden/FIX-BAN-CAU-HINH.md) — Hoá đơn (A04): bill cũ vẫn ghi Bàn mẫu 1
- [ ] [FIX-BAN A9](yen-garden/FIX-BAN-CAU-HINH.md) — Đóng bàn A1 (đang có khách) phải bị từ chối, câu báo hiện đúng
- [ ] [FIX-BAN A10–A11](yen-garden/FIX-BAN-CAU-HINH.md) — Mở lại bàn rồi đóng lại để dọn
- [ ] [FIX-BAN B4–B5](yen-garden/FIX-BAN-CAU-HINH.md) — Cài đặt: thêm ca 16:00–23:30, Lưu, tải lại, xoá ca, Lưu
- [ ] [FIX-BAN B7](yen-garden/FIX-BAN-CAU-HINH.md) — xem lướt In ấn / Ngày kinh doanh / Bắt buộc mở ca / Tài khoản nhận tiền vẫn sửa được
- [ ] (xem lướt cùng lượt, 1 phút) [FIX-BAN B1–B3](yen-garden/FIX-BAN-CAU-HINH.md): khối Quy trình bị khoá trừ Đang nhận đơn + Giờ phục vụ (máy đã kiểm bằng test giả lập trình duyệt, chưa nhìn bằng mắt)

## Phần 2 — Máy tính, đăng nhập superadmin (`admin@mevo.vn`) + Supabase Dashboard

- [ ] [FIX-BAN C2](yen-garden/FIX-BAN-CAU-HINH.md) — `/mevo` → Yên Garden: Bước chọn giờ 15 phút → Lưu quy trình
- [ ] [FIX-BAN C3](yen-garden/FIX-BAN-CAU-HINH.md) — (đổi sang chủ quán Yên Garden) Cài đặt hiện 15 phút, chỉ xem
- [ ] [FIX-BAN C4](yen-garden/FIX-BAN-CAU-HINH.md) — về `/mevo` trả lại 30 phút
- [ ] [AUDIT-1 A7](audit-cleanup/AUDIT-1.md) — `/mevo/stores/<id Bảo Lương>`: không còn ô "OA API App ID", lưu OA Access Token / App Secret vẫn được
- [ ] [AUDIT-1 A8](audit-cleanup/AUDIT-1.md) — `/mevo/stores/new` bước 4: không còn ô OA API App ID, Bỏ qua / Lưu đi tiếp được (bước này nay có thêm ô Bộ giao diện của T-001)
- [ ] [AUDIT-1 C3](audit-cleanup/AUDIT-1.md) — Supabase Dashboard → Edge Functions: xoá `zalopay-create-order`, `zalopay-callback`, `reservation-owner-notify` nếu còn
- [ ] (không phải test) Zalo Developer Console: reset app secret đã lộ, nhập secret mới ở `/mevo/stores/<id>` — xem cuối [AUDIT-1](audit-cleanup/AUDIT-1.md)

## Phần 3 — Máy POS Bảo Lương (thu ngân / chủ quán), trình duyệt, ngoài giờ mở cửa

Thứ tự gợi ý: khai tài khoản nhận tiền TRƯỚC, rồi dựng bill, rồi thu.

- [ ] [AUDIT-1 A1–A5](audit-cleanup/AUDIT-1.md) — POS mở được; lần lượt các mục rail + ⚙ Cài đặt không trang trắng/404; đặt bàn mới từ POS; giảm giá % rồi thu; thêm món không gõ mã (mã tự sinh PREFIX-00N)
- [ ] [vietqr-nen 1–3, 6](dot1/vietqr-nen.md) — Cài đặt → Tài khoản nhận tiền: khai, lưu, báo lỗi khi thiếu, chuẩn hoá tên (làm ĐẦU TIÊN)
- [ ] [vietqr-nen 5](dot1/vietqr-nen.md) — đăng nhập thu ngân: không vào được Cài đặt chung
- [ ] [thu-tien 1](dot1/thu-tien-ket-hop.md) — Thu Tiền mặt, tiền thối đúng (thu thật)
- [ ] [thu-tien 2](dot1/thu-tien-ket-hop.md) — Thu Chuyển khoản (thu thật). Làm cùng lúc [vietqr-ghep 1 và 7](dot1/vietqr-ghep.md): có mã QR, rồi in lại bill đã thu ở A04 không có QR
- [ ] [thu-tien 3, 4](dot1/thu-tien-ket-hop.md) — Kết hợp 400k/600k (hoặc món rẻ), rồi xem A04 + ngăn kéo + Xuất Excel + phiếu cuối ngày + In lại hoá đơn
- [ ] [thu-tien 5](dot1/thu-tien-ket-hop.md) — gõ lệch hai ô: chữ đỏ, nút thu khoá (không thu tiền)
- [ ] [thu-tien 6](dot1/thu-tien-ket-hop.md) — giảm giá 10% rồi thu Kết hợp (thu thật)
- [ ] [thu-tien 7](dot1/thu-tien-ket-hop.md) — hai bàn, Gộp bill, thu Kết hợp, A04 một dòng nhãn Ghép (thu thật)
- [ ] [vietqr-ghep 8](dot1/vietqr-ghep.md) — đăng nhập thu ngân: thấy QR ở màn Thanh toán
- [ ] [vietqr-nen 7](dot1/vietqr-nen.md) — LÀM CUỐI và chỉ nếu quán chưa muốn bật: để trống ba ô, Lưu, QR biến mất
- [ ] SQL kiểm bất biến trong [thu-tien](dot1/thu-tien-ket-hop.md) (mục "SQL kiểm bất biến") + `docs/testing/chuyen-ban-giam-gia/sql/gg-verify.sql`, `gg2-verify.sql` — dán vào Supabase SQL Editor, kỳ vọng 0 dòng / "TẤT CẢ CA ĐÃ PASS" (agent không có quyền SQL prod)
- [ ] Tuỳ chọn (hai máy / ngắt Wi-Fi, agent đã kiểm logic): [thu-tien 8, 9, 13](dot1/thu-tien-ket-hop.md), [thu-tien 11](dot1/thu-tien-ket-hop.md) (mở một bill cũ ở A04)

## Phần 4 — Điện thoại

- [ ] [FIX-BAN A7](yen-garden/FIX-BAN-CAU-HINH.md) — `/staff` Yên Garden: không thấy Bàn mẫu 1 ở danh sách bàn, gọi món, Ghép bàn (làm sau khi đóng bàn ở Phần 1)
- [ ] [vietqr-nen 4](dot1/vietqr-nen.md) — quét mã Quét thử bằng 3 app ngân hàng khác nhau, chỉ xem, không chuyển tiền
- [ ] [AUDIT-1 A10](audit-cleanup/AUDIT-1.md) — tạo một đặt bàn từ Mini App hoặc POS, nhóm Zalo vận hành vẫn nhận thông báo
- Mini App (cần `zmp deploy` bản Development, nhắc chọn Development hay Testing; làm cùng nhóm F của [MINI-APP.md](yen-garden/MINI-APP.md)):
  - [ ] [AUDIT-1 B1](audit-cleanup/AUDIT-1.md) — quét QR bàn → món có lựa chọn + ghi chú → giỏ → gọi món
  - [ ] [AUDIT-1 B2](audit-cleanup/AUDIT-1.md) — giỏ: giảm số lượng về 0, món biến mất, tổng tiền đúng
  - [ ] [AUDIT-1 B3](audit-cleanup/AUDIT-1.md) — tắt mạng, mở tab Đơn gọi: hiện nhắc kiểm tra kết nối
  - [ ] [AUDIT-1 B4](audit-cleanup/AUDIT-1.md) — thoát app, mở lại trong 6 giờ: giỏ còn nguyên
  - [ ] [AUDIT-1 B5](audit-cleanup/AUDIT-1.md) — lướt 5 màn, không thiếu icon / ảnh
- [ ] [AUDIT-1 C2](audit-cleanup/AUDIT-1.md) — lặp lại A1, A3, A4, A10 và B1 sau mig 130 (nếu các bài trên chạy SAU 2026-11-11 thì đã bao gồm: ghi rõ ngày chạy)

## Phần 5 — Máy quầy có máy in + phần mềm in (MEVO In), khi lắp máy nhiệt 24–25/11

Làm trên máy quầy Windows thật; bài nào cần cả quán trả sau Bảo Lương ở chế độ "Nhiều nơi" thì dùng quán thử, KHÔNG bật "Nhiều nơi" ở quán đang bán thật.

- [ ] [C-0 máy in thật](dot1/C-0-may-in-that.md) — điền model / cổng / tên máy in, 6 tổ hợp, QR ≥ 35mm + quét được, rút dây mạng, tên việc 41 ký tự, dòng KẾT QUẢ. Chưa có số đo nào; Canon 2900 + PDF (2026-11-11) không thay được máy nhiệt 80mm
- [ ] [vietqr-ghep 6](dot1/vietqr-ghep.md) — In tạm tính: QR, đo ≥ 35mm bằng thước, quét 3 app trên tờ nhiệt thật, thêm một lần qua phần mềm in
- [ ] [C-part2-in-ghep 1–2, 5](dot1/C-part2-in-ghep.md) — 2 phiếu bếp đúng trạm + 1 phiếu bàn; một trạm; in tạm tính/gộp/A04/cuối ngày/bàn giao ca/`/staff/tables`/QR bàn
- [ ] [C-part2-in-ghep 3, 4, 6, 7, 8, 10, 11](dot1/C-part2-in-ghep.md) — bấm đúp không in trùng; đặt trước đúng trạm; tắt phần mềm 40 giây; rút dây máy in bếp; In bằng trình duyệt; chế độ `browser`; phiếu bàn giao ca so với bản trình duyệt
- [ ] [C-part2-goi-in 1, 2, 4, 5, 6, 7](dot1/C-part2-goi-in.md) — hai chế độ `browser` / `agent`: Duyệt và in bếp, In lại, các nơi in, tắt phần mềm
- [ ] [C-part2-goi-in 9, 10, 11, 20](dot1/C-part2-goi-in.md) — băng đỏ máy in chưa kết nối, phiếu lỗi (rút giấy), In bằng trình duyệt, nút khoá
- [ ] [C-part1 4, 6, 8](dot1/C-part1-in-hai-noi.md) — ghép máy bằng mã 6 số, In thử từng trạm, tắt phần mềm 40 giây rồi tự in lại. Bài này có bằng chứng gián tiếp ở [C-cai-dat-phan-mem-in](dot1/C-cai-dat-phan-mem-in.md) Test 2 (PASS 2026-11-12): anh quyết có coi là đủ không
- [ ] [C-part1 1, 9, 10](dot1/C-part1-in-hai-noi.md) — "Một nơi" như cũ; gán trạm cho danh mục ở trang Món; Gỡ máy

Tuỳ chọn (agent đã kiểm logic): C-part2-goi-in 3, 12, 18, 19; C-part2-in-ghep 9; C-part1 2, 5, 12.
