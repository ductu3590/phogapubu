# MEVO UI Reform — Plan A / B
Cập nhật 02/10/2026 · **Đang ở phần A; phần B khóa, chưa code sản phẩm.**

## Anh Tú chỉ cần đọc 3 dòng
A: dùng bản POS anh đã chọn → rà gap với core → anh yêu cầu Stitch sửa → hai bên rà.
B: sáu task code thay 17 task cũ, chỉ bắt đầu khi anh nói **“duyệt thiết kế”**.
D01/D02 đã chốt; giữ nghiệp vụ PASS, test từng task rồi chờ PASS và commit.

## Phần A — Thiết kế trước
| Bước | Kết quả | Trạng thái |
|---|---|---|
| A1 — Design system và luồng | [design.md](../../design/ui-reform-2026-10-01/design.md): UX, màu/chữ/khoảng cách, component, layout/flow POS–staff–Mini–admin trên phone/tablet/desktop | Draft đã viết; chờ rà Test A1 |
| A2 — Dựng và rà màn Stitch | Giữ bản cd573 và bộ màu nguồn; Codex viết [review gap](../../design/ui-reform-2026-10-01/REVIEW-CHOSEN-POS-2026-10-02.md), anh trực tiếp yêu cầu Stitch sửa; rà panel/luồng/viewport theo A2–A3 | Đã chọn nguồn, review chờ R1 PASS; không sinh mới |
| A3 — Chốt bản thiết kế | Lưu ID/version/viewport/ảnh-export của màn đã sửa; cập nhật design.md theo kết quả; anh nói “duyệt thiết kế” | Chưa duyệt; B khóa |

**Không code sản phẩm trong A:** không sửa typecheck, RPC, UI thật, instance; không deploy/Publish. Nguồn đang dùng đã được anh chỉ định; không chờ bản sinh mới. Wireframe ngày 01/10 là bản nháp lịch sử, không phải thiết kế đã duyệt.

D01: in lỗi vẫn thu bình thường, không nhánh/lý do không in, gửi bill ngoài hệ thống.
D02: mọi postpay staff không chọn phương thức; Pubu prepay giữ nguyên.
Không có quyết định nghiệp vụ đang chờ hỏi lại. Nếu vòng Stitch xuất hiện lựa chọn thiết kế cần anh quyết, mỗi lựa chọn chỉ trình bày **3 dòng: đề xuất / ảnh hưởng / phần cần chốt**, không gửi audit dài.

## Phần B — Code theo thiết kế đã duyệt
**Điều kiện mở:** A3 có lời duyệt và màn tham chiếu cụ thể. B1 → B2 → B3 → B4 → B5 → B6; từng task xong dừng, đọc test riêng, chờ anh PASS, commit rồi mới tiếp tục. Không chạy B1 chỉ vì design.md được PASS.

| Task gộp | Phạm vi và đầu ra | Tham chiếu code / nghiệm thu |
|---|---|---|
| **B1 — Nền dùng chung** | Sửa lỗi types đã audit; tokens/component/shell theo màn đã duyệt; workflow typed đúng từng quán, lỗi/retry giữ nháp; đo baseline đường in trước tối ưu | Mini services/layout, Admin components/lib; typecheck/build core và instance, trạng thái thật, font/safe area/contrast. [Test B1](../../testing/ui-reform/TASK-B1.md) |
| **B2 — POS Timeline hợp nhất** | Timeline/Sơ đồ mọi khu + panel việc; duyệt booking/món/call/thông báo, contact và mâm đúng; menu POS; bill/thu tiền D01; giảm chờ mở phiếu dựa số đo | admin/cashier, reservations, print/actions; test realtimes/permissions/pending/bill đổi/close mâm/retry, p50/p95 trước-sau. [Test B2](../../testing/ui-reform/TASK-B2.md) |
| **B3 — Staff đặt hộ** | Chọn bàn, section menu/option/giỏ/review, theo dõi đúng policy; D02 cho mọi postpay, Pubu prepay nguyên luồng | staff + staff-order action; postpay không selector/instrument đã thu giả; đổi bàn giữ nháp, staff không thu. [Test B3](../../testing/ui-reform/TASK-B3.md) |
| **B4 — Mini App khách** | Trang quán, menu, booking/preorder/QR/status/call theo màn duyệt; Bảo Lương không tiến độ bếp giả; draft/reconnect; đồng bộ core→instance có kiểm diff | Mini pages/components/stores/services; Zalo thật, các ngữ cảnh và hồi quy Pubu. [Test B4](../../testing/ui-reform/TASK-B4.md) |
| **B5 — Admin đồng bộ** | Menu/form, khu kéo/chạm/bàn phím Lưu-Hủy, QR, nhân viên/cấu hình; hóa đơn theo phiên/thực thu; shell /mevo cùng thiết kế | Admin/mevo + read actions; dữ liệu thiếu chỉ bổ sung tối thiểu, không tạo nghiệp vụ mới; quyền/tenant/saving/conflict. [Test B5](../../testing/ui-reform/TASK-B5.md) |
| **B6 — Nghiệm thu & bàn giao** | Kiểm toàn luồng cả hai quán, phone/tablet/desktop, đo in/realtime, ghi version/ảnh/evidence, đưa bản Testing cho anh nghiệm thu | [Test B6](../../testing/ui-reform/TASK-B6.md); Publish/Test 5B là checkpoint riêng sau Testing PASS và quyết định release |

