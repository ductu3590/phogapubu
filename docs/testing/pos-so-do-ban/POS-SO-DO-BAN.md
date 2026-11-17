# POS tab "Sơ đồ" — checklist test

Spec: [2026-11-17-pos-so-do-ban-design.md](../../superpowers/specs/2026-11-17-pos-so-do-ban-design.md) (bố cục A). Trạng thái: **Chờ test**.

Tab giữa của POS giờ tên **Sơ đồ** (Timeline · Sơ đồ · Danh sách): lưới ô bàn liền nhau, một dòng công cụ (lọc khu / trạng thái / tìm), chấm màu theo khu, ô 76px. Chưa chọn bàn thì cột phải ẩn, lưới rộng hết; "Việc cần xử lý" mở thành ngăn kéo. Nút "Đặt làm mặc định máy này" ghim màn mở sẵn theo từng máy.

## Đã tự động (Playwright) — anh không cần làm lại

Lệnh chạy lại: `npm --prefix admin-web run e2e` (cần `admin-web/.env.local`; bật dev server của worktree trước, nếu không phải cổng 3000 thì đặt `E2E_BASE_URL`). Bộ test tạm thêm khu "Khu E2E" + 18 bàn E2E-01..18 vào Bảo Lương rồi xoá, mở/đóng vài phiên trên bàn trống thật — **chỉ chạy khi không ai dùng Bảo Lương**.

Kết quả lần cuối (2026-11-17, Bảo Lương, sau đợt sửa cuối): **32/32 PASS** — desktop-1366 21/21, desktop-1920 5/5, tablet-1024 1/1, phone 5/5; không lỗi console; DB dọn sạch (đã kiểm theo id ghi lại). Lần trước đó 31/31 × 2 lượt.

Số đo: 1366×768 chưa chọn bàn → lưới 1250×458px, 11 cột, thấy đủ 43/43 ô; 1366 có bill mở → 850×298–346px (tuỳ hàng nút trên cùng có xuống dòng không), 7 cột, 21–28/43 ô; 1920×1080 → 43/43 cả hai trạng thái.

| Nhóm | Kịch bản |
|---|---|
| A. Màn mặc định | Tab giữa tên "Sơ đồ", máy chưa ghim mở Timeline |
| | Bấm Sơ đồ rồi tải lại → về Timeline (đổi tab chỉ tạm) |
| | Ghim Sơ đồ → toast, nút thành "Mặc định máy này", tải lại / context mới cùng storage vào Sơ đồ |
| | Tab Danh sách không có nút ghim |
| B. Lưới + lọc | 1366×768 và 1920×1080: thấy đủ 43 ô, không cần cuộn |
| | Phone 375: lưới 3 cột, không cuộn ngang |
| | Tất cả khu: lưới liền không tiêu đề khu; chọn "Khu E2E (18)" → 18 ô |
| | Lọc khu → đúng số ô, nút khu hiện đúng số |
| | Lọc trạng thái: số trên nút khớp số ô |
| | Tìm không dấu / theo mã bàn; không khớp → "Không có bàn nào khớp bộ lọc." |
| C + D. Ô bàn + bấm ô | Bấm bàn trống → bảng bàn: nhãn Trống, "Gọi món & mở bàn", "Đặt bàn cho bàn này" |
| | Gọi món & mở bàn → chọn món → gửi → bill mở ở cột phải; ô hiện tiền + "0'" |
| | Bấm 2 bàn trống → "Ghép thành một mâm" |
| | Máy tính bảng 1024×768 (dưới xl): bấm 2 bàn trống thật → "Đã chọn 2 bàn trống" + "Ghép thành một mâm" (không bấm); "Bỏ chọn" đóng bảng |
| | Bấm bàn trống khi đang mở bill → cột phải chuyển sang bảng bàn trống |
| | Đặt bàn cho bàn này → ô hiện "Đặt HH:mm" → bấm ô mở chi tiết đặt bàn có "Nhận khách" |
| | Ctrl+bấm hai ô có khách → bill gộp 2 mâm |
| | Ô vừa chờ duyệt vừa gọi NV (seed qua RPC Mini App): "Chờ duyệt · N" đủ chữ + viền vàng + chuông đỏ cạnh tên ("Đang gọi nhân viên"), KHÔNG có chữ "Gọi NV" |
| E. Đặt bàn + Sắp xếp | Ở Timeline duyệt đặt bàn cần xếp bàn → tự sang Sơ đồ → chọn bàn → xác nhận → về Timeline |
| | Lọc Khu E2E rồi Sắp xếp bàn → mở đúng khu; Huỷ → về lưới, giữ bộ lọc |
| F. Không thụt lùi | 1366 chưa chọn gì: không cột phải; "Việc cần xử lý" mở ngăn kéo phủ; Timeline vẫn có cột |
| | Timeline và Danh sách vẫn vẽ, không lỗi console |
| | Cỡ 1024: bấm bàn → bill dạng sheet có nút đóng |

## Anh Tú test tay — chỉ phần máy không kiểm được

Ghi PASS / FAIL vào cột Kết quả. FAIL thì chép nguyên văn lỗi + chụp ảnh.

### T1. Nhìn & đọc (laptop 1366 thật)

| # | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| 1.1 | Laptop 1366 + Chrome thật (thanh địa chỉ, tab ăn ~110px chiều cao). Vào POS, bấm Sơ đồ, chưa chọn bàn | Vẫn thấy ĐỦ mọi bàn, không phải cuộn; cột phải không chiếm chỗ | |
| 1.2 | Đứng cách màn khoảng 1m như ở quầy | Đọc được tên bàn, tiền, giờ ngồi trên ô | |
| 1.3 | Nhìn lướt các ô Trống / Có khách / Chờ duyệt / Đặt sắp tới | Phân biệt được bằng màu, không nhầm | |
| 1.4 | Nhìn tên bàn dài, số tiền lớn (vd 1.250.000đ) | Không chữ nào bị cắt hoặc đè nhau | |

