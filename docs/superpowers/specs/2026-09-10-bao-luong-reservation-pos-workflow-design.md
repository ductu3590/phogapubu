# Bảo Lương — POS kiểm soát đơn, đặt bàn trước và gọi món liên tục

Ngày: 2026-09-10

Trạng thái: đã duyệt qua từng phần với anh Tú

Quán áp dụng đầu tiên: Bia lẩu Bảo Lương (`bao-luong`)

## 1. Mục tiêu

Đưa Bảo Lương vào pilot với một quy trình thống nhất giữa Mini App, POS, bếp và Zalo OA:

1. POS của chủ quán/thu ngân là điểm kiểm soát vận hành duy nhất: mọi đơn phải được xác nhận
   trước khi xuống bếp; chỉ chủ quán/thu ngân được thu tiền và đóng bill.
2. Mini App mở không kèm mã bàn có chức năng đặt bàn trước, đủ giá trị sử dụng để gửi Zalo xét duyệt.
3. Mini App mở từ QR tại bàn cho phép mọi khách tại bàn gọi món; các lượt gọi thêm cùng đi vào
   phiên/mâm và bill hiện tại.
4. Đặt bàn nhiều bàn tự chuyển thành một mâm chung bill khi chủ quán nhận khách.
5. Khách có thể chọn món trước sau khi đặt bàn được xác nhận. Chủ quán quyết định thủ công lúc
   xác nhận và in món cho bếp.
6. Trạng thái trong Supabase là nguồn sự thật; OA, ZNS và web push chỉ là kênh thông báo.

## 2. Ngoài phạm vi

- Không hiển thị sơ đồ hoặc trạng thái bàn trống cho khách.
- Không cho hệ thống tự xác nhận đặt bàn, tự chọn bàn hoặc tự đánh dấu no-show.
- Không dùng khoảng lập kế hoạch ba giờ để giới hạn thời gian ăn hoặc tự đóng phiên.
- Không tự động hẹn giờ in món đặt trước.
- Không xây thuật toán bàn liền kề; chủ quán dùng sơ đồ POS hiện có để chọn bàn phù hợp.
- Không triển khai lấy số điện thoại tự động qua `getPhoneNumber` ở giai đoạn này.
- Bảo Lương không có luồng Mang về hoặc Ship.

## 3. Quyết định nghiệp vụ đã chốt

### 3.1 Vai trò

| Vai trò | Được làm | Không được làm |
|---|---|---|
| Khách | Đặt bàn, theo dõi, yêu cầu đổi/hủy, đặt món trước, gọi thêm, gọi nhân viên | Xác nhận đơn, in bếp, sửa bill, đóng bill |
| Nhân viên | Đặt món hộ, xem bàn/mâm/bill, hỗ trợ ghép mâm, xử lý gọi nhân viên | Xác nhận/in đơn, thu tiền, đóng bill |
| Chủ quán/thu ngân | Duyệt đặt bàn, chọn bàn, nhận khách, duyệt/in món, no-show, sửa và thu bill | — |

POS ở quầy là nguồn quyết định vận hành. Mọi đơn từ QR, đặt trước hoặc nhân viên đều phải chờ
chủ quán/thu ngân xác nhận và in hai liên trước khi bếp thực hiện.

### 3.2 Cấu hình theo quán

Mỗi quán có cấu hình độc lập:

- `reservations_enabled`
- `takeaway_enabled`
- `shipping_enabled`
- `minimum_advance_minutes`
- `booking_horizon_days`
- `slot_interval_minutes`
- `default_table_capacity`
- `planning_hold_minutes`

Giá trị cho Bảo Lương:

| Cấu hình | Giá trị |
|---|---:|
| Đặt bàn | Bật |
| Mang về | Tắt hoàn toàn |
| Ship | Tắt hoàn toàn |
| Đặt trước tối thiểu | 30 phút |
| Khoảng ngày được chọn | 7 ngày tới |
| Bước chọn giờ | 15 phút |
| Sức chứa mặc định | 6 người/bàn |
| Khoảng kiểm tra trùng nội bộ | 3 giờ |

Giờ khách chọn phải nằm trong giờ phục vụ đã cấu hình. Chủ quán vẫn được tạo đặt bàn thủ công
ngoài các giới hạn này trên POS; thao tác ngoại lệ phải lưu người thực hiện.

