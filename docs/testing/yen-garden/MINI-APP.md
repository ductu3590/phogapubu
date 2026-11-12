# Yên Garden — Mini App (theme "garden", tải nhanh, gọi thêm bia)

Nhánh `claude/yen-garden-mini-app-aa37d2`. Migration đã áp prod: **134** (`stores.mini_app_theme`),
**135** (`get_mini_app_bootstrap`), **136** (`menu_categories.quick_reorder`).
Bản vẽ: `docs/design/yen-garden/menu-options.html` (3 bố cục, đã chọn **A**) và
`docs/design/yen-garden/quick-add-options.html` (3 vị trí nút gọi thêm bia, đã chọn **vị trí 1**: dải đáy ngay trên thanh giỏ).
Ảnh đối chiếu hai quán: `docs/testing/yen-garden/screens/`.

## Trước khi test

1. Chạy mini-app của quán:
   ```bash
   cd mini-app-instances/yen-garden/mini-app
   npm run dev
   ```
   Mở `http://localhost:5173` trên Chrome, bật khung điện thoại (F12 → biểu tượng điện thoại, 390×800).
2. Hai lối vào:
   - **Tại bàn:** `http://localhost:5173/?store=yen-garden&table=4f99f479-4cbe-49b7-89fe-029d3216c576` (Bàn mẫu 1)
   - **Lối thường:** `http://localhost:5173/?store=yen-garden`
3. Đối chiếu Bảo Lương ngay trên cùng máy chủ dev: đổi `store=bia-lau-bao-luong` (bỏ `&table=…` hoặc dùng mã bàn của Bảo Lương).
   Bảo Lương chỉ **xem**, đừng gửi đơn thử ở đó.
4. Quán Yên Garden đang dùng **dữ liệu mẫu** (xem cuối file). Bàn mẫu 1 đang có một phiên mở với 2 lượt gọi do máy dev tạo:
   mở bằng máy khác sẽ thấy băng "Bàn này đang có khách gọi món". Muốn bắt đầu sạch thì thu tiền Bàn mẫu 1 ở POS, hoặc test trên **Bàn mẫu 2**:
   `…&table=ad91037b-a47e-4028-ba11-c1c2ea6042ad`.
5. Phần admin (nhóm A bài 3–4, nhóm C bài 5) cần `admin-web` chạy (`npm run dev` trong `admin-web/`) và tài khoản superadmin / chủ quán.
   Quán Yên Garden **chưa có tài khoản chủ quán** — tạo ở `/mevo/stores/e1847559-f1c3-4778-acfd-2f1ec6347af7` trước khi làm bài C5.

## Nhóm A — Theme chọn theo quán

**A1. Yên Garden ra giao diện mới.** Mở lối tại bàn. Phải thấy: nền kem, chữ và nút màu ô-liu, danh mục là chữ có gạch chân
(không phải viên thuốc), món xếp một cột: chữ bên trái, ảnh vuông nhỏ bên phải, nút **+** tròn gối lên góc ảnh. Không có thẻ trắng bọc món.

**A2. Bảo Lương giữ giao diện cũ.** Mở `?store=bia-lau-bao-luong`. Phải y như bản đang chạy: nền xám nhạt, thẻ trắng có bóng mảnh,
chip danh mục in hoa nền đỏ, lưới 2 cột ở danh mục nhiều ảnh, nút **Gọi NV** đỏ, thanh giỏ nền tối. So với ảnh `screens/bl-*.png`.

**A3. Đổi theme ở `/mevo`.** Vào `/mevo/stores/<id Yên Garden>` → mục **Giao diện Mini App** → chọn **Mặc định** → Lưu.
Tải lại mini-app: Yên Garden phải ra bố cục cũ (thẻ trắng, lưới) nhưng vẫn màu ô-liu. Chọn lại **Sân vườn (tối giản)** → Lưu → tải lại: về giao diện mới.
Không phải build hay deploy lại.

**A4. Wizard tạo quán.** `/mevo/stores/new` → bước 2 có ô **Bộ giao diện** cạnh ô màu. (Chỉ cần nhìn thấy ô; không cần tạo quán mới.)

**A5. Không chớp giao diện.** Tải lại lối tại bàn của Yên Garden vài lần: trong lúc chờ phải là khung chờ nền kem, **không** thoáng hiện màn MEVO nền xám rồi mới sang menu.

## Nhóm B — Gọi món tại bàn (quán trả sau)

**B1. Món thường.** Bấm **+** ở "Ba chỉ nướng riềng mẻ": nút đổi thành **− 1 +** gối lên ảnh; thanh giỏ màu ô-liu hiện ở đáy "1 món · Bàn mẫu … / 145.000đ".

