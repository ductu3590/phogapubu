# UI-5 — Mini App khách theo design system mới

Nhánh `feat/ui-system` (sau UI-4 PASS). Sửa ở **tầng 1 — code lõi** `mini-app/src/` (áp cho mọi quán sau khi
mỗi worktree quán `git merge`). Không đổi API, RPC, database, logic đặt món / thanh toán.

## Đã đổi

| Chỗ | Sau UI-5 |
|---|---|
| Font | Roboto → **Be Vietnam Pro** (Roboto làm dự phòng khi mạng chậm) |
| Màu chính | Vẫn lấy `stores.primary_color` lúc chạy. Thêm `--color-primary-rgb` (`utils/theme-color.ts`) để các nền nhạt theo màu quán (`bg-primary/10`) hiện được — trước đây ra rỗng |
| Mã màu viết cứng | 184 chỗ: các mã đỏ/nâu của Bảo Lương (`#C0341A`, `#9A4634`…) đổi sang màu chính **theo quán** — trước đây quán khác cũng bị tô đỏ Bảo Lương |
| Xám / trạng thái | Họ xám slate + 5 tông trạng thái giống admin (xanh lá / xanh dương / vàng / đỏ / xám) |
| Banner bàn đang có khách · bàn đặt trước · ngoài giờ / tạm nghỉ | Vàng cảnh báo (trước dùng màu chính của quán làm màu cảnh báo) |
| Emoji | 54 chỗ → 0. Thay bằng icon cùng bộ lucide với admin (`components/common/icons.tsx`, sinh bằng `scripts/gen-mini-app-icons.cjs`, không thêm thư viện) |
| Chữ nhỏ | Nhỏ nhất 12px (trước 10–11px); line-height chữ nhỏ 100% → 140% để dấu tiếng Việt chồng không dính dòng |
| Nút − / + số lượng | 28px → 36px, có nhãn cho trình đọc màn hình |
| Lỗi tải menu | Thêm nút **Thử lại** (gọi lại đúng truy vấn menu) |

## Cách test

**Trên Zalo (bắt buộc trước khi phát hành):** cần commit nhánh, merge vào worktree quán rồi `zmp deploy` — em sẽ
làm cùng anh khi anh đồng ý (bước deploy anh chọn **Development** để tự test trước, không phát hành).

## Test A — Bảo Lương (màu đỏ `#C0341A`)

1. Mở Mini App ngoài QR (gốc): tiêu đề quán, banner "Ngoài giờ phục vụ" (nếu ngoài 08:00–23:00) **nền vàng**,
   tab danh mục đang chọn đỏ theo quán, giá đỏ, ảnh món trống hiện icon dao nĩa xám (không emoji).
2. Quét QR một bàn: dưới tên quán có "Bàn N"; thêm món → thanh "N món đã chọn · tổng" đỏ ở đáy; số trên tab Đơn hàng.
3. Xác nhận đơn: dòng "Đang ngồi tại · Bàn N" có icon ghế; nút − / + to hơn, bấm dễ; tổng cộng; Gọi món chạy như cũ.
4. Bàn đang có khách khác giữ: banner **vàng** có icon ổ khoá + nút "Gọi nhân viên" (icon chuông).
5. Tab **Nhà hàng**: icon địa chỉ / điện thoại / wifi / điều khoản / Zalo OA; nút Sao chép wifi nền đỏ nhạt theo quán.
6. Tab **Đơn hàng** khi chưa quét QR: icon khung quét + "Quét QR tại bàn trước".
7. Chữ có dấu chồng (Ể, Ỗ, Ữ) ở các dòng nhỏ không dính dòng trên.

## Test B — Pubu (màu khác, trả trước)

8. Mở Mini App Pubu: mọi chỗ trước đây đỏ cứng giờ theo **màu của Pubu** (không còn đỏ Bảo Lương).
9. Thanh toán: hai lựa chọn có icon thẻ / tiền (không emoji), lựa chọn đang chọn viền + nền nhạt theo màu quán.
10. Trạng thái đơn: icon đồng hồ cát → dấu tích → mũ đầu bếp → … (không emoji), màu theo trạng thái.
11. Vòng quay (nếu bật): tiêu đề có icon quà, kết quả không còn emoji.

## Test C — Lỗi / rỗng

12. Tắt mạng rồi mở menu: "Không thể tải menu" + nút **Thử lại**; bật mạng, bấm Thử lại → menu hiện.

**→ Báo:** `UI-5 PASS` hoặc số bài FAIL kèm ảnh.
