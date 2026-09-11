# Bảo Lương — POS kiểm soát đơn, đặt bàn trước và gọi món liên tục

Ngày: 2026-09-10

Trạng thái: đã cập nhật sau đối chiếu code/DB và duyệt quyết định vận hành với anh Tú

Quán áp dụng đầu tiên: Bia lẩu Bảo Lương (`bia-lau-bao-luong`)

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
6. Trạng thái trong Supabase là nguồn sự thật; điện thoại, OA và ZNS chỉ là kênh thông báo.
7. Mọi khác biệt với Pubu phải được biểu diễn bằng cấu hình theo quán, không bằng nhánh hardcode
   theo slug, để sau này chủ quán có thể chọn mô hình vận hành trong Admin Web.

## 2. Ngoài phạm vi

- Không hiển thị sơ đồ hoặc trạng thái bàn trống cho khách.
- Không cho hệ thống tự xác nhận đặt bàn, tự chọn bàn hoặc tự đánh dấu no-show.
- Không dùng khoảng lập kế hoạch ba giờ để giới hạn thời gian ăn hoặc tự đóng phiên.
- Không tự động hẹn giờ in món đặt trước.
- Không xây thuật toán bàn liền kề; chủ quán dùng sơ đồ POS hiện có để chọn bàn phù hợp.
- Không triển khai lấy số điện thoại tự động qua `getPhoneNumber` ở giai đoạn này.
- Bảo Lương không có luồng Mang về hoặc Ship.
- Không có PIN hoặc mã đặt bàn dễ đọc cho khách nhập.
- Không có lịch nghỉ đặc biệt theo ngày; ngày nghỉ đột xuất do chủ quán hủy thủ công và báo khách.
- Không xây web push trong pilot.

## 3. Quyết định nghiệp vụ đã chốt

### 3.1 Vai trò

| Vai trò | Được làm | Không được làm |
|---|---|---|
| Khách | Đặt bàn, theo dõi, yêu cầu đổi/hủy, đặt món trước, gọi thêm, gọi nhân viên | Xác nhận đơn, in bếp, sửa bill, đóng bill |
| Nhân viên | Đặt món hộ, xem bàn/mâm/bill, hỗ trợ ghép mâm, xử lý gọi nhân viên | Xác nhận/in đơn, thu tiền, đóng bill |
| Chủ quán/thu ngân | Duyệt đặt bàn, chọn bàn, nhận khách, duyệt/in món, no-show, sửa và thu bill | — |

Trong pilot, chủ quán Bảo Lương chính là thu ngân; hệ thống chưa tạo role `cashier` riêng. POS ở
quầy là nguồn quyết định vận hành. Mọi đơn từ QR, đặt trước hoặc nhân viên đều phải chờ chủ
quán xác nhận trước khi thuộc luồng bếp. Chủ quán quyết định lúc in hai liên. Bảo Lương không dùng
Kitchen Display; "xuống bếp" trong tài liệu này nghĩa là POS đã xác nhận và chủ quán có thể in
phiếu bếp.

### 3.2 Cấu hình theo quán

Mỗi quán có cấu hình độc lập:

- `table_ordering_enabled`
- `reservations_enabled`
- `reservation_preorder_enabled`
- `takeaway_enabled`
- `shipping_enabled`
- `minimum_advance_minutes`
- `booking_horizon_days`
- `slot_interval_minutes`
- `default_table_capacity`
- `planning_hold_minutes`
- `kitchen_release_policy`
- `staff_order_release_policy`
- `open_ordering_on_arrival`
- `table_session_idle_timeout_minutes`
- `reservation_preorder_edit_cutoff_minutes`

Giá trị cho Bảo Lương:

| Cấu hình | Giá trị |
|---|---:|
| Gọi món tại bàn | Bật |
| Đặt bàn | Bật |
| Đặt món trước theo booking | Bật |
| Mang về | Tắt hoàn toàn |
| Ship | Tắt hoàn toàn |
| Đặt trước tối thiểu | 30 phút |
| Khoảng ngày được chọn | 7 ngày tới |
| Bước chọn giờ | 15 phút |
| Sức chứa mặc định | 6 người/bàn |
| Khoảng kiểm tra trùng nội bộ | 3 giờ |
| Đơn QR/đặt trước xuống bếp | Chờ POS xác nhận |
| Đơn nhân viên xuống bếp | Chờ POS xác nhận |
| Mọi khách trong phiên được gọi thêm | Bật |
| Phiên tự hết hạn an toàn | 6 giờ không hoạt động |
| Khóa khách sửa/hủy món đặt trước | Trước giờ đến 30 phút |

