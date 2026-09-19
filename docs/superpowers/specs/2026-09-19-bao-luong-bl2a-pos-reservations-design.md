# Bảo Lương BL-2A — POS và Admin Mobile quản lý đặt bàn

Ngày chốt: 2026-09-19  
Trạng thái: **Đã duyệt hướng tách BL-2A/BL-2B/BL-2C**

## 1. Mục tiêu

Biến nền reservation của BL-1 thành công cụ vận hành thật cho chủ quán trên hai màn hình:

- `/admin/cashier`: POS tại quầy, nhìn queue đặt bàn cùng sơ đồ bàn và phiên đang mở;
- `/admin/reservations`: giao diện mobile-first để chủ quán duyệt và xử lý booking khi không ngồi
  trước POS.

BL-2A kết thúc ở việc quản lý booking và nhận khách. Không gửi OA/ZNS và chưa xử lý món đặt trước.

## 2. Phạm vi tách Sprint

| Nhánh | Phạm vi | Thời điểm |
|---|---|---|
| BL-2A | Queue đặt bàn, chọn bàn, tạo/đổi tay, gọi điện, nhận khách/no-show, nhắc và Snooze | Làm ngay |
| BL-2B | Onboarding Zalo UID người nhận theo đúng OA của quán và thông báo cho chủ quán | Khi OA/credential sẵn sàng |
| BL-2C | Queue preorder, duyệt/in/in lại có audit ở POS | Cùng hoặc ngay sau BL-3 |

Không đưa dependency giả hoặc nút vô hiệu của BL-2B/2C vào UI BL-2A.

## 3. Nguồn dữ liệu và quyền

- Supabase `reservations`, `reservation_tables`, `reservation_events` là source of truth.
- Chỉ `store_owner` đúng quán được ra quyết định. `store_staff`, anon và owner quán khác không
  được xác nhận, đổi lịch/bàn, Snooze, nhận khách hoặc no-show dù gọi RPC trực tiếp.
- UI không gửi `store_id` tùy ý cho thao tác trên một reservation; RPC lấy store từ row đã khóa
  và kiểm actor. RPC list nhận store nhưng vẫn kiểm operator scope.
- Không có nhánh theo slug. Các quán tắt `reservations_enabled` không hiện mục vận hành đặt bàn;
  direct URL vẫn fail-closed.
- `arrive_reservation` BL-1 tiếp tục là đường duy nhất biến booking thành session/mâm. Hàm này
  idempotent nên bấm lặp hoặc hai máy cùng bấm không sinh hai bill.

## 4. Queue vận hành

Queue trả snapshot đủ để reconnect, không chỉ lấy booking trong một ngày cố định:

1. **Chờ duyệt:** `pending` và `change_requested`, kể cả đã quá giờ, cho tới khi chủ quán xử lý.
2. **Sắp đến:** `confirmed`, sắp xếp theo giờ đến.
3. **Quá giờ:** `confirmed`, `arrival_at <= now()` và chưa `arrived`/no-show/cancelled.
4. **Đã đến:** `arrived`; có thể mở đúng session/bill trên POS.
5. **Đã kết thúc gần đây:** completed/rejected/cancelled/no-show trong cửa sổ lịch sử ngắn để
   chủ quán thấy kết quả vừa thao tác; không giữ toàn bộ lịch sử trong queue nóng.

Mỗi card hiển thị tên, số điện thoại, giờ đến theo `Asia/Ho_Chi_Minh`, số khách, số bàn gợi ý,
bàn đã giữ, ghi chú và yêu cầu đổi nếu có. Số điện thoại dùng liên kết `tel:`; không tự gọi.

## 5. Chọn bàn và thay đổi booking

- Xác nhận booking bắt buộc chọn ít nhất một bàn. UI tô gợi ý `ceil(party_size / capacity)` nhưng
  chủ quán quyết định số lượng thực tế.
- Trên POS, bộ chọn tái sử dụng snapshot/khu vực/vị trí của sơ đồ bàn hiện có. Bàn đang có phiên
  hoặc xung đột booking bị vô hiệu và giải thích lý do; DB vẫn là lớp quyết định cuối cùng để
  chống race.
- Trên mobile, cùng snapshot được trình bày thành nhóm theo khu vực và ô chọn lớn; không ép màn
  hình nhỏ kéo canvas POS 960px.
- Chủ quán có thể tạo booking thủ công ngoài min advance/horizon/slot/giờ phục vụ theo quyết định
  đã chốt. Bắt buộc ghi lý do; BL-1 đã audit `manual_created`.
- Chủ quán có thể đổi giờ/số khách/bàn cho booking chưa đến. Thao tác là một transaction: khóa
  reservation và các bàn theo thứ tự ổn định, kiểm overlap/phiên mở, thay allocation, xóa yêu cầu
  đổi đang chờ, reset Snooze và append event. Không release bàn cũ trước khi bàn mới đã qua mọi
  kiểm tra.
- Yêu cầu đổi từ khách dùng `resolve_reservation_change` BL-1. Đổi chủ động bởi quán dùng RPC mới
  và event riêng để audit không nhập nhằng với yêu cầu của khách.

## 6. Nhắc đến giờ, gộp chuông và Snooze

Một booking cần nhắc khi:

```text
status = confirmed
AND arrival_at <= now()
AND reminder_snoozed_until <= now() (hoặc NULL)
```

