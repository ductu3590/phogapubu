# UI-09 — Phép đo xác nhận preorder đến màn in

**Hiện trạng:** anh Tú phản ánh 30–40 giây; chưa tái hiện/đo trên deployment và thiết bị thật trong session này. Audit local `c26838f`, không có production trace. Không điền số giả vào baseline. Đo ở T01 và T10, nghiệm thu T17.

## Đường đi và mốc

| Mốc | Đo ở đâu | Ý nghĩa |
|---|---|---|
| t0 | pointer/click Xác nhận & in, popup mở ngay gesture | bắt đầu; popup blocked ghi lỗi riêng |
| t1 | trước/sau releaseReservationPreorder server action | network/auth/RPC xác nhận; thêm span RPC phía server |
| t2 | trước/sau reloadPreorders và reload session hiện đang await | tải queue/bàn, chờ dữ liệu hiện tại |
| t3 | trước/sau listReservationPreorderQueue lần bổ sung | đọc toàn queue để tìm một order |
| t4 | trước/sau requestReservationPreorderPrint | tạo print job snapshot/revision/audit |
| t5 | gán popup URL rồi Navigation Timing ở tab in | route/SSR/job read/store read/network |
| t6 | React mounted + fonts.ready + layout/ảnh ready | phiếu có nội dung đúng, sẵn sàng in |
| t7 | ngay trước window.print, beforeprint event | đã gọi hộp thoại browser; không phải giấy ra |
| t8 | afterprint | browser kết thúc tương tác; không phân biệt in/hủy, không đánh dấu paid/printed |

Ghi `t_confirm=t1.end-t0`, `t_job=t4.end-t4.start`, `t_ready=t6-t0`, `t_dialog_request=t7-t0`. Không cộng p95 từng bước để thay p95 tổng. Dùng monotonic performance.now trong mỗi tab; nối trace ID và epoch mốc chuyển tab để liên hệ, không trừ trực tiếp hai timeOrigin khác nhau. Server spans dùng duration và trace ID, không cần clock sync cho duration.

Instrument đề xuất trong client: `performance.mark('preorder:<trace>:release:start')`, measure sau response; popup mang trace ID riêng, không token booking. Server log duration auth/rpc/snapshot SSR cùng trace; sanitize chỉ có screen/action/duration/commit/network profile, không tên/SĐT/secret. Không log raw RPC payload. Nếu auth/network/RPC chậm thì trace phải cho biết bước đó trước khi sửa UI.

## Mẫu benchmark

- Testing có phép đo, ghi URL deployment, SHA Admin/core/instance, version Zalo Testing, migrations, thời gian GMT+7, browser/OS, CPU/device, máy in và mạng. Chưa có các dữ liệu này ở audit.
- 30 mẫu/profile trước và 30 sau, warm/cold tách nhóm, ít nhất 2 thiết bị quầy thật. Dataset giả: 20/60 bàn; 10/100 booking; preorder 3/20 món. Không benchmark bằng cách release booking khách thật.
- Profile A mạng quầy bình thường có RTT/down/up đo và ghi; B throttled RTT150ms, down1.6Mbps/up750Kbps; C mạng rớt sau release/sau job, retry/reconnect. C kiểm correctness và recovery, không gộp p95 happy path.
- Báo p50/p95 theo nearest-rank (`sorted[ceil(n*p)-1]`), số mẫu, min/max, error rate, popup-block rate. Tách cold start/warm, không bỏ mẫu chậm; failed request báo riêng, không tự coi là latency0.

## Ngân sách đề xuất để anh review

| Kết quả | A bình thường | B mạng chậm |
|---|---|---|
| thấy phản hồi Đang xác nhận | ≤100ms | ≤100ms |
| xác nhận nghiệp vụ p50/p95 | ≤1s / ≤3s | ≤2s / ≤5s |
| print-ready tổng p50/p95 | ≤2s / ≤5s | ≤4s / ≤8s |
| job creation p95 | ≤1.5s | ≤2.5s |
| gọi window.print sau ready | ≤500ms | ≤500ms |

Đây là mục tiêu mới, chưa đạt/chưa đo. Hộp thoại native/driver/spool/giấy có thể nằm ngoài app; vẫn ghi thời gian quan sát nhưng không hứa SLA giấy ra. Nếu ready >8s hiển thị “Phiếu đang tải lâu. Bạn có thể quay lại POS; đơn đã xác nhận sẽ không được tạo lại.” Không tự retry mutation khác ID.

## Thứ tự tối ưu sau baseline

1. Popup hiện loading ngay click; release trả revision/needsPrint, request job dùng đúng revision; refresh queues chạy nền sau khi điều hướng. Bỏ T2/T3 khỏi critical path chỉ khi contract/race tests chứng minh an toàn.
2. Bảo đảm retry `already` vẫn chọn đúng job; original có unique nghiệp vụ, reprint ID/lý do riêng. Không fallback latest lỗi sang row cũ rồi giả vờ thành công.
3. Nếu SSR/store fetch chiếm thời gian: song song đọc độc lập, snapshot job immutable, CSS/font hệ thống cục bộ cho phiếu. Không chuyển in sang payload do client tự tính.
4. Chỉ thêm combined release-and-job RPC nếu đo cho thấy RTT dominate; giữ thứ tự khóa reservation→order của BL-4, cùng snapshot, rollback/no-show race, owner/tenant. Không bypass audit để nhanh.

Nghiệm thu gồm đúng giá/topping/tổng ở hai liên, in lại label/audit, mất mạng sau commit, popup blocked, revision đổi/no-show cùng lúc và không tự xác nhận đã in/đã thu tiền.