Các cấu hình này thuộc store/capability, có default giữ nguyên hành vi hiện tại của Pubu. Kiểm tra
quyền và quy trình phải nằm trong DB/RPC; giao diện chỉ phản ánh kết quả. Admin Web phải cho chủ
quán cấu hình trực tiếp ngay trong phạm vi thiết kế này, không hoãn sang phase sau.

Giờ phục vụ là danh sách ca phẳng áp dụng giống nhau cho mọi ngày. Giờ khách chọn phải nằm trong
giờ phục vụ đã cấu hình. Không có override theo thứ/ngày nghỉ. Chủ quán vẫn được tạo đặt bàn thủ
công ngoài giới hạn 30 phút/7 ngày/slot/giờ phục vụ trên POS; thao tác ngoại lệ phải lưu người thực
hiện. `is_accepting_orders` chỉ chặn nhận đơn tại thời điểm hiện tại, không chặn đặt bàn tương lai;
việc nhận đặt bàn dùng `reservations_enabled` riêng.

Số bàn đề xuất là `ceil(số khách / 6)`. Hệ thống chỉ đề xuất số lượng; chủ quán chọn bàn thật
trên sơ đồ POS để bảo đảm các bàn phù hợp và nằm gần nhau. Pilot không thêm sức chứa riêng cho
từng bàn; con số 6 chỉ là gợi ý vận hành và không được dùng để tự động phân bàn.

### 3.3 Admin Web — Cấu hình quy trình vận hành

Trang `/admin/settings` được tổ chức thành hai khu rõ ràng: **Thông tin quán** giữ form hiện có và
**Quy trình vận hành** chứa cấu hình nghiệp vụ. Không nhồi toàn bộ vào một form lưu chung; mỗi khu
có trạng thái lưu/lỗi riêng để lỗi ảnh hoặc thông tin quán không làm mất thay đổi quy trình.

Khu **Quy trình vận hành** chia thành các nhóm tiếng Việt:

1. **Kênh nhận đơn**: Tại bàn, Mang về, Ship, Đặt bàn trước và Đặt món trước theo booking.
2. **Duyệt đơn và bếp**: đơn QR, đơn nhân viên và món đặt trước tự xuống bếp hay chờ POS xác nhận.
3. **Đặt bàn**: số phút đặt trước tối thiểu, số ngày được chọn, bước giờ, sức chứa gợi ý và khoảng
   giữ bàn để kiểm tra trùng.
4. **Phiên bàn/mâm**: cho mọi khách gọi thêm và số giờ không hoạt động trước khi hết hạn an toàn.
5. **Món đặt trước**: số phút trước giờ đến bắt đầu khóa khách sửa/hủy.

Giao diện không hiển thị tên cột/policy kỹ thuật. Các trường phụ thuộc được ẩn hoặc khóa kèm giải
thích; ví dụ tắt Đặt bàn thì nhóm giới hạn đặt bàn không cho sửa, nhưng giá trị cũ vẫn được giữ để
khi bật lại không phải nhập lại. Đặt món trước chỉ bật được khi Đặt bàn đang bật. Các số phải có
giới hạn hợp lệ do server kiểm tra; UI không cho nhập số âm, horizon bằng 0, sức chứa bằng 0 hoặc
timeout phiên ngắn hơn 60 phút.

Có ba lựa chọn điền nhanh:

- **Trả trước như Pubu**: bật Tại bàn/Mang về/Ship, tắt Đặt bàn, trả trước và đơn hợp lệ tự vào
  bếp, không bắt buộc POS xác nhận.
- **POS kiểm soát như Bảo Lương**: trả sau, tắt Mang về/Ship, bật Đặt bàn, mọi nguồn đơn chờ POS,
  mở gọi chung khi nhận khách và phiên hết hạn sau 6 giờ không hoạt động.
- **Tùy chỉnh**: chỉnh từng mục.

Preset chỉ điền một bộ giá trị vào form và cho chủ quán xem lại trước khi lưu; hệ thống không lưu
`preset` như một mode riêng để tránh cấu hình thực tế lệch nhãn. Nếu toàn bộ giá trị trùng một
preset, UI có thể hiển thị nhãn nhận biết; chỉ các trường cụ thể mới là nguồn sự thật.

`store_owner` chỉ đọc/sửa quán mình. `mevo_superadmin` có thể mở cùng bộ cấu hình cho quán được
chọn từ cockpit MEVO. Nhân viên không được xem các bí mật hoặc sửa quy trình. Mọi lần lưu ghi audit
gồm snapshot cũ/mới, người sửa, thời gian và nguồn `owner`/`mevo`; không cho client ghi thẳng bảng.

