# POS kiểu Sơ đồ bàn (lưới bàn dày) — thiết kế

Ngày: 2026-11-17 · Người duyệt: anh Tú · Mockup đã chốt: [2026-11-17-pos-so-do-ban-mockup.html](2026-11-17-pos-so-do-ban-mockup.html)
(bản trực tuyến: https://claude.ai/artifact/M8f1EcC6Gk3V3HRe6PXMCt)

## 1. Vì sao làm

Màn POS hiện mở mặc định bằng **Timeline**: mỗi bàn một dòng theo giờ. Hợp quán ít bàn, nhiều khách đặt trước
(Bảo Lương 25 bàn còn ổn). Quán nhiều bàn (Yên Garden, quán bia garden 40+ bàn) phải cuộn xuống rất nhiều mới thấy
hết quán. Tab **Sơ đồ bàn** đã có nhưng vẽ bàn theo đúng toạ độ đã kéo (lưới 12 cột, ô tối đa 160px, cao 112px)
nên thưa và còn ô trống, chỉ xem một khu một lúc — không thay được Timeline khi đông.

Anh Tú muốn: Sơ đồ bàn trở thành **một màn POS đúng nghĩa kiểu KiotViet** — lưới ô bàn dày, nhìn một cái thấy cả
quán, bấm bàn là ra bill — và **thu ngân tự chọn** dùng Timeline hay Sơ đồ. Mặc định cấu hình **ngay trên màn
POS, theo từng máy** (anh Tú chốt 2026-11-17): nút "Đặt làm mặc định máy này" cạnh hàng tab. Tab đổi tên
"Sơ đồ bàn" → **"Sơ đồ"** (anh Tú chốt 2026-11-17); trang cấu hình "Sơ đồ bàn & QR" giữ tên.

## 2. Mục tiêu / không làm / thất bại nếu

**Mục tiêu**
- Màn 1366px thấy hết ~40 bàn của mọi khu mà không phải cuộn (ô rộng tối thiểu 104px, cao 76px, tự dồn đủ cột).
- Mỗi ô đủ để thu ngân ra quyết định mà không phải mở bill: tên bàn, tiền, thời gian ngồi, mâm, chờ duyệt,
  gọi nhân viên, trễ, giờ khách đặt sắp đến.
- Mỗi máy ghim được màn mặc định (Timeline hoặc Sơ đồ); mở lại POS vào đúng màn đó.
- Bàn trống bấm vào có lối đi thẳng: gọi món & mở bàn, đặt bàn cho bàn này, ghép mâm.

**Không làm (đợt này)**
- **Tab Thực đơn gọi món ngay trong màn** (kiểu KiotViet): anh Tú chốt dùng hộp thoại chọn món như bây giờ
  (`ManualOrderSheet`). Phần này có trong mockup nhưng KHÔNG làm.
- Không đổi DB, RPC, migration, realtime, cách tính tiền. Đây là việc giao diện thuần trong `admin-web/app/admin/pos/`.
- Không đổi màn nhân viên `/staff/tables`, trang cấu hình `/admin/tables`.
- Không lưu màn mặc định lên server / theo tài khoản / theo quán; không thêm mục nào vào ⚙ Cài đặt chung
  (anh Tú chọn "chỉ trên màn POS", 2026-11-17).

**Thất bại nếu (dù chạy được)**
- Bất kỳ thao tác nào đang làm được ở POS mất đi khi dùng Sơ đồ bàn: duyệt món, gộp bill, ghép mâm bàn trống,
  chọn bàn cho đặt bàn, sắp xếp bàn, chuyển bàn, thu tiền.
- Màu / nhãn trạng thái bàn lệch với Timeline và màn nhân viên (một nguồn: `lib/table-status.ts` + `TABLE_STATE`).
- Đổi kiểu màn làm mất bill đang mở hoặc mất bộ lọc khó chịu (đổi qua lại phải nhẹ như đổi tab).
- Màn chớp Timeline rồi mới nhảy sang Sơ đồ bàn mỗi lần mở trang.

## 3. Hiện trạng code (đọc trước khi sửa)

- `pos-client.tsx` (~1.500 dòng) giữ toàn bộ state. `view: 'timeline' | 'floor' | 'list'`, mặc định `'timeline'`,
  không nhớ. Hàng tab ở dòng ~1185. Khu vực lọc bằng `<select>` khi không phải `floor`.
- `floor-map.tsx`: lưới theo toạ độ `x,y` (`lib/table-layout.ts`, `LAYOUT_COLS = 12`); dùng cho cả xem và
  **Sắp xếp bàn** (kéo thả, phím mũi tên). Điện thoại thì xếp 3 cột bỏ toạ độ. Xem một khu (`floor.areaId`) qua
  `area-controls.tsx` (tab khu + công cụ tạo/đổi tên/phân khu khi sắp xếp).
- Bấm ô bàn: có phiên → `selectSession(id, ctrl)`; bàn trống → `togglePickTable` (chọn nhiều bàn trống để
  **Ghép thành một mâm**). Chọn 1 bàn trống hiện không có gì ở cột phải; chọn ≥2 → `PosBillPanel` nhánh
  `pickedFreeTables >= 2`. Bàn trống đang giữ cho khách đặt trong 60' (`prearrivalReservedTableIds`) bị khoá
  (`disabled`, "Đã giữ cho khách sắp đến").
- Cột phải (`panel`): chọn bàn cho đặt bàn > chi tiết đặt bàn > bill > Việc cần xử lý. Từ `xl` là cột 400px cố
  định; dưới `xl` là sheet. Giữ nguyên logic này.
- Chọn bàn cho đặt bàn (`beginReservationConfirm`) ép `setView('floor')`.
- Khách lẻ: `walkIn` → `WalkInPicker` → `ManualOrderSheet`; bàn chỉ mở khi gửi món (mig 099).

## 4. Các cách đã cân nhắc

| Cách | Mô tả | Được / mất |
|---|---|---|
| **A. Giữ hàng tab 3 nút, ghim mặc định theo máy, làm lại tab Sơ đồ** (CHỌN) | Hàng tab Timeline · Sơ đồ · Danh sách giữ nguyên chỗ; nút "Đặt làm mặc định máy này" cạnh hàng tab; tab Sơ đồ đổi sang lưới dày + bộ lọc + bảng bàn trống | Ít đụng code, thu ngân đã quen chỗ bấm; thanh trên vốn đã chật nên không nhét thêm nút |
| B. Nút "Kiểu màn" ở thanh trên (như mockup), Danh sách thành tab con của Timeline | Hai "chế độ" tách hẳn | Rõ ràng là hai màn, nhưng thêm một tầng điều hướng, thanh trên đã xuống dòng ở màn hẹp; Danh sách bị giấu đi |
| C. Màn riêng `/admin/pos/floor` | Trang mới | Nhân đôi state + realtime + chuông của `pos-client` — rủi ro lệch, loại |

**Chọn A** (quyết định của Claude, anh Tú chưa chọn riêng điểm này — sửa được khi duyệt): cùng kết quả anh muốn
(chọn kiểu nào, máy nhớ kiểu đó) với ít thay đổi nhất. Mockup vẽ nút ở thanh trên chỉ là minh hoạ vị trí.

Nơi đặt màn mặc định đã cân nhắc: (1) ⚙ Cài đặt chung theo quán — cần cột DB, thu ngân không vào được;
(2) cả hai tầng quán + máy; (3) **chỉ trên màn POS, theo máy** — anh Tú chọn (3).

## 5. Thiết kế

### 5.1 Màn mặc định theo máy (ghim trên màn POS)
- Nhãn tab: **Timeline · Sơ đồ · Danh sách** (đổi chữ "Sơ đồ bàn" → "Sơ đồ").
- Cạnh hàng tab (bên phải tab, trước các nút khác của hàng) có nút nhỏ:
  - Tab đang xem là Timeline hoặc Sơ đồ và **chưa** là mặc định của máy → `☆ Đặt làm mặc định máy này`.
    Bấm → ghi vào `localStorage` khoá `mevo:pos-view` (giá trị `timeline` | `floor`), toast ngắn
    "Máy này sẽ mở POS bằng Sơ đồ" (hoặc Timeline).
  - Tab đang xem đã là mặc định → nhãn tĩnh `★ Mặc định máy này` (không bấm).
  - Tab Danh sách → không hiện nút (chỉ ghim được Timeline hoặc Sơ đồ).
  - Màn hẹp: chỉ còn icon ☆/★ có `aria-label` + `title` đủ chữ.
- **Bấm đổi tab chỉ đổi tạm**, không ghi gì; tải lại trang → về màn mặc định của máy.
- Mở POS: màn mặc định đã ghim; chưa ghim → `timeline` (như hiện nay, không bất ngờ cho Bảo Lương).
  Đọc/ghi bọc try/catch; giá trị lạ (kể cả `list`) hoặc storage hỏng → `timeline`.
- Không chớp: đọc kiểu màn trước lần vẽ đầu ở trình duyệt (vd. `useSyncExternalStore` với giá trị server =
  `null` → hiện khung chờ chung như `clockNow === null` đang làm), không vẽ Timeline rồi mới nhảy.
- Khung chờ chỉ thay hàng tab + vùng giữa (thanh trên, hàng đợi, cột phải vẫn vẽ ngay).
- Đổi tab do hệ thống ép (chọn bàn cho đặt bàn) không ghi gì. Ghi lại tab đang đứng ngay
  trước khi ép (`viewBeforePick`); xong/huỷ chọn bàn thì quay về đúng tab đó. Trong lúc chọn bàn cho đặt bàn,
  các tab khác vẫn bị khoá như hiện nay.
- Rời tab Sơ đồ bàn (sang Timeline/Danh sách) thì bỏ chọn bàn trống (`pickedTableIds`) — hai tab kia không chọn
  bàn trống được.

### 5.2 Tab Sơ đồ bàn — khi KHÔNG sắp xếp

> **Bố cục A "Gọn tối đa" — anh Tú chốt 2026-11-17** sau khi Playwright đo bản đầu chỉ thấy 14/43 bàn ở
> 1366×768. Mockup so sánh: [2026-11-17-pos-so-do-1366-mockup.html](2026-11-17-pos-so-do-1366-mockup.html)
> (A thấy 43/43 khi chưa chọn bàn, kể cả Chrome thật trên laptop 1366). Các mục dưới đã sửa theo A:
> - **Một dòng công cụ**: tab (Timeline · Sơ đồ · Danh sách) + nút ghim + ô chọn khu (thả xuống) + nút lọc trạng
>   thái + ô tìm + nút Sắp xếp bàn chung MỘT hàng (màn hẹp được xuống dòng). Không còn hàng nút khu riêng.
> - **Không chia nhóm theo khu**: lưới luôn xếp liền; mỗi ô có chấm màu khu cạnh tên bàn. Thứ tự: theo thứ tự khu
>   (`floor.draft.areas`, Chưa phân khu cuối), trong khu theo `y` rồi `x`.
> - **Ô cao 76px** (thay 84px), vẫn `minmax(104px, 1fr)`.
> - **Cột phải ở tab Sơ đồ**: khi không có gì để hiện (panel = Việc cần xử lý) thì **ẩn cột** ở mọi cỡ màn; Việc cần
>   xử lý mở dạng ngăn kéo phủ lên khi bấm chip Hàng đợi / nút "Việc cần xử lý" (như dưới `xl` hiện nay). Khi có bill /
>   bàn trống / chi tiết đặt bàn / chọn bàn cho đặt bàn thì cột phải hiện như cũ và lưới co lại. Tab Timeline và
>   Danh sách giữ cột phải như hiện tại. Chuông + watcher của Việc cần xử lý vẫn luôn chạy (cột vẫn mount, chỉ ẩn).

Bố cục từ trên xuống, trong vùng giữa:

1. **Hàng lọc** (thay `AreaControls` khi không sắp xếp; theo A là chung một dòng với tab):
   - Chọn khu: ô thả xuống `Tất cả khu (N)` + mỗi khu `Tên (N)` + `Chưa phân khu` nếu có.
   - Nút trạng thái kèm số đếm (đếm trong khu đang lọc): `Tất cả` · `Có khách` (có phiên mở, gồm cả chờ duyệt,
     trễ) · `Trống` (không phiên, gồm cả bàn đang giữ cho khách đặt) · `Chờ duyệt` (`pendingCount > 0`) ·
     `Sắp có khách đặt` (trống + đang giữ cho đặt bàn trong 60').
   - Ô tìm bàn theo tên (không phân biệt hoa thường, bỏ dấu không bắt buộc).
   - Nút **Sắp xếp bàn** giữ như cũ (chỉ chủ quán).
2. **Lưới bàn**: `grid-template-columns: repeat(auto-fill, minmax(104px, 1fr))`, ô cao cố định 76px, khe 8px.
   - ~~`Tất cả khu`: chia nhóm theo khu có tiêu đề~~ → bỏ theo bố cục A: xếp liền, chấm màu khu trên từng ô,
     thứ tự khu như `floor.draft.areas`, `Chưa phân khu` cuối.
   - Trong một khu: thứ tự theo toạ độ đã sắp (`y` rồi `x`) — chủ quán vẫn điều khiển thứ tự bằng Sắp xếp bàn;
     bỏ các ô trống giữa chừng.
   - Không còn bàn khớp lọc → dòng chữ "Không có bàn nào khớp bộ lọc."
   - Điện thoại / máy tính bảng: cùng lưới, tự còn 3 cột ở 375px.
3. **Chân** số liệu giữ nguyên.

Lọc khu / trạng thái / tìm kiếm chỉ là state trong trang (không nhớ qua lần mở), không ảnh hưởng tab Timeline.
`floor.areaId` vẫn dùng cho Sắp xếp bàn như cũ.

**Cách đếm** (để test được):
- Số trên nút khu = tổng bàn của khu đó, không phụ thuộc lọc trạng thái và ô tìm.
- Số trên nút trạng thái = số bàn khớp trạng thái **trong khu đang lọc**, không phụ thuộc ô tìm.
- Các nhóm được phép chồng nhau: `Có khách` gồm cả chờ duyệt và trễ; `Trống` gồm cả bàn đang giữ cho khách đặt;
  `Sắp có khách đặt` là một phần của `Trống`. Lưới hiện bàn khớp cả khu + trạng thái + ô tìm.

**"Bàn đang giữ cho khách đặt"** = đúng định nghĩa `prearrivalReservedTableIds` hiện có (đặt bàn `confirmed`,
chưa có phiên, `arrivalAt − 60' ≤ now < arrivalAt + planningHoldMinutes`). Một bàn bị nhiều đặt bàn giữ cùng lúc
→ lấy đặt bàn có `arrivalAt` sớm nhất: ô hiện giờ của nó, bấm ô mở đặt bàn đó. Cần đổi Set hiện có thành Map
`tableId → đặt bàn` (giữ nguyên điều kiện lọc).

### 5.3 Ô bàn
Màu nền + nhãn theo `tableVisualState` / `TABLE_STATE` / `STATUS_TONE_CLASSES` (đúng màu Timeline & màn nhân
viên; màu tím của mockup chỉ minh hoạ). Nội dung:

| Trạng thái | Dòng trên | Dòng dưới |
|---|---|---|
| Trống | Tên bàn | "Trống" (chữ nhạt) |
| Giữ cho khách đặt (≤60') | Tên bàn | "Đặt HH:mm" (giờ đến của đặt bàn gần nhất đang giữ bàn) |
| Đang phục vụ | Tên bàn · nhãn phụ nếu có | Tổng tiền `s.total` · "⏱ thời gian ngồi" từ `opened_at` (`45'`, `1g12`) · `Mâm N` màu mâm |
| Chờ duyệt | như trên + viền vàng + chấm nháy góc | như trên; nhãn `Chờ duyệt · N` |
| Trễ / xung đột | như trên, nhãn `Trễ` | như trên |

- **Nhãn phụ "Gọi NV"** (chuông đỏ) khi bàn có yêu cầu gọi nhân viên đang mở (`serviceRequests` khớp phiên/bàn,
  cùng cách `serviceRequestSession` đang dùng).
- Mâm: vạch màu mâm cạnh trái (`tray.color.bar`) như ô hiện tại.
- Viền chọn (một ô chỉ một viền, theo thứ tự ưu tiên): bàn đang chọn cho đặt bàn (xanh) > bill đang mở (đậm) >
  đang tick gộp / chọn bàn trống (cam) > chờ duyệt (vàng). Chờ duyệt vẫn nổi nhờ chấm nháy + nhãn `Chờ duyệt · N`
  dù viền bị viền chọn đè; ở chế độ gộp thu ngân phải thấy ô nào đã tick. Chế độ chọn bàn cho đặt bàn: giữ logic
  `disabledReason` / `reservationSelected` hiện có.
- Thời gian ngồi cập nhật theo `now` sẵn có (`useNow`), không thêm bộ đếm riêng.
- Chữ không bị cắt: tên dài thì `truncate` + `title`.

### 5.4 Bấm ô bàn

| Ô | Bấm thường | Ctrl/⌘ hoặc chế độ Gộp bill |
|---|---|---|
| Có phiên | `selectSession` → bill ở cột phải (như cũ) | tick thêm mâm để gộp (như cũ) |
| Trống | chọn bàn trống (`togglePickTable`) | như bấm thường |
| Giữ cho khách đặt | mở **chi tiết đặt bàn** đó (`selectReservation`) — có sẵn Nhận khách, Không đến… | như bấm thường |

Thay đổi hành vi so với hiện nay: bàn đang giữ cho khách đặt **không còn bị khoá** mà mở chi tiết đặt bàn.
Bàn đó vẫn không chọn làm bàn trống / ghép mâm từ lưới được (như hiện nay); muốn xếp khách lẻ vào thì vẫn đi
nút **Khách lẻ** ở thanh trên (`WalkInPicker` có liệt kê bàn đó) — không mất thao tác nào so với hiện nay.
Trong chế độ chọn bàn cho đặt bàn, giữ nguyên hành vi cũ (bàn có khách / đã giữ cho đặt bàn khác thì khoá).

Bấm bàn trống ngoài chế độ Gộp bill thì bỏ bill / chi tiết đặt bàn đang mở (`selectedSessionId`,
`selectedReservationId`, `pickedSessionIds` về rỗng) để cột phải chuyển sang bàn trống.

### 5.5 Cột phải khi chọn bàn trống
- **Đúng 1 bàn trống** đang chọn (mới): khung tối như bill (`Khung` trong `bill-panel.tsx`), tiêu đề
  `Bàn X`, nhãn `Trống`, mô tả tên khu. Nút:
  - **Gọi món & mở bàn** (chính) → `setWalkIn({ step: 'menu', tableId, tableNumber })` — đúng hộp thoại chọn
    món Khách lẻ hiện tại; gửi món xong bill bàn tự mở (đã có trong `onWalkIn`).
  - **Đặt bàn cho bàn này** (chỉ khi `reservationsEnabled`) → `setNewBooking({ table, arrivalAt: làm tròn theo
    slotIntervalMinutes })` như nút Đặt bàn mới.
  - Dòng gợi ý: "Bấm thêm bàn trống khác để ghép thành một mâm."
  - **Bỏ chọn** / nút X → bỏ chọn bàn.
  - Nếu bàn có đặt bàn **muộn hơn** trong ngày (ngoài khung 60'), hiện một dòng nhắc "Có khách đặt HH:mm" — dùng
    lại dữ liệu `buildMoveTargets` (`laterReservationAt`) nếu tiện; không bắt buộc chặn.
- **≥2 bàn trống**: giữ nguyên "Đã chọn N bàn trống · Ghép thành một mâm".
- `panel` thêm trạng thái "1 bàn trống được chọn". Thứ tự ưu tiên cột phải: chọn bàn cho đặt bàn > chi tiết đặt
  bàn > bill (phiên đang mở / mâm đang tick / ≥2 bàn trống) > **1 bàn trống** > Việc cần xử lý.
  Dưới `xl` nó hiện thành sheet như bill (dùng chung `Khung`). Chỉ có ở tab Sơ đồ bàn.
- Mọi vai đang vào được POS đều dùng được nút Khách lẻ hôm nay, nên "Gọi món & mở bàn" không cần kiểm quyền thêm.

### 5.6 Sắp xếp bàn và chọn bàn cho đặt bàn
- **Sắp xếp bàn** (chủ quán): bấm nút → vào đúng màn hiện có (`AreaControls` + `FloorMap` theo toạ độ, một khu
  một lúc). Lưu / Huỷ → về lưới dày. Không đổi gì trong luồng sắp xếp. Vào sắp xếp khi lưới đang lọc một khu
  thì mở sẵn khu đó (`floor.setAreaId`); ra sắp xếp thì lưới giữ bộ lọc của nó.
- **Chọn bàn cho đặt bàn**: dùng lưới dày (ô bàn hiện thêm trạng thái chọn cho đặt bàn), bộ lọc vẫn dùng được.
  `FloorMap` theo toạ độ chỉ còn dùng cho Sắp xếp bàn.

### 5.7 Không đổi
Timeline, Danh sách, hàng đợi, Việc cần xử lý, bill, thanh toán, gộp bill, chuyển bàn, khách lẻ (nút Khách lẻ ở
thanh trên vẫn qua `WalkInPicker`), chuông, in. Không đổi server action nào.

## 6. Kiểm thử
- Hàm thuần mới tách ra file riêng (vd. `lib/pos-floor-grid.ts`): xếp thứ tự bàn theo khu + toạ độ, đếm/lọc
  theo trạng thái + tìm kiếm, nội dung ô (thời gian ngồi, giờ đặt), đọc/ghi lựa chọn kiểu màn (storage hỏng vẫn
  chạy) → vitest.
- Test component: bấm ô bàn trống mở bảng bàn trống; bấm ô giữ cho khách đặt gọi chọn đặt bàn; nhớ tab.
- Checklist test tay: `docs/testing/pos-so-do-ban/POS-SO-DO-BAN.md` (đợt mới), thêm 1 dòng ở `TESTING.md`.
  Thử trên Bảo Lương (25 bàn) ở 1366px, 1920px, máy tính bảng, điện thoại.

## 7. Để người làm tự quyết
- Tách component: ô bàn / lưới dày / hàng lọc / bảng bàn trống thành file mới trong `app/admin/pos/`
  (khuyến nghị, `floor-map.tsx` giữ cho Sắp xếp bàn), hay sửa trong `floor-map.tsx`.
- Kích thước chính xác của ô, chữ (rộng tối thiểu 104px, cao 76px, chữ tối thiểu 12px).
- Có thu gọn tiêu đề khu khi lọc một khu hay không.
- Cách bỏ dấu khi tìm bàn.

## 8. Quyết định Claude tự đưa ra (anh Tú soát khi duyệt)
1. Giữ hàng tab 3 nút, nút ghim mặc định đặt cạnh hàng tab — không làm nút "Kiểu màn" ở thanh trên như mockup (mục 4).
2. Máy chưa ghim → mở Timeline. Đổi tab chỉ đổi tạm, F5 về màn đã ghim. Danh sách không ghim được.
3. ~~Khi không chọn bàn nào, cột phải vẫn là Việc cần xử lý~~ → thay bằng bố cục A (anh Tú chốt 2026-11-17): ở tab
   Sơ đồ, không chọn gì thì ẩn cột phải, Việc cần xử lý mở dạng ngăn kéo.
8. Ô vừa chờ duyệt vừa gọi NV: nhãn trạng thái không được bị cắt — "Gọi NV" khi đó chỉ còn icon chuông đỏ (có
   `aria-label`), nhãn "Chờ duyệt · N" giữ đủ chữ.
4. Bàn giữ cho khách đặt: bấm mở chi tiết đặt bàn thay vì khoá.
5. Màu trạng thái dùng màu hệ thống hiện có, không dùng màu tím của mockup.
6. Bàn bị nhiều đặt bàn giữ → lấy đặt bàn đến sớm nhất. Bàn giữ cho khách đặt vẫn không ghép mâm từ lưới được.
7. Chọn bàn cho đặt bàn xong → quay về đúng tab đang đứng trước đó.
