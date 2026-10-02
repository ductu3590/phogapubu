# Audit UI MEVO — 01/10/2026

> Cập nhật 02/10: audit kỹ thuật lịch sử, không bản thiết kế hiện hành. D01/D02 đã chốt theo [design.md](design.md); task Txx đối chiếu mapping B1–B6 trong plan A/B, các đề xuất cũ chưa được duyệt không thành yêu cầu bắt buộc.

## Môi trường và mức độ bằng chứng

- Workspace `D:/Code/mevo`, branch `main`, HEAD `c26838f`. Ban đầu chỉ `docs/design/ui-reform-2026-10-01/` untracked (đầu vào người dùng); không có sửa tracked. Làm tài liệu trực tiếp ở checkout này, không chuyển hoặc sửa các worktree khác.
- `git worktree list`: Bảo Lương `b68ff0d`, Pubu `e2bcd9e`, cùng các checkout lịch sử khác. Bảo Lương sạch khi kiểm. Core là nguồn lõi; instance có khác biệt thực: `mini-app/src/app.tsx` thiếu refresh session theo focus/online/10s đang có trong core. Đồng bộ phải xem diff, không copy ngược instance cũ.
- Audit tĩnh code ở core; hai typecheck chạy tại core và instance bằng dependency đã cài. Không chạy ứng dụng đăng nhập, không đọc/ghi dữ liệu live, không đo máy in hay Vercel. Ảnh Word là ảnh phản ánh trước đây, không phải screenshot môi trường hôm nay.
- BL-3/BL-4 đã PASS theo bàn giao và file sprint. `BL-4-RELEASE-EVIDENCE.md:12` còn thiếu version Testing/deployment/thiết bị, dù kết quả chủ quán 5A đã được ghi PASS. Không đảo ngược PASS nghiệp vụ; phải bổ sung metadata trong lượt nghiệm thu UI tới. 5B giữ `DEFERRED_UI_REDESIGN`.
- Đọc USER-NOTES toàn bộ và xem image1…5, screen.png, timeline-final.png. Đọc/đối chiếu code HTML và review của hai prototype. Không có MCP Stitch trong inventory; truy cập project qua web cũng không lấy được nội dung. Không tuyên bố đã tải lại năm screen.

## Ma trận bắt buộc

Line là mốc core `c26838f`, phải cập nhật khi triển khai. “Xác minh tĩnh” không đồng nghĩa tái hiện runtime. Task trong [plan](../../superpowers/plans/2026-10-01-mevo-ui-reform.md).