Các thay đổi an toàn áp dụng cho yêu cầu mới ngay sau khi lưu. Tắt Đặt bàn chỉ ngăn booking mới,
không hủy booking đã tồn tại. Thay đổi có thể làm đổi xử lý giữa ca — trả trước/trả sau, chính sách
xuống bếp, quyền gọi chung hoặc timeout phiên — bị RPC từ chối khi còn phiên hoạt động hay đơn chờ
xử lý, kèm thông báo cụ thể cần đóng/xử lý gì. Giới hạn đặt bàn được snapshot vào booking lúc tạo để
đổi cấu hình sau này không thay lời hứa đã cấp cho khách.

## 4. Kiến trúc được chọn

Đặt bàn là một lớp độc lập với phiên bàn đang hoạt động. Xác nhận đặt bàn chỉ giữ các bàn trong
lịch tương lai; không mở sẵn `table_session` và không tạo mâm đang phục vụ.

Khi chủ quán bấm **Khách đã đến**:

- một bàn tạo phiên bàn với `is_open_ordering = true`;
- nhiều bàn tạo mâm chung bill bằng cơ chế mâm hiện có;
- mọi bàn trong mâm đều mở gọi thêm cho mọi khách;
- mọi đơn đặt trước được gắn vào phiên/mâm vừa tạo;
- đơn đã in không được tự in lại;
- thao tác là idempotent: bấm lại chỉ mở kết quả đã tạo, không sinh phiên hoặc bill thứ hai.

Cách tách này tránh để phiên tương lai lẫn với phiên đang phục vụ, không chịu cơ chế hết hạn của
phiên hiện tại và vẫn tái sử dụng toàn bộ logic bàn/mâm/bill sau khi khách đến.

`table_session` là hồ sơ kỹ thuật của một lượt khách đang dùng bàn/mâm: nó gom đặt món trước,
gọi thêm QR, đơn nhân viên và món POS vào một bill. Phiên bắt đầu khi bấm **Khách đã đến**, kết
thúc bình thường khi thu tiền/đóng bàn, và chỉ tự hết hạn an toàn sau **6 giờ không có hoạt động**
nếu quán quên đóng. Gọi món, xác nhận đơn hoặc sửa bill đều làm mới mốc hoạt động. Đây không phải
giới hạn thời gian ăn và không được dùng để giục khách.

## 5. Mô hình dữ liệu logic

Tên bảng/cột cuối cùng được đối chiếu với schema thật khi lập kế hoạch, nhưng phải giữ các ranh
giới sau.

### 5.1 Cấu hình quy trình

Tạo `store_workflow_settings` quan hệ 1–1 với `stores`, dùng các cột có kiểu dữ liệu và CHECK rõ
ràng cho capability/policy mới ở mục 3.2. Không dùng một JSONB tự do vì DB/RPC phải kiểm tra được
tổ hợp hợp lệ. Các trường hiện đã là nguồn sự thật trên `stores` như `payment_timing`,
`payment_methods`, `is_accepting_orders` và `serving_hours` chưa nhân đôi sang bảng mới.

Một RPC `update_store_workflow_settings` nhận toàn bộ snapshot form, khóa row, kiểm tra quyền,
kiểm tra tổ hợp phụ thuộc và dữ liệu đang hoạt động, rồi cập nhật `stores` và
`store_workflow_settings` trong cùng transaction. RPC đồng thời thêm một dòng append-only vào
`store_workflow_setting_events` với `before`, `after`, người sửa và nguồn thao tác. Không có trạng
thái lưu dở một nửa giữa hai bảng.

Mini App/POS đọc một public-safe view hoặc RPC trả cấu hình hợp nhất; không được tự ghép default ở
nhiều client. Kết quả không chứa audit, thông tin operator hoặc bí mật merchant. Migration backfill
Pubu và Bảo Lương bằng giá trị đã chốt trước khi chuyển client sang nguồn mới, sau đó test ma trận
hai quán để tránh hồi quy. Vì chưa có quán pilot đang vận hành thực tế, rollout chuyển thẳng sang
nguồn mới trong BL-0 và không duy trì dual-write/compatibility layer kéo dài.

### 5.2 Đặt bàn

`reservations` lưu:

- quán và ID nội bộ không hiển thị;
- Zalo User ID tham chiếu của người đặt, nhưng không coi giá trị do client gửi là bằng chứng xác thực;
- tên, số điện thoại Zalo, số khách, giờ đến và ghi chú;
- trạng thái và các mốc xác nhận/đến/no-show/hủy;
- phiên hoặc mâm được tạo khi khách đến;
- người thực hiện mỗi quyết định của quán;
- `client_request_id` để chống tạo lặp;
- snapshot các giới hạn/cutoff có ảnh hưởng tới quyền đã cấp cho khách;
- các trường `requested_arrival_at`, `requested_party_size`, `change_note` cho tối đa một yêu cầu
  đổi đang chờ, thay cho một bảng change-request riêng trong pilot.

