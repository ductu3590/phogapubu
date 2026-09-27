# Bảo Lương BL-4 — Pilot readiness và hardening liên thông

Ngày: 2026-09-24

Trạng thái: **SPEC BL-4 PASS** — anh Tú duyệt ngày 2026-09-27; chuyển sang lập implementation plan.

Biên bản đối chiếu sáu nhận xét và bằng chứng: [Review BL-4](../../testing/bao-luong/REVIEW-BL-4-2026-09-27.md).

## 1. Mục tiêu

BL-3 đã hoàn thành luồng nghiệp vụ: khách đặt bàn, quán xác nhận/chọn bàn, khách có thể gửi
món trước, POS duyệt/in hai liên, khóa bàn một giờ trước giờ đến, nhận khách vào mâm/bill và
khách gọi thêm qua QR. BL-4 không thêm một luồng bán hàng mới. Mục tiêu là chứng minh luồng đó
vẫn vận hành được khi có nhiều thiết bị, mạng chập chờn, thao tác lặp, relay Zalo nội bộ lỗi hoặc
nhân viên cần chuyển sang cách xử lý thủ công.

**Nguồn sự thật vẫn là Supabase + POS.** Nhóm Zalo nội bộ chỉ là cảnh báo best-effort; khách
không nhận ZCA/Zalo OA/ZNS trong pilot. Điện thoại của quán là fallback liên hệ khách.

## 2. Phạm vi và ranh giới

### Trong phạm vi

1. Bổ sung các kiểm thử integration/contract còn thiếu cho booking, preorder, khóa bàn, session
   mâm, đơn QR và quyền theo quán.
2. Bổ sung kiểm thử chịu lỗi cho realtime/polling, retry request của khách và outbox relay ZCA.
3. Bổ sung phục hồi delivery thủ công cho MEVO superadmin: RPC requeue có audit, bảo vệ worker
   cũ, hiển thị đủ queued/processing và cảnh báo kẹt trên cockpit. Đây là tính năng BL-4 mới,
   chưa có trong BL-2B. Phụ thuộc relay thật đáp ứng hợp đồng chống trùng ở mục 4C.
4. Viết checklist pilot E2E đa thiết bị, ma trận không hồi quy Pubu/Bảo Lương, runbook deploy,
   rollback và kiểm tra sau deploy.
5. Sửa ngay lỗi queue mất cập nhật khi load chậm và bổ sung đồng bộ sơ đồ bàn POS ở Task 1;
   mỗi sửa lỗi phải có regression test tái hiện trước khi sửa.

### Ngoài phạm vi

- Không đưa Kitchen Display vào quy trình Bảo Lương. Món chỉ xuống bếp bằng **phiếu giấy hai
  liên** do owner duyệt/in từ POS.
- Không dùng Zalo OA Open API, ZNS, hoặc zca-js để gửi khách; không tự xác nhận booking qua tin
  nhắn.
- Không thêm thanh toán/cọc, tự sắp bàn, hiển thị bàn trống, hay màn hình Timeline POS prototype.
- Không đổi hành vi prepay, Mang về/Ship hoặc Kitchen của Pubu.

## 3. Mô hình vận hành cần được bảo vệ

```text
Khách Mini App
  -> reservation pending
  -> POS/Admin Mobile: xác nhận + chọn bàn
  -> (tùy chọn) khách gửi một batch món đặt trước, đã chốt
  -> POS: xác nhận & in hai liên, không Kitchen Display
  -> 60 phút trước giờ đến: QR/POS khóa bàn
  -> "Khách đã đến": mở session/mâm/bill
  -> QR tại mọi bàn trong mâm: gọi thêm -> POS duyệt/in
  -> owner đóng bill

Song song, không quyết định trạng thái:
reservation created -> ZCA outbox -> relay bot -> nhóm Thông báo nội bộ
```

Quy tắc bất biến:

- Retry nghiệp vụ không tạo reservation, preorder batch, order, session hoặc mâm thứ hai.
  Chống gửi tin nhóm trùng phụ thuộc dedup bền vững ở relay, không suy ra từ outbox DB. Không
  hứa exactly-once ở Zalo hoặc máy in vật lý; tình huống kết quả gửi/in không rõ phải đối soát.
