# Bảo Lương BL-4 — Pilot readiness và hardening liên thông

Ngày: 2026-09-24

Trạng thái: dự thảo để duyệt trước khi lập implementation plan

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
3. Chuẩn hóa trạng thái lỗi vận hành mà POS/cockpit đã có thành hướng dẫn phản ứng ngắn, có thể
   thực hiện trong giờ cao điểm.
4. Viết checklist pilot E2E đa thiết bị, ma trận không hồi quy Pubu/Bảo Lương, runbook deploy,
   rollback và kiểm tra sau deploy.
5. Chỉ sửa code khi kiểm thử tìm ra khoảng trống thực tế; mỗi sửa lỗi có regression test riêng.

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

- Mọi thao tác retry phải idempotent; retry không tạo reservation, preorder batch, order, session,
  mâm hoặc tin nhóm thứ hai.
- Bất kỳ trạng thái relay nào cũng không được rollback booking hoặc làm hàng đợi POS biến mất.
- Mọi quyết định thay đổi tiền, bàn, in món hoặc đóng bill phải tiếp tục được server kiểm quyền
  theo `store_id` và role; UI không phải hàng rào duy nhất.
- Booking đã xác nhận giữ ưu tiên 60 phút trước giờ đến. QR bị khóa cả khi một session cũ còn mở;
  POS không tự ý đóng session đó.

## 4. Các workstream kỹ thuật

### A. Contract và race-condition database

Mở rộng bộ PGlite hiện có theo một ma trận cross-flow thay vì chỉ test từng RPC riêng lẻ:

| Tình huống | Kết quả bắt buộc |
| --- | --- |
| Hai tab xác nhận/nhận khách cùng booking | đúng một session/mâm, audit nhất quán |
| Retry create booking/preorder/QR order | trả kết quả cũ, không dòng trùng |
| Hủy/no-show cạnh tranh với nhận khách/release preorder | không orphan order, không mất audit, không deadlock |
| Đổi giờ/bàn lúc vào cửa sổ khóa 60 phút | projection POS/QR nhìn cùng một trạng thái khóa |
| Đơn pending bị confirm/reject từ hai tab | chỉ một kết quả cuối, không in/làm trừ bill hai lần |
| Operator khác quán/staff/anon gọi RPC | bị từ chối ở server, không lộ dữ liệu |

Không tạo API test mở cho anon hay dữ liệu pilot thật. Test trực tiếp migration/RPC trong harness
hiện hữu và sử dụng fixture cô lập theo quán.

### B. Đồng bộ nhiều thiết bị

Các watcher hiện có dùng Realtime, focus/online refresh và polling dự phòng (reservation queue là
2 giây). BL-4 xác nhận hợp đồng này tại các màn vận hành thực tế:

- POS `/admin/cashier`, `/admin/reservations` và Admin Mobile nhận tạo/đổi/xử lý booking;
- hàng đợi service request và đơn QR không yêu cầu F5;
- một tab nền, socket rớt hoặc mạng quay lại vẫn hội tụ về snapshot server;
- snapshot cũ không ghi đè event mới trong lúc tải lại.

Nếu phát hiện watcher thiếu fallback hoặc cleanup sai, sửa watcher chung và thêm unit test cho
thứ tự event. Không tạo thêm kênh Realtime cho Bảo Lương nếu polling an toàn đã đủ.

### C. Relay ZCA best-effort và quan sát vận hành

Giữ giao thức HMAC, idempotency `notification_id`, allow-list group theo store và payload tối
thiểu của BL-2B. BL-4 kiểm thử và tài liệu hóa các kết quả sau:

| Relay trả về | Delivery | Hành động vận hành |
| --- | --- | --- |
| `ok: true` | `sent` | mở link nhóm hoặc POS để xử lý |
| timeout/`BOT_OFFLINE`/429/5xx | `failed` | dùng POS/Admin Mobile ngay; kiểm bot rồi retry cùng delivery nếu cần |
| `GROUP_NOT_FOUND`/`INVALID_REQUEST`/`PROVIDER_REJECTED` | `action_required` | không retry vòng lặp; kiểm cấu hình/allow-list hoặc tắt channel |
| channel tắt/`none` | không tạo delivery | POS/Admin Mobile là đường xử lý duy nhất |