Trạng thái chính:

`pending → confirmed → arrived → completed`

Nhánh kết thúc khác: `rejected`, `cancelled_by_customer`, `cancelled_by_store`, `no_show`.

`reservation_tables` lưu các bàn đã phân bổ và khoảng giữ dùng để kiểm tra trùng. Bàn chỉ được
khóa sau khi đặt bàn được xác nhận. Việc xác nhận bắt buộc chọn ít nhất một bàn.

Trong lúc yêu cầu đổi chờ duyệt, lịch và bàn cũ vẫn có hiệu lực. Khi chấp nhận, lịch mới và phân
bổ mới thay thế nguyên tử; nếu từ chối, đặt bàn cũ không đổi. Chi tiết thay đổi nằm trong
`reservation_events`, chưa tạo bảng `reservation_change_requests` riêng cho pilot.

`reservation_events` giữ audit append-only cho tạo, xác nhận, từ chối, đổi, hủy, nhận khách,
no-show và các ngoại lệ do chủ quán thực hiện.

Booking `arrived` chuyển `completed` khi phiên/mâm liên kết được thu tiền. `staff_reset` không
được tự suy ra là hoàn tất đặt bàn. Booking quá giờ vẫn `pending` cho tới khi chủ quán đóng tay;
hệ thống không tự hủy hoặc tự no-show.

### 5.3 Đơn món

Đơn đặt trước được tạo qua RPC riêng, không ép đi qua `create_order` hiện tại:

- dùng `order_type = 'dine_in'`, `order_source = 'reservation_preorder'`, thanh toán sau bằng
  `cash` cho Bảo Lương;
- trước khi khách đến: có `reservation_id`, chưa có `table_id` và `session_id`;
- Sau khi nhận khách: đơn được nối vào phiên/mâm; không sao chép dòng món và không tạo đơn mới.
- Gọi thêm tại bàn tạo từng order batch mới trong cùng phiên/mâm.

RPC đặt món trước xác thực booking đã được xác nhận và kiểm tra **giờ đến** nằm trong giờ phục vụ;
không gọi `store_accepting_now` theo thời điểm khách chọn món. `create_order` bình thường vẫn giữ
kiểm tra hiện tại để không làm thay đổi Pubu. Migration phải điều chỉnh ràng buộc `dine_in` để chỉ
cho phép thiếu bàn/phiên khi có `reservation_id` hợp lệ và đúng nguồn đặt trước.

Mỗi batch có `client_request_id` chống gửi trùng. Mốc xác nhận và yêu cầu in bản gốc được lưu
phía máy chủ. In lại là thao tác riêng, có nhãn **In lại** và audit người thực hiện. Trình duyệt
không thể chứng minh giấy đã ra khỏi máy in; hệ thống chỉ cam kết audit lệnh in/in lại.

Khách được sửa hoặc hủy món đặt trước đến trước giờ đến 30 phút, kể cả chủ quán đã xác nhận hoặc
in. Từ mốc đó, phía khách bị khóa sửa/hủy vì bếp có thể đã chuẩn bị và chỉ có thể gọi quán. Chủ
quán vẫn được xử lý ngoại lệ trên POS; mọi phiên bản, lệnh in lại, hao hụt do hủy/no-show và người
thực hiện phải có audit để bếp không nhận hai phiên bản không phân biệt được. Chủ quán được phép
in trước khi khách đến dù chưa có cọc; POS phải cảnh báo rủi ro nhưng không chặn.

Khi booking bị hủy/no-show, các đơn chưa in chuyển trạng thái kết thúc và không treo `pending`.
Đơn đã in được giữ để đối soát hao hụt, không đưa vào bill của khách khác và không tự hoàn tác việc
bếp đã làm.

### 5.4 Gọi nhân viên

`service_requests` là hàng đợi bền vững trên POS, có `resolved_at`, `resolved_by`, `last_ping_at`
và scope. Sau khi nhận khách, một mâm/phiên chỉ có một yêu cầu đang mở dù gồm nhiều bàn; trước khi
nhận khách có thể gắn với reservation; bàn thường dùng table/session hiện có. Partial unique index
ngăn nhiều yêu cầu mở cùng scope. Khách anon chỉ gọi RPC ping có rate limit; không được INSERT
tự do hoặc UPDATE. Nhân viên/chủ quán có policy/RPC **Đã xử lý**. Bấm lại chỉ cập nhật
`last_ping_at`, không tạo hàng loạt bản ghi.

