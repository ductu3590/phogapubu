# Hướng hiện tại — dùng bản có sẵn
Anh Tú chọn cd573 và màu nguồn, không sinh mới/Codex ra lệnh Stitch. Rà [Test R1](REVIEW-CHOSEN-POS-2026-10-02.md) trước; phần P01-v2/A0 dưới đây chỉ là lịch sử đã ngừng dùng. A2/A3 còn hiệu lực với nguồn đã chọn.

# MEVO UI Reform — Rà thiết kế 02/10/2026
**A1: PASS · A2: PASS theo tự rà được ủy quyền · A3: PASS · B: chưa triển khai.**

## Cập nhật chốt 02/10/2026

Anh Tú yêu cầu Stitch dựng tiếp cockpit riêng cho MEVO và ủy quyền Codex tự rà, “ok thì chốt”. Bộ A06–A10 đã được tạo và chỉnh lại theo core: `/mevo` chỉ cho `mevo_superadmin`, Admin quán chỉ ở `/admin`; A07 tạo quán nháp, A08 theme/nội dung, A09 trạng thái tích hợp, A10 operator/audit. Các fixture kỹ thuật, liên hệ, IP, email, secret/token, QR và số liệu giả đã bị loại khỏi bản chốt. A09 chỉ còn bốn trạng thái nghiệp vụ và “Mở hướng dẫn”; A10 chỉ còn ba cột audit. Bảo Lương giữ một máy in quầy in hai liên, POS duyệt rồi thu sau, không KDS; Pubu prepay giữ nguyên.

Kết luận: thiết kế được chốt theo ủy quyền tự rà. Chưa code và chưa Publish.

Ngày 02/10: theo yêu cầu trực tiếp của anh Tú, Codex tương tác tab Stitch project 11099609419664851651, dán brief từ design.md qua “Bắt đầu với thiết kế của bạn”. UI xác nhận nhập design system thành công. Đã gửi yêu cầu vòng 1: P01/S01/M01/A01 × phone390/tablet1024/desktop1440 = 12 màn; tin nhắn xuất hiện trong nhật ký và Stitch chuyển từ Thinking sang Designing a screen / Generating Screen. Bằng chứng: [ảnh yêu cầu](../../design/ui-reform-2026-10-01/stitch-request-2026-10-02.jpg). Chưa coi số màn được yêu cầu là số màn hoàn tất; chưa duyệt thiết kế, chưa mở B. Tải file qua chooser không trả sự kiện, nên dùng ô dán tài liệu; không upload file thành công.

## Kết quả P01 Desktop — REJECTED 02/10
Anh Tú không chấp nhận v1 vì xấu/rối hơn bản tự làm. Quan sát UI: canvas 1280×1024 lệch 1440×900; chữ chen nhau, Timeline mất block rõ, panel dồn giữa và trắng bên phải; còn header/thanh mô phỏng và trạng thái máy in giả. Lời Stitch tự báo tuân thủ không thay bằng chứng hình ảnh.

Đã gửi phản hồi yêu cầu chỉ làm P01-desktop-v2, tham chiếu trực tiếp bản Timeline hoàn thiện gốc; chưa sinh tiếp 11 màn khác. Tin nhắn đã hiện trong nhật ký, Stitch Thinking. [Ảnh gửi phản hồi](../../design/ui-reform-2026-10-01/stitch-p01-rejected-2026-10-02.jpg).

**Cổng lịch sử (đã thay bằng nguồn cd573):** P01 Desktop đạt và anh duyệt hướng trực quan trước khi nhân sang viewport/nhóm khác. V2 chưa hoàn tất/chưa PASS. B vẫn khóa.
- [ ] [HISTORICAL] V2 đúng 1440×900, không overlap, body16/metadata14, panel sát phải dùng đủ chiều ngang.
- [ ] Timeline hàng bàn/block giờ rõ ít nhiễu hơn bản gốc, queue hợp nhất không nhồi cả bill dài.
- [ ] Không Bếp/Cọc/máy in sẵn sàng/Reset Demo/thanh mô phỏng hoặc paragraph D01 kỹ thuật trên UI.
- [ ] Anh Tú chấp nhận hướng P01; sau đó mới rà thêm viewport và các màn khác theo Test A2/A3.
## Test A0 — Xác nhận đã giao việc cho Stitch
- [ ] Mở project: thấy tài liệu “MEVO UI Reform — Timeline POS hợp nhất — 02/10/2026” và tin nhắn yêu cầu dựng 12 màn trong nhật ký.
- [ ] Tin nhắn nêu D01/D02, tạo bản mới giữ nguồn cũ, và chỉ thiết kế/chưa code-Publish.
- [ ] Khi màn hoàn tất mới rà Test A2; không đánh PASS giao diện từ trạng thái đã gửi yêu cầu.

