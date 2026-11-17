# POS tab "Sơ đồ" — checklist test

Spec: [2026-11-17-pos-so-do-ban-design.md](../../superpowers/specs/2026-11-17-pos-so-do-ban-design.md) (bố cục B, màn quầy 1920×1080). Trạng thái: **PASS hết 2026-11-17** (T1–T8).

Tab giữa của POS tên **Sơ đồ** (Timeline · Sơ đồ · Danh sách). Bố cục B cho màn quầy 1920×1080: ô **To** 156×120 có **dải tên khu** ở đỉnh ô (không còn chấm màu khu), **cột phải luôn hiện** (Việc cần xử lý / bill), **bấm bàn trống ra thẳng hộp "Tên bàn · Gọi món"** (không còn bảng 1 bàn trống), và chế độ **"Ghép bàn trống"** để ghép nhiều bàn trống thành một mâm. Nút "Sắp xếp bàn" nằm ở thanh trên cạnh "Ghép bàn trống". Nút ngôi sao (chỉ icon, chữ ở tooltip) ghim màn mở sẵn theo từng máy.

## Đã tự động (Playwright) — anh không cần làm lại

Lệnh chạy lại: `npm --prefix admin-web run e2e` (cần `admin-web/.env.local`; bật dev server của worktree trước, nếu không phải cổng 3000 thì đặt `E2E_BASE_URL`). Bộ test tạm thêm khu "Khu E2E" + 18 bàn E2E-01..18 vào Bảo Lương rồi xoá, mở/đóng vài phiên trên bàn trống thật — **chỉ chạy khi không ai dùng Bảo Lương**.

Kết quả lần cuối (2026-11-17, Bảo Lương, bố cục B, ô 120px): **34/34 PASS** — desktop-1366 21/21, desktop-1920 7/7, tablet-1024 1/1, phone 5/5; không lỗi console; DB dọn sạch (kiểm theo id ghi lại: không còn "Khu E2E", bàn E2E-xx, phiên mở, đặt bàn "E2E ", yêu cầu gọi NV chưa xử lý).

Số đo ở 1920×1080 (có cột phải 400px): lưới 1404×810px, **8 cột**, 43 ô = 6 hàng, **43/43 ô thấy trọn không cần cuộn** cả khi chưa chọn bàn lẫn khi mở bill. Ô cao 120px (mockup 128px hụt ~32px nên hạ 8px; 4 dòng chữ vẫn vừa). Hàng lọc (tab + chọn khu + 5 chip + tìm) nằm trọn một dòng sau khi "Sắp xếp bàn" chuyển lên thanh trên.

| Nhóm | Kịch bản |
|---|---|
| A. Màn mặc định | Tab giữa tên "Sơ đồ", máy chưa ghim mở Timeline |
| | Bấm Sơ đồ rồi tải lại → về Timeline (đổi tab chỉ tạm) |
| | Ghim Sơ đồ → toast, nút thành "Mặc định máy này", tải lại / context mới cùng storage vào Sơ đồ |
| | Tab Danh sách không có nút ghim |
| B. Lưới + lọc | 1920×1080: cột phải "Việc cần xử lý" hiện sẵn, thấy đủ 43/43 ô không cuộn (8 cột), cả khi mở bill |
| | 1920×1080: tab + chọn khu + chip lọc + tìm cùng một hàng; "Sắp xếp bàn" ở thanh trên |
| | Phone 375: trang không cuộn ngang |
| | Tất cả khu: lưới liền không tiêu đề khu; mỗi ô có dải tên khu cao 22px, không nền màu, có chấm màu khu (title = tên khu), không còn chấm 7px; ô "Khu E2E" liền nhau; chọn "Khu E2E (18)" → 18 ô |
| | Lọc khu → đúng số ô, nút khu hiện đúng số |
| | Lọc trạng thái: số trên nút khớp số ô |
| | Tìm không dấu / theo mã bàn; không khớp → "Không có bàn nào khớp bộ lọc." |
| C + D. Ô bàn + bấm ô | Bấm bàn trống → hộp "<bàn> · Gọi món" mở ngay; không còn "Gọi món & mở bàn" / "Đặt bàn cho bàn này"; Escape đóng, bàn vẫn trống |
| | 1920: bấm bàn trống → chọn món → gửi → hộp đóng, bill mở ở cột phải; ô hiện tiền + "0'" |
| | Ghép bàn trống → bấm 2 bàn → "Ghép thành một mâm" bấm được (không bấm); bàn có khách bị khoá; "Thoát ghép bàn" → về Việc cần xử lý |
| | Ctrl+bấm bàn trống → vào Ghép bàn trống với bàn đó đã chọn; "Đóng ghép bàn" thoát |
| | Máy tính bảng 1024×768: Ghép bàn trống → bấm 2 bàn (bảng không nền mờ) → "Ghép thành một mâm" bấm được; Thoát |
| | Bấm bàn trống khi đang mở bill → hộp gọi món của bàn trống mở lên |
| | "Đặt bàn mới" chọn bàn → ô hiện "Đặt HH:mm" → bấm ô mở chi tiết đặt bàn có "Nhận khách" |
| | Bàn có đặt xa (now+3h): hộp gọi món có dòng vàng "Bàn này có khách đặt lúc HH:mm. Vẫn mở bàn được, nhớ báo khách." |
| | Ctrl+bấm hai ô có khách → bill gộp 2 mâm |
| | Ô vừa chờ duyệt vừa gọi NV (seed qua RPC Mini App): "Chờ duyệt · N" đủ chữ + viền vàng + chuông đỏ cạnh tên, KHÔNG có chữ "Gọi NV" |
| E. Đặt bàn + Sắp xếp | Ở Timeline duyệt đặt bàn cần xếp bàn → tự sang Sơ đồ → chọn bàn → xác nhận → về Timeline |
| | Lọc Khu E2E rồi Sắp xếp bàn (nút ở thanh trên) → mở đúng khu; Huỷ → về lưới, giữ bộ lọc |
| F. Không thụt lùi | 1366 ở Sơ đồ chưa chọn gì: cột phải "Việc cần xử lý" cố định (không phủ), nút ngăn kéo ẩn; Timeline vẫn có cột |
| | Timeline và Danh sách vẫn vẽ, không lỗi console |
| | Cỡ 1024: bấm bàn → bill dạng sheet có nút đóng |