- Bất kỳ trạng thái relay nào cũng không được rollback booking hoặc làm hàng đợi POS biến mất.
- Mọi quyết định thay đổi tiền, bàn, in món hoặc đóng bill phải tiếp tục được server kiểm quyền
  theo `store_id` và role; UI không phải hàng rào duy nhất.
- Booking đã xác nhận giữ ưu tiên 60 phút trước giờ đến. QR bị khóa cả khi một session cũ còn mở;
  POS không tự ý đóng session đó.

## 4. Các workstream kỹ thuật

### A. Contract và race-condition database

**Chọn hai lớp kiểm thử riêng.** PGlite một kết nối chỉ kiểm lifecycle tuần tự/idempotency;
race và deadlock phải chạy PostgreSQL thật với ít nhất hai kết nối độc lập vào cùng database.

| Lớp | Tình huống | Bằng chứng |
| --- | --- | --- |
| PGlite | retry create booking/preorder/QR order, nhận khách lần hai, từ chối lần hai | cùng kết quả hoặc lỗi nghiệp vụ hợp lệ, không thêm bản ghi/audit |
| PGlite | lifecycle hủy/no-show, khóa bàn 60 phút, quyền theo role/quán | snapshot/tổng tiền/quyền đúng sau từng bước tuần tự |
| PostgreSQL | hai transaction xác nhận/nhận khách cùng booking | một kết quả cuối nhất quán, một session/mâm |
| PostgreSQL | hủy/no-show cạnh tranh nhận khách/release preorder | không orphan, giữ audit; kiểm từng thứ tự tranh khóa |
| PostgreSQL | đổi giờ/bàn cạnh tranh QR tạo đơn | áp đúng kiểm tra dưới khóa; không lọt vào bàn/phiên sai |
| PostgreSQL | confirm/reject cùng order | chỉ một quyết định cuối; không release hoặc trừ bill hai lần |

Môi trường mặc định là Supabase local/PostgreSQL test cô lập với migrations và role tương ứng.
Có thể dùng branch test được cấu hình riêng; không chạy fault injection trên production. Dùng
barrier/`FOR UPDATE` để buộc transaction thứ hai chờ khi thứ nhất chưa commit; ghi backend PID,
trạng thái chờ khóa và kết quả. `pg_sleep` chỉ hỗ trợ tạo khoảng chờ, không tự nó chứng minh race.
Chạy cả hai thứ tự đối với thao tác đối nghịch; có `lock_timeout`/`statement_timeout` và cleanup.
Không đổi RPC production để chèn sleep. Rà thứ tự khóa bổ trợ test, không thay cho test.

Harness PGlite hiện có có bảng/hàm stub (ví dụ test 077); phải phân biệt test contract cục bộ với
test liên thông migration thật. Nếu không có PostgreSQL test, ghi BLOCKED cho nhóm concurrency,
không lấy PGlite PASS thay thế và không tuyên bố đã chứng minh mọi deadlock đều bất khả thi.

### B. Đồng bộ nhiều thiết bị

Hiện trạng đã đối chiếu code (không coi bảng này là hành vi đã sửa):

| Thành phần | Poll hiện tại | Reconnect/focus/online | Khoảng trống |
| --- | --- | --- | --- |
| `reservation-queue-watcher.ts` | 2s | subscribe + focus + online | poll cũng tăng revision, load >2s có thể bị bỏ mãi |
| `service-request-queue.ts` | 2s | subscribe; component POS gắn focus bên ngoài | cùng lỗi revision; chưa có online/visibility trong watcher |
| `cashier-session-watcher.ts` | 5s | subscribe; chưa có focus/online | reload chồng lấn, response cũ có thể ghi đè mới |
| Poll preorder / gọi nhắc trong `cashier-client.tsx` | 5s / 15s | preorder có focus | cần tính cả vào tải server và kiểm tra đường reload ngoài watcher |