Cockpit MEVO chỉ hiển thị trạng thái rút gọn, mã lỗi, thời điểm gửi cuối và hành động an toàn;
không lộ Group ID đầy đủ, HMAC secret, bot session, access token hoặc dữ liệu khách.

**Không thêm retry daemon tự động trong BL-4.** Retry tự động khi không có hàng đợi bền/giới hạn
phát tin rõ ràng có nguy cơ spam nhóm. Khi cần, MEVO superadmin gửi lại đúng delivery theo cơ chế
idempotent sau khi xác minh bot.

### D. Runbook và gate pilot

BL-4 tạo một tài liệu vận hành riêng, ngắn và theo thứ tự ca làm:

1. Kiểm tra trước ca: POS online, máy in, cấu hình Bảo Lương, nhóm Thông báo nội bộ và bot.
2. Xử lý booking mới: mở POS/Admin Mobile, xác nhận/chọn bàn; Zalo chỉ là lời nhắc.
3. Xử lý món đặt trước: duyệt/in hai liên, theo dõi mục đã duyệt/in hôm nay; không mở Kitchen.
4. Xử lý khách đến/no-show/bàn đã giữ/gọi thêm/từ chối món.
5. Sự cố: mất relay, bot mất phiên, mất Realtime, mất mạng, máy in lỗi, deploy thất bại.
6. Rollback: dừng deploy Mini App, chọn lại bản Testing trước trên Zalo; Vercel rollback deployment;
   migration database không rollback xóa dữ liệu mà chỉ dùng migration sửa tiếp sau khi đã backup
   và xác nhận ảnh hưởng.

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

BL-4 chỉ đạt khi toàn bộ hàng Bảo Lương và regression Pubu liên quan đều pass trên code đã deploy,
không chỉ local test.

## 6. Trình tự triển khai dự kiến

1. **Task 1 — Baseline & contract suite:** chốt fixture/matrix, thêm regression database và
   watcher tests; ghi bằng chứng tự động.
2. **Task 2 — Resilience fixes:** chỉ sửa các gap do Task 1 chứng minh; test realtime/retry/race
   và ZCA failure taxonomy.
3. **Task 3 — Runbook + deployment readiness:** viết hướng dẫn vận hành/deploy/rollback, kiểm tra
   secrets/config không lộ browser và checklist chuẩn bị pilot.
4. **Task 4 — E2E pilot rehearsal:** deploy Testing đúng instance Bảo Lương, chạy kịch bản đa
   thiết bị, relay-off và regression Pubu; tổng hợp evidence và nợ kỹ thuật còn lại.

Mỗi task dừng để anh Tú test theo file riêng trong `docs/testing/bao-luong/SPRINT-BL-4.md` trước
khi sang task tiếp theo. Khi anh Tú trả lời PASS, task đó được commit ngay.

## 7. Tiêu chí hoàn thành Sprint

1. Không còn lỗi phải F5 để nhận booking, đơn QR hoặc service request trên các màn vận hành đã
   cam kết; fallback polling vẫn hoạt động khi socket không hoạt động.
2. Không tạo bản ghi/bill/in/tin relay trùng ở các retry và race chính nêu tại mục 4A.
3. Relay ZCA lỗi không ảnh hưởng reservation/POS; cockpit và runbook chỉ rõ người vận hành phải
   làm gì, không phụ thuộc OA trả phí.
4. Bảo Lương không có Kitchen Display trong quy trình; hai liên giấy đều có giá/tổng và nhãn khác
   để không phát nhầm.
5. Regression Pubu chứng minh prepay, Mang về/Ship, order tự xuống Kitchen vẫn giữ nguyên.
6. Tài liệu deploy/rollback và checklist pilot đủ để chuyển máy/ca làm mà không cần nhớ ngầm.

