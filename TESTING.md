# MEVO — Mục lục checklist test

> Mỗi Sprint có file test riêng trong `docs/testing/<tên-đợt>/`; ở đây chỉ có link + trạng thái.
> Checklist của các Sprint đã PASS và đã khép (Sprint 0–5, SA, PM, BL-0..4, UI, POS, ST, MA, PA, A04…)
> đã xoá khỏi cây thư mục ngày 2026-11-11 — xem lại bằng `git log --diff-filter=D -- docs/testing TESTING.md`.

## Chờ test

- ⏳ [Dọn codebase sau audit](docs/testing/audit-cleanup/AUDIT-1.md) — chờ test (2026-11-11); mig 130 đã áp prod 2026-11-11
- ⏳ [Thay đổi theo 14 câu trả lời: chỉ thu ở POS, realtime, /mevo, Mini App](docs/testing/audit-cleanup/AUDIT-2.md) — chờ test (2026-11-11), chưa merge main
- ⏳ [Test đua nhiều kết nối cho RPC tiền](docs/testing/audit-cleanup/RACE.md) — chạy dở (Docker bị tắt giữa chừng): mới xong phần thu bill, tìm ra 2 lỗi thật CHƯA vá
- ⏳ [In bếp do máy chủ tự xếp](docs/testing/audit-cleanup/IN-BEP-SERVER.md) — chờ test (2026-11-11); mig 131 đã áp prod 2026-11-11
- [Đợt 1 C-0 — Máy in thật](docs/testing/dot1/C-0-may-in-that.md) — anh Tú báo in được (Canon 2900 + 2 trạm PDF, 2026-11-11); chưa điền số đo, chưa thử máy nhiệt 80mm
- ⏳ [Đợt 1 C Part 2 — gọi in / in ghép](docs/testing/dot1/C-part2-goi-in.md), [in ghép](docs/testing/dot1/C-part2-in-ghep.md)
- ⏳ [Đợt 1 — VietQR nền](docs/testing/dot1/vietqr-nen.md), [VietQR ghép](docs/testing/dot1/vietqr-ghep.md)
- ⏳ [Đợt 1 — Thu tiền kết hợp](docs/testing/dot1/thu-tien-ket-hop.md)
- ⏳ [Đợt 1 C Part 1 — In hai nơi](docs/testing/dot1/C-part1-in-hai-noi.md)

## Vừa xong (giữ tới khi Yên Garden go-live)

- ✅ [Yên Garden — Báo cáo](docs/testing/yen-garden/BAO-CAO.md) · [Sổ thu chi + ca](docs/testing/yen-garden/THU-CHI.md) · [Công nợ](docs/testing/yen-garden/CONG-NO.md) — 0 FAIL (2026-11-10)
- [Yên Garden — Kho](docs/testing/yen-garden/KHO.md) · [Vai Quản lý](docs/testing/yen-garden/QUAN-LY.md) · [Cấu hình + in tự động](docs/testing/yen-garden/CFG.md)
- ✅ [Giảm giá theo món / danh mục](docs/testing/menu-discount/MD-1.md) — PASS 2026-11-10
- ✅ [Chuyển bàn](docs/testing/chuyen-ban-giam-gia/CB-1.md) · [Chuyển cả mâm](docs/testing/chuyen-ban-giam-gia/CB-2.md) · [Giảm giá hoá đơn](docs/testing/chuyen-ban-giam-gia/GG-1.md)
- ✅ [Đợt 1 B1 — Ngày kinh doanh](docs/testing/dot1/B1-ngay-kinh-doanh.md)