Số bàn đề xuất là `ceil(số khách / 6)`. Hệ thống chỉ đề xuất số lượng; chủ quán chọn bàn thật
trên sơ đồ POS để bảo đảm các bàn phù hợp và nằm gần nhau.

## 4. Kiến trúc được chọn

Đặt bàn là một lớp độc lập với phiên bàn đang hoạt động. Xác nhận đặt bàn chỉ giữ các bàn trong
lịch tương lai; không mở sẵn `table_session` và không tạo mâm đang phục vụ.

Khi chủ quán bấm **Khách đã đến**:

- một bàn tạo phiên bàn thông thường;
- nhiều bàn tạo mâm chung bill bằng cơ chế mâm hiện có;
- mọi đơn đặt trước được gắn vào phiên/mâm vừa tạo;
- đơn đã in không được tự in lại;
- thao tác là idempotent: bấm lại chỉ mở kết quả đã tạo, không sinh phiên hoặc bill thứ hai.

Cách tách này tránh để phiên tương lai lẫn với phiên đang phục vụ, không chịu cơ chế hết hạn của
phiên hiện tại và vẫn tái sử dụng toàn bộ logic bàn/mâm/bill sau khi khách đến.

## 5. Mô hình dữ liệu logic

Tên bảng/cột cuối cùng được đối chiếu với schema thật khi lập kế hoạch, nhưng phải giữ các ranh
giới sau.

### 5.1 Đặt bàn

`reservations` lưu:

- quán, mã đặt bàn dễ đọc và PIN ngắn dự phòng;
- Zalo User ID của người đặt;
- tên, số điện thoại Zalo, số khách, giờ đến và ghi chú;
- trạng thái và các mốc xác nhận/đến/no-show/hủy;
- phiên hoặc mâm được tạo khi khách đến;
- người thực hiện mỗi quyết định của quán.

Trạng thái chính:

`pending → confirmed → arrived → completed`

Nhánh kết thúc khác: `rejected`, `cancelled_by_customer`, `cancelled_by_store`, `no_show`.

`reservation_tables` lưu các bàn đã phân bổ và khoảng giữ dùng để kiểm tra trùng. Bàn chỉ được
khóa sau khi đặt bàn được xác nhận. Việc xác nhận bắt buộc chọn ít nhất một bàn.

`reservation_change_requests` lưu yêu cầu đổi giờ hoặc số người. Trong lúc chờ duyệt, lịch và
bàn cũ vẫn có hiệu lực. Khi chấp nhận, lịch mới và phân bổ mới thay thế nguyên tử; nếu từ chối,
đặt bàn cũ không đổi.

`reservation_events` giữ audit append-only cho tạo, xác nhận, từ chối, đổi, hủy, nhận khách,
no-show và các ngoại lệ do chủ quán thực hiện.

### 5.2 Đơn món

`orders` có liên kết tùy chọn tới đặt bàn và mở rộng nguồn đơn cho món đặt trước:

- Trước khi khách đến: đơn đặt trước có `reservation_id`, chưa có `session_id`.
- Sau khi nhận khách: đơn được nối vào phiên/mâm; không sao chép dòng món và không tạo đơn mới.
- Gọi thêm tại bàn tạo từng order batch mới trong cùng phiên/mâm.

Mỗi batch có mã chống gửi trùng. Mốc xác nhận/in bản gốc được lưu phía máy chủ. In lại là thao
tác riêng, có nhãn **In lại** và audit người thực hiện.

Món đặt trước được sửa hoặc rút khi POS chưa xác nhận/in. Sau đó khách chỉ có thể liên hệ quán.
Mọi thay đổi phải giữ lịch sử để tránh tranh chấp và không làm bếp nhận hai phiên bản.

### 5.3 Gọi nhân viên

`service_requests` là hàng đợi bền vững trên POS. Với mỗi bàn/phiên chỉ có một yêu cầu gọi nhân
viên đang mở; bấm lại cập nhật thời điểm nhắc nhưng không tạo hàng loạt bản ghi. Yêu cầu chỉ biến
mất sau khi nhân viên bấm **Đã xử lý**.

## 6. Luồng Mini App

### 6.1 Mở không có mã bàn

Mini App Bảo Lương hiển thị chức năng **Đặt bàn trước**, không mở Mang về/Ship.

