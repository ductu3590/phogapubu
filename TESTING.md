# MEVO — Mục lục checklist test

> Mỗi Sprint có file test riêng trong `docs/testing/<tên-đợt>/`; ở đây chỉ có link + trạng thái.
> Checklist của các Sprint đã PASS và đã khép (Sprint 0–5, SA, PM, BL-0..4, UI, POS, ST, MA, PA, A04…)
> đã xoá khỏi cây thư mục ngày 2026-11-11 — xem lại bằng `git log --diff-filter=D -- docs/testing TESTING.md`.

## Chờ test

- ⏳ [Công nợ nhà cung cấp + trả nhiều phiếu một lần (mig 143–145)](docs/testing/cong-no-ncc/CONG-NO-NCC.md) — agent ✓ DB 640/640, vitest 1771/1771, race 43/43, verify xanh, Playwright PASS A1–A5, B1–B12, B14, C1–C4; chờ anh Tú B13 (vai thu ngân); nhánh `claude/import-payables-payment-vouchers-1c9d16`
- ✅ [Báo cáo — giao diện mới (biểu đồ, % so với kỳ trước)](docs/testing/bao-cao-chuyen-nghiep/BAO-CAO-UI.md) — Test 1–7 PASS 2026-11-17 (anh Tú)
- ⏳ [POS — "+ Mở bàn" trên Timeline, rail gọn, Báo cáo thành trang (RAIL-1)](docs/testing/pos-rail/RAIL-1.md) — A–F PASS 2026-11-16 (anh Tú); nhóm G (xoá bàn đã có đơn + chọn nhiều bàn, mig 141–142 đã áp prod) agent ✓ G1–G6, chờ anh Tú G7 + xem lại; nhánh `claude/timeline-ui-buttons-43fcde`, chưa commit
- 👉 [**Trước go-live: việc còn lại của anh Tú, gom theo màn / thiết bị**](docs/testing/TRUOC-GO-LIVE.md) — T-002 2026-11-15; hạn 24/11

