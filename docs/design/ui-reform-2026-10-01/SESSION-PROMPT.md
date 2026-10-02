# Prompt bàn giao — lập kế hoạch cải tổ Mini App + Admin/POS/Staff MEVO

Copy nội dung dưới đây vào session Codex mới trong workspace MEVO.

---

Bạn tiếp tục dự án MEVO tại `D:\Code\mevo`. Hãy đọc `AGENTS.md` đầu tiên, kiểm tra branch/worktree/dirty state rồi thực hiện audit và lập spec/design/plan cải tổ giao diện toàn bộ trải nghiệm khách và vận hành. Mục tiêu là giao diện đủ đẹp, thống nhất, dễ sử dụng và thao tác nhanh để sau này Publish Mini App Bảo Lương.

Trong session này hãy hoàn thành tài liệu và phương án thiết kế cụ thể để tôi xem, chưa triển khai code sản phẩm hay tự Publish. Tôi muốn nhận spec/design, các luồng màn hình hoặc wireframe có thể review, backlog đã sắp ưu tiên và implementation plan theo task nhỏ. Nếu có quyết định sản phẩm chưa rõ, tiến hành phần độc lập trước và chỉ hỏi các quyết định cần tôi chốt. Tự xử lý lựa chọn kỹ thuật thường lệ.

## Trạng thái bàn giao

- BL-0, BL-1, BL-2A, BL-2B ZCA, BL-2C, BL-3 và BL-4 đã được anh Tú nghiệm thu PASS. BL-4 Test 5A PASS ngày 2026-10-01.
- BL-4 Test 5B chưa chạy, hoãn có chủ đích vì anh Tú chưa muốn Publish giao diện Mini App hiện tại để Zalo xét duyệt. Sau cải tổ UI cần nghiệm thu Testing và chốt phát hành riêng.
- Core chức năng đã PASS nhưng vẫn có debt TypeScript và phản ánh hiệu năng/UX. Bảo toàn nghiệp vụ đã nghiệm thu khi đổi giao diện; xác minh debt thay vì suy từ PASS rằng mọi thứ đều hoàn hảo.
- Mốc main lúc viết prompt: `c26838f`; instance Bảo Lương lúc kiểm: `b68ff0d`. Hãy tự kiểm commit thực tế, vì core/instance có thể khác nhau và đã được cập nhật sau bàn giao. Không dùng instance cũ làm nguồn lõi mặc định.
- Không coi local commit là Vercel deployment hoặc artifact Zalo đã Publish. Ghi rõ môi trường/commit khi đo và kiểm thử.

## Nguồn bắt buộc

Đọc toàn bộ bản tổng hợp ghi chú người dùng tại `docs/design/ui-reform-2026-10-01/USER-NOTES.md` và xem đủ 5 ảnh trong `source-images/`. Đây là bản trích từ file Word gốc `C:\Users\ductu\Desktop\sửa MEVO.docx`, dùng được từ repo khi máy mới không có file Desktop. Cả 9 yêu cầu phải được đưa vào spec/plan với ID truy vết.

Đối chiếu các tài liệu và code thật liên quan:

- `docs/superpowers/specs/2026-09-10-bao-luong-reservation-pos-workflow-design.md`.
- `docs/superpowers/specs/2026-09-22-bao-luong-bl2b-zca-relay-design.md` và `2026-09-24-bao-luong-bl4-pilot-readiness-design.md`.
- `docs/superpowers/specs/2026-06-22-mevo-core-theme-architecture-design.md`.
- `docs/superpowers/specs/2026-09-03-pos-cashier-bill-edit-design.md` và `2026-07-15-staff-assisted-ordering-design.md`.
- `docs/testing/bao-luong/SPRINT-BL-3.md`, `SPRINT-BL-4.md`, `BL-4-RELEASE-EVIDENCE.md` và `docs/operations/bao-luong-pilot-runbook.md`.
- Tài liệu thiết kế cũ: `docs/design/stitch-pos-2026-09-20/RESEARCH.md`, `STITCH-PROMPT.md`, `docs/design/stitch-pos-2026-09-21/REVIEW.md`, `screen.png`, `code.html`, và `docs/design/stitch-admin-suite-2026-09-21/BRIEF.md`, `timeline-final.png`, `timeline-final.html`.
- Các prototype Stitch chỉ là tài liệu tham khảo chưa được nghiệm thu UI sản phẩm. Đối chiếu phản ánh cũ trước khi tái sử dụng. Ưu tiên yêu cầu mới trong bản tổng hợp Word nếu khác các brief cũ.
- `mini-app/src`, `admin-web/app/admin`, `admin-web/app/staff`, `admin-web/lib/actions`, các RPC/migrations trong `supabase/migrations`. Chỉ đọc schema/log/config live khi thực sự cần xác minh; tránh làm thay đổi dữ liệu vận hành trong giai đoạn lập plan.