## 6. Luồng Mini App

### 6.1 Mở không có mã bàn

Mini App Bảo Lương hiển thị menu ở chế độ chỉ đọc và chức năng **Đặt bàn trước**, không mở
Mang về/Ship. Core không được suy diễn "không có table = takeaway"; nó phải parse thành ngữ cảnh
`root` hoặc `table`, sau đó chọn tính năng theo capability của quán. Pubu tiếp tục có takeaway
nhờ cấu hình, không phụ thuộc nhánh riêng theo slug.

Form bắt buộc: tên, số điện thoại Zalo, số khách, ngày và giờ đến. Ghi chú là tùy chọn. Tên và
số điện thoại được lưu cục bộ để điền nhanh lần sau.

Khách chỉ thấy giờ phục vụ hợp lệ theo các giới hạn ở mục 3.2. Mini App không công bố bàn nào
đang trống; mọi yêu cầu đều chờ chủ quán sắp xếp và xác nhận.

Sau khi gửi thành công, khách thấy tóm tắt và trạng thái, không thấy mã/PIN phải ghi nhớ. CTA tùy
chọn **Nhận xác nhận qua Zalo** mở chat OA bằng `openChat`, điền sẵn nội dung như “Tôi vừa đặt
bàn, vui lòng gửi xác nhận tại đây”; khách phải tự bấm gửi. Có thể gọi `interactOA` để xin quyền
nhận thông báo nhưng không coi đó là bảo đảm tạo cửa sổ tương tác miễn phí.

Trang quản lý booking dùng capability token ngẫu nhiên do server phát và/hoặc phiên Zalo đã được
xác minh phía server; không tin trực tiếp `zalo_user_id` do client gửi. Token kỹ thuật không hiển
thị và không cho người quét QR bàn đọc thông tin cá nhân của người đặt.

### 6.2 Sau khi xác nhận

Khách nhận trạng thái thành công và hai lựa chọn:

- **Chọn món trước**: mở menu trong ngữ cảnh đặt bàn;
- **Gọi sau tại quán**: giữ đặt bàn, không tạo đơn món.

Trang **Đặt bàn của tôi** luôn hiển thị trạng thái từ Supabase, kể cả khi không nhận được OA/ZNS.
Nếu booking còn pending quá giờ đến, trang báo rõ **Quán chưa xác nhận — đặt bàn chưa được bảo
đảm** và hiển thị nút gọi điện cho quán. Booking quá giờ không tự đóng và không cho khách tự
chuyển trạng thái kết thúc; chủ quán xử lý đóng tay.

Khách được tự hủy booking trước giờ đến nếu không có món đặt trước đã khóa/chuẩn bị. Riêng món đặt
trước được sửa/hủy tới mốc 30 phút trước giờ đến. Sau mốc này, Mini App khóa sửa/hủy món và yêu
cầu gọi quán, không phụ thuộc món đã in hay chưa. Hủy booking hợp lệ giải phóng bàn nhưng giữ lịch
sử; các trường hợp còn lại do chủ quán xử lý tay.

Đổi giờ hoặc số người sau xác nhận tạo yêu cầu thay đổi; lịch cũ không mất trong lúc chờ duyệt.

### 6.3 Quét QR tại bàn

Nếu bàn đang được phân cho booking nhưng chủ quán chưa bấm **Khách đã đến**, bất kỳ ai quét QR
cũng thấy: **Bàn đã được đặt trước. Vui lòng báo chủ quán để mở bàn.** Màn hình chỉ cung cấp
**Gọi nhân viên**. Không dùng PIN, mã booking hoặc nhận diện người đặt để vượt qua bước này.

Sau khi nhận khách, QR của mọi bàn thuộc phiên/mâm đều mở cùng bill. Mọi khách có mặt tại các
bàn này được gọi thêm, không giới hạn ở tài khoản đã đặt. Việc quét QR chỉ cấp
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
chủ kiểm tra lại xung đột với cả booking đã phân bổ và `table_session` đang mở trước khi ghi xác
nhận; UI không phải nguồn quyết định cuối. Booking trùng nhau bị chặn. Phiên đang mở gần giờ đến
hiển thị cảnh báo và yêu cầu chủ quán chọn bàn khác hoặc ghi nhận ngoại lệ; khi bấm **Khách đã
đến**, máy chủ kiểm tra lại và tuyệt đối không ghi đè phiên cũ.

Chủ quán được từ chối kèm lý do. Khách nhìn thấy trạng thái và lý do phù hợp, không thấy ghi chú
nội bộ.