**Task 1 bắt buộc sửa ba watcher được nêu đích danh và các call site reload liên quan.** Chính
sách hidden/backoff và phép đo budget bao gồm cả hai poll preorder/gọi nhắc tại POS. Hợp đồng:

- Một lượt load đang chạy cho mỗi nguồn dữ liệu; poll không vô hiệu hóa kết quả đang tải.
  Event được gom thành nhu cầu tải lại; không giữ vòng tải liên tục đến khi có một khoảng yên.
- Dùng lịch poll sau khi lượt tải hoàn tất để không dồn request. Snapshot thành công được áp;
  event trong lúc tải yêu cầu thêm một lượt có giới hạn. Response cũ không được ghi đè snapshot
  mới hơn hoặc phục hồi card vừa resolve thành công. Mutation tại chỗ là mốc vô hiệu hóa riêng,
  không gộp với tick poll. Các reload từ nút thao tác phải đi qua cùng cơ chế điều phối.
- Focus, online và chuyển visible kích hoạt tải lại, gộp các event trùng; dispose gỡ listener/timer
  và chặn callback muộn. Lỗi tải giữ dữ liệu cuối và hiện lỗi, không xóa lỗi thao tác của owner.
- Test fake timers + deferred promises: load mất 5s khi poll 2s vẫn áp kết quả; lỗi load chậm
  vẫn hiển thị; event liên tục không làm màn hình đứng; resolve/confirm giữa lúc load không bị
  snapshot cũ phục hồi; không chồng request, không chuông lặp sau reconnect.

**Tab nền và ngân sách request:** browser có thể throttle timer tab ẩn xuống khoảng một lần/phút
trong một số điều kiện, hoặc đóng băng tab; không cam kết chuông tối đa 5s hay trần 60s ở tab nền.
`SUBSCRIBED` chỉ thể hiện kênh kết nối, không chứng minh event đã qua RLS. Đo trên Chrome thực tế
với visible, hidden >5 phút, minimized và quay lại; ghi thời gian cập nhật lẫn chuông, browser,
chế độ tiết kiệm điện. Runbook yêu cầu POS ở cửa sổ hiển thị riêng, không thu nhỏ, mở khóa âm thanh
và tránh sleep thiết bị trong ca; tab riêng nhưng bị che/ẩn không bảo đảm timer.

Giữ fallback visible ban đầu 2s/2s/5s; hidden dùng tối thiểu 30s, lỗi backoff 5/10/20/30s,
online/visible cho phép phục hồi sớm. Không tắt poll chỉ vì socket báo SUBSCRIBED. Mục tiêu visible
với load <=1s: hai queue <=5s, sơ đồ bàn <=7s; đây là tiêu chí cần đo, chưa là kết quả đã đạt.

Hai poll 2s tương đương 3.600 lượt load/giờ/tab nếu chạy đều, tức 28.800/ca 8h. Cộng poll sơ đồ
bàn/preorder/gọi nhắc đang có: khoảng 5.280/giờ hay 42.240/8h, chưa tính init, event và thao tác.
Đây là ước tính số load, không phải hóa đơn Vercel. Task 1 đo số HTTP/server action/RPC thực tế.
Budget idle visible của năm nguồn này <=88 lượt load/phút/tab, hidden <=10; lỗi không tăng tải,
sự kiện được gom và báo riêng. Nếu vượt, xử lý nguồn gọi trùng trước khi giảm độ tươi dữ liệu.
Runbook ước lượng theo số tab và giờ ca; chưa thêm leader election đa tab trong sprint này.

### C. Relay ZCA best-effort và quan sát vận hành

Hiện tại claim chỉ nhận `queued`, webhook chỉ chạy AFTER INSERT; chưa có RPC/action requeue.
Cockpit chỉ đọc delivery mới nhất và chuyển queued/processing thành null. BL-4 bổ sung phục hồi
thủ công, không mô tả đó là tính năng có sẵn và không thêm retry daemon tự động. Phần này thay
cho mô tả retry/backoff dự kiến ở mục 6 của design BL-2B ngày 2026-09-22; mô tả cũ không là
bằng chứng đã triển khai retry.