Form bắt buộc: tên, số điện thoại Zalo, số khách, ngày và giờ đến. Ghi chú là tùy chọn. Tên và
số điện thoại được lưu cục bộ để điền nhanh lần sau.

Khách chỉ thấy giờ phục vụ hợp lệ theo các giới hạn ở mục 3.2. Mini App không công bố bàn nào
đang trống; mọi yêu cầu đều chờ chủ quán sắp xếp và xác nhận.

Sau khi gửi thành công, khách thấy mã đặt bàn, trạng thái và CTA tùy chọn **Nhận xác nhận qua
Zalo**. CTA mở chat OA bằng `openChat`, điền sẵn nội dung như “Tôi vừa đặt bàn mã BL-1234,
vui lòng gửi xác nhận tại đây”; khách phải tự bấm gửi. Có thể gọi `interactOA` để xin quyền nhận
thông báo nhưng không coi đó là bảo đảm tạo cửa sổ tương tác miễn phí.

### 6.2 Sau khi xác nhận

Khách nhận trạng thái thành công và hai lựa chọn:

- **Chọn món trước**: mở menu trong ngữ cảnh đặt bàn;
- **Gọi sau tại quán**: giữ đặt bàn, không tạo đơn món.

Trang **Đặt bàn của tôi** luôn hiển thị trạng thái từ Supabase, kể cả khi không nhận được OA/ZNS.

Khách được tự hủy nếu chưa nhận khách và chưa có món đặt trước đã xác nhận/in. Hủy giải phóng
bàn nhưng giữ lịch sử. Nếu bếp đã nhận món, Mini App yêu cầu khách liên hệ quán.

Đổi giờ hoặc số người sau xác nhận tạo yêu cầu thay đổi; lịch cũ không mất trong lúc chờ duyệt.

### 6.3 Quét QR tại bàn

Trước khi nhận khách, Mini App nhận diện người đặt bằng Zalo User ID; PIN đặt bàn là đường dự
phòng khi người khác trong đoàn quét. Nếu đúng đặt bàn nhưng chủ quán chưa bấm **Khách đã đến**,
Mini App báo đang chờ quán nhận khách và chỉ cung cấp **Gọi nhân viên**.

Sau khi nhận khách, QR của mọi bàn thuộc phiên/mâm đều mở cùng bill. Mọi khách có mặt tại các
bàn này được gọi thêm, không giới hạn ở tài khoản đã đặt hoặc người có PIN. Việc quét QR chỉ cấp
quyền tạo đơn chờ duyệt trong phiên đó; không cấp quyền sửa đặt bàn, xác nhận đơn hay đóng bill.

Mini App tách rõ:

- Món đã đặt trước;
- Các lượt đã gọi thêm và trạng thái từng lượt;
- Giỏ món đang chọn.

Nếu giỏ chứa món trùng với món đã gọi, Mini App cảnh báo số lượng đã có và hỏi khách có thực sự
muốn gọi thêm không. Khách được phép xác nhận vì gọi thêm món giống nhau là tình huống hợp lệ.
Sau khi gửi, Mini App hiện mã lượt và nguyên danh sách đã nhận để khách không bấm lại do thiếu
phản hồi.

## 7. Luồng POS

### 7.1 Hàng đợi đặt bàn

POS có danh sách chờ duyệt, đã xác nhận, sắp đến, quá giờ và đã kết thúc. Yêu cầu mới phát âm
báo và tồn tại qua refresh/reconnect.

Khi duyệt, POS hiển thị số khách và số bàn đề xuất. Chủ quán chọn bàn trên sơ đồ hiện có. Máy
chủ kiểm tra lại xung đột trước khi ghi xác nhận; UI không phải nguồn quyết định cuối.

Chủ quán được từ chối kèm lý do. Khách nhìn thấy trạng thái và lý do phù hợp, không thấy ghi chú
nội bộ.

### 7.2 Nhận khách và no-show

Tại giờ đến, POS hỏi lại mỗi 5 phút cho tới khi có hành động. Sau 30 phút, cảnh báo chuyển sang
mức nổi bật. Ba hành động chính:

- **Khách đã đến**;
- **Đổi giờ đến**;
- **Không đến**.