### 7.2 Nhận khách và no-show

Tại giờ đến, POS gom các booking quá giờ vào một thông báo và nhắc lại mỗi 5 phút cho tới khi có
hành động. Chủ quán có thể Snooze toàn nhóm hoặc từng booking 10/15/30 phút. Một chu kỳ chỉ phát
một tiếng chuông dù có nhiều booking; danh sách vẫn hiển thị từng khách. Sau 30 phút, cảnh báo
chuyển sang mức nổi bật. Ba hành động chính:

- **Khách đã đến**;
- **Đổi giờ đến**;
- **Không đến**.

Không tự hủy và không tự no-show. Đánh dấu no-show giải phóng bàn nhưng giữ đặt bàn, audit và
các đơn đã xử lý để quán đối soát.

Nếu một bàn đã có phiên hoạt động khi nhận khách, hệ thống không ghi đè; chủ quán phải đóng phiên
cũ hoặc chọn bàn khác. Khoảng lập kế hoạch ba giờ chỉ dùng phát hiện lịch phân bổ gần nhau; POS
chỉ cảnh báo, không đóng bill hay tạo áp lực thời gian với khách.

### 7.3 Duyệt đơn và bếp

Mọi order batch mới xuất hiện trong hàng đợi POS. Với Bảo Lương, chủ quán xác nhận và quyết định
lúc in hai liên. Chỉ đơn đã xác nhận mới thuộc luồng bếp. `orderInKitchen()` phải đọc chính sách
theo store: Pubu/prepay và các quán không bật cổng POS giữ hành vi hiện tại; Bảo Lương áp dụng cổng
xác nhận cho cả QR, đặt trước và đơn nhân viên.

Đơn đặt trước đã in trước khi khách đến chỉ được gắn vào phiên/mâm, không in lại. Đơn chưa in giữ
trạng thái chờ để chủ quán quyết định. Các lượt gọi thêm sau khi khách đến tiếp tục theo đúng cơ
chế xác nhận/in này.

POS và màn nhân viên không được đóng bill nếu còn order batch do khách/nhân viên tạo mà chưa được
chủ quán xử lý. Món tay `order_source = 'pos'` đã chủ quán chủ động thêm không bị cổng này chặn.
Nhân viên không có quyền xác nhận/in/thu tiền/đóng bàn hoặc `staff_reset`; kiểm tra role phải nằm
ở RPC/server, không chỉ ẩn nút UI.

## 8. Thông báo Zalo

Khi có đặt bàn mới, chủ quán nhận thông báo qua Zalo OA với CTA mở trang quản trị mobile đã đăng
nhập. Xác nhận/từ chối diễn ra trên admin web để giữ audit, không xử lý bằng OA postback. Muốn OA
nhắn đúng chủ quán, onboarding phải lưu người nhận thông báo theo store/OA: chủ quán follow OA,
gửi tin mở hội thoại, hệ thống lấy đúng OA-scoped user ID và gửi tin thử thành công.

Sau khi chủ quán xác nhận, hệ thống ưu tiên tin tư vấn OA miễn phí khi khách đủ điều kiện tương
tác. ZNS chỉ được dùng khi Bảo Lương đã nâng gói/có mẫu được duyệt và API thật trả thành công;
không tuyên bố tự động fallback nếu chưa có tích hợp đó. Tin có giờ đến, số khách và CTA chọn món
trước. Kết quả API Zalo phải được kiểm tra; Edge Function không được trả thành công giả khi Zalo
từ chối.

Việc khách gửi yêu cầu đặt bàn tự nó không được coi là một lượt tương tác OA. Chỉ khi khách chủ
động gửi tin, theo dõi OA hoặc thực hiện tương tác được Zalo công nhận mới làm mới cửa sổ tương
tác. Lỗi gửi tin không được rollback hoặc thay đổi trạng thái đặt bàn. Số điện thoại là kênh vận
hành chính trong pilot: mọi booking card trên POS có nút `tel:` và khách luôn thấy nút gọi quán
khi cần. Với booking đã xác nhận, hệ thống tạo nhắc khách trước giờ đến **60 phút**; nếu OA/ZNS
không đủ điều kiện, POS tạo tác vụ gọi điện thay vì coi là đã gửi.

Zalo App ID Bảo Lương đã tồn tại nhưng app chưa hoàn tất xác minh/xét duyệt/phát hành; OA và các
template/mẫu tin chưa sẵn sàng. Các thủ tục này phải khởi động song song từ BL-0 vì có thời gian
chờ bên ngoài hệ thống.

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
- Mọi thời điểm lưu trong PostgreSQL bằng `timestamptz` UTC. Slot, giờ phục vụ, cutoff 30 phút,
  nhắc 60 phút và hiển thị đều được tính theo `Asia/Ho_Chi_Minh`; server sinh hoặc xác thực slot,
  không tin slot do client tự tính.