| Trạng thái/kết quả | Hiển thị và xử lý trong BL-4 |
| --- | --- |
| `queued` | đang chờ; quá 120s từ lần enqueue gần nhất: chậm/kẹt, chưa biết có gửi chưa |
| `processing` | đang gửi; quá 120s từ claim: quá hạn xử lý, kết quả gửi có thể chưa rõ |
| `sent` | gửi thành công; không có nút gửi lại; không đồng nghĩa owner đã đọc |
| `failed` (timeout/BOT_OFFLINE/429/5xx) | dùng POS ngay; retry thủ công sau kiểm tra, không mặc định là chưa gửi |
| `action_required` (group/request/provider lỗi) | kiểm cấu hình/đối soát; không tự retry; được retry có điều kiện sau xử lý nguyên nhân |
| channel tắt/none | không enqueue mới; delivery cũ vẫn hiển thị; cấm requeue/claim mới |

Ngưỡng 120s là để nhận diện quá hạn, không chứng minh worker cũ đã chết. Cockpit có danh sách
phân trang các delivery lỗi/kẹt theo quán, tuổi trạng thái, số lần thử và mã lỗi rút gọn; delivery
sent mới không che delivery lỗi cũ. Không trả dispatch token, group ID đầy đủ, payload hay secret
ra browser. Lỗi provider hiển thị theo allow-list, không in thẳng nội dung provider vào UI/log.

Hợp đồng RPC requeue mới:

1. Superadmin được kiểm ở action **và DB**; khóa delivery theo ID/store, kiểm trạng thái/thời điểm
   còn khớp khi bấm, channel còn bật và destination khớp snapshot cũ. Cấm sent và queued/processing
   chưa hết hạn; không chuyển tin cũ sang nhóm mới. Chỉ booking còn pending mới được nhắc lại; booking
   đã xử lý/quá giờ thì owner xem trực tiếp POS. Tin test được phân biệt rõ với booking thật.
2. Giữ delivery ID, idempotency key, destination và nội dung snapshot tối thiểu từ lần gửi đầu.
   Requeue cập nhật queued-at, cấp dispatch token mới để worker cũ không claim/finish lần thử mới;
   finish token cũ phải không có hiệu lực và handler không báo thành công nếu finish trả false.
   Ghi audit người/lý do/thời điểm/trạng thái trước-sau; request requeue lặp không tạo thêm lượt.
3. Đổi webhook thành một đường dispatch cho INSERT queued và UPDATE tái-enqueue có token mới;
   không để trigger + server action cùng gửi. Nếu pg_net/Edge lỗi, delivery vẫn queued và được
   phát hiện qua tuổi trạng thái. Request HTTP đã được enqueue không được coi là đã giao tin.
4. Cooldown 60s, tối đa 3 lượt requeue thủ công/delivery và cửa sổ retry 24h từ tạo. Quá hạn thì
   chỉ đối soát/POS; không tạo delivery mới để né giới hạn. Delivery cũ không có snapshot/dedup
   evidence phải hiện không đủ điều kiện gửi lại, không dựng lại nội dung có thể đã thay đổi.

**Dedup ở relay là điều kiện bắt buộc để mở retry:** lưu bền `notification_id` tối thiểu 48h,
claim nguyên tử khi request đồng thời, kiểm store/group/payload nhất quán, trả lại kết quả cũ
khi lặp. Retry phải dùng cùng ID và payload. Nếu provider đã nhận nhưng relay chết trước khi lưu
kết quả, đánh dấu chưa rõ để đối soát, không gửi lại mù. Timeout 20s của MEVO không hủy chắc chắn
thao tác gửi phía bot. Fencing ở DB không thể ngăn worker cũ đang chạy phía relay gửi tin.