## Project Stitch ưu tiên và quyền trao đổi thiết kế

Anh Tú khá ưng ý hướng thiết kế Timeline POS trong project này và muốn dùng làm nền để phát triển tiếp. Giữ tinh thần bố cục, phong cách và cách điều hành theo timeline; điều chỉnh và hoàn thiện dựa trên 9 ghi chú Word, workflow đã chốt, code thật và review prototype. Đây là hướng thiết kế được ưu tiên, chưa phải UI hoàn chỉnh đã được duyệt để triển khai nguyên trạng.

- Project: **Restaurant Table Booking Manager**.
- Project ID: `11099609419664851651`.
- Link: https://stitch.withgoogle.com/projects/11099609419664851651.

Lấy **ảnh và code** của đủ 5 screen sau, ghi nguồn/ID và lưu artifact vào repo để audit, so sánh và review:

| Screen | ID | Vai trò tham khảo |
| --- | --- | --- |
| image.png | `21306699217505282` | Đọc ảnh/code trước khi xác định nội dung và vai trò; không suy ra từ tên file |
| MEVO — Cấu hình quán | `3387f340e06e404baf571b51f9a96521` | Cấu hình và tổ chức thông tin Admin |
| MEVO POS — Điều hành bàn & đặt bàn (Bản hoàn thiện) | `5a5de7a5626b455b90caf1bf6381d569` | Nguồn ưu tiên cho hướng Timeline POS |
| Quản lý Đặt bàn - Quán Bia Lẩu | `841be5b665d64ddab34d2b884045039a` | Luồng/màn quản lý đặt bàn |
| MEVO POS — Điều hành bàn & đặt bàn | `cd57300e6e1a4a2baee056e84949713e` | Bản trước để đối chiếu review và các thay đổi |

**Anh Tú đã cấp quyền sử dụng MCP Stitch để trao đổi trực tiếp khi design.** Khi MCP Stitch khả dụng, chủ động đọc project/screens, lấy ảnh/code, gửi brief, yêu cầu tạo hoặc điều chỉnh các phương án thiết kế trong phạm vi cải tổ Mini App + Admin/POS/Staff, rồi lấy kết quả về để review. Không cần hỏi lại quyền trao đổi Stitch đã được cấp. Giữ artifact gốc làm tham chiếu và tạo phiên bản/bản sao để thể hiện phần chỉnh sửa; không xóa thiết kế nguồn.

Kiểm tra tool Stitch thực tế của session trước khi dùng. Session viết prompt ngày 2026-10-01 chưa có tool MCP Stitch được cung cấp nên chưa tải lại đủ 5 screen. Repo đã có ảnh/code xuất trước đây của screen `5a5de7a5626b455b90caf1bf6381d569` trong `docs/design/stitch-admin-suite-2026-09-21/` và `cd57300e6e1a4a2baee056e84949713e` trong `docs/design/stitch-pos-2026-09-21/`; đối chiếu bản hiện tại trên Stitch khi truy cập được. Nếu session mới chưa có MCP Stitch, dùng artifact sẵn có để tiếp tục audit và báo rõ phần asset/trao đổi còn thiếu, không tự nhận đã dùng MCP hoặc tải được màn chưa truy cập.

## Phạm vi cải tổ

1. **Mini App:** menu root/QR, danh mục và chọn món, số lượng `− / số lượng / +`, biến thể/topping, giỏ/rà soát/gửi đơn, danh sách và trạng thái đơn theo workflow, đặt bàn/lịch đến/theo dõi/đổi/hủy, preorder, Gọi nhân viên và Nhà hàng. Thiết kế đầy đủ loading/empty/lỗi/mất mạng/đã gửi/thử lại.
2. **Web POS của owner:** timeline bàn/booking trung tâm, các khu vực bàn, panel theo đúng bàn/mâm/bill, queue đặt bàn/preorder/lượt món mới, gọi nhân viên, nhắc đến/Snooze/gọi nhắc, chọn/ghép/đổi bàn theo quyền hiện có, duyệt/từ chối/in/in lại, chỉnh bill và thanh toán. Timeline và sơ đồ nếu cùng tồn tại phải dùng chung trạng thái, lựa chọn và nguồn dữ liệu.
3. **Admin Web:** shell/sidebar thu gọn, điều hướng và các màn đang có như đặt bàn, hóa đơn/đơn, menu, thông tin/cấu hình workflow, bàn/QR/khu vực, staff/quyền, báo cáo. Đề xuất tổ chức lại theo tác vụ; các màn hoặc tích hợp mới chưa có backend phải chỉ rõ gap và task cần thiết, tránh mở rộng phạm vi âm thầm.
4. **Staff:** chọn bàn/mâm, chọn món/giỏ/rà soát/gửi đặt hộ, xem trạng thái lượt, xem bàn/bill và xử lý Gọi nhân viên trong quyền được cấp. Màn chạm trên điện thoại/tablet và desktop phải dễ thao tác.
5. Một design system thống nhất: typography, spacing, palette, trạng thái, icon, button/input/card/tab/drawer/dialog, navigation, error/loading và ngôn ngữ tiếng Việt. Dành chỗ cho branding/theme theo quán; component dùng chung khi tương tác thực sự giống nhau.