| ID / phân loại | Bằng chứng file:line / ảnh | Tác động & phạm vi | Đề xuất / task | Nghiệm thu |
|---|---|---|---|---|
| UI-01 — đổi UX; xác minh tĩnh | `admin-web/app/admin/cashier/area-controls.tsx:38` dropdown phân bàn; `use-floor-layout.ts:123` save bản nháp; `floor-map.tsx:72` pointer drag trong lưới; image1 | UI; có sẵn area/version/save RPC, không cần schema mới cho kéo xuyên khu | Kéo tile vào section khu; chạm chọn bàn → Chuyển khu; bàn phím; giữ Lưu/Hủy chung. T04 | chuyển xuyên khu/lưu/tải lại; hủy giữ DB; conflict version giữ draft; không đổi session/booking |
| UI-02 — đổi UX; xác minh tĩnh | `cashier-client.tsx:714`, `:716` lọc `floor.areaId`; image2 | UI projection mọi khu; selection bàn/mâm chung | Timeline và sơ đồ group mọi khu, Chưa phân khu; nút khu chỉ nhảy tới section. T05 | chọn bàn xuyên khu; chuyển view giữ selection/giỏ; khu rỗng gọn |
| UI-03 — đổi UX | `floor-map.tsx:199` màu mâm; prototype final HTML:161 và image2/3 | UI tokens; màu mâm hiện không là trạng thái thống nhất | Đỏ hoạt động, cam đặt trước, xanh trống; icon/nhãn; mâm dùng liên kết/viền riêng. T03/T05 | bàn có khách + booking kế tiếp cùng thấy; booking ngày mai không tô cả bàn thành đang giữ |
| UI-04 — đổi UX; xác minh tĩnh | `manual-order-sheet.tsx:44` lọc một danh mục, `:129` grid; image3; Mini `pages/menu/index.tsx` có `scrollToId` | UI menu/giỏ; tái dùng hành vi, adapter riêng React18/19 | Section list, sticky tabs + scroll spy, stepper, option sheet; phân biệt POS đã phục vụ với staff cần duyệt. T09/T12/T14 | scroll/tab hội tụ, variant thay giá/topping cộng giá, giỏ không mất, món POS không báo bếp |
| UI-05 — sai biểu đạt workflow; xác minh tĩnh | `mini-app/src/pages/order-status/index.tsx:57`, `:219` STATUS_STEPS; `supabase/migrations/078_bl4_concurrency_fixes.sql:112` release; `069_reservation_preorder_release.sql:223` pos_confirm | UI + adapter public workflow; DB đã trả policy nhưng TS chỉ giữ 4 capability | projection theo policy: Chờ xác nhận/Đã xác nhận/Từ chối + nội dung; duyệt ≠ giấy đã in. T02/T11 | Bảo Lương không hiện cooking/ready giả; Pubu giữ bếp/thanh toán thật |
| UI-06 — đổi UX/contract | `staff-order-client.tsx:198`, `:508`, `:514`; `lib/actions/staff-order.ts:25` bắt buộc paymentMethod; `043_create_order_variants.sql:305` postpay force cash/null instrument; image4 | UI + action/API; schema không cần sentinel mới trong đề xuất | Postpay bỏ chọn phương thức; legacy cash giải thích như giá trị tương thích, actual instrument null. Server quyết định từ stores; giữ prepay. T13 | không thu/ghi phương thức thực; staff không đóng bill; đơn theo staff release policy; Pubu regression |
| UI-07 — đổi UX + gap concurrency | `bill-panel.tsx:265`; `cashier-client.tsx:321`; `050_pos_gate_service_requests.sql:281` close chưa có expected bill; image5 | UI + RPC mới kiểm snapshot/audit; giữ money server | Một Thanh toán → rà/sửa → in → phương thức → xác nhận → đóng; mới prepare/settle checked contract. T07/T08/T09 | pending chặn; bill đổi cùng tổng cũng chặn; hai máy chỉ một thu; đóng mọi bàn đúng mâm; giữ booking tiếp |
| UI-08 — đổi UX + gap read model | `lib/actions/reservations.ts:102`, `:116`; `reservation-preorders.ts:57`; `table-session.ts:37` thiếu contact; `055_reservation_arrival.sql:95` booking.session_id | UI + owner read RPC có lineage; không công khai PII | join reservation.session_id + order.reservation_id; contact là người đại diện booking; order contact là người đặt lượt. T06 | giữ đúng liên kết sau nhận/ghép/gọi thêm; vãng lai chưa có thông tin ghi rõ; không dùng khách phiên cũ |
| UI-09 — phản ánh 30–40s chưa tái hiện | `cashier-client.tsx:470`–`:493`; `reservation-preorders.ts:66`, `:75`; `print-order/page.tsx:25`; `print-order.tsx:44` delay 350ms | đo môi trường thật + client/API/RPC nếu cần | instrument từng chặng; bỏ reload khỏi critical path chỉ sau đo, dùng release result đúng revision. T01/T10/T17 | báo p50/p95 baseline/sau, snapshot/audit giữ; retry không tạo phiếu gốc trùng; target trong PERFORMANCE |
| TD-01 — lỗi tái hiện local | `mini-app/src/app.tsx:166`, `src/index.ts:16`, `category.api.ts:65`; instance app.tsx:155 | types/build setup; không cast any | kiểm export package thực; schema relationships đủ; config core từ template đúng setup. T01 | core + Bảo Lương typecheck exit0; không skip check; Pubu kiểm phiên bản đồng bộ |
| TD-02 — lỗi biểu đạt xác minh tĩnh; runtime từ bàn giao | `preorder-checkout.tsx:14` instanceof Error; `preorder.api.ts:22` throw RPC object | service normalize + UX/idempotency | message/code có kiểm kiểu, map tiếng Việt capability/offline/conflict; giữ giỏ. T02/T11 | object có message không mất nguyên nhân; token/SQL không lộ; retry cùng request ID |
| TD-03 — debt prototype; không coi là bug DB | `stitch-pos-2026-09-21/REVIEW.md:7`; final HTML:127 Bếp, :163 Chờ cọc, :1240 toast duyệt+in; hai ảnh | tài liệu mẫu + dữ liệu + design review | bỏ cọc/KDS/dọn bàn giả; chỉnh màu theo Word; nguồn immutable; wireframe xuyên suốt. T03/T05/T17 | total/selection/booking không mâu thuẫn; mọi trạng thái hệ thống có bằng chứng |