- PIN/mã dễ đọc không tồn tại. Capability token quản lý booking phải đủ ngẫu nhiên, có phạm vi
  tối thiểu, có thể thu hồi và không lộ qua QR bàn/log/UI.
- Đơn đặt trước bị hủy/no-show phải vào trạng thái kết thúc rõ ràng; không để order thiếu session
  treo `pending` vĩnh viễn.
- Xác nhận/in dùng các RPC idempotent và audit riêng; hệ thống phân biệt **In lần đầu** với
  **In lại**, nhưng không cam kết biết trạng thái vật lý của giấy.
- Mọi lỗi nghiệp vụ trả thông báo tiếng Việt có hành động tiếp theo, không để khách hoặc thu ngân
  phải đoán trạng thái.

## 10. Giữ hồi quy và cấu hình nhiều mô hình quán

Không nhánh nghiệp vụ nào được dựa vào slug Bảo Lương/Pubu. Các default migration phải giữ hành
vi đang chạy của Pubu, đặc biệt:

- Pubu tiếp tục Mang về và prepay theo cấu hình hiện tại.
- Pubu không bị bắt chờ POS xác nhận nếu không bật policy tương ứng.
- Đơn nhân viên ở quán chọn tự động vẫn vào bếp theo chính sách cũ.
- Core parse entry `root`/`table`; store capability quyết định root mở takeaway, đặt bàn hay menu
  chỉ đọc.
- Cấu hình số học có default dùng chung; chưa cần UI cho từng cờ trong pilot, nhưng Admin Web sau
  này có thể bật/tắt/chọn policy theo quán.

Mỗi policy phải có test ma trận ít nhất cho Pubu và Bảo Lương để chứng minh một quán đổi quy trình
không làm quán kia đổi theo.

## 11. Thứ tự triển khai

### Sprint BL-0 — Ổn định quy trình Bảo Lương

- POS subscribe và quản lý hàng đợi Gọi nhân viên.
- Bắt buộc xác nhận đơn trước khi xuống bếp.
- Chặn đóng bill khi còn đơn chưa xử lý.
- Siết quyền chủ quán/thu ngân so với nhân viên.
- Sửa nhãn bàn của phiên quá hạn còn nợ.
- Tạo `store_workflow_settings`, RPC lưu nguyên tử, audit và public-safe config reader.
- Thêm khu **Quy trình vận hành** cùng ba lựa chọn điền nhanh vào `/admin/settings`; mở cùng cấu
  hình theo store từ cockpit MEVO.
- Backfill policy/capability với default giữ Pubu; áp preset Bảo Lương để tắt Mang về/Ship và bật
  cổng POS.
- Sửa core parse entry `root`/`table`, không suy diễn root thành takeaway.
- Khởi động xác minh/xét duyệt Mini App và đăng ký OA Bảo Lương song song.
- Làm sạch trạng thái deploy Mini App Bảo Lương và đồng bộ tài liệu liên quan.

### Sprint BL-1 — Nền tảng đặt bàn

- Schema, RLS, RPC và audit cho đặt bàn, phân bổ bàn, đổi/hủy/no-show; dùng trường yêu cầu đổi
  trên reservation, chưa tạo bảng change-request riêng.
- Tính slot 15 phút theo giờ phục vụ, giới hạn 30 phút/7 ngày.
- Kiểm tra timezone, trùng lịch ba giờ, phiên đang mở và ngoại lệ tạo tay trên POS.
- Nhận khách tạo một phiên/mâm mở gọi chung đúng một lần; hết hạn sau 6 giờ không hoạt động.

### Sprint BL-2 — POS đặt bàn và thông báo chủ quán

- Hàng đợi đặt bàn, gợi ý số bàn và chọn bàn trên POS hiện có.
- Nhắc gộp mỗi 5 phút, Snooze 10/15/30, cảnh báo trễ 30 phút và đóng/no-show thủ công.
- Giao diện admin mobile duyệt đặt bàn; nút gọi điện và onboarding người nhận OA theo store.
- Hàng đợi món đặt trước; duyệt/in món chỉ ở POS gắn máy in, có audit in/in lại.

### Sprint BL-3 — Mini App đặt bàn và gọi món liên tục