## Chín yêu cầu bắt buộc từ Word

- **UI-01:** kéo thả phân bàn vào khu vực, có phương án thao tác trên thiết bị chạm và lưu/hủy rõ.
- **UI-02:** POS hiện các phân khu trên cùng một màn, chia section như Trong nhà/Ngoài trời để thấy bàn xuyên khu; hỗ trợ khu cấu hình thêm/chưa phân khu.
- **UI-03:** chú giải Đỏ = Đang hoạt động, Cam = Đã đặt trước, Xanh = Trống; thể hiện bằng cả nhãn/icon và phân biệt bàn hiện có khách với booking tương lai.
- **UI-04:** menu thêm món tay dạng danh sách chia section; tab danh mục tự theo vị trí cuộn, chạm tab cuộn tới section; kiểm soát số lượng dễ dàng.
- **UI-05:** Bảo Lương hiển thị Chờ xác nhận/Đã xác nhận và nội dung đơn; sau owner duyệt/in không tiếp tục mô phỏng 4 bước bếp của Pubu. Giữ nghĩa chính xác giữa duyệt nghiệp vụ và kết quả in giấy.
- **UI-06:** staff chỉ rà món rồi Xác nhận đặt món; không hỏi tiền mặt/chuyển khoản ở thời điểm order. Phương thức thực thu xác định ở bước thu tiền với owner. Phải đánh giá contract RPC/schema và hồi quy theo workflow quán.
- **UI-07:** POS dùng một nút Thanh toán → rà bill, sửa/thêm/bớt/tặng/khôi phục theo quyền → in bill khách → chọn tiền mặt/chuyển khoản → owner xác nhận tiền thực nhận → đóng bill và giải phóng các bàn của mâm. Đưa vào design tình huống hủy/lỗi in, bill đổi trong lúc thu tiền, đơn chờ và booking kế tiếp.
- **UI-08:** timeline và panel POS lấy đúng họ tên/SĐT khách từ booking/order Mini App và giữ liên kết khi nhận khách, ghép mâm, gọi thêm; không bịa thông tin khách vãng lai.
- **UI-09:** điều tra và khắc phục chậm 30–40 giây từ Xác nhận/in preorder đến màn in. Đo từng bước trên môi trường thực, đề xuất giảm reload/roundtrip cần thiết, ngân sách thời gian và phép kiểm p50/p95; giữ snapshot/revision/idempotency/audit.

## Quy trình đã chốt cần giữ