Không tự hủy và không tự no-show. Đánh dấu no-show giải phóng bàn nhưng giữ đặt bàn, audit và
các đơn đã xử lý để quán đối soát.

Nếu một bàn đã có phiên hoạt động khi nhận khách, hệ thống không ghi đè; chủ quán phải đóng phiên
cũ hoặc chọn bàn khác. Nếu khách hiện tại ngồi quá ba giờ và sắp có đặt bàn tiếp theo, POS chỉ
cảnh báo, không đóng bill hay tạo áp lực thời gian với khách.

### 7.3 Duyệt đơn và bếp

Mọi order batch mới xuất hiện trong hàng đợi POS. Chủ quán/thu ngân xác nhận và quyết định lúc
in hai liên. Chỉ đơn đã xác nhận mới thuộc luồng bếp.

Đơn đặt trước đã in trước khi khách đến chỉ được gắn vào phiên/mâm, không in lại. Đơn chưa in giữ
trạng thái chờ để chủ quán quyết định. Các lượt gọi thêm sau khi khách đến tiếp tục theo đúng cơ
chế xác nhận/in này.

POS và màn nhân viên không được đóng bill nếu còn order batch chưa được chủ quán xử lý. Nhân viên
không có quyền xác nhận/in/thu tiền; kiểm tra này phải nằm ở RPC/server, không chỉ ẩn nút UI.

## 8. Thông báo Zalo

Khi có đặt bàn mới, chủ quán nhận thông báo qua Zalo OA với CTA mở trang quản trị mobile đã đăng
nhập. Xác nhận/từ chối diễn ra trên admin web để giữ audit, không xử lý bằng OA postback. Web push
là dự phòng khi OA không gửi được hoặc thiết bị không ở cạnh POS.

Sau khi chủ quán xác nhận, hệ thống ưu tiên tin tư vấn OA miễn phí khi khách đủ điều kiện tương
tác; nếu không đủ điều kiện thì tự chuyển sang mẫu ZBS/ZNS trả phí phù hợp. Tin có mã đặt bàn,
giờ đến, số khách và CTA chọn món trước.

Việc khách gửi yêu cầu đặt bàn tự nó không được coi là một lượt tương tác OA. Chỉ khi khách chủ
động gửi tin, theo dõi OA hoặc thực hiện tương tác được Zalo công nhận mới làm mới cửa sổ tương
tác. Lỗi gửi tin không được rollback hoặc thay đổi trạng thái đặt bàn.

OA Bảo Lương và các template/mẫu tin cần được đăng ký, duyệt và liên kết trước pilot.

## 9. Tính nhất quán, idempotency và phục hồi

- Tạo đặt bàn, tạo order batch, xác nhận đặt bàn và nhận khách đều có khóa chống gửi lặp.
- Xác nhận đặt bàn khóa và kiểm tra trùng bàn trong cùng transaction.
- Chấp nhận thay đổi đặt bàn chỉ giải phóng phân bổ cũ sau khi phân bổ mới ghi thành công.
- Nhận khách tạo session/mâm và nối đơn đặt trước trong một thao tác nguyên tử hoặc có khả năng
  chạy lại an toàn.
- Supabase là nguồn sự thật. Sau reconnect, POS tải lại toàn bộ đặt bàn cần xử lý, đơn chờ duyệt
  và gọi nhân viên chưa đóng thay vì suy diễn từ cache.
- Âm báo có thể phát lại sau reconnect nhưng không được tạo bản ghi mới.
- Bàn/phiên đã thu tiền không thể nhận thêm đơn; RPC từ chối kể cả khi client cũ vẫn còn mở.
- Mọi lỗi nghiệp vụ trả thông báo tiếng Việt có hành động tiếp theo, không để khách hoặc thu ngân
  phải đoán trạng thái.

## 10. Thứ tự triển khai

### Sprint BL-0 — Ổn định quy trình Bảo Lương

- POS subscribe và quản lý hàng đợi Gọi nhân viên.
- Bắt buộc xác nhận đơn trước khi xuống bếp.
- Chặn đóng bill khi còn đơn chưa xử lý.
- Siết quyền chủ quán/thu ngân so với nhân viên.
- Sửa nhãn bàn của phiên quá hạn còn nợ.
- Thêm cấu hình theo quán; tắt Mang về/Ship cho Bảo Lương.
- Làm sạch trạng thái worktree/deploy Mini App Bảo Lương và đồng bộ tài liệu liên quan.