- ✅ [Yên Garden — DB chặn người chưa đổi mật khẩu (mig 137)](docs/testing/yen-garden/TAI-KHOAN-DB.md) — PASS 2026-11-13 (anh Tú); mig 137 đã áp prod 2026-11-13; đã merge main (chưa push / deploy)
- ✅ [Yên Garden — Tài khoản + bắt đổi mật khẩu lần đầu](docs/testing/yen-garden/TAI-KHOAN.md) — PASS 2026-11-13 (anh Tú); 5 tài khoản đã tạo prod; đã merge main cùng mig 137 (chưa push / deploy)
- ⏳ [Yên Garden — Đóng/mở lại bàn + khoá cấu hình quy trình cho chủ quán](docs/testing/yen-garden/FIX-BAN-CAU-HINH.md) — ⏳ agent ✓ 6/23 bài (B1–B3, B6, C1, C5; DB 138/139 15/15), chờ anh Tú 17 bài (A1–A11, B4–B5, B7, C2–C4); mig 138 + 139 đã áp prod
- ⏳ [Dọn codebase sau audit](docs/testing/audit-cleanup/AUDIT-1.md) — ⏳ agent ✓ A6, A9, C3 (+ A7/A8 phần "ô đã bỏ"), chờ anh Tú A1–A5, A7–A8, A10, B1–B5, C2, C3 (xoá function trên Dashboard); mig 130 đã áp prod 2026-11-11
- ✅ [Thay đổi theo 14 câu trả lời + nhân viên chỉ thêm bàn vào mâm](docs/testing/audit-cleanup/AUDIT-2.md) — PASS 2026-11-12 (anh Tú); mig 133 đã áp prod
- ✅ [Test đua nhiều kết nối cho RPC tiền](docs/testing/audit-cleanup/RACE.md) — 40/40 xanh (2026-11-12, 25 vòng) sau khi mig 132 vá 2 lỗi; chạy lại: `cd admin-web && npm run test:race`
- ✅ [In bếp do máy chủ tự xếp](docs/testing/audit-cleanup/IN-BEP-SERVER.md) — PASS 2026-11-12 (anh Tú); mig 131 đã áp prod
- ✅ [Bản cài phần mềm in (MEVO In 0.2.0)](docs/testing/dot1/C-cai-dat-phan-mem-in.md) — PASS 2026-11-12 (anh Tú)
- [Đợt 1 C-0 — Máy in thật](docs/testing/dot1/C-0-may-in-that.md) — anh Tú báo in được (Canon 2900 + 2 trạm PDF, 2026-11-11); chưa điền số đo, chưa thử máy nhiệt 80mm — ⏳ agent không làm được phần nào (đo máy thật), chờ anh Tú khi lắp 24–25/11
- ⏳ [Đợt 1 C Part 2 — gọi in](docs/testing/dot1/C-part2-goi-in.md), [in ghép](docs/testing/dot1/C-part2-in-ghep.md) — agent ✓ logic cả 31 bài, chờ anh Tú ~13 bài cần máy in / phần mềm in thật (khi lắp máy 24–25/11)
- ⏳ [Đợt 1 — VietQR nền](docs/testing/dot1/vietqr-nen.md), [VietQR ghép](docs/testing/dot1/vietqr-ghep.md) — agent ✓ nền 1/7, ghép 7/10; chờ anh Tú nền 6 bài (2–7) + ghép 3 bài (6–8, cần app ngân hàng + máy nhiệt thật)
- ⏳ [Đợt 1 — Thu tiền kết hợp](docs/testing/dot1/thu-tien-ket-hop.md) — agent ✓ bài 8, 9 bằng test đua `npm run test:race` (40/40, 15/11), bài 11, 14, 15 bằng DB 112a/112b; chờ anh Tú bài 1–7 (thu thật), bài 12 (Bỏ bàn, chưa có test cho đường đóng phiên sau mig 129), bài 13 (BẮT BUỘC, ngắt Wi-Fi), bài 10 (xem lướt) + SQL bất biến; bài 8, 9, 11 tuỳ chọn; đã sửa checklist (4 lựa chọn, bài 14 không dựng lại được)
- ⏳ [Đợt 1 C Part 1 — In hai nơi](docs/testing/dot1/C-part1-in-hai-noi.md) — agent ✓ DB mig 114 (bài 2, 5, 7, 11, 12), bài 3 lỗi thời (mig 121), chờ anh Tú 4, 6, 8, 9, 10, 1 (cần phần mềm in thật)

## Vừa xong (giữ tới khi Yên Garden go-live)

- ✅ [Mini App — đường dự phòng lọc bàn theo quán (T-007)](docs/testing/mini-app-core/BOOTSTRAP-DU-PHONG.md) — PASS 2026-11-15
- ✅ [Yên Garden — Mini App (theme garden, tải nhanh, gọi thêm bia)](docs/testing/yen-garden/MINI-APP.md) — PASS A–E 2026-11-15 (nhóm F làm khi zmp deploy)
- ✅ [Yên Garden — Báo cáo](docs/testing/yen-garden/BAO-CAO.md) · [Sổ thu chi + ca](docs/testing/yen-garden/THU-CHI.md) · [Công nợ](docs/testing/yen-garden/CONG-NO.md) — 0 FAIL (2026-11-10)
- [Yên Garden — Kho](docs/testing/yen-garden/KHO.md) · [Vai Quản lý](docs/testing/yen-garden/QUAN-LY.md) · [Cấu hình + in tự động](docs/testing/yen-garden/CFG.md)
- ✅ [Giảm giá theo món / danh mục](docs/testing/menu-discount/MD-1.md) — PASS 2026-11-10
- ✅ [Chuyển bàn](docs/testing/chuyen-ban-giam-gia/CB-1.md) · [Chuyển cả mâm](docs/testing/chuyen-ban-giam-gia/CB-2.md) · [Giảm giá hoá đơn](docs/testing/chuyen-ban-giam-gia/GG-1.md)
- ✅ [Đợt 1 B1 — Ngày kinh doanh](docs/testing/dot1/B1-ngay-kinh-doanh.md)