- Chu kỳ là 5 phút tính từ `arrival_at` của từng booking.
- Trong một client, mọi booking vừa bước sang bucket 5 phút mới được gộp thành **một** chuông và
  một banner tổng hợp; không phát một chuông/card.
- Khóa bucket đã phát lưu ở `sessionStorage` theo store + reservation + bucket để polling/realtime
  lặp không làm chuông lặp. Reload có thể nhắc lại một lần vì người vận hành vừa quay lại màn hình;
  điều này an toàn hơn bỏ sót.
- Snooze 10/15/30 phút được lưu trên reservation bằng RPC owner-only, nên POS và điện thoại cùng
  thấy. Có thể Snooze một card hoặc toàn bộ nhóm đang đến hạn.
- Sau 30 phút, card chuyển mức cảnh báo nổi bật. Hệ thống **không tự no-show, không tự hủy và
  không giải phóng bàn**. Chủ quán phải bấm `Khách đã đến`, `Không đến`, đổi lịch hoặc Snooze.
- Không lưu `last_ping_at` cho từng tiếng chuông: bucket là logic trình bày, còn Snooze và trạng
  thái booking mới là dữ liệu nghiệp vụ cần đồng bộ/audit.

## 7. Đồng bộ nhiều màn hình

- Trang load snapshot server-side, sau đó nghe `postgres_changes` trên `reservations`.
- Vì browser realtime có thể kết nối bằng anon key dù UI đã đăng nhập, watcher luôn có polling
  server action đã xác thực mỗi 2 giây, cộng refresh khi focus/reconnect.
- Mỗi refresh thay toàn bộ snapshot thay vì tự vá row để không mất thay đổi từ máy khác.
- Watcher dùng revision/ticket như queue Gọi nhân viên: event đến trong lúc RPC đang chạy khiến
  snapshot cũ bị bỏ và tải lại.
- Sau mutation thành công, UI reload snapshot ngay. Lỗi nghiệp vụ được giữ trên màn hình cho tới
  khi người dùng đóng hoặc thao tác lại; polling không xóa lỗi action.

## 8. Màn hình

### `/admin/reservations`

- Mobile-first, có tổng số `Chờ duyệt`, `Sắp đến`, `Quá giờ`.
- Danh sách card theo nhóm; bộ lọc ngày chỉ áp cho lịch sử/sắp tới, không làm mất booking chưa xử
  lý.
- Nút `Tạo đặt bàn`, `Gọi`, `Xác nhận & chọn bàn`, `Từ chối`, `Khách đã đến`, `Đổi lịch/bàn`,
  `Không đến`, `Snooze` theo trạng thái.
- Thêm mục `Đặt bàn` trong nhóm Vận hành của Admin Nav khi capability bật.

### `/admin/cashier`

- Queue compact ở phía trên/sát sơ đồ, không che bill và đơn chờ xác nhận.
- Bấm booking mở chi tiết; chọn bàn dùng dữ liệu sơ đồ hiện tại. Sau `Khách đã đến`, chọn đúng
  session vừa tạo để POS mở bill/mâm đó.
- POS và mobile dùng chung action, classifier và watcher; chỉ khác bố cục.

## 9. Thay đổi dữ liệu BL-2A

Migration kế tiếp là `057_reservation_operations_queue.sql`:

- thêm `reminder_snoozed_until timestamptz` và `reminder_snoozed_by uuid` vào `reservations`;
- mở rộng event type bằng `reminder_snoozed` và `rescheduled_by_store`;
- `list_reservation_queue(store, recent_since, future_until)` trả unresolved toàn thời gian và
  terminal gần đây, kèm table summary/suggested count/Snooze;
- `snooze_reservation_reminders(reservation_ids[], minutes)` chỉ nhận 10/15/30, khóa row theo ID,
  chỉ xử lý `confirmed`, cùng store và append event từng booking;
- `reschedule_reservation(reservation_id, arrival_at, party_size, table_ids[], note)` đổi nguyên tử
  booking chưa đến; operator override giới hạn customer nhưng vẫn kiểm dữ liệu, overlap và phiên;
- mọi function SECURITY DEFINER revoke `PUBLIC, anon, authenticated` trước khi grant riêng cho
  `authenticated`, theo convention migration BL-1.

## 10. Ngoài phạm vi

- Không gửi tin OA/ZNS, không lấy Zalo user ID của chủ quán trong BL-2A.
- Không tạo/duyệt/in preorder và không đổi kitchen/order schema.
- Không thêm ngày nghỉ đặc biệt hoặc trạng thái bàn trống cho khách.
- Không tự động xác nhận, tự chọn bàn, tự no-show hoặc tự đóng booking pending.
- Không thay luồng Mini App, payment, Pubu hoặc quyền staff hiện tại.

## 11. Tiêu chí hoàn thành

1. Owner xử lý đầy đủ queue từ điện thoại và POS; staff/direct RPC bị chặn.
2. Hai máy đồng bộ trong khoảng polling fallback mà không cần F5.
3. Confirm/reschedule không thể hứa cùng một bàn trùng hold hoặc bàn đang có phiên.
4. Nhắc đúng bucket 5 phút, gộp chuông, Snooze đồng bộ và cảnh báo 30 phút; không tự no-show.
5. Arrival tạo đúng một mâm/session và POS mở đúng bill vừa tạo.
6. Pubu và các quán tắt reservation không đổi hành vi.