## Test A1 — Rà brief trước khi đưa vào Stitch
Đọc [design.md](../../design/ui-reform-2026-10-01/design.md) và [plan A/B](../../superpowers/plans/2026-10-01-mevo-ui-reform.md).
- [ ] POS hợp nhất duyệt món, booking, call, thông báo cùng màn; đủ staff/Mini/admin và ba kích thước.
- [ ] D01 thu bình thường khi in lỗi, không nhánh/lý do; D02 mọi postpay không selector, Pubu prepay giữ nguyên.
- [ ] Tokens/font/spacing/components đủ cụ thể cho Stitch; nghiệp vụ PASS ở design §11 giữ nguyên.
- [ ] A làm thiết kế; B còn sáu task, khóa tới lời “duyệt thiết kế”. Không bắt chạy test sản phẩm lúc này.

## Test A2 — Rà màn Stitch
Rà P01/S01/M01/A01 trên phone 390, tablet 1024, desktop 1440 trước; kiểm phone 360, desktop 1366. Sau đó rà màn chi tiết trong design §12.
- [ ] Nhìn nhanh biết việc chờ, bàn/mâm đang chọn, hành động tiếp; tất cả khu thấy được, queue không tách thành nhiều trang.
- [ ] Màu bản chọn: emerald phục vụ/cam booking/amber chờ/đỏ xung đột/slate trống, có nhãn; bàn có khách và booking sau không mâu thuẫn.
- [ ] Menu section + sticky danh mục + stepper/options; chữ Việt dễ đọc, target ≥44px, không tràn/đè CTA, safe area/bàn phím đúng.
- [ ] Màn sau thao tác đủ: booking confirm/arrival, món chờ→duyệt→in, call/thông báo, thu, preorder khóa, QR, admin save/conflict.
- [ ] Mọi màn dùng cùng component; số tiền/timeline/khách theo fixture, không số giả sai tổng.
- [ ] Loading/empty/offline/reconnect/lỗi gửi giữ nháp/bill đổi/pending/in lỗi rõ; không trạng thái máy in hoặc thu tiền giả.

## Test A3 — Chốt thiết kế (chưa phải test sản phẩm)
- [ ] Rà xuyên luồng booking→preorder→arrival→QR/staff→POS duyệt→bill→thu; Pubu prepay/KDS không bị gắn luồng Bảo Lương.
- [ ] D01/D02 đúng cả màn bình thường và lỗi; không thêm chức năng chưa được chốt.
- [ ] Ghi screen ID, version/export, viewport, đường dẫn ảnh và các chỉnh sửa vào bảng dưới; không còn góp ý chặn.
- [ ] Anh Tú nói **“duyệt thiết kế”** cho bộ màn này. Codex cập nhật trạng thái và commit tài liệu trước khi mở B1.

| Bộ màn | ID / version / ảnh-export | Kết quả |
|---|---|---|
| POS P01–P05 | Chờ Stitch | Chưa rà |
| Staff S01–S03 | Chờ Stitch | Chưa rà |
| Mini M01–M08 | Chờ Stitch | Chưa rà |
| Admin A01–A05 | Chờ Stitch | Chưa rà |

**Phân biệt:** “A1 PASS” cho phép commit brief/plan; không phải duyệt giao diện và không mở code. Sau A2/A3, lời “duyệt thiết kế” mở B; vẫn phải test từng B và chờ PASS trước task tiếp theo. Publish chưa được duyệt.

Mọi lựa chọn mới cần anh quyết chỉ trình bày 3 dòng: đề xuất / ảnh hưởng / phần cần chốt. D01/D02 không hỏi lại.
