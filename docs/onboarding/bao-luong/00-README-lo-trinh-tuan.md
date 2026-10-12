# Hồ sơ triển khai MEVO — Bia lẩu Bảo Lương

> Dành cho anh Tú cầm đi làm việc với quán. Mỗi file là một việc, làm theo thứ tự số.

## Bộ hồ sơ

| File | Việc | Ai làm |
|---|---|---|
| `01-cai-dat-may-pos.md` | Cài máy tính quầy thu ngân thành máy POS | Anh Tú + thu ngân |
| `02-may-in-80mm.md` | Cài và thử máy in bill 80mm | Anh Tú |
| `03-dien-thoai-nhan-vien.md` | Đưa MEVO lên điện thoại nhân viên | Anh Tú + từng nhân viên |
| `04-qr-ban.md` | In và dán QR lên 20 bàn | Anh Tú + quán |
| `05-quy-trinh-van-hanh.md` | Quy trình làm việc hằng ngày (đọc cho quán nghe) | Cả quán |
| `06-chay-thu-va-go-live.md` | Kịch bản chạy thử, ngày đầu, xử lý sự cố | Anh Tú |
| `07-the-tay-nhan-vien.md` | Tờ A5 in ra, dán ở quầy / phát cho nhân viên | In ra |
| `scripts/cai-pos-bao-luong.bat` | Tạo lối tắt mở POS 1 chạm trên máy quầy | Chạy trên máy quầy |

## Hiện trạng thật (tính đến 12/10/2026)

| Thứ | Trạng thái |
|---|---|
| Quán trong hệ thống | Đã có: `Bia lẩu Bảo Lương`, slug `bia-lau-bao-luong`, 20 bàn, chế độ **Trả sau** |
| Mô hình bếp | **Thu ngân xác nhận rồi in 2 phiếu** — không dùng màn hình bếp |
| Thanh toán | Thu tại quầy (tiền mặt / chuyển khoản bằng QR loa sẵn có). **Không** dùng ZaloPay merchant, **không** cần OA |
| Mini App | Đang chờ Zalo duyệt Publish. Chưa duyệt xong thì **khách ngoài chưa quét được** |
| Menu | Đã nhập 9 danh mục / 65 món (ngày 01/09) — **cần quán rà lại giá, món hết, ảnh trước ngày chạy** |
| Mã vòng quay / voucher | Mặc định **tắt**. Tuần này không dùng |

## Việc phải xong TRƯỚC khi bắt đầu (anh Tú kiểm)

- [ ] Có link vào trang quản lý (Vercel) cho quán. Ghi vào ô này: `https://mevo.vn` (domain chính thức, đã cấu hình trên Vercel).
- [ ] Tài khoản đã tạo: chủ quán, **thu ngân**, **nhân viên phục vụ** (từng người một email riêng) — vào `Cài đặt → Thêm → Nhân viên`.
- [ ] Giờ phục vụ trong Cài đặt đúng thực tế (đang là 08:00–23:00).
- [ ] Quán biết **PC quầy dùng Chrome hay Edge**, và **máy in hiệu gì, có cổng USB hay LAN** (xem `02`).
- [ ] Hỏi Zalo xem Publish đã duyệt chưa. Khi duyệt xong: bước "QR chính thức" ở `04`.

## Lộ trình 5 ngày (đề xuất)

| Ngày | Việc | Kết quả cuối ngày |
|---|---|---|
| **Ngày 1 (ở nhà)** | Chuẩn bị: tạo tài khoản, rà menu, in thử `PHIẾU IN THỬ`, in thử QR 1 bàn | Mọi tài khoản đăng nhập được; menu đúng |
| **Ngày 2 (tại quán)** | Cài máy POS + máy in (`01`, `02`), cài điện thoại nhân viên (`03`) | POS in được phiếu thử; mỗi nhân viên vào được `/staff` |
| **Ngày 3 (tại quán, giờ vắng)** | Đào tạo (`05`) + chạy thử cả quy trình (`06`, phần kịch bản) | Cả quán làm được vòng: gọi → duyệt/in → bưng → thu tiền |
| **Ngày 4** | Chạy thật nhẹ: một vài bàn, anh Tú đứng cạnh | Không sự cố nặng; ghi lại góp ý |
| **Ngày 5+** | In QR chính thức, dán 20 bàn, mở cho khách quét | Go-live (khi Zalo duyệt Publish) |

> Nếu Zalo chưa duyệt kịp: ngày 1–4 vẫn chạy được bằng **nhân viên đặt hộ** (`/staff/order`),
> khách chưa tự quét QR. Quán không mất gì — đây cũng là cách an toàn để tập quen trước.

## Nguyên tắc

1. **Thu ngân là cửa duy nhất** quyết định đơn nào vào bếp. Chưa bấm xác nhận = bếp chưa nhận.
2. Không chắc đơn đã in chưa → **nhìn giấy trước, đừng in lại ngay** (tránh bếp làm trùng).
3. Có việc gì lạ → ghi tay + gọi anh Tú, đừng cố sửa dữ liệu.