Kiểm thử bắt buộc: relay gửi xong nhưng mất HTTP response, retry cùng ID; hai request đồng thời;
restart relay rồi retry; worker cũ finish sau requeue; queued không được dispatch và processing
không finish. Mock chỉ chứng minh contract MEVO; cần evidence từ relay thật/nhóm test riêng trước
khi bật nút retry. Repo này chưa chứng minh dedup của server bot. Nếu chưa đạt, khóa retry, hiển
thị lỗi/kẹt và dùng POS; ghi nhóm nghiệm thu relay chưa đạt, không ghi PASS toàn bộ BL-4.

Giữ HMAC ký raw bytes và allow-list theo quán. Tắt channel chỉ chặn lượt mới, không thu hồi tin
đã gửi hoặc bảo đảm dừng được một request đang ở provider.

### D. Runbook và gate pilot

BL-4 tạo một tài liệu vận hành riêng, ngắn và theo thứ tự ca làm:

1. Kiểm tra trước ca: POS online, máy in, cấu hình Bảo Lương, nhóm Thông báo nội bộ và bot.
2. Xử lý booking mới: mở POS/Admin Mobile, xác nhận/chọn bàn; Zalo chỉ là lời nhắc.
3. Xử lý món đặt trước: duyệt/in hai liên, theo dõi mục đã duyệt/in hôm nay; không mở Kitchen.
4. Xử lý khách đến/no-show/bàn đã giữ/gọi thêm/từ chối món.
5. Sự cố: mất relay, bot mất phiên, mất Realtime, mất mạng, máy in lỗi, deploy thất bại.
6. Sự cố bản phát hành: công tắc server theo đúng luồng là cách giảm ảnh hưởng trước; admin
   rollback về deployment còn tương thích DB. Mini App chỉ phục hồi production khi bản phục hồi
   thực sự được Publish; chọn Testing cũ không đổi bản khách dùng. Không hứa thời gian phục hồi
   tức thì hoặc số giờ duyệt cố định; kiểm trạng thái/version trong Console tại thời điểm deploy.
   Database sửa tiến bằng migration tương thích, không down migration xóa dữ liệu booking/bill.

**Thứ tự deploy bắt buộc:** migration tương thích ngược -> Edge Function nếu có thay đổi ->
admin-web -> Mini App Testing -> nghiệm thu Testing -> gửi duyệt/Publish -> smoke test QR thật.
Giữ chữ ký RPC cũ hoặc wrapper tương thích cho bản Mini App đang Publish; thử payload cũ trên DB
mới trước khi deploy client mới, đặc biệt create_order. Ghi commit, migrations, Edge/admin build,
Mini App ID và version theo môi trường; không coi code main là bản đã Publish.

**Hai cổng nghiệm thu:** Testing dùng QR/link có env/version đúng, điện thoại có quyền tester.
Sau Publish, quét QR bàn thực tế không có env/version bằng tài khoản khách không là tester; kiểm
đúng version rồi chạy booking -> preorder -> nhận khách -> QR gọi thêm -> POS. Không dùng QR
Testing thay thế bước này. `admin-web/lib/qr.ts` hỗ trợ env/version qua biến cấu hình; phải đọc
URL QR thực tế, không mặc định tất cả QR admin đều là production. Không đổi biến QR toàn admin
dùng chung để test riêng Bảo Lương làm QR Pubu bị trỏ sang Testing.

**Công tắc vận hành:** `is_accepting_orders` là tạm dừng nhận món tức thời theo luật server,
không mặc định chặn đặt bàn ngày mai/preorder hoặc mọi phiên cũ. Dừng booking mới bằng
`reservations_enabled`, đồng thời tắt `reservation_preorder_enabled` theo constraint cấu hình;
dừng preorder mới bằng cờ riêng; chặn QR mới bằng `table_ordering_enabled`; relay bằng channel.
Runbook phải ghi phạm vi tác động được kiểm bằng RPC trực tiếp, quyền thao tác và cách bật lại.
Booking/bill đã tồn tại vẫn phải xem và xử lý được. Nếu RPC cho client cũ lọt công tắc thì đó là
lỗi cần sửa trước khi gọi công tắc ấy là phương án phục hồi, không chỉ ẩn nút UI.