- Entry root có menu chỉ đọc và đặt bàn; Bảo Lương không có Mang về/Ship.
- Theo dõi bằng token an toàn, OA chat, đổi/hủy và chọn món trước.
- Khóa khách sửa/hủy món từ 30 phút trước giờ đến; xử lý vòng đời đơn hủy/no-show.
- QR bàn đã giữ yêu cầu báo chủ quán mở bàn, không dùng PIN/mã đặt bàn.
- QR nhiều bàn cùng mâm, mọi khách được gọi thêm.
- Lịch sử lượt món, xác nhận gửi và cảnh báo món trùng.

### Sprint BL-4 — Liên thông và pilot

- Kiểm thử đa thiết bị, capability token, reconnect, gửi lặp và race condition.
- Kiểm thử đặt trước đã in/chưa in, nhiều bàn, đổi/hủy/no-show và khách ở quá ba giờ.
- Kiểm thử Pubu/Bảo Lương theo ma trận policy; xác nhận không hồi quy prepay/takeaway.
- Kiểm thử OA miễn phí/ZNS khi thực sự khả dụng và tình huống gửi thất bại.
- Cập nhật AGENTS, PRD, ARCHITECTURE, tiến trình và hướng dẫn vận hành/deploy Bảo Lương.

Không tự chuyển Sprint. Sau mỗi Sprint phải dừng và chờ anh Tú xác nhận PASS.

## 12. Quy ước file kiểm thử

Không nối thêm checklist dài vào `TESTING.md`. Mỗi Sprint Bảo Lương tạo một file riêng:

- `docs/testing/bao-luong/SPRINT-BL-0.md`
- `docs/testing/bao-luong/SPRINT-BL-1.md`
- `docs/testing/bao-luong/SPRINT-BL-2.md`
- `docs/testing/bao-luong/SPRINT-BL-3.md`
- `docs/testing/bao-luong/SPRINT-BL-4.md`

File của Sprint được tạo/cập nhật khi hoàn thành code Sprint đó, gồm điều kiện chuẩn bị, test tự
động Codex đã chạy, checklist thao tác của anh Tú, kết quả mong đợi và mẫu báo lỗi. `TESTING.md`
chỉ thêm một dòng liên kết và trạng thái PASS/FAIL để làm mục lục, không chứa checklist mới.

## 13. Tiêu chí hoàn thành toàn bộ

1. Mini App không mã bàn đặt được bàn và theo dõi được trạng thái mà không cần xem OA.
2. Chủ quán duyệt đặt bàn được trên điện thoại hoặc POS và bắt buộc chọn bàn; duyệt/in đơn món
   chỉ ở POS; khách nhận được thông báo khi kênh Zalo đủ điều kiện.
3. Nhiều bàn chuyển thành một mâm/một bill; mọi QR trong mâm gọi thêm đúng phiên.
4. Món đặt trước và gọi thêm không bị sao chép hoặc in trùng; khách thấy rõ từng lượt đã gửi.
5. Với Bảo Lương, bếp không nhận bất kỳ đơn QR/đặt trước/nhân viên nào trước khi chủ quán xác
   nhận; Pubu giữ hành vi theo cấu hình cũ.
6. Không thể đóng bill khi còn đơn chưa xử lý; nhân viên không thể lách quyền bằng gọi RPC.
7. Nhắc đến giờ, no-show, đổi/hủy, xung đột bàn và reconnect hoạt động đúng, có audit.
8. Bảo Lương không còn bất kỳ entry Mang về/Ship nào nhưng Mini App root vẫn có giá trị độc lập
   nhờ menu chỉ đọc và chức năng đặt bàn.
9. Từng Sprint có file kiểm thử riêng và đã được anh Tú xác nhận PASS trước khi chuyển Sprint.
10. Khách sửa/hủy món đặt trước được tới trước giờ đến 30 phút, sau đó bị khóa; chủ quán vẫn xử
    lý ngoại lệ có audit và được in sớm dù chưa có cọc.
11. Booking quá giờ không tự hủy; POS nhắc gộp có Snooze và khách được nhắc trước 60 phút.
12. Phiên Bảo Lương kết thúc khi đóng bill hoặc tự hết hạn sau 6 giờ không hoạt động, không dùng
    timeout để giới hạn thời gian ăn.
13. Chủ quán cấu hình được quy trình tại `/admin/settings`, MEVO cấu hình được theo store; mọi lần
    lưu qua RPC có audit, validation phụ thuộc và không tạo trạng thái nửa cũ/nửa mới.
14. Preset Pubu/Bảo Lương chỉ điền giá trị xem trước; các cột policy cụ thể là nguồn sự thật và
    thay đổi nguy hiểm giữa ca bị chặn khi còn phiên/đơn đang hoạt động.