**B2. Món có lựa chọn.** Bấm **+** ở "Bia hơi Hà Nội": bảng trượt từ đáy, nút dưới cùng ghi "Vui lòng chọn để tiếp tục" và bị khoá.
Chọn **Ca 1 lít** → nút thành "Thêm vào giỏ — 60.000đ" → bấm. Bấm ra nền tối bên ngoài bảng thì bảng đóng, không thêm gì.

**B3. Món có topping.** "Lẩu riêu cua bắp bò" → tick "Thêm rau (mẫu)" → giá trên nút cộng 25.000đ.

**B4. Món không ảnh và món tạm hết.** "Trà chanh sả mật ong" (không ảnh): dòng vẫn gọn, nút **+** nằm bên phải.
"Cá hồi Sa Pa nướng mắc khén": mờ, có nhãn **Tạm hết**, không có nút **+**.

**B5. Tìm món.** Gõ `suon` (không dấu) → chỉ còn "Sườn nướng mật ong". Xoá chữ → về đủ menu.

**B6. Danh mục.** Bấm "Lẩu (mẫu)" → danh sách cuộn tới nhóm Lẩu, chữ "Lẩu (mẫu)" đậm và có gạch chân. Cuộn tay lên xuống → gạch chân chạy theo nhóm đang xem.

**B7. Gửi đơn.** Bấm thanh giỏ → màn Xác nhận đơn → **Gọi món**. Phải sang thẳng tab **Đơn gọi**, lượt mới ở trên cùng với nhãn vàng **Chờ xác nhận**,
tổng tạm tính cộng đúng.

**B8. Thu ngân duyệt.** Ở POS (`/admin/pos`, tài khoản chủ quán) duyệt lượt vừa gọi. Trong vài giây, không tải lại trang, nhãn ở Mini App phải đổi sang xanh **Đã vào bếp**.
(Bài này kiểm luôn kết nối realtime sau khi đổi thư viện.)

**B9. Gọi nhân viên.** Bấm **Gọi nhân viên** (viên thuốc nền sáng, chữ ô-liu) → báo đã gọi. Bấm lại ngay → báo phải chờ (chặn 3 phút).

**B10. Bàn có khách khác.** Mở lối tại bàn của một bàn đang có phiên bằng trình duyệt khác (hoặc cửa sổ ẩn danh): băng vàng "Bàn này đang có khách gọi món", vẫn xem được menu, bấm **+** bị chặn.

## Nhóm C — Nút gọi thêm bia / rượu

Danh mục "Bia & đồ uống (mẫu)" của Yên Garden đã được tick **Gợi ý gọi thêm nhanh**.

**C1. Chưa gọi thì không có nút.** Mở bàn chưa gọi đồ uống nào (Bàn mẫu 2 lúc đầu): **không** có dải nào phía trên thanh tab.

**C2. Hiện đúng loại và cỡ.** Gọi "Bia hơi Hà Nội" cỡ **Ca 1 lít**, gửi đơn, quay lại tab Thực đơn. Phía trên thanh tab phải có một hàng:
biểu tượng cốc bia · **Bia hơi Hà Nội** · "Ca 1 lít · 60.000đ" · nút **+ Thêm 1**. Chỉ **một** món, không phải danh sách.

**C3. Bấm là thêm.** Bấm **+ Thêm 1**: không mở bảng chọn cỡ; nút đổi thành **− 1 +**; thanh giỏ hiện "1 món / 60.000đ".
Bấm **+** lần nữa → 2, tổng 120.000đ. Bấm **−** về 0 → nút về **+ Thêm 1**, thanh giỏ ẩn.
Vào giỏ gửi đơn: lượt mới trong Đơn gọi ghi đúng "Bia hơi Hà Nội (Ca 1 lít)".

**C4. Đổi loại thì nút đổi theo.** Gọi tiếp "Tiger Crystal lon" (một lượt mới), gửi đơn. Quay lại Thực đơn: hàng gọi thêm giờ là **Tiger Crystal lon · 25.000đ**.

**C5. Chủ quán bật / tắt.** `/admin/menu` → sửa danh mục "Bia & đồ uống (mẫu)" → bỏ tick **Gợi ý gọi thêm nhanh** → Lưu. Tải lại Mini App: hàng gọi thêm biến mất.
Tick lại → hiện lại. Sửa một danh mục khác (đổi tên) rồi lưu: ô tick của danh mục đó giữ nguyên trạng thái cũ.

**C6. Món tắt bán.** Ở admin bật **Tạm hết** cho món đang được gợi ý → tải lại Mini App: hàng gọi thêm không còn gợi ý món đó.