- Multi-instance Core + Theme: một bộ code lõi, mỗi quán một Mini App; workflow tùy cấu hình, giữ hồi quy Pubu. Không rải điều kiện theo tên/ID Bảo Lương trong component.
- Bảo Lương trả sau tại quầy, tắt Mang về/Ship. Root xem menu và đặt bàn; QR dùng ngữ cảnh bàn/phiên. Không thêm trạng thái bàn trống công khai cho khách chọn booking.
- Đặt bàn khách: tối thiểu 30 phút, trong 7 ngày lịch, bước 15 phút, trong serving_hours phẳng của quán, chỉ giờ đến. Owner có thể tạo tay ngoài giới hạn. Không bổ sung lịch ngày nghỉ riêng trong pilot.
- Owner xác nhận booking phải chọn bàn; nhận khách bằng nút Khách đã đến, không PIN/mã booking. Bàn được ưu tiên/khóa trước giờ đến 60 phút; phiên đã có khách phải được xử lý thực tế. Nhiều bàn một mâm/bill, gợi ý số bàn theo sức chứa mặc định 6 người. Phiên 6 giờ; khoảng giữ kế hoạch không là hạn giục khách ăn hoặc tự xóa nợ.
- Khách có thể gọi sau hoặc gửi preorder sau khi booking xác nhận. Preorder đã gửi khóa sửa/hủy/tạo batch thứ hai; đến quán được gọi thêm qua QR. Mọi khách tại bàn được gọi thêm nhưng mọi lượt cần owner duyệt trên POS theo policy Bảo Lương.
- Bảo Lương chỉ gửi bếp bằng phiếu giấy owner duyệt/in, hai liên cùng giá/tổng và nhãn rõ. Không đưa Kitchen Display vào luồng Bảo Lương; Pubu giữ mô hình của nó.
- Duyệt/từ chối và in/in lại không tạo món trùng. Món POS ghi tay không phát yêu cầu làm bếp. Sửa bill dùng RPC audit và tổng server; owner-only thu tiền/đóng bill; staff không được nâng quyền.
- Thông báo nội bộ đến nhóm Zalo bằng relay ZCA best-effort; POS là nguồn nghiệp vụ. Giữ nhắc khách trước 60 phút qua quy trình gọi, POS gộp nhắc và Snooze 10/15/30 phút, pending quá giờ đóng tay.
- Realtime/polling vẫn hội tụ khi tải chậm, mất mạng, quay lại tab; không mất giỏ hoặc ngữ cảnh bàn, không chuông lặp. Không ghi Trực tuyến/Máy in sẵn sàng khi hệ thống chưa có bằng chứng tương ứng.

## Công việc và đầu ra của session

1. Audit code/route/RPC/layout/UX hiện tại. Lập ma trận mỗi ID ghi chú → bằng chứng file:line → tác động → UI/API/schema/config → đề xuất → task → tiêu chí nghiệm thu. Phân biệt lỗi đang tái hiện, phản ánh chưa tái hiện, yêu cầu đổi UX và quyết định vận hành cần chốt.
2. Kiểm nợ kỹ thuật TD-01/02/03. Typecheck core/instance vẫn đang lỗi SnackbarProvider, category relation và app-config ở core. Ghi task xử lý baseline, không giấu bằng cast any hay đổi config để bỏ kiểm tra. Có lỗi RPC bị biến thành câu Không thể gửi món chung; đưa UX thông báo lỗi/thử lại vào plan.
3. Đo UI-09 hoặc thiết kế phép đo cụ thể nếu thiếu môi trường. Không chốt nguyên nhân chỉ từ code có nhiều request. Tách thời gian xác nhận nghiệp vụ, tạo print job, mở/render màn in và gọi hộp thoại browser.
4. Thiết kế luồng và bố cục trước, cung cấp phương án trực quan có thể review cho Mini App, POS Timeline và Staff; kịch bản xuyên suốt phải dùng đúng khách/bàn/mâm/giỏ/tổng, không bộ màn mẫu dữ liệu mâu thuẫn. Chủ động trao đổi qua MCP Stitch theo quyền đã cấp, lấy đủ ảnh/code của 5 screen nguồn, phát triển hướng Timeline POS anh Tú khá ưng ý và ghi rõ phần đã điều chỉnh.
5. Chốt design spec với component/state/microcopy, desktop 1366×768/1440×900, tablet 1024×768, mobile 390px và điện thoại nhỏ khoảng 360px; safe area Zalo, keyboard, scrolling, focus, tương phản và nút chạm đủ lớn. Tối ưu POS để bảng bàn/timeline và thao tác chính dễ thấy; sidebar có thu gọn.
6. Viết implementation plan theo sprint/task nhỏ, thứ tự phụ thuộc, file cần sửa, migration tương thích nếu cần, test chức năng/role/tenant/Pubu, test UI responsive/thao tác thực, đo hiệu năng và rollout. Mapping đủ 9 ghi chú và 3 debt; không để yêu cầu chỉ nằm trong phụ lục.
7. Mỗi sprint có file nghiệm thu riêng trong `docs/testing/`; `TESTING.md` chỉ link/trạng thái. Sau task phải dừng chờ anh Tú PASS, rồi tự commit như quy ước. Khi đến triển khai, core thay đổi rồi đồng bộ instance đúng phiên bản; deploy Testing trước, Publish chỉ sau quyết định riêng.

Hãy lưu audit, design và plan vào repo, nêu rõ các quyết định vận hành cần tôi chốt và kết thúc bằng đường dẫn tài liệu để tôi review. Đừng dùng câu hỏi chung như muốn giao diện thế nào thay cho việc nghiên cứu, đọc các nguồn trên và đưa ra đề xuất cụ thể.