Các path trong bảng là khu vực code, chưa khóa interface/schema trước thiết kế. Mỗi task mở sẽ đối chiếu màn đã duyệt, cập nhật file test riêng với bước và expected cụ thể, rồi làm trọn phạm vi task đó. Thay đổi RPC/migration chỉ khi có gap đã chứng minh để giữ nghiệp vụ và quyền; không mặc định xây checkout ledger/schema mới để cải tổ hình thức.

### Coverage thay 17 task cũ
| Nhóm mới | Task cũ | Yêu cầu giữ |
|---|---|---|
| B1 | T01, T02, nền T03 | TD-01 types; TD-02 lỗi; tokens/typed policy, baseline UI-09 |
| B2 | T05–T10, phần POS T03 | UI-02/03 các khu/màu, UI-04 menu, UI-05 trạng thái, UI-07 thu, UI-08 contact, UI-09 in; TD-03 thống nhất |
| B3 | T13, T14 | UI-04/06/08; D02 |
| B4 | T11, T12 | UI-04/05; TD-02/03; toàn hành trình khách |
| B5 | T04, T15, T16 | UI-01 chuyển khu, hóa đơn/thực thu, cấu hình/admin |
| B6 | T17 | Hồi quy, Testing, evidence, release riêng |

## Các ràng buộc giữ nguyên
- Core + Theme theo cấu hình quán; không slug/ID hardcode, không đổi stack.
- Bảo Lương POS duyệt + phiếu giấy, không KDS; Pubu giữ bếp/prepay.
- Booking/hold/arrival/mâm/preorder locked theo PASS; không thêm cọc, tự đóng/no-show hoặc xóa bill còn nợ.
- Owner-only chỉnh/thu/đóng; tổng server/audit, in không phải tiền, money thật mới doanh thu.
- Realtime/mạng chậm không mất draft/context; retry không tạo trùng; ZCA best-effort.
- Bill đổi/pending phải rà trước thu, nhưng máy in lỗi không chặn thu và không bắt lý do.
- UI-09 30–40 giây là phản ánh, chưa tái hiện/đo live. [PERFORMANCE.md](../../design/ui-reform-2026-10-01/PERFORMANCE.md) là phương pháp, không kết quả đạt.
- Nguồn và bằng chứng cũ ở [AUDIT.md](../../design/ui-reform-2026-10-01/AUDIT.md); số Txx trong audit là mapping lịch sử theo bảng trên.

## Checkpoint hiện tại
A1 đã soạn; A2 đã rà bản nguồn được chọn và lập review, chờ anh sửa cùng Stitch; A3 chưa duyệt. Chưa có sản phẩm mới, chưa Test B PASS, chưa commit phần tài liệu đang chờ nghiệm thu.
Review cũ và Sprint R0–R7 được đánh dấu **SUPERSEDED**, dùng checklist A/B mới. TESTING.md chỉ giữ link/trạng thái.
