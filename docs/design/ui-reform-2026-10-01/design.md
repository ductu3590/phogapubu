# design.md — MEVO: Timeline POS hợp nhất
Ngày 02/10/2026 · **Bản thiết kế để dựng màn trong Stitch; chưa được duyệt để code.**

## Đọc nhanh cho anh Tú
Hướng: một màn POS gom bàn/mâm, duyệt món, duyệt đặt bàn, gọi nhân viên và thông báo.
D01 đã chốt: in lỗi vẫn thu tiền; D02 đã chốt: staff trả sau không chọn phương thức.
Bước kế: anh sửa bản có sẵn trong Stitch theo review → rà checklist → anh nói **“duyệt thiết kế”** mới chạy phần B.

## 1. Nguồn thiết kế được anh Tú chọn
Dùng trực tiếp [bản POS đã chọn](https://stitch.withgoogle.com/preview/11099609419664851651?node-id=cd57300e6e1a4a2baee056e84949713e&raw=1), screen `cd57300e6e1a4a2baee056e84949713e`. Giữ bố cục và bộ nhận diện; chỉnh các panel/luồng thiếu theo [review](REVIEW-CHOSEN-POS-2026-10-02.md). Không tạo mẫu thay thế, không lấy P01 mới hay screen 5a5 làm nguồn ưu tiên. Codex chỉ đánh giá; anh Tú trực tiếp yêu cầu Stitch sửa.

Các màn POS, staff, Mini App và admin sau này dùng cùng bộ nhận diện nguồn. Giữ nghiệp vụ PASS, D01/D02 và cấu hình theo quán. Việc chọn nguồn chưa phải lời duyệt toàn bộ thiết kế để code. REVIEW.html và các yêu cầu sinh màn trước đây chỉ là lịch sử.

## 2. Không khí và nguyên tắc UX
**Sáng, rõ, chắc tay, chuyên nghiệp nhưng gần gũi quán Việt.** POS mật độ 7/10, Mini App 4/10; bất đối xứng vừa phải 4/10, chuyển động tiết chế 2/10. Không làm landing page/hero cho phần mềm vận hành.

- Một màn chính, một ngữ cảnh đang chọn, một hành động chính trong mỗi panel. Hành động phụ dùng nút viền hoặc menu chữ rõ nghĩa.
- POS thấy cả khu; lọc khu là nhảy tới khu, không che phần còn lại. Timeline và Sơ đồ bàn giữ cùng bàn/mâm đang chọn.
- Duyệt món, in phiếu và thu tiền là các việc riêng. “Đã xác nhận” không có nghĩa đã in hoặc đã thu.
- Tên khách, bàn/mâm, thời gian, số tiền có thứ bậc cố định; luôn phân biệt **Bill đã duyệt** và **Món chờ duyệt**.
- Trả sau: chọn món trước, thu tiền tại quầy sau. Không hỏi phương thức khi staff đặt hộ.
- Mất mạng/lỗi không mất giỏ hay lựa chọn. Giữ vị trí cuộn; không tự đổi bàn, đóng panel hoặc cuộn lên đầu khi có cập nhật.
- Thông báo cần xử lý nằm trong POS hợp nhất. Badge là số việc đang chờ thật; lịch sử riêng, không đếm bản ghi cũ thành việc mới.
- Quyền hiện hữu quyết định nút được thấy: chỉ owner được sửa/thu/đóng bill; staff không được nâng quyền qua giao diện.

## 3. Màu và vai trò — theo bản đã chọn
Quyết định mới của anh Tú thay palette cam đất và quy ước đỏ-có-khách/xanh-trống trước đây. Giữ màu nguồn, không rebrand.

| Token | Màu | Vai trò |
|---|---|---|
| Nền / bề mặt | #F1F5F9 / #FFFFFF | Canvas slate và panel trắng |
| Thanh tối / chữ chính | #0F172A / #1E293B | Queue, header bill / nội dung |
| Chữ phụ / viền | #475569 / #E2E8F0 | Metadata / phân hàng, input |
| Nhấn / hover | #EA580C / #C2410C | Orange 600/700, nút chính |
| Nhấn nhạt | #FFF7ED | Ngữ cảnh đang chọn |
| Đang phục vụ | #059669 | Emerald 600, có nhãn |
| Booking đã chốt | #F97316 | Orange 500, có giờ đến |
| Chờ duyệt/đổi | #FBBF24 / #F59E0B | Amber 400/500 |
| Trễ/xung đột | #EF4444 | Red 500 |
| Gọi nhân viên/thông tin | #3B82F6 | Blue 500 |
| Trống / lịch sử | #F1F5F9 / #64748B | Slate trung tính, nhãn rõ |

Màu luôn kèm nhãn/icon. Một bàn có khách và booking sau đó hiện hai block theo thời gian, không đổi trạng thái cả hàng. Chọn bàn giữ viền cam của nguồn, không đổi màu trạng thái. Kiểm tương phản chữ nhỏ trên nền màu khi rà.

Bộ màn sau cùng nhận diện này; logo/ảnh/content và cấu hình theme theo quán vẫn theo Core + Theme, không hardcode Bảo Lương lên Pubu hoặc đổi nghiệp vụ Pubu.

## 4. Chữ và khoảng cách
- **Inter như bản nguồn** cho tiếng Việt; fallback sans hệ thống khi môi trường Zalo không tải được font. Kiểm dấu tiếng Việt đầy đủ. Không đổi font chỉ vì brief cũ; kiểm dấu Việt và độ đọc được.
- Số tiền, giờ và số thứ tự căn phải, dùng chữ số thẳng hàng; Chữ số tabular của font nguồn cho số liệu POS. Không dùng mono cho tên khách/món.
- Thân chữ 16px/24px; metadata 14px/20px; tiêu đề panel 20px/28px semibold; tiêu đề trang 24px/32px; tổng tiền 28px/36px. Phone tiêu đề trang 22px/30px. Không biến dashboard thành banner chữ lớn.
- Thang khoảng cách **4, 8, 12, 16, 24, 32px**. Nội dung phone padding 16px; tablet 20px; desktop 24px. Form gap 16px; nhóm tác vụ gap 24px.
- Input/nút cao 48px; mục chạm tối thiểu 44×44px; hàng POS 56–64px. Bo nút/input 10px, panel/sheet 16px, chip 8px. Không bo khổng lồ làm mất diện tích.
- Icon nét 20/24px cùng bộ; không emoji. Ảnh món thật từ quán, tỷ lệ 1:1, không ảnh stock không liên quan.
- Nội dung văn xuôi tối đa 65 ký tự/dòng; mô tả phụ ngắn, không thay hướng dẫn thao tác bằng thuật ngữ kỹ thuật.

## 5. Component dùng chung
| Component | Hình thức và hành vi |
|---|---|
| Nút chính | Cam nguồn/chữ trắng; tên cụ thể “Xác nhận đặt bàn”, “Gửi đặt món”, “Xác nhận đã nhận tiền”; khi gửi giữ nguyên chiều rộng và đổi nhãn “Đang gửi…” |
| Nút phụ/nguy hiểm | Viền slate/nền trắng; hủy/từ chối đỏ đậm có chữ; không đặt sát nút duyệt nếu dễ chạm nhầm |
| Badge trạng thái | Nền nhạt/chữ đậm + icon + nhãn; không biến badge thành nút |
| Hàng việc | Loại việc, bàn/khách, thời gian chờ, nội dung ngắn, CTA; chia bằng viền, không xếp vô số card nổi |
| Panel chi tiết | Header ngữ cảnh cố định; nội dung cuộn; footer hành động cố định, không đè dòng cuối |
| Menu món | Danh sách dài theo section; ảnh 64–72px, tên/giá/option, nút cộng → stepper; hết món có nhãn |
| Option sheet | Tên món/giá, biến thể bắt buộc, topping/ghi chú, số lượng, tổng và “Thêm vào giỏ”; giữ chọn khi lỗi |
| Form | Label trên input; lỗi ngay dưới trường, giữ nội dung; bước ngày/giờ/số khách rõ ràng |
| Bill | Nhóm lượt đã duyệt; dòng bỏ/tặng vẫn thấy nhãn/audit; pending tách rõ, không cộng giả vào số phải thu |
| Toast/banner | Toast cho kết quả ngắn; lỗi/mất kết nối tồn tại dùng banner có thao tác thử lại; không chỉ báo bằng toast biến mất |
| Skeleton/empty | Skeleton đúng hình hàng/panel; rỗng nói việc tiếp theo như “Chưa có yêu cầu chờ xử lý”, không số liệu giả |

Chuyển panel 160–220ms bằng opacity/transform; phản hồi nhấn nhẹ. Không pulse vô hạn, thác animation hoặc shimmer chạy liên tục trên POS có khách; chỉ skeleton trong lúc tải. Tôn trọng giảm chuyển động. Đây là điều chỉnh motion của StitchDesign cho môi trường vận hành.

## 6. Quy tắc responsive chung
| Viewport cần dựng | Bố cục |
|---|---|
| Phone 390×844 + kiểm 360×800 | Một cột, header gọn, tab nhãn rõ, chi tiết toàn màn, footer chừa safe area và bàn phím |
| Tablet 1024×768 | Thanh điều hướng hẹp; chính + panel khoảng 320px; nút lớn cho chạm, không lệ thuộc hover |
| Desktop 1440×900 + kiểm 1366×768 | Nav thu gọn 72px/mở 208px; workspace tối đa 1600px, tận dụng chiều ngang, panel khoảng 360px |

Không overflow ngang toàn trang ở phone. Timeline phone dùng cửa sổ giờ thu gọn với nút giờ trước/sau; tên bàn luôn nhìn được. Không bắt kéo ngang mới thấy nút duyệt. Dưới 768px mọi workspace nhiều cột chuyển một cột. Tab phone dùng nút gọn/quá nhiều mục thì menu danh mục, không tràn màn.

## 7. POS Timeline — màn vận hành chính
**Desktop:** nav trái → header quán/ngày/tìm bàn-khách + “Đặt bàn mới” → thanh tóm tắt việc chờ → workspace bất đối xứng.
- Vùng chính: toggle **Timeline / Sơ đồ bàn**, chú giải trạng thái; tất cả khu lần lượt, gồm “Chưa phân khu”. Timeline mỗi hàng một bàn, nhãn bàn cố định, mốc giờ/vạch hiện tại; block booking và phiên thực phân biệt. Mâm 09+10 có dấu liên kết, không hai tổng bill.
- Panel phải: hai tab **Việc cần xử lý / Bàn & mâm**. Tab việc gồm tất cả loại việc trộn theo ưu tiên (quá giờ/cần xử lý trước), mặc định không phải bốn dashboard rời. Bộ lọc “Tất cả / Đặt bàn / Món mới / Gọi nhân viên / Thông báo” với số chờ. Chọn việc mở chi tiết ngay tại panel, giữ timeline và hàng chờ; nút quay về danh sách.
- Tab bàn: tên mâm, tên/số điện thoại từ nguồn thật, trạng thái, bill đã duyệt, món chờ duyệt, lượt món/lịch sử, booking kế tiếp; CTA theo ngữ cảnh: “Khách đã đến”, “Thêm món đã phục vụ”, “Thanh toán”.
- Cập nhật mới xuất hiện nhẹ với dấu “Mới”; không giành focus, không đóng chi tiết đang làm. Lịch sử thông báo xem trong cùng panel; banner lỗi relay chỉ là trạng thái gửi nội bộ, không làm booking biến mất.

**Tablet:** nav 64px, vùng chính + panel 320px; chip tóm tắt xuống dòng nếu thiếu chỗ. Giữ cả bàn và việc chờ trên cùng màn; điều khiển chạm, không tooltip bắt buộc.

**Phone:** header + tổng việc chờ; hai tab **Việc cần xử lý / Bàn & mâm** trong cùng POS. Mặc định tab việc khi có việc mới, nếu người dùng đã chọn tab thì không tự đổi. Timeline thu gọn theo khung giờ, các khu xếp dọc; chọn hàng mở chi tiết toàn màn có nút quay lại. Footer hành động không đè nội dung. Không chuyển sang trang quản lý booking riêng để duyệt.

### Các thao tác cần thể hiện
1. **Đặt bàn chờ:** chọn việc → thông tin khách/ngày giờ/số người → chọn bàn ở tất cả khu → thấy bàn đã chọn, sức chứa gợi ý → “Xác nhận đặt bàn”. Sau thành công việc rời queue, block booking cam hiện timeline. Từ chối theo quy trình hiện hữu; không tự phân bàn.
2. **Khách đã đến:** booking đã xác nhận → chọn “Khách đã đến” → thấy mâm/bill và món đặt trước liên kết; không PIN, không sao chép món hay tự in lại.
3. **Món mới:** lượt preorder/QR/staff có nguồn, món/option/tổng → “Xác nhận món” → trạng thái đã xác nhận và hành động “In phiếu”. Nếu có nút kết hợp duyệt/in, lỗi in vẫn hiện **đã xác nhận**, cho mở lại phiếu đúng lượt. Hai liên cùng giá/tổng, khác nhãn; không KDS Bảo Lương.
4. **Gọi nhân viên:** xem bàn, nội dung, thời gian → đánh dấu đã xử lý theo quyền. Đã xử lý không biến thành đơn món.
5. **Thông báo/gọi nhắc:** xem booking liên quan → gọi theo thao tác hiện hữu hoặc hoãn 10/15/30 phút; lỗi gửi nội bộ vẫn để POS xử lý. Thông báo liên kết tới đúng bàn/booking, không đưa sang hộp thư khác.
6. **Thanh toán:** một lối vào “Thanh toán” → rà bill (bỏ/tặng/khôi phục, thêm món đã phục vụ) → thao tác in bill tùy nhu cầu → chọn tiền mặt/chuyển khoản thực tế → owner “Xác nhận đã nhận tiền” → đóng cả mâm. Pending chưa duyệt hoặc bill đổi phải xử lý/rà lại trước thu.
   **D01:** nút in là phụ, không điều kiện mở bước thu. In lỗi hiện “Không mở được phiếu in” + “Mở lại phiếu”; nút thu vẫn dùng bình thường. Không nút “tiếp tục không in”, không lý do, không thao tác gửi bill trong hệ thống. Không tự nhận giấy đã in khi hộp thoại đóng.
7. **Sơ đồ bàn:** cùng queue/selection/tổng; mọi khu hiển thị. Sắp xếp khu là hành động cấu hình riêng, không kéo bàn đang có khách thành chuyển mâm.

## 8. Staff đặt hộ
**Phone:** header “Đặt hộ” + bàn/mâm đang chọn → danh mục sticky → menu section dọc → thanh “Xem giỏ · số món · tổng”. Chọn bàn bằng sheet có khu/trạng thái. Review toàn màn: bàn/mâm, món/option/ghi chú, tổng, “Gửi đặt món”. Sau gửi giữ màn kết quả và trạng thái thực.
**Tablet:** danh sách/menu bên trái, giỏ bên phải khoảng 320px; desktop cùng cấu trúc, nội dung rộng hơn. Không dùng grid ảnh để thay menu section.
**D02:** postpay hoàn toàn không có Cash/Bank/phương thức ở menu, giỏ, review, kết quả. Có nhãn “Thanh toán tại quầy sau”. Pubu prepay giữ lựa chọn và luồng thanh toán hiện hữu.
Nếu Bảo Lương cần POS duyệt: “Đã gửi, chờ quán xác nhận”; không coi đã xuống bếp. Staff xem bill theo quyền, không sửa/thu/đóng. Đổi bàn khi giỏ còn: giữ giỏ và yêu cầu xác nhận ngữ cảnh trước gửi, không gán âm thầm sang khách mới. Bàn không còn phiên mở: giữ nháp, báo chọn lại bàn.

## 9. Mini App khách
Trọng tâm là **phone trong Zalo**, header và safe area SDK đúng môi trường. Tablet/desktop preview vẫn cùng luồng, không thêm chức năng vận hành.

| Màn | Bố cục và thao tác |
|---|---|
| M01 Trang quán/menu không mã bàn | Logo/tên/ảnh quán vừa phải, menu section, thông tin giờ/địa chỉ; CTA “Đặt bàn”. Bảo Lương không mở giỏ đặt tại bàn khi chưa có phiên, không Mang về/Ship, không công khai sơ đồ bàn trống |
| M02 Đặt bàn | Tên/điện thoại, ngày/giờ đến, số người, ghi chú → rà thông tin → “Gửi đặt bàn”; giờ hợp lệ hiện rõ, giữ form khi lỗi |
| M03 Booking chi tiết | Trạng thái chờ/đã xác nhận, thông tin lịch, hỗ trợ liên hệ; sau confirmed hiện lời mời “Chọn món trước”. Yêu cầu đổi giữ lịch cũ đến khi quán duyệt |
| M04 Menu + giỏ | Danh mục sticky, scrollspy; option sheet, stepper; giỏ hiển thị đúng giá/option/ghi chú và ngữ cảnh “Món đặt trước” hoặc “Gọi thêm tại bàn…” |
| M05 Rà/gửi preorder | Khách chỉ gửi một batch. Trước gửi nhắc món được chốt; sau gửi: “Đã gửi món đặt trước. Món đã chốt, vui lòng gọi thêm tại quán nếu cần.” Không sửa/hủy/batch thứ hai |
| M06 QR tại bàn | Header bàn/mâm rõ; menu/giỏ → “Gửi đặt món”; tất cả khách tại phiên mở được gọi thêm. Chưa có phiên/bàn đang giữ: giải thích và hướng dẫn liên hệ nhân viên, không tự mở sai phiên |
| M07 Theo dõi lượt và bill | Bảo Lương: Chờ quán xác nhận / Đã xác nhận / Từ chối, kèm món/tổng/lý do thật. Nhãn chưa thu/đã thu tách riêng, không cooking/ready giả; Pubu giữ tiến độ bếp thật và prepay |
| M08 Gọi nhân viên/kết quả lỗi | Lựa chọn yêu cầu hiện hữu, xác nhận gửi, trạng thái xử lý; timeout “Đang kiểm tra kết quả” có thử lại an toàn, không bắt đặt lại đơn mới |

Phone bottom navigation ít mục với chữ rõ nghĩa, CTA giỏ riêng phía trên; không hai nút chính cạnh nhau. Tablet ≥768px menu + giỏ side panel, trang quán max-width 960px. Desktop max-width 1120px, menu + giỏ, form tối đa 560px; không kéo dài chữ/ảnh món hết màn.

## 10. Admin / MEVO nội bộ
Cùng font, màu, component với POS; **POS là điểm vào vận hành**, admin phục vụ cấu hình/quản lý.
- Nav owner: Điều hành, Menu, Bàn & QR, Nhân viên, Hóa đơn, Báo cáo, Cấu hình. Phone dùng menu mở toàn màn, không ép bảy tab dưới.
- **Menu:** danh sách tìm kiếm/danh mục/đang bán; click món mở form rõ tên/ảnh/giá/biến thể/topping/tình trạng; Lưu/Hủy, lỗi giữ bản nháp.
- **Bàn & QR:** tất cả khu cùng màn; kéo bàn xuyên khu, hoặc chạm/bàn phím “Chuyển khu”; Lưu/Hủy chung. Xung đột giữ nháp, không ghi đè. Đây là cấu hình vị trí, không chuyển khách/đơn. QR có bàn/quán đúng, tải/in theo chức năng hiện hữu.
- **Cấu hình:** nhóm Thông tin quán / Quy trình / Thông báo & In / Thanh toán; không tất cả trường một form dài. Policy đổi có rà thay đổi, quyền và điều kiện hiện hữu; không tạo chế độ quán mới. Trạng thái máy in/relay chỉ hiện khi có bằng chứng, không “sẵn sàng” giả.
- **Nhân viên:** tên/tình trạng/quyền rõ, tạo/sửa/vô hiệu hóa theo quyền owner. Không nút cấp quyền thu tiền cho staff.
- **Hóa đơn/báo cáo:** hóa đơn theo phiên/mâm, chi tiết món/chỉnh sửa/thu tiền; bộ lọc ngày quán, tổng thực thu, không lấy đơn chưa trả thành doanh thu. Chỉ tiêu thiếu dữ liệu không vẽ số giả.
- **MEVO /mevo:** danh sách quán, cấu hình app/theming và tích hợp theo quyền superadmin, cùng design system. Owner chỉ thấy quán mình; không lộ key/secret.
- Desktop bảng + panel chi tiết; tablet giảm cột phụ và sheet; phone list có nhãn + form toàn màn. Save sticky nhưng chừa dòng cuối/bàn phím; không thu nhỏ bảng tới chữ không đọc được.

## 11. Những nghiệp vụ PASS phải giữ
Bảo Lương dùng phiếu giấy, POS duyệt, không Kitchen Display; Pubu giữ KDS/prepay. Cấu hình từng quán quyết định luồng, không tên/slug. Booking tối thiểu 30 phút, trong 7 ngày lịch, bước 15 phút; owner ngoại lệ có audit. Confirm phải chọn bàn; gợi ý sức chứa 6/bàn không tự chọn thay quán. Giữ bàn 60 phút trước giờ đến, không tự đóng phiên đang có khách hoặc xóa bill còn nợ sau 6 giờ idle.

Nhiều bàn chung một phiên/mâm/bill; arrive/retry không tạo trùng. Preorder một batch khóa; QR/staff cần duyệt theo policy. Bỏ/tặng/khôi phục giữ audit, tổng do server, món POS đã phục vụ không vào bếp. Owner-only thu thật và đóng cả mâm; in không phải thu. Realtime không yêu cầu refresh; mất mạng không gửi/thu giả, retry không nhân đôi. ZCA best-effort, POS là nguồn quyết định.

## 12. Bộ màn và dữ liệu để rà
**Cập nhật theo lựa chọn mới 02/10:** dùng bản có sẵn `cd57300e6e1a4a2baee056e84949713e`, không tạo P01 thay thế. P01 v1 bị từ chối; yêu cầu v2 đã gửi trước đây không còn là hướng đang thực hiện. Anh Tú sửa màn với Stitch theo review; Codex không gửi lệnh nữa. Sau khi rà bản sửa, hoàn thiện các viewport và màn chi tiết bằng cùng nhận diện nguồn:
- P02 booking + chọn nhiều bàn; P03 món mới + phiếu; P04 bill/thanh toán + in lỗi; P05 gọi nhân viên/thông báo.
- S02 chọn bàn; S03 option/giỏ/review/kết quả (postpay và prepay).
- M02–M08 theo bảng trên, gồm trước/sau gửi preorder và QR.
- A02 menu/form; A03 bàn/chuyển khu/Lưu-Hủy; A04 hóa đơn/báo cáo; A05 nhân sự/quyền Admin quán.
- A06–A10 `/mevo` độc lập: danh sách quán/onboarding; tạo quán nháp; theme & nội dung; trạng thái tích hợp; operator & audit. Chỉ `mevo_superadmin` dùng `/mevo`; owner chỉ `/admin` đúng quán. Không hiển thị key/token/email/IP/địa chỉ, QR/số tài khoản, SLA/HTTP/ping hay công nghệ nội bộ chưa có trong core. A09 chỉ có bốn trạng thái cấu hình và “Mở hướng dẫn”; A10 chỉ có Thời gian, Người thực hiện, Thay đổi.

Dữ liệu demo có nhãn **“Dữ liệu minh họa”**: ngày 01/10/2026, Nguyễn Minh An, 10 người, hẹn 18:30, đến 18:35, mâm 09+10, giờ hiện tại 19:00; điện thoại che 09xx xxx 111. Preorder: lẩu bò lớn 350.000 + bò cuộn 2×180.000 = 710.000đ. QR bia 4×25.000 = 100.000đ, staff rau 50.000đ chờ duyệt; bill đã duyệt 710.000, chờ 150.000; duyệt hết = 860.000. Thêm khăn 10×2.000 = 880.000; tặng rau = 830.000. Nhận tiền mặt 900.000, trả lại 70.000; thực thu 830.000. Booking Chị Lan bàn 09 lúc 22:00, ưu tiên từ 21:00. Không số ngẫu nhiên sai tổng, không QR/ngân hàng hay liên hệ thật.

Dựng thêm: loading, không có việc chờ, lỗi gửi giữ nháp, reconnect, bill đổi cần rà lại, pending chặn thu, in lỗi vẫn thu, long menu, bàn vừa đổi phiên. Gắn tên screen + viewport + version để rà; không ghi “đã duyệt” lên màn nháp.

## 13. Những điều tránh
Không neon/tím gradient/glow, nền đen tuyệt đối, emoji, serif, quá nhiều màu nhấn hoặc ba card KPI ngang chiếm đầu POS. Không lạm dụng bóng/bo góc/motion. Không trạng thái giả “Máy in sẵn sàng”, “Đã in”, “Đã thu” hoặc cooking/ready Bảo Lương. Không “Chờ cọc”, no-show tự động, KDS mới, gửi bill qua Zalo trong hệ thống, lý do không in. Không chữ chồng ảnh, chữ 12px khó đọc, nút chỉ icon mơ hồ, UI phụ thuộc hover/kéo thả hoặc màu.

## 14. Cổng duyệt
Rà theo [DESIGN-REVIEW-2026-10-02.md](../../testing/ui-reform/DESIGN-REVIEW-2026-10-02.md).
Bộ thiết kế được anh Tú ủy quyền Codex tự rà và **chốt ngày 02/10/2026**. Chưa tự mở phần B; chỉ triển khai khi có yêu cầu code tiếp theo.
Bản thiết kế đã duyệt phải ghi screen ID/version/viewport và ảnh/export; code bám bản đó. Không triển khai sản phẩm hoặc Publish trong phần A.