### Sprint BL-1 — Nền tảng đặt bàn

- Schema, RLS, RPC và audit cho đặt bàn, phân bổ bàn, đổi/hủy/no-show.
- Tính slot 15 phút theo giờ phục vụ, giới hạn 30 phút/7 ngày.
- Kiểm tra trùng lịch ba giờ và ngoại lệ tạo tay trên POS.
- Nhận khách tạo một phiên hoặc một mâm đúng một lần.

### Sprint BL-2 — POS đặt bàn và thông báo chủ quán

- Hàng đợi đặt bàn, gợi ý số bàn và chọn bàn trên POS hiện có.
- Nhắc mỗi 5 phút, cảnh báo trễ 30 phút và xử lý no-show.
- Giao diện admin mobile cho CTA từ OA; web push dự phòng.
- Hàng đợi món đặt trước và audit xác nhận/in.

### Sprint BL-3 — Mini App đặt bàn và gọi món liên tục

- Entry đặt bàn khi không có mã bàn.
- Theo dõi, OA chat, đổi/hủy và chọn món trước.
- Nhận diện đặt bàn bằng Zalo ID/PIN trước khi nhận khách.
- QR nhiều bàn cùng mâm, mọi khách được gọi thêm.
- Lịch sử lượt món, xác nhận gửi và cảnh báo món trùng.

### Sprint BL-4 — Liên thông và pilot

- Kiểm thử đa thiết bị, reconnect, gửi lặp và race condition.
- Kiểm thử đặt trước đã in/chưa in, nhiều bàn, đổi/hủy/no-show và khách ở quá ba giờ.
- Kiểm thử OA miễn phí/ZBS-ZNS fallback và tình huống gửi thất bại.
- Cập nhật AGENTS, PRD, ARCHITECTURE, tiến trình và hướng dẫn vận hành/deploy Bảo Lương.

Không tự chuyển Sprint. Sau mỗi Sprint phải dừng và chờ anh Tú xác nhận PASS.

## 11. Quy ước file kiểm thử

Không nối thêm checklist dài vào `TESTING.md`. Mỗi Sprint Bảo Lương tạo một file riêng:

- `docs/testing/bao-luong/SPRINT-BL-0.md`
- `docs/testing/bao-luong/SPRINT-BL-1.md`
- `docs/testing/bao-luong/SPRINT-BL-2.md`
- `docs/testing/bao-luong/SPRINT-BL-3.md`
- `docs/testing/bao-luong/SPRINT-BL-4.md`

File của Sprint được tạo/cập nhật khi hoàn thành code Sprint đó, gồm điều kiện chuẩn bị, test tự
động Codex đã chạy, checklist thao tác của anh Tú, kết quả mong đợi và mẫu báo lỗi. `TESTING.md`
chỉ thêm một dòng liên kết và trạng thái PASS/FAIL để làm mục lục, không chứa checklist mới.

## 12. Tiêu chí hoàn thành toàn bộ

1. Mini App không mã bàn đặt được bàn và theo dõi được trạng thái mà không cần xem OA.
2. Chủ quán xác nhận được trên điện thoại hoặc POS, bắt buộc chọn bàn, khách nhận được thông báo
   khi kênh Zalo đủ điều kiện.
3. Nhiều bàn chuyển thành một mâm/một bill; mọi QR trong mâm gọi thêm đúng phiên.
4. Món đặt trước và gọi thêm không bị sao chép hoặc in trùng; khách thấy rõ từng lượt đã gửi.
5. Bếp không nhận bất kỳ đơn nào trước khi chủ quán/thu ngân xác nhận.
6. Không thể đóng bill khi còn đơn chưa xử lý; nhân viên không thể lách quyền bằng gọi RPC.
7. Nhắc đến giờ, no-show, đổi/hủy, xung đột bàn và reconnect hoạt động đúng, có audit.
8. Bảo Lương không còn bất kỳ entry Mang về/Ship nào nhưng Mini App chính vẫn có giá trị sử dụng
   độc lập nhờ chức năng đặt bàn.
9. Từng Sprint có file kiểm thử riêng và đã được anh Tú xác nhận PASS trước khi chuyển Sprint.