## Route / tác vụ hiện có và đề xuất

| Surface / code | Hiện có | Thiết kế đích / backend gap |
|---|---|---|
| Mini `src/router.tsx:1` | root/menu, checkout, order-status, session-orders, store-info, reservations/new/detail/preorder/checkout | Giữ route, đổi layout/interaction. Root read-only của Bảo Lương; QR gọi tại bàn. Không thêm public table inventory |
| Mini `components/layout/bottom-tabs.tsx:86` | lọc root/QR và reservation capability | Root: Thực đơn / Đặt bàn / Nhà hàng; QR: Thực đơn / Đơn đã gọi / Nhà hàng. Gọi nhân viên là action contextual, không tab chết |
| Owner `/admin/cashier` | sơ đồ/queues/bill, edit, preorder print, call tasks | Timeline là view mới phía client; dữ liệu live hiện có không đủ mọi booking trên ca vì queue không là lịch đầy đủ. Dùng list_store_reservations theo ngày, paginate; cùng selection/projection với map |
| `/admin/reservations` | form, table picker, queue, nhắc/Snooze/call tasks | Danh sách quản lý + drawer; CTA nhận khách mở POS đúng session; không timeline thứ hai |
| `/admin/orders` | danh sách order, revenue/order thao tác | Giữ Đơn hàng; tab Hóa đơn theo session là read API mới (closed/open, paging/audit/print). Không rename order thành bill rồi cộng trùng |
| `/admin/menu` | danh mục, món, ảnh, variants/toppings | List/filter + drawer; còn/hết, dirty save, lỗi giữ form, giá snapshot không đổi đơn cũ |
| `/admin/settings` | settings-client + workflow-settings-form | Cấu hình: Thông tin / Quy trình / Bàn & QR / Nhân viên; form riêng. Secret merchant/OA/ZCA nằm cockpit /mevo, owner chỉ trạng thái có bằng chứng |
| `/admin/tables`, `/admin/staff` | CRUD bàn/QR/staff | Giữ route deep link, đặt trong nhóm Cấu hình; không thêm HR/kho |
| `/admin/dashboard` | get_daily_revenue, 5 active orders giới hạn | Báo cáo v1 dùng số hiện có, sửa mốc ngày theo giờ VN. Bill count/top món/drill-down cần RPC mới; tách task chứ không vẽ như sẵn sàng |
| `/admin/vouchers`, `/admin/spin`, `/admin/account`, `/admin/kitchen` | đã có nav/route | Account ở menu; ưu đãi/vòng quay dưới Thực đơn/kinh doanh; KDS Pubu giữ. Bảo Lương ẩn KDS theo config, route guard cần kiểm riêng |
| Staff `/staff/order`, `/staff/orders`, `/staff/tables` | đặt hộ, trạng thái, bàn/phiếu bill | stepper/review/one confirm, status policy; bảng bàn mobile/tablet; resolve call dùng RPC sẵn. Không nâng quyền thu/in/duyệt |

## Contract và rủi ro cụ thể

