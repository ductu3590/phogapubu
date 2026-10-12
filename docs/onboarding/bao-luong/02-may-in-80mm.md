# 02 — Máy in bill 80mm

Quán dùng **một máy in nhiệt 80mm** ở quầy. MEVO in 3 loại giấy từ cùng máy này:

| Giấy | Khi nào ra | Có giá? | Dùng để |
|---|---|---|---|
| **Phiếu bếp** | Thu ngân bấm *Duyệt & in bếp* | Không | Đưa cho bếp làm món |
| **Phiếu bàn** | Cùng lúc, ngay sau phiếu bếp | Có (+ ô ☐) | Nhân viên cầm bưng món, gạch ☐ từng món đã ra |
| **Hoá đơn / tạm tính** | Khi khách xin tính tiền, và khi thu tiền | Có | Đưa khách |

## Bước 1 — Kết nối máy in

1. Cắm nguồn + cáp **USB** vào PC quầy (hoặc nối LAN nếu máy có cổng mạng).
2. Cài driver do hãng máy in cung cấp (thường là bản "POS-80" / "Generic / Text Only" cũng được, nhưng **driver hãng in sắc nét hơn**).
3. Nạp cuộn giấy nhiệt **khổ 80mm**, mặt nhiệt hướng ra ngoài.
4. In thử trang test của Windows: `Settings → Bluetooth & devices → Printers → máy in → Printer properties → Print Test Page`.

## Bước 2 — Cấu hình khổ giấy

Trong Windows (`Printing preferences`):
- Khổ giấy: **80mm × tự động chiều dài** (nếu hãng cho "Roll Paper 80mm").
- Lề: nhỏ nhất.
- Tắt "tự cắt sau mỗi trang" **chỉ** nếu máy cắt làm đứt giữa phiếu; ngược lại để bật để mỗi phiếu tách rời.

## Bước 3 — Đặt làm máy in mặc định

`Settings → Printers → bỏ chọn "Let Windows manage my default printer" → chọn máy in bill → Set as default`.

> Đây là điều kiện để lối tắt `--kiosk-printing` in **thẳng** không hỏi. Không đặt mặc định thì phiếu sẽ ra nhầm máy khác hoặc không ra.

## Bước 4 — In thử bằng MEVO (không tạo đơn giả)

1. Đăng nhập **chủ quán** → `⚙ Cài đặt → In ấn` → nút **In thử**.
2. Ra tờ **"PHIẾU IN THỬ"** có tên quán, địa chỉ, SĐT, 2 món mẫu, chân phiếu "Không phải hoá đơn — không tạo đơn".
3. Kiểm:
   - [ ] Chữ rõ, **không tràn lề**, không cắt chữ.
   - [ ] Địa chỉ và số điện thoại quán **đúng** (sai thì sửa ở `Cài đặt → Cửa hàng` rồi in lại).
   - [ ] Giờ "In lúc" đúng giờ Việt Nam.

## Bước 5 — In thử vòng đơn thật

Đặt hộ một món cho Bàn 1 từ điện thoại nhân viên → POS → **Duyệt & in bếp** → phải ra **đúng 2 tờ** (phiếu bếp rồi phiếu bàn) **đúng một lần**.

## Cách mỗi lần in hoạt động (để dạy thu ngân)

- Bấm **Duyệt & in bếp** / **In tạm tính** → MEVO in **ngầm ngay trong trang POS**, không mở tab hay cửa sổ mới. POS giữ nguyên.
- Một lệnh ra **2 trang liên tiếp**: phiếu bếp rồi phiếu bàn. Có dao cắt tự động (driver bật "cắt sau mỗi trang") thì ra 2 tờ rời; không có thì xé ở chỗ ngắt.
- Mở POS bằng lối tắt `cai-pos-bao-luong.bat` (có `--kiosk-printing`): in thẳng, không hỏi. Mở Chrome thường: hiện hộp thoại in, bấm **In**.

## Sự cố

| Triệu chứng | Làm gì |
|---|---|
| Không ra giấy | Kiểm đèn nguồn, cáp, **hết giấy**, nắp máy đóng chưa. Rồi mới thử lại |
| Ra giấy trắng | Cuộn giấy lắp ngược mặt nhiệt |
| Chữ nhạt | Giấy kém / đầu in bẩn; lau nhẹ đầu in bằng cồn |
| Ra 2 tờ phiếu bếp liên tiếp | Bấm nhầm 2 lần. Báo bếp **chỉ làm một**. Lần sau nhìn giấy ra rồi mới bấm lại |
| Nghi đã in nhưng không thấy giấy | **Đừng bấm in lại ngay.** Kiểm giấy, máy in, rồi hỏi bếp có nhận chưa |
| Máy in hỏng giữa ca | Ghi tay món từ thẻ trên POS, đọc cho bếp. POS vẫn dùng bình thường |

## Mua dự phòng

1 cuộn giấy thay 2–3 cuộn dự phòng ở quầy. Cuộn khổ **80mm**, không phải 57mm. Một ca tối đông khách có thể dùng hơn một cuộn.