**C7. Quán khác không bị ảnh hưởng.** Bảo Lương chưa tick danh mục nào → không bao giờ có hàng gọi thêm.

## Nhóm D — Lối vào thường

**D1. Trang chủ.** `?store=yen-garden`: banner biển hiệu, địa chỉ + **Chỉ đường**, "Mở cả ngày" + nhãn xanh **Đang mở**, nút **Đặt bàn trước** dạng viên thuốc ô-liu,
khung "Quý khách đang ngồi tại quán?", bên dưới là thực đơn tham khảo (không có nút **+**). Hai tab đáy: Trang chủ · Đặt bàn.

**D2. Đặt bàn.** Tab Đặt bàn → điền tên, số điện thoại, chọn ngày giờ, số khách → **Xác nhận đặt bàn**. Phải ra thẻ lịch hẹn.
(Lượt này hiện ở `/admin/reservations` của Yên Garden — xoá / huỷ sau khi test.)

**D3. Đặt món trước.** Từ thẻ lịch hẹn → chọn món đặt trước: danh sách món cũng là bố cục một cột của theme mới; chọn 1–2 món → xác nhận.

**D4. Tài khoản và Thông tin nhà hàng.** Bấm biểu tượng người → trang Tài khoản; bấm logo → Thông tin nhà hàng. Nền kem, thẻ phẳng, chữ đọc rõ.

## Nhóm E — Tốc độ

**E1. Bundle.** Trong `mini-app/` chạy `npm run measure`. Dòng cuối phải gần với:
`TẢI ĐẦU JS: 530 kB thô, 166 kB gzip`. Mốc trước khi tối ưu: 786 kB thô, 239 kB gzip.

**E2. Số request lúc mở.** F12 → Network → lọc `supabase` → tải lại lối tại bàn. Trước khi menu hiện chỉ có **2** request chạy cùng lúc:
`rpc/get_mini_app_bootstrap` và `menu_categories?…`. Sau đó mới tới `get_table_session_state` / `get_table_session_bill`.
(Bản cũ: `stores`, `tables` trước, xong mới `get_public_store_workflow`, `get_active_menu_discounts`, `menu_categories`.)

**E3. Ảnh tải theo vùng nhìn thấy.** Vẫn ở Network, lọc `Img`: lúc mới mở chỉ tải ảnh của các món đang thấy; cuộn xuống mới tải thêm.

**E4. Ảnh món mới nhẹ hơn.** `/admin/menu` → thêm một món có ảnh. File lưu lên Storage phải là `.webp`, cạnh 600px (trước là `.jpg` 800px).

## Chưa kiểm được ngoài Zalo thật

Yên Garden chưa có Zalo App ID nên mọi thứ trên mới chạy trong trình duyệt. Cần kiểm lại sau `zmp deploy`:

- Lấy mã người dùng Zalo, nút tim quan tâm OA, lấy số điện thoại từ Zalo, mở Chỉ đường / gọi điện.
- Vùng tai thỏ và nút "··· ✕" của Zalo đè lên thanh trên; thanh tab đáy với vạch home của iPhone.
- Bảng trượt chọn món và bàn phím ảo trên máy thật.
- Bản build của `zmp deploy` (em chỉ build bằng cấu hình dev để đo; chưa chạy `zmp build`).
- Tốc độ thật trên 4G.

## Dữ liệu mẫu ở quán Yên Garden — xoá khi có dữ liệu thật

- Bàn: **Bàn mẫu 1**, **Bàn mẫu 2** (chưa thuộc khu nào).
- Danh mục: **Nướng (mẫu)**, **Bia & đồ uống (mẫu)**, **Lẩu (mẫu)** với 9 món; ảnh món trỏ thẳng sang Unsplash.
- Topping: 5 dòng có chữ **(mẫu)**.
- Đơn thử: 2 lượt ở Bàn mẫu 1 (phiên bàn đang mở, tổng 205.000đ), cộng các lượt anh gọi khi test.

Cách dọn: thu tiền các bàn mẫu ở POS để đóng phiên → `/admin/tables` đóng 2 bàn mẫu → `/admin/menu` xoá món rồi xoá 3 danh mục mẫu và 5 topping mẫu.
Muốn xoá sạch cả đơn thử khỏi báo cáo thì nhắn em dọn bằng SQL.

## Việc chờ anh

- Zalo App ID của Yên Garden (điền vào `.env` của worktree quán và trang `/mevo`), rồi `zmp login` + `zmp deploy`.
- Tài khoản chủ quán, menu thật (khoảng 15/11), sơ đồ bàn và tên 3 khu.
- Quyết định có nén lại ảnh món của Bảo Lương không (mỗi ảnh đang 270–330 kB).