## Anh Tú test tay — chỉ phần máy không kiểm được

Ghi PASS / FAIL vào cột Kết quả. FAIL thì chép nguyên văn lỗi + chụp ảnh.

### T1. Nhìn & đọc (màn quầy 1920×1080 thật)

| # | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| 1.1 | Màn quầy 1920×1080 (hoặc Chrome toàn màn hình). Vào POS, bấm Sơ đồ, chưa chọn bàn | Thấy mọi bàn của quán không cuộn (tới 48 bàn = 6 hàng × 8 cột); cột "Việc cần xử lý" hiện sẵn bên phải | |
| 1.2 | Đứng cách màn khoảng 1m như ở quầy | Đọc được tên bàn (18px), tiền, giờ ngồi trên ô | |
| 1.3 | Nhìn lướt: phân biệt khu bằng **dải tên khu** ở đỉnh ô (mỗi khu một màu) | Nhận ra khu của bàn không cần đọc kỹ; bàn chưa phân khu có dải xám | |
| 1.4 | Nhìn lướt các ô Trống / Có khách / Chờ duyệt / Đặt sắp tới | Phân biệt được bằng màu, không nhầm | |
| 1.5 | Nhìn tên bàn dài, tên khu dài, số tiền lớn (vd 1.250.000đ) | Không chữ nào bị cắt vô lý hoặc đè nhau (tên dài thì có "…") | |
| 1.6 | Máy ghim Sơ đồ, màn ≥1280px: tải lại POS vài lần, nhìn kỹ lúc trang hiện | KHÔNG chớp Timeline rồi mới sang Sơ đồ, KHÔNG chớp cột "Việc cần xử lý" bên phải | |

### T2. Màn quầy cảm ứng (nếu có)

| # | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| 2.1 | Chạm một ô bàn | Mở đúng bàn, không phải chạm hai lần | |
| 2.2 | Chạm các nút lọc khu / trạng thái | Chạm trúng nút, không trượt sang nút bên cạnh | |
| 2.3 | Có ≥2 bàn có khách. Chạm nút **"Gộp bill"** (không có Ctrl) → chạm 2 ô có khách | Thanh "Gộp bill: … đã chọn 2"; 2 ô có viền cam; bill "Gộp bill 2 mâm". Chạm "Thoát gộp bill" để về | |
| 2.4 | Có ≥2 bàn trống. Chạm nút **"Ghép bàn trống"** → chạm 2 bàn trống | Thanh "Đang ghép bàn trống … đã chọn 2"; cột phải "Ghép bàn trống thành một mâm" với nút "Ghép thành một mâm" bấm được; "Thoát ghép bàn" về Việc cần xử lý | |

### T4. Khách thật trên điện thoại (đã PASS 2026-11-17, bố cục A; phần không đổi)

| # | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| 4.1 | Điện thoại, quét QR bàn thật bằng Zalo, gọi một món | Ô bàn đó nháy "Chờ duyệt" **và chuông kêu** ở POS (Playwright không kiểm được tiếng) | PASS |
| 4.2 | Trong Mini App bấm "Gọi nhân viên" (đơn ở 4.1 CHƯA duyệt) | Ô bàn hiện **chuông đỏ nhỏ cạnh tên bàn** (chưa có chữ "Gọi NV" vì nhãn "Chờ duyệt · N" cần chỗ); chuông kêu nếu có | PASS |
| 4.3 | Duyệt đơn ở POS (chưa xử lý yêu cầu gọi NV) | Ô chuyển sang Có khách, hết nháy; lúc này ô hiện nhãn đỏ **"Gọi NV"** | PASS |

### T5. In

| # | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| 5.1 | Bấm một **bàn trống** → hộp "<bàn> · Gọi món" → chọn món → gửi | Phiếu in ra đúng như luồng Khách lẻ cũ (cùng mẫu, cùng máy in). (Bài cũ — bấm "Gọi món & mở bàn" — PASS 2026-11-17; đổi bước vào hộp nên cần xem lại đúng bước này) | |

### T6. Hộp gọi món bàn trống, Sắp xếp bàn, nợ phiên hết hạn

| # | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| 6.1 | Tạo đặt bàn cho một bàn trống, giờ đến muộn hơn trong ngày (vd 3 tiếng nữa, ngoài khung giữ bàn 60'). Ở Sơ đồ bấm bàn đó | Hộp "<bàn> · Gọi món" có dòng vàng **"Bàn này có khách đặt lúc HH:mm. Vẫn mở bàn được, nhớ báo khách."** đúng giờ đã đặt; vẫn gọi món / gửi được (e2e đã kiểm dòng chữ; cần xem bằng mắt màu vàng) | |
| 6.2 | (Chủ quán) Sơ đồ → "Sắp xếp bàn" (thanh trên) → kéo một bàn sang chỗ khác → **"Lưu sơ đồ"** | Quay về lưới; thứ tự ô theo vị trí mới (trái→phải, trên→dưới); tải lại vẫn giữ | PASS (không đổi) |
| 6.3 | Khi quán có **bàn hết hạn còn tiền chưa thu** — mở Sơ đồ | Trên lưới có **dải đỏ** "N bàn hết hạn còn tiền chưa thu · tổng tiền" + nút "Xem & thu"; bấm nút mở Việc cần xử lý có khối "Bàn hết hạn còn tiền chưa thu"; bấm một bàn → bill → thu được | PASS (không đổi) |
| 6.4 | Không có bàn hết hạn còn nợ | Không có dải đỏ, lưới không bị đẩy xuống | PASS (không đổi) |

Ghi chú 6.3: Playwright không tự dựng được — phải ép một phiên thật trên prod sang trạng thái hết hạn còn nợ, rồi dọn
bằng cách thu / huỷ tiền qua RPC tiền; làm hỏng giữa chừng là để lại nợ giả trong báo cáo Bảo Lương. Lô-gic hiện/ẩn dải
đỏ đã có test đơn vị (`expired-debt-bar.test.tsx`).

### T7. Cảm nhận

| # | Câu hỏi | Ghi chú của anh |
|---|---|---|
| 7.1 | So với Timeline, quán đông bàn dùng Sơ đồ có nhanh hơn không? | |
| 7.2 | Điều gì muốn chỉnh (cỡ ô, thông tin trên ô, vị trí nút, màu dải khu)? | |

### T8. Chỉnh sau PASS (2026-11-17)

| # | Làm gì | Mong đợi | Kết quả |
|---|---|---|---|
| 8.1 | Mở POS, nhìn thanh trên cạnh tên quán | Chỉ hiện ô đen **"Chủ quán"** (hoặc "Thu ngân"...), không còn email. Rê chuột lên ô đó mới thấy email | |
| 8.2 | Nhìn cạnh hàng tab Timeline · Sơ đồ · Danh sách | Chỉ còn **icon ngôi sao**, không có chữ "Mặc định máy này" / "Đặt làm mặc định máy này" ở mọi cỡ màn. Sao tô vàng = màn đang là mặc định; bấm sao rỗng vẫn ghim được, rê chuột thấy chữ | |
| 8.3 | Mở Sơ đồ ở quán có nhiều khu (Yên Garden) | Đỉnh mỗi ô chỉ còn **chấm màu nhỏ + tên khu chữ thường**, không còn dải nền tím/hồng in hoa. Màn nhìn nhẹ, các ô có khách (xanh) / chờ duyệt (vàng) / đặt trước (cam) nổi rõ; vẫn nhận ra khu qua màu chấm + tên | |

Đã bỏ nhóm T3 "Hai máy" (ghim mặc định máy đã có e2e; ý "tải lại không chớp" chuyển vào T1.6). Xong thì báo: "PASS" hoặc danh sách bài FAIL.