1. **Policy public đã tồn tại**: `049_store_workflow_settings.sql:185` snapshot trả payment_timing, kitchen_release_policy, staff_order_release_policy, preorder enabled…; `get_public_store_workflow:220` sử dụng snapshot. `mini-app/src/services/workflow/workflow.api.ts:4` bỏ các trường đó. Mở rộng typed adapter, không cần thêm schema mode theo slug.
2. **Staff postpay đã tách payment instrument** ở mig043:305–307. Bỏ UI lựa chọn không được ghi tiền thật. New action kiểm timing từ DB; với postpay gọi legacy RPC bằng cash sentinel, null instrument, received_at vẫn null; với prepay yêu cầu phương thức hiện hữu. Không nới enum payment_method thành deferred khi chưa có nhu cầu.
3. **Bill check phải nguyên tử**: đọc tổng trước rồi gọi close là TOCTOU. RPC mới prepare/settle phải tính fingerprint gồm membership, items/void/topping, pending, payment state; kiểm dưới cùng khóa session và các mutation writer. Kế hoạch rà và test close-vs-add/void/restore/release/merge/arrival, không suy một lock session bao phủ mọi writer cũ.
4. **PII lineage**: queue reservations có session_id nhưng khi lọc theo ngày có thể không chứa khách cũ vẫn ăn. Contact read model phải đọc từ liên kết session trên server thay vì tên bàn hoặc queue đang hiện. Ghép nhiều session giữ danh sách đại diện theo booking, không ghi đè một khách mới. Không xuất số điện thoại qua anon/table bill RPC.
5. **Print**: release retry mig078 có thể chỉ trả released_revision/needs_print, không snapshot. T10 phải handle `already` và tạo/lấy job theo revision đó, không fallback revision cũ hay tải cả queue để đoán loại phiếu. Ordinary QR/staff print hiện đọc đơn hiện hành theo id; audit print job snapshot cho loại này là gap riêng T10, không khẳng định đã có như preorder.
6. **Version debt**: package thực tế là Next16.2.6/React19.2.4 (Admin) và React18.3.1/Zustand5/React Query5 (Mini), khác AGENTS mô tả Next14/Recoil. Không chuyển framework/state để cải tổ UI. Shared tokens/contract; không ép cùng JSX bundle giữa hai app.
7. **Type relation**: `database.types.ts:1` ghi placeholder, relationships ở menu_categories/menu_items trống. Đây là bằng chứng type metadata thiếu, chưa là bằng chứng FK live thiếu. Snackbar lỗi đúng export type/module hiện cài; phải kiểm declarations/package lock trước khi sửa import. Core có `app-config.example.json`, không có `app-config.json`; lỗi config được phân loại setup trước khi sửa.

## Các nguồn đối chiếu

- Spec 2026-09-10 reservation/POS: root vs QR, arrival/hold/6h, one bill, customer limits. Quyết định mới trong AGENTS và Word ưu tiên hơn câu cũ.
- Spec 2026-09-22 ZCA: outbox/dedup best-effort nội bộ, không báo đã đọc; owner calling khách, secret thuộc MEVO.
- Spec 2026-09-24 BL-4: watcher slow/reconnect, concurrency PostgreSQL thật, release gate và server switch.
- Spec 2026-06-22 Core + Theme: core chung, theme runtime, backend tenant; registry ThemeProvider nêu trong spec là đích, audit chưa chứng minh đã có đầy đủ. T03 lập token contract tối thiểu từ primary_color, không tự thêm theme engine lớn.
- Spec 2026-09-03 bill edit và 2026-07-15 staff: giữ snapshot/server total/void audit; workflow mới và owner-only trong mig050 thay các đoạn cũ còn cho staff thu tiền.
- Sprint BL-3/BL-4, release evidence và runbook: preorder submit lock, hold60, print2liên, no fake published version; không chạy lại nghiệm thu live trong session tài liệu.
- Research/prompt 20/09, Review 21/09, Admin Suite Brief 21/09: layout timeline ưu tiên, prototype chưa PASS; màu/số liệu/feature giả phải sửa theo 9 Word notes.

## Log typecheck tái hiện

Ngày 01/10/2026, chạy `npm run typecheck` ở từng thư mục bằng dependency hiện có, không sửa config.

```text
Core mini-app: exit 1
app.tsx(166,8) TS2604 + TS2786 SnackbarProvider không hợp lệ JSX
index.ts(16,23) TS2307 thiếu ../app-config.json
category/category.api.ts(65,19) TS2352 SelectQueryError relation menu_categories/menu_items

Bảo Lương mini-app: exit 1
app.tsx(155,8) TS2604 + TS2786 SnackbarProvider
category/category.api.ts(65,19) TS2352 relation category/menu
```

4/3 diagnostics tương ứng 3/2 nhóm nguyên nhân. Không claim build fail từ typecheck, không coi build PASS là typecheck sạch. Chưa chạy typecheck Admin trong audit này; không suy từ log BL-4 rằng hiện tại đã được kiểm lại.
