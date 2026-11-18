# mevo

> Nguồn chính về sản phẩm + kiến trúc: [CLAUDE.md](../CLAUDE.md). File này chỉ chốt **phạm vi giai đoạn tới** cho harness.

## Một câu
Nền tảng gọi món + quản lý quán: khách quét QR tại bàn bằng **Zalo Mini App**, quán vận hành trên **admin web**
(POS thu ngân, màn nhân viên, cấu hình, kho, sổ thu chi, công nợ, báo cáo), backend Supabase dùng chung theo `store_id`.

## Cho ai
- **Khách tại bàn:** mở Zalo → quét QR → gọi món / gọi thêm / gọi nhân viên, không cài app.
- **Thu ngân / chủ quán:** duyệt đơn, in phiếu, thu tiền cả bàn, kết ca, xem báo cáo trên POS máy tính.
- **Quản lý quán:** kho, sổ thu chi, công nợ, báo cáo (vai `store_manager`).
- **Nhân viên chạy bàn:** điện thoại riêng, `/staff` (gọi hộ, thêm bàn vào mâm).
- **MEVO (anh Tú):** tạo quán, tài khoản, onboard Mini App từng quán qua `/mevo`.

## Vấn đề hiện tại
Quán bia/lẩu bình dân ghi order tay, tính tiền tay, không có số liệu kho/thu chi. Yên Garden chọn MEVO thay KiotViet
và cần đủ phần "sau quầy" (kho, ca, thu chi, công nợ, báo cáo) trước ngày mở.

## Phạm vi giai đoạn tới — Go-live Yên Garden 2026-12-01
1. Mini App Yên Garden (theme `garden`) qua test và lên `main` (T-001), rồi `zmp deploy` từ `mini-app-instances/yen-garden`.
2. Các checklist test tay còn chờ đều PASS: đóng/mở lại bàn, dọn audit, thu kết hợp, VietQR, in Part 1/2 (T-002).
3. Dọn dữ liệu mẫu, nhập dữ liệu thật của quán (menu ~15/11, sơ đồ >40 bàn / 3 khu, tài khoản) (T-004).
4. In thật: 4 máy (Quầy, Bếp, Nướng, Bar) — thử khi lắp máy 24–25/11, chạy thử 27–30/11.
5. Bảo Lương giữ ổn định (quán test của anh Tú; Mini App BL đã tắt, không deploy).
6. `verify` xanh hoặc chỉ còn nợ cũ đã chụp baseline (T-003).
7. Xử lý mất mạng tạm thời theo `docs/superpowers/specs/2026-11-18-xu-ly-mat-mang-tam-thoi-design.md` (anh Tú duyệt 2026-11-18): Đợt 1 trước 01/12; Đợt 2 (Quầy dự phòng trong MEVO In) chỉ lên nếu thử đạt với 4 máy in ngày 24–25/11; Đợt 3 (tiền mặt lúc mất mạng) sau go-live.

## Không làm
- Không thêm tính năng ngoài danh sách trên trước 01/12. Ý tưởng đã hoãn (chỉ làm khi gặp thật): đóng bill muộn,
  số hoá đơn thật HD-xxxxxx (plan sẵn `docs/superpowers/plans/2026-10-12-a04-1-bill-numbers.md`),
  geocoding phạm vi ship.
- Không làm ERP kiểu KiotViet; không đa ngôn ngữ, không app native, không offline-first.
- Không SePay / đối soát tự động chuyển khoản (đã bỏ — Zalo Checkout BANK không chèn được mã đơn).
- Không deploy Mini App Bảo Lương; không kiểm Mini App trên Pubu (nhưng code lõi phải giữ đúng cả trả trước lẫn trả sau).
- Không sửa tay `mini-app-instances/**`.

## Quy tắc nghiệp vụ
Xem [CLAUDE.md §6](../CLAUDE.md) — tiền do server tính, bàn trả sau thu cả bàn một lần chỉ ở POS, không chắc đã trả
thì rơi về "chờ xác nhận", `parseVnd`/`parseQty`, công thức TS ↔ SQL khớp tay.

## Quyết định dành cho người
<!-- Agent KHÔNG tự quyết các mục này — ghi vào DECISIONS_PENDING.md. -->
- Sửa **luồng thanh toán** hoặc bất cứ thứ gì trong `mini-app-instances/**` (vùng không đụng).
- `zmp deploy` (anh Tú tự chạy, chọn Development hay Testing — Zalo giới hạn số lần/tháng).
- Push `main` / deploy production Vercel.
- Đổi luồng đăng nhập, phân quyền, RLS.
- Xoá dữ liệu prod (kể cả dữ liệu mẫu Yên Garden — hỏi trước khi xoá).
- **Được phép tự làm (anh Tú đã duyệt 2026-11-13):** áp migration lên prod qua Supabase MCP — áp NGUYÊN VĂN file,
  kiểm neo bằng `pg_get_functiondef` trước; không sửa file migration đã commit (tạo migration mới).
- **Quy tắc test của CLAUDE.md vẫn hiệu lực:** xong mỗi task có thay đổi hành vi → viết checklist ở `docs/testing/<đợt>/`,
  dừng lại chờ anh Tú báo PASS trước khi giao task phụ thuộc.

## Tiêu chí thành công
- 01/12/2026 Yên Garden mở bán bằng MEVO: khách gọi món qua Mini App, thu ngân duyệt + in đúng máy, thu tiền, kết ca.
- Cuối ngày đầu: báo cáo doanh thu / thu chi / tồn kho khớp sổ tay của quán.
- Không có lỗi tiền (thu thiếu/thừa, doanh thu sai) trong tuần đầu.