Checklist test Sprint BL-4 phải tách ba lớp: automated evidence, E2E trên điện thoại thật, và
diễn tập vận hành. Không ghi checklist dài vào `TESTING.md`; file đó chỉ liên kết tới Sprint file.

## 5. Ma trận acceptance bắt buộc

| Nhóm | Bảo Lương | Pubu |
| --- | --- | --- |
| Kênh root | Menu chỉ đọc + đặt bàn; QR theo policy | Mang về/Ship theo cấu hình hiện có |
| Đơn QR | POS release, owner confirm/reject/in, không Kitchen | prepay/automatic/kitchen giữ nguyên |
| Đặt bàn/preorder | đầy đủ lifecycle, một batch chốt | không xuất hiện nếu không bật capability |
| Relay ZCA | best-effort, lỗi không chặn POS | không gửi mặc định |
| Quyền | owner Bảo Lương thao tác; staff/khác quán bị chặn | giữ ma trận quyền hiện có |

BL-4 có hai trạng thái riêng: **Testing PASS** và **Pilot ready sau Publish**. Chỉ chốt BL-4 PASS
khi đủ evidence tự động, PostgreSQL đồng thời, relay, Testing và QR Publish thật. Chờ Zalo duyệt
được ghi WAITING_PUBLISH, không coi là lỗi code và không đánh dấu đã sẵn sàng đón khách.

## 6. Trình tự triển khai dự kiến

1. **Task 1 — Watcher mạng chậm và POS:** test tái hiện starvation, sửa hai queue và watcher sơ
   đồ bàn/call site; focus/online/visibility, cleanup, không gọi chồng; đo budget request.
2. **Task 2 — Database contract và concurrency:** PGlite tuần tự tách PostgreSQL hai kết nối;
   fixture/migration thật, kiểm khóa và sửa lỗi được chứng minh. Không bỏ qua test thiếu môi trường.
3. **Task 3 — Phục hồi Thông báo nội bộ:** migration/RPC requeue, fencing/audit, dispatch, cockpit
   lỗi/kẹt và kiểm dedup relay; không có retry tự động; nghiệm thu khả năng gửi lại riêng.
4. **Task 4 — Runbook và tương thích phát hành:** test RPC client cũ, công tắc server, thứ tự
   deploy/rollback, budget và hướng dẫn ca làm; cập nhật AGENTS/PRD/ARCHITECTURE/tiến trình.
5. **Task 5 — Diễn tập và Publish:** 5A Testing đa thiết bị, tab nền, relay lỗi và Pubu; 5B QR bàn
   Publish bằng khách thật sau xét duyệt. Ghi evidence và giới hạn chưa kiểm, không trộn hai gate.

Mỗi task dừng để anh Tú test theo file riêng trong `docs/testing/bao-luong/SPRINT-BL-4.md` trước
khi sang task tiếp theo. Khi anh Tú trả lời PASS, task đó được commit ngay.

## 7. Tiêu chí hoàn thành Sprint

1. Tab visible hội tụ không cần F5 cả khi load chậm hơn poll/socket không có event; tab nền có
   số đo và hướng dẫn vận hành thực tế, không có cam kết độ trễ bất khả thi.
2. Test tuần tự và đồng thời có evidence riêng; không nhân đôi bản ghi/bill hoặc quyết định
   release. Tin nhóm dựa trên dedup relay đã kiểm; in vật lý/kết quả gửi mơ hồ có bước đối soát.
3. Relay ZCA lỗi không ảnh hưởng reservation/POS; cockpit và runbook chỉ rõ người vận hành phải
   làm gì, không phụ thuộc OA trả phí.
4. Bảo Lương không có Kitchen Display trong quy trình; hai liên giấy đều có giá/tổng và nhãn khác
   để không phát nhầm.
5. Regression Pubu chứng minh prepay, Mang về/Ship, order tự xuống Kitchen vẫn giữ nguyên.
6. Runbook đủ cho chuyển ca/máy: thứ tự deploy tương thích ngược, công tắc server đã kiểm,
   Testing và QR Publish nghiệm thu riêng, request budget và cách xử lý delivery kẹt.