### T2. Màn cảm ứng / máy tính bảng thật

| # | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| 2.1 | Chạm một ô bàn | Mở đúng bàn, không phải chạm hai lần | |
| 2.2 | Chạm các nút lọc khu / trạng thái | Chạm trúng nút, không trượt sang nút bên cạnh | |
| 2.3 | Kéo cuộn lưới (khi nhiều bàn hoặc màn nhỏ) | Cuộn mượt, không giật, không kích hoạt nhầm ô | |
| 2.4 | Mở bill bằng chạm (dạng sheet trên màn nhỏ), thao tác, đóng | Dùng được bằng ngón tay: nút đủ to, đóng được | |
| 2.5 | Có ≥2 bàn có khách. Chạm nút **"Gộp bill"** (máy cảm ứng không có Ctrl) → chạm 2 ô có khách | Thanh "Gộp bill: … đã chọn 2"; 2 ô có viền cam; bill "Gộp bill 2 mâm". Chạm "Thoát gộp bill" để về | |
| 2.6 | Máy tính bảng thật: chạm 1 bàn trống → sheet bàn trống hiện ở đáy, lưới phía trên vẫn chạm được → chạm thêm 1 bàn trống | Bảng đổi thành "Đã chọn 2 bàn trống" + "Ghép thành một mâm" (tự động đã kiểm ở 1024 trên Chrome; đây là kiểm bằng ngón tay) | |

### T3. Hai máy

| # | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| 3.1 | Máy A: vào Sơ đồ, bấm "Đặt làm mặc định máy này" | Có toast "Máy này sẽ mở POS bằng Sơ đồ" | |
| 3.2 | Máy B (khác máy, cùng tài khoản hoặc khác): mở POS | Máy B vẫn mở Timeline | |
| 3.3 | Máy A: tải lại POS | Vào thẳng Sơ đồ | |
| 3.4 | Máy A (đã ghim Sơ đồ), màn ≥1280px: tải lại POS vài lần, nhìn kỹ lúc trang hiện | KHÔNG chớp Timeline rồi mới sang Sơ đồ, KHÔNG chớp cột "Việc cần xử lý" bên phải | |

### T4. Khách thật trên điện thoại

| # | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| 4.1 | Điện thoại, quét QR bàn thật bằng Zalo, gọi một món | Ô bàn đó nháy "Chờ duyệt" **và chuông kêu** ở POS (Playwright không kiểm được tiếng) | |
| 4.2 | Trong Mini App bấm "Gọi nhân viên" (đơn ở 4.1 CHƯA duyệt) | Ô bàn hiện **chuông đỏ nhỏ cạnh tên bàn** (chưa có chữ "Gọi NV" vì nhãn "Chờ duyệt · N" cần chỗ); chuông kêu nếu có | |
| 4.3 | Duyệt đơn ở POS (chưa xử lý yêu cầu gọi NV) | Ô chuyển sang Có khách, hết nháy; lúc này ô hiện nhãn đỏ **"Gọi NV"** | |

### T5. In

| # | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| 5.1 | Bấm bàn trống → "Gọi món & mở bàn" → chọn món → gửi | Phiếu in ra đúng như luồng Khách lẻ cũ (cùng mẫu, cùng máy in) | |

### T6. Bảng bàn trống, Sắp xếp bàn, nợ phiên hết hạn

| # | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| 6.1 | Tạo đặt bàn cho một bàn trống, giờ đến muộn hơn trong ngày (vd 3 tiếng nữa, ngoài khung giữ bàn 60'). Ở Sơ đồ bấm bàn đó | Bảng bàn trống có dòng vàng **"Có khách đặt HH:mm"** đúng giờ đã đặt; vẫn bấm "Gọi món & mở bàn" được | |
| 6.2 | (Chủ quán) Sơ đồ → "Sắp xếp bàn" → kéo một bàn sang chỗ khác → **"Lưu sơ đồ"** | Quay về lưới; thứ tự ô theo vị trí mới (trái→phải, trên→dưới); tải lại vẫn giữ | |
| 6.3 | Khi quán có **bàn hết hạn còn tiền chưa thu** (phiên tự đóng vì để quá lâu mà món chưa thu tiền) — mở Sơ đồ | Trên lưới có **dải đỏ** "N bàn hết hạn còn tiền chưa thu · tổng tiền" + nút "Xem & thu"; bấm nút mở ngăn kéo Việc cần xử lý có khối "Bàn hết hạn còn tiền chưa thu"; bấm một bàn → bill → thu được | |
| 6.4 | Không có bàn hết hạn còn nợ | Không có dải đỏ, lưới không bị đẩy xuống | |

Ghi chú 6.3: Playwright không tự dựng được — phải ép một phiên thật trên prod sang trạng thái hết hạn còn nợ, rồi dọn
bằng cách thu / huỷ tiền qua RPC tiền; làm hỏng giữa chừng là để lại nợ giả trong báo cáo Bảo Lương. Lô-gic hiện/ẩn dải
đỏ đã có test đơn vị (`expired-debt-bar.test.tsx`).

### T7. Cảm nhận

| # | Câu hỏi | Ghi chú của anh |
|---|---|---|
| 7.1 | So với Timeline, quán đông bàn dùng Sơ đồ có nhanh hơn không? | |
| 7.2 | Điều gì muốn chỉnh (cỡ ô, thông tin trên ô, vị trí nút, màu)? | |

Xong thì báo: "PASS" hoặc danh sách bài FAIL.
